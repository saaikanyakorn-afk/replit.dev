import { Component, type ErrorInfo, type ReactNode, useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import AppExtra from "./app-extra";
import { queryClient, setUpgradeCallback } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CompanyProvider, useCompany } from "@/lib/company-context";
import { DateSettingsProvider } from "@/hooks/use-date-settings";
import { BranchSelectProvider } from "@/contexts/branch-select-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import PageLoader from "@/components/page-loader";

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    const msg = error?.message || "";
    if (msg.includes("dynamically imported module") || msg.includes("Failed to fetch") || msg.includes("ChunkLoadError")) {
      const reloadKey = "chunk-reload-" + window.location.pathname;
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, "1");
        window.location.reload();
      }
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "Sarabun, sans-serif" }}>
          <h2 style={{ color: "#f94d4d", marginBottom: 16 }}>เกิดข้อผิดพลาด</h2>
          <p style={{ color: "#666", marginBottom: 16 }}>{this.state.error?.message}</p>
          <button
            onClick={() => { sessionStorage.clear(); this.setState({ hasError: false }); window.location.reload(); }}
            style={{ padding: "8px 24px", background: "#fb9678", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}
          >
            โหลดใหม่
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
const NotFound = lazy(() => import("@/pages/not-found"));
const LandingPage = lazy(() => import("@/pages/landing"));
const EcommercePricing = lazy(() => import("@/pages/ecommerce-pricing"));
const AccountingPricing = lazy(() => import("@/pages/accounting-pricing"));
const DeliveryPricing = lazy(() => import("@/pages/delivery-pricing"));
const FoodDeliveryPricing = lazy(() => import("@/pages/food-delivery-pricing"));
const RegisterPage = lazy(() => import("@/pages/register"));
const ChoosePlanPage = lazy(() => import("@/pages/choose-plan"));
const PlatformDashboard = lazy(() => import("@/pages/platform/dashboard"));
const PlatformTenants = lazy(() => import("@/pages/platform/tenants"));
const TenantOverview = lazy(() => import("@/pages/platform/tenant-overview"));
const PlatformEmailConfig = lazy(() => import("@/pages/platform/email-config"));
const ChatManagement = lazy(() => import("@/pages/platform/chat-management"));
const PlatformSubscriptions = lazy(() => import("@/pages/platform/subscriptions"));
const PlatformPaymentSettings = lazy(() => import("@/pages/platform/payment-settings"));
const CloneData = lazy(() => import("@/pages/platform/clone-data"));
const Infrastructure = lazy(() => import("@/pages/platform/infrastructure"));
const DatabaseSwitch = lazy(() => import("@/pages/platform/database-switch"));
const GithubManagement = lazy(() => import("@/pages/platform/github-management"));
const PlatformMaintenance = lazy(() => import("@/pages/platform/maintenance"));
const PasswordManagement = lazy(() => import("@/pages/platform/password-management"));
const SysAdminLogin = lazy(() => import("@/pages/platform/sysadmin-login"));
const SysAdminManagement = lazy(() => import("@/pages/platform/sysadmin-management"));
const InfraLocations = lazy(() => import("@/pages/sysadmin/infra-locations"));
const InfraRouters = lazy(() => import("@/pages/sysadmin/infra-routers"));
const InfraDomains = lazy(() => import("@/pages/sysadmin/infra-domains"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Journal = lazy(() => import("@/pages/journal"));
const JournalForm = lazy(() => import("@/pages/journal-form"));
const JournalPrint = lazy(() => import("@/pages/journal-print"));
const Coa = lazy(() => import("@/pages/coa"));
const AccountingMgmt = lazy(() => import("@/pages/accounting-mgmt"));
const VatClosing = lazy(() => import("@/pages/vat-closing"));
const BalanceCarryForward = lazy(() => import("@/pages/accounting-mgmt/balance-carry-forward"));
const TrialBalanceCompare = lazy(() => import("@/pages/accounting-mgmt/trial-balance-compare"));
const TrimData = lazy(() => import("@/pages/accounting-mgmt/trim-data"));
const JournalValidation = lazy(() => import("@/pages/accounting-mgmt/journal-validation"));
const DuplicateDetection = lazy(() => import("@/pages/accounting-mgmt/duplicate-detection"));
const PeriodClosing = lazy(() => import("@/pages/accounting-mgmt/period-closing"));
const CleanZero = lazy(() => import("@/pages/accounting-mgmt/clean-zero"));
const FixDiff = lazy(() => import("@/pages/accounting-mgmt/fix-diff"));
const ChangeAnchor = lazy(() => import("@/pages/accounting-mgmt/change-anchor"));
const GlNoDoc = lazy(() => import("@/pages/accounting-mgmt/gl-no-doc"));
const OrphanJournal = lazy(() => import("@/pages/accounting-mgmt/orphan-journal"));
const RestaurantPosIndex = lazy(() => import("@/pages/restaurant-pos/index"));
const RestaurantOrder = lazy(() => import("@/pages/restaurant-pos/order"));
const KitchenDisplay = lazy(() => import("@/pages/restaurant-pos/kitchen"));
const TableSettings = lazy(() => import("@/pages/restaurant-pos/table-settings"));
const MenuSettingsPage = lazy(() => import("@/pages/restaurant-pos/menu-settings"));
const AccountingConfig = lazy(() => import("@/pages/accounting-config"));
const PettyCash = lazy(() => import("@/pages/petty-cash"));
const DueCalendar = lazy(() => import("@/pages/finance/due-calendar"));
const CashFlowForecast = lazy(() => import("@/pages/finance/cash-flow-forecast"));
const ReceiptBilling = lazy(() => import("@/pages/finance/receipt-billing"));
const BillingNotes = lazy(() => import("@/pages/finance/billing-notes"));
const BillingNotePdf = lazy(() => import("@/pages/finance/billing-note-pdf"));
const APBilling = lazy(() => import("@/pages/finance/ap-billing"));
const FinancePayments = lazy(() => import("@/pages/finance/payments"));
const QuotationList = lazy(() => import("@/pages/sales/quotation-list"));
const SalesPipeline = lazy(() => import("@/pages/sales/pipeline"));
const SalesTaxReport = lazy(() => import("@/pages/sales/tax-report"));
const PurchaseRequest = lazy(() => import("@/pages/purchases/purchase-request"));
const PurchaseRequestList = lazy(() => import("@/pages/purchases/purchase-request-list"));
const BidComparisonList = lazy(() => import("@/pages/purchases/bid-comparison-list"));
const BidComparison = lazy(() => import("@/pages/purchases/bid-comparison"));
const PurchaseOrderList = lazy(() => import("@/pages/purchases/purchase-order-list"));
const PurchaseOrder = lazy(() => import("@/pages/purchases/purchase-order"));
const ExpenseList = lazy(() => import("@/pages/purchases/expense-list"));
const ExpenseEntry = lazy(() => import("@/pages/purchases/expense"));
const ExpenseImport = lazy(() => import("@/pages/purchases/expense-import"));
const PurchaseInvoiceList = lazy(() => import("@/pages/purchases/purchase-invoice-list"));
const PurchaseInvoice = lazy(() => import("@/pages/purchases/purchase-invoice"));
const PurchaseImport = lazy(() => import("@/pages/purchases/purchase-import"));
const PurchasePdfImport = lazy(() => import("@/pages/purchases/purchase-pdf-import"));
const ExpensePdfImport = lazy(() => import("@/pages/purchases/expense-pdf-import"));
const PdfBulkImport = lazy(() => import("@/pages/purchases/pdf-bulk-import"));
const PurchaseTaxReport = lazy(() => import("@/pages/purchases/tax-report"));
const WhtCertList = lazy(() => import("@/pages/purchases/wht-cert-list"));
const WhtCertForm = lazy(() => import("@/pages/purchases/wht-cert-form"));
const WhtCertPrint = lazy(() => import("@/pages/purchases/wht-cert-print"));
const WhtCertShare = lazy(() => import("@/pages/purchases/wht-cert-share"));
const WhtAttachmentPrint = lazy(() => import("@/pages/purchases/wht-attachment-print"));
const DebitNoteList = lazy(() => import("@/pages/purchases/debit-note-list"));
const DebitNoteForm = lazy(() => import("@/pages/purchases/debit-note-form"));
const DepositList = lazy(() => import("@/pages/sales/deposit-list"));
const DepositForm = lazy(() => import("@/pages/sales/deposit-form"));
const PurchaseDepositList = lazy(() => import("@/pages/purchases/purchase-deposit-list"));
const PurchaseDepositForm = lazy(() => import("@/pages/purchases/purchase-deposit-form"));
const InventoryList = lazy(() => import("@/pages/inventory/inventory-list"));
const BomManagement = lazy(() => import("@/pages/inventory/bom-management"));
const BundleManagement = lazy(() => import("@/pages/inventory/bundle-management"));
const PromotionManagement = lazy(() => import("@/pages/inventory/promotion-management"));
const ProductMapping = lazy(() => import("@/pages/inventory/product-mapping"));
const ProductForm = lazy(() => import("@/pages/inventory/product-form"));
const BomFormPage = lazy(() => import("@/pages/inventory/bom-form"));
const BundleFormPage = lazy(() => import("@/pages/inventory/bundle-form"));
const PromotionFormPage = lazy(() => import("@/pages/inventory/promotion-form"));
const MappingFormPage = lazy(() => import("@/pages/inventory/mapping-form"));
const ContactList = lazy(() => import("@/pages/contacts/contact-list"));
const ContactForm = lazy(() => import("@/pages/contacts/contact-form"));
const ContactHistory = lazy(() => import("@/pages/contacts/contact-history"));
const ContactSettings = lazy(() => import("@/pages/contacts/contact-settings"));
const AssetRegistry = lazy(() => import("@/pages/assets/asset-registry"));
const AssetForm = lazy(() => import("@/pages/assets/asset-form"));
const DepreciationPage = lazy(() => import("@/pages/assets/depreciation"));
const AssetSalesReport = lazy(() => import("@/pages/assets/asset-sales-report"));
const AssetExpiredReport = lazy(() => import("@/pages/assets/asset-expired-report"));
const AssetSummary = lazy(() => import("@/pages/assets/asset-summary"));
const AssetAccountingHistory = lazy(() => import("@/pages/assets/asset-accounting-history"));
const InstallmentContracts = lazy(() => import("@/pages/assets/installment-contracts"));
const AssetCategories = lazy(() => import("@/pages/assets/asset-categories"));
const GeneralReports = lazy(() => import("@/pages/reports/general-reports"));
const GeneralLedger = lazy(() => import("@/pages/reports/general-ledger"));
const TrialBalance = lazy(() => import("@/pages/reports/trial-balance"));
const IncomeStatement = lazy(() => import("@/pages/reports/income-statement"));
const BalanceSheet = lazy(() => import("@/pages/reports/balance-sheet"));
const CashFlowStatement = lazy(() => import("@/pages/reports/cash-flow"));
const AccountStatementPage = lazy(() => import("@/pages/reports/account-statement"));
const AccountStatementContactPage = lazy(() => import("@/pages/reports/account-statement-contact"));
const ReconcileAccountTypePage = lazy(() => import("@/pages/reports/reconcile-account-type"));
const WorksheetPage = lazy(() => import("@/pages/reports/worksheet"));
const AccountingLogPage = lazy(() => import("@/pages/reports/accounting-log"));
const PurchaseTaxPendingPage = lazy(() => import("@/pages/reports/purchase-tax-pending"));
const Pnd3Page = lazy(() => import("@/pages/reports/pnd3"));
const Pnd53Page = lazy(() => import("@/pages/reports/pnd53"));
const TaxReconcilePage = lazy(() => import("@/pages/reports/tax-reconcile"));
const VatPp30FromTbPage = lazy(() => import("@/pages/reports/vat-pp30-from-tb"));
const IncomeStatementCompare = lazy(() => import("@/pages/reports/income-statement-compare"));
const BalanceSheetCompare = lazy(() => import("@/pages/reports/balance-sheet-compare"));
const BalanceSheetCompareAmount = lazy(() => import("@/pages/reports/balance-sheet-compare-amount"));
const BalanceSheet12MonthChart = lazy(() => import("@/pages/reports/balance-sheet-12month-chart"));
const IncomeStatementCompareAmount = lazy(() => import("@/pages/reports/income-statement-compare-amount"));
const IncomeStatement12Month = lazy(() => import("@/pages/reports/income-statement-12month"));
const IncomeStatement12MonthChart = lazy(() => import("@/pages/reports/income-statement-12month-chart"));
const IncomeStatementCumulative = lazy(() => import("@/pages/reports/income-statement-cumulative"));
const IncomeStatementMonthYear = lazy(() => import("@/pages/reports/income-statement-month-year"));
const IncomeStatementPct = lazy(() => import("@/pages/reports/income-statement-pct"));
const IncomeStatementQuarterly = lazy(() => import("@/pages/reports/income-statement-quarterly"));
const JournalBookReport = lazy(() => import("@/pages/reports/journal-book-report"));
const FinancialNotes = lazy(() => import("@/pages/reports/financial-notes"));
const FinancialStatementsPackage = lazy(() => import("@/pages/reports/financial-statements-package"));
const SalesReport = lazy(() => import("@/pages/reports/sales-report"));
const BudgetEntry = lazy(() => import("@/pages/reports/budget-entry"));
const BudgetVsActual = lazy(() => import("@/pages/reports/budget-vs-actual"));
const GrossProfitReport = lazy(() => import("@/pages/reports/gross-profit-report"));
const SalesByDocument = lazy(() => import("@/pages/reports/sales-by-document"));
const SalesByDepartment = lazy(() => import("@/pages/reports/sales-by-department"));
const SalesByProject = lazy(() => import("@/pages/reports/sales-by-project"));
const SalesByAccount = lazy(() => import("@/pages/reports/sales-by-account"));
const SalesItemDetails = lazy(() => import("@/pages/reports/sales-item-details"));
const DailySalesSummary = lazy(() => import("@/pages/reports/daily-sales-summary"));
const TopProducts = lazy(() => import("@/pages/reports/top-products"));
const SalesMonthlyComparison = lazy(() => import("@/pages/reports/sales-monthly-comparison"));
const GrossProfitByProduct = lazy(() => import("@/pages/reports/gross-profit-by-product"));
const OpexCapexReport = lazy(() => import("@/pages/reports/opex-capex"));
const GrowthTrendReport = lazy(() => import("@/pages/reports/growth-trend"));
const DepartmentPLReport = lazy(() => import("@/pages/reports/department-pl"));
const BreakEvenReport = lazy(() => import("@/pages/reports/break-even"));
const FinancialManagement = lazy(() => import("@/pages/reports/financial-management"));
const ARAgingReport = lazy(() => import("@/pages/reports/ar-aging"));
const ARAgingInvoicesReport = lazy(() => import("@/pages/reports/ar-aging-invoices"));
const APAgingReport = lazy(() => import("@/pages/reports/ap-aging"));
const FinancialRatiosDashboard = lazy(() => import("@/pages/reports/financial-ratios"));
const VatPP30Report = lazy(() => import("@/pages/reports/vat-pp30"));
const FirmManagement = lazy(() => import("@/pages/firm-mgmt/dashboard"));
const HRMDashboard = lazy(() => import("@/pages/hr/hrm-dashboard"));
const HRAttendance = lazy(() => import("@/pages/hr/attendance"));
const AttendanceReport = lazy(() => import("@/pages/hr/attendance-report"));
const EmployeeList = lazy(() => import("@/pages/hr/employee-list"));
const LeaveManagement = lazy(() => import("@/pages/hr/leave-management"));
const LeavePolicySettings = lazy(() => import("@/pages/hr/leave-policy-settings"));
const PayslipPage = lazy(() => import("@/pages/hr/payslip"));
const Certificates = lazy(() => import("@/pages/hr/certificates"));
const HolidaysPage = lazy(() => import("@/pages/hr/holidays"));
const WorkSchedulePage = lazy(() => import("@/pages/hr/work-schedule"));
const ShiftSettingsPage = lazy(() => import("@/pages/hr/shift-settings"));
const ShiftSchedulePage = lazy(() => import("@/pages/hr/shift-schedule"));
const OTManagement = lazy(() => import("@/pages/hr/ot-management"));
const ScannerMapping = lazy(() => import("@/pages/hr/scanner-mapping"));
const ScannerImport = lazy(() => import("@/pages/hr/scanner-import"));
const PayrollTax = lazy(() => import("@/pages/hr/payroll-tax"));
const WhtImport = lazy(() => import("@/pages/hr/wht-import"));
const FinancialStatementsGenerator = lazy(() => import("@/pages/tax-tools/financial-statements-generator"));
const GovReceiptDownloader = lazy(() => import("@/pages/tools/gov-receipt-downloader"));
const Performance = lazy(() => import("@/pages/hr/performance"));
const CommissionRules = lazy(() => import("@/pages/hr/commission-rules"));
const CommissionRecords = lazy(() => import("@/pages/hr/commission"));
const EssDashboard = lazy(() => import("@/pages/ess/ess-dashboard"));
const TaskBoardPage = lazy(() => import("@/pages/office/task-board"));
const WorkBoardPage = lazy(() => import("@/pages/office/work-board"));
const ClientForm = lazy(() => import("@/pages/firm-mgmt/client-form"));
const ContractsPage = lazy(() => import("@/pages/firm-mgmt/contracts"));
const FirmBilling = lazy(() => import("@/pages/firm-mgmt/billing"));
const FirmDocuments = lazy(() => import("@/pages/firm-mgmt/documents"));
const FirmAssignments = lazy(() => import("@/pages/firm-mgmt/assignments"));
const LineDocumentArchive = lazy(() => import("@/pages/line-document-archive"));
const EtaxHubDashboard = lazy(() => import("@/pages/etax-hub/dashboard"));
const EtaxHubClientBoard = lazy(() => import("@/pages/etax-hub/client-board"));
const EtaxHubMyCalendar = lazy(() => import("@/pages/etax-hub/my-calendar"));
const EfilingDashboard = lazy(() => import("@/pages/etax-hub/efiling/dashboard"));
const EfilingSubmit = lazy(() => import("@/pages/etax-hub/efiling/submit"));
const EfilingReceipts = lazy(() => import("@/pages/etax-hub/efiling/receipts"));
const EfilingSettings = lazy(() => import("@/pages/etax-hub/efiling/settings"));
const TaxReminderSettings = lazy(() => import("@/pages/tax-reminder-settings"));
const SharedBoardPage = lazy(() => import("@/pages/etax-hub/shared-board"));
const ExternalRegisterPage = lazy(() => import("@/pages/etax-hub/external-register"));
const ExternalBoardPage = lazy(() => import("@/pages/etax-hub/external-board"));
const ContractSignPage = lazy(() => import("@/pages/contract-sign"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy-policy"));
const TermsOfService = lazy(() => import("@/pages/terms-of-service"));
const About = lazy(() => import("@/pages/about"));
const Contact = lazy(() => import("@/pages/contact"));
const FeaturesPage = lazy(() => import("@/pages/features"));
const PricingPage = lazy(() => import("@/pages/pricing"));
const UserGuide = lazy(() => import("@/pages/user-guide"));
const Login = lazy(() => import("@/pages/login"));
const UserManagement = lazy(() => import("@/pages/settings/user-management"));
const AccountingFormulas = lazy(() => import("@/pages/accounting-formulas"));
const DocumentTemplates = lazy(() => import("@/pages/settings/document-templates"));
const UserProfile = lazy(() => import("@/pages/settings/user-profile"));
const FirmLinkPage = lazy(() => import("@/pages/settings/firm-link"));
const ModuleSelectPage = lazy(() => import("@/pages/module-select"));
const CompanyInfo = lazy(() => import("@/pages/settings/company-info"));
const PaymentMethodSettings = lazy(() => import("@/pages/settings/payment-methods"));
const MySubscription = lazy(() => import("@/pages/settings/my-subscription"));
const ModulePricing = lazy(() => import("@/pages/settings/module-pricing"));
const UpgradePlan = lazy(() => import("@/pages/settings/upgrade"));
const WhiteLabelSettings = lazy(() => import("@/pages/settings/white-label"));
const LandingCmsPage = lazy(() => import("@/pages/settings/landing-cms"));
const FtpArchiveSettings = lazy(() => import("@/pages/settings/ftp-archive"));
const EtaxSettings = lazy(() => import("@/pages/settings/etax-settings"));
const CustomFormTemplates = lazy(() => import("@/pages/settings/custom-form-templates"));
const LineSettings = lazy(() => import("@/pages/settings/line-settings"));
const GeneralSettings = lazy(() => import("@/pages/settings/general-settings"));
const InventoryTriggers = lazy(() => import("@/pages/settings/inventory-triggers"));
const DeptBranchSettings = lazy(() => import("@/pages/settings/dept-branch"));
const ExchangeRateSettings = lazy(() => import("@/pages/settings/exchange-rate-settings"));
const DashboardAnalytical = lazy(() => import("@/pages/dashboard-analytical"));
const SalesOrderList = lazy(() => import("@/pages/sales/sales-order-list"));
const SalesOrderForm = lazy(() => import("@/pages/sales/sales-order-form"));
const QuotationForm = lazy(() => import("@/pages/sales/quotation-form"));
const QuotationPdf = lazy(() => import("@/pages/sales/quotation-pdf"));
const QuotationShare = lazy(() => import("@/pages/sales/quotation-share"));
const SalesOrderPdf = lazy(() => import("@/pages/sales/sales-order-pdf"));
const SalesOrderShare = lazy(() => import("@/pages/sales/sales-order-share"));
const InvoicePdf = lazy(() => import("@/pages/sales/invoice-pdf"));
const InvoiceShare = lazy(() => import("@/pages/sales/invoice-share"));
const TaxInvoicePdf = lazy(() => import("@/pages/sales/tax-invoice-pdf"));
const TaxInvoiceBatchPrint = lazy(() => import("@/pages/sales/tax-invoice-batch-print"));
const TaxInvoiceShare = lazy(() => import("@/pages/sales/tax-invoice-share"));
const ReceiptPdf = lazy(() => import("@/pages/sales/receipt-pdf"));
const ReceiptShare = lazy(() => import("@/pages/sales/receipt-share"));
const InvoiceList = lazy(() => import("@/pages/sales/invoice-list"));
const InvoiceForm = lazy(() => import("@/pages/sales/invoice-form"));
const InvoiceImport = lazy(() => import("@/pages/sales/invoice-import"));
const TaxInvoiceList = lazy(() => import("@/pages/sales/tax-invoice-list"));
const TaxInvoiceForm = lazy(() => import("@/pages/sales/tax-invoice-form"));
const EtaxSentList = lazy(() => import("@/pages/sales/etax-sent-list"));
const ReceiptList = lazy(() => import("@/pages/sales/receipt-list"));
const ReceiptForm = lazy(() => import("@/pages/sales/receipt-form"));
const CreditNoteList = lazy(() => import("@/pages/sales/credit-note-list"));
const SalesCommission = lazy(() => import("@/pages/sales/sales-commission"));
const CreditNoteForm = lazy(() => import("@/pages/sales/credit-note-form"));
const WarehousePage = lazy(() => import("@/pages/inventory/warehouse"));
const StockCardPage = lazy(() => import("@/pages/inventory/stock-card"));
const StockTransferPage = lazy(() => import("@/pages/inventory/stock-transfer"));
const GoodsReceivingList = lazy(() => import("@/pages/inventory/goods-receiving-list"));
const GoodsReceivingForm = lazy(() => import("@/pages/inventory/goods-receiving-form"));
const ProductLotsPage = lazy(() => import("@/pages/inventory/product-lots"));
const ManufacturingList = lazy(() => import("@/pages/inventory/manufacturing-list"));
const ManufacturingForm = lazy(() => import("@/pages/inventory/manufacturing-form"));
const MfgDashboard = lazy(() => import("@/pages/manufacturing/dashboard"));
const MfgBom = lazy(() => import("@/pages/manufacturing/bom"));
const MfgOrders = lazy(() => import("@/pages/manufacturing/orders"));
const MfgSerialNumbers = lazy(() => import("@/pages/manufacturing/serial-numbers"));
const MfgTraceability = lazy(() => import("@/pages/manufacturing/traceability"));
const MfgCalibration = lazy(() => import("@/pages/manufacturing/calibration"));
const GoodsRequisitionList = lazy(() => import("@/pages/inventory/goods-requisition-list"));
const GoodsRequisitionForm = lazy(() => import("@/pages/inventory/goods-requisition-form"));
const InventoryValuation = lazy(() => import("@/pages/inventory/inventory-valuation"));
const MovementSummary = lazy(() => import("@/pages/inventory/movement-summary"));
const SlowMoving = lazy(() => import("@/pages/inventory/slow-moving"));
const BarcodeLabels = lazy(() => import("@/pages/inventory/barcode-labels"));
const ProductImportExport = lazy(() => import("@/pages/inventory/product-import-export"));
const EcommerceHub = lazy(() => import("@/pages/ecommerce/ecommerce-hub"));
const EcommerceDashboard = lazy(() => import("@/pages/ecommerce/ecommerce-dashboard"));
const EcommerceConnections = lazy(() => import("@/pages/ecommerce/ecommerce-connections"));
const OrderImport = lazy(() => import("@/pages/ecommerce/order-import"));
const GrabFoodConnect = lazy(() => import("@/pages/ecommerce/grab-food-connect"));
const EcommerceDocuments = lazy(() => import("@/pages/ecommerce/ecommerce-documents"));
const EcommerceQuickInvoice = lazy(() => import("@/pages/ecommerce/ecommerce-quick-invoice"));
const EcommerceOrders = lazy(() => import("@/pages/ecommerce/ecommerce-orders"));
const EcommerceInventory = lazy(() => import("@/pages/ecommerce/ecommerce-inventory"));
const EcommerceInventoryBom = lazy(() => import("@/pages/ecommerce/ecommerce-inventory-bom"));
const EcommerceInventoryManufacturing = lazy(() => import("@/pages/ecommerce/ecommerce-inventory-manufacturing"));
const EcommerceInventoryBundles = lazy(() => import("@/pages/ecommerce/ecommerce-inventory-bundles"));
const EcommerceInventoryPromotions = lazy(() => import("@/pages/ecommerce/ecommerce-inventory-promotions"));
const EcommerceInventoryWarehouse = lazy(() => import("@/pages/ecommerce/ecommerce-inventory-warehouse"));
const EcommerceInventoryStockCard = lazy(() => import("@/pages/ecommerce/ecommerce-inventory-stock-card"));
const EcommerceInventoryValuation = lazy(() => import("@/pages/ecommerce/ecommerce-inventory-valuation"));
const EcommerceInventoryMovement = lazy(() => import("@/pages/ecommerce/ecommerce-inventory-movement"));
const EcommerceInventorySlowMoving = lazy(() => import("@/pages/ecommerce/ecommerce-inventory-slow-moving"));
const EcommerceStockSync = lazy(() => import("@/pages/ecommerce/ecommerce-stock-sync"));
const SkuSmartMapping = lazy(() => import("@/pages/ecommerce/sku-smart-mapping"));
const EcommerceSettings = lazy(() => import("@/pages/ecommerce/ecommerce-settings"));
const EcomTeam = lazy(() => import("@/pages/ecommerce/ecom-team"));
const PriceCalculator = lazy(() => import("@/pages/ecommerce/price-calculator"));
const BusinessInsights = lazy(() => import("@/pages/ecommerce/business-insights"));
const EcommerceSettlements = lazy(() => import("@/pages/ecommerce/ecommerce-settlements"));
const SettlementImport = lazy(() => import("@/pages/ecommerce/settlement-import"));
const WithdrawalImport = lazy(() => import("@/pages/ecommerce/withdrawal-import"));
const EcommerceReturns = lazy(() => import("@/pages/ecommerce/ecommerce-returns"));
const EcommerceReturnsReport = lazy(() => import("@/pages/ecommerce/ecommerce-returns-report"));
const EcommerceReturnsScan = lazy(() => import("@/pages/ecommerce/ecommerce-returns-scan"));
const EcommerceReturnsQC = lazy(() => import("@/pages/ecommerce/ecommerce-returns-qc"));
const EcommerceAnalytics = lazy(() => import("@/pages/ecommerce/ecommerce-analytics"));
const EcommerceWarehouses = lazy(() => import("@/pages/ecommerce/ecommerce-warehouses"));
const EcommerceFulfillment = lazy(() => import("@/pages/ecommerce/ecommerce-fulfillment"));
const EcommerceShippingLabels = lazy(() => import("@/pages/ecommerce/ecommerce-shipping-labels"));
const EcommercePackingCameras = lazy(() => import("@/pages/ecommerce/ecommerce-packing-cameras"));
const EcommerceAiAnalytics = lazy(() => import("@/pages/ecommerce/ecommerce-ai-analytics"));
const EcommerceSupplierPortal = lazy(() => import("@/pages/ecommerce/ecommerce-supplier-portal"));
const ClientUploadPage = lazy(() => import("@/pages/client-upload"));
const EcommercePdaMobile = lazy(() => import("@/pages/ecommerce/ecommerce-pda-mobile"));
const EcommerceBinLocations = lazy(() => import("@/pages/ecommerce/ecommerce-bin-locations"));
const EcommercePackingStation = lazy(() => import("@/pages/ecommerce/ecommerce-packing-station"));
const EcommercePackingRecordings = lazy(() => import("@/pages/ecommerce/ecommerce-packing-recordings"));
const EcommerceWavePicking = lazy(() => import("@/pages/ecommerce/ecommerce-wave-picking"));
const DeliveryDashboard = lazy(() => import("@/pages/delivery/delivery-dashboard"));
const DeliveryFulfillment = lazy(() => import("@/pages/delivery/delivery-fulfillment"));
const DeliveryShippingLabels = lazy(() => import("@/pages/delivery/delivery-shipping-labels"));
const DeliveryTracking = lazy(() => import("@/pages/delivery/delivery-tracking"));
const DeliveryLineNotify = lazy(() => import("@/pages/delivery/delivery-line-notify"));
const DeliveryNotesPage = lazy(() => import("@/pages/delivery/delivery-notes"));
const DeliveryNoteFormPage = lazy(() => import("@/pages/delivery/delivery-note-form"));
const DeliveryHub = lazy(() => import("@/pages/delivery-hub"));
const DeliverySignPublicPage = lazy(() => import("@/pages/delivery/delivery-sign-public"));
const DeliveryShipments = lazy(() => import("@/pages/delivery/delivery-shipments"));
const DeliveryScan = lazy(() => import("@/pages/delivery/delivery-scan"));
const DeliverySettings = lazy(() => import("@/pages/delivery/delivery-settings"));
const FoodDashboard = lazy(() => import("@/pages/food-delivery/food-dashboard"));
const FoodOrders = lazy(() => import("@/pages/food-delivery/food-orders"));
const FoodMenu = lazy(() => import("@/pages/food-delivery/food-menu"));
const FoodConnections = lazy(() => import("@/pages/food-delivery/food-connections"));
const FoodStores = lazy(() => import("@/pages/food-delivery/food-stores"));
const FoodAnalytics = lazy(() => import("@/pages/food-delivery/food-analytics"));
const FoodHistory = lazy(() => import("@/pages/food-delivery/food-history"));
const FoodSettings = lazy(() => import("@/pages/food-delivery/food-settings"));
const FoodImport = lazy(() => import("@/pages/food-delivery/food-import"));
const FoodAccounting = lazy(() => import("@/pages/food-delivery/food-accounting"));
const EcommerceAutoSync = lazy(() => import("@/pages/ecommerce/ecommerce-auto-sync"));
const PlatformCredentials = lazy(() => import("@/pages/ecommerce/platform-credentials"));
const EcommerceChatInbox = lazy(() => import("@/pages/ecommerce/ecommerce-chat-inbox"));
const EcommerceChatAutoReply = lazy(() => import("@/pages/ecommerce/ecommerce-chat-auto-reply"));
const EcommerceChatKeywords = lazy(() => import("@/pages/ecommerce/ecommerce-chat-keywords"));
const EcommerceApiConnect = lazy(() => import("@/pages/ecommerce/ecommerce-api-connect"));
const EcommerceFacebookOrders = lazy(() => import("@/pages/ecommerce/ecommerce-facebook-orders"));
const EcommerceStockAlerts = lazy(() => import("@/pages/ecommerce/ecommerce-stock-alerts"));
const EcommerceReconciliation = lazy(() => import("@/pages/ecommerce/ecommerce-reconciliation"));
const EcommerceStoreClone = lazy(() => import("@/pages/ecommerce/ecommerce-store-clone"));
const LiveSellingHub = lazy(() => import("@/pages/live-selling/live-selling-hub"));
const LiveSellingDashboard = lazy(() => import("@/pages/live-selling/live-selling-dashboard"));
const LiveSellingLuckyDraw = lazy(() => import("@/pages/live-selling/live-selling-lucky-draw"));
const EcommerceLiveCommission = lazy(() => import("@/pages/ecommerce/ecommerce-live-commission"));
const AgencyDashboard = lazy(() => import("@/pages/live-agency/agency-dashboard"));
const LiveMonitor = lazy(() => import("@/pages/live-agency/live-monitor"));
const PostLiveReport = lazy(() => import("@/pages/live-agency/post-live-report"));
const LivePlanning = lazy(() => import("@/pages/live-agency/live-planning"));
const PosTerminal = lazy(() => import("@/pages/pos/pos-terminal"));
const PosSessions = lazy(() => import("@/pages/pos/pos-sessions"));
const PosBranches = lazy(() => import("@/pages/pos/pos-branches"));
const PosDashboard = lazy(() => import("@/pages/pos/pos-dashboard"));
const PosReceipt = lazy(() => import("@/pages/pos/pos-receipt"));
const PosSalesList = lazy(() => import("@/pages/pos/pos-sales-list"));
const PosInvoice = lazy(() => import("@/pages/pos/pos-invoice"));
const LoyaltyManagement = lazy(() => import("@/pages/pos/loyalty-management"));
const LoyaltySignup = lazy(() => import("@/pages/pos/loyalty-signup"));
const PosHubDashboard = lazy(() => import("@/pages/pos/pos-hub-dashboard"));
const PosHubSalesByBranch = lazy(() => import("@/pages/pos/pos-hub-sales-by-branch"));
const PosHubSalesByProduct = lazy(() => import("@/pages/pos/pos-hub-sales-by-product"));
const PosHubSalesByCategory = lazy(() => import("@/pages/pos/pos-hub-sales-by-category"));
const PosHubBestSellers = lazy(() => import("@/pages/pos/pos-hub-best-sellers"));
const PosHubPaymentAnalysis = lazy(() => import("@/pages/pos/pos-hub-payment-analysis"));
const PosHubCashierPerformance = lazy(() => import("@/pages/pos/pos-hub-cashier-performance"));
const PosHubHourlyTrends = lazy(() => import("@/pages/pos/pos-hub-hourly-trends"));
const PosHubDailySummary = lazy(() => import("@/pages/pos/pos-hub-daily-summary"));
const PosProducts = lazy(() => import("@/pages/pos/pos-products"));
const PosProductForm = lazy(() => import("@/pages/pos/pos-product-form"));
const PosBundles = lazy(() => import("@/pages/pos/pos-bundles"));
const PosBundleForm = lazy(() => import("@/pages/pos/pos-bundle-form"));
const PosStock = lazy(() => import("@/pages/pos/pos-stock"));
const PosStockCard = lazy(() => import("@/pages/pos/pos-stock-card"));
const PosStockTransfer = lazy(() => import("@/pages/pos/pos-stock-transfer"));
const PosTaxInvoices = lazy(() => import("@/pages/pos/pos-tax-invoices"));
const PosSettings = lazy(() => import("@/pages/pos/pos-settings"));
const PosStaff = lazy(() => import("@/pages/pos/pos-staff"));
const PosCommission = lazy(() => import("@/pages/pos/pos-commission"));
const PosRequisition = lazy(() => import("@/pages/pos/pos-requisition"));
const PosRequisitionForm = lazy(() => import("@/pages/pos/pos-requisition-form"));
const PosGoodsReceiving = lazy(() => import("@/pages/pos/pos-goods-receiving"));
const PosGoodsReceivingForm = lazy(() => import("@/pages/pos/pos-goods-receiving-form"));
const PosPromotions = lazy(() => import("@/pages/pos/pos-promotions"));
const PosPromotionForm = lazy(() => import("@/pages/pos/pos-promotion-form"));
const PosDeliveryNotes = lazy(() => import("@/pages/pos/pos-delivery-notes"));
const PosBarcodeLabels = lazy(() => import("@/pages/pos/pos-barcode-labels"));
const PosValuation = lazy(() => import("@/pages/pos/pos-valuation"));
const PosMovementSummary = lazy(() => import("@/pages/pos/pos-movement-summary"));
const PosSlowMoving = lazy(() => import("@/pages/pos/pos-slow-moving"));
const PosDeliveryNoteForm = lazy(() => import("@/pages/pos/pos-delivery-note-form"));
const JobCostingProjectList = lazy(() => import("@/pages/job-costing/project-list"));
const JobCostingProjectDetail = lazy(() => import("@/pages/job-costing/project-detail"));
const GasFuelSetup = lazy(() => import("@/pages/gas-station/fuel-setup"));
const GasStationDashboard = lazy(() => import("@/pages/gas-station/dashboard"));
const GasStationIntegration = lazy(() => import("@/pages/gas-station/integration"));
const GasDailySales = lazy(() => import("@/pages/gas-station/daily-sales"));
const GasFuelStock = lazy(() => import("@/pages/gas-station/fuel-stock"));
const GasOilLossGain = lazy(() => import("@/pages/gas-station/oil-loss-gain"));
const GasLocalTax = lazy(() => import("@/pages/gas-station/local-tax"));
const GasReports = lazy(() => import("@/pages/gas-station/reports"));
const PdfStressTest = lazy(() => import("./pages/dev/pdf-stress-test"));
const ActivityLog = lazy(() => import("./pages/activity-log"));
const SystemInfo = lazy(() => import("./pages/system-info"));
const ApprovalCenter = lazy(() => import("./pages/approval-center"));
const ApprovalSettingsPage = lazy(() => import("./pages/settings/approval-settings"));
const ApproveByTokenPage = lazy(() => import("./pages/approve-by-token"));
const BankReconciliation = lazy(() => import("./pages/reports/bank-reconciliation"));
const CustomerList = lazy(() => import("./pages/crm/customer-list"));
const CustomerDetail = lazy(() => import("./pages/crm/customer-detail"));
const AdTracking = lazy(() => import("./pages/ads/ad-tracking"));
const CIExecutive = lazy(() => import("./pages/commerce-intelligence/ci-executive"));
const CIChannel = lazy(() => import("./pages/commerce-intelligence/ci-channel"));
const CIProduct = lazy(() => import("./pages/commerce-intelligence/ci-product"));
const CICampaign = lazy(() => import("./pages/commerce-intelligence/ci-campaign"));
const CILive = lazy(() => import("./pages/commerce-intelligence/ci-live"));
const CIAlerts = lazy(() => import("./pages/commerce-intelligence/ci-alerts"));
const InternalChat = lazy(() => import("./pages/office/internal-chat"));
const MeetingsPage = lazy(() => import("./pages/office/meetings"));
const FullCalendar = lazy(() => import("./pages/office/full-calendar"));
const MobileExecutiveDashboard = lazy(() => import("./pages/mobile/executive-dashboard"));
const MobileExpenseSnap = lazy(() => import("./pages/mobile/expense-snap"));
const LegacyLoginPage = lazy(() => import("./pages/legacy-import/login"));
const LegacyImportPage = lazy(() => import("./pages/legacy-import/index"));
const LegacyImportDbPage = lazy(() => import("./pages/legacy-import/import-db"));
const LegacyViewerPage = lazy(() => import("./pages/legacy-import/viewer"));
const LegacyCompanyManagerPage = lazy(() => import("./pages/legacy-import/company-manager"));
const LegacyChartOfAccountsPage = lazy(() => import("./pages/legacy-import/chart-of-accounts"));
const LegacyContactsPage = lazy(() => import("./pages/legacy-import/contacts"));
const LegacyDocumentsPage = lazy(() => import("./pages/legacy-import/documents"));
const LegacyGlJournalPage = lazy(() => import("./pages/legacy-import/gl-journal"));
const LegacyReportsPage = lazy(() => import("./pages/legacy-import/reports"));
import ChatWidget from "@/components/chat-widget";
import InternalChatWidget from "@/components/internal-chat-widget";
function DashboardRedirect() {
  const { isAccountingFirm } = useCompany();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (user && (user as any).role === "super_admin") {
      navigate("/platform", { replace: true });
    } else if (user && ((user as any).role === "employee" || (user as any).role === "cashier")) {
      navigate("/module-select", { replace: true });
    } else {
      navigate(isAccountingFirm ? "/dashboard/analytical" : "/dashboard/ecommerce", { replace: true });
    }
  }, [isAccountingFirm, user, navigate]);
  return null;
}

function ModuleSelectRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => { navigate("/module-select", { replace: true }); }, [navigate]);
  return null;
}

function ExternalUserGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if ((user as any)?.role === "client_external") return null;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!loading) {
      if (user && (user as any).role === "client_external") {
        navigate("/etax-hub/board", { replace: true });
      } else if (user && (user as any).role === "super_admin") {
        navigate("/platform", { replace: true });
      } else if (user && ((user as any).role === "employee" || (user as any).role === "cashier")) {
        navigate("/module-select", { replace: true });
      } else {
        navigate(user ? "/dashboard" : "/landing", { replace: true });
      }
    }
  }, [user, loading, navigate]);
  if (loading) return <PageLoader />;
  return null;
}

function TrialGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const publicPaths = ["/landing", "/login", "/register", "/choose-plan", "/module-select", "/privacy-policy", "/terms-of-service", "/about", "/contact", "/user-guide", "/features", "/pricing", "/ecommerce-pricing", "/accounting-pricing", "/delivery-pricing", "/food-delivery-pricing", "/sign/", "/supplier-portal", "/share/", "/shared/", "/upload/", "/external-register", "/external-board", "/delivery-sign/", "/loyalty/signup"];
  const isPublic = publicPaths.some(p => location.startsWith(p));

  useEffect(() => {
    if (!loading && user && (user as any).role === "client_external") {
      if (!location.startsWith("/etax-hub/") && !location.startsWith("/login") && !location.startsWith("/shared/") && !location.startsWith("/external-")) {
        setLocation("/etax-hub/board");
      }
      return;
    }
    const ADMIN_ROLES = ["super_admin", "admin", "manager"];
    if (!loading && user && !isPublic && user.subscription?.trialExpired && !ADMIN_ROLES.includes(user.role)) {
      setLocation("/choose-plan");
    }
  }, [loading, user, location, isPublic]);

  return <>{children}</>;
}

const RecoveryPage = lazy(() => import("@/pages/recovery"));

function Router() {
  const [location] = useLocation();
  if (location.startsWith("/recovery")) {
    return (
      <Suspense fallback={<PageLoader />}>
        <RecoveryPage />
      </Suspense>
    );
  }
  if (location.startsWith("/loyalty/signup")) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LoyaltySignup />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
    <TrialGuard>
    <AppExtra />
    <Switch>
      <Route path="/landing" component={LandingPage} />
      <Route path="/features" component={FeaturesPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/user-guide" component={UserGuide} />
      <Route path="/ecommerce-pricing" component={EcommercePricing} />
      <Route path="/accounting-pricing" component={AccountingPricing} />
      <Route path="/delivery-pricing" component={DeliveryPricing} />
      <Route path="/food-delivery-pricing" component={FoodDeliveryPricing} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/choose-plan" component={ChoosePlanPage} />
      <Route path="/dashboard/analytical" component={DashboardAnalytical} />
      <Route path="/dashboard/ecommerce" component={Dashboard} />
      <Route path="/login" component={Login} />
      <Route path="/platform" component={PlatformDashboard} />
      <Route path="/platform/email-config" component={PlatformEmailConfig} />
      <Route path="/platform/tenants" component={PlatformTenants} />
      <Route path="/platform/tenant-overview" component={TenantOverview} />
      <Route path="/platform/subscriptions" component={PlatformSubscriptions} />
      <Route path="/platform/payment-settings" component={PlatformPaymentSettings} />
      <Route path="/platform/chat" component={ChatManagement} />
      <Route path="/platform/infrastructure" component={Infrastructure} />
      <Route path="/platform/all-servers" component={Infrastructure} />
      <Route path="/platform/db-switch" component={DatabaseSwitch} />
      <Route path="/platform/clone-data" component={CloneData} />
      <Route path="/platform/maintenance" component={PlatformMaintenance} />
      <Route path="/dev/pdf-stress-test" component={PdfStressTest} />
      <Route path="/platform/passwords" component={PasswordManagement} />
      <Route path="/platform/github" component={GithubManagement} />
      <Route path="/sys-k7x9" component={SysAdminLogin} />
      <Route path="/sys-k7x9/users" component={SysAdminManagement} />
      <Route path="/sys-k7x9/infrastructure" component={Infrastructure} />
      <Route path="/sys-k7x9/db-switch" component={DatabaseSwitch} />
      <Route path="/sys-k7x9/clone-data" component={CloneData} />
      <Route path="/sys-k7x9/maintenance" component={PlatformMaintenance} />
      <Route path="/sys-k7x9/github" component={GithubManagement} />
      <Route path="/sys-k7x9/infra/locations" component={InfraLocations} />
      <Route path="/sys-k7x9/infra/routers" component={InfraRouters} />
      <Route path="/sys-k7x9/infra/domains" component={InfraDomains} />
      <Route path="/journal" component={Journal} />
      <Route path="/journal/new" component={JournalForm} />
      <Route path="/journal/edit/:id" component={JournalForm} />
      <Route path="/journal/print/:id" component={JournalPrint} />
      <Route path="/coa" component={Coa} />
      <Route path="/accounting-mgmt" component={AccountingMgmt} />
      <Route path="/accounting-mgmt/vat-closing" component={VatClosing} />
      <Route path="/accounting-mgmt/balance-carry-forward" component={BalanceCarryForward} />
      <Route path="/accounting-mgmt/trial-balance-compare" component={TrialBalanceCompare} />
      <Route path="/accounting-mgmt/trim-data" component={TrimData} />
      <Route path="/accounting-mgmt/journal-validation" component={JournalValidation} />
      <Route path="/accounting-mgmt/duplicate-detection" component={DuplicateDetection} />
      <Route path="/accounting-mgmt/period-closing" component={PeriodClosing} />
      <Route path="/accounting-mgmt/clean-zero" component={CleanZero} />
      <Route path="/accounting-mgmt/fix-diff" component={FixDiff} />
      <Route path="/accounting-mgmt/change-anchor" component={ChangeAnchor} />
      <Route path="/accounting-mgmt/gl-no-doc" component={GlNoDoc} />
      <Route path="/accounting-mgmt/orphan-journal" component={OrphanJournal} />
      <Route path="/restaurant-pos" component={RestaurantPosIndex} />
      <Route path="/restaurant-pos/order/:id" component={RestaurantOrder} />
      <Route path="/restaurant-pos/kitchen" component={KitchenDisplay} />
      <Route path="/restaurant-pos/table-settings" component={TableSettings} />
      <Route path="/restaurant-pos/menu-settings" component={MenuSettingsPage} />
      <Route path="/accounting-config" component={AccountingConfig} />
      <Route path="/petty-cash" component={PettyCash} />
      <Route path="/finance/due-calendar" component={DueCalendar} />
      <Route path="/finance/cash-flow-forecast" component={CashFlowForecast} />
      <Route path="/finance/receipt-billing" component={ReceiptBilling} />
      <Route path="/finance/billing-notes" component={BillingNotes} />
      <Route path="/finance/billing-notes/pdf/:id" component={BillingNotePdf} />
      <Route path="/finance/ap-billing" component={APBilling} />
      <Route path="/finance/payments" component={FinancePayments} />
      <Route path="/sales/pipeline" component={SalesPipeline} />
      <Route path="/sales/quote" component={QuotationList} />
      <Route path="/sales/quote/new" component={QuotationForm} />
      <Route path="/sales/quote/edit/:id" component={QuotationForm} />
      <Route path="/sales/quote/pdf/:id" component={QuotationPdf} />
      <Route path="/share/quote/:token" component={QuotationShare} />
      <Route path="/sales/order" component={SalesOrderList} />
      <Route path="/sales/order/new" component={SalesOrderForm} />
      <Route path="/sales/order/edit/:id" component={SalesOrderForm} />
      <Route path="/sales/order/pdf/:id" component={SalesOrderPdf} />
      <Route path="/share/order/:token" component={SalesOrderShare} />
      <Route path="/sales/invoice" component={InvoiceList} />
      <Route path="/sales/invoice/new" component={InvoiceForm} />
      <Route path="/sales/invoice/edit/:id" component={InvoiceForm} />
      <Route path="/sales/invoice/import" component={InvoiceImport} />
      <Route path="/sales/invoice/pdf/:id" component={InvoicePdf} />
      <Route path="/share/invoice/:token" component={InvoiceShare} />
      <Route path="/sales/tax-invoice" component={TaxInvoiceList} />
      <Route path="/sales/tax-invoice/new" component={TaxInvoiceForm} />
      <Route path="/sales/tax-invoice/edit/:id" component={TaxInvoiceForm} />
      <Route path="/sales/tax-invoice/pdf/:id" component={TaxInvoicePdf} />
      <Route path="/sales/tax-invoice/batch-print" component={TaxInvoiceBatchPrint} />
      <Route path="/share/tax-invoice/:token" component={TaxInvoiceShare} />
      <Route path="/sales/etax-sent" component={EtaxSentList} />
      <Route path="/sales/receipt" component={ReceiptList} />
      <Route path="/sales/receipt/new" component={ReceiptForm} />
      <Route path="/sales/receipt/edit/:id" component={ReceiptForm} />
      <Route path="/sales/receipt/pdf/:id" component={ReceiptPdf} />
      <Route path="/share/receipt/:token" component={ReceiptShare} />
      <Route path="/sales/credit-note" component={CreditNoteList} />
      <Route path="/sales/commission" component={SalesCommission} />
      <Route path="/sales/credit-note/new" component={CreditNoteForm} />
      <Route path="/sales/credit-note/edit/:id" component={CreditNoteForm} />
      <Route path="/sales/deposit" component={DepositList} />
      <Route path="/sales/deposit/new" component={DepositForm} />
      <Route path="/sales/deposit/edit/:id" component={DepositForm} />
      <Route path="/sales/tax-report" component={SalesTaxReport} />
      <Route path="/purchases/pr" component={PurchaseRequestList} />
      <Route path="/purchases/pr/new" component={PurchaseRequest} />
      <Route path="/purchases/pr/edit/:id" component={PurchaseRequest} />
      <Route path="/purchases/bid" component={BidComparisonList} />
      <Route path="/purchases/bid/new" component={BidComparison} />
      <Route path="/purchases/bid/edit/:id" component={BidComparison} />
      <Route path="/purchases/po" component={PurchaseOrderList} />
      <Route path="/purchases/po/new" component={PurchaseOrder} />
      <Route path="/purchases/po/edit/:id" component={PurchaseOrder} />
      <Route path="/purchases/invoice" component={PurchaseInvoiceList} />
      <Route path="/purchases/ap/new" component={PurchaseInvoice} />
      <Route path="/purchases/ap/edit/:id" component={PurchaseInvoice} />
      <Route path="/purchases/ap/import" component={PurchaseImport} />
      <Route path="/purchases/ap/pdf-import" component={PurchasePdfImport} />
      <Route path="/purchases/expense" component={ExpenseList} />
      <Route path="/purchases/expenses" component={ExpenseList} />
      <Route path="/purchases/exp/new" component={ExpenseEntry} />
      <Route path="/purchases/exp/edit/:id" component={ExpenseEntry} />
      <Route path="/purchases/exp/import" component={ExpenseImport} />
      <Route path="/purchases/exp/pdf-import" component={ExpensePdfImport} />
      <Route path="/purchases/pdf-bulk-import" component={PdfBulkImport} />
      <Route path="/purchases/tax-report" component={PurchaseTaxReport} />
      <Route path="/purchases/wht" component={WhtCertList} />
      <Route path="/purchases/wht/new" component={WhtCertForm} />
      <Route path="/purchases/wht/edit/:id" component={WhtCertForm} />
      <Route path="/purchases/wht/print/:id" component={WhtCertPrint} />
      <Route path="/purchases/wht/attachment" component={WhtAttachmentPrint} />
      <Route path="/purchases/debit-note" component={DebitNoteList} />
      <Route path="/purchases/debit-note/new" component={DebitNoteForm} />
      <Route path="/purchases/debit-note/edit/:id" component={DebitNoteForm} />
      <Route path="/purchases/purchase-deposit" component={PurchaseDepositList} />
      <Route path="/purchases/purchase-deposit/new" component={PurchaseDepositForm} />
      <Route path="/purchases/purchase-deposit/edit/:id" component={PurchaseDepositForm} />
      <Route path="/share/wht-cert/:token" component={WhtCertShare} />
      <Route path="/shared/board/:token">{() => <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin w-8 h-8 border-4 border-[#fb9678] border-t-transparent rounded-full" /></div>}><SharedBoardPage /></Suspense>}</Route>
      <Route path="/external-register">{() => <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin w-8 h-8 border-4 border-[#fb9678] border-t-transparent rounded-full" /></div>}><ExternalRegisterPage /></Suspense>}</Route>
      <Route path="/external-board">{() => <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin w-8 h-8 border-4 border-[#fb9678] border-t-transparent rounded-full" /></div>}><ExternalBoardPage /></Suspense>}</Route>
      <Route path="/contacts/list" component={ContactList} />
      <Route path="/contacts/new" component={ContactForm} />
      <Route path="/contacts/edit/:id" component={ContactForm} />
      <Route path="/contacts/history" component={ContactHistory} />
      <Route path="/contacts/settings" component={ContactSettings} />
      <Route path="/inventory/list" component={InventoryList} />
      <Route path="/inventory/list/new" component={ProductForm} />
      <Route path="/inventory/list/edit/:id" component={ProductForm} />
      <Route path="/inventory/bom" component={BomManagement} />
      <Route path="/inventory/bom/new" component={BomFormPage} />
      <Route path="/inventory/bom/edit/:id" component={BomFormPage} />
      <Route path="/inventory/bundles" component={BundleManagement} />
      <Route path="/inventory/bundles/edit/:id" component={BundleFormPage} />
      <Route path="/inventory/promotions" component={PromotionManagement} />
      <Route path="/inventory/promotions/new" component={PromotionFormPage} />
      <Route path="/inventory/promotions/edit/:id" component={PromotionFormPage} />
      <Route path="/inventory/product-mapping" component={ProductMapping} />
      <Route path="/inventory/product-mapping/new" component={MappingFormPage} />
      <Route path="/inventory/product-mapping/edit/:id" component={MappingFormPage} />
      <Route path="/inventory/warehouse" component={WarehousePage} />
      <Route path="/inventory/stock-card" component={StockCardPage} />
      <Route path="/inventory/stock-transfer" component={StockTransferPage} />
      <Route path="/inventory/reports/valuation" component={InventoryValuation} />
      <Route path="/inventory/reports/movement-summary" component={MovementSummary} />
      <Route path="/inventory/reports/slow-moving" component={SlowMoving} />
      <Route path="/inventory/receiving" component={GoodsReceivingList} />
      <Route path="/inventory/receiving/form" component={GoodsReceivingForm} />
      <Route path="/inventory/receiving/form/:id" component={GoodsReceivingForm} />
      <Route path="/inventory/lots" component={ProductLotsPage} />
      <Route path="/manufacturing/dashboard" component={MfgDashboard} />
      <Route path="/manufacturing/bom" component={MfgBom} />
      <Route path="/manufacturing/orders" component={MfgOrders} />
      <Route path="/manufacturing/serial-numbers" component={MfgSerialNumbers} />
      <Route path="/manufacturing/traceability" component={MfgTraceability} />
      <Route path="/manufacturing/calibration" component={MfgCalibration} />
      <Route path="/inventory/manufacturing" component={ManufacturingList} />
      <Route path="/inventory/manufacturing/form" component={ManufacturingForm} />
      <Route path="/inventory/manufacturing/form/:id" component={ManufacturingForm} />
      <Route path="/inventory/requisition" component={GoodsRequisitionList} />
      <Route path="/inventory/requisition/form" component={GoodsRequisitionForm} />
      <Route path="/inventory/requisition/form/:id" component={GoodsRequisitionForm} />
      <Route path="/inventory/import-export" component={ProductImportExport} />
      <Route path="/inventory/barcode-labels" component={BarcodeLabels} />
      <Route path="/assets/registry" component={AssetRegistry} />
      <Route path="/assets/form" component={AssetForm} />
      <Route path="/assets/form/:id" component={AssetForm} />
      <Route path="/assets/depreciation" component={DepreciationPage} />
      <Route path="/assets/sales" component={AssetSalesReport} />
      <Route path="/assets/expired" component={AssetExpiredReport} />
      <Route path="/assets/summary" component={AssetSummary} />
      <Route path="/assets/history" component={AssetAccountingHistory} />
      <Route path="/assets/installments" component={InstallmentContracts} />
      <Route path="/assets/categories" component={AssetCategories} />
      <Route path="/reports/general" component={GeneralReports} />
      <Route path="/reports/general-ledger" component={GeneralLedger} />
      <Route path="/reports/journal-book" component={JournalBookReport} />
      <Route path="/reports/trial-balance" component={TrialBalance} />
      <Route path="/reports/income-statement" component={IncomeStatement} />
      <Route path="/reports/balance-sheet" component={BalanceSheet} />
      <Route path="/reports/cash-flow" component={CashFlowStatement} />
      <Route path="/reports/account-statement" component={AccountStatementPage} />
      <Route path="/reports/account-statement-contact" component={AccountStatementContactPage} />
      <Route path="/reports/reconcile-account-type" component={ReconcileAccountTypePage} />
      <Route path="/reports/worksheet" component={WorksheetPage} />
      <Route path="/reports/accounting-log" component={AccountingLogPage} />
      <Route path="/reports/purchase-tax-pending" component={PurchaseTaxPendingPage} />
      <Route path="/reports/pnd3" component={Pnd3Page} />
      <Route path="/reports/pnd53" component={Pnd53Page} />
      <Route path="/reports/sales-tax-reconcile">{() => <TaxReconcilePage type="sales" />}</Route>
      <Route path="/reports/purchase-tax-reconcile">{() => <TaxReconcilePage type="purchase" />}</Route>
      <Route path="/reports/vat-pp30-from-tb" component={VatPp30FromTbPage} />
      <Route path="/reports/income-statement-compare" component={IncomeStatementCompare} />
      <Route path="/reports/balance-sheet-compare" component={BalanceSheetCompare} />
      <Route path="/reports/balance-sheet-compare-amount" component={BalanceSheetCompareAmount} />
      <Route path="/reports/balance-sheet-12month-chart" component={BalanceSheet12MonthChart} />
      <Route path="/reports/income-statement-compare-amount" component={IncomeStatementCompareAmount} />
      <Route path="/reports/income-statement-12month" component={IncomeStatement12Month} />
      <Route path="/reports/income-statement-12month-chart" component={IncomeStatement12MonthChart} />
      <Route path="/reports/income-statement-cumulative" component={IncomeStatementCumulative} />
      <Route path="/reports/income-statement-month-year" component={IncomeStatementMonthYear} />
      <Route path="/reports/income-statement-pct" component={IncomeStatementPct} />
      <Route path="/reports/income-statement-quarterly" component={IncomeStatementQuarterly} />
      <Route path="/reports/financial-notes" component={FinancialNotes} />
      <Route path="/tax-tools/financial-statements-package" component={FinancialStatementsPackage} />
      <Route path="/reports/financial-statements-package">{() => { window.location.href = "/tax-tools/financial-statements-package"; return null; }}</Route>
      <Route path="/reports/ar-aging" component={ARAgingReport} />
      <Route path="/reports/ar-aging-invoices" component={ARAgingInvoicesReport} />
      <Route path="/reports/ap-aging" component={APAgingReport} />
      <Route path="/reports/financial-ratios" component={FinancialRatiosDashboard} />
      <Route path="/reports/budget-entry" component={BudgetEntry} />
      <Route path="/reports/budget-vs-actual" component={BudgetVsActual} />
      <Route path="/reports/vat-pp30" component={VatPP30Report} />
      <Route path="/reports/bank-reconciliation" component={BankReconciliation} />
      <Route path="/reports/sales" component={SalesReport} />
      <Route path="/reports/gross-profit" component={GrossProfitReport} />
      <Route path="/reports/sales-by-document" component={SalesByDocument} />
      <Route path="/reports/sales-by-department" component={SalesByDepartment} />
      <Route path="/reports/sales-by-project" component={SalesByProject} />
      <Route path="/reports/sales-by-account" component={SalesByAccount} />
      <Route path="/reports/sales-item-details" component={SalesItemDetails} />
      <Route path="/reports/daily-sales" component={DailySalesSummary} />
      <Route path="/reports/top-products" component={TopProducts} />
      <Route path="/reports/sales-monthly-comparison" component={SalesMonthlyComparison} />
      <Route path="/reports/gross-profit-by-product" component={GrossProfitByProduct} />
      <Route path="/reports/opex-capex" component={OpexCapexReport} />
      <Route path="/reports/growth-trend" component={GrowthTrendReport} />
      <Route path="/reports/department-pl" component={DepartmentPLReport} />
      <Route path="/reports/break-even" component={BreakEvenReport} />
      <Route path="/reports/financial-management" component={FinancialManagement} />
      <Route path="/reports/wht" component={WhtCertList} />
      <Route path="/firm-mgmt/clients" component={FirmManagement} />
      <Route path="/firm-mgmt/clients/new" component={ClientForm} />
      <Route path="/firm-mgmt/clients/:id/edit" component={ClientForm} />
      <Route path="/firm-mgmt/assignments" component={FirmAssignments} />
      <Route path="/firm-mgmt/contracts" component={ContractsPage} />
      <Route path="/firm-mgmt/billing" component={FirmBilling} />
      <Route path="/firm-mgmt/documents" component={FirmDocuments} />
      <Route path="/line-document-archive" component={LineDocumentArchive} />
      <Route path="/sign/:token" component={ContractSignPage} />
      <Route path="/delivery-sign/:token" component={DeliverySignPublicPage} />
      <Route path="/hr/dashboard" component={HRMDashboard} />
      <Route path="/hr/attendance" component={HRAttendance} />
      <Route path="/hr/attendance-report" component={AttendanceReport} />
      <Route path="/hr/employees" component={EmployeeList} />
      <Route path="/hr/leave" component={LeaveManagement} />
      <Route path="/hr/leave-policy" component={LeavePolicySettings} />
      <Route path="/hr/ot" component={OTManagement} />
      <Route path="/hr/payroll">{() => { window.location.href = "/hr/payslip"; return null; }}</Route>
      <Route path="/hr/payslip" component={PayslipPage} />
      <Route path="/hr/certificates" component={Certificates} />
      <Route path="/hr/salary-certificate">{() => { window.location.href = "/hr/certificates"; return null; }}</Route>
      <Route path="/hr/work-certificate">{() => { window.location.href = "/hr/certificates?tab=work"; return null; }}</Route>
      <Route path="/hr/holidays" component={HolidaysPage} />
      <Route path="/hr/work-schedule" component={WorkSchedulePage} />
      <Route path="/hr/shift-settings" component={ShiftSettingsPage} />
      <Route path="/hr/shift-schedule" component={ShiftSchedulePage} />
      <Route path="/hr/scanner-mapping" component={ScannerMapping} />
      <Route path="/hr/scanner-import" component={ScannerImport} />
      <Route path="/hr/payroll-tax" component={PayrollTax} />
      <Route path="/hr/wht-import" component={WhtImport} />
      <Route path="/tax-tools/wht-import" component={WhtImport} />
      <Route path="/tax-tools/financial-statements" component={FinancialStatementsGenerator} />
      <Route path="/tax-tools/gov-receipt" component={GovReceiptDownloader} />
      <Route path="/tax-tools">{() => { window.location.href = "/tax-tools/financial-statements"; return null; }}</Route>
      <Route path="/tools/gov-receipt" component={GovReceiptDownloader} />
      <Route path="/hr/performance" component={Performance} />
      <Route path="/hr/commission-rules" component={CommissionRules} />
      <Route path="/hr/commission" component={CommissionRecords} />
      <Route path="/hr/pnd1">{() => { window.location.href = "/hr/payroll-tax?tab=pnd1"; return null; }}</Route>
      <Route path="/hr/pnd1a">{() => { window.location.href = "/hr/payroll-tax?tab=pnd1a"; return null; }}</Route>
      <Route path="/hr/tax-attachment">{() => { window.location.href = "/hr/payroll-tax?tab=attachment"; return null; }}</Route>
      <Route path="/hr/fifty-tawi">{() => { window.location.href = "/hr/payroll-tax?tab=50tawi"; return null; }}</Route>
      <Route path="/ess" component={UserProfile} />
      <Route path="/etax-hub" component={EtaxHubDashboard} />
      <Route path="/etax-hub/board" component={EtaxHubClientBoard} />
      <Route path="/etax-hub/calendar" component={EtaxHubMyCalendar} />
      <Route path="/etax-hub/efiling" component={EfilingDashboard} />
      <Route path="/etax-hub/efiling/submit" component={EfilingSubmit} />
      <Route path="/etax-hub/efiling/receipts" component={EfilingReceipts} />
      <Route path="/etax-hub/efiling/settings" component={EfilingSettings} />
      <Route path="/settings/tax-reminder" component={TaxReminderSettings} />
      <Route path="/office/tasks" component={TaskBoardPage} />
      <Route path="/office/work-board" component={WorkBoardPage} />
      <Route path="/settings/users" component={UserManagement} />
      <Route path="/settings/document-templates" component={DocumentTemplates} />
      <Route path="/settings/profile" component={UserProfile} />
      <Route path="/settings/firm-link" component={FirmLinkPage} />
      <Route path="/module-select" component={ModuleSelectPage} />
      <Route path="/settings/company-info" component={CompanyInfo} />
      <Route path="/settings/payment-methods" component={PaymentMethodSettings} />
      <Route path="/settings/my-subscription" component={MySubscription} />
      <Route path="/settings/module-pricing" component={ModulePricing} />
      <Route path="/settings/upgrade" component={UpgradePlan} />
      <Route path="/settings/white-label" component={WhiteLabelSettings} />
      <Route path="/settings/landing-cms" component={LandingCmsPage} />
      <Route path="/settings/ftp-archive" component={FtpArchiveSettings} />
      <Route path="/settings/etax" component={EtaxSettings} />
      <Route path="/settings/custom-forms" component={CustomFormTemplates} />
      <Route path="/settings/line" component={LineSettings} />
      <Route path="/settings/approval" component={ApprovalSettingsPage} />
      <Route path="/settings/general" component={GeneralSettings} />
      <Route path="/settings/inventory-triggers" component={InventoryTriggers} />
      <Route path="/settings/dept-branch" component={DeptBranchSettings} />
      <Route path="/settings/exchange-rate" component={ExchangeRateSettings} />
      <Route path="/accounting/formulas" component={AccountingFormulas} />
      <Route path="/ecommerce/dashboard" component={EcommerceDashboard} />
      <Route path="/ecommerce/hub" component={EcommerceHub} />
      <Route path="/ecommerce/connections" component={EcommerceConnections} />
      <Route path="/ecommerce/import" component={OrderImport} />
      <Route path="/ecommerce/grab-food" component={GrabFoodConnect} />
      <Route path="/ecommerce/orders" component={EcommerceOrders} />
      <Route path="/ecommerce/documents" component={EcommerceDocuments} />
      <Route path="/ecommerce/quick-invoice" component={EcommerceQuickInvoice} />
      <Route path="/ecommerce/inventory/bom" component={EcommerceInventoryBom} />
      <Route path="/ecommerce/inventory/manufacturing" component={EcommerceInventoryManufacturing} />
      <Route path="/ecommerce/inventory/bundles" component={EcommerceInventoryBundles} />
      <Route path="/ecommerce/inventory/promotions" component={EcommerceInventoryPromotions} />
      <Route path="/ecommerce/inventory/warehouse" component={EcommerceInventoryWarehouse} />
      <Route path="/ecommerce/inventory/stock-card" component={EcommerceInventoryStockCard} />
      <Route path="/ecommerce/inventory/valuation" component={EcommerceInventoryValuation} />
      <Route path="/ecommerce/inventory/movement" component={EcommerceInventoryMovement} />
      <Route path="/ecommerce/inventory/slow-moving" component={EcommerceInventorySlowMoving} />
      <Route path="/ecommerce/inventory/stock-sync" component={EcommerceStockSync} />
      <Route path="/ecommerce/sku-mapping" component={SkuSmartMapping} />
      <Route path="/ecommerce/warehouses" component={EcommerceWarehouses} />
      <Route path="/ecommerce/fulfillment" component={EcommerceFulfillment} />
      <Route path="/ecommerce/shipping-labels" component={EcommerceShippingLabels} />
      <Route path="/ecommerce/packing-cameras" component={EcommercePackingCameras} />
      <Route path="/ecommerce/ai-analytics" component={EcommerceAiAnalytics} />
      <Route path="/ecommerce/supplier-portal" component={EcommerceSupplierPortal} />
      <Route path="/upload/:token" component={ClientUploadPage} />
      <Route path="/ecommerce/pda-mobile" component={EcommercePdaMobile} />
      <Route path="/ecommerce/bin-locations" component={EcommerceBinLocations} />
      <Route path="/ecommerce/packing-station" component={EcommercePackingStation} />
      <Route path="/ecommerce/packing-recordings" component={EcommercePackingRecordings} />
      <Route path="/ecommerce/wave-picking" component={EcommerceWavePicking} />
      <Route path="/ecommerce/settlements" component={EcommerceSettlements} />
      <Route path="/ecommerce/settlement-import" component={SettlementImport} />
      <Route path="/ecommerce/withdrawal-import" component={WithdrawalImport} />
      <Route path="/ecommerce/returns" component={EcommerceReturns} />
      <Route path="/ecommerce/returns-report" component={EcommerceReturnsReport} />
      <Route path="/ecommerce/returns-scan" component={EcommerceReturnsScan} />
      <Route path="/ecommerce/returns-qc" component={EcommerceReturnsQC} />
      <Route path="/ecommerce/analytics" component={EcommerceAnalytics} />
      <Route path="/ecommerce/auto-sync" component={EcommerceAutoSync} />
      <Route path="/ecommerce/platform-credentials" component={PlatformCredentials} />
      <Route path="/ecommerce/chat" component={EcommerceChatInbox} />
      <Route path="/ecommerce/chat/auto-reply" component={EcommerceChatAutoReply} />
      <Route path="/ecommerce/chat/keywords" component={EcommerceChatKeywords} />
      <Route path="/ecommerce/api-connect" component={EcommerceApiConnect} />
      <Route path="/ecommerce/facebook-orders" component={EcommerceFacebookOrders} />
      <Route path="/ecommerce/stock-alerts" component={EcommerceStockAlerts} />
      <Route path="/ecommerce/reconciliation" component={EcommerceReconciliation} />
      <Route path="/ecommerce/store-clone" component={EcommerceStoreClone} />
      <Route path="/ecommerce/settings" component={EcommerceSettings} />
      <Route path="/ecommerce/team" component={EcomTeam} />
      <Route path="/ecommerce/price-calculator" component={PriceCalculator} />
      <Route path="/ecommerce/business-insights" component={BusinessInsights} />
      <Route path="/ecommerce/inventory" component={EcommerceInventory} />
      <Route path="/ecommerce/live-commission" component={EcommerceLiveCommission} />
      <Route path="/ecommerce/live-selling" component={LiveSellingHub} />
      <Route path="/ecommerce/live-selling/dashboard" component={LiveSellingDashboard} />
      <Route path="/ecommerce/live-selling/lucky-draw" component={LiveSellingLuckyDraw} />
      <Route path="/ecommerce/live-agency" component={AgencyDashboard} />
      <Route path="/ecommerce/live-agency/monitor/:id" component={LiveMonitor} />
      <Route path="/ecommerce/live-agency/report/:id" component={PostLiveReport} />
      <Route path="/ecommerce/live-agency/planning" component={LivePlanning} />
      <Route path="/delivery/dashboard" component={DeliveryDashboard} />
      <Route path="/delivery/fulfillment" component={DeliveryFulfillment} />
      <Route path="/delivery/shipping-labels" component={DeliveryShippingLabels} />
      <Route path="/delivery/tracking" component={DeliveryTracking} />
      <Route path="/delivery/line-notify" component={DeliveryLineNotify} />
      <Route path="/delivery/shipments" component={DeliveryShipments} />
      <Route path="/delivery/scan" component={DeliveryScan} />
      <Route path="/delivery/settings" component={DeliverySettings} />
      <Route path="/delivery-hub" component={DeliveryHub} />
      <Route path="/delivery-notes" component={DeliveryNotesPage} />
      <Route path="/delivery-notes/new" component={DeliveryNoteFormPage} />
      <Route path="/delivery-notes/:id" component={DeliveryNoteFormPage} />
      <Route path="/food-delivery/dashboard" component={FoodDashboard} />
      <Route path="/food-delivery/orders" component={FoodOrders} />
      <Route path="/food-delivery/menu" component={FoodMenu} />
      <Route path="/food-delivery/connections" component={FoodConnections} />
      <Route path="/food-delivery/stores" component={FoodStores} />
      <Route path="/food-delivery/analytics" component={FoodAnalytics} />
      <Route path="/food-delivery/history" component={FoodHistory} />
      <Route path="/food-delivery/import" component={FoodImport} />
      <Route path="/food-delivery/accounting" component={FoodAccounting} />
      <Route path="/food-delivery/settings" component={FoodSettings} />
      <Route path="/pos/terminal" component={PosTerminal} />
      <Route path="/pos/dashboard" component={PosDashboard} />
      <Route path="/pos/sessions" component={PosSessions} />
      <Route path="/pos/branches" component={PosBranches} />
      <Route path="/pos/sales" component={PosSalesList} />
      <Route path="/pos/invoice/:id" component={PosInvoice} />
      <Route path="/pos/receipt/:id" component={PosReceipt} />
      <Route path="/pos/loyalty" component={LoyaltyManagement} />
      <Route path="/pos-hub" component={PosHubDashboard} />
      <Route path="/pos-hub/dashboard" component={PosHubDashboard} />
      <Route path="/pos-hub/sales-by-branch" component={PosHubSalesByBranch} />
      <Route path="/pos-hub/sales-by-product" component={PosHubSalesByProduct} />
      <Route path="/pos-hub/sales-by-category" component={PosHubSalesByCategory} />
      <Route path="/pos-hub/best-sellers" component={PosHubBestSellers} />
      <Route path="/pos-hub/payment-analysis" component={PosHubPaymentAnalysis} />
      <Route path="/pos-hub/cashier-performance" component={PosHubCashierPerformance} />
      <Route path="/pos-hub/hourly-trends" component={PosHubHourlyTrends} />
      <Route path="/pos-hub/daily-summary" component={PosHubDailySummary} />
      <Route path="/pos/list" component={PosProducts} />
      <Route path="/pos/list/new" component={PosProductForm} />
      <Route path="/pos/list/edit/:id" component={PosProductForm} />
      <Route path="/pos/products" component={PosProducts} />
      <Route path="/pos/bundles" component={PosBundles} />
      <Route path="/pos/bundles/edit/:id" component={PosBundleForm} />
      <Route path="/pos/stock" component={PosStock} />
      <Route path="/pos/stock-card" component={PosStockCard} />
      <Route path="/pos/stock-transfer" component={PosStockTransfer} />
      <Route path="/pos/tax-invoices" component={PosTaxInvoices} />
      <Route path="/pos/settings" component={PosSettings} />
      <Route path="/pos/staff" component={PosStaff} />
      <Route path="/pos/commission" component={PosCommission} />
      <Route path="/pos/requisition" component={PosRequisition} />
      <Route path="/pos/requisition/form" component={PosRequisitionForm} />
      <Route path="/pos/requisition/form/:id" component={PosRequisitionForm} />
      <Route path="/pos/receiving" component={PosGoodsReceiving} />
      <Route path="/pos/receiving/form" component={PosGoodsReceivingForm} />
      <Route path="/pos/receiving/form/:id" component={PosGoodsReceivingForm} />
      <Route path="/pos/promotions" component={PosPromotions} />
      <Route path="/pos/promotions/new" component={PosPromotionForm} />
      <Route path="/pos/promotions/edit/:id" component={PosPromotionForm} />
      <Route path="/pos/delivery-notes" component={PosDeliveryNotes} />
      <Route path="/pos/delivery-notes/new" component={PosDeliveryNoteForm} />
      <Route path="/pos/delivery-notes/:id" component={PosDeliveryNoteForm} />
      <Route path="/pos/barcode-labels" component={PosBarcodeLabels} />
      <Route path="/pos/valuation" component={PosValuation} />
      <Route path="/pos/movement-summary" component={PosMovementSummary} />
      <Route path="/pos/slow-moving" component={PosSlowMoving} />
      <Route path="/loyalty/signup" component={LoyaltySignup} />
      <Route path="/job-costing" component={JobCostingProjectList} />
      <Route path="/job-costing/projects/:id" component={JobCostingProjectDetail} />
      <Route path="/gas-station/setup" component={GasFuelSetup} />
      <Route path="/gas-station/integration" component={GasStationIntegration} />
      <Route path="/gas-station/dashboard" component={GasStationDashboard} />
      <Route path="/gas-station/daily-sales" component={GasDailySales} />
      <Route path="/gas-station/fuel-stock" component={GasFuelStock} />
      <Route path="/gas-station/oil-loss-gain" component={GasOilLossGain} />
      <Route path="/gas-station/local-tax" component={GasLocalTax} />
      <Route path="/gas-station/reports" component={GasReports} />
      <Route path="/approval-center" component={ApprovalCenter} />
      <Route path="/approve/:token" component={ApproveByTokenPage} />
      <Route path="/activity-log" component={ActivityLog} />
      <Route path="/system-info" component={SystemInfo} />
      <Route path="/crm/customers" component={CustomerList} />
      <Route path="/crm/customers/:id" component={CustomerDetail} />
      <Route path="/ads/tracking" component={AdTracking} />
      <Route path="/ci/executive" component={CIExecutive} />
      <Route path="/ci/channel" component={CIChannel} />
      <Route path="/ci/product" component={CIProduct} />
      <Route path="/ci/campaign" component={CICampaign} />
      <Route path="/ci/live" component={CILive} />
      <Route path="/ci/alerts" component={CIAlerts} />
      <Route path="/office/chat" component={InternalChat} />
      <Route path="/office/meetings" component={MeetingsPage} />
      <Route path="/office/calendar" component={FullCalendar} />
      <Route path="/m/dashboard" component={MobileExecutiveDashboard} />
      <Route path="/m/expense-snap" component={MobileExpenseSnap} />
      <Route path="/legacy-import/login" component={LegacyLoginPage} />
      <Route path="/legacy-import/documents/type/:docType" component={LegacyDocumentsPage} />
      <Route path="/legacy-import/documents/:id" component={LegacyDocumentsPage} />
      <Route path="/legacy-import" component={LegacyImportPage} />
      <Route path="/legacy-import/import-db" component={LegacyImportDbPage} />
      <Route path="/legacy-import/viewer" component={LegacyViewerPage} />
      <Route path="/legacy-import/company-manager" component={LegacyCompanyManagerPage} />
      <Route path="/legacy-import/chart-of-accounts" component={LegacyChartOfAccountsPage} />
      <Route path="/legacy-import/contacts" component={LegacyContactsPage} />
      <Route path="/legacy-import/gl-journal/:id" component={LegacyGlJournalPage} />
      <Route path="/legacy-import/gl-journal" component={LegacyGlJournalPage} />
      <Route path="/legacy-import/reports/trial-balance" component={LegacyReportsPage} />
      <Route path="/legacy-import/reports/general-ledger" component={LegacyReportsPage} />
      <Route path="/legacy-import/reports/income-statement" component={LegacyReportsPage} />
      <Route path="/legacy-import/reports/balance-sheet" component={LegacyReportsPage} />
      <Route path="/legacy-import/reports/tax-summary" component={LegacyReportsPage} />
      <Route path="/dashboard" component={DashboardRedirect} />
      <Route path="/" component={HomeRedirect} />
      <Route component={NotFound} />
    </Switch>
    </TrialGuard>
    </Suspense>
  );
}

function UpgradePrompt() {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [, navigate] = useLocation();

  useEffect(() => {
    setUpgradeCallback((message: string) => {
      setMsg(message);
      setOpen(true);
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <span className="text-lg">⚠️</span> เกินขีดจำกัดแพ็คเกจ
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed">{msg}</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>ปิด</Button>
          <Button
            style={{ background: "#fb9678" }}
            onClick={() => { setOpen(false); navigate("/settings/upgrade"); }}
            data-testid="button-go-upgrade"
          >
            ดูแพ็คเกจ & อัพเกรด
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <CompanyProvider>
              <DateSettingsProvider>
                <BranchSelectProvider>
                <Toaster />
                <UpgradePrompt />
                <Router />
                <ExternalUserGuard>
                  <ChatWidget />
                  <InternalChatWidget />
                </ExternalUserGuard>
                </BranchSelectProvider>
              </DateSettingsProvider>
            </CompanyProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
