import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildHTTPFallbackURL,
  buildHTTPSRedirectURL,
} from "../src/lib/https.ts";

const page = readFileSync("src/pages/admin/settings/reverse-proxy.tsx", "utf8");
const api = readFileSync("src/lib/https.ts", "utf8");
const localeFiles = ["en.json", "ja_JP.json", "zh_CN.json", "zh_TW.json"];

test("reverse proxy separates built-in HTTPS and Cloudflare Tunnel", () => {
  assert.match(page, /<Tabs\.Trigger value="https"/);
  assert.match(page, /<Tabs\.Trigger value="cloudflare"/);
  assert.match(page, /<HTTPSPanel onReady=\{markHttpsReady\} \/>/);
  assert.match(page, /<CloudflareTunnelPanel onReady=\{markCloudflareReady\} \/>/);
  assert.match(page, /useHeldTab\(activeTab, tabReady\)/);
  assert.match(page, /hidden=\{displayTab !== "https"\}/);
  assert.match(page, /hidden=\{displayTab !== "cloudflare"\}/);
  assert.match(page, /data-admin-route-pending=\{routePending \? "true" : undefined\}/);
  assert.doesNotMatch(page, /SettingsPageSkeleton/);
});

test("built-in HTTPS reads certificates only from server paths", () => {
  assert.match(page, /certificate_paths/);
  assert.match(page, /https_certificate_path/);
  assert.match(page, /https_private_key_path/);
  assert.match(page, /https_redirect_http/);
  assert.doesNotMatch(page, /letsencrypt/i);
  assert.doesNotMatch(page, /type="file"/);
  assert.doesNotMatch(page, /uploadHTTPSCertificate/);
  assert.match(page, /:36888/);
  assert.match(page, /https_listen: `:\$\{numericPort\}`/);
  assert.doesNotMatch(api, /\/api\/admin\/settings\/https\/upload/);
  assert.match(api, /\/api\/admin\/settings\/https\/reload/);
});

test("HTTPS status stays readable before a certificate is loaded", () => {
  assert.match(page, /parsed\.getUTCFullYear\(\) <= 1/);
  assert.match(page, /sm:grid-cols-2 xl:grid-cols-4/);
  assert.match(page, /certificate_waiting", "Certificate not configured"/);
  assert.match(page, /localizedError\(status\.error\)/);
  assert.match(api, /let'\?s encrypt\|read certificate\|read private key/);
  assert.match(page, /certificate_pending_enable/);
  assert.match(page, /listener_ipv4/);
  assert.match(page, /listener_ipv6/);
  assert.match(page, /listener_ipv4_available/);
  assert.match(page, /listener_ipv6_available/);
  assert.match(page, /listener_probe_done/);
  assert.match(page, /listener_ready/);
});

test("disabling direct built-in HTTPS returns to the current page over HTTP", () => {
  assert.match(api, /http_origin\?: string/);
  assert.match(api, /location\.protocol !== "https:"/);
  assert.match(api, /origin\.protocol !== "http:"/);
  assert.match(page, /buildHTTPFallbackURL/);
  assert.match(page, /window\.location\.replace\(fallbackURL\)/);

  assert.equal(
    buildHTTPFallbackURL(
      "http://[2001:db8::12]:25881",
      {
        protocol: "https:",
        pathname: "/admin/settings/reverse-proxy",
        search: "?tab=https",
        hash: "#certificate",
      },
      "test-recovery",
    ),
    "http://[2001:db8::12]:25881/admin/settings/reverse-proxy?tab=https&_komari_http_recovery=test-recovery#certificate",
  );
  assert.equal(
    buildHTTPFallbackURL("http://panel.example.com:25881", {
      protocol: "http:",
      pathname: "/admin",
      search: "",
      hash: "",
    }),
    null,
  );
  assert.equal(
    buildHTTPFallbackURL("https://panel.example.com:25881", {
      protocol: "https:",
      pathname: "/admin",
      search: "",
      hash: "",
    }),
    null,
  );
});

test("enabling ready built-in HTTPS enters the matching secure page", () => {
  assert.match(api, /https_origin\?: string/);
  assert.match(page, /buildHTTPSRedirectURL/);
  assert.match(page, /payload\.status\.running/);
  assert.match(page, /payload\.status\.ready/);
  assert.match(page, /window\.location\.replace\(secureURL\)/);

  assert.equal(
    buildHTTPSRedirectURL("https://[2001:db8::12]:36888", {
      protocol: "http:",
      pathname: "/admin/settings/reverse-proxy",
      search: "?tab=https",
      hash: "#certificate",
    }),
    "https://[2001:db8::12]:36888/admin/settings/reverse-proxy?tab=https#certificate",
  );
  assert.equal(
    buildHTTPSRedirectURL("https://panel.example.com:36888", {
      protocol: "https:",
      pathname: "/admin",
      search: "",
      hash: "",
    }),
    null,
  );
  assert.equal(
    buildHTTPSRedirectURL("http://panel.example.com:36888", {
      protocol: "http:",
      pathname: "/admin",
      search: "",
      hash: "",
    }),
    null,
  );
});

test("status polling never overwrites an HTTPS form being edited", () => {
  assert.match(page, /refresh\(false, true\)/);
  assert.match(page, /useVisibleInterval\(\(\) => void refresh\(true\), 5000\)/);
  assert.match(page, /if \(syncForm\)/);
});

test("every admin language covers the built-in HTTPS controls", () => {
  for (const filename of localeFiles) {
    const locale = JSON.parse(readFileSync(`src/i18n/locales/${filename}`, "utf8"));
    const keys = locale.settings.reverse_proxy;
    for (const key of [
      "https_tab",
      "enable_https",
      "redirect_http",
      "certificate_paths",
      "certificate_paths_description",
      "https_port_description",
      "listener_ready",
      "listener_checking",
      "listener_unavailable",
      "listener_port",
    ]) {
      assert.equal(typeof keys[key], "string", `${filename}: ${key}`);
      assert.notEqual(keys[key].trim(), "", `${filename}: ${key}`);
    }
  }
});

test("Cloudflare token guidance keeps readable vertical rhythm", () => {
  assert.match(page, /mt-3 flex flex-col gap-2/);
  assert.match(page, /cloudflare_token_help[\s\S]*block leading-6/);
  assert.match(page, /token_guide[\s\S]*ExternalLink/);
});

test("install hint does not say Docker ships cloudflared", () => {
  assert.match(page, /LITE_CLOUDFLARED_BIN/);
  assert.doesNotMatch(page, /non-Docker/);
  for (const filename of localeFiles) {
    const locale = JSON.parse(readFileSync(`src/i18n/locales/${filename}`, "utf8"));
    const hint = locale.settings.reverse_proxy.install_hint;
    assert.equal(typeof hint, "string", filename);
    assert.match(hint, /LITE_CLOUDFLARED_BIN/);
    assert.doesNotMatch(hint, /非 Docker|non-Docker|Docker 以外/);
  }
});

test("hover preload fills reverse-proxy data before the page mounts", () => {
  const routes = readFileSync("src/routes.ts", "utf8");
  const cloudflared = readFileSync("src/lib/cloudflared.ts", "utf8");
  assert.match(routes, /prefetchHTTPSSettings/);
  assert.match(routes, /prefetchCloudflaredStatus/);
  assert.match(api, /getHTTPSSettingsSnapshot/);
  assert.match(cloudflared, /getCloudflaredStatusSnapshot/);
});
