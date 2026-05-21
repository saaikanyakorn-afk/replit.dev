import { useState, Fragment, lazy, Suspense } from "react";
const CreditNotePdf = lazy(() => import("@/pages/sales/credit-note-pdf"));
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import {
  Search, Plus, FileText, Edit2, Trash2, Eye,
  CheckCircle2, Clock, MoreHorizontal, Calendar as CalendarIcon,
  AlertCircle, XCircle, Printer, Link2, MessageSquare, MailCheck, BookOpen, Send, Upload
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SendEmailDialog from "@/components/send-email-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { apiRequest, getShareBaseUrl } from "@/lib/queryClient";
import { invalidateDocCaches } from "@/lib/invalidate-doc-caches";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { BulkDeleteButton, BulkDeleteConfirmDialog, SelectAllCheckbox, RowCheckbox } from "@/components/bulk-delete-bar";
import { formatDate } from "@/lib/format";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import { toLocalDateStr } from "@/lib/utils";
import LineSendDialog from "@/components/line-send-dialog";
import JournalViewDialog from "@/components/journal-view-dialog";
import { EtaxSendDialog } from "@/components/etax-send-dialog";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  pending_approval: { label: "รออนุมัติ", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  rejected: { label: "ปฏิเสธ", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  cancelled: { label: "ยกเลิก", color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CreditNoteList() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchText, setSearchText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || params.get("creditNoteNo") || "";
  });
  const [filterStatus, setFilterStatus] = useState("all");
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; id: number; email: string; docNo: string; customerName: string } | null>(null);
  const [journalDoc, setJournalDoc] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
  const [etaxDialog, setEtaxDialog] = useState<{ open: boolean; creditNoteId: number; creditNoteNo: string }>({ open: false, creditNoteId: 0, creditNoteNo: "" });
  const [pdfId, setPdfId] = useState<string | null>(null);

  const bulk = useBulkDelete({ endpoint: "/api/sales-credit-notes/bulk-delete", queryKey: "/api/sales-credit-notes", docLabel: "ใบลดหนี้", companyId });
  const { dateEra, dateFmt } = useDateSettings();

  const { data: creditNotes = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/sales-credit-notes", companyId, searchText],
    queryFn: async () => {
      if (!companyId) return [];
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.set("search", searchText);
      const res = await fetch(`/api/sales-credit-notes?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/sales-credit-notes/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `เกิดข้อผิดพลาด (${res.status})`);
      }
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/sales-credit-notes"] });
      invalidateDocCaches(queryClient, [["/api/sales-credit-notes"]]);
      toast({ title: "ลบใบลดหนี้สำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "ลบไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const filtered = creditNotes.filter((cn: any) => {
    if (filterStatus && filterStatus !== "all" && cn.status !== filterStatus) return false;
    if (dateFrom && cn.creditNoteDate && cn.creditNoteDate < dateFrom) return false;
    if (dateTo && cn.creditNoteDate && cn.creditNoteDate > dateTo) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!(cn.creditNoteNo || "").toLowerCase().includes(s) && !(cn.customerName || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-[var(--theme-primary)]" />
            <h1 className="text-2xl font-heading font-medium" data-testid="text-page-title">ใบลดหนี้ขาย [CN]</h1>
            <span className="text-sm text-muted-foreground">รายได้</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded px-3 py-1.5">
          <Badge className="bg-red-500 text-white text-sm">Analysis</Badge>
          <div className="relative flex-1">
            <Input
              data-testid="input-search"
              placeholder="คำค้นหา..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="h-9 text-sm pl-3 pr-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
          <Button data-testid="button-search" variant="secondary" size="sm" className="h-9 text-sm px-4">
            <Search className="h-3.5 w-3.5 mr-1" /> ค้นหา
          </Button>
        </div>

        <Card className="rounded border shadow-sm bg-white">
          <CardHeader className="p-3 border-b space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>รายละเอียด - {filtered.length} รายการ</span>
                {bulk.selectedIds.size > 0 && <span className="text-red-500 font-medium ml-2">เลือก {bulk.selectedIds.size} รายการ</span>}
              </div>
              <div className="flex items-center gap-2">
                <BulkDeleteButton count={bulk.selectedIds.size} isPending={bulk.isPending} onClick={() => bulk.setShowConfirm(true)} />
                <Button data-testid="button-import" variant="outline" onClick={() => navigate("/sales/credit-note/import")} className="h-9 text-sm px-4 border-[#05b187] text-[#05b187]">
                  <Upload className="h-3.5 w-3.5 mr-1" /> นำเข้า Excel
                </Button>
                <Button data-testid="button-create" onClick={() => navigate("/sales/credit-note/new")} className="h-9 text-sm px-4">
                  <Plus className="h-3.5 w-3.5 mr-1" /> สร้างใบลดหนี้
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">ช่วงวันที่:</span>
                <ThaiDateInput value={dateFrom} onChange={setDateFrom} dateEra={dateEra} dateFmt={dateFmt} className="w-[160px]" data-testid="input-date-from" />
                <span className="text-xs text-gray-500">ถึง</span>
                <ThaiDateInput value={dateTo} onChange={setDateTo} dateEra={dateEra} dateFmt={dateFmt} className="w-[160px]" data-testid="input-date-to" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">สถานะ:</span>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36 h-8 text-xs bg-white border rounded-lg" data-testid="select-filter-status">
                    <SelectValue placeholder="ทั้งหมด" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    {Object.entries(STATUS_MAP).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(dateFrom || dateTo || (filterStatus && filterStatus !== "all")) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo(""); setFilterStatus("all"); }} data-testid="button-clear-filters">
                  ล้างตัวกรอง
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">กำลังโหลด...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">ยังไม่มีใบลดหนี้ขาย</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/sales/credit-note/new")}>
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-[var(--theme-primary)]">
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white">
                      <SelectAllCheckbox checked={filtered.length > 0 && bulk.selectedIds.size === filtered.length} onCheckedChange={(c) => c ? bulk.selectAll(filtered.map((cn: any) => cn.id)) : bulk.clearSelection()} />
                    </TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">CN #</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[280px]">รายละเอียด - {filtered.length} รายการ</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">อ้างอิง TIV</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-medium text-white">จำนวนเงิน</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-medium text-white">สถานะ</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((cn: any, idx: number) => {
                    const st = STATUS_MAP[cn.status] || { label: cn.status || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock };
                    const StIcon = st.icon;
                    return (
                      <TableRow key={cn.id} data-testid={`row-credit-note-${cn.id}`} className={`hover:bg-slate-50/50 border-b ${bulk.selectedIds.has(cn.id) ? "bg-red-50/50" : ""}`}>
                        <TableCell className="text-center text-sm">
                          <RowCheckbox id={cn.id} checked={bulk.selectedIds.has(cn.id)} onCheckedChange={() => bulk.toggleSelect(cn.id)} />
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <button
                            data-testid={`link-credit-note-${cn.id}`}
                            className="text-sm text-[#e8734e] hover:underline font-medium"
                            onClick={() => navigate(`/sales/credit-note/edit/${cn.id}`)}
                          >
                            {cn.creditNoteNo || "-"}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(cn.creditNoteDate, dateEra, dateFmt)}</TableCell>
                        <TableCell>
                          <div className="text-sm font-normal">{cn.customerName}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                            <span
                              className="flex items-center gap-0.5 text-xs text-slate-500 cursor-pointer hover:underline"
                              onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: cn.id }); }}
                            >
                              <BookOpen className="h-3 w-3" /> ดูบัญชี
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {cn.refTaxInvoiceId ? (
                            <button
                              className="text-blue-600 hover:underline font-medium"
                              onClick={() => navigate(`/sales/tax-invoice?search=${encodeURIComponent(cn.refTaxInvoiceNo || String(cn.refTaxInvoiceId))}`)}
                            >
                              {cn.refTaxInvoiceNo || `#${cn.refTaxInvoiceId}`}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <div className="text-sm font-normal">
                            {fmt(cn.totalAmount)}
                            {cn.currencyCode && cn.currencyCode !== "THB" && (
                              <span className="text-[10px] ml-1 text-[var(--theme-primary)] font-normal">{cn.currencyCode}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge data-testid={`badge-status-${cn.id}`} className={`${st.color} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                            <StIcon className="h-3 w-3 mr-1" />
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button data-testid={`button-actions-${cn.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 text-sm">
                              <DropdownMenuItem onClick={() => navigate(`/sales/credit-note/edit/${cn.id}`)} className="flex gap-2">
                                <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setPdfId(String(cn.id))} className="flex gap-2">
                                <Printer className="h-3.5 w-3.5 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setEtaxDialog({ open: true, creditNoteId: cn.id, creditNoteNo: cn.creditNoteNo })}
                                className="flex gap-2 text-blue-600"
                                data-testid={`button-etax-cn-${cn.id}`}
                              >
                                <Send className="h-3.5 w-3.5" />
                                ส่ง e-Tax Invoice
                                {cn.etaxSentAt && <span className="ml-auto text-[10px] bg-green-100 text-green-700 px-1 rounded">ส่งแล้ว</span>}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                try {
                                  const res = await fetch(`/api/sales-credit-notes/${cn.id}/share`, { method: "POST", credentials: "include" });
                                  const data = await res.json();
                                  const base = await getShareBaseUrl();
                                  const url = `${base}/share/credit-note/${data.shareToken}`;
                                  try {
                                    await navigator.clipboard.writeText(url);
                                    toast({ title: "คัดลอกลิงก์แชร์แล้ว", description: url });
                                  } catch {
                                    window.prompt("คัดลอกลิงก์ด้านล่าง:", url);
                                  }
                                } catch (err: any) {
                                  toast({ title: "สร้างลิงก์ไม่สำเร็จ", description: err.message, variant: "destructive" });
                                }
                              }} className="flex gap-2">
                                <Link2 className="h-3.5 w-3.5" /> ลิงก์สำหรับแชร์
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={async () => {
                                try {
                                  const res = await fetch(`/api/sales-credit-notes/${cn.id}/share`, { method: "POST", credentials: "include" });
                                  const data = await res.json();
                                  const base = await getShareBaseUrl();
                                  const url = `${base}/share/credit-note/${data.shareToken}`;
                                  setTimeout(() => setLineDialog({ open: true, url, docNo: cn.creditNoteNo, customerName: cn.customerName || "" }), 150);
                                } catch {}
                              }} className="flex gap-2 text-green-600">
                                <MessageSquare className="h-3.5 w-3.5" /> ส่งผ่าน LINE
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEmailDialog({ open: true, id: cn.id, email: "", docNo: cn.creditNoteNo, customerName: cn.customerName || "" })} className="flex gap-2" style={{ color: "var(--theme-primary)" }}>
                                <MailCheck className="h-3.5 w-3.5" /> ส่งอีเมล
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  if (confirm(`ยืนยันลบใบลดหนี้ ${cn.creditNoteNo} ?\n\nระบบจะลบรายการสินค้า และบันทึกบัญชีที่เกี่ยวข้องทั้งหมดด้วย`)) {
                                    deleteMutation.mutate(cn.id);
                                  }
                                }}
                                className="flex gap-2 text-red-500"
                                data-testid={`button-delete-cn-${cn.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" /> ลบเอกสาร
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <BulkDeleteConfirmDialog open={bulk.showConfirm} onOpenChange={bulk.setShowConfirm} count={bulk.selectedIds.size} docLabel="ใบลดหนี้" onConfirm={bulk.confirmDelete} />
      <EtaxSendDialog
        open={etaxDialog.open}
        onOpenChange={(open) => setEtaxDialog(prev => ({ ...prev, open }))}
        docType="credit_note"
        creditNoteId={etaxDialog.creditNoteId}
        creditNoteNo={etaxDialog.creditNoteNo}
      />
      <LineSendDialog
        open={lineDialog.open}
        onOpenChange={(open) => setLineDialog(prev => ({ ...prev, open }))}
        shareUrl={lineDialog.url}
        docType="ใบลดหนี้"
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
      />
      <JournalViewDialog
        open={journalDoc.open}
        onOpenChange={(open) => setJournalDoc(prev => ({ ...prev, open }))}
        docType="credit_note"
        docId={journalDoc.id ?? 0}
      />
      {pdfId && (
        <div style={{ position: "fixed", inset: 0, background: "white", zIndex: 9999, overflow: "auto" }}>
          <Suspense fallback={null}>
            <CreditNotePdf idProp={pdfId} onClose={() => setPdfId(null)} />
          </Suspense>
        </div>
      )}
      {emailDialog && (
        <SendEmailDialog
          open={emailDialog.open}
          onOpenChange={(open) => { if (!open) setEmailDialog(null); }}
          defaultEmail={emailDialog.email}
          docLabel="ใบลดหนี้"
          docNo={emailDialog.docNo}
          onConfirm={async (email) => {
            const res = await apiRequest("POST", `/api/documents/credit_note/${emailDialog.id}/send-email`, { recipientEmail: email, recipientName: emailDialog.customerName });
            const data = await res.json();
            toast({ title: data.success !== false ? "ส่งอีเมลสำเร็จ" : "ส่งไม่สำเร็จ", description: data.message, variant: data.success !== false ? ("success" as any) : "destructive" });
            if (data.success !== false) setEmailDialog(null);
          }}
        />
      )}
    </Layout>
  );
}
