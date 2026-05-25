# 🖥️ Environment Diff: Replit Dev vs พี่ช้าง Workstation

> อัปเดตล่าสุด: 2026-05-25
> ใช้งานไฟล์นี้ตลอดช่วงที่พี่ช้างอ่าน code อยู่ (ประมาณ 2-3 วัน)
> Workflow: **Replit Dev → พี่ช้าง review → push production**

---

## สิ่งที่อยู่บน Replit Dev แต่ยังไม่อยู่บน Workstation

| # | ไฟล์ | การเปลี่ยนแปลง | วันที่ | ผู้อนุมัติ |
|---|------|---------------|--------|-----------|
| 1 | `shared/permissions.ts` | PRIMARY_ONLY_MODULES ลดเหลือ `["firm-mgmt","etax-hub"]` | 2026-05-25 | พี่ทราย |
| 2 | `server/routes/core-routes.ts` | ลบ managerExceptions / accountantExceptions / empCashierExceptions — simplify เป็น filter เดียว | 2026-05-25 | พี่ทราย |

---

## สิ่งที่อยู่บน Workstation แต่ไม่มีบน Replit Dev

| # | รายการ | รายละเอียด |
|---|--------|-----------|
| 1 | reCAPTCHA keys ใน `system_config` DB | Workstation: INSERT แล้วใน `helium_replit` / Replit Dev: ยังไม่มี → login ผ่าน reCAPTCHA widget ใน dev ไม่ได้ |
| 2 | `.env` → `REPL_SLUG=local-dev-workstation` | เฉพาะ Windows — bypass encryption check + bind localhost (ถ้าใช้ REPL_ID จะ crash รูปแบบ ENOTSUP) |
| 3 | `.env` → `PORT=5010` | เฉพาะ workstation — Replit dev ใช้ port ที่ระบบกำหนด |
| 4 | `vite-plugin-meta-images.ts` | สร้างไว้บน workstation เฉพาะ — ไม่มีใน repo |

---

## Workstation รายละเอียด

| Item | ค่า |
|------|-----|
| OS | Windows 10 (Build 19044) |
| Path | `F:\SSD-Worrk\Kai_replit_project` |
| DB | PostgreSQL 16, DB name = `helium_replit`, port 5432 |
| Server port | 5010 |
| URL | `http://localhost:5010` |
| NODE_ENV | development |

---

## วิธี sync workstation ให้ตรงกับ Replit Dev

เมื่อพี่ช้าง approve การเปลี่ยนแปลงใดๆ บน Dev แล้ว ให้ pull code ลง workstation:

```bash
# บน workstation
cd F:\SSD-Worrk\Kai_replit_project
git pull
```

ไฟล์ที่ต้อง sync ล่าสุด (2026-05-25):
- `shared/permissions.ts`
- `server/routes/core-routes.ts`

---

## กฎการอัปเดต status (พี่ช้าง 2026-05-25)

> **status เป็น "done" ได้เฉพาะเมื่อพี่ทรายยืนยันว่า "working on production" เท่านั้น**
> ถ้ายังไม่ได้รับการยืนยัน → status คือ "⏳ in progress"

---

## Log การเปลี่ยนแปลงสะสม (ต่อเนื่องจาก session นี้ไปเรื่อยๆ)

| วันที่ | ไฟล์ | สิ่งที่แก้ | Pushed | สถานะ |
|--------|------|-----------|--------|-------|
| 2026-05-25 | `shared/permissions.ts` | PRIMARY_ONLY_MODULES: ลดเหลือ `["firm-mgmt","etax-hub"]` | ✅ `cea43be4` | ⏳ in progress |
| 2026-05-25 | `server/routes/core-routes.ts` | cleanup managerExceptions/accountantExceptions/empCashierExceptions | ✅ `71705e7a` | ⏳ in progress |
| 2026-05-25 | `client/src/app-extra.tsx` | urlBase="/manufacturing" + support singular+plural material-issue routes | ✅ `d2822970` | ⏳ in progress |
| 2026-05-25 | `client/src/components/manufacturing-layout.tsx` | NAV_KEY_MAP: `/material-issue/form` → `/material-issues/form` | ✅ `37024ab7` | ⏳ in progress |
| 2026-05-25 | `client/src/pages/inventory/material-issue-list.tsx` | เพิ่มปุ่ม ← กลับ + แก้ navigate URLs singular → plural | ✅ `ceead1af` | ⏳ in progress |
| 2026-05-25 | `client/src/pages/inventory/material-issue-form.tsx` | แก้ post-save MO navigate: ลบ double `/manufacturing/` | ✅ `ebcf2cbd` | ⏳ in progress |
