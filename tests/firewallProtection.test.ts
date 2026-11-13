import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const page = readFileSync(path.resolve(dir, "../src/pages/admin/remote-management/firewall.tsx"), "utf8");
const section = ["index.tsx", "PolicyEditor.tsx", "SourceEditor.tsx", "EnvironmentDialog.tsx", "LogSourcesPanel.tsx", "ActivityPanel.tsx", "GroupsPanel.tsx", "WhitelistPanel.tsx", "ProtectionHint.tsx"].map((file) => readFileSync(
  path.resolve(dir, "../src/pages/admin/remote-management/firewall/protection", file), "utf8",
)).join("\n")
  .replace(/text\("([a-z_]+)"\)/g, '"firewall.protection.$1"')
  .replace(/numberField\("[a-z_]+", "([a-z_]+)"/g, '"firewall.protection.$1"');

test("firewall detail has a service protection tab", () => {
  assert.match(page, /useAdminTabParam\(FIREWALL_TABS, "rules"\)/);
  assert.match(page, /firewall\.protection\.tab/);
  assert.match(page, /ServiceProtectionSection/);
  assert.match(page, /queueProtection/);
  assert.match(page, /tab !== "protection"/);
});

test("protection view reuses a snapshot and does not mark the admin route pending", () => {
  assert.match(section, /getProtectionViewSnapshot/);
  assert.match(section, /rememberProtectionView/);
  assert.match(section, /resolveProtectionView/);
  assert.match(section, /void load\(Boolean\(getProtectionViewSnapshot\(uuid\)\)\)/);
  assert.match(section, /SettingsPageSkeleton inline/);
  assert.match(page, /prefetchProtectionView/);
  assert.match(page, /warmServiceProtection/);
  assert.match(page, /\{uuid \? \(/);
  assert.match(page, /fallback=\{tab === "protection"/);
  assert.match(page, /aria-hidden=\{tab !== "protection"\}/);
  assert.doesNotMatch(page, /protectionMountedFor/);
});

test("protection list footers share the same hint treatment", () => {
  assert.match(section, /ProtectionHint/);
  assert.match(section, /<ProtectionHint>\{"firewall\.protection\.enforce_help"\}/);
  assert.match(section, /<ProtectionHint>\{"firewall\.protection\.scope"\}/);
});

test("enforce mode can set a permanent ban duration", () => {
  assert.match(section, /firewall\.protection\.ban_forever/);
  assert.match(section, /firewall\.protection\.ban_forever_help/);
  assert.match(section, /protectionBanForever/);
  assert.match(section, /protectionBanExpiresForever/);
  assert.match(section, /rememberedBanDurationSec/);
  assert.match(section, /setRememberedBanSec/);
  assert.match(section, /ban_duration_sec: rememberedBanSec/);
});

test("protection header, tabs and timestamps stay readable on a narrow screen", () => {
  assert.match(section, /order: \{ xs: 3, sm: 2 \}/);
  assert.match(section, /order: \{ xs: 2, sm: 3 \}/);
  assert.match(section, /scrollButtons=\{false\}/);
  assert.doesNotMatch(section, /allowScrollButtonsMobile/);
  assert.match(section, /formatProtectionDateTime/);
  const css = readFileSync(path.resolve(dir, "../src/global.css"), "utf8");
  assert.match(css, /firewall-protection-tabs \.MuiTabs-scrollButtons/);
  assert.match(css, /firewall-protection-tabs \[data-admin-tab-motion-ready="true"\]::after/);
  assert.match(css, /content: none/);
  const shell = readFileSync(path.resolve(dir, "../src/components/admin/shell/AdminShell.tsx"), "utf8");
  assert.match(shell, /firewall-protection-tabs/);
});

test("group cards hide delivery revision and log sources use a search bar", () => {
  assert.doesNotMatch(section, /"firewall\.protection\.revision" \{group\.revision\}/);
  assert.match(section, /search_sources/);
  assert.match(section, /protectionActivityRows/);
  assert.match(section, /record_expired/);
  assert.match(section, /record_revoked/);
});

test("protection section covers upgrade, policies, logs, bans and groups", () => {
  assert.match(section, /firewall\.protection\.upgrade/);
  assert.match(section, /firewall\.protection\.linux_only/);
  assert.match(section, /className="km-settings-alert"/);
  assert.match(section, /environment_ready_help/);
  assert.match(section, /firewall\.protection\.need_agent/);
  assert.match(section, /firewall\.protection\.sources/);
  assert.match(section, /firewall\.protection\.bans/);
  assert.match(section, /firewall\.protection\.groups/);
  assert.match(section, /firewall\.protection\.unban_group/);
  assert.match(section, /ban\.group_id \?/);
  assert.match(section, /firewall\.protection\.unban_local/);
  assert.match(section, /firewall\.protection\.path_threshold/);
  assert.match(section, /firewall\.protection\.group_members/);
  assert.match(section, /deploy_mode === "proxy"/);
  assert.match(section, /page_id: pageID/);
  assert.match(section, /if \(data\.next_grant\)/);
  assert.match(section, /enabled: Boolean\(config\.enabled\)/);
  assert.match(section, /firewall\.protection\.create_source/);
  assert.match(section, /firewall\.protection\.group_leave/);
  assert.match(section, /firewall\.protection\.enabled/);
  assert.match(section, /firewall\.protection\.bind_addr/);
  assert.match(section, /firewall\.protection\.source_stats/);
  assert.match(section, /firewall\.protection\.observe_hits/);
  assert.match(section, /firewall\.protection\.network_observe/);
  assert.match(section, /format === "sshd"/);
  assert.doesNotMatch(section, /ssh_threshold_help/);
  assert.match(section, /ssh_config_invalid/);
  assert.match(section, /protectionSshConfigError/);
  assert.match(section, /ssh_duplicate_source/);
  assert.match(section, /ssh_port_mismatch/);
  assert.match(section, /duplicateSshSource/);
  assert.match(section, /blockSshd/);
  assert.match(section, /defaultSshSource/);
  assert.match(section, /sshd_log_path/);
  assert.match(section, /suggestedSshPath/);
  assert.match(section, /applyLogSourceFormat/);
  assert.match(section, /rememberedSshSource/);
  assert.match(page, /sshPort=\{sshPort\}/);
});
