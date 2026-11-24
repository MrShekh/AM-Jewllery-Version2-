"use client";

export interface CachedActor {
  userId: string;
  organizationId: string;
  username: string;
  displayName: string;
  role: "OWNER_ADMIN" | "OPERATOR" | "CUSTOMER" | "CAD_DESIGNER";
  customerId?: string | null;
  linkedKarigarId?: string | null;
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();
let cachedActor: CachedActor | null = null;
let actorFetchPromise: Promise<CachedActor | null> | null = null;
let fetchInterceptorInstalled = false;

const ACTOR_STORAGE_KEY = "am_erp_v2_actor_v1";
const DEFAULT_TTL_MS = 45_000;

export function installMutationCacheInvalidator(): void {
  if (typeof window === "undefined" || fetchInterceptorInstalled) return;
  fetchInterceptorInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await originalFetch(input, init);
    try {
      const method = (
        init?.method ||
        (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.pathname
          : input.url;
      if (
        res.ok &&
        url.includes("/api/") &&
        method !== "GET" &&
        method !== "HEAD"
      ) {
        if (url.includes("/api/auth/logout") || url.includes("/api/auth/login")) {
          clearAllClientCache();
        } else {
          // Any successful write invalidates data caches so balances stay 100% accurate
          invalidateClientCache();
        }
      }
    } catch {
      // Never break fetch on cache bookkeeping
    }
    return res;
  };
}

export function getCachedActor(): CachedActor | null {
  if (cachedActor) return cachedActor;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(ACTOR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { actor: CachedActor; ts: number };
    if (Date.now() - parsed.ts < 5 * 60_000 && parsed.actor?.userId) {
      cachedActor = parsed.actor;
      return cachedActor;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function setCachedActor(actor: CachedActor | null): void {
  cachedActor = actor;
  if (typeof window === "undefined") return;
  try {
    if (actor) {
      window.sessionStorage.setItem(
        ACTOR_STORAGE_KEY,
        JSON.stringify({ actor, ts: Date.now() })
      );
    } else {
      window.sessionStorage.removeItem(ACTOR_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export async function fetchActorCached(force = false): Promise<CachedActor | null> {
  installMutationCacheInvalidator();
  if (!force) {
    const existing = getCachedActor();
    if (existing) return existing;
  }
  if (actorFetchPromise && !force) {
    return actorFetchPromise;
  }
  actorFetchPromise = (async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setCachedActor(null);
        return null;
      }
      const data = await res.json();
      if (data?.actor) {
        setCachedActor(data.actor);
        return data.actor as CachedActor;
      }
      setCachedActor(null);
      return null;
    } finally {
      actorFetchPromise = null;
    }
  })();
  return actorFetchPromise;
}

export function getCachedJson<T>(key: string, maxAgeMs = 10 * 60_000): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > maxAgeMs) return null;
  return entry.data as T;
}

export function setCachedJson(key: string, data: unknown): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateClientCache(prefixes?: string[]): void {
  if (!prefixes || prefixes.length === 0) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (prefixes.some((p) => key.startsWith(p))) {
      memoryCache.delete(key);
    }
  }
}

export function clearAllClientCache(): void {
  memoryCache.clear();
  setCachedActor(null);
}

/**
 * Fetches JSON from `url` with in-memory caching & request deduplication.
 * - If fresh cached data exists (within `ttlMs`), returns it immediately without hitting the DB.
 * - Deduplicates concurrent identical GETs.
 */
export async function fetchCachedJson<T>(
  url: string,
  options?: { ttlMs?: number; force?: boolean }
): Promise<T> {
  installMutationCacheInvalidator();
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  if (!options?.force) {
    const hit = memoryCache.get(url);
    if (hit && Date.now() - hit.timestamp < ttlMs) {
      return hit.data as T;
    }
  }

  const inflight = inflightRequests.get(url);
  if (inflight && !options?.force) {
    return inflight as Promise<T>;
  }

  const promise = (async () => {
    const res = await fetch(url);
    const data = await res.json();
    if (res.ok) {
      memoryCache.set(url, { data, timestamp: Date.now() });
    }
    return data as T;
  })();

  inflightRequests.set(url, promise);
  try {
    return await promise;
  } finally {
    inflightRequests.delete(url);
  }
}
