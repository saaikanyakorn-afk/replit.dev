import type { Express, Request, Response } from "express";
import { db } from "../db";
import { eq, desc, and, asc, gte, lte , sql } from "drizzle-orm";
import { billingNotes, receipts, receiptLinkedDocs, purchaseInvoices, expenses, paymentVouchers, paymentVoucherLinkedDocs, invoices, firmClients, contacts, invoiceItems, journalEntries, companies, journalLines, accounts, bankStatements, lineGroupMappings } from "@shared/schema";
import { requireAuth, requireModule } from "../route-middleware";
import { getNextDocNo, createAutoJournalEntry, resolvePaymentMethodAccountCode, recomputePaymentStatus, recomputeAPPaymentStatus } from "../route-helpers";
import { verifyCompanyAccess } from "../route-factory";
import multer from "multer";

export function registerBillingNotesRoutes(app: Express) {
// ========== Billing Notes (ใบวางบิล) ==========
app.get("/api/finance/billing-notes", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const bnRows = await db.select().from(billingNotes)
      .where(eq(billingNotes.companyId, companyId))
      .orderBy(desc(billingNotes.createdAt));

    const result = [];
    for (const bn of bnRows) {
      const linkedDocs = await db.select().from(billingNoteLinkedDocs)
        .where(eq(billingNoteLinkedDocs.billingNoteId, bn.id));
      result.push({ ...bn, linkedDocs });
    }

    res.json(result);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/finance/billing-notes", requireAuth, async (req, res) => {
  try {
    const { companyId, documents, billingDate, dueDate, notes, customerId, customerName, customerAddress, customerTaxId, branch } = req.body;
    if (!companyId || !documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ message: "กรุณาเลือกเอกสารอย่างน้อย 1 รายการ" });
    }
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const totalAmount = documents.reduce((s: number, d: any) => s + (parseFloat(d.amount) || 0), 0);
    const billingNo = await getNextDocNo(companyId, "BN", billingNotes, billingNotes.billingNo, billingNotes.companyId, billingDate);

    const result = await db.transaction(async (tx) => {
      const [bn] = await tx.insert(billingNotes).values({
        companyId,
        billingNo,
        billingDate: billingDate || new Date().toISOString().split("T")[0],
        dueDate: dueDate || null,
        customerId: customerId || null,
        customerName: customerName || "ลูกค้าทั่วไป",
        customerAddress: customerAddress || null,
        customerTaxId: customerTaxId || null,
        branch: branch || null,
        subtotal: String(totalAmount),
        totalAmount: String(totalAmount),
        status: "approved",
        paymentStatus: "unpaid",
        notes: notes || null,
        docPrefix: "BN",
        createdBy: user.id,
        updatedBy: user.id,
      }).returning();

      for (const doc of documents) {
        await tx.insert(billingNoteLinkedDocs).values({
          billingNoteId: bn.id,
          docType: doc.docType,
          docId: doc.docId,
          docNo: doc.docNo || null,
          docDate: doc.docDate || null,
          amount: String(doc.amount),
        });
      }
      return bn;
    });

    res.json({ success: true, billingNote: result });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/finance/billing-notes/:id", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [bn] = await db.select().from(billingNotes).where(eq(billingNotes.id, id));
    if (!bn) return res.status(404).json({ message: "ไม่พบใบวางบิล" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, bn.companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const linkedDocs = await db.select().from(billingNoteLinkedDocs)
      .where(eq(billingNoteLinkedDocs.billingNoteId, bn.id));

    res.json({ ...bn, linkedDocs });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/finance/billing-notes/:id/create-receipt", requireAuth, async (req, res) => {
  try {
    const bnId = Number(req.params.id);
    const [bn] = await db.select().from(billingNotes).where(eq(billingNotes.id, bnId));
    if (!bn) return res.status(404).json({ message: "ไม่พบใบวางบิล" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, bn.companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const { paymentMethod, paymentDate, notes: payNotes, withholdingTax } = req.body;
    const linkedDocs = await db.select().from(billingNoteLinkedDocs)
      .where(eq(billingNoteLinkedDocs.billingNoteId, bnId));

    if (linkedDocs.length === 0) return res.status(400).json({ message: "ใบวางบิลไม่มีรายการเอกสาร" });

    const grossAmount = parseFloat(bn.totalAmount || "0");
    const whtAmt = parseFloat(withholdingTax) || 0;
    const netAmount = grossAmount - whtAmt;
    const receiptNo = await getNextDocNo(bn.companyId, "RE", receipts, receipts.receiptNo, receipts.companyId, paymentDate);

    const result = await db.transaction(async (tx) => {
      const [receipt] = await tx.insert(receipts).values({
        companyId: bn.companyId,
        receiptNo,
        receiptDate: paymentDate || new Date().toISOString().split("T")[0],
        customerId: bn.customerId,
        customerName: bn.customerName,
        customerAddress: bn.customerAddress,
        customerTaxId: bn.customerTaxId,
        subtotal: String(grossAmount),
        vatAmount: "0",
        withholdingTax: String(whtAmt),
        totalAmount: String(netAmount),
        status: "approved",
        paymentMethod: paymentMethod || "โอนเงิน",
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        notes: payNotes || `รับเงินจากใบวางบิล ${bn.billingNo}`,
        docPrefix: "RE",
        createdBy: user.id,
        updatedBy: user.id,
      }).returning();

      for (const doc of linkedDocs) {
        await tx.insert(receiptLinkedDocs).values({
          receiptId: receipt.id,
          docType: doc.docType,
          docId: doc.docId,
          docNo: doc.docNo || null,
          amount: String(doc.amount),
        });
      }

      await tx.update(billingNotes)
        .set({ paymentStatus: "paid", receiptId: receipt.id, updatedBy: user.id, updatedAt: new Date() })
        .where(eq(billingNotes.id, bnId));

      return receipt;
    });

    for (const doc of linkedDocs) {
      if (doc.docType === "TIV") await recomputePaymentStatus("taxInvoice", doc.docId);
      else if (doc.docType === "IV") await recomputePaymentStatus("invoice", doc.docId);
    }

    let journalResult = null;
    try {
      const pmAccCode = await resolvePaymentMethodAccountCode(result.companyId, result.paymentMethod);
      journalResult = await createAutoJournalEntry({
        companyId: result.companyId,
        documentType: "receipt",
        sourceDocType: "receipt",
        sourceDocId: result.id,
        docDate: result.receiptDate,
        docNo: result.receiptNo,
        subtotal: String(grossAmount),
        vatAmount: "0",
        totalAmount: String(netAmount),
        withholdingTax: String(whtAmt),
        currencyCode: "THB",
        exchangeRate: "1",
        userId: user.id,
        customerName: bn.customerName,
        paymentMethod: paymentMethod || "โอนเงิน",
        paymentMethodAccountCode: pmAccCode,
        linkedInvoiceId: linkedDocs[0]?.docId,
        overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
      });
    } catch (e) {}

    res.json({ success: true, receipt: result, journalResult });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.patch("/api/finance/billing-notes/:id/void", requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [bn] = await db.select().from(billingNotes).where(eq(billingNotes.id, id));
    if (!bn) return res.status(404).json({ message: "ไม่พบใบวางบิล" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, bn.companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    await db.update(billingNotes)
      .set({ status: "cancelled", updatedBy: user.id, updatedAt: new Date() })
      .where(eq(billingNotes.id, id));

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/finance/ap-billing", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const piRows = await db.select({
      id: purchaseInvoices.id,
      docNo: purchaseInvoices.apNo,
      docDate: purchaseInvoices.apDate,
      dueDate: purchaseInvoices.dueDate,
      contactName: purchaseInvoices.vendorName,
      vendorId: purchaseInvoices.vendorId,
      totalAmount: purchaseInvoices.totalAmount,
      paymentStatus: purchaseInvoices.paymentStatus,
      status: purchaseInvoices.status,
    }).from(purchaseInvoices).where(and(
      eq(purchaseInvoices.companyId, companyId),
      sql`${purchaseInvoices.status} != 'cancelled'`,
      sql`COALESCE(${purchaseInvoices.paymentStatus}, 'unpaid') != 'paid'`
    ));

    const expRows = await db.select({
      id: expenses.id,
      docNo: expenses.expNo,
      docDate: expenses.expDate,
      dueDate: expenses.dueDate,
      contactName: expenses.vendorName,
      vendorId: expenses.vendorId,
      totalAmount: expenses.totalAmount,
      paymentStatus: expenses.paymentStatus,
      status: expenses.status,
    }).from(expenses).where(and(
      eq(expenses.companyId, companyId),
      sql`${expenses.status} != 'cancelled'`,
      sql`COALESCE(${expenses.paymentStatus}, 'unpaid') != 'paid'`
    ));

    const documents = [
      ...piRows.map(r => ({ ...r, docType: "AP", totalAmount: parseFloat(r.totalAmount || "0"), paymentStatus: r.paymentStatus || "unpaid" })),
      ...expRows.map(r => ({ ...r, docType: "EXP", totalAmount: parseFloat(r.totalAmount || "0"), paymentStatus: r.paymentStatus || "unpaid" })),
    ].sort((a, b) => a.docDate.localeCompare(b.docDate));

    const pvRows = await db.select({
      id: paymentVouchers.id, pvNo: paymentVouchers.pvNo, pvDate: paymentVouchers.pvDate,
      vendorName: paymentVouchers.vendorName, totalAmount: paymentVouchers.totalAmount,
      paymentMethod: paymentVouchers.paymentMethod, status: paymentVouchers.status,
    }).from(paymentVouchers).where(and(
      eq(paymentVouchers.companyId, companyId),
      sql`${paymentVouchers.status} != 'cancelled'`
    )).orderBy(sql`${paymentVouchers.pvDate} DESC`).limit(50);

    const pvIds = pvRows.map(r => r.id);
    let pvLinkedDocs: any[] = [];
    if (pvIds.length > 0) {
      pvLinkedDocs = await db.select().from(paymentVoucherLinkedDocs)
        .where(sql`${paymentVoucherLinkedDocs.paymentVoucherId} IN (${sql.join(pvIds.map(id => sql`${id}`), sql`, `)})`);
    }
    const pvWithDocs = pvRows.map(r => ({
      ...r,
      totalAmount: parseFloat(r.totalAmount || "0"),
      linkedDocs: pvLinkedDocs.filter(ld => ld.paymentVoucherId === r.id).map(ld => ({
        docType: ld.docType, docNo: ld.docNo, amount: parseFloat(ld.amount || "0"),
      })),
    }));

    res.json({ documents, recentPaymentVouchers: pvWithDocs });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/finance/batch-payment-voucher", requireAuth, async (req, res) => {
  try {
    const { companyId, documents, paymentMethod, paymentDate, notes, withholdingTax } = req.body;
    if (!companyId || !documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ message: "กรุณาเลือกเอกสารอย่างน้อย 1 รายการ" });
    }
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const vendorNames = new Set(documents.map((d: any) => d.contactName || "ผู้ขายทั่วไป"));
    if (vendorNames.size > 1) return res.status(400).json({ message: "กรุณาเลือกผู้ขายเดียวกันเท่านั้น" });
    for (const doc of documents) {
      if (!["AP", "EXP"].includes(doc.docType) || !doc.docId) return res.status(400).json({ message: "docType ต้องเป็น AP หรือ EXP" });
    }
    const totalAmount = documents.reduce((s: number, d: any) => s + (parseFloat(d.amount) || 0), 0);
    const whtAmt = parseFloat(withholdingTax) || 0;
    const vendorName = documents[0].contactName || "ผู้ขายทั่วไป";
    const vendorId = documents[0].vendorId || null;
    const pvNo = await getNextDocNo(companyId, "PV", paymentVouchers, paymentVouchers.pvNo, paymentVouchers.companyId, paymentDate);

    const result = await db.transaction(async (tx) => {
      const [pv] = await tx.insert(paymentVouchers).values({
        companyId,
        pvNo,
        pvDate: paymentDate || new Date().toISOString().split("T")[0],
        vendorId,
        vendorName,
        totalAmount: String(totalAmount),
        withholdingTax: String(whtAmt),
        paymentMethod: paymentMethod || "โอนเงิน",
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        status: "approved",
        notes: notes || `รวมจ่าย ${documents.length} รายการ`,
        docPrefix: "PV",
        createdBy: user.id,
        updatedBy: user.id,
      }).returning();

      for (const doc of documents) {
        await tx.insert(paymentVoucherLinkedDocs).values({
          paymentVoucherId: pv.id,
          docType: doc.docType,
          docId: doc.docId,
          docNo: doc.docNo || null,
          amount: String(doc.amount),
        });
      }
      return pv;
    });

    for (const doc of documents) {
      if (doc.docType === "AP") await recomputeAPPaymentStatus("purchaseInvoice", doc.docId);
      else if (doc.docType === "EXP") await recomputeAPPaymentStatus("expense", doc.docId);
    }

    let journalResult = null;
    try {
      const pmAccCode = await resolvePaymentMethodAccountCode(result.companyId, result.paymentMethod);
      journalResult = await createAutoJournalEntry({
        companyId: result.companyId,
        documentType: "payment",
        sourceDocType: "payment_voucher",
        sourceDocId: result.id,
        docDate: result.pvDate,
        docNo: result.pvNo,
        subtotal: String(totalAmount),
        vatAmount: "0",
        totalAmount: String(totalAmount),
        withholdingTax: String(whtAmt),
        currencyCode: "THB",
        exchangeRate: "1",
        userId: user.id,
        customerName: vendorName,
        paymentMethod: paymentMethod || "โอนเงิน",
        paymentMethodAccountCode: pmAccCode,
        linkedInvoiceId: documents[0].docId,
        overrideLines: body?.journalOverrideLines || req?.body?.journalOverrideLines || undefined,
      });
    } catch (e) {}

    res.json({ success: true, paymentVoucher: result, journalResult });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/firm-billing/status", requireAuth, requireModule("firm-mgmt"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!companyId || !month || !year) return res.status(400).json({ message: "companyId, month, year required" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const periodKey = `${year}${String(month).padStart(2, "0")}`;
    const rows = await db.select({
      id: invoices.id,
      invoiceNo: invoices.invoiceNo,
      invoiceDate: invoices.invoiceDate,
      customerName: invoices.customerName,
      totalAmount: invoices.totalAmount,
      refDoc: invoices.refDoc,
    }).from(invoices).where(and(
      eq(invoices.companyId, companyId),
      sql`(${invoices.refDoc} LIKE ${'FIRM_BILLING_%_' + periodKey} OR (${invoices.refDoc} LIKE 'FIRM_BILLING_%' AND ${invoices.invoiceDate} >= ${startDate} AND ${invoices.invoiceDate} <= ${endDate}))`
    ));

    const generated = rows.map(r => {
      const match = (r.refDoc || "").match(/FIRM_BILLING_(\d+)/);
      return { ...r, firmClientId: match ? Number(match[1]) : 0 };
    });

    res.json({ generated });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/firm-billing/batch-generate", requireAuth, requireModule("firm-mgmt"), async (req, res) => {
  try {
    const { companyId, firmClientIds, month, year, invoiceDate, creditDays } = req.body;
    if (!companyId || !firmClientIds?.length || !month || !year || !invoiceDate) {
      return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    }
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const clientRows = await db.select().from(firmClients)
      .where(sql`${firmClients.id} IN (${sql.join(firmClientIds.map((id: number) => sql`${id}`), sql`, `)})`);

    const periodKey = `${year}${String(month).padStart(2, "0")}`;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const existingRefs = await db.select({ refDoc: invoices.refDoc }).from(invoices).where(and(
      eq(invoices.companyId, companyId),
      sql`(${invoices.refDoc} LIKE ${'FIRM_BILLING_%_' + periodKey} OR (${invoices.refDoc} LIKE 'FIRM_BILLING_%' AND ${invoices.invoiceDate} >= ${startDate} AND ${invoices.invoiceDate} <= ${endDate}))`
    ));
    const alreadyGenerated = new Set(existingRefs.map(r => {
      const m = (r.refDoc || "").match(/FIRM_BILLING_(\d+)/);
      return m ? `FIRM_BILLING_${m[1]}_${periodKey}` : r.refDoc;
    }));

    const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const monthLabel = `${THAI_MONTHS[month - 1]} ${year + 543}`;

    let count = 0;
    let skipped = 0;
    for (const client of clientRows) {
      const fee = parseFloat(client.serviceFee || "0");
      if (fee <= 0) continue;

      const refDoc = `FIRM_BILLING_${client.id}_${periodKey}`;
      if (alreadyGenerated.has(refDoc)) { skipped++; continue; }

      const dueD = new Date(invoiceDate);
      dueD.setDate(dueD.getDate() + (creditDays || 30));
      const dueDate = `${dueD.getFullYear()}-${String(dueD.getMonth() + 1).padStart(2, "0")}-${String(dueD.getDate()).padStart(2, "0")}`;

      const prefix = "IV";
      const invoiceNo = await getNextDocNo(companyId, prefix, invoices, invoices.invoiceNo, invoices.companyId, invoiceDate);

      const vatIncluded = client.feeVatIncluded === true;
      let subtotal: number, vat7: number, totalAmount: number;
      if (vatIncluded) {
        vat7 = Math.round(fee * 7 / 107 * 100) / 100;
        subtotal = Math.round((fee - vat7) * 100) / 100;
        totalAmount = fee;
      } else {
        subtotal = fee;
        vat7 = Math.round(fee * 0.07 * 100) / 100;
        totalAmount = Math.round((fee + vat7) * 100) / 100;
      }
      const whtRate = parseFloat(client.whtRate || "3");
      const wht = Math.round(subtotal * whtRate / 100 * 100) / 100;
      const priceMode = vatIncluded ? "included" : "excluded";

      const result = await db.transaction(async (tx) => {
        let contactCode = client.taxId || null;
        if (client.contactId) {
          const [linkedContact] = await tx.select({ code: contacts.code }).from(contacts).where(eq(contacts.id, client.contactId)).limit(1);
          if (linkedContact) contactCode = linkedContact.code;
        }

        const [doc] = await tx.insert(invoices).values({
          companyId,
          invoiceNo,
          invoiceDate,
          dueDate,
          customerId: client.contactId || null,
          customerCode: contactCode,
          customerName: client.name,
          customerAddress: client.address || null,
          customerTaxId: client.taxId || null,
          branch: client.branch || "สำนักงานใหญ่",
          contactPerson: client.contactPerson || null,
          contactPhone: client.phone || null,
          contactEmail: client.email || null,
          creditDays: creditDays || 30,
          subtotal: String(subtotal),
          discountAmount: "0",
          vatAmount: String(vat7),
          totalAmount: String(totalAmount),
          withholdingTax: String(wht),
          status: "approved",
          paymentStatus: "unpaid",
          priceMode,
          docPrefix: prefix,
          refDoc,
          notes: `ค่าบริการบัญชีประจำเดือน ${monthLabel}`,
          createdBy: user.id,
        }).returning();

        await tx.insert(invoiceItems).values({
          invoiceId: doc.id,
          productCode: "SVC",
          productName: `ค่าบริการทำบัญชี ประจำเดือน ${monthLabel}`,
          description: `ค่าบริการทำบัญชีและภาษี - ${client.name}`,
          qty: "1",
          unit: "เดือน",
          unitPrice: String(vatIncluded ? fee : subtotal),
          discount: "0",
          discountType: "amount",
          total: String(vatIncluded ? fee : subtotal),
          vatType: "vat7",
        });

        return doc;
      });

      try {
        const jr = await createAutoJournalEntry({
          companyId,
          documentType: "invoice",
          sourceDocType: "invoice",
          sourceDocId: result.id,
          docDate: invoiceDate,
          docNo: invoiceNo,
          subtotal: String(subtotal),
          vatAmount: String(vat7),
          totalAmount: String(totalAmount),
          withholdingTax: String(wht),
          currencyCode: "THB",
          exchangeRate: "1",
          userId: user.id,
          customerName: client.name,
          overrideLines: req?.body?.journalOverrideLines || undefined,
        });
        console.log(`[FirmBilling] IV#${result.id} (${invoiceNo}) journal:`, JSON.stringify(jr));
      } catch (e: any) { console.error(`[FirmBilling] IV#${result.id} journal error:`, e.message); }

      count++;
    }

    res.json({ success: true, count, skipped });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/firm-billing/batch-send-line", requireAuth, requireModule("firm-mgmt"), async (req, res) => {
  try {
    const { companyId, firmClientIds, month, year } = req.body;
    if (!companyId || !firmClientIds?.length || !month || !year) {
      return res.status(400).json({ message: "companyId, firmClientIds, month, year required" });
    }
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const tokenRows = await db.execute(sql`SELECT config_value FROM system_config WHERE config_key = 'LINE_CHANNEL_ACCESS_TOKEN' LIMIT 1`);
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || (tokenRows.rows?.[0] as any)?.config_value || "";
    if (!lineToken) return res.status(400).json({ message: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" });

    const periodKey = `${year}${String(month).padStart(2, "0")}`;
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const THAI_MONTHS_TH = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    const monthLabel = `${THAI_MONTHS_TH[month - 1]} ${year + 543}`;

    const invRows = await db.select().from(invoices).where(and(
      eq(invoices.companyId, companyId),
      sql`(${invoices.refDoc} LIKE ${"FIRM_BILLING_%_" + periodKey} OR (${invoices.refDoc} LIKE ${"FIRM_BILLING_%"} AND ${invoices.invoiceDate} >= ${startDate} AND ${invoices.invoiceDate} <= ${endDate}))`
    ));

    const invMap = new Map<number, any>();
    for (const inv of invRows) {
      const m = (inv.refDoc || "").match(/FIRM_BILLING_(\d+)/);
      if (m) invMap.set(Number(m[1]), inv);
    }

    const [companyRow] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId));
    const senderName = companyRow?.name || "สำนักงานบัญชี";

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const { randomBytes } = await import("crypto");

    const results: any[] = [];

    for (const firmClientId of firmClientIds) {
      const [client] = await db.select().from(firmClients).where(eq(firmClients.id, Number(firmClientId)));
      const clientName = client?.name || `ลูกค้า #${firmClientId}`;

      const inv = invMap.get(Number(firmClientId));
      if (!inv) {
        results.push({ firmClientId, clientName, success: false, error: "ยังไม่มีใบแจ้งหนี้ประจำเดือนนี้" });
        continue;
      }

      const [groupMapping] = await db.select().from(lineGroupMappings)
        .where(and(eq(lineGroupMappings.firmClientId, Number(firmClientId)), eq(lineGroupMappings.active, true)));
      if (!groupMapping?.lineGroupId) {
        results.push({ firmClientId, clientName, success: false, invoiceNo: inv.invoiceNo, error: "ยังไม่ได้เชื่อมกลุ่ม LINE" });
        continue;
      }

      let shareToken = inv.shareToken;
      if (!shareToken) {
        shareToken = randomBytes(24).toString("hex");
        await db.update(invoices).set({ shareToken }).where(eq(invoices.id, inv.id));
      }

      const shareUrl = `${baseUrl}/share/invoice/${shareToken}`;
      const amount = parseFloat(inv.totalAmount || "0");
      const amountStr = amount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      try {
        const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` },
          body: JSON.stringify({
            to: groupMapping.lineGroupId,
            messages: [{
              type: "flex",
              altText: `ใบแจ้งหนี้ ${inv.invoiceNo} จาก ${senderName}`,
              contents: {
                type: "bubble",
                header: {
                  type: "box", layout: "vertical", backgroundColor: "#fb9678", paddingAll: "16px",
                  contents: [
                    { type: "text", text: senderName, size: "xs", color: "#ffffff", weight: "bold" },
                    { type: "text", text: "ใบแจ้งหนี้", size: "lg", color: "#ffffff", weight: "bold" },
                  ],
                },
                body: {
                  type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
                  contents: [
                    { type: "text", text: inv.invoiceNo || "-", size: "md", weight: "bold", color: "#333333" },
                    { type: "text", text: `ประจำเดือน ${monthLabel}`, size: "sm", color: "#888888" },
                    { type: "separator", margin: "md" },
                    {
                      type: "box", layout: "horizontal", margin: "md",
                      contents: [
                        { type: "text", text: "ยอดชำระ", size: "sm", color: "#888888", flex: 1 },
                        { type: "text", text: `฿${amountStr}`, size: "sm", weight: "bold", color: "#fb9678", align: "end" },
                      ],
                    },
                  ],
                },
                footer: {
                  type: "box", layout: "vertical", paddingAll: "16px",
                  contents: [{
                    type: "button",
                    action: { type: "uri", label: "ดูใบแจ้งหนี้", uri: shareUrl },
                    style: "primary", color: "#fb9678",
                  }],
                },
              },
            }],
          }),
        });
        if (!lineRes.ok) {
          const errBody = await lineRes.json().catch(() => ({}));
          results.push({ firmClientId, clientName, success: false, invoiceNo: inv.invoiceNo, error: (errBody as any).message || "ส่ง LINE ไม่สำเร็จ" });
        } else {
          results.push({ firmClientId, clientName, success: true, invoiceNo: inv.invoiceNo });
        }
      } catch (e: any) {
        results.push({ firmClientId, clientName, success: false, invoiceNo: inv.invoiceNo, error: e.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({ success: true, successCount, totalCount: firmClientIds.length, results });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/firm-billing/backfill-journals", requireAuth, requireModule("firm-mgmt"), async (req, res) => {
  try {
    const user = req.user as any;
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const allInvoices = await db.select().from(invoices).where(and(
      eq(invoices.companyId, companyId),
      sql`${invoices.refDoc} LIKE 'FIRM_BILLING_%'`,
      eq(invoices.status, "approved"),
    ));

    const existingJEs = await db.select({ sourceDocId: journalEntries.sourceDocId }).from(journalEntries)
      .where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.sourceDocType, "invoice")));
    const hasJournal = new Set(existingJEs.map(e => e.sourceDocId));

    let created = 0;
    let skippedCount = 0;
    const results: any[] = [];

    for (const inv of allInvoices) {
      if (hasJournal.has(inv.id)) { skippedCount++; continue; }
      try {
        const jr = await createAutoJournalEntry({
          companyId,
          documentType: "invoice",
          sourceDocType: "invoice",
          sourceDocId: inv.id,
          docDate: inv.invoiceDate,
          docNo: inv.invoiceNo,
          subtotal: String(inv.subtotal),
          vatAmount: String(inv.vatAmount),
          totalAmount: String(inv.totalAmount),
          withholdingTax: String(inv.withholdingTax || "0"),
          currencyCode: "THB",
          exchangeRate: "1",
          userId: user.id,
          customerName: inv.customerName,
          overrideLines: req?.body?.journalOverrideLines || undefined,
        });
        results.push({ invoiceId: inv.id, invoiceNo: inv.invoiceNo, ...jr });
        if (!jr.skipped) created++;
        else skippedCount++;
        console.log(`[Backfill] IV#${inv.id} (${inv.invoiceNo}):`, JSON.stringify(jr));
      } catch (e: any) {
        results.push({ invoiceId: inv.id, invoiceNo: inv.invoiceNo, error: e.message });
        console.error(`[Backfill] IV#${inv.id} error:`, e.message);
      }
    }

    res.json({ success: true, created, skipped: skippedCount, details: results });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    const ext = file.originalname.toLowerCase();
    if (ext.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("อนุญาตเฉพาะไฟล์ CSV"));
    }
  },
});

app.post("/api/firm-billing/import-csv", requireAuth, requireModule("firm-mgmt"), csvUpload.single("file"), async (req: any, res) => {
  try {
    const user = req.user as any;
    const file = req.file;
    const companyId = Number(req.body.companyId);
    const mode = req.body.mode || "preview";
    if (!file) return res.status(400).json({ message: "กรุณาอัปโหลดไฟล์" });
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    let csvText = file.buffer.toString("utf-8").replace(/^\uFEFF/, "");

    function parseCSVFull(text: string): string[][] {
      const result: string[][] = [];
      let row: string[] = [];
      let field = "";
      let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
          if (ch === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') { field += '"'; i++; continue; }
            inQuotes = false; continue;
          }
          field += ch;
        } else {
          if (ch === '"') { inQuotes = true; continue; }
          if (ch === ',') { row.push(field.trim()); field = ""; continue; }
          if (ch === '\r') continue;
          if (ch === '\n') { row.push(field.trim()); if (row.some(c => c !== "")) result.push(row); row = []; field = ""; continue; }
          field += ch;
        }
      }
      row.push(field.trim());
      if (row.some(c => c !== "")) result.push(row);
      return result;
    }

    const allRows = parseCSVFull(csvText);
    if (allRows.length < 2) return res.status(400).json({ message: "ไฟล์ไม่มีข้อมูล" });

    const header = allRows[0];
    const dateIdx = header.findIndex((h: string) => h.includes("วันที่") && !h.includes("ครบ"));
    const dueIdx = header.findIndex((h: string) => h.includes("ครบกำหนด"));
    const prefixIdx = header.findIndex((h: string) => h.includes("อักษรนำ"));
    const docNoIdx = header.findIndex((h: string) => h.includes("เลขที่"));
    const nameIdx = header.findIndex((h: string) => h.includes("คู่ค้า"));
    const addrIdx = header.findIndex((h: string) => h.includes("ที่อยู่"));
    const totalIdx = header.findIndex((h: string) => h.includes("ยอดรวม"));

    if (nameIdx < 0 || totalIdx < 0) {
      return res.status(400).json({ message: "ไม่พบคอลัมน์ 'คู่ค้า' หรือ 'ยอดรวม' ในไฟล์" });
    }

    function parseDateDMY(d: string): string | null {
      if (!d) return null;
      const parts = d.split("/");
      if (parts.length !== 3) return null;
      let [dd, mm, yyyy] = parts.map(p => parseInt(p, 10));
      if (isNaN(dd) || isNaN(mm) || isNaN(yyyy)) return null;
      if (yyyy > 2500) yyyy -= 543;
      if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 1900 || yyyy > 2100) return null;
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }

    function cleanName(raw: string): string {
      const parts = raw.split(" - ");
      return parts[0].trim();
    }

    const rows: any[] = [];
    const parseErrors: any[] = [];
    for (let i = 1; i < allRows.length; i++) {
      const cols = allRows[i];
      const rawName = cols[nameIdx] || "";
      const name = cleanName(rawName);
      const totalStr = (cols[totalIdx] || "0").replace(/,/g, "");
      const total = parseFloat(totalStr);
      if (!name) continue;

      const dateStr = dateIdx >= 0 ? parseDateDMY(cols[dateIdx] || "") : null;
      const dueStr = dueIdx >= 0 ? parseDateDMY(cols[dueIdx] || "") : null;

      if (dateIdx >= 0 && !dateStr && (cols[dateIdx] || "").trim()) {
        parseErrors.push({ row: i + 1, name, message: `วันที่ไม่ถูกต้อง: ${cols[dateIdx]}` });
        continue;
      }
      if (!dateStr) {
        parseErrors.push({ row: i + 1, name, message: "ไม่มีวันที่" });
        continue;
      }
      if (isNaN(total)) {
        parseErrors.push({ row: i + 1, name, message: `ยอดรวมไม่ถูกต้อง: ${totalStr}` });
        continue;
      }

      const prefix = prefixIdx >= 0 ? (cols[prefixIdx] || "BL").trim() : "BL";
      const docNo = docNoIdx >= 0 ? (cols[docNoIdx] || "").trim() : "";
      const address = addrIdx >= 0 ? (cols[addrIdx] || "").trim() : "";

      rows.push({ row: i + 1, name, address, total, dateStr, dueStr, prefix, docNo });
    }

    const allClients = await db.select().from(firmClients)
      .where(eq(firmClients.companyId, companyId));

    const clientByName = new Map<string, typeof allClients[0]>();
    for (const c of allClients) {
      clientByName.set((c.name || "").toLowerCase().trim(), c);
      if (c.nickname) clientByName.set(c.nickname.toLowerCase().trim(), c);
    }

    const matched: any[] = [];
    const unmatched: any[] = [];

    for (const r of rows) {
      const key = r.name.toLowerCase().trim();
      const client = clientByName.get(key);
      if (client) {
        matched.push({ ...r, firmClientId: client.id, firmClientName: client.name });
      } else {
        unmatched.push(r);
      }
    }

    if (mode === "preview") {
      return res.json({
        total: rows.length,
        matched: matched.length,
        unmatched: unmatched.length,
        matchedRows: matched.slice(0, 20),
        unmatchedRows: unmatched.slice(0, 20),
        totalAmount: rows.reduce((s, r) => s + r.total, 0),
        matchedAmount: matched.reduce((s, r) => s + r.total, 0),
        parseErrors: parseErrors.slice(0, 10),
        parseErrorCount: parseErrors.length,
      });
    }

    const updateFees = req.body.updateFees === "true" || req.body.updateFees === true;
    let feesUpdated = 0;
    if (updateFees) {
      for (const r of matched) {
        if (r.total > 0 && r.firmClientId) {
          try {
            await db.update(firmClients)
              .set({ serviceFee: String(r.total), feeVatIncluded: true })
              .where(eq(firmClients.id, r.firmClientId));
            feesUpdated++;
          } catch (e: any) {
            console.error(`[ImportCSV] Fee update error for client ${r.firmClientId}:`, e.message);
          }
        }
      }
    }

    let created = 0;
    let skipped = 0;
    const errors: any[] = [];

    const existingDocNos = new Set<string>();
    const existingDocs = await db.select({ invoiceNo: invoices.invoiceNo }).from(invoices)
      .where(eq(invoices.companyId, companyId));
    for (const d of existingDocs) existingDocNos.add(d.invoiceNo || "");

    for (const r of [...matched, ...unmatched]) {
      try {
        const fullDocNo = r.prefix && r.docNo ? `${r.prefix}-${r.docNo}` : r.docNo;
        if (fullDocNo && existingDocNos.has(fullDocNo)) { skipped++; continue; }
        if (r.docNo && existingDocNos.has(r.docNo)) { skipped++; continue; }

        const invoiceNo = r.docNo
          ? (r.prefix ? `${r.prefix}-${r.docNo}` : r.docNo)
          : await getNextDocNo(companyId, r.prefix || "BL", invoices, invoices.invoiceNo, invoices.companyId, r.dateStr || new Date().toISOString().slice(0, 10));

        const totalAmount = r.total;
        const vat7 = Math.round(totalAmount * 7 / 107 * 100) / 100;
        const subtotal = Math.round((totalAmount - vat7) * 100) / 100;
        const whtRate = r.firmClientId
          ? parseFloat((allClients.find(c => c.id === r.firmClientId)?.whtRate) || "3")
          : 3;
        const wht = Math.round(subtotal * whtRate / 100 * 100) / 100;

        const isoDate = r.dateStr;
        const isoDue = r.dueStr || isoDate;

        const dateParts = isoDate.split("-");
        const periodKey = `${dateParts[0]}${dateParts[1]}`;
        const refDoc = r.firmClientId ? `FIRM_BILLING_${r.firmClientId}_${periodKey}` : null;

        let customerId = null;
        let customerCode = null;
        if (r.firmClientId) {
          const client = allClients.find(c => c.id === r.firmClientId);
          if (client?.contactId) {
            customerId = client.contactId;
            const [linkedContact] = await db.select({ code: contacts.code }).from(contacts).where(eq(contacts.id, client.contactId)).limit(1);
            if (linkedContact) customerCode = linkedContact.code;
          }
          if (!customerCode) customerCode = client?.taxId || null;
        }

        const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        const mon = parseInt(dateParts[1], 10);
        const yr = parseInt(dateParts[0], 10);
        const monthLabel = `${THAI_MONTHS[mon - 1]} ${yr + 543}`;

        const result = await db.transaction(async (tx) => {
          const [doc] = await tx.insert(invoices).values({
            companyId,
            invoiceNo,
            invoiceDate: isoDate,
            dueDate: isoDue,
            customerId,
            customerCode,
            customerName: r.name,
            customerAddress: r.address || null,
            subtotal: String(subtotal),
            discountAmount: "0",
            vatAmount: String(vat7),
            totalAmount: String(totalAmount),
            withholdingTax: String(wht),
            status: "approved",
            paymentStatus: "unpaid",
            priceMode: "included",
            docPrefix: r.prefix || "BL",
            refDoc,
            notes: `นำเข้าจากโปรแกรมเก่า - ค่าบริการบัญชีเดือน ${monthLabel}`,
            createdBy: user.id,
          }).returning();

          await tx.insert(invoiceItems).values({
            invoiceId: doc.id,
            productCode: "SVC",
            productName: `ค่าบริการทำบัญชี ประจำเดือน ${monthLabel}`,
            description: `ค่าบริการทำบัญชีและภาษี - ${r.name}`,
            qty: "1",
            unit: "เดือน",
            unitPrice: String(totalAmount),
            discount: "0",
            discountType: "amount",
            total: String(totalAmount),
            vatType: "vat7",
          });

          return doc;
        });

        try {
          await createAutoJournalEntry({
            companyId,
            documentType: "invoice",
            sourceDocType: "invoice",
            sourceDocId: result.id,
            docDate: isoDate,
            docNo: invoiceNo,
            subtotal: String(subtotal),
            vatAmount: String(vat7),
            totalAmount: String(totalAmount),
            withholdingTax: String(wht),
            currencyCode: "THB",
            exchangeRate: "1",
            userId: user.id,
            customerName: r.name,
          });
        } catch (e: any) {
          console.error(`[ImportCSV] IV#${result.id} journal error:`, e.message);
        }

        existingDocNos.add(invoiceNo);
        created++;
      } catch (e: any) {
        errors.push({ row: r.row, name: r.name, message: e.message });
      }
    }

    res.json({
      success: true,
      created,
      skipped,
      errors,
      total: rows.length,
      matched: matched.length,
      unmatched: unmatched.length,
      feesUpdated,
    });
  } catch (err: any) { console.error("[ImportCSV] Error:", err.message, err.stack?.slice(0, 300)); res.status(500).json({ message: err.message }); }
});

app.get("/api/firm-billing/export", requireAuth, requireModule("firm-mgmt"), async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const clientRows = await db.select().from(firmClients)
      .where(and(eq(firmClients.companyId, companyId), eq(firmClients.status, "active")));

    let generatedMap = new Map<number, any>();
    if (month && year) {
      const periodKey = `${year}${String(month).padStart(2, "0")}`;
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const invoiceRows = await db.select({
        id: invoices.id,
        invoiceNo: invoices.invoiceNo,
        invoiceDate: invoices.invoiceDate,
        totalAmount: invoices.totalAmount,
        paymentStatus: invoices.paymentStatus,
        refDoc: invoices.refDoc,
      }).from(invoices).where(and(
        eq(invoices.companyId, companyId),
        sql`(${invoices.refDoc} LIKE ${'FIRM_BILLING_%_' + periodKey} OR (${invoices.refDoc} LIKE 'FIRM_BILLING_%' AND ${invoices.invoiceDate} >= ${startDate} AND ${invoices.invoiceDate} <= ${endDate}))`
      ));
      for (const inv of invoiceRows) {
        const m = (inv.refDoc || "").match(/FIRM_BILLING_(\d+)/);
        if (m) generatedMap.set(Number(m[1]), inv);
      }
    }

    const BOM = "\uFEFF";
    const csvHeader = "#,ชื่อลูกค้า,ชื่อเล่น,เลขประจำตัวผู้เสียภาษี,สาขา,ที่อยู่,โทร,อีเมล,ค่าบริการ,รวมVAT,อัตราหักณที่จ่าย(%),สถานะ,เลขที่ใบแจ้งหนี้,สถานะชำระ,ยอดใบแจ้งหนี้";
    const csvRows = clientRows.map((c, i) => {
      const inv = generatedMap.get(c.id);
      const fee = c.serviceFee || "0";
      const vatInc = c.feeVatIncluded ? "ใช่" : "ไม่ใช่";
      const wht = c.whtRate || "3";
      return [
        i + 1,
        `"${(c.name || "").replace(/"/g, '""')}"`,
        `"${(c.nickname || "").replace(/"/g, '""')}"`,
        c.taxId || "",
        `"${(c.branch || "").replace(/"/g, '""')}"`,
        `"${(c.address || "").replace(/"/g, '""')}"`,
        c.phone || "",
        c.email || "",
        fee,
        vatInc,
        wht,
        c.status || "active",
        inv?.invoiceNo || "",
        inv?.paymentStatus || "",
        inv?.totalAmount || "",
      ].join(",");
    });

    const csv = BOM + csvHeader + "\n" + csvRows.join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="billing_${year || "all"}_${month || "all"}.csv"`);
    res.send(csv);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

const bankPdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req: any, file: any, cb: any) => {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      cb(null, true);
    } else {
      cb(new Error("อนุญาตเฉพาะไฟล์ PDF เท่านั้น"));
    }
  },
});

app.post("/api/bank-reconciliation/parse-pdf", requireAuth, requireModule("accounting"), bankPdfUpload.single("file"), async (req: any, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "กรุณาอัปโหลดไฟล์ PDF" });
    const { parseBankStatementPdf } = await import("./utils/pdf-bank-statement-parser");
    const result = await parseBankStatementPdf(file.buffer);
    res.json(result);
  } catch (err: any) {
    console.error("Bank PDF parse error:", err);
    res.status(500).json({ message: "ไม่สามารถอ่าน PDF ได้: " + err.message });
  }
});

app.get("/api/bank-reconciliation/statements", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (company.tenantId && user.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    const conditions: any[] = [eq(bankStatements.companyId, companyId)];

    const month = req.query.month ? String(req.query.month) : undefined;
    const year = req.query.year ? String(req.query.year) : undefined;
    if (month && year) {
      const startDate = `${year}-${month.padStart(2, "0")}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${month.padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      conditions.push(gte(bankStatements.statementDate, startDate));
      conditions.push(lte(bankStatements.statementDate, endDate));
    }

    if (req.query.accountCode) {
      conditions.push(eq(bankStatements.accountCode, String(req.query.accountCode)));
    }

    if (req.query.isReconciled !== undefined) {
      const isRec = req.query.isReconciled === "true";
      conditions.push(eq(bankStatements.isReconciled, isRec));
    }

    const whereClause = and(...conditions);

    const statements = await db.select().from(bankStatements)
      .where(whereClause)
      .orderBy(asc(bankStatements.statementDate));

    const totalDebit = statements.reduce((sum, s) => sum + parseFloat(String(s.debitAmount || "0")), 0);
    const totalCredit = statements.reduce((sum, s) => sum + parseFloat(String(s.creditAmount || "0")), 0);
    const unreconciledCount = statements.filter(s => !s.isReconciled).length;

    res.json({
      statements,
      summary: { totalDebit, totalCredit, unreconciledCount, totalCount: statements.length },
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/bank-reconciliation/statements", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const user = req.user as any;
    const { companyId, statements: stmts } = req.body;
    if (!companyId || !Array.isArray(stmts) || stmts.length === 0) {
      return res.status(400).json({ message: "companyId and statements array required" });
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (company.tenantId && user.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    const values = stmts.map((s: any) => ({
      companyId,
      accountCode: s.accountCode || null,
      accountName: s.accountName || null,
      bankName: s.bankName || null,
      statementDate: s.statementDate,
      description: s.description || null,
      debitAmount: String(s.debitAmount || "0"),
      creditAmount: String(s.creditAmount || "0"),
      balance: String(s.balance || "0"),
      reference: s.reference || null,
      isReconciled: false,
      matchedJournalId: null,
    }));

    await db.insert(bankStatements).values(values);
    res.json({ inserted: values.length });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/bank-reconciliation/match", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const user = req.user as any;
    const { statementId, journalEntryId, companyId } = req.body;
    if (!statementId || !journalEntryId || !companyId) {
      return res.status(400).json({ message: "statementId, journalEntryId, companyId required" });
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (company.tenantId && user.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    const [stmt] = await db.select().from(bankStatements)
      .where(and(eq(bankStatements.id, statementId), eq(bankStatements.companyId, companyId)));
    if (!stmt) return res.status(404).json({ message: "Statement not found" });

    const [je] = await db.select().from(journalEntries)
      .where(and(eq(journalEntries.id, journalEntryId), eq(journalEntries.companyId, companyId)));
    if (!je) return res.status(404).json({ message: "Journal entry not found" });

    await db.update(bankStatements)
      .set({ isReconciled: true, matchedJournalId: journalEntryId })
      .where(eq(bankStatements.id, statementId));

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/bank-reconciliation/unmatch", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const user = req.user as any;
    const { statementId, companyId } = req.body;
    if (!statementId || !companyId) {
      return res.status(400).json({ message: "statementId and companyId required" });
    }

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (company.tenantId && user.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    await db.update(bankStatements)
      .set({ isReconciled: false, matchedJournalId: null })
      .where(and(eq(bankStatements.id, statementId), eq(bankStatements.companyId, companyId)));

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/bank-reconciliation/journal-entries", requireAuth, requireModule("accounting"), async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });

    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "Company not found" });
    if (company.tenantId && user.tenantId && company.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate required" });
    }

    const matchedIds = await db.select({ matchedJournalId: bankStatements.matchedJournalId })
      .from(bankStatements)
      .where(and(
        eq(bankStatements.companyId, companyId),
        eq(bankStatements.isReconciled, true),
      ));
    const matchedSet = new Set(matchedIds.map(m => m.matchedJournalId).filter(Boolean));

    const conditions: any[] = [
      eq(journalEntries.companyId, companyId),
      gte(journalEntries.entryDate, startDate),
      lte(journalEntries.entryDate, endDate),
    ];

    const entries = await db.select().from(journalEntries)
      .where(and(...conditions))
      .orderBy(asc(journalEntries.entryDate));

    const unmatched = entries.filter(e => !matchedSet.has(e.id));

    const entriesWithLines = await Promise.all(unmatched.map(async (entry) => {
      const lines = await db.select().from(journalLines)
        .where(eq(journalLines.journalEntryId, entry.id));

      if (req.query.accountCode) {
        const acctCode = String(req.query.accountCode);
        const relevantAccounts = await db.select().from(accounts)
          .where(and(eq(accounts.companyId, companyId), eq(accounts.code, acctCode)));
        const accountIds = new Set(relevantAccounts.map(a => a.id));
        const hasRelevantLine = lines.some(l => accountIds.has(l.accountId));
        if (!hasRelevantLine) return null;
      }

      const totalDebit = lines.reduce((sum, l) => sum + parseFloat(String(l.debit || "0")), 0);
      const totalCredit = lines.reduce((sum, l) => sum + parseFloat(String(l.credit || "0")), 0);

      return { ...entry, lines, totalDebit, totalCredit };
    }));

    res.json(entriesWithLines.filter(Boolean));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

}
