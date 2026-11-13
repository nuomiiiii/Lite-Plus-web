import assert from "node:assert/strict";
import test from "node:test";
import { applyLogSourceFormat, defaultSshSource, duplicateSshSource, expandPolicyProtocols, formatProtectionDateTime, normalizeProtectionConfig, preparePolicy, protectionActivityRows, protectionBanActive, protectionBanExpiresForever, protectionBanForever, protectionSshConfigError, rememberedBanDurationSec, rememberedSshSource, servicePorts, sshBindingError } from "../src/pages/admin/remote-management/firewall/protection/model.ts";
import { fetchProtectionView } from "../src/pages/admin/remote-management/firewall/protection/api.ts";
import type { ProtectionPolicy } from "../src/pages/admin/remote-management/firewall/protection/types.ts";

const policy: ProtectionPolicy = { id: "p1", name: " HTTPS ", enabled: true, mode: "enforce", protocol: "tcp", port: "443", syn_rate: 20, syn_burst: 40, conn_limit: 10, source_id: "s1", request_threshold: 100, path_threshold: 5, ban_duration_sec: 600 };

test("service port choices deduplicate address families and retain protocol distinctions", () => {
  const rule = { enabled: true, action: "allow", protocol: "tcp", port: "443", comment: "HTTPS" };
  assert.deepEqual(servicePorts([rule, rule, { ...rule, protocol: "udp" }, { ...rule, enabled: false, port: "80" }, { ...rule, action: "deny", port: "22" }, { ...rule, port: "8000-9000" }]), [
    { name: "HTTPS", protocol: "tcp", port: "443" }, { name: "HTTPS", protocol: "udp", port: "443" },
  ]);
});

test("missing collections normalize without losing persisted settings", () => {
  assert.deepEqual(normalizeProtectionConfig(), { revision: 0, enabled: false, runtime_enabled: false, sources: [], policies: [], whitelist: [] });
  assert.equal(normalizeProtectionConfig({ revision: 7, enabled: true, runtime_enabled: true }).revision, 7);
});

test("turning off detection removes its active thresholds from the saved policy", () => {
  const saved = preparePolicy(policy, false, false, "/.env", []);
  assert.equal(saved.syn_rate, 0); assert.equal(saved.conn_limit, 0); assert.equal(saved.request_threshold, 0);
  assert.equal(saved.path_threshold, 0); assert.equal(saved.source_id, ""); assert.deepEqual(saved.paths, []);
  assert.equal(policy.syn_rate, 20); assert.equal(policy.request_threshold, 100);
  assert.equal(saved.ban_duration_sec, 600);
});

test("proxy logs force observation; direct logs preserve enforcement and paths", () => {
  const source = { id: "s1", path: "/var/log/nginx/access.log", format: "nginx_combined", deploy_mode: "proxy" };
  assert.equal(preparePolicy(policy, true, true, "/.env", [source]).mode, "observe");
  const saved = preparePolicy(policy, true, true, " /.env \n\n /.git/*\n", [{ ...source, deploy_mode: "direct" }]);
  assert.equal(saved.mode, "enforce"); assert.deepEqual(saved.paths, ["/.env", "/.git/*"]); assert.equal(saved.name, "HTTPS");
  assert.equal(preparePolicy({ ...policy, protocol: "udp" }, true, true, "", [source]).conn_limit, 0);
});

test("view requests forward cancellation to fetch", async () => {
  const controller = new AbortController();
  const originalFetch = globalThis.fetch;
  let passedSignal: AbortSignal | null | undefined;
  try {
    globalThis.fetch = async (_url, options) => { passedSignal = options?.signal; return Response.json({ data: { uuid: "node" } }); };
    assert.equal((await fetchProtectionView("node", controller.signal)).uuid, "node");
    assert.equal(passedSignal, controller.signal);
    controller.abort(); assert.equal(passedSignal?.aborted, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("TCP/UDP saves two independent policies and keeps TCP detection on TCP", () => {
  const draft = { ...policy, protocol: "both" };
  const prepared = preparePolicy(draft, true, true, "/.env", []);
  const saved = expandPolicyProtocols(prepared, "udp-policy");
  assert.deepEqual(saved.map((item) => [item.id, item.protocol]), [["p1", "tcp"], ["udp-policy", "udp"]]);
  assert.equal(saved[0].conn_limit, 10); assert.equal(saved[0].request_threshold, 100);
  assert.deepEqual(saved[0].paths, ["/.env"]);
  assert.equal(saved[1].conn_limit, 0); assert.equal(saved[1].syn_rate, 0); assert.equal(saved[1].syn_burst, 0);
  assert.equal(saved[1].request_threshold, 0); assert.equal(saved[1].path_threshold, 0); assert.equal(saved[1].source_id, "");
  assert.deepEqual(saved[1].paths, []);
  assert.equal(saved[1].port, saved[0].port); assert.equal(saved[1].mode, saved[0].mode);
  assert.equal(draft.protocol, "both"); assert.equal(draft.conn_limit, 10);
});

test("sshd log sources keep failure thresholds and drop HTTP path rules", () => {
  const source = { id: "s1", path: "journal:sshd", format: "sshd", deploy_mode: "direct", bind_port: "12560" };
  const saved = preparePolicy({ ...policy, port: "12560", request_threshold: 3, path_threshold: 8 }, false, true, "/.env", [source]);
  assert.equal(saved.request_threshold, 3);
  assert.equal(saved.path_threshold, 0);
  assert.deepEqual(saved.paths, []);
  assert.equal(saved.source_id, "s1");
});

test("sshd sources reject a second journal or a mismatched policy port", () => {
  const source = { id: "s1", path: "journal:sshd", format: "sshd", deploy_mode: "direct", bind_port: "12560" };
  const nginx = { id: "n1", path: "/var/log/nginx/access.log", format: "nginx_combined", bind_protocol: "tcp", bind_port: "443" };
  const caddy = { id: "c1", path: "/var/log/caddy/access.log", format: "caddy_json" };
  assert.equal(sshBindingError({ ...policy, port: "12560", source_id: "s1" }, [source]), "");
  assert.equal(sshBindingError({ ...policy, port: "22", source_id: "s1" }, [source]), "ssh_port_mismatch");
  assert.equal(sshBindingError({ ...policy, port: "22", source_id: "", request_threshold: 3 }, [source]), "ssh_port_mismatch");
  assert.equal(sshBindingError({ ...policy, port: "443", source_id: "", request_threshold: 20 }, [source, nginx]), "");
  assert.equal(sshBindingError({ ...policy, port: "22", source_id: "", request_threshold: 3 }, [source, nginx]), "ssh_port_mismatch");
  assert.equal(sshBindingError({ ...policy, port: "443", source_id: "", request_threshold: 20 }, [source, caddy]), "ssh_port_mismatch");
  assert.equal(sshBindingError({ ...policy, port: "22", source_id: "", request_threshold: 3 }, [source, caddy]), "ssh_port_mismatch");
  assert.equal(duplicateSshSource([source], { id: "s2", path: "/var/log/auth.log", format: "sshd", bind_port: "12560" }), true);
  assert.equal(duplicateSshSource([source], source), false);
  assert.equal(protectionSshConfigError({ sources: [source], policies: [{ ...policy, port: "12560", source_id: "s1" }] }), "");
  assert.equal(protectionSshConfigError({ sources: [source, { id: "s2", path: "/var/log/auth.log", format: "sshd", bind_port: "12560" }] }), "ssh_duplicate_source");
  assert.equal(protectionSshConfigError({ sources: [source], policies: [{ ...policy, port: "22", source_id: "s1" }] }), "ssh_port_mismatch");
  assert.equal(protectionSshConfigError({ sources: [source], policies: [{ ...policy, port: "22", source_id: "", request_threshold: 3, request_window_sec: 60 }] }), "ssh_port_mismatch");
  assert.equal(protectionSshConfigError({ sources: [source, nginx], policies: [{ ...policy, port: "443", source_id: "", request_threshold: 20, request_window_sec: 60 }] }), "");
});

test("new sshd sources fill the detected log path and this node's SSH port", () => {
  assert.deepEqual(defaultSshSource("s1", "22", "/var/log/auth.log"), {
    id: "s1", format: "sshd", path: "/var/log/auth.log", deploy_mode: "direct", bind_protocol: "tcp", bind_port: "22",
  });
  assert.equal(defaultSshSource("s2", " 12560 ", "  ").path, "journal:sshd");
  assert.equal(defaultSshSource("s2", " 12560 ", "  ").bind_port, "12560");
  assert.equal(defaultSshSource("s3").path, "journal:sshd");
  assert.equal(defaultSshSource("s3").bind_port, "");
});

test("switching away from sshd and back restores the remembered path instead of the suggestion", () => {
  const nginx = { id: "s1", format: "nginx_combined", path: "/var/log/nginx/access.log", deploy_mode: "direct", bind_protocol: "tcp", bind_port: "443" };
  const first = applyLogSourceFormat(nginx, "sshd", { path: "", bind_port: "" }, "/var/log/auth.log", "22");
  assert.equal(first.next.path, "/var/log/auth.log");
  assert.equal(first.next.bind_port, "22");
  const edited = { ...first.next, path: "/opt/logs/sshd.log", bind_port: "2222" };
  const away = applyLogSourceFormat(edited, "nginx_combined", first.remembered, "/var/log/auth.log", "22");
  assert.equal(away.remembered.path, "/opt/logs/sshd.log");
  assert.equal(away.remembered.bind_port, "2222");
  assert.equal(away.next.format, "nginx_combined");
  const back = applyLogSourceFormat(away.next, "sshd", away.remembered, "/var/log/auth.log", "22");
  assert.equal(back.next.path, "/opt/logs/sshd.log");
  assert.equal(back.next.bind_port, "2222");
  const existing = { id: "s2", format: "sshd", path: "/var/log/secure", deploy_mode: "direct", bind_protocol: "tcp", bind_port: "12560" };
  const fromSaved = applyLogSourceFormat(existing, "caddy_json", rememberedSshSource(existing), "/var/log/auth.log", "22");
  const restored = applyLogSourceFormat(fromSaved.next, "sshd", fromSaved.remembered, "/var/log/auth.log", "22");
  assert.equal(restored.next.path, "/var/log/secure");
  assert.equal(restored.next.bind_port, "12560");
});

test("enforce hits stay bans or expired instead of observe-only leftovers", () => {
  const now = Date.parse("2026-11-13T00:58:00Z");
  const expired = { ban_id: "b1", event_id: "e1", ip: "50.118.167.31", status: "active", created_at: "2026-11-12T15:25:10Z", expires_at: "2026-11-12T15:35:10Z", policy_id: "p1", reason_type: "ssh_auth" };
  const active = { ban_id: "b2", event_id: "e2", ip: "1.2.3.4", status: "active", created_at: "2026-11-13T00:50:00Z", expires_at: "2026-11-13T01:00:00Z", policy_id: "p1", reason_type: "ssh_auth" };
  const revoked = { ban_id: "b3", event_id: "e3", ip: "8.8.8.8", status: "revoked", created_at: "2026-11-12T10:00:00Z", expires_at: "2026-11-13T10:00:00Z", policy_id: "p1", reason_type: "ssh_auth" };
  const observe = { event_id: "e4", ip: "9.9.9.9", policy_id: "p1", reason_type: "ssh_auth", created_at: "2026-11-12T15:33:19Z" };
  assert.equal(protectionBanActive(expired, now), false);
  assert.equal(protectionBanActive(active, now), true);
  assert.equal(protectionBanActive(revoked, now), false);
  const rows = protectionActivityRows({
    bans: [expired, active, revoked],
    observe_hits: [
      { event_id: "e1", ip: expired.ip, policy_id: "p1", reason_type: "ssh_auth", created_at: expired.created_at },
      { event_id: "e2", ip: active.ip, policy_id: "p1", reason_type: "ssh_auth", created_at: active.created_at },
      observe,
    ],
  }, now);
  assert.deepEqual(rows.map((row) => [row.kind, row.ip, Boolean(row.ban), Boolean(row.revoked)]), [
    ["ban", "1.2.3.4", true, false],
    ["observe", "9.9.9.9", false, false],
    ["expired", "50.118.167.31", false, false],
    ["expired", "8.8.8.8", false, true],
  ]);
});

test("nginx and caddy enforce leftovers use the same ban history as ssh", () => {
  const now = Date.parse("2026-11-13T00:58:00Z");
  const rate = { ban_id: "b-rate", event_id: "e-rate", ip: "203.0.113.10", status: "active", created_at: "2026-11-12T15:25:10Z", expires_at: "2026-11-12T15:35:10Z", policy_id: "p-http", reason_type: "request_rate" };
  const path = { ban_id: "b-path", event_id: "e-path", ip: "203.0.113.10", status: "active", created_at: "2026-11-12T15:26:10Z", expires_at: "2026-11-12T15:36:10Z", policy_id: "p-http", reason_type: "path_scan" };
  const rows = protectionActivityRows({
    bans: [rate, path],
    observe_hits: [
      { event_id: "e-rate", ip: rate.ip, policy_id: "p-http", reason_type: "request_rate", created_at: rate.created_at },
      { event_id: "e-path", ip: path.ip, policy_id: "p-http", reason_type: "path_scan", created_at: path.created_at },
      { event_id: "e-obs", ip: "198.51.100.8", policy_id: "p-http", reason_type: "request_rate", created_at: "2026-11-12T15:40:00Z" },
    ],
  }, now);
  assert.deepEqual(rows.map((row) => [row.kind, row.reason, Boolean(row.ban)]), [
    ["observe", "request_rate", false],
    ["expired", "path_scan", false],
    ["expired", "request_rate", false],
  ]);
});

test("permanent ban duration uses a sentinel and far-future expiry", () => {
  assert.equal(protectionBanForever(-1), true);
  assert.equal(protectionBanForever(600), false);
  assert.equal(protectionBanForever(0), false);
  assert.equal(protectionBanExpiresForever("9999-12-31T23:59:59.000Z"), true);
  assert.equal(protectionBanExpiresForever("2026-11-12T00:00:00.000Z"), false);
  assert.equal(rememberedBanDurationSec(1200), 1200);
  assert.equal(rememberedBanDurationSec(-1), 600);
  assert.equal(rememberedBanDurationSec(0), 600);
});

test("single protocols stay single and UDP does not save unsupported log detection", () => {
  assert.deepEqual(expandPolicyProtocols(policy, "unused"), [policy]);
  const udp = preparePolicy({ ...policy, protocol: "udp" }, true, true, "/.env", []);
  assert.equal(udp.source_id, ""); assert.equal(udp.request_threshold, 0); assert.equal(udp.path_threshold, 0);
  assert.deepEqual(udp.paths, []);
  assert.equal(expandPolicyProtocols(udp, "unused").length, 1);
});

test("protection timestamps keep calendar date and clock without ISO T or Z", () => {
  assert.equal(formatProtectionDateTime("2026-11-01T15:27:32Z"), "2026-11-01 15:27:32");
  assert.equal(formatProtectionDateTime("2026-11-01T15:27:32.123Z"), "2026-11-01 15:27:32");
  assert.equal(formatProtectionDateTime("2026-11-01 15:27:32"), "2026-11-01 15:27:32");
  assert.equal(formatProtectionDateTime(""), "");
  assert.equal(formatProtectionDateTime("not-a-date"), "not-a-date");
});
