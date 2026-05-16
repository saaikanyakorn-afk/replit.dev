import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import ManufacturingLayout from "@/components/manufacturing-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, QrCode, CheckCircle2, Clock, Circle, User, Battery, Zap, Wrench, Shield, Package, Eye } from "lucide-react";

const PROCESS_INFO = [
  { no: 1, label: "เริ่มงาน / วางเคส", icon: Package, color: "blue" },
  { no: 2, label: "ใส่เซลล์แบต", icon: Battery, color: "purple" },
  { no: 3, label: "ต่อบัสบา + สายไฟ + หน้าจอ", icon: Zap, color: "amber" },
  { no: 4, label: "ต่อ BMS", icon: Shield, color: "orange" },
  { no: 5, label: "Balance Cell", icon: Wrench, color: "teal" },
  { no: 6, label: "ปิดฝา + ติดสติ๊กเกอร์", icon: Package, color: "slate" },
  { no: 7, label: "QC ด้านนอก", icon: CheckCircle2, color: "emerald" },
];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
  amber: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300" },
  orange: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  teal: { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200" },
  slate: { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-300" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

function fmt(dt: string) {
  if (!dt) return "-";
  const d = new Date(dt);
  return d.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function UnitCard({ unit }: { unit: any }) {
  const logByProcess: Record<number, any> = {};
  for (const l of unit.logs || []) { logByProcess[l.processNo] = l; }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-mono text-sm font-bold text-cyan-700">หน่วยที่ {unit.unitNo}</span>
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
            <QrCode className="w-3 h-3" /> {unit.masterQr}
          </div>
        </div>
        <UnitStatusBadge status={unit.status} currentProcess={unit.currentProcess} />
      </div>

      <div className="space-y-1.5">
        {PROCESS_INFO.map(p => {
          const done = unit.currentProcess >= p.no;
          const log = logByProcess[p.no];
          const c = COLOR_MAP[p.color];
          const Icon = p.icon;
          return (
            <div key={p.no} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${done ? `${c.bg} ${c.border}` : "bg-slate-50 border-slate-100"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${done ? `${c.bg} ${c.text}` : "bg-slate-200 text-slate-400"}`}>
                {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
              </div>
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${done ? c.text : "text-slate-400"}`} />
              <span className={done ? `${c.text} font-medium` : "text-slate-400"}>P{p.no}: {p.label}</span>
              {log && (
                <div className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
                  <User className="w-3 h-3" /> {log.employeeName || log.employeeQr || "-"}
                  <span>· {fmt(log.loggedAt)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {unit.cells && unit.cells.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1">
            <Battery className="w-3 h-3" /> เซลล์แบต ({unit.cells.length} ก้อน)
          </div>
          <div className="flex flex-wrap gap-1">
            {unit.cells.map((c: any, i: number) => (
              <Badge key={i} className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-mono border">{c.cellSerial}</Badge>
            ))}
          </div>
        </div>
      )}

      {unit.balance && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center gap-1">
            <Wrench className="w-3 h-3" /> ข้อมูล Balance Cell
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <User className="w-3 h-3" /> {unit.balance.employeeName || "-"} · {fmt(unit.balance.recordedAt)}
            {unit.balance.imageUrl && (
              <a href={unit.balance.imageUrl} target="_blank" rel="noreferrer" className="text-cyan-600 flex items-center gap-0.5 hover:underline ml-1">
                <Eye className="w-3 h-3" /> ดูรูป
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UnitStatusBadge({ status, currentProcess }: { status: string; currentProcess: number }) {
  if (status === "completed") return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">เสร็จสิ้น</Badge>;
  if (currentProcess === 0) return <Badge className="bg-slate-100 text-slate-500 border-0 text-xs">รอเริ่ม</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">P{currentProcess} ✓</Badge>;
}

export default function MesUnitDetail({ idProp }: { idProp?: string }) {
  const [location, navigate] = useLocation();
  const id = idProp || location.split("/").pop();

  const { data: wo, isLoading } = useQuery<any>({
    queryKey: ["/api/mes/work-orders", id],
    queryFn: async () => {
      const r = await fetch(`/api/mes/work-orders/${id}`, { credentials: "include" });
      if (!r.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
      return r.json();
    },
    enabled: !!id,
    refetchInterval: 10000,
  });

  return (
    <ManufacturingLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/manufacturing/mes/work-orders")} data-testid="btn-back">
            <ArrowLeft className="w-4 h-4 mr-1" /> กลับ
          </Button>
          {wo && (
            <div>
              <h1 className="text-xl font-bold text-slate-800">{wo.woNo}</h1>
              <p className="text-sm text-slate-500">{wo.productName} {wo.model ? `· ${wo.model}` : ""} · {wo.quantity} หน่วย</p>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-slate-400">กำลังโหลด...</div>
        ) : !wo ? (
          <div className="text-center py-16 text-slate-400">ไม่พบข้อมูล</div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: "จำนวนทั้งหมด", value: wo.quantity, cls: "text-slate-700" },
                { label: "รอเริ่ม", value: wo.units?.filter((u: any) => u.currentProcess === 0).length || 0, cls: "text-slate-500" },
                { label: "กำลังผลิต", value: wo.units?.filter((u: any) => u.currentProcess > 0 && u.status !== "completed").length || 0, cls: "text-blue-600" },
                { label: "เสร็จสิ้น", value: wo.units?.filter((u: any) => u.status === "completed").length || 0, cls: "text-emerald-600" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl border p-4 text-center shadow-sm">
                  <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
                  <div className="text-xs text-slate-400 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {wo.units?.length === 0 ? (
              <div className="text-center py-12 text-slate-400 bg-white rounded-xl border">
                <Clock className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>ยังไม่มีหน่วยผลิต — กด "เริ่มผลิต" จากหน้ารายการก่อน</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {wo.units?.map((unit: any) => <UnitCard key={unit.id} unit={unit} />)}
              </div>
            )}
          </>
        )}
      </div>
    </ManufacturingLayout>
  );
}
