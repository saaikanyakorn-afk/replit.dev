import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2, Package, Save, ArrowDownToLine, FileText, ScanBarcode } from "lucide-react";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { apiRequest } from "@/lib/queryClient";
import type { Contact, Product } from "@shared/schema";
import { toLocalDateStr } from "@/lib/utils";

interface GRItemForm {
  productId?: number;
  productCode: string;
  productName: string;
  unit: string;
  quantity: string;
  unitCost: string;
  lotNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  trackLots?: boolean;
}

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const emptyItem = (): GRItemForm => ({
  productCode: "",
  productName: "",
  unit: "ชิ้น",
  quantity: "1",
  unitCost: "0",
  lotNumber: "",
  manufacturingDate: "",
  expiryDate: "",
});

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200" },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

export default function GoodsReceivingForm(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }>; basePath?: string } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const recvBasePath = props.basePath ? `${props.basePath}/receiving` : "/inventory/receiving";
  const [, navigate] = useLocation();
  const [matchCreate] = useRoute(`${recvBasePath}/form`);
  const [matchEdit, paramsEdit] = useRoute(`${recvBasePath}/form/:id`);
  const editingId = matchEdit ? Number(paramsEdit?.id) : null;
  const isNew = !!matchCreate && !editingId;

  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { dateEra, dateFmt } = useDateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    grNo: "",
    grDate: toLocalDateStr(new Date()),
    vendorId: undefined as number | undefined,
    vendorName: "",
    poReference: "",
    poId: undefined as number | undefined,
    notes: "",
    status: "draft",
    warehouseId: undefined as number | undefined,
  });

  const [items, setItems] = useState<GRItemForm[]>([emptyItem()]);
  const [loaded, setLoaded] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeFlash, setBarcodeFlash] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/contacts?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const vendors = contacts.filter(c => c.type === "vendor" || c.type === "supplier" || c.type === "both");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/products?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: approvedPOs = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-orders-for-gr", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/purchase-orders-for-gr?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/warehouses", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/inventory/warehouses?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (loaded) return;
    if (isNew) {
      setLoaded(true);
    } else if (editingId) {
      (async () => {
        try {
          const res = await fetch(`/api/goods-receivings/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setForm({
              grNo: data.grNo || data.documentNo || "",
              grDate: data.receivingDate || data.grDate || data.date || "",
              vendorId: data.vendorId || undefined,
              vendorName: data.vendorName || "",
              poReference: data.poRef || data.poReference || data.purchaseOrderNo || "",
              poId: data.poId || undefined,
              notes: data.notes || "",
              status: data.status || "draft",
              warehouseId: data.warehouse_id || data.warehouseId || undefined,
            });
            if (data.items && data.items.length > 0) {
              setItems(data.items.map((it: any) => ({
                productId: it.productId,
                productCode: it.productCode || "",
                productName: it.productName || "",
                unit: it.unit || "ชิ้น",
                quantity: String(it.quantity || it.qty || "1"),
                unitCost: String(it.unitCost || it.unitPrice || "0"),
                lotNumber: it.lotNumber || "",
                manufacturingDate: it.manufacturingDate || "",
                expiryDate: it.expiryDate || "",
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else {
      setLoaded(true);
    }
  }, [isNew, editingId, companyId, loaded]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/goods-receivings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goods-receivings"] });
      toast({ title: "สร้างใบรับสินค้าสำเร็จ", variant: "success" as any });
      navigate(recvBasePath);
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/goods-receivings/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goods-receivings"] });
      toast({ title: "อัพเดทใบรับสินค้าสำเร็จ", variant: "success" as any });
      navigate(recvBasePath);
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  function handleVendorSelect(contactId: string) {
    if (contactId === "__free__") {
      setForm(prev => ({ ...prev, vendorId: undefined }));
      return;
    }
    const c = contacts.find(ct => ct.id === Number(contactId));
    if (c) {
      setForm(prev => ({
        ...prev,
        vendorId: c.id,
        vendorName: c.name,
      }));
    }
  }

  function handlePOSelect(poIdStr: string) {
    if (poIdStr === "__none__") {
      setForm(prev => ({ ...prev, poId: undefined, poReference: "" }));
      return;
    }
    const po = approvedPOs.find((p: any) => p.id === Number(poIdStr));
    if (!po) return;

    setForm(prev => ({
      ...prev,
      poId: po.id,
      poReference: po.poNo,
      vendorId: po.vendorId || prev.vendorId,
      vendorName: po.vendorName || prev.vendorName,
    }));

    if (po.items && po.items.length > 0) {
      const poItems: GRItemForm[] = po.items.map((it: any) => ({
        productId: it.productId || undefined,
        productCode: it.productCode || "",
        productName: it.productName || "",
        unit: it.unit || "ชิ้น",
        quantity: String(it.qty || "1"),
        unitCost: String(it.unitPrice || "0"),
      }));
      setItems(poItems);
      toast({ title: `ดึงรายการสินค้าจาก ${po.poNo} สำเร็จ (${poItems.length} รายการ)` });
    }
  }

  function handleProductSelect(idx: number, productId: string) {
    const p = products.find(pr => pr.id === Number(productId));
    if (p) {
      const newItems = [...items];
      newItems[idx] = {
        ...newItems[idx],
        productId: p.id,
        productCode: p.code || "",
        productName: p.name,
        unit: p.unit || "ชิ้น",
        unitCost: String(p.cost || "0"),
        trackLots: (p as any).trackLots || false,
      };
      setItems(newItems);
    }
  }

  function updateItem(idx: number, field: keyof GRItemForm, value: string) {
    const newItems = [...items];
    (newItems[idx] as any)[field] = value;
    setItems(newItems);
  }

  function addItem() {
    setItems([...items, emptyItem()]);
  }

  function removeItem(idx: number) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  }

  function calcItemTotal(item: GRItemForm): number {
    return (parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0);
  }

  function calcGrandTotal(): number {
    return items.reduce((s, it) => s + calcItemTotal(it), 0);
  }

  function handleBarcodeScan(e: React.KeyboardEvent) {
    if (e.key !== "Enter" || !barcodeInput.trim()) return;
    e.preventDefault();
    const code = barcodeInput.trim();
    const matched = products.find(p => p.code === code || p.barcode === code);
    if (matched) {
      const existingIdx = items.findIndex(it => it.productId === matched.id);
      if (existingIdx >= 0) {
        const newItems = [...items];
        const current = parseFloat(newItems[existingIdx].quantity) || 0;
        newItems[existingIdx] = { ...newItems[existingIdx], quantity: String(current + 1) };
        setItems(newItems);
        toast({ title: `เพิ่มจำนวน "${matched.name}" เป็น ${current + 1}` });
      } else {
        const firstEmpty = items.findIndex(it => !it.productId && !it.productName);
        const newItem: GRItemForm = {
          productId: matched.id,
          productCode: matched.code || "",
          productName: matched.name,
          unit: matched.unit || "ชิ้น",
          quantity: "1",
          unitCost: String(matched.cost || "0"),
        };
        if (firstEmpty >= 0) {
          const newItems = [...items];
          newItems[firstEmpty] = newItem;
          setItems(newItems);
        } else {
          setItems(prev => [...prev, newItem]);
        }
        toast({ title: `เพิ่มสินค้า "${matched.name}" สำเร็จ` });
      }
      setBarcodeFlash(true);
      setTimeout(() => setBarcodeFlash(false), 400);
    } else {
      toast({ title: `ไม่พบสินค้ารหัส "${code}"`, variant: "destructive" });
    }
    setBarcodeInput("");
    barcodeRef.current?.focus();
  }

  function handleSubmit() {
    const validItems = items.filter(it => it.productName);
    if (validItems.length === 0) {
      toast({ title: "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ", variant: "destructive" });
      return;
    }

    const payload = {
      companyId,
      grDate: form.grDate,
      vendorId: form.vendorId || null,
      vendorName: form.vendorName,
      poReference: form.poReference,
      poId: form.poId || null,
      notes: form.notes,
      status: form.status,
      warehouseId: form.warehouseId || null,
      totalAmount: calcGrandTotal().toFixed(2),
      items: validItems.map(it => ({
        productId: it.productId || null,
        productName: it.productName,
        productCode: it.productCode,
        unit: it.unit,
        quantity: it.quantity,
        unitCost: it.unitCost,
        lotNumber: it.lotNumber || null,
        manufacturingDate: it.manufacturingDate || null,
        expiryDate: it.expiryDate || null,
      })),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const statusInfo = STATUS_MAP[form.status] || STATUS_MAP.draft;

  return (
    <LayoutComponent>
      <div className="space-y-4" data-testid="goods-receiving-form-page">
        <div className="flex items-center gap-3 mb-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => navigate(recvBasePath)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <ArrowDownToLine className="h-5 w-5 text-[#fb9678]" />
            <h1 className="text-lg font-bold text-slate-800" data-testid="text-page-title">
              {editingId ? "แก้ไขใบรับสินค้า" : "สร้างใบรับสินค้า"}
            </h1>
            {editingId && (
              <Badge data-testid="badge-status" className={`${statusInfo.color} border text-xs ml-2`}>
                {statusInfo.label}
              </Badge>
            )}
          </div>
        </div>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3 pt-4 px-4 border-b">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Package className="h-4 w-4 text-[#fb9678]" />
              ข้อมูลใบรับสินค้า
            </h2>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm text-slate-600">เลขที่ GR</Label>
                <Input
                  data-testid="input-gr-no"
                  value={form.grNo}
                  onChange={e => setForm(prev => ({ ...prev, grNo: e.target.value }))}
                  placeholder="auto"
                  readOnly={isNew}
                  className="mt-1 h-9 text-sm bg-white"
                />
              </div>

              <div>
                <Label className="text-sm text-slate-600">วันที่รับสินค้า</Label>
                <ThaiDateInput value={form.grDate} onChange={(v: string) => setForm(prev => ({ ...prev, grDate: v }))} dateEra={dateEra} dateFmt={dateFmt} className="mt-1" data-testid="input-gr-date" />
              </div>

              <div>
                <Label className="text-sm text-slate-600">ผู้ขาย / Supplier</Label>
                <Select
                  value={form.vendorId ? String(form.vendorId) : ""}
                  onValueChange={handleVendorSelect}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm bg-white" data-testid="select-vendor">
                    <SelectValue placeholder="เลือกผู้ขาย" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.code ? `[${v.code}] ` : ""}{v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  data-testid="input-vendor-name"
                  value={form.vendorName}
                  onChange={e => setForm(prev => ({ ...prev, vendorName: e.target.value, vendorId: undefined }))}
                  placeholder="หรือพิมพ์ชื่อผู้ขาย"
                  className="mt-1 h-9 text-sm bg-white"
                />
              </div>

              <div>
                <Label className="text-sm text-slate-600 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-blue-500" />
                  อ้างอิงใบสั่งซื้อ (PO)
                </Label>
                <Select
                  value={form.poId ? String(form.poId) : ""}
                  onValueChange={handlePOSelect}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm bg-white" data-testid="select-po">
                    <SelectValue placeholder="เลือก PO (ไม่บังคับ)">
                      {form.poId ? form.poReference : "เลือก PO (ไม่บังคับ)"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- ไม่อ้างอิง PO --</SelectItem>
                    {approvedPOs.map((po: any) => (
                      <SelectItem key={po.id} value={String(po.id)}>
                        {po.poNo} - {po.vendorName} ({fmt(po.totalAmount)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {approvedPOs.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">ยังไม่มี PO ที่อนุมัติแล้ว</p>
                )}
                {form.poId && (
                  <p className="text-xs text-blue-600 mt-1">รายการสินค้าถูกดึงจาก {form.poReference} อัตโนมัติ</p>
                )}
              </div>

              <div>
                <Label className="text-sm text-slate-600 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-orange-500" />
                  คลังสินค้าที่รับเข้า
                </Label>
                <Select
                  value={form.warehouseId ? String(form.warehouseId) : "__none__"}
                  onValueChange={v => setForm(prev => ({ ...prev, warehouseId: v === "__none__" ? undefined : Number(v) }))}
                >
                  <SelectTrigger className="mt-1 h-9 text-sm bg-white" data-testid="select-warehouse">
                    <SelectValue placeholder="เลือกคลังสินค้า (ไม่บังคับ)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- ไม่ระบุคลัง --</SelectItem>
                    {warehouses.map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.code ? `[${w.code}] ` : ""}{w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.warehouseId && (
                  <p className="text-xs text-orange-600 mt-1">สต๊อกคลังจะถูกอัปเดตอัตโนมัติเมื่ออนุมัติ</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <Label className="text-sm text-slate-600">หมายเหตุ</Label>
                <Textarea
                  data-testid="input-notes"
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="หมายเหตุเพิ่มเติม"
                  className="mt-1 text-sm bg-white min-h-[60px]"
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3 pt-4 px-4 border-b space-y-3">
            <div className="flex flex-row items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Package className="h-4 w-4 text-[#fb9678]" />
                รายการสินค้า
                {form.poId && <Badge variant="outline" className="text-xs text-blue-600 border-blue-200 bg-blue-50 ml-1">จาก PO</Badge>}
              </h2>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-sm gap-1"
                onClick={addItem}
                data-testid="button-add-item"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มรายการ
              </Button>
            </div>
            <div className="flex items-center gap-2" onClick={() => barcodeRef.current?.focus()}>
              <div className="relative flex-1 max-w-md">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  ref={barcodeRef}
                  data-testid="input-barcode-scan"
                  placeholder="สแกนบาร์โค้ด หรือพิมพ์รหัสสินค้าแล้วกด Enter..."
                  className={`pl-10 h-9 text-sm transition-colors ${barcodeFlash ? "bg-green-100 border-green-400" : "border-blue-300 focus:border-blue-500"}`}
                  value={barcodeInput}
                  onChange={e => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeScan}
                  autoFocus
                />
                {barcodeFlash && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 text-xs font-medium animate-pulse">
                    เพิ่มแล้ว!
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground cursor-pointer select-none">🔵 พร้อมสแกน — คลิกที่นี่แล้วยิง QR</p>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="hover:bg-transparent h-10">
                    <TableHead className="w-12 text-center text-xs font-medium text-slate-600">ลำดับ</TableHead>
                    <TableHead className="w-32 text-xs font-medium text-slate-600">รหัสสินค้า</TableHead>
                    <TableHead className="min-w-[200px] text-xs font-medium text-slate-600">ชื่อสินค้า</TableHead>
                    <TableHead className="w-20 text-xs font-medium text-slate-600">หน่วย</TableHead>
                    <TableHead className="w-24 text-xs font-medium text-slate-600">จำนวน</TableHead>
                    <TableHead className="w-28 text-xs font-medium text-slate-600">ราคาต่อหน่วย</TableHead>
                    <TableHead className="w-28 text-right text-xs font-medium text-slate-600">รวม</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <React.Fragment key={idx}>
                    <TableRow data-testid={`row-item-${idx}`} className="hover:bg-slate-50/50 border-b">
                      <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <Input
                          data-testid={`input-product-code-${idx}`}
                          value={item.productCode}
                          onChange={e => updateItem(idx, "productCode", e.target.value)}
                          className="h-8 text-sm"
                          placeholder="รหัส"
                          readOnly
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.productId ? String(item.productId) : ""}
                          onValueChange={val => handleProductSelect(idx, val)}
                        >
                          <SelectTrigger className="h-8 text-sm" data-testid={`select-product-${idx}`}>
                            <SelectValue placeholder="เลือกสินค้า">
                              {item.productName || "เลือกสินค้า"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.code ? `[${p.code}] ` : ""}{p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          data-testid={`input-unit-${idx}`}
                          value={item.unit}
                          onChange={e => updateItem(idx, "unit", e.target.value)}
                          className="h-8 text-sm"
                          placeholder="หน่วย"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          data-testid={`input-quantity-${idx}`}
                          type="number"
                          value={item.quantity}
                          onChange={e => updateItem(idx, "quantity", e.target.value)}
                          className="h-8 text-sm"
                          min="0"
                          step="1"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          data-testid={`input-unit-cost-${idx}`}
                          type="number"
                          value={item.unitCost}
                          onChange={e => updateItem(idx, "unitCost", e.target.value)}
                          className="h-8 text-sm"
                          min="0"
                          step="0.01"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm" data-testid={`text-item-total-${idx}`}>
                        {fmt(calcItemTotal(item))}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => removeItem(idx)}
                          disabled={items.length === 1}
                          data-testid={`button-remove-item-${idx}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {item.trackLots && <TableRow className="border-b bg-amber-50/30">
                      <TableCell />
                      <TableCell colSpan={7}>
                        <div className="flex items-center gap-3 py-0.5">
                          <div className="flex items-center gap-1.5">
                            <label className="text-[11px] text-amber-700 font-medium whitespace-nowrap">ล็อต:</label>
                            <Input
                              data-testid={`input-lot-${idx}`}
                              value={item.lotNumber}
                              onChange={e => updateItem(idx, "lotNumber", e.target.value)}
                              className="h-7 text-xs w-28"
                              placeholder="เลขล็อต"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="text-[11px] text-amber-700 font-medium whitespace-nowrap">วันผลิต:</label>
                            <ThaiDateInput
                              data-testid={`input-mfg-date-${idx}`}
                              value={item.manufacturingDate}
                              onChange={(v: string) => updateItem(idx, "manufacturingDate", v)}
                              dateEra={dateEra} dateFmt={dateFmt}
                              className="h-7 text-xs w-40"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="text-[11px] text-amber-700 font-medium whitespace-nowrap">วันหมดอายุ:</label>
                            <ThaiDateInput
                              data-testid={`input-exp-date-${idx}`}
                              value={item.expiryDate}
                              onChange={(v: string) => updateItem(idx, "expiryDate", v)}
                              dateEra={dateEra} dateFmt={dateFmt}
                              className="h-7 text-xs w-40"
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>}
                    </React.Fragment>
                  ))}
                  <TableRow className="bg-slate-50 font-semibold hover:bg-slate-50">
                    <TableCell colSpan={6} className="text-right text-sm text-slate-700">
                      รวมทั้งสิ้น
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-[#fb9678]" data-testid="text-grand-total">
                      {fmt(calcGrandTotal())}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-2 pb-4">
          <Button
            variant="outline"
            className="h-9 text-sm"
            onClick={() => navigate(recvBasePath)}
            data-testid="button-cancel"
          >
            ยกเลิก
          </Button>
          <Button
            className="h-9 text-sm text-white gap-1.5"
            style={{ background: "#fb9678" }}
            onClick={handleSubmit}
            disabled={isSaving}
            data-testid="button-save"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </div>
    </LayoutComponent>
  );
}
