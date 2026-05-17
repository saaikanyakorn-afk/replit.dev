import { useState, useRef, useEffect } from "react";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { QrCode, User, Battery, CheckCircle2, Zap, Wrench, Shield, Package, ArrowLeft, Camera, Plus, Trash2, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { CameraQrScanner } from "@/components/camera-qr-scanner";

const PROCESSES = [
  { no: 1, label: "P1: เริ่มงาน / วางเคส", icon: Package, short: "เริ่มงาน" },
  { no: 2, label: "P2: ใส่เซลล์แบต", icon: Battery, short: "ใส่เซลล์" },
  { no: 3, label: "P3: ต่อบัสบา + สาย + หน้าจอ", icon: Zap, short: "ต่อสาย" },
  { no: 4, label: "P4: ต่อ BMS", icon: Shield, short: "BMS" },
  { no: 5, label: "P5: Balance Cell", icon: Wrench, short: "Balance" },
  { no: 6, label: "P6: ปิดฝา + สติ๊กเกอร์", icon: Package, short: "ปิดฝา" },
  { no: 7, label: "P7: QC ด้านนอก", icon: CheckCircle2, short: "QC" },
];

type Step = "employee" | "unit" | "process" | "cell_scan" | "balance" | "done";

export default function MesScanStation() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("employee");
  const [employeeQr, setEmployeeQr] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [unitQr, setUnitQr] = useState("");
  const [unitData, setUnitData] = useState<any>(null);
  const [selectedProcess, setSelectedProcess] = useState<number | null>(null);
  const [cells, setCells] = useState<string[]>([]);
  const [cellInput, setCellInput] = useState("");
  const [balanceBefore, setBalanceBefore] = useState("");
  const [balanceAfter, setBalanceAfter] = useState("");
  const [balanceNotes, setBalanceNotes] = useState("");
  const [balanceImage, setBalanceImage] = useState<File | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [loading, setLoading] = useState(false);

  const [empCameraOpen, setEmpCameraOpen] = useState(false);
  const [unitCameraOpen, setUnitCameraOpen] = useState(false);
  const [cellCameraOpen, setCellCameraOpen] = useState(false);

  const scanRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "employee" || step === "unit") {
      setTimeout(() => scanRef.current?.focus(), 100);
    }
    if (step === "cell_scan") {
      setTimeout(() => cellRef.current?.focus(), 100);
    }
  }, [step]);

  const lookupEmployee = async (qr: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/mes/employee-by-qr/${encodeURIComponent(qr)}?companyId=${companyId}`, { credentials: "include" });
      if (r.ok) {
        const emp = await r.json();
        setEmployeeQr(qr);
        setEmployeeName(emp.fullName || qr);
        setStep("unit");
        setScanInput("");
        toast({ title: `✅ สวัสดี ${emp.fullName || qr}!` });
      } else {
        setEmployeeQr(qr);
        setEmployeeName(qr);
        setStep("unit");
        setScanInput("");
        toast({ title: `✅ ยืนยันแล้ว: ${qr}` });
      }
    } finally { setLoading(false); }
  };

  const lookupUnit = async (qr: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/mes/units/by-qr/${encodeURIComponent(qr)}`, { credentials: "include" });
      if (!r.ok) {
        const err = await r.json();
        toast({ title: "ไม่พบ QR นี้", description: err.message, variant: "destructive" });
        setScanInput("");
        return;
      }
      const data = await r.json();
      setUnitData(data);
      setUnitQr(qr);
      setScanInput("");
      setStep("process");
    } catch {
      toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleScan = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (step === "employee") lookupEmployee(trimmed);
    else if (step === "unit") lookupUnit(trimmed);
  };

  const handleCellScan = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    if (cells.includes(trimmed)) { toast({ title: "เซลล์นี้เพิ่มไปแล้ว", variant: "destructive" }); setCellInput(""); return; }
    setCells(c => [...c, trimmed]);
    setCellInput("");
    setTimeout(() => cellRef.current?.focus(), 50);
  };

  const submitProcess = async () => {
    if (!selectedProcess || !unitData) return;
    setLoading(true);
    try {
      if (selectedProcess === 2 && cells.length > 0) {
        for (const cs of cells) {
          await fetch(`/api/mes/units/${unitData.id}/assign-cell`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ cellSerial: cs, employeeQr, employeeName }) });
        }
      }
      if (selectedProcess === 5) {
        const fd = new FormData();
        fd.append("employeeQr", employeeQr);
        fd.append("employeeName", employeeName);
        if (balanceBefore) fd.append("beforeValues", JSON.stringify({ raw: balanceBefore }));
        if (balanceAfter) fd.append("afterValues", JSON.stringify({ raw: balanceAfter }));
        if (balanceNotes) fd.append("notes", balanceNotes);
        if (balanceImage) fd.append("image", balanceImage);
        await fetch(`/api/mes/units/${unitData.id}/balance`, { method: "POST", body: fd, credentials: "include" });
      }
      const logRes = await fetch(`/api/mes/units/${unitData.id}/log-process`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ processNo: selectedProcess, employeeQr, employeeName }) });
      if (!logRes.ok) { const e = await logRes.json(); throw new Error(e.message || "บันทึกไม่สำเร็จ"); }
      setStep("done");
    } catch (e: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const reset = () => {
    setStep("unit");
    setUnitQr("");
    setUnitData(null);
    setSelectedProcess(null);
    setCells([]);
    setCellInput("");
    setBalanceBefore("");
    setBalanceAfter("");
    setBalanceNotes("");
    setBalanceImage(null);
    setScanInput("");
    setTimeout(() => scanRef.current?.focus(), 100);
  };

  const resetAll = () => {
    setStep("employee");
    setEmployeeQr("");
    setEmployeeName("");
    reset();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-6 pb-10 px-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <QrCode className="text-cyan-600 w-6 h-6" />
            <span className="text-gray-900 font-bold text-xl">สถานียิง QR</span>
          </div>
          <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900" onClick={() => navigate("/manufacturing/mes/work-orders")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> กลับ
          </Button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-1 mb-6">
          {["พนักงาน", "หน่วยผลิต", "Process", "เสร็จ"].map((s, i) => {
            const steps: Step[] = ["employee", "unit", "process", "done"];
            const active = steps.indexOf(step) >= i;
            return (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex-1 h-1.5 rounded-full ${active ? "bg-cyan-500" : "bg-gray-200"}`} />
                {i < 3 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        {/* ── Step: Employee ── */}
        {step === "employee" && (
          <Card title="ขั้นตอนที่ 1: ยืนยันตัวตน" subtitle="ยิง QR บัตรพนักงานของคุณ">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <QrCode className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <Input
                  ref={scanRef}
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleScan(scanInput); }}
                  placeholder="ยิง QR หรือพิมพ์รหัสพนักงาน..."
                  className="pl-10 h-12 text-base"
                  disabled={loading}
                  data-testid="input-employee-qr"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-1.5 h-12"
                onClick={() => setEmpCameraOpen(true)}
                aria-label="สแกนด้วยกล้อง"
                data-testid="button-emp-camera-scan"
              >
                <Camera className="h-4 w-4" />
                <span className="text-xs">กล้อง</span>
              </Button>
            </div>
            <Button className="w-full h-12 text-base mt-3 bg-cyan-500 hover:bg-cyan-600" onClick={() => handleScan(scanInput)} disabled={loading || !scanInput.trim()} data-testid="btn-confirm-employee">
              {loading ? "กำลังตรวจสอบ..." : "ยืนยัน →"}
            </Button>
          </Card>
        )}

        {/* ── Step: Unit ── */}
        {step === "unit" && (
          <Card title="ขั้นตอนที่ 2: ยิง QR กล่องแบต" subtitle={`พนักงาน: ${employeeName}`}>
            <div className="flex items-center gap-2 mb-4 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2">
              <User className="w-4 h-4 text-cyan-600" />
              <span className="text-cyan-700 text-sm font-medium">{employeeName}</span>
              <Button variant="ghost" size="sm" className="ml-auto text-gray-500 hover:text-gray-900 text-xs h-6 px-2" onClick={resetAll}>เปลี่ยน</Button>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <QrCode className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <Input
                  ref={scanRef}
                  value={scanInput}
                  onChange={e => setScanInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleScan(scanInput); }}
                  placeholder="ยิง QR Master ที่กล่องแบต..."
                  className="pl-10 h-12 text-base"
                  disabled={loading}
                  data-testid="input-unit-qr"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-1.5 h-12"
                onClick={() => setUnitCameraOpen(true)}
                aria-label="สแกนด้วยกล้อง"
                data-testid="button-unit-camera-scan"
              >
                <Camera className="h-4 w-4" />
                <span className="text-xs">กล้อง</span>
              </Button>
            </div>
            <Button className="w-full h-12 text-base mt-3 bg-cyan-500 hover:bg-cyan-600" onClick={() => handleScan(scanInput)} disabled={loading || !scanInput.trim()} data-testid="btn-confirm-unit">
              {loading ? "กำลังค้นหา..." : "ค้นหา →"}
            </Button>
          </Card>
        )}

        {/* ── Step: Process ── */}
        {step === "process" && unitData && (
          <div className="space-y-4">
            <Card title="ขั้นตอนที่ 3: เลือก Process" subtitle={`${unitData.workOrder?.productName || ""} · หน่วยที่ ${unitData.unitNo}`}>
              <div className="flex items-center gap-2 mb-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <QrCode className="w-4 h-4 text-cyan-600" />
                <span className="text-gray-700 font-mono">{unitData.masterQr}</span>
                <span className="ml-auto">
                  <UnitProgress current={unitData.currentProcess} />
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {PROCESSES.map(p => {
                  const done = unitData.currentProcess >= p.no;
                  const next = unitData.currentProcess + 1 === p.no;
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.no}
                      onClick={() => { setSelectedProcess(p.no); if (p.no === 2) setStep("cell_scan"); else if (p.no === 5) setStep("balance"); }}
                      disabled={done}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${done ? "border-emerald-200 bg-emerald-50 text-emerald-700 opacity-70 cursor-not-allowed" : next ? "border-cyan-400 bg-cyan-50 text-cyan-700 ring-1 ring-cyan-400" : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"}`}
                      data-testid={`btn-process-${p.no}`}
                    >
                      {done ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" /> : <Icon className={`w-5 h-5 flex-shrink-0 ${next ? "text-cyan-500" : "text-gray-400"}`} />}
                      <span className="font-medium">{p.label}</span>
                      {next && <span className="ml-auto text-xs text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded">ถัดไป</span>}
                      {done && <CheckCircle2 className="ml-auto w-4 h-4 text-emerald-500" />}
                    </button>
                  );
                })}
              </div>
            </Card>

            {selectedProcess && selectedProcess !== 2 && selectedProcess !== 5 && (
              <Card title={`ยืนยัน Process ${selectedProcess}`} subtitle={PROCESSES[selectedProcess - 1]?.label}>
                <Button className="w-full h-12 text-base bg-cyan-500 hover:bg-cyan-600" onClick={submitProcess} disabled={loading} data-testid="btn-confirm-process">
                  {loading ? "กำลังบันทึก..." : `✅ บันทึก P${selectedProcess} เสร็จแล้ว`}
                </Button>
                <Button variant="ghost" className="w-full mt-2 text-gray-500" onClick={() => setSelectedProcess(null)}>ยกเลิก</Button>
              </Card>
            )}
          </div>
        )}

        {/* ── Step: Cell Scan ── */}
        {step === "cell_scan" && (
          <Card title="P2: ยิง QR เซลล์แบต" subtitle={`หน่วยที่ ${unitData?.unitNo} — ยิงทีละก้อนจนครบ`}>
            <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
              <Battery className="w-4 h-4 text-purple-500" />
              <span>เซลล์ที่เพิ่มแล้ว: <strong className="text-purple-600">{cells.length} ก้อน</strong></span>
            </div>
            {cells.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 max-h-32 overflow-y-auto">
                {cells.map((c, i) => (
                  <div key={i} className="flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-0.5 text-xs font-mono">
                    {i + 1}. {c}
                    <button onClick={() => setCells(cs => cs.filter((_, j) => j !== i))} className="text-purple-400 hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-center mb-3">
              <div className="relative flex-1">
                <Battery className="absolute left-3 top-3 w-5 h-5 text-purple-400" />
                <Input
                  ref={cellRef}
                  value={cellInput}
                  onChange={e => setCellInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleCellScan(cellInput); }}
                  placeholder="ยิง QR เซลล์แบต..."
                  className="pl-10 h-12 text-base border-purple-300 focus-visible:ring-purple-400"
                  data-testid="input-cell-qr"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0 gap-1.5 h-12 border-purple-300 text-purple-600"
                onClick={() => setCellCameraOpen(true)}
                aria-label="สแกนด้วยกล้อง"
                data-testid="button-cell-camera-scan"
              >
                <Camera className="h-4 w-4" />
                <span className="text-xs">กล้อง</span>
              </Button>
            </div>
            <Button className="w-full h-10 mb-3 bg-purple-500 hover:bg-purple-600" onClick={() => handleCellScan(cellInput)} disabled={!cellInput.trim()}>
              <Plus className="w-4 h-4 mr-1" /> เพิ่มเซลล์
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setStep("process"); setSelectedProcess(null); }}>ยกเลิก</Button>
              <Button className="flex-1 bg-cyan-500 hover:bg-cyan-600" disabled={cells.length === 0 || loading} onClick={submitProcess} data-testid="btn-confirm-cells">
                {loading ? "บันทึก..." : `✅ บันทึกเซลล์ ${cells.length} ก้อน`}
              </Button>
            </div>
          </Card>
        )}

        {/* ── Step: Balance ── */}
        {step === "balance" && (
          <Card title="P5: Balance Cell" subtitle={`หน่วยที่ ${unitData?.unitNo}`}>
            <div className="space-y-3">
              <div>
                <Label className="text-gray-700 text-sm">ค่าแรงดันก่อน Balance (V)</Label>
                <Textarea value={balanceBefore} onChange={e => setBalanceBefore(e.target.value)} placeholder="เช่น: Cell1=3.2V, Cell2=3.18V, ..." className="text-sm mt-1" rows={3} data-testid="input-balance-before" />
              </div>
              <div>
                <Label className="text-gray-700 text-sm">ค่าแรงดันหลัง Balance (V)</Label>
                <Textarea value={balanceAfter} onChange={e => setBalanceAfter(e.target.value)} placeholder="เช่น: Cell1=3.28V, Cell2=3.28V, ..." className="text-sm mt-1" rows={3} data-testid="input-balance-after" />
              </div>
              <div>
                <Label className="text-gray-700 text-sm">หมายเหตุ</Label>
                <Textarea value={balanceNotes} onChange={e => setBalanceNotes(e.target.value)} className="text-sm mt-1" rows={2} data-testid="input-balance-notes" />
              </div>
              <div>
                <Label className="text-gray-700 text-sm">อัพโหลดรูปภาพ (ถ้ามี)</Label>
                <div className="mt-1 border border-dashed border-gray-300 rounded-lg p-3 text-center">
                  <input type="file" accept="image/*" capture="environment" className="hidden" id="balance-img" onChange={e => setBalanceImage(e.target.files?.[0] || null)} />
                  <label htmlFor="balance-img" className="cursor-pointer flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600">
                    <Camera className="w-6 h-6" />
                    <span className="text-xs">{balanceImage ? balanceImage.name : "ถ่ายรูปหรือเลือกไฟล์"}</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => { setStep("process"); setSelectedProcess(null); }}>ยกเลิก</Button>
              <Button className="flex-1 bg-teal-500 hover:bg-teal-600" onClick={submitProcess} disabled={loading} data-testid="btn-confirm-balance">
                {loading ? "บันทึก..." : "✅ บันทึก Balance"}
              </Button>
            </div>
          </Card>
        )}

        {/* ── Step: Done ── */}
        {step === "done" && (
          <Card title="✅ บันทึกสำเร็จ!" subtitle={`P${selectedProcess}: ${PROCESSES[(selectedProcess || 1) - 1]?.label}`}>
            <div className="text-center py-4">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
              <p className="text-gray-600 text-sm">หน่วยที่ {unitData?.unitNo} · {employeeName}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetAll}>พนักงานใหม่</Button>
              <Button className="flex-1 bg-cyan-500 hover:bg-cyan-600" onClick={reset} data-testid="btn-next-unit">
                ยิงกล่องถัดไป →
              </Button>
            </div>
          </Card>
        )}
      </div>

      <CameraQrScanner
        open={empCameraOpen}
        onClose={() => setEmpCameraOpen(false)}
        onScan={raw => { setScanInput(raw); handleScan(raw); }}
        title="สแกน QR บัตรพนักงาน"
      />
      <CameraQrScanner
        open={unitCameraOpen}
        onClose={() => setUnitCameraOpen(false)}
        onScan={raw => { setScanInput(raw); handleScan(raw); }}
        title="สแกน QR หน่วยผลิต"
      />
      <CameraQrScanner
        open={cellCameraOpen}
        onClose={() => setCellCameraOpen(false)}
        onScan={raw => handleCellScan(raw)}
        title="สแกน QR เซลล์แบต"
      />
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-gray-900 font-bold text-lg mb-0.5">{title}</h2>
      {subtitle && <p className="text-gray-500 text-sm mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function UnitProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {PROCESSES.map(p => (
        <div key={p.no} className={`w-3 h-3 rounded-full ${current >= p.no ? "bg-emerald-500" : "bg-gray-300"}`} title={p.short} />
      ))}
    </div>
  );
}
