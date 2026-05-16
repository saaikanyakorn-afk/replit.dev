import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Factory, Play, CheckCircle, XCircle, FileText, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/format";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "ร่าง", color: "bg-gray-100 text-gray-700" },
  in_progress: { label: "กำลังผลิต", color: "bg-blue-100 text-blue-700" },
  completed: { label: "เสร็จสิ้น", color: "bg-green-100 text-green-700" },
  cancelled: { label: "ยกเลิก", color: "bg-red-100 text-red-700" },
};

export default function ManufacturingList(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }>; basePath?: string } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const basePath = props.basePath || "/inventory/manufacturing";
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: orders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/manufacturing-orders", selectedCompanyId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ companyId: String(selectedCompanyId) });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const r = await fetch(`/api/manufacturing-orders?${params}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const deleteMO = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/manufacturing-orders/${id}?companyId=${selectedCompanyId}`);
    },
    onSuccess: () => {
      toast({ title: "ลบใบสั่งผลิตแล้ว" });
      qc.invalidateQueries({ queryKey: ["/api/manufacturing-orders"] });
    },
    onError: (err: any) => toast({ title: "ลบไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const filtered = orders.filter(o => {
    if (!search) return true;
    const s = search.toLowerCase();
    return o.orderNo?.toLowerCase().includes(s) ||
      o.productName?.toLowerCase().includes(s) ||
      o.productCode?.toLowerCase().includes(s);
  });

  return (
    <LayoutComponent>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Factory className="h-6 w-6" style={{ color: "#fb9678" }} />
            <h1 className="text-2xl font-bold" data-testid="text-mo-title">ใบสั่งผลิต</h1>
          </div>
          <Button
            className="gap-2"
            style={{ backgroundColor: "#fb9678" }}
            onClick={() => navigate(`${basePath}/form`)}
            data-testid="button-create-mo"
          >
            <Plus className="h-4 w-4" /> สร้างใบสั่งผลิต
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="ค้นหาเลขที่ / สินค้า..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-testid="input-search-mo"
            />
          </div>
          <div className="flex gap-1">
            {[
              { key: "all", label: "ทั้งหมด" },
              { key: "draft", label: "ร่าง" },
              { key: "in_progress", label: "กำลังผลิต" },
              { key: "completed", label: "เสร็จสิ้น" },
            ].map(s => (
              <Button
                key={s.key}
                size="sm"
                variant={statusFilter === s.key ? "default" : "outline"}
                onClick={() => setStatusFilter(s.key)}
                data-testid={`filter-${s.key}`}
                style={statusFilter === s.key ? { backgroundColor: "#fb9678" } : {}}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">เลขที่</TableHead>
                  <TableHead>สินค้า</TableHead>
                  <TableHead className="w-24 text-center">จำนวน</TableHead>
                  <TableHead className="w-28 text-center">ล็อต</TableHead>
                  <TableHead className="w-28 text-center">วันหมดอายุ</TableHead>
                  <TableHead className="w-28 text-right">ต้นทุน/หน่วย</TableHead>
                  <TableHead className="w-28 text-right">ต้นทุนรวม</TableHead>
                  <TableHead className="w-24 text-center">สถานะ</TableHead>
                  <TableHead className="w-28 text-center">วันที่สร้าง</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      {isLoading ? "กำลังโหลด..." : "ยังไม่มีใบสั่งผลิต"}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(o => {
                  const st = STATUS_MAP[o.status] || STATUS_MAP.draft;
                  return (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`${basePath}/form/${o.id}`)}
                      data-testid={`row-mo-${o.id}`}
                    >
                      <TableCell className="font-mono text-sm font-medium" style={{ color: "#fb9678" }}>
                        {o.orderNo}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">{o.productName}</div>
                        <div className="text-xs text-muted-foreground">{o.productCode}</div>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {Number(o.status === "completed" ? o.completedQty : o.plannedQty).toFixed(2)} {o.unit}
                      </TableCell>
                      <TableCell className="text-center text-xs font-mono">
                        {o.lotNumber || "-"}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {o.expiryDate ? formatDate(o.expiryDate) : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm" data-testid={`text-unit-cost-${o.id}`}>
                        {o.status === "completed" && o.unitCost > 0 ? Number(o.unitCost).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm" data-testid={`text-total-cost-${o.id}`}>
                        {o.status === "completed" && o.totalCost > 0 ? Number(o.totalCost).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={st.color + " text-xs"}>{st.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {o.createdAt ? formatDate(o.createdAt) : "-"}
                      </TableCell>
                      <TableCell>
                        {o.status === "draft" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            onClick={e => {
                              e.stopPropagation();
                              if (confirm("ลบใบสั่งผลิตนี้?")) deleteMO.mutate(o.id);
                            }}
                            data-testid={`button-delete-mo-${o.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </LayoutComponent>
  );
}
