import { eq, and, desc, sql, inArray, count, ne, or, ilike, gte, lte, asc, isNull, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { posDb } from "./pos-db";
import { ecomDb } from "./ecom-db";
import { activeProducts, employeeCounters, type EmployeeCounter, type InsertEmployeeCounter, subscriptionPaymentOrders, type SubscriptionPaymentOrder, type InsertSubscriptionPaymentOrder } from "@shared/schema-extra";
import {
  tenants, users, companies, employees, attendanceRecords, otRecords, leaveRequests, firmClients, firmClientTeam, accounts, journalEntries, journalLines, rolePermissions, userSubPermissions,
  accountingFormulas, accountingFormulaLines, documentSettings, contacts, products, contactSettings,
  bomHeaders, bomLines, productBundles, promotions, promotionRules,
  productMappings, productStock, stockMovements,
  ecommerceConnections, ecommerceOrders, ecommerceOrderItems, ecommerceProductMappings,
  liveSessions, liveSessionProducts, liveCfOrders, liveCfItems, livePayments,
  salesOrders, salesOrderItems,
  quotations, quotationItems,
  invoices, invoiceItems, taxInvoices, taxInvoiceItems, receipts, receiptItems,
  fixedAssets, assetDepreciations, purchaseOrders, expenses,
  billingNotes, posTransactions, depositReceipts, salesCreditNotes, deliveryNotes, pipelineDeals, supplierQuotes, supplierPortalTokens,
  type Tenant, type InsertTenant,
  type User, type InsertUser, type Company, type InsertCompany,
  type Employee, type InsertEmployee, type AttendanceRecord, type InsertAttendance,
  
  type OtRecord, type InsertOt, type LeaveRequest, type InsertLeave,
  leavePolicies, leaveBalances,
  type LeavePolicy, type InsertLeavePolicy,
  type LeaveBalance, type InsertLeaveBalance,
  type FirmClient, type InsertFirmClient,
  type Account, type InsertAccount, type JournalEntry, type InsertJournalEntry,
  type JournalLine, type InsertJournalLine, type RolePermission, type InsertRolePermission,
  type UserSubPermission,
  type AccountingFormula, type InsertAccountingFormula,
  type AccountingFormulaLine, type InsertAccountingFormulaLine,
  type DocumentSettings, type InsertDocumentSettings,
  type BomHeader, type InsertBomHeader, type BomLine, type InsertBomLine,
  type ProductBundle, type InsertProductBundle,
  type Promotion, type InsertPromotion, type PromotionRule, type InsertPromotionRule,
  type ProductMapping, type InsertProductMapping,
  type ProductStock, type InsertProductStock,
  type StockMovement, type InsertStockMovement,
  type Contact, type InsertContact,
  type Product, type InsertProduct,
  type ContactSettings, type InsertContactSettings,
  type EcommerceConnection, type InsertEcommerceConnection,
  type EcommerceOrder, type InsertEcommerceOrder,
  type EcommerceOrderItem, type InsertEcommerceOrderItem,
  type EcommerceProductMapping, type InsertEcommerceProductMapping,
  type LiveSession, type InsertLiveSession,
  type LiveSessionProduct, type InsertLiveSessionProduct,
  type LiveCfOrder, type InsertLiveCfOrder,
  type LiveCfItem, type InsertLiveCfItem,
  type LivePayment, type InsertLivePayment,
  type SalesOrder, type InsertSalesOrder,
  type SalesOrderItem, type InsertSalesOrderItem,
  type Quotation, type InsertQuotation,
  type QuotationItem, type InsertQuotationItem,
  type FixedAsset, type InsertFixedAsset,
  type AssetDepreciation, type InsertAssetDepreciation,
  holidays,
  type Holiday, type InsertHoliday,
  payrollRecords,
  type PayrollRecord, type InsertPayrollRecord,
  taskBoards, taskBoardMembers, taskColumns, tasks, taskAssignees, taskComments,
  type TaskBoard, type InsertTaskBoard,
  type TaskBoardMember, type InsertTaskBoardMember,
  type TaskColumn, type InsertTaskColumn,
  type Task, type InsertTask,
  type TaskAssignee, type InsertTaskAssignee,
  type TaskComment, type InsertTaskComment,
  contracts, clientUploadLinks, clientUploadFiles,
  type Contract, type InsertContract,
  workBoards, workBoardGroups, workBoardColumns, workBoardItems,
  type WorkBoard, type InsertWorkBoard,
  type WorkBoardGroup, type InsertWorkBoardGroup,
  type WorkBoardColumn, type InsertWorkBoardColumn,
  type WorkBoardItem, type InsertWorkBoardItem,
  subscriptionPlans, tenantSubscriptions,
  type SubscriptionPlan, type InsertSubscriptionPlan,
  type TenantSubscription, type InsertTenantSubscription,
  whiteLabelSettings,
  type WhiteLabelSettings, type InsertWhiteLabelSettings,
  workStatusBoards, workStatusColumns, workStatusGroups, workStatusRows, workStatusCells, workStatusAttachments,
  type WorkStatusBoard, type InsertWorkStatusBoard,
  type WorkStatusColumn, type InsertWorkStatusColumn,
  type WorkStatusGroup, type InsertWorkStatusGroup,
  type WorkStatusRow, type InsertWorkStatusRow,
  type WorkStatusCell, type InsertWorkStatusCell,
  type WorkStatusAttachment, type InsertWorkStatusAttachment,
  firmFolders, firmDocuments,
  type FirmFolder, type InsertFirmFolder,
  type FirmDocument, type InsertFirmDocument,
  payrollAdjustments,
  type PayrollAdjustment, type InsertPayrollAdjustment,
  evaluationPeriods, evaluationResults,
  type EvaluationPeriod, type InsertEvaluationPeriod,
  type EvaluationResult, type InsertEvaluationResult,
  lineGroupMappings, lineDocuments,
  type LineGroupMapping, type InsertLineGroupMapping,
  type LineDocument, type InsertLineDocument,
  financialNotes,
  type FinancialNotes,
  scannerEmployeeMappings, scannerImportLogs,
  type ScannerEmployeeMapping, type InsertScannerEmployeeMapping,
  type ScannerImportLog, type InsertScannerImportLog,
} from "@shared/schema";

// ── Product split sync helper (ENTRY #007, 2026-05-10) ────────────────────
// Keeps active_products / inactive_products in sync with products table.
// SELECT FROM products ensures every column is always synced correctly.
const _PCOLS = `id, company_id, code, name, name_en, name_zh, description, category, product_type, unit, price, cost, price_retail, price_wholesale, price_agent, price_special, price_vip, vat_type, vat_included, account_code, barcode, image_url, low_stock_threshold, track_lots, created_at`;

async function syncProductSplit(id: number, isActive: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    if (isActive) {
      // Step 1: Clear target — ensures plain INSERT below never conflicts
      await tx.execute(sql.raw(`DELETE FROM active_products WHERE id = ${id}`));
      // Step 2: Plain INSERT (no ON CONFLICT) — any failure here is a real error
      await tx.execute(sql.raw(`INSERT INTO active_products (${_PCOLS}) SELECT ${_PCOLS} FROM products WHERE id = ${id}`));
      // Step 3: Remove source only after target is confirmed written
      await tx.execute(sql.raw(`DELETE FROM inactive_products WHERE id = ${id}`));
    } else {
      // Step 1: Clear target — ensures plain INSERT below never conflicts
      await tx.execute(sql.raw(`DELETE FROM inactive_products WHERE id = ${id}`));
      // Step 2: Plain INSERT (no ON CONFLICT) — any failure here is a real error
      await tx.execute(sql.raw(`INSERT INTO inactive_products (${_PCOLS}, deactivated_at) SELECT ${_PCOLS}, NOW() FROM products WHERE id = ${id}`));
      // Step 3: Remove source only after target is confirmed written
      await tx.execute(sql.raw(`DELETE FROM active_products WHERE id = ${id}`));
    }
  });
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;

  getCompanies(): Promise<Company[]>;
  getCompaniesForUser(userId: number, tenantId?: number, role?: string): Promise<Company[]>;
  getCompany(id: number): Promise<Company | undefined>;
  getPrimaryCompany(): Promise<Company | undefined>;
  createCompany(company: InsertCompany): Promise<Company>;
  updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company | undefined>;
  setCompanyPrimary(id: number): Promise<void>;

  getEmployees(tenantId?: number, companyId?: number): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  getEmployeeByUserId(userId: number): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee | undefined>;

  getEmployeeCounter(companyId: number): Promise<EmployeeCounter | undefined>;
  createEmployeeCounter(data: InsertEmployeeCounter): Promise<EmployeeCounter>;
  nextEmployeeCode(companyId: number): Promise<string>;

  getAttendanceByEmployee(employeeId: number): Promise<AttendanceRecord[]>;
  getAttendanceByDate(employeeId: number, date: string): Promise<AttendanceRecord | undefined>;
  createAttendance(record: InsertAttendance): Promise<AttendanceRecord>;
  updateAttendance(id: number, data: Partial<InsertAttendance>): Promise<AttendanceRecord | undefined>;

  getScannerMappings(companyId: number): Promise<ScannerEmployeeMapping[]>;
  createScannerMapping(mapping: InsertScannerEmployeeMapping): Promise<ScannerEmployeeMapping>;
  updateScannerMapping(id: number, data: Partial<InsertScannerEmployeeMapping>): Promise<ScannerEmployeeMapping | undefined>;
  deleteScannerMapping(id: number): Promise<boolean>;
  getScannerMappingByCode(companyId: number, scannerDeviceId: string, scannerEmployeeCode: string): Promise<ScannerEmployeeMapping | undefined>;

  getScannerImportLogs(companyId: number): Promise<ScannerImportLog[]>;
  createScannerImportLog(log: InsertScannerImportLog): Promise<ScannerImportLog>;

  getOtByEmployee(employeeId: number): Promise<OtRecord[]>;
  getAllOt(tenantId?: number, companyId?: number): Promise<OtRecord[]>;
  createOt(record: InsertOt): Promise<OtRecord>;
  updateOtStatus(id: number, status: string, approvedBy?: number): Promise<OtRecord | undefined>;

  getLeavesByEmployee(employeeId: number): Promise<LeaveRequest[]>;
  getAllLeaves(tenantId?: number): Promise<LeaveRequest[]>;
  createLeave(leave: InsertLeave): Promise<LeaveRequest>;
  updateLeaveStatus(id: number, status: string, approvedBy?: number): Promise<LeaveRequest | undefined>;

  getLeavePolicies(companyId: number): Promise<LeavePolicy[]>;
  getLeavePolicy(id: number): Promise<LeavePolicy | undefined>;
  createLeavePolicy(policy: InsertLeavePolicy): Promise<LeavePolicy>;
  updateLeavePolicy(id: number, data: Partial<InsertLeavePolicy>): Promise<LeavePolicy | undefined>;
  deleteLeavePolicy(id: number): Promise<boolean>;

  getLeaveBalances(employeeId: number, year: number): Promise<LeaveBalance[]>;
  getLeaveBalancesByCompany(companyId: number, year: number): Promise<LeaveBalance[]>;
  upsertLeaveBalance(balance: InsertLeaveBalance): Promise<LeaveBalance>;

  getFirmClients(tenantId?: number, employeeId?: number): Promise<any[]>;
  getFirmClient(id: number): Promise<FirmClient | undefined>;
  createFirmClient(client: InsertFirmClient): Promise<FirmClient>;
  updateFirmClient(id: number, data: Partial<InsertFirmClient>): Promise<FirmClient | undefined>;
  deleteFirmClient(id: number): Promise<boolean>;

  getAccounts(companyId?: number): Promise<Account[]>;
  createAccount(account: InsertAccount): Promise<Account>;

  getJournalEntries(companyId?: number): Promise<JournalEntry[]>;
  createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry>;
  getJournalLines(entryId: number): Promise<JournalLine[]>;
  createJournalLine(line: InsertJournalLine): Promise<JournalLine>;

  getDashboardStats(companyId?: number, rangeFrom?: string, rangeTo?: string): Promise<any>;
  getEcommerceStats(companyId: number): Promise<any>;
  getFirmStats(): Promise<any>;

  getRolePermissions(): Promise<RolePermission[]>;
  getRolePermissionsByRole(role: string): Promise<RolePermission[]>;
  setRolePermission(role: string, moduleKey: string, allowed: boolean): Promise<RolePermission>;
  initDefaultPermissions(): Promise<void>;

  getUserSubPermissions(userId: number): Promise<UserSubPermission[]>;
  setUserSubPermission(userId: number, subModuleKey: string, allowed: boolean): Promise<UserSubPermission>;
  bulkSetUserSubPermissions(userId: number, permissions: { subModuleKey: string; allowed: boolean }[]): Promise<void>;

  getTenants(): Promise<Tenant[]>;
  getTenant(id: number): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant | undefined>;
  getTenantStats(): Promise<any>;

  getAccountingFormulas(companyId?: number | null, businessType?: string, documentType?: string): Promise<AccountingFormula[]>;
  getAccountingFormula(id: number): Promise<AccountingFormula | undefined>;
  createAccountingFormula(formula: InsertAccountingFormula): Promise<AccountingFormula>;
  updateAccountingFormula(id: number, data: Partial<InsertAccountingFormula>): Promise<AccountingFormula | undefined>;
  deleteAccountingFormula(id: number): Promise<boolean>;
  getFormulaLines(formulaId: number): Promise<AccountingFormulaLine[]>;
  setFormulaLines(formulaId: number, lines: Omit<InsertAccountingFormulaLine, "formulaId">[]): Promise<AccountingFormulaLine[]>;
  seedDefaultFormulas(companyId: number, businessType: string, txOverride?: any): Promise<void>;

  getDocumentSettings(companyId: number): Promise<DocumentSettings | undefined>;
  upsertDocumentSettings(companyId: number, data: Partial<InsertDocumentSettings>): Promise<DocumentSettings>;
  updateUserSignature(userId: number, data: { signatureUrl?: string | null; signatureName?: string | null; signatureNameEn?: string | null; signatureNameZh?: string | null; signatureTitle?: string | null; signatureTitleEn?: string | null; signatureTitleZh?: string | null }): Promise<User>;

  getContacts(companyId: number, type?: string): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined>;
  deleteContact(id: number): Promise<boolean>;

  getProducts(companyId: number, category?: string): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;

  findDuplicateContacts(companyId: number, opts: { taxId?: string; name?: string; code?: string; excludeId?: number }): Promise<Contact[]>;
  findDuplicateProducts(companyId: number, opts: { code?: string; name?: string; excludeId?: number }): Promise<Product[]>;
  bulkCreateContacts(contactList: InsertContact[]): Promise<Contact[]>;
  bulkCreateProducts(productList: InsertProduct[]): Promise<Product[]>;
  getContactSettings(companyId: number): Promise<ContactSettings | undefined>;
  upsertContactSettings(data: InsertContactSettings): Promise<ContactSettings>;
  getNextContactCode(companyId: number): Promise<string>;

  getBomHeaders(companyId: number, productId?: number): Promise<BomHeader[]>;
  getBomHeader(id: number): Promise<BomHeader | undefined>;
  createBomHeader(data: InsertBomHeader): Promise<BomHeader>;
  updateBomHeader(id: number, data: Partial<InsertBomHeader>): Promise<BomHeader | undefined>;
  deleteBomHeader(id: number): Promise<boolean>;
  getBomLines(bomId: number): Promise<BomLine[]>;
  setBomLines(bomId: number, lines: InsertBomLine[]): Promise<BomLine[]>;

  getProductBundles(bundleProductId: number): Promise<ProductBundle[]>;
  setProductBundles(bundleProductId: number, items: InsertProductBundle[]): Promise<ProductBundle[]>;

  getPromotions(companyId: number): Promise<Promotion[]>;
  getPromotion(id: number): Promise<Promotion | undefined>;
  createPromotion(data: InsertPromotion): Promise<Promotion>;
  updatePromotion(id: number, data: Partial<InsertPromotion>): Promise<Promotion | undefined>;
  deletePromotion(id: number): Promise<boolean>;
  getPromotionRules(promotionId: number): Promise<PromotionRule[]>;
  setPromotionRules(promotionId: number, rules: InsertPromotionRule[]): Promise<PromotionRule[]>;

  getProductMappings(companyId: number, sellProductId?: number): Promise<ProductMapping[]>;
  getProductMapping(id: number): Promise<ProductMapping | undefined>;
  createProductMapping(data: InsertProductMapping): Promise<ProductMapping>;
  updateProductMapping(id: number, data: Partial<InsertProductMapping>): Promise<ProductMapping | undefined>;
  deleteProductMapping(id: number): Promise<boolean>;
  getMappingsForSellProduct(sellProductId: number): Promise<ProductMapping[]>;

  getProductStock(companyId: number, productId?: number): Promise<ProductStock[]>;
  upsertProductStock(companyId: number, productId: number, quantity: string): Promise<ProductStock>;
  adjustStock(companyId: number, productId: number, delta: string, movementType: string, notes?: string, referenceType?: string, referenceId?: number): Promise<ProductStock>;
  getStockMovements(companyId: number, productId?: number): Promise<StockMovement[]>;

  getEcommerceConnections(companyId: number): Promise<EcommerceConnection[]>;
  getEcommerceConnection(id: number): Promise<EcommerceConnection | undefined>;
  createEcommerceConnection(data: InsertEcommerceConnection): Promise<EcommerceConnection>;
  updateEcommerceConnection(id: number, data: Partial<InsertEcommerceConnection>): Promise<EcommerceConnection | undefined>;
  deleteEcommerceConnection(id: number): Promise<boolean>;
  getEcommerceOrders(companyId: number, connectionId?: number, status?: string, options?: { startDate?: string; endDate?: string; platform?: string; hasDocument?: string }): Promise<EcommerceOrder[]>;
  getEcommerceOrder(id: number): Promise<EcommerceOrder | undefined>;
  createEcommerceOrder(data: InsertEcommerceOrder): Promise<EcommerceOrder>;
  updateEcommerceOrder(id: number, data: Partial<InsertEcommerceOrder>): Promise<EcommerceOrder | undefined>;
  getEcommerceOrderItems(orderId: number): Promise<EcommerceOrderItem[]>;
  createEcommerceOrderItem(data: InsertEcommerceOrderItem): Promise<EcommerceOrderItem>;
  getEcommerceProductMappings(companyId: number, connectionId?: number): Promise<EcommerceProductMapping[]>;
  createEcommerceProductMapping(data: InsertEcommerceProductMapping): Promise<EcommerceProductMapping>;
  deleteEcommerceProductMapping(id: number): Promise<boolean>;

  getLiveSessions(companyId: number): Promise<LiveSession[]>;
  getLiveSession(id: number): Promise<LiveSession | undefined>;
  createLiveSession(data: InsertLiveSession): Promise<LiveSession>;
  updateLiveSession(id: number, data: Partial<InsertLiveSession>): Promise<LiveSession | undefined>;
  getLiveSessionProducts(sessionId: number): Promise<LiveSessionProduct[]>;
  createLiveSessionProduct(data: InsertLiveSessionProduct): Promise<LiveSessionProduct>;
  updateLiveSessionProduct(id: number, data: Partial<InsertLiveSessionProduct>): Promise<LiveSessionProduct | undefined>;
  deleteLiveSessionProduct(id: number): Promise<boolean>;
  getLiveCfOrders(companyId: number, sessionId?: number, status?: string): Promise<LiveCfOrder[]>;
  getLiveCfOrder(id: number): Promise<LiveCfOrder | undefined>;
  createLiveCfOrder(data: InsertLiveCfOrder): Promise<LiveCfOrder>;
  updateLiveCfOrder(id: number, data: Partial<InsertLiveCfOrder>): Promise<LiveCfOrder | undefined>;
  getLiveCfItems(cfOrderId: number): Promise<LiveCfItem[]>;
  createLiveCfItem(data: InsertLiveCfItem): Promise<LiveCfItem>;
  getLivePayments(cfOrderId: number): Promise<LivePayment[]>;
  createLivePayment(data: InsertLivePayment): Promise<LivePayment>;
  updateLivePayment(id: number, data: Partial<InsertLivePayment>): Promise<LivePayment | undefined>;

  getFixedAssets(companyId: number): Promise<FixedAsset[]>;
  getFixedAsset(id: number): Promise<FixedAsset | undefined>;
  createFixedAsset(data: InsertFixedAsset): Promise<FixedAsset>;
  updateFixedAsset(id: number, data: Partial<InsertFixedAsset>): Promise<FixedAsset | undefined>;
  deleteFixedAsset(id: number): Promise<boolean>;
  getAssetDepreciations(assetId: number): Promise<AssetDepreciation[]>;
  createAssetDepreciation(data: InsertAssetDepreciation): Promise<AssetDepreciation>;
  getNextAssetCode(companyId: number): Promise<string>;

  getHolidays(companyId: number, year?: number): Promise<Holiday[]>;
  getHoliday(id: number): Promise<Holiday | undefined>;
  createHoliday(data: InsertHoliday): Promise<Holiday>;
  updateHoliday(id: number, data: Partial<InsertHoliday>): Promise<Holiday | undefined>;
  deleteHoliday(id: number): Promise<boolean>;

  getPayrollRecords(companyId: number, month: number, year: number): Promise<PayrollRecord[]>;
  getPayrollRecordsByYear(companyId: number, year: number): Promise<PayrollRecord[]>;
  getPayrollRecord(id: number): Promise<PayrollRecord | undefined>;
  createPayrollRecord(data: InsertPayrollRecord): Promise<PayrollRecord>;
  updatePayrollRecord(id: number, data: Partial<InsertPayrollRecord>): Promise<PayrollRecord | undefined>;
  deletePayrollRecordsByMonth(companyId: number, month: number, year: number): Promise<boolean>;
  deletePayrollRecord(id: number): Promise<boolean>;
  updatePayrollStatus(companyId: number, month: number, year: number, status: string): Promise<void>;

  getTaskBoards(companyId: number): Promise<TaskBoard[]>;
  getTaskBoard(id: number): Promise<TaskBoard | undefined>;
  createTaskBoard(data: InsertTaskBoard): Promise<TaskBoard>;
  updateTaskBoard(id: number, data: Partial<InsertTaskBoard>): Promise<TaskBoard | undefined>;
  deleteTaskBoard(id: number): Promise<boolean>;
  getTaskBoardMembers(boardId: number): Promise<TaskBoardMember[]>;
  addTaskBoardMember(data: InsertTaskBoardMember): Promise<TaskBoardMember>;
  removeTaskBoardMember(boardId: number, userId: number): Promise<boolean>;
  getTaskColumns(boardId: number): Promise<TaskColumn[]>;
  createTaskColumn(data: InsertTaskColumn): Promise<TaskColumn>;
  updateTaskColumn(id: number, data: Partial<InsertTaskColumn>): Promise<TaskColumn | undefined>;
  deleteTaskColumn(id: number): Promise<boolean>;
  getTasks(boardId: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;
  getTaskAssignees(taskId: number): Promise<TaskAssignee[]>;
  addTaskAssignee(data: InsertTaskAssignee): Promise<TaskAssignee>;
  removeTaskAssignee(taskId: number, employeeId: number): Promise<boolean>;
  getTaskComments(taskId: number): Promise<TaskComment[]>;
  createTaskComment(data: InsertTaskComment): Promise<TaskComment>;
  deleteTaskComment(id: number): Promise<boolean>;

  getContracts(companyId: number): Promise<Contract[]>;
  getContractsByClient(firmClientId: number): Promise<Contract[]>;
  getContract(id: number): Promise<Contract | undefined>;
  getContractByToken(token: string): Promise<Contract | undefined>;
  createContract(data: InsertContract): Promise<Contract>;
  updateContract(id: number, data: Partial<InsertContract>): Promise<Contract | undefined>;
  deleteContract(id: number): Promise<boolean>;

  getWorkBoards(companyId: number): Promise<WorkBoard[]>;
  getWorkBoard(id: number): Promise<WorkBoard | undefined>;
  createWorkBoard(data: InsertWorkBoard): Promise<WorkBoard>;
  updateWorkBoard(id: number, data: Partial<InsertWorkBoard>): Promise<WorkBoard | undefined>;
  deleteWorkBoard(id: number): Promise<void>;
  duplicateWorkBoard(id: number, userId: number): Promise<WorkBoard>;
  getWorkBoardGroups(boardId: number): Promise<WorkBoardGroup[]>;
  createWorkBoardGroup(data: InsertWorkBoardGroup): Promise<WorkBoardGroup>;
  updateWorkBoardGroup(id: number, data: Partial<InsertWorkBoardGroup>): Promise<WorkBoardGroup | undefined>;
  deleteWorkBoardGroup(id: number): Promise<void>;
  getWorkBoardColumns(boardId: number): Promise<WorkBoardColumn[]>;
  createWorkBoardColumn(data: InsertWorkBoardColumn): Promise<WorkBoardColumn>;
  updateWorkBoardColumn(id: number, data: Partial<InsertWorkBoardColumn>): Promise<WorkBoardColumn | undefined>;
  deleteWorkBoardColumn(id: number): Promise<void>;
  getWorkBoardItems(boardId: number): Promise<WorkBoardItem[]>;
  createWorkBoardItem(data: InsertWorkBoardItem): Promise<WorkBoardItem>;
  updateWorkBoardItem(id: number, data: Partial<InsertWorkBoardItem>): Promise<WorkBoardItem | undefined>;
  deleteWorkBoardItem(id: number): Promise<void>;

  getFirmFolders(tenantId: number, companyId?: number): Promise<FirmFolder[]>;
  createFirmFolder(data: InsertFirmFolder): Promise<FirmFolder>;
  updateFirmFolder(id: number, data: Partial<InsertFirmFolder>): Promise<FirmFolder | undefined>;
  deleteFirmFolder(id: number): Promise<void>;

  getFirmDocuments(tenantId: number, category?: string, companyId?: number): Promise<FirmDocument[]>;
  getFirmDocumentsByFolder(tenantId: number, folderId: number | null, companyId?: number): Promise<FirmDocument[]>;
  createFirmDocument(data: InsertFirmDocument): Promise<FirmDocument>;
  updateFirmDocument(id: number, data: Partial<InsertFirmDocument>): Promise<FirmDocument | undefined>;
  deleteFirmDocument(id: number): Promise<void>;

  getPayrollAdjustments(companyId: number, month: number, year: number): Promise<PayrollAdjustment[]>;
  getPayrollAdjustmentsByEmployee(employeeId: number, month: number, year: number): Promise<PayrollAdjustment[]>;
  createPayrollAdjustment(data: InsertPayrollAdjustment): Promise<PayrollAdjustment>;
  updatePayrollAdjustment(id: number, data: Partial<InsertPayrollAdjustment>): Promise<PayrollAdjustment | undefined>;
  deletePayrollAdjustment(id: number): Promise<boolean>;

  // LINE Group Document Archive
  getLineGroupMappings(tenantId: number, companyId?: number): Promise<LineGroupMapping[]>;
  getLineGroupMappingByGroupId(lineGroupId: string): Promise<LineGroupMapping | undefined>;
  createLineGroupMapping(data: InsertLineGroupMapping): Promise<LineGroupMapping>;
  updateLineGroupMapping(id: number, data: Partial<InsertLineGroupMapping>, tenantId?: number): Promise<LineGroupMapping | undefined>;
  deleteLineGroupMapping(id: number, tenantId?: number): Promise<boolean>;
  getLineDocuments(tenantId: number, filters?: { firmClientId?: number; lineGroupId?: string; fileType?: string; category?: string; companyId?: number }): Promise<LineDocument[]>;
  createLineDocument(data: InsertLineDocument): Promise<LineDocument>;
  deleteLineDocument(id: number): Promise<boolean>;
  getFinancialNotes(companyId: number, fiscalYear: number): Promise<FinancialNotes | undefined>;
  upsertFinancialNotes(companyId: number, fiscalYear: number, sections: any[], status?: string): Promise<FinancialNotes>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.id);
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async getCompanies(): Promise<Company[]> {
    return db.select().from(companies).where(eq(companies.active, true));
  }

  async getCompaniesForUser(userId: number, tenantId?: number, role?: string): Promise<Company[]> {
    const employee = await this.getEmployeeByUserId(userId);
    if (!employee) {
      const user0 = await db.select().from(users).where(eq(users.id, userId));
      const allowedIds = user0[0]?.allowedCompanyIds;
      if (allowedIds && allowedIds.length > 0) {
        return db.select().from(companies).where(and(eq(companies.active, true), inArray(companies.id, allowedIds)));
      }
      if (role === "client") {
        return [];
      }
      if (tenantId) {
        const [tenant] = await db.select({ tenantType: tenants.tenantType }).from(tenants).where(eq(tenants.id, tenantId));
        const isAccountingFirm = tenant?.tenantType === "accounting_firm";
        const conditions: any[] = [eq(companies.active, true), eq(companies.tenantId, tenantId)];
        if (isAccountingFirm || role === "manager") {
          conditions.push(eq(companies.isPrimary, true));
        }
        return db.select().from(companies)
          .where(and(...conditions))
          .orderBy(desc(companies.isPrimary), companies.name);
      }
      const primaryOnly = await db.select().from(companies).where(and(eq(companies.active, true), eq(companies.isPrimary, true)));
      return primaryOnly;
    }

    if (role === "client") {
      const user = await db.select().from(users).where(eq(users.id, userId));
      const allowedIds = user[0]?.allowedCompanyIds;
      if (allowedIds && allowedIds.length > 0) {
        return db.select().from(companies).where(and(eq(companies.active, true), inArray(companies.id, allowedIds)));
      }
      const empCompanyId = employee.companyId;
      if (empCompanyId) {
        return db.select().from(companies).where(and(eq(companies.active, true), eq(companies.id, empCompanyId)));
      }
      return [];
    }

    const user2 = await db.select().from(users).where(eq(users.id, userId));
    const allowedIds = user2[0]?.allowedCompanyIds;
    if (allowedIds && allowedIds.length > 0) {
      return db.select().from(companies).where(and(eq(companies.active, true), inArray(companies.id, allowedIds)));
    }

    const tenantConditions: any[] = [eq(companies.active, true)];
    if (tenantId) {
      tenantConditions.push(eq(companies.tenantId, tenantId));
    }
    const tenantCompanies = await db.select().from(companies).where(and(...tenantConditions));
    const primaryCompany = tenantCompanies.find(c => c.isPrimary);
    const isPrimaryEmployee = employee.companyId && primaryCompany && employee.companyId === primaryCompany.id;

    if (employee.companyId && !isPrimaryEmployee) {
      return db.select().from(companies).where(and(eq(companies.active, true), eq(companies.id, employee.companyId)));
    }

    const assignedClients = await db.select().from(firmClients).where(eq(firmClients.assignedTo, employee.id));
    const assignedCompanyIds = assignedClients.map(c => c.companyId).filter((id): id is number => id !== null);
    const teamClients = await db.select({ firmClientId: firmClientTeam.firmClientId })
      .from(firmClientTeam).where(eq(firmClientTeam.employeeId, employee.id));
    const teamClientIds = teamClients.map(t => t.firmClientId);
    let teamCompanyIds: number[] = [];
    if (teamClientIds.length > 0) {
      const teamFirmClients = await db.select({ companyId: firmClients.companyId })
        .from(firmClients).where(inArray(firmClients.id, teamClientIds));
      teamCompanyIds = teamFirmClients.map(c => c.companyId).filter((id): id is number => id !== null);
    }
    const primaryIds = primaryCompany ? [primaryCompany.id] : [];
    const allIds = Array.from(new Set([...primaryIds, ...assignedCompanyIds, ...teamCompanyIds]));
    if (allIds.length === 0) {
      return tenantCompanies.filter(c => c.isPrimary);
    }
    return db.select().from(companies).where(and(eq(companies.active, true), inArray(companies.id, allIds)));
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async getPrimaryCompany(): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.isPrimary, true));
    return company;
  }

  async createCompany(company: InsertCompany): Promise<Company> {
    const [created] = await db.insert(companies).values(company).returning();
    try {
      const { ensureCompanyFolderCode } = await import("./services/folder-codes");
      await ensureCompanyFolderCode(created.id);
    } catch (e: any) {
      console.log("Auto folder code for company:", e.message);
    }
    return created;
  }

  async updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [updated] = await db.update(companies).set(data).where(eq(companies.id, id)).returning();
    if (updated && (data.name !== undefined || data.taxId !== undefined || data.active !== undefined)) {
      try {
        const { markCompanyDirty } = await import("./services/folder-codes");
        await markCompanyDirty(id, data.name || undefined, data.taxId || undefined);
      } catch (e: any) {
        console.log("Mark company dirty:", e.message);
      }
    }
    return updated;
  }

  async setCompanyPrimary(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const [target] = await tx.select().from(companies).where(eq(companies.id, id));
      if (!target) throw new Error("ไม่พบบริษัท");
      const clearWhere = target.tenantId
        ? and(eq(companies.isPrimary, true), eq(companies.tenantId, target.tenantId))
        : eq(companies.isPrimary, true);
      await tx.update(companies).set({ isPrimary: false }).where(clearWhere);
      await tx.update(companies).set({ isPrimary: true }).where(eq(companies.id, id));
    });
  }

  async getEmployees(tenantId?: number, companyId?: number): Promise<Employee[]> {
    const conditions = [];
    if (companyId) {
      conditions.push(eq(employees.companyId, companyId));
      if (tenantId) {
        conditions.push(eq(employees.tenantId, tenantId));
      }
    } else if (tenantId) {
      conditions.push(eq(employees.tenantId, tenantId));
    } else {
      console.warn("[SECURITY] getEmployees called without tenantId or companyId — returning empty");
      return [];
    }
    return db.select().from(employees).where(and(...conditions)).orderBy(
      sql`COALESCE(substring(${employees.employeeCode} from '^([A-Za-z]+)'), '')`,
      sql`COALESCE(NULLIF(substring(${employees.employeeCode} from '([0-9]+)$'), ''), '0')::bigint`,
      asc(employees.id),
    );
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const [employee] = await db.select().from(employees).where(eq(employees.id, id));
    return employee;
  }

  async getEmployeeByUserId(userId: number): Promise<Employee | undefined> {
    const [employee] = await db.select().from(employees).where(eq(employees.userId, userId));
    return employee;
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const [created] = await db.insert(employees).values(employee).returning();
    return created;
  }

  async getEmployeeCounter(companyId: number): Promise<EmployeeCounter | undefined> {
    const [counter] = await db.select().from(employeeCounters).where(eq(employeeCounters.companyId, companyId));
    return counter;
  }

  async createEmployeeCounter(data: InsertEmployeeCounter): Promise<EmployeeCounter> {
    const [created] = await db.insert(employeeCounters).values(data).returning();
    return created;
  }

  async nextEmployeeCode(companyId: number): Promise<string> {
    const [updated] = await db.update(employeeCounters)
      .set({ lastNumber: sql`${employeeCounters.lastNumber} + 1` })
      .where(eq(employeeCounters.companyId, companyId))
      .returning();
    if (!updated) throw new Error(`ไม่พบ employee counter สำหรับบริษัท ${companyId} — กรุณาตั้งค่า prefix ก่อน`);
    return updated.prefix + String(updated.lastNumber).padStart(4, "0");
  }

  async updateEmployee(id: number, data: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const [updated] = await db.update(employees).set(data).where(eq(employees.id, id)).returning();
    return updated;
  }

  async getAttendanceByEmployee(employeeId: number): Promise<AttendanceRecord[]> {
    return db.select().from(attendanceRecords)
      .where(eq(attendanceRecords.employeeId, employeeId))
      .orderBy(desc(attendanceRecords.date));
  }

  async getAttendanceByDate(employeeId: number, date: string): Promise<AttendanceRecord | undefined> {
    const [record] = await db.select().from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.date, date)));
    return record;
  }

  async createAttendance(record: InsertAttendance): Promise<AttendanceRecord> {
    const [created] = await db.insert(attendanceRecords).values(record).returning();
    return created;
  }

  async updateAttendance(id: number, data: Partial<InsertAttendance>): Promise<AttendanceRecord | undefined> {
    const [updated] = await db.update(attendanceRecords).set(data).where(eq(attendanceRecords.id, id)).returning();
    return updated;
  }

  async getScannerMappings(companyId: number): Promise<ScannerEmployeeMapping[]> {
    return db.select().from(scannerEmployeeMappings)
      .where(eq(scannerEmployeeMappings.companyId, companyId));
  }

  async createScannerMapping(mapping: InsertScannerEmployeeMapping): Promise<ScannerEmployeeMapping> {
    const [created] = await db.insert(scannerEmployeeMappings).values(mapping).returning();
    return created;
  }

  async updateScannerMapping(id: number, data: Partial<InsertScannerEmployeeMapping>): Promise<ScannerEmployeeMapping | undefined> {
    const [updated] = await db.update(scannerEmployeeMappings).set(data).where(eq(scannerEmployeeMappings.id, id)).returning();
    return updated;
  }

  async deleteScannerMapping(id: number): Promise<boolean> {
    const result = await db.delete(scannerEmployeeMappings).where(eq(scannerEmployeeMappings.id, id));
    return true;
  }

  async getScannerMappingByCode(companyId: number, scannerDeviceId: string, scannerEmployeeCode: string): Promise<ScannerEmployeeMapping | undefined> {
    const [record] = await db.select().from(scannerEmployeeMappings)
      .where(and(
        eq(scannerEmployeeMappings.companyId, companyId),
        eq(scannerEmployeeMappings.scannerDeviceId, scannerDeviceId),
        eq(scannerEmployeeMappings.scannerEmployeeCode, scannerEmployeeCode)
      ));
    return record;
  }

  async getScannerImportLogs(companyId: number): Promise<ScannerImportLog[]> {
    return db.select().from(scannerImportLogs)
      .where(eq(scannerImportLogs.companyId, companyId))
      .orderBy(desc(scannerImportLogs.importedAt));
  }

  async createScannerImportLog(log: InsertScannerImportLog): Promise<ScannerImportLog> {
    const [created] = await db.insert(scannerImportLogs).values(log).returning();
    return created;
  }

  async getOtByEmployee(employeeId: number): Promise<OtRecord[]> {
    return db.select().from(otRecords)
      .where(eq(otRecords.employeeId, employeeId))
      .orderBy(desc(otRecords.date));
  }

  async getAllOt(tenantId?: number, companyId?: number): Promise<OtRecord[]> {
    const conditions = [];
    if (companyId) {
      conditions.push(inArray(otRecords.employeeId, db.select({ id: employees.id }).from(employees).where(eq(employees.companyId, companyId))));
    } else if (tenantId) {
      conditions.push(inArray(otRecords.employeeId, db.select({ id: employees.id }).from(employees).where(eq(employees.tenantId, tenantId))));
    }
    if (conditions.length > 0) {
      return db.select().from(otRecords)
        .where(and(...conditions))
        .orderBy(desc(otRecords.date));
    }
    return db.select().from(otRecords)
      .orderBy(desc(otRecords.date));
  }

  async createOt(record: InsertOt): Promise<OtRecord> {
    const [created] = await db.insert(otRecords).values(record).returning();
    return created;
  }

  async updateOtStatus(id: number, status: string, approvedBy?: number): Promise<OtRecord | undefined> {
    const data: any = { status };
    if (approvedBy) data.approvedBy = approvedBy;
    const [updated] = await db.update(otRecords).set(data).where(eq(otRecords.id, id)).returning();
    return updated;
  }

  async getLeavesByEmployee(employeeId: number): Promise<LeaveRequest[]> {
    return db.select().from(leaveRequests)
      .where(eq(leaveRequests.employeeId, employeeId))
      .orderBy(desc(leaveRequests.createdAt));
  }

  async getAllLeaves(tenantId?: number): Promise<LeaveRequest[]> {
    if (tenantId) {
      return db.select().from(leaveRequests)
        .where(inArray(leaveRequests.employeeId, db.select({ id: employees.id }).from(employees).where(eq(employees.tenantId, tenantId))))
        .orderBy(desc(leaveRequests.createdAt));
    }
    return db.select().from(leaveRequests)
      .orderBy(desc(leaveRequests.createdAt));
  }

  async createLeave(leave: InsertLeave): Promise<LeaveRequest> {
    const [created] = await db.insert(leaveRequests).values(leave).returning();
    return created;
  }

  async updateLeaveStatus(id: number, status: string, approvedBy?: number): Promise<LeaveRequest | undefined> {
    const data: any = { status };
    if (approvedBy) {
      data.approvedBy = approvedBy;
      data.approvedAt = new Date();
    }
    const [updated] = await db.update(leaveRequests).set(data).where(eq(leaveRequests.id, id)).returning();
    return updated;
  }

  async getLeavePolicies(companyId: number): Promise<LeavePolicy[]> {
    return db.select().from(leavePolicies).where(eq(leavePolicies.companyId, companyId));
  }

  async getLeavePolicy(id: number): Promise<LeavePolicy | undefined> {
    const [policy] = await db.select().from(leavePolicies).where(eq(leavePolicies.id, id));
    return policy;
  }

  async createLeavePolicy(policy: InsertLeavePolicy): Promise<LeavePolicy> {
    const [created] = await db.insert(leavePolicies).values(policy).returning();
    return created;
  }

  async updateLeavePolicy(id: number, data: Partial<InsertLeavePolicy>): Promise<LeavePolicy | undefined> {
    const [updated] = await db.update(leavePolicies).set(data).where(eq(leavePolicies.id, id)).returning();
    return updated;
  }

  async deleteLeavePolicy(id: number): Promise<boolean> {
    const [deleted] = await db.delete(leavePolicies).where(eq(leavePolicies.id, id)).returning();
    return !!deleted;
  }

  async getLeaveBalances(employeeId: number, year: number): Promise<LeaveBalance[]> {
    return db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.year, year)));
  }

  async getLeaveBalancesByCompany(companyId: number, year: number): Promise<LeaveBalance[]> {
    return db.select().from(leaveBalances)
      .where(and(
        inArray(leaveBalances.employeeId, db.select({ id: employees.id }).from(employees).where(eq(employees.companyId, companyId))),
        eq(leaveBalances.year, year)
      ));
  }

  async upsertLeaveBalance(balance: InsertLeaveBalance): Promise<LeaveBalance> {
    const existing = await db.select().from(leaveBalances)
      .where(and(
        eq(leaveBalances.employeeId, balance.employeeId),
        eq(leaveBalances.year, balance.year),
        eq(leaveBalances.leaveType, balance.leaveType)
      ));
    if (existing.length > 0) {
      const [updated] = await db.update(leaveBalances)
        .set(balance)
        .where(eq(leaveBalances.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(leaveBalances).values(balance).returning();
    return created;
  }

  async getFirmClients(tenantId?: number, employeeId?: number): Promise<any[]> {
    const conditions = [];
    if (tenantId) {
      conditions.push(eq(companies.tenantId, tenantId));
    }
    if (employeeId) {
      const teamClientIds = await db.select({ firmClientId: firmClientTeam.firmClientId })
        .from(firmClientTeam).where(eq(firmClientTeam.employeeId, employeeId));
      const assignedClientIds = await db.select({ id: firmClients.id })
        .from(firmClients).where(eq(firmClients.assignedTo, employeeId));
      const allIds = new Set([
        ...teamClientIds.map(r => r.firmClientId),
        ...assignedClientIds.map(r => r.id),
      ]);
      if (allIds.size === 0) return [];
      conditions.push(inArray(firmClients.id, Array.from(allIds)));
    }
    const results = await db
      .select({
        id: firmClients.id,
        companyId: firmClients.companyId,
        name: firmClients.name,
        branch: firmClients.branch,
        ownerName: firmClients.ownerName,
        chartTemplate: firmClients.chartTemplate,
        contactPerson: firmClients.contactPerson,
        phone: firmClients.phone,
        fax: firmClients.fax,
        email: firmClients.email,
        website: firmClients.website,
        taxId: firmClients.taxId,
        address: firmClients.address,
        assignedTo: firmClients.assignedTo,
        invoiceCount: firmClients.invoiceCount,
        serviceFee: firmClients.serviceFee,
        status: firmClients.status,
        lastSyncAt: firmClients.lastSyncAt,
        billingStatus: firmClients.billingStatus,
        notes: firmClients.notes,
        assignedEmployeeName: employees.nickname,
        assignedEmployeeFullName: employees.fullName,
        businessType: companies.businessType,
      })
      .from(firmClients)
      .leftJoin(employees, eq(firmClients.assignedTo, employees.id))
      .leftJoin(companies, eq(firmClients.companyId, companies.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(firmClients.id));
    return results;
  }

  async getFirmClient(id: number): Promise<FirmClient | undefined> {
    const [client] = await db.select().from(firmClients).where(eq(firmClients.id, id));
    return client;
  }

  async createFirmClient(client: InsertFirmClient): Promise<FirmClient> {
    const [created] = await db.insert(firmClients).values(client).returning();
    return created;
  }

  async updateFirmClient(id: number, data: Partial<InsertFirmClient>): Promise<FirmClient | undefined> {
    const [updated] = await db.update(firmClients).set(data).where(eq(firmClients.id, id)).returning();
    return updated;
  }

  async deleteFirmClient(id: number): Promise<boolean> {
    await db.transaction(async (tx) => {
      await tx.delete(lineGroupMappings).where(eq(lineGroupMappings.firmClientId, id));
      await tx.update(lineDocuments).set({ firmClientId: null }).where(eq(lineDocuments.firmClientId, id));
      const uploadLinks = await tx.select({ id: clientUploadLinks.id }).from(clientUploadLinks).where(eq(clientUploadLinks.firmClientId, id));
      if (uploadLinks.length > 0) {
        await tx.delete(clientUploadFiles).where(inArray(clientUploadFiles.uploadLinkId, uploadLinks.map(l => l.id)));
      }
      await tx.delete(clientUploadLinks).where(eq(clientUploadLinks.firmClientId, id));
      await tx.delete(contracts).where(eq(contracts.firmClientId, id));
      await tx.update(workBoardItems).set({ firmClientId: null }).where(eq(workBoardItems.firmClientId, id));
      const rows = await tx.select({ id: workStatusRows.id }).from(workStatusRows).where(eq(workStatusRows.firmClientId, id));
      if (rows.length > 0) {
        const rowIds = rows.map(r => r.id);
        await tx.delete(workStatusCells).where(inArray(workStatusCells.rowId, rowIds));
        await tx.delete(workStatusAttachments).where(inArray(workStatusAttachments.rowId, rowIds));
        await tx.delete(workStatusRows).where(eq(workStatusRows.firmClientId, id));
      }
      await tx.delete(firmClientTeam).where(eq(firmClientTeam.firmClientId, id));
      await tx.delete(firmClients).where(eq(firmClients.id, id));
    });
    return true;
  }

  async getAccounts(companyId?: number): Promise<Account[]> {
    if (companyId) {
      return db.select().from(accounts).where(eq(accounts.companyId, companyId));
    }
    return db.select().from(accounts);
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    const [created] = await db.insert(accounts).values(account).returning();
    return created;
  }

  async getJournalEntries(companyId?: number): Promise<JournalEntry[]> {
    if (companyId) {
      return db.select().from(journalEntries)
        .where(eq(journalEntries.companyId, companyId))
        .orderBy(desc(journalEntries.entryDate));
    }
    return db.select().from(journalEntries).orderBy(desc(journalEntries.entryDate));
  }

  async createJournalEntry(entry: InsertJournalEntry): Promise<JournalEntry> {
    const [created] = await db.insert(journalEntries).values(entry).returning();
    return created;
  }

  async getJournalLines(entryId: number): Promise<JournalLine[]> {
    return db.select().from(journalLines).where(eq(journalLines.journalEntryId, entryId));
  }

  async createJournalLine(line: InsertJournalLine): Promise<JournalLine> {
    const [created] = await db.insert(journalLines).values(line).returning();
    return created;
  }

  async getDashboardStats(companyId?: number, rangeFrom?: string, rangeTo?: string): Promise<any> {
    const now = new Date();
    const today = rangeTo || now.toISOString().split("T")[0];
    const firstOfMonth = rangeFrom || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevFirstOfMonth = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, "0")}-01`;
    const prevLastOfMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];

    const cond = (table: any) => companyId ? eq(table.companyId, companyId) : undefined;

    const [firmClientCount] = await db.select({ count: sql<number>`count(*)` }).from(firmClients).where(cond(firmClients));
    const [firmFeeSum] = await db.select({ total: sql<string>`coalesce(sum(service_fee), 0)` }).from(firmClients).where(cond(firmClients));

    const [contactCount] = await db.select({ count: sql<number>`count(*)` }).from(contacts).where(cond(contacts));

    const [productCount] = await db.select({ count: sql<number>`count(*)` }).from(products).where(cond(products));

    const monthCond = (table: any, dateCol: any) => {
      const conditions = [gte(dateCol, firstOfMonth), lte(dateCol, today)];
      if (companyId) conditions.push(eq(table.companyId, companyId));
      return and(...conditions);
    };
    const prevMonthCond = (table: any, dateCol: any) => {
      const conditions = [gte(dateCol, prevFirstOfMonth), lte(dateCol, prevLastOfMonth)];
      if (companyId) conditions.push(eq(table.companyId, companyId));
      return and(...conditions);
    };
    const todayCond = (table: any, dateCol: any) => {
      const conditions = [eq(dateCol, today)];
      if (companyId) conditions.push(eq(table.companyId, companyId));
      return and(...conditions);
    };

    const [ivThisMonth] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(invoices).where(monthCond(invoices, invoices.invoiceDate));

    const [ivPrevMonth] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(invoices).where(prevMonthCond(invoices, invoices.invoiceDate));

    const [txThisMonth] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(taxInvoices).where(monthCond(taxInvoices, taxInvoices.taxInvoiceDate));

    const txStandaloneThisMonthCond = (() => {
      const conditions = [gte(taxInvoices.taxInvoiceDate, firstOfMonth), lte(taxInvoices.taxInvoiceDate, today), sql`${taxInvoices.invoiceId} IS NULL`];
      if (companyId) conditions.push(eq(taxInvoices.companyId, companyId));
      return and(...conditions);
    })();
    const [txStandaloneThisMonth] = await db.select({
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(taxInvoices).where(txStandaloneThisMonthCond);

    const txStandalonePrevMonthCond = (() => {
      const conditions = [gte(taxInvoices.taxInvoiceDate, prevFirstOfMonth), lte(taxInvoices.taxInvoiceDate, prevLastOfMonth), sql`${taxInvoices.invoiceId} IS NULL`];
      if (companyId) conditions.push(eq(taxInvoices.companyId, companyId));
      return and(...conditions);
    })();
    const [txStandalonePrevMonth] = await db.select({
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(taxInvoices).where(txStandalonePrevMonthCond);

    const [rcThisMonth] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(receipts).where(monthCond(receipts, receipts.receiptDate));

    const [rcPrevMonth] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(receipts).where(prevMonthCond(receipts, receipts.receiptDate));

    const [qoThisMonth] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(quotations).where(monthCond(quotations, quotations.quotationDate));

    const [rcToday] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(receipts).where(todayCond(receipts, receipts.receiptDate));

    const [ivAll] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(invoices).where(cond(invoices));
    const [txAll] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(taxInvoices).where(cond(taxInvoices));
    const txStandaloneAllCond = (() => {
      const conditions: any[] = [sql`${taxInvoices.invoiceId} IS NULL`];
      if (companyId) conditions.push(eq(taxInvoices.companyId, companyId));
      return and(...conditions);
    })();
    const [txStandaloneAll] = await db.select({
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(taxInvoices).where(txStandaloneAllCond);
    const [rcAll] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(receipts).where(cond(receipts));
    const [qoAll] = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(total_amount), 0)`
    }).from(quotations).where(cond(quotations));

    const totalSalesThisMonth = Number(ivThisMonth?.total || 0) + Number(txStandaloneThisMonth?.total || 0);
    const totalSalesPrevMonth = Number(ivPrevMonth?.total || 0) + Number(txStandalonePrevMonth?.total || 0);
    const salesGrowth = totalSalesPrevMonth > 0 ? ((totalSalesThisMonth - totalSalesPrevMonth) / totalSalesPrevMonth * 100) : 0;

    const totalReceiptsThisMonth = Number(rcThisMonth?.total || 0);
    const totalReceiptsPrevMonth = Number(rcPrevMonth?.total || 0);
    const receiptsGrowth = totalReceiptsPrevMonth > 0 ? ((totalReceiptsThisMonth - totalReceiptsPrevMonth) / totalReceiptsPrevMonth * 100) : 0;

    const topProductsQuery = companyId
      ? sql`
        SELECT product_name, product_code, 
          coalesce(sum(qty), 0) as total_qty, 
          coalesce(sum(total), 0) as total_revenue
        FROM (
          SELECT product_name, product_code, qty, total FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${companyId})
          UNION ALL
          SELECT product_name, product_code, qty, total FROM tax_invoice_items WHERE tax_invoice_id IN (SELECT id FROM tax_invoices WHERE company_id = ${companyId} AND invoice_id IS NULL)
          UNION ALL
          SELECT name as product_name, platform_sku as product_code, qty, total FROM ecommerce_order_items WHERE order_id IN (SELECT id FROM ecommerce_orders WHERE company_id = ${companyId} AND platform NOT IN ('grab_food', 'line_man', 'robinhood'))
        ) combined
        WHERE product_name NOT IN ('ค่าจัดส่ง', 'Shipping Fee', 'shipping')
        GROUP BY product_name, product_code
        ORDER BY total_revenue DESC
        LIMIT 5
      `
      : sql`
        SELECT product_name, product_code, 
          coalesce(sum(qty), 0) as total_qty, 
          coalesce(sum(total), 0) as total_revenue
        FROM (
          SELECT product_name, product_code, qty, total FROM invoice_items
          UNION ALL
          SELECT product_name, product_code, qty, total FROM tax_invoice_items WHERE tax_invoice_id IN (SELECT id FROM tax_invoices WHERE invoice_id IS NULL)
          UNION ALL
          SELECT name as product_name, platform_sku as product_code, qty, total FROM ecommerce_order_items WHERE order_id IN (SELECT id FROM ecommerce_orders WHERE platform NOT IN ('grab_food', 'line_man', 'robinhood'))
        ) combined
        WHERE product_name NOT IN ('ค่าจัดส่ง', 'Shipping Fee', 'shipping')
        GROUP BY product_name, product_code
        ORDER BY total_revenue DESC
        LIMIT 5
      `;
    const topProducts = await db.execute(topProductsQuery);

    const monthlyRevenueQuery = companyId
      ? sql`
        SELECT to_char(doc_date, 'YYYY-MM') as month,
          coalesce(sum(total_amount), 0) as revenue
        FROM (
          SELECT invoice_date as doc_date, total_amount FROM invoices WHERE company_id = ${companyId}
          UNION ALL
          SELECT tax_invoice_date as doc_date, total_amount FROM tax_invoices WHERE company_id = ${companyId} AND invoice_id IS NULL
          UNION ALL
          SELECT placed_at::date as doc_date, total_amount FROM ecommerce_orders WHERE company_id = ${companyId} AND platform NOT IN ('grab_food', 'line_man', 'robinhood')
        ) combined
        WHERE doc_date >= date_trunc('month', now() - interval '5 months')
        GROUP BY to_char(doc_date, 'YYYY-MM')
        ORDER BY month ASC
      `
      : sql`
        SELECT to_char(doc_date, 'YYYY-MM') as month,
          coalesce(sum(total_amount), 0) as revenue
        FROM (
          SELECT invoice_date as doc_date, total_amount FROM invoices
          UNION ALL
          SELECT tax_invoice_date as doc_date, total_amount FROM tax_invoices WHERE invoice_id IS NULL
          UNION ALL
          SELECT placed_at::date as doc_date, total_amount FROM ecommerce_orders WHERE platform NOT IN ('grab_food', 'line_man', 'robinhood')
        ) combined
        WHERE doc_date >= date_trunc('month', now() - interval '5 months')
        GROUP BY to_char(doc_date, 'YYYY-MM')
        ORDER BY month ASC
      `;
    const monthlyRevenue = await db.execute(monthlyRevenueQuery);

    const pendingInvoices = companyId
      ? await db.select({ count: sql<number>`count(*)` }).from(invoices).where(and(eq(invoices.companyId, companyId), eq(invoices.status, "draft")))
      : await db.select({ count: sql<number>`count(*)` }).from(invoices).where(eq(invoices.status, "draft"));

    const companyFilter = companyId ? sql`AND je.company_id = ${companyId}` : sql``;

    // AR — ใช้ยอดจาก journal entries ตรงๆ เหมือนงบทดลอง (บัญชีกลุ่ม 12xxx ลูกหนี้การค้า)
    const arJournalResult = await db.execute(sql`
      SELECT coalesce(sum(jl.debit::numeric) - sum(jl.credit::numeric), 0) as balance
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE a.code LIKE '12%' AND a.is_header = false AND a.type = 'asset' AND je.status IN ('posted','approved') ${companyFilter}
    `);
    const outstandingReceivables = Math.max(0, Number((arJournalResult.rows?.[0] as any)?.balance || 0));

    // AP — ใช้ยอดจาก journal entries ตรงๆ เหมือนงบทดลอง (บัญชีกลุ่ม 21xxx เจ้าหนี้การค้า)
    const apJournalResult = await db.execute(sql`
      SELECT coalesce(sum(jl.credit::numeric) - sum(jl.debit::numeric), 0) as balance
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE a.code LIKE '21%' AND a.is_header = false AND a.type = 'liability' AND je.status IN ('posted','approved') ${companyFilter}
    `);
    const outstandingPayables = Math.max(0, Number((apJournalResult.rows?.[0] as any)?.balance || 0));

    const revenueThisMonthResult = await db.execute(sql`
      SELECT coalesce(sum(jl.credit) - sum(jl.debit), 0) as total
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE a.type = 'revenue' AND je.status IN ('posted','approved')
        AND je.entry_date >= ${firstOfMonth} AND je.entry_date <= ${today} ${companyFilter}
    `);
    const revenueThisMonth = Number((revenueThisMonthResult.rows?.[0] as any)?.total || 0);

    const expenseThisMonthResult = await db.execute(sql`
      SELECT coalesce(sum(jl.debit) - sum(jl.credit), 0) as total
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE a.type = 'expense' AND je.status IN ('posted','approved')
        AND je.entry_date >= ${firstOfMonth} AND je.entry_date <= ${today} ${companyFilter}
    `);
    const expenseFromJournal = Number((expenseThisMonthResult.rows?.[0] as any)?.total || 0);

    const companyFilterDoc = companyId ? sql`AND company_id = ${companyId}` : sql``;
    const fromDateParts = firstOfMonth.split("-");
    const toDateParts = today.split("-");
    const fromMonth = parseInt(fromDateParts[1], 10);
    const fromYear = parseInt(fromDateParts[0], 10);
    const toMonth = parseInt(toDateParts[1], 10);
    const toYear = parseInt(toDateParts[0], 10);

    const payrollExpenseResult = await db.execute(sql`
      SELECT coalesce(sum(pr.net_pay::numeric), 0) as total FROM payroll_records pr
      WHERE pr.journal_entry_id IS NULL
        AND ((pr.year * 100 + pr.month) >= ${fromYear * 100 + fromMonth})
        AND ((pr.year * 100 + pr.month) <= ${toYear * 100 + toMonth})
        ${companyFilterDoc}
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je2
          WHERE je2.company_id = pr.company_id
            AND je2.status IN ('posted','approved')
            AND extract(month from je2.entry_date) = pr.month
            AND extract(year from je2.entry_date) = pr.year
            AND je2.description LIKE '%เงินเดือน%'
        )
    `);
    const payrollExpenseNotJournaled = Number((payrollExpenseResult.rows?.[0] as any)?.total || 0);

    const expenseDocResult = await db.execute(sql`
      SELECT coalesce(sum(total_amount::numeric), 0) as total FROM expenses
      WHERE link_journal IS NULL
        AND exp_date >= ${firstOfMonth} AND exp_date <= ${today}
        ${companyFilterDoc}
    `);
    const expenseDocNotJournaled = Number((expenseDocResult.rows?.[0] as any)?.total || 0);

    const purchaseDocResult = await db.execute(sql`
      SELECT coalesce(sum(total_amount::numeric), 0) as total FROM purchase_invoices
      WHERE link_journal IS NULL
        AND ap_date >= ${firstOfMonth} AND ap_date <= ${today}
        ${companyFilterDoc}
    `);
    const purchaseDocNotJournaled = Number((purchaseDocResult.rows?.[0] as any)?.total || 0);

    const expenseThisMonth = expenseFromJournal;

    console.log(`[Dashboard] companyId=${companyId} range=${firstOfMonth}~${today} revenue=${revenueThisMonth} expense(journal)=${expenseFromJournal} AR=${outstandingReceivables} AP=${outstandingPayables}`);

    const monthlyPLResult = await db.execute(sql`
      SELECT month, sum(revenue) as revenue, sum(expense) as expense FROM (
        SELECT to_char(je.entry_date, 'YYYY-MM') as month,
          coalesce(sum(CASE WHEN a.type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END), 0) as revenue,
          coalesce(sum(CASE WHEN a.type = 'expense' THEN jl.debit - jl.credit ELSE 0 END), 0) as expense
        FROM journal_lines jl
        JOIN journal_entries je ON je.id = jl.journal_entry_id
        JOIN accounts a ON a.id = jl.account_id
        WHERE je.status IN ('posted','approved')
          AND je.entry_date >= date_trunc('month', now() - interval '5 months')
          AND (a.type = 'revenue' OR a.type = 'expense') ${companyFilter}
        GROUP BY to_char(je.entry_date, 'YYYY-MM')
      ) combined
      GROUP BY month
      ORDER BY month ASC
    `);

    return {
      totalClients: Number(contactCount?.count || 0),
      totalFirmClients: Number(firmClientCount?.count || 0),
      totalServiceFee: firmFeeSum?.total || "0",
      totalProducts: Number(productCount?.count || 0),

      invoices: {
        thisMonth: { count: Number(ivThisMonth?.count || 0), total: ivThisMonth?.total || "0" },
        prevMonth: { count: Number(ivPrevMonth?.count || 0), total: ivPrevMonth?.total || "0" },
        all: { count: Number(ivAll?.count || 0), total: ivAll?.total || "0" },
      },
      taxInvoices: {
        thisMonth: { count: Number(txThisMonth?.count || 0), total: txThisMonth?.total || "0" },
        all: { count: Number(txAll?.count || 0), total: txAll?.total || "0" },
      },
      receipts: {
        thisMonth: { count: Number(rcThisMonth?.count || 0), total: rcThisMonth?.total || "0" },
        prevMonth: { count: Number(rcPrevMonth?.count || 0), total: rcPrevMonth?.total || "0" },
        today: { count: Number(rcToday?.count || 0), total: rcToday?.total || "0" },
        all: { count: Number(rcAll?.count || 0), total: rcAll?.total || "0" },
      },
      quotations: {
        thisMonth: { count: Number(qoThisMonth?.count || 0), total: qoThisMonth?.total || "0" },
        all: { count: Number(qoAll?.count || 0), total: qoAll?.total || "0" },
      },

      totalSalesThisMonth,
      totalSalesAll: Number(ivAll?.total || 0) + Number(txStandaloneAll?.total || 0),
      salesGrowth: Math.round(salesGrowth * 10) / 10,
      totalReceiptsThisMonth,
      receiptsGrowth: Math.round(receiptsGrowth * 10) / 10,

      pendingCount: Number(pendingInvoices[0]?.count || 0),

      topProducts: (topProducts.rows || []).map((r: any) => ({
        name: r.product_name,
        code: r.product_code,
        qty: Number(r.total_qty || 0),
        revenue: Number(r.total_revenue || 0),
      })),

      monthlyRevenue: (monthlyRevenue.rows || []).map((r: any) => ({
        month: r.month,
        revenue: Number(r.revenue || 0),
      })),

      outstandingReceivables,
      outstandingPayables,
      revenueThisMonth,
      expenseThisMonth,
      profitLossThisMonth: revenueThisMonth - expenseThisMonth,

      monthlyPL: (monthlyPLResult.rows || []).map((r: any) => ({
        month: r.month,
        revenue: Number(r.revenue || 0),
        expense: Number(r.expense || 0),
        profit: Number(r.revenue || 0) - Number(r.expense || 0),
      })),
    };
  }

  async getFirmStats(tenantId?: number): Promise<any> {
    const clients = await this.getFirmClients(tenantId);
    const totalFee = clients.reduce((sum, c) => sum + Number(c.serviceFee || 0), 0);
    const totalInvoices = clients.reduce((sum, c) => sum + (c.invoiceCount || 0), 0);
    const pendingReview = clients.filter(c => c.status === "pending_review").length;

    return {
      totalRevenue: totalFee,
      totalInvoices,
      totalClients: clients.length,
      pendingReview,
    };
  }

  async getEcommerceStats(companyId: number, dateFrom?: string, dateTo?: string): Promise<any> {
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const rangeFrom = dateFrom || firstOfMonth;
    const rangeTo = dateTo || now.toISOString().split("T")[0];

    const platformSalesResult = await db.execute(sql`
      SELECT platform,
        count(*) as order_count,
        coalesce(sum(CAST(total_amount AS numeric)), 0) as total_sales,
        coalesce(sum(CAST(commission_fee AS numeric)), 0) as commission_fee,
        coalesce(sum(CAST(service_fee AS numeric)), 0) as service_fee,
        coalesce(sum(CAST(transaction_fee AS numeric)), 0) as transaction_fee,
        coalesce(sum(CAST(payment_fee AS numeric)), 0) as payment_fee,
        coalesce(sum(CAST(shipping_cost AS numeric)), 0) as shipping_cost,
        coalesce(sum(CAST(net_income AS numeric)), 0) as net_income
      FROM ecommerce_orders
      WHERE company_id = ${companyId}
        AND placed_at >= ${rangeFrom}::date
        AND placed_at <= (${rangeTo}::date + interval '1 day')
        AND platform NOT IN ('grab_food', 'line_man', 'robinhood')
      GROUP BY platform
    `);

    const statusCountsResult = await db.execute(sql`
      SELECT status, count(*) as cnt
      FROM ecommerce_orders
      WHERE company_id = ${companyId}
        AND platform NOT IN ('grab_food', 'line_man', 'robinhood')
      GROUP BY status
    `);

    const totalThisMonthResult = await db.execute(sql`
      SELECT count(*) as order_count,
        coalesce(sum(CAST(total_amount AS numeric)), 0) as total_sales
      FROM ecommerce_orders
      WHERE company_id = ${companyId}
        AND placed_at >= ${rangeFrom}::date
        AND placed_at <= (${rangeTo}::date + interval '1 day')
        AND platform NOT IN ('grab_food', 'line_man', 'robinhood')
    `);

    const todayResult = await db.execute(sql`
      SELECT count(*) as order_count,
        coalesce(sum(CAST(total_amount AS numeric)), 0) as total_sales
      FROM ecommerce_orders
      WHERE company_id = ${companyId}
        AND placed_at::date = current_date
        AND platform NOT IN ('grab_food', 'line_man', 'robinhood')
    `);

    const monthlyByPlatformResult = await db.execute(sql`
      SELECT to_char(placed_at, 'YYYY-MM') as month,
        coalesce(sum(CASE WHEN platform = 'shopee' THEN CAST(total_amount AS numeric) ELSE 0 END), 0) as shopee,
        coalesce(sum(CASE WHEN platform = 'lazada' THEN CAST(total_amount AS numeric) ELSE 0 END), 0) as lazada,
        coalesce(sum(CASE WHEN platform = 'tiktok' THEN CAST(total_amount AS numeric) ELSE 0 END), 0) as tiktok,
        coalesce(sum(CASE WHEN platform = 'live' THEN CAST(total_amount AS numeric) ELSE 0 END), 0) as live
      FROM ecommerce_orders
      WHERE company_id = ${companyId}
        AND placed_at >= date_trunc('month', now() - interval '5 months')
      GROUP BY to_char(placed_at, 'YYYY-MM')
      ORDER BY month ASC
    `);

    const orderStatusCounts: Record<string, number> = {};
    for (const row of (statusCountsResult.rows || []) as any[]) {
      orderStatusCounts[row.status] = Number(row.cnt || 0);
    }

    const totalRow = (totalThisMonthResult.rows?.[0] || {}) as any;
    const todayRow = (todayResult.rows?.[0] || {}) as any;

    return {
      platformSales: (platformSalesResult.rows || []).map((r: any) => ({
        platform: r.platform,
        orderCount: Number(r.order_count || 0),
        totalSales: Number(r.total_sales || 0),
        commissionFee: Math.abs(Number(r.commission_fee || 0)),
        serviceFee: Math.abs(Number(r.service_fee || 0)),
        transactionFee: Math.abs(Number(r.transaction_fee || 0)),
        paymentFee: Math.abs(Number(r.payment_fee || 0)),
        shippingCost: Math.abs(Number(r.shipping_cost || 0)),
        netIncome: Number(r.net_income || 0),
        totalFees: Math.abs(Number(r.commission_fee || 0)) + Math.abs(Number(r.service_fee || 0)) + Math.abs(Number(r.transaction_fee || 0)) + Math.abs(Number(r.payment_fee || 0)),
      })),
      orderStatusCounts,
      totalOrdersThisMonth: Number(totalRow.order_count || 0),
      totalEcomSalesThisMonth: Number(totalRow.total_sales || 0),
      ordersToday: Number(todayRow.order_count || 0),
      salesToday: Number(todayRow.total_sales || 0),
      monthlyByPlatform: (monthlyByPlatformResult.rows || []).map((r: any) => ({
        month: r.month,
        shopee: Number(r.shopee || 0),
        lazada: Number(r.lazada || 0),
        tiktok: Number(r.tiktok || 0),
        live: Number(r.live || 0),
      })),
    };
  }

  async getRolePermissions(): Promise<RolePermission[]> {
    return db.select().from(rolePermissions).orderBy(rolePermissions.role, rolePermissions.moduleKey);
  }

  async getRolePermissionsByRole(role: string): Promise<RolePermission[]> {
    return db.select().from(rolePermissions).where(eq(rolePermissions.role, role));
  }

  async setRolePermission(role: string, moduleKey: string, allowed: boolean): Promise<RolePermission> {
    const [existing] = await db.select().from(rolePermissions)
      .where(and(eq(rolePermissions.role, role), eq(rolePermissions.moduleKey, moduleKey)));
    if (existing) {
      const [updated] = await db.update(rolePermissions)
        .set({ allowed })
        .where(eq(rolePermissions.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(rolePermissions)
      .values({ role, moduleKey, allowed })
      .returning();
    return created;
  }

  async initDefaultPermissions(): Promise<void> {
    const { PERMISSION_MODULES } = await import("@shared/permissions");
    const allRoles = ["admin", "manager", "accountant", "employee", "cashier", "client"];

    const existing = await db.select().from(rolePermissions).limit(1);
    if (existing.length === 0) {
      const values: InsertRolePermission[] = [];
      for (const mod of PERMISSION_MODULES) {
        for (const role of allRoles) {
          values.push({
            role,
            moduleKey: mod.key,
            allowed: mod.allowedRoles.includes(role as any),
          });
        }
      }
      if (values.length > 0) {
        await db.insert(rolePermissions).values(values);
      }
      return;
    }

    const allExisting = await db.select().from(rolePermissions);
    const existingSet = new Set(allExisting.map(r => `${r.role}::${r.moduleKey}`));
    const missing: InsertRolePermission[] = [];
    for (const mod of PERMISSION_MODULES) {
      for (const role of allRoles) {
        const key = `${role}::${mod.key}`;
        if (!existingSet.has(key)) {
          missing.push({ role, moduleKey: mod.key, allowed: mod.allowedRoles.includes(role as any) });
        }
      }
    }
    if (missing.length > 0) {
      await db.insert(rolePermissions).values(missing);
      console.log(`[initDefaultPermissions] Inserted ${missing.length} missing role_permissions rows`);
    }
  }

  async getUserSubPermissions(userId: number): Promise<UserSubPermission[]> {
    return db.select().from(userSubPermissions).where(eq(userSubPermissions.userId, userId));
  }

  async setUserSubPermission(userId: number, subModuleKey: string, allowed: boolean): Promise<UserSubPermission> {
    const existing = await db.select().from(userSubPermissions)
      .where(and(eq(userSubPermissions.userId, userId), eq(userSubPermissions.subModuleKey, subModuleKey)));
    if (existing.length > 0) {
      const [updated] = await db.update(userSubPermissions)
        .set({ allowed })
        .where(and(eq(userSubPermissions.userId, userId), eq(userSubPermissions.subModuleKey, subModuleKey)))
        .returning();
      return updated;
    }
    const [created] = await db.insert(userSubPermissions).values({ userId, subModuleKey, allowed }).returning();
    return created;
  }

  async bulkSetUserSubPermissions(userId: number, permissions: { subModuleKey: string; allowed: boolean }[]): Promise<void> {
    const deduped = new Map<string, boolean>();
    for (const p of permissions) { deduped.set(p.subModuleKey, p.allowed); }
    const uniquePerms = Array.from(deduped.entries()).map(([subModuleKey, allowed]) => ({ userId, subModuleKey, allowed }));

    await db.transaction(async (tx) => {
      await tx.delete(userSubPermissions).where(eq(userSubPermissions.userId, userId));
      if (uniquePerms.length > 0) {
        await tx.execute(sql`SELECT setval(pg_get_serial_sequence('user_sub_permissions', 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM user_sub_permissions), 0) + 1, 1), false)`);
        await tx.insert(userSubPermissions).values(uniquePerms);
      }
    });
  }

  async getTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(desc(tenants.createdAt));
  }

  async getTenant(id: number): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    return created;
  }

  async updateTenant(id: number, data: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const [updated] = await db.update(tenants).set(data).where(eq(tenants.id, id)).returning();
    return updated;
  }

  async getTenantStats(): Promise<any> {
    const allTenants = await db.select().from(tenants);
    const allUsers = await db.select({ id: users.id, username: users.username, fullName: users.fullName, tenantId: users.tenantId, role: users.role, email: users.email }).from(users);

    const totalTenants = allTenants.length;
    const activeTenants = allTenants.filter(t => t.status === "active").length;
    const inactiveTenants = allTenants.filter(t => t.status !== "active").length;
    const accountingFirms = allTenants.filter(t => t.tenantType === "accounting_firm").length;
    const generalBusiness = allTenants.filter(t => t.tenantType === "general_business").length;
    const totalUsers = allUsers.filter(u => u.role !== "super_admin").length;

    const tenantIds = new Set(allTenants.map(t => t.id));
    const orphanUsers = allUsers.filter(u => u.role !== "super_admin" && (u.tenantId === null || !tenantIds.has(u.tenantId)));

    const allSubs = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.status, "active"));
    const allPlans = await db.select({ id: subscriptionPlans.id, name: subscriptionPlans.name, code: subscriptionPlans.code }).from(subscriptionPlans);
    const planMap = new Map(allPlans.map(p => [p.id, p]));

    const tenantsWithUsers = allTenants.map(t => {
      const sub = allSubs.find(s => s.tenantId === t.id);
      const plan = sub ? planMap.get(sub.planId) : null;
      return {
        ...t,
        userCount: allUsers.filter(u => u.tenantId === t.id).length,
        planName: plan?.name || null,
        planCode: plan?.code || null,
        subscriptionStatus: sub?.status || null,
        billingCycle: sub?.billingCycle || null,
      };
    });

    return {
      totalTenants,
      activeTenants,
      inactiveTenants,
      accountingFirms,
      generalBusiness,
      totalUsers,
      orphanUsers: orphanUsers.map(u => ({ id: u.id, username: u.username, fullName: u.fullName, email: u.email, tenantId: u.tenantId })),
      tenants: tenantsWithUsers,
    };
  }
  async getAccountingFormulas(companyId?: number | null, businessType?: string, documentType?: string): Promise<AccountingFormula[]> {
    const conditions = [];
    if (companyId !== undefined) {
      conditions.push(companyId === null ? sql`${accountingFormulas.companyId} IS NULL` : eq(accountingFormulas.companyId, companyId));
    }
    if (businessType) conditions.push(eq(accountingFormulas.businessType, businessType));
    if (documentType) conditions.push(eq(accountingFormulas.documentType, documentType));
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    return db.select().from(accountingFormulas).where(whereClause).orderBy(accountingFormulas.documentType, accountingFormulas.businessType);
  }

  async getAccountingFormula(id: number): Promise<AccountingFormula | undefined> {
    const [formula] = await db.select().from(accountingFormulas).where(eq(accountingFormulas.id, id));
    return formula;
  }

  async createAccountingFormula(formula: InsertAccountingFormula): Promise<AccountingFormula> {
    const [created] = await db.insert(accountingFormulas).values(formula).returning();
    return created;
  }

  async updateAccountingFormula(id: number, data: Partial<InsertAccountingFormula>): Promise<AccountingFormula | undefined> {
    const [updated] = await db.update(accountingFormulas).set(data).where(eq(accountingFormulas.id, id)).returning();
    return updated;
  }

  async deleteAccountingFormula(id: number): Promise<boolean> {
    await db.delete(accountingFormulaLines).where(eq(accountingFormulaLines.formulaId, id));
    await db.delete(accountingFormulas).where(eq(accountingFormulas.id, id));
    return true;
  }

  async getFormulaLines(formulaId: number): Promise<AccountingFormulaLine[]> {
    return db.select().from(accountingFormulaLines)
      .where(eq(accountingFormulaLines.formulaId, formulaId))
      .orderBy(accountingFormulaLines.sortOrder);
  }

  async setFormulaLines(formulaId: number, lines: Omit<InsertAccountingFormulaLine, "formulaId">[]): Promise<AccountingFormulaLine[]> {
    await db.delete(accountingFormulaLines).where(eq(accountingFormulaLines.formulaId, formulaId));
    if (lines.length === 0) return [];
    const values = lines.map(l => ({ ...l, formulaId }));
    return db.insert(accountingFormulaLines).values(values).returning();
  }

  async seedDefaultFormulas(companyId: number, businessType: string, txOverride?: any): Promise<void> {
    const conn = txOverride || db;
    const { DEFAULT_FORMULAS } = await import("@shared/accounting-formulas");
    const formulaBusinessType = (businessType === "accounting" || businessType === "accounting_firm") ? "service" : businessType;
    const matching = DEFAULT_FORMULAS.filter(f => f.businessType === formulaBusinessType);
    for (const tmpl of matching) {
      const [formula] = await conn.insert(accountingFormulas).values({
        companyId,
        documentType: tmpl.documentType,
        businessType: tmpl.businessType,
        name: tmpl.name,
        nameTh: tmpl.nameTh,
        description: tmpl.description,
        noJournalEntry: tmpl.noJournalEntry || false,
      }).returning();
      if (tmpl.lines.length > 0) {
        await conn.insert(accountingFormulaLines).values(
          tmpl.lines.map(l => ({ formulaId: formula.id, ...l }))
        );
      }
    }
  }

  async getDocumentSettings(companyId: number): Promise<DocumentSettings | undefined> {
    const [settings] = await db.select().from(documentSettings).where(eq(documentSettings.companyId, companyId));
    return settings;
  }

  async upsertDocumentSettings(companyId: number, data: Partial<InsertDocumentSettings>): Promise<DocumentSettings> {
    const existing = await this.getDocumentSettings(companyId);
    if (existing) {
      const [updated] = await db.update(documentSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(documentSettings.companyId, companyId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(documentSettings)
        .values({ companyId, ...data })
        .returning();
      return created;
    }
  }
  async updateUserSignature(userId: number, data: { signatureUrl?: string | null; signatureName?: string | null; signatureNameEn?: string | null; signatureNameZh?: string | null; signatureTitle?: string | null; signatureTitleEn?: string | null; signatureTitleZh?: string | null }): Promise<User> {
    const [updated] = await db.update(users)
      .set(data)
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async getContacts(companyId: number, type?: string): Promise<Contact[]> {
    const conditions = [eq(contacts.companyId, companyId)];
    if (type) conditions.push(eq(contacts.type, type));
    return db.select().from(contacts).where(and(...conditions)).orderBy(desc(contacts.createdAt));
  }

  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [created] = await db.insert(contacts).values(contact).returning();
    return created;
  }

  async updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [updated] = await db.update(contacts).set(data).where(eq(contacts.id, id)).returning();
    return updated;
  }

  async deleteContact(id: number): Promise<boolean> {
    await posDb.transaction(async (tx) => {
      await tx.update(salesOrders).set({ customerId: null }).where(eq(salesOrders.customerId, id));
      await tx.update(quotations).set({ customerId: null }).where(eq(quotations.customerId, id));
      await tx.update(invoices).set({ customerId: null }).where(eq(invoices.customerId, id));
      await tx.update(taxInvoices).set({ customerId: null }).where(eq(taxInvoices.customerId, id));
      await tx.update(receipts).set({ customerId: null }).where(eq(receipts.customerId, id));
      await tx.update(billingNotes).set({ customerId: null }).where(eq(billingNotes.customerId, id));
      await tx.update(posTransactions).set({ customerId: null }).where(eq(posTransactions.customerId, id));
      await tx.update(depositReceipts).set({ customerId: null }).where(eq(depositReceipts.customerId, id));
      await tx.update(salesCreditNotes).set({ customerId: null }).where(eq(salesCreditNotes.customerId, id));
      await tx.update(deliveryNotes).set({ customerId: null }).where(eq(deliveryNotes.customerId, id));
      await tx.update(pipelineDeals).set({ contactId: null }).where(eq(pipelineDeals.contactId, id));
      await tx.delete(supplierQuotes).where(eq(supplierQuotes.contactId, id));
      await tx.delete(supplierPortalTokens).where(eq(supplierPortalTokens.contactId, id));
      await tx.delete(firmClients).where(eq(firmClients.contactId, id));
      await tx.delete(contacts).where(eq(contacts.id, id));
    });
    return true;
  }

  async getProducts(companyId: number, category?: string): Promise<Product[]> {
    const conditions = [eq(products.companyId, companyId)];
    if (category) conditions.push(eq(products.category, category));
    return db.select().from(products).where(and(...conditions)).orderBy(desc(products.createdAt));
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    await syncProductSplit(created.id, created.active !== false);
    return created;
  }

  async updateProduct(id: number, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db.update(products).set(data).where(eq(products.id, id)).returning();
    if (!updated) return undefined;
    await syncProductSplit(id, updated.active !== false);
    return updated;
  }

  async deleteProduct(id: number): Promise<boolean> {
    await db.update(products).set({ active: false }).where(eq(products.id, id));
    await syncProductSplit(id, false);
    return true;
  }

  async findDuplicateContacts(companyId: number, opts: { taxId?: string; name?: string; code?: string; excludeId?: number }): Promise<Contact[]> {
    const conditions = [eq(contacts.companyId, companyId), eq(contacts.active, true)];
    if (opts.excludeId) conditions.push(ne(contacts.id, opts.excludeId));

    const matchConditions: any[] = [];
    if (opts.taxId && opts.taxId.trim()) matchConditions.push(eq(contacts.taxId, opts.taxId.trim()));
    if (opts.code && opts.code.trim()) matchConditions.push(eq(contacts.code, opts.code.trim()));
    if (opts.name && opts.name.trim()) {
      const namePattern = `%${opts.name.trim()}%`;
      matchConditions.push(ilike(contacts.name, namePattern));
      matchConditions.push(ilike(contacts.nameEn, namePattern));
      matchConditions.push(ilike(contacts.nameZh, namePattern));
    }

    if (matchConditions.length === 0) return [];
    return db.select().from(contacts).where(and(...conditions, or(...matchConditions))).limit(10);
  }

  async findDuplicateProducts(companyId: number, opts: { code?: string; name?: string; excludeId?: number }): Promise<Product[]> {
    const conditions = [eq(products.companyId, companyId)];
    if (opts.excludeId) conditions.push(ne(products.id, opts.excludeId));

    const matchConditions: any[] = [];
    if (opts.code && opts.code.trim()) matchConditions.push(eq(products.code, opts.code.trim()));
    if (opts.name && opts.name.trim()) {
      const namePattern = `%${opts.name.trim()}%`;
      matchConditions.push(ilike(products.name, namePattern));
      matchConditions.push(ilike(products.nameEn, namePattern));
      matchConditions.push(ilike(products.nameZh, namePattern));
    }

    if (matchConditions.length === 0) return [];
    return db.select().from(products).innerJoin(activeProducts, eq(activeProducts.id, products.id)).where(and(...conditions, or(...matchConditions))).limit(10);
  }

  async bulkCreateContacts(contactList: InsertContact[]): Promise<Contact[]> {
    if (contactList.length === 0) return [];
    const created = await db.insert(contacts).values(contactList).returning();
    return created;
  }

  async bulkCreateProducts(productList: InsertProduct[]): Promise<Product[]> {
    if (productList.length === 0) return [];
    const created = await db.insert(products).values(productList).returning();
    for (const p of created) {
      await syncProductSplit(p.id, p.active !== false);
    }
    return created;
  }

  async getContactSettings(companyId: number): Promise<ContactSettings | undefined> {
    const [row] = await db.select().from(contactSettings).where(eq(contactSettings.companyId, companyId)).limit(1);
    return row;
  }

  async upsertContactSettings(data: InsertContactSettings): Promise<ContactSettings> {
    const existing = await this.getContactSettings(data.companyId);
    if (existing) {
      const [updated] = await db.update(contactSettings).set(data).where(eq(contactSettings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(contactSettings).values(data).returning();
    return created;
  }

  async getNextContactCode(companyId: number): Promise<string> {
    const settings = await this.getContactSettings(companyId);
    const prefix = settings?.codePrefix || "C";
    const digits = settings?.codeDigits || 4;
    const regexPattern = '^' + prefix + '[0-9]+$';
    const allCodes = await db.select({ code: contacts.code })
      .from(contacts)
      .where(and(
        eq(contacts.companyId, companyId),
        eq(contacts.active, true),
        sql`code ~ ${regexPattern}`
      ));
    let maxNum = 0;
    for (const row of allCodes) {
      const numPart = row.code.substring(prefix.length);
      const num = parseInt(numPart, 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
    console.log(`[next-code] companyId=${companyId} prefix=${prefix} found=${allCodes.length} maxNum=${maxNum} next=${prefix}${String(maxNum + 1).padStart(digits, "0")}`);
    return prefix + String(maxNum + 1).padStart(digits, "0");
  }

  async getBomHeaders(companyId: number, productId?: number): Promise<BomHeader[]> {
    const conditions = [eq(bomHeaders.companyId, companyId)];
    if (productId) conditions.push(eq(bomHeaders.productId, productId));
    return db.select().from(bomHeaders).where(and(...conditions)).orderBy(desc(bomHeaders.createdAt));
  }

  async getBomHeader(id: number): Promise<BomHeader | undefined> {
    const [row] = await db.select().from(bomHeaders).where(eq(bomHeaders.id, id));
    return row;
  }

  async createBomHeader(data: InsertBomHeader): Promise<BomHeader> {
    const [created] = await db.insert(bomHeaders).values(data).returning();
    return created;
  }

  async updateBomHeader(id: number, data: Partial<InsertBomHeader>): Promise<BomHeader | undefined> {
    const [updated] = await db.update(bomHeaders).set(data).where(eq(bomHeaders.id, id)).returning();
    return updated;
  }

  async deleteBomHeader(id: number): Promise<boolean> {
    await db.delete(bomHeaders).where(eq(bomHeaders.id, id));
    return true;
  }

  async getBomLines(bomId: number): Promise<BomLine[]> {
    return db.select().from(bomLines).where(eq(bomLines.bomId, bomId));
  }

  async setBomLines(bomId: number, lines: InsertBomLine[]): Promise<BomLine[]> {
    await db.delete(bomLines).where(eq(bomLines.bomId, bomId));
    if (lines.length === 0) return [];
    const withBomId = lines.map(l => ({ ...l, bomId }));
    return db.insert(bomLines).values(withBomId).returning();
  }

  async getProductBundles(bundleProductId: number): Promise<ProductBundle[]> {
    return db.select().from(productBundles).where(eq(productBundles.bundleProductId, bundleProductId));
  }

  async setProductBundles(bundleProductId: number, items: InsertProductBundle[]): Promise<ProductBundle[]> {
    await db.delete(productBundles).where(eq(productBundles.bundleProductId, bundleProductId));
    if (items.length === 0) return [];
    const withId = items.map(i => ({
      ...i,
      bundleProductId,
      slotGroup: (i as any).slotGroup || null,
      isDefault: (i as any).isDefault !== false,
    }));
    return db.insert(productBundles).values(withId).returning();
  }

  async getPromotions(companyId: number): Promise<Promotion[]> {
    return db.select().from(promotions).where(eq(promotions.companyId, companyId)).orderBy(desc(promotions.createdAt));
  }

  async getPromotion(id: number): Promise<Promotion | undefined> {
    const [row] = await db.select().from(promotions).where(eq(promotions.id, id));
    return row;
  }

  async createPromotion(data: InsertPromotion): Promise<Promotion> {
    const [created] = await db.insert(promotions).values(data).returning();
    return created;
  }

  async updatePromotion(id: number, data: Partial<InsertPromotion>): Promise<Promotion | undefined> {
    const [updated] = await db.update(promotions).set(data).where(eq(promotions.id, id)).returning();
    return updated;
  }

  async deletePromotion(id: number): Promise<boolean> {
    await db.delete(promotions).where(eq(promotions.id, id));
    return true;
  }

  async getPromotionRules(promotionId: number): Promise<PromotionRule[]> {
    return db.select().from(promotionRules).where(eq(promotionRules.promotionId, promotionId));
  }

  async setPromotionRules(promotionId: number, rules: InsertPromotionRule[]): Promise<PromotionRule[]> {
    await db.delete(promotionRules).where(eq(promotionRules.promotionId, promotionId));
    if (rules.length === 0) return [];
    const withId = rules.map(r => ({ ...r, promotionId }));
    return db.insert(promotionRules).values(withId).returning();
  }

  async getProductMappings(companyId: number, sellProductId?: number): Promise<ProductMapping[]> {
    const conditions = [eq(productMappings.companyId, companyId)];
    if (sellProductId) conditions.push(eq(productMappings.sellProductId, sellProductId));
    return db.select().from(productMappings).where(and(...conditions)).orderBy(desc(productMappings.createdAt));
  }

  async getProductMapping(id: number): Promise<ProductMapping | undefined> {
    const [row] = await db.select().from(productMappings).where(eq(productMappings.id, id));
    return row;
  }

  async createProductMapping(data: InsertProductMapping): Promise<ProductMapping> {
    const [created] = await db.insert(productMappings).values(data).returning();
    return created;
  }

  async updateProductMapping(id: number, data: Partial<InsertProductMapping>): Promise<ProductMapping | undefined> {
    const [updated] = await db.update(productMappings).set(data).where(eq(productMappings.id, id)).returning();
    return updated;
  }

  async deleteProductMapping(id: number): Promise<boolean> {
    await db.delete(productMappings).where(eq(productMappings.id, id));
    return true;
  }

  async getMappingsForSellProduct(sellProductId: number): Promise<ProductMapping[]> {
    return db.select().from(productMappings).where(eq(productMappings.sellProductId, sellProductId));
  }

  async getProductStock(companyId: number, productId?: number): Promise<ProductStock[]> {
    const conditions = [eq(productStock.companyId, companyId)];
    if (productId) conditions.push(eq(productStock.productId, productId));
    return db.select().from(productStock).where(and(...conditions));
  }

  async upsertProductStock(companyId: number, productId: number, quantity: string): Promise<ProductStock> {
    const [existing] = await db.select().from(productStock)
      .where(and(eq(productStock.companyId, companyId), eq(productStock.productId, productId)));
    if (existing) {
      const [updated] = await db.update(productStock)
        .set({ quantity, updatedAt: new Date() })
        .where(eq(productStock.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(productStock).values({ companyId, productId, quantity }).returning();
    return created;
  }

  async adjustStock(companyId: number, productId: number, delta: string, movementType: string, notes?: string, referenceType?: string, referenceId?: number, extra?: { unitCost?: string; totalCost?: string; referenceNo?: string; createdBy?: number }): Promise<ProductStock> {
    const [existing] = await db.select().from(productStock)
      .where(and(eq(productStock.companyId, companyId), eq(productStock.productId, productId)));
    const currentQty = Number(existing?.quantity || "0");
    const newQty = String(currentQty + Number(delta));
    await db.insert(stockMovements).values({
      companyId, productId, movementType, quantity: delta, notes, referenceType, referenceId,
      unitCost: extra?.unitCost || "0",
      totalCost: extra?.totalCost || "0",
      referenceNo: extra?.referenceNo || null,
      createdBy: extra?.createdBy || null,
    });
    return this.upsertProductStock(companyId, productId, newQty);
  }

  async getStockMovements(companyId: number, productId?: number): Promise<StockMovement[]> {
    const conditions = [eq(stockMovements.companyId, companyId)];
    if (productId) conditions.push(eq(stockMovements.productId, productId));
    return db.select().from(stockMovements).where(and(...conditions)).orderBy(desc(stockMovements.createdAt));
  }

  async getEcommerceConnections(companyId: number): Promise<EcommerceConnection[]> {
    return ecomDb.select().from(ecommerceConnections).where(eq(ecommerceConnections.companyId, companyId)).orderBy(desc(ecommerceConnections.createdAt));
  }

  async getEcommerceConnection(id: number): Promise<EcommerceConnection | undefined> {
    const [row] = await ecomDb.select().from(ecommerceConnections).where(eq(ecommerceConnections.id, id));
    return row;
  }

  async createEcommerceConnection(data: InsertEcommerceConnection): Promise<EcommerceConnection> {
    const [created] = await ecomDb.insert(ecommerceConnections).values(data).returning();
    try {
      const { ensureStoreFolderCode } = await import("./services/folder-codes");
      await ensureStoreFolderCode(created.id);
    } catch (e: any) {
      console.log("Auto folder code for store:", e.message);
    }
    return created;
  }

  async updateEcommerceConnection(id: number, data: Partial<InsertEcommerceConnection>): Promise<EcommerceConnection | undefined> {
    const [updated] = await ecomDb.update(ecommerceConnections).set(data).where(eq(ecommerceConnections.id, id)).returning();
    if (updated && (data.shopName !== undefined || data.platform !== undefined || data.status !== undefined)) {
      try {
        const { markStoreDirty } = await import("./services/folder-codes");
        await markStoreDirty(id, data.shopName || undefined, data.platform || undefined);
      } catch (e: any) {
        console.log("Mark store dirty:", e.message);
      }
    }
    return updated;
  }

  async deleteEcommerceConnection(id: number): Promise<boolean> {
    const result = await ecomDb.delete(ecommerceConnections).where(eq(ecommerceConnections.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEcommerceOrders(companyId: number, connectionId?: number, status?: string, options?: { startDate?: string; endDate?: string; platform?: string; hasDocument?: string }): Promise<(EcommerceOrder & { itemCount: number })[]> {
    const conditions: any[] = [eq(ecommerceOrders.companyId, companyId)];
    if (connectionId) conditions.push(eq(ecommerceOrders.connectionId, connectionId));
    if (status) conditions.push(eq(ecommerceOrders.status, status));
    if (options?.platform) conditions.push(eq(ecommerceOrders.platform, options.platform));
    if (options?.startDate) conditions.push(gte(ecommerceOrders.placedAt, new Date(options.startDate)));
    if (options?.endDate) {
      const endDate = new Date(options.endDate);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(ecommerceOrders.placedAt, endDate));
    }
    if (options?.hasDocument === "yes") conditions.push(isNotNull(ecommerceOrders.taxInvoiceId));
    if (options?.hasDocument === "no") conditions.push(isNull(ecommerceOrders.taxInvoiceId));
    const itemCountSub = ecomDb.select({ orderId: ecommerceOrderItems.orderId, cnt: count().as("cnt"), itemNames: sql<string>`string_agg(${ecommerceOrderItems.name}, '||')`.as("item_names") }).from(ecommerceOrderItems).groupBy(ecommerceOrderItems.orderId).as("item_counts");
    const rows = await ecomDb.select({ order: ecommerceOrders, itemCount: sql<number>`coalesce(${itemCountSub.cnt}, 0)`, itemNames: itemCountSub.itemNames }).from(ecommerceOrders).leftJoin(itemCountSub, eq(ecommerceOrders.id, itemCountSub.orderId)).where(and(...conditions)).orderBy(desc(ecommerceOrders.placedAt));
    return rows.map(r => ({ ...r.order, itemCount: Number(r.itemCount) || 0, itemNames: r.itemNames ? String(r.itemNames).split("||") : [] }));
  }

  async getEcommerceOrder(id: number): Promise<EcommerceOrder | undefined> {
    const [row] = await ecomDb.select().from(ecommerceOrders).where(eq(ecommerceOrders.id, id));
    return row;
  }

  async createEcommerceOrder(data: InsertEcommerceOrder): Promise<EcommerceOrder> {
    const [created] = await ecomDb.insert(ecommerceOrders).values(data).returning();
    return created;
  }

  async updateEcommerceOrder(id: number, data: Partial<InsertEcommerceOrder>): Promise<EcommerceOrder | undefined> {
    const [updated] = await ecomDb.update(ecommerceOrders).set(data).where(eq(ecommerceOrders.id, id)).returning();
    return updated;
  }

  async getEcommerceOrderItems(orderId: number): Promise<EcommerceOrderItem[]> {
    return ecomDb.select().from(ecommerceOrderItems).where(eq(ecommerceOrderItems.orderId, orderId));
  }

  async createEcommerceOrderItem(data: InsertEcommerceOrderItem): Promise<EcommerceOrderItem> {
    const [created] = await ecomDb.insert(ecommerceOrderItems).values(data).returning();
    return created;
  }

  async getEcommerceProductMappings(companyId: number, connectionId?: number): Promise<EcommerceProductMapping[]> {
    const conditions = [eq(ecommerceProductMappings.companyId, companyId)];
    if (connectionId) conditions.push(eq(ecommerceProductMappings.connectionId, connectionId));
    return ecomDb.select().from(ecommerceProductMappings).where(and(...conditions));
  }

  async createEcommerceProductMapping(data: InsertEcommerceProductMapping): Promise<EcommerceProductMapping> {
    const [created] = await ecomDb.insert(ecommerceProductMappings).values(data).returning();
    return created;
  }

  async deleteEcommerceProductMapping(id: number): Promise<boolean> {
    const result = await ecomDb.delete(ecommerceProductMappings).where(eq(ecommerceProductMappings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getLiveSessions(companyId: number): Promise<LiveSession[]> {
    return ecomDb.select().from(liveSessions).where(eq(liveSessions.companyId, companyId)).orderBy(desc(liveSessions.createdAt));
  }

  async getLiveSession(id: number): Promise<LiveSession | undefined> {
    const [row] = await ecomDb.select().from(liveSessions).where(eq(liveSessions.id, id));
    return row;
  }

  async createLiveSession(data: InsertLiveSession): Promise<LiveSession> {
    const [created] = await ecomDb.insert(liveSessions).values(data).returning();
    return created;
  }

  async updateLiveSession(id: number, data: Partial<InsertLiveSession>): Promise<LiveSession | undefined> {
    const [updated] = await ecomDb.update(liveSessions).set(data).where(eq(liveSessions.id, id)).returning();
    return updated;
  }

  async getLiveSessionProducts(sessionId: number): Promise<LiveSessionProduct[]> {
    return ecomDb.select().from(liveSessionProducts).where(eq(liveSessionProducts.sessionId, sessionId)).orderBy(liveSessionProducts.sortOrder);
  }

  async createLiveSessionProduct(data: InsertLiveSessionProduct): Promise<LiveSessionProduct> {
    const [created] = await ecomDb.insert(liveSessionProducts).values(data).returning();
    return created;
  }

  async updateLiveSessionProduct(id: number, data: Partial<InsertLiveSessionProduct>): Promise<LiveSessionProduct | undefined> {
    const [updated] = await ecomDb.update(liveSessionProducts).set(data).where(eq(liveSessionProducts.id, id)).returning();
    return updated;
  }

  async deleteLiveSessionProduct(id: number): Promise<boolean> {
    const result = await ecomDb.delete(liveSessionProducts).where(eq(liveSessionProducts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getLiveCfOrders(companyId: number, sessionId?: number, status?: string): Promise<LiveCfOrder[]> {
    const conditions = [eq(liveCfOrders.companyId, companyId)];
    if (sessionId) conditions.push(eq(liveCfOrders.sessionId, sessionId));
    if (status) conditions.push(eq(liveCfOrders.status, status));
    return db.select().from(liveCfOrders).where(and(...conditions)).orderBy(desc(liveCfOrders.createdAt));
  }

  async getLiveCfOrder(id: number): Promise<LiveCfOrder | undefined> {
    const [row] = await db.select().from(liveCfOrders).where(eq(liveCfOrders.id, id));
    return row;
  }

  async createLiveCfOrder(data: InsertLiveCfOrder): Promise<LiveCfOrder> {
    const [created] = await db.insert(liveCfOrders).values(data).returning();
    return created;
  }

  async updateLiveCfOrder(id: number, data: Partial<InsertLiveCfOrder>): Promise<LiveCfOrder | undefined> {
    const [updated] = await db.update(liveCfOrders).set(data).where(eq(liveCfOrders.id, id)).returning();
    return updated;
  }

  async getLiveCfItems(cfOrderId: number): Promise<LiveCfItem[]> {
    return db.select().from(liveCfItems).where(eq(liveCfItems.cfOrderId, cfOrderId));
  }

  async createLiveCfItem(data: InsertLiveCfItem): Promise<LiveCfItem> {
    const [created] = await db.insert(liveCfItems).values(data).returning();
    return created;
  }

  async getLivePayments(cfOrderId: number): Promise<LivePayment[]> {
    return db.select().from(livePayments).where(eq(livePayments.cfOrderId, cfOrderId)).orderBy(desc(livePayments.createdAt));
  }

  async createLivePayment(data: InsertLivePayment): Promise<LivePayment> {
    const [created] = await db.insert(livePayments).values(data).returning();
    return created;
  }

  async updateLivePayment(id: number, data: Partial<InsertLivePayment>): Promise<LivePayment | undefined> {
    const [updated] = await db.update(livePayments).set(data).where(eq(livePayments.id, id)).returning();
    return updated;
  }

  async getSalesOrders(companyId: number, filters?: { status?: string; paymentStatus?: string; channel?: string; search?: string }): Promise<SalesOrder[]> {
    let query = db.select().from(salesOrders).where(eq(salesOrders.companyId, companyId));
    const conditions: any[] = [eq(salesOrders.companyId, companyId)];
    if (filters?.status) conditions.push(eq(salesOrders.status, filters.status));
    if (filters?.paymentStatus) conditions.push(eq(salesOrders.paymentStatus, filters.paymentStatus));
    if (filters?.channel) conditions.push(eq(salesOrders.channel, filters.channel));
    if (filters?.search) conditions.push(
      sql`(${salesOrders.orderNo} ILIKE ${'%' + filters.search + '%'} OR ${salesOrders.customerName} ILIKE ${'%' + filters.search + '%'} OR ${salesOrders.channelOrderNo} ILIKE ${'%' + filters.search + '%'})`
    );
    return db.select().from(salesOrders).where(and(...conditions)).orderBy(desc(salesOrders.orderDate), desc(salesOrders.id));
  }

  async getSalesOrder(id: number): Promise<SalesOrder | undefined> {
    const [order] = await db.select().from(salesOrders).where(eq(salesOrders.id, id));
    return order;
  }

  async createSalesOrder(data: InsertSalesOrder): Promise<SalesOrder> {
    const [created] = await db.insert(salesOrders).values(data).returning();
    return created;
  }

  async updateSalesOrder(id: number, data: Partial<InsertSalesOrder>): Promise<SalesOrder | undefined> {
    const [updated] = await db.update(salesOrders).set({ ...data, updatedAt: new Date() }).where(eq(salesOrders.id, id)).returning();
    return updated;
  }

  async deleteSalesOrder(id: number): Promise<boolean> {
    const result = await db.delete(salesOrders).where(eq(salesOrders.id, id)).returning();
    return result.length > 0;
  }

  async getSalesOrderItems(salesOrderId: number): Promise<SalesOrderItem[]> {
    return db.select().from(salesOrderItems).where(eq(salesOrderItems.salesOrderId, salesOrderId));
  }

  async createSalesOrderItem(data: InsertSalesOrderItem): Promise<SalesOrderItem> {
    const [created] = await db.insert(salesOrderItems).values(data).returning();
    return created;
  }

  async deleteSalesOrderItems(salesOrderId: number): Promise<void> {
    await db.delete(salesOrderItems).where(eq(salesOrderItems.salesOrderId, salesOrderId));
  }

  async getSalesOrderStats(companyId: number): Promise<{ total: number; totalAmount: string; byStatus: Record<string, number>; byPayment: Record<string, number> }> {
    const orders = await db.select().from(salesOrders).where(eq(salesOrders.companyId, companyId));
    const totalAmount = orders.reduce((sum, o) => sum + parseFloat(o.totalAmount || "0"), 0);
    const byStatus: Record<string, number> = {};
    const byPayment: Record<string, number> = {};
    orders.forEach(o => {
      byStatus[o.status] = (byStatus[o.status] || 0) + 1;
      byPayment[o.paymentStatus] = (byPayment[o.paymentStatus] || 0) + 1;
    });
    return { total: orders.length, totalAmount: totalAmount.toFixed(2), byStatus, byPayment };
  }

  async getQuotations(companyId: number, filters?: { status?: string; search?: string }): Promise<Quotation[]> {
    const conditions: any[] = [eq(quotations.companyId, companyId)];
    if (filters?.status) conditions.push(eq(quotations.status, filters.status));
    if (filters?.search) conditions.push(
      sql`(${quotations.quotationNo} ILIKE ${'%' + filters.search + '%'} OR ${quotations.customerName} ILIKE ${'%' + filters.search + '%'})`
    );
    return db.select().from(quotations).where(and(...conditions)).orderBy(desc(quotations.quotationDate), desc(quotations.id));
  }

  async getQuotation(id: number): Promise<Quotation | undefined> {
    const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
    return q;
  }

  async createQuotation(data: InsertQuotation): Promise<Quotation> {
    const [created] = await db.insert(quotations).values(data).returning();
    return created;
  }

  async updateQuotation(id: number, data: Partial<InsertQuotation>): Promise<Quotation | undefined> {
    const [updated] = await db.update(quotations).set({ ...data, updatedAt: new Date() }).where(eq(quotations.id, id)).returning();
    return updated;
  }

  async deleteQuotation(id: number): Promise<void> {
    await db.delete(quotations).where(eq(quotations.id, id));
  }

  async getQuotationItems(quotationId: number): Promise<QuotationItem[]> {
    return db.select().from(quotationItems).where(eq(quotationItems.quotationId, quotationId));
  }

  async createQuotationItem(data: InsertQuotationItem): Promise<QuotationItem> {
    const [created] = await db.insert(quotationItems).values(data).returning();
    return created;
  }

  async deleteQuotationItems(quotationId: number): Promise<void> {
    await db.delete(quotationItems).where(eq(quotationItems.quotationId, quotationId));
  }

  async getNextQuotationNo(companyId: number, docDate?: string): Promise<string> {
    const { formatDocNumber } = await import("@shared/document-types");
    const [settings] = await db.select().from(documentSettings).where(eq(documentSettings.companyId, companyId));
    const format = (settings?.docNumberFormat || "YMD_SEQ") as any;
    const digits = settings?.docNumberDigits || 4;
    const era = (settings?.dateEra || "CE") as any;
    const prefix = "QO";

    let now = docDate ? new Date(docDate + "T00:00:00") : new Date();
    if (isNaN(now.getTime())) now = new Date();
    const ceYear = now.getFullYear();
    const year = era === "BE" ? ceYear + 543 : ceYear;
    const yy = String(year).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    let likePattern: string;
    switch (format) {
      case "YMD_SEQ":
        likePattern = `${prefix}${yy}${mm}${dd}%`;
        break;
      case "YM_SEQ":
        likePattern = `${prefix}${yy}${mm}%`;
        break;
      case "Y_SEQ":
      default:
        likePattern = `${prefix}${yy}%`;
        break;
    }

    const existing = await db.select({ quotationNo: quotations.quotationNo })
      .from(quotations)
      .where(and(
        eq(quotations.companyId, companyId),
        sql`${quotations.quotationNo} LIKE ${likePattern}`
      ))
      .orderBy(desc(quotations.quotationNo));

    let nextSeq = 1;
    if (existing.length > 0) {
      const lastNo = existing[0].quotationNo;
      const seqPart = lastNo.slice(-digits);
      const parsed = parseInt(seqPart, 10);
      if (!isNaN(parsed)) nextSeq = parsed + 1;
    }

    return formatDocNumber(prefix, nextSeq, format, digits, era, now);
  }

  async getFixedAssets(companyId: number): Promise<FixedAsset[]> {
    return await db.select().from(fixedAssets).where(eq(fixedAssets.companyId, companyId)).orderBy(desc(fixedAssets.createdAt));
  }
  async getFixedAsset(id: number): Promise<FixedAsset | undefined> {
    const [asset] = await db.select().from(fixedAssets).where(eq(fixedAssets.id, id));
    return asset;
  }
  async createFixedAsset(data: InsertFixedAsset): Promise<FixedAsset> {
    const [asset] = await db.insert(fixedAssets).values(data).returning();
    return asset;
  }
  async updateFixedAsset(id: number, data: Partial<InsertFixedAsset>): Promise<FixedAsset | undefined> {
    const [asset] = await db.update(fixedAssets).set({ ...data, updatedAt: new Date() }).where(eq(fixedAssets.id, id)).returning();
    return asset;
  }
  async deleteFixedAsset(id: number): Promise<boolean> {
    await db.delete(assetDepreciations).where(eq(assetDepreciations.assetId, id));
    const result = await db.delete(fixedAssets).where(eq(fixedAssets.id, id));
    return true;
  }
  async getAssetDepreciations(assetId: number): Promise<AssetDepreciation[]> {
    return await db.select().from(assetDepreciations).where(eq(assetDepreciations.assetId, assetId)).orderBy(asc(assetDepreciations.periodDate));
  }
  async createAssetDepreciation(data: InsertAssetDepreciation): Promise<AssetDepreciation> {
    const [dep] = await db.insert(assetDepreciations).values(data).returning();
    return dep;
  }
  async getNextAssetCode(companyId: number): Promise<string> {
    const [result] = await db.select({ cnt: count() }).from(fixedAssets).where(eq(fixedAssets.companyId, companyId));
    const num = (result?.cnt || 0) as number;
    return `FA${String(num + 1).padStart(5, '0')}`;
  }

  async getHolidays(companyId: number, year?: number): Promise<Holiday[]> {
    if (year) {
      return await db.select().from(holidays).where(and(eq(holidays.companyId, companyId), eq(holidays.year, year))).orderBy(asc(holidays.date));
    }
    return await db.select().from(holidays).where(eq(holidays.companyId, companyId)).orderBy(asc(holidays.date));
  }
  async getHoliday(id: number): Promise<Holiday | undefined> {
    const [h] = await db.select().from(holidays).where(eq(holidays.id, id));
    return h;
  }
  async createHoliday(data: InsertHoliday): Promise<Holiday> {
    const [h] = await db.insert(holidays).values(data).returning();
    return h;
  }
  async updateHoliday(id: number, data: Partial<InsertHoliday>): Promise<Holiday | undefined> {
    const [h] = await db.update(holidays).set(data).where(eq(holidays.id, id)).returning();
    return h;
  }
  async deleteHoliday(id: number): Promise<boolean> {
    const result = await db.delete(holidays).where(eq(holidays.id, id));
    return true;
  }

  async getPayrollRecords(companyId: number, month: number, year: number): Promise<PayrollRecord[]> {
    return await db.select().from(payrollRecords).where(
      and(eq(payrollRecords.companyId, companyId), eq(payrollRecords.month, month), eq(payrollRecords.year, year))
    ).orderBy(asc(payrollRecords.employeeId));
  }
  async getPayrollRecordsByYear(companyId: number, year: number): Promise<PayrollRecord[]> {
    return await db.select().from(payrollRecords).where(
      and(eq(payrollRecords.companyId, companyId), eq(payrollRecords.year, year))
    ).orderBy(asc(payrollRecords.month), asc(payrollRecords.employeeId));
  }
  async getPayrollRecord(id: number): Promise<PayrollRecord | undefined> {
    const [r] = await db.select().from(payrollRecords).where(eq(payrollRecords.id, id));
    return r;
  }
  async createPayrollRecord(data: InsertPayrollRecord): Promise<PayrollRecord> {
    const [r] = await db.insert(payrollRecords).values(data).returning();
    return r;
  }
  async updatePayrollRecord(id: number, data: Partial<InsertPayrollRecord>): Promise<PayrollRecord | undefined> {
    const [r] = await db.update(payrollRecords).set(data).where(eq(payrollRecords.id, id)).returning();
    return r;
  }
  async deletePayrollRecordsByMonth(companyId: number, month: number, year: number): Promise<boolean> {
    await db.delete(payrollRecords).where(
      and(eq(payrollRecords.companyId, companyId), eq(payrollRecords.month, month), eq(payrollRecords.year, year))
    );
    return true;
  }
  async deletePayrollRecord(id: number): Promise<boolean> {
    await db.delete(payrollRecords).where(eq(payrollRecords.id, id));
    return true;
  }
  async updatePayrollStatus(companyId: number, month: number, year: number, status: string): Promise<void> {
    await db.update(payrollRecords).set({ status }).where(
      and(eq(payrollRecords.companyId, companyId), eq(payrollRecords.month, month), eq(payrollRecords.year, year))
    );
  }

  async getTaskBoards(companyId: number): Promise<TaskBoard[]> {
    return db.select().from(taskBoards).where(eq(taskBoards.companyId, companyId)).orderBy(desc(taskBoards.createdAt));
  }
  async getTaskBoard(id: number): Promise<TaskBoard | undefined> {
    const [board] = await db.select().from(taskBoards).where(eq(taskBoards.id, id));
    return board;
  }
  async createTaskBoard(data: InsertTaskBoard): Promise<TaskBoard> {
    const [board] = await db.insert(taskBoards).values(data).returning();
    return board;
  }
  async updateTaskBoard(id: number, data: Partial<InsertTaskBoard>): Promise<TaskBoard | undefined> {
    const [board] = await db.update(taskBoards).set(data).where(eq(taskBoards.id, id)).returning();
    return board;
  }
  async deleteTaskBoard(id: number): Promise<boolean> {
    await db.delete(taskBoards).where(eq(taskBoards.id, id));
    return true;
  }
  async getTaskBoardMembers(boardId: number): Promise<TaskBoardMember[]> {
    return db.select().from(taskBoardMembers).where(eq(taskBoardMembers.boardId, boardId));
  }
  async addTaskBoardMember(data: InsertTaskBoardMember): Promise<TaskBoardMember> {
    const [member] = await db.insert(taskBoardMembers).values(data).returning();
    return member;
  }
  async removeTaskBoardMember(boardId: number, userId: number): Promise<boolean> {
    await db.delete(taskBoardMembers).where(and(eq(taskBoardMembers.boardId, boardId), eq(taskBoardMembers.userId, userId)));
    return true;
  }
  async getTaskColumns(boardId: number): Promise<TaskColumn[]> {
    return db.select().from(taskColumns).where(eq(taskColumns.boardId, boardId)).orderBy(asc(taskColumns.sortOrder));
  }
  async createTaskColumn(data: InsertTaskColumn): Promise<TaskColumn> {
    const [col] = await db.insert(taskColumns).values(data).returning();
    return col;
  }
  async updateTaskColumn(id: number, data: Partial<InsertTaskColumn>): Promise<TaskColumn | undefined> {
    const [col] = await db.update(taskColumns).set(data).where(eq(taskColumns.id, id)).returning();
    return col;
  }
  async deleteTaskColumn(id: number): Promise<boolean> {
    await db.delete(taskColumns).where(eq(taskColumns.id, id));
    return true;
  }
  async getTasks(boardId: number): Promise<Task[]> {
    return db.select().from(tasks).where(eq(tasks.boardId, boardId)).orderBy(asc(tasks.sortOrder));
  }
  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }
  async createTask(data: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(data).returning();
    return task;
  }
  async updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined> {
    const [task] = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
    return task;
  }
  async deleteTask(id: number): Promise<boolean> {
    await db.delete(tasks).where(eq(tasks.id, id));
    return true;
  }
  async getTaskAssignees(taskId: number): Promise<TaskAssignee[]> {
    return db.select().from(taskAssignees).where(eq(taskAssignees.taskId, taskId));
  }
  async addTaskAssignee(data: InsertTaskAssignee): Promise<TaskAssignee> {
    const [assignee] = await db.insert(taskAssignees).values(data).returning();
    return assignee;
  }
  async removeTaskAssignee(taskId: number, employeeId: number): Promise<boolean> {
    await db.delete(taskAssignees).where(and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.employeeId, employeeId)));
    return true;
  }
  async getTaskComments(taskId: number): Promise<TaskComment[]> {
    return db.select().from(taskComments).where(eq(taskComments.taskId, taskId)).orderBy(desc(taskComments.createdAt));
  }
  async createTaskComment(data: InsertTaskComment): Promise<TaskComment> {
    const [comment] = await db.insert(taskComments).values(data).returning();
    return comment;
  }
  async deleteTaskComment(id: number): Promise<boolean> {
    await db.delete(taskComments).where(eq(taskComments.id, id));
    return true;
  }

  async getContracts(companyId: number): Promise<Contract[]> {
    return db.select().from(contracts).where(eq(contracts.companyId, companyId)).orderBy(desc(contracts.createdAt));
  }
  async getContractsByClient(firmClientId: number): Promise<Contract[]> {
    return db.select().from(contracts).where(eq(contracts.firmClientId, firmClientId)).orderBy(desc(contracts.createdAt));
  }
  async getContract(id: number): Promise<Contract | undefined> {
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
    return contract;
  }
  async getContractByToken(token: string): Promise<Contract | undefined> {
    const [contract] = await db.select().from(contracts).where(eq(contracts.publicToken, token));
    return contract;
  }
  async createContract(data: InsertContract): Promise<Contract> {
    const [contract] = await db.insert(contracts).values(data).returning();
    return contract;
  }
  async updateContract(id: number, data: Partial<InsertContract>): Promise<Contract | undefined> {
    const [contract] = await db.update(contracts).set(data).where(eq(contracts.id, id)).returning();
    return contract;
  }
  async deleteContract(id: number): Promise<boolean> {
    await db.delete(contracts).where(eq(contracts.id, id));
    return true;
  }

  async getWorkBoards(companyId: number): Promise<WorkBoard[]> {
    return db.select().from(workBoards).where(eq(workBoards.companyId, companyId)).orderBy(desc(workBoards.createdAt));
  }
  async getWorkBoard(id: number): Promise<WorkBoard | undefined> {
    const [board] = await db.select().from(workBoards).where(eq(workBoards.id, id));
    return board;
  }
  async createWorkBoard(data: InsertWorkBoard): Promise<WorkBoard> {
    const [board] = await db.insert(workBoards).values(data).returning();
    return board;
  }
  async updateWorkBoard(id: number, data: Partial<InsertWorkBoard>): Promise<WorkBoard | undefined> {
    const [board] = await db.update(workBoards).set(data).where(eq(workBoards.id, id)).returning();
    return board;
  }
  async deleteWorkBoard(id: number): Promise<void> {
    await db.delete(workBoardItems).where(eq(workBoardItems.boardId, id));
    await db.delete(workBoardColumns).where(eq(workBoardColumns.boardId, id));
    await db.delete(workBoardGroups).where(eq(workBoardGroups.boardId, id));
    await db.delete(workBoards).where(eq(workBoards.id, id));
  }

  async duplicateWorkBoard(id: number, userId: number): Promise<WorkBoard> {
    const source = await this.getWorkBoard(id);
    if (!source) throw new Error("Board not found");
    return await db.transaction(async (tx) => {
      const [newBoard] = await tx.insert(workBoards).values({
        name: `${source.name} (สำเนา)`,
        color: source.color,
        companyId: source.companyId,
        createdBy: userId,
      }).returning();
      const srcGroups = await tx.select().from(workBoardGroups).where(eq(workBoardGroups.boardId, id)).orderBy(asc(workBoardGroups.position));
      const groupMap: Record<number, number> = {};
      for (const g of srcGroups) {
        const [ng] = await tx.insert(workBoardGroups).values({ boardId: newBoard.id, name: g.name, color: g.color, position: g.position }).returning();
        groupMap[g.id] = ng.id;
      }
      const srcCols = await tx.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, id)).orderBy(asc(workBoardColumns.position));
      const colMap: Record<number, number> = {};
      for (const c of srcCols) {
        const [nc] = await tx.insert(workBoardColumns).values({ boardId: newBoard.id, name: c.name, columnType: c.columnType, options: c.options, position: c.position }).returning();
        colMap[c.id] = nc.id;
      }
      const srcItems = await tx.select().from(workBoardItems).where(eq(workBoardItems.boardId, id)).orderBy(asc(workBoardItems.position));
      for (const item of srcItems) {
        let newCellValues = item.cellValues || "{}";
        try {
          const cells = JSON.parse(newCellValues);
          const remapped: Record<string, any> = {};
          for (const [oldColId, val] of Object.entries(cells)) {
            const newColId = colMap[Number(oldColId)];
            if (newColId) remapped[String(newColId)] = val;
          }
          newCellValues = JSON.stringify(remapped);
        } catch {}
        await tx.insert(workBoardItems).values({ boardId: newBoard.id, groupId: item.groupId ? groupMap[item.groupId] || null : null, name: item.name, cellValues: newCellValues, position: item.position, createdBy: userId });
      }
      return newBoard;
    });
  }
  async getWorkBoardGroups(boardId: number): Promise<WorkBoardGroup[]> {
    return db.select().from(workBoardGroups).where(eq(workBoardGroups.boardId, boardId)).orderBy(asc(workBoardGroups.position));
  }
  async createWorkBoardGroup(data: InsertWorkBoardGroup): Promise<WorkBoardGroup> {
    const [group] = await db.insert(workBoardGroups).values(data).returning();
    return group;
  }
  async updateWorkBoardGroup(id: number, data: Partial<InsertWorkBoardGroup>): Promise<WorkBoardGroup | undefined> {
    const [group] = await db.update(workBoardGroups).set(data).where(eq(workBoardGroups.id, id)).returning();
    return group;
  }
  async deleteWorkBoardGroup(id: number): Promise<void> {
    await db.update(workBoardItems).set({ groupId: null } as any).where(eq(workBoardItems.groupId, id));
    await db.delete(workBoardGroups).where(eq(workBoardGroups.id, id));
  }
  async getWorkBoardColumns(boardId: number): Promise<WorkBoardColumn[]> {
    return db.select().from(workBoardColumns).where(eq(workBoardColumns.boardId, boardId)).orderBy(asc(workBoardColumns.position));
  }
  async createWorkBoardColumn(data: InsertWorkBoardColumn): Promise<WorkBoardColumn> {
    const [col] = await db.insert(workBoardColumns).values(data).returning();
    return col;
  }
  async updateWorkBoardColumn(id: number, data: Partial<InsertWorkBoardColumn>): Promise<WorkBoardColumn | undefined> {
    const [col] = await db.update(workBoardColumns).set(data).where(eq(workBoardColumns.id, id)).returning();
    return col;
  }
  async deleteWorkBoardColumn(id: number): Promise<void> {
    await db.delete(workBoardColumns).where(eq(workBoardColumns.id, id));
  }
  async getWorkBoardItems(boardId: number): Promise<WorkBoardItem[]> {
    return db.select().from(workBoardItems).where(eq(workBoardItems.boardId, boardId)).orderBy(asc(workBoardItems.position));
  }
  async createWorkBoardItem(data: InsertWorkBoardItem): Promise<WorkBoardItem> {
    const [item] = await db.insert(workBoardItems).values(data).returning();
    return item;
  }
  async updateWorkBoardItem(id: number, data: Partial<InsertWorkBoardItem>): Promise<WorkBoardItem | undefined> {
    const [item] = await db.update(workBoardItems).set(data).where(eq(workBoardItems.id, id)).returning();
    return item;
  }
  async deleteWorkBoardItem(id: number): Promise<void> {
    await db.delete(workBoardItems).where(eq(workBoardItems.id, id));
  }

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.active, true)).orderBy(asc(subscriptionPlans.sortOrder));
  }
  async getSubscriptionPlan(id: number): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
    return plan;
  }
  async getSubscriptionPlanByCode(code: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.code, code));
    return plan;
  }
  async createSubscriptionPlan(data: InsertSubscriptionPlan): Promise<SubscriptionPlan> {
    const [plan] = await db.insert(subscriptionPlans).values(data).returning();
    return plan;
  }
  async updateSubscriptionPlan(id: number, data: Partial<InsertSubscriptionPlan>): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.update(subscriptionPlans).set(data).where(eq(subscriptionPlans.id, id)).returning();
    return plan;
  }
  async deleteSubscriptionPlan(id: number): Promise<boolean> {
    const result = await db.delete(subscriptionPlans).where(eq(subscriptionPlans.id, id)).returning();
    return result.length > 0;
  }

  async getTenantSubscription(tenantId: number): Promise<(TenantSubscription & { plan?: SubscriptionPlan }) | undefined> {
    const [sub] = await db.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, tenantId)).orderBy(desc(tenantSubscriptions.createdAt)).limit(1);
    if (!sub) return undefined;
    const plan = await this.getSubscriptionPlan(sub.planId);
    return { ...sub, plan };
  }
  async getAllTenantSubscriptions(): Promise<(TenantSubscription & { plan?: SubscriptionPlan, tenant?: Tenant })[]> {
    const subs = await db.select().from(tenantSubscriptions).orderBy(desc(tenantSubscriptions.createdAt));
    const results = [];
    for (const sub of subs) {
      const plan = await this.getSubscriptionPlan(sub.planId);
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, sub.tenantId));
      results.push({ ...sub, plan, tenant });
    }
    return results;
  }
  async createTenantSubscription(data: InsertTenantSubscription): Promise<TenantSubscription> {
    const [sub] = await db.insert(tenantSubscriptions).values(data).returning();
    return sub;
  }
  async updateTenantSubscription(id: number, data: Partial<InsertTenantSubscription>): Promise<TenantSubscription | undefined> {
    const [sub] = await db.update(tenantSubscriptions).set({ ...data, updatedAt: new Date() }).where(eq(tenantSubscriptions.id, id)).returning();
    return sub;
  }

  async getTenantUsageStats(tenantId: number): Promise<{ users: number; companies: number; products: number; documents: number; ecommerceConnections: number }> {
    const [userCount] = await db.select({ count: count() }).from(users).where(eq(users.tenantId, tenantId));
    const [companyCount] = await db.select({ count: count() }).from(companies).where(eq(companies.tenantId, tenantId));

    const tenantCompanyIds = db.select({ id: companies.id }).from(companies).where(eq(companies.tenantId, tenantId));

    const [productCount] = await db.select({ count: count() }).from(products).where(inArray(products.companyId, tenantCompanyIds));
    const [ecomCount] = await ecomDb.select({ count: count() }).from(ecommerceConnections).where(inArray(ecommerceConnections.companyId, tenantCompanyIds));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    let totalDocs = 0;
    const countDocsInTable = async (tbl: any, dateCol: any) => {
      const [r] = await db.select({ count: count() }).from(tbl).where(
        and(
          inArray(tbl.companyId, tenantCompanyIds),
          gte(dateCol, monthStart),
          lte(dateCol, monthEnd)
        )
      );
      return r.count;
    };

    totalDocs += await countDocsInTable(quotations, quotations.quotationDate);
    totalDocs += await countDocsInTable(invoices, invoices.invoiceDate);
    totalDocs += await countDocsInTable(taxInvoices, taxInvoices.taxInvoiceDate);
    totalDocs += await countDocsInTable(receipts, receipts.receiptDate);
    totalDocs += await countDocsInTable(salesOrders, salesOrders.orderDate);
    totalDocs += await countDocsInTable(purchaseOrders, purchaseOrders.poDate);
    totalDocs += await countDocsInTable(expenses, expenses.expDate);

    return {
      users: userCount.count,
      companies: companyCount.count,
      products: productCount.count,
      documents: totalDocs,
      ecommerceConnections: ecomCount.count,
    };
  }

  async checkTenantLimit(tenantId: number, feature: string): Promise<{ allowed: boolean; current: number; limit: number; planName: string }> {
    const sub = await this.getTenantSubscription(tenantId);
    if (!sub || !sub.plan) {
      return { allowed: true, current: 0, limit: 999999, planName: "ไม่มีแพ็คเกจ" };
    }
    const usage = await this.getTenantUsageStats(tenantId);
    const plan = sub.plan;

    let current = 0;
    let limit = 0;
    switch (feature) {
      case "users":
        current = usage.users;
        limit = plan.maxUsers;
        break;
      case "companies":
        current = usage.companies;
        limit = plan.maxCompanies;
        break;
      case "products":
        current = usage.products;
        limit = plan.maxProducts;
        break;
      case "documents":
        current = usage.documents;
        limit = plan.maxDocumentsPerMonth;
        break;
      case "ecommerce":
        current = usage.ecommerceConnections;
        limit = plan.maxEcommerceConnections;
        break;
      default:
        return { allowed: true, current: 0, limit: 999999, planName: plan.name };
    }
    return { allowed: current < limit, current, limit, planName: plan.name };
  }

  async getWhiteLabelSettings(tenantId: number): Promise<WhiteLabelSettings | undefined> {
    const [settings] = await db.select().from(whiteLabelSettings).where(eq(whiteLabelSettings.tenantId, tenantId));
    return settings;
  }
  async getWhiteLabelBySubdomain(subdomain: string): Promise<WhiteLabelSettings | undefined> {
    const [settings] = await db.select().from(whiteLabelSettings).where(eq(whiteLabelSettings.subdomain, subdomain));
    return settings;
  }
  async upsertWhiteLabelSettings(tenantId: number, data: Partial<InsertWhiteLabelSettings>): Promise<WhiteLabelSettings> {
    const existing = await this.getWhiteLabelSettings(tenantId);
    if (existing) {
      const [updated] = await db.update(whiteLabelSettings).set({ ...data, updatedAt: new Date() }).where(eq(whiteLabelSettings.tenantId, tenantId)).returning();
      return updated;
    }
    const [created] = await db.insert(whiteLabelSettings).values({ ...data, tenantId } as InsertWhiteLabelSettings).returning();
    return created;
  }
  async checkSubdomainAvailable(subdomain: string, excludeTenantId?: number): Promise<boolean> {
    const query = excludeTenantId
      ? await db.select().from(whiteLabelSettings).where(and(eq(whiteLabelSettings.subdomain, subdomain), ne(whiteLabelSettings.tenantId, excludeTenantId)))
      : await db.select().from(whiteLabelSettings).where(eq(whiteLabelSettings.subdomain, subdomain));
    return query.length === 0;
  }

  // Work Status Board CRUD
  async getWorkStatusBoard(tenantId: number, month: number, yearBe: number): Promise<WorkStatusBoard | undefined> {
    const [board] = await db.select().from(workStatusBoards).where(and(eq(workStatusBoards.tenantId, tenantId), eq(workStatusBoards.month, month), eq(workStatusBoards.yearBe, yearBe)));
    return board;
  }
  async createWorkStatusBoard(data: InsertWorkStatusBoard): Promise<WorkStatusBoard> {
    const [board] = await db.insert(workStatusBoards).values(data).returning();
    return board;
  }
  async updateWorkStatusBoard(id: number, data: Partial<InsertWorkStatusBoard>): Promise<WorkStatusBoard> {
    const [board] = await db.update(workStatusBoards).set(data).where(eq(workStatusBoards.id, id)).returning();
    return board;
  }

  // Work Status Columns
  async getWorkStatusColumns(boardId: number): Promise<WorkStatusColumn[]> {
    return db.select().from(workStatusColumns).where(eq(workStatusColumns.boardId, boardId)).orderBy(asc(workStatusColumns.sortOrder));
  }
  async createWorkStatusColumn(data: InsertWorkStatusColumn): Promise<WorkStatusColumn> {
    const [col] = await db.insert(workStatusColumns).values(data).returning();
    return col;
  }
  async updateWorkStatusColumn(id: number, data: Partial<InsertWorkStatusColumn>): Promise<WorkStatusColumn> {
    const [col] = await db.update(workStatusColumns).set(data).where(eq(workStatusColumns.id, id)).returning();
    return col;
  }
  async deleteWorkStatusColumn(id: number): Promise<void> {
    await db.delete(workStatusCells).where(eq(workStatusCells.columnId, id));
    await db.delete(workStatusColumns).where(eq(workStatusColumns.id, id));
  }

  async getWorkStatusBoardById(id: number): Promise<WorkStatusBoard | undefined> {
    const [board] = await db.select().from(workStatusBoards).where(eq(workStatusBoards.id, id));
    return board;
  }

  // Work Status Groups
  async getWorkStatusGroups(boardId: number): Promise<WorkStatusGroup[]> {
    return db.select().from(workStatusGroups).where(eq(workStatusGroups.boardId, boardId)).orderBy(asc(workStatusGroups.sortOrder));
  }
  async createWorkStatusGroup(data: InsertWorkStatusGroup): Promise<WorkStatusGroup> {
    const [group] = await db.insert(workStatusGroups).values(data).returning();
    return group;
  }
  async updateWorkStatusGroup(id: number, data: Partial<InsertWorkStatusGroup>): Promise<WorkStatusGroup> {
    const [group] = await db.update(workStatusGroups).set(data).where(eq(workStatusGroups.id, id)).returning();
    return group;
  }
  async deleteWorkStatusGroup(id: number): Promise<void> {
    await db.update(workStatusRows).set({ groupId: null }).where(eq(workStatusRows.groupId, id));
    await db.delete(workStatusGroups).where(eq(workStatusGroups.id, id));
  }

  // Work Status Rows
  async getWorkStatusRow(id: number): Promise<WorkStatusRow | undefined> {
    const [row] = await db.select().from(workStatusRows).where(eq(workStatusRows.id, id));
    return row;
  }
  async getWorkStatusRows(boardId: number, employeeId?: number): Promise<WorkStatusRow[]> {
    if (employeeId) {
      const assignedClientIds = await db.select({ id: firmClients.id })
        .from(firmClients).where(eq(firmClients.assignedTo, employeeId));
      const myFirmClientIds = new Set(assignedClientIds.map(r => r.id));

      const allRows = await db.select().from(workStatusRows).where(eq(workStatusRows.boardId, boardId));
      return allRows.filter(row =>
        row.assignedEmployeeId === employeeId ||
        (row.firmClientId != null && myFirmClientIds.has(row.firmClientId))
      );
    }
    return db.select().from(workStatusRows).where(eq(workStatusRows.boardId, boardId));
  }
  async createWorkStatusRow(data: InsertWorkStatusRow): Promise<WorkStatusRow> {
    const [row] = await db.insert(workStatusRows).values(data).returning();
    return row;
  }
  async updateWorkStatusRow(id: number, data: Partial<InsertWorkStatusRow>): Promise<WorkStatusRow> {
    const [row] = await db.update(workStatusRows).set({ ...data, updatedAt: new Date() }).where(eq(workStatusRows.id, id)).returning();
    return row;
  }
  async deleteWorkStatusRow(id: number): Promise<void> {
    const childRows = await db.select().from(workStatusRows).where(eq(workStatusRows.parentRowId, id));
    for (const child of childRows) {
      await this.deleteWorkStatusRow(child.id);
    }
    await db.delete(workStatusAttachments).where(eq(workStatusAttachments.rowId, id));
    const cells = await db.select().from(workStatusCells).where(eq(workStatusCells.rowId, id));
    for (const cell of cells) {
      await db.delete(workStatusAttachments).where(eq(workStatusAttachments.cellId, cell.id));
    }
    await db.delete(workStatusCells).where(eq(workStatusCells.rowId, id));
    await db.delete(workStatusRows).where(eq(workStatusRows.id, id));
  }

  // Work Status Cells
  async getWorkStatusCells(rowId: number): Promise<WorkStatusCell[]> {
    return db.select().from(workStatusCells).where(eq(workStatusCells.rowId, rowId));
  }
  async getWorkStatusCellsByRowIds(rowIds: number[]): Promise<WorkStatusCell[]> {
    if (rowIds.length === 0) return [];
    return db.select().from(workStatusCells).where(inArray(workStatusCells.rowId, rowIds));
  }
  async getWorkStatusAttachmentsByRowIds(rowIds: number[]): Promise<WorkStatusAttachment[]> {
    if (rowIds.length === 0) return [];
    return db.select().from(workStatusAttachments).where(inArray(workStatusAttachments.rowId, rowIds));
  }
  async batchUpdateWorkStatusRows(updates: Array<{ id: number; data: Partial<InsertWorkStatusRow> }>): Promise<void> {
    if (updates.length === 0) return;
    for (const u of updates) {
      await db.update(workStatusRows).set({ ...u.data, updatedAt: new Date() }).where(eq(workStatusRows.id, u.id));
    }
  }
  async upsertWorkStatusCell(rowId: number, columnId: number, data: Partial<InsertWorkStatusCell>): Promise<WorkStatusCell> {
    const [existing] = await db.select().from(workStatusCells).where(and(eq(workStatusCells.rowId, rowId), eq(workStatusCells.columnId, columnId)));
    if (existing) {
      const [updated] = await db.update(workStatusCells).set({ ...data, updatedAt: new Date() }).where(eq(workStatusCells.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(workStatusCells).values({ rowId, columnId, ...data } as InsertWorkStatusCell).returning();
    return created;
  }

  // Work Status Attachments
  async getWorkStatusAttachments(cellId?: number, rowId?: number): Promise<WorkStatusAttachment[]> {
    if (cellId) return db.select().from(workStatusAttachments).where(eq(workStatusAttachments.cellId, cellId));
    if (rowId) return db.select().from(workStatusAttachments).where(eq(workStatusAttachments.rowId, rowId));
    return [];
  }
  async createWorkStatusAttachment(data: InsertWorkStatusAttachment): Promise<WorkStatusAttachment> {
    const [att] = await db.insert(workStatusAttachments).values(data).returning();
    return att;
  }
  async deleteWorkStatusAttachment(id: number): Promise<void> {
    await db.delete(workStatusAttachments).where(eq(workStatusAttachments.id, id));
  }

  async getFirmFolders(tenantId: number, companyId?: number): Promise<FirmFolder[]> {
    const conditions = [eq(firmFolders.tenantId, tenantId)];
    if (companyId) conditions.push(eq(firmFolders.companyId, companyId));
    return db.select().from(firmFolders).where(and(...conditions)).orderBy(asc(firmFolders.sortOrder), asc(firmFolders.name));
  }
  async createFirmFolder(data: InsertFirmFolder): Promise<FirmFolder> {
    const [folder] = await db.insert(firmFolders).values(data).returning();
    return folder;
  }
  async updateFirmFolder(id: number, data: Partial<InsertFirmFolder>): Promise<FirmFolder | undefined> {
    const [folder] = await db.update(firmFolders).set({ ...data, updatedAt: new Date() }).where(eq(firmFolders.id, id)).returning();
    return folder;
  }
  async deleteFirmFolder(id: number): Promise<void> {
    await db.delete(firmDocuments).where(eq(firmDocuments.folderId, id));
    const children = await db.select().from(firmFolders).where(eq(firmFolders.parentId, id));
    for (const child of children) {
      await this.deleteFirmFolder(child.id);
    }
    await db.delete(firmFolders).where(eq(firmFolders.id, id));
  }

  async getFirmDocuments(tenantId: number, category?: string, companyId?: number): Promise<FirmDocument[]> {
    const conditions: any[] = [eq(firmDocuments.tenantId, tenantId)];
    if (category) conditions.push(eq(firmDocuments.category, category));
    if (companyId) conditions.push(eq(firmDocuments.companyId, companyId));
    return db.select().from(firmDocuments).where(and(...conditions)).orderBy(asc(firmDocuments.sortOrder), desc(firmDocuments.createdAt));
  }
  async getFirmDocumentsByFolder(tenantId: number, folderId: number | null, companyId?: number): Promise<FirmDocument[]> {
    const conditions: any[] = [eq(firmDocuments.tenantId, tenantId)];
    if (companyId) conditions.push(eq(firmDocuments.companyId, companyId));
    if (folderId === null) {
      conditions.push(isNull(firmDocuments.folderId));
    } else {
      conditions.push(eq(firmDocuments.folderId, folderId));
    }
    return db.select().from(firmDocuments).where(and(...conditions)).orderBy(asc(firmDocuments.sortOrder), desc(firmDocuments.createdAt));
  }
  async createFirmDocument(data: InsertFirmDocument): Promise<FirmDocument> {
    const [doc] = await db.insert(firmDocuments).values(data).returning();
    return doc;
  }
  async updateFirmDocument(id: number, data: Partial<InsertFirmDocument>): Promise<FirmDocument | undefined> {
    const [doc] = await db.update(firmDocuments).set({ ...data, updatedAt: new Date() }).where(eq(firmDocuments.id, id)).returning();
    return doc;
  }
  async deleteFirmDocument(id: number): Promise<void> {
    await db.delete(firmDocuments).where(eq(firmDocuments.id, id));
  }

  async getPayrollAdjustments(companyId: number, month: number, year: number): Promise<PayrollAdjustment[]> {
    return db.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.companyId, companyId), eq(payrollAdjustments.month, month), eq(payrollAdjustments.year, year))).orderBy(desc(payrollAdjustments.createdAt));
  }
  async getPayrollAdjustmentsByEmployee(employeeId: number, month: number, year: number): Promise<PayrollAdjustment[]> {
    return db.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.employeeId, employeeId), eq(payrollAdjustments.month, month), eq(payrollAdjustments.year, year))).orderBy(desc(payrollAdjustments.createdAt));
  }
  async createPayrollAdjustment(data: InsertPayrollAdjustment): Promise<PayrollAdjustment> {
    const [adj] = await db.insert(payrollAdjustments).values(data).returning();
    return adj;
  }
  async updatePayrollAdjustment(id: number, data: Partial<InsertPayrollAdjustment>): Promise<PayrollAdjustment | undefined> {
    const [adj] = await db.update(payrollAdjustments).set(data).where(eq(payrollAdjustments.id, id)).returning();
    return adj;
  }
  async deletePayrollAdjustment(id: number): Promise<boolean> {
    await db.delete(payrollAdjustments).where(eq(payrollAdjustments.id, id));
    return true;
  }

  async getEvaluationPeriods(companyId: number): Promise<EvaluationPeriod[]> {
    return db.select().from(evaluationPeriods).where(eq(evaluationPeriods.companyId, companyId)).orderBy(desc(evaluationPeriods.createdAt));
  }
  async getEvaluationPeriod(id: number): Promise<EvaluationPeriod | undefined> {
    const [p] = await db.select().from(evaluationPeriods).where(eq(evaluationPeriods.id, id));
    return p;
  }
  async createEvaluationPeriod(data: InsertEvaluationPeriod): Promise<EvaluationPeriod> {
    const [p] = await db.insert(evaluationPeriods).values(data).returning();
    return p;
  }
  async updateEvaluationPeriod(id: number, data: Partial<InsertEvaluationPeriod>): Promise<EvaluationPeriod | undefined> {
    const [p] = await db.update(evaluationPeriods).set(data).where(eq(evaluationPeriods.id, id)).returning();
    return p;
  }
  async deleteEvaluationPeriod(id: number): Promise<boolean> {
    await db.delete(evaluationResults).where(eq(evaluationResults.periodId, id));
    await db.delete(evaluationPeriods).where(eq(evaluationPeriods.id, id));
    return true;
  }
  async getEvaluationResults(periodId: number): Promise<EvaluationResult[]> {
    return db.select().from(evaluationResults).where(eq(evaluationResults.periodId, periodId)).orderBy(desc(evaluationResults.totalScore));
  }
  async getEvaluationResult(id: number): Promise<EvaluationResult | undefined> {
    const [r] = await db.select().from(evaluationResults).where(eq(evaluationResults.id, id));
    return r;
  }
  async createEvaluationResult(data: InsertEvaluationResult): Promise<EvaluationResult> {
    const [r] = await db.insert(evaluationResults).values(data).returning();
    return r;
  }
  async updateEvaluationResult(id: number, data: Partial<InsertEvaluationResult>): Promise<EvaluationResult | undefined> {
    const [r] = await db.update(evaluationResults).set(data).where(eq(evaluationResults.id, id)).returning();
    return r;
  }
  async deleteEvaluationResultsByPeriod(periodId: number): Promise<boolean> {
    await db.delete(evaluationResults).where(eq(evaluationResults.periodId, periodId));
    return true;
  }

  // LINE Group Document Archive
  async getLineGroupMappings(tenantId: number, companyId?: number): Promise<LineGroupMapping[]> {
    const conditions = [eq(lineGroupMappings.tenantId, tenantId)];
    if (companyId) conditions.push(eq(lineGroupMappings.companyId, companyId));
    return db.select().from(lineGroupMappings).where(and(...conditions)).orderBy(desc(lineGroupMappings.createdAt));
  }

  async getLineGroupMappingByGroupId(lineGroupId: string): Promise<LineGroupMapping | undefined> {
    const [mapping] = await db.select().from(lineGroupMappings).where(eq(lineGroupMappings.lineGroupId, lineGroupId));
    return mapping;
  }

  async createLineGroupMapping(data: InsertLineGroupMapping): Promise<LineGroupMapping> {
    const [mapping] = await db.insert(lineGroupMappings).values(data).returning();
    return mapping;
  }

  async updateLineGroupMapping(id: number, data: Partial<InsertLineGroupMapping>, tenantId?: number): Promise<LineGroupMapping | undefined> {
    const conditions = [eq(lineGroupMappings.id, id)];
    if (tenantId) conditions.push(eq(lineGroupMappings.tenantId, tenantId));
    const [mapping] = await db.update(lineGroupMappings).set(data).where(and(...conditions)).returning();
    return mapping;
  }

  async deleteLineGroupMapping(id: number, tenantId?: number): Promise<boolean> {
    const conditions = [eq(lineGroupMappings.id, id)];
    if (tenantId) conditions.push(eq(lineGroupMappings.tenantId, tenantId));
    await db.delete(lineGroupMappings).where(and(...conditions));
    return true;
  }

  async getLineDocuments(tenantId: number, filters?: { firmClientId?: number; lineGroupId?: string; fileType?: string; category?: string; companyId?: number }): Promise<LineDocument[]> {
    const conditions = [eq(lineDocuments.tenantId, tenantId)];
    if (filters?.companyId) conditions.push(eq(lineDocuments.companyId, filters.companyId));
    if (filters?.firmClientId) conditions.push(eq(lineDocuments.firmClientId, filters.firmClientId));
    if (filters?.lineGroupId) conditions.push(eq(lineDocuments.lineGroupId, filters.lineGroupId));
    if (filters?.fileType) conditions.push(eq(lineDocuments.fileType, filters.fileType));
    if (filters?.category) conditions.push(eq(lineDocuments.category, filters.category));
    return db.select().from(lineDocuments).where(and(...conditions)).orderBy(desc(lineDocuments.sentAt));
  }

  async createLineDocument(data: InsertLineDocument): Promise<LineDocument> {
    const [doc] = await db.insert(lineDocuments).values(data).returning();
    return doc;
  }

  async deleteLineDocument(id: number): Promise<boolean> {
    await db.delete(lineDocuments).where(eq(lineDocuments.id, id));
    return true;
  }

  async getFinancialNotes(companyId: number, fiscalYear: number): Promise<FinancialNotes | undefined> {
    const [row] = await db.select().from(financialNotes)
      .where(and(eq(financialNotes.companyId, companyId), eq(financialNotes.fiscalYear, fiscalYear)));
    return row;
  }

  async upsertFinancialNotes(companyId: number, fiscalYear: number, sections: any[], status?: string): Promise<FinancialNotes> {
    const existing = await this.getFinancialNotes(companyId, fiscalYear);
    if (existing) {
      const updateData: any = { sections, updatedAt: new Date() };
      if (status) updateData.status = status;
      const [updated] = await db.update(financialNotes).set(updateData)
        .where(eq(financialNotes.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(financialNotes).values({
      companyId, fiscalYear, sections, status: status || "draft",
    }).returning();
    return created;
  }
  async createSubscriptionPaymentOrder(data: InsertSubscriptionPaymentOrder): Promise<SubscriptionPaymentOrder> {
    const [order] = await db.insert(subscriptionPaymentOrders).values(data).returning();
    return order;
  }

  async getSubscriptionPaymentOrder(id: number): Promise<SubscriptionPaymentOrder | undefined> {
    const [order] = await db.select().from(subscriptionPaymentOrders).where(eq(subscriptionPaymentOrders.id, id));
    return order;
  }

  async getSubscriptionPaymentOrdersByTenant(tenantId: number): Promise<SubscriptionPaymentOrder[]> {
    return db.select().from(subscriptionPaymentOrders)
      .where(eq(subscriptionPaymentOrders.tenantId, tenantId))
      .orderBy(desc(subscriptionPaymentOrders.createdAt));
  }

  async getAllSubscriptionPaymentOrders(status?: string): Promise<(SubscriptionPaymentOrder & { plan?: SubscriptionPlan, tenant?: Tenant })[]> {
    let query = db.select().from(subscriptionPaymentOrders).orderBy(desc(subscriptionPaymentOrders.createdAt));
    const orders = status
      ? await db.select().from(subscriptionPaymentOrders).where(eq(subscriptionPaymentOrders.status, status)).orderBy(desc(subscriptionPaymentOrders.createdAt))
      : await query;
    const results = [];
    for (const order of orders) {
      const plan = await this.getSubscriptionPlan(order.planId);
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, order.tenantId));
      results.push({ ...order, plan, tenant });
    }
    return results;
  }

  async updateSubscriptionPaymentOrder(id: number, data: Partial<SubscriptionPaymentOrder>): Promise<SubscriptionPaymentOrder | undefined> {
    const [order] = await db.update(subscriptionPaymentOrders).set(data).where(eq(subscriptionPaymentOrders.id, id)).returning();
    return order;
  }

  async getNextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const prefix = `INV${year}${month}`;
    const [last] = await db.select({ invoiceNumber: subscriptionPaymentOrders.invoiceNumber })
      .from(subscriptionPaymentOrders)
      .where(sql`${subscriptionPaymentOrders.invoiceNumber} LIKE ${prefix + '%'}`)
      .orderBy(desc(subscriptionPaymentOrders.invoiceNumber))
      .limit(1);
    if (last?.invoiceNumber) {
      const seq = parseInt(last.invoiceNumber.substring(prefix.length)) + 1;
      return prefix + seq.toString().padStart(4, '0');
    }
    return prefix + '0001';
  }
}

export const storage = new DatabaseStorage();
