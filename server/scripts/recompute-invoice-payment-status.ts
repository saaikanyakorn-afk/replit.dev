/**
 * ONE-TIME RECOMPUTE SCRIPT — Invoice Payment Status
 *
 * วิธีใช้: npx tsx server/scripts/recompute-invoice-payment-status.ts
 *
 * ปัญหา: recomputePaymentStatus + computeRemainingBalance ใช้ WHERE status='paid'
 *   สำหรับ TIV query แต่ TIV จริงบน production มี status='debtor' → tivSum=0 ตลอด
 *   → 116 invoices ที่ออก TIV แล้วยังคง payment_status='unpaid'
 *
 * Fix code: แก้ทั้ง 2 จุดใน server/route-helpers.ts แล้ว (Batch #13)
 *   แต่ invoices เก่าใน DB ยังมี payment_status ผิด → ต้อง run script นี้ 1 ครั้ง
 *
 * ปลอดภัย: อ่าน DB_PROD_URL จาก env / system_config เท่านั้น
 *   ตรวจสอบว่า DRY_RUN=true ก่อน commit จริง
 */

import { Pool } from "pg";

const DRY_RUN = process.env.DRY_RUN !== "false";

async function main() {
  const prodUrl = process.env.DB_PROD_URL;
  if (!prodUrl) {
    console.error("❌ DB_PROD_URL env var not set");
    process.exit(1);
  }

  console.log(`🔌 Connecting to production DB...`);
  console.log(`⚠️  DRY_RUN=${DRY_RUN} (set DRY_RUN=false to commit changes)`);

  const pool = new Pool({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });

  try {
    // 1. หา invoices ทั้งหมดที่มี TIV linked และ TIV ไม่ถูก cancel
    const candidateRes = await pool.query(`
      SELECT DISTINCT iv.id,
             iv.invoice_no,
             iv.payment_status,
             iv.status,
             iv.total_amount::text AS total_amount,
             iv.withholding_tax::text AS withholding_tax,
             iv.company_id
      FROM invoices iv
      JOIN tax_invoices ti ON ti.invoice_id = iv.id
      WHERE ti.status NOT IN ('cancelled','voided','cancel')
        AND (ti.payment_method IS NULL OR ti.payment_method != 'เครดิต')
        AND iv.status NOT IN ('cancelled','voided','cancel')
      ORDER BY iv.id
    `);

    console.log(`\n📋 พบ ${candidateRes.rows.length} invoices ที่มี TIV linked`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const iv of candidateRes.rows) {
      const docTotal = parseFloat(iv.total_amount || "0");
      const wht = parseFloat(iv.withholding_tax || "0");

      // คำนวณ tivSum ของ invoice นี้
      const tivRes = await pool.query(`
        SELECT COALESCE(SUM(subtotal + COALESCE(vat_amount,0)),0)::text AS s
        FROM tax_invoices
        WHERE invoice_id = $1
          AND status NOT IN ('cancelled','voided','cancel')
          AND (payment_method IS NULL OR payment_method != 'เครดิต')
      `, [iv.id]);
      const tivSum = parseFloat(tivRes.rows[0]?.s || "0");

      // คำนวณ directSum จาก receipts
      const directRes = await pool.query(`
        SELECT COALESCE(SUM(total_amount),0)::text AS s
        FROM receipts WHERE invoice_id = $1
      `, [iv.id]);
      const directSum = parseFloat(directRes.rows[0]?.s || "0");

      // คำนวณ batchSum จาก receipt_linked_docs
      const batchRes = await pool.query(`
        SELECT COALESCE(SUM(amount),0)::text AS s
        FROM receipt_linked_docs WHERE doc_type = 'IV' AND doc_id = $1
      `, [iv.id]);
      const batchSum = parseFloat(batchRes.rows[0]?.s || "0");

      const rawPaid = directSum + batchSum + tivSum;
      const whtAmount = rawPaid > 0 ? wht : 0;
      const totalPaid = rawPaid + whtAmount;

      let newPaymentStatus: "unpaid" | "partial" | "paid" = "unpaid";
      if (totalPaid > 0 && totalPaid < docTotal - 0.01) newPaymentStatus = "partial";
      else if (totalPaid >= docTotal - 0.01 && totalPaid > 0) newPaymentStatus = "paid";

      if (newPaymentStatus === iv.payment_status) {
        skippedCount++;
        continue;
      }

      const newStatus =
        newPaymentStatus === "paid" && !["cancelled","voided","cancel"].includes(iv.status)
          ? "paid"
          : newPaymentStatus !== "paid" && iv.status === "paid"
          ? "debtor"
          : iv.status;

      console.log(
        `  ${DRY_RUN ? "[DRY]" : "[UPD]"} IV#${iv.id} ${iv.invoice_no} ` +
        `payment_status: ${iv.payment_status} → ${newPaymentStatus} | ` +
        `status: ${iv.status} → ${newStatus} | ` +
        `tivSum=${tivSum.toFixed(2)} direct=${directSum.toFixed(2)} batch=${batchSum.toFixed(2)} total=${docTotal.toFixed(2)}`
      );

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE invoices SET payment_status = $2, status = $3 WHERE id = $1`,
          [iv.id, newPaymentStatus, newStatus]
        );
      }
      updatedCount++;
    }

    console.log(`\n✅ สรุป:`);
    console.log(`   invoices ที่จะแก้: ${updatedCount}`);
    console.log(`   invoices ที่ถูกต้องแล้ว (skip): ${skippedCount}`);
    if (DRY_RUN) {
      console.log(`\n⚠️  DRY RUN — ไม่มีการ commit จริง`);
      console.log(`   เพื่อ commit จริง: DRY_RUN=false npx tsx server/scripts/recompute-invoice-payment-status.ts`);
    } else {
      console.log(`\n🚀 COMMITTED — ${updatedCount} invoices updated ✅`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
