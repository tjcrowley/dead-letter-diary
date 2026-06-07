/**
 * Tests for SyncStatus component — label rendering for all sync states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mock dexie-react-hooks — useLiveQuery returns a controlled count value
// ---------------------------------------------------------------------------

let mockPendingCount = 0;

vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: (fn: () => unknown) => {
    // Call the fn to keep the import happy, but return our controlled value
    return mockPendingCount;
  },
}));

// Mock the db to avoid IndexedDB in component tests
vi.mock("@/lib/db", () => ({
  db: {
    outbox: {
      count: vi.fn(() => Promise.resolve(0)),
    },
  },
}));

// Mock getSyncStatus (not used directly by component — it derives state inline)
vi.mock("@/lib/sync", () => ({
  getSyncStatus: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    value,
    configurable: true,
    writable: true,
  });
}

// ---------------------------------------------------------------------------
// Import component AFTER mocks are set up
// ---------------------------------------------------------------------------

import { SyncStatus } from "../SyncStatus";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPendingCount = 0;
  setOnline(true);
});

describe("SyncStatus component", () => {
  it('renders "Synced" when isSaving is false, online, outbox is empty', () => {
    mockPendingCount = 0;
    setOnline(true);

    render(<SyncStatus isSaving={false} />);
    expect(screen.getByText("Synced")).toBeInTheDocument();
  });

  it('renders "Saving..." when isSaving is true', () => {
    mockPendingCount = 0;
    setOnline(true);

    render(<SyncStatus isSaving={true} />);
    expect(screen.getByText("Saving...")).toBeInTheDocument();
  });

  it('renders "Offline — 3 entries pending" when offline with 3 queued', () => {
    mockPendingCount = 3;
    setOnline(false);

    render(<SyncStatus isSaving={false} />);
    expect(screen.getByText("Offline — 3 entries pending")).toBeInTheDocument();
  });

  it('renders "Offline — 1 entry pending" (singular) when pendingCount is 1', () => {
    mockPendingCount = 1;
    setOnline(false);

    render(<SyncStatus isSaving={false} />);
    expect(screen.getByText("Offline — 1 entry pending")).toBeInTheDocument();
  });
});
