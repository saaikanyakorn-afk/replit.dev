import ManufacturingLayout from "@/components/manufacturing-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2, ChevronDown, ChevronRight, QrCode, Package, Factory, Truck, Calendar, Printer } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useSearch } from "wouter";
import QRCodeLib from "qrcode";

type Mode = "serial" | "lot";

function QRCanvas({ value, size = 180 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      QRCodeLib.toCanvas(ref.current, value, { width: size, margin: 2, color: { dark: "#1a1a2e", light: "#ffffff" } });
    }
  }, [value, size]);
  return <canvas ref={ref} width={size} height={size} />;
}

function LotTraceResult({ data, companyId }: { data: any; companyId: number }) {
  const { outputLot, mo, consumedLots } = data;
  const traceUrl = `${window.location.origin}/manufacturing/traceability?lot=${encodeURIComponent(outputLot.lotNumber)}`;

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4 print:space-y-3">
      <div className="flex items-center justify-between print:hidden">
        <h2 className="font-bold text-lg">ผลการตรวจสอบย้อนกลับ</h2>
        <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print-trace">
          <Printer className="w-4 h-4 mr-1" /> พิมพ์ / บันทึก PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-orange-500" />
                <span className="font-semibold text-sm">สินค้าสำเร็จรูป (Output)</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><span className="text-gray-500">ล็อต:</span> <span className="font-mono font-bold" style={{ color: "#03c9d7" }}>{outputLot.lotNumber}</span></div>
                <div><span className="text-gray-500">สินค้า:</span> <span className="font-medium">{outputLot.product?.name || "-"}</span></div>
                <div><span className="text-gray-500">รหัส:</span> <span className="font-mono text-gray-600">{outputLot.product?.code || "-"}</span></div>
                <div><span className="text-gray-500">จำนวน:</span> <span className="font-medium">{Number(outputLot.quantity).toLocaleString("th-TH")}</span></div>
                {outputLot.manufacturingDate && <div><span className="text-gray-500">วันผลิต:</span> {new Date(outputLot.manufacturingDate).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}</div>}
                {outputLot.expiryDate && <div><span className="text-gray-500">หมดอายุ:</span> <span className="text-red-600">{new Date(outputLot.expiryDate).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}</span></div>}
              </div>
            </CardContent>
          </Card>

          {mo && (
            <Card>
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <Factory className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold text-sm">ใบสั่งผลิต (MO)</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  <div><span className="text-gray-500">เลขที่:</span> <span className="font-mono font-medium">{mo.orderNo}</span></div>
                  {mo.completedAt && <div><span className="text-gray-500">ผลิตเสร็จ:</span> {new Date(mo.completedAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}</div>}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Truck className="w-4 h-4 text-green-600" />
                <span className="font-semibold text-sm">วัตถุดิบที่ใช้ผลิต ({consumedLots.length} รายการ)</span>
              </div>
              {consumedLots.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">ไม่มีข้อมูลวัตถุดิบ (อาจสร้างล็อตด้วยตนเอง)</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">วัตถุดิบ</TableHead>
                      <TableHead className="text-xs">ล็อต</TableHead>
                      <TableHead className="text-xs text-right">ใช้ไป</TableHead>
                      <TableHead className="text-xs">ซัพพลายเออร์</TableHead>
                      <TableHead className="text-xs">วันหมดอายุ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consumedLots.map((c: any, idx: number) => (
                      <TableRow key={idx} data-testid={`row-consumed-${idx}`}>
                        <TableCell className="text-xs">
                          <div className="font-medium">{c.product?.name || "-"}</div>
                          <div className="text-gray-400 font-mono">{c.product?.code || ""}</div>
                        </TableCell>
                        <TableCell className="font-mono text-xs" style={{ color: "#03c9d7" }}>{c.lotNumber}</TableCell>
                        <TableCell className="text-right text-xs">{Number(c.qtyConsumed).toLocaleString("th-TH", { maximumFractionDigits: 4 })}</TableCell>
                        <TableCell className="text-xs">{c.supplier || <span className="text-gray-300">-</span>}</TableCell>
                        <TableCell className="text-xs">
                          {c.expiryDate
                            ? <span className="text-red-600">{new Date(c.expiryDate).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })}</span>
                            : <span className="text-gray-300">-</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col items-center gap-3">
          <Card className="w-full">
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 mb-1">
                <QrCode className="w-4 h-4" style={{ color: "#03c9d7" }} />
                <span className="text-sm font-semibold">QR Traceability</span>
              </div>
              <QRCanvas value={traceUrl} size={200} />
              <p className="text-xs text-gray-400 text-center">สแกนเพื่อดูข้อมูลย้อนกลับ</p>
              <Badge className="font-mono text-xs break-all text-center" style={{ background: "#e0f7fa", color: "#03c9d7" }}>
                {outputLot.lotNumber}
              </Badge>
            </CardContent>
          </Card>
          <p className="text-xs text-gray-400 text-center px-2">QR นี้สำหรับแปะบนสินค้า / กล่อง เพื่อตรวจสอบย้อนกลับตอนลูกค้าเคลม</p>
        </div>
      </div>
    </div>
  );
}

export default function TraceabilityPage() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const searchStr = useSearch();
  const urlParams = new URLSearchParams(searchStr);
  const lotFromUrl = urlParams.get("lot") || "";

  const [mode, setMode] = useState<Mode>(lotFromUrl ? "lot" : "serial");
  const [serialSearch, setSerialSearch] = useState("");
  const [lotSearch, setLotSearch] = useState(lotFromUrl);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (lotFromUrl) { setMode("lot"); setLotSearch(lotFromUrl); }
  }, [lotFromUrl]);

  const { data: serialResults, isLoading: serialLoading } = useQuery({
    queryKey: ["/api/manufacturing-module/traceability", companyId, serialSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ companyId: String(companyId) });
      if (serialSearch) params.set("search", serialSearch);
      const res = await fetch(`/api/manufacturing-module/traceability?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!companyId && mode === "serial" && serialSearch.length >= 2,
  });

  const { data: lotData, isLoading: lotLoading, error: lotError } = useQuery({
    queryKey: ["/api/manufacturing-orders/lot-trace", companyId, lotSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ companyId: String(companyId), lot: lotSearch });
      const res = await fetch(`/api/manufacturing-orders/lot-trace?${params}`, { credentials: "include" });
      if (!res.ok) { const j = await res.json(); throw new Error(j.message || "Failed"); }
      return res.json();
    },
    enabled: !!companyId && mode === "lot" && lotSearch.length >= 2,
    retry: false,
  });

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <ManufacturingLayout>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Search className="w-6 h-6" style={{ color: "#03c9d7" }} />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">ตรวจสอบย้อนกลับ (Traceability)</h1>
        </div>

        <div className="flex gap-2">
          <Button
            variant={mode === "lot" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("lot")}
            data-testid="button-mode-lot"
            style={mode === "lot" ? { background: "#03c9d7" } : {}}
          >
            <QrCode className="w-4 h-4 mr-1" /> ค้นหาจากล็อตสินค้า
          </Button>
          <Button
            variant={mode === "serial" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("serial")}
            data-testid="button-mode-serial"
            style={mode === "serial" ? { background: "#03c9d7" } : {}}
          >
            <Search className="w-4 h-4 mr-1" /> ค้นหาจาก Serial Number
          </Button>
        </div>

        {mode === "lot" && (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="relative">
                  <QrCode className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="กรอกเลขล็อตสินค้าสำเร็จรูป เช่น MO-2026-001"
                    value={lotSearch}
                    onChange={e => setLotSearch(e.target.value)}
                    className="pl-9 text-base font-mono"
                    data-testid="input-lot-search"
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">พิมพ์อย่างน้อย 2 ตัวอักษร หรือสแกน QR Code บนสินค้า</div>
              </CardContent>
            </Card>

            {lotLoading && <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" /></div>}
            {lotError && <div className="text-center text-red-500 py-8" data-testid="text-lot-error">{(lotError as any).message}</div>}
            {lotData && <LotTraceResult data={lotData} companyId={companyId!} />}
          </>
        )}

        {mode === "serial" && (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="ค้นหา Serial Number ของสินค้าสำเร็จรูป หรือ ชิ้นส่วน..."
                    value={serialSearch}
                    onChange={e => setSerialSearch(e.target.value)}
                    className="pl-9 text-base"
                    data-testid="input-search-trace"
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา</div>
              </CardContent>
            </Card>

            {serialLoading ? (
              <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" /></div>
            ) : !serialResults?.length && serialSearch.length >= 2 ? (
              <div className="text-center text-gray-400 py-12" data-testid="text-no-results">ไม่พบข้อมูล Traceability สำหรับ "{serialSearch}"</div>
            ) : serialResults?.length > 0 ? (
              <div className="space-y-3">
                {serialResults.map((item: any) => {
                  const isExpanded = expandedIds.has(item.fgSerialId);
                  return (
                    <Card key={item.fgSerialId} data-testid={`card-trace-${item.fgSerialId}`}>
                      <CardContent className="p-4">
                        <button
                          onClick={() => toggleExpand(item.fgSerialId)}
                          className="w-full flex items-center justify-between"
                          data-testid={`btn-expand-${item.fgSerialId}`}
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                            <div className="text-left">
                              <div className="font-mono font-bold text-lg" style={{ color: "#03c9d7" }}>{item.fgSerialNumber}</div>
                              <div className="text-sm text-gray-500">{item.fgProductCode} — {item.fgProductName}</div>
                            </div>
                          </div>
                          <div className="text-right text-sm">
                            <div>ช่างประกอบ: <span className="font-medium">{item.operatorName || "-"}</span></div>
                            <div>QC: <span className="font-medium">{item.qcName || "-"}</span></div>
                            <div className="text-gray-400">{item.assembledAt ? new Date(item.assembledAt).toLocaleString("th-TH") : ""}</div>
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="mt-3 border-t pt-3">
                            <div className="text-sm font-medium mb-2">ชิ้นส่วนที่ใช้ประกอบ ({item.components?.length || 0} รายการ)</div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Serial Number</TableHead>
                                  <TableHead>รหัสสินค้า</TableHead>
                                  <TableHead>ชื่อสินค้า</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(item.components || []).map((c: any, idx: number) => (
                                  <TableRow key={idx}>
                                    <TableCell className="font-mono">{c.serialNumber}</TableCell>
                                    <TableCell className="font-mono text-gray-500">{c.productCode}</TableCell>
                                    <TableCell>{c.productName}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </ManufacturingLayout>
  );
}
