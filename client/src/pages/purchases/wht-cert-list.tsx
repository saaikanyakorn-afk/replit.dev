import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import {
  Search, Plus, FileText, Edit2, Trash2, Eye,
  CheckCircle2, Clock, XCircle,
  Printer, Link2, Download, BarChart3, Layers, Loader2, MessageSquare, MoreHorizontal, Mail
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LineSendDialog from "@/components/line-send-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, getShareBaseUrl } from "@/lib/queryClient";
import { formatDate } from "@/lib/format";

import { useDateSettings } from "@/hooks/use-date-settings";
const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "ร่าง", color: "bg-slate-100 text-slate-700 border-slate-200", icon: Clock },
  approved: { label: "อนุมัติ", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  cancelled: { label: "ยกเลิก", color: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
};

const FORM_TYPE_MAP: Record<string, string> = {
  pnd1a: "ภ.ง.ด.1ก",
  pnd1a_special: "ภ.ง.ด.1ก พิเศษ",
  pnd2: "ภ.ง.ด.2",
  pnd3: "ภ.ง.ด.3",
  pnd2a: "ภ.ง.ด.2ก",
  pnd3a: "ภ.ง.ด.3ก",
  pnd53: "ภ.ง.ด.53",
  pnd1: "ภ.ง.ด.1",
};

const MONTHS = [
  { value: "01", label: "มกราคม" },
  { value: "02", label: "กุมภาพันธ์" },
  { value: "03", label: "มีนาคม" },
  { value: "04", label: "เมษายน" },
  { value: "05", label: "พฤษภาคม" },
  { value: "06", label: "มิถุนายน" },
  { value: "07", label: "กรกฎาคม" },
  { value: "08", label: "สิงหาคม" },
  { value: "09", label: "กันยายน" },
  { value: "10", label: "ตุลาคม" },
  { value: "11", label: "พฤศจิกายน" },
  { value: "12", label: "ธันวาคม" },
];

const INCOME_TYPE_SHORT: Record<string, string> = {
  "1": "ม.40(1) เงินเดือน",
  "2": "ม.40(2) ค่านายหน้า",
  "3": "ม.40(3) ลิขสิทธิ์/ค่าเช่า",
  "4a": "ม.40(4)(ก) ดอกเบี้ย",
  "4b": "ม.40(4)(ข) เงินปันผล",
  "4": "ม.40(4) ค่าขนส่ง",
  "5": "ม.3 เตรส ค่าจ้าง/บริการ",
  "6": "อื่นๆ",
};

const FORM_TYPES = [
  { value: "all", label: "ทั้งหมด" },
  { value: "pnd1a", label: "ภ.ง.ด.1ก" },
  { value: "pnd1a_special", label: "ภ.ง.ด.1ก พิเศษ" },
  { value: "pnd2", label: "ภ.ง.ด.2" },
  { value: "pnd3", label: "ภ.ง.ด.3" },
  { value: "pnd2a", label: "ภ.ง.ด.2ก" },
  { value: "pnd3a", label: "ภ.ง.ด.3ก" },
  { value: "pnd53", label: "ภ.ง.ด.53" },
];

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDefaultYear(): string {
  return String(new Date().getFullYear() + 543);
}

function getDefaultMonth(): string {
  return String(new Date().getMonth() + 1).padStart(2, "0");
}

export default function WhtCertList() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [searchText, setSearchText] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  });
  const [filterStatus, setFilterStatus] = useState("all");

  const [month, setMonth] = useState(getDefaultMonth());
  const [year, setYear] = useState(getDefaultYear());
  const [formType, setFormType] = useState("all");
  const [searched, setSearched] = useState(false);

  const [consMonth, setConsMonth] = useState(getDefaultMonth());
  const [consYear, setConsYear] = useState(getDefaultYear());
  const [consSearched, setConsSearched] = useState(false);
  const [selectedVendors, setSelectedVendors] = useState<Set<string>>(new Set());
  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; payeeName: string }>({ open: false, url: "", docNo: "", payeeName: "" });
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; docId: number | null; email: string; payeeName: string; certNo: string; loading: boolean; sending: boolean }>({ open: false, docId: null, email: "", payeeName: "", certNo: "", loading: false, sending: false });

  const { dateEra, dateFmt } = useDateSettings();
  const { data: docSettings } = useQuery<any>({
    queryKey: ["/api/document-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const res = await fetch(`/api/document-settings/${companyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
  });
  const { data: whtList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/wht-certs", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/wht-certs?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: reportRows, isLoading: reportLoading, refetch: refetchReport } = useQuery<any[]>({
    queryKey: ["/api/reports/wht/summary", companyId, month, year, formType, searched],
    queryFn: async () => {
      if (!companyId || !searched) return [];
      const res = await fetch(`/api/reports/wht/summary?companyId=${companyId}&month=${month}&year=${year}&formType=${formType}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId && searched,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/wht-certs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wht-certs"] });
      toast({ title: "ลบหนังสือรับรอง 50 ทวิ สำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest("PATCH", `/api/wht-certs/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wht-certs"] });
      toast({ title: "อัปเดตสถานะสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const { data: consVendors = [], isLoading: consLoading, refetch: refetchCons } = useQuery<any[]>({
    queryKey: ["/api/wht-certs/consolidate", companyId, consMonth, consYear, consSearched],
    queryFn: async () => {
      if (!companyId || !consSearched) return [];
      const res = await fetch(`/api/wht-certs/consolidate?companyId=${companyId}&month=${consMonth}&year=${consYear}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId && consSearched,
  });

  const consolidateMutation = useMutation({
    mutationFn: async (vendors: any[]) => {
      const lastDay = new Date(
        Number(consYear) > 2500 ? Number(consYear) - 543 : Number(consYear),
        parseInt(consMonth), 0
      ).getDate();
      const ceYear = Number(consYear) > 2500 ? Number(consYear) - 543 : Number(consYear);
      const certDate = `${ceYear}-${consMonth}-${String(lastDay).padStart(2, "0")}`;
      const vendorsWithDate = vendors.map(v => ({ ...v, certDate }));
      return apiRequest("POST", "/api/wht-certs/consolidate", { companyId, vendors: vendorsWithDate });
    },
    onSuccess: async (res) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/wht-certs"] });
      toast({ title: `สร้างใบรวม ${data.created} ใบสำเร็จ`, variant: "success" as any });
      setConsSearched(false);
      setSelectedVendors(new Set());
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const handleConsolidate = () => {
    const selected = consVendors.filter((_: any, idx: number) => selectedVendors.has(String(idx)));
    if (selected.length === 0) {
      toast({ title: "กรุณาเลือก vendor ที่ต้องการรวม", variant: "destructive" });
      return;
    }
    if (!confirm(`ต้องการสร้างใบ 50 ทวิ รวม ${selected.length} ใบ (1 ใบ ต่อ vendor)?`)) return;
    consolidateMutation.mutate(selected);
  };

  const handleShare = async (doc: any) => {
    try {
      const res = await apiRequest("POST", `/api/wht-certs/${doc.id}/share`);
      const data = await res.json();
      const base = await getShareBaseUrl();
      const url = `${base}/share/wht-cert/${data.shareToken}`;
      await navigator.clipboard.writeText(url);
      toast({ title: "คัดลอกลิงก์แชร์แล้ว" });
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const handleSendLine = async (doc: any) => {
    try {
      const res = await apiRequest("POST", `/api/wht-certs/${doc.id}/share`);
      const data = await res.json();
      const base = await getShareBaseUrl();
      const url = `${base}/share/wht-cert/${data.shareToken}`;
      setTimeout(() => setLineDialog({ open: true, url, docNo: doc.certNo || "", payeeName: doc.payeeName || "" }), 150);
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
  };

  const handleOpenEmailDialog = async (doc: any) => {
    setEmailDialog({ open: true, docId: doc.id, email: "", payeeName: doc.payeeName || "", certNo: doc.certNo || "", loading: true, sending: false });
    try {
      const res = await apiRequest("GET", `/api/wht-certs/${doc.id}/send-email-info`);
      const data = await res.json();
      setEmailDialog(prev => ({ ...prev, email: data.suggestedEmail || "", loading: false }));
    } catch {
      setEmailDialog(prev => ({ ...prev, loading: false }));
    }
  };

  const handleSendEmail = async () => {
    if (!emailDialog.docId) return;
    setEmailDialog(prev => ({ ...prev, sending: true }));
    try {
      const res = await apiRequest("POST", `/api/wht-certs/${emailDialog.docId}/send-email`, { toEmail: emailDialog.email });
      const data = await res.json();
      if (data.success) {
        toast({ title: "ส่งอีเมลสำเร็จ", description: data.message, variant: "success" as any });
        setEmailDialog(prev => ({ ...prev, open: false, sending: false }));
      } else {
        toast({ title: "ส่งอีเมลไม่สำเร็จ", description: data.message, variant: "destructive" });
        setEmailDialog(prev => ({ ...prev, sending: false }));
      }
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
      setEmailDialog(prev => ({ ...prev, sending: false }));
    }
  };

  const handleReportSearch = () => {
    setSearched(true);
    refetchReport();
  };

  const handleExport = async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/reports/wht/export?companyId=${companyId}&month=${month}&year=${year}&formType=${formType}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "ไม่สามารถดาวน์โหลดได้", description: err.message, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="(.+)"/);
      a.download = match ? match[1] : `WHT_${formType}_${year}_${month}.txt`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ดาวน์โหลดไฟล์สำเร็จ", description: "ไฟล์ .txt พร้อมนำเข้าโปรแกรม RD Prep" });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
  };

  const filtered = whtList.filter((d: any) => {
    if (filterStatus !== "all" && d.status !== filterStatus) return false;
    if (searchText) {
      const s = searchText.toLowerCase();
      return (
        d.certNo?.toLowerCase().includes(s) ||
        d.payeeName?.toLowerCase().includes(s) ||
        d.payeeTaxId?.toLowerCase().includes(s) ||
        d.sourceDocNo?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const totalAmountPaid = (reportRows || []).reduce((sum, r) => sum + Number(r.amountPaid || 0), 0);
  const totalTaxWithheld = (reportRows || []).reduce((sum, r) => sum + Number(r.taxWithheld || 0), 0);
  const countPnd3 = (reportRows || []).filter(r => r.formType === "pnd3").length;
  const countPnd53 = (reportRows || []).filter(r => r.formType === "pnd53").length;
  const selectedMonthLabel = MONTHS.find(m => m.value === month)?.label || month;
  const currentBEYear = new Date().getFullYear() + 543;
  const yearOptions = Array.from({ length: 5 }, (_, i) => String(currentBEYear - i));

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--theme-primary)]/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-[var(--theme-primary)]" />
          </div>
          <div>
            <h2 className="text-lg font-bold" data-testid="text-page-title">ภาษีหัก ณ ที่จ่าย (50 ทวิ)</h2>
            <p className="text-xs text-muted-foreground">จัดการหนังสือรับรอง 50 ทวิ และรายงานสรุปรายเดือน</p>
          </div>
        </div>

        <Tabs defaultValue="list" className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-xl">
            <TabsTrigger value="list" className="flex items-center gap-1.5" data-testid="tab-list">
              <FileText className="w-4 h-4" /> รายการ 50 ทวิ
            </TabsTrigger>
            <TabsTrigger value="consolidate" className="flex items-center gap-1.5" data-testid="tab-consolidate">
              <Layers className="w-4 h-4" /> รวมรายเดือน
            </TabsTrigger>
            <TabsTrigger value="report" className="flex items-center gap-1.5" data-testid="tab-report">
              <BarChart3 className="w-4 h-4" /> รายงานสรุป
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <Card className="flexy-card">
              <CardHeader className="pb-3">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div />
                  <div className="flex items-center gap-2">
                    <Button
                      data-testid="button-new-wht-cert"
                      onClick={() => navigate("/purchases/wht/new")}
                      className="bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/90 text-white"
                    >
                      <Plus className="w-4 h-4 mr-1" /> สร้างใหม่
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-col md:flex-row gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      data-testid="input-search"
                      placeholder="ค้นหาเลขที่, ชื่อผู้ถูกหัก, เลขประจำตัว..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ทุกสถานะ</SelectItem>
                      <SelectItem value="draft">ร่าง</SelectItem>
                      <SelectItem value="approved">อนุมัติ</SelectItem>
                      <SelectItem value="cancelled">ยกเลิก</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">กำลังโหลด...</div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">ยังไม่มีหนังสือรับรอง 50 ทวิ</p>
                    <Button
                      variant="outline"
                      className="mt-3 border-[var(--theme-primary)] text-[var(--theme-primary)]"
                      onClick={() => navigate("/purchases/wht/new")}
                      data-testid="button-new-wht-empty"
                    >
                      <Plus className="w-4 h-4 mr-1" /> สร้างรายการแรก
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-sm font-semibold">เลขที่</TableHead>
                          <TableHead className="text-sm font-semibold">วันที่</TableHead>
                          <TableHead className="text-sm font-semibold">ผู้ถูกหัก</TableHead>
                          <TableHead className="text-sm font-semibold text-right">ภาษีที่หัก</TableHead>
                          <TableHead className="text-sm font-semibold">สถานะ</TableHead>
                          <TableHead className="text-sm font-semibold text-center">จัดการ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((doc: any) => {
                          const st = STATUS_MAP[doc.status] || STATUS_MAP.draft;
                          const StIcon = st.icon;
                          return (
                            <TableRow key={doc.id} className="hover:bg-muted/20">
                              <TableCell className="text-sm" data-testid={`text-cert-no-${doc.id}`}>
                                <button className="text-[var(--theme-primary)] hover:underline cursor-pointer font-medium" onClick={() => navigate(`/purchases/wht/edit/${doc.id}`)}>{doc.certNo}</button>
                                <div className="text-xs text-muted-foreground">{FORM_TYPE_MAP[doc.formType] || doc.formType}</div>
                              </TableCell>
                              <TableCell className="text-sm">{formatDate(doc.certDate, dateEra, dateFmt)}</TableCell>
                              <TableCell className="text-sm">
                                <div>{doc.payeeName}</div>
                                {doc.payeeTaxId && <div className="text-xs text-muted-foreground">{doc.payeeTaxId}</div>}
                              </TableCell>
                              <TableCell className="text-sm text-right">
                                <div className="font-medium text-red-600">{fmt(doc.taxWithheld)}</div>
                                <div className="text-xs text-muted-foreground">จาก {fmt(doc.amountPaid)}</div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={`text-xs ${st.color}`}>
                                  <StIcon className="w-3 h-3 mr-1" />
                                  {st.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button data-testid={`button-actions-${doc.id}`} variant="ghost" size="icon" className="h-7 w-7">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-52 text-sm">
                                    <DropdownMenuItem onClick={() => navigate(`/purchases/wht/edit/${doc.id}`)} className="flex gap-2">
                                      <Edit2 className="h-3.5 w-3.5" /> แก้ไข
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => navigate(`/purchases/wht/print/${doc.id}`)} className="flex gap-2">
                                      <Printer className="h-3.5 w-3.5 text-purple-500" /> ดูตัวอย่าง / สั่งพิมพ์
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleShare(doc)} className="flex gap-2">
                                      <Link2 className="h-3.5 w-3.5" /> ลิงก์สำหรับแชร์
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSendLine(doc)} className="flex gap-2 text-green-600">
                                      <MessageSquare className="h-3.5 w-3.5" /> ส่งผ่าน LINE
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleOpenEmailDialog(doc)} className="flex gap-2 text-blue-600" data-testid={`button-send-email-${doc.id}`}>
                                      <Mail className="h-3.5 w-3.5" /> ส่งอีเมล
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {doc.status === "draft" && (
                                      <DropdownMenuItem onClick={() => statusMutation.mutate({ id: doc.id, status: "approved" })} className="flex gap-2 text-emerald-600">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ
                                      </DropdownMenuItem>
                                    )}
                                    {doc.status !== "cancelled" && (
                                      <DropdownMenuItem onClick={() => { if (confirm("ต้องการลบหนังสือรับรองนี้?")) deleteMutation.mutate(doc.id); }} className="flex gap-2 text-red-500">
                                        <Trash2 className="h-3.5 w-3.5" /> ลบ
                                      </DropdownMenuItem>
                                    )}
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

                {filtered.length > 0 && (
                  <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                    <span>แสดง {filtered.length} รายการ</span>
                    <span>
                      รวมภาษีหัก: <span className="font-medium text-red-600">{fmt(filtered.reduce((s: number, d: any) => s + parseFloat(d.taxWithheld || "0"), 0))}</span>
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="consolidate" className="mt-4 space-y-4">
            <Card className="flexy-card">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">เดือน</label>
                    <Select value={consMonth} onValueChange={setConsMonth}>
                      <SelectTrigger className="w-[160px] rounded-full" data-testid="select-cons-month">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">ปี พ.ศ.</label>
                    <Select value={consYear} onValueChange={setConsYear}>
                      <SelectTrigger className="w-[120px] rounded-full" data-testid="select-cons-year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map(y => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => { setConsSearched(true); refetchCons(); }}
                    className="rounded-full bg-[#03c9d7] hover:bg-[#02b0bd] text-white"
                    data-testid="button-search-consolidate"
                  >
                    <Search className="h-4 w-4 mr-1" /> ค้นหา
                  </Button>
                  {consSearched && consVendors.length > 0 && (
                    <Button
                      onClick={handleConsolidate}
                      disabled={selectedVendors.size === 0 || consolidateMutation.isPending}
                      className="ml-auto rounded-full bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/90 text-white"
                      data-testid="button-create-consolidated"
                    >
                      {consolidateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Layers className="h-4 w-4 mr-1" />}
                      ออกใบรวม ({selectedVendors.size})
                    </Button>
                  )}
                </div>
              </CardHeader>
            </Card>

            {consSearched && (
              <>
                {consLoading ? (
                  <div className="text-center py-8 text-muted-foreground">กำลังโหลด...</div>
                ) : consVendors.length === 0 ? (
                  <Card className="flexy-card">
                    <CardContent className="py-12 text-center">
                      <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground">ไม่พบรายการ 50 ทวิ ในเดือน {MONTHS.find(m => m.value === consMonth)?.label} {consYear}</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">พบ {consVendors.length} ราย สำหรับเดือน {MONTHS.find(m => m.value === consMonth)?.label} {consYear}</p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (selectedVendors.size === consVendors.length) {
                              setSelectedVendors(new Set());
                            } else {
                              setSelectedVendors(new Set(consVendors.map((_: any, i: number) => String(i))));
                            }
                          }}
                          data-testid="button-select-all"
                        >
                          {selectedVendors.size === consVendors.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
                        </Button>
                      </div>
                    </div>

                    {consVendors.map((vendor: any, idx: number) => {
                      const key = String(idx);
                      const isSelected = selectedVendors.has(key);
                      return (
                        <Card
                          key={idx}
                          className={`flexy-card cursor-pointer transition-all ${isSelected ? "ring-2 ring-[var(--theme-primary)] border-[var(--theme-primary)]" : ""}`}
                          onClick={() => {
                            setSelectedVendors(prev => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            });
                          }}
                          data-testid={`card-vendor-${idx}`}
                        >
                          <CardContent className="pt-4 pb-4">
                            <div className="flex items-start gap-3">
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 shrink-0 ${isSelected ? "bg-[var(--theme-primary)] border-[var(--theme-primary)]" : "border-gray-300"}`}>
                                {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <div>
                                    <p className="text-sm font-bold">{vendor.payeeName}</p>
                                    <p className="text-xs text-muted-foreground">{vendor.payeeTaxId || "-"} | {vendor.payeeBranch || "สำนักงานใหญ่"}</p>
                                  </div>
                                  <Badge variant="outline" className={vendor.formType === "pnd53" ? "border-[#03c9d7] text-[#03c9d7]" : "border-[var(--theme-primary)] text-[var(--theme-primary)]"}>
                                    {FORM_TYPE_MAP[vendor.formType] || vendor.formType}
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-3 gap-3 mb-2">
                                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-muted-foreground">จำนวนใบ</p>
                                    <p className="text-lg font-bold" style={{ color: "var(--theme-primary)" }}>{vendor.certCount}</p>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-muted-foreground">ยอดเงินที่จ่าย</p>
                                    <p className="text-sm font-bold text-[#fec90f]">{fmt(vendor.totalAmountPaid)}</p>
                                  </div>
                                  <div className="bg-slate-50 rounded-lg p-2 text-center">
                                    <p className="text-xs text-muted-foreground">ภาษีที่หัก</p>
                                    <p className="text-sm font-bold text-[#f94d4d]">{fmt(vendor.totalTaxWithheld)}</p>
                                  </div>
                                </div>
                                {vendor.consolidatedItems && vendor.consolidatedItems.length > 0 && (
                                  <div className="border-t pt-2">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">รายละเอียดประเภทเงินได้ (รวมแล้ว)</p>
                                    <div className="space-y-1">
                                      {vendor.consolidatedItems.map((item: any, iIdx: number) => {
                                        const typeLabel = INCOME_TYPE_SHORT[item.incomeType] || `ประเภท ${item.incomeType}`;
                                        return (
                                          <div key={iIdx} className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">{typeLabel} {item.incomeDescription ? `(${item.incomeDescription})` : ""}</span>
                                            <span>จ่าย <span className="font-medium">{fmt(item.amountPaid)}</span> | หัก <span className="font-medium text-red-600">{fmt(item.taxWithheld)}</span></span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="report" className="mt-4 space-y-4">
            <Card className="flexy-card">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">เดือน</label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger className="w-[160px] rounded-full" data-testid="select-month">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => (
                          <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">ปี พ.ศ.</label>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger className="w-[120px] rounded-full" data-testid="select-year">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map(y => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">ประเภทแบบ</label>
                    <Select value={formType} onValueChange={setFormType}>
                      <SelectTrigger className="w-[220px] rounded-full" data-testid="select-form-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORM_TYPES.map(ft => (
                          <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleReportSearch} className="rounded-full bg-[#03c9d7] hover:bg-[#02b0bd] text-white" data-testid="button-search-report">
                    <Search className="h-4 w-4 mr-1" /> ค้นหา
                  </Button>
                  {searched && reportRows && reportRows.length > 0 && (
                    <>
                      <div className="ml-auto flex items-center gap-2 flex-wrap">
                        {(formType === "all" ? ["pnd3", "pnd53"] : [formType]).map(ft => {
                          const ftRows = reportRows.filter((r: any) => formType === "all" ? r.formType === ft : true);
                          if (ftRows.length === 0) return null;
                          const ftLabel = ft === "pnd3" ? "ภ.ง.ด.3" : ft === "pnd53" ? "ภ.ง.ด.53" : ft;
                          return (
                            <Button
                              key={ft}
                              variant="outline"
                              className="rounded-full"
                              style={{ borderColor: "var(--theme-primary)", color: "var(--theme-primary)" }}
                              onClick={() => navigate(`/purchases/wht/attachment?companyId=${companyId}&month=${month}&year=${year}&formType=${ft}`)}
                              data-testid={`button-attachment-${ft}`}
                            >
                              <Printer className="h-4 w-4 mr-1" /> ใบแนบ {ftLabel}
                            </Button>
                          );
                        })}
                        <Button onClick={handleExport} className="rounded-full bg-[#05b187] hover:bg-[#049973] text-white" data-testid="button-export-txt">
                          <Download className="h-4 w-4 mr-1" /> ดาวน์โหลด .txt (RD Prep)
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </CardHeader>
            </Card>

            {searched && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="flexy-card">
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">จำนวนรายการ</p>
                      <p className="text-2xl font-bold" style={{ color: "var(--theme-primary)" }} data-testid="text-total-count">{(reportRows || []).length}</p>
                    </CardContent>
                  </Card>
                  <Card className="flexy-card">
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">ภ.ง.ด.3 / ภ.ง.ด.53</p>
                      <p className="text-2xl font-bold" data-testid="text-form-count">
                        <span className="text-[var(--theme-primary)]">{countPnd3}</span>
                        <span className="text-muted-foreground mx-1">/</span>
                        <span className="text-[#03c9d7]">{countPnd53}</span>
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="flexy-card">
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">ยอดเงินที่จ่าย</p>
                      <p className="text-2xl font-bold text-[#fec90f]" data-testid="text-total-paid">{fmt(totalAmountPaid)}</p>
                    </CardContent>
                  </Card>
                  <Card className="flexy-card">
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">ภาษีหัก ณ ที่จ่าย</p>
                      <p className="text-2xl font-bold text-[#f94d4d]" data-testid="text-total-tax">{fmt(totalTaxWithheld)}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="flexy-card">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">รายการหนังสือรับรองหัก ณ ที่จ่าย - {selectedMonthLabel} {year}</p>
                      {reportRows && reportRows.length > 0 && (
                        <Button variant="outline" size="sm" className="rounded-full text-xs" onClick={() => window.print()} data-testid="button-print-report">
                          <Printer className="h-3.5 w-3.5 mr-1" /> พิมพ์
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {reportLoading ? (
                      <div className="p-8 text-center text-muted-foreground text-sm">กำลังโหลด...</div>
                    ) : !reportRows || reportRows.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground text-sm">
                        ไม่พบรายการหัก ณ ที่จ่ายในเดือน {selectedMonthLabel} {year}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50">
                              <TableHead className="text-xs font-semibold w-10 text-center">#</TableHead>
                              <TableHead className="text-xs font-semibold">เลขที่</TableHead>
                              <TableHead className="text-xs font-semibold">วันที่จ่าย</TableHead>
                              <TableHead className="text-xs font-semibold">ประเภท</TableHead>
                              <TableHead className="text-xs font-semibold">ผู้รับเงิน</TableHead>
                              <TableHead className="text-xs font-semibold">เลขประจำตัวผู้เสียภาษี</TableHead>
                              <TableHead className="text-xs font-semibold">ประเภทเงินได้</TableHead>
                              <TableHead className="text-xs font-semibold text-right">อัตรา (%)</TableHead>
                              <TableHead className="text-xs font-semibold text-right">จำนวนเงินที่จ่าย</TableHead>
                              <TableHead className="text-xs font-semibold text-right">ภาษีที่หัก</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {reportRows.map((cert: any, idx: number) => (
                              <TableRow key={cert.id} data-testid={`row-wht-${cert.id}`}>
                                <TableCell className="text-xs text-center text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell className="text-sm font-medium">{cert.certNo}</TableCell>
                                <TableCell className="text-sm">{formatDate(cert.paidDate, dateEra, dateFmt)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cert.formType === "pnd53" ? "border-[#03c9d7] text-[#03c9d7]" : "border-[var(--theme-primary)] text-[var(--theme-primary)]"}>
                                    {FORM_TYPE_MAP[cert.formType] || cert.formType}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm">{cert.payeeName}</TableCell>
                                <TableCell className="text-sm font-mono text-muted-foreground">{cert.payeeTaxId || "-"}</TableCell>
                                <TableCell className="text-sm">{cert.incomeDescription || cert.incomeType || "-"}</TableCell>
                                <TableCell className="text-sm text-right">{Number(cert.taxRate || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-sm text-right font-medium">{fmt(cert.amountPaid)}</TableCell>
                                <TableCell className="text-sm text-right font-medium text-[#f94d4d]">{fmt(cert.taxWithheld)}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-slate-50 font-semibold">
                              <TableCell colSpan={8} className="text-sm text-right">รวมทั้งสิ้น</TableCell>
                              <TableCell className="text-sm text-right">{fmt(totalAmountPaid)}</TableCell>
                              <TableCell className="text-sm text-right text-[#f94d4d]">{fmt(totalTaxWithheld)}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {reportRows && reportRows.length > 0 && (
                  <Card className="flexy-card border-dashed border-[#05b187]">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#05b187]/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Download className="h-4 w-4 text-[#05b187]" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold mb-1">วิธีใช้ไฟล์ .txt ยื่นภาษี</p>
                          <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                            <li>กดปุ่ม <span className="font-semibold text-[#05b187]">"ดาวน์โหลด .txt (RD Prep)"</span> ด้านบน</li>
                            <li>เปิดโปรแกรม <span className="font-semibold">RD Prep</span> จากเว็บกรมสรรพากร (efiling.rd.go.th)</li>
                            <li>เลือก "โอนย้ายข้อมูล" → เลือก {formType === "pnd53" ? "ภ.ง.ด.53" : formType === "pnd3" ? "ภ.ง.ด.3" : "ภ.ง.ด.3 หรือ ภ.ง.ด.53"}</li>
                            <li>เลือกรูปแบบตัวคั่น <span className="font-semibold">"|" (Pipe)</span> แล้วอัพโหลดไฟล์ .txt</li>
                            <li>จับคู่ข้อมูลแล้วกด "โอนย้าย" → ได้ไฟล์ .rdx สำหรับยื่นภาษี</li>
                          </ol>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <LineSendDialog
        open={lineDialog.open}
        onOpenChange={(open) => setLineDialog(prev => ({ ...prev, open }))}
        shareUrl={lineDialog.url}
        docType="ใบ 50 ทวิ"
        docNo={lineDialog.docNo}
        customerName={lineDialog.payeeName}
        companyId={companyId}
      />

      <Dialog open={emailDialog.open} onOpenChange={(open) => setEmailDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              ส่งอีเมลใบ 50 ทวิ
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {emailDialog.certNo && (
              <p className="text-sm text-muted-foreground">เลขที่: <span className="font-medium text-foreground">{emailDialog.certNo}</span> — {emailDialog.payeeName}</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="wht-email-input">อีเมลผู้รับ</Label>
              {emailDialog.loading ? (
                <div className="flex items-center gap-2 h-9 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> กำลังดึงอีเมล...</div>
              ) : (
                <Input
                  id="wht-email-input"
                  data-testid="input-wht-email"
                  type="email"
                  placeholder="กรอกอีเมลผู้รับ"
                  value={emailDialog.email}
                  onChange={(e) => setEmailDialog(prev => ({ ...prev, email: e.target.value }))}
                />
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEmailDialog(prev => ({ ...prev, open: false }))} disabled={emailDialog.sending}>
              ยกเลิก
            </Button>
            <Button
              data-testid="button-confirm-send-email"
              onClick={handleSendEmail}
              disabled={emailDialog.sending || emailDialog.loading || !emailDialog.email}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {emailDialog.sending ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />กำลังส่ง...</> : <><Mail className="h-4 w-4 mr-2" />ส่งอีเมล</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
