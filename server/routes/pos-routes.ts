import type { Express } from "express";
import { db } from "../db";
import { posDb } from "../pos-db";
import { storage } from "../storage";
import { eq, and, desc, asc, sql, count, ilike, inArray, or, isNull } from "drizzle-orm";
import { activeProducts } from "@shared/schema-extra";
import { posSessions, posTransactions, posTransactionItems, products, productBundles, companies, taxInvoices, taxInvoiceItems, documentSettings, branches, warehouses, warehouseStockLevels, paymentMethods, users, commissionRules, commissionRecords, employees } from "@shared/schema";
import { requireAuth, requireModule , checkDocOwnership} from "../route-middleware";
import { getNextDocNo, createAutoJournalEntry, deductStockBundleAware, getInventoryTriggers } from "../route-helpers";
import { hashPassword } from "../auth";
import multer from "multer";
import * as XLSX from "xlsx";
const staffUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
import { generatePromptPayQRData } from "../utils/promptpay-qr";
import QRCode from "qrcode";

export function registerPosRoutes(app: Express) {
  // ==================== POS MODULE ====================

  // POS Sessions - Open
  app.post("/api/pos/sessions", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, openingCash, branchName, terminalName, storeId } = req.body;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const existing = await posDb.select().from(posSessions)
        .where(and(eq(posSessions.companyId, Number(companyId)), eq(posSessions.userId, user.id), eq(posSessions.status, "open")));
      if (existing.length > 0) return res.status(400).json({ message: "คุณมีกะที่เปิดอยู่แล้ว กรุณาปิดกะก่อนเปิดใหม่", session: existing[0] });

      let resolvedBranchName = branchName || "สำนักงานใหญ่";
      let resolvedWarehouseId: number | null = null;
      if (storeId) {
        const [branch] = await posDb.select().from(branches).where(and(eq(branches.id, Number(storeId)), eq(branches.companyId, Number(companyId))));
        if (!branch) return res.status(400).json({ message: "สาขาไม่ถูกต้องหรือไม่ได้อยู่ในบริษัทนี้" });
        if (branch) {
          resolvedBranchName = branch.name;
          resolvedWarehouseId = branch.warehouseId || null;
          if (!resolvedWarehouseId) {
            const [defaultWh] = await posDb.select().from(warehouses)
              .where(and(eq(warehouses.companyId, Number(companyId)), eq(warehouses.isDefault, true)));
            resolvedWarehouseId = defaultWh?.id || null;
          }
        }
      } else {
        const [defaultWh] = await posDb.select().from(warehouses)
          .where(and(eq(warehouses.companyId, Number(companyId)), eq(warehouses.isDefault, true)));
        resolvedWarehouseId = defaultWh?.id || null;
      }

      const [session] = await posDb.insert(posSessions).values({
        companyId: Number(companyId),
        userId: user.id,
        openingCash: String(openingCash || "0"),
        branchName: resolvedBranchName,
        terminalName: terminalName || "เครื่อง 1",
        storeId: storeId ? Number(storeId) : null,
        warehouseId: resolvedWarehouseId,
        status: "open",
      }).returning();
      res.json(session);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Sessions - Get active session
  app.get("/api/pos/sessions/active", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const [session] = await posDb.select().from(posSessions)
        .where(and(eq(posSessions.companyId, companyId), eq(posSessions.userId, user.id), eq(posSessions.status, "open")));
      res.json(session || null);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Sessions - List
  app.get("/api/pos/sessions", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const sessions = await posDb.select().from(posSessions)
        .where(eq(posSessions.companyId, companyId))
        .orderBy(desc(posSessions.openedAt));
      res.json(sessions);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Sessions - Close
  app.patch("/api/pos/sessions/:id/close", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const sessionId = Number(req.params.id);
      const { closingCash, notes } = req.body;

      const [session] = await posDb.select().from(posSessions).where(eq(posSessions.id, sessionId));
      if (!session) return res.status(404).json({ message: "ไม่พบกะ" });

      const [company] = await db.select().from(companies).where(eq(companies.id, session.companyId));
      if (company && company.tenantId && company.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
      }
      if (session.status !== "open") return res.status(400).json({ message: "กะนี้ถูกปิดแล้ว" });

      let closeBranch: any = null;
      if (session.storeId) {
        const [br] = await db.select().from(branches).where(eq(branches.id, session.storeId));
        if (br) closeBranch = br;
      }

      const txns = await posDb.select().from(posTransactions)
        .where(and(eq(posTransactions.sessionId, sessionId), eq(posTransactions.status, "completed")));

      let totalCashSales = 0;
      let totalSales = 0;
      for (const t of txns) {
        totalSales += parseFloat(String(t.total || "0"));
        if (t.paymentMethod === "เงินสด") {
          totalCashSales += parseFloat(String(t.total || "0"));
        }
      }

      const expectedCash = parseFloat(String(session.openingCash || "0")) + totalCashSales;
      const closingCashVal = parseFloat(String(closingCash || "0"));
      const cashVariance = closingCashVal - expectedCash;

      const [updated] = await posDb.update(posSessions).set({
        closedAt: new Date(),
        closingCash: String(closingCashVal),
        expectedCash: String(expectedCash),
        cashVariance: String(cashVariance),
        totalSales: String(totalSales),
        totalTransactions: txns.length,
        status: "closed",
        notes: notes || null,
      }).where(eq(posSessions.id, sessionId)).returning();

      res.json(updated);

      if (txns.length > 0 && totalSales > 0) {
        setImmediate(async () => {
          try {
            const abbreviatedTxns = txns.filter(t => !t.isFullTaxInvoice);
            const fullTivCount = txns.length - abbreviatedTxns.length;

            if (fullTivCount > 0) {
              console.log(`[POS] Session close: ${fullTivCount} full tax invoice(s) already journaled individually, ${abbreviatedTxns.length} abbreviated to summarize`);
            }

            if (abbreviatedTxns.length === 0) {
              console.log(`[POS] Session closed - all ${txns.length} transactions were full tax invoices, no summary needed`);
              return;
            }

            const paymentBreakdown: Record<string, { total: number; subtotal: number; vat: number }> = {};
            for (const t of abbreviatedTxns) {
              const method = t.paymentMethod || "เงินสด";
              if (!paymentBreakdown[method]) paymentBreakdown[method] = { total: 0, subtotal: 0, vat: 0 };
              paymentBreakdown[method].total += parseFloat(String(t.total || "0"));
              paymentBreakdown[method].subtotal += parseFloat(String(t.subtotal || "0"));
              paymentBreakdown[method].vat += parseFloat(String(t.vatAmount || "0"));
            }

            let abbreviatedTotal = 0;
            let totalSubtotal = 0;
            let totalVat = 0;
            let totalDiscount = 0;
            for (const t of abbreviatedTxns) {
              totalDiscount += parseFloat(String(t.discountAmount || "0"));
            }
            for (const pm of Object.values(paymentBreakdown)) {
              abbreviatedTotal += pm.total;
              totalSubtotal += pm.subtotal;
              totalVat += pm.vat;
            }

            const today = new Date().toISOString().split("T")[0];
            const sessionLabel = session.sessionNo || `กะ #${sessionId}`;
            const summaryBaseSubtotal = Math.round((abbreviatedTotal - totalVat) * 100) / 100;

            const abbrevCount = abbreviatedTxns.length;
            const summaryDesc = fullTivCount > 0
              ? `สรุปยอดขาย POS ${sessionLabel} - ใบกำกับอย่างย่อ ${abbrevCount} บิล (ใบเต็มรูป ${fullTivCount} บิล แยกแล้ว)`
              : `สรุปยอดขาย POS ${sessionLabel} (${abbrevCount} บิล)`;

            const abbreviatedTivIds = abbreviatedTxns
              .map(t => t.taxInvoiceId)
              .filter((id): id is number => id !== null && id !== undefined);

            const summaryTivNo = await getNextDocNo(
              session.companyId, "POSS", taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId,
              undefined, undefined, posDb
            );

            const [summaryTiv] = await posDb.insert(taxInvoices).values({
              companyId: session.companyId,
              taxInvoiceNo: summaryTivNo,
              taxInvoiceDate: today,
              customerName: summaryDesc,
              branch: closeBranch?.name || session.branchName || null,
              sellerBranchId: closeBranch?.code || company?.sellerBranchId || "00000",
              posSessionId: sessionId,
              subtotal: String(summaryBaseSubtotal.toFixed(2)),
              discountAmount: String(totalDiscount.toFixed(2)),
              vatAmount: String(totalVat.toFixed(2)),
              totalAmount: String(abbreviatedTotal.toFixed(2)),
              status: "approved",
              paymentMethod: Object.keys(paymentBreakdown).join(", "),
              priceMode: "included",
              docPrefix: "POSS",
              isSummaryInvoice: true,
              notes: `รวมใบกำกับอย่างย่อ ${abbrevCount} ใบ จากกะ ${sessionLabel}`,
              createdBy: user.id,
            }).returning();

            if (abbreviatedTivIds.length > 0) {
              await posDb.update(taxInvoices)
                .set({ summaryTaxInvoiceId: summaryTiv.id })
                .where(inArray(taxInvoices.id, abbreviatedTivIds));
            }

            const abbrevTxnIds = abbreviatedTxns.map(t => t.id);
            if (abbrevTxnIds.length > 0) {
              const allItems = await posDb.select().from(posTransactionItems)
                .where(inArray(posTransactionItems.transactionId, abbrevTxnIds));

              const grouped: Record<string, { productId: number | null; productCode: string | null; productName: string; qty: number; unitPrice: number; total: number; vatType: string; unit: string }> = {};
              for (const item of allItems) {
                const key = `${item.productId || 0}_${item.unitPrice}_${item.vatType || "vat7"}`;
                if (!grouped[key]) {
                  grouped[key] = {
                    productId: item.productId,
                    productCode: item.productCode || null,
                    productName: item.productName || "",
                    qty: 0,
                    unitPrice: parseFloat(String(item.unitPrice || "0")),
                    total: 0,
                    vatType: item.vatType || "vat7",
                    unit: item.unit || "ชิ้น",
                  };
                }
                grouped[key].qty += parseFloat(String(item.quantity || "0"));
                grouped[key].total += parseFloat(String(item.lineTotal || "0"));
              }

              const summaryItems = Object.values(grouped);
              if (summaryItems.length > 0) {
                await posDb.insert(taxInvoiceItems).values(
                  summaryItems.map(si => ({
                    taxInvoiceId: summaryTiv.id,
                    productId: si.productId,
                    productCode: si.productCode,
                    productName: si.productName,
                    qty: String(si.qty),
                    unit: si.unit,
                    unitPrice: String(si.unitPrice.toFixed(2)),
                    discount: "0",
                    discountType: "amount" as const,
                    total: String(si.total.toFixed(2)),
                    vatType: si.vatType,
                  }))
                );
              }
            }

            console.log(`[POS] Summary tax invoice ${summaryTivNo} created (${abbrevCount} abbreviated invoices → 1 summary for sales tax report)`);

            const pmRows = await posDb.select().from(paymentMethods)
              .where(eq(paymentMethods.companyId, session.companyId));
            const pmAccountMap: Record<string, string> = {};
            for (const pm of pmRows) {
              pmAccountMap[pm.name] = pm.accountCode;
              if (pm.nameTh) pmAccountMap[pm.nameTh] = pm.accountCode;
            }

            const methods = Object.keys(paymentBreakdown);
            const isSingleMethod = methods.length === 1;

            if (isSingleMethod) {
              const singleMethod = methods[0];
              await createAutoJournalEntry({
                companyId: session.companyId,
                documentType: "tax_invoice",
                sourceDocType: "tax_invoice",
                sourceDocId: summaryTiv.id,
                docNo: summaryTivNo,
                docDate: today,
                customerName: summaryDesc,
                subtotal: String(summaryBaseSubtotal.toFixed(2)),
                vatAmount: String(totalVat.toFixed(2)),
                totalAmount: String(abbreviatedTotal.toFixed(2)),
                withholdingTax: "0",
                userId: user.id,
                paymentMethod: singleMethod,
                paymentMethodAccountCode: pmAccountMap[singleMethod] || undefined,
              });
            } else {
              const overrideLines: { accountCode: string; debit: string; credit: string; description: string }[] = [];
              for (const [method, data] of Object.entries(paymentBreakdown)) {
                const acctCode = pmAccountMap[method] || (method === "เงินสด" ? "1001000" : method === "โอนเงิน" ? "1002000" : "1002000");
                overrideLines.push({
                  accountCode: acctCode,
                  debit: String(data.total.toFixed(2)),
                  credit: "0",
                  description: `${summaryTivNo} - ${method}`,
                });
              }
              if (totalVat > 0) {
                overrideLines.push({
                  accountCode: "2341000",
                  debit: "0",
                  credit: String(totalVat.toFixed(2)),
                  description: `${summaryTivNo} - ภาษีขาย`,
                });
              }
              overrideLines.push({
                accountCode: "4100100",
                debit: "0",
                credit: String((abbreviatedTotal - totalVat).toFixed(2)),
                description: `${summaryTivNo} - รายได้อย่างย่อ (${abbrevCount} บิล)`,
              });

              await createAutoJournalEntry({
                companyId: session.companyId,
                documentType: "tax_invoice",
                sourceDocType: "tax_invoice",
                sourceDocId: summaryTiv.id,
                docNo: summaryTivNo,
                docDate: today,
                customerName: summaryDesc,
                subtotal: String(summaryBaseSubtotal.toFixed(2)),
                vatAmount: String(totalVat.toFixed(2)),
                totalAmount: String(abbreviatedTotal.toFixed(2)),
                withholdingTax: "0",
                userId: user.id,
                paymentMethod: "เงินสด",
                overrideLines,
              });
            }
            console.log(`[POS] Session ${sessionLabel} closed - summary TIV + journal (${abbrevCount} abbreviated, ${fullTivCount} full TIV) ฿${abbreviatedTotal.toFixed(2)}`);
          } catch (e: any) { console.error(`[POS] Session close journal error:`, e.message); }
        });
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Sessions - Get summary
  app.get("/api/pos/sessions/:id/summary", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const sessionId = Number(req.params.id);
      const [session] = await posDb.select().from(posSessions).where(eq(posSessions.id, sessionId));
      if (!session) return res.status(404).json({ message: "ไม่พบกะ" });

      const [company] = await db.select().from(companies).where(eq(companies.id, session.companyId));
      if (company && company.tenantId && company.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
      }

      const txns = await posDb.select().from(posTransactions)
        .where(and(eq(posTransactions.sessionId, sessionId), eq(posTransactions.status, "completed")));

      const paymentBreakdown: Record<string, { count: number; total: number }> = {};
      let totalSales = 0;
      for (const t of txns) {
        const amt = parseFloat(String(t.total || "0"));
        totalSales += amt;
        if (!paymentBreakdown[t.paymentMethod]) paymentBreakdown[t.paymentMethod] = { count: 0, total: 0 };
        paymentBreakdown[t.paymentMethod].count++;
        paymentBreakdown[t.paymentMethod].total += amt;
      }

      res.json({
        session,
        totalTransactions: txns.length,
        totalSales,
        paymentBreakdown,
        transactions: txns,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Transactions - Create (complete sale)
  app.post("/api/pos/transactions", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, sessionId, items, paymentMethod, cashReceived, customerId, customerName, discountAmount, fullTaxInvoice, taxCustomerName, taxAddress, taxId, taxBranchId, taxPhone, taxEmail } = req.body;
      if (!companyId || !sessionId || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
      }

      if (fullTaxInvoice && (!taxCustomerName || !taxId)) {
        return res.status(400).json({ message: "กรุณากรอกชื่อและเลขผู้เสียภาษีเพื่อออกใบกำกับภาษีเต็มรูป" });
      }

      const [session] = await posDb.select().from(posSessions).where(eq(posSessions.id, Number(sessionId)));
      if (!session || session.status !== "open") return res.status(400).json({ message: "กะนี้ไม่ได้เปิดอยู่" });
      if (session.companyId !== Number(companyId)) return res.status(403).json({ message: "ข้อมูลกะไม่ตรงกับบริษัท" });

      const [company] = await db.select().from(companies).where(eq(companies.id, Number(companyId)));
      if (company && company.tenantId && company.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
      }

      let sessionBranch: any = null;
      if (session.storeId) {
        const [br] = await db.select().from(branches).where(eq(branches.id, session.storeId));
        if (br) sessionBranch = br;
      }

      const startTime = Date.now();

      let subtotal = 0;
      let vatAmount = 0;
      const processedItems: any[] = [];

      for (const item of items) {
        const qty = parseFloat(String(item.quantity || "1"));
        const unitPrice = parseFloat(String(item.unitPrice || "0"));
        const discount = parseFloat(String(item.discount || "0"));
        const lineTotal = Math.round(((unitPrice * qty) - discount) * 100) / 100;
        subtotal += lineTotal;

        const vatType = item.vatType || "vat7";
        if (vatType === "vat7") {
          vatAmount += lineTotal * 7 / 107;
        }

        processedItems.push({
          productId: Number(item.productId),
          productCode: item.productCode || null,
          productName: item.productName || "",
          quantity: String(qty),
          unitPrice: String(unitPrice),
          discount: String(discount),
          vatType,
          lineTotal: String(lineTotal),
          unit: item.unit || "ชิ้น",
        });
      }

      subtotal = Math.round(subtotal * 100) / 100;
      vatAmount = Math.round(vatAmount * 100) / 100;
      const totalDiscount = Math.round(parseFloat(String(discountAmount || "0")) * 100) / 100;
      const total = Math.round((subtotal - totalDiscount) * 100) / 100;
      const baseSubtotal = Math.round((total - vatAmount) * 100) / 100;
      const cashRcv = parseFloat(String(cashReceived || "0"));
      const change = Math.round((paymentMethod === "เงินสด" ? cashRcv - total : 0) * 100) / 100;

      const [transactionNo, tivNo] = await Promise.all([
        getNextDocNo(Number(companyId), "POS", posTransactions, posTransactions.transactionNo, posTransactions.companyId, undefined, undefined, posDb),
        getNextDocNo(Number(companyId), "POS", taxInvoices, taxInvoices.taxInvoiceNo, taxInvoices.companyId, undefined, undefined, posDb),
      ]);

      const today = new Date().toISOString().split("T")[0];

      const result = await posDb.transaction(async (tx) => {
        const [txn] = await tx.insert(posTransactions).values({
          companyId: Number(companyId),
          sessionId: Number(sessionId),
          transactionNo,
          customerId: customerId ? Number(customerId) : null,
          customerName: customerName || "ลูกค้าทั่วไป",
          paymentMethod: paymentMethod || "เงินสด",
          subtotal: String(subtotal),
          discountAmount: String(totalDiscount),
          vatAmount: String(vatAmount.toFixed(2)),
          total: String(total),
          cashReceived: paymentMethod === "เงินสด" ? String(cashRcv) : null,
          changeAmount: paymentMethod === "เงินสด" ? String(change) : null,
          isFullTaxInvoice: !!fullTaxInvoice,
          status: "completed",
        }).returning();

        const tivCustomerName = fullTaxInvoice ? (taxCustomerName || customerName || "ลูกค้าทั่วไป") : (customerName || "ลูกค้าทั่วไป");
        const [tiv] = await tx.insert(taxInvoices).values({
          companyId: Number(companyId),
          taxInvoiceNo: tivNo,
          taxInvoiceDate: today,
          customerId: customerId ? Number(customerId) : null,
          customerName: tivCustomerName,
          customerAddress: fullTaxInvoice ? (taxAddress || null) : null,
          customerTaxId: fullTaxInvoice ? (taxId || null) : null,
          customerBranchId: fullTaxInvoice ? (taxBranchId || null) : null,
          contactPhone: fullTaxInvoice ? (taxPhone || null) : null,
          contactEmail: fullTaxInvoice ? (taxEmail || null) : null,
          branch: sessionBranch?.name || session.branchName || null,
          sellerBranchId: sessionBranch?.code || company?.sellerBranchId || "00000",
          posSessionId: session.id,
          subtotal: String(baseSubtotal.toFixed(2)),
          discountAmount: String(totalDiscount),
          vatAmount: String(vatAmount.toFixed(2)),
          totalAmount: String(total),
          status: "approved",
          paymentMethod: paymentMethod || "เงินสด",
          priceMode: "included",
          docPrefix: "POS",
          createdBy: user.id,
        }).returning();

        if (processedItems.length > 0) {
          await Promise.all([
            tx.insert(posTransactionItems).values(
              processedItems.map(pi => ({ transactionId: txn.id, ...pi }))
            ),
            tx.insert(taxInvoiceItems).values(
              processedItems.map(pi => ({
                taxInvoiceId: tiv.id,
                productId: Number(pi.productId),
                productCode: pi.productCode,
                productName: pi.productName,
                qty: pi.quantity,
                unit: pi.unit,
                unitPrice: pi.unitPrice,
                discount: pi.discount,
                discountType: "amount" as const,
                total: pi.lineTotal,
                vatType: pi.vatType,
              }))
            ),
          ]);
        }

        await tx.update(posTransactions).set({ taxInvoiceId: tiv.id }).where(eq(posTransactions.id, txn.id));

        return { transaction: { ...txn, taxInvoiceId: tiv.id }, taxInvoice: tiv, processedItems };
      });

      const txTime = Date.now() - startTime;
      console.log(`[POS] Transaction ${result.transaction.transactionNo} saved in ${txTime}ms`);

      res.json(result);

      setImmediate(async () => {
        const bgStart = Date.now();
        const sessionWarehouseId = session.warehouseId;

        const posDeductItems = processedItems
          .filter(pi => pi.productId && parseFloat(String(pi.quantity || "0")) > 0)
          .map(pi => ({ productId: Number(pi.productId), qty: parseFloat(String(pi.quantity || "0")), unitPrice: pi.unitPrice, productName: pi.productName }));
        const posSaleTriggers = await getInventoryTriggers(Number(companyId));
        const docLabel = `POS ${result.transaction.transactionNo}`;
        const deductions = posSaleTriggers.pos_sale_deduct
          ? await deductStockBundleAware(posDeductItems, Number(companyId), docLabel, "tax_invoice", result.taxInvoice.id, user.id, posDb)
          : [];

        if (posSaleTriggers.pos_sale_deduct && sessionWarehouseId && deductions.length > 0) {
          for (const d of deductions) {
            try {
              const [wsl] = await posDb.select().from(warehouseStockLevels)
                .where(and(eq(warehouseStockLevels.warehouseId, sessionWarehouseId), eq(warehouseStockLevels.productId, d.productId)));
              if (wsl) {
                const currentQty = Number(wsl.quantity || "0");
                const deductedAbs = Math.abs(parseFloat(d.deducted));
                const newQty = Math.max(0, currentQty - deductedAbs);
                await posDb.update(warehouseStockLevels).set({ quantity: String(newQty) }).where(eq(warehouseStockLevels.id, wsl.id));
              }
            } catch (e: any) { console.error(`POS warehouse stock deduction failed for product ${d.productId}:`, e.message); }
          }
        }

        if (fullTaxInvoice) {
          try {
            await createAutoJournalEntry({
              companyId: Number(companyId),
              documentType: "tax_invoice",
              sourceDocType: "tax_invoice",
              sourceDocId: result.taxInvoice.id,
              docNo: result.taxInvoice.taxInvoiceNo,
              docDate: result.taxInvoice.taxInvoiceDate,
              customerName: result.taxInvoice.customerName || "ลูกค้าทั่วไป",
              subtotal: String(result.taxInvoice.subtotal || "0"),
              vatAmount: String(result.taxInvoice.vatAmount || "0"),
              totalAmount: String(result.taxInvoice.totalAmount || "0"),
              withholdingTax: "0",
              userId: user.id,
              paymentMethod: paymentMethod || "เงินสด",
            });
            console.log(`[POS] Full tax invoice ${result.taxInvoice.taxInvoiceNo} - journal created immediately for ${result.taxInvoice.customerName}`);
          } catch (e: any) { console.error(`[POS] Full tax invoice journal error:`, e.message); }
        }

        console.log(`[POS] Background tasks done in ${Date.now() - bgStart}ms ${fullTaxInvoice ? '(journal created - full TIV)' : '(journal deferred to session close)'}`);
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Transactions - List by session
  app.get("/api/pos/transactions", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const sessionId = req.query.sessionId ? Number(req.query.sessionId) : null;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      let conditions = [eq(posTransactions.companyId, companyId)];
      if (sessionId) conditions.push(eq(posTransactions.sessionId, sessionId));

      const txns = await posDb.select().from(posTransactions)
        .where(and(...conditions))
        .orderBy(desc(posTransactions.createdAt));
      res.json(txns);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/receipt/:taxInvoiceId", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const taxInvoiceId = Number(req.params.taxInvoiceId);
      const [doc] = await posDb.select().from(taxInvoices).where(eq(taxInvoices.id, taxInvoiceId));
      if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
      const ac = await checkDocOwnership(doc.companyId, req.user);
      if (!ac.allowed) return res.status(403).json({ message: ac.message });
      const [items, [comp], [docSettings]] = await Promise.all([
        posDb.select().from(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, doc.id)),
        db.select().from(companies).where(eq(companies.id, doc.companyId)),
        db.select().from(documentSettings).where(eq(documentSettings.companyId, doc.companyId)).limit(1),
      ]);
      let sessionBranch: any = null;
      if ((doc as any).posSessionId) {
        const [sess] = await posDb.select().from(posSessions).where(eq(posSessions.id, (doc as any).posSessionId));
        if (sess) {
          sessionBranch = { branchName: sess.branchName, terminalName: sess.terminalName, storeId: sess.storeId };
          if (sess.storeId) {
            const [br] = await db.select().from(branches).where(eq(branches.id, sess.storeId));
            if (br) sessionBranch.branch = br;
          }
        }
      }
      res.json({ doc: { ...doc, items }, company: comp || null, docSettings: docSettings || null, session: sessionBranch });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Transactions - Get detail with items
  app.get("/api/pos/transactions/:id", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      const [txn] = await posDb.select().from(posTransactions).where(eq(posTransactions.id, id));
      if (!txn) return res.status(404).json({ message: "ไม่พบรายการ" });

      const [company] = await db.select().from(companies).where(eq(companies.id, txn.companyId));
      if (company && company.tenantId && company.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
      }

      const items = await posDb.select().from(posTransactionItems)
        .where(eq(posTransactionItems.transactionId, id));
      res.json({ ...txn, items });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Transactions - Void
  app.patch("/api/pos/transactions/:id/void", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      const [txn] = await posDb.select().from(posTransactions).where(eq(posTransactions.id, id));
      if (!txn) return res.status(404).json({ message: "ไม่พบรายการ" });

      const [company] = await db.select().from(companies).where(eq(companies.id, txn.companyId));
      if (company && company.tenantId && company.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
      }

      if (txn.status === "voided") return res.status(400).json({ message: "รายการนี้ถูกยกเลิกแล้ว" });

      const voidItems = await posDb.select().from(posTransactionItems).where(eq(posTransactionItems.transactionId, id));
      const [voidSession] = await posDb.select().from(posSessions).where(eq(posSessions.id, txn.sessionId));
      const sessionWarehouseId = voidSession?.warehouseId;

      await posDb.update(posTransactions).set({ status: "voided" }).where(eq(posTransactions.id, id));

      if (txn.taxInvoiceId) {
        await posDb.update(taxInvoices).set({ status: "cancelled" }).where(eq(taxInvoices.id, txn.taxInvoiceId));
      }

      const posVoidTriggers = await getInventoryTriggers(txn.companyId);
      if (posVoidTriggers.pos_void_restore && sessionWarehouseId && voidItems.length > 0) {
        const voidProductIds = [...new Set(voidItems.map(i => i.productId).filter(Boolean))] as number[];
        const voidProds = await posDb.select({ id: products.id, productType: products.productType })
          .from(products).where(inArray(products.id, voidProductIds));
        const voidTypeMap: Record<number, string> = {};
        for (const p of voidProds) voidTypeMap[p.id] = p.productType || "simple";
        const voidBundleIds = voidProds.filter(p => p.productType === "bundle").map(p => p.id);
        const voidCompMap: Record<number, { componentProductId: number; qty: string }[]> = {};
        if (voidBundleIds.length > 0) {
          const comps = await posDb.select().from(productBundles).where(inArray(productBundles.bundleProductId, voidBundleIds));
          for (const c of comps) {
            if (!voidCompMap[c.bundleProductId]) voidCompMap[c.bundleProductId] = [];
            voidCompMap[c.bundleProductId].push({ componentProductId: c.componentProductId, qty: c.qty });
          }
        }
        const restoreWarehouseStock = async (productId: number, qty: number) => {
          const [wsl] = await posDb.select().from(warehouseStockLevels)
            .where(and(eq(warehouseStockLevels.warehouseId, sessionWarehouseId), eq(warehouseStockLevels.productId, productId)));
          if (wsl) {
            await posDb.update(warehouseStockLevels).set({ quantity: String(Number(wsl.quantity || "0") + qty) }).where(eq(warehouseStockLevels.id, wsl.id));
          } else {
            await posDb.insert(warehouseStockLevels).values({ companyId: txn.companyId, productId, warehouseId: sessionWarehouseId, quantity: String(qty), reservedQty: "0" }).catch(() => {});
          }
        };
        for (const item of voidItems) {
          if (!item.productId || !item.quantity) continue;
          const pid = Number(item.productId);
          const qty = parseFloat(String(item.quantity || "0"));
          if (qty <= 0) continue;
          const pType = voidTypeMap[pid] || "simple";
          if (pType === "bundle" && voidCompMap[pid]?.length > 0) {
            for (const comp of voidCompMap[pid]) {
              await restoreWarehouseStock(comp.componentProductId, qty * parseFloat(comp.qty || "1"));
            }
          } else {
            await restoreWarehouseStock(pid, qty);
          }
        }
      }

      res.json({ message: "ยกเลิกรายการสำเร็จ" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Products - Search with barcode support
  app.get("/api/pos/products", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const rawSearch = String(req.query.search || "");
      const search = rawSearch.replace(/^\*+|\*+$/g, "").trim();
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      let conditions = [eq(products.companyId, companyId)];
      if (search) {
        conditions.push(
          or(
            ilike(products.code, `%${search}%`),
            ilike(products.name, `%${search}%`),
            eq(products.barcode, search),
          )!
        );
      }

      const result = await posDb.select().from(products)
        .innerJoin(activeProducts, eq(activeProducts.id, products.id))
        .where(and(...conditions))
        .orderBy(asc(products.name));
      res.json(result.map((r: any) => r.products ?? r));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/bundles/:productId", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const productId = Number(req.params.productId);
      const bundles = await posDb.select().from(productBundles).where(eq(productBundles.bundleProductId, productId));
      if (req.query.enriched === "1") {
        const productIds = [...new Set(bundles.map(b => b.componentProductId))];
        const prods = productIds.length > 0
          ? await posDb.select().from(products).where(sql`${products.id} IN (${sql.join(productIds.map(id => sql`${id}`), sql`,`)})`)
          : [];
        const prodMap = new Map(prods.map(p => [p.id, p]));
        const enriched = bundles.map(b => {
          const p = prodMap.get(b.componentProductId);
          return { ...b, productName: p?.name || `สินค้า #${b.componentProductId}`, productCode: p?.code || "", productBarcode: p?.barcode || "" };
        });
        return res.json(enriched);
      }
      res.json(bundles);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/bundle-product-ids", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const allBundles = await posDb.select({ bundleProductId: productBundles.bundleProductId })
        .from(productBundles)
        .innerJoin(products, eq(products.id, productBundles.bundleProductId))
        .innerJoin(activeProducts, eq(activeProducts.id, products.id))
        .where(eq(products.companyId, companyId));
      const ids = [...new Set(allBundles.map(b => b.bundleProductId))];
      res.json(ids);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // POS Daily Summary
  app.get("/api/pos/daily-summary", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const date = String(req.query.date || new Date().toISOString().split("T")[0]);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const startOfDay = new Date(date + "T00:00:00");
      const endOfDay = new Date(date + "T23:59:59");

      const sessions = await posDb.select().from(posSessions)
        .where(and(
          eq(posSessions.companyId, companyId),
          sql`${posSessions.openedAt} >= ${startOfDay}`,
          sql`${posSessions.openedAt} <= ${endOfDay}`,
        )).orderBy(desc(posSessions.openedAt));

      const sessionIds = sessions.map(s => s.id);
      let txns: any[] = [];
      if (sessionIds.length > 0) {
        txns = await posDb.select().from(posTransactions)
          .where(and(
            eq(posTransactions.companyId, companyId),
            inArray(posTransactions.sessionId, sessionIds),
            eq(posTransactions.status, "completed"),
          ));
      }

      const paymentBreakdown: Record<string, { count: number; total: number }> = {};
      let totalSales = 0;
      for (const t of txns) {
        const amt = parseFloat(String(t.total || "0"));
        totalSales += amt;
        if (!paymentBreakdown[t.paymentMethod]) paymentBreakdown[t.paymentMethod] = { count: 0, total: 0 };
        paymentBreakdown[t.paymentMethod].count++;
        paymentBreakdown[t.paymentMethod].total += amt;
      }

      res.json({
        date,
        totalSessions: sessions.length,
        totalTransactions: txns.length,
        totalSales,
        paymentBreakdown,
        sessions: sessions.map(s => ({
          ...s,
          transactions: txns.filter(t => t.sessionId === s.id),
        })),
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/dashboard", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
      if (company && company.tenantId && company.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const allTxns = await posDb.select().from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`${posTransactions.createdAt} >= ${todayStart}`,
          sql`${posTransactions.createdAt} <= ${todayEnd}`,
        ));

      const txnSessionIds = [...new Set(allTxns.map(t => t.sessionId))];

      const allSessions = txnSessionIds.length > 0
        ? await posDb.select().from(posSessions).where(inArray(posSessions.id, txnSessionIds))
        : [];

      const openSessions = await posDb.select().from(posSessions)
        .where(and(eq(posSessions.companyId, companyId), eq(posSessions.status, "open")));
      for (const os of openSessions) {
        if (!allSessions.find(s => s.id === os.id)) allSessions.push(os);
      }

      const sessionMap = new Map<number, typeof allSessions[0]>();
      for (const s of allSessions) sessionMap.set(s.id, s);

      const branchData: Record<string, {
        branchName: string;
        storeId: number | null;
        openSessions: number;
        closedSessions: number;
        totalTransactions: number;
        totalSales: number;
        totalVat: number;
        paymentBreakdown: Record<string, { count: number; total: number }>;
        hourlySales: Record<number, number>;
      }> = {};

      for (const s of allSessions) {
        const key = s.branchName || "สำนักงานใหญ่";
        if (!branchData[key]) {
          branchData[key] = {
            branchName: key,
            storeId: s.storeId,
            openSessions: 0,
            closedSessions: 0,
            totalTransactions: 0,
            totalSales: 0,
            totalVat: 0,
            paymentBreakdown: {},
            hourlySales: {},
          };
        }
        if (s.status === "open") branchData[key].openSessions++;
        else branchData[key].closedSessions++;
      }

      let grandTotal = 0;
      let grandTxnCount = 0;
      let grandVat = 0;
      const grandPayment: Record<string, { count: number; total: number }> = {};
      const grandHourly: Record<number, number> = {};

      for (const t of allTxns) {
        const sess = sessionMap.get(t.sessionId);
        const key = sess?.branchName || "สำนักงานใหญ่";
        const bd = branchData[key];
        if (!bd) continue;

        const amt = parseFloat(String(t.total || "0"));
        const vat = parseFloat(String(t.vatAmount || "0"));
        const hr = new Date(t.createdAt).getHours();

        bd.totalTransactions++;
        bd.totalSales += amt;
        bd.totalVat += vat;
        if (!bd.paymentBreakdown[t.paymentMethod]) bd.paymentBreakdown[t.paymentMethod] = { count: 0, total: 0 };
        bd.paymentBreakdown[t.paymentMethod].count++;
        bd.paymentBreakdown[t.paymentMethod].total += amt;
        bd.hourlySales[hr] = (bd.hourlySales[hr] || 0) + amt;

        grandTotal += amt;
        grandTxnCount++;
        grandVat += vat;
        if (!grandPayment[t.paymentMethod]) grandPayment[t.paymentMethod] = { count: 0, total: 0 };
        grandPayment[t.paymentMethod].count++;
        grandPayment[t.paymentMethod].total += amt;
        grandHourly[hr] = (grandHourly[hr] || 0) + amt;
      }

      const branches = Object.values(branchData).sort((a, b) => b.totalSales - a.totalSales);

      res.json({
        date: todayStart.toISOString().split("T")[0],
        overall: {
          totalSessions: allSessions.length,
          openSessions: allSessions.filter(s => s.status === "open").length,
          closedSessions: allSessions.filter(s => s.status !== "open").length,
          totalTransactions: grandTxnCount,
          totalSales: grandTotal,
          totalVat: grandVat,
          avgPerTransaction: grandTxnCount > 0 ? grandTotal / grandTxnCount : 0,
          paymentBreakdown: grandPayment,
          hourlySales: grandHourly,
        },
        branches,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/sales", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const rows = await posDb.select().from(taxInvoices)
        .where(and(
          eq(taxInvoices.companyId, companyId),
          sql`${taxInvoices.taxInvoiceNo} LIKE 'POS%'`
        ))
        .orderBy(desc(taxInvoices.createdAt));
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/sales/:id", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const [doc] = await posDb.select().from(taxInvoices).where(
        and(
          eq(taxInvoices.id, Number(req.params.id)),
          eq(taxInvoices.companyId, companyId),
          sql`${taxInvoices.taxInvoiceNo} LIKE 'POS%'`
        )
      );
      if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const items = await posDb.select().from(taxInvoiceItems).where(eq(taxInvoiceItems.taxInvoiceId, doc.id));
      res.json({ ...doc, items });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/promptpay-qr", requireAuth, async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const amount = parseFloat(req.query.amount as string) || 0;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const [settings] = await posDb.select().from(documentSettings)
        .where(eq(documentSettings.companyId, companyId)).limit(1);

      if (!settings?.promptpayEnabled || !settings?.promptpayId) {
        return res.status(404).json({ message: "ยังไม่ได้ตั้งค่า PromptPay กรุณาไปที่ ตั้งค่า > เอกสาร > โลโก้ เพื่อเปิดใช้งาน PromptPay" });
      }

      const qrData = generatePromptPayQRData(settings.promptpayId, amount);
      const qrImageDataUrl = await QRCode.toDataURL(qrData, { width: 300, margin: 2, errorCorrectionLevel: "M" });

      res.json({
        qrImage: qrImageDataUrl,
        promptpayId: settings.promptpayId,
        promptpayType: settings.promptpayType || "phone",
        amount,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/branches", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const branchList = await posDb.select().from(branches)
        .where(and(eq(branches.companyId, companyId), eq(branches.active, true)))
        .orderBy(branches.code);
      const warehouseList = await posDb.select().from(warehouses)
        .where(and(eq(warehouses.companyId, companyId), eq(warehouses.active, true)));
      const whMap = new Map(warehouseList.map(w => [w.id, w]));
      const result = branchList.map(b => ({
        ...b,
        warehouse: b.warehouseId ? whMap.get(b.warehouseId) || null : null,
      }));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pos/branches", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, code, name, address, taxId, phone, manager } = req.body;
      if (!companyId || !name) return res.status(400).json({ message: "กรุณาระบุชื่อสาขา" });

      const branchCode = code || String(await posDb.select({ cnt: count() }).from(branches).where(eq(branches.companyId, Number(companyId))).then(r => (r[0]?.cnt || 0) + 1)).padStart(5, "0");

      const [wh] = await posDb.insert(warehouses).values({
        companyId: Number(companyId),
        code: `WH-${branchCode}`,
        name: `คลัง ${name}`,
        isDefault: false,
        active: true,
      }).returning();

      const [branch] = await posDb.insert(branches).values({
        companyId: Number(companyId),
        code: branchCode,
        name,
        address: address || null,
        phone: phone || null,
        manager: manager || null,
        taxId: taxId || null,
        warehouseId: wh.id,
        active: true,
      }).returning();

      res.json({ ...branch, warehouse: wh });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/pos/branches/:id", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      const { name, code, address, phone, manager } = req.body;
      const [existing] = await posDb.select().from(branches).where(eq(branches.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบสาขา" });

      const [company] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
      if (!company || company.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขสาขานี้" });
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (code !== undefined) updateData.code = code;
      if (address !== undefined) updateData.address = address;
      if (phone !== undefined) updateData.phone = phone;
      if (manager !== undefined) updateData.manager = manager;

      const [updated] = await posDb.update(branches).set(updateData).where(eq(branches.id, id)).returning();

      if (updated.warehouseId && name) {
        await posDb.update(warehouses).set({ name: `คลัง ${name}` }).where(eq(warehouses.id, updated.warehouseId));
      }

      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/pos/branches/:id", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      const [existing] = await posDb.select().from(branches).where(eq(branches.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบสาขา" });

      const [company] = await db.select().from(companies).where(eq(companies.id, existing.companyId));
      if (!company || company.tenantId !== user.tenantId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์ลบสาขานี้" });
      }

      const sessionsCount = await posDb.select({ cnt: count() }).from(posSessions).where(eq(posSessions.storeId, id));
      if (Number(sessionsCount[0]?.cnt || 0) > 0) {
        return res.status(400).json({ message: "ไม่สามารถลบสาขาที่มีประวัติกะขายได้" });
      }

      await posDb.delete(branches).where(eq(branches.id, id));
      res.json({ message: "ลบสาขาสำเร็จ" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/summary-invoice/:id/details", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const summaryId = Number(req.params.id);
      const [summary] = await posDb.select().from(taxInvoices).where(eq(taxInvoices.id, summaryId));
      if (!summary || !summary.isSummaryInvoice) return res.status(404).json({ message: "ไม่พบใบสรุป" });

      const details = await posDb.select({
        id: taxInvoices.id,
        taxInvoiceNo: taxInvoices.taxInvoiceNo,
        taxInvoiceDate: taxInvoices.taxInvoiceDate,
        customerName: taxInvoices.customerName,
        subtotal: taxInvoices.subtotal,
        vatAmount: taxInvoices.vatAmount,
        totalAmount: taxInvoices.totalAmount,
      }).from(taxInvoices)
        .where(eq(taxInvoices.summaryTaxInvoiceId, summaryId))
        .orderBy(taxInvoices.taxInvoiceNo);

      res.json({ summary, details });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/warehouse-stock", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const warehouseId = Number(req.query.warehouseId);
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      if (warehouseId) {
        const levels = await posDb.select({
          productId: warehouseStockLevels.productId,
          quantity: warehouseStockLevels.quantity,
        }).from(warehouseStockLevels).where(eq(warehouseStockLevels.warehouseId, warehouseId));
        const stockMap: Record<number, number> = {};
        for (const l of levels) stockMap[l.productId] = Number(l.quantity || 0);
        return res.json(stockMap);
      }
      res.json({});
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/reports/dashboard", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const from = String(req.query.from || new Date(new Date().setDate(1)).toISOString().split("T")[0]);
      const to = String(req.query.to || new Date().toISOString().split("T")[0]);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const salesData = await db.select({
        totalSales: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        totalTransactions: sql<string>`COUNT(*)`,
        avgTicket: sql<string>`COALESCE(AVG(${posTransactions.total}), 0)`,
        totalDiscount: sql<string>`COALESCE(SUM(${posTransactions.discountAmount}), 0)`,
        totalVat: sql<string>`COALESCE(SUM(${posTransactions.vatAmount}), 0)`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ));

      const prevFrom = new Date(new Date(from).getTime() - (new Date(to).getTime() - new Date(from).getTime() + 86400000));
      const prevTo = new Date(new Date(from).getTime() - 86400000);
      const prevSales = await posDb.select({
        totalSales: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        totalTransactions: sql<string>`COUNT(*)`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${prevFrom.toISOString().split("T")[0]}`,
          sql`DATE(${posTransactions.createdAt}) <= ${prevTo.toISOString().split("T")[0]}`,
        ));

      const dailySales = await posDb.select({
        date: sql<string>`DATE(${posTransactions.createdAt})`,
        total: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        count: sql<string>`COUNT(*)`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(sql`DATE(${posTransactions.createdAt})`)
        .orderBy(sql`DATE(${posTransactions.createdAt})`);

      const topProducts = await posDb.select({
        productId: posTransactionItems.productId,
        productName: posTransactionItems.productName,
        productCode: posTransactionItems.productCode,
        totalQty: sql<string>`COALESCE(SUM(CAST(${posTransactionItems.quantity} AS numeric)), 0)`,
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${posTransactionItems.lineTotal} AS numeric)), 0)`,
      }).from(posTransactionItems)
        .innerJoin(posTransactions, eq(posTransactionItems.transactionId, posTransactions.id))
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(posTransactionItems.productId, posTransactionItems.productName, posTransactionItems.productCode)
        .orderBy(sql`SUM(CAST(${posTransactionItems.lineTotal} AS numeric)) DESC`)
        .limit(10);

      const paymentBreakdown = await posDb.select({
        method: posTransactions.paymentMethod,
        total: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        count: sql<string>`COUNT(*)`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(posTransactions.paymentMethod);

      res.json({
        summary: salesData[0],
        previousPeriod: prevSales[0],
        dailySales,
        topProducts,
        paymentBreakdown,
      });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/reports/sales-by-branch", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const from = String(req.query.from || new Date(new Date().setDate(1)).toISOString().split("T")[0]);
      const to = String(req.query.to || new Date().toISOString().split("T")[0]);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const branchSales = await posDb.select({
        storeId: posSessions.storeId,
        branchName: posSessions.branchName,
        totalSales: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        totalTransactions: sql<string>`COUNT(${posTransactions.id})`,
        avgTicket: sql<string>`COALESCE(AVG(${posTransactions.total}), 0)`,
        totalDiscount: sql<string>`COALESCE(SUM(${posTransactions.discountAmount}), 0)`,
      }).from(posTransactions)
        .innerJoin(posSessions, eq(posTransactions.sessionId, posSessions.id))
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(posSessions.storeId, posSessions.branchName)
        .orderBy(sql`SUM(${posTransactions.total}) DESC`);

      const branchDaily = await posDb.select({
        storeId: posSessions.storeId,
        branchName: posSessions.branchName,
        date: sql<string>`DATE(${posTransactions.createdAt})`,
        total: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        count: sql<string>`COUNT(${posTransactions.id})`,
      }).from(posTransactions)
        .innerJoin(posSessions, eq(posTransactions.sessionId, posSessions.id))
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(posSessions.storeId, posSessions.branchName, sql`DATE(${posTransactions.createdAt})`)
        .orderBy(sql`DATE(${posTransactions.createdAt})`);

      res.json({ branches: branchSales, dailyByBranch: branchDaily });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/reports/sales-by-product", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const from = String(req.query.from || new Date(new Date().setDate(1)).toISOString().split("T")[0]);
      const to = String(req.query.to || new Date().toISOString().split("T")[0]);
      const storeId = req.query.storeId ? Number(req.query.storeId) : null;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      let conditions = [
        eq(posTransactions.companyId, companyId),
        eq(posTransactions.status, "completed"),
        sql`DATE(${posTransactions.createdAt}) >= ${from}`,
        sql`DATE(${posTransactions.createdAt}) <= ${to}`,
      ];
      if (storeId) conditions.push(eq(posSessions.storeId, storeId));

      const productSales = await posDb.select({
        productId: posTransactionItems.productId,
        productName: posTransactionItems.productName,
        productCode: posTransactionItems.productCode,
        totalQty: sql<string>`COALESCE(SUM(CAST(${posTransactionItems.quantity} AS numeric)), 0)`,
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${posTransactionItems.lineTotal} AS numeric)), 0)`,
        totalDiscount: sql<string>`COALESCE(SUM(CAST(${posTransactionItems.discount} AS numeric)), 0)`,
        avgPrice: sql<string>`COALESCE(AVG(CAST(${posTransactionItems.unitPrice} AS numeric)), 0)`,
        transactionCount: sql<string>`COUNT(DISTINCT ${posTransactions.id})`,
      }).from(posTransactionItems)
        .innerJoin(posTransactions, eq(posTransactionItems.transactionId, posTransactions.id))
        .innerJoin(posSessions, eq(posTransactions.sessionId, posSessions.id))
        .where(and(...conditions))
        .groupBy(posTransactionItems.productId, posTransactionItems.productName, posTransactionItems.productCode)
        .orderBy(sql`SUM(CAST(${posTransactionItems.lineTotal} AS numeric)) DESC`);

      res.json(productSales);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/reports/sales-by-category", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const from = String(req.query.from || new Date(new Date().setDate(1)).toISOString().split("T")[0]);
      const to = String(req.query.to || new Date().toISOString().split("T")[0]);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const categorySales = await posDb.select({
        category: sql<string>`COALESCE(${products.category}, 'ไม่มีหมวดหมู่')`,
        totalQty: sql<string>`COALESCE(SUM(CAST(${posTransactionItems.quantity} AS numeric)), 0)`,
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${posTransactionItems.lineTotal} AS numeric)), 0)`,
        productCount: sql<string>`COUNT(DISTINCT ${posTransactionItems.productId})`,
        transactionCount: sql<string>`COUNT(DISTINCT ${posTransactions.id})`,
      }).from(posTransactionItems)
        .innerJoin(posTransactions, eq(posTransactionItems.transactionId, posTransactions.id))
        .leftJoin(products, eq(posTransactionItems.productId, products.id))
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(sql`COALESCE(${products.category}, 'ไม่มีหมวดหมู่')`)
        .orderBy(sql`SUM(CAST(${posTransactionItems.lineTotal} AS numeric)) DESC`);

      res.json(categorySales);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/reports/best-sellers", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const from = String(req.query.from || new Date(new Date().setDate(1)).toISOString().split("T")[0]);
      const to = String(req.query.to || new Date().toISOString().split("T")[0]);
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const bestSellers = await posDb.select({
        productId: posTransactionItems.productId,
        productName: posTransactionItems.productName,
        productCode: posTransactionItems.productCode,
        branchName: posSessions.branchName,
        storeId: posSessions.storeId,
        totalQty: sql<string>`COALESCE(SUM(CAST(${posTransactionItems.quantity} AS numeric)), 0)`,
        totalRevenue: sql<string>`COALESCE(SUM(CAST(${posTransactionItems.lineTotal} AS numeric)), 0)`,
      }).from(posTransactionItems)
        .innerJoin(posTransactions, eq(posTransactionItems.transactionId, posTransactions.id))
        .innerJoin(posSessions, eq(posTransactions.sessionId, posSessions.id))
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(posTransactionItems.productId, posTransactionItems.productName, posTransactionItems.productCode, posSessions.branchName, posSessions.storeId)
        .orderBy(sql`SUM(CAST(${posTransactionItems.lineTotal} AS numeric)) DESC`)
        .limit(limit);

      res.json(bestSellers);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/reports/payment-analysis", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const from = String(req.query.from || new Date(new Date().setDate(1)).toISOString().split("T")[0]);
      const to = String(req.query.to || new Date().toISOString().split("T")[0]);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const paymentByMethod = await posDb.select({
        method: posTransactions.paymentMethod,
        total: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        count: sql<string>`COUNT(*)`,
        avgAmount: sql<string>`COALESCE(AVG(${posTransactions.total}), 0)`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(posTransactions.paymentMethod)
        .orderBy(sql`SUM(${posTransactions.total}) DESC`);

      const dailyByMethod = await posDb.select({
        method: posTransactions.paymentMethod,
        date: sql<string>`DATE(${posTransactions.createdAt})`,
        total: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        count: sql<string>`COUNT(*)`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(posTransactions.paymentMethod, sql`DATE(${posTransactions.createdAt})`)
        .orderBy(sql`DATE(${posTransactions.createdAt})`);

      res.json({ summary: paymentByMethod, daily: dailyByMethod });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/reports/cashier-performance", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const from = String(req.query.from || new Date(new Date().setDate(1)).toISOString().split("T")[0]);
      const to = String(req.query.to || new Date().toISOString().split("T")[0]);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const cashierStats = await posDb.select({
        userId: posSessions.userId,
        totalSales: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        totalTransactions: sql<string>`COUNT(${posTransactions.id})`,
        avgTicket: sql<string>`COALESCE(AVG(${posTransactions.total}), 0)`,
        totalDiscount: sql<string>`COALESCE(SUM(${posTransactions.discountAmount}), 0)`,
        sessionCount: sql<string>`COUNT(DISTINCT ${posSessions.id})`,
        totalCashVariance: sql<string>`COALESCE(SUM(CAST(${posSessions.cashVariance} AS numeric)), 0)`,
      }).from(posTransactions)
        .innerJoin(posSessions, eq(posTransactions.sessionId, posSessions.id))
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(posSessions.userId)
        .orderBy(sql`SUM(${posTransactions.total}) DESC`);

      const userIds = cashierStats.map(c => c.userId).filter(Boolean);
      let userMap: Record<number, string> = {};
      if (userIds.length > 0) {
        const { users } = await import("@shared/schema");
        const userData = await db.select({ id: users.id, fullName: users.fullName }).from(users)
          .where(sql`${users.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`,`)})`);
        for (const u of userData) userMap[u.id] = u.fullName;
      }

      const enriched = cashierStats.map(c => ({
        ...c,
        userName: userMap[c.userId!] || `พนักงาน #${c.userId}`,
      }));

      res.json(enriched);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/reports/hourly-trends", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const from = String(req.query.from || new Date(new Date().setDate(1)).toISOString().split("T")[0]);
      const to = String(req.query.to || new Date().toISOString().split("T")[0]);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const hourlyData = await posDb.select({
        hour: sql<string>`EXTRACT(HOUR FROM ${posTransactions.createdAt})`,
        total: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        count: sql<string>`COUNT(*)`,
        avgTicket: sql<string>`COALESCE(AVG(${posTransactions.total}), 0)`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(sql`EXTRACT(HOUR FROM ${posTransactions.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${posTransactions.createdAt})`);

      const dayOfWeek = await posDb.select({
        day: sql<string>`EXTRACT(DOW FROM ${posTransactions.createdAt})`,
        total: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        count: sql<string>`COUNT(*)`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) >= ${from}`,
          sql`DATE(${posTransactions.createdAt}) <= ${to}`,
        ))
        .groupBy(sql`EXTRACT(DOW FROM ${posTransactions.createdAt})`)
        .orderBy(sql`EXTRACT(DOW FROM ${posTransactions.createdAt})`);

      res.json({ hourly: hourlyData, dayOfWeek });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/reports/daily-summary", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const date = String(req.query.date || new Date().toISOString().split("T")[0]);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });

      const sales = await db.select({
        totalSales: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        totalTransactions: sql<string>`COUNT(*)`,
        totalDiscount: sql<string>`COALESCE(SUM(${posTransactions.discountAmount}), 0)`,
        totalVat: sql<string>`COALESCE(SUM(${posTransactions.vatAmount}), 0)`,
        voidCount: sql<string>`COUNT(*) FILTER (WHERE ${posTransactions.status} = 'voided')`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          sql`DATE(${posTransactions.createdAt}) = ${date}`,
        ));

      const sessions = await db.select({
        id: posSessions.id,
        branchName: posSessions.branchName,
        terminalName: posSessions.terminalName,
        status: posSessions.status,
        openedAt: posSessions.openedAt,
        closedAt: posSessions.closedAt,
        totalSales: posSessions.totalSales,
        totalTransactions: posSessions.totalTransactions,
        cashVariance: posSessions.cashVariance,
      }).from(posSessions)
        .where(and(
          eq(posSessions.companyId, companyId),
          sql`DATE(${posSessions.openedAt}) = ${date}`,
        ))
        .orderBy(desc(posSessions.openedAt));

      const hourly = await posDb.select({
        hour: sql<string>`EXTRACT(HOUR FROM ${posTransactions.createdAt})`,
        total: sql<string>`COALESCE(SUM(${posTransactions.total}), 0)`,
        count: sql<string>`COUNT(*)`,
      }).from(posTransactions)
        .where(and(
          eq(posTransactions.companyId, companyId),
          eq(posTransactions.status, "completed"),
          sql`DATE(${posTransactions.createdAt}) = ${date}`,
        ))
        .groupBy(sql`EXTRACT(HOUR FROM ${posTransactions.createdAt})`)
        .orderBy(sql`EXTRACT(HOUR FROM ${posTransactions.createdAt})`);

      res.json({ summary: sales[0], sessions, hourly });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ==================== POS STAFF MANAGEMENT ====================

  app.get("/api/pos/hr-employees", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      const tenantId = currentUser.tenantId;
      if (!tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.json([]);

      const emps = await db.select({
        id: employees.id,
        fullName: employees.fullName,
        position: employees.position,
        department: employees.department,
        userId: employees.userId,
        active: employees.active,
      }).from(employees).where(and(
        eq(employees.companyId, companyId),
        eq(employees.active, true),
      ));

      res.json(emps);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/staff", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      const tenantId = currentUser.tenantId;
      if (!tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

      const companyId = Number(req.query.companyId);

      const conditions = [eq(users.tenantId, tenantId)];
      if (companyId) {
        conditions.push(sql`${users.allowedCompanyIds} @> ARRAY[${companyId}]::int[]`);
      }

      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        fullName: users.fullName,
        role: users.role,
        active: users.active,
        allowedCompanyIds: users.allowedCompanyIds,
        allowedBranchIds: users.allowedBranchIds,
      }).from(users).where(and(...conditions));

      const companyBranches = companyId
        ? await db.select().from(branches).where(eq(branches.companyId, companyId))
        : await db.select().from(branches);

      const linkedEmployeeIds = allUsers.map(u => u.id);
      const linkedEmps = linkedEmployeeIds.length > 0
        ? await db.select({ userId: employees.userId, fullName: employees.fullName, position: employees.position, id: employees.id })
            .from(employees).where(and(
              inArray(employees.userId, linkedEmployeeIds),
              companyId ? eq(employees.companyId, companyId) : sql`1=1`,
            ))
        : [];

      const staffList = allUsers.map(u => {
        const linkedEmp = linkedEmps.find(e => e.userId === u.id);
        return {
          ...u,
          branchNames: u.allowedBranchIds?.map(bid => {
            const b = companyBranches.find(br => br.id === bid);
            return b ? b.name : `สาขา #${bid}`;
          }) || [],
          linkedEmployee: linkedEmp ? { employeeId: linkedEmp.id, fullName: linkedEmp.fullName, position: linkedEmp.position } : null,
        };
      });

      res.json(staffList);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pos/staff", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      const tenantId = currentUser.tenantId;
      if (!tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

      const { username, password, fullName, role, allowedCompanyIds, allowedBranchIds, linkEmployeeId } = req.body;
      if (!username || !password || !fullName) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });

      const existing = await db.select().from(users).where(eq(users.username, username));
      if (existing.length > 0) return res.status(400).json({ message: `ชื่อผู้ใช้ "${username}" ถูกใช้แล้ว` });

      const hashed = await hashPassword(password);
      const [newUser] = await db.insert(users).values({
        username,
        password: hashed,
        fullName,
        role: role || "staff",
        active: true,
        tenantId,
        allowedCompanyIds: allowedCompanyIds || [],
        allowedBranchIds: allowedBranchIds || [],
      }).returning();

      if (linkEmployeeId) {
        await db.update(employees).set({ userId: newUser.id }).where(and(
          eq(employees.id, Number(linkEmployeeId)),
          isNull(employees.userId),
        ));
      }

      res.json(newUser);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/pos/staff/:id", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      const tenantId = currentUser.tenantId;
      const staffId = Number(req.params.id);

      const [target] = await db.select().from(users).where(and(eq(users.id, staffId), eq(users.tenantId, tenantId)));
      if (!target) return res.status(404).json({ message: "ไม่พบพนักงาน" });

      const { fullName, role, active, allowedCompanyIds, allowedBranchIds, password } = req.body;
      const updates: any = {};
      if (fullName !== undefined) updates.fullName = fullName;
      if (role !== undefined) updates.role = role;
      if (active !== undefined) updates.active = active;
      if (allowedCompanyIds !== undefined) updates.allowedCompanyIds = allowedCompanyIds;
      if (allowedBranchIds !== undefined) updates.allowedBranchIds = allowedBranchIds;
      if (password) updates.password = await hashPassword(password);

      const [updated] = await db.update(users).set(updates).where(eq(users.id, staffId)).returning();
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/pos/staff/template", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      const companyId = Number(req.query.companyId) || currentUser.primaryCompanyId;

      const branchList = companyId
        ? await db.select().from(branches).where(eq(branches.companyId, companyId)).orderBy(branches.name)
        : [];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ["ชื่อ-นามสกุล", "ชื่อผู้ใช้ (username)", "รหัสผ่าน", "ตำแหน่ง (staff/branch_manager/cashier)", "ชื่อสาขา (คั่นด้วย ,)"],
        ["สมชาย ใจดี", "somchai", "1234", "cashier", branchList[0]?.name || "สาขา 1"],
        ["สมหญิง แก้วใส", "somying", "1234", "branch_manager", branchList[0]?.name || "สาขา 1"],
        ["สมศักดิ์ มีสุข", "somsak", "1234", "staff", branchList.length > 1 ? `${branchList[0].name},${branchList[1].name}` : "สาขา 1,สาขา 2"],
      ]);
      ws["!cols"] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 35 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws, "พนักงาน POS");

      if (branchList.length > 0) {
        const bws = XLSX.utils.aoa_to_sheet([
          ["รหัสสาขา (ID)", "ชื่อสาขา", "รหัสสาขา (Code)"],
          ...branchList.map(b => [b.id, b.name, (b as any).code || ""]),
        ]);
        bws["!cols"] = [{ wch: 15 }, { wch: 30 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, bws, "รายชื่อสาขา");
      }

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=pos_staff_template.xlsx");
      res.send(buf);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pos/staff/import", requireAuth, requireModule("pos"), staffUpload.single("file"), async (req, res) => {
    try {
      const currentUser = req.user as any;
      const tenantId = currentUser.tenantId;
      if (!tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      if (!req.file) return res.status(400).json({ message: "กรุณาอัปโหลดไฟล์" });

      const companyIds = req.body.companyIds ? JSON.parse(req.body.companyIds) : [];
      const companyId = companyIds[0] || currentUser.primaryCompanyId;

      const branchList = companyId
        ? await db.select().from(branches).where(eq(branches.companyId, companyId))
        : [];
      const branchNameMap = new Map<string, number>();
      for (const b of branchList) {
        branchNameMap.set(b.name.trim().toLowerCase(), b.id);
        if ((b as any).code) branchNameMap.set(String((b as any).code).trim().toLowerCase(), b.id);
      }

      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) return res.status(400).json({ message: "ไฟล์ว่างหรือไม่มีข้อมูล" });

      const results = { created: 0, skipped: 0, errors: [] as string[] };
      const validRoles = ["staff", "branch_manager", "cashier"];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || !row[0]) continue;

        const fullName = String(row[0]).trim();
        const username = String(row[1] || "").trim();
        const password = String(row[2] || "").trim();
        const role = String(row[3] || "staff").trim().toLowerCase();
        const branchNamesStr = String(row[4] || "").trim();

        if (!username || !password || !fullName) {
          results.errors.push(`แถว ${i + 1}: ข้อมูลไม่ครบ (ต้องมีชื่อ, username, รหัสผ่าน)`);
          results.skipped++;
          continue;
        }

        const existing = await db.select().from(users).where(eq(users.username, username));
        if (existing.length > 0) {
          results.errors.push(`แถว ${i + 1}: ชื่อผู้ใช้ "${username}" ซ้ำ`);
          results.skipped++;
          continue;
        }

        const branchIds: number[] = [];
        if (branchNamesStr) {
          const parts = branchNamesStr.split(",").map(s => s.trim());
          for (const part of parts) {
            const asNum = Number(part);
            if (!isNaN(asNum) && branchList.some(b => b.id === asNum)) {
              branchIds.push(asNum);
            } else {
              const matchId = branchNameMap.get(part.toLowerCase());
              if (matchId) {
                branchIds.push(matchId);
              } else {
                results.errors.push(`แถว ${i + 1}: ไม่พบสาขา "${part}"`);
              }
            }
          }
        }

        const hashed = await hashPassword(password);

        await db.insert(users).values({
          username,
          password: hashed,
          fullName,
          role: validRoles.includes(role) ? role : "staff",
          active: true,
          tenantId,
          allowedCompanyIds: companyIds,
          allowedBranchIds: branchIds,
        });
        results.created++;
      }

      res.json(results);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ============ Commission Rules ============

  app.get("/api/pos/commission-rules", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      const rules = await db.select().from(commissionRules).where(and(eq(commissionRules.companyId, companyId), or(eq(commissionRules.module, "pos"), isNull(commissionRules.module)))).orderBy(desc(commissionRules.createdAt));
      res.json(rules);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/pos/commission-rules", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const { companyId, name, type, rate, perPieceRate, tiers, basedOn, appliesTo, assignScope, assignedUserIds, assignedProductIds, minTarget } = req.body;
      if (!companyId || !name || !type) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
      const [rule] = await db.insert(commissionRules).values({
        companyId, name, type,
        rate: rate || "0",
        perPieceRate: perPieceRate || "0",
        tiers: tiers ? JSON.stringify(tiers) : null,
        basedOn: basedOn || "revenue",
        appliesTo: appliesTo || "both",
        assignScope: assignScope || "all",
        assignedUserIds: assignedUserIds || null,
        assignedProductIds: assignedProductIds || null,
        minTarget: minTarget || "0",
      }).returning();
      res.json(rule);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/pos/commission-rules/:id", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(commissionRules).where(eq(commissionRules.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบกฎคอมมิชชั่น" });
      if (existing.module && existing.module !== "pos") return res.status(404).json({ message: "ไม่พบกฎคอมมิชชั่น" });
      const user = req.user as any;
      const allowedIds = user.allowedCompanyIds || [];
      if (user.role !== "superadmin" && !allowedIds.includes(existing.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { name, type, rate, perPieceRate, tiers, basedOn, appliesTo, assignScope, assignedUserIds, assignedProductIds, minTarget, active } = req.body;
      const [updated] = await db.update(commissionRules).set({
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type }),
        ...(rate !== undefined && { rate }),
        ...(perPieceRate !== undefined && { perPieceRate }),
        ...(tiers !== undefined && { tiers: tiers ? JSON.stringify(tiers) : null }),
        ...(basedOn !== undefined && { basedOn }),
        ...(appliesTo !== undefined && { appliesTo }),
        ...(assignScope !== undefined && { assignScope }),
        ...(assignedUserIds !== undefined && { assignedUserIds }),
        ...(assignedProductIds !== undefined && { assignedProductIds }),
        ...(minTarget !== undefined && { minTarget }),
        ...(active !== undefined && { active }),
      }).where(eq(commissionRules.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "ไม่พบกฎคอมมิชชั่น" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/pos/commission-rules/:id", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(commissionRules).where(eq(commissionRules.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบกฎคอมมิชชั่น" });
      if (existing.module && existing.module !== "pos") return res.status(404).json({ message: "ไม่พบกฎคอมมิชชั่น" });
      const user = req.user as any;
      const allowedIds = user.allowedCompanyIds || [];
      if (user.role !== "superadmin" && !allowedIds.includes(existing.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      await db.delete(commissionRules).where(eq(commissionRules.id, id));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  // ============ Commission Calculation ============

  app.post("/api/pos/commission/calculate", requireAuth, requireModule("pos"), async (req, res) => {
    try {
      const { companyId, month, year } = req.body;
      if (!companyId || !month || !year) return res.status(400).json({ message: "กรุณาระบุเดือน/ปี" });
      const user = req.user as any;
      const allowedIds = user.allowedCompanyIds || [];
      if (user.role !== "superadmin" && !allowedIds.includes(companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });

      const rules = await db.select().from(commissionRules)
        .where(and(eq(commissionRules.companyId, companyId), eq(commissionRules.active, true), or(eq(commissionRules.module, "pos"), isNull(commissionRules.module))));

      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const txnsWithUser = await db.select({
        id: posTransactions.id,
        total: posTransactions.total,
        sessionId: posTransactions.sessionId,
        userId: posSessions.userId,
      }).from(posTransactions)
        .innerJoin(posSessions, eq(posTransactions.sessionId, posSessions.id))
        .where(and(
          eq(posTransactions.companyId, companyId),
          sql`${posTransactions.createdAt} >= ${startDate}`,
          sql`${posTransactions.createdAt} <= ${endDate}`,
          eq(posTransactions.status, "completed"),
        ));

      const txnItems = txnsWithUser.length > 0
        ? await db.select().from(posTransactionItems).where(inArray(posTransactionItems.transactionId, txnsWithUser.map(t => t.id)))
        : [];

      const salesByUser: Record<number, { revenue: number; pieces: number; txnIds: number[] }> = {};
      for (const txn of txnsWithUser) {
        const cashierId = txn.userId;
        if (cashierId) {
          if (!salesByUser[cashierId]) salesByUser[cashierId] = { revenue: 0, pieces: 0, txnIds: [] };
          salesByUser[cashierId].revenue += Number(txn.total || 0);
          salesByUser[cashierId].txnIds.push(txn.id);
        }
      }
      for (const item of txnItems) {
        const txn = txnsWithUser.find(t => t.id === item.transactionId);
        if (!txn) continue;
        const cashierId = txn.userId;
        if (cashierId && salesByUser[cashierId]) {
          salesByUser[cashierId].pieces += Number(item.quantity || 0);
        }
      }

      const results: any[] = [];
      for (const [userIdStr, data] of Object.entries(salesByUser)) {
        const userId = Number(userIdStr);
        for (const rule of rules) {
          if (rule.assignScope === "specific" && rule.assignedUserIds && !rule.assignedUserIds.includes(userId)) continue;
          if (rule.appliesTo !== "both" && rule.appliesTo !== "cashier") continue;

          let amount = 0;
          if (rule.type === "percentage") {
            if (data.revenue >= Number(rule.minTarget || 0)) {
              amount = data.revenue * Number(rule.rate) / 100;
            }
          } else if (rule.type === "per_piece") {
            amount = data.pieces * Number(rule.perPieceRate || 0);
          } else if (rule.type === "tiered") {
            const tiers = rule.tiers ? JSON.parse(rule.tiers) : [];
            for (const tier of tiers.sort((a: any, b: any) => b.min - a.min)) {
              if (data.revenue >= Number(tier.min)) {
                amount = data.revenue * Number(tier.rate) / 100;
                break;
              }
            }
          }

          if (amount > 0) {
            results.push({
              userId, ruleName: rule.name, ruleId: rule.id, ruleType: rule.type,
              totalSales: data.revenue, totalPieces: data.pieces,
              commissionRate: rule.type === "percentage" ? Number(rule.rate) : rule.type === "per_piece" ? Number(rule.perPieceRate) : 0,
              commissionAmount: Math.round(amount * 100) / 100,
            });
          }
        }
      }

      res.json({ month, year, results });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

}
