import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import WkWebViewGuard from "../WkWebViewGuard";

function setUA(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

const WKWEBVIEW_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

const SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const INSTAGRAM_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram/1234.0.0.0.0";

const FBAN_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FBAN/FBIOS;FBAV/1234";

describe("WkWebViewGuard", () => {
  it("renders redirect message for WKWebView UA (no Safari/ token)", () => {
    setUA(WKWEBVIEW_UA);
    render(<WkWebViewGuard><div>app content</div></WkWebViewGuard>);
    // The h1 contains "Open in Safari to use Dead Letter Diary"
    const heading = screen.getByRole("heading");
    expect(heading.textContent).toContain("Open in Safari");
    expect(screen.queryByText("app content")).toBeNull();
  });

  it("renders children for real Safari UA", () => {
    setUA(SAFARI_UA);
    render(<WkWebViewGuard><div>app content</div></WkWebViewGuard>);
    expect(screen.getByText("app content")).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("renders redirect message for Instagram UA", () => {
    setUA(INSTAGRAM_UA);
    render(<WkWebViewGuard><div>app content</div></WkWebViewGuard>);
    const heading = screen.getByRole("heading");
    expect(heading.textContent).toContain("Open in Safari");
  });

  it("renders redirect message for FBAN UA", () => {
    setUA(FBAN_UA);
    render(<WkWebViewGuard><div>app content</div></WkWebViewGuard>);
    const heading = screen.getByRole("heading");
    expect(heading.textContent).toContain("Open in Safari");
  });
});
