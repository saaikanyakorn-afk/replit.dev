/**
 * CameraQrScanner
 * Modal overlay that opens the device camera and scans QR codes using jsQR.
 * Designed for mobile devices — hidden on desktop via CSS by the parent.
 *
 * Usage:
 *   <CameraQrScanner open={open} onClose={() => setOpen(false)} onScan={raw => processQr(raw)} />
 */

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { X, Camera, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onScan: (rawValue: string) => void;
  title?: string;
}

export function CameraQrScanner({ open, onClose, onScan, title = "สแกน QR ด้วยกล้อง" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "scanning" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const stopCamera = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async () => {
    setStatus("loading");
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
      }
      setStatus("scanning");
      scanFrame();
    } catch (err: unknown) {
      const errName = err instanceof Error ? (err as { name?: string }).name : undefined;
      const errMsg = err instanceof Error ? err.message : String(err);
      const msg = errName === "NotAllowedError"
        ? "ไม่ได้รับอนุญาตให้เข้าถึงกล้อง — กรุณาอนุญาตสิทธิ์กล้องในเบราว์เซอร์"
        : errName === "NotFoundError"
          ? "ไม่พบกล้องในอุปกรณ์นี้"
          : `เปิดกล้องไม่สำเร็จ: ${errMsg}`;
      setErrorMsg(msg);
      setStatus("error");
    }
  };

  const scanFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
    if (code && code.data) {
      stopCamera();
      onScan(code.data);
      onClose();
      return;
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  };

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
      setStatus("idle");
      setErrorMsg(null);
    }
    return () => stopCamera();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      data-testid="camera-qr-scanner-overlay"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          <span className="font-medium text-sm">{title}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20"
          onClick={() => { stopCamera(); onClose(); }}
          data-testid="button-close-camera"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Video + canvas */}
      <div className="relative flex-1 overflow-hidden flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
          data-testid="camera-video"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Scan frame overlay */}
        {status === "scanning" && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-64 h-64">
              {/* Corner brackets */}
              <span className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-green-400 rounded-tl" />
              <span className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-green-400 rounded-tr" />
              <span className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-green-400 rounded-bl" />
              <span className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-green-400 rounded-br" />
              {/* Scanning line animation */}
              <div className="absolute left-1 right-1 h-0.5 bg-green-400 opacity-80 animate-[scan_2s_linear_infinite]" />
            </div>
          </div>
        )}

        {/* Loading state */}
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-white gap-3">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">กำลังเปิดกล้อง...</p>
          </div>
        )}

        {/* Error state */}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-4 px-6">
            <Camera className="h-12 w-12 text-red-400" />
            <p className="text-center text-sm text-red-300">{errorMsg}</p>
            <Button
              variant="outline"
              className="text-white border-white hover:bg-white/20"
              onClick={startCamera}
              data-testid="button-retry-camera"
            >
              ลองอีกครั้ง
            </Button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-3 bg-black/80 text-center text-white/70 text-xs">
        เล็งกล้องไปที่ QR Code — ระบบจะสแกนอัตโนมัติ
      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 4px; }
          50%  { top: calc(100% - 4px); }
          100% { top: 4px; }
        }
      `}</style>
    </div>
  );
}
