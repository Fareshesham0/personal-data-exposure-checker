import { describe, it, before } from "node:test";
import { strict as assert } from "node:assert";
import {
  __resetForTests,
  recordCacheHit,
  recordCacheMiss,
  recordCheckIdentifierType,
  recordExternalCall,
  recordHttpRequest,
  recordRateLimited,
  registerCacheStateProvider,
  registerRateLimitPolicy,
  snapshot,
} from "./metrics.ts";

describe("metrics module", () => {
  before(() => {
    __resetForTests();
  });

  it("aggregates request counts per known endpoint and ignores unknown paths", () => {
    recordHttpRequest("/api/check", 200, 12);
    recordHttpRequest("/api/check", 200, 8);
    recordHttpRequest("/api/check", 400, 2);
    recordHttpRequest("/api/healthz", 200, 1);
    // Unknown path is still timed but not bucketed by endpoint.
    recordHttpRequest("/api/unknown", 404, 5);

    const s = snapshot();
    const check = s.requests.perEndpoint.find((p) => p.endpoint === "/api/check")!;
    const healthz = s.requests.perEndpoint.find((p) => p.endpoint === "/api/healthz")!;
    assert.equal(check.total, 3);
    assert.equal(healthz.total, 1);
    // `requests.total` is a true global counter — every recorded HTTP request
    // increments it, including unknown paths. This keeps it consistent with
    // the 4xx/5xx counters (which also span unknown paths) and matches what
    // the dashboard shows under the "Total requests" card.
    assert.equal(s.requests.total, 5);
    assert.equal(s.requests.errors4xx, 2); // 400 and 404
    assert.equal(s.latency.checkMs.count, 3);
    assert.equal(s.latency.allHttpMs.count, 5);
    // perEndpoint must NOT include the unknown path — only the four
    // tracked routes (/api/check, /api/healthz, /api/health, /api/stats)
    // are bucketed.
    assert.equal(s.requests.perEndpoint.length, 4);
    assert.ok(!s.requests.perEndpoint.some((p) => p.endpoint === "/api/unknown"));
    // Privacy note must always be present in the snapshot — it is part of
    // the public contract surfaced on the /stats dashboard so reviewers
    // can verify the no-identifiers guarantee.
    assert.equal(typeof s.privacyNote, "string");
    assert.ok(s.privacyNote.length > 0);
  });

  it("computes percentiles from the rolling latency window", () => {
    __resetForTests();
    for (let i = 1; i <= 100; i++) {
      recordHttpRequest("/api/check", 200, i);
    }
    const s = snapshot();
    assert.equal(s.latency.checkMs.count, 100);
    assert.ok(s.latency.checkMs.p50Ms >= 49 && s.latency.checkMs.p50Ms <= 51);
    assert.ok(s.latency.checkMs.p95Ms >= 94 && s.latency.checkMs.p95Ms <= 96);
    assert.ok(s.latency.checkMs.p99Ms >= 98 && s.latency.checkMs.p99Ms <= 100);
    assert.ok(Math.abs(s.latency.checkMs.meanMs - 50.5) < 0.5);
  });

  it("tracks per-type check counts, external calls, cache hit rate, and 429s", () => {
    __resetForTests();
    recordCheckIdentifierType("email");
    recordCheckIdentifierType("email");
    recordCheckIdentifierType("password");
    recordCheckIdentifierType(undefined);

    recordExternalCall("hibp.pwnedPasswords", 100, true);
    recordExternalCall("hibp.pwnedPasswords", 200, false);
    recordExternalCall("xposedornot.checkEmail", 50, true);

    recordCacheHit();
    recordCacheHit();
    recordCacheHit();
    recordCacheMiss();

    recordRateLimited();
    recordRateLimited();

    const s = snapshot();
    assert.deepEqual(s.requests.checkByType, {
      email: 2,
      password: 1,
      unknown: 1,
    });

    const pp = s.externalCalls.find((e) => e.target === "hibp.pwnedPasswords")!;
    assert.equal(pp.ok, 1);
    assert.equal(pp.fail, 1);
    assert.equal(pp.latencyMs.count, 2);

    assert.equal(s.hibpCache.hits, 3);
    assert.equal(s.hibpCache.misses, 1);
    assert.equal(s.hibpCache.hitRate, 0.75);

    assert.equal(s.rateLimit.rejected429, 2);
    assert.equal(s.requests.rateLimited429, 2);
  });

  it("exposes registered rate-limit policies and cache state via providers", () => {
    __resetForTests();
    registerRateLimitPolicy({ endpoint: "/api/check", windowMs: 60_000, max: 20 });
    registerCacheStateProvider(() => ({
      populated: true,
      ageSeconds: 42,
      entries: 1234,
    }));

    const s = snapshot();
    assert.equal(s.rateLimit.policies.length, 1);
    assert.deepEqual(s.rateLimit.policies[0], {
      endpoint: "/api/check",
      windowMs: 60_000,
      max: 20,
    });
    assert.equal(s.hibpCache.populated, true);
    assert.equal(s.hibpCache.ageSeconds, 42);
    assert.equal(s.hibpCache.entries, 1234);
  });

  it("never records identifier strings — only counts and durations", () => {
    __resetForTests();
    recordHttpRequest("/api/check", 200, 5);
    recordCheckIdentifierType("email");

    const s = snapshot();
    const json = JSON.stringify(s);
    // Spot-check: nothing in the snapshot should be a typical identifier.
    assert.equal(json.includes("@"), false, "snapshot must not contain emails");
    assert.equal(
      /[A-F0-9]{40}/.test(json),
      false,
      "snapshot must not contain SHA-1 hashes",
    );
    assert.ok(s.privacyNote.toLowerCase().includes("no identifier"));
  });
});
