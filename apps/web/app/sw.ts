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

// Handle incoming push notifications (NOTIF-01)
self.addEventListener("push", (event: PushEvent) => {
  const data = event.data?.json() as {
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
  };

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
