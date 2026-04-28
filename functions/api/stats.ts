import { json, options } from "../_lib/http";
import { getCheckPolicy, getRejectedCount } from "../_lib/rate-limit";
import type { Env } from "../_lib/types";

let startedAt: number | null = null;

export const onRequestOptions = () => options();

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
    if (startedAt == null) startedAt = Date.now();
    let rejected = 0;
    try {
      rejected = await getRejectedCount(ctx.env);
    } catch {
      rejected = 0;
    }
    return json({
      startedAt: new Date(startedAt).toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      requests: {
        total: 0,
        rateLimited429: rejected,
        errors4xx: 0,
        errors5xx: 0,
        perEndpoint: [
          { endpoint: "/api/check", total: 0, byStatus: [] },
          { endpoint: "/api/healthz", total: 0, byStatus: [] },
          { endpoint: "/api/health", total: 0, byStatus: [] },
          { endpoint: "/api/stats", total: 0, byStatus: [] },
        ],
        checkByType: { email: 0, password: 0, unknown: 0 },
      },
      latency: {
        allHttpMs: { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
        checkMs: { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
      },
      externalCalls: [
        {
          target: "hibp.breaches",
          ok: 0,
          fail: 0,
          latencyMs: { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
        },
        {
          target: "xposedornot.checkEmail",
          ok: 0,
          fail: 0,
          latencyMs: { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
        },
        {
          target: "hibp.pwnedPasswords",
          ok: 0,
          fail: 0,
          latencyMs: { count: 0, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 },
        },
      ],
      hibpCache: {
        populated: false,
        ageSeconds: null,
        entries: null,
        hits: 0,
        misses: 0,
        hitRate: 0,
      },
      rateLimit: {
        rejected429: rejected,
        policies: [getCheckPolicy()],
      },
      history: [],
      privacyNote:
        "No identifiers (emails, passwords, hashes, IPs) are recorded. Only request paths, status codes, durations, and counters.",
    });
  };
