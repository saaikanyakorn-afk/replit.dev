import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Printer, Tag, Search, Wand2, ScanBarcode, Plus, Minus, Trash2, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/lib/company-context";
import type { Product } from "@shared/schema";
import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

const LABEL_SIZES = [
  { value: "30x20", label: "30 x 20 มม. (เล็ก)", width: 113, height: 76, fontSize: 7, barcodeHeight: 30 },
  { value: "40x25", label: "40 x 25 มม. (กลาง)", width: 151, height: 94, fontSize: 8, barcodeHeight: 35 },
  { value: "50x30", label: "50 x 30 มม. (มาตรฐาน)", width: 189, height: 113, fontSize: 9, barcodeHeight: 40 },
  { value: "70x40", label: "70 x 40 มม. (ใหญ่)", width: 265, height: 151, fontSize: 11, barcodeHeight: 50 },
];

const COLUMNS_OPTIONS = [
  { value: "2", label: "2 คอลัมน์" },
  { value: "3", label: "3 คอลัมน์" },
  { value: "4", label: "4 คอลัมน์" },
  { value: "5", label: "5 คอลัมน์" },
];

interface SelectedProduct {
  product: Product;
  quantity: number;
}

function BarcodeImage({ value, width, height }: { value: string; width: number; height: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width: 1.5,
          height: height,
          displayValue: true,
          fontSize: 10,
          margin: 2,
          textMargin: 1,
        });
      } catch {
        try {
          JsBarcode(svgRef.current, value, {
            format: "CODE128",
            width: 1.5,
            height: height,
            displayValue: true,
            fontSize: 10,
            margin: 2,
            textMargin: 1,
          });
        } catch {}
      }
    }
  }, [value, width, height]);
  return <svg ref={svgRef} />;
}

function QRCodeImage({ value, size }: { value: string; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current && value) {
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 1,
        errorCorrectionLevel: "M",
      }).catch(() => {});
    }
  }, [value, size]);
  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
}

export default function BarcodeLabels(props: { Wrapper?: React.ComponentType<{ children: React.ReactNode }>; basePath?: string } & Record<string, any>) {
  const LayoutComponent = props.Wrapper || Layout;
  const productsPath = props.basePath ? `${props.basePath}/products` : "/inventory/list";
  const { selectedCompanyId } = useCompany();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const [labelSize, setLabelSize] = useState("50x30");
  const [columns, setColumns] = useState("3");
  const [showPrice, setShowPrice] = useState(true);
  const [showCode, setShowCode] = useState(true);
  const [showName, setShowName] = useState(true);
  const [codeType, setCodeType] = useState<"barcode" | "qrcode">("barcode");
  const printRef = useRef<HTMLDivElement>(null);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/products?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const bulkGenerateMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/products/bulk-generate-barcodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyId: selectedCompanyId }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (data: { updated: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: `สร้างบาร์โค้ดให้ ${data.updated} สินค้าสำเร็จ`, variant: "success" as any });
    },
    onError: (err: any) => toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" }),
  });

  const productsWithBarcode = products.filter(p => p.barcode);
  const productsWithoutBarcode = products.filter(p => !p.barcode);

  const availableProducts = codeType === "barcode" ? productsWithBarcode : products;
  const filteredProducts = availableProducts.filter(p =>
    !search || p.code.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.includes(search))
  );

  const addProduct = (product: Product) => {
    const exists = selectedProducts.find(sp => sp.product.id === product.id);
    if (exists) {
      setSelectedProducts(prev => prev.map(sp =>
        sp.product.id === product.id ? { ...sp, quantity: sp.quantity + 1 } : sp
      ));
    } else {
      setSelectedProducts(prev => [...prev, { product, quantity: 1 }]);
    }
  };

  const removeProduct = (productId: number) => {
    setSelectedProducts(prev => prev.filter(sp => sp.product.id !== productId));
  };

  const updateQuantity = (productId: number, delta: number) => {
    setSelectedProducts(prev => prev.map(sp => {
      if (sp.product.id !== productId) return sp;
      const newQty = Math.max(1, sp.quantity + delta);
      return { ...sp, quantity: newQty };
    }));
  };

  const selectAll = () => {
    const newSelected = filteredProducts.map(p => {
      const existing = selectedProducts.find(sp => sp.product.id === p.id);
      return existing || { product: p, quantity: 1 };
    });
    setSelectedProducts(newSelected);
  };

  const clearAll = () => setSelectedProducts([]);

  const totalLabels = selectedProducts.reduce((s, sp) => s + sp.quantity, 0);
  const currentLabelSize = LABEL_SIZES.find(ls => ls.value === labelSize) || LABEL_SIZES[2];
  const numColumns = parseInt(columns);

  const handlePrint = useCallback(() => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({ title: "กรุณาอนุญาต popup เพื่อปริ้นท์", variant: "destructive" });
      return;
    }

    // Clone the content and replace canvas elements with img (canvas pixel data is lost via innerHTML)
    const clone = printContent.cloneNode(true) as HTMLElement;
    const originalCanvases = printContent.querySelectorAll("canvas");
    const clonedCanvases = clone.querySelectorAll("canvas");
    originalCanvases.forEach((canvas, i) => {
      const img = document.createElement("img");
      img.src = canvas.toDataURL("image/png");
      img.style.width = canvas.style.width || canvas.width + "px";
      img.style.height = canvas.style.height || canvas.height + "px";
      clonedCanvases[i]?.parentNode?.replaceChild(img, clonedCanvases[i]);
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ปริ้นท์ลาเบลบาร์โค้ด</title>
        <style>
          @page { margin: 5mm; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Sarabun', sans-serif; }
          .label-grid {
            display: grid;
            grid-template-columns: repeat(${numColumns}, ${currentLabelSize.width}px);
            gap: 2mm;
          }
          .label-item {
            border: 0.5px dashed #ccc;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 2mm;
            overflow: hidden;
            page-break-inside: avoid;
          }
          .label-name { font-weight: 600; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
          .label-code { color: #666; text-align: center; }
          .label-price { font-weight: 700; text-align: center; }
          .label-barcode svg { max-width: 100%; }
          img { display: block; }
          @media print {
            .label-item { border: 0.5px dashed #ddd; }
          }
        </style>
      </head>
      <body>
        ${clone.innerHTML}
        <script>window.onload = function() { window.print(); window.close(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }, [selectedProducts, labelSize, columns, showPrice, showCode, showName]);

  const labelItems: { product: Product; index: number }[] = [];
  selectedProducts.forEach(sp => {
    for (let i = 0; i < sp.quantity; i++) {
      labelItems.push({ product: sp.product, index: i });
    }
  });

  return (
    <LayoutComponent>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button data-testid="button-back" variant="ghost" size="icon" onClick={() => navigate(productsPath)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Tag className="h-5 w-5 text-primary" />
            <h1 data-testid="text-page-title" className="text-xl font-heading font-bold">ปริ้นท์ลาเบล{codeType === "qrcode" ? "QR Code" : "บาร์โค้ด"}</h1>
          </div>
          <div className="flex items-center gap-2">
            {codeType === "barcode" && productsWithoutBarcode.length > 0 && (
              <Button
                data-testid="button-bulk-generate"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => bulkGenerateMutation.mutate()}
                disabled={bulkGenerateMutation.isPending}
              >
                <Wand2 className="h-4 w-4" />
                สร้างบาร์โค้ดให้ {productsWithoutBarcode.length} สินค้า
              </Button>
            )}
            <Button
              data-testid="button-print"
              size="sm"
              className="gap-1"
              onClick={handlePrint}
              disabled={selectedProducts.length === 0}
            >
              <Printer className="h-4 w-4" />
              ปริ้นท์ ({totalLabels} ดวง)
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-4">
            <Card className="border shadow-sm">
              <CardHeader className="pb-3 pt-4 px-4 border-b">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  {codeType === "qrcode" ? <QrCode className="h-4 w-4 text-[#03c9d7]" /> : <ScanBarcode className="h-4 w-4 text-[#fb9678]" />}
                  เลือกสินค้า
                  <Badge variant="outline" className="ml-auto text-xs">{availableProducts.length} รายการ</Badge>
                </h2>
              </CardHeader>
              <CardContent className="p-3 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    data-testid="input-search"
                    placeholder="ค้นหาสินค้า / บาร์โค้ด..."
                    className="pl-10 h-9 text-sm"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button data-testid="button-select-all" variant="outline" size="sm" className="text-xs h-7 flex-1" onClick={selectAll}>เลือกทั้งหมด</Button>
                  <Button data-testid="button-clear-all" variant="outline" size="sm" className="text-xs h-7 flex-1" onClick={clearAll}>ล้าง</Button>
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-1">
                  {filteredProducts.length === 0 ? (
                    <p className="text-sm text-center text-muted-foreground py-4">
                      {codeType === "barcode" && productsWithBarcode.length === 0 ? "ไม่มีสินค้าที่มีบาร์โค้ด กรุณาสร้างบาร์โค้ดก่อน" : codeType === "qrcode" && products.length === 0 ? "ไม่มีสินค้า" : "ไม่พบสินค้า"}
                    </p>
                  ) : filteredProducts.map(p => {
                    const isSelected = selectedProducts.some(sp => sp.product.id === p.id);
                    return (
                      <div
                        key={p.id}
                        data-testid={`product-item-${p.id}`}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${isSelected ? "bg-orange-50 border border-orange-200" : "hover:bg-slate-50 border border-transparent"}`}
                        onClick={() => isSelected ? removeProduct(p.id) : addProduct(p)}
                      >
                        <Checkbox checked={isSelected} className="pointer-events-none" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground flex gap-2">
                            <span>{p.code}</span>
                            <span className="text-blue-500">{p.barcode}</span>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-green-600 whitespace-nowrap">
                          ฿{parseFloat(p.price || "0").toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border shadow-sm">
              <CardHeader className="pb-3 pt-4 px-4 border-b">
                <h2 className="text-sm font-semibold text-slate-700">ตั้งค่าลาเบล</h2>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div>
                  <Label className="text-xs">ประเภทโค้ด</Label>
                  <div className="flex gap-1 mt-1">
                    <Button data-testid="button-type-barcode" variant={codeType === "barcode" ? "default" : "outline"} size="sm" className="flex-1 gap-1 h-8" style={codeType === "barcode" ? { background: "#fb9678" } : {}} onClick={() => { setCodeType("barcode"); setSelectedProducts([]); }}>
                      <ScanBarcode className="h-3.5 w-3.5" />Barcode
                    </Button>
                    <Button data-testid="button-type-qrcode" variant={codeType === "qrcode" ? "default" : "outline"} size="sm" className="flex-1 gap-1 h-8" style={codeType === "qrcode" ? { background: "#03c9d7" } : {}} onClick={() => { setCodeType("qrcode"); setSelectedProducts([]); }}>
                      <QrCode className="h-3.5 w-3.5" />QR Code
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">ขนาดลาเบล</Label>
                  <Select value={labelSize} onValueChange={setLabelSize}>
                    <SelectTrigger data-testid="select-label-size" className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LABEL_SIZES.map(ls => <SelectItem key={ls.value} value={ls.value}>{ls.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">จำนวนคอลัมน์</Label>
                  <Select value={columns} onValueChange={setColumns}>
                    <SelectTrigger data-testid="select-columns" className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLUMNS_OPTIONS.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">แสดงข้อมูล</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox data-testid="checkbox-show-name" id="show-name" checked={showName} onCheckedChange={(c) => setShowName(!!c)} />
                    <label htmlFor="show-name" className="text-sm">ชื่อสินค้า</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox data-testid="checkbox-show-code" id="show-code" checked={showCode} onCheckedChange={(c) => setShowCode(!!c)} />
                    <label htmlFor="show-code" className="text-sm">รหัสสินค้า</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox data-testid="checkbox-show-price" id="show-price" checked={showPrice} onCheckedChange={(c) => setShowPrice(!!c)} />
                    <label htmlFor="show-price" className="text-sm">ราคา</label>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {selectedProducts.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3 pt-4 px-4 border-b">
                  <h2 className="text-sm font-semibold text-slate-700">
                    สินค้าที่เลือก ({selectedProducts.length} รายการ, {totalLabels} ดวง)
                  </h2>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs">สินค้า</TableHead>
                        <TableHead className="text-xs text-center w-[100px]">{codeType === "qrcode" ? "SKU" : "บาร์โค้ด"}</TableHead>
                        <TableHead className="text-xs text-center w-[150px]">จำนวนดวง</TableHead>
                        <TableHead className="text-xs text-center w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProducts.map(sp => (
                        <TableRow key={sp.product.id}>
                          <TableCell className="text-sm">
                            <div className="font-medium">{sp.product.name}</div>
                            <div className="text-xs text-muted-foreground">{sp.product.code}</div>
                          </TableCell>
                          <TableCell className="text-center text-xs text-blue-600 font-mono">{codeType === "qrcode" ? sp.product.code : sp.product.barcode}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              <Button data-testid={`button-qty-minus-${sp.product.id}`} variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(sp.product.id, -1)}>
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                data-testid={`input-qty-${sp.product.id}`}
                                className="w-14 h-7 text-center text-sm"
                                type="number"
                                min={1}
                                value={sp.quantity}
                                onChange={e => {
                                  const val = parseInt(e.target.value) || 1;
                                  setSelectedProducts(prev => prev.map(s =>
                                    s.product.id === sp.product.id ? { ...s, quantity: Math.max(1, val) } : s
                                  ));
                                }}
                              />
                              <Button data-testid={`button-qty-plus-${sp.product.id}`} variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(sp.product.id, 1)}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button data-testid={`button-remove-${sp.product.id}`} variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeProduct(sp.product.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <Card className="border shadow-sm">
              <CardHeader className="pb-3 pt-4 px-4 border-b flex flex-row items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">ตัวอย่างลาเบล</h2>
                {selectedProducts.length > 0 && (
                  <Button size="sm" className="gap-1 h-8" onClick={handlePrint}>
                    <Printer className="h-3.5 w-3.5" />
                    ปริ้นท์ {totalLabels} ดวง
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-4">
                {selectedProducts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Tag className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">เลือกสินค้าจากรายการด้านซ้ายเพื่อดูตัวอย่างลาเบล</p>
                  </div>
                ) : (
                  <div className="overflow-auto bg-white border rounded-lg p-4">
                    <div
                      ref={printRef}
                      className="label-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${numColumns}, ${currentLabelSize.width}px)`,
                        gap: "6px",
                      }}
                    >
                      {labelItems.map((item, idx) => (
                        <div
                          key={`${item.product.id}-${item.index}`}
                          className="label-item"
                          style={{
                            width: `${currentLabelSize.width}px`,
                            height: `${currentLabelSize.height}px`,
                            border: "0.5px dashed #ccc",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "4px",
                            overflow: "hidden",
                            pageBreakInside: "avoid",
                          }}
                        >
                          {showName && (
                            <div className="label-name" style={{
                              fontSize: `${currentLabelSize.fontSize}px`,
                              fontWeight: 600,
                              textAlign: "center",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "100%",
                              lineHeight: 1.2,
                            }}>
                              {item.product.name}
                            </div>
                          )}
                          {showCode && (
                            <div className="label-code" style={{
                              fontSize: `${Math.max(currentLabelSize.fontSize - 2, 6)}px`,
                              color: "#666",
                              textAlign: "center",
                              lineHeight: 1.2,
                            }}>
                              {item.product.code}
                            </div>
                          )}
                          <div className="label-barcode" style={{ maxWidth: "100%", overflow: "hidden", display: "flex", justifyContent: "center" }}>
                            {codeType === "qrcode" ? (
                              /[ก-๙]/.test(item.product.code || "") ? (
                                <div style={{ fontSize: 8, color: "#cc0000", textAlign: "center", padding: "4px 2px", border: "1px solid #cc0000", borderRadius: 4, margin: 2 }}>
                                  ❌ รหัสสินค้ามีภาษาไทย<br />ไม่สามารถสร้าง QR ได้<br />กรุณาแก้รหัสเป็นภาษาอังกฤษ
                                </div>
                              ) : (
                              <QRCodeImage
                                value={item.product.code || item.product.barcode || ""}
                                size={Math.min(currentLabelSize.width - 20, currentLabelSize.height - 30)}
                              />
                              )
                            ) : (
                              item.product.barcode && (
                                <BarcodeImage
                                  value={item.product.barcode}
                                  width={currentLabelSize.width - 16}
                                  height={currentLabelSize.barcodeHeight}
                                />
                              )
                            )}
                          </div>
                          {showPrice && (
                            <div className="label-price" style={{
                              fontSize: `${currentLabelSize.fontSize}px`,
                              fontWeight: 700,
                              textAlign: "center",
                              lineHeight: 1.2,
                            }}>
                              ฿{parseFloat(item.product.price || "0").toLocaleString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </LayoutComponent>
  );
}
