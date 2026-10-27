import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Popover from "@mui/material/Popover";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import AdminPageTitle from "@/components/admin/AdminPageTitle";
import {
  AdminPagination,
  useAdminPagination,
} from "@/components/admin/AdminPagination";
import {
  AdminListFiltersBar,
  AdminListSearch,
  AdminListShell,
} from "@/components/admin/AdminListShell";
import { ADMIN_LIST_FIELD_SX } from "@/components/admin/adminListLayout";
import { AdminMobileCardStack, AdminMobileListCard } from "@/components/admin/AdminMobileListCard";
import SettingsSheetDialog, {
  SettingsSheetActions,
} from "@/components/admin/SettingsSheetDialog";
import { SettingsAlert, settingsFieldSx } from "@/components/admin/SettingsChrome";
import { SettingCardSwitch } from "@/components/admin/SettingCard";
import { AdminSheetTabs, AdminTabLabel } from "@/components/admin/AdminSheetTabs";
import { Badge, Tabs as SubPageTabs } from "@/components/admin/ui";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Ban,
  Clock3,
  Copy,
  Cpu,
  Globe,
  Layers3,
  LinkIcon,
  LockKeyhole,
  Network,
  Pencil,
  Play,
  QrCode,
  RotateCw,
  Shield,
  Calendar,
  Plus,
  RefreshCw,
  Shuffle,
  Trash,
  Users,
  XCircle,
} from "@/components/admin/muiIcons";
import {
  tableColumnStyle,
  useResizableTableColumns,
  type TableColumnWidths,
} from "@/components/admin/resizableTableColumns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAccount } from "@/contexts/AccountContext";
import { useNodeDetails } from "@/contexts/NodeDetailsContext";
import { useRPC2Call } from "@/contexts/RPC2Context";
import { useSettings } from "@/lib/api";
import { writeClipboardText } from "@/utils/clipboard";
import { createRandomId } from "@/utils/randomId";
import {
  clearStoredRemoteGrant,
  isRemoteGrantLive,
  loadStoredRemoteGrant,
  localizeRemoteError,
  saveStoredRemoteGrant,
} from "@/utils/remoteSession";
import { confirmAdminPasskey } from "@/utils/webauthn";
import { toast } from "sonner";
import { AppDialogContent, Dialog, Flex } from "@/components/admin/ui";
import { displayExpiryInput, inboundFirewallUnavailable, inboundNeedsFirewallGrant, moveAdjacentIDs, nodemgtErrorMessage, normalizeExpiryInput, outboundFieldsFromInbound, outboundPasswordFromInbound, outboundTagConflict, outboundTagFromInbound, randomInboundPort, randomRealityShortID, shareSNI, stripFirewallGrantFields, uuidForInbound } from "./inboundToOutbound";
import { parseShareLink } from "./shareLink";
import {
  emptyNodemgtTemplates,
  getNodemgtSnapshot,
  hasNodemgtTemplates,
  nodemgtPrimaryMethods,
  patchNodemgtSnapshot,
  prefetchNodemgtAdmin,
  type NodemgtSnapshot,
  type NodemgtTemplateList,
} from "./prefetch";
import { visibleChipCountFromRects } from "./overflowChips";
import { previewCopyText, SubPreviewBody, type SubPreview } from "./subPreview";
import { parsePreviewLinks, TEMPLATE_CLIENTS, subscriptionTargetURL } from "./subscriptionClients";
import SubscriptionTemplates from "./subscriptionTemplates";

type TabKey =
  | "overview"
  | "inbounds"
  | "outbounds"
  | "routes"
  | "users"
  | "plans"
  | "certs"
  | "subscriptions"
  | "audit";

type SheetKind = "inbound" | "user" | "plan" | "cert" | "subscription" | "outbound" | "route" | "node";
type FormMap = Record<string, string>;
const FIREWALL_GRANT_SCOPE = "nodemgt-firewall";

const NODE_TABS: Record<string, TabKey> = {
  "": "overview",
  "/overview": "overview",
  "/inbounds": "inbounds",
  "/forwarding": "outbounds",
  "/outbounds": "outbounds",
  "/routes": "routes",
  "/users": "users",
  "/node-users": "users",
  "/plans": "plans",
  "/certificates": "certs",
  "/certs": "certs",
  "/subscriptions": "subscriptions",
  "/templates": "subscriptions",
  "/audit": "audit",
  "/diag": "overview",
};

const PATH_TAB: Record<string, TabKey> = Object.fromEntries(
  (["nodemgt", "plus", "nodes"] as const).flatMap((prefix) =>
    Object.entries(NODE_TABS).map(([suffix, tab]) => [`/admin/${prefix}${suffix}`, tab]),
  ),
);

const PROTOCOLS = ["vless", "vmess", "trojan", "shadowsocks", "http", "hysteria2", "tuic", "anytls"] as const;
const STACKS = ["ipv4", "ipv6", "dual"] as const;
const DIAL_STACKS = ["dual", "ipv4", "ipv6", "prefer_ipv4", "prefer_ipv6"] as const;
const FLOWS = ["", "xtls-rprx-vision", "xtls-rprx-vision-udp443"] as const;
const CORES = ["xray", "sing-box"] as const;
const SUB_FORMATS = ["xray", "clash", "sing-box", "base64", "mihomo", "loon", "surge", "surge-mac", "stash"] as const;
const FINGERPRINTS = ["edge", "chrome", "firefox", "safari", "ios", "qq", "random"] as const;
const DEFAULT_FINGERPRINT = "edge";
const DEFAULT_REALITY_DEST = "addons.mozilla.org:443";
const REALITY_DESTS = [
  "addons.mozilla.org:443",
  "www.microsoft.com:443",
] as const;
const SS_METHODS = [
  "2022-blake3-aes-128-gcm",
  "2022-blake3-aes-256-gcm",
  "aes-128-gcm",
  "aes-256-gcm",
  "chacha20-ietf-poly1305",
] as const;
const DEFAULT_SS_METHOD = "2022-blake3-aes-128-gcm";
const OUTBOUND_PROTOCOLS = ["vless", "vmess", "trojan", "shadowsocks", "anytls", "socks", "http", "freedom", "blackhole"] as const;
const DOMAIN_STRATEGIES = ["AsIs", "UseIP", "UseIPv4", "UseIPv6"] as const;
const ROUTE_NETWORKS = ["", "tcp", "udp", "tcp,udp"] as const;
const ROUTE_PROTOCOLS = ["http", "tls", "quic", "bittorrent"] as const;
const SNIFF_DESTS = ["http", "tls", "quic"] as const;
const XHTTP_MODES = ["auto", "packet-up", "stream-up", "stream-one"] as const;
const TCP_HEADERS = ["none", "http"] as const;
const OUTBOUND_TRANSPORTS = ["tcp", "ws", "grpc", "httpupgrade", "xhttp"] as const;

function transportsFor(protocol: string) {
  if (protocol === "hysteria2" || protocol === "tuic") return ["quic"];
  if (protocol === "shadowsocks" || protocol === "anytls" || protocol === "http") return ["tcp"];
  return ["tcp", "ws", "grpc", "httpupgrade", "xhttp"];
}

function securitiesFor(protocol: string, transport: string) {
  if (protocol === "anytls") return ["tls", "reality"];
  if (protocol === "hysteria2" || protocol === "tuic" || protocol === "trojan") return ["tls"];
  if (protocol === "shadowsocks") return ["none"];
  if (protocol === "http") return ["none", "tls"];
  if (transport === "tcp") return ["none", "tls", "reality"];
  return ["none", "tls"];
}

function canUseFlow(protocol: string, transport: string, security: string, _core = "xray") {
  return protocol === "vless" && transport === "tcp" && (security === "tls" || security === "reality");
}

function flowsFor(core = "xray") {
  if (core === "sing-box") return ["", "xtls-rprx-vision"] as const;
  return FLOWS;
}

function flowForCore(flow: string, core = "xray") {
  const allowed = flowsFor(core) as readonly string[];
  if (allowed.includes(flow)) return flow;
  if (core === "sing-box" && flow.toLowerCase().includes("vision")) return "xtls-rprx-vision";
  return "";
}

function defaultInboundFlow(protocol: string, transport: string, security: string, core = "xray") {
  if (!canUseFlow(protocol, transport, security, core)) return "";
  return security === "reality" ? "xtls-rprx-vision" : "";
}

function destHost(dest: string) {
  return dest.split(":")[0] || dest;
}

function defaultOutboundName(protocol: string) {
  if (protocol === "freedom") return "direct";
  if (protocol === "blackhole") return "block";
  return protocol;
}

function isProxyOutbound(protocol: string) {
  return ["vless", "vmess", "trojan", "shadowsocks", "anytls", "socks", "http"].includes(protocol);
}

const panelSx = {
  overflow: "hidden",
  borderRadius: "8px",
  borderColor: "divider",
  bgcolor: "background.paper",
  boxShadow: "none",
} as const;

function newOp() {
  return crypto.randomUUID();
}

function asList(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}

function mergeById(rows: any[], row: any) {
  const id = str(row?.id);
  if (!id) return rows;
  const idx = rows.findIndex((item) => str(item?.id) === id);
  if (idx < 0) return [...rows, row];
  const prev = rows[idx];
  const next = rows.slice();
  next[idx] = { ...prev, ...row, created_at: prev.created_at || row.created_at };
  return next;
}

function byCreatedAt(a: any, b: any) {
  return String(a?.created_at || "").localeCompare(String(b?.created_at || "")) || String(a?.id || "").localeCompare(String(b?.id || ""));
}

function userViewFromUpsert(raw: any) {
  if (!raw || typeof raw !== "object") return null;
  const view = { ...raw };
  delete view.secret;
  return str(view.id) ? view : null;
}

function normalizeDialStack(raw: unknown) {
  const value = str(raw).toLowerCase();
  if (value === "ipv4" || value === "ipv6" || value === "prefer_ipv4" || value === "prefer_ipv6") return value;
  return "dual";
}

function nodeForm(row?: any): FormMap {
  const nodeUUID = str(row?.node_uuid || row?.id);
  return {
    id: nodeUUID,
    node_uuid: nodeUUID,
    dial_stack: normalizeDialStack(row?.dial_stack),
  };
}

function upsertedRow(kind: SheetKind, raw: any) {
  if (kind === "user") return userViewFromUpsert(raw);
  if (kind === "node") {
    const uuid = str(raw?.node_uuid);
    if (!uuid) return null;
    return { ...raw, id: uuid, dial_stack: normalizeDialStack(raw?.dial_stack) };
  }
  if (!raw || typeof raw !== "object" || raw.ok === true || !str(raw.id)) return null;
  return stripFirewallGrantFields(raw);
}

const SNAPSHOT_LIST_KEY: Record<SheetKind, "inbounds" | "users" | "plans" | "certs" | "subs" | "outbounds" | "routes" | "nodes"> = {
  inbound: "inbounds",
  user: "users",
  plan: "plans",
  cert: "certs",
  subscription: "subs",
  outbound: "outbounds",
  route: "routes",
  node: "nodes",
};

const DELETE_LIST_KEY: Record<string, "inbounds" | "users" | "plans" | "certs" | "subs" | "outbounds" | "routes"> = {
  "admin:nodemgt.inbound.delete": "inbounds",
  "admin:nodemgt.user.delete": "users",
  "admin:nodemgt.plan.delete": "plans",
  "admin:nodemgt.cert.delete": "certs",
  "admin:nodemgt.subscription.delete": "subs",
  "admin:nodemgt.outbound.delete": "outbounds",
  "admin:nodemgt.route.delete": "routes",
};

function str(value: unknown, fallback = "") {
  return value == null ? fallback : String(value);
}

const emptySubCfg = {
  sub_listen_port: "",
  sub_public_port: "",
  sub_path: "",
  sub_public_host: "",
  sub_reuse_https: false,
};

function settingOn(value: unknown) {
  if (value === true || value === 1) return true;
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function subCfgFromSettings(settingRow?: Record<string, any> | null) {
  const reuse = settingOn(settingRow?.sub_reuse_https);
  return {
    sub_listen_port: Number(settingRow?.sub_listen_port || 0) > 0 ? str(settingRow?.sub_listen_port) : "",
    sub_public_port: Number(settingRow?.sub_public_port || 0) > 0 ? str(settingRow?.sub_public_port) : "",
    sub_path: str(settingRow?.sub_path, ""),
    sub_public_host: str(settingRow?.sub_public_host, ""),
    sub_reuse_https: reuse,
  };
}

function defaultCore(protocol: string) {
  return protocol === "hysteria2" || protocol === "tuic" || protocol === "anytls" ? "sing-box" : "xray";
}

function defaultTransport(protocol: string) {
  return protocol === "hysteria2" || protocol === "tuic" ? "quic" : "tcp";
}

function defaultSecurity(protocol: string): "none" | "tls" | "reality" {
  if (protocol === "trojan" || protocol === "hysteria2" || protocol === "tuic" || protocol === "anytls") return "tls";
  return "none";
}

function coresFor(protocol: string) {
  return protocol === "anytls" || protocol === "hysteria2" || protocol === "tuic" ? ["sing-box"] : CORES;
}

function displayCore(value: string) {
  return value === "xray" ? "Xray" : value;
}

function bytesToGiB(bytes: number) {
  if (!bytes) return "0";
  const value = bytes / 1024 ** 3;
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function giBToBytes(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 1024 ** 3);
}

function bpsToMbps(bps: number) {
  if (!bps) return "";
  const value = bps / 1_000_000;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function mbpsToBps(raw: string) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 1_000_000);
}

function formatGiBLabel(bytes: number) {
  return `${bytesToGiB(bytes)} GB`;
}

function formatQuotaLabel(used: number, quota: number, none: string) {
  return `${formatGiBLabel(used || 0)} / ${quota > 0 ? formatGiBLabel(quota) : none}`;
}

function formatMbpsLabel(bps: number, none: string) {
  if (!bps) return none;
  return `${bpsToMbps(bps) || "0"} Mbit/s`;
}

function formatWhen(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function liveOnlineIPs(row: any): any[] {
  if (!row?.online) return [];
  return Array.isArray(row.online_ips) ? row.online_ips : [];
}

function toDateTimeLocal(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDateTimeLocal(value: string) {
  const raw = normalizeExpiryInput(value);
  if (!raw) return null;
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function planExpiryLocal(days: unknown) {
  const n = Number(days || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return toDateTimeLocal(new Date(Date.now() + n * 86400000));
}

function inboundShareStrategy(row?: any): string {
  const raw = str(row?.share_strategy, "node") || "node";
  if (raw === "specified") return "other";
  if (raw === "listen" || raw === "other" || raw === "node") return raw;
  return "node";
}

function inboundRouteOnly(row?: any): string {
  if (!row?.id) return "false";
  const sniffingOn = row.sniffing === true || row.sniffing === "true";
  const reality = str(row?.security) === "reality";
  const vision = str(row?.flow).includes("vision");
  if (sniffingOn && (reality || vision || row.route_only)) return "true";
  return row.route_only ? "true" : "false";
}

function randomProxyToken(len = 8) {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function newProxyAccount() {
  return { user: randomProxyToken(8), pass: randomProxyToken(12) };
}

type ProxyAccountRow = { user: string; pass: string };

function parseProxyAccounts(raw: unknown): ProxyAccountRow[] {
  let value = raw;
  if (typeof value === "string" && value.trim()) {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.map((row: any) => ({
    user: str(row?.user || row?.username),
    pass: str(row?.pass || row?.password),
  }));
}

function accountsFormValue(raw: unknown, protocol?: string) {
  const rows = parseProxyAccounts(raw).filter((row) => row.user || row.pass);
  if (protocol === "http" && rows.length === 0) return JSON.stringify([newProxyAccount()]);
  return JSON.stringify(rows);
}

function inboundForm(row?: any): FormMap {
  const existing = Boolean(row?.id);
  const protocol = str(row?.protocol, "vless");
  const transport = str(row?.transport, defaultTransport(protocol));
  const security = str(row?.security, defaultSecurity(protocol));
  const core = str(row?.core, defaultCore(protocol));
  return {
    id: str(row?.id),
    name: str(row?.name),
    node_uuid: str(row?.node_uuid),
    protocol,
    core,
    stack: str(row?.stack) || (row?.id ? "dual" : "ipv4"),
    listen: str(row?.listen),
    port: str(row?.port, "443"),
    public_host: str(row?.public_host),
    transport,
    security,
    flow: flowForCore(str(row?.flow, existing ? "" : defaultInboundFlow(protocol, transport, security, core)), core),
    sni: str(row?.sni),
    tls_domain: str(row?.tls_domain),
    alpn: str(row?.alpn),
    cert_id: str(row?.cert_id),
    reality_dest: str(row?.reality_dest, security === "reality" ? DEFAULT_REALITY_DEST : ""),
    reality_server_names: str(row?.reality_server_names),
    reality_short_id: str(row?.reality_short_id),
    fingerprint: str(row?.fingerprint, DEFAULT_FINGERPRINT),
    spider_x: str(row?.spider_x, "/"),
    sniffing: existing && (row.sniffing === true || row.sniffing === "true") ? "true" : "false",
    dest_override: str(row?.dest_override, "http,tls,quic"),
    route_only: inboundRouteOnly(row),
    ws_path: str(row?.ws_path, "/"),
    ws_host: str(row?.ws_host),
    grpc_service: str(row?.grpc_service, "gun"),
    grpc_multi: row?.grpc_multi ? "true" : "false",
    http_path: str(row?.http_path, "/"),
    http_host: str(row?.http_host),
    http_mode: str(row?.http_mode, "auto"),
    tcp_header: str(row?.tcp_header, "none"),
    tcp_host: str(row?.tcp_host),
    ss_method: str(row?.ss_method, DEFAULT_SS_METHOD),
    accounts: accountsFormValue(row?.accounts, protocol),
    allow_transparent: row?.allow_transparent === true || row?.allow_transparent === "true" ? "true" : "false",
    sort_index: str(row?.sort_index, "0"),
    share_strategy: inboundShareStrategy(row),
    exclude_from_sub: "false",
    enabled: row?.enabled === false ? "false" : "true",
    firewall_allow: row?.firewall_linked ? "true" : "false",
  };
}

function userForm(row?: any): FormMap {
  return {
    id: str(row?.id),
    username: str(row?.username),
    display_name: str(row?.display_name),
    inbound_ids: Array.isArray(row?.inbound_ids) ? row.inbound_ids.join(",") : "",
    plan_id: str(row?.plan_id),
    flow: str(row?.flow),
    rate_mbps: bpsToMbps(Number(row?.rate_limit_bps || 0)),
    device_limit: row?.device_limit == null ? "0" : str(row.device_limit),
    expires_at: toDateTimeLocal(row?.expires_at || row?.assignment_ends_at),
    traffic_reset_day: str(row?.traffic_reset_day, "0"),
    enabled: row?.status === "disabled" ? "false" : "true",
    extra_links: extraLinksFormValue(row?.extra_links),
  };
}

type ExtraLinkRow = {
  id: string;
  kind: "link" | "subscription";
  value: string;
  remark: string;
  name_prefix: string;
  enabled: boolean;
  expires_at: string;
  last_fetch_at: string;
  last_fetch_error: string;
};

function extraLinkID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extraLinksFormValue(raw: unknown) {
  if (Array.isArray(raw)) return JSON.stringify(raw);
  if (typeof raw === "string" && raw.trim()) return raw;
  return "[]";
}

function parseExtraLinks(raw: string): ExtraLinkRow[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row: any) => ({
      id: str(row?.id) || extraLinkID(),
      kind: row?.kind === "subscription" ? "subscription" : "link",
      value: str(row?.value),
      remark: str(row?.remark),
      name_prefix: str(row?.name_prefix),
      enabled: row?.enabled !== false,
      expires_at: toDateTimeLocal(row?.expires_at) || str(row?.expires_at),
      last_fetch_at: str(row?.last_fetch_at),
      last_fetch_error: str(row?.last_fetch_error),
    }));
  } catch {
    return [];
  }
}

function extraLinksPayload(raw: string) {
  return parseExtraLinks(raw).map((row) => ({
    id: row.id,
    kind: row.kind,
    value: row.value,
    remark: row.remark,
    name_prefix: row.name_prefix,
    enabled: row.enabled,
    expires_at: fromDateTimeLocal(row.expires_at),
    last_fetch_at: row.last_fetch_at || null,
    last_fetch_error: row.last_fetch_error,
  }));
}

function planForm(row?: any): FormMap {
  return {
    id: str(row?.id),
    name: str(row?.name),
    traffic_gib: bytesToGiB(Number(row?.traffic_bytes || 0)),
    duration_days: str(row?.duration_days, "30"),
    rate_mbps: bpsToMbps(Number(row?.rate_limit_bps || 0)),
    device_limit: row?.device_limit == null ? "0" : str(row.device_limit),
  };
}

function isFileCert(row?: any) {
  return str(row?.source) === "file" || Boolean(str(row?.cert_path));
}

function isACMECert(row?: any) {
  return !isFileCert(row) && str(row?.source) !== "root" && !str(row?.root_cert_id);
}

function certAutoRenewOn(row?: any) {
  return row?.auto_renew !== false && row?.auto_renew !== 0;
}

function certShareHost(row?: any) {
  const share = str(row?.share_domain);
  if (share && !share.startsWith("*.")) return share;
  const domain = str(row?.domain);
  if (domain.startsWith("*.")) return domain.slice(2);
  return domain;
}

function certOptionLabel(row: any) {
  const domain = str(row?.domain) || row?.id;
  const share = str(row?.share_domain);
  const cover = row?.cover_wildcard === true || row?.cover_wildcard === "true";
  if (share && share !== domain) return `${domain} · ${share}`;
  if (cover && domain && !domain.startsWith("*.")) return `${domain} / *.${domain}`;
  return domain;
}

function formatCertIssuer(raw: string) {
  const value = str(raw).trim();
  if (!value || value === "file") return "";
  if (/lets[\s-]?encrypt/i.test(value)) return "Let's Encrypt";
  return value;
}

function displayCertIssuer(row: any, fileLabel: string, acmeLabel: string, rootLabel?: string) {
  const issuer = formatCertIssuer(str(row?.issuer));
  const source = isFileCert(row) ? fileLabel : str(row?.source) === "root" || str(row?.root_cert_id) ? rootLabel || acmeLabel : acmeLabel;
  return issuer ? `${source} · ${issuer}` : source;
}

function CellClamp({ value, maxWidth = 280 }: { value: string; maxWidth?: number }) {
  if (!value || value === "—") return <>{"—"}</>;
  return (
    <Box
      title={value}
      sx={{
        maxWidth,
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </Box>
  );
}

function CellEllipsis({ value }: { value: string }) {
  if (!value || value === "—") return <>{"—"}</>;
  return (
    <Box
      title={value}
      sx={{
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {value}
    </Box>
  );
}

function certForm(row?: any): FormMap {
  const source = isFileCert(row)
    ? "file"
    : str(row?.source) === "root" || str(row?.root_cert_id)
      ? "root"
      : str(row?.source) === "acme" || str(row?.id)
        ? "acme"
        : "root";
  return {
    id: str(row?.id),
    domain: str(row?.domain),
    root_cert_id: str(row?.root_cert_id),
    share_domain: str(row?.share_domain),
    cover_wildcard: row?.cover_wildcard === false || row?.cover_wildcard === "false" ? "false" : "true",
    node_uuid: str(row?.node_uuid),
    source,
    cert_path: str(row?.cert_path),
    key_path: str(row?.key_path),
    test_ca: "false",
  };
}

function subscriptionForm(row?: any): FormMap {
  return {
    id: str(row?.id),
    user_id: str(row?.user_id),
    format: str(row?.format, "xray"),
    auto_detect: row?.auto_detect === true || row?.auto_detect === "true" ? "true" : "false",
    extra_urls: str(row?.extra_urls),
    token: str(row?.token),
    path: str(row?.path),
    enabled: row?.enabled === false ? "false" : "true",
  };
}

function outboundForm(row?: any): FormMap {
  const protocol = str(row?.protocol, "vless");
  const core = str(row?.core, defaultCore(protocol));
  return {
    id: str(row?.id),
    name: str(row?.name),
    node_uuid: str(row?.node_uuid),
    protocol,
    core,
    address: str(row?.address),
    dest_port: str(row?.dest_port || ""),
    username: str(row?.username),
    password: str(row?.password),
    uuid: str(row?.uuid),
    flow: flowForCore(str(row?.flow), core),
    domain_strategy: str(row?.domain_strategy, "AsIs"),
    transport: str(row?.transport, "tcp"),
    security: str(row?.security, "none"),
    sni: str(row?.sni),
    fingerprint: str(row?.fingerprint, DEFAULT_FINGERPRINT),
    ws_path: str(row?.ws_path, "/"),
    ws_host: str(row?.ws_host),
    grpc_service: str(row?.grpc_service, "gun"),
    ss_method: str(row?.ss_method, DEFAULT_SS_METHOD),
    via_outbound: str(row?.via_outbound),
    reality_public_key: str(row?.reality_public_key),
    reality_short_id: str(row?.reality_short_id),
    spider_x: str(row?.spider_x, "/"),
    source_inbound_id: str(row?.source_inbound_id),
    enabled: row?.enabled === false ? "false" : "true",
  };
}

function routeForm(row?: any): FormMap {
  return {
    id: str(row?.id),
    name: str(row?.name),
    node_uuid: str(row?.node_uuid),
    inbound_id: str(row?.inbound_id),
    outbound_id: str(row?.outbound_id, "direct"),
    domain: str(row?.domain),
    ip: str(row?.ip),
    network: str(row?.network),
    protocol: str(row?.protocol),
    port: str(row?.port),
    source: str(row?.source),
    priority: str(row?.priority, "0"),
    enabled: row?.enabled === false ? "false" : "true",
  };
}

function inboundUpsertBody(form: FormMap) {
  return {
    id: form.id || undefined,
    node_uuid: form.node_uuid,
    name: form.name,
    protocol: form.protocol,
    core: form.core || defaultCore(form.protocol),
    stack: form.stack,
    listen: form.listen,
    port: Number(form.port || 443),
    public_host: form.share_strategy === "other" ? form.public_host : "",
    transport: form.transport,
    security: form.security,
    flow: form.flow,
    sni: form.security === "reality" ? shareSNI(form, "reality") : form.sni,
    tls_domain: form.tls_domain,
    alpn: form.alpn,
    cert_id: form.cert_id,
    reality_dest: form.reality_dest,
    reality_server_names: form.reality_server_names,
    reality_short_id: form.reality_short_id,
    fingerprint: form.fingerprint,
    spider_x: form.spider_x,
    sniffing: form.sniffing !== "false",
    dest_override: form.dest_override,
    route_only: form.route_only === "true",
    ws_path: form.ws_path,
    ws_host: form.ws_host,
    grpc_service: form.grpc_service,
    grpc_multi: form.grpc_multi === "true",
    http_path: form.http_path,
    http_host: form.http_host,
    http_mode: form.http_mode,
    tcp_header: form.tcp_header,
    tcp_host: form.tcp_host,
    ss_method: form.ss_method,
    accounts: parseProxyAccounts(form.accounts),
    allow_transparent: form.allow_transparent === "true",
    sort_index: Number(form.sort_index || 0),
    share_strategy: form.share_strategy || "node",
    exclude_from_sub: false,
    enabled: form.enabled !== "false",
    firewall_allow: form.firewall_allow === "true",
  };
}

function outboundUpsertBody(form: FormMap) {
  return {
    id: form.id || undefined,
    node_uuid: form.node_uuid,
    name: form.name || defaultOutboundName(form.protocol),
    protocol: form.protocol,
    core: form.core,
    address: form.address,
    dest_port: Number(form.dest_port || 0),
    username: form.username,
    password: form.password,
    uuid: form.uuid,
    flow: form.flow,
    domain_strategy: form.domain_strategy,
    transport: form.transport,
    security: form.security,
    sni: form.sni,
    fingerprint: form.fingerprint,
    ws_path: form.ws_path,
    ws_host: form.ws_host,
    grpc_service: form.grpc_service,
    ss_method: form.protocol === "shadowsocks" ? form.ss_method : undefined,
    via_outbound: form.via_outbound,
    reality_public_key: form.reality_public_key,
    reality_short_id: form.reality_short_id,
    spider_x: form.spider_x,
    source_inbound_id: form.source_inbound_id,
    enabled: form.enabled !== "false",
  };
}

function routeUpsertBody(form: FormMap) {
  return {
    id: form.id || undefined,
    node_uuid: form.node_uuid,
    name: form.name,
    inbound_id: form.inbound_id,
    outbound_id: form.outbound_id,
    domain: form.domain,
    ip: form.ip,
    network: form.network,
    protocol: form.protocol,
    port: form.port,
    source: form.source,
    priority: Number(form.priority || 0),
    enabled: form.enabled !== "false",
  };
}

function subscriptionUpsertBody(form: FormMap) {
  return {
    id: form.id || undefined,
    user_id: form.user_id,
    format: form.format,
    auto_detect: form.auto_detect === "true",
    extra_urls: form.extra_urls,
    enabled: form.enabled !== "false",
  };
}

const SHEET_FIELD_HEIGHT = 40;

const sheetInputSx = {
  ...settingsFieldSx,
  "& .MuiInputBase-root": {
    boxSizing: "border-box",
    minHeight: SHEET_FIELD_HEIGHT,
    height: SHEET_FIELD_HEIGHT,
    alignItems: "center",
  },
  "& .MuiInputBase-root.MuiInputBase-multiline": {
    height: "auto",
    minHeight: SHEET_FIELD_HEIGHT,
    alignItems: "flex-start",
  },
  "& .MuiInputBase-input": {
    fontSize: 14,
    fontWeight: 400,
    lineHeight: "22px",
    boxSizing: "border-box",
    height: "100% !important",
    py: "0 !important",
  },
  "& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    boxSizing: "border-box",
    height: "100% !important",
    minHeight: "unset",
    py: "0 !important",
  },
  "& input[type=datetime-local], & input[type=date]": {
    height: "auto !important",
    minHeight: 22,
    lineHeight: "22px",
    letterSpacing: 0,
  },
  "& input[type=datetime-local]::-webkit-datetime-edit, & input[type=date]::-webkit-datetime-edit": {
    display: "inline-flex",
    alignItems: "center",
    padding: 0,
    overflow: "visible",
  },
  "& input[type=datetime-local]::-webkit-datetime-edit-fields-wrapper, & input[type=date]::-webkit-datetime-edit-fields-wrapper": {
    padding: 0,
  },
  "& input[type=datetime-local]::-webkit-datetime-edit-year-field, & input[type=date]::-webkit-datetime-edit-year-field": {
    minWidth: "4.5ch",
    padding: "0 1px",
  },
  "& input[type=datetime-local]::-webkit-datetime-edit-month-field, & input[type=datetime-local]::-webkit-datetime-edit-day-field, & input[type=date]::-webkit-datetime-edit-month-field, & input[type=date]::-webkit-datetime-edit-day-field": {
    minWidth: "2.5ch",
    padding: "0 1px",
  },
};

const sheetAutocompleteSx = {
  "& .MuiOutlinedInput-root": {
    boxSizing: "border-box",
    height: SHEET_FIELD_HEIGHT,
    minHeight: `${SHEET_FIELD_HEIGHT}px !important`,
    py: "0 !important",
    pl: "12px !important",
    pr: "36px !important",
    alignItems: "center",
  },
  "& .MuiAutocomplete-input": {
    py: "0 !important",
    px: "0 !important",
    height: "100% !important",
    minHeight: "0 !important",
    boxSizing: "border-box",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  "& .MuiAutocomplete-endAdornment": {
    right: 7,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    alignItems: "center",
  },
  "& .MuiAutocomplete-popupIndicator": {
    width: 24,
    height: 24,
    padding: 0,
    marginRight: 0,
  },
  "& .MuiAutocomplete-clearIndicator": {
    display: "none",
  },
};

const sheetAutocompleteMultiSx = {
  ...sheetAutocompleteSx,
  "& .MuiOutlinedInput-root": {
    boxSizing: "border-box",
    height: "auto",
    minHeight: `${SHEET_FIELD_HEIGHT}px !important`,
    py: "0 !important",
    pl: "12px !important",
    pr: "36px !important",
    alignItems: "center",
  },
  "& .MuiAutocomplete-input": {
    py: "0 !important",
    px: "0 !important",
    height: "24px !important",
    minHeight: "24px !important",
    boxSizing: "border-box",
  },
  "& .MuiChip-root": {
    height: 24,
  },
};

function Field({
  label,
  value,
  onChange,
  helper,
  placeholder,
  type = "text",
  name,
  autoComplete,
  ignorePasswordManager = false,
  multiline = false,
  required = false,
  endAdornment,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  placeholder?: string;
  type?: string;
  name?: string;
  autoComplete?: string;
  ignorePasswordManager?: boolean;
  multiline?: boolean;
  required?: boolean;
  endAdornment?: ReactNode;
}) {
  const ignoreFill = ignorePasswordManager || autoComplete === "off";
  const [readOnly, setReadOnly] = useState(ignoreFill);
  const dateTime = type === "datetime-local" || type === "date";
  return (
    <TextField
      size="small"
      fullWidth
      type={type}
      name={name}
      autoComplete={autoComplete ?? (ignoreFill ? "off" : undefined)}
      multiline={multiline}
      minRows={multiline ? 3 : undefined}
      lang={dateTime ? "en-CA" : undefined}
      label={label}
      required={required}
      helperText={helper}
      placeholder={placeholder}
      value={value}
      onFocus={() => {
        if (ignoreFill) setReadOnly(false);
      }}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        ...(placeholder || dateTime ? { inputLabel: { shrink: true } } : null),
        ...(endAdornment ? { input: { endAdornment } } : null),
        htmlInput: {
          ...(ignoreFill
            ? {
                readOnly,
                autoComplete: "off",
                autoCorrect: "off",
                autoCapitalize: "none",
                spellCheck: false,
                "data-1p-ignore": true,
                "data-lpignore": "true",
                "data-bwignore": true,
                "data-protonpass-ignore": true,
                "data-form-type": "other",
              }
            : {}),
          ...(dateTime ? { lang: "en-CA", step: 60 } : {}),
        },
      }}
      sx={sheetInputSx}
    />
  );
}

function ReadyField({
  ready,
  ...props
}: {
  ready: boolean;
} & Parameters<typeof Field>[0]) {
  if (ready) return <Field {...props} />;
  return (
    <Box>
      <Skeleton variant="rounded" height={SHEET_FIELD_HEIGHT} />
      {props.helper ? <Skeleton width="72%" height={16} sx={{ mt: 0.75 }} /> : null}
    </Box>
  );
}

function ExpiryField({
  label,
  value,
  onChange,
  helper,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper?: string;
  placeholder?: string;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const pickerValue = normalizeExpiryInput(value);
  const openPicker = () => {
    const el = pickerRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      el.showPicker();
      return;
    }
    el.click();
  };
  return (
    <Box sx={{ position: "relative" }}>
      <Field
        label={label}
        value={displayExpiryInput(value)}
        onChange={onChange}
        helper={helper}
        placeholder={placeholder ?? "yyyy/mm/dd HH:mm"}
        endAdornment={
          <InputAdornment position="end">
            <IconButton size="small" aria-label={label} title={label} onClick={openPicker}>
              <Calendar size={16} />
            </IconButton>
          </InputAdornment>
        }
      />
      <Box
        component="input"
        ref={pickerRef}
        type="datetime-local"
        value={/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(pickerValue) ? pickerValue : ""}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        aria-hidden
        sx={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      />
    </Box>
  );
}

function SheetSwitch({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Box data-sheet-switch="" sx={{ minWidth: 0, opacity: disabled ? 0.64 : 1 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 600, minWidth: 0 }}>{title}</Typography>
        <Switch checked={checked} disabled={disabled} onChange={(_, next) => onChange(next)} sx={{ flexShrink: 0 }} />
      </Box>
      {description ? (
        <Typography color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.6, mt: 0.25 }}>
          {description}
        </Typography>
      ) : null}
    </Box>
  );
}

type SelectOption = { value: string; label: string };

function optionOf(options: SelectOption[], value: string): SelectOption | null {
  return options.find((option) => option.value === value) ?? (value ? { value, label: value } : null);
}

function filterSelectOptions(options: SelectOption[], input: string) {
  const q = input.trim().toLowerCase();
  if (!q) return options;
  return options.filter(
    (option) => option.label.toLowerCase().includes(q) || option.value.toLowerCase().includes(q),
  );
}

function SearchableSelect({
  label,
  value,
  onChange,
  options,
  helper,
  sx,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  helper?: string;
  sx?: object;
}) {
  const selected = optionOf(options, value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <Autocomplete
      size="small"
      fullWidth
      options={options}
      value={selected}
      open={open}
      onOpen={() => {
        setOpen(true);
        setQuery("");
      }}
      onClose={() => {
        setOpen(false);
        setQuery("");
      }}
      inputValue={open ? query : (selected?.label ?? "")}
      onInputChange={(_, next, reason) => {
        if (!open || reason === "reset") return;
        setQuery(next);
      }}
      onChange={(_, next) => onChange(next?.value ?? "")}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(a, b) => a.value === b.value}
      filterOptions={(opts) => filterSelectOptions(opts, open ? query : "")}
      autoHighlight
      sx={sx ?? sheetAutocompleteSx}
      renderInput={(params) => (
        <TextField {...params} size="small" label={label} helperText={helper} sx={sheetInputSx} />
      )}
    />
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  helper,
  searchable = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  helper?: string;
  searchable?: boolean;
  disabled?: boolean;
}) {
  if (searchable) {
    return (
      <SearchableSelect
        label={label}
        value={value}
        onChange={onChange}
        options={options}
        helper={helper}
      />
    );
  }
  return (
    <TextField
      select
      size="small"
      fullWidth
      disabled={disabled}
      label={label}
      helperText={helper}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        inputLabel: { shrink: true },
        select: {
          displayEmpty: true,
          renderValue: (selected) => {
            const current = String(selected ?? "");
            return options.find((option) => option.value === current)?.label || current;
          },
        },
      }}
      sx={sheetInputSx}
    >
      {options.map((option) => (
        <MenuItem key={option.value || "__empty"} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

function SearchableMultiSelect({
  label,
  value,
  onChange,
  options,
  helper,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  helper?: string;
}) {
  const selected = options.filter((option) => value.includes(option.value));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  return (
    <Autocomplete
      multiple
      size="small"
      fullWidth
      options={options}
      value={selected}
      open={open}
      onOpen={() => {
        setOpen(true);
        setQuery("");
      }}
      onClose={() => {
        setOpen(false);
        setQuery("");
      }}
      inputValue={query}
      onInputChange={(_, next, reason) => {
        if (reason === "reset") return;
        setQuery(next);
      }}
      onChange={(_, next) => onChange(next.map((option) => option.value))}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(a, b) => a.value === b.value}
      filterOptions={(opts) => filterSelectOptions(opts, query)}
      autoHighlight
      disableCloseOnSelect
      sx={{
        ...sheetAutocompleteMultiSx,
        "& .MuiOutlinedInput-root": {
          flexWrap: "nowrap",
          overflow: "hidden",
        },
        "& .MuiChip-root": {
          maxWidth: "calc(100% - 88px)",
        },
        "& .MuiChip-label": {
          display: "block",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
      }}
        renderValue={(tagValue) => {
          const items = Array.isArray(tagValue) ? tagValue : tagValue ? [tagValue] : [];
          const extra = items.length - 1;
          const first = items[0];
          if (!first) return null;
          return (
            <>
              <Chip size="small" label={first.label} title={first.label} />
              {extra > 0 ? <Chip size="small" label={`+${extra}`} /> : null}
            </>
          );
        }}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label={label}
          helperText={helper}
          sx={{
            ...sheetInputSx,
            "& .MuiInputBase-root": { height: "auto", minHeight: SHEET_FIELD_HEIGHT, alignItems: "center", flexWrap: "nowrap" },
            "& .MuiInputBase-input": { height: "24px !important", minWidth: "8ch" },
          }}
        />
      )}
    />
  );
}

function MultiSelectField({
  label,
  value,
  onChange,
  options,
  helper,
  emptyLabel,
  searchable = false,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  options: SelectOption[];
  helper?: string;
  emptyLabel?: string;
  searchable?: boolean;
}) {
  if (searchable) {
    return (
      <SearchableMultiSelect
        label={label}
        value={value}
        onChange={onChange}
        options={options}
        helper={helper}
      />
    );
  }
  return (
    <TextField
      select
      size="small"
      fullWidth
      label={label}
      helperText={helper}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        onChange(typeof next === "string" ? next.split(",") : next);
      }}
      slotProps={{
        inputLabel: { shrink: Boolean(emptyLabel) || value.length > 0 },
        select: {
          multiple: true,
          displayEmpty: Boolean(emptyLabel),
          renderValue: (selected) => {
            const ids = selected as string[];
            if (!ids.length) return emptyLabel || "";
            return ids
              .map((id) => options.find((option) => option.value === id)?.label || id)
              .join("、");
          },
        },
      }}
      sx={sheetInputSx}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
}) {
  return (
    <SearchableSelect
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      sx={{
        ...ADMIN_LIST_FIELD_SX,
        ...sheetAutocompleteSx,
        minWidth: { xs: 0, md: 220 },
        flex: { xs: "1 1 calc(50% - 12px)", md: "0 1 260px" },
      }}
    />
  );
}

function EnableSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Switch
      size="small"
      checked={checked}
      onClick={(event) => event.stopPropagation()}
      onChange={(_, next) => onChange(next)}
    />
  );
}

function TwoCol({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        alignItems: "start",
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}

function ThreeCol({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" },
        alignItems: "start",
        gap: 2,
      }}
    >
      {children}
    </Box>
  );
}

function ProxyAccountsEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const rows = parseProxyAccounts(value);
  const setRows = (next: ProxyAccountRow[]) => onChange(JSON.stringify(next));
  return (
    <Stack spacing={1} data-sheet-switch="">
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{t("nodemgt.http_accounts")}</Typography>
        <Button
          size="small"
          variant="text"
          startIcon={<Plus size={16} />}
          onClick={() => setRows([...rows, newProxyAccount()])}
          sx={{ minHeight: 32, px: 1, fontSize: 13, fontWeight: 600, textTransform: "none" }}
        >
          {t("nodemgt.http_account_add")}
        </Button>
      </Box>
      {rows.map((row, index) => (
        <Box key={`${index}-${row.user}`} sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Typography color="text.secondary" sx={{ width: 18, flexShrink: 0, fontSize: 13, textAlign: "right" }}>
            {index + 1}
          </Typography>
          <TextField
            size="small"
            fullWidth
            hiddenLabel
            value={row.user}
            placeholder={t("nodemgt.col_username")}
            autoComplete="off"
            onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, user: event.target.value } : item)))}
            sx={sheetInputSx}
          />
          <TextField
            size="small"
            fullWidth
            hiddenLabel
            value={row.pass}
            placeholder={t("nodemgt.col_password")}
            autoComplete="new-password"
            onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, pass: event.target.value } : item)))}
            sx={sheetInputSx}
          />
          <IconButton
            size="small"
            color="error"
            aria-label={t("nodemgt.delete")}
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
            disabled={rows.length <= 1}
          >
            <Trash size={16} />
          </IconButton>
        </Box>
      ))}
    </Stack>
  );
}

function ExtraLinksEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const rows = parseExtraLinks(value);
  const setRows = (next: ExtraLinkRow[]) => onChange(JSON.stringify(next));
  const addRow = (kind: ExtraLinkRow["kind"]) => {
    setRows([
      ...rows,
      {
        id: extraLinkID(),
        kind,
        value: "",
        remark: "",
        name_prefix: "",
        enabled: true,
        expires_at: "",
        last_fetch_at: "",
        last_fetch_error: "",
      },
    ]);
  };
  const patchRow = (id: string, patch: Partial<ExtraLinkRow>) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };
  const renderCard = (row: ExtraLinkRow) => (
    <Box
      key={row.id}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        p: 1.25,
      }}
    >
      <Stack spacing={1.25}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, flexShrink: 0 }}>
            <Switch
              size="small"
              checked={row.enabled}
              onChange={(_, next) => patchRow(row.id, { enabled: next })}
              slotProps={{ input: { "aria-label": t("nodemgt.enable") } }}
              sx={{ ml: -0.5 }}
            />
            <Typography sx={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{t("nodemgt.enable")}</Typography>
          </Box>
          <TextField
            size="small"
            fullWidth
            hiddenLabel
            value={row.value}
            placeholder={row.kind === "subscription" ? t("nodemgt.extra_link_sub_placeholder") : t("nodemgt.extra_link_placeholder")}
            onChange={(event) => patchRow(row.id, { value: event.target.value })}
            sx={sheetInputSx}
          />
          <IconButton size="small" color="error" aria-label={t("nodemgt.delete")} onClick={() => setRows(rows.filter((item) => item.id !== row.id))}>
            <Trash size={16} />
          </IconButton>
        </Box>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            alignItems: "start",
            gap: 1.25,
          }}
        >
          <Field label={t("nodemgt.extra_link_remark")} value={row.remark} onChange={(next) => patchRow(row.id, { remark: next })} />
          {row.kind === "subscription" ? (
            <Field label={t("nodemgt.extra_link_name_prefix")} value={row.name_prefix} onChange={(next) => patchRow(row.id, { name_prefix: next })} />
          ) : null}
          <ExpiryField
            label={t("nodemgt.extra_link_expires")}
            value={row.expires_at}
            onChange={(next) => patchRow(row.id, { expires_at: next })}
            placeholder={t("nodemgt.expires_at_help")}
          />
        </Box>
        {row.kind === "subscription" ? (
          <Typography color={row.last_fetch_error ? "error" : "text.secondary"} sx={{ fontSize: 12, lineHeight: 1.4 }}>
            {row.last_fetch_error
              ? t("nodemgt.extra_link_fetch_error", { error: row.last_fetch_error })
              : row.last_fetch_at
                ? formatWhen(row.last_fetch_at)
                : t("nodemgt.extra_link_fetch_never")}
          </Typography>
        ) : null}
      </Stack>
    </Box>
  );
  const addButtonSx = {
    alignSelf: "flex-start",
    minHeight: 34,
    px: 1.5,
    fontSize: 13,
    fontWeight: 600,
    textTransform: "none",
  };
  const links = rows.filter((row) => row.kind === "link");
  const subs = rows.filter((row) => row.kind === "subscription");
  return (
    <Stack spacing={2} data-sheet-switch="">
      <Typography color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.6 }}>
        {t("nodemgt.extra_links_help")}
      </Typography>
      <Stack spacing={1}>
        <Button size="small" variant="contained" startIcon={<Plus size={16} />} onClick={() => addRow("link")} sx={addButtonSx}>
          {t("nodemgt.extra_link_add")}
        </Button>
        {links.map(renderCard)}
      </Stack>
      <Stack spacing={1}>
        <Button size="small" variant="contained" startIcon={<Plus size={16} />} onClick={() => addRow("subscription")} sx={addButtonSx}>
          {t("nodemgt.extra_link_add_sub")}
        </Button>
        {subs.map(renderCard)}
      </Stack>
    </Stack>
  );
}

function FormSection({ title }: { title: string }) {
  return (
    <Typography sx={{ fontSize: 13, fontWeight: 700, pt: 0.5 }}>
      {title}
    </Typography>
  );
}

function SheetTabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: { id: string; label: string }[];
}) {
  if (items.length < 2) return null;
  return (
    <Tabs
      value={value}
      onChange={(_, next) => onChange(String(next))}
      variant="scrollable"
      scrollButtons={false}
      slotProps={{ indicator: { sx: { transition: "none", boxShadow: "none" } } }}
      sx={{
        minHeight: 40,
        flex: "0 0 auto",
        mx: -3,
        px: 3,
        mb: 0,
        borderBottom: 1,
        borderColor: "divider",
        "& .MuiTabs-flexContainer": { minHeight: 40, gap: 1 },
        "& .MuiTabs-indicator": { transition: "none", boxShadow: "none" },
        "& .MuiTab-root": {
          minHeight: 40,
          minWidth: 0,
          px: 1,
          textTransform: "none",
          fontWeight: 600,
          fontSize: 13,
          transition: "none",
        },
        "& .MuiTouchRipple-root": { display: "none" },
        "& .MuiTabs-scrollButtons": { display: "none" },
      }}
    >
      {items.map((item) => (
        <Tab disableRipple disableFocusRipple key={item.id} value={item.id} label={item.label} />
      ))}
    </Tabs>
  );
}

function SheetPane({
  tabbed = false,
  tabs,
  children,
}: {
  tabbed?: boolean;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {tabbed ? tabs : null}
      <Stack
        spacing={2}
        sx={{
          pt: tabbed ? 1.5 : 0,
          ...(tabbed
            ? {
                // Outlined labels sit in the padding; keep the empty band equal to switch rows.
                "& > *:first-of-type:not([data-sheet-switch])": { mt: 1.5 },
              }
            : null),
        }}
      >
        {children}
      </Stack>
    </Box>
  );
}

function RowActions({ children }: { children: ReactNode }) {
  return (
    <Stack
      className="admin-nodemgt-row-actions"
      direction="row"
      spacing={0.25}
      useFlexGap
      sx={{
        alignItems: "center",
        justifyContent: "flex-start",
        flexWrap: "nowrap",
        minWidth: 0,
        whiteSpace: "nowrap",
        "& .MuiButton-root": {
          minWidth: 0,
          px: 0.75,
          fontSize: 13,
          lineHeight: 1.25,
        },
        "& .MuiIconButton-root": {
          p: 0.5,
        },
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </Stack>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <IconButton
      size="small"
      color="error"
      aria-label={t("nodemgt.delete")}
      onClick={() => {
        if (window.confirm(t("nodemgt.delete_confirm"))) onClick();
      }}
    >
      <Trash size={16} />
    </IconButton>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  tone = "blue",
  loading,
}: {
  label: string;
  value: string;
  helper?: string;
  icon: ReactNode;
  tone?: "blue" | "green" | "orange";
  loading?: boolean;
}) {
  const colors = {
    blue: { bg: "rgba(14, 134, 221, 0.12)", fg: "#0E86DD" },
    green: { bg: "rgba(17, 141, 87, 0.12)", fg: "#118D57" },
    orange: { bg: "rgba(255, 171, 0, 0.15)", fg: "#B76E00" },
  }[tone];
  return (
    <Paper variant="outlined" sx={{ ...panelSx, minWidth: 0, minHeight: 124, p: { xs: 1.5, sm: 2 } }}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
        <Typography color="text.secondary" sx={{ minWidth: 0, fontSize: 13.5 }}>
          {label}
        </Typography>
        <Box sx={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", bgcolor: colors.bg, color: colors.fg, flexShrink: 0 }}>
          {icon}
        </Box>
      </Stack>
      {loading ? (
        <Skeleton width="72%" height={36} />
      ) : (
        <Typography sx={{ mt: 1, fontSize: { xs: 19, sm: 23 }, lineHeight: 1.3, fontWeight: 400 }}>
          {value}
        </Typography>
      )}
      {helper ? (
        <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 12, lineHeight: 1.35 }}>
          {helper}
        </Typography>
      ) : null}
    </Paper>
  );
}

function StatusChip({ value }: { value: string }) {
  const { t } = useTranslation();
  const color =
    value === "active" || value === "issued" || value === "applied" || value === "online"
      ? "green"
      : value === "disabled" || value === "failed"
        ? "red"
        : value === "pending" || value === "file_pending" || value === "expired" || value === "sent" || value === "saved"
          ? "orange"
          : "gray";
  return <Badge color={color}>{t(`nodemgt.status_${value}`, { defaultValue: value || "—" })}</Badge>;
}

function auditActionKey(action: string) {
  return String(action || "").replace(/^nodemgt\./, "").replace(/\./g, "_");
}

function deliveryStatusOf(row?: any) {
  const raw = String(row?.status || "").toLowerCase();
  if (raw === "pending") return "saved";
  return raw || "not_started";
}

function inboundTouched(row?: any, cmd?: any) {
  if (!cmd) return false;
  const rowAt = Date.parse(String(row?.updated_at || ""));
  const cmdAt = Date.parse(String(cmd?.created_at || cmd?.updated_at || ""));
  if (!Number.isFinite(rowAt) || !Number.isFinite(cmdAt)) return true;
  return rowAt >= cmdAt - 8000;
}

function inboundDeliveryOf(row?: any, cmd?: any) {
  const status = deliveryStatusOf(cmd);
  if (!cmd || status === "not_started") return status;
  if (inboundTouched(row, cmd)) return status;
  if (status === "sent" || status === "saved") return "applied";
  return status;
}

function InboundOverflow({ names }: { names: string[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(names.length > 1 ? 1 : names.length);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const layout = useCallback(() => {
    const host = hostRef.current;
    const measure = measureRef.current;
    if (!host || !measure) return;
    const chips = Array.from(measure.querySelectorAll("[data-chip]")) as HTMLElement[];
    const plus = measure.querySelector("[data-plus]") as HTMLElement | null;
    const widths = chips.map((el) => el.getBoundingClientRect().width);
    const plusW = plus ? plus.getBoundingClientRect().width : 36;
    setVisible(visibleChipCountFromRects(widths, 4, plusW, host.getBoundingClientRect().width));
  }, [names]);
  useLayoutEffect(() => {
    layout();
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => layout());
    observer.observe(host);
    return () => observer.disconnect();
  }, [layout]);
  if (!names.length) return <>{"—"}</>;
  const shown = names.slice(0, Math.max(1, visible));
  const extra = names.length - shown.length;
  const chipSx = {
    maxWidth: "100%",
    "& .MuiChip-label": {
      display: "block",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
  };
  return (
    <Box sx={{ position: "relative", width: "100%", minWidth: 0, maxWidth: "100%", overflow: "hidden" }}>
      <Stack
        ref={measureRef}
        direction="row"
        spacing={0.5}
        sx={{ position: "absolute", visibility: "hidden", pointerEvents: "none", whiteSpace: "nowrap" }}
        aria-hidden
      >
        {names.map((name, index) => (
          <Box key={`m-${name}-${index}`} data-chip="">
            <Badge color="gray">{name}</Badge>
          </Box>
        ))}
        <Box data-plus="">
          <Badge color="gray">+99</Badge>
        </Box>
      </Stack>
      <Stack
        ref={hostRef}
        direction="row"
        spacing={0.5}
        sx={{
          flexWrap: "nowrap",
          minWidth: 0,
          alignItems: "center",
          width: "100%",
          "& .MuiChip-root": chipSx,
        }}
      >
        {shown.map((name, index) => (
          <Box key={`${name}-${index}`} sx={{ minWidth: 0, maxWidth: extra ? "calc(100% - 44px)" : "100%" }}>
            <Badge color="gray" title={name}>
              {name}
            </Badge>
          </Box>
        ))}
        {extra > 0 ? (
          <>
            <Box
              component="button"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setAnchor(event.currentTarget);
              }}
              sx={{
                border: 0,
                p: 0,
                m: 0,
                bgcolor: "transparent",
                cursor: "pointer",
                lineHeight: 0,
                flexShrink: 0,
              }}
            >
              <Badge color="gray">{`+${extra}`}</Badge>
            </Box>
            <Popover
              open={Boolean(anchor)}
              anchorEl={anchor}
              onClose={() => setAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
              transformOrigin={{ vertical: "top", horizontal: "left" }}
              slotProps={{ paper: { sx: { p: 1, mt: 0.5, minWidth: 140, maxWidth: 280, boxShadow: "0 8px 24px rgba(15,23,42,0.12)" } } }}
            >
              <Stack spacing={0.75}>
                {names.map((name, index) => (
                  <Badge key={`${name}-${index}`} color="gray">{name}</Badge>
                ))}
              </Stack>
            </Popover>
          </>
        ) : null}
      </Stack>
    </Box>
  );
}

function DeliveryChip({ status, error }: { status?: string; error?: string }) {
  const { t } = useTranslation();
  const value = deliveryStatusOf({ status });
  const color =
    value === "applied"
      ? "green"
      : value === "failed"
        ? "red"
        : value === "sent" || value === "saved"
          ? "orange"
          : "gray";
  const detail = error ? nodemgtErrorMessage(error, t) : "";
  return (
    <Badge color={color} title={detail || undefined}>
      {t(`nodemgt.status_${value}`, { defaultValue: value })}
    </Badge>
  );
}

export default function PlusAdminPage() {
  const { t } = useTranslation();
  const { call } = useRPC2Call();
  const location = useLocation();
  const navigate = useNavigate();
  const { nodeDetail } = useNodeDetails();
  const { account } = useAccount();
  const { settings: siteSettings } = useSettings();
  const tab = PATH_TAB[location.pathname] || "overview";
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const cached = getNodemgtSnapshot();

  const [inbounds, setInbounds] = useState<any[]>(() => cached?.inbounds ?? []);
  const [users, setUsers] = useState<any[]>(() => cached?.users ?? []);
  const [plans, setPlans] = useState<any[]>(() => cached?.plans ?? []);
  const [certs, setCerts] = useState<any[]>(() => cached?.certs ?? []);
  const [rootCerts, setRootCerts] = useState<any[]>(() => cached?.root_certs ?? []);
  const [rootDomain, setRootDomain] = useState("");
  const [subs, setSubs] = useState<any[]>(() => cached?.subs ?? []);
  const [outbounds, setOutbounds] = useState<any[]>(() => cached?.outbounds ?? []);
  const [routes, setRoutes] = useState<any[]>(() => cached?.routes ?? []);
  const [nodeProfiles, setNodeProfiles] = useState<any[]>(() => cached?.nodes ?? []);
  const [audit, setAudit] = useState<any[]>(() => cached?.audit ?? []);
  const [diag, setDiag] = useState<any>(() => cached?.diag ?? {});
  const [delivery, setDelivery] = useState<any[]>(() => cached?.delivery ?? []);
  const [settings, setSettings] = useState<any>(() => cached?.settings ?? {});
  const [templates, setTemplates] = useState<NodemgtTemplateList>(() => cached?.templates ?? emptyNodemgtTemplates());
  const [issuer, setIssuer] = useState({
    cf_api_token: "",
    acme_email: str(cached?.settings?.acme_email),
  });
  const [subCfg, setSubCfg] = useState(() => cached?.settings ? subCfgFromSettings(cached.settings) : emptySubCfg);
  const [subPage, setSubPage] = useState<"list" | "access" | "templates">(
    location.pathname.endsWith("/templates") ? "templates" : "list",
  );
  const [certPage, setCertPage] = useState<"list" | "issuer">("list");
  const [loading, setLoading] = useState(() => !cached);
  const firstLoad = useRef(!cached);
  const [search, setSearch] = useState("");
  const [nodeFilter, setNodeFilter] = useState("");
  const [sheet, setSheet] = useState<{ kind: SheetKind; form: FormMap } | null>(null);
  const [sheetTab, setSheetTab] = useState("basic");
  const [saving, setSaving] = useState(false);
  const [secret, setSecret] = useState("");
  const [preview, setPreview] = useState<SubPreview | null>(null);
  const [ipLog, setIpLog] = useState<any | null>(null);
  const [error, setError] = useState("");
  const [importLink, setImportLink] = useState("");
  const twoFaEnabled = Boolean(account?.["2fa_enabled"]);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [, setHasGrant] = useState(() => Boolean(loadStoredRemoteGrant(FIREWALL_GRANT_SCOPE)));
  const grantRef = useRef("");
  const grantExpiresAtRef = useRef(0);
  const pageIDRef = useRef(loadStoredRemoteGrant(FIREWALL_GRANT_SCOPE)?.pageID || createRandomId());
  const [authPassword, setAuthPassword] = useState("");
  const [authOtp, setAuthOtp] = useState("");
  const [fwAuthOpen, setFwAuthOpen] = useState(false);
  const [fwAuthPending, setFwAuthPending] = useState<"save" | "toggle" | "delete" | null>(null);
  const fwToggleRef = useRef<{ row: any; enabled: boolean } | null>(null);
  const fwDeleteIdRef = useRef("");

  const siteRemoteOn = siteSettings?.allow_remote_management === true;
  const nodes = nodeDetail || [];
  const nodeOptions = useMemo(
    () => nodes.map((node) => ({ value: node.uuid, label: node.name || node.uuid })),
    [nodes],
  );
  const nodeName = useCallback(
    (uuid: string) => nodeOptions.find((item) => item.value === uuid)?.label || uuid || "—",
    [nodeOptions],
  );

  const clearGrant = useCallback(() => {
    grantRef.current = "";
    grantExpiresAtRef.current = 0;
    clearStoredRemoteGrant(FIREWALL_GRANT_SCOPE);
    setHasGrant(false);
  }, []);
  const rememberGrant = useCallback((grant?: string, expiresAt?: string) => {
    if (!grant) {
      clearGrant();
      return;
    }
    const expires = Date.parse(String(expiresAt ?? ""));
    grantRef.current = grant;
    grantExpiresAtRef.current = Number.isFinite(expires) ? expires : 0;
    saveStoredRemoteGrant(FIREWALL_GRANT_SCOPE, grant, grantExpiresAtRef.current, pageIDRef.current);
    setHasGrant(true);
  }, [clearGrant]);
  useEffect(() => {
    const stored = loadStoredRemoteGrant(FIREWALL_GRANT_SCOPE);
    if (!stored) return;
    grantRef.current = stored.grant;
    grantExpiresAtRef.current = stored.expiresAt;
    if (stored.pageID) pageIDRef.current = stored.pageID;
    setHasGrant(true);
  }, []);
  useEffect(() => {
    fetch("/api/admin/account/passkeys")
      .then((response) => response.json())
      .then((body) => {
        const items = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        setPasskeyAvailable(items.length > 0);
      })
      .catch(() => setPasskeyAvailable(false));
  }, []);
  const authorizeFirewall = async (password: string, otp: string, usePasskey: boolean) => {
    if (isRemoteGrantLive(grantRef.current, grantExpiresAtRef.current)) {
      const grant = grantRef.current;
      grantRef.current = "";
      setHasGrant(false);
      return grant;
    }
    let ceremony_id: string | undefined;
    let credential: unknown;
    if (usePasskey) {
      const assertion = await confirmAdminPasskey();
      ceremony_id = assertion.ceremony_id;
      credential = assertion.credential;
    }
    const response = await fetch("/api/admin/client/remote/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        scope: "exec",
        page_id: pageIDRef.current,
        password: usePasskey || twoFaEnabled ? undefined : password || undefined,
        otp: usePasskey || !twoFaEnabled ? undefined : otp,
        ceremony_id,
        credential,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    const grant = payload?.data?.grant;
    if (typeof grant !== "string" || !grant) throw new Error(t("terminal.session.auth_failed"));
    return grant;
  };
  const takeFirewallResult = (raw: any) => {
    rememberGrant(raw?.next_grant, raw?.expires_at);
    return stripFirewallGrantFields(raw || {});
  };
  const firewallUnavailableLabel = (reason: ReturnType<typeof inboundFirewallUnavailable>) => {
    if (reason === "site_remote_off") return t("nodemgt.firewall_site_off");
    if (reason === "agent_old") return t("nodemgt.firewall_agent_old");
    if (reason === "remote_off") return t("nodemgt.firewall_remote_off");
    if (reason === "no_node") return t("nodemgt.firewall_allow_need_node");
    return "";
  };
  const inboundNodeOf = (uuid: string) => nodes.find((node) => node.uuid === uuid);
  const inboundFirewallReason = (uuid: string) => inboundFirewallUnavailable(inboundNodeOf(uuid), siteRemoteOn);

  const applySnapshot = useCallback((snap: NodemgtSnapshot) => {
    setInbounds(snap.inbounds);
    setUsers(snap.users);
    setPlans(snap.plans);
    setCerts(snap.certs);
    setRootCerts(snap.root_certs || []);
    setSubs(snap.subs);
    setOutbounds(snap.outbounds);
    setRoutes(snap.routes);
    setNodeProfiles((snap.nodes || []).map((row) => ({ ...row, id: str(row?.node_uuid || row?.id) })));
    setAudit(snap.audit);
    setDiag(snap.diag);
    setDelivery(snap.delivery);
    setSettings(snap.settings);
    setTemplates(snap.templates);
    setIssuer((current) => ({
      ...current,
      acme_email: str(snap.settings?.acme_email, current.acme_email),
    }));
    setSubCfg(subCfgFromSettings(snap.settings));
    setLoading(false);
  }, []);

  const commitRows = useCallback((
    key: "inbounds" | "users" | "plans" | "certs" | "subs" | "outbounds" | "routes" | "nodes",
    mutate: (rows: any[]) => any[],
  ) => {
    const patch = (current: any[]) => {
      const next = mutate(current);
      patchNodemgtSnapshot({ [key]: next });
      return next;
    };
    switch (key) {
      case "inbounds":
        setInbounds(patch);
        break;
      case "users":
        setUsers(patch);
        break;
      case "plans":
        setPlans(patch);
        break;
      case "certs":
        setCerts(patch);
        break;
      case "subs":
        setSubs(patch);
        break;
      case "outbounds":
        setOutbounds(patch);
        break;
      case "routes":
        setRoutes(patch);
        break;
      case "nodes":
        setNodeProfiles(patch);
        break;
    }
  }, []);

  const load = useCallback(async (opts?: { force?: boolean; reload?: boolean }) => {
    const reload = Boolean(opts?.reload);
    const force = opts?.force !== false || reload;
    if (firstLoad.current && !getNodemgtSnapshot()) setLoading(true);
    try {
      const snap = await prefetchNodemgtAdmin({
        force,
        reload,
        primary: nodemgtPrimaryMethods(tabRef.current),
        onPartial: applySnapshot,
      });
      applySnapshot(snap);
      return snap.delivery;
    } catch (err) {
      if (reload) throw err;
      toast.error(nodemgtErrorMessage(err, t));
      return [] as any[];
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
  }, [applySnapshot, t]);

  const loadAfterChange = useCallback(async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await load({ force: true, reload: true });
      } catch (err) {
        lastErr = err;
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    toast.error(nodemgtErrorMessage(lastErr, t));
    return getNodemgtSnapshot()?.delivery ?? [];
  }, [load, t]);

  useEffect(() => {
    void load({ force: !getNodemgtSnapshot() });
  }, [load]);

  useEffect(() => {
    if (!location.pathname.endsWith("/templates")) return;
    setSubPage("templates");
    navigate(location.pathname.replace(/\/templates$/, "/subscriptions"), { replace: true });
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!ipLog?.id) return;
    const next = users.find((row) => row.id === ipLog.id);
    if (next && next !== ipLog) setIpLog(next);
  }, [users, ipLog]);

  const deliveryBusy = delivery.some((row) => {
    const status = deliveryStatusOf(row);
    return status === "saved" || status === "sent";
  });
  const certBusy = certs.some((row) => row.status === "pending");
  const rootBusy = rootCerts.some((row) => row.status === "pending");
  useEffect(() => {
    if (!deliveryBusy && !certBusy && !rootBusy) return;
    const timer = window.setInterval(() => {
      void Promise.all([
        call("admin:nodemgt.control.status", {}),
        certBusy ? call("admin:nodemgt.cert.list", {}) : Promise.resolve(null),
        rootBusy ? call("admin:nodemgt.root_cert.list", {}) : Promise.resolve(null),
      ])
        .then(([rows, certRows, rootRows]) => {
          setDelivery(asList(rows));
          if (certRows) setCerts(asList(certRows));
          if (rootRows) {
            const next = asList(rootRows);
            setRootCerts(next);
            patchNodemgtSnapshot({ root_certs: next });
          }
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [call, deliveryBusy, certBusy, rootBusy]);

  const toastAfterSync = (nodeUUID: string | undefined, rows: any[]) => {
    if (!nodeUUID) {
      toast.success(t("nodemgt.saved"));
      return;
    }
    const row = rows.find((item) => item.node_uuid === nodeUUID);
    const status = deliveryStatusOf(row);
    if (status === "failed") {
      toast.error(nodemgtErrorMessage(row?.last_error, t) || t("nodemgt.delivery_failed"));
      return;
    }
    toast.success(t(`nodemgt.delivery_${status}`));
  };

  const nodeDelivery = (uuid: string) => delivery.find((row) => row.node_uuid === uuid);
  const nodeDialStackOf = (uuid: string) =>
    normalizeDialStack(nodeProfiles.find((row) => row.node_uuid === uuid)?.dial_stack);

  const matchSearch = (row: any, keys: string[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return keys.some((key) => str(row[key]).toLowerCase().includes(q));
  };
  const matchNode = (row: any) => !nodeFilter || row.node_uuid === nodeFilter;

  const visibleInbounds = inbounds
    .filter((row) => matchNode(row) && matchSearch(row, ["name", "protocol", "core"]))
    .slice()
    .sort((a, b) => Number(a.sort_index || 0) - Number(b.sort_index || 0) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const visibleUsers = users.filter((row) => matchSearch(row, ["username", "display_name", "plan_name", "status"])).slice().sort(byCreatedAt);
  const visiblePlans = plans.filter((row) => matchSearch(row, ["name"]));
  const visibleCerts = certs.filter((row) => matchNode(row) && matchSearch(row, ["domain", "status", "issuer"]));
  const visibleSubs = subs.filter((row) => matchSearch(row, ["user_id", "format", "token"]));
  const visibleOutbounds = outbounds.filter((row) => matchNode(row) && matchSearch(row, ["name", "protocol", "address"])).slice().sort(byCreatedAt);
  const visibleRoutes = routes
    .filter((row) => matchNode(row) && matchSearch(row, ["name", "domain"]))
    .slice()
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0) || byCreatedAt(a, b));
  const visibleAudit = audit.filter((row) => matchSearch(row, ["actor", "action", "target"]));
  const diagRows = Array.isArray(diag.commands) && diag.commands.length ? diag.commands : delivery;
  const diagPending = diagRows.filter((row: any) => {
    const status = deliveryStatusOf(row);
    return status === "saved" || status === "sent";
  }).length;
  const diagFailed = diagRows.filter((row: any) => deliveryStatusOf(row) === "failed").length;
  const overviewRows = nodeOptions
    .filter((node) => !nodeFilter || node.value === nodeFilter)
    .filter((node) => matchSearch({ name: node.label }, ["name"]))
    .map((node) => {
      const cmd = nodeDelivery(node.value);
      const sample =
        inbounds.find((row) => row.node_uuid === node.value && row.enabled !== false) ||
        outbounds.find((row) => row.node_uuid === node.value && row.enabled !== false) ||
        routes.find((row) => row.node_uuid === node.value && row.enabled !== false);
      const status = sample ? inboundDeliveryOf(sample, cmd) : deliveryStatusOf(cmd);
      return {
        node_uuid: node.value,
        name: node.label,
        dial_stack: normalizeDialStack(nodeProfiles.find((row) => row.node_uuid === node.value)?.dial_stack),
        status,
        last_error: status === "failed" ? cmd?.last_error : undefined,
        updated_at: cmd?.updated_at || cmd?.created_at,
      };
    });
  const listRows =
    tab === "inbounds"
      ? visibleInbounds
      : tab === "outbounds"
        ? visibleOutbounds
        : tab === "routes"
          ? visibleRoutes
          : tab === "users"
            ? visibleUsers
            : tab === "plans"
              ? visiblePlans
              : tab === "certs"
                ? visibleCerts
                : tab === "subscriptions"
                  ? visibleSubs
                  : tab === "audit"
                    ? visibleAudit
                    : overviewRows;
  const listPager = useAdminPagination(listRows);

  useEffect(() => {
    listPager.setPage(1);
  }, [tab, search, nodeFilter, listPager.setPage]);

  const inboundOptions = inbounds.map((row) => ({
    value: row.id,
    label: `${row.name} · ${row.protocol} :${row.port}`,
  }));
  const inboundSourceOptions = inbounds
    .filter((row) => row.enabled !== false && isProxyOutbound(row.protocol))
    .map((row) => ({
      value: row.id,
      label: `${nodeName(row.node_uuid)} / ${row.name} · ${row.protocol} :${row.port}`,
    }));
  const userOptions = users.map((row) => ({ value: row.id, label: row.username || row.id }));
  const planOptions = [{ value: "", label: t("nodemgt.plan_none") }, ...plans.map((row) => ({ value: row.id, label: row.name }))];
  const outboundOptions = outbounds.map((row) => ({ value: row.id, label: row.name }));
  const builtinOutboundOptions = [
    { value: "direct", label: t("nodemgt.builtin_direct") },
    { value: "block", label: t("nodemgt.builtin_block") },
  ];
  const sheetNode = sheet?.form.node_uuid || "";
  const nodeInboundOptions = inboundOptions.filter((item) => {
    const row = inbounds.find((inbound) => inbound.id === item.value);
    return !sheetNode || row?.node_uuid === sheetNode;
  });
  const nodeOutboundOptions = outboundOptions.filter((item) => {
    const row = outbounds.find((outbound) => outbound.id === item.value);
    return !sheetNode || row?.node_uuid === sheetNode;
  });
  const viaOutboundOptions = outbounds
    .filter((row) => (!sheetNode || row.node_uuid === sheetNode) && row.name && row.name !== sheet?.form.name)
    .map((row) => ({ value: row.name, label: row.name }));
  const issuedRoots = rootCerts.filter((row) => row.status === "issued" || row.id === sheet?.form.root_cert_id);
  const issuedCerts = certs.filter(
    (row) =>
      (!sheetNode || row.node_uuid === sheetNode) &&
      (row.status === "issued" || isFileCert(row) || row.id === sheet?.form.cert_id),
  );
  const certOptions = [
    { value: "", label: t("nodemgt.cert_none") },
    ...issuedCerts.map((row) => ({ value: row.id, label: certOptionLabel(row) })),
  ];
  const bindCertPatch = (certId: string, current: FormMap = sheet?.form || {}): FormMap => {
    const cert = certs.find((row) => row.id === certId);
    const tlsDomain = str(current.tls_domain) || str(cert?.share_domain);
    return {
      cert_id: certId,
      tls_domain: tlsDomain,
      sni: str(current.sni) || tlsDomain || certShareHost(cert) || current.sni,
    };
  };
  const firstIssuedCert = (nodeUUID: string) =>
    certs.find((row) => row.node_uuid === nodeUUID && (row.status === "issued" || isFileCert(row)));

  const setForm = (patch: FormMap) => {
    setSheet((current) => (current ? { ...current, form: { ...current.form, ...patch } } : current));
  };

  const applyShareLink = (raw: string) => {
    const parsed = parseShareLink(raw);
    if (!parsed?.protocol || !parsed.address) return false;
    const protocol = parsed.protocol;
    setForm({
      protocol,
      name: parsed.name || sheet?.form.name || "",
      address: parsed.address || "",
      dest_port: parsed.dest_port || "",
      uuid: parsed.uuid || "",
      password: parsed.password || "",
      username: parsed.username || "",
      flow: flowForCore(parsed.flow || "", defaultCore(protocol)),
      transport: parsed.transport || "tcp",
      security: parsed.security || "none",
      sni: parsed.sni || "",
      fingerprint: parsed.fingerprint || DEFAULT_FINGERPRINT,
      ws_path: parsed.ws_path || "/",
      ws_host: parsed.ws_host || "",
      grpc_service: parsed.grpc_service || "gun",
      ss_method: parsed.ss_method || DEFAULT_SS_METHOD,
      reality_public_key: parsed.reality_public_key || "",
      reality_short_id: parsed.reality_short_id || "",
      spider_x: parsed.spider_x || "/",
      core: defaultCore(protocol),
    });
    setImportLink("");
    toast.success(t("nodemgt.outbound_import_ok"));
    return true;
  };

  const applyInboundSource = (inboundId: string) => {
    if (!inboundId) {
      setForm({ source_inbound_id: "" });
      return;
    }
    const inbound = inbounds.find((row) => row.id === inboundId);
    if (!inbound) {
      setForm({ source_inbound_id: inboundId });
      return;
    }
    const node = nodes.find((item) => item.uuid === inbound.node_uuid);
    const boundCert = certs.find((row) => row.id === inbound.cert_id && str(row.domain) && str(row.status, "issued") === "issued");
    const nodeCert = certs.find((row) => row.node_uuid === inbound.node_uuid && str(row.domain) && str(row.status) === "issued");
    const fields = outboundFieldsFromInbound(inbound, node, boundCert || nodeCert);
    const uuid = uuidForInbound(inbound, users) || sheet?.form.uuid || "";
    const granted = (users || []).find(
      (user) => user && user.status !== "disabled" && uuidForInbound(inbound, [user]) === uuid,
    );
    const httpAcct = parseProxyAccounts(inbound?.accounts)[0];
    const httpUser = String(httpAcct?.user || granted?.username || uuid || sheet?.form.username || "");
    void outboundPasswordFromInbound(inbound, users).then((ssPassword) => {
      setForm({
        ...fields,
        source_inbound_id: inboundId,
        name: outboundTagFromInbound(inbound, sheet?.form.name),
        uuid: fields.protocol === "shadowsocks" ? uuidForInbound(inbound, users) : uuid,
        username: fields.protocol === "http" || fields.protocol === "socks" ? httpUser : sheet?.form.username || "",
        password: fields.protocol === "shadowsocks" ? ssPassword : httpAcct?.pass || uuid || sheet?.form.password || "",
        flow: flowForCore(fields.flow || sheet?.form.flow || "", fields.core || sheet?.form.core),
      });
      setImportLink("");
      if (!fields.address) {
        toast.error(t("nodemgt.outbound_from_inbound_no_address"));
        return;
      }
      toast.success(t("nodemgt.outbound_from_inbound_ok"));
    });
  };

  const openCreate = (kind: SheetKind) => {
    const forms: Record<SheetKind, FormMap> = {
      inbound: inboundForm(),
      user: userForm({}),
      plan: planForm({}),
      cert: certForm({ node_uuid: nodeFilter }),
      subscription: subscriptionForm({}),
      outbound: outboundForm({}),
      route: routeForm({}),
      node: nodeForm({ node_uuid: nodeFilter }),
    };
    setError("");
    setImportLink("");
    setSheetTab("basic");
    setSheet({ kind, form: forms[kind] });
  };

  const openEdit = (kind: SheetKind, row: any) => {
    const forms: Record<SheetKind, FormMap> = {
      inbound: inboundForm(row),
      user: userForm(row),
      plan: planForm(row),
      cert: certForm(row),
      subscription: subscriptionForm(row),
      outbound: outboundForm(row),
      route: routeForm(row),
      node: nodeForm(row),
    };
    setError("");
    setImportLink("");
    setSheetTab("basic");
    setSheet({ kind, form: forms[kind] });
  };

  const closeSheet = () => {
    setSheet(null);
    setError("");
    setImportLink("");
  };

  const clearIssuer = async () => {
    try {
      const next = await call("admin:nodemgt.settings.set", { clear_issuer: true });
      setSettings(next);
      setIssuer({ cf_api_token: "", acme_email: "" });
      toast.success(t("nodemgt.issuer_cleared"));
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const saveIssuer = async () => {
    if (!issuer.cf_api_token.trim() && !settings.cf_api_token_set) {
      toast.error(t("nodemgt.cf_token_required"));
      return;
    }
    if (!issuer.acme_email.trim()) {
      toast.error(t("nodemgt.acme_email_required"));
      return;
    }
    try {
      const next = await call("admin:nodemgt.settings.set", {
        cf_api_token: issuer.cf_api_token,
        acme_email: issuer.acme_email,
      });
      setSettings(next);
      setIssuer((current) => ({ ...current, cf_api_token: "" }));
      toast.success(t("nodemgt.saved"));
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const saveSubSettings = async (patch?: Partial<typeof subCfg>) => {
    const nextCfg = { ...subCfg, ...patch };
    const reuse = Boolean(nextCfg.sub_reuse_https);
    if (reuse && (!str(settings.https_certificate_path) || !str(settings.https_private_key_path))) {
      toast.error(t("nodemgt.sub_reuse_https_missing"));
      throw new Error("missing https");
    }
    try {
      const next = await call("admin:nodemgt.settings.set", {
        sub_listen_port: Number(nextCfg.sub_listen_port || 0),
        sub_public_port: Number(nextCfg.sub_public_port || 0),
        sub_path: nextCfg.sub_path,
        sub_public_host: nextCfg.sub_public_host,
        sub_reuse_https: reuse,
      });
      setSettings(next);
      setSubCfg(subCfgFromSettings(next as Record<string, any>));
      toast.success(t("nodemgt.saved"));
      await loadAfterChange();
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
      throw err;
    }
  };

  const rememberTemplates = useCallback((next: NodemgtTemplateList) => {
    setTemplates(next);
    patchNodemgtSnapshot({ templates: next });
  }, []);

  const save = async (firewallGrant?: string) => {
    if (!sheet) return;
    setSaving(true);
    setError("");
    try {
      const form = sheet.form;
      let saved: any;
      if (sheet.kind === "inbound") {
        if (form.security === "tls" && !form.cert_id) {
          setError(t("nodemgt.no_certs"));
          return;
        }
        if (form.share_strategy === "other" && !form.public_host.trim()) {
          setError(t("nodemgt.share_other_required"));
          return;
        }
        const inboundPort = Number(form.port || 443);
        if (!Number.isInteger(inboundPort) || inboundPort < 1 || inboundPort > 65535) {
          setError(t("nodemgt.invalid_inbound_port"));
          return;
        }
        const existing = inbounds.find((row) => str(row.id) === form.id) || null;
        const needsGrant = inboundNeedsFirewallGrant(form, existing, Boolean(inboundNodeOf(form.node_uuid)));
        if (needsGrant) {
          if (form.firewall_allow === "true" && form.enabled !== "false") {
            const reason = inboundFirewallReason(form.node_uuid);
            if (reason) {
              setError(firewallUnavailableLabel(reason));
              return;
            }
          }
          if (!firewallGrant && !isRemoteGrantLive(grantRef.current, grantExpiresAtRef.current)) {
            setFwAuthPending("save");
            setFwAuthOpen(true);
            return;
          }
        }
        const body: Record<string, unknown> = inboundUpsertBody(form);
        if (needsGrant) {
          body.grant = firewallGrant || await authorizeFirewall("", "", false);
          body.page_id = pageIDRef.current;
        }
        saved = takeFirewallResult(await call("admin:nodemgt.inbound.upsert", body));
      } else if (sheet.kind === "user") {
        const inboundIds = form.inbound_ids.split(",").map((item) => item.trim()).filter(Boolean);
        if (!inboundIds.length) {
          setError(t("nodemgt.no_inbounds"));
          return;
        }
        const resetDay = Number(form.traffic_reset_day || 0);
        if (!Number.isInteger(resetDay) || resetDay < 0 || resetDay > 31) {
          setError(t("nodemgt.invalid_reset_day"));
          return;
        }
        const extraLinks = extraLinksPayload(form.extra_links);
        if (extraLinks.some((row) => row.enabled && !row.value.trim())) {
          setError(t("nodemgt.extra_link_value_required"));
          return;
        }
        saved = await call("admin:nodemgt.user.upsert", {
          id: form.id || undefined,
          username: form.username,
          display_name: form.display_name,
          inbound_ids: inboundIds,
          plan_id: form.plan_id,
          flow: form.flow,
          rate_limit_bps: mbpsToBps(form.rate_mbps),
          device_limit: Number(form.device_limit || 0),
          expires_at: fromDateTimeLocal(form.expires_at),
          traffic_reset_day: resetDay,
          status: form.enabled === "false" ? "disabled" : "active",
          extra_links: extraLinks,
        });
        if (!form.id) {
          const secret = str(saved?.secret);
          if (secret) setSecret(secret);
        }
      } else if (sheet.kind === "plan") {
        saved = await call("admin:nodemgt.plan.upsert", {
          id: form.id || undefined,
          name: form.name,
          traffic_bytes: giBToBytes(form.traffic_gib),
          duration_days: Number(form.duration_days || 30),
          rate_limit_bps: mbpsToBps(form.rate_mbps),
          device_limit: Number(form.device_limit || 0),
        });
      } else if (sheet.kind === "cert") {
        const source = form.source === "file" ? "file" : form.source === "root" ? "root" : "acme";
        if (source === "root" && !form.root_cert_id) {
          setError(t("nodemgt.root_cert_required"));
          return;
        }
        if (source === "root" && !form.share_domain.trim()) {
          setError(t("nodemgt.cert_share_domain_required"));
          return;
        }
        if (source !== "root" && (!form.domain.trim() || !form.node_uuid)) {
          setError(t("nodemgt.domain_node_required"));
          return;
        }
        saved = await call("admin:nodemgt.cert.request", {
          id: form.id || undefined,
          domain: form.domain,
          root_cert_id: source === "root" ? form.root_cert_id : "",
          share_domain: form.share_domain,
          cover_wildcard: source === "acme" ? false : undefined,
          node_uuid: form.node_uuid,
          source,
          cert_path: source === "file" ? form.cert_path : "",
          key_path: source === "file" ? form.key_path : "",
        });
      } else if (sheet.kind === "subscription") {
        saved = await call("admin:nodemgt.subscription.upsert", subscriptionUpsertBody(form));
      } else if (sheet.kind === "outbound") {
        const clash = outboundTagConflict(form.name, form.node_uuid, outbounds, form.id);
        if (clash === "reserved") {
          setError(t("nodemgt.outbound_tag_reserved"));
          return;
        }
        if (clash === "duplicate") {
          setError(t("nodemgt.outbound_tag_duplicate"));
          return;
        }
        saved = await call("admin:nodemgt.outbound.upsert", outboundUpsertBody(form));
      } else if (sheet.kind === "route") {
        if (!form.outbound_id) {
          setError(t("nodemgt.route_outbound_required"));
          return;
        }
        saved = await call("admin:nodemgt.route.upsert", routeUpsertBody(form));
      } else if (sheet.kind === "node") {
        if (!form.node_uuid) {
          setError(t("nodemgt.node_help"));
          return;
        }
        saved = await call("admin:nodemgt.node.upsert", {
          node_uuid: form.node_uuid,
          dial_stack: normalizeDialStack(form.dial_stack),
        });
      }
      const row = upsertedRow(sheet.kind, saved);
      if (row) commitRows(SNAPSHOT_LIST_KEY[sheet.kind], (rows) => mergeById(rows, row));
      const nodeUUID = form.node_uuid;
      const syncsNode = sheet.kind === "inbound" || sheet.kind === "outbound" || sheet.kind === "route" || sheet.kind === "user" || sheet.kind === "cert" || sheet.kind === "node";
      closeSheet();
      const rows = await loadAfterChange();
      if (syncsNode) toastAfterSync(nodeUUID, rows);
      else toast.success(t("nodemgt.saved"));
    } catch (err) {
      setError(localizeRemoteError(err instanceof Error ? err.message : "", t) || nodemgtErrorMessage(err, t, sheet.kind));
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (method: string, id: string, firewallGrant?: string) => {
    try {
      const params: Record<string, unknown> = { id };
      if (method === "admin:nodemgt.inbound.delete") {
        const row = inbounds.find((item) => str(item?.id) === id);
        const nodePresent = Boolean(inboundNodeOf(str(row?.node_uuid)));
        const linked = nodePresent && (Boolean(row?.firewall_linked) || (sheet?.kind === "inbound" && sheet.form.id === id && sheet.form.firewall_allow === "true"));
        if (linked) {
          if (!firewallGrant && !isRemoteGrantLive(grantRef.current, grantExpiresAtRef.current)) {
            fwDeleteIdRef.current = id;
            setFwAuthPending("delete");
            setFwAuthOpen(true);
            return;
          }
          params.grant = firewallGrant || await authorizeFirewall("", "", false);
          params.page_id = pageIDRef.current;
        }
      }
      const raw = await call(method, params);
      if (method === "admin:nodemgt.inbound.delete") takeFirewallResult(raw);
      const key = DELETE_LIST_KEY[method];
      if (key) commitRows(key, (rows) => rows.filter((item) => str(item?.id) !== id));
      closeSheet();
      toast.success(t("nodemgt.saved"));
      void load({ force: true, reload: true }).catch(() => undefined);
    } catch (err) {
      toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || nodemgtErrorMessage(err, t));
    }
  };

  const toggleRowEnabled = async (kind: "inbound" | "outbound" | "route" | "subscription", row: any, enabled: boolean, firewallGrant?: string) => {
    const formEnabled = enabled ? "true" : "false";
    try {
      let saved: any;
      if (kind === "inbound") {
        if (row.firewall_linked && inboundNodeOf(str(row.node_uuid))) {
          if (enabled) {
            const reason = inboundFirewallReason(row.node_uuid);
            if (reason) {
              toast.error(firewallUnavailableLabel(reason));
              return;
            }
          }
          if (!firewallGrant && !isRemoteGrantLive(grantRef.current, grantExpiresAtRef.current)) {
            fwToggleRef.current = { row, enabled };
            setFwAuthPending("toggle");
            setFwAuthOpen(true);
            return;
          }
          const body: Record<string, unknown> = inboundUpsertBody({ ...inboundForm(row), enabled: formEnabled });
          body.grant = firewallGrant || await authorizeFirewall("", "", false);
          body.page_id = pageIDRef.current;
          saved = takeFirewallResult(await call("admin:nodemgt.inbound.upsert", body));
        } else {
          saved = await call("admin:nodemgt.inbound.upsert", inboundUpsertBody({ ...inboundForm(row), enabled: formEnabled }));
        }
      } else if (kind === "outbound") {
        saved = await call("admin:nodemgt.outbound.upsert", outboundUpsertBody({ ...outboundForm(row), enabled: formEnabled }));
      } else if (kind === "route") {
        saved = await call("admin:nodemgt.route.upsert", routeUpsertBody({ ...routeForm(row), enabled: formEnabled }));
      } else {
        saved = await call("admin:nodemgt.subscription.upsert", subscriptionUpsertBody({ ...subscriptionForm(row), enabled: formEnabled }));
      }
      const next = upsertedRow(kind, saved);
      if (next) commitRows(SNAPSHOT_LIST_KEY[kind], (rows) => mergeById(rows, next));
      toastAfterSync(row.node_uuid, await loadAfterChange());
    } catch (err) {
      toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || nodemgtErrorMessage(err, t));
    }
  };

  const confirmFirewallAuth = async (usePasskey = false) => {
    try {
      const grant = await authorizeFirewall(authPassword, authOtp, usePasskey);
      if (fwAuthPending === "save") {
        await save(grant);
      } else if (fwAuthPending === "toggle" && fwToggleRef.current) {
        const pending = fwToggleRef.current;
        await toggleRowEnabled("inbound", pending.row, pending.enabled, grant);
      } else if (fwAuthPending === "delete") {
        await removeRow("admin:nodemgt.inbound.delete", fwDeleteIdRef.current, grant);
      }
      setFwAuthOpen(false);
      setFwAuthPending(null);
      setAuthPassword("");
      setAuthOtp("");
    } catch (err) {
      toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || nodemgtErrorMessage(err, t));
    }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      const user = users.find((row) => row.id === id);
      await call("admin:nodemgt.user.setStatus", { id, status, operation_id: newOp() });
      commitRows("users", (rows) => rows.map((row) => (str(row?.id) === id ? { ...row, status } : row)));
      toastAfterSync(user?.node_uuid, await loadAfterChange());
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const renew = async (userId: string) => {
    try {
      const user = users.find((row) => row.id === userId);
      await call("admin:nodemgt.assignment.renew", { user_id: userId, operation_id: newOp() });
      toastAfterSync(user?.node_uuid, await loadAfterChange());
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const subURL = (row: any) => {
    const token = str(row?.token);
    if (!token) return "";
    const pathBase = str(settings.sub_path, subCfg.sub_path || "/");
    const path = `${pathBase.endsWith("/") ? pathBase : `${pathBase}/`}${token}`;
    const tls = settingOn(settings.sub_reuse_https) || Boolean(subCfg.sub_reuse_https);
    const publicHost = str(settings.sub_public_host, subCfg.sub_public_host);
    const host = publicHost.replace(/\/$/, "");
    const listenPort = Number(settings.sub_listen_port || subCfg.sub_listen_port || 0);
    const proxyPort = Number(settings.sub_public_port || subCfg.sub_public_port || 0);
    const port = proxyPort > 0 ? proxyPort : listenPort;
    if (!host) return path;
    let scheme = tls ? "https://" : "http://";
    let rest = host;
    if (host.toLowerCase().startsWith("https://")) {
      scheme = "https://";
      rest = host.slice(8);
    } else if (host.toLowerCase().startsWith("http://")) {
      if (!tls) scheme = "http://";
      rest = host.slice(7);
    }
    const withPort = port > 0 && !rest.includes(":") ? `${rest}:${port}` : rest;
    return `${scheme}${withPort}${path}`;
  };

  const copySubURL = async (row: any) => {
    const url = subURL(row);
    if (!url) {
      toast.error(t("nodemgt.empty"));
      return;
    }
    try {
      await writeClipboardText(url);
      toast.success(t("nodemgt.copied"));
    } catch {
      toast.error(t("nodemgt.copy_failed"));
    }
  };

  const retryCert = async (row: any, testCA = false) => {
    try {
      const source = isFileCert(row) ? "file" : str(row?.source) === "root" || str(row?.root_cert_id) ? "root" : "acme";
      await call("admin:nodemgt.cert.request", {
        id: row.id,
        domain: row.domain,
        root_cert_id: row.root_cert_id,
        share_domain: row.share_domain,
        node_uuid: row.node_uuid,
        test_ca: source === "acme" ? testCA : false,
        source,
        cert_path: source === "file" ? str(row.cert_path) : "",
        key_path: source === "file" ? str(row.key_path) : "",
      });
      toastAfterSync(row.node_uuid, await loadAfterChange());
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const issueRootCert = async () => {
    const domain = rootDomain.trim();
    if (!domain) {
      toast.error(t("nodemgt.root_domain_required"));
      return;
    }
    if (!settings.cf_api_token_set && !issuer.cf_api_token.trim()) {
      toast.error(t("nodemgt.cf_token_required"));
      return;
    }
    if (!str(issuer.acme_email) && !str(settings.acme_email)) {
      toast.error(t("nodemgt.acme_email_required"));
      return;
    }
    try {
      const saved = await call("admin:nodemgt.root_cert.issue", { domain });
      const row = saved && typeof saved === "object" ? saved : null;
      if (row) {
        setRootCerts((current) => {
          const next = mergeById(current, row);
          patchNodemgtSnapshot({ root_certs: next });
          return next;
        });
      }
      setRootDomain("");
      toast.success(t("nodemgt.root_cert_issuing"));
      await loadAfterChange();
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const setCertAutoRenew = async (row: any, next: boolean) => {
    try {
      await call("admin:nodemgt.cert.set_auto_renew", { id: row.id, auto_renew: next });
      commitRows("certs", (rows) => rows.map((item) => (str(item?.id) === str(row.id) ? { ...item, auto_renew: next } : item)));
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const setRootCertAutoRenew = async (row: any, next: boolean) => {
    try {
      const saved = await call("admin:nodemgt.root_cert.set_auto_renew", { id: row.id, auto_renew: next });
      setRootCerts((current) => {
        const nextRows = current.map((item) => (str(item?.id) === str(row.id) ? { ...item, ...(saved && typeof saved === "object" ? saved : { auto_renew: next }) } : item));
        patchNodemgtSnapshot({ root_certs: nextRows });
        return nextRows;
      });
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const retryRootCert = async (row: any) => {
    try {
      await call("admin:nodemgt.root_cert.issue", { id: row.id, domain: row.domain });
      toast.success(t("nodemgt.root_cert_issuing"));
      await loadAfterChange();
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const removeRootCert = async (id: string) => {
    try {
      await call("admin:nodemgt.root_cert.delete", { id });
      setRootCerts((current) => {
        const next = current.filter((row) => str(row?.id) !== id);
        patchNodemgtSnapshot({ root_certs: next });
        return next;
      });
      toast.success(t("nodemgt.saved"));
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const reorderInbound = async (row: any, dir: -1 | 1) => {
    const pool = inbounds
      .filter((item) => !nodeFilter || item.node_uuid === nodeFilter)
      .slice()
      .sort(
        (a, b) =>
          Number(a.sort_index || 0) - Number(b.sort_index || 0) ||
          String(a.created_at || "").localeCompare(String(b.created_at || "")),
      );
    const ids = moveAdjacentIDs(pool, row.id, dir);
    if (!ids) return;
    try {
      await call("admin:nodemgt.inbound.reorder", { node_uuid: nodeFilter || "", ids });
      await loadAfterChange();
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const previewSub = async (id: string, target = "") => {
    try {
      const row = subs.find((item) => item.id === id || item.user_id === id);
      if (!row) {
        toast.error(t("nodemgt.empty"));
        return;
      }
      const data = await call("admin:nodemgt.subscription.preview", { id: row.id, target: target || undefined });
      const user = users.find((item) => item.id === row.user_id);
      const name = str(user?.display_name) || str(user?.username) || str(row.user_id);
      setPreview({
        subscriptionID: row.id,
        target,
        name,
        url: subscriptionTargetURL(str(data?.url) || subURL(row), target),
        links: data?.client === "v2ray" ? parsePreviewLinks(str(data?.body)) : [],
        body: str(data?.body),
        client: str(data?.client),
        warnings: Array.isArray(data?.warnings) ? data.warnings : [],
      });
    } catch (err) {
      toast.error(nodemgtErrorMessage(err, t));
    }
  };

  const pendingCerts = certs.filter((row) => row.status === "pending" || row.status === "failed").length;
  const canCreate =
    tab === "inbounds" ||
    tab === "outbounds" ||
    tab === "routes" ||
    tab === "users" ||
    tab === "plans" ||
    tab === "certs";

  const sheetTitle = sheet
    ? t(sheet.form.id ? "nodemgt.edit" : "nodemgt.create") + " · " + t(`nodemgt.kind_${sheet.kind}`)
    : "";

  return (
    <div
      className="flex flex-col gap-4 p-0 md:p-4"
      data-testid={tab === "subscriptions" && subPage === "templates" ? "nodemgt-templates-page" : "nodemgt-admin-page"}
      data-admin-route-pending={loading && !cached ? "true" : undefined}
    >
      <AdminPageTitle
        description={t(
          tab === "subscriptions" && subPage === "templates" ? "nodemgt.page_templates_help" : `nodemgt.page_${tab}_help`,
          { defaultValue: t("nodemgt.description") },
        )}
      >
        {t(`nodemgt.tab_${tab}`)}
      </AdminPageTitle>

      {tab === "overview" ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
            gap: { xs: 1.25, md: 1.75 },
          }}
        >
          <MetricCard label={t("nodemgt.metric_inbounds")} value={String(inbounds.length)} helper={t("nodemgt.metric_inbounds_help")} icon={<Network size={18} />} loading={loading} />
          <MetricCard label={t("nodemgt.metric_users")} value={String(users.length)} helper={t("nodemgt.metric_users_help")} icon={<Users size={18} />} loading={loading} />
          <MetricCard label={t("nodemgt.metric_certs")} value={String(certs.length)} helper={t("nodemgt.metric_certs_help")} icon={<Shield size={18} />} tone="green" loading={loading} />
          <MetricCard label={t("nodemgt.metric_pending")} value={String(pendingCerts)} helper={t("nodemgt.metric_pending_help")} icon={<Activity size={18} />} tone="orange" loading={loading} />
          <MetricCard label={t("nodemgt.col_xray_version")} value={str(diag.xray_version, "—")} helper={t("nodemgt.diag_core_help")} icon={<Cpu size={18} />} loading={loading} />
          <MetricCard label={t("nodemgt.col_singbox_version")} value={str(diag.singbox_version, "—")} helper={t("nodemgt.diag_core_help")} icon={<Cpu size={18} />} loading={loading} />
          <MetricCard
            label={t("nodemgt.diag_pending")}
            value={String(diagPending)}
            helper={t("nodemgt.diag_pending_help")}
            icon={<Clock3 size={18} />}
            tone="orange"
            loading={loading}
          />
          <MetricCard
            label={t("nodemgt.diag_failed")}
            value={String(diagFailed)}
            helper={t("nodemgt.diag_failed_help")}
            icon={<XCircle size={18} />}
            tone={diagFailed ? "orange" : "green"}
            loading={loading}
          />
        </Box>
      ) : null}

      {tab === "subscriptions" ? (
        <SubPageTabs.Root
          value={subPage}
          onValueChange={(value) => {
            if (value === "list" || value === "access" || value === "templates") setSubPage(value);
          }}
        >
          <AdminSheetTabs>
            <SubPageTabs.List>
              <SubPageTabs.Trigger value="list">
                <AdminTabLabel icon={<LinkIcon size={18} />}>{t("nodemgt.sub_sheet_list")}</AdminTabLabel>
              </SubPageTabs.Trigger>
              <SubPageTabs.Trigger value="access">
                <AdminTabLabel icon={<Globe size={18} />}>{t("nodemgt.sub_sheet_access")}</AdminTabLabel>
              </SubPageTabs.Trigger>
              <SubPageTabs.Trigger value="templates">
                <AdminTabLabel icon={<Layers3 size={18} />}>{t("nodemgt.sub_sheet_templates")}</AdminTabLabel>
              </SubPageTabs.Trigger>
            </SubPageTabs.List>
          </AdminSheetTabs>
          {subPage === "access" ? (
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            <Paper
              variant="outlined"
              className="admin-tab-panel"
              sx={{ ...panelSx, p: { xs: 1.5, sm: 2 } }}
            >
              <Stack spacing={2}>
                <ThreeCol>
                  <ReadyField
                    ready={!loading || Boolean(subCfg.sub_listen_port || subCfg.sub_path)}
                    label={t("nodemgt.sub_listen_port")}
                    value={subCfg.sub_listen_port}
                    onChange={(value) => setSubCfg((current) => ({ ...current, sub_listen_port: value }))}
                    helper={t("nodemgt.sub_listen_port_help")}
                  />
                  <ReadyField
                    ready={!loading || Boolean(subCfg.sub_listen_port || subCfg.sub_path)}
                    label={t("nodemgt.sub_public_port")}
                    value={subCfg.sub_public_port}
                    onChange={(value) => setSubCfg((current) => ({ ...current, sub_public_port: value }))}
                    helper={t("nodemgt.sub_public_port_help")}
                  />
                  <ReadyField
                    ready={!loading || Boolean(subCfg.sub_listen_port || subCfg.sub_path)}
                    label={t("nodemgt.sub_path")}
                    value={subCfg.sub_path}
                    onChange={(value) => setSubCfg((current) => ({ ...current, sub_path: value }))}
                    helper={t("nodemgt.sub_path_help")}
                  />
                </ThreeCol>
                <ReadyField
                  ready={!loading || Boolean(subCfg.sub_public_host || subCfg.sub_path)}
                  label={t("nodemgt.sub_public_host")}
                  value={subCfg.sub_public_host}
                  onChange={(value) => setSubCfg((current) => ({ ...current, sub_public_host: value }))}
                  helper={t("nodemgt.sub_public_host_help")}
                />
                <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                  <Button variant="contained" onClick={() => void saveSubSettings().catch(() => undefined)}>
                    {t("nodemgt.save_sub_settings")}
                  </Button>
                </Box>
              </Stack>
            </Paper>
            <SettingCardSwitch
              title={t("nodemgt.sub_reuse_https")}
              description={t("nodemgt.sub_reuse_https_help")}
              defaultChecked={Boolean(subCfg.sub_reuse_https)}
              onChange={async (next) => {
                await saveSubSettings({
                  sub_reuse_https: next,
                  sub_public_host: subCfg.sub_public_host,
                });
              }}
            />
          </Stack>
          ) : null}
        </SubPageTabs.Root>
      ) : null}

      {tab === "certs" ? (
        <SubPageTabs.Root
          value={certPage}
          onValueChange={(value) => {
            if (value === "list" || value === "issuer") setCertPage(value);
          }}
        >
          <AdminSheetTabs>
            <SubPageTabs.List>
              <SubPageTabs.Trigger value="list">
                <AdminTabLabel icon={<Shield size={18} />}>{t("nodemgt.cert_sheet_list")}</AdminTabLabel>
              </SubPageTabs.Trigger>
              <SubPageTabs.Trigger value="issuer">
                <AdminTabLabel icon={<LockKeyhole size={18} />}>{t("nodemgt.cert_sheet_issuer")}</AdminTabLabel>
              </SubPageTabs.Trigger>
            </SubPageTabs.List>
          </AdminSheetTabs>
          {certPage === "issuer" ? (
          <>
          <Paper
            variant="outlined"
            className="admin-tab-panel"
            sx={{ ...panelSx, mt: 2, p: { xs: 1.5, sm: 2 } }}
          >
            <Stack
              spacing={2}
              component="form"
              autoComplete="off"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void saveIssuer();
              }}
            >
              <Typography color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.6 }}>
                {t("nodemgt.cert_pending_help")}
              </Typography>
              <Field
                label={t("nodemgt.cf_token")}
                type="password"
                name="lite-plus-cf-dns-token"
                autoComplete="off"
                ignorePasswordManager
                required
                value={issuer.cf_api_token}
                onChange={(value) => setIssuer((current) => ({ ...current, cf_api_token: value }))}
                helper={settings.cf_api_token_set ? t("nodemgt.cf_token_set") : t("nodemgt.cf_token_help")}
              />
              <Field
                label={t("nodemgt.acme_email")}
                name="lite-plus-acme-email"
                autoComplete="off"
                ignorePasswordManager
                required
                value={issuer.acme_email}
                onChange={(value) => setIssuer((current) => ({ ...current, acme_email: value }))}
              />
              <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Button type="button" variant="outlined" color="error" onClick={() => void clearIssuer()}>
                  {t("nodemgt.clear_issuer")}
                </Button>
                <Button type="button" variant="contained" onClick={() => void saveIssuer()}>
                  {t("nodemgt.save_issuer")}
                </Button>
              </Stack>
            </Stack>
          </Paper>
          <Paper
            variant="outlined"
            className="admin-tab-panel"
            sx={{ ...panelSx, mt: 2, p: { xs: 1.5, sm: 2 } }}
          >
            <Stack spacing={2}>
              <Typography sx={{ fontWeight: 600 }}>{t("nodemgt.root_cert_title")}</Typography>
              <Typography color="text.secondary" sx={{ fontSize: 13, lineHeight: 1.6 }}>
                {t("nodemgt.root_cert_help")}
              </Typography>
              <Stack spacing={0.5}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  useFlexGap
                  sx={{ alignItems: { xs: "stretch", sm: "flex-start" } }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Field
                      label={t("nodemgt.root_domain")}
                      value={rootDomain}
                      onChange={setRootDomain}
                      placeholder="abc.com"
                    />
                  </Box>
                  <Button
                    variant="contained"
                    onClick={() => void issueRootCert()}
                    sx={{
                      height: SHEET_FIELD_HEIGHT,
                      minHeight: SHEET_FIELD_HEIGHT,
                      px: 2,
                      flexShrink: 0,
                      whiteSpace: "nowrap",
                      boxSizing: "border-box",
                    }}
                  >
                    {t("nodemgt.root_cert_issue")}
                  </Button>
                </Stack>
                <Typography color="text.secondary" sx={{ fontSize: 12, lineHeight: 1.6, px: "14px" }}>
                  {t("nodemgt.root_domain_help")}
                </Typography>
              </Stack>
              <RecordTable
                id="root-certs"
                loading={loading}
                rows={rootCerts}
                columns={[
                  { key: "domain", label: t("nodemgt.col_domain"), render: (row) => `${row.domain} / *.${row.domain}` },
                  { key: "status", label: t("nodemgt.col_status"), render: (row) => <StatusChip value={row.status} /> },
                  { key: "issuer", label: t("nodemgt.col_issuer"), width: "16%", render: (row) => formatCertIssuer(str(row.issuer)) || t("nodemgt.cert_source_acme") },
                  {
                    key: "auto_renew",
                    label: t("nodemgt.col_auto_renew"),
                    render: (row) => (
                      <EnableSwitch checked={certAutoRenewOn(row)} onChange={(next) => void setRootCertAutoRenew(row, next)} />
                    ),
                  },
                  { key: "expires", label: t("nodemgt.col_expires"), width: "14%", render: (row) => formatWhen(row.not_after) },
                  { key: "error", label: t("nodemgt.col_last_error"), width: "12%", render: (row) => <CellClamp value={nodemgtErrorMessage(row.last_error, t) || "—"} maxWidth={280} /> },
                  {
                    key: "actions",
                    label: t("nodemgt.col_actions"),
                    render: (row) => (
                      <RowActions>
                        {row.status === "issued" ? (
                          <Button size="small" onClick={() => void retryRootCert(row)}>{t("nodemgt.cert_renew_tls")}</Button>
                        ) : (
                          <Button size="small" onClick={() => void retryRootCert(row)}>{t("nodemgt.cert_retry")}</Button>
                        )}
                        <DeleteButton onClick={() => void removeRootCert(row.id)} />
                      </RowActions>
                    ),
                  },
                ]}
              />
            </Stack>
          </Paper>
          </>
          ) : null}
        </SubPageTabs.Root>
      ) : null}

      {tab === "subscriptions" && (hasNodemgtTemplates(templates) || !loading) ? (
        <Box
          hidden={subPage !== "templates"}
          sx={{ display: subPage === "templates" ? "block" : "none" }}
        >
          <SubscriptionTemplates subs={subs} plans={plans} initial={templates} onChange={rememberTemplates} />
        </Box>
      ) : null}
      {(tab === "subscriptions" && (subPage === "access" || subPage === "templates")) || (tab === "certs" && certPage === "issuer") ? null : (
      <AdminListShell>
          <AdminListFiltersBar>
            <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: { xs: "wrap", md: "nowrap" }, alignItems: "center" }}>
              {tab === "overview" || tab === "inbounds" || tab === "outbounds" || tab === "routes" || tab === "certs" ? (
                <FilterSelect
                  label={t("nodemgt.col_node")}
                  value={nodeFilter}
                  onChange={setNodeFilter}
                  options={[{ value: "", label: t("nodemgt.all_nodes") }, ...nodeOptions]}
                />
              ) : null}
              <AdminListSearch value={search} onChange={setSearch} placeholder={t("nodemgt.search")} />
              {canCreate ? (
                <Stack direction="row" spacing={1} sx={{ ml: { md: "auto" } }}>
                  <Button
                    variant="contained"
                    onClick={() =>
                      openCreate(
                        tab === "inbounds"
                          ? "inbound"
                          : tab === "outbounds"
                            ? "outbound"
                            : tab === "routes"
                              ? "route"
                              : tab === "users"
                                ? "user"
                                : tab === "plans"
                                  ? "plan"
                                  : "cert",
                      )
                    }
                  >
                    {t("nodemgt.create")}
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </AdminListFiltersBar>

          {tab === "inbounds" ? (
            <RecordTable
              id="inbounds"
              empty={t("nodemgt.empty")}
              loading={loading}
              rows={listPager.pageItems}
              columns={[
                { key: "name", label: t("nodemgt.col_name"), width: "16%", render: (row) => <CellEllipsis value={str(row.name)} /> },
                { key: "sort", label: t("nodemgt.col_sub_sort"), width: "8%", render: (row) => (row.sort_index == null || row.sort_index === "" ? "—" : String(row.sort_index)) },
                { key: "node", label: t("nodemgt.col_node"), width: "12%", render: (row) => <CellEllipsis value={nodeName(row.node_uuid)} /> },
                { key: "core", label: t("nodemgt.col_core"), width: "8%", render: (row) => displayCore(row.core) },
                { key: "protocol", label: t("nodemgt.col_protocol"), width: "12%", render: (row) => `${t(`nodemgt.proto_${row.protocol}`, { defaultValue: row.protocol })}${row.security && row.security !== "none" ? ` / ${t(`nodemgt.security_${row.security}`, { defaultValue: row.security })}` : ""}` },
                { key: "listen", label: t("nodemgt.col_listen"), width: "10%", render: (row) => <CellEllipsis value={`${row.listen}:${row.port}`} /> },
                { key: "delivery", label: t("nodemgt.col_delivery"), render: (row) => <DeliveryChip status={inboundDeliveryOf(row, nodeDelivery(row.node_uuid))} error={inboundTouched(row, nodeDelivery(row.node_uuid)) ? nodeDelivery(row.node_uuid)?.last_error : undefined} /> },
                { key: "enabled", label: t("nodemgt.col_enabled"), render: (row) => <EnableSwitch checked={row.enabled !== false} onChange={(next) => void toggleRowEnabled("inbound", row, next)} /> },
                {
                  key: "actions",
                  label: t("nodemgt.col_actions"),
                  render: (row) => (
                    <RowActions>
                      <IconButton size="small" aria-label={t("nodemgt.move_up")} onClick={() => void reorderInbound(row, -1)}>
                        <ArrowUp size={16} />
                      </IconButton>
                      <IconButton size="small" aria-label={t("nodemgt.move_down")} onClick={() => void reorderInbound(row, 1)}>
                        <ArrowDown size={16} />
                      </IconButton>
                      <IconButton size="small" aria-label={t("nodemgt.edit")} onClick={() => openEdit("inbound", row)}>
                        <Pencil size={16} />
                      </IconButton>
                      <DeleteButton onClick={() => void removeRow("admin:nodemgt.inbound.delete", row.id)} />
                    </RowActions>
                  ),
                },
              ]}
            />
          ) : tab === "outbounds" ? (
            <RecordTable
              id="outbounds"
              empty={t("nodemgt.empty")}
              loading={loading}
              rows={listPager.pageItems}
              columns={[
                { key: "name", label: t("nodemgt.col_name"), width: "18%", render: (row) => <CellEllipsis value={str(row.name)} /> },
                { key: "node", label: t("nodemgt.col_node"), width: "16%", render: (row) => <CellEllipsis value={nodeName(row.node_uuid)} /> },
                { key: "protocol", label: t("nodemgt.col_protocol"), width: "12%", render: (row) => t(`nodemgt.outbound_${row.protocol}`, { defaultValue: row.protocol }) },
                { key: "address", label: t("nodemgt.col_address"), width: "20%", render: (row) => <CellEllipsis value={row.address ? `${row.address}${row.dest_port ? `:${row.dest_port}` : ""}` : "—"} /> },
                { key: "delivery", label: t("nodemgt.col_delivery"), render: (row) => {
                  const cmd = nodeDelivery(row.node_uuid);
                  return <DeliveryChip status={inboundDeliveryOf(row, cmd)} error={inboundTouched(row, cmd) ? cmd?.last_error : undefined} />;
                } },
                { key: "enabled", label: t("nodemgt.col_enabled"), render: (row) => <EnableSwitch checked={row.enabled !== false} onChange={(next) => void toggleRowEnabled("outbound", row, next)} /> },
                {
                  key: "actions",
                  label: t("nodemgt.col_actions"),
                  render: (row) => (
                    <RowActions>
                      <IconButton size="small" aria-label={t("nodemgt.edit")} onClick={() => openEdit("outbound", row)}>
                        <Pencil size={16} />
                      </IconButton>
                      <DeleteButton onClick={() => void removeRow("admin:nodemgt.outbound.delete", row.id)} />
                    </RowActions>
                  ),
                },
              ]}
            />
          ) : tab === "routes" ? (
            <RecordTable
              id="routes"
              empty={t("nodemgt.empty")}
              loading={loading}
              rows={listPager.pageItems}
              columns={[
                { key: "name", label: t("nodemgt.col_name"), width: "12%", render: (row) => <CellEllipsis value={str(row.name)} /> },
                { key: "node", label: t("nodemgt.col_node"), width: "11%", render: (row) => <CellEllipsis value={nodeName(row.node_uuid)} /> },
                {
                  key: "inbound",
                  label: t("nodemgt.col_inbound"),
                  width: "18%",
                  render: (row) => (
                    <CellEllipsis
                      value={inboundOptions.find((item) => item.value === row.inbound_id)?.label || t("nodemgt.route_all_inbounds")}
                    />
                  ),
                },
                {
                  key: "outbound",
                  label: t("nodemgt.col_outbound"),
                  width: "13%",
                  render: (row) => (
                    <CellEllipsis
                      value={[...builtinOutboundOptions, ...outboundOptions].find((item) => item.value === row.outbound_id)?.label || row.outbound_id || "—"}
                    />
                  ),
                },
                {
                  key: "match",
                  label: t("nodemgt.col_match"),
                  width: "7%",
                  render: (row) => (
                    <CellEllipsis value={[row.domain, row.ip, row.protocol, row.port, row.source, row.network].filter(Boolean).join(" · ") || "—"} />
                  ),
                },
                { key: "priority", label: t("nodemgt.col_priority"), width: "6%", fit: true },
                { key: "delivery", label: t("nodemgt.col_delivery"), width: "11%", fit: true, render: (row) => {
                  const cmd = nodeDelivery(row.node_uuid);
                  return <DeliveryChip status={inboundDeliveryOf(row, cmd)} error={inboundTouched(row, cmd) ? cmd?.last_error : undefined} />;
                } },
                { key: "enabled", label: t("nodemgt.col_enabled"), width: "8%", fit: true, render: (row) => <EnableSwitch checked={row.enabled !== false} onChange={(next) => void toggleRowEnabled("route", row, next)} /> },
                {
                  key: "actions",
                  label: t("nodemgt.col_actions"),
                  width: "14%",
                  fit: true,
                  render: (row) => (
                    <RowActions>
                      <IconButton size="small" aria-label={t("nodemgt.edit")} onClick={() => openEdit("route", row)}>
                        <Pencil size={16} />
                      </IconButton>
                      <DeleteButton onClick={() => void removeRow("admin:nodemgt.route.delete", row.id)} />
                    </RowActions>
                  ),
                },
              ]}
            />
          ) : tab === "users" ? (
            <RecordTable
              id="users"
              empty={t("nodemgt.empty")}
              loading={loading}
              fixed
              rows={listPager.pageItems}
              columns={[
                { key: "username", label: t("nodemgt.col_username"), width: "11%" },
                { key: "inbounds", label: t("nodemgt.col_inbounds"), width: "12%", render: (row) => <InboundOverflow names={row.inbound_names || []} /> },
                { key: "plan", label: t("nodemgt.col_plan"), width: "6%", render: (row) => row.plan_name || "—" },
                {
                  key: "presence",
                  width: "6%",
                  label: t("nodemgt.col_presence"),
                  render: (row) => (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => setIpLog(row)}
                      sx={{ border: 0, p: 0, m: 0, bgcolor: "transparent", cursor: "pointer" }}
                    >
                      <StatusChip value={row.online ? "online" : "offline"} />
                    </Box>
                  ),
                },
                {
                  key: "online_ips",
                  width: "8%",
                  label: t("nodemgt.col_online_ips"),
                  render: (row) => {
                    const ips = liveOnlineIPs(row);
                    const names = ips.map((item: any) => String(item?.ip || "")).filter(Boolean);
                    return (
                      <Box
                        onClick={() => names.length && setIpLog(row)}
                        sx={{ cursor: names.length ? "pointer" : "default" }}
                      >
                        <InboundOverflow names={names} />
                      </Box>
                    );
                  },
                },
                { key: "status", label: t("nodemgt.col_status"), width: "6%", render: (row) => <StatusChip value={row.status} /> },
                { key: "delivery", label: t("nodemgt.col_delivery"), width: "6%", render: (row) => {
                  const cmd = nodeDelivery(row.node_uuid);
                  return <DeliveryChip status={inboundDeliveryOf(row, cmd)} error={inboundTouched(row, cmd) ? cmd?.last_error : undefined} />;
                } },
                { key: "quota", label: t("nodemgt.col_quota_bytes"), width: "8%", render: (row) => formatQuotaLabel(row.used_bytes || 0, row.quota_bytes || 0, "—") },
                { key: "rate", label: t("nodemgt.col_rate_limit_bps"), width: "6%", render: (row) => formatMbpsLabel(row.rate_limit_bps || 0, t("nodemgt.unlimited")) },
                { key: "ends", label: t("nodemgt.col_expires"), width: "10%", render: (row) => formatWhen(row.expires_at || row.assignment_ends_at) },
                {
                  key: "reset",
                  width: "6%",
                  label: t("nodemgt.col_traffic_reset_day"),
                  render: (row) => (Number(row.traffic_reset_day) > 0 ? t("nodemgt.reset_day_value", { day: row.traffic_reset_day }) : t("nodemgt.reset_day_off")),
                },
                {
                  key: "actions",
                  width: "12%",
                  label: t("nodemgt.col_actions"),
                  render: (row) => (
                    <RowActions>
                      <IconButton size="small" aria-label={t("nodemgt.edit")} onClick={() => openEdit("user", row)}>
                        <Pencil size={16} />
                      </IconButton>
                      <DeleteButton onClick={() => void removeRow("admin:nodemgt.user.delete", row.id)} />
                      <IconButton
                        size="small"
                        color={row.status === "disabled" ? "primary" : "warning"}
                        aria-label={row.status === "disabled" ? t("nodemgt.enable") : t("nodemgt.disable")}
                        title={row.status === "disabled" ? t("nodemgt.enable") : t("nodemgt.disable")}
                        onClick={() => void setStatus(row.id, row.status === "disabled" ? "active" : "disabled")}
                      >
                        {row.status === "disabled" ? <Play size={16} /> : <Ban size={16} />}
                      </IconButton>
                      <IconButton size="small" aria-label={t("nodemgt.renew")} title={t("nodemgt.renew")} onClick={() => void renew(row.id)}>
                        <RotateCw size={16} />
                      </IconButton>
                      <IconButton size="small" aria-label={t("nodemgt.preview")} title={t("nodemgt.preview")} onClick={() => void previewSub(row.id)}>
                        <QrCode size={16} />
                      </IconButton>
                    </RowActions>
                  ),
                },
              ]}
            />
          ) : tab === "plans" ? (
            <RecordTable
              id="plans"
              empty={t("nodemgt.empty")}
              loading={loading}
              rows={listPager.pageItems}
              columns={[
                { key: "name", label: t("nodemgt.col_name"), width: "24%", render: (row) => <CellEllipsis value={str(row.name)} /> },
                { key: "traffic", label: t("nodemgt.col_traffic_bytes"), width: "16%", render: (row) => formatGiBLabel(row.traffic_bytes || 0) },
                { key: "days", label: t("nodemgt.col_duration_days"), width: "14%", render: (row) => `${row.duration_days || 0}` },
                { key: "rate", label: t("nodemgt.col_rate_limit_bps"), width: "16%", render: (row) => formatMbpsLabel(row.rate_limit_bps || 0, t("nodemgt.unlimited")) },
                {
                  key: "online_users",
                  label: t("nodemgt.col_online_users"),
                  width: "16%",
                  render: (row) => String(users.filter((item) => item.plan_id === row.id && item.online).length),
                },
                {
                  key: "actions",
                  label: t("nodemgt.col_actions"),
                  width: "14%",
                  fit: true,
                  render: (row) => (
                    <RowActions>
                      <IconButton size="small" aria-label={t("nodemgt.edit")} onClick={() => openEdit("plan", row)}>
                        <Pencil size={16} />
                      </IconButton>
                      <DeleteButton onClick={() => void removeRow("admin:nodemgt.plan.delete", row.id)} />
                    </RowActions>
                  ),
                },
              ]}
            />
          ) : tab === "certs" ? (
            <RecordTable
              id="certs"
              empty={t("nodemgt.empty")}
              loading={loading}
              rows={listPager.pageItems}
              columns={[
                { key: "domain", label: t("nodemgt.col_domain"), width: "12%", render: (row) => <CellEllipsis value={certOptionLabel(row)} /> },
                { key: "node", label: t("nodemgt.col_node"), width: "10%", render: (row) => <CellEllipsis value={nodeName(row.node_uuid)} /> },
                { key: "status", label: t("nodemgt.col_status"), width: "8%", render: (row) => <StatusChip value={isFileCert(row) && row.status === "pending" ? "file_pending" : row.status} /> },
                {
                  key: "delivery",
                  label: t("nodemgt.col_delivery"),
                  render: (row) => {
                    const cmd = nodeDelivery(row.node_uuid);
                    return (
                      <DeliveryChip
                        status={inboundDeliveryOf(row, cmd)}
                        error={inboundTouched(row, cmd) ? cmd?.last_error : undefined}
                      />
                    );
                  },
                },
                { key: "fingerprint", label: t("nodemgt.col_fingerprint"), width: "9%", render: (row) => <CellClamp value={row.fingerprint || "—"} maxWidth={160} /> },
                {
                  key: "issuer",
                  label: t("nodemgt.col_issuer"),
                  width: "11%",
                  render: (row) => <CellEllipsis value={displayCertIssuer(row, t("nodemgt.cert_source_file"), t("nodemgt.cert_source_acme"), t("nodemgt.cert_source_root"))} />,
                },
                {
                  key: "auto_renew",
                  label: t("nodemgt.col_auto_renew"),
                  width: "8%",
                  render: (row) =>
                    isACMECert(row) ? (
                      <EnableSwitch checked={certAutoRenewOn(row)} onChange={(next) => void setCertAutoRenew(row, next)} />
                    ) : (
                      "—"
                    ),
                },
                { key: "expires", label: t("nodemgt.col_expires"), width: "10%", render: (row) => formatWhen(row.not_after) },
                { key: "error", label: t("nodemgt.col_last_error"), width: "8%", render: (row) => <CellClamp value={nodemgtErrorMessage(row.last_error, t) || "—"} maxWidth={280} /> },
                {
                  key: "actions",
                  label: t("nodemgt.col_actions"),
                  width: "14%",
                  render: (row) => (
                    <RowActions>
                      <IconButton size="small" aria-label={t("nodemgt.edit")} onClick={() => openEdit("cert", row)}>
                        <Pencil size={16} />
                      </IconButton>
                      {isFileCert(row) ? (
                        <Button size="small" onClick={() => void retryCert(row)}>{t("nodemgt.cert_reread")}</Button>
                      ) : row.status === "issued" ? (
                        <Button size="small" onClick={() => void retryCert(row)}>{t("nodemgt.cert_renew_tls")}</Button>
                      ) : (
                        <Button size="small" onClick={() => void retryCert(row)}>{t("nodemgt.cert_retry")}</Button>
                      )}
                      <DeleteButton onClick={() => void removeRow("admin:nodemgt.cert.delete", row.id)} />
                    </RowActions>
                  ),
                },
              ]}
            />
          ) : tab === "subscriptions" ? (
            <RecordTable
              id="subscriptions"
              empty={t("nodemgt.empty")}
              loading={loading}
              rows={listPager.pageItems}
              columns={[
                { key: "user", label: t("nodemgt.col_user_id"), width: "16%", render: (row) => row.username || userOptions.find((item) => item.value === row.user_id)?.label || row.user_id },
                { key: "format", label: t("nodemgt.col_format"), width: "10%", render: (row) => row.auto_detect ? t("nodemgt.tpl_auto") : displayCore(row.format) },
                { key: "url", label: t("nodemgt.col_sub_url"), render: (row) => <CellEllipsis value={subURL(row) || "—"} /> },
                { key: "enabled", label: t("nodemgt.col_enabled"), width: "8%", render: (row) => <EnableSwitch checked={row.enabled !== false} onChange={(next) => void toggleRowEnabled("subscription", row, next)} /> },
                {
                  key: "actions",
                  label: t("nodemgt.col_actions"),
                  width: "12%",
                  render: (row) => (
                    <RowActions>
                      <IconButton size="small" aria-label={t("nodemgt.copy_link")} title={t("nodemgt.copy_link")} onClick={() => void copySubURL(row)}>
                        <Copy size={16} />
                      </IconButton>
                      <IconButton size="small" aria-label={t("nodemgt.preview")} title={t("nodemgt.preview")} onClick={() => void previewSub(row.id)}>
                        <QrCode size={16} />
                      </IconButton>
                      <IconButton size="small" aria-label={t("nodemgt.edit")} onClick={() => openEdit("subscription", row)}>
                        <Pencil size={16} />
                      </IconButton>
                    </RowActions>
                  ),
                },
              ]}
            />
          ) : tab === "audit" ? (
            <RecordTable
              id="audit"
              empty={t("nodemgt.empty")}
              loading={loading}
              rows={listPager.pageItems}
              columns={[
                { key: "created_at", label: t("nodemgt.col_created_at"), render: (row) => formatWhen(row.created_at) },
                { key: "actor", label: t("nodemgt.col_actor"), render: (row) => row.actor || "—" },
                {
                  key: "action",
                  label: t("nodemgt.col_action"),
                  render: (row) => t(`nodemgt.audit_action.${auditActionKey(row.action)}`, { defaultValue: row.action }),
                },
                {
                  key: "target",
                  label: t("nodemgt.col_target"),
                  render: (row) => {
                    const value = str(row.target);
                    if (!value || value === "nodemgt") return t("nodemgt.title");
                    return nodeName(value) !== value ? nodeName(value) : value;
                  },
                },
              ]}
            />
          ) : (
            <RecordTable
              id="overview"
              empty={t("nodemgt.no_nodes")}
              loading={loading}
              rows={listPager.pageItems}
              columns={[
                { key: "name", label: t("nodemgt.col_node"), render: (row) => row.name || nodeName(row.node_uuid) },
                {
                  key: "dial_stack",
                  width: "16%",
                  label: t("nodemgt.col_dial_stack"),
                  render: (row) => t(`nodemgt.stack_${normalizeDialStack(row.dial_stack)}`),
                },
                {
                  key: "status",
                  label: t("nodemgt.col_delivery"),
                  render: (row) => <DeliveryChip status={row.status} error={row.last_error} />,
                },
                {
                  key: "last_error",
                  width: "22%",
                  label: t("nodemgt.col_last_error"),
                  render: (row) =>
                    row.last_error ? (
                      <Typography color="error" sx={{ fontSize: 13 }}>
                        {nodemgtErrorMessage(row.last_error, t)}
                      </Typography>
                    ) : (
                      "—"
                    ),
                },
                {
                  key: "updated_at",
                  width: "16%",
                  label: t("nodemgt.col_created_at"),
                  render: (row) => formatWhen(row.updated_at || row.created_at),
                },
                {
                  key: "actions",
                  width: "10%",
                  label: t("nodemgt.col_actions"),
                  render: (row) => (
                    <RowActions>
                      <IconButton size="small" aria-label={t("nodemgt.edit")} onClick={() => openEdit("node", row)}>
                        <Pencil size={16} />
                      </IconButton>
                    </RowActions>
                  ),
                },
              ]}
            />
          )}
          <AdminPagination
            page={listPager.page}
            total={listRows.length}
            pageSize={listPager.pageSize}
            onPageChange={listPager.setPage}
            onPageSizeChange={listPager.setPageSize}
            showSummary={false}
            showWhenEmpty
          />
        </AdminListShell>
      )}

      <SettingsSheetDialog
        open={Boolean(sheet)}
        onClose={closeSheet}
        title={sheetTitle}
        maxWidth={sheet?.kind === "inbound" ? 760 : 560}
        actions={
          <SettingsSheetActions
            onCancel={closeSheet}
            onConfirm={() => void save()}
            confirmDisabled={saving}
            loading={saving}
            left={
              sheet?.form.id && sheet.kind !== "node" ? (
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => {
                    const methods: Partial<Record<SheetKind, string>> = {
                      inbound: "admin:nodemgt.inbound.delete",
                      user: "admin:nodemgt.user.delete",
                      plan: "admin:nodemgt.plan.delete",
                      cert: "admin:nodemgt.cert.delete",
                      subscription: "admin:nodemgt.subscription.delete",
                      outbound: "admin:nodemgt.outbound.delete",
                      route: "admin:nodemgt.route.delete",
                    };
                    const method = methods[sheet.kind];
                    if (method) void removeRow(method, sheet.form.id);
                  }}
                >
                  {t("nodemgt.delete")}
                </Button>
              ) : null
            }
          />
        }
      >
        {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
        {sheet?.kind === "inbound" ? (
          <SheetPane
            tabbed
            tabs={
              <SheetTabs
                value={["basic", "transport", "security", "sniff", "advanced"].includes(sheetTab) ? sheetTab : "basic"}
                onChange={setSheetTab}
                items={[
                  { id: "basic", label: t("nodemgt.sheet_basic") },
                  { id: "transport", label: t("nodemgt.sheet_transport") },
                  { id: "security", label: t("nodemgt.sheet_security") },
                  { id: "sniff", label: t("nodemgt.sheet_sniff") },
                  { id: "advanced", label: t("nodemgt.sheet_advanced") },
                ]}
              />
            }
          >
            {sheetTab === "basic" || sheetTab === "protocol" ? (
              <>
                <SheetSwitch
                  title={t("nodemgt.col_enabled")}
                  description={t("nodemgt.enabled_help")}
                  checked={sheet.form.enabled !== "false"}
                  onChange={(next) => setForm({ enabled: next ? "true" : "false" })}
                />
                <Field label={t("nodemgt.col_remark")} value={sheet.form.name} onChange={(value) => setForm({ name: value })} />
                <SelectField
                  label={t("nodemgt.col_node")}
                  value={sheet.form.node_uuid}
                  onChange={(value) => {
                    const patch: FormMap = { node_uuid: value, cert_id: "" };
                    if (sheet.form.security === "tls") {
                      const cert = firstIssuedCert(value);
                      if (cert) Object.assign(patch, bindCertPatch(cert.id, sheet.form));
                    }
                    setForm(patch);
                  }}
                  options={nodeOptions.length ? nodeOptions : [{ value: "", label: t("nodemgt.no_nodes") }]}
                  searchable
                />
                <TwoCol>
                  <SelectField
                    label={t("nodemgt.col_protocol")}
                    value={sheet.form.protocol}
                    onChange={(value) => {
                      const transport = defaultTransport(value);
                      const security = defaultSecurity(value);
                      const core = defaultCore(value);
                      setForm({
                        protocol: value,
                        core,
                        transport,
                        security,
                        flow: defaultInboundFlow(value, transport, security, core),
                        cert_id: security === "tls" ? sheet.form.cert_id : "",
                        reality_dest: security === "reality" ? sheet.form.reality_dest || DEFAULT_REALITY_DEST : "",
                        tcp_header: value === "shadowsocks" || value === "http" ? "none" : sheet.form.tcp_header,
                        ss_method: value === "shadowsocks" ? sheet.form.ss_method || DEFAULT_SS_METHOD : sheet.form.ss_method,
                        accounts: value === "http" ? accountsFormValue(sheet.form.accounts, "http") : sheet.form.accounts,
                        allow_transparent: value === "http" ? sheet.form.allow_transparent : "false",
                      });
                    }}
                    options={PROTOCOLS.map((value) => ({ value, label: t(`nodemgt.proto_${value}`) }))}
                  />
                  <SelectField
                    label={t("nodemgt.col_core")}
                    value={sheet.form.core}
                    onChange={(value) =>
                      setForm({
                        core: value,
                        flow: canUseFlow(sheet.form.protocol, sheet.form.transport, sheet.form.security, value)
                          ? flowForCore(sheet.form.flow, value) || defaultInboundFlow(sheet.form.protocol, sheet.form.transport, sheet.form.security, value)
                          : "",
                      })
                    }
                    options={coresFor(sheet.form.protocol).map((value) => ({ value, label: displayCore(value) }))}
                    helper={t("nodemgt.core_help")}
                  />
                </TwoCol>
                {sheet.form.protocol === "shadowsocks" ? (
                  <SelectField
                    label={t("nodemgt.ss_method")}
                    value={sheet.form.ss_method}
                    onChange={(value) => setForm({ ss_method: value })}
                    options={SS_METHODS.map((value) => ({ value, label: value }))}
                  />
                ) : null}
                {sheet.form.protocol === "http" ? (
                  <>
                    <ProxyAccountsEditor value={sheet.form.accounts} onChange={(value) => setForm({ accounts: value })} />
                    <SheetSwitch
                      title={t("nodemgt.allow_transparent")}
                      description={t("nodemgt.allow_transparent_help")}
                      checked={sheet.form.allow_transparent === "true"}
                      onChange={(next) => setForm({ allow_transparent: next ? "true" : "false" })}
                    />
                  </>
                ) : null}
                <Field label={t("nodemgt.col_listen")} value={sheet.form.listen} onChange={(value) => setForm({ listen: value })} placeholder={t("nodemgt.listen_placeholder")} />
                <SelectField
                  label={t("nodemgt.share_strategy")}
                  value={sheet.form.share_strategy || "node"}
                  onChange={(value) => setForm({ share_strategy: value, exclude_from_sub: "false" })}
                  options={[
                    { value: "node", label: t("nodemgt.share_node") },
                    { value: "listen", label: t("nodemgt.share_listen") },
                    { value: "other", label: t("nodemgt.share_other") },
                  ]}
                  helper={t("nodemgt.share_strategy_help")}
                />
                {sheet.form.share_strategy === "other" ? (
                  <Field
                    label={t("nodemgt.share_other_host")}
                    value={sheet.form.public_host}
                    onChange={(value) => setForm({ public_host: value })}
                    helper={t("nodemgt.share_other_help")}
                    placeholder={t("nodemgt.share_other_placeholder")}
                  />
                ) : null}
                <SheetSwitch
                  title={t("nodemgt.firewall_allow")}
                  description={t("nodemgt.firewall_allow_help")}
                  checked={sheet.form.firewall_allow === "true"}
                  disabled={Boolean(inboundFirewallReason(sheet.form.node_uuid)) && sheet.form.firewall_allow !== "true"}
                  onChange={(next) => {
                    if (next && inboundFirewallReason(sheet.form.node_uuid)) return;
                    setForm({ firewall_allow: next ? "true" : "false" });
                  }}
                />
                <TwoCol>
                  <Field label={t("nodemgt.col_sub_sort")} value={sheet.form.sort_index} onChange={(value) => setForm({ sort_index: value })} helper={t("nodemgt.sub_sort_help")} />
                  <Field
                    label={t("nodemgt.col_port")}
                    value={sheet.form.port}
                    onChange={(value) => setForm({ port: value })}
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          aria-label={t("nodemgt.random_port")}
                          title={t("nodemgt.random_port")}
                          onClick={() => {
                            const used = inbounds
                              .filter((row) => !sheet.form.node_uuid || row.node_uuid === sheet.form.node_uuid)
                              .map((row) => row.port);
                            setForm({ port: String(randomInboundPort(used)) });
                          }}
                        >
                          <Shuffle size={16} />
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                </TwoCol>
              </>
            ) : null}
            {sheetTab === "transport" ? (
              <>
                <SelectField
                  label={t("nodemgt.col_transport")}
                  value={sheet.form.transport}
                  onChange={(value) => {
                    const allowed = securitiesFor(sheet.form.protocol, value);
                    const security = allowed.includes(sheet.form.security) ? sheet.form.security : allowed[0];
                    setForm({
                      transport: value,
                      security,
                      flow: canUseFlow(sheet.form.protocol, value, security, sheet.form.core)
                        ? sheet.form.flow || defaultInboundFlow(sheet.form.protocol, value, security, sheet.form.core)
                        : "",
                    });
                  }}
                  options={transportsFor(sheet.form.protocol).map((value) => ({ value, label: t(`nodemgt.transport_${value}`) }))}
                />
            {sheet.form.transport === "tcp" && sheet.form.protocol !== "anytls" && sheet.form.protocol !== "http" ? (
              <TwoCol>
                <SelectField
                  label={t("nodemgt.tcp_header")}
                  value={sheet.form.tcp_header || "none"}
                  onChange={(value) => setForm({ tcp_header: value })}
                  options={TCP_HEADERS.map((value) => ({ value, label: t(`nodemgt.tcp_header_${value}`) }))}
                />
                {sheet.form.tcp_header === "http" ? (
                  <Field label={t("nodemgt.tcp_host")} value={sheet.form.tcp_host} onChange={(value) => setForm({ tcp_host: value })} helper={t("nodemgt.tcp_host_help")} />
                ) : <Box />}
              </TwoCol>
            ) : null}
            {sheet.form.transport === "ws" ? (
              <TwoCol>
                <Field label={t("nodemgt.ws_path")} value={sheet.form.ws_path} onChange={(value) => setForm({ ws_path: value })} />
                <Field label={t("nodemgt.ws_host")} value={sheet.form.ws_host} onChange={(value) => setForm({ ws_host: value })} helper={t("nodemgt.ws_host_help")} />
              </TwoCol>
            ) : null}
            {sheet.form.transport === "grpc" ? (
              <>
                <Field label={t("nodemgt.grpc_service")} value={sheet.form.grpc_service} onChange={(value) => setForm({ grpc_service: value })} />
                <SheetSwitch
                  title={t("nodemgt.grpc_multi")}
                  description={t("nodemgt.grpc_multi_help")}
                  checked={sheet.form.grpc_multi === "true"}
                  onChange={(next) => setForm({ grpc_multi: next ? "true" : "false" })}
                />
              </>
            ) : null}
            {sheet.form.transport === "httpupgrade" || sheet.form.transport === "xhttp" ? (
              <>
                <TwoCol>
                  <Field label={t("nodemgt.http_path")} value={sheet.form.http_path} onChange={(value) => setForm({ http_path: value })} />
                  <Field label={t("nodemgt.http_host")} value={sheet.form.http_host} onChange={(value) => setForm({ http_host: value })} />
                </TwoCol>
                {sheet.form.transport === "xhttp" ? (
                  <SelectField
                    label={t("nodemgt.xhttp_mode")}
                    value={sheet.form.http_mode || "auto"}
                    onChange={(value) => setForm({ http_mode: value })}
                    options={XHTTP_MODES.map((value) => ({ value, label: value }))}
                  />
                ) : null}
              </>
            ) : null}
              </>
            ) : null}
            {sheetTab === "security" ? (
              <>
            <SelectField
              label={t("nodemgt.col_security")}
              value={sheet.form.security}
              onChange={(value) => {
                const realityDest = value === "reality" ? sheet.form.reality_dest || DEFAULT_REALITY_DEST : "";
                const realityNames =
                  value === "reality" ? sheet.form.reality_server_names || destHost(realityDest) : "";
                const patch: FormMap = {
                  security: value,
                  transport: value === "reality" ? "tcp" : sheet.form.transport,
                  flow: defaultInboundFlow(sheet.form.protocol, value === "reality" ? "tcp" : sheet.form.transport, value, sheet.form.core),
                  cert_id: value === "tls" ? sheet.form.cert_id : "",
                  reality_dest: realityDest,
                  reality_server_names: realityNames,
                  sni: value === "reality" ? shareSNI({ ...sheet.form, security: value, reality_dest: realityDest, reality_server_names: realityNames }, "reality") : sheet.form.sni,
                  reality_short_id:
                    value === "reality" ? sheet.form.reality_short_id || randomRealityShortID() : "",
                  fingerprint: value === "reality" || value === "tls" ? sheet.form.fingerprint || DEFAULT_FINGERPRINT : "",
                };
                if (value === "tls" && !patch.cert_id) {
                  const cert = firstIssuedCert(sheet.form.node_uuid);
                  if (cert) Object.assign(patch, bindCertPatch(cert.id, sheet.form));
                }
                setForm(patch);
              }}
              options={securitiesFor(sheet.form.protocol, sheet.form.transport).map((value) => ({ value, label: t(`nodemgt.security_${value}`) }))}
            />
            {canUseFlow(sheet.form.protocol, sheet.form.transport, sheet.form.security, sheet.form.core) ? (
              <SelectField
                label={t("nodemgt.col_flow")}
                value={sheet.form.flow}
                onChange={(value) => setForm({ flow: value })}
                options={flowsFor(sheet.form.core).map((value) => ({ value, label: value || t("nodemgt.flow_none") }))}
                helper={t("nodemgt.flow_inbound_help")}
              />
            ) : null}
            {sheet.form.security === "tls" ? (
              <>
                <FormSection title={t("nodemgt.section_tls")} />
                <SelectField
                  label={t("nodemgt.cert_bind")}
                  value={sheet.form.cert_id}
                  onChange={(value) => setForm(bindCertPatch(value, sheet.form))}
                  options={certOptions}
                  helper={issuedCerts.length ? t("nodemgt.cert_bind_help") : t("nodemgt.no_certs")}
                  searchable
                />
                <Field
                  label={t("nodemgt.tls_domain")}
                  value={sheet.form.tls_domain}
                  onChange={(value) => setForm({ tls_domain: value, sni: sheet.form.sni || value })}
                  placeholder="hk.example.com"
                  helper={t("nodemgt.tls_domain_help")}
                />
                <TwoCol>
                  <Field label={t("nodemgt.sni")} value={sheet.form.sni} onChange={(value) => setForm({ sni: value })} />
                  <Field label={t("nodemgt.alpn")} value={sheet.form.alpn} onChange={(value) => setForm({ alpn: value })} placeholder="h2,http/1.1" />
                </TwoCol>
              </>
            ) : null}
            {sheet.form.security === "reality" ? (
              <>
                <SelectField
                  label={t("nodemgt.reality_dest")}
                  value={REALITY_DESTS.includes(sheet.form.reality_dest as (typeof REALITY_DESTS)[number]) ? sheet.form.reality_dest : "__custom"}
                  onChange={(value) => {
                    if (value === "__custom") {
                      setForm({ reality_dest: "" });
                      return;
                    }
                    setForm({ reality_dest: value, reality_server_names: destHost(value), sni: destHost(value) });
                  }}
                  options={[
                    ...REALITY_DESTS.map((value) => ({ value, label: value })),
                    { value: "__custom", label: t("nodemgt.custom") },
                  ]}
                  helper={t("nodemgt.reality_dest_help")}
                />
                {!REALITY_DESTS.includes(sheet.form.reality_dest as (typeof REALITY_DESTS)[number]) ? (
                  <Field
                    label={t("nodemgt.reality_dest_custom")}
                    value={sheet.form.reality_dest}
                    onChange={(value) => setForm({ reality_dest: value, reality_server_names: destHost(value), sni: destHost(value) })}
                    placeholder={DEFAULT_REALITY_DEST}
                  />
                ) : null}
                <TwoCol>
                  <Field label={t("nodemgt.reality_server_names")} value={sheet.form.reality_server_names} onChange={(value) => setForm({ reality_server_names: value, sni: value.split(",")[0].trim() || value })} helper={t("nodemgt.reality_sni_help")} />
                  <Field
                    label={t("nodemgt.reality_short_id")}
                    value={sheet.form.reality_short_id}
                    onChange={(value) => setForm({ reality_short_id: value })}
                    helper={t("nodemgt.reality_short_id_help")}
                    endAdornment={
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          aria-label={t("nodemgt.random_short_id")}
                          title={t("nodemgt.random_short_id")}
                          onClick={() => setForm({ reality_short_id: randomRealityShortID() })}
                        >
                          <Shuffle size={16} />
                        </IconButton>
                      </InputAdornment>
                    }
                  />
                </TwoCol>
                <TwoCol>
                  <SelectField
                    label={t("nodemgt.utls_fingerprint")}
                    value={sheet.form.fingerprint || DEFAULT_FINGERPRINT}
                    onChange={(value) => setForm({ fingerprint: value })}
                    options={FINGERPRINTS.map((value) => ({ value, label: value }))}
                  />
                  <Field label={t("nodemgt.spider_x")} value={sheet.form.spider_x} onChange={(value) => setForm({ spider_x: value })} placeholder="/" />
                </TwoCol>
              </>
            ) : null}
              </>
            ) : null}
            {sheetTab === "sniff" ? (
              <>
                <SheetSwitch
                  title={t("nodemgt.sniffing")}
                  description={t("nodemgt.sniffing_help")}
                  checked={sheet.form.sniffing !== "false"}
                  onChange={(next) => setForm({ sniffing: next ? "true" : "false", dest_override: next ? sheet.form.dest_override || "http,tls,quic" : sheet.form.dest_override, route_only: next ? "true" : sheet.form.route_only })}
                />
                {sheet.form.sniffing !== "false" ? (
                  <>
                    <MultiSelectField
                      label={t("nodemgt.sniffing_dest")}
                      value={(sheet.form.dest_override || "http,tls,quic").split(",").filter(Boolean)}
                      onChange={(value) => setForm({ dest_override: value.join(",") })}
                      options={SNIFF_DESTS.map((value) => ({ value, label: value }))}
                      helper={t("nodemgt.sniffing_dest_help")}
                    />
                    <SheetSwitch
                      title={t("nodemgt.sniffing_route_only")}
                      description={t("nodemgt.sniffing_route_only_help")}
                      checked={sheet.form.route_only === "true" || sheet.form.security === "reality" || String(sheet.form.flow || "").includes("vision")}
                      onChange={(next) => {
                        const force = sheet.form.security === "reality" || String(sheet.form.flow || "").includes("vision");
                        setForm({ route_only: force || next ? "true" : "false" });
                      }}
                    />
                  </>
                ) : null}
              </>
            ) : null}
            {sheetTab === "advanced" ? (
              <SelectField label={t("nodemgt.col_stack")} value={sheet.form.stack} onChange={(value) => setForm({ stack: value })} options={STACKS.map((value) => ({ value, label: t(`nodemgt.stack_${value}`) }))} />
            ) : null}
          </SheetPane>
        ) : null}
        {sheet?.kind === "user" ? (
          <SheetPane
            tabbed
            tabs={
              <SheetTabs
                value={sheetTab}
                onChange={setSheetTab}
                items={[
                  { id: "basic", label: t("nodemgt.sheet_basic") },
                  { id: "inbounds", label: t("nodemgt.sheet_inbounds") },
                  { id: "plan", label: t("nodemgt.sheet_plan") },
                  { id: "links", label: t("nodemgt.sheet_links") },
                ]}
              />
            }
          >
            {sheetTab === "basic" ? (
              <>
                <SheetSwitch
                  title={t("nodemgt.col_enabled")}
                  description={t("nodemgt.user_enabled_help")}
                  checked={sheet.form.enabled !== "false"}
                  onChange={(next) => setForm({ enabled: next ? "true" : "false" })}
                />
                <Field label={t("nodemgt.col_username")} value={sheet.form.username} onChange={(value) => setForm({ username: value })} />
                <Field label={t("nodemgt.col_remark")} value={sheet.form.display_name} onChange={(value) => setForm({ display_name: value })} />
                <SelectField
                  label={t("nodemgt.col_flow")}
                  value={sheet.form.flow}
                  onChange={(value) => setForm({ flow: value })}
                  options={FLOWS.map((value) => ({ value, label: value || t("nodemgt.flow_none") }))}
                  helper={t("nodemgt.flow_help")}
                />
                <TwoCol>
                  <Field label={t("nodemgt.rate_mbps")} value={sheet.form.rate_mbps} onChange={(value) => setForm({ rate_mbps: value })} helper={t("nodemgt.rate_scope")} />
                  <Field label={t("nodemgt.col_device_limit")} value={sheet.form.device_limit} onChange={(value) => setForm({ device_limit: value })} helper={t("nodemgt.ip_limit_help")} />
                </TwoCol>
              </>
            ) : null}
            {sheetTab === "inbounds" ? (
              <MultiSelectField
                label={t("nodemgt.col_inbounds")}
                value={sheet.form.inbound_ids ? sheet.form.inbound_ids.split(",").filter(Boolean) : []}
                onChange={(value) => setForm({ inbound_ids: value.join(",") })}
                options={inboundOptions}
                helper={inboundOptions.length ? t("nodemgt.inbound_grant_help") : t("nodemgt.no_inbounds")}
                searchable
              />
            ) : null}
            {sheetTab === "plan" ? (
              <>
                <SelectField
                  label={t("nodemgt.col_plan")}
                  value={sheet.form.plan_id}
                  onChange={(value) => {
                    const plan = plans.find((row) => row.id === value);
                    const next: FormMap = { plan_id: value };
                    if (plan) {
                      const filled = planExpiryLocal(plan.duration_days);
                      if (filled) next.expires_at = filled;
                      next.rate_mbps = bpsToMbps(Number(plan.rate_limit_bps || 0));
                    } else {
                      next.expires_at = "";
                    }
                    setForm(next);
                  }}
                  options={planOptions}
                  helper={t("nodemgt.plan_help")}
                  searchable
                />
                <ExpiryField
                  label={t("nodemgt.expires_at")}
                  value={sheet.form.expires_at}
                  onChange={(value) => setForm({ expires_at: value })}
                  helper={t("nodemgt.expires_at_help")}
                />
                <Field
                  label={t("nodemgt.traffic_reset_day")}
                  value={sheet.form.traffic_reset_day}
                  onChange={(value) => setForm({ traffic_reset_day: value })}
                  helper={t("nodemgt.traffic_reset_day_help")}
                />
              </>
            ) : null}
            {sheetTab === "links" ? (
              <ExtraLinksEditor value={sheet.form.extra_links || "[]"} onChange={(value) => setForm({ extra_links: value })} />
            ) : null}
          </SheetPane>
        ) : null}
        {sheet?.kind === "plan" ? (
          <SheetPane>
            <Field label={t("nodemgt.col_name")} value={sheet.form.name} onChange={(value) => setForm({ name: value })} />
            <TwoCol>
              <Field label={t("nodemgt.quota_gib")} value={sheet.form.traffic_gib} onChange={(value) => setForm({ traffic_gib: value })} helper={t("nodemgt.quota_scope")} />
              <Field label={t("nodemgt.col_duration_days")} value={sheet.form.duration_days} onChange={(value) => setForm({ duration_days: value })} />
            </TwoCol>
            <TwoCol>
              <Field label={t("nodemgt.rate_mbps")} value={sheet.form.rate_mbps} onChange={(value) => setForm({ rate_mbps: value })} helper={t("nodemgt.rate_scope")} />
              <Field label={t("nodemgt.col_device_limit")} value={sheet.form.device_limit} onChange={(value) => setForm({ device_limit: value })} helper={t("nodemgt.ip_limit_help")} />
            </TwoCol>
          </SheetPane>
        ) : null}
        {sheet?.kind === "cert" ? (
          <SheetPane>
            <>
                <SelectField
                  label={t("nodemgt.col_node")}
                  value={sheet.form.node_uuid}
                  onChange={(value) => setForm({ node_uuid: value })}
                  options={nodeOptions.length ? nodeOptions : [{ value: "", label: t("nodemgt.no_nodes") }]}
                  searchable
                />
                <SelectField
                  label={t("nodemgt.cert_source")}
                  value={sheet.form.source || "root"}
                  onChange={(value) => setForm({ source: value })}
                  options={[
                    { value: "root", label: t("nodemgt.cert_source_root") },
                    { value: "acme", label: t("nodemgt.cert_source_acme") },
                    { value: "file", label: t("nodemgt.cert_source_file") },
                  ]}
                  helper={t("nodemgt.cert_source_help")}
                />
                {sheet.form.source === "root" ? (
                  <>
                    <SelectField
                      label={t("nodemgt.root_cert_bind")}
                      value={sheet.form.root_cert_id}
                      onChange={(value) => {
                        const root = rootCerts.find((row) => row.id === value);
                        setForm({
                          root_cert_id: value,
                          domain: str(root?.domain),
                          share_domain: sheet.form.share_domain,
                        });
                      }}
                      options={
                        issuedRoots.length
                          ? issuedRoots.map((row) => ({ value: row.id, label: `${row.domain} / *.${row.domain}` }))
                          : [{ value: "", label: t("nodemgt.no_root_certs") }]
                      }
                      helper={issuedRoots.length ? t("nodemgt.root_cert_bind_help") : t("nodemgt.no_root_certs")}
                      searchable
                    />
                    <Field
                      label={t("nodemgt.cert_share_domain")}
                      value={sheet.form.share_domain}
                      onChange={(value) => setForm({ share_domain: value })}
                      placeholder={sheet.form.domain ? `hk.${sheet.form.domain}` : "hk.example.com"}
                      helper={t("nodemgt.cert_share_domain_help")}
                    />
                  </>
                ) : (
                  <Field
                    label={t("nodemgt.col_domain")}
                    value={sheet.form.domain}
                    onChange={(value) => setForm({ domain: value })}
                    placeholder={sheet.form.source === "file" ? "example.com" : "hk.example.com"}
                    helper={sheet.form.source === "file" ? undefined : t("nodemgt.cert_acme_help")}
                  />
                )}
                {sheet.form.source === "file" ? (
                  <>
                    <Field
                      label={t("nodemgt.cert_path")}
                      value={sheet.form.cert_path}
                      onChange={(value) => setForm({ cert_path: value })}
                      placeholder="/etc/ssl/fullchain.pem"
                      helper={t("nodemgt.cert_path_help")}
                    />
                    <Field
                      label={t("nodemgt.cert_key_path")}
                      value={sheet.form.key_path}
                      onChange={(value) => setForm({ key_path: value })}
                      placeholder="/etc/ssl/privkey.pem"
                      helper={t("nodemgt.cert_key_path_help")}
                    />
                  </>
                ) : null}
            </>
          </SheetPane>
        ) : null}
        {sheet?.kind === "subscription" ? (
          <SheetPane>
            <SelectField label={t("nodemgt.col_user_id")} value={sheet.form.user_id} onChange={(value) => setForm({ user_id: value })} options={userOptions.length ? userOptions : [{ value: "", label: t("nodemgt.empty") }]} searchable />
            <SelectField label={t("nodemgt.col_format")} value={sheet.form.format} onChange={(value) => setForm({ format: value })} options={SUB_FORMATS.map((value) => ({ value, label: displayCore(value) }))} />
            <SheetSwitch title={t("nodemgt.tpl_auto")} description={t("nodemgt.tpl_auto_help")} checked={sheet.form.auto_detect === "true"} onChange={(next) => setForm({ auto_detect: next ? "true" : "false" })} />
            {sheet.form.id ? (
              <Field
                label={t("nodemgt.col_sub_url")}
                value={subURL(sheet.form)}
                onChange={() => undefined}
                helper={t("nodemgt.sub_url_help")}
              />
            ) : null}
            <SheetSwitch
              title={t("nodemgt.col_enabled")}
              description={t("nodemgt.enabled_help")}
              checked={sheet.form.enabled !== "false"}
              onChange={(next) => setForm({ enabled: next ? "true" : "false" })}
            />
          </SheetPane>
        ) : null}
        {sheet?.kind === "outbound" ? (
          <SheetPane
            tabbed={isProxyOutbound(sheet.form.protocol)}
            tabs={
              <SheetTabs
                value={["basic", "stream"].includes(sheetTab) ? sheetTab : "basic"}
                onChange={setSheetTab}
                items={[
                  { id: "basic", label: t("nodemgt.sheet_basic") },
                  { id: "stream", label: t("nodemgt.sheet_stream") },
                ]}
              />
            }
          >
            {sheetTab !== "stream" ? (
              <>
            <SelectField
              label={t("nodemgt.outbound_from_inbound")}
              value={sheet.form.source_inbound_id}
              onChange={applyInboundSource}
              options={[{ value: "", label: t("nodemgt.outbound_from_inbound_none") }, ...inboundSourceOptions]}
              helper={t("nodemgt.outbound_from_inbound_help")}
              searchable
            />
            <Field
              label={t("nodemgt.outbound_import")}
              value={importLink}
              onChange={(value) => {
                setImportLink(value);
                const line = value.trim();
                if (!line.includes("://")) return;
                if (applyShareLink(line)) return;
                const lower = line.toLowerCase();
                if (/^(vless|vmess|trojan|ss|socks5?|https?|anytls):\/\//.test(lower) && (line.includes("@") || lower.startsWith("vmess://") || lower.startsWith("ss://"))) {
                  toast.error(t("nodemgt.outbound_import_fail"));
                }
              }}
              placeholder={t("nodemgt.outbound_import_placeholder")}
              helper={t("nodemgt.outbound_import_help")}
            />
            <SelectField
              label={t("nodemgt.col_node")}
              value={sheet.form.node_uuid}
              onChange={(value) => setForm({ node_uuid: value })}
              options={nodeOptions.length ? nodeOptions : [{ value: "", label: t("nodemgt.no_nodes") }]}
              searchable
            />
            <Field label={t("nodemgt.outbound_tag")} value={sheet.form.name} onChange={(value) => setForm({ name: value })} helper={t("nodemgt.outbound_tag_help")} />
            <TwoCol>
              <SelectField
                label={t("nodemgt.col_protocol")}
                value={sheet.form.protocol}
                onChange={(value) => {
                  const transport = defaultTransport(value);
                  const allowed = securitiesFor(value, transport);
                  const security = allowed.includes(sheet.form.security) ? sheet.form.security : allowed[0];
                  setForm({
                    protocol: value,
                    core: defaultCore(value),
                    transport,
                    security,
                  });
                }}
                options={OUTBOUND_PROTOCOLS.map((value) => ({ value, label: t(`nodemgt.outbound_${value}`) }))}
              />
              <SelectField label={t("nodemgt.col_core")} value={sheet.form.core} onChange={(value) => setForm({ core: value, flow: flowForCore(sheet.form.flow, value) })} options={coresFor(sheet.form.protocol).map((value) => ({ value, label: displayCore(value) }))} />
            </TwoCol>
            {sheet.form.protocol === "freedom" ? (
              nodeDialStackOf(sheet.form.node_uuid) === "dual" ? (
              <SelectField
                label={t("nodemgt.domain_strategy")}
                value={sheet.form.domain_strategy || "AsIs"}
                onChange={(value) => setForm({ domain_strategy: value })}
                options={DOMAIN_STRATEGIES.map((value) => ({ value, label: value }))}
                helper={t("nodemgt.domain_strategy_help")}
              />
              ) : (
              <SelectField
                label={t("nodemgt.domain_strategy")}
                value={nodeDialStackOf(sheet.form.node_uuid)}
                onChange={() => undefined}
                disabled
                options={[{
                  value: nodeDialStackOf(sheet.form.node_uuid),
                  label: t(`nodemgt.stack_${nodeDialStackOf(sheet.form.node_uuid)}`),
                }]}
                helper={t("nodemgt.domain_strategy_node_help")}
              />
              )
            ) : null}
            {isProxyOutbound(sheet.form.protocol) ? (
              <>
                <TwoCol>
                  <Field label={t("nodemgt.col_address")} value={sheet.form.address} onChange={(value) => setForm({ address: value })} />
                  <Field label={t("nodemgt.col_dest_port")} value={sheet.form.dest_port} onChange={(value) => setForm({ dest_port: value })} />
                </TwoCol>
                {sheet.form.protocol === "vless" || sheet.form.protocol === "vmess" ? (
                  <Field label="UUID" value={sheet.form.uuid} onChange={(value) => setForm({ uuid: value })} />
                ) : null}
                {sheet.form.protocol === "vless" ? (
                  <SelectField
                    label={t("nodemgt.col_flow")}
                    value={sheet.form.flow}
                    onChange={(value) => setForm({ flow: value })}
                    options={flowsFor(sheet.form.core).map((value) => ({ value, label: value || t("nodemgt.flow_none") }))}
                  />
                ) : null}
                {sheet.form.protocol === "trojan" || sheet.form.protocol === "shadowsocks" || sheet.form.protocol === "anytls" || sheet.form.protocol === "socks" || sheet.form.protocol === "http" ? (
                  <TwoCol>
                    {sheet.form.protocol === "socks" || sheet.form.protocol === "http" ? (
                      <Field label={t("nodemgt.col_username")} value={sheet.form.username} onChange={(value) => setForm({ username: value })} />
                    ) : <Box />}
                    <Field label={t("nodemgt.col_password")} value={sheet.form.password} onChange={(value) => setForm({ password: value })} type="password" />
                  </TwoCol>
                ) : null}
                {sheet.form.protocol === "shadowsocks" ? (
                  <SelectField
                    label={t("nodemgt.ss_method")}
                    value={sheet.form.ss_method}
                    onChange={(value) => setForm({ ss_method: value })}
                    options={SS_METHODS.map((value) => ({ value, label: value }))}
                  />
                ) : null}
              </>
            ) : null}
              </>
            ) : null}
            {sheetTab === "stream" && isProxyOutbound(sheet.form.protocol) ? (
              <>
                <TwoCol>
                  <SelectField
                    label={t("nodemgt.col_transport")}
                    value={sheet.form.transport || "tcp"}
                    onChange={(value) => {
                      const allowed = securitiesFor(sheet.form.protocol, value);
                      const security = allowed.includes(sheet.form.security) ? sheet.form.security : allowed[0];
                      setForm({ transport: value, security });
                    }}
                    options={(sheet.form.protocol === "anytls" ? ["tcp"] : OUTBOUND_TRANSPORTS).map((value) => ({ value, label: t(`nodemgt.transport_${value}`) }))}
                  />
                  <SelectField
                    label={t("nodemgt.col_security")}
                    value={sheet.form.security || "none"}
                    onChange={(value) => setForm({ security: value })}
                    options={securitiesFor(sheet.form.protocol, sheet.form.transport || "tcp").map((value) => ({ value, label: t(`nodemgt.security_${value}`) }))}
                  />
                </TwoCol>
                {sheet.form.security === "tls" || sheet.form.security === "reality" ? (
                  <TwoCol>
                    <Field label={t("nodemgt.sni")} value={sheet.form.sni} onChange={(value) => setForm({ sni: value })} />
                    <SelectField
                      label={t("nodemgt.utls_fingerprint")}
                      value={sheet.form.fingerprint || DEFAULT_FINGERPRINT}
                      onChange={(value) => setForm({ fingerprint: value })}
                      options={FINGERPRINTS.map((value) => ({ value, label: value }))}
                    />
                  </TwoCol>
                ) : null}
                {sheet.form.security === "reality" ? (
                  <>
                    <Field label={t("nodemgt.reality_public_key")} value={sheet.form.reality_public_key} onChange={(value) => setForm({ reality_public_key: value })} />
                    <TwoCol>
                      <Field label={t("nodemgt.reality_short_id")} value={sheet.form.reality_short_id} onChange={(value) => setForm({ reality_short_id: value })} />
                      <Field label={t("nodemgt.spider_x")} value={sheet.form.spider_x} onChange={(value) => setForm({ spider_x: value })} placeholder="/" />
                    </TwoCol>
                  </>
                ) : null}
                {sheet.form.transport === "ws" ? (
                  <TwoCol>
                    <Field label={t("nodemgt.ws_path")} value={sheet.form.ws_path} onChange={(value) => setForm({ ws_path: value })} />
                    <Field label={t("nodemgt.ws_host")} value={sheet.form.ws_host} onChange={(value) => setForm({ ws_host: value })} />
                  </TwoCol>
                ) : null}
                {sheet.form.transport === "grpc" ? (
                  <Field label={t("nodemgt.grpc_service")} value={sheet.form.grpc_service} onChange={(value) => setForm({ grpc_service: value })} />
                ) : null}
                <SelectField
                  label={t("nodemgt.outbound_via")}
                  value={sheet.form.via_outbound}
                  onChange={(value) => setForm({ via_outbound: value })}
                  options={[{ value: "", label: t("nodemgt.outbound_via_none") }, ...viaOutboundOptions]}
                  helper={t("nodemgt.outbound_via_help")}
                  searchable
                />
              </>
            ) : null}
            {sheetTab !== "stream" ? (
            <SheetSwitch
              title={t("nodemgt.col_enabled")}
              description={t("nodemgt.enabled_help")}
              checked={sheet.form.enabled !== "false"}
              onChange={(next) => setForm({ enabled: next ? "true" : "false" })}
            />
            ) : null}
          </SheetPane>
        ) : null}
        {sheet?.kind === "route" ? (
          <SheetPane
            tabbed
            tabs={
              <SheetTabs
                value={["basic", "match"].includes(sheetTab) ? sheetTab : "basic"}
                onChange={setSheetTab}
                items={[
                  { id: "basic", label: t("nodemgt.sheet_target") },
                  { id: "match", label: t("nodemgt.sheet_match") },
                ]}
              />
            }
          >
            {sheetTab !== "match" ? (
              <>
            <SelectField
              label={t("nodemgt.col_node")}
              value={sheet.form.node_uuid}
              onChange={(value) => setForm({ node_uuid: value, inbound_id: "", outbound_id: "" })}
              options={nodeOptions.length ? nodeOptions : [{ value: "", label: t("nodemgt.no_nodes") }]}
              helper={t("nodemgt.node_help")}
              searchable
            />
            <Field label={t("nodemgt.col_name")} value={sheet.form.name} onChange={(value) => setForm({ name: value })} />
            <SelectField
              label={t("nodemgt.col_inbound")}
              value={sheet.form.inbound_id}
              onChange={(value) => setForm({ inbound_id: value })}
              options={[{ value: "", label: t("nodemgt.route_all_inbounds") }, ...nodeInboundOptions]}
              helper={t("nodemgt.route_inbound_help")}
              searchable
            />
            <SelectField
              label={t("nodemgt.col_outbound")}
              value={sheet.form.outbound_id}
              onChange={(value) => setForm({ outbound_id: value })}
              options={[...builtinOutboundOptions, ...nodeOutboundOptions]}
              helper={t("nodemgt.route_outbound_help")}
              searchable
            />
              </>
            ) : null}
            {sheetTab === "match" ? (
              <>
            <Typography color="text.secondary" sx={{ fontSize: 13 }}>{t("nodemgt.route_conditions_help")}</Typography>
            <Field label={t("nodemgt.col_domain")} value={sheet.form.domain} onChange={(value) => setForm({ domain: value })} helper={t("nodemgt.route_domain_help")} placeholder="geosite:cn" />
            <Field label={t("nodemgt.col_ip")} value={sheet.form.ip} onChange={(value) => setForm({ ip: value })} helper={t("nodemgt.route_ip_help")} placeholder="geoip:cn" />
            <MultiSelectField
              label={t("nodemgt.route_protocol")}
              value={sheet.form.protocol ? sheet.form.protocol.split(",").filter(Boolean) : []}
              onChange={(value) => setForm({ protocol: value.join(",") })}
              options={ROUTE_PROTOCOLS.map((value) => ({ value, label: value }))}
              helper={t("nodemgt.route_protocol_help")}
              emptyLabel={t("nodemgt.route_any_protocol")}
            />
            <TwoCol>
              <Field label={t("nodemgt.route_port")} value={sheet.form.port} onChange={(value) => setForm({ port: value })} helper={t("nodemgt.route_port_help")} placeholder="80,443" />
              <Field label={t("nodemgt.route_source")} value={sheet.form.source} onChange={(value) => setForm({ source: value })} helper={t("nodemgt.route_source_help")} />
            </TwoCol>
            <TwoCol>
              <SelectField
                label={t("nodemgt.col_network")}
                value={sheet.form.network}
                onChange={(value) => setForm({ network: value })}
                options={ROUTE_NETWORKS.map((value) => ({ value, label: value || t("nodemgt.route_any_network") }))}
              />
              <Field label={t("nodemgt.col_priority")} value={sheet.form.priority} onChange={(value) => setForm({ priority: value })} helper={t("nodemgt.route_priority_help")} />
            </TwoCol>
              </>
            ) : null}
            {sheetTab !== "match" ? (
            <SheetSwitch
              title={t("nodemgt.col_enabled")}
              description={t("nodemgt.enabled_help")}
              checked={sheet.form.enabled !== "false"}
              onChange={(next) => setForm({ enabled: next ? "true" : "false" })}
            />
            ) : null}
          </SheetPane>
        ) : null}
        {sheet?.kind === "node" ? (
          <SheetPane>
            <SelectField
              label={t("nodemgt.col_dial_stack")}
              value={sheet.form.dial_stack}
              onChange={(value) => setForm({ dial_stack: value })}
              options={DIAL_STACKS.map((value) => ({ value, label: t(`nodemgt.stack_${value}`) }))}
              helper={t("nodemgt.dial_stack_help")}
            />
          </SheetPane>
        ) : null}
      </SettingsSheetDialog>

      <Dialog.Root
        open={fwAuthOpen}
        onOpenChange={(next: boolean) => {
          if (!next) {
            setFwAuthOpen(false);
            setFwAuthPending(null);
          }
        }}
      >
        <AppDialogContent title={t("firewall.auth_title")} description={t("firewall.auth_help")}>
          <TextField
            size="small"
            fullWidth
            sx={{ mt: 2, ...settingsFieldSx }}
            type={twoFaEnabled ? "text" : "password"}
            autoComplete={twoFaEnabled ? "one-time-code" : "current-password"}
            label={twoFaEnabled ? t("admin.nodeTable.twoFactorCode") : t("login.password")}
            value={twoFaEnabled ? authOtp : authPassword}
            onChange={(event) => {
              if (twoFaEnabled) setAuthOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
              else setAuthPassword(event.target.value);
            }}
          />
          <Flex justify="end" gap="2" className="mt-4">
            <Button onClick={() => { setFwAuthOpen(false); setFwAuthPending(null); }}>{t("common.cancel")}</Button>
            {passkeyAvailable ? (
              <Button variant="outlined" onClick={() => void confirmFirewallAuth(true)}>
                {t("login.passkey")}
              </Button>
            ) : null}
            <Button
              variant="contained"
              disabled={twoFaEnabled ? !authOtp.trim() : !authPassword.trim()}
              onClick={() => void confirmFirewallAuth(false)}
            >
              {t("scheduled_exec.confirm")}
            </Button>
          </Flex>
        </AppDialogContent>
      </Dialog.Root>

      <SettingsSheetDialog
        open={Boolean(secret)}
        onClose={() => setSecret("")}
        title={t("nodemgt.issue_cred")}
        actions={
          <SettingsSheetActions
            onCancel={() => setSecret("")}
            onConfirm={() => {
              void writeClipboardText(secret).then(
                () => toast.success(t("nodemgt.copied")),
                () => toast.error(t("nodemgt.copy_failed")),
              );
            }}
            cancelLabel={t("common.close")}
            confirmLabel={t("nodemgt.copy_link")}
          />
        }
      >
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>{t("nodemgt.secret_once")}</Typography>
        <TextField size="small" fullWidth value={secret} slotProps={{ input: { readOnly: true } }} sx={settingsFieldSx} />
      </SettingsSheetDialog>

      <SettingsSheetDialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={`${t("nodemgt.preview_qr")}${preview?.name ? ` — ${preview.name}` : ""}`}
        maxWidth={500}
        actions={
          <SettingsSheetActions
            onCancel={() => setPreview(null)}
            onConfirm={() => {
              if (!preview) return;
              const text = previewCopyText(preview);
              if (!text) return;
              void writeClipboardText(text).then(
                () => toast.success(t("nodemgt.copied")),
                () => toast.error(t("nodemgt.copy_failed")),
              );
            }}
            cancelLabel={t("common.close")}
            confirmLabel={t("nodemgt.copy_link")}
            confirmDisabled={!preview || !previewCopyText(preview)}
          />
        }
      >
        {preview ? <Stack spacing={2}>
          <TextField
            select
            size="small"
            label={t("nodemgt.tpl_client")}
            value={preview.target || "default"}
            onChange={(event) => void previewSub(preview.subscriptionID || "", event.target.value === "default" ? "" : event.target.value)}
          >
            <MenuItem value="default">{t("nodemgt.tpl_default")}</MenuItem>
            {[...TEMPLATE_CLIENTS, "v2ray"].map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
          </TextField>
          <SubPreviewBody preview={preview} />
        </Stack> : null}
      </SettingsSheetDialog>

      <SettingsSheetDialog
        open={Boolean(ipLog)}
        onClose={() => setIpLog(null)}
        title={`${t("nodemgt.ip_log_title")}${ipLog?.username ? ` — ${ipLog.username}` : ""}`}
        actions={
          <>
            <Button variant="outlined" color="inherit" onClick={() => void load()}>
              {t("nodemgt.ip_log_refresh")}
            </Button>
            <Button
              variant="outlined"
              color="error"
              onClick={() => {
                if (!ipLog?.id) return;
                void call("admin:nodemgt.user.clearIPs", { id: ipLog.id })
                  .then(async () => {
                    toast.success(t("nodemgt.ip_log_cleared"));
                    await load();
                  })
                  .catch((err) => toast.error(nodemgtErrorMessage(err, t)));
              }}
            >
              {t("nodemgt.ip_log_clear")}
            </Button>
            <Button variant="contained" onClick={() => setIpLog(null)}>
              {t("common.close")}
            </Button>
          </>
        }
      >
        {liveOnlineIPs(ipLog).length ? (
          <Stack spacing={1}>
            {liveOnlineIPs(ipLog).map((item) => (
              <Typography key={`${item.ip}-${item.seen_at}`} sx={{ color: "primary.main", fontSize: 14 }}>
                {item.ip}
                {item.seen_at ? ` (${formatWhen(item.seen_at)})` : ""}
              </Typography>
            ))}
          </Stack>
        ) : (
          <Typography color="text.secondary" sx={{ fontSize: 13 }}>
            {t("nodemgt.ip_log_empty")}
          </Typography>
        )}
      </SettingsSheetDialog>
    </div>
  );
}

function recordMobileTitle(row: any) {
  return str(row.name || row.username || row.domain || row.action, "—");
}

function recordMobileSkipKeys(row: any) {
  const skip = new Set(["actions"]);
  if (row?.name) skip.add("name");
  else if (row?.username) {
    skip.add("username");
    skip.add("user");
  } else if (row?.domain) skip.add("domain");
  else if (row?.action) skip.add("action");
  return skip;
}

type RecordColumn = {
  key: string;
  label: string;
  width?: string;
  fit?: boolean;
  render?: (row: any) => ReactNode;
};

const FIT_COLUMN_KEYS = new Set([
  "actions",
  "auto_renew",
  "delivery",
  "enabled",
  "presence",
  "priority",
  "status",
]);

const FIT_COLUMN_WIDTHS: Record<string, string> = {
  actions: "16%",
  auto_renew: "8%",
  delivery: "10%",
  enabled: "8%",
  presence: "6%",
  priority: "6%",
  status: "8%",
};

function columnFits(column: RecordColumn) {
  if (column.fit === true) return true;
  if (column.fit === false) return false;
  return FIT_COLUMN_KEYS.has(column.key);
}

function columnWidth(column: RecordColumn) {
  if (column.width) return column.width;
  if (columnFits(column)) return FIT_COLUMN_WIDTHS[column.key] || "8%";
  return undefined;
}

function columnClassName(column: RecordColumn) {
  return columnFits(column) ? "admin-nodemgt-col-fit" : "admin-nodemgt-col-fluid";
}

function columnMinWidth(column: RecordColumn) {
  switch (column.key) {
    case "actions":
      return 152;
    case "delivery":
      return 80;
    case "dial_stack":
      return 120;
    case "enabled":
    case "auto_renew":
      return 64;
    case "priority":
      return 48;
    case "presence":
    case "status":
      return 56;
    default:
      return 72;
  }
}

function columnPreferredWidths(columns: RecordColumn[]): TableColumnWidths {
  const shares = columns.map((column) => {
    const width = columnWidth(column);
    if (width?.endsWith("%")) return Math.max(0, Number.parseFloat(width));
    return 0;
  });
  const assigned = shares.reduce((sum, share) => sum + share, 0);
  const missing = shares.filter((share) => share <= 0).length;
  const fill = missing ? Math.max(0, 100 - assigned) / missing : 0;
  const out: TableColumnWidths = {};
  columns.forEach((column, index) => {
    const pct = shares[index] > 0 ? shares[index] : fill || 100 / columns.length;
    out[column.key] = Math.max(columnMinWidth(column), Math.round(pct * 10));
  });
  return out;
}

function columnMinWidths(columns: RecordColumn[]): TableColumnWidths {
  const out: TableColumnWidths = {};
  for (const column of columns) {
    out[column.key] = columnMinWidth(column);
  }
  return out;
}

function RecordTable({
  id,
  rows,
  columns,
  empty,
  loading,
}: {
  id?: string;
  rows: any[];
  empty?: string;
  loading?: boolean;
  fixed?: boolean;
  columns: RecordColumn[];
}) {
  const { t } = useTranslation();
  const keys = columns.map((column) => column.key);
  const mins = columnMinWidths(columns);
  const preferred = columnPreferredWidths(columns);
  const resize = useResizableTableColumns({
    storageKey: id ? `lite.admin.nodemgt.${id}.columnWidths` : "",
    keys,
    mins,
    preferred,
    enabled: Boolean(id) && rows.length > 0,
  });
  const lastKey = keys[keys.length - 1];
  const actionCol = columns.find((column) => column.key === "actions");
  if (!rows.length) {
    if (loading) {
      return (
        <Stack spacing={1.25} sx={{ p: { xs: 1.25, md: 0 } }}>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} variant="rounded" height={52} />
          ))}
        </Stack>
      );
    }
    if (!empty) return null;
    return <Box className="km-admin-list-empty">{empty}</Box>;
  }
  return (
    <>
      <Box
        ref={id ? resize.wrapRef : undefined}
        className="admin-responsive-table-wrap overflow-x-hidden"
        sx={{ display: { xs: "none", md: "block" } }}
      >
        <Table
          container={false}
          className={`admin-responsive-table admin-nodemgt-record-table w-full is-fixed${id && resize.activeWidths ? " is-column-sized" : ""}`}
        >
          <colgroup>
            {columns.map((column) => {
              const sized = id ? resize.activeWidths?.[column.key] : undefined;
              const width = sized ?? columnWidth(column);
              return <col key={column.key} style={sized ? { width: sized } : width ? { width } : undefined} />;
            })}
          </colgroup>
          <TableHeader>
            <TableRow>
              {columns.map((column) => {
                const sized = id ? resize.activeWidths?.[column.key] : undefined;
                const isLast = column.key === lastKey;
                return (
                  <TableHead
                    key={column.key}
                    className={columnClassName(column)}
                    style={tableColumnStyle(sized)}
                  >
                    {isLast && id ? (
                      <span className="admin-node-action-head">
                        <span>{column.label}</span>
                        <button type="button" className="admin-node-col-reset" onClick={resize.reset}>
                          <RefreshCw size={14} />
                          {t("admin.nodeTable.resetColumnWidths")}
                        </button>
                      </span>
                    ) : (
                      column.label
                    )}
                    {id && !isLast ? (
                      <span
                        className="admin-node-col-resize"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={t("admin.nodeTable.resizeColumn")}
                        onPointerDown={(event) => resize.startResize(column.key, event)}
                      />
                    ) : null}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id || index}>
                {columns.map((column) => {
                  const content = column.render ? column.render(row) : str(row[column.key], "—");
                  const sized = id ? resize.activeWidths?.[column.key] : undefined;
                  return (
                    <TableCell
                      key={column.key}
                      className={columnClassName(column)}
                      data-label={column.label}
                      title={typeof content === "string" ? content : undefined}
                      style={tableColumnStyle(sized)}
                    >
                      {content}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      <Box sx={{ display: { xs: "block", md: "none" } }}>
        <AdminMobileCardStack>
          {rows.map((row, index) => {
            const skip = recordMobileSkipKeys(row);
            const action = actionCol?.render?.(row);
            return (
              <AdminMobileListCard
                key={row.id || index}
                dense
                title={recordMobileTitle(row)}
                cells={columns
                  .filter((column) => !skip.has(column.key))
                  .map((column) => [
                    column.label,
                    column.render ? column.render(row) : str(row[column.key], "—"),
                  ])}
                actions={action}
              />
            );
          })}
        </AdminMobileCardStack>
      </Box>
    </>
  );
}
