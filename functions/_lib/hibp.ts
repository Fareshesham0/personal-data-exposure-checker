import { metrics } from "./metrics";
import type { HibpBreach } from "./risk-scoring";

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
  breaches?: string[][];
}

const XPOSED_BASE = "https://api.xposedornot.com/v1";
const HIBP_PUBLIC_BASE = "https://haveibeenpwned.com/api/v3";
const PWNED_PASSWORDS_BASE = "https://api.pwnedpasswords.com";
const CACHE_TTL_MS = 60 * 60 * 1000;

let hibpBreachCachePromise: Promise<Map<string, HibpPublicBreach>> | null = null;
let cacheTimestamp = 0;
let lastCacheEntries: number | null = null;

metrics.registerCacheStateProvider(() => ({
  populated: hibpBreachCachePromise !== null && lastCacheEntries !== null,
  ageSeconds: cacheTimestamp === 0 ? null : Math.round((Date.now() - cacheTimestamp) / 1000),
  entries: lastCacheEntries,
}));

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

async function getHibpBreachCache(): Promise<Map<string, HibpPublicBreach>> {
  const now = Date.now();
  if (hibpBreachCachePromise && now - cacheTimestamp < CACHE_TTL_MS) {
    metrics.recordCacheHit();
    return hibpBreachCachePromise;
  }
  metrics.recordCacheMiss();
  cacheTimestamp = now;
  const start = performance.now();
  hibpBreachCachePromise = fetchWithTimeout(`${HIBP_PUBLIC_BASE}/breaches`, {
    headers: { "user-agent": "PDEC-FYP/1.0" },
  }, 10_000)
    .then((r) => r.json() as Promise<HibpPublicBreach[]>)
    .then((list) => {
      const map = new Map<string, HibpPublicBreach>();
      for (const b of list) map.set(b.Name.toLowerCase(), b);
      lastCacheEntries = map.size;
      metrics.recordExternalCall("hibp.breaches", performance.now() - start, true);
      return map;
    })
    .catch((error) => {
      metrics.recordExternalCall("hibp.breaches", performance.now() - start, false);
      hibpBreachCachePromise = null;
      throw error;
    });
  return hibpBreachCachePromise;
}

export async function checkEmailBreaches(email: string): Promise<HibpBreach[]> {
  const normalizedEmail = email.trim().toLowerCase();
  const url = `${XPOSED_BASE}/check-email/${encodeURIComponent(normalizedEmail)}`;
  const start = performance.now();
  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { "user-agent": "PDEC-FYP/1.0", accept: "application/json" } },
      8_000,
    );
    if (response.status === 404) {
      metrics.recordExternalCall("xposedornot.checkEmail", performance.now() - start, true);
      return [];
    }
    if (response.status === 429) {
      metrics.recordExternalCall("xposedornot.checkEmail", performance.now() - start, false);
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });
    }
    if (!response.ok) {
      metrics.recordExternalCall("xposedornot.checkEmail", performance.now() - start, false);
      throw Object.assign(new Error("Breach intelligence service temporarily unavailable"), { statusCode: 503 });
    }
    const data = (await response.json()) as XposedResponse;
    metrics.recordExternalCall("xposedornot.checkEmail", performance.now() - start, true);
    const breachNames = data.breaches && data.breaches.length > 0 ? data.breaches[0]! : [];
    if (breachNames.length === 0) return [];
    try {
      const cache = await getHibpBreachCache();
      return breachNames.map((name): HibpBreach => {
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
    } catch {
      return breachNames.map((name): HibpBreach => ({
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
    }
  } catch (error) {
    const e = error as Error & { statusCode?: number };
    if (e.statusCode) throw e;
    metrics.recordExternalCall("xposedornot.checkEmail", performance.now() - start, false);
    throw Object.assign(new Error("Breach intelligence service temporarily unavailable"), { statusCode: 503 });
  }
}

export async function checkPasswordPwned(password: string): Promise<{ found: boolean; count: number; sha1Prefix: string }> {
  const sha1 = await sha1UpperHex(password);
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const url = `${PWNED_PASSWORDS_BASE}/range/${prefix}`;
  const start = performance.now();
  let response: Response;
  try {
    response = await fetchWithTimeout(url, { headers: { "user-agent": "PDEC-FYP/1.0" } }, 8_000);
  } catch {
    metrics.recordExternalCall("hibp.pwnedPasswords", performance.now() - start, false);
    throw Object.assign(new Error("Password breach service temporarily unavailable"), { statusCode: 503 });
  }
  if (response.status === 429) {
    metrics.recordExternalCall("hibp.pwnedPasswords", performance.now() - start, false);
    throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });
  }
  if (!response.ok) {
    metrics.recordExternalCall("hibp.pwnedPasswords", performance.now() - start, false);
    throw Object.assign(new Error("Password breach service error"), { statusCode: 503 });
  }
  metrics.recordExternalCall("hibp.pwnedPasswords", performance.now() - start, true);
  const text = await response.text();
  for (const line of text.split("\n")) {
    const [hashSuffix, countStr] = line.trim().split(":");
    if (hashSuffix === suffix) {
      return { found: true, count: Number.parseInt(countStr ?? "0", 10), sha1Prefix: prefix };
    }
  }
  return { found: false, count: 0, sha1Prefix: prefix };
}
