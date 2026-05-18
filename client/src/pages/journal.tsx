import React, { useState, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import {
  BookOpen, Search, Plus, Printer, ChevronDown, ChevronRight, Pencil, Trash2, AlertTriangle, Loader2
} from "lucide-react";
import ThaiDateInput from "@/components/thai-date-input";
import { toLocalDateStr } from "@/lib/utils";

import { useDateSettings } from "@/hooks/use-date-settings";
import { useThemeColor } from "@/hooks/use-theme-color";
function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  if (n === 0) return "-";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const JOURNAL_BOOKS: Record<string, { num: string; label: string }> = {
  general: { num: "1", label: "สมุดรายวันทั่วไป" },
  receive: { num: "2", label: "สมุดรายวันรับเงิน" },
  payment: { num: "3", label: "สมุดรายวันจ่ายเงิน" },
  sales: { num: "4", label: "สมุดรายวันขาย" },
  purchase: { num: "5", label: "สมุดรายวันซื้อ" },
};

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: "ใบแจ้งหนี้",
  tax_invoice: "ใบกำกับภาษี",
  receipt: "ใบเสร็จรับเงิน",
  manual: "บันทึกเอง",
  expense: "ค่าใช้จ่าย",
  depreciation: "ค่าเสื่อมราคา",
  goods_receiving: "รับสินค้า",
  goods_requisition: "เบิกสินค้า",
  purchase_invoice: "ซื้อสินค้า",
};

const DOC_TYPE_LIST_ROUTES: Record<string, string> = {
  invoice: "/sales/invoice",
  tax_invoice: "/sales/tax-invoice",
  receipt: "/sales/receipt",
  expense: "/purchases/expense",
  purchase_invoice: "/purchases/invoice",
  quotation: "/sales/quote",
  sales_order: "/sales/order",
  credit_note: "/sales/credit-note",
  purchase_order: "/purchases/po",
  purchase_request: "/purchases/pr",
  debit_note: "/purchases/debit-note",
  payroll: "/hr/payroll",
  wht_cert: "/purchases/wht",
  petty_cash_txn: "/petty-cash",
  pos_session: "/pos",
};

export default function Journal() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const urlSearch = new URLSearchParams(window.location.search).get("search") || "";
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [bookFilter, setBookFilter] = useState("all");
  const { colors: themeColors } = useThemeColor();
  const [createdByFilter, setCreatedByFilter] = useState("all");
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState(yearStart);
  const [dateTo, setDateTo] = useState(todayStr);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { dateEra, dateFmt } = useDateSettings();
  const { data: docSettings } = useQuery<any>({
    queryKey: ["/api/document-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const res = await fetch(`/api/document-settings?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
  });
  const { data: entriesData, isLoading } = useQuery<any>({
    queryKey: ["/api/journal-entries", companyId, dateFrom, dateTo, bookFilter],
    queryFn: async () => {
      if (!companyId) return [];
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);
      if (bookFilter !== "all") params.set("journalBook", bookFilter);
      const res = await fetch(`/api/journal-entries?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });
  const entries: any[] = Array.isArray(entriesData) ? entriesData : (entriesData?.data || []);
  const totalEntries: number = entries.length;

  const [linesCache, setLinesCache] = useState<Record<number, any[]>>({});
  const [linesLoading, setLinesLoading] = useState<Set<number>>(new Set());

  const fetchingRef = React.useRef<Set<number>>(new Set());
  const cacheRef = React.useRef<Record<number, any[]>>({});

  const fetchLinesForEntry = useCallback(async (entryId: number) => {
    if (cacheRef.current[entryId] || fetchingRef.current.has(entryId)) return;
    fetchingRef.current.add(entryId);
    setLinesLoading(prev => new Set(prev).add(entryId));
    try {
      const res = await fetch(`/api/journal-entries/${entryId}/lines`, { credentials: "include" });
      if (res.ok) {
        const lines = await res.json();
        const mapped = lines.map((l: any) => ({ ...l, journalEntryId: entryId }));
        cacheRef.current[entryId] = mapped;
        setLinesCache(prev => ({ ...prev, [entryId]: mapped }));
      } else {
        cacheRef.current[entryId] = [];
        setLinesCache(prev => ({ ...prev, [entryId]: [] }));
      }
    } catch {
      cacheRef.current[entryId] = [];
      setLinesCache(prev => ({ ...prev, [entryId]: [] }));
    } finally {
      fetchingRef.current.delete(entryId);
      setLinesLoading(prev => { const next = new Set(prev); next.delete(entryId); return next; });
    }
  }, []);

  const allLines = React.useMemo(() => {
    const result: any[] = [];
    for (const id of Array.from(expandedIds)) {
      if (linesCache[id]) result.push(...linesCache[id]);
    }
    return result;
  }, [expandedIds, linesCache]);

  const deleteMutation = useMutation({
    mutationFn: async (entryId: number) => {
      const res = await fetch(`/api/journal-entries/${entryId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "เกิดข้อผิดพลาด");
      }
      return res.json();
    },
    onSuccess: (data, entryId) => {
      setDeleteTarget(null);
      toast({ title: "สำเร็จ", description: data.message || "ลบรายการบัญชีสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries", companyId] });
      delete cacheRef.current[entryId];
      setLinesCache(prev => { const next = { ...prev }; delete next[entryId]; return next; });
      setExpandedIds(prev => { const next = new Set(prev); next.delete(entryId); return next; });
    },
    onError: (err: any) => {
      toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        fetchLinesForEntry(id);
      }
      return next;
    });
  };

  const creators = Array.from(new Set(entries.map((e: any) => e.createdByName || "ระบบ").filter(Boolean)));

  const filtered = entries.filter((e: any) => {
    if (createdByFilter !== "all" && (e.createdByName || "ระบบ") !== createdByFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (e.entryNo || "").toLowerCase().includes(term) ||
      (e.reference || "").toLowerCase().includes(term) ||
      (e.description || "").toLowerCase().includes(term)
    );
  });

  const sortedEntries = [...filtered].sort((a: any, b: any) => {
    const da = new Date(a.entryDate).getTime();
    const db_val = new Date(b.entryDate).getTime();
    if (db_val !== da) return db_val - da;
    const refA = a.reference || a.entryNo || "";
    const refB = b.reference || b.entryNo || "";
    return refB.localeCompare(refA, undefined, { numeric: true, sensitivity: "base" });
  });

  return (
    <Layout>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg text-white" style={{ background: themeColors.primary }}>
          <BookOpen className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-journal-title">
            {bookFilter !== "all" ? (JOURNAL_BOOKS[bookFilter]?.label || "สมุดรายวัน") : "สมุดรายวัน"}
          </h1>
          <p className="text-sm text-muted-foreground">รายการบันทึกบัญชี</p>
        </div>
      </div>
        <div className="bg-white border rounded-xl shadow-sm">
          <div className="p-3 border-b flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                data-testid="input-search-journal"
                placeholder="ค้นหา..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9 rounded-lg"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">จาก</span>
              <ThaiDateInput
                value={dateFrom}
                onChange={(v: string) => setDateFrom(v)}
                dateEra={dateEra}
                dateFmt={dateFmt}
                className="w-[160px]"
                data-testid="input-date-from"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">ถึง</span>
              <ThaiDateInput
                value={dateTo}
                onChange={(v: string) => setDateTo(v)}
                dateEra={dateEra}
                dateFmt={dateFmt}
                className="w-[160px]"
                data-testid="input-date-to"
              />
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  data-testid="button-clear-date"
                >
                  ล้าง
                </Button>
              )}
            </div>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
              data-testid="button-print-important"
            >
              <Printer className="h-3.5 w-3.5" />
              พิมพ์ใบสำคัญ
            </Button>
            <Button
              onClick={() => navigate("/journal/new")}
              data-testid="button-add-journal"
              className="h-8 px-3 gap-1.5 text-xs text-white"
              style={{ background: themeColors.primary }}
            >
              <Plus className="h-3.5 w-3.5" />
              เพิ่มรายการบัญชี
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent" style={{ background: "var(--theme-primary)" }}>
                  <TableHead className="text-sm font-bold text-white w-8"></TableHead>
                  <TableHead className="text-sm font-bold text-white w-[110px]">วันที่</TableHead>
                  <TableHead className="text-sm font-bold text-white w-[160px]">อ้างอิง</TableHead>
                  <TableHead className="text-sm font-bold text-white">รายละเอียด</TableHead>
                  <TableHead className="text-sm font-bold text-white w-[100px]">ประเภท</TableHead>
                  <TableHead className="text-sm font-bold text-white w-[140px]">
                    <Select value={bookFilter} onValueChange={(v) => setBookFilter(v)}>
                      <SelectTrigger className="h-7 w-full border-white/30 text-white text-xs bg-transparent [&>svg]:text-white" data-testid="select-journal-book-filter">
                        <SelectValue placeholder="สมุดบัญชี" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">สมุดบัญชี</SelectItem>
                        {Object.entries(JOURNAL_BOOKS).map(([key, b]) => (
                          <SelectItem key={key} value={key}>{b.num} - {b.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead className="text-sm font-bold text-white w-[120px]">
                    <Select value={createdByFilter} onValueChange={setCreatedByFilter}>
                      <SelectTrigger className="h-7 w-full border-white/30 text-white text-xs bg-transparent [&>svg]:text-white" data-testid="select-created-by-filter">
                        <SelectValue placeholder="สร้างโดย" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">สร้างโดย</SelectItem>
                        {creators.map((c: string) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">กำลังโหลด...</TableCell>
                  </TableRow>
                ) : sortedEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <BookOpen className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-muted-foreground text-sm">ยังไม่มีรายการบัญชี</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedEntries.map((entry: any) => {
                    const book = JOURNAL_BOOKS[entry.journalBook || "general"] || JOURNAL_BOOKS.general;
                    const docType = DOC_TYPE_LABELS[entry.sourceDocType] || entry.sourceDocType || "บันทึกเอง";
                    const creator = entry.createdByName || "ระบบ";
                    const isExpanded = expandedIds.has(entry.id);
                    const entryLines = allLines.filter((l: any) => l.journalEntryId === entry.id);
                    const totalDebit = entryLines.reduce((s: number, l: any) => s + (parseFloat(l.debit) || 0), 0);
                    const totalCredit = entryLines.reduce((s: number, l: any) => s + (parseFloat(l.credit) || 0), 0);

                    return (
                      <React.Fragment key={entry.id}>
                        <TableRow
                          data-testid={`row-journal-${entry.id}`}
                          className="hover:bg-orange-50/50 transition-colors cursor-pointer border-b"
                          onClick={() => toggleExpand(entry.id)}
                        >
                          <TableCell className="w-8 text-center py-2.5">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 inline" style={{ color: themeColors.primary }} />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground inline" />
                            )}
                          </TableCell>
                          <TableCell className="text-sm py-2.5">{formatDate(entry.entryDate, dateEra, dateFmt)}</TableCell>
                          <TableCell className="py-2.5">
                            {entry.sourceDocType && DOC_TYPE_LIST_ROUTES[entry.sourceDocType] ? (
                              <span
                                className="text-sm font-medium cursor-pointer hover:underline"
                                style={{ color: themeColors.primary }}
                                data-testid={`link-ref-${entry.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`${DOC_TYPE_LIST_ROUTES[entry.sourceDocType]}?companyId=${companyId}${entry.reference ? "&search=" + encodeURIComponent(entry.reference) : ""}`);
                                }}
                              >
                                {entry.reference || "-"}
                              </span>
                            ) : (
                              <span className="text-sm font-medium" style={{ color: themeColors.primary }} data-testid={`link-ref-${entry.id}`}>
                                {entry.reference || "-"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm py-2.5 max-w-[400px]">
                            <span className="line-clamp-1">{entry.description || "-"}</span>
                            {entry.contactName && (
                              <span className="text-xs text-blue-500 ml-1">Contact#{entry.contactId || ""}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm py-2.5">{docType}</TableCell>
                          <TableCell className="text-sm py-2.5">{book.num} - {book.label}</TableCell>
                          <TableCell className="text-sm py-2.5">{creator}</TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow className="bg-slate-50/70 hover:bg-slate-50/70">
                            <TableCell colSpan={7} className="p-0">
                              <div className="px-6 py-3">
                                {linesLoading.has(entry.id) ? (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />กำลังโหลดรายการ...
                                  </div>
                                ) : entryLines.length === 0 ? (
                                  <div>
                                    <div className="text-sm text-muted-foreground py-2">ไม่พบรายการบัญชี</div>
                                    <div className="mt-2 flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry); }}
                                        data-testid={`button-delete-empty-journal-${entry.id}`}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        ลบรายการนี้
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-xs text-muted-foreground border-b" style={{ background: "#fef3ef" }}>
                                          <th className="text-left py-2 px-2 w-8">#</th>
                                          <th className="text-left py-2 px-2 w-28">รหัสบัญชี</th>
                                          <th className="text-left py-2 px-2">รายละเอียด</th>
                                          <th className="text-right py-2 px-2 w-28">เดบิต</th>
                                          <th className="text-right py-2 px-2 w-28">เครดิต</th>
                                          <th className="text-left py-2 px-2 w-24">CostCenter</th>
                                          <th className="text-left py-2 px-2 w-28">ANCHOR</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entryLines.map((line: any, idx: number) => (
                                          <tr key={line.id || idx} className="border-b border-dashed last:border-0">
                                            <td className="py-1.5 px-2 text-xs text-muted-foreground">{idx + 1}</td>
                                            <td className="py-1.5 px-2 text-xs tabular-nums">{line.accountCode || "-"}</td>
                                            <td className="py-1.5 px-2">{line.description || line.accountName || "-"}</td>
                                            <td className="py-1.5 px-2 text-right font-medium tabular-nums">{fmt(line.debit)}</td>
                                            <td className="py-1.5 px-2 text-right font-medium tabular-nums">{fmt(line.credit)}</td>
                                            <td className="py-1.5 px-2 text-xs">{line.costCenter || "-"}</td>
                                            <td className="py-1.5 px-2 text-xs">{line.anchor || "-"}</td>
                                          </tr>
                                        ))}
                                        <tr className="font-bold border-t bg-slate-100/50">
                                          <td colSpan={3} className="py-2 px-2 text-right pr-4">รวม</td>
                                          <td className="py-2 px-2 text-right tabular-nums">{fmt(totalDebit)}</td>
                                          <td className="py-2 px-2 text-right tabular-nums">{fmt(totalCredit)}</td>
                                          <td colSpan={2}></td>
                                        </tr>
                                      </tbody>
                                    </table>
                                    <div className="mt-2 flex gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs gap-1 hover:bg-orange-50"
                                        style={{ borderColor: themeColors.primary, color: themeColors.primary }}
                                        onClick={(e) => { e.stopPropagation(); navigate(`/journal/edit/${entry.id}`); }}
                                        data-testid={`button-edit-journal-${entry.id}`}
                                      >
                                        <Pencil className="h-3 w-3" />
                                        แก้ไขการลงบัญชี
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs gap-1 border-blue-300 text-blue-600 hover:bg-blue-50"
                                        onClick={(e) => { e.stopPropagation(); navigate(`/journal/print/${entry.id}`); }}
                                        data-testid={`button-print-journal-${entry.id}`}
                                      >
                                        <Printer className="h-3 w-3" />
                                        พิมพ์ใบสำคัญ
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs gap-1 border-red-300 text-red-600 hover:bg-red-50"
                                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(entry); }}
                                        data-testid={`button-delete-journal-${entry.id}`}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                        ลบ
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalEntries > 0 && (
            <div className="p-3 border-t text-sm text-muted-foreground">
              แสดงทั้งหมด {totalEntries.toLocaleString()} รายการ
            </div>
          )}
        </div>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-red-600">
              <AlertTriangle className="h-5 w-5" />
              ยืนยันการลบรายการบัญชี
            </DialogTitle>
            <DialogDescription>
              การลบจะไม่สามารถกู้คืนได้ กรุณาตรวจสอบก่อนยืนยัน
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && (
            <div className="space-y-3">
              <div className="border rounded-lg p-3 bg-red-50/50 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">เลขที่อ้างอิง:</span>
                  <span className="font-medium">{deleteTarget.reference || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">วันที่:</span>
                  <span>{formatDate(deleteTarget.entryDate, dateEra, dateFmt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">รายละเอียด:</span>
                  <span className="text-right max-w-[200px] truncate">{deleteTarget.description || "-"}</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} data-testid="button-cancel-delete">
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              ยืนยันลบ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
