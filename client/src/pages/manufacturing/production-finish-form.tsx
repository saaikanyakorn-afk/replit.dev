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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, PackageCheck, Plus, Trash2, CheckCircle } from "lucide-react";

interface Product {
  id: number;
  name: string;
  sku: string | null;
  unit: string | null;
}

interface ManufacturingOrder {
  id: number;
  order_no: string;
  status: string;
  product_id: number;
  planned_qty: string | number;
  completed_qty: string | number;
}

interface ReceiptItem {
  id?: number;
  productId: number;
  productName: string;
  lotNumber: string;
  mfgDate: string;
  expDate: string;
  quantity: string;
  unit: string;
  unitCost: string;
}

interface ReceiptDetail {
  id: number;
  receipt_no: string;
  mo_id: number | null;
  received_by_user_id: number | null;
  notes: string | null;
  status: "draft" | "confirmed";
  received_at: string | null;
  items: {
    id: number;
    product_id: number;
    product_name: string;
    lot_number: string | null;
    mfg_date: string | null;
    exp_date: string | null;
    quantity: string | number;
    unit: string;
    unit_cost: string | number;
  }[];
}

const EMPTY_ITEM: ReceiptItem = { productId: 0, productName: "", lotNumber: "", mfgDate: "", expDate: "", quantity: "", unit: "ชิ้น", unitCost: "0" };

export default function ProductionFinishForm({ idProp, urlBase = "/manufacturing" }: { idProp?: number; urlBase?: string }) {
  const params = useParams<{ id?: string }>();
  const id = idProp ?? (params?.id ? Number(params.id) : undefined);
  const isEdit = !!id;

  const [, navigate] = useLocation();
  const { company } = useCompany();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [moId, setMoId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReceiptItem[]>([{ ...EMPTY_ITEM }]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: receipt } = useQuery<ReceiptDetail>({
    queryKey: ["/api/production-receipts", id],
    queryFn: async () => {
      const r = await fetch(`/api/production-receipts/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("โหลดใบรับไม่สำเร็จ");
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
    if (!receipt) return;
    setMoId(receipt.mo_id ? String(receipt.mo_id) : "");
    setNotes(receipt.notes ?? "");
    setItems(receipt.items.length > 0 ? receipt.items.map(i => ({
      id: i.id,
      productId: i.product_id,
      productName: i.product_name,
      lotNumber: i.lot_number ?? "",
      mfgDate: i.mfg_date ? i.mfg_date.split("T")[0] : "",
      expDate: i.exp_date ? i.exp_date.split("T")[0] : "",
      quantity: String(i.quantity),
      unit: i.unit,
      unitCost: String(i.unit_cost ?? "0"),
    })) : [{ ...EMPTY_ITEM }]);
  }, [receipt]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!company?.id) throw new Error("ไม่พบข้อมูลบริษัท");
      const validItems = items.filter(i => i.productId > 0 && Number(i.quantity) > 0);
      if (validItems.length === 0) throw new Error("ต้องมีรายการสินค้าอย่างน้อย 1 รายการ");
      const body = {
        companyId: company.id,
        moId: moId ? Number(moId) : null,
        receivedByUserId: (user as any)?.id ?? null,
        notes: notes || null,
        items: validItems.map(i => ({
          productId: i.productId,
          productName: i.productName,
          lotNumber: i.lotNumber || null,
          mfgDate: i.mfgDate || null,
          expDate: i.expDate || null,
          quantity: Number(i.quantity),
          unit: i.unit,
          unitCost: Number(i.unitCost || 0),
        })),
      };
      const r = await fetch("/api/production-receipts", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "บันทึกไม่สำเร็จ");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: `บันทึกใบรับ ${data.receipt_no ?? ""} สำเร็จ` });
      queryClient.invalidateQueries({ queryKey: ["/api/production-receipts"] });
      navigate(`${urlBase}/production-finish/form/${data.id}`);
    },
    onError: (e: Error) => toast({ title: "ข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("ไม่พบ id ของใบรับ");
      const r = await fetch(`/api/production-receipts/${id}/confirm`, { method: "POST", credentials: "include" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "ยืนยันไม่สำเร็จ");
      return data;
    },
    onSuccess: (data) => {
      toast({ title: `ยืนยันการรับสำเร็จรูปสำเร็จ — ${data.receiptNo}`, description: "สต๊อก FG ถูกอัปเดตแล้ว" });
      queryClient.invalidateQueries({ queryKey: ["/api/production-receipts"] });
      setConfirmOpen(false);
    },
    onError: (e: Error) => {
      toast({ title: "ข้อผิดพลาด", description: e.message, variant: "destructive" });
      setConfirmOpen(false);
    },
  });

  const updateItem = (idx: number, field: keyof ReceiptItem, val: string | number) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      if (field === "productId") {
        const pid = Number(val);
        const prod = products.find(p => p.id === pid);
        return { ...item, productId: pid, productName: prod?.name ?? "", unit: prod?.unit ?? item.unit };
      }
      return { ...item, [field]: val };
    }));
  };

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const isConfirmed = receipt?.status === "confirmed";
  const totalItems = items.filter(i => i.productId > 0 && Number(i.quantity) > 0).length;

  return (
    <div className="p-6 max-w-4xl mx-auto" data-testid="production-finish-form">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(`${urlBase}/production-finish`)} data-testid="btn-back">
          <ArrowLeft className="w-4 h-4 mr-1" />
          กลับ
        </Button>
        <div className="flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-cyan-600" />
          <div>
            <h1 className="text-xl font-bold" data-testid="text-form-title">
              {isEdit ? `ใบรับสินค้าสำเร็จรูป — ${receipt?.receipt_no ?? ""}` : "สร้างใบรับสินค้าสำเร็จรูป"}
            </h1>
            <p className="text-sm text-gray-500">รับสินค้าจาก WIP เข้าคลัง FG</p>
          </div>
        </div>
        {receipt?.status && (
          <Badge className={receipt.status === "confirmed" ? "bg-green-600 text-white ml-auto" : "ml-auto"} variant={receipt.status === "confirmed" ? "default" : "outline"} data-testid="badge-status">
            {receipt.status === "confirmed" ? "ยืนยันแล้ว" : "ร่าง"}
          </Badge>
        )}
      </div>

      {/* Header */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ข้อมูลใบรับ</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm">ใบสั่งผลิต (MO) — ไม่บังคับ</Label>
            <Select
              value={moId || "none"}
              onValueChange={(v) => setMoId(v === "none" ? "" : v)}
              disabled={isConfirmed}
            >
              <SelectTrigger data-testid="select-mo">
                <SelectValue placeholder="เลือก MO (ถ้ามี)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">ไม่ระบุ MO</SelectItem>
                {manufacturingOrders.map(mo => (
                  <SelectItem key={mo.id} value={String(mo.id)} data-testid={`option-mo-${mo.id}`}>
                    {mo.order_no} — สถานะ: {mo.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm">หมายเหตุ</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="หมายเหตุ (ถ้ามี)"
              disabled={isConfirmed}
              rows={2}
              data-testid="input-notes"
            />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">รายการสินค้าสำเร็จรูป</CardTitle>
            {!isConfirmed && (
              <Button variant="outline" size="sm" onClick={addItem} data-testid="btn-add-item">
                <Plus className="w-4 h-4 mr-1" />
                เพิ่มรายการ
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table data-testid="table-items">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">สินค้า</TableHead>
                  <TableHead className="min-w-[120px]">Lot/Batch</TableHead>
                  <TableHead className="min-w-[110px]">วันผลิต</TableHead>
                  <TableHead className="min-w-[110px]">วันหมดอายุ</TableHead>
                  <TableHead className="min-w-[80px]">จำนวน</TableHead>
                  <TableHead className="min-w-[80px]">หน่วย</TableHead>
                  <TableHead className="min-w-[100px]">ต้นทุน/หน่วย</TableHead>
                  {!isConfirmed && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx} data-testid={`row-item-${idx}`}>
                    <TableCell>
                      {isConfirmed ? (
                        <span data-testid={`text-product-${idx}`}>{item.productName}</span>
                      ) : (
                        <Select
                          value={item.productId > 0 ? String(item.productId) : "none"}
                          onValueChange={(v) => updateItem(idx, "productId", v === "none" ? 0 : Number(v))}
                        >
                          <SelectTrigger data-testid={`select-product-${idx}`} className="min-w-0">
                            <SelectValue placeholder="เลือกสินค้า" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">เลือกสินค้า</SelectItem>
                            {products.map(p => (
                              <SelectItem key={p.id} value={String(p.id)}>{p.name}{p.sku ? ` (${p.sku})` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.lotNumber}
                        onChange={(e) => updateItem(idx, "lotNumber", e.target.value)}
                        placeholder="LOT-001"
                        disabled={isConfirmed}
                        data-testid={`input-lot-${idx}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={item.mfgDate}
                        onChange={(e) => updateItem(idx, "mfgDate", e.target.value)}
                        disabled={isConfirmed}
                        data-testid={`input-mfg-date-${idx}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={item.expDate}
                        onChange={(e) => updateItem(idx, "expDate", e.target.value)}
                        disabled={isConfirmed}
                        data-testid={`input-exp-date-${idx}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0.0001"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                        placeholder="0"
                        disabled={isConfirmed}
                        data-testid={`input-qty-${idx}`}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={item.unit}
                        onChange={(e) => updateItem(idx, "unit", e.target.value)}
                        placeholder="ชิ้น"
                        disabled={isConfirmed}
                        data-testid={`input-unit-${idx}`}
                        className="w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.unitCost}
                        onChange={(e) => updateItem(idx, "unitCost", e.target.value)}
                        placeholder="0.00"
                        disabled={isConfirmed}
                        data-testid={`input-unit-cost-${idx}`}
                        className="w-24"
                      />
                    </TableCell>
                    {!isConfirmed && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => removeItem(idx)}
                          disabled={items.length === 1}
                          data-testid={`btn-remove-item-${idx}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {!isConfirmed && (
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => navigate(`${urlBase}/production-finish`)} data-testid="btn-cancel">ยกเลิก</Button>
          <div className="flex gap-2">
            {!isEdit && (
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || totalItems === 0}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
                data-testid="btn-save-draft"
              >
                {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึกร่าง"}
              </Button>
            )}
            {isEdit && receipt?.status === "draft" && (
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={confirmMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="btn-confirm"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                ยืนยันการรับสินค้า
              </Button>
            )}
          </div>
        </div>
      )}

      {isConfirmed && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm" data-testid="text-confirmed-info">
          <CheckCircle className="w-4 h-4 inline mr-1" />
          ใบรับนี้ยืนยันแล้ว — สต๊อก FG ถูกอัปเดตและสร้าง Lot สำหรับสินค้าสำเร็จรูปเรียบร้อย
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการรับสินค้าสำเร็จรูป</AlertDialogTitle>
            <AlertDialogDescription>
              เมื่อยืนยันแล้ว ระบบจะ:
              <br />• สร้าง Lot สำหรับสินค้าสำเร็จรูปในคลัง FG
              <br />• อัปเดตยอดสต๊อกสินค้าสำเร็จรูป
              <br />• บันทึก Stock Movement ประเภท production_finish
              <br />• อัปเดต completed_qty ใน MO (ถ้าระบุ)
              <br /><br />ไม่สามารถแก้ไขหรือลบได้หลังจากยืนยัน
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-cancel-confirm">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => confirmMutation.mutate()}
              data-testid="btn-do-confirm"
            >
              ยืนยัน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
