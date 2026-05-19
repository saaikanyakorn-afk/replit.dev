import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { formatDate } from "@/lib/format";
import Layout from "@/components/layout";
import { objectPathToUrl } from "@/lib/utils";

import { useDateSettings } from "@/hooks/use-date-settings";
function formatDateParts(dateStr: string | null | undefined, era: string = "CE"): { day: string; month: string; year: string } {
  if (!dateStr) return { day: "", month: "", year: "" };
  const d = new Date(dateStr);
  const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  return {
    day: String(d.getDate()),
    month: thaiMonths[d.getMonth()],
    year: String(era === "BE" ? d.getFullYear() + 543 : d.getFullYear()),
  };
}

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  if (n === 0) return "";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    <div className="flex items-center gap-0">
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center">
          {gi > 0 && <span className="mx-[2px] text-[9px] font-bold">-</span>}
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
  thinBorder: { border: "1px solid black", borderCollapse: "collapse" as const },
};

function aggregateByIncomeType(items: any[], fallbackData: any, dateEra: string, dateFmt: string) {
  const map: Record<string, { amountPaid: number; taxWithheld: number; descriptions: string[]; paidDate: string; lines: Array<{ description: string; paidDate: string; amountPaid: number; taxWithheld: number }> }> = {};
  const effectiveItems = items && items.length > 0 ? items : [{
    incomeType: fallbackData.incomeType || "5",
    incomeDescription: fallbackData.incomeDescription || "",
    paidDate: fallbackData.paidDate,
    amountPaid: fallbackData.amountPaid || "0",
    taxWithheld: fallbackData.taxWithheld || "0",
  }];
  for (const it of effectiveItems) {
    const key = it.incomeType || "5";
    if (!map[key]) map[key] = { amountPaid: 0, taxWithheld: 0, descriptions: [], paidDate: formatDate(it.paidDate || fallbackData.paidDate, dateEra, dateFmt), lines: [] };
    const amt = parseFloat(it.amountPaid || "0");
    const tax = parseFloat(it.taxWithheld || "0");
    map[key].amountPaid += amt;
    map[key].taxWithheld += tax;
    if (it.incomeDescription && !map[key].descriptions.includes(it.incomeDescription)) map[key].descriptions.push(it.incomeDescription);
    map[key].lines.push({
      description: it.incomeDescription || "",
      paidDate: formatDate(it.paidDate || fallbackData.paidDate, dateEra, dateFmt),
      amountPaid: amt,
      taxWithheld: tax,
    });
  }
  return map;
}

function MultiLineCell({ lines, render, align = "right" }: { lines: any[]; render: (l: any) => React.ReactNode; align?: "left" | "right" | "center" }) {
  if (!lines || lines.length === 0) return <></>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1px", textAlign: align as any }}>
      {lines.map((l, i) => <div key={i}>{render(l)}</div>)}
    </div>
  );
}

export function WhtCertContent({ data, dateEra = "CE", dateFmt = "DD/MM/YYYY" }: { data: any; dateEra?: string; dateFmt?: string }) {
  const agg = aggregateByIncomeType(data.items || [], data, dateEra, dateFmt);
  const totalPaid = parseFloat(data.amountPaid || "0");
  const totalTax = parseFloat(data.taxWithheld || "0");
  const dateParts = formatDateParts(data.certDate, dateEra);

  const tdL = "border border-black p-[2px] pl-[4px] text-left";
  const tdC = "border border-black p-[2px] text-center";
  const tdR = "border border-black p-[2px] pr-[4px] text-right";

  return (
    <div style={S.page}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 5mm; }
          body { background: white !important; }
          .wht-print-page { width: 100% !important; min-height: auto !important; padding: 4mm 6mm !important; border: none !important; }
        }
      `}</style>

      <div className="wht-print-page">
        <div style={{ textAlign: "center", marginBottom: "2px" }}>
          <div style={{ fontSize: "16px", fontWeight: "bold" }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
          <div style={{ fontSize: "12px" }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "16px", fontSize: "11px", marginBottom: "4px" }}>
          <span>เล่มที่ <span style={{ ...S.dotline, minWidth: "50px" }}>{data.bookNo || ""}</span></span>
          <span>เลขที่ <span style={{ ...S.dotline, minWidth: "70px", fontWeight: 600 }}>{data.certNo}</span></span>
        </div>

        <div style={S.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2px" }}>
            <b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-</b>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px" }}>
              <span>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</span>
              <TaxIdBoxes taxId={data.payerTaxId || ""} />
            </div>
          </div>
          <div>ชื่อ <span style={{ ...S.dotline, minWidth: "250px" }}>{data.payerName}</span> <span style={{ fontSize: "9px", color: "#666" }}>(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</span></div>
          <div>สาขา <span style={{ ...S.dotline, minWidth: "200px" }}>{data.payerBranch || "สำนักงานใหญ่"}</span></div>
          <div>ที่อยู่ <span style={{ ...S.dotline, minWidth: "500px" }}>{data.payerAddress || ""}</span></div>
          <div style={{ fontSize: "9px", color: "#666", paddingLeft: "28px" }}>(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
        </div>

        <div style={S.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2px" }}>
            <b>ผู้ถูกหักภาษี ณ ที่จ่าย :-</b>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "10px" }}>
              <span>เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</span>
              <TaxIdBoxes taxId={data.payeeTaxId || ""} />
            </div>
          </div>
          <div>ชื่อ <span style={{ ...S.dotline, minWidth: "250px" }}>{data.payeeName}</span> <span style={{ fontSize: "9px", color: "#666" }}>(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</span></div>
          <div>สาขา <span style={{ ...S.dotline, minWidth: "200px" }}>{data.payeeBranch || "สำนักงานใหญ่"}</span></div>
          <div>ที่อยู่ <span style={{ ...S.dotline, minWidth: "500px" }}>{data.payeeAddress || ""}</span></div>
          <div style={{ fontSize: "9px", color: "#666", paddingLeft: "28px" }}>(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
        </div>

        <div style={{ ...S.section, display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "4px" }}>
              <b>ลำดับที่</b>
              <span style={{ ...S.dotline, display: "inline-block", width: "50px", textAlign: "center" }}>{data.seqNo || ""}</span>
              <b>ในแบบ</b>
            </div>
            <div style={{ fontSize: "9px", color: "#666" }}>
              (ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่าง<br/>ลำดับที่ตามหนังสือรับรองฯ กับแบบยื่น<br/>รายการภาษีหัก ณ ที่จ่าย)
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, auto)", gap: "4px 16px", alignItems: "center" }}>
            <span><CB checked={data.formType === "pnd1"} /> ภ.ง.ด.1</span>
            <span><CB checked={data.formType === "pnd1a"} /> ภ.ง.ด.1ก</span>
            <span><CB checked={data.formType === "pnd1a_special"} /> ภ.ง.ด.1ก พิเศษ</span>
            <span><CB checked={data.formType === "pnd2"} /> ภ.ง.ด.2</span>
            <span><CB checked={data.formType === "pnd3"} /> ภ.ง.ด.3</span>
            <span><CB checked={data.formType === "pnd2a"} /> ภ.ง.ด.2ก</span>
            <span><CB checked={data.formType === "pnd3a"} /> ภ.ง.ด.3ก</span>
            <span><CB checked={data.formType === "pnd53"} /> ภ.ง.ด.53</span>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px", marginBottom: "3px" }}>
          <thead>
            <tr>
              <th className={tdL} style={{ width: "54%" }}>ประเภทเงินได้พึงประเมินที่จ่าย</th>
              <th className={tdC} style={{ width: "14%" }}>วัน เดือน<br/>หรือปีภาษี ที่จ่าย</th>
              <th className={tdC} style={{ width: "16%" }}>จำนวนเงินที่จ่าย</th>
              <th className={tdC} style={{ width: "16%" }}>ภาษีที่หัก<br/>และนำส่งไว้</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={tdL}>1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td>
              <td className={tdC}>{agg["1"]?.paidDate || ""}</td>
              <td className={tdR}>{agg["1"] ? fmt(agg["1"].amountPaid) : ""}</td>
              <td className={tdR}>{agg["1"] ? fmt(agg["1"].taxWithheld) : ""}</td>
            </tr>
            <tr>
              <td className={tdL}>2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</td>
              <td className={tdC}>{agg["2"]?.paidDate || ""}</td>
              <td className={tdR}>{agg["2"] ? fmt(agg["2"].amountPaid) : ""}</td>
              <td className={tdR}>{agg["2"] ? fmt(agg["2"].taxWithheld) : ""}</td>
            </tr>
            <tr>
              <td className={tdL}>3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)</td>
              <td className={tdC}>{agg["3"]?.paidDate || ""}</td>
              <td className={tdR}>{agg["3"] ? fmt(agg["3"].amountPaid) : ""}</td>
              <td className={tdR}>{agg["3"] ? fmt(agg["3"].taxWithheld) : ""}</td>
            </tr>
            <tr>
              <td className={tdL}>4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)</td>
              <td className={tdC}>{agg["4a"]?.paidDate || ""}</td>
              <td className={tdR}>{agg["4a"] ? fmt(agg["4a"].amountPaid) : ""}</td>
              <td className={tdR}>{agg["4a"] ? fmt(agg["4a"].taxWithheld) : ""}</td>
            </tr>
            <tr>
              <td className={tdL} style={{ paddingLeft: "12px" }}>(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)</td>
              <td className={tdC}>{agg["4b"]?.paidDate || ""}</td>
              <td className={tdR}>{agg["4b"] ? fmt(agg["4b"].amountPaid) : ""}</td>
              <td className={tdR}>{agg["4b"] ? fmt(agg["4b"].taxWithheld) : ""}</td>
            </tr>
            <tr>
              <td className={tdL} colSpan={4} style={{ fontSize: "10px", paddingLeft: "20px" }}>
                <div>(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้</div>
              </td>
            </tr>
            <tr>
              <td className={tdL} style={{ fontSize: "10px", paddingLeft: "40px" }}>(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ</td>
              <td className={tdC}></td><td className={tdR}></td><td className={tdR}></td>
            </tr>
            <tr>
              <td className={tdL} style={{ fontSize: "10px", paddingLeft: "40px" }}>(1.2) อัตราร้อยละ 25 ของกำไรสุทธิ</td>
              <td className={tdC}></td><td className={tdR}></td><td className={tdR}></td>
            </tr>
            <tr>
              <td className={tdL} style={{ fontSize: "10px", paddingLeft: "40px" }}>(1.3) อัตราร้อยละ 20 ของกำไรสุทธิ</td>
              <td className={tdC}></td><td className={tdR}></td><td className={tdR}></td>
            </tr>
            <tr>
              <td className={tdL} style={{ fontSize: "10px", paddingLeft: "40px" }}>(1.4) อัตราอื่นๆ (ระบุ) .................. ของกำไรสุทธิ</td>
              <td className={tdC}></td><td className={tdR}></td><td className={tdR}></td>
            </tr>
            <tr>
              <td className={tdL} colSpan={4} style={{ fontSize: "10px", paddingLeft: "20px" }}>
                <div>(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก</div>
              </td>
            </tr>
            <tr>
              <td className={tdL} style={{ fontSize: "10px", paddingLeft: "40px" }}>(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล</td>
              <td className={tdC}></td><td className={tdR}></td><td className={tdR}></td>
            </tr>
            <tr>
              <td className={tdL} style={{ fontSize: "10px", paddingLeft: "40px" }}>(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณเป็นรายได้เพื่อเสียภาษีเงินได้นิติบุคคล</td>
              <td className={tdC}></td><td className={tdR}></td><td className={tdR}></td>
            </tr>
            <tr>
              <td className={tdL} style={{ fontSize: "10px", paddingLeft: "40px" }}>(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี ก่อนรอบระยะเวลาบัญชีปีปัจจุบัน</td>
              <td className={tdC}></td><td className={tdR}></td><td className={tdR}></td>
            </tr>
            <tr>
              <td className={tdL} style={{ fontSize: "10px", paddingLeft: "40px" }}>(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)</td>
              <td className={tdC}></td><td className={tdR}></td><td className={tdR}></td>
            </tr>
            <tr>
              <td className={tdL} style={{ fontSize: "10px", paddingLeft: "40px" }}>(2.5) อื่นๆ (ระบุ) ......................................................</td>
              <td className={tdC}></td><td className={tdR}></td><td className={tdR}></td>
            </tr>
            <tr>
              <td className={tdL}>
                <div>5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา</div>
                <div style={{ paddingLeft: "12px", fontSize: "10px" }}>3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใดๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ</div>
                {agg["5"]?.lines && agg["5"].lines.length > 0 && (
                  <div style={{ paddingLeft: "12px", fontWeight: 600 }}>
                    {agg["5"].lines.map((l, i) => (
                      <div key={i}>({l.description || "-"})</div>
                    ))}
                  </div>
                )}
              </td>
              <td className={tdC}><MultiLineCell lines={agg["5"]?.lines || []} render={(l) => l.paidDate} align="center" /></td>
              <td className={tdR}><MultiLineCell lines={agg["5"]?.lines || []} render={(l) => fmt(l.amountPaid)} /></td>
              <td className={tdR}><MultiLineCell lines={agg["5"]?.lines || []} render={(l) => fmt(l.taxWithheld)} /></td>
            </tr>
            <tr>
              <td className={tdL}>
                <div>6. อื่นๆ (ระบุ) {(!agg["6"]?.lines || agg["6"].lines.length === 0) && "..........................................................."}</div>
                {agg["6"]?.lines && agg["6"].lines.length > 0 && (
                  <div style={{ paddingLeft: "12px", fontWeight: 600 }}>
                    {agg["6"].lines.map((l, i) => (
                      <div key={i}>({l.description || "-"})</div>
                    ))}
                  </div>
                )}
              </td>
              <td className={tdC}><MultiLineCell lines={agg["6"]?.lines || []} render={(l) => l.paidDate} align="center" /></td>
              <td className={tdR}><MultiLineCell lines={agg["6"]?.lines || []} render={(l) => fmt(l.amountPaid)} /></td>
              <td className={tdR}><MultiLineCell lines={agg["6"]?.lines || []} render={(l) => fmt(l.taxWithheld)} /></td>
            </tr>
            <tr style={{ fontWeight: "bold" }}>
              <td className={tdR} colSpan={2}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
              <td className={tdR}>{fmt(totalPaid)}</td>
              <td className={tdR}>{fmt(totalTax)}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ fontSize: "11px", marginBottom: "2px" }}>
          <b>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</b>
          <span style={{ ...S.dotline, minWidth: "320px", marginLeft: "4px", fontWeight: 600 }}>
            {numberToThaiWords(totalTax)}
          </span>
        </div>

        <div style={{ fontSize: "10px", marginBottom: "3px" }}>
          เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน <span style={{ ...S.dotline, display: "inline-block", minWidth: "60px", textAlign: "center" }}>{data.gpfAmount || ""}</span> บาท
          {" "}กองทุนประกันสังคม <span style={{ ...S.dotline, display: "inline-block", minWidth: "60px", textAlign: "center" }}>{data.ssoAmount || ""}</span> บาท
          {" "}กองทุนสำรองเลี้ยงชีพ <span style={{ ...S.dotline, display: "inline-block", minWidth: "60px", textAlign: "center" }}>{data.pvdAmount || ""}</span> บาท
        </div>

        <div style={{ ...S.section, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", fontSize: "11px" }}>
          <b>ผู้จ่ายเงิน</b>
          <span><CB checked={data.whtCondition === "1"} /> (1) หัก ณ ที่จ่าย</span>
          <span><CB checked={data.whtCondition === "2"} /> (2) ออกให้ตลอดไป</span>
          <span><CB checked={data.whtCondition === "3"} /> (3) ออกให้ครั้งเดียว</span>
          <span><CB checked={data.whtCondition === "4"} /> (4) อื่นๆ (ระบุ) {data.whtCondition === "4" && data.whtConditionOther ? data.whtConditionOther : ".................."}</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: "10px", marginTop: "4px" }}>
          <div style={{ ...S.section, width: "44%", fontSize: "10px" }}>
            <b>คำเตือน</b>
            <div>ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</div>
          </div>
          <div style={{ width: "52%", textAlign: "center", fontSize: "11px", position: "relative" }}>
            <div>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
            {data.stampUrl && (
              <img
                src={objectPathToUrl(data.stampUrl) || data.stampUrl}
                alt="ตรายาง"
                style={{ position: "absolute", right: "0px", top: "50%", transform: "translateY(-50%)", width: "150px", height: "150px", objectFit: "contain", pointerEvents: "none" }}
              />
            )}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: data.createdBySignatureUrl ? "36px" : "16px" }}>
              <tbody>
                <tr>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: "4px", border: "none" }}>ลงชื่อ</td>
                  <td style={{ textAlign: "center", width: "170px", position: "relative", border: "none" }}>
                    {data.createdBySignatureUrl && (
                      <img src={data.createdBySignatureUrl} alt="ลายเซ็น" style={{ maxHeight: "36px", maxWidth: "150px", objectFit: "contain", position: "absolute", left: "50%", bottom: "0px", transform: "translateX(-50%)" }} />
                    )}
                    <span style={{ display: "inline-block", width: "100%" }}>&nbsp;</span>
                  </td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "4px", border: "none" }}>ผู้จ่ายเงิน</td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "8px", fontSize: "10px", border: "none" }}>{data.stampUrl ? "" : "ประทับตรา"}</td>
                </tr>
                <tr>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap", paddingRight: "4px", paddingTop: "4px", border: "none" }}>(</td>
                  <td style={{ textAlign: "center", paddingTop: "4px", border: "none" }}>
                    <span style={{ ...S.dotline, width: "100%", textAlign: "center" }}>{data.createdBySignatureName || data.createdByName || data.payerName}</span>
                  </td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "4px", paddingTop: "4px", border: "none" }}>)</td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "8px", paddingTop: "4px", fontSize: "10px", border: "none" }}>{data.stampUrl ? "" : "นิติบุคคล"}</td>
                </tr>
                <tr>
                  <td style={{ border: "none", paddingTop: "4px" }}></td>
                  <td style={{ textAlign: "center", paddingTop: "4px", border: "none" }}>
                    <span style={{ ...S.dotline, width: "25px", textAlign: "center", display: "inline-block" }}>{dateParts.day}</span> / <span style={{ ...S.dotline, width: "55px", textAlign: "center", display: "inline-block" }}>{dateParts.month}</span> / <span style={{ ...S.dotline, width: "35px", textAlign: "center", display: "inline-block" }}>{dateParts.year}</span>
                  </td>
                  <td style={{ border: "none", paddingTop: "4px" }}></td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap", paddingLeft: "8px", paddingTop: "4px", fontSize: "9px", color: "#666", border: "none" }}>{data.stampUrl ? "" : "(ถ้ามี)"}</td>
                </tr>
                <tr>
                  <td style={{ border: "none" }}></td>
                  <td style={{ textAlign: "center", fontSize: "9px", color: "#666", border: "none", paddingTop: "1px" }}>(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</td>
                  <td style={{ border: "none" }}></td>
                  <td style={{ border: "none" }}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ marginTop: "4px", fontSize: "8.5px", color: "#666", borderTop: "1px solid #ccc", paddingTop: "2px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
          <b style={{ flexShrink: 0, whiteSpace: "nowrap" }}>หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง</b>
          <div>
            <div>1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง</div>
            <div>2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า</div>
            <div>3. กรณีอื่นๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WhtCertPrint() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/wht-certs/${id}`, { credentials: "include" });
        if (res.ok) setData(await res.json());
      } catch {}
      setLoading(false);
    })();
  }, [id]);

  const certCompanyId = data?.companyId;
  const { dateEra, dateFmt } = useDateSettings();
  const { data: docSettings } = useQuery<any>({
    queryKey: ["/api/document-settings", certCompanyId],
    queryFn: async () => {
      if (!certCompanyId) return null;
      const res = await fetch(`/api/document-settings?companyId=${certCompanyId}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!certCompanyId,
  });
  if (loading) return <Layout><div className="p-8 text-center text-muted-foreground">กำลังโหลด...</div></Layout>;
  if (!data) return <Layout><div className="p-8 text-center text-red-500">ไม่พบเอกสาร</div></Layout>;

  return (
    <Layout>
      <div className="print:p-0">
        <div className="flex items-center gap-2 mb-4 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => navigate("/purchases/wht")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> กลับ
          </Button>
          <Button size="sm" className="bg-purple-500 hover:bg-purple-600 text-white" onClick={() => window.print()} data-testid="button-print">
            <Printer className="w-4 h-4 mr-1" /> พิมพ์
          </Button>
        </div>
        <div className="print:m-0 overflow-x-auto">
          <WhtCertContent data={data} dateEra={dateEra} dateFmt={dateFmt} />
        </div>
      </div>
    </Layout>
  );
}
