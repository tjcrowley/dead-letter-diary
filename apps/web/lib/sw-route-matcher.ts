/**
 * Pure helper to determine if a URL pathname should be handled NetworkOnly.
 * Used in sw.ts and importable in tests.
 */
export function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}
