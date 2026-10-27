import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  APPEARANCE_MENU_PATH,
  buildAdminMenuItems,
  syncSubMenuForLocation,
  toggleSingleSubMenu,
} from "../src/utils/adminMenu.ts";
import type { MenuItem } from "../src/types/menu.ts";

const menuConfig = JSON.parse(
  readFileSync(new URL("../src/config/menuConfig.json", import.meta.url), "utf8"),
) as { menu: MenuItem[]; footer: MenuItem[] };
const adminPanelSource = [
  "shell/AdminShell.tsx",
  "shell/useAdminShell.ts",
  "shell/AdminSidebar.tsx",
  "shell/AdminTopbar.tsx",
  "shell/UpdateReleaseDialog.tsx",
  "shell/adminShellModel.ts",
]
  .map((file) =>
    readFileSync(
      new URL(`../src/components/admin/${file}`, import.meta.url),
      "utf8",
    ),
  )
  .join("\n");
const routesSource = readFileSync(new URL("../src/routes.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const adminLayoutSource = readFileSync(new URL("../src/pages/admin/_layout.tsx", import.meta.url), "utf8");
const settingsAPISource = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const pingTaskContextSource = readFileSync(new URL("../src/contexts/PingTaskContext.tsx", import.meta.url), "utf8");
const pingTaskPageSource = readFileSync(new URL("../src/pages/admin/pingTask.tsx", import.meta.url), "utf8");
const returnRoutePageSource = readFileSync(new URL("../src/pages/admin/returnRoute.tsx", import.meta.url), "utf8");
const globalCssSource = readFileSync(new URL("../src/global.css", import.meta.url), "utf8");
const serverPageSource = readFileSync(new URL("../src/pages/admin/index.tsx", import.meta.url), "utf8");
const dashboardPanelsSource = readFileSync(new URL("../src/components/admin/DashboardPanels.tsx", import.meta.url), "utf8");
const selectorSource = readFileSync(new URL("../src/components/Selector.tsx", import.meta.url), "utf8");
const nodeSelectorSource = readFileSync(new URL("../src/components/NodeSelector.tsx", import.meta.url), "utf8");
const checkboxSource = readFileSync(new URL("../src/components/ui/checkbox.tsx", import.meta.url), "utf8");
const appThemeSource = readFileSync(new URL("../src/theme/createAppTheme.ts", import.meta.url), "utf8");
const selectOrInputSource = readFileSync(new URL("../src/components/ui/select-or-input.tsx", import.meta.url), "utf8");
const zhCN = JSON.parse(
  readFileSync(new URL("../src/i18n/locales/zh_CN.json", import.meta.url), "utf8"),
);

function allPaths(items: MenuItem[]): string[] {
  return items.flatMap((item) => [item.path, ...allPaths(item.children ?? [])]);
}

test("keeps the admin navigation in the intended groups", () => {
  assert.deepEqual(
    menuConfig.menu.map((item) => item.path),
    [
      "/admin",
      "/admin/servers",
      "/admin/billing",
      "/admin/notification/center",
      "/admin/monitoring",
      "/admin/nodemgt",
      "/admin/remote-management",
      "/admin/notifications",
      "/admin/appearance",
      "/admin/settings",
    ],
  );

  const systemSettings = menuConfig.menu.find(
    (item) => item.path === "/admin/settings",
  );
  assert.deepEqual(
    systemSettings?.children?.map((item) => item.path),
    [
      "/admin/settings/site",
      "/admin/settings/dashboard",
      "/admin/settings/reverse-proxy",
      "/admin/settings/metrics",
      "/admin/settings/account-security",
      "/admin/settings/general",
    ],
  );

  const paths = allPaths(menuConfig.menu);
  assert.equal(paths.includes("/"), false);
  assert.equal(
    paths.filter((path) => path === "/admin/settings/metrics").length,
    1,
  );
  assert.equal(paths.includes("/admin/account-security"), false);

  const notifications = menuConfig.menu.find(
    (item) => item.path === "/admin/notifications",
  );
  assert.ok(
    notifications?.children?.some(
      (item) => item.path === "/admin/settings/notification",
    ),
  );
  assert.equal(
    notifications?.children?.some(
      (item) => item.path === "/admin/notification/center",
    ),
    false,
  );

  const nodemgt = menuConfig.menu.find((item) => item.path === "/admin/nodemgt");
  assert.deepEqual(
    nodemgt?.children?.map((item) => item.path),
    [
      "/admin/nodemgt/overview",
      "/admin/nodemgt/inbounds",
      "/admin/nodemgt/outbounds",
      "/admin/nodemgt/routes",
      "/admin/nodemgt/users",
      "/admin/nodemgt/plans",
      "/admin/nodemgt/subscriptions",
      "/admin/nodemgt/certificates",
      "/admin/nodemgt/audit",
    ],
  );

  const remoteManagement = menuConfig.menu.find(
    (item) => item.path === "/admin/remote-management",
  );
  assert.deepEqual(
    remoteManagement?.children?.map((item) => item.path),
    [
      "/admin/exec",
      "/admin/remote-management/schedules",
      "/admin/remote-management/firewall",
      "/admin/remote-management/mcp",
      "/admin/settings/xtermjs",
    ],
  );
  assert.equal(
    remoteManagement?.children?.some((item) => item.path === "/admin/terminal"),
    false,
  );
  assert.equal(
    remoteManagement?.children?.find((item) => item.path === "/admin/remote-management/firewall")?.icon,
    "Firewall",
  );

  assert.deepEqual(
    menuConfig.footer.map((item) => item.path),
    [
      "/admin/logs",
      "https://nuomiiiii.github.io/Lite-document/",
    ],
  );
  assert.equal(allPaths(menuConfig.footer).includes("/admin/about"), false);
});

test("places dynamic theme configuration inside the appearance group", () => {
  const dynamicTheme: MenuItem = {
    labelKey: "Current theme settings",
    rawLabel: "Current theme settings",
    path: "/admin/theme-settings",
    icon: "Palette",
  };
  const result = buildAdminMenuItems(menuConfig.menu, [dynamicTheme]);
  const appearance = result.find((item) => item.path === APPEARANCE_MENU_PATH);

  assert.equal(result.some((item) => item.path === dynamicTheme.path), false);
  assert.equal(
    appearance?.children?.at(-1)?.path,
    dynamicTheme.path,
  );
});

test("loads the active theme configuration into the sidebar", () => {
  assert.match(adminPanelSource, /buildAdminMenuItems\(baseMenuItems, extraMenuItems\)/);
  assert.match(adminPanelSource, /fetchThemeManifest\(currentTheme/);
  assert.match(adminPanelSource, /itemPath = "\/admin\/theme_managed"/);
  assert.match(adminPanelSource, /itemPath = "\/admin\/theme_raw"/);
  assert.match(adminPanelSource, /normalizeThemeRedirectTarget\(configuration\.data\)/);
  assert.match(adminPanelSource, /theme\.configure/);
  assert.doesNotMatch(adminPanelSource, /theme\.manage_with_name/);
  assert.equal(zhCN.theme.configure, "主题设置");
});

test("keeps only one sidebar group expanded", () => {
  assert.deepEqual(
    toggleSingleSubMenu({ "/admin/monitoring": true }, "/admin/settings"),
    { "/admin/settings": true },
  );
  assert.deepEqual(
    toggleSingleSubMenu({ "/admin/settings": true }, "/admin/settings"),
    {},
  );
});

test("keeps the monitoring group open across nested monitoring routes", () => {
  let openSubMenus = { "/admin/monitoring": true };

  for (const pathname of ["/admin/ping", "/admin/return-route"]) {
    const next = syncSubMenuForLocation(
      openSubMenus,
      menuConfig.menu,
      pathname,
    );
    assert.deepEqual(next, { "/admin/monitoring": true });
    openSubMenus = next;
  }
});

test("keeps the nodemgt group open across nested nodemgt routes", () => {
  let openSubMenus = { "/admin/nodemgt": true };

  for (const pathname of [
    "/admin/nodemgt/overview",
    "/admin/nodemgt/inbounds",
    "/admin/nodemgt/outbounds",
    "/admin/nodemgt/routes",
    "/admin/nodemgt/users",
    "/admin/nodemgt/plans",
    "/admin/nodemgt/subscriptions",
    "/admin/nodemgt/certificates",
    "/admin/nodemgt/audit",
  ]) {
    const next = syncSubMenuForLocation(openSubMenus, menuConfig.menu, pathname);
    assert.deepEqual(next, { "/admin/nodemgt": true });
    openSubMenus = next;
  }
});

test("collapses groups on top-level pages and unmatched sibling prefixes", () => {
  const monitoringOpen = { "/admin/monitoring": true };

  assert.deepEqual(
    syncSubMenuForLocation(monitoringOpen, menuConfig.menu, "/admin"),
    {},
  );
  assert.deepEqual(
    syncSubMenuForLocation(monitoringOpen, menuConfig.menu, "/admin/servers"),
    {},
  );
  assert.deepEqual(
    syncSubMenuForLocation(
      monitoringOpen,
      menuConfig.menu,
      "/admin/ping-history",
    ),
    {},
  );
});

test("sidebar groups stay collapsed until opened", () => {
  assert.match(adminPanelSource, /Boolean\(openGroups\[item\.path\]\)/);
  assert.doesNotMatch(adminPanelSource, /openGroups\[item\.path\] \?\? true/);
});

test("desktop navigation expands by default and can collapse to a mini rail", () => {
  assert.match(adminPanelSource, /DESKTOP_SIDEBAR_WIDTH = 256/);
  assert.match(adminPanelSource, /lite-admin-nav-rail/);
  assert.match(adminPanelSource, /=== "mini"/);
  assert.match(adminPanelSource, /data-testid="admin-nav-toggle"/);
  assert.match(adminPanelSource, /data-admin-nav-mini/);
  assert.match(adminPanelSource, /readDesktopNavMini\(\)/);
  assert.match(adminPanelSource, /<MiniGroup/);
  assert.match(adminPanelSource, /function MiniFlyoutMenu/);
  assert.match(adminPanelSource, /admin-mini-nav-slide/);
  assert.match(adminPanelSource, /const MiniGroupButton = memo/);
  assert.doesNotMatch(
    adminPanelSource,
    /function MiniGroup\([\s\S]*?<Tooltip[\s\S]*?function MiniFlyoutMenu/,
  );
  assert.doesNotMatch(adminPanelSource, /lite-admin-nav-collapsed/);
  assert.match(adminPanelSource, /const navRowSx = \{/);
  assert.match(adminPanelSource, /sx=\{navRowSx\}/);
  assert.match(adminPanelSource, /nestedNavRowSx/);
  assert.match(adminPanelSource, /const navLabelSx = \{/);
  assert.match(adminPanelSource, /whiteSpace: "normal"/);
  assert.match(adminPanelSource, /px: 1\.25/);
  assert.match(
    adminPanelSource,
    /title=\{versionLabel\}[\s\S]*<ListItemIcon[\s\S]*<Github size=\{18\} strokeWidth=\{1\.5\} \/>[\s\S]*<ListItemText/,
  );
  assert.match(routesSource, /path: "servers\/:uuid"/);
});

test("switches to the submenu containing the current nested route", () => {
  assert.deepEqual(
    syncSubMenuForLocation(
      { "/admin/monitoring": true },
      menuConfig.menu,
      "/admin/settings/site",
    ),
    { "/admin/settings": true },
  );
});

test("uses a flex shell with a grouped MUI drawer instead of a second grid column", () => {
  assert.match(adminPanelSource, /display: "flex"/);
  assert.match(
    adminPanelSource,
    /variant=\{isMobile \? "temporary" : "permanent"\}/,
  );
  assert.doesNotMatch(adminPanelSource, /className="md:col-span-2"/);
  assert.doesNotMatch(adminPanelSource, /className="col-span-2"/);
});

test("mobile and desktop submenus share the collapse animation", () => {
  assert.doesNotMatch(adminPanelSource, /km-admin-mobile-submenu/);
  assert.doesNotMatch(globalCssSource, /\.km-admin-mobile-submenu/);
  assert.match(adminPanelSource, /<Collapse in=\{open\} timeout=\{140\}/);
});

test("system UI routes do not embed the legacy public dashboard", () => {
  assert.doesNotMatch(routesSource, /pages\/Index|pages\/_layout|pages\/instance/);
  assert.doesNotMatch(routesSource, /path:\s*["']\/["']/);
  assert.match(routesSource, /path:\s*["']\/admin["']/);
  assert.match(routesSource, /path:\s*["']\/install["']/);
  assert.match(routesSource, /path:\s*["']\/terminal["']/);
  assert.doesNotMatch(routesSource, /pages\/admin\/terminal/);
  assert.match(routesSource, /path:\s*["']\/manage\/\*["']/);
});

test("admin route changes keep the main content out of a composited animation layer", () => {
  assert.doesNotMatch(adminPanelSource, /<AnimatePresence mode="wait"/);
  assert.match(adminPanelSource, /data-admin-page-content/);
  assert.doesNotMatch(adminPanelSource, /<motion\.div[^>]*data-admin-page-content/);
  assert.doesNotMatch(adminPanelSource, /ADMIN_PAGE_TRANSITION/);
  assert.doesNotMatch(adminPanelSource, /key=\{location\.pathname\}/);
  assert.doesNotMatch(adminPanelSource, /willChange:[^\n]*"opacity, transform"/);
  assert.doesNotMatch(adminPanelSource, /useReducedMotion/);
  assert.match(adminPanelSource, /useReduceMotionPreference\(\)/);
  assert.match(adminPanelSource, /preloadAdminRoute\(item\.path\)/);
  assert.match(
    adminPanelSource,
    /onPointerOverCapture=\{\(event\) => shell.preloadAdminLink/,
  );
  assert.doesNotMatch(adminPanelSource, /onClickCapture=/);
  assert.match(adminPanelSource, /url\.pathname !== "\/admin"/);
  assert.match(adminPanelSource, /anchor\.dataset\.adminReloadDocument/);
});

test("EULA acceptance closes only after settings persist successfully", () => {
  assert.match(settingsAPISource, /return React\.useMemo\(\(\) => \(\{[\s\S]*setSettings,[\s\S]*updateSetting/);
  assert.match(
    adminLayoutSource,
    /loading \|\| error \|\| settings\.eula_accepted !== false/,
  );
  assert.match(
    adminLayoutSource,
    /await updateSettingsWithToast\([\s\S]*setSettings\([\s\S]*setOpen\(false\)/,
  );
  assert.match(adminLayoutSource, /catch \{\s*setOpen\(true\)/);
  assert.match(adminLayoutSource, /disabled=\{accepting\}/);
});

test("admin tabs and dialogs share the saved motion preference", () => {
  assert.match(adminPanelSource, /dataset\.adminShellActive = "true"/);
  assert.match(adminPanelSource, /data-admin-tab-motion-ready/);
  assert.match(adminPanelSource, /data-admin-tab-indicator-instant/);
  assert.doesNotMatch(adminPanelSource, /setTimeout\(\(\) => registerTabListsWithin\(root\), 400\)/);
  assert.doesNotMatch(globalCssSource, /admin-tab-content-enter/);
  assert.match(
    globalCssSource,
    /\[data-admin-tab-motion-ready="true"\]::after[\s\S]*width 220ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
  );
  assert.match(
    globalCssSource,
    /\.km-admin-sheet-tabs \[role="tab"\]\[aria-selected="true"\]::after/,
  );
  assert.match(globalCssSource, /\.km-admin-sheet-tabs \.MuiTabs-indicator[\s\S]*display: none/);
  assert.match(globalCssSource, /data-reduce-motion="true"[\s\S]*\.admin-tab-panel/);
  assert.match(globalCssSource, /data-reduce-motion="true"[\s\S]*\.km-admin-sheet-panel/);
});

test("admin multi-sheet pages share the node-detail tab bar", () => {
  const sheetPages = [
    pingTaskPageSource,
    returnRoutePageSource,
    readFileSync(new URL("../src/pages/admin/settings/metrics.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../src/pages/admin/settings/reverse-proxy.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../src/pages/admin/notification/ping_loss.tsx", import.meta.url), "utf8"),
  ];
  for (const source of sheetPages) {
    assert.match(source, /<AdminSheetTabs/);
    assert.match(source, /<AdminTabLabel icon=/);
    assert.doesNotMatch(source, /w-max min-w-full/);
    assert.doesNotMatch(source, /Tabs\.Trigger[^>]*flex-1/);
    assert.doesNotMatch(source, /<Tabs\.Trigger[^>]*>\s*<\/Tabs\.Trigger>/);
  }
  const themeTabsSource = readFileSync(
    new URL("../src/components/admin/ThemeConfigTabs.tsx", import.meta.url),
    "utf8",
  );
  assert.match(themeTabsSource, /km-theme-config-tabs km-admin-sheet-tabs/);
  assert.match(themeTabsSource, /<AdminTabLabel icon=/);
  const nodeDetailSource = readFileSync(
    new URL("../src/pages/admin/NodeDetailPage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(nodeDetailSource, /<AdminSheetTabs(?:\s|>)/);
  assert.match(nodeDetailSource, /<AdminTabLabel icon=/);
  assert.match(
    nodeDetailSource,
    /km-admin-sheet-panel/,
  );
  assert.doesNotMatch(
    nodeDetailSource,
    /iconPosition="start"/,
  );
  assert.match(globalCssSource, /\.km-admin-sheet-tabs \.MuiTabs-indicator[\s\S]*display: none/);
  assert.match(
    globalCssSource,
    /\[data-admin-tab-motion-ready="true"\]::after[\s\S]*width 220ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
  );
  for (const source of sheetPages) {
    assert.match(source, /admin-tab-panel/);
  }
});

test("account security uses the homepage cards instead of sheet tabs", () => {
  const source = readFileSync(
    new URL("../src/pages/admin/settings/account-security.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /<AdminSheetTabs/);
  assert.match(source, /SettingsFeatureCard/);
  assert.match(source, /SettingsSheetDialog/);
  assert.match(source, /\/api\/admin\/account\/avatar/);
  assert.match(source, /\/api\/admin\/account\/passkeys/);
  assert.match(source, /openPanel\("avatar"\)[\s\S]{0,120}spacing=\{2\}/);
});

test("admin checkboxes share the active accent palette", () => {
  assert.match(checkboxSource, /import MuiCheckbox from "@mui\/material\/Checkbox"/);
  assert.match(checkboxSource, /data-slot="checkbox"/);
  assert.match(checkboxSource, /indeterminate=\{indeterminate\}/);
  assert.match(checkboxSource, /onChange=\{\(_, next\) => onCheckedChange\?\.\(next\)\}/);
  assert.match(appThemeSource, /MuiCheckbox:[\s\S]*&\.Mui-checked, &\.MuiCheckbox-indeterminate[\s\S]*color: ACCENT/);
  assert.match(globalCssSource, /data-reduce-motion="true"[\s\S]*\[data-slot="checkbox"\]/);
  assert.match(selectorSource, /import \{ Checkbox \} from "\.\/ui\/checkbox"/);
  assert.doesNotMatch(selectorSource, /import \{ Checkbox, TextField \} from "@radix-ui\/themes"/);
  assert.match(selectorSource, /checked=\{checkAllState\}/);
  assert.doesNotMatch(checkboxSource, /@radix-ui\/react-checkbox/);
});

test("node selector dialogs keep a single select-all control", () => {
  assert.match(selectorSource, /km-search-before-content/);
  assert.match(selectorSource, /showHeaderSelectAll = true/);
  assert.match(selectorSource, /showHeaderSelectAll && !maxCount \? \([\s\S]*aria-label=\{t\("common\.select_all"\)\}/);
  assert.match(nodeSelectorSource, /showHeaderSelectAll=\{false\}/);
});

test("admin floating controls and switches animate consistently", () => {
  assert.match(globalCssSource, /@keyframes admin-floating-content-enter/);
  assert.match(globalCssSource, /admin-floating-content-enter 180ms[^;]*backwards/);
  assert.match(selectOrInputSource, /admin-select-or-input-content/);
  assert.match(globalCssSource, /data-reduce-motion="true"[\s\S]*\.admin-select-or-input-content/);
});

test("admin command buttons use motion instead of abrupt active flashes", () => {
  assert.match(
    globalCssSource,
    /\[data-admin-shell\] button\[aria-pressed\],[\s\S]*\[data-admin-mini-group\] \.MuiListItemButton-root[\s\S]*background-color 160ms/,
  );
  assert.match(
    globalCssSource,
    /\[data-admin-shell\] button\[aria-pressed\]:active[\s\S]*\[data-admin-mini-group\] \.MuiListItemButton-root:active[\s\S]*scale\(0\.99\)/,
  );
  assert.match(globalCssSource, /data-reduce-motion="true"[\s\S]*button\[aria-pressed\]/);
});

test("prewarms admin routes and reuses shared monitoring data", () => {
  assert.match(routesSource, /export const preloadAdminRoutes/);
  assert.match(mainSource, /scheduleIdleAdminWarmup/);
  assert.match(mainSource, /getIdleAdminWarmupTargets/);
  assert.doesNotMatch(mainSource, /NodeListProvider/);
  assert.doesNotMatch(mainSource, /common:getNodes/);
  assert.match(mainSource, /<RPC2Provider>/);
  assert.match(adminLayoutSource, /<SettingsProvider>\s*<NodeDetailsProvider>/);
  assert.match(
    adminLayoutSource,
    /view === "loading" \? \(\s*<FullPageLoading \/>/,
  );
  assert.match(
    adminLayoutSource,
    /view === "login" \? \(\s*<AdminLoginPage \/>/,
  );
  assert.match(
    adminLayoutSource,
    /<PingTaskProvider>\s*<AdminNodeLiveDataProvider>\s*<AdminAuthenticatedContent \/>/,
  );
  assert.doesNotMatch(
    adminLayoutSource,
    /<SettingsProvider>\s*<NodeDetailsProvider>\s*<PingTaskProvider>/,
  );
  assert.match(settingsAPISource, /planAdminSettingsFetch/);
  assert.match(settingsAPISource, /plan === "reset"/);
  assert.match(settingsAPISource, /setSettings\(createDefaultSettings\(\)\)/);
  const nodeDetailsSource = readFileSync(
    new URL("../src/contexts/NodeDetailsContext.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(nodeDetailsSource, /load\(PREAUTHENTICATED_NODE_DATA\)/);
  assert.match(
    nodeDetailsSource,
    /if \(accountLoading \|\| !account\?\.logged_in \|\| !accountKey\)/,
  );
  assert.match(mainSource, /preloadAdminRoute\("\/admin\/settings\/dashboard"\)/);
  assert.match(pingTaskContextSource, /ensureLoaded/);
  assert.match(pingTaskContextSource, /if \(!requested\) return;/);
  assert.match(pingTaskContextSource, /const inherited = React\.useContext\(PingTaskContext\)/);
  assert.doesNotMatch(pingTaskContextSource, /refresh\(\);\s*setIsLoading\(false\)/);
  assert.doesNotMatch(pingTaskPageSource, /<PingTaskProvider>/);
  assert.doesNotMatch(pingTaskPageSource, /<NodeDetailsProvider>/);
  assert.doesNotMatch(returnRoutePageSource, /<NodeDetailsProvider>/);
});

test("dashboard alert navigation reuses destination pages without extra banners", () => {
  assert.doesNotMatch(dashboardPanelsSource, /prefetchDashboardAlertItems\(kind, accountKey\)/);
  assert.doesNotMatch(dashboardPanelsSource, /event\.preventDefault\(\)/);
  assert.doesNotMatch(serverPageSource, /routeAlert/);
  assert.match(serverPageSource, /routeStatus === "offline"/);
  assert.match(serverPageSource, /if \(isLoading\) return <Loading text="" \/>/);
});

test("registers the dashboard settings route", () => {
  assert.match(routesSource, /path:\s*["']dashboard["']/);
  assert.match(routesSource, /pages\/admin\/settings\/dashboard/);
});
