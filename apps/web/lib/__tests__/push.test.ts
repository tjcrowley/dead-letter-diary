import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Shared subscription mock
const mockSubscriptionToJSON = () => ({
  endpoint: "https://push.example.com/endpoint",
  expirationTime: null,
  keys: { p256dh: "pk", auth: "au" },
});

function makeMockSubscription() {
  return {
    endpoint: "https://push.example.com/endpoint",
    expirationTime: null,
    keys: { p256dh: "pk", auth: "au" },
    toJSON: mockSubscriptionToJSON,
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

function makeNavigatorWithStandalone(standaloneValue: boolean | null) {
  return {
    serviceWorker: undefined as unknown,
    standalone: standaloneValue ?? undefined,
  };
}

describe("subscribeIfInstalled", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  function setupStandaloneEnv(useMatchMedia: boolean, navigatorStandalone: boolean = false) {
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue(makeMockSubscription()),
    };

    const reg = { pushManager };

    const nav = {
      serviceWorker: { ready: Promise.resolve(reg) },
      ...(navigatorStandalone ? { standalone: true } : {}),
    };

    vi.stubGlobal("navigator", nav);
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: useMatchMedia }),
    });

    return { pushManager, reg };
  }

  beforeEach(() => {
    vi.resetModules();
    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no-ops when not in standalone mode (browser tab)", async () => {
    setupStandaloneEnv(false, false);

    const { subscribeIfInstalled } = await import("../push.js");
    await subscribeIfInstalled("vapid-test-key");

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls existing.unsubscribe() before new subscribe() when subscription exists", async () => {
    const { pushManager } = setupStandaloneEnv(false, true); // iOS standalone

    const existingSubscription = makeMockSubscription();
    pushManager.getSubscription.mockResolvedValue(existingSubscription);

    const { subscribeIfInstalled } = await import("../push.js");
    await subscribeIfInstalled("vapid-test-key");

    expect(existingSubscription.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
  });

  it("posts subscription JSON to /api/notifications/subscribe", async () => {
    setupStandaloneEnv(true, false); // matchMedia standalone

    const { subscribeIfInstalled } = await import("../push.js");
    await subscribeIfInstalled("vapid-test-key");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/notifications/subscribe");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");

    const body = JSON.parse(options.body);
    expect(body.endpoint).toBe("https://push.example.com/endpoint");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("converts a URL-safe base64 string to Uint8Array correctly", async () => {
    const { urlBase64ToUint8Array } = await import("../push.js");

    // Known input: base64url encoding of bytes [1, 2, 3]
    const base64url = btoa(String.fromCharCode(1, 2, 3))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    const result = urlBase64ToUint8Array(base64url);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe(2);
    expect(result[2]).toBe(3);
  });
});
