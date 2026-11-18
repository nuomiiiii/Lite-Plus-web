interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

export const LIKELY_ADMIN_ROUTES = [
  "/admin/servers",
  "/admin/billing",
  "/admin/ping",
  "/admin/return-route",
] as const;

export const ADMIN_IDLE_WARMUP_START_DELAY_MS = 4000;
export const ADMIN_IDLE_WARMUP_SLICE_TIMEOUT_MS = 4000;
export const ADMIN_IDLE_WARMUP_FALLBACK_MS = 800;
export const ADMIN_HOVER_PRELOAD_DELAY_MS = 120;

export const shouldPreloadAdminRoutes = (
  connection?: NetworkInformationLike,
): boolean => {
  if (connection?.saveData) return false;
  return (
    connection?.effectiveType !== "slow-2g" &&
    connection?.effectiveType !== "2g"
  );
};

export const normalizeAdminPathname = (target: string): string => {
  const pathname = target.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/admin";
  if (pathname === "/admin/dashboard") return "/admin";
  if (pathname === "/admin-app" || pathname.startsWith("/admin-app/")) return "/admin";
  return pathname;
};

export const expandAdminPreloadTargets = (target: string): string[] => {
  const pathname = normalizeAdminPathname(target);
  if (pathname.startsWith("/admin/settings/")) {
    return ["/admin/settings", pathname];
  }
  return [pathname];
};

export const getIdleAdminWarmupTargets = (
  currentPathname: string,
  connection?: NetworkInformationLike,
): string[] => {
  if (!shouldPreloadAdminRoutes(connection)) return [];
  const current = normalizeAdminPathname(currentPathname);
  const remaining = LIKELY_ADMIN_ROUTES.filter((route) => route !== current);
  if (connection?.effectiveType === "3g") return remaining.slice(0, 1);
  return [...remaining];
};

type IdleDeadlineLike = {
  timeRemaining: () => number;
  didTimeout: boolean;
};

export type AdminIdleWarmupTimers = {
  requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (handle: number) => void;
};

export const scheduleIdleAdminWarmup = ({
  targets,
  preload,
  startDelayMs = ADMIN_IDLE_WARMUP_START_DELAY_MS,
  timers,
}: {
  targets: readonly string[];
  preload: (target: string) => Promise<void> | void;
  startDelayMs?: number;
  timers: AdminIdleWarmupTimers;
}): (() => void) => {
  let stopped = false;
  let index = 0;
  let idleHandle: number | undefined;
  let timeoutHandle: number | undefined;

  const clearScheduled = () => {
    if (idleHandle !== undefined) {
      timers.cancelIdleCallback?.(idleHandle);
      idleHandle = undefined;
    }
    if (timeoutHandle !== undefined) {
      timers.clearTimeout(timeoutHandle);
      timeoutHandle = undefined;
    }
  };

  const runSlice = () => {
    idleHandle = undefined;
    timeoutHandle = undefined;
    if (stopped || index >= targets.length) return;
    const target = targets[index];
    index += 1;
    void Promise.resolve(preload(target)).finally(() => {
      if (stopped) return;
      scheduleSlice();
    });
  };

  const scheduleSlice = () => {
    if (stopped || index >= targets.length) return;
    if (typeof timers.requestIdleCallback === "function") {
      idleHandle = timers.requestIdleCallback(runSlice, {
        timeout: ADMIN_IDLE_WARMUP_SLICE_TIMEOUT_MS,
      });
      return;
    }
    timeoutHandle = timers.setTimeout(runSlice, ADMIN_IDLE_WARMUP_FALLBACK_MS);
  };

  timeoutHandle = timers.setTimeout(scheduleSlice, startDelayMs);

  return () => {
    stopped = true;
    clearScheduled();
  };
};
