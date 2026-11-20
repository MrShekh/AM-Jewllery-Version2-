"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { PurityStockRow } from "@/lib/domain/erp-service";

interface StockBoxQrModalProps {
  open: boolean;
  onClose: () => void;
  purities: PurityStockRow[];
  initialPurityId?: string | null;
}

export function buildStockBoxQrUrl(purityCode: string): string {
  const browserOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const isRemoteBrowserOrigin =
    Boolean(browserOrigin) &&
    !browserOrigin.includes("localhost") &&
    !browserOrigin.includes("127.0.0.1");
  const root = (
    (isRemoteBrowserOrigin ? browserOrigin : "") ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    browserOrigin ||
    "http://localhost:3001"
  ).replace(/\/+$/, "");
  return `${root}/stock/scan/${encodeURIComponent(purityCode)}`;
}

export function StockBoxQrModal({
  open,
  onClose,
  purities,
  initialPurityId,
}: StockBoxQrModalProps) {
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const nextSel: Record<string, boolean> = {};
    for (const p of purities) {
      nextSel[p.purityId] = initialPurityId ? p.purityId === initialPurityId : true;
    }
    setSelectedIds(nextSel);
  }, [open, purities, initialPurityId]);

  useEffect(() => {
    if (!open || purities.length === 0) return;
    let active = true;
    Promise.all(
      purities.map(async (p) => {
        const url = buildStockBoxQrUrl(p.code);
        const dataUrl = await QRCode.toDataURL(url, {
          width: 240,
          margin: 1,
          errorCorrectionLevel: "M",
        });
        return [p.purityId, dataUrl] as const;
      })
    )
      .then((entries) => {
        if (!active) return;
        const map: Record<string, string> = {};
        for (const [id, dataUrl] of entries) {
          map[id] = dataUrl;
        }
        setQrMap(map);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, purities]);

  if (!open) return null;

  const chosenPurities = purities.filter((p) => selectedIds[p.purityId]);

  function handlePrintStickers() {
    if (chosenPurities.length === 0) return;
    const printWin = window.open("", "_blank", "width=900,height=700");
    if (!printWin) return;

    const cardsHtml = chosenPurities
      .map((p) => {
        const qrSrc = qrMap[p.purityId] || "";
        const isFine = p.isFineCategory || Number(p.touchPercent) >= 99;
        const title = isFine ? "FINE GOLD (100%)" : p.displayLabel;
        return `
          <div class="sticker">
            <div class="brand">AM JEWELLERY • GOLD BOX</div>
            <div class="purity">${title}</div>
            <div class="touch">Touch: ${p.touchPercent}%</div>
            ${qrSrc ? `<img src="${qrSrc}" alt="${title} QR" />` : ""}
            <div class="hint">Scan for Live Stock &amp; Ledger</div>
            <div class="code">${p.code}</div>
          </div>
        `;
      })
      .join("");

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Gold Box QR Stickers — AM Jewellery</title>
          <style>
            @page { size: A4; margin: 10mm; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 12px; background: #fff; color: #111; }
            .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
            .sticker {
              border: 2px dashed #333;
              border-radius: 10px;
              padding: 12px 10px;
              text-align: center;
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .brand { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #555; }
            .purity { font-size: 18px; font-weight: 800; margin-top: 4px; color: #111; }
            .touch { font-size: 12px; font-weight: 600; color: #444; margin-bottom: 6px; }
            .sticker img { width: 145px; height: 145px; display: block; margin: 4px auto; }
            .hint { font-size: 10px; color: #333; margin-top: 4px; font-weight: 600; }
            .code { font-size: 9px; color: #777; font-family: monospace; margin-top: 2px; }
          </style>
        </head>
        <body>
          <div class="grid">${cardsHtml}</div>
          <script>
            window.onload = function() { setTimeout(function() { window.print(); }, 250); };
          </script>
        </body>
      </html>
    `);
    printWin.document.close();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Gold Box QR Labels (Fine &amp; Karat-wise)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Print and stick these QR codes on your locker boxes. Scanning opens the box&apos;s live stock &amp; full transaction history.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md cursor-pointer"
          >
            Close
          </button>
        </div>

        <div className="p-6 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {purities.map((p) => {
            const checked = Boolean(selectedIds[p.purityId]);
            const isFine = p.isFineCategory || Number(p.touchPercent) >= 99;
            return (
              <div
                key={p.purityId}
                onClick={() =>
                  setSelectedIds((prev) => ({
                    ...prev,
                    [p.purityId]: !prev[p.purityId],
                  }))
                }
                className={`border-2 rounded-xl p-4 text-center cursor-pointer transition ${
                  checked
                    ? "border-amber-500 bg-amber-50/40"
                    : "border-gray-200 bg-white opacity-60"
                }`}
              >
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-mono text-gray-500">{p.code}</span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}}
                    className="h-4 w-4 accent-amber-600"
                  />
                </div>
                <p className="font-bold text-gray-900">
                  {isFine ? "Fine Gold (100%)" : p.displayLabel}
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  Touch: {p.touchPercent}% • In Stock:{" "}
                  {Number(p.adminPhysicalWeight || 0).toFixed(3)} g
                </p>
                {qrMap[p.purityId] ? (
                  <img
                    src={qrMap[p.purityId]}
                    alt={`${p.displayLabel} QR`}
                    className="w-36 h-36 mx-auto border border-gray-200 rounded bg-white p-1"
                  />
                ) : (
                  <div className="w-36 h-36 mx-auto flex items-center justify-center bg-gray-100 rounded text-xs text-gray-400">
                    Generating...
                  </div>
                )}
                <a
                  href={`/stock/scan/${encodeURIComponent(p.code)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-block mt-2 text-xs text-blue-600 hover:underline font-medium"
                >
                  Open Box Page →
                </a>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const all: Record<string, boolean> = {};
                for (const p of purities) all[p.purityId] = true;
                setSelectedIds(all);
              }}
              className="px-2.5 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 cursor-pointer"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds({})}
              className="px-2.5 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 cursor-pointer"
            >
              Clear
            </button>
            <span className="text-gray-600 ml-1">
              {chosenPurities.length} box sticker(s) selected
            </span>
          </div>
          <button
            type="button"
            onClick={handlePrintStickers}
            disabled={chosenPurities.length === 0}
            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-sm rounded-lg cursor-pointer"
          >
            🖨️ Print Selected Stickers ({chosenPurities.length})
          </button>
        </div>
      </div>
    </div>
  );
}
