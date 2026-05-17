import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { Printer, Search, UserCheck } from "lucide-react";
import QRCode from "qrcode";

interface EmployeeQRItem {
  id: number;
  fullName: string;
  username: string;
  role: string;
  avatarUrl: string | null;
  qrPayload: string;
}

// 62×40mm card at screen resolution (62/25.4*96 ≈ 234px wide, 40/25.4*96 ≈ 151px tall)
const CARD_W = 234;
const CARD_H = 151;
const QR_SIZE = 90;

function roleLabel(role: string): string {
  if (role === "superadmin") return "ผู้ดูแลระบบ";
  if (role === "admin") return "ผู้จัดการ";
  if (role === "accountant") return "นักบัญชี";
  if (role === "employee") return "พนักงาน";
  return role;
}

function EmployeeCard({ emp }: { emp: EmployeeQRItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, emp.qrPayload, { width: QR_SIZE, margin: 1, errorCorrectionLevel: "M" }, () => {});
    }
  }, [emp.qrPayload]);

  return (
    <div
      className="border border-gray-300 rounded flex flex-row items-center gap-2 bg-white"
      style={{ width: CARD_W, minHeight: CARD_H, padding: "6px 8px", boxSizing: "border-box" }}
      data-testid={`card-employee-${emp.id}`}
    >
      <canvas ref={canvasRef} style={{ flexShrink: 0 }} data-testid={`qr-canvas-${emp.id}`} />
      <div className="flex flex-col justify-center overflow-hidden" style={{ flex: 1, minWidth: 0 }}>
        <div className="font-semibold leading-tight truncate text-sm" data-testid={`text-employee-name-${emp.id}`}>
          {emp.fullName}
        </div>
        <div className="text-xs text-muted-foreground truncate" data-testid={`text-employee-role-${emp.id}`}>
          {roleLabel(emp.role)}
        </div>
        <div className="text-xs text-muted-foreground truncate" data-testid={`text-employee-username-${emp.id}`}>
          @{emp.username}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeQRPage() {
  const { selectedCompany: company } = useCompany();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data: employees = [], isLoading } = useQuery<EmployeeQRItem[]>({
    queryKey: ["/api/users/employee-qr-data", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const r = await fetch(`/api/users/employee-qr-data?companyId=${company.id}`, { credentials: "include" });
      if (!r.ok) throw new Error("โหลดรายชื่อพนักงานไม่สำเร็จ");
      return r.json();
    },
    enabled: !!company?.id,
  });

  const filtered = employees.filter(e =>
    e.fullName.toLowerCase().includes(search.toLowerCase()) ||
    e.username.toLowerCase().includes(search.toLowerCase())
  );

  const handlePrint = async () => {
    try {
      const dataUrls: { name: string; username: string; role: string; url: string }[] = [];
      for (const emp of filtered) {
        const url = await QRCode.toDataURL(emp.qrPayload, { width: 120, margin: 1, errorCorrectionLevel: "M" });
        dataUrls.push({ name: emp.fullName, username: emp.username, role: roleLabel(emp.role), url });
      }
      // Print at 62×40mm per card (landscape label format)
      const html = `<!DOCTYPE html><html><head><title>QR บัตรพนักงาน</title>
        <style>
          body { margin: 0; font-family: 'TH Sarabun New', 'Sarabun', sans-serif; }
          .grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; }
          .card {
            border: 1px solid #ccc; border-radius: 4px;
            width: 62mm; height: 40mm; box-sizing: border-box;
            padding: 3mm; display: flex; flex-direction: row;
            align-items: center; gap: 3mm; page-break-inside: avoid;
            overflow: hidden;
          }
          .card img { width: 28mm; height: 28mm; flex-shrink: 0; display: block; }
          .info { flex: 1; min-width: 0; overflow: hidden; }
          .name { font-size: 11pt; font-weight: bold; line-height: 1.3; white-space: normal; word-break: break-word; }
          .pos { font-size: 9pt; color: #555; }
          .user { font-size: 8pt; color: #888; }
          @media print {
            @page { size: A4 portrait; margin: 8mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style></head><body>
        <div class="grid">
          ${dataUrls.map(d => `
            <div class="card">
              <img src="${d.url}" />
              <div class="info">
                <div class="name">${d.name}</div>
                <div class="pos">ตำแหน่ง: ${d.role}</div>
                <div class="user">@${d.username}</div>
              </div>
            </div>`).join("")}
        </div>
        <script>window.onload = () => { window.print(); window.close(); }<\/script></body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
      else toast({ title: "ไม่สามารถเปิดหน้าต่างพิมพ์", description: "กรุณาอนุญาต popup ของเบราว์เซอร์", variant: "destructive" });
    } catch (e: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <UserCheck className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="title-employee-qr">QR บัตรพนักงาน</h1>
        </div>
        <Button
          onClick={handlePrint}
          disabled={filtered.length === 0}
          data-testid="button-print-employee-qr"
        >
          <Printer className="h-4 w-4 mr-2" />
          พิมพ์ QR ({filtered.length} คน)
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="ค้นหาชื่อพนักงาน..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-search-employee"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} style={{ width: CARD_W, height: CARD_H }} className="rounded" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground" data-testid="text-empty-employees">
          {search ? "ไม่พบพนักงานที่ค้นหา" : "ยังไม่มีรายชื่อพนักงาน"}
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {filtered.map(emp => <EmployeeCard key={emp.id} emp={emp} />)}
        </div>
      )}
    </div>
  );
}
