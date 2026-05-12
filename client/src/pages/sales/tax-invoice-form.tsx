import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute, useSearch } from "wouter";
import Layout from "@/components/layout";
import { FetchRateButton } from "@/components/fetch-rate-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useDocDropdowns } from "@/hooks/use-doc-dropdowns";
import {
  ArrowLeft, Plus, FileText, Save, Trash2, Package, Home,
  RotateCcw, Paperclip, Link2, Copy, AlertCircle, X, FileDown, CheckCircle2, XCircle, Search, Loader2, Info, ChevronDown, ChevronRight, FileCode, Mail, Send
} from "lucide-react";
import MultiFileAttachment from "@/components/multi-file-attachment";
import { EtaxSendDialog } from "@/components/etax-send-dialog";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker, toDisplayDate } from "@/components/ui/date-picker";
import type { DateFormat } from "@/components/ui/date-picker";
import type { Contact, Product } from "@shared/schema";
import AutoJournalButton from "@/components/auto-journal-button";
import RelatedDocuments from "@/components/related-documents";
import JournalPreviewPanel, { type JournalLine } from "@/components/journal-preview-panel";
import { useDbdLookup } from "@/hooks/use-dbd-lookup";
import { useDateSettings } from "@/hooks/use-date-settings";

import { toLocalDateStr } from "@/lib/utils";
import { usePrefixOptions } from "@/hooks/use-prefix-options";

interface TaxInvoiceItemForm {
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
  warehouseId?: number;
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

const emptyItem = (): TaxInvoiceItemForm => ({
  productCode: "",
  productName: "",
  description: "",
  qty: "1",
  unit: "ชิ้น",
  unitPrice: "0",
  discount: "0",
  total: "0",
  vatType: "vat7",
  warehouseId: undefined,
});

type EtaxPrintType = "tax_invoice" | "tax_invoice_receipt" | "receipt";
const ETAX_PRINT_OPTIONS: { key: EtaxPrintType; label: string }[] = [
  { key: "tax_invoice", label: "ใบกำกับภาษี" },
  { key: "tax_invoice_receipt", label: "ใบเสร็จรับเงิน/ใบกำกับภาษี" },
  { key: "receipt", label: "ใบเสร็จรับเงิน" },
];

function EtaxButton({ taxInvoiceId, companyId, taxInvoiceNo }: { taxInvoiceId: number | null; companyId: number | undefined; taxInvoiceNo?: string }) {
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [etaxPrintType, setEtaxPrintType] = useState<EtaxPrintType>("tax_invoice");
  const [defaultDerived, setDefaultDerived] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: etaxSettings } = useQuery({
    queryKey: ["/api/etax/settings", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/etax/settings?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: tivData } = useQuery({
    queryKey: ["/api/tax-invoices", taxInvoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/tax-invoices/${taxInvoiceId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!taxInvoiceId,
  });

  useEffect(() => {
    setDefaultDerived(false);
  }, [taxInvoiceId]);

  useEffect(() => {
    if (tivData?.taxInvoiceNo && !defaultDerived) {
      const no = (tivData.taxInvoiceNo || "").toUpperCase();
      if (no.startsWith("RE") || no.startsWith("TR")) {
        setEtaxPrintType("tax_invoice_receipt");
      } else {
        setEtaxPrintType("tax_invoice");
      }
      setDefaultDerived(true);
    }
  }, [tivData?.taxInvoiceNo, defaultDerived]);

  if (!etaxSettings?.etaxEnabled || !taxInvoiceId) return null;

  const isSent = !!tivData?.etaxSentAt;

  const handleGeneratePdfA3 = async () => {
    setLoadingPdf(true);
    try {
      const res = await fetch("/api/etax/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ taxInvoiceId, companyId, printType: etaxPrintType }),
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
      a.download = match ? decodeURIComponent(match[1]) : "etax_PDFA3.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "ดาวน์โหลด e-Tax PDF/A-3 สำเร็จ" });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setLoadingPdf(false);
  };

  const handleSendEmail = () => {
    setShowSendDialog(true);
  };

  const anyLoading = loadingPdf || loadingEmail;

  return (
    <div className="flex flex-col gap-2">
      {isSent && (
        <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-1.5">
          <Mail className="h-3.5 w-3.5" />
          <span>ส่ง e-Tax แล้ว: {tivData.etaxSentTo} ({new Date(tivData.etaxSentAt).toLocaleDateString("th-TH")})</span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <select
          value={etaxPrintType}
          onChange={(e) => setEtaxPrintType(e.target.value as EtaxPrintType)}
          className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs focus:ring-1 focus:ring-[var(--theme-primary)]"
          data-testid="select-etax-print-type"
        >
          {ETAX_PRINT_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
        <Button
          data-testid="button-etax-email"
          variant="outline"
          size="sm"
          className={`h-8 gap-1.5 ${isSent ? "border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700" : "border-[var(--theme-primary)]/50 bg-[var(--theme-primary)]/10 hover:bg-[var(--theme-primary)]/20 text-[var(--theme-primary)]"}`}
          onClick={handleSendEmail}
          disabled={anyLoading}
        >
          {loadingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {isSent ? "ส่งซ้ำ e-Tax Invoice" : "ส่ง e-Tax Invoice"}
        </Button>
        {isSent && (
          <Button
            data-testid="button-etax-pdf"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
            onClick={handleGeneratePdfA3}
            disabled={anyLoading}
          >
            {loadingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            ดาวน์โหลด PDF/A-3
          </Button>
        )}
      </div>
      {taxInvoiceId && (
        <EtaxSendDialog
          open={showSendDialog}
          onOpenChange={setShowSendDialog}
          taxInvoiceId={taxInvoiceId}
          taxInvoiceNo={taxInvoiceNo || tivData?.taxInvoiceNo || ""}
          defaultPrintType={etaxPrintType}
          onPrintTypeChange={(pt) => setEtaxPrintType(pt)}
        />
      )}
    </div>
  );
}

export default function TaxInvoiceForm() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/sales/tax-invoice/new");
  const [matchEdit, paramsEdit] = useRoute("/sales/tax-invoice/edit/:id");
  const editingId = matchEdit ? Number(paramsEdit?.id) : null;
  const isNew = !!matchNew;

  const { selectedCompany } = useCompany();
  const { employeeNames, departmentList, branchList, acctName } = useDocDropdowns();
  const companyId = selectedCompany?.id;
  const defaultVatType = selectedCompany?.vatRegistered ? "vat7" : "non_vat";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lookup: lookupDBD, loading: dbdLoading } = useDbdLookup();

  const [savedId, setSavedId] = useState<number | null>(editingId);
  const [priceMode, setPriceMode] = useState<"excluded" | "included">("excluded");
  const [form, setForm] = useState({
    taxInvoiceNo: "",
    taxInvoiceDate: toLocalDateStr(new Date()),
    dueDate: "",
    customerId: undefined as number | undefined,
    customerCode: "",
    customerName: "",
    customerAddress: "",
    customerTaxId: "",
    customerTaxIdType: "TXID" as "TXID" | "NIDN" | "CCPT" | "OTHR",
    customerCountryCode: "TH",
    branch: "",
    contactPerson: "",
    contactPhone: "",
    contactEmail: "",
    creditDays: "",
    notes: "",
    internalNotes: "",
    status: "debtor",
    salesperson: "",
    department: "",
    project: "",
    refDoc: "",
    linkJournal: true,
    paymentTerms: "",
    attachedUrl: "",
    withholdingTax: "0",
    discountBeforeVat: "0",
    docPrefix: "TIV",
    saveToContacts: false,
    originalTaxInvoiceNo: "",
    currencyCode: "THB",
    exchangeRate: "1",
    paymentMethod: "เครดิต",
    sellerBranchId: selectedCompany?.sellerBranchId || "00000",
  });
  const [customerSearch, setCustomerSearch] = useState<string | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerCodeSearch, setCustomerCodeSearch] = useState<string | null>(null);
  const [showCustomerCodeDropdown, setShowCustomerCodeDropdown] = useState(false);
  const [items, setItems] = useState<TaxInvoiceItemForm[]>([emptyItem()]);
  const [productSearches, setProductSearches] = useState<Record<number, string>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<Record<number, boolean>>({});
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [loaded, setLoaded] = useState(false);
  const [manualDueDate, setManualDueDate] = useState(false);
  const [depositDeductions, setDepositDeductions] = useState<{ depositReceiptId: number; depositNo: string; amount: number }[]>([]);
  const [depositSectionOpen, setDepositSectionOpen] = useState(true);
  const [journalOverrideLines, setJournalOverrideLines] = useState<JournalLine[] | null>(null);
  const [issuedTivInfo, setIssuedTivInfo] = useState<{ issuedAmount: number; invoiceTotal: number; remaining: number } | null>(null);

  useEffect(() => {
    if (isNew && selectedCompany && items.length === 1 && !items[0].productCode) {
      setItems([{ ...items[0], vatType: defaultVatType }]);
    }
  }, [selectedCompany]);

  useEffect(() => {
    if (!loaded || manualDueDate) return;
    const days = form.creditDays ? parseInt(form.creditDays) : NaN;
    if (!isNaN(days) && days >= 0 && form.taxInvoiceDate) {
      const base = new Date(form.taxInvoiceDate + "T00:00:00");
      base.setDate(base.getDate() + days);
      const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
      setForm(p => ({ ...p, dueDate: iso }));
    } else if (!form.creditDays && form.taxInvoiceDate) {
      setForm(p => ({ ...p, dueDate: p.taxInvoiceDate }));
    }
  }, [form.creditDays, form.taxInvoiceDate, loaded]);

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/contacts?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/products?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
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
  const activePaymentMethods = paymentMethodsList.filter((m: any) => m.active !== false && (m.paymentType || "receive") === "receive");

  const isCashMethod = (pm: string) => {
    if (!pm) return false;
    if (pm === "เงินสด") return true; // backward compat for old saved records
    const found = activePaymentMethods.find((m: any) => m.accountCode === pm);
    return !!(found && (found.name === "เงินสด" || found.nameTh === "เงินสด"));
  };

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouses", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/warehouses?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    if (!editingId && activePaymentMethods.length > 0 && !form.paymentMethod) {
      const defaultPm = activePaymentMethods.find((m: any) => m.isDefault);
      if (defaultPm) {
        setForm(p => ({ ...p, paymentMethod: defaultPm.accountCode }));
      }
    }
  }, [activePaymentMethods, editingId]);

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
  const { prefixOptions, defaultPrefix } = usePrefixOptions("tax_invoice", docSettings);
  useEffect(() => {
    if (isNew && defaultPrefix && form.docPrefix !== defaultPrefix) {
      setForm(p => ({ ...p, docPrefix: defaultPrefix }));
    }
  }, [defaultPrefix, isNew]);


  const { data: availableDeposits = [] } = useQuery<any[]>({
    queryKey: ["/api/deposit-receipts/available", companyId, form.customerId],
    queryFn: async () => {
      if (!companyId || !form.customerId) return [];
      const res = await fetch(`/api/deposit-receipts/available?companyId=${companyId}&customerId=${form.customerId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId && !!form.customerId,
  });

  const searchString = useSearch();
  const searchParams = isNew ? new URLSearchParams(searchString) : null;
  const fromSalesOrderId = searchParams?.get("fromSalesOrder") || null;
  const fromQuotationId = searchParams?.get("fromQuotation") || null;
  const fromInvoiceId = searchParams?.get("fromInvoice") || null;
  const copyFromId = searchParams?.get("copyFrom") || null;

  useEffect(() => {
    if (loaded) return;
    if (isNew && fromInvoiceId) {
      (async () => {
        try {
          const [res, issuedRes] = await Promise.all([
            fetch(`/api/invoices/${fromInvoiceId}`, { credentials: "include" }),
            fetch(`/api/invoices/${fromInvoiceId}/issued-tiv-amount?companyId=${companyId}`, { credentials: "include" }),
          ]);
          if (res.ok) {
            const inv = await res.json();
            let ratio = 1;
            if (issuedRes.ok) {
              const issued = await issuedRes.json();
              if (issued.issuedAmount > 0 && issued.invoiceTotal > 0) {
                ratio = Math.max(0, issued.remaining) / issued.invoiceTotal;
                setIssuedTivInfo({ issuedAmount: issued.issuedAmount, invoiceTotal: issued.invoiceTotal, remaining: issued.remaining });
              }
            }
            setPriceMode(inv.priceMode || "excluded");
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + (inv.creditDays || 0));
            const scaledWht = ratio < 1 ? parseFloat(String(inv.withholdingTax || "0")) * ratio : parseFloat(String(inv.withholdingTax || "0"));
            setForm(prev => ({
              ...prev,
              taxInvoiceNo: "",
              taxInvoiceDate: toLocalDateStr(new Date()),
              dueDate: toLocalDateStr(dueDate),
              customerId: inv.customerId || undefined,
              customerCode: inv.customerCode || "",
              customerName: inv.customerName || "",
              customerAddress: inv.customerAddress || "",
              customerTaxId: inv.customerTaxId || "",
              customerTaxIdType: (inv as any).customerTaxIdType || "TXID",
              customerCountryCode: (inv as any).customerCountryCode || "TH",
              branch: inv.branch || "",
              contactPerson: inv.contactPerson || "",
              contactPhone: inv.contactPhone || "",
              contactEmail: inv.contactEmail || "",
              creditDays: inv.creditDays ? String(inv.creditDays) : "",
              salesperson: inv.salesperson || "",
              department: inv.department || "",
              project: inv.project || "",
              refDoc: inv.invoiceNo || "",
              withholdingTax: cleanDecimal(String(Math.round(scaledWht * 100) / 100), "0"),
              discountBeforeVat: inv.discountType === "percent" ? `${cleanDecimal(inv.discountAmount, "0")}%` : cleanDecimal(inv.discountAmount, "0"),
              paymentTerms: inv.paymentTerms || "",
              notes: inv.notes || "",
              currencyCode: inv.currencyCode || "THB",
              exchangeRate: String(inv.exchangeRate || "1"),
            }));
            if (inv.items && inv.items.length > 0) {
              setItems(inv.items.map((it: any) => {
                const scaledPrice = ratio < 1 ? parseFloat(String(it.unitPrice || "0")) * ratio : parseFloat(String(it.unitPrice || "0"));
                const scaledTotal = ratio < 1 ? parseFloat(String(it.total || "0")) * ratio : parseFloat(String(it.total || "0"));
                return {
                  productId: it.productId,
                  productCode: it.productCode || "",
                  productName: it.productName || "",
                  description: it.description || "",
                  qty: cleanDecimal(it.qty, "1"),
                  unit: it.unit || "ชิ้น",
                  unitPrice: cleanDecimal(String(Math.round(scaledPrice * 100) / 100), "0"),
                  discount: it.discountType === "percent" ? `${cleanDecimal(it.discount, "0")}%` : cleanDecimal(it.discount, "0"),
                  total: cleanDecimal(String(Math.round(scaledTotal * 100) / 100), "0"),
                  vatType: it.vatType || "vat7",
                  warehouseId: it.warehouseId || undefined,
                };
              }));
            }
            if (inv.discountType === "percent") setDiscountMode("percent");
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew && fromSalesOrderId) {
      (async () => {
        try {
          const res = await fetch(`/api/sales-orders/${fromSalesOrderId}`, { credentials: "include" });
          if (res.ok) {
            const so = await res.json();
            setPriceMode(so.priceMode || "excluded");
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + (so.creditDays || 0));
            setForm(prev => ({
              ...prev,
              taxInvoiceNo: "",
              taxInvoiceDate: toLocalDateStr(new Date()),
              dueDate: toLocalDateStr(dueDate),
              customerId: so.customerId || undefined,
              customerCode: so.customerCode || "",
              customerName: so.customerName || "",
              customerAddress: so.customerAddress || "",
              customerTaxId: so.customerTaxId || "",
              branch: so.branch || "",
              contactPerson: so.contactPerson || "",
              contactPhone: so.contactPhone || "",
              contactEmail: so.contactEmail || "",
              creditDays: so.creditDays ? String(so.creditDays) : "",
              salesperson: so.salesperson || "",
              department: so.department || "",
              project: so.project || "",
              refDoc: so.orderNo || "",
              withholdingTax: String(so.withholdingTax || "0"),
              discountBeforeVat: so.discountType === "percent" ? `${cleanDecimal(so.discountAmount, "0")}%` : cleanDecimal(so.discountAmount, "0"),
              paymentTerms: so.paymentTerms || "",
              notes: so.notes || "",
              currencyCode: so.currencyCode || "THB",
              exchangeRate: String(so.exchangeRate || "1"),
            }));
            if (so.items && so.items.length > 0) {
              setItems(so.items.map((it: any) => ({
                productId: it.productId,
                productCode: it.productCode || it.sku || "",
                productName: it.productName || "",
                description: it.description || "",
                qty: cleanDecimal(it.qty, "1"),
                unit: it.unit || "ชิ้น",
                unitPrice: cleanDecimal(it.unitPrice, "0"),
                discount: it.discountType === "percent" ? `${cleanDecimal(it.discount, "0")}%` : cleanDecimal(it.discount, "0"),
                total: cleanDecimal(it.total, "0"),
                vatType: it.vatType || "vat7",
                warehouseId: it.warehouseId || undefined,
              })));
            }
            if (so.discountType === "percent") setDiscountMode("percent");
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew && fromQuotationId) {
      (async () => {
        try {
          const res = await fetch(`/api/quotations/${fromQuotationId}`, { credentials: "include" });
          if (res.ok) {
            const qo = await res.json();
            setPriceMode(qo.priceMode || "excluded");
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + (qo.creditDays || 0));
            setForm(prev => ({
              ...prev,
              taxInvoiceNo: "",
              taxInvoiceDate: toLocalDateStr(new Date()),
              dueDate: toLocalDateStr(dueDate),
              customerId: qo.customerId || undefined,
              customerCode: qo.customerCode || "",
              customerName: qo.customerName || "",
              customerAddress: qo.customerAddress || "",
              customerTaxId: qo.customerTaxId || "",
              branch: qo.branch || "",
              contactPerson: qo.contactPerson || "",
              contactPhone: qo.contactPhone || "",
              contactEmail: qo.contactEmail || "",
              creditDays: qo.creditDays ? String(qo.creditDays) : "",
              salesperson: qo.salesperson || "",
              department: qo.department || "",
              project: qo.project || "",
              refDoc: qo.quotationNo || "",
              withholdingTax: String(qo.withholdingTax || "0"),
              discountBeforeVat: qo.discountType === "percent" ? `${cleanDecimal(qo.discountAmount, "0")}%` : cleanDecimal(qo.discountAmount, "0"),
              paymentTerms: qo.paymentTerms || "",
              notes: qo.notes || "",
              currencyCode: qo.currencyCode || "THB",
              exchangeRate: String(qo.exchangeRate || "1"),
            }));
            if (qo.items && qo.items.length > 0) {
              setItems(qo.items.map((it: any) => ({
                productId: it.productId,
                productCode: it.productCode || "",
                productName: it.productName || "",
                description: it.description || "",
                qty: cleanDecimal(it.qty, "1"),
                unit: it.unit || "ชิ้น",
                unitPrice: cleanDecimal(it.unitPrice, "0"),
                discount: it.discountType === "percent" ? `${cleanDecimal(it.discount, "0")}%` : cleanDecimal(it.discount, "0"),
                total: cleanDecimal(it.total, "0"),
                vatType: it.vatType || "vat7",
                warehouseId: it.warehouseId || undefined,
              })));
            }
            if (qo.discountType === "percent") setDiscountMode("percent");
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew && copyFromId) {
      (async () => {
        try {
          const res = await fetch(`/api/tax-invoices/${copyFromId}`, { credentials: "include" });
          if (res.ok) {
            const src = await res.json();
            setPriceMode(src.priceMode || "excluded");
            setForm(prev => ({
              ...prev, taxInvoiceNo: "", taxInvoiceDate: toLocalDateStr(new Date()),
              dueDate: src.dueDate || toLocalDateStr(new Date()),
              customerId: src.customerId || undefined, customerCode: src.customerCode || "",
              customerName: src.customerName || "", customerAddress: src.customerAddress || "",
              customerTaxId: src.customerTaxId || "", branch: src.branch || "",
              contactPerson: src.contactPerson || "", contactPhone: src.contactPhone || "",
              contactEmail: src.contactEmail || "", creditDays: src.creditDays ? String(src.creditDays) : "",
              notes: src.notes || "", internalNotes: src.internalNotes || "",
              status: isCashMethod(src.paymentMethod) ? "cash" : "debtor", paymentStatus: "unpaid",
              salesperson: src.salesperson || "", department: src.department || "",
              project: src.project || "", refDoc: src.refDoc || "",
              paymentTerms: src.paymentTerms || "",
              withholdingTax: String(src.withholdingTax || "0"),
              discountBeforeVat: src.discountType === "percent" ? `${cleanDecimal(src.discountAmount, "0")}%` : cleanDecimal(src.discountAmount, "0"),
              docPrefix: "TIV",
              currencyCode: src.currencyCode || "THB", exchangeRate: String(src.exchangeRate || "1"),
            }));
            if (src.discountType === "percent") setDiscountMode("percent");
            if (src.items?.length > 0) {
              setItems(src.items.map((it: any) => ({
                productId: it.productId, productCode: it.productCode || "",
                productName: it.productName || "", description: it.description || "",
                qty: cleanDecimal(it.qty, "1"), unit: it.unit || "ชิ้น",
                unitPrice: cleanDecimal(it.unitPrice, "0"),
                discount: it.discountType === "percent" ? `${cleanDecimal(it.discount, "0")}%` : cleanDecimal(it.discount, "0"),
                total: cleanDecimal(it.total, "0"), vatType: it.vatType || "vat7",
                warehouseId: it.warehouseId || undefined,
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew) {
      setForm(prev => ({
        ...prev,
        taxInvoiceNo: "",
        dueDate: toLocalDateStr(new Date()),
      }));
      setLoaded(true);
    } else if (editingId) {
      (async () => {
        try {
          const res = await fetch(`/api/tax-invoices/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setForm({
              taxInvoiceNo: data.taxInvoiceNo || "",
              taxInvoiceDate: data.taxInvoiceDate || "",
              dueDate: data.dueDate || "",
              customerId: data.customerId || undefined,
              customerCode: data.customerCode || "",
              customerName: data.customerName || "",
              customerAddress: data.customerAddress || "",
              customerTaxId: data.customerTaxId || "",
              branch: data.branch || "",
              contactPerson: data.contactPerson || "",
              contactPhone: data.contactPhone || "",
              contactEmail: data.contactEmail || "",
              creditDays: data.creditDays || "",
              notes: data.notes || "",
              internalNotes: data.internalNotes || "",
              status: data.status || "cash",
              salesperson: data.salesperson || "",
              department: data.department || "",
              project: data.project || "",
              refDoc: data.refDoc || "",
              linkJournal: data.linkJournal ?? true,
              paymentTerms: data.paymentTerms || "",
              attachedUrl: data.attachedUrl || "",
              withholdingTax: String(data.withholdingTax || "0"),
              discountBeforeVat: data.discountType === "percent" ? `${cleanDecimal(data.discountAmount, "0")}%` : cleanDecimal(data.discountAmount, "0"),
              docPrefix: data.docPrefix || "TIV",
              saveToContacts: false,
              originalTaxInvoiceNo: data.originalTaxInvoiceNo || "",
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              paymentMethod: data.paymentMethod || "เครดิต",
              sellerBranchId: data.sellerBranchId || selectedCompany?.sellerBranchId || "00000",
              invoiceId: data.invoiceId || null,
            } as any);
            if (data.items && data.items.length > 0) {
              setItems(data.items.map((it: any) => ({
                productId: it.productId,
                productCode: it.productCode || "",
                productName: it.productName || "",
                description: it.description || "",
                qty: cleanDecimal(it.qty, "1"),
                unit: it.unit || "ชิ้น",
                unitPrice: cleanDecimal(it.unitPrice, "0"),
                discount: it.discountType === "percent" ? `${cleanDecimal(it.discount, "0")}%` : cleanDecimal(it.discount, "0"),
                total: cleanDecimal(it.total, "0"),
                vatType: it.vatType || "vat7",
                warehouseId: it.warehouseId || undefined,
              })));
            }
            if (data.discountType === "percent") setDiscountMode("percent");
            setSavedId(editingId);

            try {
              const dedRes = await apiRequest("GET", `/api/deposit-deductions/by-document?documentType=tax_invoice&documentId=${editingId}`);
              const existingDeds = await dedRes.json();
              if (Array.isArray(existingDeds) && existingDeds.length > 0) {
                setDepositDeductions(existingDeds.map((d: any) => ({
                  depositReceiptId: d.depositReceiptId,
                  depositNo: d.documentNo || "",
                  amount: parseFloat(String(d.amount || "0")),
                })));
              }
            } catch {}
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
      const res = await apiRequest("POST", "/api/tax-invoices", data);
      const result = await res.json();
      const validDeductions = (data.depositDeductions || []).filter((d: any) => d.amount > 0);
      for (const ded of validDeductions) {
        try {
          await apiRequest("POST", "/api/deposit-deductions", {
            companyId: data.companyId,
            depositReceiptId: ded.depositReceiptId,
            depositNo: ded.depositNo,
            amount: ded.amount,
            documentType: "tax_invoice",
            documentId: result.id || null,
          });
        } catch {}
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposit-receipts/available"] });
      toast({ title: "สร้างใบกำกับภาษีสำเร็จ", variant: "success" as any });
      navigate("/sales/tax-invoice");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/tax-invoices/${id}`, data);
      const result = await res.json();
      await apiRequest("PUT", "/api/deposit-deductions/replace", {
        documentType: "tax_invoice",
        documentId: id,
        deductions: (data.depositDeductions || []).filter((d: any) => d.amount > 0).map((d: any) => ({
          depositReceiptId: d.depositReceiptId,
          documentNo: d.depositNo,
          amount: d.amount,
        })),
      });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deposit-receipts/available"] });
      toast({ title: "อัพเดทใบกำกับภาษีสำเร็จ", variant: "success" as any });
      setDepositDeductions([]);
      navigate("/sales/tax-invoice");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/tax-invoices/${id}`, { status, journalOverrideLines: journalOverrideLines || undefined });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-invoices"] });
      const newStatus = data.status || "issued";
      setForm(p => ({ ...p, status: newStatus }));
      if (data.journalResult && !data.journalResult.skipped) {
        toast({ title: "ออกใบกำกับภาษีสำเร็จ", description: "สร้างรายการบัญชีอัตโนมัติแล้ว", variant: "success" as any });
      } else {
        const statusLabels: Record<string, string> = { issued: "ออกใบกำกับภาษีสำเร็จ", cancelled: "ยกเลิกแล้ว", voided: "ยกเลิกแล้ว" };
        toast({ title: statusLabels[newStatus] || "อัพเดทสถานะสำเร็จ", variant: "success" as any });
      }
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  function handleCustomerSelect(contactId: string) {
    const c = contacts.find(ct => ct.id === Number(contactId));
    if (c) {
      setDepositDeductions([]);
      setForm(prev => {
        const days = c.creditDays ? Number(c.creditDays) : 0;
        let newDueDate = prev.dueDate;
        if (prev.taxInvoiceDate) {
          const base = new Date(prev.taxInvoiceDate + "T00:00:00");
          base.setDate(base.getDate() + days);
          newDueDate = toLocalDateStr(base);
        }
        return {
          ...prev,
          customerId: c.id,
          customerCode: c.code || "",
          customerName: c.name,
          customerAddress: c.address || "",
          customerTaxId: c.taxId || "",
          branch: (c as any).branch || "",
          contactPerson: c.contactPerson || "",
          contactPhone: c.phone || "",
          contactEmail: c.email || "",
          creditDays: c.creditDays ? String(c.creditDays) : "",
          dueDate: newDueDate,
        };
      });
    }
  }

  function handleProductSelect(idx: number, productId: string) {
    const p = products.find(pr => pr.id === Number(productId));
    if (p) {
      const newItems = [...items];
      newItems[idx] = {
        ...newItems[idx],
        productId: p.id,
        productCode: p.code || "",
        productName: p.name,
        unitPrice: String(p.price || "0"),
        unit: p.unit || "ชิ้น",
        vatType: p.vatType || defaultVatType,
        total: calcItemTotal(newItems[idx].qty || "1", String(p.price || "0"), "0"),
      };
      setItems(newItems);
    }
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

  function duplicateItem(idx: number) {
    const copy = { ...items[idx], productId: items[idx].productId };
    const newItems = [...items];
    newItems.splice(idx + 1, 0, copy);
    setItems(newItems);
  }

  function removeItem(idx: number) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
    setProductSearches({});
    setShowProductDropdown({});
  }

  function calcTotals() {
    const discRaw = form.discountBeforeVat || "0";
    const discIsPercent = discRaw.endsWith("%");
    const whtRaw = form.withholdingTax || "0";
    const whtIsPercent = whtRaw.endsWith("%");

    const vatItemsTotal = items.filter(it => it.vatType === "vat7").reduce((s, it) => s + parseFloat(it.total || "0"), 0);
    const nonVatItemsTotal = items.filter(it => it.vatType !== "vat7").reduce((s, it) => s + parseFloat(it.total || "0"), 0);
    const rawTotal = vatItemsTotal + nonVatItemsTotal;
    const discPercVal = discIsPercent ? Math.min(parseFloat(discRaw) || 0, 100) : 0;
    const discAmount = discIsPercent ? rawTotal * discPercVal / 100 : (parseFloat(discRaw) || 0);

    if (priceMode === "included") {
      const vatIncluded = Math.max(vatItemsTotal - discAmount, 0);
      const vatBase = vatIncluded / 1.07;
      const vatAmount = vatIncluded - vatBase;
      const afterDiscount = vatBase + Math.max(nonVatItemsTotal - Math.max(discAmount - vatItemsTotal, 0), 0);
      const wht = whtIsPercent ? afterDiscount * (parseFloat(whtRaw) || 0) / 100 : (parseFloat(whtRaw) || 0);
      const grandTotal = afterDiscount + vatAmount - wht;
      return {
        rawTotal,
        discountAmount: discAmount,
        afterDiscount,
        vatAmount,
        withholdingTax: wht,
        totalAmount: grandTotal,
      };
    } else {
      const afterDiscount = Math.max(rawTotal - discAmount, 0);
      const vatBase = Math.max(vatItemsTotal - discAmount, 0);
      const vatAmount = vatBase * 0.07;
      const wht = whtIsPercent ? afterDiscount * (parseFloat(whtRaw) || 0) / 100 : (parseFloat(whtRaw) || 0);
      const grandTotal = afterDiscount + vatAmount - wht;
      return {
        rawTotal,
        discountAmount: discAmount,
        afterDiscount,
        vatAmount,
        withholdingTax: wht,
        totalAmount: grandTotal,
      };
    }
  }

  function handleReset() {
    setForm({
      taxInvoiceNo: form.taxInvoiceNo,
      taxInvoiceDate: toLocalDateStr(new Date()),
      dueDate: form.dueDate,
      customerId: undefined,
      customerCode: "",
      customerName: "",
      customerAddress: "",
      customerTaxId: "",
      customerTaxIdType: "TXID" as any,
      customerCountryCode: "TH",
      branch: "",
      contactPerson: "",
      contactPhone: "",
      contactEmail: "",
      creditDays: "",
      notes: "",
      internalNotes: "",
      status: "debtor",
      salesperson: "",
      department: "",
      project: "",
      refDoc: "",
      linkJournal: true,
      paymentTerms: "",
      attachedUrl: "",
      withholdingTax: "0",
      discountBeforeVat: "0",
      docPrefix: form.docPrefix,
      saveToContacts: false,
      originalTaxInvoiceNo: "",
      currencyCode: "THB",
      exchangeRate: "1",
      paymentMethod: "เครดิต",
      sellerBranchId: selectedCompany?.sellerBranchId || "00000",
    });
    setItems([{ ...emptyItem(), vatType: defaultVatType }]);
    setPriceMode("excluded");
    setCustomerSearch("");
    setProductSearches({});
    setShowProductDropdown({});
    setDepositDeductions([]);
  }

  async function handleSaveNewContact(): Promise<{ id: number; code: string } | null> {
    if (!form.saveToContacts || form.customerId || !form.customerName || !companyId) return null;
    try {
      const res = await apiRequest("POST", "/api/contacts", {
        companyId,
        name: form.customerName,
        type: "customer",
        address: form.customerAddress || null,
        taxId: form.customerTaxId || null,
        phone: form.contactPhone || null,
        email: form.contactEmail || null,
        contactPerson: form.contactPerson || null,
      });
      const saved = await res.json();
      setForm(p => ({ ...p, customerId: saved.id, customerCode: saved.code || "" }));
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      return { id: saved.id, code: saved.code || "" };
    } catch { return null; }
  }

  async function handleSubmit() {
    if (!form.customerName) {
      toast({ title: "กรุณากรอกข้อมูลให้ครบถ้วน", description: "ต้องระบุชื่อลูกค้า", variant: "destructive" });
      return;
    }
    let newContact: { id: number; code: string } | null = null;
    if (form.saveToContacts && !form.customerId) {
      newContact = await handleSaveNewContact();
    }
    const totals = calcTotals();
    const computedStatus = (() => {
      if (editingId && ["issued", "cancelled", "voided"].includes(form.status)) return form.status;
      return isCashMethod(form.paymentMethod) ? "cash" : "debtor";
    })();
    const payload = {
      ...form,
      status: computedStatus,
      customerId: newContact ? newContact.id : (form.customerId ? Number(form.customerId) : null),
      customerCode: newContact ? newContact.code : (form.customerCode || ""),
      companyId,
      quotationId: fromQuotationId ? Number(fromQuotationId) : (form as any).quotationId || null,
      invoiceId: fromInvoiceId ? Number(fromInvoiceId) : (form as any).invoiceId || null,
      priceMode,
      docPrefix: form.docPrefix,
      subtotal: totals.afterDiscount.toFixed(2),
      vatAmount: totals.vatAmount.toFixed(2),
      totalAmount: totals.totalAmount.toFixed(2),
      discountAmount: (discountMode === "percent" ? parseFloat(form.discountBeforeVat) || 0 : totals.discountAmount).toFixed(2),
      discountType: discountMode,
      withholdingTax: totals.withholdingTax.toFixed(2),
      originalTaxInvoiceNo: form.originalTaxInvoiceNo,
      depositDeductions: depositDeductions.filter(d => d.amount > 0),
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
        warehouseId: it.warehouseId || null,
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
  const isSaved = !!savedId || !!editingId;
  const isLocked = false;

  return (
    <Layout>
      <div className="space-y-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/sales/tax-invoice")}>ใบกำกับภาษี (TIV)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? (isLocked ? "ดูใบกำกับภาษี" : "แก้ไขใบกำกับภาษี") : "สร้างใบกำกับภาษี"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/sales/tax-invoice")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? (isLocked ? "ดูใบกำกับภาษี" : "แก้ไขใบกำกับภาษี") : "สร้างใบกำกับภาษี"}
          </h1>
        </div>

        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>เอกสารนี้มีสถานะ <strong>{form.status === "issued" ? "ออกแล้ว" : form.status === "cancelled" ? "ยกเลิกแล้ว" : "ถูกยกเลิก (Voided)"}</strong> ไม่สามารถแก้ไขได้</span>
          </div>
        )}

        {issuedTivInfo && issuedTivInfo.issuedAmount > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 text-sm text-blue-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-blue-500" />
            <span>
              ใบแจ้งหนี้นี้ออกใบกำกับภาษีไปแล้ว <strong>{issuedTivInfo.issuedAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</strong>{" "}
              คงเหลือ <strong>{issuedTivInfo.remaining.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</strong>{" "}
              (จากทั้งหมด {issuedTivInfo.invoiceTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท) — ยอดด้านล่างปรับตามส่วนที่เหลือแล้ว
            </span>
          </div>
        )}

        <div className={`bg-white border rounded-lg shadow-sm ${isLocked ? "opacity-80" : ""}`}>
          <fieldset disabled={isLocked} className="p-2 sm:p-4 space-y-4">
            <div className="border rounded overflow-hidden doc-header-table">
              <table className="w-full text-sm table-fixed" style={{minWidth:"720px"}}>
                <colgroup>
                  <col style={{width:"12%"}} />
                  <col style={{width:"13%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"13%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"13%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"13%"}} />
                </colgroup>
                <tbody>
                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top">
                      <div className="text-[10px] text-slate-400 mb-0.5">รหัสลูกค้า</div>
                      <div className="relative">
                        <Input
                          data-testid="input-customer-code"
                          value={customerCodeSearch !== null ? customerCodeSearch : (form.customerCode || "")}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomerCodeSearch(val);
                            setForm(p => ({ ...p, customerCode: val, customerId: undefined, customerName: "", customerAddress: "", customerTaxId: "", branch: "", contactPerson: "", contactPhone: "", contactEmail: "", creditDays: "" }));
                            setCustomerSearch(null);
                            setShowCustomerCodeDropdown(true);
                          }}
                          onFocus={() => { setShowCustomerCodeDropdown(true); setShowCustomerDropdown(false); }}
                          onBlur={() => setTimeout(() => setShowCustomerCodeDropdown(false), 200)}
                          className="h-7 text-xs border-dashed"
                          placeholder=""
                        />
                        {showCustomerCodeDropdown && (() => {
                          const searchVal = (customerCodeSearch || "").toLowerCase();
                          const filtered = contacts.filter(c => c.type === "customer" && (
                            (c.code || "").toLowerCase().includes(searchVal) ||
                            c.name.toLowerCase().includes(searchVal)
                          ));
                          if (filtered.length === 0) return null;
                          return (
                            <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto min-w-[220px]">
                              {filtered.map(c => (
                                <button
                                  key={c.id}
                                  data-testid={`customer-code-option-${c.id}`}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b last:border-b-0"
                                  onMouseDown={e => {
                                    e.preventDefault();
                                    handleCustomerSelect(String(c.id));
                                    setCustomerCodeSearch(null);
                                    setCustomerSearch(null);
                                    setShowCustomerCodeDropdown(false);
                                  }}
                                >
                                  <span className="font-medium">{c.code}</span>
                                  <span className="text-slate-500 ml-1.5">{c.name}</span>
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={5}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ผู้ติดต่อ</div>
                      <Input data-testid="input-contact-person" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} className="h-7 text-xs border-dashed w-full" placeholder="ใส่ชื่อเต็ม หรือ ค้นหาจากบัญชีรายชื่อ(ค่าค้นอาจเป็น ที่อยู่ ชื่อบริษัท หรือ อื่นๆ)" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เอกสารอ้างอิง</div>
                      <Input data-testid="input-ref-doc" value={form.refDoc || ""} onChange={e => setForm(p => ({ ...p, refDoc: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                  </tr>

                  {/* Row 2: ชื่อคู่ค้า(4) | สาขา(2) | วันที่ออกใบกำกับภาษี(2) */}
                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ชื่อคู่ค้า</div>
                      <div className="relative">
                        <Input
                          data-testid="input-customer-name"
                          value={customerSearch !== null ? customerSearch : form.customerName}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomerSearch(val);
                            setForm(p => ({ ...p, customerName: val, customerId: undefined }));
                            setShowCustomerDropdown(true);
                          }}
                          onFocus={() => { setShowCustomerDropdown(true); setShowCustomerCodeDropdown(false); }}
                          onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                          className="h-7 text-xs border-dashed w-full"
                          placeholder="ใส่ชื่อเต็ม หรือ ค้นหาจากบัญชีรายชื่อ(ค่าค้นอาจเป็น ที่อยู่ ชื่อบริษัท หรือ อื่นๆ)"
                        />
                        {showCustomerDropdown && (() => {
                          const searchVal = (customerSearch || "").toLowerCase();
                          const filtered = contacts.filter(c => c.type === "customer" && (
                            c.name.toLowerCase().includes(searchVal) ||
                            ((c as any).nameEn || "").toLowerCase().includes(searchVal) ||
                            ((c as any).nameZh || "").toLowerCase().includes(searchVal) ||
                            (c.code || "").toLowerCase().includes(searchVal)
                          ));
                          if (filtered.length === 0) return null;
                          return (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {filtered.map(c => (
                                <button
                                  key={c.id}
                                  data-testid={`customer-option-${c.id}`}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b last:border-b-0"
                                  onMouseDown={e => {
                                    e.preventDefault();
                                    handleCustomerSelect(String(c.id));
                                    setCustomerSearch(null);
                                    setCustomerCodeSearch(null);
                                    setShowCustomerDropdown(false);
                                  }}
                                >
                                  <div className="font-medium">{c.code ? `[${c.code}] ` : ""}{c.name}</div>
                                  {((c as any).nameEn || (c as any).nameZh) && (
                                    <span className="text-slate-400 text-[10px]">{(c as any).nameEn}{(c as any).nameEn && (c as any).nameZh ? " / " : ""}{(c as any).nameZh}</span>
                                  )}
                                  {c.taxId && <span className="text-slate-400 text-[10px] ml-2">Tax: {c.taxId}</span>}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">สาขา</div>
                      <Input data-testid="input-branch" value={form.branch || ""} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="สำนักงานใหญ่" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">วันที่ออกใบกำกับภาษี</div>
                      <DatePicker data-testid="input-tax-invoice-date" value={form.taxInvoiceDate} onChange={v => setForm(p => ({ ...p, taxInvoiceDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                    </td>
                  </tr>

                  {/* Row 3: ที่อยู่(4) | เลขผู้เสียภาษี+เครดิต stacked(2) | วันครบกำหนด(2) */}
                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ที่อยู่</div>
                      <Textarea data-testid="input-address" value={form.customerAddress} onChange={e => setForm(p => ({ ...p, customerAddress: e.target.value }))} rows={2} className="text-xs resize-none border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1">
                          <div className="text-[10px] text-slate-400 mb-0.5">ประเภทผู้ซื้อ</div>
                          <select data-testid="select-buyer-type" value={form.customerTaxIdType} onChange={e => { const v = e.target.value as any; setForm(p => ({ ...p, customerTaxIdType: v, customerCountryCode: v === "CCPT" ? p.customerCountryCode : "TH" })); }} className="h-7 text-xs border border-dashed rounded px-1.5 w-full bg-white">
                            <option value="TXID">นิติบุคคล (Tax ID)</option>
                            <option value="NIDN">บุคคลธรรมดา (ID Card)</option>
                            <option value="CCPT">ต่างชาติ (Passport)</option>
                            <option value="OTHR">อื่นๆ</option>
                          </select>
                        </div>
                        {(form.customerTaxIdType === "CCPT" || form.customerTaxIdType === "OTHR") && (
                          <div className="w-16">
                            <div className="text-[10px] text-slate-400 mb-0.5">ประเทศ</div>
                            <Input data-testid="input-country-code" value={form.customerCountryCode} onChange={e => setForm(p => ({ ...p, customerCountryCode: e.target.value.toUpperCase().slice(0, 2) }))} className="h-7 text-xs border-dashed" maxLength={2} placeholder="TH" />
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mb-0.5">{form.customerTaxIdType === "TXID" ? "เลขประจำตัวผู้เสียภาษี" : form.customerTaxIdType === "NIDN" ? "เลขบัตรประชาชน" : form.customerTaxIdType === "CCPT" ? "เลข Passport" : "เลขประจำตัว"}</div>
                      <div className="flex gap-1">
                        <Input data-testid="input-tax-id" value={form.customerTaxId} onChange={e => setForm(p => ({ ...p, customerTaxId: e.target.value }))} className="h-7 text-xs border-dashed flex-1" />
                        {form.customerTaxIdType === "TXID" && (
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={dbdLoading || !form.customerTaxId} onClick={async () => { const r = await lookupDBD(form.customerTaxId); if (r) setForm(p => ({ ...p, customerName: r.name, customerAddress: r.address, branch: r.branch || p.branch })); }} data-testid="button-dbd-lookup">
                          {dbdLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        </Button>
                        )}
                      </div>
                      <div className="mt-1.5">
                        <div className="text-[10px] text-slate-400 mb-0.5">#เครดิต (วัน)</div>
                        <Input data-testid="input-credit-days" inputMode="numeric" value={form.creditDays || ""} onChange={e => { const v = e.target.value; if (/^\d*$/.test(v)) { setManualDueDate(false); setForm(p => ({ ...p, creditDays: v })); } }} className="h-7 text-xs border-dashed" placeholder="0" />
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">วันครบกำหนด</div>
                      <DatePicker data-testid="input-due-date" value={form.dueDate} onChange={v => { setManualDueDate(true); setForm(p => ({ ...p, dueDate: v })); }} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                    </td>
                  </tr>

                  {/* Row 4: อีเมล์(2) | โทรศัพท์(2) | วิธีชำระเงิน(2, bg-amber) | เลขที่ใบกำกับภาษี(2) */}
                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">อีเมล์</div>
                      <Input data-testid="input-email" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">โทรศัพท์</div>
                      <Input data-testid="input-phone" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top bg-amber-50/70" colSpan={2}>
                      <div className="text-[10px] text-amber-600 font-semibold mb-0.5">วิธีชำระเงิน</div>
                      <Select
                        value={(() => {
                          const pm = form.paymentMethod;
                          if (!pm || pm === "เครดิต") return "เครดิต";
                          const found = activePaymentMethods.find((m: any) => m.accountCode === pm && m.isDefault)
                            || activePaymentMethods.find((m: any) => m.accountCode === pm);
                          return found ? `pm_${found.id}` : pm;
                        })()}
                        onValueChange={v => {
                          if (v === "เครดิต") { setForm(p => ({ ...p, paymentMethod: "เครดิต" })); return; }
                          const pm = activePaymentMethods.find((m: any) => `pm_${m.id}` === v);
                          setForm(p => ({ ...p, paymentMethod: pm ? pm.accountCode : v }));
                        }}
                      >
                        <SelectTrigger data-testid="select-payment-method" className="h-7 text-xs border-dashed border-amber-300 bg-white focus:border-amber-500 focus:ring-amber-200">
                          <SelectValue placeholder="เลือกวิธีชำระเงิน" />
                        </SelectTrigger>
                        <SelectContent>
                          {(activePaymentMethods.length === 0 || form.paymentMethod === "เครดิต") && (
                            <SelectItem value="เครดิต">เครดิต (ตั้งลูกหนี้)</SelectItem>
                          )}
                          {activePaymentMethods.length > 0 ? (
                            activePaymentMethods.map((m: any) => (
                              <SelectItem key={m.id} value={`pm_${m.id}`}>
                                {acctName(m)}{m.bankName ? ` · ${m.bankName}` : ""}{m.bankAccountNo ? ` ${m.bankAccountNo}` : ""}
                              </SelectItem>
                            ))
                          ) : (
                            <>
                              <SelectItem value="เงินสด">เงินสด</SelectItem>
                              <SelectItem value="โอนเงิน">โอนเงิน</SelectItem>
                              <SelectItem value="เช็ค">เช็ค</SelectItem>
                              <SelectItem value="บัตรเครดิต">บัตรเครดิต</SelectItem>
                              <SelectItem value="พร้อมเพย์">พร้อมเพย์</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่ใบกำกับภาษี</div>
                      <div className="flex items-center gap-1">
                        <Select value={form.docPrefix} onValueChange={v => setForm(p => ({ ...p, docPrefix: v }))}>
                          <SelectTrigger data-testid="select-doc-prefix" className="h-7 text-xs w-[60px] border-dashed px-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {prefixOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input data-testid="input-tax-invoice-no" value={form.taxInvoiceNo} onChange={e => setForm(p => ({ ...p, taxInvoiceNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
                      </div>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">พนักงานขาย</div>
                      <Input data-testid="input-salesperson" list="emp-list-tiv" value={form.salesperson} onChange={e => setForm(p => ({ ...p, salesperson: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="เลือกหรือพิมพ์ชื่อ" />
                      <datalist id="emp-list-tiv">
                        {employeeNames.map(e => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">แผนก / โครงการ</div>
                      <div className="flex items-center gap-1">
                        <Input data-testid="input-department" list="dept-list-tiv" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="เลือกหรือพิมพ์แผนก" />
                        <datalist id="dept-list-tiv">
                          {departmentList.map(d => <option key={d.id} value={d.name} />)}
                        </datalist>
                        <Input data-testid="input-project" value={form.project} onChange={e => setForm(p => ({ ...p, project: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="โครงการ" />
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={4}>
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
                            <SelectItem value="KRW">KRW</SelectItem>
                            <SelectItem value="HKD">HKD</SelectItem>
                            <SelectItem value="TWD">TWD</SelectItem>
                            <SelectItem value="MYR">MYR</SelectItem>
                            <SelectItem value="AUD">AUD</SelectItem>
                          </SelectContent>
                        </Select>
                        {form.currencyCode !== "THB" && (
                          <>
                            <Input data-testid="input-exchange-rate" value={form.exchangeRate} onChange={e => setForm(p => ({ ...p, exchangeRate: e.target.value }))} className="h-7 text-xs border-dashed w-20" placeholder="อัตราแลกเปลี่ยน" />
                            <FetchRateButton currency={form.currencyCode} date={form.taxInvoiceDate} onRate={r => setForm(p => ({ ...p, exchangeRate: String(r) }))} rateType="buying_transfer" />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่ใบกำกับภาษีเดิม</div>
                      <Input data-testid="input-original-tax-invoice-no" value={form.originalTaxInvoiceNo} onChange={e => setForm(p => ({ ...p, originalTaxInvoiceNo: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="กรอกเลขที่ใบกำกับภาษีเดิม (ถ้ามี)" />
                    </td>
                    <td className="px-3 py-1.5" colSpan={4}>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={form.saveToContacts}
                            onCheckedChange={(v) => setForm(p => ({ ...p, saveToContacts: !!v }))}
                            disabled={!!form.customerId}
                          />
                          <span className="text-xs text-slate-600">บันทึกเข้าบัญชีรายชื่อ</span>
                        </div>
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

            <div className="border rounded overflow-visible -mx-2 sm:mx-0 doc-items-table">
              <table className="w-full text-sm" style={{tableLayout:"fixed", minWidth:"720px"}}>
                <colgroup>
                  <col style={{width:"3%"}} />
                  <col style={{width:"14%"}} />
                  <col style={{width:"auto"}} />
                  <col style={{width:"7%"}} />
                  <col style={{width:"11%"}} />
                  <col style={{width:"9%"}} />
                  <col style={{width:"5%"}} />
                  <col style={{width:"11%"}} />
                  <col style={{width:"5%"}} />
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
                    {warehouses.length > 1 && <th className="text-center font-medium text-white text-xs py-2 px-1">คลัง</th>}
                    <th className="text-right font-medium text-white text-xs py-2 px-1">มูลค่าก่อนภาษี</th>
                    <th className="py-2 px-0"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="align-top hover:bg-sky-50/30 border-b border-slate-300">
                      <td className="text-center text-xs text-slate-500 pt-3 px-1">{idx + 1}</td>
                      <td className="px-1 pt-1.5">
                        <div className="relative">
                          <div className="flex items-center gap-1">
                            <Package className="h-3.5 w-3.5 text-sky-500 flex-shrink-0" />
                            <Input
                              data-testid={`input-product-code-${idx}`}
                              className="h-7 text-xs border-dashed w-full min-w-0 px-1.5"
                              placeholder="เลือกหรือพิมพ์รหัส..."
                              value={productSearches[idx] !== undefined ? productSearches[idx] : (item.productCode || "")}
                              onChange={e => {
                                const val = e.target.value;
                                setProductSearches(prev => ({ ...prev, [idx]: val }));
                                setShowProductDropdown(prev => ({ ...prev, [idx]: true }));
                                if (!val) {
                                  const newItems = [...items];
                                  newItems[idx] = { ...newItems[idx], productId: undefined, productCode: "", productName: "", unitPrice: "0", unit: "ชิ้น", vatType: defaultVatType, total: "0" };
                                  setItems(newItems);
                                }
                              }}
                              onFocus={() => setShowProductDropdown(prev => ({ ...prev, [idx]: true }))}
                              onBlur={() => setTimeout(() => setShowProductDropdown(prev => ({ ...prev, [idx]: false })), 200)}
                            />
                          </div>
                          {showProductDropdown[idx] && (() => {
                            const searchVal = (productSearches[idx] || "").toLowerCase();
                            const filtered = products.filter(p =>
                              p.active !== false && (
                              (p.code || "").toLowerCase().includes(searchVal) ||
                              p.name.toLowerCase().includes(searchVal) ||
                              ((p as any).nameEn || "").toLowerCase().includes(searchVal) ||
                              ((p as any).nameZh || "").toLowerCase().includes(searchVal))
                            );
                            if (filtered.length === 0) return null;
                            return (
                              <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto w-full min-w-[200px]">
                                {filtered.map(p => (
                                  <button
                                    key={p.id}
                                    data-testid={`product-option-${idx}-${p.id}`}
                                    className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b last:border-b-0"
                                    onMouseDown={e => {
                                      e.preventDefault();
                                      handleProductSelect(idx, String(p.id));
                                      setProductSearches(prev => ({ ...prev, [idx]: undefined as any }));
                                      setShowProductDropdown(prev => ({ ...prev, [idx]: false }));
                                    }}
                                  >
                                    <div className="font-medium">{p.code ? `[${p.code}] ` : ""}{p.name}</div>
                                    {((p as any).nameEn || (p as any).nameZh) && (
                                      <span className="text-slate-400 text-[10px]">{(p as any).nameEn}{(p as any).nameEn && (p as any).nameZh ? " / " : ""}{(p as any).nameZh}</span>
                                    )}
                                    {p.price && <span className="text-slate-400 text-[10px] ml-1">฿{fmt(p.price)}</span>}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-1 pt-1.5">
                        <textarea className="w-full min-w-0 text-xs border border-dashed rounded px-2 py-1.5 resize-y min-h-[32px] focus:outline-none focus:ring-1 focus:ring-sky-400 bg-transparent" rows={2} placeholder="พิมพ์ชื่อสินค้า/บริการ" value={item.productName} onChange={e => updateItem(idx, "productName", e.target.value)} />
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
                      {warehouses.length > 1 && (
                        <td className="px-1 pt-1.5">
                          <select
                            data-testid={`select-warehouse-${idx}`}
                            className="h-9 text-xs border border-dashed rounded w-full px-1 bg-transparent"
                            value={item.warehouseId || ""}
                            onChange={e => { const newItems = [...items]; newItems[idx] = { ...newItems[idx], warehouseId: e.target.value ? Number(e.target.value) : undefined }; setItems(newItems); }}
                          >
                            <option value="">-- คลัง --</option>
                            {warehouses.map((w: any) => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="text-right pt-3 px-1">
                        {priceMode === "included" && item.vatType === "vat7" ? (
                          <span className="text-sm font-normal text-slate-800">{fmt((parseFloat(item.total || "0") / 1.07).toFixed(2))}</span>
                        ) : (
                          <span className="text-sm font-normal text-slate-800">{fmt(item.total)}</span>
                        )}
                      </td>
                      <td className="text-center pt-2 px-0">
                        <Button data-testid={`button-duplicate-item-${idx}`} variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white hover:bg-[#05b187]" onClick={() => duplicateItem(idx)} title="คัดลอกแถว">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-[#f94d4d] hover:text-white hover:bg-[#f94d4d]" onClick={() => removeItem(idx)} disabled={items.length === 1}>
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
                <div>
                  <Input data-testid="input-payment-terms" value={form.paymentTerms} onChange={e => setForm(p => ({ ...p, paymentTerms: e.target.value }))} className="h-8 text-xs border-dashed" placeholder="เงื่อนไขการชำระเงิน..." />
                </div>
                <div className="flex items-center gap-2 w-full">
                  <MultiFileAttachment
                    value={form.attachedUrl}
                    onChange={v => setForm(p => ({ ...p, attachedUrl: v }))}
                    testIdPrefix="tax-invoice-attachment"
                  />
                  <div className="flex-1" />
                </div>
              </div>

              <table className="border-collapse" style={{ fontSize: 14, marginLeft: "auto" }}>
                <tbody>
                  <tr className="border-b border-slate-300">
                    <td className="text-right pr-4 py-2 text-slate-500 whitespace-nowrap">ยอดรวมรายการ:</td>
                    <td className="text-right py-2 text-slate-700 w-40 pr-2">{fmt(totals.rawTotal)}</td>
                  </tr>
                  <tr className="border-b border-slate-300">
                    <td className="text-right pr-4 py-2 text-slate-600 font-semibold whitespace-nowrap align-top">ส่วนลด:</td>
                    <td className="text-right py-1.5 pr-2">
                      <div className="flex items-center justify-end gap-2">
                        <div className="inline-flex rounded-md overflow-hidden border border-slate-300 shrink-0">
                          <button type="button" data-testid="btn-disc-amount" onClick={() => { if (discountMode !== "amount") { setDiscountMode("amount"); setForm(p => ({ ...p, discountBeforeVat: String(parseFloat(p.discountBeforeVat) || 0) })); } }} className={`px-2 py-1 text-xs font-medium ${discountMode === "amount" ? "bg-[var(--theme-primary)] text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>฿</button>
                          <button type="button" data-testid="btn-disc-percent" onClick={() => { if (discountMode !== "percent") { setDiscountMode("percent"); const val = parseFloat(form.discountBeforeVat) || 0; setForm(p => ({ ...p, discountBeforeVat: Math.min(val, 100) + "%" })); } }} className={`px-2 py-1 text-xs font-medium ${discountMode === "percent" ? "bg-[var(--theme-primary)] text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>%</button>
                        </div>
                        <input data-testid="input-discount" inputMode="decimal" value={discountMode === "percent" ? form.discountBeforeVat.replace("%", "") : form.discountBeforeVat} onChange={e => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) { if (discountMode === "percent" && parseFloat(v) > 100) return; setForm(p => ({ ...p, discountBeforeVat: discountMode === "percent" ? v + "%" : v })); } }} style={{ fontSize: 13 }} className="h-8 w-28 text-right border border-slate-300 rounded bg-white px-2 outline-none focus:ring-1 focus:ring-[var(--theme-primary)]" placeholder="0" />
                      </div>
                      {discountMode === "percent" && totals.discountAmount > 0 && (
                        <div className="text-right text-xs text-red-400 mt-0.5 pr-0.5">-{fmt(totals.discountAmount)}</div>
                      )}
                    </td>
                  </tr>
                  <tr className="bg-[var(--theme-primary-light)] border-b border-slate-300">
                    <td className="text-right pr-4 py-2 text-slate-700 font-semibold whitespace-nowrap">ยอดหลังส่วนลด:</td>
                    <td className="text-right py-2 text-slate-800 pr-2">{fmt(totals.afterDiscount)}</td>
                  </tr>
                  <tr className="border-b border-slate-300">
                    <td className="text-right pr-4 py-2 text-slate-700 whitespace-nowrap">ภาษีมูลค่าเพิ่ม 7%:</td>
                    <td className="text-right py-2 text-slate-800 pr-2">{fmt(totals.vatAmount)}</td>
                  </tr>
                  <tr className="border-b border-slate-300">
                    <td className="text-right pr-4 py-2 text-slate-600 whitespace-nowrap align-top">หัก ณ ที่จ่าย:</td>
                    <td className="text-right py-1.5 pr-2">
                      <div className="flex items-center justify-end">
                        <input data-testid="input-wht" value={form.withholdingTax} onChange={e => { const v = e.target.value; if (/^\d*\.?\d*%?$/.test(v)) setForm(p => ({ ...p, withholdingTax: v })); }} style={{ fontSize: 13 }} className="h-8 w-28 text-right border border-slate-300 rounded bg-white px-2 outline-none focus:ring-1 focus:ring-[var(--theme-primary)]" placeholder="0 หรือ 3%" />
                      </div>
                      {form.withholdingTax.endsWith("%") && totals.withholdingTax > 0 && (
                        <div className="text-right text-xs text-red-400 mt-0.5 pr-0.5">-{fmt(totals.withholdingTax)}</div>
                      )}
                    </td>
                  </tr>
                  <tr className="bg-[var(--theme-primary-light)]">
                    <td className="text-right pr-4 py-2.5 font-bold text-[var(--theme-primary)] whitespace-nowrap" style={{ fontSize: 15 }}>รวมสุทธิ:</td>
                    <td className="text-right py-2.5 font-bold text-[var(--theme-primary)] pr-2" style={{ fontSize: 15 }}>{fmt(totals.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {form.customerId && (availableDeposits.length > 0 || depositDeductions.length > 0) && (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden" data-testid="deposit-deduction-section">
                <button
                  type="button"
                  className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-blue-100/50 transition-colors"
                  onClick={() => setDepositSectionOpen(o => !o)}
                  data-testid="button-toggle-deposit-section"
                >
                  <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-blue-800">ตัดเงินมัดจำ</span>
                  {depositDeductions.length > 0 && (
                    <span className="text-xs bg-[var(--theme-primary)] text-white rounded-full px-2 py-0.5">{depositDeductions.length} รายการ</span>
                  )}
                  <span className="ml-auto">
                    {depositSectionOpen ? <ChevronDown className="h-4 w-4 text-blue-500" /> : <ChevronRight className="h-4 w-4 text-blue-500" />}
                  </span>
                </button>
                {depositSectionOpen && (
                  <div className="px-4 pb-4">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-blue-100/50">
                          <TableHead className="text-xs text-blue-800 w-12 text-center">เลือก</TableHead>
                          <TableHead className="text-xs text-blue-800">เลขที่</TableHead>
                          <TableHead className="text-xs text-blue-800">วันที่</TableHead>
                          <TableHead className="text-xs text-blue-800 text-right">ยอดเดิม</TableHead>
                          <TableHead className="text-xs text-blue-800 text-right">คงเหลือ</TableHead>
                          <TableHead className="text-xs text-blue-800 text-right w-36">ตัดจำนวน</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const availableIds = new Set(availableDeposits.map((d: any) => d.id));
                          const extraDeds = depositDeductions.filter(d => !availableIds.has(d.depositReceiptId));
                          const extraRows = extraDeds.map(d => ({ id: d.depositReceiptId, depositNo: d.depositNo, totalAmount: "0", remainingAmount: "0", _existingOnly: true }));
                          return [...availableDeposits, ...extraRows];
                        })().map((dep: any) => {
                          const selected = depositDeductions.find(d => d.depositReceiptId === dep.id);
                          const remaining = parseFloat(dep.remainingAmount || dep.totalAmount || "0") + (dep._existingOnly ? (selected?.amount || 0) : 0);
                          const originalAmount = parseFloat(dep.totalAmount || "0") || (selected?.amount || 0);
                          const deductionAmount = selected?.amount || 0;
                          const exceedsRemaining = deductionAmount > remaining;
                          return (
                            <TableRow key={dep.id} className={selected ? "bg-blue-50" : ""} data-testid={`deposit-row-${dep.id}`}>
                              <TableCell className="text-center">
                                <Checkbox
                                  data-testid={`deposit-check-${dep.id}`}
                                  checked={!!selected}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setDepositDeductions(prev => [...prev, { depositReceiptId: dep.id, depositNo: dep.depositNo || dep.receiptNo || "", amount: remaining }]);
                                    } else {
                                      setDepositDeductions(prev => prev.filter(d => d.depositReceiptId !== dep.id));
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-xs font-medium">{dep.depositNo || dep.receiptNo || "-"}</TableCell>
                              <TableCell className="text-xs">{dep.depositDate || dep.receiptDate ? toDisplayDate(dep.depositDate || dep.receiptDate, dateFormat, dateEra) : "-"}</TableCell>
                              <TableCell className="text-xs text-right">{fmt(originalAmount)}</TableCell>
                              <TableCell className="text-xs text-right font-medium text-blue-700">{fmt(remaining)}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  data-testid={`deposit-amount-${dep.id}`}
                                  inputMode="decimal"
                                  disabled={!selected}
                                  value={selected ? String(selected.amount) : ""}
                                  onChange={e => {
                                    const v = e.target.value;
                                    if (!/^\d*\.?\d*$/.test(v)) return;
                                    const val = parseFloat(v) || 0;
                                    setDepositDeductions(prev => prev.map(d => d.depositReceiptId === dep.id ? { ...d, amount: val } : d));
                                  }}
                                  className={`h-7 text-xs text-right w-full ${exceedsRemaining ? "border-red-400 focus:ring-red-400" : "border-dashed"}`}
                                  placeholder="0.00"
                                />
                                {exceedsRemaining && (
                                  <div className="text-[10px] text-red-500 mt-0.5">ห้ามเกิน {fmt(remaining)}</div>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    {(() => {
                      const totalDeduction = depositDeductions.reduce((s, d) => s + (d.amount || 0), 0);
                      const netPayable = totals.totalAmount - totalDeduction;
                      if (totalDeduction <= 0) return null;
                      return (
                        <div className="mt-3 flex justify-end">
                          <table className="text-sm">
                            <tbody>
                              <tr>
                                <td className="text-right pr-4 py-1 text-blue-700 font-semibold whitespace-nowrap">ยอดมัดจำที่ตัด:</td>
                                <td className="text-right py-1 text-blue-800 font-semibold w-32" data-testid="text-total-deposit-deduction">-{fmt(totalDeduction)}</td>
                              </tr>
                              <tr>
                                <td className="text-right pr-4 py-1 text-[var(--theme-primary)] font-bold whitespace-nowrap">ยอดชำระเพิ่ม:</td>
                                <td className="text-right py-1 text-[var(--theme-primary)] font-bold w-32" data-testid="text-net-payable">{fmt(Math.max(netPayable, 0))}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4">
              <JournalPreviewPanel
                companyId={companyId ?? null}
                documentType="tax_invoice"
                subtotal={totals.afterDiscount?.toFixed(2) || "0"}
                vatAmount={totals.vatAmount?.toFixed(2) || "0"}
                withholdingTax={totals.withholdingTax?.toFixed(2) || "0"}
                paymentMethod={form.paymentMethod}
                currencyCode={form.currencyCode}
                exchangeRate={form.exchangeRate}
                linkedInvoiceId={fromInvoiceId ? Number(fromInvoiceId) : ((form as any).invoiceId || null)}
                              onLinesChange={setJournalOverrideLines}
              />
            </div>

            <div className="flex items-center justify-center gap-3 pt-4 border-t">
              <Button data-testid="button-reset" variant="outline" size="sm" className="h-9 px-6 gap-1.5" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" /> รีเซ็ต
              </Button>
              {editingId && companyId && (
                <AutoJournalButton
                  documentType="tax_invoice"
                  documentId={editingId}
                  companyId={companyId}
                  disabled={isSaving}
                />
              )}
              {editingId && !["issued", "cancelled", "voided"].includes(form.status) && (
                <Button
                  data-testid="button-issue"
                  onClick={() => statusMutation.mutate({ id: editingId, status: "issued" })}
                  disabled={statusMutation.isPending || isSaving}
                  size="sm"
                  className="h-9 px-6 gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {statusMutation.isPending ? "กำลังออก..." : "ออกใบกำกับภาษี"}
                </Button>
              )}
              {editingId && form.status === "issued" && (
                <Button
                  data-testid="button-void-doc"
                  onClick={() => statusMutation.mutate({ id: editingId, status: "voided" })}
                  disabled={statusMutation.isPending || isSaving}
                  variant="outline"
                  size="sm"
                  className="h-9 px-6 gap-1.5 text-sm border-red-300 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  ยกเลิกเอกสาร
                </Button>
              )}
              <Button
                data-testid="button-submit"
                onClick={handleSubmit}
                disabled={isSaving || isLocked}
                size="sm"
                className="h-9 px-8 gap-1.5 text-sm"
              >
                <Save className="h-3.5 w-3.5" />
                {isLocked ? "ล็อคแล้ว" : isSaving ? "กำลังบันทึก..." : "บันทึก [F2]"}
              </Button>
            </div>

            {isSaved && (
              <div className="border-t pt-4">
                <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  เชื่อมโยงเอกสาร — ออกเอกสารต่อจากใบกำกับภาษีนี้
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    data-testid="button-create-rc"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-700"
                    onClick={() => navigate(`/sales/receipt/new?fromTaxInvoice=${savedId || editingId}`)}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    ออกใบเสร็จรับเงิน
                  </Button>
                  <EtaxButton taxInvoiceId={savedId || editingId} companyId={companyId} taxInvoiceNo={form.taxInvoiceNo} />
                </div>
              </div>
            )}
          </fieldset>
        </div>
      </div>
      <RelatedDocuments docType="tax_invoice" docId={savedId || editingId} />
    </Layout>
  );
}
