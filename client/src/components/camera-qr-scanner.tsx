/**
 * CameraQrScanner
 * Modal overlay that opens the device camera and scans QR codes using jsQR.
 * Designed for mobile devices — hidden on desktop via CSS by the parent.
 *
 * Usage:
 *   <CameraQrScanner open={open} onClose={() => setOpen(false)} onScan={raw => processQr(raw)} />
 */

import { useEffect, useRef, useState, useCallback } from "react";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";
import { X, Camera, Loader2, Flashlight, FlashlightOff, ZoomIn, ZoomOut } from "lucide-react";

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

  // Torch state
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // Zoom state
  const [zoom, setZoom] = useState(1);
  const [zoomMin, setZoomMin] = useState(1);
  const [zoomMax, setZoomMax] = useState(1);
  const [zoomStep, setZoomStep] = useState(0.5);
  const [zoomSupported, setZoomSupported] = useState(false);

  // Pinch-to-zoom state
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);

  const getVideoTrack = (): MediaStreamTrack | null => {
    return streamRef.current?.getVideoTracks()[0] ?? null;
  };

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
    setTorchOn(false);
    setTorchSupported(false);
    setZoomSupported(false);
    setZoom(1);
    setZoomMin(1);
    setZoomMax(1);
  };

  const startCamera = async () => {
    setStatus("loading");
    setErrorMsg(null);
    setTorchOn(false);
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

      // Detect torch and zoom support from track capabilities (defensive — some browsers lack getCapabilities)
      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === "function") {
        try {
          const caps = track.getCapabilities() as MediaTrackCapabilities & {
            torch?: boolean;
            zoom?: { min: number; max: number; step?: number };
          };

          if (caps.torch) {
            setTorchSupported(true);
          }

          if (caps.zoom && caps.zoom.max > caps.zoom.min) {
            setZoomSupported(true);
            const min = caps.zoom.min ?? 1;
            const max = caps.zoom.max ?? 1;
            const step = caps.zoom.step ?? Math.max(0.1, (max - min) / 10);
            setZoomMin(min);
            setZoomMax(max);
            setZoomStep(step);
            setZoom(min);
          }
        } catch {
          // Capabilities API failed — silently ignore, torch/zoom stay hidden
        }
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

  // Toggle torch
  const toggleTorch = async () => {
    const track = getVideoTrack();
    if (!track) return;
    const next = !torchOn;
    try {
      await (track.applyConstraints as (c: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> }) => Promise<void>)({
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch {
      // torch not available on this device after all — hide the button
      setTorchSupported(false);
    }
  };

  // Apply zoom to track
  const applyZoom = useCallback(async (newZoom: number) => {
    const track = getVideoTrack();
    if (!track) return;
    const clamped = Math.min(zoomMax, Math.max(zoomMin, newZoom));
    try {
      await (track.applyConstraints as (c: MediaTrackConstraints & { advanced?: Array<{ zoom?: number }> }) => Promise<void>)({
        advanced: [{ zoom: clamped }],
      });
      setZoom(clamped);
    } catch {
      setZoomSupported(false);
    }
  }, [zoomMin, zoomMax]);

  const handleZoomIn = () => applyZoom(zoom + zoomStep);
  const handleZoomOut = () => applyZoom(zoom - zoomStep);

  // Pinch-to-zoom handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = zoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null && zoomSupported) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchStartDistRef.current;
      applyZoom(pinchStartZoomRef.current * scale);
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
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

  const canZoomIn = zoomSupported && zoom < zoomMax;
  const canZoomOut = zoomSupported && zoom > zoomMin;

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
        <div className="flex items-center gap-1">
          {/* Torch button — only shown when supported */}
          {torchSupported && status === "scanning" && (
            <Button
              variant="ghost"
              size="icon"
              className={`text-white hover:bg-white/20 ${torchOn ? "bg-yellow-500/40 text-yellow-300" : ""}`}
              onClick={toggleTorch}
              data-testid="button-toggle-torch"
              title={torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย"}
            >
              {torchOn ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
            </Button>
          )}
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
      </div>

      {/* Video + canvas */}
      <div
        className="relative flex-1 overflow-hidden flex items-center justify-center bg-black"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        data-testid="camera-video-container"
      >
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

        {/* Zoom controls — shown on the right side when supported */}
        {zoomSupported && status === "scanning" && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 rounded-full"
              onClick={handleZoomIn}
              disabled={!canZoomIn}
              data-testid="button-zoom-in"
              title="ซูมเข้า"
            >
              <ZoomIn className="h-5 w-5" />
            </Button>
            <span
              className="text-white text-xs bg-black/50 rounded px-1 py-0.5 tabular-nums"
              data-testid="text-zoom-level"
            >
              {zoom.toFixed(1)}×
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="bg-black/50 text-white hover:bg-black/70 disabled:opacity-30 rounded-full"
              onClick={handleZoomOut}
              disabled={!canZoomOut}
              data-testid="button-zoom-out"
              title="ซูมออก"
            >
              <ZoomOut className="h-5 w-5" />
            </Button>
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
        {zoomSupported && <span className="ml-1">(Pinch เพื่อซูม)</span>}
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
