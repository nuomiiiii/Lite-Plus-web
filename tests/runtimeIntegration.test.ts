import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { shouldPreloadAdminRoutes } from "../src/utils/adminPreload.ts";
import { isLiteThemeCacheEntry } from "../src/utils/themeCache.ts";

test("admin warmup respects reduced-data connections", () => {
  assert.equal(shouldPreloadAdminRoutes(), true);
  assert.equal(shouldPreloadAdminRoutes({ effectiveType: "4g" }), true);
  assert.equal(shouldPreloadAdminRoutes({ effectiveType: "2g" }), false);
  assert.equal(shouldPreloadAdminRoutes({ effectiveType: "slow-2g" }), false);
  assert.equal(shouldPreloadAdminRoutes({ saveData: true, effectiveType: "4g" }), false);

  const preload = readFileSync("src/utils/adminPreload.ts", "utf8");
  const routes = readFileSync("src/routes.ts", "utf8");
  const likelyRoutesSource = preload.match(
    /export const LIKELY_ADMIN_ROUTES = \[([\s\S]*?)\] as const/,
  )?.[1];
  assert.ok(likelyRoutesSource);
  assert.deepEqual(
    Array.from(likelyRoutesSource.matchAll(/"([^"]+)"/g), (match) => match[1]),
    [
      "/admin/servers",
      "/admin/billing",
      "/admin/ping",
      "/admin/return-route",
      "/admin/nodemgt",
    ],
  );
  assert.doesNotMatch(likelyRoutesSource, /\/admin\/notification\/load/);
  assert.doesNotMatch(likelyRoutesSource, /\/admin\/settings\/site/);
  assert.doesNotMatch(routes, /Object\.values\(adminRoutePreloaders\)/);
  assert.doesNotMatch(routes, /Promise\.allSettled/);

  const layout = readFileSync("src/pages/admin/_layout.tsx", "utf8");
  const viewport = readFileSync(
    "src/components/admin/AdminRouteViewport.tsx",
    "utf8",
  );
  const loading = readFileSync("src/components/loading.tsx", "utf8");
  const settingsSkeleton = readFileSync(
    "src/components/admin/SettingsPageSkeleton.tsx",
    "utf8",
  );
  assert.doesNotMatch(layout, /useDeferredValue/);
  assert.match(
    layout,
    /<AdminRouteViewport\s+fallback=\{<AdminRouteLoading \/>\}\s+outlet=\{outlet\}/,
  );
  assert.match(layout, /onFirstReady=\{\(\) => setFirstRouteReady\(true\)\}/);
  assert.match(layout, /\{!firstRouteReady \? \(/);
  assert.match(layout, /<FullPageLoading \/>/);
  assert.match(
    layout,
    /const AdminRouteLoading = \(\) => \(\s*<div data-admin-route-pending="true" hidden \/>\s*\);/,
  );
  assert.match(layout, /visibility: firstRouteReady \? "visible" : "hidden"/);
  assert.match(viewport, /data-admin-route-active=\{active \? "true" : "false"\}/);
  assert.match(
    viewport,
    /<React\.Suspense fallback=\{fallback\}>\{view\.outlet\}<\/React\.Suspense>/,
  );
  assert.match(viewport, /isRouteViewReady\(element\)/);
  assert.match(viewport, /if \(isRouteViewReady\(element\)\) promote\(\)/);
  assert.match(viewport, /onFirstReadyRef\.current\?\.\(\)/);
  assert.doesNotMatch(viewport, /readyFrames/);
  assert.doesNotMatch(viewport, /characterData: true/);
  assert.match(loading, /data-admin-route-pending=\{inline \? undefined : "true"\}/);
  assert.match(settingsSkeleton, /data-admin-route-pending=\{inline \? undefined : "true"\}/);

  const managedTheme = readFileSync(
    "src/pages/admin/theme_managed.tsx",
    "utf8",
  );
  assert.match(managedTheme, /setLoading\(true\)/);
  assert.match(managedTheme, /publicInfoLoading \|\| \(!publicInfo && !publicInfoError\)/);
  assert.match(managedTheme, /if \(!theme\) \{[\s\S]*setLoading\(false\);[\s\S]*setFirstLoading\(false\)/);
  assert.match(managedTheme, /data-admin-route-pending=\{firstLoading \? "true" : undefined\}/);
  assert.doesNotMatch(managedTheme, /<Loading/);
});

test("theme switching removes only Lite navigation and theme cache entries", () => {
  const origin = "https://monitor.example";
  assert.equal(isLiteThemeCacheEntry(`${origin}/admin/settings/theme`, origin, "navigate"), true);
  assert.equal(isLiteThemeCacheEntry(`${origin}/themes/emerald/assets/app.js`, origin), true);
  assert.equal(isLiteThemeCacheEntry(`${origin}/system-assets/assets/app.js`, origin), true);
  assert.equal(isLiteThemeCacheEntry(`${origin}/api/clients`, origin), false);
  assert.equal(isLiteThemeCacheEntry("https://other.example/themes/app.js", origin), false);

  const source = readFileSync("src/utils/themeCache.ts", "utf8");
  assert.doesNotMatch(source, /getRegistrations\(\)/);
  assert.doesNotMatch(source, /caches\.delete\(cacheName\)/);
  assert.match(source, /cache\.delete\(request\)/);
});

test("load alert configuration requests own a bootstrap state", () => {
  const source = readFileSync("src/contexts/LoadAlertContext.tsx", "utf8");
  const page = readFileSync("src/pages/admin/notification/load.tsx", "utf8");
  assert.match(source, /loadAlertBootstrapResource\.read\(accountKey\)/);
  assert.match(source, /const refresh = React\.useCallback\(async \(\) =>/);
  assert.match(source, /finally \{\s*setIsLoading\(false\)/);
  assert.match(page, /isLoading && loadAlerts === null/);
  assert.doesNotMatch(source, /void refresh\(\);\s*\}, \[refresh\]\)/);
  assert.doesNotMatch(source, /\/api\/admin\/notification\/load\/current/);
});

test("deep routes use an origin-root favicon before backend rewriting", () => {
  const html = readFileSync("index.html", "utf8");
  assert.match(html, /rel="shortcut icon" href="\/favicon\.png\?v=lite-icon-0e86dd"/);
  assert.doesNotMatch(html, /href="favicon\.ico"/);
});
