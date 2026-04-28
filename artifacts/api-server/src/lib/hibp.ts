import { createHash } from "crypto";
import { logger } from "./logger.ts";
import {
  recordCacheHit,
  recordCacheMiss,
  recordExternalCall,
  registerCacheStateProvider,
} from "./metrics.ts";

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

/**
 * Completely free breach checking — no API key required.
 *
 * Email:    XposedOrNot (xposedornot.com) returns breach names per email.
 *           HIBP public /breaches endpoint returns full breach metadata.
 *           We combine them: XposedOrNot names → HIBP metadata lookup.
 *
 * Password: HIBP Pwned Passwords k-anonymity — only a 5-char SHA-1 prefix
 *           is transmitted. The raw password never leaves the server in any
 *           identifiable form.
 */

const XPOSED_BASE = "https://api.xposedornot.com/v1";
const HIBP_PUBLIC_BASE = "https://haveibeenpwned.com/api/v3";
const PWNED_PASSWORDS_BASE = "https://api.pwnedpasswords.com";

export interface HibpBreach {
  Name: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsSensitive: boolean;
}

interface HibpPublicBreach {
  Name: string;
  Title: string;
  Domain: string;
  BreachDate: string;
  AddedDate: string;
  ModifiedDate: string;
  PwnCount: number;
  Description: string;
  DataClasses: string[];
  IsVerified: boolean;
  IsFabricated: boolean;
  IsSensitive: boolean;
  IsRetired: boolean;
  IsSpamList: boolean;
}

let hibpBreachCachePromise: Promise<Map<string, HibpPublicBreach>> | null = null;
let cacheTimestamp = 0;
let lastCacheEntries: number | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

registerCacheStateProvider(() => ({
  populated: hibpBreachCachePromise !== null && lastCacheEntries !== null,
  ageSeconds:
    cacheTimestamp === 0 ? null : Math.round((Date.now() - cacheTimestamp) / 1000),
  entries: lastCacheEntries,
}));

function getHibpBreachCache(): Promise<Map<string, HibpPublicBreach>> {
  const now = Date.now();
  if (hibpBreachCachePromise && now - cacheTimestamp < CACHE_TTL_MS) {
    recordCacheHit();
    return hibpBreachCachePromise;
  }
  recordCacheMiss();
  cacheTimestamp = now;
  const start = process.hrtime.bigint();
  hibpBreachCachePromise = fetch(`${HIBP_PUBLIC_BASE}/breaches`, {
    headers: { "user-agent": "PDEC-FYP/1.0" },
    signal: AbortSignal.timeout(10_000),
  })
    .then((r) => r.json() as Promise<HibpPublicBreach[]>)
    .then((list) => {
      const map = new Map<string, HibpPublicBreach>();
      for (const b of list) {
        map.set(b.Name.toLowerCase(), b);
      }
      lastCacheEntries = map.size;
      recordExternalCall(
        "hibp.breaches",
        Number(process.hrtime.bigint() - start) / 1_000_000,
        true,
      );
      logger.info({ count: map.size }, "HIBP breach metadata cache refreshed");
      return map;
    })
    .catch((err) => {
      recordExternalCall(
        "hibp.breaches",
        Number(process.hrtime.bigint() - start) / 1_000_000,
        false,
      );
      hibpBreachCachePromise = null;
      throw err;
    });
  return hibpBreachCachePromise;
}

interface XposedResponse {
  breaches?: string[][];
  email?: string;
  status?: string;
  Error?: string;
}

export async function checkEmailBreaches(email: string): Promise<HibpBreach[]> {
  const normalizedEmail = email.trim().toLowerCase();
  const encoded = encodeURIComponent(normalizedEmail);
  const url = `${XPOSED_BASE}/check-email/${encoded}`;

  let xposedData: XposedResponse;
  const xposedStart = process.hrtime.bigint();
  const recordXposed = (ok: boolean) =>
    recordExternalCall(
      "xposedornot.checkEmail",
      Number(process.hrtime.bigint() - xposedStart) / 1_000_000,
      ok,
    );
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "PDEC-FYP/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (response.status === 404) {
      recordXposed(true);
      return [];
    }
    if (response.status === 429) {
      recordXposed(false);
      throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });
    }
    if (!response.ok) {
      recordXposed(false);
      logger.warn({ status: response.status }, "XposedOrNot returned error");
      throw Object.assign(new Error("Breach intelligence service temporarily unavailable"), {
        statusCode: 503,
      });
    }
    xposedData = (await response.json()) as XposedResponse;
    recordXposed(true);
  } catch (err: unknown) {
    const e = err as Error & { statusCode?: number };
    if (e.statusCode) throw e;
    recordXposed(false);
    logger.warn({ err: e.message }, "XposedOrNot network error");
    throw Object.assign(new Error("Breach intelligence service temporarily unavailable"), {
      statusCode: 503,
    });
  }

  const breachNames: string[] =
    xposedData.breaches && xposedData.breaches.length > 0 ? xposedData.breaches[0] : [];

  if (breachNames.length === 0) return [];

  let breachCache: Map<string, HibpPublicBreach>;
  try {
    breachCache = await getHibpBreachCache();
  } catch {
    logger.warn("HIBP metadata cache unavailable — returning name-only results");
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

  return breachNames.map((name): HibpBreach => {
    const meta = breachCache.get(name.toLowerCase());
    if (meta) {
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
    }
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
  });
}

export interface PasswordCheckResult {
  found: boolean;
  count: number;
  sha1Prefix: string;
}

export async function checkPasswordPwned(password: string): Promise<PasswordCheckResult> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const url = `${PWNED_PASSWORDS_BASE}/range/${prefix}`;

  const ppStart = process.hrtime.bigint();
  const recordPp = (ok: boolean) =>
    recordExternalCall(
      "hibp.pwnedPasswords",
      Number(process.hrtime.bigint() - ppStart) / 1_000_000,
      ok,
    );

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": "PDEC-FYP/1.0" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err: unknown) {
    const e = err as Error;
    recordPp(false);
    logger.warn({ err: e.message }, "HIBP Pwned Passwords network error");
    throw Object.assign(new Error("Password breach service temporarily unavailable"), {
      statusCode: 503,
    });
  }

  if (response.status === 429) {
    recordPp(false);
    throw Object.assign(new Error("Rate limit exceeded"), { statusCode: 429 });
  }
  if (!response.ok) {
    recordPp(false);
    throw Object.assign(new Error("Password breach service error"), { statusCode: 503 });
  }
  recordPp(true);

  const text = await response.text();
  for (const line of text.split("\n")) {
    const [hashSuffix, countStr] = line.trim().split(":");
    if (hashSuffix === suffix) {
      return { found: true, count: parseInt(countStr, 10), sha1Prefix: prefix };
    }
  }

  return { found: false, count: 0, sha1Prefix: prefix };
}
