import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Package, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { Product } from "@shared/schema";
import { formatDate } from "@/lib/format";

import { useDateSettings } from "@/hooks/use-date-settings";
export default function BomManagement(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }>; basePath?: string } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const basePath = props.basePath || "/inventory/bom";
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: boms = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/bom", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/bom?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/products?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/inventory/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId: selectedCompanyId, type: "bom" }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      const r = data.result;
      toast({ title: "คำนวณสต็อกย้อนหลังสำเร็จ", description: `ลบ ${r.deleted} รายการเก่า, สร้าง ${r.created} รายการใหม่`, variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/bom/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bom"] });
      toast({ title: "ลบ BOM สำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const { dateEra, dateFmt } = useDateSettings();
  const { data: docSettings } = useQuery<any>({
    queryKey: ["/api/document-settings", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      const res = await fetch(`/api/document-settings?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });
  const productName = (id: number) => products.find(p => p.id === id)?.name || "-";

  return (
    <LayoutComponent>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">สูตรการผลิต (BOM)</h1>
            <p className="text-sm text-gray-500 mt-1">จัดการสูตรการผลิตและวัตถุดิบ</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              data-testid="button-recalc-bom"
              onClick={() => { if (confirm("คำนวณสต็อกวัตถุดิบย้อนหลังจาก BOM ทั้งหมด?")) recalcMutation.mutate(); }}
              disabled={recalcMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
              {recalcMutation.isPending ? "กำลังคำนวณ..." : "คำนวณสต็อกย้อนหลัง"}
            </Button>
            <Button data-testid="button-create-bom" onClick={() => navigate(`${basePath}/new`)}>
              <Package className="h-4 w-4 mr-2" /> สร้าง BOM
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <span className="font-semibold">รายการ BOM ({boms.length})</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">กำลังโหลด...</div>
            ) : boms.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>ยังไม่มีสูตรการผลิต</p>
              </div>
            ) : (
              <Table data-testid="table-bom-list">
                <TableHeader>
                  <TableRow>
                    <TableHead>สินค้า</TableHead>
                    <TableHead>ชื่อ BOM</TableHead>
                    <TableHead>เวอร์ชัน</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead className="text-right">จำนวนผลผลิต</TableHead>
                    <TableHead>วันที่สร้าง</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boms.map((bom: any) => (
                    <TableRow key={bom.id} data-testid={`row-bom-${bom.id}`}>
                      <TableCell className="font-medium">{productName(bom.productId)}</TableCell>
                      <TableCell>{bom.name}</TableCell>
                      <TableCell>{bom.revisionNo}</TableCell>
                      <TableCell>
                        <Badge
                          data-testid={`badge-status-${bom.id}`}
                          className={bom.active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-gray-100 text-gray-600 hover:bg-gray-100"}
                        >
                          {bom.active ? "ใช้งาน" : "ฉบับร่าง"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{Number(bom.yieldQty).toFixed(2)} {bom.unit}</TableCell>
                      <TableCell>{formatDate(bom.createdAt, dateEra, dateFmt)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" data-testid={`button-edit-bom-${bom.id}`} onClick={() => navigate(`${basePath}/edit/${bom.id}`)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" data-testid={`button-delete-bom-${bom.id}`} onClick={() => { if (confirm("ยืนยันลบ BOM นี้?")) deleteMutation.mutate(bom.id); }}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </LayoutComponent>
  );
}