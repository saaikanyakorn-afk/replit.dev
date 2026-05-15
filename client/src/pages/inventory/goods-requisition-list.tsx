import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import {
  Search, Plus, ClipboardList, Edit2, Trash2, CheckCircle2, Clock,
  MoreHorizontal, Eye, BookOpen, BookX
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/format";

import { useDateSettings } from "@/hooks/use-date-settings";
const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function GoodsRequisitionList(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }>; basePath?: string } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const reqBasePath = props.basePath ? `${props.basePath}/requisition` : "/inventory/requisition";
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { dateEra, dateFmt } = useDateSettings();
  const { data: docSettings } = useQuery<any>({
    queryKey: ["/api/document-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const res = await fetch(`/api/document-settings?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
  });
  const { data: giqList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/goods-requisitions", companyId, searchText],
    queryFn: async () => {
      if (!companyId) return [];
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (searchText) params.set("search", searchText);
      const res = await fetch(`/api/goods-requisitions?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/goods-requisitions/${id}/approve`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/goods-requisitions"] });
      const jeMsg = data.journalEntryId ? " และลงบัญชีแล้ว" : "";
      toast({ title: `อนุมัติใบเบิกสินค้าสำเร็จ${jeMsg}`, variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const journalMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/goods-requisitions/${id}/journal`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goods-requisitions"] });
      toast({ title: "ลงบัญชีสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const cancelJournalMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/goods-requisitions/${id}/cancel-journal`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goods-requisitions"] });
      toast({ title: "ยกเลิกรายการบัญชีสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/goods-requisitions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/goods-requisitions"] });
      toast({ title: "ลบใบเบิกสินค้าสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const filtered = giqList.filter((giq: any) => {
    if (filterStatus && filterStatus !== "all" && giq.status !== filterStatus) return false;
    return true;
  });

  return (
    <LayoutComponent>
      <div className="space-y-4" data-testid="goods-requisition-list-page">
        <div className="rounded-lg p-6 shadow-sm border" style={{ background: "#dbeafe" }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
                <ClipboardList className="h-7 w-7" />
                ใบเบิกสินค้า (GIQ)
                <Badge className="bg-blue-200 text-blue-800 border-0 text-sm ml-2" data-testid="badge-count">
                  {filtered.length}
                </Badge>
              </h1>
              <p className="mt-1 text-blue-800/60 text-sm">
                จัดการใบเบิกสินค้า (Goods Requisition)
              </p>
            </div>
            <Button
              data-testid="button-create"
              onClick={() => navigate(`${reqBasePath}/form`)}
              className="bg-white text-blue-700 hover:bg-blue-50 border-blue-300 h-9 font-medium"
            >
              <Plus className="h-4 w-4 mr-1" />
              สร้างใบเบิก
            </Button>
          </div>
        </div>

        <Card className="rounded border shadow-sm bg-white">
          <CardHeader className="p-3 border-b space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="relative flex-1 w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  data-testid="input-search"
                  placeholder="ค้นหาเลขที่ ผู้เบิก..."
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  className="pl-9 h-9 text-sm bg-white border shadow-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">สถานะ:</span>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-36 h-9 text-sm bg-white border rounded-lg" data-testid="select-filter-status">
                    <SelectValue placeholder="ทั้งหมด" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    <SelectItem value="draft">ร่าง</SelectItem>
                    <SelectItem value="approved">อนุมัติ</SelectItem>
                  </SelectContent>
                </Select>
                {filterStatus !== "all" && (
                  <Button variant="ghost" size="sm" className="h-9 text-sm text-muted-foreground" onClick={() => setFilterStatus("all")} data-testid="button-clear-filters">
                    ล้างตัวกรอง
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">กำลังโหลด...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm">ยังไม่มีใบเบิกสินค้า</p>
                <Button variant="outline" className="mt-3" onClick={() => navigate(`${reqBasePath}/form`)} data-testid="button-create-first">
                  <Plus className="h-4 w-4 mr-1" /> สร้างรายการแรก
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-100">
                    <TableRow className="hover:bg-transparent h-11">
                      <TableHead className="w-10 text-center text-sm font-medium text-slate-700">#</TableHead>
                      <TableHead className="w-36 text-sm font-medium text-slate-700">เลขที่</TableHead>
                      <TableHead className="w-28 text-sm font-medium text-slate-700">วันที่</TableHead>
                      <TableHead className="text-sm font-medium text-slate-700">แผนก/ผู้เบิก</TableHead>
                      <TableHead className="w-36 text-sm font-medium text-slate-700">วัตถุประสงค์</TableHead>
                      <TableHead className="w-32 text-right text-sm font-medium text-slate-700">มูลค่ารวม</TableHead>
                      <TableHead className="w-28 text-sm font-medium text-slate-700">สถานะ</TableHead>
                      <TableHead className="w-28 text-sm font-medium text-slate-700">บัญชี</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((giq: any, idx: number) => {
                      const st = STATUS_MAP[giq.status] || STATUS_MAP.draft;
                      const StIcon = st.icon;
                      const hasJournal = !!giq.journalEntryId;
                      return (
                        <TableRow key={giq.id} data-testid={`row-giq-${giq.id}`} className="hover:bg-slate-50/50 border-b">
                          <TableCell className="text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <button
                              data-testid={`link-giq-${giq.id}`}
                              className="text-sm text-[#e8855a] hover:underline font-medium"
                              onClick={() => navigate(`${reqBasePath}/form/${giq.id}`)}
                            >
                              {giq.giqNo || `-`}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(giq.giqDate || giq.date, dateEra, dateFmt)}</TableCell>
                          <TableCell className="text-sm">{giq.departmentName || giq.requestedBy || "-"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{giq.purpose || "-"}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{fmt(giq.totalAmount)}</TableCell>
                          <TableCell>
                            <Badge data-testid={`badge-status-${giq.id}`} className={`${st.color} border text-xs py-0.5 px-2.5 font-normal h-6`}>
                              <StIcon className="h-3 w-3 mr-1" />
                              {st.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {giq.status === "approved" ? (
                              hasJournal ? (
                                <Badge data-testid={`badge-journal-${giq.id}`} className="bg-blue-100 text-blue-700 border-blue-200 border text-xs py-0.5 px-2.5 font-normal h-6">
                                  <BookOpen className="h-3 w-3 mr-1" />
                                  ลงบัญชีแล้ว
                                </Badge>
                              ) : (
                                <Badge data-testid={`badge-no-journal-${giq.id}`} className="bg-amber-100 text-amber-700 border-amber-200 border text-xs py-0.5 px-2.5 font-normal h-6">
                                  <BookX className="h-3 w-3 mr-1" />
                                  ยังไม่ลงบัญชี
                                </Badge>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button data-testid={`button-actions-${giq.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52 text-sm">
                                <DropdownMenuItem
                                  data-testid={`action-view-${giq.id}`}
                                  onClick={() => navigate(`${reqBasePath}/form/${giq.id}`)}
                                  className="flex gap-2"
                                >
                                  <Eye className="h-3.5 w-3.5" /> ดูรายละเอียด
                                </DropdownMenuItem>
                                {giq.status === "draft" && (
                                  <DropdownMenuItem
                                    data-testid={`action-edit-${giq.id}`}
                                    onClick={() => navigate(`${reqBasePath}/form/${giq.id}`)}
                                    className="flex gap-2"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                                  </DropdownMenuItem>
                                )}
                                {giq.status === "draft" && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      data-testid={`action-approve-${giq.id}`}
                                      onClick={() => approveMutation.mutate(giq.id)}
                                      className="flex gap-2 text-emerald-600"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ (หักสต๊อก + ลงบัญชี)
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {giq.status === "approved" && !hasJournal && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      data-testid={`action-journal-${giq.id}`}
                                      onClick={() => journalMutation.mutate(giq.id)}
                                      className="flex gap-2 text-blue-600"
                                    >
                                      <BookOpen className="h-3.5 w-3.5" /> ลงบัญชี
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {giq.status === "approved" && hasJournal && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      data-testid={`action-cancel-journal-${giq.id}`}
                                      onClick={() => {
                                        if (confirm("ยืนยันยกเลิกรายการบัญชีของใบเบิกนี้?")) {
                                          cancelJournalMutation.mutate(giq.id);
                                        }
                                      }}
                                      className="flex gap-2 text-orange-600"
                                    >
                                      <BookX className="h-3.5 w-3.5" /> ยกเลิกรายการบัญชี
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    data-testid={`action-delete-${giq.id}`}
                                    onClick={() => {
                                      if (confirm("ยืนยันลบใบเบิกสินค้านี้?")) {
                                        deleteMutation.mutate(giq.id);
                                      }
                                    }}
                                    className="flex gap-2 text-red-500"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" /> ลบ
                                  </DropdownMenuItem>
                                </>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </LayoutComponent>
  );
}
