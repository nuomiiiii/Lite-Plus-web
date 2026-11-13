export type ProtectionMode = "observe" | "enforce";

export type ProtectionCapability = {
  platform?: string;
  linux?: boolean;
  privileged?: boolean;
  static_backend?: string;
  nft_present?: boolean;
  nft_version?: string;
  runtime_ready?: boolean;
  runtime_enabled?: boolean;
  can_install?: boolean;
  can_update?: boolean;
  can_enable_runtime?: boolean;
  package_manager?: string;
  missing?: string[];
  conflicts?: string[];
  manual_hints?: string[];
  planned_steps?: string[];
  features?: {
    sets_timeout?: boolean;
    conn_limit?: boolean;
    meter?: boolean;
    nflog?: boolean;
    ipv4?: boolean;
    ipv6?: boolean;
  };
  scope_note?: string;
  sshd_log_path?: string;
};

export type ProtectionLogSource = {
  id: string;
  format: string;
  path: string;
  deploy_mode?: string;
  host_filter?: string;
  bind_protocol?: string;
  bind_port?: string;
  bind_addr?: string;
};

export type ProtectionPolicy = {
  id: string;
  name?: string;
  enabled: boolean;
  mode: ProtectionMode;
  bind_addr?: string;
  protocol: string;
  port: string;
  ban_duration_sec?: number;
  group_id?: string;
  syn_rate?: number;
  syn_burst?: number;
  conn_limit?: number;
  request_window_sec?: number;
  request_threshold?: number;
  path_window_sec?: number;
  path_threshold?: number;
  paths?: string[];
  source_id?: string;
};

export type ProtectionConfig = {
  revision: number;
  enabled: boolean;
  runtime_enabled: boolean;
  whitelist?: string[];
  sources?: ProtectionLogSource[];
  policies?: ProtectionPolicy[];
};

export type ProtectionBan = {
  ban_id: string;
  event_id: string;
  ip: string;
  source_node?: string;
  policy_id?: string;
  reason_type?: string;
  created_at?: string;
  expires_at?: string;
  group_id?: string;
  status?: string;
  scope?: string;
};

export type ProtectionGroupMember = {
  uuid: string;
  name?: string;
  online?: boolean;
  ready?: boolean;
  supported?: boolean;
  applied_revision?: number;
  delivery_status?: string;
};

export type ProtectionGroup = {
  id: string;
  name: string;
  enabled: boolean;
  revision: number;
  member?: boolean;
  applied_revision?: number;
  delivery_status?: string;
  members?: ProtectionGroupMember[];
};

export type ProtectionUpgrade = {
  id?: string;
  phase?: string;
  result?: string;
  error?: string;
};

export type ProtectionView = {
  uuid: string;
  name: string;
  config: ProtectionConfig;
  delivery_status?: string;
  delivery_error?: string;
  applied_revision?: number;
  capability?: ProtectionCapability | null;
  supported?: boolean;
  unavailable?: string;
  linux?: boolean;
  bans?: ProtectionBan[];
  groups?: ProtectionGroup[];
  upgrade?: ProtectionUpgrade | null;
  preview?: Array<{
    ts?: string;
    ip?: string;
    method?: string;
    path?: string;
    host?: string;
    status?: number;
    error?: string;
  }>;
  preview_error?: string;
  source_stats?: Array<{
    id: string;
    path?: string;
    last_read_at?: string;
    lag_ms?: number;
    parsed?: number;
    dropped?: number;
    errors?: number;
    queue_dropped?: number;
  }>;
  observe_hits?: Array<{
    event_id?: string;
    ip?: string;
    policy_id?: string;
    reason_type?: string;
    created_at?: string;
  }>;
  nflog?: Array<{
    at?: string;
    ip?: string;
    dport?: number;
    proto?: string;
    prefix?: string;
  }>;
  scope_note?: string;
  next_grant?: string;
  expires_at?: string;
};
