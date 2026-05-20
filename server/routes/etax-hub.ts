import type { Express, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { workBoards, workBoardGroups, workBoardColumns, workBoardItems, workBoardSubitems, workBoardItemUpdates, workBoardMembers, workBoardViews, workBoardWidgets, workBoardShareLinks, companies, users, firmClients, clientUploadLinks, clientUploadFiles, firmDocuments, firmFolders, tenants, lineGroupMappings, lineDocuments, employees } from "@shared/schema";
import { eq, and, or, desc, asc, sql, inArray, isNull } from "drizzle-orm";
import { requireAuth, requireModule } from "../route-middleware";
import crypto from "crypto";
import { saveBufferLocally } from "../replit_integrations/object_storage/routes";
import multer from "multer";
import { decodeMulterFilename } from "../utils/safe-filename";

async function syncUpdateAttachmentsToDocs(
  itemId: number,
  attachments: any[],
  tenantId: number,
  uploadedBy: number | null,
) {
  if (!Array.isArray(attachments) || attachments.length === 0) return;
  try {
    const [item] = await db.select({
      boardId: workBoardItems.boardId,
      firmClientId: workBoardItems.firmClientId,
      name: workBoardItems.name,
    }).from(workBoardItems).where(eq(workBoardItems.id, itemId));
    if (!item?.firmClientId) return;

    const [fc] = await db.select({ companyId: firmClients.companyId }).from(firmClients).where(eq(firmClients.id, item.firmClientId));
    const clientCompanyId = fc?.companyId || null;

    const [board] = await db.select({ name: workBoards.name }).from(workBoards).where(eq(workBoards.id, item.boardId));
    const folderName = `อัปเดต [${board?.name || "Board"}]`;

    let folder = await db.select().from(firmFolders)
      .where(and(
        eq(firmFolders.tenantId, tenantId),
        eq(firmFolders.name, folderName),
        clientCompanyId ? eq(firmFolders.companyId, clientCompanyId) : isNull(firmFolders.companyId),
      )).then(r => r[0]);

    if (!folder) {
      [folder] = await db.insert(firmFolders).values({
        tenantId,
        companyId: clientCompanyId,
        name: folderName,
      }).returning();
    }

    for (const af of attachments) {
      if (!af?.name || !af?.url) continue;
      const existing = await db.select({ id: firmDocuments.id }).from(firmDocuments)
        .where(and(
          eq(firmDocuments.tenantId, tenantId),
          eq(firmDocuments.fileUrl, af.path || af.url),
          eq(firmDocuments.category, "board"),
        )).then(r => r[0]);
      if (existing) continue;

      await db.insert(firmDocuments).values({
        tenantId,
        companyId: clientCompanyId,
        folderId: folder.id,
        category: "board",
        name: af.name,
        fileUrl: af.path || af.url,
        fileName: af.name,
        fileSize: af.size || 0,
        mimeType: af.type || null,
        uploadedBy,
      });
    }
    console.log(`[Board→Docs sync] ${attachments.length} file(s) from update → ${folderName} (${item.name})`);
  } catch (err: any) {
    console.error("[Board→Docs sync] Error:", err.message);
  }
}

const STATUS_PRESETS = [
  { label: "รอดำเนินการ", color: "#c4c4c4" },
  { label: "กำลังดำเนินการ", color: "#fdab3d" },
  { label: "รอตรวจ", color: "#e2445c" },
  { label: "รับยอดแล้ว", color: "#00c875" },
  { label: "ส่งทดลองแล้ว", color: "#0086c0" },
  { label: "เสร็จสิ้น", color: "#00c875" },
];

const modGuard = requireModule("etax-hub");

function getUserCompanyId(req: Request): number {
  const fromQuery = req.query.companyId ? Number(req.query.companyId) : null;
  const fromBody = req.body?.companyId ? Number(req.body.companyId) : null;
  const user = req.user as any;
  const raw = fromQuery || fromBody || user.activeCompanyId || user.companyId || 0;
  return isNaN(raw) ? 0 : raw;
}

async function verifyBoardOwnership(boardId: number, companyId: number): Promise<boolean> {
  const [board] = await db.select({ id: workBoards.id }).from(workBoards)
    .where(and(eq(workBoards.id, boardId), eq(workBoards.companyId, companyId), eq(workBoards.boardType, "etax-hub")));
  return !!board;
}

async function getBoardIdForGroup(groupId: number): Promise<number | null> {
  const [g] = await db.select({ boardId: workBoardGroups.boardId }).from(workBoardGroups).where(eq(workBoardGroups.id, groupId));
  return g?.boardId ?? null;
}

async function getBoardIdForItem(itemId: number): Promise<number | null> {
  const [i] = await db.select({ boardId: workBoardItems.boardId }).from(workBoardItems).where(eq(workBoardItems.id, itemId));
  return i?.boardId ?? null;
}

async function getBoardIdForSubitem(subitemId: number): Promise<number | null> {
  const [si] = await db.select({ itemId: workBoardSubitems.itemId }).from(workBoardSubitems).where(eq(workBoardSubitems.id, subitemId));
  if (!si) return null;
  return getBoardIdForItem(si.itemId);
}

async function getBoardMemberRole(boardId: number, userId: number): Promise<string | null> {
  const [m] = await db.select({ role: workBoardMembers.role }).from(workBoardMembers)
    .where(and(eq(workBoardMembers.boardId, boardId), eq(workBoardMembers.userId, userId)));
  return m?.role ?? null;
}

async function checkBoardAccess(boardId: number, userId: number, companyId: number, minRole: "viewer" | "editor" | "owner" = "viewer", externalBoardToken?: string): Promise<{ allowed: boolean; role: string | null }> {
  if (externalBoardToken) {
    const [board] = await db.select({ shareToken: workBoards.shareToken, visibility: workBoards.visibility }).from(workBoards).where(eq(workBoards.id, boardId));
    if (board?.shareToken === externalBoardToken && board?.visibility === "shareable") {
      return { allowed: true, role: "viewer" };
    }
    return { allowed: false, role: null };
  }
  if (!await verifyBoardOwnership(boardId, companyId)) return { allowed: false, role: null };
  const [board] = await db.select({ createdBy: workBoards.createdBy }).from(workBoards).where(eq(workBoards.id, boardId));
  if (board?.createdBy === userId) return { allowed: true, role: "owner" };
  const memberRole = await getBoardMemberRole(boardId, userId);
  if (!memberRole) {
    const memberCount = await db.select({ count: sql<number>`count(*)` }).from(workBoardMembers).where(eq(workBoardMembers.boardId, boardId));
    if (Number(memberCount[0].count) === 0) return { allowed: true, role: "owner" };
    return { allowed: false, role: null };
  }
  const roleLevel: Record<string, number> = { viewer: 1, editor: 2, owner: 3 };
  if ((roleLevel[memberRole] || 0) >= (roleLevel[minRole] || 0)) return { allowed: true, role: memberRole };
  return { allowed: false, role: memberRole };
}

export function registerEtaxHubRoutes(app: Express) {
  const EXTERNAL_READ_PATHS = ["/api/etax-hub/boards", "/api/etax-hub/stats"];
  const EXTERNAL_READ_PATTERNS = [/^\/api\/etax-hub\/boards\/\d+\/data$/, /^\/api\/etax-hub\/boards\/\d+\/my-role$/, /^\/api\/etax-hub\/boards\/\d+\/views$/];
  const EXTERNAL_WRITE_PATHS = ["/api/etax-hub/relink-board"];
  app.use("/api/etax-hub", (req, res, next) => {
    const user = req.user as any;
    if (!user || user.role !== "client_external") return next();
    const path = req.originalUrl.split("?")[0];
    if (req.method !== "GET") {
      if (EXTERNAL_WRITE_PATHS.includes(path)) return next();
      return res.status(403).json({ message: "ไม่มีสิทธิ์ (read-only)" });
    }
    if (EXTERNAL_READ_PATHS.includes(path)) return next();
    if (EXTERNAL_READ_PATTERNS.some(p => p.test(path))) return next();
    return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึง" });
  });

  app.get("/api/etax-hub/boards", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role === "client_external" && user.externalBoardToken) {
        const boards = await db.select().from(workBoards)
          .where(and(eq(workBoards.shareToken, user.externalBoardToken), eq(workBoards.visibility, "shareable")))
          .orderBy(asc(workBoards.createdAt));
        const boardsWithCounts = await Promise.all(boards.map(async (b) => {
          const [{ count: itemCount }] = await db.select({ count: sql<number>`count(*)` })
            .from(workBoardItems).where(eq(workBoardItems.boardId, b.id));
          return { ...b, itemCount: Number(itemCount) };
        }));
        return res.json(boardsWithCounts);
      }

      const companyId = getUserCompanyId(req);
      const userId = user.id;
      const includeArchived = req.query.includeArchived === "true";
      const conditions = [eq(workBoards.companyId, companyId), eq(workBoards.boardType, "etax-hub")];
      if (!includeArchived) {
        conditions.push(sql`(${workBoards.isArchived} IS NULL OR ${workBoards.isArchived} = false)`);
      }
      const boards = await db.select().from(workBoards)
        .where(and(...conditions))
        .orderBy(asc(workBoards.createdAt));

      const isAdmin = user.role === "admin" || user.role === "super_admin" || user.role === "manager";

      const visibleBoards = isAdmin ? boards : await Promise.all(boards.map(async (b) => {
        if (b.createdBy === userId) return b;
        const [memberRow] = await db.select({ count: sql<number>`count(*)::int` }).from(workBoardMembers).where(eq(workBoardMembers.boardId, b.id));
        const memberCount = Number(memberRow.count);
        if (memberCount === 0) return b;
        const [myMember] = await db.select().from(workBoardMembers).where(and(eq(workBoardMembers.boardId, b.id), eq(workBoardMembers.userId, userId)));
        return myMember ? b : null;
      })).then(results => results.filter(Boolean));

      const boardsWithCounts = await Promise.all(visibleBoards.map(async (b: any) => {
        const [{ count: itemCount }] = await db.select({ count: sql<number>`count(*)` })
          .from(workBoardItems).where(eq(workBoardItems.boardId, b.id));
        return { ...b, itemCount: Number(itemCount) };
      }));

      res.json(boardsWithCounts);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/stats", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const tenantId = user.tenantId;

      const boards = await db.select({ id: workBoards.id }).from(workBoards)
        .where(and(eq(workBoards.companyId, companyId), eq(workBoards.boardType, "etax-hub")));
      const totalBoards = boards.length;

      let totalUsers = 0;
      let employeeCount = 0;
      let guestCount = 0;
      if (tenantId) {
        const allUsers = await db.select({ role: users.role }).from(users)
          .where(and(eq(users.tenantId, tenantId), eq(users.active, true)));
        totalUsers = allUsers.length;
        guestCount = allUsers.filter(u => u.role === "client_external").length;
        employeeCount = totalUsers - guestCount;
      }

      res.json({ totalUsers, employeeCount, guestCount, totalBoards });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { name, color } = req.body;
      console.log("[etax-hub] Creating board:", { companyId, name, color, userId: user.id });

      const [board] = await db.insert(workBoards).values({
        companyId,
        name: name || "บอร์ดใหม่",
        color: color || "#539BFF",
        boardType: "etax-hub",
        createdBy: user.id,
      }).returning();
      console.log("[etax-hub] Board created:", board.id);

      await db.insert(workBoardMembers).values({
        boardId: board.id,
        userId: user.id,
        role: "owner",
        addedBy: user.id,
      });

      await db.insert(workBoardGroups).values({
        boardId: board.id,
        name: "New",
        color: "#579bfc",
        position: 0,
      });

      await db.insert(workBoardColumns).values([
        { boardId: board.id, name: "เลขผู้เสียภาษี", columnType: "text", position: 0 },
        { boardId: board.id, name: "ผู้รับผิดชอบ", columnType: "person", position: 1 },
      ]);

      res.json(board);
    } catch (e: any) {
      console.error("[etax-hub] Board creation error:", e.message, e.stack?.slice(0, 300));
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards/:id/duplicate", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const srcId = parseInt(req.params.id);
      if (!await verifyBoardOwnership(srcId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const [srcBoard] = await db.select().from(workBoards).where(eq(workBoards.id, srcId));
      if (!srcBoard) return res.status(404).json({ message: "ไม่พบบอร์ด" });

      const [newBoard] = await db.insert(workBoards).values({
        companyId,
        name: req.body.name || `${srcBoard.name} (สำเนา)`,
        color: srcBoard.color,
        boardType: srcBoard.boardType,
        createdBy: user.id,
      }).returning();

      const groupIdMap = new Map<number, number>();
      const srcGroups = await db.select().from(workBoardGroups).where(eq(workBoardGroups.boardId, srcId)).orderBy(asc(workBoardGroups.position));
      for (const g of srcGroups) {
        const [newGroup] = await db.insert(workBoardGroups).values({ boardId: newBoard.id, name: g.name, color: g.color, position: g.position }).returning();
        groupIdMap.set(g.id, newGroup.id);
      }

      const colIdMap = new Map<number, number>();
      const srcCols = await db.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, srcId)).orderBy(asc(workBoardColumns.position));
      for (const c of srcCols) {
        const [newCol] = await db.insert(workBoardColumns).values({ boardId: newBoard.id, name: c.name, columnType: c.columnType, options: c.options, position: c.position }).returning();
        colIdMap.set(c.id, newCol.id);
      }

      const srcItems = await db.select().from(workBoardItems).where(eq(workBoardItems.boardId, srcId)).orderBy(asc(workBoardItems.position));
      for (const item of srcItems) {
        let newCellValues = item.cellValues || "{}";
        try {
          const parsed = JSON.parse(newCellValues);
          const remapped: Record<string, any> = {};
          for (const [key, val] of Object.entries(parsed)) {
            const oldColId = parseInt(key);
            const newColId = colIdMap.get(oldColId);
            if (newColId !== undefined) {
              remapped[String(newColId)] = val;
            } else {
              remapped[key] = val;
            }
          }
          newCellValues = JSON.stringify(remapped);
        } catch {}
        const newGroupId = item.groupId ? groupIdMap.get(item.groupId) ?? null : null;
        await db.insert(workBoardItems).values({
          boardId: newBoard.id,
          groupId: newGroupId,
          name: item.name,
          cellValues: newCellValues,
          position: item.position,
          createdBy: user.id,
        });
      }

      res.json(newBoard);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/boards/:id/data", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = user.role === "client_external" ? 0 : getUserCompanyId(req);
      const access = await checkBoardAccess(boardId, user.id, companyId, "viewer", user.role === "client_external" ? user.externalBoardToken : undefined);
      if (!access.allowed) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบอร์ดนี้" });
      }

      const [groups, columns, items] = await Promise.all([
        db.select().from(workBoardGroups).where(eq(workBoardGroups.boardId, boardId)).orderBy(asc(workBoardGroups.position)),
        db.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, boardId)).orderBy(asc(workBoardColumns.position)),
        db.select().from(workBoardItems).where(eq(workBoardItems.boardId, boardId)).orderBy(asc(workBoardItems.position)),
      ]);

      const itemIds = items.map(i => i.id);
      let subitems: any[] = [];
      let updateCounts: Record<number, number> = {};
      let updaters: Record<number, { id: number; name: string }> = {};

      if (itemIds.length > 0) {
        const updaterIds = [...new Set(items.map(i => i.updatedBy).filter(Boolean))] as number[];

        const [subitemsResult, countsResult, uRows] = await Promise.all([
          db.select().from(workBoardSubitems).where(inArray(workBoardSubitems.itemId, itemIds)).orderBy(asc(workBoardSubitems.position)),
          db.select({
            itemId: workBoardItemUpdates.itemId,
            count: sql<number>`count(*)::int`,
          }).from(workBoardItemUpdates).where(and(
            inArray(workBoardItemUpdates.itemId, itemIds),
            eq(workBoardItemUpdates.updateType, "message"),
          )).groupBy(workBoardItemUpdates.itemId),
          updaterIds.length > 0
            ? db.select({ id: users.id, name: users.fullName }).from(users).where(inArray(users.id, updaterIds))
            : Promise.resolve([]),
        ]);

        subitems = subitemsResult;
        updateCounts = Object.fromEntries(countsResult.map(c => [c.itemId, c.count]));
        updaters = Object.fromEntries(uRows.map(u => [u.id, u]));
      }

      res.json({ groups, columns, items, subitems, updateCounts, updaters, myRole: access.role });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/boards/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const access = await checkBoardAccess(id, user.id, companyId, "owner");
      if (!access.allowed) {
        return res.status(403).json({ message: "เฉพาะ Owner เท่านั้นที่แก้ไขบอร์ดได้" });
      }
      const { name, color, visibility, isArchived } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (color !== undefined) updates.color = color;
      if (isArchived !== undefined) updates.isArchived = !!isArchived;
      if (visibility !== undefined) {
        if (!["main", "shareable"].includes(visibility)) {
          return res.status(400).json({ message: "visibility ต้องเป็น main หรือ shareable" });
        }
        updates.visibility = visibility;
        if (visibility === "shareable") {
          const [existing] = await db.select({ shareToken: workBoards.shareToken }).from(workBoards).where(eq(workBoards.id, id));
          if (!existing?.shareToken) {
            updates.shareToken = crypto.randomBytes(24).toString("hex");
            updates.sharedAt = new Date();
          }
        } else if (visibility === "main") {
          updates.shareToken = null;
          updates.sharedAt = null;
        }
      }
      const [board] = await db.update(workBoards).set(updates).where(eq(workBoards.id, id)).returning();
      res.json(board);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/boards/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const access = await checkBoardAccess(id, user.id, companyId, "owner");
      if (!access.allowed) {
        return res.status(403).json({ message: "เฉพาะ Owner เท่านั้นที่ลบบอร์ดได้" });
      }
      const items = await db.select({ id: workBoardItems.id }).from(workBoardItems).where(eq(workBoardItems.boardId, id));
      const itemIds = items.map(i => i.id);
      if (itemIds.length > 0) {
        await db.delete(workBoardSubitems).where(inArray(workBoardSubitems.itemId, itemIds));
      }
      await db.delete(workBoardItems).where(eq(workBoardItems.boardId, id));
      await db.delete(workBoardColumns).where(eq(workBoardColumns.boardId, id));
      await db.delete(workBoardGroups).where(eq(workBoardGroups.boardId, id));
      await db.delete(workBoards).where(eq(workBoards.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards/:id/groups", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      if (!await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงบอร์ดนี้" });
      }
      const { name, color } = req.body;
      const existing = await db.select({ position: workBoardGroups.position }).from(workBoardGroups)
        .where(eq(workBoardGroups.boardId, boardId)).orderBy(desc(workBoardGroups.position)).limit(1);
      const nextPos = existing.length > 0 ? existing[0].position + 1 : 0;
      const [group] = await db.insert(workBoardGroups).values({
        boardId, name: name || "กลุ่มใหม่", color: color || "#539BFF", position: nextPos,
      }).returning();
      res.json(group);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/groups/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      const boardId = await getBoardIdForGroup(id);
      if (!boardId || !await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.color !== undefined) updates.color = req.body.color;
      if (req.body.collapsed !== undefined) updates.collapsed = req.body.collapsed;
      if (req.body.position !== undefined) {
        const newPos = Number(req.body.position);
        const [current] = await db.select().from(workBoardGroups).where(eq(workBoardGroups.id, id));
        if (current) {
          const oldPos = current.position;
          if (newPos < oldPos) {
            await db.execute(sql`UPDATE work_board_groups SET position = position + 1 WHERE board_id = ${boardId} AND position >= ${newPos} AND position < ${oldPos} AND id != ${id}`);
          } else if (newPos > oldPos) {
            await db.execute(sql`UPDATE work_board_groups SET position = position - 1 WHERE board_id = ${boardId} AND position > ${oldPos} AND position <= ${newPos} AND id != ${id}`);
          }
          updates.position = newPos;
        }
      }
      const [group] = await db.update(workBoardGroups).set(updates).where(eq(workBoardGroups.id, id)).returning();
      res.json(group);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/groups/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      const boardId = await getBoardIdForGroup(id);
      if (!boardId || !await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const items = await db.select({ id: workBoardItems.id }).from(workBoardItems).where(eq(workBoardItems.groupId, id));
      const itemIds = items.map(i => i.id);
      if (itemIds.length > 0) {
        await db.delete(workBoardSubitems).where(inArray(workBoardSubitems.itemId, itemIds));
        await db.delete(workBoardItems).where(eq(workBoardItems.groupId, id));
      }
      await db.delete(workBoardGroups).where(eq(workBoardGroups.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards/:id/columns", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      if (!await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const { name, columnType, options, level, afterColumnId } = req.body;
      const colLevel = level === "subitem" ? "subitem" : "main";
      let insertPos: number;
      if (afterColumnId) {
        const [refCol] = await db.select({ position: workBoardColumns.position }).from(workBoardColumns)
          .where(eq(workBoardColumns.id, Number(afterColumnId)));
        if (refCol) {
          insertPos = refCol.position + 1;
          await db.execute(sql`UPDATE work_board_columns SET position = position + 1 WHERE board_id = ${boardId} AND level = ${colLevel} AND position >= ${insertPos}`);
        } else {
          const existing = await db.select({ position: workBoardColumns.position }).from(workBoardColumns)
            .where(and(eq(workBoardColumns.boardId, boardId), eq(workBoardColumns.level, colLevel))).orderBy(desc(workBoardColumns.position)).limit(1);
          insertPos = existing.length > 0 ? existing[0].position + 1 : 0;
        }
      } else {
        const existing = await db.select({ position: workBoardColumns.position }).from(workBoardColumns)
          .where(and(eq(workBoardColumns.boardId, boardId), eq(workBoardColumns.level, colLevel))).orderBy(desc(workBoardColumns.position)).limit(1);
        insertPos = existing.length > 0 ? existing[0].position + 1 : 0;
      }
      const [col] = await db.insert(workBoardColumns).values({
        boardId, name, columnType: columnType || "text", options, position: insertPos, level: colLevel,
      }).returning();
      res.json(col);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/columns/reorder", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { boardId, columnIds } = req.body;
      if (!boardId || !Array.isArray(columnIds)) {
        return res.status(400).json({ message: "boardId and columnIds required" });
      }
      const bId = typeof boardId === "string" ? parseInt(boardId, 10) : boardId;
      if (isNaN(bId)) return res.status(400).json({ message: "Invalid boardId" });
      const access = await checkBoardAccess(bId, user.id, companyId);
      if (!access.allowed) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const parsedIds = columnIds.map((id: any) => typeof id === "string" ? parseInt(id, 10) : id).filter((id: number) => !isNaN(id));
      if (parsedIds.length === 0) return res.status(400).json({ message: "No valid columnIds" });
      for (let i = 0; i < parsedIds.length; i++) {
        await db.update(workBoardColumns).set({ position: i })
          .where(and(eq(workBoardColumns.id, parsedIds[i]), eq(workBoardColumns.boardId, bId)));
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/columns/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      const [col] = await db.select({ boardId: workBoardColumns.boardId }).from(workBoardColumns).where(eq(workBoardColumns.id, id));
      if (!col || !await verifyBoardOwnership(col.boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.columnType !== undefined) updates.columnType = req.body.columnType;
      if (req.body.options !== undefined) updates.options = req.body.options;
      await db.update(workBoardColumns).set(updates).where(eq(workBoardColumns.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/columns/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      const [col] = await db.select({ boardId: workBoardColumns.boardId }).from(workBoardColumns).where(eq(workBoardColumns.id, id));
      if (!col || !await verifyBoardOwnership(col.boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      await db.delete(workBoardColumns).where(eq(workBoardColumns.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/items/import-companies", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { boardId, groupId } = req.body;
      if (!boardId || !groupId) {
        return res.status(400).json({ message: "boardId and groupId required" });
      }
      if (!await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }

      const tenantId = user.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "ไม่พบ tenantId ของผู้ใช้" });
      }
      const fcRows = await db.select({
        id: firmClients.id,
        name: firmClients.name,
        taxId: firmClients.taxId,
        assignedTo: firmClients.assignedTo,
        companyId: firmClients.companyId,
      }).from(firmClients)
        .innerJoin(companies, eq(firmClients.companyId, companies.id))
        .where(eq(companies.tenantId, tenantId))
        .orderBy(asc(firmClients.name));

      const allCompanies = fcRows.map(fc => ({
        id: fc.companyId!,
        name: fc.name,
        taxId: fc.taxId,
        assignedTo: fc.assignedTo,
      }));

      const boardCols = await db.select({ id: workBoardColumns.id, name: workBoardColumns.name }).from(workBoardColumns)
        .where(eq(workBoardColumns.boardId, boardId));
      let taxIdColId = boardCols.find(c => c.name === "เลขผู้เสียภาษี")?.id;
      let personColId = boardCols.find(c => c.name === "ผู้รับผิดชอบ")?.id;

      const maxPos = boardCols.length;
      if (!taxIdColId) {
        const [newCol] = await db.insert(workBoardColumns).values({
          boardId, name: "เลขผู้เสียภาษี", columnType: "text", position: maxPos,
        }).returning();
        taxIdColId = newCol.id;
      }
      if (!personColId) {
        const [newCol] = await db.insert(workBoardColumns).values({
          boardId, name: "ผู้รับผิดชอบ", columnType: "person", position: maxPos + 1,
        }).returning();
        personColId = newCol.id;
      }

      const companyMap = new Map(allCompanies.map(c => [c.name, c]));

      const existingItemsFull = await db.select({ id: workBoardItems.id, name: workBoardItems.name, cellValues: workBoardItems.cellValues }).from(workBoardItems)
        .where(eq(workBoardItems.boardId, boardId));
      let updated = 0;
      for (const item of existingItemsFull) {
        const company = companyMap.get(item.name);
        if (!company) continue;
        const cv = typeof item.cellValues === "string" ? JSON.parse(item.cellValues || "{}") : (item.cellValues || {});
        let changed = false;
        if (taxIdColId && company.taxId && !cv[String(taxIdColId)]) {
          cv[String(taxIdColId)] = company.taxId;
          changed = true;
        }
        if (personColId && company.assignedTo && !cv[String(personColId)]) {
          cv[String(personColId)] = String(company.assignedTo);
          changed = true;
        }
        if (changed) {
          await db.update(workBoardItems).set({ cellValues: JSON.stringify(cv) }).where(eq(workBoardItems.id, item.id));
          updated++;
        }
      }

      const validNames = new Set(allCompanies.map(c => c.name));
      const existingNames = new Set(existingItemsFull.map(i => i.name));
      const newCompanies = allCompanies.filter(c => !existingNames.has(c.name));

      const staleItems = existingItemsFull.filter(i => !validNames.has(i.name));
      const seenNames = new Set<string>();
      const duplicateItems: number[] = [];
      for (const item of existingItemsFull) {
        if (seenNames.has(item.name)) {
          duplicateItems.push(item.id);
        } else {
          seenNames.add(item.name);
        }
      }
      const removeIds = [...staleItems.map(i => i.id), ...duplicateItems];
      let removed = 0;
      if (removeIds.length > 0) {
        await db.delete(workBoardItems).where(inArray(workBoardItems.id, removeIds));
        removed = removeIds.length;
      }

      if (newCompanies.length > 0) {
        const lastItem = await db.select({ position: workBoardItems.position }).from(workBoardItems)
          .where(and(eq(workBoardItems.boardId, boardId), eq(workBoardItems.groupId, groupId)))
          .orderBy(desc(workBoardItems.position)).limit(1);
        let nextPos = lastItem.length > 0 ? lastItem[0].position + 1 : 0;

        const values = newCompanies.map(c => {
          const cellValues: Record<string, string> = {};
          if (taxIdColId && c.taxId) {
            cellValues[String(taxIdColId)] = c.taxId;
          }
          if (personColId && c.assignedTo) {
            cellValues[String(personColId)] = String(c.assignedTo);
          }
          return {
            boardId, groupId, name: c.name, position: nextPos++, createdBy: user.id,
            cellValues: JSON.stringify(cellValues),
          };
        });
        await db.insert(workBoardItems).values(values);
      }

      const parts = [];
      if (newCompanies.length > 0) parts.push(`นำเข้า ${newCompanies.length} บริษัทใหม่`);
      if (updated > 0) parts.push(`อัพเดทข้อมูล ${updated} บริษัท`);
      if (removed > 0) parts.push(`ลบรายการเก่า ${removed} รายการ`);
      if (parts.length === 0) parts.push("ข้อมูลครบถ้วนแล้ว ไม่มีการเปลี่ยนแปลง");
      res.json({ imported: newCompanies.length, updated, removed, message: parts.join(", ") });
    } catch (e: any) {
      console.error("[etax-hub] import-companies error:", e.message, e.stack?.slice(0, 300));
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards/:id/sync-assignments", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      if (isNaN(boardId)) return res.status(400).json({ message: "Invalid board ID" });
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const access = await checkBoardAccess(boardId, user.id, companyId, "editor");
      if (!access.allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดนี้" });

      const tenantId = user.tenantId;
      if (!tenantId) return res.status(400).json({ message: "ไม่พบ tenant" });

      const allEmployees = await db.select({
        id: employees.id,
        fullName: employees.fullName,
        nickname: employees.nickname,
      }).from(employees)
        .innerJoin(companies, eq(employees.companyId, companies.id))
        .where(eq(companies.tenantId, tenantId));

      const nicknameMap = new Map<string, number>();
      const nameMap = new Map<string, number>();
      for (const emp of allEmployees) {
        if (emp.nickname) {
          nicknameMap.set(emp.nickname.trim().toLowerCase(), emp.id);
        }
        if (emp.fullName) {
          nameMap.set(emp.fullName.trim().toLowerCase(), emp.id);
          const parts = emp.fullName.trim().split(/\s+/);
          if (parts.length > 1) {
            nameMap.set(parts[0].toLowerCase(), emp.id);
          }
        }
        nicknameMap.set(String(emp.id), emp.id);
      }

      const boardCols = await db.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, boardId));
      const personCol = boardCols.find(c => c.columnType === "person");
      if (!personCol) return res.status(400).json({ message: "ไม่พบคอลัมน์ผู้รับผิดชอบ" });

      const fcRows = await db.select({
        id: firmClients.id,
        name: firmClients.name,
        assignedTo: firmClients.assignedTo,
        companyId: firmClients.companyId,
      }).from(firmClients)
        .innerJoin(companies, eq(firmClients.companyId, companies.id))
        .where(eq(companies.tenantId, tenantId));
      const fcByName = new Map(fcRows.map(fc => [fc.name, fc]));

      const boardItems = await db.select({
        id: workBoardItems.id,
        name: workBoardItems.name,
        cellValues: workBoardItems.cellValues,
        firmClientId: workBoardItems.firmClientId,
      }).from(workBoardItems).where(eq(workBoardItems.boardId, boardId));

      let synced = 0;
      let linked = 0;
      let normalized = 0;
      const unmapped: string[] = [];

      for (const item of boardItems) {
        const cv = typeof item.cellValues === "string" ? JSON.parse(item.cellValues || "{}") : (item.cellValues || {});
        const personVal = (cv[String(personCol.id)] || "").toString().trim();
        const fc = fcByName.get(item.name);

        if (fc && !item.firmClientId) {
          await db.update(workBoardItems).set({ firmClientId: fc.id }).where(eq(workBoardItems.id, item.id));
          linked++;
        }

        if (!personVal || personVal === "ยังไม่ได้แจก") continue;

        let empId: number | null = null;
        const asNum = Number(personVal);
        if (!isNaN(asNum) && allEmployees.some(e => e.id === asNum)) {
          empId = asNum;
        } else {
          empId = nicknameMap.get(personVal.toLowerCase()) || nameMap.get(personVal.toLowerCase()) || null;
        }

        if (!empId) {
          if (!unmapped.includes(personVal)) unmapped.push(personVal);
          continue;
        }

        if (fc && fc.assignedTo !== empId) {
          await db.update(firmClients).set({ assignedTo: empId }).where(eq(firmClients.id, fc.id));
          synced++;
        }

        if (String(empId) !== personVal) {
          cv[String(personCol.id)] = String(empId);
          await db.update(workBoardItems).set({ cellValues: JSON.stringify(cv) }).where(eq(workBoardItems.id, item.id));
          normalized++;
        }
      }

      res.json({
        synced,
        linked,
        normalized,
        unmapped,
        total: boardItems.length,
        message: `Sync: ${synced} firm_clients อัปเดต, ${linked} items เชื่อม firm_client_id, ${normalized} ค่าถูก normalize` +
          (unmapped.length > 0 ? ` | ไม่พบ: ${unmapped.join(", ")}` : ""),
      });
    } catch (e: any) {
      console.error("[etax-hub] sync-assignments error:", e.message, e.stack?.slice(0, 300));
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/items", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { boardId, groupId, name, cellValues } = req.body;
      const access = await checkBoardAccess(boardId, user.id, companyId, "editor");
      if (!access.allowed) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดนี้" });
      }
      const existing = await db.select({ position: workBoardItems.position }).from(workBoardItems)
        .where(and(eq(workBoardItems.boardId, boardId), eq(workBoardItems.groupId, groupId)))
        .orderBy(desc(workBoardItems.position)).limit(1);
      const nextPos = existing.length > 0 ? existing[0].position + 1 : 0;
      const [item] = await db.insert(workBoardItems).values({
        boardId, groupId, name, position: nextPos, createdBy: user.id,
        ...(cellValues ? { cellValues } : {}),
      }).returning();
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/items/batch-create", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { boardId, groupId, items } = req.body;
      if (!boardId || !groupId || !Array.isArray(items) || !items.length) {
        return res.status(400).json({ message: "Missing boardId, groupId or items" });
      }
      const access = await checkBoardAccess(boardId, user.id, companyId, "editor");
      if (!access.allowed) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดนี้" });
      }
      const existing = await db.select({ position: workBoardItems.position }).from(workBoardItems)
        .where(and(eq(workBoardItems.boardId, boardId), eq(workBoardItems.groupId, groupId)))
        .orderBy(desc(workBoardItems.position)).limit(1);
      let nextPos = existing.length > 0 ? existing[0].position + 1 : 0;

      const BATCH = 50;
      let created = 0;
      for (let i = 0; i < items.length; i += BATCH) {
        const chunk = items.slice(i, i + BATCH);
        const values = chunk.map((it: any) => ({
          boardId,
          groupId,
          name: String(it.name || "").trim() || "Untitled",
          cellValues: it.cellValues || "{}",
          position: nextPos++,
          createdBy: user.id,
        }));
        await db.insert(workBoardItems).values(values);
        created += values.length;
      }
      res.json({ ok: true, created });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/items/bulk-update", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { itemIds, columnId, value } = req.body;
      if (!Array.isArray(itemIds) || !itemIds.length || columnId === undefined) {
        return res.status(400).json({ message: "Missing itemIds or columnId" });
      }
      const safeIds = itemIds.map(Number).filter(n => !isNaN(n) && n > 0);
      const safeColId = Number(columnId);
      if (!safeIds.length || isNaN(safeColId)) {
        return res.status(400).json({ message: "Invalid itemIds or columnId" });
      }
      const allItems = await db.select().from(workBoardItems).where(inArray(workBoardItems.id, safeIds));
      if (!allItems.length) return res.status(404).json({ message: "ไม่พบรายการ" });
      const boardIds = new Set(allItems.map(i => i.boardId));
      if (boardIds.size !== 1) return res.status(400).json({ message: "Items must belong to same board" });
      const boardId = allItems[0].boardId;
      const access = await checkBoardAccess(boardId, user.id, companyId, "editor");
      if (!access.allowed) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดนี้" });
      }
      let updated = 0;
      const userId = (req.user as any).id;
      for (const item of allItems) {
        const cv = typeof item.cellValues === "string" ? JSON.parse(item.cellValues || "{}") : (item.cellValues || {});
        cv[String(safeColId)] = value;
        await db.update(workBoardItems).set({ cellValues: JSON.stringify(cv), updatedAt: new Date(), updatedBy: userId }).where(eq(workBoardItems.id, item.id));
        updated++;
      }
      res.json({ ok: true, updated });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/items/reorder", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { itemId, targetGroupId, targetPosition } = req.body;
      if (!itemId) return res.status(400).json({ message: "Missing itemId" });
      const boardId = await getBoardIdForItem(itemId);
      if (!boardId) return res.status(404).json({ message: "ไม่พบรายการ" });
      const access = await checkBoardAccess(boardId, user.id, companyId, "editor");
      if (!access.allowed) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดนี้" });
      }
      const allItems = await db.select().from(workBoardItems)
        .where(eq(workBoardItems.boardId, boardId))
        .orderBy(asc(workBoardItems.position));
      const movingItem = allItems.find(i => i.id === itemId);
      if (!movingItem) return res.status(404).json({ message: "ไม่พบรายการ" });
      const newGroupId = targetGroupId !== undefined ? targetGroupId : movingItem.groupId;
      const otherItems = allItems.filter(i => i.id !== itemId);
      const sameGroupItems = otherItems.filter(i => i.groupId === newGroupId);
      const pos = Math.max(0, Math.min(targetPosition ?? sameGroupItems.length, sameGroupItems.length));
      sameGroupItems.splice(pos, 0, { ...movingItem, groupId: newGroupId } as any);
      const updates: Promise<any>[] = [];
      for (let i = 0; i < sameGroupItems.length; i++) {
        const it = sameGroupItems[i];
        if (it.position !== i || it.id === itemId) {
          updates.push(
            db.update(workBoardItems)
              .set({ position: i, groupId: it.id === itemId ? newGroupId : it.groupId })
              .where(eq(workBoardItems.id, it.id))
          );
        }
      }
      await Promise.all(updates);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/items/move-to-board", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { itemIds, targetBoardId, targetGroupId } = req.body;
      if (!Array.isArray(itemIds) || !itemIds.length || !targetBoardId) {
        return res.status(400).json({ message: "Missing itemIds or targetBoardId" });
      }
      const safeIds = itemIds.map(Number).filter(n => !isNaN(n) && n > 0);
      if (!safeIds.length) return res.status(400).json({ message: "Invalid itemIds" });

      const srcBoardId = await getBoardIdForItem(safeIds[0]);
      if (!srcBoardId) return res.status(404).json({ message: "ไม่พบรายการ" });
      const srcAccess = await checkBoardAccess(srcBoardId, user.id, companyId, "editor");
      if (!srcAccess.allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดต้นทาง" });

      const destAccess = await checkBoardAccess(Number(targetBoardId), user.id, companyId, "editor");
      if (!destAccess.allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดปลายทาง" });

      let destGroupId = targetGroupId ? Number(targetGroupId) : null;
      if (!destGroupId) {
        const [firstGroup] = await db.select({ id: workBoardGroups.id }).from(workBoardGroups)
          .where(eq(workBoardGroups.boardId, Number(targetBoardId)))
          .orderBy(asc(workBoardGroups.position))
          .limit(1);
        if (!firstGroup) {
          const [newGroup] = await db.insert(workBoardGroups).values({
            boardId: Number(targetBoardId),
            name: "New group of items",
            position: 0,
          }).returning();
          destGroupId = newGroup.id;
        } else {
          destGroupId = firstGroup.id;
        }
      }

      const maxPosResult = await db.select({ maxPos: sql<number>`coalesce(max(position), -1)` })
        .from(workBoardItems).where(eq(workBoardItems.groupId, destGroupId));
      let nextPos = (Number(maxPosResult[0]?.maxPos) || 0) + 1;

      let moved = 0;
      for (const id of safeIds) {
        await db.update(workBoardItems).set({
          boardId: Number(targetBoardId),
          groupId: destGroupId,
          position: nextPos++,
          updatedAt: new Date(),
          updatedBy: user.id,
        }).where(eq(workBoardItems.id, id));
        moved++;
      }

      res.json({ ok: true, moved });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/items/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid item ID" });
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const boardId = await getBoardIdForItem(id);
      if (!boardId) return res.status(404).json({ message: "ไม่พบรายการ" });
      const access = await checkBoardAccess(boardId, user.id, companyId, "editor");
      if (!access.allowed) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดนี้" });
      }
      const [oldItem] = await db.select().from(workBoardItems).where(eq(workBoardItems.id, id));
      const updates: any = { updatedAt: new Date(), updatedBy: user.id };
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.cellValues !== undefined) updates.cellValues = req.body.cellValues;
      if (req.body.groupId !== undefined) updates.groupId = req.body.groupId;
      if (req.body.position !== undefined) updates.position = req.body.position;

      if (req.body.cellValues !== undefined) {
        try {
          const columns = await db.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, boardId!));
          const newCv = typeof req.body.cellValues === "object" ? req.body.cellValues : JSON.parse(req.body.cellValues || "{}");
          const firmClientCol = columns.find((c: any) => c.columnType === "firm_client");
          if (firmClientCol) {
            const fcVal = newCv[String(firmClientCol.id)];
            updates.firmClientId = fcVal ? Number(fcVal) : null;
          }
        } catch (e: any) {
          console.error("[etax-hub] firmClientId extract error:", e.message);
        }
      }

      const [item] = await db.update(workBoardItems).set(updates).where(eq(workBoardItems.id, id)).returning();

      if (req.body.cellValues !== undefined && oldItem) {
        try {
          const columns = await db.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, boardId!));
          const fileCols = columns.filter((c: any) => c.columnType === "file");
          const dateCols = columns.filter((c: any) => c.columnType === "date");
          const itemFirmClientId = item.firmClientId;

          if (fileCols.length > 0 && itemFirmClientId) {
            const oldCv = typeof oldItem.cellValues === "string" ? JSON.parse(oldItem.cellValues || "{}") : (oldItem.cellValues || {});
            const newCv = typeof req.body.cellValues === "object" ? req.body.cellValues : JSON.parse(req.body.cellValues || "{}");

            const board = await db.select().from(workBoards).where(eq(workBoards.id, boardId!)).then(r => r[0]);
            const boardName = board?.name || "Board";

            const parseFiles = (v: any): { name: string; path: string; size?: number }[] => {
              if (!v) return [];
              if (typeof v === "string") { try { const p = JSON.parse(v); return Array.isArray(p) ? p : [p]; } catch { return []; } }
              if (Array.isArray(v)) return v;
              return [v];
            };

            const firmClient = await db.select().from(firmClients).where(eq(firmClients.id, itemFirmClientId)).then(r => r[0]);
            const clientCompanyId = firmClient?.companyId || null;

            for (const fc of fileCols) {
              const oldFiles = parseFiles(oldCv[String(fc.id)]);
              const newFiles = parseFiles(newCv[String(fc.id)]);
              const oldPaths = new Set(oldFiles.map(f => f.path));
              const newPaths = new Set(newFiles.map(f => f.path));
              const addedFiles = newFiles.filter(f => !oldPaths.has(f.path));
              const removedPaths = oldFiles.filter(f => !newPaths.has(f.path)).map(f => f.path);

              if (addedFiles.length > 0 || removedPaths.length > 0) {
                const folderName = `${fc.name} [${boardName}]`;
                let folder = await db.select().from(firmFolders)
                  .where(and(
                    eq(firmFolders.tenantId, user.tenantId),
                    eq(firmFolders.name, folderName),
                    clientCompanyId ? eq(firmFolders.companyId, clientCompanyId) : isNull(firmFolders.companyId),
                  )).then(r => r[0]);

                if (!folder && addedFiles.length > 0) {
                  [folder] = await db.insert(firmFolders).values({
                    tenantId: user.tenantId,
                    companyId: clientCompanyId,
                    name: folderName,
                  }).returning();
                }

                for (const af of addedFiles) {
                  if (folder) {
                    await db.insert(firmDocuments).values({
                      tenantId: user.tenantId,
                      companyId: clientCompanyId,
                      folderId: folder.id,
                      category: "board",
                      name: af.name,
                      fileUrl: af.path,
                      fileName: af.name,
                      fileSize: af.size || 0,
                      uploadedBy: user.id,
                    });
                  }
                }

                for (const rp of removedPaths) {
                  await db.delete(firmDocuments).where(
                    and(
                      eq(firmDocuments.tenantId, user.tenantId),
                      eq(firmDocuments.fileUrl, rp),
                      eq(firmDocuments.category, "board"),
                      folder ? eq(firmDocuments.folderId, folder.id) : sql`true`,
                    )
                  );
                }
              }
            }
          }
        } catch (syncErr: any) {
          console.error("[Board→Client sync] Error:", syncErr.message);
        }
      }

      if (req.body.cellValues !== undefined && oldItem) {
        try {
          const columns2 = await db.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, boardId!));
          const personCol = columns2.find((c: any) => c.columnType === "person");
          if (personCol) {
            const oldCv2 = typeof oldItem.cellValues === "string" ? JSON.parse(oldItem.cellValues || "{}") : (oldItem.cellValues || {});
            const newCv2 = typeof req.body.cellValues === "object" ? req.body.cellValues : JSON.parse(req.body.cellValues || "{}");
            const oldPerson = oldCv2[String(personCol.id)] || "";
            const newPerson = newCv2[String(personCol.id)] || "";
            if (oldPerson !== newPerson && item.name) {
              let fc: { id: number; companyId: number | null } | undefined;
              if (item.firmClientId) {
                fc = await db.select({ id: firmClients.id, companyId: firmClients.companyId })
                  .from(firmClients)
                  .where(eq(firmClients.id, item.firmClientId))
                  .then(r => r[0]);
              }
              if (!fc) {
                fc = await db.select({ id: firmClients.id, companyId: firmClients.companyId })
                  .from(firmClients)
                  .innerJoin(companies, eq(firmClients.companyId, companies.id))
                  .where(and(eq(companies.tenantId, user.tenantId), eq(firmClients.name, item.name)))
                  .then(r => r[0]);
              }
              if (fc) {
                const empId = newPerson === "" ? null : Number(newPerson);
                if (empId === null || !Number.isNaN(empId)) {
                  await db.update(firmClients).set({ assignedTo: empId }).where(eq(firmClients.id, fc.id));
                  if (!item.firmClientId) {
                    await db.update(workBoardItems).set({ firmClientId: fc.id }).where(eq(workBoardItems.id, item.id));
                  }
                  console.log(`[Board→FirmClient sync] ${item.name}: assignedTo → ${empId}`);
                }
              }
            }
          }
        } catch (syncErr: any) {
          console.error("[Board→FirmClient sync] Error:", syncErr.message);
        }
      }

      if (oldItem) {
        const activityLines: string[] = [];

        if (req.body.name !== undefined && req.body.name !== oldItem.name) {
          activityLines.push(`เปลี่ยนชื่อ: ${oldItem.name} → ${req.body.name}`);
        }

        if (req.body.cellValues !== undefined) {
          const oldCv = (typeof oldItem.cellValues === "object" && oldItem.cellValues) ? oldItem.cellValues as Record<string, any> : {};
          const newCv = typeof req.body.cellValues === "object" ? req.body.cellValues : {};
          const allKeys = new Set([...Object.keys(oldCv), ...Object.keys(newCv)]);
          let cols: any[] | null = null;
          let colMap: Record<string, string> = {};
          for (const key of allKeys) {
            const oldRaw = oldCv[key];
            const newRaw = newCv[key];
            const oldStr = oldRaw === null || oldRaw === undefined ? "" : (typeof oldRaw === "object" ? JSON.stringify(oldRaw) : String(oldRaw));
            const newStr = newRaw === null || newRaw === undefined ? "" : (typeof newRaw === "object" ? JSON.stringify(newRaw) : String(newRaw));
            if (oldStr !== newStr) {
              if (!cols) {
                cols = await db.select({ id: workBoardColumns.id, name: workBoardColumns.name }).from(workBoardColumns).where(eq(workBoardColumns.boardId, boardId!));
                colMap = Object.fromEntries(cols.map(c => [String(c.id), c.name]));
              }
              const colName = colMap[key] || `คอลัมน์ ${key}`;
              activityLines.push(`${colName}: ${oldStr || "—"} → ${newStr || "—"}`);
            }
          }
        }

        if (activityLines.length > 0) {
          await db.insert(workBoardItemUpdates).values({
            itemId: id,
            userId: user.id,
            content: activityLines.join("\n"),
            updateType: "activity",
          });
        }
      }

      res.json(item);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/items/batch-delete", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds) || !itemIds.length) {
        return res.status(400).json({ message: "Missing itemIds" });
      }
      const safeIds = itemIds.map(Number).filter(n => !isNaN(n) && n > 0);
      if (!safeIds.length) return res.status(400).json({ message: "Invalid itemIds" });

      const allItems = await db.select().from(workBoardItems).where(inArray(workBoardItems.id, safeIds));
      if (!allItems.length) return res.status(404).json({ message: "ไม่พบรายการ" });
      const boardIds = new Set(allItems.map(i => i.boardId));
      for (const bid of boardIds) {
        const access = await checkBoardAccess(bid, user.id, companyId, "editor");
        if (!access.allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดนี้" });
      }

      await db.delete(workBoardSubitems).where(inArray(workBoardSubitems.itemId, safeIds));
      await db.delete(workBoardItemUpdates).where(inArray(workBoardItemUpdates.itemId, safeIds));
      const result = await db.delete(workBoardItems).where(inArray(workBoardItems.id, safeIds));
      res.json({ ok: true, deleted: safeIds.length });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/items/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: "Invalid item ID" });
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const boardId = await getBoardIdForItem(id);
      if (!boardId) return res.status(404).json({ message: "ไม่พบรายการ" });
      const access = await checkBoardAccess(boardId, user.id, companyId, "editor");
      if (!access.allowed) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขบอร์ดนี้" });
      }
      await db.delete(workBoardSubitems).where(eq(workBoardSubitems.itemId, id));
      await db.delete(workBoardItems).where(eq(workBoardItems.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/subitems", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { itemId, name } = req.body;
      const boardId = await getBoardIdForItem(itemId);
      if (!boardId || !await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const existing = await db.select({ position: workBoardSubitems.position }).from(workBoardSubitems)
        .where(eq(workBoardSubitems.itemId, itemId))
        .orderBy(desc(workBoardSubitems.position)).limit(1);
      const nextPos = existing.length > 0 ? existing[0].position + 1 : 0;
      const [si] = await db.insert(workBoardSubitems).values({
        itemId, name, position: nextPos, createdBy: user.id,
      }).returning();
      res.json(si);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/subitems/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      const boardId = await getBoardIdForSubitem(id);
      if (!boardId || !await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.cellValues !== undefined) updates.cellValues = req.body.cellValues;
      if (req.body.position !== undefined) updates.position = req.body.position;
      const [si] = await db.update(workBoardSubitems).set(updates).where(eq(workBoardSubitems.id, id)).returning();
      res.json(si);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/subitems/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      const boardId = await getBoardIdForSubitem(id);
      if (!boardId || !await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      await db.delete(workBoardSubitems).where(eq(workBoardSubitems.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/work-boards/by-token/:token", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "ยังไม่ได้เข้าสู่ระบบ" });
      const user = req.user as any;
      if (user.role !== "client_external" || user.externalBoardToken !== req.params.token) {
        return res.status(403).json({ message: "คุณไม่มีสิทธิ์เข้าถึงบอร์ดนี้" });
      }
      const { token } = req.params;
      const [board] = await db.select().from(workBoards)
        .where(and(eq(workBoards.shareToken, token), eq(workBoards.visibility, "shareable")));
      if (!board) return res.status(404).json({ message: "ไม่พบบอร์ดหรือยกเลิกการแชร์แล้ว" });

      const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, board.companyId));

      const groups = await db.select().from(workBoardGroups)
        .where(eq(workBoardGroups.boardId, board.id)).orderBy(asc(workBoardGroups.position));
      const columns = await db.select().from(workBoardColumns)
        .where(eq(workBoardColumns.boardId, board.id)).orderBy(asc(workBoardColumns.position));
      const items = await db.select().from(workBoardItems)
        .where(eq(workBoardItems.boardId, board.id)).orderBy(asc(workBoardItems.position));
      const itemIds = items.map(i => i.id);
      const subitems = itemIds.length > 0
        ? await db.select().from(workBoardSubitems).where(inArray(workBoardSubitems.itemId, itemIds)).orderBy(asc(workBoardSubitems.position))
        : [];

      res.json({
        board: { id: board.id, name: board.name, color: board.color },
        companyName: company?.name || "",
        groups,
        columns,
        items,
        subitems,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/shared/board/:token", async (req, res) => {
    try {
      const { token } = req.params;

      let board: any = null;
      let allowedGroupIds: number[] | null = null;
      let shareLabel: string | null = null;

      const [shareLink] = await db.select().from(workBoardShareLinks)
        .where(and(eq(workBoardShareLinks.token, token), eq(workBoardShareLinks.active, true)));

      if (shareLink) {
        const [b] = await db.select().from(workBoards)
          .where(and(eq(workBoards.id, shareLink.boardId), eq(workBoards.visibility, "shareable")));
        board = b;
        allowedGroupIds = shareLink.allowedGroupIds && shareLink.allowedGroupIds.length > 0 ? shareLink.allowedGroupIds : null;
        shareLabel = shareLink.label;
      } else {
        const [b] = await db.select().from(workBoards)
          .where(and(eq(workBoards.shareToken, token), eq(workBoards.visibility, "shareable"), eq(workBoards.boardType, "etax-hub")));
        board = b;
      }

      if (!board) return res.status(404).json({ message: "บอร์ดไม่พบหรือยกเลิกการแชร์แล้ว" });

      const [company] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, board.companyId));

      let groups = await db.select().from(workBoardGroups)
        .where(eq(workBoardGroups.boardId, board.id)).orderBy(asc(workBoardGroups.position));

      if (allowedGroupIds) {
        groups = groups.filter(g => allowedGroupIds!.includes(g.id));
      }

      const groupIds = groups.map(g => g.id);
      const columns = await db.select().from(workBoardColumns)
        .where(eq(workBoardColumns.boardId, board.id)).orderBy(asc(workBoardColumns.position));

      let items: any[];
      if (allowedGroupIds && groupIds.length > 0) {
        items = await db.select().from(workBoardItems)
          .where(and(eq(workBoardItems.boardId, board.id), inArray(workBoardItems.groupId, groupIds)))
          .orderBy(asc(workBoardItems.position));
      } else if (allowedGroupIds && groupIds.length === 0) {
        items = [];
      } else {
        items = await db.select().from(workBoardItems)
          .where(eq(workBoardItems.boardId, board.id)).orderBy(asc(workBoardItems.position));
      }

      const itemIds = items.map(i => i.id);
      const subitems = itemIds.length > 0
        ? await db.select().from(workBoardSubitems).where(inArray(workBoardSubitems.itemId, itemIds)).orderBy(asc(workBoardSubitems.position))
        : [];

      res.json({
        board: { id: board.id, name: board.name, color: board.color },
        companyName: company?.name || "",
        shareLabel,
        groups,
        columns,
        items,
        subitems,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/relink-board", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      if (user.role !== "client_external") {
        return res.status(403).json({ message: "เฉพาะผู้ใช้ภายนอก" });
      }
      const { boardToken } = req.body;
      if (!boardToken) return res.status(400).json({ message: "ไม่ระบุ token" });

      const [board] = await db.select({ id: workBoards.id }).from(workBoards)
        .where(and(eq(workBoards.shareToken, boardToken), eq(workBoards.visibility, "shareable")))
        .limit(1);
      if (!board) return res.status(404).json({ message: "ไม่พบบอร์ดหรือยกเลิกแชร์แล้ว" });

      if (user.externalBoardToken !== boardToken) {
        await db.update(users).set({ externalBoardToken: boardToken }).where(eq(users.id, user.id));
      }
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  async function verifyShareToken(token: string): Promise<{ board: any; allowedGroupIds: number[] | null } | null> {
    const [shareLink] = await db.select().from(workBoardShareLinks)
      .where(and(eq(workBoardShareLinks.token, token), eq(workBoardShareLinks.active, true)));
    if (shareLink) {
      const [board] = await db.select().from(workBoards)
        .where(and(eq(workBoards.id, shareLink.boardId), eq(workBoards.visibility, "shareable")));
      if (!board) return null;
      return { board, allowedGroupIds: shareLink.allowedGroupIds && shareLink.allowedGroupIds.length > 0 ? shareLink.allowedGroupIds : null };
    }
    const [board] = await db.select().from(workBoards)
      .where(and(eq(workBoards.shareToken, token), eq(workBoards.visibility, "shareable"), eq(workBoards.boardType, "etax-hub")));
    if (!board) return null;
    return { board, allowedGroupIds: null };
  }

  app.get("/api/etax-hub/boards/:boardId/share-links", requireAuth, async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      const companyId = parseInt(req.query.companyId as string);
      if (!await verifyBoardOwnership(boardId, companyId)) return res.status(404).json({ message: "ไม่พบบอร์ด" });
      const links = await db.select().from(workBoardShareLinks)
        .where(eq(workBoardShareLinks.boardId, boardId)).orderBy(desc(workBoardShareLinks.createdAt));
      res.json(links);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards/:boardId/share-links", requireAuth, async (req, res) => {
    try {
      const boardId = parseInt(req.params.boardId);
      const { companyId, label, allowedGroupIds } = req.body;
      if (!await verifyBoardOwnership(boardId, companyId)) return res.status(404).json({ message: "ไม่พบบอร์ด" });
      if (!label?.trim()) return res.status(400).json({ message: "กรุณาระบุชื่อลิงก์" });
      const token = crypto.randomBytes(24).toString("hex");
      const user = req.user as any;
      const [link] = await db.insert(workBoardShareLinks).values({
        boardId,
        token,
        label: label.trim(),
        allowedGroupIds: allowedGroupIds && allowedGroupIds.length > 0 ? allowedGroupIds : null,
        active: true,
        createdBy: user.id,
      }).returning();
      res.json(link);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  async function verifyShareLinkOwnership(linkId: number, userId: number): Promise<any> {
    const [link] = await db.select().from(workBoardShareLinks).where(eq(workBoardShareLinks.id, linkId));
    if (!link) return null;
    const [board] = await db.select().from(workBoards).where(eq(workBoards.id, link.boardId));
    if (!board) return null;
    const user = await db.select({ role: users.role, tenantId: users.tenantId }).from(users).where(eq(users.id, userId));
    if (!user.length) return null;
    if (user[0].role === "super_admin") return link;
    const hasAccess = await checkBoardAccess(link.boardId, userId, board.companyId);
    if (!hasAccess) return null;
    return link;
  }

  app.patch("/api/etax-hub/share-links/:linkId", requireAuth, async (req, res) => {
    try {
      const linkId = parseInt(req.params.linkId);
      const user = req.user as any;
      const link = await verifyShareLinkOwnership(linkId, user.id);
      if (!link) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ไขลิงก์นี้" });
      const { label, allowedGroupIds, active } = req.body;
      const updates: any = {};
      if (label !== undefined) updates.label = label.trim();
      if (allowedGroupIds !== undefined) updates.allowedGroupIds = allowedGroupIds.length > 0 ? allowedGroupIds : null;
      if (active !== undefined) updates.active = active;
      const [updated] = await db.update(workBoardShareLinks).set(updates).where(eq(workBoardShareLinks.id, linkId)).returning();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/share-links/:linkId", requireAuth, async (req, res) => {
    try {
      const linkId = parseInt(req.params.linkId);
      const user = req.user as any;
      const link = await verifyShareLinkOwnership(linkId, user.id);
      if (!link) return res.status(403).json({ message: "ไม่มีสิทธิ์ลบลิงก์นี้" });
      await db.delete(workBoardShareLinks).where(eq(workBoardShareLinks.id, linkId));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/shared/board/:token/items/:itemId/updates", async (req, res) => {
    try {
      const result = await verifyShareToken(req.params.token);
      if (!result) return res.status(404).json({ message: "บอร์ดไม่พบ" });
      const { board, allowedGroupIds } = result;
      const itemId = parseInt(req.params.itemId);
      const [item] = await db.select({ boardId: workBoardItems.boardId, groupId: workBoardItems.groupId }).from(workBoardItems).where(eq(workBoardItems.id, itemId));
      if (!item || item.boardId !== board.id) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      if (allowedGroupIds && item.groupId && !allowedGroupIds.includes(item.groupId)) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงรายการนี้" });
      const updates = await db.select({
        id: workBoardItemUpdates.id,
        itemId: workBoardItemUpdates.itemId,
        userId: workBoardItemUpdates.userId,
        content: workBoardItemUpdates.content,
        attachments: workBoardItemUpdates.attachments,
        updateType: workBoardItemUpdates.updateType,
        guestName: workBoardItemUpdates.guestName,
        createdAt: workBoardItemUpdates.createdAt,
        userName: users.fullName,
      })
        .from(workBoardItemUpdates)
        .leftJoin(users, eq(workBoardItemUpdates.userId, users.id))
        .where(eq(workBoardItemUpdates.itemId, itemId))
        .orderBy(desc(workBoardItemUpdates.createdAt));
      res.json(updates);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/shared/board/:token/items/:itemId/updates", async (req, res) => {
    try {
      const result = await verifyShareToken(req.params.token);
      if (!result) return res.status(404).json({ message: "บอร์ดไม่พบ" });
      const { board, allowedGroupIds } = result;
      const itemId = parseInt(req.params.itemId);
      const [item] = await db.select({ boardId: workBoardItems.boardId, groupId: workBoardItems.groupId }).from(workBoardItems).where(eq(workBoardItems.id, itemId));
      if (!item || item.boardId !== board.id) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      if (allowedGroupIds && item.groupId && !allowedGroupIds.includes(item.groupId)) return res.status(403).json({ message: "ไม่มีสิทธิ์เข้าถึงรายการนี้" });
      const { content, attachments, guestName } = req.body;
      if (!guestName?.trim() || guestName.trim().length > 100) return res.status(400).json({ message: "กรุณาระบุชื่อที่ถูกต้อง" });
      const safeContent = typeof content === "string" ? content.slice(0, 5000) : "";
      if (!safeContent.trim() && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ message: "ต้องมีข้อความหรือไฟล์แนบ" });
      }
      let safeAttachments: any[] = [];
      if (Array.isArray(attachments)) {
        safeAttachments = attachments.slice(0, 10).filter((a: any) => {
          if (!a || typeof a !== "object") return false;
          if (typeof a.url !== "string" || typeof a.name !== "string") return false;
          if (!a.url.startsWith("/objects/") && !a.url.startsWith("/api/")) return false;
          return true;
        }).map((a: any) => ({
          name: String(a.name).slice(0, 255),
          path: typeof a.path === "string" ? a.path.slice(0, 500) : "",
          url: a.url.slice(0, 500),
          size: typeof a.size === "number" ? a.size : 0,
          type: typeof a.type === "string" ? a.type.slice(0, 100) : "application/octet-stream",
        }));
      }
      const [update] = await db.insert(workBoardItemUpdates).values({
        itemId,
        userId: null,
        content: safeContent,
        attachments: safeAttachments,
        updateType: "message",
        guestName: guestName.trim().slice(0, 100),
      }).returning();

      if (safeAttachments.length > 0) {
        const [boardCompany] = await db.select({ tenantId: companies.tenantId })
          .from(companies).where(eq(companies.id, board.companyId));
        if (boardCompany?.tenantId) {
          syncUpdateAttachmentsToDocs(itemId, safeAttachments, boardCompany.tenantId, null);
        }
      }

      res.json({ ...update, userName: null });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/items/:itemId/updates", requireAuth, modGuard, async (req, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const companyId = getUserCompanyId(req);
      const [item] = await db.select({ boardId: workBoardItems.boardId }).from(workBoardItems).where(eq(workBoardItems.id, itemId));
      if (!item || !await verifyBoardOwnership(item.boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const updates = await db.select({
        id: workBoardItemUpdates.id,
        itemId: workBoardItemUpdates.itemId,
        userId: workBoardItemUpdates.userId,
        content: workBoardItemUpdates.content,
        attachments: workBoardItemUpdates.attachments,
        updateType: workBoardItemUpdates.updateType,
        guestName: workBoardItemUpdates.guestName,
        createdAt: workBoardItemUpdates.createdAt,
        userName: users.fullName,
      })
        .from(workBoardItemUpdates)
        .leftJoin(users, eq(workBoardItemUpdates.userId, users.id))
        .where(eq(workBoardItemUpdates.itemId, itemId))
        .orderBy(desc(workBoardItemUpdates.createdAt));
      res.json(updates);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/items/:itemId/updates", requireAuth, modGuard, async (req, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const [item] = await db.select({ boardId: workBoardItems.boardId }).from(workBoardItems).where(eq(workBoardItems.id, itemId));
      if (!item || !await verifyBoardOwnership(item.boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const { content, attachments } = req.body;
      if (!content && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ message: "ต้องมีข้อความหรือไฟล์แนบ" });
      }
      const [update] = await db.insert(workBoardItemUpdates).values({
        itemId,
        userId: user.id,
        content: content || "",
        attachments: attachments || [],
        updateType: "message",
      }).returning();

      if (Array.isArray(attachments) && attachments.length > 0) {
        syncUpdateAttachmentsToDocs(itemId, attachments, user.tenantId, user.id);
      }

      res.json({ ...update, userName: user.fullName });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/updates/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const [update] = await db.select().from(workBoardItemUpdates).where(eq(workBoardItemUpdates.id, id));
      if (!update) return res.status(404).json({ message: "ไม่พบ" });
      if (update.userId !== user.id) return res.status(403).json({ message: "ลบได้เฉพาะข้อความตัวเอง" });
      const [item] = await db.select({ boardId: workBoardItems.boardId }).from(workBoardItems).where(eq(workBoardItems.id, update.itemId));
      if (!item || !await verifyBoardOwnership(item.boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      await db.delete(workBoardItemUpdates).where(eq(workBoardItemUpdates.id, id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/items/:itemId/update-count", requireAuth, modGuard, async (req, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const companyId = getUserCompanyId(req);
      const [item] = await db.select({ boardId: workBoardItems.boardId }).from(workBoardItems).where(eq(workBoardItems.id, itemId));
      if (!item || !await verifyBoardOwnership(item.boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(workBoardItemUpdates).where(eq(workBoardItemUpdates.itemId, itemId));
      res.json({ count: Number(result.count) });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/boards/:id/qrcode", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      if (!await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const [board] = await db.select().from(workBoards).where(eq(workBoards.id, boardId));
      if (!board || !board.shareToken || board.visibility !== "shareable") {
        return res.status(400).json({ message: "บอร์ดยังไม่ได้เปิดแชร์" });
      }
      const QRCode = await import("qrcode");
      const host = req.get("x-forwarded-host") || req.get("host") || "etaxcenter.replit.app";
      const proto = req.get("x-forwarded-proto") || req.protocol || "https";
      const shareUrl = `${proto}://${host}/shared/board/${board.shareToken}`;
      const dataUrl = await QRCode.toDataURL(shareUrl, { width: 300, margin: 2, color: { dark: "#333333", light: "#ffffff" } });
      res.json({ qrDataUrl: dataUrl, shareUrl });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards/:id/invite", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      if (!await verifyBoardOwnership(boardId, companyId)) {
        return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      }
      const [board] = await db.select().from(workBoards).where(eq(workBoards.id, boardId));
      if (!board || !board.shareToken || board.visibility !== "shareable") {
        return res.status(400).json({ message: "บอร์ดยังไม่ได้เปิดแชร์" });
      }
      const user = req.user as any;
      const host = req.get("x-forwarded-host") || req.get("host") || "etaxcenter.replit.app";
      const proto = req.get("x-forwarded-proto") || req.protocol || "https";
      const shareUrl = `${proto}://${host}/shared/board/${board.shareToken}`;
      const { method, email, lineUserId } = req.body;
      const [comp] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId));
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const companyName = esc(comp?.name || "eTax Center");
      const boardName = esc(board.name);
      const senderName = esc(user.fullName || user.username || "");

      if (method === "email") {
        if (!email || typeof email !== "string" || !email.includes("@")) {
          return res.status(400).json({ message: "กรุณาระบุอีเมลที่ถูกต้อง" });
        }
        const { sendPlatformEmail } = await import("../utils/platform-email");
        await sendPlatformEmail({
          to: email.trim(),
          subject: `${comp?.name || "eTax Center"} เชิญคุณดูบอร์ด "${board.name}" บน eTax Center`,
          html: `
            <div style="font-family: 'Sarabun', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #333; margin: 0 0 8px 0;">คุณได้รับเชิญให้ดูบอร์ด</h2>
                <p style="color: #666; margin: 0;">${companyName} เชิญคุณดูบอร์ด &quot;<strong>${boardName}</strong>&quot;</p>
              </div>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${shareUrl}" style="display: inline-block; background-color: #fb9678; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">เปิดดูบอร์ด</a>
              </div>
              <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">
                ส่งโดย ${senderName} ผ่าน eTax Center
              </p>
            </div>
          `,
        });
        return res.json({ success: true, message: `ส่งอีเมลเชิญไปยัง ${email} สำเร็จ` });
      }

      if (method === "line") {
        const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
        if (!lineToken) {
          return res.status(400).json({ message: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" });
        }
        if (!lineUserId || typeof lineUserId !== "string") {
          return res.status(400).json({ message: "กรุณาระบุ LINE User ID" });
        }
        const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` },
          body: JSON.stringify({
            to: lineUserId.trim(),
            messages: [{
              type: "flex",
              altText: `${companyName} เชิญคุณดูบอร์ด "${board.name}"`,
              contents: {
                type: "bubble",
                body: {
                  type: "box", layout: "vertical", spacing: "md",
                  contents: [
                    { type: "text", text: "eTax Center", size: "xs", color: "#fb9678", weight: "bold" },
                    { type: "text", text: `เชิญดูบอร์ด "${board.name}"`, size: "md", weight: "bold", wrap: true },
                    { type: "text", text: `จาก ${companyName}`, size: "sm", color: "#888888", wrap: true },
                  ],
                },
                footer: {
                  type: "box", layout: "vertical",
                  contents: [{
                    type: "button", action: { type: "uri", label: "เปิดดูบอร์ด", uri: shareUrl },
                    style: "primary", color: "#fb9678",
                  }],
                },
              },
            }],
          }),
        });
        if (!lineRes.ok) {
          const errBody = await lineRes.text();
          return res.status(500).json({ message: `ส่ง LINE ไม่สำเร็จ: ${errBody}` });
        }
        return res.json({ success: true, message: "ส่งข้อความ LINE สำเร็จ" });
      }

      return res.status(400).json({ message: "กรุณาระบุวิธีการเชิญ (email หรือ line)" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/boards/:id/members", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const companyId = getUserCompanyId(req);
      if (!await verifyBoardOwnership(boardId, companyId)) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const members = await db.select({
        id: workBoardMembers.id,
        boardId: workBoardMembers.boardId,
        userId: workBoardMembers.userId,
        role: workBoardMembers.role,
        createdAt: workBoardMembers.createdAt,
        fullName: users.fullName,
        username: users.username,
        email: users.email,
      }).from(workBoardMembers)
        .innerJoin(users, eq(workBoardMembers.userId, users.id))
        .where(eq(workBoardMembers.boardId, boardId))
        .orderBy(asc(workBoardMembers.createdAt));
      const [board] = await db.select({ createdBy: workBoards.createdBy }).from(workBoards).where(eq(workBoards.id, boardId));
      res.json({ members, createdBy: board?.createdBy });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards/:id/members", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { allowed } = await checkBoardAccess(boardId, user.id, companyId, "owner");
      if (!allowed) return res.status(403).json({ message: "เฉพาะ Owner เท่านั้นที่เพิ่มสมาชิกได้" });
      const { userId, role } = req.body;
      if (!userId) return res.status(400).json({ message: "กรุณาเลือกผู้ใช้" });
      if (!["owner", "editor", "viewer"].includes(role)) return res.status(400).json({ message: "สิทธิ์ไม่ถูกต้อง" });
      const existing = await db.select({ id: workBoardMembers.id }).from(workBoardMembers)
        .where(and(eq(workBoardMembers.boardId, boardId), eq(workBoardMembers.userId, userId)));
      if (existing.length > 0) return res.status(409).json({ message: "ผู้ใช้นี้เป็นสมาชิกอยู่แล้ว" });
      const [member] = await db.insert(workBoardMembers).values({
        boardId, userId, role, addedBy: user.id,
      }).returning();
      res.json(member);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/boards/:id/members/:memberId", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const memberId = parseInt(req.params.memberId);
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { allowed } = await checkBoardAccess(boardId, user.id, companyId, "owner");
      if (!allowed) return res.status(403).json({ message: "เฉพาะ Owner เท่านั้นที่แก้สิทธิ์ได้" });
      const { role } = req.body;
      if (!["owner", "editor", "viewer"].includes(role)) return res.status(400).json({ message: "สิทธิ์ไม่ถูกต้อง" });
      const [updated] = await db.update(workBoardMembers).set({ role })
        .where(and(eq(workBoardMembers.id, memberId), eq(workBoardMembers.boardId, boardId))).returning();
      if (!updated) return res.status(404).json({ message: "ไม่พบสมาชิก" });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/boards/:id/members/:memberId", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const memberId = parseInt(req.params.memberId);
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { allowed } = await checkBoardAccess(boardId, user.id, companyId, "owner");
      if (!allowed) return res.status(403).json({ message: "เฉพาะ Owner เท่านั้นที่ลบสมาชิกได้" });
      const [member] = await db.select({ userId: workBoardMembers.userId }).from(workBoardMembers)
        .where(and(eq(workBoardMembers.id, memberId), eq(workBoardMembers.boardId, boardId)));
      if (!member) return res.status(404).json({ message: "ไม่พบสมาชิก" });
      const [board] = await db.select({ createdBy: workBoards.createdBy }).from(workBoards).where(eq(workBoards.id, boardId));
      if (board?.createdBy === member.userId) return res.status(400).json({ message: "ไม่สามารถลบผู้สร้างบอร์ดได้" });
      await db.delete(workBoardMembers).where(eq(workBoardMembers.id, memberId));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/boards/:id/my-role", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = user.role === "client_external" ? 0 : getUserCompanyId(req);
      const { allowed, role } = await checkBoardAccess(boardId, user.id, companyId, "viewer", user.role === "client_external" ? user.externalBoardToken : undefined);
      res.json({ role: allowed ? role : null, allowed });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/boards/:id/views", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = user.role === "client_external" ? 0 : getUserCompanyId(req);
      const access = await checkBoardAccess(boardId, user.id, companyId, "viewer", user.role === "client_external" ? user.externalBoardToken : undefined);
      if (!access.allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { or } = await import("drizzle-orm");
      const views = await db.select().from(workBoardViews)
        .where(and(
          eq(workBoardViews.boardId, boardId),
          or(eq(workBoardViews.userId, user.id), eq(workBoardViews.isShared, true))
        ))
        .orderBy(asc(workBoardViews.position));
      res.json(views);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards/:id/views", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const access = await checkBoardAccess(boardId, user.id, companyId, "viewer");
      if (!access.allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { name, filters, isShared } = req.body;
      if (!name?.trim()) return res.status(400).json({ message: "กรุณาระบุชื่อ View" });
      const existing = await db.select({ position: workBoardViews.position }).from(workBoardViews)
        .where(eq(workBoardViews.boardId, boardId))
        .orderBy(desc(workBoardViews.position)).limit(1);
      const nextPos = existing.length > 0 ? existing[0].position + 1 : 0;
      const [view] = await db.insert(workBoardViews).values({
        boardId, userId: user.id, name: name.trim(), filters: filters || {},
        isShared: !!isShared, position: nextPos,
      }).returning();
      res.json(view);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/views/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      const [view] = await db.select().from(workBoardViews).where(eq(workBoardViews.id, id));
      if (!view || view.userId !== user.id) return res.status(403).json({ message: "ไม่มีสิทธิ์แก้ View นี้" });
      const updates: any = {};
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.filters !== undefined) updates.filters = req.body.filters;
      if (req.body.isShared !== undefined) updates.isShared = req.body.isShared;
      if (req.body.position !== undefined) updates.position = req.body.position;
      const [updated] = await db.update(workBoardViews).set(updates).where(eq(workBoardViews.id, id)).returning();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/views/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      const [view] = await db.select().from(workBoardViews).where(eq(workBoardViews.id, id));
      if (!view || view.userId !== user.id) return res.status(403).json({ message: "ไม่มีสิทธิ์ลบ View นี้" });
      await db.delete(workBoardViews).where(eq(workBoardViews.id, id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/boards/:id/widgets", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = user.role === "client_external" ? 0 : getUserCompanyId(req);
      const access = await checkBoardAccess(boardId, user.id, companyId, "viewer", user.role === "client_external" ? user.externalBoardToken : undefined);
      if (!access.allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const widgets = await db.select().from(workBoardWidgets)
        .where(eq(workBoardWidgets.boardId, boardId))
        .orderBy(asc(workBoardWidgets.position));
      res.json(widgets);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/etax-hub/boards/:id/widgets", requireAuth, modGuard, async (req, res) => {
    try {
      const boardId = parseInt(req.params.id);
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const access = await checkBoardAccess(boardId, user.id, companyId, "editor");
      if (!access.allowed) return res.status(403).json({ message: "ไม่มีสิทธิ์" });
      const { title, chartType, columnId, calcType, width, filterValue } = req.body;
      if (!title?.trim()) return res.status(400).json({ message: "กรุณาระบุชื่อ" });
      const existing = await db.select({ position: workBoardWidgets.position }).from(workBoardWidgets)
        .where(eq(workBoardWidgets.boardId, boardId))
        .orderBy(desc(workBoardWidgets.position)).limit(1);
      const nextPos = existing.length > 0 ? existing[0].position + 1 : 0;
      const [widget] = await db.insert(workBoardWidgets).values({
        boardId, title: title.trim(), chartType: chartType || "number",
        columnId: columnId || null, calcType: calcType || "count",
        position: nextPos, width: width || "half",
        filterValue: filterValue || null,
      }).returning();
      res.json(widget);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.put("/api/etax-hub/widgets/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = req.user as any;
      const updates: any = {};
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.chartType !== undefined) updates.chartType = req.body.chartType;
      if (req.body.columnId !== undefined) updates.columnId = req.body.columnId;
      if (req.body.calcType !== undefined) updates.calcType = req.body.calcType;
      if (req.body.width !== undefined) updates.width = req.body.width;
      if (req.body.filterValue !== undefined) updates.filterValue = req.body.filterValue || null;
      if (req.body.position !== undefined) updates.position = req.body.position;
      const [updated] = await db.update(workBoardWidgets).set(updates).where(eq(workBoardWidgets.id, id)).returning();
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/etax-hub/widgets/:id", requireAuth, modGuard, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await db.delete(workBoardWidgets).where(eq(workBoardWidgets.id, id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/etax-hub/my-calendar", requireAuth, modGuard, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = getUserCompanyId(req);
      const { month, year } = req.query;
      const boards = await db.select({ id: workBoards.id, name: workBoards.name, color: workBoards.color })
        .from(workBoards)
        .where(and(eq(workBoards.companyId, companyId), eq(workBoards.boardType, "etax-hub")));
      if (boards.length === 0) return res.json([]);
      const boardIds = boards.map(b => b.id);
      const boardMap = Object.fromEntries(boards.map(b => [b.id, b]));

      const allItems = await db.select().from(workBoardItems)
        .where(inArray(workBoardItems.boardId, boardIds));
      const allColumns = await db.select().from(workBoardColumns)
        .where(and(inArray(workBoardColumns.boardId, boardIds)));
      const dateColsByBoard: Record<number, number[]> = {};
      const personColsByBoard: Record<number, number[]> = {};
      for (const col of allColumns) {
        if (col.columnType === "date") {
          (dateColsByBoard[col.boardId] ||= []).push(col.id);
        }
        if (col.columnType === "person") {
          (personColsByBoard[col.boardId] ||= []).push(col.id);
        }
      }
      const colMap = Object.fromEntries(allColumns.map(c => [c.id, c]));

      const events: any[] = [];
      for (const item of allItems) {
        const cv = typeof item.cellValues === "string" ? JSON.parse(item.cellValues || "{}") : (item.cellValues || {});
        const personCols = personColsByBoard[item.boardId] || [];
        const isAssignedToMe = personCols.some(colId => String(cv[colId]) === String(user.id));
        if (!isAssignedToMe) continue;
        const dateCols = dateColsByBoard[item.boardId] || [];
        for (const colId of dateCols) {
          const dateVal = cv[colId];
          if (!dateVal) continue;
          const d = new Date(dateVal);
          if (isNaN(d.getTime())) continue;
          if (month && year) {
            const m = parseInt(month as string);
            const y = parseInt(year as string);
            if (d.getMonth() + 1 !== m || d.getFullYear() !== y) continue;
          }
          events.push({
            itemId: item.id,
            itemName: item.name,
            boardId: item.boardId,
            boardName: boardMap[item.boardId]?.name || "",
            boardColor: boardMap[item.boardId]?.color || "#539BFF",
            date: dateVal,
            columnName: colMap[colId]?.name || "วันที่",
          });
        }
      }
      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      res.json(events);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  // ============ Client Upload Links ============

  app.get("/api/client-upload-links/unread-count", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = req.query.companyId ? Number(req.query.companyId) : null;
      if (companyId) {
        const [co] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.id, companyId), eq(companies.tenantId, user.tenantId)));
        if (!co) return res.json({ totalUnread: 0 });
        const companyClientIds = await db.select({ id: firmClients.id }).from(firmClients).where(eq(firmClients.companyId, companyId));
        const cids = companyClientIds.map(c => c.id);
        const linkCondition = cids.length > 0
          ? or(inArray(clientUploadLinks.firmClientId, cids), isNull(clientUploadLinks.firmClientId))
          : isNull(clientUploadLinks.firmClientId);
        const linkIdsForCompany = await db.select({ id: clientUploadLinks.id }).from(clientUploadLinks)
          .where(and(eq(clientUploadLinks.tenantId, user.tenantId), linkCondition));
        const lids = linkIdsForCompany.map(l => l.id);
        if (lids.length === 0) return res.json({ totalUnread: 0 });
        const [result] = await db.select({ totalUnread: sql<number>`count(*)` }).from(clientUploadFiles)
          .where(and(inArray(clientUploadFiles.linkId, lids), eq(clientUploadFiles.isRead, false)));
        return res.json({ totalUnread: Number(result?.totalUnread || 0) });
      }
      const [result] = await db.select({
        totalUnread: sql<number>`count(*)`,
      }).from(clientUploadFiles)
        .where(and(eq(clientUploadFiles.tenantId, user.tenantId), eq(clientUploadFiles.isRead, false)));
      res.json({ totalUnread: Number(result?.totalUnread || 0) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/client-upload-links", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const firmClientId = req.query.firmClientId ? Number(req.query.firmClientId) : null;
      const companyId = req.query.companyId ? Number(req.query.companyId) : null;
      let conditions: any[] = [eq(clientUploadLinks.tenantId, user.tenantId)];
      if (firmClientId) {
        conditions.push(eq(clientUploadLinks.firmClientId, firmClientId));
      } else if (companyId) {
        const [co] = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.id, companyId), eq(companies.tenantId, user.tenantId)));
        if (!co) return res.json([]);
        const companyClientIds = await db.select({ id: firmClients.id }).from(firmClients).where(eq(firmClients.companyId, companyId));
        const cids = companyClientIds.map(c => c.id);
        if (cids.length > 0) {
          conditions.push(or(inArray(clientUploadLinks.firmClientId, cids), isNull(clientUploadLinks.firmClientId)));
        } else {
          conditions.push(isNull(clientUploadLinks.firmClientId));
        }
      }
      const links = await db.select().from(clientUploadLinks).where(and(...conditions)).orderBy(desc(clientUploadLinks.createdAt));
      const linkIds = links.map(l => l.id);
      let fileCounts: Record<number, number> = {};
      let unreadCounts: Record<number, number> = {};
      if (linkIds.length > 0) {
        const counts = await db.select({
          linkId: clientUploadFiles.linkId,
          total: sql<number>`count(*)`,
          unread: sql<number>`count(*) filter (where ${clientUploadFiles.isRead} = false)`,
        }).from(clientUploadFiles).where(inArray(clientUploadFiles.linkId, linkIds)).groupBy(clientUploadFiles.linkId);
        counts.forEach(c => { fileCounts[c.linkId] = Number(c.total); unreadCounts[c.linkId] = Number(c.unread); });
      }
      const clientIds = [...new Set(links.filter(l => l.firmClientId).map(l => l.firmClientId!))];
      let clientNames: Record<number, string> = {};
      if (clientIds.length > 0) {
        const cls = await db.select({ id: firmClients.id, name: firmClients.name }).from(firmClients).where(inArray(firmClients.id, clientIds));
        cls.forEach(c => { clientNames[c.id] = c.name; });
      }
      res.json(links.map(l => ({
        ...l,
        firmClientName: l.firmClientId ? clientNames[l.firmClientId] || "" : null,
        _stats: { total: fileCounts[l.id] || 0, unread: unreadCounts[l.id] || 0 },
      })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/client-upload-links", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { firmClientId, label, maxFiles, allowedTypes, expiresAt, month, year } = req.body;
      if (firmClientId) {
        const [fc] = await db.select({ id: firmClients.id, companyId: firmClients.companyId }).from(firmClients)
          .innerJoin(companies, eq(firmClients.companyId, companies.id))
          .where(and(eq(firmClients.id, Number(firmClientId)), eq(companies.tenantId, user.tenantId)));
        if (!fc) return res.status(400).json({ message: "ลูกค้าไม่ถูกต้อง" });
      }
      const token = crypto.randomBytes(24).toString("hex");
      const [link] = await db.insert(clientUploadLinks).values({
        tenantId: user.tenantId,
        firmClientId: firmClientId ? Number(firmClientId) : null,
        token,
        label: label || null,
        month: month ? Number(month) : null,
        year: year ? Number(year) : null,
        maxFiles: maxFiles || 50,
        allowedTypes: allowedTypes || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: user.id,
      }).returning();
      res.json(link);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/client-upload-links/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      const { isActive, label, maxFiles, expiresAt } = req.body;
      const updates: any = {};
      if (isActive !== undefined) updates.isActive = isActive;
      if (label !== undefined) updates.label = label;
      if (maxFiles !== undefined) updates.maxFiles = maxFiles;
      if (expiresAt !== undefined) updates.expiresAt = expiresAt ? new Date(expiresAt) : null;
      const [updated] = await db.update(clientUploadLinks).set(updates)
        .where(and(eq(clientUploadLinks.id, id), eq(clientUploadLinks.tenantId, user.tenantId))).returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/client-upload-links/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const id = Number(req.params.id);
      await db.delete(clientUploadLinks).where(and(eq(clientUploadLinks.id, id), eq(clientUploadLinks.tenantId, user.tenantId)));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/client-upload-links/:id/files", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const linkId = Number(req.params.id);
      const [link] = await db.select().from(clientUploadLinks).where(and(eq(clientUploadLinks.id, linkId), eq(clientUploadLinks.tenantId, user.tenantId)));
      if (!link) return res.status(404).json({ message: "Not found" });
      const files = await db.select().from(clientUploadFiles).where(eq(clientUploadFiles.linkId, linkId)).orderBy(desc(clientUploadFiles.createdAt));
      res.json(files);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/client-upload-files/:id/read", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const [updated] = await db.update(clientUploadFiles).set({ isRead: true })
        .where(and(eq(clientUploadFiles.id, Number(req.params.id)), eq(clientUploadFiles.tenantId, user.tenantId))).returning();
      if (!updated) return res.status(404).json({ message: "Not found" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/client-documents/batch-download", requireAuth, async (req, res) => {
    const fsLib = await import("fs");
    const osLib = await import("os");
    const tmpFiles: string[] = [];
    const cleanupTmp = () => { for (const f of tmpFiles) { try { fsLib.unlinkSync(f); } catch {} } };
    try {
      const user = req.user as any;
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "กรุณาเลือกเอกสารอย่างน้อย 1 รายการ" });
      if (items.length > 100) return res.status(400).json({ message: "ดาวน์โหลดได้สูงสุด 100 ไฟล์ต่อครั้ง" });

      const archiver = (await import("archiver")).default;
      const { readFromPath } = await import("../replit_integrations/object_storage/routes");

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="documents-${Date.now()}.zip"`);
      const archive = archiver("zip", { zlib: { level: 5 } });
      archive.on("error", () => {});
      archive.pipe(res);

      const usedNames = new Set<string>();
      for (const item of items) {
        try {
          const objectPath = item.objectPath;
          if (!objectPath) continue;
          const fileData = readFromPath(objectPath);
          if (!fileData) continue;
          let name = item.fileName || `file_${item.id}`;
          if (usedNames.has(name)) {
            const ext = name.lastIndexOf(".") > 0 ? name.slice(name.lastIndexOf(".")) : "";
            const base = name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name;
            name = `${base}_${item.id}${ext}`;
          }
          usedNames.add(name);
          archive.append(fileData, { name });
        } catch {}
      }
      await archive.finalize();
    } catch (err: any) {
      cleanupTmp();
      if (!res.headersSent) res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/client-documents/batch-delete", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: "กรุณาเลือกเอกสารอย่างน้อย 1 รายการ" });
      if (items.length > 100) return res.status(400).json({ message: "ลบได้สูงสุด 100 ไฟล์ต่อครั้ง" });

      const { deleteFromPath } = await import("../replit_integrations/object_storage/routes");

      let deleted = 0;
      for (const item of items) {
        try {
          if (item.source === "line") {
            const [doc] = await db.select().from(lineDocuments).where(and(eq(lineDocuments.id, Number(item.id)), eq(lineDocuments.tenantId, user.tenantId)));
            if (!doc) continue;
            if (doc.storageUrl) { try { deleteFromPath(doc.storageUrl); } catch {} }
            await db.delete(lineDocuments).where(eq(lineDocuments.id, doc.id));
            deleted++;
          } else {
            const [file] = await db.select().from(clientUploadFiles).where(and(eq(clientUploadFiles.id, Number(item.id)), eq(clientUploadFiles.tenantId, user.tenantId)));
            if (!file) continue;
            if (file.objectPath) { try { deleteFromPath(file.objectPath); } catch {} }
            await db.delete(clientUploadFiles).where(eq(clientUploadFiles.id, file.id));
            deleted++;
          }
        } catch {}
      }
      res.json({ success: true, deleted });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/client-upload-files/:id", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const fileId = Number(req.params.id);
      const [file] = await db.select().from(clientUploadFiles)
        .where(and(eq(clientUploadFiles.id, fileId), eq(clientUploadFiles.tenantId, user.tenantId)));
      if (!file) return res.status(404).json({ message: "ไม่พบไฟล์" });
      if (file.objectPath) {
        try {
          const { deleteFromPath } = await import("../replit_integrations/object_storage/routes");
          deleteFromPath(file.objectPath);
        } catch (storageErr) {
          console.error("Failed to delete from storage:", storageErr);
        }
      }
      await db.delete(clientUploadFiles).where(eq(clientUploadFiles.id, fileId));
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ============ Send Upload Link via LINE Bot ============

  app.post("/api/client-upload-links/:id/send-line", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const linkId = Number(req.params.id);
      const [link] = await db.select().from(clientUploadLinks).where(and(eq(clientUploadLinks.id, linkId), eq(clientUploadLinks.tenantId, user.tenantId)));
      if (!link) return res.status(404).json({ message: "ไม่พบลิงก์" });

      if (!link.firmClientId) return res.status(400).json({ message: "ลิงก์นี้ไม่ได้ผูกกับลูกค้า" });

      const [client] = await db.select().from(firmClients).where(eq(firmClients.id, link.firmClientId));
      if (!client) return res.status(400).json({ message: "ไม่พบข้อมูลลูกค้า" });

      const [groupMapping] = await db.select().from(lineGroupMappings)
        .where(and(eq(lineGroupMappings.firmClientId, link.firmClientId), eq(lineGroupMappings.active, true)));
      if (!groupMapping?.lineGroupId) return res.status(400).json({ message: `ลูกค้า "${client.name}" ยังไม่ได้ตั้งค่ากลุ่ม LINE` });

      const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
      if (!lineToken) return res.status(400).json({ message: "ยังไม่ได้ตั้งค่า LINE Channel Access Token" });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const uploadUrl = `${baseUrl}/upload/${link.token}`;

      const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lineToken}` },
        body: JSON.stringify({
          to: groupMapping.lineGroupId,
          messages: [{
            type: "flex",
            altText: `${link.label || "ส่งเอกสาร"} — กรุณาอัปโหลดเอกสารผ่านลิงก์`,
            contents: {
              type: "bubble",
              header: {
                type: "box", layout: "vertical",
                backgroundColor: "#fb9678",
                paddingAll: "16px",
                contents: [
                  { type: "text", text: "eTax Center", size: "xs", color: "#ffffff", weight: "bold" },
                  { type: "text", text: "ส่งเอกสาร", size: "lg", color: "#ffffff", weight: "bold" },
                ],
              },
              body: {
                type: "box", layout: "vertical", spacing: "md", paddingAll: "16px",
                contents: [
                  { type: "text", text: link.label || "อัปโหลดเอกสาร", size: "md", weight: "bold", wrap: true },
                  { type: "text", text: `กรุณาอัปโหลดเอกสารผ่านลิงก์ด้านล่าง`, size: "sm", color: "#888888", wrap: true },
                ],
              },
              footer: {
                type: "box", layout: "vertical", spacing: "sm", paddingAll: "16px",
                contents: [
                  {
                    type: "button",
                    action: { type: "uri", label: "อัปโหลดเอกสาร", uri: uploadUrl },
                    style: "primary",
                    color: "#fb9678",
                  },
                ],
              },
            },
          }],
        }),
      });

      if (!lineRes.ok) {
        const errBody = await lineRes.json().catch(() => ({}));
        console.error("LINE push error:", errBody);
        return res.status(500).json({ message: "ส่ง LINE ไม่สำเร็จ" });
      }

      res.json({ success: true, message: `ส่งลิงก์ไปยังกลุ่ม LINE "${groupMapping.groupName || client.name}" แล้ว` });
    } catch (e: any) {
      console.error("Send LINE error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ============ Staff Upload (Authenticated) ============

  const uploadClient = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
  app.post("/api/client-upload-links/:id/staff-upload", requireAuth, uploadClient.array("files", 10), async (req, res) => {
    try {
      const user = req.user as any;
      const linkId = Number(req.params.id);
      const [link] = await db.select().from(clientUploadLinks).where(and(eq(clientUploadLinks.id, linkId), eq(clientUploadLinks.tenantId, user.tenantId)));
      if (!link) return res.status(404).json({ message: "ไม่พบลิงก์" });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ message: "ไม่พบไฟล์" });

      const savedFiles = [];
      for (const file of files) {
        const { objectPath } = saveBufferLocally(file.buffer, file.mimetype || "application/octet-stream", file.originalname);

        const fileName = decodeMulterFilename(file.originalname);

        const [saved] = await db.insert(clientUploadFiles).values({
          linkId: link.id,
          tenantId: link.tenantId,
          firmClientId: link.firmClientId,
          fileName,
          fileSize: file.size,
          mimeType: file.mimetype,
          objectPath,
          category: "พนักงานอัปโหลด",
          uploaderName: user.fullName || user.username || "",
          isRead: true,
        }).returning();
        savedFiles.push(saved);
      }

      res.json({ success: true, count: savedFiles.length });
    } catch (e: any) {
      console.error("Staff upload error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/client-documents/staff-direct-upload", requireAuth, uploadClient.array("files", 10), async (req, res) => {
    try {
      const user = req.user as any;
      const month = Number(req.body.month);
      const year = Number(req.body.year);
      if (!month || !year) return res.status(400).json({ message: "month and year are required" });

      let [link] = await db.select().from(clientUploadLinks).where(
        and(
          eq(clientUploadLinks.tenantId, user.tenantId),
          eq(clientUploadLinks.month, month),
          eq(clientUploadLinks.year, year),
          isNull(clientUploadLinks.firmClientId),
        )
      );

      if (!link) {
        const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
        const token = crypto.randomBytes(24).toString("hex");
        const [created] = await db.insert(clientUploadLinks).values({
          tenantId: user.tenantId,
          token,
          label: `เอกสาร ${THAI_MONTHS[month - 1]} ${year + 543}`,
          month,
          year,
          isActive: true,
          maxFiles: 999,
          createdBy: user.id,
        }).returning();
        link = created;
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ message: "ไม่พบไฟล์" });

      const savedFiles = [];
      for (const file of files) {
        const { objectPath } = saveBufferLocally(file.buffer, file.mimetype || "application/octet-stream", file.originalname);

        const fileName = decodeMulterFilename(file.originalname);

        const [saved] = await db.insert(clientUploadFiles).values({
          linkId: link.id,
          tenantId: link.tenantId,
          firmClientId: link.firmClientId,
          fileName,
          fileSize: file.size,
          mimeType: file.mimetype,
          objectPath,
          category: "พนักงานอัปโหลด",
          uploaderName: user.fullName || user.username || "",
          isRead: true,
        }).returning();
        savedFiles.push(saved);
      }

      res.json({ success: true, count: savedFiles.length });
    } catch (e: any) {
      console.error("Staff direct upload error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  // ============ Public Upload Endpoint (No Auth) ============

  app.get("/api/public/upload/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const [link] = await db.select({
        id: clientUploadLinks.id,
        label: clientUploadLinks.label,
        month: clientUploadLinks.month,
        year: clientUploadLinks.year,
        isActive: clientUploadLinks.isActive,
        maxFiles: clientUploadLinks.maxFiles,
        expiresAt: clientUploadLinks.expiresAt,
        firmClientId: clientUploadLinks.firmClientId,
        tenantId: clientUploadLinks.tenantId,
      }).from(clientUploadLinks).where(eq(clientUploadLinks.token, token));
      if (!link) return res.status(404).json({ message: "ลิงก์ไม่ถูกต้อง" });
      if (!link.isActive) return res.status(403).json({ message: "ลิงก์ถูกปิดใช้งานแล้ว" });
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) return res.status(403).json({ message: "ลิงก์หมดอายุแล้ว" });
      const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, link.tenantId));
      let clientName = "";
      if (link.firmClientId) {
        const [fc] = await db.select({ name: firmClients.name }).from(firmClients).where(eq(firmClients.id, link.firmClientId));
        clientName = fc?.name || "";
      }
      const fileCount = await db.select({ count: sql<number>`count(*)` }).from(clientUploadFiles).where(eq(clientUploadFiles.linkId, link.id));
      res.json({
        linkId: link.id,
        label: link.label,
        month: link.month,
        year: link.year,
        firmName: tenant?.name || "",
        clientName,
        maxFiles: link.maxFiles,
        currentFileCount: Number(fileCount[0]?.count || 0),
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/public/upload/:token", uploadClient.array("files", 100), async (req, res) => {
    try {
      const { token } = req.params;
      const [link] = await db.select().from(clientUploadLinks).where(eq(clientUploadLinks.token, token));
      if (!link) return res.status(404).json({ message: "ลิงก์ไม่ถูกต้อง" });
      if (!link.isActive) return res.status(403).json({ message: "ลิงก์ถูกปิดใช้งานแล้ว" });
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) return res.status(403).json({ message: "ลิงก์หมดอายุแล้ว" });

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) return res.status(400).json({ message: "ไม่พบไฟล์" });

      const currentCount = await db.select({ count: sql<number>`count(*)` }).from(clientUploadFiles).where(eq(clientUploadFiles.linkId, link.id));
      const curCount = Number(currentCount[0]?.count || 0);
      if (link.maxFiles && curCount + files.length > link.maxFiles) {
        return res.status(400).json({ message: `เกินจำนวนไฟล์สูงสุด (${link.maxFiles} ไฟล์)` });
      }

      const uploaderName = req.body.uploaderName || "";
      const uploaderNote = req.body.uploaderNote || "";
      const category = req.body.category || "อื่นๆ";
      let folderPaths: string[] = [];
      try {
        if (req.body.folderPaths) folderPaths = JSON.parse(req.body.folderPaths);
      } catch {}

      if (link.allowedTypes) {
        const allowed = link.allowedTypes.split(",").map((t: string) => t.trim().toLowerCase());
        for (const file of files) {
          const ext = (file.originalname.split(".").pop() || "").toLowerCase();
          const mime = (file.mimetype || "").toLowerCase();
          const match = allowed.some((a: string) => ext === a || mime.includes(a));
          if (!match) return res.status(400).json({ message: `ไม่อนุญาตไฟล์ประเภท .${ext}` });
        }
      }

      const savedFiles = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { objectPath } = saveBufferLocally(file.buffer, file.mimetype || "application/octet-stream", file.originalname);

        const fileName = decodeMulterFilename(file.originalname);

        const folderPath = folderPaths[i] || null;

        const [saved] = await db.insert(clientUploadFiles).values({
          linkId: link.id,
          tenantId: link.tenantId,
          firmClientId: link.firmClientId,
          fileName,
          fileSize: file.size,
          mimeType: file.mimetype,
          objectPath,
          folderPath,
          category,
          uploaderName,
          uploaderNote,
        }).returning();
        savedFiles.push(saved);
      }

      res.json({ success: true, count: savedFiles.length });
    } catch (e: any) {
      console.error("Public upload error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/public/upload/:token/files", async (req, res) => {
    try {
      const { token } = req.params;
      const [link] = await db.select({ id: clientUploadLinks.id, isActive: clientUploadLinks.isActive, expiresAt: clientUploadLinks.expiresAt })
        .from(clientUploadLinks).where(eq(clientUploadLinks.token, token));
      if (!link) return res.status(404).json({ message: "ลิงก์ไม่ถูกต้อง" });
      if (!link.isActive) return res.status(403).json({ message: "ลิงก์ถูกปิดใช้งานแล้ว" });
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) return res.status(403).json({ message: "ลิงก์หมดอายุแล้ว" });

      const rows = await db.select({
        id: clientUploadFiles.id,
        fileName: clientUploadFiles.fileName,
        fileSize: clientUploadFiles.fileSize,
        category: clientUploadFiles.category,
        folderPath: clientUploadFiles.folderPath,
        uploaderName: clientUploadFiles.uploaderName,
        createdAt: clientUploadFiles.createdAt,
      })
        .from(clientUploadFiles)
        .where(eq(clientUploadFiles.linkId, link.id))
        .orderBy(desc(clientUploadFiles.createdAt));

      res.json({ files: rows, total: rows.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/client-documents/monthly-summary", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = req.query.companyId ? Number(req.query.companyId) : null;
      const firmClientIdParam = req.query.firmClientId ? Number(req.query.firmClientId) : null;

      let clientIds: number[] = [];
      if (firmClientIdParam) {
        clientIds = [firmClientIdParam];
      } else if (companyId) {
        const cls = await db.select({ id: firmClients.id }).from(firmClients).where(eq(firmClients.companyId, companyId));
        clientIds = cls.map(c => c.id);
      }
      if (clientIds.length === 0) return res.json([]);

      const linkRows = await db.select({
        month: clientUploadLinks.month,
        year: clientUploadLinks.year,
        linkCount: sql<number>`count(DISTINCT CASE WHEN (${clientUploadFiles.category} IS NULL OR ${clientUploadFiles.category} != 'พนักงานอัปโหลด') AND (${clientUploadFiles.source} IS NULL OR ${clientUploadFiles.source} != 'board') THEN ${clientUploadFiles.id} END)`,
        staffCount: sql<number>`count(DISTINCT CASE WHEN ${clientUploadFiles.category} = 'พนักงานอัปโหลด' THEN ${clientUploadFiles.id} END)`,
        boardCount: sql<number>`count(DISTINCT CASE WHEN ${clientUploadFiles.source} = 'board' THEN ${clientUploadFiles.id} END)`,
        unreadCount: sql<number>`count(DISTINCT CASE WHEN ${clientUploadFiles.isRead} = false AND (${clientUploadFiles.source} IS NULL OR ${clientUploadFiles.source} != 'board') THEN ${clientUploadFiles.id} END)`,
      })
        .from(clientUploadLinks)
        .leftJoin(clientUploadFiles, eq(clientUploadFiles.linkId, clientUploadLinks.id))
        .where(and(
          eq(clientUploadLinks.tenantId, user.tenantId),
          inArray(clientUploadLinks.firmClientId, clientIds),
          sql`${clientUploadLinks.month} IS NOT NULL`,
          sql`${clientUploadLinks.year} IS NOT NULL`,
        ))
        .groupBy(clientUploadLinks.month, clientUploadLinks.year);

      const lineRows = await db.select({
        month: sql<number>`EXTRACT(MONTH FROM ${lineDocuments.createdAt})::int`,
        year: sql<number>`EXTRACT(YEAR FROM ${lineDocuments.createdAt})::int`,
        lineCount: sql<number>`count(*)`,
      })
        .from(lineDocuments)
        .where(and(
          eq(lineDocuments.tenantId, user.tenantId),
          inArray(lineDocuments.firmClientId, clientIds),
        ))
        .groupBy(sql`EXTRACT(MONTH FROM ${lineDocuments.createdAt})`, sql`EXTRACT(YEAR FROM ${lineDocuments.createdAt})`);

      const monthMap = new Map<string, any>();
      const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

      for (const r of linkRows) {
        if (!r.month || !r.year) continue;
        const key = `${r.year}-${r.month}`;
        const existing = monthMap.get(key) || { month: r.month, year: r.year, yearBE: r.year + 543, monthLabel: thaiMonths[(r.month || 1) - 1], linkCount: 0, lineCount: 0, staffCount: 0, boardCount: 0, unreadCount: 0 };
        existing.linkCount += Number(r.linkCount) || 0;
        existing.staffCount += Number(r.staffCount) || 0;
        existing.boardCount += Number((r as any).boardCount) || 0;
        existing.unreadCount += Number(r.unreadCount) || 0;
        monthMap.set(key, existing);
      }

      for (const r of lineRows) {
        if (!r.month || !r.year) continue;
        const key = `${r.year}-${r.month}`;
        const existing = monthMap.get(key) || { month: r.month, year: r.year, yearBE: r.year + 543, monthLabel: thaiMonths[(r.month || 1) - 1], linkCount: 0, lineCount: 0, staffCount: 0, boardCount: 0, unreadCount: 0 };
        existing.lineCount += Number(r.lineCount) || 0;
        monthMap.set(key, existing);
      }

      const result = [...monthMap.values()]
        .map(m => ({ ...m, totalCount: m.linkCount + m.lineCount + m.staffCount + m.boardCount }))
        .sort((a, b) => b.year - a.year || b.month - a.month);

      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/client-documents/month-files", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = req.query.companyId ? Number(req.query.companyId) : null;
      const firmClientIdParam = req.query.firmClientId ? Number(req.query.firmClientId) : null;
      const month = req.query.month ? Number(req.query.month) : null;
      const year = req.query.year ? Number(req.query.year) : null;
      const source = String(req.query.source || "link");

      if (!month || !year) return res.status(400).json({ message: "month and year required" });

      let clientIds: number[] = [];
      if (firmClientIdParam) {
        clientIds = [firmClientIdParam];
      } else if (companyId) {
        const cls = await db.select({ id: firmClients.id }).from(firmClients).where(eq(firmClients.companyId, companyId));
        clientIds = cls.map(c => c.id);
      }
      if (clientIds.length === 0) return res.json([]);

      if (source === "line") {
        const docs = await db.select().from(lineDocuments)
          .where(and(
            eq(lineDocuments.tenantId, user.tenantId),
            inArray(lineDocuments.firmClientId, clientIds),
            sql`EXTRACT(MONTH FROM ${lineDocuments.createdAt}) = ${month}`,
            sql`EXTRACT(YEAR FROM ${lineDocuments.createdAt}) = ${year}`,
          ))
          .orderBy(desc(lineDocuments.createdAt));
        return res.json(docs.map(d => ({
          ...d,
          source: "line",
          fileName: d.originalFilename || `line_${d.fileType}_${d.id}`,
          objectPath: d.storageUrl,
        })));
      }

      const categoryFilter = source === "staff"
        ? eq(clientUploadFiles.category, "พนักงานอัปโหลด")
        : source === "board"
        ? eq(clientUploadFiles.source, "board")
        : and(
            or(sql`${clientUploadFiles.category} IS NULL`, sql`${clientUploadFiles.category} != 'พนักงานอัปโหลด'`),
            or(sql`${clientUploadFiles.source} IS NULL`, sql`${clientUploadFiles.source} != 'board'`),
          );

      const matchingLinks = await db.select({ id: clientUploadLinks.id, label: clientUploadLinks.label, token: clientUploadLinks.token, isActive: clientUploadLinks.isActive, firmClientId: clientUploadLinks.firmClientId })
        .from(clientUploadLinks)
        .where(and(
          eq(clientUploadLinks.tenantId, user.tenantId),
          inArray(clientUploadLinks.firmClientId, clientIds),
          eq(clientUploadLinks.month, month),
          eq(clientUploadLinks.year, year),
        ));

      if (matchingLinks.length === 0) return res.json([]);
      const linkIds = matchingLinks.map(l => l.id);
      const linkMap = Object.fromEntries(matchingLinks.map(l => [l.id, l]));

      const files = await db.select().from(clientUploadFiles)
        .where(and(
          inArray(clientUploadFiles.linkId, linkIds),
          categoryFilter!,
        ))
        .orderBy(desc(clientUploadFiles.createdAt));

      res.json(files.map(f => ({
        ...f,
        source: source === "staff" ? "staff" : source === "board" ? "board" : "link",
        _link: linkMap[f.linkId] || null,
      })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/client-documents/month-links", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const companyId = req.query.companyId ? Number(req.query.companyId) : null;
      const firmClientIdParam = req.query.firmClientId ? Number(req.query.firmClientId) : null;
      const month = req.query.month ? Number(req.query.month) : null;
      const year = req.query.year ? Number(req.query.year) : null;

      if (!month || !year) return res.status(400).json({ message: "month and year required" });

      let clientIds: number[] = [];
      if (firmClientIdParam) {
        clientIds = [firmClientIdParam];
      } else if (companyId) {
        const cls = await db.select({ id: firmClients.id }).from(firmClients).where(eq(firmClients.companyId, companyId));
        clientIds = cls.map(c => c.id);
      }
      if (clientIds.length === 0) return res.json([]);

      const links = await db.select().from(clientUploadLinks)
        .where(and(
          eq(clientUploadLinks.tenantId, user.tenantId),
          inArray(clientUploadLinks.firmClientId, clientIds),
          eq(clientUploadLinks.month, month),
          eq(clientUploadLinks.year, year),
        ))
        .orderBy(desc(clientUploadLinks.createdAt));

      const linkIds = links.map(l => l.id);
      let fileCounts: Record<number, number> = {};
      if (linkIds.length > 0) {
        const counts = await db.select({
          linkId: clientUploadFiles.linkId,
          total: sql<number>`count(*)`,
        }).from(clientUploadFiles).where(inArray(clientUploadFiles.linkId, linkIds)).groupBy(clientUploadFiles.linkId);
        counts.forEach(c => { fileCounts[c.linkId] = Number(c.total); });
      }

      const clientIdsList = [...new Set(links.filter(l => l.firmClientId).map(l => l.firmClientId!))];
      let clientNames: Record<number, string> = {};
      if (clientIdsList.length > 0) {
        const cls = await db.select({ id: firmClients.id, name: firmClients.name }).from(firmClients).where(inArray(firmClients.id, clientIdsList));
        cls.forEach(c => { clientNames[c.id] = c.name; });
      }

      res.json(links.map(l => ({
        ...l,
        firmClientName: l.firmClientId ? clientNames[l.firmClientId] || "" : null,
        _fileCount: fileCounts[l.id] || 0,
      })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/office-documents", requireAuth, requireModule("firm-mgmt"), async (req, res) => {
    try {
      const user = req.user as any;
      const month = Number(req.query.month) || (new Date().getMonth() + 1);
      const year = Number(req.query.year) || new Date().getFullYear();

      const links = await db.select().from(clientUploadLinks)
        .where(and(
          eq(clientUploadLinks.tenantId, user.tenantId),
          eq(clientUploadLinks.month, month),
          eq(clientUploadLinks.year, year),
        ));
      if (!links.length) return res.json({ clients: [], columns: [] });

      const linkIds = links.map(l => l.id);
      const files = await db.select().from(clientUploadFiles)
        .where(and(
          inArray(clientUploadFiles.linkId, linkIds),
          eq(clientUploadFiles.source, "board"),
        ))
        .orderBy(desc(clientUploadFiles.createdAt));

      if (!files.length) return res.json({ clients: [], columns: [] });

      const clientIds = [...new Set(files.map(f => f.firmClientId).filter(Boolean))] as number[];
      const clientRows = clientIds.length > 0
        ? await db.select().from(firmClients).where(inArray(firmClients.id, clientIds))
        : [];
      const clientMap = Object.fromEntries(clientRows.map(c => [c.id, c]));

      const categories = [...new Set(files.map(f => f.category).filter(Boolean))];

      const result = clientIds.map(cid => {
        const client = clientMap[cid];
        if (!client) return null;
        const clientFiles = files.filter(f => f.firmClientId === cid);
        const docTypes: Record<string, any[]> = {};
        for (const cat of categories) {
          const catFiles = clientFiles.filter(f => f.category === cat);
          if (catFiles.length > 0) {
            docTypes[cat!] = catFiles.map(f => ({
              id: f.id,
              name: f.fileName,
              path: f.objectPath,
              size: f.fileSize,
              uploaderName: f.uploaderName,
              createdAt: f.createdAt,
            }));
          }
        }
        return { clientId: cid, clientName: client.name, docTypes };
      }).filter(Boolean);

      res.json({
        clients: result,
        columns: categories.map((c, i) => ({ id: i, name: c })),
        month,
        year,
      });
    } catch (e: any) {
      console.error("[Office documents] Error:", e.message);
      res.status(500).json({ message: e.message });
    }
  });
}
