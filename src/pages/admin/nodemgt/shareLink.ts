export type ShareLinkFields = {
  protocol?: string;
  name?: string;
  address?: string;
  dest_port?: string;
  uuid?: string;
  password?: string;
  username?: string;
  flow?: string;
  transport?: string;
  security?: string;
  sni?: string;
  fingerprint?: string;
  ws_path?: string;
  ws_host?: string;
  grpc_service?: string;
  ss_method?: string;
  reality_public_key?: string;
  reality_short_id?: string;
  spider_x?: string;
};

const TRANSPORTS = new Set(["tcp", "ws", "grpc", "httpupgrade", "xhttp"]);

function decodeBase64(raw: string) {
  const text = raw.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const padded = text + "=".repeat((4 - (text.length % 4)) % 4);
  try {
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    try {
      return atob(padded);
    } catch {
      return "";
    }
  }
}

function queryOf(url: URL) {
  const out: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function pick(q: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = q[key.toLowerCase()];
    if (value) return value;
  }
  return "";
}

function transportOf(raw: string) {
  const value = raw.toLowerCase();
  if (value === "splithttp" || value === "httpupgrade") return value === "splithttp" ? "xhttp" : "httpupgrade";
  if (value === "h2" || value === "http") return "tcp";
  return TRANSPORTS.has(value) ? value : "tcp";
}

function securityOf(raw: string) {
  const value = raw.toLowerCase();
  if (value === "reality") return "reality";
  if (value === "tls" || value === "xtls") return "tls";
  return "none";
}

function parseURI(raw: string): ShareLinkFields | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const protocol = url.protocol.replace(":", "").toLowerCase();
  if (!["vless", "trojan", "anytls", "socks", "socks5", "http", "https"].includes(protocol)) return null;
  const q = queryOf(url);
  const mapped = protocol === "socks5" ? "socks" : protocol === "https" ? "http" : protocol;
  const user = decodeURIComponent(url.username || "");
  const pass = decodeURIComponent(url.password || "");
  const transport = transportOf(pick(q, "type", "net", "network") || "tcp");
  const security = securityOf(
    pick(q, "security", "tls") ||
      (mapped === "trojan" || mapped === "anytls" || protocol === "https" ? "tls" : "none"),
  );
  const fields: ShareLinkFields = {
    protocol: mapped,
    name: decodeURIComponent(url.hash.replace(/^#/, "")),
    address: url.hostname.replace(/^\[/, "").replace(/]$/, ""),
    dest_port: url.port,
    transport,
    security,
    sni: pick(q, "sni", "servername", "peer"),
    fingerprint: pick(q, "fp", "fingerprint"),
    flow: pick(q, "flow"),
    ws_path: pick(q, "path"),
    ws_host: pick(q, "host", "authority"),
    grpc_service: pick(q, "servicename", "service"),
    reality_public_key: pick(q, "pbk", "publickey"),
    reality_short_id: pick(q, "sid", "shortid"),
    spider_x: pick(q, "spx", "spiderx"),
  };
  if (mapped === "vless") fields.uuid = user;
  else if (mapped === "trojan" || mapped === "anytls") fields.password = user;
  else {
    fields.username = user;
    fields.password = pass;
  }
  if (!fields.address) return null;
  if (!fields.dest_port) fields.dest_port = mapped === "http" || mapped === "socks" ? "80" : "443";
  return fields;
}

function parseVmess(raw: string): ShareLinkFields | null {
  const payload = decodeBase64(raw.slice("vmess://".length));
  if (!payload) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (key: string) => String(data[key] ?? "").trim();
  const tls = str("tls") || str("security");
  const net = str("net") || str("type") || "tcp";
  const fields: ShareLinkFields = {
    protocol: "vmess",
    name: str("ps"),
    address: str("add"),
    dest_port: str("port"),
    uuid: str("id"),
    transport: transportOf(net),
    security: securityOf(tls),
    sni: str("sni") || str("host"),
    fingerprint: str("fp"),
    ws_path: str("path"),
    ws_host: str("host"),
    grpc_service: str("path") && net === "grpc" ? str("path") : "",
  };
  if (!fields.address) return null;
  return fields;
}

function parseShadowsocks(raw: string): ShareLinkFields | null {
  const rest = raw.slice("ss://".length);
  const hashIndex = rest.indexOf("#");
  const name = hashIndex >= 0 ? decodeURIComponent(rest.slice(hashIndex + 1)) : "";
  const body = hashIndex >= 0 ? rest.slice(0, hashIndex) : rest;
  const at = body.lastIndexOf("@");
  let method = "";
  let password = "";
  let hostPort = "";
  if (at >= 0) {
    const user = decodeURIComponent(body.slice(0, at));
    hostPort = body.slice(at + 1);
    const decoded = user.includes(":") ? user : decodeBase64(user);
    const split = decoded.indexOf(":");
    if (split < 0) return null;
    method = decoded.slice(0, split);
    password = decoded.slice(split + 1);
  } else {
    const decoded = decodeBase64(body);
    const split = decoded.lastIndexOf("@");
    if (split < 0) return null;
    const user = decoded.slice(0, split);
    hostPort = decoded.slice(split + 1);
    const colon = user.indexOf(":");
    if (colon < 0) return null;
    method = user.slice(0, colon);
    password = user.slice(colon + 1);
  }
  const colon = hostPort.lastIndexOf(":");
  if (colon < 0) return null;
  return {
    protocol: "shadowsocks",
    name,
    address: hostPort.slice(0, colon).replace(/^\[/, "").replace(/]$/, ""),
    dest_port: hostPort.slice(colon + 1),
    password,
    ss_method: method,
    transport: "tcp,udp",
    security: "none",
  };
}

export function parseShareLink(raw: string): ShareLinkFields | null {
  const line = raw.trim().split(/\s+/)[0] || "";
  if (!line.includes("://")) return null;
  const lower = line.toLowerCase();
  if (lower.startsWith("vmess://")) return parseVmess(line);
  if (lower.startsWith("ss://")) return parseShadowsocks(line);
  return parseURI(line);
}
