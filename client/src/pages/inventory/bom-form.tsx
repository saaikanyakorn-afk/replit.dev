import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Plus, X, Package } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useParams } from "wouter";
import type { Product } from "@shared/schema";

const UNITS = ["ชิ้น", "กล่อง", "ถุง", "แพ็ค", "ขวด", "กก.", "ลิตร", "เมตร", "ชุด"];
type BomLine = { componentProductId: number | ""; quantity: string; unit: string; wastePercent: string };
type BomForm = { productId: number | ""; name: string; version: string; yieldQty: string; unit: string; notes: string; status: string; lines: BomLine[] };
const emptyForm: BomForm = { productId: "", name: "", version: "1.0", yieldQty: "1", unit: "ชิ้น", notes: "", status: "draft", lines: [] };
const emptyLine: BomLine = { componentProductId: "", quantity: "1", unit: "ชิ้น", wastePercent: "0" };

export default function BomFormPage(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }>; basePath?: string; editIdProp?: string | null } = {}) {
  const LayoutComponent = props.Wrapper || Layout;
  const basePath = props.basePath || "/inventory/bom";
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const editingId = props.editIdProp ? Number(props.editIdProp) : (params.id ? Number(params.id) : null);

  const [form, setForm] = useState<BomForm>({ ...emptyForm });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/products?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) throw new Error(`โหลดสินค้าไม่ได้ (${r.status})`);
      return r.json();
    },
    enabled: !!selectedCompanyId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (editingId) {
      fetch(`/api/bom/${editingId}`, { credentials: "include" })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
          setForm({
            productId: data.productId || "",
            name: data.name || "",
            version: data.version || "1.0",
            yieldQty: String(data.yieldQty || "1"),
            unit: data.unit || "ชิ้น",
            notes: data.notes || "",
            status: data.status || "draft",
            lines: (data.lines || []).map((l: any) => ({
              componentProductId: l.componentProductId,
              quantity: String(l.qty || l.quantity || "1"),
              unit: l.unit || "ชิ้น",
              wastePercent: String(l.wastePercent || "0"),
            })),
          });
        })
        .catch(() => toast({ title: "ไม่สามารถโหลดข้อมูล BOM", variant: "destructive" }));
    }
  }, [editingId]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/bom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, companyId: selectedCompanyId }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bom"] });
      toast({ title: "สร้าง BOM สำเร็จ", variant: "success" as any });
      navigate(basePath);
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/bom/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bom"] });
      toast({ title: "แก้ไข BOM สำเร็จ", variant: "success" as any });
      navigate(basePath);
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!form.productId || !form.name) {
      toast({ title: "กรุณาเลือกสินค้าและกรอกชื่อ BOM", variant: "destructive" });
      return;
    }
    const payload = {
      productId: Number(form.productId),
      name: form.name,
      version: form.version,
      yieldQty: form.yieldQty,
      unit: form.unit,
      notes: form.notes,
      status: form.status,
      lines: form.lines
        .filter(l => l.componentProductId !== "")
        .map(l => ({
          componentProductId: Number(l.componentProductId),
          qty: l.quantity,
          unit: l.unit,
          wastePercent: l.wastePercent,
        })),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function addLine() {
    setForm(f => ({ ...f, lines: [...f.lines, { ...emptyLine }] }));
  }

  function removeLine(idx: number) {
    setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));
  }

  function updateLine(idx: number, field: keyof BomLine, value: any) {
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => (i === idx ? { ...l, [field]: value } : l)),
    }));
  }

  return (
    <LayoutComponent>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button data-testid="button-back" variant="ghost" size="icon" onClick={() => navigate(basePath)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Package className="h-5 w-5 text-primary" />
            <h1 data-testid="text-page-title" className="text-xl font-heading font-bold">
              {editingId ? "แก้ไข BOM" : "สร้าง BOM ใหม่"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button data-testid="button-cancel" variant="outline" onClick={() => navigate(basePath)}>ยกเลิก</Button>
            <Button data-testid="button-save" className="gap-2" onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}>
              <Save className="h-4 w-4" />
              {editingId ? "บันทึก" : "สร้าง BOM"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">ข้อมูล BOM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>สินค้า *</Label>
                <Select value={String(form.productId)} onValueChange={v => setForm(f => ({ ...f, productId: Number(v) }))}>
                  <SelectTrigger data-testid="select-product"><SelectValue placeholder="เลือกสินค้า" /></SelectTrigger>
                  <SelectContent>
                    {productsLoading
                      ? <SelectItem value="__loading__" disabled>กำลังโหลด...</SelectItem>
                      : products.filter(p => p.active !== false).map(p => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.code} - {p.name}</SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>ชื่อ BOM *</Label>
                <Input data-testid="input-bom-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ชื่อสูตรการผลิต" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>เวอร์ชัน</Label>
                <Input data-testid="input-version" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
              </div>
              <div>
                <Label>จำนวนผลผลิต</Label>
                <Input data-testid="input-yield-qty" type="number" value={form.yieldQty} onChange={e => setForm(f => ({ ...f, yieldQty: e.target.value }))} />
              </div>
              <div>
                <Label>หน่วย</Label>
                <Select value={form.unit} onValueChange={v => setForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger data-testid="select-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>สถานะ</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger data-testid="select-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">ฉบับร่าง</SelectItem>
                    <SelectItem value="active">ใช้งาน</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>หมายเหตุ</Label>
              <Textarea data-testid="input-notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">วัตถุดิบ</CardTitle>
              <Button variant="outline" size="sm" data-testid="button-add-line" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> เพิ่มวัตถุดิบ
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {form.lines.length === 0 ? (
              <div className="text-center py-8 text-gray-400 border rounded-md bg-gray-50">
                <p className="text-sm">ยังไม่มีรายการวัตถุดิบ กดเพิ่มวัตถุดิบเพื่อเริ่มต้น</p>
              </div>
            ) : (
              <Table data-testid="table-bom-lines">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">วัตถุดิบ</TableHead>
                    <TableHead>จำนวน</TableHead>
                    <TableHead>หน่วย</TableHead>
                    <TableHead>% สูญเสีย</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {form.lines.map((line, idx) => (
                    <TableRow key={idx} data-testid={`row-line-${idx}`}>
                      <TableCell>
                        <Select value={String(line.componentProductId)} onValueChange={v => updateLine(idx, "componentProductId", Number(v))}>
                          <SelectTrigger data-testid={`select-material-${idx}`}><SelectValue placeholder="เลือกวัตถุดิบ" /></SelectTrigger>
                          <SelectContent>
                            {productsLoading
                              ? <SelectItem value="__loading__" disabled>กำลังโหลด...</SelectItem>
                              : products.filter(p => p.active !== false).map(p => (
                                  <SelectItem key={p.id} value={String(p.id)}>{p.code} - {p.name}</SelectItem>
                                ))
                            }
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input data-testid={`input-qty-${idx}`} type="number" value={line.quantity} onChange={e => updateLine(idx, "quantity", e.target.value)} className="w-20" />
                      </TableCell>
                      <TableCell>
                        <Select value={line.unit} onValueChange={v => updateLine(idx, "unit", v)}>
                          <SelectTrigger data-testid={`select-line-unit-${idx}`} className="w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input data-testid={`input-waste-${idx}`} type="number" value={line.wastePercent} onChange={e => updateLine(idx, "wastePercent", e.target.value)} className="w-20" />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" data-testid={`button-remove-line-${idx}`} onClick={() => removeLine(idx)}>
                          <X className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2 pb-4">
          <Button variant="outline" onClick={() => navigate(basePath)} data-testid="button-cancel-bottom">ยกเลิก</Button>
          <Button className="gap-2" onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
            data-testid="button-save-bottom">
            <Save className="h-4 w-4" />
            {editingId ? "บันทึก" : "สร้าง BOM"}
          </Button>
        </div>
      </div>
    </LayoutComponent>
  );
}
