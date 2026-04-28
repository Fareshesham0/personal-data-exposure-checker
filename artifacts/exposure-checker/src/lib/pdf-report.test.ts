import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ExposureResult } from "@workspace/api-client-react";

import { buildExposureReport, downloadExposureReport } from "./pdf-report.ts";

const baseResult: ExposureResult = {
  exposed: true,
  breachCount: 2,
  pwnedCount: 0,
  riskLevel: "high",
  riskScore: 82,
  riskExplanation:
    "This account appears in multiple breaches including sensitive data such as passwords.",
  recommendations: [
    "Change passwords on the affected services immediately.",
    "Enable two-factor authentication everywhere it is supported.",
  ],
  factors: { frequency: 30, recency: 28, sensitivity: 24 },
  breaches: [
    {
      name: "ExampleBreach",
      domain: "example.com",
      breachDate: "2023-04-12",
      pwnCount: 100_000,
      dataClasses: ["Email addresses", "Passwords"],
      isVerified: true,
      isSensitive: false,
      severityScore: 78,
    },
    {
      name: "OtherSite",
      domain: "other.example",
      breachDate: "2024-09-01",
      pwnCount: 5_000,
      dataClasses: ["Email addresses"],
      isVerified: true,
      isSensitive: false,
      severityScore: 35,
    },
  ],
};

function pdfBytes(doc: { output: (kind: "arraybuffer") => ArrayBuffer }): Uint8Array {
  return new Uint8Array(doc.output("arraybuffer"));
}

function bytesIncludes(haystack: Uint8Array, needle: string): boolean {
  // jsPDF writes literal text into PDF content streams as plain ASCII, so a
  // straightforward byte-substring search is sufficient for our assertions.
  const needleBytes = new TextEncoder().encode(needle);
  outer: for (let i = 0; i <= haystack.length - needleBytes.length; i++) {
    for (let j = 0; j < needleBytes.length; j++) {
      if (haystack[i + j] !== needleBytes[j]) continue outer;
    }
    return true;
  }
  return false;
}

test("buildExposureReport — produces a valid PDF starting with %PDF- header", () => {
  const doc = buildExposureReport({
    result: baseResult,
    identifier: "alice@example.com",
    origin: "https://example.test",
  });
  const bytes = pdfBytes(doc);
  assert.ok(bytes.byteLength > 1000, "PDF should be non-trivially sized");
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  assert.equal(header, "%PDF-", `PDF magic header expected, got: ${header}`);
});

test("buildExposureReport — email report includes the email identifier in the document body", () => {
  const doc = buildExposureReport({
    result: baseResult,
    identifier: "alice@example.com",
    origin: "https://example.test",
  });
  const bytes = pdfBytes(doc);
  assert.ok(
    bytesIncludes(bytes, "alice@example.com"),
    "Email identifier should appear in the PDF body",
  );
});

test("buildExposureReport — password report uses the 'a password' placeholder and never leaks plaintext", () => {
  const doc = buildExposureReport({
    result: { ...baseResult, factors: { frequency: 0, recency: 0, sensitivity: 0 } },
    identifier: "a password",
    origin: "https://example.test",
  });
  const bytes = pdfBytes(doc);
  assert.ok(
    bytesIncludes(bytes, "a password"),
    "The placeholder 'a password' must appear in the PDF body",
  );
  // Caller-side privacy guard: simulate a hypothetical plaintext leak by
  // confirming the builder did not somehow inject it. The plaintext is never
  // passed in, so it must never appear in the output.
  const plaintext = "qwerty123!";
  assert.ok(
    !bytesIncludes(bytes, plaintext),
    "Plaintext password must not appear anywhere in the PDF",
  );
});

test("buildExposureReport — includes risk level, score, and a methodology link", () => {
  const doc = buildExposureReport({
    result: baseResult,
    identifier: "alice@example.com",
    origin: "https://example.test",
  });
  const bytes = pdfBytes(doc);
  assert.ok(bytesIncludes(bytes, "High Risk"), "Qualitative risk label expected");
  assert.ok(bytesIncludes(bytes, "82/100"), "Numeric score expected");
  assert.ok(
    bytesIncludes(bytes, "/methodology"),
    "Methodology page link expected",
  );
});

test("downloadExposureReport — invokes doc.save and writes a PDF with the pdec-report-YYYY-MM-DD.pdf filename", () => {
  // Exercise the real downloadExposureReport call path (which constructs the
  // doc, derives the filename, and calls jsPDF's save). In Node, doc.save()
  // writes the file relative to process.cwd(), so chdir into a temp dir to
  // assert filesystem side effects without polluting the workspace.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdec-test-"));
  const cwd = process.cwd();
  process.chdir(tmpDir);
  try {
    const filename = downloadExposureReport({
      result: baseResult,
      identifier: "alice@example.com",
      origin: "https://example.test",
    });
    assert.match(filename, /^pdec-report-\d{4}-\d{2}-\d{2}\.pdf$/);
    const written = path.join(tmpDir, filename);
    assert.ok(
      fs.existsSync(written),
      `Expected jsPDF to write ${filename} to ${tmpDir}`,
    );
    const buf = fs.readFileSync(written);
    assert.ok(buf.byteLength > 1000, "Written PDF should be non-trivially sized");
    assert.equal(
      buf.subarray(0, 5).toString("ascii"),
      "%PDF-",
      "Written file should start with the PDF magic header",
    );
  } finally {
    process.chdir(cwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
