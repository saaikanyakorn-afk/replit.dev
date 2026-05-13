import { useState, useEffect, useMemo, Fragment } from "react";
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
  Search, Plus, Receipt, Edit2, Trash2, Eye, Minus, Phone, Mail, FileText,
  CheckCircle2, Clock, XCircle, AlertCircle, Copy, MoreHorizontal, CreditCard,
  BookOpen, ExternalLink, Calendar as CalendarIcon,
  Printer, Link2, MessageSquare, MailCheck, Upload, Sparkles, Paperclip, FileDown,
  ChevronDown, ChevronRight, Package, Loader2
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LineSendDialog from "@/components/line-send-dialog";
import RelatedDocsDialog from "@/components/related-docs-dialog";
import JournalViewDialog from "@/components/journal-view-dialog";
import { parseAttachedUrl } from "@/components/multi-file-attachment";
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
import ListPdfExportButton from "@/components/list-pdf-export-button";
import { useLanguage } from "@/hooks/use-language";

const exportColumns = [
  { header: "วันที่", key: "expDate", width: 14 },
  { header: "เลขที่", key: "expNo", width: 20 },
  { header: "ผู้จำหน่าย", key: "vendorName", width: 30 },
  { header: "ยอดรวม", key: "totalAmount", width: 16, format: "number" as const },
  { header: "หมวดหมู่", key: "category", width: 20 },
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

export default function ExpenseList() {
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
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });
  const [journalDoc, setJournalDoc] = useState<{ open: boolean; id: number; docType?: string } | null>(null);
  const [relatedInline, setRelatedInline] = useState<{ open: boolean; id: number } | null>(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTaxReport, setFilterTaxReport] = useState<"all" | "in" | "out">("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());
  const [batchExpenses, setBatchExpenses] = useState<Record<number, any[]>>({});
  const [loadingBatches, setLoadingBatches] = useState<Set<number>>(new Set());
  const { dateEra, dateFmt } = useDateSettings();

  const { data: dailyBatches = [] } = useQuery<any[]>({
    queryKey: ["/api/expense-daily-batches", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/expense-daily-batches?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const deleteBatchMutation = useMutation({
    mutationFn: async (batchId: number) => {
      const res = await fetch(`/api/expense-daily-batches/${batchId}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message); }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expense-daily-batches"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: `ลบสำเร็จ: ${data.deleted.batch}`, description: `${data.deleted.expenses} ค่าใช้จ่าย, ${data.deleted.journals} บันทึกบัญชี, ${data.deleted.clientFiles} เอกสาร`, variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const toggleBatch = async (batchId: number) => {
    if (expandedBatches.has(batchId)) {
      setExpandedBatches(prev => { const n = new Set(prev); n.delete(batchId); return n; });
      return;
    }
    setExpandedBatches(prev => new Set(prev).add(batchId));
    if (!batchExpenses[batchId]) {
      setLoadingBatches(prev => new Set(prev).add(batchId));
      try {
        const res = await fetch(`/api/expense-daily-batches/${batchId}/expenses`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setBatchExpenses(prev => ({ ...prev, [batchId]: data }));
        }
      } catch {}
      setLoadingBatches(prev => { const n = new Set(prev); n.delete(batchId); return n; });
    }
  };

  const { data: expList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/expenses", companyId, searchText],
    queryFn: async () => {
      if (!companyId) return [];
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.set("search", searchText);
      const res = await fetch(`/api/expenses?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/accounts?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      invalidateDocCaches(queryClient, [["/api/expenses"], ["/api/expense-daily-batches"]]);
      setBatchExpenses({});
      toast({ title: "ลบรายจ่ายสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", "/api/expenses/bulk-delete", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expense-daily-batches"] });
      setBatchExpenses({});
      setSelectedIds(new Set());
      toast({ title: `ลบสำเร็จ ${data.deleted} รายการ${data.errors?.length > 0 ? ` (ผิดพลาด ${data.errors.length})` : ""}`, variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/expenses/${id}`, { status });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      toast({ title: "เปลี่ยนสถานะสำเร็จ", variant: "success" as any });
      if (data?.journalResult?.skipped) {
        toast({ title: "ไม่ได้สร้างรายการบัญชี", description: data.journalResult.reason, variant: "destructive" });
      }
    },
  });

  const handleClone = (id: number) => {
    navigate(`/purchases/exp/new?copyFrom=${id}`);
  };

  const branchOptions = Array.from(new Set(expList.map((d: any) => d.sellerBranchId).filter(Boolean))) as string[];

  const filtered = expList.filter((exp: any) => {
    if (exp.batchId) return false;
    if (filterStatus && filterStatus !== "all" && exp.status !== filterStatus) return false;
    if (filterBranch !== "all" && exp.sellerBranchId !== filterBranch) return false;
    if (filterTaxReport === "in" && !exp.showInTaxReport) return false;
    if (filterTaxReport === "out" && exp.showInTaxReport) return false;
    if (dateFrom && exp.expDate && exp.expDate < dateFrom) return false;
    if (dateTo && exp.expDate && exp.expDate > dateTo) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      if (!(exp.expNo || "").toLowerCase().includes(s) && !(exp.vendorName || "").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const filteredBatches = useMemo(() => {
    if (filterStatus && filterStatus !== "all" && filterStatus !== "approved") return [];
    return dailyBatches.filter((b: any) => {
      const batchHasVat = parseFloat(String(b.totalVat || "0")) > 0.005;
      if (filterTaxReport === "in" && !batchHasVat) return false;
      if (filterTaxReport === "out" && batchHasVat) return false;
      if (dateFrom && b.batchDate && b.batchDate < dateFrom) return false;
      if (dateTo && b.batchDate && b.batchDate > dateTo) return false;
      if (searchText) {
        const s = searchText.toLowerCase();
        if (!(b.batchNo || "").toLowerCase().includes(s) && !(b.vendorSummary || "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [dailyBatches, dateFrom, dateTo, searchText, filterStatus, filterTaxReport]);

  const unifiedList = useMemo(() => {
    const items: Array<{ type: "exp" | "batch"; date: string; data: any }> = [];
    for (const exp of filtered) {
      items.push({ type: "exp", date: exp.expDate || "", data: exp });
    }
    for (const batch of filteredBatches) {
      items.push({ type: "batch", date: batch.batchDate || "", data: batch });
    }
    items.sort((a, b) => b.date.localeCompare(a.date));
    return items;
  }, [filtered, filteredBatches]);

  const { visibleItems, hasMore, remainingCount, totalCount, showMore } = useShowMore(unifiedList);

  function toggleExpand(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getPaymentStatus(exp: any): string {
    const total = parseFloat(String(exp.totalAmount || 0));
    const paidAmount = parseFloat(String(exp.paidAmount || 0));
    if (exp.paymentStatus === "paid" || exp.status === "paid") return "paid";
    if (total > 0 && paidAmount > total) return "overpaid";
    const isOverdue = exp.dueDate && new Date(exp.dueDate) < new Date(new Date().toDateString());
    if (exp.paymentStatus === "partial" || exp.status === "partially_paid") return isOverdue ? "partial_overdue" : "partial";
    if (exp.paymentStatus === "unpaid" || exp.paymentStatus === "new" || !exp.paymentStatus) return isOverdue ? "overdue" : "unpaid";
    return exp.paymentStatus;
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-6 w-6" style={{ color: 'var(--theme-primary)' }} />
            <h1 className="text-2xl font-heading font-medium" data-testid="text-page-title">รายจ่ายอื่น</h1>
            <span className="text-sm text-muted-foreground">รายจ่าย</span>
          </div>
        </div>

        <div className="flex border-b">
          {([
            { key: "all" as const, label: "ทั้งหมด", icon: "🛒" },
            { key: "in" as const, label: "อยู่ในรายงานภาษีซื้อ", icon: "$" },
            { key: "out" as const, label: "ไม่อยู่ในรายงานภาษีซื้อ", icon: "⊘" },
          ] as const).map(tab => (
            <button
              key={tab.key}
              data-testid={`tab-tax-${tab.key}`}
              onClick={() => setFilterTaxReport(tab.key)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                filterTaxReport === tab.key
                  ? "border-[#05b187] text-[#05b187]"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
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
              <div className="flex items-center gap-1.5 text-sm text-slate-500 whitespace-nowrap">
                <span>ทั้งหมด {unifiedList.length} รายการ</span>
                {filtered.length > 0 && <span className="text-xs text-slate-400">· รายใบ {filtered.length}</span>}
                {filteredBatches.length > 0 && <span className="text-xs text-[#fb9678]">· DXP {filteredBatches.length}</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <Button variant="outline" data-testid="button-pdf-bulk-import" onClick={() => navigate("/purchases/pdf-bulk-import")} className="h-7 text-xs px-2.5 rounded-full border-[#fb9678] text-[#fb9678]">
                  <FileText className="h-3 w-3 mr-1" /> นำเข้า PDF กลุ่ม
                </Button>
                <Button variant="outline" data-testid="button-import" onClick={() => navigate("/purchases/exp/import")} className="h-7 text-xs px-2.5 rounded-full border-[#05b187] text-[#05b187]">
                  <Upload className="h-3 w-3 mr-1" /> นำเข้า Excel
                </Button>
                <ListPdfExportButton data={filtered} columns={exportColumns.map(c => ({ ...c, width: undefined, align: c.format === "number" ? "right" as const : "left" as const }))} title="รายจ่ายอื่น" subtitle={selectedCompany?.name} />
                <ListExportButton data={filtered} columns={exportColumns} fileName="รายจ่ายอื่น" />
                <Button data-testid="button-create" onClick={() => navigate("/purchases/exp/new")} className="h-7 text-xs px-3">
                  <Plus className="h-3 w-3 mr-1" /> สร้างรายจ่าย
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
              {(dateFrom || dateTo || (filterStatus && filterStatus !== "all") || filterBranch !== "all" || filterTaxReport !== "all") && (
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo(""); setFilterStatus("all"); setFilterBranch("all"); setFilterTaxReport("all"); }} data-testid="button-clear-filters">
                  ล้างตัวกรอง
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-red-50 border-b border-red-200">
                <span className="text-sm font-medium text-red-700">เลือก {selectedIds.size} รายการ</span>
                <Button
                  data-testid="button-bulk-delete"
                  variant="destructive"
                  size="sm"
                  disabled={bulkDeleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`ยืนยันลบ ${selectedIds.size} รายการ? (รวมถึงบันทึกบัญชีที่เชื่อมโยง)`)) {
                      bulkDeleteMutation.mutate(Array.from(selectedIds));
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  {bulkDeleteMutation.isPending ? "กำลังลบ..." : `ลบ ${selectedIds.size} รายการ`}
                </Button>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedIds(new Set())}>
                  ยกเลิกการเลือก
                </Button>
              </div>
            )}
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">กำลังโหลด...</div>
            ) : unifiedList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">ยังไม่มีรายจ่าย</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate("/purchases/exp/new")}>
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader style={{ backgroundColor: '#05b187' }}>
                  <TableRow className="hover:bg-transparent h-11">
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white">#</TableHead>
                    <TableHead className="w-[85px] text-sm font-medium text-white">วันที่</TableHead>
                    <TableHead className="w-[140px] text-sm font-medium text-white">เลขที่</TableHead>
                    <TableHead className="text-sm font-medium text-white min-w-[260px]">รายละเอียด</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-medium text-white">สถานะ</TableHead>
                    <TableHead className="w-[120px] text-right text-sm font-medium text-white">ค้างชำระ</TableHead>
                    <TableHead className="w-[90px] text-right text-sm font-medium text-white">VAT</TableHead>
                    <TableHead className="w-[90px] text-right text-sm font-medium text-white">WHT</TableHead>
                    <TableHead className="w-8 text-center text-sm font-medium text-white"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((item: any, idx: number) => {
                    if (item.type === "batch") {
                      const batch = item.data;
                      const isBatchExpanded = expandedBatches.has(batch.id);
                      const isBatchLoading = loadingBatches.has(batch.id);
                      const exps = batchExpenses[batch.id] || [];
                      return (
                        <Fragment key={`batch-${batch.id}`}>
                          <TableRow
                            className="cursor-pointer hover:bg-[#fb9678]/5 h-12 border-l-4 border-l-[#fb9678]"
                            onClick={(e) => {
                              if ((e.target as HTMLElement).closest("button, a")) return;
                              toggleBatch(batch.id);
                            }}
                            data-testid={`batch-row-${batch.id}`}
                          >
                            <TableCell className="text-center">
                              {isBatchLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin text-[#fb9678] mx-auto" />
                              ) : isBatchExpanded ? (
                                <ChevronDown className="h-4 w-4 text-[#fb9678] mx-auto" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400 mx-auto" />
                              )}
                            </TableCell>
                            <TableCell className="text-center text-sm text-gray-500">{idx + 1}</TableCell>
                            <TableCell className="text-sm">{formatDate(batch.batchDate, dateEra, dateFmt)}</TableCell>
                            <TableCell>
                              <span className="font-medium text-sm text-[#fb9678]">{batch.batchNo}</span>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600" title={batch.vendorSummary || "สรุปค่าใช้จ่ายรายวัน"}>
                              <div className="flex items-center gap-2">
                                <span className="line-clamp-1">{batch.vendorSummary || "สรุปค่าใช้จ่ายรายวัน"}</span>
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-[#fb9678]/10 text-[#fb9678] border-[#fb9678] shrink-0">
                                  {batch.actualExpenseCount || batch.totalExpenses} ใบ
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs">
                                <button
                                  data-testid={`button-batch-journal-${batch.id}`}
                                  onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: batch.id, docType: "expense_daily_batch" }); }}
                                  className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700 hover:underline"
                                >
                                  <BookOpen className="h-3 w-3" /> ดูบัญชี
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                  data-testid={`button-batch-related-${batch.id}`}
                                  onClick={(e) => { e.stopPropagation(); setRelatedInline({ open: true, id: batch.id }); }}
                                  className="flex items-center gap-0.5 text-[#03c9d7] hover:text-[#029baa] hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" /> เอกสารที่เกี่ยวข้อง
                                </button>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border text-xs py-0.5 px-2 font-normal h-6">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> อนุมัติ
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium text-sm">
                              <div className="text-xs text-muted-foreground">0.00</div>
                              <div className="border-t border-gray-200 my-0.5" />
                              <div>{fmt(batch.totalAmount)}</div>
                            </TableCell>
                            <TableCell className="text-right text-sm text-gray-500">{fmt(batch.totalVat)}</TableCell>
                            <TableCell className="text-right text-sm text-gray-500">{fmt(batch.totalWht)}</TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button data-testid={`button-actions-batch-${batch.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 text-sm">
                                  <DropdownMenuItem
                                    className="flex gap-2"
                                    onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: batch.id, docType: "expense_daily_batch" }); }}
                                  >
                                    <BookOpen className="h-3.5 w-3.5 text-blue-500" /> ดูบันทึกบัญชี
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="flex gap-2"
                                    onClick={(e) => { e.stopPropagation(); setRelatedInline({ open: true, id: batch.id }); }}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5 text-[#03c9d7]" /> เอกสารที่เกี่ยวข้อง
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="flex gap-2 text-red-500 focus:text-red-600"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`ยืนยันลบ ${batch.batchNo}?\nจะลบค่าใช้จ่าย ${batch.actualExpenseCount || batch.totalExpenses} ใบ พร้อมบันทึกบัญชีและเอกสารที่เกี่ยวข้องทั้งหมด`)) {
                                        deleteBatchMutation.mutate(batch.id);
                                      }
                                    }}
                                    data-testid={`button-delete-batch-${batch.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> ลบชุดเอกสาร
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                          {isBatchExpanded && exps.length > 0 && exps.map((exp: any, eIdx: number) => (
                            <TableRow key={exp.id} className="bg-[#fb9678]/[0.03] hover:bg-[#fb9678]/[0.06] border-l-4 border-l-[#fb9678]/30">
                              <TableCell></TableCell>
                              <TableCell className="text-center text-xs text-gray-400">{eIdx + 1}</TableCell>
                              <TableCell className="text-xs">{formatDate(exp.expDate, dateEra, dateFmt)}</TableCell>
                              <TableCell>
                                <span
                                  className="text-xs text-[#05b187] cursor-pointer hover:underline"
                                  onClick={() => navigate(`/purchases/exp/edit/${exp.id}`)}
                                >
                                  {exp.expNo}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-gray-600 max-w-[300px]">
                                <div className="font-medium">{exp.vendorName}</div>
                                {(exp.firstItemDescription || exp.taxInvoiceRef) && (
                                  <div className="text-[11px] text-gray-400 mt-0.5">
                                    {exp.firstItemDescription || ""}
                                    {exp.taxInvoiceRef && <span className="ml-1">#{exp.taxInvoiceRef}</span>}
                                  </div>
                                )}
                                {exp.refDebitNoteNo && (
                                  <div className="text-[11px] mt-0.5">
                                    <span
                                      className="text-red-500 hover:text-red-700 hover:underline cursor-pointer font-medium"
                                      onClick={(e) => { e.stopPropagation(); navigate(`/purchases/debit-note/${exp.refDebitNoteId}`); }}
                                    >
                                      ↩ ใบลดหนี้ {exp.refDebitNoteNo}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                                  <button
                                    data-testid={`button-dxp-related-${exp.id}`}
                                    onClick={(e) => { e.stopPropagation(); setRelatedInline({ open: true, id: exp.id }); }}
                                    className="flex items-center gap-0.5 text-[#03c9d7] hover:text-[#029baa] hover:underline"
                                  >
                                    <ExternalLink className="h-2.5 w-2.5" /> เอกสารที่เกี่ยวข้อง
                                  </button>
                                </div>
                              </TableCell>
                              <TableCell></TableCell>
                              <TableCell className="text-right text-xs">
                                {(() => {
                                  const total = parseFloat(String(exp.totalAmount || 0));
                                  const paid = parseFloat(String(exp.paidAmount || 0));
                                  const isPaid = exp.paymentStatus === "paid" || exp.status === "paid" || (paid > 0 && paid >= total);
                                  const outstanding = isPaid ? 0 : Math.max(0, total - paid);
                                  const isForeign = exp.currencyCode && exp.currencyCode !== "THB" && parseFloat(exp.exchangeRate || "1") > 1;
                                  const rate = parseFloat(exp.exchangeRate || "1");
                                  const dispTotal = isForeign ? total / rate : total;
                                  const dispOutstanding = isForeign ? outstanding / rate : outstanding;
                                  return (
                                    <>
                                      <div className="text-[10px] text-muted-foreground">{fmt(dispOutstanding)}</div>
                                      <div className="border-t border-gray-200 my-0.5" />
                                      <div>
                                        {fmt(dispTotal)}
                                        {isForeign && <span className="text-[9px] ml-1 text-[var(--theme-primary)]">{exp.currencyCode}</span>}
                                      </div>
                                    </>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="text-right text-xs text-gray-400">{fmt(exp.vatAmount)}</TableCell>
                              <TableCell className="text-right text-xs text-gray-400">{fmt(exp.withholdingTax)}</TableCell>
                              <TableCell>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => navigate(`/purchases/exp/edit/${exp.id}`)}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {isBatchExpanded && isBatchLoading && (
                            <TableRow className="bg-gray-50/50">
                              <TableCell colSpan={10} className="text-center py-3">
                                <Loader2 className="h-4 w-4 animate-spin inline-block mr-2 text-[#fb9678]" />
                                <span className="text-xs text-muted-foreground">กำลังโหลด...</span>
                              </TableCell>
                            </TableRow>
                          )}
                          {isBatchExpanded && !isBatchLoading && exps.length === 0 && (
                            <TableRow className="bg-gray-50/50">
                              <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-3">
                                ไม่พบรายจ่ายใน batch นี้
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    }

                    const exp = item.data;
                    const st = STATUS_MAP[exp.status] || { label: exp.status || "ไม่ทราบ", color: "bg-gray-100 text-gray-600 border-gray-200", icon: Clock };
                    const StIcon = st.icon;
                    const isExpanded = expandedRows.has(exp.id);
                    return (
                      <Fragment key={`exp-${exp.id}`}>
                        <TableRow data-testid={`row-exp-${exp.id}`} className={`hover:bg-slate-50/50 border-b ${selectedIds.has(exp.id) ? "bg-red-50/50" : ""}`}>
                          <TableCell className="text-center py-3">
                            <div className="flex items-center gap-1.5">
                              <Checkbox
                                data-testid={`check-exp-${exp.id}`}
                                checked={selectedIds.has(exp.id)}
                                onCheckedChange={(checked) => {
                                  setSelectedIds(prev => {
                                    const next = new Set(prev);
                                    if (checked) next.add(exp.id); else next.delete(exp.id);
                                    return next;
                                  });
                                }}
                                className="h-3.5 w-3.5"
                              />
                              <button
                                data-testid={`button-expand-${exp.id}`}
                                onClick={() => toggleExpand(exp.id)}
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${isExpanded ? "bg-gray-400" : ""}`}
                                style={!isExpanded ? { backgroundColor: 'var(--theme-primary)' } : undefined}
                              >
                                {isExpanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                              </button>
                            </div>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="text-sm">{formatDate(exp.expDate, dateEra, dateFmt)}</TableCell>
                          <TableCell>
                            <button
                              data-testid={`link-exp-${exp.id}`}
                              className="text-sm text-[#03c9d7] hover:underline font-medium"
                              onClick={() => navigate(`/purchases/exp/edit/${exp.id}`)}
                            >
                              {exp.expNo}
                            </button>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm font-normal">{exp.vendorName}</div>
                            {(exp.firstItemDescription || exp.notes || exp.refDoc) && <div className="text-xs text-muted-foreground mt-0.5">{exp.firstItemDescription || exp.notes || exp.refDoc}</div>}
                            {exp.refDebitNoteNo && (
                              <div className="text-[11px] mt-0.5">
                                <span
                                  className="text-red-500 hover:text-red-700 hover:underline cursor-pointer font-medium"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/purchases/debit-note/${exp.refDebitNoteId}`); }}
                                >
                                  ↩ ใบลดหนี้ {exp.refDebitNoteNo}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-xs">
                              <button
                                data-testid={`button-journal-inline-${exp.id}`}
                                onClick={(e) => { e.stopPropagation(); setJournalDoc({ open: true, id: exp.id }); }}
                                className="flex items-center gap-0.5 text-blue-500 hover:text-blue-700 hover:underline"
                              >
                                <BookOpen className="h-3 w-3" /> ดูบัญชี
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                data-testid={`button-related-inline-${exp.id}`}
                                onClick={(e) => { e.stopPropagation(); setRelatedInline({ open: true, id: exp.id }); }}
                                className="flex items-center gap-0.5 text-[#03c9d7] hover:text-[#029baa] hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" /> เอกสารที่เกี่ยวข้อง
                              </button>
                              {exp.attachedUrl && (
                                <>
                                  <span className="text-slate-300">|</span>
                                  <button
                                    data-testid={`button-attach-inline-${exp.id}`}
                                    onClick={() => {
                                      const raw = exp.attachedUrl;
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
                            <Badge data-testid={`badge-status-${exp.id}`} className={`${st.color} border text-xs py-0.5 px-2 font-normal h-6`}>
                              <StIcon className="h-3 w-3 mr-1" />
                              {st.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {(() => {
                              const total = parseFloat(String(exp.totalAmount || 0));
                              const paid = parseFloat(String(exp.paidAmount || 0));
                              const isPaid = exp.paymentStatus === "paid" || exp.status === "paid" || (paid > 0 && paid >= total);
                              const outstanding = isPaid ? 0 : Math.max(0, total - paid);
                              const isForeign = exp.currencyCode && exp.currencyCode !== "THB" && parseFloat(exp.exchangeRate || "1") > 1;
                              const rate = parseFloat(exp.exchangeRate || "1");
                              const dispTotal = isForeign ? total / rate : total;
                              const dispOutstanding = isForeign ? outstanding / rate : outstanding;
                              return (
                                <>
                                  <div className="text-xs text-muted-foreground">{fmt(dispOutstanding)}</div>
                                  <div className="border-t border-gray-200 my-0.5" />
                                  <div className="text-sm font-normal">
                                    {fmt(dispTotal)}
                                    {isForeign && <span className="text-[10px] ml-1 text-[var(--theme-primary)]">{exp.currencyCode}</span>}
                                  </div>
                                </>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right text-sm text-gray-500">{exp.showInTaxReport ? fmt(exp.vatAmount) : "-"}</TableCell>
                          <TableCell className="text-right text-sm text-gray-500">{fmt(exp.withholdingTax)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button data-testid={`button-actions-${exp.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 text-sm">
                                <DropdownMenuItem onClick={() => navigate(`/purchases/exp/edit/${exp.id}`)} className="flex gap-2">
                                  <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => window.open(`/purchases/exp/edit/${exp.id}`, '_blank')} className="flex gap-2">
                                  <Printer className="h-3.5 w-3.5 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/expenses/${exp.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/expense/${data.shareToken}`;
                                    await navigator.clipboard.writeText(url);
                                    toast({ title: "คัดลอกลิงก์แชร์แล้ว" });
                                  } catch {}
                                }} className="flex gap-2">
                                  <Link2 className="h-3.5 w-3.5" /> ลิงก์สำหรับแชร์
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    const res = await apiRequest("POST", `/api/expenses/${exp.id}/share`);
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/expense/${data.shareToken}`;
                                    setTimeout(() => setLineDialog({ open: true, url, docNo: exp.expNo, customerName: exp.vendorName || "" }), 150);
                                  } catch {}
                                }} className="flex gap-2 text-green-600">
                                  <MessageSquare className="h-3.5 w-3.5" /> ส่งผ่าน LINE
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={async () => {
                                  if (!exp.contactEmail) {
                                    toast({ title: "ไม่มีอีเมลผู้ขาย", variant: "destructive" });
                                    return;
                                  }
                                  try {
                                    const res = await apiRequest("POST", `/api/documents/expense/${exp.id}/send-email`, {
                                      recipientEmail: exp.contactEmail,
                                      recipientName: exp.vendorName,
                                    });
                                    const data = await res.json();
                                    toast({ title: data.success !== false ? "ส่งอีเมลสำเร็จ" : "ส่งไม่สำเร็จ", description: data.message, variant: data.success !== false ? ("success" as any) : "destructive" });
                                  } catch (err: any) {
                                    toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
                                  }
                                }} className="flex gap-2" style={{ color: 'var(--theme-primary)' }}>
                                  <MailCheck className="h-3.5 w-3.5" /> ส่งอีเมล
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleClone(exp.id)} className="flex gap-2">
                                  <Copy className="h-3.5 w-3.5" /> คัดลอกเอกสาร
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {exp.status === "draft" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: exp.id, status: "approved" })} className="flex gap-2 text-emerald-600">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ
                                  </DropdownMenuItem>
                                )}
                                {exp.status === "approved" && (
                                  <DropdownMenuItem onClick={() => statusMutation.mutate({ id: exp.id, status: "paid" })} className="flex gap-2 text-emerald-600">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {(exp.paymentMethod === "เครดิต" || !exp.paymentMethod) ? "จ่ายชำระ" : "ชำระแล้ว"}
                                  </DropdownMenuItem>
                                )}
                                {exp.status !== "cancelled" && exp.status !== "paid" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => statusMutation.mutate({ id: exp.id, status: "cancelled" })} className="flex gap-2 text-gray-500">
                                      <XCircle className="h-3.5 w-3.5" /> ยกเลิก
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (confirm("ยืนยันลบรายจ่ายนี้?")) {
                                      deleteMutation.mutate(exp.id);
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
                              <ExpandedDetail doc={exp} accounts={accounts} />
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
        docType="รายจ่าย"
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
      />
      {journalDoc && (
        <JournalViewDialog open={journalDoc.open} onOpenChange={(open) => { if (!open) setJournalDoc(null); }} docType={journalDoc.docType || "expense"} docId={journalDoc.id} />
      )}
      {relatedInline && (
        <RelatedDocsDialog open={relatedInline.open} onOpenChange={(open) => { if (!open) setRelatedInline(null); }} docType="expense" docId={relatedInline.id} />
      )}
    </Layout>
  );
}

function ExpandedDetail({ doc, accounts }: { doc: any; accounts: any[] }) {
  const { toast } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loadingItems, setLoadingItems] = useState(true);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [, navigate] = useLocation();
  const { acctName } = useLanguage();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/expenses/${doc.id}`, { credentials: "include" });
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
                <TableHead className="text-white text-sm font-medium w-24">รหัสบัญชี</TableHead>
                <TableHead className="text-white text-sm font-medium">ชื่อบัญชี</TableHead>
                <TableHead className="text-white text-sm font-medium w-32 text-right">จำนวนเงิน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it: any, i: number) => (
                <TableRow key={i} className="h-10 hover:bg-sky-50/50">
                  <TableCell className="text-sm text-muted-foreground">{it.accountCode || "-"}</TableCell>
                  <TableCell className="text-sm">{(() => {
                    const acc = accounts.find((a: any) => a.code === it.accountCode);
                    return acc ? acctName(acc) : (it.accountName || it.description || "-");
                  })()}</TableCell>
                  <TableCell className="text-sm text-right font-medium">{fmt(it.amount || it.totalPrice || it.total)}</TableCell>
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
              const res = await fetch(`/api/journal-entries/by-source/expense/${doc.id}`, { credentials: "include" });
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

      <RelatedDocsDialog open={relatedOpen} onOpenChange={setRelatedOpen} docType="expense" docId={doc.id} />
    </div>
  );
}
