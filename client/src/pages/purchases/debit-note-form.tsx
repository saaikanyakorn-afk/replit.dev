import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useDocDropdowns } from "@/hooks/use-doc-dropdowns";
import {
  ArrowLeft, Plus, FileText, Save, Trash2, Package, Home,
  RotateCcw, AlertCircle, Search, Copy, CheckCircle2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker, toDisplayDate } from "@/components/ui/date-picker";
import type { DateFormat } from "@/components/ui/date-picker";
import JournalPreviewPanel, { type JournalLine } from "@/components/journal-preview-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { toLocalDateStr } from "@/lib/utils";

import { useDateSettings } from "@/hooks/use-date-settings";
interface DebitNoteItemForm {
  productId?: number;
  productCode: string;
  productName: string;
  description: string;
  qty: string;
  unit: string;
  unitPrice: string;
  discount: string;
  total: string;
  vatType: string;
}

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cleanDecimal(val: string | number | null | undefined, fallback = "0"): string {
  const n = parseFloat(String(val || fallback));
  if (isNaN(n)) return fallback;
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function calcItemTotal(qty: string, unitPrice: string, discount: string): string {
  const q = parseFloat(qty) || 0;
  const p = parseFloat(unitPrice) || 0;
  const subtotal = q * p;
  if (discount.includes("%")) {
    const d = parseFloat(discount.replace("%", "")) || 0;
    return (subtotal - subtotal * d / 100).toFixed(2);
  }
  const d = parseFloat(discount) || 0;
  return (subtotal - d).toFixed(2);
}

const emptyItem = (): DebitNoteItemForm => ({
  productCode: "",
  productName: "",
  description: "",
  qty: "1",
  unit: "ชิ้น",
  unitPrice: "0",
  discount: "0",
  total: "0",
  vatType: "vat7",
});

const REASON_OPTIONS = [
  { value: "return", label: "คืนสินค้า" },
  { value: "additional_discount", label: "ส่วนลดเพิ่มเติม" },
  { value: "calculation_error", label: "คำนวณผิด" },
  { value: "other", label: "อื่นๆ" },
];

export default function DebitNoteForm() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/purchases/debit-note/new");
  const [matchEdit, paramsEdit] = useRoute("/purchases/debit-note/edit/:id");
  const editingId = matchEdit ? Number(paramsEdit?.id) : null;
  const isNew = !!matchNew;

  const { selectedCompany } = useCompany();
  const { branchList, acctName } = useDocDropdowns();
  const companyId = selectedCompany?.id;
  const defaultVatType = selectedCompany?.vatRegistered ? "vat7" : "non_vat";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [priceMode, setPriceMode] = useState<"excluded" | "included">("excluded");
  const [journalOverrideLines, setJournalOverrideLines] = useState<JournalLine[] | null>(null);
  const [form, setForm] = useState({
    debitNoteNo: "",
    debitNoteDate: toLocalDateStr(new Date()),
    vendorId: undefined as number | undefined,
    vendorName: "",
    vendorAddress: "",
    vendorTaxId: "",
    branch: "",
    sellerBranchId: "",
    refPurchaseInvoiceNo: "",
    refPurchaseInvoiceDate: "",
    refPurchaseInvoiceId: null as number | null,
    refExpenseId: null as number | null,
    refExpenseNo: "",
    taxInvoiceRef: "",
    reason: "return",
    reasonDetail: "",
    paymentMethod: "transfer" as string,
    currencyCode: "THB",
    notes: "",
    status: "approved",
    discountAmount: "0",
  });
  const [items, setItems] = useState<DebitNoteItemForm[]>([emptyItem()]);
  const [loaded, setLoaded] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null);
  const [inlineInvSearch, setInlineInvSearch] = useState<string | null>(null);
  const [showInlineInvDropdown, setShowInlineInvDropdown] = useState(false);

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
  const { data: paymentMethodsList = [] } = useQuery<any[]>({
    queryKey: ["/api/payment-methods", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/payment-methods?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });
  const activePaymentMethods = paymentMethodsList.filter((m: any) => m.active !== false && (m.paymentType || "receive") === "pay");

  const { data: approvedInvoices = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-invoices", companyId, "approved"],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/purchase-invoices?companyId=${companyId}&status=approved`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (isNew && !loaded && activePaymentMethods.length > 0 && (form.paymentMethod === "transfer" || form.paymentMethod === "")) {
      const defaultMethod = activePaymentMethods.find((m: any) => m.isDefault) || activePaymentMethods[0];
      if (defaultMethod) {
        setForm(p => ({ ...p, paymentMethod: defaultMethod.accountCode }));
      }
    }
  }, [activePaymentMethods, isNew, loaded]);

  useEffect(() => {
    if (loaded) return;
    if (isNew) {
      setLoaded(true);
    } else if (editingId) {
      (async () => {
        try {
          const res = await fetch(`/api/purchase-debit-notes/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setForm({
              debitNoteNo: data.debitNoteNo || "",
              debitNoteDate: data.debitNoteDate || "",
              vendorId: data.vendorId || undefined,
              vendorName: data.vendorName || "",
              vendorAddress: data.vendorAddress || "",
              vendorTaxId: data.vendorTaxId || "",
              branch: data.branch || "",
              sellerBranchId: data.sellerBranchId || "",
              refPurchaseInvoiceNo: data.refPurchaseInvoiceNo || "",
              refPurchaseInvoiceDate: data.refPurchaseInvoiceDate || "",
              refPurchaseInvoiceId: data.refPurchaseInvoiceId || null,
              refExpenseId: data.refExpenseId || null,
              refExpenseNo: data.refExpenseNo || "",
              taxInvoiceRef: data.taxInvoiceRef || "",
              reason: data.reason || "return",
              reasonDetail: data.reasonDetail || "",
              paymentMethod: data.paymentMethod || "transfer",
              currencyCode: data.currencyCode || "THB",
              notes: data.notes || "",
              status: data.status || "draft",
              discountAmount: cleanDecimal(data.discountAmount, "0"),
            });
            if (data.items && data.items.length > 0) {
              setItems(data.items.map((it: any) => ({
                productId: it.productId,
                productCode: it.productCode || "",
                productName: it.productName || "",
                description: it.description || "",
                qty: cleanDecimal(it.qty, "1"),
                unit: it.unit || "ชิ้น",
                unitPrice: cleanDecimal(it.unitPrice, "0"),
                discount: cleanDecimal(it.discount, "0"),
                total: cleanDecimal(it.total, "0"),
                vatType: it.vatType || "vat7",
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else {
      setLoaded(true);
    }
  }, [isNew, editingId, companyId, loaded]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/purchase-debit-notes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-debit-notes"] });
      toast({ title: "สร้างใบลดหนี้ซื้อสำเร็จ", variant: "success" as any });
      navigate("/purchases/debit-note");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/purchase-debit-notes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-debit-notes"] });
      toast({ title: "อัพเดทใบลดหนี้ซื้อสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  async function handleSelectInvoice(invoiceId: number) {
    try {
      const res = await fetch(`/api/purchase-debit-notes/ref-purchase/${invoiceId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPriceMode(data.priceMode || "excluded");
        setForm(prev => ({
          ...prev,
          vendorId: data.vendorId || undefined,
          vendorName: data.vendorName || "",
          vendorAddress: data.vendorAddress || "",
          vendorTaxId: data.vendorTaxId || "",
          branch: data.branch || "",
          refPurchaseInvoiceNo: data.apNo || data.refPurchaseInvoiceNo || "",
          refPurchaseInvoiceDate: data.apDate || data.refPurchaseInvoiceDate || "",
          refPurchaseInvoiceId: invoiceId,
        }));
        if (data.items && data.items.length > 0) {
          setItems(data.items.map((it: any) => ({
            productId: it.productId,
            productCode: it.productCode || "",
            productName: it.productName || "",
            description: it.description || "",
            qty: cleanDecimal(it.qty, "1"),
            unit: it.unit || "ชิ้น",
            unitPrice: cleanDecimal(it.unitPrice, "0"),
            discount: cleanDecimal(it.discount, "0"),
            total: cleanDecimal(it.total, "0"),
            vatType: it.vatType || "vat7",
          })));
        }
        toast({ title: "โหลดข้อมูลจากเอกสารซื้อสำเร็จ", variant: "success" as any });
      }
    } catch {
      toast({ title: "ไม่สามารถโหลดข้อมูลเอกสารซื้อได้", variant: "destructive" });
    }
    setInvoiceDialogOpen(false);
  }

  function updateItem(idx: number, field: string, value: string) {
    const newItems = [...items];
    const cleanVal = (field === "unitPrice" || field === "qty" || field === "discount") ? value.replace(/,/g, "") : value;
    (newItems[idx] as any)[field] = cleanVal;
    newItems[idx].total = calcItemTotal(newItems[idx].qty, newItems[idx].unitPrice, newItems[idx].discount);
    setItems(newItems);
  }

  function addItem() {
    setItems([...items, { ...emptyItem(), vatType: defaultVatType }]);
  }

  function removeItem(idx: number) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  }

  function calcTotals() {
    const discRaw = form.discountAmount || "0";
    const vatItemsTotal = items.filter(it => it.vatType === "vat7").reduce((s, it) => s + parseFloat(it.total || "0"), 0);
    const nonVatItemsTotal = items.filter(it => it.vatType !== "vat7").reduce((s, it) => s + parseFloat(it.total || "0"), 0);
    const rawTotal = vatItemsTotal + nonVatItemsTotal;
    const discAmount = parseFloat(discRaw) || 0;

    if (priceMode === "included") {
      const vatIncluded = Math.max(vatItemsTotal - discAmount, 0);
      const vatBase = vatIncluded / 1.07;
      const vatAmount = vatIncluded - vatBase;
      const afterDiscount = vatBase + Math.max(nonVatItemsTotal - Math.max(discAmount - vatItemsTotal, 0), 0);
      return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, totalAmount: afterDiscount + vatAmount };
    } else {
      const afterDiscount = Math.max(rawTotal - discAmount, 0);
      const vatBase = Math.max(vatItemsTotal - discAmount, 0);
      const vatAmount = vatBase * 0.07;
      return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, totalAmount: afterDiscount + vatAmount };
    }
  }

  function handleReset() {
    setForm({
      debitNoteNo: form.debitNoteNo,
      debitNoteDate: toLocalDateStr(new Date()),
      vendorId: undefined,
      vendorName: "",
      vendorAddress: "",
      vendorTaxId: "",
      branch: "",
      sellerBranchId: "",
      refPurchaseInvoiceNo: "",
      refPurchaseInvoiceDate: "",
      refPurchaseInvoiceId: null,
      refExpenseId: null,
      refExpenseNo: "",
      taxInvoiceRef: "",
      reason: "return",
      reasonDetail: "",
      paymentMethod: activePaymentMethods.find((m: any) => m.isDefault)?.accountCode || activePaymentMethods[0]?.accountCode || "transfer",
      currencyCode: "THB",
      notes: "",
      status: "approved",
      discountAmount: "0",
    });
    setItems([{ ...emptyItem(), vatType: defaultVatType }]);
    setPriceMode("excluded");
  }

  async function handleSubmit(approveNow = false) {
    if (!form.vendorName) {
      toast({ title: "กรุณากรอกข้อมูลให้ครบถ้วน", description: "ต้องระบุชื่อผู้ขาย", variant: "destructive" });
      return;
    }
    const totals = calcTotals();
    const payload = {
      ...form,
      vendorId: form.vendorId ? Number(form.vendorId) : null,
      companyId,
      priceMode,
      subtotal: totals.afterDiscount.toFixed(2),
      vatAmount: totals.vatAmount.toFixed(2),
      totalAmount: totals.totalAmount.toFixed(2),
      discountAmount: totals.discountAmount.toFixed(2),
      status: approveNow ? "approved" : form.status,
      items: items.filter(it => it.productName).map(it => ({
        productId: it.productId || null,
        productCode: it.productCode,
        productName: it.productName,
        description: it.description,
        qty: it.qty,
        unit: it.unit,
        unitPrice: it.unitPrice,
        discount: it.discount,
        total: it.total,
        vatType: it.vatType,
      })),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const totals = calcTotals();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLocked = !isNew && ["pending_approval", "paid", "cancelled"].includes(form.status);

  const filteredInvoices = approvedInvoices.filter((inv: any) => {
    if (!invoiceSearch) return true;
    const s = invoiceSearch.toLowerCase();
    return (inv.apNo || "").toLowerCase().includes(s) ||
           (inv.vendorName || "").toLowerCase().includes(s);
  });

  return (
    <Layout>
      <div className="space-y-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/purchases/debit-note")}>ใบลดหนี้ซื้อ (DN)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? (isLocked ? "ดูใบลดหนี้ซื้อ" : "แก้ไขใบลดหนี้ซื้อ") : "สร้างใบลดหนี้ซื้อ"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/purchases/debit-note")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? (isLocked ? "ดูใบลดหนี้ซื้อ" : "แก้ไขใบลดหนี้ซื้อ") : "สร้างใบลดหนี้ซื้อ"}
          </h1>
        </div>

        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>เอกสารนี้มีสถานะ <strong>อนุมัติแล้ว</strong> ไม่สามารถแก้ไขได้</span>
          </div>
        )}

        <div className={`bg-white border rounded-lg shadow-sm ${isLocked ? "opacity-80" : ""}`}>
          <fieldset disabled={isLocked} className="p-2 sm:p-4 space-y-4">
            <div className="border rounded overflow-hidden doc-header-table">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{width:"12%"}} />
                  <col style={{width:"18%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"18%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"10%"}} />
                </colgroup>
                <tbody>
                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top">
                      <div className="text-[10px] text-slate-400 mb-0.5">ค้นหาเอกสารซื้อ</div>
                      <div className="relative">
                        <Input
                          data-testid="input-inline-inv-search"
                          value={inlineInvSearch !== null ? inlineInvSearch : (form.refPurchaseInvoiceNo || "")}
                          onChange={e => {
                            setInlineInvSearch(e.target.value);
                            setShowInlineInvDropdown(true);
                          }}
                          onFocus={() => setShowInlineInvDropdown(true)}
                          onBlur={() => setTimeout(() => setShowInlineInvDropdown(false), 200)}
                          className="h-7 text-xs border-dashed"
                          placeholder="พิมพ์ค้นหา..."
                        />
                        {showInlineInvDropdown && (() => {
                          const searchVal = (inlineInvSearch || "").toLowerCase();
                          const filtered = approvedInvoices.filter((inv: any) =>
                            (inv.apNo || "").toLowerCase().includes(searchVal) ||
                            (inv.vendorName || "").toLowerCase().includes(searchVal)
                          );
                          if (filtered.length === 0) return null;
                          return (
                            <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto min-w-[280px]">
                              {filtered.map((inv: any) => (
                                <button key={inv.id} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--theme-primary-light)] border-b last:border-b-0"
                                  onMouseDown={e => { e.preventDefault(); handleSelectInvoice(inv.id); setInlineInvSearch(null); setShowInlineInvDropdown(false); }}>
                                  <span className="font-medium text-[var(--theme-primary)]">{inv.apNo || "-"}</span>
                                  <span className="text-slate-500 ml-1.5">{inv.vendorName}</span>
                                  <span className="text-slate-400 ml-1.5">{fmt(inv.totalAmount)}</span>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={5}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ชื่อผู้ขาย</div>
                      <Input
                        data-testid="input-vendor-name"
                        value={form.vendorName}
                        onChange={e => setForm(p => ({ ...p, vendorName: e.target.value }))}
                        className="h-7 text-xs border-dashed w-full"
                        placeholder="จะเติมอัตโนมัติจากเอกสารซื้อ"
                      />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">อ้างอิงเอกสาร</div>
                      <div className="flex flex-col gap-0.5">
                        {form.refPurchaseInvoiceNo && (
                          <span data-testid="input-ref-invoice" className="h-7 flex items-center text-xs text-slate-600">
                            {form.refPurchaseInvoiceNo}
                          </span>
                        )}
                        {form.refExpenseNo && (
                          <span data-testid="text-ref-expense" className="h-7 flex items-center text-xs text-slate-600">
                            {form.refExpenseNo}
                          </span>
                        )}
                        {!form.refPurchaseInvoiceNo && !form.refExpenseNo && (
                          <span className="h-7 flex items-center text-xs text-slate-400">-</span>
                        )}
                      </div>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ชื่อผู้ขาย</div>
                      <Input
                        data-testid="input-vendor-name-row2"
                        value={form.vendorName}
                        onChange={e => setForm(p => ({ ...p, vendorName: e.target.value }))}
                        className="h-7 text-xs border-dashed w-full"
                        placeholder="ใส่ชื่อเต็ม หรือ ค้นหาจากบัญชีรายชื่อ"
                      />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">สาขา</div>
                      <Input data-testid="input-branch" value={form.branch || ""} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="สำนักงานใหญ่" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">วันที่ออกเอกสาร</div>
                      <DatePicker data-testid="input-debit-note-date" value={form.debitNoteDate} onChange={v => setForm(p => ({ ...p, debitNoteDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ที่อยู่</div>
                      <Textarea data-testid="input-address" value={form.vendorAddress} onChange={e => setForm(p => ({ ...p, vendorAddress: e.target.value }))} rows={2} className="text-xs resize-none border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขประจำตัวผู้เสียภาษี</div>
                      <Input data-testid="input-tax-id" value={form.vendorTaxId} onChange={e => setForm(p => ({ ...p, vendorTaxId: e.target.value }))} className="h-7 text-xs border-dashed" />
                      <div className="mt-1.5">
                        <div className="text-[10px] text-slate-400 mb-0.5">สาเหตุการลดหนี้</div>
                        <Select value={form.reason} onValueChange={v => setForm(p => ({ ...p, reason: v }))}>
                          <SelectTrigger data-testid="select-reason" className="h-7 text-xs border-dashed">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {REASON_OPTIONS.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top bg-amber-50/70" colSpan={2}>
                      <div className="text-[10px] text-amber-600 font-semibold mb-0.5">วิธีชำระเงิน</div>
                      <Select
                        value={(() => {
                          const pm = form.paymentMethod;
                          if (!pm) return "";
                          const found = activePaymentMethods.find((m: any) => m.accountCode === pm && m.isDefault)
                            || activePaymentMethods.find((m: any) => m.accountCode === pm);
                          return found ? `pm_${found.id}` : pm;
                        })()}
                        onValueChange={v => {
                          const pm = activePaymentMethods.find((m: any) => `pm_${m.id}` === v);
                          setForm(p => ({ ...p, paymentMethod: pm ? pm.accountCode : v }));
                        }}
                      >
                        <SelectTrigger data-testid="select-payment-method" className="h-7 text-xs border-dashed">
                          <SelectValue placeholder="เลือกวิธีชำระเงิน" />
                        </SelectTrigger>
                        <SelectContent>
                          {activePaymentMethods.length > 0 ? (
                            activePaymentMethods.map((m: any) => (
                              <SelectItem key={m.id} value={`pm_${m.id}`}>
                                {acctName(m)} ({m.accountCode})
                              </SelectItem>
                            ))
                          ) : (
                            <>
                              <SelectItem value="cash">เงินสด</SelectItem>
                              <SelectItem value="transfer">โอนเงิน</SelectItem>
                              <SelectItem value="cheque">เช็ค</SelectItem>
                              <SelectItem value="credit_card">บัตรเครดิต</SelectItem>
                              <SelectItem value="other">อื่นๆ</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">อีเมล์</div>
                      <Input data-testid="input-email" value={form.contactEmail || ""} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">โทรศัพท์</div>
                      <Input data-testid="input-phone" value={form.contactPhone || ""} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">สกุลเงิน</div>
                      <div className="flex items-center gap-1">
                        <Select value={form.currencyCode} onValueChange={v => setForm(p => ({ ...p, currencyCode: v }))}>
                          <SelectTrigger data-testid="select-currency" className="h-7 text-xs w-[70px] border-dashed px-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="THB">THB</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                            <SelectItem value="EUR">EUR</SelectItem>
                            <SelectItem value="JPY">JPY</SelectItem>
                            <SelectItem value="CNY">CNY</SelectItem>
                            <SelectItem value="GBP">GBP</SelectItem>
                            <SelectItem value="SGD">SGD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่ใบลดหนี้ซื้อ</div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500 font-medium">DN</span>
                        <span className="text-slate-300">|</span>
                        <Input data-testid="input-debit-note-no" value={form.debitNoteNo} onChange={e => setForm(p => ({ ...p, debitNoteNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td className="px-3 py-1.5" colSpan={8}>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">สาขาผู้ออก:</span>
                          <select data-testid="select-seller-branch" value={form.sellerBranchId || ""} onChange={e => setForm(p => ({ ...p, sellerBranchId: e.target.value }))} className="h-7 text-xs border rounded px-2 bg-white min-w-[160px]">
                            <option value="">-- ไม่ระบุ --</option>
                            {branchList.map(b => <option key={b.id} value={b.code}>{b.code} - {b.name}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">เลขที่เอกสารต้นฉบับ:</span>
                          <Input
                            data-testid="input-tax-invoice-ref"
                            value={form.taxInvoiceRef}
                            onChange={e => setForm(p => ({ ...p, taxInvoiceRef: e.target.value }))}
                            className="h-7 text-xs border-dashed w-[240px]"
                            placeholder="เลขที่ใบกำกับภาษีเดิมที่ลดหนี้"
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="border rounded overflow-visible doc-items-table">
              <table className="w-full text-sm" style={{tableLayout:"fixed"}}>
                <colgroup>
                  <col style={{width:"3%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"auto"}} />
                  <col style={{width:"7%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"5%"}} />
                  <col style={{width:"11%"}} />
                  <col style={{width:"6%"}} />
                </colgroup>
                <thead>
                  <tr className="bg-[var(--theme-primary)]">
                    <th className="text-center font-medium text-white text-xs py-2 px-1">#</th>
                    <th className="font-medium text-white text-xs py-2 px-1">รหัส</th>
                    <th className="font-medium text-white text-xs py-2 px-1">สินค้า</th>
                    <th className="text-center font-medium text-white text-xs py-2 px-1">จำนวน</th>
                    <th className="text-center py-1 px-1">
                      <Select value={priceMode} onValueChange={(v: "excluded" | "included") => setPriceMode(v)}>
                        <SelectTrigger data-testid="select-price-mode" className="h-7 text-xs border-white/60 bg-white/20 text-white font-medium hover:bg-white/35 [&>svg]:text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="excluded">ราคา ไม่ รวมภาษี</SelectItem>
                          <SelectItem value="included">ราคารวมภาษี</SelectItem>
                        </SelectContent>
                      </Select>
                    </th>
                    <th className="text-center font-medium text-white text-xs py-2 px-1">ส่วนลด</th>
                    <th className="text-center font-medium text-white text-xs py-2 px-1">VAT</th>
                    <th className="text-right font-medium text-white text-xs py-2 px-1">มูลค่าก่อนภาษี</th>
                    <th className="py-2 px-0"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="align-top hover:bg-orange-50/30 border-b">
                      <td className="text-center text-xs text-slate-500 pt-3 px-1">{idx + 1}</td>
                      <td className="px-1 pt-1.5">
                        <div className="flex items-center gap-1">
                          <Package className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                          <Input
                            data-testid={`input-product-code-${idx}`}
                            className="h-7 text-xs border-dashed w-full min-w-0 px-1.5"
                            placeholder="รหัส"
                            value={item.productCode}
                            onChange={e => updateItem(idx, "productCode", e.target.value)}
                          />
                        </div>
                      </td>
                      <td className="px-1 pt-1.5">
                        <textarea
                          data-testid={`input-product-name-${idx}`}
                          className="w-full min-w-0 text-xs border border-dashed rounded px-2 py-1.5 resize-y min-h-[28px] focus:outline-none focus:ring-1 focus:ring-orange-400 bg-transparent"
                          rows={1}
                          placeholder="ชื่อสินค้า/บริการ"
                          value={item.productName}
                          onChange={e => updateItem(idx, "productName", e.target.value)}
                        />
                      </td>
                      <td className="px-1 pt-1.5">
                        <Input data-testid={`input-qty-${idx}`} inputMode="decimal" className="h-9 text-sm text-center border-dashed w-full min-w-0 px-1" value={item.qty} onChange={e => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) updateItem(idx, "qty", v); }} />
                      </td>
                      <td className="px-1 pt-1.5">
                        <Input data-testid={`input-price-${idx}`} inputMode="decimal" className="h-9 text-sm text-right border-dashed w-full min-w-0 px-1" value={editingPriceIdx === idx ? item.unitPrice : (parseFloat(item.unitPrice || "0") > 0 ? fmt(item.unitPrice) : item.unitPrice)} onChange={e => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) updateItem(idx, "unitPrice", v); }} onFocus={() => setEditingPriceIdx(idx)} onBlur={() => setEditingPriceIdx(null)} />
                      </td>
                      <td className="px-1 pt-1.5">
                        <Input data-testid={`input-discount-${idx}`} className="h-9 text-sm text-right border-dashed w-full min-w-0 px-1" value={item.discount} onChange={e => { const v = e.target.value; if (/^\d*\.?\d*%?$/.test(v)) updateItem(idx, "discount", v); }} placeholder="0" />
                      </td>
                      <td className="text-center pt-3">
                        <span className="text-sm font-medium text-slate-600">
                          {item.vatType === "vat7" ? "7%" : item.vatType === "zero_rated" ? "0%" : "-"}
                        </span>
                      </td>
                      <td className="text-right pt-3 px-1">
                        {priceMode === "included" && item.vatType === "vat7" ? (
                          <span className="text-sm font-normal text-slate-800">{fmt((parseFloat(item.total || "0") / 1.07).toFixed(2))}</span>
                        ) : (
                          <span className="text-sm font-normal text-slate-800">{fmt(item.total)}</span>
                        )}
                      </td>
                      <td className="text-center pt-2 px-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-[#f94d4d] hover:text-white hover:bg-[#f94d4d]" onClick={() => removeItem(idx)} disabled={items.length === 1} data-testid={`button-remove-item-${idx}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button data-testid="button-add-item" onClick={addItem} className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium px-2 py-1.5 hover:bg-green-50 rounded">
              <Plus className="h-4 w-4" /> เพิ่มรายการ
            </button>

            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 doc-summary-section">
              <div className="flex-1 space-y-3">
                <div>
                  <Textarea data-testid="input-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="text-xs border-dashed" placeholder="หมายเหตุ..." />
                </div>
              </div>

              <table className="border-collapse" style={{ fontSize: 14, marginLeft: "auto" }}>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="text-right pr-4 py-2 text-slate-500 whitespace-nowrap">ยอดรวมรายการ:</td>
                    <td className="text-right py-2 text-slate-700 w-40 pr-2">{fmt(totals.rawTotal)}</td>
                  </tr>
                  <tr className="border-b border-[var(--theme-primary)]/20">
                    <td className="text-right pr-4 py-2 text-slate-600 font-semibold whitespace-nowrap align-top">ส่วนลด:</td>
                    <td className="text-right py-1.5 pr-2">
                      <input data-testid="input-discount-amount" inputMode="decimal" value={form.discountAmount} onChange={e => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) setForm(p => ({ ...p, discountAmount: v })); }} style={{ fontSize: 13 }} className="h-8 w-28 text-right border border-slate-300 rounded bg-white px-2 outline-none focus:ring-1 focus:ring-[var(--theme-primary)]" placeholder="0" />
                    </td>
                  </tr>
                  <tr className="bg-[var(--theme-primary-light)] border-b border-[var(--theme-primary)]/20">
                    <td className="text-right pr-4 py-2 text-slate-700 font-semibold whitespace-nowrap">ยอดหลังส่วนลด:</td>
                    <td className="text-right py-2 text-slate-800 pr-2">{fmt(totals.afterDiscount)}</td>
                  </tr>
                  <tr className="border-b border-[var(--theme-primary)]/20">
                    <td className="text-right pr-4 py-2 text-slate-700 whitespace-nowrap">ภาษีมูลค่าเพิ่ม 7%:</td>
                    <td className="text-right py-2 text-slate-800 pr-2">{fmt(totals.vatAmount)}</td>
                  </tr>
                  <tr className="bg-[var(--theme-primary-light)]">
                    <td className="text-right pr-4 py-2.5 font-bold text-[var(--theme-primary)] whitespace-nowrap" style={{ fontSize: 15 }}>รวมสุทธิ:</td>
                    <td className="text-right py-2.5 font-bold text-[var(--theme-primary)] pr-2" style={{ fontSize: 15 }}>{fmt(totals.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <JournalPreviewPanel
                companyId={companyId ?? null}
                documentType="debit_note"
                subtotal={totals.afterDiscount?.toFixed(2) || "0"}
                vatAmount={totals.vatAmount?.toFixed(2) || "0"}
                withholdingTax="0"
                paymentMethod={form.paymentMethod}
                currencyCode={form.currencyCode}
                exchangeRate="1"
                              onLinesChange={setJournalOverrideLines}
              />
            </div>

            <div className="flex items-center justify-center gap-3 pt-4 border-t">
              <Button data-testid="button-reset" variant="outline" size="sm" className="h-9 px-6 gap-1.5" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" /> รีเซ็ต
              </Button>
              <Button
                data-testid="button-approve"
                variant="outline"
                size="sm"
                className="h-9 px-6 gap-1.5 border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                onClick={() => handleSubmit(true)}
                disabled={isSaving || isLocked}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> อนุมัติ
              </Button>
              <Button
                data-testid="button-submit"
                onClick={() => handleSubmit(false)}
                disabled={isSaving || isLocked}
                size="sm"
                className="h-9 px-8 gap-1.5 text-sm"
              >
                <Save className="h-3.5 w-3.5" />
                {isLocked ? "ล็อคแล้ว" : isSaving ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </fieldset>
        </div>
      </div>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
              เลือกเอกสารซื้ออ้างอิง
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="input-invoice-search"
                placeholder="ค้นหาเลขที่เอกสารซื้อ หรือ ชื่อผู้ขาย..."
                value={invoiceSearch}
                onChange={e => setInvoiceSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="border rounded max-h-[50vh] overflow-y-auto">
              {filteredInvoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  ไม่พบเอกสารซื้อที่อนุมัติแล้ว
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0">
                    <TableRow>
                      <TableHead className="text-xs">เลขที่</TableHead>
                      <TableHead className="text-xs">วันที่</TableHead>
                      <TableHead className="text-xs">ผู้ขาย</TableHead>
                      <TableHead className="text-xs text-right">จำนวนเงิน</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv: any) => (
                      <TableRow key={inv.id} className="hover:bg-[var(--theme-primary-light)]/50 cursor-pointer" data-testid={`row-ref-invoice-${inv.id}`}>
                        <TableCell className="text-sm font-medium text-[var(--theme-primary)]">{inv.apNo || "-"}</TableCell>
                        <TableCell className="text-sm">{formatDate(inv.apDate, dateEra, dateFormat)}</TableCell>
                        <TableCell className="text-sm">{inv.vendorName}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{fmt(inv.totalAmount)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-[var(--theme-primary)] text-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)]"
                            onClick={() => handleSelectInvoice(inv.id)}
                            data-testid={`button-select-invoice-${inv.id}`}
                          >
                            เลือก
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
