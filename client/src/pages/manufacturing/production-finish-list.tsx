import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { Plus, Trash2, Eye, PackageCheck } from "lucide-react";

interface ProductionReceipt {
  id: number;
  receipt_no: string;
  mo_id: number | null;
  received_by_user_id: number | null;
  received_at: string | null;
  notes: string | null;
  status: "draft" | "confirmed";
  item_count: string | number | null;
}

function statusBadge(status: string) {
  if (status === "confirmed") return <Badge className="bg-green-600 text-white" data-testid="badge-confirmed">ยืนยันแล้ว</Badge>;
  return <Badge variant="outline" data-testid="badge-draft">ร่าง</Badge>;
}

export default function ProductionFinishList({ urlBase = "/manufacturing" }: { urlBase?: string }) {
  const [, navigate] = useLocation();
  const { company } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: receipts = [], isLoading } = useQuery<ProductionReceipt[]>({
    queryKey: ["/api/production-receipts", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/production-receipts?companyId=${company.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("โหลดรายการไม่สำเร็จ");
      return r.json();
    },
    enabled: !!company?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/production-receipts/${id}`, { method: "DELETE", credentials: "include" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || "ลบไม่สำเร็จ");
      return body;
    },
    onSuccess: () => {
      toast({ title: "ลบใบรับสำเร็จรูปสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/production-receipts"] });
      setDeleteId(null);
    },
    onError: (e: Error) => {
      toast({ title: "ข้อผิดพลาด", description: e.message, variant: "destructive" });
      setDeleteId(null);
    },
  });

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    try { return new Date(d).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }); }
    catch { return d; }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto" data-testid="production-finish-list">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <PackageCheck className="w-6 h-6 text-cyan-600" />
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">ใบรับสินค้าสำเร็จรูป</h1>
            <p className="text-sm text-gray-500">รับสินค้าจาก WIP เข้าคลัง FG (Finished Goods)</p>
          </div>
        </div>
        <Button
          onClick={() => navigate(`${urlBase}/production-finish/form`)}
          className="bg-cyan-600 hover:bg-cyan-700 text-white"
          data-testid="btn-new-receipt"
        >
          <Plus className="w-4 h-4 mr-2" />
          สร้างใบรับ
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">รายการใบรับสินค้าสำเร็จรูป</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : receipts.length === 0 ? (
            <div className="text-center py-12 text-gray-400" data-testid="text-empty">
              <PackageCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>ยังไม่มีใบรับสินค้าสำเร็จรูป</p>
            </div>
          ) : (
            <Table data-testid="table-receipts">
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่</TableHead>
                  <TableHead>วันที่รับ</TableHead>
                  <TableHead>MO</TableHead>
                  <TableHead className="text-center">รายการ</TableHead>
                  <TableHead className="text-center">สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((r) => (
                  <TableRow key={r.id} data-testid={`row-receipt-${r.id}`}>
                    <TableCell className="font-medium text-cyan-700" data-testid={`text-receipt-no-${r.id}`}>{r.receipt_no}</TableCell>
                    <TableCell data-testid={`text-received-at-${r.id}`}>{formatDate(r.received_at)}</TableCell>
                    <TableCell data-testid={`text-mo-id-${r.id}`}>{r.mo_id ? `MO #${r.mo_id}` : "-"}</TableCell>
                    <TableCell className="text-center" data-testid={`text-item-count-${r.id}`}>{r.item_count ?? 0} รายการ</TableCell>
                    <TableCell className="text-center">{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`${urlBase}/production-finish/form/${r.id}`)}
                          data-testid={`btn-view-${r.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {r.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => setDeleteId(r.id)}
                            data-testid={`btn-delete-${r.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>ต้องการลบใบรับสินค้าสำเร็จรูปนี้ใช่หรือไม่? ไม่สามารถยกเลิกได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-cancel-delete">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              data-testid="btn-confirm-delete"
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
