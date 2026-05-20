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
  Search, Plus, FileText, Edit2, Trash2, Eye, ChevronDown, ChevronRight,
  CheckCircle2, Clock, Send, Copy, Link2, MessageSquare,
  AlertCircle, FileCheck, Minus, Phone, Mail, MailCheck,
  ShoppingCart, FileOutput, Receipt, Printer, ArrowRightCircle, XCircle, RotateCcw,
  BookOpen, ExternalLink, Calendar as CalendarIcon, Paperclip, FileDown
} from "lucide-react";
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
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { apiRequest, getShareBaseUrl } from "@/lib/queryClient";
import { formatDate } from "@/lib/format";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import type { Quotation } from "@shared/schema";
import { toLocalDateStr } from "@/lib/utils";
import ListExportButton from "@/components/list-export-button";
import { parseAttachedUrl } from "@/components/multi-file-attachment";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { BulkDeleteButton, BulkDeleteConfirmDialog, SelectAllCheckbox, RowCheckbox } from "@/components/bulk-delete-bar";
import SendEmailDialog from "@/components/send-email-dialog";

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  new: { label: "ใหม่", color: "bg-red-100 text-red-600 border-red-200", icon: FileText },
  email: { label: "ส่งอีเมล", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Mail },
  sent: { label: "ส่งแล้ว", color: "bg-[var(--theme-primary-light)] text-[var(--theme-primary)] border-[var(--theme-primary)]/20", icon: Send },
  partial: { label: "บางส่วน", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  success: { label: "สำเร็จ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  forced_success: { label: "ปิดบังคับ", color: "bg-emerald-200 text-emerald-800 border-emerald-300", icon: CheckCircle2 },
  cancel: { label: "ยกเลิก", color: "bg-slate-100 text-slate-500 border-slate-200", icon: XCircle },
  confirmed: { label: "ยืนยัน", color: "bg-purple-100 text-purple-700 border-purple-200", icon: FileCheck },
  rejected: { label: "ปฏิเสธ", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  pending_approval: { label: "รออนุมัติ", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function QuotationList() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchText, setSearchText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [relatedDoc, setRelatedDoc] = useState<{ open: boolean; id: number; docNo: string } | null>(null);
  const [journalDoc, setJournalDoc] = useState<{ open: boolean; id: number } | null>(null);
  const [attachDoc, setAttachDoc] = useState<{ open: boolean; attachedUrl: string; docNo: string } | null>(null);
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; id: number; email: string; docNo: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const bulk = useBulkDelete({ endpoint: "/api/quotations/bulk-delete", queryKey: "/api/quotations", docLabel: "ใบเสนอราคา", companyId });
  const { dateEra, dateFmt } = useDateSettings();

  const { data: quotations = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/quotations", companyId, searchText],
    queryFn: async () => {
      if (!companyId) return [];
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.set("search", searchText);
      const res = await fetch(`/api/quotations?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/quotations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: "ลบใบเสนอราคาสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/quotations/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({ title: "เปลี่ยนสถานะสำเร็จ", variant: "success" as any });
    },
  });

  const filtered = quotations.filter((q: any) => {
    if (filterStatus && filterStatus !== "all" && q.status !== filterStatus) return false;
    if (filterBranch !== "all" && q.sellerBranchId !== filterBranch) return false;
    if (dateFrom && q.quotationDate && q.quotationDate < dateFrom) return false;
    if (dateTo && q.quotationDate && q.quotationDate > dateTo) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!(q.quotationNo || "").toLowerCase().includes(s) && !(q.customerName || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const { visibleItems, hasMore, remainingCount, totalCount, showMore } = useShowMore(filtered);

  const branchOptions = Array.from(new Set(quotations.map((q: any) => q.sellerBranchId).filter(Boolean))) as string[];

  const exportColumns = [
    { header: "วันที่", key: "quotationDate", width: 14 },
    { header: "เลขที่", key: "quotationNo", width: 20 },
    { header: "ลูกค้า", key: "customerName", width: 25 },
    { header: "ยอดก่อนภาษี", key: "subtotal", width: 16, format: "number" as const },
    { header: "ภาษี", key: "vatAmount", width: 14, format: "number" as const },
    { header: "ยอดรวม", key: "totalAmount", width: 16, format: "number" as const },
    { header: "สถานะ", key: "status", width: 12 },
    { header: "สาขา", key: "sellerBranchId", width: 14 },
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
            <FileText className="h-6 w-6 text-[var(--theme-primary)]" />
            <h1 className="text-2xl font-heading font-medium" data-testid="text-page-title">ใบเสนอราคา</h1>
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
                <ListExportButton data={filtered} columns={exportColumns} fileName="ใบเสนอราคา" />
                <Button data-testid="button-create" onClick={() => navigate("/sales/quote/new")} className="h-9 text-sm px-4">
                  <Plus className="h-3.5 w-3.5 mr-1" /> สร้างใบเสนอราคา
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
                <p className="text-sm">ยังไม่มีใบเสนอราคา</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/sales/quote/new")}>
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-[var(--theme-primary)]">
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white">
                      <SelectAllCheckbox checked={filtered.length > 0 && bulk.selectedIds.size === filtered.length} onCheckedChange={(c) => c ? bulk.selectAll(filtered.map((q: any) => q.id)) : bulk.clearSelection()} />
                    </TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">QO # ⇅</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[280px]">รายละเอียด - {filtered.length} รายการ</TableHead>
                    <TableHead className="w-[60px] text-center text-sm font-medium text-white">ตอบกลับ</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-medium text-white">คงเหลือ/มูลค่า</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-medium text-white">สถานะ</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((qo: any, idx: number) => {
                    const st = STATUS_MAP[qo.status] || STATUS_MAP.draft;
                    const StIcon = st.icon;
                    const isExpanded = expandedRows.has(qo.id);
                    return (
                      <Fragment key={qo.id}>
                        <TableRow data-testid={`row-quotation-${qo.id}`} className={`hover:bg-slate-50/50 border-b ${bulk.selectedIds.has(qo.id) ? "bg-red-50/50" : ""}`}>
                          <TableCell className="text-center py-3">
                            <RowCheckbox id={qo.id} checked={bulk.selectedIds.has(qo.id)} onCheckedChange={() => bulk.toggleSelect(qo.id)} />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <button
                              data-testid={`button-expand-${qo.id}`}
                              onClick={() => toggleExpand(qo.id)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-white ${isExpanded ? "bg-gray-400" : "bg-[#fec90f]"}`}
                            >
                              {isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="text-sm">{formatDate(qo.quotationDate, dateEra, dateFmt)}</TableCell>
                          <TableCell>
                            <button
                              data-testid={`link-quotation-${qo.id}`}
                              className="text-sm text-[#e8734e] hover:underline font-medium"
                              onClick={() => navigate(`/sales/quote/edit/${qo.id}`)}
                            >
                              {qo.quotationNo}
                            </button>
                          </TableCell>
                          <TableCell className="pt-2.5 pb-2.5">
                            <div className="text-sm">
                              {qo.customerCode && <span className="text-blue-600 font-medium">[ {qo.customerCode} ]</span>}{" "}
                              <span className="font-semibold text-slate-800">{qo.customerName}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                              {qo.refDoc && <span>Ref: {qo.refDoc}</span>}
                              {qo.customerAddress && (
                                <span className="flex items-center gap-0.5 text-blue-500 cursor-pointer hover:underline" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(qo.customerAddress)}`, '_blank')}>
                                  <ExternalLink className="h-3 w-3" /> ดูแผนที่
                                </span>
                              )}
                              <span className="flex items-center gap-0.5 text-slate-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: qo.id }); }}>
                                <BookOpen className="h-3 w-3" /> ดูบัญชี
                              </span>
                              <span className="text-slate-400">|</span>
                              <span className="flex items-center gap-0.5 text-[#03c9d7] cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setRelatedDoc({ open: true, id: qo.id, docNo: qo.quotationNo }); }}>
                                <FileText className="h-3 w-3" /> เอกสารที่เกี่ยวข้อง
                              </span>
                              {qo.attachedUrl && (
                                <>
                                  <span className="text-slate-400">|</span>
                                  <span className="flex items-center gap-0.5 text-purple-500 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setAttachDoc({ open: true, attachedUrl: qo.attachedUrl, docNo: qo.quotationNo }); }}>
                                    <Paperclip className="h-3 w-3" /> เอกสารแนบ
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="pt-3">
                            {qo.customerResponse ? (
                              <Badge data-testid={`badge-response-${qo.id}`} className={`border text-xs py-0.5 px-2.5 font-normal h-6 ${qo.customerResponse === "confirmed" ? "bg-emerald-50 text-emerald-600 border-emerald-200" : qo.customerResponse === "cancelled" ? "bg-red-50 text-red-600 border-red-200" : "bg-amber-50 text-amber-600 border-amber-200"}`}>
                                {qo.customerResponse === "confirmed" ? "ยืนยัน" : qo.customerResponse === "cancelled" ? "ปฏิเสธ" : "ขอแก้ไข"}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">รอตอบกลับ</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums pt-2.5">
                            <div className="text-xs text-muted-foreground">
                              {fmt((parseFloat(String(qo.totalAmount || 0)) - parseFloat(String(qo.convertedAmount || 0))).toString())}
                            </div>
                            <div className="text-sm font-medium">
                              {fmt(qo.totalAmount)}
                              {qo.currencyCode && qo.currencyCode !== "THB" && (
                                <span className="text-[10px] ml-1 text-[var(--theme-primary)]">{qo.currencyCode}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge data-testid={`badge-status-${qo.id}`} className={`${st.color} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                              <StIcon className="h-3 w-3 mr-1" />
                              {st.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button data-testid={`button-actions-${qo.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" side="bottom" sideOffset={4} className="w-60 text-sm max-h-[70vh] overflow-y-auto">
                                <DropdownMenuItem data-testid={`button-edit-${qo.id}`} onClick={() => navigate(`/sales/quote/edit/${qo.id}`)} className="flex gap-2 text-blue-600 font-medium">
                                  <Edit2 className="h-4 w-4" /> แก้ไข
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />

                                <DropdownMenuLabel className="text-xs text-slate-400 font-normal">เปลี่ยนสถานะ</DropdownMenuLabel>
                                {qo.status !== "approved" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: qo.id, status: "approved" })} className="flex gap-2 text-emerald-600">
                                    <CheckCircle2 className="h-4 w-4" /> อนุมัติ
                                  </DropdownMenuItem>
                                )}
                                {qo.status === "approved" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: qo.id, status: "pending_approval" })} className="flex gap-2 text-amber-600">
                                    <Clock className="h-4 w-4" /> ขออนุมัติ
                                  </DropdownMenuItem>
                                )}
                                {qo.status !== "sent" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: qo.id, status: "sent" })} className="flex gap-2 text-[var(--theme-primary)]">
                                    <Send className="h-4 w-4" /> ส่งแล้ว
                                  </DropdownMenuItem>
                                )}
                                {qo.status !== "rejected" && qo.status !== "expired" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: qo.id, status: "rejected" })} className="flex gap-2 text-red-600">
                                    <XCircle className="h-4 w-4" /> ปฏิเสธ
                                  </DropdownMenuItem>
                                )}
                                {qo.status !== "expired" && qo.status !== "rejected" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: qo.id, status: "expired" })} className="flex gap-2 text-amber-600">
                                    <Clock className="h-4 w-4" /> หมดอายุ
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigate(`/sales/quote/new?clone=${qo.id}`)} className="flex gap-2">
                                  <Copy className="h-4 w-4" /> คัดลอกเอกสาร
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />

                                <DropdownMenuItem onClick={() => setEmailDialog({ open: true, id: qo.id, email: (qo as any).contactEmail || "", docNo: (qo as any).quotationNo || "" })} className="flex gap-2 text-[var(--theme-primary)]">
                                  <MailCheck className="h-4 w-4" /> ส่งอีเมลใบเสนอราคา
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/quotations/${qo.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/quote/${data.shareToken}`;
                                    try {
                                      await navigator.clipboard.writeText(url);
                                      toast({ title: "คัดลอกลิงก์แชร์แล้ว", description: url });
                                    } catch {
                                      window.prompt("คัดลอกลิงก์ด้านล่าง:", url);
                                    }
                                  } catch (err: any) {
                                    toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
                                  }
                                }} className="flex gap-2">
                                  <Link2 className="h-4 w-4" /> แชร์ลิงก์เอกสาร
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/quotations/${qo.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/quote/${data.shareToken}`;
                                    setTimeout(() => setLineDialog({ open: true, url, docNo: qo.quotationNo, customerName: qo.customerName || "" }), 150);
                                  } catch {}
                                }} className="flex gap-2 text-green-600">
                                  <MessageSquare className="h-4 w-4" /> ส่งผ่าน LINE
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => navigate(`/sales/quote/pdf/${qo.id}`)} className="flex gap-2">
                                  <Printer className="h-4 w-4 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />

                                <DropdownMenuLabel className="text-xs text-slate-400 font-normal">ออกเอกสาร</DropdownMenuLabel>
                                {qo.status === "pending_approval" && (
                                  <div className="px-2 py-1.5 text-xs text-amber-600 italic">
                                    รออนุมัติ — ไม่สามารถสร้างเอกสารต่อได้
                                  </div>
                                )}
                                {qo.status !== "pending_approval" && (
                                  <DropdownMenuItem onClick={() => navigate(`/sales/order/new?fromQuote=${qo.id}`)} className="flex gap-2 text-[var(--theme-primary)]">
                                    <ShoppingCart className="h-4 w-4" /> ออกใบสั่งขาย (SO)
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (qo.status !== "approved") {
                                      toast({ title: "ยังไม่สามารถออกใบแจ้งหนี้ได้", description: "ต้องอนุมัติใบเสนอราคาก่อน", variant: "destructive" });
                                      return;
                                    }
                                    navigate(`/sales/invoice/new?fromQuotation=${qo.id}`);
                                  }}
                                  className={`flex gap-2 ${qo.status !== "approved" ? "text-slate-400" : "text-amber-600"}`}
                                >
                                  <FileOutput className="h-4 w-4" /> ออกใบแจ้งหนี้
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (qo.status !== "approved") {
                                      toast({ title: "ยังไม่สามารถออกใบกำกับภาษีได้", description: "ต้องอนุมัติใบเสนอราคาก่อน", variant: "destructive" });
                                      return;
                                    }
                                    navigate(`/sales/tax-invoice/new?fromQuotation=${qo.id}`);
                                  }}
                                  className={`flex gap-2 ${qo.status !== "approved" ? "text-slate-400" : "text-emerald-600"}`}
                                >
                                  <Receipt className="h-4 w-4" /> ออกใบกำกับภาษี
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (confirm("ยืนยันลบใบเสนอราคานี้?")) {
                                      deleteMutation.mutate(qo.id);
                                    }
                                  }}
                                  className="flex gap-2 text-red-500"
                                >
                                  <Trash2 className="h-4 w-4" /> ลบเอกสาร
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>

                        {isExpanded && (
                          <TableRow className="bg-slate-50/80">
                            <TableCell colSpan={10} className="p-4">
                              <ExpandedDetail qo={qo} />
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
        docType="ใบเสนอราคา"
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
      />
      {relatedDoc && (
        <RelatedDocsDialog open={relatedDoc.open} onOpenChange={(open) => { if (!open) setRelatedDoc(null); }} docType="quotation" docId={relatedDoc.id} />
      )}
      {journalDoc && (
        <JournalViewDialog open={journalDoc.open} onOpenChange={(open) => { if (!open) setJournalDoc(null); }} docType="quotation" docId={journalDoc.id} />
      )}
      {attachDoc && (
        <AttachmentViewDialog open={attachDoc.open} onOpenChange={(open) => { if (!open) setAttachDoc(null); }} attachedUrl={attachDoc.attachedUrl} docNo={attachDoc.docNo} />
      )}
      <BulkDeleteConfirmDialog open={bulk.showConfirm} onOpenChange={bulk.setShowConfirm} count={bulk.selectedIds.size} docLabel="ใบเสนอราคา" onConfirm={bulk.confirmDelete} />
      {emailDialog && (
        <SendEmailDialog
          open={emailDialog.open}
          onOpenChange={(open) => { if (!open) setEmailDialog(null); }}
          defaultEmail={emailDialog.email}
          docLabel="ใบเสนอราคา"
          docNo={emailDialog.docNo}
          onConfirm={async (email) => {
            const res = await apiRequest("POST", `/api/quotations/${emailDialog.id}/send-email`, { email });
            const data = await res.json();
            if (data.success) {
              toast({ title: "ส่งอีเมลสำเร็จ", description: data.message, variant: "success" as any });
              queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
              setEmailDialog(null);
            } else {
              toast({ title: "ส่งไม่สำเร็จ", description: data.message || "กรุณาตรวจสอบอีเมลลูกค้า", variant: "destructive" });
            }
          }}
        />
      )}
    </Layout>
  );
}

function ExpandedDetail({ qo }: { qo: any }) {
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [, navigate] = useLocation();
  const [relatedOpen, setRelatedOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/quotations/${qo.id}`, { credentials: "include" });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setItems(data.items || []);
          setDetail(data);
        }
      } catch {}
      if (!cancelled) setLoadingItems(false);
    })();
    return () => { cancelled = true; };
  }, [qo.id]);

  return (
    <div className="space-y-3">
      <div className="flex gap-8 text-sm text-slate-600">
        {qo.customerTaxId && (
          <div>
            <span className="text-slate-400">|||</span> {qo.customerTaxId}
          </div>
        )}
        {qo.customerAddress && (
          <div className="flex-1">
            <span className="text-slate-400">📍</span> {qo.customerAddress}
          </div>
        )}
        {qo.notes && (
          <div className="text-right">
            <span className="text-slate-500">หมายเหตุ:</span><br/>
            <span className="text-slate-500">เงื่อนไข: {qo.paymentTerms || "-"}</span>
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
                <TableHead className="text-white text-sm font-medium w-24 text-right">ก่อนภาษี</TableHead>
                <TableHead className="text-white text-sm font-medium w-24 text-right">รวม</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it: any, i: number) => (
                <TableRow key={i} className="h-10 hover:bg-sky-50/50">
                  <TableCell className="text-sm">{it.productCode || "-"}</TableCell>
                  <TableCell className="text-sm">{it.productName}</TableCell>
                  <TableCell className="text-sm text-right">{fmt(it.unitPrice)}</TableCell>
                  <TableCell className="text-sm text-center">{(() => { const n = Number(it.qty); if (isNaN(n)) return "0"; return n % 1 === 0 ? String(Math.round(n)) : parseFloat(n.toFixed(4)).toString(); })()}</TableCell>
                  <TableCell className="text-sm text-center">{fmt(it.discount)}</TableCell>
                  <TableCell className="text-sm text-right">{fmt(it.total)}</TableCell>
                  <TableCell className="text-sm text-right font-semibold">{fmt(it.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {loadingItems && <div className="text-sm text-slate-400 py-2">กำลังโหลดรายการ...</div>}

      {(detail?.customerResponse || detail?.customerResponseNote) && (
        <div className="border rounded p-3 bg-amber-50/80 border-amber-200 text-sm space-y-1">
          <div className="flex items-center gap-2 font-medium text-amber-800">
            <AlertCircle className="h-3.5 w-3.5" />
            การตอบกลับจากลูกค้า:
            {detail.customerResponse === "confirmed" && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs py-0 px-2 h-5">ยืนยัน</Badge>}
            {detail.customerResponse === "cancelled" && <Badge className="bg-red-100 text-red-700 border-red-200 text-xs py-0 px-2 h-5">ปฏิเสธ</Badge>}
            {detail.customerResponse === "request_edit" && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs py-0 px-2 h-5">ขอแก้ไข</Badge>}
          </div>
          {detail.customerResponseNote && (
            <div className="text-slate-600 pl-5">"{detail.customerResponseNote}"</div>
          )}
          {detail.customerRespondedAt && (
            <div className="text-slate-400 pl-5 text-xs">ตอบกลับเมื่อ {new Date(detail.customerRespondedAt).toLocaleString("th-TH")}</div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>สร้างโดย {qo.createdByName || "-"} [{qo.createdBy || "-"}] - {qo.createdAt ? new Date(qo.createdAt).toLocaleString("th-TH") : "-"}</span>
        <span>แก้ไขโดย {detail?.updatedByName || qo.updatedByName || "-"} [{detail?.updatedBy || qo.updatedBy || "-"}] - {qo.updatedAt ? new Date(qo.updatedAt).toLocaleString("th-TH") : "-"}</span>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <button
          data-testid={`button-journal-${qo.id}`}
          onClick={async () => {
            const res = await fetch(`/api/journal-entries/by-source/quotation/${qo.id}`, { credentials: 'include' });
            if (res.ok) { const j = await res.json(); if (j?.id) navigate('/journal/edit/' + j.id); }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-[var(--theme-primary)]/30 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10 transition-colors"
        >
          <Edit2 className="w-3.5 h-3.5" />
          แก้ไขการลงบัญชี
        </button>
        <button
          data-testid={`button-related-${qo.id}`}
          onClick={() => setRelatedOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-[#03c9d7]/30 text-[#03c9d7] hover:bg-[#03c9d7]/10 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          เอกสารที่เกี่ยวข้อง
        </button>
      </div>

      {qo.attachedUrl && (() => {
        const files = parseAttachedUrl(qo.attachedUrl);
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

      <RelatedDocsDialog open={relatedOpen} onOpenChange={setRelatedOpen} docType="quotation" docId={qo.id} />
    </div>
  );
}
