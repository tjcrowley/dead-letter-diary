/**
 * Client-side Web Push subscription management.
 * subscribeIfInstalled() gates on iOS standalone mode — no-ops in a browser tab.
 * Unsubscribes existing subscription before re-subscribing to handle iOS silent expiry.
 */

/**
 * Convert a URL-safe base64 string (VAPID public key) to a Uint8Array.
 * Required by pushManager.subscribe({ applicationServerKey }).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Pad to multiple of 4 characters
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Returns true if the app is running in standalone (installed PWA) mode.
 * Checks both CSS media query (Android/Chrome) and navigator.standalone (iOS Safari).
 */
function isStandalone(): boolean {
  // iOS Safari: navigator.standalone is true when launched from Home Screen
  if ((navigator as { standalone?: boolean }).standalone === true) {
    return true;
  }
  // Android/Chrome PWA: display-mode: standalone media query
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(display-mode: standalone)").matches;
  }
  return false;
}

/**
 * Subscribe to Web Push notifications if the app is installed as a PWA (standalone mode).
 * No-op in a browser tab (NOTIF-03).
 * Re-subscribes on every call to handle iOS silent subscription expiry (NOTIF-04).
 * POSTs the subscription to /api/notifications/subscribe.
 */
export async function subscribeIfInstalled(vapidPublicKey: string): Promise<void> {
  if (!isStandalone()) {
    // Not installed as PWA — do not subscribe
    return;
  }

  if (!("serviceWorker" in navigator) || !navigator.serviceWorker) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;

  if (!registration.pushManager) {
    return;
  }

  // Unsubscribe existing subscription before re-subscribing (handles iOS silent expiry)
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) {
    await existingSubscription.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  await fetch("/api/notifications/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(subscription.toJSON()),
  });
}

/**
 * Unsubscribe from Web Push notifications and remove the subscription from the server.
 */
export async function unsubscribe(): Promise<void> {
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;

  if (!registration.pushManager) {
    return;
  }

  const existing = await registration.pushManager.getSubscription();
  if (!existing) {
    return;
  }

  const endpoint = existing.endpoint;

  await existing.unsubscribe();

  await fetch("/api/notifications/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ endpoint }),
  });
}
