import { HealthCheckResponse } from "../../lib/api-zod/src/index";
import { json, options, withMetrics } from "../_lib/http";
import type { Env } from "../_lib/types";

export const onRequestOptions = () => options();

export const onRequestGet: PagesFunction<Env> = async (ctx) =>
  withMetrics(ctx, async () => {
    const data = HealthCheckResponse.parse({ status: "ok" });
    return json(data);
  });
