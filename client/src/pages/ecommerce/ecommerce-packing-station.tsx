import { useState, useRef, useEffect, useCallback } from "react";
import EcommerceLayout from "@/components/ecommerce-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, ScanLine, Package, Loader2, Play, Square, Clock, CheckCircle2, User, AlertCircle } from "lucide-react";
import { CameraQrScanner } from "@/components/camera-qr-scanner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/hooks/use-toast";

export default function EcommercePackingStation() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scanRef = useRef<HTMLInputElement>(null);

  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [scanInput, setScanInput] = useState("");
  const [qrCameraOpen, setQrCameraOpen] = useState(false);
  const [activeRecording, setActiveRecording] = useState<any>(null);
  const [currentOrder, setCurrentOrder] = useState<any>(null);
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [recentRecordings, setRecentRecordings] = useState<any[]>([]);

  const { data: cameras = [] } = useQuery<any[]>({
    queryKey: ["/api/ecommerce/packing/cameras", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/ecommerce/packing/cameras?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const activeCameras = cameras.filter((c: any) => c.isActive);

  useEffect(() => {
    if (activeCameras.length > 0 && !selectedCameraId) {
      setSelectedCameraId(String(activeCameras[0].id));
    }
  }, [activeCameras, selectedCameraId]);

  useEffect(() => {
    let interval: any;
    if (activeRecording) {
      interval = setInterval(() => {
        setRecordingTimer(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeRecording]);

  const startMutation = useMutation({
    mutationFn: async (orderNo: string) => {
      const r = await fetch("/api/ecommerce/packing/recordings/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId: selectedCompanyId, cameraId: Number(selectedCameraId), orderNo }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (data) => {
      setActiveRecording(data.recording);
      setCurrentOrder(data.order);
      setRecordingTimer(0);
      toast({ title: "เริ่มบันทึกวิดีโอ", description: `ออเดอร์ ${data.recording.orderNo || "ไม่ระบุ"}` });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const [pendingScanAfterStop, setPendingScanAfterStop] = useState<string | null>(null);

  const stopMutation = useMutation({
    mutationFn: async () => {
      if (!activeRecording) return;
      const r = await fetch(`/api/ecommerce/packing/recordings/${activeRecording.id}/stop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ companyId: selectedCompanyId }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (data) => {
      setRecentRecordings(prev => [{ ...data, cameraName: activeCameras.find((c: any) => c.id === Number(selectedCameraId))?.name }, ...prev].slice(0, 10));
      setActiveRecording(null);
      setCurrentOrder(null);
      setRecordingTimer(0);
      if (pendingScanAfterStop) {
        startMutation.mutate(pendingScanAfterStop);
        setPendingScanAfterStop(null);
      } else {
        toast({ title: "หยุดบันทึกสำเร็จ" });
        scanRef.current?.focus();
      }
    },
    onError: (err: any) => { setPendingScanAfterStop(null); toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }); },
  });

  const triggerScan = useCallback((val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (activeRecording) {
      setPendingScanAfterStop(trimmed);
      stopMutation.mutate();
    } else {
      startMutation.mutate(trimmed);
    }
    setScanInput("");
  }, [activeRecording]);

  const handleScan = useCallback(() => {
    triggerScan(scanInput);
  }, [scanInput, triggerScan]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const selectedCamera = activeCameras.find((c: any) => c.id === Number(selectedCameraId));

  return (
    <EcommerceLayout>
      <div className="space-y-4" data-testid="page-packing-station">
        <div>
          <h1 className="text-2xl font-bold text-gray-800" data-testid="text-title">สถานีแพ็คสินค้า</h1>
          <p className="text-sm text-muted-foreground mt-0.5">สแกนบาร์โค้ดออเดอร์เพื่อเริ่มบันทึกวิดีโอการแพ็คอัตโนมัติ</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left - Camera & Controls */}
          <div className="lg:col-span-2 space-y-4">
            {/* Camera Selection & Scanner */}
            <Card className="rounded-xl shadow-sm">
              <CardContent className="py-3 px-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-[#03c9d7]" />
                    <Select value={selectedCameraId} onValueChange={setSelectedCameraId}>
                      <SelectTrigger className="w-[200px] h-9" data-testid="select-camera">
                        <SelectValue placeholder="เลือกกล้อง" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeCameras.map((cam: any) => (
                          <SelectItem key={cam.id} value={String(cam.id)}>{cam.name} {cam.stationName ? `(${cam.stationName})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[250px]">
                    <div className="relative">
                      <ScanLine className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={scanRef}
                        placeholder="สแกนบาร์โค้ดออเดอร์ หรือพิมพ์หมายเลขออเดอร์..."
                        value={scanInput}
                        onChange={e => setScanInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleScan(); }}
                        className="pl-9 h-9 text-sm"
                        autoFocus
                        data-testid="input-scan-order"
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 gap-1 h-9"
                    onClick={() => setQrCameraOpen(true)}
                    aria-label="สแกนด้วยกล้อง"
                    data-testid="button-camera-scan"
                  >
                    <Camera className="h-4 w-4" />
                    <span className="text-xs">กล้อง</span>
                  </Button>
                  <Button
                    className="h-9 bg-[#03c9d7] hover:bg-[#02b4c1] text-white gap-1"
                    onClick={handleScan}
                    disabled={!scanInput.trim() || !selectedCameraId}
                    data-testid="button-scan"
                  >
                    <Play className="h-4 w-4" />สแกน/เริ่มบันทึก
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Camera Live View */}
            <Card className="rounded-xl shadow-sm overflow-hidden">
              <div className="relative bg-gray-900 aspect-video flex items-center justify-center" data-testid="camera-live-view">
                {selectedCamera ? (
                  selectedCamera.snapshotUrl ? (
                    <img
                      src={selectedCamera.snapshotUrl}
                      alt="Live View"
                      className="w-full h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="text-center text-gray-400">
                      <Camera className="h-16 w-16 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">RTSP Live Stream</p>
                      <p className="text-xs mt-1 text-gray-500">{selectedCamera.rtspUrl}</p>
                      <p className="text-xs mt-2 text-gray-500">Live view ต้องใช้ RTSP proxy (เช่น go2rtc, MediaMTX)</p>
                      <p className="text-xs text-gray-500">บนเซิร์ฟเวอร์จริงจะแสดง video stream ที่นี่</p>
                    </div>
                  )
                ) : (
                  <div className="text-center text-gray-400">
                    <Camera className="h-16 w-16 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">กรุณาเลือกกล้อง</p>
                  </div>
                )}

                {/* Recording Indicator */}
                {activeRecording && (
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600/90 text-white px-3 py-1.5 rounded-full">
                    <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
                    <span className="text-xs font-bold">REC {formatTime(recordingTimer)}</span>
                  </div>
                )}

                {activeRecording && (
                  <div className="absolute bottom-3 left-3 right-3 bg-black/70 text-white px-3 py-2 rounded-lg text-xs">
                    <div className="flex items-center justify-between">
                      <span>ออเดอร์: <strong>{activeRecording.orderNo || "-"}</strong></span>
                      <span>{selectedCamera?.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right - Order Info & Controls */}
          <div className="space-y-4">
            {/* Recording Status */}
            <Card className={`rounded-xl shadow-sm border-2 ${activeRecording ? "border-red-400 bg-red-50" : "border-gray-200"}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  {activeRecording ? (
                    <><span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />กำลังบันทึก</>
                  ) : (
                    <><CheckCircle2 className="h-4 w-4 text-green-500" />พร้อมบันทึก</>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeRecording ? (
                  <>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-red-600">{formatTime(recordingTimer)}</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">ออเดอร์:</span>
                        <span className="font-medium">{activeRecording.orderNo || "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">กล้อง:</span>
                        <span>{selectedCamera?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">เวลาเริ่ม:</span>
                        <span>{new Date(activeRecording.startedAt).toLocaleTimeString("th-TH")}</span>
                      </div>
                    </div>
                    <Button
                      className="w-full bg-red-500 hover:bg-red-600 text-white gap-1"
                      onClick={() => stopMutation.mutate()}
                      disabled={stopMutation.isPending}
                      data-testid="button-stop-recording"
                    >
                      {stopMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                      หยุดบันทึก
                    </Button>
                  </>
                ) : (
                  <div className="text-center text-sm text-muted-foreground py-4">
                    <ScanLine className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>สแกนบาร์โค้ดออเดอร์เพื่อเริ่มบันทึก</p>
                    <p className="text-xs mt-1">ระบบจะบันทึกอัตโนมัติ</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Current Order Info */}
            {currentOrder && (
              <Card className="rounded-xl shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4 text-[#03c9d7]" />
                    รายละเอียดออเดอร์
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">เลขออเดอร์:</span>
                    <span className="font-medium">{currentOrder.orderNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">แพลตฟอร์ม:</span>
                    <Badge className="text-xs">{currentOrder.platform}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ผู้ซื้อ:</span>
                    <span>{currentOrder.buyerName || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ยอดรวม:</span>
                    <span className="font-medium">฿{Number(currentOrder.totalAmount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Recordings */}
            <Card className="rounded-xl shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  บันทึกล่าสุด
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentRecordings.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">ยังไม่มีรายการ</p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {recentRecordings.map((rec: any, idx: number) => (
                      <div key={rec.id || idx} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 text-xs" data-testid={`recent-rec-${idx}`}>
                        <div>
                          <p className="font-medium">{rec.orderNo || "-"}</p>
                          <p className="text-muted-foreground">{rec.cameraName} • {rec.duration ? formatTime(rec.duration) : "-"}</p>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {activeCameras.length === 0 && (
          <Card className="rounded-xl shadow-sm border-amber-200 bg-amber-50">
            <CardContent className="py-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-800">ยังไม่มีกล้องที่เปิดใช้งาน</p>
                <p className="text-xs text-amber-600">กรุณาไปที่ "ตั้งค่ากล้อง" เพื่อเพิ่มและเปิดใช้งานกล้องวงจรปิด</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <CameraQrScanner
        open={qrCameraOpen}
        onClose={() => setQrCameraOpen(false)}
        onScan={raw => triggerScan(raw)}
        title="สแกน QR / บาร์โค้ดออเดอร์"
      />
    </EcommerceLayout>
  );
}
