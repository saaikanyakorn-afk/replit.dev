import { useState, useEffect } from "react";
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
  RotateCcw, Copy, AlertCircle, CheckCircle2, XCircle, CheckCircle
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker, toDisplayDate } from "@/components/ui/date-picker";
import type { DateFormat } from "@/components/ui/date-picker";
import type { Contact, Product } from "@shared/schema";
import { toLocalDateStr } from "@/lib/utils";

import { useDateSettings } from "@/hooks/use-date-settings";
interface BidItemForm {
  productId?: number;
  productCode: string;
  productName: string;
  description: string;
  qty: string;
  unit: string;
}

interface BidVendorForm {
  vendorName: string;
  price: string;
  remark: string;
  selected: boolean;
}

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const emptyItem = (): BidItemForm => ({
  productCode: "",
  productName: "",
  description: "",
  qty: "1",
  unit: "ชิ้น",
});

const emptyVendor = (): BidVendorForm => ({
  vendorName: "",
  price: "0",
  remark: "",
  selected: false,
});

export default function BidComparison() {
  const [, navigate] = useLocation();
  const [matchNew] = useRoute("/purchases/bid/new");
  const [matchEdit, paramsEdit] = useRoute("/purchases/bid/edit/:id");
  const editingId = matchEdit ? Number(paramsEdit?.id) : null;
  const isNew = !!matchNew;

  const searchString = useSearch();
  const bidSearchParams = isNew ? new URLSearchParams(searchString) : null;
  const fromPRId = bidSearchParams?.get("fromPR") || null;
  const copyFromId = bidSearchParams?.get("copyFrom") || null;

  const { selectedCompany } = useCompany();
  const { branchList } = useDocDropdowns();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    bidNo: "",
    bidDate: toLocalDateStr(new Date()),
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
    docPrefix: "BID",
    saveToContacts: false,
    currencyCode: "THB",
    exchangeRate: "1",
    vendorId: undefined as number | undefined,
  });

  const [vendorSearch, setVendorSearch] = useState<string | null>(null);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [vendorCodeSearch, setVendorCodeSearch] = useState<string | null>(null);
  const [showVendorCodeDropdown, setShowVendorCodeDropdown] = useState(false);
  const [items, setItems] = useState<BidItemForm[]>([emptyItem()]);
  const [bidVendors, setBidVendors] = useState<BidVendorForm[]>([emptyVendor(), emptyVendor(), emptyVendor()]);
  const [productSearches, setProductSearches] = useState<Record<number, string>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<Record<number, boolean>>({});
  const [loaded, setLoaded] = useState(false);

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
              bidNo: "",
              bidDate: toLocalDateStr(new Date()),
              vendorId: pr.vendorId || undefined,
              vendorCode: pr.vendorCode || "",
              vendorName: pr.vendorName || "",
              vendorAddress: pr.vendorAddress || "",
              vendorTaxId: pr.vendorTaxId || "",
              branch: pr.branch || "",
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
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else if (isNew && copyFromId) {
      (async () => {
        try {
          const res = await fetch(`/api/bid-comparisons/${copyFromId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setForm({
              bidNo: "",
              bidDate: toLocalDateStr(new Date()),
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
              docPrefix: data.docPrefix || "BID",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              vendorId: data.vendorId || undefined,
            });
            if (data.items && data.items.length > 0) {
              setItems(data.items.map((it: any) => ({
                productId: it.productId,
                productCode: it.productCode || "",
                productName: it.productName || "",
                description: it.description || "",
                qty: String(it.qty || "1"),
                unit: it.unit || "ชิ้น",
              })));
            }
            if (data.vendors && data.vendors.length > 0) {
              setBidVendors(data.vendors.map((v: any) => ({
                vendorName: v.vendorName || "",
                price: String(v.price || "0"),
                remark: v.remark || "",
                selected: false,
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
          const res = await fetch(`/api/bid-comparisons/${editingId}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            setForm({
              bidNo: data.bidNo || "",
              bidDate: data.bidDate || "",
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
              docPrefix: data.docPrefix || "BID",
              saveToContacts: false,
              currencyCode: data.currencyCode || "THB",
              exchangeRate: String(data.exchangeRate || "1"),
              vendorId: data.vendorId || undefined,
            });
            if (data.items && data.items.length > 0) {
              setItems(data.items.map((it: any) => ({
                productId: it.productId,
                productCode: it.productCode || "",
                productName: it.productName || "",
                description: it.description || "",
                qty: String(it.qty || "1"),
                unit: it.unit || "ชิ้น",
              })));
            }
            if (data.vendors && data.vendors.length > 0) {
              setBidVendors(data.vendors.map((v: any) => ({
                vendorName: v.vendorName || "",
                price: String(v.price || "0"),
                remark: v.remark || "",
                selected: v.selected || false,
              })));
            }
          }
        } catch {}
        setLoaded(true);
      })();
    } else {
      setLoaded(true);
    }
  }, [isNew, editingId, companyId, loaded, fromPRId]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/bid-comparisons", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-comparisons"] });
      toast({ title: "สร้างเปรียบเทียบราคาสำเร็จ", variant: "success" as any });
      navigate("/purchases/bid");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/bid-comparisons/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-comparisons"] });
      toast({ title: "อัพเดทเปรียบเทียบราคาสำเร็จ", variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/bid-comparisons/${id}`, { status });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-comparisons"] });
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

  function handleProductSelect(idx: number, productId: string) {
    const p = products.find(pr => pr.id === Number(productId));
    if (p) {
      const newItems = [...items];
      newItems[idx] = {
        ...newItems[idx],
        productId: p.id,
        productCode: p.code || "",
        productName: p.name,
        unit: p.unit || "ชิ้น",
      };
      setItems(newItems);
    }
  }

  function updateItem(idx: number, field: string, value: string) {
    const newItems = [...items];
    (newItems[idx] as any)[field] = value;
    setItems(newItems);
  }

  function addItem() { setItems([...items, emptyItem()]); }
  function removeItem(idx: number) {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  }

  function updateVendor(idx: number, field: string, value: any) {
    const newVendors = [...bidVendors];
    if (field === "selected") {
      newVendors.forEach((v, i) => { v.selected = i === idx; });
    } else {
      (newVendors[idx] as any)[field] = value;
    }
    setBidVendors(newVendors);
  }

  function addVendor() { setBidVendors([...bidVendors, emptyVendor()]); }
  function removeVendor(idx: number) {
    if (bidVendors.length === 1) return;
    setBidVendors(bidVendors.filter((_, i) => i !== idx));
  }

  function handleReset() {
    setForm(prev => ({
      ...prev,
      bidDate: toLocalDateStr(new Date()),
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
    }));
    setItems([emptyItem()]);
    setBidVendors([emptyVendor(), emptyVendor(), emptyVendor()]);
  }

  async function handleSubmit() {
    const payload = {
      companyId,
      bidNo: form.bidNo,
      bidDate: form.bidDate,
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
      docPrefix: form.docPrefix,
      notes: form.notes,
      status: form.status,
      saveToContacts: form.saveToContacts,
      salesperson: form.salesperson,
      department: form.department,
      project: form.project,
      refDoc: form.refDoc,
      currencyCode: form.currencyCode,
      exchangeRate: form.exchangeRate,
      items: items.filter(it => it.productName).map(it => ({
        productId: it.productId || null,
        productCode: it.productCode,
        productName: it.productName,
        description: it.description,
        qty: it.qty,
        unit: it.unit,
      })),
      vendors: bidVendors.filter(v => v.vendorName).map(v => ({
        vendorName: v.vendorName,
        price: v.price,
        remark: v.remark,
        selected: v.selected,
      })),
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isLocked = !isNew && ["pending_approval", "paid", "cancelled"].includes(form.status);

  return (
    <Layout>
      <div className="space-y-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span className="cursor-pointer hover:text-[var(--theme-primary)]" onClick={() => navigate("/purchases/bid")}>เปรียบเทียบราคา (BID)</span>
          <span>/</span>
          <span className="text-foreground font-medium">{editingId ? (isLocked ? "ดูเปรียบเทียบราคา" : "แก้ไขเปรียบเทียบราคา") : "สร้างเปรียบเทียบราคา"}</span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Button data-testid="button-back" variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/purchases/bid")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <FileText className="h-5 w-5 text-[var(--theme-primary)]" />
          <h1 className="text-xl font-heading font-medium" data-testid="text-page-title">
            {editingId ? (isLocked ? "ดูเปรียบเทียบราคา" : "แก้ไขเปรียบเทียบราคา") : "สร้างเปรียบเทียบราคา"}
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
                  <col style={{width:"10%"}} />
                  <col style={{width:"28%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"12%"}} />
                </colgroup>
                <tbody>
                  <tr className="border-b">
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

                  <tr className="border-b">
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
                    <td className="px-3 pt-1.5 pb-1 border-r align-top">
                      <div className="text-[10px] text-slate-400 mb-0.5">สาขา</div>
                      <Input data-testid="input-branch" value={form.branch || ""} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} className="h-7 text-xs border-dashed" placeholder="สำนักงานใหญ่" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={3}>
                      <div className="text-[10px] text-slate-400 mb-0.5">วันที่เปรียบเทียบราคา</div>
                      <DatePicker data-testid="input-bid-date" value={form.bidDate} onChange={v => setForm(p => ({ ...p, bidDate: v }))} dateFormat={dateFmt} dateEra={dateEra} className="w-full" />
                    </td>
                  </tr>

                  <tr className="border-b">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={4}>
                      <div className="text-[10px] text-slate-400 mb-0.5">ที่อยู่</div>
                      <Textarea data-testid="input-address" value={form.vendorAddress} onChange={e => setForm(p => ({ ...p, vendorAddress: e.target.value }))} rows={2} className="text-xs resize-none border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">#เครดิต (วัน)</div>
                      <Input data-testid="input-credit-days" inputMode="numeric" value={form.creditDays || ""} onChange={e => { const v = e.target.value; if (/^\d*$/.test(v)) setForm(p => ({ ...p, creditDays: v })); }} className="h-7 text-xs border-dashed" placeholder="0" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขที่เอกสาร</div>
                      <div className="flex items-center gap-1">
                        <Select value={form.docPrefix} onValueChange={v => setForm(p => ({ ...p, docPrefix: v }))}>
                          <SelectTrigger data-testid="select-doc-prefix" className="h-7 text-xs w-[60px] border-dashed px-1.5">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BID">BID</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input data-testid="input-bid-no" value={form.bidNo} onChange={e => setForm(p => ({ ...p, bidNo: e.target.value }))} className="h-7 text-xs border-dashed flex-1" placeholder="AUTO" />
                      </div>
                    </td>
                  </tr>

                  <tr className="border-b">
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">อีเมล์</div>
                      <Input data-testid="input-email" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">โทรศัพท์</div>
                      <Input data-testid="input-phone" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 border-r align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">เลขประจำตัวผู้เสียภาษี</div>
                      <Input data-testid="input-tax-id" value={form.vendorTaxId} onChange={e => setForm(p => ({ ...p, vendorTaxId: e.target.value }))} className="h-7 text-xs border-dashed" />
                    </td>
                    <td className="px-3 pt-1.5 pb-1 align-top" colSpan={2}>
                      <div className="text-[10px] text-slate-400 mb-0.5">สกุลเงิน</div>
                      <Select value={form.currencyCode} onValueChange={v => setForm(p => ({ ...p, currencyCode: v }))}>
                        <SelectTrigger className="h-7 text-xs border-dashed px-1.5">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="THB">THB</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                        </SelectContent>
                      </Select>
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
                  <col style={{width:"4%"}} />
                  <col style={{width:"15%"}} />
                  <col style={{width:"auto"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"10%"}} />
                  <col style={{width:"6%"}} />
                </colgroup>
                <thead>
                  <tr className="bg-[var(--theme-primary)]">
                    <th className="text-center font-medium text-white text-xs py-2 px-1">#</th>
                    <th className="font-medium text-white text-xs py-2 px-1">รหัส</th>
                    <th className="font-medium text-white text-xs py-2 px-1">สินค้า/บริการ</th>
                    <th className="text-center font-medium text-white text-xs py-2 px-1">จำนวน</th>
                    <th className="text-center font-medium text-white text-xs py-2 px-1">หน่วย</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-b group" data-testid={`row-item-${idx}`}>
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
                        <Input data-testid={`input-item-unit-${idx}`} value={item.unit} onChange={e => updateItem(idx, "unit", e.target.value)} className="h-7 text-xs border-dashed text-center" />
                      </td>
                      <td className="py-1 px-1">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
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

            <div className="border rounded overflow-visible">
              <table className="w-full text-sm" style={{tableLayout:"fixed"}}>
                <colgroup>
                  <col style={{width:"4%"}} />
                  <col style={{width:"auto"}} />
                  <col style={{width:"15%"}} />
                  <col style={{width:"30%"}} />
                  <col style={{width:"6%"}} />
                  <col style={{width:"6%"}} />
                </colgroup>
                <thead>
                  <tr className="bg-[var(--theme-primary)]">
                    <th className="text-center font-medium text-white text-xs py-2 px-1">#</th>
                    <th className="font-medium text-white text-xs py-2 px-1">ชื่อผู้ขาย</th>
                    <th className="text-right font-medium text-white text-xs py-2 px-1">ราคาเสนอ</th>
                    <th className="font-medium text-white text-xs py-2 px-1">หมายเหตุ</th>
                    <th className="text-center font-medium text-white text-xs py-2 px-1">เลือก</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bidVendors.map((vendor, idx) => (
                    <tr key={idx} className="border-b group" data-testid={`row-vendor-${idx}`}>
                      <td className="text-center text-xs py-1 px-1 text-slate-400">{idx + 1}</td>
                      <td className="py-1 px-1">
                        <Input data-testid={`input-vendor-name-${idx}`} value={vendor.vendorName} onChange={e => updateVendor(idx, "vendorName", e.target.value)} className="h-7 text-xs border-dashed" placeholder="ชื่อผู้ขาย" />
                      </td>
                      <td className="py-1 px-1">
                        <Input data-testid={`input-vendor-price-${idx}`} value={vendor.price} onChange={e => updateVendor(idx, "price", e.target.value)} className="h-7 text-xs border-dashed text-right" />
                      </td>
                      <td className="py-1 px-1">
                        <Input data-testid={`input-vendor-remark-${idx}`} value={vendor.remark} onChange={e => updateVendor(idx, "remark", e.target.value)} className="h-7 text-xs border-dashed" placeholder="หมายเหตุ" />
                      </td>
                      <td className="py-1 px-1 text-center">
                        <button
                          data-testid={`button-select-vendor-${idx}`}
                          onClick={() => updateVendor(idx, "selected", true)}
                          className={`p-1 rounded ${vendor.selected ? "text-green-600 bg-green-50" : "text-slate-300 hover:text-green-500"}`}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      </td>
                      <td className="py-1 px-1">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <button onClick={() => removeVendor(idx)} className="p-1 hover:bg-red-50 rounded" title="ลบ"><Trash2 className="h-3 w-3 text-red-400" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-2 py-1 border-t">
                <button data-testid="button-add-vendor" onClick={addVendor} className="flex items-center gap-1.5 text-sm text-green-600 hover:text-green-700 font-medium px-2 py-1.5 hover:bg-green-50 rounded">
                  <Plus className="h-4 w-4" /> เพิ่มผู้ขาย
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-slate-400 mb-1">หมายเหตุ</div>
              <Textarea data-testid="input-notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="text-xs resize-none border-dashed" placeholder="หมายเหตุ..." />
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
        </div>
      </div>
    </Layout>
  );
}
