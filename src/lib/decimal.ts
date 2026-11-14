import Decimal from "decimal.js";

// Configure Decimal.js for high-precision financial/bullion arithmetic
Decimal.set({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export type DecimalInput = Decimal | number | string | { toString(): string };

export const ZERO = new Decimal(0);
export const HUNDRED = new Decimal(100);

/**
 * Converts a Decimal, Prisma.Decimal, string, or number into a Decimal instance.
 * Never uses binary floating-point conversion for string/Decimal inputs.
 */
export function toDecimal(value: DecimalInput | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") {
    return ZERO;
  }
  if (value instanceof Decimal) {
    return value;
  }
  return new Decimal(value.toString().trim());
}

/**
 * Internal storage scale: 6 decimal places (matches PostgreSQL NUMERIC(18, 6)).
 * Retains full sub-milligram precision for fine-equivalent conversions:
 * e.g., 19.200g * 92 / 100 = 17.664000g.
 */
export function roundInternal(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
}

/**
 * Touch percentage scale: 4 decimal places (matches PostgreSQL NUMERIC(8, 4)).
 * Preserves exact purities such as 92.0000%, 75.5000%, 37.5000%, 99.0000%, 99.9000%, 100.0000%.
 */
export function roundTouch(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
}

/**
 * Operational display scale: 3 decimal places (milligram precision: 0.000 g).
 */
export function roundOperational(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/**
 * Fine equivalent formula (Rule 3 & Rule 6):
 *   fineEquivalent = metalWeight * touchPercent / 100
 *
 * Uses exact configured touchPercent (never overrides 92% with 22/24 = 91.6667%).
 * Never conflates 99%, 99.9%, and 100%.
 */
export function calculateFineEquivalent(
  metalWeight: DecimalInput,
  touchPercent: DecimalInput
): Decimal {
  const weight = toDecimal(metalWeight);
  const touch = toDecimal(touchPercent);
  return roundInternal(weight.mul(touch).div(HUNDRED));
}

/**
 * Formats a weight at 3 decimal places (e.g., "19.600").
 */
export function formatWeight3(value: DecimalInput | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "0.000";
  }
  return roundOperational(value).toFixed(3);
}

/**
 * Formats a weight for the Production Register:
 * - Returns "-" when empty/unentered (if treatZeroAsEmpty is false, 0 is shown as "0.000 g").
 * - Returns "19.600 g" when present.
 */
export function formatRegisterWeight(
  value: DecimalInput | null | undefined,
  options?: { emptyWhenNull?: boolean; emptyWhenZero?: boolean; suffix?: string }
): string {
  const suffix = options?.suffix ?? " g";
  if (value === null || value === undefined || value === "") {
    return options?.emptyWhenNull === false ? `0.000${suffix}` : "-";
  }
  const d = toDecimal(value);
  if (options?.emptyWhenZero && d.isZero()) {
    return "-";
  }
  return `${d.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3)}${suffix}`;
}

/**
 * Formats a touch percentage cleanly (e.g. 92.0000 -> "92%", 75.5000 -> "75.5%", 99.9000 -> "99.9%").
 */
export function formatTouchPercent(value: DecimalInput): string {
  const d = roundTouch(value);
  const fixed = d.toFixed(4).replace(/\.?0+$/, "");
  return `${fixed}%`;
}

export { Decimal };

