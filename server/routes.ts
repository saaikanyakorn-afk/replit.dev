import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { attachmentInterceptMiddleware } from "./attachment-middleware";
import { db } from "./db";
import { eq, and, isNull } from "drizzle-orm";
import { employees, users, companies } from "@shared/schema";

import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import businessInsightsRouter from "./routes/business-insights";

import { registerHrRoutes } from "./routes/hr-routes";
import { registerPurchaseRoutes } from "./routes/purchase-routes";
import { registerImportBatchRoutes } from "./routes/import-batch-routes";
import { registerPdfTemplateRoutes, seedDefaultPdfTemplates } from "./routes/pdf-template-routes";
import { registerManufacturingRoutes } from "./routes/manufacturing-routes";
import { registerManufacturingModuleRoutes } from "./routes/manufacturing-module-routes";
import { registerMesRoutes } from "./routes/mes-routes";
import { registerExpenseRoutes } from "./routes/expense-routes";
import { registerFixedAssetsRoutes } from "./routes/fixed-assets-routes";
import { registerPosRoutes } from "./routes/pos-routes";
import { registerDeliveryNoteRoutes } from "./routes/delivery-note-routes";
import { registerRestaurantRoutes } from "./routes/restaurant-routes";
import { registerModuleSyncRoutes } from "./routes/module-sync-routes";
import { registerFirmLinkRoutes } from "./routes/firm-link-routes";
import { registerCustomFormRoutes } from "./routes/custom-form-routes";
import { registerLiveSellingRoutes } from "./routes/live-selling-routes";
import { registerEtaxRoutes } from "./routes/etax-routes";
import { registerInstallmentRoutes } from "./routes/installment-routes";
import { registerApprovalRoutes } from "./routes/approval-routes";
import { registerCommerceIntelligenceRoutes } from "./routes/commerce-intelligence";
import { registerPriceCalculatorRoutes } from "./routes/price-calculator";
import { registerInternalChatRoutes } from "./routes/internal-chat";
import { registerCalendarRoutes } from "./routes/calendar-events";
import { registerGasStationRoutes } from "./routes/gas-station-routes";
import { registerEtaxHubRoutes } from "./routes/etax-hub";
import { registerTaxCalendarRoutes } from "./routes/tax-calendar";
import { registerMeetingRoutes } from "./routes/meetings";
import { registerRdDirectRoutes } from "./routes/rd-direct-routes";
import { registerFinancialRatiosRoutes } from "./routes/financial-ratios";
import { registerCashFlowForecastRoutes } from "./routes/cash-flow-forecast";
import { registerSalesPipelineRoutes } from "./routes/sales-pipeline";
import { registerBudgetRoutes } from "./routes/budget-routes";
import { registerFinancialAnalyticsRoutes } from "./routes/financial-analytics";
import { registerFinancialManagementRoutes } from "./routes/financial-management";
import { registerLegacyImportRoutes } from "./routes/legacy-import";
import { registerJobCostingRoutes } from "./routes/job-costing-routes";

import { registerMiscRoutes } from "./routes/misc-routes";
import { registerCoreRoutes } from "./routes/core-routes";
import { registerTaskMgmtRoutes } from "./routes/task-mgmt-routes";
import { registerFirmRoutes } from "./routes/firm-routes";
import { registerWorkStatusRoutes } from "./routes/work-status-routes";
import { registerAccountingRoutes } from "./routes/accounting-routes";
import { registerFinancialDocsRoutes } from "./routes/financial-docs-routes";
import { registerUserRoutes } from "./routes/user-routes";
import { registerDocSettingsRoutes } from "./routes/doc-settings-routes";
import { registerPlatformRoutes } from "./routes/platform-routes";
import { registerContactsRoutes } from "./routes/contacts-routes";
import { registerProductsRoutes } from "./routes/products-routes";
import { registerEcommerceRoutes } from "./routes/ecommerce-routes";
import { registerSalesDocsRoutes } from "./routes/sales-docs-routes";
import { registerLineRoutes } from "./routes/line-routes";
import { registerPaymentMethodsRoutes } from "./routes/payment-methods-routes";
import { registerReportsRoutes } from "./routes/reports-routes";
import { registerEcommerceImportRoutes } from "./routes/ecommerce-import-routes";
import { registerPdfRoutes } from "./routes/pdf-routes";
import { registerApprovalCenterRoutes } from "./routes/approval-center-routes";
import { registerNotificationsRoutes } from "./routes/notifications-routes";
import { registerBillingNotesRoutes } from "./routes/billing-notes-routes";
import { registerCrmRoutes } from "./routes/crm-routes";
import { registerAdCostRoutes } from "./routes/ad-cost-routes";
import { registerEssRoutes } from "./routes/ess-routes";
import { registerWorkBoardRoutes } from "./routes/work-board-routes";
import { registerSubscriptionRoutes } from "./routes/subscription-routes";
import { registerWhiteLabelRoutes } from "./routes/white-label-routes";
import { registerPettyCashRoutes } from "./routes/petty-cash-routes";
import { registerLoyaltyRoutes } from "./routes/loyalty-routes";
import { registerAccountingToolsRoutes } from "./routes/accounting-tools-routes";
import { registerWarehouseBinRoutes } from "./routes/warehouse-bin-routes";
import { registerChatAutoReplyRoutes } from "./routes/chat-auto-reply-routes";
import { registerStockSyncRoutes } from "./routes/stock-sync-routes";
import { registerSupplierPortalRoutes } from "./routes/supplier-portal-routes";
import { registerAiAnalyticsRoutes } from "./routes/ai-analytics-routes";
import { registerSyncJobRoutes } from "./routes/sync-job-routes";
import { registerDataArchiveRoutes } from "./routes/data-archive-routes";
import { registerFtpArchiveRoutes } from "./routes/ftp-archive-routes";
import { registerLiveAgencyRoutes } from "./routes/live-agency-routes";
import { registerAiPerformanceRoutes } from "./routes/ai-performance-routes";
import { registerLandingPageRoutes } from "./routes/landing-page-routes";
import { registerDevMenuRoutes } from "./routes/dev-menu-routes";
import { registerFacebookWebhookRoutes } from "./routes/facebook-webhook-routes";
import { registerBundleFixRoutes } from "./routes/bundle-fix-routes";
import { registerSysAdminRoutes } from "./routes/sysadmin-routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  app.use(attachmentInterceptMiddleware);

  const { tenantGuard } = await import("./route-middleware");
  app.use("/api", tenantGuard);

  app.use("/api", (req, res, next) => {
    if (!req.isAuthenticated()) return next();
    const user = req.user as any;
    if (user.role !== "client_external") return next();

    const allowedPaths = [
      "/auth/me", "/auth/logout", "/shared/board/", "/uploads/request-url", "/uploads/direct",
      "/etax-hub/", "/companies", "/permissions/me", "/document-settings",
      "/notifications", "/employees", "/my-subscription-info", "/version",
      "/dev/", "/maintenance/", "/work-boards/by-token/",
    ];
    const path = req.path;
    if (allowedPaths.some(p => path.startsWith(p))) return next();
    return res.status(403).json({ message: "คุณไม่มีสิทธิ์เข้าถึงส่วนนี้" });
  });

  (async () => {
    try {
      const orphaned = await db.select({ id: employees.id, userId: employees.userId }).from(employees)
        .where(and(isNull(employees.companyId), isNull(employees.tenantId)));
      if (orphaned.length > 0) {
        let fixed = 0;
        let deleted = 0;
        for (const emp of orphaned) {
          if (emp.userId) {
            const [owner] = await db.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, emp.userId)).limit(1);
            if (owner?.tenantId) {
              const [pc] = await db.select({ id: companies.id }).from(companies)
                .where(and(eq(companies.tenantId, owner.tenantId), eq(companies.isPrimary, true))).limit(1);
              if (pc) {
                await db.update(employees).set({ tenantId: owner.tenantId, companyId: pc.id }).where(eq(employees.id, emp.id));
                fixed++;
                continue;
              }
            }
          }
          await db.delete(employees).where(eq(employees.id, emp.id));
          deleted++;
        }
        if (fixed > 0) console.log(`[backfill] Fixed ${fixed} orphaned employees via user->tenant lookup`);
        if (deleted > 0) console.log(`[backfill] Deleted ${deleted} orphaned employees with no valid tenant`);
      }
    } catch (e) { console.error("[backfill] Employee backfill error:", (e as any).message); }
  })();

  registerHrRoutes(app);
  registerPurchaseRoutes(app);
  registerImportBatchRoutes(app);
  registerPdfTemplateRoutes(app);
  seedDefaultPdfTemplates();
  registerManufacturingRoutes(app);
  registerManufacturingModuleRoutes(app);
  registerMesRoutes(app);
  registerExpenseRoutes(app);
  registerFixedAssetsRoutes(app);
  registerPosRoutes(app);
  registerDeliveryNoteRoutes(app);
  registerRestaurantRoutes(app);
  registerModuleSyncRoutes(app);
  registerFirmLinkRoutes(app);
  registerCustomFormRoutes(app);
  registerLiveSellingRoutes(app);
  registerGasStationRoutes(app);
  registerEtaxRoutes(app);
  registerInstallmentRoutes(app);
  registerApprovalRoutes(app);
  registerCommerceIntelligenceRoutes(app);
  registerPriceCalculatorRoutes(app);
  app.use(businessInsightsRouter);
  registerInternalChatRoutes(app);
  registerCalendarRoutes(app);
  registerEtaxHubRoutes(app);
  registerTaxCalendarRoutes(app);
  registerMeetingRoutes(app);
  registerRdDirectRoutes(app);
  registerFinancialRatiosRoutes(app);
  registerCashFlowForecastRoutes(app);
  registerSalesPipelineRoutes(app);
  registerBudgetRoutes(app);
  registerFinancialAnalyticsRoutes(app);
  registerFinancialManagementRoutes(app);
  registerLegacyImportRoutes(app);
  registerJobCostingRoutes(app);

  

  registerObjectStorageRoutes(app);
  registerMiscRoutes(app);
  registerCoreRoutes(app);
  registerTaskMgmtRoutes(app);
  registerFirmRoutes(app);
  registerWorkStatusRoutes(app);
  registerAccountingRoutes(app);
  registerFinancialDocsRoutes(app);
  registerUserRoutes(app);
  registerDocSettingsRoutes(app);
  registerPlatformRoutes(app);
  registerContactsRoutes(app);
  registerProductsRoutes(app);
  registerEcommerceRoutes(app);
  registerSalesDocsRoutes(app);
  registerLineRoutes(app);
  registerPaymentMethodsRoutes(app);
  registerReportsRoutes(app);
  registerEcommerceImportRoutes(app);
  registerPdfRoutes(app);
  registerApprovalCenterRoutes(app);
  registerNotificationsRoutes(app);
  registerBillingNotesRoutes(app);
  registerCrmRoutes(app);
  registerAdCostRoutes(app);
  registerEssRoutes(app);
  registerWorkBoardRoutes(app);
  registerSubscriptionRoutes(app);
  registerWhiteLabelRoutes(app);
  registerPettyCashRoutes(app);
  registerLoyaltyRoutes(app);
  registerAccountingToolsRoutes(app);
  registerWarehouseBinRoutes(app);
  registerChatAutoReplyRoutes(app);
  registerStockSyncRoutes(app);
  registerSupplierPortalRoutes(app);
  registerAiAnalyticsRoutes(app);
  registerSyncJobRoutes(app);
  registerDataArchiveRoutes(app);
  registerFtpArchiveRoutes(app);
  registerLiveAgencyRoutes(app);
  registerAiPerformanceRoutes(app);
  registerLandingPageRoutes(app);
  registerDevMenuRoutes(app);
  registerFacebookWebhookRoutes(app);
  registerBundleFixRoutes(app);
  registerSysAdminRoutes(app);

  return httpServer;
}
