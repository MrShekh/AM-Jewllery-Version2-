/**
 * Environment isolation, feature flags, and staging-only database guards.
 * Never logs or exposes raw database connection strings or secrets.
 */

export interface FeatureFlags {
  customerApp: boolean;
  cadDashboard: boolean;
  appOrders: boolean;
  catalogue: boolean;
}

export function getAppEnvironment(): "staging" | "test" | "production" {
  const raw = (
    process.env.APP_ENV ||
    process.env.NEXT_PUBLIC_APP_ENV ||
    ""
  )
    .trim()
    .toLowerCase();
  if (raw === "staging") return "staging";
  if (raw === "test" || process.env.NODE_ENV === "test") return "test";
  return "production";
}

export function isStagingEnvironment(): boolean {
  const env = getAppEnvironment();
  return env === "staging" || env === "test";
}

export function isExternalNotificationsDisabled(): boolean {
  if (isStagingEnvironment()) return true;
  return process.env.DISABLE_EXTERNAL_NOTIFICATIONS === "true";
}

export function getFeatureFlags(): FeatureFlags {
  return {
    customerApp: process.env.FEATURE_CUSTOMER_APP !== "false",
    cadDashboard: process.env.FEATURE_CAD_DASHBOARD !== "false",
    appOrders: process.env.FEATURE_APP_ORDERS !== "false",
    catalogue: process.env.FEATURE_CATALOGUE !== "false",
  };
}

function maskDatabaseHost(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "<unparseable-db-target>";
  }
}

/**
 * Guard for seed, reset, fixture, and 30k benchmark scripts.
 * Refuses to execute unless an explicit staging/test database identity is configured
 * and the target does not appear to be production.
 */
export function assertStagingDatabaseSafety(scriptName: string): {
  targetSummary: string;
  stagingIdentity: string;
} {
  const appEnv = getAppEnvironment();
  if (appEnv === "production") {
    throw new Error(
      `[SAFETY BLOCK] ${scriptName} refused to run because APP_ENV is "production". Set APP_ENV=staging with a staging Neon branch URL.`
    );
  }

  if (process.env.ALLOW_STAGING_MUTATIONS !== "true") {
    throw new Error(
      `[SAFETY BLOCK] ${scriptName} requires ALLOW_STAGING_MUTATIONS="true" in your staging environment.`
    );
  }

  const stagingIdentity = (process.env.STAGING_DB_IDENTITY || "").trim();
  if (
    !stagingIdentity ||
    !/staging|test|dev|local/i.test(stagingIdentity)
  ) {
    throw new Error(
      `[SAFETY BLOCK] ${scriptName} requires STAGING_DB_IDENTITY (for example "customer-cad-staging") to be explicitly set.`
    );
  }

  const dbUrl = (process.env.DATABASE_URL || "").trim();
  if (!dbUrl) {
    throw new Error(
      `[SAFETY BLOCK] ${scriptName} requires DATABASE_URL pointing to the staging Neon branch.`
    );
  }

  const prodUrl = (process.env.PRODUCTION_DATABASE_URL || "").trim();
  if (prodUrl && dbUrl === prodUrl) {
    throw new Error(
      `[SAFETY BLOCK] ${scriptName} detected DATABASE_URL matches PRODUCTION_DATABASE_URL. Aborting.`
    );
  }

  return {
    targetSummary: maskDatabaseHost(dbUrl),
    stagingIdentity,
  };
}
