import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useShowMore } from "@/hooks/use-show-more";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import {
  Search, Plus, FileText, Edit2, Trash2, Eye, Minus, Phone, Mail,
  CheckCircle2, Clock, XCircle, AlertCircle, Copy, MoreHorizontal, CreditCard,
  BookOpen, ExternalLink, Calendar as CalendarIcon,
  Printer, Link2, MessageSquare, MailCheck, Upload, Sparkles, Paperclip, FileDown
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RelatedDocsDialog from "@/components/related-docs-dialog";
import JournalViewDialog from "@/components/journal-view-dialog";
import { parseAttachedUrl } from "@/components/multi-file-attachment";
import LineSendDialog from "@/components/line-send-dialog";
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
import { toLocalDateStr } from "@/lib/utils";
import ListExportButton from "@/components/list-export-button";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { BulkDeleteButton, BulkDeleteConfirmDialog, SelectAllCheckbox, RowCheckbox } from "@/components/bulk-delete-bar";

const exportColumns = [
  { header: "วันที่", key: "apDate", width: 14 },
  { header: "เลขที่", key: "apNo", width: 20 },
  { header: "ผู้จำหน่าย", key: "vendorName", width: 30 },
  { header: "ยอดก่อนภาษี", key: "subtotal", width: 16, format: "number" as const },
  { header: "ภาษี", key: "vatAmount", width: 14, format: "number" as const },
  { header: "ยอดรวม", key: "totalAmount", width: 16, format: "number" as const },
  { header: "สถานะ", key: "status", width: 14 },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  pending_approval: { label: "รออนุมัติ", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  rejected: { label: "ปฏิเสธ", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  paid: { label: "ชำระแล้ว", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "ยกเลิก", color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
};

const PAYMENT_STATUS_MAP: Record<string, { label: string; color: string }> = {
  unpaid: { label: "ยังไม่ชำระ", color: "bg-slate-100 text-slate-600 border-slate-200" },
  new: { label: "ยังไม่ชำระ", color: "bg-slate-100 text-slate-600 border-slate-200" },
  partial: { label: "ชำระบางส่วน", color: "bg-amber-100 text-amber-700 border-amber-200" },
  paid: { label: "ชำระครบ", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  success: { label: "ชำระครบ", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  overpaid: { label: "ชำระเกิน", color: "bg-purple-100 text-purple-700 border-purple-200" },
  overdue: { label: "เกินกำหนด", color: "bg-red-100 text-red-700 border-red-200" },
  partial_overdue: { label: "ค้างชำระ (เกินกำหนด)", color: "bg-red-100 text-red-700 border-red-200" },
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PurchaseInvoiceList() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const bulk = useBulkDelete({ endpoint: "/api/purchase-invoices/bulk-delete", queryKey: ["purchase-invoices"], docLabel: "เอกสารซื้อ", companyId });

  const [searchText, setSearchText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const now = new Date();
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });
  const [journalDoc, setJournalDoc] = useState<{ open: boolean; id: number } | null>(null);
  const [relatedInline, setRelatedInline] = useState<{ open: boolean; id: number } | null>(null);

  const { dateEra, dateFmt } = useDateSettings();

  const { data: apList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/purchase-invoices", companyId, searchText],
    queryFn: async () => {
      if (!companyId) return [];
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.set("search", searchText);
      const res = await fetch(`/api/purchase-invoices?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/purchase-invoices/${id}`);
    },
    onSuccess: () => {
      invalidateDocCaches(queryClient, [["/api/purchase-invoices"]]);
      toast({ title: "ลบเอกสารซื้อสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/purchase-invoices/${id}`, { status });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      toast({ title: "เปลี่ยนสถานะสำเร็จ", variant: "success" as any });
      if (data?.journalResult?.skipped) {
        toast({ title: "ไม่ได้สร้างรายการบัญชี", description: data.journalResult.reason, variant: "destructive" });
      }
    },
  });

  const handleClone = (id: number) => {
    navigate(`/purchases/ap/new?copyFrom=${id}`);
  };

  const branchOptions = Array.from(new Set(apList.map((d: any) => d.sellerBranchId).filter(Boolean))) as string[];

  const filtered = apList.filter((ap: any) => {
    if (filterStatus && filterStatus !== "all" && ap.status !== filterStatus) return false;
    if (filterBranch !== "all" && ap.sellerBranchId !== filterBranch) return false;
    if (dateFrom && ap.apDate && ap.apDate < dateFrom) return false;
    if (dateTo && ap.apDate && ap.apDate > dateTo) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!(ap.apNo || "").toLowerCase().includes(s) && !(ap.vendorName || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const { visibleItems, hasMore, remainingCount, totalCount, showMore } = useShowMore(filtered);

  function toggleExpand(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getPaymentStatus(ap: any): string {
    const total = parseFloat(String(ap.totalAmount || 0));
    const paidAmount = parseFloat(String(ap.paidAmount || 0));
    if (ap.paymentStatus === "paid" || ap.status === "paid") return "paid";
    if (total > 0 && paidAmount > total) return "overpaid";
    const isOverdue = ap.dueDate && new Date(ap.dueDate) < new Date(new Date().toDateString());
    if (ap.paymentStatus === "partial" || ap.status === "partially_paid") return isOverdue ? "partial_overdue" : "partial";
    if (ap.paymentStatus === "unpaid" || ap.paymentStatus === "new" || !ap.paymentStatus) return isOverdue ? "overdue" : "unpaid";
    return ap.paymentStatus;
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6" style={{ color: 'var(--theme-primary)' }} />
            <h1 className="text-2xl font-heading font-medium" data-testid="text-page-title">เอกสารซื้อ</h1>
            <span className="text-sm text-muted-foreground">การซื้อ</span>
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
                <Button variant="outline" data-testid="button-pdf-bulk-import" onClick={() => navigate("/purchases/pdf-bulk-import")} className="h-9 text-sm px-4 rounded-full border-[#fb9678] text-[#fb9678]">
                  <FileText className="h-3.5 w-3.5 mr-1" /> นำเข้า PDF กลุ่ม
                </Button>
                <Button variant="outline" data-testid="button-import" onClick={() => navigate("/purchases/ap/import")} className="h-9 text-sm px-4 rounded-full border-[#05b187] text-[#05b187]">
                  <Upload className="h-3.5 w-3.5 mr-1" /> นำเข้า Excel
                </Button>
                <ListExportButton data={filtered} columns={exportColumns} fileName="เอกสารซื้อ" />
                <Button data-testid="button-create" onClick={() => navigate("/purchases/ap/new")} className="h-9 text-sm px-4">
                  <Plus className="h-3.5 w-3.5 mr-1" /> สร้างเอกสารซื้อ
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">ช่วงวันที่:</span>
                <ThaiDateInput value={dateFrom} onChange={setDateFrom} dateEra={dateEra} dateFmt={dateFmt} className="w-[160px]" data-testid="input-date-from" />
                <span className="text-xs text-muted-foreground">ถึง</span>
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
                      {branchOptions.map((b: string) => (
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
                <p className="text-sm">ยังไม่มีเอกสารซื้อ</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/purchases/ap/new")}>
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader style={{ backgroundColor: '#03c9d7' }}>
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white">
                      <SelectAllCheckbox checked={visibleItems.length > 0 && bulk.selectedIds.size === visibleItems.length} onCheckedChange={(c) => c ? bulk.selectAll(visibleItems.map((ap: any) => ap.id)) : bulk.clearSelection()} />
                    </TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">AP # ⇅</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[280px]">รายละเอียด - {visibleItems.length} รายการ</TableHead>
                    <TableHead className="w-[50px] text-center text-xs font-medium text-white leading-tight px-1">ตรวจ<br/>สอบ</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-medium text-white">ค้างชำระ</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-medium text-white">ยอดรวม</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-medium text-white">สถานะ</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((ap: any, idx: number) => {
                    const st = STATUS_MAP[ap.status] || { label: ap.status || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock };
                    const StIcon = st.icon;
                    const isExpanded = expandedRows.has(ap.id);
                    const paymentStatus = getPaymentStatus(ap);
                    const ps = PAYMENT_STATUS_MAP[paymentStatus] || { label: paymentStatus || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200" };
                    return (
                      <Fragment key={ap.id}>
                        <TableRow data-testid={`row-ap-${ap.id}`} className={`hover:bg-slate-50/50 border-b ${bulk.selectedIds.has(ap.id) ? "bg-red-50/50" : ""}`}>
                          <TableCell className="text-center py-3">
                            <RowCheckbox id={ap.id} checked={bulk.selectedIds.has(ap.id)} onCheckedChange={() => bulk.toggleSelect(ap.id)} />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <button
                              data-testid={`button-expand-${ap.id}`}
                              onClick={() => toggleExpand(ap.id)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-white ${isExpanded ? "bg-gray-400" : ""}`}
                              style={!isExpanded ? { backgroundColor: 'var(--theme-primary)' } : undefined}
                            >
                              {isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="text-sm">{formatDate(ap.apDate, dateEra, dateFmt)}</TableCell>
                          <TableCell>
                            <button
                              data-testid={`link-ap-${ap.id}`}
                              className="text-sm text-[#03c9d7] hover:underline font-medium"
                              onClick={() => navigate(`/purchases/ap/edit/${ap.id}`)}
                            >
                              {ap.apNo}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-normal">{ap.vendorName}</div>
                            {ap.taxInvoiceRef && <div className="text-xs text-muted-foreground mt-0.5">ใบกำกับภาษี: {ap.taxInvoiceRef}</div>}
                            <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                              {ap.contactPhone && (
                                <span className="flex items-center gap-0.5">
                                  <Phone className="h-3 w-3" /> {ap.contactPhone}
                                </span>
                              )}
                              {ap.contactEmail && (
                                <span className="flex items-center gap-0.5">
                                  <Mail className="h-3 w-3" /> {ap.contactEmail}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-xs">
                              <button
                                data-testid={`button-journal-inline-${ap.id}`}
                                onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: ap.id }); }}
                                className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700 hover:underline"
                              >
                                <BookOpen className="h-3 w-3" /> ดูบัญชี
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                data-testid={`button-related-inline-${ap.id}`}
                                onClick={(e) => { e.stopPropagation(); setRelatedInline({ open: true, id: ap.id }); }}
                                className="flex items-center gap-0.5 text-[#03c9d7] hover:text-[#029baa] hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" /> เอกสารที่เกี่ยวข้อง
                              </button>
                              {ap.attachedUrl && (
                                <>
                                  <span className="text-slate-300">|</span>
                                  <button
                                    data-testid={`button-attach-inline-${ap.id}`}
                                    onClick={() => {
                                      const raw = ap.attachedUrl;
                                      if (!raw) return;
                                      let url = "";
                                      try {
                                        const parsed = JSON.parse(raw);
                                        if (Array.isArray(parsed) && parsed[0]) url = parsed[0].path || parsed[0].objectPath || "";
                                        else if (parsed && (parsed.path || parsed.objectPath)) url = parsed.path || parsed.objectPath;
                                      } catch {
                                        url = raw.split(",")[0]?.trim() || "";
                                      }
                                      if (url) window.open(url, "_blank");
                                    }}
                                    className="flex items-center gap-0.5 text-purple-500 hover:text-purple-700 hover:underline"
                                  >
                                    <Paperclip className="h-3 w-3" /> เอกสารแนบ
                                  </button>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {ap.status === "pending_approval" && (
                              <select
                                data-testid={`select-approval-${ap.id}`}
                                value={ap.status}
                                onChange={e => statusMutation.mutate({ id: ap.id, status: e.target.value })}
                                className="h-7 text-xs border border-amber-300 rounded px-1 bg-amber-50 text-amber-700 w-full cursor-pointer focus:outline-none"
                              >
                                <option value="pending_approval">รออนุมัติ</option>
                                <option value="approved">อนุมัติ</option>
                                <option value="rejected">ปฏิเสธ</option>
                              </select>
                            )}
                          </TableCell>
                          <TableCell>
                            {paymentStatus === "paid" ? (
                              <Badge data-testid={`badge-payment-${ap.id}`} className={`${ps.color} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                                <CreditCard className="h-3 w-3 mr-1" />
                                {ps.label}
                              </Badge>
                            ) : (
                              <button
                                data-testid={`button-pay-${ap.id}`}
                                onClick={() => navigate(`/finance/ap-billing?apId=${ap.id}`)}
                                className={`${ps.color} border text-xs py-0.5 px-2.5 font-normal h-6 rounded-full inline-flex items-center cursor-pointer hover:opacity-80 transition-opacity`}
                              >
                                <CreditCard className="h-3 w-3 mr-1" />
                                {ps.label}
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <div className="text-sm font-normal">{fmt(ap.totalAmount)}</div>
                          </TableCell>
                          <TableCell>
                            <Badge data-testid={`badge-status-${ap.id}`} className={`${st.color} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                              <StIcon className="h-3 w-3 mr-1" />
                              {st.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button data-testid={`button-actions-${ap.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 text-sm">
                                <DropdownMenuItem onClick={() => navigate(`/purchases/ap/edit/${ap.id}`)} className="flex gap-2">
                                  <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.open(`/purchases/ap/edit/${ap.id}`, '_blank')} className="flex gap-2">
                                  <Printer className="h-3.5 w-3.5 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/purchase-invoices/${ap.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/purchase-invoice/${data.shareToken}`;
                                    await navigator.clipboard.writeText(url);
                                    toast({ title: "คัดลอกลิงก์แชร์แล้ว" });
                                  } catch {}
                                }} className="flex gap-2">
                                  <Link2 className="h-3.5 w-3.5" /> ลิงก์สำหรับแชร์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/purchase-invoices/${ap.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/purchase-invoice/${data.shareToken}`;
                                    setTimeout(() => setLineDialog({ open: true, url, docNo: ap.apNo, customerName: ap.vendorName || "" }), 150);
                                  } catch {}
                                }} className="flex gap-2 text-green-600">
                                  <MessageSquare className="h-3.5 w-3.5" /> ส่งผ่าน LINE
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  if (!ap.contactEmail) {
                                    toast({ title: "ไม่มีอีเมลผู้ขาย", variant: "destructive" });
                                    return;
                                  }
                                  try {
                                    const res = await apiRequest("POST", `/api/documents/purchase_invoice/${ap.id}/send-email`, {
                                      recipientEmail: ap.contactEmail,
                                      recipientName: ap.vendorName,
                                    });
                                    const data = await res.json();
                                    toast({ title: data.success !== false ? "ส่งอีเมลสำเร็จ" : "ส่งไม่สำเร็จ", description: data.message, variant: data.success !== false ? ("success" as any) : "destructive" });
                                  } catch (err: any) {
                                    toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
                                  }
                                }} className="flex gap-2" style={{ color: 'var(--theme-primary)' }}>
                                  <MailCheck className="h-3.5 w-3.5" /> ส่งอีเมล
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleClone(ap.id)} className="flex gap-2">
                                  <Copy className="h-3.5 w-3.5" /> คัดลอกเอกสาร
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {ap.status === "draft" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: ap.id, status: "approved" })} className="flex gap-2 text-emerald-600">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ
                                  </DropdownMenuItem>
                                )}
                                {ap.status === "approved" && paymentStatus !== "paid" && (
                                  <DropdownMenuItem onClick={() => navigate(`/finance/ap-billing?apId=${ap.id}`)} className="flex gap-2 text-emerald-600">
                                    <CreditCard className="h-3.5 w-3.5" /> ชำระเงิน
                                  </DropdownMenuItem>
                                )}
                                {ap.status !== "cancelled" && ap.status !== "paid" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: ap.id, status: "cancelled" })} className="flex gap-2 text-gray-500">
                                      <XCircle className="h-3.5 w-3.5" /> ยกเลิก
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (confirm("ยืนยันลบเอกสารซื้อนี้?")) {
                                      deleteMutation.mutate(ap.id);
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
                              <ExpandedDetail doc={ap} />
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
        docType="เอกสารซื้อ"
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
      />
      <BulkDeleteConfirmDialog open={bulk.showConfirm} onOpenChange={bulk.setShowConfirm} count={bulk.selectedIds.size} docLabel="เอกสารซื้อ" onConfirm={bulk.confirmDelete} />
      {journalDoc && (
        <JournalViewDialog open={journalDoc.open} onOpenChange={(open) => { if (!open) setJournalDoc(null); }} docType="purchase-invoice" docId={journalDoc.id} />
      )}
      {relatedInline && (
        <RelatedDocsDialog open={relatedInline.open} onOpenChange={(open) => { if (!open) setRelatedInline(null); }} docType="purchase-invoice" docId={relatedInline.id} />
      )}
    </Layout>
  );
}

function ExpandedDetail({ doc }: { doc: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/purchase-invoices/${doc.id}`, { credentials: "include" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setItems(data.items || []);
          setDetail(data);
        }
      } catch {}
      if (!cancelled) setLoadingItems(false);
    })();
    return () => { cancelled = true; };
  }, [doc.id]);

  const attachedFiles = parseAttachedUrl(detail?.attachedUrl || doc.attachedUrl || "");

  return (
    <div className="space-y-3">
      <div className="flex gap-8 text-sm text-slate-600">
        {doc.vendorTaxId && (
          <div>
            <span className="text-slate-400">|||</span> {doc.vendorTaxId}
          </div>
        )}
        {doc.vendorAddress && (
          <div className="flex-1">
            <span className="text-slate-400">📍</span> {doc.vendorAddress}
          </div>
        )}
        {doc.notes && (
          <div className="text-right">
            <span className="text-slate-500">หมายเหตุ: {doc.notes}</span>
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
                  <TableCell className="text-sm text-center">{it.quantity || it.qty} {it.unit || ""}</TableCell>
                  <TableCell className="text-sm text-center">{it.discount ? `${it.discount}%` : "-"}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{fmt(it.totalPrice || it.total)}</TableCell>
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
            <div className="flex justify-between"><span className="text-slate-500">ราคารวม:</span><span>{fmt(detail.subtotalAmount || detail.subtotal)}</span></div>
            {(detail.discountAmount || 0) > 0 && (
              <div className="flex justify-between text-red-500"><span>ส่วนลด:</span><span>-{fmt(detail.discountAmount)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-slate-500">ก่อน VAT:</span><span>{fmt(detail.beforeVatAmount || detail.subtotalAmount || detail.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">VAT {detail.vatRate || 7}%:</span><span>{fmt(detail.vatAmount)}</span></div>
            <div className="flex justify-between font-medium border-t pt-1 mt-1"><span>ยอดสุทธิ:</span><span>{fmt(detail.totalAmount)}</span></div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          data-testid={`button-journal-${doc.id}`}
          onClick={async () => {
            try {
              const res = await fetch(`/api/journal-entries/by-source/purchase-invoice/${doc.id}`, { credentials: "include" });
              if (res.ok) {
                const j = await res.json();
                if (j?.id) navigate(`/journal/edit/${j.id}`);
              }
            } catch {}
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors"
          style={{ color: 'var(--theme-primary)', borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)', backgroundColor: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--theme-primary) 10%, transparent)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Edit2 className="w-3.5 h-3.5" />
          แก้ไขการลงบัญชี
        </button>
        <button
          data-testid={`button-related-${doc.id}`}
          onClick={() => setRelatedOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-[#03c9d7]/30 text-[#03c9d7] hover:bg-[#03c9d7]/10 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          เอกสารที่เกี่ยวข้อง
        </button>
      </div>

      {attachedFiles.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Paperclip className="w-3.5 h-3.5 text-slate-400" />
          {attachedFiles.map((file, idx) => (
            <a
              key={idx}
              href={file.path}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-purple-600 hover:underline bg-purple-50 border border-purple-200 rounded-full px-2.5 py-1"
              data-testid={`attachment-file-${doc.id}-${idx}`}
            >
              <FileDown className="w-3 h-3" />
              แนบ {idx + 1}
            </a>
          ))}
        </div>
      )}

      <RelatedDocsDialog open={relatedOpen} onOpenChange={setRelatedOpen} docType="purchase-invoice" docId={doc.id} />
    </div>
  );
}
