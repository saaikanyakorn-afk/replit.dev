/**
 * material-issue-form.tsx
 * ใบเบิกวัตถุดิบ — create/view/confirm
 * Route: /inventory/material-issue/form (new) | /inventory/material-issue/form/:id (view)
 * Props: idProp?: string — if provided, load existing issue in view/confirm mode
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { ArrowLeft, Plus, Trash2, QrCode, CheckCircle, Save, ScanLine, UserCheck, ClipboardList, AlertTriangle, Camera } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CameraQrScanner } from "@/components/camera-qr-scanner";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface Props {
  idProp?: string;
}

interface MoOption {
  id: number;
  orderNo: string;
  status: string;
}

interface ProductOption {
  id: number;
  name: string;
  code: string;
  unit: string | null;
  trackLots: boolean;
  lowStockThreshold?: number;
}

interface LotOption {
  id: number;
  lotNumber: string;
  quantity: string;
  expiryDate: string | null;
}

interface EmployeeOption {
  id: number;
  fullName: string;
  username: string;
  qrPayload: string;
}

interface ItemForm {
  productId: number | null;
  productName: string;
  lotId: number | null;
  lotNumber: string;
  quantity: number;
  unit: string;
  trackLots: boolean;
  lotAvailableQty?: number;
}

interface IssueDetail {
  id: number;
  issue_no: string;
  mo_id: number | null;
  mo_no: string | null;
  issued_by_user_id: number | null;
  issued_by_name: string | null;
  issued_at: string | null;
  notes: string | null;
  status: "draft" | "confirmed";
  items: Array<{
    id: number;
    product_id: number;
    product_name: string;
    lot_id: number | null;
    lot_number: string | null;
    quantity: string;
    unit: string;
  }>;
}

// ──────────────────────────────────────────────
// Helper: status badge
// ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "confirmed") {
    return <Badge className="bg-green-600 text-white" data-testid="badge-status-confirmed">ยืนยันแล้ว</Badge>;
  }
  return <Badge variant="outline" data-testid="badge-status-draft">ร่าง</Badge>;
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────

export default function MaterialIssueForm({ idProp, urlBase = "/inventory" }: Props & { urlBase?: string }) {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { company } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isEditMode = !!idProp;

  // ── Parse moId from URL query param (?moId=X) for new issue pre-selection ──
  const urlMoId = useMemo(() => {
    if (isEditMode) return null;
    const params = new URLSearchParams(search);
    const v = params.get("moId");
    return v ? Number(v) : null;
  }, [search, isEditMode]);

  // ── Form state (new issue only) ──
  const [moId, setMoId] = useState<number | null>(null);
  const [issuedByUserId, setIssuedByUserId] = useState<number | null>(null);
  const [issuedByName, setIssuedByName] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemForm[]>([]);
  const [fromWarehouseId, setFromWarehouseId] = useState<number | null>(null);

  // ── QR scan state ──
  const [empQrInput, setEmpQrInput] = useState("");
  const [productQrInput, setProductQrInput] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const productQrRef = useRef<HTMLInputElement>(null);

  // ── Camera scanner state ──
  const [empCameraOpen, setEmpCameraOpen] = useState(false);
  const [productCameraOpen, setProductCameraOpen] = useState(false);

  // ── Product/lot selection for manual add ──
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [addQty, setAddQty] = useState<number>(1);

  // ──────────────────────────────────────────────
  // Queries
  // ──────────────────────────────────────────────

  const { data: existingIssue, isLoading: loadingIssue } = useQuery<IssueDetail>({
    queryKey: ["/api/material-issues", idProp],
    queryFn: async () => {
      const r = await fetch(`/api/material-issues/${idProp}`, { credentials: "include" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ message: "โหลดข้อมูลไม่สำเร็จ" }));
        throw new Error(body.message || "โหลดข้อมูลไม่สำเร็จ");
      }
      return r.json();
    },
    enabled: isEditMode,
  });

  const { data: mos = [] } = useQuery<MoOption[]>({
    queryKey: ["/api/manufacturing-orders", company?.id, "in_progress"],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/manufacturing-orders?companyId=${company.id}&status=in_progress`, { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      const all = (data.data ?? data) as MoOption[];
      return all.filter(m => m.status === "in_progress");
    },
    enabled: !!company?.id && !isEditMode,
  });

  interface WarehouseOption { id: number; name: string; code: string | null; }
  const { data: warehouses = [] } = useQuery<WarehouseOption[]>({
    queryKey: ["/api/inventory/warehouses", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/inventory/warehouses?companyId=${company.id}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!company?.id && !isEditMode,
  });

  // ── Auto-select MO from URL ?moId=X when mos are loaded ──
  useEffect(() => {
    if (!urlMoId || isEditMode || mos.length === 0) return;
    const found = mos.find(m => m.id === urlMoId);
    if (found) setMoId(found.id);
  }, [urlMoId, mos, isEditMode]);

  const { data: employees = [] } = useQuery<EmployeeOption[]>({
    queryKey: ["/api/users/employee-qr-data", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/users/employee-qr-data?companyId=${company.id}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!company?.id && !isEditMode,
  });

  const { data: allProducts = [] } = useQuery<ProductOption[]>({
    queryKey: ["/api/products", company?.id, "all"],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/products?companyId=${company.id}&limit=500`, { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.data ?? data) as ProductOption[];
    },
    enabled: !!company?.id && !isEditMode,
  });

  const { data: lots = [] } = useQuery<LotOption[]>({
    queryKey: ["/api/product-lots", company?.id, selectedProduct?.id],
    queryFn: async () => {
      if (!company?.id || !selectedProduct?.id) return [];
      const r = await fetch(`/api/product-lots?companyId=${company.id}&productId=${selectedProduct.id}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!company?.id && !!selectedProduct?.id && selectedProduct.trackLots,
  });

  const { data: companySettings } = useQuery<{ lotLowStockThreshold?: number }>({
    queryKey: ["/api/settings/general", company?.id],
    queryFn: async () => {
      if (!company?.id) return {};
      const r = await fetch(`/api/settings/general?companyId=${company.id}`, { credentials: "include" });
      if (!r.ok) return {};
      return r.json();
    },
    enabled: !!company?.id && !isEditMode,
  });

  // ── View mode: fetch live lot quantities for each item that has a lot_id ──
  const viewModeLotIds = isEditMode && existingIssue
    ? [...new Set(existingIssue.items.filter(it => it.lot_id).map(it => it.lot_id as number))]
    : [];
  const viewModeProductIds = isEditMode && existingIssue
    ? [...new Set(existingIssue.items.filter(it => it.lot_id).map(it => it.product_id))]
    : [];

  const { data: viewModeLotQtys = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/product-lots-view-mode", company?.id, viewModeLotIds.join(",")],
    queryFn: async () => {
      if (!company?.id || viewModeProductIds.length === 0) return {};
      const lotMap: Record<number, number> = {};
      await Promise.all(viewModeProductIds.map(async (productId) => {
        const r = await fetch(`/api/product-lots?companyId=${company.id}&productId=${productId}`, { credentials: "include" });
        if (!r.ok) return;
        const lotList: LotOption[] = await r.json();
        for (const lot of lotList) {
          lotMap[lot.id] = Number(lot.quantity);
        }
      }));
      return lotMap;
    },
    enabled: isEditMode && !!existingIssue && !!company?.id && viewModeLotIds.length > 0,
  });

  // ──────────────────────────────────────────────
  // Mutations
  // ──────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error("ไม่พบข้อมูลบริษัท");
      if (items.length === 0) throw new Error("ต้องมีรายการวัตถุดิบอย่างน้อย 1 รายการ");
      const payload = {
        companyId: company.id,
        moId: moId ?? null,
        issuedByUserId: issuedByUserId ?? null,
        fromWarehouseId: fromWarehouseId ?? null,
        notes: notes.trim() || null,
        items: items.map(it => ({
          productId: it.productId,
          productName: it.productName,
          lotId: it.lotId ?? null,
          lotNumber: it.lotNumber || null,
          quantity: it.quantity,
          unit: it.unit,
        })),
      };
      const r = await fetch("/api/material-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || "บันทึกไม่สำเร็จ");
      return body;
    },
    onSuccess: (data) => {
      toast({ title: "บันทึกใบเบิกสำเร็จ", description: `เลขที่ ${data.issueNo || data.issue_no}` });
      queryClient.invalidateQueries({ queryKey: ["/api/material-issues"] });
      if (urlMoId) {
        navigate(`${urlBase}/manufacturing/form/${urlMoId}`);
      } else {
        navigate(`${urlBase}/material-issues`);
      }
    },
    onError: (e: Error) => toast({ title: "ข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/material-issues/${id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || "ยืนยันไม่สำเร็จ");
      return body;
    },
    onSuccess: (data) => {
      toast({ title: "ยืนยันการเบิกวัตถุดิบสำเร็จ", description: `เลขที่ ${data.issueNo}` });
      queryClient.invalidateQueries({ queryKey: ["/api/material-issues"] });
      navigate(`${urlBase}/material-issues`);
    },
    onError: (e: Error) => toast({ title: "ข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  // ──────────────────────────────────────────────
  // QR scan handlers — core logic extracted so
  // both USB scanner (keyboard) and camera can
  // share the same processing path
  // ──────────────────────────────────────────────

  function processEmpQr(raw: string) {
    if (!raw) return;
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setScanError(`[QR-EMP-PARSE] ข้อมูล QR ไม่ใช่ JSON ที่ถูกต้อง — ค่าที่รับได้: "${raw.slice(0, 60)}"`);
      return;
    }
    if (parsed.type !== "EMPLOYEE" || !parsed.userId) {
      setScanError(`[QR-EMP-TYPE] QR นี้ไม่ใช่บัตรพนักงาน — type="${parsed.type}" userId=${parsed.userId}`);
      return;
    }
    setIssuedByUserId(Number(parsed.userId));
    setIssuedByName(parsed.name || `User#${parsed.userId}`);
    setScanError(null);
    toast({ title: "สแกนบัตรพนักงานสำเร็จ", description: `ผู้เบิก: ${parsed.name}` });
  }

  function handleEmpQrKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const raw = empQrInput.trim();
    setEmpQrInput("");
    processEmpQr(raw);
  }

  async function processProductQr(raw: string) {
    if (!raw) return;
    if (!company?.id) {
      setScanError("[QR-PROD-NO-COMPANY] ไม่พบข้อมูลบริษัท — กรุณา refresh หน้า");
      return;
    }
    setScanError(null);

    // ── Try to decode as JSON (MATERIAL_LOT or EMPLOYEE QR) ──
    let maybeJson: any = null;
    try { maybeJson = JSON.parse(raw); } catch { /* not JSON — treat as product code */ }

    if (maybeJson !== null) {
      // Route through /api/scan/decode for server-side validation
      const dr = await fetch("/api/scan/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ raw }),
      });
      const decoded = await dr.json();
      if (!dr.ok) {
        setScanError(`[QR-DECODE] ${decoded.message || "QR ไม่รู้จัก"} — raw="${raw.slice(0, 80)}"`);
        return;
      }

      if (decoded.type === "EMPLOYEE") {
        setScanError(`[QR-PROD-WRONG-TYPE] QR นี้คือบัตรพนักงาน — กรุณาใช้ช่อง "สแกนบัตรพนักงาน" ด้านบน`);
        return;
      }

      if (decoded.type === "MATERIAL_LOT") {
        const d = decoded.data;
        const pId = Number(d.productId);
        const pName = String(d.productName || "");
        const lId = d.lotId ? Number(d.lotId) : null;
        const lNo = d.lotNumber ? String(d.lotNumber) : "";
        const unit = d.unit ? String(d.unit) : "ชิ้น";
        if (!pId) {
          setScanError(`[QR-LOT-NO-PRODUCT] QR ล็อตไม่มี productId — ข้อมูล QR ผิดพลาด`);
          return;
        }
        if (!lId) {
          setScanError(`[QR-LOT-NO-LOTID] QR ล็อตไม่มี lotId — ตรวจสอบ QR หรือเลือก Lot ด้วยตนเอง`);
          return;
        }
        // Fetch current lot quantity to show remaining stock warning
        let lotAvailableQty: number | undefined = undefined;
        try {
          const lotRes = await fetch(`/api/product-lots?companyId=${company.id}&productId=${pId}`, { credentials: "include" });
          if (lotRes.ok) {
            const lotList: LotOption[] = await lotRes.json();
            const found = lotList.find(l => l.id === lId);
            if (found) lotAvailableQty = Number(found.quantity);
          }
        } catch { /* ignore — stock column will show "—" */ }
        setItems(prev => [...prev, {
          productId: pId,
          productName: pName,
          lotId: lId,
          lotNumber: lNo,
          quantity: 1,
          unit,
          trackLots: true,
          lotAvailableQty,
        }]);
        toast({ title: "สแกน Lot QR สำเร็จ", description: `${pName} — Lot: ${lNo}` });
        return;
      }

      setScanError(`[QR-PROD-UNKNOWN] QR type "${decoded.type}" ไม่รองรับในใบเบิก`);
      return;
    }

    // ── Plain string → search by product code ──
    const r = await fetch(`/api/products?companyId=${company.id}&search=${encodeURIComponent(raw)}&limit=5`, { credentials: "include" });
    if (!r.ok) {
      setScanError(`[QR-PROD-API] โหลดสินค้าไม่สำเร็จ — code="${raw}"`);
      return;
    }
    const data = await r.json();
    const list: ProductOption[] = data.data ?? data;
    const matched = list.find(p => p.code === raw);
    if (!matched) {
      setScanError(`[QR-PROD-NOT-FOUND] ไม่พบสินค้า code="${raw}" — ตรวจสอบรหัสสินค้าหรือ QR`);
      return;
    }
    setSelectedProduct(matched);
    setSelectedLotId(null);
    setAddQty(1);
    toast({ title: "พบสินค้า", description: `${matched.name} (${matched.code})` });
    if (!matched.trackLots) {
      addItemFromProduct(matched, null, null, 1);
    }
  }

  async function handleProductQrKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const raw = productQrInput.trim();
    setProductQrInput("");
    await processProductQr(raw);
  }

  function addItemFromProduct(prod: ProductOption, lotId: number | null, lotNumber: string | null, qty: number, lotAvailableQty?: number) {
    if (!prod.id) {
      throw new Error(`[MAT-ISSUE-ADD] productId null — สินค้า "${prod.name}" ไม่มี id`);
    }
    if (qty <= 0) {
      toast({ title: "จำนวนต้องมากกว่า 0", variant: "destructive" });
      return;
    }
    setItems(prev => [...prev, {
      productId: prod.id,
      productName: prod.name,
      lotId: lotId ?? null,
      lotNumber: lotNumber ?? "",
      quantity: qty,
      unit: prod.unit || "ชิ้น",
      trackLots: prod.trackLots,
      lotAvailableQty,
    }]);
    setSelectedProduct(null);
    setSelectedLotId(null);
    setAddQty(1);
  }

  function handleAddFromPanel() {
    if (!selectedProduct) {
      toast({ title: "กรุณาเลือกสินค้าก่อน", variant: "destructive" });
      return;
    }
    if (selectedProduct.trackLots && !selectedLotId) {
      toast({ title: "สินค้านี้ต้องเลือก Lot", variant: "destructive" });
      return;
    }
    let lotNum: string | null = null;
    let lotAvailableQty: number | undefined = undefined;
    if (selectedLotId) {
      const found = lots.find(l => l.id === selectedLotId);
      if (!found) {
        throw new Error(`[MAT-ISSUE-LOT] lotId=${selectedLotId} ไม่พบใน lots list — ข้อมูลผิดพลาด`);
      }
      lotNum = found.lotNumber;
      lotAvailableQty = Number(found.quantity);
    }
    addItemFromProduct(selectedProduct, selectedLotId, lotNum, addQty, lotAvailableQty);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateQty(idx: number, val: number) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
  }

  // ──────────────────────────────────────────────
  // Render: loading state
  // ──────────────────────────────────────────────

  if (isEditMode && loadingIssue) {
    return (
      <div className="container mx-auto py-6 max-w-4xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (isEditMode && !existingIssue) {
    return (
      <div className="container mx-auto py-6 max-w-4xl text-center text-muted-foreground" data-testid="text-not-found">
        ไม่พบใบเบิกวัตถุดิบ #{idProp}
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // Render: view mode (existing issue)
  // ──────────────────────────────────────────────

  if (isEditMode && existingIssue) {
    return (
      <div className="container mx-auto py-6 max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(`${urlBase}/material-issues`)} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <ClipboardList className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold" data-testid="title-issue-view">ใบเบิกวัตถุดิบ {existingIssue.issue_no}</h1>
            <StatusBadge status={existingIssue.status} />
          </div>
          {existingIssue.status === "draft" && (() => {
            const hasStockIssue = existingIssue.items.some(it => {
              if (!it.lot_id) return false;
              const avail = viewModeLotQtys[it.lot_id as number];
              // Block if over-stock OR if stock data couldn't be fetched for a lot item
              if (avail === undefined && viewModeLotIds.length > 0 && Object.keys(viewModeLotQtys).length > 0) return false;
              return avail !== undefined && Number(it.quantity) > avail;
            });
            const hasFetchGap = viewModeLotIds.length > 0
              && Object.keys(viewModeLotQtys).length > 0
              && existingIssue.items.some(it => it.lot_id && viewModeLotQtys[it.lot_id as number] === undefined);
            const isBlocked = hasStockIssue || hasFetchGap;
            const tooltipMsg = hasFetchGap
              ? "ตรวจสอบสต็อกไม่ได้ — กรุณา refresh หน้า"
              : hasStockIssue ? "สต็อกไม่เพียงพอ" : null;
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        className="bg-green-600 hover:bg-green-700 text-white"
                        onClick={() => confirmMutation.mutate(existingIssue.id)}
                        disabled={confirmMutation.isPending || isBlocked}
                        data-testid="button-confirm-issue"
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {confirmMutation.isPending ? "กำลังยืนยัน..." : "ยืนยันการเบิก"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {tooltipMsg && (
                    <TooltipContent>{tooltipMsg}</TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          })()}
        </div>

        {/* Details card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">รายละเอียด</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground text-xs mb-1">เลขที่ใบเบิก</div>
              <div className="font-medium" data-testid="text-issue-no">{existingIssue.issue_no}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">สถานะ</div>
              <StatusBadge status={existingIssue.status} />
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">ใบสั่งผลิต (MO)</div>
              <div data-testid="text-mo-no">{existingIssue.mo_no || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs mb-1">ผู้เบิก</div>
              <div data-testid="text-issued-by">{existingIssue.issued_by_name || "—"}</div>
            </div>
            {existingIssue.issued_at && (
              <div>
                <div className="text-muted-foreground text-xs mb-1">วันที่ยืนยัน</div>
                <div data-testid="text-issued-at">{new Date(existingIssue.issued_at).toLocaleString("th-TH")}</div>
              </div>
            )}
            {existingIssue.notes && (
              <div className="col-span-2">
                <div className="text-muted-foreground text-xs mb-1">หมายเหตุ</div>
                <div data-testid="text-notes">{existingIssue.notes}</div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">รายการวัตถุดิบ</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>สินค้า</TableHead>
                  <TableHead>Lot</TableHead>
                  <TableHead className="text-right">คงเหลือ</TableHead>
                  <TableHead className="text-right">จำนวน</TableHead>
                  <TableHead>หน่วย</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {existingIssue.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8" data-testid="text-empty-items">
                      ไม่มีรายการ
                    </TableCell>
                  </TableRow>
                ) : (
                  existingIssue.items.map((it, idx) => {
                    const avail = it.lot_id ? viewModeLotQtys[it.lot_id as number] : undefined;
                    const isOver = avail !== undefined && Number(it.quantity) > avail;
                    return (
                      <TableRow key={it.id} data-testid={`row-issue-item-${it.id}`} className={isOver ? "bg-red-50" : undefined}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell data-testid={`text-item-product-${it.id}`}>
                          {isOver && <AlertTriangle className="inline h-3 w-3 text-red-500 mr-1" />}
                          {it.product_name}
                        </TableCell>
                        <TableCell data-testid={`text-item-lot-${it.id}`}>{it.lot_number || "—"}</TableCell>
                        <TableCell className={`text-right ${isOver ? "text-red-600 font-medium" : "text-muted-foreground"}`} data-testid={`text-item-avail-${it.id}`}>
                          {avail !== undefined ? avail.toLocaleString() : "—"}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-item-qty-${it.id}`}>{Number(it.quantity).toLocaleString()}</TableCell>
                        <TableCell data-testid={`text-item-unit-${it.id}`}>{it.unit}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // Render: create new issue form
  // ──────────────────────────────────────────────

  return (
    <div className="container mx-auto py-6 max-w-4xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(`${urlBase}/material-issues`)} data-testid="button-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <ClipboardList className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold" data-testid="title-create-issue">สร้างใบเบิกวัตถุดิบใหม่</h1>
      </div>

      {/* Employee QR + MO + Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            ข้อมูลการเบิก
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Employee QR scan */}
          <div className="space-y-1">
            <Label htmlFor="emp-qr-input">สแกน QR บัตรพนักงาน (ผู้เบิก)</Label>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="emp-qr-input"
                  className="pl-9"
                  placeholder="วางเคอร์เซอร์แล้วสแกน QR บัตรพนักงาน..."
                  value={empQrInput}
                  onChange={e => setEmpQrInput(e.target.value)}
                  onKeyDown={handleEmpQrKeyDown}
                  data-testid="input-employee-qr"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="md:hidden shrink-0 gap-1.5"
                onClick={() => setEmpCameraOpen(true)}
                aria-label="สแกนด้วยกล้อง"
                data-testid="button-emp-camera-scan"
              >
                <Camera className="h-4 w-4" />
                <span className="text-xs">กล้อง</span>
              </Button>
              {issuedByName && (
                <Badge className="bg-blue-600 text-white whitespace-nowrap" data-testid="badge-issued-by">
                  <UserCheck className="h-3 w-3 mr-1" />
                  {issuedByName}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">หรือเลือกจากรายการ:</p>
            <Select
              value={issuedByUserId ? String(issuedByUserId) : ""}
              onValueChange={val => {
                const emp = employees.find(e => e.id === Number(val));
                if (!emp) {
                  throw new Error(`[MAT-ISSUE-EMP] userId=${val} ไม่พบในรายการพนักงาน — ข้อมูลผิดพลาด`);
                }
                setIssuedByUserId(emp.id);
                setIssuedByName(emp.fullName);
              }}
            >
              <SelectTrigger data-testid="select-employee">
                <SelectValue placeholder="เลือกพนักงาน (ไม่บังคับ)" />
              </SelectTrigger>
              <SelectContent>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={String(emp.id)} data-testid={`option-employee-${emp.id}`}>
                    {emp.fullName} (@{emp.username})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* MO dropdown */}
          <div className="space-y-1">
            <Label>ใบสั่งผลิต (MO) — ไม่บังคับ</Label>
            <Select
              value={moId ? String(moId) : "none"}
              onValueChange={val => setMoId(val === "none" ? null : Number(val))}
            >
              <SelectTrigger data-testid="select-mo">
                <SelectValue placeholder="เลือก MO (ไม่บังคับ)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่เลือก MO —</SelectItem>
                {mos.map(mo => (
                  <SelectItem key={mo.id} value={String(mo.id)} data-testid={`option-mo-${mo.id}`}>
                    {mo.orderNo} ({mo.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Warehouse selector */}
          <div className="space-y-1">
            <Label>คลังต้นทาง (RAW/WIP) — ไม่บังคับ</Label>
            <Select
              value={fromWarehouseId ? String(fromWarehouseId) : "none"}
              onValueChange={val => setFromWarehouseId(val === "none" ? null : Number(val))}
            >
              <SelectTrigger data-testid="select-from-warehouse">
                <SelectValue placeholder="เลือกคลังต้นทาง (ไม่บังคับ)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— ไม่เลือกคลัง —</SelectItem>
                {warehouses.map(wh => (
                  <SelectItem key={wh.id} value={String(wh.id)} data-testid={`option-warehouse-${wh.id}`}>
                    {wh.name}{wh.code ? ` (${wh.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="notes-input">หมายเหตุ</Label>
            <Textarea
              id="notes-input"
              placeholder="หมายเหตุเพิ่มเติม..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              data-testid="input-notes"
            />
          </div>
        </CardContent>
      </Card>

      {/* QR scan + manual add panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-4 w-4" />
            เพิ่มรายการวัตถุดิบ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Scan error display */}
          {scanError && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-sm" data-testid="text-scan-error">
              <p className="font-medium text-red-700">ข้อผิดพลาดการสแกน</p>
              <p className="text-red-600 mt-1">{scanError}</p>
              <Button variant="ghost" size="sm" className="mt-1 text-red-600 px-0" onClick={() => setScanError(null)}>
                ปิด
              </Button>
            </div>
          )}

          {/* Product QR input */}
          <div className="space-y-1">
            <Label htmlFor="product-qr-input">สแกน QR สินค้า (กด Enter หลังสแกน)</Label>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="product-qr-input"
                  ref={productQrRef}
                  className="pl-9"
                  placeholder="สแกน QR label สินค้า..."
                  value={productQrInput}
                  onChange={e => setProductQrInput(e.target.value)}
                  onKeyDown={handleProductQrKeyDown}
                  data-testid="input-product-qr"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="md:hidden shrink-0 gap-1.5"
                onClick={() => setProductCameraOpen(true)}
                aria-label="สแกนด้วยกล้อง"
                data-testid="button-product-camera-scan"
              >
                <Camera className="h-4 w-4" />
                <span className="text-xs">กล้อง</span>
              </Button>
            </div>
          </div>

          {/* Manual select */}
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <p className="text-sm font-medium text-muted-foreground">หรือเลือกสินค้าด้วยตนเอง</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2 space-y-1">
                <Label>สินค้า</Label>
                <Select
                  value={selectedProduct ? String(selectedProduct.id) : ""}
                  onValueChange={val => {
                    const prod = allProducts.find(p => p.id === Number(val));
                    if (!prod) {
                      throw new Error(`[MAT-ISSUE-SELECT] productId=${val} ไม่พบใน allProducts — ข้อมูลผิดพลาด`);
                    }
                    setSelectedProduct(prod);
                    setSelectedLotId(null);
                    setAddQty(1);
                  }}
                >
                  <SelectTrigger data-testid="select-product">
                    <SelectValue placeholder="เลือกสินค้า" />
                  </SelectTrigger>
                  <SelectContent>
                    {allProducts.map(p => (
                      <SelectItem key={p.id} value={String(p.id)} data-testid={`option-product-${p.id}`}>
                        [{p.code}] {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>จำนวน</Label>
                <Input
                  type="number"
                  min={1}
                  value={addQty}
                  onChange={e => setAddQty(Number(e.target.value))}
                  data-testid="input-add-qty"
                />
              </div>
            </div>

            {/* Lot selection (only if trackLots) */}
            {selectedProduct?.trackLots && (
              <div className="space-y-1">
                <Label>Lot (บังคับเลือกสำหรับสินค้านี้)</Label>
                <Select
                  value={selectedLotId ? String(selectedLotId) : ""}
                  onValueChange={val => setSelectedLotId(Number(val))}
                >
                  <SelectTrigger data-testid="select-lot">
                    <SelectValue placeholder="เลือก Lot" />
                  </SelectTrigger>
                  <SelectContent>
                    {lots.length === 0 ? (
                      <SelectItem value="none" disabled>ไม่มี Lot ในระบบ</SelectItem>
                    ) : (
                      lots.map(l => {
                        const qty = Number(l.quantity);
                        const productThreshold = selectedProduct?.lowStockThreshold ?? 0;
                        const companyThreshold = companySettings?.lotLowStockThreshold ?? 10;
                        const threshold = productThreshold > 0 ? productThreshold : companyThreshold;
                        const isOutOfStock = qty <= 0;
                        const isLowStock = !isOutOfStock && qty < threshold;
                        const expiryText = l.expiryDate
                          ? ` | หมดอายุ: ${new Date(l.expiryDate).toLocaleDateString("th-TH")}`
                          : "";
                        return (
                          <SelectItem
                            key={l.id}
                            value={String(l.id)}
                            disabled={isOutOfStock}
                            data-testid={`option-lot-${l.id}`}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <span>
                                {l.lotNumber} (คงเหลือ: {qty.toLocaleString()}{expiryText})
                              </span>
                              {isOutOfStock && (
                                <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground" data-testid={`badge-lot-out-${l.id}`}>
                                  หมดสต็อก
                                </span>
                              )}
                              {isLowStock && (
                                <span className="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-600" data-testid={`badge-lot-low-${l.id}`}>
                                  ใกล้หมด
                                </span>
                              )}
                            </div>
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              variant="outline"
              onClick={handleAddFromPanel}
              disabled={!selectedProduct}
              data-testid="button-add-item"
            >
              <Plus className="h-4 w-4 mr-2" />
              เพิ่มรายการ
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Items table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            รายการวัตถุดิบที่จะเบิก
            {items.length > 0 && (
              <Badge variant="secondary" className="ml-2">{items.length} รายการ</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.some(it => it.lotAvailableQty !== undefined && it.quantity > it.lotAvailableQty) && (
            <div className="flex items-center gap-2 mx-4 mt-4 p-3 rounded border border-red-300 bg-red-50 text-sm text-red-700" data-testid="alert-stock-insufficient">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>มีรายการที่จำนวนเบิกเกินสต็อกคงเหลือ — กรุณาตรวจสอบก่อนบันทึก</span>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>สินค้า</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead className="text-right">คงเหลือ</TableHead>
                <TableHead className="text-right w-28">จำนวน</TableHead>
                <TableHead className="w-16">หน่วย</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10" data-testid="text-items-empty">
                    ยังไม่มีรายการ — สแกน QR หรือเลือกสินค้าด้านบน
                  </TableCell>
                </TableRow>
              ) : (
                items.map((it, idx) => {
                  const isOver = it.lotAvailableQty !== undefined && it.quantity > it.lotAvailableQty;
                  return (
                    <TableRow key={idx} data-testid={`row-new-item-${idx}`} className={isOver ? "bg-red-50" : undefined}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell data-testid={`text-new-product-${idx}`}>
                        {isOver && <AlertTriangle className="inline h-3 w-3 text-red-500 mr-1" />}
                        {it.productName}
                      </TableCell>
                      <TableCell data-testid={`text-new-lot-${idx}`}>{it.lotNumber || "—"}</TableCell>
                      <TableCell className={`text-right ${isOver ? "text-red-600 font-medium" : "text-muted-foreground"}`} data-testid={`text-new-avail-${idx}`}>
                        {it.lotAvailableQty !== undefined ? it.lotAvailableQty.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={1}
                          className={`w-24 text-right ml-auto ${isOver ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                          value={it.quantity}
                          onChange={e => updateQty(idx, Number(e.target.value))}
                          data-testid={`input-qty-${idx}`}
                        />
                      </TableCell>
                      <TableCell data-testid={`text-unit-${idx}`}>{it.unit}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => removeItem(idx)}
                          data-testid={`button-remove-item-${idx}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-end gap-2 pb-6">
        <Button variant="outline" onClick={() => navigate(`${urlBase}/material-issues`)} data-testid="button-cancel">
          ยกเลิก
        </Button>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || items.length === 0}
          data-testid="button-save-draft"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึกร่าง"}
        </Button>
      </div>

      {/* Camera QR scanners — rendered as full-screen overlays, mobile-only */}
      <CameraQrScanner
        open={empCameraOpen}
        onClose={() => setEmpCameraOpen(false)}
        onScan={raw => processEmpQr(raw)}
        title="สแกน QR บัตรพนักงาน"
      />
      <CameraQrScanner
        open={productCameraOpen}
        onClose={() => setProductCameraOpen(false)}
        onScan={raw => processProductQr(raw)}
        title="สแกน QR สินค้า / Lot"
      />
    </div>
  );
}
