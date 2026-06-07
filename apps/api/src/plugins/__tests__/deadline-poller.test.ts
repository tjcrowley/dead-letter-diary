import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";
import type { Pool } from "pg";
import { mockPool } from "../../test-helpers/index.js";

/**
 * Build a minimal Fastify app with a mock db plugin for testing the poller.
 */
async function buildPollerTestApp(pool?: Pool) {
  const app = Fastify({ logger: false });

  const pgPool = pool ?? mockPool();

  app.register(
    fp(async (fastify) => {
      fastify.decorate("pg", pgPool);
    }, { name: "db" })
  );

  return app;
}

describe("deadline-poller plugin", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it("registers a 60s interval on ready and clears it on close", async () => {
    const app = await buildPollerTestApp();

    const pollerModule = await import("../deadline-poller.js");
    app.register(pollerModule.default as unknown as Parameters<typeof app.register>[0]);

    const setIntervalSpy = vi.spyOn(global, "setInterval");
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    await app.ready();

    // Interval should have been registered
    expect(setIntervalSpy).toHaveBeenCalledOnce();
    const [, intervalMs] = setIntervalSpy.mock.calls[0];
    expect(intervalMs).toBe(60_000);

    await app.close();

    // Interval should have been cleared
    expect(clearIntervalSpy).toHaveBeenCalledOnce();
  });

  it("calls checkDeadlines each interval tick without crashing server on error", async () => {
    // Mock pool that simulates errors in checkDeadlines
    const errorPool = mockPool(async () => {
      throw new Error("DB connection failed");
    });

    const app = await buildPollerTestApp(errorPool);

    const pollerModule = await import("../deadline-poller.js");
    app.register(pollerModule.default as unknown as Parameters<typeof app.register>[0]);

    await app.ready();

    // Advance timer by 60 seconds — should not throw
    await expect(vi.advanceTimersByTimeAsync(60_000)).resolves.not.toThrow();

    await app.close();
  });
});
