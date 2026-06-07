import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock web-push before importing the module under test
// Include WebPushError class so tests can instantiate it
vi.mock("web-push", async (importOriginal) => {
  const actual = await importOriginal<typeof import("web-push")>();
  return {
    ...actual,
    default: {
      setVapidDetails: vi.fn(),
      sendNotification: vi.fn(),
    },
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  };
});

import webpush from "web-push";
import { sendDeadlineWarning, initVapid, formatWarningBody } from "../notification-sender.js";

const mockSendNotification = vi.mocked(webpush.sendNotification);

const testSubscription = {
  endpoint: "https://push.example.com/test-endpoint",
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlTiHmkduosyHdXpSku5em3dZVd7gBPZ_3ZRDDLs=",
    auth: "tBHItJI5svbpez7KI4CCXg==",
  },
};

describe("initVapid", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore env vars modified in tests
    process.env.VAPID_CONTACT_EMAIL = originalEnv.VAPID_CONTACT_EMAIL;
    process.env.VAPID_PUBLIC_KEY = originalEnv.VAPID_PUBLIC_KEY;
    process.env.VAPID_PRIVATE_KEY = originalEnv.VAPID_PRIVATE_KEY;
    if (!originalEnv.VAPID_CONTACT_EMAIL) delete process.env.VAPID_CONTACT_EMAIL;
    if (!originalEnv.VAPID_PUBLIC_KEY) delete process.env.VAPID_PUBLIC_KEY;
    if (!originalEnv.VAPID_PRIVATE_KEY) delete process.env.VAPID_PRIVATE_KEY;
  });

  it("calls webpush.setVapidDetails with env vars", () => {
    process.env.VAPID_CONTACT_EMAIL = "test@example.com";
    process.env.VAPID_PUBLIC_KEY = "pubkey";
    process.env.VAPID_PRIVATE_KEY = "privkey";

    initVapid();

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.com",
      "pubkey",
      "privkey"
    );
  });

  it("uses admin@localhost as default contact email when env var not set", () => {
    delete process.env.VAPID_CONTACT_EMAIL;
    process.env.VAPID_PUBLIC_KEY = "pubkey";
    process.env.VAPID_PRIVATE_KEY = "privkey";

    initVapid();

    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:admin@localhost",
      "pubkey",
      "privkey"
    );
  });

  it("is a no-op when VAPID keys are not set", () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    initVapid();

    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
  });
});

describe("formatWarningBody", () => {
  it("formats gentle tone with hours", () => {
    const body = formatWarningBody(1440, "gentle"); // 24h
    expect(body).toContain("24 hours");
    expect(body).toContain("waiting");
  });

  it("formats gentle tone with minutes when under 60 minutes", () => {
    const body = formatWarningBody(45, "gentle");
    expect(body).toContain("45 minutes");
  });

  it("formats urgent tone with minutes remaining", () => {
    const body = formatWarningBody(60, "urgent");
    expect(body).toContain("60 minutes");
    expect(body).toContain("Write now");
  });

  it("formats final tone as last chance", () => {
    const body = formatWarningBody(15, "final");
    expect(body).toContain("Last chance");
    expect(body).toContain("destroyed");
  });
});

describe("sendDeadlineWarning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendNotification.mockResolvedValue({} as never);
  });

  it("uses urgency 'normal' for gentle tone", async () => {
    await sendDeadlineWarning(testSubscription, 1440, "gentle");

    expect(mockSendNotification).toHaveBeenCalledOnce();
    const [, , options] = mockSendNotification.mock.calls[0];
    expect(options?.urgency).toBe("normal");
  });

  it("uses urgency 'high' for urgent tone", async () => {
    await sendDeadlineWarning(testSubscription, 240, "urgent");

    expect(mockSendNotification).toHaveBeenCalledOnce();
    const [, , options] = mockSendNotification.mock.calls[0];
    expect(options?.urgency).toBe("high");
  });

  it("uses urgency 'high' for final tone", async () => {
    await sendDeadlineWarning(testSubscription, 15, "final");

    expect(mockSendNotification).toHaveBeenCalledOnce();
    const [, , options] = mockSendNotification.mock.calls[0];
    expect(options?.urgency).toBe("high");
  });

  it("sets TTL equal to minutesRemaining * 60", async () => {
    await sendDeadlineWarning(testSubscription, 90, "gentle");

    const [, , options] = mockSendNotification.mock.calls[0];
    expect(options?.TTL).toBe(90 * 60);
  });

  it("includes minutesRemaining in the notification payload data", async () => {
    await sendDeadlineWarning(testSubscription, 240, "urgent");

    const [, payload] = mockSendNotification.mock.calls[0];
    const data = JSON.parse(payload as string);
    expect(data.data.type).toBe("deadline-warning");
    expect(data.data.minutesRemaining).toBe(240);
  });

  it("propagates WebPushError with statusCode 410 (stale subscription)", async () => {
    const { WebPushError } = await import("web-push");
    const error = new WebPushError("Gone", 410, {}, "", testSubscription.endpoint);
    mockSendNotification.mockRejectedValue(error);

    await expect(sendDeadlineWarning(testSubscription, 15, "final")).rejects.toThrow();
  });

  it("propagates WebPushError with statusCode 404", async () => {
    const { WebPushError } = await import("web-push");
    const error = new WebPushError("Not Found", 404, {}, "", testSubscription.endpoint);
    mockSendNotification.mockRejectedValue(error);

    await expect(sendDeadlineWarning(testSubscription, 15, "final")).rejects.toThrow();
  });
});
