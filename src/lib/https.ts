export interface HTTPSSettings {
  https_enabled: boolean;
  https_listen: string;
  https_redirect_http: boolean;
  https_certificate_path: string;
  https_private_key_path: string;
}

export interface HTTPSStatus {
  enabled: boolean;
  running: boolean;
  ready: boolean;
  listener_ipv4: boolean;
  listener_ipv6: boolean;
  listener_ipv4_available: boolean;
  listener_ipv6_available: boolean;
  listener_probe_done: boolean;
  listen: string;
  domains: string[];
  issuer?: string;
  expires_at?: string;
  last_checked_at?: string;
  last_loaded_at?: string;
  fingerprint?: string;
  error?: string;
}

export interface HTTPSPayload {
  settings: HTTPSSettings;
  status: HTTPSStatus;
  http_origin?: string;
  https_origin?: string;
}

const defaultSettings: HTTPSSettings = {
  https_enabled: false,
  https_listen: ":37888",
  https_redirect_http: false,
  https_certificate_path: "./data/tls/server.crt",
  https_private_key_path: "./data/tls/server.key",
};

const defaultStatus: HTTPSStatus = {
  enabled: false,
  running: false,
  ready: false,
  listener_ipv4: false,
  listener_ipv6: false,
  listener_ipv4_available: true,
  listener_ipv6_available: true,
  listener_probe_done: true,
  listen: ":37888",
  domains: [],
};

export type HTTPSErrorKind =
  | "certificate_required"
  | "certificate_invalid"
  | "certificate_expired"
  | "port_unavailable"
  | "no_root_certificate"
  | "apply_failed";

export type RootCertificateChoice = {
  id: string;
  domain: string;
  issuer?: string;
  not_after?: string | null;
};

export type ReuseRootCertificatePayload = HTTPSPayload & {
  need_pick?: boolean;
  certs?: RootCertificateChoice[];
  domain?: string;
};

export function classifyHTTPSError(error: unknown): HTTPSErrorKind {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  if (/no issued root certificate|root certificate is not issued/.test(message)) {
    return "no_root_certificate";
  }
  if (/let'?s encrypt|read certificate|read private key|no such file|cannot find|paths are required/.test(message)) {
    return "certificate_required";
  }
  if (/expired/.test(message)) return "certificate_expired";
  if (/do not match|invalid.*certificate|parse certificate|chain is empty|private key/.test(message)) {
    return "certificate_invalid";
  }
  if (/listen on|address already in use|invalid https listen|invalid https.*port/.test(message)) {
    return "port_unavailable";
  }
  return "apply_failed";
}

async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.status === "error") {
    throw new Error(data?.message || `HTTP ${response.status}`);
  }
  return data?.data as T;
}

let httpsSettingsSnapshot: HTTPSPayload | null = null;

export function getHTTPSSettingsSnapshot(): HTTPSPayload | null {
  return httpsSettingsSnapshot;
}

function rememberHTTPSSettings(payload: HTTPSPayload): HTTPSPayload {
  httpsSettingsSnapshot = payload;
  return payload;
}

export async function getHTTPSSettings(): Promise<HTTPSPayload> {
  const response = await fetch("/api/admin/settings/https");
  const payload = await parseResponse<Partial<HTTPSPayload>>(response);
  return rememberHTTPSSettings({
    settings: { ...defaultSettings, ...(payload.settings ?? {}) },
    status: { ...defaultStatus, ...(payload.status ?? {}) },
    http_origin: payload.http_origin,
    https_origin: payload.https_origin,
  });
}

export function prefetchHTTPSSettings(): Promise<HTTPSPayload> {
  return getHTTPSSettings();
}

export function buildHTTPFallbackURL(
  httpOrigin: string | undefined,
  location: Pick<Location, "protocol" | "pathname" | "search" | "hash">,
  recoveryToken = Date.now().toString(36),
): string | null {
  if (location.protocol !== "https:" || !httpOrigin) return null;
  try {
    const origin = new URL(httpOrigin);
    if (origin.protocol !== "http:") return null;
    const fallback = new URL(
      `${location.pathname}${location.search}${location.hash}`,
      origin,
    );
    fallback.searchParams.set("_komari_http_recovery", recoveryToken);
    return fallback.toString();
  } catch {
    return null;
  }
}

export function buildHTTPSRedirectURL(
  httpsOrigin: string | undefined,
  location: Pick<Location, "protocol" | "pathname" | "search" | "hash">,
): string | null {
  if (location.protocol !== "http:" || !httpsOrigin) return null;
  try {
    const origin = new URL(httpsOrigin);
    if (origin.protocol !== "https:") return null;
    return new URL(
      `${location.pathname}${location.search}${location.hash}`,
      origin,
    ).toString();
  } catch {
    return null;
  }
}

export async function updateHTTPSSettings(
  settings: HTTPSSettings,
): Promise<HTTPSPayload> {
  const response = await fetch("/api/admin/settings/https", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const payload = await parseResponse<HTTPSPayload>(response);
  return rememberHTTPSSettings({
    settings: { ...defaultSettings, ...(payload.settings ?? {}) },
    status: { ...defaultStatus, ...(payload.status ?? {}) },
    http_origin: payload.http_origin,
    https_origin: payload.https_origin,
  });
}

export async function reloadHTTPSCertificate(): Promise<HTTPSStatus> {
  const response = await fetch("/api/admin/settings/https/reload", {
    method: "POST",
  });
  const payload = await parseResponse<{ status: HTTPSStatus }>(response);
  if (httpsSettingsSnapshot) {
    httpsSettingsSnapshot = { ...httpsSettingsSnapshot, status: payload.status };
  }
  return payload.status;
}

export async function reuseRootCertificate(id?: string): Promise<ReuseRootCertificatePayload> {
  const response = await fetch("/api/admin/settings/https/reuse-root", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(id ? { id } : {}),
  });
  const payload = await parseResponse<ReuseRootCertificatePayload>(response);
  if (payload.need_pick) {
    return payload;
  }
  return {
    ...rememberHTTPSSettings({
      settings: { ...defaultSettings, ...(payload.settings ?? {}) },
      status: { ...defaultStatus, ...(payload.status ?? {}) },
      http_origin: payload.http_origin,
      https_origin: payload.https_origin,
    }),
    domain: payload.domain,
  };
}
