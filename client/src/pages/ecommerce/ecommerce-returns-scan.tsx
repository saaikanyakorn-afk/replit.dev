import EcommerceLayout from "@/components/ecommerce-layout";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScanLine, Package, Check, X, Search, ArrowLeft, Loader2, PackageCheck, AlertTriangle, Camera } from "lucide-react";
import { CameraQrScanner } from "@/components/camera-qr-scanner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

const QC_CONDITIONS = [
  { value: "normal", label: "ปกติ", color: "text-green-600", bg: "bg-green-50", icon: "✅" },
  { value: "minor_damage", label: "ชำรุดเล็กน้อย", color: "text-yellow-600", bg: "bg-yellow-50", icon: "⚠️" },
  { value: "major_damage", label: "ชำรุดมาก", color: "text-orange-600", bg: "bg-orange-50", icon: "🔶" },
  { value: "unsellable", label: "ขายต่อไม่ได้", color: "text-red-600", bg: "bg-red-50", icon: "❌" },
];

const ZONES = [
  { value: "receiving", label: "โซนรับคืน", color: "bg-blue-100 text-blue-700" },
  { value: "qc", label: "โซน QC", color: "bg-yellow-100 text-yellow-700" },
  { value: "ready_for_sale", label: "โซนพร้อมขาย", color: "bg-green-100 text-green-700" },
  { value: "damaged", label: "โซนชำรุด", color: "bg-red-100 text-red-700" },
];

export default function EcommerceReturnsScan() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  const [scanCode, setScanCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [scannedItems, setScannedItems] = useState<Map<number, { receivedQty: number; receivedCondition: string; qcCondition: string; qcNotes: string; zone: string }>>(new Map());
  const [warehouseId, setWarehouseId] = useState<string>("");

  const { data: warehouses } = useQuery<any[]>({
    queryKey: ["/api/warehouses", selectedCompanyId],
    queryFn: async () => {
      const res = await fetch(`/api/warehouses?companyId=${selectedCompanyId}`);
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });

  const { data: pendingReturns } = useQuery<any[]>({
    queryKey: ["/api/ecommerce/returns", selectedCompanyId, "in_transit_received"],
    queryFn: async () => {
      const res = await fetch(`/api/ecommerce/returns?companyId=${selectedCompanyId}`);
      const all = await res.json();
      return all.filter((r: any) => r.returnStatus === "in_transit" || r.returnStatus === "received");
    },
    enabled: !!selectedCompanyId,
  });

  const handleScanCode = async (code: string) => {
    if (!code.trim() || !selectedCompanyId) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/ecommerce/returns/scan-lookup?companyId=${selectedCompanyId}&code=${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        setSearchResults(data.items);
        if (data.items.length === 1) {
          loadReturnDetail(data.items[0].ret?.id || data.items[0].item?.returnId);
        }
        toast({ title: `พบ ${data.items.length} รายการ` });
      } else {
        toast({ title: "ไม่พบรายการ", description: "ไม่พบสินค้าคืนที่ตรงกับโค้ดนี้", variant: "destructive" });
        setSearchResults([]);
      }
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    }
    setIsSearching(false);
    setScanCode("");
    inputRef.current?.focus();
  };

  const handleScan = async () => {
    await handleScanCode(scanCode);
  };

  const loadReturnDetail = async (returnId: number) => {
    try {
      const res = await fetch(`/api/ecommerce/returns/${returnId}`);
      const data = await res.json();
      setSelectedReturn(data);
    } catch {
      toast({ title: "ไม่สามารถโหลดรายละเอียดได้", variant: "destructive" });
    }
  };

  const receiveMutation = useMutation({
    mutationFn: async ({ returnId, payload }: { returnId: number; payload: any }) => {
      const res = await fetch(`/api/ecommerce/returns/${returnId}/receive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "รับคืนสินค้าสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/ecommerce/returns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ecommerce/returns/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ecommerce/returns/zone-summary"] });
      setSelectedReturn(null);
      setScannedItems(new Map());
      setSearchResults([]);
    },
    onError: (err: any) => toast({ title: err.message, variant: "destructive" }),
  });

  const handleReceiveAll = () => {
    if (!selectedReturn || !warehouseId) {
      toast({ title: "กรุณาเลือกคลังสินค้า", variant: "destructive" });
      return;
    }
    const items = (selectedReturn.items || []).map((item: any) => {
      const scanned = scannedItems.get(item.id);
      return {
        itemId: item.id,
        receivedQty: scanned?.receivedQty ?? Number(item.qty || 0),
        receivedCondition: scanned?.receivedCondition || "unopened",
      };
    });
    receiveMutation.mutate({
      returnId: selectedReturn.id,
      payload: { warehouseId: Number(warehouseId), items },
    });
  };

  const updateScannedItem = (itemId: number, field: string, value: any) => {
    setScannedItems(prev => {
      const copy = new Map(prev);
      const existing = copy.get(itemId) || { receivedQty: 0, receivedCondition: "unopened", qcCondition: "", qcNotes: "", zone: "qc" };
      copy.set(itemId, { ...existing, [field]: value });
      return copy;
    });
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <EcommerceLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate("/ecommerce/returns")} data-testid="button-back">
                <ArrowLeft className="h-4 w-4 mr-1" />กลับ
              </Button>
              <ScanLine className="h-6 w-6" style={{ color: "#fb9678" }} />
              <h1 className="text-2xl font-bold text-gray-800" data-testid="text-scan-title">รับคืนสินค้า (Scan)</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 ml-10">สแกนบาร์โค้ด หรือกรอก SKU/เลขที่คืน เพื่อค้นหาและรับคืนสินค้า</p>
          </div>
        </div>

        <Card className="rounded-xl shadow-sm border">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  ref={inputRef}
                  value={scanCode}
                  onChange={e => setScanCode(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleScan()}
                  placeholder="สแกนบาร์โค้ด / กรอก SKU / เลขที่คืน (RT-XXXXX)"
                  className="pl-10 h-12 text-lg"
                  data-testid="input-scan-code"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-1.5 h-12"
                onClick={() => setCameraOpen(true)}
                aria-label="สแกนด้วยกล้อง"
                data-testid="button-camera-scan"
              >
                <Camera className="h-4 w-4" />
                <span className="text-xs">กล้อง</span>
              </Button>
              <Button onClick={handleScan} disabled={isSearching || !scanCode.trim()} className="h-12 px-6 text-white" style={{ background: "#fb9678" }} data-testid="button-search">
                {isSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5 mr-1" />}
                ค้นหา
              </Button>
            </div>
          </CardContent>
        </Card>

        {!selectedReturn && pendingReturns && pendingReturns.length > 0 && searchResults.length === 0 && (
          <Card className="rounded-xl shadow-sm border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" style={{ color: "#fb9678" }} />
                รายการรอรับคืน ({pendingReturns.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs">เลขที่คืน</TableHead>
                    <TableHead className="text-xs">แพลตฟอร์ม</TableHead>
                    <TableHead className="text-xs">ผู้ซื้อ</TableHead>
                    <TableHead className="text-xs">สถานะ</TableHead>
                    <TableHead className="text-xs">Tracking</TableHead>
                    <TableHead className="text-xs text-center">ดำเนินการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingReturns.map((r: any) => (
                    <TableRow key={r.id} className="cursor-pointer hover:bg-orange-50" onClick={() => loadReturnDetail(r.id)} data-testid={`row-pending-${r.id}`}>
                      <TableCell className="text-sm font-medium" style={{ color: "#fb9678" }}>{r.returnNo}</TableCell>
                      <TableCell className="text-sm">{r.platform}</TableCell>
                      <TableCell className="text-sm">{r.buyerName || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={r.returnStatus === "in_transit" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}>
                          {r.returnStatus === "in_transit" ? "กำลังจัดส่ง" : "รับแล้ว"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{r.returnTrackingNo || "-"}</TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" variant="outline" className="text-xs" style={{ borderColor: "#fb9678", color: "#fb9678" }}>
                          <PackageCheck className="h-3 w-3 mr-1" />รับคืน
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {searchResults.length > 0 && !selectedReturn && (
          <Card className="rounded-xl shadow-sm border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">ผลการค้นหา ({searchResults.length} รายการ)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="text-xs">เลขที่คืน</TableHead>
                    <TableHead className="text-xs">สินค้า</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs">จำนวน</TableHead>
                    <TableHead className="text-xs text-center">เลือก</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {searchResults.map((r: any, i: number) => (
                    <TableRow key={i} className="cursor-pointer hover:bg-orange-50" onClick={() => loadReturnDetail(r.ret?.id || r.item?.returnId)}>
                      <TableCell className="text-sm font-medium" style={{ color: "#fb9678" }}>{r.ret?.returnNo || "-"}</TableCell>
                      <TableCell className="text-sm">{r.item?.productName || "-"}</TableCell>
                      <TableCell className="text-sm text-gray-600">{r.item?.sku || "-"}</TableCell>
                      <TableCell className="text-sm">{Number(r.item?.qty || 0)}</TableCell>
                      <TableCell className="text-center">
                        <Button size="sm" variant="outline" className="text-xs" style={{ borderColor: "#fb9678", color: "#fb9678" }}>
                          เลือก
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {selectedReturn && (
          <div className="space-y-4">
            <Card className="rounded-xl shadow-sm border border-orange-200 bg-orange-50/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5" style={{ color: "#fb9678" }} />
                      <span className="text-lg font-bold" style={{ color: "#fb9678" }}>{selectedReturn.returnNo}</span>
                      <Badge variant="outline">{selectedReturn.platform}</Badge>
                      <Badge variant="outline" className={selectedReturn.returnStatus === "in_transit" ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"}>
                        {selectedReturn.returnStatus === "in_transit" ? "กำลังจัดส่ง" : "รับแล้ว"}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      ผู้ซื้อ: {selectedReturn.buyerName || "-"} | เหตุผล: {selectedReturn.reason} | Tracking: {selectedReturn.returnTrackingNo || "-"}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedReturn(null); setScannedItems(new Map()); setSearchResults([]); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-xl shadow-sm border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">รายการสินค้าคืน ({selectedReturn.items?.length || 0} รายการ)</CardTitle>
                  <div className="flex items-center gap-2">
                    <Select value={warehouseId} onValueChange={setWarehouseId}>
                      <SelectTrigger className="w-48 h-8 text-xs" data-testid="select-warehouse">
                        <SelectValue placeholder="เลือกคลังสินค้า" />
                      </SelectTrigger>
                      <SelectContent>
                        {(warehouses || []).map((w: any) => (
                          <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-xs w-8 text-center">#</TableHead>
                      <TableHead className="text-xs">สินค้า</TableHead>
                      <TableHead className="text-xs">SKU / Barcode</TableHead>
                      <TableHead className="text-xs text-center">จำนวนคืน</TableHead>
                      <TableHead className="text-xs text-center">จำนวนที่รับ</TableHead>
                      <TableHead className="text-xs text-center">สภาพ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedReturn.items || []).map((item: any, idx: number) => {
                      const scanned = scannedItems.get(item.id);
                      const isReceived = Number(item.receivedQty || 0) > 0;
                      return (
                        <TableRow key={item.id} className={isReceived ? "bg-green-50/50" : ""} data-testid={`row-item-${item.id}`}>
                          <TableCell className="text-center text-xs text-gray-500">{idx + 1}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{item.productName}</div>
                            {isReceived && <Badge className="text-[10px] bg-green-100 text-green-700 mt-1">รับแล้ว</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-gray-600">
                            {item.sku && <div>SKU: {item.sku}</div>}
                            {item.barcode && <div>BC: {item.barcode}</div>}
                          </TableCell>
                          <TableCell className="text-center text-sm font-medium">{Number(item.qty || 0)}</TableCell>
                          <TableCell className="text-center">
                            {isReceived ? (
                              <span className="text-sm font-medium text-green-600">{Number(item.receivedQty)}</span>
                            ) : (
                              <Input
                                type="number"
                                min={0}
                                max={Number(item.qty || 0)}
                                value={scanned?.receivedQty ?? Number(item.qty || 0)}
                                onChange={e => updateScannedItem(item.id, "receivedQty", Number(e.target.value))}
                                className="w-20 h-8 text-center text-sm mx-auto"
                                data-testid={`input-qty-${item.id}`}
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {isReceived ? (
                              <Badge variant="outline" className="text-[10px]">{item.receivedCondition || "-"}</Badge>
                            ) : (
                              <Select
                                value={scanned?.receivedCondition || "unopened"}
                                onValueChange={v => updateScannedItem(item.id, "receivedCondition", v)}
                              >
                                <SelectTrigger className="w-28 h-8 text-xs" data-testid={`select-condition-${item.id}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unopened">ไม่ได้เปิด</SelectItem>
                                  <SelectItem value="opened">เปิดแล้ว</SelectItem>
                                  <SelectItem value="damaged">ชำรุด</SelectItem>
                                  <SelectItem value="used">ใช้แล้ว</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {selectedReturn.returnStatus === "in_transit" && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setSelectedReturn(null); setScannedItems(new Map()); }} data-testid="button-cancel-receive">
                  ยกเลิก
                </Button>
                <Button
                  onClick={handleReceiveAll}
                  disabled={receiveMutation.isPending || !warehouseId}
                  className="text-white"
                  style={{ background: "#05b187" }}
                  data-testid="button-confirm-receive"
                >
                  {receiveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                  ยืนยันรับคืนทั้งหมด
                </Button>
              </div>
            )}

            {selectedReturn.returnStatus === "received" && (
              <div className="flex justify-center">
                <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-lg">
                  <PackageCheck className="h-5 w-5" />
                  <span className="text-sm font-medium">รับคืนเรียบร้อยแล้ว — กรุณาดำเนินการ QC ต่อ</span>
                  <Button size="sm" variant="outline" className="ml-2 text-xs" style={{ borderColor: "#03c9d7", color: "#03c9d7" }} onClick={() => navigate("/ecommerce/returns-qc")} data-testid="button-go-qc">
                    ไป QC →
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <CameraQrScanner
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onScan={raw => handleScanCode(raw)}
        title="สแกน QR / บาร์โค้ดสินค้าคืน"
      />
    </EcommerceLayout>
  );
}
