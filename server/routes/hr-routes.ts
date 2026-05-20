import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { z } from "zod";
import { eq, and, asc, desc, sql, inArray, between, gte, lte, ne } from "drizzle-orm";
import ExcelJS from "exceljs";
import { employees, departments, branches, companies, holidays, workSchedules, workLocations, otSettings, payrollRecords, attendanceRecords, otRecords, accounts, journalEntries, insertEmployeeSchema, insertOtSchema, insertLeaveSchema, insertWorkLocationSchema, commissionRules, commissionRecords, taxInvoices, invoices, firmClients, firmClientTeam, workStatusRows, leaveRequests, evaluationResults, taskAssignees, users, shifts, employeeShiftAssignments, leavePolicies, leaveBalances, insertLeavePolicySchema, notifications, scannerEmployeeMappings, scannerImportLogs, autoOtConfig } from "@shared/schema";
import { employeeHourSettings } from "@shared/schema-extra";
import { requireAuth, requireModule, requireRole, checkDocOwnership } from "../route-middleware";
import { haversineDistance, getNextJournalEntryNo, isViewingOwnCompany, isPrivilegedRole, isFullAccessRole, logActivity, withDbRetry, isDbConnectionError, verifyCompanyAccess } from "../route-helpers";
import multer from "multer";
import { decodeMulterFilename } from "../utils/safe-filename";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  sick: "ลาป่วย",
  personal: "ลากิจ",
  annual: "ลาพักร้อน",
  vacation: "ลาพักร้อน",
  maternity: "ลาคลอด",
  other: "ลาอื่นๆ",
};

async function sendHrLineNotification(
  companyId: number,
  type: "leave" | "ot",
  details: {
    employeeName: string;
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    days?: number;
    reason?: string;
    otDate?: string;
    otHours?: number;
    otType?: string;
  }
) {
  try {
    let token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const [company] = await db
      .select({ lineChannelAccessToken: companies.lineChannelAccessToken, name: companies.name })
      .from(companies)
      .where(eq(companies.id, companyId));
    if (company?.lineChannelAccessToken) token = company.lineChannelAccessToken;
    if (!token) return;

    const approverUsers = await db
      .select({ lineId: users.lineId, role: users.role, allowedCompanyIds: users.allowedCompanyIds })
      .from(users)
      .where(
        inArray(users.role, ["admin", "manager", "owner", "super_admin"])
      );

    const approverLineIds = approverUsers
      .filter(u => u.lineId && (
        u.role === "super_admin" ||
        !u.allowedCompanyIds ||
        u.allowedCompanyIds.length === 0 ||
        u.allowedCompanyIds.includes(companyId)
      ))
      .map(u => u.lineId!);

    if (approverLineIds.length === 0) return;

    const isLeave = type === "leave";
    const emoji = isLeave ? "🏖️" : "⏰";
    const title = isLeave ? "ขอลางาน" : "ขอทำ OT";
    const headerColor = isLeave ? "#539BFF" : "#fb9678";
    const headerBg = isLeave ? "#EEF4FF" : "#FFF5F2";

    const bodyContents: any[] = [
      { type: "text", text: details.employeeName, weight: "bold", size: "sm", wrap: true },
    ];

    if (isLeave) {
      const leaveLabel = LEAVE_TYPE_LABELS[details.leaveType || ""] || details.leaveType || "-";
      bodyContents.push(
        { type: "text", text: `ประเภท: ${leaveLabel}`, size: "xs", color: "#666666", margin: "sm" },
        { type: "text", text: `วันที่: ${details.startDate || ""} - ${details.endDate || ""}`, size: "xs", color: "#666666", margin: "sm" },
        { type: "text", text: `จำนวน: ${details.days || 0} วัน`, size: "xs", color: "#666666", margin: "sm" },
      );
      if (details.reason) {
        bodyContents.push(
          { type: "text", text: `เหตุผล: ${details.reason}`, size: "xs", color: "#666666", margin: "sm", wrap: true },
        );
      }
    } else {
      bodyContents.push(
        { type: "text", text: `วันที่: ${details.otDate || "-"}`, size: "xs", color: "#666666", margin: "sm" },
        { type: "text", text: `ชั่วโมง: ${details.otHours || 0} ชม.`, size: "xs", color: "#666666", margin: "sm" },
        { type: "text", text: `ประเภท: ${details.otType || "-"}`, size: "xs", color: "#666666", margin: "sm" },
      );
    }

    bodyContents.push(
      { type: "text", text: `บริษัท: ${company?.name || "-"}`, size: "xs", color: "#999999", margin: "md" },
      { type: "separator", margin: "lg" },
      { type: "text", text: "กรุณาเข้าระบบเพื่ออนุมัติ", size: "xs", color: "#999999", margin: "md", align: "center" },
    );

    const flexMessage = {
      type: "flex",
      altText: `${emoji} ${title} - ${details.employeeName}`,
      contents: {
        type: "bubble",
        size: "kilo",
        header: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: `${emoji} ${title}`, weight: "bold", size: "md", color: headerColor },
          ],
          backgroundColor: headerBg,
          paddingAll: "15px",
        },
        body: {
          type: "box",
          layout: "vertical",
          contents: bodyContents,
          paddingAll: "15px",
        },
      },
    };

    for (const lineId of approverLineIds) {
      try {
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ to: lineId, messages: [flexMessage] }),
        });
      } catch (err) {
        console.error(`[HR LINE] Failed to send to ${lineId}:`, (err as any).message);
      }
    }
    console.log(`[HR LINE] Sent ${type} notification to ${approverLineIds.length} approvers`);
  } catch (err) {
    console.error("[HR LINE] Error sending notification:", (err as any).message);
  }
}

function formatDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toThaiDate(d: Date): { date: string; hours: number; minutes: number; seconds: number; time: string } {
  const thai = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return {
    date: formatDateStr(thai),
    hours: thai.getUTCHours(),
    minutes: thai.getUTCMinutes(),
    seconds: thai.getUTCSeconds(),
    time: `${String(thai.getUTCHours()).padStart(2,"0")}:${String(thai.getUTCMinutes()).padStart(2,"0")}`,
  };
}

export function registerHrRoutes(app: Express) {
  db.execute(sql`
    CREATE TABLE IF NOT EXISTS employee_counters (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL UNIQUE REFERENCES companies(id),
      prefix VARCHAR(2) NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0
    )
  `).catch((e: any) => console.warn("employee_counters table init:", e.message?.slice(0, 80)));

  app.get("/api/employee-names", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      let companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
      if (companyId && user.tenantId && !(await verifyCompanyAccess(companyId, user.tenantId))) {
        return res.json([]);
      }
      if (companyId && !isFullAccessRole(user.role)) {
        const { getUserAllowedCompanyIds } = await import("../route-middleware");
        const allowedIds = await getUserAllowedCompanyIds(user.id);
        if (allowedIds && allowedIds.length > 0 && !allowedIds.includes(companyId)) {
          return res.json([]);
        }
      }
      const allEmployees = await storage.getEmployees(user.tenantId, companyId);
      const names = allEmployees
        .filter((e: any) => e.employmentStatus !== "resigned")
        .map((e: any) => ({ id: e.id, name: e.fullName || `${e.firstName || ""} ${e.lastName || ""}`.trim(), position: e.position || "" }))
        .filter((e: any) => e.name);
      res.json(names);
    } catch (err: any) { res.json([]); }
  });

  app.get("/api/employees", requireAuth, requireModule("hr"), async (req, res) => {
    const user = req.user as any;
    const tenantId = user.tenantId;
    let companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    if (companyId && tenantId && !(await verifyCompanyAccess(companyId, tenantId))) {
      return res.json([]);
    }
    if (companyId && !isFullAccessRole(user.role)) {
      const { getUserAllowedCompanyIds } = await import("../route-middleware");
      const allowedIds = await getUserAllowedCompanyIds(user.id);
      if (allowedIds && allowedIds.length > 0 && !allowedIds.includes(companyId)) {
        return res.json([]);
      }
    }
    if (!companyId && !isFullAccessRole(user.role)) {
      const myEmpRecord = await storage.getEmployeeByUserId(user.id);
      if (myEmpRecord?.companyId) {
        companyId = myEmpRecord.companyId;
      }
    }
    if (!companyId && !tenantId) return res.json([]);
    const allEmployees = await storage.getEmployees(tenantId, companyId);
    allEmployees.sort((a: any, b: any) => {
      const prefixA = (a.employeeCode?.match(/^[A-Za-z]+/) || [''])[0];
      const prefixB = (b.employeeCode?.match(/^[A-Za-z]+/) || [''])[0];
      if (prefixA !== prefixB) return prefixA.localeCompare(prefixB);
      const numA = parseInt((a.employeeCode?.match(/\d+$/) || ['0'])[0]) || 0;
      const numB = parseInt((b.employeeCode?.match(/\d+$/) || ['0'])[0]) || 0;
      if (numA !== numB) return numA - numB;
      return (a.id || 0) - (b.id || 0);
    });
    const sampleIds = allEmployees.slice(0, 5).map((e: any) => `${e.employeeCode}(cid=${e.companyId})`).join(", ");
    console.log(`[employees] tenantId=${tenantId} companyId=${companyId} role=${user.role} returned=${allEmployees.length} sample=[${sampleIds}]`);
    if (!isPrivilegedRole(user.role)) {
      const viewingOwn = await isViewingOwnCompany(user.id, companyId);
      if (viewingOwn) {
        const myEmp = allEmployees.find((e: any) => e.userId === user.id);
        if (myEmp) {
          const safe = allEmployees.map((e: any) => ({
            id: e.id, employeeCode: e.employeeCode, fullName: e.fullName,
            titlePrefix: e.titlePrefix, firstName: e.firstName, lastName: e.lastName,
            position: e.position, department: e.department, phone: e.phone, email: e.email,
            active: e.active, employmentStatus: e.employmentStatus, workLocationId: e.workLocationId,
            ...(e.id === myEmp.id ? e : {}),
          }));
          return res.json(safe);
        }
        return res.json([]);
      }
    }
    const statusParam = req.query.status as string | undefined;
    if (statusParam === "active") {
      res.json(allEmployees.filter((e: any) => e.employmentStatus !== "resigned"));
    } else if (statusParam === "resigned") {
      res.json(allEmployees.filter((e: any) => e.employmentStatus === "resigned"));
    } else {
      res.json(allEmployees);
    }
  });

  app.get("/api/employee-counter/:companyId", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = Number(req.params.companyId);
      const counter = await storage.getEmployeeCounter(companyId);
      res.json(counter || null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/employee-counter", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, prefix } = req.body;
      if (!companyId || !prefix) return res.status(400).json({ message: "กรุณาระบุ companyId และ prefix" });
      if (!/^[A-Za-z]{2}$/.test(prefix)) return res.status(400).json({ message: "Prefix ต้องเป็นตัวอักษร 2 ตัวเท่านั้น" });
      if (!(await verifyCompanyAccess(companyId, user.tenantId))) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
      }
      const existing = await storage.getEmployeeCounter(companyId);
      if (existing) return res.status(400).json({ message: "บริษัทนี้ตั้ง prefix แล้ว ไม่สามารถเปลี่ยนได้" });

      const uppercasePrefix = prefix.toUpperCase();
      const allEmps = await storage.getEmployees(undefined, companyId);
      let maxNum = 0;
      for (const emp of allEmps) {
        if (emp.employeeCode && emp.employeeCode.toUpperCase().startsWith(uppercasePrefix)) {
          const numPart = parseInt(emp.employeeCode.slice(uppercasePrefix.length), 10);
          if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
        }
      }

      const counter = await storage.createEmployeeCounter({ companyId, prefix: uppercasePrefix, lastNumber: maxNum });
      res.status(201).json(counter);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/employees", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = req.body.companyId || null;
      if (companyId && !(await verifyCompanyAccess(companyId, user.tenantId))) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบริษัทนี้" });
      }

      let employeeCode = req.body.employeeCode;
      if (!employeeCode && companyId) {
        employeeCode = await storage.nextEmployeeCode(companyId);
      }

      const parsed = insertEmployeeSchema.parse({ ...req.body, employeeCode, tenantId: user.tenantId || null, companyId });
      const employee = await storage.createEmployee(parsed);
      res.status(201).json(employee);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  const uploadEmployees = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  app.get("/api/employees/export-excel", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const XLSX = await import("xlsx");
      const user = req.user as any;
      const tenantId = user.tenantId;
      const exportCompanyId = req.query.companyId ? Number(req.query.companyId) : undefined;

      const conditions = [];
      if (tenantId) conditions.push(eq(employees.tenantId, tenantId));
      if (exportCompanyId) conditions.push(eq(employees.companyId, exportCompanyId));
      const empList = conditions.length > 0
        ? await db.select().from(employees).where(and(...conditions)).orderBy(employees.employeeCode)
        : await db.select().from(employees).orderBy(employees.employeeCode);

      let locMap: Record<number, string> = {};
      try {
        const locs = await db.select().from(workLocations);
        locMap = Object.fromEntries(locs.map(l => [l.id, l.name]));
      } catch {}

      const headers = ["รหัสพนักงาน", "คำนำหน้า", "ชื่อ", "นามสกุล", "ชื่อ-นามสกุล", "เลขบัตรประชาชน", "เลขผู้เสียภาษี", "ที่อยู่", "ตำแหน่ง", "แผนก", "เงินเดือน", "วันเริ่มงาน", "โทรศัพท์", "อีเมล", "สาขาที่สังกัด", "ประเภทเงินได้", "สถานะ"];
      const rows = empList.map((e: any) => [
        e.employeeCode || "",
        e.titlePrefix || "",
        e.firstName || "",
        e.lastName || "",
        e.fullName || [e.titlePrefix, e.firstName, e.lastName].filter(Boolean).join(" "),
        e.idCardNumber || "",
        e.taxId || "",
        e.address || "",
        e.position || "",
        e.department || "",
        e.baseSalary || "0",
        e.startDate || "",
        e.phone || "",
        e.email || "",
        e.workLocationId ? (locMap[e.workLocationId] || "") : "",
        e.incomeType === "1" ? "40(1) เงินเดือน/ค่าจ้าง" : e.incomeType === "2" ? "40(2) รับจ้างทำงาน" : e.incomeType || "",
        e.employmentStatus === "resigned" ? "ลาออก" : "ปัจจุบัน",
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws["!cols"] = [
        { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
        { wch: 18 }, { wch: 18 }, { wch: 35 }, { wch: 15 }, { wch: 15 },
        { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 22 }, { wch: 18 },
        { wch: 25 }, { wch: 10 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ทะเบียนพนักงาน");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=employee_export.xlsx");
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/employees/template-excel", async (_req, res) => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const headers = [
      ["รหัสพนักงาน*", "คำนำหน้า", "ชื่อ", "นามสกุล", "ชื่อ-นามสกุล(เต็ม)*", "ชื่อเล่น", "เลขบัตรประชาชน", "เลขผู้เสียภาษี", "วันเกิด(YYYY-MM-DD)", "ที่อยู่", "ตำแหน่ง", "แผนก", "เงินเดือน", "วันเริ่มงาน(YYYY-MM-DD)", "โทรศัพท์", "อีเมล", "ประเภทเงินได้(1หรือ2)", "ธนาคาร", "เลขที่บัญชีธนาคาร", "LINE User ID"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    ws["!cols"] = [
      { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
      { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 30 },
      { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 15 },
      { wch: 20 }, { wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 25 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "ทะเบียนพนักงาน");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=employee_template.xlsx");
    res.send(buf);
  });

  app.post("/api/employees/import-excel", requireAuth, requireModule("hr"), uploadEmployees.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "กรุณาเลือกไฟล์ Excel" });
      const XLSX = await import("xlsx");
      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) return res.status(400).json({ message: "ไม่พบข้อมูลในไฟล์" });
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rows.length < 2) return res.status(400).json({ message: "ไม่พบข้อมูลพนักงานในไฟล์ (ต้องมีอย่างน้อย 1 แถว หลังหัวตาราง)" });

      const headerRow = rows[0].map((h: any) => String(h || "").trim());
      const colMap: Record<string, number> = {};
      const mappings: [string, string[]][] = [
        ["employeeCode", ["รหัสพนักงาน", "employee_code", "employeecode", "รหัส", "code"]],
        ["titlePrefix", ["คำนำหน้า", "title", "prefix", "titleprefix", "คำนำหน้าชื่อ"]],
        ["firstName", ["ชื่อ", "first_name", "firstname", "name"]],
        ["lastName", ["นามสกุล", "last_name", "lastname", "surname"]],
        ["fullName", ["ชื่อ-นามสกุล", "ชื่อ-นามสกุล(เต็ม)", "fullname", "full_name", "ชื่อเต็ม"]],
        ["idCardNumber", ["เลขบัตรประชาชน", "id_card", "idcard", "บัตรประชาชน", "id_card_number"]],
        ["taxId", ["เลขผู้เสียภาษี", "tax_id", "taxid", "เลขประจำตัวผู้เสียภาษี"]],
        ["address", ["ที่อยู่", "address"]],
        ["position", ["ตำแหน่ง", "position"]],
        ["department", ["แผนก", "department", "dept"]],
        ["baseSalary", ["เงินเดือน", "salary", "base_salary", "basesalary"]],
        ["startDate", ["วันเริ่มงาน", "start_date", "startdate", "วันที่เริ่มงาน"]],
        ["phone", ["โทรศัพท์", "phone", "tel", "mobile", "เบอร์โทร"]],
        ["email", ["อีเมล", "email", "e-mail"]],
        ["incomeType", ["ประเภทเงินได้", "income_type", "incometype", "เงินได้"]],
        ["nickname", ["ชื่อเล่น", "nickname", "nick"]],
        ["birthDate", ["วันเกิด", "birth_date", "birthdate", "วันเดือนปีเกิด", "birthday"]],
        ["bankName", ["ธนาคาร", "bank_name", "bankname", "bank"]],
        ["bankAccountNumber", ["เลขที่บัญชีธนาคาร", "bank_account", "bankaccount", "เลขบัญชี", "bank_account_number"]],
        ["lineUserId", ["lineuserid", "line_user_id", "lineuid", "line"]],
      ];

      for (const [field, aliases] of mappings) {
        const idx = headerRow.findIndex((h: string) => {
          const lower = h.toLowerCase().replace(/[*\s()]/g, "");
          return aliases.some(a => lower === a.toLowerCase().replace(/[*\s()]/g, "") || lower.includes(a.toLowerCase().replace(/[*\s()]/g, "")));
        });
        if (idx >= 0) colMap[field] = idx;
      }

      if (colMap["employeeCode"] === undefined && colMap["fullName"] === undefined) {
        return res.status(400).json({ message: "ไม่พบคอลัมน์ 'รหัสพนักงาน' หรือ 'ชื่อ-นามสกุล' ในไฟล์ กรุณาใช้ Template ที่ดาวน์โหลด" });
      }

      const results = { created: 0, updated: 0, errors: [] as string[] };
      const dataRows = rows.slice(1).filter((r: any[]) => r.some((c: any) => c !== undefined && c !== null && String(c).trim() !== ""));

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 2;
        try {
          const get = (field: string) => {
            const idx = colMap[field];
            if (idx === undefined || idx >= row.length) return null;
            const val = row[idx];
            return val !== undefined && val !== null ? String(val).trim() : null;
          };

          const employeeCode = get("employeeCode");
          if (!employeeCode) {
            results.errors.push(`แถว ${rowNum}: ไม่มีรหัสพนักงาน`);
            continue;
          }

          const firstName = get("firstName") || "";
          const lastName = get("lastName") || "";
          let fullName = get("fullName");
          if (!fullName && firstName) {
            fullName = `${firstName} ${lastName}`.trim();
          }
          if (!fullName) {
            results.errors.push(`แถว ${rowNum}: ไม่มีชื่อพนักงาน`);
            continue;
          }

          const salary = get("baseSalary");
          const startDate = get("startDate");
          let parsedStartDate: string | null = null;
          if (startDate) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
              parsedStartDate = startDate;
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(startDate)) {
              const [d, m, y] = startDate.split("/");
              let yr = parseInt(y);
              if (yr > 2500) yr -= 543;
              parsedStartDate = `${yr}-${m}-${d}`;
            } else {
              const dateNum = Number(startDate);
              if (!isNaN(dateNum) && dateNum > 30000) {
                const excelEpoch = new Date(1899, 11, 30);
                const jsDate = new Date(excelEpoch.getTime() + dateNum * 86400000);
                parsedStartDate = jsDate.toISOString().split("T")[0];
              }
            }
          }

          const birthDateRaw = get("birthDate");
          let parsedBirthDate: string | null = null;
          if (birthDateRaw) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(birthDateRaw)) {
              parsedBirthDate = birthDateRaw;
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(birthDateRaw)) {
              const [d, m, y] = birthDateRaw.split("/");
              let yr = parseInt(y);
              if (yr > 2500) yr -= 543;
              parsedBirthDate = `${yr}-${m}-${d}`;
            } else {
              const dateNum = Number(birthDateRaw);
              if (!isNaN(dateNum) && dateNum > 30000) {
                const excelEpoch = new Date(1899, 11, 30);
                const jsDate = new Date(excelEpoch.getTime() + dateNum * 86400000);
                parsedBirthDate = jsDate.toISOString().split("T")[0];
              }
            }
          }

          const deptName = get("department")?.trim() || null;
          if (deptName) {
            const companyIds = (req as any).companyIds || [];
            const targetCompanyId = (req as any).companyId || companyIds[0];
            if (targetCompanyId && companyIds.includes(targetCompanyId)) {
              const existingDept = await db.select().from(departments)
                .where(and(sql`lower(${departments.name}) = lower(${deptName})`, eq(departments.companyId, targetCompanyId)))
                .limit(1);
              if (existingDept.length === 0) {
                await db.insert(departments).values({ name: deptName, companyId: targetCompanyId });
              }
            }
          }

          const importUser = req.user as any;
          const empData: any = {
            employeeCode,
            fullName,
            titlePrefix: get("titlePrefix") || null,
            firstName: firstName || null,
            lastName: lastName || null,
            idCardNumber: get("idCardNumber") || null,
            taxId: get("taxId") || null,
            address: get("address") || null,
            position: get("position") || null,
            department: deptName || null,
            baseSalary: salary ? String(parseFloat(String(salary).replace(/,/g, "")) || 0) : "0",
            startDate: parsedStartDate,
            phone: get("phone") || null,
            email: get("email") || null,
            incomeType: ["1", "2"].includes(get("incomeType") || "") ? get("incomeType") : "1",
            nickname: get("nickname") || null,
            dateOfBirth: parsedBirthDate,
            bankName: get("bankName") || null,
            bankAccountNumber: get("bankAccountNumber") || null,
            lineUserId: get("lineUserId") || null,
            active: true,
            tenantId: importUser.tenantId || null,
            companyId: req.body?.companyId ? Number(req.body.companyId) : null,
          };

          if (!empData.companyId) {
            results.errors.push(`แถว ${rowNum}: ไม่ระบุบริษัท`);
            continue;
          }
          const existing = await db.select().from(employees).where(and(eq(employees.employeeCode, employeeCode), eq(employees.companyId, empData.companyId))).limit(1);
          if (existing.length > 0) {
            await db.update(employees).set(empData).where(eq(employees.id, existing[0].id));
            results.updated++;
          } else {
            await db.insert(employees).values(empData);
            results.created++;
          }
        } catch (err: any) {
          results.errors.push(`แถว ${rowNum}: ${err.message}`);
        }
      }

      res.json({
        message: `นำเข้าสำเร็จ: เพิ่มใหม่ ${results.created} คน, อัพเดต ${results.updated} คน${results.errors.length > 0 ? `, มีข้อผิดพลาด ${results.errors.length} รายการ` : ""}`,
        created: results.created,
        updated: results.updated,
        errors: results.errors,
      });
    } catch (err: any) {
      res.status(500).json({ message: `เกิดข้อผิดพลาด: ${err.message}` });
    }
  });

  // ===== Departments CRUD =====
  app.get("/api/departments", requireAuth, async (req, res) => {
    const user = req.user as any;
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    const userCompanies = await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, user.tenantId));
    const companyIds = userCompanies.map(c => c.id);
    if (companyIds.length === 0) return res.json([]);
    const allDepts = await db.select().from(departments)
      .where(companyId ? and(eq(departments.companyId, companyId), inArray(departments.companyId, companyIds)) : inArray(departments.companyId, companyIds))
      .orderBy(asc(departments.name));
    res.json(allDepts);
  });

  app.post("/api/departments", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const { name, description, companyId } = req.body;
      if (!name) return res.status(400).json({ message: "กรุณาระบุชื่อแผนก" });
      const firmCompany = await db.select().from(companies).where(and(eq(companies.tenantId, user.tenantId), eq(companies.isPrimary, true))).then(r => r[0]);
      const targetCompanyId = companyId || firmCompany?.id;
      if (!targetCompanyId) return res.status(400).json({ message: "ไม่พบบริษัท" });
      const [dept] = await db.insert(departments).values({ name, description: description || null, companyId: targetCompanyId }).returning();
      res.json(dept);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/departments/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      const userCompanies = await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, user.tenantId));
      const companyIds = userCompanies.map(c => c.id);
      const { name, description, active } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (active !== undefined) updates.active = active;
      const [dept] = await db.update(departments).set(updates).where(and(eq(departments.id, id), inArray(departments.companyId, companyIds))).returning();
      if (!dept) return res.status(404).json({ message: "ไม่พบแผนก" });
      res.json(dept);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/departments/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      const userCompanies = await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, user.tenantId));
      const companyIds = userCompanies.map(c => c.id);
      await db.delete(departments).where(and(eq(departments.id, id), inArray(departments.companyId, companyIds)));
      res.json({ message: "ลบแผนกสำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/branches", requireAuth, async (req, res) => {
    const user = req.user as any;
    const companyId = req.query.companyId ? Number(req.query.companyId) : null;
    const userCompanies = await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, user.tenantId));
    const companyIds = userCompanies.map(c => c.id);
    if (companyIds.length === 0) return res.json([]);
    const allBranches = await db.select().from(branches)
      .where(companyId ? and(eq(branches.companyId, companyId), inArray(branches.companyId, companyIds)) : inArray(branches.companyId, companyIds))
      .orderBy(asc(branches.code));
    res.json(allBranches);
  });

  app.post("/api/branches", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { code, name, address, taxId, companyId } = req.body;
      if (!code || !name) return res.status(400).json({ message: "กรุณาระบุรหัสและชื่อสาขา" });
      const userCompanies = await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, user.tenantId));
      const companyIds = userCompanies.map(c => c.id);
      const targetCompanyId = companyId || companyIds[0];
      if (!targetCompanyId || !companyIds.includes(targetCompanyId)) return res.status(400).json({ message: "ไม่พบบริษัท" });
      const [branch] = await db.insert(branches).values({ code, name, address: address || null, taxId: taxId || null, companyId: targetCompanyId }).returning();
      res.json(branch);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/branches/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      const userCompanies = await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, user.tenantId));
      const companyIds = userCompanies.map(c => c.id);
      const { code, name, address, taxId, active } = req.body;
      const updates: any = {};
      if (code !== undefined) updates.code = code;
      if (name !== undefined) updates.name = name;
      if (address !== undefined) updates.address = address;
      if (taxId !== undefined) updates.taxId = taxId;
      if (active !== undefined) updates.active = active;
      const [branch] = await db.update(branches).set(updates).where(and(eq(branches.id, id), inArray(branches.companyId, companyIds))).returning();
      if (!branch) return res.status(404).json({ message: "ไม่พบสาขา" });
      res.json(branch);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/branches/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      const userCompanies = await db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, user.tenantId));
      const companyIds = userCompanies.map(c => c.id);
      await db.delete(branches).where(and(eq(branches.id, id), inArray(branches.companyId, companyIds)));
      res.json({ message: "ลบสาขาสำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/employees/:id", requireAuth, requireModule("hr"), async (req, res) => {
    const user = req.user as any;
    const emp = await storage.getEmployee(Number(req.params.id));
    if (!emp) return res.status(404).json({ message: "ไม่พบพนักงาน" });
    if (user.tenantId && emp.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
    const { tenantId: _t, ...body } = req.body;
    const employee = await storage.updateEmployee(emp.id, body);
    res.json(employee);
  });

  app.delete("/api/employees/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role !== "admin" && user.role !== "super_admin" && user.role !== "owner") {
        return res.status(403).json({ message: "เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบพนักงานได้" });
      }
      const id = Number(req.params.id);
      const emp = await storage.getEmployee(id);
      if (!emp) return res.status(404).json({ message: "ไม่พบพนักงาน" });
      if (user.tenantId && emp.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

      const [attCount] = await db.select({ cnt: sql<number>`count(*)` }).from(attendanceRecords).where(eq(attendanceRecords.employeeId, id));
      const [otCount] = await db.select({ cnt: sql<number>`count(*)` }).from(otRecords).where(eq(otRecords.employeeId, id));
      const [payCount] = await db.select({ cnt: sql<number>`count(*)` }).from(payrollRecords).where(eq(payrollRecords.employeeId, id));
      const deps = [];
      if (Number(attCount?.cnt) > 0) deps.push(`ลงเวลา ${attCount.cnt} รายการ`);
      if (Number(otCount?.cnt) > 0) deps.push(`OT ${otCount.cnt} รายการ`);
      if (Number(payCount?.cnt) > 0) deps.push(`เงินเดือน ${payCount.cnt} รายการ`);
      if (deps.length > 0) {
        return res.status(409).json({ message: `ไม่สามารถลบได้ พนักงานมีข้อมูลที่เกี่ยวข้อง: ${deps.join(", ")}` });
      }

      const tableExists = async (tx: any, tableName: string) => {
        const r = await tx.execute(sql`SELECT to_regclass(${tableName}) AS cls`);
        return r.rows?.[0]?.cls != null;
      };

      await db.transaction(async (tx) => {
        await tx.update(firmClients).set({ assignedTo: null }).where(eq(firmClients.assignedTo, id));
        await tx.delete(firmClientTeam).where(eq(firmClientTeam.employeeId, id));
        await tx.update(workStatusRows).set({ assignedEmployeeId: null }).where(eq(workStatusRows.assignedEmployeeId, id));
        await tx.delete(leaveRequests).where(eq(leaveRequests.employeeId, id));
        await tx.delete(taskAssignees).where(eq(taskAssignees.employeeId, id));
        if (await tableExists(tx, "commission_records")) {
          await tx.delete(commissionRecords).where(eq(commissionRecords.employeeId, id));
        }
        if (await tableExists(tx, "evaluation_results")) {
          await tx.delete(evaluationResults).where(eq(evaluationResults.employeeId, id));
        }
        await tx.delete(employees).where(eq(employees.id, id));
      });

      logActivity({
        companyId: emp.companyId || 0,
        tenantId: emp.tenantId || undefined,
        userId: user.id,
        userName: user.username,
        action: "delete",
        entityType: "employee",
        entityId: String(id),
        entityName: emp.fullName || `${emp.firstName} ${emp.lastName}`,
        details: `ลบพนักงาน รหัส ${emp.employeeCode || "-"}`,
      }).catch(() => {});

      res.json({ message: "ลบพนักงานสำเร็จ" });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "ไม่สามารถลบพนักงานได้" });
    }
  });

  app.get("/api/attendance/:employeeId", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const empId = Number(req.params.employeeId);
      const [emp] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, empId));
      if (!emp) return res.status(404).json({ message: "ไม่พบพนักงาน" });
      const ac = await checkDocOwnership(emp.companyId, req.user);
      if (!ac.allowed) return res.status(403).json({ message: ac.message });
      const records = await storage.getAttendanceByEmployee(empId);
      res.json(records);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/attendance/check-in", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const { employeeId, lat, lng } = req.body;
      if (!employeeId) {
        console.log(`[check-in] REJECT emp=${employeeId}: no employeeId`);
        return res.status(400).json({ message: "กรุณาระบุพนักงาน" });
      }

      const user = req.user as any;
      const companyId = user.companyId;
      let matchedLocationId: number | null = null;
      if (companyId) {
        const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
        if (company && company.gpsRequired) {
          if (lat == null || lng == null) {
            console.log(`[check-in] REJECT emp=${employeeId}: GPS not provided (gpsRequired=true)`);
            return res.status(400).json({ message: "กรุณาเปิด GPS เพื่อลงเวลา" });
          }
          const locations = await db.select().from(workLocations).where(and(eq(workLocations.companyId, companyId), eq(workLocations.active, true)));
          if (locations.length > 0) {
            const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
            const checkLocations = emp?.workLocationId
              ? locations.filter(l => l.id === emp.workLocationId)
              : locations;
            const matched = checkLocations.find(loc => {
              const distance = haversineDistance(Number(lat), Number(lng), Number(loc.lat), Number(loc.lng));
              return distance <= (loc.radiusMeters || 200);
            }) || (emp?.workLocationId ? locations.find(loc => {
              const distance = haversineDistance(Number(lat), Number(lng), Number(loc.lat), Number(loc.lng));
              return distance <= (loc.radiusMeters || 200);
            }) : null);
            if (!matched) {
              const dists = locations.map(loc => ({ name: loc.name, dist: Math.round(haversineDistance(Number(lat), Number(lng), Number(loc.lat), Number(loc.lng))) }));
              console.log(`[check-in] REJECT emp=${employeeId}: outside all locations. lat=${lat} lng=${lng} distances=${JSON.stringify(dists)}`);
              return res.status(400).json({ message: "คุณอยู่นอกรัศมีสถานที่ลงเวลาทั้งหมด ไม่สามารถลงเวลาได้" });
            }
            matchedLocationId = matched.id;
          } else if (company.officeLat && company.officeLng) {
            const distance = haversineDistance(Number(lat), Number(lng), Number(company.officeLat), Number(company.officeLng));
            const radius = company.gpsRadiusMeters || 200;
            if (distance > radius) {
              console.log(`[check-in] REJECT emp=${employeeId}: outside office radius. dist=${Math.round(distance)}m, radius=${radius}m`);
              return res.status(400).json({ message: "คุณอยู่นอกรัศมีสำนักงาน ไม่สามารถลงเวลาได้" });
            }
          }
        }
      }

      const now = new Date();
      const thai = toThaiDate(now);
      const today = thai.date;

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayThai = toThaiDate(yesterday);
      const yesterdayRecord = await storage.getAttendanceByDate(employeeId, yesterdayThai.date);
      if (yesterdayRecord && !yesterdayRecord.checkOut) {
        const autoCheckOut = new Date(yesterdayRecord.checkIn!);
        autoCheckOut.setHours(18, 0, 0, 0);
        await storage.updateAttendance(yesterdayRecord.id, { checkOut: autoCheckOut });
        console.log(`[check-in] AUTO-CLOSE emp=${employeeId}: yesterday ${yesterdayThai.date} had no checkout — auto-closed at 18:00. record id=${yesterdayRecord.id}`);
      }

      const existing = await storage.getAttendanceByDate(employeeId, today);
      if (existing) {
        console.log(`[check-in] REJECT emp=${employeeId}: already checked in today ${today}`);
        return res.status(400).json({ message: "ลงเวลาเข้างานแล้ววันนี้" });
      }

      let isLate = false;
      const [empData] = await db.select({ exemptFromCheckin: employees.exemptFromCheckin }).from(employees).where(eq(employees.id, employeeId));
      const [hourSettings] = await db.select().from(employeeHourSettings).where(eq(employeeHourSettings.employeeId, employeeId));
      const empAttendanceType = hourSettings?.attendanceType || "time_based";

      if (!empData?.exemptFromCheckin && empAttendanceType !== "flexible_hours") {
        const [shiftAssignment] = await db.select().from(employeeShiftAssignments)
          .where(and(eq(employeeShiftAssignments.employeeId, employeeId), eq(employeeShiftAssignments.date, today)));
        if (shiftAssignment) {
          const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftAssignment.shiftId));
          if (shift) {
            const [sh, sm] = shift.startTime.split(":").map(Number);
            const shiftStartMin = sh * 60 + (sm || 0);
            const threshold = shift.lateThresholdMinutes || 0;
            const inMin = thai.hours * 60 + thai.minutes;
            isLate = inMin > shiftStartMin + threshold;
          }
        } else {
          let schedule: any = null;
          if (companyId) {
            const schedules = await db.select().from(workSchedules)
              .where(and(eq(workSchedules.companyId, companyId), eq(workSchedules.active, true)))
              .orderBy(desc(workSchedules.isDefault));
            schedule = schedules[0] || null;
          }
          const startTime = schedule?.startTime || "09:00";
          const [sh, sm] = startTime.split(":").map(Number);
          const startMin = sh * 60 + (sm || 0);
          const threshold = schedule?.lateThresholdMinutes || 0;
          const inMin = thai.hours * 60 + thai.minutes;
          isLate = inMin > startMin + threshold;
        }
      }

      const record = await storage.createAttendance({
        employeeId,
        date: today,
        checkIn: now,
        status: isLate ? "late" : "present",
        checkInLat: lat != null ? String(lat) : null,
        checkInLng: lng != null ? String(lng) : null,
        workLocationId: matchedLocationId,
        source: (lat != null && lng != null) ? "gps" : "manual",
      });
      console.log(`[check-in] OK emp=${employeeId} date=${today} status=${isLate ? "late" : "present"} id=${record?.id}`);
      res.status(201).json(record);
    } catch (err: any) {
      console.error(`[check-in] FATAL emp=${req.body?.employeeId}:`, err.message?.slice(0, 300));
      const isDbError = err.message?.includes("connect") || err.message?.includes("timeout") || err.message?.includes("ECONNRE");
      res.status(isDbError ? 503 : 400).json({ message: isDbError ? "ระบบฐานข้อมูลขัดข้อง กรุณาลองใหม่" : err.message });
    }
  });

  app.get("/api/hr/attendance-settings/:employeeId", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const employeeId = parseInt(req.params.employeeId);
      if (isNaN(employeeId)) return res.status(400).json({ message: "invalid employeeId" });
      const [settings] = await db.select().from(employeeHourSettings).where(eq(employeeHourSettings.employeeId, employeeId));
      if (!settings) return res.json({ attendanceType: "time_based", requiredHoursPerDay: "9" });
      res.json({ attendanceType: settings.attendanceType, requiredHoursPerDay: settings.defaultHoursPerDay || "9" });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/hr/attendance-settings/:employeeId", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const employeeId = parseInt(req.params.employeeId);
      if (isNaN(employeeId)) return res.status(400).json({ message: "invalid employeeId" });
      const { attendanceType, requiredHoursPerDay } = req.body;
      const type = attendanceType || "time_based";
      const hours = requiredHoursPerDay || "9";
      const [existing] = await db.select().from(employeeHourSettings).where(eq(employeeHourSettings.employeeId, employeeId));
      if (existing) {
        await db.update(employeeHourSettings).set({ attendanceType: type, defaultHoursPerDay: hours }).where(eq(employeeHourSettings.employeeId, employeeId));
      } else {
        await db.insert(employeeHourSettings).values({ employeeId, attendanceType: type, defaultHoursPerDay: hours });
      }
      res.json({ success: true, attendanceType: type, requiredHoursPerDay: hours });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/attendance/check-out", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const { employeeId, lat, lng } = req.body;
      if (!employeeId) return res.status(400).json({ message: "กรุณาระบุพนักงาน" });

      const user = req.user as any;
      const companyId = user.companyId;
      if (companyId) {
        const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
        if (company && company.gpsRequired) {
          if (lat == null || lng == null) {
            return res.status(400).json({ message: "กรุณาเปิด GPS เพื่อลงเวลา" });
          }
          const locations = await db.select().from(workLocations).where(and(eq(workLocations.companyId, companyId), eq(workLocations.active, true)));
          if (locations.length > 0) {
            const matched = locations.find(loc => {
              const distance = haversineDistance(Number(lat), Number(lng), Number(loc.lat), Number(loc.lng));
              return distance <= (loc.radiusMeters || 200);
            });
            if (!matched) {
              return res.status(400).json({ message: "คุณอยู่นอกรัศมีสถานที่ลงเวลาทั้งหมด ไม่สามารถลงเวลาได้" });
            }
          } else if (company.officeLat && company.officeLng) {
            const distance = haversineDistance(Number(lat), Number(lng), Number(company.officeLat), Number(company.officeLng));
            const radius = company.gpsRadiusMeters || 200;
            if (distance > radius) {
              return res.status(400).json({ message: "คุณอยู่นอกรัศมีสำนักงาน ไม่สามารถลงเวลาได้" });
            }
          }
        }
      }

      const now = new Date();
      const thai = toThaiDate(now);
      const today = thai.date;
      let existing = await storage.getAttendanceByDate(employeeId, today);

      if (!existing || existing.checkOut) {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayThai = toThaiDate(yesterday);
        const prevRecord = await storage.getAttendanceByDate(employeeId, yesterdayThai.date);
        if (prevRecord && !prevRecord.checkOut) {
          existing = prevRecord;
        }
      }

      if (!existing) {
        return res.status(400).json({ message: "ยังไม่ได้ลงเวลาเข้างาน" });
      }
      if (existing.checkOut) {
        return res.status(400).json({ message: "ลงเวลาออกงานแล้ว" });
      }
      const checkInTime = new Date(existing.checkIn!);
      const diffMs = now.getTime() - checkInTime.getTime();
      const totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2);

      let status = existing.status;
      const assignmentDate = existing.date;
      const [shiftAssignment] = await db.select().from(employeeShiftAssignments)
        .where(and(eq(employeeShiftAssignments.employeeId, employeeId), eq(employeeShiftAssignments.date, assignmentDate)));
      if (shiftAssignment) {
        const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftAssignment.shiftId));
        if (shift) {
          const [endH, endM] = shift.endTime.split(":").map(Number);
          const [startH] = shift.startTime.split(":").map(Number);
          const isNightShift = endH < startH;
          const checkOutThai = toThaiDate(now);
          const coH = checkOutThai.hours;
          const coM = checkOutThai.minutes;
          let coMinutes = coH * 60 + coM;
          let endMinutes = endH * 60 + (endM || 0);
          if (isNightShift) {
            endMinutes += 24 * 60;
            if (coH < startH) coMinutes += 24 * 60;
          }
          const threshold = shift.lateThresholdMinutes || 15;
          if (coMinutes < endMinutes - threshold) {
            status = "early_leave";
          }
        }
      }

      const record = await storage.updateAttendance(existing.id, {
        checkOut: now,
        totalHours,
        status: status || existing.status,
        checkOutLat: lat != null ? String(lat) : null,
        checkOutLng: lng != null ? String(lng) : null,
      });

      if (companyId) {
        try {
          const [config] = await db.select().from(autoOtConfig).where(eq(autoOtConfig.companyId, companyId));
          if (config && config.autoOtEnabled) {
            const minOtMin = config.minOtMinutes || 30;
            const roundingMin = config.otRoundingMinutes || 30;

            const checkInTime2 = new Date(existing.checkIn!);
            const checkOutTime = now;
            const assignDate = existing.date;

            let schedEndTime = "17:30";
            let schedStartTime = "09:00";
            let workDays: string[] = ["mon", "tue", "wed", "thu", "fri"];

            const [sa] = await db.select().from(employeeShiftAssignments)
              .where(and(eq(employeeShiftAssignments.employeeId, employeeId), eq(employeeShiftAssignments.date, assignDate)));
            if (sa) {
              const [sh] = await db.select().from(shifts).where(eq(shifts.id, sa.shiftId));
              if (sh) {
                schedEndTime = sh.endTime;
                schedStartTime = sh.startTime;
              }
            } else {
              const schedules = await db.select().from(workSchedules)
                .where(and(eq(workSchedules.companyId, companyId), eq(workSchedules.active, true)))
                .orderBy(desc(workSchedules.isDefault));
              const schedule = schedules[0];
              if (schedule) {
                schedEndTime = schedule.endTime || "17:30";
                schedStartTime = schedule.startTime || "09:00";
                workDays = (schedule.workDays as string[]) || ["mon", "tue", "wed", "thu", "fri"];
              }
            }

            const dayMap: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
            const dateParts = assignDate.split("-").map(Number);
            const dateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
            const dayOfWeek = dayMap[dateObj.getDay()];
            const isDayOff = !workDays.includes(dayOfWeek);

            const [holiday] = await db.select().from(holidays)
              .where(and(eq(holidays.date, assignDate), companyId ? eq(holidays.companyId, companyId) : sql`true`));
            const isHoliday = !!holiday;

            const [endH, endM] = schedEndTime.split(":").map(Number);
            const schedEndMin = endH * 60 + (endM || 0);

            const offsetMs = 7 * 60 * 60 * 1000;
            const coThai = new Date(checkOutTime.getTime() + offsetMs);
            const coMin = coThai.getUTCHours() * 60 + coThai.getUTCMinutes();

            let otMinutes = 0;
            let otType = "regular";

            if (isDayOff || isHoliday) {
              const ciThai = new Date(checkInTime2.getTime() + offsetMs);
              const ciMin = ciThai.getUTCHours() * 60 + ciThai.getUTCMinutes();
              otMinutes = Math.max(0, coMin - ciMin);
              otType = isHoliday ? "special_holiday" : "holiday";
            } else {
              otMinutes = Math.max(0, coMin - schedEndMin);
            }

            if (otMinutes >= minOtMin) {
              const roundedMinutes = Math.floor(otMinutes / roundingMin) * roundingMin;
              if (roundedMinutes > 0) {
                const otHours = roundedMinutes / 60;

                const activeOtSettings = await db.select().from(otSettings)
                  .where(and(
                    companyId ? eq(otSettings.companyId, companyId) : sql`true`,
                    eq(otSettings.active, true)
                  ));
                const setting = activeOtSettings.find(s => s.otType === otType);
                const rate = setting ? Number(setting.rate) : (otType === "special_holiday" ? 3 : otType === "holiday" ? 3 : 1.5);

                const [emp] = await db.select({ baseSalary: employees.baseSalary }).from(employees).where(eq(employees.id, employeeId));
                const baseSalary = Number(emp?.baseSalary || 0);
                const hourlyRate = baseSalary / 30 / 8;
                const amount = +(hourlyRate * otHours * rate).toFixed(2);

                const otStartTime = isDayOff || isHoliday ? checkInTime2 : new Date(checkOutTime.getTime() - otMinutes * 60 * 1000 + (otMinutes - roundedMinutes) * 60 * 1000);
                const otEndTime = checkOutTime;

                await storage.createOt({
                  employeeId,
                  date: assignDate,
                  otType,
                  startTime: otStartTime,
                  endTime: otEndTime,
                  hours: String(otHours),
                  rate: String(rate),
                  amount: String(amount),
                  status: "pending",
                  source: "auto",
                });
              }
            }
          }
        } catch (autoOtErr: any) {
          console.error("Auto OT calculation error:", autoOtErr.message);
        }
      }

      res.json(record);
    } catch (err: any) {
      console.error(`[check-out] FATAL emp=${req.body?.employeeId}:`, err.message?.slice(0, 300));
      const isDbError = err.message?.includes("connect") || err.message?.includes("timeout") || err.message?.includes("ECONNRE");
      res.status(isDbError ? 503 : 400).json({ message: isDbError ? "ระบบฐานข้อมูลขัดข้อง กรุณาลองใหม่" : err.message });
    }
  });

  app.get("/api/attendance/birthday-check/:employeeId", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const user = req.user as any;
      if (!employeeId) return res.json({ isBirthday: false });
      const conditions = [eq(employees.id, employeeId)];
      if (user.tenantId) conditions.push(eq(employees.tenantId, user.tenantId));
      const [emp] = await db.select().from(employees).where(and(...conditions));
      if (!emp || !emp.dateOfBirth) return res.json({ isBirthday: false });
      const now = new Date();
      const offsetMs = 7 * 60 * 60 * 1000;
      const thai = new Date(now.getTime() + offsetMs);
      const todayMM = String(thai.getMonth() + 1).padStart(2, "0");
      const todayDD = String(thai.getDate()).padStart(2, "0");
      const dob = emp.dateOfBirth;
      const dobMM = dob.slice(5, 7);
      const dobDD = dob.slice(8, 10);
      const isBirthday = todayMM === dobMM && todayDD === dobDD;
      res.json({
        isBirthday,
        employeeName: emp.nickname || emp.firstName || emp.fullName,
      });
    } catch (err: any) {
      res.json({ isBirthday: false });
    }
  });

  app.get("/api/attendance/anniversary-check/:employeeId", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const employeeId = Number(req.params.employeeId);
      const user = req.user as any;
      if (!employeeId) return res.json({ isAnniversary: false });
      const conditions = [eq(employees.id, employeeId)];
      if (user.tenantId) conditions.push(eq(employees.tenantId, user.tenantId));
      const [emp] = await db.select().from(employees).where(and(...conditions));
      if (!emp || !emp.startDate) return res.json({ isAnniversary: false });
      const now = new Date();
      const offsetMs = 7 * 60 * 60 * 1000;
      const thai = new Date(now.getTime() + offsetMs);
      const todayMM = String(thai.getMonth() + 1).padStart(2, "0");
      const todayDD = String(thai.getDate()).padStart(2, "0");
      const todayYYYY = thai.getFullYear();
      const sd = emp.startDate;
      const sdMM = sd.slice(5, 7);
      const sdDD = sd.slice(8, 10);
      const sdYYYY = Number(sd.slice(0, 4));
      const sameDay = todayMM === sdMM && todayDD === sdDD;
      const years = todayYYYY - sdYYYY;
      const isAnniversary = sameDay && years >= 1;
      res.json({
        isAnniversary,
        years,
        employeeName: emp.nickname || emp.firstName || emp.fullName,
      });
    } catch (err: any) {
      res.json({ isAnniversary: false });
    }
  });

  app.get("/api/attendance-report", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;
      if (!dateFrom || !dateTo) return res.status(400).json({ message: "dateFrom and dateTo required" });

      let reportCompanyId = req.query.companyId ? Number(req.query.companyId) : undefined;
      // Security: manager/employee must be scoped to their own company when companyId not provided
      if (!reportCompanyId && !isFullAccessRole(user.role)) {
        const myEmpRecord = await storage.getEmployeeByUserId(user.id);
        if (myEmpRecord?.companyId) reportCompanyId = myEmpRecord.companyId;
      }
      const allEmps = await storage.getEmployees(tenantId, reportCompanyId);
      let activeEmps = allEmps.filter((e: any) => e.employmentStatus !== "resigned" && e.active !== false && !e.exemptFromCheckin);

      if (!isPrivilegedRole(user.role)) {
        const viewingOwn = await isViewingOwnCompany(user.id, reportCompanyId);
        if (viewingOwn) {
          const myEmp = allEmps.find((e: any) => e.userId === user.id);
          if (!myEmp) return res.json({ rows: [], summary: { total: 0, present: 0, late: 0, absent: 0, earlyLeaving: 0, totalOtMinutes: 0 } });
          activeEmps = [myEmp];
        }
      }

      let schedule: any = null;
      if (reportCompanyId) {
        const schedules = await db.select().from(workSchedules)
          .where(and(eq(workSchedules.companyId, reportCompanyId), eq(workSchedules.active, true)))
          .orderBy(desc(workSchedules.isDefault));
        schedule = schedules[0] || null;
      }

      const workDays: string[] = schedule?.workDays || ["mon", "tue", "wed", "thu", "fri"];
      const parseTime = (t: string) => {
        const [h, m] = (t || "09:00").split(":").map(Number);
        return h * 60 + (m || 0);
      };
      const workStart = parseTime(schedule?.startTime || "09:00");
      const workEnd = parseTime(schedule?.endTime || "18:00");
      const lateThreshold = schedule?.lateThresholdMinutes || 0;

      const dateFromYear = new Date(dateFrom).getFullYear();
      const dateToYear = new Date(dateTo).getFullYear();
      let companyHolidays: any[] = [];
      if (reportCompanyId) {
        companyHolidays = await storage.getHolidays(reportCompanyId, dateFromYear);
        if (dateToYear !== dateFromYear) {
          const extraHolidays = await storage.getHolidays(reportCompanyId, dateToYear);
          companyHolidays = [...companyHolidays, ...extraHolidays];
        }
      }
      const normalizeDate = (val: any): string => {
        if (val instanceof Date) {
          return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
        }
        return String(val).slice(0, 10);
      };
      const holidayDates = new Set(companyHolidays.map((h: any) => normalizeDate(h.date)));
      const holidayNameMap = new Map<string, string>();
      for (const h of companyHolidays) {
        holidayNameMap.set(normalizeDate(h.date), h.name);
      }

      const dayNameMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const isWorkDay = (dateStr: string) => {
        if (holidayDates.has(dateStr)) return false;
        const d = new Date(dateStr + "T00:00:00");
        const dayName = dayNameMap[d.getDay()];
        return workDays.includes(dayName);
      };

      const empIds = allEmps.map((e: any) => e.id);
      if (empIds.length === 0) return res.json({ rows: [], summary: { total: 0, present: 0, late: 0, absent: 0, earlyLeaving: 0, totalOtMinutes: 0 } });

      const conditions = [
        gte(attendanceRecords.date, dateFrom),
        lte(attendanceRecords.date, dateTo),
        inArray(attendanceRecords.employeeId, empIds),
      ];
      const records = await db.select().from(attendanceRecords)
        .where(and(...conditions))
        .orderBy(asc(attendanceRecords.date), asc(attendanceRecords.employeeId));

      const otConditions = [
        gte(otRecords.date, dateFrom),
        lte(otRecords.date, dateTo),
        eq(otRecords.status, "approved"),
        inArray(otRecords.employeeId, empIds),
      ];
      const ots = await db.select().from(otRecords).where(and(...otConditions));
      const otMap = new Map<string, number>();
      for (const ot of ots) {
        const key = `${ot.employeeId}-${normalizeDate(ot.date)}`;
        otMap.set(key, (otMap.get(key) || 0) + Number(ot.hours || 0));
      }

      const empMap = new Map<number, any>();
      for (const e of activeEmps) empMap.set(e.id, e);

      const attMap = new Map<string, any>();
      for (const r of records) {
        attMap.set(`${r.employeeId}-${normalizeDate(r.date)}`, r);
      }

      let shiftAssignmentMap = new Map<string, any>();
      let shiftMap = new Map<number, any>();
      if (empIds.length > 0) {
        const sa = await db.select().from(employeeShiftAssignments)
          .where(and(
            inArray(employeeShiftAssignments.employeeId, empIds),
            gte(employeeShiftAssignments.date, dateFrom),
            lte(employeeShiftAssignments.date, dateTo),
          ));
        for (const a of sa) {
          shiftAssignmentMap.set(`${a.employeeId}-${normalizeDate(a.date)}`, a);
        }
        const shiftIds = [...new Set(sa.map(a => a.shiftId))];
        if (shiftIds.length > 0) {
          const allShifts = await db.select().from(shifts).where(inArray(shifts.id, shiftIds));
          for (const s of allShifts) shiftMap.set(s.id, s);
        }
      }

      const fmtDuration = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
      };

      const report: any[] = [];
      const start = new Date(dateFrom + "T00:00:00");
      const end = new Date(dateTo + "T00:00:00");

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const workDay = isWorkDay(dateStr);
        const holidayName = holidayNameMap.get(dateStr);

        for (const emp of activeEmps) {
          const key = `${emp.id}-${dateStr}`;
          const r = attMap.get(key);
          const otKey = key;
          const otHours = otMap.get(otKey) || 0;
          const otH = Math.floor(otHours);
          const otM = Math.round((otHours - otH) * 60);

          const sa = shiftAssignmentMap.get(key);
          const empShift = sa ? shiftMap.get(sa.shiftId) : null;

          if (r) {
            const checkInTime = r.checkIn ? new Date(r.checkIn) : null;
            const checkOutTime = r.checkOut ? new Date(r.checkOut) : null;
            const thaiIn = checkInTime ? toThaiDate(checkInTime) : null;
            const thaiOut = checkOutTime ? toThaiDate(checkOutTime) : null;
            const checkInStr = thaiIn ? `${String(thaiIn.hours).padStart(2, "0")}:${String(thaiIn.minutes).padStart(2, "0")}:00` : "00:00:00";
            const checkOutStr = thaiOut ? `${String(thaiOut.hours).padStart(2, "0")}:${String(thaiOut.minutes).padStart(2, "0")}:00` : "00:00:00";
            const empWorkStart = empShift ? (() => { const [h,m] = empShift.startTime.split(":").map(Number); return h*60+(m||0); })() : workStart;
            const empWorkEnd = empShift ? (() => { const [h,m] = empShift.endTime.split(":").map(Number); return h*60+(m||0); })() : workEnd;
            const empLateThreshold = empShift ? (empShift.lateThresholdMinutes || 0) : lateThreshold;

            let lateMinutes = 0;
            if (thaiIn) {
              const inMin = thaiIn.hours * 60 + thaiIn.minutes;
              if (inMin > empWorkStart + empLateThreshold) lateMinutes = inMin - empWorkStart;
            }

            let earlyMinutes = 0;
            if (thaiOut) {
              let outMin = thaiOut.hours * 60 + thaiOut.minutes;
              let effectiveEnd = empWorkEnd;
              if (empShift && empWorkEnd < empWorkStart) {
                effectiveEnd = empWorkEnd + 24 * 60;
                if (thaiOut.hours < empShift.startTime.split(":").map(Number)[0]) outMin += 24 * 60;
              }
              if (outMin < effectiveEnd && outMin > 0) earlyMinutes = effectiveEnd - outMin;
            }

            const statusMap: Record<string, string> = { present: "Present", late: "Late", absent: "Absent", leave: "Leave", half_day: "Half Day", early_leave: "Early Leave" };
            let status = statusMap[r.status] || r.status;
            if (!workDay && (r.status === "present" || r.status === "late")) {
              status = holidayName ? "Holiday OT" : "Day Off OT";
            }

            report.push({
              recordId: r.id,
              employeeId: emp.id,
              employeeName: emp.fullName || `Employee #${emp.id}`,
              date: dateStr,
              status,
              clockIn: checkInStr,
              clockOut: checkOutStr,
              late: fmtDuration(lateMinutes),
              earlyLeaving: fmtDuration(earlyMinutes),
              overtime: `${String(otH).padStart(2, "0")}:${String(otM).padStart(2, "0")}:00`,
              isHoliday: !!holidayName,
              isDayOff: !workDay,
              holidayName: holidayName || null,
              shiftName: empShift?.name || null,
              shiftColor: empShift?.color || null,
            });
          } else if (workDay) {
            report.push({
              employeeId: emp.id,
              employeeName: emp.fullName || `Employee #${emp.id}`,
              date: dateStr,
              status: "Absent",
              clockIn: "00:00:00",
              clockOut: "00:00:00",
              late: "00:00:00",
              earlyLeaving: "00:00:00",
              overtime: `${String(otH).padStart(2, "0")}:${String(otM).padStart(2, "0")}:00`,
              isHoliday: false,
              isDayOff: false,
              holidayName: null,
              shiftName: empShift?.name || null,
              shiftColor: empShift?.color || null,
              otWarning: otHours > 0 ? "มี OT อนุมัติแล้วแต่ไม่มีลงเวลา" : null,
            });
          } else {
            if (otHours > 0) {
              report.push({
                employeeId: emp.id,
                employeeName: emp.fullName || `Employee #${emp.id}`,
                date: dateStr,
                status: holidayName ? "Holiday" : "Day Off",
                clockIn: "00:00:00",
                clockOut: "00:00:00",
                late: "00:00:00",
                earlyLeaving: "00:00:00",
                overtime: `${String(otH).padStart(2, "0")}:${String(otM).padStart(2, "0")}:00`,
                isHoliday: !!holidayName,
                isDayOff: true,
                holidayName: holidayName || null,
                shiftName: empShift?.name || null,
                shiftColor: empShift?.color || null,
              });
            }
          }
        }
      }

      report.sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/attendance/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) {
        return res.status(403).json({ message: "เฉพาะผู้จัดการ/แอดมินเท่านั้น" });
      }
      const id = Number(req.params.id);
      const { checkIn, checkOut, clearCheckOut, note } = req.body;
      const [existing] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, id)).limit(1);
      if (!existing) return res.status(404).json({ message: "ไม่พบบันทึกการลงเวลา" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

      const updates: any = {};
      if (note !== undefined) updates.note = note;

      if (clearCheckOut) {
        updates.checkOut = null;
        updates.checkOutLat = null;
        updates.checkOutLng = null;
        updates.totalHours = null;
        updates.status = "present";
      } else {
        if (checkIn !== undefined) {
          if (checkIn) {
            const d = new Date(existing.date + "T" + checkIn + ":00+07:00");
            updates.checkIn = d;
          } else {
            updates.checkIn = null;
          }
        }
        if (checkOut !== undefined) {
          if (checkOut) {
            const d = new Date(existing.date + "T" + checkOut + ":00+07:00");
            updates.checkOut = d;
          } else {
            updates.checkOut = null;
            updates.checkOutLat = null;
            updates.checkOutLng = null;
          }
        }
      }

      if (updates.checkIn && updates.checkOut) {
        const diff = (new Date(updates.checkOut).getTime() - new Date(updates.checkIn).getTime()) / 3600000;
        updates.totalHours = String(Math.max(0, diff).toFixed(2));
      } else if (existing.checkIn && updates.checkOut) {
        const diff = (new Date(updates.checkOut).getTime() - new Date(existing.checkIn).getTime()) / 3600000;
        updates.totalHours = String(Math.max(0, diff).toFixed(2));
      }

      const [updated] = await db.update(attendanceRecords).set(updates).where(eq(attendanceRecords.id, id)).returning();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/attendance/admin-create", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) {
        return res.status(403).json({ message: "เฉพาะผู้จัดการ/แอดมินเท่านั้น" });
      }
      const { employeeId, date, checkIn, checkOut, note } = req.body;
      if (!employeeId || !date) {
        return res.status(400).json({ message: "กรุณาระบุพนักงานและวันที่" });
      }

      const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
      if (!emp) return res.status(404).json({ message: "ไม่พบพนักงาน" });
      { const ac = await checkDocOwnership(emp.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

      const existing = await storage.getAttendanceByDate(employeeId, date);
      if (existing) {
        return res.status(400).json({ message: "พนักงานมีบันทึกลงเวลาวันนี้แล้ว กรุณาใช้ปุ่มแก้ไขแทน" });
      }

      let checkInDate: Date | null = null;
      let checkOutDate: Date | null = null;
      let totalHours: string | null = null;
      let status = "present";

      if (checkIn) {
        checkInDate = new Date(date + "T" + checkIn + ":00+07:00");
        let isLate = false;
        const companyId = emp.companyId;
        const [shiftAssignment] = await db.select().from(employeeShiftAssignments)
          .where(and(eq(employeeShiftAssignments.employeeId, employeeId), eq(employeeShiftAssignments.date, date)));
        if (shiftAssignment) {
          const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftAssignment.shiftId));
          if (shift) {
            const [sh, sm] = shift.startTime.split(":").map(Number);
            const shiftStartMin = sh * 60 + (sm || 0);
            const threshold = shift.lateThresholdMinutes || 0;
            const [ih, im] = checkIn.split(":").map(Number);
            isLate = (ih * 60 + (im || 0)) > shiftStartMin + threshold;
          }
        } else if (companyId) {
          const schedules = await db.select().from(workSchedules)
            .where(and(eq(workSchedules.companyId, companyId), eq(workSchedules.active, true)))
            .orderBy(desc(workSchedules.isDefault));
          const schedule = schedules[0] || null;
          const startTime = schedule?.startTime || "09:00";
          const [sh, sm] = startTime.split(":").map(Number);
          const startMin = sh * 60 + (sm || 0);
          const threshold = schedule?.lateThresholdMinutes || 0;
          const [ih, im] = checkIn.split(":").map(Number);
          isLate = (ih * 60 + (im || 0)) > startMin + threshold;
        }
        status = isLate ? "late" : "present";
      }

      if (checkOut && checkInDate) {
        checkOutDate = new Date(date + "T" + checkOut + ":00+07:00");
        const diff = (checkOutDate.getTime() - checkInDate.getTime()) / 3600000;
        totalHours = String(Math.max(0, diff).toFixed(2));
      }

      const record = await storage.createAttendance({
        employeeId,
        date,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        totalHours,
        status,
        source: "manual",
        note: note || "Admin เพิ่มเวลาย้อนหลัง",
      });
      res.status(201).json(record);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/ot", requireAuth, requireModule("hr"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    const user = req.user as any;
    const tenantId = user.tenantId;
    let companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    // Security: non-admin must be scoped to their own company when companyId not provided
    if (!companyId && !isFullAccessRole(user.role)) {
      const myEmpRecord = await storage.getEmployeeByUserId(user.id);
      if (myEmpRecord?.companyId) companyId = myEmpRecord.companyId;
    }
    let records = await storage.getAllOt(tenantId, companyId);
    if (user.role === "employee") {
      const myEmp = await storage.getEmployeeByUserId(user.id);
      if (myEmp) {
        records = records.filter((r: any) => r.employeeId === myEmp.id);
      } else {
        records = [];
      }
    }
    const empIds = [...new Set(records.map((r: any) => r.employeeId))];
    const empList = empIds.length > 0
      ? await db.select({ id: employees.id, fullName: employees.fullName, employeeCode: employees.employeeCode }).from(employees).where(inArray(employees.id, empIds))
      : [];
    const empMap: Record<number, { fullName: string; employeeCode: string }> = {};
    empList.forEach(e => { empMap[e.id] = { fullName: e.fullName, employeeCode: e.employeeCode }; });
    const otDates = records.map((r: any) => r.date);
    const otEmpIds = [...new Set(records.map((r: any) => r.employeeId))];
    let attDateSet = new Set<string>();
    if (otDates.length > 0 && otEmpIds.length > 0) {
      const attRows = await db.select({ employeeId: attendanceRecords.employeeId, date: attendanceRecords.date })
        .from(attendanceRecords)
        .where(and(
          inArray(attendanceRecords.employeeId, otEmpIds),
          inArray(attendanceRecords.date, otDates)
        ));
      attRows.forEach((a: any) => {
        const d = a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10);
        attDateSet.add(`${a.employeeId}_${d}`);
      });
    }
    const enriched = records.map((r: any) => {
      const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      return {
        ...r,
        employeeName: empMap[r.employeeId]?.fullName || null,
        employeeCode: empMap[r.employeeId]?.employeeCode || null,
        hasAttendance: attDateSet.has(`${r.employeeId}_${d}`),
      };
    });
    res.json(enriched);
  });

  app.get("/api/ot/:employeeId", requireAuth, requireModule("hr"), async (req, res) => {
    const empId = Number(req.params.employeeId);
    const records = await storage.getOtByEmployee(empId);
    const otDates = records.map((r: any) => r.date);
    let attDateSet = new Set<string>();
    if (otDates.length > 0) {
      const attRows = await db.select({ date: attendanceRecords.date })
        .from(attendanceRecords)
        .where(and(
          eq(attendanceRecords.employeeId, empId),
          inArray(attendanceRecords.date, otDates)
        ));
      attRows.forEach((a: any) => {
        const d = a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10);
        attDateSet.add(d);
      });
    }
    const enriched = records.map((r: any) => {
      const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      return { ...r, hasAttendance: attDateSet.has(d) };
    });
    res.json(enriched);
  });

  app.post("/api/ot/calculate", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const { date, startTime, endTime, companyId: reqCompanyId } = req.body;
      if (!date || !startTime || !endTime) return res.status(400).json({ message: "กรุณาระบุวันที่และเวลา" });

      const cid = reqCompanyId ? Number(reqCompanyId) : undefined;

      let schedule: any = null;
      if (cid) {
        const schedules = await db.select().from(workSchedules)
          .where(and(eq(workSchedules.companyId, cid), eq(workSchedules.active, true)))
          .orderBy(desc(workSchedules.isDefault));
        schedule = schedules[0] || null;
      }

      const workDayList: string[] = schedule?.workDays || ["mon", "tue", "wed", "thu", "fri"];
      const schedStart = schedule?.startTime || "09:00";
      const schedEnd = schedule?.endTime || "18:00";
      const [wsH, wsM] = schedStart.split(":").map(Number);
      const [weH, weM] = schedEnd.split(":").map(Number);
      const workStartMin = wsH * 60 + (wsM || 0);
      const workEndMin = weH * 60 + (weM || 0);

      const dateStr = String(date).split("T")[0];
      const dayNameMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const d = new Date(dateStr + "T00:00:00");
      const dayName = dayNameMap[d.getDay()];
      const isScheduledWorkDay = workDayList.includes(dayName);

      let isHoliday = false;
      let holidayName: string | null = null;
      if (cid) {
        const yr = d.getFullYear();
        const compHolidays = await storage.getHolidays(cid, yr);
        for (const h of compHolidays) {
          const hd = h.date instanceof Date ? h.date.toISOString().slice(0, 10) : String(h.date).slice(0, 10);
          if (hd === dateStr) { isHoliday = true; holidayName = h.name; break; }
        }
      }

      const isDayOff = !isScheduledWorkDay || isHoliday;

      const breakStart = schedule?.breakStartTime || "12:00";
      const breakEnd = schedule?.breakEndTime || "13:00";
      const [bsH, bsM] = breakStart.split(":").map(Number);
      const [beH, beM] = breakEnd.split(":").map(Number);
      const breakStartMin = bsH * 60 + (bsM || 0);
      const breakEndMin = beH * 60 + (beM || 0);
      const breakDuration = Math.max(0, breakEndMin - breakStartMin);

      const calcBreakOverlap = (start: number, end: number) => {
        if (breakDuration <= 0) return 0;
        const overlapStart = Math.max(start, breakStartMin);
        const overlapEnd = Math.min(end, breakEndMin);
        return Math.max(0, overlapEnd - overlapStart);
      };

      const [sH, sM] = startTime.split(":").map(Number);
      const [eH, eM] = endTime.split(":").map(Number);
      const otStartMin = sH * 60 + (sM || 0);
      const otEndMin = eH * 60 + (eM || 0);
      const totalMinutes = otEndMin - otStartMin;
      if (totalMinutes <= 0) return res.status(400).json({ message: "เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น" });

      const settingsQ = await db.select().from(otSettings).where(
        cid ? eq(otSettings.companyId, cid) : sql`true`
      );
      const getRate = (type: string) => {
        const s = settingsQ.find((s: any) => s.otType === type && s.active);
        if (s) return Number(s.rate);
        if (type === "holiday_regular") return 1;
        if (type === "holiday" || type === "special_holiday") return 3;
        return 1.5;
      };

      const breakdown: Array<{ otType: string; label: string; hours: number; rate: number }> = [];

      if (isDayOff) {
        const breakOverlap = calcBreakOverlap(otStartMin, otEndMin);
        const countableMinutes = Math.max(0, totalMinutes - breakOverlap);

        if (countableMinutes > 0) {
          const regularEndRaw = Math.min(otEndMin, workEndMin);
          const regularBreakOverlap = calcBreakOverlap(otStartMin, regularEndRaw);
          const regularMinutes = Math.max(0, Math.min(regularEndRaw, otEndMin) - otStartMin - regularBreakOverlap);
          const overtimeMinutes = Math.max(0, countableMinutes - regularMinutes);
          const regularHours = Math.round(regularMinutes / 30) * 0.5;
          const overtimeHours = Math.round(overtimeMinutes / 30) * 0.5;

          if (regularHours > 0) {
            breakdown.push({
              otType: "holiday_regular",
              label: isHoliday ? `วันหยุดนักขัตฤกษ์ (ในเวลาปกติ) - ${holidayName}` : "วันหยุด (ในเวลาปกติ)",
              hours: regularHours,
              rate: getRate("holiday_regular"),
            });
          }
          if (overtimeHours > 0) {
            breakdown.push({
              otType: isHoliday ? "special_holiday" : "holiday",
              label: isHoliday ? `วันหยุดนักขัตฤกษ์ (เกินเวลาปกติ) - ${holidayName}` : "วันหยุด (เกินเวลาปกติ)",
              hours: overtimeHours,
              rate: isHoliday ? getRate("special_holiday") : getRate("holiday"),
            });
          }
        }
      } else {
        const effectiveStart = Math.max(otStartMin, workEndMin);
        const afterWorkMinutes = Math.max(0, otEndMin - effectiveStart);
        const afterWorkHours = Math.round(afterWorkMinutes / 30) * 0.5;
        if (afterWorkHours > 0) {
          breakdown.push({
            otType: "regular",
            label: "OT วันปกติ (หลังเลิกงาน)",
            hours: afterWorkHours,
            rate: getRate("regular"),
          });
        }
      }

      res.json({
        date: dateStr,
        isDayOff,
        isHoliday,
        holidayName,
        workStart: schedStart,
        workEnd: schedEnd,
        breakdown,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/ot", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const hours = Number(req.body.hours || 0);
      if (hours <= 0) return res.status(400).json({ message: "กรุณาระบุจำนวนชั่วโมง OT" });
      const parsed = insertOtSchema.parse({
        ...req.body,
        date: req.body.date ? String(req.body.date).split("T")[0] : undefined,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
      });

      const dateStr = parsed.date ? String(parsed.date).split("T")[0] : "";
      if (dateStr && parsed.employeeId && parsed.otType) {
        const [existing] = await db.select({ id: otRecords.id, status: otRecords.status })
          .from(otRecords)
          .where(and(
            eq(otRecords.employeeId, parsed.employeeId),
            eq(otRecords.date, dateStr),
            eq(otRecords.otType, parsed.otType),
            ne(otRecords.status, "rejected"),
          ));
        if (existing) {
          return res.status(400).json({ message: `มี OT วันที่ ${dateStr} ประเภท ${parsed.otType} อยู่แล้ว (สถานะ: ${existing.status === "pending" ? "รออนุมัติ" : "อนุมัติแล้ว"})` });
        }
      }

      const record = await storage.createOt(parsed);

      const empId = parsed.employeeId;
      if (empId) {
        const [emp] = await db.select({ firstName: employees.firstName, lastName: employees.lastName, companyId: employees.companyId }).from(employees).where(eq(employees.id, empId));
        if (emp?.companyId) {
          sendHrLineNotification(emp.companyId, "ot", {
            employeeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim(),
            otDate: parsed.date ? String(parsed.date) : undefined,
            otHours: Number(parsed.hours) || 0,
            otType: (parsed as any).otType || (parsed as any).type || "-",
          }).catch(() => {});
        }
      }

      res.status(201).json(record);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/ot/batch", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { ids, status } = req.body;
      if (!ids?.length || !["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });
      }
      let updated = 0;
      const skipped: string[] = [];
      for (const id of ids) {
        if (status === "approved") {
          const [current] = await db.select().from(otRecords).where(eq(otRecords.id, Number(id)));
          if (!current) continue;
          const dateStr = current.date instanceof Date ? current.date.toISOString().slice(0, 10) : String(current.date).slice(0, 10);
          const [alreadyApproved] = await db.select({ id: otRecords.id })
            .from(otRecords)
            .where(and(
              eq(otRecords.employeeId, current.employeeId),
              eq(otRecords.date, dateStr),
              eq(otRecords.otType, current.otType),
              eq(otRecords.status, "approved"),
              ne(otRecords.id, Number(id)),
            ));
          if (alreadyApproved) {
            skipped.push(`ID ${id}: OT วันที่ ${dateStr} ซ้ำกับ ID ${alreadyApproved.id}`);
            continue;
          }
        }
        const record = await storage.updateOtStatus(Number(id), status, user.id);
        if (record) updated++;
      }
      res.json({ updated, total: ids.length, skipped });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/ot/:id/approve", requireAuth, requireModule("hr"), async (req, res) => {
    const user = req.user as any;
    const id = Number(req.params.id);
    const [current] = await db.select().from(otRecords).where(eq(otRecords.id, id));
    if (!current) return res.status(404).json({ message: "ไม่พบรายการ OT" });

    const dateStr = current.date instanceof Date ? current.date.toISOString().slice(0, 10) : String(current.date).slice(0, 10);
    const [alreadyApproved] = await db.select({ id: otRecords.id })
      .from(otRecords)
      .where(and(
        eq(otRecords.employeeId, current.employeeId),
        eq(otRecords.date, dateStr),
        eq(otRecords.otType, current.otType),
        eq(otRecords.status, "approved"),
        ne(otRecords.id, id),
      ));
    if (alreadyApproved) {
      return res.status(400).json({ message: `มี OT วันที่ ${dateStr} ประเภท ${current.otType} ที่อนุมัติแล้ว (ID: ${alreadyApproved.id}) — กรุณาปฏิเสธรายการซ้ำ` });
    }

    const record = await storage.updateOtStatus(id, "approved", user.id);
    if (!record) return res.status(404).json({ message: "ไม่พบรายการ OT" });
    res.json(record);
  });

  app.patch("/api/ot/:id/reject", requireAuth, requireModule("hr"), async (req, res) => {
    const user = req.user as any;
    const record = await storage.updateOtStatus(Number(req.params.id), "rejected", user.id);
    if (!record) return res.status(404).json({ message: "ไม่พบรายการ OT" });
    res.json(record);
  });

  app.patch("/api/ot/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager", "owner", "super_admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(otRecords).where(eq(otRecords.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบรายการ OT" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }

      const updates: Record<string, any> = {};
      if (req.body.hours !== undefined) updates.hours = String(req.body.hours);
      if (req.body.amount !== undefined) updates.amount = String(req.body.amount);
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.startTime !== undefined) updates.startTime = new Date(req.body.startTime);
      if (req.body.endTime !== undefined) updates.endTime = new Date(req.body.endTime);
      if (req.body.otType !== undefined) updates.otType = req.body.otType;
      if (req.body.rate !== undefined) updates.rate = String(req.body.rate);

      if (updates.hours && existing.employeeId) {
        const [emp] = await db.select({ baseSalary: employees.baseSalary }).from(employees).where(eq(employees.id, existing.employeeId));
        const baseSalary = Number(emp?.baseSalary || 0);
        const hourlyRate = baseSalary / 30 / 8;
        const rate = Number(updates.rate || existing.rate || 1.5);
        updates.amount = String(+(hourlyRate * Number(updates.hours) * rate).toFixed(2));
      }

      const [updated] = await db.update(otRecords)
        .set(updates)
        .where(eq(otRecords.id, id))
        .returning();

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/ot/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager", "owner", "super_admin"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(otRecords).where(eq(otRecords.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบรายการ OT" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      await db.delete(otRecords).where(eq(otRecords.id, id));
      res.json({ success: true, message: "ลบรายการ OT เรียบร้อย" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ========== OT Settings Routes ==========

  app.get("/api/ot-settings", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
      const settings = await db.select().from(otSettings).where(
        companyId ? eq(otSettings.companyId, companyId) : sql`true`
      );
      if (settings.length === 0) {
        const defaults = [
          { otType: "regular", label: "OT วันปกติ (เกินเวลา)", rate: "1.50", active: true, companyId: companyId || null },
          { otType: "holiday_regular", label: "OT วันหยุด (ในเวลาปกติ)", rate: "1.00", active: true, companyId: companyId || null },
          { otType: "holiday", label: "OT วันหยุด (เกินเวลาปกติ)", rate: "3.00", active: true, companyId: companyId || null },
          { otType: "special_holiday", label: "OT วันหยุดนักขัตฤกษ์", rate: "3.00", active: true, companyId: companyId || null },
        ];
        const inserted = [];
        for (const d of defaults) {
          const [row] = await db.insert(otSettings).values(d).returning();
          inserted.push(row);
        }
        return res.json(inserted);
      }
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/ot-settings", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role !== "admin" && user.role !== "owner" && user.role !== "super_admin") {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const items = req.body as any[];
      const results = [];
      for (const item of items) {
        if (item.id) {
          const [updated] = await db.update(otSettings)
            .set({ label: item.label, rate: String(item.rate), active: item.active })
            .where(eq(otSettings.id, item.id))
            .returning();
          results.push(updated);
        } else {
          const [created] = await db.insert(otSettings)
            .values({ otType: item.otType, label: item.label, rate: String(item.rate), active: item.active !== false, companyId: item.companyId || null })
            .returning();
          results.push(created);
        }
      }
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/ot-settings/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role !== "admin" && user.role !== "owner" && user.role !== "super_admin") {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      await db.delete(otSettings).where(eq(otSettings.id, Number(req.params.id)));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ========== Auto OT Config Routes ==========

  app.get("/api/auto-ot-config", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = user.companyId || (req.query.companyId ? Number(req.query.companyId) : undefined);
      if (!companyId) return res.json(null);
      if (req.query.companyId && Number(req.query.companyId) !== companyId && !isPrivilegedRole(user.role)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
      }
      const [config] = await db.select().from(autoOtConfig).where(eq(autoOtConfig.companyId, companyId));
      res.json(config || { companyId, autoOtEnabled: false, minOtMinutes: 30, otRoundingMinutes: 30 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.put("/api/auto-ot-config", requireAuth, requireModule("hr"), requireRole("admin", "owner", "super_admin"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, autoOtEnabled, minOtMinutes, otRoundingMinutes } = req.body;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      if (user.companyId && companyId !== user.companyId && !isPrivilegedRole(user.role)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไข" });
      }
      const safeMin = Math.max(1, Math.min(120, Number(minOtMinutes) || 30));
      const safeRounding = Math.max(1, Math.min(60, Number(otRoundingMinutes) || 30));
      const [existing] = await db.select().from(autoOtConfig).where(eq(autoOtConfig.companyId, companyId));
      if (existing) {
        const [updated] = await db.update(autoOtConfig)
          .set({ autoOtEnabled: !!autoOtEnabled, minOtMinutes: safeMin, otRoundingMinutes: safeRounding })
          .where(eq(autoOtConfig.id, existing.id))
          .returning();
        return res.json(updated);
      }
      const [created] = await db.insert(autoOtConfig)
        .values({ companyId, autoOtEnabled: !!autoOtEnabled, minOtMinutes: safeMin, otRoundingMinutes: safeRounding })
        .returning();
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ========== Leave Request Routes ==========

  app.get("/api/leaves/:employeeId", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const empId = Number(req.params.employeeId);
      const [emp] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, empId));
      if (!emp) return res.status(404).json({ message: "ไม่พบพนักงาน" });
      const ac = await checkDocOwnership(emp.companyId, req.user);
      if (!ac.allowed) return res.status(403).json({ message: ac.message });
      const records = await storage.getLeavesByEmployee(empId);
      res.json(records);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/leaves", requireAuth, requireModule("hr"), async (req, res) => {
    const user = req.user as any;
    const tenantId = user.tenantId;
    let scopedCompanyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    // Security: non-admin must be scoped to their own company
    if (!scopedCompanyId && !isFullAccessRole(user.role)) {
      const myEmpRecord = await storage.getEmployeeByUserId(user.id);
      if (myEmpRecord?.companyId) scopedCompanyId = myEmpRecord.companyId;
    }
    let records = await storage.getAllLeaves(tenantId);
    if (scopedCompanyId) {
      const companyEmps = await storage.getEmployees(undefined, scopedCompanyId);
      const empIdSet = new Set(companyEmps.map((e: any) => e.id));
      records = records.filter((r: any) => empIdSet.has(r.employeeId));
    }
    if (user.role === "employee") {
      const myEmp = await storage.getEmployeeByUserId(user.id);
      if (myEmp) {
        records = records.filter((r: any) => r.employeeId === myEmp.id);
      } else {
        records = [];
      }
    }
    res.json(records);
  });

  app.post("/api/leaves", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const parsed = insertLeaveSchema.parse(req.body);

      if (parsed.startDate && parsed.endDate && !req.body.halfDay) {
        const empId = parsed.employeeId;
        let empCompanyId: number | undefined;
        if (empId) {
          const [empRow] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, empId));
          empCompanyId = empRow?.companyId ?? undefined;
        }
        let wdArr = ["mon","tue","wed","thu","fri"];
        if (empCompanyId) {
          const [ws] = await db.select({ workDays: workSchedules.workDays }).from(workSchedules).where(eq(workSchedules.companyId, empCompanyId));
          if (ws?.workDays) wdArr = ws.workDays;
        }
        const holRows = empCompanyId
          ? await db.select({ date: holidays.date }).from(holidays).where(eq(holidays.companyId, empCompanyId))
          : [];
        const holSet = new Set(holRows.map(h => h.date));
        const DAY_MAP: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
        const s = new Date(String(parsed.startDate));
        const e = new Date(String(parsed.endDate));
        let count = 0;
        const cur = new Date(s);
        while (cur <= e) {
          const dk = DAY_MAP[cur.getDay()];
          const ds = cur.toISOString().slice(0, 10);
          if (wdArr.includes(dk) && !holSet.has(ds)) count++;
          cur.setDate(cur.getDate() + 1);
        }
        (parsed as any).days = String(count);
      }

      const record = await storage.createLeave(parsed);

      const empId = parsed.employeeId;
      if (empId) {
        const [emp] = await db.select({ firstName: employees.firstName, lastName: employees.lastName, companyId: employees.companyId }).from(employees).where(eq(employees.id, empId));
        if (emp?.companyId) {
          sendHrLineNotification(emp.companyId, "leave", {
            employeeName: `${emp.firstName || ""} ${emp.lastName || ""}`.trim(),
            leaveType: (parsed as any).leaveType || (parsed as any).type || "-",
            startDate: parsed.startDate ? String(parsed.startDate) : undefined,
            endDate: parsed.endDate ? String(parsed.endDate) : undefined,
            days: Number((parsed as any).days) || 0,
            reason: (parsed as any).reason || undefined,
          }).catch(() => {});
        }
      }

      const year = new Date(String(parsed.startDate)).getFullYear();
      await recalcLeaveBalanceUsed(record.employeeId!, (parsed as any).leaveType, year);

      res.status(201).json(record);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  async function recalcLeaveBalanceUsed(employeeId: number, leaveType: string, year: number) {
    const [result] = await db.select({
      total: sql<number>`COALESCE(SUM(${leaveRequests.days}::numeric), 0)`,
    }).from(leaveRequests).where(and(
      eq(leaveRequests.employeeId, employeeId),
      eq(leaveRequests.leaveType, leaveType),
      eq(leaveRequests.status, "approved"),
      sql`EXTRACT(YEAR FROM ${leaveRequests.startDate}::date) = ${year}`,
    ));
    const usedTotal = Number(result?.total || 0);
    const existing = await db.select().from(leaveBalances).where(and(
      eq(leaveBalances.employeeId, employeeId),
      eq(leaveBalances.year, year),
      eq(leaveBalances.leaveType, leaveType),
    ));
    if (existing.length > 0) {
      await db.update(leaveBalances).set({ used: String(usedTotal) }).where(eq(leaveBalances.id, existing[0].id));
    } else {
      await db.insert(leaveBalances).values({
        employeeId,
        year,
        leaveType,
        quota: "0",
        used: String(usedTotal),
        carriedOver: "0",
        expired: "0",
      });
    }
  }

  app.patch("/api/leaves/:id/approve", requireAuth, requireModule("hr"), async (req, res) => {
    const user = req.user as any;
    const record = await storage.updateLeaveStatus(Number(req.params.id), "approved", user.id);
    if (!record) return res.status(404).json({ message: "ไม่พบรายการลา" });
    const year = new Date(String(record.startDate)).getFullYear();
    await recalcLeaveBalanceUsed(record.employeeId!, record.leaveType, year);
    res.json(record);
  });

  app.post("/api/leaves/recalculate-days", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role !== "admin" && user.role !== "owner" && user.role !== "super_admin") {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });

      let wdArr = ["mon","tue","wed","thu","fri"];
      const [ws] = await db.select({ workDays: workSchedules.workDays }).from(workSchedules).where(eq(workSchedules.companyId, companyId));
      if (ws?.workDays) wdArr = ws.workDays;

      const holRows = await db.select({ date: holidays.date }).from(holidays).where(eq(holidays.companyId, companyId));
      const holSet = new Set(holRows.map(h => h.date));

      const DAY_MAP: Record<number, string> = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };

      const companyEmpIds = await db.select({ id: employees.id }).from(employees).where(eq(employees.companyId, companyId));
      const empIds = companyEmpIds.map(e => e.id);
      if (empIds.length === 0) return res.json({ updated: 0 });

      const allLeaves = await db.select().from(leaveRequests).where(
        inArray(leaveRequests.employeeId, empIds)
      );

      let updated = 0;
      for (const lv of allLeaves) {
        if (!lv.startDate || !lv.endDate) continue;
        const s = new Date(String(lv.startDate));
        const e = new Date(String(lv.endDate));
        if (s.getTime() === e.getTime() && Number(lv.days) === 0.5) continue;

        let count = 0;
        const cur = new Date(s);
        while (cur <= e) {
          const dk = DAY_MAP[cur.getDay()];
          const ds = cur.toISOString().slice(0, 10);
          if (wdArr.includes(dk) && !holSet.has(ds)) count++;
          cur.setDate(cur.getDate() + 1);
        }

        if (Number(lv.days) !== count) {
          await db.update(leaveRequests).set({ days: String(count) }).where(eq(leaveRequests.id, lv.id));
          updated++;
        }
      }

      const uniqueCombos = new Set<string>();
      for (const lv of allLeaves) {
        if (lv.status === "approved" && lv.startDate) {
          const year = new Date(String(lv.startDate)).getFullYear();
          uniqueCombos.add(`${lv.employeeId}|${lv.leaveType}|${year}`);
        }
      }
      for (const combo of uniqueCombos) {
        const [empId, leaveType, yearStr] = combo.split("|");
        await recalcLeaveBalanceUsed(Number(empId), leaveType, Number(yearStr));
      }

      res.json({ updated, message: `คำนวณวันลาใหม่ ${updated} รายการ` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/leaves/:id/reject", requireAuth, requireModule("hr"), async (req, res) => {
    const user = req.user as any;
    const [oldRecord] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, Number(req.params.id)));
    const record = await storage.updateLeaveStatus(Number(req.params.id), "rejected", user.id);
    if (!record) return res.status(404).json({ message: "ไม่พบรายการลา" });
    if (oldRecord?.status === "approved") {
      const year = new Date(String(record.startDate)).getFullYear();
      await recalcLeaveBalanceUsed(record.employeeId!, record.leaveType, year);
    }
    res.json(record);
  });

  app.get("/api/hrm-dashboard", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const dashCompanyId = req.query.companyId ? Number(req.query.companyId) : undefined;
      if (!dashCompanyId) return res.json({ totalEmployees: 0, totalLeaves: 0, totalEvents: 0, notClockedIn: [], holidays: [] });
      const allEmployees = await storage.getEmployees(user.tenantId, dashCompanyId);
      const activeEmployees = allEmployees.filter((e: any) => e.active && !e.exemptFromCheckin);
      const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
      const today = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth()+1).padStart(2,"0")}-${String(nowLocal.getDate()).padStart(2,"0")}`;
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth() + 1;
      const allLeaves = await storage.getAllLeaves(user.tenantId);
      const pendingLeaves = allLeaves.filter((l: any) => l.status === "approved" && l.startDate <= today && l.endDate >= today);
      const holidays = await storage.getHolidays(dashCompanyId, currentYear);

      const dayOfWeek = nowLocal.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidays.some((h: any) => h.date === today);
      const isDayOff = isWeekend || isHoliday;

      const notClockedIn: any[] = [];
      if (!isDayOff) {
        for (const emp of activeEmployees) {
          const att = await storage.getAttendanceByDate(emp.id, today);
          if (!att || !att.checkIn) {
            const isOnLeave = pendingLeaves.some((l: any) => l.employeeId === emp.id);
            notClockedIn.push({
              id: emp.id,
              fullName: emp.nickname || emp.fullName,
              position: emp.position || "-",
              status: isOnLeave ? "ลา" : "ขาด",
            });
          }
        }
      }
      const monthLeaves = allLeaves.filter((l: any) => {
        const sd = new Date(l.startDate);
        return sd.getFullYear() === currentYear && (sd.getMonth() + 1) === currentMonth && l.status === "approved";
      });
      res.json({
        totalEmployees: activeEmployees.length,
        totalLeaves: monthLeaves.length,
        totalEvents: holidays.length,
        notClockedIn,
        holidays: holidays.map((h: any) => ({ id: h.id, name: h.name, date: h.date, holidayType: h.holidayType, description: h.description })),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/holidays", requireAuth, requireModule("hr"), async (req, res) => {
    const user = req.user as any;
    const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    if (!companyId) return res.json([]);
    const year = req.query.year ? Number(req.query.year) : undefined;
    const holidays = await storage.getHolidays(companyId, year);
    res.json(holidays);
  });

  app.post("/api/holidays", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = req.body.companyId ? Number(req.body.companyId) : undefined;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const data = {
        ...req.body,
        companyId,
        createdBy: user.id,
      };
      const holiday = await storage.createHoliday(data);
      res.status(201).json(holiday);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put("/api/holidays/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    const holiday = await storage.updateHoliday(Number(req.params.id), req.body);
    if (!holiday) return res.status(404).json({ message: "ไม่พบวันหยุด" });
    res.json(holiday);
  });

  app.delete("/api/holidays/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    await storage.deleteHoliday(Number(req.params.id));
    res.json({ message: "ลบวันหยุดสำเร็จ" });
  });

  // Work Schedules
  app.get("/api/work-schedules", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = req.query.companyId ? Number(req.query.companyId) : null;
      let query;
      if (companyId) {
        query = await db.select().from(workSchedules).where(eq(workSchedules.companyId, companyId));
      } else {
        query = await db.select().from(workSchedules);
      }
      res.json(query);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/work-schedules", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const companyId = req.body.companyId ? Number(req.body.companyId) : undefined;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const data = { ...req.body, companyId };
      const [row] = await db.insert(workSchedules).values(data).returning();
      res.status(201).json(row);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.put("/api/work-schedules/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const [updated] = await db.update(workSchedules).set(req.body).where(eq(workSchedules.id, Number(req.params.id))).returning();
      if (!updated) return res.status(404).json({ message: "ไม่พบตารางเวลาทำงาน" });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/work-schedules/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    await db.delete(workSchedules).where(eq(workSchedules.id, Number(req.params.id)));
    res.json({ message: "ลบตารางเวลาทำงานสำเร็จ" });
  });

  app.get("/api/payroll-records", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!companyId || !month || !year) return res.status(400).json({ message: "กรุณาระบุ companyId, month, year" });
    if (user.tenantId) {
      const company = await storage.getCompany(companyId);
      if (!company || company.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
    }
    const records = await storage.getPayrollRecords(companyId, month, year);
    res.json(records);
  });

  app.get("/api/payroll-records/year", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    const user = req.user as any;
    const companyId = Number(req.query.companyId);
    const year = Number(req.query.year);
    if (!companyId || !year) return res.status(400).json({ message: "กรุณาระบุ companyId, year" });
    if (user.tenantId) {
      const company = await storage.getCompany(companyId);
      if (!company || company.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
    }
    const records = await storage.getPayrollRecordsByYear(companyId, year);
    res.json(records);
  });

  app.post("/api/payroll-records/batch", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, month, year, records } = req.body;
      if (!companyId || !Number.isInteger(Number(companyId))) return res.status(400).json({ message: "companyId ไม่ถูกต้อง" });
      if (user.tenantId) {
        const company = await storage.getCompany(Number(companyId));
        if (!company || company.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
      }
      if (!month || month < 1 || month > 12) return res.status(400).json({ message: "เดือนไม่ถูกต้อง" });
      if (!year || year < 2000) return res.status(400).json({ message: "ปีไม่ถูกต้อง" });
      if (!Array.isArray(records) || !records.length) return res.status(400).json({ message: "ไม่มีข้อมูลพนักงาน" });
      for (const rec of records) {
        if (!rec.employeeId || rec.baseSalary == null || rec.totalEarnings == null || rec.totalDeductions == null || rec.netPay == null) {
          return res.status(400).json({ message: "ข้อมูลเงินเดือนพนักงานไม่ครบถ้วน" });
        }
      }
      await storage.deletePayrollRecordsByMonth(companyId, month, year);
      const created = [];
      for (const rec of records) {
        const result = await storage.createPayrollRecord({
          employeeId: rec.employeeId,
          baseSalary: String(rec.baseSalary),
          otAmount: String(rec.otAmount || 0),
          commissionAmount: String(rec.commissionAmount || 0),
          otherEarnings: String(rec.otherEarnings || 0),
          totalEarnings: String(rec.totalEarnings),
          socialSecurity: String(rec.socialSecurity || 0),
          ssoEmployer: String(rec.ssoEmployer || 0),
          withholdingTax: String(rec.withholdingTax || 0),
          otherDeductions: String(rec.otherDeductions || 0),
          totalDeductions: String(rec.totalDeductions),
          netPay: String(rec.netPay),
          workDays: rec.workDays || 0,
          otHours: String(rec.otHours || 0),
          leaveDays: String(rec.leaveDays || 0),
          status: "saved",
          companyId,
          month,
          year,
          createdBy: (req as any).user?.id,
        });
        created.push(result);
      }
      res.json({ message: `บันทึกข้อมูลเงินเดือน ${created.length} รายการสำเร็จ`, records: created });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.put("/api/payroll-records/approve", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, month, year } = req.body;
      if (!companyId || !month || !year) return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
      if (user.tenantId) {
        const company = await storage.getCompany(companyId);
        if (!company || company.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
      }
      await storage.updatePayrollStatus(companyId, month, year, "approved");
      res.json({ message: "อนุมัติเงินเดือนสำเร็จ" });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/payroll-records/journal", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, month, year, paymentAccountCode, entryDate: customEntryDate } = req.body;
      if (!companyId || !month || !year) return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
      if (user.tenantId) {
        const company = await storage.getCompany(companyId);
        if (!company || company.tenantId !== user.tenantId) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
      }
      const records = await storage.getPayrollRecords(companyId, month, year);
      if (!records.length) return res.status(400).json({ message: "ไม่พบข้อมูลเงินเดือน" });

      const alreadyPosted = records.some(r => r.status === "posted");
      if (alreadyPosted) return res.status(400).json({ message: "ลงบัญชีไปแล้ว ไม่สามารถลงซ้ำได้" });

      const totals = records.reduce((acc, r) => ({
        totalEarnings: acc.totalEarnings + Number(r.totalEarnings),
        socialSecurity: acc.socialSecurity + Number(r.socialSecurity),
        withholdingTax: acc.withholdingTax + Number(r.withholdingTax),
        netPay: acc.netPay + Number(r.netPay),
      }), { totalEarnings: 0, socialSecurity: 0, withholdingTax: 0, netPay: 0 });

      const defaultDate = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
      const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
      const entryDate = customEntryDate || defaultDate;
      const entryNo = await getNextJournalEntryNo(companyId, "payment", entryDate);
      const entry = await storage.createJournalEntry({
        companyId,
        entryNo,
        entryDate,
        reference: `PAY-${year}${String(month).padStart(2, "0")}`,
        description: `เงินเดือนประจำเดือน${monthNames[month - 1]} ${year + 543}`,
        journalBook: "payment",
        createdBy: (req as any).user?.id,
        status: "posted",
        sourceDocType: "payroll",
      });

      const salaryAccounts = await db.select().from(accounts).where(eq(accounts.companyId, companyId));
      const findAccount = (code: string) => salaryAccounts.find(a => a.code === code)?.id;
      const salaryExpenseId = findAccount("5210020") || findAccount("5210000");
      const ssExpenseId = findAccount("5210090") || findAccount("5210020");
      const cashBankId = (paymentAccountCode ? findAccount(paymentAccountCode) : null) || findAccount("1021000") || findAccount("1011000") || findAccount("1001000");
      const whtPayableId = findAccount("2344000") || findAccount("2345000") || findAccount("2341000");
      const ssPayableId = findAccount("2312000") || findAccount("2344000") || findAccount("2101000");

      if (!salaryExpenseId || !cashBankId) {
        return res.status(400).json({ message: "ไม่พบผังบัญชีที่จำเป็น (ค่าใช้จ่ายเงินเดือน 5310/5100/5000 หรือ เงินสด/ธนาคาร 1122/1121/1110/1000) กรุณาตั้งค่าผังบัญชีก่อน" });
      }

      const employerSS = totals.socialSecurity;

      await storage.createJournalLine({ journalEntryId: entry.id, accountId: salaryExpenseId, description: "เงินเดือนและค่าจ้าง", debit: String(totals.totalEarnings.toFixed(2)), credit: "0" });
      if (ssExpenseId && employerSS > 0) {
        await storage.createJournalLine({ journalEntryId: entry.id, accountId: ssExpenseId, description: "ประกันสังคม (ส่วนนายจ้างสมทบ)", debit: String(employerSS.toFixed(2)), credit: "0" });
      }
      if (whtPayableId && totals.withholdingTax > 0) {
        await storage.createJournalLine({ journalEntryId: entry.id, accountId: whtPayableId, description: "ภาษีหัก ณ ที่จ่าย", debit: "0", credit: String(totals.withholdingTax.toFixed(2)) });
      }
      if (ssPayableId && totals.socialSecurity > 0) {
        const totalSSPayable = totals.socialSecurity + employerSS;
        await storage.createJournalLine({ journalEntryId: entry.id, accountId: ssPayableId, description: "ประกันสังคมค้างจ่าย (ลูกจ้าง+นายจ้าง)", debit: "0", credit: String(totalSSPayable.toFixed(2)) });
      }
      await storage.createJournalLine({ journalEntryId: entry.id, accountId: cashBankId, description: "เงินสด/ธนาคาร", debit: "0", credit: String(totals.netPay.toFixed(2)) });

      for (const r of records) {
        await storage.updatePayrollRecord(r.id, { journalEntryId: entry.id, status: "posted", paidDate: entryDate });
      }

      res.json({ message: "ลงบัญชีเงินเดือนสำเร็จ", journalEntryId: entry.id });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/payroll-records/rd-prep", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = Number(req.query.companyId);
      const month = Number(req.query.month);
      const year = Number(req.query.year);
      const type = req.query.type as string || "pnd1";
      const filterIncomeType = req.query.incomeType as string || "";
      const payDateParam = req.query.payDate as string || "";
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุ companyId" });

      const company = await storage.getCompany(companyId);
      if (!company) return res.status(404).json({ message: "ไม่พบข้อมูลบริษัท" });

      let records: any[];
      if (type === "pnd1a") {
        if (!year) return res.status(400).json({ message: "กรุณาระบุปี" });
        records = await storage.getPayrollRecordsByYear(companyId, year);
      } else {
        if (!month || !year) return res.status(400).json({ message: "กรุณาระบุเดือนและปี" });
        records = await storage.getPayrollRecords(companyId, month, year);
      }

      const emps = await storage.getEmployees(user.tenantId, companyId);
      const empMap = new Map(emps.map(e => [e.id, e]));
      const yearBE = year + 543;

      const incomeTypeToCode = (t: string) => t === "2" ? "402I" : "401N";
      const outputFormat = (req.query.format as string) || "xlsx";

      let payDateStr: string;
      if (type === "pnd1a") {
        payDateStr = `31-12-${yearBE}`;
      } else if (payDateParam) {
        const pd = new Date(payDateParam);
        if (!isNaN(pd.getTime())) {
          payDateStr = `${String(pd.getDate()).padStart(2, "0")}-${String(pd.getMonth() + 1).padStart(2, "0")}-${String(pd.getFullYear() + 543)}`;
        } else {
          const lastDay = new Date(year, month, 0).getDate();
          payDateStr = `${String(lastDay).padStart(2, "0")}-${String(month).padStart(2, "0")}-${yearBE}`;
        }
      } else {
        const [je] = await db.select().from(journalEntries).where(
          and(eq(journalEntries.companyId, companyId), eq(journalEntries.sourceDocType, "payroll"), eq(journalEntries.reference, `PAY-${year}${String(month).padStart(2, "0")}`))
        );
        if (je && je.entryDate) {
          const jd = new Date(je.entryDate);
          payDateStr = `${String(jd.getDate()).padStart(2, "0")}-${String(jd.getMonth() + 1).padStart(2, "0")}-${String(jd.getFullYear() + 543)}`;
        } else {
          const lastDay = new Date(year, month, 0).getDate();
          payDateStr = `${String(lastDay).padStart(2, "0")}-${String(month).padStart(2, "0")}-${yearBE}`;
        }
      }

      const fmtAmt = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(2);
      const csvEscape = (v: string) => {
        if (v.includes(",") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
          return `"${v.replace(/"/g, '""')}"`;
        }
        return v;
      };

      const parseThaiAddress = (addr: string) => {
        const result = { building: "", room: "", floor: "", village: "", houseNo: "", moo: "", soi: "", yaek: "", road: "", tambon: "", amphoe: "", province: "", postalCode: "" };
        if (!addr) return result;
        const s = addr.trim();
        const postalMatch = s.match(/(\d{5})\s*$/);
        if (postalMatch) result.postalCode = postalMatch[1];
        const houseMatch = s.match(/(?:เลขที่|บ้านเลขที่)\s*(\S+)/);
        if (houseMatch) result.houseNo = houseMatch[1];
        else {
          const numStart = s.match(/^(\d+[\/:]*\d*)/);
          if (numStart) result.houseNo = numStart[1];
        }
        const mooMatch = s.match(/(?:หมู่|ม\.|หมู่ที่)\s*(\d+)/);
        if (mooMatch) result.moo = mooMatch[1];
        const soiMatch = s.match(/(?:ซอย|ซ\.)\s*(\S+)/);
        if (soiMatch) result.soi = soiMatch[1];
        const roadMatch = s.match(/(?:ถนน|ถ\.)\s*(\S+)/);
        if (roadMatch) result.road = roadMatch[1];
        const tambonMatch = s.match(/(?:ตำบล|แขวง|ต\.)\s*(\S+)/);
        if (tambonMatch) result.tambon = tambonMatch[1];
        const amphoeMatch = s.match(/(?:อำเภอ|เขต|อ\.)\s*(\S+)/);
        if (amphoeMatch) result.amphoe = amphoeMatch[1];
        const provMatch = s.match(/(?:จังหวัด|จ\.)\s*(\S+)/);
        if (provMatch) result.province = provMatch[1];
        else {
          const provList = ["กรุงเทพมหานคร","กรุงเทพฯ","นนทบุรี","ปทุมธานี","สมุทรปราการ","นครปฐม","พระนครศรีอยุธยา","ชลบุรี","ระยอง","เชียงใหม่","เชียงราย","ขอนแก่น","นครราชสีมา","สุราษฎร์ธานี","สงขลา","ภูเก็ต"];
          for (const prov of provList) {
            if (s.includes(prov)) { result.province = prov; break; }
          }
        }
        const villageMatch = s.match(/(?:หมู่บ้าน|ม\.บ\.)\s*(\S+)/);
        if (villageMatch) result.village = villageMatch[1];
        const buildingMatch = s.match(/(?:อาคาร)\s*(\S+)/);
        if (buildingMatch) result.building = buildingMatch[1];
        return result;
      };

      const PND1_HEADERS = [
        "ลำดับที่", "เลขประจำตัวผู้เสียภาษี", "คำนำหน้าชื่อ", "ชื่อ", "ชื่อกลาง", "นามสกุล",
        "วัน เดือน ปี ที่จ่าย",
        "เงินได้ตามมาตรา", "จำนวนเงินที่จ่าย", "จำนวนเงินภาษีที่หัก", "เงื่อนไขการหัก"
      ];

      const PND1A_HEADERS = [
        "ลำดับที่", "เลขประจำตัวผู้เสียภาษี", "คำนำหน้าชื่อ", "ชื่อ", "ชื่อกลาง", "นามสกุล",
        "อาคาร", "เลขห้อง", "ชั้น", "หมู่บ้าน", "เลขที่", "หมู่ที่", "ซอย", "แยก", "ถนน",
        "ตำบล", "อำเภอ", "จังหวัด", "รหัสไปรษณีย์",
        "เงินได้ตามมาตรา", "จำนวนเงินที่จ่าย", "จำนวนเงินภาษีที่หัก", "เงื่อนไขการหัก"
      ];

      type RowData = { citizenId: string; prefix: string; fName: string; lName: string; incType: string; earnings: number; tax: number; address: string; };
      const rows: RowData[] = [];

      if (type === "pnd1a") {
        const grouped = new Map<number, { total: number; tax: number }>();
        for (const r of records) {
          const existing = grouped.get(r.employeeId) || { total: 0, tax: 0 };
          existing.total += Number(r.totalEarnings);
          existing.tax += Number(r.withholdingTax);
          grouped.set(r.employeeId, existing);
        }
        for (const [empId, totals] of grouped) {
          const emp = empMap.get(empId);
          if (!emp) continue;
          rows.push({
            citizenId: (emp as any).idCardNumber || (emp as any).taxId || "",
            prefix: (emp as any).titlePrefix || "",
            fName: (emp as any).firstName || "",
            lName: (emp as any).lastName || "",
            incType: incomeTypeToCode((emp as any).incomeType || "1"),
            earnings: totals.total, tax: totals.tax,
            address: (emp as any).address || "",
          });
        }
      } else {
        for (const r of records) {
          const emp = empMap.get(r.employeeId);
          if (!emp) continue;
          rows.push({
            citizenId: (emp as any).idCardNumber || (emp as any).taxId || "",
            prefix: (emp as any).titlePrefix || "",
            fName: (emp as any).firstName || "",
            lName: (emp as any).lastName || "",
            incType: incomeTypeToCode((emp as any).incomeType || "1"),
            earnings: Number(r.totalEarnings), tax: Number(r.withholdingTax),
            address: (emp as any).address || "",
          });
        }
      }

      const buildRow1A = (seq: number, r: RowData) => {
        const a = parseThaiAddress(r.address);
        return [
          seq, r.citizenId, r.prefix, r.fName, "", r.lName,
          a.building, a.room, a.floor, a.village, a.houseNo, a.moo, a.soi, a.yaek, a.road,
          a.tambon, a.amphoe, a.province, a.postalCode,
          r.incType, Math.round(r.earnings), Math.round(r.tax), 1,
        ];
      };

      const buildRow1 = (seq: number, r: RowData) => {
        return [
          seq, r.citizenId, r.prefix, r.fName, "", r.lName,
          payDateStr,
          r.incType, Math.round(r.earnings), Math.round(r.tax), 1,
        ];
      };

      const activeHeaders = type === "pnd1a" ? PND1A_HEADERS : PND1_HEADERS;
      const buildRow = type === "pnd1a" ? buildRow1A : buildRow1;

      if (outputFormat === "csv") {
        const lines: string[] = [];
        lines.push(activeHeaders.join(","));
        let seq = 1;
        for (const r of rows) {
          const vals = buildRow(seq++, r);
          lines.push(vals.map(v => csvEscape(String(v))).join(","));
        }
        const filename = type === "pnd1a"
          ? `PND1A_${yearBE}.csv`
          : `PND1_${String(month).padStart(2, "0")}_${yearBE}.csv`;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send("\uFEFF" + lines.join("\r\n"));
        return;
      }

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("data");

      const PND1_WIDTHS = [8, 20, 12, 15, 10, 15, 16, 14, 14, 14, 12];
      const PND1A_WIDTHS = [8, 20, 12, 15, 10, 15, 12, 8, 6, 12, 8, 6, 12, 8, 12, 15, 15, 18, 10, 14, 14, 14, 12];
      const widths = type === "pnd1a" ? PND1A_WIDTHS : PND1_WIDTHS;
      sheet.columns = activeHeaders.map((h, i) => ({
        header: h,
        width: widths[i] || 10,
      }));
      let seq = 1;
      for (const r of rows) {
        sheet.addRow(buildRow(seq++, r));
      }

      sheet.getColumn(2).numFmt = "@";
      sheet.eachRow((row: any, rowNumber: number) => {
        if (rowNumber === 1) row.font = { bold: true };
      });

      const filename = type === "pnd1a"
        ? `PND1A_${yearBE}.xlsx`
        : `PND1_${String(month).padStart(2, "0")}_${yearBE}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (err: any) { console.error("[rd-prep]", err); res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/payroll-records/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.select().from(payrollRecords).where(eq(payrollRecords.id, id)).limit(1);
      if (!existing.length) return res.status(404).json({ message: "ไม่พบรายการ" });
      const { baseSalary, otAmount, socialSecurity, withholdingTax, totalEarnings, totalDeductions, netPay, ssoExempt, taxDeductions } = req.body;
      const updates: any = {};
      if (baseSalary !== undefined) updates.baseSalary = String(baseSalary);
      if (otAmount !== undefined) updates.otAmount = String(otAmount);
      if (socialSecurity !== undefined) updates.socialSecurity = String(socialSecurity);
      if (withholdingTax !== undefined) updates.withholdingTax = String(withholdingTax);
      if (totalEarnings !== undefined) updates.totalEarnings = String(totalEarnings);
      if (totalDeductions !== undefined) updates.totalDeductions = String(totalDeductions);
      if (netPay !== undefined) updates.netPay = String(netPay);
      if (ssoExempt !== undefined) updates.ssoExempt = ssoExempt;
      if (taxDeductions !== undefined) {
        if (!Array.isArray(taxDeductions)) return res.status(400).json({ message: "taxDeductions must be an array" });
        const validated = taxDeductions.filter((d: any) => d && typeof d.key === "string" && typeof d.label === "string" && typeof d.amount === "number" && d.amount >= 0);
        updates.taxDeductions = validated;
      }
      const result = await db.update(payrollRecords).set(updates).where(eq(payrollRecords.id, id)).returning();
      res.json(result[0]);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/payroll-records/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await db.select().from(payrollRecords).where(eq(payrollRecords.id, id)).limit(1);
      if (!existing.length) return res.status(404).json({ message: "ไม่พบรายการ" });
      if (existing[0].status === "posted") return res.status(400).json({ message: "ไม่สามารถลบรายการที่ลงบัญชีแล้วได้" });
      await storage.deletePayrollRecord(id);
      res.json({ message: "ลบรายการเงินเดือนสำเร็จ" });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/payroll-adjustments", requireAuth, requireModule("hr"), async (req, res) => {
    const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    if (!companyId) return res.json([]);
    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) return res.status(400).json({ message: "กรุณาระบุเดือนและปี" });
    const adjustments = await storage.getPayrollAdjustments(companyId, month, year);
    res.json(adjustments);
  });

  app.post("/api/payroll-adjustments", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    const user = req.user as any;
    const companyId = req.body.companyId ? Number(req.body.companyId) : undefined;
    if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
    const { employeeId, month, year, type, name, amount, note } = req.body;
    if (!employeeId || !month || !year || !type || !name) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
    const adj = await storage.createPayrollAdjustment({
      companyId,
      employeeId: Number(employeeId),
      month: Number(month),
      year: Number(year),
      type,
      name,
      amount: String(amount || 0),
      note: note || null,
      createdBy: user.id,
    });
    res.json(adj);
  });

  app.post("/api/payroll-adjustments/batch", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = req.body.companyId ? Number(req.body.companyId) : undefined;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const { items, month, year, type, name } = req.body;
      if (!Array.isArray(items) || !month || !year || !type || !name) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
      const created = [];
      for (const item of items) {
        if (!item.employeeId || Number(item.amount) <= 0) continue;
        const adj = await storage.createPayrollAdjustment({
          companyId,
          employeeId: Number(item.employeeId),
          month: Number(month),
          year: Number(year),
          type,
          name,
          amount: String(item.amount),
          note: item.note || null,
          createdBy: user.id,
        });
        created.push(adj);
      }
      res.json({ message: `สร้างรายการ ${created.length} รายการสำเร็จ`, items: created });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.put("/api/payroll-adjustments/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    const adj = await storage.updatePayrollAdjustment(Number(req.params.id), req.body);
    if (!adj) return res.status(404).json({ message: "ไม่พบรายการ" });
    res.json(adj);
  });

  app.delete("/api/payroll-adjustments/:id", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    await storage.deletePayrollAdjustment(Number(req.params.id));
    res.json({ success: true });
  });

  app.post("/api/payslip/send-line", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const { employeeId, month, year, baseSalary, otAmount, totalEarnings, socialSecurity, withholdingTax, totalDeductions, netPay, workDays, otHours, leaveDays } = req.body;

      const [emp] = await db.select().from(employees).where(eq(employees.id, Number(employeeId)));
      if (!emp) return res.status(404).json({ message: "ไม่พบข้อมูลพนักงาน" });
      if (!emp.lineUserId) return res.status(400).json({ message: "พนักงานไม่มี LINE User ID" });

      const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!lineToken) return res.status(400).json({ message: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" });

      const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
      const monthLabel = monthNames[Number(month) - 1] || month;
      const yearBE = Number(year) + 543;
      const fmtN = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const message = `📋 สลิปเงินเดือน\nประจำเดือน ${monthLabel} พ.ศ. ${yearBE}\n\n👤 ${emp.fullName} (${emp.employeeCode})\n\n💰 รายได้\n  เงินเดือน: ฿${fmtN(baseSalary)}\n  ค่าล่วงเวลา: ฿${fmtN(otAmount)}\n  รวมรายได้: ฿${fmtN(totalEarnings)}\n\n📌 รายการหัก\n  ประกันสังคม: ฿${fmtN(socialSecurity)}\n  ภาษีหัก ณ ที่จ่าย: ฿${fmtN(withholdingTax)}\n  รวมหัก: ฿${fmtN(totalDeductions)}\n\n✅ เงินได้สุทธิ: ฿${fmtN(netPay)}\n\n📊 วันทำงาน: ${workDays} วัน | OT: ${Number(otHours).toFixed(1)} ชม. | ลา: ${leaveDays} วัน`;

      const lineResponse = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${lineToken}` },
        body: JSON.stringify({ to: emp.lineUserId, messages: [{ type: "text", text: message }] }),
      });

      if (!lineResponse.ok) {
        const error = await lineResponse.text();
        return res.status(400).json({ message: `LINE API error: ${error}` });
      }

      res.json({ message: "ส่งสลิปเงินเดือนทาง LINE สำเร็จ" });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/payslip/send-email", requireAuth, requireModule("hr"), requireRole("admin", "manager"), async (req, res) => {
    try {
      const { employeeId, month, year, baseSalary, otAmount, totalEarnings, socialSecurity, withholdingTax, totalDeductions, netPay, workDays, otHours, leaveDays } = req.body;

      const [emp] = await db.select().from(employees).where(eq(employees.id, Number(employeeId)));
      if (!emp) return res.status(404).json({ message: "ไม่พบข้อมูลพนักงาน" });
      if (!emp.email) return res.status(400).json({ message: "พนักงานไม่มีอีเมล" });

      const { sendPlatformEmail } = await import("../utils/platform-email");

      const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
      const monthLabel = monthNames[Number(month) - 1] || month;
      const yearBE = Number(year) + 543;
      const fmtN = (n: number) => Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      await sendPlatformEmail({
        to: emp.email,
        subject: `สลิปเงินเดือน ${monthLabel} พ.ศ. ${yearBE} - ${emp.fullName}`,
        html: `
          <div style="font-family: 'Sarabun', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #fb9678; padding: 24px; border-radius: 12px 12px 0 0; color: white;">
              <h1 style="margin: 0; font-size: 22px;">สลิปเงินเดือน</h1>
              <p style="margin: 8px 0 0; opacity: 0.9;">ประจำเดือน ${monthLabel} พ.ศ. ${yearBE}</p>
            </div>
            <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px; background: #fff;">
              <div style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                <p style="color: #334155; font-size: 15px; font-weight: bold;">${emp.fullName} (${emp.employeeCode})</p>
                <p style="color: #64748b; font-size: 13px;">${emp.position || "-"} | ${emp.department || "-"}</p>
              </div>
              <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
                <tr><td colspan="2" style="padding: 8px 0; font-weight: bold; color: #05b187; border-bottom: 1px solid #e2e8f0;">รายได้</td></tr>
                <tr><td style="padding: 4px 0; color: #475569;">เงินเดือน</td><td style="text-align: right; font-weight: 600;">฿${fmtN(baseSalary)}</td></tr>
                <tr><td style="padding: 4px 0; color: #475569;">ค่าล่วงเวลา (OT ${Number(otHours).toFixed(1)} ชม.)</td><td style="text-align: right; font-weight: 600;">฿${fmtN(otAmount)}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold; border-top: 1px solid #e2e8f0;">รวมรายได้</td><td style="text-align: right; font-weight: bold; color: #05b187; border-top: 1px solid #e2e8f0;">฿${fmtN(totalEarnings)}</td></tr>
                <tr><td colspan="2" style="padding: 8px 0; font-weight: bold; color: #f94d4d; border-bottom: 1px solid #e2e8f0;">รายการหัก</td></tr>
                <tr><td style="padding: 4px 0; color: #475569;">ประกันสังคม</td><td style="text-align: right; font-weight: 600;">฿${fmtN(socialSecurity)}</td></tr>
                <tr><td style="padding: 4px 0; color: #475569;">ภาษีหัก ณ ที่จ่าย</td><td style="text-align: right; font-weight: 600;">฿${fmtN(withholdingTax)}</td></tr>
                <tr><td style="padding: 8px 0; font-weight: bold; border-top: 1px solid #e2e8f0;">รวมหัก</td><td style="text-align: right; font-weight: bold; color: #f94d4d; border-top: 1px solid #e2e8f0;">฿${fmtN(totalDeductions)}</td></tr>
              </table>
              <div style="margin-top: 16px; padding: 16px; background: #fff7f5; border-radius: 8px; border: 2px solid #fb9678;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: bold; font-size: 15px;">เงินได้สุทธิ</span>
                  <span style="font-weight: bold; font-size: 22px; color: #fb9678;">฿${fmtN(netPay)}</span>
                </div>
              </div>
              <p style="margin-top: 16px; color: #94a3b8; font-size: 11px;">วันทำงาน: ${workDays} วัน | ชม.ทำงาน: OT ${Number(otHours).toFixed(1)} ชม. | วันลา: ${leaveDays} วัน</p>
            </div>
          </div>
        `,
      });

      res.json({ message: `ส่งสลิปเงินเดือนไปยัง ${emp.email} สำเร็จ` });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  // ==================== WORK LOCATIONS ====================
  app.get("/api/work-locations", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId is required" });
      const list = await db.select().from(workLocations).where(eq(workLocations.companyId, companyId)).orderBy(asc(workLocations.name));
      res.json(list);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/work-locations", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const data = insertWorkLocationSchema.parse(req.body);
      const [loc] = await db.insert(workLocations).values(data).returning();
      res.status(201).json(loc);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.put("/api/work-locations/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name, address, lat, lng, radiusMeters, active } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (address !== undefined) updateData.address = address;
      if (lat !== undefined) updateData.lat = String(lat);
      if (lng !== undefined) updateData.lng = String(lng);
      if (radiusMeters !== undefined) updateData.radiusMeters = radiusMeters;
      if (active !== undefined) updateData.active = active;
      const [updated] = await db.update(workLocations).set(updateData).where(eq(workLocations.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "ไม่พบสถานที่" });
      res.json(updated);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/work-locations/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [deleted] = await db.delete(workLocations).where(eq(workLocations.id, id)).returning();
      if (!deleted) return res.status(404).json({ message: "ไม่พบสถานที่" });
      res.json({ success: true });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  async function checkCompanyAccess(req: any, companyId: number): Promise<boolean> {
    const user = req.user as any;
    if (!user.tenantId) return true;
    const company = await storage.getCompany(companyId);
    return !!company && company.tenantId === user.tenantId;
  }

  app.get("/api/commission-rules", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      if (!await checkCompanyAccess(req, companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const rows = await db.select().from(commissionRules).where(eq(commissionRules.companyId, companyId)).orderBy(asc(commissionRules.name));
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/commission-rules", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const body = req.body;
      if (!body.companyId || !body.name) return res.status(400).json({ message: "companyId, name required" });
      if (!await checkCompanyAccess(req, Number(body.companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const [rule] = await db.insert(commissionRules).values({
        companyId: Number(body.companyId),
        name: body.name,
        type: body.type || "percentage",
        rate: body.rate || "0",
        basedOn: body.basedOn || "revenue",
        minTarget: body.minTarget || "0",
        active: body.active !== false,
      }).returning();
      res.json(rule);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.patch("/api/commission-rules/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const body = req.body;
      const updateData: any = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.type !== undefined) updateData.type = body.type;
      if (body.rate !== undefined) updateData.rate = body.rate;
      if (body.basedOn !== undefined) updateData.basedOn = body.basedOn;
      if (body.minTarget !== undefined) updateData.minTarget = body.minTarget;
      if (body.active !== undefined) updateData.active = body.active;
      const [updated] = await db.update(commissionRules).set(updateData).where(eq(commissionRules.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "ไม่พบกฎคอมมิชชั่น" });
      res.json(updated);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/commission-rules/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [deleted] = await db.delete(commissionRules).where(eq(commissionRules.id, id)).returning();
      if (!deleted) return res.status(404).json({ message: "ไม่พบกฎคอมมิชชั่น" });
      res.json({ success: true });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/commission-records", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const month = req.query.month ? Number(req.query.month) : undefined;
      const year = req.query.year ? Number(req.query.year) : undefined;
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      if (!await checkCompanyAccess(req, companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const conditions: any[] = [eq(commissionRecords.companyId, companyId)];
      if (month) conditions.push(eq(commissionRecords.month, month));
      if (year) conditions.push(eq(commissionRecords.year, year));
      const rows = await db.select({
        record: commissionRecords,
        employeeName: employees.fullName,
        ruleName: commissionRules.name,
      })
        .from(commissionRecords)
        .leftJoin(employees, eq(commissionRecords.employeeId, employees.id))
        .leftJoin(commissionRules, eq(commissionRecords.ruleId, commissionRules.id))
        .where(and(...conditions))
        .orderBy(desc(commissionRecords.year), desc(commissionRecords.month), asc(employees.fullName));
      res.json(rows.map(r => ({ ...r.record, employeeName: r.employeeName, ruleName: r.ruleName })));
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/commission-records/calculate", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const { companyId, month, year, ruleId } = req.body;
      if (!companyId || !month || !year || !ruleId) return res.status(400).json({ message: "companyId, month, year, ruleId required" });
      if (!await checkCompanyAccess(req, Number(companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

      const [rule] = await db.select().from(commissionRules).where(and(eq(commissionRules.id, Number(ruleId)), eq(commissionRules.companyId, Number(companyId))));
      if (!rule) return res.status(404).json({ message: "ไม่พบกฎคอมมิชชั่น" });

      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const tivRows = await db.select({
        salesperson: taxInvoices.salesperson,
        total: sql<string>`COALESCE(SUM(CAST(${taxInvoices.totalAmount} AS DECIMAL(15,2))), 0)`,
      })
        .from(taxInvoices)
        .where(and(
          eq(taxInvoices.companyId, Number(companyId)),
          sql`${taxInvoices.taxInvoiceDate} >= ${startDate}`,
          sql`${taxInvoices.taxInvoiceDate} <= ${endDate}`,
          sql`${taxInvoices.status} = 'approved'`,
        ))
        .groupBy(taxInvoices.salesperson);

      const ivRows = await db.select({
        salesperson: invoices.salesperson,
        total: sql<string>`COALESCE(SUM(CAST(${invoices.totalAmount} AS DECIMAL(15,2))), 0)`,
      })
        .from(invoices)
        .where(and(
          eq(invoices.companyId, Number(companyId)),
          sql`${invoices.invoiceDate} >= ${startDate}`,
          sql`${invoices.invoiceDate} <= ${endDate}`,
          sql`${invoices.status} = 'approved'`,
        ))
        .groupBy(invoices.salesperson);

      const salesMap = new Map<string, number>();
      for (const r of tivRows) { if (r.salesperson) salesMap.set(r.salesperson, (salesMap.get(r.salesperson) || 0) + Number(r.total)); }
      for (const r of ivRows) { if (r.salesperson) salesMap.set(r.salesperson, (salesMap.get(r.salesperson) || 0) + Number(r.total)); }

      const allEmps = await db.select().from(employees).where(and(eq(employees.companyId, Number(companyId)), sql`${employees.employmentStatus} != 'resigned'`));
      const empMap = new Map<string, number>();
      for (const e of allEmps) {
        const name = e.fullName || `${e.firstName || ""} ${e.lastName || ""}`.trim();
        if (name) empMap.set(name, e.id);
      }

      const records: any[] = [];
      const rate = Number(rule.rate);
      const minTarget = Number(rule.minTarget || 0);

      for (const [salesperson, totalSales] of salesMap) {
        const empId = empMap.get(salesperson);
        if (!empId) continue;
        if (totalSales < minTarget) continue;

        let commissionAmt = 0;
        if (rule.type === "percentage") {
          commissionAmt = Math.round(totalSales * rate / 100 * 100) / 100;
        } else {
          commissionAmt = rate;
        }

        const existing = await db.select().from(commissionRecords).where(and(
          eq(commissionRecords.companyId, Number(companyId)),
          eq(commissionRecords.employeeId, empId),
          eq(commissionRecords.month, Number(month)),
          eq(commissionRecords.year, Number(year)),
        ));

        if (existing.length > 0) {
          const [updated] = await db.update(commissionRecords).set({
            totalSales: String(totalSales),
            commissionRate: String(rate),
            commissionAmount: String(commissionAmt),
            ruleId: rule.id,
            status: "draft",
          }).where(eq(commissionRecords.id, existing[0].id)).returning();
          records.push({ ...updated, employeeName: salesperson });
        } else {
          const [created] = await db.insert(commissionRecords).values({
            companyId: Number(companyId),
            employeeId: empId,
            month: Number(month),
            year: Number(year),
            totalSales: String(totalSales),
            commissionRate: String(rate),
            commissionAmount: String(commissionAmt),
            ruleId: rule.id,
            status: "draft",
          }).returning();
          records.push({ ...created, employeeName: salesperson });
        }
      }

      res.json({ records, count: records.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.patch("/api/commission-records/:id/approve", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const user = req.user as any;
      const [updated] = await db.update(commissionRecords).set({
        status: "approved",
        approvedBy: user.id,
        approvedAt: new Date(),
      }).where(eq(commissionRecords.id, id)).returning();
      if (!updated) return res.status(404).json({ message: "ไม่พบรายการ" });
      res.json(updated);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/commission-records/approve-all", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const { companyId, month, year } = req.body;
      if (!companyId || !month || !year) return res.status(400).json({ message: "companyId, month, year required" });
      if (!await checkCompanyAccess(req, Number(companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const user = req.user as any;
      const result = await db.update(commissionRecords).set({
        status: "approved",
        approvedBy: user.id,
        approvedAt: new Date(),
      }).where(and(
        eq(commissionRecords.companyId, Number(companyId)),
        eq(commissionRecords.month, Number(month)),
        eq(commissionRecords.year, Number(year)),
        eq(commissionRecords.status, "draft"),
      )).returning();
      res.json({ approved: result.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/commission-records/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const [deleted] = await db.delete(commissionRecords).where(eq(commissionRecords.id, id)).returning();
      if (!deleted) return res.status(404).json({ message: "ไม่พบรายการ" });
      res.json({ success: true });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/commission-records/for-payroll", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = Number(req.query.companyId);
      const month = Number(req.query.month);
      const year = Number(req.query.year);
      if (!companyId || !month || !year) return res.status(400).json({ message: "companyId, month, year required" });
      if (!await checkCompanyAccess(req, companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const rows = await db.select({
        employeeId: commissionRecords.employeeId,
        commissionAmount: sql<string>`SUM(CAST(${commissionRecords.commissionAmount} AS DECIMAL(12,2)))`,
      })
        .from(commissionRecords)
        .where(and(
          eq(commissionRecords.companyId, companyId),
          eq(commissionRecords.month, month),
          eq(commissionRecords.year, year),
          eq(commissionRecords.status, "approved"),
        ))
        .groupBy(commissionRecords.employeeId);
      res.json(rows);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/shifts", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      if (!await checkCompanyAccess(req, companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const result = await db.select().from(shifts).where(eq(shifts.companyId, companyId)).orderBy(asc(shifts.id));
      res.json(result);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/shifts", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { name, startTime, endTime, breakStartTime, breakEndTime, color, lateThresholdMinutes, companyId } = req.body;
      if (!name || !startTime || !endTime || !companyId) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
      if (!await checkCompanyAccess(req, Number(companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const [created] = await db.insert(shifts).values({ name, startTime, endTime, breakStartTime, breakEndTime, color, lateThresholdMinutes, companyId: Number(companyId) }).returning();
      res.status(201).json(created);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.put("/api/shifts/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const id = Number(req.params.id);
      const [existing] = await db.select().from(shifts).where(eq(shifts.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบกะทำงาน" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      if (existing.companyId && !await checkCompanyAccess(req, existing.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { name, startTime, endTime, breakStartTime, breakEndTime, color, lateThresholdMinutes, active } = req.body;
      const [updated] = await db.update(shifts).set({ name, startTime, endTime, breakStartTime, breakEndTime, color, lateThresholdMinutes, active }).where(eq(shifts.id, id)).returning();
      res.json(updated);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/shifts/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const id = Number(req.params.id);
      const [existing] = await db.select().from(shifts).where(eq(shifts.id, id));
      if (!existing) return res.status(404).json({ message: "ไม่พบกะทำงาน" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      if (existing.companyId && !await checkCompanyAccess(req, existing.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      await db.delete(employeeShiftAssignments).where(eq(employeeShiftAssignments.shiftId, id));
      await db.delete(shifts).where(eq(shifts.id, id));
      res.json({ success: true });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/shift-assignments", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      if (!await checkCompanyAccess(req, companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;
      if (!dateFrom || !dateTo) return res.status(400).json({ message: "dateFrom and dateTo required" });

      const emps = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, companyId), eq(employees.active, true)));
      const empIds = emps.map(e => e.id);
      if (empIds.length === 0) return res.json([]);

      const assignments = await db.select().from(employeeShiftAssignments)
        .where(and(
          inArray(employeeShiftAssignments.employeeId, empIds),
          gte(employeeShiftAssignments.date, dateFrom),
          lte(employeeShiftAssignments.date, dateTo),
        ))
        .orderBy(asc(employeeShiftAssignments.date));
      res.json(assignments);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/shift-assignments", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { employeeId, shiftId, date } = req.body;
      if (!employeeId || !shiftId || !date) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
      const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId));
      if (!emp || !emp.companyId) return res.status(404).json({ message: "ไม่พบพนักงาน" });
      if (!await checkCompanyAccess(req, emp.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
      if (!shift || shift.companyId !== emp.companyId) return res.status(400).json({ message: "กะทำงานไม่ถูกต้อง" });
      await db.delete(employeeShiftAssignments).where(and(eq(employeeShiftAssignments.employeeId, employeeId), eq(employeeShiftAssignments.date, date)));
      const [created] = await db.insert(employeeShiftAssignments).values({ employeeId, shiftId, date }).returning();
      res.status(201).json(created);
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/shift-assignments/bulk", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { assignments, companyId } = req.body;
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      if (!Array.isArray(assignments) || assignments.length === 0) return res.status(400).json({ message: "กรุณาระบุข้อมูลการจัดกะ" });
      if (!await checkCompanyAccess(req, Number(companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

      const empIds = [...new Set(assignments.map((a: any) => a.employeeId))];
      const shiftIds = [...new Set(assignments.filter((a: any) => a.shiftId).map((a: any) => a.shiftId))];
      const companyEmps = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, Number(companyId)), inArray(employees.id, empIds.map(Number))));
      const validEmpIds = new Set(companyEmps.map(e => e.id));
      if (shiftIds.length > 0) {
        const companyShifts = await db.select({ id: shifts.id }).from(shifts).where(and(eq(shifts.companyId, Number(companyId)), inArray(shifts.id, shiftIds.map(Number))));
        const validShiftIds = new Set(companyShifts.map(s => s.id));
        for (const sid of shiftIds) { if (!validShiftIds.has(Number(sid))) return res.status(400).json({ message: "กะทำงานไม่ถูกต้อง" }); }
      }
      for (const eid of empIds) { if (!validEmpIds.has(Number(eid))) return res.status(403).json({ message: "พนักงานไม่อยู่ในบริษัทที่มีสิทธิ์" }); }

      for (const a of assignments) {
        await db.delete(employeeShiftAssignments).where(and(eq(employeeShiftAssignments.employeeId, a.employeeId), eq(employeeShiftAssignments.date, a.date)));
        if (a.shiftId) {
          await db.insert(employeeShiftAssignments).values({ employeeId: a.employeeId, shiftId: a.shiftId, date: a.date });
        }
      }
      res.json({ success: true });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.delete("/api/shift-assignments/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const id = Number(req.params.id);
      const [existing] = await db.select().from(employeeShiftAssignments).where(eq(employeeShiftAssignments.id, id));
      if (existing) {
        const [emp] = await db.select().from(employees).where(eq(employees.id, existing.employeeId));
        if (emp?.companyId && !await checkCompanyAccess(req, emp.companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      await db.delete(employeeShiftAssignments).where(eq(employeeShiftAssignments.id, id));
      res.json({ success: true });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/shift-assignments/copy-week", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { companyId, sourceWeekStart, targetWeekStart } = req.body;
      if (!companyId || !sourceWeekStart || !targetWeekStart) return res.status(400).json({ message: "กรุณาระบุข้อมูลให้ครบ" });
      if (!await checkCompanyAccess(req, Number(companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });

      const emps = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.companyId, Number(companyId)), eq(employees.active, true)));
      const empIds = emps.map(e => e.id);
      if (empIds.length === 0) return res.json({ success: true, copied: 0 });

      const srcEnd = new Date(sourceWeekStart);
      srcEnd.setDate(srcEnd.getDate() + 6);
      const srcEndStr = formatDateStr(srcEnd);

      const sourceAssignments = await db.select().from(employeeShiftAssignments)
        .where(and(
          inArray(employeeShiftAssignments.employeeId, empIds),
          gte(employeeShiftAssignments.date, sourceWeekStart),
          lte(employeeShiftAssignments.date, srcEndStr),
        ));

      const srcStartDate = new Date(sourceWeekStart);
      const tgtStartDate = new Date(targetWeekStart);

      let copied = 0;
      for (const sa of sourceAssignments) {
        const saDate = new Date(sa.date);
        const dayOffset = Math.round((saDate.getTime() - srcStartDate.getTime()) / (1000 * 60 * 60 * 24));
        const targetDate = new Date(tgtStartDate);
        targetDate.setDate(targetDate.getDate() + dayOffset);
        const targetDateStr = formatDateStr(targetDate);

        await db.delete(employeeShiftAssignments).where(and(eq(employeeShiftAssignments.employeeId, sa.employeeId), eq(employeeShiftAssignments.date, targetDateStr)));
        await db.insert(employeeShiftAssignments).values({ employeeId: sa.employeeId, shiftId: sa.shiftId, date: targetDateStr });
        copied++;
      }
      res.json({ success: true, copied });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/shift-assignments/generate-rotation", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { companyId, shiftIds, employeeIds, startDate, weeks } = req.body;
      if (!companyId || !shiftIds || !employeeIds || !startDate || !weeks) {
        return res.status(400).json({ message: "กรุณาระบุข้อมูลให้ครบ (companyId, shiftIds, employeeIds, startDate, weeks)" });
      }
      if (!await checkCompanyAccess(req, Number(companyId))) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      if (!Array.isArray(shiftIds) || shiftIds.length < 2) return res.status(400).json({ message: "ต้องเลือกกะอย่างน้อย 2 กะสำหรับหมุนเวียน" });
      if (!Array.isArray(employeeIds) || employeeIds.length === 0) return res.status(400).json({ message: "ต้องเลือกพนักงานอย่างน้อย 1 คน" });
      const numWeeks = Math.min(Number(weeks), 12);

      const companyShifts = await db.select().from(shifts).where(and(eq(shifts.companyId, Number(companyId)), inArray(shifts.id, shiftIds.map(Number))));
      if (companyShifts.length < 2) return res.status(400).json({ message: "กะที่เลือกไม่ถูกต้อง" });
      const validShiftIds = companyShifts.map(s => s.id);

      const companyEmps = await db.select().from(employees).where(and(eq(employees.companyId, Number(companyId)), inArray(employees.id, employeeIds.map(Number)), eq(employees.active, true)));
      if (companyEmps.length === 0) return res.status(400).json({ message: "ไม่พบพนักงานที่เลือก" });
      const validEmpIds = companyEmps.map(e => e.id);

      let created = 0;
      const baseDate = new Date(startDate + "T00:00:00");

      for (let weekIdx = 0; weekIdx < numWeeks; weekIdx++) {
        const weekStart = new Date(baseDate);
        weekStart.setDate(weekStart.getDate() + weekIdx * 7);

        for (let empIdx = 0; empIdx < validEmpIds.length; empIdx++) {
          const empId = validEmpIds[empIdx];
          const shiftIndex = (empIdx + weekIdx) % validShiftIds.length;
          const assignedShiftId = validShiftIds[shiftIndex];

          for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + dayIdx);
            const dateStr = formatDateStr(d);

            await db.delete(employeeShiftAssignments).where(and(eq(employeeShiftAssignments.employeeId, empId), eq(employeeShiftAssignments.date, dateStr)));
            await db.insert(employeeShiftAssignments).values({ employeeId: empId, shiftId: assignedShiftId, date: dateStr });
            created++;
          }
        }
      }

      res.json({ success: true, created, weeks: numWeeks, employees: validEmpIds.length, shifts: validShiftIds.length });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.get("/api/leave-policies", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = Number(req.query.companyId);
      if (!companyId) return res.status(400).json({ message: "companyId required" });
      if (!isPrivilegedRole(user.role)) {
        const viewingOwn = await isViewingOwnCompany(user.id, companyId);
        if (!viewingOwn) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
      }
      const policies = await storage.getLeavePolicies(companyId);
      res.json(policies);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/leave-policies", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) {
        const viewingOwn = await isViewingOwnCompany(user.id, req.body.companyId);
        if (!viewingOwn) return res.status(403).json({ message: "ไม่มีสิทธิ์จัดการนโยบายลาบริษัทนี้" });
      }
      const parsed = insertLeavePolicySchema.parse(req.body);
      if (parsed.carryOverExpiryMonth && parsed.carryOverExpiryDay) {
        const testDate = new Date(2024, parsed.carryOverExpiryMonth - 1, parsed.carryOverExpiryDay);
        if (testDate.getMonth() !== parsed.carryOverExpiryMonth - 1) {
          return res.status(400).json({ message: "วันที่หมดอายุไม่ถูกต้อง (เช่น ก.พ. ไม่มี 31 วัน)" });
        }
      }
      const existingPolicies = await storage.getLeavePolicies(parsed.companyId);
      if (existingPolicies.some(p => p.leaveType === parsed.leaveType)) {
        return res.status(409).json({ message: `นโยบายลาประเภท "${parsed.leaveType}" มีอยู่แล้วสำหรับบริษัทนี้` });
      }
      const policy = await storage.createLeavePolicy(parsed);
      res.status(201).json(policy);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: err.errors[0].message });
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/leave-policies/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getLeavePolicy(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "ไม่พบนโยบายลา" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      if (!isPrivilegedRole(user.role)) {
        const viewingOwn = await isViewingOwnCompany(user.id, existing.companyId);
        if (!viewingOwn) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขนโยบายลาบริษัทนี้" });
      }
      const policy = await storage.updateLeavePolicy(Number(req.params.id), req.body);
      res.json(policy);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/leave-policies/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const existing = await storage.getLeavePolicy(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "ไม่พบนโยบายลา" });
      { const ac = await checkDocOwnership(existing.companyId, req.user); if (!ac.allowed) return res.status(403).json({ message: ac.message }); }
      if (!isPrivilegedRole(user.role)) {
        const viewingOwn = await isViewingOwnCompany(user.id, existing.companyId);
        if (!viewingOwn) return res.status(403).json({ message: "ไม่มีสิทธิ์ลบนโยบายลาบริษัทนี้" });
      }
      const ok = await storage.deleteLeavePolicy(Number(req.params.id));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/leave-balances", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = Number(req.query.companyId);
      const year = Number(req.query.year) || new Date().getFullYear();
      const employeeId = Number(req.query.employeeId);
      if (employeeId) {
        if (!isPrivilegedRole(user.role)) {
          const emp = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, employeeId));
          if (emp[0]?.companyId) {
            const viewingOwn = await isViewingOwnCompany(user.id, emp[0].companyId);
            if (!viewingOwn) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลพนักงานนี้" });
          }
        }
        const balances = await storage.getLeaveBalances(employeeId, year);
        return res.json(balances);
      }
      if (!companyId) return res.status(400).json({ message: "companyId or employeeId required" });
      if (!isPrivilegedRole(user.role)) {
        const viewingOwn = await isViewingOwnCompany(user.id, companyId);
        if (!viewingOwn) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
      }
      const balances = await storage.getLeaveBalancesByCompany(companyId, year);
      res.json(balances);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/leave-balances/summary", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = Number(req.query.companyId);
      const employeeId = Number(req.query.employeeId);
      const year = Number(req.query.year) || new Date().getFullYear();

      if (!employeeId && !companyId) return res.status(400).json({ message: "companyId or employeeId required" });

      let empCompanyId = companyId;
      if (employeeId && !companyId) {
        const [emp] = await db.select({ companyId: employees.companyId }).from(employees).where(eq(employees.id, employeeId));
        empCompanyId = emp?.companyId || 0;
      }
      if (empCompanyId && !isPrivilegedRole(user.role)) {
        const viewingOwn = await isViewingOwnCompany(user.id, empCompanyId);
        if (!viewingOwn) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงข้อมูลบริษัทนี้" });
      }

      const policies = await storage.getLeavePolicies(empCompanyId);
      const FALLBACK_QUOTA: Record<string, number> = { sick: 30, vacation: 6, personal: 3 };
      const today = new Date();
      const policyList = policies.length > 0 ? policies : [
        { leaveType: "sick", annualQuota: 30, carryOverEnabled: false, maxCarryOverDays: 0, carryOverExpiryMonth: 3, carryOverExpiryDay: 31 },
        { leaveType: "vacation", annualQuota: 6, carryOverEnabled: false, maxCarryOverDays: 0, carryOverExpiryMonth: 3, carryOverExpiryDay: 31 },
        { leaveType: "personal", annualQuota: 3, carryOverEnabled: false, maxCarryOverDays: 0, carryOverExpiryMonth: 3, carryOverExpiryDay: 31 },
      ];

      const targetEmployeeIds: number[] = [];
      if (employeeId) {
        targetEmployeeIds.push(employeeId);
      } else {
        const companyEmps = await db.select({ id: employees.id }).from(employees)
          .where(and(eq(employees.companyId, empCompanyId), eq(employees.employmentStatus, "active")));
        companyEmps.forEach(e => targetEmployeeIds.push(e.id));
      }

      if (targetEmployeeIds.length === 0) return res.json([]);

      const usedLeaves = await db.select({
        employeeId: leaveRequests.employeeId,
        leaveType: leaveRequests.leaveType,
        totalDays: sql<number>`COALESCE(SUM(${leaveRequests.days}::numeric), 0)`,
      })
        .from(leaveRequests)
        .where(and(
          targetEmployeeIds.length === 1
            ? eq(leaveRequests.employeeId, targetEmployeeIds[0])
            : inArray(leaveRequests.employeeId, targetEmployeeIds),
          inArray(leaveRequests.status, ["approved", "pending"]),
          sql`EXTRACT(YEAR FROM ${leaveRequests.startDate}::date) = ${year}`,
        ))
        .groupBy(leaveRequests.employeeId, leaveRequests.leaveType);

      let allBalances: any[] = [];
      if (companyId && !employeeId) {
        allBalances = await storage.getLeaveBalancesByCompany(companyId, year);
      } else if (employeeId) {
        allBalances = await storage.getLeaveBalances(employeeId, year);
      }

      const summary: any[] = [];
      for (const empId of targetEmployeeIds) {
        for (const p of policyList as any[]) {
          const used = usedLeaves.find(u => u.employeeId === empId && u.leaveType === p.leaveType);
          const usedDays = used ? Number(used.totalDays) : 0;
          const balance = allBalances.find((b: any) => b.employeeId === empId && b.leaveType === p.leaveType);
          const quota = policies.length > 0 ? Number(p.annualQuota) : (FALLBACK_QUOTA[p.leaveType] || 0);
          const carriedOver = balance ? Number(balance.carriedOver) : 0;
          const expired = balance ? Number(balance.expired) : 0;

          let carryOverExpired = false;
          const actualExpiryDate = balance?.carryOverExpiryDate || null;
          if (carriedOver > 0 && actualExpiryDate) {
            carryOverExpired = today > new Date(actualExpiryDate);
          }

          const effectiveCarriedOver = carryOverExpired ? 0 : carriedOver;
          const totalAvailable = quota + effectiveCarriedOver - expired;
          const remaining = Math.max(0, totalAvailable - usedDays);

          summary.push({
            employeeId: empId,
            leaveType: p.leaveType,
            quota,
            carriedOver,
            effectiveCarriedOver,
            used: usedDays,
            expired,
            remaining,
            carryOverExpired,
            carryOverExpiryDate: actualExpiryDate,
          });
        }
      }

      res.json(summary);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/leave-balances/carry-over", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      const { companyId, fromYear } = req.body;
      if (!companyId || !fromYear) return res.status(400).json({ message: "companyId and fromYear required" });
      if (!isPrivilegedRole(user.role)) {
        const viewingOwn = await isViewingOwnCompany(user.id, companyId);
        if (!viewingOwn) return res.status(403).json({ message: "ไม่มีสิทธิ์ประมวลผลยกยอดบริษัทนี้" });
      }

      const toYear = fromYear + 1;
      const policies = await storage.getLeavePolicies(companyId);
      const carryOverPolicies = policies.filter(p => p.carryOverEnabled && p.active);

      if (carryOverPolicies.length === 0) {
        return res.json({ message: "ไม่มีประเภทลาที่เปิดใช้ carry-over", processed: 0 });
      }

      const companyEmployees = await db.select({ id: employees.id }).from(employees)
        .where(and(eq(employees.companyId, companyId), eq(employees.employmentStatus, "active")));

      let processed = 0;

      await db.transaction(async (tx) => {
        for (const emp of companyEmployees) {
          for (const policy of carryOverPolicies) {
            const usedResult = await tx.select({
              totalDays: sql<number>`COALESCE(SUM(${leaveRequests.days}::numeric), 0)`,
            })
              .from(leaveRequests)
              .where(and(
                eq(leaveRequests.employeeId, emp.id),
                eq(leaveRequests.leaveType, policy.leaveType),
                inArray(leaveRequests.status, ["approved"]),
                sql`EXTRACT(YEAR FROM ${leaveRequests.startDate}::date) = ${fromYear}`,
              ));

            const usedDays = usedResult[0] ? Number(usedResult[0].totalDays) : 0;
            const quota = Number(policy.annualQuota);
            const remaining = Math.max(0, quota - usedDays);
            const maxCarry = Number(policy.maxCarryOverDays) || 0;
            const carryAmount = Math.min(remaining, maxCarry);

            const expiryMonth = policy.carryOverExpiryMonth || 3;
            const expiryDay = policy.carryOverExpiryDay || 31;
            const expiryDate = `${toYear}-${String(expiryMonth).padStart(2, "0")}-${String(expiryDay).padStart(2, "0")}`;

            const existingBalances = await tx.select().from(leaveBalances)
              .where(and(
                eq(leaveBalances.employeeId, emp.id),
                eq(leaveBalances.year, toYear),
                eq(leaveBalances.leaveType, policy.leaveType),
              ));
            const existingBalance = existingBalances[0];

            const balanceData = {
              employeeId: emp.id,
              year: toYear,
              leaveType: policy.leaveType,
              quota: String(policy.annualQuota),
              carriedOver: String(carryAmount),
              used: existingBalance ? String(existingBalance.used) : "0",
              expired: existingBalance ? String(existingBalance.expired) : "0",
              carryOverExpiryDate: carryAmount > 0 ? expiryDate : null,
            };
            if (existingBalance) {
              await tx.update(leaveBalances).set(balanceData).where(eq(leaveBalances.id, existingBalance.id));
            } else {
              await tx.insert(leaveBalances).values(balanceData);
            }
            processed++;
          }
        }
      });

      res.json({ message: `ประมวลผลยกยอดสำเร็จ`, processed });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/leave-balances/check-expiry-notifications", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const user = req.user as any;
      if (!isPrivilegedRole(user.role)) {
        return res.status(403).json({ message: "เฉพาะผู้ดูแลระบบเท่านั้น" });
      }
      const { companyId } = req.body;
      if (!companyId || typeof companyId !== "number") return res.status(400).json({ message: "companyId (number) required" });

      const currentYear = new Date().getFullYear();
      const today = new Date();
      const warningDays = 30;
      const warningDate = new Date(today.getTime() + warningDays * 24 * 60 * 60 * 1000);

      const balances = await storage.getLeaveBalancesByCompany(companyId, currentYear);
      const expiringBalances = balances.filter(b => {
        if (Number(b.carriedOver) <= 0 || !b.carryOverExpiryDate) return false;
        const expiry = new Date(b.carryOverExpiryDate);
        return expiry > today && expiry <= warningDate;
      });

      let notified = 0;
      let skipped = 0;
      for (const balance of expiringBalances) {
        const [emp] = await db.select({ userId: employees.userId })
          .from(employees).where(eq(employees.id, balance.employeeId));
        if (!emp?.userId) continue;

        const dedupeTitle = `leave_expiry_${balance.employeeId}_${balance.leaveType}_${balance.carryOverExpiryDate}`;
        const existing = await db.select({ id: notifications.id }).from(notifications)
          .where(and(
            eq(notifications.userId, emp.userId),
            eq(notifications.type, "leave_carry_over_expiry"),
            eq(notifications.title, dedupeTitle),
          ))
          .limit(1);

        if (existing.length > 0) { skipped++; continue; }

        const leaveLabel = LEAVE_TYPE_LABELS[balance.leaveType] || balance.leaveType;
        await db.insert(notifications).values({
          companyId,
          tenantId: user.tenantId,
          userId: emp.userId,
          type: "leave_carry_over_expiry",
          title: dedupeTitle,
          message: `${leaveLabel} ยกมา ${balance.carriedOver} วัน จะหมดอายุวันที่ ${balance.carryOverExpiryDate} กรุณาใช้ก่อนหมดอายุ`,
          link: "/ess",
        });
        notified++;
      }

      res.json({ message: `ส่งแจ้งเตือน ${notified} รายการ`, notified, skipped, expiringCount: expiringBalances.length });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  function resolveCompanyId(req: any): number | null {
    const user = req.user as any;
    return user.companyId || null;
  }

  app.get("/api/scanner-mappings", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const mappings = await storage.getScannerMappings(companyId);
      res.json(mappings);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/scanner-mappings", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const { scannerDeviceId, scannerEmployeeCode, employeeId } = req.body;
      if (!scannerDeviceId || !scannerEmployeeCode || !employeeId) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
      }
      const emp = await storage.getEmployee(Number(employeeId));
      if (!emp || emp.companyId !== companyId) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงพนักงานนี้" });
      }
      const existing = await storage.getScannerMappingByCode(companyId, scannerDeviceId, scannerEmployeeCode);
      if (existing) {
        return res.status(400).json({ message: "มีการจับคู่รหัสนี้แล้ว" });
      }
      const mapping = await storage.createScannerMapping({ companyId, scannerDeviceId, scannerEmployeeCode, employeeId: Number(employeeId) });
      res.status(201).json(mapping);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.put("/api/scanner-mappings/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const id = Number(req.params.id);
      const mappings = await storage.getScannerMappings(companyId);
      const target = mappings.find(m => m.id === id);
      if (!target) return res.status(404).json({ message: "ไม่พบข้อมูลหรือไม่มีสิทธิ์" });
      const { scannerDeviceId, scannerEmployeeCode, employeeId } = req.body;
      if (employeeId) {
        const emp = await storage.getEmployee(Number(employeeId));
        if (!emp || emp.companyId !== companyId) {
          return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงพนักงานนี้" });
        }
      }
      const newDeviceId = scannerDeviceId || target.scannerDeviceId;
      const newCode = scannerEmployeeCode || target.scannerEmployeeCode;
      if (newDeviceId !== target.scannerDeviceId || newCode !== target.scannerEmployeeCode) {
        const dup = await storage.getScannerMappingByCode(companyId, newDeviceId, newCode);
        if (dup && dup.id !== id) {
          return res.status(400).json({ message: "มีการจับคู่รหัสนี้แล้ว" });
        }
      }
      const updated = await storage.updateScannerMapping(id, { scannerDeviceId, scannerEmployeeCode, employeeId: employeeId ? Number(employeeId) : undefined });
      if (!updated) return res.status(404).json({ message: "ไม่พบข้อมูล" });
      res.json(updated);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.delete("/api/scanner-mappings/:id", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const mappings = await storage.getScannerMappings(companyId);
      const target = mappings.find(m => m.id === Number(req.params.id));
      if (!target) return res.status(404).json({ message: "ไม่พบข้อมูลหรือไม่มีสิทธิ์" });
      await storage.deleteScannerMapping(Number(req.params.id));
      res.json({ success: true });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.get("/api/scanner-import-logs", requireAuth, requireModule("hr"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      const logs = await storage.getScannerImportLogs(companyId);
      res.json(logs);
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  const uploadScanner = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

  app.post("/api/scanner-import/preview", requireAuth, requireModule("hr"), uploadScanner.single("file"), async (req, res) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      if (!req.file) return res.status(400).json({ message: "กรุณาอัพโหลดไฟล์" });

      const scannerDeviceId = req.body.scannerDeviceId || "default";
      const records = await parseScannerFile(req.file);

      const mappings = await storage.getScannerMappings(companyId);
      const empList = await storage.getEmployees(undefined, companyId);

      const preview = records.map(r => {
        const mapping = mappings.find(m => m.scannerDeviceId === scannerDeviceId && m.scannerEmployeeCode === r.employeeCode);
        const employee = mapping ? empList.find(e => e.id === mapping.employeeId) : empList.find(e => e.employeeCode === r.employeeCode);
        return {
          ...r,
          matched: !!employee,
          employeeId: employee?.id || null,
          employeeName: employee?.fullName || null,
          systemEmployeeCode: employee?.employeeCode || null,
        };
      });

      const matched = preview.filter(p => p.matched).length;
      const unmatched = preview.filter(p => !p.matched).length;
      res.json({ records: preview, summary: { total: preview.length, matched, unmatched }, filename: decodeMulterFilename(req.file.originalname) });
    } catch (err: any) { res.status(400).json({ message: err.message }); }
  });

  app.post("/api/scanner-import/confirm", requireAuth, requireModule("hr"), uploadScanner.single("file"), async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = resolveCompanyId(req);
      if (!companyId) return res.status(400).json({ message: "กรุณาระบุบริษัท" });
      if (!req.file) return res.status(400).json({ message: "กรุณาอัพโหลดไฟล์" });

      const scannerDeviceId = req.body.scannerDeviceId || "default";
      const records = await parseScannerFile(req.file);
      const mappings = await storage.getScannerMappings(companyId);
      const empList = await storage.getEmployees(undefined, companyId);
      const empIds = new Set(empList.map(e => e.id));

      let created = 0;
      let updated = 0;
      let matchedCount = 0;
      let unmatchedCount = 0;

      for (const r of records) {
        const mapping = mappings.find(m => m.scannerDeviceId === scannerDeviceId && m.scannerEmployeeCode === r.employeeCode);
        const employee = mapping ? empList.find(e => e.id === mapping.employeeId) : empList.find(e => e.employeeCode === r.employeeCode);

        if (!employee || !empIds.has(employee.id)) {
          unmatchedCount++;
          continue;
        }
        matchedCount++;

        const date = r.date;
        const existing = await storage.getAttendanceByDate(employee.id, date);

        if (r.type === "in" || r.type === "check-in") {
          if (!existing) {
            const checkInTime = new Date(r.timestamp);
            const thaiIn = toThaiDate(checkInTime);
            const isLate = thaiIn.hours > 9 || (thaiIn.hours === 9 && thaiIn.minutes > 0);
            await storage.createAttendance({
              employeeId: employee.id,
              date,
              checkIn: checkInTime,
              status: isLate ? "late" : "present",
              source: "scanner",
            });
            created++;
          }
        } else if (r.type === "out" || r.type === "check-out") {
          if (existing && !existing.checkOut) {
            const checkOutTime = new Date(r.timestamp);
            const checkInTime = new Date(existing.checkIn!);
            const diffMs = checkOutTime.getTime() - checkInTime.getTime();
            const totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
            await storage.updateAttendance(existing.id, {
              checkOut: checkOutTime,
              totalHours,
              source: "scanner",
            });
            updated++;
          }
        }
      }

      const log = await storage.createScannerImportLog({
        companyId,
        filename: decodeMulterFilename(req.file.originalname) || "unknown",
        totalRecords: records.length,
        matchedRecords: matchedCount,
        unmatchedRecords: unmatchedCount,
        importedBy: user.id,
      });

      res.json({ success: true, created, updated, log });
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

  app.post("/api/scanner-webhook", async (req, res) => {
    try {
      const webhookToken = process.env.SCANNER_WEBHOOK_TOKEN;
      if (!webhookToken) {
        return res.status(503).json({ message: "Webhook not configured: SCANNER_WEBHOOK_TOKEN is not set" });
      }
      const authHeader = req.headers["x-webhook-token"] || req.headers["authorization"];
      if (authHeader !== webhookToken && authHeader !== `Bearer ${webhookToken}`) {
        return res.status(401).json({ message: "Unauthorized: invalid webhook token" });
      }

      const { device_id, employee_code, timestamp, type, company_id } = req.body;
      if (!device_id || !employee_code || !timestamp || !company_id) {
        return res.status(400).json({ message: "Missing required fields: device_id, employee_code, timestamp, company_id" });
      }

      const companyId = Number(company_id);
      const mapping = await storage.getScannerMappingByCode(companyId, device_id, employee_code);
      if (!mapping) {
        return res.status(404).json({ message: `No mapping found for device ${device_id}, employee code ${employee_code}` });
      }

      const eventTime = new Date(timestamp);
      if (isNaN(eventTime.getTime())) {
        return res.status(400).json({ message: "Invalid timestamp format" });
      }
      const eventType = type || "in";
      if (eventType !== "in" && eventType !== "out") {
        return res.status(400).json({ message: "Invalid type: must be 'in' or 'out'" });
      }
      const thai = toThaiDate(eventTime);
      const date = thai.date;
      const existing = await storage.getAttendanceByDate(mapping.employeeId, date);

      if (eventType === "in") {
        if (existing) {
          return res.json({ message: "Already checked in", record: existing });
        }
        const isLate = thai.hours > 9 || (thai.hours === 9 && thai.minutes > 0);
        const record = await storage.createAttendance({
          employeeId: mapping.employeeId,
          date,
          checkIn: eventTime,
          status: isLate ? "late" : "present",
          source: "webhook",
        });
        res.status(201).json(record);
      } else {
        if (!existing) {
          return res.status(400).json({ message: "No check-in record found" });
        }
        if (existing.checkOut) {
          return res.json({ message: "Already checked out", record: existing });
        }
        const checkInTime = new Date(existing.checkIn!);
        const diffMs = eventTime.getTime() - checkInTime.getTime();
        const totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2);
        const record = await storage.updateAttendance(existing.id, {
          checkOut: eventTime,
          totalHours,
          source: "webhook",
        });
        res.json(record);
      }
    } catch (err: any) { res.status(500).json({ message: err.message }); }
  });

}

async function parseScannerFile(file: Express.Multer.File): Promise<Array<{ employeeCode: string; timestamp: string; date: string; type: string }>> {
  const filename = file.originalname.toLowerCase();
  const content = file.buffer.toString("utf-8");
  const results: Array<{ employeeCode: string; timestamp: string; date: string; type: string }> = [];

  if (filename.endsWith(".csv") || filename.endsWith(".dat") || filename.endsWith(".txt")) {
    const lines = content.split(/\r?\n/).filter(l => l.trim());
    for (const line of lines) {
      const parts = line.split(/[,\t]/);
      if (parts.length < 2) continue;
      const employeeCode = parts[0].trim();
      const timestampStr = parts[1].trim();
      if (!employeeCode || !timestampStr) continue;
      if (/^\d/.test(employeeCode) === false && !/^[A-Z]/i.test(employeeCode)) continue;
      if (employeeCode.toLowerCase() === "employee" || employeeCode.toLowerCase() === "id" || employeeCode.toLowerCase() === "code") continue;

      const parsedTime = parseFlexibleTimestamp(timestampStr);
      if (!parsedTime) continue;

      const type = parts.length > 2 ? normalizeType(parts[2].trim()) : guessType(parsedTime);
      const thai = toThaiDate(parsedTime);
      results.push({ employeeCode, timestamp: parsedTime.toISOString(), date: thai.date, type });
    }
  } else if (filename.endsWith(".xlsx")) {
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return results;

    let headerRow = true;
    worksheet.eachRow((row: any) => {
      if (headerRow) { headerRow = false; return; }
      const employeeCode = String(row.getCell(1).value || "").trim();
      const rawTimestamp = row.getCell(2).value;
      if (!employeeCode || !rawTimestamp) return;

      let parsedTime: Date | null = null;
      if (rawTimestamp instanceof Date) {
        parsedTime = rawTimestamp;
      } else {
        parsedTime = parseFlexibleTimestamp(String(rawTimestamp));
      }
      if (!parsedTime) return;

      const rawType = String(row.getCell(3).value || "").trim();
      const type = rawType ? normalizeType(rawType) : guessType(parsedTime);
      const thai = toThaiDate(parsedTime);
      results.push({ employeeCode, timestamp: parsedTime.toISOString(), date: thai.date, type });
    });
  }

  return results;
}

function parseFlexibleTimestamp(s: string): Date | null {
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const match = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] || 0));
  }
  const match2 = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match2) {
    return new Date(Number(match2[3]), Number(match2[2]) - 1, Number(match2[1]), Number(match2[4]), Number(match2[5]), Number(match2[6] || 0));
  }
  return null;
}

function normalizeType(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower === "in" || lower === "check-in" || lower === "checkin" || lower === "clock-in" || lower === "เข้า" || lower === "0") return "in";
  if (lower === "out" || lower === "check-out" || lower === "checkout" || lower === "clock-out" || lower === "ออก" || lower === "1") return "out";
  return "in";
}

function guessType(time: Date): string {
  const hours = time.getHours();
  return hours < 12 ? "in" : "out";
}
