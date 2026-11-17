import { describe, expect, it } from "vitest";
import {
  formatRegisterWeight,
  formatWeight3,
  roundOperational,
  truncateWeight3,
} from "../lib/decimal";

describe("3-decimal weight truncation (ROUND_DOWN, no round-off)", () => {
  it("truncates to exact 3 digits after decimal without rounding up or down", () => {
    expect(formatWeight3("1000.2045")).toBe("1000.204");
    expect(formatWeight3(1000.2049)).toBe("1000.204");
    expect(formatWeight3("2.44996")).toBe("2.449");
    expect(formatWeight3("89.1659")).toBe("89.165");
    expect(formatWeight3("89.160")).toBe("89.160");
    expect(formatWeight3("0.0009")).toBe("0.000");
    expect(formatWeight3("-1.9999")).toBe("-1.999");
    expect(truncateWeight3("12.3456")).toBe("12.345");
    expect(roundOperational("1000.2045").toFixed(3)).toBe("1000.204");
    expect(formatRegisterWeight("1000.2045")).toBe("1000.204 g");
  });
});
