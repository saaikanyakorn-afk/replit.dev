import EcommerceLayout from "@/components/ecommerce-layout";
import { useCompany } from "@/lib/company-context";
import { formatDate } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Plus, Trash2, ShoppingBag, FileText, Printer, CheckCircle2, Loader2, ReceiptText, History,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import ThaiDateInput from "@/components/thai-date-input";

interface LineItem {
  productName: string;
  productCode: string;
  qty: string;
  unit: string;
  unitPrice: string;
  discount: string;
  vatType: string;
}

const emptyItem = (): LineItem => ({
  productName: "", productCode: "", qty: "1", unit: "ชิ้น", unitPrice: "", discount: "0", vatType: "vat7",
});

export default function EcommerceQuickInvoice() {
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [customerName, setCustomerName] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [docDate, setDocDate] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [showRecent, setShowRecent] = useState(false);

  const { data: paymentMethodsList = [] } = useQuery<any[]>({
    queryKey: ["/api/payment-methods", selectedCompanyId, "receive"],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const r = await fetch(`/api/payment-methods?companyId=${selectedCompanyId}&type=receive`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!selectedCompanyId,
  });
  const activePaymentMethods = paymentMethodsList.filter((m: any) => m.active !== false);

  useEffect(() => {
    if (!paymentMethod && activePaymentMethods.length > 0) {
      const defaultPm = activePaymentMethods.find((m: any) => m.isDefault);
      if (defaultPm) setPaymentMethod(defaultPm.accountCode);
    }
  }, [activePaymentMethods]);

  const recentQuery = useQuery({
    queryKey: ["/api/ecommerce/quick-invoice/recent", selectedCompanyId],
    queryFn: () => fetch(`/api/ecommerce/quick-invoice/recent?companyId=${selectedCompanyId}`).then(r => r.json()),
    enabled: !!selectedCompanyId && showRecent,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/ecommerce/quick-invoice?companyId=${selectedCompanyId}`, data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "สำเร็จ", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/ecommerce/quick-invoice/recent"] });
      resetForm();
    },
    onError: (err: any) => {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    },
  });

  function resetForm() {
    setCustomerName("");
    setCustomerTaxId("");
    setCustomerAddress("");
    setCustomerPhone("");
    setPaymentMethod((activePaymentMethods.find((m: any) => m.isDefault) ?? activePaymentMethods[0])?.accountCode ?? "");
    setNotes("");
    setDocDate(new Date().toISOString().split("T")[0]);
    setItems([emptyItem()]);
  }

  function updateItem(idx: number, field: keyof LineItem, value: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function addItem() {
    setItems(prev => [...prev, emptyItem()]);
  }

  function removeItem(idx: number) {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function calcLineTotal(item: LineItem) {
    const qty = parseFloat(item.qty || "0");
    const price = parseFloat(item.unitPrice || "0");
    const discount = parseFloat(item.discount || "0");
    return qty * price - discount;
  }

  const subtotal = items.reduce((sum, item) => sum + calcLineTotal(item), 0);
  const vatItems = items.filter(i => i.vatType === "vat7");
  const vatAmount = vatItems.reduce((sum, item) => {
    const total = calcLineTotal(item);
    return sum + (total - total / 1.07);
  }, 0);

  function handleSubmit() {
    const validItems = items.filter(i => i.productName && parseFloat(i.unitPrice || "0") > 0);
    if (validItems.length === 0) {
      toast({ title: "กรุณาเพิ่มสินค้า", description: "ต้องมีอย่างน้อย 1 รายการที่มีชื่อและราคา", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      customerName, customerTaxId, customerAddress, customerPhone,
      paymentMethod, notes, docDate,
      items: validItems,
    });
  }

  return (
    <EcommerceLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#fb9678]/10 flex items-center justify-center">
              <ReceiptText className="w-5 h-5 text-[#fb9678]" />
            </div>
            <div>
              <h1 data-testid="text-page-title" className="text-xl font-bold text-gray-800">ออกบิลหน้าร้าน</h1>
              <p className="text-sm text-gray-500">สำหรับลูกค้าที่มาซื้อหน้าร้าน — ออกใบกำกับภาษีด่วน</p>
            </div>
          </div>
          <Button
            data-testid="button-toggle-recent"
            variant="outline"
            onClick={() => setShowRecent(!showRecent)}
            className="gap-2"
          >
            <History className="w-4 h-4" />
            {showRecent ? "ซ่อนประวัติ" : "ดูประวัติ"}
          </Button>
        </div>

        <div className={`grid ${showRecent ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1"} gap-4`}>
          <div className={showRecent ? "lg:col-span-2" : ""}>
            <Card>
              <CardHeader className="bg-[#fb9678]/5 border-b px-4 py-3">
                <div className="flex items-center gap-2 text-[#fb9678] font-semibold">
                  <FileText className="w-4 h-4" />
                  ข้อมูลใบกำกับภาษี
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">วันที่เอกสาร</Label>
                    <ThaiDateInput
                      data-testid="input-doc-date"
                      value={docDate}
                      onChange={(v: string) => setDocDate(v)}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">วิธีชำระเงิน</Label>
                    <Select
                      value={(() => {
                        const found = activePaymentMethods.find((m: any) => m.accountCode === paymentMethod);
                        return found ? `pm_${found.id}` : paymentMethod;
                      })()}
                      onValueChange={v => {
                        const m = activePaymentMethods.find((m: any) => `pm_${m.id}` === v);
                        if (!m) return;
                        setPaymentMethod(m.accountCode);
                      }}
                    >
                      <SelectTrigger data-testid="select-payment-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activePaymentMethods.map((m: any) => (
                          <SelectItem key={m.id} value={`pm_${m.id}`}>
                            {m.nameTh || m.name}{m.bankName ? ` · ${m.bankName}` : ""}{m.bankAccountNo ? ` ${m.bankAccountNo}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">ชื่อลูกค้า</Label>
                    <Input
                      data-testid="input-customer-name"
                      placeholder="ลูกค้าทั่วไป (ไม่บังคับ)"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">เลขประจำตัวผู้เสียภาษี</Label>
                    <Input
                      data-testid="input-customer-tax-id"
                      placeholder="เลขภาษี 13 หลัก (ไม่บังคับ)"
                      value={customerTaxId}
                      onChange={e => setCustomerTaxId(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">ที่อยู่</Label>
                    <Input
                      data-testid="input-customer-address"
                      placeholder="ที่อยู่ลูกค้า (ไม่บังคับ)"
                      value={customerAddress}
                      onChange={e => setCustomerAddress(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">เบอร์โทร</Label>
                    <Input
                      data-testid="input-customer-phone"
                      placeholder="เบอร์โทร (ไม่บังคับ)"
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold">รายการสินค้า</Label>
                    <Button data-testid="button-add-item" size="sm" variant="outline" onClick={addItem} className="gap-1 text-[#fb9678] border-[#fb9678]">
                      <Plus className="w-3 h-3" /> เพิ่มรายการ
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>ชื่อสินค้า</TableHead>
                          <TableHead className="w-20">จำนวน</TableHead>
                          <TableHead className="w-20">หน่วย</TableHead>
                          <TableHead className="w-28">ราคา/หน่วย</TableHead>
                          <TableHead className="w-24">ส่วนลด</TableHead>
                          <TableHead className="w-24">VAT</TableHead>
                          <TableHead className="w-28 text-right">รวม</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-gray-400 text-sm">{idx + 1}</TableCell>
                            <TableCell>
                              <Input
                                data-testid={`input-product-name-${idx}`}
                                placeholder="ชื่อสินค้า"
                                value={item.productName}
                                onChange={e => updateItem(idx, "productName", e.target.value)}
                                className="min-w-[150px]"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                data-testid={`input-qty-${idx}`}
                                type="number"
                                min="1"
                                value={item.qty}
                                onChange={e => updateItem(idx, "qty", e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                data-testid={`input-unit-${idx}`}
                                value={item.unit}
                                onChange={e => updateItem(idx, "unit", e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                data-testid={`input-unit-price-${idx}`}
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={item.unitPrice}
                                onChange={e => updateItem(idx, "unitPrice", e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                data-testid={`input-discount-${idx}`}
                                type="number"
                                step="0.01"
                                value={item.discount}
                                onChange={e => updateItem(idx, "discount", e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Select value={item.vatType} onValueChange={v => updateItem(idx, "vatType", v)}>
                                <SelectTrigger data-testid={`select-vat-${idx}`} className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="vat7">7%</SelectItem>
                                  <SelectItem value="vat0">0%</SelectItem>
                                  <SelectItem value="exempt">ยกเว้น</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              <span data-testid={`text-line-total-${idx}`}>
                                {calcLineTotal(item).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                              </span>
                            </TableCell>
                            <TableCell>
                              {items.length > 1 && (
                                <Button
                                  data-testid={`button-remove-item-${idx}`}
                                  size="icon" variant="ghost"
                                  onClick={() => removeItem(idx)}
                                  className="h-8 w-8 text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">หมายเหตุ</Label>
                  <Input
                    data-testid="input-notes"
                    placeholder="หมายเหตุ (ไม่บังคับ)"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>

                <Separator />

                <div className="flex justify-between items-end">
                  <div className="space-y-1 text-sm">
                    <div className="flex gap-8">
                      <span className="text-gray-500">มูลค่าสินค้า:</span>
                      <span data-testid="text-subtotal" className="font-medium">{(subtotal - vatAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</span>
                    </div>
                    <div className="flex gap-8">
                      <span className="text-gray-500">ภาษีมูลค่าเพิ่ม 7%:</span>
                      <span data-testid="text-vat" className="font-medium">{vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</span>
                    </div>
                    <div className="flex gap-8 text-base">
                      <span className="font-semibold">ยอดรวมทั้งสิ้น:</span>
                      <span data-testid="text-total" className="font-bold text-[#fb9678] text-lg">{subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      data-testid="button-reset"
                      variant="outline"
                      onClick={resetForm}
                    >
                      ล้างฟอร์ม
                    </Button>
                    <Button
                      data-testid="button-submit"
                      onClick={handleSubmit}
                      disabled={createMutation.isPending}
                      className="bg-[#fb9678] hover:bg-[#fb9678]/90 text-white gap-2 px-6"
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      ออกใบกำกับภาษี
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {showRecent && (
            <div>
              <Card>
                <CardHeader className="bg-gray-50 border-b px-4 py-3">
                  <div className="flex items-center gap-2 text-gray-700 font-semibold text-sm">
                    <History className="w-4 h-4" />
                    บิลล่าสุด
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {recentQuery.isLoading ? (
                    <div className="p-4 text-center text-sm text-gray-400">กำลังโหลด...</div>
                  ) : !recentQuery.data || recentQuery.data.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-400">ยังไม่มีบิลหน้าร้าน</div>
                  ) : (
                    <div className="divide-y max-h-[600px] overflow-y-auto">
                      {recentQuery.data.map((doc: any) => (
                        <div key={doc.id} className="px-4 py-3 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <span data-testid={`text-recent-doc-no-${doc.id}`} className="font-medium text-sm text-[#fb9678]">{doc.taxInvoiceNo}</span>
                            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                              อนุมัติ
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {doc.customerName || "ลูกค้าทั่วไป"}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-400">{formatDate(doc.taxInvoiceDate)}</span>
                            <span className="text-sm font-semibold">
                              {parseFloat(doc.totalAmount || "0").toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </EcommerceLayout>
  );
}
