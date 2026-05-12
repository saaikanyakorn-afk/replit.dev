import { useState, useMemo, useEffect } from "react";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { FileText, Search, DollarSign, Clock, AlertTriangle, CheckCircle, Users, CreditCard, Loader2, ListChecks, Receipt, ChevronDown, ChevronRight, Link2, Trash2, BookOpen } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { formatDate } from "@/lib/format";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ThaiDateInput from "@/components/thai-date-input";
import JournalPreviewPanel, { type JournalLine } from "@/components/journal-preview-panel";
import { toLocalDateStr } from "@/lib/utils";
import { useSearch, useLocation } from "wouter";

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

export default function APBilling() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchStr = useSearch();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [journalOverrideLines, setJournalOverrideLines] = useState<JournalLine[] | null>(null);
  const [filter, setFilter] = useState<"all" | "unpaid" | "partial" | "overdue">("all");
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [batchDialog, setBatchDialog] = useState(false);
  const [batchMethod, setBatchMethod] = useState("โอนเงิน");
  const [batchDate, setBatchDate] = useState(() => toLocalDateStr(new Date()));
  const [batchNotes, setBatchNotes] = useState("");
  const [expandedPvs, setExpandedPvs] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<"billing" | "history">("billing");
  const [batchWht, setBatchWht] = useState("");

  const [singlePayDialog, setSinglePayDialog] = useState<{ open: boolean; doc: any | null }>({ open: false, doc: null });
  const [singleMethod, setSingleMethod] = useState("โอนเงิน");
  const [singleDate, setSingleDate] = useState(() => toLocalDateStr(new Date()));
  const [singleNotes, setSingleNotes] = useState("");
  const [singleWht, setSingleWht] = useState("");

  const [deletingPvId, setDeletingPvId] = useState<number | null>(null);

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
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/finance/ap-billing", companyId],
    queryFn: async () => {
      if (!companyId) return { documents: [], recentPaymentVouchers: [] };
      const r = await fetch(`/api/finance/ap-billing?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return { documents: [], recentPaymentVouchers: [] };
      return r.json();
    },
    enabled: !!companyId,
  });

  const { data: paymentMethodsList } = useQuery<any[]>({
    queryKey: ["/api/payment-methods", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const r = await fetch(`/api/payment-methods?companyId=${companyId}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!companyId,
  });
  const activePaymentMethods = (paymentMethodsList || []).filter((m: any) => m.active !== false && (m.paymentType || "receive") === "pay");

  const batchPayment = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("POST", "/api/finance/batch-payment-voucher", payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "รวมจ่ายเงินสำเร็จ", description: `ออกใบสำคัญจ่ายรวม ${selectedDocs.size} รายการแล้ว` });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/ap-billing", companyId] });
      setSelectedDocs(new Set());
      setBatchDialog(false);
      setBatchNotes("");
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const singlePay = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiRequest("POST", "/api/finance/batch-payment-voucher", payload);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "บันทึกการจ่ายเงินสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/ap-billing", companyId] });
      setSinglePayDialog({ open: false, doc: null });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const deletePv = useMutation({
    mutationFn: async (pvId: number) => {
      const r = await fetch(`/api/finance/payment-voucher/${pvId}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "ลบไม่สำเร็จ"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "ลบใบสำคัญจ่ายสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/finance/ap-billing", companyId] });
      setDeletingPvId(null);
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
      setDeletingPvId(null);
    },
  });

  const documents: any[] = data?.documents || [];
  const recentPVs: any[] = data?.recentPaymentVouchers || [];

  const filtered = useMemo(() => {
    let list = documents;
    if (filter === "unpaid") list = list.filter((d: any) => d.paymentStatus === "unpaid");
    else if (filter === "partial") list = list.filter((d: any) => d.paymentStatus === "partial");
    else if (filter === "overdue") list = list.filter((d: any) => isOverdue(d.dueDate) && d.paymentStatus !== "paid");
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((d: any) =>
        (d.docNo || "").toLowerCase().includes(s) ||
        (d.contactName || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [documents, filter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const doc of filtered) {
      const key = doc.contactName || "ไม่ระบุ";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "th"));
  }, [filtered]);

  const totalUnpaid = documents.filter((d: any) => d.paymentStatus !== "paid").reduce((s: number, d: any) => s + d.totalAmount, 0);
  const overdueCount = documents.filter((d: any) => isOverdue(d.dueDate) && d.paymentStatus !== "paid").length;
  const overdueAmount = documents.filter((d: any) => isOverdue(d.dueDate) && d.paymentStatus !== "paid").reduce((s: number, d: any) => s + d.totalAmount, 0);
  const vendorCount = new Set(documents.filter((d: any) => d.paymentStatus !== "paid").map((d: any) => d.contactName)).size;

  const docKey = (doc: any) => `${doc.docType}-${doc.id}`;

  const toggleDoc = (doc: any) => {
    const key = docKey(doc);
    const next = new Set(selectedDocs);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedDocs(next);
  };

  const toggleVendor = (docs: any[]) => {
    const keys = docs.map(docKey);
    const allSelected = keys.every(k => selectedDocs.has(k));
    const next = new Set(selectedDocs);
    if (allSelected) {
      keys.forEach(k => next.delete(k));
    } else {
      keys.forEach(k => next.add(k));
    }
    setSelectedDocs(next);
  };

  const selectedDocsList = useMemo(() => {
    return filtered.filter(d => selectedDocs.has(docKey(d)));
  }, [filtered, selectedDocs]);

  const selectedTotal = selectedDocsList.reduce((s, d) => s + d.totalAmount, 0);

  const selectedVendors = useMemo(() => {
    return new Set(selectedDocsList.map(d => d.contactName));
  }, [selectedDocsList]);

  const canBatchPay = selectedDocs.size >= 1 && selectedVendors.size === 1;

  const openBatchDialog = () => {
    setBatchDate(toLocalDateStr(new Date()));
    setBatchMethod(activePaymentMethods[0]?.name || "โอนเงิน");
    setBatchNotes("");
    setBatchWht("");
    setBatchDialog(true);
  };

  const whtAmount = parseFloat(batchWht) || 0;
  const netPayAmount = selectedTotal - whtAmount;

  const submitBatchPayment = () => {
    batchPayment.mutate({
      companyId,
      documents: selectedDocsList.map(d => ({
        docType: d.docType,
        docId: d.id,
        docNo: d.docNo,
        amount: d.totalAmount,
        contactName: d.contactName,
        vendorId: d.vendorId || null,
      })),
      paymentMethod: batchMethod,
      paymentDate: batchDate,
      notes: batchNotes,
      withholdingTax: batchWht,
    });
  };

  const openSinglePayDialog = (doc: any) => {
    setSingleMethod(activePaymentMethods[0]?.name || "โอนเงิน");
    setSingleDate(toLocalDateStr(new Date()));
    setSingleNotes(`จ่ายเงิน ${doc.docNo}`);
    setSingleWht("");
    setSinglePayDialog({ open: true, doc });
  };

  const submitSinglePay = () => {
    if (!singlePayDialog.doc) return;
    const doc = singlePayDialog.doc;
    const wht = parseFloat(singleWht) || 0;
    singlePay.mutate({
      companyId,
      documents: [{
        docType: doc.docType,
        docId: doc.id,
        docNo: doc.docNo,
        amount: doc.totalAmount,
        contactName: doc.contactName,
        vendorId: doc.vendorId || null,
      }],
      paymentMethod: singleMethod,
      paymentDate: singleDate,
      notes: singleNotes,
      withholdingTax: String(wht),
    });
  };

  const togglePvExpand = (id: number) => {
    const next = new Set(expandedPvs);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedPvs(next);
  };

  useEffect(() => {
    if (!searchStr || !documents.length) return;
    const params = new URLSearchParams(searchStr);
    const apId = params.get("apId");
    if (!apId) return;
    const target = documents.find((d: any) => d.docType === "AP" && String(d.id) === apId);
    if (target) {
      const key = docKey(target);
      setSelectedDocs(new Set([key]));
      setActiveTab("billing");
    }
  }, [searchStr, documents]);

  const singleDoc = singlePayDialog.doc;
  const singleWhtAmt = parseFloat(singleWht) || 0;
  const singleNetPay = singleDoc ? singleDoc.totalAmount - singleWhtAmt : 0;

  return (
    <Layout>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800" data-testid="text-page-title">จ่ายเงิน / วางบิล</h1>
          <p className="text-sm text-muted-foreground">ติดตามและบันทึกการจ่ายชำระเงินให้ผู้ขาย</p>
        </div>
        {selectedDocs.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-sm px-3 py-1">
              เลือก {selectedDocs.size} รายการ = ฿{fmt(selectedTotal)}
            </Badge>
            {canBatchPay ? (
              <Button
                size="sm"
                style={{ background: "#03c9d7" }}
                onClick={openBatchDialog}
                data-testid="button-batch-pay"
              >
                <ListChecks className="h-4 w-4 mr-1" />
                รวมจ่ายเงิน {selectedDocs.size} รายการ
              </Button>
            ) : selectedVendors.size > 1 ? (
              <span className="text-xs text-red-500">กรุณาเลือกผู้ขายเดียวกันเท่านั้น</span>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => setSelectedDocs(new Set())} data-testid="button-clear-selection">
              ล้างการเลือก
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">เอกสารค้างจ่าย</p>
                <p className="text-lg font-bold text-gray-800" data-testid="text-unpaid-count">{documents.filter(d => d.paymentStatus !== "paid").length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ยอดค้างจ่ายรวม</p>
                <p className="text-lg font-bold text-gray-800" data-testid="text-unpaid-total">฿{fmt(totalUnpaid)}</p>
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
                <p className="text-[11px] text-muted-foreground">เกินกำหนด</p>
                <p className="text-lg font-bold text-red-600" data-testid="text-overdue-count">{overdueCount} ({fmt(overdueAmount)})</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">ผู้ขายค้างจ่าย</p>
                <p className="text-lg font-bold text-gray-800" data-testid="text-vendor-count">{vendorCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 border-b">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "billing" ? "border-[#03c9d7] text-[#03c9d7]" : "border-transparent text-muted-foreground hover:text-gray-700"}`}
          onClick={() => setActiveTab("billing")}
          data-testid="tab-billing"
        >
          <FileText className="h-4 w-4 inline mr-1.5" />
          เอกสารค้างจ่าย
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "history" ? "border-[#03c9d7] text-[#03c9d7]" : "border-transparent text-muted-foreground hover:text-gray-700"}`}
          onClick={() => setActiveTab("history")}
          data-testid="tab-history"
        >
          <Receipt className="h-4 w-4 inline mr-1.5" />
          ประวัติจ่ายเงิน ({recentPVs.length})
        </button>
      </div>

      {activeTab === "billing" && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <CardTitle className="text-base">รายการเอกสารค้างจ่าย</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="ค้นหาเลขที่เอกสาร, ผู้ขาย..."
                    className="pl-8 h-9 text-sm w-[220px]"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    data-testid="input-search"
                  />
                </div>
                <Select value={filter} onValueChange={(v: any) => setFilter(v)}>
                  <SelectTrigger className="h-9 w-[150px] text-sm" data-testid="select-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    <SelectItem value="unpaid">ยังไม่ชำระ</SelectItem>
                    <SelectItem value="partial">ชำระบางส่วน</SelectItem>
                    <SelectItem value="overdue">เกินกำหนด</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : grouped.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                ไม่พบเอกสารค้างจ่าย
              </div>
            ) : (
              <div className="divide-y">
                {grouped.map(([vendor, docs]) => {
                  const vendorKeys = docs.map(docKey);
                  const allSelected = vendorKeys.every(k => selectedDocs.has(k));
                  const someSelected = vendorKeys.some(k => selectedDocs.has(k));
                  return (
                    <div key={vendor}>
                      <div className="px-4 py-2.5 bg-gray-50/80 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={allSelected}
                            className={someSelected && !allSelected ? "opacity-50" : ""}
                            onCheckedChange={() => toggleVendor(docs)}
                            data-testid={`checkbox-vendor-${vendor}`}
                          />
                          <Users className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-sm font-semibold text-gray-700">{vendor}</span>
                          <Badge variant="outline" className="text-[10px]">{docs.length} รายการ</Badge>
                        </div>
                        <span className="text-sm font-bold" style={{ color: "#03c9d7" }}>
                          ฿{fmt(docs.reduce((s: number, d: any) => s + d.totalAmount, 0))}
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {docs.map((doc: any) => (
                          <div key={`${doc.docType}-${doc.id}`} className="px-4 py-3 hover:bg-gray-50/50 transition-colors" data-testid={`doc-item-${doc.docType}-${doc.id}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={selectedDocs.has(docKey(doc))}
                                  onCheckedChange={() => toggleDoc(doc)}
                                  data-testid={`checkbox-doc-${doc.docType}-${doc.id}`}
                                />
                                <Badge className={`text-[9px] border-0 ${doc.docType === "AP" ? "bg-orange-100 text-orange-700" : "bg-pink-100 text-pink-700"}`}>
                                  {doc.docType === "AP" ? "ใบซื้อ" : "ค่าใช้จ่าย"}
                                </Badge>
                                <span className="text-sm font-medium text-gray-800">{doc.docNo}</span>
                                {isOverdue(doc.dueDate) && doc.paymentStatus !== "paid" && (
                                  <Badge className="text-[9px] bg-red-100 text-red-600 border-0">เกินกำหนด</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {statusBadge(doc.paymentStatus)}
                                {doc.paymentStatus !== "paid" && (
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    style={{ background: "#03c9d7" }}
                                    onClick={() => openSinglePayDialog(doc)}
                                    disabled={singlePay.isPending}
                                    data-testid={`button-pay-${doc.docType}-${doc.id}`}
                                  >
                                    <CreditCard className="h-3 w-3 mr-1" />
                                    จ่ายเงิน
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                              <div className="flex items-center gap-4">
                                <span>วันที่: {formatDate(doc.docDate, dateEra, dateFmt)}</span>
                                {doc.dueDate && (
                                  <span className={isOverdue(doc.dueDate) && doc.paymentStatus !== "paid" ? "text-red-500 font-medium" : ""}>
                                    ครบกำหนด: {formatDate(doc.dueDate, dateEra, dateFmt)}
                                  </span>
                                )}
                              </div>
                              <span className="text-base font-bold text-gray-800">฿{fmt(doc.totalAmount)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "history" && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">ประวัติจ่ายเงิน</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {recentPVs.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground">
                <Receipt className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                ยังไม่มีประวัติการจ่ายเงิน
              </div>
            ) : (
              <div className="divide-y">
                {recentPVs.map((pv: any) => {
                  const isExpanded = expandedPvs.has(pv.id);
                  const isDeleting = deletingPvId === pv.id;
                  return (
                    <div key={pv.id} data-testid={`pv-item-${pv.id}`}>
                      <div className="px-4 py-3 hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div
                            className="flex items-center gap-2 flex-1 cursor-pointer"
                            onClick={() => togglePvExpand(pv.id)}
                          >
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                            <Badge className="text-[9px] bg-cyan-100 text-cyan-700 border-0">PV</Badge>
                            <span className="text-sm font-medium text-gray-800">{pv.pvNo}</span>
                            <span className="text-xs text-muted-foreground">{pv.vendorName}</span>
                            {pv.linkedDocs?.length > 1 && (
                              <Badge variant="outline" className="text-[9px]">
                                <Link2 className="h-3 w-3 mr-0.5" />
                                {pv.linkedDocs.length} เอกสาร
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground">{formatDate(pv.pvDate, dateEra, dateFmt)}</span>
                            <Badge className="text-[9px] bg-blue-50 text-blue-600 border-0">{pv.paymentMethod || "โอนเงิน"}</Badge>
                            <span className="text-sm font-bold" style={{ color: "#03c9d7" }}>฿{fmt(pv.totalAmount)}</span>
                            <button
                              data-testid={`button-journal-pv-${pv.id}`}
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const res = await fetch(`/api/journal-entries/by-source/payment-voucher/${pv.id}`, { credentials: "include" });
                                  if (res.ok) {
                                    const j = await res.json();
                                    if (j?.id) navigate(`/journal/edit/${j.id}`);
                                  }
                                } catch {}
                              }}
                              className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 hover:underline"
                            >
                              <BookOpen className="h-3 w-3" />ดูบัญชี
                            </button>
                            {isDeleting ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => deletePv.mutate(pv.id)}
                                  disabled={deletePv.isPending}
                                  data-testid={`button-confirm-delete-pv-${pv.id}`}
                                >
                                  {deletePv.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "ยืนยันลบ"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => setDeletingPvId(null)}
                                  data-testid={`button-cancel-delete-pv-${pv.id}`}
                                >
                                  ยกเลิก
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                                onClick={(e) => { e.stopPropagation(); setDeletingPvId(pv.id); }}
                                data-testid={`button-delete-pv-${pv.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      {isExpanded && pv.linkedDocs?.length > 0 && (
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
                                {pv.linkedDocs.map((ld: any, i: number) => (
                                  <tr key={i}>
                                    <td className="px-3 py-1.5">
                                      <Badge className={`text-[8px] border-0 ${ld.docType === "AP" ? "bg-orange-100 text-orange-700" : "bg-pink-100 text-pink-700"}`}>
                                        {ld.docType === "AP" ? "ใบซื้อ" : "ค่าใช้จ่าย"}
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
      )}

      <Dialog open={batchDialog} onOpenChange={(o) => !o && setBatchDialog(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">รวมจ่ายเงินหลายรายการ</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">ผู้ขาย</span>
                <span className="font-medium">{Array.from(selectedVendors)[0] || "-"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">จำนวนเอกสาร</span>
                <span className="font-medium">{selectedDocsList.length} รายการ</span>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">เอกสาร</th>
                    <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">ยอดเงิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedDocsList.map(doc => (
                    <tr key={docKey(doc)}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Badge className={`text-[9px] border-0 ${doc.docType === "AP" ? "bg-orange-100 text-orange-700" : "bg-pink-100 text-pink-700"}`}>
                            {doc.docType === "AP" ? "AP" : "EXP"}
                          </Badge>
                          <span>{doc.docNo}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">฿{fmt(doc.totalAmount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-3 py-2 font-bold">รวมทั้งสิ้น</td>
                    <td className="px-3 py-2 text-right font-bold" style={{ color: "#03c9d7" }}>฿{fmt(selectedTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">วิธีจ่ายเงิน</Label>
                <Select value={batchMethod} onValueChange={setBatchMethod}>
                  <SelectTrigger className="mt-1" data-testid="select-batch-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activePaymentMethods.map((pm: any) => (
                      <SelectItem key={pm.id} value={pm.name}>{pm.name}{pm.bankName ? ` · ${pm.bankName}` : ""}{pm.bankAccountNo ? ` ${pm.bankAccountNo}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">วันที่จ่ายเงิน</Label>
                <ThaiDateInput
                  value={batchDate}
                  onChange={setBatchDate}
                  dateEra={dateEra}
                  dateFmt={dateFmt}
                  className="mt-1"
                  data-testid="input-batch-date"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">ภาษีหัก ณ ที่จ่าย (WHT)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={batchWht}
                  onChange={(e) => setBatchWht(e.target.value)}
                  placeholder="0.00"
                  className="mt-1"
                  data-testid="input-batch-wht"
                />
              </div>
              <div>
                <Label className="text-xs">หมายเหตุ</Label>
                <Input
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  placeholder="จ่ายเงินรวมให้ผู้ขาย..."
                  className="mt-1"
                  data-testid="input-batch-notes"
                />
              </div>
            </div>

            {whtAmount > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-amber-700">ยอดรวม</span>
                  <span className="font-medium">฿{fmt(selectedTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-amber-700">หัก WHT</span>
                  <span className="font-medium text-red-600">-฿{fmt(whtAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-amber-200 pt-1 mt-1">
                  <span className="text-amber-800 font-bold">ยอดจ่ายสุทธิ</span>
                  <span className="font-bold" style={{ color: "#03c9d7" }}>฿{fmt(netPayAmount)}</span>
                </div>
              </div>
            )}

            <JournalPreviewPanel
              companyId={companyId || null}
              documentType="payment"
              subtotal={String(selectedTotal)}
              vatAmount="0"
              withholdingTax={batchWht || "0"}
              paymentMethod={batchMethod}
              linkedInvoiceId={selectedDocsList.length > 0 ? selectedDocsList[0].id : null}
              onLinesChange={setJournalOverrideLines}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDialog(false)}>ยกเลิก</Button>
            <Button
              style={{ background: "#03c9d7" }}
              disabled={batchPayment.isPending}
              onClick={submitBatchPayment}
              data-testid="button-confirm-batch"
            >
              {batchPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ListChecks className="h-4 w-4 mr-1" />}
              ยืนยันรวมจ่ายเงิน ฿{fmt(whtAmount > 0 ? netPayAmount : selectedTotal)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={singlePayDialog.open} onOpenChange={(o) => !o && setSinglePayDialog({ open: false, doc: null })}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">ชำระเงิน — {singleDoc?.docNo}</DialogTitle>
          </DialogHeader>
          {singleDoc && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ผู้ขาย</span>
                  <span className="font-medium">{singleDoc.contactName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ยอดที่ต้องชำระ</span>
                  <span className="font-bold text-base" style={{ color: "#03c9d7" }}>฿{fmt(singleDoc.totalAmount)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">วิธีจ่ายเงิน</Label>
                  <Select value={singleMethod} onValueChange={setSingleMethod}>
                    <SelectTrigger className="mt-1" data-testid="select-single-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activePaymentMethods.map((pm: any) => (
                        <SelectItem key={pm.id} value={pm.name}>{pm.name}{pm.bankName ? ` · ${pm.bankName}` : ""}{pm.bankAccountNo ? ` ${pm.bankAccountNo}` : ""}</SelectItem>
                      ))}
                      {activePaymentMethods.length === 0 && (
                        <SelectItem value="โอนเงิน">โอนเงิน</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">วันที่จ่ายเงิน</Label>
                  <ThaiDateInput
                    value={singleDate}
                    onChange={setSingleDate}
                    dateEra={dateEra}
                    dateFmt={dateFmt}
                    className="mt-1"
                    data-testid="input-single-date"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">ภาษีหัก ณ ที่จ่าย (WHT)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={singleWht}
                    onChange={(e) => setSingleWht(e.target.value)}
                    placeholder="0.00"
                    className="mt-1"
                    data-testid="input-single-wht"
                  />
                </div>
                <div>
                  <Label className="text-xs">หมายเหตุ</Label>
                  <Input
                    value={singleNotes}
                    onChange={(e) => setSingleNotes(e.target.value)}
                    className="mt-1"
                    data-testid="input-single-notes"
                  />
                </div>
              </div>

              {singleWhtAmt > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-amber-700">ยอดรวม</span>
                    <span className="font-medium">฿{fmt(singleDoc.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-amber-700">หัก WHT</span>
                    <span className="font-medium text-red-600">-฿{fmt(singleWhtAmt)}</span>
                  </div>
                  <div className="flex justify-between border-t border-amber-200 pt-1 mt-1">
                    <span className="text-amber-800 font-bold">ยอดจ่ายสุทธิ</span>
                    <span className="font-bold" style={{ color: "#03c9d7" }}>฿{fmt(singleNetPay)}</span>
                  </div>
                </div>
              )}

              <JournalPreviewPanel
                companyId={companyId || null}
                documentType="payment"
                subtotal={String(singleDoc.totalAmount)}
                vatAmount="0"
                withholdingTax={singleWht || "0"}
                paymentMethod={singleMethod}
                linkedInvoiceId={singleDoc.id}
                onLinesChange={() => {}}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSinglePayDialog({ open: false, doc: null })}>ยกเลิก</Button>
            <Button
              style={{ background: "#03c9d7" }}
              disabled={singlePay.isPending}
              onClick={submitSinglePay}
              data-testid="button-confirm-single-pay"
            >
              {singlePay.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CreditCard className="h-4 w-4 mr-1" />}
              ยืนยันชำระ ฿{fmt(singleWhtAmt > 0 ? singleNetPay : (singleDoc?.totalAmount || 0))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </Layout>
  );
}
