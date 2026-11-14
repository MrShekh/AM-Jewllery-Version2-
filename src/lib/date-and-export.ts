/**
 * Timezone, Business Date, and Spreadsheet-Safe Export Utilities (Rule 14)
 */

export const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";

/**
 * Parses a YYYY-MM-DD business date string (or Date) into a canonical Date
 * representing 00:00:00 in Asia/Kolkata (+05:30).
 */
export function parseBusinessDate(dateInput?: string | Date | null): Date {
  if (!dateInput) {
    return getTodayBusinessDate();
  }
  if (dateInput instanceof Date) {
    return dateInput;
  }
  const trimmed = dateInput.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00.000+05:30`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid business date: ${dateInput}`);
  }
  return parsed;
}

/**
 * Returns today's business date string (YYYY-MM-DD) in Asia/Kolkata timezone.
 */
export function getTodayBusinessDateString(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

export function getTodayBusinessDate(now: Date = new Date()): Date {
  return parseBusinessDate(getTodayBusinessDateString(now));
}

/**
 * Returns the YYYY-MM month key in Asia/Kolkata timezone for a given date.
 * Used for month filter tabs (which filter rows only and NEVER reset stock or loss balances).
 */
export function getKolkataMonthKey(dateInput: Date | string): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

/**
 * Formats a YYYY-MM key into a human-readable month label (e.g. "Nov 2026").
 */
export function formatMonthKeyLabel(monthKey: string): string {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!year || !month) return monthKey;
  const d = new Date(Date.UTC(year, month - 1, 15));
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Formats a date in DD/MM/YYYY format in Asia/Kolkata timezone.
 */
export function formatKolkataDateDDMMYYYY(
  dateInput: Date | string | null | undefined
): string {
  if (!dateInput) return "";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/**
 * Sanitizes a user-supplied text field against CSV/Excel formula injection (Rule 14).
 * Any string beginning with =, +, -, @, tab, or CR is prefixed with a single quote.
 */
export function sanitizeSpreadsheetText(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Escapes a cell for RFC-4180 CSV output while applying formula-injection protection
 * on string cells.
 */
export function toSafeCsvCell(value: unknown, isNumeric = false): string {
  if (value === null || value === undefined) return "";
  const raw = isNumeric ? String(value) : sanitizeSpreadsheetText(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/**
 * Builds a complete UTF-8 CSV string from headers and rows.
 */
export function buildSafeCsv(
  headers: string[],
  rows: Array<Array<{ value: unknown; isNumeric?: boolean }>>
): string {
  const headerLine = headers.map((h) => toSafeCsvCell(h, false)).join(",");
  const bodyLines = rows.map((row) =>
    row.map((cell) => toSafeCsvCell(cell.value, Boolean(cell.isNumeric))).join(",")
  );
  return [headerLine, ...bodyLines].join("\r\n");
}

