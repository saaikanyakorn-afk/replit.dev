import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, date, boolean, serial, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  configKey: text("config_key").notNull().unique(),
  configValue: text("config_value").notNull(),
  description: text("description"),
  environment: text("environment").notNull().default("all"),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SystemConfig = typeof systemConfig.$inferSelect;

export const platformLocations = pgTable("platform_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  locationType: text("location_type").notNull().default("company"),
  parentId: integer("parent_id"),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlatformLocationSchema = createInsertSchema(platformLocations).omit({ id: true, createdAt: true, updatedAt: true });
export type PlatformLocation = typeof platformLocations.$inferSelect;
export type InsertPlatformLocation = z.infer<typeof insertPlatformLocationSchema>;

export const machines = pgTable("machines", {
  id: serial("id").primaryKey(),
  localName: text("local_name").notNull(),
  displayName: text("display_name"),
  windowsName: text("windows_name"),
  fqdn: text("fqdn"),
  domainName: text("domain_name"),
  lanIp: text("lan_ip"),
  wanIp: text("wan_ip"),
  os: text("os").notNull().default("linux"),
  serverType: text("server_type").notNull().default("app_database"),
  role: text("role").notNull().default("production"),
  cpuModel: text("cpu_model"),
  ramSize: text("ram_size"),
  machineModel: text("machine_model"),
  dbPort: text("db_port").notNull().default("5432"),
  dbName: text("db_name").notNull(),
  dbUser: text("db_user").notNull(),
  dbPassword: text("db_password").notNull(),
  notes: text("notes"),
  encHostname: text("enc_hostname"),
  encMacAddress: text("enc_mac_address"),
  encConfigDbPort: text("enc_config_db_port"),
  encConfigDbName: text("enc_config_db_name"),
  encConfigDbUser: text("enc_config_db_user"),
  encConfigDbPassword: text("enc_config_db_password"),
  encContent: text("enc_content"),
  encGeneratedAt: timestamp("enc_generated_at"),
  envContent: text("env_content"),
  isOfficial: boolean("is_official").notNull().default(false),
  targetDbMachineId: integer("target_db_machine_id"),
  routerId: integer("router_id"),
  internetType: text("internet_type").notNull().default("dynamic"),
  repoName: text("repo_name"),
  repoUrl: text("repo_url"),
  repoBranch: text("repo_branch").default("main"),
  sysadminEmail: text("sysadmin_email"),
  sysadminLineId: text("sysadmin_line_id"),
  sysadminFolder: text("sysadmin_folder"),
  physicalLocation: text("physical_location"),
  locationId: integer("location_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMachineSchema = createInsertSchema(machines).omit({ id: true, createdAt: true, updatedAt: true });
export type Machine = typeof machines.$inferSelect;
export type InsertMachine = z.infer<typeof insertMachineSchema>;

export const machineNics = pgTable("machine_nics", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").notNull(),
  nicName: text("nic_name").notNull(),
  macAddress: text("mac_address"),
  ipAddress: text("ip_address").notNull(),
  subnetMask: text("subnet_mask").notNull().default("255.255.255.0"),
  forwardedFor: text("forwarded_for"),
  forwardedPort: text("forwarded_port"),
  routerId: integer("router_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMachineNicSchema = createInsertSchema(machineNics).omit({ id: true, createdAt: true });
export type MachineNic = typeof machineNics.$inferSelect;
export type InsertMachineNic = z.infer<typeof insertMachineNicSchema>;

export const nicIpAddresses = pgTable("nic_ip_addresses", {
  id: serial("id").primaryKey(),
  nicId: integer("nic_id").notNull(),
  ipAddress: text("ip_address").notNull(),
  subnetMask: text("subnet_mask").notNull().default("255.255.255.0"),
  label: text("label"),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNicIpAddressSchema = createInsertSchema(nicIpAddresses).omit({ id: true, createdAt: true });
export type NicIpAddress = typeof nicIpAddresses.$inferSelect;
export type InsertNicIpAddress = z.infer<typeof insertNicIpAddressSchema>;

export const routers = pgTable("routers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  model: text("model"),
  lanIp: text("lan_ip"),
  adminUrl: text("admin_url"),
  adminUsername: text("admin_username"),
  adminPassword: text("admin_password"),
  wanIp: text("wan_ip"),
  internetType: text("internet_type").notNull().default("dynamic"),
  ispName: text("isp_name"),
  ispPackage: text("isp_package"),
  ispRegisteredCompany: text("isp_registered_company"),
  ispAccountNumber: text("isp_account_number"),
  ispLinkId: text("isp_link_id"),
  ispCallCenter: text("isp_call_center"),
  ispSupportUrl: text("isp_support_url"),
  physicalLocation: text("physical_location"),
  locationId: integer("location_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertRouterSchema = createInsertSchema(routers).omit({ id: true, createdAt: true, updatedAt: true });
export type Router = typeof routers.$inferSelect;
export type InsertRouter = z.infer<typeof insertRouterSchema>;

export const routerPortForwards = pgTable("router_port_forwards", {
  id: serial("id").primaryKey(),
  routerId: integer("router_id").notNull(),
  externalPort: text("external_port").notNull(),
  lanIp: text("lan_ip").notNull(),
  internalPort: text("internal_port"),
  protocol: text("protocol").notNull().default("TCP"),
  purpose: text("purpose"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRouterPortForwardSchema = createInsertSchema(routerPortForwards).omit({ id: true, createdAt: true });
export type RouterPortForward = typeof routerPortForwards.$inferSelect;
export type InsertRouterPortForward = z.infer<typeof insertRouterPortForwardSchema>;

export const platformDomains = pgTable("platform_domains", {
  id: serial("id").primaryKey(),
  domainName: text("domain_name").notNull(),
  provider: text("provider").notNull().default("noip"),
  manageUrl: text("manage_url"),
  username: text("username"),
  password: text("password"),
  routerId: integer("router_id"),
  isRouterManaged: boolean("is_router_managed").notNull().default(false),
  machineId: integer("machine_id"),
  purpose: text("purpose"),
  port: integer("port"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlatformDomainSchema = createInsertSchema(platformDomains).omit({ id: true, createdAt: true, updatedAt: true });
export type PlatformDomain = typeof platformDomains.$inferSelect;
export type InsertPlatformDomain = z.infer<typeof insertPlatformDomainSchema>;

export const routerDomains = pgTable("router_domains", {
  id: serial("id").primaryKey(),
  routerId: integer("router_id").notNull(),
  domainName: text("domain_name").notNull(),
  noipManageUrl: text("noip_manage_url"),
  noipUsername: text("noip_username"),
  noipPassword: text("noip_password"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRouterDomainSchema = createInsertSchema(routerDomains).omit({ id: true, createdAt: true });
export type RouterDomain = typeof routerDomains.$inferSelect;
export type InsertRouterDomain = z.infer<typeof insertRouterDomainSchema>;

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  tenantType: text("tenant_type").notNull().default("accounting_firm"),
  status: text("status").notNull().default("active"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenants.$inferSelect;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  fullNameEn: text("full_name_en"),
  fullNameZh: text("full_name_zh"),
  role: text("role").notNull().default("employee"),
  email: text("email"),
  active: boolean("active").notNull().default(true),
  tenantId: integer("tenant_id").references(() => tenants.id),
  avatarUrl: text("avatar_url"),
  signatureUrl: text("signature_url"),
  signatureName: text("signature_name"),
  signatureNameEn: text("signature_name_en"),
  signatureNameZh: text("signature_name_zh"),
  signatureTitle: text("signature_title"),
  signatureTitleEn: text("signature_title_en"),
  signatureTitleZh: text("signature_title_zh"),
  allowedCompanyIds: integer("allowed_company_ids").array(),
  allowedBranchIds: integer("allowed_branch_ids").array(),
  lineId: text("line_id"),
  externalBoardToken: text("external_board_token"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  nameZh: text("name_zh"),
  industry: text("industry"),
  taxId: text("tax_id"),
  address: text("address"),
  addressEn: text("address_en"),
  addressZh: text("address_zh"),
  phone: text("phone"),
  email: text("email"),
  etaxEmail: text("etax_email"),
  etaxEnabled: boolean("etax_enabled").notNull().default(false),
  etaxTimestampEmail: text("etax_timestamp_email").default("csemail@etax.teda.th"),
  etaxBuyerTestEmail: text("etax_buyer_test_email"),
  etaxEmailProvider: text("etax_email_provider").notNull().default("resend"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port").default(587),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpSecure: boolean("smtp_secure").notNull().default(true),
  sellerTaxIdType: text("seller_tax_id_type").notNull().default("TXID"),
  sellerBranchId: text("seller_branch_id").default("00000"),
  sellerBuildingName: text("seller_building_name"),
  sellerBuildingNumber: text("seller_building_number"),
  sellerPostcode: text("seller_postcode"),
  sellerDistrictCode: text("seller_district_code"),
  sellerSubdistrictCode: text("seller_subdistrict_code"),
  sellerProvinceCode: text("seller_province_code"),
  fax: text("fax"),
  website: text("website"),
  lineId: text("line_id"),
  lineChannelAccessToken: text("line_channel_access_token"),
  lineChannelSecret: text("line_channel_secret"),
  facebook: text("facebook"),
  instagram: text("instagram"),
  tiktok: text("tiktok"),
  branch: text("branch"),
  active: boolean("active").notNull().default(true),
  isPrimary: boolean("is_primary").notNull().default(false),
  tenantType: text("tenant_type").notNull().default("accounting_firm"),
  businessType: text("business_type").notNull().default("mixed"),
  baseCurrency: text("base_currency").default("THB"),
  vatRegistered: boolean("vat_registered").notNull().default(false),
  vatRegisteredDate: date("vat_registered_date"),
  assetMinThreshold: decimal("asset_min_threshold", { precision: 15, scale: 2 }).default("0"),
  inventoryCostingMethod: text("inventory_costing_method").notNull().default("moving_average"),
  inventoryAccountingMethod: text("inventory_accounting_method").notNull().default("none"),
  stockEntrySource: text("stock_entry_source").notNull().default("gr"),
  ecomAutoReceiveStock: boolean("ecom_auto_receive_stock").notNull().default(false),
  accountingMode: text("accounting_mode").notNull().default("full_accounting"),
  autoTivOnShipped: boolean("auto_tiv_on_shipped").notNull().default(false),
  ecDailySummaryMode: boolean("ec_daily_summary_mode").notNull().default(false),
  gpsRequired: boolean("gps_required").notNull().default(false),
  officeLat: decimal("office_lat", { precision: 10, scale: 7 }),
  officeLng: decimal("office_lng", { precision: 10, scale: 7 }),
  gpsRadiusMeters: integer("gps_radius_meters").default(200),
  registrationDate: date("registration_date"),
  tenantId: integer("tenant_id").references(() => tenants.id),
  closingDeadlineDays: integer("closing_deadline_days").default(15),
});

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

export const departments = pgTable("departments", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  companyId: integer("company_id").references(() => companies.id),
  active: boolean("active").notNull().default(true),
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({ id: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departments.$inferSelect;

export const branches = pgTable("branches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  manager: text("manager"),
  taxId: text("tax_id"),
  warehouseId: integer("warehouse_id"),
  active: boolean("active").notNull().default(true),
});

export const insertBranchSchema = createInsertSchema(branches).omit({ id: true });
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type Branch = typeof branches.$inferSelect;

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  tenantId: integer("tenant_id").references(() => tenants.id),
  companyId: integer("company_id").references(() => companies.id),
  employeeCode: text("employee_code").notNull(),
  fullName: text("full_name").notNull(),
  titlePrefix: text("title_prefix"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  nickname: text("nickname"),
  idCardNumber: text("id_card_number"),
  taxId: text("tax_id"),
  address: text("address"),
  position: text("position"),
  department: text("department"),
  baseSalary: decimal("base_salary", { precision: 12, scale: 2 }).default("0"),
  startDate: date("start_date"),
  phone: text("phone"),
  email: text("email"),
  lineUserId: text("line_user_id"),
  active: boolean("active").notNull().default(true),
  exemptFromCheckin: boolean("exempt_from_checkin").notNull().default(false),
  workLocationId: integer("work_location_id"),
  incomeType: text("income_type").notNull().default("1"),
  employmentStatus: text("employment_status").notNull().default("active"),
  resignDate: date("resign_date"),
  resignReason: text("resign_reason"),
  dateOfBirth: date("date_of_birth"),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

export const employeeCounters = pgTable("employee_counters", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull().unique(),
  prefix: varchar("prefix", { length: 2 }).notNull(),
  lastNumber: integer("last_number").notNull().default(0),
});

export const insertEmployeeCounterSchema = createInsertSchema(employeeCounters).omit({ id: true });
export type InsertEmployeeCounter = z.infer<typeof insertEmployeeCounterSchema>;
export type EmployeeCounter = typeof employeeCounters.$inferSelect;

export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  date: date("date").notNull(),
  checkIn: timestamp("check_in"),
  checkOut: timestamp("check_out"),
  breakStart: timestamp("break_start"),
  breakEnd: timestamp("break_end"),
  status: text("status").notNull().default("present"),
  totalHours: decimal("total_hours", { precision: 5, scale: 2 }),
  note: text("note"),
  checkInLat: decimal("check_in_lat", { precision: 10, scale: 7 }),
  checkInLng: decimal("check_in_lng", { precision: 10, scale: 7 }),
  checkOutLat: decimal("check_out_lat", { precision: 10, scale: 7 }),
  checkOutLng: decimal("check_out_lng", { precision: 10, scale: 7 }),
  workLocationId: integer("work_location_id"),
  source: text("source").notNull().default("manual"),
});

export const insertAttendanceSchema = createInsertSchema(attendanceRecords).omit({ id: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;

export const scannerEmployeeMappings = pgTable("scanner_employee_mappings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  scannerDeviceId: text("scanner_device_id").notNull(),
  scannerEmployeeCode: text("scanner_employee_code").notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
});

export const insertScannerEmployeeMappingSchema = createInsertSchema(scannerEmployeeMappings).omit({ id: true });
export type InsertScannerEmployeeMapping = z.infer<typeof insertScannerEmployeeMappingSchema>;
export type ScannerEmployeeMapping = typeof scannerEmployeeMappings.$inferSelect;

export const scannerImportLogs = pgTable("scanner_import_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  filename: text("filename").notNull(),
  importedAt: timestamp("imported_at").defaultNow(),
  totalRecords: integer("total_records").notNull().default(0),
  matchedRecords: integer("matched_records").notNull().default(0),
  unmatchedRecords: integer("unmatched_records").notNull().default(0),
  importedBy: integer("imported_by").references(() => users.id),
});

export const insertScannerImportLogSchema = createInsertSchema(scannerImportLogs).omit({ id: true, importedAt: true });
export type InsertScannerImportLog = z.infer<typeof insertScannerImportLogSchema>;
export type ScannerImportLog = typeof scannerImportLogs.$inferSelect;

export const otRecords = pgTable("ot_records", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  date: date("date").notNull(),
  otType: text("ot_type").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  hours: decimal("hours", { precision: 5, scale: 2 }).notNull(),
  rate: decimal("rate", { precision: 3, scale: 1 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  approvedBy: integer("approved_by").references(() => users.id),
  source: text("source").notNull().default("manual"),
});

export const insertOtSchema = createInsertSchema(otRecords).omit({ id: true });
export type InsertOt = z.infer<typeof insertOtSchema>;
export type OtRecord = typeof otRecords.$inferSelect;

export const autoOtConfig = pgTable("auto_ot_config", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  autoOtEnabled: boolean("auto_ot_enabled").notNull().default(false),
  minOtMinutes: integer("min_ot_minutes").notNull().default(30),
  otRoundingMinutes: integer("ot_rounding_minutes").notNull().default(30),
});

export const insertAutoOtConfigSchema = createInsertSchema(autoOtConfig).omit({ id: true });
export type InsertAutoOtConfig = z.infer<typeof insertAutoOtConfigSchema>;
export type AutoOtConfig = typeof autoOtConfig.$inferSelect;

export const workLocations = pgTable("work_locations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  address: text("address"),
  lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
  lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
  radiusMeters: integer("radius_meters").notNull().default(200),
  active: boolean("active").notNull().default(true),
});

export const insertWorkLocationSchema = createInsertSchema(workLocations).omit({ id: true });
export type InsertWorkLocation = z.infer<typeof insertWorkLocationSchema>;
export type WorkLocation = typeof workLocations.$inferSelect;

export const workSchedules = pgTable("work_schedules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull().default("ตารางเวลาทำงานหลัก"),
  startTime: text("start_time").notNull().default("08:30"),
  endTime: text("end_time").notNull().default("17:30"),
  breakStartTime: text("break_start_time").default("12:00"),
  breakEndTime: text("break_end_time").default("13:00"),
  workDays: text("work_days").array().notNull().default(sql`ARRAY['mon','tue','wed','thu','fri']`),
  lateThresholdMinutes: integer("late_threshold_minutes").notNull().default(15),
  otCutoffDay: integer("ot_cutoff_day").notNull().default(0),
  isDefault: boolean("is_default").notNull().default(true),
  active: boolean("active").notNull().default(true),
});

export const insertWorkScheduleSchema = createInsertSchema(workSchedules).omit({ id: true });
export type InsertWorkSchedule = z.infer<typeof insertWorkScheduleSchema>;
export type WorkSchedule = typeof workSchedules.$inferSelect;

export const shifts = pgTable("shifts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  breakStartTime: text("break_start_time").default("12:00"),
  breakEndTime: text("break_end_time").default("13:00"),
  color: text("color").notNull().default("#03c9d7"),
  lateThresholdMinutes: integer("late_threshold_minutes").notNull().default(15),
  active: boolean("active").notNull().default(true),
});

export const insertShiftSchema = createInsertSchema(shifts).omit({ id: true });
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type Shift = typeof shifts.$inferSelect;

export const employeeShiftAssignments = pgTable("employee_shift_assignments", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  shiftId: integer("shift_id").references(() => shifts.id).notNull(),
  date: date("date").notNull(),
}, (table) => ({
  uniqueEmployeeDate: uniqueIndex("unique_employee_date").on(table.employeeId, table.date),
}));

export const insertEmployeeShiftAssignmentSchema = createInsertSchema(employeeShiftAssignments).omit({ id: true });
export type InsertEmployeeShiftAssignment = z.infer<typeof insertEmployeeShiftAssignmentSchema>;
export type EmployeeShiftAssignment = typeof employeeShiftAssignments.$inferSelect;

export const otSettings = pgTable("ot_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  otType: text("ot_type").notNull(),
  label: text("label").notNull(),
  rate: decimal("rate", { precision: 5, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
});

export const insertOtSettingSchema = createInsertSchema(otSettings).omit({ id: true });
export type InsertOtSetting = z.infer<typeof insertOtSettingSchema>;
export type OtSetting = typeof otSettings.$inferSelect;

export const leaveRequests = pgTable("leave_requests", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  leaveType: text("leave_type").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  days: decimal("days", { precision: 4, scale: 1 }).notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLeaveSchema = createInsertSchema(leaveRequests).omit({ id: true, approvedAt: true, createdAt: true });
export type InsertLeave = z.infer<typeof insertLeaveSchema>;
export type LeaveRequest = typeof leaveRequests.$inferSelect;

export const leavePolicies = pgTable("leave_policies", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  leaveType: text("leave_type").notNull(),
  annualQuota: integer("annual_quota").notNull().default(0),
  carryOverEnabled: boolean("carry_over_enabled").notNull().default(false),
  maxCarryOverDays: integer("max_carry_over_days").default(0),
  carryOverExpiryMonth: integer("carry_over_expiry_month").default(3),
  carryOverExpiryDay: integer("carry_over_expiry_day").default(31),
  active: boolean("active").notNull().default(true),
});

export const insertLeavePolicySchema = createInsertSchema(leavePolicies).omit({ id: true });
export type InsertLeavePolicy = z.infer<typeof insertLeavePolicySchema>;
export type LeavePolicy = typeof leavePolicies.$inferSelect;

export const leaveBalances = pgTable("leave_balances", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  year: integer("year").notNull(),
  leaveType: text("leave_type").notNull(),
  quota: decimal("quota", { precision: 5, scale: 1 }).notNull().default("0"),
  carriedOver: decimal("carried_over", { precision: 5, scale: 1 }).notNull().default("0"),
  used: decimal("used", { precision: 5, scale: 1 }).notNull().default("0"),
  expired: decimal("expired", { precision: 5, scale: 1 }).notNull().default("0"),
  carryOverExpiryDate: date("carry_over_expiry_date"),
});

export const insertLeaveBalanceSchema = createInsertSchema(leaveBalances).omit({ id: true });
export type InsertLeaveBalance = z.infer<typeof insertLeaveBalanceSchema>;
export type LeaveBalance = typeof leaveBalances.$inferSelect;

export const firmClients = pgTable("firm_clients", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  nickname: text("nickname"),
  nameEn: text("name_en"),
  nameZh: text("name_zh"),
  branch: text("branch").default("สำนักงานใหญ่"),
  branchEn: text("branch_en"),
  branchZh: text("branch_zh"),
  ownerName: text("owner_name"),
  ownerNameEn: text("owner_name_en"),
  ownerNameZh: text("owner_name_zh"),
  chartTemplate: text("chart_template").default("standard"),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  fax: text("fax"),
  email: text("email"),
  website: text("website"),
  taxId: text("tax_id"),
  address: text("address"),
  addressEn: text("address_en"),
  addressZh: text("address_zh"),
  assignedTo: integer("assigned_to").references(() => employees.id),
  invoiceCount: integer("invoice_count").notNull().default(0),
  serviceFee: decimal("service_fee", { precision: 12, scale: 2 }).default("0"),
  feeVatIncluded: boolean("fee_vat_included").notNull().default(false),
  whtRate: decimal("wht_rate", { precision: 5, scale: 2 }).default("3"),
  status: text("status").notNull().default("active"),
  lastSyncAt: timestamp("last_sync_at"),
  billingStatus: text("billing_status").default("pending"),
  notes: text("notes"),
  contactId: integer("contact_id").references(() => contacts.id),
  targetDbMachineId: integer("target_db_machine_id"),
});

export const insertFirmClientSchema = createInsertSchema(firmClients).omit({ id: true });
export type InsertFirmClient = z.infer<typeof insertFirmClientSchema>;
export type FirmClient = typeof firmClients.$inferSelect;

export const firmClientTeam = pgTable("firm_client_team", {
  id: serial("id").primaryKey(),
  firmClientId: integer("firm_client_id").references(() => firmClients.id, { onDelete: "cascade" }).notNull(),
  employeeId: integer("employee_id").references(() => employees.id, { onDelete: "cascade" }).notNull(),
  role: text("role").default("member"),
});

export const firmClientImportLogs = pgTable("firm_client_import_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id"),
  userName: text("user_name"),
  fileName: text("file_name"),
  mode: text("mode").notNull(),
  totalRows: integer("total_rows").default(0),
  imported: integer("imported").default(0),
  updated: integer("updated").default(0),
  skipped: integer("skipped").default(0),
  deleted: integer("deleted").default(0),
  errorCount: integer("error_count").default(0),
  errors: text("errors").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameTh: text("name_th"),
  nameZh: text("name_zh"),
  type: text("type").notNull(),
  parentCode: text("parent_code"),
  isHeader: boolean("is_header").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const insertAccountSchema = createInsertSchema(accounts).omit({ id: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accounts.$inferSelect;

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  entryNo: text("entry_no"),
  entryDate: date("entry_date").notNull(),
  reference: text("reference"),
  description: text("description"),
  journalBook: text("journal_book").default("general"),
  contactId: integer("contact_id"),
  contactName: text("contact_name"),
  costCenter: text("cost_center"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").notNull().default("posted"),
  sourceDocType: text("source_doc_type"),
  sourceDocId: integer("source_doc_id"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({ id: true, createdAt: true });
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

export const journalLines = pgTable("journal_lines", {
  id: serial("id").primaryKey(),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id).notNull(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  description: text("description"),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0"),
  costCenter: text("cost_center"),
  anchor: text("anchor"),
  originalDebit: decimal("original_debit", { precision: 15, scale: 2 }),
  originalCredit: decimal("original_credit", { precision: 15, scale: 2 }),
  originalCurrency: text("original_currency"),
});

export const insertJournalLineSchema = createInsertSchema(journalLines).omit({ id: true });
export type InsertJournalLine = z.infer<typeof insertJournalLineSchema>;
export type JournalLine = typeof journalLines.$inferSelect;

export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(),
  moduleKey: text("module_key").notNull(),
  allowed: boolean("allowed").notNull().default(true),
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({ id: true });
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;

export const userSubPermissions = pgTable("user_sub_permissions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  subModuleKey: text("sub_module_key").notNull(),
  allowed: boolean("allowed").notNull().default(true),
});

export const insertUserSubPermissionSchema = createInsertSchema(userSubPermissions).omit({ id: true });
export type InsertUserSubPermission = z.infer<typeof insertUserSubPermissionSchema>;
export type UserSubPermission = typeof userSubPermissions.$inferSelect;

export const accountingFormulas = pgTable("accounting_formulas", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  documentType: text("document_type").notNull(),
  businessType: text("business_type").notNull(),
  name: text("name").notNull(),
  nameTh: text("name_th").notNull(),
  nameZh: text("name_zh"),
  description: text("description"),
  noJournalEntry: boolean("no_journal_entry").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const insertAccountingFormulaSchema = createInsertSchema(accountingFormulas).omit({ id: true });
export type InsertAccountingFormula = z.infer<typeof insertAccountingFormulaSchema>;
export type AccountingFormula = typeof accountingFormulas.$inferSelect;

export const accountingFormulaLines = pgTable("accounting_formula_lines", {
  id: serial("id").primaryKey(),
  formulaId: integer("formula_id").references(() => accountingFormulas.id).notNull(),
  accountCode: text("account_code").notNull(),
  accountName: text("account_name").notNull(),
  direction: text("direction").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertAccountingFormulaLineSchema = createInsertSchema(accountingFormulaLines).omit({ id: true });
export type InsertAccountingFormulaLine = z.infer<typeof insertAccountingFormulaLineSchema>;
export type AccountingFormulaLine = typeof accountingFormulaLines.$inferSelect;

export const documentSettings = pgTable("document_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  logoUrl: text("logo_url"),
  showLogo: boolean("show_logo").notNull().default(true),
  showSignature: boolean("show_signature").notNull().default(true),
  showTaxId: boolean("show_tax_id").notNull().default(true),
  showBranch: boolean("show_branch").notNull().default(true),
  headerNote: text("header_note"),
  headerNoteEn: text("header_note_en"),
  headerNoteZh: text("header_note_zh"),
  footerNote: text("footer_note"),
  footerNoteEn: text("footer_note_en"),
  footerNoteZh: text("footer_note_zh"),
  paperSize: text("paper_size").notNull().default("A4"),
  docFontSize: text("doc_font_size").notNull().default("medium"),
  showQrOnDoc: boolean("show_qr_on_doc").notNull().default(true),
  bankAccountName: text("bank_account_name"),
  bankAccountNameEn: text("bank_account_name_en"),
  bankAccountNameZh: text("bank_account_name_zh"),
  bankAccountNumber: text("bank_account_number"),
  bankName: text("bank_name"),
  bankNameEn: text("bank_name_en"),
  bankNameZh: text("bank_name_zh"),
  qrCodeUrl: text("qr_code_url"),
  promptpayId: text("promptpay_id"),
  promptpayType: text("promptpay_type").default("phone"),
  promptpayEnabled: boolean("promptpay_enabled").notNull().default(false),
  docTypeColors: text("doc_type_colors"),
  colorMode: text("color_mode").notNull().default("color"),
  docNumberFormat: text("doc_number_format").notNull().default("Y_SEQ"),
  docNumberDigits: integer("doc_number_digits").notNull().default(5),
  dateEra: text("date_era").notNull().default("BE"),
  dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
  documentLanguage: text("document_language").notNull().default("th"),
  certSignerName: text("cert_signer_name"),
  certSignerPosition: text("cert_signer_position"),
  showProductCode: boolean("show_product_code").notNull().default(true),
  docPrefixes: text("doc_prefixes"),
  posReceiptWidth: text("pos_receipt_width").notNull().default("80mm"),
  posReceiptShowLogo: boolean("pos_receipt_show_logo").notNull().default(true),
  posReceiptShowCompanyInfo: boolean("pos_receipt_show_company_info").notNull().default(true),
  posReceiptShowQr: boolean("pos_receipt_show_qr").notNull().default(true),
  posReceiptHeaderText: text("pos_receipt_header_text"),
  posReceiptFooterText: text("pos_receipt_footer_text"),
  posReceiptAutoPrint: boolean("pos_receipt_auto_print").notNull().default(false),
  posReceiptFontSize: text("pos_receipt_font_size").notNull().default("large"),
  posReceiptPrefix: text("pos_receipt_prefix").notNull().default("POS"),
  ecDocPrefix: text("ec_doc_prefix").notNull().default("EC"),
  ecReceiptShowLogo: boolean("ec_receipt_show_logo").notNull().default(true),
  ecReceiptHeaderText: text("ec_receipt_header_text"),
  ecReceiptFooterText: text("ec_receipt_footer_text"),
  ecReceiptFontSize: text("ec_receipt_font_size").notNull().default("large"),
  ecReceiptShowCompanyInfo: boolean("ec_receipt_show_company_info").notNull().default(true),
  ecReceiptShowQr: boolean("ec_receipt_show_qr").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDocumentSettingsSchema = createInsertSchema(documentSettings).omit({ id: true, updatedAt: true });
export type InsertDocumentSettings = z.infer<typeof insertDocumentSettingsSchema>;
export type DocumentSettings = typeof documentSettings.$inferSelect;

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  nameZh: text("name_zh"),
  type: text("type").notNull().default("customer"),
  taxId: text("tax_id"),
  branch: text("branch").default("สำนักงานใหญ่"),
  address: text("address"),
  addressEn: text("address_en"),
  addressZh: text("address_zh"),
  phone: text("phone"),
  email: text("email"),
  contactPerson: text("contact_person"),
  creditDays: integer("credit_days").default(30),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  postcode: text("postcode"),
  buildingNumber: text("building_number"),
  districtCode: text("district_code"),
  subdistrictCode: text("subdistrict_code"),
  provinceCode: text("province_code"),
  rdCode: text("rd_code"),
  dbdCode: text("dbd_code"),
  ssoCode: text("sso_code"),
  portalPassword: text("portal_password"),
  serviceFee: decimal("service_fee", { precision: 12, scale: 2 }),
});

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const contactsArchive = pgTable("contacts_archive", {
  id: integer("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  nameZh: text("name_zh"),
  type: text("type").notNull().default("customer"),
  taxId: text("tax_id"),
  branch: text("branch").default("สำนักงานใหญ่"),
  address: text("address"),
  addressEn: text("address_en"),
  addressZh: text("address_zh"),
  phone: text("phone"),
  email: text("email"),
  contactPerson: text("contact_person"),
  creditDays: integer("credit_days").default(30),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  postcode: text("postcode"),
  buildingNumber: text("building_number"),
  districtCode: text("district_code"),
  subdistrictCode: text("subdistrict_code"),
  provinceCode: text("province_code"),
  rdCode: text("rd_code"),
  dbdCode: text("dbd_code"),
  ssoCode: text("sso_code"),
  portalPassword: text("portal_password"),
  serviceFee: decimal("service_fee", { precision: 12, scale: 2 }),
  archivedAt: timestamp("archived_at").defaultNow(),
  archiveReason: text("archive_reason"),
  originCompanyName: text("origin_company_name"),
  originImportBatchId: integer("origin_import_batch_id"),
  referenceSnapshot: jsonb("reference_snapshot").default({}),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  nameZh: text("name_zh"),
  description: text("description"),
  category: text("category").notNull().default("product"),
  productType: text("product_type").notNull().default("simple"),
  unit: text("unit").notNull().default("ชิ้น"),
  price: decimal("price", { precision: 15, scale: 2 }).notNull().default("0"),
  cost: decimal("cost", { precision: 15, scale: 2 }).default("0"),
  priceRetail: decimal("price_retail", { precision: 15, scale: 2 }).default("0"),
  priceWholesale: decimal("price_wholesale", { precision: 15, scale: 2 }).default("0"),
  priceAgent: decimal("price_agent", { precision: 15, scale: 2 }).default("0"),
  priceSpecial: decimal("price_special", { precision: 15, scale: 2 }).default("0"),
  priceVip: decimal("price_vip", { precision: 15, scale: 2 }).default("0"),
  vatType: text("vat_type").notNull().default("vat7"),
  vatIncluded: boolean("vat_included").notNull().default(false),
  accountCode: text("account_code"),
  barcode: text("barcode"),
  imageUrl: text("image_url"),
  lowStockThreshold: integer("low_stock_threshold").default(0),
  trackLots: boolean("track_lots").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const bomHeaders = pgTable("bom_headers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  yieldQty: decimal("yield_qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").notNull().default("ชิ้น"),
  notes: text("notes"),
  revisionNo: text("revision_no").default("00"),
  effectiveDate: date("effective_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBomHeaderSchema = createInsertSchema(bomHeaders).omit({ id: true, createdAt: true });
export type InsertBomHeader = z.infer<typeof insertBomHeaderSchema>;
export type BomHeader = typeof bomHeaders.$inferSelect;

export const bomLines = pgTable("bom_lines", {
  id: serial("id").primaryKey(),
  bomId: integer("bom_id").references(() => bomHeaders.id, { onDelete: "cascade" }).notNull(),
  componentProductId: integer("component_product_id").references(() => products.id).notNull(),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").notNull().default("ชิ้น"),
  scrapPct: decimal("scrap_pct", { precision: 5, scale: 2 }).default("0"),
  costOverride: decimal("cost_override", { precision: 15, scale: 2 }),
  requireSerialScan: boolean("require_serial_scan").notNull().default(false),
  serialPrefix: text("serial_prefix"),
  notes: text("notes"),
});

export const insertBomLineSchema = createInsertSchema(bomLines).omit({ id: true });
export type InsertBomLine = z.infer<typeof insertBomLineSchema>;
export type BomLine = typeof bomLines.$inferSelect;

export const manufacturingOrders = pgTable("manufacturing_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  orderNo: text("order_no").notNull(),
  bomId: integer("bom_id").references(() => bomHeaders.id),
  productId: integer("product_id").references(() => products.id).notNull(),
  plannedQty: decimal("planned_qty", { precision: 15, scale: 4 }).notNull().default("1"),
  completedQty: decimal("completed_qty", { precision: 15, scale: 4 }).notNull().default("0"),
  unit: text("unit").notNull().default("ชิ้น"),
  status: text("status").notNull().default("draft"),
  lotNumber: text("lot_number"),
  manufacturingDate: date("manufacturing_date"),
  expiryDate: date("expiry_date"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
});

export const insertManufacturingOrderSchema = createInsertSchema(manufacturingOrders).omit({ id: true, createdAt: true });
export type InsertManufacturingOrder = z.infer<typeof insertManufacturingOrderSchema>;
export type ManufacturingOrder = typeof manufacturingOrders.$inferSelect;

export const manufacturingOrderLines = pgTable("manufacturing_order_lines", {
  id: serial("id").primaryKey(),
  moId: integer("mo_id").references(() => manufacturingOrders.id, { onDelete: "cascade" }).notNull(),
  componentProductId: integer("component_product_id").references(() => products.id).notNull(),
  requiredQty: decimal("required_qty", { precision: 15, scale: 4 }).notNull().default("0"),
  consumedQty: decimal("consumed_qty", { precision: 15, scale: 4 }).notNull().default("0"),
  lotId: integer("lot_id"),
  unit: text("unit").notNull().default("ชิ้น"),
  notes: text("notes"),
});

export const insertManufacturingOrderLineSchema = createInsertSchema(manufacturingOrderLines).omit({ id: true });
export type InsertManufacturingOrderLine = z.infer<typeof insertManufacturingOrderLineSchema>;
export type ManufacturingOrderLine = typeof manufacturingOrderLines.$inferSelect;

export const productBundles = pgTable("product_bundles", {
  id: serial("id").primaryKey(),
  bundleProductId: integer("bundle_product_id").references(() => products.id, { onDelete: "cascade" }).notNull(),
  componentProductId: integer("component_product_id").references(() => products.id).notNull(),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  slotGroup: text("slot_group"),
  isDefault: boolean("is_default").notNull().default(true),
});

export const insertProductBundleSchema = createInsertSchema(productBundles).omit({ id: true });
export type InsertProductBundle = z.infer<typeof insertProductBundleSchema>;
export type ProductBundle = typeof productBundles.$inferSelect;

export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  promoType: text("promo_type").notNull().default("buy_x_get_y"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPromotionSchema = createInsertSchema(promotions).omit({ id: true, createdAt: true });
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type Promotion = typeof promotions.$inferSelect;

export const promotionRules = pgTable("promotion_rules", {
  id: serial("id").primaryKey(),
  promotionId: integer("promotion_id").references(() => promotions.id, { onDelete: "cascade" }).notNull(),
  buyProductId: integer("buy_product_id").references(() => products.id),
  buyQty: decimal("buy_qty", { precision: 15, scale: 4 }).notNull().default("1"),
  getProductId: integer("get_product_id").references(() => products.id),
  getQty: decimal("get_qty", { precision: 15, scale: 4 }).default("0"),
  discountPct: decimal("discount_pct", { precision: 5, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
});

export const insertPromotionRuleSchema = createInsertSchema(promotionRules).omit({ id: true });
export type InsertPromotionRule = z.infer<typeof insertPromotionRuleSchema>;
export type PromotionRule = typeof promotionRules.$inferSelect;

export const productMappings = pgTable("product_mappings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  sellProductId: integer("sell_product_id").references(() => products.id).notNull(),
  buyProductId: integer("buy_product_id").references(() => products.id).notNull(),
  conversionRate: decimal("conversion_rate", { precision: 15, scale: 4 }).notNull().default("1"),
  sellUnit: text("sell_unit").notNull().default("ชิ้น"),
  buyUnit: text("buy_unit").notNull().default("ชิ้น"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductMappingSchema = createInsertSchema(productMappings).omit({ id: true, createdAt: true });
export type InsertProductMapping = z.infer<typeof insertProductMappingSchema>;
export type ProductMapping = typeof productMappings.$inferSelect;

export const productStock = pgTable("product_stock", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull().default("0"),
  reservedQty: decimal("reserved_qty", { precision: 15, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertProductStockSchema = createInsertSchema(productStock).omit({ id: true, updatedAt: true });
export type InsertProductStock = z.infer<typeof insertProductStockSchema>;
export type ProductStock = typeof productStock.$inferSelect;

export const productLots = pgTable("product_lots", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  lotNumber: text("lot_number").notNull(),
  manufacturingDate: date("manufacturing_date"),
  expiryDate: date("expiry_date"),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull().default("0"),
  reservedQty: decimal("reserved_qty", { precision: 15, scale: 4 }).notNull().default("0"),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  grId: integer("gr_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductLotSchema = createInsertSchema(productLots).omit({ id: true, createdAt: true });
export type InsertProductLot = z.infer<typeof insertProductLotSchema>;
export type ProductLot = typeof productLots.$inferSelect;

export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  lotId: integer("lot_id"),
  movementType: text("movement_type").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }).default("0"),
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }).default("0"),
  referenceType: text("reference_type"),
  referenceId: integer("reference_id"),
  referenceNo: text("reference_no"),
  notes: text("notes"),
  createdBy: integer("created_by"),
  warehouseId: integer("warehouse_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertStockMovementSchema = createInsertSchema(stockMovements).omit({ id: true, createdAt: true });
export type InsertStockMovement = z.infer<typeof insertStockMovementSchema>;
export type StockMovement = typeof stockMovements.$inferSelect;

export const contactSettings = pgTable("contact_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  autoCode: boolean("auto_code").notNull().default(true),
  codePrefix: text("code_prefix").notNull().default("C"),
  codeDigits: integer("code_digits").notNull().default(4),
  defaultType: text("default_type").notNull().default("customer"),
  defaultCreditDays: integer("default_credit_days").notNull().default(30),
});

export const insertContactSettingsSchema = createInsertSchema(contactSettings).omit({ id: true });
export type InsertContactSettings = z.infer<typeof insertContactSettingsSchema>;
export type ContactSettings = typeof contactSettings.$inferSelect;

export const generalSettings = pgTable("general_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull().unique(),
  dateFormat: text("date_format").notNull().default("DD/MM/YYYY"),
  calendarType: text("calendar_type").notNull().default("buddhist"),
  language: text("language").notNull().default("th"),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  notifyOnDocApproval: boolean("notify_on_doc_approval").notNull().default(true),
  notifyOnOverdue: boolean("notify_on_overdue").notNull().default(true),
  autoLogoutMinutes: text("auto_logout_minutes").notNull().default("60"),
  defaultPageSize: text("default_page_size").notNull().default("50"),
  showDecimalPlaces: text("show_decimal_places").notNull().default("2"),
  hiddenEmployeeModules: text("hidden_employee_modules"),
  authorizedSignerName: text("authorized_signer_name"),
  authorizedSignerTitle: text("authorized_signer_title"),
  authorizedSignerSignatureUrl: text("authorized_signer_signature_url"),
});

export const insertGeneralSettingsSchema = createInsertSchema(generalSettings).omit({ id: true });
export type InsertGeneralSettings = z.infer<typeof insertGeneralSettingsSchema>;
export type GeneralSettings = typeof generalSettings.$inferSelect;

// ============ eCommerce Hub ============

export const ecommerceConnections = pgTable("ecommerce_connections", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  platform: text("platform").notNull(), // shopee, lazada, tiktok, grab_food, line_man, robinhood, amazon
  shopName: text("shop_name").notNull(),
  shopId: text("shop_id"),
  docPrefix: text("doc_prefix"), // e.g. SH01, LZ01, TK01 — used in tax invoice numbering
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  status: text("status").notNull().default("pending"), // pending, connected, disconnected, error
  lastSyncAt: timestamp("last_sync_at"),
  settings: text("settings"), // JSON config
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEcommerceConnectionSchema = createInsertSchema(ecommerceConnections).omit({ id: true, createdAt: true });
export type InsertEcommerceConnection = z.infer<typeof insertEcommerceConnectionSchema>;
export type EcommerceConnection = typeof ecommerceConnections.$inferSelect;

export const ecommerceOrders = pgTable("ecommerce_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id).notNull(),
  platform: text("platform").notNull(),
  platformOrderId: text("platform_order_id").notNull(),
  orderNo: text("order_no"),
  status: text("status").notNull().default("pending"), // pending, confirmed, shipping, delivered, cancelled, returned
  buyerName: text("buyer_name"),
  buyerPhone: text("buyer_phone"),
  buyerAddress: text("buyer_address"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  shippingFee: decimal("shipping_fee", { precision: 15, scale: 2 }).default("0"),
  platformDiscount: decimal("platform_discount", { precision: 15, scale: 2 }).default("0"),
  sellerDiscount: decimal("seller_discount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  commissionFee: decimal("commission_fee", { precision: 15, scale: 2 }).default("0"),
  serviceFee: decimal("service_fee", { precision: 15, scale: 2 }).default("0"),
  paymentFee: decimal("payment_fee", { precision: 15, scale: 2 }).default("0"),
  shippingCost: decimal("shipping_cost", { precision: 15, scale: 2 }).default("0"),
  netIncome: decimal("net_income", { precision: 15, scale: 2 }).default("0"),
  trackingNo: text("tracking_no"),
  shippingProvider: text("shipping_provider"),
  paymentMethod: text("payment_method"),
  currency: text("currency").notNull().default("THB"),
  placedAt: timestamp("placed_at"),
  shippedAt: timestamp("shipped_at"),
  deliveredAt: timestamp("delivered_at"),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  taxInvoiceId: integer("tax_invoice_id"),
  notes: text("notes"),
  rawData: text("raw_data"), // JSON raw platform data
  settlementStatus: text("settlement_status").notNull().default("pending"), // pending, settled, discrepancy
  settlementDate: timestamp("settlement_date"),
  settlementAmount: decimal("settlement_amount", { precision: 15, scale: 2 }),
  actualShippingCost: decimal("actual_shipping_cost", { precision: 15, scale: 2 }),
  settlementNotes: text("settlement_notes"),
  packageWeight: decimal("package_weight", { precision: 10, scale: 2 }),
  packageLength: decimal("package_length", { precision: 10, scale: 2 }),
  packageWidth: decimal("package_width", { precision: 10, scale: 2 }),
  packageHeight: decimal("package_height", { precision: 10, scale: 2 }),
  labelStatus: text("label_status").notNull().default("not_printed"),
  labelPrintCount: integer("label_print_count").notNull().default(0),
  labelPrintedAt: timestamp("label_printed_at"),
  estimatedDeliveryDate: timestamp("estimated_delivery_date"),
  shipByDate: timestamp("ship_by_date"),
  isCod: boolean("is_cod").notNull().default(false),
  codAmount: decimal("cod_amount", { precision: 15, scale: 2 }).default("0"),
  platformShippingProvider: text("platform_shipping_provider"),
  warehouseCode: text("warehouse_code"),
  liveSessionId: integer("live_session_id"),
  orderSource: text("order_source").default("manual"),
  importBatchId: integer("import_batch_id"),
  netSellingPrice: decimal("net_selling_price", { precision: 15, scale: 2 }).default("0"),
  buyerPaidPrice: decimal("buyer_paid_price", { precision: 15, scale: 2 }).default("0"),
  platformShippingSubsidy: decimal("platform_shipping_subsidy", { precision: 15, scale: 2 }).default("0"),
  transactionFee: decimal("transaction_fee", { precision: 15, scale: 2 }).default("0"),
  completedAt: timestamp("completed_at"),
  creditNoteId: integer("credit_note_id"),
  returnReason: text("return_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEcommerceOrderSchema = createInsertSchema(ecommerceOrders).omit({ id: true, createdAt: true });
export type InsertEcommerceOrder = z.infer<typeof insertEcommerceOrderSchema>;
export type EcommerceOrder = typeof ecommerceOrders.$inferSelect;

export const ecommerceOrderItems = pgTable("ecommerce_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ecommerceOrders.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  platformSku: text("platform_sku"),
  platformItemId: text("platform_item_id"),
  name: text("name").notNull(),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  price: decimal("price", { precision: 15, scale: 2 }).notNull().default("0"),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  vatType: text("vat_type").default("vat7"),
});

export const insertEcommerceOrderItemSchema = createInsertSchema(ecommerceOrderItems).omit({ id: true });
export type InsertEcommerceOrderItem = z.infer<typeof insertEcommerceOrderItemSchema>;
export type EcommerceOrderItem = typeof ecommerceOrderItems.$inferSelect;

export const ecommerceProductMappings = pgTable("ecommerce_product_mappings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id).notNull(),
  platformSku: text("platform_sku").notNull(),
  platformProductId: text("platform_product_id"),
  platformProductName: text("platform_product_name"),
  conversionRate: decimal("conversion_rate", { precision: 10, scale: 4 }).default("1"),
  syncStock: boolean("sync_stock").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
  syncStatus: text("sync_status").default("pending"), // pending, synced, error
  errorMsg: text("error_msg"),
});

export const insertEcommerceProductMappingSchema = createInsertSchema(ecommerceProductMappings).omit({ id: true });
export type InsertEcommerceProductMapping = z.infer<typeof insertEcommerceProductMappingSchema>;
export type EcommerceProductMapping = typeof ecommerceProductMappings.$inferSelect;

// ============ E-Commerce Settlements ============

export const ecommerceSettlements = pgTable("ecommerce_settlements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id),
  platform: text("platform").notNull(),
  settlementNo: text("settlement_no"),
  periodFrom: date("period_from"),
  periodTo: date("period_to"),
  settlementDate: date("settlement_date").notNull(),
  totalSales: decimal("total_sales", { precision: 15, scale: 2 }).default("0"),
  totalShippingFee: decimal("total_shipping_fee", { precision: 15, scale: 2 }).default("0"),
  totalSellerDiscount: decimal("total_seller_discount", { precision: 15, scale: 2 }).default("0"),
  totalCommission: decimal("total_commission", { precision: 15, scale: 2 }).default("0"),
  totalServiceFee: decimal("total_service_fee", { precision: 15, scale: 2 }).default("0"),
  totalPaymentFee: decimal("total_payment_fee", { precision: 15, scale: 2 }).default("0"),
  totalShippingCost: decimal("total_shipping_cost", { precision: 15, scale: 2 }).default("0"),
  totalOtherFees: decimal("total_other_fees", { precision: 15, scale: 2 }).default("0"),
  totalAdjustments: decimal("total_adjustments", { precision: 15, scale: 2 }).default("0"),
  totalPlatformShippingSubsidy: decimal("total_platform_shipping_subsidy", { precision: 15, scale: 2 }).default("0"),
  netAmount: decimal("net_amount", { precision: 15, scale: 2 }).default("0"),
  walletStatus: text("wallet_status").notNull().default("in_wallet"),
  withdrawnDate: date("withdrawn_date"),
  withdrawnBankAccountId: integer("withdrawn_bank_account_id"),
  settleJournalId: integer("settle_journal_id").references(() => journalEntries.id),
  withdrawJournalId: integer("withdraw_journal_id").references(() => journalEntries.id),
  reversalJournalId: integer("reversal_journal_id").references(() => journalEntries.id),
  invoiceStatus: text("invoice_status").notNull().default("pending"),
  taxInvoiceNo: text("tax_invoice_no"),
  taxInvoiceDate: date("tax_invoice_date"),
  taxInvoiceAmount: decimal("tax_invoice_amount", { precision: 15, scale: 2 }),
  taxInvoiceVat: decimal("tax_invoice_vat", { precision: 15, scale: 2 }),
  varianceAmount: decimal("variance_amount", { precision: 15, scale: 2 }),
  orderCount: integer("order_count").default(0),
  notes: text("notes"),
  importSource: text("import_source").default("manual"),
  rawData: text("raw_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEcommerceSettlementSchema = createInsertSchema(ecommerceSettlements).omit({ id: true, createdAt: true });
export type InsertEcommerceSettlement = z.infer<typeof insertEcommerceSettlementSchema>;
export type EcommerceSettlement = typeof ecommerceSettlements.$inferSelect;

export const ecommerceSettlementItems = pgTable("ecommerce_settlement_items", {
  id: serial("id").primaryKey(),
  settlementId: integer("settlement_id").references(() => ecommerceSettlements.id, { onDelete: "cascade" }).notNull(),
  orderId: integer("order_id").references(() => ecommerceOrders.id),
  platformOrderId: text("platform_order_id"),
  orderNo: text("order_no"),
  productAmount: decimal("product_amount", { precision: 15, scale: 2 }).default("0"),
  shippingFee: decimal("shipping_fee", { precision: 15, scale: 2 }).default("0"),
  sellerDiscount: decimal("seller_discount", { precision: 15, scale: 2 }).default("0"),
  platformDiscount: decimal("platform_discount", { precision: 15, scale: 2 }).default("0"),
  commissionFee: decimal("commission_fee", { precision: 15, scale: 2 }).default("0"),
  serviceFee: decimal("service_fee", { precision: 15, scale: 2 }).default("0"),
  paymentFee: decimal("payment_fee", { precision: 15, scale: 2 }).default("0"),
  shippingCost: decimal("shipping_cost", { precision: 15, scale: 2 }).default("0"),
  otherFees: decimal("other_fees", { precision: 15, scale: 2 }).default("0"),
  adjustments: decimal("adjustments", { precision: 15, scale: 2 }).default("0"),
  platformShippingSubsidy: decimal("platform_shipping_subsidy", { precision: 15, scale: 2 }).default("0"),
  buyerRefund: decimal("buyer_refund", { precision: 15, scale: 2 }).default("0"),
  sellerShippingPromo: decimal("seller_shipping_promo", { precision: 15, scale: 2 }).default("0"),
  returnShipping: decimal("return_shipping", { precision: 15, scale: 2 }).default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  adsDeduction: decimal("ads_deduction", { precision: 15, scale: 2 }).default("0"),
  netAmount: decimal("net_amount", { precision: 15, scale: 2 }).default("0"),
  itemType: text("item_type").default("order"),
});

export const insertEcommerceSettlementItemSchema = createInsertSchema(ecommerceSettlementItems).omit({ id: true });
export type InsertEcommerceSettlementItem = z.infer<typeof insertEcommerceSettlementItemSchema>;
export type EcommerceSettlementItem = typeof ecommerceSettlementItems.$inferSelect;

// ============ Live Selling ============

export const liveSessions = pgTable("live_sessions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  title: text("title").notNull(),
  platform: text("platform").notNull().default("facebook"),
  status: text("status").notNull().default("draft"),
  hostUserId: integer("host_user_id").references(() => users.id),
  hostName: text("host_name"),
  streamUrl: text("stream_url"),
  pageId: text("page_id"),
  pageName: text("page_name"),
  scheduledAt: timestamp("scheduled_at"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  goalRevenue: decimal("goal_revenue", { precision: 15, scale: 2 }),
  goalViewers: integer("goal_viewers"),
  agencyClientId: integer("agency_client_id"),
  adBudget: decimal("ad_budget", { precision: 12, scale: 2 }).default("0"),
  totalOrders: integer("total_orders").default(0),
  paidOrders: integer("paid_orders").default(0),
  totalRevenue: decimal("total_revenue", { precision: 15, scale: 2 }).default("0"),
  cfRevenue: decimal("cf_revenue", { precision: 15, scale: 2 }).default("0"),
  totalItemsSold: integer("total_items_sold").default(0),
  totalComments: integer("total_comments").default(0),
  pulledOrders: integer("pulled_orders").default(0),
  skuCount: integer("sku_count").default(0),
  peakViewers: integer("peak_viewers").default(0),
  avgViewers: integer("avg_viewers").default(0),
  totalAdSpend: decimal("total_ad_spend", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  preNotifySent: boolean("pre_notify_sent").default(false),
  postReportSent: boolean("post_report_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLiveSessionSchema = createInsertSchema(liveSessions).omit({ id: true, createdAt: true });
export type InsertLiveSession = z.infer<typeof insertLiveSessionSchema>;
export type LiveSession = typeof liveSessions.$inferSelect;

export const liveSessionProducts = pgTable("live_session_products", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveSessions.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  sku: text("sku"),
  barcode: text("barcode"),
  name: text("name"),
  category: text("category"),
  brand: text("brand"),
  imageUrl: text("image_url"),
  livePrice: decimal("live_price", { precision: 15, scale: 2 }).notNull(),
  originalPrice: decimal("original_price", { precision: 15, scale: 2 }),
  availableQty: decimal("available_qty", { precision: 15, scale: 4 }).notNull(),
  soldQty: decimal("sold_qty", { precision: 15, scale: 4 }).default("0"),
  cfCode: text("cf_code"),
  sortOrder: integer("sort_order").default(0),
  status: text("status").notNull().default("active"),
});

export const insertLiveSessionProductSchema = createInsertSchema(liveSessionProducts).omit({ id: true });
export type InsertLiveSessionProduct = z.infer<typeof insertLiveSessionProductSchema>;
export type LiveSessionProduct = typeof liveSessionProducts.$inferSelect;

export const liveCfOrders = pgTable("live_cf_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  sessionId: integer("session_id").references(() => liveSessions.id).notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  customerSocial: text("customer_social"), // FB name, IG handle, etc.
  status: text("status").notNull().default("cf"), // cf, awaiting_payment, paid, preparing, shipped, delivered, cancelled
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  shippingFee: decimal("shipping_fee", { precision: 15, scale: 2 }).default("0"),
  trackingNo: text("tracking_no"),
  shippingProvider: text("shipping_provider"),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  taxInvoiceId: integer("tax_invoice_id").references(() => taxInvoices.id),
  ecommerceOrderId: integer("ecommerce_order_id").references(() => ecommerceOrders.id),
  notes: text("notes"),
  paymentDeadline: timestamp("payment_deadline"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLiveCfOrderSchema = createInsertSchema(liveCfOrders).omit({ id: true, createdAt: true });
export type InsertLiveCfOrder = z.infer<typeof insertLiveCfOrderSchema>;
export type LiveCfOrder = typeof liveCfOrders.$inferSelect;

export const liveCfItems = pgTable("live_cf_items", {
  id: serial("id").primaryKey(),
  cfOrderId: integer("cf_order_id").references(() => liveCfOrders.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
});

export const insertLiveCfItemSchema = createInsertSchema(liveCfItems).omit({ id: true });
export type InsertLiveCfItem = z.infer<typeof insertLiveCfItemSchema>;
export type LiveCfItem = typeof liveCfItems.$inferSelect;

export const livePayments = pgTable("live_payments", {
  id: serial("id").primaryKey(),
  cfOrderId: integer("cf_order_id").references(() => liveCfOrders.id, { onDelete: "cascade" }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  method: text("method").notNull().default("bank_transfer"), // bank_transfer, promptpay, cod
  slipUrl: text("slip_url"),
  bankName: text("bank_name"),
  transferDate: timestamp("transfer_date"),
  transferTime: text("transfer_time"),
  verificationStatus: text("verification_status").notNull().default("pending"), // pending, verified, rejected, needs_review
  verifiedBy: integer("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  rejectReason: text("reject_reason"),
  aiVerifyAmount: decimal("ai_verify_amount", { precision: 15, scale: 2 }),
  aiVerifyBank: text("ai_verify_bank"),
  aiVerifyRef: text("ai_verify_ref"),
  aiVerifyDate: text("ai_verify_date"),
  aiVerifyNote: text("ai_verify_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLivePaymentSchema = createInsertSchema(livePayments).omit({ id: true, createdAt: true });
export type InsertLivePayment = z.infer<typeof insertLivePaymentSchema>;
export type LivePayment = typeof livePayments.$inferSelect;

export const salesOrders = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  orderNo: text("order_no").notNull(),
  orderDate: date("order_date").notNull(),
  customerId: integer("customer_id").references(() => contacts.id),
  customerCode: text("customer_code"),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerTaxId: text("customer_tax_id"),
  customerTaxIdType: text("customer_tax_id_type").notNull().default("TXID"),
  customerCountryCode: text("customer_country_code").notNull().default("TH"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  creditDays: integer("credit_days"),
  channel: text("channel").notNull().default("direct"),
  channelOrderNo: text("channel_order_no"),
  shippingProvider: text("shipping_provider"),
  shippingDate: date("shipping_date"),
  trackingNo: text("tracking_no"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  shippingFee: decimal("shipping_fee", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paymentMethod: text("payment_method"),
  paymentTerms: text("payment_terms"),
  taxInvoiceNo: text("tax_invoice_no"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  attachedUrl: text("attached_url"),
  salesperson: text("salesperson"),
  department: text("department"),
  project: text("project"),
  refDoc: text("ref_doc"),
  docPrefix: text("doc_prefix").default("SO"),
  priceMode: text("price_mode").default("excluded"),
  linkJournal: boolean("link_journal").default(false),
  tags: text("tags").array(),
  ecommerceOrderId: integer("ecommerce_order_id"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  shareToken: text("share_token"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSalesOrderSchema = createInsertSchema(salesOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSalesOrder = z.infer<typeof insertSalesOrderSchema>;
export type SalesOrder = typeof salesOrders.$inferSelect;

export const salesOrderItems = pgTable("sales_order_items", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  sku: text("sku"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
});

export const insertSalesOrderItemSchema = createInsertSchema(salesOrderItems).omit({ id: true });
export type InsertSalesOrderItem = z.infer<typeof insertSalesOrderItemSchema>;
export type SalesOrderItem = typeof salesOrderItems.$inferSelect;

export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  quotationNo: text("quotation_no").notNull(),
  quotationDate: date("quotation_date").notNull(),
  validUntil: date("valid_until"),
  customerId: integer("customer_id").references(() => contacts.id),
  customerCode: text("customer_code"),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerTaxId: text("customer_tax_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  priceMode: text("price_mode").default("excluded"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  paymentTerms: text("payment_terms"),
  attachedUrl: text("attached_url"),
  salesperson: text("salesperson"),
  department: text("department"),
  project: text("project"),
  docPrefix: text("doc_prefix").default("QO"),
  docNumberMode: text("doc_number_mode").default("AUTO"),
  linkJournal: boolean("link_journal").default(false),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  salesOrderId: integer("sales_order_id"),
  shareToken: text("share_token"),
  customerResponse: text("customer_response"),
  customerResponseNote: text("customer_response_note"),
  customerRespondedAt: timestamp("customer_responded_at"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  creditDays: integer("credit_days"),
  refDoc: text("ref_doc"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertQuotationSchema = createInsertSchema(quotations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuotation = z.infer<typeof insertQuotationSchema>;
export type Quotation = typeof quotations.$inferSelect;

export const quotationItems = pgTable("quotation_items", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").references(() => quotations.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
});

export const insertQuotationItemSchema = createInsertSchema(quotationItems).omit({ id: true });
export type InsertQuotationItem = z.infer<typeof insertQuotationItemSchema>;
export type QuotationItem = typeof quotationItems.$inferSelect;

export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  invoiceNo: text("invoice_no").notNull(),
  invoiceDate: date("invoice_date").notNull(),
  dueDate: date("due_date"),
  customerId: integer("customer_id").references(() => contacts.id),
  customerCode: text("customer_code"),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerTaxId: text("customer_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  creditDays: integer("credit_days"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"),
  paymentStatus: text("payment_status").default("unpaid"),
  priceMode: text("price_mode").default("excluded"),
  paymentTerms: text("payment_terms"),
  attachedUrl: text("attached_url"),
  salesperson: text("salesperson"),
  department: text("department"),
  project: text("project"),
  docPrefix: text("doc_prefix").default("IV"),
  refDoc: text("ref_doc"),
  quotationId: integer("quotation_id"),
  salesOrderId: integer("sales_order_id"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  shareToken: text("share_token"),
  lineSentAt: timestamp("line_sent_at"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;

export const invoiceItems = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true });
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;

export const taxInvoices = pgTable("tax_invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  taxInvoiceNo: text("tax_invoice_no").notNull(),
  taxInvoiceDate: date("tax_invoice_date").notNull(),
  dueDate: date("due_date"),
  customerId: integer("customer_id").references(() => contacts.id),
  customerCode: text("customer_code"),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerTaxId: text("customer_tax_id"),
  customerBranchId: text("customer_branch_id"),
  customerTaxIdType: text("customer_tax_id_type").notNull().default("TXID"),
  customerCountryCode: text("customer_country_code").notNull().default("TH"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  creditDays: integer("credit_days"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"),
  paymentStatus: text("payment_status").default("unpaid"),
  priceMode: text("price_mode").default("excluded"),
  paymentTerms: text("payment_terms"),
  attachedUrl: text("attached_url"),
  salesperson: text("salesperson"),
  department: text("department"),
  project: text("project"),
  docPrefix: text("doc_prefix").default("TIV"),
  refDoc: text("ref_doc"),
  quotationId: integer("quotation_id"),
  invoiceId: integer("invoice_id"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  shareToken: text("share_token"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  paymentMethod: text("payment_method").default("เครดิต"),
  originalTaxInvoiceNo: text("original_tax_invoice_no"),
  isDebitNote: boolean("is_debit_note").default(false),
  isCreditNote: boolean("is_credit_note").default(false),
  isSummaryInvoice: boolean("is_summary_invoice").default(false),
  summaryTaxInvoiceId: integer("summary_tax_invoice_id"),
  posSessionId: integer("pos_session_id"),
  etaxSentAt: timestamp("etax_sent_at"),
  etaxSentTo: text("etax_sent_to"),
  etaxSentCc: text("etax_sent_cc"),
  etaxMessageId: text("etax_message_id"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTaxInvoiceSchema = createInsertSchema(taxInvoices).omit({ id: true, createdAt: true, updatedAt: true, etaxSentAt: true, etaxSentTo: true, etaxSentCc: true, etaxMessageId: true });
export type InsertTaxInvoice = z.infer<typeof insertTaxInvoiceSchema>;
export type TaxInvoice = typeof taxInvoices.$inferSelect;

export const taxInvoiceItems = pgTable("tax_invoice_items", {
  id: serial("id").primaryKey(),
  taxInvoiceId: integer("tax_invoice_id").references(() => taxInvoices.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
});

export const insertTaxInvoiceItemSchema = createInsertSchema(taxInvoiceItems).omit({ id: true });
export type InsertTaxInvoiceItem = z.infer<typeof insertTaxInvoiceItemSchema>;
export type TaxInvoiceItem = typeof taxInvoiceItems.$inferSelect;

export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  receiptNo: text("receipt_no").notNull(),
  receiptDate: date("receipt_date").notNull(),
  customerId: integer("customer_id").references(() => contacts.id),
  customerCode: text("customer_code"),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerTaxId: text("customer_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  creditDays: integer("credit_days"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"),
  priceMode: text("price_mode").default("excluded"),
  paymentMethod: text("payment_method"),
  paymentDate: date("payment_date"),
  paymentTerms: text("payment_terms"),
  attachedUrl: text("attached_url"),
  salesperson: text("salesperson"),
  department: text("department"),
  project: text("project"),
  docPrefix: text("doc_prefix").default("RC"),
  refDoc: text("ref_doc"),
  invoiceId: integer("invoice_id"),
  taxInvoiceId: integer("tax_invoice_id"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  shareToken: text("share_token"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertReceiptSchema = createInsertSchema(receipts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receipts.$inferSelect;

export const receiptItems = pgTable("receipt_items", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").references(() => receipts.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
});

export const insertReceiptItemSchema = createInsertSchema(receiptItems).omit({ id: true });
export type InsertReceiptItem = z.infer<typeof insertReceiptItemSchema>;
export type ReceiptItem = typeof receiptItems.$inferSelect;

export const receiptLinkedDocs = pgTable("receipt_linked_docs", {
  id: serial("id").primaryKey(),
  receiptId: integer("receipt_id").references(() => receipts.id, { onDelete: "cascade" }).notNull(),
  docType: text("doc_type").notNull(),
  docId: integer("doc_id").notNull(),
  docNo: text("doc_no"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
});

export const billingNotes = pgTable("billing_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  billingNo: text("billing_no").notNull(),
  billingDate: date("billing_date").notNull(),
  dueDate: date("due_date"),
  customerId: integer("customer_id").references(() => contacts.id),
  customerCode: text("customer_code"),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerTaxId: text("customer_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  paymentStatus: text("payment_status").default("unpaid"),
  notes: text("notes"),
  docPrefix: text("doc_prefix").default("BN"),
  receiptId: integer("receipt_id"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBillingNoteSchema = createInsertSchema(billingNotes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBillingNote = z.infer<typeof insertBillingNoteSchema>;
export type BillingNote = typeof billingNotes.$inferSelect;

export const billingNoteLinkedDocs = pgTable("billing_note_linked_docs", {
  id: serial("id").primaryKey(),
  billingNoteId: integer("billing_note_id").references(() => billingNotes.id, { onDelete: "cascade" }).notNull(),
  docType: text("doc_type").notNull(),
  docId: integer("doc_id").notNull(),
  docNo: text("doc_no"),
  docDate: text("doc_date"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
});

export const paymentVouchers = pgTable("payment_vouchers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  pvNo: text("pv_no").notNull(),
  pvDate: date("pv_date").notNull(),
  vendorId: integer("vendor_id").references(() => contacts.id),
  vendorCode: text("vendor_code"),
  vendorName: text("vendor_name").notNull(),
  vendorAddress: text("vendor_address"),
  vendorTaxId: text("vendor_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  paymentMethod: text("payment_method"),
  paymentDate: date("payment_date"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  docPrefix: text("doc_prefix").default("PV"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const paymentVoucherLinkedDocs = pgTable("payment_voucher_linked_docs", {
  id: serial("id").primaryKey(),
  paymentVoucherId: integer("payment_voucher_id").references(() => paymentVouchers.id, { onDelete: "cascade" }).notNull(),
  docType: text("doc_type").notNull(),
  docId: integer("doc_id").notNull(),
  docNo: text("doc_no"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
});

export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  senderId: integer("sender_id").references(() => users.id).notNull(),
  senderName: text("sender_name").notNull(),
  senderRole: text("sender_role").notNull().default("user"),
  body: text("body").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export const paymentMethods = pgTable("payment_methods", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  nameTh: text("name_th"),
  accountCode: text("account_code").notNull(),
  accountId: integer("account_id").references(() => accounts.id),
  active: boolean("active").notNull().default(true),
  isDefault: boolean("is_default").default(false),
  sortOrder: integer("sort_order").default(0),
});

export const insertPaymentMethodSchema = createInsertSchema(paymentMethods).omit({ id: true });
export type InsertPaymentMethod = z.infer<typeof insertPaymentMethodSchema>;
export type PaymentMethod = typeof paymentMethods.$inferSelect;

export const lineRecipients = pgTable("line_recipients", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  companyId: integer("company_id"),
  lineId: text("line_id").notNull(),
  type: text("type").notNull().default("user"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLineRecipientSchema = createInsertSchema(lineRecipients).omit({ id: true, createdAt: true });
export type InsertLineRecipient = z.infer<typeof insertLineRecipientSchema>;
export type LineRecipient = typeof lineRecipients.$inferSelect;

export const documentDeliveryLogs = pgTable("document_delivery_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  documentType: text("document_type").notNull(),
  documentId: integer("document_id").notNull(),
  docNo: text("doc_no").notNull(),
  channel: text("channel").notNull(),
  recipientEmail: text("recipient_email"),
  recipientLine: text("recipient_line"),
  status: text("status").notNull().default("sent"),
  sentBy: integer("sent_by").references(() => users.id),
  sentAt: timestamp("sent_at").defaultNow(),
  metadata: text("metadata"),
});

export const insertDocumentDeliveryLogSchema = createInsertSchema(documentDeliveryLogs).omit({ id: true, sentAt: true });
export type InsertDocumentDeliveryLog = z.infer<typeof insertDocumentDeliveryLogSchema>;
export type DocumentDeliveryLog = typeof documentDeliveryLogs.$inferSelect;

export const purchaseRequests = pgTable("purchase_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  prNo: text("pr_no").notNull(),
  prDate: date("pr_date").notNull(),
  vendorId: integer("vendor_id").references(() => contacts.id),
  vendorCode: text("vendor_code"),
  vendorName: text("vendor_name").notNull(),
  vendorOrg: text("vendor_org"),
  vendorAddress: text("vendor_address"),
  vendorTaxId: text("vendor_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  creditDays: integer("credit_days"),
  deliveryDate: date("delivery_date"),
  refDoc: text("ref_doc"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  priceMode: text("price_mode").default("excluded"),
  docPrefix: text("doc_prefix").default("PR"),
  notes: text("notes"),
  salesperson: text("salesperson"),
  department: text("department"),
  project: text("project"),
  linkJournal: boolean("link_journal").default(false),
  shareToken: text("share_token"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPurchaseRequestSchema = createInsertSchema(purchaseRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchaseRequest = z.infer<typeof insertPurchaseRequestSchema>;
export type PurchaseRequest = typeof purchaseRequests.$inferSelect;

export const purchaseRequestItems = pgTable("purchase_request_items", {
  id: serial("id").primaryKey(),
  purchaseRequestId: integer("purchase_request_id").references(() => purchaseRequests.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
});

export const insertPurchaseRequestItemSchema = createInsertSchema(purchaseRequestItems).omit({ id: true });
export type InsertPurchaseRequestItem = z.infer<typeof insertPurchaseRequestItemSchema>;
export type PurchaseRequestItem = typeof purchaseRequestItems.$inferSelect;

export const bidComparisons = pgTable("bid_comparisons", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  bidNo: text("bid_no").notNull(),
  bidDate: date("bid_date").notNull(),
  prId: integer("pr_id").references(() => purchaseRequests.id),
  prRef: text("pr_ref"),
  description: text("description"),
  notes: text("notes"),
  selectedVendorId: integer("selected_vendor_id"),
  selectedVendorName: text("selected_vendor_name"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("pending"),
  docPrefix: text("doc_prefix").default("BID"),
  creator: text("creator"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBidComparisonSchema = createInsertSchema(bidComparisons).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBidComparison = z.infer<typeof insertBidComparisonSchema>;
export type BidComparison = typeof bidComparisons.$inferSelect;

export const bidComparisonItems = pgTable("bid_comparison_items", {
  id: serial("id").primaryKey(),
  bidId: integer("bid_id").references(() => bidComparisons.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
});

export const insertBidComparisonItemSchema = createInsertSchema(bidComparisonItems).omit({ id: true });
export type InsertBidComparisonItem = z.infer<typeof insertBidComparisonItemSchema>;
export type BidComparisonItem = typeof bidComparisonItems.$inferSelect;

export const bidVendors = pgTable("bid_vendors", {
  id: serial("id").primaryKey(),
  bidId: integer("bid_id").references(() => bidComparisons.id, { onDelete: "cascade" }).notNull(),
  vendorName: text("vendor_name").notNull(),
  price: decimal("price", { precision: 15, scale: 2 }).default("0"),
  remark: text("remark"),
  selected: boolean("selected").default(false),
});

export const insertBidVendorSchema = createInsertSchema(bidVendors).omit({ id: true });
export type InsertBidVendor = z.infer<typeof insertBidVendorSchema>;
export type BidVendor = typeof bidVendors.$inferSelect;

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  poNo: text("po_no").notNull(),
  poDate: date("po_date").notNull(),
  vendorId: integer("vendor_id").references(() => contacts.id),
  vendorCode: text("vendor_code"),
  vendorName: text("vendor_name").notNull(),
  vendorOrg: text("vendor_org"),
  vendorAddress: text("vendor_address"),
  vendorTaxId: text("vendor_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  creditDays: integer("credit_days"),
  deliveryDate: date("delivery_date"),
  refDoc: text("ref_doc"),
  bidId: integer("bid_id").references(() => bidComparisons.id),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"),
  priceMode: text("price_mode").default("excluded"),
  docPrefix: text("doc_prefix").default("PO"),
  notes: text("notes"),
  salesperson: text("salesperson"),
  department: text("department"),
  project: text("project"),
  warehouse: text("warehouse"),
  linkJournal: boolean("link_journal").default(false),
  shareToken: text("share_token"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrders.$inferSelect;

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial("id").primaryKey(),
  purchaseOrderId: integer("purchase_order_id").references(() => purchaseOrders.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
});

export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItems).omit({ id: true });
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;
export type PurchaseOrderItem = typeof purchaseOrderItems.$inferSelect;

export const purchaseInvoices = pgTable("purchase_invoices", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  apNo: text("ap_no").notNull(),
  apDate: date("ap_date").notNull(),
  dueDate: date("due_date"),
  vendorId: integer("vendor_id").references(() => contacts.id),
  vendorCode: text("vendor_code"),
  vendorName: text("vendor_name").notNull(),
  vendorOrg: text("vendor_org"),
  vendorAddress: text("vendor_address"),
  vendorTaxId: text("vendor_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  creditDays: integer("credit_days"),
  taxInvoiceRef: text("tax_invoice_ref"),
  formulaCode: text("formula_code"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"),
  paymentStatus: text("payment_status").default("unpaid"),
  priceMode: text("price_mode").default("excluded"),
  showInTaxReport: boolean("show_in_tax_report").default(true),
  docPrefix: text("doc_prefix").default("AP"),
  refDoc: text("ref_doc"),
  poId: integer("po_id").references(() => purchaseOrders.id),
  notes: text("notes"),
  salesperson: text("salesperson"),
  department: text("department"),
  project: text("project"),
  warehouse: text("warehouse"),
  paymentMethod: text("payment_method"),
  attachedUrl: text("attached_url"),
  attachedFolder: text("attached_folder"),
  linkJournal: boolean("link_journal").default(false),
  shareToken: text("share_token"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPurchaseInvoiceSchema = createInsertSchema(purchaseInvoices).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchaseInvoice = z.infer<typeof insertPurchaseInvoiceSchema>;
export type PurchaseInvoice = typeof purchaseInvoices.$inferSelect;

export const purchaseInvoiceItems = pgTable("purchase_invoice_items", {
  id: serial("id").primaryKey(),
  purchaseInvoiceId: integer("purchase_invoice_id").references(() => purchaseInvoices.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
  accountCode: text("account_code"),
  accountName: text("account_name"),
});

export const insertPurchaseInvoiceItemSchema = createInsertSchema(purchaseInvoiceItems).omit({ id: true });
export type InsertPurchaseInvoiceItem = z.infer<typeof insertPurchaseInvoiceItemSchema>;
export type PurchaseInvoiceItem = typeof purchaseInvoiceItems.$inferSelect;

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  expNo: text("exp_no").notNull(),
  expDate: date("exp_date").notNull(),
  dueDate: date("due_date"),
  vendorId: integer("vendor_id").references(() => contacts.id),
  vendorCode: text("vendor_code"),
  vendorName: text("vendor_name").notNull(),
  vendorOrg: text("vendor_org"),
  vendorAddress: text("vendor_address"),
  vendorTaxId: text("vendor_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  creditDays: integer("credit_days"),
  taxInvoiceRef: text("tax_invoice_ref"),
  formulaCode: text("formula_code"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"),
  paymentStatus: text("payment_status").default("unpaid"),
  priceMode: text("price_mode").default("excluded"),
  showInTaxReport: boolean("show_in_tax_report").default(true),
  docPrefix: text("doc_prefix").default("EXP"),
  refDoc: text("ref_doc"),
  refDebitNoteId: integer("ref_debit_note_id"),
  refDebitNoteNo: text("ref_debit_note_no"),
  notes: text("notes"),
  salesperson: text("salesperson"),
  department: text("department"),
  project: text("project"),
  paymentMethod: text("payment_method"),
  attachedUrl: text("attached_url"),
  attachedFolder: text("attached_folder"),
  linkJournal: boolean("link_journal").default(false),
  shareToken: text("share_token"),
  batchId: integer("batch_id"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

export const expenseDailyBatches = pgTable("expense_daily_batches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  batchNo: text("batch_no").notNull(),
  batchDate: date("batch_date").notNull(),
  totalExpenses: integer("total_expenses").notNull().default(0),
  totalSubtotal: decimal("total_subtotal", { precision: 15, scale: 2 }).default("0"),
  totalVat: decimal("total_vat", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  totalWht: decimal("total_wht", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertExpenseDailyBatchSchema = createInsertSchema(expenseDailyBatches).omit({ id: true, createdAt: true });
export type InsertExpenseDailyBatch = z.infer<typeof insertExpenseDailyBatchSchema>;
export type ExpenseDailyBatch = typeof expenseDailyBatches.$inferSelect;

export const expenseItems = pgTable("expense_items", {
  id: serial("id").primaryKey(),
  expenseId: integer("expense_id").references(() => expenses.id, { onDelete: "cascade" }).notNull(),
  accountCode: text("account_code"),
  accountName: text("account_name"),
  description: text("description"),
  expenseType: text("expense_type"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  vatType: text("vat_type").default("vat7"),
});

export const insertExpenseItemSchema = createInsertSchema(expenseItems).omit({ id: true });
export type InsertExpenseItem = z.infer<typeof insertExpenseItemSchema>;
export type ExpenseItem = typeof expenseItems.$inferSelect;

export const withholdingTaxCerts = pgTable("withholding_tax_certs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  certNo: text("cert_no").notNull(),
  certDate: date("cert_date").notNull(),
  paidDate: date("paid_date"),
  payerName: text("payer_name").notNull(),
  payerAddress: text("payer_address"),
  payerTaxId: text("payer_tax_id"),
  payerBranch: text("payer_branch"),
  payeeVendorId: integer("payee_vendor_id").references(() => contacts.id),
  payeeName: text("payee_name").notNull(),
  payeeAddress: text("payee_address"),
  payeeTaxId: text("payee_tax_id"),
  payeeBranch: text("payee_branch"),
  formType: text("form_type").default("pnd3"),
  incomeType: text("income_type"),
  incomeDescription: text("income_description"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("3"),
  amountPaid: decimal("amount_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  taxWithheld: decimal("tax_withheld", { precision: 15, scale: 2 }).notNull().default("0"),
  whtCondition: text("wht_condition").default("1"),
  sourceDocType: text("source_doc_type"),
  sourceDocId: integer("source_doc_id"),
  sourceDocNo: text("source_doc_no"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"),
  docPrefix: text("doc_prefix").default("WHT"),
  shareToken: text("share_token"),
  attachedUrl: text("attached_url"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWhtCertSchema = createInsertSchema(withholdingTaxCerts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWhtCert = z.infer<typeof insertWhtCertSchema>;
export type WhtCert = typeof withholdingTaxCerts.$inferSelect;

export const whtCertItems = pgTable("wht_cert_items", {
  id: serial("id").primaryKey(),
  whtCertId: integer("wht_cert_id").references(() => withholdingTaxCerts.id).notNull(),
  incomeType: text("income_type").notNull().default("5"),
  incomeDescription: text("income_description"),
  paidDate: date("paid_date"),
  amountPaid: decimal("amount_paid", { precision: 15, scale: 2 }).notNull().default("0"),
  taxWithheld: decimal("tax_withheld", { precision: 15, scale: 2 }).notNull().default("0"),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("3"),
});

export const insertWhtCertItemSchema = createInsertSchema(whtCertItems).omit({ id: true });
export type InsertWhtCertItem = z.infer<typeof insertWhtCertItemSchema>;
export type WhtCertItem = typeof whtCertItems.$inferSelect;

export const assetCategories = pgTable("asset_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  accountCode: text("account_code").notNull(),
  name: text("name").notNull(),
  accumCode: text("accum_code"),
  depExpCode: text("dep_exp_code"),
  usefulLifeMonths: integer("useful_life_months").notNull().default(60),
  depreciationRate: decimal("depreciation_rate", { precision: 8, scale: 4 }).notNull().default("20"),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAssetCategorySchema = createInsertSchema(assetCategories).omit({ id: true, createdAt: true });
export type InsertAssetCategory = z.infer<typeof insertAssetCategorySchema>;
export type AssetCategory = typeof assetCategories.$inferSelect;

export const fixedAssets = pgTable("fixed_assets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  assetCode: text("asset_code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  categoryAccountCode: text("category_account_code").notNull(),
  accumDepreciationAccountCode: text("accum_depreciation_account_code"),
  depreciationExpenseAccountCode: text("depreciation_expense_account_code").default("5251"),
  purchaseDate: date("purchase_date").notNull(),
  startDepreciationDate: date("start_depreciation_date").notNull(),
  cost: decimal("cost", { precision: 15, scale: 2 }).notNull(),
  salvageValue: decimal("salvage_value", { precision: 15, scale: 2 }).default("0"),
  usefulLifeMonths: integer("useful_life_months").notNull(),
  depreciationMethod: text("depreciation_method").notNull().default("straight_line"),
  monthlyDepreciation: decimal("monthly_depreciation", { precision: 15, scale: 2 }).default("0"),
  accumDepreciation: decimal("accum_depreciation", { precision: 15, scale: 2 }).default("0"),
  netBookValue: decimal("net_book_value", { precision: 15, scale: 2 }).default("0"),
  location: text("location"),
  department: text("department"),
  supplier: text("supplier"),
  invoiceRef: text("invoice_ref"),
  status: text("status").notNull().default("active"),
  disposalDate: date("disposal_date"),
  disposalPrice: decimal("disposal_price", { precision: 15, scale: 2 }),
  disposalGainLoss: decimal("disposal_gain_loss", { precision: 15, scale: 2 }),
  disposalJournalId: integer("disposal_journal_id"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFixedAssetSchema = createInsertSchema(fixedAssets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFixedAsset = z.infer<typeof insertFixedAssetSchema>;
export type FixedAsset = typeof fixedAssets.$inferSelect;

export const assetDepreciations = pgTable("asset_depreciations", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  assetId: integer("asset_id").references(() => fixedAssets.id).notNull(),
  period: text("period").notNull(),
  periodDate: date("period_date").notNull(),
  depreciationAmount: decimal("depreciation_amount", { precision: 15, scale: 2 }).notNull(),
  accumDepreciation: decimal("accum_depreciation", { precision: 15, scale: 2 }).notNull(),
  netBookValue: decimal("net_book_value", { precision: 15, scale: 2 }).notNull(),
  journalEntryId: integer("journal_entry_id"),
  posted: boolean("posted").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAssetDepreciationSchema = createInsertSchema(assetDepreciations).omit({ id: true, createdAt: true });
export type InsertAssetDepreciation = z.infer<typeof insertAssetDepreciationSchema>;
export type AssetDepreciation = typeof assetDepreciations.$inferSelect;

export const assetInstallmentContracts = pgTable("asset_installment_contracts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  assetId: integer("asset_id").references(() => fixedAssets.id),
  contractNo: text("contract_no").notNull(),
  contractType: text("contract_type").notNull().default("hire_purchase"),
  vehicleType: text("vehicle_type").default("other"),
  financeCompany: text("finance_company"),
  totalPrice: decimal("total_price", { precision: 15, scale: 2 }).notNull(),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  downPayment: decimal("down_payment", { precision: 15, scale: 2 }).default("0"),
  financeAmount: decimal("finance_amount", { precision: 15, scale: 2 }).notNull(),
  interestRate: decimal("interest_rate", { precision: 7, scale: 4 }).default("0"),
  totalInstallments: integer("total_installments").notNull(),
  monthlyPayment: decimal("monthly_payment", { precision: 15, scale: 2 }).notNull(),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).default("7"),
  vatReclaimable: boolean("vat_reclaimable").default(true),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  status: text("status").notNull().default("active"),
  paidInstallments: integer("paid_installments").default(0),
  remainingBalance: decimal("remaining_balance", { precision: 15, scale: 2 }),
  paymentAccountCode: text("payment_account_code").default("1001"),
  liabilityAccountCode: text("liability_account_code").default("2103400"),
  leaseLiabilityAccountCode: text("lease_liability_account_code").default("2103500"),
  interestAccountCode: text("interest_account_code").default("5901000"),
  assetAccountCode: text("asset_account_code"),
  purchaseJournalId: integer("purchase_journal_id"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAssetInstallmentContractSchema = createInsertSchema(assetInstallmentContracts).omit({ id: true, createdAt: true });
export type InsertAssetInstallmentContract = z.infer<typeof insertAssetInstallmentContractSchema>;
export type AssetInstallmentContract = typeof assetInstallmentContracts.$inferSelect;

export const assetInstallmentSchedules = pgTable("asset_installment_schedules", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").references(() => assetInstallmentContracts.id).notNull(),
  installmentNo: integer("installment_no").notNull(),
  dueDate: date("due_date").notNull(),
  principal: decimal("principal", { precision: 15, scale: 2 }).notNull(),
  interest: decimal("interest", { precision: 15, scale: 2 }).notNull(),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  paidDate: date("paid_date"),
  journalEntryId: integer("journal_entry_id"),
  notes: text("notes"),
});

export const insertAssetInstallmentScheduleSchema = createInsertSchema(assetInstallmentSchedules).omit({ id: true });
export type InsertAssetInstallmentSchedule = z.infer<typeof insertAssetInstallmentScheduleSchema>;
export type AssetInstallmentSchedule = typeof assetInstallmentSchedules.$inferSelect;

export const goodsReceivings = pgTable("goods_receivings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  grNo: text("gr_no").notNull(),
  grDate: date("gr_date").notNull(),
  vendorId: integer("vendor_id"),
  vendorName: text("vendor_name"),
  poReference: text("po_reference"),
  poId: integer("po_id"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  journalEntryId: integer("journal_entry_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGoodsReceivingSchema = createInsertSchema(goodsReceivings).omit({ id: true, createdAt: true });
export type InsertGoodsReceiving = z.infer<typeof insertGoodsReceivingSchema>;
export type GoodsReceiving = typeof goodsReceivings.$inferSelect;

export const goodsReceivingItems = pgTable("goods_receiving_items", {
  id: serial("id").primaryKey(),
  goodsReceivingId: integer("goods_receiving_id").references(() => goodsReceivings.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  productName: text("product_name").notNull(),
  productCode: text("product_code"),
  unit: text("unit").default("ชิ้น"),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }).default("0"),
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }).default("0"),
  lotNumber: text("lot_number"),
  manufacturingDate: date("manufacturing_date"),
  expiryDate: date("expiry_date"),
  lotId: integer("lot_id"),
});

export const insertGoodsReceivingItemSchema = createInsertSchema(goodsReceivingItems).omit({ id: true });
export type InsertGoodsReceivingItem = z.infer<typeof insertGoodsReceivingItemSchema>;
export type GoodsReceivingItem = typeof goodsReceivingItems.$inferSelect;

export const vatClosings = pgTable("vat_closings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  closedAt: timestamp("closed_at").defaultNow(),
  closedBy: integer("closed_by").references(() => users.id),
  notes: text("notes"),
});

export const insertVatClosingSchema = createInsertSchema(vatClosings).omit({ id: true, closedAt: true });
export type InsertVatClosing = z.infer<typeof insertVatClosingSchema>;
export type VatClosing = typeof vatClosings.$inferSelect;

export const goodsRequisitions = pgTable("goods_requisitions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  giqNo: text("giq_no").notNull(),
  giqDate: date("giq_date").notNull(),
  departmentId: integer("department_id"),
  departmentName: text("department_name"),
  requestedBy: text("requested_by"),
  purpose: text("purpose"),
  notes: text("notes"),
  status: text("status").notNull().default("draft"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  journalEntryId: integer("journal_entry_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGoodsRequisitionSchema = createInsertSchema(goodsRequisitions).omit({ id: true, createdAt: true });
export type InsertGoodsRequisition = z.infer<typeof insertGoodsRequisitionSchema>;
export type GoodsRequisition = typeof goodsRequisitions.$inferSelect;

export const goodsRequisitionItems = pgTable("goods_requisition_items", {
  id: serial("id").primaryKey(),
  goodsRequisitionId: integer("goods_requisition_id").references(() => goodsRequisitions.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  productName: text("product_name").notNull(),
  productCode: text("product_code"),
  unit: text("unit").default("ชิ้น"),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }).default("0"),
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }).default("0"),
});

export const insertGoodsRequisitionItemSchema = createInsertSchema(goodsRequisitionItems).omit({ id: true });
export type InsertGoodsRequisitionItem = z.infer<typeof insertGoodsRequisitionItemSchema>;
export type GoodsRequisitionItem = typeof goodsRequisitionItems.$inferSelect;

export const posSessions = pgTable("pos_sessions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  storeId: integer("store_id"),
  warehouseId: integer("warehouse_id"),
  branchName: text("branch_name").default("สำนักงานใหญ่"),
  terminalName: text("terminal_name").default("เครื่อง 1"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
  openingCash: decimal("opening_cash", { precision: 15, scale: 2 }).notNull().default("0"),
  closingCash: decimal("closing_cash", { precision: 15, scale: 2 }),
  expectedCash: decimal("expected_cash", { precision: 15, scale: 2 }),
  cashVariance: decimal("cash_variance", { precision: 15, scale: 2 }),
  totalSales: decimal("total_sales", { precision: 15, scale: 2 }).default("0"),
  totalTransactions: integer("total_transactions").default(0),
  status: text("status").notNull().default("open"),
  notes: text("notes"),
});

export const insertPosSessionSchema = createInsertSchema(posSessions).omit({ id: true, closedAt: true, closingCash: true, expectedCash: true, cashVariance: true, totalSales: true, totalTransactions: true });
export type InsertPosSession = z.infer<typeof insertPosSessionSchema>;
export type PosSession = typeof posSessions.$inferSelect;

export const posTransactions = pgTable("pos_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  sessionId: integer("session_id").references(() => posSessions.id).notNull(),
  transactionNo: text("transaction_no").notNull(),
  customerId: integer("customer_id").references(() => contacts.id),
  customerName: text("customer_name"),
  paymentMethod: text("payment_method").notNull().default("เงินสด"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  cashReceived: decimal("cash_received", { precision: 15, scale: 2 }),
  changeAmount: decimal("change_amount", { precision: 15, scale: 2 }),
  taxInvoiceId: integer("tax_invoice_id"),
  isFullTaxInvoice: boolean("is_full_tax_invoice").default(false),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPosTransactionSchema = createInsertSchema(posTransactions).omit({ id: true, createdAt: true });
export type InsertPosTransaction = z.infer<typeof insertPosTransactionSchema>;
export type PosTransaction = typeof posTransactions.$inferSelect;

export const posTransactionItems = pgTable("pos_transaction_items", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").references(() => posTransactions.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  vatType: text("vat_type").default("vat7"),
  lineTotal: decimal("line_total", { precision: 15, scale: 2 }).notNull(),
  unit: text("unit").default("ชิ้น"),
});

export const insertPosTransactionItemSchema = createInsertSchema(posTransactionItems).omit({ id: true });
export type InsertPosTransactionItem = z.infer<typeof insertPosTransactionItemSchema>;
export type PosTransactionItem = typeof posTransactionItems.$inferSelect;

// ============ Multi-Warehouse ============

export const warehouses = pgTable("warehouses", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  address: text("address"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  warehouseType: text("warehouse_type").notNull().default("normal"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWarehouseSchema = createInsertSchema(warehouses).omit({ id: true, createdAt: true });
export type InsertWarehouse = z.infer<typeof insertWarehouseSchema>;
export type Warehouse = typeof warehouses.$inferSelect;

export const warehouseStockLevels = pgTable("warehouse_stock_levels", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull().default("0"),
  reservedQty: decimal("reserved_qty", { precision: 15, scale: 4 }).notNull().default("0"),
  minStock: decimal("min_stock", { precision: 15, scale: 4 }),
  maxStock: decimal("max_stock", { precision: 15, scale: 4 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWarehouseStockLevelSchema = createInsertSchema(warehouseStockLevels).omit({ id: true, updatedAt: true });
export type InsertWarehouseStockLevel = z.infer<typeof insertWarehouseStockLevelSchema>;
export type WarehouseStockLevel = typeof warehouseStockLevels.$inferSelect;

export const stockTransfers = pgTable("stock_transfers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  transferNo: text("transfer_no").notNull(),
  fromWarehouseId: integer("from_warehouse_id").references(() => warehouses.id).notNull(),
  toWarehouseId: integer("to_warehouse_id").references(() => warehouses.id).notNull(),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  approvedBy: integer("approved_by").references(() => users.id),
  shippedBy: integer("shipped_by").references(() => users.id),
  shippedAt: timestamp("shipped_at"),
  shipGpsLat: decimal("ship_gps_lat", { precision: 10, scale: 7 }),
  shipGpsLng: decimal("ship_gps_lng", { precision: 10, scale: 7 }),
  receivedBy: integer("received_by").references(() => users.id),
  receivedAt: timestamp("received_at"),
  receiveGpsLat: decimal("receive_gps_lat", { precision: 10, scale: 7 }),
  receiveGpsLng: decimal("receive_gps_lng", { precision: 10, scale: 7 }),
  receiverSignature: text("receiver_signature"),
  receiverName: text("receiver_name"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertStockTransferSchema = createInsertSchema(stockTransfers).omit({ id: true, createdAt: true, completedAt: true });
export type InsertStockTransfer = z.infer<typeof insertStockTransferSchema>;
export type StockTransfer = typeof stockTransfers.$inferSelect;

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").references(() => stockTransfers.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  quantity: decimal("quantity", { precision: 15, scale: 4 }).notNull(),
  unit: text("unit").default("ชิ้น"),
  notes: text("notes"),
});

export const insertStockTransferItemSchema = createInsertSchema(stockTransferItems).omit({ id: true });
export type InsertStockTransferItem = z.infer<typeof insertStockTransferItemSchema>;
export type StockTransferItem = typeof stockTransferItems.$inferSelect;

// ============ Fulfillment Pick-Pack-Ship ============

export const fulfillmentBatches = pgTable("fulfillment_batches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  batchNo: text("batch_no").notNull(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  status: text("status").notNull().default("pending"),
  totalOrders: integer("total_orders").notNull().default(0),
  pickedCount: integer("picked_count").notNull().default(0),
  packedCount: integer("packed_count").notNull().default(0),
  shippedCount: integer("shipped_count").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertFulfillmentBatchSchema = createInsertSchema(fulfillmentBatches).omit({ id: true, createdAt: true, completedAt: true });
export type InsertFulfillmentBatch = z.infer<typeof insertFulfillmentBatchSchema>;
export type FulfillmentBatch = typeof fulfillmentBatches.$inferSelect;

export const fulfillmentItems = pgTable("fulfillment_items", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").references(() => fulfillmentBatches.id, { onDelete: "cascade" }).notNull(),
  orderId: integer("order_id").references(() => ecommerceOrders.id).notNull(),
  status: text("status").notNull().default("pending"),
  pickedAt: timestamp("picked_at"),
  pickedBy: integer("picked_by").references(() => users.id),
  packedAt: timestamp("packed_at"),
  packedBy: integer("packed_by").references(() => users.id),
  shippedAt: timestamp("shipped_at"),
  trackingNo: text("tracking_no"),
  shippingProvider: text("shipping_provider"),
  labelPrinted: boolean("label_printed").notNull().default(false),
  notes: text("notes"),
  deliveredAt: timestamp("delivered_at"),
  deliveredBy: integer("delivered_by").references(() => users.id),
  deliveryGpsLat: decimal("delivery_gps_lat", { precision: 10, scale: 7 }),
  deliveryGpsLng: decimal("delivery_gps_lng", { precision: 10, scale: 7 }),
  receiverSignature: text("receiver_signature"),
  receiverName: text("receiver_name"),
  deliveryPhotoUrl: text("delivery_photo_url"),
});

export const insertFulfillmentItemSchema = createInsertSchema(fulfillmentItems).omit({ id: true });
export type InsertFulfillmentItem = z.infer<typeof insertFulfillmentItemSchema>;
export type FulfillmentItem = typeof fulfillmentItems.$inferSelect;

// ============ Platform Sync Logs ============

export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id).notNull(),
  platform: text("platform").notNull(),
  syncType: text("sync_type").notNull().default("orders"),
  status: text("status").notNull().default("running"),
  totalRecords: integer("total_records").default(0),
  newRecords: integer("new_records").default(0),
  updatedRecords: integer("updated_records").default(0),
  errorCount: integer("error_count").default(0),
  errorDetails: text("error_details"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertSyncLogSchema = createInsertSchema(syncLogs).omit({ id: true, startedAt: true, completedAt: true });
export type InsertSyncLog = z.infer<typeof insertSyncLogSchema>;
export type SyncLog = typeof syncLogs.$inferSelect;

// ============ Platform Chat (Unified Inbox) ============

export const platformChatThreads = pgTable("platform_chat_threads", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id),
  platform: text("platform").notNull(),
  platformThreadId: text("platform_thread_id").notNull(),
  buyerName: text("buyer_name"),
  buyerAvatar: text("buyer_avatar"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  unreadCount: integer("unread_count").notNull().default(0),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlatformChatThreadSchema = createInsertSchema(platformChatThreads).omit({ id: true, createdAt: true });
export type InsertPlatformChatThread = z.infer<typeof insertPlatformChatThreadSchema>;
export type PlatformChatThread = typeof platformChatThreads.$inferSelect;

export const platformChatMessages = pgTable("platform_chat_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").references(() => platformChatThreads.id, { onDelete: "cascade" }).notNull(),
  platformMessageId: text("platform_message_id"),
  senderType: text("sender_type").notNull().default("buyer"),
  senderName: text("sender_name"),
  messageType: text("message_type").notNull().default("text"),
  content: text("content"),
  imageUrl: text("image_url"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPlatformChatMessageSchema = createInsertSchema(platformChatMessages).omit({ id: true, createdAt: true });
export type InsertPlatformChatMessage = z.infer<typeof insertPlatformChatMessageSchema>;
export type PlatformChatMessage = typeof platformChatMessages.$inferSelect;

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  keyName: text("key_name").notNull(),
  apiKey: text("api_key").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  permissions: text("permissions").notNull().default("orders:write"),
  status: text("status").notNull().default("active"),
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeys).omit({ id: true, createdAt: true });
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeys.$inferSelect;

export const facebookPages = pgTable("facebook_pages", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  pageId: text("page_id").notNull(),
  pageName: text("page_name").notNull(),
  pageAccessToken: text("page_access_token"),
  profilePicUrl: text("profile_pic_url"),
  status: text("status").notNull().default("pending"),
  lastSyncAt: timestamp("last_sync_at"),
  autoCreateOrders: boolean("auto_create_orders").default(false),
  cfKeywords: text("cf_keywords").notNull().default("CF,cf,ซีเอฟ,สั่ง,จอง"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFacebookPageSchema = createInsertSchema(facebookPages).omit({ id: true, createdAt: true });
export type InsertFacebookPage = z.infer<typeof insertFacebookPageSchema>;
export type FacebookPage = typeof facebookPages.$inferSelect;

export const facebookChatOrders = pgTable("facebook_chat_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  pageId: integer("page_id").references(() => facebookPages.id).notNull(),
  conversationId: text("conversation_id"),
  senderName: text("sender_name").notNull(),
  senderId: text("sender_id"),
  senderProfilePic: text("sender_profile_pic"),
  rawMessages: text("raw_messages"),
  parsedProducts: text("parsed_products"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("pending"),
  paymentStatus: text("payment_status").default("pending"),
  paymentSlipUrl: text("payment_slip_url"),
  paymentAmount: decimal("payment_amount", { precision: 15, scale: 2 }),
  paymentBank: text("payment_bank"),
  paymentRef: text("payment_ref"),
  paymentDate: text("payment_date"),
  paymentVerifiedAt: timestamp("payment_verified_at"),
  paymentVerifyNote: text("payment_verify_note"),
  cfOrderId: integer("cf_order_id").references(() => liveCfOrders.id),
  ecommerceOrderId: integer("ecommerce_order_id").references(() => ecommerceOrders.id),
  notes: text("notes"),
  messageDate: timestamp("message_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFacebookChatOrderSchema = createInsertSchema(facebookChatOrders).omit({ id: true, createdAt: true });
export type InsertFacebookChatOrder = z.infer<typeof insertFacebookChatOrderSchema>;
export type FacebookChatOrder = typeof facebookChatOrders.$inferSelect;

// ============ Chat Orders (Unified LINE + Facebook) ============

export const chatOrders = pgTable("chat_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  platform: text("platform").notNull(), // "line" | "facebook"
  threadId: integer("thread_id").references(() => platformChatThreads.id),
  messageId: integer("message_id").references(() => platformChatMessages.id),
  buyerName: text("buyer_name"),
  buyerExternalId: text("buyer_external_id"),
  rawMessage: text("raw_message"),
  parsedProducts: text("parsed_products"), // JSON: [{name, qty, price}]
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("detected"), // detected, confirmed, cancelled
  paymentStatus: text("payment_status").default("pending"), // pending, paid, verified
  paymentSlipUrl: text("payment_slip_url"),
  paymentAmount: decimal("payment_amount", { precision: 15, scale: 2 }),
  paymentRef: text("payment_ref"),
  ecommerceOrderId: integer("ecommerce_order_id").references(() => ecommerceOrders.id),
  confirmedBy: integer("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatOrderSchema = createInsertSchema(chatOrders).omit({ id: true, createdAt: true });
export type InsertChatOrder = z.infer<typeof insertChatOrderSchema>;
export type ChatOrder = typeof chatOrders.$inferSelect;

export const chatOrderKeywords = pgTable("chat_order_keywords", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  platform: text("platform").notNull().default("all"), // "all" | "line" | "facebook" | "instagram"
  keyword: text("keyword").notNull(), // e.g. "CF", "สั่ง", "order"
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatOrderKeywordSchema = createInsertSchema(chatOrderKeywords).omit({ id: true, createdAt: true });
export type InsertChatOrderKeyword = z.infer<typeof insertChatOrderKeywordSchema>;
export type ChatOrderKeyword = typeof chatOrderKeywords.$inferSelect;

export const ecommerceReturns = pgTable("ecommerce_returns", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  orderId: integer("order_id").references(() => ecommerceOrders.id).notNull(),
  platform: text("platform").notNull(),
  returnNo: text("return_no").notNull(),
  reason: text("reason").notNull(),
  reasonDetail: text("reason_detail"),
  status: text("status").notNull().default("requested"),
  returnStatus: text("return_status").notNull().default("pending"),
  refundAmount: decimal("refund_amount", { precision: 15, scale: 2 }).default("0"),
  refundMethod: text("refund_method"),
  buyerName: text("buyer_name"),
  returnTrackingNo: text("return_tracking_no"),
  returnShipper: text("return_shipper"),
  receivingWarehouseId: integer("receiving_warehouse_id").references(() => warehouses.id),
  requestedAt: timestamp("requested_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
  approvedBy: integer("approved_by").references(() => users.id),
  shippedAt: timestamp("shipped_at"),
  receivedAt: timestamp("received_at"),
  receivedBy: integer("received_by").references(() => users.id),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  notesInternal: text("notes_internal"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEcommerceReturnSchema = createInsertSchema(ecommerceReturns).omit({ id: true, createdAt: true });
export type InsertEcommerceReturn = z.infer<typeof insertEcommerceReturnSchema>;
export type EcommerceReturn = typeof ecommerceReturns.$inferSelect;

export const ecommerceReturnItems = pgTable("ecommerce_return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").references(() => ecommerceReturns.id, { onDelete: "cascade" }).notNull(),
  orderItemId: integer("order_item_id").references(() => ecommerceOrderItems.id),
  productId: integer("product_id").references(() => products.id),
  productName: text("product_name").notNull(),
  sku: text("sku"),
  barcode: text("barcode"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  receivedQty: decimal("received_qty", { precision: 15, scale: 4 }).default("0"),
  refundAmount: decimal("refund_amount", { precision: 15, scale: 2 }).default("0"),
  unitCost: decimal("unit_cost", { precision: 15, scale: 2 }).default("0"),
  condition: text("condition").default("unopened"),
  receivedCondition: text("received_condition"),
  disposition: text("disposition"),
  zone: text("zone").default("receiving"),
  qcStatus: text("qc_status").default("pending"),
  qcCondition: text("qc_condition"),
  qcNotes: text("qc_notes"),
  qcBy: integer("qc_by").references(() => users.id),
  qcAt: timestamp("qc_at"),
  lossAmount: decimal("loss_amount", { precision: 15, scale: 2 }).default("0"),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  stockUpdated: boolean("stock_updated").default(false),
  receivedAt: timestamp("received_at"),
  receivedBy: integer("received_by").references(() => users.id),
});

export const insertEcommerceReturnItemSchema = createInsertSchema(ecommerceReturnItems).omit({ id: true });
export type InsertEcommerceReturnItem = z.infer<typeof insertEcommerceReturnItemSchema>;
export type EcommerceReturnItem = typeof ecommerceReturnItems.$inferSelect;

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  userId: integer("user_id").references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  link: text("link"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  entityName: text("entity_name"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

export const bankStatements = pgTable("bank_statements", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  accountCode: text("account_code"),
  accountName: text("account_name"),
  bankName: text("bank_name"),
  statementDate: date("statement_date").notNull(),
  description: text("description"),
  debitAmount: decimal("debit_amount", { precision: 15, scale: 2 }).default("0"),
  creditAmount: decimal("credit_amount", { precision: 15, scale: 2 }).default("0"),
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  reference: text("reference"),
  isReconciled: boolean("is_reconciled").default(false),
  matchedJournalId: integer("matched_journal_id").references(() => journalEntries.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertBankStatementSchema = createInsertSchema(bankStatements).omit({ id: true, createdAt: true });
export type InsertBankStatement = z.infer<typeof insertBankStatementSchema>;
export type BankStatement = typeof bankStatements.$inferSelect;

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  lineUserId: text("line_user_id"),
  platform: text("platform"),
  platformCustomerId: text("platform_customer_id"),
  tags: text("tags").array().default(sql`ARRAY[]::text[]`),
  notes: text("notes"),
  totalSpend: decimal("total_spend", { precision: 15, scale: 2 }).default("0"),
  orderCount: integer("order_count").default(0),
  averageOrderValue: decimal("average_order_value", { precision: 15, scale: 2 }).default("0"),
  lastOrderDate: timestamp("last_order_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customers.$inferSelect;

export const adCampaigns = pgTable("ad_campaigns", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  externalId: text("external_id"),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdCampaignSchema = createInsertSchema(adCampaigns).omit({ id: true, createdAt: true });
export type InsertAdCampaign = z.infer<typeof insertAdCampaignSchema>;
export type AdCampaign = typeof adCampaigns.$inferSelect;

export const adSpendEntries = pgTable("ad_spend_entries", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  campaignId: integer("campaign_id").references(() => adCampaigns.id),
  platform: text("platform").notNull(),
  spendDate: date("spend_date").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  conversions: integer("conversions").default(0),
  revenue: decimal("revenue", { precision: 15, scale: 2 }).default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAdSpendSchema = createInsertSchema(adSpendEntries).omit({ id: true, createdAt: true });
export type InsertAdSpend = z.infer<typeof insertAdSpendSchema>;
export type AdSpend = typeof adSpendEntries.$inferSelect;

export const payrollRecords = pgTable("payroll_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  baseSalary: decimal("base_salary", { precision: 12, scale: 2 }).notNull(),
  otAmount: decimal("ot_amount", { precision: 12, scale: 2 }).default("0"),
  commissionAmount: decimal("commission_amount", { precision: 12, scale: 2 }).default("0"),
  otherEarnings: decimal("other_earnings", { precision: 12, scale: 2 }).default("0"),
  totalEarnings: decimal("total_earnings", { precision: 12, scale: 2 }).notNull(),
  socialSecurity: decimal("social_security", { precision: 12, scale: 2 }).default("0"),
  ssoEmployer: decimal("sso_employer", { precision: 12, scale: 2 }).default("0"),
  withholdingTax: decimal("withholding_tax", { precision: 12, scale: 2 }).default("0"),
  otherDeductions: decimal("other_deductions", { precision: 12, scale: 2 }).default("0"),
  totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).notNull(),
  netPay: decimal("net_pay", { precision: 12, scale: 2 }).notNull(),
  workDays: integer("work_days").default(0),
  otHours: decimal("ot_hours", { precision: 5, scale: 2 }).default("0"),
  leaveDays: decimal("leave_days", { precision: 4, scale: 1 }).default("0"),
  status: text("status").notNull().default("draft"),
  ssoExempt: boolean("sso_exempt").default(false),
  taxDeductions: jsonb("tax_deductions").default("[]"),
  paidDate: date("paid_date"),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPayrollRecordSchema = createInsertSchema(payrollRecords).omit({ id: true, createdAt: true });
export type InsertPayrollRecord = z.infer<typeof insertPayrollRecordSchema>;
export type PayrollRecord = typeof payrollRecords.$inferSelect;

export const payrollAdjustments = pgTable("payroll_adjustments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull().default("0"),
  note: text("note"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPayrollAdjustmentSchema = createInsertSchema(payrollAdjustments).omit({ id: true, createdAt: true });
export type InsertPayrollAdjustment = z.infer<typeof insertPayrollAdjustmentSchema>;
export type PayrollAdjustment = typeof payrollAdjustments.$inferSelect;

export const holidays = pgTable("holidays", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  name: text("name").notNull(),
  date: date("date").notNull(),
  holidayType: text("holiday_type").notNull().default("national"),
  description: text("description"),
  year: integer("year").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHolidaySchema = createInsertSchema(holidays).omit({ id: true, createdAt: true });
export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
export type Holiday = typeof holidays.$inferSelect;

export const taskBoards = pgTable("task_boards", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  color: text("color").default("#539BFF"),
  visibility: text("visibility").default("public"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskBoardSchema = createInsertSchema(taskBoards).omit({ id: true, createdAt: true });
export type InsertTaskBoard = z.infer<typeof insertTaskBoardSchema>;
export type TaskBoard = typeof taskBoards.$inferSelect;

export const taskBoardMembers = pgTable("task_board_members", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => taskBoards.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: text("role").default("member"),
});

export const insertTaskBoardMemberSchema = createInsertSchema(taskBoardMembers).omit({ id: true });
export type InsertTaskBoardMember = z.infer<typeof insertTaskBoardMemberSchema>;
export type TaskBoardMember = typeof taskBoardMembers.$inferSelect;

export const taskColumns = pgTable("task_columns", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => taskBoards.id).notNull(),
  name: text("name").notNull(),
  color: text("color").default("#c4c4c4"),
  sortOrder: integer("sort_order").notNull().default(0),
  isDone: boolean("is_done").default(false),
});

export const insertTaskColumnSchema = createInsertSchema(taskColumns).omit({ id: true });
export type InsertTaskColumn = z.infer<typeof insertTaskColumnSchema>;
export type TaskColumn = typeof taskColumns.$inferSelect;

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => taskBoards.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  columnId: integer("column_id").references(() => taskColumns.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priority: text("priority").default("medium"),
  dueDate: date("due_date"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export const taskAssignees = pgTable("task_assignees", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
});

export const insertTaskAssigneeSchema = createInsertSchema(taskAssignees).omit({ id: true });
export type InsertTaskAssignee = z.infer<typeof insertTaskAssigneeSchema>;
export type TaskAssignee = typeof taskAssignees.$inferSelect;

export const taskComments = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskCommentSchema = createInsertSchema(taskComments).omit({ id: true, createdAt: true });
export type InsertTaskComment = z.infer<typeof insertTaskCommentSchema>;
export type TaskComment = typeof taskComments.$inferSelect;

export const contracts = pgTable("contracts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  firmClientId: integer("firm_client_id").references(() => firmClients.id).notNull(),
  contractNo: text("contract_no").notNull(),
  title: text("title").notNull(),
  firmName: text("firm_name"),
  firmAddress: text("firm_address"),
  firmTaxId: text("firm_tax_id"),
  firmRepName: text("firm_rep_name"),
  clientName: text("client_name"),
  clientAddress: text("client_address"),
  clientTaxId: text("client_tax_id"),
  clientRepName: text("client_rep_name"),
  serviceScope: text("service_scope"),
  serviceFee: decimal("service_fee", { precision: 12, scale: 2 }).default("0"),
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  paymentTerms: text("payment_terms"),
  additionalTerms: text("additional_terms"),
  status: text("status").notNull().default("draft"),
  publicToken: text("public_token").notNull(),
  signatureDataUrl: text("signature_data_url"),
  signerName: text("signer_name"),
  signerPosition: text("signer_position"),
  firmSignatureDataUrl: text("firm_signature_data_url"),
  sentAt: timestamp("sent_at"),
  signedAt: timestamp("signed_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;

export const workBoards = pgTable("work_boards", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  color: text("color").default("#539BFF"),
  boardType: text("board_type").default("general"),
  visibility: text("visibility").notNull().default("main"),
  shareToken: text("share_token").unique(),
  sharedAt: timestamp("shared_at"),
  isArchived: boolean("is_archived").default(false),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkBoardSchema = createInsertSchema(workBoards).omit({ id: true, createdAt: true });
export type InsertWorkBoard = z.infer<typeof insertWorkBoardSchema>;
export type WorkBoard = typeof workBoards.$inferSelect;

export const workBoardGroups = pgTable("work_board_groups", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workBoards.id).notNull(),
  name: text("name").notNull(),
  color: text("color").default("#539BFF"),
  position: integer("position").notNull().default(0),
  collapsed: boolean("collapsed").default(false),
});

export const insertWorkBoardGroupSchema = createInsertSchema(workBoardGroups).omit({ id: true });
export type InsertWorkBoardGroup = z.infer<typeof insertWorkBoardGroupSchema>;
export type WorkBoardGroup = typeof workBoardGroups.$inferSelect;

export const workBoardColumns = pgTable("work_board_columns", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workBoards.id).notNull(),
  name: text("name").notNull(),
  columnType: text("column_type").notNull().default("text"),
  options: text("options"),
  position: integer("position").notNull().default(0),
  width: integer("width").default(150),
  level: text("level").notNull().default("main"),
});

export const insertWorkBoardColumnSchema = createInsertSchema(workBoardColumns).omit({ id: true });
export type InsertWorkBoardColumn = z.infer<typeof insertWorkBoardColumnSchema>;
export type WorkBoardColumn = typeof workBoardColumns.$inferSelect;

export const workBoardItems = pgTable("work_board_items", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workBoards.id).notNull(),
  groupId: integer("group_id").references(() => workBoardGroups.id),
  name: text("name").notNull(),
  cellValues: text("cell_values").default("{}"),
  position: integer("position").notNull().default(0),
  firmClientId: integer("firm_client_id").references(() => firmClients.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const insertWorkBoardItemSchema = createInsertSchema(workBoardItems).omit({ id: true, createdAt: true, updatedAt: true, updatedBy: true });
export type InsertWorkBoardItem = z.infer<typeof insertWorkBoardItemSchema>;
export type WorkBoardItem = typeof workBoardItems.$inferSelect;

export const workBoardSubitems = pgTable("work_board_subitems", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").references(() => workBoardItems.id).notNull(),
  name: text("name").notNull(),
  cellValues: text("cell_values").default("{}"),
  position: integer("position").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkBoardSubitemSchema = createInsertSchema(workBoardSubitems).omit({ id: true, createdAt: true });
export type InsertWorkBoardSubitem = z.infer<typeof insertWorkBoardSubitemSchema>;
export type WorkBoardSubitem = typeof workBoardSubitems.$inferSelect;

export const workBoardItemUpdates = pgTable("work_board_item_updates", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").references(() => workBoardItems.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id),
  content: text("content").notNull().default(""),
  attachments: jsonb("attachments").default([]),
  updateType: text("update_type").notNull().default("message"),
  guestName: text("guest_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkBoardItemUpdateSchema = createInsertSchema(workBoardItemUpdates).omit({ id: true, createdAt: true });
export type InsertWorkBoardItemUpdate = z.infer<typeof insertWorkBoardItemUpdateSchema>;
export type WorkBoardItemUpdate = typeof workBoardItemUpdates.$inferSelect;

export const workBoardMembers = pgTable("work_board_members", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workBoards.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  role: text("role").notNull().default("editor"),
  addedBy: integer("added_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkBoardMemberSchema = createInsertSchema(workBoardMembers).omit({ id: true, createdAt: true });
export type InsertWorkBoardMember = z.infer<typeof insertWorkBoardMemberSchema>;
export type WorkBoardMember = typeof workBoardMembers.$inferSelect;

export const workBoardShareLinks = pgTable("work_board_share_links", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workBoards.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull().unique(),
  label: text("label").notNull(),
  allowedGroupIds: integer("allowed_group_ids").array(),
  active: boolean("active").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkBoardShareLinkSchema = createInsertSchema(workBoardShareLinks).omit({ id: true, createdAt: true });
export type InsertWorkBoardShareLink = z.infer<typeof insertWorkBoardShareLinkSchema>;
export type WorkBoardShareLink = typeof workBoardShareLinks.$inferSelect;

export const workBoardViews = pgTable("work_board_views", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workBoards.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  filters: jsonb("filters").default({}),
  isShared: boolean("is_shared").default(false),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkBoardViewSchema = createInsertSchema(workBoardViews).omit({ id: true, createdAt: true });
export type InsertWorkBoardView = z.infer<typeof insertWorkBoardViewSchema>;
export type WorkBoardView = typeof workBoardViews.$inferSelect;

export const workBoardWidgets = pgTable("work_board_widgets", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workBoards.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  chartType: text("chart_type").notNull().default("number"),
  columnId: integer("column_id"),
  calcType: text("calc_type").notNull().default("count"),
  position: integer("position").notNull().default(0),
  width: text("width").notNull().default("half"),
  filterValue: text("filter_value"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkBoardWidgetSchema = createInsertSchema(workBoardWidgets).omit({ id: true, createdAt: true });
export type InsertWorkBoardWidget = z.infer<typeof insertWorkBoardWidgetSchema>;
export type WorkBoardWidget = typeof workBoardWidgets.$inferSelect;

export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  targetGroup: text("target_group").notNull().default("general"),
  setupFee: decimal("setup_fee", { precision: 10, scale: 2 }).default("0"),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull().default("0"),
  yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }),
  maxUsers: integer("max_users").notNull().default(1),
  maxDocumentsPerMonth: integer("max_documents_per_month").notNull().default(50),
  maxCompanies: integer("max_companies").notNull().default(1),
  maxBranches: integer("max_branches").notNull().default(1),
  maxEcommerceConnections: integer("max_ecommerce_connections").notNull().default(0),
  maxProducts: integer("max_products").notNull().default(100),
  features: text("features").array(),
  hasAiFeatures: boolean("has_ai_features").notNull().default(false),
  hasHrModule: boolean("has_hr_module").notNull().default(false),
  hasPosModule: boolean("has_pos_module").notNull().default(false),
  hasDeliveryModule: boolean("has_delivery_module").notNull().default(false),
  hasApiAccess: boolean("has_api_access").notNull().default(false),
  hasWhiteLabel: boolean("has_white_label").notNull().default(false),
  hasFirmModule: boolean("has_firm_module").notNull().default(false),
  enabledModules: text("enabled_modules").array(),
  landingFeatures: text("landing_features").array(),
  landingCta: text("landing_cta"),
  landingLink: text("landing_link"),
  popular: boolean("popular").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true });
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

export const tenantSubscriptions = pgTable("tenant_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  planId: integer("plan_id").references(() => subscriptionPlans.id).notNull(),
  status: text("status").notNull().default("active"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  trialEndsAt: timestamp("trial_ends_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantSubscriptionSchema = createInsertSchema(tenantSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantSubscription = z.infer<typeof insertTenantSubscriptionSchema>;
export type TenantSubscription = typeof tenantSubscriptions.$inferSelect;

export const subscriptionPaymentOrders = pgTable("subscription_payment_orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  planId: integer("plan_id").references(() => subscriptionPlans.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  setupFeeAmount: decimal("setup_fee_amount", { precision: 10, scale: 2 }).default("0"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  status: text("status").notNull().default("pending"),
  orderType: text("order_type").notNull().default("renewal"),
  promptpayRef: text("promptpay_ref"),
  slipImageUrl: text("slip_image_url"),
  confirmedByUserId: integer("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at"),
  invoiceNumber: text("invoice_number"),
  taxInvoiceId: integer("tax_invoice_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubscriptionPaymentOrderSchema = createInsertSchema(subscriptionPaymentOrders).omit({ id: true, createdAt: true });
export type InsertSubscriptionPaymentOrder = z.infer<typeof insertSubscriptionPaymentOrderSchema>;
export type SubscriptionPaymentOrder = typeof subscriptionPaymentOrders.$inferSelect;

export const subscriptionAddons = pgTable("subscription_addons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull().default("0"),
  yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }),
  featureFlag: text("feature_flag").notNull(),
  icon: text("icon"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSubscriptionAddonSchema = createInsertSchema(subscriptionAddons).omit({ id: true, createdAt: true });
export type InsertSubscriptionAddon = z.infer<typeof insertSubscriptionAddonSchema>;
export type SubscriptionAddon = typeof subscriptionAddons.$inferSelect;

export const tenantAddonSubscriptions = pgTable("tenant_addon_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  addonId: integer("addon_id").references(() => subscriptionAddons.id).notNull(),
  status: text("status").notNull().default("active"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantAddonSubscriptionSchema = createInsertSchema(tenantAddonSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantAddonSubscription = z.infer<typeof insertTenantAddonSubscriptionSchema>;
export type TenantAddonSubscription = typeof tenantAddonSubscriptions.$inferSelect;

export const pettyCashFunds = pgTable("petty_cash_funds", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  fundLimit: decimal("fund_limit", { precision: 15, scale: 2 }).notNull().default("0"),
  currentBalance: decimal("current_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  custodianName: text("custodian_name"),
  custodianId: integer("custodian_id").references(() => users.id),
  cashAccountCode: text("cash_account_code"),
  pettyCashAccountCode: text("petty_cash_account_code"),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPettyCashFundSchema = createInsertSchema(pettyCashFunds).omit({ id: true, createdAt: true });
export type InsertPettyCashFund = z.infer<typeof insertPettyCashFundSchema>;
export type PettyCashFund = typeof pettyCashFunds.$inferSelect;

export const pettyCashTransactions = pgTable("petty_cash_transactions", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => pettyCashFunds.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  txnDate: date("txn_date").notNull(),
  txnType: text("txn_type").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  receiptNo: text("receipt_no"),
  expenseAccountCode: text("expense_account_code"),
  expenseAccountName: text("expense_account_name"),
  vendorName: text("vendor_name"),
  approvedBy: integer("approved_by").references(() => users.id),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  attachmentUrl: text("attachment_url"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPettyCashTransactionSchema = createInsertSchema(pettyCashTransactions).omit({ id: true, createdAt: true });
export type InsertPettyCashTransaction = z.infer<typeof insertPettyCashTransactionSchema>;
export type PettyCashTransaction = typeof pettyCashTransactions.$inferSelect;

export const whiteLabelSettings = pgTable("white_label_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull().unique(),
  subdomain: text("subdomain").unique(),
  brandName: text("brand_name"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  primaryColor: text("primary_color").default("#fb9678"),
  secondaryColor: text("secondary_color").default("#03c9d7"),
  accentColor: text("accent_color").default("#fec90f"),
  loginBgColor: text("login_bg_color").default("#fff5f0"),
  sidebarColor: text("sidebar_color").default("#ffffff"),
  footerText: text("footer_text"),
  supportEmail: text("support_email"),
  supportPhone: text("support_phone"),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWhiteLabelSettingsSchema = createInsertSchema(whiteLabelSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWhiteLabelSettings = z.infer<typeof insertWhiteLabelSettingsSchema>;
export type WhiteLabelSettings = typeof whiteLabelSettings.$inferSelect;

export const depositReceipts = pgTable("deposit_receipts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  depositNo: text("deposit_no").notNull(),
  depositDate: date("deposit_date").notNull(),
  customerId: integer("customer_id").references(() => contacts.id),
  customerCode: text("customer_code"),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerTaxId: text("customer_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  description: text("description"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  usedAmount: decimal("used_amount", { precision: 15, scale: 2 }).default("0"),
  remainingAmount: decimal("remaining_amount", { precision: 15, scale: 2 }).default("0"),
  depositStatus: text("deposit_status").notNull().default("available"),
  status: text("status").notNull().default("draft"),
  paymentMethod: text("payment_method"),
  priceMode: text("price_mode").default("excluded"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  docPrefix: text("doc_prefix").default("DP"),
  notes: text("notes"),
  linkJournal: boolean("link_journal").default(false),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDepositReceiptSchema = createInsertSchema(depositReceipts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDepositReceipt = z.infer<typeof insertDepositReceiptSchema>;
export type DepositReceipt = typeof depositReceipts.$inferSelect;

export const depositDeductions = pgTable("deposit_deductions", {
  id: serial("id").primaryKey(),
  depositReceiptId: integer("deposit_receipt_id").references(() => depositReceipts.id).notNull(),
  documentType: text("document_type").notNull(),
  documentId: integer("document_id").notNull(),
  documentNo: text("document_no"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  deductedAt: timestamp("deducted_at").defaultNow(),
});

export const insertDepositDeductionSchema = createInsertSchema(depositDeductions).omit({ id: true, deductedAt: true });
export type InsertDepositDeduction = z.infer<typeof insertDepositDeductionSchema>;
export type DepositDeduction = typeof depositDeductions.$inferSelect;

export const salesCreditNotes = pgTable("sales_credit_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  creditNoteNo: text("credit_note_no").notNull(),
  creditNoteDate: date("credit_note_date").notNull(),
  customerId: integer("customer_id").references(() => contacts.id),
  customerCode: text("customer_code"),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  customerTaxId: text("customer_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  refTaxInvoiceId: integer("ref_tax_invoice_id").references(() => taxInvoices.id),
  refTaxInvoiceNo: text("ref_tax_invoice_no"),
  refTaxInvoiceDate: date("ref_tax_invoice_date"),
  reason: text("reason"),
  reasonDetail: text("reason_detail"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  priceMode: text("price_mode").default("excluded"),
  paymentMethod: text("payment_method").default("เครดิต"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  docPrefix: text("doc_prefix").default("CN"),
  notes: text("notes"),
  originalInvoiceAmount: decimal("original_invoice_amount", { precision: 15, scale: 2 }),
  correctInvoiceAmount: decimal("correct_invoice_amount", { precision: 15, scale: 2 }),
  linkJournal: boolean("link_journal").default(false),
  shareToken: text("share_token"),
  etaxSentAt: timestamp("etax_sent_at"),
  etaxSentTo: text("etax_sent_to"),
  etaxSentCc: text("etax_sent_cc"),
  etaxMessageId: text("etax_message_id"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSalesCreditNoteSchema = createInsertSchema(salesCreditNotes).omit({ id: true, createdAt: true, updatedAt: true, etaxSentAt: true, etaxSentTo: true, etaxSentCc: true, etaxMessageId: true });
export type InsertSalesCreditNote = z.infer<typeof insertSalesCreditNoteSchema>;
export type SalesCreditNote = typeof salesCreditNotes.$inferSelect;

export const salesCreditNoteItems = pgTable("sales_credit_note_items", {
  id: serial("id").primaryKey(),
  creditNoteId: integer("credit_note_id").references(() => salesCreditNotes.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
});

export const insertSalesCreditNoteItemSchema = createInsertSchema(salesCreditNoteItems).omit({ id: true });
export type InsertSalesCreditNoteItem = z.infer<typeof insertSalesCreditNoteItemSchema>;
export type SalesCreditNoteItem = typeof salesCreditNoteItems.$inferSelect;

export const purchaseDebitNotes = pgTable("purchase_debit_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  debitNoteNo: text("debit_note_no").notNull(),
  debitNoteDate: date("debit_note_date").notNull(),
  vendorId: integer("vendor_id").references(() => contacts.id),
  vendorCode: text("vendor_code"),
  vendorName: text("vendor_name").notNull(),
  vendorAddress: text("vendor_address"),
  vendorTaxId: text("vendor_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  refPurchaseInvoiceId: integer("ref_purchase_invoice_id").references(() => purchaseInvoices.id),
  refPurchaseInvoiceNo: text("ref_purchase_invoice_no"),
  refPurchaseInvoiceDate: date("ref_purchase_invoice_date"),
  refExpenseId: integer("ref_expense_id"),
  refExpenseNo: text("ref_expense_no"),
  reason: text("reason"),
  reasonDetail: text("reason_detail"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  priceMode: text("price_mode").default("excluded"),
  paymentMethod: text("payment_method").default("เครดิต"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  docPrefix: text("doc_prefix").default("DN"),
  notes: text("notes"),
  linkJournal: boolean("link_journal").default(false),
  showInTaxReport: boolean("show_in_tax_report").default(true),
  taxInvoiceRef: text("tax_invoice_ref"),
  batchId: integer("batch_id").references(() => expenseDailyBatches.id),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPurchaseDebitNoteSchema = createInsertSchema(purchaseDebitNotes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchaseDebitNote = z.infer<typeof insertPurchaseDebitNoteSchema>;
export type PurchaseDebitNote = typeof purchaseDebitNotes.$inferSelect;

export const purchaseDebitNoteItems = pgTable("purchase_debit_note_items", {
  id: serial("id").primaryKey(),
  debitNoteId: integer("debit_note_id").references(() => purchaseDebitNotes.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 4 }).notNull().default("1"),
  unit: text("unit").default("ชิ้น"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 15, scale: 2 }).default("0"),
  discountType: text("discount_type").default("amount"),
  total: decimal("total", { precision: 15, scale: 2 }).notNull(),
  vatType: text("vat_type").default("vat7"),
});

export const insertPurchaseDebitNoteItemSchema = createInsertSchema(purchaseDebitNoteItems).omit({ id: true });
export type InsertPurchaseDebitNoteItem = z.infer<typeof insertPurchaseDebitNoteItemSchema>;
export type PurchaseDebitNoteItem = typeof purchaseDebitNoteItems.$inferSelect;

export const purchaseDeposits = pgTable("purchase_deposits", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  depositNo: text("deposit_no").notNull(),
  depositDate: date("deposit_date").notNull(),
  vendorId: integer("vendor_id").references(() => contacts.id),
  vendorCode: text("vendor_code"),
  vendorName: text("vendor_name").notNull(),
  vendorAddress: text("vendor_address"),
  vendorTaxId: text("vendor_tax_id"),
  branch: text("branch"),
  sellerBranchId: text("seller_branch_id"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  description: text("description"),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  usedAmount: decimal("used_amount", { precision: 15, scale: 2 }).default("0"),
  remainingAmount: decimal("remaining_amount", { precision: 15, scale: 2 }).default("0"),
  depositStatus: text("deposit_status").notNull().default("available"),
  status: text("status").notNull().default("draft"),
  paymentMethod: text("payment_method"),
  priceMode: text("price_mode").default("excluded"),
  currencyCode: text("currency_code").default("THB"),
  exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }).default("1"),
  docPrefix: text("doc_prefix").default("PDP"),
  notes: text("notes"),
  linkJournal: boolean("link_journal").default(false),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPurchaseDepositSchema = createInsertSchema(purchaseDeposits).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchaseDeposit = z.infer<typeof insertPurchaseDepositSchema>;
export type PurchaseDeposit = typeof purchaseDeposits.$inferSelect;

export const purchaseDepositDeductions = pgTable("purchase_deposit_deductions", {
  id: serial("id").primaryKey(),
  purchaseDepositId: integer("purchase_deposit_id").references(() => purchaseDeposits.id).notNull(),
  documentType: text("document_type").notNull(),
  documentId: integer("document_id").notNull(),
  documentNo: text("document_no"),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  deductedAt: timestamp("deducted_at").defaultNow(),
});

export const insertPurchaseDepositDeductionSchema = createInsertSchema(purchaseDepositDeductions).omit({ id: true, deductedAt: true });
export type InsertPurchaseDepositDeduction = z.infer<typeof insertPurchaseDepositDeductionSchema>;
export type PurchaseDepositDeduction = typeof purchaseDepositDeductions.$inferSelect;

export const workStatusBoards = pgTable("work_status_boards", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  name: text("name").notNull().default("ติดตามสถานะงานบัญชี"),
  month: integer("month").notNull(),
  yearBe: integer("year_be").notNull(),
  deadlineDay: integer("deadline_day").default(15),
  notifyDaysBefore: integer("notify_days_before").default(3),
  deadlineDayPnd: integer("deadline_day_pnd").default(7),
  notifyDaysBeforePnd: integer("notify_days_before_pnd").default(3),
  deadlineDayVat: integer("deadline_day_vat").default(15),
  notifyDaysBeforeVat: integer("notify_days_before_vat").default(3),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkStatusBoardSchema = createInsertSchema(workStatusBoards).omit({ id: true, createdAt: true });
export type InsertWorkStatusBoard = z.infer<typeof insertWorkStatusBoardSchema>;
export type WorkStatusBoard = typeof workStatusBoards.$inferSelect;

export const workStatusColumns = pgTable("work_status_columns", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workStatusBoards.id).notNull(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  fieldType: text("field_type").notNull().default("status"),
  sortOrder: integer("sort_order").notNull().default(0),
  required: boolean("required").default(false),
  isSubitem: boolean("is_subitem").notNull().default(false),
});

export const insertWorkStatusColumnSchema = createInsertSchema(workStatusColumns).omit({ id: true });
export type InsertWorkStatusColumn = z.infer<typeof insertWorkStatusColumnSchema>;
export type WorkStatusColumn = typeof workStatusColumns.$inferSelect;

export const workStatusGroups = pgTable("work_status_groups", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workStatusBoards.id).notNull(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#05b187"),
  sortOrder: integer("sort_order").notNull().default(0),
  isCollapsed: boolean("is_collapsed").notNull().default(false),
});

export const insertWorkStatusGroupSchema = createInsertSchema(workStatusGroups).omit({ id: true });
export type InsertWorkStatusGroup = z.infer<typeof insertWorkStatusGroupSchema>;
export type WorkStatusGroup = typeof workStatusGroups.$inferSelect;

export const workStatusRows = pgTable("work_status_rows", {
  id: serial("id").primaryKey(),
  boardId: integer("board_id").references(() => workStatusBoards.id).notNull(),
  groupId: integer("group_id"),
  firmClientId: integer("firm_client_id").references(() => firmClients.id),
  parentRowId: integer("parent_row_id"),
  label: text("label"),
  sortOrder: integer("sort_order").notNull().default(0),
  assignedEmployeeId: integer("assigned_employee_id").references(() => employees.id),
  deadline: date("deadline"),
  overallStatus: text("overall_status").notNull().default("not_started"),
  employeeNote: text("employee_note"),
  managerNote: text("manager_note"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkStatusRowSchema = createInsertSchema(workStatusRows).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkStatusRow = z.infer<typeof insertWorkStatusRowSchema>;
export type WorkStatusRow = typeof workStatusRows.$inferSelect;

export const workStatusCells = pgTable("work_status_cells", {
  id: serial("id").primaryKey(),
  rowId: integer("row_id").references(() => workStatusRows.id).notNull(),
  columnId: integer("column_id").references(() => workStatusColumns.id).notNull(),
  valueText: text("value_text"),
  valueDate: date("value_date"),
  valueBool: boolean("value_bool"),
  valueStatus: text("value_status"),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertWorkStatusCellSchema = createInsertSchema(workStatusCells).omit({ id: true, updatedAt: true });
export type InsertWorkStatusCell = z.infer<typeof insertWorkStatusCellSchema>;
export type WorkStatusCell = typeof workStatusCells.$inferSelect;

export const workStatusAttachments = pgTable("work_status_attachments", {
  id: serial("id").primaryKey(),
  cellId: integer("cell_id").references(() => workStatusCells.id),
  rowId: integer("row_id").references(() => workStatusRows.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertWorkStatusAttachmentSchema = createInsertSchema(workStatusAttachments).omit({ id: true, uploadedAt: true });
export type InsertWorkStatusAttachment = z.infer<typeof insertWorkStatusAttachmentSchema>;
export type WorkStatusAttachment = typeof workStatusAttachments.$inferSelect;

export const firmFolders = pgTable("firm_folders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  companyId: integer("company_id").references(() => companies.id),
  parentId: integer("parent_id"),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFirmFolderSchema = createInsertSchema(firmFolders).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFirmFolder = z.infer<typeof insertFirmFolderSchema>;
export type FirmFolder = typeof firmFolders.$inferSelect;

export const firmDocuments = pgTable("firm_documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  companyId: integer("company_id").references(() => companies.id),
  folderId: integer("folder_id").references(() => firmFolders.id),
  category: text("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  fileUrl: text("file_url"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  linkUrl: text("link_url"),
  linkType: text("link_type"),
  sortOrder: integer("sort_order").default(0),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFirmDocumentSchema = createInsertSchema(firmDocuments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFirmDocument = z.infer<typeof insertFirmDocumentSchema>;
export type FirmDocument = typeof firmDocuments.$inferSelect;

// ============ Client Upload Links ============

export const clientUploadLinks = pgTable("client_upload_links", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  firmClientId: integer("firm_client_id").references(() => firmClients.id),
  token: text("token").notNull().unique(),
  label: text("label"),
  month: integer("month"),
  year: integer("year"),
  isActive: boolean("is_active").notNull().default(true),
  maxFiles: integer("max_files").default(50),
  allowedTypes: text("allowed_types"),
  expiresAt: timestamp("expires_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClientUploadLinkSchema = createInsertSchema(clientUploadLinks).omit({ id: true, createdAt: true });
export type InsertClientUploadLink = z.infer<typeof insertClientUploadLinkSchema>;
export type ClientUploadLink = typeof clientUploadLinks.$inferSelect;

export const clientUploadFiles = pgTable("client_upload_files", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").references(() => clientUploadLinks.id, { onDelete: "cascade" }).notNull(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  firmClientId: integer("firm_client_id").references(() => firmClients.id),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  objectPath: text("object_path").notNull(),
  folderPath: text("folder_path"),
  category: text("category").default("อื่นๆ"),
  uploaderName: text("uploader_name"),
  uploaderNote: text("uploader_note"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  source: text("source").default("link"),
});

export const insertClientUploadFileSchema = createInsertSchema(clientUploadFiles).omit({ id: true, createdAt: true });
export type InsertClientUploadFile = z.infer<typeof insertClientUploadFileSchema>;
export type ClientUploadFile = typeof clientUploadFiles.$inferSelect;

// ============ Accounting Management Tools ============

export const closedPeriods = pgTable("closed_periods", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  periodType: text("period_type").notNull(), // 'monthly' | 'yearly' | 'vat'
  month: integer("month"),
  year: integer("year").notNull(),
  closedAt: timestamp("closed_at").defaultNow(),
  closedBy: integer("closed_by").references(() => users.id),
  journalEntryId: integer("journal_entry_id").references(() => journalEntries.id),
  notes: text("notes"),
});

export const insertClosedPeriodSchema = createInsertSchema(closedPeriods).omit({ id: true, closedAt: true });
export type InsertClosedPeriod = z.infer<typeof insertClosedPeriodSchema>;
export type ClosedPeriod = typeof closedPeriods.$inferSelect;

export const accountingMgmtLogs = pgTable("accounting_mgmt_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  toolName: text("tool_name").notNull(),
  params: text("params"),
  result: text("result"),
  affectedCount: integer("affected_count").default(0),
  runBy: integer("run_by").references(() => users.id),
  runAt: timestamp("run_at").defaultNow(),
});

export const insertAccountingMgmtLogSchema = createInsertSchema(accountingMgmtLogs).omit({ id: true, runAt: true });
export type InsertAccountingMgmtLog = z.infer<typeof insertAccountingMgmtLogSchema>;
export type AccountingMgmtLog = typeof accountingMgmtLogs.$inferSelect;

// ============ Restaurant POS Module ============

export const restaurantAreas = pgTable("restaurant_areas", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
});

export const insertRestaurantAreaSchema = createInsertSchema(restaurantAreas).omit({ id: true });
export type InsertRestaurantArea = z.infer<typeof insertRestaurantAreaSchema>;
export type RestaurantArea = typeof restaurantAreas.$inferSelect;

export const restaurantTables = pgTable("restaurant_tables", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  areaId: integer("area_id").references(() => restaurantAreas.id),
  name: text("name").notNull(),
  capacity: integer("capacity").default(4),
  status: text("status").notNull().default("available"), // available, occupied, reserved, cleaning
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
});

export const insertRestaurantTableSchema = createInsertSchema(restaurantTables).omit({ id: true });
export type InsertRestaurantTable = z.infer<typeof insertRestaurantTableSchema>;
export type RestaurantTable = typeof restaurantTables.$inferSelect;

export const menuCategories = pgTable("menu_categories", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").default(0),
  active: boolean("active").notNull().default(true),
});

export const insertMenuCategorySchema = createInsertSchema(menuCategories).omit({ id: true });
export type InsertMenuCategory = z.infer<typeof insertMenuCategorySchema>;
export type MenuCategory = typeof menuCategories.$inferSelect;

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  categoryId: integer("category_id").references(() => menuCategories.id),
  name: text("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 15, scale: 2 }).notNull(),
  imageUrl: text("image_url"),
  available: boolean("available").notNull().default(true),
  sortOrder: integer("sort_order").default(0),
  productId: integer("product_id").references(() => products.id),
});

export const insertMenuItemSchema = createInsertSchema(menuItems).omit({ id: true });
export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type MenuItem = typeof menuItems.$inferSelect;

export const menuModifierGroups = pgTable("menu_modifier_groups", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  required: boolean("required").notNull().default(false),
  multiSelect: boolean("multi_select").notNull().default(true),
  maxSelect: integer("max_select"),
});

export const insertMenuModifierGroupSchema = createInsertSchema(menuModifierGroups).omit({ id: true });
export type InsertMenuModifierGroup = z.infer<typeof insertMenuModifierGroupSchema>;
export type MenuModifierGroup = typeof menuModifierGroups.$inferSelect;

export const menuModifierOptions = pgTable("menu_modifier_options", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => menuModifierGroups.id).notNull(),
  name: text("name").notNull(),
  priceAdjust: decimal("price_adjust", { precision: 15, scale: 2 }).default("0"),
  sortOrder: integer("sort_order").default(0),
});

export const insertMenuModifierOptionSchema = createInsertSchema(menuModifierOptions).omit({ id: true });
export type InsertMenuModifierOption = z.infer<typeof insertMenuModifierOptionSchema>;
export type MenuModifierOption = typeof menuModifierOptions.$inferSelect;

export const menuItemModifiers = pgTable("menu_item_modifiers", {
  id: serial("id").primaryKey(),
  menuItemId: integer("menu_item_id").references(() => menuItems.id).notNull(),
  modifierGroupId: integer("modifier_group_id").references(() => menuModifierGroups.id).notNull(),
});

export const insertMenuItemModifierSchema = createInsertSchema(menuItemModifiers).omit({ id: true });
export type InsertMenuItemModifier = z.infer<typeof insertMenuItemModifierSchema>;
export type MenuItemModifier = typeof menuItemModifiers.$inferSelect;

export const restaurantOrders = pgTable("restaurant_orders", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  sessionId: integer("session_id").references(() => posSessions.id),
  tableId: integer("table_id").references(() => restaurantTables.id),
  orderNo: text("order_no").notNull(),
  status: text("status").notNull().default("open"), // open, preparing, served, billed, paid, cancelled
  guestCount: integer("guest_count").default(1),
  subtotal: decimal("subtotal", { precision: 15, scale: 2 }).default("0"),
  serviceCharge: decimal("service_charge", { precision: 15, scale: 2 }).default("0"),
  serviceChargeRate: decimal("service_charge_rate", { precision: 5, scale: 2 }).default("0"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0"),
  vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).default("0"),
  total: decimal("total", { precision: 15, scale: 2 }).default("0"),
  note: text("note"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  paidAt: timestamp("paid_at"),
});

export const insertRestaurantOrderSchema = createInsertSchema(restaurantOrders).omit({ id: true, createdAt: true, paidAt: true });
export type InsertRestaurantOrder = z.infer<typeof insertRestaurantOrderSchema>;
export type RestaurantOrder = typeof restaurantOrders.$inferSelect;

export const restaurantOrderItems = pgTable("restaurant_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => restaurantOrders.id).notNull(),
  menuItemId: integer("menu_item_id").references(() => menuItems.id).notNull(),
  menuItemName: text("menu_item_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  modifiers: text("modifiers"),
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending, preparing, ready, served, cancelled
  sentToKitchenAt: timestamp("sent_to_kitchen_at"),
  servedAt: timestamp("served_at"),
});

export const insertRestaurantOrderItemSchema = createInsertSchema(restaurantOrderItems).omit({ id: true, sentToKitchenAt: true, servedAt: true });
export type InsertRestaurantOrderItem = z.infer<typeof insertRestaurantOrderItemSchema>;
export type RestaurantOrderItem = typeof restaurantOrderItems.$inferSelect;

export const kitchenTickets = pgTable("kitchen_tickets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  orderId: integer("order_id").references(() => restaurantOrders.id).notNull(),
  tableName: text("table_name"),
  status: text("status").notNull().default("new"), // new, in_progress, done
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertKitchenTicketSchema = createInsertSchema(kitchenTickets).omit({ id: true, createdAt: true, completedAt: true });
export type InsertKitchenTicket = z.infer<typeof insertKitchenTicketSchema>;
export type KitchenTicket = typeof kitchenTickets.$inferSelect;

export const billSplits = pgTable("bill_splits", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => restaurantOrders.id).notNull(),
  splitLabel: text("split_label").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").default("เงินสด"),
  paid: boolean("paid").notNull().default(false),
});

export const insertBillSplitSchema = createInsertSchema(billSplits).omit({ id: true });
export type InsertBillSplit = z.infer<typeof insertBillSplitSchema>;
export type BillSplit = typeof billSplits.$inferSelect;

export const tenantPlatformCredentials = pgTable("tenant_platform_credentials", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  platform: text("platform").notNull(),
  appId: text("app_id").notNull(),
  appSecret: text("app_secret").notNull(),
  redirectUrl: text("redirect_url"),
  region: text("region").default("TH"),
  sandbox: boolean("sandbox").notNull().default(false),
  extra: text("extra"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantPlatformCredentialSchema = createInsertSchema(tenantPlatformCredentials).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantPlatformCredential = z.infer<typeof insertTenantPlatformCredentialSchema>;
export type TenantPlatformCredential = typeof tenantPlatformCredentials.$inferSelect;


export const packingCameras = pgTable("packing_cameras", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  rtspUrl: text("rtsp_url").notNull(),
  snapshotUrl: text("snapshot_url"),
  stationName: text("station_name"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPackingCameraSchema = createInsertSchema(packingCameras).omit({ id: true, createdAt: true });
export type InsertPackingCamera = z.infer<typeof insertPackingCameraSchema>;
export type PackingCamera = typeof packingCameras.$inferSelect;

export const packingRecordings = pgTable("packing_recordings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id, { onDelete: "cascade" }).notNull(),
  cameraId: integer("camera_id").references(() => packingCameras.id, { onDelete: "cascade" }).notNull(),
  orderId: integer("order_id").references(() => ecommerceOrders.id, { onDelete: "cascade" }),
  orderNo: text("order_no"),
  operatorId: integer("operator_id").references(() => users.id),
  operatorName: text("operator_name"),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  duration: integer("duration"),
  snapshotPath: text("snapshot_path"),
  videoPath: text("video_path"),
  status: text("status").default("recording"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPackingRecordingSchema = createInsertSchema(packingRecordings).omit({ id: true, createdAt: true });
export type InsertPackingRecording = z.infer<typeof insertPackingRecordingSchema>;
export type PackingRecording = typeof packingRecordings.$inferSelect;

// ============ Warehouse Bin Location System ============
export const warehouseZones = pgTable("warehouse_zones", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  zoneType: text("zone_type").default("storage"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertWarehouseZoneSchema = createInsertSchema(warehouseZones).omit({ id: true, createdAt: true });
export type WarehouseZone = typeof warehouseZones.$inferSelect;

export const warehouseBins = pgTable("warehouse_bins", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id).notNull(),
  zoneId: integer("zone_id").references(() => warehouseZones.id).notNull(),
  code: text("code").notNull(),
  aisle: text("aisle"),
  shelf: text("shelf"),
  level: text("level"),
  position: text("position"),
  fullPath: text("full_path"),
  maxCapacity: integer("max_capacity"),
  currentQty: integer("current_qty").default(0),
  binType: text("bin_type").default("storage"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertWarehouseBinSchema = createInsertSchema(warehouseBins).omit({ id: true, createdAt: true });
export type WarehouseBin = typeof warehouseBins.$inferSelect;

export const productBinAssignments = pgTable("product_bin_assignments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  binId: integer("bin_id").references(() => warehouseBins.id).notNull(),
  qty: integer("qty").default(0),
  minQty: integer("min_qty").default(0),
  maxQty: integer("max_qty"),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertProductBinSchema = createInsertSchema(productBinAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export type ProductBinAssignment = typeof productBinAssignments.$inferSelect;

// ============ Wave/Batch Picking ============
export const pickingWaves = pgTable("picking_waves", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  waveNo: text("wave_no").notNull(),
  waveType: text("wave_type").default("manual"),
  status: text("status").default("draft"),
  priority: integer("priority").default(0),
  shippingCutoff: timestamp("shipping_cutoff"),
  carrier: text("carrier"),
  totalOrders: integer("total_orders").default(0),
  totalItems: integer("total_items").default(0),
  pickedItems: integer("picked_items").default(0),
  assignedTo: integer("assigned_to").references(() => users.id),
  assignedName: text("assigned_name"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertPickingWaveSchema = createInsertSchema(pickingWaves).omit({ id: true, createdAt: true });
export type PickingWave = typeof pickingWaves.$inferSelect;

export const pickingWaveItems = pgTable("picking_wave_items", {
  id: serial("id").primaryKey(),
  waveId: integer("wave_id").references(() => pickingWaves.id, { onDelete: "cascade" }).notNull(),
  orderId: integer("order_id").references(() => ecommerceOrders.id),
  orderNo: text("order_no"),
  productId: integer("product_id").references(() => products.id),
  productName: text("product_name"),
  sku: text("sku"),
  qty: integer("qty").default(1),
  pickedQty: integer("picked_qty").default(0),
  binId: integer("bin_id").references(() => warehouseBins.id),
  binCode: text("bin_code"),
  status: text("status").default("pending"),
  pickedAt: timestamp("picked_at"),
  pickedBy: integer("picked_by").references(() => users.id),
  sortOrder: integer("sort_order").default(0),
});
export const insertPickingWaveItemSchema = createInsertSchema(pickingWaveItems).omit({ id: true });
export type PickingWaveItem = typeof pickingWaveItems.$inferSelect;

// ============ Chat Auto-Reply Rules ============
export const chatAutoRules = pgTable("chat_auto_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  platform: text("platform").default("all"),
  triggerType: text("trigger_type").default("keyword"),
  keywords: text("keywords").array(),
  matchType: text("match_type").default("contains"),
  replyMessage: text("reply_message").notNull(),
  replyType: text("reply_type").default("text"),
  isActive: boolean("is_active").default(true),
  priority: integer("priority").default(0),
  schedule: text("schedule"),
  triggerCount: integer("trigger_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertChatAutoRuleSchema = createInsertSchema(chatAutoRules).omit({ id: true, createdAt: true, updatedAt: true, triggerCount: true });
export type ChatAutoRule = typeof chatAutoRules.$inferSelect;

export const reviewAutoReplies = pgTable("review_auto_replies", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  platform: text("platform").default("shopee"),
  starRating: integer("star_rating").notNull(),
  replyMessage: text("reply_message").notNull(),
  isActive: boolean("is_active").default(true),
  triggerCount: integer("trigger_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertReviewAutoReplySchema = createInsertSchema(reviewAutoReplies).omit({ id: true, createdAt: true, triggerCount: true });
export type ReviewAutoReply = typeof reviewAutoReplies.$inferSelect;

// ============ Real-time Stock Sync ============
export const stockSyncSettings = pgTable("stock_sync_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id),
  platform: text("platform").notNull(),
  isEnabled: boolean("is_enabled").default(false),
  syncMode: text("sync_mode").default("manual"),
  syncInterval: integer("sync_interval").default(15),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status"),
  lastSyncError: text("last_sync_error"),
  totalSynced: integer("total_synced").default(0),
  totalFailed: integer("total_failed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertStockSyncSettingSchema = createInsertSchema(stockSyncSettings).omit({ id: true, createdAt: true });
export type StockSyncSetting = typeof stockSyncSettings.$inferSelect;

export const stockSyncLogs = pgTable("stock_sync_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  platform: text("platform").notNull(),
  direction: text("direction").default("push"),
  productId: integer("product_id"),
  sku: text("sku"),
  productName: text("product_name"),
  previousQty: integer("previous_qty"),
  newQty: integer("new_qty"),
  status: text("status").default("success"),
  errorMessage: text("error_message"),
  triggeredBy: text("triggered_by").default("system"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type StockSyncLog = typeof stockSyncLogs.$inferSelect;

// ============ Supplier Portal ============
export const supplierPortalTokens = pgTable("supplier_portal_tokens", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  contactId: integer("contact_id").references(() => contacts.id).notNull(),
  token: text("token").notNull().unique(),
  email: text("email"),
  isActive: boolean("is_active").default(true),
  lastAccessAt: timestamp("last_access_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type SupplierPortalToken = typeof supplierPortalTokens.$inferSelect;

export const supplierQuotes = pgTable("supplier_quotes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  contactId: integer("contact_id").references(() => contacts.id).notNull(),
  poId: integer("po_id").references(() => purchaseOrders.id),
  quoteNo: text("quote_no"),
  status: text("status").default("pending"),
  totalAmount: text("total_amount"),
  currency: text("currency").default("THB"),
  validUntil: timestamp("valid_until"),
  notes: text("notes"),
  submittedAt: timestamp("submitted_at"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: integer("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertSupplierQuoteSchema = createInsertSchema(supplierQuotes).omit({ id: true, createdAt: true });
export type SupplierQuote = typeof supplierQuotes.$inferSelect;

export const supplierQuoteItems = pgTable("supplier_quote_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").references(() => supplierQuotes.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productName: text("product_name"),
  sku: text("sku"),
  qty: integer("qty").default(1),
  unitPrice: text("unit_price"),
  totalPrice: text("total_price"),
  leadTimeDays: integer("lead_time_days"),
  notes: text("notes"),
});
export type SupplierQuoteItem = typeof supplierQuoteItems.$inferSelect;

// ============ AI Analytics / Demand Forecasting ============
export const demandForecasts = pgTable("demand_forecasts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id),
  sku: text("sku"),
  productName: text("product_name"),
  forecastDate: timestamp("forecast_date").notNull(),
  forecastQty: integer("forecast_qty").notNull(),
  actualQty: integer("actual_qty"),
  confidence: text("confidence"),
  method: text("method").default("moving_average"),
  periodType: text("period_type").default("weekly"),
  platform: text("platform"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type DemandForecast = typeof demandForecasts.$inferSelect;

// ============ Lucky Draw / จับรางวัล ============

export const luckyDrawCampaigns = pgTable("lucky_draw_campaigns", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  sessionId: integer("session_id").references(() => liveSessions.id),
  title: text("title").notNull(),
  description: text("description"),
  conditionType: text("condition_type").notNull().default("min_spending"),
  conditionValue: decimal("condition_value", { precision: 15, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("draft"),
  drawnAt: timestamp("drawn_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLuckyDrawCampaignSchema = createInsertSchema(luckyDrawCampaigns).omit({ id: true, createdAt: true });
export type InsertLuckyDrawCampaign = z.infer<typeof insertLuckyDrawCampaignSchema>;
export type LuckyDrawCampaign = typeof luckyDrawCampaigns.$inferSelect;

export const luckyDrawPrizes = pgTable("lucky_draw_prizes", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => luckyDrawCampaigns.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  quantity: integer("quantity").notNull().default(1),
  sortOrder: integer("sort_order").default(0),
});

export const insertLuckyDrawPrizeSchema = createInsertSchema(luckyDrawPrizes).omit({ id: true });
export type InsertLuckyDrawPrize = z.infer<typeof insertLuckyDrawPrizeSchema>;
export type LuckyDrawPrize = typeof luckyDrawPrizes.$inferSelect;

export const luckyDrawEntries = pgTable("lucky_draw_entries", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").references(() => luckyDrawCampaigns.id, { onDelete: "cascade" }).notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerSocial: text("customer_social"),
  cfOrderId: integer("cf_order_id").references(() => liveCfOrders.id),
  totalSpending: decimal("total_spending", { precision: 15, scale: 2 }).default("0"),
  tickets: integer("tickets").notNull().default(1),
  isWinner: boolean("is_winner").default(false),
  prizeId: integer("prize_id").references(() => luckyDrawPrizes.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLuckyDrawEntrySchema = createInsertSchema(luckyDrawEntries).omit({ id: true, createdAt: true });
export type InsertLuckyDrawEntry = z.infer<typeof insertLuckyDrawEntrySchema>;
export type LuckyDrawEntry = typeof luckyDrawEntries.$inferSelect;

export const oauthStates = pgTable("oauth_states", {
  id: serial("id").primaryKey(),
  state: text("state").notNull().unique(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  platform: text("platform").notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  connectionId: integer("connection_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const syncJobQueue = pgTable("sync_job_queue", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id).notNull(),
  platform: text("platform").notNull(),
  syncType: text("sync_type").notNull().default("orders"),
  status: text("status").notNull().default("pending"),
  priority: integer("priority").notNull().default(0),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastError: text("last_error"),
  scheduledAt: timestamp("scheduled_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
  options: text("options"),
});

export const insertSyncJobSchema = createInsertSchema(syncJobQueue).omit({ id: true, createdAt: true, startedAt: true, completedAt: true });
export type InsertSyncJob = z.infer<typeof insertSyncJobSchema>;
export type SyncJob = typeof syncJobQueue.$inferSelect;

export const archiveEcommerceOrders = pgTable("archive_ecommerce_orders", {
  id: serial("id").primaryKey(),
  originalId: integer("original_id").notNull(),
  companyId: integer("company_id").notNull(),
  connectionId: integer("connection_id").notNull(),
  platform: text("platform").notNull(),
  platformOrderId: text("platform_order_id").notNull(),
  orderNo: text("order_no"),
  status: text("status").notNull(),
  buyerName: text("buyer_name"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }),
  trackingNo: text("tracking_no"),
  shippingProvider: text("shipping_provider"),
  placedAt: timestamp("placed_at"),
  deliveredAt: timestamp("delivered_at"),
  settlementStatus: text("settlement_status"),
  rawData: text("raw_data"),
  createdAt: timestamp("created_at"),
  archivedAt: timestamp("archived_at").defaultNow(),
});

export const archiveJournalEntries = pgTable("archive_journal_entries", {
  id: serial("id").primaryKey(),
  originalId: integer("original_id").notNull(),
  companyId: integer("company_id"),
  entryNo: text("entry_no"),
  entryDate: date("entry_date").notNull(),
  reference: text("reference"),
  description: text("description"),
  journalBook: text("journal_book"),
  status: text("status").notNull(),
  sourceDocType: text("source_doc_type"),
  sourceDocId: integer("source_doc_id"),
  createdAt: timestamp("created_at"),
  archivedAt: timestamp("archived_at").defaultNow(),
});

export const archiveJournalLines = pgTable("archive_journal_lines", {
  id: serial("id").primaryKey(),
  originalId: integer("original_id").notNull(),
  journalEntryId: integer("journal_entry_id").notNull(),
  archiveJournalEntryId: integer("archive_journal_entry_id"),
  accountId: integer("account_id").notNull(),
  description: text("description"),
  debit: decimal("debit", { precision: 15, scale: 2 }).default("0"),
  credit: decimal("credit", { precision: 15, scale: 2 }).default("0"),
  anchor: text("anchor"),
  archivedAt: timestamp("archived_at").defaultNow(),
});

export const archiveRuns = pgTable("archive_runs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  archiveType: text("archive_type").notNull(),
  cutoffDate: date("cutoff_date").notNull(),
  recordsArchived: integer("records_archived").notNull().default(0),
  status: text("status").notNull().default("running"),
  errorDetails: text("error_details"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertArchiveRunSchema = createInsertSchema(archiveRuns).omit({ id: true, startedAt: true, completedAt: true });
export type InsertArchiveRun = z.infer<typeof insertArchiveRunSchema>;
export type ArchiveRun = typeof archiveRuns.$inferSelect;

export const ftpArchiveSettings = pgTable("ftp_archive_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  ftpHost: text("ftp_host"),
  ftpPort: integer("ftp_port").default(21),
  ftpUser: text("ftp_user"),
  ftpPassword: text("ftp_password"),
  ftpProtocol: text("ftp_protocol").notNull().default("ftps"),
  ftpRemotePath: text("ftp_remote_path").default("/archive"),
  ftpPassive: boolean("ftp_passive").notNull().default(true),
  resumeEnabled: boolean("resume_enabled").notNull().default(true),
  scheduleTime1: text("schedule_time_1").default("02:00"),
  scheduleTime2: text("schedule_time_2").default("14:00"),
  timezone: text("timezone").default("Asia/Bangkok"),
  fileAgeMonths: integer("file_age_months").notNull().default(12),
  alertAfterDays: integer("alert_after_days").notNull().default(3),
  alertLineRecipientId: integer("alert_line_recipient_id"),
  ftpBaseUrl: text("ftp_base_url"),
  ftpLanBaseUrl: text("ftp_lan_base_url"),
  testMode: boolean("test_mode").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const insertFtpArchiveSettingsSchema = createInsertSchema(ftpArchiveSettings).omit({ id: true, updatedAt: true });
export type InsertFtpArchiveSettings = z.infer<typeof insertFtpArchiveSettingsSchema>;
export type FtpArchiveSettings = typeof ftpArchiveSettings.$inferSelect;

export const ftpArchiveJobs = pgTable("ftp_archive_jobs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("running"),
  totalFiles: integer("total_files").notNull().default(0),
  transferredFiles: integer("transferred_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  skippedFiles: integer("skipped_files").notNull().default(0),
  totalBytes: decimal("total_bytes", { precision: 20, scale: 0 }).default("0"),
  transferredBytes: decimal("transferred_bytes", { precision: 20, scale: 0 }).default("0"),
  errorSummary: text("error_summary"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const insertFtpArchiveJobSchema = createInsertSchema(ftpArchiveJobs).omit({ id: true, startedAt: true, completedAt: true });
export type InsertFtpArchiveJob = z.infer<typeof insertFtpArchiveJobSchema>;
export type FtpArchiveJob = typeof ftpArchiveJobs.$inferSelect;

export const ftpArchiveItems = pgTable("ftp_archive_items", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").references(() => ftpArchiveJobs.id, { onDelete: "cascade" }),
  sourceTable: text("source_table").notNull(),
  sourceId: integer("source_id").notNull(),
  sourceColumn: text("source_column").notNull(),
  localPath: text("local_path").notNull(),
  remotePath: text("remote_path"),
  fileSize: decimal("file_size", { precision: 20, scale: 0 }).default("0"),
  transferredSize: decimal("transferred_size", { precision: 20, scale: 0 }).default("0"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  firstAttemptAt: timestamp("first_attempt_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  originalUrl: text("original_url"),
  archivedUrl: text("archived_url"),
  verified: boolean("verified").notNull().default(false),
  linkUpdated: boolean("link_updated").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFtpArchiveItemSchema = createInsertSchema(ftpArchiveItems).omit({ id: true, createdAt: true });
export type InsertFtpArchiveItem = z.infer<typeof insertFtpArchiveItemSchema>;
export type FtpArchiveItem = typeof ftpArchiveItems.$inferSelect;

// ==================== Archive Folder Code Control Tables ====================

export const companyFolderCodes = pgTable("company_folder_codes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull().unique(),
  folderCode: text("folder_code").notNull().unique(),
  displayName: text("display_name").notNull(),
  taxId: text("tax_id"),
  active: boolean("active").notNull().default(true),
  dirty: boolean("dirty").notNull().default(true),
  version: integer("version").notNull().default(1),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCompanyFolderCodeSchema = createInsertSchema(companyFolderCodes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCompanyFolderCode = z.infer<typeof insertCompanyFolderCodeSchema>;
export type CompanyFolderCode = typeof companyFolderCodes.$inferSelect;

export const storeFolderCodes = pgTable("store_folder_codes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id).notNull().unique(),
  folderCode: text("folder_code").notNull(),
  displayName: text("display_name").notNull(),
  platform: text("platform"),
  active: boolean("active").notNull().default(true),
  dirty: boolean("dirty").notNull().default(true),
  version: integer("version").notNull().default(1),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertStoreFolderCodeSchema = createInsertSchema(storeFolderCodes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStoreFolderCode = z.infer<typeof insertStoreFolderCodeSchema>;
export type StoreFolderCode = typeof storeFolderCodes.$inferSelect;

// ==================== AI Live Commerce Agency ====================

export const liveAgencyClients = pgTable("live_agency_clients", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  clientName: text("client_name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  socialMedia: text("social_media"),
  platforms: text("platforms").array(),
  feeModel: text("fee_model").notNull().default("percent"),
  feeRate: decimal("fee_rate", { precision: 10, scale: 2 }).default("10"),
  feeFixedAmount: decimal("fee_fixed_amount", { precision: 12, scale: 2 }).default("0"),
  adBudgetDefault: decimal("ad_budget_default", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLiveAgencyClientSchema = createInsertSchema(liveAgencyClients).omit({ id: true, createdAt: true });
export type InsertLiveAgencyClient = z.infer<typeof insertLiveAgencyClientSchema>;
export type LiveAgencyClient = typeof liveAgencyClients.$inferSelect;

export const liveSessionMetrics = pgTable("live_session_metrics", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveSessions.id, { onDelete: "cascade" }).notNull(),
  capturedAt: timestamp("captured_at").defaultNow(),
  viewers: integer("viewers").default(0),
  peakViewers: integer("peak_viewers").default(0),
  newFollowers: integer("new_followers").default(0),
  comments: integer("comments").default(0),
  shares: integer("shares").default(0),
  likes: integer("likes").default(0),
  orders: integer("orders").default(0),
  revenue: decimal("revenue", { precision: 15, scale: 2 }).default("0"),
  adSpend: decimal("ad_spend", { precision: 12, scale: 2 }).default("0"),
  engagementRate: decimal("engagement_rate", { precision: 5, scale: 2 }).default("0"),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }).default("0"),
});

export const insertLiveSessionMetricSchema = createInsertSchema(liveSessionMetrics).omit({ id: true });
export type InsertLiveSessionMetric = z.infer<typeof insertLiveSessionMetricSchema>;
export type LiveSessionMetric = typeof liveSessionMetrics.$inferSelect;

export const liveAidaActions = pgTable("live_aida_actions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveSessions.id, { onDelete: "cascade" }).notNull(),
  stage: text("stage").notNull(),
  actionType: text("action_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("suggested"),
  priority: text("priority").default("medium"),
  aiConfidence: decimal("ai_confidence", { precision: 5, scale: 2 }),
  metadata: text("metadata"),
  appliedAt: timestamp("applied_at"),
  appliedBy: integer("applied_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLiveAidaActionSchema = createInsertSchema(liveAidaActions).omit({ id: true, createdAt: true });
export type InsertLiveAidaAction = z.infer<typeof insertLiveAidaActionSchema>;
export type LiveAidaAction = typeof liveAidaActions.$inferSelect;

export const liveSessionReports = pgTable("live_session_reports", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveSessions.id, { onDelete: "cascade" }).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  agencyClientId: integer("agency_client_id").references(() => liveAgencyClients.id),
  duration: integer("duration"),
  peakViewers: integer("peak_viewers").default(0),
  avgViewers: integer("avg_viewers").default(0),
  totalOrders: integer("total_orders").default(0),
  totalRevenue: decimal("total_revenue", { precision: 15, scale: 2 }).default("0"),
  totalProfit: decimal("total_profit", { precision: 15, scale: 2 }).default("0"),
  totalAdSpend: decimal("total_ad_spend", { precision: 12, scale: 2 }).default("0"),
  roas: decimal("roas", { precision: 8, scale: 2 }).default("0"),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }).default("0"),
  topProducts: text("top_products"),
  serviceFee: decimal("service_fee", { precision: 12, scale: 2 }).default("0"),
  aiSummary: text("ai_summary"),
  aiRecommendations: text("ai_recommendations"),
  comparisonJson: text("comparison_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLiveSessionReportSchema = createInsertSchema(liveSessionReports).omit({ id: true, createdAt: true });
export type InsertLiveSessionReport = z.infer<typeof insertLiveSessionReportSchema>;
export type LiveSessionReport = typeof liveSessionReports.$inferSelect;

export const liveAdBudgets = pgTable("live_ad_budgets", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => liveSessions.id, { onDelete: "cascade" }).notNull(),
  platform: text("platform").notNull(),
  suggestedAmount: decimal("suggested_amount", { precision: 12, scale: 2 }).notNull(),
  actualAmount: decimal("actual_amount", { precision: 12, scale: 2 }),
  rationale: text("rationale"),
  roas: decimal("roas", { precision: 8, scale: 2 }),
  status: text("status").notNull().default("suggested"),
  appliedAt: timestamp("applied_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLiveAdBudgetSchema = createInsertSchema(liveAdBudgets).omit({ id: true, createdAt: true });
export type InsertLiveAdBudget = z.infer<typeof insertLiveAdBudgetSchema>;
export type LiveAdBudget = typeof liveAdBudgets.$inferSelect;

export const evaluationPeriods = pgTable("evaluation_periods", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").notNull().default("draft"),
  criteria: jsonb("criteria").default("[]"),
  salaryRules: jsonb("salary_rules").default("[]"),
  salaryBudget: decimal("salary_budget", { precision: 14, scale: 2 }).default("0"),
  bonusBudget: decimal("bonus_budget", { precision: 14, scale: 2 }).default("0"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEvaluationPeriodSchema = createInsertSchema(evaluationPeriods).omit({ id: true, createdAt: true });
export type InsertEvaluationPeriod = z.infer<typeof insertEvaluationPeriodSchema>;
export type EvaluationPeriod = typeof evaluationPeriods.$inferSelect;

export const evaluationResults = pgTable("evaluation_results", {
  id: serial("id").primaryKey(),
  periodId: integer("period_id").references(() => evaluationPeriods.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  scores: jsonb("scores").default("[]"),
  totalScore: decimal("total_score", { precision: 5, scale: 2 }).default("0"),
  grade: text("grade"),
  aiSummary: text("ai_summary"),
  strengths: text("strengths"),
  improvements: text("improvements"),
  currentSalary: decimal("current_salary", { precision: 12, scale: 2 }).default("0"),
  recommendedIncrease: decimal("recommended_increase", { precision: 5, scale: 2 }).default("0"),
  newSalary: decimal("new_salary", { precision: 12, scale: 2 }).default("0"),
  bonusMonths: decimal("bonus_months", { precision: 4, scale: 2 }).default("0"),
  bonusAmount: decimal("bonus_amount", { precision: 12, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"),
  metricsData: jsonb("metrics_data").default("{}"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEvaluationResultSchema = createInsertSchema(evaluationResults).omit({ id: true, createdAt: true });
export type InsertEvaluationResult = z.infer<typeof insertEvaluationResultSchema>;
export type EvaluationResult = typeof evaluationResults.$inferSelect;

// ============ LINE Group Document Archive ============
export const lineGroupMappings = pgTable("line_group_mappings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  companyId: integer("company_id").references(() => companies.id),
  firmClientId: integer("firm_client_id").references(() => firmClients.id),
  lineGroupId: text("line_group_id").notNull(),
  groupName: text("group_name"),
  defaultDocumentType: text("default_document_type").default("auto"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLineGroupMappingSchema = createInsertSchema(lineGroupMappings).omit({ id: true, createdAt: true });
export type InsertLineGroupMapping = z.infer<typeof insertLineGroupMappingSchema>;
export type LineGroupMapping = typeof lineGroupMappings.$inferSelect;

export const lineDocClassifyRules = pgTable("line_doc_classify_rules", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name").notNull(),
  condition: text("condition").notNull(),
  conditionValue: text("condition_value"),
  targetCategory: text("target_category").notNull(),
  priority: integer("priority").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLineDocClassifyRuleSchema = createInsertSchema(lineDocClassifyRules).omit({ id: true, createdAt: true });
export type InsertLineDocClassifyRule = z.infer<typeof insertLineDocClassifyRuleSchema>;
export type LineDocClassifyRule = typeof lineDocClassifyRules.$inferSelect;

export const lineDocuments = pgTable("line_documents", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  companyId: integer("company_id").references(() => companies.id),
  firmClientId: integer("firm_client_id").references(() => firmClients.id),
  lineGroupId: text("line_group_id"),
  messageId: text("message_id"),
  senderUserId: text("sender_user_id"),
  senderName: text("sender_name"),
  fileType: text("file_type").notNull(),
  mimeType: text("mime_type"),
  originalFilename: text("original_filename"),
  fileSize: integer("file_size"),
  storageUrl: text("storage_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  category: text("category").default("other"),
  notes: text("notes"),
  documentDate: text("document_date"),
  documentDateSource: text("document_date_source"),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  readAt: timestamp("read_at"),
});

export const insertLineDocumentSchema = createInsertSchema(lineDocuments).omit({ id: true, createdAt: true, readAt: true });
export type InsertLineDocument = z.infer<typeof insertLineDocumentSchema>;
export type LineDocument = typeof lineDocuments.$inferSelect;

export const financialNotes = pgTable("financial_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  fiscalYear: integer("fiscal_year").notNull(),
  sections: jsonb("sections").notNull().default([]),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFinancialNotesSchema = createInsertSchema(financialNotes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFinancialNotes = z.infer<typeof insertFinancialNotesSchema>;
export type FinancialNotes = typeof financialNotes.$inferSelect;

export const financialStatementSettings = pgTable("financial_statement_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  signerName1: text("signer_name_1"),
  signerTitle1: text("signer_title_1"),
  signerName2: text("signer_name_2"),
  signerTitle2: text("signer_title_2"),
  auditorName: text("auditor_name"),
  auditorLicense: text("auditor_license"),
  businessStartDate: date("business_start_date"),
  businessType: text("business_type"),
  businessTypeDetail: text("business_type_detail"),
  fiscalYearEndMonth: integer("fiscal_year_end_month").notNull().default(12),
  fiscalYearEndDay: integer("fiscal_year_end_day").notNull().default(31),
  registeredCapital: decimal("registered_capital", { precision: 15, scale: 2 }),
  paidUpCapital: decimal("paid_up_capital", { precision: 15, scale: 2 }),
  shareParValue: decimal("share_par_value", { precision: 15, scale: 2 }),
  numberOfShares: integer("number_of_shares"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFinancialStatementSettingsSchema = createInsertSchema(financialStatementSettings).omit({ id: true, updatedAt: true });
export type InsertFinancialStatementSettings = z.infer<typeof insertFinancialStatementSettingsSchema>;
export type FinancialStatementSettings = typeof financialStatementSettings.$inferSelect;

export const financialStatementDrafts = pgTable("financial_statement_drafts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFinancialStatementDraftSchema = createInsertSchema(financialStatementDrafts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFinancialStatementDraft = z.infer<typeof insertFinancialStatementDraftSchema>;
export type FinancialStatementDraft = typeof financialStatementDrafts.$inferSelect;

export const ecommerceImportBatches = pgTable("ecommerce_import_batches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  platform: text("platform").notNull(),
  fileName: text("file_name"),
  importType: text("import_type").notNull().default("orders"),
  totalOrders: integer("total_orders").notNull().default(0),
  totalSkipped: integer("total_skipped").notNull().default(0),
  totalErrors: integer("total_errors").notNull().default(0),
  totalTaxInvoices: integer("total_tax_invoices").notNull().default(0),
  totalJournalEntries: integer("total_journal_entries").notNull().default(0),
  summaryData: text("summary_data"),
  status: text("status").notNull().default("active"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEcommerceImportBatchSchema = createInsertSchema(ecommerceImportBatches).omit({ id: true, createdAt: true });
export type InsertEcommerceImportBatch = z.infer<typeof insertEcommerceImportBatchSchema>;
export type EcommerceImportBatch = typeof ecommerceImportBatches.$inferSelect;

export const documentImportBatches = pgTable("document_import_batches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  docType: text("doc_type").notNull(),
  fileName: text("file_name"),
  totalCreated: integer("total_created").notNull().default(0),
  totalSkipped: integer("total_skipped").notNull().default(0),
  totalErrors: integer("total_errors").notNull().default(0),
  createdDocIds: text("created_doc_ids"),
  status: text("status").notNull().default("active"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDocumentImportBatchSchema = createInsertSchema(documentImportBatches).omit({ id: true, createdAt: true });
export type InsertDocumentImportBatch = z.infer<typeof insertDocumentImportBatchSchema>;
export type DocumentImportBatch = typeof documentImportBatches.$inferSelect;

export const vatProductDictionary = pgTable("vat_product_dictionary", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productName: text("product_name").notNull(),
  normalizedName: text("normalized_name").notNull(),
  vatType: text("vat_type").notNull().default("vat7"),
  source: text("source").notNull().default("manual"),
  confirmedBy: integer("confirmed_by").references(() => users.id),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVatProductDictionarySchema = createInsertSchema(vatProductDictionary).omit({ id: true, createdAt: true });
export type InsertVatProductDictionary = z.infer<typeof insertVatProductDictionarySchema>;
export type VatProductDictionary = typeof vatProductDictionary.$inferSelect;

export const landingContent = pgTable("landing_content", {
  id: serial("id").primaryKey(),
  sectionType: text("section_type").notNull(),
  title: text("title"),
  subtitle: text("subtitle"),
  items: jsonb("items").$type<any[]>().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const insertLandingContentSchema = createInsertSchema(landingContent).omit({ id: true, updatedAt: true });
export type InsertLandingContent = z.infer<typeof insertLandingContentSchema>;
export type LandingContent = typeof landingContent.$inferSelect;

export const schemaVersion = pgTable("schema_version", {
  id: serial("id").primaryKey(),
  version: text("version").notNull(),
  description: text("description").notNull(),
  upSql: text("up_sql").notNull(),
  downSql: text("down_sql").notNull(),
  appliedAt: timestamp("applied_at").defaultNow(),
});

export const session = pgTable("session", {
  sid: varchar("sid", { length: 255 }).primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

export const commissionRules = pgTable("commission_rules", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  module: text("module").notNull().default("pos"),
  name: text("name").notNull(),
  type: text("type").notNull().default("percentage"),
  rate: decimal("rate", { precision: 8, scale: 4 }).notNull().default("0"),
  perPieceRate: decimal("per_piece_rate", { precision: 10, scale: 2 }).default("0"),
  tiers: text("tiers"),
  basedOn: text("based_on").notNull().default("revenue"),
  appliesTo: text("applies_to").notNull().default("both"),
  assignScope: text("assign_scope").notNull().default("all"),
  assignedUserIds: integer("assigned_user_ids").array(),
  assignedProductIds: integer("assigned_product_ids").array(),
  docTypes: text("doc_types").array(),
  minTarget: decimal("min_target", { precision: 15, scale: 2 }).default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCommissionRuleSchema = createInsertSchema(commissionRules).omit({ id: true, createdAt: true });
export type InsertCommissionRule = z.infer<typeof insertCommissionRuleSchema>;
export type CommissionRule = typeof commissionRules.$inferSelect;

export const commissionRecords = pgTable("commission_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  employeeId: integer("employee_id").references(() => employees.id).notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  totalSales: decimal("total_sales", { precision: 15, scale: 2 }).notNull().default("0"),
  commissionRate: decimal("commission_rate", { precision: 8, scale: 4 }).notNull().default("0"),
  commissionAmount: decimal("commission_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  ruleId: integer("rule_id").references(() => commissionRules.id),
  status: text("status").notNull().default("draft"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCommissionRecordSchema = createInsertSchema(commissionRecords).omit({ id: true, createdAt: true, approvedAt: true });
export type InsertCommissionRecord = z.infer<typeof insertCommissionRecordSchema>;
export type CommissionRecord = typeof commissionRecords.$inferSelect;

export const liveCommissionShifts = pgTable("live_commission_shifts", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  title: text("title").notNull(),
  platforms: text("platforms").array().notNull(),
  hostUserIds: integer("host_user_ids").array().notNull(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  status: text("status").notNull().default("draft"),
  commissionRate: decimal("commission_rate", { precision: 8, scale: 4 }).default("0"),
  totalRevenue: decimal("total_revenue", { precision: 15, scale: 2 }).default("0"),
  totalOrders: integer("total_orders").default(0),
  commissionAmount: decimal("commission_amount", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  calculatedAt: timestamp("calculated_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLiveCommissionShiftSchema = createInsertSchema(liveCommissionShifts).omit({ id: true, createdAt: true, calculatedAt: true });
export type InsertLiveCommissionShift = z.infer<typeof insertLiveCommissionShiftSchema>;
export type LiveCommissionShift = typeof liveCommissionShifts.$inferSelect;

export const maintenanceSchedules = pgTable("maintenance_schedules", {
  id: serial("id").primaryKey(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  message: text("message").notNull().default("ระบบอยู่ระหว่างการปรับปรุง กรุณารอสักครู่"),
  createdBy: text("created_by"),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  status: text("status").notNull().default("pending"),
  activatedAt: timestamp("activated_at"),
  liftedAt: timestamp("lifted_at"),
  liftedBy: text("lifted_by"),
  source: text("source").notNull().default("manual"),
  cloneInProgress: boolean("clone_in_progress").notNull().default(false),
  cloneSessionUserId: integer("clone_session_user_id"),
  completedDate: text("completed_date"),
  cancelledByCloneUser: text("cancelled_by_clone_user"),
  cancelledByCloneUserId: integer("cancelled_by_clone_user_id"),
  cancelledNotified: boolean("cancelled_notified").default(false),
});

export const insertMaintenanceScheduleSchema = createInsertSchema(maintenanceSchedules).omit({ id: true, createdAt: true });
export type InsertMaintenanceSchedule = z.infer<typeof insertMaintenanceScheduleSchema>;
export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;

export const cloneHistory = pgTable("clone_history", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  cloneType: text("clone_type").notNull(),
  direction: text("direction").default("us_to_th"),
  tableName: text("table_name").notNull(),
  rowCount: integer("row_count").default(0),
  hostDurationMs: integer("host_duration_ms").default(0),
  remoteDurationMs: integer("remote_duration_ms").default(0),
  status: text("status").notNull().default("pending"),
  errorMessage: text("error_message"),
  batchIndex: integer("batch_index").default(0),
  totalBatches: integer("total_batches").default(1),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdBy: integer("created_by").references(() => users.id),
  dumpFileSize: integer("dump_file_size").default(0),
  dumpSpeed: integer("dump_speed").default(0),
  restoreSpeed: integer("restore_speed").default(0),
  sourceMachine: text("source_machine"),
  syncedToCentral: boolean("synced_to_central").default(false),
});

export const insertCloneHistorySchema = createInsertSchema(cloneHistory).omit({ id: true });
export type InsertCloneHistory = z.infer<typeof insertCloneHistorySchema>;
export type CloneHistory = typeof cloneHistory.$inferSelect;

export const approvalSettings = pgTable("approval_settings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  documentType: text("document_type").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  approverMode: text("approver_mode").notNull().default("role"),
  approverRoles: text("approver_roles").array().default([]),
  approverUserIds: integer("approver_user_ids").array().default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertApprovalSettingSchema = createInsertSchema(approvalSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertApprovalSetting = z.infer<typeof insertApprovalSettingSchema>;
export type ApprovalSetting = typeof approvalSettings.$inferSelect;

export const approvalRequests = pgTable("approval_requests", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companies.id),
  documentType: text("document_type").notNull(),
  documentId: integer("document_id").notNull(),
  documentNumber: text("document_number"),
  amount: decimal("amount", { precision: 15, scale: 2 }),
  contactName: text("contact_name"),
  requestedBy: integer("requested_by").references(() => users.id),
  requestedAt: timestamp("requested_at").defaultNow(),
  status: text("status").notNull().default("pending"),
  approvedBy: integer("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  rejectedReason: text("rejected_reason"),
  notifiedAt: timestamp("notified_at"),
  token: text("token").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApprovalRequestSchema = createInsertSchema(approvalRequests).omit({ id: true, createdAt: true });
export type InsertApprovalRequest = z.infer<typeof insertApprovalRequestSchema>;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;

export const internalChatRooms = pgTable("internal_chat_rooms", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  companyId: integer("company_id").references(() => companies.id),
  name: text("name"),
  type: text("type").notNull().default("direct"),
  createdBy: integer("created_by").references(() => users.id),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInternalChatRoomSchema = createInsertSchema(internalChatRooms).omit({ id: true, createdAt: true });
export type InsertInternalChatRoom = z.infer<typeof insertInternalChatRoomSchema>;
export type InternalChatRoom = typeof internalChatRooms.$inferSelect;

export const internalChatMembers = pgTable("internal_chat_members", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => internalChatRooms.id),
  userId: integer("user_id").notNull().references(() => users.id),
  joinedAt: timestamp("joined_at").defaultNow(),
  lastReadAt: timestamp("last_read_at"),
});

export const insertInternalChatMemberSchema = createInsertSchema(internalChatMembers).omit({ id: true, joinedAt: true });
export type InsertInternalChatMember = z.infer<typeof insertInternalChatMemberSchema>;
export type InternalChatMember = typeof internalChatMembers.$inferSelect;

export const internalChatMessages = pgTable("internal_chat_messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => internalChatRooms.id),
  senderId: integer("sender_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  messageType: text("message_type").notNull().default("text"),
  replyToId: integer("reply_to_id"),
  pinnedAt: timestamp("pinned_at"),
  pinnedBy: integer("pinned_by").references(() => users.id),
  attachmentUrl: text("attachment_url"),
  attachmentName: text("attachment_name"),
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
  forwardedFromId: integer("forwarded_from_id"),
  forwardedFromRoomName: text("forwarded_from_room_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInternalChatMessageSchema = createInsertSchema(internalChatMessages).omit({ id: true, createdAt: true, pinnedAt: true, pinnedBy: true, editedAt: true, deletedAt: true });
export type InsertInternalChatMessage = z.infer<typeof insertInternalChatMessageSchema>;
export type InternalChatMessage = typeof internalChatMessages.$inferSelect;

export const internalChatReactions = pgTable("internal_chat_reactions", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => internalChatMessages.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type InternalChatReaction = typeof internalChatReactions.$inferSelect;

export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  companyId: integer("company_id").references(() => companies.id),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  allDay: boolean("all_day").notNull().default(false),
  color: text("color").notNull().default("#fb9678"),
  category: text("category").notNull().default("general"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;

export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  companyId: integer("company_id").references(() => companies.id),
  title: text("title").notNull(),
  description: text("description"),
  meetingUrl: text("meeting_url"),
  meetingType: text("meeting_type").notNull().default("other"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  status: text("status").notNull().default("scheduled"),
  chatRoomId: integer("chat_room_id").references(() => internalChatRooms.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({ id: true, createdAt: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

export const meetingParticipants = pgTable("meeting_participants", {
  id: serial("id").primaryKey(),
  meetingId: integer("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  status: text("status").notNull().default("invited"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMeetingParticipantSchema = createInsertSchema(meetingParticipants).omit({ id: true, createdAt: true });
export type InsertMeetingParticipant = z.infer<typeof insertMeetingParticipantSchema>;
export type MeetingParticipant = typeof meetingParticipants.$inferSelect;

export const pipelineDeals = pgTable("pipeline_deals", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  title: text("title").notNull(),
  contactId: integer("contact_id").references(() => contacts.id),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  dealValue: decimal("deal_value", { precision: 15, scale: 2 }).default("0"),
  stage: text("stage").notNull().default("lead"),
  probability: integer("probability").default(10),
  expectedCloseDate: date("expected_close_date"),
  assignedTo: text("assigned_to"),
  source: text("source"),
  notes: text("notes"),
  lostReason: text("lost_reason"),
  quotationId: integer("quotation_id").references(() => quotations.id),
  createdBy: integer("created_by").references(() => users.id),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPipelineDealSchema = createInsertSchema(pipelineDeals).omit({ id: true, createdAt: true, updatedAt: true, closedAt: true });
export type InsertPipelineDeal = z.infer<typeof insertPipelineDealSchema>;
export type PipelineDeal = typeof pipelineDeals.$inferSelect;

export const pipelineActivities = pgTable("pipeline_activities", {
  id: serial("id").primaryKey(),
  dealId: integer("deal_id").references(() => pipelineDeals.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  fromStage: text("from_stage"),
  toStage: text("to_stage"),
  userId: integer("user_id").references(() => users.id),
  userName: text("user_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPipelineActivitySchema = createInsertSchema(pipelineActivities).omit({ id: true, createdAt: true });
export type InsertPipelineActivity = z.infer<typeof insertPipelineActivitySchema>;
export type PipelineActivity = typeof pipelineActivities.$inferSelect;

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  accountCode: text("account_code").notNull(),
  accountName: text("account_name").notNull(),
  accountType: text("account_type").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  version: integer("version").notNull().default(1),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBudgetSchema = createInsertSchema(budgets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgets.$inferSelect;

export const financialBuffers = pgTable("financial_buffers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  bufferType: text("buffer_type").notNull(),
  targetAmount: decimal("target_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertFinancialBufferSchema = createInsertSchema(financialBuffers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFinancialBuffer = z.infer<typeof insertFinancialBufferSchema>;
export type FinancialBuffer = typeof financialBuffers.$inferSelect;

export const fuelProducts = pgTable("fuel_products", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  nameTh: text("name_th").notNull(),
  fuelGroup: text("fuel_group").notNull().default("gasoline"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 4 }).notNull().default("0"),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).notNull().default("7"),
  exciseTaxRate: decimal("excise_tax_rate", { precision: 10, scale: 4 }).notNull().default("0"),
  municipalTaxRate: decimal("municipal_tax_rate", { precision: 10, scale: 4 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertFuelProductSchema = createInsertSchema(fuelProducts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFuelProduct = z.infer<typeof insertFuelProductSchema>;
export type FuelProduct = typeof fuelProducts.$inferSelect;

export const fuelTanks = pgTable("fuel_tanks", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  tankNo: text("tank_no").notNull(),
  name: text("name").notNull(),
  fuelProductId: integer("fuel_product_id").references(() => fuelProducts.id),
  capacity: decimal("capacity", { precision: 12, scale: 2 }).notNull().default("0"),
  currentVolume: decimal("current_volume", { precision: 12, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertFuelTankSchema = createInsertSchema(fuelTanks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFuelTank = z.infer<typeof insertFuelTankSchema>;
export type FuelTank = typeof fuelTanks.$inferSelect;

export const fuelPumps = pgTable("fuel_pumps", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  pumpNo: text("pump_no").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertFuelPumpSchema = createInsertSchema(fuelPumps).omit({ id: true, createdAt: true });
export type InsertFuelPump = z.infer<typeof insertFuelPumpSchema>;
export type FuelPump = typeof fuelPumps.$inferSelect;

export const fuelNozzles = pgTable("fuel_nozzles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  pumpId: integer("pump_id").references(() => fuelPumps.id).notNull(),
  nozzleNo: text("nozzle_no").notNull(),
  fuelProductId: integer("fuel_product_id").references(() => fuelProducts.id).notNull(),
  tankId: integer("tank_id").references(() => fuelTanks.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertFuelNozzleSchema = createInsertSchema(fuelNozzles).omit({ id: true, createdAt: true });
export type InsertFuelNozzle = z.infer<typeof insertFuelNozzleSchema>;
export type FuelNozzle = typeof fuelNozzles.$inferSelect;

export const dailyFuelSales = pgTable("daily_fuel_sales", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  saleDate: date("sale_date").notNull(),
  nozzleId: integer("nozzle_id").references(() => fuelNozzles.id).notNull(),
  fuelProductId: integer("fuel_product_id").references(() => fuelProducts.id).notNull(),
  meterOpen: decimal("meter_open", { precision: 14, scale: 2 }).notNull().default("0"),
  meterClose: decimal("meter_close", { precision: 14, scale: 2 }).notNull().default("0"),
  litersSold: decimal("liters_sold", { precision: 14, scale: 2 }).notNull().default("0"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 4 }).notNull().default("0"),
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  testLiters: decimal("test_liters", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentMethod: varchar("payment_method", { length: 50 }).notNull().default("cash"),
  payments: text("payments").notNull().default("[]"),
  creditCustomerId: integer("credit_customer_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertDailyFuelSaleSchema = createInsertSchema(dailyFuelSales).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyFuelSale = z.infer<typeof insertDailyFuelSaleSchema>;
export type DailyFuelSale = typeof dailyFuelSales.$inferSelect;

export const fuelReceivings = pgTable("fuel_receivings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  receiveDate: date("receive_date").notNull(),
  tankId: integer("tank_id").references(() => fuelTanks.id).notNull(),
  fuelProductId: integer("fuel_product_id").references(() => fuelProducts.id).notNull(),
  supplierName: text("supplier_name"),
  documentNo: text("document_no"),
  volumeReceived: decimal("volume_received", { precision: 14, scale: 2 }).notNull().default("0"),
  unitCost: decimal("unit_cost", { precision: 10, scale: 4 }).notNull().default("0"),
  totalCost: decimal("total_cost", { precision: 15, scale: 2 }).notNull().default("0"),
  volumeBefore: decimal("volume_before", { precision: 14, scale: 2 }).notNull().default("0"),
  volumeAfter: decimal("volume_after", { precision: 14, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertFuelReceivingSchema = createInsertSchema(fuelReceivings).omit({ id: true, createdAt: true });
export type InsertFuelReceiving = z.infer<typeof insertFuelReceivingSchema>;
export type FuelReceiving = typeof fuelReceivings.$inferSelect;

export const tankDippings = pgTable("tank_dippings", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  dipDate: date("dip_date").notNull(),
  tankId: integer("tank_id").references(() => fuelTanks.id).notNull(),
  fuelProductId: integer("fuel_product_id").references(() => fuelProducts.id),
  measuredVolume: decimal("measured_volume", { precision: 14, scale: 2 }).notNull().default("0"),
  bookVolume: decimal("book_volume", { precision: 14, scale: 2 }).notNull().default("0"),
  difference: decimal("difference", { precision: 14, scale: 2 }).notNull().default("0"),
  temperature: decimal("temperature", { precision: 5, scale: 1 }),
  waterLevel: decimal("water_level", { precision: 8, scale: 2 }),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertTankDippingSchema = createInsertSchema(tankDippings).omit({ id: true, createdAt: true });
export type InsertTankDipping = z.infer<typeof insertTankDippingSchema>;
export type TankDipping = typeof tankDippings.$inferSelect;

export const localTaxRecords = pgTable("local_tax_records", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  taxPeriod: text("tax_period").notNull(),
  taxType: text("tax_type").notNull().default("municipal"),
  localAuthority: text("local_authority"),
  totalLitersSold: decimal("total_liters_sold", { precision: 15, scale: 2 }).notNull().default("0"),
  taxRatePerLiter: decimal("tax_rate_per_liter", { precision: 10, scale: 4 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  surcharge: decimal("surcharge", { precision: 15, scale: 2 }).notNull().default("0"),
  totalPayable: decimal("total_payable", { precision: 15, scale: 2 }).notNull().default("0"),
  dueDate: date("due_date"),
  paidDate: date("paid_date"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertLocalTaxRecordSchema = createInsertSchema(localTaxRecords).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLocalTaxRecord = z.infer<typeof insertLocalTaxRecordSchema>;
export type LocalTaxRecord = typeof localTaxRecords.$inferSelect;

export const gasStationCreditCustomers = pgTable("gas_station_credit_customers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  customerName: text("customer_name").notNull(),
  taxId: varchar("tax_id", { length: 20 }),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  creditLimit: decimal("credit_limit", { precision: 15, scale: 2 }).default("0"),
  currentBalance: decimal("current_balance", { precision: 15, scale: 2 }).default("0"),
  contactPerson: text("contact_person"),
  fleetCardNo: varchar("fleet_card_no", { length: 100 }),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertGasStationCreditCustomerSchema = createInsertSchema(gasStationCreditCustomers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGasStationCreditCustomer = z.infer<typeof insertGasStationCreditCustomerSchema>;
export type GasStationCreditCustomer = typeof gasStationCreditCustomers.$inferSelect;

export const accountPeriodBalances = pgTable("account_period_balances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  accountId: integer("account_id").references(() => accounts.id).notNull(),
  periodYear: integer("period_year").notNull(),
  periodMonth: integer("period_month").notNull(),
  totalDebit: decimal("total_debit", { precision: 18, scale: 2 }).default("0").notNull(),
  totalCredit: decimal("total_credit", { precision: 18, scale: 2 }).default("0").notNull(),
  entryCount: integer("entry_count").default(0).notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});
export type AccountPeriodBalance = typeof accountPeriodBalances.$inferSelect;

export const taxReminderSettings = pgTable("tax_reminder_settings", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),
  enabled: boolean("enabled").notNull().default(true),
  daysBefore: integer("days_before").notNull().default(3),
  sendSticker: boolean("send_sticker").notNull().default(true),
  reminderTime: text("reminder_time").notNull().default("09:00"),
  customStickerPackageId: text("custom_sticker_package_id"),
  customStickerId: text("custom_sticker_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type TaxReminderSetting = typeof taxReminderSettings.$inferSelect;

export const taxReminderLogs = pgTable("tax_reminder_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  lineGroupId: text("line_group_id"),
  groupName: text("group_name"),
  deadlineDate: text("deadline_date"),
  deadlineTitle: text("deadline_title"),
  sentAt: timestamp("sent_at").defaultNow(),
  status: text("status").default("sent"),
  errorMessage: text("error_message"),
});
export type TaxReminderLog = typeof taxReminderLogs.$inferSelect;

export const legacyCompanies = pgTable("legacy_companies", {
  id: serial("id").primaryKey(),
  sourceId: text("source_id"),
  name: text("name").notNull(),
  taxId: text("tax_id"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  importedAt: timestamp("imported_at").defaultNow(),
  importedBy: integer("imported_by"),
  dateRangeFrom: text("date_range_from"),
  dateRangeTo: text("date_range_to"),
  tableCount: integer("table_count").default(0),
  totalRows: integer("total_rows").default(0),
  metadata: jsonb("metadata"),
});
export type LegacyCompany = typeof legacyCompanies.$inferSelect;
export const insertLegacyCompanySchema = createInsertSchema(legacyCompanies).omit({ id: true, importedAt: true });
export type InsertLegacyCompany = z.infer<typeof insertLegacyCompanySchema>;

export const legacyChartOfAccounts = pgTable("legacy_chart_of_accounts", {
  id: serial("id").primaryKey(),
  legacyCompanyId: integer("legacy_company_id").notNull().references(() => legacyCompanies.id, { onDelete: "cascade" }),
  accountCode: text("account_code").notNull(),
  accountName: text("account_name").notNull(),
  accountType: text("account_type"),
  parentCode: text("parent_code"),
  level: integer("level"),
  isHeader: boolean("is_header").default(false),
  normalBalance: text("normal_balance"),
  category: text("category"),
  rawData: jsonb("raw_data"),
});
export type LegacyChartOfAccount = typeof legacyChartOfAccounts.$inferSelect;
export const insertLegacyChartOfAccountSchema = createInsertSchema(legacyChartOfAccounts).omit({ id: true });
export type InsertLegacyChartOfAccount = z.infer<typeof insertLegacyChartOfAccountSchema>;

export const legacyContacts = pgTable("legacy_contacts", {
  id: serial("id").primaryKey(),
  legacyCompanyId: integer("legacy_company_id").notNull().references(() => legacyCompanies.id, { onDelete: "cascade" }),
  contactCode: text("contact_code"),
  contactName: text("contact_name").notNull(),
  contactType: text("contact_type"),
  taxId: text("tax_id"),
  branchNo: text("branch_no"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  rawData: jsonb("raw_data"),
});
export type LegacyContact = typeof legacyContacts.$inferSelect;
export const insertLegacyContactSchema = createInsertSchema(legacyContacts).omit({ id: true });
export type InsertLegacyContact = z.infer<typeof insertLegacyContactSchema>;

export const legacyDocuments = pgTable("legacy_documents", {
  id: serial("id").primaryKey(),
  legacyCompanyId: integer("legacy_company_id").notNull().references(() => legacyCompanies.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),
  docNo: text("doc_no"),
  docDate: text("doc_date"),
  contactName: text("contact_name"),
  contactCode: text("contact_code"),
  description: text("description"),
  subtotal: text("subtotal"),
  vatAmount: text("vat_amount"),
  grandTotal: text("grand_total"),
  status: text("status"),
  rawData: jsonb("raw_data"),
});
export type LegacyDocument = typeof legacyDocuments.$inferSelect;
export const insertLegacyDocumentSchema = createInsertSchema(legacyDocuments).omit({ id: true });
export type InsertLegacyDocument = z.infer<typeof insertLegacyDocumentSchema>;

export const legacyDocumentItems = pgTable("legacy_document_items", {
  id: serial("id").primaryKey(),
  legacyDocumentId: integer("legacy_document_id").notNull().references(() => legacyDocuments.id, { onDelete: "cascade" }),
  lineNo: integer("line_no"),
  itemCode: text("item_code"),
  itemName: text("item_name"),
  description: text("description"),
  quantity: text("quantity"),
  unitPrice: text("unit_price"),
  amount: text("amount"),
  unit: text("unit"),
  rawData: jsonb("raw_data"),
});
export type LegacyDocumentItem = typeof legacyDocumentItems.$inferSelect;
export const insertLegacyDocumentItemSchema = createInsertSchema(legacyDocumentItems).omit({ id: true });
export type InsertLegacyDocumentItem = z.infer<typeof insertLegacyDocumentItemSchema>;

export const legacyGlEntries = pgTable("legacy_gl_entries", {
  id: serial("id").primaryKey(),
  legacyCompanyId: integer("legacy_company_id").notNull().references(() => legacyCompanies.id, { onDelete: "cascade" }),
  glNo: text("gl_no"),
  glDate: text("gl_date"),
  description: text("description"),
  reference: text("reference"),
  journalBook: text("journal_book"),
  totalDebit: text("total_debit"),
  totalCredit: text("total_credit"),
  status: text("status"),
  rawData: jsonb("raw_data"),
});
export type LegacyGlEntry = typeof legacyGlEntries.$inferSelect;
export const insertLegacyGlEntrySchema = createInsertSchema(legacyGlEntries).omit({ id: true });
export type InsertLegacyGlEntry = z.infer<typeof insertLegacyGlEntrySchema>;

export const legacyGlLines = pgTable("legacy_gl_lines", {
  id: serial("id").primaryKey(),
  legacyCompanyId: integer("legacy_company_id").notNull().references(() => legacyCompanies.id, { onDelete: "cascade" }),
  legacyGlEntryId: integer("legacy_gl_entry_id").references(() => legacyGlEntries.id, { onDelete: "cascade" }),
  accountCode: text("account_code"),
  accountName: text("account_name"),
  debit: text("debit"),
  credit: text("credit"),
  description: text("description"),
  glNo: text("gl_no"),
  glDate: text("gl_date"),
  reference: text("reference"),
  journalBook: text("journal_book"),
  rawData: jsonb("raw_data"),
});
export type LegacyGlLine = typeof legacyGlLines.$inferSelect;
export const insertLegacyGlLineSchema = createInsertSchema(legacyGlLines).omit({ id: true });
export type InsertLegacyGlLine = z.infer<typeof insertLegacyGlLineSchema>;

// ============ Platform Fee Configuration & Price Calculator ============

export const platformFeeConfigs = pgTable("platform_fee_configs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id),
  platform: text("platform").notNull(),
  profileName: text("profile_name").notNull(),
  commissionRate: decimal("commission_rate", { precision: 6, scale: 3 }).notNull().default("0"),
  serviceFeeRate: decimal("service_fee_rate", { precision: 6, scale: 3 }).notNull().default("0"),
  paymentFeeRate: decimal("payment_fee_rate", { precision: 6, scale: 3 }).notNull().default("0"),
  otherFeeRate: decimal("other_fee_rate", { precision: 6, scale: 3 }).notNull().default("0"),
  shippingFeePerOrder: decimal("shipping_fee_per_order", { precision: 10, scale: 2 }).notNull().default("0"),
  vatOnFees: boolean("vat_on_fees").notNull().default(true),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPlatformFeeConfigSchema = createInsertSchema(platformFeeConfigs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlatformFeeConfig = z.infer<typeof insertPlatformFeeConfigSchema>;
export type PlatformFeeConfig = typeof platformFeeConfigs.$inferSelect;

// ============ Shop Stats / Business Insights ============

export const shopStats = pgTable("shop_stats", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  platform: text("platform").notNull(),
  storeName: text("store_name"),
  periodDate: text("period_date").notNull(),
  periodType: text("period_type").notNull().default("monthly"),
  totalSales: decimal("total_sales", { precision: 14, scale: 2 }).notNull().default("0"),
  totalOrders: integer("total_orders").notNull().default(0),
  avgOrderValue: decimal("avg_order_value", { precision: 10, scale: 2 }).notNull().default("0"),
  totalClicks: integer("total_clicks").notNull().default(0),
  totalVisitors: integer("total_visitors").notNull().default(0),
  conversionRate: decimal("conversion_rate", { precision: 6, scale: 2 }).notNull().default("0"),
  cancelledOrders: integer("cancelled_orders").notNull().default(0),
  cancelledSales: decimal("cancelled_sales", { precision: 14, scale: 2 }).notNull().default("0"),
  returnedOrders: integer("returned_orders").notNull().default(0),
  returnedSales: decimal("returned_sales", { precision: 14, scale: 2 }).notNull().default("0"),
  source: text("source").notNull().default("excel"),
  importedAt: timestamp("imported_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
});

export const insertShopStatSchema = createInsertSchema(shopStats).omit({ id: true, importedAt: true });
export type InsertShopStat = z.infer<typeof insertShopStatSchema>;
export type ShopStat = typeof shopStats.$inferSelect;

export const shopStatSyncLogs = pgTable("shop_stat_sync_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  platform: text("platform").notNull(),
  connectionId: integer("connection_id").references(() => ecommerceConnections.id),
  syncType: text("sync_type").notNull().default("manual"),
  status: text("status").notNull().default("pending"),
  periodssynced: integer("periods_synced").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdBy: integer("created_by").references(() => users.id),
});

export type ShopStatSyncLog = typeof shopStatSyncLogs.$inferSelect;

export const constructionProjects = pgTable("construction_projects", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  customerName: text("customer_name"),
  projectType: text("project_type").notNull().default("construction"),
  budgetAmount: decimal("budget_amount", { precision: 15, scale: 2 }).default("0"),
  revenueAmount: decimal("revenue_amount", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("active"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertConstructionProjectSchema = createInsertSchema(constructionProjects).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConstructionProject = z.infer<typeof insertConstructionProjectSchema>;
export type ConstructionProject = typeof constructionProjects.$inferSelect;

export const projectUnits = pgTable("project_units", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => constructionProjects.id, { onDelete: "cascade" }).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  unitCode: text("unit_code").notNull(),
  unitType: text("unit_type").notNull().default("room"),
  areaSize: decimal("area_size", { precision: 10, scale: 2 }),
  areaSizeUnit: text("area_size_unit").default("sqm"),
  sellingPrice: decimal("selling_price", { precision: 15, scale: 2 }).default("0"),
  status: text("status").notNull().default("available"),
  buyerName: text("buyer_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectUnitSchema = createInsertSchema(projectUnits).omit({ id: true, createdAt: true });
export type InsertProjectUnit = z.infer<typeof insertProjectUnitSchema>;
export type ProjectUnit = typeof projectUnits.$inferSelect;

export const projectCostAllocations = pgTable("project_cost_allocations", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").references(() => constructionProjects.id, { onDelete: "cascade" }).notNull(),
  unitId: integer("unit_id").references(() => projectUnits.id, { onDelete: "set null" }),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  sourceType: text("source_type"),
  sourceId: integer("source_id"),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  costCategory: text("cost_category").notNull().default("other"),
  allocatedDate: text("allocated_date"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectCostAllocationSchema = createInsertSchema(projectCostAllocations).omit({ id: true, createdAt: true });
export type InsertProjectCostAllocation = z.infer<typeof insertProjectCostAllocationSchema>;
export type ProjectCostAllocation = typeof projectCostAllocations.$inferSelect;

export const loyaltyPrograms = pgTable("loyalty_programs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  active: boolean("active").default(true),
  pointsPerSpend: decimal("points_per_spend", { precision: 15, scale: 2 }).default("1"),
  spendAmount: decimal("spend_amount", { precision: 15, scale: 2 }).default("100"),
  minSpendPerTxn: decimal("min_spend_per_txn", { precision: 15, scale: 2 }).default("0"),
  pointExpireDays: integer("point_expire_days"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertLoyaltyProgramSchema = createInsertSchema(loyaltyPrograms).omit({ id: true, createdAt: true });
export type InsertLoyaltyProgram = z.infer<typeof insertLoyaltyProgramSchema>;
export type LoyaltyProgram = typeof loyaltyPrograms.$inferSelect;

export const loyaltyRewards = pgTable("loyalty_rewards", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").references(() => loyaltyPrograms.id, { onDelete: "cascade" }).notNull(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  pointsCost: integer("points_cost").notNull(),
  rewardType: text("reward_type").notNull().default("discount"),
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }),
  discountPercent: decimal("discount_percent", { precision: 5, scale: 2 }),
  maxDiscount: decimal("max_discount", { precision: 15, scale: 2 }),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertLoyaltyRewardSchema = createInsertSchema(loyaltyRewards).omit({ id: true, createdAt: true });
export type InsertLoyaltyReward = z.infer<typeof insertLoyaltyRewardSchema>;
export type LoyaltyReward = typeof loyaltyRewards.$inferSelect;

export const loyaltyMembers = pgTable("loyalty_members", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  programId: integer("program_id").references(() => loyaltyPrograms.id, { onDelete: "cascade" }).notNull(),
  memberCode: text("member_code").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"),
  totalPoints: integer("total_points").default(0),
  totalSpent: decimal("total_spent", { precision: 15, scale: 2 }).default("0"),
  visitCount: integer("visit_count").default(0),
  active: boolean("active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertLoyaltyMemberSchema = createInsertSchema(loyaltyMembers).omit({ id: true, createdAt: true, totalPoints: true, totalSpent: true, visitCount: true });
export type InsertLoyaltyMember = z.infer<typeof insertLoyaltyMemberSchema>;
export type LoyaltyMember = typeof loyaltyMembers.$inferSelect;

export const loyaltyPointTransactions = pgTable("loyalty_point_transactions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  memberId: integer("member_id").references(() => loyaltyMembers.id, { onDelete: "cascade" }).notNull(),
  programId: integer("program_id").references(() => loyaltyPrograms.id).notNull(),
  type: text("type").notNull(),
  points: integer("points").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  description: text("description"),
  posTransactionId: integer("pos_transaction_id").references(() => posTransactions.id),
  rewardId: integer("reward_id").references(() => loyaltyRewards.id),
  expiresAt: timestamp("expires_at"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertLoyaltyPointTransactionSchema = createInsertSchema(loyaltyPointTransactions).omit({ id: true, createdAt: true });
export type InsertLoyaltyPointTransaction = z.infer<typeof insertLoyaltyPointTransactionSchema>;
export type LoyaltyPointTransaction = typeof loyaltyPointTransactions.$inferSelect;

export const deliveryNotes = pgTable("delivery_notes", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  deliveryNo: text("delivery_no").notNull(),
  deliveryDate: text("delivery_date").notNull(),
  sourceType: text("source_type").notNull().default("standalone"),
  sourceId: integer("source_id"),
  customerId: integer("customer_id").references(() => contacts.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  deliveryAddress: text("delivery_address").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  signatureDataUrl: text("signature_data_url"),
  signedByName: text("signed_by_name"),
  signedAt: timestamp("signed_at"),
  deliveryPhotoUrl: text("delivery_photo_url"),
  deliveryGpsLat: decimal("delivery_gps_lat", { precision: 10, scale: 7 }),
  deliveryGpsLng: decimal("delivery_gps_lng", { precision: 10, scale: 7 }),
  deliveryRemarks: text("delivery_remarks"),
  publicToken: text("public_token"),
  lineNotifiedAt: timestamp("line_notified_at"),
  createdBy: integer("created_by").references(() => users.id),
  updatedBy: integer("updated_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertDeliveryNoteSchema = createInsertSchema(deliveryNotes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDeliveryNote = z.infer<typeof insertDeliveryNoteSchema>;
export type DeliveryNote = typeof deliveryNotes.$inferSelect;

export const deliveryNoteItems = pgTable("delivery_note_items", {
  id: serial("id").primaryKey(),
  deliveryNoteId: integer("delivery_note_id").references(() => deliveryNotes.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => products.id),
  productCode: text("product_code"),
  productName: text("product_name").notNull(),
  description: text("description"),
  qty: decimal("qty", { precision: 15, scale: 2 }).notNull(),
  unit: text("unit").default("ชิ้น"),
  notes: text("notes"),
});
export const insertDeliveryNoteItemSchema = createInsertSchema(deliveryNoteItems).omit({ id: true });
export type InsertDeliveryNoteItem = z.infer<typeof insertDeliveryNoteItemSchema>;
export type DeliveryNoteItem = typeof deliveryNoteItems.$inferSelect;

export const moduleSyncLogs = pgTable("module_sync_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull(),
  sourceModule: text("source_module").notNull(),
  sourceDocType: text("source_doc_type").notNull(),
  sourceDocId: integer("source_doc_id").notNull(),
  targetDocType: text("target_doc_type"),
  targetDocId: integer("target_doc_id"),
  journalEntryId: integer("journal_entry_id"),
  status: text("status").default("synced"),
  syncedAt: timestamp("synced_at").defaultNow(),
  errorMessage: text("error_message"),
});
export const insertModuleSyncLogSchema = createInsertSchema(moduleSyncLogs).omit({ id: true });
export type InsertModuleSyncLog = z.infer<typeof insertModuleSyncLogSchema>;
export type ModuleSyncLog = typeof moduleSyncLogs.$inferSelect;

export const firmLinks = pgTable("firm_links", {
  id: serial("id").primaryKey(),
  inviteCode: text("invite_code").notNull().unique(),
  clientTenantId: integer("client_tenant_id").notNull().references(() => tenants.id),
  clientCompanyId: integer("client_company_id").notNull().references(() => companies.id),
  firmTenantId: integer("firm_tenant_id").references(() => tenants.id),
  status: text("status").notNull().default("pending"),
  accessLevel: text("access_level").notNull().default("readonly"),
  linkedAt: timestamp("linked_at"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  acceptedByUserId: integer("accepted_by_user_id").references(() => users.id),
});
export const insertFirmLinkSchema = createInsertSchema(firmLinks).omit({ id: true, createdAt: true });
export type InsertFirmLink = z.infer<typeof insertFirmLinkSchema>;
export type FirmLink = typeof firmLinks.$inferSelect;

export const customFormTemplates = pgTable("custom_form_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  name: text("name").notNull(),
  docType: text("doc_type").notNull(),
  paperSize: text("paper_size").notNull().default("A4"),
  orientation: text("orientation").notNull().default("portrait"),
  backgroundImageUrl: text("background_image_url"),
  fields: text("fields").notNull().default("[]"),
  itemsTable: text("items_table"),
  totals: text("totals"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertCustomFormTemplateSchema = createInsertSchema(customFormTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomFormTemplate = z.infer<typeof insertCustomFormTemplateSchema>;
export type CustomFormTemplate = typeof customFormTemplates.$inferSelect;

export const ecommerceTeamMembers = pgTable("ecommerce_team_members", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: text("role").notNull().default("operator"),
  permissions: text("permissions").array(),
  assignedStoreIds: integer("assigned_store_ids").array(),
  nickname: text("nickname"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertEcommerceTeamMemberSchema = createInsertSchema(ecommerceTeamMembers).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEcommerceTeamMember = z.infer<typeof insertEcommerceTeamMemberSchema>;
export type EcommerceTeamMember = typeof ecommerceTeamMembers.$inferSelect;

export const modulePlans = pgTable("module_plans", {
  id: serial("id").primaryKey(),
  moduleKey: text("module_key").notNull(),
  tier: text("tier").notNull(),
  name: text("name").notNull(),
  nameEn: text("name_en"),
  description: text("description"),
  monthlyPrice: decimal("monthly_price", { precision: 10, scale: 2 }).notNull().default("0"),
  yearlyPrice: decimal("yearly_price", { precision: 10, scale: 2 }),
  maxUsers: integer("max_users").notNull().default(1),
  maxDocuments: integer("max_documents").notNull().default(100),
  maxCompanies: integer("max_companies").notNull().default(1),
  limits: text("limits"),
  features: text("features").array(),
  popular: boolean("popular").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertModulePlanSchema = createInsertSchema(modulePlans).omit({ id: true, createdAt: true });
export type InsertModulePlan = z.infer<typeof insertModulePlanSchema>;
export type ModulePlan = typeof modulePlans.$inferSelect;

export const tenantModuleSubscriptions = pgTable("tenant_module_subscriptions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id).notNull(),
  moduleKey: text("module_key").notNull(),
  modulePlanId: integer("module_plan_id").references(() => modulePlans.id).notNull(),
  tier: text("tier").notNull(),
  status: text("status").notNull().default("trial"),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  trialEndsAt: timestamp("trial_ends_at"),
  autoRenew: boolean("auto_renew").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export const insertTenantModuleSubscriptionSchema = createInsertSchema(tenantModuleSubscriptions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantModuleSubscription = z.infer<typeof insertTenantModuleSubscriptionSchema>;
export type TenantModuleSubscription = typeof tenantModuleSubscriptions.$inferSelect;

export const serialNumbers = pgTable("serial_numbers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  productId: integer("product_id").references(() => products.id).notNull(),
  serialNumber: text("serial_number").notNull(),
  status: text("status").notNull().default("available"),
  warehouseId: integer("warehouse_id").references(() => warehouses.id),
  lotId: integer("lot_id").references(() => productLots.id),
  notes: text("notes"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertSerialNumberSchema = createInsertSchema(serialNumbers).omit({ id: true, createdAt: true });
export type InsertSerialNumber = z.infer<typeof insertSerialNumberSchema>;
export type SerialNumber = typeof serialNumbers.$inferSelect;

export const traceabilityLogs = pgTable("traceability_logs", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  fgSerialId: integer("fg_serial_id").references(() => serialNumbers.id).notNull(),
  componentSerialId: integer("component_serial_id").references(() => serialNumbers.id).notNull(),
  bomHeaderId: integer("bom_header_id").references(() => bomHeaders.id),
  operatorEmployeeId: integer("operator_employee_id"),
  qcEmployeeId: integer("qc_employee_id"),
  manufacturingOrderId: integer("manufacturing_order_id").references(() => manufacturingOrders.id),
  assembledAt: timestamp("assembled_at").defaultNow(),
  notes: text("notes"),
});
export const insertTraceabilityLogSchema = createInsertSchema(traceabilityLogs).omit({ id: true, assembledAt: true });
export type InsertTraceabilityLog = z.infer<typeof insertTraceabilityLogSchema>;
export type TraceabilityLog = typeof traceabilityLogs.$inferSelect;

export const calibrationInstruments = pgTable("calibration_instruments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companies.id).notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  location: text("location"),
  nextDueDate: date("next_due_date"),
  lastCalibratedDate: date("last_calibrated_date"),
  calibrationInterval: integer("calibration_interval").default(365),
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertCalibrationInstrumentSchema = createInsertSchema(calibrationInstruments).omit({ id: true, createdAt: true });
export type InsertCalibrationInstrument = z.infer<typeof insertCalibrationInstrumentSchema>;
export type CalibrationInstrument = typeof calibrationInstruments.$inferSelect;

export const sysAdmins = pgTable("sys_admins", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  isMaster: boolean("is_master").notNull().default(false),
  active: boolean("active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  passwordChangedAt: timestamp("password_changed_at"),
  passwordExpiryDays: integer("password_expiry_days").notNull().default(90),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  lastLoginIp: text("last_login_ip"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by"),
  lineUserId: text("line_user_id"),
  twoFactorMethod: text("two_factor_method"),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorVerified: boolean("two_factor_verified").notNull().default(false),
  emailVerified: boolean("email_verified").notNull().default(false),
  totpSetupSecret: text("totp_setup_secret"),
  emailChangeCode: text("email_change_code"),
  emailChangeCodeExpiry: timestamp("email_change_code_expiry"),
  emailChangePending: text("email_change_pending"),
});

export const sysAdminPasswordHistory = pgTable("sys_admin_password_history", {
  id: serial("id").primaryKey(),
  sysAdminId: integer("sys_admin_id").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sysAdminPasswordPolicy = pgTable("sys_admin_password_policy", {
  id: serial("id").primaryKey(),
  minLength: integer("min_length").notNull().default(12),
  requireUppercase: boolean("require_uppercase").notNull().default(true),
  requireLowercase: boolean("require_lowercase").notNull().default(true),
  requireNumbers: boolean("require_numbers").notNull().default(true),
  requireSpecial: boolean("require_special").notNull().default(true),
  expiryDays: integer("expiry_days").notNull().default(90),
  historyCount: integer("history_count").notNull().default(5),
  maxFailedAttempts: integer("max_failed_attempts").notNull().default(5),
  lockoutMinutes: integer("lockout_minutes").notNull().default(30),
  sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(15),
  require2fa: boolean("require_2fa").notNull().default(false),
  ipWhitelistEnabled: boolean("ip_whitelist_enabled").notNull().default(false),
  ipWhitelist: text("ip_whitelist").array(),
  updatedAt: timestamp("updated_at"),
});

export const sysAdminAuditLog = pgTable("sys_admin_audit_log", {
  id: serial("id").primaryKey(),
  sysAdminId: integer("sys_admin_id").notNull(),
  sysAdminUsername: text("sys_admin_username").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: integer("target_id"),
  targetName: text("target_name"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const pdfImportTemplates = pgTable("pdf_import_templates", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  name: text("name").notNull(),
  description: text("description"),
  detectKeywords: text("detect_keywords").array().notNull(),
  fieldRules: jsonb("field_rules").notNull(),
  dateFormat: text("date_format").default("DD/MM/YYYY"),
  defaultVatType: text("default_vat_type").default("vat7"),
  active: boolean("active").default(true),
  priority: integer("priority").default(0),
  isBuiltIn: boolean("is_built_in").default(false),
  createdBy: integer("created_by"),
  updatedBy: integer("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPdfImportTemplateSchema = createInsertSchema(pdfImportTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPdfImportTemplate = z.infer<typeof insertPdfImportTemplateSchema>;
export type PdfImportTemplate = typeof pdfImportTemplates.$inferSelect;
