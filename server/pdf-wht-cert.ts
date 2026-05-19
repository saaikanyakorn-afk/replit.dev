import * as path from "path";
import * as fs from "fs";
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

function loadLocalImageBase64(urlPath: string): string | null {
  try {
    if (!urlPath) return null;
    // urlPath is like /api/local-file/FILENAME or /api/local-file/sub/FILENAME
    const match = urlPath.match(/\/api\/local-file\/(.+)$/);
    if (!match) return null;
    const fileName = match[1];
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    const filePath = path.join(uploadDir, fileName);
    if (!fs.existsSync(filePath)) return null;
    const ext = path.extname(fileName).toLowerCase();
    const mimeMap: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };
    const mime = mimeMap[ext] || "image/jpeg";
    const b64 = fs.readFileSync(filePath).toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch { return null; }
}

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
  const raw = (taxId || "").replace(/\D/g, "").padEnd(13, " ").slice(0, 13);
  const digits = raw.split("");
  const groups = [
    [digits[0]],
    [digits[1], digits[2], digits[3], digits[4]],
    [digits[5], digits[6], digits[7], digits[8], digits[9]],
    [digits[10], digits[11]],
    [digits[12]],
  ];
  const boxW = 11, boxH = 12, dashW = 7;
  let cx = 0;
  const rects: any[] = [];
  const textItems: any[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    if (gi > 0) {
      textItems.push({ text: "-", width: dashW, fontSize: 8, bold: true, alignment: "center" });
      cx += dashW;
    }
    for (const d of groups[gi]) {
      rects.push({ type: "rect", x: cx, y: 0, w: boxW, h: boxH, lineWidth: 0.5, lineColor: "black", fillColor: "white" });
      textItems.push({ text: d.trim() || " ", width: boxW, fontSize: 7, alignment: "center" });
      cx += boxW;
    }
  }
  // canvas draws the visible boxes; text uses relativePosition to overlay on canvas;
  // negative bottom margin cancels the extra layout height so the row stays compact
  return {
    stack: [
      { canvas: rects, width: cx, height: boxH },
      { columns: textItems, columnGap: 0, relativePosition: { x: 0, y: -boxH }, width: cx, margin: [0, 0, 0, -(boxH - 2)] },
    ],
    width: cx,
  };
}

function cb(checked: boolean): any {
  const vecs: any[] = [
    { type: "rect", x: 0, y: 0, w: 10, h: 10, lineWidth: 0.5, lineColor: "black", fillColor: "white" },
  ];
  if (checked) {
    vecs.push({ type: "line", x1: 1.8, y1: 5.5, x2: 4, y2: 9, lineWidth: 1.2, lineColor: "black" });
    vecs.push({ type: "line", x1: 4, y1: 9, x2: 9.5, y2: 1.5, lineWidth: 1.2, lineColor: "black" });
  }
  return { canvas: vecs, width: 11, height: 11 };
}

function dotRow(label: string, value: string | any[], labelWidth: number = 30): any {
  return {
    columns: [
      { text: label, width: labelWidth, fontSize: 8 },
      {
        stack: [
          { text: typeof value === "string" ? (value || "") : value, fontSize: 8 },
          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 530, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
        ],
        fontSize: 8,
        width: "*",
      },
    ],
    columnGap: 2,
    margin: [0, 0, 0, 1],
  };
}

function sectionBox(content: any[]): any {
  return {
    table: { widths: ["*"], body: [[{ stack: content, margin: [3, 0, 3, 1] }]] },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => "black", vLineColor: () => "black" },
    margin: [0, 0, 0, 2],
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
  const signatureImageB64 = data.createdBySignatureUrl ? loadLocalImageBase64(data.createdBySignatureUrl) : null;
  const stampImageB64 = data.stampUrl ? loadLocalImageBase64(data.stampUrl) : null;

  const border: [boolean, boolean, boolean, boolean] = [true, true, true, true];
  const noBorder: [boolean, boolean, boolean, boolean] = [false, false, false, false];

  // Estimate number of wrapped lines for a label stack given column width in pt
  function estimateLabelLines(items: any[], colWidthPt: number): number {
    let total = 0;
    for (const item of items) {
      const text = (typeof item.text === "string" ? item.text : "").trim();
      if (!text) { total += 1; continue; }
      const fs = item.fontSize || 8;
      const avgCharW = fs * 0.52;
      const charsPerLine = Math.max(1, Math.floor(colWidthPt / avgCharW));
      total += Math.max(1, Math.ceil(text.length / charsPerLine));
    }
    return total;
  }

  // Compute top margin to vertically centre a single-line cell inside a multi-line label row
  function vCenterMargin(labelItems: any[], labelColWidthPt = 307): number {
    const lines = estimateLabelLines(labelItems, labelColWidthPt);
    const lineH = 8 * 1.1;
    const rowH = lines * lineH;
    const contentH = lineH;
    return Math.max(0, Math.floor((rowH - contentH) / 2) - 2);
  }

  // Single aggregated row — matches HTML rows 1-4b (no MultiLineCell, just aggregate totals)
  function incomeTableRows(type: string, labelItems: any[], small = false): any[] {
    const entry = agg[type];
    const labelArr = Array.isArray(labelItems) ? labelItems : [{ text: labelItems, fontSize: small ? 7 : 8 }];
    const mt = vCenterMargin(labelArr);
    return [[
      { stack: labelArr, border },
      { text: entry?.paidDate || "", fontSize: small ? 7 : 8, alignment: "center", border, margin: [0, mt, 0, 0] },
      { text: entry ? fmtNum(entry.amountPaid) : "", fontSize: small ? 7 : 8, alignment: "right", border, margin: [0, mt, 0, 0] },
      { text: entry ? fmtNum(entry.taxWithheld) : "", fontSize: small ? 7 : 8, alignment: "right", border, margin: [0, mt, 0, 0] },
    ]];
  }

  // Single row with stacked content — matches HTML rows 5-6 (MultiLineCell: one date/amount/tax per line, stacked)
  function multiLineRows(type: string, labelItems: any[]): any[] {
    const entry = agg[type];
    const descLines: any[] = [];
    if (entry?.lines && entry.lines.length > 0) {
      entry.lines.forEach((l) => { if (l.description) descLines.push({ text: `  (${l.description})`, fontSize: 7, bold: true }); });
    }
    const labelStack = [
      ...(Array.isArray(labelItems) ? labelItems : [{ text: labelItems, fontSize: 8 }]),
      ...descLines,
    ];
    const hasMultiple = entry && entry.lines.length > 1;
    const mt = hasMultiple ? 0 : vCenterMargin(labelStack);
    return [[
      { stack: labelStack, border },
      hasMultiple
        ? { stack: entry!.lines.map(l => ({ text: l.paidDate, fontSize: 7, alignment: "center" })), border }
        : { text: entry?.paidDate || "", fontSize: 8, alignment: "center", border, margin: [0, mt, 0, 0] },
      hasMultiple
        ? { stack: entry!.lines.map(l => ({ text: fmtNum(l.amountPaid), fontSize: 7, alignment: "right" })), border }
        : { text: entry ? fmtNum(entry.amountPaid) : "", fontSize: 8, alignment: "right", border, margin: [0, mt, 0, 0] },
      hasMultiple
        ? { stack: entry!.lines.map(l => ({ text: fmtNum(l.taxWithheld), fontSize: 7, alignment: "right" })), border }
        : { text: entry ? fmtNum(entry.taxWithheld) : "", fontSize: 8, alignment: "right", border, margin: [0, mt, 0, 0] },
    ]];
  }

  const formTypes: Record<string, string> = {
    pnd1: "ภ.ง.ด.1", pnd1a: "ภ.ง.ด.1ก", pnd1a_special: "ภ.ง.ด.1ก พิเศษ",
    pnd2: "ภ.ง.ด.2", pnd3: "ภ.ง.ด.3", pnd2a: "ภ.ง.ด.2ก", pnd3a: "ภ.ง.ด.3ก", pnd53: "ภ.ง.ด.53",
  };

  const docDefinition: any = {
    pageSize: "A4",
    pageOrientation: "portrait",
    pageMargins: [10, 4, 10, 4],
    defaultStyle: { font: "Sarabun", fontSize: 8, lineHeight: 1.1 },
    content: [
      // Title
      { text: "หนังสือรับรองการหักภาษี ณ ที่จ่าย", style: "header", alignment: "center", fontSize: 13, bold: true, margin: [0, 0, 0, 1] },
      { text: "ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร", fontSize: 9, alignment: "center", margin: [0, 0, 0, 2] },
      // เล่มที่/เลขที่
      {
        columns: [
          { text: "", width: "*" },
          { text: `เล่มที่  ${data.bookNo || ""}    เลขที่  ${data.certNo || ""}`, fontSize: 8, bold: true, alignment: "right", width: "auto" },
        ],
        margin: [0, 0, 0, 2],
      },
      // ผู้มีหน้าที่หักภาษี
      sectionBox([
        {
          columns: [
            { text: "ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-", bold: true, fontSize: 8, width: "*" },
            { text: "เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*", fontSize: 6.5, alignment: "right", width: 120 },
            { ...taxIdBoxes(data.payerTaxId || ""), width: 171 },
          ],
          columnGap: 4,
          margin: [0, 0, 0, 2],
        },
        dotRow("ชื่อ", [
          { text: data.payerName || "" },
          { text: "  (ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)", color: "#999", fontSize: 7 },
        ]),
        dotRow("สาขา", data.payerBranch || "สำนักงานใหญ่"),
        dotRow("ที่อยู่", data.payerAddress || ""),
        { text: "(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)", fontSize: 6.5, color: "#666", margin: [32, 0, 0, 0] },
      ]),
      // ผู้ถูกหักภาษี
      sectionBox([
        {
          columns: [
            { text: "ผู้ถูกหักภาษี ณ ที่จ่าย :-", bold: true, fontSize: 8, width: "*" },
            { text: "เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*", fontSize: 6.5, alignment: "right", width: 120 },
            { ...taxIdBoxes(data.payeeTaxId || ""), width: 171 },
          ],
          columnGap: 4,
          margin: [0, 0, 0, 2],
        },
        dotRow("ชื่อ", [
          { text: data.payeeName || "" },
          { text: "  (ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)", color: "#999", fontSize: 7 },
        ]),
        dotRow("สาขา", data.payeeBranch || "สำนักงานใหญ่"),
        dotRow("ที่อยู่", data.payeeAddress || ""),
        { text: "(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)", fontSize: 6.5, color: "#666", margin: [32, 0, 0, 0] },
      ]),
      // ลำดับที่ + form type
      sectionBox([
        {
          columns: [
            {
              width: "auto",
              stack: [
                {
                  columns: [
                    { text: "ลำดับที่", width: "auto", fontSize: 8 },
                    {
                      stack: [
                        { text: data.seqNo || "", fontSize: 8, bold: true, alignment: "center" },
                        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 55, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
                      ],
                      width: 55,
                      margin: [3, 0, 3, 0],
                    },
                    { text: "ในแบบ", width: "auto", fontSize: 8 },
                  ],
                  columnGap: 0,
                  margin: [0, 0, 0, 2],
                },
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
              { text: "   3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใดๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ", fontSize: 7 },
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
        margin: [0, 0, 0, 2],
      },
      // ตัวอักษร
      {
        columns: [
          { text: "รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)", bold: true, fontSize: 8, width: "auto", noWrap: true },
          {
            stack: [
              { text: numberToThaiWords(totalTax), fontSize: 8, bold: true },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 355, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
            ],
            width: "*",
            margin: [6, 0, 0, 0],
          },
        ],
        margin: [0, 0, 0, 2],
      },
      // กองทุน
      {
        columns: [
          { text: "เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน", fontSize: 7.5, width: "auto", noWrap: true },
          {
            stack: [
              { text: data.gpfAmount || "", fontSize: 7.5, alignment: "center" },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 38, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
            ],
            width: 38, margin: [2, 0, 2, 0],
          },
          { text: "บาท", fontSize: 7.5, width: "auto" },
          { text: "  กองทุนประกันสังคม", fontSize: 7.5, width: "auto", noWrap: true },
          {
            stack: [
              { text: data.ssoAmount || "", fontSize: 7.5, alignment: "center" },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 38, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
            ],
            width: 38, margin: [2, 0, 2, 0],
          },
          { text: "บาท", fontSize: 7.5, width: "auto" },
          { text: "  กองทุนสำรองเลี้ยงชีพ", fontSize: 7.5, width: "auto", noWrap: true },
          {
            stack: [
              { text: data.pvdAmount || "", fontSize: 7.5, alignment: "center" },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 38, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
            ],
            width: 38, margin: [2, 0, 2, 0],
          },
          { text: "บาท", fontSize: 7.5, width: "auto" },
        ],
        columnGap: 0,
        margin: [0, 0, 0, 2],
      },
      // ผู้จ่ายเงิน condition
      sectionBox([
        {
          columns: [
            { text: "ผู้จ่ายเงิน", bold: true, fontSize: 8, width: "auto" },
            { text: "", width: 10 },
            { columns: [cb(data.whtCondition === "1"), { text: " (1) หัก ณ ที่จ่าย", fontSize: 8, noWrap: true }], columnGap: 2, width: "auto" },
            { text: "  ", width: 8 },
            { columns: [cb(data.whtCondition === "2"), { text: " (2) ออกให้ตลอดไป", fontSize: 8, noWrap: true }], columnGap: 2, width: "auto" },
            { text: "  ", width: 8 },
            { columns: [cb(data.whtCondition === "3"), { text: " (3) ออกให้ครั้งเดียว", fontSize: 8, noWrap: true }], columnGap: 2, width: "auto" },
            { text: "  ", width: 8 },
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
                  { text: "ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร", fontSize: 6 },
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
                  widths: ["auto", "*", "auto", 78],
                  body: [
                    [
                      { text: "ลงชื่อ", border: noBorder, fontSize: 8 },
                      signatureImageB64
                        ? {
                            stack: [
                              { image: signatureImageB64, fit: [80, 26], alignment: "center", margin: [0, 0, 0, 0] },
                              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 80, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
                            ],
                            border: [false, false, false, false] as any,
                          }
                        : { text: "", border: [false, false, false, true] as any, fontSize: 8 },
                      { text: "ผู้จ่ายเงิน", border: noBorder, fontSize: 8 },
                      {
                        stack: [],
                        border: noBorder,
                        rowSpan: 3,
                      },
                    ],
                    [
                      { text: "(", border: noBorder, fontSize: 8, margin: [0, 2, -2, 0] },
                      {
                        stack: [
                          { text: data.createdBySignatureName || data.createdByName || data.payerName || "", fontSize: 8, alignment: "center" },
                          { canvas: [{ type: "line", x1: 0, y1: 0, x2: 80, y2: 0, lineWidth: 0.5, dash: { length: 2 } }] },
                        ],
                        border: noBorder,
                        margin: [0, 2, 0, 0],
                      },
                      { text: ")", border: noBorder, fontSize: 8, margin: [-2, 2, 0, 0] },
                      { text: "", border: noBorder },
                    ],
                    [
                      { text: "", border: noBorder },
                      {
                        text: `${dateParts.day || "   "} / ${dateParts.month || "           "} / ${dateParts.year || "      "}`,
                        alignment: "center", fontSize: 8, border: noBorder, margin: [0, 2, 0, 0],
                      },
                      { text: "", border: noBorder },
                      { text: "", border: noBorder },
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
        margin: [0, 2, 0, 2],
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
        margin: [0, 2, 0, 0],
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
