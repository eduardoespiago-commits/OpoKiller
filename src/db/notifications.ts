// Browser notifications. Fully optional — the app is complete without them.
// Nothing here throws if the API is missing or permission is denied.

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

export function canNotify(): boolean {
  return notificationsSupported() && Notification.permission === "granted";
}

/** Fire a local notification if allowed; otherwise no-op. */
export function notify(title: string, body?: string): void {
  if (!canNotify()) return;
  try {
    new Notification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "opokiller",
    });
  } catch {
    /* ignore: some browsers require a service-worker registration */
  }
}
