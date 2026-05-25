export type Role = "super_admin" | "admin" | "manager" | "accountant" | "employee" | "cashier" | "client";

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "เจ้าของแพลตฟอร์ม",
  admin: "ผู้ดูแลระบบ",
  manager: "ผู้จัดการ",
  accountant: "นักบัญชี",
  employee: "พนักงาน",
  cashier: "แคชเชียร์",
  client: "Guest",
};

export interface PermissionModule {
  key: string;
  label: string;
  description: string;
  allowedRoles: Role[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { key: "dashboard", label: "แผงควบคุม", description: "ดูภาพรวมระบบและสถิติ", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "accounting", label: "การบัญชี", description: "สมุดบัญชีรายวัน, ผังบัญชี, ตั้งค่าสูตรบัญชี", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "petty-cash", label: "เงินสดย่อย", description: "ดูวงเงิน, เบิก-จ่าย, เติมเงิน เงินสดย่อย", allowedRoles: ["admin", "manager", "accountant", "employee", "cashier"] },
  { key: "sales", label: "การขาย & รายได้", description: "ใบเสนอราคา, ใบสั่งขาย, ใบแจ้งหนี้, ใบกำกับภาษี", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "purchases", label: "การซื้อ & รายจ่าย", description: "ใบขอซื้อ, ใบสั่งซื้อ, เอกสารซื้อ, รายจ่าย", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "finance", label: "การเงิน", description: "รับเงิน, ชำระเงิน, เช็ค, ภาษีหัก ณ ที่จ่าย", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "contacts", label: "ประวัติคู่ค้า", description: "จัดการรายชื่อคู่ค้า", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "inventory", label: "คลังสินค้า", description: "จัดการสินค้าและสต็อก", allowedRoles: ["admin", "manager", "accountant", "employee", "cashier"] },
  { key: "assets", label: "ทะเบียนสินทรัพย์", description: "บันทึกสินทรัพย์และค่าเสื่อมราคา", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "reports", label: "รายงาน", description: "ดูรายงานทั่วไปและบัญชีต้นทุน", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "firm-mgmt", label: "บริหารสำนักงาน", description: "จัดการลูกค้า, ค่าบริการ, ติดตามงาน", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "hr", label: "HR & เวลาทำงาน", description: "ลงเวลา, OT, ทะเบียนพนักงาน, เงินเดือน", allowedRoles: ["admin", "manager", "accountant", "employee", "cashier"] },
  { key: "ecommerce", label: "eCommerce Hub", description: "เชื่อมต่อ Shopee/Lazada/TikTok, จัดการออเดอร์, ซิงค์สต๊อก, ไลฟ์ขายของ", allowedRoles: ["admin", "manager", "accountant", "employee", "cashier"] },
  { key: "pos", label: "POS ขายหน้าร้าน", description: "ขายหน้าร้าน, เปิด/ปิดกะ, รายงานยอดขาย", allowedRoles: ["admin", "manager", "accountant", "employee", "cashier"] },
  { key: "commerce-intelligence", label: "Commerce Intelligence", description: "วิเคราะห์ธุรกิจ eCommerce: Executive, Channel, Product, Campaign, Live", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "etax-hub", label: "E-Tax Hub", description: "จัดการงานลูกค้า, มอบหมายงาน, แชร์เอกสาร (Monday.com style)", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "gas-station", label: "ปั๊มน้ำมัน", description: "บัญชีปั๊มน้ำมัน, ยอดขายรายวัน, สต็อก, มิเตอร์, Oil Loss/Gain, ภาษีท้องถิ่น", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "job-costing", label: "ต้นทุนงานก่อสร้าง", description: "บัญชีต้นทุนงาน, กำไรขาดทุนแต่ละโปรเจค, ต้นทุนต่อยูนิต", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "crm", label: "CRM ลูกค้า", description: "จัดการลูกค้า, ต้นทุนโฆษณา & ROAS", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "tax-tools", label: "Tax Tools", description: "นำเข้า 50 ทวิ, สร้างงบการเงิน, ดึงใบเสร็จราชการ", allowedRoles: ["admin", "manager", "accountant"] },
  { key: "manufacturing", label: "ระบบผลิต", description: "สูตรผลิต, ใบสั่งผลิต, Traceability, สแกน Serial, เครื่องมือวัด", allowedRoles: ["admin", "manager", "accountant", "employee", "cashier"] },
  { key: "settings", label: "ตั้งค่า", description: "กำหนดสิทธิ์ผู้ใช้งาน, ตั้งค่าระบบ", allowedRoles: ["admin", "manager"] },
  { key: "client-portal", label: "ดูข้อมูลบริษัท (ลูกค้า)", description: "ดูรายงาน, ใบแจ้งหนี้ของบริษัทตนเอง", allowedRoles: ["client"] },
];

export const NAV_KEY_MAP: Record<string, string> = {
  "/": "dashboard",
  "/dashboard/analytical": "dashboard",
  "/dashboard/ecommerce": "dashboard",
  "/hr/dashboard": "dashboard",
  "/office/chat": "dashboard",
  "/office/meetings": "dashboard",

  "/firm-mgmt": "firm-mgmt",
  "/firm-mgmt/assignments": "firm-mgmt",
  "/firm-mgmt/contracts": "firm-mgmt",
  "/firm-mgmt/clients": "firm-mgmt",
  "/firm-mgmt/billing": "firm-mgmt",
  "/firm-mgmt/documents": "firm-mgmt",
  "/line-document-archive": "firm-mgmt",
  "/office/calendar": "firm-mgmt",

  "/etax-hub": "etax-hub",
  "/etax-hub/board": "etax-hub",

  "/accounting": "accounting",
  "/journal": "accounting",
  "/coa": "accounting",
  "/accounting/formulas": "accounting",
  "/reports/general-ledger": "accounting",
  "/reports/trial-balance": "accounting",
  "/reports/income-statement": "accounting",
  "/reports/balance-sheet": "accounting",
  "/accounting-mgmt": "accounting",

  "/petty-cash": "petty-cash",

  "/sales": "sales",
  "/sales/pipeline": "sales",
  "/sales/quote": "sales",
  "/sales/order": "sales",
  "/sales/invoice": "sales",
  "/delivery-notes": "sales",
  "/sales/tax-invoice": "sales",
  "/sales/etax-sent": "sales",
  "/sales/receipt": "sales",
  "/sales/deposit": "sales",
  "/sales/credit-note": "sales",
  "/sales/tax-report": "sales",
  "/sales/commission": "sales",

  "/purchases": "purchases",
  "/purchases/pr": "purchases",
  "/purchases/bid": "purchases",
  "/purchases/po": "purchases",
  "/purchases/invoice": "purchases",
  "/purchases/expense": "purchases",
  "/purchases/debit-note": "purchases",
  "/purchases/purchase-deposit": "purchases",
  "/purchases/tax-report": "purchases",
  "/purchases/wht": "purchases",

  "/finance": "finance",
  "/finance/due-calendar": "finance",
  "/finance/cash-flow-forecast": "finance",
  "/finance/receipt-billing": "finance",
  "/finance/billing-notes": "finance",
  "/finance/ap-billing": "finance",
  "/finance/payments": "finance",
  "/finance/cheques": "finance",
  "/finance/cheque-history": "finance",

  "/contacts": "contacts",
  "/contacts/list": "contacts",
  "/contacts/history": "contacts",
  "/contacts/settings": "contacts",

  "/inventory": "inventory",
  "/inventory/list": "inventory",
  "/inventory/bundles": "inventory",
  "/inventory/promotions": "inventory",
  "/inventory/warehouse": "inventory",
  "/inventory/stock-transfer": "inventory",
  "/inventory/requisition": "inventory",
  "/inventory/stock-card": "inventory",
  "/inventory/bom": "inventory",
  "/inventory/manufacturing": "inventory",
  "/inventory/lots": "inventory",
  "/inventory/reports/valuation": "inventory",
  "/inventory/reports/movement-summary": "inventory",
  "/inventory/reports/slow-moving": "inventory",
  "/inventory/product-mapping": "inventory",
  "/inventory/import-export": "inventory",
  "/inventory/barcode-labels": "inventory",

  "/assets": "assets",
  "/assets/registry": "assets",
  "/assets/categories": "assets",
  "/assets/installments": "assets",
  "/assets/depreciation": "assets",
  "/assets/sales": "assets",
  "/assets/expired": "assets",
  "/assets/summary": "assets",
  "/assets/history": "assets",

  "/reports": "reports",
  "/reports/general": "reports",

  "/hr": "hr",
  "/hr/attendance": "hr",
  "/hr/attendance-report": "hr",
  "/hr/leave": "hr",
  "/hr/ot": "hr",
  "/hr/employees": "hr",
  "/hr/certificates": "hr",
  "/hr/work-schedule": "hr",
  "/hr/shift-settings": "hr",
  "/hr/shift-schedule": "hr",
  "/hr/holidays": "hr",
  "/hr/payroll-tax": "hr",
  "/hr/commission-rules": "hr",
  "/hr/commission": "hr",
  "/hr/performance": "hr",

  "/crm": "crm",
  "/crm/customers": "crm",
  "/ads/tracking": "crm",

  "/ecommerce": "ecommerce",
  "/ecommerce/orders": "ecommerce",
  "/ecommerce/import": "ecommerce",
  "/ecommerce/documents": "ecommerce",
  "/ecommerce/returns": "ecommerce",
  "/ecommerce/live-selling": "ecommerce",
  "/ecommerce/inventory": "ecommerce",
  "/ecommerce/warehouses": "ecommerce",
  "/ecommerce/stock-alerts": "ecommerce",
  "/ecommerce/hub": "ecommerce",
  "/ecommerce/store-clone": "ecommerce",
  "/ecommerce/fulfillment": "ecommerce",
  "/ecommerce/shipping-labels": "ecommerce",
  "/ecommerce/settlements": "ecommerce",
  "/ecommerce/reconciliation": "ecommerce",
  "/ecommerce/analytics": "ecommerce",
  "/ecommerce/price-calculator": "ecommerce",
  "/ecommerce/connections": "ecommerce",
  "/ecommerce/auto-sync": "ecommerce",
  "/ecommerce/grab-food": "ecommerce",
  "/ecommerce/facebook-orders": "ecommerce",
  "/ecommerce/api-connect": "ecommerce",
  "/ecommerce/chat": "ecommerce",
  "/ecommerce/settings": "ecommerce",

  "/ci": "commerce-intelligence",
  "/ci/executive": "commerce-intelligence",
  "/ci/channel": "commerce-intelligence",
  "/ci/product": "commerce-intelligence",
  "/ci/campaign": "commerce-intelligence",
  "/ci/live": "commerce-intelligence",
  "/ci/alerts": "commerce-intelligence",

  "/pos": "pos",
  "/pos/terminal": "pos",
  "/pos/dashboard": "pos",
  "/pos/sales": "pos",
  "/pos/sessions": "pos",
  "/pos/loyalty": "pos",
  "/pos-hub/dashboard": "pos",
  "/pos-hub/sales-by-branch": "pos",
  "/pos-hub/sales-by-product": "pos",
  "/pos-hub/sales-by-category": "pos",
  "/pos-hub/best-sellers": "pos",
  "/pos-hub/payment-analysis": "pos",
  "/pos-hub/cashier-performance": "pos",
  "/pos-hub/hourly-trends": "pos",
  "/pos-hub/daily-summary": "pos",
  "/restaurant-pos": "pos",

  "/gas-station": "gas-station",
  "/gas-station/dashboard": "gas-station",
  "/gas-station/setup": "gas-station",
  "/gas-station/daily-sales": "gas-station",
  "/gas-station/fuel-stock": "gas-station",
  "/gas-station/oil-loss-gain": "gas-station",
  "/gas-station/local-tax": "gas-station",
  "/gas-station/reports": "gas-station",

  "/job-costing": "job-costing",

  "/tax-tools": "tax-tools",
  "/tax-tools/wht-import": "tax-tools",
  "/tax-tools/financial-statements": "tax-tools",
  "/tax-tools/gov-receipt": "tax-tools",

  "/settings": "settings",
  "/settings/users": "settings",
  "/settings/general": "settings",
  "/settings/document-templates": "settings",
  "/settings/company-info": "settings",
  "/settings/profile": "settings",

  "/activity-log": "settings",
  "/ecommerce/dashboard": "ecommerce",
  "/system-info": "settings",
};

export function hasPermission(role: string, moduleKey: string): boolean {
  const mod = PERMISSION_MODULES.find(m => m.key === moduleKey);
  if (!mod) return false;
  return mod.allowedRoles.includes(role as Role);
}

export function canAccessRoute(role: string, path: string): boolean {
  const moduleKey = NAV_KEY_MAP[path];
  if (!moduleKey) return true;
  return hasPermission(role, moduleKey);
}

export const PRIMARY_ONLY_MODULES = ["firm-mgmt", "etax-hub"];
export const FIRM_ONLY_MODULES = ["firm-mgmt"];

export const CONFIDENTIAL_SUB_MODULES = [
  "hr/payslip",
  "hr/payroll-tax",
  "hr/certificates",
];

export const HR_PERSONAL_SUB_MODULES = [
  "hr/ess",
  "hr/attendance",
  "hr/attendance-report",
  "hr/leave",
  "hr/ot",
];

export const HR_ADMIN_SUB_MODULES = [
  "hr/employees",
  "hr/payslip",
  "hr/payroll-tax",
  "hr/certificates",
  "hr/holidays",
  "hr/work-schedule",
  "hr/shift-settings",
  "hr/shift-schedule",
  "hr/performance",
  "hr/commission-rules",
  "hr/commission",
];

export interface SubModule {
  key: string;
  label: string;
  parentModule: string;
  href: string;
}

export const SUB_MODULES: SubModule[] = [
  { key: "dashboard/analytical", label: "Analytical", parentModule: "dashboard", href: "/dashboard/analytical" },
  { key: "dashboard/ecommerce", label: "eCommerce", parentModule: "dashboard", href: "/dashboard/ecommerce" },
  { key: "dashboard/hrm", label: "HRM Dashboard", parentModule: "dashboard", href: "/hr/dashboard" },

  { key: "firm-mgmt/assignments", label: "มอบหมายงาน", parentModule: "firm-mgmt", href: "/firm-mgmt/assignments" },
  { key: "firm-mgmt/contracts", label: "สัญญาจ้างทำบัญชี", parentModule: "firm-mgmt", href: "/firm-mgmt/contracts" },
  { key: "firm-mgmt/clients", label: "รายชื่อลูกค้าทั้งหมด", parentModule: "firm-mgmt", href: "/firm-mgmt/clients" },
  { key: "firm-mgmt/billing", label: "สรุปค่างวด/ค่าบริการ", parentModule: "firm-mgmt", href: "/firm-mgmt/billing" },
  { key: "firm-mgmt/documents", label: "คลังเอกสาร", parentModule: "firm-mgmt", href: "/firm-mgmt/documents" },
  { key: "firm-mgmt/line-archive", label: "ตั้งค่ากลุ่ม LINE", parentModule: "firm-mgmt", href: "/line-document-archive" },
  { key: "firm-mgmt/calendar", label: "ปฏิทินภาษี", parentModule: "firm-mgmt", href: "/office/calendar" },

  { key: "accounting/journal", label: "สมุดบัญชีรายวัน", parentModule: "accounting", href: "/journal" },
  { key: "accounting/coa", label: "ผังบัญชี", parentModule: "accounting", href: "/coa" },
  { key: "accounting/formulas", label: "สูตรบัญชีอัตโนมัติ", parentModule: "accounting", href: "/accounting/formulas" },
  { key: "accounting/general-ledger", label: "บัญชีแยกประเภท", parentModule: "accounting", href: "/reports/general-ledger" },
  { key: "accounting/trial-balance", label: "งบทดลอง", parentModule: "accounting", href: "/reports/trial-balance" },
  { key: "accounting/income-statement", label: "งบกำไรขาดทุน", parentModule: "accounting", href: "/reports/income-statement" },
  { key: "accounting/balance-sheet", label: "งบแสดงฐานะการเงิน", parentModule: "accounting", href: "/reports/balance-sheet" },
  { key: "accounting/mgmt", label: "การจัดการบัญชี", parentModule: "accounting", href: "/accounting-mgmt" },

  { key: "sales/pipeline", label: "Sales Pipeline", parentModule: "sales", href: "/sales/pipeline" },
  { key: "sales/quote", label: "ใบเสนอราคา [QO]", parentModule: "sales", href: "/sales/quote" },
  { key: "sales/order", label: "ใบสั่งขาย [SO]", parentModule: "sales", href: "/sales/order" },
  { key: "sales/invoice", label: "ใบแจ้งหนี้ [IV]", parentModule: "sales", href: "/sales/invoice" },
  { key: "sales/delivery-note", label: "ใบส่งของ [DN]", parentModule: "sales", href: "/delivery-notes" },
  { key: "sales/tax-invoice", label: "ใบกำกับภาษี [TIV]", parentModule: "sales", href: "/sales/tax-invoice" },
  { key: "sales/etax-sent", label: "รายการส่ง e-Tax", parentModule: "sales", href: "/sales/etax-sent" },
  { key: "sales/receipt", label: "ใบเสร็จรับเงิน [RE]", parentModule: "sales", href: "/sales/receipt" },
  { key: "sales/deposit", label: "ใบรับเงินมัดจำ [DP]", parentModule: "sales", href: "/sales/deposit" },
  { key: "sales/credit-note", label: "ใบลดหนี้ขาย [CN]", parentModule: "sales", href: "/sales/credit-note" },
  { key: "sales/tax-report", label: "รายงานภาษีขาย", parentModule: "sales", href: "/sales/tax-report" },
  { key: "sales/commission", label: "คอมมิชชั่นเซลส์", parentModule: "sales", href: "/sales/commission" },

  { key: "purchases/pr", label: "ใบขอซื้อ [PR]", parentModule: "purchases", href: "/purchases/pr" },
  { key: "purchases/bid", label: "เปรียบเทียบราคา [BID]", parentModule: "purchases", href: "/purchases/bid" },
  { key: "purchases/po", label: "ใบสั่งซื้อ [PO]", parentModule: "purchases", href: "/purchases/po" },
  { key: "purchases/invoice", label: "เอกสารซื้อ [AP]", parentModule: "purchases", href: "/purchases/invoice" },
  { key: "purchases/expense", label: "รายจ่ายอื่น (EXP)", parentModule: "purchases", href: "/purchases/expense" },
  { key: "purchases/debit-note", label: "ใบลดหนี้ซื้อ [DN]", parentModule: "purchases", href: "/purchases/debit-note" },
  { key: "purchases/purchase-deposit", label: "จ่ายเงินมัดจำ [PDP]", parentModule: "purchases", href: "/purchases/purchase-deposit" },
  { key: "purchases/tax-report", label: "รายงานภาษีซื้อ", parentModule: "purchases", href: "/purchases/tax-report" },
  { key: "purchases/wht", label: "ภาษีหัก ณ ที่จ่าย (50 ทวิ)", parentModule: "purchases", href: "/purchases/wht" },
  { key: "purchases/petty-cash", label: "เงินสดย่อย", parentModule: "purchases", href: "/petty-cash" },

  { key: "finance/due-calendar", label: "ปฏิทินครบกำหนดชำระ", parentModule: "finance", href: "/finance/due-calendar" },
  { key: "finance/cash-flow-forecast", label: "พยากรณ์เงินสด+ทุนหมุนเวียน", parentModule: "finance", href: "/finance/cash-flow-forecast" },
  { key: "finance/receipt-billing", label: "รายการรับเงิน", parentModule: "finance", href: "/finance/receipt-billing" },
  { key: "finance/billing-notes", label: "ใบวางบิล", parentModule: "finance", href: "/finance/billing-notes" },
  { key: "finance/ap-billing", label: "จ่ายเงิน/วางบิล", parentModule: "finance", href: "/finance/ap-billing" },
  { key: "finance/payments", label: "รายการชำระเงิน", parentModule: "finance", href: "/finance/payments" },
  { key: "finance/cheques", label: "จัดการเช็ครับ/เช็คเงินโอน", parentModule: "finance", href: "/finance/cheques" },
  { key: "finance/cheque-history", label: "ประวัติเช็ค", parentModule: "finance", href: "/finance/cheque-history" },

  { key: "contacts/list", label: "รายชื่อคู่ค้า", parentModule: "contacts", href: "/contacts/list" },
  { key: "contacts/history", label: "ประวัติการดูคู่ค้า", parentModule: "contacts", href: "/contacts/history" },
  { key: "contacts/settings", label: "ตั้งค่าประวัติ", parentModule: "contacts", href: "/contacts/settings" },

  { key: "inventory/list", label: "สรุปรายการสินค้า", parentModule: "inventory", href: "/inventory/list" },
  { key: "inventory/bundles", label: "สินค้าจัดชุด", parentModule: "inventory", href: "/inventory/bundles" },
  { key: "inventory/promotions", label: "โปรโมชั่น", parentModule: "inventory", href: "/inventory/promotions" },
  { key: "inventory/warehouse", label: "คลังสินค้า", parentModule: "inventory", href: "/inventory/warehouse" },
  { key: "inventory/stock-transfer", label: "โอนย้ายสินค้า", parentModule: "inventory", href: "/inventory/stock-transfer" },
  { key: "inventory/requisition", label: "เบิกสินค้า", parentModule: "inventory", href: "/inventory/requisition" },
  { key: "inventory/stock-card", label: "สต๊อกการ์ด", parentModule: "inventory", href: "/inventory/stock-card" },
  { key: "inventory/bom", label: "สูตรผลิต (BOM)", parentModule: "inventory", href: "/inventory/bom" },
  { key: "inventory/manufacturing", label: "ใบสั่งผลิต", parentModule: "inventory", href: "/inventory/manufacturing" },
  { key: "inventory/lots", label: "ล็อตการผลิต", parentModule: "inventory", href: "/inventory/lots" },
  { key: "inventory/valuation", label: "มูลค่าสินค้าคงเหลือ", parentModule: "inventory", href: "/inventory/reports/valuation" },
  { key: "inventory/movement-summary", label: "สรุปการเคลื่อนไหว", parentModule: "inventory", href: "/inventory/reports/movement-summary" },
  { key: "inventory/slow-moving", label: "สินค้าเคลื่อนไหวช้า", parentModule: "inventory", href: "/inventory/reports/slow-moving" },
  { key: "inventory/product-mapping", label: "เชื่อมโยง/สต๊อก", parentModule: "inventory", href: "/inventory/product-mapping" },
  { key: "inventory/import-export", label: "นำเข้า/ส่งออก Excel สินค้า", parentModule: "inventory", href: "/inventory/import-export" },
  { key: "inventory/barcode-labels", label: "ปริ้นท์ลาเบลบาร์โค้ด", parentModule: "inventory", href: "/inventory/barcode-labels" },

  { key: "assets/registry", label: "ทะเบียนสินทรัพย์", parentModule: "assets", href: "/assets/registry" },
  { key: "assets/categories", label: "หมวดหมู่ทรัพย์สิน", parentModule: "assets", href: "/assets/categories" },
  { key: "assets/installments", label: "สัญญาผ่อนชำระ", parentModule: "assets", href: "/assets/installments" },
  { key: "assets/depreciation", label: "รายงานค่าเสื่อมราคา", parentModule: "assets", href: "/assets/depreciation" },
  { key: "assets/sales", label: "รายงานการขายทรัพย์สิน", parentModule: "assets", href: "/assets/sales" },
  { key: "assets/expired", label: "รายงานทรัพย์สินหมดอายุ", parentModule: "assets", href: "/assets/expired" },
  { key: "assets/summary", label: "สรุปรายการ", parentModule: "assets", href: "/assets/summary" },
  { key: "assets/history", label: "ประวัติการลงบัญชี", parentModule: "assets", href: "/assets/history" },

  { key: "reports/general", label: "รายงานทั่วไป", parentModule: "reports", href: "/reports/general" },

  { key: "manufacturing/dashboard", label: "ภาพรวมการผลิต", parentModule: "manufacturing", href: "/manufacturing/dashboard" },
  { key: "manufacturing/bom", label: "สูตรการผลิต (BOM)", parentModule: "manufacturing", href: "/manufacturing/bom" },
  { key: "manufacturing/orders", label: "ใบสั่งผลิต", parentModule: "manufacturing", href: "/manufacturing/orders" },
  { key: "manufacturing/serial-numbers", label: "Serial Numbers", parentModule: "manufacturing", href: "/manufacturing/serial-numbers" },
  { key: "manufacturing/traceability", label: "ตรวจสอบย้อนกลับ", parentModule: "manufacturing", href: "/manufacturing/traceability" },
  { key: "manufacturing/calibration", label: "เครื่องมือวัด", parentModule: "manufacturing", href: "/manufacturing/calibration" },

  { key: "hr/ess", label: "บริการตนเอง (ESS)", parentModule: "hr", href: "/settings/profile" },
  { key: "hr/employees", label: "ทะเบียนพนักงาน", parentModule: "hr", href: "/hr/employees" },
  { key: "hr/certificates", label: "หนังสือรับรอง", parentModule: "hr", href: "/hr/certificates" },
  { key: "hr/attendance", label: "ลงเวลาเข้า-ออกงาน", parentModule: "hr", href: "/hr/attendance" },
  { key: "hr/attendance-report", label: "รายงานลงเวลา", parentModule: "hr", href: "/hr/attendance-report" },
  { key: "hr/leave", label: "ขอลา / อนุมัติลา", parentModule: "hr", href: "/hr/leave" },
  { key: "hr/ot", label: "จัดการ OT", parentModule: "hr", href: "/hr/ot" },
  { key: "hr/work-schedule", label: "ตั้งค่าเวลาทำงาน", parentModule: "hr", href: "/hr/work-schedule" },
  { key: "hr/shift-settings", label: "ตั้งค่ากะทำงาน", parentModule: "hr", href: "/hr/shift-settings" },
  { key: "hr/shift-schedule", label: "ตารางจัดกะ", parentModule: "hr", href: "/hr/shift-schedule" },
  { key: "hr/holidays", label: "ปฏิทินวันหยุด", parentModule: "hr", href: "/hr/holidays" },
  { key: "hr/payslip", label: "คำนวณเงินเดือน", parentModule: "hr", href: "/hr/payslip" },
  { key: "hr/payroll-tax", label: "จ่ายเงินเดือน / ภาษี", parentModule: "hr", href: "/hr/payroll-tax" },
  { key: "hr/commission-rules", label: "กฎคอมมิชชั่น", parentModule: "hr", href: "/hr/commission-rules" },
  { key: "hr/commission", label: "คำนวณค่าคอมมิชชั่น", parentModule: "hr", href: "/hr/commission" },
  { key: "hr/performance", label: "AI ประเมินผลงาน", parentModule: "hr", href: "/hr/performance" },

  { key: "crm/customers", label: "รายชื่อลูกค้า", parentModule: "crm", href: "/crm/customers" },
  { key: "crm/ads-tracking", label: "ต้นทุนโฆษณา & ROAS", parentModule: "crm", href: "/ads/tracking" },

  { key: "ecommerce/orders", label: "ออเดอร์ทั้งหมด", parentModule: "ecommerce", href: "/ecommerce/orders" },
  { key: "ecommerce/import", label: "นำเข้าออเดอร์", parentModule: "ecommerce", href: "/ecommerce/import" },
  { key: "ecommerce/documents", label: "เอกสาร eCommerce", parentModule: "ecommerce", href: "/ecommerce/documents" },
  { key: "ecommerce/returns", label: "คืนสินค้า/คืนเงิน", parentModule: "ecommerce", href: "/ecommerce/returns" },
  { key: "ecommerce/live-selling", label: "Live Selling", parentModule: "ecommerce", href: "/ecommerce/live-selling" },
  { key: "ecommerce/inventory", label: "สต็อกสินค้า", parentModule: "ecommerce", href: "/ecommerce/inventory" },
  { key: "ecommerce/warehouses", label: "คลังสินค้า", parentModule: "ecommerce", href: "/ecommerce/warehouses" },
  { key: "ecommerce/stock-alerts", label: "แจ้งเตือนสต็อกต่ำ", parentModule: "ecommerce", href: "/ecommerce/stock-alerts" },
  { key: "ecommerce/hub", label: "เชื่อมโยงสินค้า", parentModule: "ecommerce", href: "/ecommerce/hub" },
  { key: "ecommerce/store-clone", label: "โคลนร้านค้า / สินค้า", parentModule: "ecommerce", href: "/ecommerce/store-clone" },
  { key: "ecommerce/fulfillment", label: "จัดส่งสินค้า", parentModule: "ecommerce", href: "/ecommerce/fulfillment" },
  { key: "ecommerce/shipping-labels", label: "พิมพ์ใบปะหน้า", parentModule: "ecommerce", href: "/ecommerce/shipping-labels" },
  { key: "ecommerce/settlements", label: "ยอดเงินเข้า", parentModule: "ecommerce", href: "/ecommerce/settlements" },
  { key: "ecommerce/reconciliation", label: "กระทบยอดภาษี", parentModule: "ecommerce", href: "/ecommerce/reconciliation" },
  { key: "ecommerce/analytics", label: "วิเคราะห์ยอดขาย", parentModule: "ecommerce", href: "/ecommerce/analytics" },
  { key: "ecommerce/price-calculator", label: "คำนวณราคาขาย", parentModule: "ecommerce", href: "/ecommerce/price-calculator" },
  { key: "ecommerce/connections", label: "เชื่อมต่อร้านค้า", parentModule: "ecommerce", href: "/ecommerce/connections" },
  { key: "ecommerce/auto-sync", label: "Auto Sync", parentModule: "ecommerce", href: "/ecommerce/auto-sync" },
  { key: "ecommerce/grab-food", label: "Grab Food", parentModule: "ecommerce", href: "/ecommerce/grab-food" },
  { key: "ecommerce/facebook-orders", label: "Facebook Orders", parentModule: "ecommerce", href: "/ecommerce/facebook-orders" },
  { key: "ecommerce/api-connect", label: "Open API", parentModule: "ecommerce", href: "/ecommerce/api-connect" },
  { key: "ecommerce/chat", label: "Chat Inbox", parentModule: "ecommerce", href: "/ecommerce/chat" },
  { key: "ecommerce/settings", label: "ตั้งค่า eCommerce", parentModule: "ecommerce", href: "/ecommerce/settings" },

  { key: "commerce-intelligence/executive", label: "Executive Dashboard", parentModule: "commerce-intelligence", href: "/ci/executive" },
  { key: "commerce-intelligence/channel", label: "Channel Dashboard", parentModule: "commerce-intelligence", href: "/ci/channel" },
  { key: "commerce-intelligence/product", label: "Product & Profit", parentModule: "commerce-intelligence", href: "/ci/product" },
  { key: "commerce-intelligence/campaign", label: "Campaign Dashboard", parentModule: "commerce-intelligence", href: "/ci/campaign" },
  { key: "commerce-intelligence/live", label: "Live Commerce", parentModule: "commerce-intelligence", href: "/ci/live" },
  { key: "commerce-intelligence/alerts", label: "แจ้งเตือนอัจฉริยะ", parentModule: "commerce-intelligence", href: "/ci/alerts" },

  { key: "pos/terminal", label: "เปิดหน้าจอขาย", parentModule: "pos", href: "/pos/terminal" },
  { key: "pos/dashboard", label: "แดชบอร์ดยอดขาย", parentModule: "pos", href: "/pos/dashboard" },
  { key: "pos/sales", label: "รายการขาย", parentModule: "pos", href: "/pos/sales" },
  { key: "pos/sessions", label: "ประวัติกะขาย", parentModule: "pos", href: "/pos/sessions" },
  { key: "pos/loyalty", label: "สมาชิก / Loyalty", parentModule: "pos", href: "/pos/loyalty" },
  { key: "pos/hub-dashboard", label: "ภาพรวมยอดขาย (รายงาน)", parentModule: "pos", href: "/pos-hub/dashboard" },
  { key: "pos/hub-sales-by-branch", label: "ยอดขายแยกสาขา", parentModule: "pos", href: "/pos-hub/sales-by-branch" },
  { key: "pos/hub-sales-by-product", label: "ยอดขายแยกสินค้า", parentModule: "pos", href: "/pos-hub/sales-by-product" },
  { key: "pos/hub-sales-by-category", label: "ยอดขายแยกหมวดหมู่", parentModule: "pos", href: "/pos-hub/sales-by-category" },
  { key: "pos/hub-best-sellers", label: "สินค้าขายดี", parentModule: "pos", href: "/pos-hub/best-sellers" },
  { key: "pos/hub-payment-analysis", label: "วิเคราะห์ช่องทางชำระ", parentModule: "pos", href: "/pos-hub/payment-analysis" },
  { key: "pos/hub-cashier-performance", label: "ผลงานพนักงาน", parentModule: "pos", href: "/pos-hub/cashier-performance" },
  { key: "pos/hub-hourly-trends", label: "ช่วงเวลาขายดี", parentModule: "pos", href: "/pos-hub/hourly-trends" },
  { key: "pos/hub-daily-summary", label: "สรุปรายวัน", parentModule: "pos", href: "/pos-hub/daily-summary" },
  { key: "pos/restaurant", label: "POS ร้านอาหาร", parentModule: "pos", href: "/restaurant-pos" },

  { key: "gas-station/dashboard", label: "ภาพรวม", parentModule: "gas-station", href: "/gas-station/dashboard" },
  { key: "gas-station/setup", label: "ตั้งค่า", parentModule: "gas-station", href: "/gas-station/setup" },
  { key: "gas-station/daily-sales", label: "ยอดขายรายวัน", parentModule: "gas-station", href: "/gas-station/daily-sales" },
  { key: "gas-station/fuel-stock", label: "สต็อกน้ำมัน", parentModule: "gas-station", href: "/gas-station/fuel-stock" },
  { key: "gas-station/oil-loss-gain", label: "Oil Loss/Gain", parentModule: "gas-station", href: "/gas-station/oil-loss-gain" },
  { key: "gas-station/local-tax", label: "ภาษีท้องถิ่น", parentModule: "gas-station", href: "/gas-station/local-tax" },
  { key: "gas-station/reports", label: "รายงาน", parentModule: "gas-station", href: "/gas-station/reports" },

  { key: "job-costing/projects", label: "โปรเจคทั้งหมด", parentModule: "job-costing", href: "/job-costing" },

  { key: "tax-tools/wht-import", label: "นำเข้า 50 ทวิ / ภงด.1ก", parentModule: "tax-tools", href: "/tax-tools/wht-import" },
  { key: "tax-tools/financial-statements", label: "สร้างงบการเงิน (นำเข้า Excel)", parentModule: "tax-tools", href: "/tax-tools/financial-statements" },
  { key: "tax-tools/gov-receipt", label: "ดึงใบเสร็จราชการ", parentModule: "tax-tools", href: "/tax-tools/gov-receipt" },

  { key: "settings/users", label: "กำหนดสิทธิ์ผู้ใช้งาน", parentModule: "settings", href: "/settings/users" },
  { key: "settings/profile", label: "โปรไฟล์ / ลายเซ็น", parentModule: "settings", href: "/settings/profile" },
  { key: "settings/company-info", label: "ข้อมูลบริษัท", parentModule: "settings", href: "/settings/company-info" },
  { key: "settings/document-templates", label: "ตั้งค่าเอกสาร", parentModule: "settings", href: "/settings/document-templates" },
  { key: "settings/general", label: "ตั้งค่าทั่วไป", parentModule: "settings", href: "/settings/general" },
];

export function getSubModulesForModule(moduleKey: string): SubModule[] {
  return SUB_MODULES.filter(s => s.parentModule === moduleKey);
}

export function getSubModuleByHref(href: string): SubModule | undefined {
  return SUB_MODULES.find(s => s.href === href);
}

export function getNavModuleKey(href: string): string | undefined {
  if (href === "/") return "dashboard";
  const prefix = href.split("/").filter(Boolean)[0];
  return prefix || undefined;
}
