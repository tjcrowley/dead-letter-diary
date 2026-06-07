import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";

// Mock the storage module
vi.mock("@/lib/storage", () => ({
  getStorageInfo: vi.fn(),
  detectPrivateMode: vi.fn().mockResolvedValue(false),
  callPersist: vi.fn().mockResolvedValue(true),
}));

import { getStorageInfo } from "@/lib/storage";
import StorageInfo from "../StorageInfo";

describe("StorageInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders usage text when getStorageInfo resolves with data", async () => {
    vi.mocked(getStorageInfo).mockResolvedValue({
      usedMb: 10,
      quotaMb: 500,
      percentUsed: 2,
    });

    await act(async () => {
      render(<StorageInfo />);
    });

    expect(screen.getByText(/10 MB used of 500 MB \(2%\)/i)).toBeTruthy();
  });

  it("renders null (empty) when getStorageInfo returns null", async () => {
    vi.mocked(getStorageInfo).mockResolvedValue(null);

    let container!: HTMLElement;
    await act(async () => {
      const result = render(<StorageInfo />);
      container = result.container;
    });

    expect(container.firstChild).toBeNull();
  });

  it("renders a progressbar element derived from percentUsed", async () => {
    vi.mocked(getStorageInfo).mockResolvedValue({
      usedMb: 10,
      quotaMb: 500,
      percentUsed: 2,
    });

    await act(async () => {
      render(<StorageInfo />);
    });

    expect(screen.getByRole("progressbar")).toBeTruthy();
  });
});
