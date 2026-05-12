import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import {
  Search, Package, Plus, Minus, ArrowDownToLine, ArrowUpFromLine,
  RotateCcw, History, Warehouse as WarehouseIcon, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, FileDown, FileUp, RefreshCw,
  ChevronDown, Eye, BarChart3, BoxIcon, LayoutGrid, List, X,
  DollarSign, Tag, Layers, ArrowRight, Download, Upload,
  Building2, MapPin, Phone, User, Star, Pencil, Trash2, ArrowLeftRight
} from "lucide-react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Product, ProductStock, StockMovement } from "@shared/schema";
import { formatDateTime } from "@/lib/format";
import { toLocalDateStr } from "@/lib/utils";

import { useDateSettings } from "@/hooks/use-date-settings";
const MOVEMENT_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  receive: { label: "รับสินค้าเข้า", color: "text-emerald-700 bg-emerald-50", icon: ArrowDownToLine },
  adjust_in: { label: "ปรับเพิ่ม", color: "text-[#fec90f] bg-[#fffcf0]", icon: Plus },
  adjust_out: { label: "ปรับลด", color: "text-amber-700 bg-amber-50", icon: Minus },
  sale_deduct: { label: "ขาย (ตัดสต๊อก)", color: "text-red-700 bg-red-50", icon: ArrowUpFromLine },
  return: { label: "รับคืน", color: "text-purple-700 bg-purple-50", icon: RotateCcw },
  transfer: { label: "โอนย้าย", color: "text-[#fec90f] bg-[#fffcf0]", icon: RefreshCw },
  initial: { label: "ตั้งต้น", color: "text-slate-700 bg-slate-50", icon: BoxIcon },
  production: { label: "ผลิต", color: "text-cyan-700 bg-cyan-50", icon: Package },
};

function formatNumber(val: string | number | null | undefined, decimals = 0): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatCurrency(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getStockStatus(qty: number): { label: string; color: string; bgColor: string; borderColor: string } {
  if (qty <= 0) return { label: "หมด", color: "text-red-700", bgColor: "bg-red-50", borderColor: "border-red-200" };
  if (qty <= 10) return { label: "ใกล้หมด", color: "text-amber-700", bgColor: "bg-amber-50", borderColor: "border-amber-200" };
  return { label: "ปกติ", color: "text-emerald-700", bgColor: "bg-emerald-50", borderColor: "border-emerald-200" };
}

const VAT_LABELS: Record<string, string> = {
  vat7: "VAT 7%",
  non_vat: "ไม่มี VAT",
  zero_rated: "VAT 0%",
};

export default function WarehousePage(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }> } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { dateEra, dateFmt } = useDateSettings();
  const { data: docSettings } = useQuery<any>({
    queryKey: ["/api/document-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const res = await fetch(`/api/document-settings?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState("overview");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [searchText, setSearchText] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [showReceiveDialog, setShowReceiveDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showStockCardDialog, setShowStockCardDialog] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [movementProductFilter, setMovementProductFilter] = useState<string>("all");
  const [showWarehouseDialog, setShowWarehouseDialog] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<any>(null);
  const [whCode, setWhCode] = useState("");
  const [whName, setWhName] = useState("");
  const [whAddress, setWhAddress] = useState("");
  const [whContactName, setWhContactName] = useState("");
  const [whContactPhone, setWhContactPhone] = useState("");
  const [whIsDefault, setWhIsDefault] = useState(false);
  const [, setLocation] = useLocation();

  const { data: warehouseList = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouses", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/warehouses?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const createWarehouseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/warehouses", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "สร้างคลังสำเร็จ", variant: "success" as any });
      setShowWarehouseDialog(false);
      resetWhForm();
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const updateWarehouseMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/warehouses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "แก้ไขคลังสำเร็จ", variant: "success" as any });
      setShowWarehouseDialog(false);
      resetWhForm();
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const deleteWarehouseMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/warehouses/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "ลบคลังสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => {
      toast({ title: "ไม่สามารถลบได้", description: err.message, variant: "destructive" });
    },
  });

  const resetWhForm = () => {
    setEditingWarehouse(null);
    setWhCode("");
    setWhName("");
    setWhAddress("");
    setWhContactName("");
    setWhContactPhone("");
    setWhIsDefault(false);
  };

  const openEditWarehouse = (wh: any) => {
    setEditingWarehouse(wh);
    setWhCode(wh.code || "");
    setWhName(wh.name || "");
    setWhAddress(wh.address || "");
    setWhContactName(wh.contactName || "");
    setWhContactPhone(wh.contactPhone || "");
    setWhIsDefault(wh.isDefault || false);
    setShowWarehouseDialog(true);
  };

  const handleSaveWarehouse = () => {
    if (!whCode.trim() || !whName.trim()) {
      toast({ title: "กรุณากรอกรหัสและชื่อคลัง", variant: "destructive" });
      return;
    }
    const payload = {
      companyId: companyId!,
      code: whCode.trim(),
      name: whName.trim(),
      address: whAddress.trim() || undefined,
      contactName: whContactName.trim() || undefined,
      contactPhone: whContactPhone.trim() || undefined,
      isDefault: whIsDefault,
    };
    if (editingWarehouse) {
      updateWarehouseMutation.mutate({ id: editingWarehouse.id, data: payload });
    } else {
      createWarehouseMutation.mutate(payload);
    }
  };

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/products?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: stockData = [] } = useQuery<ProductStock[]>({
    queryKey: ["/api/product-stock", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/product-stock?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: stockByWarehouse = {} } = useQuery<Record<number, { warehouseName: string; qty: number }[]>>({
    queryKey: ["/api/inventory/stock-by-warehouse", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/inventory/stock-by-warehouse?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    enabled: !!companyId,
  });

  const { data: movements = [] } = useQuery<StockMovement[]>({
    queryKey: ["/api/stock-movements", companyId, movementProductFilter],
    queryFn: async () => {
      let url = `/api/stock-movements?companyId=${companyId}`;
      if (movementProductFilter !== "all") url += `&productId=${movementProductFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: cardMovements = [] } = useQuery<StockMovement[]>({
    queryKey: ["/api/stock-movements", companyId, "card", selectedProductId],
    queryFn: async () => {
      const res = await fetch(`/api/stock-movements?companyId=${companyId}&productId=${selectedProductId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId && !!selectedProductId && showStockCardDialog,
  });

  const adjustMutation = useMutation({
    mutationFn: async (data: { companyId: number; productId: number; quantity: string; movementType: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/product-stock/adjust", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-movements"] });
      toast({ title: "ปรับสต๊อกสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (data: { companyId: number; items: any[] }) => {
      const res = await apiRequest("POST", "/api/product-stock/bulk-adjust", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-movements"] });
      toast({ title: `นำเข้าสำเร็จ ${data.successCount}/${data.total} รายการ`, description: data.errorCount > 0 ? `ผิดพลาด ${data.errorCount} รายการ` : undefined, variant: "success" as any });
      setShowImportDialog(false);
    },
    onError: (err: any) => {
      toast({ title: "นำเข้าล้มเหลว", description: err.message, variant: "destructive" });
    },
  });

  const syncStockMutation = useMutation({
    mutationFn: async (companyId: number) => {
      const res = await fetch("/api/product-stock/sync-from-warehouse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || "sync ล้มเหลว"); }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/product-stock"] });
      toast({ title: `Sync สำเร็จ`, description: `อัปเดตยอดคงเหลือ ${data.synced} รายการ`, variant: "success" as any });
    },
    onError: (err: any) => {
      toast({ title: "Sync ล้มเหลว", description: err.message, variant: "destructive" });
    },
  });

  const stockMap = new Map<number, ProductStock>();
  stockData.forEach(s => stockMap.set(s.productId, s));

  const productsWithStock = products
    .filter(p => showInactive || (p as any).active)
    .map(p => ({
      ...p,
      stock: stockMap.get(p.id),
      currentQty: parseFloat(stockMap.get(p.id)?.quantity || "0"),
      reservedQty: parseFloat(stockMap.get(p.id)?.reservedQty || "0"),
    }));

  const filteredProducts = productsWithStock.filter(p =>
    !searchText || p.name.toLowerCase().includes(searchText.toLowerCase()) ||
    (p.code && p.code.toLowerCase().includes(searchText.toLowerCase()))
  );

  const totalItems = productsWithStock.length;
  const totalStock = productsWithStock.reduce((s, p) => s + p.currentQty, 0);
  const lowStockCount = productsWithStock.filter(p => p.currentQty > 0 && p.currentQty <= 10).length;
  const outOfStockCount = productsWithStock.filter(p => p.currentQty <= 0).length;
  const totalValue = productsWithStock.reduce((s, p) => s + p.currentQty * parseFloat(String(p.cost || "0")), 0);

  const handleExportCSV = () => {
    const headers = ["รหัสสินค้า", "ชื่อสินค้า", "หมวดหมู่", "หน่วย", "ราคาขาย", "ต้นทุน", "VAT", "คงเหลือ", "จอง", "พร้อมขาย", "มูลค่าสต๊อก", "สถานะ"];
    const rows = productsWithStock.map(p => {
      const available = p.currentQty - p.reservedQty;
      const stockValue = p.currentQty * parseFloat(String(p.cost || "0"));
      const status = getStockStatus(p.currentQty);
      return [
        p.code || "",
        p.name,
        p.category || "",
        p.unit || "",
        p.price || "0",
        p.cost || "0",
        VAT_LABELS[p.vatType] || p.vatType,
        String(p.currentQty),
        String(p.reservedQty),
        String(available),
        stockValue.toFixed(2),
        status.label,
      ];
    });
    const BOM = "\uFEFF";
    const csvContent = BOM + [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock_export_${toLocalDateStr(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "ส่งออกสำเร็จ", description: `ส่งออก ${productsWithStock.length} รายการ`, variant: "success" as any });
  };

  const handleExportMovements = () => {
    const headers = ["วันที่", "รหัสสินค้า", "ชื่อสินค้า", "ประเภท", "จำนวน", "หมายเหตุ"];
    const rows = movements.map(m => {
      const product = products.find(p => p.id === m.productId);
      const mv = MOVEMENT_LABELS[m.movementType] || { label: m.movementType };
      return [
        formatDateTime(m.createdAt as any, dateEra, dateFmt),
        product?.code || "",
        product?.name || `#${m.productId}`,
        mv.label,
        m.quantity,
        m.notes || "",
      ];
    });
    const BOM = "\uFEFF";
    const csvContent = BOM + [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock_movements_${toLocalDateStr(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({ title: "ส่งออกประวัติสำเร็จ", description: `ส่งออก ${movements.length} รายการ`, variant: "success" as any });
  };

  const handleOpenStockCard = (productId: number) => {
    setSelectedProductId(productId);
    setShowStockCardDialog(true);
  };

  return (
    <LayoutComponent>
      <div className="space-y-4" data-testid="warehouse-page">
        <div className="rounded-lg p-6 shadow-sm border" style={{ background: "#fef9c3" }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
                <WarehouseIcon className="h-7 w-7" />
                คลังสินค้า
              </h1>
              <p className="mt-1 text-yellow-800/60 text-sm">
                จัดการสต๊อกสินค้า รับเข้า ปรับยอด และดูประวัติความเคลื่อนไหว
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="bg-white border-yellow-300 text-yellow-800 hover:bg-yellow-50 font-semibold h-9"
                onClick={() => { setSelectedProductId(null); setShowReceiveDialog(true); }}
                data-testid="button-receive-stock"
              >
                <ArrowDownToLine className="h-4 w-4 mr-1" />
                รับสินค้าเข้า
              </Button>
              <Button
                variant="outline"
                className="bg-white/60 border-yellow-300 text-yellow-800 hover:bg-white h-9"
                onClick={() => { setSelectedProductId(null); setShowAdjustDialog(true); }}
                data-testid="button-adjust-stock"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                ปรับสต๊อก
              </Button>
              <Button
                variant="outline"
                className="bg-white/60 border-yellow-300 text-yellow-800 hover:bg-white h-9"
                onClick={() => setShowImportDialog(true)}
                data-testid="button-import-stock"
              >
                <Upload className="h-4 w-4 mr-1" />
                นำเข้า
              </Button>
              <Button
                variant="outline"
                className="bg-white/60 border-yellow-300 text-yellow-800 hover:bg-white h-9"
                onClick={handleExportCSV}
                data-testid="button-export-stock"
              >
                <Download className="h-4 w-4 mr-1" />
                ส่งออก
              </Button>
              <Button
                variant="outline"
                className="bg-white/60 border-yellow-300 text-yellow-800 hover:bg-white h-9"
                onClick={() => companyId && syncStockMutation.mutate(companyId)}
                disabled={syncStockMutation.isPending}
                data-testid="button-sync-stock"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${syncStockMutation.isPending ? "animate-spin" : ""}`} />
                Sync ยอดคงเหลือ
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="border shadow-sm bg-amber-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-amber-700/70">สินค้าทั้งหมด</p>
                  <p className="text-2xl font-bold text-amber-800" data-testid="text-total-items">{totalItems}</p>
                  <p className="text-xs text-amber-700/70">รายการ</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Package className="h-5 w-5 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-sm bg-emerald-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-emerald-700/70">สต๊อกรวม</p>
                  <p className="text-2xl font-bold text-emerald-800 truncate" data-testid="text-total-stock">{formatNumber(totalStock)}</p>
                  <p className="text-xs text-emerald-700/70">ชิ้น</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-sm bg-violet-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-violet-700/70">มูลค่าสต๊อก</p>
                  <p className="text-lg font-bold text-violet-800 truncate" data-testid="text-total-value" title={`฿${formatCurrency(totalValue)}`}>฿{formatCurrency(totalValue)}</p>
                  <p className="text-xs text-violet-700/70">บาท (ต้นทุน)</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <DollarSign className="h-5 w-5 text-violet-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-sm bg-orange-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-orange-700/70">สินค้าใกล้หมด</p>
                  <p className="text-2xl font-bold text-orange-700" data-testid="text-low-stock">{lowStockCount}</p>
                  <p className="text-xs text-orange-700/70">รายการ (≤10)</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-sm bg-rose-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-rose-700/70">สินค้าหมด</p>
                  <p className="text-2xl font-bold text-rose-700" data-testid="text-out-of-stock">{outOfStockCount}</p>
                  <p className="text-xs text-rose-700/70">รายการ</p>
                </div>
                <div className="h-10 w-10 rounded-lg bg-rose-100 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList className="bg-white border shadow-sm">
              <TabsTrigger value="overview" className="gap-1" data-testid="tab-overview">
                <Package className="h-3.5 w-3.5" /> สรุปสต๊อก
              </TabsTrigger>
              <TabsTrigger value="movements" className="gap-1" data-testid="tab-movements">
                <History className="h-3.5 w-3.5" /> ประวัติความเคลื่อนไหว
              </TabsTrigger>
              <TabsTrigger value="warehouses" className="gap-1" data-testid="tab-warehouses">
                <Building2 className="h-3.5 w-3.5" /> จัดการคลัง
              </TabsTrigger>
            </TabsList>
            {activeTab === "overview" && (
              <div className="flex items-center gap-1 bg-white border rounded-md shadow-sm p-0.5">
                <Button
                  variant={viewMode === "cards" ? "default" : "ghost"}
                  size="sm"
                  className={`h-7 px-2 ${viewMode === "cards" ? "bg-[#fec90f] text-white" : ""}`}
                  onClick={() => setViewMode("cards")}
                  data-testid="button-view-cards"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={viewMode === "table" ? "default" : "ghost"}
                  size="sm"
                  className={`h-7 px-2 ${viewMode === "table" ? "bg-[#fec90f] text-white" : ""}`}
                  onClick={() => setViewMode("table")}
                  data-testid="button-view-table"
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          <TabsContent value="overview">
            <div className="mb-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาชื่อสินค้า หรือรหัส..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 h-9 bg-white border shadow-sm"
                  data-testid="input-search-stock"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  id="show-inactive-warehouse"
                  data-testid="switch-show-inactive-warehouse"
                  checked={showInactive}
                  onCheckedChange={setShowInactive}
                />
                <Label htmlFor="show-inactive-warehouse" className="text-xs cursor-pointer text-muted-foreground">
                  แสดงสินค้าเลิกใช้งาน
                </Label>
              </div>
            </div>

            {viewMode === "cards" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.length === 0 ? (
                  <div className="col-span-full flex flex-col items-center gap-3 text-muted-foreground py-16">
                    <Package className="h-12 w-12 text-slate-300" />
                    <p className="font-medium">ยังไม่มีสินค้าในคลัง</p>
                    <p className="text-sm">เพิ่มสินค้าที่เมนู สินค้า &gt; รายการสินค้า แล้วกลับมารับสินค้าเข้าคลัง</p>
                  </div>
                ) : (
                  filteredProducts.map(p => {
                    const available = p.currentQty - p.reservedQty;
                    const stockValue = p.currentQty * parseFloat(String(p.cost || "0"));
                    const status = getStockStatus(p.currentQty);
                    return (
                      <Card
                        key={p.id}
                        className={`border shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden ${status.borderColor} ${!(p as any).active ? "opacity-60" : ""}`}
                        onClick={() => handleOpenStockCard(p.id)}
                        data-testid={`card-product-${p.id}`}
                      >
                        <div className={`absolute top-0 left-0 right-0 h-1 ${p.currentQty <= 0 ? "bg-[#f94d4d]" : p.currentQty <= 10 ? "bg-[#fec90f]" : "bg-[#05b187]"}`} />
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                {p.code && (
                                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{p.code}</span>
                                )}
                                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${status.bgColor} ${status.color} ${status.borderColor}`}>
                                  {status.label}
                                </Badge>
                                {!(p as any).active && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 border-red-300" data-testid={`badge-inactive-card-${p.id}`}>
                                    เลิกใช้งาน
                                  </Badge>
                                )}
                              </div>
                              <h3 className="text-sm font-semibold text-slate-800 truncate" data-testid={`text-card-name-${p.id}`}>{p.name}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                {p.category && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Tag className="h-2.5 w-2.5" />{p.category}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground">{p.unit}</span>
                                <span className="text-[10px] text-muted-foreground">{VAT_LABELS[p.vatType] || p.vatType}</span>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="text-center p-2 rounded-lg bg-slate-50">
                              <p className="text-[10px] text-muted-foreground">คงเหลือ</p>
                              <p className={`text-lg font-bold ${status.color}`} data-testid={`text-card-qty-${p.id}`}>
                                {formatNumber(p.currentQty)}
                              </p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-slate-50">
                              <p className="text-[10px] text-muted-foreground">จอง</p>
                              <p className="text-lg font-bold text-slate-600">{formatNumber(p.reservedQty)}</p>
                            </div>
                            <div className="text-center p-2 rounded-lg bg-emerald-50">
                              <p className="text-[10px] text-muted-foreground">พร้อมขาย</p>
                              <p className="text-lg font-bold text-emerald-700">{formatNumber(available)}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] border-t pt-2">
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">
                                ราคา: <span className="font-semibold text-slate-700">฿{formatCurrency(p.price)}</span>
                              </span>
                              <span className="text-muted-foreground">
                                ทุน: <span className="font-semibold text-slate-700">฿{formatCurrency(p.cost)}</span>
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-1.5">
                            <span className="text-[10px] text-muted-foreground">
                              มูลค่าสต๊อก: <span className="font-bold text-purple-700">฿{formatCurrency(stockValue)}</span>
                            </span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2 gap-0.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                onClick={(e) => { e.stopPropagation(); setSelectedProductId(p.id); setShowReceiveDialog(true); }}
                                data-testid={`button-card-receive-${p.id}`}
                              >
                                <ArrowDownToLine className="h-2.5 w-2.5" /> รับเข้า
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2 gap-0.5"
                                onClick={(e) => { e.stopPropagation(); setSelectedProductId(p.id); setShowAdjustDialog(true); }}
                                data-testid={`button-card-adjust-${p.id}`}
                              >
                                <RotateCcw className="h-2.5 w-2.5" /> ปรับ
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            ) : (
              <Card className="shadow-sm border bg-white">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="hover:bg-transparent h-10">
                        <TableHead className="w-10 text-center">#</TableHead>
                        <TableHead className="w-24">รหัส</TableHead>
                        <TableHead>ชื่อสินค้า</TableHead>
                        <TableHead className="w-24">หมวดหมู่</TableHead>
                        <TableHead className="w-24 text-right">ราคาขาย</TableHead>
                        <TableHead className="w-24 text-right">ต้นทุน</TableHead>
                        <TableHead className="w-28 text-right">คงเหลือ</TableHead>
                        <TableHead className="w-44">แยกตามคลัง</TableHead>
                        <TableHead className="w-28 text-right">จอง</TableHead>
                        <TableHead className="w-28 text-right">พร้อมขาย</TableHead>
                        <TableHead className="w-28 text-right">มูลค่า</TableHead>
                        <TableHead className="w-20 text-center">สถานะ</TableHead>
                        <TableHead className="w-32 text-center">จัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredProducts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={13} className="text-center py-16">
                            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                              <Package className="h-12 w-12 text-slate-300" />
                              <p className="font-medium">ยังไม่มีสินค้าในคลัง</p>
                              <p className="text-sm">เพิ่มสินค้าที่เมนู สินค้า &gt; รายการสินค้า แล้วกลับมารับสินค้าเข้าคลัง</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredProducts.map((p, idx) => {
                          const available = p.currentQty - p.reservedQty;
                          const stockValue = p.currentQty * parseFloat(String(p.cost || "0"));
                          const status = getStockStatus(p.currentQty);
                          return (
                            <TableRow
                              key={p.id}
                              className={`hover:bg-[#fffcf0]/50 border-b cursor-pointer ${!(p as any).active ? "opacity-60 bg-slate-50" : ""}`}
                              onClick={() => handleOpenStockCard(p.id)}
                              data-testid={`row-product-${p.id}`}
                            >
                              <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="text-xs text-slate-500">{p.code || "-"}</TableCell>
                              <TableCell>
                                <div className="text-xs font-medium flex items-center gap-2" data-testid={`text-product-name-${p.id}`}>
                                  {p.name}
                                  {!(p as any).active && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700 border-red-300" data-testid={`badge-inactive-row-${p.id}`}>
                                      เลิกใช้งาน
                                    </Badge>
                                  )}
                                </div>
                                {p.unit && <div className="text-[10px] text-muted-foreground">หน่วย: {p.unit}</div>}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{p.category || "-"}</TableCell>
                              <TableCell className="text-right text-xs">฿{formatCurrency(p.price)}</TableCell>
                              <TableCell className="text-right text-xs">฿{formatCurrency(p.cost)}</TableCell>
                              <TableCell className="text-right">
                                <span className={`text-sm font-bold ${status.color}`} data-testid={`text-qty-${p.id}`}>
                                  {formatNumber(p.currentQty)}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs" data-testid={`text-warehouse-stock-${p.id}`}>
                                {(() => {
                                  const wStocks = stockByWarehouse[p.id];
                                  if (!wStocks || wStocks.length === 0) return <span className="text-muted-foreground">-</span>;
                                  const sorted = [...wStocks].sort((a, b) => b.qty - a.qty);
                                  const show = sorted.slice(0, 2);
                                  const rest = sorted.slice(2);
                                  const allText = sorted.map(ws => `${ws.warehouseName}: ${formatNumber(ws.qty, 0)}`).join("\n");
                                  return (
                                    <div className="flex flex-wrap gap-1" title={allText}>
                                      {show.map((ws, i) => (
                                        <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-50 text-[11px] leading-tight whitespace-nowrap">
                                          <span className="text-gray-600 max-w-[60px] truncate">{ws.warehouseName}</span>
                                          <span className="font-semibold text-blue-700 tabular-nums">{formatNumber(ws.qty, 0)}</span>
                                        </span>
                                      ))}
                                      {rest.length > 0 && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-[11px] text-gray-500 cursor-help" title={allText}>
                                          +{rest.length}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">
                                {formatNumber(p.reservedQty)}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="text-xs font-semibold text-emerald-700">{formatNumber(available)}</span>
                              </TableCell>
                              <TableCell className="text-right text-xs text-purple-700 font-medium">
                                ฿{formatCurrency(stockValue)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className={`text-[10px] ${status.bgColor} ${status.color} ${status.borderColor}`}>{status.label}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="outline" size="sm"
                                    className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                    onClick={() => { setSelectedProductId(p.id); setShowReceiveDialog(true); }}
                                    data-testid={`button-receive-${p.id}`}
                                  >
                                    <ArrowDownToLine className="h-3 w-3" /> รับเข้า
                                  </Button>
                                  <Button
                                    variant="outline" size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => { setSelectedProductId(p.id); setShowAdjustDialog(true); }}
                                    data-testid={`button-adjust-${p.id}`}
                                  >
                                    <RotateCcw className="h-3 w-3" /> ปรับ
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                  {filteredProducts.length > 0 && (
                    <div className="flex items-center justify-between p-4 border-t bg-slate-50/50">
                      <span className="text-xs text-muted-foreground">แสดง {filteredProducts.length} รายการ</span>
                      <span className="text-xs font-medium">สต๊อกรวม: {formatNumber(totalStock)} ชิ้น | มูลค่ารวม: ฿{formatCurrency(totalValue)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {filteredProducts.length > 0 && viewMode === "cards" && (
              <div className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm">
                <span className="text-xs text-muted-foreground">แสดง {filteredProducts.length} รายการ</span>
                <span className="text-xs font-medium">สต๊อกรวม: {formatNumber(totalStock)} ชิ้น | มูลค่ารวม: ฿{formatCurrency(totalValue)}</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="movements">
            <Card className="shadow-sm border bg-white">
              <CardHeader className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Select value={movementProductFilter} onValueChange={setMovementProductFilter}>
                      <SelectTrigger className="h-9 w-[250px]" data-testid="select-movement-product">
                        <SelectValue placeholder="เลือกสินค้า" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">ทุกสินค้า</SelectItem>
                        {products.map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline" size="sm" className="h-8 gap-1"
                    onClick={handleExportMovements}
                    disabled={movements.length === 0}
                    data-testid="button-export-movements"
                  >
                    <Download className="h-3.5 w-3.5" /> ส่งออก CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow className="hover:bg-transparent h-10">
                      <TableHead className="w-10 text-center">#</TableHead>
                      <TableHead className="w-40">วันที่</TableHead>
                      <TableHead>สินค้า</TableHead>
                      <TableHead className="w-36">ประเภท</TableHead>
                      <TableHead className="w-28 text-right">จำนวน</TableHead>
                      <TableHead>หมายเหตุ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-16">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <History className="h-12 w-12 text-slate-300" />
                            <p className="font-medium">ยังไม่มีประวัติความเคลื่อนไหว</p>
                            <p className="text-sm">เมื่อมีการรับสินค้า ปรับสต๊อก หรือขาย จะแสดงที่นี่</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      movements.map((m, idx) => {
                        const mv = MOVEMENT_LABELS[m.movementType] || { label: m.movementType, color: "text-slate-700 bg-slate-50", icon: History };
                        const MvIcon = mv.icon;
                        const qty = parseFloat(m.quantity);
                        const productName = products.find(p => p.id === m.productId)?.name || `#${m.productId}`;
                        return (
                          <TableRow key={m.id} className="hover:bg-[#fffcf0]/50 border-b" data-testid={`row-movement-${m.id}`}>
                            <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="text-xs">{formatDateTime(m.createdAt as any, dateEra, dateFmt)}</TableCell>
                            <TableCell className="text-xs font-medium">{productName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1 ${mv.color}`}>
                                <MvIcon className="h-3 w-3" />
                                {mv.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`text-sm font-bold ${qty >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                                {qty >= 0 ? "+" : ""}{formatNumber(qty)}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                              {m.notes || "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                {movements.length > 0 && (
                  <div className="p-4 border-t bg-slate-50/50 text-xs text-muted-foreground">
                    แสดง {movements.length} รายการ
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="warehouses">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    รายการคลังสินค้า ({warehouseList.length})
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 border-[#03c9d7] text-[#03c9d7] hover:bg-[#03c9d7]/10"
                      onClick={() => setLocation("/inventory/stock-transfer")}
                      data-testid="button-go-transfer"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5 mr-1" />
                      โอนย้ายสินค้าระหว่างคลัง
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 bg-[#fb9678] hover:bg-[#fb9678]/90 text-white"
                      onClick={() => { resetWhForm(); setShowWarehouseDialog(true); }}
                      data-testid="button-add-warehouse"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      เพิ่มคลังสินค้า
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {warehouseList.length === 0 ? (
                  <div className="p-12 text-center">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground font-medium">ยังไม่มีคลังสินค้า</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">กดปุ่ม "เพิ่มคลังสินค้า" เพื่อสร้างคลังแรก</p>
                    <Button
                      className="mt-4 bg-[#fb9678] hover:bg-[#fb9678]/90 text-white"
                      onClick={() => { resetWhForm(); setShowWarehouseDialog(true); }}
                      data-testid="button-add-warehouse-empty"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      เพิ่มคลังสินค้า
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="w-20">รหัส</TableHead>
                          <TableHead>ชื่อคลัง</TableHead>
                          <TableHead>ที่อยู่</TableHead>
                          <TableHead className="w-32">ผู้ติดต่อ</TableHead>
                          <TableHead className="w-28">โทรศัพท์</TableHead>
                          <TableHead className="w-20 text-center">ค่าเริ่มต้น</TableHead>
                          <TableHead className="w-24 text-center">จัดการ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {warehouseList.map((wh: any) => (
                          <TableRow key={wh.id} data-testid={`row-warehouse-${wh.id}`}>
                            <TableCell className="font-mono text-sm">{wh.code}</TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                {wh.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {wh.address || "-"}
                            </TableCell>
                            <TableCell className="text-sm">{wh.contactName || "-"}</TableCell>
                            <TableCell className="text-sm">{wh.contactPhone || "-"}</TableCell>
                            <TableCell className="text-center">
                              {wh.isDefault ? (
                                <Badge className="bg-[#fec90f]/10 text-[#fec90f] border-[#fec90f]/30 text-xs">
                                  <Star className="h-3 w-3 mr-0.5" />
                                  หลัก
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-[#fb9678]"
                                  onClick={() => openEditWarehouse(wh)}
                                  data-testid={`button-edit-warehouse-${wh.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {!wh.isDefault && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                                    onClick={() => {
                                      if (confirm(`ลบคลัง "${wh.name}" ?`)) deleteWarehouseMutation.mutate(wh.id);
                                    }}
                                    data-testid={`button-delete-warehouse-${wh.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={showWarehouseDialog} onOpenChange={(open) => { if (!open) { setShowWarehouseDialog(false); resetWhForm(); } }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
            <DialogHeader>
              <DialogTitle>{editingWarehouse ? "แก้ไขคลังสินค้า" : "เพิ่มคลังสินค้าใหม่"}</DialogTitle>
              <DialogDescription>กรอกข้อมูลคลังสินค้า</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>รหัสคลัง *</Label>
                  <Input
                    value={whCode}
                    onChange={(e) => setWhCode(e.target.value)}
                    placeholder="WH01"
                    data-testid="input-wh-code"
                  />
                </div>
                <div>
                  <Label>ชื่อคลัง *</Label>
                  <Input
                    value={whName}
                    onChange={(e) => setWhName(e.target.value)}
                    placeholder="คลังหลัก"
                    data-testid="input-wh-name"
                  />
                </div>
              </div>
              <div>
                <Label>ที่อยู่</Label>
                <Textarea
                  value={whAddress}
                  onChange={(e) => setWhAddress(e.target.value)}
                  placeholder="ที่อยู่คลังสินค้า"
                  rows={2}
                  data-testid="input-wh-address"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>ผู้ติดต่อ</Label>
                  <Input
                    value={whContactName}
                    onChange={(e) => setWhContactName(e.target.value)}
                    placeholder="ชื่อผู้ดูแล"
                    data-testid="input-wh-contact"
                  />
                </div>
                <div>
                  <Label>โทรศัพท์</Label>
                  <Input
                    value={whContactPhone}
                    onChange={(e) => setWhContactPhone(e.target.value)}
                    placeholder="08X-XXXXXXX"
                    data-testid="input-wh-phone"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="wh-default"
                  checked={whIsDefault}
                  onChange={(e) => setWhIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                  data-testid="input-wh-default"
                />
                <Label htmlFor="wh-default" className="cursor-pointer text-sm">
                  ตั้งเป็นคลังเริ่มต้น (Default)
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowWarehouseDialog(false); resetWhForm(); }}>
                ยกเลิก
              </Button>
              <Button
                className="bg-[#fb9678] hover:bg-[#fb9678]/90 text-white"
                onClick={handleSaveWarehouse}
                disabled={createWarehouseMutation.isPending || updateWarehouseMutation.isPending}
                data-testid="button-save-warehouse"
              >
                {(createWarehouseMutation.isPending || updateWarehouseMutation.isPending) ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ReceiveStockDialog
          open={showReceiveDialog}
          onClose={() => { setShowReceiveDialog(false); setSelectedProductId(null); }}
          products={products}
          selectedProductId={selectedProductId}
          companyId={companyId}
          warehouses={warehouseList}
          onSubmit={(data) => adjustMutation.mutate(data)}
          isPending={adjustMutation.isPending}
        />

        <AdjustStockDialog
          open={showAdjustDialog}
          onClose={() => { setShowAdjustDialog(false); setSelectedProductId(null); }}
          products={products}
          selectedProductId={selectedProductId}
          companyId={companyId}
          stockMap={stockMap}
          warehouses={warehouseList}
          onSubmit={(data) => adjustMutation.mutate(data)}
          isPending={adjustMutation.isPending}
        />

        <StockCardDialog
          open={showStockCardDialog}
          onClose={() => { setShowStockCardDialog(false); setSelectedProductId(null); }}
          product={productsWithStock.find(p => p.id === selectedProductId) || null}
          movements={cardMovements}
          onReceive={() => { setShowStockCardDialog(false); setShowReceiveDialog(true); }}
          onAdjust={() => { setShowStockCardDialog(false); setShowAdjustDialog(true); }}
          dateEra={dateEra}
          dateFmt={dateFmt}
        />

        <ImportStockDialog
          open={showImportDialog}
          onClose={() => setShowImportDialog(false)}
          products={products}
          companyId={companyId}
          onSubmit={(items) => bulkImportMutation.mutate({ companyId: companyId!, items })}
          isPending={bulkImportMutation.isPending}
        />
      </div>
    </LayoutComponent>
  );
}

function StockCardDialog({ open, onClose, product, movements, onReceive, onAdjust, dateEra, dateFmt }: {
  open: boolean;
  onClose: () => void;
  product: (Product & { currentQty: number; reservedQty: number; stock?: ProductStock }) | null;
  movements: StockMovement[];
  onReceive: () => void;
  onAdjust: () => void;
  dateEra: string;
  dateFmt: string;
}) {
  if (!product) return null;
  const available = product.currentQty - product.reservedQty;
  const stockValue = product.currentQty * parseFloat(String(product.cost || "0"));
  const status = getStockStatus(product.currentQty);

  let runningBalance = 0;
  const movementsWithBalance = [...movements].reverse().map(m => {
    const qty = parseFloat(m.quantity);
    runningBalance += qty;
    return { ...m, balance: runningBalance };
  }).reverse();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-stock-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[#fec90f]" />
            Stock Card - {product.name}
          </DialogTitle>
          <DialogDescription>รายละเอียดสต๊อกและประวัติการเคลื่อนไหว</DialogDescription>
        </DialogHeader>

        <div className={`rounded-lg border-2 p-4 ${status.borderColor} ${status.bgColor}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {product.code && <span className="text-xs bg-white/80 px-2 py-0.5 rounded">{product.code}</span>}
                <Badge variant="outline" className={`text-xs ${status.bgColor} ${status.color} ${status.borderColor}`}>
                  {status.label}
                </Badge>
              </div>
              <h3 className="text-lg font-bold text-slate-800">{product.name}</h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {product.category && <span className="flex items-center gap-1"><Tag className="h-3 w-3" />{product.category}</span>}
                <span>หน่วย: {product.unit}</span>
                <span>{VAT_LABELS[product.vatType] || product.vatType}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-8 text-xs gap-1" onClick={onReceive}>
                <ArrowDownToLine className="h-3 w-3" /> รับเข้า
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={onAdjust}>
                <RotateCcw className="h-3 w-3" /> ปรับ
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-lg bg-slate-50 border">
            <p className="text-[10px] text-muted-foreground">คงเหลือ</p>
            <p className={`text-2xl font-bold ${status.color}`}>{formatNumber(product.currentQty)}</p>
            <p className="text-[10px] text-muted-foreground">{product.unit}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-slate-50 border">
            <p className="text-[10px] text-muted-foreground">จองแล้ว</p>
            <p className="text-2xl font-bold text-slate-600">{formatNumber(product.reservedQty)}</p>
            <p className="text-[10px] text-muted-foreground">{product.unit}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-emerald-50 border border-emerald-200">
            <p className="text-[10px] text-muted-foreground">พร้อมขาย</p>
            <p className="text-2xl font-bold text-emerald-700">{formatNumber(available)}</p>
            <p className="text-[10px] text-muted-foreground">{product.unit}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-purple-50 border border-purple-200">
            <p className="text-[10px] text-muted-foreground">มูลค่าสต๊อก</p>
            <p className="text-xl font-bold text-purple-700">฿{formatCurrency(stockValue)}</p>
            <p className="text-[10px] text-muted-foreground">บาท</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border">
            <p className="text-muted-foreground mb-1">ราคาขาย</p>
            <p className="font-bold text-slate-800">฿{formatCurrency(product.price)}</p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border">
            <p className="text-muted-foreground mb-1">ต้นทุน</p>
            <p className="font-bold text-slate-800">฿{formatCurrency(product.cost)}</p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <History className="h-4 w-4 text-[#fec90f]" />
            ประวัติความเคลื่อนไหว
          </h4>
          {movementsWithBalance.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              ยังไม่มีประวัติ
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="hover:bg-transparent h-8">
                    <TableHead className="text-[10px] w-32">วันที่</TableHead>
                    <TableHead className="text-[10px] w-28">ประเภท</TableHead>
                    <TableHead className="text-[10px] w-20 text-right">จำนวน</TableHead>
                    <TableHead className="text-[10px] w-20 text-right">คงเหลือ</TableHead>
                    <TableHead className="text-[10px]">หมายเหตุ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movementsWithBalance.slice(0, 20).map(m => {
                    const mv = MOVEMENT_LABELS[m.movementType] || { label: m.movementType, color: "text-slate-700 bg-slate-50", icon: History };
                    const MvIcon = mv.icon;
                    const qty = parseFloat(m.quantity);
                    return (
                      <TableRow key={m.id} className="hover:bg-[#fffcf0]/30 h-8">
                        <TableCell className="text-[10px] py-1">{formatDateTime(m.createdAt as any, dateEra, dateFmt)}</TableCell>
                        <TableCell className="py-1">
                          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 gap-0.5 ${mv.color}`}>
                            <MvIcon className="h-2.5 w-2.5" />{mv.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right py-1">
                          <span className={`text-xs font-bold ${qty >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                            {qty >= 0 ? "+" : ""}{formatNumber(qty)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-1 text-xs font-medium">{formatNumber(m.balance)}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground py-1 truncate max-w-[150px]">{m.notes || "-"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {movementsWithBalance.length > 20 && (
                <div className="p-2 text-center text-[10px] text-muted-foreground border-t bg-slate-50">
                  แสดง 20 จาก {movementsWithBalance.length} รายการ
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImportStockDialog({ open, onClose, products, companyId, onSubmit, isPending }: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  companyId: number | undefined;
  onSubmit: (items: any[]) => void;
  isPending: boolean;
}) {
  const [importData, setImportData] = useState<any[]>([]);
  const [parseError, setParseError] = useState("");
  const [importType, setImportType] = useState<string>("initial");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError("");

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
          setParseError("ไฟล์ต้องมีอย่างน้อย 2 บรรทัด (หัวตาราง + ข้อมูล)");
          return;
        }

        const header = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
        const codeIdx = header.findIndex(h => h.includes("รหัส") || h.includes("code") || h.includes("sku"));
        const qtyIdx = header.findIndex(h => h.includes("จำนวน") || h.includes("quantity") || h.includes("qty") || h.includes("คงเหลือ"));

        if (codeIdx === -1 || qtyIdx === -1) {
          setParseError("ไม่พบคอลัมน์ 'รหัสสินค้า' และ 'จำนวน' ในไฟล์ (ต้องมีคอลัมน์ชื่อ รหัส/code/sku และ จำนวน/quantity/qty)");
          return;
        }

        const notesIdx = header.findIndex(h => h.includes("หมายเหตุ") || h.includes("notes") || h.includes("note"));
        const parsed: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].match(/(".*?"|[^,]+)/g)?.map(c => c.replace(/"/g, "").trim()) || [];
          const code = cols[codeIdx]?.trim();
          const qty = parseFloat(cols[qtyIdx] || "0");
          const notes = notesIdx >= 0 ? cols[notesIdx]?.trim() || "" : "";

          if (!code || isNaN(qty) || qty === 0) continue;

          const product = products.find(p => p.code === code);
          parsed.push({
            code,
            quantity: String(Math.abs(qty)),
            notes,
            productId: product?.id || null,
            productName: product?.name || null,
            matched: !!product,
          });
        }

        if (parsed.length === 0) {
          setParseError("ไม่พบข้อมูลที่ถูกต้องในไฟล์");
          return;
        }

        setImportData(parsed);
      } catch (err) {
        setParseError("ไม่สามารถอ่านไฟล์ได้ กรุณาตรวจสอบรูปแบบ CSV");
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const BOM = "\uFEFF";
    const headers = "รหัสสินค้า,จำนวน,หมายเหตุ";
    const sampleRows = products.slice(0, 3).map(p => `"${p.code}","100","นำเข้าจากไฟล์"`).join("\n");
    const csvContent = BOM + headers + "\n" + (sampleRows || '"SKU001","100","ตัวอย่าง"');
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stock_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const matchedCount = importData.filter(d => d.matched).length;
  const unmatchedCount = importData.filter(d => !d.matched).length;

  const handleSubmit = () => {
    const items = importData.filter(d => d.matched).map(d => ({
      productId: d.productId,
      quantity: d.quantity,
      movementType: importType,
      notes: d.notes || `นำเข้าจากไฟล์ (${importType === "initial" ? "ตั้งต้น" : "รับเข้า"})`,
    }));
    if (items.length === 0) return;
    onSubmit(items);
    setImportData([]);
    setParseError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setImportData([]); setParseError(""); }}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto" data-testid="dialog-import-stock">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#fec90f]">
            <Upload className="h-5 w-5" />
            นำเข้าสต๊อกจากไฟล์ CSV
          </DialogTitle>
          <DialogDescription>อัพโหลดไฟล์ CSV เพื่อปรับสต๊อกสินค้าหลายรายการพร้อมกัน</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="p-3 bg-[#fffcf0] border border-[#fec90f]/20 rounded-lg text-xs text-[#fec90f]">
            <p className="font-semibold mb-1">รูปแบบไฟล์ CSV:</p>
            <p>ต้องมีคอลัมน์: <span className="bg-[#fffcf0] px-1 rounded">รหัสสินค้า</span> และ <span className="bg-[#fffcf0] px-1 rounded">จำนวน</span></p>
            <p className="mt-0.5">เสริม: <span className="bg-[#fffcf0] px-1 rounded">หมายเหตุ</span></p>
            <Button variant="link" size="sm" className="h-auto p-0 mt-1 text-[#fec90f]" onClick={handleDownloadTemplate}>
              <Download className="h-3 w-3 mr-1" /> ดาวน์โหลดไฟล์ตัวอย่าง
            </Button>
          </div>

          <div>
            <Label className="text-xs">ประเภทการนำเข้า</Label>
            <Select value={importType} onValueChange={setImportType}>
              <SelectTrigger className="h-9 mt-1" data-testid="select-import-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="initial">ตั้งต้นสต๊อก</SelectItem>
                <SelectItem value="receive">รับสินค้าเข้า</SelectItem>
                <SelectItem value="adjust_in">ปรับเพิ่ม</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">เลือกไฟล์ CSV</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="h-9 mt-1"
              data-testid="input-import-file"
            />
          </div>

          {parseError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {importData.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-xs">
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  จับคู่ได้ {matchedCount} รายการ
                </Badge>
                {unmatchedCount > 0 && (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                    <X className="h-3 w-3 mr-1" />
                    ไม่พบ {unmatchedCount} รายการ
                  </Badge>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden max-h-[250px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0">
                    <TableRow className="h-8">
                      <TableHead className="text-[10px] w-8 text-center">#</TableHead>
                      <TableHead className="text-[10px]">รหัส</TableHead>
                      <TableHead className="text-[10px]">สินค้า</TableHead>
                      <TableHead className="text-[10px] text-right w-20">จำนวน</TableHead>
                      <TableHead className="text-[10px] w-16 text-center">สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importData.map((d, idx) => (
                      <TableRow key={idx} className={`h-8 ${!d.matched ? "bg-red-50/50" : ""}`}>
                        <TableCell className="text-[10px] text-center py-1">{idx + 1}</TableCell>
                        <TableCell className="text-[10px] py-1">{d.code}</TableCell>
                        <TableCell className="text-[10px] py-1">{d.matched ? d.productName : <span className="text-red-500">ไม่พบสินค้า</span>}</TableCell>
                        <TableCell className="text-[10px] text-right font-bold py-1">{d.quantity}</TableCell>
                        <TableCell className="text-center py-1">
                          {d.matched ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mx-auto" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-red-500 mx-auto" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setImportData([]); setParseError(""); }}>ยกเลิก</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || matchedCount === 0}
            className="bg-[#fec90f] hover:bg-[#e5b50d] text-white"
            data-testid="button-submit-import"
          >
            {isPending ? "กำลังนำเข้า..." : `นำเข้า ${matchedCount} รายการ`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveStockDialog({ open, onClose, products, selectedProductId, companyId, warehouses, onSubmit, isPending }: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  selectedProductId: number | null;
  companyId: number | undefined;
  warehouses: any[];
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [productId, setProductId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("");

  const activeProductId = selectedProductId ? String(selectedProductId) : productId;

  const handleSubmit = () => {
    if (!activeProductId || !quantity || parseFloat(quantity) <= 0) return;
    onSubmit({
      companyId,
      productId: Number(activeProductId),
      quantity: quantity,
      movementType: "receive",
      notes: notes || "รับสินค้าเข้าคลัง",
      ...(warehouseId ? { warehouseId: Number(warehouseId) } : {}),
    });
    setProductId("");
    setQuantity("");
    setNotes("");
    setWarehouseId("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="dialog-receive-stock">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <ArrowDownToLine className="h-5 w-5" />
            รับสินค้าเข้าคลัง
          </DialogTitle>
          <DialogDescription>เพิ่มจำนวนสินค้าในคลัง</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">สินค้า *</Label>
            {selectedProductId ? (
              <div className="mt-1 p-2 bg-slate-50 rounded border text-sm font-medium">
                {products.find(p => p.id === selectedProductId)?.name || ""}
              </div>
            ) : (
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="h-9 mt-1" data-testid="select-receive-product">
                  <SelectValue placeholder="เลือกสินค้า" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.code ? `[${p.code}] ` : ""}{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label className="text-xs">จำนวนที่รับเข้า *</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="h-9 mt-1 text-lg font-bold"
              data-testid="input-receive-qty"
            />
          </div>
          {warehouses.length > 0 && (
            <div>
              <Label className="text-xs">คลังสินค้า (ไม่บังคับ)</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-9 mt-1" data-testid="select-receive-warehouse">
                  <SelectValue placeholder="เลือกคลัง..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">ไม่ระบุคลัง</SelectItem>
                  {warehouses.map((wh: any) => (
                    <SelectItem key={wh.id} value={String(wh.id)}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">หมายเหตุ</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 h-16"
              placeholder="เช่น รับจาก PO-001, ซื้อเพิ่ม..."
              data-testid="input-receive-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !activeProductId || !quantity || parseFloat(quantity) <= 0}
            data-testid="button-submit-receive"
          >
            {isPending ? "กำลังบันทึก..." : "รับสินค้าเข้า"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustStockDialog({ open, onClose, products, selectedProductId, companyId, stockMap, warehouses, onSubmit, isPending }: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  selectedProductId: number | null;
  companyId: number | undefined;
  stockMap: Map<number, ProductStock>;
  warehouses: any[];
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [productId, setProductId] = useState<string>("");
  const [adjustType, setAdjustType] = useState<string>("adjust_in");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("");

  const activeProductId = selectedProductId ? String(selectedProductId) : productId;
  const currentStock = activeProductId ? parseFloat(stockMap.get(Number(activeProductId))?.quantity || "0") : 0;

  const handleSubmit = () => {
    if (!activeProductId || !quantity || parseFloat(quantity) <= 0) return;
    const delta = adjustType === "adjust_out" ? String(-parseFloat(quantity)) : quantity;
    onSubmit({
      companyId,
      productId: Number(activeProductId),
      quantity: delta,
      movementType: adjustType,
      notes: notes || (adjustType === "adjust_in" ? "ปรับเพิ่มสต๊อก" : "ปรับลดสต๊อก"),
      ...(warehouseId ? { warehouseId: Number(warehouseId) } : {}),
    });
    setProductId("");
    setQuantity("");
    setNotes("");
    setWarehouseId("");
    setAdjustType("adjust_in");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="dialog-adjust-stock">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-[#fec90f]" />
            ปรับสต๊อก
          </DialogTitle>
          <DialogDescription>ปรับจำนวนสินค้าในคลัง (เพิ่มหรือลด)</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs">สินค้า *</Label>
            {selectedProductId ? (
              <div className="mt-1 p-2 bg-slate-50 rounded border text-sm font-medium">
                {products.find(p => p.id === selectedProductId)?.name || ""}
              </div>
            ) : (
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="h-9 mt-1" data-testid="select-adjust-product">
                  <SelectValue placeholder="เลือกสินค้า" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.code ? `[${p.code}] ` : ""}{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {activeProductId && (
              <p className="text-xs text-muted-foreground mt-1">สต๊อกปัจจุบัน: <span className="font-bold">{formatNumber(currentStock)}</span> ชิ้น</p>
            )}
          </div>
          <div>
            <Label className="text-xs">ประเภทการปรับ</Label>
            <Select value={adjustType} onValueChange={setAdjustType}>
              <SelectTrigger className="h-9 mt-1" data-testid="select-adjust-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adjust_in">ปรับเพิ่ม (+)</SelectItem>
                <SelectItem value="adjust_out">ปรับลด (-)</SelectItem>
                <SelectItem value="return">รับคืนจากลูกค้า (+)</SelectItem>
                <SelectItem value="initial">ตั้งต้นสต๊อก (+)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">จำนวน *</Label>
            <Input
              type="number"
              min="0"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="h-9 mt-1 text-lg font-bold"
              data-testid="input-adjust-qty"
            />
            {activeProductId && quantity && (
              <p className="text-xs mt-1">
                สต๊อกหลังปรับ:{" "}
                <span className="font-bold">
                  {formatNumber(adjustType === "adjust_out"
                    ? currentStock - parseFloat(quantity || "0")
                    : currentStock + parseFloat(quantity || "0")
                  )}
                </span> ชิ้น
              </p>
            )}
          </div>
          {warehouses.length > 0 && (
            <div>
              <Label className="text-xs">คลังสินค้า (ไม่บังคับ)</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-9 mt-1" data-testid="select-adjust-warehouse">
                  <SelectValue placeholder="เลือกคลัง..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">ไม่ระบุคลัง</SelectItem>
                  {warehouses.map((wh: any) => (
                    <SelectItem key={wh.id} value={String(wh.id)}>{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">หมายเหตุ</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 h-16"
              placeholder="เหตุผลในการปรับสต๊อก..."
              data-testid="input-adjust-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !activeProductId || !quantity || parseFloat(quantity) <= 0}
            className="bg-[#fec90f] hover:bg-[#e5b50d] text-white"
            data-testid="button-submit-adjust"
          >
            {isPending ? "กำลังบันทึก..." : "ปรับสต๊อก"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
