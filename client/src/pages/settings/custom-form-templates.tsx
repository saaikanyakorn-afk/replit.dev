import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import Layout from "@/components/layout";
import SettingsTabs from "@/components/settings-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Save, Printer, Copy, Upload, Eye,
  ArrowLeft, Move, GripVertical, FileText, X, Loader2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useUpload } from "@/hooks/use-upload";
import { objectPathToUrl } from "@/lib/utils";

interface FormField {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontWeight?: string;
  align?: "left" | "center" | "right";
  maxChars?: number;
}

interface ItemColumn {
  key: string;
  label: string;
  x: number;
  width: number;
  fontSize: number;
  align: "left" | "center" | "right";
}

interface ItemsTableConfig {
  startY: number;
  rowHeight: number;
  maxRows: number;
  columns: ItemColumn[];
}

interface TotalField {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  align?: "left" | "center" | "right";
}

interface FormTemplate {
  id?: number;
  companyId: number;
  name: string;
  docType: string;
  paperSize: string;
  orientation: string;
  backgroundImageUrl?: string | null;
  fields: FormField[];
  itemsTable: ItemsTableConfig | null;
  totals: TotalField[];
  isDefault: boolean;
}

const DOC_TYPES = [
  { value: "IV", label: "ใบแจ้งหนี้/ใบส่งสินค้า" },
  { value: "TX", label: "ใบกำกับภาษี" },
  { value: "RC", label: "ใบเสร็จรับเงิน" },
  { value: "QO", label: "ใบเสนอราคา" },
  { value: "PO", label: "ใบสั่งซื้อ" },
  { value: "DN", label: "ใบส่งของ" },
  { value: "CN", label: "ใบลดหนี้" },
  { value: "DB", label: "ใบเพิ่มหนี้" },
];

const HEADER_FIELD_OPTIONS = [
  { key: "customerName", label: "ชื่อลูกค้า" },
  { key: "customerTaxId", label: "เลขผู้เสียภาษี" },
  { key: "customerBranch", label: "สาขา" },
  { key: "customerAddress1", label: "ที่อยู่บรรทัด 1" },
  { key: "customerAddress2", label: "ที่อยู่บรรทัด 2" },
  { key: "customerAddress3", label: "ที่อยู่บรรทัด 3" },
  { key: "customerPhone", label: "โทรศัพท์" },
  { key: "customerCode", label: "รหัสลูกค้า" },
  { key: "docNo", label: "เลขที่เอกสาร" },
  { key: "docDate", label: "วันที่" },
  { key: "dueDate", label: "วันครบกำหนด" },
  { key: "creditDays", label: "เครดิต (วัน)" },
  { key: "refNo", label: "อ้างอิง" },
  { key: "salesPerson", label: "พนักงานขาย" },
  { key: "remark", label: "หมายเหตุ" },
];

const ITEM_COLUMN_OPTIONS = [
  { key: "no", label: "ลำดับ" },
  { key: "productCode", label: "รหัสสินค้า" },
  { key: "description", label: "รายละเอียด" },
  { key: "qty", label: "จำนวน" },
  { key: "unit", label: "หน่วย" },
  { key: "unitPrice", label: "ราคาต่อหน่วย" },
  { key: "discount", label: "ส่วนลด" },
  { key: "amount", label: "จำนวนเงิน" },
];

const TOTAL_FIELD_OPTIONS = [
  { key: "subtotal", label: "รวมเป็นเงิน" },
  { key: "discountTotal", label: "หักส่วนลด" },
  { key: "afterDiscount", label: "หลังหักส่วนลด" },
  { key: "vatAmount", label: "ภาษีมูลค่าเพิ่ม" },
  { key: "grandTotal", label: "จำนวนเงินรวมทั้งสิ้น" },
  { key: "withholding", label: "ภาษีหัก ณ ที่จ่าย" },
  { key: "netPayable", label: "ยอดชำระสุทธิ" },
  { key: "totalText", label: "จำนวนเงิน (ตัวอักษร)" },
];

const A4_W_MM = 210;
const A4_H_MM = 297;
const PREVIEW_SCALE = 2.5;

const SAMPLE_DATA: Record<string, string> = {
  customerName: "บริษัท สินว่ารวย จำกัด",
  customerTaxId: "0105567224795",
  customerBranch: "สำนักงานใหญ่",
  customerAddress1: "35/3 หมู่ที่ 15 ถ.บางระมาด",
  customerAddress2: "แขวงบางระมาด เขตตลิ่งชัน",
  customerAddress3: "กรุงเทพมหานคร 10170",
  customerPhone: "097/4847",
  customerCode: "ส-426",
  docNo: "IV6902942",
  docDate: "25/03/2569",
  dueDate: "25/04/2569",
  creditDays: "30",
  refNo: "PO-2025-001",
  salesPerson: "S1-คุณมาวศรี",
  remark: "",
};

const SAMPLE_ITEMS = [
  { no: "1", productCode: "LED-001", description: "หลอดLEDบับ PH ESS 13W 6500K เดย์ (/12)", qty: "12ดวง", unitPrice: "47.92", discount: "", amount: "575.04" },
  { no: "2", productCode: "LED-002", description: "หลอดLEDบับ PH 14.5W 6500K เดย์A60 (/6)", qty: "18ดวง", unitPrice: "76.55", discount: "", amount: "1,377.90" },
  { no: "3", productCode: "CAB-001", description: "สายGLINK RG6 60% 100M. ดำ(24822)", qty: "1ขด", unitPrice: "269.53", discount: "", amount: "269.53" },
];

const SAMPLE_TOTALS: Record<string, string> = {
  subtotal: "9,808.02",
  discountTotal: "-",
  afterDiscount: "9,808.02",
  vatAmount: "686.56",
  grandTotal: "10,494.58",
  withholding: "-",
  netPayable: "10,494.58",
  totalText: "หนึ่งหมื่นสี่ร้อยเก้าสิบสี่บาท ห้าสิบแปดสตางค์",
};

function emptyTemplate(companyId: number): FormTemplate {
  return {
    companyId,
    name: "",
    docType: "IV",
    paperSize: "A4",
    orientation: "portrait",
    backgroundImageUrl: null,
    fields: [],
    itemsTable: null,
    totals: [],
    isDefault: false,
  };
}

export default function CustomFormTemplates() {
  const { selectedCompany } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompany?.id;

  const [editing, setEditing] = useState<FormTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [showAddField, setShowAddField] = useState(false);
  const [addFieldType, setAddFieldType] = useState<"header" | "item" | "total">("header");
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const [bgUploading, setBgUploading] = useState(false);
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string>("");
  const [bgFile, setBgFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUpload();

  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/custom-form-templates", companyId],
    queryFn: () => fetch(`/api/custom-form-templates?companyId=${companyId}`).then(r => r.json()),
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: async (tpl: FormTemplate) => {
      const body = {
        ...tpl,
        fields: JSON.stringify(tpl.fields),
        itemsTable: tpl.itemsTable ? JSON.stringify(tpl.itemsTable) : null,
        totals: JSON.stringify(tpl.totals),
      };
      if (tpl.id) {
        return apiRequest("PUT", `/api/custom-form-templates/${tpl.id}`, body);
      }
      return apiRequest("POST", "/api/custom-form-templates", body);
    },
    onSuccess: () => {
      toast({ title: "บันทึกเทมเพลตสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-form-templates"] });
      setEditing(null);
    },
    onError: (err: any) => {
      toast({ title: "บันทึกไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/custom-form-templates/${id}`),
    onSuccess: () => {
      toast({ title: "ลบเทมเพลตแล้ว" });
      queryClient.invalidateQueries({ queryKey: ["/api/custom-form-templates"] });
      setDeleteId(null);
    },
  });

  const handleBgUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing) return;
    setBgPreviewUrl(URL.createObjectURL(file));
    setBgUploading(true);
    try {
      const result = await uploadFile(file);
      if (result?.objectPath) {
        const url = objectPathToUrl(result.objectPath);
        setEditing({ ...editing, backgroundImageUrl: url });
        setBgPreviewUrl(url);
        toast({ title: "อัพโหลดรูปฟอร์มสำเร็จ" });
      } else {
        toast({ title: "อัพโหลดไม่สำเร็จ", variant: "destructive" });
        setBgPreviewUrl(editing.backgroundImageUrl || "");
      }
    } catch (err: any) {
      toast({ title: "อัพโหลดไม่สำเร็จ", description: err.message, variant: "destructive" });
      setBgPreviewUrl(editing.backgroundImageUrl || "");
    } finally {
      setBgUploading(false);
    }
  }, [editing, uploadFile, toast]);

  const openEditor = useCallback((tpl?: any) => {
    if (tpl) {
      const parsed: FormTemplate = {
        ...tpl,
        fields: typeof tpl.fields === "string" ? JSON.parse(tpl.fields) : tpl.fields || [],
        itemsTable: tpl.itemsTable ? (typeof tpl.itemsTable === "string" ? JSON.parse(tpl.itemsTable) : tpl.itemsTable) : null,
        totals: tpl.totals ? (typeof tpl.totals === "string" ? JSON.parse(tpl.totals) : tpl.totals) : [],
      };
      setEditing(parsed);
      if (parsed.backgroundImageUrl) setBgPreviewUrl(parsed.backgroundImageUrl);
    } else {
      setEditing(emptyTemplate(companyId!));
      setBgPreviewUrl("");
    }
    setBgFile(null);
  }, [companyId]);

  const updateField = useCallback((index: number, key: keyof FormField, value: any) => {
    if (!editing) return;
    const updated = [...editing.fields];
    (updated[index] as any)[key] = value;
    setEditing({ ...editing, fields: updated });
  }, [editing]);

  const removeField = useCallback((index: number) => {
    if (!editing) return;
    const updated = editing.fields.filter((_, i) => i !== index);
    setEditing({ ...editing, fields: updated });
  }, [editing]);

  const updateItemColumn = useCallback((index: number, key: keyof ItemColumn, value: any) => {
    if (!editing?.itemsTable) return;
    const cols = [...editing.itemsTable.columns];
    (cols[index] as any)[key] = value;
    setEditing({ ...editing, itemsTable: { ...editing.itemsTable, columns: cols } });
  }, [editing]);

  const removeItemColumn = useCallback((index: number) => {
    if (!editing?.itemsTable) return;
    const cols = editing.itemsTable.columns.filter((_, i) => i !== index);
    setEditing({ ...editing, itemsTable: { ...editing.itemsTable, columns: cols } });
  }, [editing]);

  const updateTotalField = useCallback((index: number, key: keyof TotalField, value: any) => {
    if (!editing) return;
    const updated = [...editing.totals];
    (updated[index] as any)[key] = value;
    setEditing({ ...editing, totals: updated });
  }, [editing]);

  const removeTotalField = useCallback((index: number) => {
    if (!editing) return;
    const updated = editing.totals.filter((_, i) => i !== index);
    setEditing({ ...editing, totals: updated });
  }, [editing]);

  const addField = useCallback(() => {
    if (!editing || !selectedFieldKey) return;
    if (addFieldType === "header") {
      const opt = HEADER_FIELD_OPTIONS.find(o => o.key === selectedFieldKey);
      if (!opt) return;
      setEditing({
        ...editing,
        fields: [...editing.fields, { key: opt.key, label: opt.label, x: 20, y: 50, width: 60, fontSize: 10 }],
      });
    } else if (addFieldType === "item") {
      const opt = ITEM_COLUMN_OPTIONS.find(o => o.key === selectedFieldKey);
      if (!opt) return;
      const table = editing.itemsTable || { startY: 120, rowHeight: 6.5, maxRows: 15, columns: [] };
      setEditing({
        ...editing,
        itemsTable: {
          ...table,
          columns: [...table.columns, { key: opt.key, label: opt.label, x: 20, width: 30, fontSize: 9, align: "left" }],
        },
      });
    } else {
      const opt = TOTAL_FIELD_OPTIONS.find(o => o.key === selectedFieldKey);
      if (!opt) return;
      setEditing({
        ...editing,
        totals: [...editing.totals, { key: opt.key, label: opt.label, x: 140, y: 240, width: 50, fontSize: 10 }],
      });
    }
    setShowAddField(false);
    setSelectedFieldKey("");
  }, [editing, selectedFieldKey, addFieldType]);

  const handlePrintPreview = useCallback(() => {
    if (!editing) return;
    const w = editing.orientation === "landscape" ? A4_H_MM : A4_W_MM;
    const h = editing.orientation === "landscape" ? A4_W_MM : A4_H_MM;
    const printWindow = window.open("", "_blank", `width=800,height=1000`);
    if (!printWindow) return;

    let fieldsHtml = editing.fields.map(f => {
      const val = SAMPLE_DATA[f.key] || f.label;
      return `<div style="position:absolute;left:${f.x}mm;top:${f.y}mm;width:${f.width}mm;font-size:${f.fontSize}pt;font-weight:${f.fontWeight || "normal"};text-align:${f.align || "left"};white-space:nowrap;overflow:hidden;">${val}</div>`;
    }).join("");

    if (editing.itemsTable) {
      const tbl = editing.itemsTable;
      for (let r = 0; r < Math.min(SAMPLE_ITEMS.length, tbl.maxRows); r++) {
        const item = SAMPLE_ITEMS[r];
        for (const col of tbl.columns) {
          const val = (item as any)[col.key] || "";
          const topY = tbl.startY + r * tbl.rowHeight;
          fieldsHtml += `<div style="position:absolute;left:${col.x}mm;top:${topY}mm;width:${col.width}mm;font-size:${col.fontSize}pt;text-align:${col.align};white-space:nowrap;overflow:hidden;">${val}</div>`;
        }
      }
    }

    const totalsHtml = editing.totals.map(t => {
      const val = SAMPLE_TOTALS[t.key] || t.label;
      return `<div style="position:absolute;left:${t.x}mm;top:${t.y}mm;width:${t.width}mm;font-size:${t.fontSize}pt;text-align:${t.align || "right"};white-space:nowrap;overflow:hidden;">${val}</div>`;
    }).join("");

    printWindow.document.write(`<!DOCTYPE html><html><head><style>
      @page { size: ${w}mm ${h}mm; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Sarabun', 'Tahoma', sans-serif; }
      .page { position: relative; width: ${w}mm; height: ${h}mm; overflow: hidden; }
      @media print { .no-print { display: none !important; } }
    </style></head><body>
      <div class="no-print" style="padding:8px;background:#333;color:#fff;text-align:center;">
        <button onclick="window.print()" style="padding:6px 20px;font-size:14px;cursor:pointer;">🖨️ พิมพ์</button>
        <span style="margin-left:12px;">ตรวจสอบตำแหน่งแล้วกด พิมพ์</span>
      </div>
      <div class="page">${fieldsHtml}${totalsHtml}</div>
    </body></html>`);
    printWindow.document.close();
  }, [editing]);

  if (!companyId) return <Layout title="ฟอร์มพิมพ์"><div className="p-6">กรุณาเลือกบริษัท</div></Layout>;

  if (editing) {
    const pw = editing.orientation === "landscape" ? A4_H_MM : A4_W_MM;
    const ph = editing.orientation === "landscape" ? A4_W_MM : A4_H_MM;
    return (
      <Layout title="ออกแบบฟอร์มพิมพ์">
        <div className="p-4 max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)} data-testid="button-back-templates">
              <ArrowLeft className="h-4 w-4 mr-1" /> กลับ
            </Button>
            <h2 className="text-lg font-bold">{editing.id ? "แก้ไขเทมเพลต" : "สร้างเทมเพลตใหม่"}</h2>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrintPreview} className="gap-1.5 border-[#03c9d7] text-[#03c9d7]" data-testid="button-preview-print">
                <Printer className="h-4 w-4" /> เทสปริ้นท์
              </Button>
              <Button size="sm" onClick={() => saveMutation.mutate(editing)} disabled={saveMutation.isPending || !editing.name} className="gap-1.5 bg-[#05b187] hover:bg-[#05b187]/90" data-testid="button-save-template">
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                บันทึก
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-4">
            <div className="space-y-4">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">ข้อมูลเทมเพลต</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">ชื่อเทมเพลต</Label>
                      <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="เช่น ฟอร์มพลังแสง" data-testid="input-template-name" />
                    </div>
                    <div>
                      <Label className="text-xs">ประเภทเอกสาร</Label>
                      <Select value={editing.docType} onValueChange={v => setEditing({ ...editing, docType: v })}>
                        <SelectTrigger data-testid="select-doc-type"><SelectValue /></SelectTrigger>
                        <SelectContent>{DOC_TYPES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">ขนาดกระดาษ</Label>
                      <Select value={editing.paperSize} onValueChange={v => setEditing({ ...editing, paperSize: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A4">A4</SelectItem>
                          <SelectItem value="A5">A5</SelectItem>
                          <SelectItem value="Letter">Letter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={editing.isDefault} onCheckedChange={v => setEditing({ ...editing, isDefault: v })} />
                        <Label className="text-xs">ใช้เป็นค่าเริ่มต้น</Label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">รูปฟอร์มเปล่า (พื้นหลัง)</Label>
                    <div className="flex gap-2 mt-1">
                      <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="gap-1" disabled={bgUploading} data-testid="button-upload-bg">
                        {bgUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {bgUploading ? "กำลังอัพโหลด..." : "อัพโหลดรูปฟอร์ม"}
                      </Button>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleBgUpload} />
                      {(bgPreviewUrl || editing.backgroundImageUrl) && (
                        <Button variant="ghost" size="sm" onClick={() => { setEditing({ ...editing, backgroundImageUrl: null }); setBgPreviewUrl(""); }}>
                          <X className="h-4 w-4" /> ลบรูป
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">ฟิลด์หัวเอกสาร ({editing.fields.length})</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => { setAddFieldType("header"); setShowAddField(true); }} className="gap-1 text-xs" data-testid="button-add-header-field">
                      <Plus className="h-3 w-3" /> เพิ่มฟิลด์
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {editing.fields.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-3 text-center">ยังไม่มีฟิลด์ กดปุ่ม "เพิ่มฟิลด์" เพื่อเริ่มกำหนดตำแหน่ง</p>
                  ) : (
                    <div className="space-y-2">
                      {editing.fields.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 bg-gray-50 p-2 rounded text-xs">
                          <GripVertical className="h-3 w-3 text-gray-400 shrink-0" />
                          <span className="font-medium w-24 shrink-0">{f.label}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">X</span>
                            <Input type="number" value={f.x} onChange={e => updateField(i, "x", Number(e.target.value))} className="w-16 h-7 text-xs" step={0.5} data-testid={`input-field-x-${i}`} />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">Y</span>
                            <Input type="number" value={f.y} onChange={e => updateField(i, "y", Number(e.target.value))} className="w-16 h-7 text-xs" step={0.5} data-testid={`input-field-y-${i}`} />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">W</span>
                            <Input type="number" value={f.width} onChange={e => updateField(i, "width", Number(e.target.value))} className="w-16 h-7 text-xs" step={0.5} />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">Sz</span>
                            <Input type="number" value={f.fontSize} onChange={e => updateField(i, "fontSize", Number(e.target.value))} className="w-14 h-7 text-xs" step={0.5} />
                          </div>
                          <Select value={f.align || "left"} onValueChange={v => updateField(i, "align", v)}>
                            <SelectTrigger className="w-16 h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">ซ้าย</SelectItem>
                              <SelectItem value="center">กลาง</SelectItem>
                              <SelectItem value="right">ขวา</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeField(i)} data-testid={`button-remove-field-${i}`}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">ตารางรายการสินค้า ({editing.itemsTable?.columns.length || 0} คอลัมน์)</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => { setAddFieldType("item"); setShowAddField(true); }} className="gap-1 text-xs" data-testid="button-add-item-col">
                      <Plus className="h-3 w-3" /> เพิ่มคอลัมน์
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {editing.itemsTable && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">เริ่มที่ Y (mm)</Label>
                        <Input type="number" value={editing.itemsTable.startY} onChange={e => setEditing({ ...editing, itemsTable: { ...editing.itemsTable!, startY: Number(e.target.value) } })} className="h-8 text-xs" step={0.5} data-testid="input-items-start-y" />
                      </div>
                      <div>
                        <Label className="text-xs">ความสูงแถว (mm)</Label>
                        <Input type="number" value={editing.itemsTable.rowHeight} onChange={e => setEditing({ ...editing, itemsTable: { ...editing.itemsTable!, rowHeight: Number(e.target.value) } })} className="h-8 text-xs" step={0.25} />
                      </div>
                      <div>
                        <Label className="text-xs">จำนวนแถวสูงสุด</Label>
                        <Input type="number" value={editing.itemsTable.maxRows} onChange={e => setEditing({ ...editing, itemsTable: { ...editing.itemsTable!, maxRows: Number(e.target.value) } })} className="h-8 text-xs" />
                      </div>
                    </div>
                  )}
                  {editing.itemsTable?.columns.map((col, i) => (
                    <div key={i} className="flex items-center gap-2 bg-blue-50 p-2 rounded text-xs">
                      <GripVertical className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="font-medium w-24 shrink-0">{col.label}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">X</span>
                        <Input type="number" value={col.x} onChange={e => updateItemColumn(i, "x", Number(e.target.value))} className="w-16 h-7 text-xs" step={0.5} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">W</span>
                        <Input type="number" value={col.width} onChange={e => updateItemColumn(i, "width", Number(e.target.value))} className="w-16 h-7 text-xs" step={0.5} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Sz</span>
                        <Input type="number" value={col.fontSize} onChange={e => updateItemColumn(i, "fontSize", Number(e.target.value))} className="w-14 h-7 text-xs" step={0.5} />
                      </div>
                      <Select value={col.align} onValueChange={v => updateItemColumn(i, "align", v as any)}>
                        <SelectTrigger className="w-16 h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="left">ซ้าย</SelectItem>
                          <SelectItem value="center">กลาง</SelectItem>
                          <SelectItem value="right">ขวา</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeItemColumn(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">ยอดรวมท้ายเอกสาร ({editing.totals.length})</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => { setAddFieldType("total"); setShowAddField(true); }} className="gap-1 text-xs" data-testid="button-add-total-field">
                      <Plus className="h-3 w-3" /> เพิ่มฟิลด์
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {editing.totals.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 bg-green-50 p-2 rounded text-xs mb-2">
                      <GripVertical className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="font-medium w-28 shrink-0">{t.label}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">X</span>
                        <Input type="number" value={t.x} onChange={e => updateTotalField(i, "x", Number(e.target.value))} className="w-16 h-7 text-xs" step={0.5} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Y</span>
                        <Input type="number" value={t.y} onChange={e => updateTotalField(i, "y", Number(e.target.value))} className="w-16 h-7 text-xs" step={0.5} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">W</span>
                        <Input type="number" value={t.width} onChange={e => updateTotalField(i, "width", Number(e.target.value))} className="w-16 h-7 text-xs" step={0.5} />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Sz</span>
                        <Input type="number" value={t.fontSize} onChange={e => updateTotalField(i, "fontSize", Number(e.target.value))} className="w-14 h-7 text-xs" step={0.5} />
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeTotalField(i)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="xl:w-[560px]">
              <Card className="border-none shadow-sm sticky top-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Eye className="h-4 w-4 text-[#539BFF]" /> ตัวอย่าง (A4 ย่อ)
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex justify-center overflow-auto">
                  <div
                    style={{
                      width: pw * PREVIEW_SCALE,
                      height: ph * PREVIEW_SCALE,
                      position: "relative",
                      border: "1px solid #ddd",
                      background: "#fff",
                      overflow: "hidden",
                      fontSize: 0,
                    }}
                  >
                    {(bgPreviewUrl || editing.backgroundImageUrl) && (
                      <img
                        src={bgPreviewUrl || editing.backgroundImageUrl!}
                        alt="form background"
                        style={{ width: "100%", height: "100%", objectFit: "contain", opacity: 0.3, position: "absolute", top: 0, left: 0 }}
                      />
                    )}
                    {editing.fields.map((f, i) => {
                      const val = SAMPLE_DATA[f.key] || f.label;
                      return (
                        <div
                          key={`f-${i}`}
                          style={{
                            position: "absolute",
                            left: f.x * PREVIEW_SCALE,
                            top: f.y * PREVIEW_SCALE,
                            width: f.width * PREVIEW_SCALE,
                            fontSize: f.fontSize * PREVIEW_SCALE * 0.35,
                            fontWeight: f.fontWeight || "normal",
                            textAlign: (f.align || "left") as any,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            color: "#1a56db",
                            borderBottom: "1px dashed rgba(26,86,219,0.3)",
                            lineHeight: 1.3,
                          }}
                          title={`${f.label}: X=${f.x} Y=${f.y}`}
                        >
                          {val}
                        </div>
                      );
                    })}
                    {editing.itemsTable && editing.itemsTable.columns.map((col, ci) => {
                      return SAMPLE_ITEMS.slice(0, editing.itemsTable!.maxRows).map((item, ri) => {
                        const val = (item as any)[col.key] || "";
                        const topY = editing.itemsTable!.startY + ri * editing.itemsTable!.rowHeight;
                        return (
                          <div
                            key={`i-${ci}-${ri}`}
                            style={{
                              position: "absolute",
                              left: col.x * PREVIEW_SCALE,
                              top: topY * PREVIEW_SCALE,
                              width: col.width * PREVIEW_SCALE,
                              fontSize: col.fontSize * PREVIEW_SCALE * 0.35,
                              textAlign: col.align as any,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              color: "#047857",
                              lineHeight: 1.3,
                            }}
                          >
                            {val}
                          </div>
                        );
                      });
                    })}
                    {editing.totals.map((t, i) => {
                      const val = SAMPLE_TOTALS[t.key] || t.label;
                      return (
                        <div
                          key={`t-${i}`}
                          style={{
                            position: "absolute",
                            left: t.x * PREVIEW_SCALE,
                            top: t.y * PREVIEW_SCALE,
                            width: t.width * PREVIEW_SCALE,
                            fontSize: t.fontSize * PREVIEW_SCALE * 0.35,
                            textAlign: (t.align || "right") as any,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            color: "#b45309",
                            borderBottom: "1px dashed rgba(180,83,9,0.3)",
                            lineHeight: 1.3,
                          }}
                        >
                          {val}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Dialog open={showAddField} onOpenChange={setShowAddField}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {addFieldType === "header" ? "เพิ่มฟิลด์หัวเอกสาร" : addFieldType === "item" ? "เพิ่มคอลัมน์ตารางสินค้า" : "เพิ่มฟิลด์ยอดรวม"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Select value={selectedFieldKey} onValueChange={setSelectedFieldKey}>
                <SelectTrigger data-testid="select-add-field"><SelectValue placeholder="เลือกฟิลด์..." /></SelectTrigger>
                <SelectContent>
                  {(addFieldType === "header" ? HEADER_FIELD_OPTIONS : addFieldType === "item" ? ITEM_COLUMN_OPTIONS : TOTAL_FIELD_OPTIONS).map(o => (
                    <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddField(false)}>ยกเลิก</Button>
              <Button onClick={addField} disabled={!selectedFieldKey} className="bg-[#05b187] hover:bg-[#05b187]/90" data-testid="button-confirm-add-field">เพิ่ม</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Layout>
    );
  }

  return (
    <Layout title="ฟอร์มพิมพ์กำหนดเอง">
      <SettingsTabs />
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-bold" data-testid="text-page-title">ฟอร์มพิมพ์กำหนดเอง</h1>
            <p className="text-sm text-muted-foreground">สร้างเทมเพลตฟอร์มพิมพ์ให้ตรงกับกระดาษพิมพ์สำเร็จรูปของลูกค้า</p>
          </div>
          <Button onClick={() => openEditor()} className="gap-1.5 bg-[#fb9678] hover:bg-[#fb9678]/90" data-testid="button-new-template">
            <Plus className="h-4 w-4" /> สร้างเทมเพลตใหม่
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
        ) : templates.length === 0 ? (
          <Card className="border-none shadow-sm">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <FileText className="h-12 w-12 text-gray-300 mb-3" />
              <p className="text-sm text-muted-foreground mb-3">ยังไม่มีเทมเพลตฟอร์มพิมพ์</p>
              <Button onClick={() => openEditor()} variant="outline" className="gap-1.5" data-testid="button-create-first">
                <Plus className="h-4 w-4" /> สร้างเทมเพลตแรก
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl: any) => {
              const fields = typeof tpl.fields === "string" ? JSON.parse(tpl.fields) : tpl.fields || [];
              const items = tpl.itemsTable ? (typeof tpl.itemsTable === "string" ? JSON.parse(tpl.itemsTable) : tpl.itemsTable) : null;
              const totals = tpl.totals ? (typeof tpl.totals === "string" ? JSON.parse(tpl.totals) : tpl.totals) : [];
              const docLabel = DOC_TYPES.find(d => d.value === tpl.docType)?.label || tpl.docType;
              return (
                <Card key={tpl.id} className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => openEditor(tpl)} data-testid={`card-template-${tpl.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-sm">{tpl.name}</h3>
                        <p className="text-xs text-muted-foreground">{docLabel} • {tpl.paperSize}</p>
                      </div>
                      {tpl.isDefault && (
                        <span className="text-xs bg-[#05b187]/10 text-[#05b187] px-2 py-0.5 rounded font-medium">ค่าเริ่มต้น</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p>ฟิลด์หัว: {fields.length} รายการ</p>
                      <p>คอลัมน์สินค้า: {items?.columns?.length || 0} คอลัมน์</p>
                      <p>ฟิลด์ยอดรวม: {totals.length} รายการ</p>
                    </div>
                    <div className="flex gap-1 mt-3 pt-2 border-t">
                      <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={(e) => { e.stopPropagation(); openEditor(tpl); }} data-testid={`button-edit-${tpl.id}`}>
                        <Pencil className="h-3 w-3" /> แก้ไข
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 gap-1" onClick={(e) => { e.stopPropagation(); const clone = { ...tpl, id: undefined, name: tpl.name + " (สำเนา)", isDefault: false }; openEditor(clone); }} data-testid={`button-clone-${tpl.id}`}>
                        <Copy className="h-3 w-3" /> สำเนา
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 gap-1 text-red-500 hover:text-red-700 ml-auto" onClick={(e) => { e.stopPropagation(); setDeleteId(tpl.id); }} data-testid={`button-delete-${tpl.id}`}>
                        <Trash2 className="h-3 w-3" /> ลบ
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ</AlertDialogTitle>
            <AlertDialogDescription>ต้องการลบเทมเพลตนี้หรือไม่? การลบไม่สามารถยกเลิกได้</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-red-500 hover:bg-red-600">ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
