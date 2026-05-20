import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import ImportBatchHistory from "@/components/import-batch-history";
import { downloadFile } from "@/lib/queryClient";
import {
  Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertCircle, ArrowLeft, FileText, Loader2, ChevronDown, ChevronUp, Download,
} from "lucide-react";

interface PreviewItem {
  rowNum: number; productCode: string; productName: string; description: string;
  qty: number; unit: string; unitPrice: number; discount: number; total: number;
  vatType: string; productId: number | null; productMatched: boolean; errors: string[];
}

interface PreviewDoc {
  key: string; quotationNo: string; quotationDate: string; validUntil: string;
  customerCode: string; customerName: string; customerTaxId: string; customerAddress: string;
  branch: string; contactPerson: string; contactPhone: string; contactEmail: string;
  creditDays: number | null; notes: string; refDoc: string; priceMode: string;
  withholdingTax: number; subtotal: number; vatAmount: number; totalAmount: number;
  customerId: number | null; customerMatchName: string | null;
  items: PreviewItem[]; errors: string[]; hasErrors: boolean; isDuplicate: boolean;
}

interface PreviewResult {
  totalRows: number; totalDocuments: number; validDocuments: number;
  invalidDocuments: number; documents: PreviewDoc[];
}

interface CreateResult {
  created: { quotationNo: string; id: number }[];
  skipped: { quotationNo: string; reason: string }[];
  errors: { quotationNo: string; error: string }[];
  total: number;
}

function fmt(val: number) {
  return val.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const VAT_LABELS: Record<string, string> = { vat7: "VAT 7%", non_vat: "ไม่มี VAT", zero_rated: "VAT 0%" };

export default function QuotationImport() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", String(companyId));
      const res = await fetch("/api/quotations/import/preview", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "ไม่สามารถอ่านไฟล์ได้"); }
      return res.json() as Promise<PreviewResult>;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setSelectedDocs(new Set(data.documents.filter(d => !d.hasErrors).map(d => d.key)));
      setStep("preview");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!previewData) throw new Error("ไม่มีข้อมูล");
      const docs = previewData.documents.filter(d => selectedDocs.has(d.key) && !d.hasErrors);
      const res = await fetch("/api/quotations/import/create", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ companyId, documents: docs }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "ไม่สามารถนำเข้าได้"); }
      return res.json() as Promise<CreateResult>;
    },
    onSuccess: (data) => { setCreateResult(data); setStep("result"); },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) previewMutation.mutate(file);
    e.target.value = "";
  };

  const toggleDoc = (key: string) => setSelectedDocs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleExpand = (key: string) => setExpandedDocs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const selectAll = () => previewData && setSelectedDocs(new Set(previewData.documents.filter(d => !d.hasErrors).map(d => d.key)));
  const selectNone = () => setSelectedDocs(new Set());
  const resetAll = () => { setStep("upload"); setPreviewData(null); setCreateResult(null); setSelectedDocs(new Set()); setExpandedDocs(new Set()); };
  const handleDownloadTemplate = async () => {
    try { await downloadFile("/api/quotations/import/template", "template_quotations.xlsx"); }
    catch { toast({ title: "ดาวน์โหลด template ไม่สำเร็จ", variant: "destructive" }); }
  };
  const selectedCount = previewData ? previewData.documents.filter(d => selectedDocs.has(d.key) && !d.hasErrors).length : 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="outline" size="sm" onClick={() => navigate("/sales/quote")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-1" /> กลับ
          </Button>
          <h1 className="text-xl font-semibold">นำเข้าใบเสนอราคาจาก Excel</h1>
        </div>

        <ImportBatchHistory docType="quotation" invalidateKeys={[["quotations"]]} />

        {step === "upload" && (
          <Card className="flexy-card">
            <CardHeader className="bg-[var(--theme-primary)]/10 border-b px-5 py-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-[var(--theme-primary)]" />
                <span className="font-semibold text-sm">อัพโหลดไฟล์ Excel</span>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="text-center py-8">
                <FileSpreadsheet className="h-16 w-16 text-[#05b187] mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">นำเข้าใบเสนอราคาจากไฟล์ Excel</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                  อัพโหลดไฟล์ .xlsx หรือ .csv ที่มีข้อมูลใบเสนอราคา ระบบจะแสดงตัวอย่างข้อมูลให้ตรวจสอบก่อนนำเข้า
                </p>
                <div className="flex items-center justify-center gap-3 mb-6">
                  <Button variant="outline" onClick={handleDownloadTemplate} className="rounded-full border-[#05b187] text-[#05b187]" data-testid="button-download-template">
                    <Download className="h-4 w-4 mr-1" /> ดาวน์โหลดเทมเพลต
                  </Button>
                </div>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} data-testid="input-file" />
                <Button onClick={() => fileInputRef.current?.click()} className="bg-[var(--theme-primary)] hover:bg-[#e8856a] text-white rounded-full px-8" disabled={!companyId || previewMutation.isPending} data-testid="button-upload">
                  {previewMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> กำลังอ่านไฟล์...</> : <><Upload className="h-4 w-4 mr-2" /> เลือกไฟล์ Excel</>}
                </Button>
                {!companyId && <p className="text-sm text-red-500 mt-3">กรุณาเลือกบริษัทก่อน</p>}
              </div>
              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium text-sm mb-2">คำแนะนำ:</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>ดาวน์โหลดเทมเพลตเพื่อดูรูปแบบคอลัมน์ที่ถูกต้อง</li>
                  <li>แถวที่มี "เลขที่เอกสาร" เดียวกันจะรวมเป็นเอกสารเดียว (หลายรายการ)</li>
                  <li>ข้อมูลลูกค้า/วันที่ กรอกแค่แถวแรกของแต่ละเอกสาร</li>
                  <li>วันที่ใช้รูปแบบ DD/MM/YYYY (พ.ศ.) เช่น 01/01/2568</li>
                  <li>รองรับไฟล์ .xlsx, .xls, .csv</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "preview" && previewData && (
          <div className="space-y-4">
            <Card className="flexy-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-700">{previewData.totalRows} แถว</Badge>
                    <Badge className="bg-purple-100 text-purple-700">{previewData.totalDocuments} เอกสาร</Badge>
                    <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" /> {previewData.validDocuments} ถูกต้อง</Badge>
                    {previewData.invalidDocuments > 0 && <Badge className="bg-red-100 text-red-700"><XCircle className="h-3 w-3 mr-1" /> {previewData.invalidDocuments} มีข้อผิดพลาด</Badge>}
                  </div>
                  <div className="ml-auto flex items-center gap-2 flex-wrap">
                    <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all">เลือกทั้งหมด</Button>
                    <Button variant="outline" size="sm" onClick={selectNone} data-testid="button-select-none">ไม่เลือก</Button>
                    <Button variant="outline" size="sm" onClick={resetAll} data-testid="button-reset">อัพโหลดใหม่</Button>
                    <Button onClick={() => createMutation.mutate()} disabled={selectedCount === 0 || createMutation.isPending} className="bg-[#05b187] hover:bg-[#049973] text-white rounded-full" data-testid="button-import">
                      {createMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> กำลังนำเข้า...</> : <><FileText className="h-4 w-4 mr-2" /> นำเข้า {selectedCount} เอกสาร</>}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <div className="space-y-2">
              {previewData.documents.map((doc) => (
                <Card key={doc.key} className={`flexy-card ${doc.hasErrors ? "border-red-300 bg-red-50/30" : doc.isDuplicate ? "border-yellow-300 bg-yellow-50/30" : ""}`}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      {!doc.hasErrors && <Checkbox checked={selectedDocs.has(doc.key)} onCheckedChange={() => toggleDoc(doc.key)} data-testid={`checkbox-doc-${doc.key}`} />}
                      {doc.hasErrors && <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-sm">{doc.quotationNo}</span>
                          <span className="text-sm text-muted-foreground">{doc.quotationDate}</span>
                          <span className="text-sm font-medium">{doc.customerName}</span>
                          {doc.customerMatchName && <Badge variant="outline" className="text-xs border-emerald-300 text-emerald-600">จับคู่: {doc.customerMatchName}</Badge>}
                          <Badge className="bg-slate-100 text-slate-700 text-xs">{doc.items.length} รายการ</Badge>
                        </div>
                        {doc.errors.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {doc.errors.map((err, i) => <div key={i} className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {err}</div>)}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{fmt(doc.totalAmount)}</div>
                        {doc.vatAmount > 0 && <div className="text-xs text-muted-foreground">VAT {fmt(doc.vatAmount)}</div>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => toggleExpand(doc.key)} data-testid={`button-expand-${doc.key}`}>
                        {expandedDocs.has(doc.key) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                    {expandedDocs.has(doc.key) && (
                      <div className="mt-3 border-t pt-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10 text-xs">#</TableHead>
                              <TableHead className="text-xs">รหัสสินค้า</TableHead>
                              <TableHead className="text-xs">ชื่อสินค้า/บริการ</TableHead>
                              <TableHead className="text-xs text-right">จำนวน</TableHead>
                              <TableHead className="text-xs">หน่วย</TableHead>
                              <TableHead className="text-xs text-right">ราคา/หน่วย</TableHead>
                              <TableHead className="text-xs text-right">ส่วนลด</TableHead>
                              <TableHead className="text-xs">VAT</TableHead>
                              <TableHead className="text-xs text-right">รวม</TableHead>
                              <TableHead className="text-xs">สถานะ</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {doc.items.map((item, idx) => (
                              <TableRow key={idx} className={item.errors.length > 0 ? "bg-red-50" : ""}>
                                <TableCell className="text-xs">{idx + 1}</TableCell>
                                <TableCell className="text-xs font-mono">{item.productCode}{item.productMatched && <CheckCircle2 className="h-3 w-3 text-emerald-500 inline ml-1" />}</TableCell>
                                <TableCell className="text-xs">{item.productName}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{item.qty}</TableCell>
                                <TableCell className="text-xs">{item.unit}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{fmt(item.unitPrice)}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{item.discount > 0 ? fmt(item.discount) : "-"}</TableCell>
                                <TableCell className="text-xs">{VAT_LABELS[item.vatType] || item.vatType}</TableCell>
                                <TableCell className="text-xs text-right font-mono">{fmt(item.total)}</TableCell>
                                <TableCell className="text-xs">{item.errors.length > 0 ? item.errors.map((e, i) => <div key={i} className="text-red-600 flex items-center gap-1"><XCircle className="h-3 w-3" /> {e}</div>) : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {doc.notes && <div className="text-xs text-muted-foreground mt-1">หมายเหตุ: {doc.notes}</div>}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {step === "result" && createResult && (
          <div className="space-y-4">
            <Card className="flexy-card">
              <CardHeader className="bg-emerald-50 border-b px-5 py-3">
                <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><span className="font-semibold text-sm">นำเข้าเสร็จสิ้น</span></div>
              </CardHeader>
              <CardContent className="p-5">
                <div className="flex items-center gap-4 mb-4">
                  <Badge className="bg-emerald-100 text-emerald-700 text-sm px-3 py-1"><CheckCircle2 className="h-4 w-4 mr-1" /> สร้างสำเร็จ {createResult.created.length} เอกสาร</Badge>
                  {createResult.skipped.length > 0 && <Badge className="bg-yellow-100 text-yellow-700 text-sm px-3 py-1"><AlertCircle className="h-4 w-4 mr-1" /> ข้าม {createResult.skipped.length} เอกสาร</Badge>}
                  {createResult.errors.length > 0 && <Badge className="bg-red-100 text-red-700 text-sm px-3 py-1"><XCircle className="h-4 w-4 mr-1" /> ผิดพลาด {createResult.errors.length} เอกสาร</Badge>}
                </div>
                {createResult.created.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium mb-1 text-emerald-700">เอกสารที่สร้างสำเร็จ:</p>
                    <div className="flex flex-wrap gap-1">{createResult.created.map((c, i) => <Badge key={i} variant="outline" className="font-mono text-xs">{c.quotationNo}</Badge>)}</div>
                  </div>
                )}
                {createResult.skipped.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-medium mb-1 text-yellow-700">เอกสารที่ข้าม:</p>
                    <div className="space-y-1">{createResult.skipped.map((s, i) => <div key={i} className="text-xs text-yellow-700">{s.quotationNo}: {s.reason}</div>)}</div>
                  </div>
                )}
                <div className="flex gap-2 mt-4">
                  <Button onClick={resetAll} variant="outline" data-testid="button-import-more">นำเข้าเพิ่มเติม</Button>
                  <Button onClick={() => navigate("/sales/quote")} className="bg-[var(--theme-primary)] text-white" data-testid="button-go-to-list">ไปยังรายการใบเสนอราคา</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
