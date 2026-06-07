import { describe, it, expect, afterEach } from "vitest";
import { buildTestApp } from "../../test-helpers/index.js";
import type { FastifyInstance } from "fastify";

describe("auth plugin", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    if (app) await app.close();
  });

  it("decorates fastify with jwt.sign and jwt.verify", async () => {
    app = await buildTestApp();
    expect(app.jwt).toBeDefined();
    expect(typeof app.jwt.sign).toBe("function");
    expect(typeof app.jwt.verify).toBe("function");
  });
});
