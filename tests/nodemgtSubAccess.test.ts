import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/pages/admin/nodemgt/index.tsx", import.meta.url), "utf8");
const preview = readFileSync(new URL("../src/pages/admin/nodemgt/subPreview.tsx", import.meta.url), "utf8");
const zh = readFileSync(new URL("../src/i18n/locales/zh_CN.json", import.meta.url), "utf8");

test("empty subscription listen port stays blank instead of showing 0", () => {
  assert.match(page, /sub_listen_port: Number\(settingRow\?\.sub_listen_port \|\| 0\) > 0 \? str\(settingRow\?\.sub_listen_port\) : ""/);
  assert.match(page, /sub_listen_port: Number\(nextCfg\.sub_listen_port \|\| 0\)/);
  assert.match(zh, /填写后，订阅监听该端口/);
  assert.doesNotMatch(zh, /0 表示不单独开端口/);
});

test("empty subscription public host stays blank instead of showing a sample address", () => {
  const start = page.indexOf('label={t("nodemgt.sub_public_host")}');
  const fieldBlock = page.slice(start, page.indexOf("/>", start));
  assert.match(fieldBlock, /value=\{subCfg\.sub_public_host\}/);
  assert.doesNotMatch(fieldBlock, /placeholder=/);
  assert.doesNotMatch(fieldBlock, /203\.0\.113\.9/);
  assert.match(page, /sub_public_host: str\(settingRow\?\.sub_public_host, ""\)/);
});

test("subscription and user preview actions use a QR icon instead of text", () => {
  assert.match(page, /aria-label=\{t\("nodemgt\.preview"\)\}/);
  assert.match(page, /<QrCode size=\{16\} \/>/);
  assert.doesNotMatch(page, /<Button size="small" onClick=\{\(\) => void previewSub\(row\.id\)\}>\{t\("nodemgt\.preview"\)\}<\/Button>/);
  assert.doesNotMatch(page, /<Button size="small" onClick=\{\(\) => void renew\(row\.id\)\}>\{t\("nodemgt\.renew"\)\}<\/Button>/);
});

test("subscription preview copies use the HTTP clipboard fallback", () => {
  assert.match(page, /import \{ writeClipboardText \} from "@\/utils\/clipboard"/);
  assert.match(page, /await writeClipboardText\(url\)/);
  assert.match(page, /writeClipboardText\(text\)/);
  assert.doesNotMatch(page, /navigator\.clipboard\.writeText/);
  assert.match(preview, /import \{ writeClipboardText \} from "@\/utils\/clipboard"/);
  assert.match(preview, /writeClipboardText\(value\)/);
  assert.doesNotMatch(preview, /navigator\.clipboard\.writeText/);
});
