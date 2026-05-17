import DeliveryLayout from "@/components/delivery-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useRef, useCallback } from "react";
import { ScanLine, CheckCircle2, Package, X, Truck, Camera } from "lucide-react";
import { CameraQrScanner } from "@/components/camera-qr-scanner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useToast } from "@/hooks/use-toast";

type ScannedItem = {
  tracking: string;
  orderNo?: string;
  status: "success" | "not_found" | "already_shipped";
  timestamp: Date;
};

export default function DeliveryScan() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanInput, setScanInput] = useState("");
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);

  const scanMutation = useMutation({
    mutationFn: async (tracking: string) => {
      const r = await fetch("/api/delivery/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ trackingNo: tracking, companyId: selectedCompanyId }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "scan_failed");
      }
      return r.json();
    },
    onSuccess: (data: any, tracking: string) => {
      setScannedItems(prev => [{
        tracking,
        orderNo: data.orderNo,
        status: "success",
        timestamp: new Date(),
      }, ...prev]);
      toast({ title: "สแกนสำเร็จ", description: `ออเดอร์ ${data.orderNo || tracking} อัพเดทแล้ว` });
      queryClient.invalidateQueries({ queryKey: ["/api/ecommerce/orders"] });
    },
    onError: (error: any, tracking: string) => {
      const status = error.message === "already_shipped" ? "already_shipped" : "not_found";
      setScannedItems(prev => [{
        tracking,
        status,
        timestamp: new Date(),
      }, ...prev]);
    },
  });

  const handleScan = useCallback(() => {
    const val = scanInput.trim();
    if (!val) return;
    scanMutation.mutate(val);
    setScanInput("");
    inputRef.current?.focus();
  }, [scanInput, scanMutation]);

  const clearHistory = () => setScannedItems([]);

  const successCount = scannedItems.filter(i => i.status === "success").length;
  const errorCount = scannedItems.filter(i => i.status === "not_found").length;

  return (
    <DeliveryLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-scan-title">สแกนพัสดุ</h1>
          <p className="text-gray-500 mt-1">สแกนบาร์โค้ดหรือ QR Code เพื่ออัพเดทสถานะจัดส่ง</p>
        </div>

        <Card className="flexy-card border-0 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ScanLine className="h-6 w-6" style={{ color: "#03c9d7" }} />
              <h3 className="font-semibold text-gray-800">สแกนเลข Tracking</h3>
            </div>
            <div className="flex gap-3">
              <Input
                ref={inputRef}
                data-testid="input-scan-tracking"
                placeholder="สแกนหรือพิมพ์เลข tracking แล้วกด Enter..."
                value={scanInput}
                onChange={e => setScanInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleScan()}
                className="text-lg h-12 font-mono"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                className="md:hidden shrink-0 gap-1.5 h-12"
                onClick={() => setCameraOpen(true)}
                aria-label="สแกนด้วยกล้อง"
                data-testid="button-camera-scan"
              >
                <Camera className="h-4 w-4" />
                <span className="text-xs">กล้อง</span>
              </Button>
              <Button
                style={{ background: "#03c9d7" }}
                className="text-white hover:opacity-90 h-12 px-6"
                onClick={handleScan}
                disabled={!scanInput.trim()}
                data-testid="button-scan"
              >
                <ScanLine className="h-5 w-5 mr-2" />
                สแกน
              </Button>
            </div>
            <p className="text-xs text-gray-400 mt-2">ใช้เครื่องสแกนบาร์โค้ดหรือพิมพ์เลข tracking ด้วยตนเอง</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="flexy-card border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">สแกนทั้งหมด</p>
                <p className="text-xl font-bold text-blue-600">{scannedItems.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flexy-card border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">สำเร็จ</p>
                <p className="text-xl font-bold text-green-600">{successCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flexy-card border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-red-50 flex items-center justify-center">
                <X className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ไม่พบ</p>
                <p className="text-xl font-bold text-red-600">{errorCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="flexy-card border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">ประวัติสแกน</h3>
              {scannedItems.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearHistory} data-testid="button-clear-history">
                  ล้างประวัติ
                </Button>
              )}
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {scannedItems.length === 0 ? (
                <div className="text-center py-12">
                  <ScanLine className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-400">ยังไม่มีรายการสแกน</p>
                  <p className="text-gray-400 text-sm mt-1">เริ่มสแกนเลข tracking ด้านบน</p>
                </div>
              ) : (
                scannedItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      item.status === "success" ? "bg-green-50" : item.status === "already_shipped" ? "bg-amber-50" : "bg-red-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {item.status === "success" ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : item.status === "already_shipped" ? (
                        <Truck className="h-5 w-5 text-amber-600" />
                      ) : (
                        <X className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="text-sm font-mono font-medium">{item.tracking}</p>
                        {item.orderNo && <p className="text-xs text-gray-500">ออเดอร์: {item.orderNo}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={
                        item.status === "success" ? "bg-green-100 text-green-700 hover:bg-green-100"
                        : item.status === "already_shipped" ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
                        : "bg-red-100 text-red-700 hover:bg-red-100"
                      }>
                        {item.status === "success" ? "สำเร็จ" : item.status === "already_shipped" ? "จัดส่งแล้ว" : "ไม่พบ"}
                      </Badge>
                      <p className="text-xs text-gray-400 mt-1">
                        {item.timestamp.toLocaleTimeString("th-TH")}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <CameraQrScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={raw => { const val = raw.trim(); if (!val) return; setScanInput(val); scanMutation.mutate(val); inputRef.current?.focus(); }}
        title="สแกน QR / บาร์โค้ด Tracking"
      />
    </DeliveryLayout>
  );
}
