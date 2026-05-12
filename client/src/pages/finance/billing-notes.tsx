import { useState, useMemo, useRef, useEffect } from "react";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FileText, Search, DollarSign, Clock, AlertTriangle, CheckCircle, Users, CreditCard, Loader2, Receipt, ChevronDown, ChevronRight, Link2, Plus, ArrowLeft, X, CalendarDays, Printer, Pencil, Trash2, Send, MoreHorizontal, Copy, FileCheck, BookOpen, ExternalLink } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import RelatedDocsDialog from "@/components/related-docs-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { formatDate } from "@/lib/format";
import { apiRequest, getShareBaseUrl } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ThaiDateInput from "@/components/thai-date-input";
import { toLocalDateStr } from "@/lib/utils";
import LineSendDialog from "@/components/line-send-dialog";

import { useDateSettings } from "@/hooks/use-date-settings";
function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function billingStatusBadge(status: string) {
  switch (status) {
    case "paid": return <Badge className="text-[10px] bg-green-100 text-green-700 border-0"><CheckCircle className="h-3 w-3 mr-0.5" />ชำระแล้ว</Badge>;
    case "invoiced": return <Badge className="text-[10px] bg-purple-100 text-purple-700 border-0"><FileCheck className="h-3 w-3 mr-0.5" />ออกใบกำกับแล้ว</Badge>;
    case "approved": return <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0"><CheckCircle className="h-3 w-3 mr-0.5" />อนุมัติ</Badge>;
    case "cancelled": return <Badge className="text-[10px] bg-red-100 text-red-700 border-0"><X className="h-3 w-3 mr-0.5" />ยกเลิก</Badge>;
    case "draft": return <Badge className="text-[10px] bg-gray-100 text-gray-700 border-0"><Clock className="h-3 w-3 mr-0.5" />ร่าง</Badge>;
    case "unpaid": return <Badge className="text-[10px] bg-red-100 text-red-700 border-0"><AlertTriangle className="h-3 w-3 mr-0.5" />ยังไม่ชำระ</Badge>;
    default: return <Badge className="text-[10px] bg-gray-100 text-gray-700 border-0"><Clock className="h-3 w-3 mr-0.5" />{status || "ร่าง"}</Badge>;
  }
}

function paymentStatusBadge(ps: string) {
  switch (ps) {
    case "paid": return <Badge className="text-[10px] bg-green-100 text-green-700 border-0"><CheckCircle className="h-3 w-3 mr-0.5" />ชำระแล้ว</Badge>;
    case "partial": return <Badge className="text-[10px] bg-yellow-100 text-yellow-700 border-0"><Clock className="h-3 w-3 mr-0.5" />ชำระบางส่วน</Badge>;
    default: return <Badge className="text-[10px] bg-red-100 text-red-700 border-0"><AlertTriangle className="h-3 w-3 mr-0.5" />ยังไม่ชำระ</Badge>;
  }
}

export default function BillingNotes() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"list" | "create">("list");
  const [searchBilling, setSearchBilling] = useState("");
  const [expandedNotes, setExpandedNotes] = useState<Set<number>>(new Set());

  const [customerSearch, setCustomerSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [billingDate, setBillingDate] = useState(() => toLocalDateStr(new Date()));
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return toLocalDateStr(d);
  });
  const [billingNotes, setBillingNotes] = useState("");
  const [billingWhtRate, setBillingWhtRate] = useState("");
  const [billingWht, setBillingWht] = useState(""); // computed amount (ไม่ใช้ input แล้ว แต่เก็บไว้)
  const [docTypeFilter, setDocTypeFilter] = useState<"IV" | "TIV">("IV");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptBillingNote, setReceiptBillingNote] = useState<any>(null);
  const [receiptPayMethod, setReceiptPayMethod] = useState("");
  const [receiptPayDate, setReceiptPayDate] = useState(() => toLocalDateStr(new Date()));
  const [receiptWht, setReceiptWht] = useState("");
  const receiptWhtAmt = useMemo(() => {
    const rate = parseFloat(receiptWht) || 0;
    if (rate <= 0 || !receiptBillingNote) return 0;
    const base = parseFloat(String(receiptBillingNote.linkedSubtotal));
    if (isNaN(base) || base <= 0) throw new Error(`receiptWhtAmt: billing note id=${receiptBillingNote.id} is missing linkedSubtotal — cannot calculate WHT`);
    return Math.round(rate / 100 * base * 100) / 100;
  }, [receiptWht, receiptBillingNote]);
  const [receiptNotes, setReceiptNotes] = useState("");

  const [tivDialogOpen, setTivDialogOpen] = useState(false);
  const [tivBillingNote, setTivBillingNote] = useState<any>(null);
  const [tivDate, setTivDate] = useState(() => toLocalDateStr(new Date()));
  const [tivNotes, setTivNotes] = useState("");
  const [tivPayMethod, setTivPayMethod] = useState("");
  const [tivWht, setTivWht] = useState("");
  const tivWhtAmt = useMemo(() => {
    const rate = parseFloat(tivWht) || 0;
    if (rate <= 0 || !tivBillingNote) return 0;
    const base = parseFloat(String(tivBillingNote.linkedSubtotal));
    if (isNaN(base) || base <= 0) throw new Error(`tivWhtAmt: billing note id=${tivBillingNote.id} is missing linkedSubtotal — cannot calculate WHT`);
    return Math.round(rate / 100 * base * 100) / 100;
  }, [tivWht, tivBillingNote]);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editBn, setEditBn] = useState<any>(null);
  const [editBillingDate, setEditBillingDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editWhtRate, setEditWhtRate] = useState("");
  const [editWht, setEditWht] = useState(""); // computed amount

  const [relatedDocDialog, setRelatedDocDialog] = useState<{ open: boolean; id: number; docNo: string }>({ open: false, id: 0, docNo: "" });

  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendBn, setSendBn] = useState<any>(null);
  const [sendToEmail, setSendToEmail] = useState("");
  const [sendSubject, setSendSubject] = useState("");
  const [sendBody, setSendBody] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBn, setDeleteBn] = useState<any>(null);

  const [lineDialog, setLineDialog] = useState<{ open: boolean; url: string; docNo: string; customerName: string }>({ open: false, url: "", docNo: "", customerName: "" });

  const getBnPrimaryDocType = (bn: any): "IV" | "TIV" | "mixed" => {
    const docs = bn.linkedDocs || [];
    if (docs.length === 0) return "TIV";
    const hasIV = docs.some((d: any) => d.docType === "IV");
    const hasTIV = docs.some((d: any) => d.docType === "TIV");
    if (hasIV && hasTIV) return "mixed";
    if (hasIV) return "IV";
    return "TIV";
  };

  const { dateEra, dateFmt } = useDateSettings();
  const { data: docSettings } = useQuery<any>({
    queryKey: ["/api/document-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const r = await fetch(`/api/document-settings/${companyId}`, { credentials: "include" });
      return r.ok ? r.json() : null;
    },
    enabled: !!companyId,
  });
  const { data: billingData, isLoading: billingLoading } = useQuery<any>({
    queryKey: ["/api/finance/billing-notes", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const r = await fetch(`/api/finance/billing-notes?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
  });

  const billingNotesList: any[] = Array.isArray(billingData) ? billingData : [];

  const filteredNotes = useMemo(() => {
    if (!searchBilling) return billingNotesList;
    const s = searchBilling.toLowerCase();
    return billingNotesList.filter((bn: any) =>
      (bn.billingNo || "").toLowerCase().includes(s) ||
      (bn.customerName || "").toLowerCase().includes(s)
    );
  }, [billingNotesList, searchBilling]);

  const totalAmount = billingNotesList.reduce((s: number, bn: any) => s + (parseFloat(bn.totalAmount) || 0), 0);
  const unpaidCount = billingNotesList.filter((bn: any) => bn.status === "unpaid" || bn.paymentStatus === "unpaid").length;

  const { data: searchResults, isFetching: searchingCustomers } = useQuery<any>({
    queryKey: ["/api/finance/customer-outstanding", companyId, customerSearch],
    queryFn: async () => {
      if (!companyId || customerSearch.length < 1) return { contacts: [] };
      const r = await fetch(`/api/finance/customer-outstanding?companyId=${companyId}&q=${encodeURIComponent(customerSearch)}`, { credentials: "include" });
      return r.ok ? r.json() : { contacts: [] };
    },
    enabled: !!companyId && customerSearch.length >= 1 && !selectedContact,
  });

  const { data: outstandingData, isLoading: loadingDocs } = useQuery<any>({
    queryKey: ["/api/finance/customer-outstanding-docs", companyId, selectedContact?.id, selectedContact?.name],
    queryFn: async () => {
      if (!companyId || !selectedContact) return { documents: [] };
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (selectedContact.id) params.append("contactId", String(selectedContact.id));
      if (selectedContact.name) params.append("contactName", selectedContact.name);
      const r = await fetch(`/api/finance/customer-outstanding-docs?${params}`, { credentials: "include" });
      return r.ok ? r.json() : { documents: [] };
    },
    enabled: !!companyId && !!selectedContact,
  });

  const outstandingDocs: any[] = outstandingData?.documents || [];
  const filteredDocs = outstandingDocs.filter(d => d.docType === docTypeFilter);
  const ivCount = outstandingDocs.filter(d => d.docType === "IV").length;
  const tivCount = outstandingDocs.filter(d => d.docType === "TIV").length;

  const { data: paymentMethodsList } = useQuery<any[]>({
    queryKey: ["/api/payment-methods", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const r = await fetch(`/api/payment-methods?companyId=${companyId}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!companyId,
  });

  const createBillingNote = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch("/api/finance/billing-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "สร้างใบวางบิลสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/billing-notes", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/customer-outstanding-docs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      resetCreateForm();
      setMode("list");
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const createReceiptFromBN = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const r = await fetch(`/api/finance/billing-notes/${id}/create-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "สร้างใบรับเงินสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/billing-notes", companyId] });
      setReceiptDialogOpen(false);
      resetReceiptForm();
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const createTIVFromBN = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const r = await fetch(`/api/finance/billing-notes/${id}/create-tax-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "สร้างใบกำกับภาษีสำเร็จ", description: data.taxInvoice?.taxInvoiceNo });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/billing-notes", companyId] });
      setTivDialogOpen(false);
      setTivBillingNote(null);
      navigate(`/sales/tax-invoice?companyId=${companyId}`);
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const updateBillingNote = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const r = await fetch(`/api/finance/billing-notes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "แก้ไขใบวางบิลสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/billing-notes", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setEditDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const deleteBillingNote = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/finance/billing-notes/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "ลบใบวางบิลสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/billing-notes", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/customer-outstanding-docs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setDeleteConfirmOpen(false);
      setDeleteBn(null);
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const sendEmailBN = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      const r = await fetch(`/api/finance/billing-notes/${id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "เกิดข้อผิดพลาด"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "ส่งอีเมลสำเร็จ" });
      setSendDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const resetCreateForm = () => {
    setCustomerSearch("");
    setSelectedContact(null);
    setSelectedDocs(new Set());
    setBillingDate(toLocalDateStr(new Date()));
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setDueDate(toLocalDateStr(d));
    setBillingNotes("");
    setBillingWhtRate("");
    setBillingWht("");
  };

  const resetReceiptForm = () => {
    setReceiptBillingNote(null);
    setReceiptPayMethod("โอนเงิน");
    setReceiptPayDate(toLocalDateStr(new Date()));
    setReceiptWht("");
    setReceiptNotes("");
  };

  const docKey = (doc: any) => `${doc.docType}-${doc.id}`;

  const toggleDoc = (doc: any) => {
    const key = docKey(doc);
    const next = new Set(selectedDocs);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelectedDocs(next);
  };

  const toggleAll = () => {
    if (selectedDocs.size === filteredDocs.length && filteredDocs.length > 0) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(filteredDocs.map(docKey)));
    }
  };

  const selectedDocsList = useMemo(() => {
    return filteredDocs.filter(d => selectedDocs.has(docKey(d)));
  }, [filteredDocs, selectedDocs]);

  const selectedTotal = useMemo(() => {
    return selectedDocsList.reduce((s, d) => s + (parseFloat(d.totalAmount) || 0), 0);
  }, [selectedDocsList]);

  const selectedSubtotal = useMemo(() => {
    return selectedDocsList.reduce((sum, d) => {
      const sub = parseFloat((d as any).subtotal);
      if (isNaN(sub)) throw new Error(`selectedSubtotal: document ${(d as any).docNo ?? (d as any).id} is missing subtotal field`);
      return sum + sub;
    }, 0);
  }, [selectedDocsList]);

  const billingWhtAmount = useMemo(() => {
    const rate = parseFloat(billingWhtRate) || 0;
    if (rate <= 0 || selectedSubtotal <= 0) return 0;
    return Math.round(rate / 100 * selectedSubtotal * 100) / 100;
  }, [billingWhtRate, selectedSubtotal]);

  const submitBillingNote = () => {
    if (selectedDocsList.length === 0) return;
    createBillingNote.mutate({
      companyId,
      documents: selectedDocsList.map(d => ({
        docType: d.docType,
        docId: d.id,
        docNo: d.docNo,
        docDate: d.docDate,
        amount: d.totalAmount,
      })),
      billingDate,
      dueDate,
      notes: billingNotes,
      customerId: selectedContact?.id || null,
      customerName: selectedContact?.name || "",
      customerAddress: selectedContact?.address || null,
      customerTaxId: selectedContact?.taxId || null,
      whtRate: parseFloat(billingWhtRate) || 0,
      withholdingTax: billingWhtAmount,
      whtBase: selectedSubtotal,
    });
  };

  const openReceiptDialog = (bn: any) => {
    setReceiptBillingNote(bn);
    setReceiptPayMethod(paymentMethodsList?.[0]?.accountCode || "");
    setReceiptPayDate(toLocalDateStr(new Date()));
    setReceiptWht("");
    setReceiptNotes("");
    setReceiptDialogOpen(true);
  };

  const openTIVDialog = (bn: any) => {
    setTivBillingNote(bn);
    setTivDate(toLocalDateStr(new Date()));
    setTivNotes("");
    setTivPayMethod(paymentMethodsList?.[0]?.accountCode || "");
    setTivWht("");
    setTivDialogOpen(true);
  };

  const submitTIV = () => {
    if (!tivBillingNote) return;
    createTIVFromBN.mutate({
      id: tivBillingNote.id,
      payload: { taxInvoiceDate: tivDate, notes: tivNotes, paymentMethod: tivPayMethod, withholdingTax: tivWhtAmt },
    });
  };

  const submitReceipt = () => {
    if (!receiptBillingNote) return;
    createReceiptFromBN.mutate({
      id: receiptBillingNote.id,
      payload: {
        paymentMethod: receiptPayMethod,
        paymentDate: receiptPayDate,
        notes: receiptNotes,
        withholdingTax: receiptWhtAmt,
      },
    });
  };

  const selectContact = (contact: any) => {
    const resolvedAddress = contact.address || contact.buildingNumber || "";
    setSelectedContact({ ...contact, address: resolvedAddress });
    setCustomerSearch(contact.name);
    setShowDropdown(false);
    setSelectedDocs(new Set());
    setDocTypeFilter("IV");
  };

  const clearContact = () => {
    setSelectedContact(null);
    setCustomerSearch("");
    setSelectedDocs(new Set());
    setDocTypeFilter("IV");
  };

  const openEditDialog = (bn: any) => {
    setEditBn(bn);
    setEditBillingDate(bn.billingDate || toLocalDateStr(new Date()));
    setEditDueDate(bn.dueDate || "");
    setEditNotes(bn.notes || "");
    const rate = parseFloat(bn.whtRate ?? "0");
    setEditWhtRate(rate > 0 ? String(rate) : "");
    setEditDialogOpen(true);
  };

  const submitEdit = () => {
    if (!editBn) return;
    const rate = parseFloat(editWhtRate) || 0;
    let base = 0;
    if (rate > 0) {
      base = parseFloat(String(editBn.linkedSubtotal));
      if (isNaN(base) || base <= 0) throw new Error(`submitEdit: billing note id=${editBn.id} is missing linkedSubtotal — cannot calculate WHT`);
    }
    const whtAmt = rate > 0 && base > 0 ? Math.round(rate / 100 * base * 100) / 100 : 0;
    updateBillingNote.mutate({
      id: editBn.id,
      payload: { billingDate: editBillingDate, dueDate: editDueDate || null, notes: editNotes, whtRate: rate, withholdingTax: whtAmt, whtBase: base },
    });
  };

  const openSendDialog = (bn: any) => {
    setSendBn(bn);
    setSendToEmail(bn.customerEmail || "");
    setSendSubject(`ใบวางบิล ${bn.billingNo}`);
    setSendBody("");
    setSendDialogOpen(true);
  };

  const submitSend = () => {
    if (!sendBn) return;
    sendEmailBN.mutate({ id: sendBn.id, payload: { toEmail: sendToEmail, subject: sendSubject, body: sendBody || undefined } });
  };

  const toggleNoteExpand = (id: number) => {
    const next = new Set(expandedNotes);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedNotes(next);
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (mode === "create") {
    return (
      <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { resetCreateForm(); setMode("list"); }} data-testid="button-back-to-list">
            <ArrowLeft className="h-4 w-4 mr-1" />
            กลับ
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-800" data-testid="text-page-title">สร้างใบวางบิล</h1>
            <p className="text-sm text-muted-foreground">ค้นหาลูกค้าเพื่อดึงเอกสารค้างชำระ</p>
          </div>
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ค้นหาลูกค้า</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative" ref={dropdownRef}>
              {selectedContact ? (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <Users className="h-4 w-4 text-blue-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-sm font-semibold text-blue-800">{selectedContact.name}</span>
                      {selectedContact.code && (
                        <span className="text-xs text-blue-600">({selectedContact.code})</span>
                      )}
                      {selectedContact.taxId && (
                        <span className="text-xs text-blue-500">เลขนิติ: {selectedContact.taxId}</span>
                      )}
                    </div>
                    {selectedContact.address && (
                      <p className="text-xs text-blue-400 mt-0.5 leading-relaxed">{selectedContact.address}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={clearContact} data-testid="button-clear-contact">
                    <X className="h-4 w-4 text-blue-400" />
                  </Button>
                </div>
              ) : (
                <>
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="พิมพ์ชื่อลูกค้า, เลขนิติบุคคล, หรือรหัสลูกค้า..."
                    className="pl-10 h-11 text-sm"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => customerSearch.length >= 1 && setShowDropdown(true)}
                    data-testid="input-search-customer"
                  />
                  {showDropdown && customerSearch.length >= 1 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white rounded-lg shadow-lg border max-h-[300px] overflow-y-auto">
                      {searchingCustomers ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground ml-2">กำลังค้นหา...</span>
                        </div>
                      ) : (searchResults?.contacts || []).length === 0 ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          ไม่พบลูกค้าที่ตรงกับ "{customerSearch}"
                        </div>
                      ) : (
                        (searchResults?.contacts || []).map((c: any) => (
                          <button
                            key={c.id}
                            className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors flex items-center gap-3 border-b last:border-b-0"
                            onClick={() => selectContact(c)}
                            data-testid={`contact-option-${c.id}`}
                          >
                            <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                              <Users className="h-4 w-4 text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-800 truncate">{c.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {c.code && <span className="mr-3">รหัส: {c.code}</span>}
                                {c.taxId && <span>เลขนิติ: {c.taxId}</span>}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedContact && (
          <>
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">เอกสารค้างชำระ</CardTitle>
                  {filteredDocs.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedDocs.size === filteredDocs.length && filteredDocs.length > 0}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                      />
                      <span className="text-xs text-muted-foreground">เลือกทั้งหมด ({filteredDocs.length})</span>
                    </div>
                  )}
                </div>
                {!loadingDocs && outstandingDocs.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    <button
                      data-testid="tab-filter-iv"
                      onClick={() => { setDocTypeFilter("IV"); setSelectedDocs(new Set()); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${docTypeFilter === "IV" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600"}`}
                    >
                      ใบแจ้งหนี้
                      {ivCount > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${docTypeFilter === "IV" ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>{ivCount}</span>}
                    </button>
                    <button
                      data-testid="tab-filter-tiv"
                      onClick={() => { setDocTypeFilter("TIV"); setSelectedDocs(new Set()); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${docTypeFilter === "TIV" ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-gray-600 border-gray-300 hover:border-cyan-400 hover:text-cyan-600"}`}
                    >
                      ใบกำกับภาษี
                      {tivCount > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${docTypeFilter === "TIV" ? "bg-white/20 text-white" : "bg-cyan-100 text-cyan-700"}`}>{tivCount}</span>}
                    </button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {loadingDocs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-300" />
                    {outstandingDocs.length === 0
                      ? "ลูกค้ารายนี้ไม่มีเอกสารค้างชำระ"
                      : docTypeFilter === "IV" ? "ไม่มีใบแจ้งหนี้ค้างชำระ" : "ไม่มีใบกำกับภาษีค้างชำระ"}
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredDocs.map((doc: any) => {
                      const key = docKey(doc);
                      const isSelected = selectedDocs.has(key);
                      return (
                        <div key={key} className={`px-4 py-3 transition-colors ${isSelected ? "bg-amber-50/50" : "hover:bg-gray-50/50"}`} data-testid={`doc-item-${key}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleDoc(doc)}
                                data-testid={`checkbox-doc-${key}`}
                              />
                              <span className="text-sm font-medium text-gray-800">{doc.docNo}</span>
                              {paymentStatusBadge(doc.paymentStatus)}
                            </div>
                            <span className="text-sm font-bold text-gray-800">฿{fmt(parseFloat(doc.totalAmount) || 0)}</span>
                          </div>
                          <div className="flex items-center gap-4 mt-1.5 ml-9 text-xs text-muted-foreground">
                            <span>วันที่: {formatDate(doc.docDate, dateEra, dateFmt)}</span>
                            {doc.dueDate && (
                              <span>ครบกำหนด: {formatDate(doc.dueDate, dateEra, dateFmt)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {selectedDocs.size > 0 && (
              <Card className="border-0 shadow-sm border-t-4" style={{ borderTopColor: "#fec90f" }}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-gray-700">เลือก {selectedDocs.size} รายการ</span>
                      <span className="text-xs text-muted-foreground ml-2">จาก {outstandingDocs.length} รายการ</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">ยอดรวม</span>
                      <p className="text-lg font-bold text-gray-800">฿{fmt(selectedTotal)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">วันที่วางบิล</Label>
                      <ThaiDateInput
                        value={billingDate}
                        onChange={setBillingDate}
                        dateEra={dateEra}
                        dateFmt={dateFmt}
                        className="mt-1 h-9 text-sm"
                        data-testid="input-billing-date"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">วันครบกำหนด</Label>
                      <ThaiDateInput
                        value={dueDate}
                        onChange={setDueDate}
                        dateEra={dateEra}
                        dateFmt={dateFmt}
                        className="mt-1 h-9 text-sm"
                        data-testid="input-due-date"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">หัก ณ ที่จ่าย (%)</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={billingWhtRate}
                          onChange={(e) => setBillingWhtRate(e.target.value)}
                          placeholder="0"
                          className="h-9 text-sm pr-8"
                          data-testid="input-billing-wht"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                      {billingWhtAmount > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1">= ฿{fmt(billingWhtAmount)} (จากยอดก่อน VAT ฿{fmt(selectedSubtotal)})</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">หมายเหตุ</Label>
                      <Input
                        value={billingNotes}
                        onChange={(e) => setBillingNotes(e.target.value)}
                        placeholder="หมายเหตุ (ถ้ามี)"
                        className="mt-1 h-9 text-sm"
                        data-testid="input-billing-notes"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedDocs(new Set())} data-testid="button-clear-selection">
                      ล้างการเลือก
                    </Button>
                    <Button
                      size="sm"
                      className="px-6"
                      style={{ background: "#fec90f", color: "#000" }}
                      disabled={createBillingNote.isPending}
                      onClick={submitBillingNote}
                      data-testid="button-submit-billing-note"
                    >
                      {createBillingNote.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileText className="h-4 w-4 mr-1" />}
                      {billingWhtAmount > 0
                        ? `สร้างใบวางบิล ฿${fmt(selectedTotal)} (หัก ณ ที่จ่าย ฿${fmt(billingWhtAmount)})`
                        : `สร้างใบวางบิล ฿${fmt(selectedTotal)}`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
      </Layout>
    );
  }

  return (
    <Layout>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800" data-testid="text-page-title">ใบวางบิล</h1>
          <p className="text-sm text-muted-foreground">รายการใบวางบิลทั้งหมด</p>
        </div>
        <Button
          size="sm"
          style={{ background: "#fb9678" }}
          onClick={() => { resetCreateForm(); setMode("create"); }}
          data-testid="button-create-billing-note"
        >
          <Plus className="h-4 w-4 mr-1" />
          สร้างใบวางบิล
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ใบวางบิลทั้งหมด</p>
                <p className="text-lg font-bold text-gray-800" data-testid="text-total-billing-notes">{billingNotesList.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ยอดรวมทั้งหมด</p>
                <p className="text-lg font-bold text-gray-800" data-testid="text-total-amount">฿{fmt(totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ยังไม่ชำระ</p>
                <p className="text-lg font-bold text-red-600" data-testid="text-unpaid-count">{unpaidCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">รายการใบวางบิล</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="ค้นหาเลขที่ใบวางบิล, ลูกค้า..."
                className="pl-8 h-9 text-sm w-[250px]"
                value={searchBilling}
                onChange={(e) => setSearchBilling(e.target.value)}
                data-testid="input-search-billing"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {billingLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              {billingNotesList.length === 0 ? "ยังไม่มีใบวางบิล กดปุ่ม \"สร้างใบวางบิล\" เพื่อเริ่มต้น" : "ไม่พบใบวางบิลที่ค้นหา"}
            </div>
          ) : (
            <div className="divide-y">
              {filteredNotes.map((bn: any) => {
                const isExpanded = expandedNotes.has(bn.id);
                const isUnpaid = bn.status === "unpaid" || bn.paymentStatus === "unpaid";
                return (
                  <div key={bn.id} data-testid={`billing-note-item-${bn.id}`}>
                    <div
                      className="px-4 py-3 hover:bg-gray-50/50 cursor-pointer transition-colors"
                      onClick={() => toggleNoteExpand(bn.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                            <Badge className="text-[9px] border-0" style={{ background: "#fec90f", color: "#000" }}>BN</Badge>
                            <span className="text-sm font-medium text-gray-800">{bn.billingNo}</span>
                            <span className="text-sm text-muted-foreground">{bn.customerName}</span>
                            {bn.linkedDocs?.length > 0 && (
                              <Badge variant="outline" className="text-[9px]">
                                <Link2 className="h-3 w-3 mr-0.5" />
                                {bn.linkedDocs.length} เอกสาร
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 pl-6 text-xs">
                            <span
                              className="flex items-center gap-0.5 text-[#03c9d7] cursor-pointer hover:underline"
                              onClick={(e) => { e.stopPropagation(); setRelatedDocDialog({ open: true, id: bn.id, docNo: bn.billingNo }); }}
                              data-testid={`link-related-${bn.id}`}
                            >
                              <ExternalLink className="h-3 w-3" /> เอกสารที่เกี่ยวข้อง
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{formatDate(bn.billingDate, dateEra, dateFmt)}</span>
                          {billingStatusBadge(bn.paymentStatus === "paid" ? "paid" : bn.status)}
                          <span className="text-sm font-bold" style={{ color: "#fb9678" }}>฿{fmt(parseFloat(bn.totalAmount) || 0)}</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`button-more-actions-${bn.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => openEditDialog(bn)} data-testid={`menu-edit-${bn.id}`}>
                                <Pencil className="h-3.5 w-3.5 mr-2 text-blue-500" />
                                แก้ไข
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate(`/finance/billing-notes/pdf/${bn.id}`)} data-testid={`menu-pdf-${bn.id}`}>
                                <Printer className="h-3.5 w-3.5 mr-2 text-purple-500" />
                                ดูตัวอย่าง / สั่งพิมพ์
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openSendDialog(bn)} data-testid={`menu-send-${bn.id}`}>
                                <Send className="h-3.5 w-3.5 mr-2 text-indigo-500" />
                                ส่งอีเมล
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/finance/billing-notes/${bn.id}/share`, { method: "POST", credentials: "include" });
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/billing-note/${data.shareToken}`;
                                    navigator.clipboard.writeText(url).catch(() => {});
                                    toast({ title: "คัดลอกลิงค์แล้ว" });
                                  } catch { toast({ title: "ไม่สามารถสร้างลิงค์ได้", variant: "destructive" }); }
                                }}
                                data-testid={`menu-copy-link-${bn.id}`}
                              >
                                <Copy className="h-3.5 w-3.5 mr-2 text-gray-500" />
                                คัดลอกลิงค์
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/finance/billing-notes/${bn.id}/share`, { method: "POST", credentials: "include" });
                                    const data = await res.json();
                                    const base = await getShareBaseUrl();
                                    const url = `${base}/share/billing-note/${data.shareToken}`;
                                    setTimeout(() => setLineDialog({ open: true, url, docNo: bn.billingNo, customerName: bn.customerName || "" }), 150);
                                  } catch { toast({ title: "ไม่สามารถสร้างลิงค์ได้", variant: "destructive" }); }
                                }}
                                data-testid={`menu-line-${bn.id}`}
                              >
                                <BookOpen className="h-3.5 w-3.5 mr-2 text-green-500" />
                                ส่งไลน์
                              </DropdownMenuItem>
                              {bn.status !== "paid" && bn.paymentStatus !== "paid" && (
                                <>
                                  <DropdownMenuSeparator />
                                  {/* BN จาก IV → ปุ่มสร้างใบกำกับ (TIV รวมใบเสร็จ ไม่ต้องออกใบเสร็จแยก) */}
                                  {getBnPrimaryDocType(bn) === "IV" && bn.status !== "invoiced" && (
                                    <DropdownMenuItem onClick={() => openTIVDialog(bn)} data-testid={`menu-create-tiv-${bn.id}`}>
                                      <FileCheck className="h-3.5 w-3.5 mr-2 text-cyan-500" />
                                      สร้างใบกำกับภาษี
                                    </DropdownMenuItem>
                                  )}
                                  {/* BN จาก TIV/mixed → ปุ่มสร้างใบเสร็จ (ไม่แสดงสำหรับ BN จาก IV เพราะ TIV = ใบเสร็จแล้ว) */}
                                  {getBnPrimaryDocType(bn) !== "IV" && (
                                    <DropdownMenuItem onClick={() => openReceiptDialog(bn)} data-testid={`menu-receipt-${bn.id}`}>
                                      <Receipt className="h-3.5 w-3.5 mr-2 text-green-500" />
                                      สร้างใบเสร็จรับเงิน
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => { setDeleteBn(bn); setDeleteConfirmOpen(true); }}
                                data-testid={`menu-delete-${bn.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />
                                ลบ
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                    {isExpanded && bn.linkedDocs?.length > 0 && (
                      <div className="px-4 pb-3">
                        <div className="ml-6 bg-gray-50 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">ประเภท</th>
                                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">เลขที่เอกสาร</th>
                                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">วันที่</th>
                                <th className="text-right px-3 py-1.5 text-xs font-medium text-gray-500">ยอดเงิน</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {bn.linkedDocs.map((ld: any, i: number) => (
                                <tr key={i}>
                                  <td className="px-3 py-1.5">
                                    <Badge className={`text-[8px] border-0 ${ld.docType === "IV" ? "bg-blue-100 text-blue-700" : "bg-cyan-100 text-cyan-700"}`}>
                                      {ld.docType === "IV" ? "ใบแจ้งหนี้" : "ใบกำกับภาษี"}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-1.5 text-xs">{ld.docNo || "-"}</td>
                                  <td className="px-3 py-1.5 text-xs">{ld.docDate ? formatDate(ld.docDate, dateEra, dateFmt) : "-"}</td>
                                  <td className="px-3 py-1.5 text-xs text-right font-medium">฿{fmt(ld.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>สร้างใบเสร็จรับเงินจากใบวางบิล</DialogTitle>
            <DialogDescription>
              {receiptBillingNote && (
                <span>ใบวางบิล: {receiptBillingNote.billingNo} | ยอด ฿{fmt(parseFloat(receiptBillingNote.totalAmount) || 0)}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">วันที่รับเงิน</Label>
              <ThaiDateInput value={receiptPayDate} onChange={setReceiptPayDate} dateEra={dateEra} dateFmt={dateFmt} className="mt-1 h-9 text-sm" data-testid="input-receipt-pay-date" />
            </div>
            <div>
              <Label className="text-xs">วิธีรับเงิน</Label>
              <Select
                value={(() => {
                  if (!receiptPayMethod) return "";
                  const found = (paymentMethodsList || []).find((m: any) => m.accountCode === receiptPayMethod && m.isDefault)
                    || (paymentMethodsList || []).find((m: any) => m.accountCode === receiptPayMethod);
                  return found ? `pm_${found.id}` : receiptPayMethod;
                })()}
                onValueChange={v => {
                  const pm = (paymentMethodsList || []).find((m: any) => `pm_${m.id}` === v);
                  setReceiptPayMethod(pm ? pm.accountCode : v);
                }}
              >
                <SelectTrigger className="mt-1 h-9 text-sm" data-testid="select-receipt-pay-method">
                  <SelectValue placeholder="เลือกวิธีรับเงิน" />
                </SelectTrigger>
                <SelectContent>
                  {(paymentMethodsList || []).map((m: any) => (
                    <SelectItem key={m.id} value={`pm_${m.id}`}>
                      {m.name}{m.bankName ? ` · ${m.bankName}` : ""}{m.bankAccountNo ? ` ${m.bankAccountNo}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">อัตราภาษีถูกหัก ณ ที่จ่าย (%)</Label>
              <div className="relative mt-1">
                <Input type="number" step="0.01" min="0" max="100" value={receiptWht} onChange={(e) => setReceiptWht(e.target.value)} placeholder="0" className="h-9 text-sm pr-8" data-testid="input-receipt-wht" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
            </div>
            {receiptWhtAmt > 0 && receiptBillingNote && (
              <div className="bg-amber-50 rounded-lg p-3 flex items-center justify-between">
                <div className="text-sm text-amber-800">
                  <span>฿{fmt(parseFloat(receiptBillingNote.totalAmount) || 0)}</span>
                  <span className="mx-1.5">-</span>
                  <span>WHT {parseFloat(receiptWht) || 0}% (฿{fmt(receiptWhtAmt)})</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-amber-600">ยอดรับสุทธิ</p>
                  <p className="text-base font-bold" style={{ color: "#05b187" }}>฿{fmt((parseFloat(receiptBillingNote.totalAmount) || 0) - receiptWhtAmt)}</p>
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">หมายเหตุ</Label>
              <Input value={receiptNotes} onChange={(e) => setReceiptNotes(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" className="mt-1 h-9 text-sm" data-testid="input-receipt-notes" />
            </div>
            {receiptBillingNote && (receiptBillingNote.linkedDocs || []).length > 0 && (
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-medium text-gray-500 mb-2">รายการเอกสารที่เชื่อมโยง</p>
                {(receiptBillingNote.linkedDocs || []).map((d: any) => {
                  const isTiv = d.docType === "TIV";
                  return (
                    <div key={d.id} className={`flex items-center justify-between text-sm rounded px-2 py-1 ${isTiv ? "bg-cyan-50 text-cyan-900" : "bg-blue-50 text-blue-900"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isTiv ? "bg-cyan-100 text-cyan-700" : "bg-blue-100 text-blue-700"}`}>{d.docType}</span>
                        <span>{d.docNo || `#${d.docId}`}</span>
                      </div>
                      <span className="font-medium">฿{fmt(parseFloat(d.amount) || 0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReceiptDialogOpen(false)} data-testid="button-cancel-receipt">ยกเลิก</Button>
            <Button size="sm" className="px-6" style={{ background: "#05b187" }} disabled={createReceiptFromBN.isPending} onClick={submitReceipt} data-testid="button-submit-receipt">
              {createReceiptFromBN.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CreditCard className="h-4 w-4 mr-1" />}
              บันทึกรับเงิน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog สร้างใบกำกับภาษีจากใบวางบิล */}
      <Dialog open={tivDialogOpen} onOpenChange={setTivDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>สร้างใบกำกับภาษีจากใบวางบิล</DialogTitle>
            <DialogDescription>
              {tivBillingNote && (
                <span>ใบวางบิล: {tivBillingNote.billingNo} | ยอด ฿{fmt(parseFloat(tivBillingNote.totalAmount) || 0)}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">วันที่ออกใบกำกับภาษี</Label>
              <ThaiDateInput value={tivDate} onChange={setTivDate} dateEra={dateEra} dateFmt={dateFmt} className="mt-1 h-9 text-sm" data-testid="input-tiv-date" />
            </div>
            <div>
              <Label className="text-xs">วิธีชำระเงิน</Label>
              <Select
                value={(() => {
                  if (!tivPayMethod) return "";
                  const found = (paymentMethodsList || []).find((m: any) => m.accountCode === tivPayMethod && m.isDefault)
                    || (paymentMethodsList || []).find((m: any) => m.accountCode === tivPayMethod);
                  return found ? `pm_${found.id}` : tivPayMethod;
                })()}
                onValueChange={v => {
                  const pm = (paymentMethodsList || []).find((m: any) => `pm_${m.id}` === v);
                  setTivPayMethod(pm ? pm.accountCode : v);
                }}
              >
                <SelectTrigger className="mt-1 h-9 text-sm" data-testid="select-tiv-pay-method">
                  <SelectValue placeholder="เลือกวิธีชำระเงิน" />
                </SelectTrigger>
                <SelectContent>
                  {(paymentMethodsList || []).map((m: any) => (
                    <SelectItem key={m.id} value={`pm_${m.id}`}>
                      {m.name}{m.bankName ? ` · ${m.bankName}` : ""}{m.bankAccountNo ? ` ${m.bankAccountNo}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">อัตราภาษีถูกหัก ณ ที่จ่าย (%)</Label>
              <div className="relative mt-1">
                <Input type="number" step="0.01" min="0" max="100" value={tivWht} onChange={(e) => setTivWht(e.target.value)} placeholder="0" className="h-9 text-sm pr-8" data-testid="input-tiv-wht" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
              </div>
            </div>
            {tivWhtAmt > 0 && tivBillingNote && (
              <div className="bg-amber-50 rounded-lg p-3 flex items-center justify-between">
                <div className="text-sm text-amber-800">
                  <span>฿{fmt(parseFloat(tivBillingNote.totalAmount) || 0)}</span>
                  <span className="mx-1.5">-</span>
                  <span>WHT {parseFloat(tivWht) || 0}% (฿{fmt(tivWhtAmt)})</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-amber-600">ยอดสุทธิ</p>
                  <p className="text-base font-bold text-cyan-700">฿{fmt((parseFloat(tivBillingNote.totalAmount) || 0) - tivWhtAmt)}</p>
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">หมายเหตุ</Label>
              <Input value={tivNotes} onChange={(e) => setTivNotes(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" className="mt-1 h-9 text-sm" data-testid="input-tiv-notes" />
            </div>
            {tivBillingNote && (tivBillingNote.linkedDocs || []).length > 0 && (
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-xs font-medium text-gray-500 mb-2">รายการเอกสารที่เชื่อมโยง</p>
                {(tivBillingNote.linkedDocs || []).map((d: any) => {
                  const isTiv = d.docType === "TIV";
                  return (
                    <div key={d.id} className={`flex items-center justify-between text-sm rounded px-2 py-1 ${isTiv ? "bg-cyan-50 text-cyan-900" : "bg-blue-50 text-blue-900"}`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isTiv ? "bg-cyan-100 text-cyan-700" : "bg-blue-100 text-blue-700"}`}>{d.docType}</span>
                        <span>{d.docNo || `#${d.docId}`}</span>
                      </div>
                      <span className="font-medium">฿{fmt(parseFloat(d.amount) || 0)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTivDialogOpen(false)} data-testid="button-cancel-tiv">ยกเลิก</Button>
            <Button size="sm" className="px-6 bg-cyan-600 hover:bg-cyan-700 text-white" disabled={createTIVFromBN.isPending} onClick={submitTIV} data-testid="button-submit-tiv">
              {createTIVFromBN.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FileCheck className="h-4 w-4 mr-1" />}
              ออกใบกำกับภาษี
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog แก้ไขใบวางบิล */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>แก้ไขใบวางบิล</DialogTitle>
            <DialogDescription>{editBn?.billingNo} — {editBn?.customerName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">วันที่วางบิล</Label>
                <ThaiDateInput value={editBillingDate} onChange={setEditBillingDate} dateEra={dateEra} dateFmt={dateFmt} className="mt-1 h-9 text-sm" data-testid="input-edit-billing-date" />
              </div>
              <div>
                <Label className="text-xs">วันครบกำหนด</Label>
                <ThaiDateInput value={editDueDate} onChange={setEditDueDate} dateEra={dateEra} dateFmt={dateFmt} className="mt-1 h-9 text-sm" data-testid="input-edit-due-date" />
              </div>
            </div>
            <div>
              <Label className="text-xs">หัก ณ ที่จ่าย (%)</Label>
              <div className="relative mt-1">
                <Input type="number" min="0" max="100" step="0.5" value={editWhtRate} onChange={(e) => setEditWhtRate(e.target.value)} placeholder="0" className="h-9 text-sm pr-8" data-testid="input-edit-wht" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
              </div>
              {(() => {
                const rate = parseFloat(editWhtRate) || 0;
                if (rate <= 0 || !editBn) return null;
                const base = parseFloat(String(editBn.linkedSubtotal));
                if (isNaN(base) || base <= 0) return (
                  <p className="text-[11px] text-red-500 mt-1">ข้อผิดพลาด: ไม่พบยอดก่อน VAT สำหรับใบวางบิลนี้</p>
                );
                const amt = Math.round(rate / 100 * base * 100) / 100;
                return amt > 0 ? (
                  <p className="text-[11px] text-muted-foreground mt-1">= ฿{fmt(amt)} (จากยอดก่อน VAT ฿{fmt(base)})</p>
                ) : null;
              })()}
            </div>
            <div>
              <Label className="text-xs">หมายเหตุ</Label>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" className="mt-1 h-9 text-sm" data-testid="input-edit-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>ยกเลิก</Button>
            <Button size="sm" className="px-6" style={{ background: "#fb9678" }} disabled={updateBillingNote.isPending} onClick={submitEdit} data-testid="button-submit-edit">
              {updateBillingNote.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pencil className="h-4 w-4 mr-1" />}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog ส่งอีเมล */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ส่งใบวางบิลทางอีเมล</DialogTitle>
            <DialogDescription>{sendBn?.billingNo} — {sendBn?.customerName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">อีเมลผู้รับ <span className="text-red-500">*</span></Label>
              <Input value={sendToEmail} onChange={(e) => setSendToEmail(e.target.value)} placeholder="example@email.com" className="mt-1 h-9 text-sm" data-testid="input-send-email" />
            </div>
            <div>
              <Label className="text-xs">หัวข้ออีเมล</Label>
              <Input value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} className="mt-1 h-9 text-sm" data-testid="input-send-subject" />
            </div>
            <div>
              <Label className="text-xs">ข้อความเพิ่มเติม (ถ้ามี)</Label>
              <Textarea value={sendBody} onChange={(e) => setSendBody(e.target.value)} placeholder="ระบบจะใช้ข้อความเริ่มต้นถ้าไม่ได้กรอก" rows={3} className="mt-1 text-sm" data-testid="input-send-body" />
            </div>
            <p className="text-[11px] text-muted-foreground">PDF ใบวางบิลจะถูกแนบไปกับอีเมลโดยอัตโนมัติ</p>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSendDialogOpen(false)}>ยกเลิก</Button>
            <Button size="sm" className="px-6" style={{ background: "#6366f1" }} disabled={sendEmailBN.isPending || !sendToEmail} onClick={submitSend} data-testid="button-submit-send">
              {sendEmailBN.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              ส่งอีเมล
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog ยืนยันลบ */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ยืนยันการลบใบวางบิล</DialogTitle>
            <DialogDescription>
              ต้องการลบใบวางบิล <strong>{deleteBn?.billingNo}</strong> ({deleteBn?.customerName}) ใช่หรือไม่?
              <br />
              <span className="text-red-500 text-xs mt-1 block">การลบจะไม่สามารถย้อนกลับได้ และจะอัพเดตสถานะชำระเงินของเอกสารที่เชื่อมโยงด้วย</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmOpen(false)}>ยกเลิก</Button>
            <Button size="sm" variant="destructive" disabled={deleteBillingNote.isPending} onClick={() => deleteBn && deleteBillingNote.mutate(deleteBn.id)} data-testid="button-confirm-delete">
              {deleteBillingNote.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              ลบใบวางบิล
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RelatedDocsDialog
        open={relatedDocDialog.open}
        onOpenChange={(open) => setRelatedDocDialog(prev => ({ ...prev, open }))}
        docType="billing_note"
        docId={relatedDocDialog.id}
      />

      <LineSendDialog
        open={lineDialog.open}
        onOpenChange={(open) => setLineDialog(prev => ({ ...prev, open }))}
        shareUrl={lineDialog.url}
        docNo={lineDialog.docNo}
        customerName={lineDialog.customerName}
        companyId={companyId}
      />
    </div>
    </Layout>
  );
}
