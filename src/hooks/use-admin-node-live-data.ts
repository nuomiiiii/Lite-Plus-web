import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useOptionalAccount } from "@/contexts/AccountContext";
import { useRPC2Call } from "@/contexts/RPC2Context";
import type { LiveDataResponse } from "@/types/LiveData";
import { nodeOnlineState } from "@/utils/adminNodeOnlineState";
import { mergeLatestStatus } from "@/utils/liveData";

export { nodeOnlineState };

export const ADMIN_NODE_LIVE_INTERVAL_MS = 5000;

type AdminNodeLiveDataValue = {
  liveData: LiveDataResponse | null;
  available: boolean;
  subscribe: () => () => void;
};

const AdminNodeLiveDataContext = createContext<AdminNodeLiveDataValue | null>(
  null,
);

let cachedLiveData: LiveDataResponse | null = null;
let cachedAvailable = false;

export function clearAdminNodeLiveDataCache(): void {
  cachedLiveData = null;
  cachedAvailable = false;
}

export function isUnauthorizedLiveDataError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b401\b|unauthorized|unauthenticated|not logged in/i.test(message);
}

function AdminNodeLiveDataPoller({ children }: { children: ReactNode }) {
  const { call } = useRPC2Call();
  const accountContext = useOptionalAccount();
  const loggedOut =
    accountContext?.account !== undefined &&
    accountContext.account !== null &&
    !accountContext.account.logged_in;
  const [liveData, setLiveData] = useState<LiveDataResponse | null>(() =>
    loggedOut ? null : cachedLiveData,
  );
  const [available, setAvailable] = useState(() =>
    loggedOut ? false : cachedAvailable,
  );
  const [hasSubscribers, setHasSubscribers] = useState(false);
  const subscribersRef = useRef(0);
  const liveDataRef = useRef<LiveDataResponse | null>(
    loggedOut ? null : cachedLiveData,
  );

  useEffect(() => {
    if (!loggedOut) return;
    clearAdminNodeLiveDataCache();
    liveDataRef.current = null;
    setLiveData(null);
    setAvailable(false);
  }, [loggedOut]);

  const subscribe = useCallback(() => {
    subscribersRef.current += 1;
    setHasSubscribers(true);
    return () => {
      subscribersRef.current = Math.max(0, subscribersRef.current - 1);
      if (subscribersRef.current === 0) {
        setHasSubscribers(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasSubscribers) return;
    if (loggedOut) return;

    let timer: number | undefined;
    let stopped = false;
    let running = false;

    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(fetchLatest, ADMIN_NODE_LIVE_INTERVAL_MS);
      }
    };

    const fetchLatest = async () => {
      if (running || stopped || document.hidden) return;
      running = true;
      let unauthorized = false;
      try {
        const result = await call<
          { compact: true },
          Record<string, unknown>
        >("common:getNodesLatestStatus", { compact: true });
        if (stopped) return;
        const next = mergeLatestStatus(result, liveDataRef.current);
        if (next !== liveDataRef.current) {
          liveDataRef.current = next;
          cachedLiveData = next;
          setLiveData(next);
        }
        cachedAvailable = true;
        setAvailable(true);
      } catch (error) {
        if (isUnauthorizedLiveDataError(error)) {
          unauthorized = true;
          clearAdminNodeLiveDataCache();
          liveDataRef.current = null;
          if (!stopped) {
            setLiveData(null);
            setAvailable(false);
          }
        } else if (!stopped && !liveDataRef.current) {
          setAvailable(false);
        }
      } finally {
        running = false;
        if (!unauthorized) {
          scheduleNext();
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
      } else if (!running) {
        void fetchLatest();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!document.hidden) void fetchLatest();

    return () => {
      stopped = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [call, hasSubscribers, loggedOut]);

  const value = useMemo(
    () => ({ liveData, available, subscribe }),
    [liveData, available, subscribe],
  );

  return createElement(
    AdminNodeLiveDataContext.Provider,
    { value },
    children,
  );
}

export function AdminNodeLiveDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const existing = useContext(AdminNodeLiveDataContext);
  if (existing) return children;
  return createElement(AdminNodeLiveDataPoller, null, children);
}

export function useAdminNodeLiveData() {
  const context = useContext(AdminNodeLiveDataContext);
  if (!context) {
    throw new Error(
      "useAdminNodeLiveData must be used within AdminNodeLiveDataProvider",
    );
  }
  const { subscribe, liveData, available } = context;
  useEffect(() => subscribe(), [subscribe]);
  return { liveData, available };
}
