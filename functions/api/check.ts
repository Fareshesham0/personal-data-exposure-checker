import {
  CheckExposureBody,
  CheckExposureResponse,
} from "../../lib/api-zod/src/index";
import { checkEmailBreaches, checkPasswordPwned } from "../_lib/hibp";
import { getIp, json, options, parseJson, withMetrics } from "../_lib/http";
import { metrics } from "../_lib/metrics";
import {
  checkRateLimit,
  getCheckPolicy,
} from "../_lib/rate-limit";
import {
  assessBreachSeverity,
  assessEmailRisk,
  assessPasswordRisk,
} from "../_lib/risk-scoring";
import type { Env } from "../_lib/types";

metrics.registerRateLimitPolicy(getCheckPolicy());

export const onRequestOptions = () => options();

export const onRequestPost: PagesFunction<Env> = async (ctx) =>
  withMetrics(ctx, async () => {
    const ip = getIp(ctx.request);
    const allowed = await checkRateLimit(ctx.env, ip);
    if (!allowed.allowed) {
      metrics.recordRateLimited();
      return json(
        { error: "Too many requests. Please wait a moment and try again." },
        429,
      );
    }

    const body = await parseJson<unknown>(ctx.request);
    if (!body) return json({ error: "Invalid JSON body." }, 400);

    const parsed = CheckExposureBody.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.message }, 400);

    const { identifier, identifierType } = parsed.data;
    metrics.recordCheckIdentifierType(identifierType);

    if (identifierType === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const normalized = identifier.trim().toLowerCase();
      if (!emailRegex.test(normalized)) {
        return json({ error: "Please provide a valid email address." }, 400);
      }
    }

    if (identifierType === "password" && identifier.length < 1) {
      return json({ error: "Password cannot be empty." }, 400);
    }

    try {
      if (identifierType === "email") {
        const breaches = await checkEmailBreaches(identifier);
        const { riskLevel, riskScore, riskExplanation, recommendations, factors } =
          assessEmailRisk(breaches);

        const mappedBreaches = breaches.map((b) => {
          const severity = assessBreachSeverity(b);
          return {
            name: b.Name,
            domain: b.Domain || null,
            breachDate: b.BreachDate || null,
            addedDate: b.AddedDate,
            pwnCount: b.PwnCount || null,
            dataClasses: b.DataClasses,
            description: b.Description || null,
            isVerified: b.IsVerified,
            isSensitive: b.IsSensitive,
            severityScore: severity.score,
            severityLevel: severity.level,
          };
        });

        const result = CheckExposureResponse.parse({
          exposed: breaches.length > 0,
          breachCount: breaches.length,
          breaches: mappedBreaches,
          riskLevel,
          riskScore,
          factors,
          riskExplanation,
          recommendations,
          checkedAt: new Date().toISOString(),
          pwnedCount: null,
        });
        return json(result);
      }

      const { found, count } = await checkPasswordPwned(identifier);
      const { riskLevel, riskScore, riskExplanation, recommendations, factors } =
        assessPasswordRisk(found, count);

      const breaches = found
        ? [
            {
              name: "Pwned Passwords Database",
              domain: "haveibeenpwned.com",
              breachDate: null,
              addedDate: new Date().toISOString(),
              pwnCount: count,
              dataClasses: ["Passwords"],
              description: `This password has been seen ${count.toLocaleString()} time${count !== 1 ? "s" : ""} across various data breaches collected by Have I Been Pwned. Using it puts any account at risk.`,
              isVerified: true,
              isSensitive: true,
              severityScore: riskScore,
              severityLevel:
                riskScore >= 60 ? "high" : riskScore >= 30 ? "medium" : "low",
            },
          ]
        : [];

      const result = CheckExposureResponse.parse({
        exposed: found,
        breachCount: found ? 1 : 0,
        breaches,
        riskLevel,
        riskScore,
        factors,
        riskExplanation,
        recommendations,
        checkedAt: new Date().toISOString(),
        pwnedCount: found ? count : null,
      });
      return json(result);
    } catch (error) {
      const e = error as Error & { statusCode?: number };
      if (e.statusCode === 429) {
        return json(
          { error: "Too many requests. Please wait a moment and try again." },
          429,
        );
      }
      return json(
        { error: "Breach intelligence service is temporarily unavailable." },
        e.statusCode ?? 503,
      );
    }
  });
