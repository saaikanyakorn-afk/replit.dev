import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute, useSearch } from "wouter";
import Layout from "@/components/layout";
import { FetchRateButton } from "@/components/fetch-rate-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useDocDropdowns } from "@/hooks/use-doc-dropdowns";
import {
  ArrowLeft, Plus, ShoppingCart, Save, Trash2, Package, Home,
  RotateCcw, Paperclip, Copy, Link2, FileOutput, Receipt, X, FileDown, CheckCircle2, XCircle, Search, Loader2
} from "lucide-react";
import MultiFileAttachment from "@/components/multi-file-attachment";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker, toDisplayDate } from "@/components/ui/date-picker";
import type { DateFormat } from "@/components/ui/date-picker";
import type { Contact, Product } from "@shared/schema";
import RelatedDocuments from "@/components/related-documents";
import { useDbdLookup } from "@/hooks/use-dbd-lookup";
import { useArchiveLink } from "../../hooks/use-archive-link";
import { toLocalDateStr } from "@/lib/utils";
import { usePrefixOptions } from "@/hooks/use-prefix-options";

import { useDateSettings } from "@/hooks/use-date-settings";
interface OrderItemForm {
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

const emptyItem = (): OrderItemForm => ({
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

export default function SalesOrderForm() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/sales/order/new");
  const [matchEdit, paramsEdit] = useRoute("/sales/order/edit/:id");
  const editingId = matchEdit ? Number(paramsEdit?.id) : null;
  const isNew = !!matchNew;

  const { selectedCompany } = useCompany();
  const { employeeNames, departmentList, branchList } = useDocDropdowns();
  const companyId = selectedCompany?.id;
  const defaultVatType = selectedCompany?.vatRegistered ? "vat7" : "non_vat";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { lookup: lookupDBD, loading: dbdLoading } = useDbdLookup();

  const [savedId, setSavedId] = useState<number | null>(editingId);
  const [priceMode, setPriceMode] = useState<"excluded" | "included">("excluded");
  const [form, setForm] = useState({
    orderNo: "",
    orderDate: toLocalDateStr(new Date()),
    shippingDate: "",
    customerId: undefined as number | undefined,
    customerCode: "",
    customerName: "",
    customerAddress: "",
    customerTaxId: "",
    branch: "สำนักงานใหญ่",
    contactPerson: "",
    contactPhone: "",
    contactEmail: "",
    creditDays: "",
    channel: "direct",
    channelOrderNo: "",
    shippingProvider: "",
    trackingNo: "",
    paymentStatus: "unpaid",
    paymentMethod: "",
    notes: "",
    internalNotes: "",
    status: "new",
    salesperson: "",
    department: "",
    project: "",
    refDoc: "",
    linkJournal: true,
    paymentTerms: "",
    attachedUrl: "",
    withholdingTax: "0",
    discountBeforeVat: "0",
    docPrefix: "SO",
    saveToContacts: false,
    currencyCode: "THB",
    exchangeRate: "1",
    sellerBranchId: selectedCompany?.sellerBranchId || "00000",
  });
  const [customerSearch, setCustomerSearch] = useState<string | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerCodeSearch, setCustomerCodeSearch] = useState<string | null>(null);
  const [showCustomerCodeDropdown, setShowCustomerCodeDropdown] = useState(false);
  const [items, setItems] = useState<OrderItemForm[]>([emptyItem()]);
  const [productSearches, setProductSearches] = useState<Record<number, string>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<Record<number, boolean>>({});
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (isNew && selectedCompany && items.length === 1 && !items[0].productCode) {
      setItems([{ ...items[0], vatType: defaultVatType }]);
    }
  }, [selectedCompany]);

  useEffect(() => {
    if (!loaded) return;
    const days = form.creditDays ? parseInt(form.creditDays) : NaN;
    if (!isNaN(days) && days >= 0 && form.orderDate) {
      const base = new Date(form.orderDate + "T00:00:00");
      base.setDate(base.getDate() + days);
      const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
      setForm(p => ({ ...p, shippingDate: iso }));
    }
  }, [form.creditDays, form.orderDate, loaded]);

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

  const { data: productStockList = [] } = useQuery<any[]>({
    queryKey: ["/api/product-stock", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/product-stock?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });
  const stockMap = Object.fromEntries(productStockList.map((s: any) => [s.productId, parseFloat(s.quantity || "0")]));

  const { data: stockByWarehouse = {} } = useQuery<Record<number, { warehouseName: string; qty: number }[]>>({
    queryKey: ["/api/inventory/stock-by-warehouse", companyId],
    queryFn: async () => {
      if (!companyId) return {};
      const res = await fetch(`/api/inventory/stock-by-warehouse?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return {};
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
  const { prefixOptions, defaultPrefix } = usePrefixOptions("sales_order", docSettings);
  useEffect(() => {
    if (isNew && defaultPrefix && form.docPrefix !== defaultPrefix) {
      setForm(p => ({ ...p, docPrefix: defaultPrefix }));
    }
  }, [defaultPrefix, isNew]);

  const searchString = useSearch();
  const soSearchParams = isNew ? new URLSearchParams(searchString) : null;
  const fromQuoteId = soSearchParams?.get("fromQuote") || null;
  const copyFromId = soSearchParams?.get("copyFrom") || null;

  useEffect(() => {
    if (loaded) return;
    if (isNew && fromQuoteId) {
      (async () => {
        try {
          const res = await fetch(`/api/quotations/${fromQuoteId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setForm(prev => ({
              ...prev,
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
              salesperson: data.salesperson || "",
              department: data.department || "",
              project: data.project || "",
              refDoc: data.quotationNo || "",
              paymentTerms: data.paymentTerms || "",
              withholdingTax: String(data.withholdingTax || "0"),
              discountBeforeVat: data.discountType === "percent" ? `${cleanDecimal(data.discountAmount, "0")}%` : cleanDecimal(data.discountAmount, "0"),
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
            }));
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
                warehouseId: it.warehouseId || undefined,
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew && copyFromId) {
      (async () => {
        try {
          const res = await fetch(`/api/sales-orders/${copyFromId}`, { credentials: "include" });
          if (res.ok) {
            const src = await res.json();
            setPriceMode(src.priceMode || "excluded");
            setForm(prev => ({
              ...prev, orderNo: "", orderDate: toLocalDateStr(new Date()),
              customerId: src.customerId || undefined, customerCode: src.customerCode || "",
              customerName: src.customerName || "", customerAddress: src.customerAddress || "",
              customerTaxId: src.customerTaxId || "", branch: src.branch || "",
              contactPerson: src.contactPerson || "", contactPhone: src.contactPhone || "",
              contactEmail: src.contactEmail || "", creditDays: src.creditDays || "",
              notes: src.notes || "", internalNotes: src.internalNotes || "",
              status: src.status || "new",
              salesperson: src.salesperson || "", department: src.department || "",
              project: src.project || "", refDoc: src.refDoc || "",
              paymentTerms: src.paymentTerms || "",
              withholdingTax: String(src.withholdingTax || "0"),
              discountBeforeVat: src.discountType === "percent" ? `${cleanDecimal(src.discountAmount, "0")}%` : cleanDecimal(src.discountAmount, "0"),
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
      setLoaded(true);
    } else if (editingId) {
      (async () => {
        try {
          const res = await fetch(`/api/sales-orders/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setForm({
              orderNo: data.orderNo || "",
              orderDate: data.orderDate || "",
              shippingDate: data.shippingDate || "",
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
              channel: data.channel || "direct",
              channelOrderNo: data.channelOrderNo || "",
              shippingProvider: data.shippingProvider || "",
              trackingNo: data.trackingNo || "",
              paymentStatus: data.paymentStatus || "unpaid",
              paymentMethod: data.paymentMethod || "",
              notes: data.notes || "",
              internalNotes: data.internalNotes || "",
              status: data.status || "new",
              salesperson: data.salesperson || "",
              department: data.department || "",
              project: data.project || "",
              refDoc: data.refDoc || "",
              linkJournal: data.linkJournal ?? true,
              paymentTerms: data.paymentTerms || "",
              attachedUrl: data.attachedUrl || "",
              withholdingTax: String(data.withholdingTax || "0"),
              discountBeforeVat: data.discountType === "percent" ? `${cleanDecimal(data.discountAmount, "0")}%` : cleanDecimal(data.discountAmount, "0"),
              docPrefix: data.docPrefix || "SO",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              sellerBranchId: data.sellerBranchId || selectedCompany?.sellerBranchId || "00000",
            });
            if (data.discountType === "percent") setDiscountMode("percent");
            if (data.items && data.items.length > 0) {
              setItems(data.items.map((it: any) => ({
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
            setSavedId(editingId);
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
      const res = await apiRequest("POST", "/api/sales-orders", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      if (fromQuoteId && data?.id) {
        fetch(`/api/quotations/${fromQuoteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ salesOrderId: data.id }),
        });
      }
      toast({ title: "สร้างใบสั่งขายสำเร็จ", variant: "success" as any });
      navigate("/sales/order");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/sales-orders/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      toast({ title: "อัพเดทใบสั่งขายสำเร็จ", variant: "success" as any });
      navigate("/sales/order");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/sales-orders/${id}`, { status });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-orders"] });
      const newStatus = data.status || "approved";
      setForm(p => ({ ...p, status: newStatus }));
      toast({ title: newStatus === "approved" ? "อนุมัติใบสั่งขายสำเร็จ" : "อัพเดทสถานะสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  function handleCustomerSelect(contactId: string) {
    const c = contacts.find(ct => ct.id === Number(contactId));
    if (c) {
      setForm(prev => ({
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
      return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, withholdingTax: wht, totalAmount: grandTotal };
    } else {
      const afterDiscount = Math.max(rawTotal - discAmount, 0);
      const vatBase = Math.max(vatItemsTotal - discAmount, 0);
      const vatAmount = vatBase * 0.07;
      const wht = whtIsPercent ? afterDiscount * (parseFloat(whtRaw) || 0) / 100 : (parseFloat(whtRaw) || 0);
      const grandTotal = afterDiscount + vatAmount - wht;
      return { rawTotal, discountAmount: discAmount, afterDiscount, vatAmount, withholdingTax: wht, totalAmount: grandTotal };
    }
  }

  function handleReset() {
    setForm({
      orderNo: form.orderNo,
      orderDate: toLocalDateStr(new Date()),
      shippingDate: "",
      customerId: undefined,
      customerCode: "",
      customerName: "",
      customerAddress: "",
      customerTaxId: "",
      branch: "สำนักงานใหญ่",
      contactPerson: "",
      contactPhone: "",
      contactEmail: "",
      creditDays: "",
      channel: "direct",
      channelOrderNo: "",
      shippingProvider: "",
      trackingNo: "",
      paymentStatus: "unpaid",
      paymentMethod: "",
      notes: "",
      internalNotes: "",
      status: "new",
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
      currencyCode: "THB",
      exchangeRate: "1",
      sellerBranchId: selectedCompany?.sellerBranchId || "00000",
    });
    setItems([{ ...emptyItem(), vatType: defaultVatType }]);
    setPriceMode("excluded");
    setCustomerSearch("");
    setProductSearches({});
    setShowProductDropdown({});
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
    if (warehouses.length > 1) {
      const missingWarehouse = items.filter(it => it.productName && it.productId && !it.warehouseId);
      if (missingWarehouse.length > 0) {
        toast({ title: "กรุณาเลือกคลังสินค้า", description: `มี ${missingWarehouse.length} รายการที่ยังไม่ได้เลือกคลัง กรุณาเลือกคลังให้ครบทุกรายการ`, variant: "destructive" });
        return;
      }
    }
    let newContact: { id: number; code: string } | null = null;
    if (form.saveToContacts && !form.customerId) {
      newContact = await handleSaveNewContact();
    }
    const totals = calcTotals();
    const payload = {
      ...form,
      customerId: newContact ? newContact.id : (form.customerId ? Number(form.customerId) : null),
      customerCode: newContact ? newContact.code : (form.customerCode || ""),
      companyId,
      quotationId: fromQuoteId ? Number(fromQuoteId) : (form as any).quotationId || null,
      priceMode,
      docPrefix: form.docPrefix,
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

  return (
    <Layout>
      <div className="space-y-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/sales/order")}>ใบสั่งขาย (SO)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? "แก้ไขใบสั่งขาย" : "สร้างใบสั่งขาย"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/sales/order")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <ShoppingCart className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? "แก้ไขใบสั่งขาย" : "สร้างใบสั่งขาย"}
          </h1>
        </div>

        <div className="bg-white border rounded-lg shadow-sm">
          <fieldset className="p-2 sm:p-4 space-y-4">
            <div className="border rounded overflow-hidden doc-header-table">
              <table className="w-full text-sm table-fixed">
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
                  {/* Row 1: รหัสลูกค้า(1) | ผู้ติดต่อ(5) | เอกสารอ้างอิง(2) */}
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
                      <Input data-testid="input-contact-person" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} className="h-7 text-xs border-dashed w-full" placeholder="ใส่ชื่อเต็ม หรือ ค้นหาจากบัญชีรายชื่อ" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เอกสารอ้างอิง</div>
                      <Input data-testid="input-ref-doc" value={form.refDoc || ""} onChange={e => setForm(p => ({ ...p, refDoc: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                  </tr>

                  {/* Row 2: ชื่อคู่ค้า(4) | สาขา(2) | วันที่สั่งขาย(2) */}
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
                      <div className="text-[10px] text-slate-400 mb-0.5">วันที่สั่งขาย</div>
                      <DatePicker data-testid="input-order-date" value={form.orderDate} onChange={v => setForm(p => ({ ...p, orderDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                    </td>
                  </tr>

                  {/* Row 3: ที่อยู่(4) | เลขผู้เสียภาษี+เครดิต stacked(2) | วันที่จัดส่ง(2) */}
                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ที่อยู่</div>
                      <Textarea data-testid="input-address" value={form.customerAddress} onChange={e => setForm(p => ({ ...p, customerAddress: e.target.value }))} rows={2} className="text-xs resize-none border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขประจำตัวผู้เสียภาษี</div>
                      <div className="flex gap-1">
                        <Input data-testid="input-tax-id" value={form.customerTaxId} onChange={e => setForm(p => ({ ...p, customerTaxId: e.target.value }))} className="h-7 text-xs border-dashed flex-1" />
                        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={dbdLoading || !form.customerTaxId} onClick={async () => { const r = await lookupDBD(form.customerTaxId); if (r) setForm(p => ({ ...p, customerName: r.name, customerAddress: r.address, branch: r.branch || p.branch })); }} data-testid="button-dbd-lookup">
                          {dbdLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                        </Button>
                      </div>
                      <div className="mt-1.5">
                        <div className="text-[10px] text-slate-400 mb-0.5">#เครดิต (วัน)</div>
                        <Input data-testid="input-credit-days" inputMode="numeric" value={form.creditDays || ""} onChange={e => { const v = e.target.value; if (/^\d*$/.test(v)) setForm(p => ({ ...p, creditDays: v })); }} className="h-7 text-xs border-dashed" placeholder="0" />
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">วันที่จัดส่ง</div>
                      <DatePicker data-testid="input-shipping-date" value={form.shippingDate} onChange={v => setForm(p => ({ ...p, shippingDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                    </td>
                  </tr>

                  {/* Row 4: อีเมล์(2) | โทรศัพท์(2) | ช่องทาง(2, bg-amber) | เลขที่ใบสั่งขาย(2) */}
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
                      <div className="text-[10px] text-amber-600 font-semibold mb-0.5">ช่องทางขาย</div>
                      <Select value={form.channel} onValueChange={v => setForm(p => ({ ...p, channel: v }))}>
                        <SelectTrigger data-testid="select-channel" className="h-7 text-xs border-dashed border-amber-300 bg-white focus:border-amber-500 focus:ring-amber-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="direct">หน้าร้าน</SelectItem>
                          <SelectItem value="shopee">Shopee</SelectItem>
                          <SelectItem value="lazada">Lazada</SelectItem>
                          <SelectItem value="tiktok">TikTok Shop</SelectItem>
                          <SelectItem value="line">LINE</SelectItem>
                          <SelectItem value="facebook">Facebook</SelectItem>
                          <SelectItem value="website">เว็บไซต์</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่ใบสั่งขาย</div>
                      <div className="flex items-center gap-1">
                        <Select value={form.docPrefix} onValueChange={v => setForm(p => ({ ...p, docPrefix: v }))}>
                          <SelectTrigger data-testid="select-doc-prefix" className="h-7 text-xs w-[60px] border-dashed px-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {prefixOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input data-testid="input-order-no" value={form.orderNo} onChange={e => setForm(p => ({ ...p, orderNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
                      </div>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">บริการขนส่ง</div>
                      <Select value={form.shippingProvider || "none"} onValueChange={v => setForm(p => ({ ...p, shippingProvider: v === "none" ? "" : v }))}>
                        <SelectTrigger data-testid="select-shipping-provider" className="h-7 text-xs border-dashed">
                          <SelectValue placeholder="เลือกบริการขนส่ง" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">ไม่ระบุ</SelectItem>
                          <SelectItem value="Kerry">Kerry Express</SelectItem>
                          <SelectItem value="Flash">Flash Express</SelectItem>
                          <SelectItem value="ThaiPost">ไปรษณีย์ไทย</SelectItem>
                          <SelectItem value="J&T">J&T Express</SelectItem>
                          <SelectItem value="NinjaVan">Ninja Van</SelectItem>
                          <SelectItem value="Self">จัดส่งเอง</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขพัสดุ</div>
                      <Input data-testid="input-tracking-no" value={form.trackingNo} onChange={e => setForm(p => ({ ...p, trackingNo: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="เลขติดตามพัสดุ" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">สถานะชำระ</div>
                      <Select value={form.paymentStatus} onValueChange={v => setForm(p => ({ ...p, paymentStatus: v }))}>
                        <SelectTrigger data-testid="select-payment-status" className="h-7 text-xs border-dashed">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unpaid">ยังไม่ชำระ</SelectItem>
                          <SelectItem value="paid">ชำระครบ</SelectItem>
                          <SelectItem value="partial">ชำระบางส่วน</SelectItem>
                          <SelectItem value="cod">COD</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top bg-amber-50/70" colSpan={2}>
                      <div className="text-[10px] text-amber-600 font-semibold mb-0.5">วิธีชำระเงิน</div>
                      <Select value={form.paymentMethod || "none"} onValueChange={v => setForm(p => ({ ...p, paymentMethod: v === "none" ? "" : v }))}>
                        <SelectTrigger data-testid="select-payment-method" className="h-7 text-xs border-dashed">
                          <SelectValue placeholder="เลือก" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">ไม่ระบุ</SelectItem>
                          {activePaymentMethods.map((m: any) => (
                            <SelectItem key={m.id} value={m.accountCode || m.name || m.nameTh || String(m.id)}>
                              {m.nameTh || m.name}{m.bankName ? ` · ${m.bankName}` : ""}{m.bankAccountNo ? ` ${m.bankAccountNo}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่ออเดอร์ช่องทาง</div>
                      <Input data-testid="input-channel-order-no" value={form.channelOrderNo || ""} onChange={e => setForm(p => ({ ...p, channelOrderNo: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="เลขที่ออเดอร์" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">พนักงานขาย</div>
                      <Input data-testid="input-salesperson" list="emp-list-so" value={form.salesperson} onChange={e => setForm(p => ({ ...p, salesperson: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="เลือกหรือพิมพ์ชื่อ" />
                      <datalist id="emp-list-so">
                        {employeeNames.map(e => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">แผนก / โครงการ</div>
                      <div className="flex items-center gap-1">
                        <Input data-testid="input-department" list="dept-list-so" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="เลือกหรือพิมพ์แผนก" />
                        <datalist id="dept-list-so">
                          {departmentList.map(d => <option key={d.id} value={d.name} />)}
                        </datalist>
                        <Input data-testid="input-project" value={form.project} onChange={e => setForm(p => ({ ...p, project: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="โครงการ" />
                      </div>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
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
                            <FetchRateButton currency={form.currencyCode} date={form.orderDate} onRate={r => setForm(p => ({ ...p, exchangeRate: String(r) }))} rateType="buying_transfer" />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  <tr>
                    <td className="px-3 py-1.5" colSpan={8}>
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
                              <div className="absolute z-50 top-full left-0 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto" style={{minWidth:"280px"}}>
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
                        <textarea className="w-full min-w-0 text-xs border border-dashed rounded px-2 py-1.5 resize-y min-h-[32px] focus:outline-none focus:ring-1 focus:ring-sky-400 bg-transparent" rows={2} placeholder="พิมพ์ชื่อสินค้า/บริการ" value={item.productName} onChange={e => updateItem(idx, "productName", e.target.value)} data-testid={`input-product-name-${idx}`} />
                      </td>
                      <td className="px-1 pt-1.5">
                        <Input data-testid={`input-qty-${idx}`} inputMode="decimal" className="h-9 text-sm text-center border-dashed w-full min-w-0 px-1" value={item.qty} onChange={e => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) updateItem(idx, "qty", v); }} />
                        {item.productId && (() => {
                          const pid = Number(item.productId);
                          const wid = Number(item.warehouseId) || null;
                          const selectedWh = wid ? warehouses.find((wh: any) => Number(wh.id) === wid) : null;
                          const levels: { warehouseName: string; qty: number }[] | undefined =
                            (stockByWarehouse as any)[pid] || (stockByWarehouse as any)[String(pid)];
                          const displayQty = selectedWh && levels && levels.length > 0
                            ? (levels.find((w) => w.warehouseName === selectedWh.name)?.qty ?? stockMap[pid])
                            : stockMap[pid];
                          if (displayQty === undefined) return null;
                          return (
                            <div className={`text-[10px] text-center mt-0.5 ${displayQty <= 0 ? "text-red-500" : "text-slate-400"}`}>
                              Bal. {Number(displayQty).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </div>
                          );
                        })()}
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
                        <Button data-testid={`button-duplicate-item-${idx}`} variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white hover:bg-[var(--theme-primary)]" onClick={() => duplicateItem(idx)} title="คัดลอกแถว">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button data-testid={`button-remove-item-${idx}`} variant="ghost" size="icon" className="h-7 w-7 text-[#f94d4d] hover:text-white hover:bg-[#f94d4d]" onClick={() => removeItem(idx)} disabled={items.length === 1}>
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
                    testIdPrefix="sales-order-attachment"
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

            <div className="flex items-center justify-center gap-3 pt-4 border-t flex-wrap">
              <Button data-testid="button-reset" variant="outline" size="sm" className="h-9 px-6 gap-1.5" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" /> รีเซ็ต
              </Button>
              {editingId && !["approved", "cancelled"].includes(form.status) && (
                <Button
                  data-testid="button-approve"
                  onClick={() => statusMutation.mutate({ id: editingId, status: "approved" })}
                  disabled={statusMutation.isPending || isSaving}
                  size="sm"
                  className="h-9 px-6 gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {statusMutation.isPending ? "กำลังอนุมัติ..." : "อนุมัติ"}
                </Button>
              )}
              {editingId && form.status === "approved" && (
                <Button
                  data-testid="button-cancel-doc"
                  onClick={() => statusMutation.mutate({ id: editingId, status: "cancelled" })}
                  disabled={statusMutation.isPending || isSaving}
                  variant="outline"
                  size="sm"
                  className="h-9 px-6 gap-1.5 text-sm border-red-300 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  ยกเลิก
                </Button>
              )}
              <Button
                data-testid="button-submit"
                onClick={handleSubmit}
                disabled={isSaving}
                size="sm"
                className="h-9 px-8 gap-1.5 text-sm"
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? "กำลังบันทึก..." : "บันทึก [F2]"}
              </Button>
            </div>

            {isSaved && (
              <div className="border-t pt-4">
                <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  เชื่อมโยงเอกสาร — ออกเอกสารต่อจากใบสั่งขายนี้
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    data-testid="button-create-inv"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700"
                    onClick={() => navigate(`/sales/invoice/new?fromSalesOrder=${savedId || editingId}`)}
                  >
                    <FileOutput className="h-3.5 w-3.5" />
                    ออกใบแจ้งหนี้
                  </Button>
                  <Button
                    data-testid="button-create-tax"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                    onClick={() => navigate(`/sales/tax-invoice/new?fromSalesOrder=${savedId || editingId}`)}
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    ออกใบกำกับภาษี
                  </Button>
                </div>
              </div>
            )}
          </fieldset>
        </div>
      </div>
      <RelatedDocuments docType="sales_order" docId={savedId || editingId} />
    </Layout>
  );
}
