import { Router, type IRouter } from "express";
import healthRouter from "./health.ts";
import breachRouter from "./breach.ts";
import statsRouter from "./stats.ts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(breachRouter);
router.use(statsRouter);

export default router;
