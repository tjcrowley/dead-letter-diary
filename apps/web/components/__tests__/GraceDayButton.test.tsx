/**
 * Tests for GraceDayButton component.
 * Covers: budget=0 disabled state, budget=1 enabled state, 429 error, 409 error,
 * success callback, and loading state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// Import component after mocks
import { GraceDayButton } from "../GraceDayButton";

describe("GraceDayButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders disabled button with correct label when graceBudget=0", () => {
    render(<GraceDayButton graceBudget={0} />);

    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Grace day used this week");
  });

  it("renders enabled button with correct label when graceBudget=1", () => {
    render(<GraceDayButton graceBudget={1} />);

    const btn = screen.getByRole("button");
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveTextContent("Invoke Grace Day (1 remaining this week)");
  });

  it("shows inline error when server returns 429", async () => {
    const user = userEvent.setup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Grace budget exhausted for this week" }),
    }));

    render(<GraceDayButton graceBudget={1} />);

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Grace budget exhausted for this week")).toBeInTheDocument();
    });
  });

  it("shows inline error when server returns 409", async () => {
    const user = userEvent.setup();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Deadline not active" }),
    }));

    render(<GraceDayButton graceBudget={1} />);

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Cannot invoke grace day — deadline has already passed")).toBeInTheDocument();
    });
  });

  it("calls onGraceUsed callback on successful 200 response", async () => {
    const user = userEvent.setup();
    const onGraceUsed = vi.fn();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        new_deadline_at: new Date().toISOString(),
        grace_budget: 0,
        message: "Grace day applied. Deadline extended by 24 hours.",
      }),
    }));

    render(<GraceDayButton graceBudget={1} onGraceUsed={onGraceUsed} />);

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(onGraceUsed).toHaveBeenCalledTimes(1);
    });
  });

  it("disables button and shows 'Applying...' while fetch is in flight", async () => {
    const user = userEvent.setup();

    // Create a promise we control so we can check state mid-flight
    let resolveFetch!: (value: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));

    render(<GraceDayButton graceBudget={1} />);

    // Start click but don't await
    user.click(screen.getByRole("button"));

    // Button should be in loading state
    await waitFor(() => {
      const btn = screen.getByRole("button");
      expect(btn).toBeDisabled();
      expect(btn).toHaveTextContent("Applying...");
    });

    // Clean up by resolving the fetch
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ new_deadline_at: new Date().toISOString(), grace_budget: 0, message: "ok" }),
    });
  });
});
