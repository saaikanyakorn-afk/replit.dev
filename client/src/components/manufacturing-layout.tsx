import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Factory, LayoutDashboard, ClipboardList, Barcode, Search,
  Wrench, ChevronDown, ChevronRight, ArrowLeft, Settings2, Package, ScanLine, ListChecks,
  PackageOpen, QrCode, PackageCheck, ShieldAlert, AlertCircle
} from "lucide-react";

const HREF_TO_SUB_KEY: Record<string, string> = {
  "/manufacturing/dashboard": "manufacturing/dashboard",
  "/manufacturing/bom": "manufacturing/bom",
  "/manufacturing/orders": "manufacturing/orders",
  "/manufacturing/serial-numbers": "manufacturing/serial-numbers",
  "/manufacturing/traceability": "manufacturing/traceability",
  "/manufacturing/calibration": "manufacturing/calibration",
  "/manufacturing/mes/work-orders": "manufacturing/mes/work-orders",
  "/manufacturing/mes/scan": "manufacturing/mes/scan",
  "/manufacturing/material-issues": "manufacturing/material-issues",
  "/manufacturing/material-issues/form": "manufacturing/material-issues",
  "/manufacturing/employee-qr": "manufacturing/employee-qr",
  "/manufacturing/production-finish": "manufacturing/production-finish",
  "/manufacturing/production-finish/form": "manufacturing/production-finish",
  "/manufacturing/ncr": "manufacturing/ncr",
  "/manufacturing/ncr/form": "manufacturing/ncr",
  "/manufacturing/process-scan": "manufacturing/process-scan",
};

interface NavItem {
  label: string;
  icon: any;
  href: string;
  children?: NavItem[];
}

const MFG_NAV: { label: string; icon: any; href: string; children?: NavItem[] }[] = [
  { label: "ภาพรวมการผลิต", icon: LayoutDashboard, href: "/manufacturing/dashboard" },
  {
    label: "การผลิต", icon: Factory, href: "/manufacturing/orders",
    children: [
      { label: "สูตรการผลิต (BOM)", href: "/manufacturing/bom", icon: ClipboardList },
      { label: "ใบสั่งผลิต", href: "/manufacturing/orders", icon: Package },
    ],
  },
  {
    label: "Traceability", icon: Search, href: "/manufacturing/serial-numbers",
    children: [
      { label: "Serial Numbers", href: "/manufacturing/serial-numbers", icon: Barcode },
      { label: "ตรวจสอบย้อนกลับ", href: "/manufacturing/traceability", icon: Search },
    ],
  },
  {
    label: "ISO & เครื่องมือ", icon: Settings2, href: "/manufacturing/calibration",
    children: [
      { label: "เครื่องมือวัด (Calibration)", href: "/manufacturing/calibration", icon: Wrench },
    ],
  },
  {
    label: "MES (ติดตามการผลิต)", icon: ScanLine, href: "/manufacturing/mes/work-orders",
    children: [
      { label: "ใบสั่งผลิต MES", href: "/manufacturing/mes/work-orders", icon: ListChecks },
      { label: "สถานียิง QR", href: "/manufacturing/mes/scan", icon: ScanLine },
    ],
  },
  {
    label: "เบิกวัตถุดิบ", icon: PackageOpen, href: "/manufacturing/material-issues",
    children: [
      { label: "รายการใบเบิก", href: "/manufacturing/material-issues", icon: ClipboardList },
      { label: "สร้างใบเบิก", href: "/manufacturing/material-issue/form", icon: PackageOpen },
      { label: "QR บัตรพนักงาน", href: "/manufacturing/employee-qr", icon: QrCode },
    ],
  },
  {
    label: "รับสำเร็จรูป (FG)", icon: PackageCheck, href: "/manufacturing/production-finish",
    children: [
      { label: "รายการใบรับ", href: "/manufacturing/production-finish", icon: ClipboardList },
      { label: "สร้างใบรับ", href: "/manufacturing/production-finish/form", icon: PackageCheck },
    ],
  },
  {
    label: "QC & ของเสีย (NCR)", icon: ShieldAlert, href: "/manufacturing/ncr",
    children: [
      { label: "รายการ NCR", href: "/manufacturing/ncr", icon: AlertCircle },
      { label: "สร้าง NCR", href: "/manufacturing/ncr/form", icon: ShieldAlert },
    ],
  },
  { label: "Scan Station (ขั้นตอน)", icon: ListChecks, href: "/manufacturing/process-scan" },
];

export default function ManufacturingLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { selectedCompany, companies } = useCompany();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    MFG_NAV.forEach(item => {
      if (item.children?.some(c => location.startsWith(c.href))) {
        setOpenGroups(prev => new Set(prev).add(item.label));
      }
    });
  }, [location]);

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <div className="flex h-screen" data-testid="manufacturing-layout">
      <aside className="w-60 flex flex-col border-r bg-white" data-testid="manufacturing-sidebar">
        <div className="p-4 flex items-center gap-2" style={{ background: "#03c9d7" }}>
          <Factory className="text-white w-6 h-6" />
          <span className="text-white font-bold text-lg" data-testid="text-mfg-title">ระบบผลิต</span>
        </div>

        {selectedCompany && (
          <div className="px-3 py-2 border-b">
            <div className="text-xs text-gray-500">บริษัท</div>
            <div className="text-sm font-medium truncate" data-testid="text-mfg-company">{selectedCompany.name}</div>
          </div>
        )}

        <ScrollArea className="flex-1 py-2">
          {MFG_NAV.map(item => {
            const isOpen = openGroups.has(item.label);
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isGroupActive = hasChildren && item.children!.some(c => location.startsWith(c.href));
            const isSingleActive = !hasChildren && location.startsWith(item.href);

            if (!hasChildren) {
              return (
                <button
                  key={item.href}
                  onClick={() => navigate(item.href)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${isSingleActive ? "bg-cyan-50 text-cyan-700 font-semibold border-r-3 border-cyan-500" : "text-gray-700 hover:bg-gray-50"}`}
                  data-testid={`nav-${item.href.replace(/\//g, "-")}`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            }

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${isGroupActive ? "bg-cyan-50 text-cyan-700 font-semibold" : "text-gray-700 hover:bg-gray-50"}`}
                  data-testid={`nav-group-${item.label}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </div>
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {isOpen && item.children!.map(child => {
                  const ChildIcon = child.icon;
                  const isActive = location.startsWith(child.href);
                  return (
                    <button
                      key={child.href}
                      onClick={() => navigate(child.href)}
                      className={`w-full flex items-center gap-2 pl-10 pr-4 py-2 text-sm transition-colors ${isActive ? "text-cyan-600 font-semibold bg-cyan-50/50" : "text-gray-600 hover:bg-gray-50"}`}
                      data-testid={`nav-${child.href.replace(/\//g, "-")}`}
                    >
                      <ChildIcon className="w-4 h-4" />
                      {child.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </ScrollArea>

        <div className="p-3 border-t">
          <Button
            variant="outline"
            className="w-full text-sm"
            onClick={() => navigate("/")}
            data-testid="btn-back-main"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            กลับหน้าหลัก E-Tax Center
          </Button>
        </div>

        <div className="p-3 border-t flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-700 font-bold text-sm">
            {user?.fullName?.charAt(0) || "U"}
          </div>
          <div className="text-xs">
            <div className="font-medium truncate" data-testid="text-mfg-user">{user?.fullName || user?.username}</div>
            <div className="text-gray-400">{user?.role}</div>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
