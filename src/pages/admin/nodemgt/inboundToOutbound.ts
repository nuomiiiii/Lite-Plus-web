export function wildcardHost(host: string) {
  const value = host.trim().toLowerCase();
  return (
    !value ||
    value === "0.0.0.0" ||
    value === "::" ||
    value === "[::]" ||
    value === "*" ||
    value === "0.0.0.0,::" ||
    value === "::,0.0.0.0"
  );
}

function usableCertHost(domain?: string, shareDomain?: string) {
  const share = String(shareDomain || "").trim();
  if (share && !share.startsWith("*.")) return share;
  const value = String(domain || "").trim();
  if (value.startsWith("*.")) return value.slice(2);
  return value;
}

function issuedCertDomain(
  inbound: any,
  cert?: { domain?: string; share_domain?: string; status?: string } | null,
) {
  const custom = String(inbound?.tls_domain || "").trim();
  if (custom) return custom;
  const domain = usableCertHost(inbound?.cert_domain || cert?.domain, inbound?.share_domain || cert?.share_domain);
  if (!domain) return "";
  const status = String(inbound?.cert_status || cert?.status || "issued").trim().toLowerCase();
  if (status && status !== "issued") return "";
  return domain;
}

function nodeIPForStack(stack: string | undefined, ipv4: string, ipv6: string) {
  const family = String(stack || "dual").toLowerCase();
  if (family === "ipv4") return ipv4 || ipv6;
  return ipv6 || ipv4;
}

export function inboundShareHost(
  inbound: any,
  node?: { ipv4?: string; ipv6?: string } | null,
  cert?: { domain?: string; share_domain?: string; status?: string } | null,
) {
  const strategy = String(inbound?.share_strategy || "node").toLowerCase();
  const listen = String(inbound?.listen || "").trim();
  const ipv4 = String(node?.ipv4 || "").trim();
  const ipv6 = String(node?.ipv6 || "").trim();
  const nodeIP = nodeIPForStack(inbound?.stack, ipv4, ipv6);
  let host = "";
  if (strategy === "listen") {
    host = wildcardHost(listen) ? "" : listen.replace(/^\[/, "").replace(/]$/, "");
  } else if (strategy === "other" || strategy === "specified") {
    host = String(inbound?.public_host || "").trim();
  } else {
    host = issuedCertDomain(inbound, cert) || nodeIP;
  }
  if (!host) host = issuedCertDomain(inbound, cert) || nodeIP;
  if (!host && !wildcardHost(listen)) host = listen.replace(/^\[/, "").replace(/]$/, "");
  return host;
}

export function shareSNI(inbound: any, security = String(inbound?.security || "").trim()) {
  if (security === "reality") {
    const fromNames = String(inbound?.reality_server_names || "")
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    if (fromNames) return fromNames;
    const fromDest = String(inbound?.reality_dest || "").split(":")[0].trim();
    if (fromDest) return fromDest;
  }
  return String(inbound?.sni || inbound?.tls_domain || "").trim();
}

export function inboundSharePort(inbound: any) {
  const extra = Number(inbound?.public_port || 0);
  if (extra > 0) return String(extra);
  const port = Number(inbound?.port || 0);
  return port > 0 ? String(port) : "";
}

export function outboundFieldsFromInbound(
  inbound: any,
  node?: { ipv4?: string; ipv6?: string } | null,
  cert?: { domain?: string; share_domain?: string; status?: string } | null,
) {
  const protocol = String(inbound?.protocol || "vless");
  const security = String(inbound?.security || "none");
  const transport = protocol === "shadowsocks" ? "tcp" : String(inbound?.transport || "tcp");
  const address = inboundShareHost(inbound, node, cert);
  const dest_port = inboundSharePort(inbound);
  const sni = shareSNI(inbound, security);
  const ws = transport === "ws" || transport === "httpupgrade";
  return {
    protocol,
    core: String(inbound?.core || "xray"),
    address,
    dest_port,
    flow: transport === "grpc" ? "" : String(inbound?.flow || ""),
    transport,
    security,
    sni,
    fingerprint: String(inbound?.fingerprint || "edge"),
    ws_path: ws ? String(inbound?.ws_path || "/") : "",
    ws_host: ws ? String(inbound?.ws_host || "") : "",
    grpc_service: transport === "grpc" ? String(inbound?.grpc_service || "gun") : "",
    ss_method: String(inbound?.ss_method || "2022-blake3-aes-128-gcm"),
    reality_public_key: String(inbound?.reality_public_key || ""),
    reality_short_id: String(inbound?.reality_short_id || ""),
    spider_x: String(inbound?.spider_x || "/"),
  };
}

function userUUID(user: any): string {
  const direct = String(user?.uuid || user?.UUID || "").trim();
  if (direct) return direct;
  const creds = Array.isArray(user?.credentials) ? user.credentials : [];
  for (const cred of creds) {
    const value = String(cred?.uuid || cred?.UUID || cred?.secret || "").trim();
    if (value) return value;
  }
  return "";
}

function userInboundIDs(user: any): string[] {
  if (Array.isArray(user?.inbound_ids)) return user.inbound_ids.map((id: unknown) => String(id));
  return String(user?.inbound_ids || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function outboundTagFromInbound(inbound: any, fallback = "") {
  return String(inbound?.name || "").trim() || String(fallback || "").trim();
}

export function uuidForInbound(inbound: any, users: any[] = []): string {
  const inboundId = String(inbound?.id || "").trim();
  if (!inboundId) return "";
  const granted = (users || []).find(
    (user) => user && user.status !== "disabled" && userInboundIDs(user).includes(inboundId) && userUUID(user),
  );
  return granted ? userUUID(granted) : "";
}

function userSecret(user: any): string {
  const creds = Array.isArray(user?.credentials) ? user.credentials : [];
  for (const cred of creds) {
    const secret = String(cred?.secret || cred?.SecretMaterial || "").trim();
    if (secret) return secret;
  }
  return userUUID(user);
}

function grantedUserForInbound(inbound: any, users: any[] = []): any | null {
  const inboundId = String(inbound?.id || "").trim();
  if (!inboundId) return null;
  return (
    (users || []).find(
      (user) => user && user.status !== "disabled" && userInboundIDs(user).includes(inboundId) && userSecret(user),
    ) || null
  );
}

export function isSS2022(method: string) {
  return String(method || "").trim().toLowerCase().startsWith("2022-");
}

function ss2022KeyBytes(method: string) {
  return String(method || "").toLowerCase().includes("256") ? 32 : 16;
}

function decodeStdBase64(raw: string): Uint8Array | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const bin = atob(text);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function bytesToStdBase64(bytes: Uint8Array) {
  let bin = "";
  for (const value of bytes) bin += String.fromCharCode(value);
  return btoa(bin);
}

export async function ss2022Key(secret: string, method: string) {
  const trimmed = String(secret || "").trim();
  const n = ss2022KeyBytes(method);
  const raw = decodeStdBase64(trimmed);
  if (raw && raw.length === n) return trimmed;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(trimmed)));
  return bytesToStdBase64(digest.subarray(0, n));
}

export async function ss2022SharePassword(serverKey: string, userSecret: string, inboundID: string, method: string) {
  const server = String(serverKey || "").trim()
    ? await ss2022Key(serverKey, method)
    : await ss2022Key(`ss-server:${String(inboundID || "").trim()}`, method);
  return `${server}:${await ss2022Key(userSecret, method)}`;
}

export async function outboundPasswordFromInbound(inbound: any, users: any[] = []) {
  const protocol = String(inbound?.protocol || "");
  const granted = grantedUserForInbound(inbound, users);
  const secret = granted ? userSecret(granted) : "";
  if (protocol !== "shadowsocks") return secret;
  if (!secret) return "";
  const method = String(inbound?.ss_method || "2022-blake3-aes-128-gcm");
  if (!isSS2022(method)) return secret;
  return ss2022SharePassword(String(inbound?.ss_password || ""), secret, String(inbound?.id || ""), method);
}

export function displayExpiryInput(value: string) {
  return String(value || "")
    .trim()
    .replace("T", " ")
    .replace(/-/g, "/");
}

export function normalizeExpiryInput(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!match) return value;
  const pad = (part: string) => part.padStart(2, "0");
  const date = `${match[1]}-${pad(match[2])}-${pad(match[3])}`;
  if (!match[4]) return `${date}T00:00`;
  return `${date}T${pad(match[4])}:${match[5]}`;
}

const NODEMGT_RPC_ERROR_RULES: Array<[RegExp, string]> = [
  [/outbound_tag_reserved|outbound tag reserved/i, "nodemgt.outbound_tag_reserved"],
  [/outbound_tag_duplicate|(?:conflict:.*)?outbound tag\b/i, "nodemgt.outbound_tag_duplicate"],
  [/built-in https certificate required/i, "nodemgt.sub_reuse_https_missing"],
  [/subscription certificate/i, "nodemgt.sub_tls_paths_required"],
  [/root certificate is not issued/i, "nodemgt.no_root_certs"],
  [/root certificate required/i, "nodemgt.root_cert_required"],
  [/cloudflare api token missing/i, "nodemgt.cf_token_required"],
  [/acme email required/i, "nodemgt.acme_email_required"],
  [/subdomain required/i, "nodemgt.cert_share_domain_required"],
  [/certificate required/i, "nodemgt.no_certs"],
  [/name and node required/i, "nodemgt.name_node_required"],
  [/domain and node required/i, "nodemgt.domain_node_required"],
  [/cert and key paths required/i, "nodemgt.cert_paths_required"],
  [/csr not allowed/i, "nodemgt.csr_not_allowed"],
  [/csr cn|csr san|node mismatch/i, "nodemgt.node_mismatch"],
  [/traffic_reset_day/i, "nodemgt.invalid_reset_day"],
  [/invalid subscription port/i, "nodemgt.invalid_sub_port"],
  [/invalid reverse proxy port/i, "nodemgt.invalid_rp_port"],
  [/invalid inbound port/i, "nodemgt.invalid_inbound_port"],
  [/certificate is in use/i, "nodemgt.cert_in_use"],
  [/subscription path required/i, "nodemgt.sub_path_required"],
  [/username required/i, "nodemgt.username_required"],
  [/user required/i, "nodemgt.user_required"],
  [/plan required/i, "nodemgt.plan_required"],
  [/no assignment/i, "nodemgt.no_assignment"],
  [/quota exceeded/i, "nodemgt.quota_exceeded"],
  [/user disabled/i, "nodemgt.user_disabled"],
  [/user expired/i, "nodemgt.user_expired"],
  [/empty secret/i, "nodemgt.empty_secret"],
  [/address required/i, "nodemgt.address_required"],
  [/remove template bindings first/i, "nodemgt.tpl_bound_delete"],
  [/template name and content required|template must be between/i, "nodemgt.tpl_content_required"],
  [/create a new template to change its kind/i, "nodemgt.tpl_kind_locked"],
  [/template kind does not match client/i, "nodemgt.tpl_kind_mismatch"],
  [/unsupported template kind/i, "nodemgt.tpl_unsupported_kind"],
  [/unsupported template client|unsupported subscription client/i, "nodemgt.tpl_unsupported_client"],
  [/global scope_id must be empty/i, "nodemgt.tpl_global_scope"],
  [/invalid template binding scope/i, "nodemgt.tpl_invalid_scope"],
  [/invalid YAML template|invalid JSON template/i, "nodemgt.tpl_invalid_content"],
  [/YAML template must be an object|JSON template must be an object/i, "nodemgt.tpl_invalid_object"],
  [/user extra links/i, "nodemgt.tpl_remote_in_template"],
  [/sing-box template requires an outbounds array|invalid sing-box outbound/i, "nodemgt.tpl_singbox_outbounds"],
  [/native template requires/i, "nodemgt.tpl_native_sections"],
  [/unknown outbound reference|unknown final outbound|unknown proxy reference|unknown rule policy|unknown route outbound|unknown native policy|invalid proxy group/i, "nodemgt.tpl_unknown_ref"],
  [/duplicate or missing outbound tag|duplicate or missing proxy/i, "nodemgt.outbound_tag_duplicate"],
  [/ids required/i, "nodemgt.ids_required"],
  [/id required/i, "nodemgt.id_required"],
  [/name required/i, "nodemgt.name_required"],
  [/outbound required|route_outbound_required/i, "nodemgt.route_outbound_required"],
  [/extra_bytes/i, "nodemgt.invalid_extra_bytes"],
  [/nodemgt: not found/i, "nodemgt.not_found"],
  [/nodemgt: invalid\b|nodemgt: conflict\b/i, "nodemgt.invalid_input"],
  [/站点未启用远程管理/i, "nodemgt.firewall_site_off"],
  [/不支持防火墙|Agent 版本过旧/i, "nodemgt.firewall_agent_old"],
  [/节点未启用远程控制/i, "nodemgt.firewall_remote_off"],
  [/RPC Error|admin:nodemgt\./i, "nodemgt.request_failed"],
];

export function nodemgtRpcErrorKey(raw: string, kind = "") {
  const msg = String(raw || "");
  for (const [pattern, key] of NODEMGT_RPC_ERROR_RULES) {
    if (pattern.test(msg)) return key;
  }
  if (kind === "outbound" && /conflict/i.test(msg)) return "nodemgt.outbound_tag_duplicate";
  return "";
}

export type InboundFirewallUnavailable = "site_remote_off" | "agent_old" | "remote_off" | "no_node" | "";

export function inboundFirewallUnavailable(
  node?: { uuid?: string; remote_protocol?: number; remote_control_enabled?: boolean; firewall?: boolean; firewall_version?: number } | null,
  siteRemoteOn = false,
): InboundFirewallUnavailable {
  if (!siteRemoteOn) return "site_remote_off";
  if (!node?.uuid) return "no_node";
  if (Number(node.remote_protocol || 0) !== 2) return "agent_old";
  if (!node.remote_control_enabled) return "remote_off";
  if (!node.firewall || Number(node.firewall_version || 0) < 1) return "agent_old";
  return "";
}

export function inboundNeedsFirewallGrant(
  form: { firewall_allow?: string; enabled?: string; port?: string; protocol?: string; stack?: string; transport?: string },
  existing?: { firewall_linked?: boolean; enabled?: boolean; port?: number; protocol?: string; stack?: string; transport?: string } | null,
  nodePresent = true,
) {
  if (!nodePresent) return false;
  const wantAllow = form.firewall_allow === "true";
  const wasLinked = Boolean(existing?.firewall_linked);
  if (!wantAllow) return wasLinked;
  if (!wasLinked) return true;
  if ((existing?.enabled !== false) !== (form.enabled !== "false")) return true;
  if (Number(existing?.port || 0) !== Number(form.port || 0)) return true;
  if (String(existing?.protocol || "") !== String(form.protocol || "")) return true;
  if (String(existing?.stack || "") !== String(form.stack || "")) return true;
  if (String(existing?.transport || "") !== String(form.transport || "")) return true;
  return false;
}

export function stripFirewallGrantFields<T extends Record<string, unknown>>(raw: T) {
  if (!raw || typeof raw !== "object") return raw;
  const { next_grant: _grant, expires_at: _expires, ...rest } = raw as T & {
    next_grant?: unknown;
    expires_at?: unknown;
  };
  return rest as T;
}

export function nodemgtErrorMessage(
  raw: unknown,
  translate: (key: string) => string,
  kind = "",
) {
  const text = raw instanceof Error ? raw.message : String(raw ?? "");
  if (!text.trim()) return "";
  const key = nodemgtRpcErrorKey(text, kind);
  return key ? translate(key) : text;
}

export function nodemgtWarningMessage(
  raw: unknown,
  translate: (key: string, options?: Record<string, string>) => string,
) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const unsupported = text.match(/^(.+): unsupported by ([^()]+) \((.+)\)$/i);
  if (unsupported) {
    return translate("nodemgt.warn_unsupported_client", {
      name: unsupported[1].trim(),
      client: unsupported[2].trim(),
      features: unsupported[3].trim(),
    });
  }
  if (/^An external node could not be parsed$/i.test(text)) {
    return translate("nodemgt.warn_extra_unparsed");
  }
  if (/protocol outside Lite-Plus subscription support/i.test(text)) {
    return translate("nodemgt.warn_extra_unsupported");
  }
  return text;
}

export function outboundTagConflict(
  name: string,
  nodeUUID: string,
  rows: { id?: string; name?: string; node_uuid?: string }[] = [],
  selfID = "",
) {
  const tag = String(name || "").trim();
  const node = String(nodeUUID || "").trim();
  if (!tag) return "";
  if (/^(direct|block)$/i.test(tag)) return "reserved";
  if (!node) return "";
  const hit = rows.some(
    (row) =>
      String(row?.node_uuid || "") === node &&
      String(row?.name || "").trim() === tag &&
      String(row?.id || "") !== String(selfID || ""),
  );
  return hit ? "duplicate" : "";
}

export function randomRealityShortID() {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomInboundPort(used: Array<number | string> = []) {
  const min = 1024;
  const max = 49151;
  const blocked = new Set(
    used.map((value) => Number(value)).filter((port) => Number.isInteger(port) && port >= min && port <= max),
  );
  for (let i = 0; i < 32; i += 1) {
    const port = min + Math.floor(Math.random() * (max - min + 1));
    if (!blocked.has(port)) return port;
  }
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function moveAdjacentIDs(
  rows: { id?: string; sort_index?: number | string }[],
  id: string,
  dir: -1 | 1,
): string[] | null {
  const same = rows
    .filter((row) => row?.id)
    .slice()
    .sort((a, b) => Number(a.sort_index || 0) - Number(b.sort_index || 0));
  const index = same.findIndex((row) => row.id === id);
  const next = index + dir;
  if (index < 0 || next < 0 || next >= same.length) return null;
  const ids = same.map((row) => String(row.id));
  [ids[index], ids[next]] = [ids[next], ids[index]];
  return ids;
}
