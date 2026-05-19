import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download, Loader2 } from "lucide-react";
import Layout from "@/components/layout";

export default function WhtCertPrint() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [certNo, setCertNo] = useState("wht-cert");
  const [loading, setLoading] = useState(true);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [error, setError] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pdfApiUrl = `/api/wht-certs/${id}/pdf`;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/wht-certs/${id}`, { credentials: "include" });
        if (res.ok) {
          const d = await res.json();
          setCertNo(d.certNo || "wht-cert");
        }
      } catch (err: any) {
        setError(err.message || "เกิดข้อผิดพลาด");
      }
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => {
    if (!certNo || certNo === "wht-cert") return;
    const prev = document.title;
    document.title = certNo;
    return () => { document.title = prev; };
  }, [certNo]);

  const handlePrint = () => { iframeRef.current?.contentWindow?.print(); };

  const handleDownload = async () => {
    try {
      const res = await fetch(pdfApiUrl, { credentials: "include" });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${certNo}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {}
  };

  if (loading) return <Layout><div className="flex items-center justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div></Layout>;
  if (error) return <Layout><div className="text-center py-12 text-red-500">{error}</div></Layout>;

  return (
    <Layout>
      <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
        <div className="flex items-center justify-between py-2 flex-shrink-0">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/purchases/wht")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" /> กลับ
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint} data-testid="button-print">
              <Printer className="h-4 w-4" /> พิมพ์
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload} data-testid="button-download">
              <Download className="h-4 w-4" /> ดาวน์โหลด
            </Button>
          </div>
        </div>
        {!iframeLoaded && <div className="flex-1 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>}
        <iframe
          ref={iframeRef}
          src={pdfApiUrl}
          className={`flex-1 w-full border-0 rounded ${iframeLoaded ? "" : "hidden"}`}
          title={certNo}
          onLoad={() => setIframeLoaded(true)}
          data-testid="pdf-iframe"
        />
      </div>
    </Layout>
  );
}
