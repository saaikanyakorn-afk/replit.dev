import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { ArrowLeft, ShieldAlert, CheckCircle, RefreshCw } from "lucide-react";

interface Product {
  id: number;
  name: string;
  sku: string | null;
}

interface ManufacturingOrder {
  id: number;
  order_no: string;
  status: string;
}

interface NcrDetail {
  id: number;
  ncr_no: string;
  mo_id: number | null;
  product_id: number | null;
  product_name: string;
  defect_qty: string | number;
  defect_type: string;
  description: string | null;
  corrective_action: string | null;
  status: "open" | "in_progress" | "closed";
  created_at: string | null;
  closed_at: string | null;
}

const DEFECT_TYPES = [
  { value: "dimension", label: "ขนาด/มิติ (Dimension)" },
  { value: "surface", label: "ผิวภายนอก (Surface)" },
  { value: "function", label: "การทำงาน (Function)" },
  { value: "material", label: "วัตถุดิบ (Material)" },
  { value: "other", label: "อื่นๆ (Other)" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "เปิด (Open)" },
  { value: "in_progress", label: "กำลังแก้ไข (In Progress)" },
  { value: "closed", label: "ปิด (Closed)" },
];

function statusBadge(status: string) {
  if (status === "closed") return <Badge className="bg-gray-500 text-white">ปิดแล้ว</Badge>;
  if (status === "in_progress") return <Badge className="bg-amber-500 text-white">กำลังแก้ไข</Badge>;
  return <Badge className="bg-red-100 text-red-700 border border-red-300">เปิด</Badge>;
}

export default function NcrForm({ idProp, urlBase = "/manufacturing" }: { idProp?: number; urlBase?: string }) {
  const params = useParams<{ id?: string }>();
  const id = idProp ?? (params?.id ? Number(params.id) : undefined);
  const isEdit = !!id;

  const [, navigate] = useLocation();
  const { company } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [moId, setMoId] = useState<string>("");
  const [productId, setProductId] = useState<string>("");
  const [productName, setProductName] = useState("");
  const [defectQty, setDefectQty] = useState("");
  const [defectType, setDefectType] = useState("other");
  const [description, setDescription] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [status, setStatus] = useState("open");

  const { data: ncr } = useQuery<NcrDetail>({
    queryKey: ["/api/ncr-reports", id],
    queryFn: async () => {
      const r = await fetch(`/api/ncr-reports/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("โหลด NCR ไม่สำเร็จ");
      return r.json();
    },
    enabled: isEdit,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/products?companyId=${company.id}&limit=500`, { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : (data.products ?? []);
    },
    enabled: !!company?.id,
  });

  const { data: manufacturingOrders = [] } = useQuery<ManufacturingOrder[]>({
    queryKey: ["/api/manufacturing-orders", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/manufacturing-orders?companyId=${company.id}`, { credentials: "include" });
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : (data.orders ?? data.data ?? []);
    },
    enabled: !!company?.id,
  });

  useEffect(() => {
    if (!ncr) return;
    setMoId(ncr.mo_id ? String(ncr.mo_id) : "");
    setProductId(ncr.product_id ? String(ncr.product_id) : "");
    setProductName(ncr.product_name ?? "");
    setDefectQty(String(ncr.defect_qty ?? ""));
    setDefectType(ncr.defect_type ?? "other");
    setDescription(ncr.description ?? "");
    setCorrectiveAction(ncr.corrective_action ?? "");
    setStatus(ncr.status ?? "open");
  }, [ncr]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error("ไม่พบข้อมูลบริษัท");
      if (!productName.trim()) throw new Error("ระบุชื่อสินค้าที่พบของเสีย");
      if (!defectQty || Number(defectQty) <= 0) throw new Error("จำนวนของเสียต้องมากกว่า 0");
      const body = {
        companyId: company.id,
        moId: moId ? Number(moId) : null,
        productId: productId ? Number(productId) : null,
        productName: productName.trim(),
        defectQty: Number(defectQty),
        defectType,
        description: description || null,
        correctiveAction: correctiveAction || null,
      };
      const r = await fetch("/api/ncr-reports", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "บันทึกไม่สำเร็จ");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: `สร้าง NCR ${data.ncr_no ?? ""} สำเร็จ` });
      queryClient.invalidateQueries({ queryKey: ["/api/ncr-reports"] });
      navigate(`${urlBase}/ncr/form/${data.id}`);
    },
    onError: (e: Error) => toast({ title: "ข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("ไม่พบ id ของ NCR");
      const body = { status, description, correctiveAction };
      const r = await fetch(`/api/ncr-reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "อัปเดตไม่สำเร็จ");
      return data;
    },
    onSuccess: () => {
      toast({ title: "อัปเดต NCR สำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/ncr-reports"] });
    },
    onError: (e: Error) => toast({ title: "ข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  const isClosed = ncr?.status === "closed";
  const formatDate = (d: string | null) => {
    if (!d) return "-";
    try { return new Date(d).toLocaleDateString("th-TH", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return d; }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto" data-testid="ncr-form">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(`${urlBase}/ncr`)} data-testid="btn-back">
          <ArrowLeft className="w-4 h-4 mr-1" />
          กลับ
        </Button>
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          <div>
            <h1 className="text-xl font-bold" data-testid="text-form-title">
              {isEdit ? `NCR — ${ncr?.ncr_no ?? ""}` : "สร้าง NCR ใหม่"}
            </h1>
            <p className="text-sm text-gray-500">บันทึกของเสีย/ไม่สอดคล้อง Non-Conformance Report</p>
          </div>
        </div>
        {ncr?.status && <div className="ml-auto">{statusBadge(ncr.status)}</div>}
      </div>

      {/* Main info */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ข้อมูลของเสีย</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">ใบสั่งผลิต (MO) — ไม่บังคับ</Label>
              <Select
                value={moId || "none"}
                onValueChange={(v) => setMoId(v === "none" ? "" : v)}
                disabled={isEdit}
              >
                <SelectTrigger data-testid="select-mo">
                  <SelectValue placeholder="เลือก MO (ถ้ามี)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ไม่ระบุ MO</SelectItem>
                  {manufacturingOrders.map(mo => (
                    <SelectItem key={mo.id} value={String(mo.id)}>{mo.order_no}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">สินค้าที่พบของเสีย <span className="text-red-500">*</span></Label>
              {!isEdit ? (
                <Select
                  value={productId || "manual"}
                  onValueChange={(v) => {
                    if (v === "manual") { setProductId(""); return; }
                    const p = products.find(p => p.id === Number(v));
                    setProductId(v);
                    if (p) setProductName(p.name);
                  }}
                >
                  <SelectTrigger data-testid="select-product">
                    <SelectValue placeholder="เลือกสินค้า" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">พิมพ์ชื่อเอง</SelectItem>
                    {products.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={productName} disabled data-testid="input-product-name-display" />
              )}
            </div>
          </div>

          {!isEdit && !productId && (
            <div>
              <Label className="text-sm">ชื่อสินค้า (พิมพ์เอง) <span className="text-red-500">*</span></Label>
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="ชื่อสินค้า/ชิ้นส่วนที่พบของเสีย"
                data-testid="input-product-name"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">จำนวนของเสีย <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={defectQty}
                onChange={(e) => setDefectQty(e.target.value)}
                placeholder="0"
                disabled={isEdit}
                data-testid="input-defect-qty"
              />
            </div>
            <div>
              <Label className="text-sm">ประเภทของเสีย <span className="text-red-500">*</span></Label>
              <Select value={defectType} onValueChange={setDefectType} disabled={isEdit}>
                <SelectTrigger data-testid="select-defect-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEFECT_TYPES.map(dt => (
                    <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-sm">รายละเอียดของเสีย</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="อธิบายลักษณะของเสียที่พบ..."
              rows={3}
              data-testid="input-description"
            />
          </div>
        </CardContent>
      </Card>

      {/* Corrective Action + Status (edit mode) */}
      {isEdit && (
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">การแก้ไข & สถานะ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">สถานะ</Label>
              <Select value={status} onValueChange={setStatus} disabled={isClosed}>
                <SelectTrigger data-testid="select-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">วิธีการแก้ไข (Corrective Action)</Label>
              <Textarea
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                placeholder="บันทึกวิธีการแก้ไขและป้องกัน..."
                rows={3}
                disabled={isClosed}
                data-testid="input-corrective-action"
              />
            </div>
            {ncr?.closed_at && (
              <div className="text-sm text-gray-500" data-testid="text-closed-at">
                <CheckCircle className="w-4 h-4 inline mr-1 text-gray-400" />
                ปิดเมื่อ: {formatDate(ncr.closed_at)}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => navigate(`${urlBase}/ncr`)} data-testid="btn-cancel">ยกเลิก</Button>
        {!isEdit && (
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="bg-red-600 hover:bg-red-700 text-white"
            data-testid="btn-save"
          >
            {createMutation.isPending ? "กำลังบันทึก..." : "บันทึก NCR"}
          </Button>
        )}
        {isEdit && !isClosed && (
          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="bg-amber-600 hover:bg-amber-700 text-white"
            data-testid="btn-update"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? "กำลังอัปเดต..." : "อัปเดตสถานะ"}
          </Button>
        )}
      </div>

      {isClosed && (
        <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm" data-testid="text-closed-info">
          <CheckCircle className="w-4 h-4 inline mr-1" />
          NCR นี้ปิดแล้ว — ไม่สามารถแก้ไขได้
        </div>
      )}
    </div>
  );
}
