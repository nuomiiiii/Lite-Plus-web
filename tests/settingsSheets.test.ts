import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const sheet = readFileSync("src/components/admin/SettingsSheetDialog.tsx", "utf8");
const chrome = readFileSync("src/components/admin/SettingsChrome.tsx", "utf8");
const css = readFileSync("src/global.css", "utf8");
const site = readFileSync("src/pages/admin/settings/site.tsx", "utf8");
const account = readFileSync("src/pages/admin/settings/account-security.tsx", "utf8");
const dialog = readFileSync("src/components/admin/ui/dialog.tsx", "utf8");
const api = readFileSync("src/lib/api.ts", "utf8");
const accountContext = readFileSync("src/contexts/AccountContext.tsx", "utf8");
const signOn = readFileSync("src/pages/admin/settings/sign-on.tsx", "utf8");

test("settings sheets keep overlay motion and do not lock page scroll", () => {
  assert.match(sheet, /disableScrollLock/);
  assert.match(sheet, /keepMounted/);
  assert.match(sheet, /transitionDuration=\{reduceMotion \? 0 : \{ enter: 220, exit: 160 \}\}/);
  assert.match(sheet, /km-admin-sheet-panel/);
  assert.match(sheet, /useReduceMotionPreference/);
  assert.match(sheet, /"&:first-of-type": \{ paddingTop: "0 !important" \}/);
  assert.match(sheet, /"& > :not\(style\) ~ :not\(style\)": \{ ml: 0 \}/);
  assert.match(dialog, /disableScrollLock/);
  assert.doesNotMatch(dialog, /transitionDuration:\s*0/);
});

test("settings alerts keep icon and text on one row", () => {
  assert.match(chrome, /className="km-settings-alert"/);
  assert.match(chrome, /alignItems: "center"/);
  assert.doesNotMatch(chrome, /pt: 0\.6/);
  assert.match(css, /html\[data-admin-shell-active="true"\] \.km-settings-alert\.MuiAlert-root/);
  assert.match(css, /\.km-settings-alert \.MuiAlert-icon[\s\S]*padding-block: 0/);
});

test("dashed drop zones sit the icon and copy above the visual midline", () => {
  const zone = chrome.slice(chrome.indexOf("export function SettingsDashedZone"));
  assert.match(zone, /pt: \{ xs: 2\.25, md: 2\.5 \}/);
  assert.match(zone, /pb: \{ xs: 3\.25, md: 3\.75 \}/);
  assert.match(zone, /lineHeight: 0/);
});

test("nested site and account sheets stay stacked instead of swapping", () => {
  assert.match(site, /open=\{panel === "access" \|\| panel === "cors" \|\| panel === "ws"\}/);
  assert.match(site, /conceal=\{panel === "cors" \|\| panel === "ws"\}/);
  assert.match(account, /stackedOnSignin = nestFrom === "signin" \|\| panel === "signin"/);
  assert.match(account, /setNestFrom\(panel\)/);
  assert.match(account, /conceal=\{nestFrom === "signin" && panel !== "signin"\}/);
  assert.match(account, /hideBackdrop=\{stackedOnSignin\}/);
  assert.match(
    account,
    /<SignInMethodsPanel[\s\S]*<PasswordPanel[\s\S]*<GithubPanel[\s\S]*<PasskeysPanel/,
  );
});

test("settings sheet paper stays opaque so the page does not flash through", () => {
  const motion = readFileSync("src/theme/dialogCloseMotion.ts", "utf8");
  const theme = readFileSync("src/theme/createAppTheme.ts", "utf8");
  assert.match(motion, /opacity: "1 !important"/);
  assert.match(motion, /conceal \|\| !open \? "hidden" : "visible"/);
  assert.match(sheet, /dialogContainerNoFadeSx/);
  assert.match(sheet, /dialogPaperVisibility\(open, conceal\)/);
  assert.match(sheet, /pointerEvents: conceal \? "none"/);
  assert.match(dialog, /dialogContainerNoFadeSx/);
  assert.match(dialog, /dialogPaperVisibility\(isOpen\)/);
  assert.match(theme, /dialogContainerNoFadeSx/);
  assert.match(theme, /dialogPaperVisibility\(Boolean\(ownerState\?\.open\)\)/);
});

test("sessions sheet puts delete-all in the header and hides the pagination divider", () => {
  const sessions = readFileSync("src/pages/admin/sessions.tsx", "utf8");
  const sessionsSheet = account.slice(
    account.indexOf('open={panel === "sessions"}'),
    account.indexOf("<GithubPanel"),
  );
  assert.match(sheet, /headerAction\?: ReactNode/);
  assert.match(account, /headerAction=\{<SessionsDeleteAllButton \/>\}/);
  assert.match(sessions, /export function SessionsDeleteAllButton/);
  assert.match(sessions, /hideDivider/);
  assert.doesNotMatch(sessions, /SettingsTextButton danger/);
  assert.doesNotMatch(sessionsSheet, /SettingsSheetActions/);
});

test("account and sign-on loading do not tear down an already painted page", () => {
  assert.match(account, /loading && !account/);
  assert.match(account, /function AccountHomeSkeleton/);
  assert.match(accountContext, /accountRef\.current === null/);
  assert.match(signOn, /hydrated \|\| embedded/);
  assert.match(api, /prefers-reduced-motion: reduce/);
});

test("unsaved custom head and body drafts are discarded when the sheet closes", () => {
  const custom = site.slice(site.indexOf("function CustomPanel"), site.indexOf("function FaviconPanel"));
  assert.match(custom, /const discardDraft = \(\) => \{/);
  assert.match(custom, /setHead\(savedHead\)/);
  assert.match(custom, /setBody\(savedBody\)/);
  assert.match(custom, /if \(open\) return;/);
  assert.match(custom, /onClose=\{close\}/);
  assert.match(custom, /onCancel=\{cancelEdit\}/);
  assert.doesNotMatch(custom, /onCancel=\{\(\) => setKind\("list"\)\}/);
});

test("unsaved share hours and origin-list drafts are discarded when the sheet closes", () => {
  const share = site.slice(site.indexOf("function SharePanel"), site.indexOf("function CustomPanel"));
  assert.match(share, /const discardDraft = \(\) => \{/);
  assert.match(share, /setHours\(1\)/);
  assert.match(share, /onClose=\{close\}/);
  assert.match(share, /onCancel=\{close\}/);
  assert.doesNotMatch(share, /onCancel=\{onClose\}/);
  const origins = site.slice(site.indexOf("function OriginListPanel"), site.indexOf("function SharePanel"));
  assert.match(origins, /const discardDraft = \(\) => \{/);
  assert.match(origins, /setList\(savedList\)/);
  assert.match(origins, /onClose=\{close\}/);
  assert.match(origins, /onCancel=\{close\}/);
});

test("old site custom page and old account page are gone", () => {
  const routes = readFileSync("src/routes.ts", "utf8");
  assert.equal(existsSync("src/pages/admin/settings/custom.tsx"), false);
  assert.equal(existsSync("src/pages/admin/account.tsx"), false);
  assert.doesNotMatch(site, /from "@\/components\/admin\/SettingCard"/);
  assert.doesNotMatch(account, /from "@\/components\/admin\/SettingCard"/);
  assert.doesNotMatch(site, /from "@\/components\/admin\/ui"/);
  assert.doesNotMatch(account, /from "@\/components\/admin\/ui"/);
  assert.match(routes, /path: "custom"[\s\S]*to: "\/admin\/settings\/site"/);
  assert.match(routes, /path: "account"[\s\S]*to: "\/admin\/settings\/account-security\?tab=account"/);
});
