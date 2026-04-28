import type { Env } from "./types";

const CHECK_LIMIT_WINDOW_MS = 60_000;
const CHECK_LIMIT_MAX = 20;
const REJECTED_COUNTER_KEY = "rate_limit:rejected429";

function currentWindowStart(): number {
  const now = Date.now();
  return now - (now % CHECK_LIMIT_WINDOW_MS);
}

function getRateLimitKey(ip: string): string {
  return `rate_limit:check:${ip}:${currentWindowStart()}`;
}

export function getCheckPolicy() {
  return { endpoint: "/api/check", windowMs: CHECK_LIMIT_WINDOW_MS, max: CHECK_LIMIT_MAX };
}

export async function getRejectedCount(env: Env): Promise<number> {
  const raw = await env.PDEC_KV.get(REJECTED_COUNTER_KEY);
  return Number.parseInt(raw ?? "0", 10) || 0;
}

async function incrementRejectedCount(env: Env): Promise<void> {
  const current = await getRejectedCount(env);
  await env.PDEC_KV.put(REJECTED_COUNTER_KEY, String(current + 1), { expirationTtl: 60 * 60 * 24 * 7 });
}

export async function checkRateLimit(env: Env, ip: string): Promise<{ allowed: boolean }> {
  const key = getRateLimitKey(ip);
  const current = Number.parseInt((await env.PDEC_KV.get(key)) ?? "0", 10) || 0;
  if (current >= CHECK_LIMIT_MAX) {
    await incrementRejectedCount(env);
    return { allowed: false };
  }
  await env.PDEC_KV.put(key, String(current + 1), { expirationTtl: 120 });
  return { allowed: true };
}
