import { useState, useEffect, useRef } from "react";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Edit2, Trash2, Settings2, Loader2, Check, X, FileSpreadsheet, Upload, Download, AlertTriangle } from "lucide-react";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest } from "@/lib/queryClient";

interface Account {
  id: number;
  companyId: number;
  code: string;
  name: string;
  nameTh: string | null;
  nameZh: string | null;
  type: string;
  parentCode: string | null;
  isHeader: boolean;
  active: boolean;
}

const ACCOUNT_TYPES = [
  { value: "asset", label: "สินทรัพย์ (Asset)" },
  { value: "liability", label: "หนี้สิน (Liability)" },
  { value: "equity", label: "ส่วนของเจ้าของ (Equity)" },
  { value: "revenue", label: "รายได้ (Revenue)" },
  { value: "expense", label: "ค่าใช้จ่าย (Expense)" },
];

const typeColors: Record<string, string> = {
  asset: "bg-blue-100 text-blue-700",
  liability: "bg-red-100 text-red-700",
  equity: "bg-purple-100 text-purple-700",
  revenue: "bg-green-100 text-green-700",
  expense: "bg-amber-100 text-amber-700",
};

const typeLabels: Record<string, string> = {
  asset: "สินทรัพย์",
  liability: "หนี้สิน",
  equity: "ส่วนของเจ้าของ",
  revenue: "รายได้",
  expense: "ค่าใช้จ่าย",
};

const emptyForm = { code: "", name: "", nameTh: "", type: "asset", parentCode: "", isHeader: false };

export default function ChartOfAccounts() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const { acctName } = useLanguage();
  const [accts, setAccts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [showMappingDialog, setShowMappingDialog] = useState(false);
  const [mappingData, setMappingData] = useState<any>(null);
  const [mappingSelections, setMappingSelections] = useState<Record<string, string>>({});
  const [applyingMapping, setApplyingMapping] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAccounts = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts?companyId=${companyId}`, { credentials: "include" });
      if (res.ok) setAccts(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchAccounts(); }, [companyId]);

  const filtered = accts.filter(a => {
    const term = search.toLowerCase();
    const matchSearch = !term || a.code.toLowerCase().includes(term) || a.name.toLowerCase().includes(term) || (a.nameTh || "").toLowerCase().includes(term);
    const matchType = filterType === "all" || a.type === filterType;
    return matchSearch && matchType;
  });

  const sorted = [...filtered].sort((a, b) => a.code.localeCompare(b.code));

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (acc: Account) => {
    setEditingId(acc.id);
    setForm({ code: acc.code, name: acc.name, nameTh: acc.nameTh || "", type: acc.type, parentCode: acc.parentCode || "", isHeader: acc.isHeader });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.name || !form.type) {
      toast({ title: "กรุณากรอกข้อมูลให้ครบ", description: "รหัสบัญชี, ชื่ออังกฤษ, และประเภทจำเป็น", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/accounts/${editingId}` : "/api/accounts";
      const method = editingId ? "PATCH" : "POST";
      const body = editingId
        ? { code: form.code, name: form.name, nameTh: form.nameTh || null, type: form.type, parentCode: form.parentCode || null, isHeader: form.isHeader }
        : { companyId, code: form.code, name: form.name, nameTh: form.nameTh || null, type: form.type, parentCode: form.parentCode || null, isHeader: form.isHeader };
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (res.ok) {
        toast({ title: editingId ? "แก้ไขบัญชีสำเร็จ" : "เพิ่มบัญชีสำเร็จ", variant: "success" as any });
        setDialogOpen(false);
        fetchAccounts();
      } else {
        const err = await res.json();
        toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("ต้องการลบบัญชีนี้หรือไม่?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/accounts/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast({ title: "ลบบัญชีสำเร็จ", variant: "success" as any });
        fetchAccounts();
      } else {
        const err = await res.json();
        toast({ title: "ไม่สามารถลบได้", description: err.message, variant: "destructive" });
      }
    } catch {}
    setDeleting(null);
  };

  const handleExport = async () => {
    if (!companyId) { toast({ title: "กรุณาเลือกบริษัทก่อน", variant: "destructive" }); return; }
    try {
      const res = await fetch(`/api/accounts/export?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "chart_of_accounts_export.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Export ไม่สำเร็จ", variant: "destructive" });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch("/api/accounts/import/template");
      if (!res.ok) throw new Error("template failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "template_chart_of_accounts.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "ดาวน์โหลด template ไม่สำเร็จ", variant: "destructive" });
    }
  };

  const handleSeedStandard = async () => {
    if (!companyId) { toast({ title: "กรุณาเลือกบริษัทก่อน", variant: "destructive" }); return; }
    setSeeding(true);
    try {
      const res = await apiRequest("POST", "/api/accounts/seed-standard", { companyId });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `สร้างผังบัญชีมาตรฐานสำเร็จ ${data.count} รายการ` });
        fetchAccounts();
      } else {
        toast({ title: data.message || "เกิดข้อผิดพลาด", variant: "destructive" });
      }
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
    setSeeding(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!companyId) { toast({ title: "กรุณาเลือกบริษัทก่อน", variant: "destructive" }); return; }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", String(companyId));
    try {
      const res = await fetch("/api/accounts/import/preview", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "เกิดข้อผิดพลาด", description: data.message, variant: "destructive" });
        return;
      }
      setImportPreview(data);
      setShowImportDialog(true);
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถอ่านไฟล์ได้", variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const checkFormulaMapping = async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`/api/accounts/check-formula-codes?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.hasMissingCodes && data.missingCodes.length > 0) {
        setMappingData(data);
        const initial: Record<string, string> = {};
        data.missingCodes.forEach((m: any) => { initial[m.accountCode] = ""; });
        setMappingSelections(initial);
        setShowMappingDialog(true);
      }
    } catch {}
  };

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    const validItems = importPreview.preview.filter((p: any) => p.valid).map((p: any) => p.data);
    if (validItems.length === 0) {
      toast({ title: "ไม่มีรายการที่ถูกต้อง", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const res = await apiRequest("POST", "/api/accounts/import/confirm", {
        companyId,
        items: validItems,
      });
      const data = await res.json();
      toast({ title: `นำเข้าสำเร็จ ${data.created} รายการ` });
      fetchAccounts();
      setShowImportDialog(false);
      setImportPreview(null);
      setTimeout(() => checkFormulaMapping(), 500);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleApplyMapping = async () => {
    if (!mappingData) return;
    const unmapped = Object.entries(mappingSelections).filter(([_, v]) => !v);
    if (unmapped.length > 0) {
      toast({ title: `ยังมี ${unmapped.length} รายการที่ยังไม่ได้เลือกบัญชีแทนที่`, description: "กรุณาเลือกบัญชีให้ครบทุกรายการ", variant: "destructive" });
      return;
    }
    const mappings = Object.entries(mappingSelections)
      .filter(([_, newCode]) => newCode)
      .map(([oldCode, newCode]) => ({ oldCode, newCode }));
    setApplyingMapping(true);
    try {
      const res = await apiRequest("POST", "/api/accounts/apply-formula-mappings", {
        companyId,
        mappings,
      });
      const data = await res.json();
      toast({ title: `ปรับสูตรบัญชีสำเร็จ ${data.updated} รายการ` });
      setShowMappingDialog(false);
      setMappingData(null);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setApplyingMapping(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Settings2 className="h-4 w-4" />
          <span>บัญชี</span>
          <span>/</span>
          <span className="text-foreground font-medium">ผังบัญชี</span>
        </div>

        <Card className="shadow-sm bg-white">
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  data-testid="input-search-coa"
                  placeholder="ค้นหารหัสบัญชี, ชื่อบัญชี..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger data-testid="select-filter-type" className="w-[180px]">
                  <SelectValue placeholder="ทุกประเภท" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกประเภท</SelectItem>
                  {ACCOUNT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                {accts.length === 0 && !loading && (
                  <Button
                    size="sm"
                    className="h-9 text-xs bg-[#05b187] hover:bg-[#049a76] text-white"
                    data-testid="button-seed-standard-coa"
                    onClick={handleSeedStandard}
                    disabled={seeding}
                  >
                    {seeding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Settings2 className="h-4 w-4 mr-1" />}
                    ใช้ผังบัญชีมาตรฐาน
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs border-cyan-500 text-cyan-600 hover:bg-cyan-50"
                  data-testid="button-download-template-coa"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="h-4 w-4 mr-1" /> Template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 text-xs border-blue-500 text-blue-600 hover:bg-blue-50"
                  data-testid="button-import-coa"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" /> นำเข้า
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-[#05b187] text-white hover:bg-[#049a75] border-none h-9 text-xs"
                  data-testid="button-export-coa"
                  onClick={handleExport}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> ส่งออก Excel
                </Button>
                <Button data-testid="button-add-account" onClick={openAdd} className="bg-[#fb9678] hover:bg-[#e8734e] text-white h-9">
                  <Plus className="h-4 w-4 mr-1" /> เพิ่มบัญชีใหม่
                </Button>
              </div>
            </div>

            <div className="text-xs text-slate-400">
              แสดง {sorted.length} จาก {accts.length} บัญชี
            </div>
          </div>

          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-[#fb9678]" />
                <span className="ml-2 text-sm text-slate-500">กำลังโหลด...</span>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)]">
                    <TableHead className="text-white text-sm font-bold w-[120px]">รหัสบัญชี</TableHead>
                    <TableHead className="text-white text-sm font-bold">ชื่อบัญชี (English)</TableHead>
                    <TableHead className="text-white text-sm font-bold">ชื่อบัญชี (ไทย)</TableHead>
                    <TableHead className="text-white text-sm font-bold w-[140px]">ประเภท</TableHead>
                    <TableHead className="text-white text-sm font-bold w-[100px]">Parent</TableHead>
                    <TableHead className="text-white text-sm font-bold w-[60px] text-center">สถานะ</TableHead>
                    <TableHead className="text-white text-sm font-bold w-[90px] text-center">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-slate-400 text-sm">
                        {accts.length === 0 ? "ยังไม่มีผังบัญชี" : "ไม่พบบัญชีที่ค้นหา"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    sorted.map(acc => (
                      <TableRow key={acc.id} className="hover:bg-orange-50/30" data-testid={`row-account-${acc.id}`}>
                        <TableCell className="text-sm font-mono font-medium">{acc.code}</TableCell>
                        <TableCell className="text-sm">
                          <span className={acc.isHeader ? "font-bold" : ""}>{acc.name}</span>
                          {acc.isHeader && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">บัญชีคุม</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className={acc.isHeader ? "font-bold" : ""}>{acc.nameTh || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[acc.type] || "bg-gray-100 text-gray-600"}`}>
                            {typeLabels[acc.type] || acc.type}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-400 font-mono">{acc.parentCode || "-"}</TableCell>
                        <TableCell className="text-center">
                          {acc.active ? (
                            <Check className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <X className="h-4 w-4 text-red-400 mx-auto" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              data-testid={`button-edit-account-${acc.id}`}
                              variant="ghost" size="icon" className="h-7 w-7 text-[#fb9678] hover:bg-[#fb9678]/10"
                              onClick={() => openEdit(acc)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              data-testid={`button-delete-account-${acc.id}`}
                              variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:bg-red-50"
                              onClick={() => handleDelete(acc.id)}
                              disabled={deleting === acc.id}
                            >
                              {deleting === acc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" data-testid="dialog-account-form">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#fb9678]/10">
                <Settings2 className="w-4 h-4 text-[#fb9678]" />
              </div>
              {editingId ? "แก้ไขบัญชี" : "เพิ่มบัญชีใหม่"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-slate-500">รหัสบัญชี *</Label>
              <Input data-testid="input-account-code" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="เช่น 1110, 5100" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">ชื่อบัญชี (English) *</Label>
              <Input data-testid="input-account-name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="เช่น Cash, Sales Revenue" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">ชื่อบัญชี (ไทย)</Label>
              <Input data-testid="input-account-name-th" value={form.nameTh} onChange={e => setForm(p => ({ ...p, nameTh: e.target.value }))} placeholder="เช่น เงินสด, รายได้จากการขาย" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">ประเภทบัญชี *</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger data-testid="select-account-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Parent Code</Label>
              <Input data-testid="input-parent-code" value={form.parentCode} onChange={e => setForm(p => ({ ...p, parentCode: e.target.value }))} placeholder="รหัสบัญชีหลัก (ถ้ามี)" />
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="checkbox"
                id="isHeader"
                checked={form.isHeader}
                onChange={e => setForm(p => ({ ...p, isHeader: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-[#fb9678] focus:ring-[#fb9678]"
                data-testid="checkbox-is-header"
              />
              <label htmlFor="isHeader" className="text-sm cursor-pointer">
                <span className="font-medium">บัญชีคุม (Header)</span>
                <span className="text-xs text-muted-foreground ml-1">— ใช้เป็นหัวหมวดเท่านั้น ไม่สามารถลงบัญชีได้</span>
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-300">ยกเลิก</Button>
            <Button data-testid="button-save-account" onClick={handleSave} disabled={saving} className="bg-[#fb9678] hover:bg-[#e8734e] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingId ? "บันทึก" : "เพิ่มบัญชี"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ตรวจสอบข้อมูลนำเข้าผังบัญชี</DialogTitle>
          </DialogHeader>
          {importPreview && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span>ทั้งหมด: <strong>{importPreview.total}</strong> รายการ</span>
                <span className="text-green-600">ถูกต้อง: <strong>{importPreview.valid}</strong></span>
                <span className="text-red-600">มีปัญหา: <strong>{importPreview.invalid}</strong></span>
              </div>
              <div className="overflow-x-auto border rounded">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-100">
                      <TableHead className="text-xs w-12">#</TableHead>
                      <TableHead className="text-xs w-12">สถานะ</TableHead>
                      <TableHead className="text-xs">รหัส</TableHead>
                      <TableHead className="text-xs">ชื่อ (EN)</TableHead>
                      <TableHead className="text-xs">ชื่อ (TH)</TableHead>
                      <TableHead className="text-xs">ประเภท</TableHead>
                      <TableHead className="text-xs">ปัญหา</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.preview.map((item: any) => (
                      <TableRow key={item.row} className={item.valid ? "" : "bg-red-50"}>
                        <TableCell className="text-xs">{item.row}</TableCell>
                        <TableCell>
                          {item.valid ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{item.data.code || "-"}</TableCell>
                        <TableCell className="text-xs">{item.data.name || "-"}</TableCell>
                        <TableCell className="text-xs">{item.data.nameTh || "-"}</TableCell>
                        <TableCell className="text-xs">
                          {item.data.type ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${typeColors[item.data.type] || ""}`}>
                              {typeLabels[item.data.type] || item.data.type}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell className="text-xs text-red-600">{item.issues.join(", ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setImportPreview(null); }} data-testid="button-import-cancel-coa">
              ยกเลิก
            </Button>
            <Button
              className="bg-[#fb9678] hover:bg-[#e8734e]"
              onClick={handleImportConfirm}
              disabled={importing || !importPreview?.valid}
              data-testid="button-import-confirm-coa"
            >
              {importing ? "กำลังนำเข้า..." : `นำเข้า ${importPreview?.valid || 0} รายการ`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMappingDialog} onOpenChange={setShowMappingDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              ปรับสูตรบัญชีอัตโนมัติ
            </DialogTitle>
          </DialogHeader>
          {mappingData && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
                พบรหัสบัญชี <strong>{mappingData.missingCodes.length}</strong> รายการที่สูตรบันทึกบัญชีอัตโนมัติอ้างอิงอยู่ แต่ไม่มีในผังบัญชีปัจจุบัน
                กรุณาเลือกบัญชีในผังใหม่ที่จะใช้แทนที่
              </div>

              <div className="space-y-3">
                {mappingData.missingCodes.map((item: any) => (
                  <div key={item.accountCode} className="border rounded p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-red-600">{item.accountCode}</span>
                      <span className="text-sm">{item.accountName}</span>
                      <span className="text-xs text-slate-400 ml-auto">ใช้ใน: {item.formulaName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-20">แทนที่ด้วย:</span>
                      <Select
                        value={mappingSelections[item.accountCode] || ""}
                        onValueChange={(v) => setMappingSelections(prev => ({ ...prev, [item.accountCode]: v }))}
                      >
                        <SelectTrigger className="flex-1 h-8 text-xs" data-testid={`select-mapping-${item.accountCode}`}>
                          <SelectValue placeholder="เลือกบัญชีแทนที่..." />
                        </SelectTrigger>
                        <SelectContent>
                          {mappingData.availableAccounts.map((acc: any) => (
                            <SelectItem key={acc.code} value={acc.code}>
                              <span className="font-mono">{acc.code}</span> - {acctName(acc)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowMappingDialog(false); setMappingData(null); }} data-testid="button-mapping-skip">
              ข้ามไปก่อน
            </Button>
            <Button
              className="bg-[#fb9678] hover:bg-[#e8734e]"
              onClick={handleApplyMapping}
              disabled={applyingMapping}
              data-testid="button-mapping-apply"
            >
              {applyingMapping ? "กำลังปรับสูตร..." : "บันทึกการเปลี่ยนแปลง"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
