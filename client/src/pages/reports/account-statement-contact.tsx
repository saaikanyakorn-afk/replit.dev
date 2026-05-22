import { useState } from "react";
import Layout from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AccountCombobox } from "@/components/account-combobox";
import { ArrowLeft, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { formatDate } from "@/lib/format";
import { useDateSettings } from "@/hooks/use-date-settings";
import ThaiDateInput from "@/components/thai-date-input";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AccountStatementContactPage() {
  const [, navigate] = useLocation();
  const { dateEra, dateFmt } = useDateSettings();
  const params = new URLSearchParams(window.location.search);
  const companyId = params.get("companyId") || "";
  const today = new Date();
  const firstDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = today.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(firstDay);
  const [endDate, setEndDate] = useState(lastDay);
  const [accountCode, setAccountCode] = useState("");
  const [contactId, setContactId] = useState("");

  const { data: accountsList } = useQuery<any[]>({
    queryKey: ["/api/accounts", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/accounts?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
  });

  const { data: contactsList } = useQuery<any[]>({
    queryKey: ["/api/contacts", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/contacts?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
  });

  const detailAccounts = (accountsList || []).filter((a: any) => a.isDetail !== false && !a.isHeader);

  const { data: statement, isLoading } = useQuery<any[]>({
    queryKey: ["/api/reports/account-statement", companyId, startDate, endDate, accountCode, contactId],
    queryFn: async () => {
      const p = new URLSearchParams({ companyId });
      if (startDate) p.set("startDate", startDate);
      if (endDate) p.set("endDate", endDate);
      if (accountCode) p.set("accountCode", accountCode);
      if (contactId && contactId !== "all") p.set("contactId", contactId);
      const r = await fetch(`/api/reports/account-statement?${p}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
  });

  return (
    <Layout>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/reports/general")} data-testid="btn-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "#03c9d7" }}>
            <FileText className="h-5 w-5" /> A7a: Statement ตามรหัสบัญชี ตามคู่ค้า
          </h1>
          <p className="text-sm text-gray-500">แสดงรายการเคลื่อนไหวของบัญชี กรองตามคู่ค้าที่เลือก</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-gray-500">วันที่เริ่ม</label>
              <ThaiDateInput value={startDate} onChange={setStartDate} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-start-date" />
            </div>
            <div>
              <label className="text-xs text-gray-500">วันที่สิ้นสุด</label>
              <ThaiDateInput value={endDate} onChange={setEndDate} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-end-date" />
            </div>
            <div>
              <label className="text-xs text-gray-500">รหัสบัญชี</label>
              <AccountCombobox
                accounts={detailAccounts}
                value={accountCode}
                onSelect={acc => setAccountCode(acc.code)}
                testId="select-account"
                topOption={{ value: "", label: "ทุกบัญชี" }}
                className="w-64"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">คู่ค้า</label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger className="w-64" data-testid="select-contact">
                  <SelectValue placeholder="ทุกคู่ค้า" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกคู่ค้า</SelectItem>
                  {(contactsList || []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Card><CardContent className="py-12 text-center text-gray-400">กำลังโหลด...</CardContent></Card>
      ) : !statement || statement.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-gray-400">ไม่พบข้อมูล</CardContent></Card>
      ) : (
        statement.map((acct: any) => (
          <Card key={acct.accountCode} data-testid={`statement-account-${acct.accountCode}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold" style={{ color: "#03c9d7" }}>
                {acct.accountCode} - {acct.accountNameTh || acct.accountName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left px-2 py-1.5 w-24">วันที่</th>
                      <th className="text-left px-2 py-1.5">รายละเอียด</th>
                      <th className="text-left px-2 py-1.5 w-32">คู่ค้า</th>
                      <th className="text-left px-2 py-1.5 w-24">อ้างอิง</th>
                      <th className="text-right px-2 py-1.5 w-28">เดบิต</th>
                      <th className="text-right px-2 py-1.5 w-28">เครดิต</th>
                      <th className="text-right px-2 py-1.5 w-32">ยอดสะสม</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b bg-blue-50/50">
                      <td colSpan={6} className="px-2 py-1.5 text-xs font-medium text-gray-600">ยอดยกมา</td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">{fmt(acct.beginBalance)}</td>
                    </tr>
                    {acct.lines.map((l: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-xs font-mono">{formatDate(l.entryDate, dateEra, dateFmt)}</td>
                        <td className="px-2 py-1.5 text-xs">{l.description || l.entryDescription || "-"}</td>
                        <td className="px-2 py-1.5 text-xs text-gray-600">{l.contactName || "-"}</td>
                        <td className="px-2 py-1.5 text-xs text-gray-500">{l.reference || "-"}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">{Number(l.debit) > 0 ? fmt(Number(l.debit)) : "-"}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs">{Number(l.credit) > 0 ? fmt(Number(l.credit)) : "-"}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs font-semibold">{fmt(l.balance)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 bg-gray-50 font-semibold">
                      <td colSpan={4} className="px-2 py-2 text-xs">รวม</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmt(acct.totalDebit)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmt(acct.totalCredit)}</td>
                      <td className="px-2 py-2 text-right font-mono text-xs">{fmt(acct.endBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
    </Layout>
  );
}
