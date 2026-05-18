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
import { useShowMore } from "@/hooks/use-show-more";
import {
  Search, Plus, FileText, Edit2, Trash2, Eye, ChevronRight,
  CheckCircle2, Clock, Send, AlertCircle, Minus, Phone, Mail, Download, Upload,
  DollarSign, AlertTriangle, XCircle, CreditCard, Copy, FileOutput, MoreHorizontal, Link2, MessageSquare, Printer,
  BookOpen, ExternalLink, Calendar as CalendarIcon, Paperclip, FileDown, Check
} from "lucide-react";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { BulkDeleteButton, BulkDeleteConfirmDialog, SelectAllCheckbox, RowCheckbox } from "@/components/bulk-delete-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LineSendDialog from "@/components/line-send-dialog";
import JournalViewDialog from "@/components/journal-view-dialog";
import RelatedDocsDialog from "@/components/related-docs-dialog";
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
import type { Invoice } from "@shared/schema";
import ListExportButton from "@/components/list-export-button";
import { parseAttachedUrl } from "@/components/multi-file-attachment";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  sent: { label: "ส่งแล้ว", color: "bg-[var(--theme-primary-light)] text-[var(--theme-primary)] border-[var(--theme-primary)]/20", icon: Send },
  debtor: { label: "ยังไม่ชำระ", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertCircle },
  partially_paid: { label: "ชำระบางส่วน", color: "bg-amber-100 text-amber-700 border-amber-200", icon: DollarSign },
  paid: { label: "ชำระแล้ว", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "ยกเลิก", color: "bg-slate-100 text-slate-500 border-slate-200", icon: XCircle },
  cancel: { label: "ยกเลิก", color: "bg-slate-100 text-slate-500 border-slate-200", icon: XCircle },
  overdue: { label: "ค้างชำระ", color: "bg-red-100 text-red-700 border-red-200", icon: AlertTriangle },
  pending_approval: { label: "รออนุมัติ", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  rejected: { label: "ปฏิเสธ", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  billing_note: { label: "ใบวางบิล", color: "bg-blue-100 text-blue-700 border-blue-200", icon: FileText },
  partial: { label: "ชำระบางส่วน", color: "bg-amber-100 text-amber-700 border-amber-200", icon: DollarSign },
};

const FILTER_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "draft", label: "ร่าง" },
  { value: "sent", label: "ส่งแล้ว" },
  { value: "debtor", label: "ยังไม่ชำระ" },
  { value: "partially_paid", label: "ชำระบางส่วน" },
  { value: "overdue", label: "ค้างชำระ (เกินกำหนด)" },
  { value: "paid", label: "ชำระแล้ว" },
  { value: "cancelled", label: "ยกเลิก" },
];

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: "ยังไม่ชำระ", color: "bg-slate-100 text-slate-600 border-slate-200" },
  new: { label: "ยังไม่ชำระ", color: "bg-slate-100 text-slate-600 border-slate-200" },
  billing_note: { label: "วางบิล", color: "bg-blue-100 text-blue-700 border-blue-200" },
  partial: { label: "ชำระบางส่วน", color: "bg-amber-100 text-amber-700 border-amber-200" },
  paid: { label: "ชำระครบ", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  success: { label: "ชำระครบ", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  overpaid: { label: "ชำระเกิน", color: "bg-purple-100 text-purple-700 border-purple-200" },
  overdue: { label: "เกินกำหนด", color: "bg-red-100 text-red-700 border-red-200" },
  partial_overdue: { label: "ชำระบางส่วน (เกินกำหนด)", color: "bg-orange-100 text-orange-700 border-orange-200" },
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function InvoiceList() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchText, setSearchText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || params.get("invoiceNo") || "";
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [relatedDoc, setRelatedDoc] = useState<{ open: boolean; id: number; docNo: string } | null>(null);
  const [journalDoc, setJournalDoc] = useState<{ open: boolean; id: number } | null>(null);
  const [attachDoc, setAttachDoc] = useState<{ open: boolean; attachedUrl: string; docNo: string } | null>(null);
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const bulk = useBulkDelete({ endpoint: "/api/invoices/bulk-delete", queryKey: "/api/invoices", docLabel: "ใบแจ้งหนี้", companyId });

  const { dateEra, dateFmt } = useDateSettings();

  const { data: _invoiceResp, isLoading } = useQuery<any>({
    queryKey: ["/api/invoices", companyId, searchText],
    queryFn: async () => {
      if (!companyId) return { items: [], _diagInfo: "no companyId" };
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.set("search", searchText);
      const res = await fetch(`/api/invoices?${params}`, { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { items: [], _diagInfo: `HTTP ${res.status}: ${body?.message || res.statusText}`, _error: body?.detail || body?.message || String(res.status) };
      if (Array.isArray(body)) return { items: body, _diagInfo: `legacy array len=${body.length}` };
      return body;
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });
  const invoices: any[] = Array.isArray(_invoiceResp?.items) ? _invoiceResp.items : [];
  const _diagInfo: string = _invoiceResp?._diagInfo || "";
  const _diagError: string = _invoiceResp?._error || "";

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/invoices/${id}`);
    },
    onSuccess: () => {
      invalidateDocCaches(queryClient, [["/api/invoices"]]);
      toast({ title: "ลบใบแจ้งหนี้สำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/invoices/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "เปลี่ยนสถานะสำเร็จ", variant: "success" as any });
    },
  });

  const handleClone = (id: number) => {
    navigate(`/sales/invoice/new?copyFrom=${id}`);
  };

  const today = new Date().toISOString().slice(0, 10);
  const filtered = invoices.filter((q: any) => {
    if (filterStatus && filterStatus !== "all") {
      if (filterStatus === "overdue") {
        const ps = getPaymentStatus(q);
        if (ps !== "overdue" && ps !== "partial_overdue") return false;
      } else if (filterStatus === "cancelled") {
        if (q.status !== "cancelled" && q.status !== "cancel") return false;
      } else if (filterStatus === "paid") {
        if (getPaymentStatus(q) !== "paid" && getPaymentStatus(q) !== "overpaid") return false;
      } else if (filterStatus === "debtor") {
        if (getPaymentStatus(q) !== "unpaid") return false;
      } else if (filterStatus === "partially_paid") {
        const ps = getPaymentStatus(q);
        if (ps !== "partial" && ps !== "partial_overdue") return false;
      } else {
        if (q.status !== filterStatus) return false;
      }
    }
    if (filterBranch !== "all" && q.sellerBranchId !== filterBranch) return false;
    if (dateFrom && q.invoiceDate && q.invoiceDate < dateFrom) return false;
    if (dateTo && q.invoiceDate && q.invoiceDate > dateTo) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!(q.invoiceNo || "").toLowerCase().includes(s) && !(q.customerName || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const { visibleItems, hasMore, remainingCount, totalCount, showMore } = useShowMore(filtered);

  const branchOptions = Array.from(new Set(invoices.map((q: any) => q.sellerBranchId).filter(Boolean))) as string[];

  const exportColumns = [
    { header: "วันที่", key: "invoiceDate", width: 14 },
    { header: "เลขที่", key: "invoiceNo", width: 20 },
    { header: "ลูกค้า", key: "customerName", width: 25 },
    { header: "ยอดก่อนภาษี", key: "subtotal", width: 16, format: "number" as const },
    { header: "ภาษี", key: "vatAmount", width: 14, format: "number" as const },
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

  function getPaymentStatus(inv: any): string {
    const total = parseFloat(String(inv.totalAmount || 0));
    const subtotal = parseFloat(String(inv.subtotal || 0));
    const vatAmt = parseFloat(String(inv.vatAmount || 0));
    const grossTotal = (subtotal + vatAmt) > 0 ? subtotal + vatAmt : total;
    const paidAmount = parseFloat(String(inv.paidAmount || 0));
    if (grossTotal > 0 && paidAmount >= grossTotal) return "paid";
    if (inv.paymentStatus === "paid" || inv.status === "paid") return "paid";
    if (total > 0 && paidAmount > total) return "overpaid";
    if (inv.status === "partially_paid" || inv.paymentStatus === "partial") {
      const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date(new Date().toDateString());
      return isOverdue ? "partial_overdue" : "partial";
    }
    if (inv.hasBillingNote && !["paid", "cancel", "cancelled"].includes(inv.status)) return "billing_note";
    const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date(new Date().toDateString());
    return isOverdue ? "overdue" : "unpaid";
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-[var(--theme-primary)]" />
            <h1 className="text-2xl font-heading font-medium" data-testid="text-page-title">ใบแจ้งหนี้</h1>
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

        {/* DIAG PANEL — uncomment to re-enable
        <div style={{ background: _diagError ? "#fee2e2" : "#fef9c3", border: `1px solid ${_diagError ? "#f87171" : "#fbbf24"}`, borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontSize: 12, fontFamily: "monospace", wordBreak: "break-all" }}>
          <strong>🔍 Diag:</strong> cid={String(companyId)} selId={String(selectedCompanyId)} loading={String(isLoading)} invoices={invoices.length} | {_diagInfo || (isLoading ? "fetching..." : "NO_RESPONSE")}
          {_diagError && <><br/><strong style={{ color: "#dc2626" }}>❌ Error:</strong> {_diagError}</>}
        </div>
        */}

        <Card className="rounded border shadow-sm bg-white">
          <CardHeader className="p-3 border-b space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>รายละเอียด - {filtered.length} รายการ</span>
                {bulk.selectedIds.size > 0 && (
                  <span className="text-red-500 font-medium ml-2">เลือก {bulk.selectedIds.size} รายการ</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <BulkDeleteButton count={bulk.selectedIds.size} isPending={bulk.isPending} onClick={() => bulk.setShowConfirm(true)} />
                <ListExportButton data={filtered} columns={exportColumns} fileName="ใบแจ้งหนี้" />
                <Button data-testid="button-import" variant="outline" onClick={() => navigate("/sales/invoice/import")} className="h-9 text-sm px-4 border-[#05b187] text-[#05b187]">
                  <Upload className="h-3.5 w-3.5 mr-1" /> นำเข้า Excel
                </Button>
                <Button data-testid="button-create" onClick={() => navigate("/sales/invoice/new")} className="h-9 text-sm px-4">
                  <Plus className="h-3.5 w-3.5 mr-1" /> สร้างใบแจ้งหนี้
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
                    {FILTER_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
              <Table>
                <TableHeader className="bg-[var(--theme-primary)]">
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">เลขที่</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[280px]">รายละเอียด</TableHead>
                    <TableHead className="w-[50px] text-center text-xs font-medium text-white leading-tight px-1">ตรวจ<br/>สอบ</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-medium text-white">ค้างชำระ</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-medium text-white">สถานะ</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="animate-pulse">
                      <TableCell><div className="w-7 h-7 rounded-full bg-gray-200 mx-auto" /></TableCell>
                      <TableCell><div className="h-4 w-6 bg-gray-200 rounded mx-auto" /></TableCell>
                      <TableCell><div className="h-4 w-16 bg-gray-200 rounded" /></TableCell>
                      <TableCell><div className="h-4 w-24 bg-gray-200 rounded" /></TableCell>
                      <TableCell><div className="space-y-2"><div className="h-4 w-48 bg-gray-200 rounded" /><div className="h-3 w-32 bg-gray-100 rounded" /></div></TableCell>
                      <TableCell><div className="h-5 w-14 bg-gray-200 rounded-full mx-auto" /></TableCell>
                      <TableCell><div className="h-4 w-20 bg-gray-200 rounded ml-auto" /></TableCell>
                      <TableCell><div className="h-5 w-16 bg-gray-200 rounded-full mx-auto" /></TableCell>
                      <TableCell><div className="h-5 w-5 bg-gray-200 rounded mx-auto" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">ยังไม่มีใบแจ้งหนี้</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/sales/invoice/new")}>
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-[var(--theme-primary)]">
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white">
                      <SelectAllCheckbox
                        checked={filtered.length > 0 && bulk.selectedIds.size === filtered.length}
                        onCheckedChange={(checked) => {
                          if (checked) bulk.selectAll(filtered.map((inv: any) => inv.id));
                          else bulk.clearSelection();
                        }}
                      />
                    </TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">เลขที่</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[280px]">รายละเอียด - {filtered.length} รายการ</TableHead>
                    <TableHead className="w-[50px] text-center text-xs font-medium text-white leading-tight px-1">ตรวจ<br/>สอบ</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-medium text-white">ค้างชำระ</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-medium text-white">สถานะ</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((inv: any, idx: number) => {
                    const st = STATUS_MAP[inv.status] || { label: inv.status || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200", icon: AlertCircle };
                    const StIcon = st.icon;
                    const isExpanded = expandedRows.has(inv.id);
                    const paymentStatus = getPaymentStatus(inv);
                    const ps = PAYMENT_STATUS_MAP[paymentStatus] || { label: paymentStatus || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200" };
                    return (
                      <Fragment key={inv.id}>
                        <TableRow data-testid={`row-invoice-${inv.id}`} className={`hover:bg-slate-50/50 border-b align-top ${bulk.selectedIds.has(inv.id) ? "bg-red-50/50" : ""}`}>
                          <TableCell className="text-center pt-3">
                            <RowCheckbox id={inv.id} checked={bulk.selectedIds.has(inv.id)} onCheckedChange={() => bulk.toggleSelect(inv.id)} />
                          </TableCell>
                          <TableCell className="text-center pt-3">
                            <button
                              data-testid={`button-expand-${inv.id}`}
                              onClick={() => toggleExpand(inv.id)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-white ${isExpanded ? "bg-gray-400" : "bg-[#05b187]"}`}
                            >
                              {isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground pt-3">{idx + 1}</TableCell>
                          <TableCell className="text-sm pt-3">{formatDate(inv.invoiceDate, dateEra, dateFmt)}</TableCell>
                          <TableCell className="pt-3">
                            <button
                              data-testid={`link-invoice-${inv.id}`}
                              className="text-sm text-[#e8734e] hover:underline font-medium"
                              onClick={() => navigate(`/sales/invoice/edit/${inv.id}`)}
                            >
                              {inv.invoiceNo}
                            </button>
                            {(inv.refDoc || inv.referenceNo) && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {inv.refDoc && <span>Ref: <span className="text-blue-600">{inv.refDoc}</span></span>}
                                {!inv.refDoc && inv.referenceNo && <span>QO/SO: <span className="text-blue-600">{inv.referenceNo}</span></span>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="pt-2.5 pb-2.5">
                            <div className="text-sm">
                              {inv.customerCode && <span className="text-blue-600 font-medium">[ {inv.customerCode} ]</span>}{" "}
                              <span className="font-semibold text-slate-800">{inv.customerName}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                              {inv.creditDays != null && <span className="text-green-600">Credit[{inv.creditDays || 0}]</span>}
                              {inv.customerAddress && (
                                <span className="flex items-center gap-0.5 text-blue-500 cursor-pointer hover:underline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inv.customerAddress)}`, '_blank')}>
                                  <ExternalLink className="h-3 w-3" /> ดูแผนที่
                                </span>
                              )}
                              <span className="flex items-center gap-0.5 text-slate-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: inv.id }); }}>
                                <BookOpen className="h-3 w-3" /> ดูบัญชี
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="flex items-center gap-0.5 text-[#03c9d7] cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setRelatedDoc({ open: true, id: inv.id, docNo: inv.invoiceNo }); }}>
                                <FileText className="h-3 w-3" /> เอกสารที่เกี่ยวข้อง
                              </span>
                              {inv.attachedUrl && (
                                <>
                                  <span className="text-slate-400">|</span>
                                  <span className="flex items-center gap-0.5 text-purple-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setAttachDoc({ open: true, attachedUrl: inv.attachedUrl, docNo: inv.invoiceNo }); }}>
                                    <Paperclip className="h-3 w-3" /> เอกสารแนบ
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center pt-3">
                            {inv.approvalStatus ? (() => {
                              const aMap: Record<string, { label: string; cls: string }> = {
                                pending: { label: "รออนุมัติ", cls: "bg-amber-50 text-amber-600 border-amber-300" },
                                approved: { label: "อนุมัติ", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                rejected: { label: "ปฏิเสธ", cls: "bg-red-50 text-red-600 border-red-200" },
                              };
                              const a = aMap[inv.approvalStatus] || { label: inv.approvalStatus, cls: "bg-slate-50 text-slate-500 border-slate-200" };
                              return <Badge data-testid={`badge-approval-${inv.id}`} className={`${a.cls} border text-xs py-0.5 px-2.5 font-normal h-6`}>{a.label}</Badge>;
                            })() : <span className="text-xs text-muted-foreground">-</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums pt-2.5">
                            {(() => {
                              const netTotal = parseFloat(String(inv.totalAmount || 0));
                              const grossTotal = parseFloat(String(inv.subtotal || 0)) + parseFloat(String(inv.vatAmount || 0));
                              const displayTotal = grossTotal > 0 ? grossTotal : netTotal;
                              const effectiveTotal = grossTotal > 0 ? grossTotal : netTotal;
                              const paidAmt = parseFloat(String(inv.paidAmount ?? 0));
                              const isPaid = inv.status === "paid" || inv.paymentStatus === "paid" || inv.paymentStatus === "success" || (paidAmt > 0 && paidAmt >= effectiveTotal);
                              const outstanding = isPaid ? 0 : Math.max(0, effectiveTotal - paidAmt);
                              return (
                                <>
                                  <div className="text-xs text-muted-foreground">{fmt(outstanding)}</div>
                                  <div className="border-t border-gray-200 my-0.5" />
                                  <div className="text-sm font-medium">
                                    {fmt(displayTotal)}
                                    {inv.currencyCode && inv.currencyCode !== "THB" && (
                                      <span className="text-[10px] ml-1 text-[var(--theme-primary)]">{inv.currencyCode}</span>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-center pt-3">
                            <Badge data-testid={`badge-payment-${inv.id}`} className={`${ps.color} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                              {ps.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="pt-3">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button data-testid={`button-actions-${inv.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 text-sm">
                                <DropdownMenuItem onClick={() => navigate(`/sales/invoice/edit/${inv.id}`)} className="flex gap-2">
                                    <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                                  </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/sales/invoice/pdf/${inv.id}`)} className="flex gap-2">
                                  <Printer className="h-3.5 w-3.5 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/invoices/${inv.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/invoice/${data.shareToken}`;
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
                                    const res = await apiRequest("POST", `/api/invoices/${inv.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/invoice/${data.shareToken}`;
                                    setTimeout(() => setLineDialog({ open: true, url, docNo: inv.invoiceNo, customerName: inv.customerName || "" }), 150);
                                  } catch {}
                                }} className="flex gap-2 text-green-600">
                                  <MessageSquare className="h-3.5 w-3.5" /> ส่งผ่าน LINE
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/documents/invoice/${inv.id}/pdf`, { credentials: "include" });
                                    if (!res.ok) throw new Error();
                                    const blob = await res.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url; a.download = `${inv.invoiceNo}.pdf`;
                                    document.body.appendChild(a); a.click(); a.remove();
                                    window.URL.revokeObjectURL(url);
                                    toast({ title: "ดาวน์โหลด PDF สำเร็จ" });
                                  } catch { toast({ title: "ดาวน์โหลดไม่สำเร็จ", variant: "destructive" }); }
                                }} className="flex gap-2">
                                  <Download className="h-3.5 w-3.5 text-emerald-600" /> ดาวน์โหลด e-Invoice PDF
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleClone(inv.id)} className="flex gap-2">
                                  <Copy className="h-3.5 w-3.5" /> คัดลอกเอกสาร
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {inv.status === "draft" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "sent" })} className="flex gap-2">
                                    <Send className="h-3.5 w-3.5" /> ส่งใบแจ้งหนี้
                                  </DropdownMenuItem>
                                )}
                                {inv.status === "sent" && (
                                  <>
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "partially_paid" })} className="flex gap-2 text-amber-600">
                                      <DollarSign className="h-3.5 w-3.5" /> ชำระบางส่วน
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "paid" })} className="flex gap-2 text-emerald-600">
                                      <CheckCircle2 className="h-3.5 w-3.5" /> ชำระแล้ว
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "overdue" })} className="flex gap-2 text-red-600">
                                      <AlertTriangle className="h-3.5 w-3.5" /> เกินกำหนด
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {inv.status === "partially_paid" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "paid" })} className="flex gap-2 text-emerald-600">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> ชำระครบแล้ว
                                  </DropdownMenuItem>
                                )}
                                {inv.status !== "cancelled" && inv.status !== "paid" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "cancelled" })} className="flex gap-2 text-gray-500">
                                      <XCircle className="h-3.5 w-3.5" /> ยกเลิก
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {selectedCompany?.vatRegistered && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => navigate(`/sales/tax-invoice/new?fromInvoice=${inv.id}`)} className="flex gap-2 text-emerald-600">
                                      <FileOutput className="h-3.5 w-3.5" /> ออกใบกำกับภาษี
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem onClick={() => navigate(`/sales/receipt/new?fromInvoice=${inv.id}`)} className="flex gap-2 text-[var(--theme-primary)]">
                                  <FileOutput className="h-3.5 w-3.5" /> ออกใบเสร็จรับเงิน
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (confirm("ยืนยันลบใบแจ้งหนี้นี้?")) {
                                      deleteMutation.mutate(inv.id);
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
                            <TableCell colSpan={12} className="p-4">
                              <ExpandedDetail inv={inv} />
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
        docType="ใบแจ้งหนี้"
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
      />
      {relatedDoc && (
        <RelatedDocsDialog open={relatedDoc.open} onOpenChange={(open) => { if (!open) setRelatedDoc(null); }} docType="invoice" docId={relatedDoc.id} />
      )}
      {journalDoc && (
        <JournalViewDialog open={journalDoc.open} onOpenChange={(open) => { if (!open) setJournalDoc(null); }} docType="invoice" docId={journalDoc.id} />
      )}
      {attachDoc && (
        <AttachmentViewDialog open={attachDoc.open} onOpenChange={(open) => { if (!open) setAttachDoc(null); }} attachedUrl={attachDoc.attachedUrl} docNo={attachDoc.docNo} />
      )}
      <BulkDeleteConfirmDialog open={bulk.showConfirm} onOpenChange={bulk.setShowConfirm} count={bulk.selectedIds.size} docLabel="ใบแจ้งหนี้" onConfirm={bulk.confirmDelete} />
    </Layout>
  );
}

function ExpandedDetail({ inv }: { inv: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/invoices/${inv.id}`, { credentials: "include" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setItems(data.items || []);
          setDetail(data);
        }
      } catch {}
      if (!cancelled) setLoadingItems(false);
    })();
    return () => { cancelled = true; };
  }, [inv.id]);

  const attachFiles = parseAttachedUrl(inv.attachedUrl || "");

  return (
    <div className="space-y-3">
      <div className="flex gap-8 text-sm text-slate-600">
        {inv.customerTaxId && (
          <div>
            <span className="text-slate-400">|||</span> {inv.customerTaxId}
          </div>
        )}
        {inv.customerAddress && (
          <div className="flex-1">
            <span className="text-slate-400">📍</span> {inv.customerAddress}
          </div>
        )}
        {inv.notes && (
          <div className="text-right">
            <span className="text-slate-500">หมายเหตุ:</span><br/>
            <span className="text-slate-500">เงื่อนไข: {inv.paymentTerms || "-"}</span>
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
                <TableRow key={i} className="h-10 hover:bg-sky-50/50">
                  <TableCell className="text-sm text-muted-foreground">{it.productCode || "-"}</TableCell>
                  <TableCell className="text-sm">{it.productName}</TableCell>
                  <TableCell className="text-sm text-right">{fmt(it.unitPrice)}</TableCell>
                  <TableCell className="text-sm text-center">{parseFloat(it.qty || it.quantity || "0").toLocaleString("th-TH", { maximumFractionDigits: 2 })} {it.unit || ""}</TableCell>
                  <TableCell className="text-sm text-center">{it.discount ? `${it.discount}%` : "-"}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{fmt(it.total || it.totalPrice)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {loadingItems && <div className="text-xs text-muted-foreground text-center py-2">กำลังโหลดรายการ...</div>}

      {detail && (
        <div className="flex justify-end">
          <div className="text-sm space-y-0.5 text-right min-w-[200px]">
            <div className="flex justify-between"><span className="text-slate-500">ราคารวม:</span><span>{fmt(detail.subtotal || detail.subtotalAmount)}</span></div>
            {parseFloat(detail.discountAmount || "0") > 0 && (
              <div className="flex justify-between text-red-500"><span>ส่วนลด:</span><span>-{fmt(detail.discountAmount)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-slate-500">ก่อน VAT:</span><span>{fmt(detail.beforeVatAmount || (parseFloat(detail.totalAmount || "0") - parseFloat(detail.vatAmount || "0")))}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">VAT {detail.vatRate || 7}%:</span><span>{fmt(detail.vatAmount)}</span></div>
            <div className="flex justify-between font-medium border-t pt-1 mt-1"><span>ยอดสุทธิ:</span><span>{fmt(detail.totalAmount)}</span></div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          data-testid={`button-journal-${inv.id}`}
          onClick={async () => {
            const res = await fetch(`/api/journal-entries/by-source/invoice/${inv.id}`, { credentials: 'include' });
            if (res.ok) { const j = await res.json(); if (j?.id) navigate('/journal/edit/' + j.id); }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-[var(--theme-primary)]/30 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10 transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
          แก้ไขการลงบัญชี
        </button>
        <button
          data-testid={`button-related-${inv.id}`}
          onClick={() => setRelatedOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-[#03c9d7]/30 text-[#03c9d7] hover:bg-[#03c9d7]/10 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          เอกสารที่เกี่ยวข้อง
        </button>
      </div>

      {attachFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
          {attachFiles.map((file, idx) => (
            <a
              key={idx}
              href={file.path}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-purple-600 hover:underline bg-purple-50 border border-purple-200 rounded px-2 py-0.5"
              data-testid={`attachment-file-${inv.id}-${idx}`}
            >
              <FileDown className="h-3 w-3" />
              แนบ {idx + 1}
            </a>
          ))}
        </div>
      )}

      <RelatedDocsDialog open={relatedOpen} onOpenChange={setRelatedOpen} docType="invoice" docId={inv.id} />
    </div>
  );
}