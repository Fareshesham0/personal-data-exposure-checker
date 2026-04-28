import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function handle(_req: Request, res: Response): void {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

// `/healthz` is the canonical Kubernetes-style spelling used in the OpenAPI
// spec. `/health` is provided as a convenience alias so monitoring tools
// that expect that exact path also work, and so the metrics dashboard can
// bucket traffic for either name without ambiguity.
router.get("/healthz", handle);
router.get("/health", handle);

export default router;
