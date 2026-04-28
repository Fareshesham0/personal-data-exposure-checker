import { GetMetricsResponse } from "../../lib/api-zod/src/index";
import { json, options, withMetrics } from "../_lib/http";
import { metrics } from "../_lib/metrics";
import { getCheckPolicy, getRejectedCount } from "../_lib/rate-limit";
import type { Env } from "../_lib/types";

metrics.registerRateLimitPolicy(getCheckPolicy());

export const onRequestOptions = () => options();

export const onRequestGet: PagesFunction<Env> = async (ctx) =>
  withMetrics(ctx, async () => {
    const rejected = await getRejectedCount(ctx.env);
    const snapshot = await metrics.snapshot(rejected);
    const data = GetMetricsResponse.parse(snapshot);
    return json(data);
  });
