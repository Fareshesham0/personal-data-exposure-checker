import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

/**
 * End-to-end browser test for the client-side PDF report download (Task #7).
 *
 * Boots a real Chromium instance against the running exposure-checker dev
 * server, performs an email exposure check, clicks the "Download report
 * (PDF)" button on the results page, and asserts the resulting download
 * artifact (filename pattern + %PDF- magic bytes).
 *
 * The XposedOrNot upstream is occasionally flaky; the email-submit step is
 * retried up to 3 times.
 */

async function submitEmailWithRetry(
  page: import("@playwright/test").Page,
  email: string,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("/");
    // Email tab is the default. Placeholder text on the email input.
    const emailInput = page.getByPlaceholder("you@example.com");
    await emailInput.waitFor({ state: "visible", timeout: 15_000 });
    await emailInput.fill(email);
    await page.getByRole("button", { name: /check exposure/i }).click();
    try {
      await page.waitForURL(/\/results$/, { timeout: 25_000 });
      return;
    } catch {
      // Likely upstream 503 — wait and retry from the home page.
      await page.waitForTimeout(5_000);
    }
  }
  throw new Error("Could not reach the results page after 3 attempts");
}

test.describe("PDF report download", () => {
  test("downloads a valid PDF with the expected filename and header", async ({
    page,
  }) => {
    await submitEmailWithRetry(page, "test@example.com");

    const downloadButton = page.getByTestId("download-pdf");
    await expect(downloadButton).toBeVisible();
    await expect(downloadButton).toHaveText(/download report \(pdf\)/i);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      downloadButton.click(),
    ]);

    // Filename contract: pdec-report-YYYY-MM-DD.pdf
    expect(download.suggestedFilename()).toMatch(
      /^pdec-report-\d{4}-\d{2}-\d{2}\.pdf$/,
    );

    // Read the downloaded file and verify it is a non-trivial PDF.
    const path = await download.path();
    expect(path).toBeTruthy();
    const buf = await fs.readFile(path!);
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString("ascii")).toBe("%PDF-");

    // A confirmation toast should appear in the UI. Use first() since there
    // are two matches (the visible toast title + an aria-live announcement).
    await expect(
      page.getByText("Report Downloaded", { exact: true }).first(),
    ).toBeVisible();
  });
});
