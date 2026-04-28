import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assessBreachSeverity,
  assessEmailRisk,
  assessPasswordRisk,
  FACTOR_MAX,
  PER_BREACH_MAX,
} from "./risk-scoring.ts";
import type { HibpBreach } from "./hibp.ts";

const today = new Date();
const monthsAgo = (m: number): string =>
  new Date(today.getTime() - m * 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

function makeBreach(overrides: Partial<HibpBreach> = {}): HibpBreach {
  return {
    Name: "TestBreach",
    Domain: "test.example",
    BreachDate: monthsAgo(3),
    AddedDate: monthsAgo(2),
    PwnCount: 5_000,
    Description: "Test description.",
    DataClasses: ["Email addresses"],
    IsVerified: true,
    IsSensitive: false,
    ...overrides,
  };
}

test("assessEmailRisk — empty list returns none/0 with zero factors", () => {
  const r = assessEmailRisk([]);
  assert.equal(r.riskLevel, "none");
  assert.equal(r.riskScore, 0);
  assert.deepEqual(r.factors, { frequency: 0, recency: 0, sensitivity: 0 });
});

test("assessEmailRisk — frequency factor caps at FACTOR_MAX.frequency (40)", () => {
  // 10 trivial breaches → 10 * 8 = 80 raw, capped at 40.
  const breaches = Array.from({ length: 10 }, (_, i) =>
    makeBreach({ Name: `B${i}`, DataClasses: ["Email addresses"] }),
  );
  const r = assessEmailRisk(breaches);
  assert.ok(r.factors);
  assert.equal(r.factors!.frequency, FACTOR_MAX.frequency);
});

test("assessEmailRisk — recency factor caps at FACTOR_MAX.recency (30) for very recent breach", () => {
  const r = assessEmailRisk([makeBreach({ BreachDate: monthsAgo(1) })]);
  assert.ok(r.factors);
  assert.equal(r.factors!.recency, FACTOR_MAX.recency);
});

test("assessEmailRisk — sensitivity factor caps at FACTOR_MAX.sensitivity (30) for highly sensitive data", () => {
  const r = assessEmailRisk([
    makeBreach({
      DataClasses: [
        "Passwords",
        "Credit cards",
        "Social security numbers",
        "Government issued IDs",
        "Banking details",
      ],
    }),
  ]);
  assert.ok(r.factors);
  assert.equal(r.factors!.sensitivity, FACTOR_MAX.sensitivity);
});

test("assessEmailRisk — risk bucket boundaries: <30 low, <60 medium, >=60 high", () => {
  // single breach, low-sensitivity, old → score should land in low bucket
  const low = assessEmailRisk([
    makeBreach({
      BreachDate: monthsAgo(40),
      DataClasses: ["Email addresses"],
    }),
  ]);
  assert.equal(low.riskLevel, "low");
  assert.ok(low.riskScore > 0 && low.riskScore < 30);

  // many recent sensitive breaches → high
  const high = assessEmailRisk(
    Array.from({ length: 6 }, (_, i) =>
      makeBreach({
        Name: `H${i}`,
        BreachDate: monthsAgo(2),
        DataClasses: ["Passwords", "Credit cards"],
      }),
    ),
  );
  assert.equal(high.riskLevel, "high");
  assert.ok(high.riskScore >= 60);
});

test("assessBreachSeverity — caps at 100 even for max inputs", () => {
  const s = assessBreachSeverity(
    makeBreach({
      BreachDate: monthsAgo(1),
      PwnCount: 200_000_000,
      DataClasses: [
        "Passwords",
        "Credit cards",
        "Social security numbers",
        "Government issued IDs",
        "Banking details",
      ],
    }),
  );
  assert.ok(s.score <= 100, `score must be <=100, got ${s.score}`);
  assert.equal(s.score, 100);
  assert.equal(s.level, "high");
});

test("assessBreachSeverity — scale points map by PwnCount tier", () => {
  // No data classes → sensitivity weight 0, recency-only baseline
  const baseDataClass = ["Email addresses"];
  const old = monthsAgo(60);
  const noScale = assessBreachSeverity(
    makeBreach({ PwnCount: 500, DataClasses: baseDataClass, BreachDate: old }),
  );
  const small = assessBreachSeverity(
    makeBreach({ PwnCount: 50_000, DataClasses: baseDataClass, BreachDate: old }),
  );
  const med = assessBreachSeverity(
    makeBreach({ PwnCount: 5_000_000, DataClasses: baseDataClass, BreachDate: old }),
  );
  const big = assessBreachSeverity(
    makeBreach({ PwnCount: 50_000_000, DataClasses: baseDataClass, BreachDate: old }),
  );
  const huge = assessBreachSeverity(
    makeBreach({ PwnCount: 500_000_000, DataClasses: baseDataClass, BreachDate: old }),
  );
  assert.ok(small.score - noScale.score === 5);
  assert.ok(med.score - small.score === 5);
  assert.ok(big.score - med.score === 5);
  assert.ok(huge.score - big.score === 5);
});

test("assessBreachSeverity — severity level boundaries (low <30, medium <60, high >=60)", () => {
  const low = assessBreachSeverity(
    makeBreach({
      BreachDate: monthsAgo(60),
      PwnCount: 100,
      DataClasses: ["Email addresses"],
    }),
  );
  assert.equal(low.level, "low");
  assert.ok(low.score < 30);

  const high = assessBreachSeverity(
    makeBreach({
      BreachDate: monthsAgo(2),
      PwnCount: 200_000_000,
      DataClasses: ["Passwords", "Credit cards", "Social security numbers"],
    }),
  );
  assert.equal(high.level, "high");
  assert.ok(high.score >= 60);
});

test("assessPasswordRisk — score table at each tier", () => {
  assert.equal(assessPasswordRisk(false, 0).riskScore, 0);
  assert.equal(assessPasswordRisk(false, 0).riskLevel, "none");

  assert.equal(assessPasswordRisk(true, 50).riskScore, 25);
  assert.equal(assessPasswordRisk(true, 50).riskLevel, "low");

  assert.equal(assessPasswordRisk(true, 500).riskScore, 40);
  assert.equal(assessPasswordRisk(true, 500).riskLevel, "medium");

  assert.equal(assessPasswordRisk(true, 5_000).riskScore, 60);
  assert.equal(assessPasswordRisk(true, 5_000).riskLevel, "medium");

  assert.equal(assessPasswordRisk(true, 50_000).riskScore, 80);
  assert.equal(assessPasswordRisk(true, 50_000).riskLevel, "high");

  assert.equal(assessPasswordRisk(true, 500_000).riskScore, 95);
  assert.equal(assessPasswordRisk(true, 500_000).riskLevel, "high");
});

test("assessPasswordRisk — single-dimension: factors are all zero (consistent shape)", () => {
  const r = assessPasswordRisk(true, 500_000);
  assert.deepEqual(r.factors, { frequency: 0, recency: 0, sensitivity: 0 });

  const noMatch = assessPasswordRisk(false, 0);
  assert.deepEqual(noMatch.factors, { frequency: 0, recency: 0, sensitivity: 0 });
});

test("PER_BREACH_MAX adds to 100", () => {
  assert.equal(
    PER_BREACH_MAX.sensitivity + PER_BREACH_MAX.recency + PER_BREACH_MAX.scale,
    100,
  );
});

test("FACTOR_MAX adds to 100", () => {
  assert.equal(
    FACTOR_MAX.frequency + FACTOR_MAX.recency + FACTOR_MAX.sensitivity,
    100,
  );
});
