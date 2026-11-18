import React, { StrictMode, Suspense, useCallback, useLayoutEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "./global.css";
import {
  ThemeContext,
  THEME_DEFAULTS,
  type Appearance,
} from "./contexts/ThemeContext";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { useSystemTheme } from "./hooks/useSystemTheme";
import { BrowserRouter, useLocation, useRoutes } from "react-router-dom";
// Ensure i18n is initialized before any component renders
import { i18nReady } from "./i18n/config";
import ErrorBoundary from "./components/ErrorBoundary";
import { preloadAdminEntry, preloadAdminRoute, preloadAdminRouteChunks, routes } from "./routes";
import Loading from "./components/loading";
import { PublicInfoProvider } from "./contexts/PublicInfoContext";
import { OfflineIndicator } from "./components/OfflineIndicator";
import { Toaster } from "./components/ui/sonner";
import { RPC2Provider } from "./contexts/RPC2Context";
import { AccountProvider } from "./contexts/AccountContext";
import { useAccount } from "./contexts/AccountContext";
import FullPageLoading from "./components/FullPageLoading";
import DocumentTitle from "./components/DocumentTitle";
import AccountPreferenceSync from "./components/AccountPreferenceSync";
import SessionActivitySync from "./components/SessionActivitySync";
import {
  getIdleAdminWarmupTargets,
  scheduleIdleAdminWarmup,
} from "./utils/adminPreload";
import { prefetchAdminDashboard } from "./utils/dashboardPrefetch";
import MuiAppProvider from "./theme/MuiAppProvider";
import { applyAppearanceChrome } from "./theme/appearanceChrome";
import { clientCookieSuffix, isSafeTempKey } from "./utils/security";
import { preparePrivateApplication } from "./utils/preparePrivateApplication";

import RadixThemeRoot from "./theme/RadixThemeRoot";

const appShellStyle = {
  backgroundColor: "transparent",
  minHeight: "var(--app-viewport-height, 100vh)",
} as const;

const AdminRoutePreloader = () => {
  const { account } = useAccount();

  React.useEffect(() => {
    if (!account?.logged_in) return;
    const accountKey = account.uuid || account.username || "authenticated";
    const pathname = window.location.pathname.replace(/\/$/, "") || "/";
    if (pathname === "/admin") {
      void prefetchAdminDashboard(accountKey).catch(() => undefined);
      void preloadAdminRoute("/admin/settings/dashboard").catch(() => undefined);
    }
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    const targets = getIdleAdminWarmupTargets(
      window.location.pathname,
      connection,
    );
    if (targets.length === 0) return;

    let stopWarmup: (() => void) | undefined;
    const startWarmup = () => {
      stopWarmup = scheduleIdleAdminWarmup({
        targets,
        preload: preloadAdminRouteChunks,
        timers: {
          requestIdleCallback: window.requestIdleCallback?.bind(window),
          cancelIdleCallback: window.cancelIdleCallback?.bind(window),
          setTimeout: (callback, delay) =>
            Number(globalThis.setTimeout(callback, delay)),
          clearTimeout: (handle) => globalThis.clearTimeout(handle),
        },
      });
    };

    if (document.readyState === "complete") {
      startWarmup();
    } else {
      window.addEventListener("load", startWarmup, { once: true });
    }

    return () => {
      window.removeEventListener("load", startWarmup);
      stopWarmup?.();
    };
  }, [account?.logged_in]);

  return null;
};

const AccountScopedRPC2 = ({ children }: { children: React.ReactNode }) => {
  const { account } = useAccount();
  if (!account?.logged_in) {
    return children;
  }
  return <RPC2Provider>{children}</RPC2Provider>;
};

const App = () => {
	const { pathname } = useLocation();
	const currentPath = pathname.replace(/\/$/, "");
	const isAdminRoute = currentPath === "/admin" || currentPath.startsWith("/admin/");
	const isRemoteRoute = currentPath === "/terminal" || currentPath.startsWith("/terminal/");
	const usePlainThemeRoot = isAdminRoute || isRemoteRoute;
	const isUpgradeRoute =
		currentPath === "/admin/update/1.2.7" ||
		currentPath === "/admin/update/storage-v4";
	const isRestrictedGuideRoute =
		isUpgradeRoute ||
		currentPath === "/install" ||
		currentPath === "/database-recovery";
	if (isAdminRoute) {
		preloadAdminEntry(currentPath);
	}
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tempKey = params.get("temp_key");

    if (tempKey && isSafeTempKey(tempKey)) {
      document.cookie = `temp_key=${encodeURIComponent(tempKey)}; max-age=${60 * 60 * 24 * 365 * 100}${clientCookieSuffix()}`;
      params.delete("temp_key");
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${params.toString() ? "?" + params.toString() : ""}`,
      );
    }
  }, []);
  React.useEffect(() => {
    try {
      window.localStorage.removeItem("color");
    } catch {
      /* leftover Radix accent from older builds */
    }
  }, []);
  const [appearance, setAppearance] = useLocalStorage<Appearance>(
    "appearance",
    THEME_DEFAULTS.appearance,
  );

  const resolvedAppearance = useSystemTheme(appearance);

  useLayoutEffect(() => {
    applyAppearanceChrome(resolvedAppearance === "dark");
  }, [resolvedAppearance]);

  const setAppearanceSynced = useCallback(
    (value: Appearance) => {
      const resolved =
        value === "system"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : value;
      applyAppearanceChrome(resolved === "dark");
      flushSync(() => {
        setAppearance(value);
      });
    },
    [setAppearance],
  );

  const themeContextValue = useMemo(
    () => ({
      appearance,
      setAppearance: setAppearanceSynced,
    }),
    [appearance, setAppearanceSynced],
  );
  const routing = useRoutes(routes);
  const appTree = isRestrictedGuideRoute ? (
    <PublicInfoProvider>
      <DocumentTitle />
      <Toaster />
      <Suspense fallback={<Loading fullscreen />}>
        {routing}
      </Suspense>
    </PublicInfoProvider>
  ) : (
    <AccountProvider>
      <AccountPreferenceSync />
      <SessionActivitySync />
      <AdminRoutePreloader />
      <PublicInfoProvider>
        <DocumentTitle />
        <Toaster />
        <OfflineIndicator />
        <AccountScopedRPC2>
          <Suspense
            fallback={isAdminRoute ? <FullPageLoading /> : <Loading fullscreen />}
          >
            {routing}
          </Suspense>
        </AccountScopedRPC2>
      </PublicInfoProvider>
    </AccountProvider>
  );
  return (
    <ThemeContext.Provider value={themeContextValue}>
      <MuiAppProvider appearance={resolvedAppearance}>
      <ErrorBoundary>
        <RadixThemeRoot
          appearance={resolvedAppearance}
          scaling="110%"
          plain={usePlainThemeRoot}
          style={appShellStyle}
        >
          {appTree}
        </RadixThemeRoot>
      </ErrorBoundary>
      </MuiAppProvider>
    </ThemeContext.Provider>
  );
};

void i18nReady.then(async () => {
  await preparePrivateApplication();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
