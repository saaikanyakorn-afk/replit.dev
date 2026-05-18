import { useState, useEffect, useRef, useMemo } from "react";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import Layout from "@/components/layout";
import { FetchRateButton } from "@/components/fetch-rate-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useDocDropdowns } from "@/hooks/use-doc-dropdowns";
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
import {
  ArrowLeft, Plus, FileText, Save, Trash2, Home, BookOpen, ChevronDown, ChevronUp, Pencil,
  RotateCcw, Copy, AlertCircle, CheckCircle2, XCircle, ChevronsUpDown, Check, Warehouse, Search, Loader2,
  X
} from "lucide-react";
import { cn, toLocalDateStr } from "@/lib/utils";
import { usePrefixOptions } from "@/hooks/use-prefix-options";
import { apiRequest } from "@/lib/queryClient";
import { invalidateDocCaches } from "@/lib/invalidate-doc-caches";
import { DatePicker, toDisplayDate } from "@/components/ui/date-picker";
import type { DateFormat } from "@/components/ui/date-picker";
import type { Contact } from "@shared/schema";
import { useVatClosingCheck } from "@/hooks/use-vat-closing-check";
import { useDbdLookup } from "@/hooks/use-dbd-lookup";
import MultiFileAttachment from "@/components/multi-file-attachment";

import { useDateSettings } from "@/hooks/use-date-settings";
interface EXPItemForm {
  accountCode: string;
  accountName: string;
  description: string;
  expenseType: string;
  amount: string;
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

function AccountPickerDropdown({ value, displayValue, accounts, onChange, mode = "code", className }: {
  value: string;
  displayValue?: string;
  accounts: any[];
  onChange: (code: string, name: string) => void;
  mode?: "code" | "name";
  className?: string;
}) {
  const [search, setSearch] = useState(mode === "code" ? value : (displayValue || ""));
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
        className={className || (mode === "code" ? "h-7 text-xs font-mono px-1.5 w-24" : "h-7 text-xs px-1.5")}
        placeholder={mode === "code" ? "รหัส" : "ค้นหาชื่อบัญชี"}
        data-testid={mode === "code" ? "input-journal-account-code" : "input-journal-account-name"}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-lg shadow-lg max-h-72 overflow-auto w-80"
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


const isCreditPm = (name?: string | null) =>
  !!name && (name.toLowerCase() === "credit" || name === "เครดิต" || name.startsWith("เครดิต("));

const emptyItem = (): EXPItemForm => ({
  accountCode: "",
  accountName: "",
  description: "",
  expenseType: "expense",
  amount: "0",
  vatType: "vat7",
});

export default function Expense() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/purchases/exp/new");
  const [matchEdit, paramsEdit] = useRoute("/purchases/exp/edit/:id");
  const urlFallbackExp = window.location.pathname.match(/\/purchases\/exp\/edit\/(\d+)/);
  const editingId = matchEdit ? Number(paramsEdit?.id) : (urlFallbackExp ? Number(urlFallbackExp[1]) : null);
  const isNew = !editingId && (!!matchNew || window.location.pathname.includes("/purchases/exp/new"));
  const copyFromId = isNew ? new URLSearchParams(window.location.search).get("copyFrom") : null;

  const { selectedCompany } = useCompany();
  const { employeeNames, departmentList, branchList, acctName } = useDocDropdowns();
  const companyId = selectedCompany?.id;
  const defaultVatType = selectedCompany?.vatRegistered ? "vat7" : "non_vat";
  const { toast } = useToast();
  const { theme } = useThemeColor();
  const whtBtnColor = theme === "orange" ? "#03c9d7" : "#fb9678";
  const queryClient = useQueryClient();
  const { checkVatClosed, buildWarningMessage } = useVatClosingCheck();
  const { lookup: lookupDBD, loading: dbdLoading } = useDbdLookup();

  const [form, setForm] = useState({
    expNo: "",
    expDate: toLocalDateStr(new Date()),
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
    taxInvoiceRef: "",
    notes: "",
    status: "approved",
    salesperson: "",
    department: "",
    project: "",
    refDoc: "",
    docPrefix: "EXP",
    saveToContacts: false,
    currencyCode: "THB",
    exchangeRate: "1",
    withholdingTax: "0",
    discountBeforeVat: "0",
    paymentMethod: "",
    attachedUrl: "",
    showInTaxReport: true,
  });

  const [vendorSearch, setVendorSearch] = useState<string | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [vendorCodeSearch, setVendorCodeSearch] = useState<string | null>(null);
  const [showVendorCodeDropdown, setShowVendorCodeDropdown] = useState(false);
  const [items, setItems] = useState<EXPItemForm[]>([emptyItem()]);
  const [editingAmountIdx, setEditingAmountIdx] = useState<number | null>(null);
  const [openAccountPopover, setOpenAccountPopover] = useState<string | null>(null);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [loaded, setLoaded] = useState(false);
  const [manualDueDate, setManualDueDate] = useState(false);
  const [showAssetBelowAlert, setShowAssetBelowAlert] = useState(false);
  const [showAssetAboveAlert, setShowAssetAboveAlert] = useState(false);
  const [assetAlertItem, setAssetAlertItem] = useState<{ idx: number; accountName: string; amount: number; threshold: number } | null>(null);
  const [pendingSaveAction, setPendingSaveAction] = useState<"save" | "saveWht" | null>(null);
  const [pendingAlertPhase, setPendingAlertPhase] = useState<"asset" | "vat" | null>(null);
  const [journalPreview, setJournalPreview] = useState<any>(null);
  const [journalExpanded, setJournalExpanded] = useState(true);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalEditing, setJournalEditing] = useState(false);
  const [editableLines, setEditableLines] = useState<any[]>([]);
  const [showVatClosedAlert, setShowVatClosedAlert] = useState(false);
  const [vatClosedInfo, setVatClosedInfo] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    if (isNew && selectedCompany && items.length === 1 && !items[0].accountCode) {
      setItems([{ ...items[0], vatType: defaultVatType }]);
    }
  }, [selectedCompany]);

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

  const { data: accounts = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/accounts?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const accountsForSelect = useMemo(() => {
    return (accounts as any[])
      .filter(a => !a.isHeader && String(a.code || "").length >= 7)
      .sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  }, [accounts]);

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
  const { prefixOptions, defaultPrefix } = usePrefixOptions("expense", docSettings);
  useEffect(() => {
    if (isNew && defaultPrefix && form.docPrefix !== defaultPrefix) {
      setForm(p => ({ ...p, docPrefix: defaultPrefix }));
    }
  }, [defaultPrefix, isNew]);

  const { data: assetSettings } = useQuery<{ assetMinThreshold: string }>({
    queryKey: ["/api/asset-settings", companyId],
    queryFn: () => fetch(`/api/asset-settings?companyId=${companyId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!companyId,
  });
  const assetMinThreshold = parseFloat(assetSettings?.assetMinThreshold || "0");

  useEffect(() => {
    if (loaded) return;
    if (isNew && copyFromId) {
      (async () => {
        try {
          const res = await fetch(`/api/expenses/${copyFromId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setForm({
              expNo: "",
              expDate: toLocalDateStr(new Date()),
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
              taxInvoiceRef: data.taxInvoiceRef || "",
              notes: data.notes || "",
              status: "approved",
              salesperson: data.salesperson || "",
              department: data.department || "",
              project: data.project || "",
              refDoc: data.refDoc || "",
              docPrefix: data.docPrefix || "EXP",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              withholdingTax: (() => { const r = parseFloat(data.exchangeRate || "1") || 1; const v = parseFloat(data.withholdingTax || "0"); return r > 1 ? cleanDecimal(v / r, "0") : String(v || "0"); })(),
              discountBeforeVat: (() => { const r = parseFloat(data.exchangeRate || "1") || 1; if (data.discountType === "percent") return `${cleanDecimal(data.discountAmount, "0")}%`; const v = parseFloat(data.discountAmount || "0"); return r > 1 ? cleanDecimal(v / r, "0") : cleanDecimal(v, "0"); })(),
              paymentMethod: data.paymentMethod || "",
              attachedUrl: "",
              showInTaxReport: data.showInTaxReport !== false,
            });
            if (data.discountType === "percent") setDiscountMode("percent");
            if (data.items && data.items.length > 0) {
              const _r1 = parseFloat(data.exchangeRate || "1") || 1;
              setItems(data.items.map((it: any) => ({
                accountCode: it.accountCode || "",
                accountName: it.accountName || "",
                description: it.description || "",
                expenseType: it.expenseType || "expense",
                amount: _r1 > 1 ? cleanDecimal(parseFloat(it.amount || "0") / _r1, "0") : cleanDecimal(it.amount, "0"),
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
          const res = await fetch(`/api/expenses/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setForm({
              expNo: data.expNo || "",
              expDate: data.expDate || "",
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
              taxInvoiceRef: data.taxInvoiceRef || "",
              notes: data.notes || "",
              status: data.status || "draft",
              salesperson: data.salesperson || "",
              department: data.department || "",
              project: data.project || "",
              refDoc: data.refDoc || "",
              docPrefix: data.docPrefix || "EXP",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              withholdingTax: (() => { const r = parseFloat(data.exchangeRate || "1") || 1; const v = parseFloat(data.withholdingTax || "0"); return r > 1 ? cleanDecimal(v / r, "0") : String(v || "0"); })(),
              discountBeforeVat: (() => { const r = parseFloat(data.exchangeRate || "1") || 1; if (data.discountType === "percent") return `${cleanDecimal(data.discountAmount, "0")}%`; const v = parseFloat(data.discountAmount || "0"); return r > 1 ? cleanDecimal(v / r, "0") : cleanDecimal(v, "0"); })(),
              paymentMethod: data.paymentMethod || "",
              attachedUrl: data.attachedUrl || "",
              showInTaxReport: data.showInTaxReport !== false,
            });
            if (data.discountType === "percent") setDiscountMode("percent");
            if (data.items && data.items.length > 0) {
              const _r2 = parseFloat(data.exchangeRate || "1") || 1;
              setItems(data.items.map((it: any) => ({
                accountCode: it.accountCode || "",
                accountName: it.accountName || "",
                description: it.description || "",
                expenseType: it.expenseType || "expense",
                amount: _r2 > 1 ? cleanDecimal(parseFloat(it.amount || "0") / _r2, "0") : cleanDecimal(it.amount, "0"),
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

  useEffect(() => {
    if (!loaded || manualDueDate) return;
    const days = form.creditDays ? parseInt(form.creditDays) : NaN;
    if (!isNaN(days) && days >= 0 && form.expDate) {
      const base = new Date(form.expDate + "T00:00:00");
      base.setDate(base.getDate() + days);
      const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
      setForm(p => ({ ...p, dueDate: iso }));
    }
  }, [form.creditDays, form.expDate, loaded]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const doCreate = async () => { const res = await apiRequest("POST", "/api/expenses", data); return res.json(); };
      try { return await doCreate(); } catch (err: any) {
        if (err?.message?.toLowerCase().includes("timeout")) { await new Promise(r => setTimeout(r, 2000)); return await doCreate(); }
        throw err;
      }
    },
    onSuccess: () => {
      invalidateDocCaches(queryClient, [["/api/expenses"], ["/api/contacts"]]);
      toast({ title: "สร้างรายจ่ายสำเร็จ", variant: "success" as any });
      navigate("/purchases/expense");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const doUpdate = async () => { const res = await apiRequest("PATCH", `/api/expenses/${id}`, data); return res.json(); };
      try { return await doUpdate(); } catch (err: any) {
        if (err?.message?.toLowerCase().includes("timeout")) { await new Promise(r => setTimeout(r, 2000)); return await doUpdate(); }
        throw err;
      }
    },
    onSuccess: () => {
      invalidateDocCaches(queryClient, [["/api/expenses"], ["/api/contacts"]]);
      toast({ title: "อัพเดทรายจ่ายสำเร็จ", variant: "success" as any });
      navigate("/purchases/expense");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/expenses/${id}`, { status });
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateDocCaches(queryClient, [["/api/expenses"], ["/api/contacts"]]);
      const newStatus = data.status || "approved";
      setForm(p => ({ ...p, status: newStatus }));
      toast({ title: newStatus === "approved" ? "อนุมัติแล้ว" : "ยกเลิกแล้ว", variant: "success" as any });
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
    }
  }

  useEffect(() => {
    const validItems = items.filter(it => it.accountName || parseFloat(it.amount) > 0);
    if (validItems.length > 0) {
      const allNonDeductible = validItems.every(it => it.vatType === "vat_non_deductible");
      const hasAnyVat7 = validItems.some(it => it.vatType === "vat7");
      if (allNonDeductible) {
        setForm(p => ({ ...p, showInTaxReport: false }));
      } else if (hasAnyVat7 && !form.showInTaxReport) {
        setForm(p => ({ ...p, showInTaxReport: true }));
      }
    }
  }, [items.map(it => it.vatType).join(",")]);

  function updateItem(idx: number, field: string, value: string) {
    const newItems = [...items];
    const cleanVal = (field === "amount" || field === "vatAmount" || field === "whtAmount") ? value.replace(/,/g, "") : value;
    (newItems[idx] as any)[field] = cleanVal;
    setItems(newItems);
  }

  function addItem() { setItems([...items, { ...emptyItem(), vatType: defaultVatType }]); }
  function duplicateItem(idx: number) {
    const copy = { ...items[idx] };
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
    const vatItemsTotal = items.filter(it => it.vatType === "vat7").reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const nonDeductibleItemsTotal = items.filter(it => it.vatType === "vat_non_deductible").reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const nonVatItemsTotal = items.filter(it => it.vatType !== "vat7" && it.vatType !== "vat_non_deductible").reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const rawTotal = vatItemsTotal + nonDeductibleItemsTotal + nonVatItemsTotal;
    const discPercVal = discIsPercent ? Math.min(parseFloat(discRaw) || 0, 100) : 0;
    const discAmount = discIsPercent ? rawTotal * discPercVal / 100 : (parseFloat(discRaw) || 0);
    const afterDiscount = Math.max(rawTotal - discAmount, 0);
    const vatBase = Math.max(vatItemsTotal - discAmount, 0);
    const deductibleVat = vatBase * 0.07;
    const nonDeductibleVat = nonDeductibleItemsTotal * 0.07;
    const vatAmount = deductibleVat + nonDeductibleVat;
    const wht = whtIsPercent ? afterDiscount * (parseFloat(whtRaw) || 0) / 100 : (parseFloat(whtRaw) || 0);
    return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, deductibleVat, nonDeductibleVat, withholdingTax: wht, totalAmount: afterDiscount + vatAmount - wht };
  }

  async function fetchJournalPreview() {
    if (!companyId) return;
    const t = calcTotals();
    if (t.afterDiscount <= 0 && t.vatAmount <= 0) { setJournalPreview(null); return; }
    setJournalLoading(true);
    const rate = parseFloat(form.exchangeRate) || 1;
    const toThb = (v: number) => Number((v * rate).toFixed(2));
    try {
      const res = await fetch("/api/expense-journal-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyId,
          items: items.map(it => ({ accountCode: it.accountCode, accountName: it.accountName, amount: String(toThb(parseFloat(it.amount || "0"))), vatType: it.vatType })),
          subtotal: String(toThb(t.afterDiscount)),
          vatAmount: String(toThb(t.deductibleVat)),
          nonDeductibleVat: String(toThb(t.nonDeductibleVat)),
          withholdingTax: String(toThb(t.withholdingTax)),
          paymentMethod: form.paymentMethod || "",
        }),
      });
      const data = await res.json();
      setJournalPreview(data);
      if (data.lines) {
        setEditableLines(data.lines.map((l: any) => ({ ...l })));
      }
    } catch { setJournalPreview(null); }
    setJournalLoading(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => fetchJournalPreview(), 600);
    return () => clearTimeout(timer);
  }, [companyId, items, form.discountBeforeVat, form.withholdingTax, form.paymentMethod, form.exchangeRate, form.currencyCode]);

  function handleReset() {
    setForm(prev => ({
      ...prev,
      expDate: toLocalDateStr(new Date()),
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
      taxInvoiceRef: "",
      notes: "",
      salesperson: "",
      department: "",
      project: "",
      refDoc: "",
      paymentMethod: "",
      saveToContacts: false,
      showInTaxReport: true,
      currencyCode: "THB",
      exchangeRate: "1",
      withholdingTax: "0",
      discountBeforeVat: "0",
      attachedUrl: "",
    }));
    setItems([{ ...emptyItem(), vatType: defaultVatType }]);
  }

  function buildPayload() {
    const totals = calcTotals();
    const rate = parseFloat(form.exchangeRate) || 1;
    const toThb = (v: number) => Number((v * rate).toFixed(2));
    return {
      companyId,
      expNo: form.expNo,
      expDate: form.expDate,
      dueDate: form.dueDate || null,
      vendorId: form.vendorId ? Number(form.vendorId) : null,
      vendorCode: form.vendorCode,
      vendorName: form.vendorName,
      vendorAddress: form.vendorAddress,
      vendorTaxId: form.vendorTaxId,
      branch: form.branch,
      sellerBranchId: form.sellerBranchId,
      contactPerson: form.contactPerson,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone,
      creditDays: form.creditDays ? Number(form.creditDays) : null,
      taxInvoiceRef: form.taxInvoiceRef || null,
      docPrefix: form.docPrefix,
      notes: form.notes,
      status: form.status,
      salesperson: form.salesperson,
      department: form.department,
      project: form.project,
      refDoc: form.refDoc,
      paymentMethod: form.paymentMethod || null,
      attachedUrl: form.attachedUrl || null,
      showInTaxReport: form.showInTaxReport,
      saveToContacts: form.saveToContacts,
      paymentStatus: form.paymentMethod ? "paid" : "unpaid",
      currencyCode: form.currencyCode,
      exchangeRate: form.exchangeRate,
      subtotal: toThb(totals.afterDiscount).toFixed(2),
      discountAmount: toThb(discountMode === "percent" ? parseFloat(form.discountBeforeVat) || 0 : totals.discountAmount).toFixed(2),
      discountType: discountMode,
      vatAmount: toThb(totals.vatAmount).toFixed(2),
      deductibleVat: toThb(totals.deductibleVat).toFixed(2),
      nonDeductibleVat: toThb(totals.nonDeductibleVat).toFixed(2),
      withholdingTax: toThb(totals.withholdingTax).toFixed(2),
      totalAmount: toThb(totals.totalAmount).toFixed(2),
      items: items.filter(it => it.accountName).map(it => ({
        accountCode: it.accountCode,
        accountName: it.accountName,
        description: it.description,
        expenseType: it.expenseType,
        amount: String(toThb(parseFloat(it.amount || "0"))),
        vatType: it.vatType,
      })),
      linkJournal: true,
      ...(journalEditing && editableLines.length > 0 ? { customJournalLines: editableLines } : {}),
    };
  }

  function validateItems(): boolean {
    const validItems = items.filter(it => it.accountName || it.description || parseFloat(it.amount) > 0);
    if (validItems.length === 0) {
      toast({ title: "กรุณาเพิ่มรายการอย่างน้อย 1 รายการ", variant: "destructive" });
      return false;
    }
    const missingAccount = validItems.some(it => !it.accountCode);
    if (missingAccount) {
      toast({ title: "กรุณาเลือกรหัสบัญชีให้ครบทุกรายการ", variant: "destructive" });
      return false;
    }
    if (!form.paymentMethod) {
      toast({ title: "กรุณาเลือกวิธีชำระเงิน", variant: "destructive" });
      return false;
    }
    return true;
  }

  function checkAssetThreshold(action: "save" | "saveWht"): boolean {
    if (assetMinThreshold <= 0) return true;
    const assetItems = items.filter(it => it.expenseType === "asset" && it.accountCode);
    for (let i = 0; i < assetItems.length; i++) {
      const item = assetItems[i];
      const amount = parseFloat(item.amount) || 0;
      const idx = items.indexOf(item);
      if (amount > 0 && amount < assetMinThreshold) {
        setAssetAlertItem({ idx, accountName: item.accountName || item.accountCode, amount, threshold: assetMinThreshold });
        setShowAssetBelowAlert(true);
        setPendingSaveAction(action);
        setPendingAlertPhase("asset");
        return false;
      }
      if (amount >= assetMinThreshold) {
        setAssetAlertItem({ idx, accountName: item.accountName || item.accountCode, amount, threshold: assetMinThreshold });
        setShowAssetAboveAlert(true);
        setPendingSaveAction(action);
        setPendingAlertPhase("asset");
        return false;
      }
    }
    return true;
  }

  function doSave() {
    const payload = buildPayload();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  async function runVatClosingCheck(action: "save" | "saveWht"): Promise<boolean> {
    if (!companyId || !form.expDate) return true;
    const result = await checkVatClosed(companyId, form.expDate);
    if (result && result.closed) {
      const msg = buildWarningMessage(result, form.expDate);
      setVatClosedInfo(msg);
      setPendingSaveAction(action);
      setPendingAlertPhase("vat");
      setShowVatClosedAlert(true);
      return false;
    }
    return true;
  }

  async function handleSubmit() {
    if (!validateItems()) return;
    if (!checkAssetThreshold("save")) return;
    if (!(await runVatClosingCheck("save"))) return;
    doSave();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        const saving = createMutation.isPending || updateMutation.isPending;
        const locked = !isNew && ["pending_approval", "paid", "cancelled"].includes(form.status);
        if (saving || locked) return;
        handleSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createMutation.isPending, updateMutation.isPending, form, items, isNew]);

  async function handleSaveAndWht() {
    if (!validateItems()) return;
    if (!checkAssetThreshold("saveWht")) return;
    if (!(await runVatClosingCheck("saveWht"))) return;
    const payload = buildPayload();
    const totals = calcTotals();
    try {
      let savedDoc: any;
      if (editingId) {
        const res = await apiRequest("PATCH", `/api/expenses/${editingId}`, payload);
        savedDoc = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/expenses", payload);
        savedDoc = await res.json();
      }
      invalidateDocCaches(queryClient, [["/api/expenses"], ["/api/contacts"]]);
      toast({ title: "บันทึกรายจ่ายสำเร็จ", variant: "success" as any });
      const descList = items
        .map(it => it.description || it.accountName)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ");
      const params = new URLSearchParams({
        vendorId: String(savedDoc.vendorId || ""),
        vendorName: savedDoc.vendorName || "",
        vendorAddress: savedDoc.vendorAddress || "",
        vendorTaxId: savedDoc.vendorTaxId || "",
        vendorBranch: savedDoc.branch || "",
        whtAmount: String(totals.withholdingTax.toFixed(2)),
        totalAmount: String(totals.afterDiscount.toFixed(2)),
        sourceDocType: "expense",
        sourceDocId: String(savedDoc.id),
        sourceDocNo: savedDoc.expNo || "",
        incomeDescription: descList,
        certDate: savedDoc.expDate || form.expDate || "",
        paidDate: savedDoc.paymentDate || form.paymentDate || savedDoc.expDate || form.expDate || "",
      });
      navigate(`/purchases/wht/new?${params.toString()}`);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
  }

  async function doSaveAndCreateAsset() {
    const payload = buildPayload();
    try {
      let savedDoc: any;
      if (editingId) {
        const res = await apiRequest("PATCH", `/api/expenses/${editingId}`, payload);
        savedDoc = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/expenses", payload);
        savedDoc = await res.json();
      }
      invalidateDocCaches(queryClient, [["/api/expenses"], ["/api/contacts"]]);
      toast({ title: "บันทึกรายจ่ายสำเร็จ พร้อมบันทึกเข้าทะเบียนทรัพย์สิน", variant: "success" as any });
      if (assetAlertItem) {
        const item = items[assetAlertItem.idx];
        const params = new URLSearchParams({
          name: item.description || item.accountName,
          cost: item.amount,
          invoiceRef: form.taxInvoiceRef || savedDoc.expNo || "",
          supplier: form.vendorName || "",
          purchaseDate: form.expDate || "",
          accountCode: item.accountCode || "",
        });
        navigate(`/assets/form?${params.toString()}`);
      }
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
  }

  async function doSaveWht() {
    const payload = buildPayload();
    const t = calcTotals();
    try {
      let savedDoc: any;
      if (editingId) {
        const res = await apiRequest("PATCH", `/api/expenses/${editingId}`, payload);
        savedDoc = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/expenses", payload);
        savedDoc = await res.json();
      }
      invalidateDocCaches(queryClient, [["/api/expenses"], ["/api/contacts"]]);
      toast({ title: "บันทึกรายจ่ายสำเร็จ", variant: "success" as any });
      const descList2 = items
        .map(it => it.description || it.accountName)
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ");
      const p = new URLSearchParams({
        vendorId: String(savedDoc.vendorId || ""),
        vendorName: savedDoc.vendorName || "",
        vendorAddress: savedDoc.vendorAddress || "",
        vendorTaxId: savedDoc.vendorTaxId || "",
        vendorBranch: savedDoc.branch || "",
        whtAmount: String(t.withholdingTax.toFixed(2)),
        totalAmount: String(t.afterDiscount.toFixed(2)),
        sourceDocType: "expense",
        sourceDocId: String(savedDoc.id),
        sourceDocNo: savedDoc.expNo || "",
        incomeDescription: descList2,
        certDate: savedDoc.expDate || form.expDate || "",
        paidDate: savedDoc.paymentDate || form.paymentDate || savedDoc.expDate || form.expDate || "",
      });
      navigate(`/purchases/wht/new?${p.toString()}`);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
  }

  function executePendingSave() {
    const action = pendingSaveAction;
    if (!action) return;
    if (action === "saveWht") {
      doSaveWht();
    } else {
      doSave();
    }
    setPendingSaveAction(null);
    setPendingAlertPhase(null);
  }

  const [pendingAssetCreate, setPendingAssetCreate] = useState(false);

  async function resumeAfterAssetAlert(createAsset = false) {
    const action = pendingSaveAction;
    if (!action) return;
    setPendingAlertPhase(null);
    setPendingAssetCreate(createAsset);
    if (!(await runVatClosingCheck(action))) return;
    if (createAsset) {
      doSaveAndCreateAsset();
      setAssetAlertItem(null);
      setPendingSaveAction(null);
      setPendingAssetCreate(false);
    } else {
      executePendingSave();
    }
  }

  function resumeAfterVatWarning() {
    setShowVatClosedAlert(false);
    setVatClosedInfo(null);
    if (pendingAssetCreate) {
      doSaveAndCreateAsset();
      setAssetAlertItem(null);
    }  else {
      const action = pendingSaveAction;
      if (action === "saveWht") {
        doSaveWht();
      } else {
        doSave();
      }
    }
    setPendingSaveAction(null);
    setPendingAlertPhase(null);
    setPendingAssetCreate(false);
  }

  function handleBelowThresholdSwitch() {
    if (assetAlertItem) {
      updateItem(assetAlertItem.idx, "expenseType", "expense");
      toast({ title: "เปลี่ยนเป็นค่าใช้จ่ายแล้ว กรุณากดบันทึกอีกครั้ง", variant: "success" as any });
    }
    setShowAssetBelowAlert(false);
    setAssetAlertItem(null);
    setPendingSaveAction(null);
    setPendingAlertPhase(null);
  }

  const totals = calcTotals();
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLocked = !isNew && ["pending_approval", "paid", "cancelled"].includes(form.status);

  return (
    <Layout>
      <div className="space-y-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/purchases/expense")}>รายจ่ายอื่น (EXP)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? (isLocked ? "ดูรายจ่าย" : "แก้ไขรายจ่าย") : "สร้างรายจ่าย"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/purchases/expense")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? (isLocked ? "ดูรายจ่าย" : "แก้ไขรายจ่าย") : "สร้างรายจ่าย"}
          </h1>
        </div>

        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center justify-between text-sm text-amber-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>เอกสารนี้มีสถานะ <strong>{form.status === "approved" ? "อนุมัติแล้ว" : "ยกเลิก"}</strong> ไม่สามารถแก้ไขได้</span>
            </div>
            {form.status === "approved" && editingId && (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-700 hover:bg-amber-100"
                data-testid="button-revert-draft"
                onClick={() => {
                  statusMutation.mutate({ id: editingId, status: "draft" }, {
                    onSuccess: () => setForm(p => ({ ...p, status: "draft" })),
                  });
                }}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> ย้อนเป็นแบบร่าง
              </Button>
            )}
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
                                <button key={c.id} className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b last:border-b-0"
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
                      <Input data-testid="input-ref-doc" value={form.refDoc || ""} onChange={e => setForm(p => ({ ...p, refDoc: e.target.value }))} className="h-7 text-xs border-dashed" />
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
                                <button key={c.id} className="w-full text-left px-3 py-2 text-xs hover:bg-sky-50 border-b last:border-b-0"
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
                      <DatePicker data-testid="input-exp-date" value={form.expDate} onChange={v => setForm(p => ({ ...p, expDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
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
                        <SelectTrigger data-testid="select-payment-method" className="h-7 text-xs border-dashed border-emerald-300 bg-white focus:border-emerald-500 focus:ring-emerald-200">
                          <SelectValue placeholder="เลือกวิธีชำระเงิน" />
                        </SelectTrigger>
                        <SelectContent>
                          {activePaymentMethods.map((m: any) => {
                              const linkedAcc = m.accountCode ? accounts.find((a: any) => a.code === m.accountCode) : null;
                              const linkedName = linkedAcc ? (linkedAcc.nameTh || linkedAcc.name) : "";
                              return (
                                <SelectItem key={m.id} value={`pm_${m.id}`}>
                                  {acctName(m)}{m.bankName ? ` · ${m.bankName}` : ""}{m.bankAccountNo ? ` ${m.bankAccountNo}` : ""}{linkedName ? ` — ${linkedName}` : ""}
                                </SelectItem>
                              );
                            })}
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
                        <Input data-testid="input-exp-no" value={form.expNo} onChange={e => setForm(p => ({ ...p, expNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
                      </div>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">พนักงาน</div>
                      <Input data-testid="input-salesperson" list="emp-list-exp" value={form.salesperson} onChange={e => setForm(p => ({ ...p, salesperson: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="เลือกหรือพิมพ์ชื่อ" />
                      <datalist id="emp-list-exp">
                        {employeeNames.map(e => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">แผนก / โครงการ</div>
                      <div className="flex items-center gap-1">
                        <Input data-testid="input-department" list="dept-list-exp" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="เลือกหรือพิมพ์แผนก" />
                        <datalist id="dept-list-exp">
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
                            <FetchRateButton
                              currency={form.currencyCode}
                              date={form.expDate}
                              onRate={rate => setForm(p => ({ ...p, exchangeRate: String(rate) }))}
                            />
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
                          <Checkbox data-testid="checkbox-show-in-tax-report" checked={form.showInTaxReport} onCheckedChange={(v) => setForm(p => ({ ...p, showInTaxReport: !!v }))} />
                          <span className="text-xs text-amber-600 font-medium">แสดงในรายงานภาษีซื้อ</span>
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

            <div className="border rounded overflow-visible doc-items-table">
              <table className="w-full text-sm" style={{tableLayout:"fixed"}}>
                <colgroup>
                  <col style={{width:"3%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"18%"}} />
                  <col style={{width:"auto"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"12%"}} />
                  <col style={{width:"5%"}} />
                  <col style={{width:"6%"}} />
                </colgroup>
                <thead>
                  <tr className="bg-[var(--theme-primary)]">
                    <th className="text-center font-medium text-white text-xs py-2 px-1">#</th>
                    <th className="font-medium text-white text-xs py-2 px-1">รหัสบัญชี</th>
                    <th className="font-medium text-white text-xs py-2 px-1">ชื่อบัญชี</th>
                    <th className="font-medium text-white text-xs py-2 px-1">รายละเอียด</th>
                    <th className="text-center font-medium text-white text-xs py-2 px-1">ประเภท</th>
                    <th className="text-right font-medium text-white text-xs py-2 px-1">จำนวนเงิน</th>
                    <th className="text-center font-medium text-white text-xs py-2 px-1">VAT</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-300 group" data-testid={`row-item-${idx}`}>
                      <td className="text-center text-xs py-1 px-1 text-slate-400">{idx + 1}</td>
                      <td className="py-1 px-1">
                        <Popover open={openAccountPopover === `${idx}-code`} onOpenChange={(o) => setOpenAccountPopover(o ? `${idx}-code` : null)}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn("h-7 w-full justify-between text-xs border-dashed font-normal", !item.accountCode && "text-muted-foreground")}
                              data-testid={`input-account-code-${idx}`}
                            >
                              <span className="truncate">{item.accountCode || "เลือกบัญชี"}</span>
                              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="พิมพ์ค้นหารหัส/ชื่อบัญชี..." className="h-8 text-xs" />
                              <CommandList>
                                <CommandEmpty>ไม่พบบัญชี</CommandEmpty>
                                <CommandGroup>
                                  {accountsForSelect.map((acc: any) => (
                                    <CommandItem
                                      key={acc.id}
                                      value={`${acc.code} ${acctName(acc)}`}
                                      onSelect={() => {
                                        updateItem(idx, "accountCode", acc.code);
                                        updateItem(idx, "accountName", acctName(acc) || acc.code);
                                        const prefix = String(acc.code).charAt(0);
                                        if (prefix === "1") {
                                          updateItem(idx, "expenseType", "asset");
                                        } else if (prefix === "5") {
                                          updateItem(idx, "expenseType", "expense");
                                        } else {
                                          updateItem(idx, "expenseType", "other");
                                        }
                                        setOpenAccountPopover(null);
                                      }}
                                      className="text-xs"
                                    >
                                      <Check className={cn("mr-1 h-3 w-3", item.accountCode === acc.code ? "opacity-100" : "opacity-0")} />
                                      {acc.code} - {acctName(acc)}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </td>
                      <td className="py-1 px-1">
                        <Popover open={openAccountPopover === `${idx}-name`} onOpenChange={(o) => setOpenAccountPopover(o ? `${idx}-name` : null)}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn("h-7 w-full justify-between text-xs border-dashed font-normal", !item.accountName && "text-muted-foreground")}
                              data-testid={`input-account-name-${idx}`}
                            >
                              <span className="truncate">{item.accountName || "ค้นหาชื่อบัญชี"}</span>
                              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="พิมพ์ค้นหารหัส/ชื่อบัญชี..." className="h-8 text-xs" />
                              <CommandList>
                                <CommandEmpty>ไม่พบบัญชี</CommandEmpty>
                                <CommandGroup>
                                  {accountsForSelect.map((acc: any) => (
                                    <CommandItem
                                      key={acc.id}
                                      value={`${acc.code} ${acctName(acc)}`}
                                      onSelect={() => {
                                        updateItem(idx, "accountCode", acc.code);
                                        updateItem(idx, "accountName", acctName(acc) || acc.code);
                                        const prefix = String(acc.code).charAt(0);
                                        if (prefix === "1") {
                                          updateItem(idx, "expenseType", "asset");
                                        } else if (prefix === "5") {
                                          updateItem(idx, "expenseType", "expense");
                                        } else {
                                          updateItem(idx, "expenseType", "other");
                                        }
                                        setOpenAccountPopover(null);
                                      }}
                                      className="text-xs"
                                    >
                                      <Check className={cn("mr-1 h-3 w-3", item.accountCode === acc.code ? "opacity-100" : "opacity-0")} />
                                      {acc.code} - {acctName(acc)}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </td>
                      <td className="py-1 px-1">
                        <textarea
                          data-testid={`input-description-${idx}`}
                          value={item.description}
                          onChange={e => updateItem(idx, "description", e.target.value)}
                          className="w-full text-xs border border-dashed rounded px-2 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-sky-300 min-h-[28px]"
                          rows={1}
                          placeholder="รายละเอียด"
                        />
                      </td>
                      <td className="py-1 px-1">
                        <div className={cn(
                          "h-7 flex items-center text-xs px-2 rounded border border-dashed",
                          item.expenseType === "asset" ? "bg-amber-50 text-amber-700 border-amber-300" :
                          item.expenseType === "other" ? "bg-slate-50 text-slate-500 border-slate-300" :
                          "bg-sky-50 text-sky-700 border-sky-300"
                        )}>
                          {item.expenseType === "asset" ? "สินทรัพย์" : item.expenseType === "other" ? "อื่นๆ" : "ค่าใช้จ่าย"}
                        </div>
                      </td>
                      <td className="py-1 px-1">
                        <Input
                          data-testid={`input-amount-${idx}`}
                          value={(() => {
                            const isEditing = editingAmountIdx === idx;
                            const raw = item.amount;
                            const isZero = !raw || raw === "0" || parseFloat(raw) === 0;
                            if (isZero) return "";
                            return isEditing ? raw : fmt(raw);
                          })()}
                          onFocus={(e) => { setEditingAmountIdx(idx); e.target.select(); }}
                          onBlur={() => setEditingAmountIdx(null)}
                          onChange={e => updateItem(idx, "amount", e.target.value)}
                          className="h-7 text-xs border-dashed text-right"
                          placeholder=""
                        />
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
                <MultiFileAttachment
                  value={form.attachedUrl}
                  onChange={v => setForm(p => ({ ...p, attachedUrl: v }))}
                  testIdPrefix="expense-attachment"
                />
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
                          (ภาษีซื้อต้องห้าม {fmt(totals.nonDeductibleVat)} รวมในค่าใช้จ่าย)
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
                    <td className="text-right py-2.5 font-bold text-[var(--theme-primary)] pr-2" style={{ fontSize: 15 }}>
                      {form.currencyCode !== "THB" && <span className="text-xs font-normal text-slate-500 mr-1">{form.currencyCode}</span>}
                      {fmt(totals.totalAmount)}
                    </td>
                  </tr>
                  {form.currencyCode !== "THB" && (parseFloat(form.exchangeRate) || 0) > 0 && (
                    <tr>
                      <td className="text-right pr-4 py-1.5 text-xs text-slate-400 whitespace-nowrap">≈ บันทึกในสมุดบัญชี (THB):</td>
                      <td className="text-right py-1.5 text-xs font-semibold text-emerald-700 pr-2">
                        {fmt(totals.totalAmount * (parseFloat(form.exchangeRate) || 1))} THB
                        <div className="text-[10px] font-normal text-slate-400">@ {parseFloat(form.exchangeRate).toFixed(4)}</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </fieldset>
        </div>

        {journalPreview?.available && journalPreview.lines?.length > 0 && (
          <div className="border rounded-lg overflow-hidden bg-white mt-4" style={{ borderColor: "color-mix(in srgb, var(--theme-primary) 30%, transparent)" }} data-testid="journal-preview-panel">
            <button
              type="button"
              className="w-full flex items-center justify-between px-4 py-2.5 transition-colors"
              style={{ background: "color-mix(in srgb, var(--theme-primary) 10%, transparent)" }}
              onClick={() => setJournalExpanded(!journalExpanded)}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" style={{ color: "var(--theme-primary)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--theme-primary)" }}>พรีวิวบัญชี — {journalPreview.formulaName || "ค่าใช้จ่าย"}</span>
                {journalLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: "var(--theme-primary)" }} />}
              </div>
              {journalExpanded ? <ChevronUp className="h-4 w-4" style={{ color: "var(--theme-primary)" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "var(--theme-primary)" }} />}
            </button>
            {journalExpanded && (
              <div className="p-3">
                <div className="flex items-center justify-end mb-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={journalEditing ? "border-green-400 text-green-700" : ""}
                    style={journalEditing ? undefined : { borderColor: "color-mix(in srgb, var(--theme-primary) 40%, transparent)", color: "var(--theme-primary)" }}
                    onClick={() => {
                      if (journalEditing) {
                        setJournalEditing(false);
                      } else {
                        setEditableLines(journalPreview.lines.map((l: any) => ({ ...l })));
                        setJournalEditing(true);
                      }
                    }}
                    data-testid="button-toggle-journal-edit"
                  >
                    {journalEditing ? <><Check className="h-3.5 w-3.5 mr-1" /> เสร็จสิ้น</> : <><Pencil className="h-3.5 w-3.5 mr-1" /> แก้ไข</>}
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[var(--theme-primary-light)] border-b border-slate-300">
                      <th className="text-left px-3 py-2 font-medium text-slate-600 w-24">รหัสบัญชี</th>
                      <th className="text-left px-3 py-2 font-medium text-slate-600">ชื่อบัญชี</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-32">เดบิต</th>
                      <th className="text-right px-3 py-2 font-medium text-slate-600 w-32">เครดิต</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(journalEditing ? editableLines : journalPreview.lines).map((line: any, idx: number) => {
                      const dr = parseFloat(line.debit || "0");
                      const cr = parseFloat(line.credit || "0");
                      const detailAccounts = accounts.filter((a: any) => !a.isHeader && a.code?.length >= 7);
                      return (
                        <tr key={idx} className="border-b hover:bg-slate-50/50">
                          <td className="px-3 py-1.5 font-mono text-xs">
                            {journalEditing ? (
                              <AccountPickerDropdown
                                value={line.accountCode}
                                accounts={detailAccounts}
                                mode="code"
                                onChange={(code, name) => {
                                  const newLines = [...editableLines];
                                  newLines[idx] = { ...newLines[idx], accountCode: code, accountName: name };
                                  setEditableLines(newLines);
                                }}
                              />
                            ) : line.accountCode}
                          </td>
                          <td className="px-3 py-1.5">
                            {journalEditing ? (
                              <AccountPickerDropdown
                                value={line.accountCode}
                                displayValue={line.accountName}
                                accounts={detailAccounts}
                                mode="name"
                                onChange={(code, name) => {
                                  const newLines = [...editableLines];
                                  newLines[idx] = { ...newLines[idx], accountCode: code, accountName: name };
                                  setEditableLines(newLines);
                                }}
                              />
                            ) : line.accountName}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {journalEditing ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={line.debit}
                                onChange={(e) => {
                                  const newLines = [...editableLines];
                                  newLines[idx] = { ...newLines[idx], debit: e.target.value };
                                  setEditableLines(newLines);
                                }}
                                className="h-7 text-xs text-right w-28 ml-auto"
                                data-testid={`input-journal-debit-${idx}`}
                              />
                            ) : (
                              dr > 0 ? <span className="text-emerald-700 font-medium">{fmt(dr)}</span> : <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {journalEditing ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={line.credit}
                                onChange={(e) => {
                                  const newLines = [...editableLines];
                                  newLines[idx] = { ...newLines[idx], credit: e.target.value };
                                  setEditableLines(newLines);
                                }}
                                className="h-7 text-xs text-right w-28 ml-auto"
                                data-testid={`input-journal-credit-${idx}`}
                              />
                            ) : (
                              cr > 0 ? <span className="text-[var(--theme-primary)] font-medium">{fmt(cr)}</span> : <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 font-medium">
                      <td colSpan={2} className="px-3 py-2 text-right">รวม</td>
                      <td className="px-3 py-2 text-right text-emerald-700">
                        {fmt((journalEditing ? editableLines : journalPreview.lines).reduce((s: number, l: any) => s + parseFloat(l.debit || "0"), 0))}
                      </td>
                      <td className="px-3 py-2 text-right text-[var(--theme-primary)]">
                        {fmt((journalEditing ? editableLines : journalPreview.lines).reduce((s: number, l: any) => s + parseFloat(l.credit || "0"), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                {(() => {
                  const lines = journalEditing ? editableLines : journalPreview.lines;
                  const td = lines.reduce((s: number, l: any) => s + parseFloat(l.debit || "0"), 0);
                  const tc = lines.reduce((s: number, l: any) => s + parseFloat(l.credit || "0"), 0);
                  const balanced = Math.abs(td - tc) < 0.01;
                  return !balanced ? (
                    <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" /> เดบิตและเครดิตไม่เท่ากัน (ผลต่าง {fmt(Math.abs(td - tc))})
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        )}

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
              className="text-white hover:opacity-90"
              style={{ backgroundColor: whtBtnColor }}
              data-testid="button-save-wht"
            >
              <FileText className="h-4 w-4 mr-2" /> บันทึกพร้อมออก 50 ทวิ
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={showAssetBelowAlert} onOpenChange={setShowAssetBelowAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
              ราคาทรัพย์สินไม่ถึงขั้นต่ำ
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                รายการ "<strong>{assetAlertItem?.accountName}</strong>" มีราคา <strong>{assetAlertItem?.amount?.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</strong> ซึ่งไม่ถึงราคาขั้นต่ำที่กำหนดไว้ <strong>{assetAlertItem?.threshold?.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</strong>
              </p>
              <p>ทรัพย์สินชิ้นนี้ราคาไม่ถึงขั้นต่ำที่จะคิดค่าเสื่อมราคา แนะนำให้ย้ายไปบันทึกเป็นค่าใช้จ่ายแทน</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowAssetBelowAlert(false); setAssetAlertItem(null); setPendingSaveAction(null); }}>
              ปิด
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-500 hover:bg-amber-600"
              onClick={handleBelowThresholdSwitch}
              data-testid="button-switch-to-expense"
            >
              เปลี่ยนเป็นค่าใช้จ่าย
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showAssetAboveAlert} onOpenChange={setShowAssetAboveAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-green-600">
              <Warehouse className="h-5 w-5" />
              บันทึกพร้อมเพิ่มทะเบียนทรัพย์สิน
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                รายการ "<strong>{assetAlertItem?.accountName}</strong>" มีราคา <strong>{assetAlertItem?.amount?.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</strong> ซึ่งเกินราคาขั้นต่ำ <strong>{assetAlertItem?.threshold?.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</strong>
              </p>
              <p>ต้องการบันทึกรายจ่ายนี้พร้อมบันทึกเข้าทะเบียนทรัพย์สินและไปยังหน้าเพิ่มทรัพย์สินใหม่หรือไม่?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowAssetAboveAlert(false); setAssetAlertItem(null); setPendingSaveAction(null); }}>
              ยกเลิก
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-slate-600 hover:bg-slate-700"
              onClick={() => { setShowAssetAboveAlert(false); setAssetAlertItem(null); resumeAfterAssetAlert(false); }}
              data-testid="button-save-only"
            >
              บันทึกอย่างเดียว
            </AlertDialogAction>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => { setShowAssetAboveAlert(false); resumeAfterAssetAlert(true); }}
              data-testid="button-save-and-create-asset"
            >
              <Warehouse className="h-4 w-4 mr-1" /> บันทึกพร้อมเพิ่มทรัพย์สิน
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogCancel onClick={() => { setShowVatClosedAlert(false); setVatClosedInfo(null); setPendingSaveAction(null); setPendingAlertPhase(null); setPendingAssetCreate(false); setAssetAlertItem(null); }}>
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
