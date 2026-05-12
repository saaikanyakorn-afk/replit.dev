import HRLayout from "@/components/hr-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserPlus, Building2, UserCheck, UserX, Pencil, Trash2, Upload, Download, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2, Plus, Settings, LogOut, RotateCcw } from "lucide-react";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef, useEffect } from "react";
import { useShowMore } from "@/hooks/use-show-more";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { downloadFile } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useHrCompanyId } from "@/lib/company-context";

interface EmployeeForm {
  employeeCode: string;
  fullName: string;
  titlePrefix: string;
  firstName: string;
  lastName: string;
  nickname: string;
  idCardNumber: string;
  taxId: string;
  address: string;
  position: string;
  department: string;
  baseSalary: string;
  startDate: string;
  userId: string;
  phone: string;
  email: string;
  lineUserId: string;
  exemptFromCheckin: boolean;
  incomeType: string;
  workLocationId: string;
  dateOfBirth: string;
  bankName: string;
  bankAccountNumber: string;
}

const emptyForm: EmployeeForm = {
  employeeCode: "",
  fullName: "",
  titlePrefix: "",
  firstName: "",
  lastName: "",
  nickname: "",
  idCardNumber: "",
  taxId: "",
  address: "",
  position: "",
  department: "",
  baseSalary: "",
  startDate: "",
  userId: "",
  phone: "",
  email: "",
  lineUserId: "",
  exemptFromCheckin: false,
  incomeType: "1",
  workLocationId: "",
  dateOfBirth: "",
  bankName: "",
  bankAccountNumber: "",
};

export default function EmployeeList() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const companyId = useHrCompanyId();
  const { dateEra, dateFmt } = useDateSettings();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "resigned">("active");
  const [resignDialogOpen, setResignDialogOpen] = useState(false);
  const [resignTarget, setResignTarget] = useState<any>(null);
  const [resignForm, setResignForm] = useState({ resignDate: "", resignReason: "" });
  const [empSearch, setEmpSearch] = useState("");
  const [attendanceType, setAttendanceType] = useState("time_based");
  const [requiredHoursPerDay, setRequiredHoursPerDay] = useState("9");

  const { data: attendanceSettings } = useQuery<any>({
    queryKey: ["/api/hr/attendance-settings", editId],
    queryFn: async () => {
      if (!editId) return null;
      const r = await fetch(`/api/hr/attendance-settings/${editId}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!editId,
  });
  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || user?.role === "owner" || user?.role === "manager";

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/employees?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user && !!companyId,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const r = await fetch("/api/users", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user,
  });

  const { data: empCounter } = useQuery<any>({
    queryKey: ["/api/employee-counter", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/employee-counter/${companyId}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!user && !!companyId,
  });
  const [prefixInput, setPrefixInput] = useState("");

  const { data: departmentsList = [] } = useQuery<any[]>({
    queryKey: ["/api/departments"],
    queryFn: async () => {
      const r = await fetch("/api/departments", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user,
  });

  const { data: workLocationsList = [] } = useQuery<any[]>({
    queryKey: ["/api/work-locations", companyId],
    queryFn: async () => {
      const r = await fetch(`/api/work-locations?companyId=${companyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user && !!companyId,
  });

  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [deptEditId, setDeptEditId] = useState<number | null>(null);
  const [deptForm, setDeptForm] = useState({ name: "", description: "" });

  const createDeptMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: "เพิ่มแผนกสำเร็จ" });
      setDeptForm({ name: "", description: "" });
      setDeptDialogOpen(false);
    },
    onError: (err: any) => toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const updateDeptMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/departments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: "แก้ไขแผนกสำเร็จ" });
      setDeptEditId(null);
      setDeptForm({ name: "", description: "" });
      setDeptDialogOpen(false);
    },
    onError: (err: any) => toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const deleteDeptMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/departments/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: "ลบแผนกสำเร็จ" });
    },
    onError: (err: any) => toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const handleDeptSubmit = () => {
    if (deptEditId) {
      updateDeptMutation.mutate({ id: deptEditId, data: deptForm });
    } else {
      createDeptMutation.mutate(deptForm);
    }
  };

  const createPrefixMutation = useMutation({
    mutationFn: async (prefix: string) => {
      const r = await fetch("/api/employee-counter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, prefix }),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employee-counter", companyId] });
      toast({ title: "ตั้งค่า Prefix สำเร็จ" });
      setPrefixInput("");
    },
    onError: (err: any) => {
      toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, companyId }),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/unlinked-employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-counter", companyId] });
      toast({ title: "เพิ่มพนักงานสำเร็จ" });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/unlinked-employees"] });
      toast({ title: "แก้ไขพนักงานสำเร็จ" });
      setDialogOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/employees/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const text = await r.text();
        try { const d = JSON.parse(text); throw new Error(d.message); } catch { throw new Error(text || `ไม่สามารถลบได้ (${r.status})`); }
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/unlinked-employees"] });
      toast({ title: "ลบพนักงานสำเร็จ" });
    },
    onError: (err: any) => {
      toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" });
    },
  });

  const saveAttendanceSettingsMutation = useMutation({
    mutationFn: async ({ employeeId, type, hours }: { employeeId: number; type: string; hours: string }) => {
      const r = await fetch(`/api/hr/attendance-settings/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceType: type, requiredHoursPerDay: hours }),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
  });

  useEffect(() => {
    if (attendanceSettings) {
      setAttendanceType(attendanceSettings.attendanceType || "time_based");
      setRequiredHoursPerDay(attendanceSettings.requiredHoursPerDay || "9");
    } else if (editId && !attendanceSettings) {
      setAttendanceType("time_based");
      setRequiredHoursPerDay("9");
    }
  }, [attendanceSettings, editId]);

  const resignMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await fetch(`/api/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", companyId] });
      toast({ title: "บันทึกสถานะพนักงานสำเร็จ" });
      setResignDialogOpen(false);
      setResignTarget(null);
      setResignForm({ resignDate: "", resignReason: "" });
    },
    onError: (err: any) => toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const handleResign = () => {
    if (!resignTarget) return;
    resignMutation.mutate({
      id: resignTarget.id,
      data: {
        employmentStatus: "resigned",
        active: false,
        resignDate: resignForm.resignDate || null,
        resignReason: resignForm.resignReason || null,
      },
    });
  };

  const handleReinstate = (emp: any) => {
    if (!confirm(`ต้องการคืนสถานะพนักงาน "${emp.fullName}" เป็นพนักงานปัจจุบันหรือไม่?`)) return;
    resignMutation.mutate({
      id: emp.id,
      data: {
        employmentStatus: "active",
        active: true,
        resignDate: null,
        resignReason: null,
      },
    });
  };

  const [newDeptInline, setNewDeptInline] = useState("");
  const [showNewDeptInput, setShowNewDeptInput] = useState(false);
  const createDeptInlineMutation = useMutation({
    mutationFn: async (name: string) => {
      const r = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "include",
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: (data, name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setForm(f => ({ ...f, department: data?.name || name }));
      setNewDeptInline("");
      setShowNewDeptInput(false);
      toast({ title: `เพิ่มแผนก "${data?.name || name}" สำเร็จ` });
    },
    onError: (err: any) => toast({ title: "ไม่สำเร็จ", description: err.message, variant: "destructive" }),
  });

  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (companyId) formData.append("companyId", String(companyId));
      const res = await fetch("/api/employees/import-excel", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/employees", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/unlinked-employees"] });
      toast({ title: "นำเข้าสำเร็จ", description: data.message });
    } catch (err: any) {
      setImportResult({ error: err.message });
      toast({ title: "นำเข้าไม่สำเร็จ", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownloadTemplate = async () => {
    try { await downloadFile("/api/employees/template-excel", "template_employees.xlsx"); }
    catch { toast({ title: "ดาวน์โหลด template ไม่สำเร็จ", variant: "destructive" }); }
  };

  const handleSubmit = () => {
    const payload: any = {
      ...(editId ? { employeeCode: form.employeeCode } : {}),
      fullName: [form.titlePrefix, form.firstName, form.lastName].filter(Boolean).join(" ") || form.fullName,
      titlePrefix: form.titlePrefix || null,
      firstName: form.firstName || null,
      lastName: form.lastName || null,
      nickname: form.nickname || null,
      idCardNumber: form.idCardNumber || null,
      taxId: form.taxId || null,
      address: form.address || null,
      position: form.position || null,
      department: form.department || null,
      baseSalary: form.baseSalary || "0",
      startDate: form.startDate || null,
      userId: form.userId ? Number(form.userId) : null,
      phone: form.phone || null,
      email: form.email || null,
      lineUserId: form.lineUserId || null,
      exemptFromCheckin: form.exemptFromCheckin,
      incomeType: form.incomeType || "1",
      workLocationId: form.workLocationId ? Number(form.workLocationId) : null,
      dateOfBirth: form.dateOfBirth || null,
      bankName: form.bankName || null,
      bankAccountNumber: form.bankAccountNumber || null,
    };
    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
      saveAttendanceSettingsMutation.mutate({ employeeId: editId, type: attendanceType, hours: requiredHoursPerDay });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEdit = (emp: any) => {
    setEditId(emp.id);
    setForm({
      employeeCode: emp.employeeCode || "",
      fullName: emp.fullName || "",
      titlePrefix: emp.titlePrefix || "",
      firstName: emp.firstName || "",
      lastName: emp.lastName || "",
      nickname: emp.nickname || "",
      idCardNumber: emp.idCardNumber || "",
      taxId: emp.taxId || "",
      address: emp.address || "",
      position: emp.position || "",
      department: emp.department || "",
      baseSalary: emp.baseSalary || "",
      startDate: emp.startDate || "",
      userId: emp.userId ? String(emp.userId) : "",
      phone: emp.phone || "",
      email: emp.email || "",
      lineUserId: emp.lineUserId || "",
      exemptFromCheckin: emp.exemptFromCheckin || false,
      incomeType: emp.incomeType || "1",
      workLocationId: emp.workLocationId ? String(emp.workLocationId) : "",
      dateOfBirth: emp.dateOfBirth || "",
      bankName: emp.bankName || "",
      bankAccountNumber: emp.bankAccountNumber || "",
    });
    setAttendanceType("time_based");
    setRequiredHoursPerDay("9");
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setAttendanceType("time_based");
    setRequiredHoursPerDay("9");
    setDialogOpen(true);
  };

  const activeCount = employees.filter((e: any) => e.employmentStatus !== "resigned").length;
  const resignedCount = employees.filter((e: any) => e.employmentStatus === "resigned").length;
  const activeDepts = departmentsList.filter((d: any) => d.active);

  const filteredEmployees = employees.filter((e: any) => {
    if (statusFilter === "active" && e.employmentStatus === "resigned") return false;
    if (statusFilter === "resigned" && e.employmentStatus !== "resigned") return false;
    if (empSearch) {
      const s = empSearch.toLowerCase();
      return (e.fullName || "").toLowerCase().includes(s) ||
        (e.employeeCode || "").toLowerCase().includes(s) ||
        (e.position || "").toLowerCase().includes(s) ||
        (e.department || "").toLowerCase().includes(s) ||
        (e.phone || "").includes(s);
    }
    return true;
  });

  const { visibleItems, hasMore, remainingCount, totalCount, showMore } = useShowMore(filteredEmployees);

  return (
    <HRLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6" style={{ color: "#fb9678" }} />
            <h1 className="text-2xl font-bold" data-testid="text-page-title">ทะเบียนพนักงาน</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={async () => {
              try {
                const res = await fetch(`/api/employees/export-excel?companyId=${companyId}`, { credentials: "include" });
                if (!res.ok) throw new Error("Export failed");
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `employees_${companyId}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
              } catch { alert("ส่งออกไม่สำเร็จ กรุณาลองใหม่"); }
            }} className="rounded-full border-[var(--theme-primary)] text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10" data-testid="button-export-excel">
              <Download className="mr-2 h-4 w-4" /> ส่งออก Excel
            </Button>
            <Button variant="outline" onClick={() => { setImportOpen(true); setImportResult(null); }} className="rounded-full border-[#05b187] text-[#05b187] hover:bg-[#05b187]/10" data-testid="button-import-excel">
              <Upload className="mr-2 h-4 w-4" /> นำเข้า Excel
            </Button>
            <Button onClick={openAdd} style={{ background: "#fb9678" }} className="text-white hover:opacity-90 rounded-full" data-testid="button-add-employee">
              <UserPlus className="mr-2 h-4 w-4" /> เพิ่มพนักงาน
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-none shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium" data-testid="label-total-employees">พนักงานทั้งหมด</p>
                  <p className="text-3xl font-bold" style={{ color: "#fb9678" }} data-testid="text-total-employees">{employees.length}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: "#fff3ef" }}>
                  <Users className="h-6 w-6" style={{ color: "#fb9678" }} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium" data-testid="label-active-employees">พนักงานที่ใช้งาน</p>
                  <p className="text-3xl font-bold" style={{ color: "#03c9d7" }} data-testid="text-active-employees">{activeCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center" style={{ background: "#e5f9fa" }}>
                  <UserCheck className="h-6 w-6" style={{ color: "#03c9d7" }} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className={`border-none shadow-sm cursor-pointer hover:shadow-md transition-shadow ${statusFilter === "resigned" ? "ring-2 ring-red-300" : ""}`} onClick={() => setStatusFilter(statusFilter === "resigned" ? "active" : "resigned")}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium" data-testid="label-resigned-count">ลาออก/พ้นสภาพ</p>
                  <p className="text-3xl font-bold text-red-500" data-testid="text-resigned-count">{resignedCount}</p>
                </div>
                <div className="h-12 w-12 rounded-full flex items-center justify-center bg-red-50">
                  <UserX className="h-6 w-6 text-red-500" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                {statusFilter === "resigned" ? "กดเพื่อดูพนักงานปัจจุบัน" : "กดเพื่อดูพนักงานที่ออกแล้ว"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg" data-testid="text-employee-table-title">รายชื่อพนักงาน</CardTitle>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Users className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="ค้นหาพนักงาน..."
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    className="pl-9 h-9 w-56 text-sm"
                    data-testid="input-search-employee"
                  />
                </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { key: "active" as const, label: "ปัจจุบัน", count: activeCount },
                  { key: "resigned" as const, label: "ลาออก", count: resignedCount },
                  { key: "all" as const, label: "ทั้งหมด", count: employees.length },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      statusFilter === tab.key
                        ? tab.key === "resigned" ? "bg-red-500 text-white" : "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                    data-testid={`tab-filter-${tab.key}`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="text-xs font-bold">รหัสพนักงาน</TableHead>
                  <TableHead className="text-xs font-bold">ชื่อ-นามสกุล</TableHead>
                  <TableHead className="text-xs font-bold">ตำแหน่ง</TableHead>
                  <TableHead className="text-xs font-bold">แผนก</TableHead>
                  <TableHead className="text-xs font-bold text-right">เงินเดือน</TableHead>
                  <TableHead className="text-xs font-bold">วันเริ่มงาน</TableHead>
                  <TableHead className="text-xs font-bold text-center">สถานะ</TableHead>
                  <TableHead className="text-xs font-bold text-center">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.length > 0 ? visibleItems.map((emp: any) => {
                  const isResigned = emp.employmentStatus === "resigned";
                  return (
                    <TableRow key={emp.id} className={isResigned ? "opacity-60 bg-gray-50/50" : ""} data-testid={`row-employee-${emp.id}`}>
                      <TableCell className="text-xs font-mono" data-testid={`text-empcode-${emp.id}`}>{emp.employeeCode}</TableCell>
                      <TableCell className="text-xs font-medium" data-testid={`text-empname-${emp.id}`}>
                        {emp.firstName && emp.lastName ? [emp.titlePrefix, emp.firstName, emp.lastName].filter(Boolean).join(" ") : emp.fullName}
                        {isResigned && emp.resignDate && (
                          <span className="block text-[10px] text-red-400 mt-0.5">ออก: {emp.resignDate}</span>
                        )}
                        {emp.workLocationId && !isResigned && (() => {
                          const loc = workLocationsList.find((l: any) => l.id === emp.workLocationId);
                          return loc ? (
                            <span className="block text-[10px] text-blue-500 mt-0.5" data-testid={`text-location-${emp.id}`}>📍 {loc.name}</span>
                          ) : null;
                        })()}
                      </TableCell>
                      <TableCell className="text-xs" data-testid={`text-position-${emp.id}`}>{emp.position || "-"}</TableCell>
                      <TableCell className="text-xs" data-testid={`text-department-${emp.id}`}>{emp.department || "-"}</TableCell>
                      <TableCell className="text-xs text-right font-medium" data-testid={`text-salary-${emp.id}`}>
                        ฿{Number(emp.baseSalary || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-xs" data-testid={`text-startdate-${emp.id}`}>{emp.startDate || "-"}</TableCell>
                      <TableCell className="text-xs text-center" data-testid={`badge-status-${emp.id}`}>
                        <div className="flex flex-col items-center gap-1">
                          {isResigned ? (
                            <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">
                              ลาออก
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">
                              ปัจจุบัน
                            </Badge>
                          )}
                          {emp.exemptFromCheckin && !isResigned && (
                            <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-[10px]" data-testid={`badge-exempt-${emp.id}`}>
                              ไม่บังคับ
                            </Badge>
                          )}
                          {!emp.exemptFromCheckin && emp.attendanceType === "flexible_hours" && !isResigned && (
                            <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-[10px]" data-testid={`badge-flexible-${emp.id}`}>
                              ยืดหยุ่น
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {isResigned ? (
                            <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleReinstate(emp)} title="คืนสถานะพนักงาน" data-testid={`button-reinstate-${emp.id}`}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(emp)} data-testid={`button-edit-employee-${emp.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-orange-500 hover:text-orange-700 hover:bg-orange-50" onClick={() => { setResignTarget(emp); setResignForm({ resignDate: "", resignReason: "" }); setResignDialogOpen(true); }} title="บันทึกลาออก" data-testid={`button-resign-${emp.id}`}>
                                <LogOut className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { if (confirm(`ต้องการลบพนักงาน "${emp.fullName}" หรือไม่?`)) deleteMutation.mutate(emp.id); }} data-testid={`button-delete-employee-${emp.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs" data-testid="text-no-employees">
                      {statusFilter === "resigned" ? "ไม่มีพนักงานที่ลาออก/พ้นสภาพ" : "ยังไม่มีข้อมูลพนักงาน กดปุ่ม \"เพิ่มพนักงาน\" เพื่อเริ่มต้น"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {hasMore && (
              <div className="text-center py-3 border-t">
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); showMore(); }} className="text-sm font-medium hover:opacity-80 hover:underline cursor-pointer py-1 px-3" style={{ color: "var(--theme-primary)" }} data-testid="button-show-more">
                  แสดงเพิ่มเติม ({remainingCount} รายการ)
                </button>
              </div>
            )}
            {!hasMore && totalCount > 50 && (
              <div className="text-center py-2 text-xs text-muted-foreground">
                แสดงทั้งหมด {totalCount} รายการ
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-employee-form">
            <DialogHeader>
              <DialogTitle data-testid="text-dialog-title">{editId ? "แก้ไขพนักงาน" : "เพิ่มพนักงานใหม่"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">รหัสพนักงาน {editId ? "" : "(อัตโนมัติ)"}</label>
                  {editId ? (
                    <>
                      <Input
                        value={form.employeeCode}
                        onChange={e => setForm({ ...form, employeeCode: e.target.value.toUpperCase() })}
                        className="font-mono"
                        data-testid="input-employee-code"
                      />
                      <p className="text-[10px] text-amber-600 mt-1">⚠ แก้รหัสได้ แต่ต้องไม่ซ้ำกับพนักงานคนอื่นในบริษัทเดียวกัน</p>
                    </>
                  ) : empCounter ? (
                    <Input value={`${empCounter.prefix}${String(empCounter.lastNumber + 1).padStart(4, "0")} (อัตโนมัติ)`} readOnly className="bg-gray-50 font-mono" data-testid="input-employee-code" />
                  ) : (
                    <div className="flex gap-2">
                      <Input value={prefixInput} onChange={e => { const v = e.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase(); setPrefixInput(v); }} placeholder="EM" maxLength={2} className="w-20 font-mono uppercase" data-testid="input-prefix" />
                      <Button type="button" size="sm" disabled={prefixInput.length !== 2 || createPrefixMutation.isPending} onClick={() => createPrefixMutation.mutate(prefixInput)} data-testid="button-set-prefix">
                        {createPrefixMutation.isPending ? "..." : "ตั้ง Prefix"}
                      </Button>
                      <span className="text-xs text-muted-foreground self-center">ตัวอักษร 2 ตัว (เปลี่ยนไม่ได้)</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ชื่อ-นามสกุล (สร้างอัตโนมัติจากชื่อ+นามสกุล)</label>
                  <Input value={[form.titlePrefix, form.firstName, form.lastName].filter(Boolean).join(" ") || form.fullName} readOnly className="bg-gray-50" data-testid="input-full-name" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">คำนำหน้า</label>
                  <Select value={form.titlePrefix} onValueChange={v => setForm(f => ({ ...f, titlePrefix: v }))}>
                    <SelectTrigger data-testid="select-title-prefix"><SelectValue placeholder="เลือก" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="นาย">นาย</SelectItem>
                      <SelectItem value="นาง">นาง</SelectItem>
                      <SelectItem value="นางสาว">นางสาว</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ชื่อ *</label>
                  <Input value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="ชื่อจริง" data-testid="input-first-name" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">นามสกุล</label>
                  <Input value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="นามสกุล" data-testid="input-last-name" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ชื่อเล่น</label>
                  <Input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} placeholder="ชื่อเล่น" data-testid="input-nickname" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">เลขบัตรประชาชน (สำหรับ RD Prep)</label>
                  <Input value={form.idCardNumber} onChange={e => setForm(f => ({ ...f, idCardNumber: e.target.value }))} placeholder="1-xxxx-xxxxx-xx-x" maxLength={13} data-testid="input-id-card" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">เลขผู้เสียภาษี</label>
                  <Input value={form.taxId} onChange={e => setForm(f => ({ ...f, taxId: e.target.value }))} placeholder="เลขผู้เสียภาษี" data-testid="input-emp-tax-id" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">วันเดือนปีเกิด</label>
                  <ThaiDateInput value={form.dateOfBirth} onChange={(v: string) => setForm(f => ({ ...f, dateOfBirth: v }))} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-date-of-birth" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">ที่อยู่ (สำหรับ RD Prep / 50 ทวิ)</label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="ที่อยู่" data-testid="input-address" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ตำแหน่ง</label>
                  <Input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder="ตำแหน่ง" data-testid="input-position" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">แผนก</label>
                  {showNewDeptInput ? (
                    <div className="flex gap-1">
                      <Input
                        value={newDeptInline}
                        onChange={e => setNewDeptInline(e.target.value)}
                        placeholder="ชื่อแผนกใหม่"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === "Enter" && newDeptInline.trim()) {
                            if (activeDepts.some((d: any) => d.name.toLowerCase() === newDeptInline.trim().toLowerCase())) {
                              toast({ title: "แผนกนี้มีอยู่แล้ว", variant: "destructive" });
                              setForm(f => ({ ...f, department: activeDepts.find((d: any) => d.name.toLowerCase() === newDeptInline.trim().toLowerCase())?.name || newDeptInline.trim() }));
                              setShowNewDeptInput(false); setNewDeptInline("");
                            } else { createDeptInlineMutation.mutate(newDeptInline.trim()); }
                          }
                          if (e.key === "Escape") { setShowNewDeptInput(false); setNewDeptInline(""); }
                        }}
                        data-testid="input-new-dept-inline"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const trimmed = newDeptInline.trim();
                          if (!trimmed) return;
                          if (activeDepts.some((d: any) => d.name.toLowerCase() === trimmed.toLowerCase())) {
                            toast({ title: "แผนกนี้มีอยู่แล้ว", variant: "destructive" });
                            setForm(f => ({ ...f, department: activeDepts.find((d: any) => d.name.toLowerCase() === trimmed.toLowerCase())?.name || trimmed }));
                            setShowNewDeptInput(false); setNewDeptInline("");
                          } else { createDeptInlineMutation.mutate(trimmed); }
                        }}
                        disabled={!newDeptInline.trim() || createDeptInlineMutation.isPending}
                        style={{ background: "#05b187" }}
                        className="text-white hover:opacity-90 shrink-0 h-9 px-3"
                        data-testid="button-save-new-dept-inline"
                      >
                        {createDeptInlineMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setShowNewDeptInput(false); setNewDeptInline(""); }}
                        className="shrink-0 h-9 px-2"
                        data-testid="button-cancel-new-dept-inline"
                      >
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-1">
                      <Select value={form.department} onValueChange={v => setForm(f => ({ ...f, department: v }))}>
                        <SelectTrigger data-testid="select-department" className="flex-1"><SelectValue placeholder="เลือกแผนก" /></SelectTrigger>
                        <SelectContent>
                          {activeDepts.map((d: any) => (
                            <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowNewDeptInput(true)}
                        className="shrink-0 h-9 px-2 border-dashed border-[#05b187] text-[#05b187] hover:bg-[#05b187]/10"
                        title="เพิ่มแผนกใหม่"
                        data-testid="button-add-dept-inline"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">เงินเดือน</label>
                  <Input type="number" value={form.baseSalary} onChange={e => setForm(f => ({ ...f, baseSalary: e.target.value }))} placeholder="0.00" data-testid="input-base-salary" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">วันเริ่มงาน</label>
                  <ThaiDateInput value={form.startDate} onChange={(v: string) => setForm(f => ({ ...f, startDate: v }))} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-start-date" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ประเภทเงินได้</label>
                  <Select value={form.incomeType} onValueChange={v => setForm(f => ({ ...f, incomeType: v }))}>
                    <SelectTrigger data-testid="select-income-type"><SelectValue placeholder="เลือก" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">40(1) เงินเดือน/ค่าจ้าง</SelectItem>
                      <SelectItem value="2">40(2) รับจ้างทำงาน/นายหน้า</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">โทรศัพท์</label>
                  <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="08x-xxx-xxxx" data-testid="input-phone" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">อีเมล</label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" data-testid="input-email" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ธนาคาร</label>
                  <Select value={form.bankName} onValueChange={v => setForm(f => ({ ...f, bankName: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-bank-name">
                      <SelectValue placeholder="เลือกธนาคาร" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">ไม่ระบุ</SelectItem>
                      <SelectItem value="กสิกรไทย (KBANK)">กสิกรไทย (KBANK)</SelectItem>
                      <SelectItem value="ไทยพาณิชย์ (SCB)">ไทยพาณิชย์ (SCB)</SelectItem>
                      <SelectItem value="กรุงเทพ (BBL)">กรุงเทพ (BBL)</SelectItem>
                      <SelectItem value="กรุงไทย (KTB)">กรุงไทย (KTB)</SelectItem>
                      <SelectItem value="กรุงศรี (BAY)">กรุงศรี (BAY)</SelectItem>
                      <SelectItem value="ทหารไทยธนชาต (TTB)">ทหารไทยธนชาต (TTB)</SelectItem>
                      <SelectItem value="ออมสิน (GSB)">ออมสิน (GSB)</SelectItem>
                      <SelectItem value="ธ.ก.ส. (BAAC)">ธ.ก.ส. (BAAC)</SelectItem>
                      <SelectItem value="ซีไอเอ็มบี (CIMBT)">ซีไอเอ็มบี (CIMBT)</SelectItem>
                      <SelectItem value="ยูโอบี (UOB)">ยูโอบี (UOB)</SelectItem>
                      <SelectItem value="แลนด์แอนด์เฮ้าส์ (LHFG)">แลนด์แอนด์เฮ้าส์ (LHFG)</SelectItem>
                      <SelectItem value="เกียรตินาคินภัทร (KKP)">เกียรตินาคินภัทร (KKP)</SelectItem>
                      <SelectItem value="อื่นๆ">อื่นๆ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">เลขที่บัญชีธนาคาร</label>
                  <Input value={form.bankAccountNumber} onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))} placeholder="xxx-x-xxxxx-x" data-testid="input-bank-account" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">LINE User ID (สำหรับส่งสลิปเงินเดือน)</label>
                <Input value={form.lineUserId} onChange={e => setForm(f => ({ ...f, lineUserId: e.target.value }))} placeholder="U1234567890abcdef" data-testid="input-line-user-id" />
                {form.lineUserId ? (
                  <p className="text-xs text-green-600 mt-1">เชื่อม LINE แล้ว</p>
                ) : (
                  <div className="mt-2 p-3 bg-[#e0f7fa] rounded-lg border border-[#03c9d7]/20">
                    <p className="text-xs font-semibold text-[#03c9d7] mb-1">เชื่อม LINE อัตโนมัติ</p>
                    <p className="text-xs text-gray-600">ให้พนักงาน Add LINE OA เป็นเพื่อน แล้วพิมพ์:</p>
                    <p className="text-sm font-mono font-bold text-gray-800 mt-1 bg-white rounded px-2 py-1 inline-block" data-testid="text-line-link-command">ลงทะเบียน {form.employeeCode || "รหัสพนักงาน"}</p>
                    <p className="text-xs text-gray-500 mt-1">ระบบจะเชื่อม LINE User ID ให้อัตโนมัติ</p>
                  </div>
                )}
              </div>
              <div className="pt-1 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">รูปแบบการเช็คอิน</label>
                <div className="grid grid-cols-1 gap-2" data-testid="attendance-type-selector">
                  {[
                    { value: "time_based", label: "ปกติ", desc: "มีเวลาเข้างาน นับสาย นับขาดถ้าไม่มา" },
                    { value: "flexible_hours", label: "ยืดหยุ่น", desc: "เข้าเวลาไหนก็ได้ ไม่นับสาย แต่ต้องครบชั่วโมงที่กำหนด" },
                    { value: "no_checkin_required", label: "ไม่บังคับ", desc: "ไม่ต้องเช็คอินเลย ไม่นับขาด เช่น ผู้บริหาร" },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setAttendanceType(opt.value);
                        setForm(f => ({ ...f, exemptFromCheckin: opt.value === "no_checkin_required" }));
                      }}
                      className={`flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${attendanceType === opt.value ? "border-[#03c9d7] bg-cyan-50" : "border-gray-200 hover:border-gray-300"}`}
                      data-testid={`attendance-type-${opt.value}`}
                    >
                      <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${attendanceType === opt.value ? "border-[#03c9d7]" : "border-gray-300"}`}>
                        {attendanceType === opt.value && <div className="h-2 w-2 rounded-full bg-[#03c9d7]" />}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${attendanceType === opt.value ? "text-[#03c9d7]" : "text-gray-700"}`}>{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {attendanceType === "flexible_hours" && (
                  <div className="flex items-center gap-2 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <label className="text-sm text-amber-700 font-medium whitespace-nowrap">ชั่วโมงทำงานต่อวัน</label>
                    <Input
                      type="number"
                      min="1"
                      max="24"
                      step="0.5"
                      value={requiredHoursPerDay}
                      onChange={e => setRequiredHoursPerDay(e.target.value)}
                      className="w-24 h-8 text-center font-bold text-amber-800 border-amber-300"
                      data-testid="input-required-hours"
                    />
                    <span className="text-sm text-amber-700">ชม./วัน</span>
                  </div>
                )}
              </div>
              {workLocationsList.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">สาขาที่สังกัด (สถานที่ลงเวลา)</label>
                  <Select value={form.workLocationId} onValueChange={v => setForm(f => ({ ...f, workLocationId: v === "__none__" ? "" : v }))}>
                    <SelectTrigger data-testid="select-work-location">
                      <SelectValue placeholder="ทุกสาขา (ตรวจจากสาขาที่ใกล้ที่สุด)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" data-testid="option-location-none">ทุกสาขา (ตรวจจากสาขาที่ใกล้ที่สุด)</SelectItem>
                      {workLocationsList.filter((loc: any) => loc.active !== false).map((loc: any) => (
                        <SelectItem key={loc.id} value={String(loc.id)} data-testid={`option-location-${loc.id}`}>
                          {loc.name}{loc.address ? ` — ${loc.address}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1">ถ้าเลือกสาขา จะตรวจ GPS เฉพาะสาขานั้น ถ้าไม่เลือก จะตรวจทุกสาขา</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">ผู้ใช้ (User Account)</label>
                <Select value={form.userId} onValueChange={v => setForm(f => ({ ...f, userId: v }))}>
                  <SelectTrigger data-testid="select-user-id">
                    <SelectValue placeholder="เลือกผู้ใช้ (ไม่บังคับ)" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((u: any) => (
                      <SelectItem key={u.id} value={String(u.id)} data-testid={`option-user-${u.id}`}>
                        {u.fullName} ({u.username})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">ยกเลิก</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending || (!editId && !empCounter) || !form.firstName}
                  style={{ background: "#fb9678" }}
                  className="text-white hover:opacity-90"
                  data-testid="button-submit-employee"
                >
                  {createMutation.isPending || updateMutation.isPending ? "กำลังบันทึก..." : editId ? "บันทึกการแก้ไข" : "เพิ่มพนักงาน"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" style={{ color: "#05b187" }} />
                นำเข้าข้อมูลพนักงานจาก Excel
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800 font-medium mb-2">คำแนะนำ</p>
                <ul className="text-xs text-blue-700 space-y-1 list-disc pl-4">
                  <li>ดาวน์โหลด Template แล้วกรอกข้อมูลตามรูปแบบ</li>
                  <li>คอลัมน์ที่จำเป็น: <b>รหัสพนักงาน</b> และ <b>ชื่อ-นามสกุล</b></li>
                  <li>หากรหัสพนักงานซ้ำกับที่มีอยู่ ระบบจะอัพเดตข้อมูลแทน</li>
                  <li>รองรับวันที่ทั้ง YYYY-MM-DD และ DD/MM/YYYY (พ.ศ.)</li>
                </ul>
              </div>

              <Button variant="outline" onClick={handleDownloadTemplate} className="w-full rounded-full border-[var(--theme-primary)] text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10" data-testid="button-download-template">
                <Download className="mr-2 h-4 w-4" /> ดาวน์โหลด Template Excel
              </Button>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-[#05b187] transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportExcel}
                  className="hidden"
                  id="import-employee-file"
                  data-testid="input-import-file"
                />
                {importing ? (
                  <div className="space-y-2">
                    <Loader2 className="h-8 w-8 mx-auto animate-spin text-[#05b187]" />
                    <p className="text-sm text-muted-foreground">กำลังนำเข้าข้อมูล...</p>
                  </div>
                ) : (
                  <label htmlFor="import-employee-file" className="cursor-pointer space-y-2 block">
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p className="text-sm font-medium">คลิกเพื่อเลือกไฟล์ Excel</p>
                    <p className="text-xs text-muted-foreground">รองรับ .xlsx, .xls (ไม่เกิน 5MB)</p>
                  </label>
                )}
              </div>

              {importResult && !importResult.error && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    <p className="text-sm font-medium">นำเข้าสำเร็จ</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded p-2 text-center">
                      <p className="text-muted-foreground">เพิ่มใหม่</p>
                      <p className="text-lg font-bold text-[#05b187]">{importResult.created}</p>
                    </div>
                    <div className="bg-white rounded p-2 text-center">
                      <p className="text-muted-foreground">อัพเดต</p>
                      <p className="text-lg font-bold text-[var(--theme-primary)]">{importResult.updated}</p>
                    </div>
                  </div>
                  {importResult.errors?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> ข้อผิดพลาด ({importResult.errors.length} รายการ)
                      </p>
                      <div className="max-h-24 overflow-y-auto mt-1 space-y-0.5">
                        {importResult.errors.map((err: string, i: number) => (
                          <p key={i} className="text-xs text-amber-600">{err}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {importResult?.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-red-800">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm font-medium">เกิดข้อผิดพลาด</p>
                  </div>
                  <p className="text-xs text-red-700 mt-1">{importResult.error}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={resignDialogOpen} onOpenChange={(open) => { setResignDialogOpen(open); if (!open) { setResignTarget(null); setResignForm({ resignDate: "", resignReason: "" }); } }}>
          <DialogContent className="max-w-md" data-testid="dialog-resign">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <LogOut className="h-5 w-5" />
                บันทึกการลาออก / พ้นสภาพ
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {resignTarget && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-sm font-medium">{resignTarget.fullName}</p>
                  <p className="text-xs text-muted-foreground">{resignTarget.employeeCode} | {resignTarget.position || "-"} | {resignTarget.department || "-"}</p>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">วันที่ลาออก / พ้นสภาพ</label>
                <ThaiDateInput value={resignForm.resignDate} onChange={(v: string) => setResignForm(f => ({ ...f, resignDate: v }))} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-resign-date" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">เหตุผล</label>
                <Textarea value={resignForm.resignReason} onChange={e => setResignForm(f => ({ ...f, resignReason: e.target.value }))} placeholder="ลาออกด้วยตนเอง / สิ้นสุดสัญญา / ถูกเลิกจ้าง ฯลฯ" rows={3} data-testid="input-resign-reason" />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-700">หลังบันทึก พนักงานจะถูกย้ายไปยังรายการ "ลาออก" และไม่ปรากฏในระบบลงเวลา สามารถคืนสถานะได้ภายหลัง</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setResignDialogOpen(false)} data-testid="button-cancel-resign">ยกเลิก</Button>
                <Button onClick={handleResign} disabled={resignMutation.isPending} className="bg-red-500 text-white hover:bg-red-600" data-testid="button-confirm-resign">
                  {resignMutation.isPending ? "กำลังบันทึก..." : "ยืนยันการลาออก"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={deptDialogOpen} onOpenChange={(open) => { setDeptDialogOpen(open); if (!open) { setDeptEditId(null); setDeptForm({ name: "", description: "" }); } }}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="dialog-department">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" style={{ color: "#fb9678" }} />
                จัดการแผนก
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={deptForm.name}
                  onChange={e => setDeptForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="ชื่อแผนก"
                  data-testid="input-dept-name"
                />
                <Input
                  value={deptForm.description}
                  onChange={e => setDeptForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="คำอธิบาย (ไม่บังคับ)"
                  data-testid="input-dept-description"
                />
                <Button
                  onClick={handleDeptSubmit}
                  disabled={!deptForm.name || createDeptMutation.isPending || updateDeptMutation.isPending}
                  style={{ background: "#fb9678" }}
                  className="text-white hover:opacity-90 shrink-0"
                  data-testid="button-submit-dept"
                >
                  {deptEditId ? "บันทึก" : <><Plus className="h-4 w-4 mr-1" /> เพิ่ม</>}
                </Button>
                {deptEditId && (
                  <Button variant="outline" onClick={() => { setDeptEditId(null); setDeptForm({ name: "", description: "" }); }} className="shrink-0">ยกเลิก</Button>
                )}
              </div>
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold">ชื่อแผนก</TableHead>
                    <TableHead className="text-xs font-bold">คำอธิบาย</TableHead>
                    <TableHead className="text-xs font-bold text-center">พนักงาน</TableHead>
                    <TableHead className="text-xs font-bold text-center">จัดการ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departmentsList.length > 0 ? departmentsList.map((d: any) => {
                    const empCount = employees.filter((e: any) => e.department === d.name).length;
                    return (
                      <TableRow key={d.id} data-testid={`row-dept-${d.id}`}>
                        <TableCell className="text-sm font-medium">{d.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.description || "-"}</TableCell>
                        <TableCell className="text-sm text-center font-bold" style={{ color: "#03c9d7" }}>{empCount}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { setDeptEditId(d.id); setDeptForm({ name: d.name, description: d.description || "" }); }} data-testid={`button-edit-dept-${d.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { if (confirm(`ต้องการลบแผนก "${d.name}" หรือไม่?`)) deleteDeptMutation.mutate(d.id); }} data-testid={`button-delete-dept-${d.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-xs">
                        ยังไม่มีแผนก กดปุ่ม "เพิ่ม" เพื่อสร้างแผนกใหม่
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </HRLayout>
  );
}
