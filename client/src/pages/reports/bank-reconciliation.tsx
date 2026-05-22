import { useState, useMemo } from "react";
import ReportLayout from "@/components/report-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox } from "@/components/account-combobox";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useLanguage } from "@/hooks/use-language";
import { formatDate } from "@/lib/format";
import { useDateSettings } from "@/hooks/use-date-settings";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Upload, Link2, Unlink, CheckCircle2, AlertCircle, RefreshCw, Printer, FileDown, FileText, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

const MONTHS = [
  { value: "1", label: "มกราคม" },
  { value: "2", label: "กุมภาพันธ์" },
  { value: "3", label: "มีนาคม" },
  { value: "4", label: "เมษายน" },
  { value: "5", label: "พฤษภาคม" },
  { value: "6", label: "มิถุนายน" },
  { value: "7", label: "กรกฎาคม" },
  { value: "8", label: "สิงหาคม" },
  { value: "9", label: "กันยายน" },
  { value: "10", label: "ตุลาคม" },
  { value: "11", label: "พฤศจิกายน" },
  { value: "12", label: "ธันวาคม" },
];


function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  if (n === 0) return "-";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


interface BankStatement {
  id: number;
  companyId: number;
  accountCode: string | null;
  accountName: string | null;
  bankName: string | null;
  statementDate: string;
  description: string | null;
  debitAmount: string;
  creditAmount: string;
  balance: string;
  reference: string | null;
  isReconciled: boolean;
  matchedJournalId: number | null;
}

interface JournalEntryWithLines {
  id: number;
  entryDate: string;
  reference: string | null;
  description: string | null;
  totalDebit: number;
  totalCredit: number;
}

export default function BankReconciliation() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const { dateEra, dateFmt } = useDateSettings();
  const { acctName } = useLanguage();
  const queryClient = useQueryClient();

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [accountCode, setAccountCode] = useState("all");
  const [selectedStatementId, setSelectedStatementId] = useState<number | null>(null);
  const [selectedJournalId, setSelectedJournalId] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<"csv" | "pdf">("pdf");
  const [csvText, setCsvText] = useState("");
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfBankName, setPdfBankName] = useState("");
  const [pdfAccountNo, setPdfAccountNo] = useState("");

  const startDate = `${year}-${month.padStart(2, "0")}-01`;
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const endDate = `${year}-${month.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const statementsQuery = useQuery<{ statements: BankStatement[]; summary: any }>({
    queryKey: ["/api/bank-reconciliation/statements", companyId, month, year, accountCode],
    queryFn: async () => {
      let url = `/api/bank-reconciliation/statements?companyId=${companyId}&month=${month}&year=${year}`;
      if (accountCode !== "all") url += `&accountCode=${accountCode}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!companyId,
  });

  const accountsQuery = useQuery<any[]>({
    queryKey: ["/api/accounts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const r = await fetch(`/api/accounts?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
  });
  const bankAccountsList = (accountsQuery.data || []).filter((a: any) => !a.isHeader && a.code?.startsWith("1"));

  const journalQuery = useQuery<JournalEntryWithLines[]>({
    queryKey: ["/api/bank-reconciliation/journal-entries", companyId, startDate, endDate, accountCode],
    queryFn: async () => {
      let url = `/api/bank-reconciliation/journal-entries?companyId=${companyId}&startDate=${startDate}&endDate=${endDate}`;
      if (accountCode !== "all") url += `&accountCode=${accountCode}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!companyId,
  });

  const matchMutation = useMutation({
    mutationFn: async ({ statementId, journalEntryId }: { statementId: number; journalEntryId: number }) => {
      const res = await fetch("/api/bank-reconciliation/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ statementId, journalEntryId, companyId }),
      });
      if (!res.ok) throw new Error("Match failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "จับคู่สำเร็จ" });
      setSelectedStatementId(null);
      setSelectedJournalId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/bank-reconciliation/statements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-reconciliation/journal-entries"] });
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const unmatchMutation = useMutation({
    mutationFn: async (statementId: number) => {
      const res = await fetch("/api/bank-reconciliation/unmatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ statementId, companyId }),
      });
      if (!res.ok) throw new Error("Unmatch failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "ยกเลิกการจับคู่สำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-reconciliation/statements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-reconciliation/journal-entries"] });
    },
    onError: () => toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" }),
  });

  const importMutation = useMutation({
    mutationFn: async (statements: any[]) => {
      const res = await fetch("/api/bank-reconciliation/statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyId,
          statements: statements.map(s => ({
            ...s,
            accountCode: accountCode !== "all" ? accountCode : s.accountCode || null,
            accountName: bankAccountsList.find((b: any) => b.code === accountCode)?.nameTh || bankAccountsList.find((b: any) => b.code === accountCode)?.name || null,
          })),
        }),
      });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `นำเข้าสำเร็จ ${data.inserted} รายการ` });
      setImportOpen(false);
      setCsvText("");
      setPreviewRows([]);
      queryClient.invalidateQueries({ queryKey: ["/api/bank-reconciliation/statements"] });
    },
    onError: () => toast({ title: "นำเข้าล้มเหลว", variant: "destructive" }),
  });

  const statements = statementsQuery.data?.statements || [];
  const summary = statementsQuery.data?.summary || { totalDebit: 0, totalCredit: 0, unreconciledCount: 0, totalCount: 0 };
  const journalEntries = journalQuery.data || [];

  const reconciledCount = summary.totalCount - summary.unreconciledCount;
  const reconciliationRate = summary.totalCount > 0 ? ((reconciledCount / summary.totalCount) * 100).toFixed(1) : "0";

  const handlePrint = () => {
    window.print();
  };

  const handleExcel = () => {
    const rows: (string | number)[][] = [];
    rows.push(["กระทบยอดธนาคาร"]);
    rows.push([`เดือน: ${MONTHS.find(m => m.value === month)?.label || ""} ${year}`]);
    rows.push([]);

    rows.push(["รายการจากธนาคาร (Bank Statements)"]);
    rows.push(["วันที่", "รายละเอียด", "เดบิต", "เครดิต", "ยอดคงเหลือ", "สถานะ"]);
    statements.forEach((s) => {
      rows.push([
        formatDate(s.statementDate, dateEra, dateFmt),
        s.description || "-",
        parseFloat(String(s.debitAmount || "0")),
        parseFloat(String(s.creditAmount || "0")),
        parseFloat(String(s.balance || "0")),
        s.isReconciled ? "จับคู่แล้ว" : "รอจับคู่",
      ]);
    });

    rows.push([]);
    rows.push(["รายการจากระบบ (Journal Entries)"]);
    rows.push(["วันที่", "เลขที่", "รายละเอียด", "เดบิต", "เครดิต"]);
    journalEntries.forEach((je) => {
      rows.push([
        formatDate(je.entryDate, dateEra, dateFmt),
        je.reference || "-",
        je.description || "-",
        je.totalDebit,
        je.totalCredit,
      ]);
    });

    rows.push([]);
    rows.push(["สรุป"]);
    rows.push(["จำนวนรายการธนาคาร", summary.totalCount]);
    rows.push(["จับคู่แล้ว", reconciledCount]);
    rows.push(["ยังไม่จับคู่", summary.unreconciledCount]);
    rows.push(["อัตราการกระทบยอด (%)", parseFloat(reconciliationRate)]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bank Reconciliation");
    XLSX.writeFile(wb, "bank-reconciliation.xlsx");
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfParsing(true);
    setPdfBankName("");
    setPdfAccountNo("");
    setPreviewRows([]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/bank-reconciliation/parse-pdf", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "PDF parse failed");
      }
      const data = await res.json();
      setPdfBankName(data.bankName || "");
      setPdfAccountNo(data.accountNumber || "");
      if (data.transactions && data.transactions.length > 0) {
        setPreviewRows(data.transactions);
        toast({ title: `อ่าน PDF สำเร็จ พบ ${data.transactions.length} รายการ` });
      } else {
        toast({ title: "ไม่พบรายการธุรกรรมใน PDF", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: err.message || "ไม่สามารถอ่าน PDF ได้", variant: "destructive" });
    } finally {
      setPdfParsing(false);
      e.target.value = "";
    }
  };

  const parseCsv = () => {
    if (!csvText.trim()) return;
    const lines = csvText.trim().split("\n");
    const rows: any[] = [];
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
      if (cols.length < 4) continue;
      if (i === 0 && (cols[0].toLowerCase().includes("date") || cols[0].includes("วันที่"))) continue;
      rows.push({
        statementDate: cols[0],
        description: cols[1] || "",
        debitAmount: cols[2] || "0",
        creditAmount: cols[3] || "0",
        balance: cols[4] || "0",
        reference: cols[5] || "",
      });
    }
    setPreviewRows(rows);
  };

  const handleImport = () => {
    if (previewRows.length === 0) return;
    const cleaned = previewRows.map(r => {
      let dateStr = r.statementDate;
      if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        if (parts.length === 3) {
          let [d, m, y] = parts;
          if (Number(y) > 2500) y = String(Number(y) - 543);
          if (d.length === 4) { [y, m, d] = [d, m, parts[2]]; }
          dateStr = `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
      }
      return {
        ...r,
        statementDate: dateStr,
        debitAmount: String(parseFloat(String(r.debitAmount).replace(/,/g, "")) || 0),
        creditAmount: String(parseFloat(String(r.creditAmount).replace(/,/g, "")) || 0),
        balance: String(parseFloat(String(r.balance).replace(/,/g, "")) || 0),
      };
    });
    importMutation.mutate(cleaned);
  };

  const years = useMemo(() => {
    const curr = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => String(curr - i));
  }, []);

  return (
    <ReportLayout fullWidth title="กระทบยอดธนาคาร" icon={<Building2 className="h-5 w-5" />}>
      <div className="space-y-4" data-testid="page-bank-reconciliation">

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">บัญชีธนาคาร</label>
            <AccountCombobox
              accounts={bankAccountsList}
              value={accountCode}
              onSelect={acc => setAccountCode(acc.code)}
              testId="select-account-code"
              topOption={{ value: "all", label: "ทั้งหมด" }}
              className="w-[220px]"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">เดือน</label>
            <Select value={month} onValueChange={setMonth} data-testid="select-month">
              <SelectTrigger className="w-[160px]" data-testid="trigger-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">ปี</label>
            <Select value={year} onValueChange={setYear} data-testid="select-year">
              <SelectTrigger className="w-[120px]" data-testid="trigger-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="border-green-400 text-green-600 hover:bg-green-50" onClick={() => { statementsQuery.refetch(); journalQuery.refetch(); }} disabled={statementsQuery.isLoading || journalQuery.isLoading} data-testid="button-generate">
            <RefreshCw className={`w-4 h-4 mr-2 ${statementsQuery.isLoading ? "animate-spin" : ""}`} />
            สร้างรายงาน
          </Button>
          <Button onClick={() => setImportOpen(true)} className="bg-[#fb9678] hover:bg-[#e8866a]" data-testid="button-import">
            <Upload className="w-4 h-4 mr-2" />
            นำเข้ารายการ
          </Button>
          <Button variant="outline" className="h-8 gap-1.5 text-xs" onClick={handlePrint} data-testid="button-print">
            <Printer className="w-4 h-4" />
            พิมพ์
          </Button>
          <Button className="h-8 gap-1.5 text-xs bg-[#05b187] text-white hover:bg-[#049a75] border-none" onClick={handleExcel} data-testid="button-excel">
            <FileDown className="w-4 h-4" />
            Excel
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-muted-foreground">จำนวนรายการธนาคาร</div>
              <div className="text-2xl font-bold text-[#03c9d7]" data-testid="text-total-count">{summary.totalCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-muted-foreground">จับคู่แล้ว</div>
              <div className="text-2xl font-bold text-green-600" data-testid="text-reconciled-count">{reconciledCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-muted-foreground">ยังไม่จับคู่</div>
              <div className="text-2xl font-bold text-orange-500" data-testid="text-unreconciled-count">{summary.unreconciledCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm text-muted-foreground">อัตราการกระทบยอด</div>
              <div className="text-2xl font-bold text-[#fb9678]" data-testid="text-reconciliation-rate">{reconciliationRate}%</div>
            </CardContent>
          </Card>
        </div>

        {selectedStatementId && selectedJournalId && (
          <div className="flex justify-center">
            <Button
              size="lg"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => matchMutation.mutate({ statementId: selectedStatementId, journalEntryId: selectedJournalId })}
              disabled={matchMutation.isPending}
              data-testid="button-match"
            >
              <Link2 className="w-4 h-4 mr-2" />
              จับคู่
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <h3 className="font-semibold text-lg">รายการจากธนาคาร (Bank Statements)</h3>
            </CardHeader>
            <CardContent className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>รายละเอียด</TableHead>
                    <TableHead className="text-right">เดบิต</TableHead>
                    <TableHead className="text-right">เครดิต</TableHead>
                    <TableHead className="text-right">ยอดคงเหลือ</TableHead>
                    <TableHead className="text-center">สถานะ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        ไม่มีรายการ - กดปุ่ม "นำเข้ารายการ" เพื่อเริ่มต้น
                      </TableCell>
                    </TableRow>
                  ) : (
                    statements.map((s) => (
                      <TableRow
                        key={s.id}
                        className={`cursor-pointer transition-colors ${
                          selectedStatementId === s.id ? "bg-blue-50 dark:bg-blue-900/30" : ""
                        } ${!s.isReconciled ? "bg-orange-50/50 dark:bg-orange-900/10" : ""}`}
                        onClick={() => {
                          if (s.isReconciled) return;
                          setSelectedStatementId(selectedStatementId === s.id ? null : s.id);
                        }}
                        data-testid={`row-statement-${s.id}`}
                      >
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(s.statementDate, dateEra, dateFmt)}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{s.description || "-"}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(s.debitAmount)}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(s.creditAmount)}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(s.balance)}</TableCell>
                        <TableCell className="text-center">
                          {s.isReconciled ? (
                            <div className="flex items-center justify-center gap-1">
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> จับคู่แล้ว
                              </Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                onClick={(e) => { e.stopPropagation(); unmatchMutation.mutate(s.id); }}
                                data-testid={`button-unmatch-${s.id}`}
                              >
                                <Unlink className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200">
                              <AlertCircle className="w-3 h-3 mr-1" /> รอจับคู่
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <h3 className="font-semibold text-lg">รายการจากระบบ (Journal Entries)</h3>
            </CardHeader>
            <CardContent className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>เลขที่</TableHead>
                    <TableHead>รายละเอียด</TableHead>
                    <TableHead className="text-right">เดบิต</TableHead>
                    <TableHead className="text-right">เครดิต</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {journalEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        ไม่มีรายการที่ยังไม่จับคู่
                      </TableCell>
                    </TableRow>
                  ) : (
                    journalEntries.map((je) => (
                      <TableRow
                        key={je.id}
                        className={`cursor-pointer transition-colors ${
                          selectedJournalId === je.id ? "bg-blue-50 dark:bg-blue-900/30" : ""
                        }`}
                        onClick={() => setSelectedJournalId(selectedJournalId === je.id ? null : je.id)}
                        data-testid={`row-journal-${je.id}`}
                      >
                        <TableCell className="whitespace-nowrap text-sm">{formatDate(je.entryDate, dateEra, dateFmt)}</TableCell>
                        <TableCell className="text-sm">{je.reference || "-"}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{je.description || "-"}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(je.totalDebit)}</TableCell>
                        <TableCell className="text-right text-sm">{fmt(je.totalCredit)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>นำเข้ารายการจากธนาคาร</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-1 border rounded-lg p-1 bg-muted/30">
                <button
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${importMode === "pdf" ? "bg-white shadow-sm text-[#fb9678]" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setImportMode("pdf"); setPreviewRows([]); setCsvText(""); }}
                  data-testid="tab-pdf"
                >
                  <FileText className="w-4 h-4" />
                  อัปโหลด PDF
                </button>
                <button
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2 ${importMode === "csv" ? "bg-white shadow-sm text-[#fb9678]" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setImportMode("csv"); setPreviewRows([]); setPdfBankName(""); setPdfAccountNo(""); }}
                  data-testid="tab-csv"
                >
                  <Upload className="w-4 h-4" />
                  วาง CSV
                </button>
              </div>

              {importMode === "pdf" ? (
                <div className="space-y-3">
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#fb9678] transition-colors">
                    <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">อัปโหลด PDF Statement จากธนาคาร</p>
                    <label className="cursor-pointer">
                      <Button variant="outline" className="border-[#fb9678] text-[#fb9678] hover:bg-orange-50" disabled={pdfParsing} asChild>
                        <span>
                          {pdfParsing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />กำลังอ่าน PDF...</> : <><Upload className="w-4 h-4 mr-2" />เลือกไฟล์ PDF</>}
                        </span>
                      </Button>
                      <input type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} disabled={pdfParsing} data-testid="input-pdf-file" />
                    </label>
                    <p className="text-xs text-muted-foreground mt-2">รองรับ Statement จากทุกธนาคาร (ไฟล์สูงสุด 20MB)</p>
                  </div>
                  {pdfBankName && (
                    <div className="flex gap-4 text-sm">
                      <span className="text-muted-foreground">ธนาคาร: <strong className="text-foreground">{pdfBankName}</strong></span>
                      {pdfAccountNo && <span className="text-muted-foreground">เลขที่บัญชี: <strong className="text-foreground">{pdfAccountNo}</strong></span>}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium mb-1 block">วาง CSV (คอลัมน์: วันที่, รายละเอียด, เดบิต, เครดิต, ยอดคงเหลือ, อ้างอิง)</label>
                  <Textarea
                    rows={8}
                    placeholder={`01/02/2026,รับเงินโอน,0,50000,150000,TRF001\n02/02/2026,จ่ายค่าสินค้า,30000,0,120000,CHQ002`}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    data-testid="textarea-csv"
                  />
                  <Button variant="outline" className="mt-2" onClick={parseCsv} data-testid="button-parse-csv">
                    ดูตัวอย่าง ({previewRows.length} รายการ)
                  </Button>
                </div>
              )}

              {previewRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">ตัวอย่างข้อมูล ({previewRows.length} รายการ)</span>
                  </div>
                  <div className="overflow-auto max-h-[250px] border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>วันที่</TableHead>
                          <TableHead>รายละเอียด</TableHead>
                          <TableHead className="text-right">ถอน</TableHead>
                          <TableHead className="text-right">ฝาก</TableHead>
                          <TableHead className="text-right">ยอดคงเหลือ</TableHead>
                          <TableHead>อ้างอิง</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewRows.map((r, i) => (
                          <TableRow key={i} data-testid={`row-preview-${i}`}>
                            <TableCell className="text-sm whitespace-nowrap">{r.statementDate}</TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">{r.description}</TableCell>
                            <TableCell className="text-right text-sm">{parseFloat(r.debitAmount) > 0 ? Number(r.debitAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "-"}</TableCell>
                            <TableCell className="text-right text-sm">{parseFloat(r.creditAmount) > 0 ? Number(r.creditAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "-"}</TableCell>
                            <TableCell className="text-right text-sm">{Number(r.balance).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-sm">{r.reference || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setImportOpen(false); setCsvText(""); setPreviewRows([]); setPdfBankName(""); setPdfAccountNo(""); }} data-testid="button-cancel-import">
                ยกเลิก
              </Button>
              <Button
                className="bg-[#fb9678] hover:bg-[#e8866a]"
                onClick={handleImport}
                disabled={previewRows.length === 0 || importMutation.isPending}
                data-testid="button-confirm-import"
              >
                นำเข้า {previewRows.length} รายการ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ReportLayout>
  );
}
