import * as path from "path";
import { createRequire } from "module";
const _require = createRequire(
  typeof __filename !== "undefined"
    ? "file://" + __filename
    : /* @vite-ignore */ import.meta.url
);
const PdfPrinter = _require("pdfmake/src/printer");

const fontsDir = path.join(process.cwd(), "server/fonts");
const printer = new PdfPrinter({
  Sarabun: {
    normal: path.join(fontsDir, "Niramit-Regular.ttf"),
    bold: path.join(fontsDir, "Niramit-Bold.ttf"),
    italics: path.join(fontsDir, "Niramit-Italic.ttf"),
    bolditalics: path.join(fontsDir, "Niramit-BoldItalic.ttf"),
  },
});

function fmtNum(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  if (n === 0) return "";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToThaiWords(n: number): string {
  if (n === 0) return "ศูนย์บาทถ้วน";
  const units = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const positions = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน", "ล้าน"];
  const intPart = Math.floor(Math.abs(n));
  const decPart = Math.round((Math.abs(n) - intPart) * 100);
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
      result += units[digit] + (pos < positions.length ? positions[pos] : "");
    }
    return result;
  }
  // handle millions
  function convertFull(num: number): string {
    if (num < 1000000) return convert(num);
    const mil = Math.floor(num / 1000000);
    const rem = num % 1000000;
    return convert(mil) + "ล้าน" + (rem > 0 ? convert(rem) : "");
  }
  let result = convertFull(intPart) + "บาท";
  if (decPart > 0) {
    result += convert(decPart) + "สตางค์";
  } else {
    result += "ถ้วน";
  }
  return result;
}

function formatDateParts(dateStr: string | null | undefined, era = "CE"): { day: string; month: string; year: string } {
  if (!dateStr) return { day: "", month: "", year: "" };
  const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const d = new Date(dateStr);
  return {
    day: String(d.getDate()),
    month: thaiMonths[d.getMonth()],
    year: String(era === "BE" ? d.getFullYear() + 543 : d.getFullYear()),
  };
}

function formatDate(dateStr: string | null | undefined, era = "CE"): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const year = era === "BE" ? d.getFullYear() + 543 : d.getFullYear();
  return `${d.getDate()} ${thaiMonths[d.getMonth()]} ${year}`;
}

function aggregateByIncomeType(items: any[], fallbackData: any): Record<string, {
  amountPaid: number; taxWithheld: number; paidDate: string;
  lines: Array<{ description: string; paidDate: string; amountPaid: number; taxWithheld: number }>;
}> {
  const map: Record<string, any> = {};
  const effectiveItems = items && items.length > 0 ? items : [{
    incomeType: fallbackData.incomeType || "5",
    incomeDescription: fallbackData.incomeDescription || "",
    paidDate: fallbackData.paidDate,
    amountPaid: fallbackData.amountPaid || "0",
    taxWithheld: fallbackData.taxWithheld || "0",
  }];
  for (const it of effectiveItems) {
    const key = it.incomeType || "5";
    if (!map[key]) map[key] = { amountPaid: 0, taxWithheld: 0, paidDate: formatDate(it.paidDate || fallbackData.paidDate), lines: [] };
    const amt = parseFloat(it.amountPaid || "0");
    const tax = parseFloat(it.taxWithheld || "0");
    map[key].amountPaid += amt;
    map[key].taxWithheld += tax;
    if (!map[key].paidDate) map[key].paidDate = formatDate(it.paidDate || fallbackData.paidDate);
    map[key].lines.push({
      description: it.incomeDescription || "",
      paidDate: formatDate(it.paidDate || fallbackData.paidDate),
      amountPaid: amt,
      taxWithheld: tax,
    });
  }
  return map;
}

function taxIdBoxes(taxId: string): any {
  const digits = (taxId || "").replace(/\D/g, "").padEnd(13, " ").slice(0, 13).split("");
  const groups = [
    [digits[0]],
    [digits[1], digits[2], digits[3], digits[4]],
    [digits[5], digits[6], digits[7], digits[8], digits[9]],
    [digits[10], digits[11]],
    [digits[12]],
  ];
  const items: any[] = [];
  groups.forEach((group, gi) => {
    if (gi > 0) items.push({ text: "-", fontSize: 7, bold: true, margin: [1, 0, 1, 0] });
    group.forEach((d) => {
      items.push({
        table: { widths: [10], heights: [12], body: [[{ text: d.trim(), fontSize: 8, alignment: "center" }]] },
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "black", vLineColor: () => "black" },
        margin: [0, 0, 0, 0],
      });
    });
  });
  return { columns: items, columnGap: 1 };
}

function cb(checked: boolean): any {
  const vecs: any[] = [
    { type: "rect", x: 0, y: 0, w: 8, h: 8, lineWidth: 0.5, lineColor: "black", fillColor: "white" },
  ];
  if (checked) {
    vecs.push({ type: "line", x1: 1.5, y1: 4.5, x2: 3.5, y2: 7.5, lineWidth: 1.2, lineColor: "black" });
    vecs.push({ type: "line", x1: 3.5, y1: 7.5, x2: 7.5, y2: 1.5, lineWidth: 1.2, lineColor: "black" });
  }
  return { canvas: vecs, width: 9, height: 9 };
}

function dotRow(label: string, value: string, labelWidth: number = 30): any {
  return {
    columns: [
      { text: label, width: labelWidth, fontSize: 8 },
      {
        stack: [
          { text: value || "", fontSize: 8 },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 999, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
        ],
        fontSize: 8,
      },
    ],
    columnGap: 2,
    margin: [0, 1, 0, 1],
  };
}

function sectionBox(content: any[]): any {
  return {
    table: { widths: ["*"], body: [[{ stack: content, margin: [3, 2, 3, 2] }]] },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "black", vLineColor: () => "black" },
    margin: [0, 0, 0, 3],
  };
}

function incomeRow(label: any, date: string, amount: string, tax: string, small = false): any[] {
  return [[
    { stack: Array.isArray(label) ? label : [{ text: label, fontSize: small ? 7 : 8 }], fontSize: small ? 7 : 8 },
    { text: date, fontSize: small ? 7 : 8, alignment: "center" },
    { text: amount, fontSize: small ? 7 : 8, alignment: "right" },
    { text: tax, fontSize: small ? 7 : 8, alignment: "right" },
  ]];
}

export async function generateWhtCertPdf(data: any): Promise<Buffer> {
  const agg = aggregateByIncomeType(data.items || [], data);
  const totalPaid = parseFloat(data.amountPaid || "0");
  const totalTax = parseFloat(data.taxWithheld || "0");
  const dateParts = formatDateParts(data.certDate, "CE");

  const border: [boolean, boolean, boolean, boolean] = [true, true, true, true];
  const noBorder: [boolean, boolean, boolean, boolean] = [false, false, false, false];

  function incomeTableRows(type: string, labelItems: any[], small = false): any[] {
    const entry = agg[type];
    if (!entry || entry.lines.length <= 1) {
      return [[
        { stack: Array.isArray(labelItems) ? labelItems : [{ text: labelItems, fontSize: small ? 7 : 8 }], border },
        { text: entry?.paidDate || "", fontSize: small ? 7 : 8, alignment: "center", border },
        { text: entry ? fmtNum(entry.amountPaid) : "", fontSize: small ? 7 : 8, alignment: "right", border },
        { text: entry ? fmtNum(entry.taxWithheld) : "", fontSize: small ? 7 : 8, alignment: "right", border },
      ]];
    }
    return entry.lines.map((line, idx) => [
      {
        stack: idx === 0 ? (Array.isArray(labelItems) ? labelItems : [{ text: labelItems, fontSize: small ? 7 : 8 }]) : [{ text: `  (${line.description || "-"})`, fontSize: 7 }],
        border,
      },
      { text: line.paidDate, fontSize: 7, alignment: "center", border },
      { text: fmtNum(line.amountPaid), fontSize: 7, alignment: "right", border },
      { text: fmtNum(line.taxWithheld), fontSize: 7, alignment: "right", border },
    ]);
  }

  function multiLineRows(type: string, labelItems: any[]): any[] {
    const entry = agg[type];
    const descLines: any[] = [];
    if (entry?.lines && entry.lines.length > 0) {
      entry.lines.forEach((l) => { if (l.description) descLines.push({ text: `  (${l.description})`, fontSize: 7 }); });
    }
    const labelStack = [
      ...(Array.isArray(labelItems) ? labelItems : [{ text: labelItems, fontSize: 8 }]),
      ...descLines,
    ];
    if (!entry || entry.lines.length <= 1) {
      return [[
        { stack: labelStack, border },
        { text: entry?.paidDate || "", fontSize: 8, alignment: "center", border },
        { text: entry ? fmtNum(entry.amountPaid) : "", fontSize: 8, alignment: "right", border },
        { text: entry ? fmtNum(entry.taxWithheld) : "", fontSize: 8, alignment: "right", border },
      ]];
    }
    return entry.lines.map((line, idx) => [
      {
        stack: idx === 0 ? labelStack : [{ text: `  (${line.description || "-"})`, fontSize: 7 }],
        border,
      },
      { text: line.paidDate, fontSize: 7, alignment: "center", border },
      { text: fmtNum(line.amountPaid), fontSize: 7, alignment: "right", border },
      { text: fmtNum(line.taxWithheld), fontSize: 7, alignment: "right", border },
    ]);
  }

  const formTypes: Record<string, string> = {
    pnd1: "ภ.ง.ด.1", pnd1a: "ภ.ง.ด.1ก", pnd1a_special: "ภ.ง.ด.1ก พิเศษ",
    pnd2: "ภ.ง.ด.2", pnd3: "ภ.ง.ด.3", pnd2a: "ภ.ง.ด.2ก", pnd3a: "ภ.ง.ด.3ก", pnd53: "ภ.ง.ด.53",
  };

  const docDefinition: any = {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [20, 15, 20, 15],
    defaultStyle: { font: "Sarabun", fontSize: 8, lineHeight: 1.3 },
    content: [
      // Title
      { text: "หนังสือรับรองการหักภาษี ณ ที่จ่าย", style: "header", alignment: "center", fontSize: 13, bold: true, margin: [0, 0, 0, 1] },
      { text: "ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร", fontSize: 9, alignment: "center", margin: [0, 0, 0, 3] },
      // เล่มที่/เลขที่
      {
        columns: [
          { text: "", width: "*" },
          { text: `เล่มที่  ${data.bookNo || ""}    เลขที่  ${data.certNo || ""}`, fontSize: 8, bold: true, alignment: "right", width: "auto" },
        ],
        margin: [0, 0, 0, 3],
      },
      // ผู้มีหน้าที่หักภาษี
      sectionBox([
        {
          columns: [
            { text: "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-", bold: true, fontSize: 8, width: "*" },
            {
              width: 210,
              stack: [
                { text: "เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*", fontSize: 7 },
                taxIdBoxes(data.payerTaxId || ""),
              ],
            },
          ],
          margin: [0, 0, 0, 2],
        },
        dotRow("ชื่อ", `${data.payerName || ""}  (ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)`),
        dotRow("สาขา", data.payerBranch || "สำนักงานใหญ่"),
        dotRow("ที่อยู่", data.payerAddress || ""),
        { text: "(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)", fontSize: 6.5, color: "#666", margin: [22, 0, 0, 0] },
      ]),
      // ผู้ถูกหักภาษี
      sectionBox([
        {
          columns: [
            { text: "ผู้ถูกหักภาษี ณ ที่จ่าย :-", bold: true, fontSize: 8, width: "*" },
            {
              width: 210,
              stack: [
                { text: "เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*", fontSize: 7 },
                taxIdBoxes(data.payeeTaxId || ""),
              ],
            },
          ],
          margin: [0, 0, 0, 2],
        },
        dotRow("ชื่อ", `${data.payeeName || ""}  (ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)`),
        dotRow("สาขา", data.payeeBranch || "สำนักงานใหญ่"),
        dotRow("ที่อยู่", data.payeeAddress || ""),
        { text: "(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)", fontSize: 6.5, color: "#666", margin: [22, 0, 0, 0] },
      ]),
      // ลำดับที่ + form type
      sectionBox([
        {
          columns: [
            {
              width: "auto",
              stack: [
                { text: [`ลำดับที่  `, { text: data.seqNo || "    ", bold: true }, `  ในแบบ`], fontSize: 8, margin: [0, 0, 0, 2] },
                { text: "(ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่าง\nลำดับที่ตามหนังสือรับรองฯ กับแบบยื่น\nรายการภาษีหัก ณ ที่จ่าย)", fontSize: 6.5, color: "#666" },
              ],
              margin: [0, 0, 12, 0],
            },
            {
              width: "*",
              table: {
                widths: ["auto", "auto", "auto", "auto"],
                body: [
                  [
                    { columns: [cb(data.formType === "pnd1"), { text: " ภ.ง.ด.1", fontSize: 8 }], columnGap: 2, border: noBorder },
                    { columns: [cb(data.formType === "pnd1a"), { text: " ภ.ง.ด.1ก", fontSize: 8 }], columnGap: 2, border: noBorder },
                    { columns: [cb(data.formType === "pnd1a_special"), { text: " ภ.ง.ด.1ก พิเศษ", fontSize: 8 }], columnGap: 2, border: noBorder },
                    { columns: [cb(data.formType === "pnd2"), { text: " ภ.ง.ด.2", fontSize: 8 }], columnGap: 2, border: noBorder },
                  ],
                  [
                    { columns: [cb(data.formType === "pnd3"), { text: " ภ.ง.ด.3", fontSize: 8 }], columnGap: 2, border: noBorder },
                    { columns: [cb(data.formType === "pnd2a"), { text: " ภ.ง.ด.2ก", fontSize: 8 }], columnGap: 2, border: noBorder },
                    { columns: [cb(data.formType === "pnd3a"), { text: " ภ.ง.ด.3ก", fontSize: 8 }], columnGap: 2, border: noBorder },
                    { columns: [cb(data.formType === "pnd53"), { text: " ภ.ง.ด.53", fontSize: 8 }], columnGap: 2, border: noBorder },
                  ],
                ],
              },
              layout: "noBorders",
            },
          ],
        },
      ]),
      // ตาราง ประเภทเงินได้
      {
        table: {
          widths: ["54%", "14%", "16%", "16%"],
          headerRows: 1,
          body: [
            // header
            [
              { text: "ประเภทเงินได้พึงประเมินที่จ่าย", fontSize: 8, bold: true, alignment: "left", border },
              { text: "วัน เดือน\nหรือปีภาษี ที่จ่าย", fontSize: 7.5, bold: true, alignment: "center", border },
              { text: "จำนวนเงินที่จ่าย", fontSize: 7.5, bold: true, alignment: "center", border },
              { text: "ภาษีที่หัก\nและนำส่งไว้", fontSize: 7.5, bold: true, alignment: "center", border },
            ],
            // row 1
            ...incomeTableRows("1", "1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)"),
            // row 2
            ...incomeTableRows("2", "2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)"),
            // row 3
            ...incomeTableRows("3", "3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)"),
            // row 4a
            ...incomeTableRows("4a", "4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)"),
            // row 4b
            ...incomeTableRows("4b", "   (ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)"),
            // sub-rows dividend
            [[
              { text: "   (1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้", fontSize: 7, colSpan: 4, border },
              {}, {}, {},
            ]][0],
            [[
              { text: "        (1.1) อัตราร้อยละ 30 ของกำไรสุทธิ", fontSize: 7, border },
              { text: "", border }, { text: "", border }, { text: "", border },
            ]][0],
            [[
              { text: "        (1.2) อัตราร้อยละ 25 ของกำไรสุทธิ", fontSize: 7, border },
              { text: "", border }, { text: "", border }, { text: "", border },
            ]][0],
            [[
              { text: "        (1.3) อัตราร้อยละ 20 ของกำไรสุทธิ", fontSize: 7, border },
              { text: "", border }, { text: "", border }, { text: "", border },
            ]][0],
            [[
              { text: "        (1.4) อัตราอื่นๆ (ระบุ) .................. ของกำไรสุทธิ", fontSize: 7, border },
              { text: "", border }, { text: "", border }, { text: "", border },
            ]][0],
            [[
              { text: "   (2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก", fontSize: 7, colSpan: 4, border },
              {}, {}, {},
            ]][0],
            [[
              { text: "        (2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล", fontSize: 7, border },
              { text: "", border }, { text: "", border }, { text: "", border },
            ]][0],
            [[
              { text: "        (2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณ", fontSize: 7, border },
              { text: "", border }, { text: "", border }, { text: "", border },
            ]][0],
            [[
              { text: "        (2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี ก่อนรอบระยะเวลาบัญชีปีปัจจุบัน", fontSize: 7, border },
              { text: "", border }, { text: "", border }, { text: "", border },
            ]][0],
            [[
              { text: "        (2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)", fontSize: 7, border },
              { text: "", border }, { text: "", border }, { text: "", border },
            ]][0],
            [[
              { text: "        (2.5) อื่นๆ (ระบุ) ......................................................", fontSize: 7, border },
              { text: "", border }, { text: "", border }, { text: "", border },
            ]][0],
            // row 5
            ...multiLineRows("5", [
              { text: "5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา", fontSize: 8 },
              { text: "   3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใดๆ เนื่องจากการส่งเสริมการขาย ค่าจ้างทำของ ค่าเช่า ค่าบริการ ฯลฯ", fontSize: 7 },
            ]),
            // row 6
            ...multiLineRows("6", [
              { text: `6. อื่นๆ (ระบุ) ${!agg["6"] ? "..........................................................." : ""}`, fontSize: 8 },
            ]),
            // total
            [
              { text: "รวมเงินที่จ่ายและภาษีที่หักนำส่ง", colSpan: 2, alignment: "right", bold: true, fontSize: 8, border },
              {},
              { text: fmtNum(totalPaid), alignment: "right", bold: true, fontSize: 8, border },
              { text: fmtNum(totalTax), alignment: "right", bold: true, fontSize: 8, border },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "black",
          vLineColor: () => "black",
        },
        margin: [0, 0, 0, 3],
      },
      // ตัวอักษร
      {
        columns: [
          { text: "รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)", bold: true, fontSize: 8, width: "auto" },
          {
            stack: [
              { text: numberToThaiWords(totalTax), fontSize: 8, bold: true },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 999, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
            ],
            margin: [4, 0, 0, 0],
          },
        ],
        margin: [0, 0, 0, 2],
      },
      // กองทุน
      {
        text: [
          "เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน  ",
          { text: data.gpfAmount || "         ", decoration: "underline" }, " บาท",
          "   กองทุนประกันสังคม  ",
          { text: data.ssoAmount || "         ", decoration: "underline" }, " บาท",
          "   กองทุนสำรองเลี้ยงชีพ  ",
          { text: data.pvdAmount || "         ", decoration: "underline" }, " บาท",
        ],
        fontSize: 7.5,
        margin: [0, 0, 0, 3],
      },
      // ผู้จ่ายเงิน condition
      sectionBox([
        {
          columns: [
            { text: "ผู้จ่ายเงิน  ", bold: true, fontSize: 8, width: "auto" },
            { columns: [cb(data.whtCondition === "1"), { text: " (1) หัก ณ ที่จ่าย", fontSize: 8 }], columnGap: 2, width: "auto" },
            { text: "  ", width: 6 },
            { columns: [cb(data.whtCondition === "2"), { text: " (2) ออกให้ตลอดไป", fontSize: 8 }], columnGap: 2, width: "auto" },
            { text: "  ", width: 6 },
            { columns: [cb(data.whtCondition === "3"), { text: " (3) ออกให้ครั้งเดียว", fontSize: 8 }], columnGap: 2, width: "auto" },
            { text: "  ", width: 6 },
            { columns: [cb(data.whtCondition === "4"), { text: ` (4) อื่นๆ (ระบุ) ${data.whtCondition === "4" && data.whtConditionOther ? data.whtConditionOther : ".................."}`, fontSize: 8 }], columnGap: 2, width: "*" },
          ],
          columnGap: 2,
        },
      ]),
      // warning + signature
      {
        columns: [
          {
            width: "44%",
            table: {
              widths: ["*"],
              body: [[{
                stack: [
                  { text: "คำเตือน", bold: true, fontSize: 8 },
                  { text: "ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร", fontSize: 7.5 },
                ],
                margin: [3, 2, 3, 2],
              }]],
            },
            layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "black", vLineColor: () => "black" },
          },
          {
            width: "*",
            alignment: "center",
            stack: [
              { text: "ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ", fontSize: 7.5, alignment: "center", margin: [0, 0, 0, 8] },
              {
                table: {
                  widths: ["auto", "*", "auto", "auto"],
                  body: [
                    [
                      { text: "ลงชื่อ", border: noBorder, fontSize: 8 },
                      { text: "", border: [false, false, false, true] as any, fontSize: 8 },
                      { text: "ผู้จ่ายเงิน", border: noBorder, fontSize: 8 },
                      { text: "ประทับตรา", border: noBorder, fontSize: 7.5, color: "#666" },
                    ],
                    [
                      { text: "(", border: noBorder, fontSize: 8, margin: [0, 2, 0, 0] },
                      {
                        stack: [
                          { text: data.createdBySignatureName || data.createdByName || data.payerName || "", fontSize: 8, alignment: "center" },
                          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 999, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
                        ],
                        border: noBorder,
                        margin: [0, 2, 0, 0],
                      },
                      { text: ")", border: noBorder, fontSize: 8, margin: [0, 2, 0, 0] },
                      { text: "นิติบุคคล", border: noBorder, fontSize: 7.5, color: "#666", margin: [0, 2, 0, 0] },
                    ],
                    [
                      { text: "", border: noBorder },
                      {
                        text: `${dateParts.day || "   "} / ${dateParts.month || "           "} / ${dateParts.year || "      "}`,
                        alignment: "center", fontSize: 8, border: noBorder, margin: [0, 2, 0, 0],
                      },
                      { text: "", border: noBorder },
                      { text: "(ถ้ามี)", border: noBorder, fontSize: 7, color: "#666", margin: [0, 2, 0, 0] },
                    ],
                    [
                      { text: "", border: noBorder },
                      { text: "(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)", alignment: "center", fontSize: 7, color: "#666", border: noBorder },
                      { text: "", border: noBorder },
                      { text: "", border: noBorder },
                    ],
                  ],
                },
                layout: "noBorders",
              },
            ],
            margin: [8, 0, 0, 0],
          },
        ],
        columnGap: 8,
        margin: [0, 3, 0, 3],
      },
      // footnote
      {
        columns: [
          { text: "หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง", bold: true, fontSize: 7, width: "auto" },
          {
            stack: [
              { text: "1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง", fontSize: 7 },
              { text: "2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า", fontSize: 7 },
              { text: "3. กรณีอื่นๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร", fontSize: 7 },
            ],
            margin: [6, 0, 0, 0],
          },
        ],
        margin: [0, 3, 0, 0],
        columnGap: 4,
      },
    ],
    styles: {
      header: { font: "Sarabun" },
    },
  };

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
      pdfDoc.on("error", reject);
      pdfDoc.end();
    } catch (err) {
      reject(err);
    }
  });
}
