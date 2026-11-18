import { useEffect, useRef } from "react";

import { sameOriginApiPath, sameOriginFetchInit } from "@/utils/security";

export const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;
export const MERGE_MS = 60_000;
const CHANNEL = "lite-session-touch";

type TouchPayload = {
  expired?: boolean;
  server_time?: string;
  expires_at?: string;
  ttl_seconds?: number;
};

type TouchListener = (payload: TouchPayload) => void;

const listeners = new Set<TouchListener>();

export function subscribeSessionTouch(listener: TouchListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function postSessionTouch(): Promise<TouchPayload | null> {
  const response = await fetch(
    sameOriginApiPath("/api/session/touch"),
    sameOriginFetchInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
  );
  if (response.status === 401) {
    return { expired: true };
  }
  if (!response.ok) {
    throw new Error(`session touch failed (${response.status})`);
  }
  const body = (await response.json()) as { data?: TouchPayload } & TouchPayload;
  return body.data ?? body;
}

export function useSessionActivity(enabled: boolean) {
  const trailingTimer = useRef<number | null>(null);
  const lastSent = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const pendingAfter = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const channel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(CHANNEL)
        : null;

    const publish = (payload: TouchPayload) => {
      for (const listener of listeners) listener(payload);
      channel?.postMessage(payload);
    };

    const send = (reason: "immediate" | "merged") => {
      void reason;
      if (cancelled) return;
      if (inflight.current) {
        pendingAfter.current = true;
        return;
      }
      lastSent.current = Date.now();
      inflight.current = postSessionTouch()
        .then((payload) => {
          if (payload && !cancelled) publish(payload);
        })
        .catch(() => {
          // Keep the last confirmed expiry; do not retry in a loop.
        })
        .finally(() => {
          inflight.current = null;
          if (!pendingAfter.current || cancelled) return;
          pendingAfter.current = false;
          send("merged");
        });
    };

    const schedule = () => {
      const now = Date.now();
      const wait = Math.max(0, MERGE_MS - (now - lastSent.current));
      if (trailingTimer.current) window.clearTimeout(trailingTimer.current);
      if (wait === 0) {
        send("immediate");
        return;
      }
      trailingTimer.current = window.setTimeout(() => send("merged"), wait);
    };

    const onActivity = () => {
      if (document.visibilityState === "hidden") return;
      schedule();
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      send("immediate");
    };

    send("immediate");
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { capture: true, passive: true });
    }
    window.addEventListener("pageshow", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    if (channel) {
      channel.onmessage = (event) => {
        const payload = event.data as TouchPayload | undefined;
        if (payload) {
          for (const listener of listeners) listener(payload);
        }
      };
    }

    return () => {
      cancelled = true;
      if (trailingTimer.current) window.clearTimeout(trailingTimer.current);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity, true);
      }
      window.removeEventListener("pageshow", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
  }, [enabled]);
}
