import { useState, useEffect, Fragment } from "react";
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
  Search, Plus, Receipt, Edit2, Trash2, Eye, ChevronRight, Download,
  CheckCircle2, Clock, Minus, CreditCard, Banknote, FileCheck,
  AlertCircle, XCircle, Copy, MoreHorizontal, FileText, Link2, MessageSquare, Printer,
  BookOpen, ExternalLink, Calendar as CalendarIcon, Paperclip, FileDown
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LineSendDialog from "@/components/line-send-dialog";
import AttachmentViewDialog from "@/components/attachment-view-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { apiRequest, getShareBaseUrl } from "@/lib/queryClient";
import { invalidateDocCaches } from "@/lib/invalidate-doc-caches";
import { formatDate } from "@/lib/format";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import type { Receipt as ReceiptType } from "@shared/schema";
import JournalViewDialog from "@/components/journal-view-dialog";
import RelatedDocsDialog from "@/components/related-docs-dialog";
import { toLocalDateStr } from "@/lib/utils";
import ListExportButton from "@/components/list-export-button";
import { useShowMore } from "@/hooks/use-show-more";
import { parseAttachedUrl } from "@/components/multi-file-attachment";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { BulkDeleteButton, BulkDeleteConfirmDialog, SelectAllCheckbox, RowCheckbox } from "@/components/bulk-delete-bar";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  overdue: { label: "ค้างชำระ", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  completed: { label: "เสร็จสิ้น", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  credit_card: { label: "เครดิตการ์ด", color: "bg-blue-100 text-blue-700 border-blue-200", icon: CreditCard },
  pending_transfer: { label: "รอโอนเงิน", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  transfer_in_progress: { label: "โอนเงิน [กำลังดำเนินการ]", color: "bg-[var(--theme-primary-light)] text-[var(--theme-primary)] border-[var(--theme-primary)]/20", icon: Banknote },
  transfer_done: { label: "โอนเงิน [เสร็จสิ้น]", color: "bg-emerald-200 text-emerald-800 border-emerald-300", icon: CheckCircle2 },
  cheque: { label: "เช็คจ่าย", color: "bg-teal-100 text-teal-700 border-teal-200", icon: FileCheck },
  cheque_done: { label: "เช็คจ่าย [เสร็จสิ้น]", color: "bg-emerald-200 text-emerald-800 border-emerald-300", icon: CheckCircle2 },
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  issued: { label: "ออกแล้ว", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  approved: { label: "เสร็จสิ้น", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  paid: { label: "เสร็จสิ้น", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  pending_approval: { label: "รออนุมัติ", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  cancelled: { label: "ยกเลิก", color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
  cheque: "เช็ค",
  credit_card: "บัตรเครดิต",
  other: "อื่นๆ",
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ReceiptList() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchText, setSearchText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || params.get("receiptNo") || "";
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [relatedDoc, setRelatedDoc] = useState<{ open: boolean; id: number; docNo: string } | null>(null);
  const [journalDoc, setJournalDoc] = useState<{ open: boolean; id: number } | null>(null);
  const [attachDoc, setAttachDoc] = useState<{ open: boolean; attachedUrl: string; docNo: string } | null>(null);
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const bulk = useBulkDelete({ endpoint: "/api/receipts/bulk-delete", queryKey: "/api/receipts", docLabel: "ใบเสร็จรับเงิน", companyId });
  const { dateEra, dateFmt } = useDateSettings();

  const { data: receipts = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/receipts", companyId, searchText],
    queryFn: async () => {
      if (!companyId) return [];
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.set("search", searchText);
      const res = await fetch(`/api/receipts?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/receipts/${id}`);
    },
    onSuccess: () => {
      invalidateDocCaches(queryClient, [["/api/receipts"]]);
      toast({ title: "ลบใบเสร็จรับเงินสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/receipts/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      toast({ title: "เปลี่ยนสถานะสำเร็จ", variant: "success" as any });
    },
  });

  const handleClone = (id: number) => {
    navigate(`/sales/receipt/new?copyFrom=${id}`);
  };

  const filtered = receipts.filter((q: any) => {
    if (filterStatus && filterStatus !== "all" && q.status !== filterStatus) return false;
    if (filterBranch !== "all" && q.sellerBranchId !== filterBranch) return false;
    if (dateFrom && q.receiptDate && q.receiptDate < dateFrom) return false;
    if (dateTo && q.receiptDate && q.receiptDate > dateTo) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!(q.receiptNo || "").toLowerCase().includes(s) && !(q.customerName || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const { visibleItems, hasMore, remainingCount, totalCount, showMore } = useShowMore(filtered);

  const branchOptions = Array.from(new Set(receipts.map((q: any) => q.sellerBranchId).filter(Boolean))) as string[];

  const exportColumns = [
    { header: "วันที่", key: "receiptDate", width: 14 },
    { header: "เลขที่", key: "receiptNo", width: 20 },
    { header: "ลูกค้า", key: "customerName", width: 25 },
    { header: "ยอดรวม", key: "totalAmount", width: 16, format: "number" as const },
    { header: "สถานะ", key: "status", width: 12 },
  ];

  function toggleExpand(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-6 w-6 text-[var(--theme-primary)]" />
            <h1 className="text-2xl font-heading font-medium" data-testid="text-page-title">ใบเสร็จรับเงิน</h1>
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
                <ListExportButton data={filtered} columns={exportColumns} fileName="ใบเสร็จรับเงิน" />
                <Button data-testid="button-create" onClick={() => navigate("/sales/receipt/new")} className="h-9 text-sm px-4">
                  <Plus className="h-3.5 w-3.5 mr-1" /> สร้างใบเสร็จรับเงิน
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
              {branchOptions.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">สาขา:</span>
                  <Select value={filterBranch} onValueChange={setFilterBranch}>
                    <SelectTrigger className="w-36 h-8 text-xs bg-white border rounded-lg" data-testid="select-filter-branch">
                      <SelectValue placeholder="ทั้งหมด" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ทั้งหมด</SelectItem>
                      {branchOptions.map((b) => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(dateFrom || dateTo || (filterStatus && filterStatus !== "all") || filterBranch !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo(""); setFilterStatus("all"); setFilterBranch("all"); }} data-testid="button-clear-filters">
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
                <Receipt className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">ยังไม่มีใบเสร็จรับเงิน</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/sales/receipt/new")}>
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-[var(--theme-primary)]">
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white">
                      <SelectAllCheckbox checked={filtered.length > 0 && bulk.selectedIds.size === filtered.length} onCheckedChange={(c) => c ? bulk.selectAll(filtered.map((r: any) => r.id)) : bulk.clearSelection()} />
                    </TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่ ⇅</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">เอกสาร ⇅</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[280px]">รายละเอียด - {filtered.length} รายการ</TableHead>
                    <TableHead className="w-[50px] text-center text-xs font-medium text-white leading-tight px-1">ตรวจ<br/>สอบ</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-medium text-white">ค้างชำระ</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-medium text-white">สถานะ</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((rc: any, idx: number) => {
                    const st = STATUS_MAP[rc.status] || { label: rc.status || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock };
                    const StIcon = st.icon;
                    const isExpanded = expandedRows.has(rc.id);
                    return (
                      <Fragment key={rc.id}>
                        <TableRow data-testid={`row-receipt-${rc.id}`} className={`hover:bg-slate-50/50 border-b ${bulk.selectedIds.has(rc.id) ? "bg-red-50/50" : ""}`}>
                          <TableCell className="text-center py-3">
                            <RowCheckbox id={rc.id} checked={bulk.selectedIds.has(rc.id)} onCheckedChange={() => bulk.toggleSelect(rc.id)} />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <button
                              data-testid={`button-expand-${rc.id}`}
                              onClick={() => toggleExpand(rc.id)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-white ${isExpanded ? "bg-gray-400" : "bg-[#03c9d7]"}`}
                            >
                              {isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="text-sm">{formatDate(rc.receiptDate, dateEra, dateFmt)}</TableCell>
                          <TableCell className="pt-3">
                            <button
                              data-testid={`link-receipt-${rc.id}`}
                              className="text-sm text-[#e8734e] hover:underline font-medium"
                              onClick={() => navigate(`/sales/receipt/edit/${rc.id}`)}
                            >
                              {rc.receiptNo}
                            </button>
                            {(rc.refDoc || rc.referenceNo) && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Ref: <span className="text-blue-600">{rc.refDoc || rc.referenceNo}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="pt-2.5 pb-2.5">
                            <div className="text-sm">
                              {rc.customerCode && <span className="text-blue-600 font-medium">[ {rc.customerCode} ]</span>}{" "}
                              <span className="font-semibold text-slate-800">{rc.customerName}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-0.5 text-slate-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: rc.id }); }}>
                                <BookOpen className="h-3 w-3" /> ดูบัญชี
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="flex items-center gap-0.5 text-[#03c9d7] cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setRelatedDoc({ open: true, id: rc.id, docNo: rc.receiptNo }); }}>
                                <FileText className="h-3 w-3" /> เอกสารที่เกี่ยวข้อง
                              </span>
                              {rc.attachedUrl && (
                                <>
                                  <span className="text-slate-400">|</span>
                                  <span className="flex items-center gap-0.5 text-purple-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setAttachDoc({ open: true, attachedUrl: rc.attachedUrl, docNo: rc.receiptNo }); }}>
                                    <Paperclip className="h-3 w-3" /> เอกสารแนบ
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="pt-3">
                            {(() => {
                              const approvalMap: Record<string, { label: string; cls: string }> = {
                                completed: { label: "สำเร็จ", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                credit_card: { label: "บัตรเครดิต", cls: "bg-blue-50 text-blue-600 border-blue-200" },
                                pending_transfer: { label: "รอโอน", cls: "bg-amber-50 text-amber-600 border-amber-300" },
                                transfer_in_progress: { label: "กำลังโอน", cls: "bg-blue-50 text-blue-600 border-blue-200" },
                                transfer_done: { label: "โอนแล้ว", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                cheque: { label: "เช็ค", cls: "bg-purple-50 text-purple-600 border-purple-200" },
                                cheque_done: { label: "เช็คผ่าน", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                overdue: { label: "เกินกำหนด", cls: "bg-red-50 text-red-600 border-red-200" },
                                approved: { label: "เสร็จสิ้น", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                paid: { label: "เสร็จสิ้น", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                              };
                              const a = approvalMap[rc.status] || { label: "-", cls: "bg-slate-50 text-slate-500 border-slate-200" };
                              return (
                                <Badge data-testid={`badge-approval-${rc.id}`} className={`${a.cls} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                                  {a.label}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums pt-2.5">
                            {(() => {
                              const total = parseFloat(String(rc.totalAmount || 0));
                              const paidStatuses = ["issued", "completed", "transfer_done", "cheque_done", "approved", "paid"];
                              const paidAmt = parseFloat(String(rc.paidAmount ?? 0));
                              const outstanding = paidStatuses.includes(rc.status) ? 0 : Math.max(0, total - paidAmt);
                              const whtAmt = parseFloat(String(rc.withholdingTax ?? rc.whtAmount ?? 0));
                              return (
                                <>
                                  <div className="text-xs text-muted-foreground">{fmt(outstanding)}</div>
                                  {whtAmt > 0 && (
                                    <div className="text-xs text-blue-600">[WHT:{fmt(whtAmt)}]</div>
                                  )}
                                  <div className="border-t border-gray-200 my-0.5" />
                                  <div className="text-sm font-medium">
                                    {fmt(total)}
                                    {rc.currencyCode && rc.currencyCode !== "THB" && (
                                      <span className="text-[10px] ml-1 text-[var(--theme-primary)]">{rc.currencyCode}</span>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-center pt-2.5">
                            <Badge data-testid={`badge-status-${rc.id}`} className={`${st.color} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                              {st.label}
                            </Badge>
                            <div className="text-xs text-muted-foreground mt-1">{formatDate(rc.receiptDate, dateEra, dateFmt)}</div>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button data-testid={`button-actions-${rc.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 text-sm">
                                <DropdownMenuItem onClick={() => navigate(`/sales/receipt/edit/${rc.id}`)} className="flex gap-2">
                                    <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                                  </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/sales/receipt/pdf/${rc.id}`)} className="flex gap-2">
                                  <Printer className="h-3.5 w-3.5 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/receipts/${rc.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/receipt/${data.shareToken}`;
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
                                    const res = await apiRequest("POST", `/api/receipts/${rc.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/receipt/${data.shareToken}`;
                                    setTimeout(() => setLineDialog({ open: true, url, docNo: rc.receiptNo, customerName: rc.customerName || "" }), 150);
                                  } catch {}
                                }} className="flex gap-2 text-green-600">
                                  <MessageSquare className="h-3.5 w-3.5" /> ส่งผ่าน LINE
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/documents/receipt/${rc.id}/pdf`, { credentials: "include" });
                                    if (!res.ok) throw new Error();
                                    const blob = await res.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url; a.download = `${rc.receiptNo}.pdf`;
                                    document.body.appendChild(a); a.click(); a.remove();
                                    window.URL.revokeObjectURL(url);
                                    toast({ title: "ดาวน์โหลด PDF สำเร็จ" });
                                  } catch { toast({ title: "ดาวน์โหลดไม่สำเร็จ", variant: "destructive" }); }
                                }} className="flex gap-2">
                                  <Download className="h-3.5 w-3.5 text-emerald-600" /> ดาวน์โหลด e-Receipt PDF
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleClone(rc.id)} className="flex gap-2">
                                  <Copy className="h-3.5 w-3.5" /> คัดลอกเอกสาร
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {rc.status === "draft" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: rc.id, status: "issued" })} className="flex gap-2 text-emerald-600">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> ออกใบเสร็จ
                                  </DropdownMenuItem>
                                )}
                                {rc.status === "issued" && (
                                  <>
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: rc.id, status: "cancelled" })} className="flex gap-2 text-red-600">
                                      <AlertCircle className="h-3.5 w-3.5" /> ยกเลิก
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: rc.id, status: "voided" })} className="flex gap-2 text-amber-600">
                                      <AlertCircle className="h-3.5 w-3.5" /> ยกเลิก(ถูกต้อง)
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (confirm("ยืนยันลบใบเสร็จรับเงินนี้?")) {
                                      deleteMutation.mutate(rc.id);
                                    }
                                  }}
                                  className="flex gap-2 text-red-500"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> ลบเอกสาร
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-slate-50/80">
                            <TableCell colSpan={10} className="p-4">
                              <ExpandedDetail rc={rc} />
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            {hasMore && (
              <div className="text-center py-3 border-t">
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); showMore(); }} className="text-sm font-medium hover:opacity-80 hover:underline cursor-pointer py-1 px-3" style={{ color: "var(--theme-primary)" }} data-testid="button-show-more">
                  แสดงเพิ่มเติม ({remainingCount} รายการ)
                </button>
              </div>
            )}
            {!hasMore && totalCount > 50 && (
              <div className="text-center py-2 text-xs text-muted-foreground">
                แสดงทั้งหมด {totalCount} รายการ
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <LineSendDialog
        open={lineDialog.open}
        onOpenChange={(open) => setLineDialog(prev => ({ ...prev, open }))}
        shareUrl={lineDialog.url}
        docType="ใบเสร็จรับเงิน"
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
      />
      {relatedDoc && (
        <RelatedDocsDialog open={relatedDoc.open} onOpenChange={(open) => { if (!open) setRelatedDoc(null); }} docType="receipt" docId={relatedDoc.id} />
      )}
      {journalDoc && (
        <JournalViewDialog open={journalDoc.open} onOpenChange={(open) => { if (!open) setJournalDoc(null); }} docType="receipt" docId={journalDoc.id} />
      )}
      {attachDoc && (
        <AttachmentViewDialog open={attachDoc.open} onOpenChange={(open) => { if (!open) setAttachDoc(null); }} attachedUrl={attachDoc.attachedUrl} docNo={attachDoc.docNo} />
      )}
      <BulkDeleteConfirmDialog open={bulk.showConfirm} onOpenChange={bulk.setShowConfirm} count={bulk.selectedIds.size} docLabel="ใบเสร็จรับเงิน" onConfirm={bulk.confirmDelete} />
    </Layout>
  );
}

function ExpandedDetail({ rc }: { rc: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [, navigate] = useLocation();
  const [relatedOpen, setRelatedOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/receipts/${rc.id}`, { credentials: "include" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setItems(data.items || []);
          setDetail(data);
        }
      } catch {}
      if (!cancelled) setLoadingItems(false);
    })();
    return () => { cancelled = true; };
  }, [rc.id]);

  return (
    <div className="space-y-3">
      <div className="flex gap-8 text-sm text-slate-600">
        {rc.customerTaxId && (
          <div>
            <span className="text-slate-400">|||</span> {rc.customerTaxId}
          </div>
        )}
        {rc.customerAddress && (
          <div className="flex-1">
            <span className="text-slate-400">📍</span> {rc.customerAddress}
          </div>
        )}
        {rc.notes && (
          <div className="text-right">
            <span className="text-slate-500">หมายเหตุ:</span><br/>
            <span className="text-slate-500">{rc.notes}</span>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="border rounded overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)] h-10">
                <TableHead className="text-white text-sm font-medium w-20">รหัส</TableHead>
                <TableHead className="text-white text-sm font-medium">สินค้า</TableHead>
                <TableHead className="text-white text-sm font-medium w-24 text-right">ราคา</TableHead>
                <TableHead className="text-white text-sm font-medium w-16 text-center">จำนวน</TableHead>
                <TableHead className="text-white text-sm font-medium w-16 text-center">ส่วนลด</TableHead>
                <TableHead className="text-white text-sm font-medium w-24 text-right">รวม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it: any, i: number) => (
                <TableRow key={i} className="hover:bg-slate-50/50 h-10">
                  <TableCell className="text-sm text-slate-500">{it.productCode || "-"}</TableCell>
                  <TableCell className="text-sm">{it.productName}</TableCell>
                  <TableCell className="text-sm text-right">{fmt(it.unitPrice)}</TableCell>
                  <TableCell className="text-sm text-center">{it.quantity}</TableCell>
                  <TableCell className="text-sm text-center">{it.discount || 0}%</TableCell>
                  <TableCell className="text-sm text-right font-medium">{fmt(it.totalPrice)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {loadingItems && <div className="text-sm text-muted-foreground">กำลังโหลดรายการ...</div>}

      {detail && (
        <div className="flex justify-end">
          <div className="text-sm space-y-0.5 text-right">
            <div>รวมก่อนภาษี: <span className="font-medium">{fmt(detail.subtotalAmount)}</span></div>
            <div>ภาษี: <span className="font-medium">{fmt(detail.vatAmount)}</span></div>
            <div className="text-sm font-medium text-[var(--theme-primary)]">ยอดรวมสุทธิ: {fmt(detail.totalAmount)}</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          data-testid={`button-journal-${rc.id}`}
          onClick={async () => {
            const res = await fetch(`/api/journal-entries/by-source/receipt/${rc.id}`, { credentials: 'include' });
            if (res.ok) { const j = await res.json(); if (j?.id) navigate('/journal/edit/' + j.id); }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-[var(--theme-primary)]/30 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10 transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
          แก้ไขการลงบัญชี
        </button>
        <button
          data-testid={`button-related-${rc.id}`}
          onClick={() => setRelatedOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-[#03c9d7]/30 text-[#03c9d7] hover:bg-[#03c9d7]/10 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          เอกสารที่เกี่ยวข้อง
        </button>
      </div>

      {rc.attachedUrl && (() => {
        const files = parseAttachedUrl(rc.attachedUrl);
        if (files.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Paperclip className="h-3.5 w-3.5 text-slate-400" />
            {files.map((file, idx) => (
              <a key={idx} href={file.path} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[var(--theme-primary)] hover:underline bg-orange-50 border border-orange-200 rounded px-2 py-0.5">
                <FileDown className="h-3 w-3" />
                แนบ {idx + 1}
              </a>
            ))}
          </div>
        );
      })()}

      <RelatedDocsDialog open={relatedOpen} onOpenChange={setRelatedOpen} docType="receipt" docId={rc.id} />
    </div>
  );
}
