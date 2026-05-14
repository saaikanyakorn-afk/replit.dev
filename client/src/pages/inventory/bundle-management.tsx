import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, Pencil, RefreshCw, Upload, Plus, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";

export default function BundleManagement(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }>; basePath?: string } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const basePath = props.basePath || "/inventory";
  const { selectedCompanyId } = useCompany();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (productId: number) => {
      const r = await fetch(`/api/products/${productId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: "ลบชุดสินค้าสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const recalcMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/inventory/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId: selectedCompanyId, type: "bundle" }),
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

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/products?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const bundleProducts = products.filter(p => p.active && (p as any).productType === "bundle");

  return (
    <LayoutComponent>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">จัดการชุดสินค้า (Bundle)</h1>
            <p className="text-sm text-gray-500 mt-1">กำหนดสินค้าที่ประกอบอยู่ในชุดสินค้าแต่ละรายการ</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              data-testid="button-import-bundle"
              onClick={() => navigate("/inventory/import-export")}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              นำเข้าชุดสินค้า
            </Button>
            <Button
              data-testid="button-create-bundle"
              onClick={() => navigate(`${basePath}/list/new?type=bundle`)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              สร้างสินค้าจัดชุด
            </Button>
            <Button
              variant="outline"
              data-testid="button-recalc-bundle"
              onClick={() => { if (confirm("คำนวณสต็อกย้อนหลังสำหรับชุดสินค้าทั้งหมด?")) recalcMutation.mutate(); }}
              disabled={recalcMutation.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-1.5 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
              {recalcMutation.isPending ? "กำลังคำนวณ..." : "คำนวณสต็อกย้อนหลัง"}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <span className="font-semibold" data-testid="text-bundle-count">สินค้าจัดชุด ({bundleProducts.length})</span>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500" data-testid="text-loading">กำลังโหลด...</div>
            ) : bundleProducts.length === 0 ? (
              <div className="text-center py-12 text-gray-400" data-testid="text-empty">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>ยังไม่มีสินค้าประเภทจัดชุด</p>
                <p className="text-xs mt-1 mb-4">สร้างสินค้าประเภท "สินค้าจัดชุด" ในหน้ารายการสินค้าก่อน</p>
                <Button
                  variant="outline"
                  data-testid="button-goto-create-product"
                  onClick={() => navigate(`${basePath}/list/new?type=bundle`)}
                >
                  <Package className="h-4 w-4 mr-1.5" />
                  สร้างสินค้าจัดชุด
                </Button>
              </div>
            ) : (
              <Table data-testid="table-bundle-list">
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัส</TableHead>
                    <TableHead>ชื่อสินค้า</TableHead>
                    <TableHead>หน่วย</TableHead>
                    <TableHead className="text-right">ราคา</TableHead>
                    <TableHead className="text-right">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bundleProducts.map(product => (
                    <TableRow key={product.id} data-testid={`row-bundle-${product.id}`}>
                      <TableCell className="text-sm" data-testid={`text-code-${product.id}`}>{product.code}</TableCell>
                      <TableCell className="font-medium" data-testid={`text-name-${product.id}`}>{product.name}</TableCell>
                      <TableCell>{product.unit}</TableCell>
                      <TableCell className="text-right">{Number(product.price).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="outline" size="sm" data-testid={`button-edit-bundle-${product.id}`} onClick={() => navigate(`${basePath}/bundles/edit/${product.id}`)}>
                            <Pencil className="h-4 w-4 mr-1" /> แก้ไขชุดสินค้า
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid={`button-delete-bundle-${product.id}`}
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm(`ลบชุดสินค้า "${product.name}" ออกจากระบบ?`)) {
                                deleteMutation.mutate(product.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-1" /> ลบ
                          </Button>
                        </div>
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