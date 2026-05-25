import { useLocation, Link } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useCompany } from "@/lib/company-context";
import { useQuery } from "@tanstack/react-query";
import {
  UserCircle, Users, Building2, FileText, Banknote,
  Palette, HardDrive, Receipt, Sliders, MessageCircle, GitBranch, Lock, Printer, Package, Warehouse, TrendingUp
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SettingsTab {
  label: string;
  href: string;
  icon: any;
  adminOnly: boolean;
  superAdminOnly?: boolean;
  requirePlan?: string;
}

const SETTINGS_TABS: SettingsTab[] = [
  { label: "โปรไฟล์", href: "/settings/profile", icon: UserCircle, adminOnly: false },
  { label: "สิทธิ์ผู้ใช้", href: "/settings/users", icon: Users, adminOnly: true },
  { label: "ข้อมูลบริษัท", href: "/settings/company-info", icon: Building2, adminOnly: true },
  { label: "แผนก/สาขา", href: "/settings/dept-branch", icon: GitBranch, adminOnly: true },
  { label: "เอกสาร", href: "/settings/document-templates", icon: FileText, adminOnly: true },
  { label: "วิธีรับ/จ่ายเงิน", href: "/settings/payment-methods", icon: Banknote, adminOnly: true },
  { label: "White Label", href: "/settings/white-label", icon: Palette, adminOnly: true, requirePlan: "hasWhiteLabel" },
  { label: "FTP Archive", href: "/settings/ftp-archive", icon: HardDrive, adminOnly: true },
  { label: "e-Tax Invoice", href: "/settings/etax", icon: Receipt, adminOnly: true },
  { label: "LINE", href: "/settings/line", icon: MessageCircle, adminOnly: true },
  { label: "ฟอร์มพิมพ์", href: "/settings/custom-forms", icon: Printer, adminOnly: true },
  { label: "ทั่วไป", href: "/settings/general", icon: Sliders, adminOnly: true },
  { label: "ทริกเกอร์สต๊อก", href: "/settings/inventory-triggers", icon: Warehouse, adminOnly: true },
  { label: "แพ็คเกจโมดูล", href: "/settings/module-pricing", icon: Package, adminOnly: true },
  { label: "อัตราแลกเปลี่ยน", href: "/settings/exchange-rate", icon: TrendingUp, adminOnly: true, superAdminOnly: true },
];

const ADMIN_ROLES = ["super_admin", "admin", "manager", "accountant"];

export default function SettingsTabs() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { selectedCompany } = useCompany();

  const { data: subInfo } = useQuery<any>({
    queryKey: ["/api/my-subscription-info"],
    staleTime: 60_000,
  });

  const plan = subInfo?.plan;
  const addons: any[] = subInfo?.addons || [];
  const isSuperAdmin = user?.role === "super_admin";

  const isAccountantOnPrimary =
    user?.role === "accountant" && (selectedCompany?.isPrimary ?? true);

  const visibleTabs = SETTINGS_TABS.filter((tab) => {
    if (tab.superAdminOnly) return isSuperAdmin;
    if (!tab.adminOnly) return true;
    if (isAccountantOnPrimary) return false;
    return ADMIN_ROLES.includes(user?.role || "");
  });

  return (
    <TooltipProvider delayDuration={200}>
      <div className="border-b bg-white dark:bg-slate-900 dark:border-slate-700 sticky top-0 z-10" data-testid="settings-tabs">
        <div className="max-w-6xl mx-auto px-6">
          <nav className="flex flex-wrap gap-1 py-1" data-testid="settings-tab-nav">
            {visibleTabs.map((tab) => {
              const isActive = location === tab.href;
              const Icon = tab.icon;

              const hasAddon = tab.requirePlan && addons.some((a: any) => a.featureFlag === tab.requirePlan);
              const isLocked = !isSuperAdmin && tab.requirePlan && plan && !plan[tab.requirePlan] && !hasAddon;

              if (isLocked) {
                return (
                  <Tooltip key={tab.href}>
                    <TooltipTrigger asChild>
                      <span
                        data-testid={`settings-tab-${tab.href.split("/").pop()}`}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-md whitespace-nowrap opacity-40 cursor-not-allowed select-none"
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {tab.label}
                        <Lock className="h-3 w-3 ml-0.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      ต้องอัปเกรดแพ็คเกจเพื่อใช้งานฟีเจอร์นี้
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  data-testid={`settings-tab-${tab.href.split("/").pop()}`}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm rounded-md whitespace-nowrap transition-colors",
                    isActive
                      ? "bg-[#fb9678]/10 dark:bg-[#fb9678]/20 text-[#fb9678] font-semibold border-b-2 border-[#fb9678]"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </TooltipProvider>
  );
}
