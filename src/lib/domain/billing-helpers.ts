import Decimal from "decimal.js";
import { roundInternal, ZERO, DecimalInput, toDecimal } from "../decimal";
import {
  BillingBasis,
  BillTemplateEntity,
  CustomerBillEntity,
  CustomerBillLineEntity,
  CustomerEntity,
} from "./types";

export interface BillColumnConfig {
  sr: boolean;
  photo: boolean;
  orderDetail: boolean;
  netWeight: boolean;
  stoneWeight: boolean;
  adWeight: boolean;
  wastage: boolean;
  grossWeight: boolean;
  fineTotal: boolean;
  rupees: boolean;
}

export const DEFAULT_VISIBLE_COLUMNS: BillColumnConfig = {
  sr: true,
  photo: true,
  orderDetail: true,
  netWeight: true,
  stoneWeight: true,
  adWeight: true,
  wastage: true,
  grossWeight: true,
  fineTotal: true,
  rupees: true,
};

export const DEFAULT_COLUMN_LABELS: Record<keyof BillColumnConfig, string> = {
  sr: "Sr",
  photo: "Photo",
  orderDetail: "Order Detail",
  grossWeight: "Gross Weight",
  stoneWeight: "Stone Weight",
  adWeight: "AD Weight",
  netWeight: "Net Weight",
  wastage: "Wastage",
  fineTotal: "Fine",
  rupees: "Rupees",
};

export interface ParsedBillTemplate {
  id: string;
  name: string;
  businessName: string;
  contactInfo: string;
  logoUrl: string | null;
  headerText: string | null;
  footerText: string | null;
  signatureUrl: string | null;
  showPhotoColumn: boolean;
  visibleColumns: BillColumnConfig;
  columnLabels: Record<keyof BillColumnConfig, string>;
  columnWidths: Partial<Record<keyof BillColumnConfig, string>>;
  notesAndTerms: string | null;
  fontSizePx: number;
  paperSize: "A4" | "A5";
}

export function getDefaultTemplateConfig(): ParsedBillTemplate {
  return {
    id: "default_v1_preserved",
    name: "AM Jewellery Modern Invoice",
    businessName: "AM Jewellery",
    contactInfo: "Shekh Nayem • Patavadi Chowk • Phone: 9907047429",
    logoUrl: "/am-logo-icon.png",
    headerText: null,
    footerText: "Thank you for your business!",
    signatureUrl: null,
    showPhotoColumn: true,
    visibleColumns: { ...DEFAULT_VISIBLE_COLUMNS },
    columnLabels: { ...DEFAULT_COLUMN_LABELS },
    columnWidths: {},
    notesAndTerms: null,
    fontSizePx: 12,
    paperSize: "A4",
  };
}

export function parseTemplateEntity(
  tpl: BillTemplateEntity | null | undefined
): ParsedBillTemplate {
  const def = getDefaultTemplateConfig();
  if (!tpl) return def;
  let visibleColumns = { ...def.visibleColumns };
  let columnLabels = { ...def.columnLabels };
  let columnWidths: Partial<Record<keyof BillColumnConfig, string>> = {};
  try {
    visibleColumns = { ...visibleColumns, ...JSON.parse(tpl.visibleColumnsJson) };
  } catch {
    // fallback to defaults
  }
  try {
    columnLabels = { ...columnLabels, ...JSON.parse(tpl.columnLabelsJson) };
  } catch {
    // fallback
  }
  try {
    if (tpl.columnWidthsJson) {
      columnWidths = JSON.parse(tpl.columnWidthsJson);
    }
  } catch {
    // fallback
  }
  visibleColumns.photo = tpl.showPhotoColumn || visibleColumns.photo;

  return {
    id: tpl.id,
    name: tpl.name,
    businessName: tpl.businessName || def.businessName,
    contactInfo: tpl.contactInfo || def.contactInfo,
    logoUrl: tpl.logoUrl,
    headerText: tpl.headerText,
    footerText: tpl.footerText,
    signatureUrl: tpl.signatureUrl,
    showPhotoColumn: tpl.showPhotoColumn,
    visibleColumns,
    columnLabels,
    columnWidths,
    notesAndTerms: tpl.notesAndTerms,
    fontSizePx: Math.min(16, Math.max(10, tpl.fontSizePx || 12)),
    paperSize: tpl.paperSize === "A5" ? "A5" : "A4",
  };
}

export function roundRupees(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function computeOrderLineAmounts(input: {
  grossWeight: Decimal;
  stoneWeight: Decimal;
  netWeight: Decimal;
  touchSnapshot: Decimal;
  billingBasis: BillingBasis;
  manualChargeableWeight?: DecimalInput;
  makingPercentagePoints?: DecimalInput;
  extraFineCharge?: DecimalInput;
  fineDiscount?: DecimalInput;
  makingChargesRupees?: DecimalInput;
  stoneChargeRupees?: DecimalInput;
  rupeeDiscount?: DecimalInput;
}) {
  let chargeableWeight: Decimal;
  if (input.billingBasis === "NET_METAL") {
    chargeableWeight = roundInternal(input.netWeight);
  } else if (input.billingBasis === "GROSS_WEIGHT") {
    chargeableWeight = roundInternal(input.grossWeight);
  } else {
    chargeableWeight = roundInternal(input.manualChargeableWeight ?? ZERO);
  }

  const touch = roundInternal(input.touchSnapshot);
  const makingPts = roundInternal(input.makingPercentagePoints ?? ZERO);
  const extraFine = roundInternal(input.extraFineCharge ?? ZERO);
  const fineDisc = roundInternal(input.fineDiscount ?? ZERO);

  const metalChargeFine = roundInternal(
    chargeableWeight.mul(touch).div(100)
  );
  const makingChargeFine = roundInternal(
    chargeableWeight.mul(makingPts).div(100)
  );
  const fineGold = roundInternal(
    metalChargeFine.add(makingChargeFine).add(extraFine).sub(fineDisc)
  );

  const makingInr = roundRupees(input.makingChargesRupees ?? ZERO);
  const stoneInr = roundRupees(input.stoneChargeRupees ?? ZERO);
  const discInr = roundRupees(input.rupeeDiscount ?? ZERO);
  const totalInr = roundRupees(makingInr.add(stoneInr).sub(discInr));

  return {
    chargeableWeight,
    makingPercentagePoints: makingPts,
    metalChargeFine,
    makingChargeFine,
    extraFineCharge: extraFine,
    fineDiscount: fineDisc,
    fineGold,
    makingCharges: totalInr,
    stoneChargeRupees: stoneInr,
    rupeeDiscount: discInr,
  };
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return null;
}

export function renderBillSnapshotHtml(params: {
  bill: Pick<
    CustomerBillEntity,
    | "billNumber"
    | "billDate"
    | "billType"
    | "status"
    | "totalFineGold"
    | "totalCashRupees"
    | "historicalFineBalance"
    | "historicalInrBalance"
    | "previousAdvanceFineSnapshot"
    | "appliedAdvanceFineSnapshot"
    | "newReceiptFineSnapshot"
    | "closingFineDueSnapshot"
    | "remainingAdvanceFineSnapshot"
    | "notes"
    | "creditNoteNumber"
  >;
  appliedFineCredit: Decimal;
  appliedInrCredit: Decimal;
  newReceiptFineApplied?: Decimal;
  remainingAdvanceFine?: Decimal;
  customer: Pick<CustomerEntity, "name" | "phone" | "address" | "gstNumber">;
  lines: CustomerBillLineEntity[];
  template: ParsedBillTemplate;
}): string {
  const { bill, customer, lines, template, appliedFineCredit, appliedInrCredit } =
    params;
  const cols = template.visibleColumns;
  const lbl = template.columnLabels;
  const widthPx = template.paperSize === "A5" ? "540px" : "760px";
  const fontSize = `${template.fontSizePx}px`;
  const billDateStr = bill.billDate.toISOString().slice(0, 10);

  const logoSafe = sanitizeImageUrl(template.logoUrl);
  const sigSafe = sanitizeImageUrl(template.signatureUrl);

  const pastFine = roundInternal(bill.historicalFineBalance);
  const previousAdvanceFine = roundInternal(
    bill.previousAdvanceFineSnapshot ?? ZERO
  );
  const currentFine = roundInternal(bill.totalFineGold);
  const existingAdvanceFine = roundInternal(
    bill.appliedAdvanceFineSnapshot ?? appliedFineCredit
  );
  const newReceiptFine = roundInternal(
    params.newReceiptFineApplied ?? bill.newReceiptFineSnapshot ?? ZERO
  );
  const totalStatementFine = roundInternal(pastFine.add(currentFine));
  const rawNetPayableFine = roundInternal(
    totalStatementFine.sub(existingAdvanceFine).sub(newReceiptFine)
  );
  const netPayableFine =
    bill.closingFineDueSnapshot !== undefined
      ? roundInternal(bill.closingFineDueSnapshot)
      : rawNetPayableFine.gt(ZERO)
      ? rawNetPayableFine
      : ZERO;
  const remainingAdvanceFine = roundInternal(
    params.remainingAdvanceFine ?? bill.remainingAdvanceFineSnapshot ?? ZERO
  );
  const newBillRemainingFine = roundInternal(
    currentFine.sub(existingAdvanceFine).sub(newReceiptFine)
  );

  const pastInr = roundRupees(bill.historicalInrBalance);
  const currentInr = roundRupees(bill.totalCashRupees);
  const totalStatementInr = roundRupees(pastInr.add(currentInr));
  const netPayableInr = roundRupees(totalStatementInr.sub(appliedInrCredit));

  const thStyle = (key: keyof BillColumnConfig, align: "left" | "right" | "center") => {
    const w = template.columnWidths[key];
    return `border:1px solid #e2e8f0;padding:8px 6px;text-align:${align};font-weight:700;text-transform:uppercase;font-size:11px;color:#111827;${
      w ? `width:${escapeHtml(w)};` : ""
    }`;
  };

  const rowsHtml = lines
    .map((line, idx) => {
      const photoSafe = sanitizeImageUrl(line.photoUrlSnapshot);
      const detailLabel = line.bagNumberSnapshot
        ? `#${escapeHtml(line.bagNumberSnapshot)} - ${escapeHtml(
            line.orderNameSnapshot || line.description
          )} (${line.touchSnapshot.toFixed(2).replace(/\.?0+$/, "")}%)`
        : line.touchSnapshot.gt(ZERO)
        ? `${escapeHtml(line.description)} (${line.touchSnapshot
            .toFixed(2)
            .replace(/\.?0+$/, "")}%)`
        : escapeHtml(line.description);

      const cells: string[] = [];
      if (cols.sr) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:center;color:#475569;">${
            idx + 1
          }</td>`
        );
      }
      if (cols.photo) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:4px;text-align:center;">${
            photoSafe
              ? `<img src="${escapeHtml(
                  photoSafe
                )}" alt="item" style="width:40px;height:40px;object-fit:cover;border:1px solid #e2e8f0;border-radius:2px;" onerror="this.style.display='none'" />`
              : `<span style="color:#94a3b8;font-size:10px;">—</span>`
          }</td>`
        );
      }
      if (cols.orderDetail) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:8px 8px;font-weight:600;color:#0f172a;">${detailLabel}${
            line.adjustmentReason
              ? `<div style="font-size:10px;color:#475569;font-weight:400;">Note: ${escapeHtml(
                  line.adjustmentReason
                )}</div>`
              : ""
          }</td>`
        );
      }
      if (cols.grossWeight) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:right;font-family:monospace;">${line.grossWeight.toFixed(
            3
          )}</td>`
        );
      }
      if (cols.stoneWeight) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:right;font-family:monospace;">${line.stoneWeight.toFixed(
            3
          )}</td>`
        );
      }
      if (cols.adWeight) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:right;font-family:monospace;">${line.adKlWeight.toFixed(
            3
          )}</td>`
        );
      }
      if (cols.netWeight) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:right;font-family:monospace;font-weight:600;">${line.netWeight.toFixed(
            3
          )}</td>`
        );
      }
      if (cols.wastage) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:center;font-family:monospace;">${line.makingPercentagePoints
            .toFixed(2)
            .replace(/\.?0+$/, "")}%</td>`
        );
      }
      if (cols.fineTotal) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:right;font-family:monospace;font-weight:700;">${line.fineGold.toFixed(
            3
          )}</td>`
        );
      }
      if (cols.rupees) {
        cells.push(
          `<td style="border:1px solid #e2e8f0;padding:8px 6px;text-align:right;font-family:monospace;">₹${Number(
            line.makingCharges.toFixed(2)
          ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>`
        );
      }

      return `<tr style="page-break-inside:avoid;">${cells.join("")}</tr>`;
    })
    .join("");

  const headerCells: string[] = [];
  if (cols.sr) headerCells.push(`<th style="${thStyle("sr", "center")}">${escapeHtml(lbl.sr)}</th>`);
  if (cols.photo) headerCells.push(`<th style="${thStyle("photo", "center")}">${escapeHtml(lbl.photo)}</th>`);
  if (cols.orderDetail) headerCells.push(`<th style="${thStyle("orderDetail", "left")}">${escapeHtml(lbl.orderDetail)}</th>`);
  if (cols.grossWeight) headerCells.push(`<th style="${thStyle("grossWeight", "right")}">${escapeHtml(lbl.grossWeight)}</th>`);
  if (cols.stoneWeight) headerCells.push(`<th style="${thStyle("stoneWeight", "right")}">${escapeHtml(lbl.stoneWeight)}</th>`);
  if (cols.adWeight) headerCells.push(`<th style="${thStyle("adWeight", "right")}">${escapeHtml(lbl.adWeight)}</th>`);
  if (cols.netWeight) headerCells.push(`<th style="${thStyle("netWeight", "right")}">${escapeHtml(lbl.netWeight)}</th>`);
  if (cols.wastage) headerCells.push(`<th style="${thStyle("wastage", "center")}">${escapeHtml(lbl.wastage)}</th>`);
  if (cols.fineTotal) headerCells.push(`<th style="${thStyle("fineTotal", "right")}">${escapeHtml(lbl.fineTotal)}</th>`);
  if (cols.rupees) headerCells.push(`<th style="${thStyle("rupees", "right")}">${escapeHtml(lbl.rupees)}</th>`);

  const effectiveLogo = logoSafe || "/am-logo-icon.png";

  return `
<div style="background:#fff;border:1px solid #cbd5e1;padding:32px;color:#0f172a;font-family:Arial,sans-serif;width:${widthPx};font-size:${fontSize};box-sizing:border-box;">
  ${
    template.headerText
      ? `<div style="text-align:center;font-size:11px;font-weight:700;margin-bottom:8px;color:#334155;">${escapeHtml(
          template.headerText
        )}</div>`
      : ""
  }
  ${
    bill.status === "CANCELLED"
      ? `<div style="background:#fee2e2;border:2px solid #b91c1c;color:#991b1b;padding:6px 10px;font-weight:700;margin-bottom:12px;text-align:center;">CANCELLED / CREDITED${
          bill.creditNoteNumber ? ` — CREDIT NOTE: ${escapeHtml(bill.creditNoteNumber)}` : ""
        }</div>`
      : ""
  }
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
    <div>
      <div style="font-size:28px;font-weight:400;letter-spacing:0.14em;color:#0f172a;">INVOICE</div>
      <div style="margin-top:28px;font-size:11px;color:#64748b;">
        <strong style="color:#334155;">${escapeHtml(template.businessName)},</strong> ${escapeHtml(
    template.contactInfo
  )}
      </div>
    </div>
    <div style="text-align:center;">
      <img src="${escapeHtml(
        effectiveLogo
      )}" alt="AM Jewellery" style="height:76px;width:64px;object-fit:contain;margin:0 auto;display:block;" onerror="this.style.display='none'" />
      <div style="margin-top:6px;font-size:14px;font-family:Georgia,serif;letter-spacing:0.2em;color:#1e293b;text-transform:uppercase;">
        ${escapeHtml(template.businessName)}
      </div>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;gap:24px;">
    <div>
      <div style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#0f172a;margin-bottom:4px;">BILL TO</div>
      <div style="font-weight:600;font-size:14px;color:#0f172a;">${escapeHtml(customer.name)}</div>
      ${
        customer.phone
          ? `<div style="font-size:11px;color:#475569;margin-top:2px;">Phone: ${escapeHtml(
              customer.phone
            )}</div>`
          : ""
      }
      ${
        customer.address
          ? `<div style="font-size:11px;color:#475569;margin-top:2px;">${escapeHtml(
              customer.address
            )}</div>`
          : ""
      }
      ${
        customer.gstNumber
          ? `<div style="font-size:11px;color:#475569;margin-top:2px;">GST: ${escapeHtml(
              customer.gstNumber
            )}</div>`
          : ""
      }
    </div>
    <div style="min-width:210px;font-size:12px;">
      <div style="display:flex;justify-content:space-between;padding:2px 0;">
        <span style="color:#475569;">Invoice No.:</span>
        <strong style="font-family:monospace;color:#0f172a;">${escapeHtml(bill.billNumber)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:2px 0;">
        <span style="color:#475569;">Issue date:</span>
        <strong style="font-family:monospace;color:#0f172a;">${billDateStr}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:2px 0;margin-top:4px;">
        <span style="color:#475569;">Reference:</span>
        <strong style="font-family:monospace;color:#0f172a;">${escapeHtml(bill.billNumber)}</strong>
      </div>
    </div>
  </div>

  <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-size:${fontSize};">
    <thead style="display:table-header-group;background:#f3f4f6;">
      <tr>${headerCells.join("")}</tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-top:20px;gap:24px;page-break-inside:avoid;">
    <div style="flex:1;font-size:11px;color:#475569;">
      ${bill.notes ? `<div style="margin-bottom:4px;"><strong>Notes:</strong> ${escapeHtml(bill.notes)}</div>` : ""}
      ${
        template.notesAndTerms
          ? `<div style="margin-bottom:4px;"><strong>Terms:</strong> ${escapeHtml(
              template.notesAndTerms
            )}</div>`
          : ""
      }
      ${
        template.footerText
          ? `<div style="margin-top:8px;color:#64748b;">${escapeHtml(template.footerText)}</div>`
          : ""
      }
    </div>

    <div style="width:310px;">
      <div style="border:1px solid #e2e8f0;font-size:12px;">
        ${
          previousAdvanceFine.gt(ZERO)
            ? `<div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e2e8f0;background:#f0fdf4;color:#15803d;"><span style="font-weight:700;">PREVIOUS ADVANCE:</span><span style="font-family:monospace;font-weight:600;">${previousAdvanceFine.toFixed(
                3
              )} g</span></div>`
            : ""
        }
        <div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
          <span style="font-weight:700;color:#475569;">PREVIOUS OUTSTANDING:</span>
          <span style="font-family:monospace;font-weight:600;color:${
            pastFine.gt(ZERO) ? "#b91c1c" : "#334155"
          };">${pastFine.toFixed(3)} g</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e2e8f0;background:#fff;">
          <span style="font-weight:700;color:#334155;">CURRENT BILL (FINE):</span>
          <strong style="font-family:monospace;color:#0f172a;">${currentFine.toFixed(3)} g</strong>
        </div>
        ${
          existingAdvanceFine.gt(ZERO)
            ? `<div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e2e8f0;background:#fff;color:#15803d;"><span style="font-weight:700;">ADVANCE APPLIED:</span><span style="font-family:monospace;font-weight:600;">-${existingAdvanceFine.toFixed(
                3
              )} g</span></div>`
            : ""
        }
        ${
          newReceiptFine.gt(ZERO)
            ? `<div style="display:flex;justify-content:space-between;padding:7px 12px;border-bottom:1px solid #e2e8f0;background:#fff;color:#0369a1;"><span style="font-weight:700;">NEW RECEIPT APPLIED:</span><span style="font-family:monospace;font-weight:600;">-${newReceiptFine.toFixed(
                3
              )} g</span></div>`
            : ""
        }
        ${
          pastFine.gt(ZERO) &&
          (existingAdvanceFine.gt(ZERO) || newReceiptFine.gt(ZERO))
            ? `<div style="display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;color:#475569;font-size:11px;"><span>THIS BILL REMAINING:</span><span style="font-family:monospace;font-weight:600;">${(newBillRemainingFine.gt(
                ZERO
              )
                ? newBillRemainingFine
                : ZERO
              ).toFixed(3)} g</span></div>`
            : ""
        }
        <div style="display:flex;justify-content:space-between;padding:10px 12px;background:#9e7c42;color:#fff;font-weight:700;">
          <span>TOTAL DUE (FINE GOLD):</span>
          <span style="font-family:monospace;font-size:13px;">${netPayableFine.toFixed(3)} g</span>
        </div>
        ${
          remainingAdvanceFine.gt(ZERO)
            ? `<div style="display:flex;justify-content:space-between;padding:7px 12px;border-top:1px solid #e2e8f0;background:#f0fdf4;color:#15803d;font-weight:700;"><span>REMAINING ADVANCE:</span><span style="font-family:monospace;">${remainingAdvanceFine.toFixed(
                3
              )} g</span></div>`
            : ""
        }
        ${
          !currentInr.isZero() || !pastInr.isZero()
            ? `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-top:1px solid #e2e8f0;background:#f8fafc;font-weight:700;color:#0f172a;"><span>AMOUNT DUE (INR):</span><span style="font-family:monospace;">₹${Number(
                netPayableInr.toFixed(2)
              ).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>`
            : ""
        }
      </div>

      <div style="text-align:right;margin-top:20px;">
        <div style="font-size:11px;font-weight:700;color:#0f172a;">Issued by, signature:</div>
        ${
          sigSafe
            ? `<img src="${escapeHtml(
                sigSafe
              )}" alt="signature" style="max-height:42px;max-width:140px;margin-top:6px;" onerror="this.style.display='none'" />`
            : `<div style="margin-top:8px;font-size:24px;font-style:italic;font-family:Georgia,serif;color:#1e293b;">${escapeHtml(
                template.businessName
              )}</div>`
        }
      </div>
    </div>
  </div>
</div>`.trim();
}

