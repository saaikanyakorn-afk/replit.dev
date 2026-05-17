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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Package, Save, ArrowDownToLine, FileText, ScanBarcode, Printer, QrCode } from "lucide-react";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { apiRequest } from "@/lib/queryClient";
import type { Contact, Product } from "@shared/schema";
import { toLocalDateStr } from "@/lib/utils";
import QRCode from "qrcode";

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

interface LotLabelItem {
  productId: number | null;
  productName: string;
  productCode: string | null;
  unit: string;
  quantity: string;
  lotId: number | null;
  lotNumber: string | null;
  mfgDate: string | null;
  expDate: string | null;
  vendor: string | null;
  grDate: string;
  grNo: string;
  companyId: number;
  hasLot: boolean;
}

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function LotQRCanvas({ value, size }: { value: string; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState(false);
  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1, errorCorrectionLevel: "M" })
        .then(() => setQrError(false))
        .catch(() => setQrError(true));
    }
  }, [value, size]);
  if (qrError) {
    return <div style={{ width: size, height: size, background: "#fee2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#b91c1c", textAlign: "center", borderRadius: 4, padding: 4 }}>QR Error</div>;
  }
  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
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
  const [keyboardWarning, setKeyboardWarning] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [showLotLabels, setShowLotLabels] = useState(false);
  const [lotLabels, setLotLabels] = useState<LotLabelItem[]>([]);
  const [loadingLabels, setLoadingLabels] = useState(false);

  function isThai(str: string) {
    return /[ก-๙]/.test(str);
  }

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
              warehouseId: data.receivingWarehouseId || data.warehouse_id || data.warehouseId || undefined,
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

  // Auto-select default warehouse when creating new GR
  useEffect(() => {
    if (!isNew || !warehouses.length || form.warehouseId) return;
    const def = warehouses.find((w: any) => w.isDefault);
    if (def) setForm(prev => ({ ...prev, warehouseId: def.id }));
  }, [isNew, warehouses, form.warehouseId]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/goods-receivings", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "บันทึกไม่สำเร็จ");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goods-receivings"] });
      toast({ title: "สร้างใบรับสินค้าสำเร็จ" });
      navigate(recvBasePath);
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/goods-receivings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "อัปเดตไม่สำเร็จ");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goods-receivings"] });
      toast({ title: "อัปเดตใบรับสินค้าสำเร็จ" });
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
    if (!p) return;
    const rawTrackLots = (p as any).trackLots;
    if (rawTrackLots !== true && rawTrackLots !== false) {
      toast({ title: `ข้อมูลสินค้า "${p.name}" ไม่สมบูรณ์ (trackLots ไม่ถูกต้อง) — กรุณา refresh หน้า`, variant: "destructive" });
      return;
    }
    const newItems = [...items];
    newItems[idx] = {
      ...newItems[idx],
      productId: p.id,
      productCode: p.code || "",
      productName: p.name,
      unit: p.unit || "ชิ้น",
      unitCost: String(p.cost || "0"),
      trackLots: rawTrackLots,
    };
    setItems(newItems);
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

    if (isThai(code)) {
      setKeyboardWarning(true);
      setBarcodeInput("");
      barcodeRef.current?.focus();
      return;
    }

    setKeyboardWarning(false);
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
        const rawTrackLots = (matched as any).trackLots;
        if (rawTrackLots !== true && rawTrackLots !== false) {
          toast({ title: `ข้อมูลสินค้า "${matched.name}" ไม่สมบูรณ์ (trackLots ไม่ถูกต้อง) — กรุณา refresh หน้า`, variant: "destructive" });
          setBarcodeInput("");
          barcodeRef.current?.focus();
          return;
        }
        const firstEmpty = items.findIndex(it => !it.productId && !it.productName);
        const newItem: GRItemForm = {
          productId: matched.id,
          productCode: matched.code || "",
          productName: matched.name,
          unit: matched.unit || "ชิ้น",
          quantity: "1",
          unitCost: String(matched.cost || "0"),
          lotNumber: "",
          manufacturingDate: "",
          expiryDate: "",
          trackLots: rawTrackLots,
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
    if (!companyId) {
      toast({ title: "ไม่พบข้อมูลบริษัท", description: "กรุณา refresh หน้าแล้วลองใหม่", variant: "destructive" });
      return;
    }
    const validItems = items.filter(it => it.productName);
    if (validItems.length === 0) {
      toast({ title: "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ", variant: "destructive" });
      return;
    }
    const missingProductId = validItems.find(it => !it.productId);
    if (missingProductId) {
      toast({ title: `สินค้า "${missingProductId.productName}" ไม่มี productId`, description: "กรุณาเลือกสินค้าจากรายการแทนการพิมพ์ชื่อเอง", variant: "destructive" });
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

  async function handlePrintLotLabels() {
    if (!editingId) return;
    setLoadingLabels(true);
    try {
      const res = await fetch(`/api/goods-receivings/${editingId}/lot-labels`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "โหลดข้อมูลไม่สำเร็จ");
      setLotLabels(await res.json());
      setShowLotLabels(true);
    } catch (err: any) {
      toast({ title: "ไม่สามารถโหลดข้อมูล lot", description: err.message, variant: "destructive" });
    } finally {
      setLoadingLabels(false);
    }
  }

  async function handlePrintWindow() {
    if (lotLabels.length === 0) return;
    try {
    const labelCards = await Promise.all(lotLabels.map(async (label) => {
      const qrContent = label.hasLot ? JSON.stringify({
        type: "MATERIAL_LOT",
        lotId: label.lotId,
        productId: label.productId,
        productName: label.productName,
        productCode: label.productCode,
        lotNumber: label.lotNumber,
        vendor: label.vendor,
        grDate: label.grDate,
        grNo: label.grNo,
        mfgDate: label.mfgDate,
        expDate: label.expDate,
        companyId: label.companyId,
      }) : null;
      let qrSrc = "";
      if (qrContent) {
        qrSrc = await QRCode.toDataURL(qrContent, { width: 90, margin: 1, errorCorrectionLevel: "M" });
      }
      const qrImg = qrSrc
        ? `<img src="${qrSrc}" width="90" height="90" style="display:block"/>`
        : `<div style="width:90px;height:90px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:9px;color:#999;text-align:center;border-radius:4px">ยังไม่มี<br>lot ID</div>`;
      const rows = [
        `<div style="font-size:10px;font-weight:bold;margin-bottom:3px">${label.productName || ""}</div>`,
        label.productCode ? `<div style="font-size:9px;color:#444">รหัส: ${label.productCode}</div>` : "",
        label.lotNumber ? `<div style="font-size:9px;color:#444">ล็อต: <strong>${label.lotNumber}</strong></div>` : `<div style="font-size:9px;color:#cc6600;font-style:italic">ไม่มีเลขล็อต</div>`,
        label.vendor ? `<div style="font-size:9px;color:#444">ผู้ขาย: ${label.vendor}</div>` : "",
        `<div style="font-size:9px;color:#444">วันรับ: ${label.grDate || "-"}</div>`,
        label.mfgDate ? `<div style="font-size:9px;color:#444">ผลิต: ${label.mfgDate}</div>` : "",
        label.expDate ? `<div style="font-size:9px;color:#444">หมดอายุ: ${label.expDate}</div>` : "",
        `<div style="font-size:9px;color:#444">GR: ${label.grNo || ""}</div>`,
        !label.hasLot ? `<div style="font-size:9px;color:#cc6600;font-style:italic">⚠ item นี้ยังไม่มี lot บันทึก (GR ต้อง approved ก่อน)</div>` : "",
      ].filter(Boolean).join("");
      return `<div style="border:1px solid #ccc;border-radius:4px;padding:2mm 3mm;display:flex;flex-direction:row;align-items:center;gap:3mm;width:62mm;min-height:40mm;box-sizing:border-box;page-break-inside:avoid;break-inside:avoid">
        <div style="flex-shrink:0">${qrImg}</div>
        <div style="flex:1;line-height:1.4;word-break:break-all">${rows}</div>
      </div>`;
    }));
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>QR Label — ${form.grNo}</title><style>
      body{margin:0;padding:4mm;font-family:sans-serif}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;padding:4mm}
      @media print{@page{size:A4;margin:8mm}body{padding:0}}
    </style></head><body><div class="grid">${labelCards.join("")}</div>
    <script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "ไม่สามารถสร้าง QR ได้";
      toast({ title: "พิมพ์ QR ไม่สำเร็จ", description: msg, variant: "destructive" });
    }
  }

  const [isApproving, setIsApproving] = useState(false);
  async function handleApprove() {
    if (!editingId) return;
    if (!window.confirm("ยืนยันการอนุมัติใบรับสินค้า? สต๊อกจะถูกอัปเดตทันที")) return;
    setIsApproving(true);
    try {
      const res = await fetch(`/api/goods-receivings/${editingId}/approve`, { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "อนุมัติไม่สำเร็จ");
      toast({ title: "อนุมัติใบรับสินค้าสำเร็จ", description: "สต๊อกถูกอัปเดตแล้ว" });
      setForm(prev => ({ ...prev, status: "approved" }));
    } catch (err: any) {
      toast({ title: "ข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setIsApproving(false);
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
          {form.status === "draft" && editingId && (
            <Button
              size="sm"
              className="h-8 text-sm gap-1.5 text-white"
              style={{ background: "#10b981" }}
              onClick={handleApprove}
              disabled={isApproving}
              data-testid="button-approve"
            >
              <FileText className="h-4 w-4" />
              {isApproving ? "กำลังอนุมัติ..." : "อนุมัติ"}
            </Button>
          )}
          {form.status === "approved" && editingId && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-sm gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              onClick={handlePrintLotLabels}
              disabled={loadingLabels}
              data-testid="button-print-lot-labels"
            >
              <Printer className="h-4 w-4" />
              {loadingLabels ? "กำลังโหลด..." : "พิมพ์ QR วัตถุดิบ"}
            </Button>
          )}
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
            <div className="flex flex-col gap-1.5" onClick={() => barcodeRef.current?.focus()}>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-md">
                  <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    ref={barcodeRef}
                    data-testid="input-barcode-scan"
                    placeholder="สแกนบาร์โค้ด หรือพิมพ์รหัสสินค้าแล้วกด Enter..."
                    className={`pl-10 h-9 text-sm transition-colors ${
                      keyboardWarning
                        ? "bg-red-50 border-red-500 focus:border-red-500"
                        : barcodeFlash
                        ? "bg-green-100 border-green-400"
                        : "border-blue-300 focus:border-blue-500"
                    }`}
                    value={barcodeInput}
                    onChange={e => {
                      const val = e.target.value;
                      if (isThai(val)) {
                        setKeyboardWarning(true);
                      } else {
                        setKeyboardWarning(false);
                      }
                      setBarcodeInput(val);
                    }}
                    onKeyDown={handleBarcodeScan}
                    autoFocus
                  />
                  {barcodeFlash && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 text-xs font-medium animate-pulse">
                      เพิ่มแล้ว!
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground cursor-pointer select-none hidden sm:block">🔵 พร้อมสแกน — คลิกที่นี่แล้วยิง QR</p>
              </div>
              {keyboardWarning && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md max-w-md" data-testid="warning-keyboard-layout">
                  <span className="text-lg">⚠️</span>
                  <div>
                    <p className="text-sm font-bold">Keyboard ภาษาไทย — สแกนไม่ได้!</p>
                    <p className="text-xs">กรุณาเปลี่ยน Keyboard เป็น EN ก่อนสแกน (ดูที่ Taskbar มุมขวาล่าง)</p>
                  </div>
                </div>
              )}
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
      <Dialog open={showLotLabels} onOpenChange={setShowLotLabels}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[200]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-emerald-600" />
              QR Label วัตถุดิบ — {form.grNo}
            </DialogTitle>
          </DialogHeader>

          <div className="mb-3 flex justify-between items-center">
            <p className="text-sm text-slate-500">QR แต่ละดวงมีข้อมูล: ประเภทล็อต, สินค้า, เลขล็อต, ผู้ขาย, วันรับ</p>
            <Button
              size="sm"
              className="gap-1.5 text-white"
              style={{ background: "#fb9678" }}
              onClick={handlePrintWindow}
              disabled={lotLabels.length === 0}
              data-testid="button-print-labels-now"
            >
              <Printer className="h-4 w-4" />
              พิมพ์
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-2 p-2">
            {lotLabels.map((label, idx) => {
              const qrData = label.hasLot ? JSON.stringify({
                type: "MATERIAL_LOT",
                lotId: label.lotId,
                productId: label.productId,
                productName: label.productName,
                productCode: label.productCode,
                lotNumber: label.lotNumber,
                vendor: label.vendor,
                grDate: label.grDate,
                grNo: label.grNo,
                mfgDate: label.mfgDate,
                expDate: label.expDate,
                companyId: label.companyId,
              }) : null;
              return (
                <div key={idx} className="border border-gray-300 rounded p-2 flex flex-row items-center gap-2" style={{ minHeight: 151 }}>
                  <div style={{ flexShrink: 0 }}>
                    {qrData
                      ? <LotQRCanvas value={qrData} size={90} />
                      : <div style={{ width: 90, height: 90, background: "#f5f5f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#999", textAlign: "center", borderRadius: 4 }}>ยังไม่มี<br/>lot ID</div>
                    }
                  </div>
                  <div style={{ flex: 1, fontSize: 9, lineHeight: 1.4, wordBreak: "break-all" }}>
                    <div style={{ fontSize: 10, fontWeight: "bold", marginBottom: 3 }} data-testid={`text-lot-label-product-${idx}`}>{label.productName}</div>
                    {label.productCode && <div style={{ color: "#444", marginBottom: 1 }}>รหัส: {label.productCode}</div>}
                    {label.lotNumber
                      ? <div style={{ color: "#444", marginBottom: 1 }}>ล็อต: <strong>{label.lotNumber}</strong></div>
                      : <div style={{ color: "#cc6600", fontStyle: "italic" }}>ไม่มีเลขล็อต</div>
                    }
                    {label.vendor && <div style={{ color: "#444", marginBottom: 1 }}>ผู้ขาย: {label.vendor}</div>}
                    <div style={{ color: "#444", marginBottom: 1 }}>วันรับ: {label.grDate || "-"}</div>
                    {label.mfgDate && <div style={{ color: "#444", marginBottom: 1 }}>ผลิต: {label.mfgDate}</div>}
                    {label.expDate && <div style={{ color: "#444", marginBottom: 1 }}>หมดอายุ: {label.expDate}</div>}
                    <div style={{ color: "#444", marginBottom: 1 }}>GR: {label.grNo}</div>
                    {!label.hasLot && (
                      <div style={{ color: "#cc6600", fontStyle: "italic" }}>⚠ item นี้ยังไม่มี lot บันทึก (GR ต้อง approved ก่อน)</div>
                    )}
                  </div>
                </div>
              );
            })}
            {lotLabels.length === 0 && (
              <div className="col-span-3 text-center py-8 text-slate-400 text-sm">
                ไม่มีรายการสินค้าใน GR นี้
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </LayoutComponent>
  );
}
