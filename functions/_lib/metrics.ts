export type EndpointKey =
  | "/api/check"
  | "/api/healthz"
  | "/api/health"
  | "/api/stats";

export type ExternalTarget =
  | "hibp.breaches"
  | "xposedornot.checkEmail"
  | "hibp.pwnedPasswords";

interface EndpointCounters {
  total: number;
  byStatus: Map<number, number>;
}

interface CacheState {
  populated: boolean;
  ageSeconds: number | null;
  entries: number | null;
}

interface RateLimitPolicy {
  endpoint: string;
  windowMs: number;
  max: number;
}

interface ExternalSeries {
  values: number[];
  ok: number;
  fail: number;
}

export interface HistoryEntry {
  ts: number;
  requestsPerMin: number;
  checkP95Ms: number;
  cacheHitRate: number;
}

const KNOWN_ENDPOINTS: readonly EndpointKey[] = [
  "/api/check",
  "/api/healthz",
  "/api/health",
  "/api/stats",
];

const ROLLING_WINDOW = 500;
const HISTORY_CAPACITY = 15;
const startedAt = Date.now();

let totalRequests = 0;
let total4xx = 0;
let total5xx = 0;
let totalRateLimited = 0;
let cacheHits = 0;
let cacheMisses = 0;

let prevTotalRequests = 0;
let prevCacheHits = 0;
let prevCacheMisses = 0;
let lastHistoryFlushMs = Date.now();

const checkByType = { email: 0, password: 0, unknown: 0 };
const rateLimitPolicies: RateLimitPolicy[] = [];
const history: HistoryEntry[] = [];
const endpointRequests = new Map<EndpointKey, EndpointCounters>();
const allHttpMs: number[] = [];
const checkMs: number[] = [];
const external = new Map<ExternalTarget, ExternalSeries>();

let cacheStateProvider: () => CacheState = () => ({
  populated: false,
  ageSeconds: null,
  entries: null,
});

for (const e of KNOWN_ENDPOINTS) {
  endpointRequests.set(e, { total: 0, byStatus: new Map() });
}

for (const t of [
  "hibp.breaches",
  "xposedornot.checkEmail",
  "hibp.pwnedPasswords",
] as const) {
  external.set(t, { values: [], ok: 0, fail: 0 });
}

function pushWindow(buf: number[], value: number): void {
  buf.push(value);
  if (buf.length > ROLLING_WINDOW) {
    buf.shift();
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return round(sorted[0]!);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return round(sorted[idx]!);
}

function summarise(values: number[]) {
  if (values.length === 0) {
    return { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    meanMs: round(sum / sorted.length),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  };
}

function normaliseEndpoint(path: string): EndpointKey | null {
  const clean = path.split("?")[0]!.replace(/\/+$/, "") || "/";
  return (KNOWN_ENDPOINTS as readonly string[]).includes(clean)
    ? (clean as EndpointKey)
    : null;
}

function maybeFlushHistory(now: number): void {
  while (now - lastHistoryFlushMs >= 60_000) {
    const reqsThisMin = totalRequests - prevTotalRequests;
    prevTotalRequests = totalRequests;

    const cacheTotal = cacheHits + cacheMisses;
    const prevTotal = prevCacheHits + prevCacheMisses;
    const buckHits = cacheHits - prevCacheHits;
    const buckTotal = cacheTotal - prevTotal;
    prevCacheHits = cacheHits;
    prevCacheMisses = cacheMisses;

    history.push({
      ts: lastHistoryFlushMs + 60_000,
      requestsPerMin: reqsThisMin,
      checkP95Ms: summarise(checkMs).p95Ms,
      cacheHitRate: buckTotal === 0 ? 0 : round(buckHits / buckTotal),
    });
    if (history.length > HISTORY_CAPACITY) history.shift();
    lastHistoryFlushMs += 60_000;
  }
}

export const metrics = {
  registerRateLimitPolicy(policy: RateLimitPolicy): void {
    rateLimitPolicies.push(policy);
  },
  registerCacheStateProvider(provider: () => CacheState): void {
    cacheStateProvider = provider;
  },
  recordHttpRequest(path: string, statusCode: number, durationMs: number): void {
    maybeFlushHistory(Date.now());
    pushWindow(allHttpMs, durationMs);
    totalRequests += 1;
    if (statusCode >= 400 && statusCode < 500) total4xx += 1;
    if (statusCode >= 500) total5xx += 1;

    const key = normaliseEndpoint(path);
    if (!key) return;
    const counters = endpointRequests.get(key)!;
    counters.total += 1;
    counters.byStatus.set(statusCode, (counters.byStatus.get(statusCode) ?? 0) + 1);
    if (key === "/api/check") pushWindow(checkMs, durationMs);
  },
  recordCheckIdentifierType(type: string | undefined): void {
    if (type === "email") checkByType.email += 1;
    else if (type === "password") checkByType.password += 1;
    else checkByType.unknown += 1;
  },
  recordExternalCall(target: ExternalTarget, durationMs: number, ok: boolean): void {
    const series = external.get(target);
    if (!series) return;
    pushWindow(series.values, durationMs);
    if (ok) series.ok += 1;
    else series.fail += 1;
  },
  recordCacheHit(): void {
    cacheHits += 1;
  },
  recordCacheMiss(): void {
    cacheMisses += 1;
  },
  recordRateLimited(): void {
    totalRateLimited += 1;
  },
  async snapshot(rateLimitedFromKv?: number) {
    maybeFlushHistory(Date.now());
    const cacheTotal = cacheHits + cacheMisses;
    const cacheState = cacheStateProvider();
    const rateLimited = typeof rateLimitedFromKv === "number" ? rateLimitedFromKv : totalRateLimited;
    return {
      startedAt: new Date(startedAt).toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      requests: {
        total: totalRequests,
        rateLimited429: rateLimited,
        errors4xx: total4xx,
        errors5xx: total5xx,
        perEndpoint: Array.from(endpointRequests.entries()).map(([k, v]) => ({
          endpoint: k,
          total: v.total,
          byStatus: Array.from(v.byStatus.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([statusCode, count]) => ({ statusCode, count })),
        })),
        checkByType: { ...checkByType },
      },
      latency: {
        allHttpMs: summarise(allHttpMs),
        checkMs: summarise(checkMs),
      },
      externalCalls: Array.from(external.entries()).map(([target, series]) => ({
        target,
        ok: series.ok,
        fail: series.fail,
        latencyMs: summarise(series.values),
      })),
      hibpCache: {
        ...cacheState,
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: cacheTotal === 0 ? 0 : round(cacheHits / cacheTotal),
      },
      rateLimit: {
        rejected429: rateLimited,
        policies: rateLimitPolicies.slice(),
      },
      history: history.slice(),
      privacyNote:
        "No identifiers (emails, passwords, hashes, IPs) are recorded. Only request paths, status codes, durations, and counters.",
    };
  },
};
