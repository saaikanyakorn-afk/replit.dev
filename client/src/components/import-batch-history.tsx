import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { History, Trash2, Loader2, ChevronDown, ChevronUp, AlertTriangle, BookOpen } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DOC_TYPE_LABELS: Record<string, string> = {
  invoice: "ใบแจ้งหนี้",
  purchase_invoice: "เอกสารซื้อ",
  expense: "ค่าใช้จ่าย",
  product: "สินค้า",
  contact: "คู่ค้า",
  quotation: "ใบเสนอราคา",
  tax_invoice: "ใบกำกับภาษี",
  receipt: "ใบรับเงิน",
  sales_order: "ใบสั่งขาย",
  credit_note: "ใบลดหนี้",
  purchase_order: "ใบสั่งซื้อ",
  purchase_request: "ใบขอซื้อ",
};

function formatDateTh(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear() + 543;
  const hour = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${min}`;
}

interface ImportBatchHistoryProps {
  docType: string;
  invalidateKeys?: string[][];
}

export default function ImportBatchHistory({ docType, invalidateKeys }: ImportBatchHistoryProps) {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["import-batches", companyId, docType],
    queryFn: async () => {
      const res = await fetch(`/api/import-batches?companyId=${companyId}&docType=${docType}`, { credentials: "include" });
      if (!res.ok) throw new Error("ไม่สามารถโหลดประวัติได้");
      return res.json();
    },
    enabled: !!companyId && expanded,
    staleTime: 0,
  });

  const activeBatches = batches.filter((b: any) => b.status === "active");

  const [retryingId, setRetryingId] = useState<number | null>(null);

  const retryJournalMutation = useMutation({
    mutationFn: async (batchId: number) => {
      setRetryingId(batchId);
      const res = await fetch(`/api/import-batches/${batchId}/retry-journal`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "สร้างบัญชีล้มเหลว");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRetryingId(null);
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      toast({
        title: "สร้างบัญชีสำเร็จ",
        description: `สร้าง ${data.created} รายการ${data.skipped > 0 ? ` (ข้าม ${data.skipped})` : ""}${data.message ? ` — ${data.message}` : ""}`,
      });
    },
    onError: (err: any) => {
      setRetryingId(null);
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (batchId: number) => {
      const res = await fetch(`/api/import-batches/${batchId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "ลบล็อตนำเข้าล้มเหลว");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["import-batches"] });
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      setDeleteId(null);
      let desc = `ลบ ${data.deletedDocs} รายการ`;
      if (data.deactivated > 0) {
        desc += ` | ยกเลิกการใช้ ${data.deactivated} รายการ (มีเอกสารอ้างอิง): ${data.deactivatedNames.join(", ")}`;
      }
      toast({
        title: "ยกเลิกการนำเข้าสำเร็จ",
        description: desc,
        duration: data.deactivated > 0 ? 15000 : 5000,
      });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const deletingBatch = deleteId ? activeBatches.find((b: any) => b.id === deleteId) : null;
  const label = DOC_TYPE_LABELS[docType] || docType;

  return (
    <div className="border rounded-lg bg-white">
      <button
        data-testid="toggle-import-history"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">ประวัติการนำเข้า</span>
          {!expanded && activeBatches.length > 0 && (
            <Badge className="bg-[#fb9678] text-white text-xs h-5 px-1.5">{activeBatches.length}</Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t px-4 py-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> กำลังโหลด...
            </div>
          ) : activeBatches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีประวัติการนำเข้า</p>
          ) : (
            <div className="space-y-2">
              {activeBatches.map((batch: any) => (
                <div key={batch.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-700">
                        {batch.fileName || `นำเข้า ${label}`}
                      </span>
                      <Badge variant="outline" className="text-xs">{batch.totalCreated} รายการ</Badge>
                      {batch.totalSkipped > 0 && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">ข้าม {batch.totalSkipped}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDateTh(batch.createdAt)}</p>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    {docType === "expense" && (
                      <Button
                        data-testid={`btn-retry-journal-${batch.id}`}
                        variant="outline"
                        size="sm"
                        className="text-blue-600 border-blue-200 hover:bg-blue-50 h-8 text-xs"
                        onClick={() => retryJournalMutation.mutate(batch.id)}
                        disabled={retryingId === batch.id}
                      >
                        {retryingId === batch.id ? (
                          <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> กำลังสร้าง...</>
                        ) : (
                          <><BookOpen className="h-3.5 w-3.5 mr-1" /> ลงบัญชีใหม่</>
                        )}
                      </Button>
                    )}
                    <Button
                      data-testid={`btn-delete-batch-${batch.id}`}
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50 h-8 text-xs"
                      onClick={() => setDeleteId(batch.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> ยกเลิก
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              ยืนยันการยกเลิกการนำเข้า
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <p>การดำเนินการนี้จะลบข้อมูลทั้งหมดที่สร้างจากการนำเข้าครั้งนี้:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>{label} {deletingBatch?.totalCreated || 0} รายการ</li>
                <li>บันทึกบัญชีที่เกี่ยวข้อง (ถ้ามี)</li>
              </ul>
              {deletingBatch?.fileName && (
                <p className="text-sm"><strong>ไฟล์:</strong> {deletingBatch.fileName}</p>
              )}
              <p className="text-red-600 font-medium">ไม่สามารถกู้คืนข้อมูลได้</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              data-testid="btn-confirm-delete-batch"
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> กำลังลบ...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" /> ยืนยันลบทั้งล็อต</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
