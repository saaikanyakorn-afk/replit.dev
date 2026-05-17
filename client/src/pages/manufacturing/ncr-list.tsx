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
import { Plus, Trash2, Eye, ShieldAlert } from "lucide-react";

interface NcrReport {
  id: number;
  ncr_no: string;
  mo_id: number | null;
  product_name: string;
  defect_qty: string | number;
  defect_type: string;
  status: "open" | "in_progress" | "closed";
  created_at: string | null;
  closed_at: string | null;
}

const DEFECT_TYPE_LABEL: Record<string, string> = {
  dimension: "ขนาด/มิติ",
  surface: "ผิวภายนอก",
  function: "การทำงาน",
  material: "วัตถุดิบ",
  other: "อื่นๆ",
};

function statusBadge(status: string) {
  if (status === "closed") return <Badge className="bg-gray-500 text-white" data-testid="badge-closed">ปิดแล้ว</Badge>;
  if (status === "in_progress") return <Badge className="bg-amber-500 text-white" data-testid="badge-in-progress">กำลังแก้ไข</Badge>;
  return <Badge className="bg-red-100 text-red-700 border border-red-300" data-testid="badge-open">เปิด</Badge>;
}

export default function NcrList({ urlBase = "/manufacturing" }: { urlBase?: string }) {
  const [, navigate] = useLocation();
  const { company } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: ncrs = [], isLoading } = useQuery<NcrReport[]>({
    queryKey: ["/api/ncr-reports", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/ncr-reports?companyId=${company.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("โหลดรายการไม่สำเร็จ");
      return r.json();
    },
    enabled: !!company?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/ncr-reports/${id}`, { method: "DELETE", credentials: "include" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || "ลบไม่สำเร็จ");
      return body;
    },
    onSuccess: () => {
      toast({ title: "ลบ NCR สำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/ncr-reports"] });
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
    <div className="p-6 max-w-5xl mx-auto" data-testid="ncr-list">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">NCR — บันทึกของเสีย</h1>
            <p className="text-sm text-gray-500">Non-Conformance Report สำหรับของเสีย/Reject ในกระบวนการผลิต</p>
          </div>
        </div>
        <Button
          onClick={() => navigate(`${urlBase}/ncr/form`)}
          className="bg-red-600 hover:bg-red-700 text-white"
          data-testid="btn-new-ncr"
        >
          <Plus className="w-4 h-4 mr-2" />
          สร้าง NCR
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">รายการ NCR ทั้งหมด</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : ncrs.length === 0 ? (
            <div className="text-center py-12 text-gray-400" data-testid="text-empty">
              <ShieldAlert className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>ยังไม่มี NCR</p>
            </div>
          ) : (
            <Table data-testid="table-ncrs">
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่</TableHead>
                  <TableHead>วันที่สร้าง</TableHead>
                  <TableHead>สินค้า</TableHead>
                  <TableHead>ประเภทของเสีย</TableHead>
                  <TableHead className="text-right">จำนวนของเสีย</TableHead>
                  <TableHead className="text-center">สถานะ</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ncrs.map((n) => (
                  <TableRow key={n.id} data-testid={`row-ncr-${n.id}`}>
                    <TableCell className="font-medium text-red-700" data-testid={`text-ncr-no-${n.id}`}>{n.ncr_no}</TableCell>
                    <TableCell data-testid={`text-created-at-${n.id}`}>{formatDate(n.created_at)}</TableCell>
                    <TableCell data-testid={`text-product-name-${n.id}`}>{n.product_name}</TableCell>
                    <TableCell data-testid={`text-defect-type-${n.id}`}>{DEFECT_TYPE_LABEL[n.defect_type] ?? n.defect_type}</TableCell>
                    <TableCell className="text-right" data-testid={`text-defect-qty-${n.id}`}>{Number(n.defect_qty).toLocaleString()}</TableCell>
                    <TableCell className="text-center">{statusBadge(n.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`${urlBase}/ncr/form/${n.id}`)}
                          data-testid={`btn-view-${n.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {n.status !== "closed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => setDeleteId(n.id)}
                            data-testid={`btn-delete-${n.id}`}
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
            <AlertDialogTitle>ยืนยันการลบ NCR</AlertDialogTitle>
            <AlertDialogDescription>ต้องการลบ NCR นี้ใช่หรือไม่? ไม่สามารถยกเลิกได้</AlertDialogDescription>
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
