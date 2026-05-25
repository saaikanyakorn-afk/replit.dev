import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { formatDateTime } from "@/lib/format";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import {
  Package, ArrowLeft, ArrowDownToLine, ArrowUpFromLine, History,
  Printer, Download, Search, RotateCcw, Tag, Filter, FileText, ExternalLink, Calculator,
  Pencil, Trash2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import type { Product, ProductStock } from "@shared/schema";
import { toLocalDateStr } from "@/lib/utils";

const MOVEMENT_LABELS: Record<string, { label: string; color: string; bgColor: string }> = {
  receive: { label: "รับเข้า", color: "text-emerald-700", bgColor: "bg-emerald-50" },
  sale_deduct: { label: "เบิกออก", color: "text-red-700", bgColor: "bg-red-50" },
  sale: { label: "ขาย", color: "text-red-700", bgColor: "bg-red-50" },
  adjust_in: { label: "ปรับเพิ่ม", color: "text-blue-700", bgColor: "bg-blue-50" },
  adjust_out: { label: "ปรับลด", color: "text-orange-700", bgColor: "bg-orange-50" },
  return: { label: "คืนสินค้า", color: "text-purple-700", bgColor: "bg-purple-50" },
  transfer: { label: "โอนย้าย", color: "text-cyan-700", bgColor: "bg-cyan-50" },
  initial: { label: "ยอดเปิด", color: "text-slate-700", bgColor: "bg-slate-50" },
  production: { label: "ผลิต", color: "text-indigo-700", bgColor: "bg-indigo-50" },
  bundle_deduct: { label: "ตัดชุด", color: "text-rose-700", bgColor: "bg-rose-50" },
  bundle_offset: { label: "ชดเชยชุด", color: "text-teal-700", bgColor: "bg-teal-50" },
  bom_consume: { label: "ตัด BOM", color: "text-violet-700", bgColor: "bg-violet-50" },
  mo_consume: { label: "ตัดวัตถุดิบ (MO)", color: "text-amber-700", bgColor: "bg-amber-50" },
  mapping_convert: { label: "ตัด Mapping", color: "text-pink-700", bgColor: "bg-pink-50" },
};

const REF_TYPE_LABELS: Record<string, { label: string; path: string; editPath?: string }> = {
  goods_receiving: { label: "GR", path: "/inventory/receiving", editPath: "/inventory/receiving/edit" },
  goods_requisition: { label: "GIQ", path: "/inventory/requisition", editPath: "/inventory/requisition/edit" },
  invoice: { label: "IV", path: "/sales/invoice", editPath: "/sales/invoice/edit" },
  tax_invoice: { label: "TIV", path: "/sales/tax-invoice", editPath: "/sales/tax-invoice/edit" },
  purchase_order: { label: "PO", path: "/purchases/po", editPath: "/purchases/po/edit" },
  purchase_invoice: { label: "AP", path: "/purchases/invoice", editPath: "/purchases/ap/edit" },
  bundle_deduct: { label: "BUNDLE", path: "" },
  bundle_offset: { label: "BUNDLE", path: "" },
  bom_consume: { label: "BOM", path: "" },
  manufacturing_order: { label: "MO", path: "/inventory/manufacturing", editPath: "/inventory/manufacturing/edit" },
  mapping_convert: { label: "MAP", path: "" },
};

const COSTING_METHODS: Record<string, { label: string; labelShort: string; color: string }> = {
  moving_average: { label: "ถัวเฉลี่ยเคลื่อนที่ (Moving Average)", labelShort: "Moving Avg", color: "text-amber-700" },
  fifo: { label: "เข้าก่อนออกก่อน (FIFO)", labelShort: "FIFO", color: "text-blue-700" },
  specific: { label: "ระบุเฉพาะเจาะจง (Specific ID)", labelShort: "Specific", color: "text-purple-700" },
};

function formatNumber(val: string | number | null | undefined, decimals = 0): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatCurrency(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  if (n === 0) return "-";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function StockCardPage(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }> } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const companyCostingMethod = (selectedCompany as any)?.inventoryCostingMethod || "moving_average";
  const { dateEra, dateFmt } = useDateSettings();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlProductId = new URLSearchParams(searchString).get("productId") || "";

  const [selectedProductId, setSelectedProductId] = useState<string>(urlProductId);
  const [searchText, setSearchText] = useState("");
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [costingMethod, setCostingMethod] = useState<string>("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
  const [appliedMethod, setAppliedMethod] = useState<string>("");
  const [editMovement, setEditMovement] = useState<{ id: number; unitCost: string; qty: number } | null>(null);
  const [editUnitCost, setEditUnitCost] = useState("");
  const [deleteMovementId, setDeleteMovementId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const editCostMutation = useMutation({
    mutationFn: async ({ id, unitCost }: { id: number; unitCost: string }) => {
      const res = await fetch(`/api/stock-movements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ unitCost: Number(unitCost) }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-reports/stock-card"] });
      setEditMovement(null);
      toast({ title: "แก้ไขต้นทุนสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const deleteMovementMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/stock-movements/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-reports/stock-card"] });
      queryClient.invalidateQueries({ queryKey: ["/api/product-stock"] });
      setDeleteMovementId(null);
      toast({ title: "ลบรายการสำเร็จ", description: "กด Sync ยอดคงเหลือเพื่ออัพเดทยอดต่อคลังด้วย", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "ไม่สามารถลบได้", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (urlProductId && urlProductId !== selectedProductId) {
      setSelectedProductId(urlProductId);
    }
  }, [urlProductId]);

  const activeMethod = appliedMethod || companyCostingMethod;

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/products?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId,
  });

  const productId = selectedProductId ? parseInt(selectedProductId) : null;

  const { data: stockData } = useQuery<ProductStock[]>({
    queryKey: ["/api/product-stock", companyId, productId],
    queryFn: async () => {
      let url = `/api/product-stock?companyId=${companyId}`;
      if (productId) url += `&productId=${productId}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId && !!productId,
  });

  const { data: costingData, isLoading: isCostingLoading } = useQuery<{ method: string; movements: any[]; balanceBF?: { qty: number; value: number; unitCost: number } }>({
    queryKey: ["/api/inventory-reports/stock-card", companyId, productId, activeMethod, appliedStartDate, appliedEndDate],
    queryFn: async () => {
      let url = `/api/inventory-reports/stock-card?companyId=${companyId}&productId=${productId}&method=${activeMethod}`;
      if (appliedStartDate) url += `&startDate=${appliedStartDate}`;
      if (appliedEndDate) url += `&endDate=${appliedEndDate}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId && !!productId,
  });

  const selectedProduct = products.find(p => p.id === productId);
  const stock = stockData && stockData.length > 0 ? stockData.find(s => s.productId === productId) : null;

  const currentQty = parseFloat(stock?.quantity || "0");
  const reservedQty = parseFloat(stock?.reservedQty || "0");
  const availableQty = currentQty - reservedQty;

  const movementsWithCost = useMemo(() => {
    if (!costingData?.movements) return [];
    return costingData.movements;
  }, [costingData]);

  const lastMovement = costingData?.movements?.length ? costingData.movements[costingData.movements.length - 1] : null;
  const stockValue = lastMovement ? lastMovement.runningValue : currentQty * parseFloat(String(selectedProduct?.cost || "0"));
  const avgUnitCost = lastMovement ? lastMovement.runningUnitCost : parseFloat(String(selectedProduct?.cost || "0"));

  const filteredProducts = products.filter(p =>
    !searchText ||
    p.name.toLowerCase().includes(searchText.toLowerCase()) ||
    (p.code && p.code.toLowerCase().includes(searchText.toLowerCase()))
  );

  function getStockColor(qty: number) {
    if (qty <= 0) return { border: "border-red-200", bg: "bg-red-50", text: "text-red-700" };
    if (qty <= 10) return { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700" };
    return { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700" };
  }

  const handleFilter = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedMethod(costingMethod || companyCostingMethod);
  };

  const handleClearFilter = () => {
    setStartDate("");
    setEndDate("");
    setCostingMethod("");
    setAppliedStartDate("");
    setAppliedEndDate("");
    setAppliedMethod("");
  };

  const handlePrint = () => window.print();

  const handleExportCSV = () => {
    if (!selectedProduct || movementsWithCost.length === 0) return;
    const methodInfo = COSTING_METHODS[activeMethod] || COSTING_METHODS.moving_average;
    const headers = ["ลำดับ", "วันที่", "ประเภท", "เอกสาร", "รับเข้า", "ราคา/หน่วย(เข้า)", "รวม(เข้า)", "เบิกออก", "ราคา/หน่วย(ออก)", "รวม(ออก)", "T.Sell ราคาขายรวม", "G.Profit กำไรขั้นต้น", "คงเหลือ", "ต้นทุน/หน่วย", "Balance มูลค่า", "หมายเหตุ"];
    const csvRows: string[][] = [];
    if (costingData?.balanceBF) {
      csvRows.push(["-", "", "B/F ยอดยกมา", "", "", "", "", "", "", "", "", "", formatNumber(costingData.balanceBF.qty, 2), formatCurrency(costingData.balanceBF.unitCost), formatCurrency(costingData.balanceBF.value), ""]);
    }
    movementsWithCost.forEach((m: any, i: number) => {
      const qty = m.quantity;
      const ml = MOVEMENT_LABELS[m.movementType] || { label: m.movementType };
      const isIn = qty > 0;
      const isOut = qty < 0;
      csvRows.push([
        String(i + 1),
        formatDateTime(m.documentDate || m.createdAt, dateEra, dateFmt),
        ml.label,
        m.referenceNo || "",
        isIn ? formatNumber(qty, 2) : "",
        isIn ? formatCurrency(m.unitCost) : "",
        isIn ? formatCurrency(m.totalCost) : "",
        isOut ? formatNumber(Math.abs(qty), 2) : "",
        isOut ? formatCurrency(m.unitCost) : "",
        isOut ? formatCurrency(m.totalCost) : "",
        isOut && m.totalSell > 0 ? formatCurrency(m.totalSell) : "",
        isOut && m.grossProfit !== undefined && m.grossProfit !== 0 ? formatCurrency(m.grossProfit) : "",
        formatNumber(m.runningQty, 2),
        formatCurrency(m.runningUnitCost),
        m.runningValue < 0 ? `-${formatCurrency(Math.abs(m.runningValue))}` : formatCurrency(m.runningValue),
        m.notes || "",
      ]);
    });
    const rows = csvRows;
    const BOM = "\uFEFF";
    const header1 = `สต๊อกการ์ด - ${selectedProduct.name} (${methodInfo.labelShort})`;
    const csvContent = BOM + [header1, headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock_card_${selectedProduct.code || selectedProduct.id}_${activeMethod}_${toLocalDateStr(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "ส่งออกสำเร็จ", description: `ส่งออก ${movementsWithCost.length} รายการ`, variant: "success" as any });
  };

  function handleRefClick(refType: string | null, refId: number | null) {
    if (!refType || !refId) return;
    const info = REF_TYPE_LABELS[refType];
    if (!info || !info.path) return;
    setLocation(info.path);
  }

  const stockColor = getStockColor(currentQty);
  const methodInfo = COSTING_METHODS[activeMethod] || COSTING_METHODS.moving_average;

  return (
    <LayoutComponent>
      <div className="space-y-4" data-testid="stock-card-page">
        <div className="rounded-lg p-6 shadow-sm border print:shadow-none" style={{ background: "#ede9fe" }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
                <History className="h-7 w-7" />
                สต๊อกการ์ด
              </h1>
              <p className="mt-1 text-violet-800/60 text-sm">รายงานการเคลื่อนไหวสินค้า พร้อมคำนวณต้นทุนตาม {methodInfo.label}</p>
            </div>
            <Button
              variant="outline"
              className="bg-white/60 border-violet-300 text-violet-700 hover:bg-white h-9"
              onClick={() => setLocation("/inventory/warehouse")}
              data-testid="button-back-warehouse"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              กลับคลังสินค้า
            </Button>
          </div>
        </div>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Package className="h-4 w-4 text-[#fec90f]" />
              เลือกสินค้า
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ค้นหาชื่อหรือรหัสสินค้า..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9 h-9 bg-white border shadow-sm text-sm"
                data-testid="input-search-product"
              />
            </div>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger className="max-w-md h-9 text-sm" data-testid="select-product">
                <SelectValue placeholder="-- เลือกสินค้า --" />
              </SelectTrigger>
              <SelectContent>
                {filteredProducts.map(p => (
                  <SelectItem key={p.id} value={String(p.id)} data-testid={`select-product-item-${p.id}`}>
                    {p.code ? `[${p.code}] ` : ""}{p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedProduct && (
              <div className="flex flex-wrap gap-3 mt-2 text-sm">
                <Badge variant="outline" className="bg-slate-50">
                  <Tag className="h-3 w-3 mr-1" />
                  รหัส: {selectedProduct.code || "-"}
                </Badge>
                <Badge variant="outline" className="bg-slate-50">
                  ชื่อ: {selectedProduct.name}
                </Badge>
                <Badge variant="outline" className="bg-slate-50">
                  หมวด: {selectedProduct.category || "-"}
                </Badge>
                <Badge variant="outline" className="bg-slate-50">
                  หน่วย: {selectedProduct.unit || "-"}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {!selectedProduct ? (
          <Card className="border shadow-sm">
            <CardContent className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
              <Package className="h-12 w-12 text-slate-300" />
              <p className="font-medium text-sm" data-testid="text-empty-state">กรุณาเลือกสินค้าเพื่อดูสต๊อกการ์ด</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card className={`border shadow-sm ${stockColor.border}`}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">คงเหลือ</p>
                  <p className={`text-2xl font-bold ${stockColor.text}`} data-testid="text-current-qty">
                    {formatNumber(currentQty, 2)}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedProduct.unit}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm border-amber-200">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">จองแล้ว</p>
                  <p className="text-2xl font-bold text-amber-700" data-testid="text-reserved-qty">
                    {formatNumber(reservedQty, 2)}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedProduct.unit}</p>
                </CardContent>
              </Card>
              <Card className={`border shadow-sm ${availableQty <= 0 ? "border-red-200" : "border-emerald-200"}`}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">พร้อมขาย</p>
                  <p className={`text-2xl font-bold ${availableQty <= 0 ? "text-red-700" : "text-emerald-700"}`} data-testid="text-available-qty">
                    {formatNumber(availableQty, 2)}
                  </p>
                  <p className="text-xs text-muted-foreground">{selectedProduct.unit}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm border-blue-200">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">ต้นทุน/หน่วย</p>
                  <p className="text-2xl font-bold text-blue-700 truncate" data-testid="text-avg-cost" title={`฿${formatNumber(avgUnitCost, 2)}`}>
                    ฿{formatNumber(avgUnitCost, 2)}
                  </p>
                  <p className="text-xs text-muted-foreground">{methodInfo.labelShort}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm border-purple-200">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">มูลค่าสต๊อก</p>
                  <p className="text-2xl font-bold text-purple-700 truncate" data-testid="text-stock-value" title={`฿${formatNumber(stockValue, 2)}`}>
                    ฿{formatNumber(stockValue, 2)}
                  </p>
                  <p className="text-xs text-muted-foreground">บาท</p>
                </CardContent>
              </Card>
            </div>

            <Card className="border shadow-sm print:hidden">
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">วิธีต้นทุน</Label>
                    <Select value={costingMethod || companyCostingMethod} onValueChange={setCostingMethod}>
                      <SelectTrigger className="h-9 text-sm w-56" data-testid="select-costing-method">
                        <Calculator className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="moving_average">ถัวเฉลี่ยเคลื่อนที่</SelectItem>
                        <SelectItem value="fifo">FIFO (เข้าก่อนออกก่อน)</SelectItem>
                        <SelectItem value="specific">ระบุเฉพาะเจาะจง</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">วันที่เริ่มต้น</Label>
                    <ThaiDateInput value={startDate} onChange={setStartDate} dateEra={dateEra} dateFmt={dateFmt} className="w-44" data-testid="input-start-date" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground mb-1 block">วันที่สิ้นสุด</Label>
                    <ThaiDateInput value={endDate} onChange={setEndDate} dateEra={dateEra} dateFmt={dateFmt} className="w-44" data-testid="input-end-date" />
                  </div>
                  <Button size="sm" className="h-9" style={{ background: "#fec90f" }} onClick={handleFilter} data-testid="button-filter">
                    <Filter className="h-4 w-4 mr-1" /> กรอง
                  </Button>
                  <Button size="sm" variant="outline" className="h-9" onClick={handleClearFilter} data-testid="button-clear-filter">
                    <RotateCcw className="h-4 w-4 mr-1" /> ล้าง
                  </Button>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" className="h-9" onClick={handlePrint} data-testid="button-print">
                      <Printer className="h-4 w-4 mr-1" /> พิมพ์
                    </Button>
                    <Button size="sm" variant="outline" className="h-9" onClick={handleExportCSV} data-testid="button-export-csv">
                      <Download className="h-4 w-4 mr-1" /> ส่งออก CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <History className="h-4 w-4 text-[#fec90f]" />
                    ประวัติการเคลื่อนไหว
                    <Badge variant="outline" className={`text-[10px] ml-2 ${methodInfo.color}`}>
                      <Calculator className="h-3 w-3 mr-0.5" />
                      {methodInfo.labelShort}
                    </Badge>
                  </div>
                  <Badge variant="outline" className="text-xs" data-testid="text-total-movements">
                    ทั้งหมด {movementsWithCost.length} รายการ
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isCostingLoading ? (
                  <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                    <div className="animate-spin h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full" />
                    <p className="text-sm">กำลังคำนวณต้นทุน...</p>
                  </div>
                ) : movementsWithCost.length === 0 ? (
                  <div className="py-16 flex flex-col items-center gap-3 text-muted-foreground">
                    <History className="h-12 w-12 text-slate-300" />
                    <p className="font-medium text-sm" data-testid="text-no-movements">ยังไม่มีประวัติการเคลื่อนไหว</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="text-xs w-10 text-center">#</TableHead>
                          <TableHead className="text-xs w-[100px]">วันที่</TableHead>
                          <TableHead className="text-xs w-[80px]">ประเภท</TableHead>
                          <TableHead className="text-xs w-[90px]">คลัง</TableHead>
                          <TableHead className="text-xs w-[120px]">เอกสารอ้างอิง</TableHead>
                          <TableHead className="text-xs" colSpan={3}>
                            <div className="text-center bg-emerald-50 rounded px-2 py-1 text-emerald-700 font-semibold">รับเข้า</div>
                          </TableHead>
                          <TableHead className="text-xs" colSpan={3}>
                            <div className="text-center bg-red-50 rounded px-2 py-1 text-red-700 font-semibold">เบิกออก</div>
                          </TableHead>
                          <TableHead className="text-xs">
                            <div className="text-center bg-amber-50 rounded px-2 py-1 text-amber-700 font-semibold">T.Sell</div>
                          </TableHead>
                          <TableHead className="text-xs">
                            <div className="text-center bg-yellow-50 rounded px-2 py-1 text-yellow-700 font-semibold">G.Profit</div>
                          </TableHead>
                          <TableHead className="text-xs" colSpan={3}>
                            <div className="text-center bg-blue-50 rounded px-2 py-1 text-blue-700 font-semibold">คงเหลือ</div>
                          </TableHead>
                        </TableRow>
                        <TableRow className="bg-slate-50/50 border-b">
                          <TableHead></TableHead>
                          <TableHead></TableHead>
                          <TableHead></TableHead>
                          <TableHead></TableHead>
                          <TableHead></TableHead>
                          <TableHead className="text-xs text-right text-emerald-600 font-medium w-[65px]">จำนวน</TableHead>
                          <TableHead className="text-xs text-right text-emerald-600 font-medium w-[85px]">ราคา/หน่วย</TableHead>
                          <TableHead className="text-xs text-right text-emerald-600 font-medium w-[85px]">รวม</TableHead>
                          <TableHead className="text-xs text-right text-red-600 font-medium w-[65px]">จำนวน</TableHead>
                          <TableHead className="text-xs text-right text-red-600 font-medium w-[85px]">ราคา/หน่วย</TableHead>
                          <TableHead className="text-xs text-right text-red-600 font-medium w-[85px]">รวม</TableHead>
                          <TableHead className="text-xs text-right text-amber-600 font-medium w-[85px]">ราคาขายรวม</TableHead>
                          <TableHead className="text-xs text-right text-yellow-600 font-medium w-[85px]">กำไรขั้นต้น</TableHead>
                          <TableHead className="text-xs text-right text-blue-600 font-medium w-[65px]">จำนวน</TableHead>
                          <TableHead className="text-xs text-right text-blue-600 font-medium w-[85px]">ราคา/หน่วย</TableHead>
                          <TableHead className="text-xs text-right text-blue-600 font-medium w-[85px]">มูลค่า</TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {costingData?.balanceBF && (
                          <TableRow className="bg-slate-100 border-b-2 border-slate-300" data-testid="row-balance-bf">
                            <TableCell className="text-xs text-center font-bold text-slate-500">-</TableCell>
                            <TableCell className="text-xs font-semibold text-slate-600" colSpan={3}>B/F ยอดยกมา</TableCell>
                            <TableCell className="text-xs text-right bg-emerald-50/30" colSpan={3}>-</TableCell>
                            <TableCell className="text-xs text-right bg-red-50/30" colSpan={3}>-</TableCell>
                            <TableCell className="text-xs text-right bg-amber-50/30">-</TableCell>
                            <TableCell className="text-xs text-right bg-yellow-50/30">-</TableCell>
                            <TableCell className={`text-xs text-right font-bold tabular-nums ${costingData.balanceBF.qty < 0 ? "text-red-600" : "text-blue-700"}`} data-testid="text-bf-qty">
                              {formatNumber(costingData.balanceBF.qty, 2)}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums text-blue-700">
                              {formatCurrency(costingData.balanceBF.unitCost)}
                            </TableCell>
                            <TableCell className={`text-xs text-right font-bold tabular-nums ${costingData.balanceBF.value < 0 ? "text-red-600" : "text-blue-700"}`} data-testid="text-bf-value">
                              {costingData.balanceBF.value < 0 ? `-${formatCurrency(Math.abs(costingData.balanceBF.value))}` : formatCurrency(costingData.balanceBF.value)}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>
                        )}
                        {movementsWithCost.map((m: any, i: number) => {
                          const qty = m.quantity;
                          const ml = MOVEMENT_LABELS[m.movementType] || { label: m.movementType, color: "text-slate-700", bgColor: "bg-slate-50" };
                          const isIn = qty > 0;
                          const isOut = qty < 0;
                          const refInfo = m.referenceType ? REF_TYPE_LABELS[m.referenceType] : null;
                          const refLabel = m.referenceNo || (refInfo ? `${refInfo.label}#${m.referenceId || ""}` : "");
                          const canClick = !!refInfo && !!m.referenceId;

                          return (
                            <TableRow key={m.id} data-testid={`row-movement-${m.id}`} className="hover:bg-slate-50/50 border-b">
                              <TableCell className="text-xs text-center text-muted-foreground">{i + 1}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {formatDateTime(m.documentDate || m.createdAt, dateEra, dateFmt)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-[10px] ${ml.color} ${ml.bgColor}`}>
                                  {ml.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-slate-500 whitespace-nowrap" data-testid={`text-warehouse-${m.id}`}>
                                {m.warehouseName ? (
                                  <span className="inline-flex items-center gap-1 text-violet-700 bg-violet-50 rounded px-1.5 py-0.5 text-[10px] font-medium">
                                    {m.warehouseName}
                                  </span>
                                ) : <span className="text-slate-300 text-[10px]">-</span>}
                              </TableCell>
                              <TableCell>
                                {refLabel ? (
                                  canClick ? (
                                    <button
                                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium"
                                      onClick={() => handleRefClick(m.referenceType, m.referenceId)}
                                      data-testid={`link-ref-${m.id}`}
                                    >
                                      <FileText className="h-3 w-3" />
                                      {refLabel}
                                      <ExternalLink className="h-2.5 w-2.5" />
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <FileText className="h-3 w-3" />
                                      {refLabel}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-xs text-right bg-emerald-50/30">
                                {isIn ? (
                                  <span className="text-emerald-700 font-medium flex items-center justify-end gap-1">
                                    <ArrowDownToLine className="h-3 w-3" />
                                    {formatNumber(qty, 2)}
                                  </span>
                                ) : "-"}
                              </TableCell>
                              <TableCell className="text-xs text-right bg-emerald-50/30 tabular-nums">
                                {isIn && m.unitCost > 0 ? formatCurrency(m.unitCost) : "-"}
                              </TableCell>
                              <TableCell className="text-xs text-right bg-emerald-50/30 tabular-nums font-medium">
                                {isIn && m.totalCost > 0 ? formatCurrency(m.totalCost) : "-"}
                              </TableCell>
                              <TableCell className="text-xs text-right bg-red-50/30">
                                {isOut ? (
                                  <span className="text-red-700 font-medium flex items-center justify-end gap-1">
                                    <ArrowUpFromLine className="h-3 w-3" />
                                    {formatNumber(Math.abs(qty), 2)}
                                  </span>
                                ) : "-"}
                              </TableCell>
                              <TableCell className="text-xs text-right bg-red-50/30 tabular-nums">
                                {isOut && m.unitCost > 0 ? formatCurrency(m.unitCost) : "-"}
                              </TableCell>
                              <TableCell className="text-xs text-right bg-red-50/30 tabular-nums font-medium">
                                {isOut && m.totalCost > 0 ? formatCurrency(m.totalCost) : "-"}
                              </TableCell>
                              <TableCell className="text-xs text-right bg-amber-50/30 tabular-nums font-medium">
                                {isOut && m.totalSell > 0 ? (
                                  <span className="text-amber-700">{formatCurrency(m.totalSell)}</span>
                                ) : "-"}
                              </TableCell>
                              <TableCell className="text-xs text-right bg-yellow-50/30 tabular-nums font-medium">
                                {isOut && m.grossProfit !== undefined && m.grossProfit !== 0 ? (
                                  <span className={m.grossProfit > 0 ? "text-emerald-700" : "text-red-600"}>
                                    {m.grossProfit < 0 ? `-${formatCurrency(Math.abs(m.grossProfit))}` : formatCurrency(m.grossProfit)}
                                  </span>
                                ) : "-"}
                              </TableCell>
                              <TableCell className={`text-xs text-right bg-blue-50/30 font-bold tabular-nums ${m.runningQty < 0 ? "text-red-600" : ""}`} data-testid={`text-balance-${m.id}`}>
                                {formatNumber(m.runningQty, 2)}
                              </TableCell>
                              <TableCell className="text-xs text-right bg-blue-50/30 tabular-nums">
                                {formatCurrency(m.runningUnitCost)}
                              </TableCell>
                              <TableCell className={`text-xs text-right bg-blue-50/30 tabular-nums font-medium ${m.runningValue < 0 ? "text-red-600" : ""}`}>
                                {m.runningValue < 0 ? `-${formatCurrency(Math.abs(m.runningValue))}` : formatCurrency(m.runningValue)}
                              </TableCell>
                              <TableCell className="text-center">
                                {m.movementType === "initial" && !m.referenceType && (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      className="p-1 rounded hover:bg-blue-50 text-blue-500 hover:text-blue-700"
                                      title="แก้ไขต้นทุน"
                                      data-testid={`button-edit-cost-${m.id}`}
                                      onClick={() => { setEditMovement({ id: m.id, unitCost: String(m.unitCost || 0), qty: Math.abs(qty) }); setEditUnitCost(String(m.unitCost || 0)); }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                    <button
                                      className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600"
                                      title="ลบรายการนี้"
                                      data-testid={`button-delete-movement-${m.id}`}
                                      onClick={() => setDeleteMovementId(m.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Dialog แก้ไขต้นทุน */}
      <Dialog open={!!editMovement} onOpenChange={(o) => { if (!o) setEditMovement(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4 text-blue-500" /> แก้ไขราคาต้นทุน</DialogTitle>
            <DialogDescription>รายการยอดเปิด — จำนวน {editMovement?.qty ?? 0} หน่วย<br/>ระบบจะบันทึก log ว่าใครแก้และเมื่อไหร่</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <label className="text-sm font-medium">ราคาต้นทุน / หน่วย (บาท)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={editUnitCost}
              onChange={(e) => setEditUnitCost(e.target.value)}
              placeholder="0.00"
              data-testid="input-edit-unit-cost"
              autoFocus
            />
            {editMovement && Number(editUnitCost) > 0 && (
              <p className="text-xs text-muted-foreground">ต้นทุนรวม = {(editMovement.qty * Number(editUnitCost)).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</p>
            )}
          </div>
          <DialogFooter>
            <button className="px-4 py-2 rounded text-sm border hover:bg-slate-50" onClick={() => setEditMovement(null)}>ยกเลิก</button>
            <button
              className="px-4 py-2 rounded text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={editCostMutation.isPending || !editUnitCost}
              data-testid="button-confirm-edit-cost"
              onClick={() => { if (editMovement) editCostMutation.mutate({ id: editMovement.id, unitCost: editUnitCost }); }}
            >
              {editCostMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog ยืนยันลบรายการ */}
      <Dialog open={!!deleteMovementId} onOpenChange={(o) => { if (!o) setDeleteMovementId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><Trash2 className="h-4 w-4" /> ยืนยันการลบ</DialogTitle>
            <DialogDescription>รายการยอดเปิดนี้จะถูกลบออกจากประวัติสต๊อก และจะปรับยอดคงเหลือสินค้านี้ให้ลดลงตามจำนวนที่ลบ กด Sync ยอดคงเหลือเพื่ออัพเดทยอดต่อคลังด้วย</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button className="px-4 py-2 rounded text-sm border hover:bg-slate-50" onClick={() => setDeleteMovementId(null)}>ยกเลิก</button>
            <button
              className="px-4 py-2 rounded text-sm bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              disabled={deleteMovementMutation.isPending}
              data-testid="button-confirm-delete-movement"
              onClick={() => { if (deleteMovementId) deleteMovementMutation.mutate(deleteMovementId); }}
            >
              {deleteMovementMutation.isPending ? "กำลังลบ..." : "ลบรายการ"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayoutComponent>
  );
}
