"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  PlusCircle,
  Scale,
  Users,
  ShieldCheck,
  Coins,
  Receipt,
  LogOut,
  QrCode,
  X,
  Camera,
  CheckCircle2,
} from "lucide-react";

export interface AppShellUser {
  userId: string;
  organizationId: string;
  role: "OWNER_ADMIN" | "OPERATOR";
  email?: string;
  name?: string;
}

export const AppShell: React.FC<{
  actor: AppShellUser;
  children: React.ReactNode;
}> = ({ actor, children }) => {
  const pathname = usePathname();
  const router = useRouter();

  const [scanBanner, setScanBanner] = useState<string | null>(null);
  const [scannerModalOpen, setScannerModalOpen] = useState<boolean>(false);
  const [lanBaseUrl, setLanBaseUrl] = useState<string>("");
  const [manualBagOrQrInput, setManualBagOrQrInput] = useState<string>("");
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mountedAtRef = useRef<number>(Date.now());

  const navItems = [
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      href: "/production-register",
      label: "Production Register",
      icon: ClipboardList,
    },
    {
      href: "/orders/new",
      label: "New Order",
      icon: PlusCircle,
    },
    {
      href: "/stock",
      label: "Stock & Journal",
      icon: Scale,
    },
    {
      href: "/directory",
      label: "Customers & Karigars",
      icon: Users,
    },
    {
      href: "/recovery",
      label: "Karigar Recovery",
      icon: Coins,
    },
    {
      href: "/billing",
      label: "Billing & Settlement",
      icon: Receipt,
    },
    {
      href: "/reconciliation",
      label: "Daily Reconciliation",
      icon: ShieldCheck,
    },
  ];

  // Background Phone-to-Laptop QR Scan Bridge listener
  useEffect(() => {
    let active = true;
    const pollQrBridge = async () => {
      try {
        const res = await fetch("/api/qr-bridge?client=laptop", {
          cache: "no-store",
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (data.lanBaseUrl) {
          setLanBaseUrl(data.lanBaseUrl);
        }
        const latest = data.latestScan;
        if (!latest || !latest.scanId) return;

        // If this tab was just opened directly by the QR bridge, mark it as handled
        if (
          typeof window !== "undefined" &&
          window.location.search.includes(`scanned=${encodeURIComponent(latest.scanId)}`)
        ) {
          sessionStorage.setItem("am_v2_last_qr_scan_id", latest.scanId);
          return;
        }

        const lastHandledId = sessionStorage.getItem("am_v2_last_qr_scan_id");
        // Trigger if this scan is new and arrived after (or within 4s of) mount
        if (
          latest.scanId !== lastHandledId &&
          latest.scannedAt >= mountedAtRef.current - 4000
        ) {
          sessionStorage.setItem("am_v2_last_qr_scan_id", latest.scanId);
          setScanBanner(
            `QR Scan Received: Opened Bag #${latest.bagNumber} (${latest.orderName}) for Process Entry`
          );
          setScannerModalOpen(false);
          router.push(
            `/production-register?order=${encodeURIComponent(latest.orderId)}&scanned=${encodeURIComponent(latest.scanId)}`
          );
          setTimeout(() => {
            if (active) setScanBanner(null);
          }, 5000);
        }
      } catch {
        // Ignore network hiccups during polling
      }
    };

    pollQrBridge();
    const interval = setInterval(pollQrBridge, 1200);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [router]);

  // Stop webcam when modal closes
  useEffect(() => {
    if (!scannerModalOpen && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraActive(false);
    }
  }, [scannerModalOpen]);

  async function startLaptopCameraScan() {
    setScannerError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Use native BarcodeDetector if supported by Chrome/Edge on Windows
      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (
              video: HTMLVideoElement
            ) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;

      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
        const scanLoop = async () => {
          if (!streamRef.current || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && codes[0].rawValue) {
              await handleResolveQrOrBagInput(codes[0].rawValue);
              return;
            }
          } catch {
            // Continue scanning frames
          }
          if (streamRef.current) {
            requestAnimationFrame(scanLoop);
          }
        };
        requestAnimationFrame(scanLoop);
      } else {
        setScannerError(
          "Your browser does not support live webcam QR detection. Scan the QR code using your phone camera or enter/scan the Bag Number below."
        );
      }
    } catch {
      setScannerError(
        "Could not access laptop camera. You can scan the QR code with your phone camera or enter the Bag Number below."
      );
    }
  }

  async function handleResolveQrOrBagInput(rawValue: string) {
    setScannerError(null);
    const trimmed = rawValue.trim();
    if (!trimmed) return;

    // Extract target from a full URL if scanned from a QR code (e.g. .../scan/4360 or ?order=...)
    let target = trimmed;
    const scanMatch = trimmed.match(/\/scan\/([^/?#]+)/i);
    const orderParamMatch = trimmed.match(/[?&]order=([^&#]+)/i);
    if (scanMatch?.[1]) {
      target = decodeURIComponent(scanMatch[1]);
    } else if (orderParamMatch?.[1]) {
      target = decodeURIComponent(orderParamMatch[1]);
    }

    const res = await fetch("/api/qr-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setScannerError(data.error || "No matching bag/order found.");
      return;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraActive(false);
    }
    setManualBagOrQrInput("");
    setScannerModalOpen(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="no-print hide-on-print sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 h-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link
              href="/production-register"
              className="flex items-center gap-2.5 font-bold text-slate-900 text-sm tracking-tight"
            >
              <img
                src="/am-logo-icon.png"
                alt="AM Jewellery"
                className="w-7 h-8 object-contain shrink-0"
              />
              <span>AM Jewellery ERP</span>
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded-xs bg-slate-100 text-slate-700 border border-slate-300">
                v2.0
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xs text-xs font-medium transition-colors ${
                      active
                        ? "bg-blue-700 text-white"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setScannerError(null);
                setScannerModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xs cursor-pointer shadow-2xs"
              title="Scan Job Card QR Code to open Bag Entry Page"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Scan Bag QR</span>
            </button>

            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-slate-900 leading-none">
                {actor.name || actor.email}
              </div>
              <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                {actor.role} • Asia/Kolkata
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-xs hover:bg-slate-100 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>

        {scanBanner && (
          <div className="bg-emerald-700 text-white px-4 py-2 text-xs font-bold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{scanBanner}</span>
          </div>
        )}
      </header>

      {/* QR Scanner Modal (Phone Wi-Fi Bridge + Laptop Camera + USB Scanner) */}
      {scannerModalOpen && (
        <div className="no-print hide-on-print fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xs max-w-md w-full p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-blue-700" />
                <h2 className="text-sm font-bold text-slate-900">
                  Scan Job Card QR to Open Bag Entry Page
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setScannerModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xs space-y-1">
              <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                <span>Option 1: Scan Directly with Your Phone Camera</span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Keep your phone on the same Wi-Fi network and scan the QR code printed on the Job Card. This laptop screen will automatically jump to that bag&apos;s entry page!
              </p>
              {lanBaseUrl && (
                <div className="text-[10px] font-mono text-emerald-900 pt-0.5">
                  Laptop Wi-Fi Listener: <strong>{lanBaseUrl}</strong>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800">
                Option 2: Scan with Laptop Camera
              </div>
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startLaptopCameraScan}
                  className="w-full py-2 px-3 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Open Laptop Camera to Scan Job Card QR</span>
                </button>
              ) : (
                <div className="space-y-2">
                  <video
                    ref={videoRef}
                    className="w-full h-48 bg-black rounded-xs object-cover border border-slate-300"
                    muted
                    playsInline
                  />
                  <p className="text-[11px] text-center text-slate-600">
                    Hold the printed Job Card QR code in front of your laptop camera...
                  </p>
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleResolveQrOrBagInput(manualBagOrQrInput);
              }}
              className="space-y-2 border-t border-slate-200 pt-3"
            >
              <label className="block text-xs font-bold text-slate-800">
                Option 3: USB QR Scanner or Quick Bag Number Jump
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={manualBagOrQrInput}
                  onChange={(e) => setManualBagOrQrInput(e.target.value)}
                  placeholder="Scan with USB scanner or type Bag # (e.g. 4360)..."
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-xs font-mono"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xs cursor-pointer"
                >
                  Open Entry
                </button>
              </div>
            </form>

            {scannerError && (
              <div className="p-2.5 bg-red-50 border border-red-300 text-red-800 text-xs rounded-xs">
                {scannerError}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-4">
        {children}
      </main>
    </div>
  );
};
