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

function EmployeeCard({ emp }: { emp: EmployeeQRItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, emp.qrPayload, { width: 120, margin: 1 }, () => {});
    }
  }, [emp.qrPayload]);

  return (
    <Card className="text-center p-4" data-testid={`card-employee-${emp.id}`}>
      <CardContent className="flex flex-col items-center gap-2 pt-2">
        <canvas ref={canvasRef} className="rounded" data-testid={`qr-canvas-${emp.id}`} />
        <div className="text-sm font-semibold leading-tight" data-testid={`text-employee-name-${emp.id}`}>{emp.fullName}</div>
        <div className="text-xs text-muted-foreground" data-testid={`text-employee-username-${emp.id}`}>@{emp.username}</div>
      </CardContent>
    </Card>
  );
}

export default function EmployeeQRPage() {
  const { company } = useCompany();
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
      const dataUrls: { name: string; username: string; url: string }[] = [];
      for (const emp of filtered) {
        const url = await QRCode.toDataURL(emp.qrPayload, { width: 160, margin: 1 });
        dataUrls.push({ name: emp.fullName, username: emp.username, url });
      }
      const html = `<!DOCTYPE html><html><head><title>QR บัตรพนักงาน</title>
        <style>
          body { margin: 0; font-family: 'TH Sarabun New', sans-serif; }
          .grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; }
          .card { border: 1px solid #ccc; border-radius: 6px; padding: 10px; text-align: center; width: 150px; page-break-inside: avoid; }
          img { width: 120px; height: 120px; display: block; margin: 0 auto 4px; }
          .name { font-size: 13px; font-weight: bold; line-height: 1.3; }
          .user { font-size: 11px; color: #666; }
          @media print { @page { size: A4; margin: 10mm; } }
        </style></head><body>
        <div class="grid">
          ${dataUrls.map(d => `<div class="card"><img src="${d.url}" /><div class="name">${d.name}</div><div class="user">@${d.username}</div></div>`).join("")}
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
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-52 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground" data-testid="text-empty-employees">
          {search ? "ไม่พบพนักงานที่ค้นหา" : "ยังไม่มีรายชื่อพนักงาน"}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4">
          {filtered.map(emp => <EmployeeCard key={emp.id} emp={emp} />)}
        </div>
      )}
    </div>
  );
}
