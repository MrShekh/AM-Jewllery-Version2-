import {
  AdDetail,
  ManufacturingWorksheetPreviewProps,
} from "@/components/previews/v1/ManufacturingWorksheetPreview";
import { ManufacturingWorksheetData } from "@/components/previews/v1/manufacturingWorksheetGenerator";
import { PROCESS_DISPLAY_LABELS, ProcessType } from "@/lib/domain/types";

export interface V2OrderPreviewInput {
  orderId?: string;
  bagNumber: string;
  customerName: string;
  orderName: string;
  orderDate: string | Date;
  dueDate?: string | Date | null;
  purityDisplayLabel: string;
  purityKaratLabel?: string;
  targetWeightGrams?: number | string | null;
  initialIssuedWeightGrams?: number | string | null;
  size?: string | null;
  photoUrl?: string | null;
  selectedProcesses: ProcessType[];
  adDetailsJson?: string | null;
  adDetails?: AdDetail[];
}

function toIsoDatePart(d: string | Date | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) return d.trim();
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return d;
    return parsed.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export function parseAdDetailsFromJson(
  adDetailsJson?: string | null,
  fallback?: AdDetail[]
): AdDetail[] {
  if (fallback && fallback.length > 0) return fallback;
  if (!adDetailsJson) return [];
  try {
    const parsed = JSON.parse(adDetailsJson);
    if (Array.isArray(parsed)) {
      return parsed.map((item, idx) => ({
        id: String(item.id || `ad-${idx + 1}`),
        adSize: String(item.adSize || ""),
        adPieces: Number(item.adPieces || 0),
      }));
    }
  } catch {
    // ignore malformed json
  }
  return [];
}

/**
 * Adapter from V2 Order domain data to the preserved V1 ManufacturingWorksheetPreview props.
 * Preserves exact V1 karat labels, weight display, AD detail pairs, and date strings.
 */
export function adaptV2OrderToV1WorksheetProps(
  input: V2OrderPreviewInput
): ManufacturingWorksheetPreviewProps {
  const rawStr =
    input.targetWeightGrams !== null &&
    input.targetWeightGrams !== undefined &&
    String(input.targetWeightGrams).trim() !== ""
      ? String(input.targetWeightGrams).trim()
      : input.initialIssuedWeightGrams !== null &&
        input.initialIssuedWeightGrams !== undefined
      ? String(input.initialIssuedWeightGrams).trim()
      : "";
  const isPureNum = rawStr !== "" && /^\d+(\.\d+)?$/.test(rawStr);
  const weightInGrams: number | string = isPureNum
    ? Number(Number(rawStr).toFixed(3))
    : rawStr || 0;

  const adDetails = parseAdDetailsFromJson(
    input.adDetailsJson,
    input.adDetails
  );

  return {
    customerName: input.customerName || "",
    orderNumber: input.bagNumber || "",
    orderName: input.orderName || "",
    date: toIsoDatePart(input.orderDate),
    deliveryDate: toIsoDatePart(input.dueDate),
    selectedKarat: input.purityDisplayLabel || input.purityKaratLabel || "",
    weightInGrams,
    size: input.size || "",
    selectedProcesses: input.selectedProcesses.map(
      (p) => PROCESS_DISPLAY_LABELS[p] || p
    ),
    adDetails,
    productImage: input.photoUrl || undefined,
  };
}

export function adaptV2OrderToV1WorksheetPDFData(
  input: V2OrderPreviewInput
): ManufacturingWorksheetData {
  const props = adaptV2OrderToV1WorksheetProps(input);
  return {
    orderNumber: props.orderNumber,
    date: props.date
      ? new Date(props.date).toLocaleDateString("en-GB")
      : "",
    customerName: props.customerName,
    orderName: props.orderName,
    karat: props.selectedKarat,
    weightInGrams:
      typeof props.weightInGrams === "number"
        ? props.weightInGrams
        : Number.parseFloat(String(props.weightInGrams)) || 0,
    size: props.size,
    deliveryDate: props.deliveryDate
      ? new Date(props.deliveryDate).toLocaleDateString("en-GB")
      : "",
    selectedProcesses: props.selectedProcesses,
    adDetails: props.adDetails.map((a) => ({
      adSize: a.adSize,
      adPieces: a.adPieces,
    })),
    productImage: props.productImage,
  };
}

