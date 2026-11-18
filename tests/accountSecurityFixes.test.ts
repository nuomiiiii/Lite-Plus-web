import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { avatarCropSourceRect, avatarPreviewTransform, clampAvatarPreviewOffset } from "../src/utils/avatarCrop.ts";
import { formatSessionAge, remainingSessionLabel, sessionLastActivityMs, sessionLogoutAtMs } from "../src/utils/sessionTtl.ts";
import { ssoExternalId, ssoProviderKey, ssoProviderLabel } from "../src/utils/ssoIdentity.ts";
import { isWindowsHelloPasskey } from "../src/lib/accountPasskeys.ts";
import { withPasskeyCreatePreference } from "../src/utils/webauthn.ts";

test("dragging the avatar preview right samples more of the left side of the source", () => {
  const centered = avatarCropSourceRect(1000, 500, 2, 0, 0);
  const draggedRight = avatarCropSourceRect(1000, 500, 2, 48, 0);
  assert.equal(centered.size, 250);
  assert.ok(draggedRight.sx < centered.sx);
  const unclamped = clampAvatarPreviewOffset(1, 80, 40);
  assert.equal(unclamped.x, 0);
  assert.equal(unclamped.y, 0);
  assert.equal(
    avatarPreviewTransform(2, 40, 0, 48),
    "scale(2) translate(4px, 0px)",
  );
  assert.equal(
    avatarPreviewTransform(2, 40, 0),
    "scale(2) translate(20px, 0px)",
  );
});

test("session age uses last activity for logout and does not stay at just now after a few minutes", () => {
  const t = (key: string) =>
    ({
      just_now: "刚刚",
      "nodeCard.time_day": "天",
      "nodeCard.time_hour": "时",
      "nodeCard.time_minute": "分钟",
      "time.ago": "前",
    }[key] || key);
  assert.equal(formatSessionAge(12_000, t), "刚刚");
  assert.equal(formatSessionAge(5 * 60_000, t), "5分钟前");
  assert.equal(formatSessionAge(11 * 24 * 60 * 60_000 + 9 * 60 * 60_000, t), "11天9时前");
  const remainT = (key: string, options?: Record<string, unknown>) =>
    ({
      "sessions.expired": "已过期",
      "sessions.remain_d": `${options?.count}天`,
      "sessions.remain_h": `${options?.count}时`,
      "sessions.remain_m": `${options?.count}分`,
    }[key] || key);
  const now = Date.parse("2026-09-20T12:00:00.000Z");
  assert.equal(
    remainingSessionLabel(now + 23 * 60 * 60_000 + 59 * 60_000, now, now, remainT).text,
    "23时59分",
  );
  assert.equal(remainingSessionLabel(now - 1_000, now, now, remainT).text, "已过期");
  const last = "2026-09-17T09:12:55.000Z";
  const created = "2026-09-10T09:12:55.000Z";
  assert.equal(sessionLastActivityMs({ latest_online: last, created_at: created }), Date.parse(last));
  assert.equal(sessionLastActivityMs({ latest_online: "0001-01-01T00:00:00Z", created_at: created }), Date.parse(created));
  assert.equal(
    sessionLogoutAtMs(
      { latest_online: last, created_at: created, expires: "2026-10-20T09:12:55.000Z" },
      86_400,
      now,
    ),
    Date.parse(last) + 86_400_000,
  );
  const sessions = readFileSync("src/pages/admin/sessions.tsx", "utf8");
  assert.match(sessions, /sessionLastActivityMs/);
  assert.match(sessions, /sessionLogoutAtMs/);
  assert.match(sessions, /formatLastOnline\(lastMs/);
  assert.match(sessions, /formatLogoutAt\(logoutMs/);
  assert.match(sessions, /remainingSessionLabel\(logoutMs, serverNowMs, nowMs, t\)/);
  assert.match(sessions, /sessions\.ip_latest/);
  assert.doesNotMatch(sessions, /Latest IP/);
  assert.doesNotMatch(sessions, /User Agent/);
  const account = readFileSync("src/pages/admin/settings/account-security.tsx", "utf8");
  assert.match(account, /UserAgentHelper\.shortDevice/);
  assert.match(account, /onCount=\{setSessionCount\}/);
  assert.match(account, /ttlSeconds=\{Number\(settings\.session_ttl_seconds\)/);
  assert.doesNotMatch(account, /\/Mac\/i/);
});

test("SSO ids keep the provider prefix and the rest of the external id", () => {
  assert.equal(ssoProviderKey("generic_user_id_extra", "github"), "generic");
  assert.equal(ssoExternalId("generic_user_id_extra"), "user_id_extra");
  assert.equal(ssoProviderLabel("github"), "GitHub");
  assert.equal(ssoProviderLabel("qq"), "QQ");
  assert.equal(ssoProviderKey("", "qq"), "qq");
  const accountSource = readFileSync("src/pages/admin/settings/account-security.tsx", "utf8");
  assert.match(accountSource, /settings\.o_auth_provider/);
  assert.doesNotMatch(accountSource, /settings\.oauth_provider/);
});

test("session touch logs out on 401 and coalesces inflight activity", () => {
  const source = readFileSync("src/hooks/useSessionActivity.ts", "utf8");
  assert.match(source, /expired: true/);
  assert.match(source, /pendingAfter/);
  const sync = readFileSync("src/components/SessionActivitySync.tsx", "utf8");
  assert.match(sync, /payload\.expired/);
});

test("passkeys can be deleted from the account sheet", () => {
  const source = readFileSync("src/pages/admin/settings/account-security.tsx", "utf8");
  assert.match(source, /method: "DELETE"/);
  assert.match(source, /LastSignInMethodDialog/);
  assert.match(source, /onCount=\{setPasskeyCount\}/);
  assert.match(source, /getAccountPasskeySnapshot/);
  assert.match(source, /prefetchAccountPasskeys/);
  assert.match(source, /passkeyCount === null/);
  assert.match(source, /current\.filter\(\(row\) => row\.id !== item\.id\)/);
  assert.match(source, /created\?\.id/);
  assert.match(source, /onCount\?\.\(count\)/);
  const signIn = source.slice(source.indexOf("function SignInMethodsPanel"), source.indexOf("function GithubPanel"));
  assert.match(signIn, /passkeyCount: number/);
  assert.doesNotMatch(signIn, /\/api\/admin\/account\/passkeys/);
});

test("API key is not a password field and passkey confirm does not keep identity draft", () => {
  const source = readFileSync("src/pages/admin/settings/account-security.tsx", "utf8");
  assert.match(source, /data-bwignore/);
  assert.match(source, /name="lite-site-api-key"/);
  assert.match(source, /toPasskeyCreateOptions/);
  assert.match(source, /saveTarget === "platform"/);
  assert.match(source, /saveTarget === "password-manager"/);
  assert.match(source, /windowsHelloAvailable/);
  assert.match(source, /UserAgentHelper\.isWindows/);
  assert.match(source, /name="one-time-code"/);
  assert.match(source, /autoComplete="one-time-code"/);
  assert.match(source, /autoComplete="current-password"/);
  const passkeys = source.slice(source.indexOf("function PasskeysPanel"));
  assert.doesNotMatch(passkeys, /AutofillUsernameAnchor/);
  assert.doesNotMatch(passkeys, /autoComplete="username"/);
  assert.match(passkeys, /setPassword\(""\)/);
  assert.match(passkeys, /setTwoFa\(""\)/);
  assert.match(passkeys, /setConfirmKey/);
  assert.match(passkeys, /name=\{isMobile \? undefined : "one-time-code"\}/);
  assert.match(passkeys, /autoComplete=\{isMobile \? "off" : "one-time-code"\}/);
  assert.match(passkeys, /htmlInput: isMobile/);
  assert.doesNotMatch(source, /password_mismatch_error[\s\S]{0,80}: " "/);
});

test("Windows Hello passkeys use the computer icon and other passkeys use the key", () => {
  assert.equal(isWindowsHelloPasskey("08987058-cadc-4b81-b6e1-30de50dcbe96"), true);
  assert.equal(isWindowsHelloPasskey("9DDD1817-AF5A-4672-A2B9-3E3DD95000A9"), true);
  assert.equal(isWindowsHelloPasskey("6028b017-b1d4-4c02-b4b3-afcdafc96bb2"), true);
  assert.equal(isWindowsHelloPasskey("d548826e-79b4-db40-a3d8-11116f7e8349"), false);
  assert.equal(isWindowsHelloPasskey(""), false);
  const source = readFileSync("src/pages/admin/settings/account-security.tsx", "utf8");
  const passkeys = source.slice(source.indexOf("function PasskeysPanel"));
  assert.match(passkeys, /isWindowsHelloPasskey\(item\.aaguid\)/);
  assert.doesNotMatch(passkeys, /index === 0 \? <Devices/);
});

test("Hello stays a Windows platform request and password managers are not hybrid", () => {
  const hello = withPasskeyCreatePreference({ challenge: "x", hints: ["hybrid"] }, "platform");
  assert.deepEqual(hello.hints, ["client-device"]);
  assert.equal(hello.authenticatorSelection.authenticatorAttachment, "platform");
  const manager = withPasskeyCreatePreference(
    {
      challenge: "x",
      hints: ["hybrid"],
      authenticatorSelection: { authenticatorAttachment: "cross-platform" },
    },
    "password-manager",
  );
  assert.equal(manager.hints, undefined);
  assert.equal(manager.authenticatorSelection.authenticatorAttachment, undefined);
  assert.equal(manager.authenticatorSelection.residentKey, "required");
  const webauthn = readFileSync("src/utils/webauthn.ts", "utf8");
  assert.doesNotMatch(webauthn, /authenticatorAttachment: "cross-platform"/);
});

test("API key drafts are discarded if the sheet closes without saving", () => {
  const source = readFileSync("src/pages/admin/settings/account-security.tsx", "utf8");
  const panel = source.slice(source.indexOf("function ApiKeyPanel"));
  assert.match(panel, /const savedKey = String\(settings\.api_key \|\| ""\)/);
  assert.match(panel, /if \(open\) return;/);
  assert.match(panel, /setValue\(savedKey\)/);
  assert.match(panel, /const close = \(\) => \{\s*discardDraft\(\);\s*onClose\(\);/s);
  assert.match(panel, /onCancel=\{close\}/);
  assert.match(panel, /onClose=\{close\}/);
  assert.match(panel, /confirm !== "clear"/);
  assert.doesNotMatch(panel.slice(0, panel.indexOf("function netIsIpHost")), /onCancel=\{onClose\}/);
});

test("password and passkey drafts are discarded if the sheet closes without saving", () => {
  const source = readFileSync("src/pages/admin/settings/account-security.tsx", "utf8");
  const password = source.slice(
    source.indexOf("function PasswordPanel"),
    source.indexOf("function AvatarPanel"),
  );
  assert.match(password, /const discardDraft = \(\) => \{/);
  assert.match(password, /if \(open\) return;/);
  assert.match(password, /const close = \(\) => \{\s*discardDraft\(\);\s*onClose\(\);/s);
  assert.match(password, /onCancel=\{close\}/);
  assert.match(password, /onClose=\{close\}/);
  assert.doesNotMatch(password, /onCancel=\{onClose\}/);
  const passkeys = source.slice(source.indexOf("function PasskeysPanel"));
  assert.match(passkeys, /if \(open\) return;\s*abortCeremony\(\);\s*setName\(""\);\s*setPassword\(""\);\s*setTwoFa\(""\);/s);
  assert.match(passkeys, /signal: controller\.signal/);
  assert.match(passkeys, /onClose=\{close\}/);
  assert.match(passkeys, /toPasskeyCreateOptions\(\s*optionsBody\.data\?\.publicKey \|\| optionsBody\.publicKey,\s*prefer,\s*\)/s);
  assert.doesNotMatch(passkeys, /authenticatorAttachment:\s*"cross-platform"/);
});

test("account security passkey count is prefetched like other settings pages", () => {
  const routes = readFileSync("src/routes.ts", "utf8");
  assert.match(routes, /prefetchAccountPasskeys/);
  const topbar = readFileSync("src/components/admin/shell/AdminTopbar.tsx", "utf8");
  assert.match(topbar, /preloadAdminRoute\("\/admin\/settings\/account-security"\)/);
  const cache = readFileSync("src/lib/accountPasskeys.ts", "utf8");
  assert.match(cache, /accountPasskeysSnapshot/);
  const zh = JSON.parse(readFileSync("src/i18n/locales/zh_CN.json", "utf8"));
  assert.equal(zh.account.passkey_name, "备注");
});

test("site feature cards do not wrap icons in a filled tile", () => {
  const source = readFileSync("src/components/admin/SettingsFeatureCard.tsx", "utf8");
  assert.match(source, /layout === "site"/);
  assert.doesNotMatch(source, /accent=\{layout === "site"/);
});
