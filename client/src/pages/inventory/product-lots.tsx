import { useState, Fragment } from "react";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Search, AlertTriangle, Clock, CalendarX, Trash2, Pencil, X, Check, ChevronDown, ChevronRight, History, ExternalLink, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";

function fmtDate(d: string | null): string {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}
function fmtQty(v: string | number | null): string {
  return Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

const EXPIRY_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  expired: { bg: "bg-red-100", text: "text-red-700", label: "หมดอายุแล้ว" },
  critical: { bg: "bg-red-50", text: "text-red-600", label: "วิกฤต (≤7 วัน)" },
  warning: { bg: "bg-amber-50", text: "text-amber-700", label: "ใกล้หมดอายุ" },
  ok: { bg: "bg-green-50", text: "text-green-700", label: "ปกติ" },
};

interface IssueHistoryItem {
  issue_id: number;
  issue_no: string;
  issued_at: string | null;
  status: string;
  quantity: string | number;
  unit: string;
  issued_by_name: string | null;
  mo_no: string | null;
  mo_id: number | null;
}

function exportHistoryToExcel(lotNumber: string, history: IssueHistoryItem[]) {
  const rows = history.map((item) => ({
    "เลขล็อต": lotNumber,
    "เลขที่ใบเบิก": item.issue_no,
    "วันที่": item.issued_at ? new Date(item.issued_at).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) : "-",
    "จำนวน": Number(item.quantity),
    "หน่วย": item.unit,
    "ผู้เบิก": item.issued_by_name || "-",
    "MO": item.mo_no || "-",
    "สถานะ": item.status === "confirmed" ? "ยืนยันแล้ว" : "ร่าง",
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ประวัติการเบิก");
  XLSX.writeFile(wb, `issue-history-${lotNumber}.xlsx`);
}

function IssueHistoryPanel({ lotId, lotNumber, companyId, urlBase }: { lotId: number; lotNumber: string; companyId: number; urlBase: string }) {
  const [, navigate] = useLocation();
  const { data: history = [], isLoading } = useQuery<IssueHistoryItem[]>({
    queryKey: ["/api/product-lots/issue-history", lotId, companyId],
    queryFn: async () => {
      const r = await fetch(`/api/product-lots/${lotId}/issue-history?companyId=${companyId}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={9} className="bg-blue-50/40 px-6 py-3 text-sm text-gray-400">กำลังโหลดประวัติ...</TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow data-testid={`row-issue-history-${lotId}`}>
      <TableCell colSpan={9} className="bg-slate-50/60 p-0">
        <div className="px-6 py-3">
          <div className="flex items-center gap-2 mb-2">
            <History className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600">ประวัติการเบิก</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{history.length} รายการ</Badge>
            {history.length > 0 && (
              <Button
                data-testid={`button-export-excel-${lotId}`}
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px] gap-1 text-green-700 border-green-300 hover:bg-green-50 ml-auto"
                onClick={() => exportHistoryToExcel(lotNumber, history)}
              >
                <Download className="h-3 w-3" />
                ดาวน์โหลด Excel
              </Button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-gray-400 py-1">ยังไม่มีประวัติการเบิกสำหรับล็อตนี้</p>
          ) : (
            <div className="overflow-x-auto rounded border border-slate-200 bg-white">
              <Table>
                <TableHeader className="bg-slate-100">
                  <TableRow className="h-8">
                    <TableHead className="text-[11px] font-medium text-slate-500 py-0">เลขที่ใบเบิก</TableHead>
                    <TableHead className="text-[11px] font-medium text-slate-500 py-0">วันที่</TableHead>
                    <TableHead className="text-[11px] font-medium text-slate-500 py-0 text-right">จำนวนที่เบิก</TableHead>
                    <TableHead className="text-[11px] font-medium text-slate-500 py-0">ผู้เบิก</TableHead>
                    <TableHead className="text-[11px] font-medium text-slate-500 py-0">MO ที่ผูก</TableHead>
                    <TableHead className="text-[11px] font-medium text-slate-500 py-0">สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((item) => (
                    <TableRow key={item.issue_id} data-testid={`row-history-item-${item.issue_id}`} className="h-8 hover:bg-slate-50">
                      <TableCell className="py-1">
                        <button
                          data-testid={`link-issue-no-${item.issue_id}`}
                          className="text-xs font-mono text-blue-600 hover:underline flex items-center gap-1"
                          onClick={() => navigate(`${urlBase}/material-issue/form/${item.issue_id}`)}
                        >
                          {item.issue_no}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </button>
                      </TableCell>
                      <TableCell className="text-xs py-1 text-slate-600">{item.issued_at ? fmtDate(item.issued_at) : "-"}</TableCell>
                      <TableCell className="text-xs py-1 text-right tabular-nums font-medium">
                        {fmtQty(item.quantity)} <span className="text-gray-400">{item.unit}</span>
                      </TableCell>
                      <TableCell className="text-xs py-1 text-slate-600">{item.issued_by_name || "-"}</TableCell>
                      <TableCell className="text-xs py-1">
                        {item.mo_no ? (
                          <span className="font-mono text-slate-700">{item.mo_no}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1">
                        {item.status === "confirmed" ? (
                          <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0 border-0">ยืนยันแล้ว</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">ร่าง</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function ProductLotsPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const { dateEra, dateFmt } = useDateSettings();
  const qc = useQueryClient();
  const searchStr = useSearch();
  const urlParams = new URLSearchParams(searchStr);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [showLowStockOnly, setShowLowStockOnly] = useState(urlParams.get("filter") === "low-stock");
  const [expiryDays, setExpiryDays] = useState("30");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [expandedLotId, setExpandedLotId] = useState<number | null>(null);

  const urlBase = "/inventory";

  const { data: companySettings } = useQuery<{ lotLowStockThreshold?: number }>({
    queryKey: ["/api/settings/general", companyId],
    queryFn: async () => {
      if (!companyId) return {};
      const r = await fetch(`/api/settings/general?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    enabled: !!companyId,
  });

  const { data: lots = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/product-lots", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const r = await fetch(`/api/product-lots?companyId=${companyId}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!companyId,
  });

  const { data: expiringLots = [] } = useQuery<any[]>({
    queryKey: ["/api/product-lots/expiring", companyId, expiryDays],
    queryFn: async () => {
      if (!companyId) return [];
      const r = await fetch(`/api/product-lots/expiring?companyId=${companyId}&days=${expiryDays}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!companyId,
  });

  const updateLot = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await apiRequest("PATCH", `/api/product-lots/${id}?companyId=${companyId}`, data);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "อัปเดตล็อตแล้ว" });
      qc.invalidateQueries({ queryKey: ["/api/product-lots"] });
      setEditingId(null);
    },
    onError: (err: any) => toast({ title: "อัปเดตไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const deleteLot = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/product-lots/${id}?companyId=${companyId}`); },
    onSuccess: () => {
      toast({ title: "ลบล็อตแล้ว" });
      qc.invalidateQueries({ queryKey: ["/api/product-lots"] });
    },
    onError: (err: any) => toast({ title: "ลบไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const companyThresholdGlobal = companySettings?.lotLowStockThreshold ?? 10;

  const filteredLots = lots.filter((l: any) => {
    if (search) {
      const s = search.toLowerCase();
      if (!l.lotNumber.toLowerCase().includes(s) && !l.productName?.toLowerCase().includes(s) && !l.productCode?.toLowerCase().includes(s)) return false;
    }
    if (showLowStockOnly) {
      const qty = Number(l.quantity);
      if (qty <= 0) return false;
      const productThreshold = l.productLowStockThreshold ?? 0;
      const threshold = productThreshold > 0 ? productThreshold : companyThresholdGlobal;
      if (qty >= threshold) return false;
    }
    return true;
  });

  const activeLots = filteredLots.filter((l: any) => Number(l.quantity) > 0);
  const emptyLots = filteredLots.filter((l: any) => Number(l.quantity) <= 0);
  const lowStockCount = lots.filter((l: any) => {
    const qty = Number(l.quantity);
    if (qty <= 0) return false;
    const productThreshold = l.productLowStockThreshold ?? 0;
    const threshold = productThreshold > 0 ? productThreshold : companyThresholdGlobal;
    return qty < threshold;
  }).length;

  function toggleExpand(lotId: number) {
    setExpandedLotId(prev => prev === lotId ? null : lotId);
  }

  return (
    <Layout>
      <div className="space-y-4" data-testid="product-lots-page">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-[#fb9678]" />
          <h1 className="text-lg font-bold text-slate-800">ล็อตการผลิต / วันหมดอายุ</h1>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="all" data-testid="tab-all-lots">ล็อตทั้งหมด ({lots.length})</TabsTrigger>
            <TabsTrigger value="expiring" data-testid="tab-expiring" className="text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
              ใกล้หมดอายุ ({expiringLots.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3 pt-4 px-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      data-testid="input-lot-search"
                      placeholder="ค้นหาล็อต, สินค้า..."
                      className="pl-10 h-9 text-sm"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>
                  <Badge variant="outline" className="text-xs">{activeLots.length} ล็อตมีสต็อก</Badge>
                  {lowStockCount > 0 && (
                    <button
                      data-testid="button-toggle-low-stock-filter"
                      onClick={() => setShowLowStockOnly(v => !v)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors ${showLowStockOnly ? "bg-amber-500 border-amber-500 text-white" : "border-amber-400 text-amber-600 bg-amber-50 hover:bg-amber-100"}`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {lowStockCount} ใกล้หมด{showLowStockOnly ? " (กรองอยู่)" : ""}
                    </button>
                  )}
                  {emptyLots.length > 0 && <Badge variant="secondary" className="text-xs">{emptyLots.length} หมดสต็อก</Badge>}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="h-10">
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="text-xs font-medium text-slate-600">เลขล็อต</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600">สินค้า</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600 w-24 text-right">คงเหลือ</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600 w-28">วันผลิต</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600 w-28">วันหมดอายุ</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600 w-24">สถานะ</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600 w-28 text-right">ต้นทุน/หน่วย</TableHead>
                        <TableHead className="w-20"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400">กำลังโหลด...</TableCell></TableRow>
                      ) : filteredLots.length === 0 ? (
                        <TableRow><TableCell colSpan={9} className="text-center py-8 text-gray-400">ยังไม่มีข้อมูลล็อต</TableCell></TableRow>
                      ) : filteredLots.map((lot: any) => {
                        const isEditing = editingId === lot.id;
                        const isExpanded = expandedLotId === lot.id;
                        const daysLeft = lot.expiryDate ? Math.ceil((new Date(lot.expiryDate).getTime() - Date.now()) / 86400000) : null;
                        const level = daysLeft === null ? null : daysLeft <= 0 ? "expired" : daysLeft <= 7 ? "critical" : daysLeft <= 30 ? "warning" : "ok";
                        const qty = Number(lot.quantity);
                        const productThreshold = lot.productLowStockThreshold ?? 0;
                        const companyThreshold = companySettings?.lotLowStockThreshold ?? 10;
                        const threshold = productThreshold > 0 ? productThreshold : companyThreshold;
                        const isOutOfStock = qty <= 0;
                        const isLowStock = !isOutOfStock && qty < threshold;
                        return (
                          <Fragment key={lot.id}>
                            <TableRow data-testid={`row-lot-${lot.id}`} className={`hover:bg-slate-50/50 ${level === "expired" ? "bg-red-50/30" : level === "critical" ? "bg-red-50/20" : ""}`}>
                              <TableCell className="px-2">
                                <button
                                  data-testid={`button-expand-lot-${lot.id}`}
                                  className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                                  title="ดูประวัติการเบิก"
                                  onClick={() => toggleExpand(lot.id)}
                                >
                                  {isExpanded
                                    ? <ChevronDown className="w-3.5 h-3.5" />
                                    : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              </TableCell>
                              <TableCell className="text-sm font-mono font-medium">
                                {isEditing ? (
                                  <Input value={editForm.lotNumber} onChange={e => setEditForm({ ...editForm, lotNumber: e.target.value })} className="h-7 text-xs w-28" />
                                ) : lot.lotNumber}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-slate-800">{lot.productName}</div>
                                <div className="text-[11px] text-gray-400">{lot.productCode}</div>
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {fmtQty(lot.quantity)} <span className="text-[11px] text-gray-400">{lot.productUnit}</span>
                              </TableCell>
                              <TableCell className="text-sm">
                                {isEditing ? (
                                  <ThaiDateInput value={editForm.manufacturingDate || ""} onChange={(v: string) => setEditForm({ ...editForm, manufacturingDate: v })} dateEra={dateEra} dateFmt={dateFmt} className="h-7 text-xs" />
                                ) : fmtDate(lot.manufacturingDate)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {isEditing ? (
                                  <ThaiDateInput value={editForm.expiryDate || ""} onChange={(v: string) => setEditForm({ ...editForm, expiryDate: v })} dateEra={dateEra} dateFmt={dateFmt} className="h-7 text-xs" />
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    {fmtDate(lot.expiryDate)}
                                    {level && (
                                      <Badge className={`text-[9px] px-1 py-0 ${EXPIRY_COLORS[level].bg} ${EXPIRY_COLORS[level].text} border-0`}>
                                        {daysLeft! <= 0 ? "หมดอายุ" : `${daysLeft} วัน`}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {isOutOfStock ? (
                                    <Badge data-testid={`badge-out-of-stock-${lot.id}`} className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border-0">หมดสต็อก</Badge>
                                  ) : isLowStock ? (
                                    <>
                                      <Badge variant="outline" className="text-[10px] border-green-200 text-green-700">มีสต็อก</Badge>
                                      <Badge data-testid={`badge-low-stock-${lot.id}`} className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-600 border-0">ใกล้หมด</Badge>
                                    </>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] border-green-200 text-green-700">มีสต็อก</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {Number(lot.unitCost || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell>
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <button className="p-1 rounded hover:bg-green-50" onClick={() => updateLot.mutate({ id: lot.id, data: editForm })}>
                                      <Check className="w-4 h-4 text-green-600" />
                                    </button>
                                    <button className="p-1 rounded hover:bg-gray-100" onClick={() => setEditingId(null)}>
                                      <X className="w-4 h-4 text-gray-400" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <button
                                      className="p-1 rounded hover:bg-blue-50"
                                      title="แก้ไข"
                                      onClick={() => { setEditingId(lot.id); setEditForm({ lotNumber: lot.lotNumber, manufacturingDate: lot.manufacturingDate || "", expiryDate: lot.expiryDate || "" }); }}
                                    >
                                      <Pencil className="w-3.5 h-3.5 text-blue-500" />
                                    </button>
                                    <button
                                      className="p-1 rounded hover:bg-red-50"
                                      title="ลบ"
                                      onClick={() => { if (confirm("ลบล็อตนี้?")) deleteLot.mutate(lot.id); }}
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                    </button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <IssueHistoryPanel key={`history-${lot.id}`} lotId={lot.id} lotNumber={lot.lotNumber} companyId={companyId!} urlBase={urlBase} />
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expiring" className="mt-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3 pt-4 px-4 border-b">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-semibold text-slate-700">แจ้งเตือนสินค้าใกล้หมดอายุ</span>
                  <Select value={expiryDays} onValueChange={setExpiryDays}>
                    <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 วัน</SelectItem>
                      <SelectItem value="14">14 วัน</SelectItem>
                      <SelectItem value="30">30 วัน</SelectItem>
                      <SelectItem value="60">60 วัน</SelectItem>
                      <SelectItem value="90">90 วัน</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="h-10">
                        <TableHead className="text-xs font-medium text-slate-600 w-20">สถานะ</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600">สินค้า</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600">เลขล็อต</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600 w-28">วันหมดอายุ</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600 w-24">เหลือ</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600 w-24 text-right">คงเหลือ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expiringLots.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-400">
                          <Clock className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                          ไม่มีสินค้าใกล้หมดอายุภายใน {expiryDays} วัน
                        </TableCell></TableRow>
                      ) : expiringLots.map((lot: any) => {
                        const c = EXPIRY_COLORS[lot.expiryLevel] || EXPIRY_COLORS.ok;
                        return (
                          <TableRow key={lot.id} data-testid={`row-expiring-${lot.id}`} className={`${c.bg}`}>
                            <TableCell>
                              {lot.expiryLevel === "expired" ? (
                                <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0 border-0">
                                  <CalendarX className="w-3 h-3 mr-0.5" /> หมดอายุ
                                </Badge>
                              ) : lot.expiryLevel === "critical" ? (
                                <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0 border-0">
                                  <AlertTriangle className="w-3 h-3 mr-0.5" /> วิกฤต
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0 border-0">
                                  <Clock className="w-3 h-3 mr-0.5" /> เตือน
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{lot.productName}</div>
                              <div className="text-[11px] text-gray-400">{lot.productCode}</div>
                            </TableCell>
                            <TableCell className="text-sm font-mono">{lot.lotNumber}</TableCell>
                            <TableCell className="text-sm">{fmtDate(lot.expiryDate)}</TableCell>
                            <TableCell className={`text-sm font-medium ${c.text}`}>
                              {lot.daysUntilExpiry <= 0 ? `เกิน ${Math.abs(lot.daysUntilExpiry)} วัน` : `${lot.daysUntilExpiry} วัน`}
                            </TableCell>
                            <TableCell className="text-right text-sm tabular-nums">
                              {fmtQty(lot.quantity)} {lot.productUnit}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
