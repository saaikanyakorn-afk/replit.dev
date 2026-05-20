import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { useShowMore } from "@/hooks/use-show-more";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import {
  Search, Plus, FileText, Edit2, Trash2,
  CheckCircle2, Clock, AlertCircle, MoreHorizontal,
  Copy, Link2, MessageSquare, Printer, Minus,
  BookOpen, ExternalLink, CreditCard, DollarSign,
  XCircle, Send, Phone, Mail, MailCheck,
  Calendar as CalendarIcon, Paperclip, FileDown
} from "lucide-react";
import LineSendDialog from "@/components/line-send-dialog";
import SendEmailDialog from "@/components/send-email-dialog";
import JournalViewDialog from "@/components/journal-view-dialog";
import RelatedDocsDialog from "@/components/related-docs-dialog";
import { parseAttachedUrl } from "@/components/multi-file-attachment";
import AttachmentViewDialog from "@/components/attachment-view-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { apiRequest, getShareBaseUrl } from "@/lib/queryClient";
import { formatDate } from "@/lib/format";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import type { SalesOrder } from "@shared/schema";
import { toLocalDateStr } from "@/lib/utils";
import ListExportButton from "@/components/list-export-button";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { BulkDeleteButton, BulkDeleteConfirmDialog, SelectAllCheckbox, RowCheckbox } from "@/components/bulk-delete-bar";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  new: { label: "ใหม่", color: "bg-red-100 text-red-600 border-red-200", icon: FileText },
  email: { label: "ส่งอีเมล", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Mail },
  sent: { label: "ส่งแล้ว", color: "bg-[var(--theme-primary-light)] text-[var(--theme-primary)] border-[var(--theme-primary)]/20", icon: Send },
  partial: { label: "บางส่วน", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  success: { label: "สำเร็จ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  forced_success: { label: "ปิดบังคับ", color: "bg-emerald-200 text-emerald-800 border-emerald-300", icon: CheckCircle2 },
  cancel: { label: "ยกเลิก", color: "bg-slate-100 text-slate-500 border-slate-200", icon: XCircle },
  confirmed: { label: "ยืนยัน", color: "bg-purple-100 text-purple-700 border-purple-200", icon: CheckCircle2 },
  rejected: { label: "ปฏิเสธ", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  pending_approval: { label: "รออนุมัติ", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  partially_paid: { label: "ชำระบางส่วน", color: "bg-amber-100 text-amber-700 border-amber-200", icon: DollarSign },
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

export default function SalesOrderList() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchText, setSearchText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || params.get("orderNo") || "";
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [relatedDoc, setRelatedDoc] = useState<{ open: boolean; id: number; docNo: string } | null>(null);
  const [journalDoc, setJournalDoc] = useState<{ open: boolean; id: number } | null>(null);
  const [attachDoc, setAttachDoc] = useState<{ open: boolean; attachedUrl: string; docNo: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; id: number; email: string; docNo: string; customerName: string } | null>(null);
  const [relatedDialog, setRelatedDialog] = useState<{ open: boolean; id: number }>({ open: false, id: 0 });
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const bulk = useBulkDelete({ endpoint: "/api/sales-orders/bulk-delete", queryKey: "/api/sales-orders", docLabel: "ใบสั่งขาย", companyId });
  const { dateEra, dateFmt } = useDateSettings();

  const { data: orders = [], isLoading } = useQuery<SalesOrder[]>({
    queryKey: ["/api/sales-orders", companyId, searchText],
    queryFn: async () => {
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.append("search", searchText);
      const res = await fetch(`/api/sales-orders?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/sales-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      toast({ title: "ลบใบสั่งขายสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/sales-orders/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      toast({ title: "เปลี่ยนสถานะสำเร็จ", variant: "success" as any });
    },
  });

  const handleClone = (id: number) => {
    navigate(`/sales/order/new?copyFrom=${id}`);
  };

  const filtered = orders.filter((q: any) => {
    if (filterStatus && filterStatus !== "all" && q.status !== filterStatus) return false;
    if (filterBranch !== "all" && q.sellerBranchId !== filterBranch) return false;
    if (dateFrom && q.orderDate && q.orderDate < dateFrom) return false;
    if (dateTo && q.orderDate && q.orderDate > dateTo) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!(q.orderNo || "").toLowerCase().includes(s) && !(q.customerName || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const { visibleItems, hasMore, remainingCount, totalCount, showMore } = useShowMore(filtered);

  const branchOptions = Array.from(new Set(orders.map((q: any) => q.sellerBranchId).filter(Boolean))) as string[];

  const exportColumns = [
    { header: "วันที่", key: "orderDate", width: 14 },
    { header: "เลขที่", key: "orderNo", width: 20 },
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

  function getPaymentStatus(order: any): string {
    const total = parseFloat(String(order.totalAmount || 0));
    const paidAmount = parseFloat(String(order.paidAmount || 0));
    if (order.paymentStatus === "paid" || order.status === "paid") return "paid";
    if (total > 0 && paidAmount > total) return "overpaid";
    const isOverdue = order.dueDate && new Date(order.dueDate) < new Date(new Date().toDateString());
    if (order.paymentStatus === "partial" || order.status === "partially_paid") return isOverdue ? "partial_overdue" : "partial";
    return isOverdue ? "overdue" : "unpaid";
  }

  return (
    <Layout>
      <div className="space-y-4" data-testid="sales-order-list-page">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-[var(--theme-primary)]" />
            <h1 className="text-2xl font-heading font-medium" data-testid="text-page-title">ใบสั่งขาย</h1>
            <span className="text-sm text-muted-foreground">รายได้</span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded px-3 py-1.5">
          <Badge className="bg-red-500 text-white text-sm">Analysis</Badge>
          <div className="relative flex-1">
            <Input
              data-testid="input-search"
              placeholder="เลขใบสั่งขาย ข้อมูลลูกค้า และอื่นๆ"
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
                <ListExportButton data={filtered} columns={exportColumns} fileName="ใบสั่งขาย" />
                <Button data-testid="button-create-order" onClick={() => navigate("/sales/order/new")} className="h-9 text-sm px-4">
                  <Plus className="h-3.5 w-3.5 mr-1" /> สร้างใบสั่งขาย
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
                <p className="text-sm">ยังไม่มีใบสั่งขาย</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/sales/order/new")} data-testid="button-create-empty">
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-[var(--theme-primary)]">
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white">
                      <SelectAllCheckbox checked={filtered.length > 0 && bulk.selectedIds.size === filtered.length} onCheckedChange={(c) => c ? bulk.selectAll(filtered.map((o: any) => o.id)) : bulk.clearSelection()} />
                    </TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">SO # ⇅</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[280px]">รายละเอียด - {filtered.length} รายการ</TableHead>
                    <TableHead className="w-[50px] text-center text-xs font-medium text-white leading-tight px-1">ตรวจ<br/>สอบ</TableHead>
                    <TableHead className="w-[60px] text-center text-sm font-medium text-white">การส่งของ</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-medium text-white">ค้างชำระ</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-medium text-white">สถานะ</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((order: any, idx: number) => {
                    const st = STATUS_MAP[order.status] || { label: order.status || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200", icon: AlertCircle };
                    const StIcon = st.icon;
                    const isExpanded = expandedRows.has(order.id);
                    const paymentStatus = getPaymentStatus(order);
                    const ps = PAYMENT_STATUS_MAP[paymentStatus] || { label: paymentStatus || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200" };
                    return (
                      <Fragment key={order.id}>
                        <TableRow data-testid={`row-order-${order.id}`} className={`hover:bg-slate-50/50 border-b align-top ${bulk.selectedIds.has(order.id) ? "bg-red-50/50" : ""}`}>
                          <TableCell className="text-center pt-3">
                            <RowCheckbox id={order.id} checked={bulk.selectedIds.has(order.id)} onCheckedChange={() => bulk.toggleSelect(order.id)} />
                          </TableCell>
                          <TableCell className="text-center pt-3">
                            <button
                              data-testid={`button-expand-${order.id}`}
                              onClick={() => toggleExpand(order.id)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-white ${isExpanded ? "bg-gray-400" : "bg-[#05b187]"}`}
                            >
                              {isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground pt-3">{idx + 1}</TableCell>
                          <TableCell className="text-sm pt-3">
                            {formatDate(order.orderDate, dateEra, dateFmt)}
                          </TableCell>
                          <TableCell className="pt-3">
                            <button
                              data-testid={`text-order-no-${order.id}`}
                              className="text-sm text-[#e8734e] hover:underline font-medium"
                              onClick={() => navigate(`/sales/order/edit/${order.id}`)}
                            >
                              {order.orderNo || `SO-ร่าง-${String(order.id).padStart(3, "0")}`}
                            </button>
                            {order.refDoc && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {order.refDoc.includes("QO") && <span>QO: <span className="text-blue-600">{order.refDoc}</span></span>}
                                {!order.refDoc.includes("QO") && <span>REF: {order.refDoc}</span>}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="pt-2.5 pb-2.5">
                            <div className="text-sm">
                              {order.customerCode && <span className="text-blue-600 font-medium">[ {order.customerCode} ]</span>}{" "}
                              <span className="font-semibold text-slate-800">{order.customerName}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                              {order.contactEmail && (
                                <span className="flex items-center gap-0.5">
                                  <Mail className="h-3 w-3" /> {order.contactEmail}
                                </span>
                              )}
                              {order.customerAddress && (
                                <span className="flex items-center gap-0.5 text-blue-500 cursor-pointer hover:underline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customerAddress)}`, '_blank')}>
                                  <ExternalLink className="h-3 w-3" /> ดูแผนที่
                                </span>
                              )}
                              <span className="flex items-center gap-0.5 text-slate-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: order.id }); }}>
                                <BookOpen className="h-3 w-3" /> ดูบัญชี
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="flex items-center gap-0.5 text-[#03c9d7] cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setRelatedDoc({ open: true, id: order.id, docNo: order.orderNo }); }}>
                                <FileText className="h-3 w-3" /> เอกสารที่เกี่ยวข้อง
                              </span>
                              {order.attachedUrl && (
                                <>
                                  <span className="text-slate-400">|</span>
                                  <span className="flex items-center gap-0.5 text-purple-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setAttachDoc({ open: true, attachedUrl: order.attachedUrl, docNo: order.orderNo }); }}>
                                    <Paperclip className="h-3 w-3" /> เอกสารแนบ
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="pt-3">
                            {(() => {
                              const approvalMap: Record<string, { label: string; cls: string }> = {
                                new: { label: "ใหม่", cls: "bg-slate-50 text-slate-600 border-slate-200" },
                                confirmed: { label: "ยืนยัน", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                sent: { label: "ส่งแล้ว", cls: "bg-blue-50 text-blue-600 border-blue-200" },
                                partial: { label: "บางส่วน", cls: "bg-amber-50 text-amber-600 border-amber-300" },
                                success: { label: "สำเร็จ", cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
                                cancel: { label: "ยกเลิก", cls: "bg-red-50 text-red-600 border-red-200" },
                              };
                              const a = approvalMap[order.status] || { label: "-", cls: "bg-slate-50 text-slate-500 border-slate-200" };
                              return (
                                <Badge data-testid={`badge-approval-${order.id}`} className={`${a.cls} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                                  {a.label}
                                </Badge>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="pt-3 text-xs text-muted-foreground">
                            {order.shippingProvider || "-"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums pt-2.5">
                            <div className="text-xs text-muted-foreground">
                              {fmt((parseFloat(String(order.totalAmount || 0)) - parseFloat(String(order.convertedAmount || 0))).toString())}
                            </div>
                            <div className="text-sm font-medium" data-testid={`text-amount-${order.id}`}>
                              {fmt(order.totalAmount)}
                              {order.currencyCode && order.currencyCode !== "THB" && (
                                <span className="text-[10px] ml-1 text-[var(--theme-primary)]">{order.currencyCode}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="pt-3">
                            <Badge className={`${st.color} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                              {st.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-actions-${order.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem className="text-sm gap-2" onClick={() => navigate(`/sales/order/edit/${order.id}`)}>
                                  <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-sm gap-2" onClick={() => handleClone(order.id)}>
                                  <Copy className="h-3.5 w-3.5" /> คัดลอกเอกสาร
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-sm gap-2" onClick={() => navigate(`/sales/order/pdf/${order.id}`)}>
                                  <Printer className="h-3.5 w-3.5 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-sm gap-2" onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/sales-orders/${order.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/order/${data.shareToken}`;
                                    try {
                                      await navigator.clipboard.writeText(url);
                                      toast({ title: "คัดลอกลิงก์แชร์แล้ว", description: url });
                                    } catch {
                                      window.prompt("คัดลอกลิงก์ด้านล่าง:", url);
                                    }
                                  } catch (err: any) {
                                    toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
                                  }
                                }}>
                                  <Link2 className="h-3.5 w-3.5" /> ลิงก์สำหรับแชร์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/sales-orders/${order.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/order/${data.shareToken}`;
                                    setTimeout(() => setLineDialog({ open: true, url, docNo: order.orderNo, customerName: order.customerName || "" }), 150);
                                  } catch {}
                                }} className="flex gap-2 text-green-600">
                                  <MessageSquare className="h-3.5 w-3.5" /> ส่งผ่าน LINE
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEmailDialog({ open: true, id: order.id, email: order.contactEmail || "", docNo: order.orderNo, customerName: order.customerName || "" })} className="flex gap-2" style={{ color: "var(--theme-primary)" }}>
                                  <MailCheck className="h-3.5 w-3.5" /> ส่งอีเมล
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem data-testid={`button-journal-${order.id}`} className="text-sm gap-2" onClick={async () => {
                                  const res = await fetch(`/api/journal-entries/by-source/sales_order/${order.id}`, { credentials: 'include' });
                                  if (res.ok) { const j = await res.json(); if (j?.id) navigate('/journal/edit/' + j.id); }
                                }}>
                                  <Edit2 className="h-3.5 w-3.5 text-[var(--theme-primary)]" /> แก้ไขการลงบัญชี
                                </DropdownMenuItem>
                                <DropdownMenuItem data-testid={`button-related-${order.id}`} className="text-sm gap-2" onClick={() => setRelatedDialog({ open: true, id: order.id })}>
                                  <ExternalLink className="h-3.5 w-3.5 text-[#03c9d7]" /> เอกสารที่เกี่ยวข้อง
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {order.paymentStatus !== "paid" && (
                                  <DropdownMenuItem className="text-sm gap-2"
                                    onClick={() => statusMutation.mutate({ id: order.id, status: "paid" })}
                                  >
                                    <CreditCard className="h-3.5 w-3.5 text-emerald-600" /> บันทึกชำระเงิน
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="text-sm gap-2"
                                  onClick={() => navigate(`/sales/invoice/new?fromSalesOrder=${order.id}`)}
                                >
                                  <FileText className="h-3.5 w-3.5 text-amber-600" /> ออกใบแจ้งหนี้
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-sm gap-2"
                                  onClick={() => navigate(`/sales/tax-invoice/new?fromSalesOrder=${order.id}`)}
                                >
                                  <FileText className="h-3.5 w-3.5 text-emerald-600" /> สร้างใบกำกับภาษี
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (confirm("ยืนยันลบใบสั่งขายนี้?")) {
                                      deleteMutation.mutate(order.id);
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
                          <TableRow className="bg-slate-50/70">
                            <TableCell colSpan={11} className="py-3 px-6">
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">ยอดก่อนภาษี:</span>{" "}
                                  <span className="font-medium">{fmt(order.subtotal)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">ภาษี:</span>{" "}
                                  <span className="font-medium">{fmt(order.vatAmount)}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">หมายเหตุ:</span>{" "}
                                  <span>{order.notes || "-"}</span>
                                </div>
                              </div>
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

            {orders.length > 0 && (
              <div className="flex items-center justify-between p-4 border-t bg-slate-50/50">
                <div className="text-sm text-muted-foreground">
                  แสดง {filtered.length} รายการ
                </div>
                <div className="text-sm font-medium text-slate-700">
                  รวมมูลค่า: {fmt(filtered.reduce((s: number, o: any) => s + parseFloat(o.totalAmount || "0"), 0))} บาท
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <LineSendDialog
        open={lineDialog.open}
        onOpenChange={(open) => setLineDialog(prev => ({ ...prev, open }))}
        shareUrl={lineDialog.url}
        docType="ใบสั่งขาย"
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
      />
      <RelatedDocsDialog open={relatedDialog.open} onOpenChange={(open) => setRelatedDialog(prev => ({ ...prev, open }))} docType="sales_order" docId={relatedDialog.id} />
      {relatedDoc && (
        <RelatedDocsDialog open={relatedDoc.open} onOpenChange={(open) => { if (!open) setRelatedDoc(null); }} docType="sales_order" docId={relatedDoc.id} />
      )}
      {journalDoc && (
        <JournalViewDialog open={journalDoc.open} onOpenChange={(open) => { if (!open) setJournalDoc(null); }} docType="sales_order" docId={journalDoc.id} />
      )}
      {attachDoc && (
        <AttachmentViewDialog open={attachDoc.open} onOpenChange={(open) => { if (!open) setAttachDoc(null); }} attachedUrl={attachDoc.attachedUrl} docNo={attachDoc.docNo} />
      )}
      <BulkDeleteConfirmDialog open={bulk.showConfirm} onOpenChange={bulk.setShowConfirm} count={bulk.selectedIds.size} docLabel="ใบสั่งขาย" onConfirm={bulk.confirmDelete} />
      {emailDialog && (
        <SendEmailDialog
          open={emailDialog.open}
          onOpenChange={(open) => { if (!open) setEmailDialog(null); }}
          defaultEmail={emailDialog.email}
          docLabel="ใบสั่งขาย"
          docNo={emailDialog.docNo}
          onConfirm={async (email) => {
            const res = await apiRequest("POST", `/api/documents/sales_order/${emailDialog.id}/send-email`, { recipientEmail: email, recipientName: emailDialog.customerName });
            const data = await res.json();
            toast({ title: data.success !== false ? "ส่งอีเมลสำเร็จ" : "ส่งไม่สำเร็จ", description: data.message, variant: data.success !== false ? ("success" as any) : "destructive" });
            if (data.success !== false) setEmailDialog(null);
          }}
        />
      )}
    </Layout>
  );
}
