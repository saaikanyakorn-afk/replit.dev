import type { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, desc, and, sql } from "drizzle-orm";
import { invoices, taxInvoices, receipts, quotations, salesOrders, purchaseInvoices, expenses, companies, purchaseRequests, purchaseOrders, documentDeliveryLogs, salesCreditNotes, salesCreditNoteItems } from "@shared/schema";
import { requireAuth, checkDocOwnership } from "../route-middleware";
import { buildPdfDataById, buildPdfDataByToken } from "../pdf-data-fetcher";
import { generatePdfMake } from "../pdf-pdfmake-generator";
import { sendPlatformEmail } from "../utils/platform-email";

export function registerPdfRoutes(app: Express) {

app.post("/api/pdf/demo-generate", requireAuth, async (req, res) => {
  try {
    const startMem = process.memoryUsage();
    console.log(`[Demo PDF] Starting real generatePdfDirect with fake data...`);
    const t0 = Date.now();

    const fakePdfOpts: any = {
      document: {
        docNo: "DEMO-TIV-001",
        docDate: new Date().toISOString(),
        customerName: "บริษัท ทดสอบ Demo จำกัด",
        customerAddress: "123/456 ถนนสุขุมวิท แขวงคลองตัน เขตคลองเตย กรุงเทพมหานคร 10110",
        customerTaxId: "0105500000001",
        customerBranch: "สำนักงานใหญ่",
        subtotal: 100000,
        discountAmount: 0,
        vatAmount: 7000,
        totalAmount: 107000,
        withholdingTax: 0,
        items: Array.from({ length: 50 }, (_, i) => ({
          no: i + 1,
          productCode: `DEMO-${String(i + 1).padStart(3, "0")}`,
          productName: `สินค้าทดสอบ Demo #${i + 1}`,
          description: `รายการสินค้าทดสอบ Demo #${i + 1} — สินค้าตัวอย่างสำหรับทดสอบระบบ PDF Generation`,
          qty: 10,
          unit: "ชิ้น",
          unitPrice: 200,
          discount: 0,
          discountType: "amount",
          total: 2000,
        })),
      },
      company: {
        id: 0,
        name: "บริษัท อีแท็กซ์เซ็นเตอร์ (Demo) จำกัด",
        nameEn: "E-Tax Center Demo Co., Ltd.",
        address: "999/99 อาคารทดสอบ ถนนรัชดาภิเษก แขวงจตุจักร เขตจตุจักร กรุงเทพมหานคร 10900",
        taxId: "0105500000099",
        phone: "02-999-9999",
        branch: "สำนักงานใหญ่",
      },
      settings: {
        showLogo: false,
        showSignature: false,
        showTaxId: true,
        showBranch: true,
        showProductCode: false,
        docTypeColors: null,
        colorMode: "color",
      },
      documentType: "tax_invoice",
    };

    const pdfBuffer = await generatePdfMake(fakePdfOpts as any);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const endMem = process.memoryUsage();
    console.log(`[Demo PDF] Complete in ${elapsed}s — RSS: ${Math.round(startMem.rss / 1024 / 1024)}MB → ${Math.round(endMem.rss / 1024 / 1024)}MB, PDF size: ${pdfBuffer.length} bytes`);

    res.json({
      success: true,
      message: `สร้าง PDF Demo สำเร็จ (${elapsed} วินาที, ${Math.round(pdfBuffer.length / 1024)} KB)`,
      stats: {
        elapsedSec: parseFloat(elapsed),
        pdfSizeKB: Math.round(pdfBuffer.length / 1024),
        memoryBeforeMB: Math.round(startMem.rss / 1024 / 1024),
        memoryAfterMB: Math.round(endMem.rss / 1024 / 1024),
        items: 50,
      },
    });
  } catch (err: any) {
    console.error("[Demo PDF] Error:", err.message);
    res.status(500).json({ success: false, message: "สร้าง PDF ล้มเหลว: " + err.message });
  }
});

// ========== PDF Generation & E-Document Delivery ==========
async function ensureShareToken(docType: string, docId: number): Promise<string> {
  const { randomBytes } = await import("crypto");
  if (docType === "invoice") {
    const [doc] = await db.select().from(invoices).where(eq(invoices.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(invoices).set({ shareToken: token }).where(eq(invoices.id, docId));
    return token;
  } else if (docType === "tax_invoice") {
    const [doc] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(taxInvoices).set({ shareToken: token }).where(eq(taxInvoices.id, docId));
    return token;
  } else if (docType === "receipt") {
    const [doc] = await db.select().from(receipts).where(eq(receipts.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(receipts).set({ shareToken: token }).where(eq(receipts.id, docId));
    return token;
  } else if (docType === "quotation") {
    const [doc] = await db.select().from(quotations).where(eq(quotations.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(quotations).set({ shareToken: token }).where(eq(quotations.id, docId));
    return token;
  } else if (docType === "sales_order") {
    const [doc] = await db.select().from(salesOrders).where(eq(salesOrders.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(salesOrders).set({ shareToken: token }).where(eq(salesOrders.id, docId));
    return token;
  } else if (docType === "purchase_request") {
    const [doc] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(purchaseRequests).set({ shareToken: token }).where(eq(purchaseRequests.id, docId));
    return token;
  } else if (docType === "purchase_order") {
    const [doc] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(purchaseOrders).set({ shareToken: token }).where(eq(purchaseOrders.id, docId));
    return token;
  } else if (docType === "purchase_invoice") {
    const [doc] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(purchaseInvoices).set({ shareToken: token }).where(eq(purchaseInvoices.id, docId));
    return token;
  } else if (docType === "expense") {
    const [doc] = await db.select().from(expenses).where(eq(expenses.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(expenses).set({ shareToken: token }).where(eq(expenses.id, docId));
    return token;
  } else if (docType === "credit_note") {
    const [doc] = await db.select().from(salesCreditNotes).where(eq(salesCreditNotes.id, docId));
    if (!doc) throw new Error("ไม่พบเอกสาร");
    if (doc.shareToken) return doc.shareToken;
    const token = randomBytes(24).toString("hex");
    await db.update(salesCreditNotes).set({ shareToken: token }).where(eq(salesCreditNotes.id, docId));
    return token;
  }
  throw new Error("ประเภทเอกสารไม่รองรับ");
}

function getSharePath(docType: string): string {
  const paths: Record<string, string> = {
    invoice: "/share/invoice",
    tax_invoice: "/share/tax-invoice",
    receipt: "/share/receipt",
    quotation: "/share/quote",
    sales_order: "/share/order",
    purchase_request: "/share/purchase-request",
    purchase_order: "/share/purchase-order",
    purchase_invoice: "/share/purchase-invoice",
    expense: "/share/expense",
    credit_note: "/share/credit-note",
  };
  return paths[docType] || "/share/invoice";
}

function getDocNoByType(docType: string, doc: any): string {
  const fields: Record<string, string> = {
    invoice: "invoiceNo",
    tax_invoice: "taxInvoiceNo",
    receipt: "receiptNo",
    quotation: "quotationNo",
    sales_order: "orderNo",
    purchase_request: "prNo",
    purchase_order: "poNo",
    purchase_invoice: "apNo",
    expense: "expNo",
    credit_note: "creditNoteNo",
  };
  return doc[fields[docType] || "invoiceNo"] || "document";
}

app.get("/api/documents/:docType/:id/pdf", requireAuth, async (req, res) => {
  try {
    const docType = String(req.params.docType);
    const docId = Number(req.params.id);
    const user = req.user as any;
    const companyId = user?.companyId;

    const printType = String(req.query.printType || "");
    const validPrintTypes = ["tax_invoice", "tax_invoice_receipt", "receipt", "invoice", "delivery_note"];
    const pt = printType && validPrintTypes.includes(printType) ? printType : undefined;

    let pdfOpts = await buildPdfDataById(docType, docId, pt);

    if (companyId && pdfOpts.company && Number(pdfOpts.company.id) !== Number(companyId)) {
      return res.status(403).json({ error: "ไม่มีสิทธิ์เข้าถึงเอกสารนี้" });
    }

    const docNo = pdfOpts.document.docNo || "document";
    const pdfBuffer = await generatePdfMake(pdfOpts);
    pdfOpts = null as any;

    if (companyId) {
      await db.insert(documentDeliveryLogs).values({
        companyId,
        documentType: docType,
        documentId: docId,
        docNo,
        channel: "download",
        status: "downloaded",
        sentBy: user.id,
      });
    }

    const filename = encodeURIComponent(`${docNo}.pdf`);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${filename}`,
      "Content-Length": pdfBuffer.length.toString(),
    });
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("PDF generation error:", err);
    res.status(500).json({ message: "ไม่สามารถสร้าง PDF ได้: " + err.message });
  }
});

app.get("/api/share/:docType/:token/pdf", async (req, res) => {
  try {
    const docType = String(req.params.docType).replace(/-/g, "_");
    const token = String(req.params.token);
    const validDocTypes = ["invoice", "tax_invoice", "receipt", "quotation", "sales_order", "credit_note"];
    if (!validDocTypes.includes(docType)) return res.status(400).json({ message: "ประเภทเอกสารไม่ถูกต้อง" });

    const printType = String(req.query.printType || "");
    const validPrintTypes = ["tax_invoice", "tax_invoice_receipt", "receipt", "invoice", "delivery_note"];
    const pt = printType && validPrintTypes.includes(printType) ? printType : undefined;

    const pdfOpts = await buildPdfDataByToken(docType, token, pt);
    const docNo = pdfOpts.document.docNo || "document";
    console.log(`[SharePDF] generating PDFMake for docType=${docType} docNo=${docNo}`);
    const pdfBuffer = await generatePdfMake(pdfOpts);
    console.log(`[SharePDF] done bufferSize=${pdfBuffer.length}`);
    const filename = encodeURIComponent(`${docNo}.pdf`);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${filename}`,
      "Content-Length": pdfBuffer.length.toString(),
    });
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("Share PDF generation error:", err);
    res.status(500).json({ message: "ไม่สามารถสร้าง PDF ได้: " + err.message });
  }
});

app.post("/api/documents/:docType/:id/send-email", requireAuth, async (req, res) => {
  try {
    const docType = String(req.params.docType);
    const { recipientEmail, recipientName, subject, message, printType } = req.body;
    if (!recipientEmail) return res.status(400).json({ message: "กรุณาระบุอีเมลผู้รับ" });

    const docId = Number(req.params.id);
    const token = await ensureShareToken(docType, docId);
    const sharePath = getSharePath(docType);

    const host = req.headers.host || "localhost:5000";
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const shareLink = `${protocol}://${host}${sharePath}/${token}${printType && printType !== docType ? `?printType=${printType}` : ""}`;

    let docNo = "document";
    let docLabel = "เอกสาร";
    try {
      if (docType === "invoice") {
        const [d] = await db.select().from(invoices).where(eq(invoices.id, docId));
        if (d) docNo = d.invoiceNo;
        docLabel = "ใบแจ้งหนี้";
      } else if (docType === "tax_invoice") {
        const [d] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, docId));
        if (d) docNo = d.taxInvoiceNo;
        docLabel = "ใบกำกับภาษี";
      } else if (docType === "receipt") {
        const [d] = await db.select().from(receipts).where(eq(receipts.id, docId));
        if (d) docNo = d.receiptNo;
        docLabel = "ใบเสร็จรับเงิน";
      } else if (docType === "quotation") {
        const [d] = await db.select().from(quotations).where(eq(quotations.id, docId));
        if (d) docNo = d.quotationNo;
        docLabel = "ใบเสนอราคา";
      } else if (docType === "sales_order") {
        const [d] = await db.select().from(salesOrders).where(eq(salesOrders.id, docId));
        if (d) docNo = d.orderNo;
        docLabel = "ใบสั่งขาย";
      } else if (docType === "purchase_request") {
        const [d] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, docId));
        if (d) docNo = d.prNo;
        docLabel = "ใบขอซื้อ";
      } else if (docType === "purchase_order") {
        const [d] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, docId));
        if (d) docNo = d.poNo;
        docLabel = "ใบสั่งซื้อ";
      } else if (docType === "purchase_invoice") {
        const [d] = await db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, docId));
        if (d) docNo = d.apNo;
        docLabel = "เอกสารซื้อ";
      } else if (docType === "expense") {
        const [d] = await db.select().from(expenses).where(eq(expenses.id, docId));
        if (d) docNo = d.expNo;
        docLabel = "รายจ่าย";
      } else if (docType === "credit_note") {
        const [d] = await db.select().from(salesCreditNotes).where(eq(salesCreditNotes.id, docId));
        if (d) docNo = d.creditNoteNo;
        docLabel = "ใบลดหนี้";
      }
    } catch {}

    const user = req.user as any;
    let companyName = "";
    let companyEmail = "";
    let companyEtaxEmail = "";
    if (user?.companyId) {
      const [c] = await db.select().from(companies).where(eq(companies.id, user.companyId));
      if (c) {
        companyName = c.name;
        companyEmail = c.email || "";
        companyEtaxEmail = c.etaxEmail || "";
      }
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const defaultFromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    const isTaxDocument = docType === "tax_invoice" || docType === "credit_note";
    const fromEmail = defaultFromEmail;

    if (!resendApiKey) {
      return res.status(400).json({ message: "ยังไม่ได้ตั้งค่าบริการอีเมล (Resend API Key)" });
    }

    const { Resend } = await import("resend");
    const resend = new Resend(resendApiKey);

    const emailSubject = subject || `${docLabel} ${docNo} จาก ${companyName}`;
    const emailBody = `
      <div style="font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #fb9678; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0; font-size: 18px;">📄 ${docLabel}</h2>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0; font-size: 14px;">เลขที่ ${docNo}</p>
        </div>
        <div style="background: white; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
          ${recipientName ? `<p style="font-size: 14px; color: #334155;">เรียน ${recipientName},</p>` : ""}
          ${message ? `<p style="font-size: 14px; color: #334155;">${message}</p>` : `<p style="font-size: 14px; color: #334155;">${companyName} ได้ส่ง${docLabel} ${docNo} มาให้ท่าน</p>`}
          <div style="text-align: center; margin: 24px 0;">
            <a href="${shareLink}" style="display: inline-block; background: #fb9678; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">ดูเอกสาร / View Document</a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">หรือคัดลอกลิงก์นี้: <a href="${shareLink}" style="color: #03c9d7;">${shareLink}</a></p>
        </div>
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 16px;">
          Powered by E-Tax Center | อีเมลนี้ส่งอัตโนมัติ กรุณาอย่าตอบกลับ
        </p>
      </div>
    `;

    const emailResult = await resend.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: emailSubject,
      html: emailBody,
    });

    const companyId = user?.companyId;
    if (companyId) {
      await db.insert(documentDeliveryLogs).values({
        companyId,
        documentType: docType,
        documentId: docId,
        docNo,
        channel: "email",
        recipientEmail,
        status: "sent",
        sentBy: user.id,
        metadata: JSON.stringify({ emailId: (emailResult as any)?.data?.id }),
      });
    }

    res.json({ success: true, message: `ส่ง${docLabel} ${docNo} ไปยัง ${recipientEmail} สำเร็จ` });
  } catch (err: any) {
    console.error("Email send error:", err);
    res.status(500).json({ message: "ส่งอีเมลไม่สำเร็จ: " + err.message });
  }
});

app.get("/api/documents/:docType/:id/delivery-logs", requireAuth, async (req, res) => {
  try {
    const docType = String(req.params.docType);
    const docId = Number(req.params.id);
    const logs = await db.select().from(documentDeliveryLogs)
      .where(and(
        eq(documentDeliveryLogs.documentType, docType),
        eq(documentDeliveryLogs.documentId, docId)
      ))
      .orderBy(desc(documentDeliveryLogs.sentAt));
    res.json(logs);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/test/pdf-concurrent", requireAuth, async (req, res) => {
  try {
    const count = Math.min(Number(req.query.count) || 10, 20);
    const docType = String(req.query.docType || "tax_invoice");
    const docId = Number(req.query.docId);
    if (!docId) return res.status(400).json({ message: "docId is required" });

    const startTime = Date.now();
    const memBefore = process.memoryUsage();

    const promises = Array.from({ length: count }, async (_, i) => {
      const t0 = Date.now();
      try {
        const pdfOpts = await buildPdfDataById(docType, docId);
        const buf = await generatePdfMake(pdfOpts);
        return { index: i, success: true, ms: Date.now() - t0, bytes: buf.length };
      } catch (err: any) {
        return { index: i, success: false, ms: Date.now() - t0, error: err.message };
      }
    });

    const results = await Promise.all(promises);
    const memAfter = process.memoryUsage();
    const totalMs = Date.now() - startTime;

    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;
    const avgMs = Math.round(results.reduce((a, r) => a + r.ms, 0) / results.length);

    res.json({
      summary: {
        count,
        successes,
        failures,
        totalMs,
        avgMs,
        memBeforeMB: Math.round(memBefore.rss / 1024 / 1024),
        memAfterMB: Math.round(memAfter.rss / 1024 / 1024),
        memDeltaMB: Math.round((memAfter.rss - memBefore.rss) / 1024 / 1024),
      },
      results,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/documents/batch-pdf", requireAuth, async (req, res) => {
  // Memory model:
  //   Single item  → generate 1 buffer (~200 KB) → send as PDF. Peak: ~200 KB extra.
  //   Multiple items → stream ZIP: generate 1 PDF at a time, append to archiver,
  //                   release buffer before generating next. Peak: ~200 KB extra
  //                   regardless of item count (O(1) instead of O(n)).
  // Limit 200: at ~0.5 s/PDF → max ~100 s. Acceptable for bulk-print use case.
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "กรุณาระบุรายการเอกสาร" });
    }
    if (items.length > 200) {
      return res.status(400).json({ message: "สูงสุด 200 เอกสารต่อครั้ง" });
    }

    const user = req.user as any;
    const companyId = user?.companyId;

    // ── Single item: return as plain PDF ──────────────────────────────────
    if (items.length === 1) {
      const item = items[0];
      const docType = String(item.docType || "");
      const docId = Number(item.docId || 0);
      const printType = item.printType || undefined;
      const pdfOpts = await buildPdfDataById(docType, docId, printType);
      if (companyId && pdfOpts.company && Number(pdfOpts.company.id) !== Number(companyId)) {
        return res.status(403).json({ error: "ไม่มีสิทธิ์เข้าถึงเอกสารนี้" });
      }
      const docNo = pdfOpts.document.docNo || "document";
      const buf = await generatePdfMake(pdfOpts);
      const enc = encodeURIComponent(`${docNo}.pdf`);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${enc}"; filename*=UTF-8''${enc}`,
        "Content-Length": buf.length.toString(),
      });
      return res.send(buf);
    }

    // ── Multiple items: streaming ZIP (O(1) memory) ───────────────────────
    const archiver = (await import("archiver")).default;
    const archive = archiver("zip", { zlib: { level: 1 } });

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="documents.zip"`,
    });
    archive.pipe(res);

    const seen = new Set<string>();
    for (const item of items) {
      const docType = String(item.docType || "");
      const docId = Number(item.docId || 0);
      const printType = item.printType || undefined;
      try {
        const pdfOpts = await buildPdfDataById(docType, docId, printType);
        if (companyId && pdfOpts.company && Number(pdfOpts.company.id) !== Number(companyId)) continue;
        const docNo = pdfOpts.document.docNo || `doc_${docId}`;
        // deduplicate filenames
        let fname = `${docNo}.pdf`;
        if (seen.has(fname)) fname = `${docNo}_${docId}.pdf`;
        seen.add(fname);
        const buf = await generatePdfMake(pdfOpts);
        archive.append(buf, { name: fname });
        // buf eligible for GC after append
      } catch {
        // skip failed items silently
      }
    }

    await archive.finalize();
  } catch (err: any) {
    console.error("Batch PDF error:", err);
    if (!res.headersSent) {
      res.status(500).json({ message: "ไม่สามารถสร้าง PDF แบบ Batch ได้: " + err.message });
    }
  }
});

app.get("/api/pdf/stats", requireAuth, async (req, res) => {
  try {
    const mem = process.memoryUsage();
    res.json({
      engine: "puppeteer",
      memoryMB: Math.round(mem.rss / 1024 / 1024),
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

}

