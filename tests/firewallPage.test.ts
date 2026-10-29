import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/pages/admin/remote-management/firewall.tsx"),
  "utf8",
);

test("firewall policy saves go through the grant dialog", () => {
  assert.match(source, /const queueSave = async/);
  assert.match(source, /firewall\.auth_title/);
  assert.match(source, /view\?\.delivery_error/);
  assert.match(source, /firewallDeliveryText/);
  assert.match(source, /firewall\.errors\.command_timeout/);
  assert.match(source, /firewall\.scan_offline/);
  assert.match(source, /disabled=\{busy \|\| readOnly\}/);
});

test("firewall policy uses one switch for both stacks", () => {
  assert.match(source, /function FirewallPolicySwitch/);
  assert.doesNotMatch(source, /function FirewallPolicyPair/);
  assert.match(source, /block_ping_v4: next, block_ping_v6: next/);
  assert.match(source, /default_deny_v4: true, default_deny_v6: true/);
  assert.match(source, /default_deny_v4: false, default_deny_v6: false/);
  assert.match(source, /firewall\.stack_unsupported/);
  assert.match(source, /disabled=\{stackLocked\}/);
});

test("firewall policy row edits ssh port and saves it with the intent", () => {
  assert.match(source, /function FirewallPolicyPort/);
  assert.match(source, /firewall\.ssh_port/);
  assert.doesNotMatch(source, /firewall\.ssh_port_help/);
  assert.match(source, /firewall\.ssh_port_confirm_title/);
  assert.match(source, /ssh_port: next\.ssh_port \|\| ""/);
  assert.match(source, /delivery_status === "applied"/);
  assert.match(source, /view\?\.snapshot\?\.ssh_port \|\| view\?\.intent\.ssh_port/);
  assert.match(source, /queueSave\(\{ \.\.\.view\.intent, ssh_port: next \}\)/);
  assert.match(source, /persistableRules\(next\.rules\)/);
});

test("firewall default deny starts off and asks before turning on", () => {
  assert.doesNotMatch(source, /firewall\.block_ping_help/);
  assert.match(source, /firewall\.default_deny_confirm_title/);
  assert.match(source, /description=\{t\("firewall\.default_deny_help"\)\}/);
  assert.match(source, /setDenyConfirm\(true\)/);
  assert.match(source, /width: "fit-content"/);
});

test("firewall host sync and policy auth both offer passkey", () => {
  assert.match(source, /const adopt = async \(usePasskey = false\)/);
  assert.match(source, /authorize\(authPassword, authOtp, usePasskey\)/);
  assert.match(source, /login\.passkey/);
});

test("firewall identity flag is larger than the shared node-list emblem", () => {
  assert.match(source, /admin-firewall-identity-flag/);
});

test("firewall delivery status is a chip on the right of the identity card", () => {
  assert.match(source, /function deliveryStatusChipSx/);
  const identity = source.slice(source.indexOf("km-admin-detail-card"), source.indexOf("firewall.agent_old"));
  assert.match(identity, /ml: "auto"/);
  assert.match(identity, /deliveryStatusChipSx\(view\.delivery_status\)/);
  assert.match(identity, /nodeCard\.online/);
  assert.match(identity, /firewall\.backend\./);
  const backendAt = identity.indexOf("firewall.backend.");
  const deliveryAt = identity.indexOf("deliveryStatusChipSx");
  assert.ok(backendAt >= 0 && deliveryAt > backendAt, "delivery chip must sit after the backend chip, on the right");
});

test("firewall detail scans host rules on first open", () => {
  assert.match(source, /!next\.snapshot \|\| \(denyOn && !hasKeep\)/);
  assert.match(source, /\/snapshot/);
  const load = source.slice(source.indexOf("void refreshFirewallView"), source.indexOf("const postJSON"));
  const showAt = load.indexOf("setView(next)");
  const scanAt = load.indexOf("/snapshot");
  assert.ok(showAt >= 0 && scanAt > showAt, "first paint must not wait for the host scan");
});

test("firewall list identity matches the node list", () => {
  const identity = source.slice(source.indexOf("function FirewallNodeIdentity"), source.indexOf("function FirewallNodeAddresses"));
  assert.match(identity, /admin-node-country-flag/);
  assert.match(identity, /text-\[15px\] font-semibold leading-6/);
  assert.match(identity, /text-\[13\.5px\]/);
  assert.match(identity, /h-\[18px\]/);
  assert.match(identity, /NODE_ONLINE/);
  assert.doesNotMatch(identity, /remote-exec-node-identity/);
  assert.doesNotMatch(identity, /remote-exec-node-flag/);
  const addresses = source.slice(source.indexOf("function FirewallNodeAddresses"));
  assert.match(addresses, /text-sm leading-\[1\.125rem\]/);
  assert.match(addresses, /tabular-nums/);
  assert.doesNotMatch(addresses, /remote-exec-node-address/);
});

test("firewall list only manage opens detail", () => {
  const picker = source.slice(source.indexOf("function FirewallNodePicker"), source.indexOf("function FirewallNodeIdentity"));
  assert.match(picker, /t\("common.manage"\)/);
  assert.doesNotMatch(picker, /className="remote-exec-node-row"/);
  const beforeButton = picker.slice(picker.indexOf("<TableRow"), picker.indexOf("<MuiButton"));
  assert.doesNotMatch(beforeButton, /onClick=\{\(\) => onSelect\(node\)\}/);
  assert.match(picker.slice(picker.indexOf("<MuiButton")), /onClick=\{\(\) => onSelect\(node\)\}/);
});

test("firewall list prefetches node flags before the table paints", () => {
  assert.match(source, /prefetchNodeFlags\(nodeDetail\)/);
  assert.match(source, /useLayoutEffect/);
});

test("firewall reuses the admin node list and keeps route loading on the page chrome", () => {
  assert.match(source, /<AdminNodeLiveDataProvider>/);
  assert.doesNotMatch(source, /<NodeDetailsProvider>/);
  assert.doesNotMatch(source, /if \(isLoading\) return <Loading/);
  assert.match(source, /data-admin-route-pending=\{listPending \? "true" : undefined\}/);
  assert.match(source, /data-admin-route-pending=\{detailPending \? "true" : undefined\}/);
  assert.match(source, /onPointerEnter=\{\(\) => onPrefetch\?\.\(node\.uuid\)\}/);
  assert.match(source, /prefetchFirewallView/);
  assert.match(source, /<Loading inline text=""/);
});

test("firewall rules table uses shared admin pagination", () => {
  assert.match(source, /useAdminPagination\(filtered\)/);
  assert.match(source, /onPageSizeChange=\{pager\.setPageSize\}/);
  assert.match(source, /showWhenEmpty/);
});

test("firewall keep holes stay visible and are stripped on save", () => {
  assert.match(source, /function isKeepRule/);
  assert.match(source, /function persistableRules/);
  assert.match(source, /persistableRules\(next\.rules\)/);
  assert.match(source, /persistableRules\(rules\)\.filter/);
  assert.match(source, /firewall\.origin_keep/);
  assert.match(source, /disabled=\{stackLocked \|\| busy \|\| kept\}/);
  assert.match(source, /if \(!view \|\| \(existing && isKeepRule\(existing\)\)\) return/);
  assert.match(source, /omit_keep: omitKeep/);
  assert.match(source, /keepOmitKey/);
});

test("firewall host sync can select all adoptable rules", () => {
  assert.match(source, /adoptableHostKeys/);
  assert.match(source, /common\.select_all/);
  assert.match(source, /common\.deselect_all/);
  assert.match(source, /setSelectedHost\(\[\]\); setImportHost\(true\)/);
  assert.match(source, /pl: 1\.5, border: "1px solid transparent"/);
});

test("firewall create can expand TCP and UDP together", () => {
  assert.match(source, /<MenuItem value="both">TCP\/UDP<\/MenuItem>/);
  assert.match(source, /function protocolsOf/);
  assert.match(source, /protocol === "both"/);
});

test("firewall create blocks the same protocol port and source", () => {
  assert.match(source, /function firewallRuleKey/);
  assert.match(source, /function hasDuplicateFirewallRule/);
  assert.match(source, /hasDuplicateFirewallRule\(rules, next, existing\?\.id\)/);
  assert.match(source, /firewall\.errors\.duplicate/);
  assert.match(source, /firewall rule already exists/);
});

test("firewall edit keeps the rule in place", () => {
  assert.match(source, /function replaceRulesAt/);
  assert.match(source, /replaceRulesAt\(rules, existing, expanded\)/);
  assert.doesNotMatch(source, /\[\.\.\.rules\.filter\(\(rule\) => rule\.id !== existing\.id\), \.\.\.expanded\]/);
});

test("firewall save and adopt toasts do not treat in-flight apply as failure", () => {
  assert.match(source, /firewall\.saved_pending/);
  assert.match(source, /delivery_status === "sent"/);
  assert.match(source, /data\.disable_original === "timeout"/);
  assert.match(source, /firewall\.disable_original_timeout/);
  assert.match(source, /firewall\.disable_original_failed/);
});

test("firewall import drops inbound and host keys", () => {
  const start = source.indexOf("const mapped = incoming.map");
  const end = source.indexOf("await queueSave", start);
  assert.ok(start >= 0 && end > start);
  const mapped = source.slice(start, end);
  assert.match(mapped, /origin: "file"/);
  assert.doesNotMatch(mapped, /inbound_id/);
  assert.doesNotMatch(mapped, /host_key/);
  assert.doesNotMatch(mapped, /\.\.\.rule/);
  const save = source.slice(end, source.indexOf("});", end) + 3);
  assert.doesNotMatch(save, /ssh_port:/);
});
