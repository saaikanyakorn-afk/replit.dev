import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, BellOff, Send, Clock, Sticker, CheckCircle, XCircle, TestTube, Play, RefreshCw, Check } from "lucide-react";

const STICKER_GROUPS = [
  {
    groupLabel: "ชุดที่ 1 — Brown & Cony",
    stickers: [
      { packageId: "11537", stickerId: "52002734", label: "สู้ๆ" },
      { packageId: "11537", stickerId: "52002735", label: "โอเค" },
      { packageId: "11537", stickerId: "52002736", label: "ขอบคุณ" },
      { packageId: "11537", stickerId: "52002738", label: "รีบด่วน" },
      { packageId: "11537", stickerId: "52002739", label: "อย่าลืม" },
      { packageId: "11537", stickerId: "52002744", label: "เช็คด้วย" },
      { packageId: "11537", stickerId: "52002750", label: "เฮ้ย" },
      { packageId: "11537", stickerId: "52002759", label: "ไปเลย" },
    ],
  },
  {
    groupLabel: "ชุดที่ 2 — Moon & James",
    stickers: [
      { packageId: "11538", stickerId: "51626494", label: "แจ้งเตือน" },
      { packageId: "11538", stickerId: "51626496", label: "ยิ้ม" },
      { packageId: "11538", stickerId: "51626497", label: "เตือนนะ" },
      { packageId: "11538", stickerId: "51626504", label: "สวัสดี" },
      { packageId: "11538", stickerId: "51626506", label: "รับทราบ" },
      { packageId: "11538", stickerId: "51626508", label: "ยินดี" },
      { packageId: "11538", stickerId: "51626511", label: "เย้" },
      { packageId: "11538", stickerId: "51626517", label: "ช่วยด้วย" },
    ],
  },
  {
    groupLabel: "ชุดที่ 3 — Boss & Pangyo",
    stickers: [
      { packageId: "6325", stickerId: "10979904", label: "เตือน" },
      { packageId: "6325", stickerId: "10979905", label: "ด่วน!" },
      { packageId: "6325", stickerId: "10979906", label: "รับทราบ" },
      { packageId: "6325", stickerId: "10979907", label: "ขอบคุณ" },
      { packageId: "6325", stickerId: "10979908", label: "โอเค" },
      { packageId: "6325", stickerId: "10979909", label: "สู้ๆ" },
      { packageId: "6325", stickerId: "10979910", label: "ไปเลย" },
      { packageId: "6325", stickerId: "10979911", label: "ยินดี" },
    ],
  },
  {
    groupLabel: "ชุดที่ 4 — Sally & Friends",
    stickers: [
      { packageId: "6359", stickerId: "11069848", label: "ไม่ลืม" },
      { packageId: "6359", stickerId: "11069850", label: "โอเค!" },
      { packageId: "6359", stickerId: "11069851", label: "เย้!" },
      { packageId: "6359", stickerId: "11069852", label: "ยินดี" },
      { packageId: "6359", stickerId: "11069853", label: "สวัสดี!" },
      { packageId: "6359", stickerId: "11069854", label: "ขอบคุณ" },
      { packageId: "6359", stickerId: "11069855", label: "สู้ๆ" },
      { packageId: "6359", stickerId: "11069856", label: "เตือนนะ" },
    ],
  },
];

const ALL_STICKERS = STICKER_GROUPS.flatMap(g => g.stickers);
const getStickerPreview = (stickerId: string) =>
  `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/iPhone/sticker@2x.png`;

export default function TaxReminderSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(true);
  const [daysBefore, setDaysBefore] = useState("3");
  const [sendSticker, setSendSticker] = useState(true);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [customStickerPackageId, setCustomStickerPackageId] = useState("");
  const [customStickerId, setCustomStickerId] = useState("");
  const [stickerTab, setStickerTab] = useState("gallery");

  const { data: settings, isLoading } = useQuery({
    queryKey: ["/api/tax-reminder/settings"],
    queryFn: async () => {
      const res = await fetch("/api/tax-reminder/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["/api/tax-reminder/logs"],
    queryFn: async () => {
      const res = await fetch("/api/tax-reminder/logs", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  const { data: groups } = useQuery({
    queryKey: ["/api/line-documents/groups"],
    queryFn: async () => {
      const res = await fetch("/api/line-documents/groups", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled ?? true);
      setDaysBefore(String(settings.daysBefore ?? 3));
      setSendSticker(settings.sendSticker ?? true);
      setReminderTime(settings.reminderTime ?? "09:00");
      setCustomStickerPackageId(settings.customStickerPackageId || "");
      setCustomStickerId(settings.customStickerId || "");
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tax-reminder/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled, daysBefore: Number(daysBefore), sendSticker, reminderTime, customStickerPackageId, customStickerId }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tax-reminder/settings"] });
      toast({ title: "บันทึกสำเร็จ", description: "ตั้งค่าการแจ้งเตือนภาษีถูกบันทึกแล้ว" });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const testSendMutation = useMutation({
    mutationFn: async (groupId: string) => {
      const res = await fetch("/api/tax-reminder/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ groupId }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "ส่งทดสอบสำเร็จ", description: `ส่งแจ้งเตือนไปยังกลุ่ม LINE แล้ว` });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-reminder/logs"] });
    },
    onError: (err: any) => toast({ title: "ส่งไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/tax-reminder/run-now", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "รันเสร็จสิ้น",
        description: `ส่งสำเร็จ ${data.sent} รายการ, ผิดพลาด ${data.errors} รายการ`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tax-reminder/logs"] });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear() + 543} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Bell className="h-6 w-6 text-[#fb9678]" />
            แจ้งเตือนภาษีผ่าน LINE
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            ตั้งค่าการส่งข้อความแจ้งเตือนกำหนดยื่นภาษีไปยังกลุ่ม LINE ของลูกค้าอัตโนมัติ
          </p>
        </div>
      </div>

      <Card data-testid="card-settings">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-[#03c9d7]" />
            ตั้งค่าการแจ้งเตือน
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="font-medium text-sm">เปิดการแจ้งเตือนอัตโนมัติ</label>
              <p className="text-xs text-gray-500">ระบบจะส่งข้อความแจ้งเตือนภาษีไปยังกลุ่ม LINE ที่เชื่อมไว้</p>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid="switch-enabled"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium block mb-2">แจ้งเตือนล่วงหน้า (วัน)</label>
              <Select value={daysBefore} onValueChange={setDaysBefore} data-testid="select-days-before">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">เฉพาะวันสุดท้าย</SelectItem>
                  <SelectItem value="1">ล่วงหน้า 1 วัน</SelectItem>
                  <SelectItem value="2">ล่วงหน้า 2 วัน</SelectItem>
                  <SelectItem value="3">ล่วงหน้า 3 วัน</SelectItem>
                  <SelectItem value="5">ล่วงหน้า 5 วัน</SelectItem>
                  <SelectItem value="7">ล่วงหน้า 7 วัน</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400 mt-1">
                {daysBefore === "0"
                  ? "จะส่งเฉพาะวันครบกำหนดเท่านั้น"
                  : `จะส่งเตือนตั้งแต่ ${daysBefore} วันก่อน + วันครบกำหนด (วันสุดท้าย)`}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium block mb-2">เวลาส่ง (ไทย)</label>
              <Select value={reminderTime} onValueChange={setReminderTime} data-testid="select-time">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="08:00">08:00 น.</SelectItem>
                  <SelectItem value="09:00">09:00 น.</SelectItem>
                  <SelectItem value="10:00">10:00 น.</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={sendSticker}
                onCheckedChange={setSendSticker}
                data-testid="switch-sticker"
              />
              <div>
                <label className="text-sm font-medium flex items-center gap-1">
                  <Sticker className="h-4 w-4" />
                  ส่ง Sticker
                </label>
                <p className="text-xs text-gray-500">แนบ sticker ท้ายข้อความ</p>
              </div>
            </div>
          </div>

          {sendSticker && (
            <div className="border rounded-lg p-4 bg-gray-50/50 space-y-3">
              <label className="text-sm font-medium flex items-center gap-2">
                <Sticker className="h-4 w-4 text-[#fb9678]" />
                เลือก Sticker
              </label>

              <Tabs value={stickerTab} onValueChange={setStickerTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="gallery">เลือกจากรายการ</TabsTrigger>
                  <TabsTrigger value="custom">ใส่เลข ID เอง</TabsTrigger>
                </TabsList>

                <TabsContent value="gallery" className="mt-3 space-y-4">
                  {STICKER_GROUPS.map((group) => (
                    <div key={group.groupLabel}>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">{group.groupLabel}</h4>
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {group.stickers.map((s) => {
                          const isSelected = customStickerPackageId === s.packageId && customStickerId === s.stickerId;
                          return (
                            <button
                              key={`${s.packageId}-${s.stickerId}`}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setCustomStickerPackageId("");
                                  setCustomStickerId("");
                                } else {
                                  setCustomStickerPackageId(s.packageId);
                                  setCustomStickerId(s.stickerId);
                                }
                              }}
                              className={`relative rounded-lg p-1.5 border-2 transition-all hover:shadow-md ${
                                isSelected
                                  ? "border-[#fb9678] bg-orange-50 shadow-md"
                                  : "border-transparent hover:border-gray-300"
                              }`}
                              title={s.label}
                              data-testid={`sticker-${s.stickerId}`}
                            >
                              <img
                                src={getStickerPreview(s.stickerId)}
                                alt={s.label}
                                className="w-full h-auto rounded"
                                loading="lazy"
                              />
                              {isSelected && (
                                <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#fb9678] flex items-center justify-center shadow">
                                  <Check className="h-3 w-3 text-white" />
                                </div>
                              )}
                              <p className="text-[10px] text-gray-500 text-center mt-0.5 truncate">{s.label}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 mt-2">
                    {customStickerPackageId && customStickerId
                      ? `เลือกแล้ว: ${ALL_STICKERS.find(s => s.stickerId === customStickerId)?.label || customStickerId}`
                      : "ยังไม่ได้เลือก — จะสุ่มจาก Sticker ทั่วไปอัตโนมัติ"}
                  </p>
                </TabsContent>

                <TabsContent value="custom" className="mt-3 space-y-3">
                  <p className="text-xs text-gray-500">
                    ใส่ Package ID และ Sticker ID ของ LINE Official Sticker เท่านั้น
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700">
                    ⚠️ <strong>หมายเหตุ:</strong> LINE Bot API รองรับเฉพาะ Sticker ชุด Official เท่านั้น
                    (Creators' Stickers / Sticker ที่ซื้อจาก Creators Market ใช้ไม่ได้)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Package ID</label>
                      <Input
                        value={customStickerPackageId}
                        onChange={(e) => setCustomStickerPackageId(e.target.value)}
                        placeholder="เช่น 1234567"
                        data-testid="input-sticker-package-id"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 block mb-1">Sticker ID</label>
                      <Input
                        value={customStickerId}
                        onChange={(e) => setCustomStickerId(e.target.value)}
                        placeholder="เช่น 9876543"
                        data-testid="input-sticker-id"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {customStickerPackageId && customStickerId && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" />
                  จะใช้ Sticker: Package {customStickerPackageId}, ID {customStickerId}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={{ backgroundColor: "#fb9678", borderColor: "#fb9678" }}
              className="text-white hover:opacity-90"
              data-testid="button-save"
            >
              {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึกตั้งค่า"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-test">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TestTube className="h-5 w-5 text-[#fec90f]" />
            ทดสอบส่งแจ้งเตือน
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Array.isArray(groups) && groups.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">เลือกกลุ่ม LINE เพื่อทดสอบส่งข้อความแจ้งเตือนภาษี:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {groups.map((g: any) => (
                  <div key={g.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <span className="text-sm font-medium">{g.groupName || g.lineGroupId}</span>
                      {g.active ? (
                        <Badge variant="outline" className="ml-2 text-green-600 border-green-300 text-xs">ใช้งาน</Badge>
                      ) : (
                        <Badge variant="outline" className="ml-2 text-gray-400 border-gray-300 text-xs">ปิด</Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testSendMutation.mutate(g.lineGroupId)}
                      disabled={testSendMutation.isPending}
                      data-testid={`button-test-send-${g.id}`}
                    >
                      <Send className="h-3.5 w-3.5 mr-1" />
                      ทดสอบ
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <BellOff className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">ยังไม่มีกลุ่ม LINE ที่เชื่อมไว้</p>
              <p className="text-xs mt-1">ไปที่เมนู LINE เชื่อมกลุ่ม เพื่อเพิ่มกลุ่ม LINE ก่อน</p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => runNowMutation.mutate()}
              disabled={runNowMutation.isPending}
              className="text-[#03c9d7] border-[#03c9d7]"
              data-testid="button-run-now"
            >
              <Play className="h-4 w-4 mr-1" />
              {runNowMutation.isPending ? "กำลังรัน..." : "รันแจ้งเตือนตอนนี้"}
            </Button>
            <p className="text-xs text-gray-500 mt-1">
              ตรวจสอบ deadline ทั้งหมดและส่งแจ้งเตือนไปยังทุกกลุ่มที่ยังไม่ได้ส่ง
            </p>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-logs">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-[#539BFF]" />
            ประวัติการส่ง (50 รายการล่าสุด)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Array.isArray(logs) && logs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 px-2 font-medium text-gray-600">วันที่ส่ง</th>
                    <th className="py-2 px-2 font-medium text-gray-600">กลุ่ม LINE</th>
                    <th className="py-2 px-2 font-medium text-gray-600">กำหนดภาษี</th>
                    <th className="py-2 px-2 font-medium text-gray-600">รายการ</th>
                    <th className="py-2 px-2 font-medium text-gray-600">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log: any) => (
                    <tr key={log.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-2 text-xs">{formatDate(log.sentAt)}</td>
                      <td className="py-2 px-2">{log.groupName || log.lineGroupId}</td>
                      <td className="py-2 px-2 text-xs">{log.deadlineDate}</td>
                      <td className="py-2 px-2 text-xs">{log.deadlineTitle}</td>
                      <td className="py-2 px-2">
                        {log.status === "sent" ? (
                          <span className="flex items-center gap-1 text-green-600 text-xs">
                            <CheckCircle className="h-3.5 w-3.5" />
                            สำเร็จ
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 text-xs" title={log.errorMessage}>
                            <XCircle className="h-3.5 w-3.5" />
                            ผิดพลาด
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-6 text-gray-400 text-sm">ยังไม่มีประวัติการส่ง</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
