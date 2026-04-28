import { getIp, json, options, parseJson } from "../_lib/http";
import { checkRateLimit } from "../_lib/rate-limit";
import type { Env } from "../_lib/types";

interface CheckExposureBody {
  identifier: string;
  identifierType: "email" | "password";
}

function validateBody(body: unknown): { ok: true; data: CheckExposureBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request body." };
  const b = body as Record<string, unknown>;
  if (typeof b.identifier !== "string") return { ok: false, error: "identifier must be a string." };
  if (b.identifierType !== "email" && b.identifierType !== "password") {
    return { ok: false, error: "identifierType must be either email or password." };
  }
  return {
    ok: true,
    data: {
      identifier: b.identifier,
      identifierType: b.identifierType,
    },
  };
}

export const onRequestOptions = () => options();

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
    const ip = getIp(ctx.request);
    const allowed = await checkRateLimit(ctx.env, ip);
    if (!allowed.allowed) {
      return json(
        { error: "Too many requests. Please wait a moment and try again." },
        429,
      );
    }

    const body = await parseJson<unknown>(ctx.request);
    if (!body) return json({ error: "Invalid JSON body." }, 400);

    const parsed = validateBody(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const { identifier, identifierType } = parsed.data;

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
        const [{ checkEmailBreaches }, { assessBreachSeverity, assessEmailRisk }] =
          await Promise.all([import("../_lib/hibp"), import("../_lib/risk-scoring")]);
        const breaches = await checkEmailBreaches(identifier, ctx.env.XPOSEDORNOT_API_KEY);
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

        const result = {
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
        };
        return json(result);
      }

      const [{ checkPasswordPwned }, { assessPasswordRisk }] = await Promise.all([
        import("../_lib/hibp"),
        import("../_lib/risk-scoring"),
      ]);
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

      const result = {
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
      };
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
  };
