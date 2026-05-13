import type { HibpBreach } from "./risk-scoring";
import type { Env } from "./types";

interface HibpPublicBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsSensitive: boolean;
}

interface XposedResponse {
  breaches?: unknown;
  status?: unknown;
  Error?: unknown;
  error?: unknown;
  message?: unknown;
}

interface CachedEmailBreaches {
  v: 1;
  breaches: HibpBreach[];
}

const XPOSED_BASE = "https://api.xposedornot.com/v1";
const HIBP_PUBLIC_BASE = "https://haveibeenpwned.com/api/v3";
const PWNED_PASSWORDS_BASE = "https://api.pwnedpasswords.com";
const CACHE_TTL_MS = 60 * 60 * 1000;
const EMAIL_CACHE_TTL_SECONDS = 60 * 60 * 6;
const XPOSED_MIN_INTERVAL_MS = 1000;
const XPOSED_RETRY_DELAYS_MS = [1000, 2000, 4000, 4000] as const;
const XPOSED_GLOBAL_QUEUE_WAIT_MS = 12_000;
const XPOSED_GLOBAL_NEXT_KEY = "xposed:global:nextAllowedAt:v1";
const HIBP_EMAIL_MIN_INTERVAL_MS = 1500;
const HIBP_EMAIL_RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

let hibpBreachCachePromise: Promise<Map<string, HibpPublicBreach>> | null = null;
let cacheTimestamp = 0;
let lastCacheEntries: number | null = null;
let xposedNextAllowedAt = 0;
let xposedRateGate: Promise<void> = Promise.resolve();
let hibpEmailNextAllowedAt = 0;
let hibpEmailRateGate: Promise<void> = Promise.resolve();

const NO_BREACH_MARKERS = new Set([
  "not found",
  "no breach found",
  "no breaches found",
  "no data breach found",
]);

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function sha1UpperHex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function xposedThrottle(): Promise<void> {
  const previous = xposedRateGate;
  let releaseGate: (() => void) | null = null;
  xposedRateGate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  await previous;
  try {
    const now = Date.now();
    const waitMs = Math.max(0, xposedNextAllowedAt - now);
    if (waitMs > 0) await sleep(waitMs);
    xposedNextAllowedAt = Date.now() + XPOSED_MIN_INTERVAL_MS;
  } finally {
    releaseGate?.();
  }
}

async function hibpEmailThrottle(): Promise<void> {
  const previous = hibpEmailRateGate;
  let releaseGate: (() => void) | null = null;
  hibpEmailRateGate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  await previous;
  try {
    const now = Date.now();
    const waitMs = Math.max(0, hibpEmailNextAllowedAt - now);
    if (waitMs > 0) await sleep(waitMs);
    hibpEmailNextAllowedAt = Date.now() + HIBP_EMAIL_MIN_INTERVAL_MS;
  } finally {
    releaseGate?.();
  }
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const asSeconds = Number.parseInt(headerValue, 10);
  if (Number.isNaN(asSeconds) || asSeconds < 0) return null;
  return asSeconds * 1000;
}

async function fetchXposedWithRetry(url: string, xposedApiKey: string | undefined, env: Env): Promise<Response> {
  for (let attempt = 0; attempt <= XPOSED_RETRY_DELAYS_MS.length; attempt += 1) {
    await xposedThrottle();
    await waitForXposedGlobalSlot(env, XPOSED_GLOBAL_QUEUE_WAIT_MS);
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "user-agent": "PDEC-FYP/1.0",
          accept: "application/json",
          ...(xposedApiKey ? { "x-api-key": xposedApiKey } : {}),
        },
      },
      8_000,
    );

    if (response.status !== 429) {
      return response;
    }

    if (attempt >= XPOSED_RETRY_DELAYS_MS.length) {
      return response;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    const backoffMs = XPOSED_RETRY_DELAYS_MS[attempt]!;
    await sleep(Math.max(backoffMs, retryAfterMs ?? 0));
  }
  throw new Error("unreachable");
}

async function waitForXposedGlobalSlot(env: Env, maxWaitMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    const now = Date.now();
    const raw = await env.PDEC_KV.get(XPOSED_GLOBAL_NEXT_KEY);
    const nextAllowedAt = Number.parseInt(raw ?? "0", 10) || 0;
    if (nextAllowedAt > now) {
      await sleep(Math.min(nextAllowedAt - now, 400));
      continue;
    }

    const candidateNext = now + XPOSED_MIN_INTERVAL_MS;
    await env.PDEC_KV.put(XPOSED_GLOBAL_NEXT_KEY, String(candidateNext), {
      expirationTtl: 120,
    });
    const verifyRaw = await env.PDEC_KV.get(XPOSED_GLOBAL_NEXT_KEY);
    const verifyValue = Number.parseInt(verifyRaw ?? "0", 10) || 0;
    if (verifyValue === candidateNext) {
      return;
    }

    await sleep(100);
  }

  throw Object.assign(new Error("Rate limit queue wait exceeded"), { statusCode: 429 });
}

async function fetchHibpEmailWithRetry(url: string, apiKey: string): Promise<Response> {
  for (let attempt = 0; attempt <= HIBP_EMAIL_RETRY_DELAYS_MS.length; attempt += 1) {
    await hibpEmailThrottle();
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "user-agent": "PDEC-FYP/1.0",
          "hibp-api-key": apiKey,
        },
      },
      8_000,
    );

    if (response.status !== 429) {
      return response;
    }

    if (attempt >= HIBP_EMAIL_RETRY_DELAYS_MS.length) {
      return response;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    const backoffMs = HIBP_EMAIL_RETRY_DELAYS_MS[attempt]!;
    await sleep(Math.max(backoffMs, retryAfterMs ?? 0));
  }
  throw new Error("unreachable");
}

async function getEmailCacheKey(provider: "xposed" | "hibp", normalizedEmail: string): Promise<string> {
  const digest = await sha256Hex(normalizedEmail);
  return `${provider}:email:v1:${digest}`;
}

async function getCachedEmailBreaches(env: Env, cacheKey: string): Promise<CachedEmailBreaches | null> {
  try {
    return (await env.PDEC_KV.get(cacheKey, "json")) as CachedEmailBreaches | null;
  } catch {
    return null;
  }
}

async function putCachedEmailBreaches(env: Env, cacheKey: string, breaches: HibpBreach[]): Promise<void> {
  try {
    await env.PDEC_KV.put(cacheKey, JSON.stringify({ v: 1, breaches } satisfies CachedEmailBreaches), {
      expirationTtl: EMAIL_CACHE_TTL_SECONDS,
    });
  } catch {
    // Cache failures should not block live breach checks.
  }
}

async function getHibpBreachCache(): Promise<Map<string, HibpPublicBreach>> {
  const now = Date.now();
  if (hibpBreachCachePromise && now - cacheTimestamp < CACHE_TTL_MS) {
    return hibpBreachCachePromise;
  }
  cacheTimestamp = now;
  hibpBreachCachePromise = fetchWithTimeout(`${HIBP_PUBLIC_BASE}/breaches`, {
    headers: { "user-agent": "PDEC-FYP/1.0" },
  }, 10_000)
    .then((r) => r.json() as Promise<HibpPublicBreach[]>)
    .then((list) => {
      const map = new Map<string, HibpPublicBreach>();
      for (const b of list) map.set(b.Name.toLowerCase(), b);
      lastCacheEntries = map.size;
      return map;
    })
    .catch((error) => {
      hibpBreachCachePromise = null;
      throw error;
    });
  return hibpBreachCachePromise;
}

function normalizeBreachNames(data: XposedResponse): string[] {
  if (typeof data.status === "string" && data.status.toLowerCase().includes("not found")) {
    return [];
  }
  if (typeof data.Error === "string" && data.Error.toLowerCase().includes("not found")) {
    return [];
  }
  if (typeof data.error === "string" && data.error.toLowerCase().includes("not found")) {
    return [];
  }

  const raw = data.breaches;
  if (!raw) return [];

  const names: string[] = [];
  const append = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) names.push(trimmed);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) append(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const nested of Object.values(value as Record<string, unknown>)) append(nested);
    }
  };

  append(raw);

  const unique = Array.from(new Set(names));
  if (unique.length === 1 && NO_BREACH_MARKERS.has(unique[0]!.toLowerCase())) {
    return [];
  }
  return unique;
}

export async function checkEmailBreaches(email: string, env: Env): Promise<HibpBreach[]> {
  const normalizedEmail = email.trim().toLowerCase();
  const usingHibpPaid = typeof env.HIBP_API_KEY === "string" && env.HIBP_API_KEY.trim().length > 0;
  const cacheKey = await getEmailCacheKey(usingHibpPaid ? "hibp" : "xposed", normalizedEmail);
  const cached = await getCachedEmailBreaches(env, cacheKey);
  if (cached && cached.v === 1 && Array.isArray(cached.breaches)) {
    return cached.breaches;
  }

  if (usingHibpPaid) {
    const url = `${HIBP_PUBLIC_BASE}/breachedaccount/${encodeURIComponent(normalizedEmail)}?truncateResponse=false`;
    try {
      const response = await fetchHibpEmailWithRetry(url, env.HIBP_API_KEY!.trim());
      if (response.status === 404) {
        await putCachedEmailBreaches(env, cacheKey, []);
        return [];
      }
      if (response.status === 429) {
        throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });
      }
      if (response.status === 401 || response.status === 403) {
        throw Object.assign(new Error("Invalid or unauthorized HIBP API key"), { statusCode: 503 });
      }
      if (!response.ok) {
        throw Object.assign(new Error("Breach intelligence service temporarily unavailable"), { statusCode: 503 });
      }

      const records = (await response.json()) as HibpPublicBreach[];
      const breaches = records.map((b): HibpBreach => ({
        Name: b.Title || b.Name,
        Domain: b.Domain,
        BreachDate: b.BreachDate,
        AddedDate: b.AddedDate,
        PwnCount: b.PwnCount,
        Description: b.Description ? stripHtml(b.Description) : "",
        DataClasses: Array.isArray(b.DataClasses) ? b.DataClasses : [],
        IsVerified: !!b.IsVerified,
        IsSensitive: !!b.IsSensitive,
      }));
      await putCachedEmailBreaches(env, cacheKey, breaches);
      return breaches;
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      if (e.statusCode) throw e;
      throw Object.assign(new Error("Breach intelligence service temporarily unavailable"), { statusCode: 503 });
    }
  }

  const url = `${XPOSED_BASE}/check-email/${encodeURIComponent(normalizedEmail)}`;
  try {
    const response = await fetchXposedWithRetry(url, env.XPOSEDORNOT_API_KEY, env);
    if (response.status === 404) {
      await putCachedEmailBreaches(env, cacheKey, []);
      return [];
    }
    if (response.status === 429) {
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });
    }
    if (!response.ok) {
      throw Object.assign(new Error("Breach intelligence service temporarily unavailable"), { statusCode: 503 });
    }

    const data = (await response.json()) as XposedResponse;
    const breachNames = normalizeBreachNames(data);
    if (breachNames.length === 0) {
      await putCachedEmailBreaches(env, cacheKey, []);
      return [];
    }

    try {
      const cache = await getHibpBreachCache();
      const resolvedBreaches = breachNames.map((name): HibpBreach => {
        const meta = cache.get(name.toLowerCase());
        if (!meta) {
          return {
            Name: name,
            Domain: "",
            BreachDate: "",
            AddedDate: new Date().toISOString(),
            PwnCount: 0,
            Description: "",
            DataClasses: ["Email addresses"],
            IsVerified: false,
            IsSensitive: false,
          };
        }
        return {
          Name: meta.Title || meta.Name,
          Domain: meta.Domain,
          BreachDate: meta.BreachDate,
          AddedDate: meta.AddedDate,
          PwnCount: meta.PwnCount,
          Description: meta.Description ? stripHtml(meta.Description) : "",
          DataClasses: meta.DataClasses,
          IsVerified: meta.IsVerified,
          IsSensitive: meta.IsSensitive,
        };
      });
      await putCachedEmailBreaches(env, cacheKey, resolvedBreaches);
      return resolvedBreaches;
    } catch {
      const fallbackBreaches = breachNames.map((name): HibpBreach => ({
        Name: name,
        Domain: "",
        BreachDate: "",
        AddedDate: new Date().toISOString(),
        PwnCount: 0,
        Description: "",
        DataClasses: ["Email addresses"],
        IsVerified: false,
        IsSensitive: false,
      }));
      await putCachedEmailBreaches(env, cacheKey, fallbackBreaches);
      return fallbackBreaches;
    }
  } catch (error) {
    const e = error as Error & { statusCode?: number };
    if (e.statusCode) throw e;
    throw Object.assign(new Error("Breach intelligence service temporarily unavailable"), { statusCode: 503 });
  }
}

export async function checkPasswordPwned(password: string): Promise<{ found: boolean; count: number; sha1Prefix: string }> {
  const sha1 = await sha1UpperHex(password);
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const url = `${PWNED_PASSWORDS_BASE}/range/${prefix}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { headers: { "user-agent": "PDEC-FYP/1.0" } }, 8_000);
  } catch {
    throw Object.assign(new Error("Password breach service temporarily unavailable"), { statusCode: 503 });
  }
  if (response.status === 429) {
    throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });
  }
  if (!response.ok) {
    throw Object.assign(new Error("Password breach service error"), { statusCode: 503 });
  }
  const text = await response.text();
  for (const line of text.split("\n")) {
    const [hashSuffix, countStr] = line.trim().split(":");
    if (hashSuffix === suffix) {
      return { found: true, count: Number.parseInt(countStr ?? "0", 10), sha1Prefix: prefix };
    }
  }
  return { found: false, count: 0, sha1Prefix: prefix };
}
