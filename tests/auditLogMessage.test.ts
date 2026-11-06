import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { formatAuditMessage } from "../src/pages/admin/auditLogMessage.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function locale(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(root, "src", "i18n", "locales", name), "utf8"),
  ) as Record<string, unknown>;
}

function lookup(source: Record<string, unknown>, key: string): string {
  const value = key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
  if (typeof value !== "string") throw new Error("missing " + key);
  return value;
}

function translate(source: Record<string, unknown>) {
  return (key: string, options?: Record<string, unknown>) => {
    let text = lookup(source, key);
    if (options) {
      for (const [name, value] of Object.entries(options)) {
        text = text.replaceAll("{{" + name + "}}", String(value));
      }
    }
    return text;
  };
}

test("setting logs use the on-screen name in every language", () => {
  const message = JSON.stringify({
    k: "audit.bool_on",
    p: { setting: "allow_mcp" },
  });
  const expected = {
    "zh_CN.json": "开启了「启用 MCP 代理」",
    "en.json": "Turned on Enable MCP Proxy",
    "ja_JP.json": "「MCP プロキシを有効にする」をオンにしました",
    "zh_TW.json": "已啟用「啟用 MCP 服務」",
  };
  for (const [filename, sentence] of Object.entries(expected)) {
    const text = formatAuditMessage(message, translate(locale(filename)));
    assert.equal(text, sentence, filename);
  }
});

test("log types use the current language", () => {
  const expected = {
    "zh_CN.json": "错误",
    "en.json": "Error",
    "ja_JP.json": "エラー",
    "zh_TW.json": "錯誤",
  };
  for (const [filename, label] of Object.entries(expected)) {
    assert.equal(lookup(locale(filename), "logs.types.error"), label, filename);
    assert.equal(lookup(locale(filename), "logs.types.warn"), filename.startsWith("en") ? "Warning" : lookup(locale(filename), "logs.types.warn"));
  }
  assert.equal(lookup(locale("zh_CN.json"), "logs.types.warn"), "警告");
  assert.equal(lookup(locale("zh_TW.json"), "logs.types.terminal"), "終端機");
  assert.equal(lookup(locale("ja_JP.json"), "logs.types.login"), "ログイン");
});

test("older plain log lines stay unchanged", () => {
  const message = "update settings: allow_mcp";
  assert.equal(
    formatAuditMessage(message, translate(locale("zh_CN.json"))),
    message,
  );
});

test("secret logs do not gain a value while changing language", () => {
  const message = JSON.stringify({
    k: "audit.secret_replace",
    p: { setting: "api_key" },
  });
  const text = formatAuditMessage(message, translate(locale("zh_CN.json")));
  assert.equal(text, "更换了「站点 API 密钥」");
});

test("theme update logs show counts in every language", () => {
  const message = JSON.stringify({
    k: "audit.theme_update_all",
    p: { updated: "1", current: "2", skipped: "3", failed: "0" },
  });
  const expected = {
    "zh_CN.json": "执行了主题一键更新：更新 1 个，已是最新 2 个，跳过 3 个，失败 0 个",
    "en.json": "Ran a one-click theme update: 1 updated, 2 already current, 3 skipped, 0 failed",
    "ja_JP.json": "テーマの一括更新を実行しました。更新 1 件、最新 2 件、スキップ 3 件、失敗 0 件",
    "zh_TW.json": "執行了主題一鍵更新：更新 1 個，已是最新 2 個，跳過 3 個，失敗 0 個",
  };
  for (const [filename, sentence] of Object.entries(expected)) {
    assert.equal(
      formatAuditMessage(message, translate(locale(filename))),
      sentence,
      filename,
    );
  }
});

test("node management logs use the current language", () => {
  const message = JSON.stringify({
    k: "audit.nodemgt_chain_upsert",
    p: { name: "GreenCloud_SG_互联网落地" },
  });
  const expected = {
    "zh_CN.json": "保存了转发「GreenCloud_SG_互联网落地」",
    "en.json": "Saved forwarding chain GreenCloud_SG_互联网落地",
    "ja_JP.json": "転送「GreenCloud_SG_互联网落地」を保存しました",
    "zh_TW.json": "已儲存轉發「GreenCloud_SG_互联网落地」",
  };
  for (const [filename, sentence] of Object.entries(expected)) {
    assert.equal(
      formatAuditMessage(message, translate(locale(filename))),
      sentence,
      filename,
    );
  }
  assert.equal(lookup(locale("zh_CN.json"), "logs.types.nodemgt"), "节点管理");
  assert.equal(lookup(locale("en.json"), "logs.types.nodemgt"), "Node management");
  assert.equal(lookup(locale("ja_JP.json"), "logs.types.nodemgt"), "ノード管理");
  assert.equal(lookup(locale("zh_TW.json"), "logs.types.nodemgt"), "節點管理");
});

test("node outbound stack logs use the on-screen labels", () => {
  const stacks = {
    dual: {
      "zh_CN.json": "将节点「sg-1」的出站地址族设为「双栈」",
      "en.json": "Set the outbound IP stack of sg-1 to Dual stack",
      "ja_JP.json": "ノード「sg-1」の出方向アドレス族を「デュアルスタック」に設定しました",
      "zh_TW.json": "已將節點「sg-1」的出站位址族設為「雙棧」",
    },
    ipv4: {
      "zh_CN.json": "将节点「sg-1」的出站地址族设为「仅 IPv4」",
      "en.json": "Set the outbound IP stack of sg-1 to IPv4 only",
      "ja_JP.json": "ノード「sg-1」の出方向アドレス族を「IPv4 のみ」に設定しました",
      "zh_TW.json": "已將節點「sg-1」的出站位址族設為「僅 IPv4」",
    },
    ipv6: {
      "zh_CN.json": "将节点「sg-1」的出站地址族设为「仅 IPv6」",
      "en.json": "Set the outbound IP stack of sg-1 to IPv6 only",
      "ja_JP.json": "ノード「sg-1」の出方向アドレス族を「IPv6 のみ」に設定しました",
      "zh_TW.json": "已將節點「sg-1」的出站位址族設為「僅 IPv6」",
    },
    prefer_ipv4: {
      "zh_CN.json": "将节点「sg-1」的出站地址族设为「IPv4 优先」",
      "en.json": "Set the outbound IP stack of sg-1 to Prefer IPv4",
      "ja_JP.json": "ノード「sg-1」の出方向アドレス族を「IPv4 優先」に設定しました",
      "zh_TW.json": "已將節點「sg-1」的出站位址族設為「IPv4 優先」",
    },
    prefer_ipv6: {
      "zh_CN.json": "将节点「sg-1」的出站地址族设为「IPv6 优先」",
      "en.json": "Set the outbound IP stack of sg-1 to Prefer IPv6",
      "ja_JP.json": "ノード「sg-1」の出方向アドレス族を「IPv6 優先」に設定しました",
      "zh_TW.json": "已將節點「sg-1」的出站位址族設為「IPv6 優先」",
    },
  };
  for (const [stack, expected] of Object.entries(stacks)) {
    const message = JSON.stringify({
      k: "audit.nodemgt_node_upsert",
      p: { name: "sg-1", stack },
    });
    for (const [filename, sentence] of Object.entries(expected)) {
      assert.equal(
        formatAuditMessage(message, translate(locale(filename))),
        sentence,
        `${stack} ${filename}`,
      );
    }
  }
});

test("node management delete and status logs use the current language", () => {
  assert.equal(
    formatAuditMessage(
      JSON.stringify({
        k: "audit.nodemgt_node_upsert",
        p: {
          name: "dual",
          target: "649d9340-f920-4329-ad36-0fff0d10610c",
        },
      }),
      translate(locale("zh_CN.json")),
    ),
    "将节点「649d9340-f920-4329-ad36-0fff0d10610c」的出站地址族设为「双栈」",
  );
  assert.equal(
    formatAuditMessage(
      JSON.stringify({
        k: "audit.nodemgt_node_upsert",
        p: {
          name: "dual",
          target: "649d9340-f920-4329-ad36-0fff0d10610c",
        },
      }),
      translate(locale("zh_CN.json")),
      {
        nodeName: (uuid) =>
          uuid === "649d9340-f920-4329-ad36-0fff0d10610c" ? "sg-1" : uuid,
      },
    ),
    "将节点「sg-1」的出站地址族设为「双栈」",
  );
  assert.equal(
    formatAuditMessage(
      JSON.stringify({
        k: "audit.nodemgt_settings_set",
        p: { settings: "sub_path,sub_listen_port" },
      }),
      translate(locale("zh_CN.json")),
    ),
    "保存了节点管理设置「URL 路径、监听端口」",
  );
  assert.equal(
    formatAuditMessage(
      JSON.stringify({ k: "audit.nodemgt_settings_set", p: {} }),
      translate(locale("zh_CN.json")),
    ),
    "保存了节点管理设置",
  );
  assert.equal(
    formatAuditMessage(
      JSON.stringify({
        k: "audit.nodemgt_subscription_upsert",
        p: { name: "alice" },
      }),
      translate(locale("zh_CN.json")),
    ),
    "保存了用户「alice」的订阅",
  );
  const plan = JSON.stringify({
    k: "audit.nodemgt_plan_delete",
    p: { name: "标准套餐" },
  });
  assert.equal(
    formatAuditMessage(plan, translate(locale("zh_CN.json"))),
    "删除了套餐「标准套餐」",
  );
  const sub = JSON.stringify({
    k: "audit.nodemgt_subscription_delete",
    p: { name: "alice" },
  });
  const subExpected = {
    "zh_CN.json": "删除了用户「alice」的订阅",
    "en.json": "Deleted the subscription for alice",
    "ja_JP.json": "ユーザー「alice」のサブスクリプションを削除しました",
    "zh_TW.json": "已移除使用者「alice」的訂閱",
  };
  for (const [filename, sentence] of Object.entries(subExpected)) {
    assert.equal(
      formatAuditMessage(sub, translate(locale(filename))),
      sentence,
      filename,
    );
  }
  const status = JSON.stringify({
    k: "audit.nodemgt_user_set_status",
    p: { name: "alice", status: "expired" },
  });
  const statusExpected = {
    "zh_CN.json": "将用户「alice」设为「到期」",
    "en.json": "Set user alice to Expired",
    "ja_JP.json": "ユーザー「alice」を「期限切れ」に設定しました",
    "zh_TW.json": "已將使用者「alice」設為「到期」",
  };
  for (const [filename, sentence] of Object.entries(statusExpected)) {
    assert.equal(
      formatAuditMessage(status, translate(locale(filename))),
      sentence,
      filename,
    );
  }
});

test("command clipboard logs show the command name", () => {
  const message = JSON.stringify({
    k: "audit.clipboard_delete",
    p: { name: "test·" },
  });
  assert.equal(
    formatAuditMessage(message, translate(locale("zh_CN.json"))),
    "删除了命令剪贴板「test·」",
  );
  const older = JSON.stringify({
    k: "audit.clipboard_update",
    p: { id: "3" },
  });
  assert.equal(
    formatAuditMessage(older, translate(locale("zh_CN.json"))),
    "修改了命令剪贴板「#3」",
  );
});
