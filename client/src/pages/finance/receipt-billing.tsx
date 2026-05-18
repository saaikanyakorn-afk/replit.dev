import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FileText, Search, DollarSign, Clock, AlertTriangle, CheckCircle, Users, CreditCard, Loader2, ListChecks, Receipt, ChevronDown, ChevronRight, Link2, Plus, ArrowLeft, X, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { formatDate } from "@/lib/format";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ThaiDateInput from "@/components/thai-date-input";
import JournalPreviewPanel, { type JournalLine } from "@/components/journal-preview-panel";
import { toLocalDateStr } from "@/lib/utils";

import { useDateSettings } from "@/hooks/use-date-settings";
function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusBadge(ps: string) {
  switch (ps) {
    case "paid": return <Badge className="text-[10px] bg-green-100 text-green-700 border-0"><CheckCircle className="h-3 w-3 mr-0.5" />ชำระแล้ว</Badge>;
    case "partial": return <Badge className="text-[10px] bg-yellow-100 text-yellow-700 border-0"><Clock className="h-3 w-3 mr-0.5" />ชำระบางส่วน</Badge>;
    default: return <Badge className="text-[10px] bg-red-100 text-red-700 border-0"><AlertTriangle className="h-3 w-3 mr-0.5" />ยังไม่ชำระ</Badge>;
  }
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(toLocalDateStr(new Date()));
}

export default function ReceiptBilling() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"list" | "create">("list");
  const [searchReceipt, setSearchReceipt] = useState("");
  const [journalOverrideLines, setJournalOverrideLines] = useState<JournalLine[] | null>(null);
  const [expandedReceipts, setExpandedReceipts] = useState<Set<number>>(new Set());

  const [customerSearch, setCustomerSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [payMethod, setPayMethod] = useState("");
  const [payDate, setPayDate] = useState(() => toLocalDateStr(new Date()));
  const [payNotes, setPayNotes] = useState("");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [whtAmount, setWhtAmount] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
  const { data: receiptData, isLoading: receiptLoading } = useQuery<any>({
    queryKey: ["/api/finance/receipt-billing", companyId],
    queryFn: async () => {
      if (!companyId) return { documents: [], recentReceipts: [] };
      const r = await fetch(`/api/finance/receipt-billing?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return { documents: [], recentReceipts: [] };
      return r.json();
    },
    enabled: !!companyId,
  });

  const recentReceipts: any[] = receiptData?.recentReceipts || [];

  const filteredReceipts = useMemo(() => {
    if (!searchReceipt) return recentReceipts;
    const s = searchReceipt.toLowerCase();
    return recentReceipts.filter((r: any) =>
      (r.receiptNo || "").toLowerCase().includes(s) ||
      (r.customerName || "").toLowerCase().includes(s)
    );
  }, [recentReceipts, searchReceipt]);

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

  const { data: paymentMethodsList } = useQuery<any[]>({
    queryKey: ["/api/payment-methods", companyId, "receive"],
    queryFn: async () => {
      if (!companyId) return [];
      const r = await fetch(`/api/payment-methods?companyId=${companyId}&type=receive`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!companyId,
  });
  const activePaymentMethods = (paymentMethodsList || []).filter((m: any) => m.active !== false);

  useEffect(() => {
    if (!payMethod && activePaymentMethods.length > 0) {
      const defaultPm = activePaymentMethods.find((m: any) => m.isDefault);
      if (defaultPm) setPayMethod(defaultPm.accountCode);
    }
  }, [activePaymentMethods]);

  const batchPayment = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("POST", "/api/finance/batch-receipt", payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "บันทึกการรับเงินสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/receipt-billing", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/customer-outstanding-docs"] });
      resetCreateForm();
      setMode("list");
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const resetCreateForm = () => {
    setCustomerSearch("");
    setSelectedContact(null);
    setSelectedDocs(new Set());
    setPayMethod("โอนเงิน");
    setPayDate(toLocalDateStr(new Date()));
    setPayNotes("");
    setCustomAmounts({});
    setWhtAmount("");
  };

  const docKey = (doc: any) => `${doc.docType}-${doc.id}`;

  const toggleDoc = (doc: any) => {
    const key = docKey(doc);
    const next = new Set(selectedDocs);
    if (next.has(key)) {
      next.delete(key);
      const ca = { ...customAmounts };
      delete ca[key];
      setCustomAmounts(ca);
    } else {
      next.add(key);
    }
    setSelectedDocs(next);
  };

  const toggleAll = () => {
    if (selectedDocs.size === outstandingDocs.length) {
      setSelectedDocs(new Set());
      setCustomAmounts({});
    } else {
      setSelectedDocs(new Set(outstandingDocs.map(docKey)));
    }
  };

  const selectedDocsList = useMemo(() => {
    return outstandingDocs.filter(d => selectedDocs.has(docKey(d)));
  }, [outstandingDocs, selectedDocs]);

  const selectedTotal = useMemo(() => {
    return selectedDocsList.reduce((s, d) => {
      const key = docKey(d);
      const custom = customAmounts[key];
      return s + (custom !== undefined ? parseFloat(custom) || 0 : d.totalAmount);
    }, 0);
  }, [selectedDocsList, customAmounts]);

  const whtVal = parseFloat(whtAmount) || 0;
  const netReceive = selectedTotal - whtVal;

  const submitPayment = () => {
    if (selectedDocsList.length === 0) return;
    batchPayment.mutate({
      companyId,
      documents: selectedDocsList.map(d => {
        const key = docKey(d);
        const amount = customAmounts[key] !== undefined ? parseFloat(customAmounts[key]) || 0 : d.totalAmount;
        return {
          docType: d.docType,
          docId: d.id,
          docNo: d.docNo,
          amount,
          contactName: d.contactName || selectedContact?.name,
          customerId: d.customerId || selectedContact?.id || null,
        };
      }),
      paymentMethod: payMethod,
      paymentDate: payDate,
      notes: payNotes,
      withholdingTax: whtVal,
    });
  };

  const selectContact = (contact: any) => {
    setSelectedContact(contact);
    setCustomerSearch(contact.name);
    setShowDropdown(false);
    setSelectedDocs(new Set());
    setCustomAmounts({});
  };

  const clearContact = () => {
    setSelectedContact(null);
    setCustomerSearch("");
    setSelectedDocs(new Set());
    setCustomAmounts({});
  };

  const toggleReceiptExpand = (id: number) => {
    const next = new Set(expandedReceipts);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedReceipts(next);
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

  const totalReceived = recentReceipts.reduce((s: number, r: any) => s + (r.totalAmount || 0), 0);

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
            <h1 className="text-xl font-bold text-gray-800" data-testid="text-page-title">สร้างใบรับเงิน</h1>
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
                    <span className="text-sm font-semibold text-blue-800">{selectedContact.name}</span>
                    {selectedContact.code && (
                      <span className="text-xs text-blue-600 ml-2">({selectedContact.code})</span>
                    )}
                    {selectedContact.taxId && (
                      <span className="text-xs text-blue-500 ml-2">เลขนิติ: {selectedContact.taxId}</span>
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
                  {outstandingDocs.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedDocs.size === outstandingDocs.length && outstandingDocs.length > 0}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                      />
                      <span className="text-xs text-muted-foreground">เลือกทั้งหมด ({outstandingDocs.length})</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loadingDocs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : outstandingDocs.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    <CheckCircle className="h-10 w-10 mx-auto mb-2 text-green-300" />
                    ลูกค้ารายนี้ไม่มีเอกสารค้างชำระ
                  </div>
                ) : (
                  <div className="divide-y">
                    {outstandingDocs.map((doc: any) => {
                      const key = docKey(doc);
                      const isSelected = selectedDocs.has(key);
                      const customAmt = customAmounts[key];
                      return (
                        <div key={key} className={`px-4 py-3 transition-colors ${isSelected ? "bg-blue-50/50" : "hover:bg-gray-50/50"}`} data-testid={`doc-item-${key}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleDoc(doc)}
                                data-testid={`checkbox-doc-${key}`}
                              />
                              <Badge className={`text-[9px] border-0 ${doc.docType === "IV" ? "bg-blue-100 text-blue-700" : "bg-cyan-100 text-cyan-700"}`}>
                                {doc.docType === "IV" ? "ใบแจ้งหนี้" : "ใบกำกับภาษี"}
                              </Badge>
                              <span className="text-sm font-medium text-gray-800">{doc.docNo}</span>
                              {statusBadge(doc.paymentStatus)}
                              {isOverdue(doc.dueDate) && doc.paymentStatus !== "paid" && (
                                <Badge className="text-[9px] bg-red-100 text-red-600 border-0">เกินกำหนด</Badge>
                              )}
                            </div>
                            <span className="text-sm font-bold text-gray-800">฿{fmt(doc.totalAmount)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1.5 ml-9">
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>วันที่: {formatDate(doc.docDate, dateEra, dateFmt)}</span>
                              {doc.dueDate && (
                                <span className={isOverdue(doc.dueDate) && doc.paymentStatus !== "paid" ? "text-red-500 font-medium" : ""}>
                                  ครบกำหนด: {formatDate(doc.dueDate, dateEra, dateFmt)}
                                </span>
                              )}
                            </div>
                            {isSelected && (
                              <div className="flex items-center gap-1">
                                <Label className="text-[10px] text-muted-foreground">จำนวนรับ:</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  className="h-7 w-28 text-xs text-right"
                                  placeholder={fmt(doc.totalAmount)}
                                  value={customAmt !== undefined ? customAmt : ""}
                                  onChange={(e) => {
                                    setCustomAmounts(prev => ({ ...prev, [key]: e.target.value }));
                                  }}
                                  data-testid={`input-amount-${key}`}
                                />
                              </div>
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
              <Card className="border-0 shadow-sm border-t-4" style={{ borderTopColor: "#05b187" }}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-gray-700">เลือก {selectedDocs.size} รายการ</span>
                      <span className="text-xs text-muted-foreground ml-2">จาก {outstandingDocs.length} รายการ</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-muted-foreground">ยอดเอกสารรวม</span>
                      <p className="text-lg font-bold text-gray-800">฿{fmt(selectedTotal)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs">วิธีรับเงิน</Label>
                      <Select
                        value={(() => {
                          const found = activePaymentMethods.find((m: any) => m.accountCode === payMethod);
                          return found ? `pm_${found.id}` : payMethod;
                        })()}
                        onValueChange={v => {
                          const m = activePaymentMethods.find((m: any) => `pm_${m.id}` === v);
                          if (!m) return;
                          setPayMethod(m.accountCode);
                        }}
                      >
                        <SelectTrigger className="mt-1 h-9 text-sm" data-testid="select-pay-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {activePaymentMethods.map((m: any) => (
                            <SelectItem key={m.id} value={`pm_${m.id}`}>{m.nameTh || m.name}{m.bankName ? ` · ${m.bankName}` : ""}{m.bankAccountNo ? ` ${m.bankAccountNo}` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">วันที่รับเงิน</Label>
                      <ThaiDateInput
                        value={payDate}
                        onChange={setPayDate}
                        dateEra={dateEra}
                        dateFmt={dateFmt}
                        className="mt-1 h-9 text-sm"
                        data-testid="input-pay-date"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">ภาษีถูกหัก ณ ที่จ่าย</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={whtAmount}
                        onChange={(e) => setWhtAmount(e.target.value)}
                        placeholder="0.00"
                        className="mt-1 h-9 text-sm"
                        data-testid="input-wht-amount"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">หมายเหตุ</Label>
                      <Input
                        value={payNotes}
                        onChange={(e) => setPayNotes(e.target.value)}
                        placeholder="หมายเหตุ (ถ้ามี)"
                        className="mt-1 h-9 text-sm"
                        data-testid="input-pay-notes"
                      />
                    </div>
                  </div>

                  {whtVal > 0 && (
                    <div className="bg-amber-50 rounded-lg p-3 flex items-center justify-between">
                      <div className="text-sm text-amber-800">
                        <span>ยอดเอกสาร ฿{fmt(selectedTotal)}</span>
                        <span className="mx-2">-</span>
                        <span>ภาษีถูกหัก ฿{fmt(whtVal)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-amber-600">ยอดรับสุทธิ</span>
                        <p className="text-lg font-bold" style={{ color: "#05b187" }}>฿{fmt(netReceive)}</p>
                      </div>
                    </div>
                  )}

                  <JournalPreviewPanel
                    companyId={companyId ?? null}
                    documentType="receipt"
                    subtotal={selectedTotal.toFixed(2)}
                    vatAmount="0"
                    withholdingTax={whtVal.toFixed(2)}
                    paymentMethod={payMethod}
                    linkedInvoiceId={selectedDocsList.length > 0 ? selectedDocsList[0].id : null}
                                  onLinesChange={setJournalOverrideLines}
              />

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setSelectedDocs(new Set()); setCustomAmounts({}); setWhtAmount(""); }} data-testid="button-clear-selection">
                      ล้างการเลือก
                    </Button>
                    <Button
                      size="sm"
                      className="px-6"
                      style={{ background: "#05b187" }}
                      disabled={batchPayment.isPending}
                      onClick={submitPayment}
                      data-testid="button-submit-payment"
                    >
                      {batchPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CreditCard className="h-4 w-4 mr-1" />}
                      บันทึกรับเงิน ฿{fmt(whtVal > 0 ? netReceive : selectedTotal)}
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
          <h1 className="text-xl font-bold text-gray-800" data-testid="text-page-title">ใบเสร็จรับเงิน</h1>
          <p className="text-sm text-muted-foreground">รายการใบเสร็จรับเงินทั้งหมด</p>
        </div>
        <Button
          size="sm"
          style={{ background: "#fb9678" }}
          onClick={() => { resetCreateForm(); setMode("create"); }}
          data-testid="button-create-receipt"
        >
          <Plus className="h-4 w-4 mr-1" />
          สร้างใบรับเงิน
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ใบรับเงินทั้งหมด</p>
                <p className="text-lg font-bold text-gray-800" data-testid="text-total-receipts">{recentReceipts.length}</p>
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
                <p className="text-[11px] text-muted-foreground">ยอดรับเงินรวม</p>
                <p className="text-lg font-bold text-gray-800" data-testid="text-total-received">฿{fmt(totalReceived)}</p>
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
                <p className="text-[11px] text-muted-foreground">เอกสารค้างชำระ</p>
                <p className="text-lg font-bold text-red-600" data-testid="text-outstanding-count">
                  {(receiptData?.documents || []).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">ใบเสร็จรับเงิน</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="ค้นหาเลขที่ใบรับเงิน, ลูกค้า..."
                className="pl-8 h-9 text-sm w-[250px]"
                value={searchReceipt}
                onChange={(e) => setSearchReceipt(e.target.value)}
                data-testid="input-search-receipt"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {receiptLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              <Receipt className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              {recentReceipts.length === 0 ? "ยังไม่มีใบรับเงิน กดปุ่ม \"สร้างใบรับเงิน\" เพื่อเริ่มต้น" : "ไม่พบใบรับเงินที่ค้นหา"}
            </div>
          ) : (
            <div className="divide-y">
              {filteredReceipts.map((rc: any) => {
                const isExpanded = expandedReceipts.has(rc.id);
                return (
                  <div key={rc.id} data-testid={`receipt-item-${rc.id}`}>
                    <div
                      className="px-4 py-3 hover:bg-gray-50/50 cursor-pointer transition-colors"
                      onClick={() => toggleReceiptExpand(rc.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                          <Badge className="text-[9px] bg-green-100 text-green-700 border-0">RC</Badge>
                          <span className="text-sm font-medium text-gray-800">{rc.receiptNo}</span>
                          <span className="text-sm text-muted-foreground">{rc.customerName}</span>
                          {rc.linkedDocs?.length > 0 && (
                            <Badge variant="outline" className="text-[9px]">
                              <Link2 className="h-3 w-3 mr-0.5" />
                              {rc.linkedDocs.length} เอกสาร
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{formatDate(rc.receiptDate, dateEra, dateFmt)}</span>
                          <Badge className="text-[9px] bg-blue-50 text-blue-600 border-0">{rc.paymentMethod}</Badge>
                          <span className="text-sm font-bold" style={{ color: "#05b187" }}>฿{fmt(parseFloat(rc.totalAmount) || 0)}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={(e) => { e.stopPropagation(); navigate(`/sales/receipt/pdf/${rc.id}`); }}
                            data-testid={`button-print-receipt-${rc.id}`}
                          >
                            <Printer className="h-3 w-3 mr-1" />
                            พิมพ์
                          </Button>
                        </div>
                      </div>
                    </div>
                    {isExpanded && rc.linkedDocs?.length > 0 && (
                      <div className="px-4 pb-3">
                        <div className="ml-6 bg-gray-50 rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">ประเภท</th>
                                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">เลขที่เอกสาร</th>
                                <th className="text-right px-3 py-1.5 text-xs font-medium text-gray-500">ยอดเงิน</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {rc.linkedDocs.map((ld: any, i: number) => (
                                <tr key={i}>
                                  <td className="px-3 py-1.5">
                                    <Badge className={`text-[8px] border-0 ${ld.docType === "IV" ? "bg-blue-100 text-blue-700" : "bg-cyan-100 text-cyan-700"}`}>
                                      {ld.docType === "IV" ? "ใบแจ้งหนี้" : "ใบกำกับภาษี"}
                                    </Badge>
                                  </td>
                                  <td className="px-3 py-1.5 text-xs">{ld.docNo || "-"}</td>
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
    </div>
    </Layout>
  );
}
