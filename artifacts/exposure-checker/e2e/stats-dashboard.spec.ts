import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * End-to-end browser test for the performance metrics dashboard (Task #8).
 *
 * Strategy:
 *   1. Capture the baseline `/api/stats` total request count.
 *   2. Issue a few `/api/check` and `/api/healthz` requests directly against
 *      the running server (via the same Playwright origin, so requests are
 *      proxied through `/api/*` to the API workspace).
 *   3. Open the `/stats` dashboard in a browser and assert that the request
 *      count and check latency cards reflect the new traffic.
 */

async function getStats(api: APIRequestContext) {
  const res = await api.get("/api/stats");
  expect(res.ok()).toBe(true);
  return res.json();
}

test.describe("Performance metrics dashboard", () => {
  test("reflects new /api/check traffic in the dashboard", async ({
    page,
    request,
  }) => {
    const before = await getStats(request);
    const baselineTotal = before.requests.total ?? 0;
    const baselineCheckCount = before.latency.checkMs.count ?? 0;

    // Generate some traffic. We don't care if upstream is reachable — every
    // attempt counts as one HTTP request from Express's perspective and lands
    // in the metrics. Use clearly invalid values so we don't depend on the
    // breach intelligence services being up.
    const checkBody = {
      identifier: "not-a-real-email",
      identifierType: "email",
    };
    for (let i = 0; i < 4; i++) {
      await request.post("/api/check", { data: checkBody });
    }
    await request.get("/api/healthz");
    await request.get("/api/healthz");

    // Sanity check via the API directly before opening the dashboard.
    const after = await getStats(request);
    expect(after.requests.total).toBeGreaterThanOrEqual(baselineTotal + 6);
    expect(after.latency.checkMs.count).toBeGreaterThanOrEqual(
      baselineCheckCount + 4,
    );

    // Now open the dashboard. With a 5-second auto-refresh, the data we just
    // saw via the API should appear within one or two refresh cycles.
    await page.goto("/stats");
    await expect(page.getByTestId("stats-content")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("privacy-note")).toBeVisible();

    const totalCard = page.getByTestId("stat-requests-total");
    await expect(totalCard).toBeVisible();
    await expect
      .poll(
        async () => {
          const text = (await totalCard.innerText()).replace(/\D+/g, "") || "0";
          return Number(text);
        },
        { timeout: 15_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThanOrEqual(baselineTotal + 6);

    // Latency table for /api/check should have at least the new samples.
    const checkRow = page.getByTestId("latency-row-check");
    await expect(checkRow).toBeVisible();
    await expect
      .poll(
        async () => {
          const cells = await checkRow.locator("td").allInnerTexts();
          // Column index 1 is the "Samples" cell.
          return Number((cells[1] ?? "0").trim());
        },
        { timeout: 15_000, intervals: [500, 1000, 2000] },
      )
      .toBeGreaterThanOrEqual(baselineCheckCount + 4);

    // The /api/check endpoint row should be present.
    await expect(page.getByTestId("endpoint-row-/api/check")).toBeVisible();
  });

  test("footer link from the home page navigates to /stats", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("footer-stats-link").click();
    await expect(page).toHaveURL(/\/stats$/);
    await expect(
      page.getByRole("heading", { name: /performance metrics/i }),
    ).toBeVisible();
  });
});
