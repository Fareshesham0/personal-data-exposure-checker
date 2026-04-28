import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

import type {
  BreachEntry,
  ExposureResult,
  RiskLevel,
} from "@workspace/api-client-react";

const RISK_LABEL: Record<RiskLevel, string> = {
  none: "Secure",
  low: "Low Risk",
  medium: "Medium Risk",
  high: "High Risk",
};

const RISK_ACCENT_RGB: Record<RiskLevel, [number, number, number]> = {
  none: [16, 185, 129],
  low: [234, 179, 8],
  medium: [249, 115, 22],
  high: [239, 68, 68],
};

const SEVERITY_RGB: Record<string, [number, number, number]> = {
  low: [234, 179, 8],
  medium: [249, 115, 22],
  high: [239, 68, 68],
};

interface BuildOptions {
  result: ExposureResult;
  /**
   * Display identifier. For email checks this should be the actual email
   * address. For password checks this MUST be the literal string
   * "a password" — the plaintext password is never written to the report.
   */
  identifier: string;
  /**
   * Origin used to build the methodology page link. Defaults to the current
   * window origin when called in the browser.
   */
  origin?: string;
}

const PAGE_W = 595.28; // A4 portrait width in pt (jsPDF default)
const MARGIN_X = 48;
const TEXT_WIDTH = PAGE_W - MARGIN_X * 2;

/**
 * Build a downloadable PDF report from an ExposureResult.
 *
 * Privacy: this runs entirely in the browser. Nothing is sent over the
 * network. For password checks the caller must pass identifier="a password"
 * — the plaintext password is intentionally not part of the input.
 */
export function buildExposureReport({
  result,
  identifier,
  origin,
}: BuildOptions): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const isPasswordReport = identifier === "a password";
  const generatedAt = new Date();
  const accent = RISK_ACCENT_RGB[result.riskLevel] ?? [100, 100, 100];

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, PAGE_W, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text("Personal Data Exposure Report", MARGIN_X, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text(
    `Generated: ${generatedAt.toLocaleString(undefined, {
      dateStyle: "long",
      timeStyle: "short",
    })}`,
    MARGIN_X,
    66,
  );
  doc.text(
    `Checked: ${identifier}${isPasswordReport ? " (plaintext intentionally omitted)" : ""}`,
    MARGIN_X,
    80,
  );

  // ── Summary block ─────────────────────────────────────────────────────────
  let cursorY = 108;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const explanationLines = doc.splitTextToSize(
    result.riskExplanation,
    TEXT_WIDTH - 32,
  );
  // Height = top padding + title + score line + explanation lines + bottom pad.
  const summaryBoxHeight = Math.max(
    96,
    58 + explanationLines.length * 12 + 16,
  );

  doc.setDrawColor(230, 230, 230);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(MARGIN_X, cursorY, TEXT_WIDTH, summaryBoxHeight, 6, 6, "FD");

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(
    result.exposed ? "Breaches Detected" : "No Breaches Found",
    MARGIN_X + 16,
    cursorY + 22,
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(
    `${RISK_LABEL[result.riskLevel]}  ·  Score ${result.riskScore}/100`,
    MARGIN_X + 16,
    cursorY + 40,
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(explanationLines, MARGIN_X + 16, cursorY + 58);

  cursorY += summaryBoxHeight + 18;

  // ── Factor breakdown (only meaningful for email checks) ───────────────────
  if (!isPasswordReport && result.factors) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text("Score breakdown", MARGIN_X, cursorY);
    cursorY += 8;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN_X, right: MARGIN_X },
      theme: "grid",
      head: [["Factor", "Contribution", "Maximum"]],
      body: [
        ["Frequency (number of breaches)", String(result.factors.frequency), "40"],
        ["Recency (newest breach age)", String(result.factors.recency), "30"],
        ["Sensitivity (data class severity)", String(result.factors.sensitivity), "30"],
        [
          { content: "Total", styles: { fontStyle: "bold" } },
          {
            content: String(
              result.factors.frequency +
                result.factors.recency +
                result.factors.sensitivity,
            ),
            styles: { fontStyle: "bold" },
          },
          { content: "100", styles: { fontStyle: "bold" } },
        ],
      ],
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [20, 20, 20],
        fontStyle: "bold",
      },
      styles: { fontSize: 10, cellPadding: 6 },
    });
    cursorY = lastTableY(doc) + 18;
  }

  // ── Breach details table ─────────────────────────────────────────────────
  if (result.breaches.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(
      `Breach details (${result.breachCount})`,
      MARGIN_X,
      cursorY,
    );
    cursorY += 8;

    const body = result.breaches.map((b: BreachEntry) => [
      b.name,
      formatDate(b.breachDate),
      b.dataClasses.join(", "),
      // Defensive: omit the parenthetical if the severityLevel is missing,
      // so the cell never renders the literal string "undefined".
      b.severityLevel
        ? `${b.severityScore} (${b.severityLevel})`
        : `${b.severityScore}`,
    ]);

    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN_X, right: MARGIN_X },
      theme: "striped",
      head: [["Service", "Breach date", "Data exposed", "Severity"]],
      body,
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [20, 20, 20],
        fontStyle: "bold",
      },
      styles: { fontSize: 9, cellPadding: 5, valign: "top" },
      columnStyles: {
        0: { cellWidth: 110, fontStyle: "bold" },
        1: { cellWidth: 70 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 70, halign: "center" },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const breach = result.breaches[data.row.index];
          const rgb = breach?.severityLevel
            ? SEVERITY_RGB[breach.severityLevel]
            : undefined;
          if (rgb) {
            data.cell.styles.textColor = rgb;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
    cursorY = lastTableY(doc) + 18;
  }

  // ── Recommendations ───────────────────────────────────────────────────────
  if (result.recommendations.length > 0) {
    cursorY = ensureSpace(doc, cursorY, 60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text("Recommendations", MARGIN_X, cursorY);
    cursorY += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);

    for (const rec of result.recommendations) {
      const lines = doc.splitTextToSize(rec, TEXT_WIDTH - 16);
      cursorY = ensureSpace(doc, cursorY, lines.length * 12 + 8);
      doc.setFont("helvetica", "bold");
      doc.text("•", MARGIN_X, cursorY);
      doc.setFont("helvetica", "normal");
      doc.text(lines, MARGIN_X + 12, cursorY);
      cursorY += lines.length * 12 + 6;
    }
    cursorY += 8;
  }

  // ── Methodology footer ────────────────────────────────────────────────────
  cursorY = ensureSpace(doc, cursorY, 90);
  doc.setDrawColor(220, 220, 220);
  doc.line(MARGIN_X, cursorY, PAGE_W - MARGIN_X, cursorY);
  cursorY += 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text("How is this calculated?", MARGIN_X, cursorY);
  cursorY += 12;

  const methodologyText = isPasswordReport
    ? "Password risk is a single-dimension score derived from how many times the password appears in HIBP's Pwned Passwords corpus. The check uses k-anonymity: only the first 5 characters of the SHA-1 hash are sent, never the password itself."
    : "The 0–100 risk score is the sum of three weighted factors: Frequency (max 40, from the number of breaches), Recency (max 30, from the most recent breach date), and Sensitivity (max 30, from the average sensitivity of exposed data classes). Each individual breach also has its own 0–100 severity score derived from data-class sensitivity, recency, and exposure scale.";

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const methodologyLines = doc.splitTextToSize(methodologyText, TEXT_WIDTH);
  doc.text(methodologyLines, MARGIN_X, cursorY);
  cursorY += methodologyLines.length * 11 + 6;

  const methodologyUrl = buildMethodologyUrl(origin);
  doc.setTextColor(37, 99, 235);
  doc.textWithLink(`Full methodology: ${methodologyUrl}`, MARGIN_X, cursorY, {
    url: methodologyUrl,
  });

  // ── Page numbers ──────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Personal Data Exposure Checker · Page ${i} of ${pageCount}`,
      PAGE_W / 2,
      820,
      { align: "center" },
    );
  }

  return doc;
}

/**
 * Build the report and trigger a browser download. Returns the resolved
 * filename so callers/tests can assert on it.
 */
export function downloadExposureReport(opts: BuildOptions): string {
  const doc = buildExposureReport(opts);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `pdec-report-${stamp}.pdf`;
  doc.save(filename);
  return filename;
}

function lastTableY(doc: jsPDF): number {
  const anyDoc = doc as unknown as { lastAutoTable?: { finalY?: number } };
  return anyDoc.lastAutoTable?.finalY ?? 0;
}

function ensureSpace(doc: jsPDF, cursorY: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + needed > pageHeight - 60) {
    doc.addPage();
    return 60;
  }
  return cursorY;
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildMethodologyUrl(origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://pdec");
  // The exposure-checker artifact is mounted at /exposure-checker/ — keep the
  // link self-contained so the printed report is useful even without context.
  const path =
    typeof window !== "undefined"
      ? // BASE_URL is the artifact path prefix; ensure no double slashes.
        `${import.meta.env.BASE_URL.replace(/\/$/, "")}/methodology`
      : "/methodology";
  return `${base}${path}`;
}
