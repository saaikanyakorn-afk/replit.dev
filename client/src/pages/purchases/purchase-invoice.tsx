import { useState, useEffect, useRef } from "react";
import { FetchRateButton } from "@/components/fetch-rate-button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute, useSearch } from "wouter";
import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useDocDropdowns } from "@/hooks/use-doc-dropdowns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Plus, FileText, Save, Trash2, Package, Home,
  RotateCcw, Copy, AlertCircle, CheckCircle2, XCircle, Search, Loader2, Info, ChevronDown, ChevronRight, Upload
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker, toDisplayDate } from "@/components/ui/date-picker";
import type { DateFormat } from "@/components/ui/date-picker";
import type { Contact, Product } from "@shared/schema";
import { useVatClosingCheck } from "@/hooks/use-vat-closing-check";
import JournalPreviewPanel, { type JournalLine } from "@/components/journal-preview-panel";
import { useDbdLookup } from "@/hooks/use-dbd-lookup";
import MultiFileAttachment from "@/components/multi-file-attachment";
import { toLocalDateStr } from "@/lib/utils";
import { usePrefixOptions } from "@/hooks/use-prefix-options";

import { useDateSettings } from "@/hooks/use-date-settings";
interface APItemForm {
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
  accountCode: string;
  accountName: string;
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

function AccountPickerDropdown({ value, displayValue, accounts, onChange, mode = "code", className }: {
  value: string;
  displayValue?: string;
  accounts: any[];
  onChange: (code: string, name: string) => void;
  mode?: "code" | "name";
  className?: string;
}) {
  const displayVal = mode === "code" ? value : (displayValue || "");
  const [search, setSearch] = useState(displayVal);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setSearch(mode === "code" ? value : (displayValue || "")); }, [value, displayValue, mode]);
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const q = search.toLowerCase().trim();
  const filtered = q
    ? accounts.filter((a: any) =>
        a.code?.includes(q) || a.name?.toLowerCase().includes(q) ||
        (a.nameTh && a.nameTh.includes(q))
      ).slice(0, 50)
    : accounts.slice(0, 50);
  return (
    <div ref={ref} className="relative">
      <Input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => { setSearch(""); setOpen(true); }}
        onBlur={() => { if (!open) setSearch(mode === "code" ? value : (displayValue || "")); }}
        className={className || (mode === "code" ? "h-6 text-[10px] font-mono px-1 w-20 border-dashed border-blue-300" : "h-6 text-[10px] px-1 border-dashed border-blue-300")}
        placeholder={mode === "code" ? "รหัส" : "ค้นหาบัญชี"}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-lg shadow-lg max-h-72 overflow-auto"
             style={{ minWidth: "360px" }}>
          {filtered.map((a: any) => (
            <button
              key={a.code}
              type="button"
              className="w-full text-left px-2 py-1.5 hover:bg-blue-50 text-xs flex gap-2 items-baseline"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(a.code, a.nameTh || a.name || "");
                setSearch(mode === "code" ? a.code : (a.nameTh || a.name || ""));
                setOpen(false);
              }}
            >
              <span className="font-mono text-blue-600 shrink-0 w-20">{a.code}</span>
              <span className="text-gray-700 truncate">{a.nameTh || a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

const isCreditPm = (name?: string | null) =>
  !!name && (name.toLowerCase() === "credit" || name === "เครดิต" || name.startsWith("เครดิต("));

const emptyItem = (): APItemForm => ({
  productCode: "",
  productName: "",
  description: "",
  qty: "1",
  unit: "ชิ้น",
  unitPrice: "0",
  discount: "0",
  total: "0",
  vatType: "vat7",
  accountCode: "",
  accountName: "",
  warehouseId: undefined,
});

export default function PurchaseInvoice() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/purchases/ap/new");
  const [matchEdit, paramsEdit] = useRoute("/purchases/ap/edit/:id");
  const urlFallback = window.location.pathname.match(/\/purchases\/ap\/edit\/(\d+)/);
  const editingId = matchEdit ? Number(paramsEdit?.id) : (urlFallback ? Number(urlFallback[1]) : null);
  const isNew = !editingId && (!!matchNew || window.location.pathname.includes("/purchases/ap/new"));

  const searchString = useSearch();
  const apSearchParams = isNew ? new URLSearchParams(searchString) : null;
  const fromPOId = apSearchParams?.get("fromPO") || null;
  const copyFromId = apSearchParams?.get("copyFrom") || null;

  const { selectedCompany } = useCompany();
  const { employeeNames, departmentList, branchList, acctName } = useDocDropdowns();
  const companyId = selectedCompany?.id;
  const defaultVatType = selectedCompany?.vatRegistered ? "vat7" : "non_vat";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { checkVatClosed, buildWarningMessage } = useVatClosingCheck();
  const { lookup: lookupDBD, loading: dbdLoading } = useDbdLookup();
  const [showVatClosedAlert, setShowVatClosedAlert] = useState(false);
  const [journalOverrideLines, setJournalOverrideLines] = useState<JournalLine[] | null>(null);
  const [vatClosedInfo, setVatClosedInfo] = useState<{ title: string; description: string } | null>(null);
  const [pendingSaveAction, setPendingSaveAction] = useState<"save" | "saveWht" | null>(null);

  const [priceMode, setPriceMode] = useState<"excluded" | "included">("excluded");
  const [form, setForm] = useState({
    apNo: "",
    apDate: toLocalDateStr(new Date()),
    dueDate: "",
    vendorId: undefined as number | undefined,
    vendorCode: "",
    vendorName: "",
    vendorAddress: "",
    vendorTaxId: "",
    branch: "สำนักงานใหญ่",
    sellerBranchId: "",
    contactPerson: "",
    contactPhone: "",
    contactEmail: "",
    creditDays: "",
    notes: "",
    status: "approved",
    salesperson: "",
    department: "",
    project: "",
    refDoc: "",
    docPrefix: "AP",
    saveToContacts: false,
    currencyCode: "THB",
    exchangeRate: "1",
    withholdingTax: "0",
    discountBeforeVat: "0",
    taxInvoiceRef: "",
    formulaCode: "Cash[AP]",
    showInTaxReport: true,
    paymentStatus: "unpaid",
    linkJournal: true,
    paymentMethod: "",
    attachedUrl: "",
  });

  const [vendorSearch, setVendorSearch] = useState<string | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [vendorCodeSearch, setVendorCodeSearch] = useState<string | null>(null);
  const [showVendorCodeDropdown, setShowVendorCodeDropdown] = useState(false);
  const [items, setItems] = useState<APItemForm[]>([emptyItem()]);
  const [productSearches, setProductSearches] = useState<Record<number, string>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<Record<number, boolean>>({});
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [loaded, setLoaded] = useState(false);
  const [manualDueDate, setManualDueDate] = useState(false);
  const [purchaseDepositDeductions, setPurchaseDepositDeductions] = useState<{ purchaseDepositId: number; depositNo: string; amount: number }[]>([]);
  const [depositSectionOpen, setDepositSectionOpen] = useState(true);
  const [pdfParsing, setPdfParsing] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isNew && selectedCompany && items.length === 1 && !items[0].productCode) {
      setItems([{ ...items[0], vatType: defaultVatType }]);
    }
  }, [selectedCompany]);

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
  const { prefixOptions, defaultPrefix } = usePrefixOptions("purchase_invoice", docSettings);
  useEffect(() => {
    if (isNew && defaultPrefix && form.docPrefix !== defaultPrefix) {
      setForm(p => ({ ...p, docPrefix: defaultPrefix }));
    }
  }, [defaultPrefix, isNew]);

  const { data: paymentMethodsList = [] } = useQuery<any[]>({
    queryKey: ["/api/payment-methods", companyId, "pay"],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/payment-methods?companyId=${companyId}&type=pay`, { credentials: "include" });
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
        setForm(p => ({
          ...p,
          paymentMethod: defaultPm.accountCode,
          paymentStatus: !isCreditPm(defaultPm.name || defaultPm.nameTh) ? "paid" : "unpaid",
        }));
      }
    }
  }, [activePaymentMethods, editingId]);

  const { data: expenseAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts", companyId, "expense-for-purchase"],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/accounts?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((a: any) => !a.isHeader);
    },
    enabled: !!companyId,
  });

  const { data: availableDeposits = [] } = useQuery<any[]>({
    queryKey: ["/api/purchase-deposits/available", companyId, form.vendorId],
    queryFn: async () => {
      if (!companyId || !form.vendorId) return [];
      const res = await fetch(`/api/purchase-deposits/available?companyId=${companyId}&vendorId=${form.vendorId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId && !!form.vendorId,
  });

  useEffect(() => {
    if (loaded) return;
    if (isNew && fromPOId) {
      (async () => {
        try {
          const res = await fetch(`/api/purchase-orders/${fromPOId}`, { credentials: "include" });
          if (res.ok) {
            const po = await res.json();
            setPriceMode(po.priceMode || "excluded");
            setForm(prev => ({
              ...prev,
              apNo: "",
              apDate: toLocalDateStr(new Date()),
              dueDate: toLocalDateStr(new Date()),
              vendorId: po.vendorId || undefined,
              vendorCode: po.vendorCode || "",
              vendorName: po.vendorName || "",
              vendorAddress: po.vendorAddress || "",
              vendorTaxId: po.vendorTaxId || "",
              branch: po.branch || "",
              sellerBranchId: po.sellerBranchId || "",
              contactPerson: po.contactPerson || "",
              contactPhone: po.contactPhone || "",
              contactEmail: po.contactEmail || "",
              creditDays: po.creditDays ? String(po.creditDays) : "",
              salesperson: po.salesperson || "",
              department: po.department || "",
              project: po.project || "",
              refDoc: po.poNo || "",
              currencyCode: po.currencyCode || "THB",
              exchangeRate: String(po.exchangeRate || "1"),
              withholdingTax: String(po.withholdingTax || "0"),
              discountBeforeVat: po.discountType === "percent" ? `${cleanDecimal(po.discountAmount, "0")}%` : cleanDecimal(po.discountAmount, "0"),
            }));
            if (po.discountType === "percent") setDiscountMode("percent");
            if (po.items && po.items.length > 0) {
              setItems(po.items.map((it: any) => ({
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
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew && copyFromId) {
      (async () => {
        try {
          const res = await fetch(`/api/purchase-invoices/${copyFromId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setForm({
              apNo: "",
              apDate: toLocalDateStr(new Date()),
              dueDate: data.dueDate || "",
              vendorId: data.vendorId || undefined,
              vendorCode: data.vendorCode || "",
              vendorName: data.vendorName || "",
              vendorAddress: data.vendorAddress || "",
              vendorTaxId: data.vendorTaxId || "",
              branch: data.branch || "",
              sellerBranchId: data.sellerBranchId || "",
              contactPerson: data.contactPerson || "",
              contactPhone: data.contactPhone || "",
              contactEmail: data.contactEmail || "",
              creditDays: data.creditDays ? String(data.creditDays) : "",
              notes: data.notes || "",
              status: "approved",
              salesperson: data.salesperson || "",
              department: data.department || "",
              project: data.project || "",
              refDoc: data.refDoc || "",
              docPrefix: data.docPrefix || "AP",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              withholdingTax: String(data.withholdingTax || "0"),
              discountBeforeVat: data.discountType === "percent" ? `${cleanDecimal(data.discountAmount, "0")}%` : cleanDecimal(data.discountAmount, "0"),
              taxInvoiceRef: data.taxInvoiceRef || "",
              formulaCode: data.formulaCode || "Cash[AP]",
              showInTaxReport: data.showInTaxReport !== false,
              paymentStatus: "unpaid",
              linkJournal: data.linkJournal ?? true,
              paymentMethod: data.paymentMethod || "",
              attachedUrl: data.attachedUrl || "",
            });
            if (data.discountType === "percent") setDiscountMode("percent");
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
                accountCode: it.accountCode || "",
                accountName: it.accountName || "",
                warehouseId: it.warehouseId || undefined,
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
          const res = await fetch(`/api/purchase-invoices/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setForm({
              apNo: data.apNo || "",
              apDate: data.apDate || "",
              dueDate: data.dueDate || "",
              vendorId: data.vendorId || undefined,
              vendorCode: data.vendorCode || "",
              vendorName: data.vendorName || "",
              vendorAddress: data.vendorAddress || "",
              vendorTaxId: data.vendorTaxId || "",
              branch: data.branch || "",
              sellerBranchId: data.sellerBranchId || "",
              contactPerson: data.contactPerson || "",
              contactPhone: data.contactPhone || "",
              contactEmail: data.contactEmail || "",
              creditDays: data.creditDays ? String(data.creditDays) : "",
              notes: data.notes || "",
              status: data.status || "draft",
              salesperson: data.salesperson || "",
              department: data.department || "",
              project: data.project || "",
              refDoc: data.refDoc || "",
              docPrefix: data.docPrefix || "AP",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              withholdingTax: String(data.withholdingTax || "0"),
              discountBeforeVat: data.discountType === "percent" ? `${cleanDecimal(data.discountAmount, "0")}%` : cleanDecimal(data.discountAmount, "0"),
              taxInvoiceRef: data.taxInvoiceRef || "",
              formulaCode: data.formulaCode || "Cash[AP]",
              showInTaxReport: data.showInTaxReport !== false,
              paymentStatus: data.paymentStatus || "unpaid",
              linkJournal: data.linkJournal ?? true,
              paymentMethod: data.paymentMethod || "",
              attachedUrl: data.attachedUrl || "",
            });
            if (data.discountType === "percent") setDiscountMode("percent");
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
                accountCode: it.accountCode || "",
                accountName: it.accountName || "",
                warehouseId: it.warehouseId || undefined,
              })));
            }

            try {
              const dedRes = await apiRequest("GET", `/api/purchase-deposit-deductions/by-document?documentType=purchase_invoice&documentId=${editingId}`);
              const existingDeds = await dedRes.json();
              if (Array.isArray(existingDeds) && existingDeds.length > 0) {
                setPurchaseDepositDeductions(existingDeds.map((d: any) => ({
                  purchaseDepositId: d.purchaseDepositId,
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
  }, [isNew, editingId, companyId, loaded, fromPOId]);

  useEffect(() => {
    if (!loaded || manualDueDate) return;
    const days = form.creditDays ? parseInt(form.creditDays) : NaN;
    if (!isNaN(days) && days >= 0 && form.apDate) {
      const base = new Date(form.apDate + "T00:00:00");
      base.setDate(base.getDate() + days);
      const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
      setForm(p => ({ ...p, dueDate: iso }));
    }
  }, [form.creditDays, form.apDate, loaded]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/purchase-invoices", data);
      const result = await res.json();
      const validDeductions = (data.purchaseDepositDeductions || []).filter((d: any) => d.amount > 0);
      for (const ded of validDeductions) {
        try {
          await apiRequest("POST", "/api/purchase-deposit-deductions", {
            companyId: data.companyId,
            purchaseDepositId: ded.purchaseDepositId,
            depositNo: ded.depositNo,
            amount: ded.amount,
            documentType: "purchase_invoice",
            documentId: result.id || null,
          });
        } catch {}
      }
      return result;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-deposits/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["/api/product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-reports/stock-card"] });
      toast({ title: "สร้างเอกสารซื้อสำเร็จ", variant: "success" as any });
      if (result?.journalResult?.skipped) {
        toast({ title: "ไม่ได้สร้างรายการบัญชี", description: result.journalResult.reason, variant: "destructive" });
      }
      navigate("/purchases/invoice");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/purchase-invoices/${id}`, data);
      const result = await res.json();
      await apiRequest("PUT", "/api/purchase-deposit-deductions/replace", {
        documentType: "purchase_invoice",
        documentId: id,
        deductions: (data.purchaseDepositDeductions || []).filter((d: any) => d.amount > 0).map((d: any) => ({
          purchaseDepositId: d.purchaseDepositId,
          documentNo: d.depositNo,
          amount: d.amount,
        })),
      });
      return result;
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-deposits/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["/api/product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-reports/stock-card"] });
      toast({ title: "อัพเดทเอกสารซื้อสำเร็จ", variant: "success" as any });
      if (result?.journalResult?.skipped) {
        toast({ title: "ไม่ได้สร้างรายการบัญชี", description: result.journalResult.reason, variant: "destructive" });
      }
      navigate("/purchases/invoice");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/purchase-invoices/${id}`, { status, journalOverrideLines: journalOverrideLines || undefined });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/stock-by-warehouse"] });
      queryClient.invalidateQueries({ queryKey: ["/api/product-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-reports/stock-card"] });
      const newStatus = data.status || "approved";
      setForm(p => ({ ...p, status: newStatus }));
      const statusLabels: Record<string, string> = { approved: "อนุมัติแล้ว", cancelled: "ยกเลิกแล้ว", paid: "ชำระแล้ว" };
      toast({ title: statusLabels[newStatus] || "อัพเดทสถานะสำเร็จ", variant: "success" as any });
      if (data?.journalResult?.skipped) {
        toast({ title: "ไม่ได้สร้างรายการบัญชี", description: data.journalResult.reason, variant: "destructive" });
      }
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  function handleVendorSelect(contactId: string) {
    const c = contacts.find(ct => ct.id === Number(contactId));
    if (c) {
      setForm(prev => ({
        ...prev,
        vendorId: c.id,
        vendorCode: c.code || "",
        vendorName: c.name,
        vendorAddress: c.address || "",
        vendorTaxId: c.taxId || "",
        branch: (c as any).branch || "",
        contactPerson: c.contactPerson || "",
        contactPhone: c.phone || "",
        contactEmail: c.email || "",
        creditDays: c.creditDays ? String(c.creditDays) : "",
      }));
      setPurchaseDepositDeductions([]);
    }
  }

  function handleProductSelect(idx: number, productId: string) {
    const p = products.find(pr => pr.id === Number(productId));
    if (p) {
      const newItems = [...items];
      const costPrice = Number(p.cost) > 0 ? String(p.cost) : String(p.price || "0");
      const productAccountCode = (p as any).accountCode || "";
      const matchedAcc = expenseAccounts.find((a: any) => a.code === productAccountCode);
      newItems[idx] = {
        ...newItems[idx],
        productId: p.id,
        productCode: p.code || "",
        productName: p.name,
        unitPrice: costPrice,
        unit: p.unit || "ชิ้น",
        vatType: p.vatType || defaultVatType,
        accountCode: productAccountCode,
        accountName: matchedAcc ? (matchedAcc.nameTh || matchedAcc.name || "") : "",
        total: calcItemTotal(newItems[idx].qty || "1", costPrice, "0"),
        warehouseId: newItems[idx].warehouseId || (warehouses.length > 0 ? warehouses[0].id : undefined),
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

  function addItem() { setItems([...items, { ...emptyItem(), vatType: defaultVatType, warehouseId: warehouses.length > 0 ? warehouses[0].id : undefined }]); }
  function duplicateItem(idx: number) {
    const copy = { ...items[idx], productId: items[idx].productId };
    const newItems = [...items];
    newItems.splice(idx + 1, 0, copy);
    setItems(newItems);
  }
  function removeItem(idx: number) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  }

  function calcTotals() {
    const discRaw = form.discountBeforeVat || "0";
    const discIsPercent = discRaw.endsWith("%");
    const whtRaw = form.withholdingTax || "0";
    const whtIsPercent = whtRaw.endsWith("%");
    const vatItemsTotal = items.filter(it => it.vatType === "vat7").reduce((s, it) => s + parseFloat(it.total || "0"), 0);
    const nonDeductibleItemsTotal = items.filter(it => it.vatType === "vat_non_deductible").reduce((s, it) => s + parseFloat(it.total || "0"), 0);
    const nonVatItemsTotal = items.filter(it => it.vatType !== "vat7" && it.vatType !== "vat_non_deductible").reduce((s, it) => s + parseFloat(it.total || "0"), 0);
    const rawTotal = vatItemsTotal + nonDeductibleItemsTotal + nonVatItemsTotal;
    const discPercVal = discIsPercent ? Math.min(parseFloat(discRaw) || 0, 100) : 0;
    const discAmount = discIsPercent ? rawTotal * discPercVal / 100 : (parseFloat(discRaw) || 0);
    if (priceMode === "included") {
      const vatIncluded = Math.max(vatItemsTotal - discAmount, 0);
      const vatBase = vatIncluded / 1.07;
      const deductibleVat = vatIncluded - vatBase;
      const nonDeductibleVat = nonDeductibleItemsTotal * 0.07;
      const vatAmount = deductibleVat + nonDeductibleVat;
      const afterDiscount = vatBase + nonDeductibleItemsTotal + Math.max(nonVatItemsTotal - Math.max(discAmount - vatItemsTotal, 0), 0);
      const wht = whtIsPercent ? afterDiscount * (parseFloat(whtRaw) || 0) / 100 : (parseFloat(whtRaw) || 0);
      return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, deductibleVat, nonDeductibleVat, withholdingTax: wht, totalAmount: afterDiscount + vatAmount - wht };
    } else {
      const afterDiscount = Math.max(rawTotal - discAmount, 0);
      const vatBase = Math.max(vatItemsTotal - discAmount, 0);
      const deductibleVat = vatBase * 0.07;
      const nonDeductibleVat = nonDeductibleItemsTotal * 0.07;
      const vatAmount = deductibleVat + nonDeductibleVat;
      const wht = whtIsPercent ? afterDiscount * (parseFloat(whtRaw) || 0) / 100 : (parseFloat(whtRaw) || 0);
      return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, deductibleVat, nonDeductibleVat, withholdingTax: wht, totalAmount: afterDiscount + vatAmount - wht };
    }
  }

  function handleReset() {
    setForm(prev => ({
      ...prev,
      apDate: toLocalDateStr(new Date()),
      dueDate: "",
      vendorId: undefined,
      vendorCode: "",
      vendorName: "",
      vendorAddress: "",
      vendorTaxId: "",
      branch: "สำนักงานใหญ่",
      sellerBranchId: "",
      contactPerson: "",
      contactPhone: "",
      contactEmail: "",
      creditDays: "",
      notes: "",
      salesperson: "",
      department: "",
      project: "",
      refDoc: "",
      saveToContacts: false,
      currencyCode: "THB",
      exchangeRate: "1",
      withholdingTax: "0",
      discountBeforeVat: "0",
      taxInvoiceRef: "",
      attachedUrl: "",
    }));
    setItems([{ ...emptyItem(), vatType: defaultVatType }]);
    setPriceMode("excluded");
    setPurchaseDepositDeductions([]);
  }

  async function handlePdfUpload(file: File) {
    setPdfParsing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/pdf-invoice-parse", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "ไม่สามารถอ่าน PDF" }));
        throw new Error(err.message);
      }
      const data = await res.json();

      const matchedVendor = contacts.find(c =>
        (c.type === "vendor" || c.type === "both") &&
        data.vendorTaxId && c.taxId === data.vendorTaxId
      );

      setForm(prev => ({
        ...prev,
        ...(data.invoiceNo ? { taxInvoiceRef: data.invoiceNo } : {}),
        ...(data.date ? { apDate: data.date } : {}),
        ...(data.dueDate ? { dueDate: data.dueDate } : {}),
        ...(matchedVendor ? {
          vendorId: matchedVendor.id,
          vendorCode: matchedVendor.code || "",
          vendorName: matchedVendor.name,
          vendorAddress: matchedVendor.address || "",
          vendorTaxId: matchedVendor.taxId || "",
          branch: matchedVendor.branch || "",
          contactPerson: matchedVendor.contactPerson || "",
          contactPhone: matchedVendor.phone || "",
          contactEmail: matchedVendor.email || "",
          creditDays: matchedVendor.creditDays ? String(matchedVendor.creditDays) : "",
        } : {
          ...(data.vendorName ? { vendorName: data.vendorName } : {}),
          ...(data.vendorTaxId ? { vendorTaxId: data.vendorTaxId } : {}),
          ...(data.vendorAddress ? { vendorAddress: data.vendorAddress } : {}),
          ...(data.vendorBranch ? { branch: data.vendorBranch } : {}),
        }),
        ...(data.withholdingTax > 0 ? { withholdingTax: String(data.withholdingTax) } : {}),
      }));

      if (data.items && data.items.length > 0) {
        const newItems: APItemForm[] = data.items.map((it: any) => ({
          productCode: "",
          productName: it.description || "",
          description: it.description || "",
          qty: String(it.qty || 1),
          unit: it.unit || "ชิ้น",
          unitPrice: String(it.unitPrice || 0),
          discount: "0",
          total: String(it.amount || 0),
          vatType: it.vatType || defaultVatType,
        }));
        setItems(newItems);
      }

      if (data.dueDate) setManualDueDate(true);

      const foundFields = [
        data.invoiceNo && "เลขที่",
        data.date && "วันที่",
        data.vendorName && "ผู้ขาย",
        data.items?.length && `${data.items.length} รายการ`,
      ].filter(Boolean);

      toast({
        title: "อ่าน PDF สำเร็จ",
        description: foundFields.length > 0
          ? `พบข้อมูล: ${foundFields.join(", ")}`
          : "ไม่พบข้อมูลที่ชัดเจน กรุณาตรวจสอบและกรอกเพิ่มเติม",
        variant: foundFields.length > 0 ? ("success" as any) : "default",
      });
    } catch (err: any) {
      toast({ title: "อ่าน PDF ไม่สำเร็จ", description: err.message, variant: "destructive" });
    } finally {
      setPdfParsing(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }

  function buildPayload() {
    const totals = calcTotals();
    return {
      companyId,
      apNo: form.apNo,
      apDate: form.apDate,
      dueDate: form.dueDate || null,
      vendorId: form.vendorId ? Number(form.vendorId) : null,
      vendorCode: form.vendorCode,
      vendorName: form.vendorName,
      vendorOrg: form.vendorName,
      vendorAddress: form.vendorAddress,
      vendorTaxId: form.vendorTaxId,
      branch: form.branch,
      sellerBranchId: form.sellerBranchId,
      contactPerson: form.contactPerson,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      creditDays: form.creditDays ? Number(form.creditDays) : null,
      taxInvoiceRef: form.taxInvoiceRef,
      formulaCode: form.formulaCode,
      showInTaxReport: form.showInTaxReport,
      paymentMethod: form.paymentMethod || null,
      paymentStatus: form.paymentStatus,
      priceMode,
      docPrefix: form.docPrefix,
      notes: form.notes,
      attachedUrl: form.attachedUrl,
      linkJournal: form.linkJournal,
      journalOverrideLines: journalOverrideLines || undefined,
      saveToContacts: form.saveToContacts,
      status: form.status,
      subtotal: totals.afterDiscount.toFixed(2),
      discountAmount: (discountMode === "percent" ? parseFloat(form.discountBeforeVat) || 0 : totals.discountAmount).toFixed(2),
      discountType: discountMode,
      vatAmount: totals.vatAmount.toFixed(2),
      withholdingTax: totals.withholdingTax.toFixed(2),
      totalAmount: totals.totalAmount.toFixed(2),
      purchaseDepositDeductions: purchaseDepositDeductions.filter(d => d.amount > 0),
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
        accountCode: it.accountCode || null,
        accountName: it.accountName || null,
        warehouseId: it.warehouseId || null,
      })),
    };
  }

  function doSave() {
    const payload = buildPayload();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  async function doSaveWht() {
    const payload = buildPayload();
    const totals = calcTotals();
    try {
      let savedDoc: any;
      if (editingId) {
        const res = await apiRequest("PATCH", `/api/purchase-invoices/${editingId}`, payload);
        savedDoc = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/purchase-invoices", payload);
        savedDoc = await res.json();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      toast({ title: "บันทึกเอกสารซื้อสำเร็จ", variant: "success" as any });
      const params = new URLSearchParams({
        vendorId: String(savedDoc.vendorId || ""),
        vendorName: savedDoc.vendorName || "",
        vendorAddress: savedDoc.vendorAddress || "",
        vendorTaxId: savedDoc.vendorTaxId || "",
        vendorBranch: savedDoc.branch || "",
        whtAmount: String(totals.withholdingTax.toFixed(2)),
        totalAmount: String(totals.afterDiscount.toFixed(2)),
        sourceDocType: "purchase_invoice",
        sourceDocId: String(savedDoc.id),
        sourceDocNo: savedDoc.apNo || "",
      });
      navigate(`/purchases/wht/new?${params.toString()}`);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
  }

  async function runVatClosingCheck(action: "save" | "saveWht"): Promise<boolean> {
    if (!companyId || !form.apDate) return true;
    const result = await checkVatClosed(companyId, form.apDate);
    if (result && result.closed) {
      const msg = buildWarningMessage(result, form.apDate);
      setVatClosedInfo(msg);
      setPendingSaveAction(action);
      setShowVatClosedAlert(true);
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!form.paymentMethod) {
      toast({ title: "กรุณาเลือกวิธีการจ่ายเงิน", description: "ต้องระบุวิธีการจ่ายเงินก่อนบันทึก", variant: "destructive" });
      return;
    }
    if (!(await runVatClosingCheck("save"))) return;
    doSave();
  }

  async function handleSaveAndWht() {
    if (!form.paymentMethod) {
      toast({ title: "กรุณาเลือกวิธีการจ่ายเงิน", description: "ต้องระบุวิธีการจ่ายเงินก่อนบันทึก", variant: "destructive" });
      return;
    }
    if (!(await runVatClosingCheck("saveWht"))) return;
    doSaveWht();
  }

  function resumeAfterVatWarning() {
    const action = pendingSaveAction;
    setShowVatClosedAlert(false);
    setVatClosedInfo(null);
    if (!action) return;
    if (action === "saveWht") {
      doSaveWht();
    } else {
      doSave();
    }
    setPendingSaveAction(null);
  }

  const totals = calcTotals();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLocked = !isNew && ["pending_approval", "paid", "cancelled"].includes(form.status);

  return (
    <Layout>
      <div className="space-y-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/purchases/invoice")}>เอกสารซื้อ (AP)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? (isLocked ? "ดูเอกสารซื้อ" : "แก้ไขเอกสารซื้อ") : "สร้างเอกสารซื้อ"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/purchases/invoice")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? (isLocked ? "ดูเอกสารซื้อ" : "แก้ไขเอกสารซื้อ") : "สร้างเอกสารซื้อ"}
          </h1>
          {isNew && !isLocked && (
            <>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                data-testid="input-pdf-upload"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handlePdfUpload(file);
                }}
              />
              <Button
                data-testid="button-pdf-import"
                variant="outline"
                size="sm"
                className="ml-auto border-[var(--theme-primary)] text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10"
                onClick={() => pdfInputRef.current?.click()}
                disabled={pdfParsing}
              >
                {pdfParsing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                {pdfParsing ? "กำลังอ่าน PDF..." : "อ่าน PDF อัตโนมัติ"}
              </Button>
            </>
          )}
        </div>

        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>เอกสารนี้มีสถานะ <strong>{form.status === "approved" ? "อนุมัติแล้ว" : form.status === "paid" ? "ชำระแล้ว" : "ยกเลิก"}</strong> ไม่สามารถแก้ไขได้</span>
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
                      <div className="text-[10px] text-slate-400 mb-0.5">รหัสคู่ค้า</div>
                      <div className="relative">
                        <Input
                          data-testid="input-vendor-code"
                          value={vendorCodeSearch !== null ? vendorCodeSearch : (form.vendorCode || "")}
                          onChange={e => {
                            const val = e.target.value;
                            setVendorCodeSearch(val);
                            setForm(p => ({ ...p, vendorCode: val, vendorId: undefined, vendorName: "", vendorAddress: "", vendorTaxId: "", branch: "", contactPerson: "", contactPhone: "", contactEmail: "", creditDays: "" }));
                            setVendorSearch(null);
                            setShowVendorCodeDropdown(true);
                          }}
                          onFocus={() => { setShowVendorCodeDropdown(true); setShowVendorDropdown(false); }}
                          onBlur={() => setTimeout(() => setShowVendorCodeDropdown(false), 200)}
                          className="h-7 text-xs border-dashed"
                        />
                        {showVendorCodeDropdown && (() => {
                          const searchVal = (vendorCodeSearch || "").toLowerCase();
                          const filtered = contacts.filter(c => (c.type === "vendor" || c.type === "both") && (
                            (c.code || "").toLowerCase().includes(searchVal) ||
                            c.name.toLowerCase().includes(searchVal)
                          ));
                          if (filtered.length === 0) return null;
                          return (
                            <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto min-w-[220px]">
                              {filtered.map(c => (
                                <button key={c.id} data-testid={`vendor-code-option-${c.id}`} className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b last:border-b-0"
                                  onMouseDown={e => { e.preventDefault(); handleVendorSelect(String(c.id)); setVendorCodeSearch(null); setVendorSearch(null); setShowVendorCodeDropdown(false); }}>
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
                      <Input data-testid="input-contact-person" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} className="h-7 text-xs border-dashed w-full" placeholder="ใส่ชื่อเต็ม หรือ ค้นหาจากบัญชีรายชื่อ" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เอกสารอ้างอิง</div>
                      <Input data-testid="input-ref-doc-top" value={form.refDoc} onChange={e => setForm(p => ({ ...p, refDoc: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ชื่อคู่ค้า</div>
                      <div className="relative">
                        <Input
                          data-testid="input-vendor-name"
                          value={vendorSearch !== null ? vendorSearch : form.vendorName}
                          onChange={e => {
                            const val = e.target.value;
                            setVendorSearch(val);
                            setForm(p => ({ ...p, vendorName: val, vendorId: undefined }));
                            setShowVendorDropdown(true);
                          }}
                          onFocus={() => { setShowVendorDropdown(true); setShowVendorCodeDropdown(false); }}
                          onBlur={() => setTimeout(() => setShowVendorDropdown(false), 200)}
                          className="h-7 text-xs border-dashed w-full"
                          placeholder="ใส่ชื่อเต็ม หรือ ค้นหาจากบัญชีรายชื่อ"
                        />
                        {showVendorDropdown && (() => {
                          const searchVal = (vendorSearch || "").toLowerCase();
                          const filtered = contacts.filter(c => (c.type === "vendor" || c.type === "both") && (
                            c.name.toLowerCase().includes(searchVal) ||
                            (c.code || "").toLowerCase().includes(searchVal)
                          ));
                          if (filtered.length === 0) return null;
                          return (
                            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                              {filtered.map(c => (
                                <button key={c.id} data-testid={`vendor-option-${c.id}`} className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b last:border-b-0"
                                  onMouseDown={e => { e.preventDefault(); handleVendorSelect(String(c.id)); setVendorSearch(null); setVendorCodeSearch(null); setShowVendorDropdown(false); }}>
                                  <div className="font-medium">{c.code ? `[${c.code}] ` : ""}{c.name}</div>
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
                    <td className="px-3 pt-1.5 pb-1 align-top bg-blue-50/40" colSpan={2}>
                      <div className="text-[10px] text-blue-600 font-medium mb-0.5">เลขที่ใบกำกับภาษี</div>
                      <Input data-testid="input-tax-invoice-ref" value={form.taxInvoiceRef} onChange={e => setForm(p => ({ ...p, taxInvoiceRef: e.target.value }))} className="h-7 text-xs border-dashed border-blue-300 bg-white focus:border-blue-500 focus:ring-blue-200" placeholder="เลขที่ใบกำกับภาษีของผู้ขาย" />
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ที่อยู่</div>
                      <Textarea data-testid="input-address" value={form.vendorAddress} onChange={e => setForm(p => ({ ...p, vendorAddress: e.target.value }))} rows={2} className="text-xs resize-none border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขประจำตัวผู้เสียภาษี</div>
                      <div className="flex gap-1">
                        <Input data-testid="input-tax-id" value={form.vendorTaxId} onChange={e => setForm(p => ({ ...p, vendorTaxId: e.target.value }))} className="h-7 text-xs border-dashed flex-1" />
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={dbdLoading || !form.vendorTaxId} onClick={async () => { const r = await lookupDBD(form.vendorTaxId); if (r) setForm(p => ({ ...p, vendorName: r.name, vendorAddress: r.address, branch: r.branch || p.branch })); }} data-testid="button-dbd-lookup">
                          {dbdLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        </Button>
                      </div>
                      <div className="mt-1.5">
                        <div className="text-[10px] text-slate-400 mb-0.5">#เครดิต (วัน)</div>
                        <Input data-testid="input-credit-days" inputMode="numeric" value={form.creditDays || ""} onChange={e => { const v = e.target.value; if (/^\d*$/.test(v)) { setManualDueDate(false); setForm(p => ({ ...p, creditDays: v })); } }} className="h-7 text-xs border-dashed" placeholder="0" />
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">วันที่ออกเอกสาร</div>
                      <DatePicker data-testid="input-ap-date" value={form.apDate} onChange={v => setForm(p => ({ ...p, apDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                      <div className="mt-1.5">
                        <div className="text-[10px] text-slate-400 mb-0.5">วันครบกำหนด</div>
                        <DatePicker data-testid="input-due-date" value={form.dueDate} onChange={v => { setManualDueDate(true); setForm(p => ({ ...p, dueDate: v })); }} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                      </div>
                    </td>
                  </tr>

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
                          if (!pm) return "";
                          const found = activePaymentMethods.find((m: any) => m.accountCode === pm);
                          return found ? `pm_${found.id}` : pm;
                        })()}
                        onValueChange={v => {
                          const pm = activePaymentMethods.find((m: any) => `pm_${m.id}` === v);
                          if (!pm) return;
                          setForm(p => ({ ...p, paymentMethod: pm.accountCode, paymentStatus: !isCreditPm(pm.name || pm.nameTh) ? "paid" : "unpaid" }));
                        }}
                      >
                        <SelectTrigger data-testid="select-payment-method" className="h-7 text-xs border-dashed">
                          <SelectValue placeholder="เลือกวิธีชำระเงิน" />
                        </SelectTrigger>
                        <SelectContent>
                          {activePaymentMethods.map((m: any) => (
                            <SelectItem key={m.id} value={`pm_${m.id}`}>
                              {acctName(m)}{m.bankName ? ` · ${m.bankName}` : ""}{m.bankAccountNo ? ` ${m.bankAccountNo}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่เอกสาร</div>
                      <div className="flex items-center gap-1">
                        <Select value={form.docPrefix} onValueChange={v => setForm(p => ({ ...p, docPrefix: v }))}>
                          <SelectTrigger data-testid="select-doc-prefix" className="h-7 text-xs w-[60px] border-dashed px-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {prefixOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input data-testid="input-ap-no" value={form.apNo} onChange={e => setForm(p => ({ ...p, apNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
                      </div>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">พนักงาน</div>
                      <Input data-testid="input-salesperson" list="emp-list-ap" value={form.salesperson} onChange={e => setForm(p => ({ ...p, salesperson: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="เลือกหรือพิมพ์ชื่อ" />
                      <datalist id="emp-list-ap">
                        {employeeNames.map(e => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">แผนก / โครงการ</div>
                      <div className="flex items-center gap-1">
                        <Input data-testid="input-department" list="dept-list-ap" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="เลือกหรือพิมพ์แผนก" />
                        <datalist id="dept-list-ap">
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
                          </SelectContent>
                        </Select>
                        {form.currencyCode !== "THB" && (
                          <>
                            <Input data-testid="input-exchange-rate" value={form.exchangeRate} onChange={e => setForm(p => ({ ...p, exchangeRate: e.target.value }))} className="h-7 text-xs border-dashed w-20" placeholder="อัตราแลกเปลี่ยน" />
                            <FetchRateButton currency={form.currencyCode} date={form.apDate} onRate={r => setForm(p => ({ ...p, exchangeRate: String(r) }))} rateType="buying_transfer" />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td className="px-3 py-1.5" colSpan={8}>
                      <div className="flex items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Checkbox checked={form.saveToContacts} onCheckedChange={(v) => setForm(p => ({ ...p, saveToContacts: !!v }))} disabled={!!form.vendorId} />
                          <span className="text-xs text-slate-600">บันทึกเข้าบัญชีรายชื่อ</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={form.showInTaxReport} onCheckedChange={(v) => setForm(p => ({ ...p, showInTaxReport: !!v }))} />
                          <span className="text-xs text-amber-600 font-medium">แสดงในรายงานภาษีซื้อ</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">สาขาผู้ออก:</span>
                          <select data-testid="select-seller-branch" value={form.sellerBranchId || ""} onChange={e => setForm(p => ({ ...p, sellerBranchId: e.target.value }))} className="h-7 text-xs border rounded px-2 bg-white min-w-[160px]">
                            <option value="">-- ไม่ระบุ --</option>
                            {branchList.map(b => <option key={b.id} value={b.code}>{b.code} - {b.name}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Checkbox checked={form.linkJournal} onCheckedChange={(v) => setForm(p => ({ ...p, linkJournal: !!v }))} />
                          <span className="text-xs text-slate-600">เชื่อมโยงบัญชี</span>
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
                    {warehouses.length > 1 && <th className="text-center font-medium text-white text-xs py-2 px-1">คลัง</th>}
                    <th className="text-right font-medium text-white text-xs py-2 px-1">มูลค่าก่อนภาษี</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-300 group" data-testid={`row-item-${idx}`}>
                      <td className="text-center text-xs py-1 px-1 text-slate-400">{idx + 1}</td>
                      <td className="py-1 px-1">
                        <div className="relative">
                          <div className="flex items-center gap-1">
                            <Package className="h-3 w-3 text-slate-400 flex-shrink-0" />
                            <Input
                              data-testid={`input-item-code-${idx}`}
                              value={productSearches[idx] !== undefined ? productSearches[idx] : item.productCode}
                              onChange={e => {
                                setProductSearches(p => ({ ...p, [idx]: e.target.value }));
                                setShowProductDropdown(p => ({ ...p, [idx]: true }));
                              }}
                              onFocus={() => setShowProductDropdown(p => ({ ...p, [idx]: true }))}
                              onBlur={() => setTimeout(() => setShowProductDropdown(p => ({ ...p, [idx]: false })), 200)}
                              className="h-7 text-xs border-dashed flex-1"
                              placeholder="รหัส"
                            />
                          </div>
                          {showProductDropdown[idx] && (() => {
                            const sv = (productSearches[idx] || "").toLowerCase();
                            const filtered = products.filter(p =>
                              p.active !== false && (
                              (p.code || "").toLowerCase().includes(sv) ||
                              p.name.toLowerCase().includes(sv))
                            );
                            if (filtered.length === 0) return null;
                            return (
                              <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto min-w-[240px]">
                                {filtered.slice(0, 10).map(p => (
                                  <button key={p.id} className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b last:border-b-0"
                                    onMouseDown={e => { e.preventDefault(); handleProductSelect(idx, String(p.id)); setProductSearches(ps => { const n = { ...ps }; delete n[idx]; return n; }); setShowProductDropdown(ps => ({ ...ps, [idx]: false })); }}>
                                    <span className="font-medium">{p.code}</span>
                                    <span className="text-slate-500 ml-1.5">{p.name}</span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-1 px-1">
                        <textarea
                          data-testid={`input-item-name-${idx}`}
                          value={item.productName}
                          onChange={e => updateItem(idx, "productName", e.target.value)}
                          className="w-full text-xs border border-dashed rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-sky-300 min-h-[28px]"
                          rows={1}
                        />
                        
                      </td>
                      <td className="py-1 px-1">
                        <Input data-testid={`input-item-qty-${idx}`} value={item.qty} onChange={e => updateItem(idx, "qty", e.target.value)} className="h-7 text-xs border-dashed text-center" />
                      </td>
                      <td className="py-1 px-1">
                        <Input
                          data-testid={`input-item-price-${idx}`}
                          value={editingPriceIdx === idx ? item.unitPrice : fmt(item.unitPrice)}
                          onFocus={() => setEditingPriceIdx(idx)}
                          onBlur={() => setEditingPriceIdx(null)}
                          onChange={e => updateItem(idx, "unitPrice", e.target.value)}
                          className="h-7 text-xs border-dashed text-right"
                        />
                      </td>
                      <td className="py-1 px-1">
                        <Input data-testid={`input-item-discount-${idx}`} value={item.discount} onChange={e => updateItem(idx, "discount", e.target.value)} className="h-7 text-xs border-dashed text-center" placeholder="0 หรือ 0%" />
                      </td>
                      <td className="py-1 px-1">
                        <Select value={item.vatType} onValueChange={v => updateItem(idx, "vatType", v)}>
                          <SelectTrigger className="h-7 text-[10px] border-dashed px-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vat7">7%</SelectItem>
                            <SelectItem value="vat_non_deductible">7% ต้องห้าม</SelectItem>
                            <SelectItem value="vat0">0%</SelectItem>
                            <SelectItem value="exempt">-</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      {warehouses.length > 1 && (
                        <td className="py-1 px-1">
                          <select
                            data-testid={`select-warehouse-${idx}`}
                            value={item.warehouseId || ""}
                            onChange={e => { const newItems = [...items]; newItems[idx] = { ...newItems[idx], warehouseId: e.target.value ? Number(e.target.value) : undefined }; setItems(newItems); }}
                            className="h-7 text-xs border border-dashed rounded px-1 w-full min-w-[80px]"
                          >
                            <option value="">-</option>
                            {warehouses.map((w: any) => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      <td className="py-1 px-1 text-right text-xs font-medium">{fmt(item.total)}</td>
                      <td className="py-1 px-1">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <button onClick={() => duplicateItem(idx)} className="p-1 hover:bg-slate-100 rounded" title="คัดลอก"><Copy className="h-3 w-3 text-slate-400" /></button>
                          <button onClick={() => removeItem(idx)} className="p-1 hover:bg-red-50 rounded" title="ลบ"><Trash2 className="h-3 w-3 text-red-400" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-2 py-1 border-t">
                <button data-testid="button-add-item" onClick={addItem} className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium px-2 py-1.5 hover:bg-green-50 rounded">
                  <Plus className="h-4 w-4" /> เพิ่มรายการ
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-slate-400 mb-1">หมายเหตุ</div>
                  <Textarea data-testid="input-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="text-xs resize-none border-dashed" placeholder="หมายเหตุ..." />
                </div>
                <div className="flex items-center gap-2 w-full">
                  <MultiFileAttachment
                    value={form.attachedUrl}
                    onChange={v => setForm(p => ({ ...p, attachedUrl: v }))}
                    testIdPrefix="ap-attachment"
                  />
                  <div className="flex-1" />
                </div>
              </div>

              <table className="border-collapse" style={{ fontSize: 14, marginLeft: "auto" }}>
                <tbody>
                  <tr className="border-b border-slate-300">
                    <td className="text-right pr-4 py-2 text-slate-500 whitespace-nowrap">รวมก่อนส่วนลด:</td>
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
                    <td className="text-right pr-4 py-2 text-slate-700 whitespace-nowrap">
                      ภาษีมูลค่าเพิ่ม 7%:
                      {totals.nonDeductibleVat > 0 && (
                        <div className="text-[10px] text-red-500 font-normal mt-0.5">
                          (ภาษีซื้อต้องห้าม {fmt(totals.nonDeductibleVat)} รวมในต้นทุน)
                        </div>
                      )}
                    </td>
                    <td className="text-right py-2 text-slate-800 pr-2">
                      {fmt(totals.vatAmount)}
                      {totals.nonDeductibleVat > 0 && totals.deductibleVat > 0 && (
                        <div className="text-[10px] text-green-600 mt-0.5">ใช้ได้ {fmt(totals.deductibleVat)}</div>
                      )}
                    </td>
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
                    <td className="text-right pr-4 py-2.5 font-bold text-[var(--theme-primary)] whitespace-nowrap" style={{ fontSize: 15 }}>ยอดรวมสุทธิ:</td>
                    <td className="text-right py-2.5 font-bold text-[var(--theme-primary)] pr-2" style={{ fontSize: 15 }}>{fmt(totals.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </fieldset>
        </div>

        {form.vendorId && (availableDeposits.length > 0 || purchaseDepositDeductions.length > 0) && (
          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg overflow-hidden" data-testid="purchase-deposit-deduction-section">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-blue-100/50 transition-colors"
              onClick={() => setDepositSectionOpen(o => !o)}
              data-testid="button-toggle-purchase-deposit-section"
            >
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-blue-800">ตัดเงินมัดจำซื้อ</span>
              {purchaseDepositDeductions.length > 0 && (
                <span className="text-xs bg-[var(--theme-primary)] text-white rounded-full px-2 py-0.5">{purchaseDepositDeductions.length} รายการ</span>
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
                      const extraDeds = purchaseDepositDeductions.filter(d => !availableIds.has(d.purchaseDepositId));
                      const extraRows = extraDeds.map(d => ({ id: d.purchaseDepositId, depositNo: d.depositNo, totalAmount: "0", remainingAmount: "0", _existingOnly: true }));
                      return [...availableDeposits, ...extraRows];
                    })().map((dep: any) => {
                      const selected = purchaseDepositDeductions.find(d => d.purchaseDepositId === dep.id);
                      const remaining = parseFloat(dep.remainingAmount || dep.totalAmount || "0") + (dep._existingOnly ? (selected?.amount || 0) : 0);
                      const originalAmount = parseFloat(dep.totalAmount || "0") || (selected?.amount || 0);
                      const deductionAmount = selected?.amount || 0;
                      const exceedsRemaining = deductionAmount > remaining;
                      return (
                        <TableRow key={dep.id} className={selected ? "bg-blue-50" : ""} data-testid={`purchase-deposit-row-${dep.id}`}>
                          <TableCell className="text-center">
                            <Checkbox
                              data-testid={`purchase-deposit-check-${dep.id}`}
                              checked={!!selected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setPurchaseDepositDeductions(prev => [...prev, { purchaseDepositId: dep.id, depositNo: dep.depositNo || "", amount: remaining }]);
                                } else {
                                  setPurchaseDepositDeductions(prev => prev.filter(d => d.purchaseDepositId !== dep.id));
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-xs font-medium">{dep.depositNo || "-"}</TableCell>
                          <TableCell className="text-xs">{dep.depositDate ? toDisplayDate(dep.depositDate, dateFormat, dateEra) : "-"}</TableCell>
                          <TableCell className="text-xs text-right">{fmt(originalAmount)}</TableCell>
                          <TableCell className="text-xs text-right font-medium text-blue-700">{fmt(remaining)}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              data-testid={`purchase-deposit-amount-${dep.id}`}
                              inputMode="decimal"
                              disabled={!selected}
                              value={selected ? String(selected.amount) : ""}
                              onChange={e => {
                                const v = e.target.value;
                                if (!/^\d*\.?\d*$/.test(v)) return;
                                const val = parseFloat(v) || 0;
                                setPurchaseDepositDeductions(prev => prev.map(d => d.purchaseDepositId === dep.id ? { ...d, amount: val } : d));
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
                  const totalDeduction = purchaseDepositDeductions.reduce((s, d) => s + (d.amount || 0), 0);
                  const netPayable = totals.totalAmount - totalDeduction;
                  if (totalDeduction <= 0) return null;
                  return (
                    <div className="mt-3 flex justify-end">
                      <table className="text-sm">
                        <tbody>
                          <tr>
                            <td className="text-right pr-4 py-1 text-blue-700 font-semibold whitespace-nowrap">ยอดมัดจำที่ตัด:</td>
                            <td className="text-right py-1 text-blue-800 font-semibold w-32" data-testid="text-total-purchase-deposit-deduction">-{fmt(totalDeduction)}</td>
                          </tr>
                          <tr>
                            <td className="text-right pr-4 py-1 text-[var(--theme-primary)] font-bold whitespace-nowrap">ยอดชำระเพิ่ม:</td>
                            <td className="text-right py-1 text-[var(--theme-primary)] font-bold w-32" data-testid="text-purchase-net-payable">{fmt(Math.max(netPayable, 0))}</td>
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
            documentType="purchase"
            subtotal={totals.afterDiscount?.toFixed(2) || "0"}
            vatAmount={totals.vatAmount?.toFixed(2) || "0"}
            withholdingTax={totals.withholdingTax?.toFixed(2) || "0"}
            paymentMethod={form.paymentMethod}
            lineItemAccounts={items.filter(i => i.accountCode).map(i => ({
              accountCode: i.accountCode,
              accountName: i.accountName || "",
              amount: parseFloat(i.total || "0"),
              description: i.productName || "",
            }))}
            onLinesChange={setJournalOverrideLines}
          />
        </div>

        <div className="flex items-center justify-center gap-3 mt-4">
          <Button variant="outline" onClick={handleReset} data-testid="button-reset" disabled={isLocked}>
            <RotateCcw className="h-4 w-4 mr-2" /> รีเซต
          </Button>
          {editingId && !isLocked && (
            <>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => statusMutation.mutate({ id: editingId, status: "approved" })} data-testid="button-approve">
                <CheckCircle2 className="h-4 w-4 mr-2" /> อนุมัติ
              </Button>
              <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50" onClick={() => statusMutation.mutate({ id: editingId, status: "cancelled" })} data-testid="button-cancel-doc">
                <XCircle className="h-4 w-4 mr-2" /> ยกเลิกเอกสาร
              </Button>
            </>
          )}
          <Button onClick={handleSubmit} disabled={isSaving || isLocked} data-testid="button-save">
            <Save className="h-4 w-4 mr-2" /> บันทึก [F2]
          </Button>
          {parseFloat(form.withholdingTax) > 0 && !isLocked && (
            <Button
              onClick={handleSaveAndWht}
              disabled={isSaving}
              className="text-white"
              style={{ background: "var(--theme-primary)" }}
              data-testid="button-save-wht"
            >
              <FileText className="h-4 w-4 mr-2" /> บันทึกพร้อมออก 50 ทวิ
            </Button>
          )}
        </div>
      </div>
      <AlertDialog open={showVatClosedAlert} onOpenChange={setShowVatClosedAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              {vatClosedInfo?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {vatClosedInfo?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowVatClosedAlert(false); setVatClosedInfo(null); setPendingSaveAction(null); }}>
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600"
              onClick={resumeAfterVatWarning}
              data-testid="button-confirm-vat-closed-save"
            >
              บันทึกต่อ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
