import type { NextConfig } from "next";
import { withSerwistInit } from "@serwist/next";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

function getRevision(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim();
  }
  return randomUUID();
}

const revision = getRevision();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/offline", revision }],
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  output: "standalone",
};

export default withSerwist(nextConfig);
