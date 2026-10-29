import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/admin/nodemgt/index.tsx", import.meta.url), "utf8");

test("existing inbound keeps empty flow instead of filling vision", () => {
  assert.match(source, /flow: flowForCore\(str\(row\?\.flow, existing \? "" : defaultInboundFlow\(protocol, transport, security, core\)\), core\)/);
});

test("tls inbound defaults to empty flow, reality still defaults to vision", () => {
  assert.match(source, /return security === "reality" \? "xtls-rprx-vision" : ""/);
  assert.match(
    source,
    /flow: defaultInboundFlow\(sheet\.form\.protocol, value === "reality" \? "tcp" : sheet\.form\.transport, value, sheet\.form\.core\)/,
  );
});

test("sing-box vless tcp tls/reality can use the same vision flow as xray", () => {
  assert.match(source, /function canUseFlow\(protocol: string, transport: string, security: string, _core = "xray"\) \{/);
  assert.doesNotMatch(source, /if \(core === "sing-box"\) return false;/);
  assert.match(source, /return protocol === "vless" && transport === "tcp" && \(security === "tls" \|\| security === "reality"\);/);
  assert.match(source, /if \(core === "sing-box"\) return \["", "xtls-rprx-vision"\] as const;/);
  assert.match(source, /if \(core === "sing-box" && flow\.toLowerCase\(\)\.includes\("vision"\)\) return "xtls-rprx-vision";/);
  assert.match(source, /options=\{flowsFor\(sheet\.form\.core\)\.map/);
});

test("choosing reality fills a short id instead of leaving the field blank", () => {
  assert.match(source, /value === "reality" \? sheet\.form\.reality_short_id \|\| randomRealityShortID\(\) : ""/);
});

test("choosing reality overwrites leftover tls/hy2 sni with the dest host", () => {
  assert.match(source, /sni: form\.security === "reality" \? shareSNI\(form, "reality"\) : form\.sni/);
  assert.match(source, /sni: destHost\(value\)/);
});

test("custom reality dest clears leftover sni then copies typed dest host", () => {
  assert.match(source, /setForm\(\{ reality_dest: "", reality_server_names: "", sni: "" \}\)/);
  assert.match(source, /onChange=\{\(value\) => setForm\(\{ reality_dest: value, reality_server_names: destHost\(value\), sni: destHost\(value\) \}\)\}/);
});

test("disabled routes outbounds and users still follow the node apply-config chip", () => {
  assert.doesNotMatch(source, /function rowPushedToNode/);
  assert.doesNotMatch(source, /if \(!rowPushedToNode\(row\)\) return "not_started"/);
  assert.match(source, /function inboundDeliveryOf\(row\?: any, cmd\?: any\) \{\s*const status = deliveryStatusOf\(cmd\);/);
});

test("new outbound copies uuid from the inbound's granted user", () => {
  assert.match(source, /const uuid = uuidForInbound\(inbound, users\) \|\| sheet\?\.form\.uuid \|\| ""/);
  assert.match(source, /outboundPasswordFromInbound\(inbound, users\)/);
  assert.match(source, /fields\.protocol === "shadowsocks" \? ssPassword/);
});

test("reuse built-in HTTPS does not copy certificate domain into public host", () => {
  assert.doesNotMatch(source, /certShareDomain/);
  assert.doesNotMatch(source, /reuse && domain \? domain/);
  assert.match(source, /sub_public_host: nextCfg\.sub_public_host/);
});

test("new user save uses upsert secret instead of a second credential issue", () => {
  assert.match(source, /const secret = str\(saved\?\.secret\)/);
  assert.doesNotMatch(source, /admin:nodemgt\.credential\.issue/);
});

test("freedom domain strategy yields to a non-dual node dial stack", () => {
  assert.match(source, /nodemgt\.domain_strategy_node_help/);
  assert.match(source, /nodeDialStackOf\(sheet\.form\.node_uuid\) === "dual"/);
});

test("overview edits per-node outbound dial stack for both cores", () => {
  assert.match(source, /admin:nodemgt\.node\.upsert/);
  assert.match(source, /const DIAL_STACKS = \["dual", "ipv4", "ipv6", "prefer_ipv4", "prefer_ipv6"\] as const;/);
  assert.match(source, /openEdit\("node", row\)/);
  assert.match(source, /applyXrayDialStack|dial_stack/);
});

test("toggling outbound route or user keeps the row index instead of appending", () => {
  assert.match(source, /const idx = rows\.findIndex\(\(item\) => str\(item\?\.id\) === id\)/);
  assert.match(source, /created_at: prev\.created_at \|\| row\.created_at/);
  assert.doesNotMatch(source, /\[\.\.\.rows\.filter\(\(item\) => str\(item\?\.id\) !== id\), row\]/);
  assert.match(source, /visibleOutbounds = outbounds\.filter[\s\S]*?\.sort\(byCreatedAt\)/);
  assert.match(source, /visibleUsers = users\.filter[\s\S]*?\.sort\(byCreatedAt\)/);
});

test("save and delete patch the list before reload so a fetch failure cannot hide the change", () => {
  assert.match(source, /patchNodemgtSnapshot/);
  assert.match(source, /userViewFromUpsert/);
  assert.match(source, /loadAfterChange/);
  assert.match(source, /reload:\s*true/);
  assert.match(source, /DELETE_LIST_KEY/);
  assert.match(source, /commitRows\(key/);
});

test("shadowsocks inbound network is tcp,udp / tcp / udp", () => {
  assert.match(source, /if \(protocol === "shadowsocks"\) return \["tcp,udp", "tcp", "udp"\]/);
  assert.match(source, /if \(protocol === "shadowsocks"\) return "tcp,udp"/);
  assert.match(source, /label=\{sheet\.form\.protocol === "shadowsocks" \? t\("nodemgt\.col_network"\) : t\("nodemgt\.col_transport"\)\}/);
  assert.match(source, /function outboundTransportsFor\(protocol: string\)/);
  assert.match(source, /if \(protocol === "shadowsocks"\) return transportsFor\(protocol\)/);
  assert.match(source, /options=\{outboundTransportsFor\(sheet\.form\.protocol\)\.map/);
});

test("sing-box udp inbounds expose udp_fragment and send it on save", () => {
  assert.match(source, /function inboundShowsUDPFragment\(protocol: string, transport: string, core: string\)/);
  assert.match(source, /return inboundUsesUDP\(protocol, transport\) && core === "sing-box"/);
  assert.match(source, /title=\{t\("nodemgt\.udp_fragment"\)\}/);
  assert.match(source, /udp_fragment: inboundShowsUDPFragment\(form\.protocol, form\.transport, form\.core\) \? form\.udp_fragment === "true" : undefined/);
});

test("delete toasts as soon as the row is gone instead of waiting for the full reload", () => {
  assert.match(
    source,
    /const removeRow = async \(method: string, id: string, firewallGrant\?: string\) => \{[\s\S]*?toast\.success\(t\("nodemgt.saved"\)\);[\s\S]*?void load\(\{ force: true, reload: true \}\)/,
  );
});
