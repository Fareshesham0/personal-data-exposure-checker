import type { PagesContext } from "./types";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
} as const;

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

export function options(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function getPathname(request: Request): string {
  return new URL(request.url).pathname;
}

export function getIp(request: Request): string {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function withMetrics<T>(
  ctx: PagesContext,
  fn: () => Promise<Response>,
): Promise<Response> {
  const { metrics } = await import("./metrics");
  const start = performance.now();
  const path = getPathname(ctx.request);
  try {
    const res = await fn();
    metrics.recordHttpRequest(path, res.status, performance.now() - start);
    return res;
  } catch (error) {
    metrics.recordHttpRequest(path, 500, performance.now() - start);
    throw error;
  }
}
