import assert from "node:assert/strict";
import test from "node:test";
import { parsePreviewLinks, subscriptionTargetURL } from "../src/pages/admin/nodemgt/subscriptionClients.ts";

test("preview decodes UTF-8 subscription nodes without treating rule and DNS URLs as nodes", () => {
  const link = "trojan://test@node.example:443#香港";
  assert.deepEqual(parsePreviewLinks(Buffer.from(link).toString("base64")), [link]);
  assert.deepEqual(parsePreviewLinks(`${link}\nhttps://rules.example/list\nhttps://dns.example/dns-query`), [link]);
  assert.deepEqual(parsePreviewLinks("http://user:pass@proxy.example:8080"), ["http://user:pass@proxy.example:8080"]);
  assert.deepEqual(parsePreviewLinks("not base64"), []);
  assert.deepEqual(parsePreviewLinks(""), []);
});

test("client links preserve subscription tokens, existing query parameters and relative paths", () => {
  assert.equal(subscriptionTargetURL("https://sub.example/private/token?x=1", "loon"), "https://sub.example/private/token?x=1&target=loon");
  assert.equal(subscriptionTargetURL("/private/token", "mihomo"), "/private/token?target=mihomo");
  assert.equal(subscriptionTargetURL("/private/token?target=surge", "loon"), "/private/token?target=loon");
  assert.equal(subscriptionTargetURL("", "loon"), "");
  assert.equal(subscriptionTargetURL("/private/token", ""), "/private/token");
});
