import { useState, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { useShowMore } from "@/hooks/use-show-more";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import {
  Search, Plus, Edit2, Trash2, Eye, Minus, Phone, Mail,
  CheckCircle2, Clock, Send, XCircle, AlertCircle, Copy, MoreHorizontal, ClipboardList, ArrowRight,
  BookOpen, ExternalLink, Calendar as CalendarIcon, Printer, Link2, MessageSquare, MailCheck, Paperclip, FileDown, Upload
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LineSendDialog from "@/components/line-send-dialog";
import RelatedDocsDialog from "@/components/related-docs-dialog";
import { parseAttachedUrl } from "@/components/multi-file-attachment";
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
import { toLocalDateStr } from "@/lib/utils";
import ListExportButton from "@/components/list-export-button";
import { useBulkDelete } from "@/hooks/use-bulk-delete";
import { BulkDeleteButton, BulkDeleteConfirmDialog, SelectAllCheckbox, RowCheckbox } from "@/components/bulk-delete-bar";
import SendEmailDialog from "@/components/send-email-dialog";

const exportColumns = [
  { header: "วันที่", key: "poDate", width: 14 },
  { header: "เลขที่", key: "poNo", width: 20 },
  { header: "ผู้จำหน่าย", key: "vendorName", width: 30 },
  { header: "ยอดรวม", key: "totalAmount", width: 16, format: "number" as const },
  { header: "สถานะ", key: "status", width: 14 },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  pending_approval: { label: "รออนุมัติ", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  rejected: { label: "ปฏิเสธ", color: "bg-red-100 text-red-700 border-red-200", icon: AlertCircle },
  sent: { label: "ส่งแล้ว", color: "bg-[var(--theme-primary-light)] text-[var(--theme-primary)] border-[var(--theme-primary)]", icon: Send },
  received: { label: "รับแล้ว", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "ยกเลิก", color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PurchaseOrderList() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchText, setSearchText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || params.get("poNo") || "";
  });
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; id: number; email: string; docNo: string; vendorName: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const bulk = useBulkDelete({ endpoint: "/api/purchase-orders/bulk-delete", queryKey: "/api/purchase-orders", docLabel: "ใบสั่งซื้อ", companyId });
  const { dateEra, dateFmt } = useDateSettings();

  const { data: poList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/purchase-orders", companyId, searchText],
    queryFn: async () => {
      if (!companyId) return [];
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.set("search", searchText);
      const res = await fetch(`/api/purchase-orders?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/purchase-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "ลบใบสั่งซื้อสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/purchase-orders/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "เปลี่ยนสถานะสำเร็จ", variant: "success" as any });
    },
  });

  const handleClone = (id: number) => {
    navigate(`/purchases/po/new?copyFrom=${id}`);
  };

  const branchOptions = Array.from(new Set(poList.map((d: any) => d.sellerBranchId).filter(Boolean))) as string[];

  const filtered = poList.filter((po: any) => {
    if (filterStatus && filterStatus !== "all" && po.status !== filterStatus) return false;
    if (filterBranch !== "all" && po.sellerBranchId !== filterBranch) return false;
    if (dateFrom && po.poDate && po.poDate < dateFrom) return false;
    if (dateTo && po.poDate && po.poDate > dateTo) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!(po.poNo || "").toLowerCase().includes(s) && !(po.vendorName || "").toLowerCase().includes(s)) return false;
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

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-6 w-6" style={{ color: 'var(--theme-primary)' }} />
            <h1 className="text-2xl font-heading font-medium" data-testid="text-page-title">ใบสั่งซื้อ</h1>
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
                <ListExportButton data={filtered} columns={exportColumns} fileName="ใบสั่งซื้อ" />
                <Button data-testid="button-import" variant="outline" onClick={() => navigate("/purchases/po/import")} className="h-9 text-sm px-4 border-[#05b187] text-[#05b187]">
                  <Upload className="h-3.5 w-3.5 mr-1" /> นำเข้า Excel
                </Button>
                <Button data-testid="button-create-po" onClick={() => navigate("/purchases/po/new")} className="h-9 text-sm px-4">
                  <Plus className="h-3.5 w-3.5 mr-1" /> สร้างใบสั่งซื้อ
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
                <ClipboardList className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">ยังไม่มีใบสั่งซื้อ</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/purchases/po/new")}>
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader style={{ backgroundcolor: "var(--theme-primary)" }}>
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white">
                      <SelectAllCheckbox checked={visibleItems.length > 0 && bulk.selectedIds.size === visibleItems.length} onCheckedChange={(c) => c ? bulk.selectAll(visibleItems.map((po: any) => po.id)) : bulk.clearSelection()} />
                    </TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่</TableHead>
                    <TableHead className="w-[80px] text-sm font-medium text-white">กำหนดส่ง</TableHead>
                    <TableHead className="w-[130px] text-sm font-medium text-white">PO # ⇅</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[280px]">รายละเอียด - {visibleItems.length} รายการ</TableHead>
                    <TableHead className="w-[50px] text-center text-xs font-medium text-white leading-tight px-1">ตรวจ<br/>สอบ</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-medium text-white">ยอดรวม</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-medium text-white">สถานะ</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((po: any, idx: number) => {
                    const st = STATUS_MAP[po.status] || { label: po.status || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock };
                    const StIcon = st.icon;
                    const isExpanded = expandedRows.has(po.id);
                    return (
                      <Fragment key={po.id}>
                        <TableRow data-testid={`row-po-${po.id}`} className={`hover:bg-slate-50/50 border-b ${bulk.selectedIds.has(po.id) ? "bg-red-50/50" : ""}`}>
                          <TableCell className="text-center py-3">
                            <RowCheckbox id={po.id} checked={bulk.selectedIds.has(po.id)} onCheckedChange={() => bulk.toggleSelect(po.id)} />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <button
                              data-testid={`button-expand-${po.id}`}
                              onClick={() => toggleExpand(po.id)}
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-white ${isExpanded ? "bg-gray-400" : ""}`}
                              style={!isExpanded ? { backgroundColor: 'var(--theme-primary)' } : undefined}
                            >
                              {isExpanded ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                            </button>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="text-sm">{formatDate(po.poDate, dateEra, dateFmt)}</TableCell>
                          <TableCell className="text-sm">{formatDate(po.deliveryDate, dateEra, dateFmt)}</TableCell>
                          <TableCell>
                            <button
                              data-testid={`link-po-${po.id}`}
                              className="text-sm text-[#03c9d7] hover:underline font-medium"
                              onClick={() => navigate(`/purchases/po/edit/${po.id}`)}
                            >
                              {po.poNo}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-normal">{po.vendorName}</div>
                            <div className="flex items-center gap-3 mt-0.5 text-sm text-muted-foreground">
                              {po.contactPhone && (
                                <span className="flex items-center gap-0.5">
                                  <Phone className="h-3 w-3" /> {po.contactPhone}
                                </span>
                              )}
                              {po.contactEmail && (
                                <span className="flex items-center gap-0.5">
                                  <Mail className="h-3 w-3" /> {po.contactEmail}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <select
                              data-testid={`select-approval-${po.id}`}
                              value={po.status}
                              onChange={e => statusMutation.mutate({ id: po.id, status: e.target.value })}
                              className="h-7 text-xs border border-slate-300 rounded px-1.5 bg-white w-full cursor-pointer focus:outline-none focus:ring-1"
                              style={{ '--tw-ring-color': 'var(--theme-primary)' } as React.CSSProperties}
                            >
                              {Object.entries(STATUS_MAP).map(([key, val]) => (
                                <option key={key} value={key}>{val.label}</option>
                              ))}
                            </select>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <div className="text-sm font-normal">{fmt(po.totalAmount)}</div>
                          </TableCell>
                          <TableCell>
                            <Badge data-testid={`badge-status-${po.id}`} className={`${st.color} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                              <StIcon className="h-3 w-3 mr-1" />
                              {st.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button data-testid={`button-actions-${po.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 text-sm">
                                <DropdownMenuItem onClick={() => navigate(`/purchases/po/edit/${po.id}`)} className="flex gap-2">
                                  <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.open(`/purchases/po/edit/${po.id}`, '_blank')} className="flex gap-2">
                                  <Printer className="h-3.5 w-3.5 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/purchase-orders/${po.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/purchase-order/${data.shareToken}`;
                                    await navigator.clipboard.writeText(url);
                                    toast({ title: "คัดลอกลิงก์แชร์แล้ว" });
                                  } catch {}
                                }} className="flex gap-2">
                                  <Link2 className="h-3.5 w-3.5" /> ลิงก์สำหรับแชร์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/purchase-orders/${po.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/purchase-order/${data.shareToken}`;
                                    setTimeout(() => setLineDialog({ open: true, url, docNo: po.poNo, customerName: po.vendorName || "" }), 150);
                                  } catch {}
                                }} className="flex gap-2 text-green-600">
                                  <MessageSquare className="h-3.5 w-3.5" /> ส่งผ่าน LINE
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setEmailDialog({ open: true, id: po.id, email: po.contactEmail || "", docNo: po.poNo || "", vendorName: po.vendorName || "" })} className="flex gap-2" style={{ color: 'var(--theme-primary)' }}>
                                  <MailCheck className="h-3.5 w-3.5" /> ส่งอีเมล
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleClone(po.id)} className="flex gap-2">
                                  <Copy className="h-3.5 w-3.5" /> คัดลอกเอกสาร
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {po.status === "draft" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: po.id, status: "sent" })} className="flex gap-2">
                                    <Send className="h-3.5 w-3.5" /> ส่งใบสั่งซื้อ
                                  </DropdownMenuItem>
                                )}
                                {po.status === "sent" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: po.id, status: "received" })} className="flex gap-2 text-emerald-600">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> รับสินค้าแล้ว
                                  </DropdownMenuItem>
                                )}
                                {po.status !== "cancelled" && po.status !== "received" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: po.id, status: "cancelled" })} className="flex gap-2 text-gray-500">
                                      <XCircle className="h-3.5 w-3.5" /> ยกเลิก
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigate(`/purchases/ap/new?fromPO=${po.id}`)} className="flex gap-2 text-emerald-600">
                                  <ArrowRight className="h-3.5 w-3.5" /> สร้างเอกสารซื้อ (AP)
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (confirm("ยืนยันลบใบสั่งซื้อนี้?")) {
                                      deleteMutation.mutate(po.id);
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
                              <ExpandedDetail doc={po} />
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
        docType="ใบสั่งซื้อ"
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
      />
      <BulkDeleteConfirmDialog open={bulk.showConfirm} onOpenChange={bulk.setShowConfirm} count={bulk.selectedIds.size} docLabel="ใบสั่งซื้อ" onConfirm={bulk.confirmDelete} />
      {emailDialog && (
        <SendEmailDialog
          open={emailDialog.open}
          onOpenChange={(open) => { if (!open) setEmailDialog(null); }}
          defaultEmail={emailDialog.email}
          docLabel="ใบสั่งซื้อ"
          docNo={emailDialog.docNo}
          onConfirm={async (email) => {
            const res = await apiRequest("POST", `/api/documents/purchase_order/${emailDialog.id}/send-email`, { recipientEmail: email, recipientName: emailDialog.vendorName });
            const data = await res.json();
            toast({ title: data.success !== false ? "ส่งอีเมลสำเร็จ" : "ส่งไม่สำเร็จ", description: data.message, variant: data.success !== false ? ("success" as any) : "destructive" });
            if (data.success !== false) setEmailDialog(null);
          }}
        />
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
        const res = await fetch(`/api/purchase-orders/${doc.id}`, { credentials: "include" });
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
              const res = await fetch(`/api/journal-entries/by-source/purchase-order/${doc.id}`, { credentials: "include" });
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

      <RelatedDocsDialog open={relatedOpen} onOpenChange={setRelatedOpen} docType="purchase-order" docId={doc.id} />
    </div>
  );
}
