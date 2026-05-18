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
import {
  ArrowLeft, Plus, FileText, Save, Trash2, Package, Home,
  RotateCcw, Copy, AlertCircle, CheckCircle2, XCircle, Search, Loader2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker, toDisplayDate } from "@/components/ui/date-picker";
import type { DateFormat } from "@/components/ui/date-picker";
import type { Contact, Product } from "@shared/schema";
import { useDbdLookup } from "@/hooks/use-dbd-lookup";
import MultiFileAttachment from "@/components/multi-file-attachment";
import { toLocalDateStr } from "@/lib/utils";
import { usePrefixOptions } from "@/hooks/use-prefix-options";

import { useDateSettings } from "@/hooks/use-date-settings";
interface POItemForm {
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

const emptyItem = (): POItemForm => ({
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

export default function PurchaseOrder() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/purchases/po/new");
  const [matchEdit, paramsEdit] = useRoute("/purchases/po/edit/:id");
  const editingId = matchEdit ? Number(paramsEdit?.id) : null;
  const isNew = !!matchNew;

  const searchString = useSearch();
  const poSearchParams = isNew ? new URLSearchParams(searchString) : null;
  const fromPRId = poSearchParams?.get("fromPR") || null;
  const fromBIDId = poSearchParams?.get("fromBID") || null;
  const copyFromId = poSearchParams?.get("copyFrom") || null;

  const { selectedCompany } = useCompany();
  const { employeeNames, departmentList, branchList } = useDocDropdowns();
  const companyId = selectedCompany?.id;
  const defaultVatType = selectedCompany?.vatRegistered ? "vat7" : "non_vat";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lookup: lookupDBD, loading: dbdLoading } = useDbdLookup();

  const [priceMode, setPriceMode] = useState<"excluded" | "included">("excluded");
  const [form, setForm] = useState({
    poNo: "",
    poDate: toLocalDateStr(new Date()),
    deliveryDate: "",
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
    docPrefix: "PO",
    saveToContacts: false,
    currencyCode: "THB",
    exchangeRate: "1",
    withholdingTax: "0",
    discountBeforeVat: "0",
    paymentMethod: "",
    attachedUrl: "",
  });

  const [vendorSearch, setVendorSearch] = useState<string | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [vendorCodeSearch, setVendorCodeSearch] = useState<string | null>(null);
  const [showVendorCodeDropdown, setShowVendorCodeDropdown] = useState(false);
  const [items, setItems] = useState<POItemForm[]>([emptyItem()]);
  const [productSearches, setProductSearches] = useState<Record<number, string>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<Record<number, boolean>>({});
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [loaded, setLoaded] = useState(false);
  const [manualDeliveryDate, setManualDeliveryDate] = useState(false);

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
  const payMethods = paymentMethodsList.filter((m: any) => m.active !== false && (m.paymentType || "receive") === "pay");
  const activePaymentMethods = payMethods.length > 0 ? payMethods : paymentMethodsList.filter((m: any) => m.active !== false);
  const { prefixOptions, defaultPrefix } = usePrefixOptions("purchase_order", docSettings);
  useEffect(() => {
    if (isNew && defaultPrefix && form.docPrefix !== defaultPrefix) {
      setForm(p => ({ ...p, docPrefix: defaultPrefix }));
    }
  }, [defaultPrefix, isNew]);

  useEffect(() => {
    if (loaded) return;
    if (isNew && fromPRId) {
      (async () => {
        try {
          const res = await fetch(`/api/purchase-requests/${fromPRId}`, { credentials: "include" });
          if (res.ok) {
            const pr = await res.json();
            setForm(prev => ({
              ...prev,
              poNo: "",
              poDate: toLocalDateStr(new Date()),
              deliveryDate: toLocalDateStr(new Date()),
              vendorId: pr.vendorId || undefined,
              vendorCode: pr.vendorCode || "",
              vendorName: pr.vendorName || "",
              vendorAddress: pr.vendorAddress || "",
              vendorTaxId: pr.vendorTaxId || "",
              branch: pr.branch || "",
              sellerBranchId: pr.sellerBranchId || "",
              contactPerson: pr.contactPerson || "",
              contactPhone: pr.contactPhone || "",
              contactEmail: pr.contactEmail || "",
              creditDays: pr.creditDays ? String(pr.creditDays) : "",
              salesperson: pr.salesperson || "",
              department: pr.department || "",
              project: pr.project || "",
              refDoc: pr.prNo || "",
              currencyCode: pr.currencyCode || "THB",
              exchangeRate: String(pr.exchangeRate || "1"),
            }));
            if (pr.items && pr.items.length > 0) {
              setItems(pr.items.map((it: any) => ({
                productId: it.productId,
                productCode: it.productCode || "",
                productName: it.productName || "",
                description: it.description || "",
                qty: String(it.qty || "1"),
                unit: it.unit || "ชิ้น",
                unitPrice: "0",
                discount: "0",
                total: "0",
                vatType: it.vatType || "vat7",
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew && fromBIDId) {
      (async () => {
        try {
          const res = await fetch(`/api/bid-comparisons/${fromBIDId}`, { credentials: "include" });
          if (res.ok) {
            const bid = await res.json();
            setForm(prev => ({
              ...prev,
              poNo: "",
              poDate: toLocalDateStr(new Date()),
              deliveryDate: toLocalDateStr(new Date()),
              vendorId: bid.vendorId || undefined,
              vendorCode: bid.vendorCode || "",
              vendorName: bid.vendorName || "",
              vendorAddress: bid.vendorAddress || "",
              vendorTaxId: bid.vendorTaxId || "",
              branch: bid.branch || "",
              contactPerson: bid.contactPerson || "",
              contactPhone: bid.contactPhone || "",
              contactEmail: bid.contactEmail || "",
              creditDays: bid.creditDays ? String(bid.creditDays) : "",
              salesperson: bid.salesperson || "",
              department: bid.department || "",
              project: bid.project || "",
              refDoc: bid.bidNo || "",
              currencyCode: bid.currencyCode || "THB",
              exchangeRate: String(bid.exchangeRate || "1"),
            }));
            if (bid.items && bid.items.length > 0) {
              setItems(bid.items.map((it: any) => ({
                productId: it.productId,
                productCode: it.productCode || "",
                productName: it.productName || "",
                description: it.description || "",
                qty: String(it.qty || "1"),
                unit: it.unit || "ชิ้น",
                unitPrice: "0",
                discount: "0",
                total: "0",
                vatType: defaultVatType,
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew && copyFromId) {
      (async () => {
        try {
          const res = await fetch(`/api/purchase-orders/${copyFromId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setForm({
              poNo: "",
              poDate: toLocalDateStr(new Date()),
              deliveryDate: data.deliveryDate || "",
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
              docPrefix: data.docPrefix || "PO",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              withholdingTax: String(data.withholdingTax || "0"),
              discountBeforeVat: data.discountType === "percent" ? `${cleanDecimal(data.discountAmount, "0")}%` : cleanDecimal(data.discountAmount, "0"),
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
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew) {
      setForm(prev => ({
        ...prev,
        poNo: "",
        deliveryDate: toLocalDateStr(new Date()),
      }));
      setLoaded(true);
    } else if (editingId) {
      (async () => {
        try {
          const res = await fetch(`/api/purchase-orders/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setForm({
              poNo: data.poNo || "",
              poDate: data.poDate || "",
              deliveryDate: data.deliveryDate || "",
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
              docPrefix: data.docPrefix || "PO",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              withholdingTax: String(data.withholdingTax || "0"),
              discountBeforeVat: data.discountType === "percent" ? `${cleanDecimal(data.discountAmount, "0")}%` : cleanDecimal(data.discountAmount, "0"),
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
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else {
      setLoaded(true);
    }
  }, [isNew, editingId, companyId, loaded, fromPRId, fromBIDId]);

  useEffect(() => {
    if (!loaded || manualDeliveryDate) return;
    const days = form.creditDays ? parseInt(form.creditDays) : NaN;
    if (!isNaN(days) && days >= 0 && form.poDate) {
      const base = new Date(form.poDate + "T00:00:00");
      base.setDate(base.getDate() + days);
      const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
      setForm(p => ({ ...p, deliveryDate: iso }));
    }
  }, [form.creditDays, form.poDate, loaded]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/purchase-orders", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "สร้างใบสั่งซื้อสำเร็จ", variant: "success" as any });
      navigate("/purchases/po");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/purchase-orders/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "อัพเดทใบสั่งซื้อสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/purchase-orders/${id}`, { status });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      const newStatus = data.status || "approved";
      setForm(p => ({ ...p, status: newStatus }));
      const statusLabels: Record<string, string> = { approved: "อนุมัติแล้ว", cancelled: "ยกเลิกแล้ว", draft: "กลับเป็นแบบร่าง" };
      toast({ title: statusLabels[newStatus] || "อัพเดทสถานะสำเร็จ", variant: "success" as any });
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

  function addItem() { setItems([...items, { ...emptyItem(), vatType: defaultVatType }]); }
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
      return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, withholdingTax: wht, totalAmount: afterDiscount + vatAmount - wht };
    } else {
      const afterDiscount = Math.max(rawTotal - discAmount, 0);
      const vatBase = Math.max(vatItemsTotal - discAmount, 0);
      const vatAmount = vatBase * 0.07;
      const wht = whtIsPercent ? afterDiscount * (parseFloat(whtRaw) || 0) / 100 : (parseFloat(whtRaw) || 0);
      return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, withholdingTax: wht, totalAmount: afterDiscount + vatAmount - wht };
    }
  }

  function handleReset() {
    setForm({
      poNo: form.poNo,
      poDate: toLocalDateStr(new Date()),
      deliveryDate: "",
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
      status: "approved",
      salesperson: "",
      department: "",
      project: "",
      refDoc: "",
      docPrefix: form.docPrefix,
      saveToContacts: false,
      currencyCode: "THB",
      exchangeRate: "1",
      withholdingTax: "0",
      discountBeforeVat: "0",
      paymentMethod: "",
      attachedUrl: "",
    });
    setItems([{ ...emptyItem(), vatType: defaultVatType }]);
    setPriceMode("excluded");
  }

  function buildPayload() {
    const totals = calcTotals();
    return {
      ...form,
      companyId,
      vendorId: form.vendorId ? Number(form.vendorId) : null,
      priceMode,
      creditDays: form.creditDays ? Number(form.creditDays) : null,
      subtotal: totals.afterDiscount.toFixed(2),
      vatAmount: totals.vatAmount.toFixed(2),
      totalAmount: totals.totalAmount.toFixed(2),
      discountAmount: (discountMode === "percent" ? parseFloat(form.discountBeforeVat) || 0 : totals.discountAmount).toFixed(2),
      discountType: discountMode,
      withholdingTax: totals.withholdingTax.toFixed(2),
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
  }

  async function handleSubmit() {
    const payload = buildPayload();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  async function handleSaveAndWht() {
    const payload = buildPayload();
    const totals = calcTotals();
    try {
      let savedDoc: any;
      if (editingId) {
        const res = await apiRequest("PATCH", `/api/purchase-orders/${editingId}`, payload);
        savedDoc = await res.json();
      } else {
        const res = await apiRequest("POST", "/api/purchase-orders", payload);
        savedDoc = await res.json();
      }
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      toast({ title: "บันทึกใบสั่งซื้อสำเร็จ", variant: "success" as any });
      const params = new URLSearchParams({
        vendorId: String(savedDoc.vendorId || ""),
        vendorName: savedDoc.vendorName || "",
        vendorAddress: savedDoc.vendorAddress || "",
        vendorTaxId: savedDoc.vendorTaxId || "",
        vendorBranch: savedDoc.branch || "",
        whtAmount: String(totals.withholdingTax.toFixed(2)),
        totalAmount: String(totals.afterDiscount.toFixed(2)),
        sourceDocType: "purchase_order",
        sourceDocId: String(savedDoc.id),
        sourceDocNo: savedDoc.poNo || "",
      });
      navigate(`/purchases/wht/new?${params.toString()}`);
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
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
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/purchases/po")}>ใบสั่งซื้อ (PO)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? (isLocked ? "ดูใบสั่งซื้อ" : "แก้ไขใบสั่งซื้อ") : "สร้างใบสั่งซื้อ"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/purchases/po")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? (isLocked ? "ดูใบสั่งซื้อ" : "แก้ไขใบสั่งซื้อ") : "สร้างใบสั่งซื้อ"}
          </h1>
        </div>

        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>เอกสารนี้มีสถานะ <strong>{form.status === "approved" ? "อนุมัติแล้ว" : "ยกเลิก"}</strong> ไม่สามารถแก้ไขได้</span>
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
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">วันที่ออกใบสั่งซื้อ</div>
                      <DatePicker data-testid="input-po-date" value={form.poDate} onChange={v => setForm(p => ({ ...p, poDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
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
                        <Input data-testid="input-credit-days" inputMode="numeric" value={form.creditDays || ""} onChange={e => { const v = e.target.value; if (/^\d*$/.test(v)) { setManualDeliveryDate(false); setForm(p => ({ ...p, creditDays: v })); } }} className="h-7 text-xs border-dashed" placeholder="0" />
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">กำหนดส่งของ</div>
                      <DatePicker data-testid="input-delivery-date" value={form.deliveryDate} onChange={v => { setManualDeliveryDate(true); setForm(p => ({ ...p, deliveryDate: v })); }} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
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
                      <Select value={form.paymentMethod || ""} onValueChange={v => setForm(p => ({ ...p, paymentMethod: v }))}>
                        <SelectTrigger data-testid="select-payment-method" className="h-7 text-xs border-dashed">
                          <SelectValue placeholder="เลือก" />
                        </SelectTrigger>
                        <SelectContent>
                          {activePaymentMethods.map((m: any) => (
                            <SelectItem key={m.id} value={m.name || m.nameTh}>
                              {m.nameTh || m.name}{m.bankName ? ` · ${m.bankName}` : ""}{m.bankAccountNo ? ` ${m.bankAccountNo}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่ใบสั่งซื้อ</div>
                      <div className="flex items-center gap-1">
                        <Select value={form.docPrefix} onValueChange={v => setForm(p => ({ ...p, docPrefix: v }))}>
                          <SelectTrigger data-testid="select-doc-prefix" className="h-7 text-xs w-[60px] border-dashed px-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {prefixOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input data-testid="input-po-no" value={form.poNo} onChange={e => setForm(p => ({ ...p, poNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
                      </div>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">พนักงาน</div>
                      <Input data-testid="input-salesperson" list="emp-list-po" value={form.salesperson} onChange={e => setForm(p => ({ ...p, salesperson: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="เลือกหรือพิมพ์ชื่อ" />
                      <datalist id="emp-list-po">
                        {employeeNames.map(e => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">แผนก / โครงการ</div>
                      <div className="flex items-center gap-1">
                        <Input data-testid="input-department" list="dept-list-po" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="เลือกหรือพิมพ์แผนก" />
                        <datalist id="dept-list-po">
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
                            <FetchRateButton currency={form.currencyCode} date={form.poDate} onRate={r => setForm(p => ({ ...p, exchangeRate: String(r) }))} rateType="buying_transfer" />
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
                  <tr className="bg-[#fb9678]">
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
                            <SelectItem value="vat0">0%</SelectItem>
                            <SelectItem value="exempt">-</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
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
                    testIdPrefix="po-attachment"
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
          </fieldset>
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
    </Layout>
  );
}
