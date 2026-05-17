import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Factory, Play, CheckCircle, Save, Package, BookOpen, Calculator, QrCode, ClipboardList, Plus, ExternalLink, ListChecks, Printer } from "lucide-react";
import { useState, useEffect, useMemo, type ComponentType, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useLocation, useParams } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/format";
import { DatePicker } from "@/components/ui/date-picker";
import { useDateSettings } from "@/hooks/use-date-settings";

interface MOLine {
  componentProductId: number;
  componentName: string;
  componentCode: string;
  requiredQty: string;
  unit: string;
  consumedQty?: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "ร่าง", color: "bg-gray-100 text-gray-700", icon: null },
  in_progress: { label: "กำลังผลิต", color: "bg-blue-100 text-blue-700", icon: Play },
  completed: { label: "เสร็จสิ้น", color: "bg-green-100 text-green-700", icon: CheckCircle },
  cancelled: { label: "ยกเลิก", color: "bg-red-100 text-red-700", icon: null },
};

export default function ManufacturingForm(props: { Wrapper?: ComponentType<{ children: ReactNode }>; basePath?: string } = {}) {
  const LayoutComponent = props.Wrapper || Layout;
  const basePath = props.basePath || "/inventory/manufacturing";
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { dateEra, dateFmt } = useDateSettings();
  const { selectedCompanyId } = useCompany();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const editId = params.id ? Number(params.id) : null;

  const [bomId, setBomId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [plannedQty, setPlannedQty] = useState("1");
  const [unit, setUnit] = useState("ชิ้น");
  const [lotNumber, setLotNumber] = useState("");
  const [mfgDate, setMfgDate] = useState(new Date().toISOString().slice(0, 10));
  const [shelfLife, setShelfLife] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<MOLine[]>([]);
  const [moStatus, setMoStatus] = useState("draft");
  const [moData, setMoData] = useState<any>(null);
  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>("");
  const [targetWarehouseId, setTargetWarehouseId] = useState<string>("");

  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [qrPrintOpen, setQrPrintOpen] = useState(false);
  const [completedQty, setCompletedQty] = useState("");
  const [completeLot, setCompleteLot] = useState("");
  const [completeMfgDate, setCompleteMfgDate] = useState("");
  const [completeShelfLife, setCompleteShelfLife] = useState("");
  const [completeExpDate, setCompleteExpDate] = useState("");

  const { data: boms = [] } = useQuery<any[]>({
    queryKey: ["/api/bom", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/bom?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouses", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/warehouses?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const { data: allProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/products", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/products?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const { data: processLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/manufacturing-orders", editId, "process-logs", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/manufacturing-orders/${editId}/process-logs?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!editId && !!selectedCompanyId,
  });

  const { data: bomProcessSteps = [] } = useQuery<any[]>({
    queryKey: ["/api/bom", bomId, "process-steps"],
    queryFn: async () => {
      if (!bomId) return [];
      const r = await fetch(`/api/bom/${bomId}/process-steps`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!bomId,
  });

  const { data: materialIssues = [] } = useQuery<any[]>({
    queryKey: ["/api/material-issues", selectedCompanyId, editId],
    queryFn: async () => {
      const r = await fetch(`/api/material-issues?companyId=${selectedCompanyId}&moId=${editId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!editId && !!selectedCompanyId && (moStatus === "in_progress" || moStatus === "completed"),
  });

  const { data: issuedSummary } = useQuery<{ issuedMap: Record<string, number> }>({
    queryKey: ["/api/manufacturing-orders", editId, "issued-summary", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/manufacturing-orders/${editId}/issued-summary?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return { issuedMap: {} };
      return r.json();
    },
    enabled: !!editId && !!selectedCompanyId && (moStatus === "in_progress" || moStatus === "completed"),
  });

  const { data: moDetail } = useQuery<any>({
    queryKey: ["/api/manufacturing-orders", editId, selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/manufacturing-orders/${editId}?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!editId && !!selectedCompanyId,
  });

  useEffect(() => {
    if (moDetail) {
      setBomId(moDetail.bomId ? String(moDetail.bomId) : "");
      setProductId(String(moDetail.productId));
      setPlannedQty(moDetail.plannedQty || "1");
      setUnit(moDetail.unit || "ชิ้น");
      setLotNumber(moDetail.lotNumber || "");
      setMfgDate(moDetail.manufacturingDate || "");
      setExpiryDate(moDetail.expiryDate || "");
      if (moDetail.expiryDate && moDetail.manufacturingDate) {
        const diff = Math.round((new Date(moDetail.expiryDate).getTime() - new Date(moDetail.manufacturingDate).getTime()) / 86400000);
        if (diff > 0) setShelfLife(String(diff));
      }
      setNotes(moDetail.notes || "");
      setMoStatus(moDetail.status);
      setMoData(moDetail);
      setSourceWarehouseId(moDetail.sourceWarehouseId ? String(moDetail.sourceWarehouseId) : "");
      setTargetWarehouseId(moDetail.targetWarehouseId ? String(moDetail.targetWarehouseId) : "");
      if (moDetail.lines) {
        setLines(moDetail.lines.map((l: any) => ({
          componentProductId: l.componentProductId,
          componentName: l.componentName || "",
          componentCode: l.componentCode || "",
          requiredQty: l.requiredQty || "0",
          unit: l.unit || "ชิ้น",
          consumedQty: l.consumedQty || "0",
        })));
      }
    }
  }, [moDetail]);

  useEffect(() => {
    if (mfgDate && shelfLife && Number(shelfLife) > 0) {
      const d = new Date(mfgDate);
      d.setDate(d.getDate() + Number(shelfLife));
      setExpiryDate(d.toISOString().slice(0, 10));
    }
  }, [mfgDate, shelfLife]);

  useEffect(() => {
    if (completeMfgDate && completeShelfLife && Number(completeShelfLife) > 0) {
      const d = new Date(completeMfgDate);
      d.setDate(d.getDate() + Number(completeShelfLife));
      setCompleteExpDate(d.toISOString().slice(0, 10));
    }
  }, [completeMfgDate, completeShelfLife]);

  const handleBomSelect = (bId: string) => {
    if (bId === "none") {
      setBomId("");
      setLines([]);
      return;
    }
    setBomId(bId);
    if (!bId) return;
    const bom = boms.find((b: any) => b.id === Number(bId));
    if (!bom) return;
    setProductId(String(bom.productId));
    setUnit(bom.unit || "ชิ้น");

    const fetchLines = async () => {
      const r = await fetch(`/api/bom/${bom.id}?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return;
      const detail = await r.json();
      if (detail.lines) {
        const prodMap = new Map(allProducts.map((p: any) => [p.id, p]));
        setLines(detail.lines.map((l: any) => {
          const prod = prodMap.get(l.componentProductId);
          return {
            componentProductId: l.componentProductId,
            componentName: prod?.name || "",
            componentCode: prod?.code || "",
            requiredQty: l.qty || "1",
            unit: l.unit || "ชิ้น",
          };
        }));
      }
    };
    fetchLines();
  };

  const isReadOnly = moStatus === "completed" || moStatus === "cancelled";

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        companyId: selectedCompanyId,
        bomId: bomId ? Number(bomId) : null,
        productId: Number(productId),
        plannedQty,
        unit,
        lotNumber: lotNumber || null,
        manufacturingDate: mfgDate || null,
        expiryDate: expiryDate || null,
        notes: notes || null,
        sourceWarehouseId: sourceWarehouseId ? Number(sourceWarehouseId) : null,
        targetWarehouseId: targetWarehouseId ? Number(targetWarehouseId) : null,
        lines: lines.map(l => ({
          componentProductId: l.componentProductId,
          requiredQty: l.requiredQty,
          unit: l.unit,
        })),
      };
      if (editId) {
        return apiRequest("PATCH", `/api/manufacturing-orders/${editId}?companyId=${selectedCompanyId}`, payload);
      }
      return apiRequest("POST", "/api/manufacturing-orders", payload);
    },
    onSuccess: async (r) => {
      const data = await r.json();
      toast({ title: editId ? "บันทึกแล้ว" : "สร้างใบสั่งผลิตแล้ว" });
      qc.invalidateQueries({ queryKey: ["/api/manufacturing-orders"] });
      if (!editId) navigate(`${basePath}/form/${data.id}`);
    },
    onError: (err: any) => toast({ title: "บันทึกไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/manufacturing-orders/${editId}/start?companyId=${selectedCompanyId}`, { companyId: selectedCompanyId });
    },
    onSuccess: () => {
      toast({ title: "เริ่มการผลิตแล้ว" });
      qc.invalidateQueries({ queryKey: ["/api/manufacturing-orders"] });
    },
    onError: (err: any) => toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/manufacturing-orders/${editId}/complete?companyId=${selectedCompanyId}`, {
        companyId: selectedCompanyId,
        completedQty: completedQty || plannedQty,
        lotNumber: completeLot || lotNumber || undefined,
        manufacturingDate: completeMfgDate || mfgDate || undefined,
        expiryDate: completeExpDate || expiryDate || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: "ผลิตเสร็จสิ้น! สินค้าเข้าคลังแล้ว" });
      setCompleteDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/manufacturing-orders"] });
      qc.invalidateQueries({ queryKey: ["/api/product-lots"] });
      qc.invalidateQueries({ queryKey: ["/api/product-stock"] });
    },
    onError: (err: any) => toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const journalMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/manufacturing-orders/${editId}/create-journal?companyId=${selectedCompanyId}`, { companyId: selectedCompanyId });
    },
    onSuccess: async (r) => {
      const data = await r.json();
      toast({ title: `บันทึกบัญชีสำเร็จ เลขที่ ${data.entryNo}` });
      qc.invalidateQueries({ queryKey: ["/api/manufacturing-orders"] });
    },
    onError: (err: any) => toast({ title: "บันทึกบัญชีไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const openCompleteDialog = () => {
    setCompletedQty(plannedQty);
    setCompleteLot(lotNumber);
    setCompleteMfgDate(mfgDate);
    setCompleteShelfLife(shelfLife);
    setCompleteExpDate(expiryDate);
    setCompleteDialogOpen(true);
  };

  const selectedProduct = allProducts.find((p: any) => p.id === Number(productId));
  const st = STATUS_MAP[moStatus] || STATUS_MAP.draft;

  const productCostMap = useMemo(() => {
    const m = new Map<number, number>();
    allProducts.forEach((p: any) => m.set(p.id, Number(p.cost || 0)));
    return m;
  }, [allProducts]);

  const costEstimate = useMemo(() => {
    if (lines.length === 0) return { lineCosts: [] as { cost: number; total: number }[], totalCost: 0, unitCost: 0, hasCost: false };
    if (moStatus === "completed" && moData) {
      const realTotal = Number(moData.totalCost || 0);
      const realUnit = Number(moData.unitCost || 0);
      const lineCosts = lines.map(line => {
        const cost = productCostMap.get(line.componentProductId) || 0;
        const reqQty = Number(line.consumedQty || line.requiredQty) || 0;
        const total = cost * reqQty;
        return { cost, total };
      });
      const hasCost = realTotal > 0 || lineCosts.some(lc => lc.cost > 0);
      return { lineCosts, totalCost: realTotal, unitCost: realUnit, hasCost };
    }
    const qty = Number(plannedQty) || 1;
    let totalCost = 0;
    const lineCosts = lines.map(line => {
      const cost = productCostMap.get(line.componentProductId) || 0;
      const reqQty = Number(line.requiredQty) || 0;
      const total = cost * reqQty;
      totalCost += total;
      return { cost, total };
    });
    const hasCost = lineCosts.some(lc => lc.cost > 0);
    return { lineCosts, totalCost, unitCost: totalCost / qty, hasCost };
  }, [lines, plannedQty, productCostMap, moStatus, moData]);

  return (
    <LayoutComponent>
      <div className="space-y-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(basePath)} data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Factory className="h-6 w-6" style={{ color: "#fb9678" }} />
            <h1 className="text-xl font-bold">{editId ? `ใบสั่งผลิต ${moData?.orderNo || ""}` : "สร้างใบสั่งผลิตใหม่"}</h1>
            {editId && <Badge className={st.color}>{st.label}</Badge>}
          </div>
          <div className="flex gap-2">
            {!isReadOnly && (
              <Button onClick={() => saveMutation.mutate()} disabled={!productId || saveMutation.isPending} data-testid="button-save-mo">
                <Save className="h-4 w-4 mr-1" /> บันทึก
              </Button>
            )}
            {editId && moStatus === "draft" && (
              <Button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                style={{ backgroundColor: "#539BFF" }}
                data-testid="button-start-mo"
              >
                <Play className="h-4 w-4 mr-1" /> เริ่มผลิต
              </Button>
            )}
            {editId && (moStatus === "draft" || moStatus === "in_progress") && (
              <Button
                onClick={openCompleteDialog}
                style={{ backgroundColor: "#05b187" }}
                data-testid="button-complete-mo"
              >
                <CheckCircle className="h-4 w-4 mr-1" /> ผลิตเสร็จ
              </Button>
            )}
            {editId && moStatus === "completed" && !moData?.journalEntryId && (
              <Button
                onClick={() => journalMutation.mutate()}
                disabled={journalMutation.isPending}
                style={{ backgroundColor: "#539BFF" }}
                data-testid="button-create-journal"
              >
                <BookOpen className="h-4 w-4 mr-1" /> {journalMutation.isPending ? "กำลังบันทึก..." : "บันทึกบัญชี"}
              </Button>
            )}
            {editId && moStatus === "completed" && moData?.journalEntryId && (
              <Badge className="bg-blue-100 text-blue-700 gap-1 py-1.5 px-3">
                <BookOpen className="h-3.5 w-3.5" /> บันทึกบัญชีแล้ว
              </Badge>
            )}
            {editId && moData?.orderNo && (
              <Button
                variant="outline"
                onClick={() => setQrPrintOpen(true)}
                data-testid="button-print-mo-qr"
              >
                <Printer className="h-4 w-4 mr-1" /> พิมพ์ QR MO
              </Button>
            )}
            {editId && moStatus === "completed" && (
              <Button
                variant="outline"
                onClick={() => navigate(`/manufacturing/traceability?lot=${encodeURIComponent(moData?.lotNumber || moData?.orderNo || "")}`)}
                data-testid="button-qr-traceability"
              >
                <QrCode className="h-4 w-4 mr-1" /> QR Traceability
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ข้อมูลการผลิต</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-sm font-semibold flex items-center gap-1">
                  <Package className="h-4 w-4" style={{ color: "#fb9678" }} />
                  สูตรการผลิต (BOM)
                </Label>
                <Select value={bomId} onValueChange={handleBomSelect} disabled={isReadOnly}>
                  <SelectTrigger className="mt-1 border-2 border-orange-200 focus:border-orange-400" data-testid="select-bom">
                    <SelectValue placeholder="-- เลือกสูตรการผลิต --" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- ไม่ใช้สูตร (เลือกเอง) --</SelectItem>
                    {boms.map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {boms.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">ยังไม่มีสูตรการผลิต — สร้างได้ที่เมนู "สูตรผลิต (BOM)"</p>
                )}
              </div>
              <div>
                <Label className="text-sm">สินค้าสำเร็จรูป *</Label>
                <Select value={productId} onValueChange={setProductId} disabled={isReadOnly || !!bomId}>
                  <SelectTrigger className="mt-1" data-testid="select-product">
                    <SelectValue placeholder="เลือกสินค้า" />
                  </SelectTrigger>
                  <SelectContent>
                    {allProducts.map((p: any) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.code} — {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">จำนวนที่ต้องการผลิต</Label>
                  <Input
                    type="number"
                    value={plannedQty}
                    onChange={e => setPlannedQty(e.target.value)}
                    disabled={isReadOnly}
                    data-testid="input-planned-qty"
                  />
                </div>
                <div>
                  <Label className="text-xs">หน่วย</Label>
                  <Input value={unit} onChange={e => setUnit(e.target.value)} disabled={isReadOnly} data-testid="input-unit" />
                </div>
              </div>
              <div>
                <Label className="text-xs">หมายเหตุ</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={isReadOnly} rows={2} data-testid="input-notes" />
              </div>
              {warehouses.length > 0 && (
                <div className="grid grid-cols-2 gap-3 pt-1 border-t">
                  <div>
                    <Label className="text-xs text-blue-700">คลังวัตถุดิบ (ต้นทาง)</Label>
                    <Select value={sourceWarehouseId || "none"} onValueChange={v => setSourceWarehouseId(v === "none" ? "" : v)} disabled={isReadOnly}>
                      <SelectTrigger className="mt-1 text-xs" data-testid="select-source-warehouse">
                        <SelectValue placeholder="-- ไม่ระบุ --" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- ไม่ระบุ --</SelectItem>
                        {warehouses.map((w: any) => (
                          <SelectItem key={w.id} value={String(w.id)}>{w.code} — {w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-green-700">คลังสินค้าสำเร็จรูป (ปลายทาง)</Label>
                    <Select value={targetWarehouseId || "none"} onValueChange={v => setTargetWarehouseId(v === "none" ? "" : v)} disabled={isReadOnly}>
                      <SelectTrigger className="mt-1 text-xs" data-testid="select-target-warehouse">
                        <SelectValue placeholder="-- ไม่ระบุ --" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- ไม่ระบุ --</SelectItem>
                        {warehouses.map((w: any) => (
                          <SelectItem key={w.id} value={String(w.id)}>{w.code} — {w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">ข้อมูลล็อต / วันหมดอายุ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">เลขล็อต</Label>
                <Input
                  value={lotNumber}
                  onChange={e => setLotNumber(e.target.value)}
                  placeholder="ระบบจะสร้างอัตโนมัติถ้าไม่กรอก"
                  disabled={isReadOnly}
                  data-testid="input-lot-number"
                />
              </div>
              <div>
                <Label className="text-xs">วันผลิต</Label>
                {isReadOnly ? (
                  <Input value={mfgDate ? formatDate(mfgDate, dateEra, dateFmt) : ""} disabled data-testid="input-mfg-date" />
                ) : (
                  <DatePicker value={mfgDate} onChange={setMfgDate} dateEra={dateEra} dateFormat={dateFmt} data-testid="input-mfg-date" />
                )}
              </div>
              <div>
                <Label className="text-xs">อายุการใช้งาน (วัน)</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="1"
                    value={shelfLife}
                    onChange={e => {
                      setShelfLife(e.target.value);
                      if (!e.target.value) setExpiryDate("");
                    }}
                    placeholder="เช่น 365"
                    disabled={isReadOnly}
                    className="pr-10"
                    data-testid="input-shelf-life"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">วัน</span>
                </div>
              </div>
              <div>
                <Label className="text-xs">
                  วันหมดอายุ
                  {shelfLife && !isReadOnly && (
                    <span className="ml-1 text-cyan-600 font-normal">(คำนวณอัตโนมัติ)</span>
                  )}
                </Label>
                {isReadOnly || shelfLife ? (
                  <Input
                    value={expiryDate ? formatDate(expiryDate, dateEra, dateFmt) : ""}
                    disabled
                    className={shelfLife && !isReadOnly ? "bg-cyan-50 border-cyan-200 text-cyan-800" : ""}
                    data-testid="input-expiry-date"
                  />
                ) : (
                  <DatePicker value={expiryDate} onChange={setExpiryDate} dateEra={dateEra} dateFormat={dateFmt} data-testid="input-expiry-date" />
                )}
              </div>
              {moStatus === "completed" && moData && (
                <div className="bg-green-50 rounded-lg p-3 space-y-1">
                  <p className="text-sm font-medium text-green-800">ผลิตเสร็จสิ้น</p>
                  <p className="text-xs text-green-700">จำนวนที่ผลิตได้: {moData.completedQty} {moData.unit}</p>
                  <p className="text-xs text-green-700">ล็อต: {moData.lotNumber}</p>
                  {moData.completedAt && <p className="text-xs text-green-600">เสร็จเมื่อ: {formatDate(moData.completedAt)}</p>}
                  {(moData.totalCost > 0 || moData.unitCost > 0) && (
                    <div className="mt-2 pt-2 border-t border-green-200">
                      <p className="text-sm font-medium text-green-800">ต้นทุนการผลิต</p>
                      <p className="text-xs text-green-700" data-testid="text-unit-cost">ต้นทุนต่อหน่วย: {Number(moData.unitCost).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} บาท</p>
                      <p className="text-xs text-green-700" data-testid="text-total-cost">ต้นทุนรวม: {Number(moData.totalCost).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} บาท</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4" /> วัตถุดิบที่ใช้
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>รหัสสินค้า</TableHead>
                  <TableHead>ชื่อวัตถุดิบ</TableHead>
                  <TableHead className="w-28 text-right">จำนวนที่ต้องใช้</TableHead>
                  <TableHead className="w-20 text-center">หน่วย</TableHead>
                  <TableHead className="w-28 text-right">ต้นทุน/หน่วย</TableHead>
                  <TableHead className="w-28 text-right">ต้นทุนรวม</TableHead>
                  {moStatus === "completed" && <TableHead className="w-28 text-right">ใช้จริง</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={moStatus === "completed" ? 8 : 7} className="text-center py-8 text-muted-foreground">
                      {bomId ? "ไม่มีวัตถุดิบในสูตร" : "เลือกสูตรการผลิต (BOM) เพื่อดึงวัตถุดิบ"}
                    </TableCell>
                  </TableRow>
                )}
                {lines.map((line, idx) => {
                  const lc = costEstimate.lineCosts[idx];
                  return (
                  <TableRow key={idx}>
                    <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="font-mono text-xs">{line.componentCode}</TableCell>
                    <TableCell className="text-sm">{line.componentName}</TableCell>
                    <TableCell className="text-right">
                      {isReadOnly ? (
                        <span className="tabular-nums">{line.requiredQty}</span>
                      ) : (
                        <Input
                          type="number"
                          className="h-8 w-24 text-right ml-auto"
                          value={line.requiredQty}
                          onChange={e => {
                            const updated = [...lines];
                            updated[idx].requiredQty = e.target.value;
                            setLines(updated);
                          }}
                          data-testid={`input-req-qty-${idx}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs">{line.unit}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {lc && lc.cost > 0 ? lc.cost.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-gray-400">-</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium">
                      {lc && lc.total > 0 ? lc.total.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : <span className="text-gray-400">-</span>}
                    </TableCell>
                    {moStatus === "completed" && (
                      <TableCell className="text-right tabular-nums text-sm">{line.consumedQty || "0"}</TableCell>
                    )}
                  </TableRow>
                  );
                })}
                {lines.length > 0 && (
                  <TableRow className="bg-slate-50 font-semibold">
                    <TableCell colSpan={5} className="text-right text-sm">รวมต้นทุนวัตถุดิบทั้งหมด</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">-</TableCell>
                    <TableCell className="text-right tabular-nums text-sm" style={{ color: "#fb9678" }}>
                      {costEstimate.totalCost > 0
                        ? costEstimate.totalCost.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : "-"}
                    </TableCell>
                    {moStatus === "completed" && <TableCell />}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {lines.length > 0 && (
          <Card className="border-2" style={{ borderColor: costEstimate.hasCost ? "#fb9678" : "#e2e8f0" }}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" style={{ color: "#fb9678" }} />
                  <span className="text-sm font-semibold text-slate-700">
                    {moStatus === "completed" ? "ต้นทุนการผลิตจริง" : "ต้นทุนการผลิต (ประมาณการ)"}
                  </span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-slate-500">ต้นทุนรวม</p>
                    <p className="text-lg font-bold tabular-nums" style={{ color: costEstimate.totalCost > 0 ? "#fb9678" : "#94a3b8" }} data-testid="text-est-total-cost">
                      {costEstimate.totalCost > 0
                        ? `฿${costEstimate.totalCost.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : "ยังไม่มีข้อมูลต้นทุน"}
                    </p>
                  </div>
                  <div className="text-right border-l pl-6 border-slate-200">
                    <p className="text-xs text-slate-500">ต้นทุน/ชิ้น</p>
                    <p className="text-lg font-bold tabular-nums" style={{ color: costEstimate.unitCost > 0 ? "#03c9d7" : "#94a3b8" }} data-testid="text-est-unit-cost">
                      {costEstimate.unitCost > 0
                        ? `฿${costEstimate.unitCost.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                        : "-"}
                    </p>
                  </div>
                  <div className="text-right border-l pl-6 border-slate-200">
                    <p className="text-xs text-slate-500">จำนวนผลิต</p>
                    <p className="text-lg font-bold tabular-nums text-slate-700">
                      {moStatus === "completed" ? moData?.completedQty : plannedQty} {unit}
                    </p>
                  </div>
                </div>
              </div>
              {!costEstimate.hasCost && lines.length > 0 && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  ⚠ วัตถุดิบยังไม่มีราคาต้นทุน — กรุณากรอกราคาต้นทุนในหน้าแก้ไขสินค้าแต่ละตัวก่อน
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {editId && bomProcessSteps.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-cyan-600" /> ความคืบหน้าขั้นตอนการผลิต
                  {processLogs.length > 0 && (
                    <Badge className="bg-cyan-100 text-cyan-700 text-xs">{processLogs.length} บันทึก</Badge>
                  )}
                </CardTitle>
                {moStatus === "in_progress" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/manufacturing/process-scan`)}
                    data-testid="button-go-process-scan"
                  >
                    <QrCode className="h-4 w-4 mr-1" /> Scan Station
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {bomProcessSteps.map((ps: any) => {
                  const logsForStep = processLogs.filter((l: any) => Number(l.step_no) === Number(ps.step_no));
                  const done = logsForStep.length > 0;
                  return (
                    <div
                      key={ps.step_no}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${done ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}
                      data-testid={`badge-process-step-${ps.step_no}`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${done ? "bg-emerald-500 text-white" : "bg-gray-300 text-gray-600"}`}>
                        {done ? "✓" : ps.step_no}
                      </div>
                      {ps.name}
                    </div>
                  );
                })}
              </div>
              {processLogs.length > 0 && (
                <div className="border rounded-lg overflow-hidden mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs py-2">ขั้นตอน</TableHead>
                        <TableHead className="text-xs py-2">ผู้บันทึก</TableHead>
                        <TableHead className="text-right text-xs py-2">จำนวน</TableHead>
                        <TableHead className="text-xs py-2">หมายเหตุ</TableHead>
                        <TableHead className="text-right text-xs py-2">เวลา</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {processLogs.map((log: any, idx: number) => (
                        <TableRow key={idx} data-testid={`row-process-log-${idx}`}>
                          <TableCell className="py-2 text-sm font-medium text-cyan-700">
                            P{log.step_no}: {log.step_name}
                          </TableCell>
                          <TableCell className="py-2 text-sm text-gray-600">{log.logged_by_name || "—"}</TableCell>
                          <TableCell className="py-2 text-right tabular-nums text-sm">{log.qty_passed || 0}</TableCell>
                          <TableCell className="py-2 text-xs text-gray-400">{log.notes || "—"}</TableCell>
                          <TableCell className="py-2 text-right text-xs text-gray-400">
                            {log.logged_at ? new Date(log.logged_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {processLogs.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-3" data-testid="text-no-process-logs">
                  ยังไม่มีบันทึกขั้นตอน — พนักงานสามารถบันทึกได้ที่ Scan Station
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {editId && (moStatus === "in_progress" || moStatus === "completed") && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> ใบเบิกวัตถุดิบ
                  {materialIssues.length > 0 && (
                    <Badge className="bg-blue-100 text-blue-700 text-xs">{materialIssues.length} ใบ</Badge>
                  )}
                </CardTitle>
                {moStatus === "in_progress" && (
                  <Button
                    size="sm"
                    onClick={() => navigate(`/inventory/material-issue/form?moId=${editId}`)}
                    data-testid="button-create-material-issue"
                  >
                    <Plus className="h-4 w-4 mr-1" /> สร้างใบเบิก
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {lines.length > 0 && (
                <div className="px-4 pb-3 border-b">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">สรุปยอดเบิกเทียบ BOM</p>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="text-xs">วัตถุดิบ</TableHead>
                        <TableHead className="text-right text-xs">ต้องใช้</TableHead>
                        <TableHead className="text-right text-xs">เบิกแล้ว</TableHead>
                        <TableHead className="text-right text-xs">คงเหลือ</TableHead>
                        <TableHead className="text-center text-xs w-10">สถานะ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, idx) => {
                        const required = Number(line.requiredQty) || 0;
                        const issued = issuedSummary?.issuedMap?.[String(line.componentProductId)] || 0;
                        const diff = required - issued;
                        const isOver = issued > required;
                        const isFulfilled = issued >= required;
                        const overAmt = isOver ? issued - required : 0;
                        return (
                          <TableRow key={idx} data-testid={`row-bom-summary-${line.componentProductId}`} className={isOver ? "bg-red-50" : undefined}>
                            <TableCell className="text-sm py-2">
                              <span className="font-medium">{line.componentName}</span>
                              {line.componentCode && <span className="text-xs text-slate-400 ml-1">({line.componentCode})</span>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm py-2" data-testid={`text-bom-required-${line.componentProductId}`}>
                              {required.toLocaleString("th-TH", { maximumFractionDigits: 4 })} {line.unit}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm py-2" data-testid={`text-bom-issued-${line.componentProductId}`}>
                              <span className={issued > 0 ? (isOver ? "text-red-600 font-semibold" : "text-blue-700 font-medium") : "text-slate-400"}>
                                {issued.toLocaleString("th-TH", { maximumFractionDigits: 4 })} {line.unit}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-sm py-2" data-testid={`text-bom-remaining-${line.componentProductId}`}>
                              {isOver ? (
                                <span className="text-red-600 font-semibold">
                                  +{overAmt.toLocaleString("th-TH", { maximumFractionDigits: 4 })} {line.unit} เกิน
                                </span>
                              ) : (
                                <span className={isFulfilled ? "text-green-600" : "text-amber-600 font-medium"}>
                                  {isFulfilled ? "0" : diff.toLocaleString("th-TH", { maximumFractionDigits: 4 })} {line.unit}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center py-2" data-testid={`text-bom-status-${line.componentProductId}`}>
                              {isOver ? (
                                <Badge className="bg-red-100 text-red-700 text-xs px-1.5 py-0.5">เกิน</Badge>
                              ) : isFulfilled ? (
                                <span className="text-green-600 text-base" title="เบิกครบแล้ว">✓</span>
                              ) : (
                                <span className="text-amber-500 text-base" title="ยังเบิกไม่ครบ">⚠</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {materialIssues.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-material-issues">
                  ยังไม่มีใบเบิกวัตถุดิบสำหรับใบสั่งผลิตนี้
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>เลขที่ใบเบิก</TableHead>
                      <TableHead className="text-center">สถานะ</TableHead>
                      <TableHead className="text-center">รายการ</TableHead>
                      <TableHead>ผู้เบิก</TableHead>
                      <TableHead className="text-right">วันที่</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materialIssues.map((mi: any) => (
                      <TableRow key={mi.id} data-testid={`row-material-issue-${mi.id}`}>
                        <TableCell className="font-mono text-sm" data-testid={`text-mi-no-${mi.id}`}>{mi.issue_no}</TableCell>
                        <TableCell className="text-center">
                          {mi.status === "confirmed" ? (
                            <Badge className="bg-green-100 text-green-700 text-xs" data-testid={`badge-mi-status-${mi.id}`}>ยืนยันแล้ว</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs" data-testid={`badge-mi-status-${mi.id}`}>ร่าง</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm" data-testid={`text-mi-items-${mi.id}`}>{mi.item_count} รายการ</TableCell>
                        <TableCell className="text-sm" data-testid={`text-mi-issued-by-${mi.id}`}>{mi.issued_by_name || "—"}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground" data-testid={`text-mi-date-${mi.id}`}>
                          {mi.issued_at ? new Date(mi.issued_at).toLocaleDateString("th-TH") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/inventory/material-issue/form/${mi.id}`)}
                            data-testid={`button-view-mi-${mi.id}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        {!isReadOnly && (
          <div className="flex items-center justify-end gap-2 pb-4">
            <Button variant="outline" onClick={() => navigate(basePath)} data-testid="button-cancel-bottom">ย้อนกลับ</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!productId || saveMutation.isPending} data-testid="button-save-mo-bottom">
              <Save className="h-4 w-4 mr-1" /> บันทึก
            </Button>
          </div>
        )}
      </div>

      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" /> ยืนยันผลิตเสร็จ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
              ระบบจะ:
              <ul className="list-disc ml-4 mt-1 space-y-0.5 text-xs">
                <li>ตัดวัตถุดิบจากคลัง (ล็อตใกล้หมดก่อน — FEFO)</li>
                <li>สร้างล็อตใหม่สำหรับสินค้าสำเร็จรูป</li>
                <li>เพิ่มสต็อกสินค้าสำเร็จรูปในคลัง</li>
              </ul>
            </div>
            <div>
              <Label className="text-xs">จำนวนที่ผลิตได้จริง</Label>
              <Input type="number" value={completedQty} onChange={e => setCompletedQty(e.target.value)} data-testid="input-completed-qty" />
            </div>
            <div>
              <Label className="text-xs">เลขล็อตสินค้าสำเร็จรูป</Label>
              <Input value={completeLot} onChange={e => setCompleteLot(e.target.value)} placeholder="สร้างอัตโนมัติจากเลขที่ใบสั่งผลิต" data-testid="input-complete-lot" />
            </div>
            <div>
              <Label className="text-xs">วันผลิต</Label>
              <DatePicker value={completeMfgDate} onChange={setCompleteMfgDate} dateEra={dateEra} dateFormat={dateFmt} data-testid="input-complete-mfg" />
            </div>
            <div>
              <Label className="text-xs">อายุการใช้งาน (วัน)</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  value={completeShelfLife}
                  onChange={e => {
                    setCompleteShelfLife(e.target.value);
                    if (!e.target.value) setCompleteExpDate("");
                  }}
                  placeholder="เช่น 365"
                  className="pr-10"
                  data-testid="input-complete-shelf-life"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">วัน</span>
              </div>
            </div>
            <div>
              <Label className="text-xs">
                วันหมดอายุ
                {completeShelfLife && (
                  <span className="ml-1 text-cyan-600 font-normal">(คำนวณอัตโนมัติ)</span>
                )}
              </Label>
              {completeShelfLife ? (
                <Input
                  value={completeExpDate ? formatDate(completeExpDate, dateEra, dateFmt) : ""}
                  disabled
                  className="bg-cyan-50 border-cyan-200 text-cyan-800"
                  data-testid="input-complete-exp"
                />
              ) : (
                <DatePicker value={completeExpDate} onChange={setCompleteExpDate} dateEra={dateEra} dateFormat={dateFmt} data-testid="input-complete-exp" />
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>ยกเลิก</Button>
              <Button
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
                style={{ backgroundColor: "#05b187" }}
                data-testid="button-confirm-complete"
              >
                {completeMutation.isPending ? "กำลังดำเนินการ..." : "ยืนยันผลิตเสร็จ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={qrPrintOpen} onOpenChange={setQrPrintOpen}>
        <DialogContent className="max-w-sm z-[200]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-cyan-600" /> QR Code ใบสั่งผลิต
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white border-2 border-gray-200 rounded-xl p-4" id="mo-qr-container">
              {moData?.orderNo && (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(moData.orderNo)}`}
                  alt={`QR ${moData.orderNo}`}
                  className="w-48 h-48"
                />
              )}
              <p className="text-center font-mono font-bold mt-2 text-sm">{moData?.orderNo}</p>
              <p className="text-center text-xs text-gray-500">{moData?.productName || ""}</p>
            </div>
            <p className="text-xs text-gray-400 text-center">นำ QR นี้ไปใช้ที่ Scan Station เพื่อบันทึกขั้นตอนการผลิต</p>
            <Button
              className="w-full"
              onClick={() => window.print()}
              data-testid="button-print-qr"
            >
              <Printer className="h-4 w-4 mr-2" /> พิมพ์ QR
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </LayoutComponent>
  );
}
