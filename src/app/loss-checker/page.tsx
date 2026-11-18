"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Camera, QrCode, Trash2, X } from "lucide-react";
import { AppShell, AppShellUser } from "@/components/AppShell";
import { fetchActorCached } from "@/lib/client-cache";
import { formatWeight3 } from "@/lib/decimal";
import {
  CANONICAL_PROCESS_SEQUENCE,
  PROCESS_DISPLAY_LABELS,
  ProcessType,
} from "@/lib/domain/types";

interface LossCheckProcess {
  processType: ProcessType;
  karigarId: string | null;
  karigarName: string;
  status: string;
  issuedMetalWeight: string;
  returnedMetalWeight: string;
  extraReturnedMetalWeight: string;
  closedLossWeight: string;
  fineLossWeight: string;
}

interface LossCheckOrder {
  order: {
    id: string;
    bagNumber: string;
    orderName: string;
    customerName: string;
    customerCode: string;
    purityId: string;
    purityLabel: string;
    karatLabel: string;
    touchPercent: string;
    status: string;
    totalRawLossWeight: string;
    totalFineLossWeight: string;
  };
  processes: LossCheckProcess[];
}

export default function QrLossCheckerPage() {
  const router = useRouter();
  const [actor, setActor] = useState<AppShellUser | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [loadingScan, setLoadingScan] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [scannedBags, setScannedBags] = useState<LossCheckOrder[]>([]);

  // View filters (client-side only, never saves to DB)
  const [processFilter, setProcessFilter] = useState<"ALL" | ProcessType>("ALL");
  const [karatFilter, setKaratFilter] = useState<string>("ALL");

  // Optional webcam QR scanner
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void fetchActorCached().then((a) => {
      if (!a) {
        router.replace("/login?redirect=/loss-checker");
        return;
      }
      setActor(a);
    });
  }, [router]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  // Attach MediaStream after <video> mounts on screen (fixes blank video in Firefox/Chrome)
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      const video = videoRef.current;
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }
  }, [cameraActive]);

  const handleScanLookup = useCallback(
    async (rawValue: string) => {
      const q = rawValue.trim();
      if (!q || loadingScan) return;
      setErrorMsg(null);
      setNoticeMsg(null);
      setLoadingScan(true);
      try {
        const res = await fetch(
          `/api/orders/loss-check?q=${encodeURIComponent(q)}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setErrorMsg(data.error || `No bag found for "${q}"`);
          return;
        }
        const entry: LossCheckOrder = {
          order: data.order,
          processes: data.processes,
        };
        setScannedBags((prev) => {
          if (prev.some((b) => b.order.id === entry.order.id)) {
            setNoticeMsg(
              `Bag #${entry.order.bagNumber} is already in the list (not counted twice).`
            );
            return prev;
          }
          setNoticeMsg(
            `Added Bag #${entry.order.bagNumber} (${entry.order.purityLabel})`
          );
          return [entry, ...prev];
        });
        setScanInput("");
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "Failed to look up bag"
        );
      } finally {
        setLoadingScan(false);
        inputRef.current?.focus();
      }
    },
    [loadingScan]
  );

  async function startCameraScanner() {
    setErrorMsg(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      setCameraActive(true);

      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (
              video: HTMLVideoElement
            ) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;

      let lastScanned = "";
      let lastScannedAt = 0;

      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
        const loop = async () => {
          if (!streamRef.current) return;
          if (!videoRef.current) {
            requestAnimationFrame(loop);
            return;
          }
          try {
            const codes = await detector.detect(videoRef.current);
            const val = codes[0]?.rawValue;
            if (val && (val !== lastScanned || Date.now() - lastScannedAt > 2000)) {
              lastScanned = val;
              lastScannedAt = Date.now();
              await handleScanLookup(val);
            }
          } catch {
            // continue scanning
          }
          if (streamRef.current) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      } else {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let lastFrameAt = 0;
        let frameIdx = 0;
        const loop = async (ts: number) => {
          if (!streamRef.current || !ctx) return;
          if (!videoRef.current) {
            requestAnimationFrame(loop);
            return;
          }
          if (ts - lastFrameAt >= 60) {
            lastFrameAt = ts;
            frameIdx += 1;
            const v = videoRef.current;
            if (v.readyState >= v.HAVE_CURRENT_DATA && v.videoWidth > 0) {
              const vw = v.videoWidth;
              const vh = v.videoHeight;
              const useCrop = frameIdx % 2 === 0;
              const sx = useCrop ? Math.round(vw * 0.2) : 0;
              const sy = useCrop ? Math.round(vh * 0.2) : 0;
              const sw = useCrop ? Math.round(vw * 0.6) : vw;
              const sh = useCrop ? Math.round(vh * 0.6) : vh;
              const scale = Math.min(1, 640 / sw);
              canvas.width = Math.round(sw * scale);
              canvas.height = Math.round(sh * scale);
              ctx.drawImage(v, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(img.data, img.width, img.height, {
                inversionAttempts: frameIdx % 4 === 0 ? "attemptBoth" : "dontInvert",
              });
              if (
                code?.data &&
                (code.data !== lastScanned || Date.now() - lastScannedAt > 2000)
              ) {
                lastScanned = code.data;
                lastScannedAt = Date.now();
                await handleScanLookup(code.data);
              }
            }
          }
          if (streamRef.current) requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
    } catch {
      setErrorMsg("Could not access camera. Use a USB scanner or type Bag #.");
      stopCamera();
    }
  }

  const distinctKarats = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of scannedBags) {
      map.set(b.order.purityId, b.order.purityLabel);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [scannedBags]);

  const filteredBags = useMemo(() => {
    return scannedBags.filter((b) =>
      karatFilter === "ALL" ? true : b.order.purityId === karatFilter
    );
  }, [scannedBags, karatFilter]);

  const processTotals = useMemo(() => {
    const map: Record<ProcessType, { raw: number; fine: number }> = {
      FILING: { raw: 0, fine: 0 },
      FREE_POLISH: { raw: 0, fine: 0 },
      SETTING: { raw: 0, fine: 0 },
      NOKSI: { raw: 0, fine: 0 },
      FINAL_POLISH: { raw: 0, fine: 0 },
    };
    let grandRaw = 0;
    let grandFine = 0;

    for (const bag of filteredBags) {
      for (const p of bag.processes) {
        if (processFilter !== "ALL" && p.processType !== processFilter) continue;
        const r = Number(p.closedLossWeight || 0);
        const f = Number(p.fineLossWeight || 0);
        map[p.processType].raw += r;
        map[p.processType].fine += f;
        grandRaw += r;
        grandFine += f;
      }
    }
    return { byProcess: map, grandRaw, grandFine };
  }, [filteredBags, processFilter]);

  const karatBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        purityLabel: string;
        bagCount: number;
        FILING: number;
        FREE_POLISH: number;
        SETTING: number;
        NOKSI: number;
        FINAL_POLISH: number;
        totalRaw: number;
        totalFine: number;
      }
    >();
    for (const bag of filteredBags) {
      const key = bag.order.purityId;
      const cur = map.get(key) ?? {
        purityLabel: bag.order.purityLabel,
        bagCount: 0,
        FILING: 0,
        FREE_POLISH: 0,
        SETTING: 0,
        NOKSI: 0,
        FINAL_POLISH: 0,
        totalRaw: 0,
        totalFine: 0,
      };
      cur.bagCount += 1;
      for (const p of bag.processes) {
        if (processFilter !== "ALL" && p.processType !== processFilter) continue;
        const r = Number(p.closedLossWeight || 0);
        const f = Number(p.fineLossWeight || 0);
        cur[p.processType] += r;
        cur.totalRaw += r;
        cur.totalFine += f;
      }
      map.set(key, cur);
    }
    return Array.from(map.values());
  }, [filteredBags, processFilter]);

  const karigarBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        karigarName: string;
        FILING: number;
        FREE_POLISH: number;
        SETTING: number;
        NOKSI: number;
        FINAL_POLISH: number;
        totalRaw: number;
        totalFine: number;
      }
    >();
    for (const bag of filteredBags) {
      for (const p of bag.processes) {
        if (processFilter !== "ALL" && p.processType !== processFilter) continue;
        const r = Number(p.closedLossWeight || 0);
        const f = Number(p.fineLossWeight || 0);
        if (r === 0 && !p.karigarId) continue;
        const key = p.karigarId || "UNASSIGNED";
        const cur = map.get(key) ?? {
          karigarName: p.karigarName || "Unassigned",
          FILING: 0,
          FREE_POLISH: 0,
          SETTING: 0,
          NOKSI: 0,
          FINAL_POLISH: 0,
          totalRaw: 0,
          totalFine: 0,
        };
        cur[p.processType] += r;
        cur.totalRaw += r;
        cur.totalFine += f;
        map.set(key, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalFine - a.totalFine);
  }, [filteredBags, processFilter]);

  if (!actor) {
    return <div className="p-6 text-xs text-slate-600">Loading QR Loss Checker...</div>;
  }

  return (
    <AppShell actor={actor}>
      <div className="max-w-[1400px] mx-auto px-4 py-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-blue-700" />
              QR Loss Checker (Read-Only)
            </h1>
            <p className="text-xs text-slate-600">
              Scan bags one by one to check process-wise, karat-wise, and karigar-wise losses. Nothing is saved to the database.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={processFilter}
              onChange={(e) =>
                setProcessFilter(e.target.value as "ALL" | ProcessType)
              }
              className="px-2.5 py-1.5 border border-slate-300 rounded-xs bg-white font-semibold"
            >
              <option value="ALL">All Processes</option>
              {CANONICAL_PROCESS_SEQUENCE.map((pt) => (
                <option key={pt} value={pt}>
                  Only {PROCESS_DISPLAY_LABELS[pt]}
                </option>
              ))}
            </select>

            <select
              value={karatFilter}
              onChange={(e) => setKaratFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-xs bg-white font-semibold"
            >
              <option value="ALL">All Karats</option>
              {distinctKarats.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>

            {scannedBags.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setScannedBags([]);
                  setNoticeMsg(null);
                  setErrorMsg(null);
                  inputRef.current?.focus();
                }}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold rounded-xs cursor-pointer"
              >
                Clear List ({scannedBags.length})
              </button>
            )}
          </div>
        </div>

        {/* Scan Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleScanLookup(scanInput);
          }}
          className="bg-white border border-slate-300 rounded-xs p-3 flex flex-wrap items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            placeholder="Scan QR code or type Bag # (e.g. 113) and press Enter..."
            className="flex-1 min-w-[240px] px-3 py-2 text-xs border border-slate-300 rounded-xs font-mono"
          />
          <button
            type="submit"
            disabled={loadingScan}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs cursor-pointer disabled:opacity-60"
          >
            {loadingScan ? "Checking..." : "Add Bag"}
          </button>
          <button
            type="button"
            onClick={() => (cameraActive ? stopCamera() : void startCameraScanner())}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xs border cursor-pointer ${
              cameraActive
                ? "bg-red-600 text-white border-red-700"
                : "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200"
            }`}
          >
            {cameraActive ? <X className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
            {cameraActive ? "Stop Camera" : "Camera Scan"}
          </button>
        </form>

        {cameraActive && (
          <div className="bg-black rounded-xs p-2 flex justify-center">
            <video ref={videoRef} className="max-h-56 rounded-xs" autoPlay muted playsInline />
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xs">
            {errorMsg}
          </div>
        )}
        {noticeMsg && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs rounded-xs">
            {noticeMsg}
          </div>
        )}

        {/* Process Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="bg-white border border-slate-300 rounded-xs p-3">
            <div className="text-[11px] font-semibold text-slate-500">Scanned Bags</div>
            <div className="mt-1 text-lg font-bold font-mono text-slate-900">
              {filteredBags.length}
            </div>
          </div>
          {CANONICAL_PROCESS_SEQUENCE.map((pt) => {
            const val = processTotals.byProcess[pt];
            const dimmed = processFilter !== "ALL" && processFilter !== pt;
            return (
              <div
                key={pt}
                className={`bg-white border border-slate-300 rounded-xs p-3 ${
                  dimmed ? "opacity-40" : ""
                }`}
              >
                <div className="text-[11px] font-semibold text-slate-500">
                  {PROCESS_DISPLAY_LABELS[pt]} Loss
                </div>
                <div className="mt-1 text-base font-bold font-mono text-slate-900">
                  {formatWeight3(val.raw)} g
                </div>
                <div className="text-[11px] font-mono text-blue-700">
                  {formatWeight3(val.fine)} g fine
                </div>
              </div>
            );
          })}
          <div className="bg-amber-50 border border-amber-300 rounded-xs p-3">
            <div className="text-[11px] font-semibold text-amber-900">Grand Total Loss</div>
            <div className="mt-1 text-base font-bold font-mono text-amber-950">
              {formatWeight3(processTotals.grandRaw)} g
            </div>
            <div className="text-[11px] font-mono text-amber-800">
              {formatWeight3(processTotals.grandFine)} g fine
            </div>
          </div>
        </div>

        {/* Karat-Wise & Karigar-Wise Breakdowns */}
        {filteredBags.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-300 rounded-xs p-3 space-y-2">
              <div className="text-xs font-bold text-slate-900">
                Karat-Wise Process Loss Breakdown
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                      <th className="p-1.5 text-left">Karat</th>
                      <th className="p-1.5 text-right">Bags</th>
                      <th className="p-1.5 text-right">Filing</th>
                      <th className="p-1.5 text-right">F.Polish</th>
                      <th className="p-1.5 text-right">Setting</th>
                      <th className="p-1.5 text-right">Noksi</th>
                      <th className="p-1.5 text-right">Final</th>
                      <th className="p-1.5 text-right">Total (Fine)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {karatBreakdown.map((k) => (
                      <tr key={k.purityLabel} className="border-b border-slate-100 font-mono">
                        <td className="p-1.5 font-sans font-semibold">{k.purityLabel}</td>
                        <td className="p-1.5 text-right">{k.bagCount}</td>
                        <td className="p-1.5 text-right">{formatWeight3(k.FILING)}</td>
                        <td className="p-1.5 text-right">{formatWeight3(k.FREE_POLISH)}</td>
                        <td className="p-1.5 text-right">{formatWeight3(k.SETTING)}</td>
                        <td className="p-1.5 text-right">{formatWeight3(k.NOKSI)}</td>
                        <td className="p-1.5 text-right">{formatWeight3(k.FINAL_POLISH)}</td>
                        <td className="p-1.5 text-right font-bold text-blue-800">
                          {formatWeight3(k.totalRaw)}g ({formatWeight3(k.totalFine)}g)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-slate-300 rounded-xs p-3 space-y-2">
              <div className="text-xs font-bold text-slate-900">
                Karigar-Wise Process Loss Breakdown
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                      <th className="p-1.5 text-left">Karigar</th>
                      <th className="p-1.5 text-right">Filing</th>
                      <th className="p-1.5 text-right">F.Polish</th>
                      <th className="p-1.5 text-right">Setting</th>
                      <th className="p-1.5 text-right">Noksi</th>
                      <th className="p-1.5 text-right">Final</th>
                      <th className="p-1.5 text-right">Total (Fine)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {karigarBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-3 text-center text-slate-500">
                          No karigar losses recorded in scanned bags yet.
                        </td>
                      </tr>
                    ) : (
                      karigarBreakdown.map((k) => (
                        <tr key={k.karigarName} className="border-b border-slate-100 font-mono">
                          <td className="p-1.5 font-sans font-semibold">{k.karigarName}</td>
                          <td className="p-1.5 text-right">{formatWeight3(k.FILING)}</td>
                          <td className="p-1.5 text-right">{formatWeight3(k.FREE_POLISH)}</td>
                          <td className="p-1.5 text-right">{formatWeight3(k.SETTING)}</td>
                          <td className="p-1.5 text-right">{formatWeight3(k.NOKSI)}</td>
                          <td className="p-1.5 text-right">{formatWeight3(k.FINAL_POLISH)}</td>
                          <td className="p-1.5 text-right font-bold text-blue-800">
                            {formatWeight3(k.totalRaw)}g ({formatWeight3(k.totalFine)}g)
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Scanned Bags Table */}
        <div className="bg-white border border-slate-300 rounded-xs p-3 space-y-2">
          <div className="text-xs font-bold text-slate-900">
            Scanned Bags ({filteredBags.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700">
                  <th className="p-1.5 text-left">Bag #</th>
                  <th className="p-1.5 text-left">Customer</th>
                  <th className="p-1.5 text-left">Order</th>
                  <th className="p-1.5 text-left">Karat</th>
                  <th className="p-1.5 text-right">Filing</th>
                  <th className="p-1.5 text-right">F.Polish</th>
                  <th className="p-1.5 text-right">Setting</th>
                  <th className="p-1.5 text-right">Noksi</th>
                  <th className="p-1.5 text-right">Final</th>
                  <th className="p-1.5 text-right">Total Loss</th>
                  <th className="p-1.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBags.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-slate-500">
                      Scan a bag QR code or enter a Bag # above to start checking losses.
                    </td>
                  </tr>
                ) : (
                  filteredBags.map((b) => {
                    const lossOf = (pt: ProcessType) =>
                      b.processes.find((p) => p.processType === pt)
                        ?.closedLossWeight ?? "0.000";
                    return (
                      <tr key={b.order.id} className="border-b border-slate-100 font-mono">
                        <td className="p-1.5 font-bold text-blue-800">
                          #{b.order.bagNumber}
                        </td>
                        <td className="p-1.5 font-sans">{b.order.customerName}</td>
                        <td className="p-1.5 font-sans">{b.order.orderName}</td>
                        <td className="p-1.5 font-sans">{b.order.purityLabel}</td>
                        <td className="p-1.5 text-right">{lossOf("FILING")}</td>
                        <td className="p-1.5 text-right">{lossOf("FREE_POLISH")}</td>
                        <td className="p-1.5 text-right">{lossOf("SETTING")}</td>
                        <td className="p-1.5 text-right">{lossOf("NOKSI")}</td>
                        <td className="p-1.5 text-right">{lossOf("FINAL_POLISH")}</td>
                        <td className="p-1.5 text-right font-bold">
                          {b.order.totalRawLossWeight}g ({b.order.totalFineLossWeight}g fine)
                        </td>
                        <td className="p-1.5 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setScannedBags((prev) =>
                                prev.filter((item) => item.order.id !== b.order.id)
                              )
                            }
                            className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 font-sans cursor-pointer"
                            title="Remove from check list"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
