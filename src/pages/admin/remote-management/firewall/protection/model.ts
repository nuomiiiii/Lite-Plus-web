import type { ProtectionBan, ProtectionConfig, ProtectionLogSource, ProtectionPolicy, ProtectionView } from "./types.ts";

export type ServicePort = { name: string; protocol: string; port: string };

export function servicePorts(rules: Array<{ enabled: boolean; action: string; protocol: string; port: string; comment?: string }>): ServicePort[] {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = `${rule.protocol}:${rule.port}`;
    if (!rule.enabled || rule.action !== "allow" || !/^\d+$/.test(rule.port) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((rule) => ({ name: rule.comment || `${rule.protocol.toUpperCase()} ${rule.port}`, protocol: rule.protocol, port: rule.port }));
}

export function normalizeProtectionConfig(config?: ProtectionConfig): ProtectionConfig & { sources: ProtectionLogSource[]; policies: ProtectionPolicy[]; whitelist: string[] } {
  return { revision: 0, enabled: false, runtime_enabled: false, ...config,
    sources: config?.sources ?? [], policies: config?.policies ?? [], whitelist: config?.whitelist ?? [] };
}

export function preparePolicy(policy: ProtectionPolicy, network: boolean, logs: boolean, paths: string, sources: ProtectionLogSource[]): ProtectionPolicy {
  const source = sources.find((item) => item.id === policy.source_id);
  const tcp = policy.protocol === "tcp" || policy.protocol === "both";
  const logDetection = logs && tcp;
  const ssh = source?.format === "sshd";
  return {
    ...policy,
    name: policy.name?.trim(), port: policy.port.trim(), bind_addr: policy.bind_addr?.trim(),
    syn_rate: network && tcp ? policy.syn_rate : 0,
    syn_burst: network && tcp ? policy.syn_burst : 0,
    conn_limit: network && tcp ? policy.conn_limit : 0,
    source_id: logDetection ? policy.source_id : "",
    request_threshold: logDetection ? policy.request_threshold : 0,
    path_threshold: logDetection && !ssh ? policy.path_threshold : 0,
    paths: logDetection && !ssh ? paths.split("\n").map((path) => path.trim()).filter(Boolean) : [],
    mode: logDetection && source?.deploy_mode === "proxy" ? "observe" : policy.mode,
  };
}

export function logSourceCoversPolicy(source: ProtectionLogSource, policy: ProtectionPolicy): boolean {
  const proto = String(policy.protocol || "tcp").toLowerCase();
  if (source.format === "sshd") {
    return (proto === "tcp" || proto === "both" || proto === "") && String(policy.port ?? "").trim() === String(source.bind_port ?? "").trim();
  }
  const bindProto = String(source.bind_protocol || "").toLowerCase();
  if (bindProto && proto && proto !== "both" && bindProto !== proto) return false;
  const port = String(policy.port ?? "").trim();
  const bindPort = String(source.bind_port ?? "").trim();
  if (!bindPort || !port || port === "*") return true;
  return bindPort === port;
}

export function sshBindingError(policy: ProtectionPolicy, sources: ProtectionLogSource[]): string {
  const source = sources.find((item) => item.id === policy.source_id);
  if (source?.format === "sshd") {
    return logSourceCoversPolicy(source, policy) ? "" : "ssh_port_mismatch";
  }
  if (policy.source_id) return "";
  const sshd = sources.filter((item) => item.format === "sshd");
  if (!sshd.length || !((policy.request_threshold ?? 0) > 0)) return "";
  if (sshd.some((item) => logSourceCoversPolicy(item, policy))) return "";
  return sources.some((item) => item.format && item.format !== "sshd" && String(item.bind_port ?? "").trim() && logSourceCoversPolicy(item, policy)) ? "" : "ssh_port_mismatch";
}

export function protectionSshConfigError(config?: { sources?: ProtectionLogSource[]; policies?: ProtectionPolicy[] }): string {
  const sources = config?.sources ?? [];
  if (sources.filter((item) => item.format === "sshd").length > 1) return "ssh_duplicate_source";
  for (const policy of config?.policies ?? []) {
    const source = sources.find((item) => item.id === policy.source_id);
    if (source?.format === "sshd") {
      if (!logSourceCoversPolicy(source, policy)) return "ssh_port_mismatch";
      continue;
    }
    if (policy.source_id) continue;
    if (!((policy.request_threshold ?? 0) > 0 && (policy.request_window_sec ?? 0) > 0)) continue;
    const sshd = sources.filter((item) => item.format === "sshd");
    if (!sshd.length) continue;
    if (sshd.some((item) => logSourceCoversPolicy(item, policy))) continue;
    if (sources.some((item) => item.format && item.format !== "sshd" && String(item.bind_port ?? "").trim() && logSourceCoversPolicy(item, policy))) continue;
    return "ssh_port_mismatch";
  }
  return "";
}

export function duplicateSshSource(sources: ProtectionLogSource[], next: ProtectionLogSource): boolean {
  return next.format === "sshd" && sources.some((item) => item.format === "sshd" && item.id !== next.id);
}

export function defaultSshSource(id: string, sshPort?: string, sshdLogPath?: string): ProtectionLogSource {
  return {
    id,
    format: "sshd",
    path: String(sshdLogPath || "").trim() || "journal:sshd",
    deploy_mode: "direct",
    bind_protocol: "tcp",
    bind_port: String(sshPort || "").trim(),
  };
}

export type SshSourceMemory = { path: string; bind_port: string };

export function rememberedSshSource(source: ProtectionLogSource): SshSourceMemory {
  if (source.format !== "sshd") return { path: "", bind_port: "" };
  return { path: String(source.path || "").trim(), bind_port: String(source.bind_port || "").trim() };
}

export function applyLogSourceFormat(
  draft: ProtectionLogSource,
  format: string,
  remembered: SshSourceMemory,
  suggestedPath?: string,
  suggestedPort?: string,
): { next: ProtectionLogSource; remembered: SshSourceMemory } {
  if (format === "sshd") {
    return {
      next: {
        ...draft,
        format: "sshd",
        deploy_mode: "direct",
        bind_protocol: "tcp",
        path: remembered.path || String(suggestedPath || "").trim() || "journal:sshd",
        bind_port: remembered.bind_port || String(suggestedPort || "").trim(),
        host_filter: "",
      },
      remembered,
    };
  }
  return {
    next: { ...draft, format },
    remembered: draft.format === "sshd"
      ? { path: String(draft.path || "").trim(), bind_port: String(draft.bind_port || "").trim() }
      : remembered,
  };
}

export function protectionBanForever(sec?: number) {
  return (sec ?? 0) < 0;
}

export function rememberedBanDurationSec(sec?: number) {
  return (sec ?? 0) > 0 ? Number(sec) : 600;
}

export function protectionBanExpiresForever(value?: string) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 9999;
}

export function protectionBanActive(ban?: Pick<ProtectionBan, "status" | "expires_at"> | null, now = Date.now()) {
  if (!ban || ban.status === "revoked") return false;
  if (protectionBanExpiresForever(ban.expires_at)) return true;
  if (!ban.expires_at) return false;
  const date = new Date(ban.expires_at);
  return Number.isFinite(date.getTime()) && date.getTime() > now;
}

export type ProtectionActivityKind = "ban" | "expired" | "observe" | "network";

export type ProtectionActivityRow = {
  key: string;
  kind: ProtectionActivityKind;
  ip?: string;
  reason?: string;
  policyID?: string;
  sourceNode?: string;
  groupID?: string;
  at?: string;
  expiresAt?: string;
  networkService?: string;
  ban?: ProtectionBan;
  revoked?: boolean;
};

function activityTime(value?: string) {
  const date = new Date(value ?? "");
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

export function protectionActivityRows(view: Pick<ProtectionView, "bans" | "observe_hits" | "nflog">, now = Date.now()): ProtectionActivityRow[] {
  const bans = view.bans ?? [];
  const covered = new Set(bans.flatMap((ban) => [ban.event_id, ban.ban_id].filter(Boolean)));
  const rows: ProtectionActivityRow[] = [
    ...bans.map((ban) => {
      const active = protectionBanActive(ban, now);
      return {
        key: `ban-${ban.ban_id}`,
        kind: (active ? "ban" : "expired") as ProtectionActivityKind,
        ip: ban.ip,
        reason: ban.reason_type,
        policyID: ban.policy_id,
        sourceNode: ban.source_node,
        groupID: ban.group_id,
        at: ban.created_at,
        expiresAt: ban.expires_at,
        ban: active ? ban : undefined,
        revoked: ban.status === "revoked",
      };
    }),
    ...(view.observe_hits ?? []).filter((hit) => !hit.event_id || !covered.has(hit.event_id)).map((hit, index) => ({
      key: `observe-${hit.event_id || index}`,
      kind: "observe" as const,
      ip: hit.ip,
      reason: hit.reason_type,
      policyID: hit.policy_id,
      at: hit.created_at,
    })),
    ...(view.nflog ?? []).map((hit, index) => ({
      key: `network-${index}`,
      kind: "network" as const,
      ip: hit.ip,
      reason: hit.prefix,
      at: hit.at,
      networkService: [hit.proto?.toUpperCase(), hit.dport].filter(Boolean).join(" "),
    })),
  ];
  return rows.sort((left, right) => activityTime(right.at) - activityTime(left.at) || activityTime(right.expiresAt) - activityTime(left.expiresAt));
}

export function expandPolicyProtocols(policy: ProtectionPolicy, udpID: string): ProtectionPolicy[] {
  if (policy.protocol !== "both") return [policy];
  return [
    { ...policy, protocol: "tcp" },
    { ...policy, id: udpID, protocol: "udp", syn_rate: 0, syn_burst: 0, conn_limit: 0, source_id: "", request_threshold: 0, path_threshold: 0, paths: [] },
  ];
}

export function formatProtectionDateTime(value?: string) {
  if (!value) return "";
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (match) return `${match[1]} ${match[2]}`;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
