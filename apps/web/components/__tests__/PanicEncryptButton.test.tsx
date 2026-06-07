/**
 * Tests for PanicEncryptButton component.
 * Covers: dialog hidden before click, confirm button disabled until 'DESTROY' typed,
 * API call on confirm, no API call if canceled, error display on non-200.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// Mock next/navigation
const mockRouterReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace, push: vi.fn() }),
}));

// Mock performClientWipe
const mockPerformClientWipe = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/wipe", () => ({
  performClientWipe: mockPerformClientWipe,
}));

describe("PanicEncryptButton", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mockRouterReplace.mockClear();
    mockPerformClientWipe.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("dialog does not appear before button click", async () => {
    const { PanicEncryptButton } = await import("../PanicEncryptButton");
    render(<PanicEncryptButton />);

    // The confirmation text should not be visible
    expect(
      screen.queryByText(/permanently destroy your diary/i)
    ).not.toBeInTheDocument();
  });

  it("dialog appears after button click", async () => {
    const user = userEvent.setup();
    const { PanicEncryptButton } = await import("../PanicEncryptButton");
    render(<PanicEncryptButton />);

    await user.click(screen.getByRole("button", { name: /panic encrypt/i }));

    expect(
      screen.getByText(/permanently destroy your diary/i)
    ).toBeInTheDocument();
  });

  it("confirm button is disabled when typed value is not 'DESTROY'", async () => {
    const user = userEvent.setup();
    const { PanicEncryptButton } = await import("../PanicEncryptButton");
    render(<PanicEncryptButton />);

    await user.click(screen.getByRole("button", { name: /panic encrypt/i }));
    const input = screen.getByRole("textbox");

    await user.type(input, "DESTRO");

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).toBeDisabled();
  });

  it("confirm button is enabled when typed value is 'DESTROY'", async () => {
    const user = userEvent.setup();
    const { PanicEncryptButton } = await import("../PanicEncryptButton");
    render(<PanicEncryptButton />);

    await user.click(screen.getByRole("button", { name: /panic encrypt/i }));
    const input = screen.getByRole("textbox");

    await user.type(input, "DESTROY");

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).not.toBeDisabled();
  });

  it("calls POST /api/wipe/panic on confirm", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const { PanicEncryptButton } = await import("../PanicEncryptButton");
    render(<PanicEncryptButton />);

    await user.click(screen.getByRole("button", { name: /panic encrypt/i }));
    await user.type(screen.getByRole("textbox"), "DESTROY");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/wipe/panic",
        expect.objectContaining({
          method: "POST",
          credentials: "include",
        })
      );
    });
  });

  it("calls performClientWipe and redirects to /wiped on 200 response", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const { PanicEncryptButton } = await import("../PanicEncryptButton");
    render(<PanicEncryptButton />);

    await user.click(screen.getByRole("button", { name: /panic encrypt/i }));
    await user.type(screen.getByRole("textbox"), "DESTROY");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(mockPerformClientWipe).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith("/wiped");
    });
  });

  it("does not call POST /api/wipe/panic when dialog is canceled", async () => {
    const user = userEvent.setup();

    const { PanicEncryptButton } = await import("../PanicEncryptButton");
    render(<PanicEncryptButton />);

    await user.click(screen.getByRole("button", { name: /panic encrypt/i }));
    await user.type(screen.getByRole("textbox"), "DESTROY");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows error message in dialog on non-200 response", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Deadline not active" }),
    });

    const { PanicEncryptButton } = await import("../PanicEncryptButton");
    render(<PanicEncryptButton />);

    await user.click(screen.getByRole("button", { name: /panic encrypt/i }));
    await user.type(screen.getByRole("textbox"), "DESTROY");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByText(/Deadline not active|failed|error/i)).toBeInTheDocument();
    });
  });
});
