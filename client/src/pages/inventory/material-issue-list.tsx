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
import { Plus, Trash2, Eye, ClipboardList } from "lucide-react";

interface MaterialIssue {
  id: number;
  issue_no: string;
  mo_no: string | null;
  issued_by_name: string | null;
  issued_at: string | null;
  notes: string | null;
  status: "draft" | "confirmed";
  item_count: string | number | null;
}

function statusBadge(status: string) {
  if (status === "confirmed") return <Badge className="bg-green-600 text-white" data-testid="badge-confirmed">ยืนยันแล้ว</Badge>;
  return <Badge variant="outline" data-testid="badge-draft">ร่าง</Badge>;
}

export default function MaterialIssueList() {
  const [, navigate] = useLocation();
  const { company } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: issues = [], isLoading } = useQuery<MaterialIssue[]>({
    queryKey: ["/api/material-issues", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/material-issues?companyId=${company.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("โหลดรายการไม่สำเร็จ");
      return r.json();
    },
    enabled: !!company?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/material-issues/${id}`, { method: "DELETE", credentials: "include" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.message || "ลบไม่สำเร็จ");
      return body;
    },
    onSuccess: () => {
      toast({ title: "ลบใบเบิกสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/material-issues"] });
    },
    onError: (e: Error) => toast({ title: "ข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="container mx-auto py-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="title-material-issue-list">ใบเบิกวัตถุดิบ</h1>
        </div>
        <Button data-testid="button-create-material-issue" onClick={() => navigate("/inventory/material-issue/form")}>
          <Plus className="h-4 w-4 mr-2" />
          สร้างใบเบิกใหม่
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">รายการใบเบิกวัตถุดิบทั้งหมด</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : issues.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground" data-testid="text-empty-list">
              ยังไม่มีใบเบิกวัตถุดิบ กดปุ่ม "สร้างใบเบิกใหม่" เพื่อเริ่มต้น
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่ใบเบิก</TableHead>
                  <TableHead>ใบสั่งผลิต</TableHead>
                  <TableHead>พนักงาน</TableHead>
                  <TableHead className="text-center">จำนวน item</TableHead>
                  <TableHead>วันที่เบิก</TableHead>
                  <TableHead>หมายเหตุ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead className="w-24 text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map(issue => (
                  <TableRow key={issue.id} data-testid={`row-issue-${issue.id}`}>
                    <TableCell className="font-medium" data-testid={`text-issue-no-${issue.id}`}>{issue.issue_no}</TableCell>
                    <TableCell data-testid={`text-mo-no-${issue.id}`}>{issue.mo_no || "-"}</TableCell>
                    <TableCell data-testid={`text-issued-by-${issue.id}`}>{issue.issued_by_name || "-"}</TableCell>
                    <TableCell className="text-center" data-testid={`text-item-count-${issue.id}`}>{issue.item_count !== null && issue.item_count !== undefined ? Number(issue.item_count) : 0}</TableCell>
                    <TableCell data-testid={`text-issued-at-${issue.id}`}>
                      {issue.issued_at ? new Date(issue.issued_at).toLocaleDateString("th-TH") : "-"}
                    </TableCell>
                    <TableCell className="max-w-48 truncate" data-testid={`text-notes-${issue.id}`}>{issue.notes || "-"}</TableCell>
                    <TableCell>{statusBadge(issue.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm" variant="ghost"
                          data-testid={`button-view-${issue.id}`}
                          onClick={() => navigate(`/inventory/material-issue/form/${issue.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {issue.status === "draft" && (
                          <Button
                            size="sm" variant="ghost"
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-delete-${issue.id}`}
                            onClick={() => setDeleteId(issue.id)}
                          >
                            <Trash2 className="h-4 w-4" />
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

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>ต้องการลบใบเบิกวัตถุดิบนี้ใช่หรือไม่? ไม่สามารถย้อนกลับได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete"
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); }}
            >
              ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
