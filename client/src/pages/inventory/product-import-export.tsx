import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, FileDown, FileSpreadsheet, CheckCircle2, XCircle, AlertCircle, ArrowLeft, Package, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import ImportBatchHistory from "@/components/import-batch-history";
import { downloadFile } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Product } from "@shared/schema";

const FALLBACK_CATEGORIES = [
  { value: "product", label: "สินค้า" },
  { value: "service", label: "บริการ" },
  { value: "raw_material", label: "วัตถุดิบ" },
  { value: "consumable", label: "วัสดุสิ้นเปลือง" },
];

export default function ProductImportExport(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }>; basePath?: string } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const basePath = props.basePath || "/inventory";
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: dbCategories = [] } = useQuery<{ id: number; code: string; name: string; active: boolean }[]>({
    queryKey: ["/api/product-categories", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/product-categories?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });
  const CATEGORIES = dbCategories.length > 0
    ? dbCategories.filter(c => c.active).map(c => ({ value: c.code, label: c.name }))
    : FALLBACK_CATEGORIES;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"menu" | "preview" | "done" | "bundle-preview" | "bundle-done">("menu");
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [stockOpenDate, setStockOpenDate] = useState<string>("");
  const bundleFileRef = useRef<HTMLInputElement>(null);
  const [bundlePreview, setBundlePreview] = useState<any>(null);
  const [bundleResult, setBundleResult] = useState<any>(null);
  const [bundleImporting, setBundleImporting] = useState(false);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/products?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const activeProducts = products.filter(p => p.active);
  const categoryLabel = (c: string) => CATEGORIES.find(cat => cat.value === c)?.label || c;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", String(selectedCompanyId));
    try {
      const r = await fetch("/api/products/import/preview", { method: "POST", credentials: "include", body: formData });
      if (!r.ok) {
        const err = await r.json();
        if (err.isBundleFile) {
          toast({ title: "ไฟล์สินค้าจัดชุด", description: "ไฟล์นี้เป็นรูปแบบ Bundle — กำลังเปลี่ยนไปช่องนำเข้าจัดชุดให้อัตโนมัติ", variant: "default" });
          setTimeout(() => {
            const bundleSection = document.getElementById("bundle-import-section");
            if (bundleSection) bundleSection.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 300);
          return;
        }
        throw new Error(err.message);
      }
      const data = await r.json();
      setImportPreview(data);
      setStep("preview");
    } catch (err: any) {
      toast({ title: "อ่านไฟล์ไม่สำเร็จ", description: err.message, variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleImportExecute() {
    if (!importPreview) return;
    setImporting(true);
    try {
      const newItems = importPreview.preview.filter((p: any) => p.status === "ok" && !p.issues.some((i: string) => i.includes("มีในระบบแล้ว"))).map((p: any) => p.data);
      const existingItems = importPreview.preview.filter((p: any) => (p.status === "ok" || p.status === "duplicate") && p.issues.some((i: string) => i.includes("มีในระบบแล้ว"))).map((p: any) => p.data);

      const stockEntries: { code: string; warehouseName: string; stockQty: number }[] = [];
      if (importPreview.hasWarehouseCol) {
        for (const item of importPreview.preview) {
          if (item.status === "error") continue;
          const wh = item.data.warehouseName;
          const qty = Number(item.data.stockQty) || 0;
          if (wh && qty > 0) {
            stockEntries.push({ code: item.data.code, warehouseName: wh, stockQty: qty });
          }
        }
      }

      const r = await fetch("/api/products/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId: selectedCompanyId, products: newItems, updateProducts: existingItems, stockEntries, stockOpenDate: stockOpenDate || undefined }),
      });
      if (!r.ok) { const err = await r.json(); throw new Error(err.message); }
      const result = await r.json();
      setImportResult(result);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/stock-by-warehouse", selectedCompanyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
    } catch (err: any) {
      toast({ title: "นำเข้าไม่สำเร็จ", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  function resetImport() {
    setStep("menu");
    setImportPreview(null);
    setImportResult(null);
    setBundlePreview(null);
    setBundleResult(null);
    setStockOpenDate("");
  }

  async function handleBundleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyId", String(selectedCompanyId));
    try {
      const r = await fetch("/api/bundles/import/preview", { method: "POST", credentials: "include", body: formData });
      if (!r.ok) { const err = await r.json(); throw new Error(err.message); }
      const data = await r.json();
      setBundlePreview(data);
      setStep("bundle-preview");
    } catch (err: any) {
      toast({ title: "อ่านไฟล์ไม่สำเร็จ", description: err.message, variant: "destructive" });
    }
    if (bundleFileRef.current) bundleFileRef.current.value = "";
  }

  async function handleBundleExecute() {
    if (!bundlePreview) return;
    setBundleImporting(true);
    try {
      const validBundles = bundlePreview.bundles.filter((b: any) => b.status === "ok" || b.status === "update");
      const r = await fetch("/api/bundles/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId: selectedCompanyId, bundles: validBundles }),
      });
      if (!r.ok) { const err = await r.json(); throw new Error(err.message); }
      const result = await r.json();
      setBundleResult(result);
      setStep("bundle-done");
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    } catch (err: any) {
      toast({ title: "นำเข้าไม่สำเร็จ", description: err.message, variant: "destructive" });
    } finally {
      setBundleImporting(false);
    }
  }

  async function handleExport() {
    try {
      const r = await fetch(`/api/products/export?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) throw new Error("ส่งออกไม่สำเร็จ");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "products_export.xlsx"; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ส่งออกไฟล์ Excel เรียบร้อย" });
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    }
  }

  return (
    <LayoutComponent>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h1 data-testid="text-page-title" className="text-xl font-heading font-bold">นำเข้า/ส่งออก Excel สินค้า</h1>
        </div>

        <ImportBatchHistory docType="product" invalidateKeys={[["products"], ["/api/products"]]} />

        {step === "menu" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-2 hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-green-50">
                    <Download className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <h2 data-testid="text-export-title" className="text-lg font-bold">ส่งออก Excel</h2>
                    <p className="text-sm text-muted-foreground">ดาวน์โหลดรายการสินค้าทั้งหมดเป็นไฟล์ Excel</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">จำนวนสินค้าทั้งหมด</span>
                    <Badge data-testid="text-product-count" variant="secondary">{activeProducts.length} รายการ</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">สินค้า</span>
                    <span>{activeProducts.filter(p => p.category === "product").length} รายการ</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">บริการ</span>
                    <span>{activeProducts.filter(p => p.category === "service").length} รายการ</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">วัตถุดิบ/วัสดุ</span>
                    <span>{activeProducts.filter(p => p.category !== "product" && p.category !== "service").length} รายการ</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  คอลัมน์ที่ส่งออก: รหัสสินค้า, ชื่อสินค้า, ชื่ออังกฤษ, ชื่อจีน, หมวดหมู่, รายละเอียด, หน่วย, ราคาขาย, ต้นทุน, VAT, บาร์โค้ด, รหัสบัญชี
                </div>
                <Button data-testid="button-export" className="w-full gap-2" onClick={handleExport} disabled={activeProducts.length === 0}>
                  <Download className="h-4 w-4" /> ส่งออกไฟล์ Excel
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2 hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-blue-50">
                    <Upload className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <h2 data-testid="text-import-title" className="text-lg font-bold">นำเข้า Excel</h2>
                    <p className="text-sm text-muted-foreground">อัปโหลดไฟล์ Excel/CSV เพื่อเพิ่มสินค้าจำนวนมาก</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-dashed p-6 text-center">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium mb-1">อัปโหลดไฟล์ Excel หรือ CSV</p>
                  <p className="text-xs text-muted-foreground mb-3">รองรับ .xlsx, .xls, .csv (สูงสุด 1,000 รายการ)</p>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} data-testid="input-file" />
                  <Button data-testid="button-select-file" onClick={() => fileInputRef.current?.click()} className="gap-2">
                    <Upload className="h-4 w-4" /> เลือกไฟล์
                  </Button>
                </div>
                <Button data-testid="button-download-template" variant="outline" className="w-full gap-2" onClick={async () => {
                  try { await downloadFile("/api/products/import/template", "template_products.xlsx"); } catch {}
                }}>
                  <FileDown className="h-4 w-4" /> ดาวน์โหลดแบบฟอร์ม (Template)
                </Button>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">คอลัมน์ในไฟล์:</p>
                  <p>รหัสสินค้า, ชื่อสินค้า, ชื่ออังกฤษ, ชื่อจีน, หมวดหมู่, รายละเอียด, หน่วย, ราคาขาย, ต้นทุน, รวมVAT, รหัสบัญชี, ชื่อคลัง*, จำนวนคงเหลือ*</p>
                  <p className="text-[10px] italic">* ชื่อคลัง/จำนวน = ไม่บังคับ ใส่เพื่อตั้ง stock เริ่มต้น</p>
                </div>
              </CardContent>
            </Card>

            <Card id="bundle-import-section" className="border-2 hover:border-primary/40 transition-colors md:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-purple-50">
                    <Package className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h2 data-testid="text-bundle-import-title" className="text-lg font-bold">นำเข้าสินค้าจัดชุด (Bundle)</h2>
                    <p className="text-sm text-muted-foreground">สร้างชุดสินค้า + กำหนดตัวเลือกสี/ลายจาก Excel</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border-2 border-dashed p-4 text-center">
                  <Package className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                  <p className="text-sm font-medium mb-1">อัปโหลดไฟล์ Bundle</p>
                  <p className="text-xs text-muted-foreground mb-3">1 ชุด = หลายแถว (แถวละ 1 สินค้าในชุด) รองรับคละสี/ลาย</p>
                  <input ref={bundleFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleBundleFileUpload} data-testid="input-bundle-file" />
                  <div className="flex items-center justify-center gap-2">
                    <Button data-testid="button-bundle-select-file" onClick={() => bundleFileRef.current?.click()} className="gap-2 bg-purple-600 hover:bg-purple-700">
                      <Upload className="h-4 w-4" /> เลือกไฟล์
                    </Button>
                    <Button data-testid="button-bundle-template" variant="outline" className="gap-2" onClick={async () => { try { await downloadFile("/api/bundles/import/template", "template_bundles.xlsx"); } catch {} }}>
                      <FileDown className="h-4 w-4" /> Template
                    </Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">คอลัมน์ในไฟล์:</p>
                  <p>รหัสชุด, ชื่อชุด, ราคาชุด, หน่วย, รหัสสินค้าในชุด, กลุ่มตัวเลือก*, จำนวน, ค่าเริ่มต้น*</p>
                  <p className="text-[10px] italic">* กลุ่มตัวเลือก = ชื่อกลุ่มที่ให้เลือก (เช่น "หมอนหนุน") สินค้าไม่มีกลุ่ม = ตายตัว</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {step === "bundle-preview" && bundlePreview && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetImport}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-lg font-bold">ตรวจสอบสินค้าจัดชุดก่อนนำเข้า</h2>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {bundlePreview.stats.ok > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span>สร้างใหม่: <strong>{bundlePreview.stats.ok}</strong></span>
                    </div>
                  )}
                  {bundlePreview.stats.update > 0 && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <RefreshCw className="h-4 w-4" />
                      <span>อัพเดท: <strong>{bundlePreview.stats.update}</strong></span>
                    </div>
                  )}
                  {bundlePreview.stats.error > 0 && (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span>ข้อผิดพลาด: <strong>{bundlePreview.stats.error}</strong></span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Package className="h-4 w-4" />
                    <span>สินค้าในชุด: <strong>{bundlePreview.stats.totalComponents}</strong></span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-y-auto">
                {bundlePreview.bundles.map((bundle: any, idx: number) => (
                  <div key={idx} className={`border-b last:border-b-0 p-4 ${bundle.status === "error" ? "bg-red-50" : bundle.status === "update" ? "bg-blue-50" : ""}`}>
                    <div className="flex items-center gap-3 mb-2">
                      {bundle.status === "ok" && <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />}
                      {bundle.status === "update" && <RefreshCw className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                      {bundle.status === "error" && <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold">{bundle.bundleName || "(ไม่มีชื่อ)"}</p>
                        <p className="text-xs text-muted-foreground">
                          รหัส: {bundle.bundleCode} | ราคา: ฿{Number(bundle.bundlePrice).toLocaleString()} | {bundle.components.length} รายการในชุด
                          {bundle.barcode ? ` | บาร์โค้ด: ${bundle.barcode}` : " | บาร์โค้ด: (สร้างอัตโนมัติ)"}
                        </p>
                      </div>
                      {bundle.isExisting && <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">มีอยู่แล้ว</Badge>}
                    </div>
                    {bundle.issues.length > 0 && (
                      <p className="text-xs text-red-600 mb-2">{bundle.issues.join(" | ")}</p>
                    )}
                    <div className="ml-7 space-y-1">
                      {bundle.components.map((comp: any, ci: number) => (
                        <div key={ci} className="flex items-center gap-2 text-xs">
                          {comp.found ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                          <span className="font-mono text-muted-foreground w-28 truncate">{comp.componentCode}</span>
                          <span className="flex-1 truncate">{comp.productName || "(ไม่พบ)"}</span>
                          {comp.slotGroup && <Badge variant="outline" className="text-[10px] px-1.5">{comp.slotGroup}</Badge>}
                          <span className="text-muted-foreground">x{comp.qty}</span>
                          {comp.isDefault && <Badge className="text-[10px] px-1.5 bg-yellow-100 text-yellow-700 hover:bg-yellow-100">ค่าเริ่มต้น</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={resetImport}>ยกเลิก</Button>
                <Button data-testid="button-bundle-execute"
                  onClick={handleBundleExecute}
                  disabled={bundleImporting || (bundlePreview.stats.ok === 0 && bundlePreview.stats.update === 0)}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {bundleImporting ? "กำลังนำเข้า..." : `นำเข้า ${bundlePreview.stats.ok + bundlePreview.stats.update} ชุด`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "bundle-done" && bundleResult && (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-600" />
              <div>
                <p className="text-xl font-bold">นำเข้าสินค้าจัดชุดสำเร็จ!</p>
                <p className="text-sm text-muted-foreground mt-2">
                  สร้างใหม่ {bundleResult.created} ชุด
                  {bundleResult.updated > 0 && ` | อัพเดท ${bundleResult.updated} ชุด`}
                  {bundleResult.components > 0 && ` | ตั้งค่า ${bundleResult.components} รายการในชุด`}
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={resetImport}>นำเข้าเพิ่ม</Button>
                <Button onClick={() => navigate(`${basePath}/list`)}>ดูรายการสินค้า</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "preview" && importPreview && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={resetImport}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-lg font-bold">ตรวจสอบข้อมูลก่อนนำเข้า</h2>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>พร้อมนำเข้า: <strong data-testid="text-ok-count">{importPreview.stats.ok}</strong></span>
                  </div>
                  {importPreview.stats.duplicate > 0 && (
                    <div className="flex items-center gap-2 text-sm text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span>มีอยู่แล้ว: <strong data-testid="text-dup-count">{importPreview.stats.duplicate}</strong></span>
                    </div>
                  )}
                  {importPreview.stats.error > 0 && (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span>ข้อผิดพลาด: <strong data-testid="text-error-count">{importPreview.stats.error}</strong></span>
                    </div>
                  )}
                  {importPreview.hasWarehouseCol && importPreview.stats.stockEntries > 0 && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>ตั้ง stock: <strong>{importPreview.stats.stockEntries}</strong> รายการ</span>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {importPreview.hasWarehouseCol && importPreview.stats.stockEntries > 0 && (
                <div className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900">วันที่เริ่มต้นสต๊อก <span className="text-red-500">*</span></p>
                    <p className="text-xs text-amber-700 mt-0.5">ยอดเปิดสต๊อกทุกรายการจะใช้วันที่นี้</p>
                  </div>
                  <input
                    data-testid="input-stock-open-date"
                    type="date"
                    value={stockOpenDate}
                    onChange={e => setStockOpenDate(e.target.value)}
                    className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                  />
                </div>
              )}
              {importPreview.newWarehouseNames && importPreview.newWarehouseNames.length > 0 && (
                <div className="mx-4 mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <p className="text-sm font-medium text-blue-800">คลังใหม่ที่จะสร้างอัตโนมัติ:</p>
                  <p className="text-xs text-blue-600 mt-1">{importPreview.newWarehouseNames.join(", ")}</p>
                </div>
              )}
              <div className="max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="w-16">สถานะ</TableHead>
                      <TableHead className="w-24">รหัส</TableHead>
                      <TableHead>ชื่อสินค้า</TableHead>
                      <TableHead className="w-24">หมวดหมู่</TableHead>
                      <TableHead className="w-20">หน่วย</TableHead>
                      <TableHead className="w-24 text-right">ราคา</TableHead>
                      <TableHead className="w-28">บาร์โค้ด</TableHead>
                      {importPreview.hasWarehouseCol && <TableHead className="w-28">คลัง</TableHead>}
                      {importPreview.hasWarehouseCol && <TableHead className="w-20 text-right">จำนวน</TableHead>}
                      <TableHead>หมายเหตุ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.preview.map((item: any) => (
                      <TableRow key={item.row} data-testid={`row-preview-${item.row}`} className={item.status === "ok" ? "" : item.status === "duplicate" ? "bg-amber-50" : "bg-red-50"}>
                        <TableCell className="text-xs">{item.row}</TableCell>
                        <TableCell>
                          {item.status === "ok" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> :
                           item.status === "duplicate" ? <AlertCircle className="h-4 w-4 text-amber-600" /> :
                           <XCircle className="h-4 w-4 text-red-600" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{item.data.code || "-"}</TableCell>
                        <TableCell className="text-sm">{item.data.name || "-"}</TableCell>
                        <TableCell className="text-xs">{categoryLabel(item.data.category)}</TableCell>
                        <TableCell className="text-xs">{item.data.unit || "-"}</TableCell>
                        <TableCell className="text-right text-xs">{item.data.price}</TableCell>
                        <TableCell className="text-xs font-mono">{item.data.barcode || "-"}</TableCell>
                        {importPreview.hasWarehouseCol && <TableCell className="text-xs">{item.data.warehouseName || "-"}</TableCell>}
                        {importPreview.hasWarehouseCol && <TableCell className="text-right text-xs">{item.data.stockQty || "-"}</TableCell>}
                        <TableCell className="text-xs text-muted-foreground">{item.issues.join(", ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button data-testid="button-import-cancel" variant="outline" onClick={resetImport}>ยกเลิก</Button>
                <Button
                  data-testid="button-import-execute"
                  onClick={handleImportExecute}
                  disabled={importing || (importPreview.stats.ok === 0 && !importPreview.hasWarehouseCol) || (importPreview.hasWarehouseCol && importPreview.stats.stockEntries > 0 && !stockOpenDate)}
                >
                  {importing ? "กำลังนำเข้า..." : importPreview.hasWarehouseCol ? `นำเข้า ${importPreview.totalRows} รายการ (พร้อม stock)` : `นำเข้า ${importPreview.stats.ok} รายการ`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "done" && importResult && (
          <Card>
            <CardContent className="py-12 text-center space-y-4">
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-600" />
              <div>
                <p className="text-xl font-bold">นำเข้าสำเร็จ!</p>
                <p className="text-sm text-muted-foreground mt-2">
                  นำเข้าสินค้า {importResult.imported} รายการ
                  {importResult.skipped > 0 && ` (ข้าม ${importResult.skipped} รายการ)`}
                  {importResult.stockSet > 0 && ` | ตั้ง stock ${importResult.stockSet} คลัง`}
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <Button data-testid="button-import-more" variant="outline" onClick={resetImport}>นำเข้าเพิ่ม</Button>
                <Button data-testid="button-go-products" onClick={() => navigate("/inventory/list")}>ดูรายการสินค้า</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </LayoutComponent>
  );
}
