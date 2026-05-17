import { useState, useRef, useEffect } from "react";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { QrCode, User, CheckCircle2, ArrowLeft, Camera, ChevronRight, ListChecks, Factory } from "lucide-react";
import { useLocation } from "wouter";
import { CameraQrScanner } from "@/components/camera-qr-scanner";

type Step = "employee" | "mo" | "process" | "confirm" | "done";

interface ProcessStep {
  step_no: number;
  name: string;
  description?: string;
}

interface MoData {
  id: number;
  orderNo: string;
  productName: string;
  productCode: string;
  plannedQty: string;
  unit: string;
  status: string;
  processSteps: ProcessStep[];
  processLogs: { step_no: number; step_name: string; qty_passed: string; logged_by_name: string; logged_at: string }[];
}

function ScanCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h2 className="text-gray-900 font-bold text-lg mb-0.5">{title}</h2>
      {subtitle && <p className="text-gray-500 text-sm mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

export default function ProcessScanStation() {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const { toast } = useToast();

  const [step, setStep] = useState<Step>("employee");
  const [employeeQr, setEmployeeQr] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [moInput, setMoInput] = useState("");
  const [moData, setMoData] = useState<MoData | null>(null);
  const [selectedStep, setSelectedStep] = useState<ProcessStep | null>(null);
  const [qtyPassed, setQtyPassed] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const [empCameraOpen, setEmpCameraOpen] = useState(false);
  const [moCameraOpen, setMoCameraOpen] = useState(false);

  const empRef = useRef<HTMLInputElement>(null);
  const moRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "employee") setTimeout(() => empRef.current?.focus(), 100);
    if (step === "mo") setTimeout(() => moRef.current?.focus(), 100);
  }, [step]);

  const lookupEmployee = async (qr: string) => {
    const trimmed = qr.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/mes/employee-by-qr/${encodeURIComponent(trimmed)}?companyId=${companyId}`, { credentials: "include" });
      if (r.ok) {
        const emp = await r.json();
        setEmployeeQr(trimmed);
        setEmployeeName(emp.fullName || trimmed);
        toast({ title: `สวัสดี ${emp.fullName || trimmed}!` });
      } else {
        setEmployeeQr(trimmed);
        setEmployeeName(trimmed);
        toast({ title: `ยืนยันแล้ว: ${trimmed}` });
      }
      setStep("mo");
    } finally { setLoading(false); }
  };

  const lookupMo = async (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/manufacturing-orders/by-order-no/${encodeURIComponent(trimmed)}?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) {
        const err = await r.json();
        toast({ title: "ไม่พบใบสั่งผลิต", description: err.message, variant: "destructive" });
        setMoInput("");
        return;
      }
      const data = await r.json();
      if (data.status === "completed" || data.status === "cancelled") {
        toast({ title: "ใบสั่งผลิตนี้ปิดแล้ว", description: `สถานะ: ${data.status}`, variant: "destructive" });
        setMoInput("");
        return;
      }
      if (!data.processSteps || data.processSteps.length === 0) {
        toast({ title: "BOM ไม่มีขั้นตอนการผลิต", description: "กรุณาเพิ่มขั้นตอนใน BOM ก่อน", variant: "destructive" });
        setMoInput("");
        return;
      }
      setMoData(data);
      setQtyPassed(data.plannedQty || "1");
      setStep("process");
    } finally { setLoading(false); }
  };

  const submitLog = async () => {
    if (!selectedStep || !moData) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/manufacturing-orders/${moData.id}/process-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyId,
          stepNo: selectedStep.step_no,
          stepName: selectedStep.name,
          qtyPassed: Number(qtyPassed) || 0,
          notes: notes || undefined,
          loggedByName: employeeName || undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.message || "บันทึกไม่สำเร็จ");
      }
      setStep("done");
    } catch (e: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const resetToMo = () => {
    setMoInput("");
    setMoData(null);
    setSelectedStep(null);
    setQtyPassed("");
    setNotes("");
    setStep("mo");
  };

  const resetAll = () => {
    setEmployeeQr("");
    setEmployeeName("");
    setStep("employee");
    resetToMo();
  };

  const doneLogsForStep = (stepNo: number) =>
    (moData?.processLogs || []).filter(l => l.step_no === stepNo).length;

  const stepLabels = ["พนักงาน", "ใบสั่งผลิต", "เลือกขั้นตอน", "เสร็จ"];
  const stepKeys: Step[] = ["employee", "mo", "process", "done"];
  const currentStepIdx = stepKeys.indexOf(step === "confirm" ? "process" : step);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start pt-6 pb-10 px-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <ListChecks className="text-cyan-600 w-6 h-6" />
            <span className="text-gray-900 font-bold text-xl">Scan Station (ขั้นตอน)</span>
          </div>
          <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900" onClick={() => navigate("/manufacturing/orders")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> กลับ
          </Button>
        </div>

        <div className="flex items-center gap-1 mb-6">
          {stepLabels.map((s, i) => {
            const active = currentStepIdx >= i;
            return (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex-1 h-1.5 rounded-full ${active ? "bg-cyan-500" : "bg-gray-200"}`} />
                {i < stepLabels.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />}
              </div>
            );
          })}
        </div>

        {step === "employee" && (
          <ScanCard title="ขั้นตอนที่ 1: ยืนยันตัวตน" subtitle="ยิง QR บัตรพนักงานของคุณ">
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <QrCode className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <Input
                  ref={empRef}
                  value={employeeQr}
                  onChange={e => setEmployeeQr(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") lookupEmployee(employeeQr); }}
                  placeholder="ยิง QR หรือพิมพ์รหัสพนักงาน..."
                  className="pl-10 h-12 text-base"
                  disabled={loading}
                  data-testid="input-employee-qr"
                />
              </div>
              <Button type="button" variant="outline" className="shrink-0 gap-1.5 h-12" onClick={() => setEmpCameraOpen(true)} data-testid="button-emp-camera">
                <Camera className="h-4 w-4" />
                <span className="text-xs">กล้อง</span>
              </Button>
            </div>
            <Button className="w-full h-12 text-base mt-3 bg-cyan-500 hover:bg-cyan-600" onClick={() => lookupEmployee(employeeQr)} disabled={loading || !employeeQr.trim()} data-testid="button-confirm-employee">
              {loading ? "กำลังตรวจสอบ..." : "ยืนยัน →"}
            </Button>
          </ScanCard>
        )}

        {step === "mo" && (
          <ScanCard title="ขั้นตอนที่ 2: ยิง QR ใบสั่งผลิต" subtitle={`พนักงาน: ${employeeName}`}>
            <div className="flex items-center gap-2 mb-4 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2">
              <User className="w-4 h-4 text-cyan-600" />
              <span className="text-cyan-700 text-sm font-medium">{employeeName}</span>
              <Button variant="ghost" size="sm" className="ml-auto text-gray-500 text-xs h-6 px-2" onClick={resetAll}>เปลี่ยน</Button>
            </div>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Factory className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <Input
                  ref={moRef}
                  value={moInput}
                  onChange={e => setMoInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") lookupMo(moInput); }}
                  placeholder="ยิง QR หรือพิมพ์เลขที่ใบสั่งผลิต..."
                  className="pl-10 h-12 text-base font-mono"
                  disabled={loading}
                  data-testid="input-mo-qr"
                />
              </div>
              <Button type="button" variant="outline" className="shrink-0 gap-1.5 h-12" onClick={() => setMoCameraOpen(true)} data-testid="button-mo-camera">
                <Camera className="h-4 w-4" />
                <span className="text-xs">กล้อง</span>
              </Button>
            </div>
            <Button className="w-full h-12 text-base mt-3 bg-cyan-500 hover:bg-cyan-600" onClick={() => lookupMo(moInput)} disabled={loading || !moInput.trim()} data-testid="button-confirm-mo">
              {loading ? "กำลังค้นหา..." : "ค้นหา →"}
            </Button>
          </ScanCard>
        )}

        {(step === "process" || step === "confirm") && moData && (
          <div className="space-y-4">
            <ScanCard title="ขั้นตอนที่ 3: เลือกขั้นตอนการผลิต" subtitle={`${moData.productName} · ${moData.orderNo}`}>
              <div className="flex items-center gap-2 mb-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <Factory className="w-4 h-4 text-cyan-600" />
                <span className="font-mono text-gray-700">{moData.orderNo}</span>
                <span className="text-gray-400 ml-auto text-xs">{moData.productCode}</span>
                <Button variant="ghost" size="sm" className="text-gray-500 text-xs h-6 px-2" onClick={resetToMo}>เปลี่ยน MO</Button>
              </div>
              <div className="space-y-2">
                {moData.processSteps.map(ps => {
                  const logCount = doneLogsForStep(ps.step_no);
                  const isSelected = selectedStep?.step_no === ps.step_no;
                  return (
                    <button
                      key={ps.step_no}
                      onClick={() => { setSelectedStep(ps); setStep("confirm"); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${isSelected ? "border-cyan-400 bg-cyan-50 text-cyan-700 ring-1 ring-cyan-400" : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"}`}
                      data-testid={`button-step-${ps.step_no}`}
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-cyan-100 text-cyan-700 text-sm font-bold shrink-0">
                        {ps.step_no}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{ps.name}</div>
                        {ps.description && <div className="text-xs text-gray-400">{ps.description}</div>}
                      </div>
                      {logCount > 0 && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{logCount} ครั้ง</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                  );
                })}
              </div>
            </ScanCard>

            {step === "confirm" && selectedStep && (
              <ScanCard title={`ยืนยัน: ${selectedStep.name}`} subtitle={`ขั้นตอนที่ ${selectedStep.step_no} · ${moData.productName}`}>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">จำนวนชิ้นที่ผ่าน</Label>
                    <Input
                      type="number"
                      value={qtyPassed}
                      onChange={e => setQtyPassed(e.target.value)}
                      className="h-10"
                      data-testid="input-qty-passed"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">หมายเหตุ (ถ้ามี)</Label>
                    <Textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={2}
                      placeholder="เช่น ผ่านการตรวจ, พบปัญหา..."
                      className="text-sm"
                      data-testid="input-notes"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setStep("process")}>ยกเลิก</Button>
                  <Button className="flex-1 bg-cyan-500 hover:bg-cyan-600" onClick={submitLog} disabled={loading} data-testid="button-submit-log">
                    {loading ? "บันทึก..." : `✅ บันทึกขั้นตอน ${selectedStep.step_no}`}
                  </Button>
                </div>
              </ScanCard>
            )}
          </div>
        )}

        {step === "done" && selectedStep && moData && (
          <ScanCard title="✅ บันทึกสำเร็จ!" subtitle={`${selectedStep.name} · ${moData.orderNo}`}>
            <div className="text-center py-6">
              <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">{moData.productName}</p>
              <p className="text-gray-500 text-sm mt-1">ขั้นตอนที่ {selectedStep.step_no}: {selectedStep.name}</p>
              <p className="text-gray-400 text-xs mt-1">โดย {employeeName} · จำนวน {qtyPassed} ชิ้น</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={resetAll} data-testid="button-new-employee">พนักงานใหม่</Button>
              <Button className="flex-1 bg-cyan-500 hover:bg-cyan-600" onClick={() => { setSelectedStep(null); setNotes(""); setStep("process"); }} data-testid="button-next-step">
                ขั้นตอนถัดไป →
              </Button>
            </div>
            <Button variant="ghost" className="w-full mt-2 text-gray-500" onClick={resetToMo} data-testid="button-scan-next-mo">
              ยิง MO ใหม่
            </Button>
          </ScanCard>
        )}
      </div>

      <CameraQrScanner
        open={empCameraOpen}
        onClose={() => setEmpCameraOpen(false)}
        onScan={raw => { setEmployeeQr(raw); lookupEmployee(raw); }}
        title="สแกน QR บัตรพนักงาน"
      />
      <CameraQrScanner
        open={moCameraOpen}
        onClose={() => setMoCameraOpen(false)}
        onScan={raw => { setMoInput(raw); lookupMo(raw); }}
        title="สแกน QR ใบสั่งผลิต"
      />
    </div>
  );
}
