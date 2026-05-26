import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { objectPathToUrl } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, QrCode, X, Receipt, LogOut, ArrowLeft, Percent, User, Pause, Play, Bluetooth, BluetoothConnected, Star, Gift, Download, Copy, Package, Check, Eye, ScanBarcode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  isWebBluetoothSupported,
  connectBluetoothPrinter,
  isConnected as isBtConnected,
  getConnectedPrinterName,
  printReceipt,
  renderReceiptPreview,
  getSavedPrinterConfig,
  type ReceiptData,
} from "@/lib/thermal-printer";

const THAI_TO_ENG: Record<string, string> = {
  "ๆ":"q","ไ":"w","ำ":"e","พ":"r","ะ":"t","ั":"y","ี":"u","ร":"i","น":"o","ย":"p","บ":"[","ล":"]",
  "ฟ":"a","ห":"s","ก":"d","ด":"f","เ":"g","้":"h","่":"j","า":"k","ส":"l","ว":";","ง":"'",
  "ผ":"z","ป":"x","แ":"c","อ":"v","ิ":"b","ื":"n","ท":"m","ม":",","ใ":".",
  "ๅ":"1","ภ":"4","ถ":"5","ุ":"6","ึ":"7","ค":"8","ต":"9","จ":"0","ข":"-","ช":"=",
  "๑":"1","๒":"2","๓":"3","๔":"4","๕":"5","๖":"6","๗":"7","๘":"8","๙":"9","๐":"0",
  "ฎ":"D","ฑ":"F","ธ":"G","ํ":"H","๊":"J","ณ":"K","ฯ":"L",
  "ฐ":"Z","ฉ":"X","ฮ":"V","ฺ":"B","์":"N","ฅ":"O",
  "ฤ":"R","ฆ":"T","ฏ":"U","ฬ":"P",
  "ฝ":"/","ฦ":"W","ศ":"S","ซ":"A","ฃ":"\\",
};

function thaiToEng(text: string): string {
  const hasThaiChar = /[\u0E00-\u0E7F]/.test(text);
  if (!hasThaiChar) return text;
  let result = "";
  for (const ch of text) {
    result += THAI_TO_ENG[ch] || ch;
  }
  return result;
}

interface BundleSelection {
  slotGroup: string;
  componentProductId: number;
  productName: string;
  qty: string;
}

interface CartItem {
  productId: number;
  cartKey: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatType: string;
  unit: string;
  lineTotal: number;
  bundleSelections?: BundleSelection[];
}

interface HeldOrder {
  id: number;
  cart: CartItem[];
  customerName: string;
  customerId: number | null;
  cartDiscount: string;
  heldAt: string;
}

export default function PosTerminal() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [showCloseSession, setShowCloseSession] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState("เงินสด");
  const [cashReceived, setCashReceived] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [branchName, setBranchName] = useState("สำนักงานใหญ่");
  const [terminalName, setTerminalName] = useState("เครื่อง 1");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("hq");
  const searchRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const [cartDiscount, setCartDiscount] = useState("0");
  const [selectedCategory, setSelectedCategory] = useState("ทั้งหมด");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemDiscount, setEditingItemDiscount] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [selectedCustomerName, setSelectedCustomerName] = useState("ลูกค้าทั่วไป");
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [showHeldOrders, setShowHeldOrders] = useState(false);
  const [barcodeFlash, setBarcodeFlash] = useState(false);
  const [priceLevel, setPriceLevel] = useState<string>("price");
  const [btConnected, setBtConnected] = useState(false);
  const [btPrinterName, setBtPrinterName] = useState<string | null>(null);
  const [btPrinting, setBtPrinting] = useState(false);
  const [btPreviewImage, setBtPreviewImage] = useState<string | null>(null);
  const [showBtPreview, setShowBtPreview] = useState(false);
  const [mobileView, setMobileView] = useState<"products" | "cart">("products");
  const [loyaltyMemberSearch, setLoyaltyMemberSearch] = useState("");
  const [selectedLoyaltyMember, setSelectedLoyaltyMember] = useState<any>(null);
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState(0);
  const [selectedReward, setSelectedReward] = useState<any>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPhone, setNewMemberPhone] = useState("");
  const [showLoyaltyQR, setShowLoyaltyQR] = useState(false);
  const [wantFullTaxInvoice, setWantFullTaxInvoice] = useState(false);
  const [taxCustomerName, setTaxCustomerName] = useState("");
  const [taxAddress, setTaxAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [taxBranchId, setTaxBranchId] = useState("");
  const [taxPhone, setTaxPhone] = useState("");
  const [taxEmail, setTaxEmail] = useState("");
  const [loyaltyQRUrl, setLoyaltyQRUrl] = useState<string | null>(null);
  const [bundleCustomizeProduct, setBundleCustomizeProduct] = useState<any>(null);
  const [bundleSlots, setBundleSlots] = useState<any[]>([]);
  const [bundleSelections, setBundleSelections] = useState<Record<string, number>>({});
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleFilter, setBundleFilter] = useState("");
  const lastInputTime = useRef(0);
  const inputBuffer = useRef("");
  const { toast } = useToast();

  const { data: activeSession, isLoading: sessionLoading } = useQuery({
    queryKey: ["/api/pos/sessions/active", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/pos/sessions/active?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!selectedCompanyId,
    refetchInterval: 30000,
    retry: 1,
  });

  const { data: branchesData } = useQuery({
    queryKey: ["/api/pos/branches", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/pos/branches?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const { data: productsData } = useQuery({
    queryKey: ["/api/pos/products", selectedCompanyId, searchTerm],
    queryFn: async () => {
      const r = await fetch(`/api/pos/products?companyId=${selectedCompanyId}&search=${encodeURIComponent(searchTerm)}`, { credentials: "include", cache: "no-store" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId && !!activeSession,
    staleTime: 0,
  });

  const { data: paymentMethodsData } = useQuery({
    queryKey: ["/api/payment-methods", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/payment-methods?companyId=${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const { data: docSettings } = useQuery({
    queryKey: ["/api/document-settings", selectedCompanyId],
    queryFn: async () => {
      const r = await fetch(`/api/document-settings/${selectedCompanyId}`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!selectedCompanyId,
  });

  const { data: contactsData } = useQuery({
    queryKey: ["/api/contacts", selectedCompanyId, customerSearch],
    queryFn: async () => {
      const r = await fetch(`/api/contacts?companyId=${selectedCompanyId}&search=${encodeURIComponent(customerSearch)}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!selectedCompanyId && customerSearch.length >= 2,
  });

  const { data: loyaltyPrograms } = useQuery({
    queryKey: ["/api/loyalty/programs", selectedCompanyId],
    queryFn: async () => { const r = await fetch(`/api/loyalty/programs?companyId=${selectedCompanyId}`, { credentials: "include" }); return r.ok ? r.json() : []; },
    enabled: !!selectedCompanyId,
  });

  const activeProgram = (loyaltyPrograms || []).find((p: any) => p.active);

  const { data: loyaltyMembersData } = useQuery({
    queryKey: ["/api/loyalty/members", selectedCompanyId, loyaltyMemberSearch],
    queryFn: async () => { const r = await fetch(`/api/loyalty/members?companyId=${selectedCompanyId}${loyaltyMemberSearch ? `&search=${encodeURIComponent(loyaltyMemberSearch)}` : ""}`, { credentials: "include" }); return r.ok ? r.json() : []; },
    enabled: !!selectedCompanyId && loyaltyMemberSearch.length >= 2,
  });

  const { data: loyaltyRewardsData } = useQuery({
    queryKey: ["/api/loyalty/rewards", selectedCompanyId],
    queryFn: async () => { const r = await fetch(`/api/loyalty/rewards?companyId=${selectedCompanyId}`, { credentials: "include" }); return r.ok ? r.json() : []; },
    enabled: !!selectedCompanyId && !!activeProgram,
  });

  const loyaltyMembersList = Array.isArray(loyaltyMembersData) ? loyaltyMembersData : [];
  const loyaltyRewardsList = (Array.isArray(loyaltyRewardsData) ? loyaltyRewardsData : []).filter((r: any) => r.active);

  const { data: sessionSummary } = useQuery({
    queryKey: ["/api/pos/sessions/summary", activeSession?.id],
    queryFn: async () => {
      const r = await fetch(`/api/pos/sessions/${activeSession?.id}/summary`, { credentials: "include" });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!activeSession?.id && showCloseSession,
  });

  const products = Array.isArray(productsData) ? productsData : [];
  const pmethods = Array.isArray(paymentMethodsData) ? paymentMethodsData : [];
  const contactsList = Array.isArray(contactsData) ? contactsData : [];

  const categories = ["ทั้งหมด", "สินค้าจัดชุด", ...Array.from(new Set(products.map((p: any) => p.category).filter(Boolean)))];
  const filteredProducts = useMemo(() => {
    if (selectedCategory === "ทั้งหมด") return products;
    if (selectedCategory === "สินค้าจัดชุด") return products.filter((p: any) => p.productType === "bundle");
    return products.filter((p: any) => p.category === selectedCategory);
  }, [products, selectedCategory]);

  const openSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/pos/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ message: "เกิดข้อผิดพลาด กรุณาลองใหม่" }));
        throw new Error(body.message || "เปิดกะไม่สำเร็จ");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos/sessions/active"] });
      setShowOpenSession(false);
    },
    onError: (err: any) => {
      alert(err.message || "เปิดกะไม่สำเร็จ กรุณาลองใหม่");
    },
  });

  const closeSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch(`/api/pos/sessions/${activeSession?.id}/close`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({ message: "เกิดข้อผิดพลาด" }));
        throw new Error(body.message || "ปิดกะไม่สำเร็จ");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos/sessions/active"] });
      setShowCloseSession(false);
      setCart([]);
    },
    onError: (err: any) => {
      alert(err.message || "ปิดกะไม่สำเร็จ กรุณาลองใหม่");
    },
  });

  useEffect(() => {
    setBtConnected(isBtConnected());
    setBtPrinterName(getConnectedPrinterName());
  }, []);

  useEffect(() => {
    setSelectedStoreId("hq");
    setBranchName("สำนักงานใหญ่");
  }, [selectedCompanyId]);

  const handleBtConnect = async () => {
    try {
      const result = await connectBluetoothPrinter();
      if (result) {
        setBtConnected(true);
        setBtPrinterName(result.name);
        toast({ title: `เชื่อมต่อ ${result.name} สำเร็จ`, variant: "success" as any });
      }
    } catch (err: any) {
      toast({ title: "เชื่อมต่อไม่สำเร็จ", description: err.message, variant: "destructive" });
    }
  };

  const buildBtReceipt = async (txData: any): Promise<ReceiptData | null> => {
    if (!txData) return null;
    const tiv = txData.taxInvoice;
    const rawItems = txData.processedItems || tiv?.items || [];
    const items = rawItems.map((item: any) => ({
      name: item.productName || "",
      qty: parseFloat(String(item.quantity || item.qty || "0")),
      unitPrice: parseFloat(String(item.unitPrice || "0")),
      total: parseFloat(String(item.lineTotal || item.total || item.totalPrice || "0")),
    }));

    let logoDataUrl: string | undefined;
    const logoUrl = docSettings?.logoUrl || (selectedCompany as any)?.logoUrl;
    const showLogo = docSettings ? docSettings.posReceiptShowLogo !== false : true;
    if (showLogo && logoUrl) {
      try {
        const resolvedUrl = objectPathToUrl(logoUrl) || logoUrl;
        const imgRes = await fetch(resolvedUrl, { credentials: "include" });
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          logoDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      } catch {}
    }

    const isFullTiv = !!txData.transaction?.isFullTaxInvoice || wantFullTaxInvoice;
    const br = activeSession?.storeId ? (branchesData || []).find((b: any) => b.id === activeSession.storeId) : null;
    return {
      companyName: selectedCompany?.name || "",
      companyNameEn: selectedCompany?.nameEn || undefined,
      companyAddress: br?.address || selectedCompany?.address || undefined,
      companyTaxId: br?.taxId || selectedCompany?.taxId || undefined,
      companyPhone: br?.phone || selectedCompany?.phone || undefined,
      companyLogoUrl: logoDataUrl,
      companyBranch: br?.name || activeSession?.branchName || (selectedCompany as any)?.branch || "สำนักงานใหญ่",
      companyBranchId: (selectedCompany as any)?.sellerBranchId || "00000",
      headerText: docSettings?.posReceiptHeaderText || undefined,
      footerText: docSettings?.posReceiptFooterText || undefined,
      fontSize: docSettings?.posReceiptFontSize || "medium",
      docNo: tiv?.taxInvoiceNo || txData.transaction?.transactionNo || "",
      docDate: new Date().toLocaleDateString("th-TH"),
      docTime: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      paymentMethod: txData.transaction?.paymentMethod || undefined,
      isFullTaxInvoice: isFullTiv,
      buyerName: isFullTiv ? (tiv?.customerName || taxCustomerName || undefined) : undefined,
      buyerAddress: isFullTiv ? (tiv?.customerAddress || taxAddress || undefined) : undefined,
      buyerTaxId: isFullTiv ? (tiv?.customerTaxId || taxId || undefined) : undefined,
      buyerPhone: isFullTiv ? (tiv?.contactPhone || taxPhone || undefined) : undefined,
      buyerEmail: isFullTiv ? (tiv?.contactEmail || taxEmail || undefined) : undefined,
      buyerBranchId: isFullTiv ? (tiv?.customerBranchId || taxBranchId || undefined) : undefined,
      items,
      subtotal: parseFloat(String(txData.transaction?.subtotal || tiv?.subtotal || "0")),
      discount: parseFloat(String(txData.transaction?.discountAmount || tiv?.discountAmount || "0")),
      vatAmount: parseFloat(String(txData.transaction?.vatAmount || tiv?.vatAmount || "0")),
      totalAmount: parseFloat(String(txData.transaction?.total || tiv?.totalAmount || "0")),
    };
  };

  const handleBtPreviewReceipt = async (txData: any) => {
    if (!txData) return;
    setBtPrinting(true);
    try {
      const receipt = await buildBtReceipt(txData);
      if (!receipt) return;
      const config = getSavedPrinterConfig();
      const imgUrl = await renderReceiptPreview(receipt, config?.paperWidth || 58);
      setBtPreviewImage(imgUrl);
      setShowBtPreview(true);
    } catch (err: any) {
      toast({ title: "พรีวิวไม่สำเร็จ", description: err.message, variant: "destructive" });
    } finally {
      setBtPrinting(false);
    }
  };

  const handleBtPrintReceipt = async (txData: any) => {
    if (!isBtConnected() || !txData) return;
    setBtPrinting(true);
    try {
      const receipt = await buildBtReceipt(txData);
      if (!receipt) return;
      const config = getSavedPrinterConfig();
      await printReceipt(receipt, config?.paperWidth || 58);
      setShowBtPreview(false);
      toast({ title: "พิมพ์ใบเสร็จสำเร็จ", variant: "success" as any });
    } catch (err: any) {
      toast({ title: "พิมพ์ไม่สำเร็จ", description: err.message, variant: "destructive" });
    } finally {
      setBtPrinting(false);
    }
  };

  const completeSaleMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await fetch("/api/pos/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: async (data) => {
      setLastTransaction(data);
      setShowPayment(false);
      setShowReceipt(true);
      setCart([]);
      setCashReceived("");
      setPaymentMethod("เงินสด");
      setCartDiscount("0");
      setSelectedCustomerId(null);
      setSelectedCustomerName("ลูกค้าทั่วไป");
      setCustomerSearch("");
      setWantFullTaxInvoice(false);
      setTaxCustomerName("");
      setTaxAddress("");
      setTaxId("");
      setTaxPhone("");
      setTaxEmail("");

      if (selectedLoyaltyMember && activeProgram) {
        try {
          const earnRes = await fetch("/api/loyalty/earn", {
            method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
            body: JSON.stringify({
              companyId: selectedCompanyId, memberId: selectedLoyaltyMember.id,
              amount: data.transaction?.total || data.taxInvoice?.totalAmount || "0",
              posTransactionId: data.transaction?.id,
              description: `POS ${data.transaction?.transactionNo}`,
            }),
          });
          if (earnRes.ok) {
            const earnData = await earnRes.json();
            if (earnData.points > 0) {
              setLastTransaction((prev: any) => ({ ...prev, loyaltyEarned: earnData.points, loyaltyTotal: earnData.totalPoints }));
              toast({ title: `สะสม ${earnData.points} แต้ม (รวม ${earnData.totalPoints})`, variant: "success" as any });
            }
          }
        } catch {}

        if (selectedReward) {
          try {
            await fetch("/api/loyalty/redeem", {
              method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
              body: JSON.stringify({
                companyId: selectedCompanyId, memberId: selectedLoyaltyMember.id,
                rewardId: selectedReward.id, posTransactionId: data.transaction?.id,
              }),
            });
          } catch {}
        }

        queryClient.invalidateQueries({ queryKey: ["/api/loyalty/members"] });
      }

      setSelectedLoyaltyMember(null);
      setLoyaltyMemberSearch("");
      setLoyaltyDiscount(0);
      setSelectedReward(null);
    },
  });

  const getProductPrice = useCallback((product: any, level: string) => {
    const levelPrice = parseFloat(String(product[level] || "0"));
    if (levelPrice > 0) return levelPrice;
    return parseFloat(String(product.price || "0"));
  }, []);

  const makeBundleCartKey = useCallback((productId: number, selections?: BundleSelection[]) => {
    if (!selections || selections.length === 0) return String(productId);
    const slotSig = selections.filter(s => s.slotGroup).sort((a, b) => {
      const cmp = a.slotGroup.localeCompare(b.slotGroup);
      if (cmp !== 0) return cmp;
      return a.componentProductId - b.componentProductId;
    }).map(s => `${s.slotGroup}:${s.componentProductId}x${s.qty}`).join("|");
    return `${productId}__${slotSig}`;
  }, []);

  const addToCartDirect = useCallback((product: any, selections?: BundleSelection[]) => {
    const key = makeBundleCartKey(product.id, selections);
    setCart(prev => {
      const existing = prev.find(item => item.cartKey === key);
      if (existing) {
        return prev.map(item =>
          item.cartKey === key
            ? { ...item, quantity: item.quantity + 1, lineTotal: Math.round(((item.quantity + 1) * item.unitPrice - item.discount) * 100) / 100 }
            : item
        );
      }
      const price = getProductPrice(product, priceLevel);
      return [...prev, {
        productId: product.id,
        cartKey: key,
        productCode: product.code || "",
        productName: product.name,
        quantity: 1,
        unitPrice: price,
        discount: 0,
        vatType: product.vatType || "vat7",
        unit: product.unit || "ชิ้น",
        lineTotal: price,
        bundleSelections: selections,
      }];
    });
  }, [priceLevel, getProductPrice, makeBundleCartKey]);

  const openBundleCustomizer = useCallback(async (product: any) => {
    setBundleCustomizeProduct(product);
    setBundleLoading(true);
    try {
      const r = await fetch(`/api/pos/bundles/${product.id}?enriched=1`, { credentials: "include" });
      if (!r.ok) throw new Error();
      const data = await r.json();
      setBundleSlots(data);
      setBundleSelections({});
    } catch {
      addToCartDirect(product);
      setBundleCustomizeProduct(null);
    }
    setBundleLoading(false);
  }, [addToCartDirect]);

  const confirmBundleSelection = useCallback(() => {
    if (!bundleCustomizeProduct) return;
    const slotGroups = [...new Set(bundleSlots.filter((s: any) => s.slotGroup).map((s: any) => s.slotGroup))];

    const allSelectionKeys: string[] = [];
    for (const sg of slotGroups) {
      const slot = bundleSlots.find((s: any) => s.slotGroup === sg);
      const qty = Number(slot?.qty) || 1;
      if (qty > 1) {
        for (let i = 1; i <= qty; i++) allSelectionKeys.push(`${sg}__${i}`);
      } else {
        allSelectionKeys.push(sg as string);
      }
    }

    const missingSlots = allSelectionKeys.filter(k => !bundleSelections[k]);
    if (missingSlots.length > 0) {
      const missingLabels = missingSlots.map(k => {
        const parts = k.split("__");
        return parts.length > 1 ? `${parts[0]} (${parts[1]})` : k;
      });
      toast({ title: "กรุณาเลือกสินค้าให้ครบทุกช่อง", description: `ยังไม่ได้เลือก: ${missingLabels.join(", ")}`, variant: "destructive" });
      return;
    }

    const selectionMap = new Map<string, { slotGroup: string; componentProductId: number; productName: string; qty: number }>();
    for (const key of allSelectionKeys) {
      const selectedId = bundleSelections[key];
      if (!selectedId) continue;
      const baseSg = key.split("__")[0];
      const slot = bundleSlots.find((s: any) => s.slotGroup === baseSg && s.componentProductId === selectedId);
      if (!slot) continue;
      const mapKey = `${baseSg}::${selectedId}`;
      const existing = selectionMap.get(mapKey);
      if (existing) {
        existing.qty += 1;
      } else {
        selectionMap.set(mapKey, {
          slotGroup: baseSg,
          componentProductId: selectedId,
          productName: slot.productName,
          qty: 1,
        });
      }
    }

    const selections: BundleSelection[] = [];
    for (const entry of selectionMap.values()) {
      selections.push({
        slotGroup: entry.slotGroup,
        componentProductId: entry.componentProductId,
        productName: entry.productName,
        qty: String(entry.qty),
      });
    }

    const fixedItems = bundleSlots.filter((s: any) => !s.slotGroup);
    for (const fi of fixedItems) {
      selections.push({
        slotGroup: "",
        componentProductId: fi.componentProductId,
        productName: fi.productName,
        qty: fi.qty,
      });
    }
    addToCartDirect(bundleCustomizeProduct, selections.length > 0 ? selections : undefined);
    setBundleCustomizeProduct(null);
    setBundleSlots([]);
    setBundleSelections({});
    setBundleFilter("");
  }, [bundleCustomizeProduct, bundleSlots, bundleSelections, addToCartDirect, toast]);

  const addToCart = useCallback((product: any) => {
    if (product.productType === "bundle") {
      openBundleCustomizer(product);
      return;
    }
    addToCartDirect(product);
  }, [addToCartDirect, openBundleCustomizer]);

  const updateQuantity = useCallback((cartKey: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartKey === cartKey) {
        const newQty = Math.max(0, item.quantity + delta);
        if (newQty === 0) return null as any;
        return { ...item, quantity: newQty, lineTotal: Math.round((newQty * item.unitPrice - item.discount) * 100) / 100 };
      }
      return item;
    }).filter(Boolean));
  }, []);

  const removeFromCart = useCallback((cartKey: string) => {
    setCart(prev => prev.filter(item => item.cartKey !== cartKey));
  }, []);

  const updateItemDiscount = useCallback((cartKey: string, discount: number) => {
    setCart(prev => prev.map(item => {
      if (item.cartKey === cartKey) {
        const d = Math.max(0, Math.min(discount, item.quantity * item.unitPrice));
        return { ...item, discount: d, lineTotal: Math.round((item.quantity * item.unitPrice - d) * 100) / 100 };
      }
      return item;
    }));
  }, []);

  const holdCurrentOrder = useCallback(() => {
    if (cart.length === 0) return;
    setHeldOrders(prev => [...prev, {
      id: Date.now(),
      cart: [...cart],
      customerName: selectedCustomerName,
      customerId: selectedCustomerId,
      cartDiscount,
      heldAt: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    }]);
    setCart([]);
    setCartDiscount("0");
    setSelectedCustomerId(null);
    setSelectedCustomerName("ลูกค้าทั่วไป");
    setCustomerSearch("");
  }, [cart, selectedCustomerName, selectedCustomerId, cartDiscount]);

  const resumeOrder = useCallback((orderId: number) => {
    const order = heldOrders.find(o => o.id === orderId);
    if (!order) return;
    if (cart.length > 0) {
      holdCurrentOrder();
    }
    setCart(order.cart);
    setCartDiscount(order.cartDiscount);
    setSelectedCustomerId(order.customerId);
    setSelectedCustomerName(order.customerName);
    setHeldOrders(prev => prev.filter(o => o.id !== orderId));
    setShowHeldOrders(false);
  }, [heldOrders, cart, holdCurrentOrder]);

  const removeHeldOrder = useCallback((orderId: number) => {
    setHeldOrders(prev => prev.filter(o => o.id !== orderId));
  }, []);

  const scanBundleComponent = useCallback((code: string) => {
    if (!bundleCustomizeProduct || !bundleSlots.length) return false;

    let repeatCount = 1;
    let actualCode = code;
    const qtyMatch = code.match(/^(\d+)\s*[xX\*]\s*(.+)$/);
    if (qtyMatch) {
      repeatCount = Math.max(1, Math.min(parseInt(qtyMatch[1], 10), 10));
      actualCode = qtyMatch[2];
    }

    const rl = actualCode.toLowerCase();
    const matches = bundleSlots.filter((s: any) => s.slotGroup &&
      (s.productCode === actualCode || s.productBarcode === actualCode ||
       s.productCode?.toLowerCase() === rl || s.productBarcode?.toLowerCase() === rl ||
       s.productName?.toLowerCase().includes(rl)));
    if (matches.length === 0) {
      toast({ title: "ไม่พบสินค้าในชุดนี้", description: `"${actualCode}" ไม่ตรงกับตัวเลือกใดในชุด`, variant: "destructive" });
      return true;
    }

    setBundleSelections(prev => {
      const next = { ...prev };
      let filled = 0;

      for (let r = 0; r < repeatCount; r++) {
        let placed = false;
        for (const match of matches) {
          const sg = match.slotGroup;
          const slotQty = Number(match.qty) || 1;
          if (slotQty > 1) {
            for (let i = 1; i <= slotQty; i++) {
              const subKey = `${sg}__${i}`;
              if (!next[subKey]) {
                next[subKey] = match.componentProductId;
                filled++;
                placed = true;
                break;
              }
            }
          } else {
            if (!next[sg]) {
              next[sg] = match.componentProductId;
              filled++;
              placed = true;
            }
          }
          if (placed) break;
        }
        if (!placed && r === 0) {
          const firstMatch = matches[0];
          const sg = firstMatch.slotGroup;
          const slotQty = Number(firstMatch.qty) || 1;
          if (slotQty > 1) {
            next[`${sg}__1`] = firstMatch.componentProductId;
          } else {
            next[sg] = firstMatch.componentProductId;
          }
          filled++;
        }
      }

      const matchName = matches[0].productName;
      if (filled > 0) {
        toast({ title: "เลือกแล้ว", description: `${matchName}${repeatCount > 1 ? ` x${filled} ช่อง` : ""}` });
      }
      return next;
    });
    return true;
  }, [bundleCustomizeProduct, bundleSlots, toast]);

  const handleBarcodeSearch = useCallback(async (code: string) => {
    if (!code.trim() || !selectedCompanyId) return;
    let cleaned = code.trim().replace(/^\*+|\*+$/g, "");
    cleaned = thaiToEng(cleaned);
    if (!cleaned) return;
    if (bundleCustomizeProduct) {
      scanBundleComponent(cleaned);
      setSearchTerm("");
      return;
    }
    try {
      const r = await fetch(`/api/pos/products?companyId=${selectedCompanyId}&search=${encodeURIComponent(cleaned)}`, { credentials: "include" });
      if (!r.ok) { setSearchTerm(""); return; }
      const results = await r.json();
      const exactMatch = results.find((p: any) =>
        p.code === cleaned || p.barcode === cleaned
      );
      if (exactMatch) {
        addToCart(exactMatch);
        setSearchTerm("");
        setBarcodeFlash(true);
        setTimeout(() => setBarcodeFlash(false), 300);
        if (searchRef.current) searchRef.current.focus();
      } else {
        setSearchTerm("");
        toast({ title: "ไม่พบสินค้า", description: `ไม่พบสินค้ารหัส "${cleaned}"`, variant: "destructive" });
      }
    } catch {
      setSearchTerm("");
    }
  }, [selectedCompanyId, addToCart, bundleCustomizeProduct, scanBundleComponent, toast]);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchTerm.trim()) {
      e.preventDefault();
      handleBarcodeSearch(searchTerm);
    }
  }, [searchTerm, handleBarcodeSearch]);

  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.lineTotal, 0) * 100) / 100;
  const discountAmt = Math.round((parseFloat(cartDiscount || "0") || 0) * 100) / 100;
  const totalAfterDiscount = Math.round(Math.max(0, subtotal - discountAmt - loyaltyDiscount) * 100) / 100;
  const vatAmount = Math.round(cart.reduce((sum, item) => {
    if (item.vatType === "vat7") return sum + (item.lineTotal * 7 / 107);
    return sum;
  }, 0) * 100) / 100;
  const total = totalAfterDiscount;
  const changeAmount = Math.round((paymentMethod === "เงินสด" ? parseFloat(cashReceived || "0") - total : 0) * 100) / 100;

  useEffect(() => {
    if (!activeSession && !sessionLoading) {
      setShowOpenSession(true);
    }
  }, [activeSession, sessionLoading]);

  useEffect(() => {
    if (activeSession && searchRef.current) {
      searchRef.current.focus();
    }
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession) return;
    let buffer = "";
    let lastKeyTime = 0;
    const SCAN_THRESHOLD = 60;
    const MIN_LENGTH = 3;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const now = Date.now();
      if (now - lastKeyTime > SCAN_THRESHOLD * 3) {
        buffer = "";
      }
      lastKeyTime = now;

      if (e.key === "Enter") {
        if (buffer.length >= MIN_LENGTH) {
          const cleaned = buffer.replace(/^\*+|\*+$/g, "");
          if (cleaned) {
            e.preventDefault();
            handleBarcodeSearch(cleaned);
          }
        }
        buffer = "";
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeSession, handleBarcodeSearch]);

  const handleCompleteSale = () => {
    if (paymentMethod === "เงินสด" && parseFloat(cashReceived || "0") < total) return;
    const totalDiscountForSale = discountAmt + loyaltyDiscount;
    completeSaleMutation.mutate({
      companyId: selectedCompanyId,
      sessionId: activeSession?.id,
      items: cart,
      paymentMethod,
      cashReceived: paymentMethod === "เงินสด" ? cashReceived : String(total),
      discountAmount: totalDiscountForSale > 0 ? String(totalDiscountForSale) : undefined,
      customerId: selectedCustomerId || undefined,
      customerName: selectedCustomerName !== "ลูกค้าทั่วไป" ? selectedCustomerName : undefined,
      ...(wantFullTaxInvoice && {
        fullTaxInvoice: true,
        taxCustomerName: taxCustomerName || undefined,
        taxAddress: taxAddress || undefined,
        taxId: taxId || undefined,
        taxBranchId: taxBranchId || undefined,
        taxPhone: taxPhone || undefined,
        taxEmail: taxEmail || undefined,
      }),
    });
  };

  const quickCashButtons = [20, 50, 100, 500, 1000];

  const openingCashAmount = parseFloat(String(activeSession?.openingCash || "0"));
  const cashSales = sessionSummary?.paymentBreakdown?.["เงินสด"]?.total || 0;
  const expectedCash = openingCashAmount + cashSales;
  const closingCashNum = parseFloat(closingCash || "0");
  const variance = closingCash ? closingCashNum - expectedCash : 0;

  if (sessionLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100" data-testid="pos-loading">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#fb9678] mx-auto mb-4"></div>
          <p className="text-gray-500">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden" data-testid="pos-terminal">
      {/* Top Bar */}
      <div className="bg-[#fb9678] text-white px-2 md:px-4 py-2 flex items-center justify-between shadow-md" data-testid="pos-header">
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/20 flex-shrink-0" onClick={() => setLocation("/pos/sessions")} data-testid="btn-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <ShoppingCart className="h-5 w-5 md:h-6 md:w-6 flex-shrink-0" />
          <span className="font-bold text-base md:text-lg">POS</span>
          <span className="text-xs md:text-sm opacity-90 truncate hidden sm:inline">| {selectedCompany?.name}</span>
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
          {activeSession && (
            <>
              <Badge variant="outline" className="border-white text-white text-[10px] md:text-xs hidden sm:inline-flex" data-testid="badge-session">
                กะ #{activeSession.id} | {activeSession.branchName} - {activeSession.terminalName}
              </Badge>
              <Badge variant="outline" className="border-white text-white text-[10px] md:text-xs hidden md:inline-flex" data-testid="badge-user">
                {(user as any)?.fullName || (user as any)?.username}
              </Badge>
              {activeProgram && (
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/20" onClick={async () => {
                  setShowLoyaltyQR(true);
                  if (!loyaltyQRUrl) {
                    const QRCode = (await import("qrcode")).default;
                    const signupUrl = `${window.location.origin}/loyalty/signup?c=${selectedCompanyId}`;
                    const url = await QRCode.toDataURL(signupUrl, { width: 300, margin: 2, color: { dark: "#333333" } });
                    setLoyaltyQRUrl(url);
                  }
                }} data-testid="btn-loyalty-qr">
                  <Star className="h-4 w-4" /> <span className="hidden sm:inline ml-1">QR สมาชิก</span>
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-white hover:bg-white/20" onClick={() => setShowCloseSession(true)} data-testid="btn-close-session">
                <LogOut className="h-4 w-4" /> <span className="hidden sm:inline ml-1">ปิดกะ</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {activeSession ? (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Mobile Tab Switcher */}
          <div className="md:hidden flex border-b bg-white">
            <button
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 ${mobileView === "products" ? "text-[#fb9678] border-b-2 border-[#fb9678]" : "text-gray-500"}`}
              onClick={() => setMobileView("products")}
              data-testid="mobile-tab-products"
            >
              <ShoppingCart className="h-4 w-4" /> สินค้า
            </button>
            <button
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-1.5 relative ${mobileView === "cart" ? "text-[#fb9678] border-b-2 border-[#fb9678]" : "text-gray-500"}`}
              onClick={() => setMobileView("cart")}
              data-testid="mobile-tab-cart"
            >
              <Receipt className="h-4 w-4" /> ตะกร้า
              {cart.length > 0 && (
                <span className="absolute -top-0.5 right-[calc(50%-40px)] bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center">{cart.length}</span>
              )}
            </button>
          </div>

          {/* Left: Product Grid */}
          <div className={`flex-1 flex flex-col p-3 overflow-hidden ${mobileView === "cart" ? "hidden md:flex" : "flex"}`}>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                ref={searchRef}
                placeholder="ค้นหาสินค้า / สแกนบาร์โค้ด (กด Enter เพื่อเพิ่ม)..."
                className={`pl-10 h-11 text-base transition-colors ${barcodeFlash ? "bg-green-100 border-green-400" : ""}`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                data-testid="input-search"
              />
              {barcodeFlash && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 text-sm font-medium animate-pulse">
                  เพิ่มแล้ว!
                </span>
              )}
            </div>

            {/* Category Tabs */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-thin" data-testid="category-tabs">
              {categories.map((cat: string) => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? "default" : "outline"}
                  size="sm"
                  className={`whitespace-nowrap flex-shrink-0 ${selectedCategory === cat ? "bg-[#fb9678] hover:bg-[#fb9678]/90" : ""}`}
                  onClick={() => setSelectedCategory(cat)}
                  data-testid={`tab-category-${cat}`}
                >
                  {cat}
                </Button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
                {filteredProducts.map((p: any) => (
                  <Card
                    key={p.id}
                    className="p-2.5 cursor-pointer hover:shadow-md hover:border-[#fb9678] transition-all active:scale-95 flex flex-col"
                    onClick={() => addToCart(p)}
                    data-testid={`product-card-${p.id}`}
                  >
                    <div className="text-center flex flex-col flex-1">
                      <div className="w-full h-14 bg-gray-100 rounded flex items-center justify-center mb-1.5 overflow-hidden flex-shrink-0">
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling && ((e.target as HTMLImageElement).parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>'); }} />
                        ) : (
                          <ShoppingCart className="h-7 w-7 text-gray-300" />
                        )}
                      </div>
                      <p className="text-xs font-medium leading-tight line-clamp-2 min-h-[2rem]" title={p.name}>{p.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{p.code}</p>
                      <p className="text-sm font-bold text-[#fb9678] mt-auto pt-1">
                        ฿{parseFloat(String(p.price || "0")).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </p>
                      {p.vatType === "vat7" && <Badge variant="outline" className="text-[10px] mt-0.5 py-0 h-4">VAT 7%</Badge>}
                    </div>
                  </Card>
                ))}
                {filteredProducts.length === 0 && (
                  <div className="col-span-full text-center text-gray-400 py-20">
                    {searchTerm ? "ไม่พบสินค้า" : "ยังไม่มีสินค้าในระบบ"}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Cart */}
          <div className={`w-full md:w-[380px] bg-white flex flex-col md:border-l shadow-lg ${mobileView === "products" ? "hidden md:flex" : "flex"}`}>
            <div className="p-3 border-b bg-gray-50">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-[#fb9678]" />
                  รายการสินค้า
                  {cart.length > 0 && <Badge className="bg-[#fb9678]">{cart.length}</Badge>}
                </h3>
                <div className="flex items-center gap-1">
                  {cart.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 border-amber-400 text-amber-600 hover:bg-amber-50"
                      onClick={holdCurrentOrder}
                      data-testid="btn-hold-order"
                    >
                      <Pause className="h-3 w-3" /> พักบิล
                    </Button>
                  )}
                  {heldOrders.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 border-[#05b187] text-[#05b187] hover:bg-[#05b187]/10 relative"
                      onClick={() => setShowHeldOrders(true)}
                      data-testid="btn-show-held-orders"
                    >
                      <Play className="h-3 w-3" /> เรียกคืน
                      <Badge className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] h-4 w-4 p-0 flex items-center justify-center">{heldOrders.length}</Badge>
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2" data-testid="cart-items">
              {cart.length === 0 ? (
                <div className="text-center text-gray-400 py-20">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>ยังไม่มีสินค้าในตะกร้า</p>
                  <p className="text-xs mt-1">เลือกสินค้าจากด้านซ้าย หรือสแกนบาร์โค้ด</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.cartKey} className="p-2 rounded-lg bg-gray-50 border" data-testid={`cart-item-${item.cartKey}`}>
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => {
                          setEditingItemId(editingItemId === item.cartKey ? null : item.cartKey);
                          setEditingItemDiscount(String(item.discount));
                        }}
                        data-testid={`cart-item-click-${item.cartKey}`}
                      >
                        <p className="text-sm font-medium truncate">
                          {item.bundleSelections && <Package className="h-3 w-3 inline mr-1 text-[#fb9678]" />}
                          {item.productName}
                        </p>
                        {item.bundleSelections && item.bundleSelections.filter(s => s.slotGroup).length > 0 && (
                          <p className="text-[10px] text-blue-500 truncate">
                            {item.bundleSelections.filter(s => s.slotGroup).map(s => Number(s.qty) > 1 ? `${s.productName} x${s.qty}` : s.productName).join(", ")}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          ฿{item.unitPrice.toLocaleString("th-TH", { minimumFractionDigits: 2 })} x {item.quantity}
                          {item.discount > 0 && <span className="text-red-500 ml-1">-฿{item.discount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.cartKey, -1)} data-testid={`btn-minus-${item.cartKey}`}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.cartKey, 1)} data-testid={`btn-plus-${item.cartKey}`}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeFromCart(item.cartKey)} data-testid={`btn-remove-${item.cartKey}`}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-sm font-bold w-20 text-right">฿{item.lineTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                    </div>
                    {editingItemId === item.cartKey && (
                      <div className="mt-2 flex items-center gap-2 pl-1" data-testid={`item-discount-edit-${item.cartKey}`}>
                        <Percent className="h-3 w-3 text-gray-400" />
                        <Input
                          type="number"
                          className="h-7 text-sm w-24"
                          placeholder="ส่วนลด"
                          value={editingItemDiscount}
                          onChange={(e) => setEditingItemDiscount(e.target.value)}
                          data-testid={`input-item-discount-${item.cartKey}`}
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-[#05b187] hover:bg-[#05b187]/90"
                          onClick={() => {
                            updateItemDiscount(item.cartKey, parseFloat(editingItemDiscount || "0"));
                            setEditingItemId(null);
                          }}
                          data-testid={`btn-apply-item-discount-${item.cartKey}`}
                        >
                          ตกลง
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setEditingItemId(null)}
                          data-testid={`btn-cancel-item-discount-${item.cartKey}`}
                        >
                          ยกเลิก
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Cart Summary */}
            <div className="border-t p-3 bg-gray-50 space-y-2">
              <div className="flex justify-between text-sm">
                <span>ยอดรวมก่อน VAT</span>
                <span>฿{(subtotal - vatAmount).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>VAT 7%</span>
                <span>฿{vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>

              {/* Cart-level discount */}
              <div className="flex items-center gap-2 text-sm">
                <span className="flex items-center gap-1"><Percent className="h-3 w-3" /> ส่วนลดท้ายบิล</span>
                <Input
                  type="number"
                  className="h-7 w-24 text-sm text-right ml-auto"
                  value={cartDiscount}
                  onChange={(e) => setCartDiscount(e.target.value)}
                  placeholder="0"
                  data-testid="input-cart-discount"
                />
              </div>

              {discountAmt > 0 && (
                <div className="flex justify-between text-sm text-red-500">
                  <span>ส่วนลด</span>
                  <span>-฿{discountAmt.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              <div className="flex justify-between text-xl font-bold border-t pt-2">
                <span>รวมทั้งสิ้น</span>
                <span className="text-[#fb9678]" data-testid="text-total">฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>

              <Button
                className="w-full h-14 text-lg font-bold bg-[#05b187] hover:bg-[#05b187]/90"
                disabled={cart.length === 0}
                onClick={() => setShowPayment(true)}
                data-testid="btn-pay"
              >
                <Banknote className="h-6 w-6 mr-2" />
                ชำระเงิน
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-8 max-w-md w-full text-center">
            <ShoppingCart className="h-16 w-16 text-[#fb9678] mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">เปิดกะก่อนเริ่มขาย</h2>
            <p className="text-gray-500 mb-6">กรุณาเปิดกะเพื่อเริ่มการขายหน้าร้าน</p>
            <Button className="bg-[#fb9678] hover:bg-[#fb9678]/90 h-12 px-8 text-lg" onClick={() => setShowOpenSession(true)} data-testid="btn-open-session-cta">
              เปิดกะ
            </Button>
          </Card>
        </div>
      )}

      {/* Held Orders Dialog */}
      <Dialog open={showHeldOrders} onOpenChange={setShowHeldOrders}>
        <DialogContent className="max-w-md" data-testid="dialog-held-orders">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center gap-2">
              <Pause className="h-5 w-5 text-amber-500" />
              บิลที่พักไว้ ({heldOrders.length})
            </DialogTitle>
          </DialogHeader>
          {heldOrders.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <Pause className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>ไม่มีบิลที่พักไว้</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {heldOrders.map((order) => {
                const orderTotal = order.cart.reduce((sum, i) => sum + i.lineTotal, 0) - parseFloat(order.cartDiscount || "0");
                return (
                  <div key={order.id} className="p-3 border rounded-lg hover:border-[#fb9678] transition-colors" data-testid={`held-order-${order.id}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium">{order.customerName}</p>
                        <p className="text-xs text-gray-500">พักเมื่อ {order.heldAt} | {order.cart.length} รายการ</p>
                      </div>
                      <p className="font-bold text-[#fb9678]">฿{orderTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                      {order.cart.slice(0, 3).map(i => i.productName).join(", ")}
                      {order.cart.length > 3 && ` +${order.cart.length - 3} รายการ`}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs bg-[#05b187] hover:bg-[#05b187]/90 gap-1"
                        onClick={() => resumeOrder(order.id)}
                        data-testid={`btn-resume-${order.id}`}
                      >
                        <Play className="h-3 w-3" /> เรียกคืน
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-500 border-red-300 hover:bg-red-50 gap-1"
                        onClick={() => removeHeldOrder(order.id)}
                        data-testid={`btn-delete-held-${order.id}`}
                      >
                        <Trash2 className="h-3 w-3" /> ลบ
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Open Session Dialog */}
      <Dialog open={showOpenSession} onOpenChange={setShowOpenSession}>
        <DialogContent className="max-w-md" data-testid="dialog-open-session">
          <DialogHeader>
            <DialogTitle className="text-xl">เปิดกะขาย</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">สาขา</label>
              {(branchesData || []).length > 0 ? (
                <Select value={selectedStoreId} onValueChange={(val) => {
                  setSelectedStoreId(val);
                  if (val === "hq") { setBranchName("สำนักงานใหญ่"); }
                  else { const b = (branchesData || []).find((b: any) => String(b.id) === val); if (b) setBranchName(b.name); }
                }} data-testid="select-branch">
                  <SelectTrigger data-testid="input-branch"><SelectValue placeholder="เลือกสาขา" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hq">สำนักงานใหญ่</SelectItem>
                    {(branchesData || []).map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.code} - {b.name}{b.warehouse ? ` (${b.warehouse.name})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} data-testid="input-branch" />
              )}
            </div>
            <div>
              <label className="text-sm font-medium">เครื่อง</label>
              <Input value={terminalName} onChange={(e) => setTerminalName(e.target.value)} data-testid="input-terminal" />
            </div>
            <div>
              <label className="text-sm font-medium">เงินสดเปิดกะ (บาท)</label>
              <Input type="number" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} data-testid="input-opening-cash" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowOpenSession(false); setLocation("/"); }}>ยกเลิก</Button>
            <Button className="bg-[#fb9678] hover:bg-[#fb9678]/90" onClick={() => openSessionMutation.mutate({
              companyId: selectedCompanyId,
              openingCash,
              branchName,
              terminalName,
              storeId: selectedStoreId && selectedStoreId !== "hq" ? Number(selectedStoreId) : undefined,
            })} disabled={openSessionMutation.isPending} data-testid="btn-confirm-open">
              {openSessionMutation.isPending ? "กำลังเปิด..." : "เปิดกะ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Session Dialog */}
      <Dialog open={showCloseSession} onOpenChange={setShowCloseSession}>
        <DialogContent className="max-w-md" data-testid="dialog-close-session">
          <DialogHeader>
            <DialogTitle className="text-xl">ปิดกะขาย</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>กะ #{activeSession?.id}</span>
                <span>{activeSession?.branchName} - {activeSession?.terminalName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>เงินสดเปิดกะ</span>
                <span>฿{openingCashAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {sessionSummary && (
              <div className="bg-blue-50 rounded-lg p-4 space-y-3" data-testid="session-summary">
                <div className="flex justify-between text-sm font-medium">
                  <span>จำนวนรายการทั้งหมด</span>
                  <span data-testid="text-total-transactions">{sessionSummary.totalTransactions} รายการ</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>ยอดขายรวม</span>
                  <span className="text-[#fb9678] font-bold" data-testid="text-total-sales">
                    ฿{(sessionSummary.totalSales || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="border-t pt-2 space-y-1">
                  <p className="text-xs font-medium text-gray-600 mb-1">แยกตามช่องทางชำระ</p>
                  {Object.entries(sessionSummary.paymentBreakdown || {}).map(([method, data]: [string, any]) => (
                    <div key={method} className="flex justify-between text-sm" data-testid={`breakdown-${method}`}>
                      <span>{method} ({data.count} รายการ)</span>
                      <span>฿{(data.total || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                  {Object.keys(sessionSummary.paymentBreakdown || {}).length === 0 && (
                    <p className="text-xs text-gray-400">ยังไม่มีรายการขาย</p>
                  )}
                </div>

                <div className="border-t pt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>เงินสดที่ควรมี</span>
                    <span data-testid="text-expected-cash">฿{expectedCash.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">นับเงินสดจริง (บาท)</label>
              <Input type="number" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} placeholder="0.00" data-testid="input-closing-cash" />
            </div>

            {closingCash && sessionSummary && (
              <div className={`p-3 rounded-lg text-center ${variance === 0 ? "bg-green-50" : "bg-red-50"}`} data-testid="cash-variance">
                <p className="text-xs text-gray-500">ผลต่าง</p>
                <p className={`text-xl font-bold ${variance === 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-variance">
                  {variance >= 0 ? "+" : ""}฿{variance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs mt-1">{variance === 0 ? "✓ ตรงพอดี" : variance > 0 ? "เงินเกิน" : "เงินขาด"}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseSession(false)}>ยกเลิก</Button>
            <Button className="bg-red-500 hover:bg-red-600 text-white" onClick={() => closeSessionMutation.mutate({ closingCash })} disabled={closeSessionMutation.isPending} data-testid="btn-confirm-close">
              {closeSessionMutation.isPending ? "กำลังปิด..." : "ปิดกะ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPayment} onOpenChange={setShowPayment}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col" data-testid="dialog-payment">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-xl">ชำระเงิน</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">ยอดรวมสินค้า ({cart.length} รายการ)</span>
                  <span className="font-medium">฿{subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
                {discountAmt > 0 && (
                  <div className="flex justify-between text-sm text-red-500">
                    <span>ส่วนลดท้ายบิล</span>
                    <span>-฿{discountAmt.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {loyaltyDiscount > 0 && (
                  <div className="flex justify-between text-sm text-amber-600">
                    <span><Star className="h-3 w-3 inline mr-1" />ส่วนลดแลกแต้ม</span>
                    <span>-฿{loyaltyDiscount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {vatAmount > 0 && (
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>รวม VAT 7%</span>
                    <span>฿{vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-bold text-gray-700">ยอดที่ต้องชำระ</span>
                    <p className="text-3xl font-bold text-[#fb9678]" data-testid="text-payment-total">
                      ฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Search */}
            <div data-testid="customer-search-section">
              <label className="text-sm font-medium mb-2 block">
                <User className="h-3 w-3 inline mr-1" />
                ลูกค้า
              </label>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-sm" data-testid="text-selected-customer">
                  {selectedCustomerName}
                </Badge>
                {selectedCustomerId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-red-500"
                    onClick={() => {
                      setSelectedCustomerId(null);
                      setSelectedCustomerName("ลูกค้าทั่วไป");
                      setCustomerSearch("");
                    }}
                    data-testid="btn-clear-customer"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                <Input
                  className="h-8 text-sm pl-7"
                  placeholder="ค้นหาลูกค้า (ชื่อ, เบอร์โทร)..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  data-testid="input-customer-search"
                />
              </div>
              {customerSearch.length >= 2 && contactsList.length > 0 && (
                <div className="border rounded mt-1 max-h-32 overflow-y-auto" data-testid="customer-search-results">
                  {contactsList.map((c: any) => (
                    <div
                      key={c.id}
                      className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer flex justify-between"
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        setSelectedCustomerName(c.name);
                        setCustomerSearch("");
                      }}
                      data-testid={`customer-option-${c.id}`}
                    >
                      <span>{c.name}</span>
                      {c.phone && <span className="text-gray-400 text-xs">{c.phone}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div data-testid="price-level-section">
              <label className="text-sm font-medium mb-2 block">ระดับราคา</label>
              <select
                className="w-full h-8 text-sm border rounded px-2 bg-white"
                value={priceLevel}
                onChange={e => setPriceLevel(e.target.value)}
                data-testid="select-price-level"
              >
                <option value="price">ราคาขาย (ทั่วไป)</option>
                <option value="priceRetail">ราคาขายปลีก</option>
                <option value="priceWholesale">ราคาขายส่ง</option>
                <option value="priceAgent">ราคาตัวแทน</option>
                <option value="priceSpecial">ราคาพิเศษ</option>
                <option value="priceVip">ราคา VIP</option>
              </select>
            </div>

            {activeProgram && (
              <div className="border rounded-lg p-3 bg-amber-50/50" data-testid="loyalty-section">
                <label className="text-sm font-medium mb-2 block">
                  <Star className="h-3 w-3 inline mr-1 text-amber-500" />
                  สมาชิกสะสมแต้ม
                </label>
                {selectedLoyaltyMember ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-white rounded p-2 border">
                      <div>
                        <span className="font-medium text-sm" data-testid="text-loyalty-member-name">{selectedLoyaltyMember.name}</span>
                        <Badge variant="outline" className="ml-2 text-xs">{selectedLoyaltyMember.memberCode}</Badge>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 text-red-500" onClick={() => { setSelectedLoyaltyMember(null); setLoyaltyDiscount(0); setSelectedReward(null); setLoyaltyMemberSearch(""); }} data-testid="btn-clear-loyalty">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-amber-600 font-medium" data-testid="text-loyalty-points">
                        <Star className="h-3 w-3 inline mr-1" />{selectedLoyaltyMember.totalPoints || 0} แต้ม
                      </span>
                      <span className="text-xs text-gray-500">มาแล้ว {selectedLoyaltyMember.visitCount || 0} ครั้ง</span>
                    </div>
                    <div className="text-xs text-gray-500">
                      จะได้รับ: ~{Math.floor(total / (parseFloat(activeProgram.spendAmount) || 100)) * (parseFloat(activeProgram.pointsPerSpend) || 1)} แต้มจากรายการนี้
                    </div>
                    {loyaltyRewardsList.length > 0 && (selectedLoyaltyMember.totalPoints || 0) > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-600 mb-1">แลกแต้ม:</p>
                        <div className="flex flex-wrap gap-1">
                          {loyaltyRewardsList.map((reward: any) => {
                            const canRedeem = (selectedLoyaltyMember.totalPoints || 0) >= reward.pointsCost;
                            const isSelected = selectedReward?.id === reward.id;
                            return (
                              <Button
                                key={reward.id}
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                className={`text-xs h-7 ${isSelected ? "bg-amber-500 hover:bg-amber-600" : ""} ${!canRedeem ? "opacity-40" : ""}`}
                                disabled={!canRedeem}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedReward(null);
                                    setLoyaltyDiscount(0);
                                  } else {
                                    setSelectedReward(reward);
                                    const disc = reward.rewardType === "discount_percent"
                                      ? Math.min(subtotal * parseFloat(reward.discountPercent || "0") / 100, parseFloat(reward.maxDiscount || "999999"))
                                      : parseFloat(reward.discountAmount || "0");
                                    setLoyaltyDiscount(disc);
                                  }
                                }}
                                data-testid={`btn-redeem-${reward.id}`}
                              >
                                <Gift className="h-3 w-3 mr-1" />
                                {reward.name} ({reward.pointsCost}แต้ม)
                              </Button>
                            );
                          })}
                        </div>
                        {selectedReward && loyaltyDiscount > 0 && (
                          <div className="mt-1 text-xs text-green-600 font-medium" data-testid="text-loyalty-discount">
                            ส่วนลดแลกแต้ม: -฿{loyaltyDiscount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="relative">
                      <ScanBarcode className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-500" />
                      <Input
                        className="h-8 text-sm pl-8 font-mono border-amber-300 focus-visible:ring-amber-400"
                        placeholder="สแกน QR / บาร์โค้ดสมาชิก..."
                        autoComplete="off"
                        data-testid="input-loyalty-scan"
                        onKeyDown={async (e) => {
                          if (e.key !== "Enter") return;
                          const raw = (e.target as HTMLInputElement).value.trim().replace(/^\*|\*$/g, "");
                          if (!raw) return;
                          try {
                            const r = await fetch(`/api/loyalty/members?companyId=${selectedCompanyId}&search=${encodeURIComponent(raw)}`, { credentials: "include" });
                            if (!r.ok) throw new Error();
                            const results = await r.json();
                            const exact = results.find((m: any) => m.memberCode === raw || m.phone === raw);
                            if (exact) {
                              setSelectedLoyaltyMember(exact);
                              toast({ title: `สมาชิก: ${exact.name}`, description: `${exact.memberCode} — ${exact.totalPoints || 0} แต้ม` });
                            } else if (results.length > 0) {
                              setSelectedLoyaltyMember(results[0]);
                              toast({ title: `สมาชิก: ${results[0].name}`, description: `${results[0].memberCode} — ${results[0].totalPoints || 0} แต้ม` });
                            } else {
                              toast({ title: "ไม่พบสมาชิก", description: `รหัส "${raw}" ไม่มีในระบบ`, variant: "destructive" });
                            }
                          } catch {
                            toast({ title: "เกิดข้อผิดพลาด", variant: "destructive" });
                          }
                          (e.target as HTMLInputElement).value = "";
                        }}
                      />
                    </div>
                    <div className="relative mt-1.5">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                      <Input
                        className="h-8 text-sm pl-7"
                        placeholder="ค้นหาสมาชิก (ชื่อ, เบอร์, รหัส)..."
                        value={loyaltyMemberSearch}
                        onChange={(e) => setLoyaltyMemberSearch(e.target.value)}
                        data-testid="input-loyalty-search"
                      />
                    </div>
                    {loyaltyMemberSearch.length >= 2 && loyaltyMembersList.length > 0 && (
                      <div className="border rounded mt-1 max-h-28 overflow-y-auto bg-white" data-testid="loyalty-search-results">
                        {loyaltyMembersList.map((m: any) => (
                          <div
                            key={m.id}
                            className="px-3 py-2 text-sm hover:bg-amber-50 cursor-pointer flex justify-between"
                            onClick={() => { setSelectedLoyaltyMember(m); setLoyaltyMemberSearch(""); }}
                            data-testid={`loyalty-member-${m.id}`}
                          >
                            <span>{m.name} <span className="text-gray-400 text-xs">{m.memberCode}</span></span>
                            <span className="text-amber-600 text-xs font-medium">{m.totalPoints || 0} แต้ม</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {loyaltyMemberSearch.length >= 2 && loyaltyMembersList.length === 0 && !showAddMember && (
                      <p className="text-xs text-gray-400 mt-1">ไม่พบสมาชิก</p>
                    )}
                    {!showAddMember ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 text-xs border-amber-400 text-amber-600 hover:bg-amber-50"
                        onClick={() => { setShowAddMember(true); setNewMemberName(loyaltyMemberSearch); setNewMemberPhone(""); }}
                        data-testid="btn-add-loyalty-member"
                      >
                        <Plus className="h-3 w-3 mr-1" /> เพิ่มสมาชิกใหม่
                      </Button>
                    ) : (
                      <div className="border rounded p-2 mt-2 bg-white space-y-2">
                        <p className="text-xs font-medium text-amber-600">เพิ่มสมาชิกใหม่</p>
                        <Input
                          className="h-8 text-sm"
                          placeholder="ชื่อสมาชิก *"
                          value={newMemberName}
                          onChange={(e) => setNewMemberName(e.target.value)}
                          data-testid="input-new-member-name"
                        />
                        <Input
                          className="h-8 text-sm"
                          placeholder="เบอร์โทร"
                          value={newMemberPhone}
                          onChange={(e) => setNewMemberPhone(e.target.value)}
                          data-testid="input-new-member-phone"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={() => setShowAddMember(false)}
                          >
                            ยกเลิก
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1 text-xs bg-amber-500 hover:bg-amber-600"
                            disabled={!newMemberName.trim()}
                            onClick={async () => {
                              try {
                                const r = await fetch("/api/loyalty/members", {
                                  method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
                                  body: JSON.stringify({ companyId: selectedCompanyId, programId: activeProgram.id, name: newMemberName.trim(), phone: newMemberPhone.trim() || undefined }),
                                });
                                if (!r.ok) throw new Error((await r.json()).message);
                                const member = await r.json();
                                setSelectedLoyaltyMember(member);
                                setShowAddMember(false);
                                setNewMemberName("");
                                setNewMemberPhone("");
                                setLoyaltyMemberSearch("");
                                queryClient.invalidateQueries({ queryKey: ["/api/loyalty/members"] });
                                toast({ title: `เพิ่มสมาชิก ${member.name} (${member.memberCode}) สำเร็จ`, variant: "success" as any });
                              } catch (err: any) {
                                toast({ title: "เพิ่มสมาชิกไม่สำเร็จ", description: err.message, variant: "destructive" });
                              }
                            }}
                            data-testid="btn-confirm-add-member"
                          >
                            <Plus className="h-3 w-3 mr-1" /> สร้างสมาชิก
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">ช่องทางชำระเงิน</label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={paymentMethod === "เงินสด" ? "default" : "outline"}
                  className={paymentMethod === "เงินสด" ? "bg-[#05b187] hover:bg-[#05b187]/90" : ""}
                  onClick={() => setPaymentMethod("เงินสด")}
                  data-testid="btn-payment-cash"
                >
                  <Banknote className="h-4 w-4 mr-1" /> เงินสด
                </Button>
                <Button
                  variant={paymentMethod === "โอนเงิน" ? "default" : "outline"}
                  className={paymentMethod === "โอนเงิน" ? "bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/90" : ""}
                  onClick={() => setPaymentMethod("โอนเงิน")}
                  data-testid="btn-payment-transfer"
                >
                  <QrCode className="h-4 w-4 mr-1" /> โอน/QR
                </Button>
                <Button
                  variant={paymentMethod === "บัตรเครดิต" ? "default" : "outline"}
                  className={paymentMethod === "บัตรเครดิต" ? "bg-[#03c9d7] hover:bg-[#03c9d7]/90" : ""}
                  onClick={() => setPaymentMethod("บัตรเครดิต")}
                  data-testid="btn-payment-card"
                >
                  <CreditCard className="h-4 w-4 mr-1" /> บัตร
                </Button>
              </div>
            </div>

            {paymentMethod === "โอนเงิน" && (
              <PromptPayQRSection companyId={selectedCompanyId} amount={total} />
            )}

            {paymentMethod === "เงินสด" && (
              <div>
                <label className="text-sm font-medium mb-2 block">รับเงินสด (บาท)</label>
                <Input
                  type="number"
                  className="h-14 text-2xl text-center font-bold"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  data-testid="input-cash-received"
                />
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {quickCashButtons.map(amount => (
                    <Button
                      key={amount}
                      variant="outline"
                      size="sm"
                      onClick={() => setCashReceived(String(amount))}
                      data-testid={`btn-quick-cash-${amount}`}
                    >
                      ฿{amount}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-[#05b187]/10 border-[#05b187] text-[#05b187] hover:bg-[#05b187]/20"
                    onClick={() => setCashReceived(String(total))}
                    data-testid="btn-exact-amount"
                  >
                    พอดี ฿{total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCashReceived(String(Math.ceil(total / 100) * 100))}
                    data-testid="btn-exact-round"
                  >
                    ปัดขึ้น ฿{(Math.ceil(total / 100) * 100).toLocaleString()}
                  </Button>
                </div>
                {parseFloat(cashReceived || "0") >= total && (
                  <div className="text-center mt-3 p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-gray-500">เงินทอน</p>
                    <p className="text-3xl font-bold text-green-600" data-testid="text-change">
                      ฿{changeAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border rounded-lg p-3 space-y-2" data-testid="section-full-tax-invoice">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={wantFullTaxInvoice}
                onChange={(e) => {
                  setWantFullTaxInvoice(e.target.checked);
                  if (e.target.checked && selectedLoyaltyMember) {
                    setTaxCustomerName(selectedLoyaltyMember.name || "");
                    setTaxPhone(selectedLoyaltyMember.phone || "");
                    setTaxEmail(selectedLoyaltyMember.email || "");
                    setTaxAddress(selectedLoyaltyMember.address || "");
                    setTaxId(selectedLoyaltyMember.taxId || "");
                  }
                }}
                className="w-4 h-4 accent-[#fb9678]"
                data-testid="checkbox-full-tax"
              />
              <Receipt className="w-4 h-4 text-[#fb9678]" />
              <span className="text-sm font-medium">ออกใบกำกับภาษีเต็มรูป</span>
            </label>
            {wantFullTaxInvoice && (
              <div className="grid grid-cols-1 gap-2 mt-2">
                <Input
                  placeholder="ชื่อ-นามสกุล / ชื่อบริษัท *"
                  value={taxCustomerName}
                  onChange={(e) => setTaxCustomerName(e.target.value)}
                  data-testid="input-tax-customer-name"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="เลขประจำตัวผู้เสียภาษี *"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    data-testid="input-tax-id"
                  />
                  <Input
                    placeholder="สาขา (เว้นว่าง = สำนักงานใหญ่)"
                    value={taxBranchId}
                    onChange={(e) => setTaxBranchId(e.target.value)}
                    data-testid="input-tax-branch-id"
                  />
                </div>
                <Input
                  placeholder="ที่อยู่"
                  value={taxAddress}
                  onChange={(e) => setTaxAddress(e.target.value)}
                  data-testid="input-tax-address"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="โทรศัพท์"
                    value={taxPhone}
                    onChange={(e) => setTaxPhone(e.target.value)}
                    data-testid="input-tax-phone"
                  />
                  <Input
                    placeholder="อีเมล"
                    value={taxEmail}
                    onChange={(e) => setTaxEmail(e.target.value)}
                    data-testid="input-tax-email"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayment(false)}>ยกเลิก</Button>
            <Button
              className="bg-[#05b187] hover:bg-[#05b187]/90 h-12 px-8 text-lg"
              disabled={completeSaleMutation.isPending || (paymentMethod === "เงินสด" && parseFloat(cashReceived || "0") < total) || (wantFullTaxInvoice && (!taxCustomerName || !taxId))}
              onClick={handleCompleteSale}
              data-testid="btn-confirm-payment"
            >
              {completeSaleMutation.isPending ? "กำลังบันทึก..." : "ยืนยันชำระเงิน"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={showReceipt} onOpenChange={setShowReceipt}>
        <DialogContent className="max-w-[360px] max-h-[90vh] overflow-y-auto overflow-x-hidden" data-testid="dialog-receipt">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">ขายสำเร็จ!</DialogTitle>
          </DialogHeader>
          {lastTransaction && (
            <div className="w-full space-y-3">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Receipt className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-sm text-gray-500">เลขที่รายการ</p>
                <p className="font-bold text-lg">{lastTransaction.transaction?.transactionNo}</p>
                <p className="text-sm text-gray-500 mt-2">ใบกำกับภาษีเลขที่</p>
                <p className="font-bold">{lastTransaction.taxInvoice?.taxInvoiceNo}</p>
              </div>
              <div className="w-full space-y-1 text-sm border-t pt-2">
                <div className="flex items-center justify-between w-full">
                  <span>ยอดรวม</span>
                  <span className="font-bold">฿{parseFloat(String(lastTransaction.transaction?.total || "0")).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
                {lastTransaction.transaction?.paymentMethod === "เงินสด" && (
                  <>
                    <div className="flex items-center justify-between w-full">
                      <span>รับเงิน</span>
                      <span>฿{parseFloat(String(lastTransaction.transaction?.cashReceived || "0")).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex items-center justify-between w-full font-bold text-green-600">
                      <span>เงินทอน</span>
                      <span>฿{parseFloat(String(lastTransaction.transaction?.changeAmount || "0")).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                    </div>
                  </>
                )}
                {lastTransaction.loyaltyEarned && (
                  <div className="flex items-center justify-between w-full text-amber-600">
                    <span><Star className="h-3 w-3 inline mr-1" />แต้มที่ได้รับ</span>
                    <span className="font-bold">+{lastTransaction.loyaltyEarned} แต้ม</span>
                  </div>
                )}
                {lastTransaction.loyaltyTotal !== undefined && lastTransaction.loyaltyTotal !== null && (
                  <div className="flex items-center justify-between w-full text-amber-500 text-xs">
                    <span>แต้มสะสมรวม</span>
                    <span>{lastTransaction.loyaltyTotal} แต้ม</span>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 w-full">
            <Button
              variant="outline"
              className="w-full gap-1.5 border-purple-400 text-purple-600 hover:bg-purple-50"
              onClick={() => handleBtPreviewReceipt(lastTransaction)}
              disabled={btPrinting}
              data-testid="btn-bt-preview-receipt"
            >
              <Eye className="h-4 w-4 shrink-0" />
              <span className="truncate">{btPrinting ? "กำลังสร้าง..." : "พรีวิว Bluetooth"}</span>
            </Button>
            <Button
              variant="outline"
              className="w-full gap-1.5 border-cyan-400 text-cyan-600 hover:bg-cyan-50"
              onClick={() => {
                if (lastTransaction?.taxInvoice?.id) {
                  window.open(`/pos/receipt/${lastTransaction.taxInvoice.id}`, "_blank");
                }
              }}
              data-testid="btn-preview-html-receipt"
            >
              <Eye className="h-4 w-4 shrink-0" />
              <span className="truncate">พรีวิว HTML</span>
            </Button>
            {btConnected && (
              <Button
                variant="default"
                className="w-full gap-1.5 bg-blue-500 hover:bg-blue-600"
                onClick={() => handleBtPrintReceipt(lastTransaction)}
                disabled={btPrinting}
                data-testid="btn-bt-print-receipt"
              >
                <BluetoothConnected className="h-4 w-4 shrink-0" />
                <span className="truncate">{btPrinting ? "กำลังพิมพ์..." : `พิมพ์ Bluetooth (${btPrinterName})`}</span>
              </Button>
            )}
            {!btConnected && isWebBluetoothSupported() && (
              <Button variant="outline" className="w-full gap-1.5 border-blue-400 text-blue-600" onClick={handleBtConnect} data-testid="btn-receipt-bt-connect">
                <Bluetooth className="h-4 w-4 shrink-0" /> เชื่อมต่อ Bluetooth Printer
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => {
              if (lastTransaction?.taxInvoice?.id) {
                window.open(`/pos/receipt/${lastTransaction.taxInvoice.id}`, "_blank");
              }
            }} data-testid="btn-print-receipt">
              <Receipt className="h-4 w-4 mr-2 shrink-0" /> พิมพ์ใบกำกับภาษีอย่างย่อ
            </Button>
            <Button variant="outline" className="w-full" onClick={() => {
              if (lastTransaction?.taxInvoice?.id) {
                window.open(`/sales/tax-invoice/pdf/${lastTransaction.taxInvoice.id}`, "_blank");
              }
            }} data-testid="btn-print-full-tiv">
              <Receipt className="h-4 w-4 mr-2 shrink-0" /> พิมพ์ใบกำกับภาษีเต็มรูป
            </Button>
            <Button className="w-full bg-[#fb9678] hover:bg-[#fb9678]/90" onClick={() => {
              setShowReceipt(false);
              setLastTransaction(null);
              searchRef.current?.focus();
            }} data-testid="btn-next-sale">
              ขายรายการถัดไป
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showBtPreview} onOpenChange={setShowBtPreview}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-sm">
          <DialogHeader>
            <DialogTitle>พรีวิวใบเสร็จ</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center bg-gray-100 rounded p-3">
            {btPreviewImage && (
              <img
                src={btPreviewImage}
                alt="receipt preview"
                style={{ width: (getSavedPrinterConfig()?.paperWidth || 58) === 58 ? "240px" : "320px", imageRendering: "auto" }}
                className="shadow-md rounded"
                data-testid="img-bt-receipt-preview"
              />
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowBtPreview(false)} data-testid="btn-close-bt-preview">
              ปิด
            </Button>
            {btConnected && (
              <Button
                onClick={() => handleBtPrintReceipt(lastTransaction)}
                className="gap-1.5 bg-blue-500 hover:bg-blue-600"
                disabled={btPrinting}
                data-testid="btn-bt-preview-print"
              >
                <BluetoothConnected className="h-4 w-4" />
                {btPrinting ? "กำลังพิมพ์..." : "สั่งพิมพ์"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLoyaltyQR} onOpenChange={setShowLoyaltyQR}>
        <DialogContent className="max-w-xs" data-testid="dialog-loyalty-qr">
          <DialogHeader>
            <DialogTitle className="text-center text-lg">
              <Star className="h-5 w-5 inline mr-2 text-amber-500" />
              QR สมัครสมาชิก
            </DialogTitle>
          </DialogHeader>
          <div className="text-center space-y-3">
            {loyaltyQRUrl ? (
              <div className="bg-white border-2 border-amber-300 rounded-xl p-4 inline-block">
                <img src={loyaltyQRUrl} alt="Loyalty QR" className="w-64 h-64 mx-auto" data-testid="img-loyalty-qr" />
              </div>
            ) : (
              <div className="w-64 h-64 mx-auto flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full" />
              </div>
            )}
            <p className="text-sm text-gray-600 font-medium">{selectedCompany?.name}</p>
            <p className="text-xs text-gray-400">ให้ลูกค้าสแกน QR Code เพื่อสมัครสมาชิกสะสมแต้ม</p>
            {activeProgram && (
              <p className="text-xs text-amber-600">
                <Star className="h-3 w-3 inline mr-1 fill-amber-400" />
                ทุก ฿{activeProgram.spendAmount} ได้ {activeProgram.pointsPerSpend} แต้ม
              </p>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 border-[#03c9d7] text-[#03c9d7]" onClick={() => {
                if (!loyaltyQRUrl) return;
                const a = document.createElement("a");
                a.href = loyaltyQRUrl;
                a.download = `loyalty-qr-${selectedCompanyId}.png`;
                a.click();
              }} data-testid="btn-download-qr">
                <Download className="h-4 w-4 mr-1" />ดาวน์โหลด
              </Button>
              <Button variant="outline" className="flex-1 border-[#05b187] text-[#05b187]" onClick={() => {
                const url = `${window.location.origin}/loyalty/signup?c=${selectedCompanyId}`;
                navigator.clipboard.writeText(url);
                toast({ title: "คัดลอกลิงก์แล้ว" });
              }} data-testid="btn-copy-link">
                <Copy className="h-4 w-4 mr-1" />คัดลอกลิงก์
              </Button>
            </div>
            <Button variant="outline" className="w-full" onClick={() => setShowLoyaltyQR(false)}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bundleCustomizeProduct} onOpenChange={(open) => { if (!open) { setBundleCustomizeProduct(null); setBundleSlots([]); setBundleSelections({}); setBundleFilter(""); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5 text-[#fb9678]" />
              เลือกสินค้าในชุด: {bundleCustomizeProduct?.name}
            </DialogTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">ราคาชุด ฿{Number(bundleCustomizeProduct?.price || 0).toLocaleString()}</Badge>
              <span className="text-[10px] text-slate-400">* ตัวเลือกด้านล่างไม่คิดราคาแยก — คิดเป็นราคาชุดเดียว</span>
            </div>
            {!bundleLoading && bundleSlots.length > 0 && (() => {
              const fixedItems = bundleSlots.filter((s: any) => !s.slotGroup);
              const slotGroups = [...new Set(bundleSlots.filter((s: any) => s.slotGroup).map((s: any) => s.slotGroup))] as string[];
              const parts: string[] = [];
              for (const fi of fixedItems) {
                parts.push(`${fi.productName} x${fi.qty}`);
              }
              for (const sg of slotGroups) {
                const slot = bundleSlots.find((s: any) => s.slotGroup === sg);
                const qty = Number(slot?.qty) || 1;
                parts.push(`${sg} x${qty}`);
              }
              const totalPieces = fixedItems.reduce((s: number, fi: any) => s + Number(fi.qty || 1), 0) +
                slotGroups.reduce((s: number, sg: string) => {
                  const slot = bundleSlots.find((sl: any) => sl.slotGroup === sg);
                  return s + (Number(slot?.qty) || 1);
                }, 0);
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-2">
                  <p className="text-xs font-bold text-blue-700 mb-1">สูตรชุด ({totalPieces} ชิ้น)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parts.map((p, i) => (
                      <Badge key={i} variant="outline" className="text-[11px] border-blue-300 text-blue-600 bg-white px-2 py-0.5">{p}</Badge>
                    ))}
                  </div>
                </div>
              );
            })()}
          </DialogHeader>
          {bundleLoading ? (
            <div className="text-center py-8 text-gray-400">กำลังโหลด...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="md:col-span-3 space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    ref={bundleInputRef}
                    className="pl-9 pr-20 h-9 text-sm"
                    data-testid="input-bundle-barcode"
                    placeholder="พิมพ์ชื่อ/รหัส/บาร์โค้ด เพื่อค้นหาหรือกด Enter เพื่อเลือก..."
                    autoComplete="off"
                    autoFocus
                    value={bundleFilter}
                    onChange={e => setBundleFilter(e.target.value)}
                    onKeyDown={e => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const raw = bundleFilter.trim().replace(/^\*+|\*+$/g, "");
                      if (!raw) return;
                      const cleaned = thaiToEng(raw);
                      scanBundleComponent(cleaned);
                      setBundleFilter("");
                      setTimeout(() => bundleInputRef.current?.focus(), 50);
                    }}
                  />
                  {bundleFilter && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setBundleFilter("")}>
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {(() => {
                  const fl = bundleFilter.trim().toLowerCase();
                  const fixedItems = bundleSlots.filter((s: any) => !s.slotGroup);
                  const slotGroups = [...new Set(bundleSlots.filter((s: any) => s.slotGroup).map((s: any) => s.slotGroup))] as string[];
                  return (
                    <>
                      {fixedItems.length > 0 && !fl && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-2">สินค้าตายตัว (ไม่สามารถเปลี่ยนได้)</p>
                          {fixedItems.map((fi: any) => (
                            <div key={fi.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded mb-1">
                              <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                              <span className="text-sm flex-1">{fi.productName}</span>
                              <span className="text-xs text-slate-400">x{fi.qty}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {slotGroups.map(sg => {
                        const allOptions = bundleSlots.filter((s: any) => s.slotGroup === sg);
                        const options = fl ? allOptions.filter((opt: any) =>
                          opt.productName?.toLowerCase().includes(fl) ||
                          opt.productCode?.toLowerCase().includes(fl) ||
                          opt.productBarcode?.toLowerCase().includes(fl)
                        ) : allOptions;
                        if (fl && options.length === 0) return null;
                        const slotQty = Number(allOptions[0]?.qty) || 1;

                        const allKeys: string[] = [];
                        if (slotQty > 1) {
                          for (let i = 1; i <= slotQty; i++) allKeys.push(`${sg}__${i}`);
                        } else {
                          allKeys.push(sg);
                        }
                        const emptySlots = allKeys.filter(k => !bundleSelections[k]).length;

                        return (
                          <div key={sg}>
                            <p className="text-xs font-semibold text-blue-600 mb-2 flex items-center gap-1">
                              <Package className="h-3.5 w-3.5" />
                              {sg}
                              <span className="text-slate-400 font-normal ml-1">({options.length} ตัวเลือก)</span>
                              {slotQty > 1 && <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">เลือก {slotQty} ชิ้น</Badge>}
                              {emptySlots === 0 && <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">ครบแล้ว</Badge>}
                            </p>
                            <div className="grid gap-1.5">
                              {options.map((opt: any) => {
                                const usedCount = Object.entries(bundleSelections).filter(([k, v]) => {
                                  const baseSg = k.includes("__") ? k.split("__")[0] : k;
                                  return baseSg === sg && v === opt.componentProductId;
                                }).length;

                                return (
                                  <button
                                    key={opt.id}
                                    data-testid={`bundle-opt-${opt.componentProductId}`}
                                    onClick={() => {
                                      scanBundleComponent(opt.productCode || opt.productName);
                                      setTimeout(() => bundleInputRef.current?.focus(), 50);
                                    }}
                                    className={`flex items-center gap-3 p-2.5 rounded-lg border-2 transition-all text-left ${
                                      emptySlots === 0
                                        ? "border-gray-100 bg-gray-50 opacity-60"
                                        : "border-gray-200 bg-white hover:border-[#fb9678] hover:bg-orange-50"
                                    }`}
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-slate-500">
                                      {usedCount > 0 ? (
                                        <span className="text-green-600">{usedCount}</span>
                                      ) : (
                                        <Plus className="h-4 w-4 text-slate-400" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{opt.productName}</p>
                                      <p className="text-[10px] text-slate-400">{opt.productCode}</p>
                                    </div>
                                    {usedCount > 0 && (
                                      <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1.5 py-0">
                                        เลือกแล้ว{usedCount > 1 ? ` x${usedCount}` : ""}
                                      </Badge>
                                    )}
                                    {opt.isDefault && usedCount === 0 && (
                                      <Badge variant="outline" className="text-[10px] border-yellow-400 text-yellow-600 px-1.5 py-0">แนะนำ</Badge>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {slotGroups.length === 0 && fixedItems.length === 0 && (
                        <div className="text-center py-6 text-gray-400 text-sm">ชุดนี้ยังไม่ได้ตั้งค่ารายการสินค้า</div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div className="md:col-span-2">
                <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 sticky top-0">
                  <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-[#fb9678]" />
                    สรุปสินค้าในชุด
                  </p>
                  {(() => {
                    const fixedItems = bundleSlots.filter((s: any) => !s.slotGroup);
                    const slotGroups = [...new Set(bundleSlots.filter((s: any) => s.slotGroup).map((s: any) => s.slotGroup))] as string[];
                    const allKeys: string[] = [];
                    for (const sg of slotGroups) {
                      const slot = bundleSlots.find((s: any) => s.slotGroup === sg);
                      const qty = Number(slot?.qty) || 1;
                      if (qty > 1) {
                        for (let i = 1; i <= qty; i++) allKeys.push(`${sg}__${i}`);
                      } else {
                        allKeys.push(sg);
                      }
                    }
                    const filled = allKeys.filter(k => !!bundleSelections[k]).length;
                    const total = allKeys.length;
                    const allFilled = total > 0 && filled === total;

                    return (
                      <div className="space-y-2">
                        {fixedItems.map((fi: any) => (
                          <div key={fi.id} className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-100">
                            <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{fi.productName}</p>
                              <p className="text-[10px] text-slate-400">ตายตัว</p>
                            </div>
                            <span className="text-xs text-slate-500">x{fi.qty}</span>
                          </div>
                        ))}
                        {allKeys.map(key => {
                          const selectedProdId = bundleSelections[key];
                          const isMulti = key.includes("__");
                          const sgName = isMulti ? key.split("__")[0] : key;
                          const subIdx = isMulti ? key.split("__")[1] : null;
                          const opt = selectedProdId ? bundleSlots.find((s: any) => s.slotGroup === sgName && s.componentProductId === selectedProdId) : null;

                          return (
                            <div key={key} className={`flex items-center gap-2 p-2 rounded-lg border ${
                              opt ? "bg-white border-green-200" : "bg-amber-50 border-dashed border-amber-300"
                            }`}>
                              {opt ? (
                                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border-2 border-amber-400 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                {opt ? (
                                  <>
                                    <p className="text-xs font-medium truncate">{opt.productName}</p>
                                    <p className="text-[10px] text-slate-400">{opt.productCode}</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-xs text-amber-600 font-medium">{sgName}{subIdx ? ` (${subIdx})` : ""}</p>
                                    <p className="text-[10px] text-amber-400">ยังไม่ได้เลือก</p>
                                  </>
                                )}
                              </div>
                              {opt && (
                                <button
                                  className="text-slate-400 hover:text-red-500 transition-colors"
                                  onClick={() => setBundleSelections(prev => { const next = { ...prev }; delete next[key]; return next; })}
                                  data-testid={`bundle-remove-${key}`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        <div className="border-t border-slate-200 pt-3 mt-3">
                          <div className={`text-sm font-bold flex items-center gap-2 mb-3 ${allFilled ? "text-green-600" : "text-amber-600"}`}>
                            {allFilled ? <Check className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                            เลือกแล้ว {filled}/{total} ช่อง
                            {allFilled && <span className="text-xs text-green-500 font-normal ml-1">ครบแล้ว!</span>}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => { setBundleCustomizeProduct(null); setBundleSlots([]); setBundleSelections({}); setBundleFilter(""); }}>ยกเลิก</Button>
                            <Button
                              size="sm"
                              data-testid="btn-confirm-bundle"
                              onClick={confirmBundleSelection}
                              className={`flex-1 ${allFilled ? "bg-green-600 hover:bg-green-700" : "bg-[#fb9678] hover:bg-[#e8856a]"}`}
                            >
                              <ShoppingCart className="h-4 w-4 mr-1" /> เพิ่มลงตะกร้า
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PromptPayQRSection({ companyId, amount }: { companyId: number | null; amount: number }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/pos/promptpay-qr", companyId, amount],
    queryFn: async () => {
      const r = await fetch(`/api/pos/promptpay-qr?companyId=${companyId}&amount=${amount}`, { credentials: "include" });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      return r.json();
    },
    enabled: !!companyId && amount > 0,
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="text-center py-6">
        <div className="animate-spin w-8 h-8 border-2 border-[#03c9d7] border-t-transparent rounded-full mx-auto mb-2" />
        <p className="text-sm text-gray-500">กำลังสร้าง QR Code...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4 px-4 bg-amber-50 rounded-lg border border-amber-200">
        <QrCode className="h-8 w-8 mx-auto mb-2 text-amber-400" />
        <p className="text-sm text-amber-700">{(error as any).message}</p>
        <p className="text-xs text-amber-500 mt-1">ตั้งค่าได้ที่ ตั้งค่า &gt; เอกสาร &gt; โลโก้ &gt; พร้อมเพย์</p>
      </div>
    );
  }

  if (!data?.qrImage) return null;

  const typeLabel = data.promptpayType === "phone" ? "เบอร์โทร" : data.promptpayType === "citizen_id" ? "บัตรประชาชน" : "เลขผู้เสียภาษี";
  const maskedId = data.promptpayId.length > 4
    ? data.promptpayId.slice(0, 3) + "****" + data.promptpayId.slice(-3)
    : data.promptpayId;

  return (
    <div className="text-center space-y-2" data-testid="promptpay-qr-section">
      <div className="bg-white border-2 border-[#03c9d7] rounded-xl p-4 inline-block mx-auto">
        <div className="flex items-center justify-center gap-2 mb-2">
          <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/PromptPay-logo.png/320px-PromptPay-logo.png" alt="PromptPay" className="h-5" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <span className="text-sm font-semibold" style={{ color: "#03c9d7" }}>PromptPay</span>
        </div>
        <img src={data.qrImage} alt="PromptPay QR" className="w-56 h-56 mx-auto" data-testid="img-promptpay-qr" />
        <div className="mt-2 text-xs text-gray-500">{typeLabel}: {maskedId}</div>
      </div>
      <div className="bg-[#03c9d7]/10 rounded-lg py-2 px-4">
        <p className="text-xs text-gray-500">ยอดชำระ</p>
        <p className="text-2xl font-bold" style={{ color: "#03c9d7" }}>฿{amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>
      </div>
      <p className="text-xs text-gray-400">สแกน QR Code ด้วยแอปธนาคารเพื่อชำระเงิน</p>
    </div>
  );
}
