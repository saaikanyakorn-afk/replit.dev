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
  RotateCcw, Paperclip, AlertCircle, Copy, X, FileDown, Search, Loader2
} from "lucide-react";
import MultiFileAttachment from "@/components/multi-file-attachment";
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

interface ReceiptItemForm {
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

const emptyItem = (): ReceiptItemForm => ({
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

export default function ReceiptForm() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/sales/receipt/new");
  const [matchEdit, paramsEdit] = useRoute("/sales/receipt/edit/:id");
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
  const [journalOverrideLines, setJournalOverrideLines] = useState<JournalLine[] | null>(null);
  const [form, setForm] = useState({
    receiptNo: "",
    receiptDate: toLocalDateStr(new Date()),
    paymentDate: "",
    paymentMethod: "transfer" as string,
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
    notes: "",
    internalNotes: "",
    status: "completed",
    salesperson: "",
    department: "",
    project: "",
    refDoc: "",
    linkJournal: true,
    paymentTerms: "",
    attachedUrl: "",
    withholdingTax: "0",
    discountBeforeVat: "0",
    docPrefix: "RE",
    saveToContacts: false,
    currencyCode: "THB",
    exchangeRate: "1",
    sellerBranchId: selectedCompany?.sellerBranchId || "00000",
  });
  const [customerSearch, setCustomerSearch] = useState<string | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerCodeSearch, setCustomerCodeSearch] = useState<string | null>(null);
  const [showCustomerCodeDropdown, setShowCustomerCodeDropdown] = useState(false);
  const [items, setItems] = useState<ReceiptItemForm[]>([emptyItem()]);
  const [productSearches, setProductSearches] = useState<Record<number, string>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<Record<number, boolean>>({});
  const [editingPriceIdx, setEditingPriceIdx] = useState<number | null>(null);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [loaded, setLoaded] = useState(false);
  const [receiptLinkedDocs, setReceiptLinkedDocs] = useState<any[]>([]);

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
  const receiveMethods = paymentMethodsList.filter((m: any) => m.active !== false && (m.paymentType || "receive") === "receive");
  const activePaymentMethods = receiveMethods.length > 0 ? receiveMethods : paymentMethodsList.filter((m: any) => m.active !== false);

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
        setForm(p => ({ ...p, paymentMethod: defaultPm.name }));
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
  const { prefixOptions, defaultPrefix } = usePrefixOptions("receipt", docSettings);
  useEffect(() => {
    if (isNew && defaultPrefix && form.docPrefix !== defaultPrefix) {
      setForm(p => ({ ...p, docPrefix: defaultPrefix }));
    }
  }, [defaultPrefix, isNew]);

  useEffect(() => {
    if (isNew && activePaymentMethods.length > 0 && (form.paymentMethod === "transfer" || form.paymentMethod === "")) {
      const defaultMethod = activePaymentMethods.find((m: any) => m.isDefault) || activePaymentMethods[0];
      if (defaultMethod) {
        setForm(p => ({ ...p, paymentMethod: defaultMethod.accountCode }));
      }
    }
  }, [activePaymentMethods, isNew, form.paymentMethod]);

  const searchString = useSearch();
  const receiptSearchParams = isNew ? new URLSearchParams(searchString) : null;
  const fromInvoiceId = receiptSearchParams?.get("fromInvoice") || null;
  const fromTaxInvoiceId = receiptSearchParams?.get("fromTaxInvoice") || null;
  const fromQuotationId = receiptSearchParams?.get("fromQuotation") || null;
  const copyFromId = receiptSearchParams?.get("copyFrom") || null;

  useEffect(() => {
    if (loaded) return;
    if (isNew && fromInvoiceId) {
      (async () => {
        try {
          const res = await fetch(`/api/invoices/${fromInvoiceId}`, { credentials: "include" });
          if (res.ok) {
            const inv = await res.json();
            setPriceMode(inv.priceMode || "excluded");
            setForm(prev => ({
              ...prev,
              receiptNo: "",
              receiptDate: toLocalDateStr(new Date()),
              paymentDate: toLocalDateStr(new Date()),
              customerId: inv.customerId || undefined,
              customerCode: inv.customerCode || "",
              customerName: inv.customerName || "",
              customerAddress: inv.customerAddress || "",
              customerTaxId: inv.customerTaxId || "",
              branch: inv.branch || "",
              contactPerson: inv.contactPerson || "",
              contactPhone: inv.contactPhone || "",
              contactEmail: inv.contactEmail || "",
              creditDays: inv.creditDays ? String(inv.creditDays) : "",
              salesperson: inv.salesperson || "",
              department: inv.department || "",
              project: inv.project || "",
              refDoc: inv.invoiceNo || "",
              withholdingTax: String(inv.withholdingTax || "0"),
              discountBeforeVat: inv.discountType === "percent" ? `${cleanDecimal(inv.discountAmount, "0")}%` : cleanDecimal(inv.discountAmount, "0"),
              paymentMethod: inv.paymentMethod || "",
              paymentTerms: inv.paymentTerms || "",
              notes: inv.notes || "",
              currencyCode: inv.currencyCode || "THB",
              exchangeRate: String(inv.exchangeRate || "1"),
            }));
            if (inv.discountType === "percent") setDiscountMode("percent");
            if (inv.items && inv.items.length > 0) {
              setItems(inv.items.map((it: any) => ({
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
    } else if (isNew && fromQuotationId) {
      (async () => {
        try {
          const res = await fetch(`/api/quotations/${fromQuotationId}`, { credentials: "include" });
          if (res.ok) {
            const qo = await res.json();
            setPriceMode(qo.priceMode || "excluded");
            setForm(prev => ({
              ...prev,
              receiptNo: "",
              receiptDate: toLocalDateStr(new Date()),
              paymentDate: toLocalDateStr(new Date()),
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
            if (qo.discountType === "percent") setDiscountMode("percent");
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
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew && fromTaxInvoiceId) {
      (async () => {
        try {
          const res = await fetch(`/api/tax-invoices/${fromTaxInvoiceId}`, { credentials: "include" });
          if (res.ok) {
            const tx = await res.json();
            setPriceMode(tx.priceMode || "excluded");
            setForm(prev => ({
              ...prev,
              receiptNo: "",
              receiptDate: toLocalDateStr(new Date()),
              paymentDate: toLocalDateStr(new Date()),
              customerId: tx.customerId || undefined,
              customerCode: tx.customerCode || "",
              customerName: tx.customerName || "",
              customerAddress: tx.customerAddress || "",
              customerTaxId: tx.customerTaxId || "",
              branch: tx.branch || "",
              contactPerson: tx.contactPerson || "",
              contactPhone: tx.contactPhone || "",
              contactEmail: tx.contactEmail || "",
              creditDays: tx.creditDays ? String(tx.creditDays) : "",
              salesperson: tx.salesperson || "",
              department: tx.department || "",
              project: tx.project || "",
              refDoc: tx.taxInvoiceNo || "",
              withholdingTax: String(tx.withholdingTax || "0"),
              discountBeforeVat: tx.discountType === "percent" ? `${cleanDecimal(tx.discountAmount, "0")}%` : cleanDecimal(tx.discountAmount, "0"),
              paymentTerms: tx.paymentTerms || "",
              notes: tx.notes || "",
              currencyCode: tx.currencyCode || "THB",
              exchangeRate: String(tx.exchangeRate || "1"),
            }));
            if (tx.discountType === "percent") setDiscountMode("percent");
            if (tx.items && tx.items.length > 0) {
              setItems(tx.items.map((it: any) => ({
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
          const res = await fetch(`/api/receipts/${copyFromId}`, { credentials: "include" });
          if (res.ok) {
            const src = await res.json();
            setPriceMode(src.priceMode || "excluded");
            setForm(prev => ({
              ...prev, receiptNo: "", receiptDate: toLocalDateStr(new Date()),
              paymentDate: toLocalDateStr(new Date()),
              customerId: src.customerId || undefined, customerCode: src.customerCode || "",
              customerName: src.customerName || "", customerAddress: src.customerAddress || "",
              customerTaxId: src.customerTaxId || "", branch: src.branch || "",
              contactPerson: src.contactPerson || "", contactPhone: src.contactPhone || "",
              contactEmail: src.contactEmail || "", creditDays: src.creditDays ? String(src.creditDays) : "",
              notes: src.notes || "", internalNotes: src.internalNotes || "",
              status: "completed",
              withholdingTax: String(src.withholdingTax || "0"),
              discountBeforeVat: src.discountType === "percent" ? `${cleanDecimal(src.discountAmount, "0")}%` : cleanDecimal(src.discountAmount, "0"),
              docPrefix: src.docPrefix || "RE",
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
        receiptNo: "",
        paymentDate: toLocalDateStr(new Date()),
      }));
      setLoaded(true);
    } else if (editingId) {
      (async () => {
        try {
          const res = await fetch(`/api/receipts/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setPriceMode(data.priceMode || "excluded");
            setForm({
              receiptNo: data.receiptNo || "",
              receiptDate: data.receiptDate || "",
              paymentDate: data.paymentDate || "",
              paymentMethod: data.paymentMethod || "transfer",
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
              status: data.status || "completed",
              salesperson: data.salesperson || "",
              department: data.department || "",
              project: data.project || "",
              refDoc: data.refDoc || "",
              linkJournal: data.linkJournal ?? true,
              paymentTerms: data.paymentTerms || "",
              attachedUrl: data.attachedUrl || "",
              withholdingTax: String(data.withholdingTax || "0"),
              discountBeforeVat: data.discountType === "percent" ? `${cleanDecimal(data.discountAmount, "0")}%` : cleanDecimal(data.discountAmount, "0"),
              docPrefix: data.docPrefix || "RE",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              sellerBranchId: data.sellerBranchId || selectedCompany?.sellerBranchId || "00000",
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
                warehouseId: it.warehouseId || undefined,
              })));
            }
            if (data.linkedDocs && data.linkedDocs.length > 0) {
              setReceiptLinkedDocs(data.linkedDocs);
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
      const res = await apiRequest("POST", "/api/receipts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-invoices"] });
      toast({ title: "สร้างใบเสร็จรับเงินสำเร็จ", variant: "success" as any });
      navigate("/sales/receipt");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/receipts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-invoices"] });
      toast({ title: "อัพเดทใบเสร็จรับเงินสำเร็จ", variant: "success" as any });
      navigate("/sales/receipt");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  function handleCustomerSelect(contactId: string) {
    const c = contacts.find(ct => ct.id === Number(contactId));
    if (c) {
      setForm(prev => {
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
      receiptNo: form.receiptNo,
      receiptDate: toLocalDateStr(new Date()),
      paymentDate: toLocalDateStr(new Date()),
      paymentMethod: activePaymentMethods.find((m: any) => m.isDefault)?.accountCode || activePaymentMethods[0]?.accountCode || "transfer",
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
      notes: "",
      internalNotes: "",
      status: "completed",
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
      invoiceId: fromInvoiceId ? Number(fromInvoiceId) : (form as any).invoiceId || null,
      taxInvoiceId: fromTaxInvoiceId ? Number(fromTaxInvoiceId) : (form as any).taxInvoiceId || null,
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
  const isLocked = !isNew && ["issued", "cancelled", "voided"].includes(form.status);

  return (
    <Layout>
      <div className="space-y-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/sales/receipt")}>ใบเสร็จรับเงิน (RE)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? (isLocked ? "ดูใบเสร็จรับเงิน" : "แก้ไขใบเสร็จรับเงิน") : "สร้างใบเสร็จรับเงิน"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/sales/receipt")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? (isLocked ? "ดูใบเสร็จรับเงิน" : "แก้ไขใบเสร็จรับเงิน") : "สร้างใบเสร็จรับเงิน"}
          </h1>
        </div>

        {isLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>เอกสารนี้มีสถานะ <strong>{form.status === "issued" ? "ออกแล้ว" : form.status === "cancelled" ? "ยกเลิกแล้ว" : "ยกเลิก (Void)"}</strong> ไม่สามารถแก้ไขได้</span>
          </div>
        )}

        <div className={`bg-white border rounded-lg shadow-sm ${isLocked ? "opacity-80" : ""}`}>
          <fieldset disabled={isLocked} className="p-2 sm:p-4 space-y-4">
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

                  {/* Row 2: ชื่อคู่ค้า(4) | สาขา(2) | วันที่ออกใบเสร็จ(2) */}
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
                      <div className="text-[10px] text-slate-400 mb-0.5">วันที่ออกใบเสร็จ</div>
                      <DatePicker data-testid="input-receipt-date" value={form.receiptDate} onChange={v => setForm(p => ({ ...p, receiptDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                    </td>
                  </tr>

                  {/* Row 3: ที่อยู่(4) | เลขผู้เสียภาษี+เครดิต stacked(2) | วันที่ชำระเงิน(2) */}
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
                      <div className="text-[10px] text-slate-400 mb-0.5">วันที่ชำระเงิน</div>
                      <DatePicker data-testid="input-payment-date" value={form.paymentDate} onChange={v => setForm(p => ({ ...p, paymentDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                    </td>
                  </tr>

                  {/* Row 4: อีเมล์(2) | โทรศัพท์(2) | วิธีชำระเงิน(2, bg-amber) | เลขที่ใบเสร็จ(2) */}
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
                          const found = activePaymentMethods.find((m: any) => m.accountCode === pm && m.isDefault)
                            || activePaymentMethods.find((m: any) => m.accountCode === pm);
                          return found ? `pm_${found.id}` : pm;
                        })()}
                        onValueChange={v => {
                          const pm = activePaymentMethods.find((m: any) => `pm_${m.id}` === v);
                          setForm(p => ({ ...p, paymentMethod: pm ? pm.accountCode : v }));
                        }}
                      >
                        <SelectTrigger data-testid="select-payment-method" className="h-7 text-xs border-dashed border-amber-300 bg-white focus:border-amber-500 focus:ring-amber-200">
                          <SelectValue placeholder="เลือกวิธีรับเงิน" />
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
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่ใบเสร็จรับเงิน</div>
                      <div className="flex items-center gap-1">
                        <Select value={form.docPrefix} onValueChange={v => setForm(p => ({ ...p, docPrefix: v }))}>
                          <SelectTrigger data-testid="select-doc-prefix" className="h-7 text-xs w-[60px] border-dashed px-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {prefixOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Input data-testid="input-receipt-no" value={form.receiptNo} onChange={e => setForm(p => ({ ...p, receiptNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
                      </div>
                    </td>
                  </tr>

                  <tr className="border-b border-slate-300">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">พนักงานขาย</div>
                      <Input data-testid="input-salesperson" list="emp-list-rc" value={form.salesperson} onChange={e => setForm(p => ({ ...p, salesperson: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="เลือกหรือพิมพ์ชื่อ" />
                      <datalist id="emp-list-rc">
                        {employeeNames.map(e => <option key={e.id} value={e.name} />)}
                      </datalist>
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">แผนก / โครงการ</div>
                      <div className="flex items-center gap-1">
                        <Input data-testid="input-department" list="dept-list-rc" value={form.department} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="เลือกหรือพิมพ์แผนก" />
                        <datalist id="dept-list-rc">
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
                            <FetchRateButton currency={form.currencyCode} date={form.receiptDate} onRate={r => setForm(p => ({ ...p, exchangeRate: String(r) }))} rateType="buying_transfer" />
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
                        <Button data-testid={`button-duplicate-item-${idx}`} variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-white hover:bg-[#539BFF]" onClick={() => duplicateItem(idx)} title="คัดลอกแถว">
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
                    testIdPrefix="receipt-attachment"
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

            <div className="mt-4">
              <JournalPreviewPanel
                companyId={companyId ?? null}
                documentType="receipt"
                subtotal={totals.afterDiscount?.toFixed(2) || "0"}
                vatAmount={totals.vatAmount?.toFixed(2) || "0"}
                withholdingTax={totals.withholdingTax?.toFixed(2) || "0"}
                paymentMethod={form.paymentMethod}
                currencyCode={form.currencyCode}
                exchangeRate={form.exchangeRate}
                linkedInvoiceId={fromInvoiceId ? Number(fromInvoiceId) : (fromTaxInvoiceId ? Number(fromTaxInvoiceId) : ((form as any).invoiceId || (form as any).taxInvoiceId || receiptLinkedDocs[0]?.docId || null))}
                              onLinesChange={setJournalOverrideLines}
              />
            </div>

            <div className="flex items-center justify-center gap-3 pt-4 border-t">
              <Button data-testid="button-reset" variant="outline" size="sm" className="h-9 px-6 gap-1.5" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" /> รีเซ็ต
              </Button>
              {editingId && companyId && (
                <AutoJournalButton
                  documentType="receipt"
                  documentId={editingId}
                  companyId={companyId}
                  disabled={isSaving}
                />
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
          </fieldset>
        </div>
      </div>
      <RelatedDocuments docType="receipt" docId={savedId || editingId} />
    </Layout>
  );
}
