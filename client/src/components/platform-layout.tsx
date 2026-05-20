import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  LogOut,
  UserCircle,
  Shield,
  MessageCircle,
  Crown,
  Globe,
  KeyRound,
  CreditCard,
  Eye,
  TrendingUp,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const ADMIN_NAV = [
  { icon: LayoutDashboard, label: "ภาพรวมแพลตฟอร์ม", href: "/platform" },
  { icon: Building2, label: "จัดการ Tenant", href: "/platform/tenants" },
  { icon: Eye, label: "ภาพรวมลูกค้า & ข้อมูล", href: "/platform/tenant-overview" },
  { icon: Crown, label: "จัดการแพ็คเกจ", href: "/platform/subscriptions" },
  { icon: CreditCard, label: "ตั้งค่าการชำระเงิน", href: "/platform/payment-settings" },
  { icon: MessageCircle, label: "แชทสนับสนุน", href: "/platform/chat" },
  { icon: Globe, label: "จัดการ Landing Page", href: "/settings/landing-cms" },
  { icon: KeyRound, label: "จัดการรหัสผ่าน", href: "/platform/passwords" },
  { icon: Mail, label: "ตั้งค่า Email", href: "/platform/email-config" },
  { icon: TrendingUp, label: "อัตราแลกเปลี่ยน (BOT)", href: "/settings/exchange-rate" },
];


export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!user) setLocation("/login");
    if (user && user.role !== "super_admin") setLocation("/");
  }, [user, setLocation]);

  if (!user || user.role !== "super_admin") return null;

  return (
    <div className="min-h-screen bg-gray-50/50 flex font-sans">
      <aside className="w-64 bg-slate-900 text-white border-r border-slate-700 hidden md:flex flex-col fixed h-full z-10 overflow-y-auto">
        <div className="h-16 flex items-center px-6 border-b border-slate-700 shrink-0">
          <div className="flex items-center gap-3 font-semibold text-lg">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-900/20">
              <Shield className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-heading tracking-tight text-white leading-none">E-Tax Platform</span>
              <span className="text-[9px] font-medium text-amber-400 uppercase tracking-widest mt-1">Super Admin</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {ADMIN_NAV.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <span
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
                  )}
                  data-testid={`nav-${item.href.replace(/\//g, "-")}`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </span>
              </Link>
            );
          })}

        </nav>

        <div className="p-4 border-t border-slate-700 shrink-0">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center">
              <UserCircle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate" data-testid="text-platform-user">{user.fullName}</p>
              <p className="text-xs text-amber-400/70 truncate">เจ้าของแพลตฟอร์ม</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="text-slate-400 hover:text-white hover:bg-slate-700"
              data-testid="button-platform-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <div className="flex-1 p-4 w-full animate-in fade-in duration-500 overflow-x-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
