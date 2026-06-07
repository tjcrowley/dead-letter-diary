/**
 * Tests for /wiped page (wipe ceremony screen).
 * Verifies: renders diary title, shows epitaph when present,
 * shows nothing extra when epitaph is null, no calls to
 * forbidden endpoints (entries, crypto).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// Mock performClientWipe so it doesn't run real IDB/cache ops
vi.mock("@/lib/wipe", () => ({
  performClientWipe: vi.fn().mockResolvedValue(undefined),
}));

describe("/wiped page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders 'Dead Letter Diary' title", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ epitaph: null }),
    });

    const { default: WipedPage } = await import("../page");
    render(<WipedPage />);

    expect(screen.getByText("Dead Letter Diary")).toBeInTheDocument();
  });

  it("shows epitaph text when API returns one", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ epitaph: "Here lies a diary that dared to be written." }),
    });

    const { default: WipedPage } = await import("../page");
    render(<WipedPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Here lies a diary that dared to be written.")
      ).toBeInTheDocument();
    });
  });

  it("shows no epitaph element when epitaph is null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ epitaph: null }),
    });

    const { default: WipedPage } = await import("../page");
    const { container } = render(<WipedPage />);

    await waitFor(() => {
      // Only fetch to epitaph endpoint should have been called
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/account/epitaph",
        expect.objectContaining({ credentials: "include" })
      );
    });

    // No <em> or epitaph paragraph should appear
    const italics = container.querySelectorAll("em, i");
    // There should be none, or none containing diary content
    italics.forEach((el) => {
      expect(el.textContent).toBe("");
    });
  });

  it("does not call /api/entries or any crypto endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ epitaph: null }),
    });

    const { default: WipedPage } = await import("../page");
    render(<WipedPage />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    // Verify no calls to forbidden endpoints
    const allUrls = fetchMock.mock.calls.map((args: unknown[]) => args[0] as string);
    const forbidden = allUrls.filter(
      (url) =>
        url.includes("/api/entries") ||
        url.includes("/api/crypto") ||
        url.includes("/api/decrypt") ||
        url.includes("/api/encrypt")
    );
    expect(forbidden).toHaveLength(0);
  });
});
