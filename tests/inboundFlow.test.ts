import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/pages/admin/nodemgt/index.tsx", import.meta.url), "utf8");

test("existing inbound keeps empty flow instead of filling vision", () => {
  assert.match(source, /flow: str\(row\?\.flow, existing \? "" : defaultInboundFlow\(protocol, transport, security, core\)\)/);
});

test("tls inbound defaults to empty flow, reality still defaults to vision", () => {
  assert.match(source, /return security === "reality" \? "xtls-rprx-vision" : ""/);
  assert.match(
    source,
    /flow: defaultInboundFlow\(sheet\.form\.protocol, value === "reality" \? "tcp" : sheet\.form\.transport, value, sheet\.form\.core\)/,
  );
});

test("sing-box inbounds cannot use vision flow", () => {
  assert.match(source, /if \(core === "sing-box"\) return false;/);
});

test("choosing reality fills a short id instead of leaving the field blank", () => {
  assert.match(source, /value === "reality" \? sheet\.form\.reality_short_id \|\| randomRealityShortID\(\) : ""/);
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

test("save and delete patch the list before reload so a fetch failure cannot hide the change", () => {
  assert.match(source, /patchNodemgtSnapshot/);
  assert.match(source, /userViewFromUpsert/);
  assert.match(source, /loadAfterChange/);
  assert.match(source, /reload:\s*true/);
  assert.match(source, /DELETE_LIST_KEY/);
  assert.match(source, /commitRows\(key/);
});

test("delete toasts as soon as the row is gone instead of waiting for the full reload", () => {
  assert.match(
    source,
    /const removeRow = async \(method: string, id: string\) => \{[\s\S]*?toast\.success\(t\("nodemgt.saved"\)\);[\s\S]*?void load\(\{ force: true, reload: true \}\)/,
  );
});
