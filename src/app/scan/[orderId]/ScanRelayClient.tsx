"use client";

import React, { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Laptop, RefreshCw, AlertCircle, ArrowRight } from "lucide-react";

export interface ScanResultInfo {
  orderId: string;
  bagNumber: string;
  orderName: string;
  customerName: string;
}

interface ScanRelayClientProps {
  rawTarget: string;
  initialStatus: "SENT" | "ERROR";
  initialInfo: ScanResultInfo | null;
  initialError: string;
}

export default function ScanRelayClient({
  rawTarget,
  initialStatus,
  initialInfo,
  initialError,
}: ScanRelayClientProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"SENDING" | "SENT" | "ERROR">(initialStatus);
  const [info, setInfo] = useState<ScanResultInfo | null>(initialInfo);
  const [errorMessage, setErrorMessage] = useState<string>(initialError);

  const triggerLaptopOpen = useCallback(async () => {
    if (!rawTarget) return;
    setStatus("SENDING");
    setErrorMessage("");
    try {
      const res = await fetch("/api/qr-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: rawTarget }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("ERROR");
        setErrorMessage(data.error || "Could not find this order.");
        return;
      }
      setInfo({
        orderId: data.event.orderId,
        bagNumber: data.event.bagNumber,
        orderName: data.event.orderName,
        customerName: data.event.customerName,
      });
      setStatus("SENT");
    } catch (err) {
      setStatus("ERROR");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to connect to laptop server"
      );
    }
  }, [rawTarget]);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-5">
      <div className="w-full max-w-md bg-slate-800 border border-slate-700 rounded-md p-6 shadow-xl space-y-5 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/60 border border-blue-700 text-blue-200 text-xs font-semibold">
          <Laptop className="w-4 h-4" />
          <span>AM Jewellers ERP • Phone-to-Laptop QR Scanner</span>
        </div>

        {status === "SENDING" && (
          <div className="py-6 space-y-3">
            <RefreshCw className="w-10 h-10 text-blue-400 animate-spin mx-auto" />
            <div className="text-base font-bold">
              Opening Bag on Your Laptop...
            </div>
            <p className="text-xs text-slate-400">
              Sending scan signal for <span className="font-mono">{rawTarget}</span>
            </p>
          </div>
        )}

        {status === "SENT" && info && (
          <div className="space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                Opened on Laptop Screen
              </div>
              <h1 className="text-2xl font-extrabold mt-1 font-mono">
                Bag #{info.bagNumber}
              </h1>
              <div className="text-sm font-semibold text-slate-200 mt-0.5">
                {info.orderName}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Customer: {info.customerName}
              </div>
            </div>

            <div className="p-3 rounded-xs bg-slate-900/80 border border-slate-700 text-xs text-slate-300 leading-relaxed">
              Look at your <strong>Laptop screen</strong> — the Process Entry drawer for{" "}
              <strong>Bag #{info.bagNumber}</strong> has been opened automatically.
            </div>

            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={triggerLaptopOpen}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Send to Laptop Again</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/production-register?order=${encodeURIComponent(info.orderId)}`
                  )
                }
                className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Open Entry Page on This Device Instead</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {status === "ERROR" && (
          <div className="space-y-4 py-2">
            <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto">
              <AlertCircle className="w-7 h-7 text-red-400" />
            </div>
            <div className="text-base font-bold text-red-300">
              Could Not Open Order
            </div>
            <p className="text-xs text-slate-300 bg-slate-900 p-3 rounded-xs border border-slate-700">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={triggerLaptopOpen}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xs cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
