/**
 * app-extra.tsx
 * Called AFTER App.tsx renders — same pattern as schema-extra.ts extends schema.ts.
 * Injected as a global guard inside the Router in App.tsx.
 * App.tsx on production = SOURCE OF TRUTH — never modify it on dev and push.
 * All new routes must be added here, not in App.tsx.
 *
 * Purpose 1: employees who land on /hr/attendance but have access to more than one
 * module (e.g. inventory) should see the module-select page instead of being
 * silently locked to HR.  module-select.tsx is protected so we intercept here.
 *
 * Purpose 2: New routes that cannot be added to App.tsx (production is source of truth)
 * are registered here — CreditNotePdf, CreditNoteShare.
 *
 * Strategy: use manual useLocation() path matching instead of wouter <Route> to avoid
 * differences between wouter <Route> outside <Switch> in dev vs production compiled bundle.
 * Extract id/token from the path string directly and pass as props — no useParams() needed.
 */

import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import ManufacturingLayout from "@/components/manufacturing-layout";

const CreditNotePdf = lazy(() => import("@/pages/sales/credit-note-pdf"));
const CreditNoteShare = lazy(() => import("@/pages/sales/credit-note-share"));
const WhtCertShare = lazy(() => import("@/pages/purchases/wht-cert-share"));
const BillingNoteShare = lazy(() => import("@/pages/finance/billing-note-share"));
// [exchange-rate] /settings/exchange-rate — super_admin BOT API key management
// Cannot be added to App.tsx (production source of truth). Registered here.
const ExchangeRateSettings = lazy(() => import("@/pages/settings/exchange-rate-settings"));
// [inventory-triggers] /settings/inventory-triggers — app-extra module required
const InventoryTriggersPage = lazy(() => import("@/pages/settings/inventory-triggers"));

// [mes] MES — Manufacturing Execution System — added 2026-05-16
const MesWorkOrders = lazy(() => import("@/pages/manufacturing/mes-work-orders"));
const MesUnitDetail = lazy(() => import("@/pages/manufacturing/mes-unit-detail"));
const MesScanStation = lazy(() => import("@/pages/manufacturing/mes-scan-station"));

// [material-issue] เบิกวัตถุดิบ — added 2026-05-17
const MaterialIssueList = lazy(() => import("@/pages/inventory/material-issue-list"));
const MaterialIssueForm = lazy(() => import("@/pages/inventory/material-issue-form"));

// [production-finish] ใบรับสินค้าสำเร็จรูป WIP→FG — added 2026-05-17
const ProductionFinishList = lazy(() => import("@/pages/manufacturing/production-finish-list"));
const ProductionFinishForm = lazy(() => import("@/pages/manufacturing/production-finish-form"));

// [ncr] Non-Conformance Report — added 2026-05-17
const NcrList = lazy(() => import("@/pages/manufacturing/ncr-list"));
const NcrForm = lazy(() => import("@/pages/manufacturing/ncr-form"));
const EmployeeQRPage = lazy(() => import("@/pages/inventory/employee-qr"));

// [mfg-form] Manufacturing order form inside ManufacturingLayout
// /manufacturing/orders/form and /manufacturing/orders/form/:id
const ManufacturingForm = lazy(() => import("@/pages/inventory/manufacturing-form"));

// [mfg-bom] BOM form inside ManufacturingLayout
// /manufacturing/bom/new and /manufacturing/bom/edit/:id
const BomFormPage = lazy(() => import("@/pages/inventory/bom-form"));

// [process-scan] Process Scan Station — scan employee + MO + log step
const ProcessScanStation = lazy(() => import("@/pages/manufacturing/process-scan-station"));

function FullPageOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "white", zIndex: 9999, overflow: "auto" }}>
      {children}
    </div>
  );
}

/** Extract id from /sales/credit-note/pdf/:id (ignores query string) */
function matchCreditNotePdf(location: string): string | null {
  const m = location.replace(/\?.*$/, "").match(/^\/sales\/credit-note\/pdf\/([^/]+)$/);
  return m ? m[1] : null;
}

/** Extract token from /share/credit-note/:token (ignores query string) */
function matchCreditNoteShare(location: string): string | null {
  const m = location.replace(/\?.*$/, "").match(/^\/share\/credit-note\/([^/]+)$/);
  return m ? m[1] : null;
}

/** Extract token from /share/wht-cert/:token (ignores query string) */
function matchWhtCertShare(location: string): string | null {
  const m = location.replace(/\?.*$/, "").match(/^\/share\/wht-cert\/([^/]+)$/);
  return m ? m[1] : null;
}

/** Extract token from /share/billing-note/:token (ignores query string) */
function matchBillingNoteShare(location: string): string | null {
  const m = location.replace(/\?.*$/, "").match(/^\/share\/billing-note\/([^/]+)$/);
  return m ? m[1] : null;
}

// [exchange-rate] Exact match for /settings/exchange-rate
function matchExchangeRate(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/settings/exchange-rate";
}

// [inventory-triggers] Exact match for /settings/inventory-triggers
function matchInventoryTriggers(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/settings/inventory-triggers";
}

// [mfg-form] Manufacturing order form matchers
function matchMfgOrdersForm(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/orders/form";
}
function matchMfgOrdersFormEdit(location: string): string | null {
  const m = location.replace(/\?.*$/, "").match(/^\/manufacturing\/orders\/form\/(\d+)$/);
  return m ? m[1] : null;
}

// [mfg-bom] BOM form route matchers
function matchMfgBomNew(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/bom/new";
}
function matchMfgBomEdit(location: string): string | null {
  const m = location.replace(/\?.*$/, "").match(/^\/manufacturing\/bom\/edit\/(\d+)$/);
  return m ? m[1] : null;
}

// [mes] MES route matchers
function matchMesWorkOrders(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/mes/work-orders";
}
function matchMesUnitDetail(location: string): string | null {
  const m = location.replace(/\?.*$/, "").match(/^\/manufacturing\/mes\/work-orders\/(\d+)$/);
  return m ? m[1] : null;
}
function matchMesScan(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/mes/scan";
}

// [material-issue] Material issue route matchers — inventory prefix
function matchMaterialIssueList(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/inventory/material-issues";
}
function matchMaterialIssueForm(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/inventory/material-issue/form";
}
function matchMaterialIssueFormEdit(location: string): string | null {
  const m = location.replace(/\?.*$/, "").match(/^\/inventory\/material-issue\/form\/(\d+)$/);
  return m ? m[1] : null;
}
function matchEmployeeQR(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/inventory/employee-qr";
}
function matchHrEmployeeQR(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/hr/employee-qr";
}
// [material-issue] Manufacturing-prefix routes (same components, ManufacturingLayout sidebar)
function matchMfgMaterialIssueList(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/material-issues";
}
function matchMfgMaterialIssueForm(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/material-issue/form";
}
function matchMfgMaterialIssueFormEdit(location: string): string | null {
  const m = location.replace(/\?.*$/, "").match(/^\/manufacturing\/material-issue\/form\/(\d+)$/);
  return m ? m[1] : null;
}
function matchMfgEmployeeQR(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/employee-qr";
}

// [production-finish] route matchers
function matchProductionFinishList(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/production-finish";
}
function matchProductionFinishForm(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/production-finish/form";
}
function matchProductionFinishFormEdit(location: string): number | null {
  const m = location.replace(/\?.*$/, "").match(/^\/manufacturing\/production-finish\/form\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

// [process-scan] Process Scan Station matcher
function matchProcessScan(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/process-scan";
}

// [ncr] route matchers
function matchNcrList(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/ncr";
}
function matchNcrForm(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/manufacturing/ncr/form";
}
function matchNcrFormEdit(location: string): number | null {
  const m = location.replace(/\?.*$/, "").match(/^\/manufacturing\/ncr\/form\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

export default function AppExtra() {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  const isEmployee =
    !loading &&
    user &&
    ((user as any).role === "employee" || (user as any).role === "cashier");

  const onAttendance =
    location === "/hr/attendance" ||
    location.startsWith("/hr/attendance?") ||
    location.startsWith("/hr/attendance/");

  const { data: roleData } = useQuery<{ modules: string[] }>({
    queryKey: ["/api/my-role-modules"],
    queryFn: async () => {
      const r = await fetch("/api/my-role-modules", { credentials: "include" });
      if (!r.ok) return { modules: [] };
      return r.json();
    },
    enabled: !!isEmployee && onAttendance,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isEmployee || !onAttendance || !roleData) return;
    const flagKey = `app-extra-redirected-${(user as any).id}`;
    if (sessionStorage.getItem(flagKey)) return;
    const modules = roleData.modules ?? [];
    const nonHrModules = modules.filter((m: string) => m !== "hr" && m !== "settings");
    if (nonHrModules.length > 0) {
      sessionStorage.setItem(flagKey, "1");
      setLocation("/module-select");
    }
  }, [isEmployee, onAttendance, roleData, user, setLocation]);

  const pdfId = matchCreditNotePdf(location);
  const shareToken = matchCreditNoteShare(location);
  const whtShareToken = matchWhtCertShare(location);
  const bnShareToken = matchBillingNoteShare(location);
  const isExchangeRate = matchExchangeRate(location);
  const isInventoryTriggers = matchInventoryTriggers(location);
  const isMfgOrdersForm = matchMfgOrdersForm(location);
  const mfgOrdersFormEditId = matchMfgOrdersFormEdit(location);
  const isMfgBomNew = matchMfgBomNew(location);
  const mfgBomEditId = matchMfgBomEdit(location);
  const isMesWorkOrders = matchMesWorkOrders(location);
  const mesUnitDetailId = matchMesUnitDetail(location);
  const isMesScan = matchMesScan(location);
  const isMaterialIssueList = matchMaterialIssueList(location);
  const isMaterialIssueForm = matchMaterialIssueForm(location);
  const materialIssueFormEditId = matchMaterialIssueFormEdit(location);
  const isEmployeeQR = matchEmployeeQR(location);
  const isHrEmployeeQR = matchHrEmployeeQR(location);
  const isMfgMaterialIssueList = matchMfgMaterialIssueList(location);
  const isMfgMaterialIssueForm = matchMfgMaterialIssueForm(location);
  const mfgMaterialIssueFormEditId = matchMfgMaterialIssueFormEdit(location);
  const isMfgEmployeeQR = matchMfgEmployeeQR(location);
  const isProductionFinishList = matchProductionFinishList(location);
  const isProductionFinishForm = matchProductionFinishForm(location);
  const productionFinishFormEditId = matchProductionFinishFormEdit(location);
  const isNcrList = matchNcrList(location);
  const isNcrForm = matchNcrForm(location);
  const ncrFormEditId = matchNcrFormEdit(location);
  const isProcessScan = matchProcessScan(location);

  if (pdfId) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <CreditNotePdf idProp={pdfId} />
        </Suspense>
      </FullPageOverlay>
    );
  }

  if (shareToken) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <CreditNoteShare tokenProp={shareToken} />
        </Suspense>
      </FullPageOverlay>
    );
  }

  if (whtShareToken) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <WhtCertShare tokenProp={whtShareToken} />
        </Suspense>
      </FullPageOverlay>
    );
  }

  if (bnShareToken) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <BillingNoteShare tokenProp={bnShareToken} />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [exchange-rate] Render exchange rate settings — platformMode=true uses PlatformLayout sidebar
  if (isExchangeRate) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ExchangeRateSettings platformMode={true} />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [inventory-triggers] Render inventory trigger settings — app-extra module required
  if (isInventoryTriggers) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <InventoryTriggersPage />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [mfg-form] Manufacturing order form — create new (inside ManufacturingLayout)
  if (isMfgOrdersForm) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingForm Wrapper={ManufacturingLayout as any} basePath="/manufacturing/orders" />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [mfg-form] Manufacturing order form — edit existing (inside ManufacturingLayout)
  if (mfgOrdersFormEditId) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingForm Wrapper={ManufacturingLayout as any} basePath="/manufacturing/orders" />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [mfg-bom] BOM form — create new (inside ManufacturingLayout)
  if (isMfgBomNew) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <BomFormPage Wrapper={ManufacturingLayout as any} basePath="/manufacturing/bom" />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [mfg-bom] BOM form — edit existing (inside ManufacturingLayout)
  if (mfgBomEditId) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <BomFormPage Wrapper={ManufacturingLayout as any} basePath="/manufacturing/bom" editIdProp={mfgBomEditId} />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [mes] MES Work Orders list
  if (isMesWorkOrders) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <MesWorkOrders />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [mes] MES Unit Detail / Work Order detail
  if (mesUnitDetailId) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <MesUnitDetail idProp={mesUnitDetailId} />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [mes] MES Scan Station — full-screen dark UI for workers
  if (isMesScan) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <MesScanStation />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [material-issue/mfg] ใบเบิกวัตถุดิบ — manufacturing sidebar (same components, /manufacturing prefix)
  if (isMfgMaterialIssueList) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <MaterialIssueList urlBase="/manufacturing" />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }
  if (isMfgMaterialIssueForm) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <MaterialIssueForm urlBase="/manufacturing" />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }
  if (mfgMaterialIssueFormEditId) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <MaterialIssueForm idProp={mfgMaterialIssueFormEditId} urlBase="/manufacturing" />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }
  if (isMfgEmployeeQR) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <EmployeeQRPage />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [material-issue] ใบเบิกวัตถุดิบ — list
  if (isMaterialIssueList) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <MaterialIssueList />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [material-issue] ใบเบิกวัตถุดิบ — new form
  if (isMaterialIssueForm) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <MaterialIssueForm />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [material-issue] ใบเบิกวัตถุดิบ — edit/view existing
  if (materialIssueFormEditId) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <MaterialIssueForm idProp={materialIssueFormEditId} />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [material-issue] QR บัตรพนักงาน
  if (isEmployeeQR) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <EmployeeQRPage />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [hr] QR บัตรพนักงาน (HR context)
  if (isHrEmployeeQR) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <EmployeeQRPage />
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [production-finish] ใบรับสินค้าสำเร็จรูป WIP→FG — list
  if (isProductionFinishList) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <ProductionFinishList urlBase="/manufacturing" />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [production-finish] สร้างใบรับ — new form
  if (isProductionFinishForm) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <ProductionFinishForm urlBase="/manufacturing" />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [production-finish] view/confirm existing receipt
  if (productionFinishFormEditId) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <ProductionFinishForm idProp={productionFinishFormEditId} urlBase="/manufacturing" />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [ncr] รายการ NCR — list
  if (isNcrList) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <NcrList urlBase="/manufacturing" />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [ncr] สร้าง NCR — new form
  if (isNcrForm) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <NcrForm urlBase="/manufacturing" />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [ncr] view/edit existing NCR
  if (ncrFormEditId) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingLayout>
            <NcrForm idProp={ncrFormEditId} urlBase="/manufacturing" />
          </ManufacturingLayout>
        </Suspense>
      </FullPageOverlay>
    );
  }

  // [process-scan] Process Scan Station — full-screen for workers
  if (isProcessScan) {
    return (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ProcessScanStation />
        </Suspense>
      </FullPageOverlay>
    );
  }

  return null;
}
