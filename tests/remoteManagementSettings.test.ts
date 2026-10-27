import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isAllowMCPEnabled,
  isAllowRemoteManagementEnabled,
  isMCPManagementPath,
  isRemoteManagementPath,
} from "../src/utils/allowRemoteManagement.ts";

const generalSource = readFileSync("src/pages/admin/settings/general.tsx", "utf8");
const gateSource = readFileSync(
  "src/components/admin/RemoteManagementGate.tsx",
  "utf8",
);
const sidebarSource = readFileSync(
  "src/components/admin/shell/AdminSidebar.tsx",
  "utf8",
);
const execSource = readFileSync("src/pages/admin/exec.tsx", "utf8");
const mcpSource = readFileSync("src/pages/admin/remote-management/mcp.tsx", "utf8");
const xtermSource = readFileSync("src/pages/admin/settings/xtermjs.tsx", "utf8");
const terminalSource = readFileSync("src/pages/terminal/index.tsx", "utf8");
const layoutSource = readFileSync("src/pages/admin/_layout.tsx", "utf8");
const serversSource = readFileSync("src/pages/admin/index.tsx", "utf8");
const nodeDetailSource = readFileSync("src/pages/admin/NodeDetailPage.tsx", "utf8");
const locales = {
  zhCN: JSON.parse(readFileSync("src/i18n/locales/zh_CN.json", "utf8")),
  zhTW: JSON.parse(readFileSync("src/i18n/locales/zh_TW.json", "utf8")),
  en: JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8")),
  ja: JSON.parse(readFileSync("src/i18n/locales/ja_JP.json", "utf8")),
};

test("remote management sits beside GeoIP under general settings", () => {
  const remoteIndex = generalSource.indexOf('id="remote-management"');
  const pageSizeIndex = generalSource.indexOf(
    "settings.general.admin_default_page_size",
  );
  const geoipIndex = generalSource.indexOf("settings.geoip.title");
  assert.ok(remoteIndex > pageSizeIndex);
  assert.ok(geoipIndex > remoteIndex);
  assert.match(generalSource, /navigation\.remote_management/);
  assert.doesNotMatch(
    generalSource.slice(geoipIndex),
    /settings\.general\.allow_remote_management/,
  );
});

test("remote management pages stop immediately when the site switch is turned off", () => {
  const apiSource = readFileSync("src/lib/api.ts", "utf8");
  const syncSource = readFileSync("src/utils/adminSettingsSync.ts", "utf8");
  assert.match(apiSource, /notifyAdminSettingsChanged\(\)/);
  assert.match(apiSource, /subscribeAdminSettingsChanged/);
  assert.doesNotMatch(syncSource, /lite\.remote-grant/);
  assert.doesNotMatch(syncSource, /setItem\(ADMIN_SETTINGS_SYNC_KEY, .*grant/);
  assert.match(gateSource, /clearStoredRemoteGrant\(\)/);
  assert.match(gateSource, /setInterval\(refresh, 2_000\)/);
  assert.match(gateSource, /visibilitychange/);
});

test("the remote switch writes back into settings so leaving the page keeps the new value", () => {
  assert.match(
    generalSource,
    /allow_remote_management: checked[\s\S]*setSettings\(\(current\) => \(\{[\s\S]*allow_remote_management: checked/,
  );
});

test("MCP site switch sits with remote management and writes back into settings", () => {
  const remoteIndex = generalSource.indexOf('id="remote-management"');
  const mcpIndex = generalSource.indexOf("settings.general.allow_mcp");
  const geoipIndex = generalSource.indexOf("settings.geoip.title");
  assert.ok(mcpIndex > remoteIndex);
  assert.ok(geoipIndex > mcpIndex);
  assert.match(
    generalSource,
    /allow_mcp: checked[\s\S]*setSettings\(\(current\) => \(\{[\s\S]*allow_mcp: checked/,
  );
  assert.doesNotMatch(mcpSource, />\{node\.uuid\}</);
  assert.match(mcpSource, /nodeDisplayIP/);
  assert.doesNotMatch(mcpSource, /SettingCardSwitch/);
  assert.doesNotMatch(mcpSource, /mcp\.enable/);
  assert.doesNotMatch(mcpSource, /data\.requests\?\.\[0\]\?\.id/);
  assert.doesNotMatch(mcpSource, /onSelectRequest/);
  assert.doesNotMatch(mcpSource, /t\("mcp\.select"\)/);
  assert.match(mcpSource, /mcp\.view_requests_subtitle/);
  assert.match(mcpSource, /mcp\.new_authorization/);
  assert.match(mcpSource, /mcp\.awaiting_authorize/);
  const pendingBlock = mcpSource.match(/pendingRequests\.map\([\s\S]*?mcp\.deny/);
  assert.ok(pendingBlock);
  assert.doesNotMatch(pendingBlock[0], /t\("mcp\.select"\)/);
  assert.match(pendingBlock[0], /mcp\.deny/);
  assert.doesNotMatch(mcpSource, /mcp\.account_verify/);
  assert.doesNotMatch(mcpSource, /mcp\.waiting_for_client/);
  assert.match(mcpSource, /mcp\.connect_from_client/);
  assert.match(mcpSource, /mcp\.node_need_remote/);
  assert.match(mcpSource, /mcp\.node_need_agent/);
  assert.match(mcpSource, /function mcpUserMessage/);
  assert.match(mcpSource, /does not support MCP full management/);
  assert.match(mcpSource, /function NodeUnavailableBadge/);
});

test("MCP page matches the access-settings layout instead of stacked setting cards", () => {
  assert.match(mcpSource, /p-0 md:p-4/);
  assert.match(mcpSource, /ADMIN_LIST_ACTION_SX/);
  assert.match(mcpSource, /mcp\.connect_ai/);
  assert.match(mcpSource, /mcp\.auth_settings/);
  assert.match(mcpSource, /mcp\.copy_endpoint/);
  assert.match(mcpSource, /mcp\.view_guide/);
  assert.match(mcpSource, /MCP_USER_MANUAL_URL[\s\S]*?color: "error\.main"/);
  assert.match(mcpSource, /<AdminNodeLiveDataProvider>/);
  assert.match(mcpSource, /MCP_USER_MANUAL_URL/);
  assert.match(mcpSource, /Lite-document\/remote\/mcp/);
  assert.doesNotMatch(mcpSource, /MCPClientConfigDialog/);
  assert.match(mcpSource, /mcp\.current_authorizations/);
  assert.match(mcpSource, /mcp\.view_all/);
  assert.match(mcpSource, /mcp\.revoke_authorization/);
  assert.doesNotMatch(mcpSource, /mcp\.full_mode_chip/);
  assert.doesNotMatch(mcpSource, /mcp\.remote_mcp/);
  assert.doesNotMatch(mcpSource, /mcp\.site_remote_on/);
  assert.match(mcpSource, /RequireAllowMCP/);
});

test("MCP authorized dialog copies the approve callback URL", () => {
  assert.match(mcpSource, /deliverOAuthCallback\(uri\);\s*setAuthorizedRedirectURI\(uri\);\s*setAuthorizedOpen\(true\)/);
  assert.match(mcpSource, /redirectURI=\{authorizedRedirectURI\}/);
  assert.match(mcpSource, /setAuthorizedRedirectURI\(""\)/);
  assert.match(mcpSource, /mcp\.copy_callback/);
  assert.match(mcpSource, /mcp\.redirect_uri/);
  assert.match(mcpSource, /overflowWrap: "anywhere"/);
  assert.match(mcpSource, /navigator\.clipboard\?\.writeText\(callbackURL\)/);
  assert.doesNotMatch(mcpSource, /console\.log\(/);
  const zhCN = JSON.parse(readFileSync("src/i18n/locales/zh_CN.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8"));
  const zhTW = JSON.parse(readFileSync("src/i18n/locales/zh_TW.json", "utf8"));
  const ja = JSON.parse(readFileSync("src/i18n/locales/ja_JP.json", "utf8"));
  for (const pack of [zhCN, en, zhTW, ja]) {
    assert.match(pack.mcp.authorized_body, /./);
    assert.match(pack.mcp.authorized_ttl, /180/);
    assert.match(pack.mcp.copy_callback, /./);
    assert.match(pack.mcp.view_requests_subtitle, /./);
    assert.match(pack.mcp.awaiting_authorize, /./);
    assert.doesNotMatch(pack.mcp.authorized_body, /cloudflared|localhost/);
  }
  assert.equal(zhTW.mcp.authorized_body, "AI 工具已連線，您可以關閉此視窗。");
  assert.doesNotMatch(zhCN.mcp.authorized_body, /已连接|已連線|接続されました/);
  assert.doesNotMatch(en.mcp.authorized_body, /已连接|已連線|接続されました/);
  assert.doesNotMatch(ja.mcp.authorized_body, /已连接|已連線|接続されました/);
});

test("MCP pending requests can be denied and inactive history can be purged", () => {
  assert.match(mcpSource, /MCP_HISTORY_DAYS = 3/);
  assert.match(mcpSource, /authorization-requests\/\$\{id\}\/deny/);
  assert.match(mcpSource, /mcp\.deny/);
  assert.match(mcpSource, /mcp\.status_denied/);
  assert.match(mcpSource, /<MenuItem value="denied">\{t\("mcp\.status_denied"\)\}<\/MenuItem>/);
  assert.doesNotMatch(mcpSource, /<MenuItem value="denied">\{t\("mcp\.result_denied"\)\}<\/MenuItem>/);
  assert.match(mcpSource, /op\.tool_name !== "grant"/);
  assert.doesNotMatch(mcpSource, /op\.state === "denied"/);
  assert.match(mcpSource, /\/api\/admin\/mcp\/history\/purge/);
  assert.match(mcpSource, /mcp\.delete_history/);
  assert.match(mcpSource, /mcp\.delete_history_confirm/);
  assert.match(mcpSource, /mcp\.revoke_all_confirm/);
  assert.doesNotMatch(mcpSource, /t\("mcp\.select"\)/);
  assert.match(mcpSource, /mcp\.authorized_ttl/);
  assert.match(mcpSource, /active\.length \? \(/);
  assert.match(mcpSource, /canPurge \|\| rows\.length/);
  assert.doesNotMatch(mcpSource, /disabled=\{!active\.length \|\| revokingAll\}/);
  const zhCN = JSON.parse(readFileSync("src/i18n/locales/zh_CN.json", "utf8"));
  const en = JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8"));
  const zhTW = JSON.parse(readFileSync("src/i18n/locales/zh_TW.json", "utf8"));
  const ja = JSON.parse(readFileSync("src/i18n/locales/ja_JP.json", "utf8"));
  for (const pack of [zhCN, en, zhTW, ja]) {
    assert.match(pack.mcp.deny, /./);
    assert.match(pack.mcp.status_denied, /./);
    assert.match(pack.mcp.result_denied, /./);
    assert.match(pack.mcp.delete_history, /./);
    assert.match(pack.mcp.delete_history_confirm, /./);
    assert.match(pack.mcp.revoke_all, /./);
    assert.match(pack.mcp.revoke_all_confirm, /./);
    assert.match(pack.mcp.revoke_all_title, /./);
  }
});

test("MCP chrome follows the mockup: split duration, pill presets", () => {
  assert.doesNotMatch(mcpSource, /mcp\.remote_mcp/);
  assert.match(mcpSource, /fontVariantNumeric: "tabular-nums"/);
  assert.match(mcpSource, /borderLeft: "1px solid"/);
  assert.match(mcpSource, /MCP_DURATION_PRESETS\.map/);
  assert.match(mcpSource, /mcp\.export_log/);
  assert.doesNotMatch(mcpSource, /ToggleButtonGroup/);
  assert.doesNotMatch(mcpSource, /FormControlLabel/);
  assert.match(mcpSource, /mcp\.note_optional/);
  assert.match(mcpSource, /scrollbarGutter: "stable"/);
  assert.match(mcpSource, /mcp\.full_permissions/);
  assert.match(mcpSource, /AdminMobileListCard/);
  assert.match(mcpSource, /AdminMobileCardStack/);
  assert.match(mcpSource, /ml: "auto"/);
});

test("MCP leases show five latest rows and treat in-flight ops as running", () => {
  assert.match(mcpSource, /MCP_LEASES_PAGE_SIZE = 5/);
  assert.match(mcpSource, /useAdminPagination\(\s*filtered,\s*MCP_LEASES_PAGE_SIZE/);
  assert.match(mcpSource, /function leaseRunningCount/);
  assert.match(mcpSource, /MCP_LIVE_POLL_MS/);
  assert.doesNotMatch(mcpSource, /mcp\.connect_token_hint/);
  assert.match(mcpSource, /mcp\.full_mode_notice_more/);
  assert.match(mcpSource, /function TruncatedText/);
  assert.match(mcpSource, /overflowWrap: "anywhere"/);
  assert.match(mcpSource, /isMobile \? "column" : "row"/);
  assert.match(mcpSource, /gridTemplateColumns: "auto auto minmax\(0,1fr\) max-content"/);
  assert.match(mcpSource, /gridColumn: 4, gridRow: 2, justifySelf: "end"/);
  assert.match(mcpSource, /width: isMobile \? "100%" : "auto"/);
  assert.match(mcpSource, /alignItems: "stretch"/);
  assert.match(mcpSource, /minHeight: 181/);
  assert.match(mcpSource, /mt: "auto"/);
  assert.match(mcpSource, /function ClientPurposeText/);
  assert.match(mcpSource, /function clientPurposeLine/);
  assert.match(mcpSource, /toggleSelectAll/);
  assert.match(mcpSource, /common\.select_all/);
  assert.match(mcpSource, /common\.deselect_all/);
});

test("remote management pages and launchers require the site switch", () => {
  assert.match(layoutSource, /RemoteManagementGateProvider/);
  assert.match(execSource, /RequireAllowRemoteManagement/);
  assert.match(mcpSource, /RequireAllowRemoteManagement/);
  assert.match(mcpSource, /RequireAllowMCP/);
  assert.match(xtermSource, /RequireAllowRemoteManagement/);
  assert.match(terminalSource, /RequireAllowRemoteManagement/);
  assert.match(sidebarSource, /guardRemoteManagementNav/);
  assert.match(serversSource, /ensureEnabled\(\)/);
  assert.match(nodeDetailSource, /ensureEnabled\(\)/);
  assert.match(nodeDetailSource, /ensureMCPEnabled\(\)/);
  assert.match(gateSource, /ALLOW_REMOTE_MANAGEMENT_SETTING_PATH/);
  assert.match(gateSource, /ensureMCPEnabled/);
  assert.doesNotMatch(
    gateSource,
    /useRemoteManagementGate must be used within RemoteManagementGateProvider/,
  );
});

test("the remote-management required prompt is a dialog on every screen size", () => {
  assert.match(gateSource, /<Dialog/);
  assert.match(gateSource, /maxWidth="sm"/);
  assert.match(gateSource, /onDismiss/);
  assert.match(gateSource, /settings\.general\.allow_remote_management_go_enable/);
  assert.doesNotMatch(gateSource, /AuthStandAlonePage/);
  assert.doesNotMatch(gateSource, /fullScreen/);
  assert.doesNotMatch(gateSource, /createPortal/);
  assert.doesNotMatch(gateSource, /sx=\{\{ py: 6, maxWidth: 560 \}\}/);
});

test("site remote-management helper treats only true as enabled", () => {
  assert.equal(isAllowRemoteManagementEnabled({ allow_remote_management: true }), true);
  assert.equal(isAllowRemoteManagementEnabled({ allow_remote_management: false }), false);
  assert.equal(isAllowRemoteManagementEnabled({}), false);
  assert.equal(isRemoteManagementPath("/admin/remote-management/mcp"), true);
  assert.equal(isRemoteManagementPath("/admin/exec"), true);
  assert.equal(isRemoteManagementPath("/admin/remote-management/schedules"), true);
  assert.equal(isRemoteManagementPath("/admin/remote-management/schedules/task-1"), true);
  assert.equal(isRemoteManagementPath("/admin/remote-management/firewall"), true);
  assert.equal(isRemoteManagementPath("/admin/settings/xtermjs"), true);
  assert.equal(isRemoteManagementPath("/terminal"), true);
  assert.equal(isRemoteManagementPath("/admin/servers"), false);
  assert.equal(isMCPManagementPath("/admin/remote-management/mcp"), true);
  assert.equal(isMCPManagementPath("/admin/exec"), false);
  assert.equal(isAllowMCPEnabled({ allow_mcp: true }), true);
  assert.equal(isAllowMCPEnabled({ allow_mcp: false }), false);
  assert.equal(isAllowMCPEnabled({}), false);
});

test("remote management copy is shortened and present in every locale", () => {
  assert.equal(
    locales.zhCN.settings.general.allow_remote_management_description,
    "站点级开关。开启后仍需 Agent 本地启用远程控制。",
  );
  assert.equal(
    locales.zhCN.settings.general.allow_remote_management_required_description,
    "站点未启用远程管理，请先开启该功能。",
  );
  assert.equal(locales.zhCN.mcp.view_guide, "帮助");
  assert.equal(locales.zhCN.mcp.new_authorization, "申请列表");
  for (const locale of Object.values(locales)) {
    assert.equal(typeof locale.settings.general.allow_remote_management_go_enable, "string");
    assert.equal(
      typeof locale.settings.general.allow_remote_management_required_title,
      "string",
    );
    assert.equal(
      typeof locale.settings.general.allow_remote_management_required_description,
      "string",
    );
    assert.equal(typeof locale.settings.general.allow_mcp, "string");
    assert.equal(typeof locale.settings.general.allow_mcp_description, "string");
    assert.equal(typeof locale.settings.general.allow_mcp_go_enable, "string");
    assert.equal(typeof locale.settings.general.allow_mcp_required_title, "string");
    assert.equal(
      typeof locale.settings.general.allow_mcp_required_description,
      "string",
    );
    assert.equal(typeof locale.mcp.connect_from_client, "string");
    assert.equal(locale.mcp.connect_token_hint, undefined);
    assert.equal(typeof locale.mcp.full_mode_notice, "string");
    assert.equal(typeof locale.mcp.full_mode_notice_more, "string");
    assert.equal(typeof locale.mcp.view_guide, "string");
    assert.equal(typeof locale.mcp.note_optional, "string");
    assert.equal(typeof locale.mcp.duration_from_confirm, "string");
    assert.equal(typeof locale.mcp.pick_request, "string");
    assert.equal(typeof locale.mcp.redirect_uri, "string");
    assert.equal(typeof locale.mcp.client_id_label, "string");
    assert.equal(typeof locale.mcp.no_pending_requests, "string");
    assert.equal(typeof locale.mcp.node_need_agent, "string");
    assert.equal(typeof locale.mcp.node_need_remote, "string");
    assert.match(locale.mcp.node_need_agent, /MCP/);
    assert.equal(typeof locale.admin.nodeTable.enableRemoteControl, "string");
  }
});

test("MCP grant notes are not treated as a username field", () => {
  assert.match(mcpSource, /name="mcp-purpose-note"/);
  assert.match(mcpSource, /autoComplete="off"/);
  assert.match(mcpSource, /data-bwignore/);
  assert.match(mcpSource, /multiline/);
  assert.match(mcpSource, /readOnlyUntilFocus/);
  assert.match(mcpSource, /component="form"/);
  assert.match(mcpSource, /left: "-10000px"/);
  assert.match(mcpSource, /name="username"/);
  assert.match(mcpSource, /autoComplete="username"/);
  assert.match(mcpSource, /name=\{twoFaEnabled \? "otp" : "password"\}/);
  assert.match(mcpSource, /autoComplete=\{twoFaEnabled \? "one-time-code" : "current-password"\}/);
});
