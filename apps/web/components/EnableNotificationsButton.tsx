"use client";

import { useState } from "react";
import { subscribeIfInstalled } from "../lib/push";

/**
 * Soft-ask button that defers Notification.requestPermission() to an explicit user gesture.
 * NOTIF-07: Push permission is NEVER requested on page load — only on user click.
 * Renders null when:
 *   - Button has already been clicked (asked state)
 *   - Notification API is unavailable (non-supporting browser)
 *   - Permission is already granted
 */
export default function EnableNotificationsButton() {
  const [asked, setAsked] = useState(false);

  // Render nothing if the button was already clicked
  if (asked) return null;

  // Render nothing if the Notification API is unavailable
  if (typeof Notification === "undefined") return null;

  // Render nothing if permission is already granted
  if (Notification.permission === "granted") return null;

  async function handleClick() {
    setAsked(true);

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
      await subscribeIfInstalled(vapidKey);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
    >
      Enable notifications
    </button>
  );
}
