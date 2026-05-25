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
 *
 * NOTE (2026-05-22): Manufacturing routes added — MES, NCR, production-finish, material-issue,
 * process-scan, employee-qr pages now pushed to production repo (N12 batch 2026-05-22).
 */

import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import ManufacturingLayout from "@/components/manufacturing-layout";
import { BranchSelectPortal } from "@/contexts/branch-select-context";

const CreditNotePdf = lazy(() => import("@/pages/sales/credit-note-pdf"));
const CreditNoteShare = lazy(() => import("@/pages/sales/credit-note-share"));
const WhtCertShare = lazy(() => import("@/pages/purchases/wht-cert-share"));
const BillingNoteShare = lazy(() => import("@/pages/finance/billing-note-share"));
// [exchange-rate] /settings/exchange-rate — super_admin BOT API key management
// Cannot be added to App.tsx (production source of truth). Registered here.
const ExchangeRateSettings = lazy(() => import("@/pages/settings/exchange-rate-settings"));
// [inventory-triggers] /settings/inventory-triggers — app-extra module required
const InventoryTriggersPage = lazy(() => import("@/pages/settings/inventory-triggers"));

// [mfg-form] Manufacturing order form inside ManufacturingLayout
// /manufacturing/orders/form and /manufacturing/orders/form/:id
const ManufacturingForm = lazy(() => import("@/pages/inventory/manufacturing-form"));

// [mfg-bom] BOM form inside ManufacturingLayout
// /manufacturing/bom/new and /manufacturing/bom/edit/:id
const BomFormPage = lazy(() => import("@/pages/inventory/bom-form"));

// [platform-email-config] SMTP config — platform super_admin only (app-extra bypass)
const PlatformEmailConfig = lazy(() => import("@/pages/platform/email-config"));

// [N12] Manufacturing routes — pushed to production 2026-05-22
const MesWorkOrders      = lazy(() => import("@/pages/manufacturing/mes-work-orders"));
const MesUnitDetail      = lazy(() => import("@/pages/manufacturing/mes-unit-detail"));
const MesScanStation     = lazy(() => import("@/pages/manufacturing/mes-scan-station"));
const ProcessScanStation = lazy(() => import("@/pages/manufacturing/process-scan-station"));
const NcrList            = lazy(() => import("@/pages/manufacturing/ncr-list"));
const NcrForm            = lazy(() => import("@/pages/manufacturing/ncr-form"));
const ProductionFinishList = lazy(() => import("@/pages/manufacturing/production-finish-list"));
const ProductionFinishForm = lazy(() => import("@/pages/manufacturing/production-finish-form"));
const MaterialIssueList  = lazy(() => import("@/pages/inventory/material-issue-list"));
const MaterialIssueForm  = lazy(() => import("@/pages/inventory/material-issue-form"));
const EmployeeQr         = lazy(() => import("@/pages/inventory/employee-qr"));

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

// [platform-email-config] /platform/email-config — super_admin SMTP settings
function matchPlatformEmailConfig(location: string): boolean {
  return location.replace(/\?.*$/, "") === "/platform/email-config";
}

// [N12] Manufacturing route matchers
function matchMesWorkOrders(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/mes-work-orders"; }
function matchMesUnitDetail(l: string): string | null { const m = l.replace(/\?.*$/, "").match(/^\/manufacturing\/mes\/(\d+)$/); return m ? m[1] : null; }
function matchMesScanStation(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/mes-scan"; }
function matchProcessScanStation(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/process-scan"; }
function matchNcrList(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/ncr"; }
function matchNcrFormNew(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/ncr/form"; }
function matchNcrFormEdit(l: string): string | null { const m = l.replace(/\?.*$/, "").match(/^\/manufacturing\/ncr\/form\/(\d+)$/); return m ? m[1] : null; }
function matchProductionFinishList(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/production-finish"; }
function matchProductionFinishFormNew(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/production-finish/form"; }
function matchProductionFinishFormEdit(l: string): string | null { const m = l.replace(/\?.*$/, "").match(/^\/manufacturing\/production-finish\/form\/(\d+)$/); return m ? m[1] : null; }
function matchMaterialIssueList(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/material-issues"; }
function matchMaterialIssueFormNew(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/material-issues/form"; }
function matchMaterialIssueFormEdit(l: string): string | null { const m = l.replace(/\?.*$/, "").match(/^\/manufacturing\/material-issues\/form\/(\d+)$/); return m ? m[1] : null; }
function matchEmployeeQr(l: string): boolean { return l.replace(/\?.*$/, "") === "/manufacturing/employee-qr"; }

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
  const isPlatformEmailConfig = matchPlatformEmailConfig(location);
  // [N12]
  const isMesWorkOrders = matchMesWorkOrders(location);
  const mesUnitDetailId = matchMesUnitDetail(location);
  const isMesScanStation = matchMesScanStation(location);
  const isProcessScanStation = matchProcessScanStation(location);
  const isNcrList = matchNcrList(location);
  const isNcrFormNew = matchNcrFormNew(location);
  const ncrFormEditId = matchNcrFormEdit(location);
  const isProductionFinishList = matchProductionFinishList(location);
  const isProductionFinishFormNew = matchProductionFinishFormNew(location);
  const productionFinishFormEditId = matchProductionFinishFormEdit(location);
  const isMaterialIssueList = matchMaterialIssueList(location);
  const isMaterialIssueFormNew = matchMaterialIssueFormNew(location);
  const materialIssueFormEditId = matchMaterialIssueFormEdit(location);
  const isEmployeeQr = matchEmployeeQr(location);

  // Determine overlay content based on current route
  let overlay: React.ReactNode = null;

  if (pdfId) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <CreditNotePdf idProp={pdfId} />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (shareToken) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <CreditNoteShare tokenProp={shareToken} />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (whtShareToken) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <WhtCertShare tokenProp={whtShareToken} />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (bnShareToken) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <BillingNoteShare tokenProp={bnShareToken} />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (isExchangeRate) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ExchangeRateSettings platformMode={true} />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (isInventoryTriggers) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <InventoryTriggersPage />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (isMfgOrdersForm) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingForm Wrapper={ManufacturingLayout as any} basePath="/manufacturing/orders" />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (mfgOrdersFormEditId) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <ManufacturingForm Wrapper={ManufacturingLayout as any} basePath="/manufacturing/orders" />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (isMfgBomNew) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <BomFormPage Wrapper={ManufacturingLayout as any} basePath="/manufacturing/bom" />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (mfgBomEditId) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <BomFormPage Wrapper={ManufacturingLayout as any} basePath="/manufacturing/bom" editIdProp={mfgBomEditId} />
        </Suspense>
      </FullPageOverlay>
    );
  } else if (isPlatformEmailConfig) {
    overlay = (
      <FullPageOverlay>
        <Suspense fallback={null}>
          <PlatformEmailConfig />
        </Suspense>
      </FullPageOverlay>
    );
  // [N12] Manufacturing routes
  } else if (isMesWorkOrders) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><MesWorkOrders /></Suspense></FullPageOverlay>);
  } else if (mesUnitDetailId) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><MesUnitDetail idProp={mesUnitDetailId} /></Suspense></FullPageOverlay>);
  } else if (isMesScanStation) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><MesScanStation /></Suspense></FullPageOverlay>);
  } else if (isProcessScanStation) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><ProcessScanStation /></Suspense></FullPageOverlay>);
  } else if (isNcrList) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><NcrList /></Suspense></FullPageOverlay>);
  } else if (isNcrFormNew) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><NcrForm /></Suspense></FullPageOverlay>);
  } else if (ncrFormEditId) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><NcrForm idProp={ncrFormEditId} /></Suspense></FullPageOverlay>);
  } else if (isProductionFinishList) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><ProductionFinishList /></Suspense></FullPageOverlay>);
  } else if (isProductionFinishFormNew) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><ProductionFinishForm /></Suspense></FullPageOverlay>);
  } else if (productionFinishFormEditId) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><ProductionFinishForm idProp={productionFinishFormEditId} /></Suspense></FullPageOverlay>);
  } else if (isMaterialIssueList) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><MaterialIssueList /></Suspense></FullPageOverlay>);
  } else if (isMaterialIssueFormNew) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><MaterialIssueForm /></Suspense></FullPageOverlay>);
  } else if (materialIssueFormEditId) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><MaterialIssueForm idProp={materialIssueFormEditId} /></Suspense></FullPageOverlay>);
  } else if (isEmployeeQr) {
    overlay = (<FullPageOverlay><Suspense fallback={null}><EmployeeQr /></Suspense></FullPageOverlay>);
  }

  // [branch-select] BranchSelectPortal always mounts (portal renders into document.body)
  // regardless of which route is active — overlay only shows when a special route matches
  return (
    <>
      <BranchSelectPortal />
      {overlay}
    </>
  );
}
