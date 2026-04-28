import { Router, type IRouter } from "express";
import { GetMetricsResponse } from "@workspace/api-zod";
import { snapshot } from "../lib/metrics.ts";

const router: IRouter = Router();

/**
 * Internal observability endpoint. Returns a snapshot of in-memory metrics —
 * counts, durations, cache state, and rate-limiter state — with no
 * identifiers attached. Intended for the `/stats` dashboard and ad-hoc
 * inspection during development; safe to expose publicly.
 *
 * The response is parsed through the generated Zod schema so the contract is
 * enforced at runtime, matching the validation pattern used by the other
 * routes in this server.
 */
router.get("/stats", (_req, res) => {
  const data = GetMetricsResponse.parse(snapshot());
  res.json(data);
});

export default router;
