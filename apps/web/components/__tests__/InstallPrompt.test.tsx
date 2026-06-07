import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import InstallPrompt from "../InstallPrompt";

function setUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("InstallPrompt", () => {
  beforeEach(() => {
    sessionStorage.clear();
    // Default: not standalone
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
      configurable: true,
    });
  });

  it("renders iOS coaching text with Share and Add to Home Screen for iPhone UA", () => {
    setUA(IOS_UA);
    render(<InstallPrompt />);
    expect(screen.getByText(/Share/i)).toBeTruthy();
    expect(screen.getByText(/Add to Home Screen/i)).toBeTruthy();
  });

  it("renders null for desktop UA (no beforeinstallprompt fired)", () => {
    setUA(DESKTOP_UA);
    const { container } = render(<InstallPrompt />);
    // Before any beforeinstallprompt event, should render nothing for desktop
    expect(container.firstChild).toBeNull();
  });

  it("renders Install button when beforeinstallprompt fires on desktop UA", async () => {
    setUA(DESKTOP_UA);
    render(<InstallPrompt />);
    const mockPrompt = vi.fn().mockResolvedValue({ outcome: "accepted" });
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<{ outcome: string }>;
    };
    Object.defineProperty(event, "prompt", { value: mockPrompt });
    await act(async () => {
      window.dispatchEvent(event);
    });
    expect(screen.getByText(/Install app/i)).toBeTruthy();
  });

  it("does not render iOS coaching when already standalone", () => {
    setUA(IOS_UA);
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true, // standalone mode
        media: query,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
      configurable: true,
    });
    const { container } = render(<InstallPrompt />);
    expect(container.firstChild).toBeNull();
  });
});
