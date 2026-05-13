import { getIp, json, options, parseJson } from "../_lib/http";
import type { Env } from "../_lib/types";

const FEEDBACK_TO_EMAIL = "pdec.contectus@gmail.com";
const RESEND_API_BASE = "https://api.resend.com";
const DEFAULT_FROM_EMAIL = "PDEC Feedback <onboarding@resend.dev>";
const FEEDBACK_WINDOW_MS = 60_000;
const FEEDBACK_MAX_PER_WINDOW = 5;
const FEEDBACK_TTL_SECONDS = 60 * 60 * 24 * 30;

interface FeedbackBody {
  issueType: string;
  message: string;
  website?: string;
}

function currentWindowStart(): number {
  const now = Date.now();
  return now - (now % FEEDBACK_WINDOW_MS);
}

function feedbackRateLimitKey(ip: string): string {
  return `rate_limit:feedback:${ip}:${currentWindowStart()}`;
}

function validateFeedback(body: unknown): { ok: true; data: FeedbackBody } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request body." };
  const b = body as Record<string, unknown>;
  const issueType = typeof b.issueType === "string" ? b.issueType.trim() : "";
  const message = typeof b.message === "string" ? b.message.trim() : "";
  const website = typeof b.website === "string" ? b.website.trim() : "";

  if (!issueType) return { ok: false, error: "Please select an issue type." };
  if (!message) return { ok: false, error: "Please describe your feedback." };
  if (message.length > 3000) return { ok: false, error: "Feedback message is too long." };
  if (website) return { ok: false, error: "Spam validation failed." };

  return { ok: true, data: { issueType, message } };
}

async function allowFeedback(env: Env, ip: string): Promise<boolean> {
  const key = feedbackRateLimitKey(ip);
  const current = Number.parseInt((await env.PDEC_KV.get(key)) ?? "0", 10) || 0;
  if (current >= FEEDBACK_MAX_PER_WINDOW) return false;
  await env.PDEC_KV.put(key, String(current + 1), { expirationTtl: 120 });
  return true;
}

async function sendFeedbackEmail(
  env: Env,
  feedback: { issueType: string; message: string; receivedAt: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, reason: "RESEND_API_KEY is not configured." };

  const from = env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
  const subject = `[PDEC Feedback] ${feedback.issueType}`;
  const text = [
    "New feedback submitted from Personal Data Exposure Checker.",
    "",
    `Issue type: ${feedback.issueType}`,
    `Received at: ${feedback.receivedAt}`,
    "",
    "Message:",
    feedback.message,
  ].join("\n");

  let response: Response;
  try {
    response = await fetch(`${RESEND_API_BASE}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [FEEDBACK_TO_EMAIL],
        subject,
        text,
      }),
    });
  } catch {
    return { ok: false, reason: "Resend API network error." };
  }

  if (!response.ok) {
    return { ok: false, reason: `Resend API returned ${response.status}.` };
  }
  return { ok: true };
}

export const onRequestOptions = () => options();

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const ip = getIp(ctx.request);
  const allowed = await allowFeedback(ctx.env, ip);
  if (!allowed) {
    return json(
      { error: "Too many feedback submissions. Please try again in about a minute." },
      429,
      { "retry-after": "60" },
    );
  }

  const body = await parseJson<unknown>(ctx.request);
  if (!body) return json({ error: "Invalid JSON body." }, 400);
  const parsed = validateFeedback(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const payload = {
    ...parsed.data,
    targetEmail: FEEDBACK_TO_EMAIL,
    receivedAt: new Date().toISOString(),
    ipHashHint: ip === "unknown" ? "unknown" : "redacted",
  };
  const key = `feedback:${Date.now()}:${crypto.randomUUID()}`;
  const emailResult = await sendFeedbackEmail(ctx.env, {
    issueType: payload.issueType,
    message: payload.message,
    receivedAt: payload.receivedAt,
  });

  await ctx.env.PDEC_KV.put(key, JSON.stringify(payload), { expirationTtl: FEEDBACK_TTL_SECONDS });

  if (!emailResult.ok) {
    return json({
      ok: true,
      message: `Feedback saved. Email delivery is not configured yet (${emailResult.reason}).`,
    });
  }

  return json({
    ok: true,
    message: `Feedback submitted and emailed to ${FEEDBACK_TO_EMAIL}.`,
  });
};
