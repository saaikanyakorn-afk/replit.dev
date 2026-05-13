import { type Request, type Response, type NextFunction } from "express";
import { db } from "./db";
import { quotations, invoices, taxInvoices, receipts, salesOrders, companies, whiteLabelSettings, contracts, withholdingTaxCerts, salesCreditNotes, billingNotes } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import sharp from "sharp";

const BOT_RE = /bot|crawler|spider|preview|facebookexternalhit|twitterbot|slackbot|facebook|twitter|telegram|slack|whatsapp|discord|linkedin|pinterest/i;

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const DOC_TYPE_COLORS: Record<string, { bg: string; accent: string; icon: string }> = {
  quote:         { bg: "#fef3c7", accent: "#d97706", icon: "QO" },
  invoice:       { bg: "#d1fae5", accent: "#059669", icon: "IV" },
  "tax-invoice": { bg: "#dbeafe", accent: "#2563eb", icon: "TX" },
  receipt:       { bg: "#e0f2fe", accent: "#0284c7", icon: "RC" },
  order:         { bg: "#fce7f3", accent: "#db2777", icon: "SO" },
  contract:      { bg: "#ede9fe", accent: "#7c3aed", icon: "CT" },
  "wht-cert":    { bg: "#fdf2f8", accent: "#9333ea", icon: "50" },
  "credit-note": { bg: "#fff7ed", accent: "#ea580c", icon: "CN" },
  "billing-note":{ bg: "#f0fdf4", accent: "#16a34a", icon: "BN" },
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function generateOgSvg(opts: {
  docLabel: string;
  docNo: string;
  companyName: string;
  customerName: string;
  amount: string;
  amountLabel: string;
  docType: string;
}): string {
  const colors = DOC_TYPE_COLORS[opts.docType] || DOC_TYPE_COLORS.quote;
  const companyDisplay = truncate(opts.companyName, 36);
  const customerDisplay = opts.customerName ? truncate(opts.customerName, 34) : "";
  const docNoDisplay = truncate(opts.docNo, 28);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="0" y="0" width="1200" height="630" fill="${escXml(colors.bg)}" opacity="0.35"/>

  <rect x="0" y="0" width="1200" height="10" fill="${escXml(colors.accent)}"/>

  <rect x="60" y="55" width="80" height="80" rx="16" fill="${escXml(colors.accent)}"/>
  <text x="100" y="108" font-family="Arial,Helvetica,sans-serif" font-size="32" fill="#ffffff" font-weight="700" text-anchor="middle">${escXml(colors.icon)}</text>

  <text x="160" y="88" font-family="Arial,Helvetica,sans-serif" font-size="22" fill="#9ca3af" font-weight="400">E-Tax Center</text>
  <text x="160" y="122" font-family="Arial,Helvetica,sans-serif" font-size="36" fill="${escXml(colors.accent)}" font-weight="700">${escXml(opts.docLabel)}</text>

  <line x1="60" y1="160" x2="1140" y2="160" stroke="${escXml(colors.accent)}" stroke-width="2" opacity="0.2"/>

  <text x="80" y="220" font-family="Arial,Helvetica,sans-serif" font-size="52" fill="#111827" font-weight="700">${escXml(docNoDisplay)}</text>

  <rect x="80" y="260" width="500" height="1" fill="#e5e7eb"/>

  <text x="80" y="310" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="#9ca3af" font-weight="400">FROM</text>
  <text x="80" y="348" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="#374151" font-weight="600">${escXml(companyDisplay)}</text>

  ${customerDisplay ? `
  <text x="80" y="410" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="#9ca3af" font-weight="400">TO</text>
  <text x="80" y="448" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="#374151" font-weight="600">${escXml(customerDisplay)}</text>` : ""}

  ${opts.amount ? `
  <rect x="700" y="260" width="440" height="140" rx="20" fill="${escXml(colors.accent)}" opacity="0.08"/>
  <rect x="700" y="260" width="440" height="140" rx="20" fill="none" stroke="${escXml(colors.accent)}" stroke-width="2" opacity="0.3"/>
  <text x="920" y="310" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="${escXml(colors.accent)}" font-weight="500" text-anchor="middle">${escXml(opts.amountLabel)}</text>
  <text x="920" y="370" font-family="Arial,Helvetica,sans-serif" font-size="48" fill="${escXml(colors.accent)}" font-weight="700" text-anchor="middle">B${escXml(opts.amount)}</text>` : ""}

  <rect x="0" y="570" width="1200" height="60" fill="${escXml(colors.accent)}" opacity="0.08"/>
  <text x="600" y="608" font-family="Arial,Helvetica,sans-serif" font-size="20" fill="#9ca3af" text-anchor="middle">Digital Accounting Platform</text>
</svg>`;
}

async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function sendOgHtml(res: Response, opts: { title: string; desc: string; image: string; url: string }) {
  res.status(200).set({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  }).end(
`<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(opts.title)}</title>
<meta property="og:title" content="${escHtml(opts.title)}" />
<meta property="og:description" content="${escHtml(opts.desc)}" />
<meta property="og:type" content="website" />
<meta property="og:image" content="${escHtml(opts.image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${escHtml(opts.url)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escHtml(opts.title)}" />
<meta name="twitter:description" content="${escHtml(opts.desc)}" />
<meta name="twitter:image" content="${escHtml(opts.image)}" />
</head><body><script>window.location.href="${escHtml(opts.url)}";</script></body></html>`);
}

const DOC_TYPE_LABELS: Record<string, string> = {
  quote: "QUOTATION",
  invoice: "INVOICE",
  "tax-invoice": "TAX INVOICE",
  receipt: "RECEIPT",
  order: "SALES ORDER",
  contract: "SERVICE CONTRACT",
  "wht-cert": "WHT 50 THAWI",
  "credit-note": "CREDIT NOTE",
  "billing-note": "BILLING NOTE",
};

const DOC_TYPE_LABELS_TH: Record<string, string> = {
  quote: "ใบเสนอราคา",
  invoice: "ใบแจ้งหนี้",
  "tax-invoice": "ใบกำกับภาษี",
  receipt: "ใบเสร็จรับเงิน",
  order: "ใบสั่งขาย",
  contract: "สัญญาบริการ",
  "wht-cert": "หนังสือรับรองหักภาษี ณ ที่จ่าย",
  "credit-note": "ใบลดหนี้",
  "billing-note": "ใบวางบิล",
};

async function lookupDoc(docType: string, token: string) {
  let docNo = "";
  let customerName = "";
  let total = "";
  let companyId = 0;
  let amountLabel = "TOTAL";

  switch (docType) {
    case "quote": {
      const [qo] = await db.select().from(quotations).where(eq(quotations.shareToken, token));
      if (qo) { docNo = qo.quotationNo || ""; customerName = (qo as any).customerName || ""; total = (qo as any).grandTotal; companyId = qo.companyId; }
      break;
    }
    case "invoice": {
      const [iv] = await db.select().from(invoices).where(eq(invoices.shareToken, token));
      if (iv) { docNo = iv.invoiceNo || ""; customerName = (iv as any).customerName || ""; total = (iv as any).grandTotal || (iv as any).totalAmount; companyId = iv.companyId; }
      break;
    }
    case "tax-invoice": {
      const [tiv] = await db.select().from(taxInvoices).where(eq(taxInvoices.shareToken, token));
      if (tiv) { docNo = tiv.taxInvoiceNo || ""; customerName = (tiv as any).customerName || ""; total = (tiv as any).grandTotal || (tiv as any).totalAmount; companyId = tiv.companyId; }
      break;
    }
    case "receipt": {
      const [re] = await db.select().from(receipts).where(eq(receipts.shareToken, token));
      if (re) { docNo = re.receiptNo || ""; customerName = (re as any).customerName || ""; total = (re as any).grandTotal || (re as any).totalAmount; companyId = re.companyId; }
      break;
    }
    case "order": {
      const [so] = await db.select().from(salesOrders).where(eq(salesOrders.shareToken, token));
      if (so) { docNo = so.orderNo || ""; customerName = (so as any).customerName || ""; total = (so as any).grandTotal || (so as any).totalAmount; companyId = so.companyId; }
      break;
    }
    case "contract": {
      const [ct] = await db.select().from(contracts).where(eq(contracts.publicToken, token));
      if (ct) { docNo = ct.contractNo || ""; customerName = ct.clientName || ""; total = ct.serviceFee ? String(ct.serviceFee) : ""; companyId = ct.companyId; amountLabel = "FEE/MONTH"; }
      break;
    }
    case "wht-cert": {
      const [wht] = await db.select().from(withholdingTaxCerts).where(eq(withholdingTaxCerts.shareToken, token));
      if (wht) { docNo = wht.certNo || ""; customerName = (wht as any).payeeName || ""; total = (wht as any).taxWithheld || ""; companyId = wht.companyId; amountLabel = "ภาษีที่หัก"; }
      break;
    }
    case "credit-note": {
      try {
        const safeToken = token.replace(/'/g, "''");
        const rows = await db.execute(sql.raw(`SELECT credit_note_no, customer_name, total_amount, company_id FROM sales_credit_notes WHERE share_token = '${safeToken}' LIMIT 1`));
        const cn = (rows as any).rows?.[0];
        if (cn) { docNo = cn.credit_note_no || ""; customerName = cn.customer_name || ""; total = cn.total_amount || ""; companyId = Number(cn.company_id); amountLabel = "ยอดลดหนี้"; }
      } catch {}
      break;
    }
    case "billing-note": {
      try {
        const safeToken = token.replace(/'/g, "''");
        const rows = await db.execute(sql.raw(`SELECT billing_no, customer_name, total_amount, company_id FROM billing_notes WHERE share_token = '${safeToken}' LIMIT 1`));
        const bn = (rows as any).rows?.[0];
        if (bn) { docNo = bn.billing_no || ""; customerName = bn.customer_name || ""; total = bn.total_amount || ""; companyId = Number(bn.company_id); amountLabel = "ยอดวางบิล"; }
      } catch {}
      break;
    }
  }

  let companyName = "E-Tax Center";
  if (companyId) {
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (company) companyName = company.name;
  }

  const fmtTotal = total ? Number(total).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "";

  return { docNo, customerName, companyName, fmtTotal, companyId, amountLabel };
}

export function registerOgImageRoute(app: any) {
  app.get("/api/og-image/:docType/:token.png", async (req: Request, res: Response) => {
    const { docType, token } = req.params;
    const label = DOC_TYPE_LABELS[docType] || "DOCUMENT";

    try {
      const info = await lookupDoc(docType, token);

      const svg = generateOgSvg({
        docLabel: label,
        docNo: info.docNo,
        companyName: info.companyName,
        customerName: info.customerName,
        amount: info.fmtTotal,
        amountLabel: info.amountLabel,
        docType,
      });

      const png = await svgToPng(svg);
      res.set({ "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" }).end(png);
    } catch (err) {
      const svg = generateOgSvg({
        docLabel: label,
        docNo: "",
        companyName: "E-Tax Center",
        customerName: "",
        amount: "",
        amountLabel: "TOTAL",
        docType,
      });
      try {
        const png = await svgToPng(svg);
        res.set({ "Content-Type": "image/png" }).end(png);
      } catch {
        res.status(500).end();
      }
    }
  });
}

export async function shareOgHandler(req: Request, res: Response, next: NextFunction) {
  const ua = req.headers["user-agent"] || "";
  if (!BOT_RE.test(ua)) return next();

  const host = req.get("host") || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const baseUrl = `${proto}://${host}`;
  const fullUrl = baseUrl + req.originalUrl;
  const docType = req.params.docType || "quote";
  const token = req.params.token;
  const labelTh = DOC_TYPE_LABELS_TH[docType] || "เอกสาร";
  const ogImage = `${baseUrl}/api/og-image/${docType}/${token}.png`;

  try {
    const info = await lookupDoc(docType, token);

    if (!info.docNo) {
      return sendOgHtml(res, { title: `${labelTh} - E-Tax Center`, desc: `ดูรายละเอียด${labelTh}ออนไลน์`, image: ogImage, url: fullUrl });
    }

    const title = `${labelTh} ${info.docNo} - ${info.companyName}`;
    const desc = `${info.companyName}${info.customerName ? ` → ${info.customerName}` : ""}${info.fmtTotal ? ` | ยอดรวม ฿${info.fmtTotal}` : ""}`;

    sendOgHtml(res, { title, desc, image: ogImage, url: fullUrl });
  } catch {
    sendOgHtml(res, { title: `${labelTh} - E-Tax Center`, desc: `ดูรายละเอียด${labelTh}ออนไลน์`, image: ogImage, url: fullUrl });
  }
}

function sendShareDocHtml(res: Response, opts: {
  pdfUrl: string; ogImage: string; title: string; desc: string; fullUrl: string;
}) {
  const { pdfUrl, ogImage, title, desc, fullUrl } = opts;
  res.status(200).set({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }).end(
`<!DOCTYPE html><html lang="th"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - E-Tax Center</title>
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${desc}" />
<meta property="og:type" content="website" />
<meta property="og:image" content="${escHtml(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${escHtml(fullUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${desc}" />
<meta name="twitter:image" content="${escHtml(ogImage)}" />
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{display:flex;flex-direction:column;background:#334155;font-family:sans-serif}
.bar{flex-shrink:0;position:sticky;top:0;z-index:50;background:#1e293b;border-bottom:1px solid #475569;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.bar-left{display:flex;align-items:center;gap:8px;min-width:0;color:#fff;font-size:14px;font-weight:500;overflow:hidden}
.bar-left svg{flex-shrink:0;color:#22c55e}
.bar-left span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bar-right{display:flex;gap:8px;flex-shrink:0}
.btn{display:flex;align-items:center;gap:6px;padding:6px 12px;border:none;border-radius:6px;font-size:12px;cursor:pointer;text-decoration:none;font-family:sans-serif}
.btn-ghost{background:transparent;color:#94a3b8}.btn-ghost:hover{background:#334155;color:#fff}
.btn-primary{background:#16a34a;color:#fff}.btn-primary:hover{opacity:.9}
#content{flex:1}
embed{width:100%;height:calc(100vh - 48px);border:0;display:block}
.mobile-wrap{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:32px;text-align:center}
.mobile-icon{font-size:64px;opacity:.4}
.mobile-title{color:#fff;font-size:18px;font-weight:600;margin-bottom:4px}
.mobile-sub{color:#94a3b8;font-size:14px}
.btn-open{background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
</style></head>
<body>
<div class="bar">
  <div class="bar-left">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
    <span id="docTitle">${title}</span>
  </div>
  <div class="bar-right">
    <button class="btn btn-ghost" id="btnPrint" onclick="doPrint()">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      <span class="dsk">พิมพ์</span>
    </button>
    <a class="btn btn-primary" href="${escHtml(pdfUrl)}" download="${title}.pdf" id="btnDl">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      <span>ดาวน์โหลด PDF</span>
    </a>
  </div>
</div>
<div id="content"></div>
<script>
var ua=navigator.userAgent;
var isMobile=/android|iphone|ipad|ipod/i.test(ua);
var isIOS=/iphone|ipad|ipod/i.test(ua);
var pdfUrl=${JSON.stringify(pdfUrl)};
var docTitle=${JSON.stringify(title)};
var content=document.getElementById('content');
if(isIOS){
  document.getElementById('btnPrint').style.display='none';
  document.getElementById('btnDl').setAttribute('href',pdfUrl);
  document.getElementById('btnDl').setAttribute('target','_blank');
  document.getElementById('btnDl').removeAttribute('download');
  var emb=document.createElement('embed');
  emb.setAttribute('src',pdfUrl);
  emb.style.cssText='width:100%;height:calc(100vh - 48px);display:block';
  content.appendChild(emb);
}else if(isMobile){
  document.getElementById('btnPrint').style.display='none';
  content.className='mobile-wrap';
  content.innerHTML='<div class="mobile-icon">📄</div><div><div class="mobile-title">'+docTitle+'</div><div class="mobile-sub">กดปุ่มด้านล่างเพื่อเปิดหรือดาวน์โหลด PDF</div></div><a class="btn-open" href="'+pdfUrl+'">📄 เปิด / ดาวน์โหลด PDF</a>';
}else{
  var ifr=document.createElement('iframe');
  ifr.id='pdfFrame';
  ifr.style.cssText='width:100%;height:calc(100vh - 48px);border:0;display:block';
  content.appendChild(ifr);
  fetch(pdfUrl)
    .then(function(r){
      if(!r.ok){return r.text().then(function(t){throw new Error('HTTP '+r.status+': '+t);});}
      return r.blob();
    })
    .then(function(blob){
      var blobUrl=URL.createObjectURL(new File([blob],docTitle+'.pdf',{type:'application/pdf'}));
      ifr.src=blobUrl;
    })
    .catch(function(){ifr.src=pdfUrl;});
}
function doPrint(){
  var f=document.getElementById('pdfFrame');
  if(!f||!f.contentWindow)return;
  var p=document.title;document.title=docTitle;
  setTimeout(function(){document.title=p;},1000);
  f.contentWindow.print();
}
</script>
</body></html>`);
}

function sendBillingNoteHtml(res: Response, opts: {
  token: string; docNo: string; customerName: string; companyName: string; totalAmount: string; baseUrl: string; fullUrl: string;
}) {
  const pdfUrl = `/api/share/billing-note/${opts.token}/pdf`;
  const ogImage = `${opts.baseUrl}/api/og-image/billing-note/${opts.token}.png`;
  const title = escHtml(opts.docNo ? `ใบวางบิล ${opts.docNo}` : "ใบวางบิล");
  const desc = escHtml(`${opts.companyName}${opts.customerName ? ` → ${opts.customerName}` : ""}${opts.totalAmount ? ` | ยอด ฿${opts.totalAmount}` : ""}`);
  sendShareDocHtml(res, { pdfUrl, ogImage, title, desc, fullUrl: opts.fullUrl });
}

export async function billingNoteShareHandler(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token;
  const ua = req.headers["user-agent"] || "";
  const host = req.get("host") || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const baseUrl = `${proto}://${host}`;
  const fullUrl = baseUrl + req.originalUrl;

  if (BOT_RE.test(ua)) {
    // bots: serve OG tags HTML (same as before)
    req.params.docType = "billing-note";
    return shareOgHandler(req, res, next);
  }

  // human browsers: serve standalone viewer — bypasses React/App.tsx auth entirely
  try {
    const safeToken = token.replace(/'/g, "''");
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute(sql.raw(`SELECT billing_no, customer_name, total_amount, company_id FROM billing_notes WHERE share_token = '${safeToken}' LIMIT 1`));
    const bn = (rows as any).rows?.[0];

    let companyName = "E-Tax Center";
    if (bn?.company_id) {
      const { companies } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [co] = await db.select().from(companies).where(eq(companies.id, Number(bn.company_id)));
      if (co) companyName = co.name;
    }

    const docNo = bn?.billing_no || "";
    const customerName = bn?.customer_name || "";
    const totalAmount = bn?.total_amount ? Number(bn.total_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "";

    sendBillingNoteHtml(res, { token, docNo, customerName, companyName, totalAmount, baseUrl, fullUrl });
  } catch {
    sendBillingNoteHtml(res, { token, docNo: "", customerName: "", companyName: "E-Tax Center", totalAmount: "", baseUrl, fullUrl });
  }
}

export async function creditNoteShareHandler(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token;
  const ua = req.headers["user-agent"] || "";
  const host = req.get("host") || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const baseUrl = `${proto}://${host}`;
  const fullUrl = baseUrl + req.originalUrl;

  if (BOT_RE.test(ua)) {
    req.params.docType = "credit-note";
    return shareOgHandler(req, res, next);
  }

  const pdfUrl = `/api/share/credit-note/${token}/pdf`;
  const ogImage = `${baseUrl}/api/og-image/credit-note/${token}.png`;

  let docNo = "ใบลดหนี้";
  let customerName = "";
  let companyName = "E-Tax Center";
  let totalAmount = "";

  try {
    const safeToken = token.replace(/'/g, "''");
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute(sql.raw(`SELECT credit_note_no, customer_name, total_amount, company_id FROM sales_credit_notes WHERE share_token = '${safeToken}' LIMIT 1`));
    const cn = (rows as any).rows?.[0];
    if (cn) {
      if (cn.credit_note_no) docNo = `ใบลดหนี้ ${cn.credit_note_no}`;
      customerName = cn.customer_name || "";
      totalAmount = cn.total_amount ? Number(cn.total_amount).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "";
      if (cn.company_id) {
        const { companies } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [co] = await db.select().from(companies).where(eq(companies.id, Number(cn.company_id)));
        if (co) companyName = co.name;
      }
    }
  } catch {}

  const title = escHtml(docNo);
  const desc = escHtml(`${companyName}${customerName ? ` → ${customerName}` : ""}${totalAmount ? ` | ยอด ฿${totalAmount}` : ""}`);
  sendShareDocHtml(res, { pdfUrl, ogImage, title, desc, fullUrl });
}

export async function salesDocShareHandler(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token;
  const docType = req.params.docType || "invoice";
  const ua = req.headers["user-agent"] || "";
  const host = req.get("host") || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const baseUrl = `${proto}://${host}`;
  const fullUrl = baseUrl + req.originalUrl;

  if (BOT_RE.test(ua)) {
    return shareOgHandler(req, res, next);
  }

  const PDF_TYPE: Record<string, string> = {
    quote: "quotation",
    order: "sales-order",
  };
  const pdfType = PDF_TYPE[docType] || docType;
  const pdfUrl = `/api/share/${pdfType}/${token}/pdf`;
  const ogImage = `${baseUrl}/api/og-image/${docType}/${token}.png`;
  const labelTh = DOC_TYPE_LABELS_TH[docType] || "เอกสาร";

  let docNo = "";
  let customerName = "";
  let companyName = "E-Tax Center";
  let totalAmount = "";

  try {
    const info = await lookupDoc(docType, token);
    docNo = info.docNo;
    customerName = info.customerName;
    companyName = info.companyName;
    totalAmount = info.fmtTotal;
  } catch {}

  const titleRaw = docNo ? `${labelTh} ${docNo}` : labelTh;
  const title = escHtml(titleRaw);
  const desc = escHtml(`${companyName}${customerName ? ` → ${customerName}` : ""}${totalAmount ? ` | ยอด ฿${totalAmount}` : ""}`);
  sendShareDocHtml(res, { pdfUrl, ogImage, title, desc, fullUrl });
}

export async function contractOgHandler(req: Request, res: Response, next: NextFunction) {
  const ua = req.headers["user-agent"] || "";
  if (!BOT_RE.test(ua)) return next();

  const host = req.get("host") || "";
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const baseUrl = `${proto}://${host}`;
  const fullUrl = baseUrl + req.originalUrl;
  const token = req.params.token;
  const ogImage = `${baseUrl}/api/og-image/contract/${token}.png`;

  try {
    const info = await lookupDoc("contract", token);

    if (!info.docNo) {
      return sendOgHtml(res, { title: "สัญญาบริการ - E-Tax Center", desc: "ลงนามสัญญาบริการออนไลน์", image: ogImage, url: fullUrl });
    }

    const title = `สัญญาบริการ ${info.docNo} - ${info.companyName}`;
    const desc = `${info.companyName}${info.customerName ? ` → ${info.customerName}` : ""}${info.fmtTotal ? ` | ค่าบริการ ฿${info.fmtTotal}/เดือน` : ""}`;

    sendOgHtml(res, { title, desc, image: ogImage, url: fullUrl });
  } catch {
    sendOgHtml(res, { title: "สัญญาบริการ - E-Tax Center", desc: "ลงนามสัญญาบริการออนไลน์", image: ogImage, url: fullUrl });
  }
}
