"use client";

import React from "react";

export interface AdDetail {
  id: string;
  adSize: string;
  adPieces: number;
}

export interface ManufacturingWorksheetPreviewProps {
  customerName: string;
  orderNumber: string;
  orderName: string;
  date: string;
  deliveryDate: string;
  selectedKarat: string;
  weightInGrams: number;
  size: string;
  selectedProcesses: string[];
  adDetails: AdDetail[];
  productImage?: string;
}

export const ManufacturingWorksheetPreview: React.FC<
  ManufacturingWorksheetPreviewProps
> = ({
  customerName,
  orderNumber,
  orderName,
  date,
  deliveryDate,
  selectedKarat,
  weightInGrams,
  size,
  adDetails,
  productImage,
}) => {
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-GB");
  };

  const getKaratDisplay = (karat: string) => {
    switch (karat) {
      case "22K (92%)":
        return "22KT";
      case "18K (75%)":
        return "18KT";
      case "14K (59%)":
        return "14KT";
      case "9K (37.5%)":
        return "9KT";
      default:
        return karat;
    }
  };

  const totalAdPieces = adDetails.reduce(
    (sum, item) => sum + (item.adPieces || 0),
    0
  );

  return (
    <div
      className="bg-white p-2 rounded-lg shadow-lg border border-gray-300 relative text-black"
      style={{
        fontFamily: "Arial, sans-serif",
        fontSize: "10px",
        width: "400px",
      }}
    >
      {/* Top Header */}
      <div className="grid grid-cols-6 border border-black">
        <div className="bg-yellow-200 p-1 border-r border-black font-bold text-center text-xs">
          {orderNumber || "BAG NO-"}
        </div>
        <div className="col-span-4 bg-yellow-200 p-1 border-r border-black font-bold text-center text-sm">
          AM JEWELLARS
        </div>
        <div className="bg-yellow-200 p-1 text-center text-xs"></div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-6 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black font-bold text-xs">DATE-</div>
        <div className="p-1 border-r border-black font-bold text-xs col-span-2">
          Customer Name
        </div>
        <div className="p-1 border-r border-black font-bold text-xs">ORDER</div>
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          {getKaratDisplay(selectedKarat)}
        </div>
        <div className="p-1 text-center text-xs"></div>
      </div>

      {/* Third Row - Values */}
      <div className="grid grid-cols-6 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black text-center text-xs">
          {formatDate(date)}
        </div>
        <div className="p-1 border-r border-black text-center font-bold text-xs col-span-2">
          {customerName}
        </div>
        <div className="p-1 border-r border-black text-center text-xs">
          {orderName}
        </div>
        <div className="p-1 border-r border-black text-center font-bold text-xs">
          {size ? `Size - ${size}` : ""}
        </div>
        <div className="p-1 text-center font-bold text-xs">D DATE -</div>
      </div>

      {/* Fourth Row - Process Header */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black"></div>
        <div className="p-1 border-r border-black text-center font-bold text-xs">
          IN
        </div>
        <div className="p-1 border-r border-black text-center font-bold text-xs">
          OUT
        </div>
        <div className="p-1 border-r border-black text-center font-bold text-xs">
          LOSS
        </div>
        <div className="p-1 text-center text-xs">{formatDate(deliveryDate)}</div>
      </div>

      {/* Process Rows */}
      {/* FAILING */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black font-bold text-xs">
          FAILING
        </div>
        <div className="p-1 border-r border-black h-8"></div>
        <div className="p-1 border-r border-black h-8"></div>
        <div className="p-1 border-r border-black h-8"></div>
        <div className="p-1 h-8"></div>
      </div>

      {/* Empty Row after FAILING */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 h-6"></div>
      </div>

      {/* F PALISH */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black font-bold text-xs">
          F PALISH
        </div>
        <div className="p-1 border-r border-black h-8"></div>
        <div className="p-1 border-r border-black h-8"></div>
        <div className="p-1 border-r border-black h-8"></div>
        <div className="p-1 h-8"></div>
      </div>

      {/* Empty Row after F PALISH */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 h-6"></div>
      </div>

      {/* SETTING and AD with merged image space */}
      <div className="relative">
        {/* SETTING Row */}
        <div className="grid grid-cols-5 border-l border-r border-b border-black">
          <div className="p-1 border-r border-black font-bold text-xs">
            SETTING
          </div>
          <div className="p-1 border-r border-black h-8"></div>
          <div className="p-1 border-r border-black h-8"></div>
          <div className="p-1 border-r border-black h-8"></div>
          <div className="p-1 h-8"></div>
        </div>

        {/* AD Row - Blue Background */}
        <div className="grid grid-cols-5 border-l border-r border-b border-black bg-blue-200">
          <div className="p-1 border-r border-black font-bold text-center text-xs">
            AD
          </div>
          <div className="p-1 border-r border-black h-6"></div>
          <div className="p-1 border-r border-black h-6"></div>
          <div className="p-1 border-r border-black h-6"></div>
          <div className="p-1 h-6 bg-white"></div>
        </div>

        {/* Product Image spanning SETTING and AD rows */}
        {productImage && (
          <div
            className="absolute top-0 right-0 flex items-center justify-center border-l border-black bg-white"
            style={{
              width: "20%",
              height: "56px",
              padding: "2px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={productImage}
              alt="Product"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        )}
      </div>

      {/* KL Row - Blue Background */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black bg-blue-200">
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          KL
        </div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 h-6 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="text-xs font-bold text-red-600">WT-</div>
            {weightInGrams > 0 && (
              <div className="text-xs font-bold text-blue-600">
                {weightInGrams}g
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TOTAL Row */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black bg-gray-200">
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          TOTAL
        </div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 h-6 bg-white"></div>
      </div>

      {/* Empty Row after TOTAL */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black">
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 border-r border-black h-6"></div>
        <div className="p-1 h-6 text-center font-bold text-xs flex items-center justify-center">
          FENESH WT
        </div>
      </div>

      {/* PALISH Row */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black bg-gray-200">
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          PALISH
        </div>
        <div className="p-1 border-r border-black h-8"></div>
        <div className="p-1 border-r border-black h-8"></div>
        <div className="p-1 border-r border-black h-8"></div>
        <div className="p-1 h-8 bg-white"></div>
      </div>

      {/* AD Details Header */}
      <div className="grid grid-cols-5 border-l border-r border-b border-black bg-gray-100">
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          AD SIZE
        </div>
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          AD PIS
        </div>
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          AD SIZ
        </div>
        <div className="p-1 border-r border-black font-bold text-center text-xs">
          AD PIS
        </div>
        <div className="p-1 font-bold text-center text-xs">TOTAL</div>
      </div>

      {/* AD Details Rows */}
      {Array.from(
        { length: Math.max(2, Math.ceil(adDetails.length / 2)) },
        (_, rowIndex) => {
          const leftAd = adDetails[rowIndex * 2];
          const rightAd = adDetails[rowIndex * 2 + 1];

          return (
            <div
              key={rowIndex}
              className="grid grid-cols-5 border-l border-r border-b border-black"
            >
              <div className="p-1 border-r border-black text-center text-xs h-5">
                {leftAd?.adSize || ""}
              </div>
              <div className="p-1 border-r border-black text-center text-xs h-5">
                {leftAd?.adPieces || ""}
              </div>
              <div className="p-1 border-r border-black text-center text-xs h-5">
                {rightAd?.adSize || ""}
              </div>
              <div className="p-1 border-r border-black text-center text-xs h-5">
                {rightAd?.adPieces || ""}
              </div>
              <div className="p-1 text-center font-bold text-xs h-5">
                {rowIndex === 0 && totalAdPieces > 0 ? totalAdPieces : ""}
              </div>
            </div>
          );
        }
      )}

      {/* TOTAL LOSS Footer */}
      <div className="border-l border-r border-b border-black bg-yellow-300 p-2 text-center font-bold text-xs">
        TOTAL LOSS
      </div>

      {/* Additional space below TOTAL LOSS */}
      <div className="border-l border-r border-b border-black h-6 bg-white"></div>
    </div>
  );
};

