import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/pages/admin/nodemgt/index.tsx"),
  "utf8",
);

test("inbound sort index 0 is sent instead of treated as empty", () => {
  assert.match(source, /function inboundSortIndexValue/);
  assert.match(source, /sort_index: inboundSortIndexValue\(form\.sort_index\)/);
  assert.doesNotMatch(source, /sort_index: Number\(form\.sort_index \|\| 0\)/);
  assert.match(source, /sort_index: row\?\.id \? str\(row\?\.sort_index\) : ""/);
  assert.match(source, /function inboundSortKey/);
  assert.match(source, /inboundSortKey\(a\) - inboundSortKey\(b\)/);
});

test("inbound firewall allow goes through exec grant and availability hints", () => {
  assert.match(source, /inboundNeedsFirewallGrant/);
  assert.match(source, /inboundFirewallUnavailable/);
  assert.match(source, /firewall\.auth_title/);
  assert.match(source, /FIREWALL_GRANT_SCOPE/);
  assert.match(source, /row\.firewall_linked/);
  assert.match(source, /scope: "exec"/);
  assert.match(source, /admin:nodemgt.inbound.delete/);
  assert.match(source, /inboundNodeOf/);
});
