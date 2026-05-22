import Layout from "@/components/layout";
import SettingsTabs from "@/components/settings-tabs";
import { AccountCombobox } from "@/components/account-combobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Banknote, Plus, Pencil, Trash2, Save, X, Star, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import { useLanguage } from "@/hooks/use-language";

interface PaymentMethodRow {
  id?: number;
  name: string;
  nameTh: string;
  accountCode: string;
  accountId: number | null;
  active: boolean;
  isDefault: boolean;
  sortOrder: number;
  bankName?: string;
  bankAccountNo?: string;
  paymentType: "receive" | "pay";
  isEditing?: boolean;
  isNew?: boolean;
}

const PAYMENT_TYPE_OPTIONS = [
  { value: "receive", label: "รับเงิน" },
  { value: "pay", label: "จ่ายเงิน" },
];

export default function PaymentMethodSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { acctName } = useLanguage();
  const { selectedCompanyId } = useCompany();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PaymentMethodRow | null>(null);
  const [addForm, setAddForm] = useState<PaymentMethodRow | null>(null);
  const [activeTab, setActiveTab] = useState<"receive" | "pay">("receive");

  const { data: methods = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/payment-methods", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/payment-methods?companyId=${selectedCompanyId}`, { credentials: "include", cache: "no-cache" });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (!isLoading && methods.length === 0 && selectedCompanyId) {
      fetch(`/api/payment-methods/seed-defaults?companyId=${selectedCompanyId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selectedCompanyId }),
      }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/payment-methods", selectedCompanyId] }));
    }
  }, [isLoading, methods.length, selectedCompanyId]);

  const { data: accountsList = [] } = useQuery<any[]>({
    queryKey: ["/api/accounts", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/accounts?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const receiveAccounts = accountsList.filter((a: any) =>
    a.code?.startsWith("1") && a.active !== false && (a.type === "asset" || a.type === "assets")
  );
  const payAccounts = accountsList.filter((a: any) =>
    (a.code?.startsWith("1") || a.code?.startsWith("2")) && a.active !== false
  );
  const cashBankAccounts = activeTab === "pay" ? payAccounts : receiveAccounts;
  const getAccountsForType = (type: "receive" | "pay") => type === "pay" ? payAccounts : receiveAccounts;

  const filteredMethods = methods.filter((m: any) => (m.paymentType || "receive") === activeTab);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = data.id ? `/api/payment-methods/${data.id}` : "/api/payment-methods";
      const method = data.id ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...data, companyId: selectedCompanyId }),
      });
      if (!r.ok) {
        const ct = r.headers.get("content-type") || "";
        if (ct.includes("application/json")) throw new Error((await r.json()).message);
        throw new Error(`เซิร์ฟเวอร์ตอบสนองผิดพลาด (${r.status}) — กรุณาลองใหม่`);
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      setEditingId(null);
      setEditForm(null);
      setAddForm(null);
      toast({ title: "บันทึกสำเร็จ", variant: "success" as any });
    },
    onError: (e: Error) => {
      toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/payment-methods/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods"] });
      toast({ title: "ลบสำเร็จ", variant: "success" as any });
    },
  });

  const startEdit = (m: any) => {
    const form = {
      id: m.id,
      name: m.name,
      nameTh: m.nameTh || "",
      accountCode: m.accountCode,
      accountId: m.accountId,
      active: m.active,
      isDefault: m.isDefault || false,
      sortOrder: m.sortOrder || 0,
      bankName: m.bankName || "",
      bankAccountNo: m.bankAccountNo || "",
      paymentType: (m.paymentType || "receive") as "receive" | "pay",
    };
    setEditingId(m.id);
    setEditForm(form);
    setAddForm(null);
  };

  const startAdd = () => {
    setAddForm({
      name: "",
      nameTh: "",
      accountCode: "",
      accountId: null,
      active: true,
      isDefault: false,
      sortOrder: (methods.length + 1) * 10,
      bankName: "",
      bankAccountNo: "",
      paymentType: activeTab,
    });
    setEditingId(null);
    setEditForm(null);
  };

  const handleAccountSelect = (code: string, isAdd: boolean) => {
    const acc = cashBankAccounts.find((a: any) => a.code === code);
    if (isAdd && addForm) {
      setAddForm(prev => prev ? { ...prev, accountCode: code, accountId: acc?.id || null } : prev);
    } else if (editForm) {
      setEditForm(prev => prev ? { ...prev, accountCode: code, accountId: acc?.id || null } : prev);
    }
  };

  const tabLabel = activeTab === "receive" ? "รับเงิน" : "จ่ายเงิน";

  return (
    <Layout>
      <SettingsTabs />
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-[#fb9678]/15 flex items-center justify-center">
            <Banknote className="h-5 w-5 text-[#fb9678]" />
          </div>
          <div>
            <h1 className="text-xl font-medium text-slate-800">ตั้งค่าวิธีการชำระเงิน</h1>
            <p className="text-sm text-slate-500">กำหนดวิธีรับเงินและจ่ายเงิน พร้อมผูกบัญชีสำหรับลงรายการอัตโนมัติ</p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {PAYMENT_TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              data-testid={`tab-${opt.value}`}
              onClick={() => { setActiveTab(opt.value as "receive" | "pay"); setAddForm(null); setEditingId(null); setEditForm(null); }}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === opt.value
                  ? "bg-[#fb9678] text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <Card className="flexy-card">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-medium">รายการวิธี{tabLabel}</CardTitle>
            <Button data-testid="button-add-payment-method" size="sm" onClick={startAdd} className="bg-[#fb9678] hover:bg-[#fb9678]/90 text-white rounded-lg">
              <Plus className="h-4 w-4 mr-1" /> เพิ่มวิธี{tabLabel}
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="px-3 py-2 text-left font-medium text-slate-600 w-8">#</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">ชื่อ (EN)</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">ชื่อ (TH)</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">บัญชี</th>
                      <th className="px-3 py-2 text-left font-medium text-slate-600">ธนาคาร / เลขที่บัญชี</th>
                      <th className="px-3 py-2 text-center font-medium text-slate-600 w-20">เริ่มต้น</th>
                      <th className="px-3 py-2 text-center font-medium text-slate-600 w-20">เปิดใช้</th>
                      <th className="px-3 py-2 text-center font-medium text-slate-600 w-24">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addForm && (
                      <tr className="border-b bg-green-50/50">
                        <td className="px-3 py-2 text-slate-400">ใหม่</td>
                        <td className="px-3 py-2">
                          <Input data-testid="input-new-name" value={addForm.name} onChange={e => setAddForm(prev => prev ? { ...prev, name: e.target.value } : prev)} placeholder="Cash" className="h-8 text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <Input data-testid="input-new-name-th" value={addForm.nameTh} onChange={e => setAddForm(prev => prev ? { ...prev, nameTh: e.target.value } : prev)} placeholder="เงินสด" className="h-8 text-sm" />
                        </td>
                        <td className="px-3 py-2">
                          <AccountCombobox
                            accounts={cashBankAccounts}
                            value={addForm.accountCode}
                            onSelect={(acc) => handleAccountSelect(acc.code, true)}
                            testId="select-new-account"
                            size="sm"
                            placeholder="เลือกบัญชี"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            <Input data-testid="input-new-bank-name" value={addForm.bankName || ""} onChange={e => setAddForm(prev => prev ? { ...prev, bankName: e.target.value } : prev)} placeholder="ชื่อธนาคาร" className="h-8 text-sm" />
                            <Input data-testid="input-new-bank-account-no" value={addForm.bankAccountNo || ""} onChange={e => setAddForm(prev => prev ? { ...prev, bankAccountNo: e.target.value } : prev)} placeholder="เลขที่บัญชี" className="h-8 text-sm" />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Switch checked={addForm.isDefault} onCheckedChange={v => setAddForm(prev => prev ? { ...prev, isDefault: v } : prev)} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Switch checked={addForm.active} onCheckedChange={v => setAddForm(prev => prev ? { ...prev, active: v } : prev)} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button data-testid="button-save-new" size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:text-green-700" onClick={() => saveMutation.mutate({ ...addForm, paymentType: activeTab })} disabled={saveMutation.isPending}>
                              <Save className="h-4 w-4" />
                            </Button>
                            <Button data-testid="button-cancel-new" size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={() => setAddForm(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {filteredMethods.map((m: any, idx: number) => (
                      <tr key={m.id} className={`border-b hover:bg-slate-50/50 ${editingId === m.id ? "bg-blue-50/50" : ""}`}>
                        {editingId === m.id && editForm ? (
                          <>
                            <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <Input data-testid={`input-edit-name-${m.id}`} value={editForm.name} onChange={e => setEditForm(prev => prev ? { ...prev, name: e.target.value } : prev)} className="h-8 text-sm" />
                            </td>
                            <td className="px-3 py-2">
                              <Input data-testid={`input-edit-name-th-${m.id}`} value={editForm.nameTh} onChange={e => setEditForm(prev => prev ? { ...prev, nameTh: e.target.value } : prev)} className="h-8 text-sm" />
                            </td>
                            <td className="px-3 py-2">
                              <AccountCombobox
                                accounts={cashBankAccounts}
                                value={editForm.accountCode}
                                onSelect={(acc) => handleAccountSelect(acc.code, false)}
                                testId={`select-edit-account-${m.id}`}
                                size="sm"
                                placeholder="เลือกบัญชี"
                              />
                            </td>
                            <td className="px-3 py-2 min-w-[160px]">
                              <div className="flex flex-col gap-1">
                                <Input data-testid={`input-edit-bank-name-${m.id}`} value={editForm.bankName || ""} onChange={e => setEditForm(prev => prev ? { ...prev, bankName: e.target.value } : prev)} placeholder="ชื่อธนาคาร" className="h-8 text-sm w-full" />
                                <Input data-testid={`input-edit-bank-account-no-${m.id}`} value={editForm.bankAccountNo || ""} onChange={e => setEditForm(prev => prev ? { ...prev, bankAccountNo: e.target.value } : prev)} placeholder="เลขที่บัญชี" className="h-8 text-sm w-full" />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Switch checked={editForm.isDefault} onCheckedChange={v => setEditForm(prev => prev ? { ...prev, isDefault: v } : prev)} />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Switch checked={editForm.active} onCheckedChange={v => setEditForm(prev => prev ? { ...prev, active: v } : prev)} />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button data-testid={`button-save-${m.id}`} size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:text-green-700" onClick={() => { saveMutation.mutate(editForm); }} disabled={saveMutation.isPending}>
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button data-testid={`button-cancel-${m.id}`} size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={() => { setEditingId(null); setEditForm(null); }}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-2 font-medium text-slate-700">{m.name}</td>
                            <td className="px-3 py-2 text-slate-600">{m.nameTh || "-"}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-mono">
                                {m.accountCode}
                                {(() => {
                                  const acc = cashBankAccounts.find((a: any) => a.code === m.accountCode);
                                  return acc ? ` - ${acctName(acc)}` : "";
                                })()}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-600 text-xs">
                              {m.bankName || m.bankAccountNo ? (
                                <div className="flex flex-col gap-0.5">
                                  {m.bankName && <span data-testid={`text-bank-name-${m.id}`} className="text-slate-700">{m.bankName}</span>}
                                  {m.bankAccountNo && <span data-testid={`text-bank-account-no-${m.id}`} className="font-mono text-slate-500">{m.bankAccountNo}</span>}
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {m.isDefault && <Star className="h-4 w-4 text-yellow-500 mx-auto fill-yellow-500" />}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-block w-2 h-2 rounded-full ${m.active ? "bg-green-500" : "bg-slate-300"}`} />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button data-testid={`button-edit-${m.id}`} size="icon" variant="ghost" className="h-7 w-7 text-slate-500 hover:text-blue-600" onClick={() => startEdit(m)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button data-testid={`button-delete-${m.id}`} size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={() => {
                                  if (confirm(`ต้องการลบวิธี${tabLabel}นี้?`)) deleteMutation.mutate(m.id);
                                }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {filteredMethods.length === 0 && !addForm && (
                      <tr><td colSpan={8} className="text-center py-8 text-slate-400">ยังไม่มีวิธี{tabLabel}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-xs text-amber-700">
                <strong>หมายเหตุ:</strong> วิธี<strong>รับเงิน</strong>จะแสดงในฟอร์มใบเสร็จ, ใบกำกับภาษี, ใบสั่งขาย เมื่อเลือก ระบบจะลงบัญชีเดบิตตามบัญชีที่ผูกไว้อัตโนมัติ · วิธี<strong>จ่ายเงิน</strong>จะแสดงในฟอร์มใบแจ้งหนี้ซื้อ, ค่าใช้จ่าย เมื่อเลือก ระบบจะลงบัญชีเครดิตตามบัญชีที่ผูกไว้อัตโนมัติ
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
