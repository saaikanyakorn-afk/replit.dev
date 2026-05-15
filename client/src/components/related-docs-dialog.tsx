import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompany } from "@/lib/company-context";
import { FileText, Receipt, FileCheck, BookOpen, ShoppingCart, ClipboardList, Loader2, ExternalLink, ShoppingBag, Scale, Paperclip, FileX } from "lucide-react";

interface RelatedDoc {
  type: string;
  id: number;
  docNo: string;
  date: string;
  status: string;
  totalAmount: string;
  attachedUrl?: string;
}

const docTypeConfig: Record<string, { label: string; icon: any; color: string; listPath: string; searchParam: string; editPath?: string }> = {
  quotation: { label: "ใบเสนอราคา", icon: ClipboardList, color: "#fec90f", listPath: "/sales/quote", searchParam: "quotationNo", editPath: "/sales/quote/edit/" },
  sales_order: { label: "ใบสั่งขาย", icon: ShoppingCart, color: "#fb9678", listPath: "/sales/order", searchParam: "orderNo", editPath: "/sales/order/edit/" },
  invoice: { label: "ใบแจ้งหนี้", icon: FileText, color: "#05b187", listPath: "/sales/invoice", searchParam: "invoiceNo", editPath: "/sales/invoice/edit/" },
  tax_invoice: { label: "ใบกำกับภาษี", icon: FileCheck, color: "var(--theme-primary)", listPath: "/sales/tax-invoice", searchParam: "taxInvoiceNo", editPath: "/sales/tax-invoice/edit/" },
  receipt: { label: "ใบเสร็จรับเงิน", icon: Receipt, color: "#03c9d7", listPath: "/sales/receipt", searchParam: "receiptNo", editPath: "/sales/receipt/edit/" },
  journal: { label: "บันทึกบัญชี", icon: BookOpen, color: "#fb9678", listPath: "/journal", searchParam: "reference", editPath: "/journal/edit/" },
  purchase_request: { label: "ใบขอซื้อ", icon: ShoppingBag, color: "#fb9678", listPath: "/purchases/pr", searchParam: "prNo", editPath: "/purchases/pr/edit/" },
  bid_comparison: { label: "เปรียบเทียบราคา", icon: Scale, color: "#fec90f", listPath: "/purchases/bid", searchParam: "bidNo", editPath: "/purchases/bid/edit/" },
  purchase_order: { label: "ใบสั่งซื้อ", icon: ClipboardList, color: "#05b187", listPath: "/purchases/po", searchParam: "poNo", editPath: "/purchases/po/edit/" },
  purchase_invoice: { label: "เอกสารซื้อ", icon: FileText, color: "var(--theme-primary)", listPath: "/purchases/invoice", searchParam: "apNo" },
  expense: { label: "รายจ่ายอื่น", icon: Receipt, color: "#03c9d7", listPath: "/purchases/expense", searchParam: "expNo" },
  purchase_debit_note: { label: "ใบลดหนี้ซื้อ", icon: FileText, color: "#f94d4d", listPath: "/purchases/debit-note", searchParam: "debitNoteNo", editPath: "/purchases/debit-note/edit/" },
  billing_note: { label: "ใบวางบิล", icon: FileText, color: "#fec90f", listPath: "/finance/billing-notes", searchParam: "billingNo" },
  credit_note: { label: "ใบลดหนี้", icon: FileX, color: "#dc2626", listPath: "/sales/credit-note", searchParam: "creditNoteNo", editPath: "/sales/credit-note/edit/" },
  payment_voucher: { label: "ใบสำคัญจ่าย", icon: Receipt, color: "#03c9d7", listPath: "/finance/ap-billing", searchParam: "pvNo" },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  draft: { label: "ร่าง", color: "#94a3b8" },
  approved: { label: "อนุมัติ", color: "#05b187" },
  sent: { label: "ส่งแล้ว", color: "var(--theme-primary)" },
  paid: { label: "ชำระแล้ว", color: "#05b187" },
  cancelled: { label: "ยกเลิก", color: "#f94d4d" },
  voided: { label: "ยกเลิก", color: "#f94d4d" },
  accepted: { label: "ตอบรับ", color: "#05b187" },
  rejected: { label: "ปฏิเสธ", color: "#f94d4d" },
  pending: { label: "รออนุมัติ", color: "#fec90f" },
  partial: { label: "บางส่วน", color: "#fec90f" },
  issued: { label: "ออกแล้ว", color: "#05b187" },
  confirmed: { label: "ยืนยัน", color: "#05b187" },
  received: { label: "รับแล้ว", color: "#05b187" },
  selected: { label: "เลือกแล้ว", color: "#05b187" },
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val || "0"));
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


export default function RelatedDocsDialog({
  open,
  onOpenChange,
  docType,
  docId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docType: string;
  docId: number;
}) {
  const [, navigate] = useLocation();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;
  const [related, setRelated] = useState<RelatedDoc[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !docId || !companyId) return;
    setLoading(true);
    setRelated([]);
    (async () => {
      try {
        const res = await fetch(`/api/related-documents/${docType}/${docId}?companyId=${companyId}`, { credentials: "include", cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setRelated(data || []);
        }
      } catch {}
      setLoading(false);
    })();
  }, [open, docType, docId, companyId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="related-docs-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#03c9d7]/10">
              <ExternalLink className="w-4 h-4 text-[#03c9d7]" />
            </div>
            เอกสารที่เกี่ยวข้อง
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-[#03c9d7]" />
            <span className="ml-2 text-sm text-slate-500">กำลังโหลด...</span>
          </div>
        )}

        {!loading && related.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            ไม่พบเอกสารที่เกี่ยวข้อง
          </div>
        )}

        {!loading && related.length > 0 && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {related.map((doc, idx) => {
              const config = docTypeConfig[doc.type];
              if (!config) return null;
              const Icon = config.icon;
              const statusInfo = statusLabels[doc.status] || { label: doc.status, color: "#94a3b8" };

              return (
                <button
                  key={`${doc.type}-${doc.id}-${idx}`}
                  data-testid={`related-link-${doc.type}-${doc.id}`}
                  onClick={() => {
                    onOpenChange(false);
                    if (doc.type === "payment_voucher") {
                      navigate(`${config.listPath}?companyId=${companyId}&apId=${docId}`);
                    } else {
                      navigate(`${config.listPath}?companyId=${companyId}&${config.searchParam}=${encodeURIComponent(doc.docNo)}`);
                    }
                  }}
                  className="w-full flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 hover:bg-gray-100 hover:border-gray-200 transition-colors text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: config.color + "20" }}
                    >
                      <Icon className="w-4 h-4" style={{ color: config.color }} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-400">{config.label}</div>
                      <div className="text-sm font-medium text-[#e8734e] group-hover:underline truncate">{doc.docNo || `#${doc.id}`}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {doc.attachedUrl && (
                      <button
                        data-testid={`related-attach-${doc.type}-${doc.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const url = doc.attachedUrl!.split(",")[0]?.trim();
                          if (url) window.open(url, "_blank");
                        }}
                        className="w-6 h-6 rounded-full flex items-center justify-center bg-purple-50 hover:bg-purple-100 transition-colors"
                        title="เอกสารแนบ"
                      >
                        <Paperclip className="w-3 h-3 text-purple-500" />
                      </button>
                    )}
                    {doc.type !== "journal" && (
                      <span className="text-sm text-gray-600 tabular-nums">{fmt(doc.totalAmount)}</span>
                    )}
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: statusInfo.color + "20", color: statusInfo.color }}
                    >
                      {statusInfo.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
