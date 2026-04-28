import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes/index.ts";
import { logger } from "./lib/logger.ts";
import { metricsMiddleware } from "./middlewares/metrics.ts";
import { recordRateLimited, registerRateLimitPolicy } from "./lib/metrics.ts";

const app: Express = express();

app.use(helmet());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(metricsMiddleware);

const CHECK_LIMIT_WINDOW_MS = 60 * 1000;
const CHECK_LIMIT_MAX = 20;
registerRateLimitPolicy({
  endpoint: "/api/check",
  windowMs: CHECK_LIMIT_WINDOW_MS,
  max: CHECK_LIMIT_MAX,
});

const checkLimiter = rateLimit({
  windowMs: CHECK_LIMIT_WINDOW_MS,
  max: CHECK_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    recordRateLimited();
    res.status(429).json({
      error: "Too many requests. Please wait a moment and try again.",
    });
  },
});

app.use("/api/check", checkLimiter);
app.use("/api", router);

export default app;
