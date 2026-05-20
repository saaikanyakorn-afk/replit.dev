import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import SysAdminLayout from "@/components/sysadmin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Plus, Eye, EyeOff, Pencil, Trash2, Check, X,
  Lock, Unlock, Key, AlertTriangle, Crown, UserCog,
  RefreshCw, Clock, Ban, CheckCircle2, Settings,
  Search, MessageCircle, Loader2, Mail, Smartphone,
  ShieldCheck, ShieldOff, QrCode, Wifi, Send, RotateCcw,
  Filter, ChevronLeft, ChevronRight, Calendar, LogIn, LogOut,
  UserPlus, UserMinus, UserPen, KeyRound, Wrench,
} from "lucide-react";

type ForestLineEntry = {
  lineUserId: string;
  displayName: string;
  source?: string;
  lastSeenAt?: string | null;
};

interface SysAdminUser {
  id: number;
  username: string;
  fullName: string;
  email: string | null;
  isMaster: boolean;
  active: boolean;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  passwordExpiryDays: number;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  createdBy: number | null;
  lineUserId?: string | null;
  twoFactorMethod?: string | null;
  twoFactorVerified?: boolean;
  emailVerified?: boolean;
}

interface PasswordPolicy {
  id: number;
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecial: boolean;
  expiryDays: number;
  historyCount: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  sessionTimeoutMinutes: number;
  require2fa: boolean;
  ipWhitelistEnabled: boolean;
  ipWhitelist: string[] | null;
}

interface AuditLogEntry {
  id: number;
  sysAdminId: number;
  sysAdminUsername: string;
  action: string;
  targetType: string | null;
  targetId: number | null;
  targetName: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}

const BANNED_PASSWORDS_CLIENT = new Set([
  "password", "p@ssw0rd", "p@ssword", "passw0rd", "p@ss1234",
  "qwerty123", "qwerty1!", "qwerty12", "admin123", "admin@123",
  "admin1234", "letmein1", "welcome1", "changeme", "ch@ngeme",
  "12345678", "123456789", "abcd1234", "iloveyou", "trustno1",
  "sunshine", "master12", "superman", "test1234", "test@123",
  "root1234", "sysadmin", "sys@dm1n", "system12", "etaxcenter",
]);

function isCommonPasswordClient(pw: string): boolean {
  const lower = pw.toLowerCase();
  if (BANNED_PASSWORDS_CLIENT.has(lower)) return true;
  const norm = lower.replace(/@/g,"a").replace(/0/g,"o").replace(/1/g,"i").replace(/3/g,"e").replace(/\$/g,"s");
  if (BANNED_PASSWORDS_CLIENT.has(norm)) return true;
  if (/^(.)\1{5,}$/.test(lower)) return true;
  return false;
}

function PasswordStrengthBar({ password, policy }: { password: string; policy: PasswordPolicy | null }) {
  if (!policy || !password) return null;
  const isBanned = isCommonPasswordClient(password);
  let score = 0;
  const total = 6;
  if (password.length >= policy.minLength) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) score++;
  if (!isBanned) score++;
  const pct = (score / total) * 100;
  const color = isBanned ? "bg-red-500" : pct <= 33 ? "bg-red-500" : pct <= 50 ? "bg-orange-500" : pct <= 83 ? "bg-yellow-500" : "bg-green-500";
  const label = isBanned ? "รหัสที่ห้ามใช้" : pct <= 33 ? "อ่อน" : pct <= 50 ? "ปานกลาง" : pct <= 83 ? "ดี" : "แข็งแกร่ง";

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-400">ความแข็งแกร่ง</span>
        <span className={isBanned || pct <= 33 ? "text-red-500" : pct <= 83 ? "text-yellow-600" : "text-green-600"}>{label}</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      {isBanned && (
        <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> รหัสนี้อยู่ในรายการ "รหัสที่คาดเดาง่าย" ไม่สามารถใช้ได้
        </p>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px]">
        <span className={password.length >= policy.minLength ? "text-green-600" : "text-gray-400"}>
          {password.length >= policy.minLength ? "✓" : "✗"} {policy.minLength}+ ตัวอักษร
        </span>
        {policy.requireUppercase && (
          <span className={/[A-Z]/.test(password) ? "text-green-600" : "text-gray-400"}>
            {/[A-Z]/.test(password) ? "✓" : "✗"} A-Z
          </span>
        )}
        {policy.requireLowercase && (
          <span className={/[a-z]/.test(password) ? "text-green-600" : "text-gray-400"}>
            {/[a-z]/.test(password) ? "✓" : "✗"} a-z
          </span>
        )}
        {policy.requireNumbers && (
          <span className={/[0-9]/.test(password) ? "text-green-600" : "text-gray-400"}>
            {/[0-9]/.test(password) ? "✓" : "✗"} 0-9
          </span>
        )}
        {policy.requireSpecial && (
          <span className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password) ? "text-green-600" : "text-gray-400"}>
            {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password) ? "✓" : "✗"} !@#$
          </span>
        )}
      </div>
    </div>
  );
}

function AddSysAdminDialog({ onClose, policy }: { onClose: () => void; policy: PasswordPolicy | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ username: "", password: "", fullName: "", email: "", lineUserId: "" });
  const [showPw, setShowPw] = useState(false);
  const [lineSearch, setLineSearch] = useState("");
  const [lineSearchDebounced, setLineSearchDebounced] = useState("");
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const [selectedLineDisplayName, setSelectedLineDisplayName] = useState("");
  const linePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setLineSearchDebounced(lineSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [lineSearch]);

  useEffect(() => {
    if (!linePickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (linePickerRef.current && !linePickerRef.current.contains(e.target as Node)) {
        setLinePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [linePickerOpen]);

  const { data: forestLineResults = [], isFetching: forestLineFetching } = useQuery<ForestLineEntry[]>({
    queryKey: ["/api/sysadmin/forest-line-directory", lineSearchDebounced],
    enabled: linePickerOpen && lineSearchDebounced.length >= 1 && !form.lineUserId,
    queryFn: async () => {
      const res = await fetch(`/api/sysadmin/forest-line-directory?q=${encodeURIComponent(lineSearchDebounced)}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.items || []);
    },
  });

  const handlePickLine = (entry: ForestLineEntry) => {
    setForm(f => ({ ...f, lineUserId: entry.lineUserId }));
    setSelectedLineDisplayName(entry.displayName);
    setLineSearch(entry.displayName);
    setLinePickerOpen(false);
  };
  const handleClearLine = () => {
    setForm(f => ({ ...f, lineUserId: "" }));
    setSelectedLineDisplayName("");
    setLineSearch("");
    setLinePickerOpen(false);
  };

  const createMut = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch("/api/sysadmin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, twoFactorMethod: "line" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.errors?.join(", ") || err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      toast({ title: "เพิ่ม SysAdmin สำเร็จ" });
      onClose();
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="dialog-add-sysadmin">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UserCog className="h-5 w-5 text-[#fb9678]" /> เพิ่ม SysAdmin ใหม่
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-sm font-medium">ชื่อ-นามสกุล *</Label>
            <Input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="ชื่อเต็ม" data-testid="input-sysadmin-fullname" />
          </div>
          <div>
            <Label className="text-sm font-medium">Username *</Label>
            <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="sysadmin username" className="font-mono" data-testid="input-sysadmin-username" />
          </div>
          <div>
            <Label className="text-sm font-medium">Email</Label>
            <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" data-testid="input-sysadmin-email" />
          </div>
          <div ref={linePickerRef} className="relative">
            <Label className="text-sm font-medium">LINE * <span className="text-xs text-gray-400 font-normal">(2FA)</span></Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              <Input
                value={lineSearch}
                onChange={e => {
                  setLineSearch(e.target.value);
                  if (form.lineUserId) {
                    setForm(f => ({ ...f, lineUserId: "" }));
                    setSelectedLineDisplayName("");
                  }
                  setLinePickerOpen(true);
                }}
                onFocus={() => setLinePickerOpen(true)}
                className="pl-9 pr-9"
                placeholder="ค้นหาด้วยชื่อ / ชื่อบัญชี LINE"
                autoComplete="off"
                data-testid="input-sysadmin-line-search"
              />
              {lineSearch && (
                <button
                  type="button"
                  onClick={handleClearLine}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                  data-testid="btn-clear-sysadmin-line"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {form.lineUserId && selectedLineDisplayName && !linePickerOpen && (
              <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-green-600" data-testid="badge-sysadmin-line-verified">
                <CheckCircle2 className="h-3 w-3" />
                ทราบจาก Forest — {selectedLineDisplayName}
              </div>
            )}
            {linePickerOpen && !form.lineUserId && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl max-h-64 overflow-y-auto z-50" data-testid="dropdown-sysadmin-line-picker">
                {lineSearchDebounced.length < 1 ? (
                  <div className="p-3 text-xs text-gray-500 text-center">
                    พิมพ์ชื่อเพื่อค้นหา LINE ที่รู้จักใน Forest
                  </div>
                ) : forestLineFetching ? (
                  <div className="p-3 text-xs text-gray-500 text-center flex items-center justify-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> กำลังค้นหา...
                  </div>
                ) : forestLineResults.length === 0 ? (
                  <div className="p-3 text-xs text-amber-600 text-center">
                    <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                    ยังไม่พบใน Forest — เพิ่ม LINE Friend ของบอทก่อน แล้วค่อยกลับมาเลือก
                  </div>
                ) : (
                  <ul className="py-1">
                    {forestLineResults.map((entry, i) => (
                      <li key={`${entry.lineUserId}-${i}`}>
                        <button
                          type="button"
                          onClick={() => handlePickLine(entry)}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors flex items-start gap-2"
                          data-testid={`option-sysadmin-line-${i}`}
                        >
                          <MessageCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-gray-900 truncate">{entry.displayName}</div>
                            {(entry.source || entry.lastSeenAt) && (
                              <div className="text-[10px] text-gray-500 truncate">
                                {entry.source && <span>{entry.source}</span>}
                                {entry.source && entry.lastSeenAt && <span> · </span>}
                                {entry.lastSeenAt && <span>เห็นล่าสุด {new Date(entry.lastSeenAt).toLocaleDateString("th-TH")}</span>}
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-[10px] text-gray-500 mt-1">
              เลือกจากรายชื่อที่ Forest รู้จักเท่านั้น — ไม่ต้องส่งรหัสยืนยัน (จะ verify ตอน user นี้ login ครั้งแรก)
            </p>
          </div>
          <div>
            <Label className="text-sm font-medium">รหัสผ่าน *</Label>
            <div className="flex gap-2">
              <Input
                className="font-mono flex-1"
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="รหัสผ่าน"
                data-testid="input-sysadmin-password"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <PasswordStrengthBar password={form.password} policy={policy} />
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อ login ครั้งแรก
            </p>
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} data-testid="btn-cancel-add-sysadmin">
            <X className="h-4 w-4 mr-1" /> ยกเลิก
          </Button>
          <Button
            className="bg-[#fb9678] hover:bg-[#e8855a] text-white"
            onClick={() => createMut.mutate(form)}
            disabled={createMut.isPending || !form.username || !form.password || !form.fullName || !form.lineUserId.trim()}
            data-testid="btn-save-sysadmin"
          >
            <Check className="h-4 w-4 mr-1" /> {createMut.isPending ? "กำลังบันทึก..." : "เพิ่ม SysAdmin"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EditSysAdminDialog({ admin, me, onClose }: { admin: SysAdminUser; me?: SysAdminUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    fullName: admin.fullName,
    email: admin.email || "",
    lineUserId: admin.lineUserId || "",
    active: admin.active,
  });

  const { data: currentLineLookup = [] } = useQuery<ForestLineEntry[]>({
    queryKey: ["/api/sysadmin/forest-line-directory", "id", admin.lineUserId],
    enabled: !!admin.lineUserId,
    queryFn: async () => {
      const res = await fetch(`/api/sysadmin/forest-line-directory?id=${encodeURIComponent(admin.lineUserId!)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const [lineSearch, setLineSearch] = useState("");
  const [lineSearchDebounced, setLineSearchDebounced] = useState("");
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const [selectedLineDisplayName, setSelectedLineDisplayName] = useState("");
  const [lineEditMode, setLineEditMode] = useState(false);
  const linePickerRef = useRef<HTMLDivElement>(null);
  const pickerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setLineSearchDebounced(lineSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [lineSearch]);

  useEffect(() => {
    if (!linePickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (linePickerRef.current && !linePickerRef.current.contains(e.target as Node)) {
        setLinePickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [linePickerOpen]);

  useEffect(() => {
    if (linePickerOpen && pickerDropdownRef.current) {
      const t = setTimeout(() => pickerDropdownRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
      return () => clearTimeout(t);
    }
  }, [linePickerOpen, lineSearchDebounced]);

  const { data: forestLineResults = [], isFetching: forestLineFetching } = useQuery<ForestLineEntry[]>({
    queryKey: ["/api/sysadmin/forest-line-directory", lineSearchDebounced],
    enabled: linePickerOpen && lineSearchDebounced.length >= 1 && lineEditMode,
    queryFn: async () => {
      const res = await fetch(`/api/sysadmin/forest-line-directory?q=${encodeURIComponent(lineSearchDebounced)}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.items || []);
    },
  });

  const handlePickLine = (entry: ForestLineEntry) => {
    setForm(f => ({ ...f, lineUserId: entry.lineUserId }));
    setSelectedLineDisplayName(entry.displayName);
    setLineSearch(entry.displayName);
    setLinePickerOpen(false);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: any = { fullName: form.fullName, email: form.email || null };
      if (!admin.isMaster && admin.id !== me?.id) payload.active = form.active;
      if (lineEditMode && form.lineUserId && form.lineUserId !== admin.lineUserId) {
        payload.lineUserId = form.lineUserId;
      }
      const res = await fetch(`/api/sysadmin/users/${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      toast({ title: "บันทึกการแก้ไขสำเร็จ" });
      onClose();
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="dialog-edit-sysadmin">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Pencil className="h-5 w-5 text-[#fb9678]" /> แก้ไข SysAdmin
            {admin.isMaster && <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-[10px]"><Crown className="h-3 w-3 mr-0.5" /> Master</Badge>}
          </h2>
          <p className="text-xs text-gray-500 mt-1 font-mono">{admin.username}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-sm font-medium">ชื่อ-นามสกุล *</Label>
            <Input value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} data-testid="input-edit-fullname" />
          </div>
          <div>
            <Label className="text-sm font-medium">Email</Label>
            <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" data-testid="input-edit-email" />
          </div>
          <div ref={linePickerRef} className="relative">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-medium">LINE * <span className="text-xs text-gray-400 font-normal">(2FA)</span></Label>
              {!lineEditMode && (
                <button type="button" onClick={() => { setLineEditMode(true); setLineSearch(""); setLinePickerOpen(true); }} className="text-xs text-blue-600 hover:underline" data-testid="btn-change-line">
                  เปลี่ยน LINE
                </button>
              )}
            </div>
            {!lineEditMode ? (
              <div className="border rounded-lg p-2.5 bg-gray-50" data-testid="text-current-line">
                <div className="text-sm text-gray-900 flex items-center gap-1.5">
                  <MessageCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span className="font-medium">{currentLineLookup[0]?.displayName || <span className="text-gray-400 italic font-normal">(ไม่พบใน Forest)</span>}</span>
                  {currentLineLookup[0]?.source && <span className="ml-2 text-[10px] text-gray-400">[{currentLineLookup[0].source}]</span>}
                </div>
                <div className="text-[10px] font-mono text-gray-400 truncate mt-0.5 ml-5">{admin.lineUserId}</div>
              </div>
            ) : (
              <>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <Input
                    value={lineSearch}
                    onChange={e => {
                      setLineSearch(e.target.value);
                      if (form.lineUserId) {
                        setForm(f => ({ ...f, lineUserId: admin.lineUserId || "" }));
                        setSelectedLineDisplayName("");
                      }
                      setLinePickerOpen(true);
                    }}
                    onFocus={() => setLinePickerOpen(true)}
                    className="pl-9 pr-9"
                    placeholder="ค้นหาด้วยชื่อ / ชื่อบัญชี LINE"
                    autoComplete="off"
                    data-testid="input-edit-line-search"
                  />
                  <button
                    type="button"
                    onClick={() => { setLineEditMode(false); setForm(f => ({ ...f, lineUserId: admin.lineUserId || "" })); setLineSearch(""); setSelectedLineDisplayName(""); setLinePickerOpen(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    data-testid="btn-cancel-line-edit"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {form.lineUserId && form.lineUserId !== admin.lineUserId && selectedLineDisplayName && !linePickerOpen && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-green-600">
                    <CheckCircle2 className="h-3 w-3" />
                    เลือก: {selectedLineDisplayName}
                  </div>
                )}
                {linePickerOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl max-h-64 overflow-y-auto z-50">
                    {lineSearchDebounced.length < 1 ? (
                      <div className="p-3 text-xs text-gray-500 text-center">พิมพ์ชื่อเพื่อค้นหา LINE ที่รู้จักใน Forest</div>
                    ) : forestLineFetching ? (
                      <div className="p-3 text-xs text-gray-500 text-center flex items-center justify-center gap-2"><Loader2 className="h-3 w-3 animate-spin" /> กำลังค้นหา...</div>
                    ) : forestLineResults.length === 0 ? (
                      <div className="p-3 text-xs text-amber-600 text-center"><AlertTriangle className="h-3.5 w-3.5 inline mr-1" /> ไม่พบใน Forest</div>
                    ) : (
                      <ul className="py-1">
                        {forestLineResults.map((entry, i) => (
                          <li key={`${entry.lineUserId}-${i}`}>
                            <button type="button" onClick={() => handlePickLine(entry)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2">
                              <MessageCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-gray-900 truncate">{entry.displayName}</div>
                                {entry.source && <div className="text-[10px] text-gray-500 truncate">{entry.source}</div>}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
          {/* 2FA Status section */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#fb9678]" /> สถานะ 2FA
            </p>
            <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-sm">
                  {admin.twoFactorMethod === "line" && <><MessageCircle className="h-3.5 w-3.5 inline text-green-500 mr-1" />LINE OTP</>}
                  {admin.twoFactorMethod === "totp" && <><Smartphone className="h-3.5 w-3.5 inline text-purple-500 mr-1" />QR / Authenticator</>}
                  {admin.twoFactorMethod === "email" && <><Mail className="h-3.5 w-3.5 inline text-blue-500 mr-1" />Email OTP</>}
                  {!admin.twoFactorMethod && <span className="text-gray-400 italic text-xs">ยังไม่ตั้งค่า 2FA</span>}
                </p>
                {admin.twoFactorVerified
                  ? <p className="text-[10px] text-green-600 mt-0.5">✓ Verified แล้ว</p>
                  : admin.twoFactorMethod && <p className="text-[10px] text-amber-600 mt-0.5">⏳ ยังไม่ verify</p>}
              </div>
            </div>
          </div>

          {!admin.isMaster && admin.id !== me?.id && (
            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <Label className="text-sm font-medium">สถานะใช้งาน</Label>
                <p className="text-xs text-gray-500">ถ้าปิด → user นี้จะ login ไม่ได้</p>
              </div>
              <Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} data-testid="switch-edit-active" />
            </div>
          )}
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} data-testid="btn-cancel-edit">
            <X className="h-4 w-4 mr-1" /> ยกเลิก
          </Button>
          <Button
            className="bg-[#fb9678] hover:bg-[#e8855a] text-white"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || !form.fullName.trim() || (lineEditMode && !form.lineUserId)}
            data-testid="btn-save-edit"
          >
            <Check className="h-4 w-4 mr-1" /> {saveMut.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function My2FADialog({ me, onClose }: { me: SysAdminUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<"line" | "totp" | "email">(
    (me.twoFactorMethod as any) || "line"
  );
  // master = always true, non-master = has method set
  const [use2FA, setUse2FA] = useState(me.isMaster ? true : !!me.twoFactorMethod);
  const [totpUri, setTotpUri] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [emailChanging, setEmailChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailChangeStep, setEmailChangeStep] = useState<"input" | "verify">("input");
  const [emailChangeCode, setEmailChangeCode] = useState("");
  const [switchingLine, setSwitchingLine] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSetupTotp = async () => {
    setTotpLoading(true);
    try {
      const res = await fetch("/api/sysadmin/me/setup-totp", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setTotpUri(data.uri);
    } catch (e: any) { toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }); }
    finally { setTotpLoading(false); }
  };

  const handleVerifyTotp = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sysadmin/me/verify-totp-setup", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      onClose();
    } catch (e: any) { toast({ title: "รหัสไม่ถูกต้อง", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleSendEmailVerif = async () => {
    setEmailOtpSending(true);
    try {
      const res = await fetch("/api/sysadmin/me/send-email-verification", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setEmailOtpSent(true);
      toast({ title: data.message });
    } catch (e: any) { toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }); }
    finally { setEmailOtpSending(false); }
  };

  const handleVerifyEmail = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sysadmin/me/verify-email", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: emailOtpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      onClose();
    } catch (e: any) { toast({ title: "รหัสไม่ถูกต้อง", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleSwitchLine = async () => {
    setSwitchingLine(true);
    try {
      const res = await fetch("/api/sysadmin/me/switch-to-line", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      onClose();
    } catch (e: any) { toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }); }
    finally { setSwitchingLine(false); }
  };

  const handleRequestEmailChange = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sysadmin/me/request-email-change", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      if (data.skipVerify) {
        const res2 = await fetch("/api/sysadmin/me/confirm-email-change", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "SKIP" }),
        });
        const d2 = await res2.json();
        if (!res2.ok) throw new Error(d2.message);
        toast({ title: "บันทึก email สำเร็จ" });
        queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/me"] });
        queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
        setEmailChanging(false);
      } else {
        toast({ title: data.message });
        setEmailChangeStep("verify");
      }
    } catch (e: any) { toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleConfirmEmailChange = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sysadmin/me/confirm-email-change", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: emailChangeCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: "เปลี่ยน email สำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      setEmailChanging(false);
      setEmailChangeStep("input");
    } catch (e: any) { toast({ title: "รหัสไม่ถูกต้อง", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const methodLabel: Record<string, string> = { line: "LINE OTP", totp: "QR Code / Authenticator", email: "Email OTP" };
  const currentMethod = me.twoFactorMethod || "ยังไม่ตั้งค่า";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="dialog-my-2fa">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#fb9678]" /> ตั้งค่า 2FA ของฉัน
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            ปัจจุบันใช้: <span className="font-semibold text-gray-800">{methodLabel[currentMethod] || currentMethod}</span>
            {me.twoFactorVerified
              ? <span className="ml-2 text-green-600 text-[10px]">✓ Verified</span>
              : <span className="ml-2 text-amber-500 text-[10px]">⏳ ยังไม่ verify</span>}
          </p>
          {/* Master lock banner */}
          {me.isMaster && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              <span><span className="font-semibold">Master SysAdmin</span> ต้องผ่าน 2FA ทุกครั้งที่ login — ไม่สามารถปิดได้ สามารถเปลี่ยน <span className="font-semibold">วิธี</span> 2FA ได้เท่านั้น</span>
            </div>
          )}
          {/* Non-master info */}
          {!me.isMaster && (
            <div className="mt-2 flex items-center gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>เปิด/ปิด และเปลี่ยนวิธี 2FA ของตัวเองได้ที่นี่</span>
            </div>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Email change section */}
          <div className="border rounded-lg p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium flex items-center gap-1.5"><Mail className="h-4 w-4 text-blue-500" /> Email ปัจจุบัน</span>
              <button onClick={() => { setEmailChanging(!emailChanging); setEmailChangeStep("input"); setNewEmail(""); setEmailChangeCode(""); }} className="text-xs text-blue-600 hover:underline" data-testid="btn-toggle-email-change">
                {emailChanging ? "ยกเลิก" : "เปลี่ยน Email"}
              </button>
            </div>
            <p className="text-sm text-gray-700 font-mono">{me.email || <span className="italic text-gray-400">ยังไม่มี email</span>}</p>
            {me.emailVerified && <p className="text-[10px] text-green-600 mt-0.5">✓ Email verified แล้ว</p>}
            {emailChanging && (
              <div className="mt-3 space-y-2">
                {emailChangeStep === "input" && (
                  <>
                    <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email ใหม่@example.com" data-testid="input-new-email" />
                    {me.email && <p className="text-[10px] text-amber-600">รหัสยืนยันจะถูกส่งไปที่ email เก่า ({me.email}) ก่อน</p>}
                    <Button size="sm" onClick={handleRequestEmailChange} disabled={saving || !newEmail} className="w-full" data-testid="btn-request-email-change">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                      {me.email ? "ส่งรหัสยืนยันไป email เก่า" : "บันทึก email ใหม่"}
                    </Button>
                  </>
                )}
                {emailChangeStep === "verify" && (
                  <>
                    <p className="text-xs text-gray-600">กรอกรหัสที่ได้รับจาก email เก่า</p>
                    <Input value={emailChangeCode} onChange={e => setEmailChangeCode(e.target.value)} placeholder="รหัส 6 หลัก" maxLength={6} data-testid="input-email-change-code" />
                    <Button size="sm" onClick={handleConfirmEmailChange} disabled={saving || emailChangeCode.length !== 6} className="w-full" data-testid="btn-confirm-email-change">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />} ยืนยันเปลี่ยน Email
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 2FA on/off toggle — non-master only */}
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                เปิดใช้ 2FA
                {me.isMaster && <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 rounded px-1.5 py-0.5 font-semibold">Master — บังคับเสมอ</span>}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {me.isMaster ? "ไม่สามารถปิดได้" : use2FA ? "ต้องผ่าน 2FA ทุกครั้งที่ login" : "ข้าม 2FA ได้ (ยังไม่ enforce ใน backend)"}
              </p>
              {!me.isMaster && (
                <div className="flex items-start gap-1.5 mt-1.5 rounded bg-amber-50 border border-dashed border-amber-300 px-2 py-1 text-[10px] text-amber-700">
                  <span className="shrink-0 rounded bg-amber-200 px-1 py-0.5 font-bold uppercase tracking-wide text-amber-800">TODO</span>
                  <span>ต้องเพิ่ม column <code className="bg-amber-100 px-0.5 rounded">require_2fa</code> ใน <code className="bg-amber-100 px-0.5 rounded">sys_admins</code> + enforce ใน login flow</span>
                </div>
              )}
            </div>
            <Switch
              checked={use2FA}
              onCheckedChange={v => !me.isMaster && setUse2FA(v)}
              disabled={me.isMaster}
              data-testid="switch-my-2fa-enabled"
            />
          </div>

          {/* 2FA Method tabs — hidden when 2FA is off */}
          <div className={use2FA ? "" : "hidden"}>
            <p className="text-sm font-medium mb-2">เลือกวิธี 2FA</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {(["line", "totp", "email"] as const).map(m => (
                <button key={m} onClick={() => setTab(m)} data-testid={`tab-2fa-${m}`}
                  className={`p-2.5 rounded-lg border text-xs font-medium transition-all flex flex-col items-center gap-1 ${tab === m ? "border-[#fb9678] bg-orange-50 text-[#fb9678]" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  {m === "line" && <><MessageCircle className="h-5 w-5" />LINE OTP</>}
                  {m === "totp" && <><QrCode className="h-5 w-5" />QR Code</>}
                  {m === "email" && <><Mail className="h-5 w-5" />Email OTP</>}
                  {me.twoFactorMethod === m && <span className="text-[9px] text-green-600 font-normal">ใช้งานอยู่</span>}
                </button>
              ))}
            </div>

            {/* LINE tab */}
            {tab === "line" && (
              <div className="space-y-3">
                {me.lineUserId ? (
                  <>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-green-600 shrink-0" />
                      <span>มี LINE User ID ในระบบแล้ว</span>
                    </div>
                    {me.twoFactorMethod !== "line" && (
                      <Button onClick={handleSwitchLine} disabled={switchingLine} className="w-full bg-green-600 hover:bg-green-700 text-white" data-testid="btn-switch-to-line">
                        {switchingLine ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MessageCircle className="h-4 w-4 mr-1" />}
                        เปลี่ยนมาใช้ LINE OTP
                      </Button>
                    )}
                    {me.twoFactorMethod === "line" && <p className="text-xs text-gray-500 text-center">กำลังใช้ LINE OTP อยู่แล้ว หากต้องการเปลี่ยน LINE ไปแก้ใน Edit profile</p>}
                  </>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 inline mr-1" />
                    ยังไม่มี LINE User ID กรุณาให้ Master หรือแก้ไขใน Edit ก่อน
                  </div>
                )}
              </div>
            )}

            {/* TOTP tab */}
            {tab === "totp" && (
              <div className="space-y-3">
                {!totpUri && (
                  <div className="grid grid-cols-3 gap-2">
                    <div />{/* spacer left */}
                    <Button onClick={handleSetupTotp} disabled={totpLoading} variant="outline" className="w-full" data-testid="btn-gen-qr">
                      {totpLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <QrCode className="h-4 w-4 mr-1" />}
                      สร้าง QR Code ใหม่
                    </Button>
                    <div />{/* spacer right */}
                  </div>
                )}
                {!totpUri && (
                  <p className="text-xs text-gray-500 text-center">สแกน QR Code ด้วย Google Authenticator, Authy, หรือ app อื่นที่รองรับ TOTP</p>
                )}
                {totpUri && (
                  <>
                    <div className="flex justify-center p-4 bg-white border rounded-lg" data-testid="qr-code-area">
                      <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpUri)}`}
                        alt="TOTP QR Code" className="w-48 h-48" />
                    </div>
                    <p className="text-[10px] text-gray-500 text-center">สแกนด้วย Authenticator App แล้วกรอกรหัส 6 หลัก</p>
                    <Input value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))} placeholder="รหัส 6 หลัก" maxLength={6} className="text-center text-lg font-mono tracking-widest" data-testid="input-totp-code" />
                    <Button onClick={handleVerifyTotp} disabled={saving || totpCode.length !== 6} className="w-full bg-purple-600 hover:bg-purple-700 text-white" data-testid="btn-verify-totp">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                      ยืนยันและเปิดใช้ QR Code 2FA
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleSetupTotp} disabled={totpLoading} className="w-full text-xs" data-testid="btn-regen-qr">
                      <RotateCcw className="h-3 w-3 mr-1" /> สร้าง QR ใหม่
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Email tab */}
            {tab === "email" && (
              <div className="space-y-3">
                {!me.email ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 inline mr-1" />
                    ยังไม่มี email กรุณาเพิ่ม email ในส่วนด้านบนก่อน
                  </div>
                ) : (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                      <Mail className="h-4 w-4 text-blue-600 inline mr-1" />
                      ส่ง OTP ไปที่ <strong>{me.email}</strong>
                      {me.emailVerified && <span className="ml-1 text-green-600 text-[10px]">✓ verified</span>}
                    </div>
                    {!emailOtpSent ? (
                      <Button onClick={handleSendEmailVerif} disabled={emailOtpSending} className="w-full" data-testid="btn-send-email-otp">
                        {emailOtpSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                        ส่งรหัสยืนยันไปที่ Email
                      </Button>
                    ) : (
                      <>
                        <Input value={emailOtpCode} onChange={e => setEmailOtpCode(e.target.value.replace(/\D/g, ""))} placeholder="รหัส 6 หลัก" maxLength={6} className="text-center text-lg font-mono tracking-widest" data-testid="input-email-otp-code" />
                        <Button onClick={handleVerifyEmail} disabled={saving || emailOtpCode.length !== 6} className="w-full bg-blue-600 hover:bg-blue-700 text-white" data-testid="btn-verify-email-otp">
                          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldCheck className="h-4 w-4 mr-1" />}
                          ยืนยันและเปิดใช้ Email 2FA
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setEmailOtpSent(false); setEmailOtpCode(""); }} className="w-full text-xs">ส่งรหัสใหม่</Button>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t flex justify-end">
          <Button variant="outline" onClick={onClose} data-testid="btn-close-2fa-dialog">
            <X className="h-4 w-4 mr-1" /> ปิด
          </Button>
        </div>
      </div>
    </div>
  );
}

const SMTP_PRESETS = [
  {
    id: "brevo",
    label: "Brevo",
    badge: "แนะนำ · ฟรี 300/วัน",
    badgeColor: "bg-blue-100 text-blue-700",
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    passLabel: "SMTP Key (จาก Brevo dashboard)",
    passHint: "เข้า app.brevo.com → SMTP & API → SMTP tab → copy Login + Generate SMTP Key (Login ≠ email account)",
    signupUrl: "https://app.brevo.com",
  },
  {
    id: "mailjet",
    label: "Mailjet",
    badge: "ฟรี 200/วัน",
    badgeColor: "bg-sky-100 text-sky-700",
    host: "in-v3.mailjet.com",
    port: 587,
    secure: false,
    passLabel: "Secret Key (Mailjet dashboard)",
    passHint: "เข้า app.mailjet.com → Account → API Keys → ใช้ API Key เป็น username, Secret Key เป็น password",
    signupUrl: "https://app.mailjet.com",
  },
  {
    id: "gmail",
    label: "Gmail",
    badge: "ต้องมี App Password",
    badgeColor: "bg-red-100 text-red-700",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    passLabel: "App Password (ไม่ใช่รหัส Google)",
    passHint: "myaccount.google.com/apppasswords → สร้าง App Password",
    signupUrl: "https://myaccount.google.com/apppasswords",
  },
  {
    id: "hostinger",
    label: "Hostinger",
    badge: "สำหรับ hosting ลูกค้า",
    badgeColor: "bg-purple-100 text-purple-700",
    host: "smtp.hostinger.com",
    port: 465,
    secure: true,
    passLabel: "รหัสผ่าน Email บน Hostinger",
    passHint: "ใช้รหัสผ่าน Email ที่สร้างใน hPanel → Emails",
    signupUrl: "https://hpanel.hostinger.com",
  },
];

function SmtpConfigDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ host: "", port: 587, user: "", pass: "", from: "", secure: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sysadmin/smtp-config", { credentials: "include" }).then(r => r.json()).then(d => {
      const host = d.host || "";
      setForm({ host, port: d.port || 587, user: d.user || "", pass: d.pass || "", from: d.from || "", secure: d.secure || false });
      const matched = SMTP_PRESETS.find(p => p.host === host);
      if (matched) setActivePreset(matched.id);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const applyPreset = (preset: typeof SMTP_PRESETS[0]) => {
    setActivePreset(preset.id);
    setForm(f => ({ ...f, host: preset.host, port: preset.port, secure: preset.secure }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/sysadmin/smtp-config", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: data.message });
    } catch (e: any) { toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/sysadmin/smtp-config/test", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testEmail,
          host: form.host,
          port: form.port,
          user: form.user,
          pass: form.pass.startsWith("••••") ? undefined : form.pass,
          from: form.from,
          secure: form.secure,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: data.message });
    } catch (e: any) { toast({ title: "ส่ง email ล้มเหลว", description: e.message, variant: "destructive" }); }
    finally { setTesting(false); }
  };

  const currentPreset = SMTP_PRESETS.find(p => p.id === activePreset);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="dialog-smtp-config">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2"><Wifi className="h-5 w-5 text-[#fb9678]" /> ตั้งค่า SMTP Email</h2>
          <p className="text-xs text-gray-500 mt-1">สำหรับส่ง OTP ผ่าน Email 2FA — เปลี่ยน provider ได้ทุกเมื่อโดยไม่ต้องแก้โค้ด</p>
        </div>
        {loading ? (
          <div className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Provider presets */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">เลือก Email Provider</p>
              <div className="grid grid-cols-2 gap-2">
                {SMTP_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    data-testid={`btn-preset-${preset.id}`}
                    className={`p-3 rounded-lg border text-left transition-all ${activePreset === preset.id ? "border-[#fb9678] bg-orange-50 ring-1 ring-[#fb9678]/30" : "border-gray-200 hover:border-gray-300 bg-white"}`}
                  >
                    <div className="font-semibold text-sm text-gray-800">{preset.label}</div>
                    <div className={`text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-0.5 font-medium ${preset.badgeColor}`}>{preset.badge}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Hint for selected preset */}
            {currentPreset && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                <p className="font-medium mb-1">{currentPreset.passLabel}</p>
                <p className="text-blue-600">{currentPreset.passHint}</p>
                <a href={currentPreset.signupUrl} target="_blank" rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-blue-700 underline hover:text-blue-900">
                  เปิด {currentPreset.label} →
                </a>
              </div>
            )}

            <div className="border-t pt-3 space-y-3">
              <div>
                <Label className="text-sm">SMTP Host *</Label>
                <Input value={form.host} onChange={e => { setForm(f => ({ ...f, host: e.target.value })); setActivePreset(SMTP_PRESETS.find(p => p.host === e.target.value)?.id || null); }} placeholder="smtp-relay.brevo.com" data-testid="input-smtp-host" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Port</Label>
                  <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))} data-testid="input-smtp-port" />
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <Switch checked={form.secure} onCheckedChange={v => setForm(f => ({ ...f, secure: v }))} data-testid="switch-smtp-secure" />
                  <Label className="text-sm">SSL/TLS (port 465)</Label>
                </div>
              </div>
              <div>
                <Label className="text-sm">{currentPreset?.id === "mailjet" ? "API Key (Username) *" : "Username / Email *"}</Label>
                <Input value={form.user} onChange={e => setForm(f => ({ ...f, user: e.target.value }))}
                  placeholder={currentPreset?.id === "mailjet" ? "Mailjet API Key" : currentPreset?.id === "brevo" ? "ดู Login ใน Brevo → SMTP & API → SMTP (เช่น a8dd...@smtp-brevo.com)" : "yourmail@example.com"}
                  data-testid="input-smtp-user" />
              </div>
              <div>
                <Label className="text-sm">{currentPreset?.passLabel || "Password"}</Label>
                {form.pass.startsWith("••••") ? (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 border rounded-md px-3 py-2 bg-green-50 border-green-300 text-sm text-green-700 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      <span>Key ถูกบันทึกในระบบแล้ว</span>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="shrink-0 text-rose-600 border-rose-300 hover:bg-rose-50"
                      onClick={() => setForm(f => ({ ...f, pass: "" }))} data-testid="btn-clear-smtp-pass">
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> เปลี่ยน Key
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-1">
                    <Input type={showPass ? "text" : "password"} value={form.pass}
                      onChange={e => setForm(f => ({ ...f, pass: e.target.value }))}
                      placeholder="วาง SMTP Key ที่นี่"
                      className="flex-1 font-mono text-xs"
                      data-testid="input-smtp-pass"
                      autoComplete="off"
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => setShowPass(!showPass)}>
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                )}
                {!form.pass.startsWith("••••") && form.pass && (
                  <p className="text-[10px] text-amber-600 mt-1">กรุณากด "บันทึก" ก่อนทดสอบ เพื่อให้ระบบใช้ Key ใหม่นี้</p>
                )}
              </div>
              <div>
                <Label className="text-sm">From Email</Label>
                <Input value={form.from} onChange={e => setForm(f => ({ ...f, from: e.target.value }))} placeholder="E-Tax Center &lt;noreply@example.com&gt;" data-testid="input-smtp-from" />
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs font-medium mb-2">ทดสอบการส่ง Email</p>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  placeholder="yourmail@gmail.com"
                  className="flex-1"
                  data-testid="input-test-email"
                />
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
                      toast({ title: "กรุณากรอก email address ที่ถูกต้อง", variant: "destructive" });
                      return;
                    }
                    handleTest();
                  }}
                  disabled={testing || !testEmail}
                  data-testid="btn-test-smtp"
                >
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">ระบบจะส่ง OTP ทดสอบไปที่ email นี้</p>
            </div>
          </div>
        )}
        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} data-testid="btn-close-smtp">ปิด</Button>
          <Button className="bg-[#fb9678] hover:bg-[#e8855a] text-white" onClick={handleSave} disabled={saving} data-testid="btn-save-smtp">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />} บันทึก
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResendConfigDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");
  const [from, setFrom] = useState("noreply@etaxerp.com");
  const [testEmail, setTestEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    fetch("/api/sysadmin/resend-config", { credentials: "include" })
      .then(r => r.json()).then(d => {
        setHasKey(!!d.hasKey);
        setFrom(d.from || "noreply@etaxerp.com");
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!apiKey && !hasKey) { toast({ title: "กรุณากรอก API Key", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body: any = { from };
      if (apiKey) body.apiKey = apiKey;
      else body.apiKey = "__keep__";
      const res = await fetch("/api/sysadmin/resend-config", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      setHasKey(true); setApiKey("");
      toast({ title: "บันทึก Resend config สำเร็จ ✅" });
    } catch (e: any) { toast({ title: "บันทึกล้มเหลว", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!testEmail) { toast({ title: "กรุณากรอก email ทดสอบ", variant: "destructive" }); return; }
    setTesting(true);
    try {
      const body: any = { from, testEmail };
      if (apiKey) body.apiKey = apiKey;
      const res = await fetch("/api/sysadmin/resend-config/test", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message);
      toast({ title: "ส่ง email ทดสอบสำเร็จ ✅", description: d.message });
    } catch (e: any) { toast({ title: "ส่ง email ล้มเหลว", description: e.message, variant: "destructive" }); }
    finally { setTesting(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="dialog-resend-config">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2"><Send className="h-5 w-5 text-violet-500" /> ตั้งค่า Resend Email API</h2>
          <p className="text-xs text-gray-500 mt-1">ใช้สำหรับส่งใบ 50 ทวิ และเอกสารต่างๆ ทาง email — ลงทะเบียนได้ที่ resend.com</p>
        </div>
        {loading ? (
          <div className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" /></div>
        ) : (
          <div className="p-5 space-y-4">
            {hasKey && (
              <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> ตั้งค่า API Key แล้ว — กรอก key ใหม่เพื่อเปลี่ยน
              </div>
            )}
            <div>
              <Label className="text-sm">Resend API Key *</Label>
              <div className="relative mt-1">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={hasKey ? "(ไม่เปลี่ยน — กรอกเพื่ออัปเดต)" : "re_xxxxxxxxxxxxxxxx"}
                  className="pr-10"
                  data-testid="input-resend-api-key"
                />
                <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">เข้า resend.com/api-keys → Create API Key → copy ค่าที่ขึ้นต้นด้วย re_</p>
            </div>
            <div>
              <Label className="text-sm">From Address (verified domain)</Label>
              <Input value={from} onChange={e => setFrom(e.target.value)} placeholder="noreply@etaxerp.com" className="mt-1" data-testid="input-resend-from" />
              <p className="text-xs text-gray-400 mt-1">ต้อง verify domain นี้ใน Resend dashboard ก่อน — ชื่อบริษัทลูกค้าจะแสดงเป็น display name อัตโนมัติ</p>
            </div>
            <div className="rounded-md bg-violet-50 border border-violet-100 px-3 py-2 text-xs text-violet-700">
              <strong>ตัวอย่างที่คู่ค้าเห็น:</strong><br />
              จาก: <span className="font-mono">บริษัท ABC จำกัด &lt;{from || "noreply@etaxerp.com"}&gt;</span><br />
              ตอบกลับ: email ของบริษัทลูกค้า (ถ้ากรอกไว้ในระบบ)
            </div>
            <div className="border-t pt-4">
              <Label className="text-sm">ทดสอบส่งอีเมล</Label>
              <div className="flex gap-2 mt-1">
                <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="your@email.com" data-testid="input-resend-test-email" />
                <Button variant="outline" onClick={handleTest} disabled={testing || (!apiKey && !hasKey)} className="shrink-0" data-testid="btn-test-resend">
                  {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}
        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} data-testid="btn-close-resend">ปิด</Button>
          <Button className="bg-violet-600 hover:bg-violet-700 text-white" onClick={handleSave} disabled={saving || loading} data-testid="btn-save-resend">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />} บันทึก
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordDialog({ admin, onClose, policy }: { admin: SysAdminUser; onClose: () => void; policy: PasswordPolicy | null }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const resetMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sysadmin/users/${admin.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.errors?.join(", ") || err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      toast({ title: "รีเซ็ตรหัสผ่านสำเร็จ" });
      onClose();
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="dialog-reset-password">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold">รีเซ็ตรหัสผ่าน: {admin.fullName}</h2>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <Label className="text-sm font-medium">รหัสผ่านใหม่ *</Label>
            <div className="flex gap-2">
              <Input
                className="font-mono flex-1"
                type={showPw ? "text" : "password"}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="รหัสผ่านใหม่"
                data-testid="input-reset-password"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <PasswordStrengthBar password={newPassword} policy={policy} />
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> ผู้ใช้จะถูกบังคับให้เปลี่ยนรหัสผ่านเมื่อ login ครั้งถัดไป
            </p>
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> ยกเลิก
          </Button>
          <Button
            className="bg-[#fb9678] hover:bg-[#e8855a] text-white"
            onClick={() => resetMut.mutate()}
            disabled={resetMut.isPending || !newPassword}
            data-testid="btn-confirm-reset-password"
          >
            <Key className="h-4 w-4 mr-1" /> {resetMut.isPending ? "กำลังรีเซ็ต..." : "รีเซ็ตรหัสผ่าน"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PolicySettingsDialog({ policy, me, onClose }: { policy: PasswordPolicy; me: SysAdminUser; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // require2fa reflects THIS user's status:
  // master → always true (forced), non-master → true if they have a 2FA method set
  const my2faValue = me.isMaster ? true : !!(me.twoFactorMethod);

  const [form, setForm] = useState({
    minLength: policy.minLength,
    requireUppercase: policy.requireUppercase,
    requireLowercase: policy.requireLowercase,
    requireNumbers: policy.requireNumbers,
    requireSpecial: policy.requireSpecial,
    expiryDays: policy.expiryDays,
    historyCount: policy.historyCount,
    maxFailedAttempts: policy.maxFailedAttempts,
    lockoutMinutes: policy.lockoutMinutes,
    sessionTimeoutMinutes: policy.sessionTimeoutMinutes,
    require2fa: my2faValue,
    ipWhitelistEnabled: policy.ipWhitelistEnabled,
    ipWhitelist: (policy.ipWhitelist || []).join("\n"),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        ipWhitelist: form.ipWhitelist.split("\n").map(s => s.trim()).filter(Boolean),
      };
      const res = await fetch("/api/sysadmin/password-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/password-policy"] });
      toast({ title: "บันทึก Password Policy สำเร็จ" });
      onClose();
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="dialog-password-policy">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Settings className="h-5 w-5 text-[#fb9678]" /> Password Policy
          </h2>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold mb-3">ความแข็งแกร่งรหัสผ่าน</h3>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">ความยาวขั้นต่ำ</Label>
                <Input type="number" min={6} max={32} value={form.minLength} onChange={e => setForm({ ...form, minLength: Number(e.target.value) })} data-testid="input-policy-min-length" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">ตัวพิมพ์ใหญ่ (A-Z)</Label>
                  <Switch checked={form.requireUppercase} onCheckedChange={v => setForm({ ...form, requireUppercase: v })} data-testid="switch-policy-uppercase" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">ตัวพิมพ์เล็ก (a-z)</Label>
                  <Switch checked={form.requireLowercase} onCheckedChange={v => setForm({ ...form, requireLowercase: v })} data-testid="switch-policy-lowercase" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">ตัวเลข (0-9)</Label>
                  <Switch checked={form.requireNumbers} onCheckedChange={v => setForm({ ...form, requireNumbers: v })} data-testid="switch-policy-numbers" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm">อักขระพิเศษ</Label>
                  <Switch checked={form.requireSpecial} onCheckedChange={v => setForm({ ...form, requireSpecial: v })} data-testid="switch-policy-special" />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">อายุรหัสผ่านและประวัติ</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">หมดอายุทุกกี่วัน</Label>
                <Input type="number" min={0} max={365} value={form.expiryDays} onChange={e => setForm({ ...form, expiryDays: Number(e.target.value) })} data-testid="input-policy-expiry-days" />
              </div>
              <div>
                <Label className="text-sm">จำรหัสผ่านเก่ากี่ชุด</Label>
                <Input type="number" min={0} max={24} value={form.historyCount} onChange={e => setForm({ ...form, historyCount: Number(e.target.value) })} data-testid="input-policy-history-count" />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">การล็อคบัญชีและ Session</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-sm">ล็อคหลังใส่ผิดกี่ครั้ง</Label>
                <Input type="number" min={1} max={20} value={form.maxFailedAttempts} onChange={e => setForm({ ...form, maxFailedAttempts: Number(e.target.value) })} data-testid="input-policy-max-attempts" />
              </div>
              <div>
                <Label className="text-sm">ล็อคกี่นาที</Label>
                <Input type="number" min={1} max={1440} value={form.lockoutMinutes} onChange={e => setForm({ ...form, lockoutMinutes: Number(e.target.value) })} data-testid="input-policy-lockout-minutes" />
              </div>
              <div>
                <Label className="text-sm">Session Timeout</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.sessionTimeoutMinutes}
                  onChange={e => setForm({ ...form, sessionTimeoutMinutes: Number(e.target.value) })}
                  data-testid="select-session-timeout"
                >
                  <option value={5}>5 นาที</option>
                  <option value={10}>10 นาที</option>
                  <option value={15}>15 นาที</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1">ตัวเลือกเสริม <Badge variant="outline" className="text-[10px]">Optional</Badge></h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm flex items-center gap-1.5">
                    2FA (สำหรับฉัน)
                    {me.isMaster && <span className="text-[10px] bg-red-100 text-red-600 border border-red-200 rounded px-1.5 py-0.5 font-semibold">Master — บังคับเสมอ</span>}
                  </Label>
                  <p className="text-xs text-gray-400">
                    {me.isMaster
                      ? "Master SysAdmin ต้องผ่าน 2FA ทุกครั้งที่ login — เปลี่ยนไม่ได้"
                      : "เปิด = ต้องผ่าน 2FA ทุกครั้ง · ปิด = ข้าม 2FA ได้"}
                  </p>
                  <div className="flex items-start gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-700 mt-1">
                    <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 font-bold uppercase tracking-wide text-amber-800 text-[10px]">TODO</span>
                    <span>ต้องเพิ่ม column <code className="bg-amber-100 px-1 rounded">require_2fa</code> ใน <code className="bg-amber-100 px-1 rounded">sys_admins</code> (per-user) + enforce ใน login flow (backend task)</span>
                  </div>
                </div>
                <Switch
                  checked={form.require2fa}
                  onCheckedChange={v => !me.isMaster && setForm({ ...form, require2fa: v })}
                  disabled={me.isMaster}
                  data-testid="switch-policy-2fa"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">IP Whitelist</Label>
                  <p className="text-xs text-gray-400">จำกัดเฉพาะ IP ที่อนุญาต</p>
                </div>
                <Switch checked={form.ipWhitelistEnabled} onCheckedChange={v => setForm({ ...form, ipWhitelistEnabled: v })} data-testid="switch-policy-ip-whitelist" />
              </div>
              {form.ipWhitelistEnabled && (
                <div>
                  <Label className="text-sm">IP ที่อนุญาต (บรรทัดละ 1 IP)</Label>
                  <textarea
                    className="w-full font-mono text-sm border rounded-lg p-3 min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-[#fb9678]"
                    value={form.ipWhitelist}
                    onChange={e => setForm({ ...form, ipWhitelist: e.target.value })}
                    placeholder={"192.168.1.100\n10.0.0.1"}
                    data-testid="textarea-ip-whitelist"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> ยกเลิก
          </Button>
          <Button
            className="bg-[#fb9678] hover:bg-[#e8855a] text-white"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            data-testid="btn-save-policy"
          >
            <Check className="h-4 w-4 mr-1" /> {saveMut.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" }) + " " + dt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

function formatAuditDateTime(d: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  const time = `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  return (
    <span>
      <span className="text-gray-700">{date}</span>
      {" "}
      <span className="text-gray-400">{time}</span>
    </span>
  );
}

const AUDIT_CATEGORIES: Record<string, { label: string; style: string; icon: React.ReactNode; actions: string[] }> = {
  auth: {
    label: "Authentication",
    style: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <LogIn className="h-3 w-3" />,
    actions: ["login_success", "login_failed", "login_blocked", "login_blocked_ip", "login_locked", "login_2fa_pending", "login_2fa_otp_sent", "login_2fa_verified", "logout", "session_timeout", "account_locked"],
  },
  user_mgmt: {
    label: "User Mgmt",
    style: "bg-green-50 text-green-700 border-green-200",
    icon: <UserCog className="h-3 w-3" />,
    actions: ["create_sysadmin", "update_sysadmin", "delete_sysadmin"],
  },
  security: {
    label: "Security",
    style: "bg-orange-50 text-orange-700 border-orange-200",
    icon: <Shield className="h-3 w-3" />,
    actions: ["change_password", "reset_password", "force_change_password", "unlock_account", "update_password_policy", "reset_2fa", "delete_audit_logs"],
  },
  setup: {
    label: "Setup",
    style: "bg-purple-50 text-purple-700 border-purple-200",
    icon: <Wrench className="h-3 w-3" />,
    actions: ["bootstrap_master", "bootstrap_2fa_sent", "bootstrap_2fa_email_pending", "bootstrap_2fa_verified", "bootstrap_2fa_email_skipped"],
  },
};

function getAuditCategory(action: string) {
  for (const [, cat] of Object.entries(AUDIT_CATEGORIES)) {
    if (cat.actions.includes(action)) return cat;
  }
  return { label: "Other", style: "bg-gray-50 text-gray-600 border-gray-200", icon: <Clock className="h-3 w-3" />, actions: [] };
}

function getActionBadgeColor(action: string): string {
  const red = ["login_failed", "login_blocked", "login_blocked_ip", "account_locked", "delete_sysadmin", "delete_audit_logs"];
  const green = ["login_success", "login_2fa_verified", "create_sysadmin", "unlock_account", "bootstrap_2fa_verified"];
  const amber = ["login_locked", "login_blocked", "force_change_password", "login_2fa_pending", "session_timeout"];
  const gray = ["logout", "login_2fa_otp_sent", "login_2fa_pending", "bootstrap_2fa_sent", "bootstrap_2fa_email_pending"];
  if (red.includes(action)) return "border-rose-300 text-rose-700 bg-rose-50";
  if (green.includes(action)) return "border-emerald-300 text-emerald-700 bg-emerald-50";
  if (amber.includes(action)) return "border-amber-300 text-amber-700 bg-amber-50";
  if (gray.includes(action)) return "border-gray-300 text-gray-500 bg-gray-50";
  return "border-slate-300 text-slate-600 bg-slate-50";
}

export default function SysAdminManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<SysAdminUser | null>(null);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [resetTarget, setResetTarget] = useState<SysAdminUser | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "audit">("users");
  const [show2FA, setShow2FA] = useState(false);
  const [showSmtp, setShowSmtp] = useState(false);
  const [reset2FATarget, setReset2FATarget] = useState<SysAdminUser | null>(null);

  const [auditSearch, setAuditSearch] = useState("");
  const [auditCategory, setAuditCategory] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");
  const [auditPage, setAuditPage] = useState(0);
  const AUDIT_PAGE_SIZE = 25;
  const [selectedLogIds, setSelectedLogIds] = useState<Set<number>>(new Set());
  const [showAuditDeleteConfirm, setShowAuditDeleteConfirm] = useState(false);

  const { data: admins = [], isLoading } = useQuery<SysAdminUser[]>({
    queryKey: ["/api/sysadmin/users"],
  });

  const { data: policy } = useQuery<PasswordPolicy>({
    queryKey: ["/api/sysadmin/password-policy"],
  });

  const auditParams = new URLSearchParams();
  auditParams.set("limit", String(AUDIT_PAGE_SIZE));
  auditParams.set("offset", String(auditPage * AUDIT_PAGE_SIZE));
  if (auditSearch.trim()) auditParams.set("search", auditSearch.trim());
  if (auditCategory) auditParams.set("category", auditCategory);
  if (auditDateFrom) auditParams.set("dateFrom", auditDateFrom);
  if (auditDateTo) auditParams.set("dateTo", auditDateTo);

  const { data: auditData, refetch: refetchAudit } = useQuery<{ logs: AuditLogEntry[]; total: number }>({
    queryKey: ["/api/sysadmin/audit-log", auditPage, auditSearch, auditCategory, auditDateFrom, auditDateTo],
    queryFn: async () => {
      const res = await fetch(`/api/sysadmin/audit-log?${auditParams.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    enabled: activeTab === "audit",
  });

  const { data: meData } = useQuery<SysAdminUser & { mustChangePassword: boolean }>({
    queryKey: ["/api/sysadmin/me"],
  });

  const deleteAuditBulkMut = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/sysadmin/audit-log/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      setSelectedLogIds(new Set());
      setShowAuditDeleteConfirm(false);
      refetchAudit();
      toast({ title: data.message, variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "ลบไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const toggleActiveMut = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await fetch(`/api/sysadmin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      toast({ title: "อัพเดทสถานะสำเร็จ" });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const forceChangeMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/sysadmin/users/${id}/force-change-password`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      toast({ title: "บังคับเปลี่ยนรหัสผ่านสำเร็จ" });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const unlockMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/sysadmin/users/${id}/unlock`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      toast({ title: "ปลดล็อคบัญชีสำเร็จ" });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/sysadmin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      toast({ title: "ลบ SysAdmin สำเร็จ" });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const reset2FAMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/sysadmin/users/${id}/reset-2fa`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sysadmin/users"] });
      toast({ title: "รีเซ็ต 2FA สำเร็จ" });
      setReset2FATarget(null);
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const isMasterCaller = meData?.isMaster;

  const getPasswordStatus = (admin: SysAdminUser) => {
    if (admin.mustChangePassword) return { label: "ต้องเปลี่ยนรหัส", color: "text-amber-600 bg-amber-50 border-amber-300" };
    if (!admin.passwordChangedAt) return { label: "ยังไม่เคยเปลี่ยน", color: "text-red-600 bg-red-50 border-red-300" };
    const daysSince = Math.floor((Date.now() - new Date(admin.passwordChangedAt).getTime()) / 86400000);
    if (daysSince >= admin.passwordExpiryDays) return { label: "หมดอายุ", color: "text-red-600 bg-red-50 border-red-300" };
    if (daysSince >= admin.passwordExpiryDays - 14) return { label: `หมดอายุใน ${admin.passwordExpiryDays - daysSince} วัน`, color: "text-amber-600 bg-amber-50 border-amber-300" };
    return { label: `เปลี่ยนล่าสุด ${daysSince} วันก่อน`, color: "text-green-600 bg-green-50 border-green-300" };
  };

  const isLocked = (admin: SysAdminUser) => admin.lockedUntil && new Date(admin.lockedUntil) > new Date();

  return (
    <SysAdminLayout>
      <div className="max-w-6xl mx-auto" data-testid="page-sysadmin-management">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-7 w-7 text-[#fb9678]" />
              จัดการ SysAdmin
              <Badge variant="outline" className="text-xs ml-1">{admins.length} คน</Badge>
            </h1>
            <p className="text-sm text-gray-500 mt-1">จัดการผู้ดูแลระบบ Password Policy และความปลอดภัย</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 mr-2">
              <button
                onClick={() => setActiveTab("users")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === "users" ? "bg-[#fb9678] text-white" : "text-gray-500 hover:bg-gray-100"}`}
                data-testid="tab-users"
              >
                <UserCog className="h-4 w-4 inline mr-1" /> ผู้ดูแล
              </button>
              <button
                onClick={() => setActiveTab("audit")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === "audit" ? "bg-[#fb9678] text-white" : "text-gray-500 hover:bg-gray-100"}`}
                data-testid="tab-audit"
              >
                <Clock className="h-4 w-4 inline mr-1" /> Audit Log
              </button>
            </div>
            {meData && (
              <Button size="sm" variant="outline" onClick={() => setShow2FA(true)} className="h-9 border-[#fb9678] text-[#fb9678] hover:bg-orange-50" data-testid="btn-my-2fa">
                <ShieldCheck className="h-4 w-4 mr-1" /> 2FA ของฉัน
              </Button>
            )}
            {isMasterCaller && (
              <Button size="sm" variant="outline" onClick={() => setShowResend(true)} className="h-9 border-violet-400 text-violet-600 hover:bg-violet-50" data-testid="btn-resend-config">
                <Send className="h-4 w-4 mr-1" /> Resend Email
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowSmtp(true)} className="h-9" data-testid="btn-smtp-config">
              <Wifi className="h-4 w-4 mr-1" /> ตั้งค่า Email
            </Button>
            {isMasterCaller && (
              <Button size="sm" variant="outline" onClick={() => setShowPolicy(true)} className="h-9" data-testid="btn-open-policy">
                <Settings className="h-4 w-4 mr-1" /> Password Policy
              </Button>
            )}
            <Button size="sm" className="bg-[#fb9678] hover:bg-[#e8855a] text-white h-9" onClick={() => setShowAdd(true)} data-testid="btn-add-sysadmin">
              <Plus className="h-4 w-4 mr-1" /> เพิ่ม SysAdmin
            </Button>
          </div>
        </div>

        {activeTab === "users" && policy && (
          <>
            {/* TODO banner — policy scope */}
            <div className="flex items-start gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 mb-3">
              <span className="mt-0.5 shrink-0 rounded bg-amber-200 px-1.5 py-0.5 font-bold uppercase tracking-wide text-amber-800 text-[10px]">TODO</span>
              <span>
                Policy นี้ตอนนี้เป็น <span className="font-semibold">Global</span> (ใช้ร่วมกันทุก server){" "}
                — ควรเปลี่ยนให้เป็น <span className="font-semibold">Per-Server</span> คือแต่ละ server มี policy ของตัวเอง
                (ต้องเพิ่ม <code className="bg-amber-100 px-1 rounded">machine_id</code> FK ใน <code className="bg-amber-100 px-1 rounded">sys_admin_password_policy</code> — backend task)
              </span>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-1">
                <div className="bg-white border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-[#fb9678]">{policy.minLength}</div>
                  <div className="text-xs text-gray-500">ความยาวขั้นต่ำ</div>
                </div>
                <div className="bg-white border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-[#fb9678]">{policy.expiryDays}</div>
                  <div className="text-xs text-gray-500">วันหมดอายุ</div>
                </div>
                <div className="bg-white border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-[#fb9678]">{policy.historyCount}</div>
                  <div className="text-xs text-gray-500">จำรหัสเก่า</div>
                </div>
                <div className="bg-white border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-[#fb9678]">{policy.maxFailedAttempts}</div>
                  <div className="text-xs text-gray-500">ใส่ผิดก่อนล็อค</div>
                </div>
                <div className="bg-white border rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-[#fb9678]">{policy.lockoutMinutes}</div>
                  <div className="text-xs text-gray-500">นาทีล็อค</div>
                </div>
              </div>
              {/* Edit button — master only */}
              <div className="shrink-0 flex flex-col items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => isMasterCaller && setShowPolicy(true)}
                  disabled={!isMasterCaller}
                  title={isMasterCaller ? "แก้ไข Password Policy" : "เฉพาะ Master เท่านั้น"}
                  className="h-9 w-9 p-0"
                  data-testid="btn-open-policy"
                >
                  {isMasterCaller ? <Settings className="h-4 w-4" /> : <Lock className="h-4 w-4 text-gray-300" />}
                </Button>
                <span className="text-[10px] text-gray-400">{isMasterCaller ? "แก้ไข" : "Master only"}</span>
              </div>
            </div>
          </>
        )}

        {activeTab === "users" && (isLoading ? (
          <div className="text-center py-12 text-gray-400">กำลังโหลด...</div>
        ) : admins.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Shield className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">ยังไม่มี SysAdmin ในระบบ</p>
              <Button className="mt-4 bg-[#fb9678] hover:bg-[#e8855a] text-white" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4 mr-1" /> เพิ่ม SysAdmin คนแรก
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {admins.map(admin => {
              const pwStatus = getPasswordStatus(admin);
              const locked = isLocked(admin);
              const canManage = !admin.isMaster || meData?.id === admin.id;
              return (
                <div
                  key={admin.id}
                  className={`bg-white border rounded-xl p-4 transition-all hover:shadow-sm ${admin.isMaster ? "border-amber-400 ring-1 ring-amber-200" : ""} ${!admin.active ? "opacity-60" : ""}`}
                  data-testid={`card-sysadmin-${admin.id}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${admin.isMaster ? "bg-amber-100" : "bg-gray-100"}`}>
                      {admin.isMaster ? <Crown className="h-5 w-5 text-amber-600" /> : <UserCog className="h-5 w-5 text-gray-500" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{admin.fullName}</span>
                        <span className="text-xs text-gray-400 font-mono">@{admin.username}</span>
                        {admin.isMaster && <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0">Master</Badge>}
                        {!admin.active && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-500">ระงับ</Badge>}
                        {locked && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-500 flex items-center gap-0.5"><Lock className="h-2.5 w-2.5" /> ล็อค</Badge>}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
                        {admin.email && <span>{admin.email}</span>}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> เข้าสู่ระบบล่าสุด: {formatDate(admin.lastLoginAt)}
                        </span>
                        {admin.lastLoginIp && <span className="font-mono text-[10px]">IP: {admin.lastLoginIp}</span>}
                      </div>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${pwStatus.color}`}>
                          <Key className="h-2.5 w-2.5 mr-0.5" /> {pwStatus.label}
                        </Badge>
                        {admin.failedLoginAttempts > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300 text-orange-600">
                            ใส่ผิด {admin.failedLoginAttempts} ครั้ง
                          </Badge>
                        )}
                        {admin.twoFactorMethod === "line" && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${admin.twoFactorVerified ? "border-green-400 text-green-700" : "border-amber-400 text-amber-700"}`}>
                            <MessageCircle className="h-2.5 w-2.5 mr-0.5" /> LINE {admin.twoFactorVerified ? "✓" : "⏳"}
                          </Badge>
                        )}
                        {admin.twoFactorMethod === "totp" && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-400 text-purple-700">
                            <Smartphone className="h-2.5 w-2.5 mr-0.5" /> TOTP ✓
                          </Badge>
                        )}
                        {admin.twoFactorMethod === "email" && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${admin.emailVerified ? "border-blue-400 text-blue-700" : "border-amber-400 text-amber-700"}`}>
                            <Mail className="h-2.5 w-2.5 mr-0.5" /> Email {admin.emailVerified ? "✓" : "⏳"}
                          </Badge>
                        )}
                        {!admin.twoFactorMethod && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-500">
                            <ShieldOff className="h-2.5 w-2.5 mr-0.5" /> ไม่มี 2FA
                          </Badge>
                        )}
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        {locked && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-green-400 text-green-700" onClick={() => unlockMut.mutate(admin.id)} data-testid={`btn-unlock-${admin.id}`}>
                            <Unlock className="h-3 w-3 mr-1" /> ปลดล็อค
                          </Button>
                        )}
                        {canManage && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-600" onClick={() => setEditTarget(admin)} data-testid={`btn-edit-${admin.id}`}>
                            <Pencil className="h-3 w-3 mr-1" /> แก้ไข
                          </Button>
                        )}
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setResetTarget(admin)} data-testid={`btn-reset-pw-${admin.id}`}>
                          <Key className="h-3 w-3 mr-1" /> รีเซ็ตรหัส
                        </Button>
                        {!admin.mustChangePassword && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-amber-400 text-amber-700" onClick={() => forceChangeMut.mutate(admin.id)} data-testid={`btn-force-change-${admin.id}`}>
                            <RefreshCw className="h-3 w-3 mr-1" /> บังคับเปลี่ยนรหัส
                          </Button>
                        )}
                        {isMasterCaller && !admin.isMaster && (
                          <Button size="sm" variant="outline" className="h-7 text-xs border-rose-300 text-rose-600" onClick={() => setReset2FATarget(admin)} data-testid={`btn-reset-2fa-${admin.id}`}>
                            <ShieldOff className="h-3 w-3 mr-1" /> รีเซ็ต 2FA
                          </Button>
                        )}
                        {!admin.isMaster && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-7 text-xs ${admin.active ? "border-red-300 text-red-600" : "border-green-400 text-green-700"}`}
                              onClick={() => toggleActiveMut.mutate({ id: admin.id, active: !admin.active })}
                              data-testid={`btn-toggle-active-${admin.id}`}
                            >
                              {admin.active ? <><Ban className="h-3 w-3 mr-1" /> ระงับ</> : <><CheckCircle2 className="h-3 w-3 mr-1" /> เปิดใช้งาน</>}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-500 hover:text-red-700"
                              onClick={() => { if (confirm(`ยืนยันลบ ${admin.fullName}?`)) deleteMut.mutate(admin.id); }}
                              data-testid={`btn-delete-${admin.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {activeTab === "audit" && (
          <div className="space-y-3" data-testid="audit-log-section">
            {/* Follow-up note: bootstrap actions only visible on fresh server */}
            <div className="flex items-start gap-2 rounded-md border border-dashed border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              <span className="shrink-0 rounded bg-blue-200 px-1.5 py-0.5 font-bold uppercase tracking-wide text-blue-800 text-[10px]">NOTE</span>
              <span>
                2 action ที่ยังไม่ได้ verify เพราะเกิดขึ้นก่อน audit log ถูก fix:{" "}
                <span className="font-semibold">bootstrap_master</span> (สร้าง Master SysAdmin ครั้งแรก) และ{" "}
                <span className="font-semibold">create_sysadmin</span> (สร้าง non-master คนแรก){" "}
                — ต้อง test บน server ใหม่ (fresh) เท่านั้น
              </span>
            </div>
            {/* Filter Bar */}
            <div className="bg-white border rounded-xl p-3 flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[180px]">
                <label className="text-[11px] text-gray-500 mb-1 block">ค้นหา</label>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    value={auditSearch}
                    onChange={e => { setAuditSearch(e.target.value); setAuditPage(0); setSelectedLogIds(new Set()); }}
                    placeholder="ผู้ใช้, action, เป้าหมาย, รายละเอียด..."
                    className="pl-8 h-8 text-xs"
                    data-testid="input-audit-search"
                  />
                </div>
              </div>
              <div className="min-w-[150px]">
                <label className="text-[11px] text-gray-500 mb-1 block">ประเภทเหตุการณ์</label>
                <select
                  value={auditCategory}
                  onChange={e => { setAuditCategory(e.target.value); setAuditPage(0); setSelectedLogIds(new Set()); }}
                  className="w-full h-8 text-xs border rounded-md px-2 bg-white"
                  data-testid="select-audit-category"
                >
                  <option value="">ทั้งหมด</option>
                  <option value="auth">Authentication (เข้า/ออกระบบ)</option>
                  <option value="user_mgmt">User Management (จัดการผู้ใช้)</option>
                  <option value="security">Security (ความปลอดภัย)</option>
                  <option value="setup">Setup (ตั้งค่าระบบ)</option>
                </select>
              </div>
              <div className="min-w-[130px]">
                <label className="text-[11px] text-gray-500 mb-1 block flex items-center gap-1"><Calendar className="h-3 w-3" /> จากวันที่</label>
                <Input
                  type="date"
                  value={auditDateFrom}
                  onChange={e => { setAuditDateFrom(e.target.value); setAuditPage(0); setSelectedLogIds(new Set()); }}
                  className="h-8 text-xs"
                  data-testid="input-audit-date-from"
                />
              </div>
              <div className="min-w-[130px]">
                <label className="text-[11px] text-gray-500 mb-1 block flex items-center gap-1"><Calendar className="h-3 w-3" /> ถึงวันที่</label>
                <Input
                  type="date"
                  value={auditDateTo}
                  onChange={e => { setAuditDateTo(e.target.value); setAuditPage(0); setSelectedLogIds(new Set()); }}
                  className="h-8 text-xs"
                  data-testid="input-audit-date-to"
                />
              </div>
              {(auditSearch || auditCategory || auditDateFrom || auditDateTo) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-gray-500 mt-4"
                  onClick={() => { setAuditSearch(""); setAuditCategory(""); setAuditDateFrom(""); setAuditDateTo(""); setAuditPage(0); setSelectedLogIds(new Set()); }}
                  data-testid="btn-audit-clear-filters"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> ล้าง filter
                </Button>
              )}
            </div>

            {/* Actions bar */}
            {isMasterCaller && selectedLogIds.size > 0 && (
              <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2">
                <span className="text-sm text-rose-700 font-medium">เลือกแล้ว {selectedLogIds.size} รายการ</span>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  onClick={() => setShowAuditDeleteConfirm(true)}
                  data-testid="btn-audit-delete-selected"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> ลบที่เลือก
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedLogIds(new Set())}>
                  <X className="h-3.5 w-3.5 mr-1" /> ยกเลิก
                </Button>
              </div>
            )}

            {/* Table */}
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      {isMasterCaller && (
                        <th className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={!!auditData?.logs?.length && auditData.logs.every(l => selectedLogIds.has(l.id))}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedLogIds(prev => {
                                  const next = new Set(prev);
                                  auditData?.logs?.forEach(l => next.add(l.id));
                                  return next;
                                });
                              } else {
                                setSelectedLogIds(prev => {
                                  const next = new Set(prev);
                                  auditData?.logs?.forEach(l => next.delete(l.id));
                                  return next;
                                });
                              }
                            }}
                            data-testid="checkbox-audit-select-all"
                          />
                        </th>
                      )}
                      <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs whitespace-nowrap">วันที่ / เวลา</th>
                      <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs">ผู้ดำเนินการ</th>
                      <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs">ประเภท</th>
                      <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs">การกระทำ</th>
                      <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs">เป้าหมาย</th>
                      <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs">รายละเอียด</th>
                      <th className="text-left px-3 py-3 font-medium text-gray-600 text-xs">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!auditData?.logs || auditData.logs.length === 0) ? (
                      <tr>
                        <td colSpan={isMasterCaller ? 8 : 7} className="text-center py-12 text-gray-400 text-sm">
                          {(auditSearch || auditCategory || auditDateFrom || auditDateTo) ? "ไม่พบรายการที่ตรงกับ filter" : "ยังไม่มี Audit Log"}
                        </td>
                      </tr>
                    ) : auditData.logs.map(log => {
                      const cat = getAuditCategory(log.action);
                      return (
                        <tr
                          key={log.id}
                          className={`border-b hover:bg-gray-50 transition-colors ${selectedLogIds.has(log.id) ? "bg-rose-50" : ""}`}
                          data-testid={`audit-row-${log.id}`}
                        >
                          {isMasterCaller && (
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                className="rounded"
                                checked={selectedLogIds.has(log.id)}
                                onChange={e => {
                                  setSelectedLogIds(prev => {
                                    const next = new Set(prev);
                                    e.target.checked ? next.add(log.id) : next.delete(log.id);
                                    return next;
                                  });
                                }}
                                data-testid={`checkbox-audit-${log.id}`}
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap font-mono">
                            {formatAuditDateTime(log.createdAt)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs font-medium">{log.sysAdminUsername}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cat.style}`}>
                              {cat.icon}
                              {cat.label}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={`text-[10px] font-mono ${getActionBadgeColor(log.action)}`}>
                              {log.action}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs">{log.targetName || <span className="text-gray-300">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-[240px]">
                            {log.details
                              ? <span title={log.details} className="block truncate">{log.details}</span>
                              : <span className="text-gray-300">—</span>
                            }
                          </td>
                          <td className="px-3 py-2 font-mono text-[10px] text-gray-400 whitespace-nowrap">{log.ipAddress || <span className="text-gray-300">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination footer */}
              <div className="px-4 py-2.5 border-t bg-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {auditData?.total
                    ? `แสดง ${auditPage * AUDIT_PAGE_SIZE + 1}–${Math.min((auditPage + 1) * AUDIT_PAGE_SIZE, auditData.total)} จาก ${auditData.total} รายการ`
                    : "ไม่มีข้อมูล"
                  }
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={auditPage === 0}
                    onClick={() => { setAuditPage(p => p - 1); setSelectedLogIds(new Set()); }}
                    data-testid="btn-audit-prev"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-gray-600 px-2">หน้า {auditPage + 1} / {Math.ceil((auditData?.total || 0) / AUDIT_PAGE_SIZE) || 1}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    disabled={(auditPage + 1) * AUDIT_PAGE_SIZE >= (auditData?.total || 0)}
                    onClick={() => { setAuditPage(p => p + 1); setSelectedLogIds(new Set()); }}
                    data-testid="btn-audit-next"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showAdd && <AddSysAdminDialog onClose={() => setShowAdd(false)} policy={policy || null} />}
      {editTarget && <EditSysAdminDialog admin={editTarget} me={meData} onClose={() => setEditTarget(null)} />}
      {resetTarget && <ResetPasswordDialog admin={resetTarget} onClose={() => setResetTarget(null)} policy={policy || null} />}
      {showPolicy && policy && meData && <PolicySettingsDialog policy={policy} me={meData as SysAdminUser} onClose={() => setShowPolicy(false)} />}
      {show2FA && meData && <My2FADialog me={meData as SysAdminUser} onClose={() => setShow2FA(false)} />}
      {showSmtp && <SmtpConfigDialog onClose={() => setShowSmtp(false)} />}
      {showResend && <ResendConfigDialog onClose={() => setShowResend(false)} />}

      {showAuditDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="dialog-confirm-audit-delete">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-base flex items-center gap-2 mb-2">
              <Trash2 className="h-5 w-5 text-rose-500" /> ยืนยันการลบ Audit Log
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              คุณกำลังจะลบ <strong className="text-rose-600">{selectedLogIds.size} รายการ</strong> ออกจากระบบอย่างถาวร
            </p>
            <p className="text-xs text-gray-400 mb-5">การดำเนินการนี้ไม่สามารถย้อนกลับได้ และจะบันทึกเป็น audit log ใหม่</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAuditDeleteConfirm(false)} data-testid="btn-cancel-audit-delete">ยกเลิก</Button>
              <Button
                variant="destructive"
                onClick={() => deleteAuditBulkMut.mutate(Array.from(selectedLogIds))}
                disabled={deleteAuditBulkMut.isPending}
                data-testid="btn-confirm-audit-delete"
              >
                {deleteAuditBulkMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                ลบถาวร {selectedLogIds.size} รายการ
              </Button>
            </div>
          </div>
        </div>
      )}
      {reset2FATarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" data-testid="dialog-confirm-reset-2fa">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-base flex items-center gap-2 mb-2">
              <ShieldOff className="h-5 w-5 text-rose-500" /> ยืนยันรีเซ็ต 2FA
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              รีเซ็ต 2FA ของ <strong>{reset2FATarget.fullName}</strong> — user จะต้องตั้งค่า 2FA ใหม่เมื่อ login
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReset2FATarget(null)} data-testid="btn-cancel-reset-2fa">ยกเลิก</Button>
              <Button className="bg-rose-600 hover:bg-rose-700 text-white" onClick={() => reset2FAMut.mutate(reset2FATarget.id)} disabled={reset2FAMut.isPending} data-testid="btn-confirm-reset-2fa">
                {reset2FAMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <ShieldOff className="h-4 w-4 mr-1" />} ยืนยันรีเซ็ต
              </Button>
            </div>
          </div>
        </div>
      )}
    </SysAdminLayout>
  );
}
