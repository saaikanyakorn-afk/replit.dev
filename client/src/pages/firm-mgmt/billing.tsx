import { useState, useMemo, useRef } from "react";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import {
  FileText, Search, DollarSign, Users, CheckCircle, Loader2, AlertCircle, Printer, Receipt, Settings, Plus, Pencil, Save, X, Upload, Download, Send, CheckCircle2, XCircle,
} from "lucide-react";

const LINE_ICON = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={props.className}><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/></svg>
);
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useLocation } from "wouter";
import { formatDate } from "@/lib/format";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { toLocalDateStr } from "@/lib/utils";

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FirmBilling() {
  const [, navigate] = useLocation();
  const { selectedCompany, primaryCompanyId } = useCompany();
  const companyId = primaryCompanyId || selectedCompany?.id;
  const { toast } = useToast();
  const { dateEra, dateFmt } = useDateSettings();
  const queryClient = useQueryClient();

  const now = new Date();
  const [billingMonth, setBillingMonth] = useState(now.getMonth() + 1);
  const [billingYear, setBillingYear] = useState(now.getFullYear());
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => toLocalDateStr(now));
  const handleInvoiceDateChange = (val: string) => {
    setInvoiceDate(val);
    if (val && val.length >= 10) {
      const parts = val.split("-");
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (m >= 1 && m <= 12 && y >= 1900 && y <= 2200) {
        setBillingMonth(m);
        setBillingYear(y);
      }
    }
  };
  const [creditDays, setCreditDays] = useState(30);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFee, setEditFee] = useState("");
  const [editWht, setEditWht] = useState("");
  const [editVatIncluded, setEditVatIncluded] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [newFee, setNewFee] = useState("");
  const [newWht, setNewWht] = useState("3");
  const [newVatIncluded, setNewVatIncluded] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [csvResult, setCsvResult] = useState<any>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [csvUpdateFees, setCsvUpdateFees] = useState(true);
  const [lineSendConfirmOpen, setLineSendConfirmOpen] = useState(false);
  const [lineSendResultsOpen, setLineSendResultsOpen] = useState(false);
  const [lineSendResults, setLineSendResults] = useState<any[]>([]);

  const { data: clients, isLoading } = useQuery<any[]>({
    queryKey: ["/api/firm-clients"],
    queryFn: async () => {
      const r = await fetch("/api/firm-clients", { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });

  const { data: generated } = useQuery<any>({
    queryKey: ["/api/firm-billing/status", companyId, billingMonth, billingYear],
    queryFn: async () => {
      if (!companyId) return { generated: [] };
      const r = await fetch(`/api/firm-billing/status?companyId=${companyId}&month=${billingMonth}&year=${billingYear}`, { credentials: "include" });
      return r.ok ? r.json() : { generated: [] };
    },
    enabled: !!companyId,
  });

  const { data: contacts } = useQuery<any[]>({
    queryKey: ["/api/contacts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const r = await fetch(`/api/contacts?companyId=${companyId}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!companyId,
  });

  const existingClientNames = useMemo(() => {
    return new Set((clients || []).map((c: any) => c.name?.toLowerCase()));
  }, [clients]);

  const filteredContacts = useMemo(() => {
    const list = (contacts || []).filter((c: any) => c.active !== false && !existingClientNames.has(c.name?.toLowerCase()));
    if (!contactSearch) return list.slice(0, 20);
    const s = contactSearch.toLowerCase();
    return list.filter((c: any) => (c.name || "").toLowerCase().includes(s) || (c.taxId || "").includes(s) || (c.code || "").includes(s)).slice(0, 20);
  }, [contacts, contactSearch, existingClientNames]);

  const generatedSet = useMemo(() => {
    const s = new Set<number>();
    for (const g of (generated?.generated || [])) s.add(g.firmClientId);
    return s;
  }, [generated]);

  const activeClients = useMemo(() => {
    let list = (clients || []).filter((c: any) => c.status === "active" && parseFloat(c.serviceFee || "0") > 0);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c: any) => (c.name || "").toLowerCase().includes(s) || (c.taxId || "").includes(s));
    }
    return list;
  }, [clients, search]);

  const allSelected = activeClients.length > 0 && activeClients.every((c: any) => selected.has(c.id));
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activeClients.map((c: any) => c.id)));
    }
  };
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const calcVat = (fee: number, vatIncluded: boolean) => {
    if (vatIncluded) {
      const vat = fee * 7 / 107;
      return { subtotal: fee - vat, vat, total: fee };
    } else {
      const vat = fee * 0.07;
      return { subtotal: fee, vat, total: fee + vat };
    }
  };

  const selectedClients = activeClients.filter((c: any) => selected.has(c.id));
  const totalFee = selectedClients.reduce((s: number, c: any) => {
    const fee = parseFloat(c.serviceFee || "0");
    const vi = c.feeVatIncluded === true;
    return s + calcVat(fee, vi).total;
  }, 0);
  const totalWht = selectedClients.reduce((s: number, c: any) => {
    const fee = parseFloat(c.serviceFee || "0");
    const vi = c.feeVatIncluded === true;
    const { subtotal } = calcVat(fee, vi);
    const rate = parseFloat(c.whtRate || "3");
    return s + (subtotal * rate / 100);
  }, 0);

  const batchGenerate = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/firm-billing/batch-generate", {
        companyId,
        firmClientIds: Array.from(selected),
        month: billingMonth,
        year: billingYear,
        invoiceDate,
        creditDays,
      });
      return r.json();
    },
    onSuccess: (data) => {
      const msg = data.skipped > 0 ? `ออกใบแจ้งหนี้สำเร็จ ${data.count} ใบ (ข้าม ${data.skipped} ใบที่เคยออกแล้ว)` : `ออกใบแจ้งหนี้สำเร็จ ${data.count} ใบ`;
      toast({
        title: msg,
        description: data.count > 0 ? "ดูรายการใบแจ้งหนี้ได้ที่เมนู ขาย > ใบแจ้งหนี้" : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/firm-billing/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setConfirmOpen(false);
      setSelected(new Set());
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const backfillJournals = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/firm-billing/backfill-journals", { companyId });
      return r.json();
    },
    onSuccess: (data) => {
      if (data.created > 0) {
        toast({ title: `สร้างรายการบัญชีย้อนหลังสำเร็จ ${data.created} รายการ` });
      } else {
        toast({ title: "ทุกใบแจ้งหนี้มีรายการบัญชีครบแล้ว" });
      }
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const batchSendLine = useMutation({
    mutationFn: async () => {
      const allGeneratedClientIds = (generated?.generated || []).map((g: any) => g.firmClientId);
      const r = await fetch("/api/firm-billing/batch-send-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId, firmClientIds: allGeneratedClientIds, month: billingMonth, year: billingYear }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: (data) => {
      setLineSendResults(data.results || []);
      setLineSendConfirmOpen(false);
      setLineSendResultsOpen(true);
    },
    onError: (err: any) => {
      toast({ title: "ส่ง LINE ไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, serviceFee, whtRate, feeVatIncluded }: { id: number; serviceFee: string; whtRate: string; feeVatIncluded: boolean }) => {
      const r = await apiRequest("PATCH", `/api/firm-clients/${id}`, { serviceFee, whtRate, feeVatIncluded });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "บันทึกสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/firm-clients"] });
      setEditingId(null);
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const addClient = useMutation({
    mutationFn: async () => {
      if (!selectedContact) throw new Error("กรุณาเลือกลูกค้า");
      const r = await apiRequest("POST", "/api/firm-clients", {
        companyId,
        name: selectedContact.name,
        taxId: selectedContact.taxId || null,
        address: selectedContact.address || null,
        phone: selectedContact.phone || null,
        email: selectedContact.email || null,
        contactPerson: selectedContact.contactPerson || null,
        branch: selectedContact.branch || "สำนักงานใหญ่",
        serviceFee: newFee,
        feeVatIncluded: newVatIncluded,
        whtRate: newWht,
        status: "active",
      });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "เพิ่มลูกค้าสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/firm-clients"] });
      setAddOpen(false);
      setSelectedContact(null);
      setContactSearch("");
      setNewFee("");
      setNewWht("3");
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditFee(c.serviceFee || "0");
    setEditWht(c.whtRate || "3");
    setEditVatIncluded(c.feeVatIncluded === true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFee("");
    setEditWht("");
  };

  const saveEdit = (id: number) => {
    updateClient.mutate({ id, serviceFee: editFee, whtRate: editWht, feeVatIncluded: editVatIncluded });
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000);
      try {
        const r = await fetch("/api/firm-clients/import", { method: "POST", body: formData, credentials: "include", signal: controller.signal });
        clearTimeout(timeoutId);
        if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
        return r.json();
      } catch (e: any) {
        clearTimeout(timeoutId);
        throw e;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/firm-clients"] });
      setImportResult(data);
      setImportFile(null);
      toast({ title: data.message, variant: data.errors?.length > 0 ? "default" : ("success" as any) });
    },
    onError: (e: any) => {
      toast({ title: "นำเข้าไม่สำเร็จ", description: e.message, variant: "destructive" });
    },
  });

  const csvPreviewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", String(companyId));
      formData.append("mode", "preview");
      const r = await fetch("/api/firm-billing/import-csv", { method: "POST", body: formData, credentials: "include" });
      if (!r.ok) { try { const d = await r.json(); throw new Error(d.message); } catch { throw new Error(`เกิดข้อผิดพลาด (${r.status})`); } }
      return r.json();
    },
    onSuccess: (data) => setCsvPreview(data),
    onError: (e: any) => toast({ title: "อ่านไฟล์ไม่สำเร็จ", description: e.message, variant: "destructive" }),
  });

  const csvConfirmMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", String(companyId));
      formData.append("mode", "import");
      formData.append("updateFees", String(csvUpdateFees));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000);
      try {
        const r = await fetch("/api/firm-billing/import-csv", { method: "POST", body: formData, credentials: "include", signal: controller.signal });
        clearTimeout(timeoutId);
        if (!r.ok) { try { const d = await r.json(); throw new Error(d.message); } catch { throw new Error(`เกิดข้อผิดพลาด (${r.status})`); } }
        return r.json();
      } catch (e: any) { clearTimeout(timeoutId); throw e; }
    },
    onSuccess: (data) => {
      setCsvResult(data);
      setCsvFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/firm-billing/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/firm-clients"] });
      const parts = [`สร้างใบแจ้งหนี้ ${data.created} ใบ`];
      if (data.skipped > 0) parts.push(`ข้าม ${data.skipped} ใบ`);
      if (data.feesUpdated > 0) parts.push(`อัปเดตค่าบริการ ${data.feesUpdated} ราย`);
      toast({ title: parts.join(" | "), variant: "success" as any });
    },
    onError: (e: any) => toast({ title: "นำเข้าไม่สำเร็จ", description: e.message, variant: "destructive" }),
  });

  return (
    <Layout>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground" data-testid="text-page-title">สรุปค่างวด / ออกใบแจ้งหนี้</h1>
          <p className="text-sm text-muted-foreground">ออกใบแจ้งหนี้ค่าบริการบัญชีให้ลูกค้าพร้อมกันทีเดียว</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-blue-400 text-blue-600 hover:bg-blue-50"
            onClick={() => setImportOpen(true)}
            data-testid="button-import-excel"
          >
            <Upload className="h-3.5 w-3.5" />
            นำเข้าลูกค้า Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-green-500 text-green-600 hover:bg-green-50"
            onClick={() => { setCsvImportOpen(true); setCsvPreview(null); setCsvResult(null); setCsvFile(null); }}
            data-testid="button-import-invoices"
          >
            <FileText className="h-3.5 w-3.5" />
            นำเข้าใบแจ้งหนี้เก่า
          </Button>
          <a
            href={`/api/firm-billing/export?companyId=${companyId}&month=${billingMonth}&year=${billingYear}`}
            className="inline-flex items-center gap-1.5 text-xs border border-purple-400 text-purple-600 hover:bg-purple-50 rounded-md px-3 py-1.5 font-medium"
            data-testid="button-export-billing"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs border-[#fb9678] text-[#fb9678] hover:bg-[#fb9678]/10"
            onClick={() => navigate("/firm-mgmt/clients")}
            data-testid="button-manage-clients"
          >
            <Settings className="h-3.5 w-3.5" />
            จัดการข้อมูลลูกค้า / ค่าบริการ
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ลูกค้าทั้งหมด</p>
                <p className="text-lg font-bold text-foreground" data-testid="text-total-clients">{activeClients.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ค่าบริการรวม/เดือน</p>
                <p className="text-lg font-bold text-foreground" data-testid="text-total-fee">฿{fmt(activeClients.reduce((s: number, c: any) => s + parseFloat(c.serviceFee || "0"), 0))}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-cyan-50 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-cyan-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ออกแล้วเดือนนี้</p>
                <p className="text-lg font-bold text-foreground" data-testid="text-generated-count">{generatedSet.size}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-orange-50 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ยังไม่ได้ออก</p>
                <p className="text-lg font-bold text-orange-600" data-testid="text-pending-count">{activeClients.length - generatedSet.size}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <CardTitle className="text-base">เลือกลูกค้าเพื่อออกใบแจ้งหนี้</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={String(billingMonth)} onValueChange={(v) => { const m = Number(v); setBillingMonth(m); const cur = new Date(invoiceDate + "T00:00:00"); const day = !isNaN(cur.getTime()) ? Math.min(cur.getDate(), new Date(billingYear, m, 0).getDate()) : 1; setInvoiceDate(`${billingYear}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`); }}>
                <SelectTrigger className="h-9 w-[130px] text-sm" data-testid="select-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THAI_MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(billingYear)} onValueChange={(v) => { const y = Number(v); setBillingYear(y); const cur = new Date(invoiceDate + "T00:00:00"); const day = !isNaN(cur.getTime()) ? Math.min(cur.getDate(), new Date(y, billingMonth, 0).getDate()) : 1; setInvoiceDate(`${y}-${String(billingMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`); }}>
                <SelectTrigger className="h-9 w-[100px] text-sm" data-testid="select-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y + 543}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="ค้นหาลูกค้า..."
                  className="pl-8 h-9 text-sm w-[180px]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Button
                size="sm"
                className="h-9 gap-1"
                style={{ backgroundColor: "#fb9678", borderColor: "#fb9678" }}
                onClick={() => setAddOpen(true)}
                data-testid="button-add-client"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มลูกค้า
              </Button>
              {generatedSet.size > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 border-[#06C755] text-[#06C755] hover:bg-[#06C755]/10"
                    onClick={() => setLineSendConfirmOpen(true)}
                    disabled={batchSendLine.isPending}
                    data-testid="button-batch-send-line"
                  >
                    {batchSendLine.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LINE_ICON className="h-3.5 w-3.5" />}
                    ส่ง LINE ({generatedSet.size} ใบ)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1"
                    style={{ borderColor: "var(--theme-primary)", color: "var(--theme-primary)" }}
                    onClick={() => backfillJournals.mutate()}
                    disabled={backfillJournals.isPending}
                    data-testid="button-backfill-journals"
                  >
                    {backfillJournals.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                    สร้างบัญชีย้อนหลัง
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeClients.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
              ไม่พบลูกค้าที่มีค่าบริการ
            </div>
          ) : (
            <>
              <div className="border-b">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="w-10 px-4 py-2.5 text-left">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} data-testid="checkbox-select-all" />
                      </th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">ชื่อลูกค้า</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">เลขประจำตัวผู้เสียภาษี</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">ค่าบริการ/เดือน</th>
                      <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">หัก ณ ที่จ่าย (%)</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">ยอด WHT</th>
                      <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">สถานะ</th>
                      <th className="w-20 px-4 py-2.5 text-center font-medium text-muted-foreground">แก้ไข</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {activeClients.map((c: any) => {
                      const isGenerated = generatedSet.has(c.id);
                      const isEditing = editingId === c.id;
                      const fee = isEditing ? parseFloat(editFee || "0") : parseFloat(c.serviceFee || "0");
                      const vatInc = isEditing ? editVatIncluded : (c.feeVatIncluded === true);
                      const { subtotal: sub, vat: vatAmt, total: totalAmt } = calcVat(fee, vatInc);
                      const rate = isEditing ? parseFloat(editWht || "3") : parseFloat(c.whtRate || "3");
                      const whtAmt = sub * rate / 100;
                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-muted/50 transition-colors ${isGenerated ? "opacity-60" : ""} ${isEditing ? "bg-[#fb9678]/5" : ""}`}
                          data-testid={`row-client-${c.id}`}
                        >
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selected.has(c.id)}
                              disabled={isGenerated}
                              onCheckedChange={() => toggle(c.id)}
                              data-testid={`checkbox-client-${c.id}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-foreground">{c.name}</span>
                            {c.branch && c.branch !== "สำนักงานใหญ่" && (
                              <span className="text-xs text-muted-foreground ml-1">({c.branch})</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{c.taxId || "-"}</td>
                          <td className="px-4 py-3 text-right">
                            {isEditing ? (
                              <div className="flex flex-col items-end gap-1">
                                <Input
                                  type="number"
                                  value={editFee}
                                  onChange={(e) => setEditFee(e.target.value)}
                                  className="h-8 w-[130px] text-right text-sm"
                                  data-testid={`input-fee-${c.id}`}
                                />
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <Checkbox
                                    checked={editVatIncluded}
                                    onCheckedChange={(v) => setEditVatIncluded(!!v)}
                                    className="h-3.5 w-3.5"
                                    data-testid={`checkbox-vat-${c.id}`}
                                  />
                                  <span className="text-[11px] text-muted-foreground">รวม VAT</span>
                                </label>
                              </div>
                            ) : (
                              <div className="flex flex-col items-end">
                                <span className="font-semibold cursor-pointer hover:underline" style={{ color: "#fb9678" }} onClick={() => startEdit(c)}>
                                  ฿{fmt(fee)}
                                </span>
                                <span className={`text-[10px] ${vatInc ? "text-blue-500" : "text-orange-500"}`}>
                                  {vatInc ? "รวม VAT" : "ไม่รวม VAT"}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <Input
                                type="number"
                                value={editWht}
                                onChange={(e) => setEditWht(e.target.value)}
                                className="h-8 w-[70px] text-center text-sm mx-auto"
                                step="0.5"
                                data-testid={`input-wht-${c.id}`}
                              />
                            ) : (
                              <span className="text-sm text-foreground cursor-pointer hover:underline" onClick={() => startEdit(c)}>
                                {rate}%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                            ฿{fmt(whtAmt)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isGenerated ? (
                              <Badge className="text-[10px] bg-green-100 text-green-700 border-0">
                                <CheckCircle className="h-3 w-3 mr-0.5" />ออกแล้ว
                              </Badge>
                            ) : (
                              <Badge className="text-[10px] bg-muted text-muted-foreground border-0">รอออก</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => saveEdit(c.id)}
                                  disabled={updateClient.isPending}
                                  data-testid={`button-save-${c.id}`}
                                >
                                  {updateClient.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={cancelEdit}
                                  data-testid={`button-cancel-${c.id}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => startEdit(c)}
                                data-testid={`button-edit-${c.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {selected.size > 0 && (
                <div className="p-4 bg-[#539BFF]/10 border-t flex items-center justify-between">
                  <div className="text-sm text-foreground">
                    เลือกแล้ว <span className="font-bold">{selected.size}</span> ราย
                    | ค่าบริการ <span className="font-bold" style={{ color: "#fb9678" }}>฿{fmt(totalFee)}</span>
                    | WHT <span className="font-bold text-red-600">฿{fmt(totalWht)}</span>
                  </div>
                  <Button
                    style={{ background: "#fb9678" }}
                    onClick={() => setConfirmOpen(true)}
                    data-testid="button-batch-generate"
                  >
                    <Receipt className="h-4 w-4 mr-1" />
                    ออกใบแจ้งหนี้ {selected.size} ใบ
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">ยืนยันออกใบแจ้งหนี้</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ประจำเดือน</span>
                <span className="font-medium">{THAI_MONTHS[billingMonth - 1]} {billingYear + 543}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">จำนวนลูกค้า</span>
                <span className="font-medium">{selected.size} ราย</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ยอดรวม</span>
                <span className="font-bold" style={{ color: "#fb9678" }}>฿{fmt(totalFee)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">หัก ณ ที่จ่ายรวม</span>
                <span className="font-medium text-red-600">฿{fmt(totalWht)}</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-1">
                <span className="text-muted-foreground">ยอดสุทธิรับ (หลังหัก WHT)</span>
                <span className="font-bold text-green-700">฿{fmt(totalFee - totalWht)}</span>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">วันที่ออกใบแจ้งหนี้</Label>
                <ThaiDateInput value={invoiceDate} onChange={handleInvoiceDateChange} dateEra={dateEra} dateFmt={dateFmt} className="mt-1" data-testid="input-invoice-date" />
              </div>
              <div>
                <Label className="text-xs">เครดิต (วัน)</Label>
                <Input
                  type="number"
                  value={creditDays}
                  onChange={(e) => setCreditDays(Number(e.target.value))}
                  className="mt-1"
                  data-testid="input-credit-days"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>ยกเลิก</Button>
            <Button
              style={{ background: "#fb9678" }}
              disabled={batchGenerate.isPending}
              onClick={() => batchGenerate.mutate()}
              data-testid="button-confirm-generate"
            >
              {batchGenerate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Printer className="h-4 w-4 mr-1" />}
              ยืนยันออกใบแจ้งหนี้
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lineSendConfirmOpen} onOpenChange={setLineSendConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <LINE_ICON className="h-4 w-4 text-[#06C755]" />
              ยืนยันส่งใบแจ้งหนี้ผ่าน LINE
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="bg-[#06C755]/10 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">ประจำเดือน</span>
                <span className="font-medium">{THAI_MONTHS[billingMonth - 1]} {billingYear + 543}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ส่งให้</span>
                <span className="font-medium">{generatedSet.size} บริษัท</span>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">ระบบจะส่งใบแจ้งหนี้ผ่าน LINE ไปยังกลุ่มที่เชื่อมไว้ใน บริหารสำนักงาน → ตั้งค่ากลุ่ม LINE โดยอัตโนมัติ บริษัทที่ยังไม่มีกลุ่ม LINE จะไม่ถูกส่ง</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineSendConfirmOpen(false)}>ยกเลิก</Button>
            <Button
              className="bg-[#06C755] hover:bg-[#05a849] text-white"
              disabled={batchSendLine.isPending}
              onClick={() => batchSendLine.mutate()}
              data-testid="button-confirm-send-line"
            >
              {batchSendLine.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <LINE_ICON className="h-4 w-4 mr-1" />}
              {batchSendLine.isPending ? "กำลังส่ง..." : "ส่งเลย"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={lineSendResultsOpen} onOpenChange={setLineSendResultsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <LINE_ICON className="h-4 w-4 text-[#06C755]" />
              ผลการส่งใบแจ้งหนี้ผ่าน LINE
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {(() => {
              const successList = lineSendResults.filter(r => r.success);
              const failList = lineSendResults.filter(r => !r.success);
              return (
                <>
                  {successList.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-green-700 mb-1.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> ส่งสำเร็จ {successList.length} ราย
                      </p>
                      {successList.map((r: any) => (
                        <div key={r.firmClientId} className="flex items-center justify-between py-1.5 px-3 rounded bg-green-50 mb-1 text-sm">
                          <span className="font-medium text-foreground">{r.clientName}</span>
                          <span className="text-xs text-muted-foreground">{r.invoiceNo}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {failList.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-600 mb-1.5 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" /> ส่งไม่ได้ {failList.length} ราย
                      </p>
                      {failList.map((r: any) => (
                        <div key={r.firmClientId} className="flex items-start justify-between py-1.5 px-3 rounded bg-red-50 mb-1 text-sm">
                          <span className="font-medium text-foreground">{r.clientName}</span>
                          <span className="text-xs text-red-500 text-right max-w-[180px]">{r.error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <DialogFooter className="mt-3">
            <Button onClick={() => setLineSendResultsOpen(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) { setSelectedContact(null); setContactSearch(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">เพิ่มลูกค้าใหม่</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">เลือกลูกค้าจากรายชื่อ <span className="text-red-500">*</span></Label>
              {selectedContact ? (
                <div className="mt-1 p-2.5 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm text-foreground">{selectedContact.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedContact.taxId && <span>เลขที่ {selectedContact.taxId}</span>}
                      {selectedContact.branch && selectedContact.branch !== "สำนักงานใหญ่" && <span className="ml-2">({selectedContact.branch})</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setSelectedContact(null)} data-testid="button-clear-contact">
                    <X className="h-3.5 w-3.5 mr-1" /> เปลี่ยน
                  </Button>
                </div>
              ) : (
                <div className="mt-1">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      placeholder="ค้นหาชื่อ, เลขภาษี, รหัสลูกค้า..."
                      className="pl-8 text-sm"
                      data-testid="input-contact-search"
                    />
                  </div>
                  <div className="mt-1 max-h-[200px] overflow-y-auto border rounded-lg divide-y">
                    {filteredContacts.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                        {contactSearch ? "ไม่พบรายชื่อที่ค้นหา" : "ไม่มีรายชื่อลูกค้า"}
                      </div>
                    ) : filteredContacts.map((ct: any) => (
                      <div
                        key={ct.id}
                        className="px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => { setSelectedContact(ct); setContactSearch(""); }}
                        data-testid={`contact-option-${ct.id}`}
                      >
                        <div className="text-sm font-medium text-foreground">{ct.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {ct.code && <span className="mr-2">{ct.code}</span>}
                          {ct.taxId && <span>เลขที่ {ct.taxId}</span>}
                          {ct.phone && <span className="ml-2">{ct.phone}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">ค่าบริการ/เดือน (บาท) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  value={newFee}
                  onChange={(e) => setNewFee(e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                  data-testid="input-new-fee"
                />
              </div>
              <div>
                <Label className="text-xs">หัก ณ ที่จ่าย (%)</Label>
                <Input
                  type="number"
                  value={newWht}
                  onChange={(e) => setNewWht(e.target.value)}
                  step="0.5"
                  className="mt-1"
                  data-testid="input-new-wht"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={newVatIncluded}
                onCheckedChange={(v) => setNewVatIncluded(!!v)}
                data-testid="checkbox-new-vat"
              />
              <span className="text-sm text-foreground">ราคารวม VAT 7%</span>
              <span className="text-[11px] text-muted-foreground">{newVatIncluded ? "(ค่าบริการที่ระบุรวม VAT แล้ว)" : "(ค่าบริการยังไม่รวม VAT จะบวก 7% เพิ่ม)"}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>ยกเลิก</Button>
            <Button
              style={{ background: "#fb9678" }}
              disabled={!selectedContact || !newFee || addClient.isPending}
              onClick={() => addClient.mutate()}
              data-testid="button-confirm-add"
            >
              {addClient.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
              เพิ่มลูกค้า
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setImportFile(null); setImportResult(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
          <DialogHeader>
            <DialogTitle>นำเข้าข้อมูลลูกค้าจาก Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800 mb-2">ดาวน์โหลดไฟล์ตัวอย่างเพื่อดูรูปแบบที่ถูกต้อง แล้วกรอกข้อมูลลูกค้าลงไป</p>
              <a href="/api/firm-clients/import/template" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-900" data-testid="link-download-template">
                <Download className="h-4 w-4" /> ดาวน์โหลดไฟล์ตัวอย่าง (.xlsx)
              </a>
            </div>
            <div>
              <Label className="text-sm mb-1 block">เลือกไฟล์ Excel</Label>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }}
                data-testid="input-import-file"
              />
            </div>
            {importResult && (
              <div className={`border rounded-lg p-3 ${importResult.errors?.length > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                <p className="text-sm font-medium">{importResult.message}</p>
                {importResult.created > 0 && <p className="text-xs text-muted-foreground mt-1">สร้างใหม่: {importResult.created} รายการ</p>}
                {importResult.updated > 0 && <p className="text-xs text-muted-foreground">อัปเดต: {importResult.updated} รายการ</p>}
                {importResult.skipped > 0 && <p className="text-xs text-muted-foreground">ข้าม: {importResult.skipped} รายการ</p>}
                {importResult.errors?.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    {importResult.errors.map((err: any, i: number) => (
                      <p key={i} className="text-xs text-red-600">แถว {err.row}: {err.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>ปิด</Button>
            <Button
              style={{ background: "#539BFF" }}
              disabled={!importFile || importMutation.isPending}
              onClick={() => importFile && importMutation.mutate(importFile)}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              นำเข้าข้อมูล
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={csvImportOpen} onOpenChange={(o) => { setCsvImportOpen(o); if (!o) { setCsvFile(null); setCsvPreview(null); setCsvResult(null); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle>นำเข้าใบแจ้งหนี้จากโปรแกรมเก่า (CSV)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">อัปโหลดไฟล์ CSV ที่ export จากโปรแกรมเก่า ระบบจะจับคู่ชื่อลูกค้ากับรายชื่อในระบบ แล้วสร้างใบแจ้งหนี้ให้อัตโนมัติ</p>
              <p className="text-xs text-green-600 mt-1">รองรับคอลัมน์: วันที่, ครบกำหนด, อักษรนำ, เลขที่ใบกำกับภาษี, คู่ค้า, ที่อยู่, ยอดรวม (รวม VAT แล้ว)</p>
            </div>
            <div>
              <Label className="text-sm mb-1 block">เลือกไฟล์ CSV</Label>
              <input
                ref={csvFileRef}
                type="file"
                accept=".csv"
                className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
                onChange={(e) => { const f = e.target.files?.[0] || null; setCsvFile(f); setCsvPreview(null); setCsvResult(null); if (f) csvPreviewMutation.mutate(f); }}
                data-testid="input-csv-file"
              />
            </div>

            {csvPreviewMutation.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> กำลังอ่านไฟล์...
              </div>
            )}

            {csvPreview && !csvResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold">{csvPreview.total}</p>
                    <p className="text-xs text-muted-foreground">ทั้งหมด</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-green-600">{csvPreview.matched}</p>
                    <p className="text-xs text-muted-foreground">จับคู่ได้</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-amber-600">{csvPreview.unmatched}</p>
                    <p className="text-xs text-muted-foreground">จับคู่ไม่ได้</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-2 text-center">
                    <p className="text-lg font-bold text-blue-600">{fmt(csvPreview.totalAmount || 0)}</p>
                    <p className="text-xs text-muted-foreground">ยอดรวม (บาท)</p>
                  </div>
                </div>

                {csvPreview.parseErrorCount > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2">
                    <p className="text-xs font-medium text-red-800 mb-1">แถวที่อ่านไม่ได้ (ข้าม {csvPreview.parseErrorCount} แถว):</p>
                    <div className="max-h-20 overflow-y-auto space-y-0.5">
                      {csvPreview.parseErrors?.map((r: any, i: number) => (
                        <p key={i} className="text-xs text-red-600">แถว {r.row}: {r.name} — {r.message}</p>
                      ))}
                    </div>
                  </div>
                )}

                {csvPreview.unmatched > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <p className="text-xs font-medium text-amber-800 mb-1">ลูกค้าที่จับคู่ไม่ได้ (จะสร้างใบแจ้งหนี้โดยไม่ลิงก์กับลูกค้า):</p>
                    <div className="max-h-24 overflow-y-auto space-y-0.5">
                      {csvPreview.unmatchedRows?.map((r: any, i: number) => (
                        <p key={i} className="text-xs text-amber-700">• {r.name} — {fmt(r.total)} บาท</p>
                      ))}
                      {csvPreview.unmatched > 20 && <p className="text-xs text-amber-600">...และอีก {csvPreview.unmatched - 20} รายการ</p>}
                    </div>
                  </div>
                )}

                {csvPreview.matchedRows?.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                    <p className="text-xs font-medium text-green-800 mb-1">ตัวอย่างลูกค้าที่จับคู่ได้:</p>
                    <div className="max-h-24 overflow-y-auto space-y-0.5">
                      {csvPreview.matchedRows.slice(0, 10).map((r: any, i: number) => (
                        <p key={i} className="text-xs text-green-700">• {r.name} → {r.firmClientName} — {fmt(r.total)} บาท</p>
                      ))}
                    </div>
                  </div>
                )}

                {csvPreview.matched > 0 && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2">
                    <Checkbox
                      id="csv-update-fees"
                      checked={csvUpdateFees}
                      onCheckedChange={(v) => setCsvUpdateFees(!!v)}
                      data-testid="checkbox-update-fees"
                    />
                    <label htmlFor="csv-update-fees" className="text-xs text-blue-800 cursor-pointer">
                      อัปเดตค่าบริการในระบบตามยอดในไฟล์ (ลูกค้าที่จับคู่ได้ {csvPreview.matched} ราย) — เพื่อให้เดือนถัดไปออกใบแจ้งหนี้อัตโนมัติได้ตามยอดนี้
                    </label>
                  </div>
                )}
              </div>
            )}

            {csvResult && (
              <div className={`border rounded-lg p-3 ${csvResult.errors?.length > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
                <p className="text-sm font-medium">นำเข้าเรียบร้อย!</p>
                <p className="text-xs text-muted-foreground mt-1">สร้างใหม่: {csvResult.created} ใบ</p>
                {csvResult.skipped > 0 && <p className="text-xs text-muted-foreground">ข้าม (ซ้ำ): {csvResult.skipped} ใบ</p>}
                {csvResult.feesUpdated > 0 && <p className="text-xs text-muted-foreground text-blue-600">อัปเดตค่าบริการ: {csvResult.feesUpdated} ราย</p>}
                <p className="text-xs text-muted-foreground">จับคู่ลูกค้าได้: {csvResult.matched} | ไม่ได้: {csvResult.unmatched}</p>
                {csvResult.errors?.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    {csvResult.errors.map((err: any, i: number) => (
                      <p key={i} className="text-xs text-red-600">แถว {err.row}: {err.name} - {err.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvImportOpen(false)}>ปิด</Button>
            {csvPreview && !csvResult && (
              <Button
                style={{ background: "#05b187" }}
                disabled={csvConfirmMutation.isPending || !csvFile}
                onClick={() => csvFile && csvConfirmMutation.mutate(csvFile)}
                data-testid="button-confirm-csv-import"
              >
                {csvConfirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                ยืนยันนำเข้า {csvPreview.total} ใบ
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </Layout>
  );
}
