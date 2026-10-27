import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const visit = (directory: string, files: string[] = []) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(fullPath, files);
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      files.push(fullPath.replaceAll("\\", "/"));
    }
  }
  return files;
};

test("admin pages no longer import Radix Themes", () => {
  const files = [
    ...visit("src/pages/admin"),
    ...visit("src/components/admin"),
  ].filter((file) => !file.includes("/admin/ui/"));
  const offenders = files.filter((file) =>
    readFileSync(file, "utf8").includes('from "@radix-ui/themes"'),
  );
  assert.deepEqual(offenders, []);
});

test("public theme cache helpers stay on document URLs only", () => {
  const source = readFileSync("src/utils/themeCache.ts", "utf8");
  assert.match(source, /url\.pathname\.startsWith\("\/themes\/"\)/);
  assert.match(source, /url\.pathname === "\/"/);
  assert.doesNotMatch(source, /\/admin/);
});

test("radix space tokens stay in CSS pixels for MUI sx", () => {
  const source = readFileSync("src/components/admin/ui/shared.ts", "utf8");
  assert.match(source, /return `\$\{value \* 4\}px`/);
  assert.match(source, /return `\$\{Number\(value\) \* 4\}px`/);
});

test("node list filters use a gray toolbar and white search field", () => {
  const css = readFileSync("src/global.css", "utf8");
  const layout = readFileSync("src/components/admin/adminListLayout.ts", "utf8");
  assert.match(css, /\.km-admin-node-list-filters[\s\S]*?padding: 16px 16px 20px;\s*background: #f4f6f8;/);
  assert.match(css, /\.km-admin-node-list-filters \.MuiOutlinedInput-root[\s\S]*?background-color: #fff;/);
  assert.match(layout, /const FILTER_BAR = NEBURST_NEUTRAL/);
  assert.match(layout, /const FILTER_FIELD = "#FFFFFF"/);
  assert.match(layout, /palette\.mode === "dark" \? INPUT_FILL_DARK : FILTER_FIELD/);
  assert.match(css, /html\.dark \[data-admin-shell\] \.km-admin-node-list-filters \.MuiOutlinedInput-root[\s\S]*?background-color: #212b36;/);
  const theme = readFileSync("src/theme/createAppTheme.ts", "utf8");
  assert.match(theme, /primary: \{\s*main: ACCENT/);
  assert.match(theme, /MuiAppBar:[\s\S]*color: "inherit"/);
  assert.match(theme, /MuiAppBar:[\s\S]*transition: "none"/);
});

test("error screens use MUI Alert and keep icon text aligned", () => {
  const errorBoundary = readFileSync("src/components/ErrorBoundary.tsx", "utf8");
  const layout = readFileSync("src/pages/admin/_layout.tsx", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const theme = readFileSync("src/theme/createAppTheme.ts", "utf8");
  assert.match(errorBoundary, /from "@mui\/material\/Alert"/);
  assert.match(errorBoundary, /from "@mui\/material\/Button"/);
  assert.doesNotMatch(errorBoundary, /from-rose-50/);
  assert.doesNotMatch(layout, /icon=\{<CircleAlert/);
  assert.match(main, /MuiAppProvider[\s\S]*<ErrorBoundary>/);
  assert.doesNotMatch(main, /from "@radix-ui\/themes"/);
  assert.match(main, /lazy\(\(\) => import\("\.\/theme\/RadixThemeRoot"\)\)/);
  assert.match(main, /isRemoteRoute/);
  assert.match(main, /usePlainThemeRoot \? \(/);
  assert.match(main, /isAdminRoute \|\| isRemoteRoute/);
  assert.match(theme, /MuiAlert:[\s\S]*alignItems: "flex-start"/);
  assert.match(theme, /MuiAlertTitle:[\s\S]*marginTop: 0/);
});

test("admin overlays share one enter and exit duration", () => {
  const theme = readFileSync("src/theme/createAppTheme.ts", "utf8");
  const dialog = readFileSync("src/components/admin/ui/dialog.tsx", "utf8");
  const menu = readFileSync("src/components/admin/adminMenu.ts", "utf8");
  const layout = readFileSync("src/pages/admin/_layout.tsx", "utf8");
  assert.match(theme, /MuiMenu:[\s\S]*transitionDuration: \{ enter: 220, exit: 150 \}/);
  assert.match(theme, /MuiPopover:[\s\S]*transitionDuration: \{ enter: 220, exit: 150 \}/);
  assert.match(theme, /MuiDialog:[\s\S]*disableScrollLock: true/);
  assert.match(theme, /MuiDialog:[\s\S]*transitionDuration: \{ enter: 220, exit: 160 \}/);
  assert.match(theme, /dialogContainerNoFadeSx/);
  assert.match(theme, /dialogPaperVisibility\(Boolean\(ownerState\?\.open\)\)/);
  assert.match(dialog, /dialogContainerNoFadeSx/);
  assert.match(dialog, /dialogPaperVisibility\(isOpen\)/);
  assert.match(menu, /transitionDuration: \{ enter: 220, exit: 150 \}/);
  assert.doesNotMatch(dialog, /transitionDuration:\s*0/);
  assert.match(layout, /AdminRouteViewport/);
});

test("vite keeps system flags and logos on the admin origin", () => {
  const source = readFileSync("vite.config.ts", "utf8");
  assert.match(source, /pathname\.startsWith\("\/assets\/flags"\)/);
  assert.match(source, /pathname\.startsWith\("\/assets\/logo"\)/);
  assert.match(source, /pathname\.startsWith\("\/favicon\.png"\)/);
  assert.doesNotMatch(source, /pathname\.startsWith\("\/favicon"\) \|\|/);
});

test("node detail overview keeps flag assets, spec icons, and HK preview values", () => {
  const flagSource = readFileSync("src/components/Flag.tsx", "utf8");
  const detailSource = readFileSync("src/pages/admin/NodeDetailPage.tsx", "utf8");
  const sidebarSource = readFileSync(
    "src/components/admin/shell/AdminSidebar.tsx",
    "utf8",
  );
  const sidebarBrandSource = readFileSync(
    "src/components/admin/shell/SidebarBrand.tsx",
    "utf8",
  );
  assert.match(flagSource, /getAppAssetUrl\(`assets\/flags\/\$\{resolvedFlagFileName\}\.svg`\)/);
  assert.match(flagSource, /export function prefetchNodeFlags/);
  assert.match(flagSource, /prefetchedFlagSrc/);
  assert.doesNotMatch(flagSource, /@\/components\/admin\/ui/);
  assert.match(detailSource, /const iconWellSx = \{[\s\S]*width: 48,[\s\S]*height: 48/);
  assert.match(detailSource, /function SpecTile/);
  assert.match(detailSource, /function TrafficStat/);
  assert.doesNotMatch(
    detailSource,
    /borderRadius: "8px",\s*bgcolor: LITE_BLUE_SOFT/,
  );
  assert.match(detailSource, /LITE_BLUE_SOFT_STRONG/);
  assert.match(detailSource, /km-admin-terminal-button/);
  assert.doesNotMatch(detailSource, /bgcolor: "text\.primary"/);
  assert.match(detailSource, /html\.dark &": \{\s*bgcolor: "rgba\(7, 141, 238, 0\.22\)"/);
  assert.match(detailSource, /displayOrEmpty\(node\.cpu_cores/);
  assert.match(detailSource, /displayOrEmpty\(node\.ipv4\)/);
  assert.doesNotMatch(detailSource, /PREVIEW\.cores/);
  assert.doesNotMatch(detailSource, /PREVIEW\.ipv4/);
  assert.match(sidebarBrandSource, /data-testid="sidebar-brand"/);
  assert.match(sidebarBrandSource, /data-testid="sidebar-brand-plus"/);
  assert.match(sidebarBrandSource, /viewBox="0 0 32 32"/);
  assert.doesNotMatch(sidebarBrandSource, /LITE_NAME\.split/);
  assert.match(sidebarSource, /fontSize: 16/);
  assert.match(sidebarSource, /fontWeight: active \? 600 : 400/);
});
