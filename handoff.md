# HANDOFF — E-Tax Center (Kai)
(dynamic file — update whenever work status changes, agent switches, or task progresses)
Last updated: 2026-05-15

---

## CURRENT TASK

**Status:** DEPLOY #66 ✅ complete — production online 84.4mb
**No pending work** — waiting for new task from พี่ช้าง or พี่ทราย

---

## DEPLOY #66 — COMPLETED 2026-05-15

All 13 files pushed to GitHub and deployed to production successfully.

| Fix | Files |
|-----|-------|
| unitCost hardcoded "0" on import → uses entry.cost from Excel | products-routes.ts, product-import-export.tsx |
| delete import batch deactivated instead of truly deleting → clears initial stock_movements + warehouse_stock_levels before FK check | import-batch-routes.ts |
| duplicate badge disappeared after stat split → fallback for old response | product-import-export.tsx |
| innerJoin migration (eq products.active → innerJoin activeProducts) | commerce-intelligence.ts, price-calculator.ts, ad-cost-routes.ts, pos-routes.ts, ecommerce-routes.ts, notifications-routes.ts, products-routes.ts, storage.ts |
| bundle delete button (Trash2) | bundle-management.tsx |
| bulk permanent delete limit 1000, pagination option 1000 | products-routes.ts, inventory-list.tsx |
| downloadFile export added (build fix) | queryClient.ts |

**Note:** First build failed — queryClient.ts was a missing dependency of inventory-list.tsx. Pushed separately. Lesson: always grep imports before pushing.

---

## WHAT NEXT AGENT MUST DO

**No pending GitHub push.** Dev and production are in sync.

If new task arrives:
1. Read star-wars.txt line by line before touching anything production-related
2. Check imports of any server file before pushing (grep import lines → verify each module is in GitHub)
3. Dev test FIRST (Type A: test yourself / Type B: ask พี่ทราย) before any push
4. Get authorization from พี่ช้าง before every push

---

## PROTECTED FILES (never push to GitHub)
- client/src/App.tsx → bypass: client/src/app-extra.tsx
- server/index.ts → bypass: server/index-extra.ts
- shared/schema.ts → bypass: shared/schema-extra.ts

## PUSH METHOD
- GitHub API PUT per file via code_execution only
- Token: `git remote get-url github-production` — verify suffix ends with `UnnR7`
- Server command format: `git fetch origin && git checkout origin/main -- <files> && npm run build && pm2 restart etax-center`
