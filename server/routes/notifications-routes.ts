import type { Express, Request, Response } from "express";
import { db } from "../db";
import { ecomDb } from "../ecom-db";
import { eq, desc, and, or, gte, count , sql } from "drizzle-orm";
import { activeProducts } from "@shared/schema-extra";
import { notifications, products, productStock, ecommerceReturns, ecommerceOrders, invoices, taxInvoices, purchaseInvoices, expenses, budgets, accounts, receipts, receiptLinkedDocs, contacts, paymentVouchers, paymentVoucherLinkedDocs } from "@shared/schema";
import { requireAuth, checkDocOwnership } from "../route-middleware";
import { getNextDocNo, createAutoJournalEntry, resolvePaymentMethodAccountCode, recomputePaymentStatus } from "../route-helpers";
import { verifyCompanyAccess } from "../route-factory";
import { getUpcomingTaxDeadlines } from "./tax-calendar";

export function registerNotificationsRoutes(app: Express) {
// ============ Notifications ============

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const conditions = [eq(notifications.companyId, companyId)];
    if (user.tenantId) conditions.push(eq(notifications.tenantId, user.tenantId));

    const rows = await db.select().from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(...conditions, eq(notifications.isRead, false)));

    res.json({ notifications: rows, unreadCount: countResult?.count || 0 });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/notifications/read/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [notif] = await db.select().from(notifications).where(eq(notifications.id, id));
    if (!notif) return res.status(404).json({ message: "ไม่พบการแจ้งเตือน" });
    if (user.tenantId && notif.tenantId !== user.tenantId) {
      return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    }
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.body.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });

    const conditions = [eq(notifications.companyId, companyId), eq(notifications.isRead, false)];
    if (user.tenantId) conditions.push(eq(notifications.tenantId, user.tenantId));

    await db.update(notifications).set({ isRead: true }).where(and(...conditions));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/notifications/generate", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });

    let newCount = 0;
    const tenantId = user.tenantId || null;

    const stockRows = await db.select({
      productId: products.id,
      productName: products.name,
      productCode: products.code,
      lowStockThreshold: products.lowStockThreshold,
      quantity: productStock.quantity,
    }).from(products)
      .innerJoin(activeProducts, eq(activeProducts.id, products.id))
      .innerJoin(productStock, and(
        eq(productStock.productId, products.id),
        eq(productStock.companyId, companyId)
      ))
      .where(and(
        eq(products.companyId, companyId),
        sql`${products.lowStockThreshold} > 0`,
        sql`CAST(${productStock.quantity} AS numeric) < ${products.lowStockThreshold}`
      ));

    for (const row of stockRows) {
      const entityKey = `low_stock_${row.productId}`;
      const [existing] = await db.select({ id: notifications.id }).from(notifications)
        .where(and(
          eq(notifications.companyId, companyId),
          eq(notifications.type, "low_stock"),
          eq(notifications.title, entityKey)
        ));
      if (!existing) {
        await db.insert(notifications).values({
          companyId,
          tenantId,
          type: "low_stock",
          title: entityKey,
          message: `สินค้า ${row.productCode} ${row.productName} เหลือ ${row.quantity} (ต่ำกว่า ${row.lowStockThreshold})`,
          link: "/ecommerce/stock-alerts",
          isRead: false,
        });
        newCount++;
      }
    }

    const pendingReturns = await ecomDb.select({
      id: ecommerceReturns.id,
      returnNo: ecommerceReturns.returnNo,
    }).from(ecommerceReturns)
      .where(and(
        eq(ecommerceReturns.companyId, companyId),
        eq(ecommerceReturns.status, "requested")
      ));

    for (const ret of pendingReturns) {
      const entityKey = `return_${ret.id}`;
      const [existing] = await db.select({ id: notifications.id }).from(notifications)
        .where(and(
          eq(notifications.companyId, companyId),
          eq(notifications.type, "return_request"),
          eq(notifications.title, entityKey)
        ));
      if (!existing) {
        await db.insert(notifications).values({
          companyId,
          tenantId,
          type: "return_request",
          title: entityKey,
          message: `คำขอคืนสินค้า #${ret.returnNo || ret.id} รอดำเนินการ`,
          link: "/ecommerce/returns",
          isRead: false,
        });
        newCount++;
      }
    }

    const now = new Date();
    {
      const deadlines = getUpcomingTaxDeadlines(5);
      const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      for (const dl of deadlines) {
        const dlDate = new Date(dl.date + "T00:00:00");
        const daysLeft = Math.ceil((dlDate.getTime() - todayMs) / (1000 * 60 * 60 * 24));
        const entityKey = `tax_${dl.date}_${dl.type}`;
        const [existing] = await db.select({ id: notifications.id }).from(notifications)
          .where(and(
            eq(notifications.companyId, companyId),
            eq(notifications.type, "vat_deadline"),
            eq(notifications.title, entityKey)
          ));
        if (!existing) {
          const urgency = daysLeft === 0 ? "⚠️ วันนี้!" : daysLeft === 1 ? "⚠️ พรุ่งนี้!" : `อีก ${daysLeft} วัน`;
          await db.insert(notifications).values({
            companyId,
            tenantId,
            type: "vat_deadline",
            title: entityKey,
            message: `${urgency} กำหนดยื่น ${dl.forms.join(", ")} (${dl.type === "e-filing" ? "ทางอินเทอร์เน็ต" : "ยื่นแบบกระดาษ"}) — วันที่ ${dlDate.getDate()}/${dlDate.getMonth() + 1}/${dlDate.getFullYear() + 543}`,
            link: "/office/calendar",
            isRead: false,
          });
          newCount++;
        }
      }
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [orderCount] = await ecomDb.select({ count: sql<number>`count(*)::int` })
      .from(ecommerceOrders)
      .where(and(
        eq(ecommerceOrders.companyId, companyId),
        gte(ecommerceOrders.createdAt, todayStart)
      ));

    if (orderCount && orderCount.count > 0) {
      const todayKey = `orders_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}`;
      const [existing] = await db.select({ id: notifications.id }).from(notifications)
        .where(and(
          eq(notifications.companyId, companyId),
          eq(notifications.type, "new_orders"),
          eq(notifications.title, todayKey)
        ));
      if (!existing) {
        await db.insert(notifications).values({
          companyId,
          tenantId,
          type: "new_orders",
          title: todayKey,
          message: `วันนี้มีออเดอร์ใหม่ ${orderCount.count} รายการ`,
          link: "/ecommerce/orders",
          isRead: false,
        });
        newCount++;
      }
    }

    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const futureStr = `${threeDaysLater.getFullYear()}-${String(threeDaysLater.getMonth() + 1).padStart(2, "0")}-${String(threeDaysLater.getDate()).padStart(2, "0")}`;

    const overdueAR_IV = await db.select({ id: invoices.id, docNo: invoices.invoiceNo, customerName: invoices.customerName, dueDate: invoices.dueDate, totalAmount: invoices.totalAmount })
      .from(invoices).where(and(eq(invoices.companyId, companyId), sql`${invoices.dueDate} IS NOT NULL`, sql`${invoices.dueDate} < ${todayStr}`, sql`${invoices.status} != 'cancelled'`, sql`COALESCE(${invoices.paymentStatus}, 'unpaid') != 'paid'`));
    const overdueAR_TIV = await db.select({ id: taxInvoices.id, docNo: taxInvoices.taxInvoiceNo, customerName: taxInvoices.customerName, dueDate: taxInvoices.dueDate, totalAmount: taxInvoices.totalAmount })
      .from(taxInvoices).where(and(eq(taxInvoices.companyId, companyId), sql`${taxInvoices.dueDate} IS NOT NULL`, sql`${taxInvoices.dueDate} < ${todayStr}`, sql`${taxInvoices.status} != 'cancelled'`, sql`COALESCE(${taxInvoices.paymentStatus}, 'unpaid') != 'paid'`));
    const overdueAP_PI = await db.select({ id: purchaseInvoices.id, docNo: purchaseInvoices.apNo, vendorName: purchaseInvoices.vendorName, dueDate: purchaseInvoices.dueDate, totalAmount: purchaseInvoices.totalAmount })
      .from(purchaseInvoices).where(and(eq(purchaseInvoices.companyId, companyId), sql`${purchaseInvoices.dueDate} IS NOT NULL`, sql`${purchaseInvoices.dueDate} < ${todayStr}`, sql`${purchaseInvoices.status} != 'cancelled'`, sql`COALESCE(${purchaseInvoices.paymentStatus}, 'unpaid') != 'paid'`));
    const overdueAP_EXP = await db.select({ id: expenses.id, docNo: expenses.expNo, vendorName: expenses.vendorName, dueDate: expenses.dueDate, totalAmount: expenses.totalAmount })
      .from(expenses).where(and(eq(expenses.companyId, companyId), sql`${expenses.dueDate} IS NOT NULL`, sql`${expenses.dueDate} < ${todayStr}`, sql`${expenses.status} != 'cancelled'`, sql`COALESCE(${expenses.paymentStatus}, 'unpaid') != 'paid'`));

    const upcomingAR_IV = await db.select({ id: invoices.id, docNo: invoices.invoiceNo, customerName: invoices.customerName, dueDate: invoices.dueDate, totalAmount: invoices.totalAmount })
      .from(invoices).where(and(eq(invoices.companyId, companyId), sql`${invoices.dueDate} IS NOT NULL`, sql`${invoices.dueDate} >= ${todayStr}`, sql`${invoices.dueDate} <= ${futureStr}`, sql`${invoices.status} != 'cancelled'`, sql`COALESCE(${invoices.paymentStatus}, 'unpaid') != 'paid'`));
    const upcomingAR_TIV = await db.select({ id: taxInvoices.id, docNo: taxInvoices.taxInvoiceNo, customerName: taxInvoices.customerName, dueDate: taxInvoices.dueDate, totalAmount: taxInvoices.totalAmount })
      .from(taxInvoices).where(and(eq(taxInvoices.companyId, companyId), sql`${taxInvoices.dueDate} IS NOT NULL`, sql`${taxInvoices.dueDate} >= ${todayStr}`, sql`${taxInvoices.dueDate} <= ${futureStr}`, sql`${taxInvoices.status} != 'cancelled'`, sql`COALESCE(${taxInvoices.paymentStatus}, 'unpaid') != 'paid'`));
    const upcomingAP_PI = await db.select({ id: purchaseInvoices.id, docNo: purchaseInvoices.apNo, vendorName: purchaseInvoices.vendorName, dueDate: purchaseInvoices.dueDate, totalAmount: purchaseInvoices.totalAmount })
      .from(purchaseInvoices).where(and(eq(purchaseInvoices.companyId, companyId), sql`${purchaseInvoices.dueDate} IS NOT NULL`, sql`${purchaseInvoices.dueDate} >= ${todayStr}`, sql`${purchaseInvoices.dueDate} <= ${futureStr}`, sql`${purchaseInvoices.status} != 'cancelled'`, sql`COALESCE(${purchaseInvoices.paymentStatus}, 'unpaid') != 'paid'`));
    const upcomingAP_EXP = await db.select({ id: expenses.id, docNo: expenses.expNo, vendorName: expenses.vendorName, dueDate: expenses.dueDate, totalAmount: expenses.totalAmount })
      .from(expenses).where(and(eq(expenses.companyId, companyId), sql`${expenses.dueDate} IS NOT NULL`, sql`${expenses.dueDate} >= ${todayStr}`, sql`${expenses.dueDate} <= ${futureStr}`, sql`${expenses.status} != 'cancelled'`, sql`COALESCE(${expenses.paymentStatus}, 'unpaid') != 'paid'`));

    const allOverdueAR = [...overdueAR_IV.map(r => ({ ...r, dt: "IV", contact: r.customerName })), ...overdueAR_TIV.map(r => ({ ...r, dt: "TIV", contact: r.customerName }))];
    const allOverdueAP = [...overdueAP_PI.map(r => ({ ...r, dt: "AP", contact: r.vendorName })), ...overdueAP_EXP.map(r => ({ ...r, dt: "EXP", contact: r.vendorName }))];
    const allUpcomingAR = [...upcomingAR_IV.map(r => ({ ...r, dt: "IV", contact: r.customerName })), ...upcomingAR_TIV.map(r => ({ ...r, dt: "TIV", contact: r.customerName }))];
    const allUpcomingAP = [...upcomingAP_PI.map(r => ({ ...r, dt: "AP", contact: r.vendorName })), ...upcomingAP_EXP.map(r => ({ ...r, dt: "EXP", contact: r.vendorName }))];

    for (const doc of allOverdueAR) {
      const entityKey = `overdue_ar_${doc.dt}_${doc.id}`;
      const [ex] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.companyId, companyId), eq(notifications.type, "payment_overdue"), eq(notifications.title, entityKey)));
      if (!ex) {
        await db.insert(notifications).values({ companyId, tenantId, type: "payment_overdue", title: entityKey, message: `ลูกหนี้ค้างชำระ ${doc.docNo} - ${doc.contact} จำนวน ฿${parseFloat(doc.totalAmount || "0").toLocaleString("th-TH", { minimumFractionDigits: 2 })} เกินกำหนด ${doc.dueDate}`, link: "/finance/due-calendar", isRead: false });
        newCount++;
      }
    }
    for (const doc of allOverdueAP) {
      const entityKey = `overdue_ap_${doc.dt}_${doc.id}`;
      const [ex] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.companyId, companyId), eq(notifications.type, "payment_overdue"), eq(notifications.title, entityKey)));
      if (!ex) {
        await db.insert(notifications).values({ companyId, tenantId, type: "payment_overdue", title: entityKey, message: `เจ้าหนี้ค้างชำระ ${doc.docNo} - ${doc.contact} จำนวน ฿${parseFloat(doc.totalAmount || "0").toLocaleString("th-TH", { minimumFractionDigits: 2 })} เกินกำหนด ${doc.dueDate}`, link: "/finance/due-calendar", isRead: false });
        newCount++;
      }
    }
    for (const doc of allUpcomingAR) {
      const entityKey = `upcoming_ar_${doc.dt}_${doc.id}`;
      const [ex] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.companyId, companyId), eq(notifications.type, "payment_upcoming"), eq(notifications.title, entityKey)));
      if (!ex) {
        await db.insert(notifications).values({ companyId, tenantId, type: "payment_upcoming", title: entityKey, message: `ลูกหนี้ใกล้ครบกำหนด ${doc.docNo} - ${doc.contact} จำนวน ฿${parseFloat(doc.totalAmount || "0").toLocaleString("th-TH", { minimumFractionDigits: 2 })} กำหนดชำระ ${doc.dueDate}`, link: "/finance/due-calendar", isRead: false });
        newCount++;
      }
    }
    for (const doc of allUpcomingAP) {
      const entityKey = `upcoming_ap_${doc.dt}_${doc.id}`;
      const [ex] = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.companyId, companyId), eq(notifications.type, "payment_upcoming"), eq(notifications.title, entityKey)));
      if (!ex) {
        await db.insert(notifications).values({ companyId, tenantId, type: "payment_upcoming", title: entityKey, message: `เจ้าหนี้ใกล้ครบกำหนด ${doc.docNo} - ${doc.contact} จำนวน ฿${parseFloat(doc.totalAmount || "0").toLocaleString("th-TH", { minimumFractionDigits: 2 })} กำหนดชำระ ${doc.dueDate}`, link: "/finance/due-calendar", isRead: false });
        newCount++;
      }
    }

    try {
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const budgetRows = await db.select().from(budgets)
        .where(and(eq(budgets.companyId, companyId), eq(budgets.year, currentYear)));
      if (budgetRows.length > 0) {
        const { getAccountBalances: gab, balanceMapFromRows: bmfr } = await import("./report-queries");
        const allAccts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
        const budgetByAcct = new Map<string, number[]>();
        for (const b of budgetRows) {
          if (!budgetByAcct.has(b.accountCode)) budgetByAcct.set(b.accountCode, new Array(12).fill(0));
          budgetByAcct.get(b.accountCode)![b.month - 1] = parseFloat(b.amount);
        }
        for (let m = 1; m <= currentMonth; m++) {
          const ms = `${currentYear}-${String(m).padStart(2, "0")}-01`;
          const ld = new Date(currentYear, m, 0).getDate();
          const me = `${currentYear}-${String(m).padStart(2, "0")}-${String(ld).padStart(2, "0")}`;
          const bRows = await gab(companyId, ms, me);
          const bMap = bmfr(bRows);
          for (const acct of allAccts) {
            if (acct.type !== "expense") continue;
            const bal = bMap.get(acct.id) || { debit: 0, credit: 0 };
            const actual = bal.debit - bal.credit;
            const budget = budgetByAcct.get(acct.code)?.[m - 1] || 0;
            if (budget <= 0 || actual <= 0) continue;
            const usagePct = (actual / budget) * 100;
            if (usagePct > 80) {
              const level = usagePct > 100 ? "danger" : "warning";
              const entityKey = `budget_alert_${acct.code}_${currentYear}_${m}_${level}`;
              const [ex] = await db.select({ id: notifications.id }).from(notifications)
                .where(and(eq(notifications.companyId, companyId), eq(notifications.title, entityKey)));
              if (!ex) {
                const msg = usagePct > 100
                  ? `ค่าใช้จ่าย ${(acct as any).nameTh || acct.name} เดือน ${m}/${currentYear} เกินงบ ${Math.round(usagePct)}%`
                  : `ค่าใช้จ่าย ${(acct as any).nameTh || acct.name} เดือน ${m}/${currentYear} ใช้ไป ${Math.round(usagePct)}% ของงบ`;
                await db.insert(notifications).values({ companyId, tenantId, type: "budget_alert", title: entityKey, message: msg, link: `/reports/budget-vs-actual?year=${currentYear}`, isRead: false });
                newCount++;
              }
            }
          }
        }
      }
    } catch (budgetErr: any) { console.error("[notifications] Budget alert scan error:", budgetErr.message); }

    res.json({ newCount });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/finance/receipt-billing", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const ivRows = await db.select({
      id: invoices.id, docNo: invoices.invoiceNo, docDate: invoices.invoiceDate,
      dueDate: invoices.dueDate, contactName: invoices.customerName,
      totalAmount: invoices.totalAmount, subtotal: invoices.subtotal, paymentStatus: invoices.paymentStatus, status: invoices.status,
    }).from(invoices).where(and(
      eq(invoices.companyId, companyId),
      sql`${invoices.status} != 'cancelled'`,
      sql`COALESCE(${invoices.paymentStatus}, 'unpaid') != 'paid'`
    )).orderBy(invoices.dueDate);

    const tivRows = await db.select({
      id: taxInvoices.id, docNo: taxInvoices.taxInvoiceNo, docDate: taxInvoices.taxInvoiceDate,
      dueDate: taxInvoices.dueDate, contactName: taxInvoices.customerName,
      totalAmount: taxInvoices.totalAmount, subtotal: taxInvoices.subtotal, paymentStatus: taxInvoices.paymentStatus, status: taxInvoices.status, paymentMethod: taxInvoices.paymentMethod,
    }).from(taxInvoices).where(and(
      eq(taxInvoices.companyId, companyId),
      sql`${taxInvoices.status} != 'cancelled'`,
      sql`COALESCE(${taxInvoices.paymentStatus}, 'unpaid') != 'paid'`
    )).orderBy(taxInvoices.dueDate);

    const documents = [
      ...ivRows.map(r => {
        const sub = parseFloat(r.subtotal ?? "");
        if (isNaN(sub)) throw new Error(`receipt-billing IV ${r.docNo ?? r.id} is missing subtotal`);
        return { ...r, docType: "IV", totalAmount: parseFloat(r.totalAmount || "0"), subtotal: sub };
      }),
      ...tivRows.map(r => {
        const sub = parseFloat(r.subtotal ?? "");
        if (isNaN(sub)) throw new Error(`receipt-billing TIV ${r.docNo ?? r.id} is missing subtotal`);
        return { ...r, docType: "TIV", totalAmount: parseFloat(r.totalAmount || "0"), subtotal: sub };
      }),
    ];

    const rcRows = await db.select({
      id: receipts.id, receiptNo: receipts.receiptNo, receiptDate: receipts.receiptDate,
      customerName: receipts.customerName, totalAmount: receipts.totalAmount,
      paymentMethod: receipts.paymentMethod, status: receipts.status,
    }).from(receipts).where(and(
      eq(receipts.companyId, companyId),
      sql`${receipts.status} != 'cancelled'`
    )).orderBy(sql`${receipts.receiptDate} DESC`).limit(50);

    const rcIds = rcRows.map(r => r.id);
    let linkedDocs: any[] = [];
    if (rcIds.length > 0) {
      linkedDocs = await db.select().from(receiptLinkedDocs)
        .where(sql`${receiptLinkedDocs.receiptId} IN (${sql.join(rcIds.map(id => sql`${id}`), sql`, `)})`);
    }
    const rcWithDocs = rcRows.map(r => ({
      ...r,
      totalAmount: parseFloat(r.totalAmount || "0"),
      linkedDocs: linkedDocs.filter(ld => ld.receiptId === r.id).map(ld => ({
        docType: ld.docType, docNo: ld.docNo, amount: parseFloat(ld.amount || "0"),
      })),
    }));

    res.json({ documents, recentReceipts: rcWithDocs });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/finance/payments", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const rcRows = await db.select({
      id: receipts.id, docNo: receipts.receiptNo, docDate: receipts.receiptDate,
      contactName: receipts.customerName, totalAmount: receipts.totalAmount,
      withholdingTax: receipts.withholdingTax,
      paymentMethod: receipts.paymentMethod, paymentDate: receipts.paymentDate,
      status: receipts.status, notes: receipts.notes, refDoc: receipts.refDoc,
    }).from(receipts).where(and(
      eq(receipts.companyId, companyId),
      sql`${receipts.status} != 'cancelled'`
    )).orderBy(sql`${receipts.receiptDate} DESC`).limit(200);

    const rcIds = rcRows.map(r => r.id);
    let rcLinked: any[] = [];
    if (rcIds.length > 0) {
      rcLinked = await db.select().from(receiptLinkedDocs)
        .where(sql`${receiptLinkedDocs.receiptId} IN (${sql.join(rcIds.map(id => sql`${id}`), sql`, `)})`);
    }

    const pvRows = await db.select({
      id: paymentVouchers.id, docNo: paymentVouchers.pvNo, docDate: paymentVouchers.pvDate,
      contactName: paymentVouchers.vendorName, totalAmount: paymentVouchers.totalAmount,
      withholdingTax: paymentVouchers.withholdingTax,
      paymentMethod: paymentVouchers.paymentMethod, paymentDate: paymentVouchers.paymentDate,
      status: paymentVouchers.status, notes: paymentVouchers.notes,
    }).from(paymentVouchers).where(and(
      eq(paymentVouchers.companyId, companyId),
      sql`${paymentVouchers.status} != 'cancelled'`
    )).orderBy(sql`${paymentVouchers.pvDate} DESC`).limit(200);

    const pvIds = pvRows.map(r => r.id);
    let pvLinked: any[] = [];
    if (pvIds.length > 0) {
      pvLinked = await db.select().from(paymentVoucherLinkedDocs)
        .where(sql`${paymentVoucherLinkedDocs.paymentVoucherId} IN (${sql.join(pvIds.map(id => sql`${id}`), sql`, `)})`);
    }

    const receiptList = rcRows.map(r => ({
      ...r, type: "receive" as const,
      totalAmount: parseFloat(r.totalAmount || "0"),
      withholdingTax: parseFloat(r.withholdingTax || "0"),
      linkedDocs: rcLinked.filter(ld => ld.receiptId === r.id).map(ld => ({
        docType: ld.docType, docNo: ld.docNo, amount: parseFloat(ld.amount || "0"),
      })),
    }));

    const pvList = pvRows.map(r => ({
      ...r, type: "payment" as const, refDoc: null,
      totalAmount: parseFloat(r.totalAmount || "0"),
      withholdingTax: parseFloat(r.withholdingTax || "0"),
      linkedDocs: pvLinked.filter(ld => ld.paymentVoucherId === r.id).map(ld => ({
        docType: ld.docType, docNo: ld.docNo, amount: parseFloat(ld.amount || "0"),
      })),
    }));

    const all = [...receiptList, ...pvList].sort((a, b) => {
      const da = new Date(a.docDate || "").getTime();
      const db2 = new Date(b.docDate || "").getTime();
      return db2 - da;
    });

    const totalReceived = receiptList.reduce((s, r) => s + r.totalAmount, 0);
    const totalPaid = pvList.reduce((s, r) => s + r.totalAmount, 0);

    res.json({ payments: all, summary: { totalReceived, totalPaid, count: all.length } });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/finance/customer-outstanding", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const q = String(req.query.q || "").trim();
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    if (!q) return res.json({ contacts: [], documents: [] });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const searchTerm = `%${q}%`;
    const matchingContacts = await db.select({
      id: contacts.id, code: contacts.code, name: contacts.name, taxId: contacts.taxId,
      address: contacts.address, buildingNumber: contacts.buildingNumber,
      branch: contacts.branch, email: contacts.email,
    }).from(contacts).where(and(
      eq(contacts.companyId, companyId),
      eq(contacts.active, true),
      or(
        sql`${contacts.name} ILIKE ${searchTerm}`,
        sql`${contacts.code} ILIKE ${searchTerm}`,
        sql`${contacts.taxId} ILIKE ${searchTerm}`,
        sql`CAST(${contacts.id} AS TEXT) = ${q}`
      )
    )).limit(10);

    res.json({ contacts: matchingContacts });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/finance/customer-outstanding-docs", requireAuth, async (req, res) => {
  try {
    const companyId = Number(req.query.companyId);
    const contactId = Number(req.query.contactId);
    const contactName = String(req.query.contactName || "");
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const ivRows = await db.select({
      id: invoices.id, docNo: invoices.invoiceNo, docDate: invoices.invoiceDate,
      dueDate: invoices.dueDate, contactName: invoices.customerName,
      totalAmount: invoices.totalAmount, subtotal: invoices.subtotal, paymentStatus: invoices.paymentStatus,
      customerId: invoices.customerId,
    }).from(invoices).where(and(
      eq(invoices.companyId, companyId),
      sql`${invoices.status} != 'cancelled'`,
      sql`COALESCE(${invoices.paymentStatus}, 'unpaid') != 'paid'`,
      contactId ? eq(invoices.customerId, contactId) : sql`${invoices.customerName} = ${contactName}`
    )).orderBy(invoices.dueDate);

    const tivRows = await db.select({
      id: taxInvoices.id, docNo: taxInvoices.taxInvoiceNo, docDate: taxInvoices.taxInvoiceDate,
      dueDate: taxInvoices.dueDate, contactName: taxInvoices.customerName,
      totalAmount: taxInvoices.totalAmount, subtotal: taxInvoices.subtotal, paymentStatus: taxInvoices.paymentStatus,
      customerId: taxInvoices.customerId, withholdingTax: taxInvoices.withholdingTax,
    }).from(taxInvoices).where(and(
      eq(taxInvoices.companyId, companyId),
      sql`${taxInvoices.status} != 'cancelled'`,
      sql`COALESCE(${taxInvoices.paymentStatus}, 'unpaid') != 'paid'`,
      sql`COALESCE(${taxInvoices.paymentMethod}, 'เครดิต') != 'เงินสด'`,
      contactId ? eq(taxInvoices.customerId, contactId) : sql`${taxInvoices.customerName} = ${contactName}`
    )).orderBy(taxInvoices.dueDate);

    const documents = [
      ...ivRows.map(r => {
        const sub = parseFloat(r.subtotal ?? "");
        if (isNaN(sub)) throw new Error(`customer-outstanding-docs IV ${r.docNo ?? r.id} is missing subtotal`);
        return { ...r, docType: "IV", totalAmount: parseFloat(r.totalAmount || "0"), subtotal: sub };
      }),
      ...tivRows.map(r => {
        const sub = parseFloat(r.subtotal ?? "");
        if (isNaN(sub)) throw new Error(`customer-outstanding-docs TIV ${r.docNo ?? r.id} is missing subtotal`);
        const net = parseFloat(r.totalAmount || "0");
        const wht = parseFloat(r.withholdingTax || "0");
        const gross = net + wht;
        return { ...r, docType: "TIV", totalAmount: gross, withholdingTax: wht, subtotal: sub };
      }),
    ];

    res.json({ documents });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/finance/record-payment", requireAuth, async (req, res) => {
  try {
    const { companyId, docType, docId, amount, paymentMethod, paymentDate } = req.body;
    if (!companyId || !docType || !docId || !amount) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    if (docType === "IV") {
      const [doc] = await db.select().from(invoices).where(and(eq(invoices.id, docId), eq(invoices.companyId, companyId)));
      if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const total = parseFloat(doc.totalAmount || "0");
      const newStatus = amount >= total ? "paid" : "partial";
      await db.update(invoices).set({ paymentStatus: newStatus, paymentMethod: paymentMethod || null }).where(eq(invoices.id, docId));
    } else if (docType === "TIV") {
      const [doc] = await db.select().from(taxInvoices).where(and(eq(taxInvoices.id, docId), eq(taxInvoices.companyId, companyId)));
      if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
      { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      const total = parseFloat(doc.totalAmount || "0");
      const newStatus = amount >= total ? "paid" : "partial";
      await db.update(taxInvoices).set({ paymentStatus: newStatus, paymentMethod: paymentMethod || null }).where(eq(taxInvoices.id, docId));
    } else {
      return res.status(400).json({ message: "docType ไม่ถูกต้อง" });
    }

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/finance/batch-receipt", requireAuth, async (req, res) => {
  try {
    const { companyId, documents, paymentMethod, paymentDate, notes, withholdingTax } = req.body;
    if (!companyId || !documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ message: "กรุณาเลือกเอกสารอย่างน้อย 1 รายการ" });
    }
    const user = req.user as any;
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

    const customerNames = new Set(documents.map((d: any) => d.contactName || "ลูกค้าทั่วไป"));
    if (customerNames.size > 1) return res.status(400).json({ message: "กรุณาเลือกลูกค้าเดียวกันเท่านั้น" });
    for (const doc of documents) {
      if (!["TIV", "IV"].includes(doc.docType) || !doc.docId) return res.status(400).json({ message: "docType ต้องเป็น TIV หรือ IV" });
      const amt = parseFloat(doc.amount);
      if (!amt || amt <= 0) return res.status(400).json({ message: "จำนวนเงินต้องมากกว่า 0" });
    }
    const grossAmount = documents.reduce((s: number, d: any) => s + (parseFloat(d.amount) || 0), 0);
    if (grossAmount <= 0) return res.status(400).json({ message: "ยอดรวมต้องมากกว่า 0" });
    const whtAmt = parseFloat(withholdingTax) || 0;
    const netAmount = grossAmount - whtAmt;
    const customerName = documents[0].contactName || "ลูกค้าทั่วไป";
    const customerId = documents[0].customerId || null;
    const receiptNo = await getNextDocNo(companyId, "RE", receipts, receipts.receiptNo, receipts.companyId, paymentDate);

    // Compute actual VAT by summing vatAmount from linked IV/TIV records
    let actualVatAmount = 0;
    let actualSubtotal = 0;
    for (const doc of documents) {
      if (doc.docType === "IV") {
        const [iv] = await db.select().from(invoices).where(eq(invoices.id, doc.docId));
        if (!iv) throw new Error(`batch-receipt: invoice id=${doc.docId} not found`);
        const sub = parseFloat(iv.subtotal ?? "");
        if (isNaN(sub)) throw new Error(`batch-receipt: invoice id=${doc.docId} is missing subtotal`);
        actualVatAmount += parseFloat(iv.vatAmount || "0");
        actualSubtotal += sub;
      } else if (doc.docType === "TIV") {
        const [tiv] = await db.select().from(taxInvoices).where(eq(taxInvoices.id, doc.docId));
        if (!tiv) throw new Error(`batch-receipt: tax invoice id=${doc.docId} not found`);
        const sub = parseFloat(tiv.subtotal ?? "");
        if (isNaN(sub)) throw new Error(`batch-receipt: tax invoice id=${doc.docId} is missing subtotal`);
        actualVatAmount += parseFloat(tiv.vatAmount || "0");
        actualSubtotal += sub;
      }
    }
    if (actualSubtotal <= 0) throw new Error(`batch-receipt: actualSubtotal is ${actualSubtotal} — all linked documents must have a valid subtotal`);

    const result = await db.transaction(async (tx) => {
      const [receipt] = await tx.insert(receipts).values({
        companyId,
        receiptNo,
        receiptDate: paymentDate || new Date().toISOString().split("T")[0],
        customerId,
        customerName,
        subtotal: String(actualSubtotal),
        vatAmount: String(actualVatAmount),
        withholdingTax: String(whtAmt),
        totalAmount: String(netAmount),
        status: "approved",
        paymentMethod: paymentMethod || "โอนเงิน",
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        notes: notes || `รวมชำระ ${documents.length} รายการ`,
        docPrefix: "RE",
        createdBy: user.id,
        updatedBy: user.id,
      }).returning();

      for (const doc of documents) {
        await tx.insert(receiptLinkedDocs).values({
          receiptId: receipt.id,
          docType: doc.docType,
          docId: doc.docId,
          docNo: doc.docNo || null,
          amount: String(doc.amount),
        });
      }
      return receipt;
    });

    for (const doc of documents) {
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
        subtotal: String(actualSubtotal),
        vatAmount: String(actualVatAmount),
        totalAmount: String(netAmount),
        withholdingTax: String(whtAmt),
        currencyCode: "THB",
        exchangeRate: "1",
        userId: user.id,
        customerName,
        paymentMethod: paymentMethod || "โอนเงิน",
        paymentMethodAccountCode: pmAccCode,
        linkedInvoiceId: documents[0]?.docId,
        overrideLines: req.body?.journalOverrideLines || undefined,
      });
    } catch (e: any) { console.error("[batch-receipt] journal creation failed:", e.message); }

    res.json({ success: true, receipt: result, journalResult });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

}
