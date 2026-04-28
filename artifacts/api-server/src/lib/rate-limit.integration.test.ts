/**
 * Integration test: rate-limit counter fires under load.
 *
 * Starts the real production Express app (from app.ts) on an ephemeral port,
 * fires 25 POST /api/check requests with intentionally invalid bodies — the
 * rate-limit middleware runs before Zod validation, so no HIBP/XposedOrNot
 * reachability is required — then snapshots /api/stats and asserts:
 *
 *   1. At least one 429 response was received from the real handler.
 *   2. /api/stats reports requests.rateLimited429 >= 1
 *   3. /api/stats reports rateLimit.rejected429 >= 1
 *   4. Both counters match each other and the observed 429 count.
 *
 * This exercises the production app.ts handler path, so any regression that
 * removes the recordRateLimited() call from the real 429 handler will fail here.
 */

import { describe, it, before, after } from "node:test";
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import type { Server } from "node:http";
import app from "../app.ts";
import { __resetForTests } from "./metrics.ts";

const CHECK_LIMIT_MAX = 20;
const TOTAL_REQUESTS = 25;

describe("rate-limit integration — 429 counter fires under load", () => {
  let server: Server;
  let port: number;

  before(
    () =>
      new Promise<void>((resolve) => {
        __resetForTests();
        server = createServer(app);
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address() as { port: number };
          port = addr.port;
          resolve();
        });
      }),
  );

  after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  );

  it(
    `fires ${TOTAL_REQUESTS} requests (limit is ${CHECK_LIMIT_MAX}), gets ≥1 429, and records it in /api/stats`,
    async () => {
      const statuses: number[] = [];

      for (let i = 0; i < TOTAL_REQUESTS; i++) {
        const status = await fetch(`http://127.0.0.1:${port}/api/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bad: "payload" }),
        }).then((r) => r.status);
        statuses.push(status);
      }

      const count429 = statuses.filter((s) => s === 429).length;
      assert.ok(
        count429 >= 1,
        `Expected ≥1 429 response but got none. Statuses: [${statuses.join(", ")}]`,
      );

      const statsRes = await fetch(`http://127.0.0.1:${port}/api/stats`);
      assert.equal(statsRes.status, 200, "/api/stats should return 200");

      const stats = (await statsRes.json()) as {
        requests: { rateLimited429: number };
        rateLimit: { rejected429: number };
      };

      assert.ok(
        stats.requests.rateLimited429 >= 1,
        `requests.rateLimited429 should be ≥ 1, got ${stats.requests.rateLimited429}`,
      );
      assert.ok(
        stats.rateLimit.rejected429 >= 1,
        `rateLimit.rejected429 should be ≥ 1, got ${stats.rateLimit.rejected429}`,
      );

      assert.equal(
        stats.requests.rateLimited429,
        stats.rateLimit.rejected429,
        "requests.rateLimited429 and rateLimit.rejected429 must be the same counter",
      );

      assert.equal(
        stats.requests.rateLimited429,
        count429,
        `Metrics counter (${stats.requests.rateLimited429}) must match the number of 429 responses observed (${count429})`,
      );
    },
  );
});
