import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams, useSearch } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { apiRequest } from "@/lib/queryClient";
import ThaiDateInput from "@/components/thai-date-input";
import { useDateSettings } from "@/hooks/use-date-settings";
import { formatDate, formatNumber } from "@/lib/format";
import { ArrowLeft, Save, Calculator, BookOpen, Trash2, AlertTriangle, FileText, ChevronDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AccountCombobox } from "@/components/account-combobox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORIES = [
  { accountCode: "1401", name: "ที่ดิน", accumCode: null, depExpCode: null, usefulLifeMonths: 0, depreciationRate: 0 },
  { accountCode: "1411", name: "อาคาร", accumCode: "1412", depExpCode: "5251", usefulLifeMonths: 240, depreciationRate: 5 },
  { accountCode: "1421", name: "ส่วนต่อเติมอาคาร", accumCode: "1423", depExpCode: "5251", usefulLifeMonths: 240, depreciationRate: 5 },
  { accountCode: "1422", name: "ส่วนต่อเติมอาคารระหว่างทำ", accumCode: null, depExpCode: null, usefulLifeMonths: 0, depreciationRate: 0 },
  { accountCode: "1431", name: "เครื่องตกแต่งและติดตั้ง", accumCode: "1432", depExpCode: "5251", usefulLifeMonths: 60, depreciationRate: 20 },
  { accountCode: "1441", name: "อุปกรณ์สำนักงาน", accumCode: "1442", depExpCode: "5251", usefulLifeMonths: 60, depreciationRate: 20 },
  { accountCode: "1451", name: "ยานพาหนะ", accumCode: "1452", depExpCode: "5251", usefulLifeMonths: 60, depreciationRate: 20 },
  { accountCode: "1461", name: "อุปกรณ์คอมพิวเตอร์", accumCode: "1462", depExpCode: "5251", usefulLifeMonths: 36, depreciationRate: 33.33 },
  { accountCode: "1501", name: "สินทรัพย์ไม่มีตัวตน", accumCode: "1502", depExpCode: "5252", usefulLifeMonths: 60, depreciationRate: 20 },
  { accountCode: "1402", name: "งานระหว่างก่อสร้าง", accumCode: null, depExpCode: null, usefulLifeMonths: 0, depreciationRate: 0 },
];

export default function AssetForm() {
  const params = useParams<{ id: string }>();
  const assetId = params.id ? Number(params.id) : null;
  const isEdit = !!assetId;
  const [location, navigate] = useLocation();
  const { selectedCompanyId } = useCompany();
  const { dateEra, dateFmt } = useDateSettings();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    description: "",
    categoryAccountCode: "1441",
    accumDepreciationAccountCode: "1442",
    depreciationExpenseAccountCode: "5251",
    purchaseDate: "",
    startDepreciationDate: "",
    cost: "",
    salvageValue: "1",
    usefulLifeMonths: "60",
    depreciationMethod: "straight_line",
    location: "",
    department: "",
    supplier: "",
    invoiceRef: "",
    notes: "",
  });
  const [assetCode, setAssetCode] = useState("");
  const [calcDate, setCalcDate] = useState("");
  const [showDisposalDialog, setShowDisposalDialog] = useState(false);
  const [disposalDate, setDisposalDate] = useState("");
  const [disposalPrice, setDisposalPrice] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<string>("");

  const { data: asset } = useQuery<any>({
    queryKey: ["/api/fixed-assets", assetId],
    queryFn: () => fetch(`/api/fixed-assets/${assetId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!assetId,
  });

  const { data: nextCodeData } = useQuery<any>({
    queryKey: ["/api/fixed-assets/next-code", selectedCompanyId],
    queryFn: () => fetch(`/api/fixed-assets/next-code?companyId=${selectedCompanyId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedCompanyId && !isEdit,
  });

  const { data: depreciations = [] } = useQuery<any[]>({
    queryKey: ["/api/fixed-assets", assetId, "depreciations"],
    queryFn: () => fetch(`/api/fixed-assets/${assetId}/depreciations`, { credentials: "include" }).then(r => r.json()),
    enabled: !!assetId,
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/asset-categories"],
    queryFn: () => fetch(`/api/asset-categories`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: expensesWithAssets = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses-with-assets", selectedCompanyId],
    queryFn: () => fetch(`/api/expenses-with-assets?companyId=${selectedCompanyId}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!selectedCompanyId && !isEdit,
  });

  const cats = categories.length > 0 ? categories : CATEGORIES;

  useEffect(() => {
    if (asset && isEdit) {
      setAssetCode(asset.assetCode || "");
      setForm({
        name: asset.name || "",
        description: asset.description || "",
        categoryAccountCode: asset.categoryAccountCode || "",
        accumDepreciationAccountCode: asset.accumDepreciationAccountCode || "",
        depreciationExpenseAccountCode: asset.depreciationExpenseAccountCode || "5251",
        purchaseDate: asset.purchaseDate || "",
        startDepreciationDate: asset.startDepreciationDate || "",
        cost: asset.cost || "",
        salvageValue: asset.salvageValue || "0",
        usefulLifeMonths: String(asset.usefulLifeMonths || ""),
        depreciationMethod: asset.depreciationMethod || "straight_line",
        location: asset.location || "",
        department: asset.department || "",
        supplier: asset.supplier || "",
        invoiceRef: asset.invoiceRef || "",
        notes: asset.notes || "",
      });
    }
  }, [asset, isEdit]);

  useEffect(() => {
    if (nextCodeData?.code && !isEdit) {
      setAssetCode(nextCodeData.code);
    }
  }, [nextCodeData, isEdit]);

  useEffect(() => {
    if (!isEdit && urlParams.get("name")) {
      const acctCode = urlParams.get("accountCode") || "";
      const matchedCat = CATEGORIES.find(c => c.accountCode === acctCode)
        || CATEGORIES.find(c => acctCode.startsWith(c.accountCode.substring(0, 3)));
      setForm(prev => ({
        ...prev,
        name: urlParams.get("name") || prev.name,
        cost: urlParams.get("cost") || prev.cost,
        invoiceRef: urlParams.get("invoiceRef") || prev.invoiceRef,
        supplier: urlParams.get("supplier") || prev.supplier,
        purchaseDate: urlParams.get("purchaseDate") || prev.purchaseDate,
        startDepreciationDate: urlParams.get("purchaseDate") || prev.startDepreciationDate,
        ...(matchedCat ? {
          categoryAccountCode: matchedCat.accountCode,
          accumDepreciationAccountCode: matchedCat.accumCode || "",
          depreciationExpenseAccountCode: matchedCat.depExpCode || "5251",
          usefulLifeMonths: String(matchedCat.usefulLifeMonths || 60),
        } : {}),
      }));
    }
  }, [searchString]);

  const monthlyDep = useMemo(() => {
    const cost = parseFloat(form.cost) || 0;
    const salvage = parseFloat(form.salvageValue) || 0;
    const months = parseInt(form.usefulLifeMonths) || 0;
    if (months <= 0) return 0;
    return (cost - salvage) / months;
  }, [form.cost, form.salvageValue, form.usefulLifeMonths]);

  const disposalPreview = useMemo(() => {
    if (!asset) return null;
    const nbv = parseFloat(asset.netBookValue) || 0;
    const price = parseFloat(disposalPrice) || 0;
    return { gainLoss: price - nbv, nbv };
  }, [asset, disposalPrice]);

  function handleExpenseSelect(exp: any) {
    const assetItem = exp.assetItems?.[0];
    setSelectedExpense(`${exp.expNo} - ${exp.vendorName}`);
    setForm(prev => ({
      ...prev,
      name: assetItem?.description || assetItem?.accountName || prev.name,
      cost: String(assetItem?.amount || prev.cost),
      invoiceRef: exp.expNo || prev.invoiceRef,
      supplier: exp.vendorName || prev.supplier,
      purchaseDate: exp.expDate || prev.purchaseDate,
      startDepreciationDate: exp.expDate || prev.startDepreciationDate,
    }));
    setExpenseOpen(false);
  }

  function handleCategoryChange(code: string) {
    const cat = cats.find((c: any) => c.accountCode === code);
    setForm(prev => ({
      ...prev,
      categoryAccountCode: code,
      accumDepreciationAccountCode: cat?.accumCode || "",
      depreciationExpenseAccountCode: cat?.depExpCode || "5251",
      usefulLifeMonths: String(cat?.usefulLifeMonths || ""),
    }));
  }

  function updateField(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        companyId: selectedCompanyId,
        assetCode,
        cost: form.cost,
        salvageValue: form.salvageValue,
        usefulLifeMonths: parseInt(form.usefulLifeMonths) || 0,
      };
      if (isEdit) {
        const res = await apiRequest("PUT", `/api/fixed-assets/${assetId}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/fixed-assets", body);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: isEdit ? "บันทึกสำเร็จ" : "เพิ่มสินทรัพย์สำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets"] });
      navigate("/assets/registry");
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/fixed-assets/${assetId}/calculate-depreciation`, { upToDate: calcDate });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "คำนวณค่าเสื่อมราคาสำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets", assetId, "depreciations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets", assetId] });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const postDepMutation = useMutation({
    mutationFn: async (period: string) => {
      const res = await apiRequest("POST", `/api/fixed-assets/${assetId}/post-depreciation`, { period });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "บันทึกบัญชีสำเร็จ",
        description: data?.journalEntryId ? `สร้างสมุดรายวันเลขที่ ${data.journalEntryId} แล้ว` : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets", assetId, "depreciations"] });
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const disposeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/fixed-assets/${assetId}/dispose`, {
        disposalDate,
        disposalPrice,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "จำหน่ายสินทรัพย์สำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets"] });
      navigate("/assets/registry");
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/fixed-assets/${assetId}`);
    },
    onSuccess: () => {
      toast({ title: "ลบสินทรัพย์สำเร็จ" });
      queryClient.invalidateQueries({ queryKey: ["/api/fixed-assets"] });
      navigate("/assets/registry");
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/assets/registry")} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-heading font-bold" data-testid="text-form-title">
              {isEdit ? "แก้ไขสินทรัพย์" : "เพิ่มสินทรัพย์ใหม่"}
            </h1>
          </div>
          <div className="flex gap-2">
            {isEdit && (
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)} data-testid="button-delete-asset">
                <Trash2 className="h-4 w-4 mr-1" /> ลบ
              </Button>
            )}
            <Button
              style={{ background: "var(--theme-primary)" }} className="hover:opacity-90 text-white"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save"
            >
              <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
          </div>
        </div>

        {!isEdit && expensesWithAssets.length > 0 && (
          <Card className="rounded-none shadow-sm border-t-4 border-t-amber-400">
            <CardContent className="py-3">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="flex-1">
                  <Label className="text-sm font-semibold">ดึงข้อมูลจากเอกสารรายจ่าย</Label>
                  <Popover open={expenseOpen} onOpenChange={setExpenseOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between mt-1 h-9 text-sm border-dashed"
                        data-testid="select-expense-doc"
                      >
                        {selectedExpense || "เลือกเอกสารรายจ่าย..."}
                        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[460px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="ค้นหาเลขที่เอกสาร / ผู้จำหน่าย..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>ไม่พบเอกสารรายจ่ายที่มีรายการสินทรัพย์</CommandEmpty>
                          <CommandGroup>
                            {expensesWithAssets.map((exp: any) => (
                              <CommandItem
                                key={exp.id}
                                value={`${exp.expNo} ${exp.vendorName}`}
                                onSelect={() => handleExpenseSelect(exp)}
                                className="text-sm"
                              >
                                <div className="flex items-center justify-between w-full">
                                  <div>
                                    <span className="font-medium text-sky-700">{exp.expNo}</span>
                                    <span className="mx-2 text-slate-400">|</span>
                                    <span>{exp.vendorName}</span>
                                  </div>
                                  <Badge variant="outline" className="text-xs ml-2">
                                    {exp.assetItems.length} รายการ
                                  </Badge>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-none shadow-sm border-t-4 border-t-[var(--theme-primary)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ข้อมูลสินทรัพย์</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>รหัสสินทรัพย์</Label>
                <Input value={assetCode} readOnly className="bg-slate-50" data-testid="input-asset-code" />
              </div>
              <div>
                <Label>ชื่อสินทรัพย์ *</Label>
                <Input value={form.name} onChange={e => updateField("name", e.target.value)} data-testid="input-name" />
              </div>
              <div>
                <Label>หมวดหมู่ *</Label>
                <AccountCombobox
                  accounts={cats.map((c: any) => ({ id: c.id || 0, code: c.accountCode, name: c.name, nameTh: c.name }))}
                  value={form.categoryAccountCode}
                  onSelect={(acc) => handleCategoryChange(acc.code)}
                  testId="select-category"
                  placeholder="เลือกหมวดหมู่"
                />
              </div>
            </div>
            <div>
              <Label>คำอธิบาย</Label>
              <Textarea value={form.description} onChange={e => updateField("description", e.target.value)} rows={2} data-testid="input-description" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>สถานที่</Label>
                <Input value={form.location} onChange={e => updateField("location", e.target.value)} data-testid="input-location" />
              </div>
              <div>
                <Label>แผนก</Label>
                <Input value={form.department} onChange={e => updateField("department", e.target.value)} data-testid="input-department" />
              </div>
              <div>
                <Label>ผู้จำหน่าย</Label>
                <Input value={form.supplier} onChange={e => updateField("supplier", e.target.value)} data-testid="input-supplier" />
              </div>
              <div>
                <Label>เลขที่ใบกำกับ</Label>
                <Input value={form.invoiceRef} onChange={e => updateField("invoiceRef", e.target.value)} data-testid="input-invoice-ref" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-none shadow-sm border-t-4 border-t-[var(--theme-primary)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ข้อมูลค่าเสื่อมราคา</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>วันที่ซื้อ *</Label>
                <ThaiDateInput value={form.purchaseDate} onChange={(v: string) => updateField("purchaseDate", v)} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-purchase-date" />
              </div>
              <div>
                <Label>วันที่เริ่มคิดค่าเสื่อม *</Label>
                <ThaiDateInput value={form.startDepreciationDate} onChange={(v: string) => updateField("startDepreciationDate", v)} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-start-dep-date" />
              </div>
              <div>
                <Label>วิธีคิดค่าเสื่อมราคา</Label>
                <Select value={form.depreciationMethod} onValueChange={v => updateField("depreciationMethod", v)}>
                  <SelectTrigger data-testid="select-dep-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight_line">เส้นตรง (Straight Line)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>ราคาทุน *</Label>
                <Input type="number" step="0.01" value={form.cost} onChange={e => updateField("cost", e.target.value)} data-testid="input-cost" />
              </div>
              <div>
                <Label>มูลค่าซาก</Label>
                <Input type="number" step="0.01" value={form.salvageValue} onChange={e => updateField("salvageValue", e.target.value)} data-testid="input-salvage" />
              </div>
              <div>
                <Label>อายุการใช้งาน (เดือน)</Label>
                <Input type="number" value={form.usefulLifeMonths} onChange={e => updateField("usefulLifeMonths", e.target.value)} data-testid="input-useful-life" />
              </div>
              <div>
                <Label>ค่าเสื่อมราคาต่อเดือน</Label>
                <Input value={formatNumber(monthlyDep)} readOnly className="bg-slate-50" data-testid="text-monthly-dep" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>รหัสบัญชีหมวดสินทรัพย์</Label>
                <Input value={form.categoryAccountCode} readOnly className="bg-slate-50" data-testid="input-category-account" />
              </div>
              <div>
                <Label>รหัสบัญชีค่าเสื่อมสะสม</Label>
                <Input value={form.accumDepreciationAccountCode} readOnly className="bg-slate-50" data-testid="input-accum-account" />
              </div>
              <div>
                <Label>รหัสบัญชีค่าเสื่อมราคา</Label>
                <Input value={form.depreciationExpenseAccountCode} onChange={e => updateField("depreciationExpenseAccountCode", e.target.value)} data-testid="input-expense-account" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-none shadow-sm">
          <CardContent className="pt-4">
            <Label>หมายเหตุ</Label>
            <Textarea value={form.notes} onChange={e => updateField("notes", e.target.value)} rows={2} data-testid="input-notes" />
          </CardContent>
        </Card>

        {isEdit && (
          <>
            <Card className="rounded-none shadow-sm border-t-4 border-t-[var(--theme-primary)]">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">ตารางค่าเสื่อมราคา</CardTitle>
                  <div className="flex items-center gap-2">
                    <ThaiDateInput value={calcDate} onChange={setCalcDate} dateEra={dateEra} dateFmt={dateFmt} className="w-44" data-testid="input-calc-date" />
                    <Button
                      size="sm"
                      style={{ background: "var(--theme-primary)" }} className="hover:opacity-90 text-white h-8 text-xs"
                      onClick={() => calculateMutation.mutate()}
                      disabled={!calcDate || calculateMutation.isPending}
                      data-testid="button-calculate-dep"
                    >
                      <Calculator className="h-4 w-4 mr-1" /> คำนวณค่าเสื่อมราคา
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader style={{ background: "var(--theme-table-header)" }}>
                    <TableRow className="hover:bg-transparent border-none h-10">
                      <TableHead className="text-white text-[11px] font-normal text-center">งวด</TableHead>
                      <TableHead className="text-white text-[11px] font-normal text-center">วันที่</TableHead>
                      <TableHead className="text-white text-[11px] font-normal text-right">ค่าเสื่อมราคา</TableHead>
                      <TableHead className="text-white text-[11px] font-normal text-right">ค่าเสื่อมสะสม</TableHead>
                      <TableHead className="text-white text-[11px] font-normal text-right">มูลค่าสุทธิ</TableHead>
                      <TableHead className="text-white text-[11px] font-normal text-center">สถานะ</TableHead>
                      <TableHead className="text-white text-[11px] font-normal text-center w-28"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {depreciations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground" data-testid="text-no-depreciation">
                          ยังไม่มีรายการค่าเสื่อมราคา กดปุ่ม "คำนวณค่าเสื่อมราคา" เพื่อสร้างตาราง
                        </TableCell>
                      </TableRow>
                    ) : (
                      depreciations.map((dep: any, idx: number) => (
                        <TableRow key={dep.id || idx} className="hover:bg-slate-50 border-b h-10" data-testid={`row-dep-${dep.id}`}>
                          <TableCell className="text-[11px] text-center" data-testid={`text-dep-period-${dep.id}`}>{dep.period}</TableCell>
                          <TableCell className="text-[11px] text-center" data-testid={`text-dep-date-${dep.id}`}>{formatDate(dep.periodDate, "BE")}</TableCell>
                          <TableCell className="text-[11px] text-right" data-testid={`text-dep-amount-${dep.id}`}>{formatNumber(dep.depreciationAmount)}</TableCell>
                          <TableCell className="text-[11px] text-right" data-testid={`text-dep-accum-${dep.id}`}>{formatNumber(dep.accumDepreciation)}</TableCell>
                          <TableCell className="text-[11px] text-right" data-testid={`text-dep-nbv-${dep.id}`}>{formatNumber(dep.netBookValue)}</TableCell>
                          <TableCell className="text-center" data-testid={`text-dep-status-${dep.id}`}>
                            {dep.posted ? (
                              <Badge className="bg-lime-500 text-white text-[9px] font-normal px-2 py-0">บันทึกแล้ว</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] font-normal px-2 py-0">รอบันทึก</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {dep.posted ? (
                              dep.journalEntryId ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[10px] px-2 text-blue-600 hover:text-blue-800"
                                  onClick={() => navigate(`/journal`)}
                                  data-testid={`button-view-journal-${dep.id}`}
                                >
                                  <BookOpen className="h-3 w-3 mr-1" /> ดูสมุดรายวัน
                                </Button>
                              ) : null
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] px-2"
                                onClick={() => postDepMutation.mutate(dep.period)}
                                disabled={postDepMutation.isPending}
                                data-testid={`button-post-dep-${dep.id}`}
                              >
                                <BookOpen className="h-3 w-3 mr-1" /> บันทึกบัญชี
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {asset?.status === "active" && (
              <Card className="rounded-none shadow-sm border-t-4 border-t-amber-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    จำหน่ายสินทรัพย์
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>วันที่จำหน่าย</Label>
                      <ThaiDateInput value={disposalDate} onChange={setDisposalDate} dateEra={dateEra} dateFmt={dateFmt} data-testid="input-disposal-date" />
                    </div>
                    <div>
                      <Label>ราคาขาย</Label>
                      <Input type="number" step="0.01" value={disposalPrice} onChange={e => setDisposalPrice(e.target.value)} data-testid="input-disposal-price" />
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="destructive"
                        onClick={() => setShowDisposalDialog(true)}
                        disabled={!disposalDate || !disposalPrice}
                        data-testid="button-dispose"
                      >
                        จำหน่ายสินทรัพย์
                      </Button>
                    </div>
                  </div>
                  {disposalPreview && disposalPrice && (
                    <div className="bg-slate-50 p-3 rounded-sm text-sm space-y-1" data-testid="text-disposal-preview">
                      <div>มูลค่าสุทธิตามบัญชี: <span className="font-semibold">{formatNumber(disposalPreview.nbv)}</span> บาท</div>
                      <div>ราคาขาย: <span className="font-semibold">{formatNumber(disposalPrice)}</span> บาท</div>
                      <div>
                        {disposalPreview.gainLoss >= 0 ? (
                          <span className="text-green-600">กำไรจากการจำหน่าย: {formatNumber(disposalPreview.gainLoss)} บาท</span>
                        ) : (
                          <span className="text-red-600">ขาดทุนจากการจำหน่าย: {formatNumber(Math.abs(disposalPreview.gainLoss))} บาท</span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {asset?.status === "disposed" && (
              <Card className="rounded-none shadow-sm border-t-4 border-t-gray-400">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-gray-500">ข้อมูลการจำหน่าย</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">วันที่จำหน่าย</Label>
                      <div data-testid="text-disposed-date">{formatDate(asset.disposalDate, "BE")}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">ราคาขาย</Label>
                      <div data-testid="text-disposed-price">{formatNumber(asset.disposalPrice)} บาท</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">กำไร/ขาดทุน</Label>
                      <div data-testid="text-disposed-gain-loss">
                        {parseFloat(asset.disposalGainLoss || "0") >= 0 ? (
                          <span className="text-green-600">{formatNumber(asset.disposalGainLoss)} บาท</span>
                        ) : (
                          <span className="text-red-600">{formatNumber(asset.disposalGainLoss)} บาท</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      <AlertDialog open={showDisposalDialog} onOpenChange={setShowDisposalDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการจำหน่ายสินทรัพย์</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการจำหน่ายสินทรัพย์ "{asset?.name}" หรือไม่? การดำเนินการนี้จะสร้างรายการบัญชีอัตโนมัติ
              {disposalPreview && (
                <div className="mt-2">
                  {disposalPreview.gainLoss >= 0
                    ? `กำไรจากการจำหน่าย: ${formatNumber(disposalPreview.gainLoss)} บาท`
                    : `ขาดทุนจากการจำหน่าย: ${formatNumber(Math.abs(disposalPreview.gainLoss))} บาท`}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-dispose">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => disposeMutation.mutate()}
              data-testid="button-confirm-dispose"
            >
              ยืนยันจำหน่าย
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบสินทรัพย์</AlertDialogTitle>
            <AlertDialogDescription>
              คุณต้องการลบสินทรัพย์ "{asset?.name}" หรือไม่? การดำเนินการนี้ไม่สามารถยกเลิกได้
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => deleteMutation.mutate()}
              data-testid="button-confirm-delete"
            >
              ยืนยันลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex items-center justify-end gap-2 pb-4">
        <Button variant="outline" onClick={() => navigate("/assets/registry")} data-testid="button-cancel-bottom">ย้อนกลับ</Button>
        <Button
          style={{ background: "var(--theme-primary)" }} className="hover:opacity-90 text-white"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          data-testid="button-save-bottom"
        >
          <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </div>
    </Layout>
  );
}
