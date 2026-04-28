import type { RequestHandler } from "express";
import {
  recordCheckIdentifierType,
  recordHttpRequest,
} from "../lib/metrics.ts";

/**
 * Records request duration and outcome for every HTTP request. Uses the route
 * pattern when Express has resolved one (e.g. `/api/check`), falling back to
 * the original URL — never the request body — so no user-supplied data is
 * captured.
 */
export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const path =
      req.baseUrl && req.route?.path
        ? `${req.baseUrl}${req.route.path === "/" ? "" : req.route.path}`
        : (req.originalUrl ?? req.url ?? "").split("?")[0]!;
    recordHttpRequest(path, res.statusCode, durationMs);

    if (path === "/api/check" && req.method === "POST") {
      const body = req.body as { identifierType?: unknown } | undefined;
      const t =
        typeof body?.identifierType === "string" ? body.identifierType : undefined;
      recordCheckIdentifierType(t);
    }
  });

  next();
};
