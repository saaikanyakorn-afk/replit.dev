import Layout from "@/components/layout";
import SettingsTabs from "@/components/settings-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Sliders, Save, Loader2, Bell, Globe, Clock, Shield, PenTool, Upload, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { apiRequest } from "@/lib/queryClient";

const EMPLOYEE_HR_MODULES = [
  { key: "hr/leave", label: "ขอลา / อนุมัติลา" },
  { key: "hr/ot", label: "จัดการ OT" },
  { key: "hr/attendance-report", label: "รายงานการลงเวลา" },
  { key: "hr/attendance", label: "ลงเวลาเข้า-ออก" },
  { key: "hr/ess", label: "ESS พนักงาน" },
];

export default function GeneralSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedCompanyId, selectedCompany } = useCompany();

  const [form, setForm] = useState({
    dateFormat: "DD/MM/YYYY",
    calendarType: "buddhist",
    language: "th",
    timezone: "Asia/Bangkok",
    notifyOnDocApproval: true,
    notifyOnOverdue: true,
    autoLogoutMinutes: "60",
    defaultPageSize: "50",
    showDecimalPlaces: "2",
    hiddenEmployeeModules: "" as string,
    authorizedSignerName: "",
    authorizedSignerTitle: "",
    authorizedSignerSignatureUrl: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/settings/general", selectedCompanyId],
    queryFn: async () => {
      const params = selectedCompanyId ? `?companyId=${selectedCompanyId}` : "";
      const r = await fetch(`/api/settings/general${params}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (settings) {
      setForm(prev => ({ ...prev, ...settings }));
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await apiRequest("PUT", `/api/settings/general?companyId=${selectedCompanyId}`, data);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "บันทึกสำเร็จ", description: "ตั้งค่าทั่วไปถูกอัปเดตแล้ว" });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/general"] });
    },
    onError: () => {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถบันทึกตั้งค่าได้", variant: "destructive" });
    },
  });

  const handleSave = () => mutation.mutate(form);

  if (isLoading) {
    return (
      <Layout>
        <SettingsTabs />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SettingsTabs />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#fb9678] flex items-center justify-center">
              <Sliders className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="text-page-title">ตั้งค่าทั่วไป</h1>
              <p className="text-sm text-muted-foreground">ตั้งค่าพื้นฐานของระบบ</p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={mutation.isPending} data-testid="button-save-general">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            บันทึก
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-5 w-5 text-[var(--theme-primary)]" />
              ภาษา & โซนเวลา
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ภาษาหลัก</Label>
                <Select value={form.language} onValueChange={(v) => setForm(prev => ({ ...prev, language: v }))}>
                  <SelectTrigger data-testid="select-language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="th">ไทย</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="zh">中文</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>โซนเวลา</Label>
                <Select value={form.timezone} onValueChange={(v) => setForm(prev => ({ ...prev, timezone: v }))}>
                  <SelectTrigger data-testid="select-timezone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Bangkok">Asia/Bangkok (UTC+7)</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (UTC-5)</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los_Angeles (UTC-8)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Asia/Tokyo (UTC+9)</SelectItem>
                    <SelectItem value="Asia/Shanghai">Asia/Shanghai (UTC+8)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-5 w-5 text-[#fec90f]" />
              การแจ้งเตือน
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>แจ้งเตือนเมื่ออนุมัติเอกสาร</Label>
                <p className="text-sm text-muted-foreground">ส่งการแจ้งเตือนเมื่อมีการอนุมัติเอกสาร</p>
              </div>
              <Switch
                checked={form.notifyOnDocApproval}
                onCheckedChange={(v) => setForm(prev => ({ ...prev, notifyOnDocApproval: v }))}
                data-testid="switch-notify-approval"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>แจ้งเตือนเอกสารเลยกำหนด</Label>
                <p className="text-sm text-muted-foreground">แจ้งเตือนเมื่อเอกสารเลยกำหนดชำระ</p>
              </div>
              <Switch
                checked={form.notifyOnOverdue}
                onCheckedChange={(v) => setForm(prev => ({ ...prev, notifyOnOverdue: v }))}
                data-testid="switch-notify-overdue"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-[#05b187]" />
              ระบบ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>ออกจากระบบอัตโนมัติ (นาที)</Label>
                <Select value={form.autoLogoutMinutes} onValueChange={(v) => setForm(prev => ({ ...prev, autoLogoutMinutes: v }))}>
                  <SelectTrigger data-testid="select-auto-logout">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 นาที</SelectItem>
                    <SelectItem value="30">30 นาที</SelectItem>
                    <SelectItem value="60">60 นาที</SelectItem>
                    <SelectItem value="120">120 นาที</SelectItem>
                    <SelectItem value="0">ไม่จำกัด</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>จำนวนแถวต่อหน้า</Label>
                <Select value={form.defaultPageSize} onValueChange={(v) => setForm(prev => ({ ...prev, defaultPageSize: v }))}>
                  <SelectTrigger data-testid="select-page-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25 แถว</SelectItem>
                    <SelectItem value="50">50 แถว</SelectItem>
                    <SelectItem value="100">100 แถว</SelectItem>
                    <SelectItem value="200">200 แถว</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>ทศนิยม</Label>
                <Select value={form.showDecimalPlaces} onValueChange={(v) => setForm(prev => ({ ...prev, showDecimalPlaces: v }))}>
                  <SelectTrigger data-testid="select-decimal-places">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">ไม่มีทศนิยม</SelectItem>
                    <SelectItem value="2">2 ตำแหน่ง</SelectItem>
                    <SelectItem value="4">4 ตำแหน่ง</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PenTool className="h-5 w-5 text-[#667eea]" />
              ลายเซ็นผู้มีอำนาจลงนาม
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ตั้งค่าลายเซ็นผู้บริหาร/ผู้มีอำนาจลงนาม จะถูกดึงไปใช้อัตโนมัติในสัญญาจ้างทำบัญชี
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">ชื่อผู้มีอำนาจลงนาม</Label>
                <Input
                  value={form.authorizedSignerName}
                  onChange={(e) => setForm(prev => ({ ...prev, authorizedSignerName: e.target.value }))}
                  placeholder="เช่น นางสาวกัลยกร สมบูรณ์"
                  data-testid="input-signer-name"
                />
              </div>
              <div>
                <Label className="text-sm">ตำแหน่ง</Label>
                <Input
                  value={form.authorizedSignerTitle}
                  onChange={(e) => setForm(prev => ({ ...prev, authorizedSignerTitle: e.target.value }))}
                  placeholder="เช่น กรรมการผู้จัดการ"
                  data-testid="input-signer-title"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">ลายเซ็น</Label>
              {form.authorizedSignerSignatureUrl ? (
                <div className="mt-2 border rounded-lg p-3 bg-gray-50 flex items-center gap-3">
                  <img src={form.authorizedSignerSignatureUrl} alt="ลายเซ็นผู้มีอำนาจ" className="h-16 border rounded bg-white p-1" />
                  <div className="flex-1">
                    <p className="text-xs text-green-600 font-medium">บันทึกลายเซ็นแล้ว</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm(prev => ({ ...prev, authorizedSignerSignatureUrl: "" }))}
                    data-testid="btn-remove-signer-sig"
                  >
                    <X className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ) : (
                <div className="mt-2">
                  <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed rounded-lg p-4 text-center hover:bg-gray-50 transition-colors">
                    <Upload className="h-5 w-5 text-gray-400 mx-auto" />
                    <span className="text-sm text-gray-500">อัปโหลดรูปลายเซ็น (PNG/JPG)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      data-testid="input-signer-sig-upload"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setForm(prev => ({ ...prev, authorizedSignerSignatureUrl: ev.target?.result as string }));
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-5 w-5 text-[#f94d4d]" />
              เมนู HR ที่ซ่อนจากพนักงาน
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground mb-2">
              เลือกเมนูที่ต้องการซ่อนจากพนักงาน (role: employee) เมนูที่ถูกเลือกจะไม่แสดงในแถบเมนูของพนักงาน
            </p>
            {EMPLOYEE_HR_MODULES.map((mod) => {
              const hiddenList: string[] = form.hiddenEmployeeModules ? (() => { try { return JSON.parse(form.hiddenEmployeeModules); } catch { return []; } })() : [];
              const isHidden = hiddenList.includes(mod.key);
              return (
                <div key={mod.key} className="flex items-center gap-3 py-1">
                  <Checkbox
                    id={`hide-${mod.key}`}
                    checked={isHidden}
                    onCheckedChange={(checked) => {
                      let list: string[];
                      try { list = form.hiddenEmployeeModules ? JSON.parse(form.hiddenEmployeeModules) : []; } catch { list = []; }
                      if (checked) {
                        if (!list.includes(mod.key)) list.push(mod.key);
                      } else {
                        list = list.filter((k: string) => k !== mod.key);
                      }
                      setForm(prev => ({ ...prev, hiddenEmployeeModules: JSON.stringify(list) }));
                    }}
                    data-testid={`checkbox-hide-${mod.key}`}
                  />
                  <Label htmlFor={`hide-${mod.key}`} className="cursor-pointer text-sm">
                    {mod.label}
                  </Label>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
