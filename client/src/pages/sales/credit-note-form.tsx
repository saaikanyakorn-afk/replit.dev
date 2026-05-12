import { useState, useEffect } from "react";
import { FetchRateButton } from "@/components/fetch-rate-button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute, useSearch } from "wouter";
import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import {
  ArrowLeft, Plus, FileText, Save, Trash2, Package, Home,
  RotateCcw, AlertCircle, Search, Copy, CheckCircle2,
  Send, Mail, Loader2, FileDown
} from "lucide-react";
import { EtaxSendDialog } from "@/components/etax-send-dialog";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker, toDisplayDate } from "@/components/ui/date-picker";
import type { DateFormat } from "@/components/ui/date-picker";
import JournalPreviewPanel, { type JournalLine } from "@/components/journal-preview-panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { useDocDropdowns } from "@/hooks/use-doc-dropdowns";
import { toLocalDateStr } from "@/lib/utils";

import { useDateSettings } from "@/hooks/use-date-settings";
interface CreditNoteItemForm {
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

const emptyItem = (): CreditNoteItemForm => ({
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

function EtaxCreditNoteButton({ creditNoteId, companyId, creditNoteNo }: { creditNoteId: number | null; companyId: number | undefined; creditNoteNo?: string }) {
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const { toast } = useToast();

  const { data: etaxSettings } = useQuery({
    queryKey: ["/api/etax/settings", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/etax/settings?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: cnData } = useQuery({
    queryKey: ["/api/sales-credit-notes", creditNoteId],
    queryFn: async () => {
      const res = await fetch(`/api/sales-credit-notes/${creditNoteId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!creditNoteId,
  });

  if (!etaxSettings?.etaxEnabled || !creditNoteId) return null;

  const isSent = !!cnData?.etaxSentAt;

  const handleGeneratePdfA3 = async () => {
    setLoadingPdf(true);
    try {
      const res = await fetch("/api/etax/credit-note/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ creditNoteId, companyId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match ? decodeURIComponent(match[1]) : "etax_CN_PDFA3.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ดาวน์โหลด e-Tax PDF/A-3 สำเร็จ" });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setLoadingPdf(false);
  };

  return (
    <div className="flex flex-col gap-2">
      {isSent && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5">
          <Mail className="h-3.5 w-3.5" />
          <span>ส่ง e-Tax แล้ว: {cnData.etaxSentTo} ({new Date(cnData.etaxSentAt).toLocaleDateString("th-TH")})</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Button
          data-testid="button-etax-email-cn"
          variant="outline"
          size="sm"
          className={`h-8 gap-1.5 ${isSent ? "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700" : "border-[var(--theme-primary)]/50 bg-[var(--theme-primary)]/10 hover:bg-[var(--theme-primary)]/20 text-[var(--theme-primary)]"}`}
          onClick={() => setShowSendDialog(true)}
        >
          <Send className="h-3.5 w-3.5" />
          {isSent ? "ส่งซ้ำ e-Tax Invoice" : "ส่ง e-Tax Invoice"}
        </Button>
        {isSent && (
          <Button
            data-testid="button-etax-pdf-cn"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
            onClick={handleGeneratePdfA3}
            disabled={loadingPdf}
          >
            {loadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            ดาวน์โหลด PDF/A-3
          </Button>
        )}
      </div>
      <EtaxSendDialog
        open={showSendDialog}
        onOpenChange={setShowSendDialog}
        docType="credit_note"
        creditNoteId={creditNoteId}
        creditNoteNo={creditNoteNo || cnData?.creditNoteNo || ""}
      />
    </div>
  );
}

export default function CreditNoteForm() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/sales/credit-note/new");
  const [matchEdit, paramsEdit] = useRoute("/sales/credit-note/edit/:id");
  const editingId = matchEdit ? Number(paramsEdit?.id) : null;
  const isNew = !!matchNew;
  const searchString = useSearch();
  const cnSearchParams = isNew ? new URLSearchParams(searchString) : null;
  const fromTaxInvoiceId = cnSearchParams?.get("fromTaxInvoice") || null;

  const { selectedCompany } = useCompany();
  const { branchList, acctName } = useDocDropdowns();
  const companyId = selectedCompany?.id;
  const defaultVatType = selectedCompany?.vatRegistered ? "vat7" : "non_vat";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [priceMode, setPriceMode] = useState<"excluded" | "included">("excluded");
  const [journalOverrideLines, setJournalOverrideLines] = useState<JournalLine[] | null>(null);
  const [returnToStock, setReturnToStock] = useState(false);
  const [returnWarehouseId, setReturnWarehouseId] = useState<number | undefined>(undefined);
  const [form, setForm] = useState({
    creditNoteNo: "",
    creditNoteDate: toLocalDateStr(new Date()),
    customerId: undefined as number | undefined,
    customerName: "",
    customerAddress: "",
    customerTaxId: "",
    branch: "",
    refTaxInvoiceNo: "",
    refTaxInvoiceDate: "",
    refTaxInvoiceId: null as number | null,
    reason: "return",
    reasonDetail: "",
    paymentMethod: "transfer" as string,
    currencyCode: "THB",
    exchangeRate: "1",
    notes: "",
    status: "approved",
    discountAmount: "0",
    originalInvoiceAmount: "",
    correctInvoiceAmount: "",
    sellerBranchId: selectedCompany?.sellerBranchId || "00000",
  });
  const [items, setItems] = useState<CreditNoteItemForm[]>([emptyItem()]);
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
  const activePaymentMethods = paymentMethodsList.filter((m: any) => m.active !== false);

  useEffect(() => {
    if (!editingId && activePaymentMethods.length > 0 && !form.paymentMethod) {
      const defaultPm = activePaymentMethods.find((m: any) => m.isDefault);
      if (defaultPm) {
        setForm(p => ({ ...p, paymentMethod: defaultPm.accountCode || defaultPm.name || defaultPm.nameTh || "" }));
      }
    }
  }, [activePaymentMethods, editingId]);

  const { data: approvedInvoices = [] } = useQuery<any[]>({
    queryKey: ["/api/tax-invoices", companyId, "approved"],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/tax-invoices?companyId=${companyId}&status=approved`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory/warehouses", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/inventory/warehouses?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (isNew && activePaymentMethods.length > 0 && (form.paymentMethod === "transfer" || form.paymentMethod === "")) {
      const defaultMethod = activePaymentMethods.find((m: any) => m.isDefault) || activePaymentMethods[0];
      if (defaultMethod) {
        setForm(p => ({ ...p, paymentMethod: defaultMethod.accountCode || defaultMethod.name || defaultMethod.nameTh || "transfer" }));
      }
    }
  }, [activePaymentMethods, isNew, form.paymentMethod]);

  useEffect(() => {
    if (loaded) return;
    if (isNew && fromTaxInvoiceId) {
      (async () => {
        try {
          const res = await fetch(`/api/sales-credit-notes/ref-invoice/${fromTaxInvoiceId}`, { credentials: "include" });
          if (res.ok) {
            const tiv = await res.json();
            setPriceMode(tiv.priceMode || "excluded");
            setForm(p => ({
              ...p,
              customerId: tiv.customerId || undefined,
              customerName: tiv.customerName || "",
              customerAddress: tiv.customerAddress || "",
              customerTaxId: tiv.customerTaxId || "",
              branch: tiv.branch || "",
              refTaxInvoiceNo: tiv.taxInvoiceNo || "",
              refTaxInvoiceDate: tiv.taxInvoiceDate || "",
              refTaxInvoiceId: tiv.id,
              currencyCode: tiv.currencyCode || "THB",
              sellerBranchId: tiv.sellerBranchId || p.sellerBranchId,
              originalInvoiceAmount: cleanDecimal(tiv.subtotal || tiv.totalAmount, ""),
              ...(tiv.paymentMethod ? { paymentMethod: tiv.paymentMethod } : {}),
            }));
            if (tiv.items && tiv.items.length > 0) {
              setItems(tiv.items.map((it: any) => ({
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
    } else if (isNew) {
      setLoaded(true);
    } else if (editingId) {
      (async () => {
        try {
          const res = await fetch(`/api/sales-credit-notes/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setReturnToStock(data.return_to_stock || data.returnToStock || false);
            setReturnWarehouseId(data.return_warehouse_id || data.returnWarehouseId || undefined);
            setForm({
              creditNoteNo: data.creditNoteNo || "",
              creditNoteDate: data.creditNoteDate || "",
              customerId: data.customerId || undefined,
              customerName: data.customerName || "",
              customerAddress: data.customerAddress || "",
              customerTaxId: data.customerTaxId || "",
              branch: data.branch || "",
              refTaxInvoiceNo: data.refTaxInvoiceNo || "",
              refTaxInvoiceDate: data.refTaxInvoiceDate || "",
              refTaxInvoiceId: data.refTaxInvoiceId || null,
              reason: data.reason || "return",
              reasonDetail: data.reasonDetail || "",
              paymentMethod: data.paymentMethod || "transfer",
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              notes: data.notes || "",
              status: data.status || "draft",
              discountAmount: cleanDecimal(data.discountAmount, "0"),
              originalInvoiceAmount: cleanDecimal(data.originalInvoiceAmount, ""),
              correctInvoiceAmount: cleanDecimal(data.correctInvoiceAmount, ""),
              sellerBranchId: data.sellerBranchId || selectedCompany?.sellerBranchId || "00000",
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
      const res = await apiRequest("POST", "/api/sales-credit-notes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-credit-notes"] });
      toast({ title: "สร้างใบลดหนี้สำเร็จ", variant: "success" as any });
      navigate("/sales/credit-note");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/sales-credit-notes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-credit-notes"] });
      toast({ title: "อัพเดทใบลดหนี้สำเร็จ", variant: "success" as any });
      navigate("/sales/credit-note");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  async function handleSelectInvoice(invoiceId: number) {
    try {
      const res = await fetch(`/api/sales-credit-notes/ref-invoice/${invoiceId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPriceMode(data.priceMode || "excluded");
        setForm(prev => ({
          ...prev,
          customerId: data.customerId || undefined,
          customerName: data.customerName || "",
          customerAddress: data.customerAddress || "",
          customerTaxId: data.customerTaxId || "",
          branch: data.branch || "",
          refTaxInvoiceNo: data.taxInvoiceNo || data.refTaxInvoiceNo || "",
          refTaxInvoiceDate: data.taxInvoiceDate || data.refTaxInvoiceDate || "",
          refTaxInvoiceId: invoiceId,
          originalInvoiceAmount: cleanDecimal(data.subtotal || data.totalAmount, ""),
          ...(data.paymentMethod ? { paymentMethod: data.paymentMethod } : {}),
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
        toast({ title: "โหลดข้อมูลจากใบกำกับภาษีสำเร็จ", variant: "success" as any });
      }
    } catch {
      toast({ title: "ไม่สามารถโหลดข้อมูลใบกำกับภาษีได้", variant: "destructive" });
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
    const discAmount = parseFloat(discRaw) || 0;

    const vatItemsFromItems = items.filter(it => it.vatType === "vat7").reduce((s, it) => s + parseFloat(it.total || "0"), 0);
    const nonVatItemsFromItems = items.filter(it => it.vatType !== "vat7").reduce((s, it) => s + parseFloat(it.total || "0"), 0);
    const rawTotalFromItems = vatItemsFromItems + nonVatItemsFromItems;

    // ถ้ากรอกมูลค่าเดิม+ถูกต้อง → ผลต่างเป็น rawTotal override
    const origAmt = parseFloat(form.originalInvoiceAmount || "0");
    const corrAmt = parseFloat(form.correctInvoiceAmount || "0");
    const hasOverride = form.originalInvoiceAmount !== "" && (origAmt > 0 || form.correctInvoiceAmount !== "");
    const diffRaw = hasOverride ? Math.max(origAmt - corrAmt, 0) : null;

    const rawTotal = diffRaw !== null ? diffRaw : rawTotalFromItems;
    // หาสัดส่วน VAT จาก line items (ถ้าไม่มี items ให้ assume vat7 ทั้งหมด)
    const vatRatio = rawTotalFromItems > 0 ? vatItemsFromItems / rawTotalFromItems : 1;
    const vatItemsTotal = diffRaw !== null ? rawTotal * vatRatio : vatItemsFromItems;

    if (priceMode === "included") {
      const vatIncluded = Math.max(vatItemsTotal - discAmount, 0);
      const vatBase = vatIncluded / 1.07;
      const vatAmount = vatIncluded - vatBase;
      const nonVatPart = diffRaw !== null ? rawTotal * (1 - vatRatio) : nonVatItemsFromItems;
      const afterDiscount = vatBase + Math.max(nonVatPart - Math.max(discAmount - vatItemsTotal, 0), 0);
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
      creditNoteNo: form.creditNoteNo,
      creditNoteDate: toLocalDateStr(new Date()),
      customerId: undefined,
      customerName: "",
      customerAddress: "",
      customerTaxId: "",
      branch: "",
      refTaxInvoiceNo: "",
      refTaxInvoiceDate: "",
      refTaxInvoiceId: null,
      reason: "return",
      reasonDetail: "",
      paymentMethod: (() => { const dm = activePaymentMethods.find((m: any) => m.isDefault) || activePaymentMethods[0]; return dm ? (dm.accountCode || dm.name || dm.nameTh || "transfer") : "transfer"; })(),
      currencyCode: "THB",
      notes: "",
      status: "approved",
      discountAmount: "0",
      originalInvoiceAmount: "",
      correctInvoiceAmount: "",
      sellerBranchId: selectedCompany?.sellerBranchId || "00000",
    });
    setItems([{ ...emptyItem(), vatType: defaultVatType }]);
    setPriceMode("excluded");
    setReturnToStock(false);
    setReturnWarehouseId(undefined);
  }

  async function handleSubmit(approveNow = false) {
    if (!form.customerName) {
      toast({ title: "กรุณากรอกข้อมูลให้ครบถ้วน", description: "ต้องระบุชื่อลูกค้า", variant: "destructive" });
      return;
    }
    const totals = calcTotals();
    const payload = {
      ...form,
      customerId: form.customerId ? Number(form.customerId) : null,
      companyId,
      priceMode,
      subtotal: totals.afterDiscount.toFixed(2),
      vatAmount: totals.vatAmount.toFixed(2),
      totalAmount: totals.totalAmount.toFixed(2),
      discountAmount: totals.discountAmount.toFixed(2),
      status: approveNow ? "approved" : form.status,
      returnToStock,
      returnWarehouseId: returnToStock ? (returnWarehouseId || null) : null,
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
    return (inv.taxInvoiceNo || "").toLowerCase().includes(s) ||
           (inv.customerName || "").toLowerCase().includes(s);
  });

  return (
    <Layout>
      <div className="space-y-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/sales/credit-note")}>ใบลดหนี้ขาย (CN)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? (isLocked ? "ดูใบลดหนี้" : "แก้ไขใบลดหนี้") : "สร้างใบลดหนี้"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/sales/credit-note")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? (isLocked ? "ดูใบลดหนี้" : "แก้ไขใบลดหนี้") : "สร้างใบลดหนี้"}
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
                      <div className="text-[10px] text-slate-400 mb-0.5">ค้นหาใบกำกับ</div>
                      <div className="relative">
                        <Input
                          data-testid="input-inline-inv-search"
                          value={inlineInvSearch !== null ? inlineInvSearch : (form.refTaxInvoiceNo || "")}
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
                            (inv.taxInvoiceNo || "").toLowerCase().includes(searchVal) ||
                            (inv.customerName || "").toLowerCase().includes(searchVal)
                          );
                          if (filtered.length === 0) return null;
                          return (
                            <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto min-w-[280px]">
                              {filtered.map((inv: any) => (
                                <button key={inv.id} className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--theme-primary-light)] border-b last:border-b-0"
                                  onMouseDown={e => { e.preventDefault(); handleSelectInvoice(inv.id); setInlineInvSearch(null); setShowInlineInvDropdown(false); }}>
                                  <span className="font-medium text-[var(--theme-primary)]">{inv.taxInvoiceNo || "-"}</span>
                                  <span className="text-slate-500 ml-1.5">{inv.customerName}</span>
                                  <span className="text-slate-400 ml-1.5">{fmt(inv.totalAmount)}</span>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={5}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ชื่อลูกค้า</div>
                      <Input
                        data-testid="input-customer-name"
                        value={form.customerName}
                        onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))}
                        className="h-7 text-xs border-dashed w-full"
                        placeholder="จะเติมอัตโนมัติจากใบกำกับภาษี"
                      />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">อ้างอิงใบกำกับภาษี</div>
                      <Input
                        data-testid="input-ref-invoice"
                        value={form.refTaxInvoiceNo}
                        readOnly
                        className="h-7 text-xs border-dashed bg-slate-50"
                        placeholder="เลือกอ้างอิง..."
                      />
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ชื่อลูกค้า</div>
                      <Input
                        data-testid="input-customer-name-row2"
                        value={form.customerName}
                        onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))}
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
                      <DatePicker data-testid="input-credit-note-date" value={form.creditNoteDate} onChange={v => setForm(p => ({ ...p, creditNoteDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ที่อยู่</div>
                      <Textarea data-testid="input-address" value={form.customerAddress} onChange={e => setForm(p => ({ ...p, customerAddress: e.target.value }))} rows={2} className="text-xs resize-none border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขประจำตัวผู้เสียภาษี</div>
                      <Input data-testid="input-tax-id" value={form.customerTaxId} onChange={e => setForm(p => ({ ...p, customerTaxId: e.target.value }))} className="h-7 text-xs border-dashed" />
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
                      <Select value={form.paymentMethod} onValueChange={v => setForm(p => ({ ...p, paymentMethod: v }))}>
                        <SelectTrigger data-testid="select-payment-method" className="h-7 text-xs border-dashed">
                          <SelectValue placeholder="เลือกวิธีชำระเงิน" />
                        </SelectTrigger>
                        <SelectContent>
                          {activePaymentMethods.map((m: any) => (
                            <SelectItem key={m.id} value={m.accountCode || m.name || m.nameTh || String(m.id)}>
                              {acctName(m)} ({m.accountCode || m.name || m.nameTh})
                            </SelectItem>
                          ))}
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
                        <Select value={form.currencyCode} onValueChange={v => setForm(p => ({ ...p, currencyCode: v, exchangeRate: v === "THB" ? "1" : p.exchangeRate }))}>
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
                        {form.currencyCode !== "THB" && (
                          <>
                            <Input data-testid="input-exchange-rate" value={form.exchangeRate} onChange={e => setForm(p => ({ ...p, exchangeRate: e.target.value }))} className="h-7 text-xs border-dashed w-20" placeholder="อัตราแลกเปลี่ยน" />
                            <FetchRateButton currency={form.currencyCode} date={form.creditNoteDate} onRate={r => setForm(p => ({ ...p, exchangeRate: String(r) }))} rateType="selling" />
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่ใบลดหนี้</div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500 font-medium">CN</span>
                        <span className="text-slate-300">|</span>
                        <Input data-testid="input-credit-note-no" value={form.creditNoteNo} onChange={e => setForm(p => ({ ...p, creditNoteNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
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
                  <tr className="bg-[#8b5cf6]">
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
                    <tr key={idx} className="align-top hover:bg-sky-50/30 border-b">
                      <td className="text-center text-xs text-slate-500 pt-3 px-1">{idx + 1}</td>
                      <td className="px-1 pt-1.5">
                        <div className="flex items-center gap-1">
                          <Package className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />
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
                          className="w-full min-w-0 text-xs border border-dashed rounded px-2 py-1.5 resize-y min-h-[28px] focus:outline-none focus:ring-1 focus:ring-sky-400 bg-transparent"
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
                      <td className="py-1 px-1">
                        <Select value={item.vatType} onValueChange={v => updateItem(idx, "vatType", v)}>
                          <SelectTrigger className="h-9 text-sm border-dashed px-1" data-testid={`select-vat-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vat7">7%</SelectItem>
                            <SelectItem value="zero_rated">0%</SelectItem>
                            <SelectItem value="non_vat">-</SelectItem>
                          </SelectContent>
                        </Select>
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

            <div className="border border-orange-200 bg-orange-50 rounded-lg p-3 mb-2">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="return-to-stock"
                  data-testid="checkbox-return-to-stock"
                  checked={returnToStock}
                  onChange={e => { setReturnToStock(e.target.checked); if (!e.target.checked) setReturnWarehouseId(undefined); }}
                  className="h-4 w-4 accent-orange-500 cursor-pointer"
                />
                <label htmlFor="return-to-stock" className="text-sm font-medium text-orange-700 cursor-pointer select-none">
                  รับสินค้าคืนเข้าคลัง (คืนสต๊อก)
                </label>
              </div>
              {returnToStock && (
                <div className="ml-6 mt-1.5">
                  <label className="text-xs text-orange-600 mb-1 block font-medium">เลือกคลังที่รับสินค้าคืน</label>
                  <select
                    data-testid="select-return-warehouse"
                    value={returnWarehouseId ? String(returnWarehouseId) : ""}
                    onChange={e => setReturnWarehouseId(e.target.value ? Number(e.target.value) : undefined)}
                    className="h-8 text-sm border border-orange-300 rounded bg-white px-2 outline-none focus:ring-1 focus:ring-orange-400 min-w-[200px]"
                  >
                    <option value="">-- เลือกคลัง --</option>
                    {warehouses.map((w: any) => (
                      <option key={w.id} value={String(w.id)}>
                        {w.code ? `[${w.code}] ` : ""}{w.name}
                      </option>
                    ))}
                  </select>
                  {returnWarehouseId && (
                    <p className="text-xs text-orange-500 mt-1">สต๊อกคลังจะเพิ่มขึ้นเมื่อบันทึกใบลดหนี้</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 doc-summary-section">
              <div className="flex-1 space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block font-medium">มูลค่าตามใบกำกับเดิม:</label>
                    <input
                      data-testid="input-original-invoice-amount"
                      inputMode="decimal"
                      className="h-8 w-full text-sm border border-slate-300 rounded px-2 outline-none focus:ring-1 focus:ring-[var(--theme-primary)] bg-white text-right"
                      placeholder="0.00"
                      value={form.originalInvoiceAmount}
                      onChange={e => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) setForm(p => ({ ...p, originalInvoiceAmount: v })); }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 mb-1 block font-medium">มูลค่าที่ถูกต้อง:</label>
                    <input
                      data-testid="input-correct-invoice-amount"
                      inputMode="decimal"
                      className="h-8 w-full text-sm border border-slate-300 rounded px-2 outline-none focus:ring-1 focus:ring-[var(--theme-primary)] bg-white text-right"
                      placeholder="0.00"
                      value={form.correctInvoiceAmount}
                      onChange={e => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) setForm(p => ({ ...p, correctInvoiceAmount: v })); }}
                    />
                  </div>
                </div>
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
                documentType="credit_note"
                subtotal={totals.afterDiscount?.toFixed(2) || "0"}
                vatAmount={totals.vatAmount?.toFixed(2) || "0"}
                withholdingTax="0"
                paymentMethod={form.paymentMethod}
                currencyCode={form.currencyCode}
                exchangeRate={form.exchangeRate}
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

            {editingId && (
              <div className="border-t pt-4 mt-2">
                <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5" />
                  ส่ง e-Tax Invoice (ใบลดหนี้)
                </div>
                <EtaxCreditNoteButton creditNoteId={editingId} companyId={companyId} creditNoteNo={form.creditNoteNo} />
              </div>
            )}
          </fieldset>
        </div>
      </div>

      <Dialog open={invoiceDialogOpen} onOpenChange={setInvoiceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
              เลือกใบกำกับภาษีอ้างอิง
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                data-testid="input-invoice-search"
                placeholder="ค้นหาเลขที่ใบกำกับภาษี หรือ ชื่อลูกค้า..."
                value={invoiceSearch}
                onChange={e => setInvoiceSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="border rounded max-h-[50vh] overflow-y-auto">
              {filteredInvoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  ไม่พบใบกำกับภาษีที่อนุมัติแล้ว
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0">
                    <TableRow>
                      <TableHead className="text-xs">เลขที่</TableHead>
                      <TableHead className="text-xs">วันที่</TableHead>
                      <TableHead className="text-xs">ลูกค้า</TableHead>
                      <TableHead className="text-xs text-right">จำนวนเงิน</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map((inv: any) => (
                      <TableRow key={inv.id} className="hover:bg-[var(--theme-primary-light)]/50 cursor-pointer" data-testid={`row-ref-invoice-${inv.id}`}>
                        <TableCell className="text-sm font-medium text-[var(--theme-primary)]">{inv.taxInvoiceNo || "-"}</TableCell>
                        <TableCell className="text-sm">{formatDate(inv.taxInvoiceDate, dateEra, dateFmt)}</TableCell>
                        <TableCell className="text-sm">{inv.customerName}</TableCell>
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
