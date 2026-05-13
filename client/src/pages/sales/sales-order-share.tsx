import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Printer, Download, Loader2, FileText, ExternalLink } from "lucide-react";
import { isAndroid, isIOS, isLineIOS, redirectToChrome } from "@/lib/line-android-redirect";

export default function SalesOrderShare() {
  const { token } = useParams<{ token: string }>();
  const [docNo, setDocNo] = useState("ใบสั่งขาย");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const blobUrlRef = useRef<string>("");

  const android = isAndroid();
  const ios = isIOS();
  const lineIOS = isLineIOS();
  const mobile = android || ios;
  const directPdfUrl = `/api/share/sales-order/${token}/pdf`;

  useEffect(() => {
    redirectToChrome();
    (async () => {
      try {
        const infoRes = await fetch(`/api/share/order/${token}`);
        if (!infoRes.ok) throw new Error("ไม่พบเอกสาร หรือลิงก์หมดอายุ");
        const d = await infoRes.json();
        setDocNo(d.orderNo || d.salesOrderNo || "ใบสั่งขาย");
      } catch (err: any) {
        setError(err.message);
      }
      setLoading(false);
    })();
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); };
  }, [token]);

  const handlePrint = () => {
    if (!iframeRef.current?.contentWindow) return;
    const prev = document.title;
    document.title = docNo;
    setTimeout(() => { document.title = prev; }, 1000);
    iframeRef.current.contentWindow.print();
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      if (ios) {
        window.open(directPdfUrl, "_blank");
      } else {
        const res = await fetch(directPdfUrl);
        if (!res.ok) throw new Error("สร้าง PDF ไม่สำเร็จ");
        const blob = await res.blob();
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = URL.createObjectURL(new File([blob], `${docNo}.pdf`, { type: "application/pdf" }));
        const a = document.createElement("a");
        a.href = blobUrlRef.current;
        a.download = `${docNo}.pdf`;
        a.click();
      }
    } catch {}
    setDownloading(false);
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-slate-500"><Loader2 className="h-6 w-6 animate-spin mr-2" />กำลังโหลด...</div>;
  if (error) return <div className="flex items-center justify-center min-h-screen text-red-500 px-6 text-center">{error}</div>;

  return (
    <div className="flex flex-col min-h-screen bg-slate-700">
      <div className="sticky top-0 z-50 bg-slate-800 border-b border-slate-600 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white min-w-0">
          <FileText className="h-5 w-5 text-green-400 flex-shrink-0" />
          <span className="text-sm font-medium truncate">{docNo}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!mobile && (
            <Button variant="ghost" size="sm" onClick={handlePrint} className="text-slate-300 hover:text-white hover:bg-slate-700 gap-1.5 h-8 text-xs" data-testid="button-print">
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">พิมพ์</span>
            </Button>
          )}
          <Button size="sm" onClick={handleDownload} disabled={downloading} className="bg-green-700 hover:bg-green-800 text-white gap-1.5 h-8 text-xs" data-testid="button-download-pdf">
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">{downloading ? "กำลังสร้าง..." : "ดาวน์โหลด PDF"}</span>
            <span className="sm:hidden">{downloading ? "..." : "PDF"}</span>
          </Button>
        </div>
      </div>

      {android ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 p-8">
          <FileText className="h-20 w-20 text-slate-400" />
          <div className="text-center">
            <div className="text-white text-lg font-medium mb-1">{docNo}</div>
            <div className="text-slate-400 text-sm">กดปุ่มด้านล่างเพื่อเปิดไฟล์ PDF</div>
          </div>
          <Button size="lg" onClick={handleDownload} disabled={downloading} className="bg-green-700 hover:bg-green-800 text-white gap-2 px-8 py-3 text-base" data-testid="button-download-pdf-android">
            {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            {downloading ? "กำลังโหลด..." : "เปิด PDF"}
          </Button>
        </div>
      ) : ios ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 p-8">
          <FileText className="h-20 w-20 text-slate-400" />
          <div className="text-center">
            <div className="text-white text-lg font-medium mb-1">{docNo}</div>
            <div className="text-slate-400 text-sm mb-2">กดปุ่มด้านล่างเพื่อเปิดหรือดาวน์โหลด PDF</div>
            {lineIOS && <div className="text-slate-500 text-xs">หากเปิดไม่ได้ ให้กด ··· แล้วเลือก "เปิดใน Safari"</div>}
          </div>
          <a
            href={directPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-8 py-3 rounded-lg text-base font-semibold"
            data-testid="button-open-pdf-ios"
          >
            <ExternalLink className="h-5 w-5" />
            เปิด PDF
          </a>
        </div>
      ) : (
        <iframe ref={iframeRef} src={directPdfUrl} className="flex-1 w-full border-0" title={docNo} data-testid="pdf-iframe" />
      )}
    </div>
  );
}
