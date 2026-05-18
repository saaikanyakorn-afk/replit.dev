import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { NAV_ITEMS } from "@/lib/mock-data";
import BreakReminder from "@/components/break-reminder";
import DevMenu from "@/components/dev-menu";
import PageLoader from "@/components/page-loader";
import { useAuth } from "@/lib/auth";
import { useCompany } from "@/lib/company-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn, objectPathToUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { NAV_KEY_MAP, SUB_MODULES } from "@shared/permissions";
import { HIDDEN_MENUS_BY_BUSINESS_TYPE } from "@shared/accounting-formulas";
import { LANGUAGES, type SupportedLanguage } from "@shared/i18n";
import { useTranslation } from "@/hooks/use-translation";
import { translateLabel } from "@/i18n/nav-map";
import { 
  Building2, 
  ChevronDown, 
  ChevronRight,
  Search, 
  Bell, 
  UserCircle,
  LogOut,
  Star,
  Globe,
  Menu,
  X,
  Monitor,
  Package,
  RotateCcw,
  Calendar,
  CalendarDays,
  ShoppingCart,
  RefreshCw,
  CheckCheck,
  Crown,
  ArrowUpRight,
  AlertTriangle,
  Clock,
  ClipboardList,
  Truck,
  UtensilsCrossed,
  Shield,
  ArrowDown,
  LayoutGrid,
  BookOpen,
  CreditCard,
  BarChart3,
  Warehouse,
  Users2,
  FileText,
  Settings,
  Calculator,
  Zap,
  Lock,
  ClipboardCheck,
  Palette,
  Moon,
  Sun,
  BrainCircuit,
  MessageCircle,
  Inbox,
  FolderOpen,
  DatabaseZap,
  HardHat,
  Fuel,
  Factory,
  Archive,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useThemeColor } from "@/hooks/use-theme-color";


export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, loading: authLoading, logout } = useAuth();
  const { toast } = useToast();
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const [openSubGroups, setOpenSubGroups] = useState<string[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<any>(null);
  const sidebarNavRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();

  const { theme, toggle: toggleTheme, colors: themeColors, mode, toggleMode, isDark } = useThemeColor();
  const { companies, selectedCompanyId, selectedCompany, setSelectedCompanyId, isAccountingFirm } = useCompany();
  const [companySwitching, setCompanySwitching] = useState(false);
  const prevCompanyIdRef = useRef(selectedCompanyId);

  const maintenanceQuery = useQuery<{ enabled: boolean; message?: string; scheduledAt?: string | null; scheduledEnd?: string | null; cloneInProgress?: boolean }>({
    queryKey: ["/api/maintenance/status"],
    queryFn: async () => {
      const r = await fetch("/api/maintenance/status", { credentials: "include" });
      if (!r.ok) return { enabled: false };
      return r.json();
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      if (d?.enabled) return 30000;
      if (d?.scheduledAt) {
        const msUntil = new Date(d.scheduledAt).getTime() - Date.now();
        if (msUntil < 3600000) return 60000;
        return 1800000;
      }
      return 3600000;
    },
    staleTime: 120000,
  });
  const maintenanceData = maintenanceQuery.data;
  const isUnderMaintenance = maintenanceData?.enabled === true;

  const [cancelledAlerts, setCancelledAlerts] = useState<Array<{ id: number; scheduledAt: string; message: string; cancelledByCloneUser: string; cancelledAt: string }>>([]);
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  useEffect(() => {
    if (!user || alertsDismissed) return;
    fetch("/api/maintenance/cancelled-alerts", { credentials: "include" })
      .then(r => r.json())
      .then(data => { if (data.alerts?.length > 0) setCancelledAlerts(data.alerts); })
      .catch(() => {});
  }, [user, alertsDismissed]);

  const dismissCancelledAlerts = async () => {
    const ids = cancelledAlerts.map(a => a.id);
    await fetch("/api/maintenance/cancelled-alerts/dismiss", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    setCancelledAlerts([]);
    setAlertsDismissed(true);
  };

  const isSuperAdmin = (user as any)?.role === "super_admin";
  const [cloneIncompleteAlert, setCloneIncompleteAlert] = useState<any>(null);
  const [cloneAlertDismissed, setCloneAlertDismissed] = useState(false);
  const [switchingBack, setSwitchingBack] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin || cloneAlertDismissed) return;
    const checkAlert = () => {
      fetch("/api/platform/clone-incomplete-alert", { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          if (data.hasIncomplete) setCloneIncompleteAlert(data);
          else setCloneIncompleteAlert(null);
        })
        .catch(() => {});
    };
    checkAlert();
    const interval = setInterval(checkAlert, 300000);
    return () => clearInterval(interval);
  }, [isSuperAdmin, cloneAlertDismissed]);

  const handleSwitchBack = async () => {
    setSwitchingBack(true);
    try {
      const r = await fetch("/api/platform/clone-switch-back", { method: "POST", credentials: "include" });
      const data = await r.json();
      if (r.ok) {
        setCloneIncompleteAlert(null);
        alert(data.message || "สลับฐานข้อมูลกลับเรียบร้อย");
      } else {
        alert(data.message || "เกิดข้อผิดพลาด");
      }
    } catch { alert("เกิดข้อผิดพลาดในการเชื่อมต่อ"); }
    setSwitchingBack(false);
  };

  const handleDismissIncomplete = async () => {
    await fetch("/api/platform/clone-dismiss-incomplete", {
      method: "POST", credentials: "include",
    }).catch(() => {});
    setCloneIncompleteAlert(null);
    setCloneAlertDismissed(true);
  };

  useEffect(() => {
    if (selectedCompanyId != null && location !== "/login") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("companyId") !== String(selectedCompanyId)) {
        params.set("companyId", String(selectedCompanyId));
        window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
      }
    }
  }, [location, selectedCompanyId]);

  useEffect(() => {
    if (prevCompanyIdRef.current !== selectedCompanyId && prevCompanyIdRef.current !== null) {
      setCompanySwitching(true);
    }
    prevCompanyIdRef.current = selectedCompanyId;
  }, [selectedCompanyId]);

  const setPrimaryMutation = useMutation({
    mutationFn: async (companyId: number) => {
      const r = await fetch(`/api/companies/${companyId}/set-primary`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
    },
  });

  const [globalSearch, setGlobalSearch] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const globalSearchRef = useRef<HTMLDivElement>(null);
  const globalInputRef = useRef<HTMLInputElement>(null);
  const [appsMenuOpen, setAppsMenuOpen] = useState(false);
  const appsMenuRef = useRef<HTMLDivElement>(null);
  const appsBtnRef = useRef<HTMLDivElement>(null);

  const { t, lang } = useTranslation();
  const [currentLang, setCurrentLang] = useState(() => localStorage.getItem("app-language") || "th");
  const [companySearch, setCompanySearch] = useState("");
  const [companyPopoverOpen, setCompanyPopoverOpen] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(true);
  const hasPrimary = companies.some((c: any) => c.isPrimary);
  const filteredCompanies = companies.filter((c: any) => {
    const matchSearch = c.name.toLowerCase().includes(companySearch.toLowerCase());
    if (companySearch) return matchSearch;
    if (!showAllCompanies && hasPrimary) return c.isPrimary && matchSearch;
    return matchSearch;
  });

  const toggleMenu = (label: string, el?: HTMLElement | null) => {
    setOpenMenus(prev => 
      prev.includes(label) ? [] : [label]
    );
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: "nearest", behavior: "auto" });
      });
    }
  };

  const toggleSubGroup = (key: string) => {
    setOpenSubGroups(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  useEffect(() => {
    if (!authLoading && !user) setLocation("/login");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    setMobileMenuOpen(false);
    const matchItem = NAV_ITEMS.find(item => {
      if (!item.children || item.children.length === 0) return false;
      return item.children.some(c => location === c.href || (c.href !== "/" && location.startsWith(c.href + "/")));
    });
    if (matchItem) {
      setOpenMenus([matchItem.label]);
      const activeChild = matchItem.children?.find((c: any) => location === c.href || (c.href !== "/" && location.startsWith(c.href + "/")));
      if (activeChild?.group) {
        const sgKey = `${matchItem.label}::${activeChild.group}`;
        setOpenSubGroups(prev => prev.includes(sgKey) ? prev : [...prev, sgKey]);
      }
    } else {
      setOpenMenus([]);
    }
  }, [location]);

  const hasInventoryAccess = !!myPermissions?.modules.includes("inventory");

  const { data: productLotsData } = useQuery<any[]>({
    queryKey: ["/api/product-lots", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const r = await fetch(`/api/product-lots?companyId=${selectedCompanyId}`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!user && !!selectedCompanyId && hasInventoryAccess,
    refetchInterval: 300000,
    staleTime: 120000,
  });

  const { data: generalSettings } = useQuery<{ lotLowStockThreshold?: number }>({
    queryKey: ["/api/settings/general", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return {};
      const r = await fetch(`/api/settings/general?companyId=${selectedCompanyId}`, { credentials: "include" });
      return r.ok ? r.json() : {};
    },
    enabled: !!user && !!selectedCompanyId && hasInventoryAccess,
    staleTime: 300000,
  });

  const lowStockLotCount = useMemo(() => {
    if (!productLotsData) return 0;
    const threshold = generalSettings?.lotLowStockThreshold ?? 10;
    return productLotsData.filter((l: any) => {
      const qty = Number(l.quantity);
      if (qty <= 0) return false;
      const productThreshold = l.productLowStockThreshold ?? 0;
      const effectiveThreshold = productThreshold > 0 ? productThreshold : threshold;
      return qty < effectiveThreshold;
    }).length;
  }, [productLotsData, generalSettings]);

  const { data: approvalData } = useQuery<{ totalPending: number }>({
    queryKey: ["/api/approval-center", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/approval-center?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return { totalPending: 0 };
      return r.json();
    },
    enabled: !!user && !!selectedCompanyId,
    refetchInterval: 900000,
    staleTime: 300000,
  });

  const { data: clientUploadData } = useQuery<{ totalUnread: number }>({
    queryKey: ["/api/client-upload-links/unread-count", selectedCompanyId],
    queryFn: async () => {
      const params = selectedCompanyId ? `?companyId=${selectedCompanyId}` : "";
      const r = await fetch(`/api/client-upload-links/unread-count${params}`, { credentials: "include" });
      if (!r.ok) return { totalUnread: 0 };
      return r.json();
    },
    enabled: !!user && !!selectedCompanyId,
    refetchInterval: 1800000,
    staleTime: 600000,
  });

  const { data: lineDocUnread } = useQuery<{ unreadCount: number }>({
    queryKey: ["/api/line-documents/unread-count", selectedCompanyId],
    queryFn: async () => {
      const params = selectedCompanyId ? `?companyId=${selectedCompanyId}` : "";
      const r = await fetch(`/api/line-documents/unread-count${params}`, { credentials: "include" });
      if (!r.ok) return { unreadCount: 0 };
      return r.json();
    },
    enabled: !!user && !!selectedCompanyId,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: myPermissions, isFetching: permFetching, isLoading: permLoading } = useQuery<{ modules: string[]; subModules: string[] }>({
    queryKey: ["/api/permissions/me", user?.id, selectedCompanyId],
    queryFn: async () => {
      const params = selectedCompanyId ? `?companyId=${selectedCompanyId}` : "";
      const r = await fetch(`/api/permissions/me${params}`, { credentials: "include" });
      if (!r.ok) return { modules: [], subModules: [] };
      const data = await r.json();
      if (Array.isArray(data)) return { modules: data, subModules: [] };
      return { modules: Array.isArray(data.modules) ? data.modules : [], subModules: Array.isArray(data.subModules) ? data.subModules : [] };
    },
    enabled: !!user,
    staleTime: 0,
  });

  useEffect(() => {
    if (companySwitching && !permFetching && myPermissions) {
      setCompanySwitching(false);
    }
  }, [companySwitching, permFetching, myPermissions]);

  const businessType = selectedCompany?.businessType || "mixed";
  const hiddenMenusByBiz = HIDDEN_MENUS_BY_BUSINESS_TYPE[businessType] || [];
  const isPrimaryCompany = selectedCompany?.isPrimary === true;

  const PRIMARY_COMPANY_HIDDEN_MENUS = ["/hr/commission-rules", "/hr/commission"];

  const MANAGER_HIDDEN_MODULES = ["firm-mgmt", "etax-hub"];

  const { coreNavItems: filteredNavItems, addonNavItems, activeAddonModule } = useMemo(() => {
    if (!user || !myPermissions || myPermissions.modules.length === 0) return { coreNavItems: [], addonNavItems: [], activeAddonModule: null as any };
    const effectiveModules = user.role === "manager"
      ? myPermissions.modules.filter((m: string) => !MANAGER_HIDDEN_MODULES.includes(m))
      : myPermissions.modules;
    const allFiltered = NAV_ITEMS.map(item => {
      const moduleKey = NAV_KEY_MAP[item.href];
      if (moduleKey && !effectiveModules.includes(moduleKey)) return null;

      if (item.children && item.children.length > 0) {
        const filteredChildren = item.children.filter(child => {
          if (hiddenMenusByBiz.includes(child.href)) return false;
          if (isPrimaryCompany && PRIMARY_COMPANY_HIDDEN_MENUS.includes(child.href)) return false;
          if (!selectedCompany?.vatRegistered && ["/sales/tax-invoice", "/sales/etax-sent"].includes(child.href)) return false;
          if (myPermissions.subModules) {
            const subMod = SUB_MODULES.find(s => s.href === child.href);
            if (subMod && !myPermissions.subModules.includes(subMod.key)) return false;
          }
          return true;
        });
        if (filteredChildren.length === 0) return null;
        return { ...item, children: filteredChildren };
      }

      return item;
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    const coreNavItems = allFiltered.filter((item: any) => !item.isAddon);
    const addonNavItems = allFiltered.filter((item: any) => item.isAddon);
    const activeAddonModule = addonNavItems.find((item: any) => {
      if (location === item.href) return true;
      if (item.href !== "/" && location.startsWith(item.href.split("/").slice(0, 2).join("/") + "/")) return true;
      return item.children?.some((c: any) => location === c.href || (c.href !== "/" && location.startsWith(c.href + "/")));
    }) || null;
    return { coreNavItems, addonNavItems, activeAddonModule };
  }, [user, myPermissions, hiddenMenusByBiz, isPrimaryCompany, location, selectedCompany?.vatRegistered]);

  const globalSearchResults = useMemo(() => {
    if (!globalSearch.trim()) return [];
    const q = globalSearch.toLowerCase();
    const results: { label: string; href: string; parent?: string }[] = [];
    const allItems = [...filteredNavItems, ...addonNavItems];
    for (const item of allItems) {
      if (item.label.toLowerCase().includes(q)) {
        results.push({ label: item.label, href: item.href });
      }
      if (item.children) {
        for (const child of item.children) {
          if (child.label.toLowerCase().includes(q)) {
            results.push({ label: child.label, href: child.href, parent: item.label });
          }
        }
      }
    }
    return results.slice(0, 10);
  }, [globalSearch, filteredNavItems, addonNavItems]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (globalSearchRef.current && !globalSearchRef.current.contains(e.target as Node)) {
        setGlobalSearchOpen(false);
      }
      if (appsMenuRef.current && !appsMenuRef.current.contains(e.target as Node) && appsBtnRef.current && !appsBtnRef.current.contains(e.target as Node)) {
        setAppsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setGlobalSearchOpen(true);
        setTimeout(() => globalInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setGlobalSearchOpen(false); setAppsMenuOpen(false); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const allItems = [...filteredNavItems, ...addonNavItems];
    const menuToOpen = allItems.find(item => 
      item.children?.some(c => location === c.href || (c.href !== "/" && location.startsWith(c.href + "/")))
    );
    if (menuToOpen) {
      setOpenMenus([menuToOpen.label]);
    }
  }, [location]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!sidebarNavRef.current) return;
      const allActive = sidebarNavRef.current.querySelectorAll('[data-sidebar-active="true"]');
      const activeEl = allActive[allActive.length - 1] as HTMLElement | null;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest", behavior: "auto" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [location]);

  if (authLoading) return <PageLoader />;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-background flex font-sans">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          data-testid="mobile-menu-overlay"
        />
      )}

      <aside className={cn(
        "w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col fixed z-[60] shadow-sm print:!hidden transition-transform duration-200",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )} style={{ top: "var(--dev-bar-h, 0px)", height: "calc(100vh - var(--dev-bar-h, 0px))" }}>
        <div className="flex items-center px-4 border-b border-sidebar-border shrink-0 relative overflow-hidden" style={{ background: "var(--theme-primary)", height: "68px" }}>
          <Link href="/" className="flex items-center group cursor-pointer flex-1 justify-center relative z-10">
            <img src="/etax-logo-white.png" alt="E-Tax Center" className="h-9 w-auto opacity-95 group-hover:opacity-100 transition-opacity" data-testid="img-sidebar-logo" />
          </Link>
          <button
            className="lg:hidden ml-2 p-1 rounded hover:bg-white/20 text-white relative z-10"
            onClick={() => setMobileMenuOpen(false)}
            data-testid="button-close-mobile-menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 shrink-0">
          {!isAccountingFirm ? (
            <div 
              className="w-full flex items-center gap-2 px-3 py-2 bg-sidebar-accent/50 border border-sidebar-border rounded-md text-sidebar-foreground text-sm"
              data-testid="text-company-name"
            >
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="truncate font-medium">{selectedCompany?.name || "บริษัทของฉัน"}</span>
            </div>
          ) : (
          <Popover open={companyPopoverOpen} onOpenChange={(open) => { setCompanyPopoverOpen(open); if (!open) { setCompanySearch(""); setShowAllCompanies(true); } }}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-between bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                data-testid="button-company-switcher"
              >
                <div className="flex items-center gap-2 truncate">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span className="truncate">{selectedCompany?.name || t("header.switchCompany")}</span>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 bg-sidebar border-sidebar-border z-[70]" align="start">
              <div className="p-2 border-b border-sidebar-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-sidebar-foreground/50" />
                  <Input
                    data-testid="input-company-search"
                    placeholder="ค้นหาบริษัท..."
                    value={companySearch}
                    onChange={e => setCompanySearch(e.target.value)}
                    className="pl-8 h-8 text-sm bg-sidebar-accent/50 border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40"
                  />
                </div>
              </div>
              <div className="max-h-60 overflow-y-auto p-1">
                {filteredCompanies.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-sidebar-foreground/50">ไม่พบบริษัท</div>
                ) : (
                  filteredCompanies.map((company: any) => (
                    <div
                      key={company.id}
                      className={cn(
                        "flex items-center gap-1 px-3 py-2 text-sm rounded-md cursor-pointer transition-colors group",
                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground",
                        selectedCompanyId === company.id && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      )}
                      data-testid={`menu-company-${company.id}`}
                    >
                      <button
                        className="flex-1 text-left truncate"
                        onClick={() => {
                          if (selectedCompanyId === company.id) {
                            setCompanyPopoverOpen(false);
                            setCompanySearch("");
                            return;
                          }
                          setCompanyPopoverOpen(false);
                          setCompanySearch("");
                          setSwitchTarget(company);
                        }}
                        data-testid={`button-select-company-${company.id}`}
                      >
                        {company.name}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setPrimaryMutation.mutate(company.id); }}
                        className={cn(
                          "shrink-0 p-0.5 rounded transition-colors",
                          company.isPrimary
                            ? "text-amber-400"
                            : "text-sidebar-foreground/30 hover:text-amber-400"
                        )}
                        title={company.isPrimary ? "บริษัทหลัก (สำนักงาน)" : "ตั้งเป็นบริษัทหลัก"}
                        data-testid={`button-set-primary-${company.id}`}
                      >
                        <Star className={cn("h-3.5 w-3.5", company.isPrimary && "fill-amber-400")} />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-sidebar-border px-3 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold text-white" style={{ background: filteredCompanies.length === companies.length ? "#579bfc" : "#fec90f" }}>{filteredCompanies.length}/{companies.length}</span>
                  <span className="text-[10px] text-sidebar-foreground/40">บริษัท</span>
                </div>
                {hasPrimary && !companySearch && (
                  <button
                    onClick={() => setShowAllCompanies(prev => !prev)}
                    className="text-[10px] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                    data-testid="button-toggle-all-companies"
                  >
                    {showAllCompanies ? "⭐ เฉพาะติดดาว" : "แสดงทั้งหมด"}
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
          )}
        </div>

        <nav ref={sidebarNavRef} className="flex-1 overflow-y-auto px-2 space-y-1 pb-4 min-h-0">
          {filteredNavItems.length === 0 && !myPermissions && (
            <div className="space-y-1 animate-pulse px-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                  <div className="h-4 w-4 bg-sidebar-accent/40 rounded" />
                  <div className="h-3.5 bg-sidebar-accent/40 rounded" style={{ width: `${60 + (i % 3) * 20}%` }} />
                </div>
              ))}
            </div>
          )}
          {filteredNavItems.map((item) => {
            const isActive = location === item.href || (item.href === "/settings/profile" && location.startsWith("/settings/"));
            const hasChildren = item.children && item.children.length > 0;
            const isOpen = openMenus.includes(item.label);

            if (hasChildren) {
              const isChildActive = item.children?.some(c => location === c.href || (c.href !== "/" && location.startsWith(c.href + "/"))) || false;
              const navigateOnClick = ["/ecommerce/dashboard", "/pos/sessions", "/settings/profile"].includes(item.href);
              return (
                <Collapsible 
                  key={item.label} 
                  open={isOpen} 
                  onOpenChange={() => {}}
                >
                  <CollapsibleTrigger asChild>
                    <button onClick={(e) => { toggleMenu(item.label, e.currentTarget); if (navigateOnClick) setLocation(item.href); }} className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-all group",
                      isChildActive ? "text-white shadow-md" : isOpen ? "shadow-sm font-semibold" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    style={{ fontSize: "15px", ...(isChildActive ? { background: "var(--theme-primary)" } : isOpen ? { color: "var(--theme-primary)", background: "color-mix(in srgb, var(--theme-primary) 12%, transparent)" } : {}) }}
                    data-sidebar-active={isChildActive ? "true" : undefined}
>
                      <div className="flex items-center gap-3">
                        <item.icon className="h-4 w-4" />
                        {translateLabel(item.label, t)}
                      </div>
                      <ChevronRight className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-0.5 pl-7 pr-2 mt-1">
                    {(() => {
                      const hasGroups = item.children?.some((c: any) => c.group);
                      if (!hasGroups) {
                        return item.children?.map((child: any) => {
                          const isChildLink = location === child.href || (child.href !== "/" && location.startsWith(child.href + "/"));
                          const showLowStockBadge = child.href === "/inventory/lots" && lowStockLotCount > 0;
                          return (
                            <div key={child.label}>
                              <Link href={child.href}>
                                <span className={cn(
                                  "flex items-center gap-2 py-1.5 px-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer",
                                  isChildLink ? "font-semibold" : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
                                )}
                                data-sidebar-active={isChildLink ? "true" : undefined}
                                style={isChildLink ? { color: "var(--theme-primary)", background: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" } : undefined}>
                                  {child.icon && <child.icon className="h-3 w-3" />}
                                  {translateLabel(child.label, t)}
                                  {showLowStockBadge && (
                                    <span data-testid="badge-low-stock-lots" className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white leading-none">{lowStockLotCount}</span>
                                  )}
                                </span>
                              </Link>
                            </div>
                          );
                        });
                      }
                      const groups: { name: string; items: any[] }[] = [];
                      item.children?.forEach((child: any) => {
                        const gName = child.group || "";
                        let g = groups.find(x => x.name === gName);
                        if (!g) { g = { name: gName, items: [] }; groups.push(g); }
                        g.items.push(child);
                      });
                      return groups.map((g) => {
                        if (!g.name) {
                          return g.items.map((child: any) => {
                            const isChildLink = location === child.href || (child.href !== "/" && location.startsWith(child.href + "/"));
                            const showLowStockBadge = child.href === "/inventory/lots" && lowStockLotCount > 0;
                            return (
                              <div key={child.label}>
                                <Link href={child.href}>
                                  <span className={cn("flex items-center gap-2 py-1.5 px-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer", isChildLink ? "font-semibold" : "text-sidebar-foreground/50 hover:text-sidebar-foreground")}
                                  data-sidebar-active={isChildLink ? "true" : undefined}
                                  style={isChildLink ? { color: "var(--theme-primary)", background: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" } : undefined}>
                                    {child.icon && <child.icon className="h-3 w-3" />}
                                    {translateLabel(child.label, t)}
                                    {showLowStockBadge && (
                                      <span data-testid="badge-low-stock-lots" className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white leading-none">{lowStockLotCount}</span>
                                    )}
                                  </span>
                                </Link>
                              </div>
                            );
                          });
                        }
                        const sgKey = `${item.label}::${g.name}`;
                        const sgHasActive = g.items.some((c: any) => location === c.href || (c.href !== "/" && location.startsWith(c.href + "/")));
                        const sgOpen = openSubGroups.includes(sgKey) || sgHasActive;
                        return (
                          <div key={g.name}>
                            <button
                              className={cn(
                                "w-full flex items-center justify-between py-1.5 text-sm font-semibold transition-colors rounded px-1 hover:bg-sidebar-accent/50",
                                sgHasActive ? "" : "text-sidebar-foreground/60"
                              )}
                              style={sgHasActive ? { color: "var(--theme-primary)" } : undefined}
                              onClick={() => toggleSubGroup(sgKey)}
                            >
                              <span>{g.name}</span>
                              <ChevronRight className={cn("h-3 w-3 transition-transform", sgOpen && "rotate-90")} />
                            </button>
                            {sgOpen && (
                              <div className="space-y-0.5 pl-3 mt-0.5">
                                {g.items.map((child: any) => {
                                  const isChildLink = location === child.href || (child.href !== "/" && location.startsWith(child.href + "/"));
                                  const showLowStockBadge = child.href === "/inventory/lots" && lowStockLotCount > 0;
                                  return (
                                    <div key={child.label}>
                                      <Link href={child.href}>
                                        <span className={cn("flex items-center gap-2 py-1 px-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer", isChildLink ? "font-semibold" : "text-sidebar-foreground/50 hover:text-sidebar-foreground")}
                                        data-sidebar-active={isChildLink ? "true" : undefined}
                                        style={isChildLink ? { color: "var(--theme-primary)", background: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" } : undefined}>
                                          {child.icon && <child.icon className="h-3 w-3" />}
                                          {translateLabel(child.label, t)}
                                          {showLowStockBadge && (
                                            <span data-testid="badge-low-stock-lots" className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white leading-none">{lowStockLotCount}</span>
                                          )}
                                        </span>
                                      </Link>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </CollapsibleContent>
                </Collapsible>
              );
            }

            return (
              <Link key={item.href} href={item.href}>
                <span className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all cursor-pointer",
                  isActive 
                    ? "text-white shadow-md" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
                data-sidebar-active={isActive ? "true" : undefined}
                style={{ fontSize: "15px", ...(isActive ? { background: "var(--theme-primary)" } : {}) }}>
                  <item.icon className="h-4 w-4" />
                  {translateLabel(item.label, t)}
                </span>
              </Link>
            );
          })}

          {activeAddonModule && (
            <>
              <div className="mx-3 my-2 border-t border-sidebar-border" />
              <div className="px-2 mb-1">
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">โมดูลเสริม</span>
              </div>
              {(() => {
                const addonItem = activeAddonModule as any;
                const addonChildren = addonItem.children || [];
                const addonIsOpen = openMenus.includes(addonItem.label);
                const addonChildActive = addonChildren.some((c: any) => location === c.href || (c.href !== "/" && location.startsWith(c.href + "/"))) || location === addonItem.href || (addonItem.href !== "/" && location.startsWith(addonItem.href.split("/").slice(0, 2).join("/") + "/"));

                if (addonChildren.length === 0) {
                  return (
                    <Link href={addonItem.href}>
                      <span className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-all cursor-pointer",
                        addonChildActive ? "text-white shadow-md" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                      style={{ fontSize: "15px", ...(addonChildActive ? { background: "var(--theme-primary)" } : {}) }}>
                        <addonItem.icon className="h-4 w-4" />
                        {translateLabel(addonItem.label, t)}
                        <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}>Add-on</span>
                      </span>
                    </Link>
                  );
                }

                return (
                  <Collapsible open={addonIsOpen || addonChildActive} onOpenChange={() => {}}>
                    <CollapsibleTrigger asChild>
                      <button onClick={(e) => { toggleMenu(addonItem.label, e.currentTarget); }} className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-medium transition-all group",
                        addonChildActive ? "text-white shadow-md" : addonIsOpen ? "shadow-sm font-semibold" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                      style={{ fontSize: "15px", ...(addonChildActive ? { background: "var(--theme-primary)" } : addonIsOpen ? { color: "var(--theme-primary)", background: "color-mix(in srgb, var(--theme-primary) 12%, transparent)" } : {}) }}>
                        <div className="flex items-center gap-3">
                          <addonItem.icon className="h-4 w-4" />
                          {translateLabel(addonItem.label, t)}
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={addonChildActive ? { background: "rgba(255,255,255,0.25)", color: "#fff" } : { background: "color-mix(in srgb, var(--theme-primary) 15%, transparent)", color: "var(--theme-primary)" }}>Add-on</span>
                          <ChevronRight className={cn("h-3 w-3 transition-transform", (addonIsOpen || addonChildActive) && "rotate-90")} />
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-0.5 pl-7 pr-2 mt-1">
                      {(() => {
                        const hasGroups = addonChildren.some((c: any) => c.group);
                        if (!hasGroups) {
                          return addonChildren.map((child: any) => {
                            const isChildLink = location === child.href || (child.href !== "/" && location.startsWith(child.href + "/"));
                            return (
                              <div key={child.label}>
                                <Link href={child.href}>
                                  <span className={cn(
                                    "flex items-center gap-2 py-1.5 px-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer",
                                    isChildLink ? "font-semibold" : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
                                  )}
                                  data-sidebar-active={isChildLink ? "true" : undefined}
                                  style={isChildLink ? { color: "var(--theme-primary)", background: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" } : undefined}>
                                    {child.icon && <child.icon className="h-3 w-3" />}
                                    {translateLabel(child.label, t)}
                                  </span>
                                </Link>
                              </div>
                            );
                          });
                        }
                        const groups: { name: string; items: any[] }[] = [];
                        addonChildren.forEach((child: any) => {
                          const gName = child.group || "";
                          let g = groups.find((x: any) => x.name === gName);
                          if (!g) { g = { name: gName, items: [] }; groups.push(g); }
                          g.items.push(child);
                        });
                        return groups.map((g) => {
                          if (!g.name) {
                            return g.items.map((child: any) => {
                              const isChildLink = location === child.href || (child.href !== "/" && location.startsWith(child.href + "/"));
                              return (
                                <div key={child.label}>
                                  <Link href={child.href}>
                                    <span className={cn("flex items-center gap-2 py-1.5 px-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer", isChildLink ? "font-semibold" : "text-sidebar-foreground/50 hover:text-sidebar-foreground")}
                                    data-sidebar-active={isChildLink ? "true" : undefined}
                                    style={isChildLink ? { color: "var(--theme-primary)", background: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" } : undefined}>
                                      {child.icon && <child.icon className="h-3 w-3" />}
                                      {translateLabel(child.label, t)}
                                    </span>
                                  </Link>
                                </div>
                              );
                            });
                          }
                          const sgKey = `${addonItem.label}::${g.name}`;
                          const sgHasActive = g.items.some((c: any) => location === c.href || (c.href !== "/" && location.startsWith(c.href + "/")));
                          const sgOpen = openSubGroups.includes(sgKey) || sgHasActive;
                          return (
                            <div key={g.name}>
                              <button
                                className={cn(
                                  "w-full flex items-center justify-between py-1.5 text-sm font-semibold transition-colors rounded px-1 hover:bg-sidebar-accent/50",
                                  sgHasActive ? "" : "text-sidebar-foreground/60"
                                )}
                                style={sgHasActive ? { color: "var(--theme-primary)" } : undefined}
                                onClick={() => toggleSubGroup(sgKey)}
                              >
                                <span>{g.name}</span>
                                <ChevronRight className={cn("h-3 w-3 transition-transform", sgOpen && "rotate-90")} />
                              </button>
                              {sgOpen && (
                                <div className="space-y-0.5 pl-3 mt-0.5">
                                  {g.items.map((child: any) => {
                                    const isChildLink = location === child.href || (child.href !== "/" && location.startsWith(child.href + "/"));
                                    return (
                                      <div key={child.label}>
                                        <Link href={child.href}>
                                          <span className={cn("flex items-center gap-2 py-1 px-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer", isChildLink ? "font-semibold" : "text-sidebar-foreground/50 hover:text-sidebar-foreground")}
                                          data-sidebar-active={isChildLink ? "true" : undefined}
                                          style={isChildLink ? { color: "var(--theme-primary)", background: "color-mix(in srgb, var(--theme-primary) 15%, transparent)" } : undefined}>
                                            {child.icon && <child.icon className="h-3 w-3" />}
                                            {translateLabel(child.label, t)}
                                          </span>
                                        </Link>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })()}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <Link href="/settings/profile" className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity" data-testid="link-user-avatar" title={t("header.profile")}>
              <div className="h-10 w-10 rounded-full flex items-center justify-center overflow-hidden" style={{ background: "var(--theme-primary)" }}>
                {user.avatarUrl ? (
                  <img src={objectPathToUrl(user.avatarUrl) || user.avatarUrl} alt="" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).nextElementSibling as any).style.removeProperty("display"); }} />
                ) : null}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" style={user.avatarUrl ? { display: "none" } : {}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
            </Link>
            <Link href="/settings/profile" className="flex-1 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity" data-testid="link-user-profile" title={t("header.profile")}>
              <p className="text-sm font-semibold truncate" data-testid="text-user-name">{user.fullName}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{user.role === "admin" ? (lang === "en" ? "Admin" : lang.startsWith("zh") ? "管理员" : "ผู้ดูแลระบบ") : user.role}</p>
            </Link>
            <button
              onClick={logout}
              className="flexy-icon-btn flexy-icon-btn-error h-8 w-8 shrink-0"
              data-testid="button-logout"
              title={t("header.logout")}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 lg:ml-64 flex flex-col min-h-screen overflow-x-hidden print:!ml-0">
        {!import.meta.env.PROD && <DevMenu />}
        {user?.subscription?.status === "trial" && !user?.subscription?.trialExpired && user?.subscription?.daysRemaining != null && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm print:!hidden" data-testid="banner-trial">
            <span className="text-amber-700">
              ทดลองใช้ฟรีเหลืออีก <strong>{user.subscription.daysRemaining} วัน</strong>
            </span>
            <Link href="/choose-plan" className="ml-3 text-xs font-medium hover:underline" style={{ color: "var(--theme-primary)" }} data-testid="link-upgrade">
              เลือกแพ็คเกจ →
            </Link>
          </div>
        )}
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 sticky top-0 z-30 print:!hidden shadow-sm relative">
          <div className="flex items-center gap-2 md:gap-4 flex-1 md:w-1/3">
            <button
              className="lg:hidden p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
              onClick={() => setMobileMenuOpen(true)}
              data-testid="button-open-mobile-menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative w-full max-w-sm hidden sm:block" ref={globalSearchRef}>
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 z-10" />
              <Input 
                ref={globalInputRef}
                type="search" 
                placeholder={t("header.searchPlaceholder")} 
                value={globalSearch}
                onChange={(e) => { setGlobalSearch(e.target.value); setGlobalSearchOpen(true); }}
                onFocus={() => { if (globalSearch.trim()) setGlobalSearchOpen(true); }}
                className="pl-10 h-10 bg-gray-50 border-gray-200 rounded-full focus-visible:bg-white focus-visible:ring-1 text-sm" style={{ "--tw-ring-color": "var(--theme-primary)" } as any}
                data-testid="input-search"
              />
              {globalSearchOpen && globalSearch.trim() && (
                <div className="absolute top-12 left-0 right-0 bg-card rounded-xl shadow-xl border border-border overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  {globalSearchResults.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-400">ไม่พบเมนูที่ค้นหา</div>
                  ) : (
                    <div className="py-1 max-h-80 overflow-y-auto">
                      {globalSearchResults.map((item, idx) => (
                        <button
                          key={idx}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors group hover:bg-[var(--theme-primary-light)]"
                          data-testid={`search-result-${idx}`}
                          onClick={() => {
                            setLocation(item.href);
                            setGlobalSearch("");
                            setGlobalSearchOpen(false);
                          }}
                        >
                          <ChevronRight className="h-3.5 w-3.5 text-gray-300 transition-colors group-hover:[color:var(--theme-primary)]" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate group-hover:[color:var(--theme-primary)]">{translateLabel(item.label, t)}</p>
                            {item.parent && <p className="text-xs text-gray-400 truncate">{translateLabel(item.parent, t)}</p>}
                          </div>
                          <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div ref={appsBtnRef}>
              <button
                onClick={() => setAppsMenuOpen(!appsMenuOpen)}
                className="hidden sm:flex h-10 px-4 rounded-full items-center gap-2 transition-all hover:shadow-md"
                style={{
                  background: appsMenuOpen ? "#ea580c" : "var(--theme-primary)",
                  color: "#fff",
                }}
                data-testid="btn-apps-menu"
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="text-sm font-semibold">{t("header.apps")}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", appsMenuOpen && "rotate-180")} />
              </button>
            </div>

            {myPermissions?.modules?.includes("pos") && myPermissions?.subModules?.includes("pos/sessions") && (
              <button
                onClick={() => setLocation("/pos/terminal")}
                className="hidden sm:flex h-10 px-3 rounded-full items-center gap-2 transition-all hover:shadow-md"
                style={{ 
                  background: theme === "aqua" ? "#fb9678" : "#03c9d7",
                  color: "#fff",
                }}
                data-testid="btn-pos-shortcut"
                title="เปิด POS ขายหน้าร้าน"
              >
                <Monitor className="h-4 w-4" />
                <span className="text-sm font-semibold hidden lg:inline">POS</span>
              </button>
            )}
            {myPermissions?.modules?.includes("hr") && myPermissions?.subModules?.includes("hr/attendance") && (
              <button
                onClick={() => setLocation("/hr/attendance")}
                className="flex h-10 w-10 sm:w-auto sm:px-3 rounded-full items-center justify-center sm:justify-start gap-0 sm:gap-2 transition-all hover:shadow-md"
                style={{
                  background: "#fec90f",
                  color: "#fff",
                }}
                data-testid="btn-checkin-shortcut"
                title="เช็คอิน / เช็คเอาท์"
              >
                <Clock className="h-4 w-4" />
                <span className="text-sm font-semibold hidden lg:inline">เช็คอิน</span>
              </button>
            )}
            {myPermissions?.modules?.includes("firm-mgmt") && (() => {
              const totalUnread = (clientUploadData?.totalUnread ?? 0) + (lineDocUnread?.unreadCount ?? 0);
              return (
              <button
                onClick={() => setLocation("/firm-mgmt/documents")}
                className="relative h-10 w-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--theme-primary-light)]"
                style={{ color: "var(--theme-primary)" }}
                data-testid="btn-client-uploads"
                title="คลังเอกสาร"
              >
                <Inbox className="h-5 w-5" />
                {totalUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[#06C755] text-white text-[10px] font-bold flex items-center justify-center px-1 animate-pulse" data-testid="badge-doc-unread">
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </span>
                )}
              </button>
              );
            })()}
            {myPermissions?.modules?.includes("settings") && (
              <button
                onClick={() => setLocation("/approval-center")}
                className="relative h-10 w-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--theme-primary-light)]"
                style={{ color: "var(--theme-primary)" }}
                data-testid="btn-approval-center"
                title="ศูนย์อนุมัติ"
              >
                <ClipboardCheck className="h-5 w-5" />
                {(approvalData?.totalPending ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 animate-pulse" data-testid="badge-approval-count">
                    {(approvalData?.totalPending ?? 0) > 99 ? "99+" : approvalData?.totalPending}
                  </span>
                )}
              </button>
            )}
            {myPermissions?.modules?.includes("settings") && (
              <SubscriptionNavButton />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-10 rounded-full flex items-center justify-center gap-1 px-2 transition-colors hover:bg-[var(--theme-primary-light)]"
                  style={{ color: "var(--theme-primary)" }}
                  data-testid="button-language-switcher"
                >
                  <Globe className="h-5 w-5" />
                  <span className="text-base leading-none">{LANGUAGES.find(l => l.key === currentLang)?.flag || "🇹🇭"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px] rounded-xl shadow-lg border-gray-100">
                <DropdownMenuLabel className="text-xs text-muted-foreground">เปลี่ยนภาษา</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {LANGUAGES.map((lang) => (
                  <DropdownMenuItem
                    key={lang.key}
                    className="flex items-center gap-3 cursor-pointer rounded-lg"
                    data-testid={`button-lang-${lang.key}`}
                    onClick={() => {
                      localStorage.setItem("app-language", lang.key);
                      setCurrentLang(lang.key);
                      window.dispatchEvent(new CustomEvent("language-change", { detail: lang.key }));
                    }}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span className="text-sm font-medium">{lang.label}</span>
                    {currentLang === lang.key && (
                      <span className="ml-auto text-xs" style={{ color: "var(--theme-primary)" }}>&#10003;</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <NotificationBell companyId={selectedCompanyId} />
            <button
              onClick={toggleMode}
              className="h-10 w-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--theme-primary-light)]"
              style={{ color: "var(--theme-primary)" }}
              data-testid="btn-dark-mode-toggle"
              title={isDark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด"}
            >
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={toggleTheme}
              className="h-10 w-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--theme-primary-light)]"
              style={{ color: "var(--theme-primary)" }}
              data-testid="btn-theme-toggle"
              title={theme === "orange" ? "เปลี่ยนเป็นธีมฟ้า" : "เปลี่ยนเป็นธีมส้ม"}
            >
              <Palette className="h-5 w-5" />
            </button>
          </div>

          {appsMenuOpen && (
            <div ref={appsMenuRef} className="absolute left-2 right-2 top-[calc(100%+4px)] bg-card rounded-2xl shadow-2xl border border-border z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden" style={{ maxWidth: "1020px" }} data-testid="apps-mega-menu">
              <div className="flex flex-col md:flex-row">
                <div className="flex-1 p-4 md:p-5 overflow-y-auto" style={{ maxHeight: "480px" }}>
                  {(() => {
                    const mods = myPermissions?.modules || [];
                    const subs = myPermissions?.subModules || [];
                    const hasModule = (m: string) => mods.includes(m);
                    const hasSubAccess = (href: string, moduleKey?: string) => {
                      const subMod = SUB_MODULES.find(s => s.href === href);
                      if (subMod) return subs.includes(subMod.key);
                      if (moduleKey) {
                        const moduleSubs = SUB_MODULES.filter(s => s.parentModule === moduleKey);
                        if (moduleSubs.length > 0 && moduleSubs.every(s => !subs.includes(s.key))) return false;
                      }
                      return true;
                    };
                    const coreApps: { icon: any; label: string; desc: string; href: string; iconBg: string; iconColor: string; newTab?: boolean; module?: string }[] = [
                      { icon: ClipboardList, label: "สถานะงาน", desc: "ติดตามงานของทีม", href: "/firm-mgmt/workflow", iconBg: "bg-cyan-100", iconColor: "text-cyan-700", newTab: true, module: "firm-mgmt" },
                      { icon: MessageCircle, label: "แชทภายใน", desc: "สนทนาภายในองค์กร", href: "/office/chat", iconBg: "bg-pink-100", iconColor: "text-pink-600" },
                      { icon: CalendarDays, label: "ปฏิทินสำนักงาน", desc: "กิจกรรม นัดหมาย กำหนดภาษี", href: "/office/calendar", iconBg: "bg-yellow-100", iconColor: "text-yellow-700" },
                      { icon: BarChart3, label: "รายงาน", desc: "รายงานทั่วไป", href: "/reports/general", iconBg: "bg-blue-100", iconColor: "text-blue-700", module: "reports" },
                      { icon: Calculator, label: "Tax Tools", desc: "งบการเงินส่งราชการ ดึงใบเสร็จ", href: "/tax-tools/financial-statements", iconBg: "bg-indigo-100", iconColor: "text-indigo-700", module: "accounting" },
                      { icon: FileText, label: "การขาย", desc: "ใบเสนอราคา แจ้งหนี้ ใบเสร็จ", href: "/sales/quote", iconBg: "bg-amber-100", iconColor: "text-amber-700", module: "sales" },
                      { icon: Package, label: "การซื้อ", desc: "ขอซื้อ สั่งซื้อ ค่าใช้จ่าย", href: "/purchases/pr", iconBg: "bg-violet-100", iconColor: "text-violet-700", module: "purchases" },
                      { icon: CalendarDays, label: "ปฏิทินครบกำหนดชำระ", desc: "รับ-จ่ายเงิน เช็ค ปฏิทินชำระ", href: "/finance/due-calendar", iconBg: "bg-pink-100", iconColor: "text-pink-700", module: "finance" },
                      { icon: Warehouse, label: "คลังสินค้า", desc: "สต๊อก รับเข้า-เบิก", href: "/inventory/list", iconBg: "bg-lime-100", iconColor: "text-lime-700", module: "inventory" },
                      { icon: FolderOpen, label: "คลังเอกสาร", desc: "รับเอกสาร จัดเก็บไฟล์", href: "/firm-mgmt/documents", iconBg: "bg-rose-100", iconColor: "text-rose-600", module: "firm-mgmt" },
                    ];
                    const addonApps: { icon: any; label: string; desc: string; href: string; iconBg: string; iconColor: string; module?: string }[] = [
                      { icon: Globe, label: "E-Commerce Hub", desc: "จัดการร้านค้าออนไลน์", href: "/ecommerce/dashboard", iconBg: "bg-orange-100", iconColor: "text-orange-600", module: "ecommerce" },
                      { icon: BrainCircuit, label: "Commerce Intelligence", desc: "วิเคราะห์ธุรกิจ eCommerce", href: "/ci/executive", iconBg: "bg-purple-100", iconColor: "text-purple-700", module: "commerce-intelligence" },
                      { icon: Monitor, label: "POS ขายหน้าร้าน", desc: "ขายหน้าร้าน กะขาย", href: "/pos/sessions", iconBg: "bg-cyan-100", iconColor: "text-cyan-600", module: "pos" },
                      { icon: HardHat, label: "ต้นทุนงาน", desc: "บริหารโปรเจค ต้นทุน", href: "/job-costing", iconBg: "bg-amber-100", iconColor: "text-amber-700", module: "job-costing" },
                      { icon: Fuel, label: "ปั๊มน้ำมัน", desc: "ยอดขาย สต็อก ภาษีท้องถิ่น", href: "/gas-station/dashboard", iconBg: "bg-emerald-100", iconColor: "text-emerald-700", module: "gas-station" },
                      { icon: Truck, label: "Delivery Hub", desc: "จัดส่งพัสดุ ติดตามสถานะ", href: "/delivery/dashboard", iconBg: "bg-sky-100", iconColor: "text-sky-700", module: "ecommerce" },
                      { icon: ClipboardCheck, label: "ศูนย์รับสินค้า", desc: "GPS + ลายเซ็นรับ ทุกโมดูล", href: "/delivery-hub", iconBg: "bg-green-100", iconColor: "text-green-700", module: "inventory" },
                      { icon: UtensilsCrossed, label: "POS ร้านอาหาร", desc: "จัดการโต๊ะ ออเดอร์", href: "/restaurant-pos", iconBg: "bg-teal-100", iconColor: "text-teal-700", module: "pos" },
                      { icon: UtensilsCrossed, label: "Food Delivery", desc: "บริการส่งอาหาร", href: "/food-delivery/dashboard", iconBg: "bg-emerald-100", iconColor: "text-emerald-700", module: "pos" },
                      { icon: Factory, label: "ระบบผลิต", desc: "BOM Serial Traceability ISO", href: "/manufacturing/dashboard", iconBg: "bg-teal-100", iconColor: "text-teal-700", module: "manufacturing" },
                    ];
                    const renderAppButton = (app: typeof coreApps[0], isAddon = false) => {
                      const IconComp = app.icon;
                      const allowed = (!app.module || hasModule(app.module)) && hasSubAccess(app.href, app.module);
                      return (
                        <button
                          key={app.href}
                          className={cn("flex items-center gap-3 p-3 rounded-xl transition-colors group text-left", allowed ? "hover:bg-gray-50 cursor-pointer" : "opacity-50 cursor-not-allowed")}
                          data-testid={`app-link-${app.label}`}
                          onClick={() => {
                            if (!allowed) {
                              toast({ title: t("toast.noPermission"), description: app.label, variant: "destructive" });
                              return;
                            }
                            if ((app as any).newTab) { window.open(app.href, "_blank"); } else { setLocation(app.href); }
                            setAppsMenuOpen(false);
                          }}
                        >
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", app.iconBg)}>
                            <IconComp className={cn("h-5 w-5", app.iconColor)} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={cn("text-sm font-semibold transition-colors flex items-center gap-1", allowed ? "text-gray-800 group-hover:[color:var(--theme-primary)]" : "text-gray-400")}>
                              {translateLabel(app.label, t)}
                              {(app as any).newTab && <ArrowUpRight className="h-3 w-3 opacity-50" />}
                              {isAddon && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-gradient-to-r from-amber-400 to-orange-400 text-white ml-1">Add-on</span>}
                              {!allowed && <Lock className="h-3 w-3 ml-1 text-gray-400" />}
                            </p>
                            <p className="text-xs text-gray-400 truncate">{app.desc}</p>
                          </div>
                        </button>
                      );
                    };
                    return (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                          {coreApps.map((app) => renderAppButton(app))}
                        </div>
                        {addonApps.length > 0 && (
                          <>
                            <div className="flex items-center gap-2 mt-4 mb-2 px-1">
                              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">โมดูลเสริม</span>
                              <div className="flex-1 border-t border-gray-200" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                              {addonApps.map((app) => renderAppButton(app, true))}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>

                <div className="w-full md:w-48 bg-gray-50 border-t md:border-t-0 md:border-l border-gray-100 p-4">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{t("header.quickLinks")}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-1 gap-0">
                    {(() => {
                      const mods = myPermissions?.modules || [];
                      const subs = myPermissions?.subModules || [];
                      const hasSubAccess2 = (href: string, moduleKey: string) => {
                        if (!subs.length) return true;
                        const subMod = SUB_MODULES.find(s => s.href === href);
                        if (subMod) return subs.includes(subMod.key);
                        const moduleSubs = SUB_MODULES.filter(s => s.parentModule === moduleKey);
                        if (moduleSubs.length > 0 && moduleSubs.every(s => !subs.includes(s.key))) return false;
                        return true;
                      };
                      const links = [
                        { label: "ลูกค้าสำนักงาน", href: "/firm-mgmt/dashboard", module: "firm-mgmt" },
                        { label: "รับลูกค้าใหม่", href: "/settings/firm-link", module: "firm-mgmt" },
                        { label: "มอบหมายงาน", href: "/firm-mgmt/assignments", module: "firm-mgmt" },
                        { label: "รายชื่อคู่ค้า", href: "/contacts/list", module: "contacts" },
                        { label: "สมุดรายวัน", href: "/journal", module: "accounting" },
                        { label: "รายงาน", href: "/reports/general", module: "accounting" },
                        { label: "พนักงาน", href: "/hr/employees", module: "hr" },
                        { label: "QR บัตรพนักงาน", href: "/hr/employee-qr", module: "hr" },
                        { label: "ผู้ใช้ & สิทธิ์", href: "/settings/users", module: "settings" },
                        { label: "ตั้งค่าอนุมัติ", href: "/settings/approval", module: "settings" },
                        { label: "ตั้งค่าระบบ", href: "/settings/general", module: "settings" },
                      ];
                      return links.map((link) => {
                        const allowed = mods.includes(link.module) && hasSubAccess2(link.href, link.module);
                        return (
                          <button
                            key={link.href}
                            className={cn("w-full text-left text-sm py-1.5 px-2 rounded-lg transition-colors truncate", allowed ? "text-gray-600 hover:[color:var(--theme-primary)] hover:bg-white cursor-pointer" : "text-gray-300 cursor-not-allowed")}
                            data-testid={`quick-link-${link.label}`}
                            onClick={() => {
                              if (!allowed) {
                                toast({ title: t("toast.noPermission"), description: link.label, variant: "destructive" });
                                return;
                              }
                              setLocation(link.href); setAppsMenuOpen(false);
                            }}
                          >
                            {translateLabel(link.label, t)}
                            {!allowed && " 🔒"}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </header>
        
        {(user as any)?.impersonating && (
          <ImpersonationBanner originalUser={(user as any)?.originalUser} />
        )}
        <div className="flex-1 p-4 w-full animate-in fade-in duration-500 print:!p-0 overflow-x-hidden">
          {isUnderMaintenance && !location.startsWith("/platform") ? (
            <div className="flex flex-col items-center justify-center py-32" data-testid="maintenance-overlay">
              <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mb-5">
                <AlertTriangle className="h-10 w-10 text-amber-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">ระบบอยู่ระหว่างการปรับปรุง</h2>
              <p className="text-sm text-gray-500 mb-3">{maintenanceData?.message || "กรุณารอสักครู่ ระบบจะกลับมาให้บริการเร็วๆ นี้"}</p>
              {maintenanceData?.cloneInProgress && (
                <p className="text-xs text-amber-600 font-medium mb-3">กำลัง Clone ข้อมูล กรุณารอจนกว่าจะเสร็จ</p>
              )}
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                <span>ระบบจะกลับมาอัตโนมัติ</span>
              </div>
            </div>
          ) : (companySwitching || permLoading) ? (
            <div className="flex flex-col items-center justify-center py-32" data-testid="content-loader">
              <img src="/etax-icon.png" alt="E-Tax Center" className="h-16 w-auto mb-5 animate-pulse" />
              <div className="relative">
                <div className="w-9 h-9 rounded-full border-[3px] border-gray-200" />
                <div className="absolute inset-0 w-9 h-9 rounded-full border-[3px] border-transparent animate-spin" style={{ borderTopColor: "var(--theme-primary)" }} />
              </div>
              <p className="mt-3 text-sm text-gray-400">กำลังโหลด...</p>
            </div>
          ) : children}
        </div>
      </main>
      <BreakReminder />

      {cancelledAlerts.length > 0 && (
        <div className="fixed inset-0 z-[10001] bg-black/50 flex items-center justify-center" data-testid="cancelled-schedule-alert">
          <div className="bg-card rounded-2xl p-6 shadow-2xl max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-800">แจ้งเตือน: ตารางปรับปรุงถูกยกเลิก</h3>
            </div>
            <div className="space-y-3 mb-5">
              {cancelledAlerts.map(alert => (
                <div key={alert.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-gray-700">
                    ตารางปรับปรุงที่คุณจองไว้เวลา <span className="font-semibold">{new Date(alert.scheduledAt).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" })}</span> ถูกยกเลิกเนื่องจาก Clone Database
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ดำเนินการโดย: {alert.cancelledByCloneUser} เมื่อ {new Date(alert.cancelledAt).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" })}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-4">หากต้องการปรับปรุงระบบ กรุณาจองตารางใหม่</p>
            <button
              onClick={dismissCancelledAlerts}
              className="w-full py-2 px-4 rounded-lg text-white font-medium"
              style={{ background: "var(--theme-primary)" }}
              data-testid="btn-dismiss-cancelled-alert"
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}

      {cloneIncompleteAlert && isSuperAdmin && (
        <div className="fixed inset-0 z-[10002] bg-black/60 flex items-center justify-center" data-testid="clone-incomplete-alert">
          <div className="bg-card rounded-2xl p-6 shadow-2xl max-w-lg mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cloneIncompleteAlert.halfBakedOnActiveDb ? "bg-red-100" : "bg-amber-100"}`}>
                <DatabaseZap className={`h-5 w-5 ${cloneIncompleteAlert.halfBakedOnActiveDb ? "text-red-500" : "text-amber-500"}`} />
              </div>
              <h3 className={`text-lg font-bold ${cloneIncompleteAlert.halfBakedOnActiveDb ? "text-red-700" : "text-gray-800"}`}>
                {cloneIncompleteAlert.halfBakedOnActiveDb
                  ? "Clone Database ไม่สมบูรณ์ (วิกฤต!)"
                  : "Clone Database ไม่สมบูรณ์"}
              </h3>
            </div>

            {cloneIncompleteAlert.halfBakedOnActiveDb && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-3 mb-4">
                <p className="text-sm font-semibold text-red-700">
                  ฐานข้อมูลที่ Clone ไปเป็นตัวที่ระบบใช้งานอยู่!
                </p>
                <p className="text-xs text-red-600 mt-1">
                  ระบบถูกล็อกอยู่ ต้องสลับฐานข้อมูลกลับไปต้นทางก่อนเปิดใช้งาน
                </p>
              </div>
            )}

            <div className="bg-gray-50 border rounded-lg p-3 mb-4">
              <p className="text-sm text-gray-700">
                ตาราง {cloneIncompleteAlert.totalFailed} จาก {cloneIncompleteAlert.totalTables} ตารางมีปัญหา
              </p>
              {cloneIncompleteAlert.lastError && (
                <p className="text-xs text-gray-500 mt-1">
                  ข้อผิดพลาดล่าสุด: {cloneIncompleteAlert.lastError.tableName} — {cloneIncompleteAlert.lastError.errorMessage?.slice(0, 100)}
                </p>
              )}
              {cloneIncompleteAlert.failedTables?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-1">ตารางที่มีปัญหา:</p>
                  <div className="flex flex-wrap gap-1">
                    {cloneIncompleteAlert.failedTables.slice(0, 10).map((t: string) => (
                      <span key={t} className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">{t}</span>
                    ))}
                    {cloneIncompleteAlert.failedTables.length > 10 && (
                      <span className="text-xs text-gray-500">+{cloneIncompleteAlert.failedTables.length - 10} อื่นๆ</span>
                    )}
                  </div>
                </div>
              )}
              {cloneIncompleteAlert.maintenanceLocked && (
                <p className="text-xs text-amber-600 mt-2 font-semibold">ระบบอยู่ในโหมดปรับปรุง (ล็อก)</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {cloneIncompleteAlert.halfBakedOnActiveDb && (
                <button
                  onClick={handleSwitchBack}
                  disabled={switchingBack}
                  className="w-full py-2 px-4 rounded-lg text-white font-medium bg-red-500 hover:bg-red-600 disabled:opacity-50"
                  data-testid="btn-clone-switch-back"
                >
                  {switchingBack ? "กำลังสลับ..." : "สลับฐานข้อมูลกลับไปต้นทาง (USA)"}
                </button>
              )}
              <button
                onClick={() => { setCloneIncompleteAlert(null); window.location.href = "/platform/clone-data"; }}
                className="w-full py-2 px-4 rounded-lg text-white font-medium"
                style={{ background: "var(--theme-primary)" }}
                data-testid="btn-goto-clone-screen"
              >
                ไปหน้า Clone Database
              </button>
              {!cloneIncompleteAlert.halfBakedOnActiveDb && (
                <button
                  onClick={handleDismissIncomplete}
                  className="w-full py-2 px-4 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50"
                  data-testid="btn-dismiss-clone-incomplete"
                >
                  รับทราบ (ปิดแจ้งเตือน)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {switchTarget && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center" data-testid="company-switch-dialog">
          <div className="bg-card rounded-2xl p-6 shadow-2xl max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--theme-primary) 10%, transparent)" }}>
                <Building2 className="h-5 w-5" style={{ color: "var(--theme-primary)" }} />
              </div>
              <h3 className="text-lg font-bold text-gray-800">{t("header.switchCompany")}</h3>
            </div>
            <div className="space-y-3 mb-6">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">{lang === "en" ? "From company" : lang.startsWith("zh") ? "从公司" : "จากบริษัท"}</p>
                <p className="text-sm font-medium text-gray-700">{selectedCompany?.name || "-"}</p>
              </div>
              <div className="flex justify-center">
                <ArrowDown className="h-4 w-4 text-gray-400" />
              </div>
              <div className="rounded-lg p-3" style={{ background: "color-mix(in srgb, var(--theme-primary) 5%, transparent)", borderWidth: "1px", borderColor: "color-mix(in srgb, var(--theme-primary) 20%, transparent)" }}>
                <p className="text-xs mb-1" style={{ color: "var(--theme-primary)" }}>{lang === "en" ? "To company" : lang.startsWith("zh") ? "到公司" : "ไปยังบริษัท"}</p>
                <p className="text-sm font-semibold text-gray-800">{switchTarget.name}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSwitchTarget(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                data-testid="btn-switch-cancel"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  const targetId = switchTarget.id;
                  setSwitchTarget(null);
                  setSelectedCompanyId(targetId);
                  queryClient.invalidateQueries({ queryKey: ["/api/permissions/me"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/document-settings"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
                  setLocation("/dashboard");
                }}
                className="flex-1 px-4 py-2.5 text-white rounded-lg text-sm font-semibold transition-colors" style={{ background: "var(--theme-primary)" }}
                data-testid="btn-switch-confirm"
              >
                {t("common.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImpersonationBanner({ originalUser }: { originalUser?: { id: number; fullName: string; username: string } | null }) {
  const queryClient = useQueryClient();

  const exitMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/platform/impersonate/exit", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = "/platform/tenants";
    },
  });

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm print:hidden" data-testid="impersonation-banner">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4" />
        <span className="font-medium">
          โหมดสวมสิทธิ์ — คุณกำลังดูระบบในฐานะลูกค้า
        </span>
        {originalUser && (
          <span className="text-amber-100 text-xs">(กลับสู่: {originalUser.fullName})</span>
        )}
      </div>
      <button
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
        className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md font-medium text-xs transition-colors disabled:opacity-50"
        data-testid="btn-exit-impersonate"
      >
        {exitMutation.isPending ? "กำลังออก..." : "ออกจากโหมดสวมสิทธิ์"}
      </button>
    </div>
  );
}

function timeAgo(date: Date | string | null): string {
  if (!date) return "";
  const now = new Date();
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "เมื่อสักครู่";
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  if (diffHr < 24) return `${diffHr} ชั่วโมงที่แล้ว`;
  return `${diffDay} วันที่แล้ว`;
}

function getNotifIcon(type: string) {
  switch (type) {
    case "low_stock": return <Package className="h-4 w-4 text-orange-500" />;
    case "return_request": return <RotateCcw className="h-4 w-4 text-red-500" />;
    case "vat_deadline": return <Calendar className="h-4 w-4 text-blue-500" />;
    case "new_orders": return <ShoppingCart className="h-4 w-4 text-green-500" />;
    case "payment_overdue": return <AlertTriangle className="h-4 w-4 text-red-500" />;
    case "payment_upcoming": return <Clock className="h-4 w-4 text-yellow-500" />;
    default: return <Bell className="h-4 w-4 text-gray-400" />;
  }
}

function NotificationBell({ companyId }: { companyId: number | null }) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data } = useQuery<{ notifications: any[]; unreadCount: number }>({
    queryKey: ["/api/notifications", companyId],
    queryFn: async () => {
      if (!companyId) return { notifications: [], unreadCount: 0 };
      const r = await fetch(`/api/notifications?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return { notifications: [], unreadCount: 0 };
      return r.json();
    },
    enabled: !!companyId,
    refetchInterval: 300000,
    staleTime: 120000,
  });

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/notifications/read/${id}`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications", companyId] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications/read-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications", companyId] }),
  });

  const generateAlerts = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/notifications/generate?companyId=${companyId}`, { credentials: "include" });
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/notifications", companyId] }),
  });

  const notifs = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-10 w-10 rounded-full flex items-center justify-center relative transition-colors hover:bg-red-50"
          style={{ color: "#f94d4d" }}
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-white"
              style={{ background: "#f94d4d" }}
              data-testid="badge-notification-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 rounded-xl shadow-xl border-gray-100" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ background: "var(--theme-primary)" }}>
          <span className="text-sm font-semibold text-white">การแจ้งเตือน</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => generateAlerts.mutate()}
              className="h-7 px-2 rounded-md text-[11px] font-medium text-white/90 hover:text-white hover:bg-white/20 flex items-center gap-1 transition-colors"
              disabled={generateAlerts.isPending}
              data-testid="button-generate-alerts"
              title="สร้างการแจ้งเตือนอัตโนมัติ"
            >
              <RefreshCw className={cn("h-3 w-3", generateAlerts.isPending && "animate-spin")} />
              สแกน
            </button>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="h-7 px-2 rounded-md text-[11px] font-medium text-white/90 hover:text-white hover:bg-white/20 flex items-center gap-1 transition-colors"
                data-testid="button-mark-all-read"
                title="อ่านทั้งหมด"
              >
                <CheckCheck className="h-3 w-3" />
                อ่านแล้ว
              </button>
            )}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <span className="text-sm">ไม่มีการแจ้งเตือน</span>
              <button
                onClick={() => generateAlerts.mutate()}
                className="mt-2 text-xs font-medium hover:underline"
                style={{ color: "#03c9d7" }}
                data-testid="button-generate-empty"
              >
                สแกนหาการแจ้งเตือน
              </button>
            </div>
          ) : (
            notifs.map((n: any) => (
              <button
                key={n.id}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 border-b border-gray-50 last:border-0",
                  !n.isRead && "bg-orange-50/40"
                )}
                data-testid={`notification-item-${n.id}`}
                onClick={() => {
                  if (!n.isRead) markRead.mutate(n.id);
                  if (n.link) { setLocation(n.link); setOpen(false); }
                }}
              >
                <div className="mt-0.5 shrink-0 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                  {getNotifIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("text-xs leading-relaxed", !n.isRead ? "text-gray-900 font-medium" : "text-gray-500")}>
                    {n.message}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <span className="mt-2 shrink-0 h-2 w-2 rounded-full" style={{ background: "var(--theme-primary)" }} />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SubscriptionNavButton() {
  const [location, setLocation] = useLocation();
  const [subOpen, setSubOpen] = useState(false);
  const isInEcommerce = location.startsWith("/ecommerce");
  const { data } = useQuery<any>({
    queryKey: ["/api/my-subscription-info"],
    queryFn: async () => {
      const r = await fetch("/api/my-subscription-info", { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60000,
  });

  if (!data?.plan) return null;

  const planCode = data.plan.code;
  const planColors: Record<string, string> = { free: "#9ca3af", starter: "#03c9d7", pro: "#fb9678", enterprise: "#05b187" };
  const color = planColors[planCode] || "#9ca3af";
  const isExpiring = data.isExpiringSoon;

  return (
    <Popover open={subOpen} onOpenChange={setSubOpen}>
      <PopoverTrigger asChild>
        <button
          className="h-10 px-3 rounded-full flex items-center gap-1.5 transition-all hover:shadow-md relative"
          style={{ background: `${color}15`, color }}
          data-testid="btn-subscription-nav"
          title="ข้อมูลแพ็คเกจ"
        >
          <Crown className="h-4 w-4" />
          <span className="text-xs font-semibold hidden sm:inline">{data.plan.name}</span>
          {isExpiring && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-2xl shadow-xl p-0 border-gray-100">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5" style={{ color }} />
              <span className="font-bold text-sm" style={{ color }}>{data.plan.name}</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${color}20`, color }}>
              {data.subscription?.status === "active" ? "ใช้งานอยู่" : data.subscription?.status || "active"}
            </span>
          </div>

          {data.usage && (
            <div className="space-y-2">
              {[
                { label: "ผู้ใช้", current: data.usage.users, max: data.plan.maxUsers },
                { label: "เอกสาร/เดือน", current: data.usage.documents, max: data.plan.maxDocumentsPerMonth },
                { label: "สินค้า", current: data.usage.products, max: data.plan.maxProducts },
              ].map((item) => {
                const pct = item.max >= 999999 ? 0 : Math.min(100, (item.current / item.max) * 100);
                return (
                  <div key={item.label}>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span className="text-gray-500">{item.label}</span>
                      <span className="font-medium text-gray-700">
                        {item.current.toLocaleString()}/{item.max >= 999999 ? "∞" : item.max.toLocaleString()}
                      </span>
                    </div>
                    {item.max < 999999 && (
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: pct >= 90 ? "#f94d4d" : pct >= 70 ? "#fec90f" : color,
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isExpiring && (
            <div className="flex items-center gap-2 bg-amber-50 rounded-lg px-3 py-2">
              <Calendar className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] text-amber-700 font-medium">เหลืออีก {data.daysRemaining} วันหมดอายุ</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 rounded-lg text-xs h-8"
              onClick={() => { setSubOpen(false); setLocation("/settings/my-subscription"); }}
              data-testid="btn-view-subscription"
            >
              ดูรายละเอียด
            </Button>
            {planCode !== "enterprise" && (
              <Button
                size="sm"
                className="flex-1 rounded-lg text-xs h-8 font-semibold"
                style={{ background: "#03c9d7", color: "#fff" }}
                onClick={() => { setSubOpen(false); setLocation("/settings/upgrade"); }}
                data-testid="btn-upgrade-nav"
              >
                <ArrowUpRight className="h-3 w-3 mr-1" />
                อัพเกรด
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

