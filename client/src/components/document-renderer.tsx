import { useState, useEffect } from "react";
import { objectPathToUrl } from "@/lib/utils";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import {
  DOCUMENT_TYPES_FULL,
  getDocumentType,
  getDocTypeColor,
  parseCategoryColors,
  formatThaiDate,
  type DateEra,
} from "@shared/document-types";

interface DocSettings {
  logoUrl?: string | null;
  showLogo?: boolean;
  showSignature?: boolean;
  showTaxId?: boolean;
  showBranch?: boolean;
  showProductCode?: boolean;
  headerNote?: string | null;
  footerNote?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankName?: string | null;
  qrCodeUrl?: string | null;
  promptpayId?: string | null;
  promptpayType?: string | null;
  promptpayEnabled?: boolean;
  docTypeColors?: string | null;
  colorMode?: string | null;
  dateEra?: string | null;
  dateFormat?: string | null;
}

interface Company {
  name?: string;
  nameEn?: string | null;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string | null;
  branch?: string;
  lineId?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  website?: string | null;
  fax?: string | null;
}

interface RealLineItem {
  productCode?: string;
  productName?: string;
  description?: string;
  qty: number;
  unit?: string;
  unitPrice: number;
  discount: number | string;
  discountType?: string;
  total: number;
}

interface QuotationData {
  quotationNo?: string;
  orderNo?: string;
  invoiceNo?: string;
  taxInvoiceNo?: string;
  receiptNo?: string;
  quotationDate?: string | null;
  orderDate?: string | null;
  invoiceDate?: string | null;
  taxInvoiceDate?: string | null;
  receiptDate?: string | null;
  validUntil?: string | null;
  customerName?: string;
  customerAddress?: string;
  customerTaxId?: string;
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  branch?: string;
  creditDays?: string | number | null;
  refDoc?: string;
  salesperson?: string;
  notes?: string;
  paymentTerms?: string;
  subtotal?: string | number;
  vatAmount?: string | number;
  discountAmount?: string | number;
  totalAmount?: string | number;
  withholdingTax?: string | number;
  priceMode?: string;
  items?: RealLineItem[];
  customerResponse?: string | null;
  currencyCode?: string | null;
  exchangeRate?: string | number | null;
  sellerBranchId?: string | null;
  companyId?: number | null;
}

interface UserSignature {
  signatureUrl?: string | null;
  signatureName?: string | null;
  signatureTitle?: string | null;
}

interface SellerBranch {
  code?: string;
  name?: string;
  address?: string;
}

interface DocumentRendererProps {
  settings: DocSettings;
  company?: Company | null;
  quotation: QuotationData;
  documentType?: string;
  userSignature?: UserSignature | null;
  etaxEnabled?: boolean;
  sellerBranch?: SellerBranch | null;
}

function numberToThaiText(num: number): string {
  if (num === 0) return "ศูนย์บาทถ้วน";
  if (num < 0) return "ลบ" + numberToThaiText(Math.abs(num));

  const thaiDigits = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
  const placeNames = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

  const absNum = Math.abs(num);
  const intPart = Math.floor(absNum);
  const decStr = absNum.toFixed(2).split(".")[1];
  const decPart = parseInt(decStr, 10);

  function convertChunk(n: number): string {
    if (n === 0) return "";
    const s = n.toString();
    let out = "";
    const len = s.length;
    for (let i = 0; i < len; i++) {
      const digit = parseInt(s[i]);
      const place = len - i - 1;
      if (digit === 0) continue;
      if (place === 1 && digit === 1) {
        out += "สิบ";
      } else if (place === 1 && digit === 2) {
        out += "ยี่สิบ";
      } else if (place === 0 && digit === 1 && len > 1) {
        out += "เอ็ด";
      } else {
        out += thaiDigits[digit] + (placeNames[place] || "");
      }
    }
    return out;
  }

  function convertFull(n: number): string {
    if (n === 0) return "";
    if (n < 1000000) return convertChunk(n);
    const mil = Math.floor(n / 1000000);
    const rem = n % 1000000;
    let result = convertFull(mil) + "ล้าน";
    if (rem > 0) result += convertChunk(rem);
    return result;
  }

  let result = "";
  if (intPart > 0) {
    result += convertFull(intPart) + "บาท";
  } else {
    result += "ศูนย์บาท";
  }
  if (decPart > 0) {
    result += convertChunk(decPart) + "สตางค์";
  } else {
    result += "ถ้วน";
  }
  return result;
}

function fmtDate(val: string | null | undefined, era?: string, dateFormat?: string | null): string {
  if (!val) return "-";
  const m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  let dd: string, mm: string, ceYear: number;
  if (m) {
    ceYear = Number(m[1]);
    mm = m[2];
    dd = m[3];
  } else {
    const d = new Date(val);
    dd = d.getDate().toString().padStart(2, "0");
    mm = (d.getMonth() + 1).toString().padStart(2, "0");
    ceYear = d.getFullYear();
  }
  const yyyy = String(era === "BE" ? ceYear + 543 : ceYear);
  const fmt = dateFormat || "DD/MM/YYYY";
  const sep = fmt.includes("/") ? "/" : fmt.includes("-") ? "-" : ".";
  const parts = fmt.split(/[/\-\.]/);
  return parts.map(p => {
    const pu = p.toUpperCase();
    if (pu.startsWith("D")) return dd;
    if (pu.startsWith("M")) return mm;
    if (pu.startsWith("Y")) return yyyy;
    return p;
  }).join(sep);
}

const formatNumber = (n: number | string) => {
  const v = typeof n === "string" ? parseFloat(n) || 0 : n;
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function DocumentRenderer({
  settings,
  company,
  quotation,
  documentType = "quotation",
  userSignature,
  etaxEnabled,
  sellerBranch: sellerBranchProp,
}: DocumentRendererProps) {
  const [fetchedBranch, setFetchedBranch] = useState<SellerBranch | null>(null);

  useEffect(() => {
    const branchId = quotation?.sellerBranchId;
    const cid = quotation?.companyId;
    if (!branchId || !cid || sellerBranchProp) { setFetchedBranch(null); return; }
    (async () => {
      try {
        const res = await fetch(`/api/branches?companyId=${cid}`, { credentials: "include" });
        if (!res.ok) return;
        const branches = await res.json();
        const found = branches.find((b: any) => b.code === branchId);
        if (found) setFetchedBranch({ code: found.code, name: found.name, address: found.address });
      } catch {}
    })();
  }, [quotation?.sellerBranchId, quotation?.companyId, sellerBranchProp]);

  const sellerBranch = sellerBranchProp || fetchedBranch;

  const docInfo = getDocumentType(documentType) || DOCUMENT_TYPES_FULL[0];
  const categoryColors = parseCategoryColors(settings.docTypeColors);
  const theme = getDocTypeColor(documentType, categoryColors, settings.colorMode || "color");
  const primary = theme.primary;
  const accent = theme.accent;

  const companyName = company?.name || "บริษัท";
  const companyAddress = (sellerBranch?.address) || company?.address || "";
  const companyPhone = company?.phone || "";
  const companyTaxId = company?.taxId || "";
  const sellerBranchCode = sellerBranch?.code || "";
  const sellerBranchName = sellerBranch?.name || "";
  const companyBranch = company?.branch || "สำนักงานใหญ่";

  const isBranchHQ = sellerBranch
    ? (!sellerBranchCode || sellerBranchCode === "00000")
    : (!companyBranch || companyBranch === "สำนักงานใหญ่" || companyBranch === "00000");
  const branchDisplay = isBranchHQ
    ? "สำนักงานใหญ่"
    : sellerBranch
      ? `สาขาที่ ${sellerBranchCode}${sellerBranchName ? ` ${sellerBranchName}` : ""}`
      : `สาขาที่ ${companyBranch}`;

  const isTaxDoc = documentType === "tax_invoice" || documentType === "receipt" || documentType === "tax_invoice_receipt";
  const era: DateEra = isTaxDoc ? "BE" : ((settings.dateEra as DateEra) || "CE");

  const totalAmount = typeof quotation.totalAmount === "string"
    ? parseFloat(quotation.totalAmount) || 0
    : (quotation.totalAmount || 0);

  const withholdingTax = parseFloat(String(quotation.withholdingTax || "0"));

  const items = quotation.items || [];
  const subtotal = parseFloat(String(quotation.subtotal || "0"));
  const discountAmount = parseFloat(String(quotation.discountAmount || "0"));
  const vatAmount = parseFloat(String(quotation.vatAmount || "0"));
  const priceMode = quotation.priceMode || "excluded";
  const valueBeforeVat = priceMode === "included"
    ? (subtotal - discountAmount - vatAmount)
    : (subtotal - discountAmount);
  const netTotal = valueBeforeVat + vatAmount - withholdingTax;

  const [promptpayQrUrl, setPromptpayQrUrl] = useState<string | null>(null);
  useEffect(() => {
    if (settings.qrCodeUrl || !settings.promptpayEnabled || !settings.promptpayId) {
      setPromptpayQrUrl(null);
      return;
    }
    const id = settings.promptpayId.replace(/[-\s]/g, "");
    try {
      const payload = generatePayload(id, { amount: netTotal > 0 ? netTotal : undefined });
      QRCode.toDataURL(payload, {
        width: 200,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
      }).then((url: string) => setPromptpayQrUrl(url))
        .catch(() => setPromptpayQrUrl(null));
    } catch {
      setPromptpayQrUrl(null);
    }
  }, [settings.promptpayEnabled, settings.promptpayId, settings.qrCodeUrl, netTotal]);

  const minRows = 5;
  const emptyRows = Math.max(0, minRows - items.length);

  const docNo = quotation.quotationNo || quotation.orderNo || quotation.invoiceNo || quotation.taxInvoiceNo || quotation.receiptNo || "";
  const docDate = quotation.quotationDate || quotation.orderDate || quotation.invoiceDate || quotation.taxInvoiceDate || quotation.receiptDate || null;

  const currencyCode = quotation.currencyCode || "THB";
  const exchangeRate = parseFloat(String(quotation.exchangeRate || "1"));
  const isForeignCurrency = currencyCode !== "THB";

  const custBranch = quotation.branch;
  const isCustHQ = !custBranch || custBranch === "สำนักงานใหญ่" || custBranch === "00000";
  const custBranchDisplay = isCustHQ ? "สำนักงานใหญ่" : `สาขาที่ ${custBranch}${quotation.branchName ? ` ${quotation.branchName}` : ""}`;

  return (
    <div
      className="bg-white border rounded-lg shadow-sm overflow-hidden print:!border-0 print:!shadow-none print:!rounded-none min-w-[640px]"
      style={{ fontSize: "11px", lineHeight: 1.5, fontFamily: "'Niramit', 'Sarabun', sans-serif" }}
      data-testid="document-renderer"
    >
      <div className="py-5 px-8 flex flex-col" style={{ minHeight: "calc(297mm - 1.5px - 25mm)" }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            {(settings.showLogo !== false) && settings.logoUrl && (
              <div className="w-20 h-20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img src={objectPathToUrl(settings.logoUrl)} alt="Logo" className="max-w-full max-h-full object-contain" style={{ imageRendering: "auto" }} />
              </div>
            )}
            <div className="text-left">
              <div className="font-bold text-sm text-gray-800">{companyName}</div>
              {companyAddress && <div className="text-[10px] text-gray-600 mt-0.5 max-w-[360px]">{companyAddress}</div>}
              {(settings.showTaxId !== false) && companyTaxId && (
                <div className="text-[10px] text-gray-600">
                  เลขประจำตัวผู้เสียภาษี: {companyTaxId}
                </div>
              )}
              {(settings.showBranch !== false) && (
                <div className="text-[10px] font-medium" style={{ color: primary }}>
                  {branchDisplay}
                </div>
              )}
              {(companyPhone || company?.email) && (
                <div className="text-[10px] text-gray-600 flex flex-wrap gap-x-3">
                  {companyPhone && <span>โทร. {companyPhone}</span>}
                  {company?.email && <span>อีเมล: {company.email}</span>}
                </div>
              )}
              {(company?.lineId || company?.facebook) && (
                <div className="text-[10px] text-gray-600 flex flex-wrap gap-x-3">
                  {company?.lineId && <span>LINE: {company.lineId}</span>}
                  {company?.facebook && <span>Facebook: {company.facebook}</span>}
                </div>
              )}
              {company?.instagram && <div className="text-[10px] text-gray-600">Instagram: {company.instagram}</div>}
              {company?.website && <div className="text-[10px] text-gray-600">เว็บไซต์: {company.website}</div>}
            </div>
          </div>
          <div className="text-right">
            <div className="flex justify-end w-full mb-0.5">
              <div
                className="px-3 py-1 rounded-md text-right"
                style={{ backgroundColor: theme.bg }}
              >
                <div className="font-bold text-base" style={{ color: primary }}>{docInfo.label}</div>
                <div className="text-[10px] text-gray-500">{docInfo.labelEn.toUpperCase()}</div>
              </div>
            </div>
            <div className="mt-2 text-[10px]">
              <div>เลขที่: <span className="font-semibold" style={{ color: accent }}>{docNo}</span></div>
              <div>วันที่: {fmtDate(docDate, era, settings.dateFormat)}</div>
              {quotation.validUntil && <div>กำหนดส่ง: {fmtDate(quotation.validUntil, era, settings.dateFormat)}</div>}
              {quotation.creditDays != null && Number(quotation.creditDays) > 0 && (
                <div>เครดิต: {quotation.creditDays} วัน</div>
              )}
              {isForeignCurrency && (
                <div className="mt-1 text-[9px] font-semibold" style={{ color: accent }}>
                  สกุลเงิน: {currencyCode} (อัตรา: {exchangeRate.toFixed(2)})
                </div>
              )}
              {quotation.refDoc && (
                <div className="mt-1 text-[9px]" style={{ color: primary }}>
                  อ้างอิง: {quotation.refDoc}
                </div>
              )}
            </div>
          </div>
        </div>

        {settings.headerNote && (
          <div className="text-[10px] text-gray-500 mb-3 italic">{settings.headerNote}</div>
        )}

        <div className="flex gap-3 mb-4">
          <div className="flex-1 border rounded p-2.5 text-left" style={{ borderColor: theme.light, backgroundColor: theme.bg }}>
            <div className="text-[10px] font-medium mb-1" style={{ color: primary }}>ลูกค้า / Customer</div>
            <div className="font-medium text-xs text-gray-800">{quotation.customerName || "-"}</div>
            {quotation.customerAddress && <div className="text-[10px] text-gray-600">{quotation.customerAddress}</div>}
            {quotation.customerTaxId && <div className="text-[10px] text-gray-600">เลขประจำตัวผู้เสียภาษี: {quotation.customerTaxId}</div>}
            <div className="text-[10px] font-medium" style={{ color: primary }}>{custBranchDisplay}</div>
            {quotation.contactPerson && <div className="text-[10px] text-gray-600">ผู้ติดต่อ: {quotation.contactPerson}</div>}
            {(quotation.contactPhone || quotation.contactEmail) && (
              <div className="text-[10px] text-gray-600">
                {quotation.contactPhone && <span>โทร: {quotation.contactPhone}</span>}
                {quotation.contactPhone && quotation.contactEmail && <span className="mx-2">|</span>}
                {quotation.contactEmail && <span>อีเมล: {quotation.contactEmail}</span>}
              </div>
            )}
            {quotation.salesperson && <div className="text-[10px] text-gray-600">พนักงานขาย: {quotation.salesperson}</div>}
          </div>

          {(settings.bankName || settings.qrCodeUrl || promptpayQrUrl) && (
            <div className="w-48 border rounded p-2.5 flex flex-col items-center justify-center" style={{ borderColor: theme.light, backgroundColor: theme.bg }} data-print-section="bank-info-side">
              {(settings.qrCodeUrl || promptpayQrUrl) && (
                <div className="w-20 h-20 border rounded overflow-hidden flex items-center justify-center bg-white mb-1.5">
                  <img src={objectPathToUrl(settings.qrCodeUrl) || promptpayQrUrl!} alt="QR Code" className="max-w-full max-h-full object-contain" />
                </div>
              )}
              <div className="text-[9px] text-gray-600 text-center w-full">
                <div className="font-medium text-gray-700 mb-0.5" style={{ color: primary }}>ข้อมูลชำระเงิน</div>
                {promptpayQrUrl && !settings.qrCodeUrl && (
                  <div className="text-[#03c9d7] font-medium">พร้อมเพย์ (PromptPay)</div>
                )}
                {settings.bankName && <div>ธนาคาร: {settings.bankName}</div>}
                {settings.bankAccountNumber && <div>เลขที่บัญชี: {settings.bankAccountNumber}</div>}
                {settings.bankAccountName && <div>ชื่อบัญชี: {settings.bankAccountName}</div>}

                {netTotal > 0 && (
                  <div className="font-semibold text-[10px] mt-1" style={{ color: primary }}>จำนวนเงิน: {formatNumber(netTotal)} บาท</div>
                )}
              </div>
            </div>
          )}
        </div>

        <table className="w-full border-collapse mb-4" style={{ fontFamily: "'Niramit', 'Sarabun', sans-serif", fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr style={{ backgroundColor: theme.bg }}>
              <th className="text-center py-1.5 px-1 text-[10px] font-semibold border-b w-8" style={{ color: accent, borderColor: theme.light }}>
                <div>ลำดับ</div>
                <div className="text-[8px] font-normal opacity-70">No.</div>
              </th>
              {(settings.showProductCode !== false) && (
              <th className="text-left py-1.5 px-2 text-[10px] font-semibold border-b w-16" style={{ color: accent, borderColor: theme.light }}>
                <div>รหัส</div>
                <div className="text-[8px] font-normal opacity-70">Code</div>
              </th>
              )}
              <th className="text-left py-1.5 px-2 text-[10px] font-semibold border-b" style={{ color: accent, borderColor: theme.light }}>
                <div>รายละเอียด</div>
                <div className="text-[8px] font-normal opacity-70">Description</div>
              </th>
              <th className="text-center py-1.5 px-2 text-[10px] font-semibold border-b w-12" style={{ color: accent, borderColor: theme.light }}>
                <div>จำนวน</div>
                <div className="text-[8px] font-normal opacity-70">Qty</div>
              </th>
              <th className="text-center py-1.5 px-1 text-[10px] font-semibold border-b w-10" style={{ color: accent, borderColor: theme.light }}>
                <div>หน่วย</div>
                <div className="text-[8px] font-normal opacity-70">Unit</div>
              </th>
              <th className="text-right py-1.5 px-2 text-[10px] font-semibold border-b w-20" style={{ color: accent, borderColor: theme.light }}>
                <div>ราคาต่อหน่วย</div>
                <div className="text-[8px] font-normal opacity-70">Unit Price</div>
              </th>
              <th className="text-right py-1.5 px-2 text-[10px] font-semibold border-b w-20" style={{ color: accent, borderColor: theme.light }}>
                <div>ส่วนลด</div>
                <div className="text-[8px] font-normal opacity-70">Discount</div>
              </th>
              <th className="text-right py-1.5 px-2 text-[10px] font-semibold border-b w-20" style={{ color: accent, borderColor: theme.light }}>
                <div>มูลค่า</div>
                <div className="text-[8px] font-normal opacity-70">Amount</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const vatType = (item as any).vatType || "vat7";
              const isIncluded = priceMode === "included" && vatType === "vat7";
              const displayUnitPrice = isIncluded ? Math.round((item.unitPrice * 100 / 107) * 100) / 100 : item.unitPrice;
              const displayTotal = isIncluded ? Math.round((item.total * 100 / 107) * 100) / 100 : item.total;
              const displayDiscount = (() => {
                const dv = parseFloat(String(item.discount)) || 0;
                if (dv === 0) return formatNumber(0);
                if (item.discountType === "percent") return `${parseFloat(dv.toFixed(2))}%`;
                const ddv = isIncluded ? Math.round((dv * 100 / 107) * 100) / 100 : dv;
                return formatNumber(ddv);
              })();
              return (
              <tr key={i} className="border-b border-gray-100">
                <td className="py-1.5 px-1 text-[10px] text-center text-gray-500">{i + 1}</td>
                {(settings.showProductCode !== false) && <td className="py-1.5 px-2 text-[10px] text-gray-600">{item.productCode || "-"}</td>}
                <td className="py-1.5 px-2 text-[10px]">
                  <div>{item.productName}</div>
                  {item.description && <div className="text-[9px] text-gray-400">{item.description}</div>}
                </td>
                <td className="py-1.5 px-2 text-[10px] text-center">{(() => { const n = Number(item.qty); if (isNaN(n)) return "0"; return n % 1 === 0 ? String(Math.round(n)) : parseFloat(n.toFixed(2)).toString(); })()}</td>
                <td className="py-1.5 px-1 text-[10px] text-center">{item.unit || "ชิ้น"}</td>
                <td className="py-1.5 px-2 text-[10px] text-right">{formatNumber(displayUnitPrice)}</td>
                <td className="py-1.5 px-2 text-[10px] text-right">{displayDiscount}</td>
                <td className="py-1.5 px-2 text-[10px] text-right">{formatNumber(displayTotal)}</td>
              </tr>
            );})}
            {Array.from({ length: emptyRows }).map((_, i) => (
              <tr key={`empty-${i}`} className="border-b border-gray-100">
                <td className="py-1.5 px-1 text-[10px]">&nbsp;</td>
                {(settings.showProductCode !== false) && <td className="py-1.5 px-2 text-[10px]">&nbsp;</td>}
                <td className="py-1.5 px-2 text-[10px]">&nbsp;</td>
                <td className="py-1.5 px-2 text-[10px]">&nbsp;</td>
                <td className="py-1.5 px-1 text-[10px]">&nbsp;</td>
                <td className="py-1.5 px-2 text-[10px]">&nbsp;</td>
                <td className="py-1.5 px-2 text-[10px]">&nbsp;</td>
                <td className="py-1.5 px-2 text-[10px]">&nbsp;</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex gap-4 mb-4" data-print-section="summary">
          <div className="flex-1">
            <div className="border rounded p-2.5 mb-3" style={{ borderColor: theme.light, backgroundColor: theme.bg }}>
              <div className="text-[10px] font-semibold text-center text-gray-700">
                {isForeignCurrency
                  ? `${formatNumber(netTotal)} ${currencyCode}`
                  : numberToThaiText(netTotal)}
              </div>
            </div>
            {quotation.notes && (
              <div className="text-[10px] text-gray-500 whitespace-pre-line mb-2">{quotation.notes}</div>
            )}
            {quotation.paymentTerms && (
              <div className="text-[10px] text-gray-500 whitespace-pre-line mb-2">
                <span className="font-medium">เงื่อนไขการชำระ:</span> {quotation.paymentTerms}
              </div>
            )}
            {settings.footerNote && (
              <div className="text-[10px] text-gray-500 whitespace-pre-line">{settings.footerNote}</div>
            )}
          </div>

          <div className="w-52">
            <div className="flex justify-between text-[10px] py-1 border-b border-gray-100">
              <div>
                <div>ยอดรวม</div>
                <div className="text-[8px] text-gray-400">Sub Total</div>
              </div>
              <span className="self-center">{formatNumber(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-[10px] py-1 border-b border-gray-100">
                <div>
                  <div>ส่วนลดพิเศษ</div>
                  <div className="text-[8px] text-gray-400">Special Discount</div>
                </div>
                <span className="self-center">{formatNumber(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[10px] py-1 border-b border-gray-100">
              <div>
                <div>มูลค่าก่อนภาษี</div>
                <div className="text-[8px] text-gray-400">Value Before VAT</div>
              </div>
              <span className="self-center">{formatNumber(valueBeforeVat)}</span>
            </div>
            <div className="flex justify-between text-[10px] py-1 border-b border-gray-100">
              <div>
                <div>ภาษีมูลค่าเพิ่ม 7%</div>
                <div className="text-[8px] text-gray-400">Value Added Tax</div>
              </div>
              <span className="self-center">{formatNumber(vatAmount)}</span>
            </div>
            {withholdingTax > 0 && (
              <div className="flex justify-between text-[10px] py-1 border-b border-gray-100">
                <div>
                  <div>ภาษีหัก ณ ที่จ่าย</div>
                  <div className="text-[8px] text-gray-400">Withholding Tax</div>
                </div>
                <span className="self-center">{formatNumber(withholdingTax)}</span>
              </div>
            )}
            <div
              className="flex justify-between text-xs font-bold py-2 mt-1 rounded px-2"
              style={{ backgroundColor: primary, color: "white" }}
            >
              <div>
                <div>ยอดเงินสุทธิ {isForeignCurrency ? `(${currencyCode})` : ""}</div>
                <div className="text-[8px] font-normal opacity-80">Grand Total</div>
              </div>
              <span className="self-center">{formatNumber(netTotal)}</span>
            </div>
          </div>
        </div>


        {(settings.showSignature !== false) && (
          <div className="flex justify-between mt-4 pt-4" data-print-section="signature">
            <div className="text-center w-40">
              <div className="h-10 mb-1" />
              <div className="border-t border-gray-400 pt-1">
                <div className="text-[10px] font-medium">ผู้อนุมัติ / ลูกค้า</div>
                <div className="text-[9px] text-gray-500">Approved by</div>
                <div className="text-[9px] text-gray-500">วันที่ ____/____/____</div>
              </div>
            </div>
            <div className="text-center w-40">
              {userSignature?.signatureUrl ? (
                <img src={objectPathToUrl(userSignature.signatureUrl)} alt="Signature" className="h-10 mx-auto mb-1 object-contain" />
              ) : (
                <div className="h-10 mb-1" />
              )}
              <div className="border-t border-gray-400 pt-1">
                {userSignature?.signatureName && (
                  <div className="text-[10px] font-medium">{userSignature.signatureName}</div>
                )}
                <div className="text-[10px] font-medium text-gray-500">
                  {documentType === "quotation" ? "ผู้เสนอราคา" :
                   documentType === "receipt" ? "ผู้รับเงิน" :
                   "ผู้ออกเอกสาร"}
                </div>
                <div className="text-[9px] text-gray-500">
                  {documentType === "quotation" ? "Salesperson" :
                   documentType === "receipt" ? "Cashier" :
                   "Authorized"}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-grow" />

        <div style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
          <div className="mt-4 pt-2 border-t-2 flex items-center justify-between -mx-8 px-8" style={{ borderColor: primary }} data-print-section="footer">
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 h-4 rounded flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: primary, fontSize: "7px" }}
              >
                ET
              </div>
              <span className="text-[8px] text-gray-400 tracking-wide">
                Powered by <span className="font-semibold" style={{ color: primary }}>E-Tax Center</span>
              </span>
            </div>
            <span className="text-[8px] text-gray-300">{docNo}</span>
          </div>

          {etaxEnabled && quotation.etaxSentAt && (documentType === "tax_invoice" || documentType === "receipt" || documentType === "tax_invoice_receipt") && (
            <div className="mt-2 flex justify-end" data-print-section="etax-stamp">
              <div className="flex items-center gap-2.5 px-3 py-1.5">
                <img
                  src="/etax-stamp.png"
                  alt="e-Tax Invoice by Email"
                  className="h-7 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div className="text-[8px] leading-snug text-gray-500">
                  <div>ใบกำกับภาษีอิเล็กทรอนิกส์นี้ได้จัดทำและส่งข้อมูลให้แก่</div>
                  <div>กรมสรรพากรด้วยวิธีการทางอิเล็กทรอนิกส์</div>
                </div>
              </div>
            </div>
          )}
        </div>
        <style>{`
          @media print {
            @page {
              @bottom-right {
                content: counter(page) " / " counter(pages);
                font-size: 8pt;
                color: #999;
              }
            }
          }
        `}</style>
      </div>
    </div>
  );
}
