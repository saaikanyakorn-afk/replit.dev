import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Wallet, Plus, ArrowDownCircle, ArrowUpCircle, Trash2, Settings2, ChevronRight, Paperclip, ExternalLink, CalendarIcon, X, Pencil } from "lucide-react";
import ThaiDateInput from "@/components/thai-date-input";
import { formatDate } from "@/lib/format";
import { useState } from "react";
import { useLanguage } from "@/hooks/use-language";
import { AccountCombobox } from "@/components/account-combobox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/hooks/use-toast";
import { toLocalDateStr } from "@/lib/utils";

import { useDateSettings } from "@/hooks/use-date-settings";

function formatMoney(v: number) {
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2 });
}


function todayISO() {
  return toLocalDateStr(new Date());
}

export default function PettyCash() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { acctName } = useLanguage();

  const [selectedFundId, setSelectedFundId] = useState<number | null>(null);
  const [fundDialogOpen, setFundDialogOpen] = useState(false);
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [editFundDialogOpen, setEditFundDialogOpen] = useState(false);

  const [fundForm, setFundForm] = useState({ name: "", fundDate: todayISO(), fundLimit: "", custodianName: "", cashAccountCode: "", pettyCashAccountCode: "", notes: "" });
  const [editForm, setEditForm] = useState({ name: "", fundLimit: "", custodianName: "", cashAccountCode: "", pettyCashAccountCode: "", notes: "", status: "active" });
  const [txnForm, setTxnForm] = useState({ txnDate: todayISO(), txnType: "expense", description: "", amount: "", receiptNo: "", expenseAccountCode: "", expenseAccountName: "", vendorName: "", notes: "" });
  const [editingTxnId, setEditingTxnId] = useState<number | null>(null);
  const [existingAttachmentUrl, setExistingAttachmentUrl] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const todayStr = toLocalDateStr(now);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { dateEra, dateFmt } = useDateSettings();
  const { data: docSettings } = useQuery<any>({
    queryKey: ["/api/document-settings", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return null;
      const res = await fetch(`/api/document-settings?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });
  const { data: funds = [] } = useQuery<any[]>({
    queryKey: ["/api/petty-cash/funds", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const r = await fetch(`/api/petty-cash/funds?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const selectedFund = funds.find((f: any) => f.id === selectedFundId);

  const { data: transactions = [] } = useQuery<any[]>({
    queryKey: ["/api/petty-cash/transactions", selectedFundId, dateFrom, dateTo],
    queryFn: async () => {
      if (!selectedFundId) return [];
      const params = new URLSearchParams({ fundId: String(selectedFundId) });
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const r = await fetch(`/api/petty-cash/transactions?${params}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedFundId,
  });

  const { data: accountsList = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const r = await fetch(`/api/accounts?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const expenseAccounts = accountsList.filter((a: any) => a.code >= "500" && a.code < "600");
  const cashBankAccounts = accountsList.filter((a: any) => a.code >= "100" && a.code < "200");
  const pettyCashAccounts = accountsList.filter((a: any) => a.code >= "100" && a.code < "200");

  const createFundMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/petty-cash/funds", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, companyId: selectedCompanyId }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: (fund) => {
      toast({ title: "สร้างวงเงินสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash/funds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      setFundDialogOpen(false);
      setSelectedFundId(fund.id);
      setFundForm({ name: "", fundDate: todayISO(), fundLimit: "", custodianName: "", cashAccountCode: "", pettyCashAccountCode: "", notes: "" });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const updateFundMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/petty-cash/funds/${selectedFundId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "แก้ไขวงเงินสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash/funds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      setEditFundDialogOpen(false);
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  async function uploadFile(file: File): Promise<string> {
    const urlRes = await fetch("/api/uploads/request-url", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!urlRes.ok) throw new Error("ไม่สามารถอัปโหลดไฟล์ได้");
    const { uploadURL, objectPath } = await urlRes.json();
    const uploadRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!uploadRes.ok) throw new Error("อัปโหลดไฟล์ไม่สำเร็จ");
    return objectPath;
  }

  const createTxnMutation = useMutation({
    mutationFn: async (data: any) => {
      let attachmentUrl: string | null = null;
      if (attachmentFile) {
        setUploading(true);
        try { attachmentUrl = await uploadFile(attachmentFile); } finally { setUploading(false); }
      }
      const r = await fetch("/api/petty-cash/transactions", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, fundId: selectedFundId, companyId: selectedCompanyId, attachmentUrl }),
      });
      if (!r.ok) {
        let msg = `เกิดข้อผิดพลาด (${r.status})`;
        const ct = r.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          try { const e = await r.json(); msg = e.message || msg; } catch {}
        } else if (r.status === 403) {
          msg = "ไม่มีสิทธิ์เข้าถึง — กรุณาตรวจสอบสิทธิ์บทบาทพนักงานในตั้งค่าระบบ";
        } else if (r.status === 401) {
          msg = "กรุณาเข้าสู่ระบบใหม่";
        }
        throw new Error(msg);
      }
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("application/json")) throw new Error("เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ กรุณาลองใหม่");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "บันทึกรายการสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash/funds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      setTxnDialogOpen(false);
      setTxnForm({ txnDate: todayISO(), txnType: "expense", description: "", amount: "", receiptNo: "", expenseAccountCode: "", expenseAccountName: "", vendorName: "", notes: "" });
      setAttachmentFile(null);
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const updateTxnMutation = useMutation({
    mutationFn: async (data: any) => {
      let finalAttachmentUrl = existingAttachmentUrl;
      if (attachmentFile) {
        setUploading(true);
        try { finalAttachmentUrl = await uploadFile(attachmentFile); } finally { setUploading(false); }
      }
      const r = await fetch(`/api/petty-cash/transactions/${editingTxnId}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, attachmentUrl: finalAttachmentUrl }),
      });
      if (!r.ok) {
        let msg = `เกิดข้อผิดพลาด (${r.status})`;
        try { const e = await r.json(); msg = e.message || msg; } catch { console.error("PUT /api/petty-cash/transactions non-JSON", r.status); }
        throw new Error(msg);
      }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "แก้ไขรายการสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash/funds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      setTxnDialogOpen(false);
      setEditingTxnId(null);
      setExistingAttachmentUrl(null);
      setTxnForm({ txnDate: todayISO(), txnType: "expense", description: "", amount: "", receiptNo: "", expenseAccountCode: "", expenseAccountName: "", vendorName: "", notes: "" });
      setAttachmentFile(null);
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteFundMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/petty-cash/funds/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "ลบวงเงินสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash/funds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      if (selectedFundId) setSelectedFundId(null);
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const deleteTxnMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/petty-cash/transactions/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "ลบรายการสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/petty-cash/funds"] });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const totalExpenses = transactions.filter((t: any) => t.txnType === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalReplenish = transactions.filter((t: any) => t.txnType === "replenish").reduce((s: number, t: any) => s + Number(t.amount), 0);

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5" style={{ color: "var(--theme-primary)" }} />
            <h1 className="text-xl font-heading font-bold text-foreground" data-testid="text-petty-cash-title">เงินสดย่อย</h1>
          </div>
          <Button size="sm" className="text-white" onClick={() => setFundDialogOpen(true)} data-testid="button-create-fund">
            <Plus className="h-4 w-4 mr-1" /> สร้างวงเงินใหม่
          </Button>
        </div>

        {funds.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Wallet className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground mb-2">ยังไม่มีวงเงินเงินสดย่อย</h3>
              <p className="text-sm text-muted-foreground mb-4">สร้างวงเงินเงินสดย่อยเพื่อเริ่มบันทึกการเบิก-จ่าย</p>
              <Button size="sm" className="text-white" onClick={() => setFundDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> สร้างวงเงินใหม่
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {funds.map((fund: any) => {
                const balance = Number(fund.currentBalance);
                const limit = Number(fund.fundLimit);
                const pct = limit > 0 ? (balance / limit) * 100 : 0;
                const isSelected = fund.id === selectedFundId;
                return (
                  <Card
                    key={fund.id}
                    className={`border shadow-sm cursor-pointer transition-all hover:shadow-md ${isSelected ? "ring-2" : ""}`}
                    style={isSelected ? { borderColor: "var(--theme-primary)" } : undefined}
                    onClick={() => setSelectedFundId(fund.id)}
                    data-testid={`card-fund-${fund.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-sm truncate">{fund.name}</h3>
                        <Badge variant={fund.status === "active" ? "default" : "secondary"} className="text-[10px]" style={fund.status === "active" ? { background: "#05b187" } : undefined}>
                          {fund.status === "active" ? "ใช้งาน" : "ปิด"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">คงเหลือ</span>
                        <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                      </div>
                      <p className="text-2xl font-bold" style={{ color: pct < 20 ? "#f94d4d" : "#05b187" }}>
                        ฿{formatMoney(balance)}
                      </p>
                      <div className="mt-2 bg-blue-50 rounded px-2 py-1.5 flex items-center justify-between">
                        <span className="text-xs font-medium text-blue-700">วงเงินที่ตั้ง</span>
                        <span className="text-sm font-bold text-blue-700">฿{formatMoney(limit)}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: pct < 20 ? "#f94d4d" : "#05b187" }} />
                      </div>
                      {fund.custodianName && (
                        <p className="text-xs text-muted-foreground mt-2">ผู้ดูแล: {fund.custodianName}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {selectedFund && (
              <div className="space-y-4">
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold">{selectedFund.name}</h2>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">รายการเบิก-จ่าย</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setEditForm({ name: selectedFund.name, fundLimit: String(selectedFund.fundLimit), custodianName: selectedFund.custodianName || "", cashAccountCode: selectedFund.cashAccountCode || "", pettyCashAccountCode: selectedFund.pettyCashAccountCode || "", notes: selectedFund.notes || "", status: selectedFund.status }); setEditFundDialogOpen(true); }} data-testid="button-edit-fund">
                          <Settings2 className="h-4 w-4 mr-1" /> แก้ไขวงเงิน
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" disabled={deleteFundMutation.isPending} onClick={() => { if (confirm("ต้องการลบวงเงินนี้หรือไม่? ระบบจะลบรายการบันทึกบัญชีที่เกี่ยวข้องด้วย")) deleteFundMutation.mutate(selectedFund.id); }} data-testid="button-delete-fund">
                          <Trash2 className="h-4 w-4 mr-1" /> ลบวงเงิน
                        </Button>
                        <Button size="sm" style={{ background: "#05b187" }} className="hover:opacity-90 text-white" onClick={() => { setEditingTxnId(null); setExistingAttachmentUrl(null); setAttachmentFile(null); const replenishAmount = Math.max(0, Number(selectedFund.fundLimit) - Number(selectedFund.currentBalance)).toFixed(2); setTxnForm({ txnDate: todayISO(), txnType: "replenish", amount: replenishAmount, description: "เบิกชดเชยเงินสดย่อย", receiptNo: "", expenseAccountCode: "", expenseAccountName: "", vendorName: "", notes: "" }); setTxnDialogOpen(true); }} data-testid="button-replenish">
                          <ArrowDownCircle className="h-4 w-4 mr-1" /> เติมเงิน
                        </Button>
                        <Button size="sm" className="text-white" onClick={() => { setEditingTxnId(null); setExistingAttachmentUrl(null); setAttachmentFile(null); setTxnForm({ txnDate: todayISO(), txnType: "expense", description: "", amount: "", receiptNo: "", expenseAccountCode: "", expenseAccountName: "", vendorName: "", notes: "" }); setTxnDialogOpen(true); }} data-testid="button-expense">
                          <ArrowUpCircle className="h-4 w-4 mr-1" /> เบิกจ่าย
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                        <p className="text-xs font-medium text-blue-600">วงเงินที่ตั้ง</p>
                        <p className="text-lg font-bold text-blue-700">฿{formatMoney(Number(selectedFund.fundLimit))}</p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-xs font-medium text-green-600">คงเหลือ</p>
                        <p className="text-lg font-bold text-green-700">฿{formatMoney(Number(selectedFund.currentBalance))}</p>
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                        <p className="text-xs font-medium text-red-500">เบิกจ่ายทั้งหมด</p>
                        <p className="text-lg font-bold text-red-600">฿{formatMoney(totalExpenses)}</p>
                      </div>
                      <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 text-center">
                        <p className="text-xs font-medium" style={{ color: "#03c9d7" }}>เติมเงินทั้งหมด</p>
                        <p className="text-lg font-bold" style={{ color: "#03c9d7" }}>฿{formatMoney(totalReplenish)}</p>
                      </div>
                    </div>

                    {(selectedFund.custodianName || selectedFund.pettyCashAccountCode || selectedFund.cashAccountCode) && (
                      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-4 text-sm text-muted-foreground border-b pb-3">
                        {selectedFund.custodianName && (
                          <span>ผู้ดูแลวงเงิน: <strong className="text-foreground">{selectedFund.custodianName}</strong></span>
                        )}
                        {selectedFund.pettyCashAccountCode && (
                          <span>บัญชีเงินสดย่อย: <strong className="text-foreground">{selectedFund.pettyCashAccountCode}</strong></span>
                        )}
                        {selectedFund.cashAccountCode && (
                          <span>บัญชีเงินสด: <strong className="text-foreground">{selectedFund.cashAccountCode}</strong></span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">กรองวันที่:</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ThaiDateInput value={dateFrom} onChange={v => setDateFrom(v)} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-date-from" />
                        <span className="text-sm text-muted-foreground">ถึง</span>
                        <ThaiDateInput value={dateTo} onChange={v => setDateTo(v)} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-date-to" />
                      </div>
                      {(dateFrom || dateTo) && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo(""); }} data-testid="button-clear-date-filter">
                          <X className="h-3.5 w-3.5 mr-1" /> ล้างตัวกรอง
                        </Button>
                      )}
                    </div>

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="font-semibold w-[120px]">วันที่</TableHead>
                          <TableHead className="font-semibold">ประเภท</TableHead>
                          <TableHead className="font-semibold">รายละเอียด</TableHead>
                          <TableHead className="font-semibold">เลขที่ใบเสร็จ</TableHead>
                          <TableHead className="font-semibold">ผู้ขาย/ร้านค้า</TableHead>
                          <TableHead className="font-semibold">หมวดค่าใช้จ่าย</TableHead>
                          <TableHead className="font-semibold text-center w-[60px]">เอกสาร</TableHead>
                          <TableHead className="font-semibold text-right">จำนวนเงิน</TableHead>
                          <TableHead className="font-semibold w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                              ยังไม่มีรายการ กดปุ่ม "เบิกจ่าย" หรือ "เติมเงิน" เพื่อเริ่มต้น
                            </TableCell>
                          </TableRow>
                        ) : (
                          transactions.map((txn: any) => (
                            <TableRow key={txn.id} data-testid={`row-txn-${txn.id}`}>
                              <TableCell className="text-sm">{formatDate(txn.txnDate, dateEra, dateFmt)}</TableCell>
                              <TableCell>
                                <Badge
                                  className="text-xs"
                                  style={txn.txnType === "expense"
                                    ? { background: "rgba(249,77,77,0.1)", color: "#f94d4d", border: "1px solid rgba(249,77,77,0.2)" }
                                    : { background: "rgba(5,177,135,0.1)", color: "#05b187", border: "1px solid rgba(5,177,135,0.2)" }
                                  }
                                >
                                  {txn.txnType === "expense" ? "เบิกจ่าย" : "เติมเงิน"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{txn.description}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{txn.receiptNo || "-"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{txn.vendorName || "-"}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{txn.expenseAccountName || "-"}</TableCell>
                              <TableCell className="text-center">
                                {txn.attachmentUrl ? (
                                  <a href={txn.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center text-[var(--theme-primary)] hover:text-[var(--theme-primary)]" data-testid={`link-attachment-${txn.id}`}>
                                    <Paperclip className="h-4 w-4" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground/30">-</span>
                                )}
                              </TableCell>
                              <TableCell className={`text-sm text-right font-medium ${txn.txnType === "expense" ? "text-red-600" : "text-green-600"}`}>
                                {txn.txnType === "expense" ? "-" : "+"}฿{formatMoney(Number(txn.amount))}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-blue-500" onClick={() => {
                                  setEditingTxnId(txn.id);
                                  setTxnForm({
                                    txnDate: txn.txnDate || todayISO(),
                                    txnType: txn.txnType,
                                    description: txn.description || "",
                                    amount: String(txn.amount),
                                    receiptNo: txn.receiptNo || "",
                                    expenseAccountCode: txn.expenseAccountCode || "",
                                    expenseAccountName: txn.expenseAccountName || "",
                                    vendorName: txn.vendorName || "",
                                    notes: txn.notes || "",
                                  });
                                  setExistingAttachmentUrl(txn.attachmentUrl || null);
                                  setAttachmentFile(null);
                                  setTxnDialogOpen(true);
                                }} data-testid={`button-edit-txn-${txn.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => { if (confirm("ต้องการลบรายการนี้?")) deleteTxnMutation.mutate(txn.id); }} data-testid={`button-delete-txn-${txn.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={fundDialogOpen} onOpenChange={setFundDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>สร้างวงเงินเงินสดย่อย</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ชื่อวงเงิน *</Label>
              <Input value={fundForm.name} onChange={e => setFundForm(f => ({ ...f, name: e.target.value }))} placeholder="เช่น เงินสดย่อยสำนักงาน" data-testid="input-fund-name" />
            </div>
            <div>
              <Label>วันที่ตั้งวงเงิน *</Label>
              <ThaiDateInput value={fundForm.fundDate} onChange={(v: string) => setFundForm(f => ({ ...f, fundDate: v }))} dateEra={dateEra} dateFormat={dateFmt} data-testid="input-fund-date" />
            </div>
            <div>
              <Label>วงเงิน (บาท) *</Label>
              <Input type="number" value={fundForm.fundLimit} onChange={e => setFundForm(f => ({ ...f, fundLimit: e.target.value }))} placeholder="10000" data-testid="input-fund-limit" />
            </div>
            <div>
              <Label>ผู้ดูแลวงเงิน</Label>
              <Input value={fundForm.custodianName} onChange={e => setFundForm(f => ({ ...f, custodianName: e.target.value }))} placeholder="ชื่อผู้รับผิดชอบ" data-testid="input-fund-custodian" />
            </div>
            <AccountCombobox
              accounts={pettyCashAccounts}
              value={fundForm.pettyCashAccountCode}
              onSelect={acc => setFundForm(f => ({ ...f, pettyCashAccountCode: acc.code }))}
              placeholder="เช่น 1115 เงินสดย่อย"
              testId="select-fund-petty-account"
              label="บัญชีเงินสดย่อย (Dr)"
            />
            <AccountCombobox
              accounts={cashBankAccounts}
              value={fundForm.cashAccountCode}
              onSelect={acc => setFundForm(f => ({ ...f, cashAccountCode: acc.code }))}
              placeholder="เช่น 1110 เงินสด"
              testId="select-fund-cash-account"
              label="บัญชีเงินสด/ธนาคารที่จ่าย (Cr)"
            />
            <div>
              <Label>หมายเหตุ</Label>
              <Textarea value={fundForm.notes} onChange={e => setFundForm(f => ({ ...f, notes: e.target.value }))} rows={2} data-testid="input-fund-notes" />
            </div>
            <Button className="w-full text-white" disabled={!fundForm.name || !fundForm.fundLimit || createFundMutation.isPending} onClick={() => createFundMutation.mutate(fundForm)} data-testid="button-save-fund">
              {createFundMutation.isPending ? "กำลังบันทึก..." : "สร้างวงเงิน"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editFundDialogOpen} onOpenChange={setEditFundDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>แก้ไขวงเงิน</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>ชื่อวงเงิน</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} data-testid="input-edit-fund-name" />
            </div>
            <div>
              <Label>วงเงิน (บาท)</Label>
              <Input type="number" value={editForm.fundLimit} onChange={e => setEditForm(f => ({ ...f, fundLimit: e.target.value }))} data-testid="input-edit-fund-limit" />
            </div>
            <div>
              <Label>ผู้ดูแลวงเงิน</Label>
              <Input value={editForm.custodianName} onChange={e => setEditForm(f => ({ ...f, custodianName: e.target.value }))} data-testid="input-edit-fund-custodian" />
            </div>
            <AccountCombobox
              accounts={pettyCashAccounts}
              value={editForm.pettyCashAccountCode}
              onSelect={acc => setEditForm(f => ({ ...f, pettyCashAccountCode: acc.code }))}
              placeholder="เช่น 1115 เงินสดย่อย"
              testId="select-edit-petty-account"
              label="บัญชีเงินสดย่อย (Dr)"
            />
            <AccountCombobox
              accounts={cashBankAccounts}
              value={editForm.cashAccountCode}
              onSelect={acc => setEditForm(f => ({ ...f, cashAccountCode: acc.code }))}
              placeholder="เช่น 1110 เงินสด"
              testId="select-edit-cash-account"
              label="บัญชีเงินสด/ธนาคารที่จ่าย (Cr)"
            />
            <div>
              <Label>หมายเหตุ</Label>
              <Textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} data-testid="input-edit-fund-notes" />
            </div>
            <div>
              <Label>สถานะ</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger data-testid="select-fund-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">ใช้งาน</SelectItem>
                  <SelectItem value="closed">ปิดวงเงิน</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full text-white" disabled={updateFundMutation.isPending} onClick={() => updateFundMutation.mutate(editForm)} data-testid="button-update-fund">
              {updateFundMutation.isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={txnDialogOpen} onOpenChange={(open) => { setTxnDialogOpen(open); if (!open) { setEditingTxnId(null); setExistingAttachmentUrl(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTxnId ? "แก้ไขรายการ" : (txnForm.txnType === "expense" ? "เบิกจ่ายเงินสดย่อย" : "เติมเงิน (ชดเชย)")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>วันที่ *</Label>
                <ThaiDateInput value={txnForm.txnDate} onChange={v => setTxnForm(f => ({ ...f, txnDate: v }))} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-txn-date" />
              </div>
              <div>
                <Label>จำนวนเงิน (บาท) *</Label>
                <Input type="number" value={txnForm.amount} onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" data-testid="input-txn-amount" />
              </div>
            </div>
            <div>
              <Label>รายละเอียด *</Label>
              <Input value={txnForm.description} onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))} placeholder={txnForm.txnType === "expense" ? "เช่น ค่าแท็กซี่, ค่าอาหารประชุม" : "เช่น เบิกชดเชยเงินสดย่อย"} data-testid="input-txn-description" />
            </div>
            {txnForm.txnType === "expense" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>เลขที่ใบเสร็จ</Label>
                    <Input value={txnForm.receiptNo} onChange={e => setTxnForm(f => ({ ...f, receiptNo: e.target.value }))} placeholder="เลขที่ใบเสร็จ" data-testid="input-txn-receipt" />
                  </div>
                  <div>
                    <Label>ผู้ขาย/ร้านค้า</Label>
                    <Input value={txnForm.vendorName} onChange={e => setTxnForm(f => ({ ...f, vendorName: e.target.value }))} placeholder="ชื่อร้านค้า" data-testid="input-txn-vendor" />
                  </div>
                </div>
                <AccountCombobox
                  accounts={expenseAccounts}
                  value={txnForm.expenseAccountCode}
                  onSelect={acc => setTxnForm(f => ({ ...f, expenseAccountCode: acc.code, expenseAccountName: acctName(acc) }))}
                  testId="input-txn-account-search"
                  label="หมวดค่าใช้จ่าย *"
                />
              </>
            )}
            <div>
              <Label>แนบเอกสาร/ใบเสร็จ</Label>
              <div className="mt-1">
                {attachmentFile ? (
                  <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/30">
                    <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate flex-1">{attachmentFile.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">({(attachmentFile.size / 1024).toFixed(0)} KB)</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500" onClick={() => setAttachmentFile(null)} data-testid="button-remove-attachment">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : existingAttachmentUrl ? (
                  <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/30">
                    <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <a href={existingAttachmentUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate flex-1">ไฟล์แนบปัจจุบัน</a>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500" onClick={() => setExistingAttachmentUrl(null)} data-testid="button-remove-existing-attachment">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                    <label className="cursor-pointer text-xs text-blue-500 hover:underline flex-shrink-0">
                      เปลี่ยน
                      <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => { if (e.target.files?.[0]) setAttachmentFile(e.target.files[0]); }} />
                    </label>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 border border-dashed rounded-md px-3 py-3 cursor-pointer hover:bg-muted/30 transition-colors" data-testid="label-upload-attachment">
                    <Paperclip className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">คลิกเพื่อแนบไฟล์ (รูปภาพ, PDF)</span>
                    <input type="file" className="hidden" accept="image/*,.pdf" onChange={e => { if (e.target.files?.[0]) setAttachmentFile(e.target.files[0]); }} data-testid="input-attachment-file" />
                  </label>
                )}
              </div>
            </div>
            <div>
              <Label>หมายเหตุ</Label>
              <Textarea value={txnForm.notes} onChange={e => setTxnForm(f => ({ ...f, notes: e.target.value }))} rows={2} data-testid="input-txn-notes" />
            </div>
            {selectedFund && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ยอดคงเหลือปัจจุบัน</span>
                  <span className="font-medium">฿{formatMoney(Number(selectedFund.currentBalance))}</span>
                </div>
                {txnForm.amount && (
                  <div className="flex justify-between mt-1">
                    <span className="text-muted-foreground">หลังบันทึก</span>
                    <span className={`font-bold ${txnForm.txnType === "expense" ? "text-red-600" : "text-green-600"}`}>
                      ฿{formatMoney(
                        txnForm.txnType === "expense"
                          ? Number(selectedFund.currentBalance) - Number(txnForm.amount)
                          : Number(selectedFund.currentBalance) + Number(txnForm.amount)
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
            <Button
              className="w-full text-white"
              style={{ background: txnForm.txnType === "expense" ? "var(--theme-primary)" : "#05b187" }}
              disabled={!txnForm.description || !txnForm.amount || (txnForm.txnType === "expense" && !txnForm.expenseAccountCode) || createTxnMutation.isPending || updateTxnMutation.isPending || uploading}
              onClick={() => editingTxnId ? updateTxnMutation.mutate(txnForm) : createTxnMutation.mutate(txnForm)}
              data-testid="button-save-txn"
            >
              {(createTxnMutation.isPending || updateTxnMutation.isPending || uploading)
                ? "กำลังบันทึก..."
                : editingTxnId
                  ? "บันทึกการแก้ไข"
                  : (txnForm.txnType === "expense" ? "บันทึกการเบิกจ่าย" : "บันทึกการเติมเงิน")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
