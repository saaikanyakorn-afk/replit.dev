import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import SettingsTabs from "@/components/settings-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { ArrowLeft, Warehouse, PackagePlus, PackageMinus, Info, RefreshCw, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";

interface InventoryTriggers {
  gr_approve: boolean;
  purchase_invoice_stock: boolean;
  invoice_deduct: boolean;
  credit_note_return: boolean;
  pos_sale_deduct: boolean;
  pos_void_restore: boolean;
  ecommerce_shipping_out: boolean;
  manufacturing_complete: boolean;
  goods_requisition_deduct: boolean;
}

const TRIGGER_GROUPS = [
  {
    label: "รับสินค้าเข้าสต๊อก (+)",
    color: "bg-green-50 border-green-200",
    badgeColor: "bg-green-100 text-green-700",
    icon: PackagePlus,
    iconColor: "text-green-600",
    items: [
      { key: "gr_approve", label: "ใบรับสินค้า (GR)", desc: "อนุมัติใบรับสินค้า → เพิ่มสต๊อกคลัง" },
      { key: "purchase_invoice_stock", label: "ใบสั่งซื้อ / ใบกำกับซื้อ", desc: "บันทึกใบซื้อ → เพิ่มสต๊อก (และลบใบ → หักกลับ)" },
      { key: "credit_note_return", label: "ใบลดหนี้ (รับสินค้าคืน)", desc: "ใบลดหนี้ที่เปิดรับสินค้าคืน → เพิ่มสต๊อกคลัง" },
      { key: "pos_void_restore", label: "POS — Void บิล", desc: "ยกเลิกบิล POS → คืนสต๊อกสินค้ากลับคลัง" },
    ],
  },
  {
    label: "ตัดสินค้าออกจากสต๊อก (−)",
    color: "bg-orange-50 border-orange-200",
    badgeColor: "bg-orange-100 text-orange-700",
    icon: PackageMinus,
    iconColor: "text-orange-600",
    items: [
      { key: "invoice_deduct", label: "ใบแจ้งหนี้ / ใบกำกับภาษี", desc: "สร้าง/อนุมัติเอกสาร → หักสต๊อก (และลบเอกสาร → คืนกลับ)" },
      { key: "pos_sale_deduct", label: "POS — บันทึกการขาย", desc: "บันทึกบิลขาย POS → หักสต๊อกออกจากคลัง" },
      { key: "ecommerce_shipping_out", label: "Ecommerce — จัดส่งสินค้า", desc: "ออเดอร์เปลี่ยนสถานะ 'กำลังจัดส่ง' → หักสต๊อก" },
      { key: "goods_requisition_deduct", label: "ใบเบิกสินค้า (Requisition)", desc: "อนุมัติใบเบิก → หักสต๊อกออกจากคลัง" },
    ],
  },
  {
    label: "ทั้งรับและตัดสต๊อก",
    color: "bg-blue-50 border-blue-200",
    badgeColor: "bg-blue-100 text-blue-700",
    icon: Warehouse,
    iconColor: "text-blue-600",
    items: [
      { key: "manufacturing_complete", label: "ใบสั่งผลิต — ผลิตเสร็จ", desc: "ผลิตเสร็จ → หักวัตถุดิบ (คลังต้นทาง) + เพิ่มสินค้าสำเร็จรูป (คลังปลายทาง)" },
    ],
  },
];

export default function InventoryTriggersPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const [confirmRecalc, setConfirmRecalc] = useState(false);

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/inventory/recalculate-warehouse-stock", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      });
      if (!r.ok) throw new Error("คำนวณไม่สำเร็จ");
      return r.json();
    },
    onSuccess: (data) => {
      setConfirmRecalc(false);
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "คำนวณยอดคลังใหม่สำเร็จ", description: `อัปเดต ${data.warehouseRows} คลัง, ${data.productRows} สินค้า` });
    },
    onError: (e: any) => {
      setConfirmRecalc(false);
      toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" });
    },
  });

  const { data: triggers, isLoading } = useQuery<InventoryTriggers>({
    queryKey: ["/api/settings/inventory-triggers", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/settings/inventory-triggers?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) throw new Error("โหลดการตั้งค่าไม่สำเร็จ");
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const saveMutation = useMutation({
    mutationFn: async (updated: InventoryTriggers) => {
      const r = await fetch(`/api/settings/inventory-triggers?companyId=${selectedCompanyId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      if (!r.ok) throw new Error("บันทึกไม่สำเร็จ");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/inventory-triggers", selectedCompanyId] });
      toast({ title: "บันทึกการตั้งค่าสำเร็จ" });
    },
    onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  const handleToggle = (key: keyof InventoryTriggers, value: boolean) => {
    if (!triggers) return;
    saveMutation.mutate({ ...triggers, [key]: value });
  };

  return (
    <Layout>
      <SettingsTabs />
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/settings/general")} className="p-1.5 rounded hover:bg-gray-100">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold">ทริกเกอร์สต๊อกสินค้า</h1>
            <p className="text-sm text-muted-foreground">กำหนดว่าเอกสารใดจะรับ/ตัดสต๊อกคลังสินค้าอัตโนมัติ</p>
          </div>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>การตั้งค่านี้มีผลต่อการอัพเดท <strong>warehouseStockLevels</strong> เท่านั้น ไม่กระทบบันทึกการเคลื่อนไหวสต๊อก (stockMovements) หรือการบัญชี</span>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">กำลังโหลด...</div>
        ) : (
          TRIGGER_GROUPS.map((group) => {
            const Icon = group.icon;
            return (
              <Card key={group.label} className={`border ${group.color}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className={`h-4 w-4 ${group.iconColor}`} />
                    {group.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {group.items.map((item) => {
                    const key = item.key as keyof InventoryTriggers;
                    const enabled = triggers?.[key] ?? true;
                    return (
                      <div key={item.key} className="flex items-start justify-between gap-4" data-testid={`trigger-row-${item.key}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{item.label}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${group.badgeColor} border-0`}>
                              {enabled ? "เปิด" : "ปิด"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                        </div>
                        <Switch
                          data-testid={`switch-${item.key}`}
                          checked={enabled}
                          disabled={saveMutation.isPending}
                          onCheckedChange={(v) => handleToggle(key, v)}
                        />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })
        )}

        <Card className="border border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-4 w-4 text-yellow-600" />
              คำนวณยอดคลังใหม่ทั้งหมด
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-yellow-800">
              คำนวณยอดสินค้าในแต่ละคลังใหม่ทั้งหมด จากข้อมูลการเคลื่อนไหวสต๊อกที่บันทึกจริง
              — ใช้เมื่อยอดคลังไม่ตรง เช่น ลบเอกสารแล้วยอดไม่คืน
            </p>
            <div className="flex items-start gap-2 p-2.5 rounded bg-yellow-100 border border-yellow-300 text-xs text-yellow-900">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>ระบบจะลบยอดคลังปัจจุบันแล้วคำนวณใหม่จากประวัติ — ยอดจอง (SO) จะถูก reset เป็น 0</span>
            </div>
            {!confirmRecalc ? (
              <Button
                data-testid="button-recalculate-warehouse"
                variant="outline"
                className="border-yellow-400 text-yellow-800 hover:bg-yellow-100"
                onClick={() => setConfirmRecalc(true)}
                disabled={recalcMutation.isPending}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                คำนวณยอดคลังใหม่
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-yellow-900">ยืนยันการคำนวณใหม่?</span>
                <Button
                  data-testid="button-recalculate-confirm"
                  size="sm"
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  onClick={() => recalcMutation.mutate()}
                  disabled={recalcMutation.isPending}
                >
                  {recalcMutation.isPending ? "กำลังคำนวณ..." : "ยืนยัน"}
                </Button>
                <Button
                  data-testid="button-recalculate-cancel"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmRecalc(false)}
                  disabled={recalcMutation.isPending}
                >
                  ยกเลิก
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
