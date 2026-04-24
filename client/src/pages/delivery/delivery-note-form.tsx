import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useLocation, useParams } from "wouter";
import Layout from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Plus, Trash2, MapPin, Truck, Search, Package, FileText, Eye, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDateSettings } from "@/hooks/use-date-settings";
import { formatDate, formatDateTime } from "@/lib/format";
import ThaiDateInput from "@/components/thai-date-input";

interface LineItem {
  productId?: number | null;
  productCode: string;
  productName: string;
  description: string;
  qty: string;
  unit: string;
  notes: string;
  warehouseId?: number;
}

const emptyLine = (): LineItem => ({ productId: null, productCode: "", productName: "", description: "", qty: "1", unit: "ชิ้น", notes: "", warehouseId: undefined });

function fmtToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DeliveryNoteFormPage(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }>; basePath?: string } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const dnBasePath = props.basePath ? `${props.basePath}/delivery-notes` : "/delivery-notes";
  const { selectedCompanyId } = useCompany();
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const isEdit = params.id && params.id !== "new";
  const { dateEra, dateFmt } = useDateSettings();

  const [sourceType, setSourceType] = useState("standalone");
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(fmtToday());
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);

  const [contactSearch, setContactSearch] = useState("");
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [existingDoc, setExistingDoc] = useState<any>(null);

  const { data: contactList } = useQuery({
    queryKey: ["/api/contacts", selectedCompanyId, contactSearch],
    queryFn: async () => {
      const r = await fetch(`/api/contacts?companyId=${selectedCompanyId}&search=${contactSearch}&limit=20`, { credentials: "include" });
      if (!r.ok) return [];
      const d = await r.json();
      return d.data || d;
    },
    enabled: !!selectedCompanyId && showContactPicker,
  });

  const { data: sourceList } = useQuery({
    queryKey: ["/api/source-docs", selectedCompanyId, sourceType, sourceSearch],
    queryFn: async () => {
      const endpoint = sourceType === "quotation" ? "/api/quotations" : "/api/invoices";
      const r = await fetch(`${endpoint}?companyId=${selectedCompanyId}&search=${sourceSearch}&limit=20`, { credentials: "include" });
      if (!r.ok) return [];
      const d = await r.json();
      return d.data || d;
    },
    enabled: !!selectedCompanyId && showSourcePicker && sourceType !== "standalone",
  });

  const { data: warehouses = [] } = useQuery<any[]>({
    queryKey: ["/api/warehouses", selectedCompanyId],
    queryFn: async () => {
      if (!selectedCompanyId) return [];
      const res = await fetch(`/api/warehouses?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const r = await fetch(`/api/delivery-notes/${params.id}`, { credentials: "include" });
      if (!r.ok) return;
      const doc = await r.json();
      setExistingDoc(doc);
      setSourceType(doc.sourceType || "standalone");
      setSourceId(doc.sourceId);
      setCustomerId(doc.customerId);
      setCustomerName(doc.customerName || "");
      setCustomerPhone(doc.customerPhone || "");
      setCustomerEmail(doc.customerEmail || "");
      setDeliveryAddress(doc.deliveryAddress || "");
      setLatitude(doc.latitude || "");
      setLongitude(doc.longitude || "");
      setDeliveryDate(doc.deliveryDate || fmtToday());
      setDriverName(doc.driverName || "");
      setDriverPhone(doc.driverPhone || "");
      setNotes(doc.notes || "");
      setInternalNotes(doc.internalNotes || "");
      if (doc.items?.length) {
        setItems(doc.items.map((i: any) => ({
          productId: i.productId,
          productCode: i.productCode || "",
          productName: i.productName || "",
          description: i.description || "",
          qty: String(i.qty),
          unit: i.unit || "ชิ้น",
          notes: i.notes || "",
          warehouseId: i.warehouseId || undefined,
        })));
      }
      if (doc.signatureDataUrl) setSignaturePreview(doc.signatureDataUrl);
    })();
  }, [isEdit, params.id]);

  const loadFromSource = async (type: string, sid: number) => {
    try {
      const r = await fetch(`/api/delivery-notes/source/${type}/${sid}`, { credentials: "include" });
      if (!r.ok) return;
      const d = await r.json();
      setCustomerId(d.customerId);
      setCustomerName(d.customerName || "");
      setCustomerPhone(d.customerPhone || "");
      setCustomerEmail(d.customerEmail || "");
      setDeliveryAddress(d.deliveryAddress || "");
      if (d.items?.length) {
        setItems(d.items.map((i: any) => ({
          productId: i.productId,
          productCode: i.productCode || "",
          productName: i.productName || "",
          description: i.description || "",
          qty: String(i.qty),
          unit: i.unit || "ชิ้น",
          notes: "",
        })));
      }
      toast({ title: "ดึงข้อมูลจากเอกสารต้นทางแล้ว" });
    } catch {}
  };

  const selectContact = (c: any) => {
    setCustomerId(c.id);
    setCustomerName(c.name || "");
    setCustomerPhone(c.phone || "");
    setCustomerEmail(c.email || "");
    setDeliveryAddress(c.address || "");
    setShowContactPicker(false);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const url = isEdit ? `/api/delivery-notes/${params.id}` : "/api/delivery-notes";
      const method = isEdit ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    onSuccess: (doc) => {
      toast({ title: isEdit ? "บันทึกสำเร็จ" : `สร้างใบส่งของ ${doc.deliveryNo} สำเร็จ` });
      navigate(dnBasePath);
    },
    onError: (e: any) => toast({ title: "เกิดข้อผิดพลาด", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!customerName.trim()) return toast({ title: "กรุณาระบุชื่อลูกค้า", variant: "destructive" });
    if (!deliveryAddress.trim()) return toast({ title: "กรุณาระบุที่อยู่จัดส่ง", variant: "destructive" });
    const validItems = items.filter(i => i.productName.trim());
    if (!validItems.length) return toast({ title: "กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ", variant: "destructive" });

    saveMutation.mutate({
      companyId: selectedCompanyId,
      deliveryDate,
      sourceType,
      sourceId,
      customerId,
      customerName: customerName.trim(),
      customerPhone,
      customerEmail,
      deliveryAddress: deliveryAddress.trim(),
      latitude: latitude || null,
      longitude: longitude || null,
      driverName,
      driverPhone,
      notes,
      internalNotes,
      items: validItems.map(i => ({
        productId: i.productId || null,
        productCode: i.productCode,
        productName: i.productName,
        description: i.description,
        qty: i.qty || "1",
        unit: i.unit || "ชิ้น",
        notes: i.notes,
        warehouseId: i.warehouseId || null,
      })),
    });
  };

  const updateItem = (idx: number, field: keyof LineItem, value: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const openGoogleMaps = () => {
    if (latitude && longitude) {
      window.open(`https://www.google.com/maps?q=${latitude},${longitude}`, "_blank");
    } else if (deliveryAddress) {
      window.open(`https://www.google.com/maps/search/${encodeURIComponent(deliveryAddress)}`, "_blank");
    }
  };

  const isDelivered = existingDoc?.status === "delivered";

  return (
    <LayoutComponent>
    <div className="p-4 w-full overflow-x-hidden max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(dnBasePath)} data-testid="btn-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Truck className="h-5 w-5" style={{ color: "#fb9678" }} />
        <h1 className="text-lg font-bold">{isEdit ? `แก้ไขใบส่งของ ${existingDoc?.deliveryNo || ""}` : "สร้างใบส่งของใหม่"}</h1>
        {existingDoc?.status && (
          <Badge className={existingDoc.status === "delivered" ? "bg-green-100 text-green-700" : existingDoc.status === "dispatched" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}>
            {existingDoc.status === "delivered" ? "ส่งสำเร็จ" : existingDoc.status === "dispatched" ? "กำลังจัดส่ง" : "ร่าง"}
          </Badge>
        )}
      </div>

      {isDelivered && signaturePreview && (
        <Card className="p-4 mb-4 border-green-200 bg-green-50">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <span className="font-semibold text-green-700">ลูกค้าเซ็นรับของแล้ว</span>
            {existingDoc.signedByName && <span className="text-sm text-green-600">โดย: {existingDoc.signedByName}</span>}
            {existingDoc.signedAt && <span className="text-xs text-green-500 ml-auto">{formatDateTime(existingDoc.signedAt, dateEra, dateFmt)}</span>}
          </div>
          <img src={signaturePreview} alt="ลายเซ็น" className="max-h-24 border rounded bg-white p-1" />
          {existingDoc.deliveryRemarks && <p className="text-sm mt-2 text-gray-600">หมายเหตุ: {existingDoc.deliveryRemarks}</p>}
        </Card>
      )}

      <Card className="p-4 mb-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4" /> อ้างอิงเอกสาร</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">ประเภท</label>
            <Select value={sourceType} onValueChange={(v) => { setSourceType(v); setSourceId(null); }} disabled={isDelivered}>
              <SelectTrigger data-testid="select-source-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standalone">สร้างเอง (ไม่อ้างอิง)</SelectItem>
                <SelectItem value="quotation">ใบเสนอราคา (QO)</SelectItem>
                <SelectItem value="invoice">ใบแจ้งหนี้ (IV)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {sourceType !== "standalone" && (
            <div className="col-span-2">
              <label className="text-sm font-medium mb-1 block">เลือกเอกสาร</label>
              <Button variant="outline" onClick={() => setShowSourcePicker(true)} className="w-full justify-start" disabled={isDelivered} data-testid="btn-pick-source">
                <Search className="h-4 w-4 mr-2" />
                {sourceId ? `${sourceType === "quotation" ? "QO" : "IV"} #${sourceId}` : "เลือกเอกสารต้นทาง..."}
              </Button>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block">วันที่ส่งของ</label>
            <ThaiDateInput value={deliveryDate} onChange={setDeliveryDate} dateEra={dateEra} dateFmt={dateFmt} disabled={isDelivered} data-testid="input-delivery-date" />
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2"><MapPin className="h-4 w-4" /> ข้อมูลลูกค้า & ที่อยู่จัดส่ง</h2>
          {sourceType === "standalone" && !isDelivered && (
            <Button variant="outline" size="sm" onClick={() => setShowContactPicker(true)}
              style={{ borderColor: "#03c9d7", color: "#03c9d7" }} data-testid="btn-pick-contact">
              <Search className="h-4 w-4 mr-1" /> เลือกจากรายชื่อ
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">ชื่อลูกค้า *</label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
              disabled={isDelivered || sourceType !== "standalone"}
              placeholder="ชื่อบริษัท/บุคคล" data-testid="input-customer-name" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">เบอร์โทร</label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} disabled={isDelivered} placeholder="0xx-xxx-xxxx" />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium mb-1 block">ที่อยู่จัดส่ง *</label>
            <Textarea value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} disabled={isDelivered}
              placeholder="ที่อยู่สำหรับจัดส่งสินค้า" rows={2} data-testid="input-delivery-address" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">ละติจูด</label>
            <Input value={latitude} onChange={(e) => setLatitude(e.target.value)} disabled={isDelivered} placeholder="13.7563" data-testid="input-lat" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">ลองจิจูด</label>
            <div className="flex gap-2">
              <Input value={longitude} onChange={(e) => setLongitude(e.target.value)} disabled={isDelivered} placeholder="100.5018" data-testid="input-lng" />
              <Button variant="outline" size="icon" onClick={openGoogleMaps} title="เปิด Google Maps" data-testid="btn-open-maps">
                <MapPin className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Truck className="h-4 w-4" /> ข้อมูลคนส่งของ</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">ชื่อคนส่ง</label>
            <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} disabled={isDelivered} placeholder="ชื่อ-สกุล" data-testid="input-driver-name" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">เบอร์โทรคนส่ง</label>
            <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} disabled={isDelivered} placeholder="0xx-xxx-xxxx" />
          </div>
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2"><Package className="h-4 w-4" /> รายการสินค้า</h2>
          {!isDelivered && (
            <Button variant="outline" size="sm" onClick={() => setItems(prev => [...prev, emptyLine()])}
              style={{ borderColor: "#fb9678", color: "#fb9678" }} data-testid="btn-add-item">
              <Plus className="h-4 w-4 mr-1" /> เพิ่มรายการ
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-2 items-start p-2 bg-gray-50 rounded-lg" data-testid={`item-row-${idx}`}>
              <div className="flex-1 grid grid-cols-12 gap-2">
                <div className="col-span-2">
                  <Input placeholder="รหัส" value={item.productCode} onChange={(e) => updateItem(idx, "productCode", e.target.value)} disabled={isDelivered} className="text-sm" />
                </div>
                <div className={warehouses.length > 1 ? "col-span-3" : "col-span-4"}>
                  <Input placeholder="ชื่อสินค้า *" value={item.productName} onChange={(e) => updateItem(idx, "productName", e.target.value)} disabled={isDelivered} className="text-sm" />
                </div>
                <div className="col-span-2">
                  <Input placeholder="จำนวน" type="number" value={item.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)} disabled={isDelivered} className="text-sm" />
                </div>
                <div className="col-span-2">
                  <Input placeholder="หน่วย" value={item.unit} onChange={(e) => updateItem(idx, "unit", e.target.value)} disabled={isDelivered} className="text-sm" />
                </div>
                {warehouses.length > 1 && (
                  <div className="col-span-2">
                    <select
                      data-testid={`select-warehouse-${idx}`}
                      className="h-9 text-xs border border-gray-300 rounded w-full px-1 bg-white"
                      value={item.warehouseId || ""}
                      disabled={isDelivered}
                      onChange={e => { const newItems = [...items]; newItems[idx] = { ...newItems[idx], warehouseId: e.target.value ? Number(e.target.value) : undefined }; setItems(newItems); }}
                    >
                      <option value="">-- คลัง --</option>
                      {warehouses.map((w: any) => (
                        <option key={w.id} value={w.id}>{w.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={warehouses.length > 1 ? "col-span-1" : "col-span-2"}>
                  <Input placeholder="หมายเหตุ" value={item.notes} onChange={(e) => updateItem(idx, "notes", e.target.value)} disabled={isDelivered} className="text-sm" />
                </div>
              </div>
              {!isDelivered && items.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 mt-0.5">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <h2 className="font-semibold mb-3">หมายเหตุ</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium mb-1 block">หมายเหตุ (แสดงให้ลูกค้าเห็น)</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isDelivered} rows={2} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">หมายเหตุภายใน</label>
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} disabled={isDelivered} rows={2} />
          </div>
        </div>
      </Card>

      {!isDelivered && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate(dnBasePath)}>ยกเลิก</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} style={{ background: "#fb9678" }} data-testid="btn-save">
            <Save className="h-4 w-4 mr-1" /> {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
          </Button>
        </div>
      )}

      <Dialog open={showContactPicker} onOpenChange={setShowContactPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>เลือกลูกค้า</DialogTitle></DialogHeader>
          <Input placeholder="ค้นหาชื่อ/รหัส..." value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} data-testid="input-contact-search" />
          <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
            {(contactList || []).map((c: any) => (
              <div key={c.id} className="p-2 hover:bg-gray-50 rounded cursor-pointer border text-sm" onClick={() => selectContact(c)} data-testid={`contact-${c.id}`}>
                <div className="font-medium">{c.name}</div>
                {c.phone && <div className="text-xs text-gray-500">{c.phone}</div>}
                {c.address && <div className="text-xs text-gray-400 truncate">{c.address}</div>}
              </div>
            ))}
            {contactList?.length === 0 && <p className="text-center text-gray-400 text-sm py-4">ไม่พบรายชื่อ</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSourcePicker} onOpenChange={setShowSourcePicker}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>เลือก{sourceType === "quotation" ? "ใบเสนอราคา" : "ใบแจ้งหนี้"}</DialogTitle></DialogHeader>
          <Input placeholder="ค้นหาเลขที่/ลูกค้า..." value={sourceSearch} onChange={(e) => setSourceSearch(e.target.value)} />
          <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
            {(sourceList || []).map((d: any) => (
              <div key={d.id} className="p-2 hover:bg-gray-50 rounded cursor-pointer border text-sm" onClick={() => {
                setSourceId(d.id);
                loadFromSource(sourceType, d.id);
                setShowSourcePicker(false);
              }}>
                <div className="font-medium" style={{ color: "#fb9678" }}>{d.quotationNo || d.invoiceNo}</div>
                <div className="text-xs text-gray-500">{d.customerName}</div>
              </div>
            ))}
            {sourceList?.length === 0 && <p className="text-center text-gray-400 text-sm py-4">ไม่พบเอกสาร</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </LayoutComponent>
  );
}
