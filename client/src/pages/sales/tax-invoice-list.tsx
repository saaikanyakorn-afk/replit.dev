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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, Plus, FileText, Edit2, Trash2, Eye, ChevronRight, Download,
  CheckCircle2, Clock, AlertCircle, XCircle, Minus, Copy, FileOutput, FileMinus, MoreHorizontal, Link2, MessageSquare, Printer,
  BookOpen, ExternalLink, Calendar as CalendarIcon, CreditCard, DollarSign, FileCheck, Send, Mail, MailCheck, Loader2, Paperclip, FileDown, Upload
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LineSendDialog from "@/components/line-send-dialog";
import SendEmailDialog from "@/components/send-email-dialog";
import JournalViewDialog from "@/components/journal-view-dialog";
import RelatedDocsDialog from "@/components/related-docs-dialog";
import AttachmentViewDialog from "@/components/attachment-view-dialog";
import { EtaxSendDialog } from "@/components/etax-send-dialog";
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
import type { TaxInvoice } from "@shared/schema";
import { toLocalDateStr } from "@/lib/utils";
import ListExportButton from "@/components/list-export-button";
import { useShowMore } from "@/hooks/use-show-more";
import { parseAttachedUrl } from "@/components/multi-file-attachment";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  overdue: { label: "ค้างชำระ", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  debtor: { label: "ยังไม่ชำระ", color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertCircle },
  cash: { label: "เงินสด", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  credit_card: { label: "เครดิตการ์ด", color: "bg-blue-100 text-blue-700 border-blue-200", icon: CreditCard },
  billing_note: { label: "ใบวางบิล", color: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: FileText },
  partial: { label: "ชำระบางส่วน", color: "bg-amber-100 text-amber-700 border-amber-200", icon: DollarSign },
  paid_by_ar: { label: "หักลูกหนี้", color: "bg-cyan-100 text-cyan-700 border-cyan-200", icon: CheckCircle2 },
  credit_note: { label: "ใบลดหนี้", color: "bg-purple-100 text-purple-700 border-purple-200", icon: FileText },
  cheque: { label: "เช็ครับ", color: "bg-teal-100 text-teal-700 border-teal-200", icon: FileCheck },
  cheque_done: { label: "เช็คผ่าน", color: "bg-emerald-200 text-emerald-800 border-emerald-300", icon: CheckCircle2 },
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  issued: { label: "ออกแล้ว", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  pending_approval: { label: "รออนุมัติ", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "ยกเลิก", color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
  voided: { label: "ยกเลิก(ถูกต้อง)", color: "bg-amber-100 text-amber-700 border-amber-200", icon: AlertCircle },
  paid: { label: "เสร็จสิ้น", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  transfer_done: { label: "โอนแล้ว", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: "ยังไม่ชำระ", color: "bg-slate-100 text-slate-600 border-slate-200" },
  new: { label: "ยังไม่ชำระ", color: "bg-slate-100 text-slate-600 border-slate-200" },
  partial: { label: "ชำระบางส่วน", color: "bg-amber-100 text-amber-700 border-amber-200" },
  paid: { label: "ชำระครบ", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  success: { label: "ชำระครบ", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  overpaid: { label: "ชำระเกิน", color: "bg-purple-100 text-purple-700 border-purple-200" },
  wallet: { label: "เงินเข้า Wallet", color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  overdue: { label: "เกินกำหนด", color: "bg-red-100 text-red-700 border-red-200" },
  partial_overdue: { label: "ค้างชำระ (เกินกำหนด)", color: "bg-red-100 text-red-700 border-red-200" },
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getPaymentStatusKey(inv: any): string {
  const ps = inv.paymentStatus || "unpaid";
  if (ps === "paid" || ps === "success") return ps;
  const isOverdue = inv.dueDate && new Date(inv.dueDate) < new Date(new Date().toDateString());
  if (ps === "partial") return isOverdue ? "partial_overdue" : "partial";
  if (ps === "unpaid" || ps === "new") return isOverdue ? "overdue" : ps;
  return ps;
}

export default function TaxInvoiceList() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchText, setSearchText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || params.get("taxInvoiceNo") || "";
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [relatedDoc, setRelatedDoc] = useState<{ open: boolean; id: number; docNo: string } | null>(null);
  const [journalDoc, setJournalDoc] = useState<{ open: boolean; id: number } | null>(null);
  const [attachDoc, setAttachDoc] = useState<{ open: boolean; attachedUrl: string; docNo: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; id: number; email: string; docNo: string; customerName: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { dateEra, dateFmt } = useDateSettings();

  const { data: taxInvoices = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/tax-invoices", companyId, searchText],
    queryFn: async () => {
      if (!companyId) return [];
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.set("search", searchText);
      const res = await fetch(`/api/tax-invoices?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: paymentMethodsList = [] } = useQuery<any[]>({
    queryKey: ["/api/payment-methods", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/payment-methods?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const isCashMethod = (pm: string) => {
    if (!pm) return false;
    if (pm === "เงินสด") return true;
    const found = paymentMethodsList.find((m: any) => m.accountCode === pm);
    return !!(found && (found.name === "เงินสด" || found.nameTh === "เงินสด"));
  };

  const { data: etaxSettings } = useQuery({
    queryKey: ["/api/etax/settings", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/etax/settings?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
  });
  const etaxEnabled = etaxSettings?.etaxEnabled === true;

  const [sendingEtaxId, setSendingEtaxId] = useState<number | null>(null);
  const [etaxDialog, setEtaxDialog] = useState<{ open: boolean; invId: number; invNo: string }>({ open: false, invId: 0, invNo: "" });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tax-invoices/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "ลบไม่สำเร็จ"); }
      return res.json();
    },
    onSuccess: () => {
      invalidateDocCaches(queryClient, [["/api/tax-invoices"]]);
      toast({ title: "ลบใบกำกับภาษีสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "ไม่สามารถลบได้", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/tax-invoices/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-invoices"] });
      toast({ title: "เปลี่ยนสถานะสำเร็จ", variant: "success" as any });
    },
  });

  const handleClone = (id: number) => {
    navigate(`/sales/tax-invoice/new?copyFrom=${id}`);
  };

  const filtered = taxInvoices.filter((q: any) => {
    if (filterStatus && filterStatus !== "all" && q.status !== filterStatus) return false;
    if (filterBranch !== "all" && q.sellerBranchId !== filterBranch) return false;
    if (dateFrom && q.taxInvoiceDate && q.taxInvoiceDate < dateFrom) return false;
    if (dateTo && q.taxInvoiceDate && q.taxInvoiceDate > dateTo) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!(q.taxInvoiceNo || "").toLowerCase().includes(s) && !(q.customerName || "").toLowerCase().includes(s) && !(q.refDoc || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const { visibleItems, hasMore, remainingCount, totalCount, showMore } = useShowMore(filtered);

  const branchOptions = Array.from(new Set(taxInvoices.map((q: any) => q.sellerBranchId).filter(Boolean))) as string[];

  const exportColumns = [
    { header: "วันที่", key: "taxInvoiceDate", width: 14 },
    { header: "เลขที่", key: "taxInvoiceNo", width: 20 },
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

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((inv: any) => inv.id)));
    }
  }

  function handleBatchPrint() {
    if (selectedIds.size === 0) {
      toast({ title: "กรุณาเลือกใบกำกับภาษีอย่างน้อย 1 รายการ", variant: "destructive" });
      return;
    }
    const ids = Array.from(selectedIds).join(",");
    window.open(`/sales/tax-invoice/batch-print?ids=${ids}`, "_blank");
  }

  const bulkJournal = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/tax-invoices/bulk-journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids, companyId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "ลงบัญชีไม่สำเร็จ");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: `ลงบัญชีสำเร็จ ${data.created} รายการ`,
        description: data.skipped > 0 ? `ข้าม ${data.skipped} รายการ (ลงบัญชีแล้ว/ยังไม่อนุมัติ)` : undefined,
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/tax-invoices"] });
    },
    onError: (err: any) => {
      toast({ title: err.message || "เกิดข้อผิดพลาด", variant: "destructive" });
    },
  });

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-[var(--theme-primary)]" />
            <h1 className="text-2xl font-heading font-medium" data-testid="text-page-title">ใบกำกับภาษี</h1>
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
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <>
                    <Button
                      data-testid="button-bulk-journal"
                      onClick={() => bulkJournal.mutate()}
                      disabled={bulkJournal.isPending}
                      variant="outline"
                      className="h-9 text-sm px-4 border-[#05b187] text-[#05b187] hover:bg-green-50"
                    >
                      {bulkJournal.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <BookOpen className="h-3.5 w-3.5 mr-1" />}
                      ลงบัญชีที่เลือก ({selectedIds.size})
                    </Button>
                    <Button data-testid="button-batch-print" onClick={handleBatchPrint} variant="outline" className="h-9 text-sm px-4 border-purple-400 text-purple-600 hover:bg-purple-50">
                      <Printer className="h-3.5 w-3.5 mr-1" /> พิมพ์ที่เลือก ({selectedIds.size})
                    </Button>
                  </>
                )}
                <ListExportButton data={filtered} columns={exportColumns} fileName="ใบกำกับภาษี" />
                <Button data-testid="button-import" variant="outline" onClick={() => navigate("/sales/tax-invoice/import")} className="h-9 text-sm px-4 border-[#05b187] text-[#05b187]">
                  <Upload className="h-3.5 w-3.5 mr-1" /> นำเข้า Excel
                </Button>
                <Button data-testid="button-create" onClick={() => navigate("/sales/tax-invoice/new")} className="h-9 text-sm px-4">
                  <Plus className="h-3.5 w-3.5 mr-1" /> สร้างใบกำกับภาษี
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
                <FileText className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">ยังไม่มีใบกำกับภาษี</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/sales/tax-invoice/new")}>
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-[var(--theme-primary)]">
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white">
                      <Checkbox
                        data-testid="checkbox-select-all"
                        checked={filtered.length > 0 && selectedIds.size === filtered.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">Invoice ID ⇅</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[280px]">รายละเอียด</TableHead>
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
                    return (
                      <Fragment key={inv.id}>
                        <TableRow data-testid={`row-tax-invoice-${inv.id}`} className={`hover:bg-slate-50/50 border-b ${selectedIds.has(inv.id) ? "bg-purple-50/50" : ""}`}>
                          <TableCell className="text-center py-3">
                            <Checkbox
                              data-testid={`checkbox-select-${inv.id}`}
                              checked={selectedIds.has(inv.id)}
                              onCheckedChange={() => toggleSelect(inv.id)}
                            />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <button
                              data-testid={`button-expand-${inv.id}`}
                              onClick={() => toggleExpand(inv.id)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-white ${isExpanded ? "bg-gray-400" : "bg-[var(--theme-primary)]"}`}
                            >
                              {isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="text-sm">{formatDate(inv.taxInvoiceDate, dateEra, dateFmt)}</TableCell>
                          <TableCell className="pt-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                data-testid={`link-tax-invoice-${inv.id}`}
                                className="text-sm text-[#e8734e] hover:underline font-medium"
                                onClick={() => navigate(`/sales/tax-invoice/edit/${inv.id}`)}
                              >
                                {inv.taxInvoiceNo}
                              </button>
                              {inv.etaxSentAt && (
                                <span title={`ส่ง e-Tax แล้ว: ${inv.etaxSentTo} (${new Date(inv.etaxSentAt).toLocaleDateString("th-TH")})`} className="inline-flex items-center">
                                  <Mail className="h-3.5 w-3.5 text-emerald-500" />
                                </span>
                              )}
                            </div>
                            {(inv.refDoc || inv.referenceNo) && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                Ref.: <span className="text-blue-600">{inv.refDoc || inv.referenceNo}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="pt-2.5 pb-2.5">
                            <div className="text-sm">
                              {inv.customerCode && <span className="text-blue-600 font-medium">[ {inv.customerCode} ]</span>}{" "}
                              <span className="font-semibold text-slate-800">{inv.customerName}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                            {!inv.paymentMethod ? null : (inv.paymentMethod && inv.paymentMethod !== "เครดิต") ? (() => {
                                const ref = inv.refDoc || inv.referenceNo;
                                const refPrefix = ref ? ref.replace(/\d.*$/, "").toUpperCase() : null;
                                const label = refPrefix ? `Cash[${refPrefix}-TIV]` : "Cash[TIV]";
                                return <span className="text-green-600">{label}</span>;
                              })() : (
                                <span className="text-purple-600">Credit[TIV]</span>
                              )}
                              {inv.customerAddress && (
                                <span className="flex items-center gap-0.5 text-blue-500 cursor-pointer hover:underline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(inv.customerAddress)}`, '_blank')}>
                                  <ExternalLink className="h-3 w-3" /> ดูแผนที่
                                </span>
                              )}
                              <span className="flex items-center gap-0.5 text-slate-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: inv.id }); }}>
                                <BookOpen className="h-3 w-3" /> ดูบัญชี
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="flex items-center gap-0.5 text-[#03c9d7] cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setRelatedDoc({ open: true, id: inv.id, docNo: inv.taxInvoiceNo }); }}>
                                <FileText className="h-3 w-3" /> เอกสารที่เกี่ยวข้อง
                              </span>
                              {inv.attachedUrl && (
                                <>
                                  <span className="text-slate-400">|</span>
                                  <span className="flex items-center gap-0.5 text-purple-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setAttachDoc({ open: true, attachedUrl: inv.attachedUrl, docNo: inv.taxInvoiceNo }); }}>
                                    <Paperclip className="h-3 w-3" /> เอกสารแนบ
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center pt-2.5">
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
                              const total = parseFloat(String(inv.totalAmount || 0));
                              const paid = parseFloat(String(inv.paidAmount || 0));
                              const cnAmt = parseFloat(String(inv.cnAmount || 0));
                              const whtAmt = parseFloat(String(inv.withholdingTax || inv.whtAmount || 0));
                              const grossTotal = total + whtAmt;
                              const PAID_STATUSES = ["paid", "cash", "credit_card", "cheque_done", "transfer_done", "paid_by_ar", "completed"];
                              const isPaid = PAID_STATUSES.includes(inv.status) || inv.paymentStatus === "paid" || inv.paymentStatus === "success" || !!(inv.paymentMethod && inv.paymentMethod !== "เครดิต");
                              const effectiveTotal = grossTotal - cnAmt;
                              const outstanding = isPaid ? 0 : Math.max(0, effectiveTotal - paid);
                              const isCreditUnpaid = inv.paymentMethod === "เครดิต" && !isPaid;
                              return (
                                <>
                                  <div className="text-xs text-muted-foreground">{fmt(outstanding)}</div>
                                  {cnAmt > 0 && (
                                    <div className="text-xs text-orange-500">[CN: -{fmt(cnAmt)}]</div>
                                  )}
                                  {whtAmt > 0 && !isCreditUnpaid && (
                                    <div className="text-xs text-blue-600">[WHT:{fmt(whtAmt)}]</div>
                                  )}
                                  <div className="border-t border-gray-200 my-0.5" />
                                  <div className="text-sm font-medium">
                                    {fmt(grossTotal)}
                                    {inv.currencyCode && inv.currencyCode !== "THB" && (
                                      <span className="text-[10px] ml-1 text-[var(--theme-primary)]">{inv.currencyCode}</span>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-center pt-2.5">
                            {(() => {
                              const approvalMap: Record<string, { label: string; cls: string }> = {
                                cash: { label: "เงินสด", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                credit_card: { label: "บัตรเครดิต", cls: "bg-blue-50 text-blue-600 border-blue-200" },
                                cheque: { label: "เช็ค", cls: "bg-purple-50 text-purple-600 border-purple-200" },
                                cheque_done: { label: "เช็คผ่าน", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                debtor: { label: "ยังไม่ชำระ", cls: "bg-amber-50 text-amber-600 border-amber-300" },
                                overdue: { label: "เกินกำหนด", cls: "bg-red-50 text-red-600 border-red-200" },
                                billing_note: { label: "วางบิล", cls: "bg-blue-50 text-blue-600 border-blue-200" },
                                partial: { label: "บางส่วน", cls: "bg-amber-50 text-amber-600 border-amber-300" },
                                paid_by_ar: { label: "ชำระจาก AR", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                credit_note: { label: "ใบลดหนี้", cls: "bg-orange-50 text-orange-600 border-orange-200" },
                                paid: { label: "เสร็จสิ้น", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                transfer_done: { label: "โอนแล้ว", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                completed: { label: "เสร็จสิ้น", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                              };
                              const effectiveStatus = (inv.paymentMethod && inv.paymentMethod !== "เครดิต")
                                ? "cash"
                                : (inv.hasBillingNote && !["paid", "transfer_done", "completed", "cash", "credit_card", "cheque_done", "cancel", "cancelled"].includes(inv.status) ? "billing_note" : inv.status);
                              const a = approvalMap[effectiveStatus] || { label: "-", cls: "bg-slate-50 text-slate-500 border-slate-200" };
                              return (
                                <>
                                  <Badge data-testid={`badge-status-${inv.id}`} className={`${a.cls} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                                    {a.label}
                                  </Badge>
                                  <div className="text-xs text-muted-foreground mt-1">{formatDate(inv.dueDate || inv.taxInvoiceDate, dateEra, dateFmt)}</div>
                                </>
                              );
                            })()}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button data-testid={`button-actions-${inv.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 text-sm">
                                <DropdownMenuItem onClick={() => navigate(`/sales/tax-invoice/edit/${inv.id}`)} className="flex gap-2">
                                    <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                                  </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/sales/tax-invoice/pdf/${inv.id}`)} className="flex gap-2">
                                  <Printer className="h-3.5 w-3.5 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/tax-invoices/${inv.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/tax-invoice/${data.shareToken}`;
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
                                    const res = await apiRequest("POST", `/api/tax-invoices/${inv.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/tax-invoice/${data.shareToken}`;
                                    setTimeout(() => setLineDialog({ open: true, url, docNo: inv.taxInvoiceNo, customerName: inv.customerName || "" }), 150);
                                  } catch {}
                                }} className="flex gap-2 text-green-600">
                                  <MessageSquare className="h-3.5 w-3.5" /> ส่งผ่าน LINE
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEmailDialog({ open: true, id: inv.id, email: "", docNo: inv.taxInvoiceNo, customerName: inv.customerName || "" })} className="flex gap-2" style={{ color: "var(--theme-primary)" }}>
                                  <MailCheck className="h-3.5 w-3.5" /> ส่งอีเมล
                                </DropdownMenuItem>
                                {etaxEnabled && !inv.etaxSentAt && (
                                  <DropdownMenuItem
                                    data-testid={`button-etax-send-${inv.id}`}
                                    onClick={() => setEtaxDialog({ open: true, invId: inv.id, invNo: inv.taxInvoiceNo })}
                                    className="flex gap-2 text-[var(--theme-primary)]"
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                    ส่ง e-Tax Invoice
                                  </DropdownMenuItem>
                                )}
                                {etaxEnabled && inv.etaxSentAt && (
                                  <>
                                    <DropdownMenuItem disabled className="flex gap-2 text-emerald-600 opacity-100">
                                      <Mail className="h-3.5 w-3.5" />
                                      <span className="text-xs">ส่งแล้ว: {inv.etaxSentTo} ({new Date(inv.etaxSentAt).toLocaleDateString("th-TH")})</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      data-testid={`button-etax-resend-${inv.id}`}
                                      onClick={() => setEtaxDialog({ open: true, invId: inv.id, invNo: inv.taxInvoiceNo })}
                                      className="flex gap-2 text-amber-600"
                                    >
                                      {sendingEtaxId === inv.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                      ส่งซ้ำ e-Tax Invoice
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={async () => {
                                      try {
                                        const res = await fetch("/api/etax/generate-pdf", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          credentials: "include",
                                          body: JSON.stringify({ taxInvoiceId: inv.id, companyId }),
                                        });
                                        if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
                                        const blob = await res.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url; a.download = `${inv.taxInvoiceNo}_PDFA3.pdf`;
                                        document.body.appendChild(a); a.click(); a.remove();
                                        window.URL.revokeObjectURL(url);
                                        toast({ title: "ดาวน์โหลด e-Tax PDF/A-3 สำเร็จ" });
                                      } catch (err: any) { toast({ title: "ดาวน์โหลดไม่สำเร็จ", description: err.message, variant: "destructive" }); }
                                    }} className="flex gap-2 text-emerald-600">
                                      <Download className="h-3.5 w-3.5" /> ดาวน์โหลด e-Tax PDF/A-3
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleClone(inv.id)} className="flex gap-2">
                                  <Copy className="h-3.5 w-3.5" /> คัดลอกเอกสาร
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {inv.status === "draft" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "issued" })} className="flex gap-2 text-emerald-600">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> ออกใบกำกับภาษี
                                  </DropdownMenuItem>
                                )}
                                {inv.status === "issued" && (
                                  <>
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "cancelled" })} className="flex gap-2 text-red-600">
                                      <AlertCircle className="h-3.5 w-3.5" /> ยกเลิก
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: inv.id, status: "voided" })} className="flex gap-2 text-amber-600">
                                      <AlertCircle className="h-3.5 w-3.5" /> ยกเลิก(ถูกต้อง)
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigate(`/sales/receipt/new?fromTaxInvoice=${inv.id}`)} className="flex gap-2 text-[var(--theme-primary)]">
                                  <FileOutput className="h-3.5 w-3.5" /> ออกใบเสร็จรับเงิน
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/sales/credit-note/new?fromTaxInvoice=${inv.id}`)} className="flex gap-2 text-orange-600">
                                  <FileMinus className="h-3.5 w-3.5" /> ออกใบลดหนี้
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (confirm("ยืนยันลบใบกำกับภาษีนี้?")) {
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
                            <TableCell colSpan={14} className="p-4">
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
        docType="ใบกำกับภาษี"
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
        showFormTypeSelector
      />
      {relatedDoc && (
        <RelatedDocsDialog open={relatedDoc.open} onOpenChange={(open) => { if (!open) setRelatedDoc(null); }} docType="tax_invoice" docId={relatedDoc.id} />
      )}
      {journalDoc && (
        <JournalViewDialog open={journalDoc.open} onOpenChange={(open) => { if (!open) setJournalDoc(null); }} docType="tax_invoice" docId={journalDoc.id} />
      )}
      {attachDoc && (
        <AttachmentViewDialog open={attachDoc.open} onOpenChange={(open) => { if (!open) setAttachDoc(null); }} attachedUrl={attachDoc.attachedUrl} docNo={attachDoc.docNo} />
      )}
      <EtaxSendDialog
        open={etaxDialog.open}
        onOpenChange={(open) => setEtaxDialog(prev => ({ ...prev, open }))}
        taxInvoiceId={etaxDialog.invId}
        taxInvoiceNo={etaxDialog.invNo}
      />
      {emailDialog && (
        <SendEmailDialog
          open={emailDialog.open}
          onOpenChange={(open) => { if (!open) setEmailDialog(null); }}
          defaultEmail={emailDialog.email}
          docLabel="ใบกำกับภาษี"
          docNo={emailDialog.docNo}
          onConfirm={async (email) => {
            const res = await apiRequest("POST", `/api/documents/tax_invoice/${emailDialog.id}/send-email`, { recipientEmail: email, recipientName: emailDialog.customerName });
            const data = await res.json();
            toast({ title: data.success !== false ? "ส่งอีเมลสำเร็จ" : "ส่งไม่สำเร็จ", description: data.message, variant: data.success !== false ? ("success" as any) : "destructive" });
            if (data.success !== false) setEmailDialog(null);
          }}
        />
      )}
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
        const res = await fetch(`/api/tax-invoices/${inv.id}`, { credentials: "include" });
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
            <span className="text-slate-500">{inv.notes}</span>
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
                <TableRow key={i} className="h-10">
                  <TableCell className="text-sm text-muted-foreground">{it.productCode || "-"}</TableCell>
                  <TableCell className="text-sm">{it.productName}</TableCell>
                  <TableCell className="text-sm text-right">{fmt(it.unitPrice)}</TableCell>
                  <TableCell className="text-sm text-center">{it.qty || it.quantity || 1}</TableCell>
                  <TableCell className="text-sm text-center">{it.discount || 0}{it.discountType === "percent" ? "%" : ""}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{fmt(it.total || it.totalPrice || (Number(it.unitPrice || 0) * Number(it.qty || it.quantity || 1)))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {loadingItems && <div className="text-center text-sm text-muted-foreground py-2">กำลังโหลดรายการ...</div>}

      {detail && (
        <div className="flex justify-end">
          <div className="text-sm space-y-1 text-right min-w-[200px]">
            <div className="flex justify-between"><span className="text-slate-500">ก่อน VAT:</span><span>{fmt(Number(detail.totalAmount || 0) - Number(detail.vatAmount || detail.vat || 0))}</span></div>
            {Number(detail.discountAmount || detail.discount || 0) > 0 && <div className="flex justify-between"><span className="text-slate-500">ส่วนลด:</span><span className="text-red-500">-{fmt(detail.discountAmount || detail.discount)}</span></div>}
            <div className="flex justify-between"><span className="text-slate-500">VAT {detail.vatRate || 7}%:</span><span>{fmt(detail.vatAmount || detail.vat)}</span></div>
            {Number(detail.withholdingTaxAmount || detail.withholdingTax || 0) > 0 && <div className="flex justify-between"><span className="text-slate-500">ภาษีหัก ณ ที่จ่าย:</span><span className="text-red-500">-{fmt(detail.withholdingTaxAmount || detail.withholdingTax)}</span></div>}
            <div className="flex justify-between font-medium border-t pt-1"><span>ยอดรวมสุทธิ:</span><span>{fmt(detail.totalAmount)}</span></div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          data-testid={`button-journal-${inv.id}`}
          onClick={async () => {
            const res = await fetch(`/api/journal-entries/by-source/tax_invoice/${inv.id}`, { credentials: 'include' });
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

      <RelatedDocsDialog open={relatedOpen} onOpenChange={setRelatedOpen} docType="tax_invoice" docId={inv.id} />
    </div>
  );
}
