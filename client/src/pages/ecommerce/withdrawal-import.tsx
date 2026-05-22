import { useState, useRef } from "react";
import EcommerceLayout from "@/components/ecommerce-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox } from "@/components/account-combobox";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import {
  Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertTriangle, Landmark, ArrowLeft, Wallet,
} from "lucide-react";

interface WithdrawalRow {
  type: string;
  referenceId: string;
  requestTime: string;
  amount: number;
  status: string;
  successTime: string;
  bankAccount: string;
  selected: boolean;
}

interface ImportResult {
  message: string;
  imported: any[];
  skipped: any[];
  totalAmount: number;
}

export default function WithdrawalImportPage() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [bankAccountCode, setBankAccountCode] = useState("");
  const [platform, setPlatform] = useState("tiktok");
  const [result, setResult] = useState<ImportResult | null>(null);

  const { data: accountsList = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const res = await fetch(`/api/accounts?companyId=${selectedCompanyId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });

  const bankAccounts = accountsList.filter((a: any) =>
    a.code?.startsWith("101") || a.code?.startsWith("102")
  );

  const walletAccounts = accountsList.filter((a: any) =>
    a.code?.startsWith("104")
  );

  const PLATFORM_WALLET_CODES: Record<string, string> = {
    shopee: "1041000", lazada: "1042000", tiktok: "1043000",
  };

  const selectedWalletCode = PLATFORM_WALLET_CODES[platform] || "1044000";
  const selectedWalletName = walletAccounts.find((a: any) => a.code === selectedWalletCode)?.name || `Wallet ${selectedWalletCode}`;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });

      const sheetName = wb.SheetNames.find(n =>
        n.toLowerCase().includes("withdrawal") || n.toLowerCase().includes("ถอน")
      ) || wb.SheetNames[2] || wb.SheetNames[0];

      const ws = wb.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

      if (jsonData.length < 2) {
        toast({ title: "ไม่พบข้อมูลในชีท", variant: "destructive" });
        return;
      }

      const headers = jsonData[0] as string[];
      const typeIdx = headers.findIndex(h => String(h).toLowerCase() === "type");
      const refIdx = headers.findIndex(h => String(h).toLowerCase().includes("reference"));
      const reqTimeIdx = headers.findIndex(h => String(h).toLowerCase().includes("request"));
      const amountIdx = headers.findIndex(h => String(h).toLowerCase() === "amount");
      const statusIdx = headers.findIndex(h => String(h).toLowerCase() === "status");
      const successIdx = headers.findIndex(h => String(h).toLowerCase().includes("success"));
      const bankIdx = headers.findIndex(h => String(h).toLowerCase().includes("bank"));

      const missing: string[] = [];
      if (refIdx === -1) missing.push("Reference ID");
      if (amountIdx === -1) missing.push("Amount");
      if (statusIdx === -1) missing.push("Status");
      if (successIdx === -1) missing.push("Success time");
      if (missing.length > 0) {
        toast({ title: `ไม่พบคอลัมน์: ${missing.join(", ")}`, description: "กรุณาตรวจสอบว่าอัพโหลดชีท Withdrawal records", variant: "destructive" });
        return;
      }

      const parsed: WithdrawalRow[] = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as any[];
        if (!row || row.length < 3) continue;

        parsed.push({
          type: String(row[typeIdx] || ""),
          referenceId: String(row[refIdx] || ""),
          requestTime: String(row[reqTimeIdx] || ""),
          amount: Number(row[amountIdx] || 0),
          status: String(row[statusIdx] || ""),
          successTime: String(row[successIdx] || ""),
          bankAccount: String(row[bankIdx] || ""),
          selected: row[statusIdx] === "Transferred",
        });
      }

      setRows(parsed);
      toast({ title: `พบ ${parsed.length} รายการถอนเงิน` });
    };
    reader.readAsArrayBuffer(file);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const selected = rows.filter(r => r.selected);
      if (selected.length === 0) throw new Error("กรุณาเลือกรายการที่ต้องการนำเข้า");
      if (!bankAccountCode) throw new Error("กรุณาเลือกบัญชีธนาคาร");
      if (!selectedCompanyId) throw new Error("กรุณาเลือกบริษัท");

      const invalid = selected.filter(r => !r.referenceId || r.amount <= 0 || !r.successTime);
      if (invalid.length > 0) throw new Error(`พบ ${invalid.length} รายการที่ข้อมูลไม่ครบ (ไม่มี Reference ID, จำนวนเงิน, หรือวันที่)`);

      const res = await fetch("/api/ecommerce/withdrawal-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          bankAccountCode,
          platform,
          withdrawals: selected.map(r => ({
            type: r.type,
            referenceId: r.referenceId,
            requestTime: r.requestTime,
            amount: r.amount,
            status: r.status,
            successTime: r.successTime,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "เกิดข้อผิดพลาด");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResult(data);
      toast({ title: data.message });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const selectedCount = rows.filter(r => r.selected).length;
  const selectedTotal = rows.filter(r => r.selected).reduce((s, r) => s + r.amount, 0);

  const toggleAll = (checked: boolean) => {
    setRows(rows.map(r => ({ ...r, selected: r.status === "Transferred" ? checked : false })));
  };

  return (
    <EcommerceLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-[#fb9678]" />
          <h1 className="text-xl font-bold">นำเข้าถอนเงิน (Withdrawal Import)</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileSpreadsheet className="h-4 w-4" />
                1. อัพโหลด Excel
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger data-testid="select-platform">
                    <SelectValue placeholder="เลือกแพลตฟอร์ม" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tiktok">TikTok Shop</SelectItem>
                    <SelectItem value="shopee">Shopee</SelectItem>
                    <SelectItem value="lazada">Lazada</SelectItem>
                  </SelectContent>
                </Select>

                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} data-testid="input-file" />
                <Button
                  variant="outline"
                  className="w-full border-[#fb9678] text-[#fb9678] hover:bg-[#fb9678]/10"
                  onClick={() => fileRef.current?.click()}
                  data-testid="button-upload"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {fileName || "เลือกไฟล์ Excel"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Landmark className="h-4 w-4" />
                2. เลือกบัญชี
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">บัญชีธนาคาร (เดบิต - เงินเข้า)</label>
                  <AccountCombobox
                    accounts={bankAccounts}
                    value={bankAccountCode}
                    onSelect={acc => setBankAccountCode(acc.code)}
                    testId="select-bank-account"
                    placeholder="เลือกบัญชีธนาคาร"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">บัญชี Wallet (เครดิต - ตัดยอด)</label>
                  <div className="px-3 py-2 bg-gray-50 rounded border text-sm">
                    {selectedWalletCode} - {selectedWalletName}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                3. บันทึกบัญชี
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">เลือก:</span>
                    <span className="font-semibold">{selectedCount} รายการ</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">ยอดรวม:</span>
                    <span className="font-semibold text-green-600">฿{selectedTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <Button
                  className="w-full bg-[#05b187] hover:bg-[#05b187]/90"
                  disabled={selectedCount === 0 || !bankAccountCode || importMutation.isPending || !!result}
                  onClick={() => importMutation.mutate()}
                  data-testid="button-import"
                >
                  {importMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> กำลังบันทึก...</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 mr-2" /> บันทึกบัญชี</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {result && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">{result.message}</span>
                <span className="ml-auto font-bold">รวม ฿{result.totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
              {result.skipped.length > 0 && (
                <div className="mt-2 text-sm text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  ข้าม {result.skipped.length} รายการที่บันทึกแล้ว
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {rows.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedCount === rows.filter(r => r.status === "Transferred").length && selectedCount > 0}
                        onCheckedChange={(c) => toggleAll(!!c)}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead>Reference ID</TableHead>
                    <TableHead>วันที่ขอ</TableHead>
                    <TableHead className="text-right">จำนวนเงิน</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>วันที่สำเร็จ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={idx} className={row.selected ? "bg-blue-50/50" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={row.selected}
                          disabled={row.status !== "Transferred"}
                          onCheckedChange={(c) => {
                            const updated = [...rows];
                            updated[idx].selected = !!c;
                            setRows(updated);
                          }}
                          data-testid={`checkbox-row-${idx}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{row.type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.referenceId}</TableCell>
                      <TableCell>{row.requestTime}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ฿{row.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell>
                        <Badge className={row.status === "Transferred" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.successTime}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {rows.length === 0 && !result && (
          <Card>
            <CardContent className="py-12 text-center text-gray-400">
              <Upload className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>อัพโหลดไฟล์ Excel รายงานรายได้ TikTok Shop เพื่อนำเข้ารายการถอนเงิน</p>
              <p className="text-xs mt-1">รองรับชีท "Withdrawal records" จากรายงานรายได้ TikTok Shop</p>
            </CardContent>
          </Card>
        )}
      </div>
    </EcommerceLayout>
  );
}
