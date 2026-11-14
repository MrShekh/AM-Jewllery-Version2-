/**
 * Validates and preserves internal post-login redirect URLs (such as QR deep links
 * `/production-register?order=<opaque-id>`) while blocking open-redirect attacks.
 */
export function sanitizeRedirectPath(
  redirectParam: string | null | undefined,
  fallback = "/production-register"
): string {
  if (!redirectParam || typeof redirectParam !== "string") {
    return fallback;
  }
  const trimmed = redirectParam.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return fallback;
  }
  return trimmed;
}

/**
 * Builds the login URL preserving the exact destination path + query string.
 */
export function buildLoginRedirectUrl(targetPathAndQuery: string): string {
  const safeTarget = sanitizeRedirectPath(targetPathAndQuery);
  return `/login?redirect=${encodeURIComponent(safeTarget)}`;
}

