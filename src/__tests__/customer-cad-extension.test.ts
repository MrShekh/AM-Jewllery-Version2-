import { describe, expect, it } from "vitest";
import {
  assertStagingDatabaseSafety,
  getFeatureFlags,
  isExternalNotificationsDisabled,
} from "@/lib/env-safety";
import { formatPurityDisplay } from "@/lib/catalogue-service";
import { sanitizeRedirectPath } from "@/lib/auth-redirect";

describe("Customer App, Catalogue & CAD Portal Safety and Helpers", () => {
  it("refuses staging seed/benchmark scripts when production or missing ALLOW_STAGING_MUTATIONS", () => {
    const prevAllow = process.env.ALLOW_STAGING_MUTATIONS;
    const prevEnv = process.env.APP_ENV;
    const prevId = process.env.STAGING_DB_IDENTITY;
    try {
      process.env.APP_ENV = "production";
      expect(() => assertStagingDatabaseSafety("test-seed")).toThrow(/SAFETY BLOCK/);

      process.env.APP_ENV = "staging";
      process.env.ALLOW_STAGING_MUTATIONS = "false";
      expect(() => assertStagingDatabaseSafety("test-seed")).toThrow(/SAFETY BLOCK/);

      process.env.ALLOW_STAGING_MUTATIONS = "true";
      process.env.STAGING_DB_IDENTITY = "prod-main";
      expect(() => assertStagingDatabaseSafety("test-seed")).toThrow(/SAFETY BLOCK/);
    } finally {
      process.env.ALLOW_STAGING_MUTATIONS = prevAllow;
      process.env.APP_ENV = prevEnv;
      process.env.STAGING_DB_IDENTITY = prevId;
    }
  });

  it("disables external notifications in test/staging environments", () => {
    expect(isExternalNotificationsDisabled()).toBe(true);
  });

  it("supports feature flags to disable new modules without breaking manufacturing", () => {
    const prev = process.env.FEATURE_CUSTOMER_APP;
    try {
      process.env.FEATURE_CUSTOMER_APP = "false";
      const flags = getFeatureFlags();
      expect(flags.customerApp).toBe(false);
      expect(flags.cadDashboard).toBe(true);
    } finally {
      process.env.FEATURE_CUSTOMER_APP = prev;
    }
  });

  it("formats purity labels cleanly (e.g. 22K / 92%, never 92K)", () => {
    expect(
      formatPurityDisplay({ karatLabel: "22KT", touchPercent: 92 })
    ).toBe("22K / 92%");
    expect(
      formatPurityDisplay({ karatLabel: "84%", touchPercent: 84 })
    ).toBe("84%");
    expect(
      formatPurityDisplay({ karatLabel: "18K", touchPercent: 75 })
    ).toBe("18K / 75%");
  });

  it("sanitizes redirect paths to prevent open-redirect attacks", () => {
    expect(sanitizeRedirectPath("/customer-app")).toBe("/customer-app");
    expect(sanitizeRedirectPath("https://evil.com")).toBe("/production-register");
    expect(sanitizeRedirectPath("//evil.com")).toBe("/production-register");
  });
});
