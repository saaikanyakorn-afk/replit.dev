import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Warehouse, Search, Plus, FileSpreadsheet, Upload, Download, X, Check, AlertTriangle, Settings, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCompany } from "@/lib/company-context";
import { formatDate, formatNumber } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, downloadFile } from "@/lib/queryClient";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import { toLocalDateStr } from "@/lib/utils";

const CATEGORY_NAMES: Record<string, string> = {
  "1401": "ที่ดิน",
  "1411": "อาคาร",
  "1421": "ส่วนต่อเติมอาคาร",
  "1422": "ส่วนต่อเติมอาคารระหว่างทำ",
  "1431": "เครื่องตกแต่งและติดตั้ง",
  "1441": "อุปกรณ์สำนักงาน",
  "1451": "ยานพาหนะ",
  "1461": "อุปกรณ์คอมพิวเตอร์",
  "1501": "สินทรัพย์ไม่มีตัวตน",
  "1402": "งานระหว่างก่อสร้าง",
};

export default function AssetRegistry() {
  const [, navigate] = useLocation();
  const { selectedCompanyId } = useCompany();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [thresholdInput, setThresholdInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { dateEra, dateFmt } = useDateSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: assetSettings } = useQuery<{ assetMinThreshold: string }>({
    queryKey: ["/api/asset-settings", selectedCompanyId],
    queryFn: () => fetch(`/api/asset-settings?companyId=${selectedCompanyId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedCompanyId,
  });

  const handleOpenSettings = () => {
    setThresholdInput(assetSettings?.assetMinThreshold || "0");
    setShowSettingsDialog(true);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await apiRequest("PATCH", "/api/asset-settings", {
        companyId: selectedCompanyId,
        assetMinThreshold: thresholdInput || "0",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/asset-settings"] });
      toast({ title: "บันทึกการตั้งค่าสำเร็จ", variant: "success" as any });
      setShowSettingsDialog(false);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  const { data: assets = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/fixed-assets", selectedCompanyId],
    queryFn: () => fetch(`/api/fixed-assets?companyId=${selectedCompanyId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedCompanyId,
  });

  const filtered = assets.filter((a: any) => {
    const matchSearch = !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.assetCode?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "all" || a.categoryAccountCode === categoryFilter;
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const matchDateFrom = !dateFrom || (a.purchaseDate && a.purchaseDate >= dateFrom);
    const matchDateTo = !dateTo || (a.purchaseDate && a.purchaseDate <= dateTo);
    return matchSearch && matchCategory && matchStatus && matchDateFrom && matchDateTo;
  });

  const handleExport = async () => {
    try { await downloadFile(`/api/fixed-assets/export?companyId=${selectedCompanyId}`, "fixed_assets_export.xlsx"); }
    catch { toast({ title: "Export ไม่สำเร็จ", variant: "destructive" }); }
  };

  const handleDownloadTemplate = async () => {
    try { await downloadFile("/api/fixed-assets/import/template", "template_fixed_assets.xlsx"); }
    catch { toast({ title: "ดาวน์โหลด template ไม่สำเร็จ", variant: "destructive" }); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", String(selectedCompanyId));
    try {
      const res = await fetch("/api/fixed-assets/import/preview", {
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

  const handleImportConfirm = async () => {
    if (!importPreview) return;
    const validItems = importPreview.preview.filter((p: any) => p.valid).map((p: any) => p.data);
    if (validItems.length === 0) {
      toast({ title: "ไม่มีรายการที่ถูกต้อง", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const res = await apiRequest("POST", "/api/fixed-assets/import/confirm", {
        companyId: selectedCompanyId,
        items: validItems,
      });
      const data = await res.json();
      toast({ title: `นำเข้าสำเร็จ ${data.created} รายการ` });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets"] });
      setShowImportDialog(false);
      setImportPreview(null);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteOne = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("ต้องการลบสินทรัพย์รายการนี้ใช่หรือไม่?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/fixed-assets/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: "ลบไม่สำเร็จ", description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: "ลบสินทรัพย์สำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets"] });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    setDeletingAll(true);
    try {
      const res = await fetch(`/api/fixed-assets/bulk/by-company?companyId=${selectedCompanyId}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "ลบไม่สำเร็จ", description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: `ลบสินทรัพย์ทั้งหมด ${data.deleted} รายการสำเร็จ` });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets"] });
      setShowDeleteAllDialog(false);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Warehouse className="h-4 w-4" />
            <h1 className="text-xl font-heading font-bold text-foreground" data-testid="text-page-title">รายการสินทรัพย์</h1>
            <span className="text-xs">ทะเบียนสินทรัพย์</span>
          </div>
          <div className="flex items-center gap-2">
            {parseFloat(assetSettings?.assetMinThreshold || "0") > 0 && (
              <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
                ขั้นต่ำค่าเสื่อม: {parseFloat(assetSettings?.assetMinThreshold || "0").toLocaleString("th-TH")} บาท
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={handleOpenSettings}
              data-testid="button-asset-settings"
            >
              <Settings className="h-4 w-4 mr-1" /> ตั้งค่า
            </Button>
          </div>
        </div>

        <Card className="rounded-none shadow-sm border-t-4 border-t-[var(--theme-primary)]">
          <CardHeader className="p-4 space-y-4 bg-white">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Input
                  data-testid="input-search"
                  placeholder="ค้นหาชื่อ/รหัสสินทรัพย์..."
                  className="h-9 pr-10 rounded-none border-slate-200"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Button size="sm" className="absolute right-0 top-0 h-9 bg-lime-500 hover:bg-lime-600 rounded-none px-4" data-testid="button-search">
                  ค้นหา <Search className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-8 w-44 text-xs rounded-sm" data-testid="select-category-filter">
                    <SelectValue placeholder="หมวดหมู่ทั้งหมด" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">หมวดหมู่ทั้งหมด</SelectItem>
                    {Object.entries(CATEGORY_NAMES).map(([code, name]) => (
                      <SelectItem key={code} value={code}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-36 text-xs rounded-sm" data-testid="select-status-filter">
                    <SelectValue placeholder="สถานะทั้งหมด" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">สถานะทั้งหมด</SelectItem>
                    <SelectItem value="active">ใช้งาน</SelectItem>
                    <SelectItem value="disposed">จำหน่ายแล้ว</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">วันที่ซื้อ</span>
                  <ThaiDateInput value={dateFrom} onChange={setDateFrom} dateEra={dateEra} dateFormat={dateFmt} className="h-8 w-36 text-xs rounded-sm" data-testid="input-date-from" />
                  <span className="text-xs text-muted-foreground">ถึง</span>
                  <ThaiDateInput value={dateTo} onChange={setDateTo} dateEra={dateEra} dateFormat={dateFmt} className="h-8 w-36 text-xs rounded-sm" data-testid="input-date-to" />
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-cyan-500 text-cyan-600 hover:bg-cyan-50"
                  data-testid="button-download-template"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="h-4 w-4 mr-1" /> Template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-blue-500 text-blue-600 hover:bg-blue-50"
                  data-testid="button-import"
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
                  className="bg-[#fb9678] text-white hover:bg-[#e8856a] border-none h-8 text-xs"
                  data-testid="button-export-excel"
                  onClick={handleExport}
                >
                  <FileSpreadsheet className="h-4 w-4 mr-1" /> ส่งออก Excel
                </Button>
                {assets.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-400 text-red-500 hover:bg-red-50 h-8 text-xs"
                    data-testid="button-delete-all"
                    onClick={() => setShowDeleteAllDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> ลบทั้งหมด ({assets.length})
                  </Button>
                )}
                <Button
                  size="sm"
                  style={{ background: "var(--theme-primary)" }} className="hover:opacity-90 text-white h-8 text-xs"
                  data-testid="button-add-asset"
                  onClick={() => navigate("/assets/form")}
                >
                  <Plus className="h-4 w-4 mr-1" /> เพิ่มรายการสินทรัพย์
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader style={{ background: "var(--theme-table-header)" }}>
                <TableRow className="hover:bg-transparent border-none h-10">
                  <TableHead className="text-white text-[11px] font-normal text-center">รหัส</TableHead>
                  <TableHead className="text-white text-[11px] font-normal">ชื่อสินทรัพย์</TableHead>
                  <TableHead className="text-white text-[11px] font-normal text-center">หมวดหมู่</TableHead>
                  <TableHead className="text-white text-[11px] font-normal text-center">วันที่ซื้อ</TableHead>
                  <TableHead className="text-white text-[11px] font-normal text-right">ราคาทุน</TableHead>
                  <TableHead className="text-white text-[11px] font-normal text-right">ค่าเสื่อมสะสม</TableHead>
                  <TableHead className="text-white text-[11px] font-normal text-right">มูลค่าสุทธิ</TableHead>
                  <TableHead className="text-white text-[11px] font-normal text-center">สถานะ</TableHead>
                  <TableHead className="text-white text-[11px] font-normal text-center w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground">กำลังโหลด...</TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-sm text-muted-foreground" data-testid="text-empty-state">
                      {assets.length === 0 ? "ยังไม่มีสินทรัพย์ กดปุ่ม \"เพิ่มรายการสินทรัพย์\" เพื่อเริ่มต้น" : "ไม่พบรายการที่ตรงกับตัวกรอง"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((asset: any) => (
                    <TableRow
                      key={asset.id}
                      className="hover:bg-slate-50 border-b h-12 cursor-pointer"
                      data-testid={`row-asset-${asset.id}`}
                      onClick={() => navigate(`/assets/form/${asset.id}`)}
                    >
                      <TableCell className="text-[11px] text-center" style={{ color: "var(--theme-primary)" }} data-testid={`text-code-${asset.id}`}>
                        {asset.assetCode}
                      </TableCell>
                      <TableCell className="text-[11px]" data-testid={`text-name-${asset.id}`}>{asset.name}</TableCell>
                      <TableCell className="text-[11px] text-center" data-testid={`text-category-${asset.id}`}>
                        {CATEGORY_NAMES[asset.categoryAccountCode] || asset.categoryAccountCode}
                      </TableCell>
                      <TableCell className="text-[11px] text-center" data-testid={`text-date-${asset.id}`}>
                        {formatDate(asset.purchaseDate, dateEra, dateFmt)}
                      </TableCell>
                      <TableCell className="text-[11px] text-right" data-testid={`text-cost-${asset.id}`}>
                        {formatNumber(asset.cost)}
                      </TableCell>
                      <TableCell className="text-[11px] text-right" data-testid={`text-accum-${asset.id}`}>
                        {formatNumber(asset.accumDepreciation)}
                      </TableCell>
                      <TableCell className="text-[11px] text-right" data-testid={`text-nbv-${asset.id}`}>
                        {formatNumber(asset.netBookValue)}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`text-status-${asset.id}`}>
                        {asset.status === "active" ? (
                          <Badge className="bg-lime-500 text-white hover:bg-lime-600 text-[9px] font-normal px-2 py-0">ใช้งาน</Badge>
                        ) : (
                          <Badge className="bg-gray-400 text-white hover:bg-gray-500 text-[9px] font-normal px-2 py-0">จำหน่ายแล้ว</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                          data-testid={`button-delete-${asset.id}`}
                          disabled={deletingId === asset.id}
                          onClick={(e) => handleDeleteOne(asset.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ตรวจสอบข้อมูลนำเข้าสินทรัพย์</DialogTitle>
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
                      <TableHead className="text-xs">สถานะ</TableHead>
                      <TableHead className="text-xs">รหัส</TableHead>
                      <TableHead className="text-xs">ชื่อ</TableHead>
                      <TableHead className="text-xs">หมวดหมู่</TableHead>
                      <TableHead className="text-xs text-right">ราคาทุน</TableHead>
                      <TableHead className="text-xs text-right">เสื่อมสะสม</TableHead>
                      <TableHead className="text-xs text-right">มูลค่าสุทธิ</TableHead>
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
                        <TableCell className="text-xs">{item.data.assetCode || "-"}</TableCell>
                        <TableCell className="text-xs">{item.data.name || "-"}</TableCell>
                        <TableCell className="text-xs">{item.data.categoryName || "-"}</TableCell>
                        <TableCell className="text-xs text-right">{formatNumber(item.data.cost)}</TableCell>
                        <TableCell className="text-xs text-right">{formatNumber(item.data.accumDepreciation)}</TableCell>
                        <TableCell className="text-xs text-right">{formatNumber(item.data.netBookValue)}</TableCell>
                        <TableCell className="text-xs text-red-600">{item.issues.join(", ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setImportPreview(null); }} data-testid="button-import-cancel">
              ยกเลิก
            </Button>
            <Button
              style={{ background: "var(--theme-primary)" }} className="hover:opacity-90 text-white"
              onClick={handleImportConfirm}
              disabled={importing || !importPreview?.valid}
              data-testid="button-import-confirm"
            >
              {importing ? "กำลังนำเข้า..." : `นำเข้า ${importPreview?.valid || 0} รายการ`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-[var(--theme-primary)]" />
              ตั้งค่าทะเบียนทรัพย์สิน
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">ราคาขั้นต่ำทรัพย์สินที่จะคิดค่าเสื่อมราคา (บาท)</label>
              <p className="text-xs text-slate-500 mb-2">
                หากรายจ่ายที่เลือกเป็นสินทรัพย์มีราคาไม่ถึงจำนวนนี้ ระบบจะแจ้งเตือนให้ย้ายไปบันทึกเป็นค่าใช้จ่ายแทน
              </p>
              <Input
                data-testid="input-asset-min-threshold"
                type="number"
                min="0"
                step="100"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="h-9"
                placeholder="เช่น 5000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>ยกเลิก</Button>
            <Button
              style={{ background: "var(--theme-primary)" }} className="hover:opacity-90 text-white"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              data-testid="button-save-asset-settings"
            >
              {savingSettings ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteAllDialog} onOpenChange={setShowDeleteAllDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              ลบสินทรัพย์ทั้งหมด
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">คุณต้องการลบสินทรัพย์ <strong className="text-red-600">{assets.length} รายการ</strong> ทั้งหมดใช่หรือไม่?</p>
            <p className="text-xs text-red-500">การลบจะไม่สามารถกู้คืนได้ กรุณาตรวจสอบให้แน่ใจก่อนยืนยัน</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteAllDialog(false)} disabled={deletingAll}>ยกเลิก</Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={handleDeleteAll}
              disabled={deletingAll}
              data-testid="button-confirm-delete-all"
            >
              {deletingAll ? "กำลังลบ..." : `ยืนยันลบทั้งหมด ${assets.length} รายการ`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
