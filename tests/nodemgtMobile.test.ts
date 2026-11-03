import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/admin/nodemgt/index.tsx", import.meta.url), "utf8");

test("new inbound sheet starts with sniffing off", () => {
  assert.match(source, /inbound: inboundForm\(\)/);
  assert.match(source, /sniffing: existing && \(row\.sniffing === true \|\| row\.sniffing === "true"\) \? "true" : "false"/);
  assert.match(source, /node_uuid: nodeFilterUUID/);
  assert.match(source, /<AdminMultiSelect/);
  assert.match(source, /filtersByTab/);
  assert.match(source, /<AdminActiveFilters/);
  assert.match(source, /className="admin-tab-panel"/);
  assert.match(source, /nodemgt\.random_port/);
  assert.match(source, /nodemgt\.random_short_id/);
  assert.match(source, /uuidForInbound\(inbound, users\)/);
  assert.match(source, /outboundTagConflict\(form\.name, form\.node_uuid, outbounds, form\.id\)/);
  assert.match(source, /nodemgt\.outbound_tag_duplicate/);
  assert.match(source, /nodemgtErrorMessage\(err, t, sheet\.kind\)/);
  assert.match(source, /nodemgtErrorMessage\(err, t\)/);
  assert.match(source, /str\(row\?\.stack\) \|\| \(row\?\.id \? "dual" : "ipv4"\)/);
  assert.doesNotMatch(source, /stack: str\(row\?\.stack, "dual"\)/);
  assert.match(source, /placeholder=\{\s*placeholder \?\? "yyyy\/mm\/dd HH:mm"\s*\}/);
  assert.match(source, /function ExpiryField/);
  assert.doesNotMatch(source, /ips\[0\]\.ip\}.*\+\$\{ips\.length/);
  assert.match(source, /InboundOverflow names=\{names\}/);
  assert.doesNotMatch(source, /label=\{t\("nodemgt\.extra_urls"\)\}/);
});

test("node management mobile lists reuse the server-list card stack", () => {
  assert.match(source, /AdminMobileCardStack/);
  assert.match(source, /AdminMobileListCard/);
  assert.doesNotMatch(source, /\.slice\(1, 4\)/);
  assert.match(source, /recordMobileSkipKeys/);
  assert.match(source, /actions=\{action\}/);
  assert.match(source, /loading=\{loading\}/);
});

test("inbound core column shows Xray instead of lowercase xray", () => {
  assert.match(source, /function displayCore\(value: string\) \{\s*return value === "xray" \? "Xray" : value;/);
  assert.match(source, /render: \(row\) => displayCore\(row\.core\)/);
  assert.match(source, /label: displayCore\(value\)/);
});

test("overview keeps core version cards and inbound delivery table", () => {
  assert.match(source, /"\/diag": "overview"/);
  assert.match(source, /nodemgt\.col_xray_version/);
  assert.match(source, /nodemgt\.col_singbox_version/);
  assert.match(source, /nodemgt\.diag_core_help/);
  assert.match(source, /nodemgt\.diag_pending/);
  assert.match(source, /inboundDeliveryOf\(sample, cmd\)/);
  assert.doesNotMatch(source, /nodemgt\.delivery_status_title/);
  assert.match(source, /empty=\{t\("nodemgt\.no_nodes"\)\}/);
  assert.doesNotMatch(source, /nodemgt\.diag_xray_help/);
  assert.doesNotMatch(source, /tab === "diag"/);
  assert.doesNotMatch(source, /col_cores\}: \{\(diag\.cores/);
});
