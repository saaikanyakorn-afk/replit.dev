import { useState, useEffect } from "react";
import PlatformLayout from "@/components/platform-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Mail, Send, Eye, EyeOff, Loader2, Check, RotateCcw, ShieldCheck } from "lucide-react";

const SMTP_PRESETS = [
  {
    id: "etaxcenter",
    label: "etaxcenter.com",
    badge: "แนะนำ · Webmail",
    badgeColor: "bg-green-100 text-green-700",
    host: "mail.etaxcenter.com",
    port: 587,
    secure: false,
    passLabel: "รหัสผ่าน Webmail",
    passHint: "ใช้ email และรหัสผ่านเดียวกับที่ login ที่ webmail.etaxcenter.com",
    signupUrl: "https://webmail.etaxcenter.com",
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
    id: "outlook",
    label: "Outlook / Microsoft 365",
    badge: "Office 365",
    badgeColor: "bg-blue-100 text-blue-700",
    host: "smtp.office365.com",
    port: 587,
    secure: false,
    passLabel: "App Password (จาก Microsoft account)",
    passHint: "account.microsoft.com → Security → App passwords → สร้าง App Password",
    signupUrl: "https://account.microsoft.com/security",
  },
  {
    id: "brevo",
    label: "Brevo",
    badge: "ฟรี 300/วัน",
    badgeColor: "bg-sky-100 text-sky-700",
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    passLabel: "SMTP Key (จาก Brevo dashboard)",
    passHint: "เข้า app.brevo.com → SMTP & API → SMTP tab → copy Login + Generate SMTP Key",
    signupUrl: "https://app.brevo.com",
  },
];

export default function EmailConfig() {
  const { toast } = useToast();
  const [form, setForm] = useState({ host: "", port: 587, user: "", pass: "", from: "", secure: false });
  const [hasPass, setHasPass] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingEthereal, setTestingEthereal] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/smtp", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        const host = d.host || "";
        setForm({ host, port: Number(d.port) || 587, user: d.user || "", pass: "", from: d.from || "", secure: d.secure || false });
        setHasPass(!!d.hasPass);
        const matched = SMTP_PRESETS.find(p => p.host === host);
        if (matched) setActivePreset(matched.id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const applyPreset = (preset: typeof SMTP_PRESETS[0]) => {
    setActivePreset(preset.id);
    setForm(f => ({
      ...f,
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      user: (preset as any).userFixed || f.user,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/smtp", {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setHasPass(true);
      setForm(f => ({ ...f, pass: "" }));
      toast({ title: "✅ " + data.message });
    } catch (e: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEtherealTest = async () => {
    setTestingEthereal(true);
    try {
      const res = await fetch("/api/settings/smtp/test-ethereal", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      if (data.previewUrl && data.previewUrl !== false) {
        window.open(data.previewUrl, "_blank", "noopener,noreferrer");
        toast({ title: "✅ Dev Test สำเร็จ", description: "เปิด Ethereal Preview ใน tab ใหม่แล้วครับ", duration: 8000 });
      } else {
        toast({ title: "✅ ส่งเมลสำเร็จ", description: data.message || "แต่ไม่มี preview URL (Ethereal อาจ block อยู่)", duration: 8000 });
      }
    } catch (e: any) {
      toast({ title: "Ethereal test ล้มเหลว", description: e.message, variant: "destructive" });
    } finally {
      setTestingEthereal(false);
    }
  };

  const handleTest = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
      toast({ title: "กรุณากรอก email address ที่ถูกต้อง", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/settings/smtp/test", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testEmail,
          host: form.host, port: form.port, user: form.user,
          pass: form.pass || undefined,
          from: form.from, secure: form.secure,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast({ title: "✅ " + data.message });
    } catch (e: any) {
      toast({ title: "ส่ง email ล้มเหลว", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const currentPreset = SMTP_PRESETS.find(p => p.id === activePreset);

  return (
    <PlatformLayout>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="h-6 w-6 text-amber-500" /> ตั้งค่า Email
          </h1>
          <p className="text-gray-500 mt-1">ตั้งค่า SMTP สำหรับส่งอีเมลจากระบบ E-Tax Center</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">เลือก Email Provider</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {SMTP_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      onClick={() => applyPreset(preset)}
                      data-testid={`btn-preset-${preset.id}`}
                      className={`p-3 rounded-lg border text-left transition-all ${activePreset === preset.id ? "border-amber-400 bg-amber-50 ring-1 ring-amber-400/30" : "border-gray-200 hover:border-gray-300 bg-white"}`}
                    >
                      <div className="font-semibold text-sm text-gray-800">{preset.label}</div>
                      <div className={`text-[10px] px-1.5 py-0.5 rounded-full inline-block mt-0.5 font-medium ${preset.badgeColor}`}>{preset.badge}</div>
                    </button>
                  ))}
                </div>

                {currentPreset && (
                  <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
                    <p className="font-medium mb-1">{currentPreset.passLabel}</p>
                    <p className="text-blue-600">{currentPreset.passHint}</p>
                    <a href={currentPreset.signupUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-1.5 inline-flex items-center gap-1 text-blue-700 underline hover:text-blue-900">
                      เปิด {currentPreset.label} →
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">ข้อมูล SMTP</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm">SMTP Host *</Label>
                  <Input
                    value={form.host}
                    onChange={e => { setForm(f => ({ ...f, host: e.target.value })); setActivePreset(SMTP_PRESETS.find(p => p.host === e.target.value)?.id || null); }}
                    placeholder="smtp.resend.com"
                    data-testid="input-smtp-host"
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm">Port</Label>
                    <Input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))} data-testid="input-smtp-port" className="mt-1" />
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <Switch checked={form.secure} onCheckedChange={v => setForm(f => ({ ...f, secure: v }))} data-testid="switch-smtp-secure" />
                    <Label className="text-sm">SSL/TLS (port 465)</Label>
                  </div>
                </div>

                <div>
                  <Label className="text-sm">Username *</Label>
                  <Input
                    value={form.user}
                    onChange={e => setForm(f => ({ ...f, user: e.target.value }))}
                    placeholder="resend"
                    data-testid="input-smtp-user"
                    className="mt-1"
                    readOnly={activePreset === "resend"}
                  />
                  {activePreset === "resend" && <p className="text-[11px] text-gray-400 mt-1">Resend ใช้ "resend" เป็น username เสมอ</p>}
                </div>

                <div>
                  <Label className="text-sm">{currentPreset?.passLabel || "Password / API Key"}</Label>
                  {hasPass && !form.pass ? (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 border rounded-md px-3 py-2 bg-green-50 border-green-300 text-sm text-green-700 flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                        <span>Key ถูกบันทึกในระบบแล้ว</span>
                      </div>
                      <Button type="button" variant="outline" size="sm" className="shrink-0 text-rose-600 border-rose-300 hover:bg-rose-50"
                        onClick={() => setHasPass(false)} data-testid="btn-clear-smtp-pass">
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> เปลี่ยน Key
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-1">
                      <Input
                        type={showPass ? "text" : "password"}
                        value={form.pass}
                        onChange={e => setForm(f => ({ ...f, pass: e.target.value }))}
                        placeholder={activePreset === "resend" ? "วาง API Key ที่นี่ (re_...)" : "วาง Key ที่นี่"}
                        className="flex-1 font-mono text-xs"
                        data-testid="input-smtp-pass"
                        autoComplete="off"
                      />
                      <Button type="button" variant="outline" size="icon" onClick={() => setShowPass(!showPass)}>
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                  {!hasPass && form.pass && (
                    <p className="text-[10px] text-amber-600 mt-1">กรุณากด "บันทึก" ก่อนทดสอบ</p>
                  )}
                </div>

                <div>
                  <Label className="text-sm">From Email</Label>
                  <Input
                    value={form.from}
                    onChange={e => setForm(f => ({ ...f, from: e.target.value }))}
                    placeholder="E-Tax Center <noreply@example.com>"
                    data-testid="input-smtp-from"
                    className="mt-1"
                  />
                  {currentPreset?.fromHint && <p className="text-[11px] text-gray-400 mt-1">{currentPreset.fromHint}</p>}
                </div>

                <div className="flex justify-end pt-2">
                  <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={handleSave} disabled={saving} data-testid="btn-save-smtp">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />} บันทึก
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">ทดสอบการส่ง Email</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 mb-2">ทดสอบด้วย email จริง — กรอก email ปลายทาง แล้วกด "ส่งทดสอบ"</p>
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
                      onClick={handleTest}
                      disabled={testing || !testEmail}
                      data-testid="btn-test-smtp"
                      className="bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      <span className="ml-1">ส่งทดสอบ</span>
                    </Button>
                  </div>
                </div>
                <div className="border-t pt-3">
                  <p className="text-sm text-gray-500 mb-2">
                    <span className="font-medium text-gray-700">Dev Test (Ethereal)</span> — ทดสอบว่า server ส่งเมลได้จริง โดยไม่ต้องใช้ email จริง ดูผลจาก URL ที่ได้
                  </p>
                  <Button
                    onClick={handleEtherealTest}
                    disabled={testingEthereal}
                    variant="outline"
                    data-testid="btn-test-ethereal"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                  >
                    {testingEthereal ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                    ทดสอบด้วย Ethereal (Dev)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </PlatformLayout>
  );
}
