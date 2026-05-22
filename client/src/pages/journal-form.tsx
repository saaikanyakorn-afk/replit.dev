import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox } from "@/components/account-combobox";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useCompany } from "@/lib/company-context";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker } from "@/components/ui/date-picker";
import { useDateSettings } from "@/hooks/use-date-settings";
import {
  ArrowLeft, Plus, Home, Save, Trash2, BookOpen, CheckCircle2, XCircle
} from "lucide-react";
import { cn, toLocalDateStr } from "@/lib/utils";
import { useThemeColor } from "@/hooks/use-theme-color";

const JOURNAL_BOOKS = [
  { value: "general", label: "1 - สมุดบัญชีรายวันทั่วไป" },
  { value: "receive", label: "2 - สมุดรายวันรับเงิน" },
  { value: "payment", label: "3 - สมุดรายวันจ่ายเงิน" },
  { value: "sales", label: "4 - สมุดรายวันขาย" },
  { value: "purchase", label: "5 - สมุดรายวันซื้อ" },
];

interface JournalLine {
  accountId: number | undefined;
  description: string;
  debit: string;
  credit: string;
  costCenter: string;
  anchor: string;
}

const emptyLine = (): JournalLine => ({
  accountId: undefined,
  description: "",
  debit: "0",
  credit: "0",
  costCenter: "",
  anchor: "",
});

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


export default function JournalForm() {
  const [, navigate] = useLocation();
  const [, editParams] = useRoute("/journal/edit/:id");
  const editId = editParams?.id ? Number(editParams.id) : null;
  const isEdit = !!editId;
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();
  const { acctName } = useLanguage();
  const { dateEra, dateFmt } = useDateSettings();
  const { colors: themeColors } = useThemeColor();
  const queryClient = useQueryClient();

  const [entryDate, setEntryDate] = useState(toLocalDateStr(new Date()));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [journalBook, setJournalBook] = useState("general");
  const [contactId, setContactId] = useState<number | undefined>(undefined);
  const [documentRef, setDocumentRef] = useState("manual");
  const [lines, setLines] = useState<JournalLine[]>([emptyLine(), emptyLine()]);
  const [loaded, setLoaded] = useState(false);

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

  const { data: contacts = [] } = useQuery<any[]>({
    queryKey: ["/api/contacts", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const res = await fetch(`/api/contacts?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: existingEntry } = useQuery<any>({
    queryKey: ["/api/journal-entries", editId],
    queryFn: async () => {
      if (!editId) return null;
      const res = await fetch(`/api/journal-entries/${editId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isEdit && !!companyId,
  });

  useEffect(() => {
    if (existingEntry && !loaded) {
      setEntryDate(existingEntry.entryDate || toLocalDateStr(new Date()));
      setReference(existingEntry.reference || "");
      setDescription(existingEntry.description || "");
      setJournalBook(existingEntry.journalBook || "general");
      setContactId(existingEntry.contactId || undefined);
      if (existingEntry.lines && existingEntry.lines.length > 0) {
        setLines(existingEntry.lines.map((l: any) => ({
          accountId: l.accountId,
          description: l.description || "",
          debit: String(parseFloat(l.debit) || 0),
          credit: String(parseFloat(l.credit) || 0),
          costCenter: l.costCenter || "",
          anchor: l.anchor || "",
        })));
      }
      setLoaded(true);
    }
  }, [existingEntry, loaded]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const doSave = async () => {
        if (isEdit) {
          const res = await apiRequest("PATCH", `/api/journal-entries/${editId}`, data);
          return res.json();
        }
        const res = await apiRequest("POST", "/api/journal-entries", data);
        return res.json();
      };
      try {
        return await doSave();
      } catch (err: any) {
        if (err?.message?.toLowerCase().includes("timeout")) {
          await new Promise(r => setTimeout(r, 2000));
          return await doSave();
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/journal-entries"] });
      toast({ title: isEdit ? "แก้ไขรายการสำเร็จ" : "บันทึกรายการสำเร็จ", variant: "success" as any });
      navigate("/journal");
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.005 && totalDebit > 0;

  function updateLine(idx: number, field: keyof JournalLine, value: string | number | undefined) {
    const updated = [...lines];
    (updated[idx] as any)[field] = value;
    if (field === "accountId" && value) {
      const acc = accounts.find((a: any) => a.id === Number(value));
      if (acc) {
        updated[idx].description = acctName(acc) || "";
      }
    }
    setLines(updated);
  }

  function addLine() {
    setLines([...lines, emptyLine()]);
  }

  function removeLine(idx: number) {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    if (!companyId) {
      toast({ title: "กรุณาเลือกบริษัท", variant: "destructive" });
      return;
    }
    if (!entryDate) {
      toast({ title: "กรุณาระบุวันที่", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.accountId && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0));
    if (validLines.length < 2) {
      toast({ title: "ต้องมีอย่างน้อย 2 รายการที่มีบัญชีและจำนวนเงิน", variant: "destructive" });
      return;
    }
    if (!isBalanced) {
      const diff = Math.abs(totalDebit - totalCredit);
      toast({
        title: "⚠️ ไม่สามารถบันทึกได้ - ยอดไม่สมดุล",
        description: `ยอดเดบิต ${fmt(totalDebit)} ≠ เครดิต ${fmt(totalCredit)} (ผลต่าง ${fmt(diff)})`,
        variant: "destructive",
        duration: 8000,
      });
      alert(`ยอดเดบิตและเครดิตไม่สมดุล!\n\nเดบิต: ${fmt(totalDebit)}\nเครดิต: ${fmt(totalCredit)}\nผลต่าง: ${fmt(diff)}\n\nกรุณาตรวจสอบรายการให้ถูกต้องก่อนบันทึก`);
      return;
    }

    const selectedContact = contactId ? contacts.find((c: any) => c.id === contactId) : null;

    saveMutation.mutate({
      companyId,
      entryDate,
      reference,
      description,
      journalBook,
      contactId: contactId || null,
      contactName: selectedContact?.name || null,
      costCenter: null,
      status: "posted",
      lines: validLines.map(l => ({
        accountId: l.accountId,
        description: l.description,
        debit: String(parseFloat(l.debit) || 0),
        credit: String(parseFloat(l.credit) || 0),
        costCenter: l.costCenter || "",
        anchor: l.anchor || "",
      })),
    });
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Home className="h-4 w-4" />
          <span>/</span>
          <button onClick={() => navigate("/journal")} className="hover:text-foreground transition-colors" data-testid="breadcrumb-journal">สมุดบัญชีรายวัน</button>
          <span>/</span>
          <span className="text-foreground font-medium">{isEdit ? "แก้ไขรายการ" : "เพิ่มรายการ"}</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/journal")}
              data-testid="button-back"
              className="h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${themeColors.primary}20` }}>
              <BookOpen className="h-5 w-5" style={{ color: themeColors.primary }} />
            </div>
            <div>
              <h1 className="text-xl font-heading font-bold" data-testid="text-page-title">{isEdit ? "แก้ไขรายการบัญชี" : "เพิ่มรายการบัญชี"}</h1>
              <p className="text-xs text-muted-foreground">{isEdit ? `แก้ไขรายการ ${existingEntry?.entryNo || reference}` : "สร้างรายการบันทึกบัญชีรายวันด้วยตนเอง (เลขที่จะสร้างอัตโนมัติ)"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isBalanced ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" data-testid="status-balanced">
                <CheckCircle2 className="h-3.5 w-3.5" />
                สมดุล
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" data-testid="status-unbalanced">
                <XCircle className="h-3.5 w-3.5" />
                ไม่สมดุล
              </span>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 border dark:border-slate-600 rounded-xl shadow-sm">
          <div className="p-5 border-b">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">ข้อมูลทั่วไป</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">CONTACT ID</label>
                <Select
                  value={contactId ? String(contactId) : ""}
                  onValueChange={(val) => setContactId(val ? Number(val) : undefined)}
                >
                  <SelectTrigger className="h-9" data-testid="select-contact">
                    <SelectValue placeholder="เลือกผู้ติดต่อ" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.code ? `${c.code} - ` : ""}{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">วันที่ <span className="text-red-500">*</span></label>
                <DatePicker
                  value={entryDate}
                  onChange={(val) => setEntryDate(val)}
                  dateFormat={dateFmt}
                  dateEra={dateEra}
                  data-testid="input-entry-date"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">สมุดบัญชี <span className="text-red-500">*</span></label>
                <Select value={journalBook} onValueChange={setJournalBook}>
                  <SelectTrigger className="h-9" data-testid="select-journal-book">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOURNAL_BOOKS.map(b => (
                      <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">เลือกเอกสาร</label>
                <Select value={documentRef} onValueChange={setDocumentRef}>
                  <SelectTrigger className="h-9" data-testid="select-document-ref">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">เลขที่อ้างอิง</label>
                <Input
                  data-testid="input-reference"
                  placeholder="เช่น JV-2026-001"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">รายละเอียด</label>
                <Input
                  data-testid="input-description"
                  placeholder="คำอธิบายรายการ"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">รายการบัญชี</h2>
            </div>

            <div className="border-2 border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden shadow-sm">
              <Table className="border-collapse">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b-2 border-slate-300 dark:border-slate-600" style={{ background: themeColors.primary }}>
                    <TableHead className="text-xs font-bold text-white w-10 border-r border-white/30 text-center">#</TableHead>
                    <TableHead className="text-xs font-bold text-white min-w-[200px] border-r border-white/30">รหัสบัญชี <span className="text-yellow-200">*</span></TableHead>
                    <TableHead className="text-xs font-bold text-white min-w-[150px] border-r border-white/30">รายละเอียด</TableHead>
                    <TableHead className="text-xs font-bold text-white text-center w-[140px] border-r border-white/30">เดบิต</TableHead>
                    <TableHead className="text-xs font-bold text-white text-center w-[140px] border-r border-white/30">เครดิต</TableHead>
                    <TableHead className="text-xs font-bold text-white w-[120px] border-r border-white/30">CostCenter</TableHead>
                    <TableHead className="text-xs font-bold text-white w-[120px] border-r border-white/30">ANCHOR</TableHead>
                    <TableHead className="text-xs font-bold text-white w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => {
                    const hasDebit = parseFloat(line.debit) > 0;
                    const hasCredit = parseFloat(line.credit) > 0;
                    const rowBg = idx % 2 === 0 ? "bg-white dark:bg-slate-800" : "bg-slate-50/80 dark:bg-slate-900/60";
                    const leftColor = hasDebit ? "#fec90f" : hasCredit ? "#05b187" : "transparent";
                    return (
                    <TableRow key={idx} className={`${rowBg} hover:bg-amber-50/50 dark:hover:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600`}>
                      <TableCell className="text-xs text-slate-600 dark:text-slate-300 font-bold text-center border-r border-slate-200 dark:border-slate-600 relative">
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: leftColor }} />
                        {idx + 1}
                      </TableCell>
                      <TableCell className="border-r border-slate-200 dark:border-slate-600 py-1.5">
                        <AccountCombobox
                          accounts={accounts}
                          value={line.accountId}
                          onSelect={(acc) => updateLine(idx, "accountId", acc.id)}
                          testId={`select-account-${idx}`}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell className="border-r border-slate-200 dark:border-slate-600 py-1.5">
                        <Input
                          data-testid={`input-line-desc-${idx}`}
                          placeholder="รายละเอียด"
                          value={line.description}
                          onChange={e => updateLine(idx, "description", e.target.value)}
                          className="h-8 text-xs border-dashed"
                        />
                      </TableCell>
                      <TableCell className="border-r border-slate-200 dark:border-slate-600 py-1.5">
                        <Input
                          data-testid={`input-debit-${idx}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.debit}
                          onChange={e => updateLine(idx, "debit", e.target.value)}
                          className={cn("h-8 text-xs text-right font-medium", hasDebit && "bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200")}
                          onFocus={e => { if (e.target.value === "0") e.target.select(); }}
                        />
                      </TableCell>
                      <TableCell className="border-r border-slate-200 dark:border-slate-600 py-1.5">
                        <Input
                          data-testid={`input-credit-${idx}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.credit}
                          onChange={e => updateLine(idx, "credit", e.target.value)}
                          className={cn("h-8 text-xs text-right font-medium", hasCredit && "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200")}
                          onFocus={e => { if (e.target.value === "0") e.target.select(); }}
                        />
                      </TableCell>
                      <TableCell className="border-r border-slate-200 dark:border-slate-600 py-1.5">
                        <Input
                          data-testid={`input-cost-center-${idx}`}
                          placeholder=""
                          value={line.costCenter}
                          onChange={e => updateLine(idx, "costCenter", e.target.value)}
                          className="h-8 text-xs border-dashed"
                        />
                      </TableCell>
                      <TableCell className="border-r border-slate-200 dark:border-slate-600 py-1.5">
                        <Input
                          data-testid={`input-anchor-${idx}`}
                          placeholder=""
                          value={line.anchor}
                          onChange={e => updateLine(idx, "anchor", e.target.value)}
                          className="h-8 text-xs border-dashed"
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length <= 2}
                          data-testid={`button-remove-line-${idx}`}
                          className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  <TableRow className="bg-slate-100 dark:bg-slate-700/50 font-bold hover:bg-slate-100 dark:hover:bg-slate-700/50 border-t-2 border-slate-300 dark:border-slate-500">
                    <TableCell colSpan={3} className="text-right text-xs text-slate-700 dark:text-slate-200 pr-4 border-r border-slate-200 dark:border-slate-600 py-2.5">รวมทั้งสิ้น</TableCell>
                    <TableCell className="text-right text-xs border-r border-slate-200 dark:border-slate-600 py-2.5" data-testid="text-total-debit">
                      <span className={cn("font-bold text-sm", totalDebit > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>{fmt(totalDebit)}</span>
                    </TableCell>
                    <TableCell className="text-right text-xs border-r border-slate-200 dark:border-slate-600 py-2.5" data-testid="text-total-credit">
                      <span className={cn("font-bold text-sm", totalCredit > 0 ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>{fmt(totalCredit)}</span>
                    </TableCell>
                    <TableCell colSpan={3} className="py-2.5">
                      {isBalanced ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          สมดุล
                        </span>
                      ) : totalDebit + totalCredit > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/40 px-2.5 py-1 rounded-full">
                          <XCircle className="h-3.5 w-3.5" />
                          ผลต่าง {fmt(Math.abs(totalDebit - totalCredit))}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <button
              type="button"
              onClick={addLine}
              data-testid="button-add-line"
              className="mt-3 text-sm font-medium hover:underline"
              style={{ color: themeColors.primary }}
            >
              <Plus className="h-4 w-4 inline mr-1" />
              เพิ่มรายการบัญชี
            </button>
          </div>

          <div className="p-5 border-t flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/journal")}
              data-testid="button-cancel"
              className="h-9"
            >
              ยกเลิก
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saveMutation.isPending || !isBalanced}
              data-testid="button-save"
              className="h-9 px-5 gap-1.5 text-white"
              style={{ background: themeColors.primary }}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึกรายการ"}
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
