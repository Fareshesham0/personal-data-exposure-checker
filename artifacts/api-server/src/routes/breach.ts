import { Router, type IRouter } from "express";
import { CheckExposureBody, CheckExposureResponse } from "@workspace/api-zod";
import { checkEmailBreaches, checkPasswordPwned } from "../lib/hibp.ts";
import {
  assessBreachSeverity,
  assessEmailRisk,
  assessPasswordRisk,
} from "../lib/risk-scoring.ts";

const router: IRouter = Router();

router.post("/check", async (req, res): Promise<void> => {
  const parsed = CheckExposureBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { identifier, identifierType } = parsed.data;

  if (identifierType === "email") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalised = identifier.trim().toLowerCase();
    if (!emailRegex.test(normalised)) {
      res.status(400).json({ error: "Please provide a valid email address." });
      return;
    }
  }

  if (identifierType === "password" && identifier.length < 1) {
    res.status(400).json({ error: "Password cannot be empty." });
    return;
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

      res.json(result);
      return;
    }

    if (identifierType === "password") {
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

      res.json(result);
      return;
    }

    res.status(400).json({ error: "Invalid identifier type" });
  } catch (err: unknown) {
    const error = err as Error & { statusCode?: number };
    const statusCode = error.statusCode ?? 503;

    if (statusCode === 429) {
      req.log.warn("HIBP rate limit hit");
      res.status(429).json({ error: "Too many requests. Please wait a moment and try again." });
      return;
    }

    req.log.error({ err: error.message }, "Breach check failed");
    res.status(statusCode).json({ error: "Breach intelligence service is temporarily unavailable." });
  }
});

export default router;
