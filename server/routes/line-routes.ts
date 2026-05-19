import type { Express, Request, Response } from "express";
import { db } from "../db";
import { ecomDb } from "../ecom-db";
import { storage } from "../storage";
import { eq, desc, and, isNull, isNotNull, asc, inArray, count , sql } from "drizzle-orm";
import { companies, employees, firmClients, users, tenants, platformChatThreads, otRecords, lineRecipients, lineDocuments, lineGroupMappings, lineDocClassifyRules, invoices, taxInvoices, receipts, quotations } from "@shared/schema";
import { requireAuth, requireSuperAdmin, checkDocOwnership } from "../route-middleware";
import path from "path";
import fs from "fs";
import os from "os";
import OpenAI from "openai";
import { sanitizeFilename } from "../utils/safe-filename";
import { pool } from "../db";

let openai: OpenAI | null = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch {}

export function registerLineRoutes(app: Express) {

let _cachedDefaultLineToken: string | null = null;
let _cachedDefaultLineTokenTime = 0;
const TOKEN_CACHE_TTL = 5 * 60 * 1000;

async function getDefaultLineToken(): Promise<string | null> {
  if (process.env.LINE_CHANNEL_ACCESS_TOKEN) return process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const now = Date.now();
  if (_cachedDefaultLineToken && now - _cachedDefaultLineTokenTime < TOKEN_CACHE_TTL) return _cachedDefaultLineToken;
  try {
    const rows = await db.execute(sql`SELECT config_value FROM system_config WHERE config_key = 'LINE_CHANNEL_ACCESS_TOKEN' LIMIT 1`);
    if (rows.rows.length > 0) {
      _cachedDefaultLineToken = (rows.rows[0] as any).config_value;
      _cachedDefaultLineTokenTime = now;
      return _cachedDefaultLineToken;
    }
  } catch {}
  try {
    const [comp] = await db.select({ lineChannelAccessToken: companies.lineChannelAccessToken })
      .from(companies).where(isNotNull(companies.lineChannelAccessToken)).limit(1);
    if (comp?.lineChannelAccessToken) {
      _cachedDefaultLineToken = comp.lineChannelAccessToken;
      _cachedDefaultLineTokenTime = now;
      return _cachedDefaultLineToken;
    }
  } catch {}
  return null;
}

async function getLineTokenForCompany(companyId: number | null): Promise<string | null> {
  if (companyId) {
    try {
      const [comp] = await db.select({ lineChannelAccessToken: companies.lineChannelAccessToken })
        .from(companies).where(eq(companies.id, companyId));
      if (comp?.lineChannelAccessToken) return comp.lineChannelAccessToken;
    } catch {}
  }
  return getDefaultLineToken();
}

// ========== LINE Settings (per-company) ==========
async function verifyCompanyAccess(user: any, companyId: number): Promise<boolean> {
  if (user.role === "super_admin") return true;
  const [company] = await db.select({ tenantId: companies.tenantId }).from(companies).where(eq(companies.id, companyId));
  if (!company) return false;
  if (user.tenantId && company.tenantId !== user.tenantId) return false;
  return ["admin", "manager", "accountant", "employee"].includes(user.role);
}

app.get("/api/line/settings", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
    const [company] = await db.select({
      lineChannelAccessToken: companies.lineChannelAccessToken,
      lineChannelSecret: companies.lineChannelSecret,
      lineId: companies.lineId,
    }).from(companies).where(eq(companies.id, companyId));
    if (!company) return res.status(404).json({ message: "ไม่พบบริษัท" });
    res.json({
      hasCompanyToken: !!company.lineChannelAccessToken,
      hasPlatformToken: !!(process.env.LINE_CHANNEL_ACCESS_TOKEN || _cachedDefaultLineToken),
      lineChannelAccessToken: company.lineChannelAccessToken ? "••••••••" + company.lineChannelAccessToken.slice(-8) : "",
      lineChannelSecret: company.lineChannelSecret ? "••••••••" + company.lineChannelSecret.slice(-6) : "",
      lineId: company.lineId || "",
    });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/line/settings", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { companyId, lineChannelAccessToken, lineChannelSecret, lineId } = req.body;
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });
    if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขการตั้งค่าบริษัทนี้" });
    const updateData: any = { lineId: lineId || null };
    if (lineChannelAccessToken && !lineChannelAccessToken.startsWith("••••")) {
      updateData.lineChannelAccessToken = lineChannelAccessToken;
    }
    if (lineChannelSecret && !lineChannelSecret.startsWith("••••")) {
      updateData.lineChannelSecret = lineChannelSecret;
    }
    if (lineChannelAccessToken === "") updateData.lineChannelAccessToken = null;
    if (lineChannelSecret === "") updateData.lineChannelSecret = null;
    await db.update(companies).set(updateData).where(eq(companies.id, companyId));
    res.json({ success: true, message: "บันทึกการตั้งค่า LINE สำเร็จ" });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/line/test", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { companyId } = req.body;
    let token = await getLineTokenForCompany(companyId ? Number(companyId) : null) || "";
    if (companyId) {
      if (!(await verifyCompanyAccess(user, companyId))) return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์" });
    }
    if (!token) return res.status(400).json({ success: false, message: "ไม่พบ LINE Channel Access Token" });
    const botRes = await fetch("https://api.line.me/v2/bot/info", {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!botRes.ok) return res.status(400).json({ success: false, message: "Token ไม่ถูกต้องหรือหมดอายุ" });
    const botInfo = await botRes.json() as any;
    res.json({ success: true, message: "เชื่อมต่อสำเร็จ", botName: botInfo.displayName, botPicture: botInfo.pictureUrl });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
});

// ========== LINE Messaging ==========
app.post("/api/line/send", requireAuth, async (req, res) => {
  try {
    const { to, message, companyId } = req.body;
    if (!to || !message) return res.status(400).json({ message: "กรุณาระบุผู้รับและข้อความ" });
    let token = await getLineTokenForCompany(companyId ? Number(companyId) : null) || "";
    if (!token) return res.status(400).json({ message: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" });
    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text: message }] }),
    });
    if (!lineRes.ok) {
      const err = await lineRes.json().catch(() => ({}));
      return res.status(lineRes.status).json({ message: (err as any).message || "ส่งข้อความ LINE ไม่สำเร็จ", detail: err });
    }
    res.json({ success: true, message: "ส่งข้อความ LINE สำเร็จ" });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/line/send-doc", requireAuth, async (req, res) => {
  try {
    const { to, companyId, docType, shareUrl } = req.body;
    if (!to || !shareUrl) return res.status(400).json({ message: "กรุณาระบุผู้รับและลิงก์เอกสาร" });

    const token = await getLineTokenForCompany(companyId ? Number(companyId) : null) || "";
    if (!token) return res.status(400).json({ message: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" });

    const DOC_LABELS: Record<string, string> = {
      invoice: "ใบแจ้งหนี้", "tax-invoice": "ใบกำกับภาษี", receipt: "ใบเสร็จรับเงิน",
      quotation: "ใบเสนอราคา", "sales-order": "ใบสั่งขาย",
      "tax_invoice": "ใบกำกับภาษี", "sales_order": "ใบสั่งขาย",
      "wht-cert": "ใบ 50 ทวิ",
    };
    const DOC_COLORS: Record<string, string> = {
      invoice: "#fb9678", quotation: "#fb9678", "sales-order": "#fb9678", "sales_order": "#fb9678",
      "tax-invoice": "#03c9d7", "tax_invoice": "#03c9d7", receipt: "#03c9d7",
      "wht-cert": "#9333ea",
    };
    const labelTh = DOC_LABELS[docType] || "เอกสาร";
    const cardColor = DOC_COLORS[docType] || "#fb9678";

    let docNo = "", customerName = "", amountStr = "", companyName = "";
    try {
      const tokenMatch = shareUrl.match(/\/share\/[^/]+\/([a-f0-9]+)/);
      const shareToken = tokenMatch ? tokenMatch[1] : "";
      if (shareToken) {
        let cid = 0;
        const calcNet = (r: any) => {
          const sub = parseFloat(r?.subtotal || "0");
          const disc = parseFloat(r?.discountAmount || "0");
          const vat = parseFloat(r?.vatAmount || "0");
          const wht = parseFloat(r?.withholdingTax || "0");
          const pm = r?.priceMode || "excluded";
          const vbv = pm === "included" ? (sub - disc - vat) : (sub - disc);
          return vbv + vat - wht;
        };
        if (docType === "invoice") {
          const [r] = await db.select().from(invoices).where(eq(invoices.shareToken, shareToken));
          cid = r?.companyId || 0;
          const net = calcNet(r); amountStr = net ? net.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "";
          docNo = r?.invoiceNo || ""; customerName = r?.customerName || "";
        } else if (docType === "tax-invoice" || docType === "tax_invoice") {
          const [r] = await db.select().from(taxInvoices).where(eq(taxInvoices.shareToken, shareToken));
          cid = r?.companyId || 0;
          const net = calcNet(r); amountStr = net ? net.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "";
          docNo = r?.taxInvoiceNo || ""; customerName = r?.customerName || "";
        } else if (docType === "receipt") {
          const [r] = await db.select().from(receipts).where(eq(receipts.shareToken, shareToken));
          cid = r?.companyId || 0;
          const net = calcNet(r); amountStr = net ? net.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "";
          docNo = r?.receiptNo || ""; customerName = r?.customerName || "";
        } else if (docType === "quotation") {
          const [r] = await db.select().from(quotations).where(eq(quotations.shareToken, shareToken));
          cid = r?.companyId || 0;
          const net = calcNet(r); amountStr = net ? net.toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "";
          docNo = r?.quotationNo || ""; customerName = r?.customerName || "";
        } else if (docType === "wht-cert") {
          const rows = await db.execute(sql`SELECT id, cert_no, payee_name, tax_withheld, company_id FROM withholding_tax_certs WHERE share_token = ${shareToken} LIMIT 1`);
          const r = (rows as any).rows?.[0];
          if (r) {
            cid = Number(r.company_id) || 0;
            docNo = r.cert_no || "";
            customerName = r.payee_name || "";
            amountStr = r.tax_withheld ? Number(r.tax_withheld).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "";
          }
        }
        if (cid) {
          const [co] = await db.select().from(companies).where(eq(companies.id, cid));
          companyName = co?.name || "";
        }
      }
    } catch {}

    const altText = `${labelTh}${docNo ? ` ${docNo}` : ""}${companyName ? ` จาก ${companyName}` : ""}`;
    const flexMessage = {
      type: "flex",
      altText,
      contents: {
        type: "bubble",
        header: {
          type: "box", layout: "vertical", backgroundColor: cardColor, paddingAll: "16px",
          contents: [
            ...(companyName ? [{ type: "text", text: companyName, size: "xs", color: "#ffffff", weight: "bold" }] : []),
            { type: "text", text: labelTh, size: "lg", color: "#ffffff", weight: "bold" },
          ],
        },
        body: {
          type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
          contents: [
            ...(docNo ? [{ type: "text", text: docNo, size: "md", weight: "bold", color: "#333333" }] : []),
            ...(customerName ? [{ type: "text", text: customerName, size: "sm", color: "#888888", wrap: true }] : []),
            ...(amountStr ? [
              { type: "separator", margin: "md" },
              {
                type: "box", layout: "horizontal", margin: "md",
                contents: [
                  { type: "text", text: "ยอดชำระ", size: "sm", color: "#888888", flex: 1 },
                  { type: "text", text: `฿${amountStr}`, size: "sm", weight: "bold", color: cardColor, align: "end" },
                ],
              },
            ] : []),
          ],
        },
        footer: {
          type: "box", layout: "vertical", paddingAll: "16px",
          contents: [{
            type: "button",
            action: { type: "uri", label: `ดู${labelTh}`, uri: shareUrl },
            style: "primary", color: cardColor,
          }],
        },
      },
    };

    const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ to, messages: [flexMessage] }),
    });
    if (!lineRes.ok) {
      const err = await lineRes.json().catch(() => ({}));
      return res.status(lineRes.status).json({ message: (err as any).message || "ส่งข้อความ LINE ไม่สำเร็จ", detail: err });
    }
    res.json({ success: true, message: "ส่งข้อความ LINE สำเร็จ" });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// LINE Webhook — receives events from LINE (join, follow, etc.)
app.post("/api/line/webhook", async (req, res) => {
  try {
    const events = req.body?.events || [];
    res.status(200).json({ success: true });

    for (const event of events) {
      if (event.type === "join" && event.source?.type === "group") {
        const groupId = event.source.groupId;
        const token = await getDefaultLineToken();
        let groupName = null;
        if (token && groupId) {
          try {
            const profileRes = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
              headers: { "Authorization": `Bearer ${token}` },
            });
            if (profileRes.ok) {
              const profile = await profileRes.json();
              groupName = (profile as any).groupName || null;
            }
          } catch {}
        }
        await db.execute(sql`INSERT INTO line_recipients (line_id, type, display_name) VALUES (${groupId}, 'group', ${groupName}) ON CONFLICT (line_id, type) DO UPDATE SET display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), line_recipients.display_name)`);

        // Auto-register as pending group mapping for LINE Document Archive
        const existingMapping = await storage.getLineGroupMappingByGroupId(groupId);
        if (!existingMapping) {
          try {
            await storage.createLineGroupMapping({
              tenantId: null,
              companyId: null,
              firmClientId: null,
              lineGroupId: groupId,
              groupName: groupName || `กลุ่ม ${groupId.substring(0, 8)}...`,
              active: false,
            });
            console.log(`[LINE Auto-Join] Auto-registered pending group: ${groupId} (${groupName || 'no name'})`);
          } catch (autoErr: any) {
            console.error("[LINE Auto-Join] Failed to auto-register group:", autoErr.message);
          }
        }
      } else if (event.type === "follow" && event.source?.type === "user") {
        const userId = event.source.userId;
        const token = await getDefaultLineToken();
        let userName = null;
        if (token && userId) {
          try {
            const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
              headers: { "Authorization": `Bearer ${token}` },
            });
            if (profileRes.ok) {
              const profile = await profileRes.json();
              userName = (profile as any).displayName || null;
            }
          } catch {}
        }
        await db.execute(sql`INSERT INTO line_recipients (line_id, type, display_name) VALUES (${userId}, 'user', ${userName}) ON CONFLICT (line_id, type) DO UPDATE SET display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), line_recipients.display_name)`);
      } else if (event.type === "message" && event.source?.type === "user") {
        const userId = event.source.userId;
        const token = await getDefaultLineToken();
        let userName = null;
        if (token && userId) {
          try {
            const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
              headers: { "Authorization": `Bearer ${token}` },
            });
            if (profileRes.ok) {
              const profile = await profileRes.json();
              userName = (profile as any).displayName || null;
            }
          } catch {}
        }
        await db.execute(sql`INSERT INTO line_recipients (line_id, type, display_name) VALUES (${userId}, 'user', ${userName}) ON CONFLICT (line_id, type) DO UPDATE SET display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), line_recipients.display_name)`);

        const msgText = (event.message?.text || "").trim();
        const linkMatch = msgText.match(/^(?:ลงทะเบียน|link|เชื่อม)\s*(.+)$/i);
        if (linkMatch && token) {
          const empCode = linkMatch[1].trim().toUpperCase();
          try {
            const [emp] = await db.select().from(employees)
              .where(sql`UPPER(${employees.employeeCode}) = ${empCode}`);
            if (emp) {
              const [alreadyLinked] = await db.select().from(employees)
                .where(sql`${employees.lineUserId} = ${userId} AND ${employees.id} != ${emp.id}`);
              if (alreadyLinked) {
                await fetch("https://api.line.me/v2/bot/message/reply", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                  body: JSON.stringify({
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: `⚠️ LINE นี้เชื่อมกับพนักงานคนอื่นแล้ว (${alreadyLinked.employeeCode})` }],
                  }),
                });
              } else {
                await db.update(employees)
                  .set({ lineUserId: userId })
                  .where(eq(employees.id, emp.id));
                const empName = `${emp.firstName} ${emp.lastName}`.trim();
                await fetch("https://api.line.me/v2/bot/message/reply", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                  body: JSON.stringify({
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: `✅ เชื่อม LINE สำเร็จ!\n👤 ${empName}\n🔑 รหัส: ${emp.employeeCode}\n\nตอนนี้คุณจะได้รับสลิปเงินเดือนและการแจ้งเตือนผ่าน LINE แล้วค่ะ` }],
                  }),
                });
                console.log(`[LINE Link] Employee ${emp.employeeCode} linked to LINE userId ${userId}`);
              }
            } else {
              await fetch("https://api.line.me/v2/bot/message/reply", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                  replyToken: event.replyToken,
                  messages: [{ type: "text", text: `❌ ไม่พบรหัสพนักงาน "${empCode}" ในระบบ\nกรุณาตรวจสอบรหัสพนักงานแล้วลองใหม่\n\nตัวอย่าง: ลงทะเบียน EMP001` }],
                }),
              });
            }
          } catch (linkErr: any) {
            console.error("[LINE Link] Error:", linkErr.message);
          }
        } else if (token) {
          const [linkedEmp] = await db.select().from(employees).where(eq(employees.lineUserId, userId));
          if (linkedEmp) {
            const empName = `${linkedEmp.firstName} ${linkedEmp.lastName}`.trim();
            const lowerMsg = msgText.toLowerCase();
            let replyText: string | null = null;

            try {
              if (/วันลา|ลาเหลือ|วันลาเหลือ|เหลือกี่วัน/.test(lowerMsg)) {
                const currentYear = new Date().getFullYear();
                const usedLeaves = await db.select({
                  leaveType: leaveRequests.leaveType,
                  totalDays: sql<number>`COALESCE(SUM(${leaveRequests.days}::numeric), 0)`,
                })
                  .from(leaveRequests)
                  .where(and(
                    eq(leaveRequests.employeeId, linkedEmp.id),
                    inArray(leaveRequests.status, ["approved", "pending"]),
                    sql`EXTRACT(YEAR FROM ${leaveRequests.startDate}::date) = ${currentYear}`,
                  ))
                  .groupBy(leaveRequests.leaveType);

                const LEAVE_LABELS: Record<string, string> = {
                  sick: "ลาป่วย", vacation: "ลาพักร้อน", personal: "ลากิจ",
                  maternity: "ลาคลอด", ordination: "ลาบวช", military: "ลาทหาร", other: "อื่นๆ",
                };
                const empPolicies = linkedEmp.companyId ? await storage.getLeavePolicies(linkedEmp.companyId) : [];
                  const LEAVE_QUOTA_DEFAULT: Record<string, number> = { sick: 30, vacation: 6, personal: 3 };
                  const quotaEntries = empPolicies.length > 0
                    ? empPolicies.map(p => [p.leaveType, Number(p.annualQuota)] as [string, number])
                    : Object.entries(LEAVE_QUOTA_DEFAULT);
                  const empBalances = await storage.getLeaveBalances(linkedEmp.id, currentYear);

                  let lines = [`📋 สรุปวันลาปี ${currentYear + 543}`, `👤 ${empName}`, ""];
                  const quotaTypes = new Set<string>();
                  for (const [type, quota] of quotaEntries) {
                    quotaTypes.add(type);
                    const used = usedLeaves.find(l => l.leaveType === type);
                    const usedDays = used ? Number(used.totalDays) : 0;
                    const bal = empBalances.find(b => b.leaveType === type);
                    const carriedOver = bal ? Number(bal.carriedOver) : 0;
                    const totalAvail = quota + carriedOver;
                    const remaining = Math.max(0, totalAvail - usedDays);
                    let line = `${LEAVE_LABELS[type] || type}: ใช้ ${usedDays} / ${totalAvail} วัน (เหลือ ${remaining} วัน)`;
                    if (carriedOver > 0) line += ` [ยกมา ${carriedOver} วัน]`;
                    lines.push(line);
                  }
                  const otherUsed = usedLeaves.filter(l => !quotaTypes.has(l.leaveType));
                  for (const o of otherUsed) {
                    lines.push(`${LEAVE_LABELS[o.leaveType] || o.leaveType}: ใช้ ${Number(o.totalDays)} วัน`);
                  }
                  replyText = lines.join("\n");

              } else if (/สลิป|เงินเดือน|payslip/.test(lowerMsg)) {
                const [latestPayroll] = await db.select().from(payrollRecords)
                  .where(eq(payrollRecords.employeeId, linkedEmp.id))
                  .orderBy(desc(payrollRecords.year), desc(payrollRecords.month))
                  .limit(1);

                if (latestPayroll) {
                  const thaiMonths = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
                  const fmt = (n: any) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
                  replyText = [
                    `💰 สลิปเงินเดือน ${thaiMonths[latestPayroll.month]} ${latestPayroll.year + 543}`,
                    `👤 ${empName}`,
                    "",
                    `📥 รายได้`,
                    `  เงินเดือน: ${fmt(latestPayroll.baseSalary)}`,
                    `  OT: ${fmt(latestPayroll.otAmount)}`,
                    `  ค่าคอมมิชชัน: ${fmt(latestPayroll.commissionAmount)}`,
                    `  อื่นๆ: ${fmt(latestPayroll.otherEarnings)}`,
                    `  รวมรายได้: ${fmt(latestPayroll.totalEarnings)}`,
                    "",
                    `📤 รายหัก`,
                    `  ประกันสังคม: ${fmt(latestPayroll.socialSecurity)}`,
                    `  ภาษีหัก ณ ที่จ่าย: ${fmt(latestPayroll.withholdingTax)}`,
                    `  อื่นๆ: ${fmt(latestPayroll.otherDeductions)}`,
                    `  รวมรายหัก: ${fmt(latestPayroll.totalDeductions)}`,
                    "",
                    `💵 เงินสุทธิ: ${fmt(latestPayroll.netPay)} บาท`,
                  ].join("\n");
                } else {
                  replyText = `📋 ยังไม่มีข้อมูลสลิปเงินเดือนในระบบ`;
                }

              } else if (/ot|โอที|ล่วงเวลา/.test(lowerMsg)) {
                const currentMonth = new Date().getMonth() + 1;
                const currentYear = new Date().getFullYear();
                const otList = await db.select().from(otRecords)
                  .where(and(
                    eq(otRecords.employeeId, linkedEmp.id),
                    sql`EXTRACT(MONTH FROM ${otRecords.date}::date) = ${currentMonth}`,
                    sql`EXTRACT(YEAR FROM ${otRecords.date}::date) = ${currentYear}`,
                  ));
                const totalHours = otList.reduce((s, o) => s + Number(o.hours || 0), 0);
                const totalAmt = otList.reduce((s, o) => s + Number(o.amount || 0), 0);
                const thaiMonths = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
                replyText = [
                  `⏰ สรุป OT เดือน${thaiMonths[currentMonth]} ${currentYear + 543}`,
                  `👤 ${empName}`,
                  "",
                  `จำนวนครั้ง: ${otList.length} ครั้ง`,
                  `รวมชั่วโมง: ${totalHours.toFixed(1)} ชม.`,
                  `รวมเงิน: ${totalAmt.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`,
                  `สถานะ: รออนุมัติ ${otList.filter(o => o.status === "pending").length} / อนุมัติ ${otList.filter(o => o.status === "approved").length}`,
                ].join("\n");

              } else if (/help|ช่วย|คำสั่ง|เมนู|menu/.test(lowerMsg)) {
                replyText = [
                  `📌 คำสั่งที่ใช้ได้`,
                  `👤 ${empName} (${linkedEmp.employeeCode})`,
                  "",
                  `💬 พิมพ์คำสั่งต่อไปนี้:`,
                  `• "วันลาเหลือ" - เช็ควันลาคงเหลือ`,
                  `• "สลิป" - ดูสลิปเงินเดือนล่าสุด`,
                  `• "ot" - สรุป OT เดือนนี้`,
                  `• "ช่วย" - แสดงเมนูนี้`,
                ].join("\n");
              }
            } catch (cmdErr: any) {
              console.error("[LINE CMD] Error:", cmdErr.message);
            }

            if (replyText) {
              await fetch("https://api.line.me/v2/bot/message/reply", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({
                  replyToken: event.replyToken,
                  messages: [{ type: "text", text: replyText }],
                }),
              });
            }
          }
        }

        // Store LINE message in Chat Inbox + detect orders
        if (msgText && event.message?.type === "text") {
          try {
            // Find company by LINE token match or existing thread
            let targetCompanyId: number | null = null;

            // First: check if there's an existing thread for this LINE user
            const [existingAnyThread] = await ecomDb.select({ companyId: platformChatThreads.companyId })
              .from(platformChatThreads)
              .where(and(
                eq(platformChatThreads.platform, "line"),
                eq(platformChatThreads.platformThreadId, userId),
              )).limit(1);
            if (existingAnyThread) {
              targetCompanyId = existingAnyThread.companyId;
            }

            // Second: find company with LINE token configured
            if (!targetCompanyId) {
              const companiesWithLine = await db.select({ id: companies.id, lineChannelAccessToken: companies.lineChannelAccessToken })
                .from(companies)
                .where(isNotNull(companies.lineChannelAccessToken));
              if (companiesWithLine.length === 1) {
                targetCompanyId = companiesWithLine[0].id;
              } else if (companiesWithLine.length > 1 && token) {
                const matched = companiesWithLine.find(c => c.lineChannelAccessToken === token);
                if (matched) targetCompanyId = matched.id;
                else targetCompanyId = companiesWithLine[0].id;
              }
            }

            // Fallback: first company
            if (!targetCompanyId) {
              const [firstComp] = await db.select({ id: companies.id }).from(companies).limit(1);
              if (firstComp) targetCompanyId = firstComp.id;
            }

            if (targetCompanyId) {
              const [existingThread] = await ecomDb.select().from(platformChatThreads)
                .where(and(
                  eq(platformChatThreads.companyId, targetCompanyId),
                  eq(platformChatThreads.platform, "line"),
                  eq(platformChatThreads.platformThreadId, userId),
                ));
              let threadId: number;
              if (existingThread) {
                threadId = existingThread.id;
                await ecomDb.update(platformChatThreads).set({
                  lastMessage: msgText.substring(0, 200),
                  lastMessageAt: new Date(),
                  unreadCount: (existingThread.unreadCount || 0) + 1,
                  buyerName: userName || existingThread.buyerName,
                }).where(eq(platformChatThreads.id, threadId));
              } else {
                const [newThread] = await ecomDb.insert(platformChatThreads).values({
                  companyId: targetCompanyId,
                  platform: "line",
                  platformThreadId: userId,
                  buyerName: userName,
                  lastMessage: msgText.substring(0, 200),
                  lastMessageAt: new Date(),
                  unreadCount: 1,
                }).returning();
                threadId = newThread.id;
              }

              const [chatMsg] = await db.insert(platformChatMessages).values({
                threadId,
                platformMessageId: event.message?.id || null,
                senderType: "buyer",
                senderName: userName,
                messageType: "text",
                content: msgText,
              }).returning();

              await detectAndCreateChatOrder(targetCompanyId, "line", threadId, chatMsg.id, userName, userId, msgText);
            }
          } catch (chatErr: any) {
            console.error("[LINE ChatInbox] Error:", chatErr.message);
          }
        }
      }

      // Auto-save documents from LINE groups
      if (event.type === "message" && event.source?.type === "group") {
        const groupId = event.source.groupId;
        const msg = event.message;
        console.log(`[LINE Doc] Group message: groupId=${groupId}, msgType=${msg?.type}, msgId=${msg?.id}`);
        if (groupId && msg && ["image", "video", "file", "audio"].includes(msg.type)) {
          const capturedEvent = { ...event, source: { ...event.source }, message: { ...msg } };
          const capturedGroupId = groupId;
          (async () => {
            try {
              const mapping = await storage.getLineGroupMappingByGroupId(capturedGroupId);
              console.log(`[LINE Doc] Mapping: ${mapping ? `id=${mapping.id}, active=${mapping.active}, firmClientId=${mapping.firmClientId}` : 'none'}`);
              if (!mapping || !mapping.active) return;

              const existingDoc = await db.select({ id: lineDocuments.id }).from(lineDocuments)
                .where(eq(lineDocuments.messageId, capturedEvent.message.id)).limit(1);
              if (existingDoc.length > 0) {
                console.log(`[LINE Doc] Already saved msgId=${capturedEvent.message.id}, skipping`);
                return;
              }

              const capturedToken = await getLineTokenForCompany(mapping.companyId);
              if (!capturedToken) {
                console.log(`[LINE Doc] No LINE token available, skipping download`);
                return;
              }

              console.log(`[LINE Doc] Downloading content for msgId=${capturedEvent.message.id}...`);
              const contentRes = await fetch(`https://api-data.line.me/v2/bot/message/${capturedEvent.message.id}/content`, {
                headers: { "Authorization": `Bearer ${capturedToken}` },
              });
              console.log(`[LINE Doc] Content response: status=${contentRes.status}, ok=${contentRes.ok}`);
              if (!contentRes.ok) return;

              const buffer = Buffer.from(await contentRes.arrayBuffer());
              const mimeType = contentRes.headers.get("content-type") || "application/octet-stream";
              const ext = mimeType.includes("jpeg") ? ".jpg" : mimeType.includes("png") ? ".png" : mimeType.includes("pdf") ? ".pdf" : mimeType.includes("mp4") ? ".mp4" : mimeType.includes("audio") ? ".m4a" : ".bin";
              const filename = capturedEvent.message.fileName || `line_${capturedEvent.message.type}_${capturedEvent.message.id}${ext}`;
              console.log(`[LINE Doc] File: ${filename}, size=${buffer.length}, mime=${mimeType}`);

              let category = "other";
              if (capturedEvent.message.type === "image") category = "image";
              else if (capturedEvent.message.type === "file" && (mimeType.includes("pdf") || filename.toLowerCase().endsWith(".pdf"))) category = "document";
              else if (capturedEvent.message.type === "file") category = "file";
              else if (capturedEvent.message.type === "video") category = "video";
              else if (capturedEvent.message.type === "audio") category = "audio";

              const now = new Date(capturedEvent.timestamp);
              const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
              const categoryFolder = category === "document" ? "pdf" : category === "image" ? "images" : category === "video" ? "videos" : category === "audio" ? "audio" : "others";
              const clientFolder = mapping.firmClientId ? `client-${mapping.firmClientId}` : "unassigned";
              const safeLineFilename = sanitizeFilename(filename, { prefix: `${Date.now()}_` }); const storagePath = `.private/line-documents/${clientFolder}/${yearMonth}/${categoryFolder}/${safeLineFilename}`;

              const { saveBufferToPath } = await import("../replit_integrations/object_storage/routes");
              console.log(`[LINE Doc] Saving to ${storagePath}...`);
              await saveBufferToPath(buffer, storagePath);
              console.log(`[LINE Doc] Save complete`);

              let senderName = null;
              if (capturedEvent.source.userId) {
                try {
                  const memberRes = await fetch(`https://api.line.me/v2/bot/group/${capturedGroupId}/member/${capturedEvent.source.userId}`, {
                    headers: { "Authorization": `Bearer ${capturedToken}` },
                  });
                  if (memberRes.ok) { senderName = ((await memberRes.json()) as any).displayName || null; }
                } catch {}
              }

              let documentDate: string | null = null;
              let documentDateSource: string | null = null;
              if (openai && (category === "image" || category === "document") && buffer.length <= 10 * 1024 * 1024) {
                try {
                  const base64Data = buffer.toString("base64");
                  const mediaMime = category === "document" ? "application/pdf" : (mimeType || "image/jpeg");
                  const isImage = category === "image";
                  const isPdf = category === "document";
                  let imageContent: any[] = [];
                  if (isImage) {
                    imageContent = [{ type: "image_url" as const, image_url: { url: `data:${mediaMime};base64,${base64Data}` } }];
                  } else if (isPdf) {
                    imageContent = [{ type: "file" as const, file: { filename: filename, file_data: `data:application/pdf;base64,${base64Data}` } }];
                  }
                  if (imageContent.length > 0) {
                    console.log(`[LINE Doc AI] Extracting document date from ${filename}...`);
                    const aiRes = await openai.chat.completions.create({
                      model: "gpt-4o-mini",
                      max_tokens: 200,
                      messages: [{
                        role: "user",
                        content: [
                          { type: "text", text: 'ดูเอกสารนี้แล้วหาวันที่ของเอกสาร (วันที่ออกเอกสาร เช่น วันที่ใบแจ้งหนี้ วันที่ใบเสร็จ วันที่ในเอกสาร) ตอบเป็น JSON เท่านั้น: {"date":"YYYY-MM-DD"} ถ้าหาไม่เจอให้ตอบ {"date":null}' },
                          ...imageContent,
                        ],
                      }],
                    });
                    const aiText = aiRes.choices[0]?.message?.content?.trim() || "";
                    console.log(`[LINE Doc AI] Response: ${aiText}`);
                    try {
                      const parsed = JSON.parse(aiText.replace(/```json\s*/g, "").replace(/```/g, "").trim());
                      if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
                        documentDate = parsed.date;
                        documentDateSource = "ai";
                      }
                    } catch {
                      const jsonMatch = aiText.match(/\{[^}]*"date"\s*:\s*"?([^"}\s]+)"?\s*\}/);
                      if (jsonMatch) {
                        const dateVal = jsonMatch[1];
                        if (dateVal && dateVal !== "null" && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
                          documentDate = dateVal;
                          documentDateSource = "ai";
                        }
                      }
                    }
                    if (documentDate) console.log(`[LINE Doc AI] Extracted date: ${documentDate}`);
                  }
                } catch (aiErr: any) {
                  console.error("[LINE Doc AI] Date extraction error:", aiErr.message);
                }
              }

              await storage.createLineDocument({
                tenantId: mapping.tenantId,
                companyId: mapping.companyId,
                firmClientId: mapping.firmClientId,
                lineGroupId: capturedGroupId,
                messageId: capturedEvent.message.id,
                senderUserId: capturedEvent.source.userId || null,
                senderName,
                fileType: capturedEvent.message.type,
                mimeType,
                originalFilename: filename,
                fileSize: buffer.length,
                storageUrl: storagePath,
                category,
                documentDate,
                documentDateSource,
                sentAt: new Date(capturedEvent.timestamp),
              });
              console.log(`[LINE Doc] Saved: ${filename} (${category}), docDate=${documentDate}`);
            } catch (docErr: any) {
              console.error("[LINE Doc] Auto-save error:", docErr.message, docErr.stack);
            }
          })();
        }
      }
    }
  } catch (err: any) {
    console.error("[LINE Webhook] Error:", err.message);
    if (!res.headersSent) res.status(200).json({ success: true });
  }
});

// ============ LINE Group Document Archive ============

app.get("/api/line-documents/available-groups", requireAuth, async (req, res) => {
  try {
    const rows = await db.execute(sql`SELECT line_id, display_name, created_at FROM line_recipients WHERE type = 'group' ORDER BY display_name, created_at DESC`);
    res.json(rows.rows.map((r: any) => ({ lineId: r.line_id, displayName: r.display_name, createdAt: r.created_at })));
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Get LINE group mappings (own tenant)
app.get("/api/line-documents/groups", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = req.query.companyId ? Number(req.query.companyId) : user.companyId;
    const mappings = await storage.getLineGroupMappings(user.tenantId, companyId);
    res.json(mappings);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Get pending (unclaimed) LINE groups — groups auto-registered by Bot join
app.get("/api/line-documents/groups/pending", requireAuth, async (req, res) => {
  try {
    const pending = await db.select().from(lineGroupMappings).where(isNull(lineGroupMappings.tenantId)).orderBy(desc(lineGroupMappings.createdAt));

    const token = await getDefaultLineToken();
    if (token) {
      for (const g of pending) {
        if (g.groupName && !g.groupName.startsWith("กลุ่ม ") && !g.groupName.match(/^[A-Fa-f0-9]{8}/)) continue;
        try {
          const profileRes = await fetch(`https://api.line.me/v2/bot/group/${g.lineGroupId}/summary`, {
            headers: { "Authorization": `Bearer ${token}` },
            signal: AbortSignal.timeout(5000),
          });
          if (profileRes.ok) {
            const profile = await profileRes.json() as any;
            if (profile.groupName) {
              g.groupName = profile.groupName;
              await db.update(lineGroupMappings).set({ groupName: profile.groupName }).where(eq(lineGroupMappings.id, g.id));
            }
          }
        } catch {}
      }
    }

    res.json(pending);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Claim a pending LINE group — assign tenant + firm client (only unclaimed groups can be claimed)
app.post("/api/line-documents/groups/:id/claim", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { firmClientId } = req.body;
    const [mapping] = await db.select().from(lineGroupMappings).where(
      and(eq(lineGroupMappings.id, Number(req.params.id)), isNull(lineGroupMappings.tenantId))
    );
    if (!mapping) return res.status(404).json({ message: "ไม่พบกลุ่มหรือกลุ่มนี้ถูกรับแล้ว" });
    if (firmClientId) {
      const [fc] = await db.select().from(firmClients).where(eq(firmClients.id, Number(firmClientId)));
      if (!fc) return res.status(404).json({ message: "ไม่พบลูกค้า" });
    }
    const [updated] = await db.update(lineGroupMappings)
      .set({
        tenantId: user.tenantId,
        companyId: user.companyId || null,
        firmClientId: firmClientId ? Number(firmClientId) : null,
        active: true,
      })
      .where(and(eq(lineGroupMappings.id, mapping.id), isNull(lineGroupMappings.tenantId)))
      .returning();
    if (!updated) return res.status(409).json({ message: "กลุ่มนี้ถูกรับโดยผู้อื่นแล้ว" });
    res.json(updated);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Create LINE group mapping
app.post("/api/line-documents/groups", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { lineGroupId, groupName, firmClientId, companyId, defaultDocumentType } = req.body;
    if (!lineGroupId) return res.status(400).json({ message: "กรุณาระบุ LINE Group ID" });
    if (firmClientId) {
      const [fc] = await db.select().from(firmClients).where(and(eq(firmClients.id, Number(firmClientId)), eq(firmClients.companyId, user.companyId || 0)));
      if (!fc) return res.status(403).json({ message: "ลูกค้าไม่ถูกต้อง" });
    }
    if (companyId) {
      const [co] = await db.select().from(companies).where(and(eq(companies.id, Number(companyId)), eq(companies.tenantId, user.tenantId)));
      if (!co) return res.status(403).json({ message: "บริษัทไม่ถูกต้อง" });
    }
    const validDocTypes = ["auto", "receipt", "invoice", "expense", "quotation", "other"];
    const docType = defaultDocumentType && validDocTypes.includes(defaultDocumentType) ? defaultDocumentType : "auto";
    const existing = await storage.getLineGroupMappingByGroupId(lineGroupId);
    if (existing) return res.status(409).json({ message: "กลุ่มนี้ถูกเชื่อมโยงแล้ว" });
    const mapping = await storage.createLineGroupMapping({
      tenantId: user.tenantId,
      companyId: companyId ? Number(companyId) : (user.companyId || null),
      firmClientId: firmClientId ? Number(firmClientId) : null,
      lineGroupId,
      groupName: groupName || null,
      defaultDocumentType: docType,
      active: true,
    });
    res.json(mapping);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.patch("/api/line-documents/groups/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const validDocTypes = ["auto", "receipt", "invoice", "expense", "quotation", "other"];
    const allowedData: Record<string, any> = {};
    if (req.body.groupName !== undefined) allowedData.groupName = req.body.groupName;
    if (req.body.firmClientId !== undefined) allowedData.firmClientId = req.body.firmClientId;
    if (req.body.active !== undefined) allowedData.active = req.body.active;
    if (req.body.defaultDocumentType !== undefined) {
      allowedData.defaultDocumentType = validDocTypes.includes(req.body.defaultDocumentType) ? req.body.defaultDocumentType : "auto";
    }
    const mapping = await storage.updateLineGroupMapping(Number(req.params.id), allowedData, user.tenantId);
    if (!mapping) return res.status(404).json({ message: "ไม่พบข้อมูล" });
    res.json(mapping);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Delete LINE group mapping
app.delete("/api/line-documents/groups/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    await storage.deleteLineGroupMapping(Number(req.params.id), user.tenantId);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Get LINE documents (with filters)
app.get("/api/line-documents", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const filters: any = {};
    if (req.query.firmClientId) filters.firmClientId = Number(req.query.firmClientId);
    if (req.query.lineGroupId) filters.lineGroupId = String(req.query.lineGroupId);
    if (req.query.fileType) filters.fileType = String(req.query.fileType);
    if (req.query.category) filters.category = String(req.query.category);
    const companyId = req.query.companyId ? Number(req.query.companyId) : user.companyId;
    if (companyId) filters.companyId = companyId;
    const docs = await storage.getLineDocuments(user.tenantId, filters);
    res.json(docs);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// Download LINE document from Object Storage
app.get("/api/line-documents/:id/download", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const [doc] = await db.select().from(lineDocuments)
      .where(and(eq(lineDocuments.id, Number(req.params.id)), eq(lineDocuments.tenantId, user.tenantId)));
    if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    const { readFromPath } = await import("../replit_integrations/object_storage/routes");
    const fileData = readFromPath(doc.storageUrl);
    if (!fileData) return res.status(404).json({ message: "ไม่พบไฟล์ในระบบจัดเก็บ" });
    res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalFilename || "file")}"`);
    res.send(fileData);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});


app.post("/api/line-documents/batch-download", requireAuth, async (req, res) => {
  const fsLib = await import("fs");
  const osLib = await import("os");
  const tmpFiles: string[] = [];
  const cleanupTmp = () => { for (const f of tmpFiles) { try { fsLib.unlinkSync(f); } catch {} } };
  try {
    const user = req.user as any;
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "กรุณาเลือกเอกสารอย่างน้อย 1 รายการ" });
    if (ids.length > 100) return res.status(400).json({ message: "ดาวน์โหลดได้สูงสุด 100 ไฟล์ต่อครั้ง" });
    const numIds = ids.map(Number).filter((n: number) => !isNaN(n));
    const dlFilters: any = {};
    if (user.companyId) dlFilters.companyId = user.companyId;
    const allDocs = await storage.getLineDocuments(user.tenantId, dlFilters);
    const docs = allDocs.filter(d => numIds.includes(d.id));
    if (docs.length === 0) return res.status(404).json({ message: "ไม่พบเอกสารที่เลือก" });
    const archiver = (await import("archiver")).default;
    const { readFromPath } = await import("../replit_integrations/object_storage/routes");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="line-documents-${Date.now()}.zip"`);
    const archive = archiver("zip", { zlib: { level: 5 } });
    archive.on("error", () => { cleanupTmp(); });
    res.on("close", () => { cleanupTmp(); });
    archive.pipe(res);
    const usedNames = new Set<string>();
    for (const doc of docs) {
      try {
        const fileData = readFromPath(doc.storageUrl);
        if (!fileData) continue;
        let name = doc.originalFilename || `file_${doc.id}`;
        if (usedNames.has(name)) {
          const ext = name.lastIndexOf(".") > 0 ? name.slice(name.lastIndexOf(".")) : "";
          const base = name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name;
          name = `${base}_${doc.id}${ext}`;
        }
        usedNames.add(name);
        archive.append(fileData, { name });
      } catch {}
    }
    await archive.finalize();
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ message: err.message });
  }
});
// Delete LINE document
app.delete("/api/line-documents/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const [doc] = await db.select().from(lineDocuments)
      .where(and(eq(lineDocuments.id, Number(req.params.id)), eq(lineDocuments.tenantId, user.tenantId)));
    if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    try {
      const { deleteFromPath } = await import("../replit_integrations/object_storage/routes");
      deleteFromPath(doc.storageUrl);
    } catch {}
    await storage.deleteLineDocument(doc.id);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

db.execute(sql`ALTER TABLE line_documents ADD COLUMN IF NOT EXISTS read_at TIMESTAMP`).catch(() => {});

app.post("/api/line-documents/:id/mark-read", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [doc] = await db.select({ id: lineDocuments.id, tenantId: lineDocuments.tenantId })
      .from(lineDocuments).where(eq(lineDocuments.id, id));
    if (!doc || doc.tenantId !== user.tenantId) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    await db.update(lineDocuments).set({ readAt: new Date() }).where(eq(lineDocuments.id, id));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/line-documents/batch-mark-read", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ต้องระบุ ids" });
    await db.update(lineDocuments)
      .set({ readAt: new Date() })
      .where(and(inArray(lineDocuments.id, ids.map(Number)), eq(lineDocuments.tenantId, user.tenantId)));
    res.json({ success: true, count: ids.length });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/line-documents/unread-count", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    if (!companyId) return res.json({ unreadCount: 0 });
    const clientIds = await db.select({ id: firmClients.id }).from(firmClients).where(eq(firmClients.companyId, companyId));
    const cids = clientIds.map(c => c.id);
    if (cids.length === 0) {
      console.log(`[unread-count] companyId=${companyId} → no firmClients found`);
      return res.json({ unreadCount: 0 });
    }
    const result = await db.select({ count: sql<number>`count(*)` }).from(lineDocuments)
      .where(and(eq(lineDocuments.tenantId, user.tenantId), isNull(lineDocuments.readAt), inArray(lineDocuments.firmClientId, cids)));
    console.log(`[unread-count] companyId=${companyId} firmClientIds=[${cids}] unread=${result[0]?.count}`);
    res.json({ unreadCount: Number(result[0]?.count ?? 0) });
  } catch (err: any) {
    console.error(`[unread-count] error:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/line-documents/:id/extract-date", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    if (!openai) return res.status(400).json({ message: "AI ยังไม่ได้ตั้งค่า" });
    const extractFilters: any = {};
    const companyId = req.query.companyId ? Number(req.query.companyId) : user.companyId;
    if (companyId) extractFilters.companyId = companyId;
    const docs = await storage.getLineDocuments(user.tenantId, extractFilters);
    const doc = docs.find(d => d.id === Number(req.params.id));
    if (!doc) return res.status(404).json({ message: "ไม่พบเอกสาร" });
    { const ac = await checkDocOwnership(doc.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
    if (doc.category !== "image" && doc.category !== "document") return res.status(400).json({ message: "ไม่รองรับไฟล์ประเภทนี้" });
    const { readFromPath } = await import("../replit_integrations/object_storage/routes");
    const buffer = readFromPath(doc.storageUrl);
    if (!buffer) return res.status(404).json({ message: "ไม่พบไฟล์" });
    if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ message: "ไฟล์ใหญ่เกินไป (สูงสุด 10MB)" });
    const base64Data = buffer.toString("base64");
    let imageContent: any[] = [];
    if (doc.category === "image") {
      imageContent = [{ type: "image_url" as const, image_url: { url: `data:${doc.mimeType || "image/jpeg"};base64,${base64Data}` } }];
    } else {
      imageContent = [{ type: "file" as const, file: { filename: doc.originalFilename || "file.pdf", file_data: `data:application/pdf;base64,${base64Data}` } }];
    }
    const aiRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: 'ดูเอกสารนี้แล้วหาวันที่ของเอกสาร (วันที่ออกเอกสาร เช่น วันที่ใบแจ้งหนี้ วันที่ใบเสร็จ วันที่ในเอกสาร) ตอบเป็น JSON เท่านั้น: {"date":"YYYY-MM-DD"} ถ้าหาไม่เจอให้ตอบ {"date":null}' },
          ...imageContent,
        ],
      }],
    });
    const aiText = aiRes.choices[0]?.message?.content?.trim() || "";
    let documentDate: string | null = null;
    try {
      const parsed = JSON.parse(aiText.replace(/```json\s*/g, "").replace(/```/g, "").trim());
      if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) documentDate = parsed.date;
    } catch {
      const jsonMatch = aiText.match(/\{[^}]*"date"\s*:\s*"?([^"}\s]+)"?\s*\}/);
      if (jsonMatch) {
        const dateVal = jsonMatch[1];
        if (dateVal && dateVal !== "null" && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) documentDate = dateVal;
      }
    }
    if (documentDate) {
      await db.update(lineDocuments).set({ documentDate, documentDateSource: "ai" }).where(eq(lineDocuments.id, doc.id));
    }
    res.json({ documentDate, source: "ai" });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/line-documents/classify-rules", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const conditions: any[] = [];
    if (user.tenantId) conditions.push(eq(lineDocClassifyRules.tenantId, user.tenantId));
    const rules = await db.select().from(lineDocClassifyRules)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(lineDocClassifyRules.priority));
    res.json(rules);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/line-documents/classify-rules", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { name, condition, conditionValue, targetCategory, priority } = req.body;
    if (!name || !condition || !targetCategory) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
    const [rule] = await db.insert(lineDocClassifyRules).values({
      tenantId: user.tenantId,
      companyId: user.companyId || null,
      name,
      condition,
      conditionValue: conditionValue || null,
      targetCategory,
      priority: priority ?? 0,
      active: true,
    }).returning();
    res.json(rule);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.patch("/api/line-documents/classify-rules/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const ruleId = Number(req.params.id);
    const conditions = [eq(lineDocClassifyRules.id, ruleId)];
    if (user.tenantId) conditions.push(eq(lineDocClassifyRules.tenantId, user.tenantId));
    const allowedFields: Record<string, any> = {};
    if (req.body.name !== undefined) allowedFields.name = req.body.name;
    if (req.body.condition !== undefined) allowedFields.condition = req.body.condition;
    if (req.body.conditionValue !== undefined) allowedFields.conditionValue = req.body.conditionValue;
    if (req.body.targetCategory !== undefined) allowedFields.targetCategory = req.body.targetCategory;
    if (req.body.priority !== undefined) allowedFields.priority = req.body.priority;
    if (req.body.active !== undefined) allowedFields.active = req.body.active;
    const [updated] = await db.update(lineDocClassifyRules)
      .set(allowedFields)
      .where(and(...conditions))
      .returning();
    if (!updated) return res.status(404).json({ message: "ไม่พบกฎ" });
    res.json(updated);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/line-documents/classify-rules/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const ruleId = Number(req.params.id);
    const conditions = [eq(lineDocClassifyRules.id, ruleId)];
    if (user.tenantId) conditions.push(eq(lineDocClassifyRules.tenantId, user.tenantId));
    await db.delete(lineDocClassifyRules).where(and(...conditions));
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/line/webhook-test", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { companyId } = req.body;
    let token = await getDefaultLineToken() || "";
    if (companyId) {
      const companyConditions = [eq(companies.id, Number(companyId))];
      if (user.tenantId) companyConditions.push(eq(companies.tenantId, user.tenantId));
      const [company] = await db.select({ lineChannelAccessToken: companies.lineChannelAccessToken }).from(companies).where(and(...companyConditions));
      if (!company) return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
      if (company.lineChannelAccessToken) token = company.lineChannelAccessToken;
    }
    if (!token) return res.json({ success: false, message: "ไม่พบ LINE Channel Access Token", webhookConfigured: false });
    const botRes = await fetch("https://api.line.me/v2/bot/info", {
      headers: { "Authorization": `Bearer ${token}` },
    });
    if (!botRes.ok) return res.json({ success: false, message: "Token ไม่ถูกต้องหรือหมดอายุ", webhookConfigured: false });
    const botInfo = await botRes.json() as any;
    const groupCount = await db.select({ count: count() }).from(lineGroupMappings)
      .where(user.tenantId ? eq(lineGroupMappings.tenantId, user.tenantId) : undefined);
    const docCount = await db.select({ count: count() }).from(lineDocuments)
      .where(user.tenantId ? eq(lineDocuments.tenantId, user.tenantId) : undefined);
    res.json({
      success: true,
      message: "Webhook พร้อมใช้งาน",
      botName: botInfo.displayName,
      botPicture: botInfo.pictureUrl,
      webhookConfigured: true,
      groupCount: groupCount[0]?.count || 0,
      documentCount: docCount[0]?.count || 0,
    });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
});

// LINE Recipients CRUD (tenant-scoped)
app.get("/api/line/recipients", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    console.log(`[LINE] recipients query: tenantId=${tenantId}, companyId=${companyId}, userId=${user.id}`);
    const { rows: all } = await pool.query(
      `SELECT id, tenant_id AS "tenantId", company_id AS "companyId", line_id AS "lineId", type, display_name AS "displayName", created_at AS "createdAt" FROM line_recipients ORDER BY created_at`
    );
    console.log(`[LINE] recipients total in DB (raw SQL): ${all.length}`);
    let filtered = all;
    if (tenantId) {
      filtered = filtered.filter((r: any) => r.tenantId === tenantId || r.tenantId == null);
    }
    if (companyId) {
      filtered = filtered.filter((r: any) => r.companyId === companyId || r.companyId == null);
    }
    console.log(`[LINE] recipients after filter: ${filtered.length} (groups: ${filtered.filter((r: any) => r.type === "group").length})`);
    res.set("Cache-Control", "no-store");
    res.json(filtered.length > 0 ? filtered : all);
  } catch (err: any) {
    console.error(`[LINE] recipients error:`, err.message);
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/line/recipients", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId || null;
    const { lineId, type, displayName, companyId } = req.body;
    if (!lineId) return res.status(400).json({ message: "กรุณาระบุ LINE ID" });
    const dupConds: any[] = [eq(lineRecipients.lineId, lineId)];
    if (tenantId) dupConds.push(eq(lineRecipients.tenantId, tenantId));
    if (companyId) dupConds.push(eq(lineRecipients.companyId, companyId));
    const [existing] = await db.select().from(lineRecipients).where(and(...dupConds));
    if (existing) return res.status(400).json({ message: "LINE ID นี้มีอยู่แล้ว" });
    try {
      const [created] = await db.insert(lineRecipients).values({
        lineId,
        type: type || "user",
        displayName: displayName || null,
        tenantId,
        companyId: companyId || null,
      }).returning();
      res.status(201).json(created);
    } catch (dupErr: any) {
      if (dupErr.code === '23505') return res.status(400).json({ message: "LINE ID นี้มีอยู่แล้ว" });
      throw dupErr;
    }
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.patch("/api/line/recipients/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;
    const id = Number(req.params.id);
    const { displayName } = req.body;
    const conditions = tenantId
      ? and(eq(lineRecipients.id, id), sql`(${lineRecipients.tenantId} = ${tenantId} OR ${lineRecipients.tenantId} IS NULL)`)
      : and(eq(lineRecipients.id, id), sql`${lineRecipients.tenantId} IS NULL`);
    const [updated] = await db.update(lineRecipients).set({ displayName: displayName || null }).where(conditions).returning();
    if (!updated) return res.status(404).json({ message: "ไม่พบรายการ" });
    res.json(updated);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.delete("/api/line/recipients/:id", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;
    const conditions = tenantId
      ? and(eq(lineRecipients.id, Number(req.params.id)), eq(lineRecipients.tenantId, tenantId))
      : and(eq(lineRecipients.id, Number(req.params.id)), sql`${lineRecipients.tenantId} IS NULL`);
    await db.delete(lineRecipients).where(conditions);
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/download/etax-center.zip", (_req, res) => {
  const zipPath = path.resolve(os.tmpdir(), "etax-center.zip");
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, "etax-center.zip");
  } else {
    res.status(404).json({ message: "ไฟล์ไม่พร้อมดาวน์โหลด" });
  }
});

app.get("/download/etax-center-latest.zip", (_req, res) => {
  const zipPath = path.resolve("etax-center-latest.zip");
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, "etax-center-latest.zip");
  } else {
    res.status(404).json({ message: "ไฟล์ไม่พร้อมดาวน์โหลด" });
  }
});

app.get("/api/chat/messages", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;
    const isSuperAdmin = user.role === "super_admin";

    let messages;
    if (isSuperAdmin) {
      const filterTenantId = req.query.tenantId ? Number(req.query.tenantId) : null;
      if (filterTenantId) {
        messages = await db.select().from(chatMessages)
          .where(eq(chatMessages.tenantId, filterTenantId))
          .orderBy(asc(chatMessages.createdAt))
          .limit(200);
      } else {
        messages = await db.select().from(chatMessages)
          .orderBy(desc(chatMessages.createdAt))
          .limit(200);
      }
    } else {
      messages = await db.select().from(chatMessages)
        .where(eq(chatMessages.tenantId, tenantId))
        .orderBy(asc(chatMessages.createdAt))
        .limit(200);
    }
    res.json(messages);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.post("/api/chat/messages", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const { body, targetTenantId } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ message: "ข้อความว่างเปล่า" });

    const isSuperAdmin = user.role === "super_admin";
    const tenantId = isSuperAdmin ? (targetTenantId || null) : user.tenantId;

    const [msg] = await db.insert(chatMessages).values({
      tenantId,
      senderId: user.id,
      senderName: user.fullName || user.username,
      senderRole: isSuperAdmin ? "admin" : "user",
      body: body.trim(),
    }).returning();

    if (!isSuperAdmin && tenantId && openai) {
      const recentMessages = await db.select().from(chatMessages)
        .where(eq(chatMessages.tenantId, tenantId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(20);

      const history = recentMessages.reverse().map((m) => ({
        role: (m.senderRole === "admin" || m.senderRole === "ai") ? "assistant" as const : "user" as const,
        content: m.body,
      }));

      const [adminUser] = await db.select({ id: users.id }).from(users)
        .where(eq(users.role, "super_admin")).limit(1);

      if (adminUser) {
        (async () => {
          try {
            if (!openai) return;
            const completion = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `คุณคือ "E-Tax Center AI" ผู้ช่วยตอบคำถามการใช้งานระบบ E-Tax Center ซึ่งเป็นแพลตฟอร์มบัญชีดิจิทัลครบวงจรสำหรับสำนักงานบัญชีไทย

โครงสร้างเมนูทั้งหมด (15 หมวด):

1. เริ่มต้นใช้งาน — สมัครสมาชิก เข้าสู่ระบบ เลือกแพ็คเกจ (Free/Starter/Pro/Enterprise) ทดลองฟรี 15 วัน

2. ตั้งค่าระบบ (Settings)
- 2.1 ผู้ใช้ & สิทธิ์: เพิ่มผู้ใช้ กำหนด role (admin/manager/staff/viewer) กำหนดสิทธิ์โมดูล กำหนดบริษัท
- 2.2 ตั้งค่าระบบ & ข้อมูลบริษัท: ชื่อบริษัท เลขผู้เสียภาษี ที่อยู่ โลโก้ ช่องทางชำระเงิน แม่แบบเอกสาร สมัครสมาชิก
- 2.3 ธีม & ภาษา: ธีมส้ม/น้ำเงิน Light/Dark โหมด ภาษาไทย/English/中文
- 2.4 ตั้งค่าอนุมัติ: กำหนดผู้อนุมัติ ลำดับอนุมัติ เปิด/ปิดอนุมัติตามเอกสาร

3. E-Commerce Hub
- 3.1 ตั้งค่า API Credentials: App ID / App Secret ของ Shopee Lazada TikTok Shop
- 3.2 เชื่อมต่อร้านค้า (OAuth): ล็อกอินบัญชีร้านค้า อนุมัติสิทธิ์ รับ Token อัตโนมัติ
- 3.3 นำเข้าออเดอร์ & จัดการ: API Sync ดึงอัตโนมัติ นำเข้า Excel/CSV Batch Operations
- 3.4 จัดส่ง คืนสินค้า Settlement: Pick-Pack-Ship พิมพ์ใบปะหน้า LINE Tracking Auto-TIV Wallet Balance
- 3.5 วิเคราะห์ยอดขาย & ไลฟ์ขายของ: วิเคราะห์ข้ามแพลตฟอร์ม AI Analytics Live Selling Lucky Draw

4. เอกสารขาย / ลูกหนี้ (Sales & AR) — รองรับ 12 สกุลเงิน
- 4.1 ใบเสนอราคา (QO): สร้าง → แปลงเป็น SO/IV/TIV กำหนดวันหมดอายุ
- 4.2 ใบสั่งขาย (SO): บันทึกคำสั่งซื้อ → แปลงเป็น IV/TIV
- 4.3 ใบแจ้งหนี้ (IV): เรียกเก็บเงิน บันทึกลูกหนี้อัตโนมัติ นำเข้า Excel
- 4.4 ใบกำกับภาษี (TIV): ตามกฎหมาย 4 รูปแบบพิมพ์ VAT Closing Warning
- 4.5 ใบเสร็จรับเงิน (RE) & เงินมัดจำ (DP)
- 4.6 ใบลดหนี้ (CN): ลดราคา คืนสินค้า ปรับยอด VAT อัตโนมัติ
- 4.7 รายงานภาษีขาย: รายเดือน ตามรูปแบบกรมสรรพากร

5. เอกสารซื้อ / เจ้าหนี้ (Purchases & AP) — รองรับ VAT และ WHT อัตโนมัติ
- 5.1 ใบขอซื้อ (PR): ขออนุมัติก่อนสั่งซื้อ → แปลงเป็น BID/PO
- 5.2 เปรียบเทียบราคา (BID): เปรียบเทียบผู้ขายหลายราย → เลือก → แปลงเป็น PO
- 5.3 ใบสั่งซื้อ (PO): ส่ง Email/Supplier Portal รับสินค้า → แปลงเป็น AP
- 5.4 บันทึกซื้อ (AP): คำนวณ VAT/WHT อัตโนมัติ สร้าง 50 ทวิ ลงรายงานภาษีซื้อ
- 5.5 ค่าใช้จ่ายอื่น (EXP): ค่าเช่า ค่าบริการ ค่าสาธารณูปโภค per-line VAT/WHT
- 5.6 ใบเพิ่มหนี้ (DN) & เงินมัดจำจ่าย (PDP)
- 5.7 เงินสดย่อย (Petty Cash): ตั้งวงเงิน เบิกจ่าย เติมเงิน ดูยอดคงเหลือ
- 5.8 รายงานภาษีซื้อ & WHT

6. สินค้าคงคลัง (Inventory)
- 6.1 รายการสินค้า: SKU Barcode EAN-13 ประเภท(ธรรมดา/ชุด/ผลิต) VAT นำเข้า/ส่งออก Excel
- 6.2 สูตรการผลิต (BOM) & สินค้าชุด: สร้างสูตร สั่งผลิต ตัดสต็อกวัตถุดิบ
- 6.3 คลังสินค้า & Bin Location: หลายคลัง Zone/Aisle/Shelf/Bin โอนสินค้าระหว่างคลัง
- 6.4 Stock Card & รายงาน: ประวัติเคลื่อนไหว มูลค่าคงเหลือ สินค้าเคลื่อนไหวช้า Low Stock Alert

7. การเงิน (Finance)
- 7.1 ปฏิทินครบกำหนด (Due Calendar): ดูเอกสารครบกำหนดชำระ ลูกหนี้/เจ้าหนี้
- 7.2 รับชำระเงิน & จ่ายชำระเงิน: ตัดยอดลูกหนี้/เจ้าหนี้ Partial Payment
- 7.3 เช็ค & ประวัติเช็ค: เช็ครับ/จ่าย ติดตามสถานะ เช็คคืน
- 7.4 ใบวางบิล (Billing Notes): รวมเอกสารค้างชำระ ส่งเรียกเก็บ
- 7.5 กระทบยอดธนาคาร (Bank Reconciliation): นำเข้า Statement จับคู่อัตโนมัติ

8. ผู้ติดต่อ / CRM
- 8.1 รายชื่อผู้ติดต่อ: ลูกค้า/ผู้ขาย เลขผู้เสียภาษี วงเงินเครดิต ประวัติธุรกรรม
- 8.2 CRM & การติดตาม: โปรไฟล์ลูกค้า LTV ติดตามค่าโฆษณา ROAS

9. ระบบบัญชี (Accounting)
- 9.1 ผังบัญชี (Chart of Accounts): TFRS 3 หลัก(คุม) / 7 หลัก(ย่อย) 3 ภาษา
- 9.2 สมุดรายวัน (Journal Books): 5 เล่ม GJ/RJ/PJ/SJ/BJ Auto Journal Entry
- 9.3 บัญชีแยกประเภท (GL) & งบทดลอง: ดู Dr/Cr ยอดคงเหลือ ส่งออก Excel
- 9.4 เครื่องมือจัดการบัญชี: ยกยอดต้นปี ปิดรอบ ตรวจสอบรายการ หารายการซ้ำ ตัดยอดศูนย์ แก้ไขผลต่าง

10. รายงานภาษี (Tax Reports)
- 10.1 สรุป ภ.พ.30 (VAT Summary): ภาษีขาย - ภาษีซื้อ = ภาษีชำระ/ขอคืน
- 10.2 ภาษีหัก ณ ที่จ่าย (WHT): 50 ทวิ ภ.ง.ด.1 ภ.ง.ด.1ก นำเข้าจาก Excel

11. สินทรัพย์ถาวร (Fixed Assets)
- 11.1 ทะเบียนสินทรัพย์: ค่าเสื่อมราคาอัตโนมัติ (เส้นตรง/ยอดลดลง)
- 11.2 รายงาน: ค่าเสื่อมราคาสะสม ขายสินทรัพย์ สัญญาเช่าซื้อ

12. HR & เงินเดือน (HR & Payroll)
- 12.1 ทะเบียนพนักงาน: ข้อมูลส่วนตัว ภาษี ธนาคาร สิทธิ์วันลา
- 12.2 ลงเวลาเข้า-ออก: Check-in/out รายงานมาสาย/ขาดงาน
- 12.3 จัดการลา & OT: ลาป่วย/ลากิจ/พักร้อน/ลาคลอด ลาครึ่งวัน อนุมัติผ่าน LINE
- 12.4 คำนวณเงินเดือน & ภาษี: เงินเดือน+OT-หัก-ภาษี-ประกันสังคม Payslip ภ.ง.ด.1
- 12.5 ESS Portal: พนักงานดูข้อมูล ขอลา/OT ดาวน์โหลด Payslip/50ทวิ

13. POS (Point of Sale)
- 13.1 เปิดกะ & ขาย: สแกน Barcode ค้นหาสินค้า หลายช่องทางชำระ พักบิล (Hold)
- 13.2 ปิดกะ & รายงาน: นับเงินสด เปรียบเทียบยอด สรุปกะ
- 13.3 POS ร้านอาหาร: จัดการโต๊ะ Kitchen Display (KDS) Modifier แยกบิล Service Charge

14. งบการเงิน (Financial Statements)
- 14.1 งบกำไรขาดทุน: รายได้-ต้นทุน-ค่าใช้จ่าย=กำไรสุทธิ งบเปรียบเทียบ
- 14.2 งบแสดงฐานะการเงิน (Balance Sheet): สินทรัพย์=หนี้สิน+ส่วนของเจ้าของ
- 14.3 งบกระแสเงินสด (Cash Flow): ดำเนินงาน+ลงทุน+จัดหาเงิน
- 14.4 รายงานอื่นๆ: ยอดขาย Gross Profit AR/AP Aging ต้นทุนขาย

15. บริหารสำนักงานบัญชี (Firm Management) — สำหรับสำนักงานบัญชีเท่านั้น
- 15.1 รายชื่อลูกค้า & สลับบริษัท
- 15.2 มอบหมายงาน & ติดตามสถานะ: Work Board แบบ Kanban
- 15.3 สัญญาจ้างทำบัญชี: สร้าง ส่ง เซ็นออนไลน์
- 15.4 สรุปค่าบริการ: รายเดือน สถานะชำระ/ค้าง

ฟีเจอร์พิเศษ:
- Settlement & Wallet: นำเข้ารายงาน Settlement ติดตาม Wallet ลงบัญชีค่าธรรมเนียมอัตโนมัติ
- Chat & Social: Unified Inbox Facebook CF Orders AI อ่าน CF Auto-Reply Rules
- AI: ตรวจสลิปด้วย Vision API VAT Product Dictionary Demand Forecasting
- คลังเอกสาร White Label Barcode Auto-Generate Label Printing Supplier Portal Online Contract Signing
- Work Management Board (คล้าย Monday.com)

คำถามที่พบบ่อยพร้อมคำตอบที่ถูกต้อง (FAQ):

Q: ตั้งค่าพร้อมเพย์ / PromptPay ที่ไหน?
A: ไปที่ ตั้งค่า > tab "เอกสาร" > tab ย่อย "โลโก้" > เลื่อนลงมาจะเห็นการ์ด "พร้อมเพย์ (PromptPay) อัตโนมัติ" มีสวิตช์เปิด/ปิด เลือกประเภท (เบอร์โทร/บัตรประชาชน/เลขผู้เสียภาษี) แล้วกรอกหมายเลข เมื่อเปิดแล้ว QR Code พร้อมเพย์จะแสดงในเอกสาร (ใบแจ้งหนี้ ใบเสร็จ ฯลฯ)

Q: ตั้งค่าวิธีรับเงิน / ช่องทางชำระเงิน ที่ไหน?
A: ไปที่ ตั้งค่า > tab "วิธีรับเงิน" สามารถเพิ่มบัญชีธนาคาร พร้อมเพย์ หรือช่องทางอื่นได้

Q: เปลี่ยนโลโก้บริษัทที่ไหน?
A: ไปที่ ตั้งค่า > tab "ข้อมูลบริษัท" > อัปโหลดโลโก้ที่ช่อง "โลโก้บริษัท"

Q: ตั้งค่าเลขที่เอกสาร / Running Number ที่ไหน?
A: ไปที่ ตั้งค่า > tab "เอกสาร" > tab "เลขที่" จะเห็นหน้ากำหนด Prefix และเลขเริ่มต้นของเอกสารแต่ละประเภท

Q: ตั้งค่าโทนสี / ภาษาเอกสาร ที่ไหน?
A: ไปที่ ตั้งค่า > tab "เอกสาร" > tab "ทั่วไป" จะเห็นส่วนเลือกภาษาเอกสาร (ไทย/อังกฤษ/จีน) และโทนสี

Q: ตั้งค่าอนุมัติเอกสารที่ไหน?
A: ไปที่ ตั้งค่า > tab "ทั่วไป" (ตั้งค่าทั่วไป) > ส่วน "ตั้งค่าอนุมัติ" เปิด/ปิดอนุมัติตามเอกสาร กำหนดผู้อนุมัติ

Q: สลับบริษัทยังไง?
A: กดที่ชื่อบริษัทมุมซ้ายบน จะมี dropdown ให้เลือกสลับบริษัทได้

Q: มอบหมายงาน / เปลี่ยนผู้รับผิดชอบลูกค้ายังไง?
A: ไปที่ บริหารสำนักงาน > มอบหมายงาน > กดเลือกพนักงานจาก dropdown ที่คอลัมน์ "ผู้รับผิดชอบ" ของลูกค้าแต่ละราย (หรือเปลี่ยนที่ eTax Hub Board คอลัมน์ "ผู้รับผิดชอบ" ก็ได้ จะซิงค์กันอัตโนมัติ)

Q: ตั้งค่าลายเซ็นผู้มีอำนาจลงนาม (สำหรับสัญญา) ที่ไหน?
A: ไปที่ ตั้งค่า > tab "ทั่วไป" > ส่วน "ลายเซ็นผู้มีอำนาจลงนาม" ใส่ชื่อ ตำแหน่ง และอัปโหลดรูปลายเซ็น

Q: แก้ไขเวลาเข้า-ออกของพนักงาน (เช็คอินผิด/เช็คเอาท์ผิด)?
A: ไปที่ HR > รายงานการลงเวลา > กดปุ่มดินสอ (แก้ไข) ที่แถวพนักงาน > แก้เวลา หรือกด "ล้างเช็คเอาท์" ถ้าเช็คเอาท์ผิด (เฉพาะ admin/manager)

Q: ดู/ออกงบการเงิน ที่ไหน?
A: ไปที่ การบัญชี > งบการเงิน เลือกดู งบกำไรขาดทุน / งบแสดงฐานะการเงิน / งบกระแสเงินสด

Q: นำเข้า Excel ที่ไหน?
A: มีหลายจุด ขึ้นกับข้อมูล — ใบแจ้งหนี้: เมนูเอกสารขาย > นำเข้า Excel / ออเดอร์ E-Commerce: E-Commerce Hub > นำเข้า / สินค้า: คลังสินค้า > นำเข้า / ผู้ติดต่อ: ผู้ติดต่อ > นำเข้า

Q: ผังบัญชีอยู่ที่ไหน?
A: ไปที่ การบัญชี > ผังบัญชี

Q: ใช้ POS ยังไง?
A: ไปที่เมนู POS > กดเปิดกะ > เลือกสินค้า/สแกน Barcode > เลือกช่องทางชำระ > กดจ่ายเงิน

Q: ดูรายงานภาษี ภ.พ.30 ที่ไหน?
A: ไปที่ การบัญชี > ภ.พ.30 สรุป VAT หรือ รายงาน > รายงานภาษี

วิธีใช้งานทั่วไป:
- สร้างเอกสาร: ไปที่เมนูเอกสาร > เลือกประเภท > กดสร้างใหม่ > กรอกข้อมูล > บันทึก/อนุมัติ
- เชื่อมต่อ E-Commerce: E-Commerce Hub > ตั้งค่า API Credentials > เชื่อมต่อ OAuth > ซิงค์ออเดอร์
- ตั้งค่าบริษัท: ตั้งค่า > ข้อมูลบริษัท > กรอกชื่อ ที่อยู่ เลขผู้เสียภาษี โลโก้
- ออกใบกำกับภาษี E-Commerce: E-Commerce Hub > เลือกออเดอร์ > กดออก Auto-TIV
- ดูรายงาน: เมนูรายงาน > เลือกรายงาน > กำหนดช่วงวันที่ > ส่งออก Excel/PDF
- เงินสดย่อย: การซื้อ & ค่าใช้จ่าย > เงินสดย่อย > ตั้งวงเงิน > เบิกจ่าย > เติมเงิน
- ดูคู่มือฉบับเต็ม: กดปุ่ม "คู่มือการใช้งาน" ในเมนูด้านซ้าย หรือไปที่หน้า /user-guide

กฎ:
- ตอบเป็นภาษาไทยเสมอ ยกเว้นคำศัพท์เทคนิค
- ตอบสั้น กระชับ ได้ใจความ (3-5 ประโยค) ใช้ bullet point ถ้าเหมาะสม
- ถ้าไม่แน่ใจหรือเป็นคำถามทางกฎหมาย/ภาษีที่ซับซ้อน ให้แนะนำให้ติดต่อทีมสนับสนุน
- พูดสุภาพ เป็นมิตร ใช้คำลงท้ายครับ/ค่ะ
- บอกขั้นตอนการใช้งานเป็นข้อๆ เพื่อให้เข้าใจง่าย
- แนะนำเมนูที่ต้องไปพร้อมเส้นทาง (เช่น "ไปที่ การซื้อ & ค่าใช้จ่าย > เงินสดย่อย")
- คุณเป็น AI ผู้ช่วยการใช้งาน ไม่ใช่ที่ปรึกษาภาษีหรือทนายความ`,
                },
                ...history,
              ],
              max_tokens: 800,
            });

            const aiReply = completion.choices[0]?.message?.content;
            if (aiReply) {
              await db.insert(chatMessages).values({
                tenantId,
                senderId: adminUser.id,
                senderName: "E-Tax Center AI",
                senderRole: "ai",
                body: aiReply,
              });
            }
          } catch (aiErr) {
            console.error("AI auto-reply error:", aiErr);
          }
        })();
      }
    }

    res.json(msg);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.patch("/api/chat/messages/read", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;
    const isSuperAdmin = user.role === "super_admin";

    if (isSuperAdmin) {
      const filterTenantId = req.body.tenantId ? Number(req.body.tenantId) : null;
      if (filterTenantId) {
        await db.update(chatMessages)
          .set({ readAt: new Date() })
          .where(and(
            eq(chatMessages.tenantId, filterTenantId),
            eq(chatMessages.senderRole, "user"),
            isNull(chatMessages.readAt)
          ));
      }
    } else {
      await db.update(chatMessages)
        .set({ readAt: new Date() })
        .where(and(
          eq(chatMessages.tenantId, tenantId),
          sql`${chatMessages.senderRole} IN ('admin', 'ai')`,
          isNull(chatMessages.readAt)
        ));
    }
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

app.get("/api/chat/unread-count", requireAuth, async (req, res) => {
  try {
    const tableExists = await db.execute(sql`
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'chat_messages' LIMIT 1
    `);
    if (!tableExists.rows.length) {
      return res.json({ count: 0 });
    }

    const user = req.user as any;
    const tenantId = user.tenantId;
    const isSuperAdmin = user.role === "super_admin";

    let result;
    if (isSuperAdmin) {
      result = await db.select({ count: sql<number>`count(*)::int` }).from(chatMessages)
        .where(and(
          eq(chatMessages.senderRole, "user"),
          isNull(chatMessages.readAt)
        ));
    } else {
      result = await db.select({ count: sql<number>`count(*)::int` }).from(chatMessages)
        .where(and(
          eq(chatMessages.tenantId, tenantId),
          sql`${chatMessages.senderRole} IN ('admin', 'ai')`,
          isNull(chatMessages.readAt)
        ));
    }
    res.json({ count: result[0]?.count ?? 0 });
  } catch (err: any) { res.json({ count: 0 }); }
});

app.get("/api/chat/threads", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const allMessages = await db.select().from(chatMessages).orderBy(desc(chatMessages.createdAt));
    const threadMap = new Map<number, any>();
    for (const msg of allMessages) {
      if (!msg.tenantId) continue;
      if (!threadMap.has(msg.tenantId)) {
        threadMap.set(msg.tenantId, {
          tenantId: msg.tenantId,
          lastMessage: msg.body,
          lastAt: msg.createdAt,
          senderName: msg.senderName,
          unreadCount: 0,
        });
      }
      if (msg.senderRole === "user" && !msg.readAt) {
        const t = threadMap.get(msg.tenantId);
        t.unreadCount++;
      }
    }
    const threads = Array.from(threadMap.values());
    const tenantIds = threads.map(t => t.tenantId);
    if (tenantIds.length > 0) {
      const tenantRecords = await db.select().from(tenants);
      for (const t of threads) {
        const tenant = tenantRecords.find((r: any) => r.id === t.tenantId);
        t.tenantName = tenant?.name || `Tenant #${t.tenantId}`;
      }
    }
    res.json(threads);
  } catch (err: any) { res.status(500).json({ message: err.message }); }
});

// ========== Gateway Queue Drainer (pull-based, dynamic interval) ==========
let drainIntervalHandle: ReturnType<typeof setInterval> | null = null;
let currentDrainIntervalMin = 0;

async function getDrainIntervalMinutes(): Promise<number> {
  try {
    const rows = await db.execute(sql`SELECT config_value FROM system_config WHERE config_key = 'LINE_GATEWAY_DRAIN_INTERVAL_MIN' LIMIT 1`);
    const row = (rows.rows?.[0] as any);
    if (!row) return 10;
    const val = parseInt(row.config_value, 10);
    return (val >= 0 && val <= 1440) ? val : 10;
  } catch {
    return 10;
  }
}

function scheduleDrain(intervalMin: number) {
  if (drainIntervalHandle) {
    clearInterval(drainIntervalHandle);
    drainIntervalHandle = null;
  }
  currentDrainIntervalMin = intervalMin;
  if (intervalMin <= 0) {
    console.log(`[Gateway Queue] Drain disabled (interval=0)`);
    return;
  }
  console.log(`[Gateway Queue] Drain scheduled every ${intervalMin} min`);
  drainIntervalHandle = setInterval(drainGatewayQueue, intervalMin * 60 * 1000);
}

async function drainGatewayQueue() {
  try {
    const rows = await db.execute(sql`SELECT config_key, config_value FROM system_config WHERE config_key IN ('LINE_GATEWAY_URL', 'LINE_GATEWAY_AUTH_KEY')`);
    const configMap: Record<string, string> = {};
    for (const r of (rows.rows || []) as any[]) configMap[r.config_key] = r.config_value;

    const gatewayUrl = configMap['LINE_GATEWAY_URL'];
    const authKey = configMap['LINE_GATEWAY_AUTH_KEY'];
    if (!gatewayUrl || !authKey) return;

    const drainRes = await fetch(`${gatewayUrl}?action=drain&limit=50`, {
      method: 'POST',
      headers: { 'X-Gateway-Auth': authKey, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    if (!drainRes.ok) return;
    const data = await drainRes.json() as any;
    if (!data.count || !data.webhooks?.length) return;

    console.log(`[Gateway Queue] Draining ${data.webhooks.length} pending webhooks`);

    const delivered: number[] = [];
    const failed: { id: number; error: string }[] = [];

    for (const wh of data.webhooks) {
      try {
        const payload = typeof wh.payload === 'string' ? wh.payload : JSON.stringify(wh.payload);
        const replayRes = await fetch(`http://localhost:5000/api/line/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          signal: AbortSignal.timeout(30000),
        });
        if (replayRes.ok) {
          delivered.push(wh.id);
        } else {
          failed.push({ id: wh.id, error: `replay HTTP ${replayRes.status}` });
        }
      } catch (err: any) {
        failed.push({ id: wh.id, error: err.message || 'processing error' });
      }
    }

    if (delivered.length || failed.length) {
      await fetch(`${gatewayUrl}?action=ack`, {
        method: 'POST',
        headers: { 'X-Gateway-Auth': authKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ delivered, failed }),
        signal: AbortSignal.timeout(10000),
      });
      console.log(`[Gateway Queue] Ack sent — delivered=${delivered.length} failed=${failed.length}`);
    }
  } catch (err: any) {
    if (err.message?.includes('timeout') || err.message?.includes('fetch')) return;
    console.error(`[Gateway Queue] Error:`, err.message);
  }
}

app.get("/api/line/gateway-config", requireAuth, async (req, res) => {
  const user = req.user as any;
  if (user.role !== "super_admin") return res.status(403).json({ message: "สิทธิ์ sysAdmin เท่านั้น" });
  try {
    const rows = await db.execute(sql`SELECT config_key, config_value FROM system_config WHERE config_key IN ('LINE_GATEWAY_URL', 'LINE_GATEWAY_AUTH_KEY')`);
    const config: Record<string, string> = {};
    for (const r of (rows.rows || []) as any[]) config[r.config_key] = r.config_value;
    res.json({ gatewayUrl: config['LINE_GATEWAY_URL'] || '', authKey: config['LINE_GATEWAY_AUTH_KEY'] ? '••••••••' : '' });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.post("/api/line/gateway-config", requireAuth, async (req, res) => {
  const user = req.user as any;
  if (user.role !== "super_admin") return res.status(403).json({ message: "สิทธิ์ sysAdmin เท่านั้น" });
  const { gatewayUrl, authKey } = req.body;
  try {
    if (gatewayUrl !== undefined) {
      await db.execute(sql`INSERT INTO system_config (config_key, config_value) VALUES ('LINE_GATEWAY_URL', ${gatewayUrl}) ON CONFLICT (config_key) DO UPDATE SET config_value = ${gatewayUrl}`);
    }
    if (authKey !== undefined && authKey !== '••••••••') {
      await db.execute(sql`INSERT INTO system_config (config_key, config_value) VALUES ('LINE_GATEWAY_AUTH_KEY', ${authKey}) ON CONFLICT (config_key) DO UPDATE SET config_value = ${authKey}`);
    }
    res.json({ message: "บันทึก Gateway Config แล้ว" });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

app.get("/api/line/gateway-drain-config", requireAuth, async (req, res) => {
  const user = req.user as any;
  if (user.role !== "super_admin") return res.status(403).json({ message: "สิทธิ์ sysAdmin เท่านั้น" });
  res.json({ intervalMin: currentDrainIntervalMin });
});

app.post("/api/line/gateway-drain-config", requireAuth, async (req, res) => {
  const user = req.user as any;
  if (user.role !== "super_admin") return res.status(403).json({ message: "สิทธิ์ sysAdmin เท่านั้น" });
  const { intervalMin } = req.body;
  const val = parseInt(intervalMin, 10);
  if (isNaN(val) || val < 0 || val > 1440) return res.status(400).json({ message: "ระบุ 0-1440 นาที (0=ปิด)" });
  await db.execute(sql`INSERT INTO system_config (config_key, config_value) VALUES ('LINE_GATEWAY_DRAIN_INTERVAL_MIN', ${String(val)}) ON CONFLICT (config_key) DO UPDATE SET config_value = ${String(val)}`);
  scheduleDrain(val);
  res.json({ intervalMin: val, message: val === 0 ? "ปิด drain แล้ว" : `ตั้ง drain ทุก ${val} นาที` });
});

setTimeout(async () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Gateway Queue] Skipped — not production (NODE_ENV=${process.env.NODE_ENV})`);
    return;
  }
  try {
    console.log(`[Gateway Queue] Initializing...`);
    const interval = await getDrainIntervalMinutes();
    scheduleDrain(interval);
    if (interval > 0) {
      console.log(`[Gateway Queue] Running initial drain on startup...`);
      await drainGatewayQueue();
    }
  } catch (err: any) {
    console.error(`[Gateway Queue] Init error:`, err.message);
    scheduleDrain(10);
  }
}, 15000);

// ============================================================
// ONE-TIME SEED: ensure LINE gateway config exists in every database
// Runs once per database, sets flag in system_config so it never runs again
// ============================================================
setTimeout(async () => {
  const SEED_KEY = 'SEED_LINE_GATEWAY_CONFIG_DONE';
  try {
    const flagRows = await db.execute(sql`SELECT config_value FROM system_config WHERE config_key = ${SEED_KEY} LIMIT 1`);
    if ((flagRows.rows || []).length > 0) return;

    const existing = await db.execute(sql`SELECT config_key FROM system_config WHERE config_key = 'LINE_GATEWAY_URL' LIMIT 1`);
    if ((existing.rows || []).length > 0) {
      await db.execute(sql`INSERT INTO system_config (config_key, config_value, description) VALUES (${SEED_KEY}, ${'already_exists_' + new Date().toISOString()}, 'LINE gateway config seed') ON CONFLICT (config_key) DO NOTHING`);
      console.log(`[Seed] LINE gateway config already exists, skipping`);
      return;
    }

    const gwUrl = 'https://www.apc-tech.com/line-gateway-configured.php';
    const gwKey = 'e49a83b98e013f35316ea1e0bfc2324bbcad9f0abbdfa8c2';
    await db.execute(sql`INSERT INTO system_config (config_key, config_value, is_secret, description) VALUES ('LINE_GATEWAY_URL', ${gwUrl}, false, 'LINE Gateway PHP URL') ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`);
    await db.execute(sql`INSERT INTO system_config (config_key, config_value, is_secret, description) VALUES ('LINE_GATEWAY_AUTH_KEY', ${gwKey}, true, 'LINE Gateway Auth Key') ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`);

    await db.execute(sql`INSERT INTO system_config (config_key, config_value, description) VALUES (${SEED_KEY}, ${'seeded_' + new Date().toISOString()}, 'LINE gateway config seed') ON CONFLICT (config_key) DO NOTHING`);
    console.log(`[Seed] LINE gateway config seeded successfully`);
  } catch (err: any) {
    console.error(`[Seed] LINE gateway config error:`, err.message);
  }
}, 3000);

// ============================================================
// ONE-TIME MIGRATION: cleanup duplicate line_recipients
// Runs once per database, sets flag in system_config so it never runs again
// Safe to leave in code — the flag check makes it a no-op after first run
// ============================================================
setTimeout(async () => {
  const MIGRATION_KEY = 'MIGRATION_LINE_RECIPIENTS_DEDUP_DONE';
  try {
    const flagRows = await db.execute(sql`SELECT config_value FROM system_config WHERE config_key = ${MIGRATION_KEY} LIMIT 1`);
    if ((flagRows.rows || []).length > 0) return; // already done

    console.log(`[Migration] Starting line_recipients dedup cleanup...`);

    // Count before
    const beforeRes = await db.execute(sql`SELECT count(*) as cnt FROM line_recipients`);
    const beforeCount = (beforeRes.rows[0] as any)?.cnt || 0;

    // Delete duplicates, keep the latest id for each (line_id, type)
    const delRes = await db.execute(sql`
      DELETE FROM line_recipients
      WHERE id NOT IN (
        SELECT MAX(id) FROM line_recipients GROUP BY line_id, type
      )
    `);
    const deleted = (delRes as any).rowCount || 0;

    // Create unique index if not exists
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS line_recipients_line_id_type_uniq ON line_recipients(line_id, type)`);

    // Count after
    const afterRes = await db.execute(sql`SELECT count(*) as cnt FROM line_recipients`);
    const afterCount = (afterRes.rows[0] as any)?.cnt || 0;

    // Set flag so this never runs again
    await db.execute(sql`INSERT INTO system_config (config_key, config_value, description) VALUES (${MIGRATION_KEY}, ${`done_${new Date().toISOString()}_deleted_${deleted}`}, 'One-time dedup migration for line_recipients') ON CONFLICT (config_key) DO NOTHING`);

    console.log(`[Migration] line_recipients dedup complete: ${beforeCount} → ${afterCount} (deleted ${deleted} duplicates, unique index created)`);
  } catch (err: any) {
    console.error(`[Migration] line_recipients dedup error:`, err.message);
  }
}, 5000);

}
