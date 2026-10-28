import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { displayExpiryInput, inboundFirewallUnavailable, inboundNeedsFirewallGrant, inboundShareHost, inboundSharePort, moveAdjacentIDs, nodemgtErrorMessage, nodemgtRpcErrorKey, nodemgtWarningMessage, normalizeExpiryInput, outboundFieldsFromInbound, outboundPasswordFromInbound, outboundTagConflict, outboundTagFromInbound, randomInboundPort, randomRealityShortID, ss2022Key, ss2022SharePassword, stripFirewallGrantFields, uuidForInbound } from "../src/pages/admin/nodemgt/inboundToOutbound.ts";

test("uses node IP, listen address, or custom share host", () => {
  assert.equal(inboundShareHost({ share_strategy: "node" }, { ipv4: "203.0.113.9" }), "203.0.113.9");
  assert.equal(inboundShareHost({ share_strategy: "listen", listen: "10.0.0.8" }), "10.0.0.8");
  assert.equal(inboundShareHost({ share_strategy: "listen", listen: "0.0.0.0" }, { ipv4: "1.1.1.1" }), "1.1.1.1");
  assert.equal(inboundShareHost({ share_strategy: "node" }, { ipv6: "2001:db8::1" }), "2001:db8::1");
  assert.equal(inboundShareHost({ share_strategy: "other", public_host: "edge.example.com" }), "edge.example.com");
  assert.equal(
    inboundShareHost({ share_strategy: "node" }, { ipv4: "203.0.113.9" }, { domain: "vpn.example.com", status: "issued" }),
    "vpn.example.com",
  );
  assert.equal(
    inboundShareHost({ share_strategy: "node" }, { ipv4: "203.0.113.9" }, { domain: "vpn.example.com", status: "pending" }),
    "203.0.113.9",
  );
  assert.equal(
    inboundShareHost({ share_strategy: "node" }, { ipv4: "203.0.113.9" }, { domain: "abc.com", share_domain: "hk.abc.com", status: "issued" }),
    "hk.abc.com",
  );
  assert.equal(
    inboundShareHost({ share_strategy: "node", tls_domain: "us.abc.com" }, { ipv4: "203.0.113.9" }, { domain: "abc.com", share_domain: "hk.abc.com", status: "issued" }),
    "us.abc.com",
  );
  assert.equal(
    inboundShareHost({ share_strategy: "node" }, { ipv4: "203.0.113.9" }, { domain: "*.abc.com", status: "issued" }),
    "abc.com",
  );
  const dualNode = { ipv4: "203.0.113.9", ipv6: "2001:db8::1" };
  assert.equal(inboundShareHost({ share_strategy: "node", stack: "ipv6" }, dualNode), "2001:db8::1");
  assert.equal(inboundShareHost({ share_strategy: "node", stack: "dual" }, dualNode), "2001:db8::1");
  assert.equal(inboundShareHost({ share_strategy: "node" }, dualNode), "2001:db8::1");
  assert.equal(inboundShareHost({ share_strategy: "node", stack: "ipv4" }, dualNode), "203.0.113.9");
  assert.equal(inboundShareHost({ share_strategy: "node", stack: "ipv6" }, { ipv4: "203.0.113.9" }), "203.0.113.9");
  assert.equal(inboundSharePort({ port: 443, public_port: 8443 }), "8443");
  assert.equal(inboundSharePort({ port: 443 }), "443");
});

test("shadowsocks outbound copy keeps tcp transport", () => {
  const got = outboundFieldsFromInbound(
    {
      protocol: "shadowsocks",
      transport: "tcp,udp",
      ss_method: "aes-128-gcm",
      port: 8388,
      share_strategy: "other",
      public_host: "ss.example.com",
    },
    { ipv4: "ignored" },
  );
  assert.equal(got.protocol, "shadowsocks");
  assert.equal(got.transport, "tcp");
  assert.equal(got.ss_method, "aes-128-gcm");
});

test("copies REALITY inbound fields into an outbound", () => {
  const got = outboundFieldsFromInbound(
    {
      protocol: "vless",
      core: "xray",
      port: 443,
      share_strategy: "other",
      public_host: "edge.example.com",
      transport: "tcp",
      security: "reality",
      flow: "xtls-rprx-vision",
      reality_dest: "www.microsoft.com:443",
      reality_public_key: "pubkey",
      reality_short_id: "abcd",
      spider_x: "/",
      fingerprint: "chrome",
    },
    { ipv4: "ignored" },
  );
  assert.equal(got.protocol, "vless");
  assert.equal(got.address, "edge.example.com");
  assert.equal(got.dest_port, "443");
  assert.equal(got.security, "reality");
  assert.equal(got.sni, "www.microsoft.com");
  assert.equal(got.reality_public_key, "pubkey");
  assert.equal(got.reality_short_id, "abcd");
  assert.equal(got.flow, "xtls-rprx-vision");
  assert.equal(got.ws_path, "");
  assert.equal(got.grpc_service, "");
});

test("reality outbound sni ignores leftover hy2/tls sni", () => {
  const got = outboundFieldsFromInbound(
    {
      protocol: "vless",
      security: "reality",
      sni: "ppfla.8787837.xyz",
      tls_domain: "ppfla.8787837.xyz",
      reality_dest: "addons.mozilla.org:443",
      reality_server_names: "addons.mozilla.org",
      share_strategy: "other",
      public_host: "ppfla.8787837.xyz",
      port: 36325,
    },
    { ipv4: "ignored" },
  );
  assert.equal(got.sni, "addons.mozilla.org");
  assert.equal(got.address, "ppfla.8787837.xyz");
});

test("switching inbound always takes the inbound name as outbound tag", () => {
  assert.equal(outboundTagFromInbound({ name: "US_03" }, ""), "US_03");
  assert.equal(outboundTagFromInbound({ name: "US_03" }, "HK-01-old"), "US_03");
  assert.equal(outboundTagFromInbound({ name: "  JP-01  " }, "US_03"), "JP-01");
  assert.equal(outboundTagFromInbound({ name: "" }, "keep-me"), "keep-me");
  assert.equal(outboundTagFromInbound({}, "keep-me"), "keep-me");
});

test("outbound import copies uuid only from users granted on that inbound", () => {
  const inbound = { id: "in-1", node_uuid: "n1" };
  const granted = { id: "u1", status: "active", inbound_ids: ["in-1"], uuid: "11111111-1111-1111-1111-111111111111" };
  const other = { id: "u2", status: "active", inbound_ids: ["in-2"], uuid: "22222222-2222-2222-2222-222222222222", node_uuid: "n1" };
  assert.equal(uuidForInbound(inbound, [other, granted]), granted.uuid);
  assert.equal(uuidForInbound(inbound, [other]), "");
  assert.equal(uuidForInbound(inbound, [{ ...granted, status: "disabled" }]), "");
});

test("ss outbound password uses string secret or combined 2022 PSK", async () => {
  const granted = {
    id: "u1",
    status: "active",
    inbound_ids: ["ss-1"],
    uuid: "11111111-1111-1111-1111-111111111111",
    credentials: [{ secret: "secret" }],
  };
  const aead = await outboundPasswordFromInbound(
    { id: "ss-1", protocol: "shadowsocks", ss_method: "aes-128-gcm" },
    [granted],
  );
  assert.equal(aead, "secret");
  const method = "2022-blake3-aes-128-gcm";
  const server = "AAAAAAAAAAAAAAAAAAAAAA==";
  const want = await ss2022SharePassword(server, "secret", "ss-1", method);
  const got = await outboundPasswordFromInbound(
    { id: "ss-1", protocol: "shadowsocks", ss_method: method, ss_password: server },
    [granted],
  );
  assert.equal(got, want);
  assert.match(got, /^AAAAAAAAAAAAAAAAAAAAAA==:/);
  assert.equal(await ss2022Key(server, method), server);
  assert.equal(
    await outboundPasswordFromInbound({ id: "ss-1", protocol: "shadowsocks", ss_method: method, ss_password: server }, []),
    "",
  );
});

test("expiry text uses yyyy/mm/dd and round-trips to datetime-local", () => {
  assert.equal(displayExpiryInput("2027-10-24T04:27"), "2027/10/24 04:27");
  assert.equal(normalizeExpiryInput("2027/10/24 04:27"), "2027-10-24T04:27");
  assert.equal(normalizeExpiryInput("yyyy/mm/dd HH:mm"), "yyyy/mm/dd HH:mm");
  assert.equal(normalizeExpiryInput(""), "");
});

test("outbound RPC conflicts map to i18n keys instead of raw English", () => {
  assert.equal(
    nodemgtRpcErrorKey("RPC Error -32602: nodemgt: conflict: outbound tag", "outbound"),
    "nodemgt.outbound_tag_duplicate",
  );
  assert.equal(
    nodemgtRpcErrorKey("RPC Error -32602: nodemgt: conflict: outbound_tag_duplicate", "outbound"),
    "nodemgt.outbound_tag_duplicate",
  );
  assert.equal(
    nodemgtRpcErrorKey("RPC Error -32602: nodemgt: invalid: outbound_tag_reserved", "outbound"),
    "nodemgt.outbound_tag_reserved",
  );
  assert.equal(nodemgtRpcErrorKey("name and node required", "inbound"), "nodemgt.name_node_required");
});

test("admin RPC errors map to nodemgt i18n keys instead of raw English", () => {
  const cases: Array<[string, string, string]> = [
    ["RPC Error -32602: address required", "outbound", "nodemgt.address_required"],
    ["RPC Error -32602: username required", "user", "nodemgt.username_required"],
    ["RPC Error -32602: nodemgt: invalid: user required", "subscription", "nodemgt.user_required"],
    ["RPC Error -32602: domain and node required", "cert", "nodemgt.domain_node_required"],
    ["RPC Error -32602: nodemgt: invalid: outbound required", "route", "nodemgt.route_outbound_required"],
    ["RPC Error -32602: traffic_reset_day must be 0-31", "user", "nodemgt.invalid_reset_day"],
    ["RPC Error -32602: invalid subscription port", "", "nodemgt.invalid_sub_port"],
    ["RPC Error -32602: invalid reverse proxy port", "", "nodemgt.invalid_rp_port"],
    ["RPC Error -32602: invalid inbound port", "inbound", "nodemgt.invalid_inbound_port"],
    ["RPC Error -32602: nodemgt: conflict: certificate is in use", "cert", "nodemgt.cert_in_use"],
    ["RPC Error -32602: subscription path required", "", "nodemgt.sub_path_required"],
    ["RPC Error -32602: certificate required", "inbound", "nodemgt.no_certs"],
    ["RPC Error -32602: nodemgt: not found", "", "nodemgt.not_found"],
    ["RPC Error -32602: nodemgt: quota exceeded", "user", "nodemgt.quota_exceeded"],
    ["RPC Error -32602: nodemgt: user disabled", "user", "nodemgt.user_disabled"],
    ["RPC Error -32602: nodemgt: user expired", "user", "nodemgt.user_expired"],
    ["RPC Error -32602: nodemgt: invalid: plan required", "user", "nodemgt.plan_required"],
    ["RPC Error -32602: nodemgt: invalid: no assignment", "user", "nodemgt.no_assignment"],
    ["RPC Error -32602: nodemgt: invalid: name required", "plan", "nodemgt.name_required"],
    ["RPC Error -32602: ids required", "inbound", "nodemgt.ids_required"],
    ["RPC Error -32602: id required", "cert", "nodemgt.id_required"],
    ["RPC Error -32602: nodemgt: invalid: empty secret", "", "nodemgt.empty_secret"],
    ["RPC Error -32602: cert and key paths required", "cert", "nodemgt.cert_paths_required"],
    ["RPC Error -32602: nodemgt: invalid: csr not allowed for file", "cert", "nodemgt.csr_not_allowed"],
    ["RPC Error -32602: nodemgt: node mismatch: csr cn", "cert", "nodemgt.node_mismatch"],
    ["RPC Error -32602: nodemgt: invalid: unsupported template kind", "", "nodemgt.tpl_unsupported_kind"],
    ["RPC Error -32602: nodemgt: invalid: template name and content required (maximum 1 MiB)", "", "nodemgt.tpl_content_required"],
    ["RPC Error -32602: nodemgt: invalid: create a new template to change its kind", "", "nodemgt.tpl_kind_locked"],
    ["RPC Error -32602: nodemgt: conflict: remove template bindings first", "", "nodemgt.tpl_bound_delete"],
    ["RPC Error -32602: nodemgt: invalid: unsupported template client", "", "nodemgt.tpl_unsupported_client"],
    ["unsupported subscription client", "", "nodemgt.tpl_unsupported_client"],
    ["RPC Error -32602: nodemgt: invalid: template kind does not match client", "", "nodemgt.tpl_kind_mismatch"],
    ["put remote node subscriptions in user extra links instead of proxy-providers", "", "nodemgt.tpl_remote_in_template"],
    ["RPC Error -32603: boom", "", "nodemgt.request_failed"],
    ["admin:nodemgt.inbound.list: RPC Error -32603: timeout", "", "nodemgt.request_failed"],
    ["RPC Error -32603: 站点未启用远程管理", "inbound", "nodemgt.firewall_site_off"],
    ["RPC Error -32603: 当前 Agent 不支持防火墙，请升级", "inbound", "nodemgt.firewall_agent_old"],
    ["RPC Error -32603: 节点未启用远程控制", "inbound", "nodemgt.firewall_remote_off"],
  ];
  for (const [raw, kind, key] of cases) {
    assert.equal(nodemgtRpcErrorKey(raw, kind), key, raw);
  }
  assert.equal(nodemgtErrorMessage("RPC Error -32602: address required", (key) => key), "nodemgt.address_required");
  assert.equal(nodemgtErrorMessage("certificate file not found", (key) => key), "certificate file not found");
  assert.equal(
    nodemgtWarningMessage("probe-in: unsupported by surge (vless)", (key, opts) => `${key}|${opts?.name}|${opts?.client}|${opts?.features}`),
    "nodemgt.warn_unsupported_client|probe-in|surge|vless",
  );
  assert.equal(
    nodemgtWarningMessage("JP VLESS: unsupported by surge (vless/reality)", (key, opts) => `${key}|${opts?.features}`),
    "nodemgt.warn_unsupported_client|vless/reality",
  );
  assert.equal(nodemgtWarningMessage("An external node could not be parsed", (key) => key), "nodemgt.warn_extra_unparsed");
  assert.equal(
    nodemgtWarningMessage("An external node uses a protocol outside Lite-Plus subscription support", (key) => key),
    "nodemgt.warn_extra_unsupported",
  );

  const locales = ["zh_CN", "zh_TW", "en", "ja_JP"];
  const keys = [
    ...new Set(cases.map(([, , key]) => key.replace(/^nodemgt\./, ""))),
    "warn_unsupported_client",
    "warn_extra_unparsed",
    "warn_extra_unsupported",
  ];
  for (const locale of locales) {
    const file = new URL(`../src/i18n/locales/${locale}.json`, import.meta.url);
    const nodemgt = JSON.parse(readFileSync(file, "utf8")).nodemgt;
    for (const key of keys) {
      assert.equal(typeof nodemgt[key], "string", `${locale}.nodemgt.${key}`);
      assert.ok(String(nodemgt[key]).trim(), `${locale}.nodemgt.${key} empty`);
    }
  }
});

test("outbound tags cannot repeat on the same node or use direct/block", () => {
  const rows = [{ id: "a", name: "PPFlight_LAX_GLOBAL_内网落地_中转站", node_uuid: "n1" }];
  assert.equal(outboundTagConflict("PPFlight_LAX_GLOBAL_内网落地_中转站", "n1", rows), "duplicate");
  assert.equal(outboundTagConflict("PPFlight_LAX_GLOBAL_内网落地_中转站", "n1", rows, "a"), "");
  assert.equal(outboundTagConflict("PPFlight_LAX_GLOBAL_内网落地_中转站", "n2", rows), "");
  assert.equal(outboundTagConflict("direct", "n1", rows), "reserved");
  assert.equal(outboundTagConflict("BLOCK", "n1", rows), "reserved");
});

test("reality short ids are 8 lowercase hex characters", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 16; i += 1) {
    const id = randomRealityShortID();
    assert.match(id, /^[0-9a-f]{8}$/);
    seen.add(id);
  }
  assert.ok(seen.size > 1);
});

test("random inbound ports stay in 1024-49151 and skip used values", () => {
  const used = [1024, 443, 49151];
  for (let i = 0; i < 20; i += 1) {
    const port = randomInboundPort(used);
    assert.ok(port >= 1024 && port <= 49151);
    assert.notEqual(port, 1024);
    assert.notEqual(port, 49151);
  }
});

test("subscription arrows swap adjacent inbounds across nodes", () => {
  const rows = [
    { id: "us", sort_index: 4, node_uuid: "cn2" },
    { id: "global", sort_index: 10, node_uuid: "global" },
  ];
  assert.deepEqual(moveAdjacentIDs(rows, "us", 1), ["global", "us"]);
  assert.deepEqual(moveAdjacentIDs(rows, "global", -1), ["global", "us"]);
  assert.equal(moveAdjacentIDs(rows, "us", -1), null);
  assert.equal(moveAdjacentIDs([{ id: "only", sort_index: 1 }], "only", 1), null);
});

test("inbound firewall grant is required only when rules would change", () => {
  assert.equal(inboundNeedsFirewallGrant({ firewall_allow: "true", enabled: "true" }, null), true);
  assert.equal(
    inboundNeedsFirewallGrant(
      { firewall_allow: "true", enabled: "true", port: "443", protocol: "vless", stack: "ipv4", transport: "tcp" },
      { firewall_linked: true, enabled: true, port: 443, protocol: "vless", stack: "ipv4", transport: "tcp" },
    ),
    false,
  );
  assert.equal(
    inboundNeedsFirewallGrant(
      { firewall_allow: "true", enabled: "false", port: "443", protocol: "vless", stack: "ipv4", transport: "tcp" },
      { firewall_linked: true, enabled: true, port: 443, protocol: "vless", stack: "ipv4", transport: "tcp" },
    ),
    true,
  );
  assert.equal(inboundNeedsFirewallGrant({ firewall_allow: "false" }, { firewall_linked: true }), true);
  assert.equal(inboundNeedsFirewallGrant({ firewall_allow: "false" }, { firewall_linked: false }), false);
  assert.equal(inboundNeedsFirewallGrant({ firewall_allow: "true" }, { firewall_linked: true }, false), false);
});

test("inbound firewall availability follows site remote and agent capability", () => {
  assert.equal(inboundFirewallUnavailable({ uuid: "n1", remote_protocol: 2, remote_control_enabled: true, firewall: true, firewall_version: 1 }, false), "site_remote_off");
  assert.equal(inboundFirewallUnavailable(null, true), "no_node");
  assert.equal(inboundFirewallUnavailable({ uuid: "n1", remote_protocol: 1, remote_control_enabled: true }, true), "agent_old");
  assert.equal(inboundFirewallUnavailable({ uuid: "n1", remote_protocol: 2, remote_control_enabled: false, firewall: true, firewall_version: 1 }, true), "remote_off");
  assert.equal(inboundFirewallUnavailable({ uuid: "n1", remote_protocol: 2, remote_control_enabled: true, firewall: false }, true), "agent_old");
  assert.equal(inboundFirewallUnavailable({ uuid: "n1", remote_protocol: 2, remote_control_enabled: true, firewall: true, firewall_version: 1 }, true), "");
  assert.deepEqual(stripFirewallGrantFields({ id: "in-1", next_grant: "x", expires_at: "t" }), { id: "in-1" });
});
