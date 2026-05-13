import Layout from "@/components/layout";
import SettingsTabs from "@/components/settings-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Building2, Save, Loader2, Phone, Mail, Globe, MapPin, FileText, MessageCircle, ShieldCheck, Receipt, Package, BookOpen, CheckCircle2, AlertCircle, Star } from "lucide-react";
import { DatePicker, type DateFormat } from "@/components/ui/date-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";

export default function CompanyInfo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { selectedCompanyId, companies } = useCompany();
  const company = companies.find(c => c.id === selectedCompanyId) || null;
  const isLoading = !companies || companies.length === 0;
  const { data: permData } = useQuery<any>({
    queryKey: ["/api/permissions/me", selectedCompanyId],
    queryFn: async () => {
      const params = selectedCompanyId ? `?companyId=${selectedCompanyId}` : "";
      const r = await fetch(`/api/permissions/me${params}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60000,
  });
  const hasPurchasesModule = permData?.role === "admin" || permData?.permissions?.purchases !== false;

  const [form, setForm] = useState({
    name: "",
    nameEn: "",
    nameZh: "",
    address: "",
    addressEn: "",
    addressZh: "",
    phone: "",
    email: "",
    fax: "",
    taxId: "",
    branch: "",
    website: "",
    lineId: "",
    facebook: "",
    instagram: "",
    tiktok: "",
    etaxEmail: "",
    businessType: "mixed",
    vatRegistered: false,
    vatRegisteredDate: "",
    inventoryCostingMethod: "moving_average",
    inventoryAccountingMethod: "none",
    stockEntrySource: "gr",
    ecomAutoReceiveStock: false,
  });

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || "",
        nameEn: (company as any).nameEn || "",
        nameZh: (company as any).nameZh || "",
        address: company.address || "",
        addressEn: (company as any).addressEn || "",
        addressZh: (company as any).addressZh || "",
        phone: company.phone || "",
        email: (company as any).email || "",
        fax: (company as any).fax || "",
        taxId: company.taxId || "",
        branch: (company as any).branch || "",
        website: (company as any).website || "",
        lineId: (company as any).lineId || "",
        facebook: (company as any).facebook || "",
        instagram: (company as any).instagram || "",
        tiktok: (company as any).tiktok || "",
        etaxEmail: (company as any).etaxEmail || "",
        businessType: company.businessType || "mixed",
        vatRegistered: (company as any).vatRegistered || false,
        vatRegisteredDate: (company as any).vatRegisteredDate || "",
        inventoryCostingMethod: (company as any).inventoryCostingMethod || "moving_average",
        inventoryAccountingMethod: (company as any).inventoryAccountingMethod || "none",
        stockEntrySource: (company as any).stockEntrySource || "gr",
        ecomAutoReceiveStock: (company as any).ecomAutoReceiveStock || false,
      });
    }
  }, [company]);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await fetch(`/api/companies/${selectedCompanyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, vatRegisteredDate: data.vatRegisteredDate || null }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "บันทึกไม่สำเร็จ" }));
        throw new Error(err.message || "บันทึกไม่สำเร็จ");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "บันทึกสำเร็จ", description: "อัปเดตข้อมูลบริษัทเรียบร้อย", variant: "success" as any });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message || "ไม่สามารถบันทึกข้อมูลได้", variant: "destructive" });
    },
  });

  const handleSave = () => mutation.mutate(form);
  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [mergeResult, setMergeResult] = useState<{ added: number; existing: number } | null>(null);

  const [primarySearch, setPrimarySearch] = useState("");
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<number | null>(null);
  const [showPrimaryDropdown, setShowPrimaryDropdown] = useState(false);

  const { data: allTenantCompanies = [] } = useQuery<any[]>({
    queryKey: ["/api/companies/all-in-tenant"],
    queryFn: async () => {
      const r = await fetch("/api/companies/all-in-tenant", { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 30000,
  });

  const currentPrimary = allTenantCompanies.find((c: any) => c.isPrimary);
  const filteredPrimaryCompanies = allTenantCompanies.filter((c: any) =>
    primarySearch.trim() === "" ? false : c.name.toLowerCase().includes(primarySearch.toLowerCase())
  );

  const setPrimaryMutation = useMutation({
    mutationFn: async (companyId: number) => {
      const r = await fetch(`/api/companies/${companyId}/set-primary`, { method: "POST", credentials: "include" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "ไม่สำเร็จ" }));
        throw new Error(err.message);
      }
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/companies/all-in-tenant"] });
      setSelectedPrimaryId(null);
      setPrimarySearch("");
      setShowPrimaryDropdown(false);
      toast({ title: "ตั้งบริษัทหลักสำเร็จ", description: `"${data?.name}" เป็นบริษัทหลักแล้ว`, variant: "success" as any });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const CHART_TEMPLATES = [
    { key: "standard", label: "มาตรฐาน (ทั่วไป)", description: "384 บัญชี — เหมาะกับธุรกิจทุกประเภท" },
    { key: "ecommerce", label: "E-Commerce / ขายออนไลน์", description: "+ 111 บัญชี — Shopee, Lazada, TikTok Shop wallet และลูกหนี้แพลตฟอร์ม" },
    { key: "accounting_firm", label: "สำนักงานบัญชี", description: "+ 38 บัญชี — รายได้ค่าทำบัญชี, ค่าสอบบัญชี, ค่ายื่นภาษี, ค่าจดทะเบียน" },
    { key: "restaurant", label: "ร้านอาหาร / คาเฟ่", description: "+ 71 บัญชี — Grab/LINE MAN/foodpanda wallet, สินค้าวัตถุดิบอาหาร" },
    { key: "gas_station", label: "ปั๊มน้ำมัน", description: "+ 47 บัญชี — สต็อกน้ำมัน, ภาษีท้องถิ่น" },
  ];

  const mergeMutation = useMutation({
    mutationFn: async ({ companyId, template }: { companyId: number; template: string }) => {
      const r = await fetch("/api/accounts/merge-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId, template }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: "เกิดข้อผิดพลาด" }));
        throw new Error(err.message);
      }
      return r.json();
    },
    onSuccess: (data) => {
      setMergeResult({ added: data.added, existing: data.existing });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      if (data.added > 0) {
        toast({ title: "นำเข้าผังบัญชีสำเร็จ", description: `เพิ่ม ${data.added} บัญชีใหม่ (มีอยู่แล้ว ${data.existing} บัญชี)`, variant: "success" as any });
      } else {
        toast({ title: "ผังบัญชีครบแล้ว", description: `ไม่มีบัญชีใหม่ที่ต้องเพิ่ม (มีครบ ${data.existing} บัญชีแล้ว)` });
      }
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <SettingsTabs />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <SettingsTabs />
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#03c9d7] flex items-center justify-center">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold" data-testid="text-page-title">ตั้งค่าข้อมูลบริษัท</h1>
              <p className="text-sm text-muted-foreground">
                {company ? company.name : "แก้ไขข้อมูลบริษัทที่จะแสดงในเอกสาร"}
                {company && <span className="text-xs text-muted-foreground/50 ml-2">(ID: {selectedCompanyId})</span>}
              </p>
            </div>
          </div>
          <Button onClick={handleSave} disabled={mutation.isPending} data-testid="button-save-company">
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            บันทึก
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#03c9d7]" />
              ข้อมูลทั่วไป
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">🇹🇭 ชื่อบริษัท (ไทย)</Label>
                <Input value={form.name} onChange={e => set("name", e.target.value)} data-testid="input-company-name" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">🇬🇧 ชื่อบริษัท (อังกฤษ)</Label>
                <Input value={form.nameEn} onChange={e => set("nameEn", e.target.value)} data-testid="input-company-name-en" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">🇨🇳 ชื่อบริษัท (จีน)</Label>
                <Input value={form.nameZh} onChange={e => set("nameZh", e.target.value)} data-testid="input-company-name-zh" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="h-3 w-3" /> เลขประจำตัวผู้เสียภาษี
                </Label>
                <Input value={form.taxId} onChange={e => set("taxId", e.target.value)} placeholder="เช่น 0105561017020" data-testid="input-tax-id" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">สาขา</Label>
                <Input value={form.branch || "สำนักงานใหญ่"} onChange={e => set("branch", e.target.value)} placeholder="สำนักงานใหญ่ หรือ รหัสสาขา เช่น 00001" data-testid="input-branch" />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">ประเภทธุรกิจ</Label>
              <Select value={form.businessType} onValueChange={v => set("businessType", v)}>
                <SelectTrigger data-testid="select-business-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accounting_firm">สำนักงานบัญชี</SelectItem>
                  <SelectItem value="mixed">ทั่วไป (ซื้อ-ขาย + บริการ)</SelectItem>
                  <SelectItem value="online_shop">ร้านค้าออนไลน์ / E-Commerce</SelectItem>
                  <SelectItem value="trading">ซื้อมา-ขายไป</SelectItem>
                  <SelectItem value="service">ให้บริการ</SelectItem>
                  <SelectItem value="manufacturing">ผลิต / โรงงาน</SelectItem>
                  <SelectItem value="restaurant">ร้านอาหาร / คาเฟ่</SelectItem>
                  <SelectItem value="retail">ขายปลีก / หน้าร้าน</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-600" />
              จดทะเบียนภาษีมูลค่าเพิ่ม (VAT)
            </CardTitle>
            <p className="text-xs text-muted-foreground">หากกิจการจดทะเบียนภาษีมูลค่าเพิ่ม เอกสารฝั่งขายจะใส่ VAT 7% อัตโนมัติ หากไม่จด จะใส่ 0% แทน</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, vatRegistered: false, vatRegisteredDate: "" }))}
                className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${!form.vatRegistered ? "border-rose-400 bg-rose-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                data-testid="button-vat-not-registered"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${!form.vatRegistered ? "border-rose-500" : "border-gray-300"}`}>
                    {!form.vatRegistered && <div className="w-2 h-2 rounded-full bg-rose-500" />}
                  </div>
                  <span className={`text-sm font-semibold ${!form.vatRegistered ? "text-rose-700" : "text-gray-500"}`}>ไม่จดทะเบียน VAT</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">เอกสารขายจะใส่ภาษี 0% (ไม่มี VAT)</p>
              </button>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, vatRegistered: true }))}
                className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${form.vatRegistered ? "border-emerald-400 bg-emerald-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                data-testid="button-vat-registered"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.vatRegistered ? "border-emerald-500" : "border-gray-300"}`}>
                    {form.vatRegistered && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                  </div>
                  <span className={`text-sm font-semibold ${form.vatRegistered ? "text-emerald-700" : "text-gray-500"}`}>จดทะเบียน VAT แล้ว</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">เอกสารขายจะใส่ VAT 7% อัตโนมัติ</p>
              </button>
            </div>
            {form.vatRegistered && (
              <div className="max-w-xs">
                <Label className="text-xs text-muted-foreground">วันที่จดทะเบียน VAT</Label>
                <DatePicker
                  value={form.vatRegisteredDate}
                  onChange={(v) => setForm(prev => ({ ...prev, vatRegisteredDate: v }))}
                  dateFormat={"DD/MM/YYYY" as DateFormat}
                  dateEra="CE"
                  data-testid="input-vat-registered-date"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-amber-600" />
              วิธีคำนวณต้นทุนสินค้า
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">เลือกวิธีคำนวณต้นทุนสินค้าตามมาตรฐานการบัญชีไทย (TAS 2) ระบบจะใช้วิธีนี้ในรายงานสต๊อกการ์ดและรายงานมูลค่าสินค้าคงเหลือ</p>
            <div className="flex flex-col md:flex-row gap-3">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, inventoryCostingMethod: "moving_average" }))}
                className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${form.inventoryCostingMethod === "moving_average" ? "border-amber-400 bg-amber-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                data-testid="btn-costing-moving-average"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.inventoryCostingMethod === "moving_average" ? "border-amber-500" : "border-gray-300"}`}>
                    {form.inventoryCostingMethod === "moving_average" && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                  </div>
                  <span className={`text-sm font-semibold ${form.inventoryCostingMethod === "moving_average" ? "text-amber-700" : "text-gray-500"}`}>ถัวเฉลี่ยเคลื่อนที่</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">Moving Average — คำนวณต้นทุนเฉลี่ยใหม่ทุกครั้งที่รับสินค้าเข้า (นิยมใช้มากที่สุด)</p>
              </button>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, inventoryCostingMethod: "fifo" }))}
                className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${form.inventoryCostingMethod === "fifo" ? "border-blue-400 bg-blue-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                data-testid="btn-costing-fifo"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.inventoryCostingMethod === "fifo" ? "border-blue-500" : "border-gray-300"}`}>
                    {form.inventoryCostingMethod === "fifo" && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                  </div>
                  <span className={`text-sm font-semibold ${form.inventoryCostingMethod === "fifo" ? "text-blue-700" : "text-gray-500"}`}>เข้าก่อนออกก่อน</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">FIFO — สินค้าที่ซื้อเข้ามาก่อนจะถูกขายออกก่อน เหมาะกับสินค้าที่มีอายุ</p>
              </button>
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, inventoryCostingMethod: "specific" }))}
                className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${form.inventoryCostingMethod === "specific" ? "border-purple-400 bg-purple-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                data-testid="btn-costing-specific"
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.inventoryCostingMethod === "specific" ? "border-purple-500" : "border-gray-300"}`}>
                    {form.inventoryCostingMethod === "specific" && <div className="w-2 h-2 rounded-full bg-purple-500" />}
                  </div>
                  <span className={`text-sm font-semibold ${form.inventoryCostingMethod === "specific" ? "text-purple-700" : "text-gray-500"}`}>ระบุเฉพาะเจาะจง</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">Specific ID — ใช้ต้นทุนจริงของสินค้าแต่ละชิ้น เหมาะกับสินค้ามูลค่าสูง</p>
              </button>
            </div>
            <div className="pt-4 border-t">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <span>📋</span> วิธีบันทึกบัญชีสินค้าคงเหลือ
              </h4>
              <p className="text-xs text-muted-foreground mb-3">เลือกวิธีบันทึกบัญชีสินค้าคงเหลือ — ระบบ Perpetual จะบันทึก Dr. ต้นทุนขาย / Cr. สินค้าคงเหลือ อัตโนมัติทุกครั้งที่มีการขาย/เบิกสินค้า</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, inventoryAccountingMethod: "none" }))}
                  className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${form.inventoryAccountingMethod === "none" ? "border-gray-400 bg-gray-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.inventoryAccountingMethod === "none" ? "border-gray-500" : "border-gray-300"}`}>
                      {form.inventoryAccountingMethod === "none" && <div className="w-2 h-2 rounded-full bg-gray-500" />}
                    </div>
                    <span className={`text-sm font-semibold ${form.inventoryAccountingMethod === "none" ? "text-gray-700" : "text-gray-500"}`}>ไม่บันทึกอัตโนมัติ</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">บันทึกบัญชีสินค้าแยกเอง</p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, inventoryAccountingMethod: "perpetual" }))}
                  className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${form.inventoryAccountingMethod === "perpetual" ? "border-green-400 bg-green-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.inventoryAccountingMethod === "perpetual" ? "border-green-500" : "border-gray-300"}`}>
                      {form.inventoryAccountingMethod === "perpetual" && <div className="w-2 h-2 rounded-full bg-green-500" />}
                    </div>
                    <span className={`text-sm font-semibold ${form.inventoryAccountingMethod === "perpetual" ? "text-green-700" : "text-gray-500"}`}>Perpetual</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">บันทึก COGS อัตโนมัติทุกครั้งที่ขาย/เบิก</p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, inventoryAccountingMethod: "periodic" }))}
                  className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${form.inventoryAccountingMethod === "periodic" ? "border-orange-400 bg-orange-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.inventoryAccountingMethod === "periodic" ? "border-orange-500" : "border-gray-300"}`}>
                      {form.inventoryAccountingMethod === "periodic" && <div className="w-2 h-2 rounded-full bg-orange-500" />}
                    </div>
                    <span className={`text-sm font-semibold ${form.inventoryAccountingMethod === "periodic" ? "text-orange-700" : "text-gray-500"}`}>Periodic</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">บันทึกต้นทุนขายเฉพาะปลายงวด</p>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t">
              <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <span>📦</span> เอกสารนำเข้าสต๊อก
              </h4>
              <p className="text-xs text-muted-foreground mb-3">เลือกว่าจะใช้เอกสารไหนเป็นตัวเพิ่มจำนวนสินค้าในคลัง</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, stockEntrySource: "gr" }))}
                  className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${form.stockEntrySource === "gr" ? "border-cyan-400 bg-cyan-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                  data-testid="btn-stock-entry-gr"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.stockEntrySource === "gr" ? "border-cyan-500" : "border-gray-300"}`}>
                      {form.stockEntrySource === "gr" && <div className="w-2 h-2 rounded-full bg-cyan-500" />}
                    </div>
                    <span className={`text-sm font-semibold ${form.stockEntrySource === "gr" ? "text-cyan-700" : "text-gray-500"}`}>ใบรับสินค้า (GR)</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">อนุมัติ GR = สินค้าเข้าคลัง (แนะนำ)</p>
                </button>
                {hasPurchasesModule && (
                <button
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, stockEntrySource: "purchase_invoice" }))}
                  className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${form.stockEntrySource === "purchase_invoice" ? "border-indigo-400 bg-indigo-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                  data-testid="btn-stock-entry-pi"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.stockEntrySource === "purchase_invoice" ? "border-indigo-500" : "border-gray-300"}`}>
                      {form.stockEntrySource === "purchase_invoice" && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                    </div>
                    <span className={`text-sm font-semibold ${form.stockEntrySource === "purchase_invoice" ? "text-indigo-700" : "text-gray-500"}`}>เอกสารซื้อ (AP)</span>
                  </div>
                  <p className="text-xs text-gray-500 ml-6">บันทึกซื้อ = สินค้าเข้าคลังอัตโนมัติ</p>
                </button>
                )}
              </div>
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span>🛒</span> รับสต็อกอัตโนมัติ (E-Commerce)
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">เมื่อ import/sync ออเดอร์จาก e-commerce จะสร้างใบรับสินค้า (GR) และเพิ่มสต็อกให้อัตโนมัติ</p>
                </div>
                <Switch
                  checked={form.ecomAutoReceiveStock}
                  onCheckedChange={(checked) => setForm(prev => ({ ...prev, ecomAutoReceiveStock: checked }))}
                  data-testid="switch-ecom-auto-receive"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-green-600" />
              ที่อยู่
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">🇹🇭 ที่อยู่ (ไทย)</Label>
              <Textarea value={form.address} onChange={e => set("address", e.target.value)} rows={2} data-testid="input-address" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">🇬🇧 ที่อยู่ (อังกฤษ)</Label>
              <Textarea value={form.addressEn} onChange={e => set("addressEn", e.target.value)} rows={2} data-testid="input-address-en" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">🇨🇳 ที่อยู่ (จีน)</Label>
              <Textarea value={form.addressZh} onChange={e => set("addressZh", e.target.value)} rows={2} data-testid="input-address-zh" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4 text-amber-600" />
              ช่องทางติดต่อ
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> เบอร์โทรศัพท์
                </Label>
                <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="099-496-5000" data-testid="input-phone" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> แฟกซ์
                </Label>
                <Input value={form.fax} onChange={e => set("fax", e.target.value)} placeholder="02-xxx-xxxx" data-testid="input-fax" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> อีเมล
                </Label>
                <Input value={form.email} onChange={e => set("email", e.target.value)} placeholder="info@company.co.th" data-testid="input-email" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Globe className="h-3 w-3" /> เว็บไซต์
                </Label>
                <Input value={form.website} onChange={e => set("website", e.target.value)} placeholder="https://www.company.co.th" data-testid="input-website" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              e-Tax Invoice by Email (กรมสรรพากร)
            </CardTitle>
            <p className="text-xs text-muted-foreground">อีเมลที่ลงทะเบียนไว้กับกรมสรรพากร สำหรับส่ง e-Tax Invoice และใบลดหนี้อิเล็กทรอนิกส์</p>
          </CardHeader>
          <CardContent>
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3 text-blue-600" /> อีเมล e-Tax (ลงทะเบียนกับ RD)
              </Label>
              <Input value={form.etaxEmail} onChange={e => set("etaxEmail", e.target.value)} placeholder="etax@company.co.th (อีเมลที่ลงทะเบียนกับกรมสรรพากร)" data-testid="input-etax-email" />
              <p className="text-xs text-muted-foreground mt-1">ใช้สำหรับส่งใบกำกับภาษีอิเล็กทรอนิกส์ (e-Tax Invoice) และใบลดหนี้ ตามข้อกำหนดกรมสรรพากร</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-violet-200 bg-violet-50/30">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-violet-600" />
              นำเข้าผังบัญชีตามประเภทธุรกิจ
            </CardTitle>
            <p className="text-xs text-muted-foreground">เลือก template แล้วกด "นำเข้า" — จะเพิ่มเฉพาะบัญชีที่ยังไม่มี ไม่ลบบัญชีเดิม</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {CHART_TEMPLATES.map(tpl => (
                <button
                  key={tpl.key}
                  type="button"
                  onClick={() => { setSelectedTemplate(tpl.key); setMergeResult(null); }}
                  className={`w-full text-left rounded-lg border-2 p-3 transition-all ${selectedTemplate === tpl.key ? "border-violet-400 bg-violet-50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"}`}
                  data-testid={`button-template-${tpl.key}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selectedTemplate === tpl.key ? "border-violet-500" : "border-gray-300"}`}>
                      {selectedTemplate === tpl.key && <div className="w-2 h-2 rounded-full bg-violet-500" />}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${selectedTemplate === tpl.key ? "text-violet-700" : "text-gray-700"}`}>{tpl.label}</p>
                      <p className="text-xs text-muted-foreground">{tpl.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {mergeResult && (
              <div className={`flex items-center gap-2 rounded-lg p-3 text-sm ${mergeResult.added > 0 ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>
                {mergeResult.added > 0
                  ? <><CheckCircle2 className="h-4 w-4 flex-shrink-0" /> เพิ่ม <strong>{mergeResult.added}</strong> บัญชีใหม่ (มีอยู่แล้ว {mergeResult.existing} บัญชี)</>
                  : <><AlertCircle className="h-4 w-4 flex-shrink-0" /> ผังบัญชีครบแล้ว ไม่มีบัญชีใหม่ที่ต้องเพิ่ม (มี {mergeResult.existing} บัญชี)</>
                }
              </div>
            )}

            <Button
              type="button"
              disabled={!selectedTemplate || mergeMutation.isPending || !selectedCompanyId}
              onClick={() => mergeMutation.mutate({ companyId: selectedCompanyId!, template: selectedTemplate })}
              className="bg-violet-600 hover:bg-violet-700 text-white"
              data-testid="button-merge-template"
            >
              {mergeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BookOpen className="h-4 w-4 mr-2" />}
              นำเข้าผังบัญชี
            </Button>
          </CardContent>
        </Card>

        {allTenantCompanies.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/30">
            <CardHeader className="pb-4">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" />
                บริษัทหลักของสำนักงาน
              </CardTitle>
              <p className="text-xs text-muted-foreground">บริษัทหลักจะแสดงที่ด้านบนสุดของ sidebar และเป็นค่าเริ่มต้นในการทำเอกสาร</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-white border text-sm">
                <Star className={`h-4 w-4 flex-shrink-0 ${currentPrimary ? "text-amber-500 fill-amber-400" : "text-muted-foreground"}`} />
                <span className="text-muted-foreground text-xs">ปัจจุบัน:</span>
                {currentPrimary
                  ? <span className="font-medium" data-testid="text-current-primary">{currentPrimary.name}</span>
                  : <span className="text-destructive font-medium">ไม่มีบริษัทหลัก — กรุณาตั้งค่าใหม่</span>
                }
              </div>

              <div className="relative">
                <Input
                  placeholder="ค้นหาชื่อบริษัทที่ต้องการตั้งเป็นหลัก..."
                  value={selectedPrimaryId ? allTenantCompanies.find((c: any) => c.id === selectedPrimaryId)?.name || primarySearch : primarySearch}
                  onChange={e => { setPrimarySearch(e.target.value); setSelectedPrimaryId(null); setShowPrimaryDropdown(true); }}
                  onFocus={() => setShowPrimaryDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPrimaryDropdown(false), 150)}
                  data-testid="input-primary-search"
                />
                {showPrimaryDropdown && filteredPrimaryCompanies.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {filteredPrimaryCompanies.slice(0, 50).map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => { setSelectedPrimaryId(c.id); setPrimarySearch(c.name); setShowPrimaryDropdown(false); }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 flex items-center gap-2 ${c.isPrimary ? "bg-amber-50/50 font-medium" : ""}`}
                        data-testid={`option-primary-${c.id}`}
                      >
                        {c.isPrimary && <Star className="h-3 w-3 text-amber-500 fill-amber-400 flex-shrink-0" />}
                        <span>{c.name}</span>
                        {c.isPrimary && <span className="text-xs text-amber-600 ml-auto">(หลักปัจจุบัน)</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="button"
                disabled={!selectedPrimaryId || selectedPrimaryId === currentPrimary?.id || setPrimaryMutation.isPending}
                onClick={() => selectedPrimaryId && setPrimaryMutation.mutate(selectedPrimaryId)}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="button-set-primary-company"
              >
                {setPrimaryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Star className="h-4 w-4 mr-2" />}
                ตั้งเป็นบริษัทหลัก
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-purple-600" />
              โซเชียลมีเดีย
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">LINE@ / LINE Official</Label>
                <Input value={form.lineId} onChange={e => set("lineId", e.target.value)} placeholder="@company หรือ LINE ID" data-testid="input-line" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Facebook</Label>
                <Input value={form.facebook} onChange={e => set("facebook", e.target.value)} placeholder="facebook.com/company หรือชื่อเพจ" data-testid="input-facebook" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Instagram</Label>
                <Input value={form.instagram} onChange={e => set("instagram", e.target.value)} placeholder="@company" data-testid="input-instagram" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">TikTok</Label>
                <Input value={form.tiktok} onChange={e => set("tiktok", e.target.value)} placeholder="@company" data-testid="input-tiktok" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
