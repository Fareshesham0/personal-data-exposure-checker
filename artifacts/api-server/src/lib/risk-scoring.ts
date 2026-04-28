import type { HibpBreach } from "./hibp.ts";

export type RiskLevel = "none" | "low" | "medium" | "high";
export type SeverityLevel = "low" | "medium" | "high";

export interface RiskFactors {
  frequency: number;
  recency: number;
  sensitivity: number;
}

export interface RiskAssessment {
  riskLevel: RiskLevel;
  riskScore: number;
  riskExplanation: string;
  recommendations: string[];
  factors?: RiskFactors;
}

export interface BreachSeverity {
  score: number;
  level: SeverityLevel;
}

export const FACTOR_MAX = {
  frequency: 40,
  recency: 30,
  sensitivity: 30,
} as const;

export const PER_BREACH_MAX = {
  sensitivity: 50,
  recency: 30,
  scale: 20,
} as const;

const HIGH_SENSITIVITY_CLASSES = new Set([
  "Passwords",
  "Password hints",
  "Security questions and answers",
  "Credit cards",
  "Banking details",
  "Payment histories",
  "Social security numbers",
  "Government issued IDs",
]);

const MEDIUM_SENSITIVITY_CLASSES = new Set([
  "Phone numbers",
  "Physical addresses",
  "Dates of birth",
  "Financial data",
  "Health & fitness data",
  "Medical records",
  "Bank account numbers",
  "IP addresses",
]);

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function sensitivityWeight(dataClasses: string[]): number {
  let weight = 0;
  for (const cls of dataClasses) {
    if (HIGH_SENSITIVITY_CLASSES.has(cls)) weight += 3;
    else if (MEDIUM_SENSITIVITY_CLASSES.has(cls)) weight += 1.5;
    else weight += 0.5;
  }
  return Math.min(weight, 15);
}

function recencyPoints(breachDate: string | undefined, addedDate: string): number {
  const dateStr = breachDate || addedDate;
  if (!dateStr) return 0;
  const days = daysBetween(new Date(), new Date(dateStr));
  if (Number.isNaN(days)) return 0;
  if (days < 180) return 30;
  if (days < 365) return 20;
  if (days < 730) return 10;
  return 5;
}

function recencyScoreAcrossBreaches(breaches: HibpBreach[]): number {
  if (breaches.length === 0) return 0;
  const mostRecent = breaches.reduce((latest, b) => {
    const d = new Date(b.BreachDate || b.AddedDate);
    return d > latest ? d : latest;
  }, new Date(0));
  const days = daysBetween(new Date(), mostRecent);
  if (days < 180) return 30;
  if (days < 365) return 20;
  if (days < 730) return 10;
  return 5;
}

function severityLevelFromScore(score: number): SeverityLevel {
  if (score < 30) return "low";
  if (score < 60) return "medium";
  return "high";
}

/**
 * Per-breach severity (0-100), derived deterministically from:
 *   - data-class sensitivity (0-50)
 *   - recency             (0-30)
 *   - exposure scale      (0-20, from PwnCount)
 *
 * Documented on the in-app Methodology page.
 */
export function assessBreachSeverity(breach: HibpBreach): BreachSeverity {
  const sensitivity = Math.min(
    (sensitivityWeight(breach.DataClasses) / 15) * PER_BREACH_MAX.sensitivity,
    PER_BREACH_MAX.sensitivity,
  );

  const recency = Math.min(
    recencyPoints(breach.BreachDate, breach.AddedDate),
    PER_BREACH_MAX.recency,
  );

  const pwn = breach.PwnCount || 0;
  let scale: number;
  if (pwn >= 100_000_000) scale = 20;
  else if (pwn >= 10_000_000) scale = 15;
  else if (pwn >= 1_000_000) scale = 10;
  else if (pwn >= 10_000) scale = 5;
  else scale = 0;

  const score = Math.round(Math.min(sensitivity + recency + scale, 100));
  return { score, level: severityLevelFromScore(score) };
}

export function assessEmailRisk(breaches: HibpBreach[]): RiskAssessment {
  if (breaches.length === 0) {
    return {
      riskLevel: "none",
      riskScore: 0,
      riskExplanation:
        "No breaches were found for this email address in the Have I Been Pwned database. This does not guarantee your data has never been exposed, but there is no recorded exposure.",
      recommendations: [
        "Continue using a unique, strong password for every account.",
        "Enable two-factor authentication (2FA) on all important accounts.",
        "Be alert to phishing emails even if your address has not been found in known breaches.",
        "Check back periodically — new breaches are discovered regularly.",
      ],
      factors: { frequency: 0, recency: 0, sensitivity: 0 },
    };
  }

  const frequency = Math.min(breaches.length * 8, FACTOR_MAX.frequency);
  const recency = recencyScoreAcrossBreaches(breaches);
  const sensitivityTotal = breaches.reduce(
    (sum, b) => sum + sensitivityWeight(b.DataClasses),
    0,
  );
  const avgSensitivity = Math.min(sensitivityTotal / breaches.length, 15);
  const sensitivity = Math.min(
    (avgSensitivity / 15) * FACTOR_MAX.sensitivity,
    FACTOR_MAX.sensitivity,
  );

  const rawScore = Math.min(frequency + recency + sensitivity, 100);
  const riskScore = Math.round(rawScore);

  let riskLevel: RiskLevel;
  if (riskScore === 0) riskLevel = "none";
  else if (riskScore < 30) riskLevel = "low";
  else if (riskScore < 60) riskLevel = "medium";
  else riskLevel = "high";

  const hasPasswordExposure = breaches.some((b) =>
    b.DataClasses.some(
      (c) => HIGH_SENSITIVITY_CLASSES.has(c) && c.toLowerCase().includes("password"),
    ),
  );
  const hasCreditCardExposure = breaches.some((b) =>
    b.DataClasses.some((c) => c.toLowerCase().includes("credit")),
  );

  let riskExplanation = "";
  if (riskLevel === "low") {
    riskExplanation = `Your email was found in ${breaches.length} breach${breaches.length > 1 ? "es" : ""}. The exposed data is of lower sensitivity, but you should still take precautions.`;
  } else if (riskLevel === "medium") {
    riskExplanation = `Your email appeared in ${breaches.length} breach${breaches.length > 1 ? "es" : ""}${recency >= 20 ? ", including recent incidents" : ""}. Some sensitive data types were exposed. We recommend updating your credentials.`;
  } else {
    riskExplanation = `Your email was found in ${breaches.length} breach${breaches.length > 1 ? "es" : ""} including highly sensitive data${hasCreditCardExposure ? " such as financial information" : hasPasswordExposure ? " such as passwords" : ""}. Immediate action is recommended.`;
  }

  const recommendations: string[] = [];
  if (hasPasswordExposure) {
    recommendations.push(
      "Change your password on every site that uses this email address immediately.",
    );
  }
  recommendations.push(
    "Enable two-factor authentication (2FA) on all accounts linked to this email.",
  );
  if (hasCreditCardExposure) {
    recommendations.push(
      "Monitor your bank and credit card statements for unauthorized transactions.",
    );
  }
  recommendations.push(
    "Be extra vigilant against phishing emails targeting this address.",
  );
  recommendations.push(
    "Consider using a password manager to maintain unique, strong passwords per site.",
  );
  if (breaches.length > 3) {
    recommendations.push(
      "Consider creating a new email address for sensitive accounts, since this one has appeared in multiple breaches.",
    );
  }

  return {
    riskLevel,
    riskScore,
    riskExplanation,
    recommendations: recommendations.slice(0, 5),
    factors: {
      frequency: Math.round(frequency),
      recency: Math.round(recency),
      sensitivity: Math.round(sensitivity),
    },
  };
}

// Single-dimension score driven only by HIBP Pwned Passwords occurrence count.
// `factors` is returned as all-zero so the response shape stays consistent with
// email checks; the UI hides the breakdown when no factor is non-zero.
export function assessPasswordRisk(
  found: boolean,
  count: number,
): RiskAssessment {
  const zeroFactors: RiskFactors = { frequency: 0, recency: 0, sensitivity: 0 };
  if (!found) {
    return {
      riskLevel: "none",
      riskScore: 0,
      riskExplanation:
        "This password has not been found in any known breach dataset checked by Have I Been Pwned. It is safe to continue using it for now, but always prefer long, unique passwords.",
      recommendations: [
        "Use a unique password for every account — never reuse passwords.",
        "Consider a password manager to generate and store strong passwords.",
        "Enable two-factor authentication wherever possible.",
        "Change this password if you suspect it may have been compromised in any way.",
      ],
      factors: zeroFactors,
    };
  }

  let riskScore: number;
  let riskLevel: RiskLevel;

  if (count >= 100000) {
    riskScore = 95;
    riskLevel = "high";
  } else if (count >= 10000) {
    riskScore = 80;
    riskLevel = "high";
  } else if (count >= 1000) {
    riskScore = 60;
    riskLevel = "medium";
  } else if (count >= 100) {
    riskScore = 40;
    riskLevel = "medium";
  } else {
    riskScore = 25;
    riskLevel = "low";
  }

  const formattedCount = count.toLocaleString();
  let riskExplanation = "";
  if (riskLevel === "high") {
    riskExplanation = `This password has been seen ${formattedCount} times in data breaches. It is extremely common and attackers actively use it in credential-stuffing attacks. Stop using it immediately.`;
  } else if (riskLevel === "medium") {
    riskExplanation = `This password appears ${formattedCount} times in breach databases. It is not unique enough to be safe — attackers include it in automated attack dictionaries.`;
  } else {
    riskExplanation = `This password has been seen ${formattedCount} time${count > 1 ? "s" : ""} in breaches. Even rare password appearances indicate the password is not private — consider changing it.`;
  }

  return {
    riskLevel,
    riskScore,
    riskExplanation,
    recommendations: [
      "Stop using this password on all accounts immediately.",
      "Replace it with a long, randomly generated password (at least 16 characters).",
      "Enable two-factor authentication to protect accounts even if credentials are stolen.",
      "Use a password manager to avoid reusing passwords across sites.",
      "Check all accounts that share this password and change them as a priority.",
    ],
    factors: zeroFactors,
  };
}
