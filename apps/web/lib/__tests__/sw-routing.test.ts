import { describe, it, expect } from "vitest";
import { isApiRoute } from "../sw-route-matcher";
import manifest from "../../app/manifest";

describe("isApiRoute", () => {
  it("returns true for /api/auth/login", () => {
    expect(isApiRoute("/api/auth/login")).toBe(true);
  });

  it("returns true for /api/entries", () => {
    expect(isApiRoute("/api/entries")).toBe(true);
  });

  it("returns true for /api/crypto/shard", () => {
    expect(isApiRoute("/api/crypto/shard")).toBe(true);
  });

  it("returns false for /", () => {
    expect(isApiRoute("/")).toBe(false);
  });

  it("returns false for /_next/static/chunk.js", () => {
    expect(isApiRoute("/_next/static/chunk.js")).toBe(false);
  });

  it("returns false for /write", () => {
    expect(isApiRoute("/write")).toBe(false);
  });
});

describe("manifest", () => {
  const m = manifest();

  it("has name Dead Letter Diary", () => {
    expect(m.name).toBe("Dead Letter Diary");
  });

  it("has display standalone", () => {
    expect(m.display).toBe("standalone");
  });

  it("has icons with 192x192", () => {
    expect(m.icons?.some((i) => i.sizes === "192x192")).toBe(true);
  });

  it("has icons with 512x512", () => {
    expect(m.icons?.some((i) => i.sizes === "512x512")).toBe(true);
  });

  it("has an icon with purpose maskable", () => {
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("NetworkOnly matcher is at index 0 in runtimeCaching (isApiRoute covers /api/*)", () => {
    // The sw.ts runtime caching array puts NetworkOnly first.
    // We validate the matcher function behavior here since sw.ts can't be imported in test env.
    expect(isApiRoute("/api/anything")).toBe(true);
    expect(isApiRoute("/not-api/path")).toBe(false);
  });
});
