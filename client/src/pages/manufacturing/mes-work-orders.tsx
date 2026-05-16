import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import ManufacturingLayout from "@/components/manufacturing-layout";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Factory, Play, Eye, QrCode, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_MAP: Record<string, { label: string; cls: string; icon: any }> = {
  draft: { label: "แบบร่าง", cls: "bg-slate-100 text-slate-600", icon: Clock },
  in_progress: { label: "กำลังผลิต", cls: "bg-blue-100 text-blue-700", icon: Factory },
  completed: { label: "เสร็จสิ้น", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  cancelled: { label: "ยกเลิก", cls: "bg-red-100 text-red-600", icon: AlertCircle },
};

export default function MesWorkOrders() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ productName: "", model: "", quantity: "1", notes: "" });

  const { data: workOrders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/mes/work-orders", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/mes/work-orders?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      return r.json();
    },
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/mes/work-orders", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(data) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mes/work-orders", companyId] });
      setShowCreate(false);
      setForm({ productName: "", model: "", quantity: "1", notes: "" });
      toast({ title: "สร้างใบสั่งผลิตสำเร็จ" });
    },
    onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  const startMutation = useMutation({
    mutationFn: async (woId: number) => {
      const r = await fetch(`/api/mes/work-orders/${woId}/start`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: "{}" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/mes/work-orders", companyId] });
      toast({ title: "เริ่มการผลิตแล้ว — สร้าง QR Code สำหรับทุกหน่วยแล้ว" });
    },
    onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  return (
    <ManufacturingLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">ใบสั่งผลิต (MES)</h1>
            <p className="text-sm text-slate-500 mt-1">ติดตามการผลิตรายหน่วย พร้อม QR Code tracking</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/manufacturing/mes/scan")} data-testid="btn-scan-station">
              <QrCode className="w-4 h-4 mr-2" /> สถานียิง QR
            </Button>
            <Button onClick={() => setShowCreate(true)} data-testid="btn-create-wo">
              <Plus className="w-4 h-4 mr-2" /> สร้างใบสั่งผลิต
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>
        ) : workOrders.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Factory className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg">ยังไม่มีใบสั่งผลิต</p>
            <p className="text-sm mt-1">กด "สร้างใบสั่งผลิต" เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>เลขที่</TableHead>
                  <TableHead>ผลิตภัณฑ์</TableHead>
                  <TableHead>รุ่น</TableHead>
                  <TableHead className="text-center">จำนวน</TableHead>
                  <TableHead className="text-center">ความคืบหน้า</TableHead>
                  <TableHead className="text-center">สถานะ</TableHead>
                  <TableHead className="text-center">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((wo: any) => {
                  const s = STATUS_MAP[wo.status] || STATUS_MAP.draft;
                  const SIcon = s.icon;
                  const pct = wo.unitCount > 0 ? Math.round((wo.completedCount / wo.unitCount) * 100) : 0;
                  return (
                    <TableRow key={wo.id} className="hover:bg-slate-50">
                      <TableCell className="font-mono font-medium text-cyan-700" data-testid={`text-wo-no-${wo.id}`}>{wo.woNo}</TableCell>
                      <TableCell className="font-medium">{wo.productName}</TableCell>
                      <TableCell className="text-slate-500">{wo.model || "-"}</TableCell>
                      <TableCell className="text-center">{wo.quantity} หน่วย</TableCell>
                      <TableCell className="text-center">
                        {wo.unitCount > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-2">
                              <div className="bg-cyan-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 w-12">{wo.completedCount}/{wo.unitCount}</span>
                          </div>
                        ) : <span className="text-xs text-slate-400">-</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${s.cls} border-0 text-xs gap-1`}>
                          <SIcon className="w-3 h-3" /> {s.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {wo.status === "draft" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs text-blue-600 border-blue-200" onClick={() => startMutation.mutate(wo.id)} disabled={startMutation.isPending} data-testid={`btn-start-${wo.id}`}>
                              <Play className="w-3 h-3 mr-1" /> เริ่มผลิต
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => navigate(`/manufacturing/mes/work-orders/${wo.id}`)} data-testid={`btn-view-${wo.id}`}>
                            <Eye className="w-3 h-3 mr-1" /> ดูรายละเอียด
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>สร้างใบสั่งผลิตใหม่</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ชื่อผลิตภัณฑ์ *</Label>
              <Input value={form.productName} onChange={e => setForm(f => ({ ...f, productName: e.target.value }))} placeholder="เช่น แบตเตอรี่ลิเธียม 48V" data-testid="input-product-name" />
            </div>
            <div>
              <Label>รุ่น / สเปค</Label>
              <Input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="เช่น 48V 75Ah NMC" data-testid="input-model" />
            </div>
            <div>
              <Label>จำนวนที่ผลิต (หน่วย) *</Label>
              <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} data-testid="input-quantity" />
            </div>
            <div>
              <Label>หมายเหตุ</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} data-testid="input-notes" />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>ยกเลิก</Button>
              <Button className="flex-1" disabled={!form.productName || !form.quantity || createMutation.isPending} onClick={() => createMutation.mutate({ companyId, ...form, quantity: Number(form.quantity) })} data-testid="btn-confirm-create">
                {createMutation.isPending ? "กำลังสร้าง..." : "สร้างใบสั่งผลิต"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ManufacturingLayout>
  );
}
