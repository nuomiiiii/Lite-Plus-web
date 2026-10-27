// routes.js
import { lazy } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import React from "react";
import {
  expandAdminPreloadTargets,
  LIKELY_ADMIN_ROUTES,
  normalizeAdminPathname,
} from "./utils/adminPreload";
import { isNodemgtAdminPath } from "./utils/adminRouteViewport";

const importAdminLayout = () => import("./pages/admin/_layout");
const importAdminDashboard = () => import("./pages/admin/dashboard");
const importAdminServers = () => import("./pages/admin");
const importAdminBilling = () => import("./pages/admin/billing");
const importAdminPing = () => import("./pages/admin/pingTask");
const importAdminReturnRoute = () => import("./pages/admin/returnRoute");
const importAdminSettingsLayout = () =>
  import("./pages/admin/settings/_layout");
let adminLayoutModule: ReturnType<typeof importAdminLayout> | undefined;
let adminDashboardModule: ReturnType<typeof importAdminDashboard> | undefined;
let adminServersModule: ReturnType<typeof importAdminServers> | undefined;
let adminBillingModule: ReturnType<typeof importAdminBilling> | undefined;
let adminPingModule: ReturnType<typeof importAdminPing> | undefined;
let adminReturnRouteModule: ReturnType<typeof importAdminReturnRoute> | undefined;
let adminSettingsLayoutModule: ReturnType<
  typeof importAdminSettingsLayout
> | undefined;
const loadAdminLayout = () => (adminLayoutModule ??= importAdminLayout());
const loadAdminDashboard = () =>
  (adminDashboardModule ??= importAdminDashboard());
const loadAdminServers = () => (adminServersModule ??= importAdminServers());
const loadAdminBilling = () => (adminBillingModule ??= importAdminBilling());
const loadAdminPing = () => (adminPingModule ??= importAdminPing());
const loadAdminReturnRoute = () =>
  (adminReturnRouteModule ??= importAdminReturnRoute());
const loadAdminSettingsLayout = () =>
  (adminSettingsLayoutModule ??= importAdminSettingsLayout());
let nodemgtAdminModule: ReturnType<typeof importNodemgtAdminPage> | undefined;
const importNodemgtAdminPage = () => import("./pages/admin/nodemgt/index");
const loadNodemgtAdminPage = () => (nodemgtAdminModule ??= importNodemgtAdminPage());
const NODEMGT_ADMIN_SEGMENTS = [
  "",
  "overview",
  "inbounds",
  "forwarding",
  "outbounds",
  "routes",
  "users",
  "node-users",
  "plans",
  "certificates",
  "certs",
  "subscriptions",
  "templates",
  "audit",
  "diag",
] as const;
const nodemgtAdminPath = (segment: string) =>
  segment ? `/admin/nodemgt/${segment}` : `/admin/nodemgt`;

export const preloadAdminEntry = (pathname: string) => {
  void loadAdminLayout();
  if (normalizeAdminPathname(pathname) === "/admin") void loadAdminDashboard();
};

const adminRoutePreloaders: Record<string, () => Promise<unknown>> = {
  "/admin": loadAdminDashboard,
  "/admin/servers": loadAdminServers,
  "/admin/billing": loadAdminBilling,
  ...Object.fromEntries(
    (["nodemgt", "plus", "nodes"] as const).flatMap((prefix) =>
      NODEMGT_ADMIN_SEGMENTS.map((segment) => [
        segment ? `/admin/${prefix}/${segment}` : `/admin/${prefix}`,
        loadNodemgtAdminPage,
      ]),
    ),
  ),
  "/admin/ping": loadAdminPing,
  "/admin/return-route": loadAdminReturnRoute,
  "/admin/logs": () => import("./pages/admin/log"),
  "/admin/exec": () => import("./pages/admin/exec"),
  "/admin/remote-management/schedules": () => import("./pages/admin/remote-management/schedules"),
  "/admin/remote-management/firewall": () => import("./pages/admin/remote-management/firewall"),
  "/admin/remote-management/mcp": () => import("./pages/admin/remote-management/mcp"),
  "/admin/theme_managed": () => import("./pages/admin/theme_managed.tsx"),
  "/admin/theme_raw": () => import("./pages/admin/theme_raw.tsx"),
  "/admin/market/themes": () => import("./pages/admin/market/themes"),
  "/admin/settings": loadAdminSettingsLayout,
  "/admin/settings/site": () => import("./pages/admin/settings/site"),
  "/admin/settings/dashboard": () => import("./pages/admin/settings/dashboard"),
  "/admin/settings/theme": () => import("./pages/admin/settings/theme"),
  "/admin/settings/notification": () => import("./pages/admin/settings/notification"),
  "/admin/settings/general": () => import("./pages/admin/settings/general"),
  "/admin/settings/xtermjs": () => import("./pages/admin/settings/xtermjs"),
  "/admin/settings/reverse-proxy": () => import("./pages/admin/settings/reverse-proxy"),
  "/admin/settings/metrics": () => import("./pages/admin/settings/metrics"),
  "/admin/settings/account-security": () => import("./pages/admin/settings/account-security"),
  "/admin/notification/center": () => import("./pages/admin/notification/center"),
  "/admin/notification/offline": () => import("./pages/admin/notification/offline"),
  "/admin/notification/load": () => import("./pages/admin/notification/load"),
  "/admin/notification/general": () => import("./pages/admin/notification/general"),
  "/admin/notification/traffic-report": () => import("./pages/admin/notification/traffic_report"),
  "/admin/notification/ping-loss": () => import("./pages/admin/notification/ping_loss"),
};

export const preloadAdminRoute = async (target: string): Promise<void> => {
  const pathname = normalizeAdminPathname(target);
  if (isNodemgtAdminPath(pathname)) {
    void import("./pages/admin/nodemgt/prefetch")
      .then((mod) => mod.prefetchNodemgtAdmin())
      .catch(() => undefined);
  }
  if (pathname === "/admin/billing") {
    void import("./utils/billing")
      .then((mod) => mod.prefetchBillingCenter())
      .catch(() => undefined);
  }
  if (pathname === "/admin/settings/reverse-proxy") {
    void import("./lib/https")
      .then((mod) => mod.prefetchHTTPSSettings())
      .catch(() => undefined);
    void import("./lib/cloudflared")
      .then((mod) => mod.prefetchCloudflaredStatus())
      .catch(() => undefined);
  }
  if (pathname === "/admin/settings/xtermjs") {
    void import("./hooks/useXtermjsSettings")
      .then((mod) => mod.prefetchXtermjsSettings())
      .catch(() => undefined);
  }
  if (pathname === "/admin/market/themes") {
    void import("./lib/themeMarket")
      .then((mod) => mod.prefetchThemeMarket())
      .catch(() => undefined);
  }
  if (pathname === "/admin/settings/theme") {
    void import("./lib/themeList")
      .then((mod) => mod.prefetchInstalledThemes())
      .catch(() => undefined);
  }
  if (pathname === "/admin/theme_managed") {
    void import("./lib/themeManaged")
      .then((mod) => mod.prefetchThemeManagedConfig())
      .catch(() => undefined);
  }
  if (pathname === "/admin/settings/dashboard") {
    void import("./hooks/useDashboardSettings")
      .then((mod) => mod.prefetchDashboardSettings())
      .catch(() => undefined);
  }
  if (pathname === "/admin/settings/metrics") {
    void import("./lib/metricDefinitions")
      .then((mod) => mod.prefetchMetricDefinitions())
      .catch(() => undefined);
    void import("./components/admin/DatabaseMaintenanceCard")
      .then((mod) => mod.prefetchDatabaseOverview())
      .catch(() => undefined);
  }
  if (pathname === "/admin/settings/account-security") {
    void import("./lib/accountPasskeys")
      .then((mod) => mod.prefetchAccountPasskeys())
      .catch(() => undefined);
  }
  if (pathname.startsWith("/admin/remote-management/firewall")) {
    const uuid = new URLSearchParams(target.split("?")[1] || "").get("uuid")?.trim() || "";
    if (uuid) {
      void import("./pages/admin/remote-management/firewallPrefetch")
        .then((mod) => mod.prefetchFirewallView(uuid))
        .catch(() => undefined);
    }
  }
  await Promise.all(
    expandAdminPreloadTargets(pathname).map((path) => {
      const preload = adminRoutePreloaders[path];
      return preload ? preload() : Promise.resolve();
    }),
  );
};

export const preloadAdminRoutes = async (
  targets: readonly string[] = LIKELY_ADMIN_ROUTES,
): Promise<void> => {
  for (const target of targets) {
    await preloadAdminRoute(target);
  }
};

const AdminLayout = lazy(loadAdminLayout);
const AdminDashboard = lazy(loadAdminDashboard);
const AdminServers = lazy(loadAdminServers);
const AdminBilling = lazy(loadAdminBilling);
const AdminPing = lazy(loadAdminPing);
const AdminReturnRoute = lazy(loadAdminReturnRoute);
const AdminSettingsLayout = lazy(loadAdminSettingsLayout);
const NotFound = lazy(() => import("./pages/404"));

export const routes: RouteObject[] = [
  {
    path: "/admin/update/storage-v4",
    element: React.createElement(
      lazy(() => import("./pages/admin/update_storage_v4"))
    ),
  },
  {
    path: "/install",
    element: React.createElement(lazy(() => import("./pages/install"))),
  },
  {
    path: "/admin",
    element: React.createElement(AdminLayout),
    children: [
      { index: true, element: React.createElement(AdminDashboard) },
      {
        path: "dashboard",
        element: React.createElement(AdminDashboard),
      },
      {
        path: "servers",
        element: React.createElement(AdminServers),
      },
      {
        path: "billing",
        element: React.createElement(AdminBilling),
      },
      ...NODEMGT_ADMIN_SEGMENTS.map((segment) =>
        segment === "diag"
          ? {
              path: "nodemgt/diag",
              element: React.createElement(Navigate, {
                replace: true,
                to: "/admin/nodemgt/overview",
              }),
            }
          : {
              path: segment ? `nodemgt/${segment}` : "nodemgt",
              element: React.createElement(lazy(loadNodemgtAdminPage)),
            },
      ),
      ...(["plus", "nodes"] as const).flatMap((prefix) =>
        NODEMGT_ADMIN_SEGMENTS.map((segment) => ({
          path: segment ? `${prefix}/${segment}` : prefix,
          element: React.createElement(Navigate, {
            replace: true,
            to: nodemgtAdminPath(segment),
          }),
        })),
      ),
      {
        path: "servers/:uuid",
        element: React.createElement(
          lazy(() => import("./pages/admin/NodeDetailPage")),
        ),
      },
      {
        path: "theme_managed",
        element: React.createElement(
          lazy(() => import("./pages/admin/theme_managed.tsx"))
        ),
      },
      {
        path: "theme_raw",
        element: React.createElement(
          lazy(() => import("./pages/admin/theme_raw.tsx"))
        ),
      },
      {
        path: "market/themes",
        element: React.createElement(
          lazy(() => import("./pages/admin/market/themes"))
        ),
      },
      {
        path: "sessions",
        element: React.createElement(Navigate, {
          replace: true,
          to: "/admin/settings/account-security?tab=sessions",
        }),
      },
      {
        path: "account",
        element: React.createElement(Navigate, {
          replace: true,
          to: "/admin/settings/account-security?tab=account",
        }),
      },
      {
        path: "settings",
        element: React.createElement(AdminSettingsLayout),
        children: [
          {
            path: "site",
            element: React.createElement(
              lazy(() => import("./pages/admin/settings/site"))
            ),
          },
          {
            path: "dashboard",
            element: React.createElement(
              lazy(() => import("./pages/admin/settings/dashboard"))
            ),
          },
          {
            path: "theme",
            element: React.createElement(
              lazy(() => import("./pages/admin/settings/theme"))
            ),
          },
          {
            path: "custom",
            element: React.createElement(Navigate, {
              replace: true,
              to: "/admin/settings/site",
            }),
          },
          {
            path: "sign-on",
            element: React.createElement(Navigate, {
              replace: true,
              to: "/admin/settings/account-security?tab=sign-on",
            }),
          },
          {
            path: "notification",
            element: React.createElement(
              lazy(() => import("./pages/admin/settings/notification"))
            ),
          },
          {
            path: "general",
            element: React.createElement(
              lazy(() => import("./pages/admin/settings/general"))
            ),
          },
          {
            path: "xtermjs",
            element: React.createElement(
              lazy(() => import("./pages/admin/settings/xtermjs"))
            ),
          },
          {
            path: "mcp",
            element: React.createElement(Navigate, {
              replace: true,
              to: "/admin/remote-management/mcp",
            }),
          },
          {
            path: "reverse-proxy",
            element: React.createElement(
              lazy(() => import("./pages/admin/settings/reverse-proxy"))
            ),
          },
          {
            path: "metrics",
            element: React.createElement(
              lazy(() => import("./pages/admin/settings/metrics"))
            ),
          },
          {
            path: "account-security",
            element: React.createElement(
              lazy(() => import("./pages/admin/settings/account-security"))
            ),
          },
        ],
      },
      {
        path: "notification",
        children: [
          {
            path: "center",
            element: React.createElement(
              lazy(() => import("./pages/admin/notification/center"))
            ),
          },
          {
            path: "offline",
            element: React.createElement(
              lazy(() => import("./pages/admin/notification/offline"))
            ),
          },
          {
            path: "load",
            element: React.createElement(
              lazy(() => import("./pages/admin/notification/load"))
            ),
          },
          {
            path: "general",
            element: React.createElement(
              lazy(() => import("./pages/admin/notification/general"))
            ),
          },
          {
            path: "traffic-report",
            element: React.createElement(
              lazy(() => import("./pages/admin/notification/traffic_report"))
            ),
          },
          {
            path: "ping-loss",
            element: React.createElement(
              lazy(() => import("./pages/admin/notification/ping_loss"))
            ),
          },
        ],
      },
      {
        path: "ping",
        element: React.createElement(AdminPing),
      },
      {
        path: "return-route",
        element: React.createElement(AdminReturnRoute),
      },
      {
        path: "logs",
        element: React.createElement(lazy(() => import("./pages/admin/log"))),
      },
      {
        path: "exec",
        element: React.createElement(lazy(() => import("./pages/admin/exec"))),
      },
      {
        path: "remote-management/schedules/:scheduleId?",
        element: React.createElement(
          lazy(() => import("./pages/admin/remote-management/schedules")),
        ),
      },
      {
        path: "remote-management/firewall",
        element: React.createElement(
          lazy(() => import("./pages/admin/remote-management/firewall")),
        ),
      },
      {
        path: "remote-management/mcp",
        element: React.createElement(
          lazy(() => import("./pages/admin/remote-management/mcp")),
        ),
      }
    ],
  },
  {
    path: "/admin-app",
    element: React.createElement(Navigate, {
      replace: true,
      to: "/admin",
    }),
  },
  {
    path: "/admin-app/*",
    element: React.createElement(Navigate, {
      replace: true,
      to: "/admin",
    }),
  },
  {
    path: "/terminal",
    element: React.createElement(lazy(() => import("./pages/terminal"))),
  },
  {
    path: "/manage/*",
    element: React.createElement(lazy(() => import("./pages/manage"))),
  },
  // Catch-all 404 route
  { path: "*", element: React.createElement(NotFound) },
];
