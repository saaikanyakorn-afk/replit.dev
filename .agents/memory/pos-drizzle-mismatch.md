---
name: POS posDb Drizzle schema mismatch
description: posDb (Drizzle ORM) select returns 735 rows but every field is empty string; raw SQL via pool works correctly
---

# posDb Drizzle ORM returns empty fields for products table

## The Rule
Never use `posDb.select().from(products)` for the `/api/pos/products` endpoint.
Always use `getPosPoolInstance().query(rawSql, params)` directly.

## Why
`posDb` (NodePgDatabase) schema mapping does not match the actual DB columns for the `products` table — Drizzle returns the correct row count but every field value is an empty string `""`. This is a schema mismatch between the Drizzle schema definition and the live DB that posDb connects to.

Raw SQL via `pg.Pool.query()` returns correct values with proper camelCase aliases.

## How to apply
In `server/routes/pos-routes.ts` `/api/pos/products` handler:
- Use `getPosPoolInstance().query(sql, params)` — import `getPosPoolInstance` from `../pos-db`
- SELECT with explicit AS aliases: `product_type AS "productType"`, `image_url AS "imageUrl"`, `vat_type AS "vatType"`, etc.
- React Query key: `"pos-products-v2"` with `staleTime: 0, gcTime: 0` to prevent stale cache

## Debug process
UI debug banner showed `count=735 | name="" | price=""` confirming Drizzle mismatch.
Server console.log `row0={"name":"ปลอกผ้านวม60*80 รหัส005",...}` confirmed raw SQL worked.
React Query cache (holding old empty-string data) was busted by changing queryKey to `"pos-products-v2"`.
