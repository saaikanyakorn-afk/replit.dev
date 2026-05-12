import { useState, useEffect } from "react";
import { FetchRateButton } from "@/components/fetch-rate-button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useDocDropdowns } from "@/hooks/use-doc-dropdowns";
import {
  ArrowLeft, Plus, FileText, Save, Home, RotateCcw, AlertCircle, Search, Loader2, CheckCircle2,
  ChevronsUpDown, Check, Copy, Trash2
} from "lucide-react";
import { cn, toLocalDateStr } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker } from "@/components/ui/date-picker";
import type { DateFormat } from "@/components/ui/date-picker";
import type { Contact } from "@shared/schema";
import AutoJournalButton from "@/components/auto-journal-button";
import JournalPreviewPanel, { type JournalLine } from "@/components/journal-preview-panel";
import { useDbdLookup } from "@/hooks/use-dbd-lookup";
import MultiFileAttachment from "@/components/multi-file-attachment";

import { useDateSettings } from "@/hooks/use-date-settings";
interface DepositItemForm {
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

const emptyItem = (): DepositItemForm => ({
  accountCode: "",
  accountName: "",
  description: "",
  expenseType: "expense",
  amount: "0",
  vatType: "vat7",
});

export default function PurchaseDepositForm() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/purchases/purchase-deposit/new");
  const [matchEdit, paramsEdit] = useRoute("/purchases/purchase-deposit/edit/:id");
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
  const [items, setItems] = useState<DepositItemForm[]>([emptyItem()]);
  const [editingAmountIdx, setEditingAmountIdx] = useState<number | null>(null);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [deductions, setDeductions] = useState<any[]>([]);
  const [journalOverrideLines, setJournalOverrideLines] = useState<JournalLine[] | null>(null);
  const [form, setForm] = useState({
    depositNo: "",
    depositDate: toLocalDateStr(new Date()),
    dueDate: "",
    vendorId: undefined as number | undefined,
    vendorCode: "",
    vendorName: "",
    vendorAddress: "",
    vendorTaxId: "",
    branch: "",
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
    docPrefix: "PDP",
    saveToContacts: false,
    currencyCode: "THB",
    exchangeRate: "1",
    withholdingTax: "0",
    discountBeforeVat: "0",
    paymentMethod: "" as string,
    attachedUrl: "",
    showInTaxReport: true,
  });
  const [vendorSearch, setVendorSearch] = useState<string | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [vendorCodeSearch, setVendorCodeSearch] = useState<string | null>(null);
  const [showVendorCodeDropdown, setShowVendorCodeDropdown] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [manualDueDate, setManualDueDate] = useState(false);

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", companyId, "vendor"],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/contacts?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      const all: Contact[] = await res.json();
      return all.filter(c => c.type === "vendor" || c.type === "both");
    },
    enabled: !!companyId,
  });

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
  useEffect(() => {
    if (isNew && !loaded && activePaymentMethods.length > 0 && (form.paymentMethod === "" || form.paymentMethod === "transfer")) {
      const defaultMethod = activePaymentMethods.find((m: any) => m.isDefault) || activePaymentMethods[0];
      if (defaultMethod) {
        setForm(p => ({ ...p, paymentMethod: defaultMethod.name || defaultMethod.nameTh || defaultMethod.accountCode }));
      }
    }
  }, [activePaymentMethods, isNew, loaded]);

  useEffect(() => {
    if (isNew && selectedCompany && items.length === 1 && !items[0].accountCode) {
      setItems([{ ...items[0], vatType: defaultVatType }]);
    }
  }, [selectedCompany]);

  useEffect(() => {
    if (!loaded || manualDueDate) return;
    const days = form.creditDays ? parseInt(form.creditDays) : NaN;
    if (!isNaN(days) && days >= 0 && form.depositDate) {
      const base = new Date(form.depositDate + "T00:00:00");
      base.setDate(base.getDate() + days);
      const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
      setForm(p => ({ ...p, dueDate: iso }));
    } else if (!form.creditDays && form.depositDate) {
      setForm(p => ({ ...p, dueDate: p.depositDate }));
    }
  }, [form.creditDays, form.depositDate, loaded]);

  useEffect(() => {
    if (loaded) return;
    if (isNew) {
      setLoaded(true);
    } else if (editingId) {
      (async () => {
        try {
          const res = await fetch(`/api/purchase-deposits/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setForm({
              depositNo: data.depositNo || "",
              depositDate: data.depositDate || "",
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
              creditDays: data.creditDays || "",
              taxInvoiceRef: data.taxInvoiceRef || "",
              notes: data.notes || "",
              status: data.status || "draft",
              salesperson: data.salesperson || "",
              department: data.department || "",
              project: data.project || "",
              refDoc: data.refDoc || "",
              docPrefix: data.docPrefix || "PDP",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: data.exchangeRate || "1",
              withholdingTax: data.withholdingTax || "0",
              discountBeforeVat: data.discountBeforeVat || "0",
              paymentMethod: data.paymentMethod || "",
              attachedUrl: data.attachedUrl || "",
              showInTaxReport: data.showInTaxReport !== false,
            });
            if (data.items && data.items.length > 0) {
              setItems(data.items.map((it: any) => ({
                accountCode: it.accountCode || "",
                accountName: it.accountName || "",
                description: it.description || "",
                expenseType: it.expenseType || "expense",
                amount: String(it.amount || "0"),
                vatType: it.vatType || defaultVatType,
              })));
            }
            if (data.discountBeforeVat && String(data.discountBeforeVat).includes("%")) {
              setDiscountMode("percent");
            }
            setSavedId(editingId);
            if (data.deductions && Array.isArray(data.deductions)) {
              setDeductions(data.deductions);
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
      const res = await apiRequest("POST", "/api/purchase-deposits", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-deposits"] });
      toast({ title: "สร้างใบจ่ายเงินมัดจำสำเร็จ", variant: "success" as any });
      navigate("/purchases/purchase-deposit");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/purchase-deposits/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-deposits"] });
      toast({ title: "อัพเดทใบจ่ายเงินมัดจำสำเร็จ", variant: "success" as any });
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
        contactPerson: (c as any).contactPerson || "",
        contactPhone: (c as any).phone || "",
        contactEmail: (c as any).email || "",
        creditDays: String((c as any).creditDays || ""),
      }));
    }
  }

  function updateItem(idx: number, field: keyof DepositItemForm, value: string) {
    const newItems = [...items];
    newItems[idx] = { ...newItems[idx], [field]: value };
    setItems(newItems);
  }

  function addItem() { setItems([...items, { ...emptyItem(), vatType: defaultVatType }]); }

  function duplicateItem(idx: number) {
    const newItems = [...items];
    newItems.splice(idx + 1, 0, { ...items[idx] });
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
    const nonVatItemsTotal = items.filter(it => it.vatType !== "vat7").reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const rawTotal = vatItemsTotal + nonVatItemsTotal;
    const discPercVal = discIsPercent ? Math.min(parseFloat(discRaw) || 0, 100) : 0;
    const discAmount = discIsPercent ? rawTotal * discPercVal / 100 : (parseFloat(discRaw) || 0);
    const afterDiscount = Math.max(rawTotal - discAmount, 0);
    const vatBase = Math.max(vatItemsTotal - discAmount, 0);
    const vatAmount = vatBase * 0.07;
    const wht = whtIsPercent ? afterDiscount * (parseFloat(whtRaw) || 0) / 100 : (parseFloat(whtRaw) || 0);
    return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, withholdingTax: wht, totalAmount: afterDiscount + vatAmount - wht };
  }

  function handleReset() {
    setForm({
      depositNo: form.depositNo,
      depositDate: toLocalDateStr(new Date()),
      dueDate: "",
      vendorId: undefined,
      vendorCode: "",
      vendorName: "",
      vendorAddress: "",
      vendorTaxId: "",
      branch: "",
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
      docPrefix: "PDP",
      saveToContacts: false,
      currencyCode: "THB",
      exchangeRate: "1",
      withholdingTax: "0",
      discountBeforeVat: "0",
      paymentMethod: (() => { const m = activePaymentMethods.find((m: any) => m.isDefault) || activePaymentMethods[0]; return m ? (m.name || m.nameTh || m.accountCode) : ""; })(),
      attachedUrl: "",
      showInTaxReport: true,
    });
    setItems([{ ...emptyItem(), vatType: defaultVatType }]);
    setDiscountMode("amount");
    setVendorSearch(null);
    setVendorCodeSearch(null);
  }

  async function handleSubmit(approveNow = false) {
    if (!form.vendorName) {
      toast({ title: "กรุณากรอกข้อมูลให้ครบถ้วน", description: "ต้องระบุชื่อผู้ขาย", variant: "destructive" });
      return;
    }
    const validItems = items.filter(it => it.accountName || it.description || parseFloat(it.amount) > 0);
    if (validItems.length === 0) {
      toast({ title: "กรุณาเพิ่มรายการอย่างน้อย 1 รายการ", variant: "destructive" });
      return;
    }
    const totals = calcTotals();
    const payload = {
      ...form,
      vendorId: form.vendorId ? Number(form.vendorId) : null,
      companyId,
      subtotal: totals.subtotal.toFixed(2),
      vatAmount: totals.vatAmount.toFixed(2),
      totalAmount: totals.totalAmount.toFixed(2),
      status: approveNow ? "approved" : form.status,
      items: validItems.map(it => ({
        accountCode: it.accountCode,
        accountName: it.accountName,
        description: it.description,
        expenseType: it.expenseType,
        amount: it.amount,
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

  return (
    <Layout>
      <div className="space-y-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/purchases/purchase-deposit")}>ใบจ่ายเงินมัดจำ (PDP)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? (isLocked ? "ดูใบจ่ายเงินมัดจำ" : "แก้ไขใบจ่ายเงินมัดจำ") : "สร้างใบจ่ายเงินมัดจำ"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/purchases/purchase-deposit")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? (isLocked ? "ดูใบจ่ายเงินมัดจำ" : "แก้ไขใบจ่ายเงินมัดจำ") : "สร้างใบจ่ายเงินมัดจำ"}
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
                  {/* Row 1: รหัสคู่ค้า(1) | ผู้ติดต่อ(5) | เอกสารอ้างอิง(2) */}
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
                          const filtered = contacts.filter(c =>
                            (c.code || "").toLowerCase().includes(searchVal) ||
                            c.name.toLowerCase().includes(searchVal)
                          );
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

                  {/* Row 2: ชื่อคู่ค้า(4) | สาขา(2) | เลขที่ใบกำกับภาษี(2, bg-blue) */}
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
                            ((c as any).nameEn || "").toLowerCase().includes(searchVal) ||
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

                  {/* Row 3: ที่อยู่(4) | เลขผู้เสียภาษี+เครดิต(2) | วันที่ออก+วันครบกำหนด(2) */}
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
                      <DatePicker data-testid="input-deposit-date" value={form.depositDate} onChange={v => { setManualDueDate(false); setForm(p => ({ ...p, depositDate: v })); }} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                      <div className="mt-1.5">
                        <div className="text-[10px] text-slate-400 mb-0.5">วันครบกำหนด</div>
                        <DatePicker data-testid="input-due-date" value={form.dueDate} onChange={v => { setManualDueDate(true); setForm(p => ({ ...p, dueDate: v })); }} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                      </div>
                    </td>
                  </tr>

                  {/* Row 4: อีเมล์(2) | โทรศัพท์(2) | วิธีชำระเงิน(2, bg-amber) | เลขที่เอกสาร(2) */}
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
                      <Select value={form.paymentMethod || ""} onValueChange={v => setForm(p => ({ ...p, paymentMethod: v }))}>
                        <SelectTrigger data-testid="select-payment-method" className="h-7 text-xs border-dashed border-emerald-300 bg-white focus:border-emerald-500 focus:ring-emerald-200">
                          <SelectValue placeholder="เลือกวิธีชำระเงิน" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="เครดิต">เครดิต (ตั้งเจ้าหนี้)</SelectItem>
                          {activePaymentMethods.length > 0 ? (
                            activePaymentMethods.map((m: any) => (
                              <SelectItem key={m.id} value={m.name || m.nameTh}>
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
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่เอกสาร</div>
                      <div className="flex items-center gap-1">
                        <Select value={form.docPrefix} onValueChange={v => setForm(p => ({ ...p, docPrefix: v }))}>
                          <SelectTrigger data-testid="select-doc-prefix" className="h-7 text-xs w-[60px] border-dashed px-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PDP">PDP</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input data-testid="input-deposit-no" value={form.depositNo} onChange={e => setForm(p => ({ ...p, depositNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
                      </div>
                    </td>
                  </tr>

                  {/* Row 5: พนักงาน(2) | แผนก/โครงการ(2) | สกุลเงิน(4) */}
                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">พนักงาน</div>
                      <Input data-testid="input-salesperson" list="emp-list-pdp" value={form.salesperson} onChange={e => setForm(p => ({ ...p, salesperson: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="เลือกหรือพิมพ์ชื่อ" />
                      <datalist id="emp-list-pdp">
                        {employeeNames.map(e => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">แผนก / โครงการ</div>
                      <div className="flex items-center gap-1">
                        <Input data-testid="input-department" list="dept-list-pdp" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="เลือกหรือพิมพ์แผนก" />
                        <datalist id="dept-list-pdp">
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
                            <FetchRateButton currency={form.currencyCode} date={form.depositDate} onRate={r => setForm(p => ({ ...p, exchangeRate: String(r) }))} rateType="buying_transfer" />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Checkbox row */}
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

            {/* Line Items Table — identical to EXP */}
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
                  <tr className="bg-[#8b5cf6]">
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
                        <Popover>
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
                                  {accounts.map((acc: any) => (
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
                        <Input
                          data-testid={`input-account-name-${idx}`}
                          value={item.accountName}
                          onChange={e => updateItem(idx, "accountName", e.target.value)}
                          className="h-7 text-xs border-dashed"
                          placeholder="ชื่อบัญชี"
                        />
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
                          value={editingAmountIdx === idx ? item.amount : fmt(item.amount)}
                          onFocus={() => setEditingAmountIdx(idx)}
                          onBlur={() => setEditingAmountIdx(null)}
                          onChange={e => updateItem(idx, "amount", e.target.value)}
                          className="h-7 text-xs border-dashed text-right"
                        />
                      </td>
                      <td className="py-1 px-1">
                        <Select value={item.vatType} onValueChange={v => updateItem(idx, "vatType", v)}>
                          <SelectTrigger className="h-7 text-[10px] border-dashed px-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="vat7">7%</SelectItem>
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

            {/* Summary section — identical to EXP */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] text-slate-400 mb-1">หมายเหตุ</div>
                  <Textarea data-testid="input-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="text-xs resize-none border-dashed" placeholder="หมายเหตุ..." />
                </div>
                <MultiFileAttachment
                  value={form.attachedUrl}
                  onChange={v => setForm(p => ({ ...p, attachedUrl: v }))}
                  testIdPrefix="pdp-attachment"
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
                    <td className="text-right pr-4 py-2.5 font-bold text-[var(--theme-primary)] whitespace-nowrap" style={{ fontSize: 15 }}>ยอดรวมสุทธิ:</td>
                    <td className="text-right py-2.5 font-bold text-[var(--theme-primary)] pr-2" style={{ fontSize: 15 }}>{fmt(totals.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {editingId && form.status === "approved" && deductions.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-slate-700 mb-2" data-testid="text-deductions-title">รายการหักมัดจำ</h3>
                <div className="border rounded overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow className="hover:bg-transparent h-9">
                        <TableHead className="w-10 text-center text-xs font-medium text-slate-600">#</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600">เลขที่เอกสาร</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600">วันที่</TableHead>
                        <TableHead className="text-right text-xs font-medium text-slate-600">จำนวนเงิน</TableHead>
                        <TableHead className="text-xs font-medium text-slate-600">หมายเหตุ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deductions.map((ded: any, idx: number) => (
                        <TableRow key={idx} data-testid={`row-deduction-${idx}`} className="hover:bg-slate-50/50">
                          <TableCell className="text-center text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="text-xs">{ded.documentNo || ded.referenceNo || "-"}</TableCell>
                          <TableCell className="text-xs">{ded.date || "-"}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{fmt(ded.amount)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{ded.notes || "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            <div className="mt-4">
              <JournalPreviewPanel
                companyId={companyId ?? null}
                documentType="purchase_deposit"
                subtotal={totals.subtotal?.toFixed(2) || "0"}
                vatAmount={totals.vatAmount?.toFixed(2) || "0"}
                paymentMethod={form.paymentMethod}
                currencyCode={form.currencyCode}
                              onLinesChange={setJournalOverrideLines}
              />
            </div>

            <div className="flex items-center justify-center gap-3 pt-4 border-t">
              <Button data-testid="button-reset" variant="outline" size="sm" className="h-9 px-6 gap-1.5" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" /> รีเซ็ต
              </Button>
              {editingId && companyId && (
                <AutoJournalButton
                  documentType="purchase_deposit"
                  documentId={editingId}
                  companyId={companyId}
                  disabled={isSaving}
                />
              )}
              {form.status === "draft" && editingId && (
                <Button
                  data-testid="button-approve"
                  onClick={() => handleSubmit(true)}
                  disabled={isSaving || isLocked}
                  variant="outline"
                  size="sm"
                  className="h-9 px-6 gap-1.5 text-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  อนุมัติ
                </Button>
              )}
              <Button
                data-testid="button-submit"
                onClick={() => handleSubmit(false)}
                disabled={isSaving || isLocked}
                size="sm"
                className="h-9 px-8 gap-1.5 text-sm"
              >
                <Save className="h-3.5 w-3.5" />
                {isLocked ? "ล็อคแล้ว" : isSaving ? "กำลังบันทึก..." : "บันทึก [F2]"}
              </Button>
            </div>
          </fieldset>
        </div>
      </div>
    </Layout>
  );
}
