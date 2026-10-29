import assert from "node:assert/strict";
import test from "node:test";

import { parseShareLink } from "../src/pages/admin/nodemgt/shareLink.ts";

test("parses a VLESS REALITY share link", () => {
  const link =
    "vless://11111111-1111-1111-1111-111111111111@example.com:443?type=tcp&security=reality&pbk=pubkey&fp=chrome&sni=www.microsoft.com&flow=xtls-rprx-vision&sid=abcd&spx=/#node-a";
  const got = parseShareLink(link);
  assert.equal(got?.protocol, "vless");
  assert.equal(got?.address, "example.com");
  assert.equal(got?.dest_port, "443");
  assert.equal(got?.uuid, "11111111-1111-1111-1111-111111111111");
  assert.equal(got?.security, "reality");
  assert.equal(got?.transport, "tcp");
  assert.equal(got?.sni, "www.microsoft.com");
  assert.equal(got?.fingerprint, "chrome");
  assert.equal(got?.flow, "xtls-rprx-vision");
  assert.equal(got?.reality_public_key, "pubkey");
  assert.equal(got?.reality_short_id, "abcd");
  assert.equal(got?.spider_x, "/");
  assert.equal(got?.name, "node-a");
});

test("parses vmess and shadowsocks links", () => {
  const vmess = parseShareLink(
    `vmess://${btoa(JSON.stringify({ add: "1.2.3.4", port: 8443, id: "abc", ps: "n1", net: "ws", tls: "tls", path: "/v", host: "cdn.example.com", sni: "cdn.example.com" }))}`,
  );
  assert.equal(vmess?.protocol, "vmess");
  assert.equal(vmess?.address, "1.2.3.4");
  assert.equal(vmess?.dest_port, "8443");
  assert.equal(vmess?.transport, "ws");
  assert.equal(vmess?.security, "tls");
  assert.equal(vmess?.ws_path, "/v");

  const ss = parseShareLink("ss://aes-128-gcm:secret@[2001:db8::1]:8388#ss-node");
  assert.equal(ss?.protocol, "shadowsocks");
  assert.equal(ss?.address, "2001:db8::1");
  assert.equal(ss?.dest_port, "8388");
  assert.equal(ss?.ss_method, "aes-128-gcm");
  assert.equal(ss?.password, "secret");
  assert.equal(ss?.transport, "tcp,udp");

  const ss2022 = parseShareLink(
    "ss://2022-blake3-aes-128-gcm:AAAAAAAAAAAAAAAAAAAAAA==%3AZy%2BxWvU%2FtSrQpOnMlKjIhg==@ss.example.com:8388#US_SS2022",
  );
  assert.equal(ss2022?.protocol, "shadowsocks");
  assert.equal(ss2022?.ss_method, "2022-blake3-aes-128-gcm");
  assert.equal(ss2022?.password, "AAAAAAAAAAAAAAAAAAAAAA==:Zy+xWvU/tSrQpOnMlKjIhg==");
  assert.equal(ss2022?.address, "ss.example.com");
});

test("parses HTTP proxy share links", () => {
  const http = parseShareLink("http://alice:secret@proxy.example.com:8080#sms");
  assert.equal(http?.protocol, "http");
  assert.equal(http?.address, "proxy.example.com");
  assert.equal(http?.dest_port, "8080");
  assert.equal(http?.username, "alice");
  assert.equal(http?.password, "secret");
  assert.equal(http?.security, "none");
  assert.equal(http?.name, "sms");

  const https = parseShareLink("https://alice:secret@proxy.example.com:8443#tls-http");
  assert.equal(https?.protocol, "http");
  assert.equal(https?.security, "tls");
  assert.equal(https?.dest_port, "8443");
});
