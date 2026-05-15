import type { Express } from "express";
import { db } from "../db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  documentImportBatches,
  invoices, invoiceItems,
  purchaseInvoices, purchaseInvoiceItems,
  expenses, expenseItems,
  products,
  contacts,
  journalEntries, journalLines,
  stockMovements,
  companies,
  productStock,
  productBundles,
  ecommerceProductMappings,
  warehouseStockLevels,
  productBinAssignments,
  productLots,
  demandForecasts,
  withholdingTaxCerts, whtCertItems,
  clientUploadFiles,
  purchaseDebitNotes, purchaseDebitNoteItems,
} from "@shared/schema";
import { expenseDailyBatches } from "@shared/schema-extra";
import { requireAuth, requireModule, requireRole } from "../route-middleware";
import { logActivity, deleteJournalEntriesForDoc, deleteStockMovementsForDoc, createAutoJournalEntry, getNextJournalEntryNo } from "../route-helpers";
import { deleteFromPath } from "../replit_integrations/object_storage/routes";
import { accounts } from "@shared/schema";
import { DEFAULT_FORMULAS } from "@shared/accounting-formulas";

export function registerImportBatchRoutes(app: Express) {

  app.get("/api/import-batches", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = Number(req.query.companyId);
      const docType = req.query.docType as string;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });

      if (user.role !== "super_admin" && user.tenantId) {
        const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
        if (company && company.tenantId && company.tenantId !== user.tenantId) {
          return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงกิจการนี้" });
        }
      }

      if (docType === "expense") {
        const existingBatches = await db.select().from(documentImportBatches)
          .where(and(eq(documentImportBatches.companyId, companyId), eq(documentImportBatches.docType, "expense")));
        const trackedIds = new Set<number>();
        for (const b of existingBatches) {
          try {
            const ids = b.createdDocIds ? JSON.parse(b.createdDocIds) : [];
            ids.forEach((id: number) => trackedIds.add(id));
          } catch {}
        }

        const allExpenses = await db.select({ id: expenses.id, createdAt: expenses.createdAt })
          .from(expenses)
          .where(eq(expenses.companyId, companyId));
        const orphanIds = allExpenses.filter(e => !trackedIds.has(e.id)).map(e => e.id);

        if (orphanIds.length > 0) {
          const earliest = allExpenses
            .filter(e => orphanIds.includes(e.id))
            .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())[0];
          await db.insert(documentImportBatches).values({
            companyId,
            docType: "expense",
            fileName: "PDF Import",
            totalCreated: orphanIds.length,
            totalSkipped: 0,
            totalErrors: 0,
            createdDocIds: JSON.stringify(orphanIds),
            createdBy: user.id,
            createdAt: earliest?.createdAt || new Date(),
          });
          console.log(`[import-batch] Backfilled ${orphanIds.length} orphan expenses for company ${companyId}`);
        }
      }

      const conditions: any[] = [eq(documentImportBatches.companyId, companyId)];
      if (docType) conditions.push(eq(documentImportBatches.docType, docType));

      const batches = await db.select().from(documentImportBatches)
        .where(and(...conditions))
        .orderBy(desc(documentImportBatches.createdAt));

      res.json(batches);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/import-batches/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const batchId = Number(req.params.id);
      if (!batchId) return res.status(400).json({ message: "กรุณาระบุ batch ID" });

      const [batch] = await db.select().from(documentImportBatches).where(eq(documentImportBatches.id, batchId));
      if (!batch) return res.status(404).json({ message: "ไม่พบล็อตนำเข้า" });
      if (batch.status === "deleted") return res.json({ deletedDocs: 0, deletedJournals: 0, batchId, message: "ล็อตนี้ถูกลบไปแล้ว" });

      if (user.role !== "super_admin" && user.tenantId) {
        const [company] = await db.select().from(companies).where(eq(companies.id, batch.companyId));
        if (company && company.tenantId && company.tenantId !== user.tenantId) {
          return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง batch นี้" });
        }
      }

      const docIds: number[] = batch.createdDocIds ? JSON.parse(batch.createdDocIds) : [];
      console.log(`[import-batch-delete] batch ${batchId}, docType=${batch.docType}, docIds count=${docIds.length}, first5=${JSON.stringify(docIds.slice(0, 5))}`);
      let deletedDocs = 0;
      let deletedJournals = 0;
      let skippedNames: string[] = [];

      if (docIds.length > 0) {
        await db.transaction(async (tx) => {
        console.log(`[import-batch-delete] starting transaction for ${batch.docType}, ${docIds.length} docs`);
        switch (batch.docType) {
          case "invoice": {
            for (const docId of docIds) {
              await deleteJournalEntriesForDoc(tx, "invoice", docId);
              await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, docId));
            }
            const result = await tx.delete(invoices).where(and(eq(invoices.companyId, batch.companyId), inArray(invoices.id, docIds)));
            deletedDocs = result.rowCount || 0;
            break;
          }
          case "purchase_invoice": {
            for (const docId of docIds) {
              await deleteJournalEntriesForDoc(tx, "purchase_invoice", docId);
              await deleteStockMovementsForDoc(tx, "purchase_invoice", docId);
              await tx.delete(purchaseInvoiceItems).where(eq(purchaseInvoiceItems.purchaseInvoiceId, docId));
            }
            const result = await tx.delete(purchaseInvoices).where(and(eq(purchaseInvoices.companyId, batch.companyId), inArray(purchaseInvoices.id, docIds)));
            deletedDocs = result.rowCount || 0;
            break;
          }
          case "expense": {
            const pgDocIds = sql.raw(`ARRAY[${docIds.join(',')}]::int[]`);
            console.log(`[import-batch-delete] Step 1: querying expense rows...`);
            const expRowsResult = await tx.execute(sql`
              SELECT id, exp_no, batch_id, attached_url FROM expenses 
              WHERE company_id = ${batch.companyId} AND id = ANY(${pgDocIds})
            `);
            const expRows = (expRowsResult.rows as any[]);
            const expIds = expRows.map((e: any) => e.id);
            console.log(`[import-batch-delete] Step 2: found ${expIds.length} expenses, deleting expense_items...`);

            if (expIds.length > 0) {
              const pgExpIds = sql.raw(`ARRAY[${expIds.join(',')}]::int[]`);
              await tx.execute(sql`DELETE FROM expense_items WHERE expense_id = ANY(${pgExpIds})`);
              console.log(`[import-batch-delete] Step 3: deleting per-expense journals...`);

              const jResult = await tx.execute(sql`
                SELECT id FROM journal_entries 
                WHERE source_doc_type = 'expense' AND source_doc_id = ANY(${pgExpIds})
              `);
              const jIds = (jResult.rows as any[]).map((j: any) => j.id);
              if (jIds.length > 0) {
                const pgJIds = sql.raw(`ARRAY[${jIds.join(',')}]::int[]`);
                console.log(`[import-batch-delete] Clearing ${jIds.length} per-expense journal refs...`);
                const safeClearRef = async (stmt: string) => {
                  try {
                    await tx.execute(sql`SAVEPOINT clear_ref`);
                    await tx.execute(sql.raw(stmt));
                    await tx.execute(sql`RELEASE SAVEPOINT clear_ref`);
                  } catch {
                    try { await tx.execute(sql`ROLLBACK TO SAVEPOINT clear_ref`); } catch {}
                  }
                };
                const jIdsList = jIds.join(",");
                await safeClearRef(`UPDATE bank_statements SET matched_journal_id = NULL WHERE matched_journal_id IN (${jIdsList})`);
                await safeClearRef(`UPDATE manufacturing_orders SET journal_entry_id = NULL WHERE journal_entry_id IN (${jIdsList})`);
                await safeClearRef(`UPDATE payroll_records SET journal_entry_id = NULL WHERE journal_entry_id IN (${jIdsList})`);
                await safeClearRef(`UPDATE fixed_assets SET journal_entry_id = NULL WHERE journal_entry_id IN (${jIdsList})`);
                await tx.execute(sql`DELETE FROM journal_lines WHERE journal_entry_id = ANY(${pgJIds})`);
                await tx.execute(sql`DELETE FROM journal_entries WHERE id = ANY(${pgJIds})`);
                deletedJournals += jIds.length;
              }

              console.log(`[import-batch-delete] Step 4: deleting WHT certs...`);
              const whtResult = await tx.execute(sql`
                SELECT id FROM withholding_tax_certs 
                WHERE company_id = ${batch.companyId} AND source_doc_type = 'expense' AND source_doc_id = ANY(${pgExpIds})
              `);
              const whtIds = (whtResult.rows as any[]).map((w: any) => w.id);
              if (whtIds.length > 0) {
                const pgWhtIds = sql.raw(`ARRAY[${whtIds.join(',')}]::int[]`);
                await tx.execute(sql`DELETE FROM wht_cert_items WHERE wht_cert_id = ANY(${pgWhtIds})`);
                await tx.execute(sql`DELETE FROM withholding_tax_certs WHERE id = ANY(${pgWhtIds})`);
              }

              console.log(`[import-batch-delete] Step 4b: deleting client upload files...`);
              const expNos = expRows.map((e: any) => e.exp_no).filter(Boolean);
              if (expNos.length > 0) {
                let deletedClientFiles = 0;
                for (const expNo of expNos) {
                  const delFiles = await tx.execute(sql`
                    DELETE FROM client_upload_files 
                    WHERE file_name LIKE ${expNo + ' -%'}
                  `);
                  deletedClientFiles += delFiles.rowCount || 0;
                }
                console.log(`[import-batch-delete] Deleted ${deletedClientFiles} client upload files`);
              }

              console.log(`[import-batch-delete] Step 4c: deleting PDF files from storage...`);
              let deletedStorageFiles = 0;
              for (const exp of expRows) {
                const url = exp.attached_url;
                if (url && typeof url === "string") {
                  for (const p of url.split(",")) {
                    const trimmed = p.trim();
                    if (trimmed && trimmed.startsWith("pdf-imports/")) {
                      try { deleteFromPath(trimmed); deletedStorageFiles++; } catch {}
                    }
                  }
                }
              }
              console.log(`[import-batch-delete] Deleted ${deletedStorageFiles} PDF files from storage`);

              console.log(`[import-batch-delete] Step 5: deleting ${expIds.length} expenses...`);
              const delResult = await tx.execute(sql`
                DELETE FROM expenses WHERE company_id = ${batch.companyId} AND id = ANY(${pgExpIds})
              `);
              deletedDocs = delResult.rowCount || 0;
            }

            console.log(`[import-batch-delete] Step 6: handling DXP batches...`);
            const batchIdsFromExpenses = [...new Set(expRows.map((e: any) => e.batch_id).filter(Boolean))] as number[];
            const allDxpResult = await tx.execute(sql`
              SELECT DISTINCT edb.id FROM expense_daily_batches edb
              WHERE edb.company_id = ${batch.companyId}
                AND (
                  edb.id = ANY(${sql.raw(`ARRAY[${batchIdsFromExpenses.length > 0 ? batchIdsFromExpenses.join(',') : '0'}]::int[]`)})
                  OR edb.id IN (
                    SELECT DISTINCT pdn.batch_id FROM purchase_debit_notes pdn 
                    WHERE pdn.company_id = ${batch.companyId} 
                      AND pdn.ref_expense_id = ANY(${pgDocIds})
                  )
                )
            `);
            const affectedBatchIds = (allDxpResult.rows as any[]).map((r: any) => r.id) as number[];
            console.log(`[import-batch-delete] Found ${affectedBatchIds.length} DXP batches to process (from expenses: ${batchIdsFromExpenses.length})`);

            for (const dxpId of affectedBatchIds) {
              const dxpBatchResult = await tx.execute(sql`SELECT * FROM expense_daily_batches WHERE id = ${dxpId}`);
              const dxpBatch = (dxpBatchResult.rows as any[])[0];
              if (!dxpBatch) continue;
              const dxpNo = dxpBatch.batch_no;

              const dxpJResult = await tx.execute(sql`
                SELECT id FROM journal_entries 
                WHERE company_id = ${batch.companyId} 
                  AND (
                    (source_doc_type = 'expense_daily_batch' AND (source_doc_id = ${dxpId} OR reference = ${dxpNo} OR reference LIKE ${dxpNo + '-%'}))
                    OR (source_doc_type = 'purchase_debit_note' AND reference = ${dxpNo})
                  )
              `);
              const djIds = (dxpJResult.rows as any[]).map((dj: any) => dj.id);
              if (djIds.length > 0) {
                const djIdsList = djIds.join(",");
                try {
                  await tx.execute(sql`SAVEPOINT dxp_clear`);
                  await tx.execute(sql.raw(`UPDATE bank_statements SET matched_journal_id = NULL WHERE matched_journal_id IN (${djIdsList})`));
                  await tx.execute(sql`RELEASE SAVEPOINT dxp_clear`);
                } catch {
                  try { await tx.execute(sql`ROLLBACK TO SAVEPOINT dxp_clear`); } catch {}
                }
                const pgDjIds = sql.raw(`ARRAY[${djIds.join(',')}]::int[]`);
                await tx.execute(sql`DELETE FROM journal_lines WHERE journal_entry_id = ANY(${pgDjIds})`);
                await tx.execute(sql`DELETE FROM journal_entries WHERE id = ANY(${pgDjIds})`);
                deletedJournals += djIds.length;
              }

              const dnResult = await tx.execute(sql`SELECT id FROM purchase_debit_notes WHERE batch_id = ${dxpId}`);
              const dnIds = (dnResult.rows as any[]).map((d: any) => d.id);
              if (dnIds.length > 0) {
                const pgDnIds = sql.raw(`ARRAY[${dnIds.join(',')}]::int[]`);
                await tx.execute(sql`DELETE FROM purchase_debit_note_items WHERE debit_note_id = ANY(${pgDnIds})`);
                await tx.execute(sql`DELETE FROM purchase_debit_notes WHERE id = ANY(${pgDnIds})`);
              }

              const remResult = await tx.execute(sql`SELECT id FROM expenses WHERE batch_id = ${dxpId}`);
              const remaining = remResult.rows as any[];
              if (remaining.length === 0) {
                await tx.execute(sql`DELETE FROM expense_daily_batches WHERE id = ${dxpId}`);
                console.log(`[import-batch-delete] DXP batch ${dxpId} (${dxpNo}) fully removed with ${dnIds.length} DNs, ${djIds.length} journals`);
              } else {
                const sums = await tx.execute(sql`
                  SELECT COALESCE(SUM(total_amount::numeric),0) as total,
                         COALESCE(SUM(vat_amount::numeric),0) as vat,
                         COALESCE(SUM(withholding_tax::numeric),0) as wht,
                         COUNT(*) as cnt
                  FROM expenses WHERE batch_id = ${dxpId}
                `);
                const row = (sums.rows as any[])[0];
                await tx.update(expenseDailyBatches).set({
                  totalAmount: String(row.total),
                  totalVat: String(row.vat),
                  totalWht: String(row.wht),
                  totalExpenses: Number(row.cnt),
                }).where(eq(expenseDailyBatches.id, dxpId));
                console.log(`[import-batch-delete] DXP batch ${dxpId} (${dxpNo}) updated: ${row.cnt} expenses left, ${dnIds.length} DNs + ${djIds.length} journals deleted`);
              }
            }
            console.log(`[import-batch-delete] Done: deleted=${deletedDocs}, journals=${deletedJournals}`);
            break;
          }
          case "product": {
            const pgDocIds = sql.raw(`ARRAY[${docIds.join(',')}]::int[]`);
            // ลบ initial stock movements จาก import ก่อน (ไม่มี referenceType) เพื่อไม่ให้นับเป็น FK ค้าง
            await tx.execute(sql`DELETE FROM stock_movements WHERE movement_type = 'initial' AND reference_type IS NULL AND product_id = ANY(${pgDocIds})`);
            await tx.execute(sql`DELETE FROM warehouse_stock_levels WHERE product_id = ANY(${pgDocIds})`);
            const usedRows = await tx.execute(sql`
              SELECT DISTINCT product_id FROM (
                SELECT product_id FROM pos_transaction_items WHERE product_id = ANY(${pgDocIds})
                UNION ALL SELECT product_id FROM invoice_items WHERE product_id = ANY(${pgDocIds})
                UNION ALL SELECT product_id FROM quotation_items WHERE product_id = ANY(${pgDocIds})
                UNION ALL SELECT product_id FROM sales_order_items WHERE product_id = ANY(${pgDocIds})
                UNION ALL SELECT product_id FROM tax_invoice_items WHERE product_id = ANY(${pgDocIds})
                UNION ALL SELECT product_id FROM receipt_items WHERE product_id = ANY(${pgDocIds})
                UNION ALL SELECT product_id FROM purchase_order_items WHERE product_id = ANY(${pgDocIds})
                UNION ALL SELECT product_id FROM purchase_invoice_items WHERE product_id = ANY(${pgDocIds})
                UNION ALL SELECT product_id FROM ecommerce_order_items WHERE product_id = ANY(${pgDocIds})
                UNION ALL SELECT product_id FROM goods_receiving_items WHERE product_id = ANY(${pgDocIds})
              ) t
            `);
            const usedIds = new Set((usedRows.rows as any[]).map(r => r.product_id));
            const canDeleteIds = docIds.filter(id => !usedIds.has(id));
            const deactivateIds = docIds.filter(id => usedIds.has(id));

            if (canDeleteIds.length > 0) {
              const pgDelIds = sql.raw(`ARRAY[${canDeleteIds.join(',')}]::int[]`);
              await tx.delete(productStock).where(inArray(productStock.productId, canDeleteIds));
              await tx.delete(productBundles).where(inArray(productBundles.bundleProductId, canDeleteIds));
              await tx.delete(productBundles).where(inArray(productBundles.componentProductId, canDeleteIds));
              await tx.delete(ecommerceProductMappings).where(inArray(ecommerceProductMappings.productId, canDeleteIds));
              await tx.delete(warehouseStockLevels).where(inArray(warehouseStockLevels.productId, canDeleteIds));
              await tx.delete(productLots).where(inArray(productLots.productId, canDeleteIds));
              await tx.delete(demandForecasts).where(inArray(demandForecasts.productId, canDeleteIds));
              await tx.execute(sql`DELETE FROM product_bin_assignments WHERE product_id = ANY(${pgDelIds})`);
              await tx.execute(sql`DELETE FROM menu_items WHERE product_id = ANY(${pgDelIds})`);
              await tx.execute(sql`DELETE FROM promotion_rules WHERE buy_product_id = ANY(${pgDelIds}) OR get_product_id = ANY(${pgDelIds})`);
              await tx.execute(sql`DELETE FROM product_mappings WHERE buy_product_id = ANY(${pgDelIds}) OR sell_product_id = ANY(${pgDelIds})`);
              await tx.execute(sql`DELETE FROM supplier_quote_items WHERE product_id = ANY(${pgDelIds})`);
              await tx.delete(products).where(and(eq(products.companyId, batch.companyId), inArray(products.id, canDeleteIds)));
            }
            if (deactivateIds.length > 0) {
              await tx.update(products).set({ active: false }).where(and(eq(products.companyId, batch.companyId), inArray(products.id, deactivateIds)));
              const deactivatedProducts = await tx.select({ code: products.code, name: products.name })
                .from(products).where(inArray(products.id, deactivateIds));
              skippedNames = deactivatedProducts.map(p => `${p.code} ${p.name}`);
            }
            deletedDocs = canDeleteIds.length;
            break;
          }
          case "contact": {
            const result = await tx.delete(contacts).where(and(eq(contacts.companyId, batch.companyId), inArray(contacts.id, docIds)));
            deletedDocs = result.rowCount || 0;
            break;
          }
        }
        });
      }

      await db.update(documentImportBatches)
        .set({ status: "deleted" })
        .where(eq(documentImportBatches.id, batchId));

      await logActivity({
        userId: user.id,
        companyId: batch.companyId,
        action: "delete_import_batch",
        entityType: batch.docType,
        entityId: String(batchId),
        entityName: `ล็อตนำเข้า ${batch.docType} (${deletedDocs} รายการ)`,
      });

      res.json({ deletedDocs, deletedJournals, batchId, deactivated: skippedNames.length, deactivatedNames: skippedNames });
    } catch (err: any) {
      console.error("[import-batch-delete] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/import-batches/:id/retry-journal", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const batchId = Number(req.params.id);
      const [batch] = await db.select().from(documentImportBatches).where(eq(documentImportBatches.id, batchId));
      if (!batch) return res.status(404).json({ message: "ไม่พบล็อตนำเข้า" });

      const companyId = batch.companyId;
      let docIds: number[] = [];
      try { docIds = batch.createdDocIds ? JSON.parse(batch.createdDocIds) : []; } catch {}
      if (docIds.length === 0) return res.json({ created: 0, skipped: 0 });

      const expList = await db.select().from(expenses)
        .where(and(eq(expenses.companyId, companyId), inArray(expenses.id, docIds)));

      const existingJournals = await db.select({ sourceDocId: journalEntries.sourceDocId })
        .from(journalEntries)
        .where(and(
          eq(journalEntries.companyId, companyId),
          eq(journalEntries.sourceDocType, "expense"),
          inArray(journalEntries.sourceDocId, docIds),
        ));
      const hasJournal = new Set(existingJournals.map(j => j.sourceDocId));

      const needJournal = expList.filter(e => !hasJournal.has(e.id));
      if (needJournal.length === 0) return res.json({ created: 0, skipped: expList.length, message: "ทุกเอกสารมี journal แล้ว" });

      const PREFIX_FORMULA_MAP: Record<string, string> = {
        "TRSPEMKP": "shopee_platform_fee",
        "TRSPXADB": "spx_admin_fee",
        "TTSTH": "tiktok_platform_fee",
        "THMPTI": "lazada_platform_fee",
        "THLPTI": "lazada_shipping",
        "TRSPESPF": "shopeefood_service_fee",
        "RCSPXSPR": "spx_shipping",
        "RCSPXSPB": "spx_shipping",
        "THJV": "tiktok_shipping",
        "IM": "grab_service_fee",
      };

      let created = 0;
      let skipped = 0;
      for (let i = 0; i < needJournal.length; i++) {
        const exp = needJournal[i];
        if (i > 0) await new Promise(r => setTimeout(r, 100));
        try {
          const prefix = exp.docPrefix || "";
          const bt = PREFIX_FORMULA_MAP[prefix] || "platform_fee";

          const items = await db.select().from(expenseItems).where(eq(expenseItems.expenseId, exp.id));
          const sub = parseFloat(String(exp.subtotal || "0"));
          const vat = parseFloat(String(exp.vatAmount || "0"));
          const total = parseFloat(String(exp.totalAmount || "0"));
          const wht = parseFloat(String(exp.withholdingTax || "0"));

          let lineItemAccounts: { accountCode: string; accountName: string; amount: number }[] | undefined;
          if (items.length > 0) {
            lineItemAccounts = items
              .filter(it => parseFloat(String(it.amount || "0")) > 0)
              .map(it => ({
                accountCode: it.accountCode || "",
                accountName: it.accountName || it.description || "",
                amount: parseFloat(String(it.amount || "0")),
              }));
          }

          const result = await createAutoJournalEntry({
            companyId,
            documentType: "expense",
            sourceDocType: "expense",
            sourceDocId: exp.id,
            docDate: exp.expDate,
            docNo: exp.expNo,
            subtotal: sub.toFixed(2),
            vatAmount: vat.toFixed(2),
            totalAmount: total.toFixed(2),
            withholdingTax: wht.toFixed(2),
            userId: user.id,
            customerName: exp.vendorName || "ค่าบริการ",
            formulaBusinessType: bt,
            lineItemAccounts,
          });
          if (result && !result.skipped) {
            await db.update(expenses).set({ linkJournal: true }).where(eq(expenses.id, exp.id));
            created++;
            console.log(`[retry-journal] ${exp.expNo} → journal created (${bt})`);
          } else {
            skipped++;
            console.log(`[retry-journal] ${exp.expNo} → skipped: ${result?.reason}`);
          }
        } catch (e: any) {
          skipped++;
          console.log(`[retry-journal] ${exp.expNo} → error: ${e.message}`);
        }
      }

      res.json({ created, skipped, total: needJournal.length });
    } catch (err: any) {
      console.error("[retry-journal] Error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });
}
