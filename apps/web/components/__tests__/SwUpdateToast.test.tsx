import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import SwUpdateToast from "../SwUpdateToast";

describe("SwUpdateToast", () => {
  let mockRegistration: {
    waiting: ServiceWorker | null;
    installing: ServiceWorker | null;
    active: ServiceWorker | null;
    addEventListener: ReturnType<typeof vi.fn>;
  };
  let mockPostMessage: ReturnType<typeof vi.fn>;
  let mockSwEventListeners: Map<string, EventListener>;

  beforeEach(() => {
    mockPostMessage = vi.fn();
    mockSwEventListeners = new Map();
    mockRegistration = {
      waiting: null,
      installing: null,
      active: null,
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        mockSwEventListeners.set(event, handler);
      }),
    };

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
        ready: Promise.resolve(mockRegistration),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        controller: {},
      },
      configurable: true,
      writable: true,
    });

    vi.stubGlobal("location", {
      reload: vi.fn(),
      href: "http://localhost/",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders null when no SW update is available", async () => {
    await act(async () => {
      render(<SwUpdateToast hasUnsavedText={false} />);
    });
    expect(screen.queryByText(/Update available/i)).toBeNull();
  });

  it("renders toast when waiting SW is already present on mount", async () => {
    const waitingSW = { postMessage: mockPostMessage } as unknown as ServiceWorker;
    mockRegistration.waiting = waitingSW;

    await act(async () => {
      render(<SwUpdateToast hasUnsavedText={false} />);
    });

    expect(screen.getByText(/Update available/i)).toBeTruthy();
  });

  it("calls postMessage SKIP_WAITING when Update now clicked and no unsaved text", async () => {
    const waitingSW = { postMessage: mockPostMessage } as unknown as ServiceWorker;
    mockRegistration.waiting = waitingSW;

    await act(async () => {
      render(<SwUpdateToast hasUnsavedText={false} />);
    });

    const button = screen.getByText(/Update now/i);
    fireEvent.click(button);

    expect(mockPostMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("does NOT call skipWaiting when hasUnsavedText is true", async () => {
    const alertMock = vi.fn();
    vi.stubGlobal("alert", alertMock);

    const waitingSW = { postMessage: mockPostMessage } as unknown as ServiceWorker;
    mockRegistration.waiting = waitingSW;

    await act(async () => {
      render(<SwUpdateToast hasUnsavedText={true} />);
    });

    const button = screen.getByText(/Update now/i);
    fireEvent.click(button);

    expect(mockPostMessage).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(
      expect.stringContaining("Save or clear")
    );
  });
});
