import { useEffect, useRef } from "react";

export type VisibleIntervalOptions = {
  catchUpOnVisible?: boolean;
  runOnVisible?: boolean;
};

export function startVisibleInterval(
  callback: () => void,
  delayMs: number,
  options?: VisibleIntervalOptions,
): () => void {
  if (delayMs <= 0) return () => {};

  const catchUpOnVisible = options?.catchUpOnVisible ?? false;
  const runOnVisible = options?.runOnVisible ?? false;
  let active = true;
  let lastRunAt = Date.now();
  let missedWhileHidden = false;

  const isHidden = () =>
    typeof document !== "undefined" && document.visibilityState === "hidden";

  const timer = globalThis.setInterval(() => {
    if (!active) return;
    if (isHidden()) {
      missedWhileHidden = true;
      return;
    }
    lastRunAt = Date.now();
    missedWhileHidden = false;
    callback();
  }, delayMs);

  const needVisibilityListener = catchUpOnVisible || runOnVisible;
  const onVisibilityChange = () => {
    if (!active || !needVisibilityListener) return;
    if (typeof document === "undefined" || document.visibilityState !== "visible") {
      return;
    }
    if (runOnVisible || missedWhileHidden || Date.now() - lastRunAt >= delayMs) {
      lastRunAt = Date.now();
      missedWhileHidden = false;
      callback();
    }
  };

  if (needVisibilityListener && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return () => {
    if (!active) return;
    active = false;
    globalThis.clearInterval(timer);
    if (needVisibilityListener && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}

export function useVisibleInterval(
  callback: () => void,
  delayMs: number | null,
  options?: VisibleIntervalOptions,
): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const catchUpOnVisible = options?.catchUpOnVisible ?? false;
  const runOnVisible = options?.runOnVisible ?? false;

  useEffect(() => {
    if (delayMs === null || delayMs <= 0) return;
    return startVisibleInterval(() => callbackRef.current(), delayMs, {
      catchUpOnVisible,
      runOnVisible,
    });
  }, [catchUpOnVisible, delayMs, runOnVisible]);
}
