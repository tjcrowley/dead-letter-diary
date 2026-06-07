/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { isApiRoute } from "../lib/sw-route-matcher";

declare const self: ServiceWorkerGlobalScope &
  typeof globalThis & {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  } & SerwistGlobalConfig;

const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ url }) => isApiRoute(url.pathname),
    handler: new NetworkOnly(),
  },
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Handle incoming push notifications (NOTIF-01, WIPE-02)
self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() as {
    type?: string;
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  };

  // Wipe ceremony — must be checked BEFORE the normal notification path
  if (data?.type === "wipe") {
    event.waitUntil(
      (async () => {
        // Step 1: Clear Cache Storage
        try {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((k) => caches.delete(k)));
        } catch {
          // Best-effort
        }

        // Step 2: Navigate all open window clients to /wiped BEFORE
        // deleteDatabase — this unblocks any open IDB connections so
        // the delete does not hit an onblocked deadlock.
        const allClients = await self.clients.matchAll({ type: "window" });
        for (const client of allClients) {
          client.navigate("/wiped");
        }

        // Step 3: Delete IndexedDB — treat onblocked / onerror as resolve
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase("DeadLetterDiary");
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        });

        // Step 4: Show wipe notification
        await self.registration.showNotification("Dead Letter Diary", {
          body: "Your diary has been permanently destroyed.",
          icon: "/icons/icon-192x192.png",
          requireInteraction: true,
        });
      })()
    );
    return; // Do not fall through to normal notification logic
  }

  const title = data?.title ?? "Dead Letter Diary";
  const options: NotificationOptions = {
    body: data?.body ?? "Your deadline is approaching.",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    data: data?.data ?? {},
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — open the write page (NOTIF-02)
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow("/write")
  );
});
