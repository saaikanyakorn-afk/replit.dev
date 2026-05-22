import HRLayout from "@/components/hr-layout";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import { objectPathToUrl } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox } from "@/components/account-combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Calculator, Save, CheckCircle, BookOpen, Users, DollarSign, Shield, FileText, Download, Printer, Eye, Pencil, MessageCircle, Mail, Plus, Loader2, AlertCircle, Timer, RotateCcw, Trash2, FileSpreadsheet, Building2 } from "lucide-react";
import * as XLSX from "xlsx";
import { useState, useMemo, useRef, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useHrCompanyId } from "@/lib/company-context";
import { useLanguage } from "@/hooks/use-language";

const MONTHS = [
  { value: "1", label: "มกราคม" }, { value: "2", label: "กุมภาพันธ์" },
  { value: "3", label: "มีนาคม" }, { value: "4", label: "เมษายน" },
  { value: "5", label: "พฤษภาคม" }, { value: "6", label: "มิถุนายน" },
  { value: "7", label: "กรกฎาคม" }, { value: "8", label: "สิงหาคม" },
  { value: "9", label: "กันยายน" }, { value: "10", label: "ตุลาคม" },
  { value: "11", label: "พฤศจิกายน" }, { value: "12", label: "ธันวาคม" },
];

function getYearOptions() {
  const current = new Date().getFullYear();
  return [current - 1, current, current + 1].map(y => ({ value: String(y), label: String(y) }));
}

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtZero(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  if (n === 0) return "";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtAlways(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function calcSocialSecurity(salary: number): number {
  const rate = 0.05;
  const maxBase = 17500;
  const base = Math.min(salary, maxBase);
  return Math.round(base * rate);
}

const TAX_DEDUCTION_PRESETS = [
  { key: "spouse", label: "คู่สมรส", max: 60000 },
  { key: "child", label: "บุตร (คนละ 30,000)", max: 0 },
  { key: "lifeInsurance", label: "ประกันชีวิต", max: 100000 },
  { key: "healthInsurance", label: "ประกันสุขภาพ", max: 25000 },
  { key: "providentFund", label: "กองทุนสำรองเลี้ยงชีพ", max: 500000 },
  { key: "rmf", label: "กองทุน RMF", max: 500000 },
  { key: "ssf", label: "กองทุน SSF", max: 200000 },
  { key: "homeLoan", label: "ดอกเบี้ยบ้าน", max: 100000 },
  { key: "donation", label: "เงินบริจาค", max: 0 },
  { key: "parentCare", label: "เลี้ยงดูบิดามารดา", max: 120000 },
  { key: "other", label: "อื่นๆ", max: 0 },
];

function calcWithholdingTax(annualIncome: number, annualSso: number, additionalDeductions: number = 0): number {
  const expenseDeduction = Math.min(annualIncome * 0.5, 100000);
  const personalExemption = 60000;
  const taxable = Math.max(annualIncome - expenseDeduction - personalExemption - annualSso - additionalDeductions, 0);
  let tax = 0;
  if (taxable <= 150000) tax = 0;
  else if (taxable <= 300000) tax = (taxable - 150000) * 0.05;
  else if (taxable <= 500000) tax = 7500 + (taxable - 300000) * 0.10;
  else if (taxable <= 750000) tax = 27500 + (taxable - 500000) * 0.15;
  else if (taxable <= 1000000) tax = 65000 + (taxable - 750000) * 0.20;
  else if (taxable <= 2000000) tax = 115000 + (taxable - 1000000) * 0.25;
  else if (taxable <= 5000000) tax = 365000 + (taxable - 2000000) * 0.30;
  else tax = 1265000 + (taxable - 5000000) * 0.35;
  return Math.round(tax / 12);
}

function statusBadge(status: string) {
  switch (status) {
    case "draft": return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100" data-testid="badge-status-draft">ฉบับร่าง</Badge>;
    case "saved": return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100" data-testid="badge-status-saved">บันทึกแล้ว</Badge>;
    case "approved": return <Badge className="bg-green-100 text-green-800 hover:bg-green-100" data-testid="badge-status-approved">อนุมัติแล้ว</Badge>;
    case "posted": return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100" data-testid="badge-status-posted">ลงบัญชีแล้ว</Badge>;
    default: return <Badge variant="secondary">{status}</Badge>;
  }
}

function numberToThaiWords(n: number): string {
  if (n === 0) return "ศูนย์บาทถ้วน";
  const units = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const positions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
  const intPart = Math.floor(n);
  const decPart = Math.round((n - intPart) * 100);
  function convert(num: number): string {
    if (num === 0) return "";
    const s = String(num);
    let result = "";
    const len = s.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(s[i]);
      const pos = len - i - 1;
      if (digit === 0) continue;
      if (pos === 1 && digit === 1) { result += "สิบ"; continue; }
      if (pos === 1 && digit === 2) { result += "ยี่สิบ"; continue; }
      if (pos === 0 && digit === 1 && len > 1) { result += "เอ็ด"; continue; }
      result += units[digit] + positions[pos];
    }
    return result;
  }
  let result = convert(intPart) + "บาท";
  if (decPart > 0) {
    result += convert(decPart) + "สตางค์";
  } else {
    result += "ถ้วน";
  }
  return result;
}

function TaxIdBoxes({ taxId }: { taxId: string }) {
  const digits = (taxId || "").replace(/\D/g, "").padEnd(13, " ").slice(0, 13).split("");
  const groups = [
    [digits[0]],
    [digits[1], digits[2], digits[3], digits[4]],
    [digits[5], digits[6], digits[7], digits[8], digits[9]],
    [digits[10], digits[11]],
    [digits[12]],
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0" }}>
      {groups.map((group, gi) => (
        <div key={gi} style={{ display: "flex", alignItems: "center" }}>
          {gi > 0 && <span style={{ margin: "0 1px", fontSize: "9px", fontWeight: "bold" }}>-</span>}
          {group.map((d, di) => (
            <div key={di} style={{ width: "16px", height: "18px", border: "1px solid black", textAlign: "center", fontSize: "11px", lineHeight: "18px", fontWeight: 500 }}>
              {d.trim()}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CB({ checked }: { checked: boolean }) {
  return (
    <span style={{ display: "inline-block", width: "12px", height: "12px", border: "1px solid black", textAlign: "center", lineHeight: "12px", fontSize: "10px", fontWeight: "bold", verticalAlign: "middle", marginRight: "2px" }}>
      {checked ? "✓" : "\u00A0"}
    </span>
  );
}

const S = {
  page: { width: "210mm", minHeight: "297mm", fontFamily: "'Sarabun', sans-serif", fontSize: "11px", padding: "8mm 10mm", lineHeight: 1.4, background: "white", color: "black", position: "relative" as const, boxSizing: "border-box" as const },
  section: { border: "1px solid black", padding: "4px 6px", marginBottom: "3px" },
  dotline: { borderBottom: "1px dotted black", display: "inline", paddingLeft: "2px", paddingRight: "2px" },
};

function FiftyTawiA4({ company, employee, annualEarnings, annualTax, yearBE, ssoAmount }: {
  company: any; employee: any; annualEarnings: number; annualTax: number; yearBE: number; ssoAmount?: number;
}) {
  const todayParts = (() => {
    const d = new Date();
    const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    return { day: String(d.getDate()), month: thaiMonths[d.getMonth()], year: String(d.getFullYear() + 543) };
  })();

  const tdLStyle: React.CSSProperties = { border: "1px solid black", padding: "2px 4px", textAlign: "left", fontSize: "10.5px" };
  const tdCStyle: React.CSSProperties = { border: "1px solid black", padding: "2px", textAlign: "center", fontSize: "10.5px" };
  const tdRStyle: React.CSSProperties = { border: "1px solid black", padding: "2px 4px", textAlign: "right", fontSize: "10.5px" };

  return (
    <div style={S.page} className="fifty-tawi-page">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { background: white !important; }
          .fifty-tawi-page { width: 100% !important; min-height: auto !important; padding: 4mm 6mm !important; border: none !important; }
        }
      `}</style>

      <div style={{ textAlign: "center", marginBottom: "2px" }}>
        <div style={{ fontSize: "16px", fontWeight: "bold" }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
        <div style={{ fontSize: "12px" }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "16px", fontSize: "11px", marginBottom: "4px" }}>
        <span>เล่มที่ <span style={{ ...S.dotline, minWidth: "50px" }}></span></span>
        <span>เลขที่ <span style={{ ...S.dotline, minWidth: "70px", fontWeight: 600 }}></span></span>
      </div>

      <div style={S.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2px" }}>
          <b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-</b>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px" }}>
            <span>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</span>
            <TaxIdBoxes taxId={company?.taxId || ""} />
          </div>
        </div>
        <div>ชื่อ <span style={{ ...S.dotline, minWidth: "250px" }}>{company?.name || ""}</span> <span style={{ fontSize: "9px", color: "#666" }}>(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</span></div>
        <div>สาขา <span style={{ ...S.dotline, minWidth: "200px" }}>{company?.branch || "สำนักงานใหญ่"}</span></div>
        <div>ที่อยู่ <span style={{ ...S.dotline, minWidth: "500px" }}>{company?.address || ""}</span></div>
        <div style={{ fontSize: "9px", color: "#666", paddingLeft: "28px" }}>(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
      </div>

      <div style={S.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2px" }}>
          <b>ผู้ถูกหักภาษี ณ ที่จ่าย :-</b>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px" }}>
            <span>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</span>
            <TaxIdBoxes taxId={employee?.taxId || employee?.idCardNumber || ""} />
          </div>
        </div>
        <div>ชื่อ <span style={{ ...S.dotline, minWidth: "250px" }}>{employee?.fullName || ""}</span> <span style={{ fontSize: "9px", color: "#666" }}>(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</span></div>
        <div>สาขา <span style={{ ...S.dotline, minWidth: "200px" }}></span></div>
        <div>ที่อยู่ <span style={{ ...S.dotline, minWidth: "500px" }}>{employee?.address || ""}</span></div>
        <div style={{ fontSize: "9px", color: "#666", paddingLeft: "28px" }}>(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
      </div>

      <div style={{ ...S.section, display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "4px" }}>
            <b>ลำดับที่</b>
            <span style={{ ...S.dotline, display: "inline-block", width: "50px", textAlign: "center" }}></span>
            <b>ในแบบ</b>
          </div>
          <div style={{ fontSize: "9px", color: "#666" }}>
            (ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่าง<br/>ลำดับที่ตามหนังสือรับรองฯ กับแบบยื่น<br/>รายการภาษีหัก ณ ที่จ่าย)
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "4px 16px", alignItems: "center" }}>
          <span><CB checked={true} /> ภ.ง.ด.1</span>
          <span><CB checked={false} /> ภ.ง.ด.1ก</span>
          <span><CB checked={false} /> ภ.ง.ด.1ก พิเศษ</span>
          <span><CB checked={false} /> ภ.ง.ด.2</span>
          <span><CB checked={false} /> ภ.ง.ด.3</span>
          <span><CB checked={false} /> ภ.ง.ด.2ก</span>
          <span><CB checked={false} /> ภ.ง.ด.3ก</span>
          <span><CB checked={false} /> ภ.ง.ด.53</span>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px", marginBottom: "3px" }}>
        <thead>
          <tr>
            <th style={{ ...tdLStyle, width: "54%", fontWeight: "bold" }}>ประเภทเงินได้พึงประเมินที่จ่าย</th>
            <th style={{ ...tdCStyle, width: "14%", fontWeight: "bold" }}>วัน เดือน<br/>หรือปีภาษี ที่จ่าย</th>
            <th style={{ ...tdCStyle, width: "16%", fontWeight: "bold" }}>จำนวนเงินที่จ่าย</th>
            <th style={{ ...tdCStyle, width: "16%", fontWeight: "bold" }}>ภาษีที่หัก<br/>และนำส่งไว้</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={tdLStyle}>1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td>
            <td style={tdCStyle}>{(employee?.incomeType || "1") === "1" ? yearBE : ""}</td>
            <td style={tdRStyle}>{(employee?.incomeType || "1") === "1" ? fmtZero(annualEarnings) : ""}</td>
            <td style={tdRStyle}>{(employee?.incomeType || "1") === "1" ? fmtZero(annualTax) : ""}</td>
          </tr>
          <tr>
            <td style={tdLStyle}>2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</td>
            <td style={tdCStyle}>{employee?.incomeType === "2" ? yearBE : ""}</td>
            <td style={tdRStyle}>{employee?.incomeType === "2" ? fmtZero(annualEarnings) : ""}</td>
            <td style={tdRStyle}>{employee?.incomeType === "2" ? fmtZero(annualTax) : ""}</td>
          </tr>
          <tr>
            <td style={tdLStyle}>3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={tdLStyle}>4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, paddingLeft: "12px" }}>(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "20px" }} colSpan={4}>
              <div>(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้</div>
            </td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "40px" }}>(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "40px" }}>(1.2) อัตราร้อยละ 25 ของกำไรสุทธิ</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "40px" }}>(1.3) อัตราร้อยละ 20 ของกำไรสุทธิ</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "40px" }}>(1.4) อัตราอื่นๆ (ระบุ) .................. ของกำไรสุทธิ</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "20px" }} colSpan={4}>
              <div>(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก</div>
            </td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "40px" }}>(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "40px" }}>(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณเป็นรายได้เพื่อเสียภาษีเงินได้นิติบุคคล</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "40px" }}>(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี ก่อนรอบระยะเวลาบัญชีปีปัจจุบัน</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "40px" }}>(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={{ ...tdLStyle, fontSize: "10px", paddingLeft: "40px" }}>(2.5) อื่นๆ (ระบุ) ......................................................</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={tdLStyle}>
              <div>5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา</div>
              <div style={{ paddingLeft: "12px", fontSize: "10px" }}>3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใดๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ</div>
            </td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr>
            <td style={tdLStyle}>6. อื่นๆ (ระบุ) ...........................................................</td>
            <td style={tdCStyle}></td><td style={tdRStyle}></td><td style={tdRStyle}></td>
          </tr>
          <tr style={{ fontWeight: "bold" }}>
            <td style={{ ...tdRStyle }} colSpan={2}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
            <td style={tdRStyle}>{fmtZero(annualEarnings)}</td>
            <td style={tdRStyle}>{fmtZero(annualTax)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ fontSize: "11px", marginBottom: "2px" }}>
        <b>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</b>
        <span style={{ ...S.dotline, minWidth: "320px", marginLeft: "4px", fontWeight: 600 }}>
          {numberToThaiWords(annualTax)}
        </span>
      </div>

      <div style={{ fontSize: "10px", marginBottom: "3px" }}>
        เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน <span style={{ ...S.dotline, display: "inline-block", minWidth: "60px", textAlign: "center" }}></span> บาท
        {" "}กองทุนประกันสังคม <span style={{ ...S.dotline, display: "inline-block", minWidth: "60px", textAlign: "center" }}>{ssoAmount ? fmtAlways(ssoAmount) : ""}</span> บาท
        {" "}กองทุนสำรองเลี้ยงชีพ <span style={{ ...S.dotline, display: "inline-block", minWidth: "60px", textAlign: "center" }}></span> บาท
      </div>

      <div style={{ ...S.section, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", fontSize: "11px" }}>
        <b>ผู้จ่ายเงิน</b>
        <span><CB checked={true} /> (1) หัก ณ ที่จ่าย</span>
        <span><CB checked={false} /> (2) ออกให้ตลอดไป</span>
        <span><CB checked={false} /> (3) ออกให้ครั้งเดียว</span>
        <span><CB checked={false} /> (4) อื่นๆ (ระบุ) ..................</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: "10px", marginTop: "4px" }}>
        <div style={{ ...S.section, width: "44%", fontSize: "10px" }}>
          <b>คำเตือน</b>
          <div>ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div>
        </div>
        <div style={{ width: "52%", textAlign: "center", fontSize: "11px" }}>
          <div>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}>
            <tbody>
              <tr>
                <td style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: "4px", border: "none" }}>ลงชื่อ</td>
                <td style={{ textAlign: "center", width: "170px", borderBottom: "1px dotted black", border: "none" }}>
                  <span style={{ display: "inline-block", width: "100%" }}>&nbsp;</span>
                </td>
                <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "4px", border: "none" }}>ผู้จ่ายเงิน</td>
                <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "8px", fontSize: "10px", border: "none" }}>ประทับตรา</td>
              </tr>
              <tr>
                <td colSpan={4} style={{ textAlign: "center", border: "none", paddingTop: "4px" }}>
                  <span style={{ ...S.dotline, minWidth: "140px" }}>{company?.name || ""}</span>
                </td>
              </tr>
              <tr>
                <td colSpan={4} style={{ textAlign: "center", border: "none", paddingTop: "4px", fontSize: "10px" }}>
                  วันที่ <span style={S.dotline}>{todayParts.day}</span> เดือน <span style={S.dotline}>{todayParts.month}</span> พ.ศ. <span style={S.dotline}>{todayParts.year}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function generateA4Html(company: any, employee: any, data: { totalEarnings: number; totalTax: number; totalSso?: number }, yearBE: number): string {
  const today = new Date();
  const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const todayStr = `${today.getDate()} ${thaiMonths[today.getMonth()]} ${today.getFullYear() + 543}`;

  const taxIdBoxesHtml = (taxId: string) => {
    const digits = (taxId || "").replace(/\D/g, "").padEnd(13, " ").slice(0, 13).split("");
    const groups = [[digits[0]], digits.slice(1, 5), digits.slice(5, 10), digits.slice(10, 12), [digits[12]]];
    return groups.map((g, gi) =>
      (gi > 0 ? '<span style="margin:0 1px;font-size:9px;font-weight:bold;">-</span>' : '') +
      g.map(d => `<span style="display:inline-block;width:16px;height:18px;border:1px solid black;text-align:center;font-size:11px;line-height:18px;font-weight:500;">${d.trim()}</span>`).join('')
    ).join('');
  };

  const cbHtml = (checked: boolean) => `<span style="display:inline-block;width:12px;height:12px;border:1px solid black;text-align:center;line-height:12px;font-size:10px;font-weight:bold;vertical-align:middle;margin-right:2px;">${checked ? '✓' : '&nbsp;'}</span>`;

  const sec = "border:1px solid black;padding:4px 6px;margin-bottom:3px;";
  const dot = "border-bottom:1px dotted black;padding:0 2px;";
  const tdLs = "border:1px solid black;padding:2px 4px;text-align:left;font-size:10.5px;";
  const tdCs = "border:1px solid black;padding:2px;text-align:center;font-size:10.5px;";
  const tdRs = "border:1px solid black;padding:2px 4px;text-align:right;font-size:10.5px;";

  return `<div style="width:210mm;min-height:297mm;font-family:'Sarabun',sans-serif;font-size:11px;padding:8mm 10mm;line-height:1.4;background:white;color:black;box-sizing:border-box;page-break-after:always;">
    <div style="text-align:center;margin-bottom:2px;"><div style="font-size:16px;font-weight:bold;">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div><div style="font-size:12px;">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div></div>
    <div style="display:flex;justify-content:flex-end;gap:16px;font-size:11px;margin-bottom:4px;"><span>เล่มที่ <span style="${dot};min-width:50px;"></span></span><span>เลขที่ <span style="${dot};min-width:70px;font-weight:600;"></span></span></div>
    <div style="${sec}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px;"><b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-</b><div style="display:flex;align-items:center;gap:4px;font-size:10px;"><span>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</span>${taxIdBoxesHtml(company?.taxId || '')}</div></div>
      <div>ชื่อ <span style="${dot};min-width:250px;">${company?.name || ''}</span></div>
      <div>สาขา <span style="${dot};min-width:200px;">${company?.branch || 'สำนักงานใหญ่'}</span></div>
      <div>ที่อยู่ <span style="${dot};min-width:500px;">${company?.address || ''}</span></div>
    </div>
    <div style="${sec}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px;"><b>ผู้ถูกหักภาษี ณ ที่จ่าย :-</b><div style="display:flex;align-items:center;gap:4px;font-size:10px;"><span>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</span>${taxIdBoxesHtml(employee?.taxId || employee?.idCardNumber || '')}</div></div>
      <div>ชื่อ <span style="${dot};min-width:250px;">${employee?.fullName || ''}</span></div>
      <div>สาขา <span style="${dot};min-width:200px;"></span></div>
      <div>ที่อยู่ <span style="${dot};min-width:500px;">${employee?.address || ''}</span></div>
    </div>
    <div style="${sec};display:flex;align-items:flex-start;gap:12px;">
      <div style="flex-shrink:0;"><div style="display:flex;align-items:baseline;gap:4px;margin-bottom:4px;"><b>ลำดับที่</b><span style="${dot};display:inline-block;width:50px;text-align:center;"></span><b>ในแบบ</b></div></div>
      <div style="display:grid;grid-template-columns:repeat(4,auto);gap:4px 16px;align-items:center;">
        <span>${cbHtml(true)} ภ.ง.ด.1</span><span>${cbHtml(false)} ภ.ง.ด.1ก</span><span>${cbHtml(false)} ภ.ง.ด.1ก พิเศษ</span><span>${cbHtml(false)} ภ.ง.ด.2</span>
        <span>${cbHtml(false)} ภ.ง.ด.3</span><span>${cbHtml(false)} ภ.ง.ด.2ก</span><span>${cbHtml(false)} ภ.ง.ด.3ก</span><span>${cbHtml(false)} ภ.ง.ด.53</span>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:3px;">
      <tr><th style="${tdLs};width:54%;">ประเภทเงินได้พึงประเมินที่จ่าย</th><th style="${tdCs};width:14%;">วัน เดือน<br/>หรือปีภาษี ที่จ่าย</th><th style="${tdCs};width:16%;">จำนวนเงินที่จ่าย</th><th style="${tdCs};width:16%;">ภาษีที่หัก<br/>และนำส่งไว้</th></tr>
      <tr><td style="${tdLs}">1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td><td style="${tdCs}">${(employee?.incomeType || "1") === "1" ? yearBE : ""}</td><td style="${tdRs}">${(employee?.incomeType || "1") === "1" ? fmtZero(data.totalEarnings) : ""}</td><td style="${tdRs}">${(employee?.incomeType || "1") === "1" ? fmtZero(data.totalTax) : ""}</td></tr>
      <tr><td style="${tdLs}">2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</td><td style="${tdCs}">${employee?.incomeType === "2" ? yearBE : ""}</td><td style="${tdRs}">${employee?.incomeType === "2" ? fmtZero(data.totalEarnings) : ""}</td><td style="${tdRs}">${employee?.incomeType === "2" ? fmtZero(data.totalTax) : ""}</td></tr>
      <tr><td style="${tdLs}">3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs}">4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};padding-left:12px;">(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:20px;" colspan="4">(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้</td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:40px;">(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:40px;">(1.2) อัตราร้อยละ 25 ของกำไรสุทธิ</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:40px;">(1.3) อัตราร้อยละ 20 ของกำไรสุทธิ</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:40px;">(1.4) อัตราอื่นๆ (ระบุ) .................. ของกำไรสุทธิ</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:20px;" colspan="4">(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก</td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:40px;">(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:40px;">(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้น</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:40px;">(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:40px;">(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs};font-size:10px;padding-left:40px;">(2.5) อื่นๆ (ระบุ) ......................................................</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs}"><div>5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา</div><div style="padding-left:12px;font-size:10px;">3 เตรส เช่น รางวัล ส่วนลดฯ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ</div></td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr><td style="${tdLs}">6. อื่นๆ (ระบุ) ...........................................................</td><td style="${tdCs}"></td><td style="${tdRs}"></td><td style="${tdRs}"></td></tr>
      <tr style="font-weight:bold;"><td style="${tdRs}" colspan="2">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td><td style="${tdRs}">${fmtZero(data.totalEarnings)}</td><td style="${tdRs}">${fmtZero(data.totalTax)}</td></tr>
    </table>
    <div style="font-size:11px;margin-bottom:2px;"><b>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</b> <span style="${dot};min-width:320px;font-weight:600;">${numberToThaiWords(data.totalTax)}</span></div>
    <div style="font-size:10px;margin-bottom:3px;">เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน <span style="${dot};min-width:60px;"></span> บาท กองทุนประกันสังคม <span style="${dot};min-width:60px;">${data.totalSso ? fmtAlways(data.totalSso) : ''}</span> บาท กองทุนสำรองเลี้ยงชีพ <span style="${dot};min-width:60px;"></span> บาท</div>
    <div style="${sec};display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:11px;">
      <b>ผู้จ่ายเงิน</b> ${cbHtml(true)} (1) หัก ณ ที่จ่าย ${cbHtml(false)} (2) ออกให้ตลอดไป ${cbHtml(false)} (3) ออกให้ครั้งเดียว ${cbHtml(false)} (4) อื่นๆ
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;font-size:10px;margin-top:4px;">
      <div style="${sec};width:44%;font-size:10px;"><b>คำเตือน</b><div>ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div></div>
      <div style="width:52%;text-align:center;font-size:11px;">
        <div>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
        <div style="margin-top:20px;">ลงชื่อ <span style="${dot};min-width:170px;"></span> ผู้จ่ายเงิน <span style="font-size:10px;margin-left:8px;">ประทับตรา</span></div>
        <div style="margin-top:4px;"><span style="${dot};min-width:140px;">${company?.name || ''}</span></div>
        <div style="margin-top:4px;font-size:10px;">วันที่ ${todayStr}</div>
      </div>
    </div>
  </div>`;
}

function PayslipPreview({ data, companyName, companyAddress, logoUrl }: {
  data: {
    employee: any; baseSalary: number; otAmount: number; extraEarnings: any[]; extraDeductions: any[];
    totalEarnings: number; socialSecurity: number; withholdingTax: number; totalDeductions: number;
    netPay: number; workDays: number; ytdEarnings: number; ytdTax: number; ytdSocialSecurity: number;
    month: number; year: number; paidDate?: string;
  };
  companyName: string; companyAddress?: string; logoUrl?: string;
}) {
  const monthLabel = MONTHS.find(m => m.value === String(data.month))?.label || "";
  const yearBE = data.year + 543;
  let payDateStr: string;
  if (data.paidDate) {
    const pd = new Date(data.paidDate + "T00:00:00");
    payDateStr = `${String(pd.getDate()).padStart(2, "0")}/${String(pd.getMonth() + 1).padStart(2, "0")}/${pd.getFullYear() + 543}`;
  } else {
    const lastDay = new Date(data.year, data.month, 0);
    payDateStr = `${String(lastDay.getDate()).padStart(2, "0")}/${String(lastDay.getMonth() + 1).padStart(2, "0")}/${yearBE}`;
  }
  const ytdDeductions = (data.ytdEarnings - data.ytdTax - (data.ytdSocialSecurity || 0)) > 0
    ? data.ytdEarnings - (data.ytdEarnings - data.ytdTax - (data.ytdSocialSecurity || 0))
    : data.ytdTax + (data.ytdSocialSecurity || 0);

  const baseSal = Number(data.baseSalary || 0);
  const otAmt = Number(data.otAmount || 0);
  const extraEarnArr = (data.extraEarnings || []).map((item: any) => ({ label: item.label, amount: Number(item.amount || 0) }));
  const extraEarnSum = extraEarnArr.reduce((s: number, i: any) => s + i.amount, 0);
  const unaccounted = Number(data.totalEarnings || 0) - baseSal - otAmt - extraEarnSum;
  const earningRows: { label: string; amount: number }[] = [
    { label: "อัตราเงินเดือน", amount: baseSal },
    ...(otAmt > 0 ? [{ label: "ค่าล่วงเวลา (OT)", amount: otAmt }] : []),
    ...extraEarnArr,
    ...(unaccounted > 0.5 ? [{ label: "รายได้อื่น", amount: unaccounted }] : []),
  ];
  const deductionRows: { label: string; amount: number }[] = [
    ...(Number(data.socialSecurity || 0) > 0 ? [{ label: "ประกันสังคม", amount: Number(data.socialSecurity || 0) }] : []),
    ...(Number(data.withholdingTax || 0) > 0 ? [{ label: "ภาษีหัก ณ ที่จ่าย", amount: Number(data.withholdingTax || 0) }] : []),
    ...(data.extraDeductions || []).map((item: any) => ({ label: item.label, amount: Number(item.amount || 0) })),
  ];
  const maxRows = Math.max(earningRows.length, deductionRows.length, 3);

  const bdr = "1px solid var(--theme-primary)";
  const bdrLight = "1px solid #f5c4b3";
  const cellBase: React.CSSProperties = { padding: "5px 8px", fontSize: "12px", border: bdrLight };

  return (
    <div style={{ fontFamily: "'Sarabun', sans-serif", fontSize: "13px", padding: "24px", background: "#f3f4f6", color: "black", maxWidth: "640px", margin: "0 auto" }}>
      <div style={{ background: "white", border: bdr, overflow: "hidden" }}>

        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: bdr }}>
          {logoUrl && (
            <div style={{ width: "60px", height: "60px", borderRadius: "50%", overflow: "hidden", marginRight: "16px", flexShrink: 0, background: "var(--theme-primary-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={logoUrl} alt="" style={{ height: "48px", objectFit: "contain" }} />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>{companyName}</div>
            {companyAddress && <div style={{ fontSize: "11px", color: "#666" }}>{companyAddress}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: "var(--theme-primary)", lineHeight: 1.2 }}>Payroll Slip</div>
            <div style={{ fontSize: "14px", color: "var(--theme-primary)" }}>ใบแจ้งเงินเดือน</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: bdr }}>
          <div style={{ padding: "10px 16px", borderRight: bdr }}>
            <div style={{ fontSize: "11px", marginBottom: "6px" }}>
              <span style={{ fontWeight: 600 }}>รหัสพนักงาน :</span>
              <span style={{ color: "#444", marginLeft: "4px" }}>{data.employee?.employeeCode || "-"}</span>
              <span style={{ display: "block", fontSize: "10px", color: "#999" }}>Employee ID</span>
            </div>
            <div style={{ fontSize: "11px", marginBottom: "6px" }}>
              <span style={{ fontWeight: 600 }}>ชื่อพนักงาน :</span>
              <span style={{ color: "#444", marginLeft: "4px" }}>{data.employee?.fullName || "-"}</span>
              <span style={{ display: "block", fontSize: "10px", color: "#999" }}>Employee Name</span>
            </div>
            <div style={{ fontSize: "11px" }}>
              <span style={{ fontWeight: 600 }}>ตำแหน่งงาน :</span>
              <span style={{ color: "#444", marginLeft: "4px" }}>{data.employee?.position || "-"}</span>
              <span style={{ display: "block", fontSize: "10px", color: "#999" }}>Position</span>
            </div>
          </div>
          <div style={{ padding: "10px 16px" }}>
            <div style={{ fontSize: "11px", marginBottom: "6px" }}>
              <span style={{ fontWeight: 600 }}>ประจำงวด :</span>
              <span style={{ color: "#444", marginLeft: "4px" }}>{monthLabel} {yearBE}</span>
              <span style={{ display: "block", fontSize: "10px", color: "#999" }}>For Period</span>
            </div>
            <div style={{ fontSize: "11px", marginBottom: "6px" }}>
              <span style={{ fontWeight: 600 }}>วันที่จ่าย :</span>
              <span style={{ color: "#444", marginLeft: "4px" }}>{payDateStr}</span>
              <span style={{ display: "block", fontSize: "10px", color: "#999" }}>Pay Date</span>
            </div>
            <div style={{ fontSize: "11px" }}>
              <span style={{ fontWeight: 600 }}>เลขบัญชี :</span>
              <span style={{ color: "#444", marginLeft: "4px" }}>{data.employee?.bankAccountNumber || "-"}</span>
              <span style={{ display: "block", fontSize: "10px", color: "#999" }}>Acc. No.</span>
            </div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--theme-primary)", color: "white" }}>
              <th style={{ padding: "7px 8px", fontSize: "12px", fontWeight: 600, textAlign: "left", width: "35%", border: bdr, borderColor: "var(--theme-primary-hover)" }}>รายการได้ (Income)</th>
              <th style={{ padding: "7px 8px", fontSize: "12px", fontWeight: 600, textAlign: "right", width: "15%", border: bdr, borderColor: "var(--theme-primary-hover)" }}>บาท(THB)</th>
              <th style={{ padding: "7px 8px", fontSize: "12px", fontWeight: 600, textAlign: "left", width: "35%", border: bdr, borderColor: "var(--theme-primary-hover)" }}>รายการหัก (Deduction)</th>
              <th style={{ padding: "7px 8px", fontSize: "12px", fontWeight: 600, textAlign: "right", width: "15%", border: bdr, borderColor: "var(--theme-primary-hover)" }}>บาท(THB)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, i) => (
              <tr key={i}>
                <td style={cellBase}>{earningRows[i]?.label || ""}</td>
                <td style={{ ...cellBase, textAlign: "right" }}>{earningRows[i] ? fmt(earningRows[i].amount) : ""}</td>
                <td style={cellBase}>{deductionRows[i]?.label || ""}</td>
                <td style={{ ...cellBase, textAlign: "right" }}>{deductionRows[i] ? fmt(deductionRows[i].amount) : ""}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600, background: "#fff8f6" }}>
              <td style={{ ...cellBase, borderBottom: bdr }}>รวมรายได้</td>
              <td style={{ ...cellBase, textAlign: "right", borderBottom: bdr }}>{fmt(Number(data.totalEarnings || 0))}</td>
              <td style={{ ...cellBase, borderBottom: bdr }}>รวมหัก</td>
              <td style={{ ...cellBase, textAlign: "right", borderBottom: bdr }}>{fmt(Number(data.totalDeductions || 0))}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", border: bdr, borderLeft: "none", borderRight: "none", background: "#fff5f2" }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: "14px" }}>รวมรายได้สุทธิ ( Net Income)</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--theme-primary)" }}>฿{fmt(Number(data.netPay || 0))}</div>
            <div style={{ fontSize: "10px", color: "#888" }}>({numberToThaiWords(Number(data.netPay || 0))})</div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--theme-primary)", color: "white" }}>
              <th style={{ padding: "7px 4px", fontSize: "11px", fontWeight: 600, textAlign: "center", width: "25%", border: "1px solid var(--theme-primary-hover)" }}>
                <div>เงินได้สะสม</div><div style={{ fontSize: "10px", opacity: 0.85 }}>(YTD Income)</div>
              </th>
              <th style={{ padding: "7px 4px", fontSize: "11px", fontWeight: 600, textAlign: "center", width: "25%", border: "1px solid var(--theme-primary-hover)" }}>
                <div>เงินหักสะสม</div><div style={{ fontSize: "10px", opacity: 0.85 }}>(YTD Deduction)</div>
              </th>
              <th style={{ padding: "7px 4px", fontSize: "11px", fontWeight: 600, textAlign: "center", width: "25%", border: "1px solid var(--theme-primary-hover)" }}>
                <div>ภาษีสะสม</div><div style={{ fontSize: "10px", opacity: 0.85 }}>(YTD TAX)</div>
              </th>
              <th style={{ padding: "7px 4px", fontSize: "11px", fontWeight: 600, textAlign: "center", width: "25%", border: "1px solid var(--theme-primary-hover)" }}>
                <div>ประกันสังคมสะสม</div><div style={{ fontSize: "10px", opacity: 0.85 }}>(YTD Social Security)</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "8px 4px", textAlign: "center", fontSize: "13px", fontWeight: 600, border: bdrLight }}>฿{fmt(data.ytdEarnings)}</td>
              <td style={{ padding: "8px 4px", textAlign: "center", fontSize: "13px", fontWeight: 600, border: bdrLight }}>฿{fmt(ytdDeductions)}</td>
              <td style={{ padding: "8px 4px", textAlign: "center", fontSize: "13px", fontWeight: 600, border: bdrLight }}>฿{fmt(data.ytdTax)}</td>
              <td style={{ padding: "8px 4px", textAlign: "center", fontSize: "13px", fontWeight: 600, border: bdrLight }}>฿{fmt(data.ytdSocialSecurity || 0)}</td>
            </tr>
          </tbody>
        </table>

      </div>
    </div>
  );
}

export default function PayrollTaxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { acctName } = useLanguage();
  const { dateEra, dateFmt } = useDateSettings();
  const companyId = useHrCompanyId();
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && ["calculate", "pnd1", "pnd1a", "attachment", "50tawi", "payslip"].includes(tab)) return tab;
    return "calculate";
  });
  const [calculatedRecords, setCalculatedRecords] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editExtraEarnings, setEditExtraEarnings] = useState<any[]>([]);
  const [editExtraDeductions, setEditExtraDeductions] = useState<any[]>([]);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchType, setBatchType] = useState<"earning" | "deduction">("earning");
  const [batchLabel, setBatchLabel] = useState("");
  const [batchAmounts, setBatchAmounts] = useState<Record<number, string>>({});
  const [sendingLine, setSendingLine] = useState<number | null>(null);
  const [sendingEmail, setSendingEmail] = useState<number | null>(null);
  const [journalPreviewOpen, setJournalPreviewOpen] = useState(false);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState("");
  const [journalDate, setJournalDate] = useState("");
  const [inlineEdit, setInlineEdit] = useState<{rowId: number, field: string} | null>(null);
  const [inlineValue, setInlineValue] = useState("");
  const importFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [bankFileOpen, setBankFileOpen] = useState(false);
  const [bankFileSettings, setBankFileSettings] = useState({
    companyCode: "",
    companyName: "",
    companyBankAccount: "",
    paymentDate: "",
    effectiveDate: "",
  });

  const pnd1PrintRef = useRef<HTMLDivElement>(null);
  const payslipPrintRef = useRef<HTMLDivElement>(null);
  const pnd1aPrintRef = useRef<HTMLDivElement>(null);
  const attachPrintRef = useRef<HTMLDivElement>(null);
  const fiftyTawiPrintRef = useRef<HTMLDivElement>(null);

  const { data: allEmployees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees", companyId, "all-for-payroll"],
    queryFn: async () => {
      const r = await fetch(`/api/employees?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user && !!companyId,
  });

  const employees = useMemo(() => {
    const selectedYear = Number(year);
    const selectedMonth = Number(month);
    const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
    return allEmployees.filter((e: any) => {
      if (e.active) return true;
      if (e.resignDate) {
        const rd = new Date(e.resignDate);
        return rd >= monthStart;
      }
      if (e.employmentStatus === "resigned" && !e.resignDate) {
        return false;
      }
      return e.active;
    });
  }, [allEmployees, month, year]);

  const { data: savedRecords = [], refetch: refetchRecords } = useQuery<any[]>({
    queryKey: ["/api/payroll-records", companyId, month, year],
    queryFn: async () => {
      const r = await fetch(`/api/payroll-records?companyId=${companyId}&month=${month}&year=${year}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: company } = useQuery<any>({
    queryKey: ["/api/companies", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/companies/${companyId}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!companyId,
  });

  const { data: yearRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/payroll-records/year", companyId, year],
    queryFn: async () => {
      const r = await fetch(`/api/payroll-records/year?companyId=${companyId}&year=${year}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
  });

  const { data: docSettings } = useQuery<any>({
    queryKey: ["/api/document-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const res = await fetch(`/api/document-settings?companyId=${companyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: workSchedules = [] } = useQuery<any[]>({
    queryKey: ["/api/work-schedules", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/work-schedules?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
  });

  const otCutoffDay = (workSchedules.find((ws: any) => ws.isDefault) || workSchedules[0])?.otCutoffDay || 0;

  const { data: dbAdjustmentsCurrent = [] } = useQuery<any[]>({
    queryKey: ["/api/payroll-adjustments", companyId, month, year],
    queryFn: async () => {
      const r = await fetch(`/api/payroll-adjustments?companyId=${companyId}&month=${month}&year=${year}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user && !!companyId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const prevMonth = Number(month) === 1 ? 12 : Number(month) - 1;
  const prevYear = Number(month) === 1 ? Number(year) - 1 : Number(year);
  const { data: dbAdjustmentsPrev = [] } = useQuery<any[]>({
    queryKey: ["/api/payroll-adjustments", companyId, prevMonth, prevYear],
    queryFn: async () => {
      const r = await fetch(`/api/payroll-adjustments?companyId=${companyId}&month=${prevMonth}&year=${prevYear}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user && !!companyId && dbAdjustmentsCurrent.length === 0,
    staleTime: 0,
  });

  const dbAdjustments = dbAdjustmentsCurrent.length > 0 ? dbAdjustmentsCurrent : dbAdjustmentsPrev;

  const { data: paymentMethods = [] } = useQuery<any[]>({
    queryKey: ["/api/payment-methods", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/payment-methods?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
  });

  const { data: companyAccounts = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/accounts?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!companyId,
  });

  const sendLineMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/payslip/send-line", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "ส่ง LINE ไม่สำเร็จ"); }
      return r.json();
    },
    onSuccess: () => { setSendingLine(null); toast({ title: "ส่งสลิปทาง LINE สำเร็จ" }); },
    onError: (err: any) => { setSendingLine(null); toast({ title: "ส่ง LINE ไม่สำเร็จ", description: err.message, variant: "destructive" }); },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/payslip/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "ส่ง Email ไม่สำเร็จ"); }
      return r.json();
    },
    onSuccess: () => { setSendingEmail(null); toast({ title: "ส่งสลิปทาง Email สำเร็จ" }); },
    onError: (err: any) => { setSendingEmail(null); toast({ title: "ส่ง Email ไม่สำเร็จ", description: err.message, variant: "destructive" }); },
  });

  const createAdjMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/payroll-adjustments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "สร้างรายการไม่สำเร็จ"); }
      return r.json();
    },
  });

  const deleteAdjMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/payroll-adjustments/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "ลบไม่สำเร็จ"); }
      return r.json();
    },
  });

  const deletePayrollMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/payroll-records/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "ลบไม่สำเร็จ"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "ลบรายการเงินเดือนสำเร็จ" });
      refetchRecords();
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-records/year", companyId, year] });
      setCalculatedRecords(prev => prev.filter(r => r.employeeId !== deletingEmployeeId));
      setDeletingEmployeeId(null);
    },
    onError: (err: any) => {
      toast({ title: "ลบไม่สำเร็จ", description: err.message, variant: "destructive" });
      setDeletingEmployeeId(null);
    },
  });

  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null);

  const handleDeletePayrollRecord = (row: any) => {
    if (!row.id) {
      setCalculatedRecords(prev => prev.filter(r => r.employeeId !== row.employeeId));
      toast({ title: "ลบรายการเงินเดือนสำเร็จ" });
      return;
    }
    setDeletingEmployeeId(row.employeeId);
    deletePayrollMutation.mutate(row.id);
  };

  const patchPayrollMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/payroll-records/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "include" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "แก้ไขไม่สำเร็จ"); }
      return r.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-records/year", companyId, year] });
      if (calculatedRecords.length > 0) {
        setCalculatedRecords(prev => prev.map(r => r.employeeId === result.employeeId ? { ...r, ...result, employee: r.employee, extraEarnings: r.extraEarnings, extraDeductions: r.extraDeductions, otherEarnings: r.otherEarnings, otherDeductions: r.otherDeductions } : r));
      }
      toast({ title: "บันทึกการแก้ไขสำเร็จ" });
      setInlineEdit(null);
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const startInlineEdit = (rowId: number, field: string, currentValue: any) => {
    setInlineEdit({ rowId, field });
    setInlineValue(String(currentValue || 0));
  };

  const recalcAndSaveRow = (row: any, overrides: any) => {
    if (!row.id) return;
    const baseSalary = overrides.baseSalary !== undefined ? Number(overrides.baseSalary) : Number(row.baseSalary || 0);
    const otAmount = overrides.otAmount !== undefined ? Number(overrides.otAmount) : Number(row.otAmount || 0);
    const ssoExempt = overrides.ssoExempt !== undefined ? overrides.ssoExempt : !!row.ssoExempt;
    const taxDeds = overrides.taxDeductions !== undefined ? overrides.taxDeductions : (Array.isArray(row.taxDeductions) ? row.taxDeductions : []);
    const extraEarningsTotal = (row.extraEarnings || []).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
    const totalEarnings = baseSalary + otAmount + extraEarningsTotal;
    const socialSecurity = ssoExempt ? 0 : calcSocialSecurity(baseSalary);
    const taxDeductionTotal = taxDeds.reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    const withholdingTax = calcWithholdingTax(totalEarnings * 12, socialSecurity * 12, taxDeductionTotal);
    const extraDeductionsTotal = (row.extraDeductions || []).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
    const totalDeductions = socialSecurity + withholdingTax + extraDeductionsTotal;
    const netPay = totalEarnings - totalDeductions;
    const validTaxDeductions = taxDeds.filter((d: any) => d.amount > 0);
    patchPayrollMutation.mutate({
      id: row.id,
      data: { baseSalary, otAmount, totalEarnings, socialSecurity, ssoEmployer: socialSecurity, withholdingTax, totalDeductions, netPay, ssoExempt, taxDeductions: validTaxDeductions },
    });
  };

  const commitInlineEdit = (row: any) => {
    if (!inlineEdit) return;
    const newVal = Number(inlineValue) || 0;
    const currentVal = Number(row[inlineEdit.field] || 0);
    setInlineEdit(null);
    if (newVal === currentVal) return;
    recalcAndSaveRow(row, { [inlineEdit.field]: newVal });
  };

  const calculateMutation = useMutation({
    mutationFn: async () => {
      const m = Number(month);
      const y = Number(year);
      let otStartDate: Date;
      let otEndDate: Date;
      if (otCutoffDay > 0) {
        const prevMonth = m === 1 ? 12 : m - 1;
        const prevYear = m === 1 ? y - 1 : y;
        otStartDate = new Date(prevYear, prevMonth - 1, otCutoffDay + 1);
        otEndDate = new Date(y, m - 1, otCutoffDay + 1);
      } else {
        otStartDate = new Date(y, m - 1, 1);
        otEndDate = new Date(y, m, 1);
      }

      const commRes = await fetch(`/api/commission-records/for-payroll?companyId=${companyId}&month=${m}&year=${y}`, { credentials: "include" });
      const commissionData: { employeeId: number; commissionAmount: string }[] = commRes.ok ? await commRes.json() : [];
      const commissionMap = new Map<number, number>();
      for (const c of commissionData) commissionMap.set(c.employeeId, Number(c.commissionAmount || 0));

      const allData = await Promise.all(
        employees.map(async (emp: any) => {
          const [attRes, otRes] = await Promise.all([
            fetch(`/api/attendance/${emp.id}`, { credentials: "include" }),
            fetch(`/api/ot/${emp.id}`, { credentials: "include" }),
          ]);
          const attendance = attRes.ok ? await attRes.json() : [];
          const otData = otRes.ok ? await otRes.json() : [];
          return { emp, attendance, otData };
        })
      );

      const results: any[] = allData.map(({ emp, attendance, otData }) => {
        const monthAttendance = attendance.filter((a: any) => {
          const d = new Date(a.date);
          return d.getMonth() + 1 === m && d.getFullYear() === y;
        });
        const monthOtAll = otData.filter((o: any) => {
          if (o.status !== "approved") return false;
          const d = new Date(o.date);
          return d >= otStartDate && d < otEndDate;
        });

        const otPeriodAttendance = attendance.filter((a: any) => {
          const d = new Date(a.date);
          return d >= otStartDate && d < otEndDate;
        });
        const attendanceDates = new Set(otPeriodAttendance.map((a: any) => {
          const d = new Date(a.date);
          return d.toISOString().slice(0, 10);
        }));

        const monthOt: any[] = [];
        const otNoAttendance: any[] = [];
        for (const o of monthOtAll) {
          const otDateStr = new Date(o.date).toISOString().slice(0, 10);
          if (attendanceDates.has(otDateStr)) {
            monthOt.push(o);
          } else {
            otNoAttendance.push(o);
          }
        }

        const baseSalary = Number(emp.baseSalary || 0);
        const workDays = monthAttendance.length;
        const otHours = monthOt.reduce((s: number, o: any) => s + Number(o.hours || 0), 0);
        const otAmount = monthOt.reduce((s: number, o: any) => s + Number(o.amount || 0), 0);
        const otSkippedHours = otNoAttendance.reduce((s: number, o: any) => s + Number(o.hours || 0), 0);
        const otSkippedAmount = otNoAttendance.reduce((s: number, o: any) => s + Number(o.amount || 0), 0);

        const empDbAdj = dbAdjustments.filter((a: any) => a.employeeId === emp.id);
        const extraEarnings = empDbAdj
          .filter((a: any) => a.type === "earning")
          .map((a: any) => ({ id: String(a.id), label: (a.name || "").trim(), amount: Number(a.amount) }));
        const extraDeductions = empDbAdj
          .filter((a: any) => a.type === "deduction")
          .map((a: any) => ({ id: String(a.id), label: (a.name || "").trim(), amount: Number(a.amount) }));
        const extraEarningsTotal = extraEarnings.reduce((s: number, i: any) => s + i.amount, 0);
        const extraDeductionsTotal = extraDeductions.reduce((s: number, i: any) => s + i.amount, 0);
        const commissionAmount = commissionMap.get(emp.id) || 0;

        const existingRecord = savedRecords.find((r: any) => r.employeeId === emp.id);
        const taxDeductions = Array.isArray(existingRecord?.taxDeductions) ? existingRecord.taxDeductions : [];
        const taxDeductionTotal = taxDeductions.reduce((s: number, d: any) => s + Number(d.amount || 0), 0);

        const totalEarnings = baseSalary + otAmount + extraEarningsTotal + commissionAmount;
        const socialSecurity = calcSocialSecurity(baseSalary);
        const withholdingTax = calcWithholdingTax(totalEarnings * 12, socialSecurity * 12, taxDeductionTotal);
        const totalDeductions = socialSecurity + withholdingTax + extraDeductionsTotal;
        const netPay = totalEarnings - totalDeductions;

        const existingId = existingRecord?.id;
        return {
          id: existingId,
          employeeId: emp.id,
          employee: emp,
          baseSalary,
          otAmount,
          commissionAmount,
          extraEarnings,
          extraDeductions,
          otherEarnings: extraEarningsTotal,
          totalEarnings,
          socialSecurity,
          ssoEmployer: socialSecurity,
          withholdingTax,
          otherDeductions: extraDeductionsTotal,
          totalDeductions,
          netPay,
          workDays,
          otHours,
          leaveDays: 0,
          status: existingRecord?.status || "draft",
          taxDeductions,
          ssoExempt: existingRecord?.ssoExempt || false,
          paidDate: existingRecord?.paidDate || null,
          otSkippedHours,
          otSkippedAmount,
          otNoAttendanceCount: otNoAttendance.length,
          otNoAttendanceDetails: otNoAttendance.map((o: any) => ({
            date: new Date(o.date).toLocaleDateString("th-TH", { day: "numeric", month: "short" }),
            hours: Number(o.hours || 0),
            amount: Number(o.amount || 0),
          })),
        };
      });
      return results;
    },
    onSuccess: (data) => {
      setCalculatedRecords(data);
      const skippedCount = data.filter((r: any) => r.otNoAttendanceCount > 0).length;
      const totalSkippedOt = data.reduce((s: number, r: any) => s + (r.otNoAttendanceCount || 0), 0);
      let desc = `คำนวณพนักงาน ${data.length} คน`;
      if (skippedCount > 0) {
        desc += ` | ⚠️ OT ไม่นับ ${totalSkippedOt} รายการ (${skippedCount} คน ไม่มีลงเวลา)`;
      }
      toast({ title: "คำนวณเงินเดือนเสร็จสิ้น", description: desc });
    },
    onError: (err: any) => {
      toast({ title: "คำนวณไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const records = calculatedRecords.map(r => ({
        employeeId: r.employeeId,
        baseSalary: r.baseSalary,
        otAmount: r.otAmount,
        commissionAmount: r.commissionAmount || 0,
        otherEarnings: r.otherEarnings,
        totalEarnings: r.totalEarnings,
        socialSecurity: r.socialSecurity,
        withholdingTax: r.withholdingTax,
        otherDeductions: r.otherDeductions,
        totalDeductions: r.totalDeductions,
        netPay: r.netPay,
        workDays: r.workDays,
        otHours: r.otHours,
        leaveDays: r.leaveDays,
        status: "saved",
      }));
      const r = await fetch("/api/payroll-records/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, month: Number(month), year: Number(year), records }),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "บันทึกไม่สำเร็จ"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "บันทึกข้อมูลสำเร็จ" });
      refetchRecords();
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-records/year", companyId, year] });
      setCalculatedRecords([]);
    },
    onError: (err: any) => {
      toast({ title: "บันทึกไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/payroll-records/approve", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, month: Number(month), year: Number(year) }),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "อนุมัติไม่สำเร็จ"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "อนุมัติเงินเดือนสำเร็จ" });
      setCalculatedRecords([]);
      refetchRecords();
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-records/year", companyId, year] });
    },
    onError: (err: any) => {
      toast({ title: "อนุมัติไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const journalMutation = useMutation({
    mutationFn: async () => {
      const paymentAccountCode = selectedPaymentMethodId && selectedPaymentMethodId !== "auto" ? selectedPaymentMethodId : undefined;
      const r = await fetch("/api/payroll-records/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, month: Number(month), year: Number(year), entryDate: journalDate || undefined, paymentAccountCode }),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "ลงบัญชีไม่สำเร็จ"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "ลงบัญชีสำเร็จ" });
      setCalculatedRecords([]);
      refetchRecords();
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-records/year", companyId, year] });
      setJournalPreviewOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "ลงบัญชีไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const handleExportExcel = () => {
    const data = displayRecords.length > 0 ? displayRecords : savedRecords.map((r: any) => ({
      ...r,
      employee: employees.find((e: any) => e.id === r.employeeId),
    }));
    if (!data.length) { toast({ title: "ไม่มีข้อมูลให้ส่งออก", variant: "destructive" }); return; }
    const rows = data.map((r: any) => ({
      "รหัสพนักงาน": r.employee?.employeeCode || "",
      "ชื่อ": r.employee?.firstName || r.employee?.fullName?.split(" ")[0] || "",
      "นามสกุล": r.employee?.lastName || r.employee?.fullName?.split(" ").slice(1).join(" ") || "",
      "เงินเดือน": Number(r.baseSalary || 0),
      "OT": Number(r.otAmount || 0),
      "รายได้อื่น": Number(r.otherEarnings || 0),
      "รวมรายได้": Number(r.totalEarnings || 0),
      "ประกันสังคม": Number(r.socialSecurity || 0),
      "ภาษีหัก ณ ที่จ่าย": Number(r.withholdingTax || 0),
      "หักอื่นๆ": Number(r.otherDeductions || 0),
      "รวมหัก": Number(r.totalDeductions || 0),
      "เงินได้สุทธิ": Number(r.netPay || 0),
      "วันทำงาน": Number(r.workDays || 0),
      "ชม.OT": Number(r.otHours || 0),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    const monthLabel2 = MONTHS.find(m => m.value === month)?.label || month;
    XLSX.writeFile(wb, `เงินเดือน_${monthLabel2}_${Number(year) + 543}.xlsx`);
    toast({ title: "ส่งออก Excel สำเร็จ" });
  };

  const handleExportBankFile = () => {
    const data = displayRecords.length > 0 ? displayRecords : savedRecords.map((r: any) => ({
      ...r,
      employee: employees.find((e: any) => e.id === r.employeeId),
    }));
    if (!data.length) { toast({ title: "ไม่มีข้อมูลให้ส่งออก", variant: "destructive" }); return; }

    const { companyCode, companyName, companyBankAccount, paymentDate, effectiveDate } = bankFileSettings;
    if (!companyCode || !companyName || !companyBankAccount || !paymentDate || !effectiveDate) {
      toast({ title: "กรุณากรอกข้อมูลให้ครบ", variant: "destructive" });
      return;
    }

    const validRecords = data.filter((r: any) => r.employee?.bankAccountNumber && Number(r.netPay) > 0);
    if (!validRecords.length) {
      toast({ title: "ไม่พบพนักงานที่มีเลขบัญชีธนาคารและยอดจ่าย", variant: "destructive" });
      return;
    }

    const thaiByteLen = (s: string) => {
      let n = 0;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        n += (c >= 0x0E01 && c <= 0x0E5B) ? 1 : (c <= 0x7F ? 1 : 1);
      }
      return n;
    };
    const pad = (s: string, len: number, char = " ", left = false) => {
      let str = s;
      while (thaiByteLen(str) > len) str = str.slice(0, -1);
      const diff = len - thaiByteLen(str);
      const padding = char.repeat(Math.max(0, diff));
      return left ? padding + str : str + padding;
    };
    const fmtDateCE = (dateStr: string) => {
      const d = new Date(dateStr);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yy = String(d.getFullYear() % 100).padStart(2, "0");
      return `${yy}${mm}${dd}`;
    };
    const toSatang = (amount: number) => {
      return pad(String(Math.round(amount * 100)), 15, "0", true);
    };
    const cleanAcct = (acct: string) => (acct || "").replace(/[-\s]/g, "");

    const totalAmount = validRecords.reduce((s: number, r: any) => s + Number(r.netPay || 0), 0);
    const totalCount = validRecords.length;
    const payDateCE = fmtDateCE(paymentDate);
    const effDateCE = fmtDateCE(effectiveDate);
    const acctClean = cleanAcct(companyBankAccount);

    let header = "H";
    header += pad(companyCode, 3);
    header += pad("", 16);
    header += pad("000000", 6);
    header += pad("", 14);
    header += pad(acctClean, 10, " ", true);
    header += " ";
    header += toSatang(totalAmount);
    header += " ";
    header += payDateCE;
    header += pad("", 25);
    header += pad(companyName, 50);
    header += effDateCE;
    header += pad(String(totalCount), 18, "0", true);
    header += "N";
    header += pad("", 5);

    const detailLines = validRecords.map((r: any, idx: number) => {
      const seq = pad(String(idx + 1), 6, "0", true);
      const empAcct = cleanAcct(r.employee?.bankAccountNumber || "");
      const amount = toSatang(Number(r.netPay || 0));
      const empName = (r.employee?.fullName || `Employee #${r.employeeId}`).slice(0, 50);

      let line = "D";
      line += seq;
      line += pad("", 14);
      line += pad(empAcct, 10, " ", true);
      line += " ";
      line += amount;
      line += " ";
      line += payDateCE;
      line += pad("", 25);
      line += pad(empName, 50);
      line += effDateCE;
      line += seq;
      line += pad("", 164);
      line += "0000000000.00";
      line += "0000000000.00";
      line += pad("", 156);

      return line;
    });

    const content = [header, ...detailLines].join("\r\n") + "\r\n";

    const toTIS620 = (str: string): Uint8Array => {
      const bytes: number[] = [];
      for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code <= 0x7F) {
          bytes.push(code);
        } else if (code >= 0x0E01 && code <= 0x0E3A) {
          bytes.push(code - 0x0E00 + 0xA0);
        } else if (code >= 0x0E3F && code <= 0x0E5B) {
          bytes.push(code - 0x0E00 + 0xA0);
        } else {
          bytes.push(0x20);
        }
      }
      return new Uint8Array(bytes);
    };
    const blob = new Blob([toTIS620(content)], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const monthStr = String(month).padStart(2, "0");
    const yearBE = String(Number(year) + 543);
    a.download = `${companyCode}${payDateCE}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setBankFileOpen(false);
    toast({ title: "สร้างไฟล์โอนเงินธนาคารสำเร็จ", description: `${totalCount} รายการ, ยอดรวม ฿${totalAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` });
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      if (!rows.length) { toast({ title: "ไฟล์ Excel ว่างเปล่า", variant: "destructive" }); return; }

      const records = rows.map((row: any) => {
        const firstName = row["ชื่อ"] || row["first_name"] || row["firstName"] || "";
        const lastName = row["นามสกุล"] || row["last_name"] || row["lastName"] || "";
        const empCode = row["รหัสพนักงาน"] || row["employee_code"] || row["employeeCode"] || "";
        const fullName = `${firstName} ${lastName}`.trim();

        let emp = empCode ? employees.find((e: any) => e.employeeCode === empCode) : null;
        if (!emp && fullName) {
          emp = employees.find((e: any) => {
            const eFull = `${e.firstName || ""} ${e.lastName || ""}`.trim();
            return eFull === fullName || e.fullName === fullName;
          });
        }
        if (!emp && firstName) {
          emp = employees.find((e: any) => e.firstName === firstName);
        }

        const baseSalary = Number(row["เงินเดือน"] || row["base_salary"] || row["baseSalary"] || 0);
        const otAmount = Number(row["OT"] || row["ot_amount"] || row["otAmount"] || 0);
        const otherEarnings = Number(row["รายได้อื่น"] || row["other_earnings"] || row["otherEarnings"] || 0);
        const totalEarnings = Number(row["รวมรายได้"] || row["total_earnings"] || row["totalEarnings"] || baseSalary + otAmount + otherEarnings);
        const socialSecurity = Number(row["ประกันสังคม"] || row["social_security"] || row["socialSecurity"] || 0);
        const withholdingTax = Number(row["ภาษีหัก ณ ที่จ่าย"] || row["withholding_tax"] || row["withholdingTax"] || 0);
        const otherDeductions = Number(row["หักอื่นๆ"] || row["other_deductions"] || row["otherDeductions"] || 0);
        const totalDeductions = socialSecurity + withholdingTax + otherDeductions;
        const netPay = Number(row["เงินได้สุทธิ"] || row["net_pay"] || row["netPay"] || totalEarnings - totalDeductions);
        const workDays = Number(row["วันทำงาน"] || row["work_days"] || row["workDays"] || 0);
        const otHours = Number(row["ชม.OT"] || row["ot_hours"] || row["otHours"] || 0);

        return {
          employeeId: emp?.id,
          employeeName: fullName || empCode,
          baseSalary, otAmount, otherEarnings, totalEarnings,
          socialSecurity, withholdingTax, otherDeductions, totalDeductions,
          netPay, workDays, otHours, leaveDays: 0,
        };
      });

      const unmatched = records.filter(r => !r.employeeId);
      if (unmatched.length > 0) {
        toast({
          title: `ไม่พบพนักงาน ${unmatched.length} คน`,
          description: unmatched.map(r => r.employeeName).join(", "),
          variant: "destructive",
        });
        return;
      }

      const r = await fetch("/api/payroll-records/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, month: Number(month), year: Number(year), records }),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message || "นำเข้าไม่สำเร็จ"); }
      toast({ title: "นำเข้า Excel สำเร็จ", description: `นำเข้าพนักงาน ${records.length} คน` });
      refetchRecords();
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-records/year", companyId, year] });
      setCalculatedRecords([]);
    } catch (err: any) {
      toast({ title: "นำเข้าไม่สำเร็จ", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  };

  const displayRecords = calculatedRecords.length > 0 ? calculatedRecords : savedRecords.map((r: any) => {
    const empDbAdj = dbAdjustments.filter((a: any) => a.employeeId === r.employeeId);
    const extraEarnings = empDbAdj.filter((a: any) => a.type === "earning").map((a: any) => ({ id: String(a.id), label: (a.name || "").trim(), amount: Number(a.amount) }));
    const extraDeductions = empDbAdj.filter((a: any) => a.type === "deduction").map((a: any) => ({ id: String(a.id), label: (a.name || "").trim(), amount: Number(a.amount) }));
    const extraEarningsTotal = extraEarnings.reduce((s: number, i: any) => s + i.amount, 0);
    const extraDeductionsTotal = extraDeductions.reduce((s: number, i: any) => s + i.amount, 0);
    const taxDeductions = Array.isArray(r.taxDeductions) ? r.taxDeductions : [];
    return {
      ...r,
      employee: employees.find((e: any) => e.id === r.employeeId) || { fullName: `ID: ${r.employeeId}`, employeeCode: "-", position: "-" },
      extraEarnings,
      extraDeductions,
      totalEarnings: Number(r.totalEarnings || 0),
      socialSecurity: Number(r.socialSecurity || 0),
      withholdingTax: Number(r.withholdingTax || 0),
      otherEarnings: extraEarningsTotal > 0 ? extraEarningsTotal : Number(r.otherEarnings || 0),
      otherDeductions: extraDeductionsTotal > 0 ? extraDeductionsTotal : Number(r.otherDeductions || 0),
      totalDeductions: Number(r.totalDeductions || 0),
      netPay: Number(r.netPay || 0),
      taxDeductions,
    };
  });

  const dynamicColumns = useMemo(() => {
    const earningLabels = new Set<string>();
    const deductionLabels = new Set<string>();
    displayRecords.forEach((row: any) => {
      (row.extraEarnings || []).forEach((i: any) => earningLabels.add(i.label));
      (row.extraDeductions || []).forEach((i: any) => deductionLabels.add(i.label));
    });
    return {
      earnings: Array.from(earningLabels),
      deductions: Array.from(deductionLabels),
    };
  }, [displayRecords]);

  const totalEmployees = displayRecords.length;
  const totalEarnings = displayRecords.reduce((s: number, r: any) => s + Number(r.totalEarnings || 0), 0);
  const totalSS = displayRecords.reduce((s: number, r: any) => s + Number(r.socialSecurity || 0), 0);
  const totalTax = displayRecords.reduce((s: number, r: any) => s + Number(r.withholdingTax || 0), 0);

  const currentStatus = savedRecords.length > 0 ? savedRecords[0]?.status : null;

  const yearBE = Number(year) + 543;
  const monthLabel = MONTHS.find(m => m.value === month)?.label || "";

  const pnd1TotalEarnings = savedRecords.reduce((s: number, r: any) => s + Number(r.totalEarnings || 0), 0);
  const pnd1TotalTax = savedRecords.reduce((s: number, r: any) => s + Number(r.withholdingTax || 0), 0);

  const ytdRecords = useMemo(() => {
    const currentMonth = Number(month);
    return yearRecords.filter((r: any) => Number(r.month) <= currentMonth);
  }, [yearRecords, month]);

  const annualSummary = useMemo(() => {
    const grouped: Record<number, { employeeId: number; totalEarnings: number; totalTax: number }> = {};
    for (const r of ytdRecords) {
      const eid = r.employeeId;
      if (!grouped[eid]) grouped[eid] = { employeeId: eid, totalEarnings: 0, totalTax: 0 };
      grouped[eid].totalEarnings += Number(r.totalEarnings || 0);
      grouped[eid].totalTax += Number(r.withholdingTax || 0);
    }
    return Object.values(grouped);
  }, [ytdRecords]);

  const grandTotalEarnings = annualSummary.reduce((s, r) => s + r.totalEarnings, 0);
  const grandTotalTax = annualSummary.reduce((s, r) => s + r.totalTax, 0);

  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const payDate = `${lastDay}/${month.padStart(2, "0")}/${yearBE}`;

  const annualByEmployee = useMemo(() => {
    const grouped: Record<number, { employeeId: number; totalEarnings: number; totalTax: number; totalSso: number }> = {};
    for (const r of ytdRecords) {
      const eid = r.employeeId;
      if (!grouped[eid]) grouped[eid] = { employeeId: eid, totalEarnings: 0, totalTax: 0, totalSso: 0 };
      grouped[eid].totalEarnings += Number(r.totalEarnings || 0);
      grouped[eid].totalTax += Number(r.withholdingTax || 0);
      grouped[eid].totalSso += Number(r.socialSecurity || 0);
    }
    return grouped;
  }, [ytdRecords]);

  const activeEmployees = employees.filter((e: any) => e.active);
  const logoUrl = docSettings?.showLogo !== false ? objectPathToUrl(docSettings?.logoUrl) || undefined : undefined;
  const selectedEmp = selectedEmployeeId ? employees.find((e: any) => e.id === Number(selectedEmployeeId)) : null;
  const selectedData = selectedEmployeeId ? annualByEmployee[Number(selectedEmployeeId)] : null;

  const handlePrintPnd1 = () => {
    if (!pnd1PrintRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>ใบแนบ ภงด.1 - ${monthLabel} ${yearBE}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Sarabun', sans-serif; padding: 15px; }
      table { width: 100%; border-collapse: collapse; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { size: A4; margin: 10mm; } }</style>
      </head><body>${pnd1PrintRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  };

  const handleDownloadRDPrepPnd1 = async (format: "xlsx" | "csv" = "xlsx") => {
    try {
      const r = await fetch(`/api/payroll-records/rd-prep?companyId=${companyId}&month=${month}&year=${year}&type=pnd1&format=${format}`, { credentials: "include" });
      if (!r.ok) { toast({ title: "ดาวน์โหลดไม่สำเร็จ", variant: "destructive" }); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "csv" ? "csv" : "xlsx";
      a.download = `PND1_${String(month).padStart(2, "0")}_${Number(year) + 543}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "ดาวน์โหลดไม่สำเร็จ", variant: "destructive" });
    }
  };

  const handlePrintPnd1a = () => {
    if (!pnd1aPrintRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>ใบแนบ ภงด.1ก - ปี ${yearBE}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Sarabun', sans-serif; padding: 15px; }
      table { width: 100%; border-collapse: collapse; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } @page { size: A4; margin: 10mm; } }</style>
      </head><body>${pnd1aPrintRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  };

  const handleDownloadRDPrepPnd1a = async (format: "xlsx" | "csv" = "xlsx") => {
    try {
      const r = await fetch(`/api/payroll-records/rd-prep?companyId=${companyId}&year=${year}&type=pnd1a&format=${format}`, { credentials: "include" });
      if (!r.ok) { toast({ title: "ดาวน์โหลดไม่สำเร็จ", variant: "destructive" }); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "csv" ? "csv" : "xlsx";
      a.download = `PND1A_${Number(year) + 543}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "ดาวน์โหลดไม่สำเร็จ", variant: "destructive" });
    }
  };

  const handlePrintAttachment = () => {
    if (!attachPrintRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>ใบแนบภาษี - ${monthLabel} ${yearBE}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Sarabun', sans-serif; padding: 20px; }
      table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #333; padding: 4px 6px; font-size: 11px; }
      th { background: #f5f5f5; font-weight: bold; } .text-right { text-align: right; } .text-center { text-align: center; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }</style>
      </head><body>${attachPrintRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  };

  const handlePrintSingle50Tawi = () => {
    if (!fiftyTawiPrintRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>50 ทวิ - ${selectedEmp?.fullName || ""}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Sarabun', sans-serif; }
        .fifty-tawi-page { width: 210mm; min-height: 297mm; padding: 8mm 10mm; }
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .fifty-tawi-page { width: 100% !important; min-height: auto !important; padding: 4mm 6mm !important; border: none !important; }
        }
      </style>
      </head><body>${fiftyTawiPrintRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  };

  const handlePrintAll50Tawi = () => {
    const allCertsHtml = activeEmployees.map(emp => {
      const data = annualByEmployee[emp.id];
      if (!data) return "";
      return generateA4Html(company, emp, data, yearBE);
    }).join("");

    if (!allCertsHtml) {
      toast({ title: "ไม่พบข้อมูล", description: "ไม่มีข้อมูลเงินเดือนของพนักงานในปีที่เลือก", variant: "destructive" });
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>50 ทวิ ทั้งหมด - ปี ${yearBE}</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Sarabun', sans-serif; }
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
      </head><body>${allCertsHtml}</body></html>
    `);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  };

  const payslipData = useMemo(() => {
    const currentMonth = Number(month);
    return displayRecords.map((row: any) => {
      const prevMonths = ytdRecords.filter((yr: any) => yr.employeeId === row.employeeId && Number(yr.month) < currentMonth);
      const prevEarnings = prevMonths.reduce((s: number, r: any) => s + Number(r.totalEarnings || 0), 0);
      const prevTax = prevMonths.reduce((s: number, r: any) => s + Number(r.withholdingTax || 0), 0);
      const prevSso = prevMonths.reduce((s: number, r: any) => s + Number(r.socialSecurity || 0), 0);
      const ytdEarnings = prevEarnings + Number(row.totalEarnings || 0);
      const ytdTax = prevTax + Number(row.withholdingTax || 0);
      const ytdSocialSecurity = prevSso + Number(row.socialSecurity || 0);
      return { ...row, ytdEarnings, ytdTax, ytdSocialSecurity };
    });
  }, [displayRecords, ytdRecords, month]);

  const payslipNetTotal = payslipData.reduce((s: number, r: any) => s + Number(r.netPay || 0), 0);
  const payslipOtTotal = payslipData.reduce((s: number, r: any) => s + Number(r.otAmount || 0), 0);
  const payslipDeductionsTotal = payslipData.reduce((s: number, r: any) => s + Number(r.totalDeductions || 0), 0);

  const [editOtAmount, setEditOtAmount] = useState("");
  const [editWithholdingTax, setEditWithholdingTax] = useState("");
  const [editSsoExempt, setEditSsoExempt] = useState(false);

  const openEdit = (row: any) => {
    setEditTarget(row);
    setEditOtAmount(String(row.otAmount || 0));
    setEditWithholdingTax(String(row.withholdingTax || 0));
    setEditSsoExempt(!!row.ssoExempt);
    setEditExtraEarnings((row.extraEarnings || []).map((e: any) => ({ ...e })));
    setEditExtraDeductions((row.extraDeductions || []).map((e: any) => ({ ...e })));
    setEditOpen(true);
  };

  const addExtraEarning = () => setEditExtraEarnings(prev => [...prev, { id: `new-${Date.now()}`, label: "", amount: 0 }]);
  const addExtraDeduction = () => setEditExtraDeductions(prev => [...prev, { id: `new-${Date.now()}`, label: "", amount: 0 }]);
  const removeExtraEarning = (id: string) => setEditExtraEarnings(prev => prev.filter(e => e.id !== id));
  const removeExtraDeduction = (id: string) => setEditExtraDeductions(prev => prev.filter(e => e.id !== id));

  const handleEditSave = async () => {
    if (!editTarget) return;
    try {
      const newOt = Number(editOtAmount) || 0;
      const newTax = Number(editWithholdingTax) || 0;
      const baseSalary = Number(editTarget.baseSalary || 0);
      const extraEarningsTotal = editExtraEarnings.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      const extraDeductionsTotal = editExtraDeductions.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      const totalEarnings = baseSalary + newOt + extraEarningsTotal;
      const socialSecurity = editSsoExempt ? 0 : calcSocialSecurity(baseSalary);
      const totalDeductions = socialSecurity + newTax + extraDeductionsTotal;
      const netPay = totalEarnings - totalDeductions;

      if (editTarget.id) {
        await patchPayrollMutation.mutateAsync({
          id: editTarget.id,
          data: {
            otAmount: newOt,
            withholdingTax: newTax,
            ssoExempt: editSsoExempt,
            socialSecurity,
            totalEarnings,
            totalDeductions,
            netPay,
          },
        });
      }

      const existingAdj = dbAdjustments.filter((a: any) => a.employeeId === editTarget.employeeId);
      for (const adj of existingAdj) {
        await deleteAdjMutation.mutateAsync(adj.id);
      }
      for (const e of editExtraEarnings) {
        if (e.label && e.amount) {
          await createAdjMutation.mutateAsync({ companyId, employeeId: editTarget.employeeId, type: "earning", name: (e.label || "").trim(), amount: Number(e.amount), month: Number(month), year: Number(year) });
        }
      }
      for (const d of editExtraDeductions) {
        if (d.label && d.amount) {
          await createAdjMutation.mutateAsync({ companyId, employeeId: editTarget.employeeId, type: "deduction", name: (d.label || "").trim(), amount: Number(d.amount), month: Number(month), year: Number(year) });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/payroll-adjustments"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/payroll-records"] });
      const savedEarnings = editExtraEarnings.filter(e => e.label && e.amount).map(e => ({ ...e, label: e.label.trim() }));
      const savedDeductions = editExtraDeductions.filter(d => d.label && d.amount).map(d => ({ ...d, label: d.label.trim() }));
      const updatedExtraEarningsTotal = savedEarnings.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      const updatedExtraDeductionsTotal = savedDeductions.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      const updatedTotalEarnings = baseSalary + newOt + updatedExtraEarningsTotal;
      const updatedSocialSecurity = editSsoExempt ? 0 : calcSocialSecurity(baseSalary);
      const updatedTotalDeductions = updatedSocialSecurity + newTax + updatedExtraDeductionsTotal;
      const updatedNetPay = updatedTotalEarnings - updatedTotalDeductions;
      if (calculatedRecords.length > 0) {
        setCalculatedRecords(prev => prev.map(r => r.employeeId === editTarget.employeeId ? {
          ...r,
          otAmount: newOt,
          withholdingTax: newTax,
          ssoExempt: editSsoExempt,
          socialSecurity: updatedSocialSecurity,
          totalEarnings: updatedTotalEarnings,
          totalDeductions: updatedTotalDeductions,
          netPay: updatedNetPay,
          extraEarnings: savedEarnings,
          extraDeductions: savedDeductions,
          otherEarnings: updatedExtraEarningsTotal,
          otherDeductions: updatedExtraDeductionsTotal,
        } : r));
      }
      toast({ title: "บันทึกการแก้ไขสำเร็จ" });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: "บันทึกไม่สำเร็จ", description: err.message, variant: "destructive" });
    }
  };

  const handleEditReset = async () => {
    if (!editTarget) return;
    try {
      const existingAdj = dbAdjustments.filter((a: any) => a.employeeId === editTarget.employeeId);
      for (const adj of existingAdj) {
        await deleteAdjMutation.mutateAsync(adj.id);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/payroll-adjustments"] });
      toast({ title: "รีเซ็ตรายการปรับปรุงสำเร็จ" });
      setEditOpen(false);
    } catch (err: any) {
      toast({ title: "รีเซ็ตไม่สำเร็จ", description: err.message, variant: "destructive" });
    }
  };

  const openBatch = (type: "earning" | "deduction") => {
    setBatchType(type);
    setBatchLabel("");
    setBatchAmounts({});
    setBatchOpen(true);
  };

  const [batchSaving, setBatchSaving] = useState(false);

  const handleBatchSave = async () => {
    if (!batchLabel) { toast({ title: "กรุณาระบุชื่อรายการ", variant: "destructive" }); return; }
    if (batchSaving) return;
    setBatchSaving(true);
    try {
      const items = Object.entries(batchAmounts)
        .filter(([, amountStr]) => Number(amountStr) > 0)
        .map(([empId, amountStr]) => ({ employeeId: Number(empId), amount: Number(amountStr) }));
      if (!items.length) { toast({ title: "ไม่มีรายการที่ต้องบันทึก", variant: "destructive" }); setBatchSaving(false); return; }
      const res = await fetch("/api/payroll-adjustments/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, items, month: Number(month), year: Number(year), type: batchType, name: batchLabel }),
        credentials: "include",
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message || "บันทึกไม่สำเร็จ"); }
      await queryClient.invalidateQueries({ queryKey: ["/api/payroll-adjustments"] });
      await queryClient.refetchQueries({ queryKey: ["/api/payroll-adjustments", month, year] });
      if (calculatedRecords.length > 0) {
        const freshAdj = await fetch(`/api/payroll-adjustments?month=${month}&year=${year}`, { credentials: "include" }).then(r => r.ok ? r.json() : []);
        setCalculatedRecords(prev => prev.map(r => {
          const empAdj = freshAdj.filter((a: any) => a.employeeId === r.employeeId);
          const extraEarnings = empAdj.filter((a: any) => a.type === "earning").map((a: any) => ({ id: String(a.id), label: (a.name || "").trim(), amount: Number(a.amount) }));
          const extraDeductions = empAdj.filter((a: any) => a.type === "deduction").map((a: any) => ({ id: String(a.id), label: (a.name || "").trim(), amount: Number(a.amount) }));
          const extraEarningsTotal = extraEarnings.reduce((s: number, i: any) => s + i.amount, 0);
          const extraDeductionsTotal = extraDeductions.reduce((s: number, i: any) => s + i.amount, 0);
          const baseSalary = Number(r.baseSalary || 0);
          const otAmount = Number(r.otAmount || 0);
          const totalEarnings = baseSalary + otAmount + extraEarningsTotal;
          const socialSecurity = r.ssoExempt ? 0 : calcSocialSecurity(baseSalary);
          const taxDeds = Array.isArray(r.taxDeductions) ? r.taxDeductions : [];
          const taxDeductionTotal = taxDeds.reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
          const withholdingTax = calcWithholdingTax(totalEarnings * 12, socialSecurity * 12, taxDeductionTotal);
          const totalDeductions = socialSecurity + withholdingTax + extraDeductionsTotal;
          const netPay = totalEarnings - totalDeductions;
          return { ...r, extraEarnings, extraDeductions, otherEarnings: extraEarningsTotal, otherDeductions: extraDeductionsTotal, totalEarnings, socialSecurity, ssoEmployer: socialSecurity, withholdingTax, totalDeductions, netPay };
        }));
      }
      toast({ title: "บันทึกรายการเพิ่ม/หักทั้งระบบสำเร็จ" });
      setBatchOpen(false);
    } catch (err: any) {
      toast({ title: "บันทึกไม่สำเร็จ", description: err.message, variant: "destructive" });
    } finally {
      setBatchSaving(false);
    }
  };

  const handlePrintPayslip = (row: any) => {
    const currentMonth = Number(month);
    const freshRow = displayRecords.find((r: any) => r.employeeId === row.employeeId) || row;
    const prevMonths = ytdRecords.filter((yr: any) => yr.employeeId === freshRow.employeeId && Number(yr.month) < currentMonth);
    const prevEarnings = prevMonths.reduce((s: number, r: any) => s + Number(r.totalEarnings || 0), 0);
    const prevTax = prevMonths.reduce((s: number, r: any) => s + Number(r.withholdingTax || 0), 0);
    const prevSso = prevMonths.reduce((s: number, r: any) => s + Number(r.socialSecurity || 0), 0);
    const ytdEarnings = prevEarnings + Number(freshRow.totalEarnings || 0);
    const ytdTax = prevTax + Number(freshRow.withholdingTax || 0);
    const ytdSocialSecurity = prevSso + Number(freshRow.socialSecurity || 0);
    setPreviewData({ ...freshRow, ytdEarnings, ytdTax, ytdSocialSecurity, month: currentMonth, year: Number(year) });
    setPreviewOpen(true);
  };

  const handlePrintPayslipWindow = () => {
    if (!payslipPrintRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>สลิปเงินเดือน</title>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: 'Sarabun', sans-serif; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }</style>
      </head><body>${payslipPrintRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.onload = () => { printWindow.print(); };
  };

  const handleSendLine = (row: any) => {
    if (!row.employee?.lineUserId) {
      toast({ title: "ไม่พบ LINE User ID", description: "กรุณาตั้งค่า LINE User ID ของพนักงาน", variant: "destructive" });
      return;
    }
    setSendingLine(row.employeeId);
    sendLineMutation.mutate({ employeeId: row.employeeId, month: Number(month), year: Number(year), companyId });
  };

  const handleSendEmail = (row: any) => {
    if (!row.employee?.email) {
      toast({ title: "ไม่พบอีเมล", description: "กรุณาตั้งค่าอีเมลของพนักงาน", variant: "destructive" });
      return;
    }
    setSendingEmail(row.employeeId);
    sendEmailMutation.mutate({ employeeId: row.employeeId, month: Number(month), year: Number(year), companyId });
  };

  return (
    <HRLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Calculator className="h-6 w-6" style={{ color: "var(--theme-primary)" }} />
            <h1 className="text-2xl font-bold" data-testid="text-page-title">คำนวณเงินเดือนและภาษี</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-36" data-testid="select-month">
                <SelectValue placeholder="เดือน" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => (
                  <SelectItem key={m.value} value={m.value} data-testid={`option-month-${m.value}`}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-24" data-testid="select-year">
                <SelectValue placeholder="ปี" />
              </SelectTrigger>
              <SelectContent>
                {getYearOptions().map(y => (
                  <SelectItem key={y.value} value={y.value} data-testid={`option-year-${y.value}`}>{y.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentStatus && statusBadge(currentStatus)}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-none shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium" data-testid="label-emp-count">จำนวนพนักงาน</p>
                  <p className="text-3xl font-bold" style={{ color: "var(--theme-primary)" }} data-testid="text-emp-count">{totalEmployees}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: "var(--theme-primary-light)" }}>
                  <Users className="h-6 w-6" style={{ color: "var(--theme-primary)" }} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium" data-testid="label-total-earnings">เงินเดือนรวม</p>
                  <p className="text-2xl font-bold" style={{ color: "#05b187" }} data-testid="text-total-earnings">฿{fmt(totalEarnings)}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center bg-emerald-50">
                  <DollarSign className="h-6 w-6 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium" data-testid="label-total-ss">ประกันสังคมรวม</p>
                  <p className="text-2xl font-bold" style={{ color: "#03c9d7" }} data-testid="text-total-ss">฿{fmt(totalSS)}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: "#e5f9fa" }}>
                  <Shield className="h-6 w-6" style={{ color: "#03c9d7" }} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium" data-testid="label-total-tax">ภาษีหัก ณ ที่จ่ายรวม</p>
                  <p className="text-2xl font-bold" style={{ color: "#f94d4d" }} data-testid="text-total-tax">฿{fmt(totalTax)}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center bg-red-50">
                  <FileText className="h-6 w-6 text-red-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 w-full" data-testid="tabs-payroll">
            <TabsTrigger value="calculate" className="text-sm" data-testid="tab-calculate">คำนวณเงินเดือน</TabsTrigger>
            <TabsTrigger value="payslip" className="text-sm" data-testid="tab-payslip">สลิปเงินเดือน</TabsTrigger>
            <TabsTrigger value="pnd1" className="text-sm" data-testid="tab-pnd1">ภงด.1</TabsTrigger>
            <TabsTrigger value="attachment" className="text-sm" data-testid="tab-attachment">ประกันสังคม</TabsTrigger>
            <TabsTrigger value="pnd1a" className="text-sm" data-testid="tab-pnd1a">ภงด.1ก</TabsTrigger>
            <TabsTrigger value="50tawi" className="text-sm" data-testid="tab-50tawi">50ทวิ</TabsTrigger>
          </TabsList>

          <TabsContent value="calculate" className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={() => calculateMutation.mutate()} disabled={calculateMutation.isPending} style={{ background: "var(--theme-primary)" }} className="text-white hover:opacity-90" data-testid="button-calculate">
                <Calculator className="h-4 w-4 mr-2" />
                {calculateMutation.isPending ? "กำลังคำนวณ..." : "คำนวณเงินเดือน"}
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={calculatedRecords.length === 0 || saveMutation.isPending} variant="outline" style={{ borderColor: "#05b187", color: "#05b187" }} data-testid="button-save">
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
              </Button>
              <Button onClick={() => approveMutation.mutate()} disabled={savedRecords.length === 0 || currentStatus !== "saved" || approveMutation.isPending} variant="outline" style={{ borderColor: "#05b187", color: "#05b187" }} data-testid="button-approve">
                <CheckCircle className="h-4 w-4 mr-2" />
                {approveMutation.isPending ? "กำลังอนุมัติ..." : "อนุมัติ"}
              </Button>
              <Button onClick={() => { const lastDay = new Date(Number(year), Number(month), 0); setJournalDate(`${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`); setJournalPreviewOpen(true); }} disabled={savedRecords.length === 0 || currentStatus !== "approved" || journalMutation.isPending} variant="outline" style={{ borderColor: "var(--theme-primary)", color: "var(--theme-primary)" }} data-testid="button-journal">
                <BookOpen className="h-4 w-4 mr-2" />
                {journalMutation.isPending ? "กำลังลงบัญชี..." : "ลงบัญชี / จ่ายเงิน"}
              </Button>
              <div className="border-l border-gray-300 h-6 mx-1" />
              <Button onClick={handleExportExcel} disabled={displayRecords.length === 0 && savedRecords.length === 0} variant="outline" className="bg-lime-500 text-white hover:bg-lime-600 border-none" data-testid="button-export-payroll-excel">
                <Download className="h-4 w-4 mr-2" />ส่งออก Excel
              </Button>
              <Button onClick={() => { const lastDay = new Date(Number(year), Number(month), 0); const payDate = `${year}-${String(month).padStart(2,"0")}-${String(lastDay.getDate()).padStart(2,"0")}`; setBankFileSettings(prev => ({ ...prev, companyName: prev.companyName || company?.name || "", paymentDate: payDate, effectiveDate: payDate })); setBankFileOpen(true); }} disabled={displayRecords.length === 0 && savedRecords.length === 0} variant="outline" style={{ borderColor: "#03c9d7", color: "#03c9d7" }} data-testid="button-export-bank-file">
                <Building2 className="h-4 w-4 mr-2" />ไฟล์โอนเงินธนาคาร
              </Button>
              <Button onClick={() => importFileRef.current?.click()} disabled={importing} variant="outline" style={{ borderColor: "#03c9d7", color: "#03c9d7" }} data-testid="button-import-payroll-excel">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {importing ? "กำลังนำเข้า..." : "นำเข้า Excel"}
              </Button>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportExcel} className="hidden" data-testid="input-import-payroll-file" />
            </div>

            {otCutoffDay > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-cyan-50 border border-cyan-200 rounded-lg text-sm" data-testid="text-ot-cutoff-info">
                <span className="font-medium text-cyan-700">รอบ OT:</span>
                <span className="text-cyan-600">
                  วันที่ {otCutoffDay + 1}/{Number(month) === 1 ? 12 : Number(month) - 1} - {otCutoffDay}/{month}
                  {" "}(ตัดรอบวันที่ {otCutoffDay} ของเดือน)
                </span>
              </div>
            )}

            <Card className="shadow-sm border-none">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-lg" data-testid="text-calc-table-title">
                    รายการคำนวณเงินเดือน - {MONTHS.find(m => m.value === month)?.label} {year}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" style={{ borderColor: "#05b187", color: "#05b187" }} onClick={() => openBatch("earning")} data-testid="button-batch-earning">
                      <Plus className="h-4 w-4 mr-1" />เงินเพิ่ม
                    </Button>
                    <Button variant="outline" size="sm" style={{ borderColor: "#f94d4d", color: "#f94d4d" }} onClick={() => openBatch("deduction")} data-testid="button-batch-deduction">
                      <Plus className="h-4 w-4 mr-1" />เงินหัก
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {displayRecords.some((r: any) => r.otNoAttendanceCount > 0) && (
                  <div className="mx-4 mt-3 mb-1 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-800">
                      <span className="font-semibold">OT ไม่นับเนื่องจากไม่มีลงเวลา:</span>{" "}
                      {displayRecords.filter((r: any) => r.otNoAttendanceCount > 0).map((r: any) => (
                        <span key={r.employeeId} className="inline-block mr-2">
                          {r.employee?.fullName} ({r.otNoAttendanceCount} รายการ, {Number(r.otSkippedHours || 0).toFixed(1)} ชม.)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs font-bold">ลำดับ</TableHead>
                      <TableHead className="text-xs font-bold">พนักงาน</TableHead>
                      <TableHead className="text-xs font-bold text-right">เงินเดือน</TableHead>
                      <TableHead className="text-xs font-bold text-right">OT</TableHead>
                      {dynamicColumns.earnings.map(label => (
                        <TableHead key={`eh-${label}`} className="text-xs font-bold text-right" style={{ color: "#05b187" }}>{label}</TableHead>
                      ))}
                      <TableHead className="text-xs font-bold text-right">รายได้รวม</TableHead>
                      <TableHead className="text-xs font-bold text-right">ประกันสังคม</TableHead>
                      <TableHead className="text-xs font-bold text-right">ภาษีหัก ณ ที่จ่าย</TableHead>
                      {dynamicColumns.deductions.map(label => (
                        <TableHead key={`dh-${label}`} className="text-xs font-bold text-right" style={{ color: "#f94d4d" }}>{label}</TableHead>
                      ))}
                      <TableHead className="text-xs font-bold text-right">สุทธิ</TableHead>
                      <TableHead className="text-xs font-bold text-center">สถานะ</TableHead>
                      <TableHead className="text-xs font-bold text-center">จัดการ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRecords.length > 0 && (
                      <TableRow className="bg-amber-50/60 border-b-2 border-amber-200" data-testid="row-payroll-summary">
                        <TableCell className="text-xs font-bold" colSpan={2}>รวม ({displayRecords.length} คน)</TableCell>
                        <TableCell className="text-xs text-right font-bold">฿{fmt(displayRecords.reduce((s: number, r: any) => s + Number(r.baseSalary || 0), 0))}</TableCell>
                        <TableCell className="text-xs text-right font-bold" style={{ color: "#03c9d7" }}>฿{fmt(displayRecords.reduce((s: number, r: any) => s + Number(r.otAmount || 0), 0))}</TableCell>
                        {dynamicColumns.earnings.map(label => {
                          const total = displayRecords.reduce((s: number, r: any) => {
                            const item = (r.extraEarnings || []).find((i: any) => i.label === label);
                            return s + (item ? Number(item.amount) : 0);
                          }, 0);
                          return <TableCell key={`se-${label}`} className="text-xs text-right font-bold" style={{ color: "#05b187" }}>{total > 0 ? `฿${fmt(total)}` : "-"}</TableCell>;
                        })}
                        <TableCell className="text-xs text-right font-bold" style={{ color: "#05b187" }}>฿{fmt(displayRecords.reduce((s: number, r: any) => s + Number(r.totalEarnings || 0), 0))}</TableCell>
                        <TableCell className="text-xs text-right font-bold">฿{fmt(displayRecords.reduce((s: number, r: any) => s + Number(r.ssoExempt ? 0 : r.socialSecurity || 0), 0))}</TableCell>
                        <TableCell className="text-xs text-right font-bold">฿{fmt(displayRecords.reduce((s: number, r: any) => s + Number(r.withholdingTax || 0), 0))}</TableCell>
                        {dynamicColumns.deductions.map(label => {
                          const total = displayRecords.reduce((s: number, r: any) => {
                            const item = (r.extraDeductions || []).find((i: any) => i.label === label);
                            return s + (item ? Number(item.amount) : 0);
                          }, 0);
                          return <TableCell key={`sd-${label}`} className="text-xs text-right font-bold" style={{ color: "#f94d4d" }}>{total > 0 ? `฿${fmt(total)}` : "-"}</TableCell>;
                        })}
                        <TableCell className="text-xs text-right font-bold" style={{ color: "var(--theme-primary)" }}>฿{fmt(displayRecords.reduce((s: number, r: any) => s + Number(r.netPay || 0), 0))}</TableCell>
                        <TableCell></TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                    {displayRecords.length > 0 ? displayRecords.map((row: any, idx: number) => {
                      const isEditing = (field: string) => inlineEdit?.rowId === row.id && inlineEdit?.field === field;
                      const editableCell = (field: string, value: number, color?: string) => (
                        <TableCell
                          className="text-sm text-right cursor-pointer hover:bg-blue-50 transition-colors px-1"
                          style={color ? { color } : {}}
                          data-testid={`text-${field}-${row.employeeId}`}
                          onClick={() => row.id && startInlineEdit(row.id, field, value)}
                        >
                          {isEditing(field) ? (
                            <Input
                              type="number"
                              className="h-7 w-24 text-right text-sm ml-auto"
                              value={inlineValue}
                              onChange={e => setInlineValue(e.target.value)}
                              onBlur={() => commitInlineEdit(row)}
                              onKeyDown={e => { if (e.key === "Enter") commitInlineEdit(row); if (e.key === "Escape") setInlineEdit(null); }}
                              autoFocus
                              data-testid={`input-inline-${field}-${row.employeeId}`}
                            />
                          ) : (
                            <span className="border-b border-dashed border-transparent hover:border-gray-400">฿{fmt(value)}</span>
                          )}
                        </TableCell>
                      );
                      return (
                      <TableRow key={row.employeeId || idx} data-testid={`row-payroll-${row.employeeId}`}>
                        <TableCell className="text-sm">{idx + 1}</TableCell>
                        <TableCell className="text-sm">
                          <div className="font-medium" data-testid={`text-emp-name-${row.employeeId}`}>{row.employee?.fullName || "-"}</div>
                          <div className="text-[10px] text-muted-foreground">{row.employee?.employeeCode || "-"}</div>
                        </TableCell>
                        {editableCell("baseSalary", row.baseSalary)}
                        <TableCell
                          className="text-sm text-right cursor-pointer hover:bg-blue-50 transition-colors px-1"
                          style={{ color: "#03c9d7" }}
                          data-testid={`text-otAmount-${row.employeeId}`}
                          onClick={() => row.id && startInlineEdit(row.id, "otAmount", row.otAmount || 0)}
                        >
                          {inlineEdit?.rowId === row.id && inlineEdit?.field === "otAmount" ? (
                            <Input
                              type="number"
                              className="h-7 w-24 text-right text-sm ml-auto"
                              value={inlineValue}
                              onChange={e => setInlineValue(e.target.value)}
                              onBlur={() => commitInlineEdit(row)}
                              onKeyDown={e => { if (e.key === "Enter") commitInlineEdit(row); if (e.key === "Escape") setInlineEdit(null); }}
                              autoFocus
                              data-testid={`input-inline-otAmount-${row.employeeId}`}
                            />
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <span className="border-b border-dashed border-transparent hover:border-gray-400">฿{fmt(row.otAmount || 0)}</span>
                              {row.otNoAttendanceCount > 0 && (
                                <span title={`OT ${row.otNoAttendanceCount} รายการ (${Number(row.otSkippedHours || 0).toFixed(1)} ชม. / ฿${fmt(row.otSkippedAmount || 0)}) ไม่นับ เนื่องจากไม่มีลงเวลา`}>
                                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        {dynamicColumns.earnings.map(label => {
                          const item = (row.extraEarnings || []).find((i: any) => i.label === label);
                          return <TableCell key={`e-${label}`} className="text-sm text-right" style={{ color: "#05b187" }}>{item ? `฿${fmt(item.amount)}` : "-"}</TableCell>;
                        })}
                        <TableCell className="text-sm text-right font-medium" style={{ color: "#05b187" }} data-testid={`text-earnings-${row.employeeId}`}>฿{fmt(row.totalEarnings)}</TableCell>
                        <TableCell
                          className="text-sm text-right cursor-pointer hover:bg-blue-50 transition-colors"
                          data-testid={`text-ss-${row.employeeId}`}
                          onClick={() => row.id && recalcAndSaveRow(row, { ssoExempt: !row.ssoExempt })}
                        >
                          {row.ssoExempt ? <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px] cursor-pointer">ยกเว้น</Badge> : <span className="border-b border-dashed border-transparent hover:border-gray-400">฿{fmt(row.socialSecurity)}</span>}
                        </TableCell>
                        <TableCell
                          className="text-sm text-right cursor-pointer hover:bg-blue-50 transition-colors"
                          data-testid={`text-tax-${row.employeeId}`}
                          onClick={() => row.id && startInlineEdit(row.id, "withholdingTax", row.withholdingTax)}
                        >
                          {inlineEdit && inlineEdit.rowId === row.id && inlineEdit.field === "withholdingTax" ? (
                            <Input
                              type="number"
                              className="w-24 h-7 text-xs text-right ml-auto"
                              autoFocus
                              value={inlineValue}
                              onChange={e => setInlineValue(e.target.value)}
                              onBlur={() => {
                                const val = Number(inlineValue) || 0;
                                if (val !== Number(row.withholdingTax || 0)) {
                                  const extraDeductionsTotal = (row.extraDeductions || []).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
                                  const totalDeductions = Number(row.socialSecurity || 0) + val + extraDeductionsTotal;
                                  const netPay = Number(row.totalEarnings || 0) - totalDeductions;
                                  patchPayrollMutation.mutate({ id: row.id, data: { withholdingTax: val, totalDeductions, netPay } });
                                }
                                setInlineEdit(null);
                              }}
                              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setInlineEdit(null); }}
                            />
                          ) : (
                            <span className="border-b border-dashed border-transparent hover:border-gray-400">฿{fmt(row.withholdingTax)}</span>
                          )}
                        </TableCell>
                        {dynamicColumns.deductions.map(label => {
                          const item = (row.extraDeductions || []).find((i: any) => i.label === label);
                          return <TableCell key={`d-${label}`} className="text-sm text-right" style={{ color: "#f94d4d" }}>{item ? `฿${fmt(item.amount)}` : "-"}</TableCell>;
                        })}
                        <TableCell className="text-sm text-right font-bold" style={{ color: "var(--theme-primary)" }} data-testid={`text-net-${row.employeeId}`}>฿{fmt(row.netPay)}</TableCell>
                        <TableCell className="text-center">{statusBadge(row.status || "draft")}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)} data-testid={`button-calc-edit-${row.employeeId}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                if (confirm(`ยืนยันลบรายการเงินเดือนของ ${row.employee?.fullName || "พนักงาน"} หรือไม่?`)) {
                                  handleDeletePayrollRecord(row);
                                }
                              }}
                              disabled={row.status === "posted" || deletePayrollMutation.isPending}
                              title={row.status === "posted" ? "ไม่สามารถลบรายการที่ลงบัญชีแล้ว" : "ลบรายการเงินเดือน"}
                              data-testid={`button-calc-delete-${row.employeeId}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    }) : (
                      <TableRow>
                        <TableCell colSpan={8 + dynamicColumns.earnings.length + dynamicColumns.deductions.length} className="text-center py-8 text-muted-foreground">
                          กดปุ่ม "คำนวณเงินเดือน" เพื่อเริ่มคำนวณ
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payslip" className="space-y-4">
            <Card className="shadow-sm border-none">
              <CardHeader>
                <CardTitle className="text-lg" data-testid="text-payslip-table-title">
                  สลิปเงินเดือน - {MONTHS.find(m => m.value === month)?.label} {year}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs font-bold">พนักงาน</TableHead>
                        <TableHead className="text-xs font-bold text-right">เงินเดือน</TableHead>
                        <TableHead className="text-xs font-bold text-right">OT</TableHead>
                        {dynamicColumns.earnings.map(label => (
                          <TableHead key={`peh-${label}`} className="text-xs font-bold text-right" style={{ color: "#05b187" }}>{label}</TableHead>
                        ))}
                        <TableHead className="text-xs font-bold text-right">ประกันสังคม</TableHead>
                        <TableHead className="text-xs font-bold text-right">ภาษี</TableHead>
                        {dynamicColumns.deductions.map(label => (
                          <TableHead key={`pdh-${label}`} className="text-xs font-bold text-right" style={{ color: "#f94d4d" }}>{label}</TableHead>
                        ))}
                        <TableHead className="text-xs font-bold text-right">สุทธิ</TableHead>
                        <TableHead className="text-xs font-bold text-center">จัดการ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payslipData.length > 0 ? payslipData.map((row: any, idx: number) => {
                        const hasAdj = (row.extraEarnings || []).length > 0 || (row.extraDeductions || []).length > 0;
                        return (
                          <TableRow key={row.employeeId || idx} className={hasAdj ? "bg-amber-50" : ""} data-testid={`row-payslip-${row.employeeId}`}>
                            <TableCell className="text-sm">
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="font-medium" data-testid={`text-payslip-name-${row.employeeId}`}>{row.employee?.fullName || "-"}</div>
                                  <div className="text-[10px] text-muted-foreground">{row.employee?.employeeCode || "-"}</div>
                                </div>
                                {hasAdj && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[9px]">ปรับปรุง</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-right">฿{fmt(row.baseSalary)}</TableCell>
                            <TableCell className="text-sm text-right" style={{ color: "#03c9d7" }}>฿{fmt(row.otAmount || 0)}</TableCell>
                            {dynamicColumns.earnings.map(label => {
                              const item = (row.extraEarnings || []).find((i: any) => i.label === label);
                              return <TableCell key={`pe-${label}`} className="text-sm text-right" style={{ color: "#05b187" }}>{item ? `฿${fmt(item.amount)}` : "-"}</TableCell>;
                            })}
                            <TableCell className="text-sm text-right text-muted-foreground">฿{fmt(row.socialSecurity)}</TableCell>
                            <TableCell className="text-sm text-right text-muted-foreground">฿{fmt(row.withholdingTax)}</TableCell>
                            {dynamicColumns.deductions.map(label => {
                              const item = (row.extraDeductions || []).find((i: any) => i.label === label);
                              return <TableCell key={`pd-${label}`} className="text-sm text-right" style={{ color: "#f94d4d" }}>{item ? `฿${fmt(item.amount)}` : "-"}</TableCell>;
                            })}
                            <TableCell className="text-sm text-right font-bold" style={{ color: "var(--theme-primary)" }}>฿{fmt(row.netPay)}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)} data-testid={`button-edit-${row.employeeId}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handlePrintPayslip(row)} data-testid={`button-preview-${row.employeeId}`}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendLine(row)} disabled={sendingLine === row.employeeId} data-testid={`button-line-${row.employeeId}`}>
                                  {sendingLine === row.employeeId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSendEmail(row)} disabled={sendingEmail === row.employeeId} data-testid={`button-email-${row.employeeId}`}>
                                  {sendingEmail === row.employeeId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow>
                          <TableCell colSpan={7 + dynamicColumns.earnings.length + dynamicColumns.deductions.length} className="text-center py-8 text-muted-foreground">
                            กรุณาคำนวณเงินเดือนก่อนเพื่อดูสลิป
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-none">
              <CardContent className="p-6">
                <h3 className="font-bold text-sm mb-4" style={{ color: "var(--theme-primary)" }}>สถานะการจัดการ</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${currentStatus ? "bg-green-100" : "bg-gray-100"}`}>
                      <Save className={`h-4 w-4 ${currentStatus ? "text-green-600" : "text-gray-400"}`} />
                    </div>
                    <span className="text-sm">บันทึก</span>
                  </div>
                  <div className="h-px w-8 bg-gray-300" />
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${currentStatus === "approved" || currentStatus === "posted" ? "bg-green-100" : "bg-gray-100"}`}>
                      <CheckCircle className={`h-4 w-4 ${currentStatus === "approved" || currentStatus === "posted" ? "text-green-600" : "text-gray-400"}`} />
                    </div>
                    <span className="text-sm">อนุมัติ</span>
                  </div>
                  <div className="h-px w-8 bg-gray-300" />
                  <div className="flex items-center gap-2">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${currentStatus === "posted" ? "bg-green-100" : "bg-gray-100"}`}>
                      <BookOpen className={`h-4 w-4 ${currentStatus === "posted" ? "text-green-600" : "text-gray-400"}`} />
                    </div>
                    <span className="text-sm">ลงบัญชี</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pnd1">
            <Card className="shadow-sm border-none">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Button onClick={handlePrintPnd1} variant="outline" data-testid="button-print-pnd1">
                    <Printer className="h-4 w-4 mr-2" />พิมพ์ใบแนบ ภงด.1
                  </Button>
                  <Button onClick={() => handleDownloadRDPrepPnd1("xlsx")} variant="outline" style={{ borderColor: "var(--theme-primary)", color: "var(--theme-primary)" }} data-testid="button-download-rdprep-excel">
                    <Download className="h-4 w-4 mr-2" />Excel (.xlsx)
                  </Button>
                  <Button onClick={() => handleDownloadRDPrepPnd1("csv")} variant="outline" style={{ borderColor: "#05b187", color: "#05b187" }} data-testid="button-download-rdprep-csv">
                    <Download className="h-4 w-4 mr-2" />CSV (RD Prep)
                  </Button>
                </div>
                <div ref={pnd1PrintRef}>
                  <div style={{ fontFamily: "'Sarabun', sans-serif", fontSize: "11px", lineHeight: 1.4, background: "white", color: "black", padding: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                      <div>
                        <span style={{ fontSize: "16px", fontWeight: "bold" }}>ใบแนบ</span>
                        <span style={{ fontSize: "18px", fontWeight: "bold", color: "#03c9d7", marginLeft: "12px" }}>ภ.ง.ด.1</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
                        <span>เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย)</span>
                        <TaxIdBoxes taxId={company?.taxId || ""} />
                      </div>
                    </div>

                    <div style={{ fontSize: "10px", marginBottom: "6px", border: "1px solid #999", padding: "6px 8px" }}>
                      <div style={{ marginBottom: "4px" }}>(ให้แยกกรอกรายการในใบแนบนี้ตามเงินได้แต่ละประเภท โดยใส่เครื่องหมาย "✓" ลงใน "☐" หน้าข้อความแล้วแต่กรณี เพียงข้อเดียว)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                        <span>ประเภทเงินได้ <CB checked={true} /> (1) เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีทั่วไป</span>
                        <span><CB checked={false} /> (3) เงินได้ตามมาตรา 40 (1)(2) กรณีนายจ้างจ่ายให้ครั้งเดียวเพราะเหตุออกจากงาน</span>
                        <span><CB checked={false} /> (2) เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีได้รับอนุมัติจากกรมสรรพากรให้หักอัตราร้อยละ 3</span>
                        <span><CB checked={false} /> (4) เงินได้ตามมาตรา 40 (2) กรณีผู้รับเงินได้เป็นผู้อยู่ในประเทศไทย</span>
                        <span></span>
                        <span><CB checked={false} /> (5) เงินได้ตามมาตรา 40 (2) กรณีผู้รับเงินได้มิได้เป็นผู้อยู่ในประเทศไทย</span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", fontSize: "10px", marginBottom: "4px" }}>
                      แผ่นที่ <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "30px", textAlign: "center" }}>1</span> ในจำนวน <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "30px", textAlign: "center" }}>{Math.max(1, Math.ceil(savedRecords.length / 8))}</span> แผ่น
                    </div>

                    {savedRecords.length > 0 ? (
                      <>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                          <thead>
                            <tr>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", width: "35px", background: "#f8f9fa", verticalAlign: "middle" }}>ลำดับ<br/>ที่</th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", width: "140px", background: "#f8f9fa", verticalAlign: "middle" }}>เลขประจำตัวผู้เสียภาษีอากร<br/><span style={{ fontSize: "9px" }}>(ของผู้มีเงินได้)</span></th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", background: "#f8f9fa", verticalAlign: "middle" }}>ชื่อผู้มีเงินได้<br/><span style={{ fontSize: "9px" }}>(ให้ระบุชัดเจนว่าเป็น นาย นาง นางสาว หรือยศ)</span></th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", background: "#f8f9fa", width: "80px" }}>วัน เดือน ปี<br/>ที่จ่าย</th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", background: "#f8f9fa", width: "100px" }}>จำนวนเงินได้<br/>ที่จ่าย</th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", background: "#f8f9fa", width: "100px" }}>จำนวนเงินภาษี<br/>ที่หักและนำส่ง</th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", width: "45px", background: "#f8f9fa", verticalAlign: "middle" }}>เงื่อนไข<br/>*</th>
                            </tr>
                          </thead>
                          <tbody>
                            {savedRecords.map((r: any, i: number) => {
                              const emp = employees.find((e: any) => e.id === r.employeeId);
                              return (
                                <tr key={r.id || i} data-testid={`row-pnd1-${r.employeeId}`}>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "center" }}>{i + 1}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "center", fontSize: "10px" }} data-testid={`text-pnd1-taxid-${r.employeeId}`}>{emp?.taxId || emp?.idCardNumber || "-"}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px" }} data-testid={`text-pnd1-name-${r.employeeId}`}>{emp?.fullName || "-"}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "center", fontSize: "10px" }}>{monthLabel} {yearBE}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "right" }} data-testid={`text-pnd1-income-${r.employeeId}`}>{fmt(Number(r.totalEarnings))}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "right" }} data-testid={`text-pnd1-tax-${r.employeeId}`}>{fmt(Number(r.withholdingTax))}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "center" }}>1</td>
                                </tr>
                              );
                            })}
                            <tr style={{ fontWeight: "bold", background: "#f8f9fa" }}>
                              <td colSpan={4} style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right", fontSize: "10px" }}>
                                รวมยอดเงินได้และภาษีที่นำส่ง ({savedRecords.length} ราย)
                              </td>
                              <td style={{ border: "1px solid #333", padding: "6px 4px", textAlign: "right" }} data-testid="text-pnd1-total-income">{fmt(pnd1TotalEarnings)}</td>
                              <td style={{ border: "1px solid #333", padding: "6px 4px", textAlign: "right" }} data-testid="text-pnd1-total-tax">{fmt(pnd1TotalTax)}</td>
                              <td style={{ border: "1px solid #333", padding: "0" }}></td>
                            </tr>
                          </tbody>
                        </table>

                        <div style={{ fontSize: "9px", marginTop: "4px", marginBottom: "8px" }}>
                          (ให้กรอกลำดับที่ต่อเนื่องกันไปทุกแผ่นตามเงินได้แต่ละประเภท)
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: "10px", marginTop: "8px" }}>
                          <div>
                            <div>หมายเหตุ * เงื่อนไขการหักภาษีให้กรอกดังนี้</div>
                            <div style={{ paddingLeft: "16px" }}>หัก ณ ที่จ่าย กรอก 1</div>
                            <div style={{ paddingLeft: "16px" }}>ออกให้ตลอดไป กรอก 2</div>
                            <div style={{ paddingLeft: "16px" }}>ออกให้ครั้งเดียว กรอก 3</div>
                          </div>
                          <div style={{ textAlign: "center", fontSize: "11px", width: "50%" }}>
                            <div>ลงชื่อ <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "140px" }}></span> ผู้จ่ายเงิน</div>
                            <div style={{ marginTop: "4px" }}>(<span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "140px" }}>{company?.name || ""}</span>)</div>
                            <div style={{ marginTop: "4px" }}>ตำแหน่ง <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "120px" }}></span></div>
                            <div style={{ marginTop: "4px" }}>ยื่นวันที่ <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "30px" }}></span> เดือน <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "60px" }}></span> พ.ศ. <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "40px" }}></span></div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p style={{ textAlign: "center", padding: "48px 0", color: "#999" }}>ยังไม่มีข้อมูลเงินเดือนสำหรับเดือนนี้ กรุณาคำนวณและบันทึกข้อมูลเงินเดือนก่อน</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="attachment">
            <Card className="shadow-sm border-none">
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-lg" data-testid="text-sso-title">
                    รายงานประกันสังคม - {monthLabel} {yearBE}
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-lime-500 text-white hover:bg-lime-600 border-none"
                    data-testid="button-export-sso-excel"
                    onClick={() => {
                      const ssoRecords = savedRecords.filter((r: any) => !r.ssoExempt && Number(r.socialSecurity || 0) > 0);
                      const rows = ssoRecords.map((r: any) => {
                        const emp = employees.find((e: any) => e.id === r.employeeId);
                        return {
                          "เลขบัตรประชาชน": emp?.idCardNumber || "-",
                          "คำนำหน้า": emp?.titlePrefix || "-",
                          "ชื่อ": emp?.firstName || emp?.fullName?.split(" ")[0] || "-",
                          "สกุล": emp?.lastName || emp?.fullName?.split(" ").slice(1).join(" ") || "-",
                          "ค่าจ้าง": Number(r.baseSalary || 0),
                          "เงินสมทบ": Number(r.socialSecurity || 0),
                        };
                      });
                      const ws = XLSX.utils.json_to_sheet(rows);
                      ws["!cols"] = [{ wch: 18 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 14 }, { wch: 12 }];
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "000000");
                      XLSX.writeFile(wb, `ประกันสังคม_${monthLabel}_${yearBE}.xlsx`);
                    }}
                    disabled={savedRecords.filter((r: any) => !r.ssoExempt && Number(r.socialSecurity || 0) > 0).length === 0}
                  >
                    <FileSpreadsheet className="h-4 w-4 mr-1" />ส่งออก Excel
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {(() => {
                  const ssoRecords = savedRecords.filter((r: any) => !r.ssoExempt && Number(r.socialSecurity || 0) > 0);
                  return ssoRecords.length > 0 ? (
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs font-bold">เลขบัตรประชาชน</TableHead>
                        <TableHead className="text-xs font-bold">คำนำหน้า</TableHead>
                        <TableHead className="text-xs font-bold">ชื่อ</TableHead>
                        <TableHead className="text-xs font-bold">สกุล</TableHead>
                        <TableHead className="text-xs font-bold text-right">ค่าจ้าง</TableHead>
                        <TableHead className="text-xs font-bold text-right">เงินสมทบ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ssoRecords.map((r: any, i: number) => {
                        const emp = employees.find((e: any) => e.id === r.employeeId);
                        return (
                          <TableRow key={r.id || i} data-testid={`row-sso-${r.employeeId}`}>
                            <TableCell className="text-sm" data-testid={`text-sso-idcard-${r.employeeId}`}>{emp?.idCardNumber || "-"}</TableCell>
                            <TableCell className="text-sm" data-testid={`text-sso-prefix-${r.employeeId}`}>{emp?.titlePrefix || "-"}</TableCell>
                            <TableCell className="text-sm" data-testid={`text-sso-fname-${r.employeeId}`}>{emp?.firstName || emp?.fullName?.split(" ")[0] || "-"}</TableCell>
                            <TableCell className="text-sm" data-testid={`text-sso-lname-${r.employeeId}`}>{emp?.lastName || emp?.fullName?.split(" ").slice(1).join(" ") || "-"}</TableCell>
                            <TableCell className="text-sm text-right" data-testid={`text-sso-wage-${r.employeeId}`}>{fmt(Number(r.baseSalary || 0))}</TableCell>
                            <TableCell className="text-sm text-right" data-testid={`text-sso-contrib-${r.employeeId}`}>{fmt(Number(r.socialSecurity || 0))}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="bg-slate-100 font-bold">
                        <TableCell colSpan={4} className="text-sm">รวม ({ssoRecords.length} ราย)</TableCell>
                        <TableCell className="text-sm text-right" style={{ color: "#05b187" }} data-testid="text-sso-total-wage">{fmt(ssoRecords.reduce((s: number, r: any) => s + Number(r.baseSalary || 0), 0))}</TableCell>
                        <TableCell className="text-sm text-right" style={{ color: "#03c9d7" }} data-testid="text-sso-total-contrib">{fmt(ssoRecords.reduce((s: number, r: any) => s + Number(r.socialSecurity || 0), 0))}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center py-12 text-muted-foreground">กรุณาคำนวณเงินเดือนก่อนเพื่อดูรายงานประกันสังคม</p>
                );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pnd1a">
            <Card className="shadow-sm border-none">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Button onClick={handlePrintPnd1a} variant="outline" data-testid="button-print-pnd1a">
                    <Printer className="h-4 w-4 mr-2" />พิมพ์ใบแนบ ภงด.1ก
                  </Button>
                  <Button onClick={() => handleDownloadRDPrepPnd1a("xlsx")} variant="outline" style={{ borderColor: "var(--theme-primary)", color: "var(--theme-primary)" }} data-testid="button-download-rdprep-pnd1a-excel">
                    <Download className="h-4 w-4 mr-2" />Excel (.xlsx)
                  </Button>
                  <Button onClick={() => handleDownloadRDPrepPnd1a("csv")} variant="outline" style={{ borderColor: "#05b187", color: "#05b187" }} data-testid="button-download-rdprep-pnd1a-csv">
                    <Download className="h-4 w-4 mr-2" />CSV (RD Prep)
                  </Button>
                </div>
                <div ref={pnd1aPrintRef}>
                  <div style={{ fontFamily: "'Sarabun', sans-serif", fontSize: "11px", lineHeight: 1.4, background: "white", color: "black", padding: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "6px" }}>
                      <div>
                        <span style={{ fontSize: "16px", fontWeight: "bold" }}>ใบแนบ</span>
                        <span style={{ fontSize: "18px", fontWeight: "bold", color: "#03c9d7", marginLeft: "12px" }}>ภ.ง.ด.1ก</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px" }}>
                        <span>เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย)</span>
                        <TaxIdBoxes taxId={company?.taxId || ""} />
                      </div>
                    </div>

                    <div style={{ fontSize: "10px", marginBottom: "6px", border: "1px solid #999", padding: "6px 8px" }}>
                      <div style={{ marginBottom: "4px" }}>(ให้แยกกรอกรายการในใบแนบนี้ตามเงินได้แต่ละประเภท โดยใส่เครื่องหมาย "✓" ลงใน "☐" หน้าข้อความแล้วแต่กรณี เพียงข้อเดียว)</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                        <span>ประเภทเงินได้ <CB checked={true} /> (1) เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีทั่วไป</span>
                        <span><CB checked={false} /> (3) เงินได้ตามมาตรา 40 (1)(2) กรณีนายจ้างจ่ายให้ครั้งเดียวเพราะเหตุออกจากงาน</span>
                        <span><CB checked={false} /> (2) เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีได้รับอนุมัติจากกรมสรรพากรให้หักอัตราร้อยละ 3</span>
                        <span><CB checked={false} /> (4) เงินได้ตามมาตรา 40 (2) กรณีผู้รับเงินได้เป็นผู้อยู่ในประเทศไทย</span>
                        <span></span>
                        <span><CB checked={false} /> (5) เงินได้ตามมาตรา 40 (2) กรณีผู้รับเงินได้มิได้เป็นผู้อยู่ในประเทศไทย</span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right", fontSize: "10px", marginBottom: "4px" }}>
                      แผ่นที่ <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "30px", textAlign: "center" }}>1</span> ในจำนวน <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "30px", textAlign: "center" }}>{Math.max(1, Math.ceil(annualSummary.length / 7))}</span> แผ่น
                    </div>

                    {annualSummary.length > 0 ? (
                      <>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                          <thead>
                            <tr>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", width: "35px", background: "#f8f9fa", verticalAlign: "middle" }}>ลำดับ<br/>ที่</th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", width: "130px", background: "#f8f9fa", verticalAlign: "middle" }}>เลขประจำตัวผู้เสียภาษีอากร<br/><span style={{ fontSize: "9px" }}>(ของผู้มีเงินได้)</span></th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", background: "#f8f9fa", verticalAlign: "middle" }}>ชื่อผู้มีเงินได้<br/><span style={{ fontSize: "9px" }}>(ให้ระบุให้ชัดเจนว่าเป็น นาย นาง นางสาว หรือยศ)</span><br/><span style={{ fontSize: "9px" }}>ที่อยู่ของผู้มีเงินได้</span></th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", width: "100px", background: "#f8f9fa", verticalAlign: "middle" }}>จำนวนเงินได้<br/>ที่จ่ายทั้งปี</th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", width: "100px", background: "#f8f9fa", verticalAlign: "middle" }}>จำนวนเงินภาษี<br/>ที่หักและนำส่งทั้งปี</th>
                              <th style={{ border: "1px solid #333", padding: "4px", fontWeight: "bold", textAlign: "center", width: "45px", background: "#f8f9fa", verticalAlign: "middle" }}>เงื่อนไข<br/>*</th>
                            </tr>
                          </thead>
                          <tbody>
                            {annualSummary.map((r, i) => {
                              const emp = employees.find((e: any) => e.id === r.employeeId);
                              return (
                                <tr key={r.employeeId} data-testid={`row-pnd1a-${r.employeeId}`}>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "center", verticalAlign: "top" }}>{i + 1}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "center", verticalAlign: "top", fontSize: "10px" }} data-testid={`text-pnd1a-taxid-${r.employeeId}`}>{emp?.taxId || emp?.idCardNumber || "-"}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px", verticalAlign: "top" }} data-testid={`text-pnd1a-name-${r.employeeId}`}>
                                    <div>{emp?.fullName || "-"}</div>
                                    <div style={{ fontSize: "9px", color: "#666" }}>{emp?.address || ""}</div>
                                  </td>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "right", verticalAlign: "top" }} data-testid={`text-pnd1a-income-${r.employeeId}`}>{fmt(r.totalEarnings)}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "right", verticalAlign: "top" }} data-testid={`text-pnd1a-tax-${r.employeeId}`}>{fmt(r.totalTax)}</td>
                                  <td style={{ border: "1px solid #333", padding: "4px", textAlign: "center", verticalAlign: "top" }}>1</td>
                                </tr>
                              );
                            })}
                            <tr style={{ fontWeight: "bold", background: "#f8f9fa" }}>
                              <td colSpan={3} style={{ border: "1px solid #333", padding: "6px 8px", textAlign: "right", fontSize: "10px" }}>
                                รวมยอดเงินได้และภาษีที่นำส่ง ({annualSummary.length} ราย)
                              </td>
                              <td style={{ border: "1px solid #333", padding: "6px 4px", textAlign: "right" }} data-testid="text-pnd1a-total-income">{fmt(grandTotalEarnings)}</td>
                              <td style={{ border: "1px solid #333", padding: "6px 4px", textAlign: "right" }} data-testid="text-pnd1a-total-tax">{fmt(grandTotalTax)}</td>
                              <td style={{ border: "1px solid #333", padding: "0" }}></td>
                            </tr>
                          </tbody>
                        </table>

                        <div style={{ fontSize: "9px", marginTop: "4px", marginBottom: "8px" }}>
                          (ให้กรอกลำดับที่ต่อเนื่องกันไปทุกแผ่นตามเงินได้แต่ละประเภท)
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: "10px", marginTop: "8px" }}>
                          <div>
                            <div>หมายเหตุ * เงื่อนไขการหักภาษีให้กรอกดังนี้</div>
                            <div style={{ paddingLeft: "16px" }}>หัก ณ ที่จ่าย กรอก 1</div>
                            <div style={{ paddingLeft: "16px" }}>ออกให้ตลอดไป กรอก 2</div>
                            <div style={{ paddingLeft: "16px" }}>ออกให้ครั้งเดียว กรอก 3</div>
                          </div>
                          <div style={{ textAlign: "center", fontSize: "11px", width: "50%" }}>
                            <div>ลงชื่อ <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "140px" }}></span> ผู้จ่ายเงิน</div>
                            <div style={{ marginTop: "4px" }}>(<span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "140px" }}>{company?.name || ""}</span>)</div>
                            <div style={{ marginTop: "4px" }}>ตำแหน่ง <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "120px" }}></span></div>
                            <div style={{ marginTop: "4px" }}>ยื่นวันที่ <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "30px" }}></span> เดือน <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "60px" }}></span> พ.ศ. <span style={{ borderBottom: "1px dotted black", display: "inline-block", minWidth: "40px" }}></span></div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p style={{ textAlign: "center", padding: "48px 0", color: "#999" }}>ยังไม่มีข้อมูลเงินเดือนสำหรับปีนี้</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="50tawi">
            <Card className="shadow-sm border-none">
              <CardContent className="p-6 overflow-x-auto">
                <div className="flex items-center gap-2 flex-wrap mb-4">
                  <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                    <SelectTrigger className="w-52" data-testid="select-employee">
                      <SelectValue placeholder="เลือกพนักงาน" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeEmployees.map((emp: any) => (
                        <SelectItem key={emp.id} value={String(emp.id)} data-testid={`option-emp-${emp.id}`}>{emp.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handlePrintSingle50Tawi} variant="outline" disabled={!selectedEmployeeId} data-testid="button-print-50tawi">
                    <Printer className="h-4 w-4 mr-2" />พิมพ์ 50 ทวิ
                  </Button>
                  <Button onClick={handlePrintAll50Tawi} variant="outline" style={{ borderColor: "var(--theme-primary)", color: "var(--theme-primary)" }} data-testid="button-print-all">
                    <Printer className="h-4 w-4 mr-2" />พิมพ์ทั้งหมด
                  </Button>
                </div>

                {selectedEmp && selectedData ? (
                  <div ref={fiftyTawiPrintRef}>
                    <FiftyTawiA4
                      company={company}
                      employee={selectedEmp}
                      annualEarnings={selectedData.totalEarnings}
                      annualTax={selectedData.totalTax}
                      yearBE={yearBE}
                      ssoAmount={selectedData.totalSso}
                    />
                  </div>
                ) : selectedEmployeeId && !selectedData ? (
                  <div ref={fiftyTawiPrintRef}>
                    <p className="text-center py-12 text-muted-foreground">ไม่พบข้อมูลเงินเดือนของพนักงานคนนี้สำหรับปี พ.ศ. {yearBE}</p>
                  </div>
                ) : (
                  <div ref={fiftyTawiPrintRef}>
                    <p className="text-center py-12 text-muted-foreground">กรุณาเลือกพนักงานเพื่อออกหนังสือรับรอง 50 ทวิ</p>
                  </div>
                )}

                {Object.keys(annualByEmployee).length > 0 && (
                  <div className="mt-6 border-t pt-4">
                    <h3 className="font-bold text-sm mb-3" style={{ color: "var(--theme-primary)" }}>สรุปข้อมูลพนักงานทั้งหมด ปี พ.ศ. {yearBE}</h3>
                    <div className="grid gap-2">
                      {Object.entries(annualByEmployee).map(([eid, data]) => {
                        const emp = employees.find((e: any) => e.id === Number(eid));
                        return (
                          <div key={eid} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 text-sm cursor-pointer hover:bg-gray-100" onClick={() => setSelectedEmployeeId(eid)} data-testid={`summary-emp-${eid}`}>
                            <span className="font-medium">{emp?.fullName || "-"}</span>
                            <div className="flex gap-4">
                              <span style={{ color: "#05b187" }}>฿{fmtAlways(data.totalEarnings)}</span>
                              <span style={{ color: "#f94d4d" }}>ภาษี ฿{fmtAlways(data.totalTax)}</span>
                              <span style={{ color: "#03c9d7" }}>ปกส. ฿{fmtAlways(data.totalSso)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>ตัวอย่างสลิปเงินเดือน</DialogTitle>
            </DialogHeader>
            {previewData && (
              <>
                <div ref={payslipPrintRef}>
                  <PayslipPreview
                    data={previewData}
                    companyName={company?.name || ""}
                    companyAddress={company?.address}
                    logoUrl={logoUrl}
                  />
                </div>
                <div className="flex items-center gap-2 mt-4 justify-end">
                  <Button variant="outline" onClick={handlePrintPayslipWindow} data-testid="button-print-payslip">
                    <Printer className="h-4 w-4 mr-2" />พิมพ์
                  </Button>
                  <Button variant="outline" onClick={() => handleSendLine(previewData)} disabled={sendingLine === previewData?.employeeId} data-testid="button-preview-send-line">
                    <MessageCircle className="h-4 w-4 mr-2" />ส่ง LINE
                  </Button>
                  <Button variant="outline" onClick={() => handleSendEmail(previewData)} disabled={sendingEmail === previewData?.employeeId} data-testid="button-preview-send-email">
                    <Mail className="h-4 w-4 mr-2" />ส่ง Email
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>แก้ไขข้อมูลเงินเดือน - {editTarget?.employee?.fullName || ""}</DialogTitle>
            </DialogHeader>
            {editTarget && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">เงินเดือน</p>
                    <p className="font-bold">฿{fmt(editTarget.baseSalary)}</p>
                  </div>
                  <div className="rounded-lg p-3 border">
                    <label className="text-xs text-muted-foreground block mb-1">OT (ค่าล่วงเวลา)</label>
                    <Input type="number" value={editOtAmount} onChange={e => setEditOtAmount(e.target.value)} className="h-8" data-testid="input-edit-ot" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3 border">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-muted-foreground">ประกันสังคม</label>
                      <label className="flex items-center gap-1 text-xs cursor-pointer">
                        <input type="checkbox" checked={editSsoExempt} onChange={e => setEditSsoExempt(e.target.checked)} className="rounded" />
                        ยกเว้น
                      </label>
                    </div>
                    <p className="font-bold text-sm">{editSsoExempt ? "ยกเว้น" : `฿${fmt(calcSocialSecurity(Number(editTarget.baseSalary || 0)))}`}</p>
                  </div>
                  <div className="rounded-lg p-3 border">
                    <label className="text-xs text-muted-foreground block mb-1">ภาษีหัก ณ ที่จ่าย</label>
                    <Input type="number" value={editWithholdingTax} onChange={e => setEditWithholdingTax(e.target.value)} className="h-8" data-testid="input-edit-tax" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm" style={{ color: "#05b187" }}>เงินเพิ่ม</h4>
                    <Button size="sm" variant="ghost" onClick={addExtraEarning} data-testid="button-add-earning">
                      <Plus className="h-3.5 w-3.5 mr-1" />เพิ่ม
                    </Button>
                  </div>
                  {editExtraEarnings.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 mb-2">
                      <Input placeholder="ชื่อรายการ" value={item.label} onChange={(e) => setEditExtraEarnings(prev => prev.map(i => i.id === item.id ? { ...i, label: e.target.value } : i))} className="flex-1" data-testid={`input-earning-label-${item.id}`} />
                      <Input type="number" placeholder="จำนวนเงิน" value={item.amount || ""} onChange={(e) => setEditExtraEarnings(prev => prev.map(i => i.id === item.id ? { ...i, amount: Number(e.target.value) } : i))} className="w-28" data-testid={`input-earning-amount-${item.id}`} />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => removeExtraEarning(item.id)} data-testid={`button-remove-earning-${item.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-bold text-sm" style={{ color: "#f94d4d" }}>เงินหัก</h4>
                    <Button size="sm" variant="ghost" onClick={addExtraDeduction} data-testid="button-add-deduction">
                      <Plus className="h-3.5 w-3.5 mr-1" />เพิ่ม
                    </Button>
                  </div>
                  {editExtraDeductions.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 mb-2">
                      <Input placeholder="ชื่อรายการ" value={item.label} onChange={(e) => setEditExtraDeductions(prev => prev.map(i => i.id === item.id ? { ...i, label: e.target.value } : i))} className="flex-1" data-testid={`input-deduction-label-${item.id}`} />
                      <Input type="number" placeholder="จำนวนเงิน" value={item.amount || ""} onChange={(e) => setEditExtraDeductions(prev => prev.map(i => i.id === item.id ? { ...i, amount: Number(e.target.value) } : i))} className="w-28" data-testid={`input-deduction-amount-${item.id}`} />
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => removeExtraDeduction(item.id)} data-testid={`button-remove-deduction-${item.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 justify-end pt-2 border-t">
                  <Button variant="outline" onClick={handleEditReset} style={{ borderColor: "#f94d4d", color: "#f94d4d" }} data-testid="button-edit-reset">
                    <RotateCcw className="h-4 w-4 mr-2" />รีเซ็ต
                  </Button>
                  <Button onClick={handleEditSave} style={{ background: "var(--theme-primary)" }} className="text-white hover:opacity-90" data-testid="button-edit-save">
                    <Save className="h-4 w-4 mr-2" />บันทึก
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{batchType === "earning" ? "เงินเพิ่มทั้งระบบ" : "เงินหักทั้งระบบ"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">ชื่อรายการ</label>
                <Input placeholder="เช่น โบนัส, ค่าเดินทาง" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} data-testid="input-batch-label" />
              </div>
              <div className="max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">พนักงาน</TableHead>
                      <TableHead className="text-xs text-right">จำนวนเงิน</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payslipData.map((row: any) => (
                      <TableRow key={row.employeeId}>
                        <TableCell className="text-sm">{row.employee?.fullName || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={batchAmounts[row.employeeId] || ""}
                            onChange={(e) => setBatchAmounts(prev => ({ ...prev, [row.employeeId]: e.target.value }))}
                            className="w-28 ml-auto"
                            data-testid={`input-batch-amount-${row.employeeId}`}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleBatchSave} disabled={batchSaving} style={{ background: "var(--theme-primary)" }} className="text-white hover:opacity-90" data-testid="button-batch-save">
                  {batchSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  {batchSaving ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={journalPreviewOpen} onOpenChange={setJournalPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>ลงบัญชี / จ่ายเงินเดือน</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">วันลงบัญชี / วันจ่ายเงิน</label>
                  <ThaiDateInput value={journalDate} onChange={setJournalDate} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-journal-date" />
                  <p className="text-xs text-muted-foreground mt-1">วันที่นี้จะแสดงเป็น "วันที่จ่าย" ในสลิปเงินเดือน</p>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">บัญชีจ่ายเงิน</label>
                  <AccountCombobox
                    accounts={(companyAccounts || []).filter((a: any) => a.code?.startsWith("1") && !a.isHeader)}
                    value={selectedPaymentMethodId}
                    onSelect={acc => setSelectedPaymentMethodId(acc.code)}
                    testId="select-payment-account"
                    placeholder="อัตโนมัติ (เงินสด/ธนาคาร)"
                    topOption={{ value: "auto", label: "อัตโนมัติ" }}
                  />
                </div>
              </div>
              {(() => {
                const employerSS = totalSS;
                const totalSSPayable = totalSS + employerSS;
                const netPay = totalEarnings - totalSS - totalTax;
                const selCode = selectedPaymentMethodId && selectedPaymentMethodId !== "auto" ? selectedPaymentMethodId : "";
                const payAcct = (companyAccounts || []).find((a: any) => a.code === selCode);
                const payCode = selCode || "1021";
                const payName = payAcct ? acctName(payAcct) : "เงินฝากกระแสรายวัน";
                const totalDebit = totalEarnings + employerSS;
                const totalCredit = totalTax + totalSSPayable + netPay;
                return (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">รหัสบัญชี</TableHead>
                          <TableHead className="text-xs">ชื่อบัญชี</TableHead>
                          <TableHead className="text-xs text-right">เดบิต</TableHead>
                          <TableHead className="text-xs text-right">เครดิต</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="text-sm">5211</TableCell>
                          <TableCell className="text-sm">เงินเดือนและค่าแรง</TableCell>
                          <TableCell className="text-sm text-right">฿{fmt(totalEarnings)}</TableCell>
                          <TableCell className="text-sm text-right">-</TableCell>
                        </TableRow>
                        {employerSS > 0 && (
                          <TableRow>
                            <TableCell className="text-sm">5214</TableCell>
                            <TableCell className="text-sm">เงินสมทบประกันสังคม (ส่วนนายจ้าง)</TableCell>
                            <TableCell className="text-sm text-right">฿{fmt(employerSS)}</TableCell>
                            <TableCell className="text-sm text-right">-</TableCell>
                          </TableRow>
                        )}
                        {totalTax > 0 && (
                          <TableRow>
                            <TableCell className="text-sm">2221</TableCell>
                            <TableCell className="text-sm">ภาษีหัก ณ ที่จ่ายค้างจ่าย</TableCell>
                            <TableCell className="text-sm text-right">-</TableCell>
                            <TableCell className="text-sm text-right">฿{fmt(totalTax)}</TableCell>
                          </TableRow>
                        )}
                        {totalSSPayable > 0 && (
                          <TableRow>
                            <TableCell className="text-sm">2202</TableCell>
                            <TableCell className="text-sm">ประกันสังคมค้างจ่าย (ลูกจ้าง+นายจ้าง)</TableCell>
                            <TableCell className="text-sm text-right">-</TableCell>
                            <TableCell className="text-sm text-right">฿{fmt(totalSSPayable)}</TableCell>
                          </TableRow>
                        )}
                        <TableRow>
                          <TableCell className="text-sm">{payCode}</TableCell>
                          <TableCell className="text-sm">{payName}</TableCell>
                          <TableCell className="text-sm text-right">-</TableCell>
                          <TableCell className="text-sm text-right">฿{fmt(netPay)}</TableCell>
                        </TableRow>
                        <TableRow className="bg-gray-50 font-semibold">
                          <TableCell className="text-sm" colSpan={2}>รวม</TableCell>
                          <TableCell className="text-sm text-right">฿{fmt(totalDebit)}</TableCell>
                          <TableCell className="text-sm text-right">฿{fmt(totalCredit)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </>
                );
              })()}
              <div className="flex justify-end">
                <Button onClick={() => { journalMutation.mutate(); setJournalPreviewOpen(false); }} style={{ background: "var(--theme-primary)" }} className="text-white hover:opacity-90" data-testid="button-confirm-journal">
                  <BookOpen className="h-4 w-4 mr-2" />ยืนยันลงบัญชี / จ่ายเงิน
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={bankFileOpen} onOpenChange={setBankFileOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>ส่งออกไฟล์โอนเงินธนาคาร (KBANK)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">ชื่อบริษัท (แสดงใน Header ไฟล์ธนาคาร)</label>
                <Input value={bankFileSettings.companyName} onChange={e => setBankFileSettings(prev => ({ ...prev, companyName: e.target.value }))} placeholder="ชื่อบริษัท" data-testid="input-bank-company-name" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">รหัสบริษัท (3 ตัวอักษร)</label>
                  <Input value={bankFileSettings.companyCode} onChange={e => setBankFileSettings(prev => ({ ...prev, companyCode: e.target.value.toUpperCase().slice(0, 3) }))} placeholder="เช่น PCT" maxLength={3} data-testid="input-bank-company-code" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">เลขบัญชีบริษัท</label>
                  <Input value={bankFileSettings.companyBankAccount} onChange={e => setBankFileSettings(prev => ({ ...prev, companyBankAccount: e.target.value.replace(/[^0-9-]/g, "") }))} placeholder="เลขบัญชี 10 หลัก" data-testid="input-bank-company-account" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">วันที่จ่าย</label>
                  <ThaiDateInput value={bankFileSettings.paymentDate} onChange={(v: string) => setBankFileSettings(prev => ({ ...prev, paymentDate: v }))} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-bank-payment-date" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">วันที่มีผล</label>
                  <ThaiDateInput value={bankFileSettings.effectiveDate} onChange={(v: string) => setBankFileSettings(prev => ({ ...prev, effectiveDate: v }))} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-bank-effective-date" />
                </div>
              </div>
              {(() => {
                const payD = bankFileSettings.paymentDate ? new Date(bankFileSettings.paymentDate) : null;
                const effD = bankFileSettings.effectiveDate ? new Date(bankFileSettings.effectiveDate) : null;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const diffPay = payD ? Math.round((payD.getTime() - today.getTime()) / 86400000) : 0;
                const diffEff = effD ? Math.round((effD.getTime() - today.getTime()) / 86400000) : 0;
                const warn90 = diffPay > 90 || diffEff > 90;
                const warnPast = diffPay < -30 || diffEff < -30;
                return (warn90 || warnPast) ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-700 flex items-start gap-2">
                    <span className="text-orange-500 mt-0.5">⚠️</span>
                    <div>
                      {warn90 && <p>วันที่จ่าย/มีผลเกิน 90 วันจากวันนี้ — ธนาคารอาจปฏิเสธไฟล์ กรุณาตรวจสอบวันที่ให้ถูกต้อง</p>}
                      {warnPast && <p>วันที่จ่าย/มีผลเป็นวันที่ผ่านมาแล้วมากกว่า 30 วัน — กรุณาตรวจสอบวันที่</p>}
                    </div>
                  </div>
                ) : null;
              })()}
              {(() => {
                const data = displayRecords.length > 0 ? displayRecords : savedRecords.map((r: any) => ({ ...r, employee: employees.find((e: any) => e.id === r.employeeId) }));
                const valid = data.filter((r: any) => r.employee?.bankAccountNumber && Number(r.netPay) > 0);
                const noAcct = data.filter((r: any) => !r.employee?.bankAccountNumber && Number(r.netPay) > 0);
                const total = valid.reduce((s: number, r: any) => s + Number(r.netPay || 0), 0);
                return (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-gray-600">พนักงานมีบัญชีธนาคาร:</span><span className="font-medium text-green-600">{valid.length} คน</span></div>
                    <div className="flex justify-between"><span className="text-gray-600">ยอดโอนรวม:</span><span className="font-medium">฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                    {noAcct.length > 0 && (
                      <div className="flex justify-between text-orange-600">
                        <span>ไม่มีเลขบัญชี (จะข้ามไป):</span>
                        <span className="font-medium">{noAcct.length} คน</span>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBankFileOpen(false)} data-testid="button-cancel-bank-file">ยกเลิก</Button>
                <Button onClick={handleExportBankFile} style={{ background: "#03c9d7" }} className="text-white hover:opacity-90" data-testid="button-confirm-bank-file">
                  <Download className="h-4 w-4 mr-2" />สร้างไฟล์โอนเงิน
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </HRLayout>
  );
}
