/**
 * In-memory metrics collector for the PDEC API server.
 *
 * Records *only* counts, durations, and outcomes — never identifiers, request
 * bodies, or any field that could be tied back to a user. Designed to be
 * dependency-free so the FYP write-up can describe it end-to-end.
 *
 * Percentile calculations use a fixed-size ring buffer per series (default
 * 500 samples), so the memory footprint and per-request cost are bounded.
 */

const ROLLING_WINDOW = 500;
const HISTORY_CAPACITY = 15;

class RingBuffer {
  private readonly buf: Float64Array;
  private head = 0;
  private size = 0;

  constructor(capacity: number) {
    this.buf = new Float64Array(capacity);
  }

  push(value: number): void {
    this.buf[this.head] = value;
    this.head = (this.head + 1) % this.buf.length;
    if (this.size < this.buf.length) this.size += 1;
  }

  reset(): void {
    this.head = 0;
    this.size = 0;
  }

  snapshot(): number[] {
    if (this.size === 0) return [];
    const out: number[] = new Array(this.size);
    if (this.size < this.buf.length) {
      for (let i = 0; i < this.size; i++) out[i] = this.buf[i]!;
    } else {
      const start = this.head;
      for (let i = 0; i < this.size; i++) {
        out[i] = this.buf[(start + i) % this.buf.length]!;
      }
    }
    return out;
  }

  get count(): number {
    return this.size;
  }
}

export interface LatencyStats {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

function summarise(buf: RingBuffer): LatencyStats {
  const samples = buf.snapshot();
  if (samples.length === 0) {
    return { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const pick = (q: number): number => {
    if (sorted.length === 1) return round(sorted[0]!);
    const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
    return round(sorted[idx]!);
  };
  return {
    count: sorted.length,
    meanMs: round(sum / sorted.length),
    p50Ms: pick(0.5),
    p95Ms: pick(0.95),
    p99Ms: pick(0.99),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Endpoint registry ────────────────────────────────────────────────────────
// We deliberately enumerate the endpoints we report on so the dashboard never
// shows a path that contains a request-supplied value (privacy + cardinality).

export type EndpointKey =
  | "/api/check"
  | "/api/healthz"
  | "/api/health"
  | "/api/stats";
const KNOWN_ENDPOINTS: readonly EndpointKey[] = [
  "/api/check",
  "/api/healthz",
  "/api/health",
  "/api/stats",
];

interface EndpointCounters {
  total: number;
  byStatus: Map<number, number>;
}

const endpointRequests = new Map<EndpointKey, EndpointCounters>();
for (const e of KNOWN_ENDPOINTS) {
  endpointRequests.set(e, { total: 0, byStatus: new Map() });
}

// /api/check is split by identifierType
const checkByType: Record<"email" | "password" | "unknown", number> = {
  email: 0,
  password: 0,
  unknown: 0,
};

const httpLatency = new RingBuffer(ROLLING_WINDOW);
const checkLatency = new RingBuffer(ROLLING_WINDOW);

let totalRequests = 0;
let total4xx = 0;
let total5xx = 0;
let totalRateLimited = 0;

// ── External call latency ────────────────────────────────────────────────────

export type ExternalTarget =
  | "hibp.breaches"
  | "xposedornot.checkEmail"
  | "hibp.pwnedPasswords";

interface ExternalSeries {
  buf: RingBuffer;
  ok: number;
  fail: number;
}

const external = new Map<ExternalTarget, ExternalSeries>();
for (const k of [
  "hibp.breaches",
  "xposedornot.checkEmail",
  "hibp.pwnedPasswords",
] as const) {
  external.set(k, { buf: new RingBuffer(ROLLING_WINDOW), ok: 0, fail: 0 });
}

// ── HIBP breach metadata cache ───────────────────────────────────────────────

let cacheHits = 0;
let cacheMisses = 0;

// ── Rate limiter policy ──────────────────────────────────────────────────────

interface RateLimitPolicy {
  endpoint: string;
  windowMs: number;
  max: number;
}

const rateLimitPolicies: RateLimitPolicy[] = [];

export function registerRateLimitPolicy(p: RateLimitPolicy): void {
  rateLimitPolicies.push(p);
}

// ── Per-minute history ring buffer ───────────────────────────────────────────
// Records a snapshot at the end of each minute so the dashboard can show
// sparklines. No identifiers are stored — only aggregated counters/latencies.

export interface HistoryEntry {
  ts: number;
  requestsPerMin: number;
  checkP95Ms: number;
  cacheHitRate: number;
}

const historyBuf: HistoryEntry[] = [];
let prevTotalRequests = 0;
let prevCacheHits = 0;
let prevCacheMisses = 0;

function flushMinuteBucket(): void {
  const now = Date.now();
  const reqsThisMin = totalRequests - prevTotalRequests;
  prevTotalRequests = totalRequests;

  const cacheTotal = cacheHits + cacheMisses;
  const prevTotal = prevCacheHits + prevCacheMisses;
  const buckHits = cacheHits - prevCacheHits;
  const buckTotal = cacheTotal - prevTotal;
  prevCacheHits = cacheHits;
  prevCacheMisses = cacheMisses;

  const entry: HistoryEntry = {
    ts: now,
    requestsPerMin: reqsThisMin,
    checkP95Ms: summarise(checkLatency).p95Ms,
    cacheHitRate: buckTotal === 0 ? 0 : round(buckHits / buckTotal),
  };

  if (historyBuf.length >= HISTORY_CAPACITY) {
    historyBuf.shift();
  }
  historyBuf.push(entry);
}

let _historyInterval: ReturnType<typeof setInterval> | null = null;

function ensureHistoryTimer(): void {
  if (_historyInterval !== null) return;
  _historyInterval = setInterval(flushMinuteBucket, 60_000);
  if (typeof _historyInterval === "object" && "unref" in _historyInterval) {
    (_historyInterval as { unref: () => void }).unref();
  }
}

export function getHistory(): HistoryEntry[] {
  return historyBuf.slice();
}

// ── Server start time ────────────────────────────────────────────────────────

const startedAt = Date.now();
ensureHistoryTimer();

// ── Recording API ────────────────────────────────────────────────────────────

function normaliseEndpoint(path: string): EndpointKey | null {
  // Strip query string and trailing slash, then check against the known list.
  // We never key off arbitrary path segments because they could include input.
  const clean = path.split("?")[0]!.replace(/\/+$/, "") || "/";
  return (KNOWN_ENDPOINTS as readonly string[]).includes(clean)
    ? (clean as EndpointKey)
    : null;
}

export function recordHttpRequest(
  rawPath: string,
  statusCode: number,
  durationMs: number,
): void {
  httpLatency.push(durationMs);
  totalRequests += 1;
  if (statusCode >= 400 && statusCode < 500) total4xx += 1;
  if (statusCode >= 500) total5xx += 1;

  const key = normaliseEndpoint(rawPath);
  if (!key) return;
  const counters = endpointRequests.get(key)!;
  counters.total += 1;
  counters.byStatus.set(statusCode, (counters.byStatus.get(statusCode) ?? 0) + 1);

  if (key === "/api/check") {
    checkLatency.push(durationMs);
  }
}

export function recordCheckIdentifierType(t: string | undefined): void {
  if (t === "email") checkByType.email += 1;
  else if (t === "password") checkByType.password += 1;
  else checkByType.unknown += 1;
}

export function recordExternalCall(
  target: ExternalTarget,
  durationMs: number,
  ok: boolean,
): void {
  const s = external.get(target);
  if (!s) return;
  s.buf.push(durationMs);
  if (ok) s.ok += 1;
  else s.fail += 1;
}

export function recordCacheHit(): void {
  cacheHits += 1;
}

export function recordCacheMiss(): void {
  cacheMisses += 1;
}

export function recordRateLimited(): void {
  totalRateLimited += 1;
}

// ── HIBP cache state callback ────────────────────────────────────────────────

interface CacheState {
  populated: boolean;
  ageSeconds: number | null;
  entries: number | null;
}

type CacheStateProvider = () => CacheState;
let cacheStateProvider: CacheStateProvider = () => ({
  populated: false,
  ageSeconds: null,
  entries: null,
});

export function registerCacheStateProvider(fn: CacheStateProvider): void {
  cacheStateProvider = fn;
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

export interface MetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  requests: {
    total: number;
    rateLimited429: number;
    errors4xx: number;
    errors5xx: number;
    perEndpoint: Array<{
      endpoint: string;
      total: number;
      byStatus: Array<{ statusCode: number; count: number }>;
    }>;
    checkByType: { email: number; password: number; unknown: number };
  };
  latency: {
    allHttpMs: LatencyStats;
    checkMs: LatencyStats;
  };
  externalCalls: Array<{
    target: ExternalTarget;
    ok: number;
    fail: number;
    latencyMs: LatencyStats;
  }>;
  hibpCache: CacheState & {
    hits: number;
    misses: number;
    hitRate: number;
  };
  rateLimit: {
    rejected429: number;
    policies: RateLimitPolicy[];
  };
  history: HistoryEntry[];
  privacyNote: string;
}

export function snapshot(): MetricsSnapshot {
  const cacheState = cacheStateProvider();
  const cacheTotal = cacheHits + cacheMisses;

  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requests: {
      total: totalRequests,
      rateLimited429: totalRateLimited,
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
      allHttpMs: summarise(httpLatency),
      checkMs: summarise(checkLatency),
    },
    externalCalls: Array.from(external.entries()).map(([target, s]) => ({
      target,
      ok: s.ok,
      fail: s.fail,
      latencyMs: summarise(s.buf),
    })),
    hibpCache: {
      ...cacheState,
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: cacheTotal === 0 ? 0 : round(cacheHits / cacheTotal),
    },
    rateLimit: {
      rejected429: totalRateLimited,
      policies: rateLimitPolicies.slice(),
    },
    history: getHistory(),
    privacyNote:
      "No identifiers (emails, passwords, hashes, IPs) are recorded. Only request paths, status codes, durations, and counters.",
  };
}

// Test-only helper. Not exported via the route — only used by unit tests.
export function __resetForTests(): void {
  for (const c of endpointRequests.values()) {
    c.total = 0;
    c.byStatus.clear();
  }
  checkByType.email = 0;
  checkByType.password = 0;
  checkByType.unknown = 0;
  totalRequests = 0;
  total4xx = 0;
  total5xx = 0;
  totalRateLimited = 0;
  cacheHits = 0;
  cacheMisses = 0;
  rateLimitPolicies.length = 0;
  for (const s of external.values()) {
    s.ok = 0;
    s.fail = 0;
    s.buf.reset();
  }
  httpLatency.reset();
  checkLatency.reset();
  historyBuf.length = 0;
  prevTotalRequests = 0;
  prevCacheHits = 0;
  prevCacheMisses = 0;
}
