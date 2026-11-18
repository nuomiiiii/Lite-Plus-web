import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import InputBase from "@mui/material/InputBase";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import AdminPageTitle from "@/components/admin/AdminPageTitle";
import { AdminMobileCardStack, AdminMobileListCard } from "@/components/admin/AdminMobileListCard";
import {
  AdminListFiltersBar,
  AdminListSearch,
  AdminListSelect,
  AdminListShell,
} from "@/components/admin/AdminListShell";
import {
  AdminPagination,
  useAdminPagination,
} from "@/components/admin/AdminPagination";
import { AdminSheetTabs, AdminTabLabel } from "@/components/admin/AdminSheetTabs";
import {
  RequireAllowMCP,
  RequireAllowRemoteManagement,
} from "@/components/admin/RemoteManagementGate";
import { ADMIN_LIST_ACTION_SX } from "@/components/admin/adminListLayout";
import { Badge } from "@/components/admin/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code,
  Copy,
  Download,
  Folder,
  History,
  LinkIcon,
  LockKeyhole,
  Network,
  Search,
  Shield,
  Terminal,
  Trash2,
  X,
} from "@/components/admin/muiIcons";
import Flag from "@/components/Flag";
import { useAccount } from "@/contexts/AccountContext";
import { useNodeDetails } from "@/contexts/NodeDetailsContext";
import {
  AdminNodeLiveDataProvider,
  nodeOnlineState,
  useAdminNodeLiveData,
} from "@/hooks/use-admin-node-live-data";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAdminTabParam } from "@/hooks/useAdminTabParam";
import { startVisibleInterval, useVisibleInterval } from "@/hooks/useVisibleInterval";
import {
  LITE_BLUE,
  LITE_BLUE_SOFT,
  NODE_OFFLINE,
  NODE_ONLINE,
} from "@/theme/brand";
import { sameOriginFetchInit } from "@/utils/security";
import { mcpAuthorizationPolicy } from "@/utils/mcpAuthorization";
import i18n from "@/i18n/config";
import {
  MCP_DURATION_PRESETS,
  MCP_HARD_MAX_MINUTES,
  displayUnitForMinutes,
  displayValueForMinutes,
  formatDurationLabel,
  parseDurationInput,
  type DurationUnit,
} from "@/utils/mcpDuration";
import {
  nodeDisplayIP,
  nodeDisplayName,
  nodeLookup,
  nodeMCPUnavailableReason,
  nodeSupportsMCP,
  operationResultKey,
  previewLine,
  stripANSI,
} from "@/utils/mcpDisplay";
import { filterRemoteNodes, orderRemoteNodes } from "@/utils/remoteNodePicker";
import { getRegionCode } from "@/utils/regionHelper";
import { confirmAdminPasskey, passkeyUnavailableMessage } from "@/utils/webauthn";

type MCPTab = "settings" | "leases" | "operations";
const MCP_TABS = ["settings", "leases", "operations"] as const;

type MCPSettings = {
  allow_mcp: boolean;
  allow_remote_management: boolean;
  mcp_default_duration_minutes: number;
  mcp_max_duration_minutes: number;
  mcp_max_concurrency: number;
  endpoint: string;
};

type MCPLease = {
  id: string;
  status: string;
  client_name: string;
  owner_username?: string;
  note: string;
  mode?: string;
  target_uuids: string[];
  all_nodes?: boolean;
  created_at: string;
  expires_at: string;
  long_term?: boolean;
  max_concurrency: number;
  running: number;
};

type MCPOperation = {
  id: string;
  lease_id: string;
  agent_uuid: string;
  tool_name: string;
  state: string;
  exit_code: number;
  preview?: string;
  created_at: string;
};

const MCP_HISTORY_DAYS = 3;
const MCP_LEASES_PAGE_SIZE = 5;
const MCP_LIVE_POLL_MS = 4000;
const MCP_USER_MANUAL_URL = "https://nuomiiiii.github.io/Lite-document/remote/mcp";

const CARD_SX = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "8px",
  px: { xs: 2, md: 2.5 },
  py: 2,
  bgcolor: "background.paper",
  minWidth: 0,
};

const FIELD_SX = {
  height: 40,
  display: "flex",
  alignItems: "center",
  gap: 1.25,
  px: 1.5,
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "8px",
  bgcolor: "background.paper",
  minWidth: 0,
};

const DURATION_INPUT_SX = {
  display: "flex",
  alignItems: "center",
  minWidth: 0,
  height: 40,
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "8px",
  bgcolor: "background.paper",
  overflow: "hidden",
  "&:focus-within": {
    borderColor: LITE_BLUE,
    boxShadow: `0 0 0 1px ${LITE_BLUE}`,
  },
};

const DURATION_VALUE_SX = {
  width: "100%",
  minWidth: 0,
  flex: 1,
  border: 0,
  outline: 0,
  bgcolor: "transparent",
  color: "text.primary",
  px: 1.5,
  height: "100%",
  fontSize: 14,
  fontFamily: "inherit",
  fontVariantNumeric: "tabular-nums",
};

function deliverOAuthCallback(redirectURI: string) {
  const uri = redirectURI.trim();
  if (!uri) return;
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  const cleanup = () => frame.remove();
  frame.onload = cleanup;
  frame.onerror = cleanup;
  window.setTimeout(cleanup, 8000);
  frame.src = uri;
  document.body.appendChild(frame);
  void fetch(uri, { mode: "no-cors", credentials: "omit", cache: "no-store" }).catch(() => undefined);
}

function mcpUserMessage(message: string): string {
  if (/does not support MCP full management|不支持 MCP 完整管理/.test(message)) {
    return String(i18n.t("mcp.node_need_agent"));
  }
  return message;
}

async function mcpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...sameOriginFetchInit(),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === "error") {
    throw new Error(mcpUserMessage(payload.message || `HTTP ${response.status}`));
  }
  return payload.data as T;
}

function formatRemaining(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms) || ms <= 0) return "00:00";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function MCPPage() {
  return (
    <RequireAllowRemoteManagement>
      <RequireAllowMCP>
        <AdminNodeLiveDataProvider>
          <MCPPageBody />
        </AdminNodeLiveDataProvider>
      </RequireAllowMCP>
    </RequireAllowRemoteManagement>
  );
}

function MCPPageBody() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useAdminTabParam(MCP_TABS, "settings");
  const [settings, setSettings] = useState<MCPSettings | null>(null);
  const [leases, setLeases] = useState<MCPLease[]>([]);
  const [operations, setOperations] = useState<MCPOperation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authorizedOpen, setAuthorizedOpen] = useState(false);
  const [authorizedRedirectURI, setAuthorizedRedirectURI] = useState("");
  const [editingLease, setEditingLease] = useState<MCPLease | null>(null);
  const authorizeID = params.get("authorize")?.trim() || "";
  const prefillNodes = useMemo(
    () =>
      (params.get("nodes") || params.get("uuid") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [params],
  );

  const load = useCallback(async () => {
    setError(null);
    const [nextSettings, nextLeases, nextOps] = await Promise.all([
      mcpFetch<MCPSettings>("/api/admin/mcp/settings"),
      mcpFetch<{ leases: MCPLease[] }>("/api/admin/mcp/leases"),
      mcpFetch<{ operations: MCPOperation[] }>("/api/admin/mcp/operations"),
    ]);
    setSettings(nextSettings);
    setLeases(nextLeases.leases || []);
    setOperations(nextOps.operations || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    load().catch((err: Error) => {
      if (!cancelled) setError(err.message);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useVisibleInterval(
    () => {
      void load().catch(() => {});
    },
    tab === "leases" || tab === "operations" ? MCP_LIVE_POLL_MS : null,
  );

  const openAuthorize = () => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("authorize", current.get("authorize") || "new");
      return next;
    });
  };

  const activeLeases = leases.filter((lease) => lease.status === "active");

  return (
    <Stack spacing={2.5} className="p-0 md:p-4" data-testid="admin-mcp-page">
        <Box
          sx={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          gap: 1.5,
          alignItems: isMobile ? "stretch" : "center",
          justifyContent: "space-between",
        }}
      >
        <AdminPageTitle description={t("mcp.page_description")}>
          {t("mcp.title")}
        </AdminPageTitle>
        <Button
          variant="contained"
          className="shrink-0"
          sx={{
            ...ADMIN_LIST_ACTION_SX,
            alignSelf: isMobile ? "stretch" : "flex-start",
            width: isMobile ? "100%" : "auto",
          }}
          onClick={openAuthorize}
        >
          {t("mcp.new_authorization")}
        </Button>
      </Box>

      <AdminSheetTabs>
        <Tabs
          value={tab}
          onChange={(_, value: MCPTab) => value && setTab(value)}
          variant="scrollable"
          scrollButtons={false}
        >
          <Tab
            value="settings"
            label={
              <AdminTabLabel icon={<Network size={18} />}>
                {t("mcp.tabs.settings")}
              </AdminTabLabel>
            }
          />
          <Tab
            value="leases"
            label={
              <AdminTabLabel icon={<Shield size={18} />}>
                {t("mcp.tabs.leases")}
                {activeLeases.length ? (
                  <Box
                    component="span"
                    sx={{
                      ml: 0.75,
                      px: 0.75,
                      lineHeight: "19px",
                      fontSize: 11,
                      borderRadius: "5px",
                      bgcolor: tab === "leases" ? LITE_BLUE_SOFT : "action.hover",
                      color: tab === "leases" ? "primary.main" : "text.secondary",
                    }}
                  >
                    {activeLeases.length}
                  </Box>
                ) : null}
              </AdminTabLabel>
            }
          />
          <Tab
            value="operations"
            label={
              <AdminTabLabel icon={<History size={18} />}>
                {t("mcp.tabs.operations")}
              </AdminTabLabel>
            }
          />
        </Tabs>
      </AdminSheetTabs>

      {error && !settings ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              {t("common.retry", "Retry")}
            </Button>
          }
        >
          {error}
        </Alert>
      ) : null}

      {tab === "settings" ? (
        <MCPSettingsTab
          settings={settings}
          leases={activeLeases}
          onOpenLeases={() => setTab("leases")}
          onSettingsSaved={(next) =>
            setSettings((current) => (current ? { ...current, ...next } : current))
          }
          onReloadLeases={load}
        />
      ) : null}
      {tab === "leases" ? (
        <MCPLeasesTab
          leases={leases}
          operations={operations}
          onReload={load}
          onEdit={setEditingLease}
          onOpenOperations={() => setTab("operations")}
          onReauthorize={(uuids, allNodes) => {
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.set("authorize", current.get("authorize") || "new");
              if (uuids.length) next.set("nodes", uuids.join(","));
              else next.delete("nodes");
              if (allNodes) next.set("all_nodes", "true");
              else next.delete("all_nodes");
              return next;
            });
          }}
        />
      ) : null}
      {tab === "operations" ? (
        <MCPOperationsTab operations={operations} leases={leases} onReload={load} />
      ) : null}

      {settings && authorizeID ? (
        <MCPAuthorizeDialog
          open
          requestID={authorizeID === "new" ? "" : authorizeID}
          prefillNodes={prefillNodes}
          prefillAllNodes={params.get("all_nodes") === "true"}
          settings={settings}
          onClose={() => {
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.delete("authorize");
              next.delete("nodes");
              next.delete("uuid");
              next.delete("all_nodes");
              return next;
            });
          }}
          onApproved={load}
          onConnected={(redirectURI) => {
            const uri = redirectURI.trim();
            deliverOAuthCallback(uri);
            setAuthorizedRedirectURI(uri);
            setAuthorizedOpen(true);
          }}
        />
      ) : null}

      {settings && editingLease ? (
        <MCPAuthorizeDialog
          key={editingLease.id}
          open
          requestID=""
          prefillNodes={editingLease.target_uuids}
          editLease={editingLease}
          settings={settings}
          onClose={() => setEditingLease(null)}
          onApproved={load}
          onConnected={() => {}}
        />
      ) : null}

      <MCPAuthorizedDialog
        open={authorizedOpen}
        redirectURI={authorizedRedirectURI}
        onClose={() => {
          setAuthorizedOpen(false);
          setAuthorizedRedirectURI("");
        }}
      />
    </Stack>
  );
}

function MCPSettingsTab({
  settings,
  leases,
  onOpenLeases,
  onSettingsSaved,
  onReloadLeases,
}: {
  settings: MCPSettings | null;
  leases: MCPLease[];
  onOpenLeases: () => void;
  onSettingsSaved: (next: Partial<MCPSettings>) => void;
  onReloadLeases: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { nodeDetail } = useNodeDetails();
  const [now, setNow] = useState(() => Date.now());
  const [defaultUnit, setDefaultUnit] = useState<DurationUnit>("minutes");
  const [maxUnit, setMaxUnit] = useState<DurationUnit>("hours");
  const [defaultRaw, setDefaultRaw] = useState("30");
  const [maxRaw, setMaxRaw] = useState("24");
  const [concurrency, setConcurrency] = useState(4);
  const [saving, setSaving] = useState(false);
  const [durationError, setDurationError] = useState("");

  useVisibleInterval(() => setNow(Date.now()), 15_000);

  useEffect(() => {
    if (!settings) return;
    const nextDefaultUnit = displayUnitForMinutes(settings.mcp_default_duration_minutes);
    const nextMaxUnit = displayUnitForMinutes(settings.mcp_max_duration_minutes);
    setDefaultUnit(nextDefaultUnit);
    setMaxUnit(nextMaxUnit);
    setDefaultRaw(
      displayValueForMinutes(settings.mcp_default_duration_minutes, nextDefaultUnit),
    );
    setMaxRaw(displayValueForMinutes(settings.mcp_max_duration_minutes, nextMaxUnit));
    setConcurrency(settings.mcp_max_concurrency);
    setDurationError("");
  }, [settings]);

  const nodes = useMemo(() => nodeLookup(nodeDetail), [nodeDetail]);

  const copyEndpoint = async () => {
    if (!settings?.endpoint) return;
    await navigator.clipboard?.writeText(settings.endpoint);
    toast.success(t("copy_success"));
  };

  const save = async () => {
    if (!settings) return;
    const parsedDefault = parseDurationInput(
      defaultRaw,
      defaultUnit,
      MCP_HARD_MAX_MINUTES,
    );
    const parsedMax = parseDurationInput(maxRaw, maxUnit, MCP_HARD_MAX_MINUTES);
    if (parsedDefault.minutes == null || parsedMax.minutes == null) {
      setDurationError(t("mcp.duration_invalid"));
      toast.error(t("mcp.duration_invalid"));
      return;
    }
    if (parsedDefault.minutes > parsedMax.minutes) {
      const message = t("mcp.default_exceeds_max");
      setDurationError(message);
      toast.error(message);
      return;
    }
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
      toast.error(t("mcp.concurrency_invalid"));
      return;
    }
    setDurationError("");
    setSaving(true);
    try {
      await mcpFetch("/api/admin/mcp/settings", {
        method: "POST",
        body: JSON.stringify({
          mcp_default_duration_minutes: parsedDefault.minutes,
          mcp_max_duration_minutes: parsedMax.minutes,
          mcp_max_concurrency: concurrency,
        }),
      });
      onSettingsSaved({
        mcp_default_duration_minutes: parsedDefault.minutes,
        mcp_max_duration_minutes: parsedMax.minutes,
        mcp_max_concurrency: concurrency,
      });
      toast.success(t("settings.settings_saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2.5}>
      <Typography sx={{ fontSize: 15, fontWeight: 600, mb: -1 }}>
        {t("mcp.connect_ai")}
      </Typography>
      <Box sx={CARD_SX}>
        <Box sx={{ minWidth: 0, pr: 1.5 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: "24px" }}>
              {t("mcp.endpoint")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("mcp.endpoint_subtitle")}
            </Typography>
          </Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.25}
          sx={{ mt: 2, alignItems: { xs: "stretch", sm: "flex-start" } }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={FIELD_SX}>
              <Box sx={{ color: "text.secondary", display: "flex" }}>
                <LinkIcon size={17} />
              </Box>
              <Typography
                component="code"
                sx={{
                  fontFamily: "Consolas, SFMono-Regular, monospace",
                  fontSize: 14,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {settings?.endpoint || "—"}
              </Typography>
            </Box>
            <Typography sx={{ mt: 1.5, fontSize: 12, color: "text.secondary", lineHeight: "20px" }}>
              {t("mcp.endpoint_guide")}
            </Typography>
          </Box>
          <Stack
            spacing={1.5}
            sx={{ alignItems: "stretch", flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
          >
            <Button
              variant="outlined"
              startIcon={<Copy size={16} />}
              onClick={() => void copyEndpoint()}
              disabled={!settings?.endpoint}
              sx={{
                ...ADMIN_LIST_ACTION_SX,
                height: 40,
                bgcolor: "background.paper",
                width: "100%",
              }}
            >
              {t("mcp.copy_endpoint")}
            </Button>
            <Button
              href={MCP_USER_MANUAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              endIcon={<ChevronRight size={16} />}
              sx={{
                textTransform: "none",
                fontWeight: 500,
                fontSize: 12,
                color: "error.main",
                px: 0,
                minWidth: 0,
                minHeight: 20,
                py: 0,
                width: "100%",
                justifyContent: "center",
                "&:hover": { color: "error.dark", bgcolor: "transparent" },
              }}
            >
              {t("mcp.view_guide")}
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Typography sx={{ fontSize: 15, fontWeight: 600, mb: -1 }}>
        {t("mcp.auth_settings")}
      </Typography>
      <Box sx={CARD_SX}>
          <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: "24px" }}>
            {t("mcp.full_mode")}
          </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t("mcp.full_mode_blurb")}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: "wrap" }}>
          <CapabilityBadge icon={<Terminal size={14} />} label={t("mcp.cap_terminal")} />
          <CapabilityBadge icon={<Code size={14} />} label={t("mcp.cap_exec")} />
          <CapabilityBadge icon={<Folder size={14} />} label={t("mcp.cap_files")} />
        </Stack>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr" },
            gap: { xs: 2, md: 2.5 },
            mt: 2.25,
            "& > :last-child": { gridColumn: { xs: "1 / -1", md: "auto" } },
          }}
        >
          <DurationField
            label={t("mcp.default_duration")}
            raw={defaultRaw}
            unit={defaultUnit}
            onRawChange={setDefaultRaw}
            onUnitChange={setDefaultUnit}
          />
          <DurationField
            label={t("mcp.max_duration")}
            raw={maxRaw}
            unit={maxUnit}
            onRawChange={setMaxRaw}
            onUnitChange={setMaxUnit}
          />
          <Box>
            <Typography sx={{ display: "block", fontSize: 13, mb: 1 }}>
              {t("mcp.max_concurrency")}
            </Typography>
            <Select
              size="small"
              fullWidth
              value={concurrency}
              onChange={(event) => setConcurrency(Number(event.target.value))}
              sx={{
                height: 40,
                borderRadius: "8px",
                "& .MuiSelect-select": {
                  display: "flex",
                  alignItems: "center",
                  height: 40,
                  py: 0,
                  boxSizing: "border-box",
                },
              }}
            >
              {Array.from({ length: 16 }, (_, index) => index + 1).map((value) => (
                <MenuItem key={value} value={value}>
                  {t("mcp.concurrency_ops", { count: value })}
                </MenuItem>
              ))}
            </Select>
          </Box>
        </Box>
        <Typography sx={{ mt: 1.25, fontSize: 12, color: "text.secondary", lineHeight: "20px" }}>
          {t("mcp.duration_hint_settings")}
        </Typography>
        {durationError ? (
          <Typography sx={{ mt: 0.5, fontSize: 12, color: "error.main" }}>
            {durationError}
          </Typography>
        ) : null}
        <Box
          sx={{
            display: "flex",
            width: "100%",
            mt: 2,
            gap: 1.5,
            alignItems: { xs: "stretch", sm: "center" },
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <Typography sx={{ flex: 1, fontSize: 12, color: "text.disabled" }}>
            {t("mcp.permission_foot")}
          </Typography>
          <Button
            variant="contained"
            onClick={() => void save()}
            disabled={!settings || saving}
            sx={{
              ...ADMIN_LIST_ACTION_SX,
              ml: { sm: "auto" },
              alignSelf: { xs: "flex-end", sm: "auto" },
              flexShrink: 0,
            }}
          >
            {t("mcp.save_settings")}
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5,
        }}
      >
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
          {t("mcp.current_authorizations")}
        </Typography>
        <Button
          onClick={onOpenLeases}
          endIcon={<ChevronRight size={16} />}
          sx={{
            textTransform: "none",
            fontWeight: 500,
            fontSize: 13,
            color: "primary.main",
            px: 0.5,
            minWidth: 0,
            flexShrink: 0,
          }}
        >
          {t("mcp.view_all")}
        </Button>
      </Box>
      <Box sx={{ ...CARD_SX, py: 0.25 }}>
        {leases.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2.5 }}>
            {t("mcp.no_active")}
          </Typography>
        ) : (
          leases.slice(0, 3).map((lease, index) => (
            <CompactLeaseRow
              key={lease.id}
              lease={lease}
              nodes={nodes}
              now={now}
              divider={index < Math.min(leases.length, 3) - 1}
              onRevoked={onReloadLeases}
            />
          ))
        )}
      </Box>
    </Stack>
  );
}

function CapabilityBadge({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <Badge color="gray">
      {icon}
      {label}
    </Badge>
  );
}

function NodeUnavailableBadge({
  reason,
  label,
}: {
  reason: "remote_off" | "agent_old";
  label: string;
}) {
  const agent = reason === "agent_old";
  return (
    <Chip
      size="small"
      label={label}
      sx={(theme) => {
        const dark = theme.palette.mode === "dark";
        return {
          mt: 0,
          ml: 0,
          height: "auto",
          maxWidth: "none",
          flexShrink: 0,
          borderRadius: "6px",
          fontWeight: 600,
          bgcolor: agent
            ? dark
              ? "rgba(255, 171, 0, 0.20)"
              : "rgba(255, 171, 0, 0.16)"
            : dark
              ? "rgba(145, 158, 171, 0.22)"
              : "rgba(145, 158, 171, 0.16)",
          color: agent
            ? dark
              ? "#ffd666"
              : "#b76e00"
            : dark
              ? "#d7dde3"
              : "#454f5b",
          "& .MuiChip-label": {
            display: "block",
            whiteSpace: "nowrap",
            px: 0.875,
            py: 0.25,
            lineHeight: "16px",
            fontSize: 11,
          },
        };
      }}
    />
  );
}

function FieldBox({
  icon,
  value,
  onChange,
  placeholder,
  type,
  name,
  autoComplete,
  inputMode,
  maxLength,
  ariaLabel,
  multiline,
  readOnlyUntilFocus,
}: {
  icon?: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  name?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "search";
  maxLength?: number;
  ariaLabel?: string;
  multiline?: boolean;
  readOnlyUntilFocus?: boolean;
}) {
  const ignorePasswordManager = autoComplete === "off";
  const [readOnly, setReadOnly] = useState(Boolean(readOnlyUntilFocus));
  const unlock = () => {
    if (readOnlyUntilFocus) setReadOnly(false);
  };
  return (
    <Box sx={FIELD_SX}>
      {icon ? <Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box> : null}
      <InputBase
        name={name}
        value={value}
        placeholder={placeholder}
        type={type}
        autoComplete={autoComplete}
        multiline={multiline}
        rows={multiline ? 1 : undefined}
        readOnly={readOnly}
        onFocus={unlock}
        onPointerDown={unlock}
        inputProps={{
          inputMode,
          maxLength,
          "aria-label": ariaLabel,
          autoCorrect: ignorePasswordManager ? "off" : undefined,
          autoCapitalize: ignorePasswordManager ? "none" : undefined,
          spellCheck: ignorePasswordManager ? false : undefined,
          "data-1p-ignore": ignorePasswordManager || undefined,
          "data-lpignore": ignorePasswordManager ? "true" : undefined,
          "data-bwignore": ignorePasswordManager || undefined,
          "data-form-type": ignorePasswordManager ? "other" : undefined,
        }}
        onChange={(event) => onChange(event.target.value)}
        sx={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          height: 40,
          "& input, & textarea": {
            p: 0,
            height: 40,
            lineHeight: "40px",
            resize: "none !important",
            overflow: "hidden",
          },
          "& input::placeholder, & textarea::placeholder": { color: "text.disabled", opacity: 1 },
        }}
      />
    </Box>
  );
}

function DurationField({
  label,
  raw,
  unit,
  onRawChange,
  onUnitChange,
}: {
  label?: string;
  raw: string;
  unit: DurationUnit;
  onRawChange: (value: string) => void;
  onUnitChange: (unit: DurationUnit) => void;
}) {
  const { t } = useTranslation();
  const applyUnit = (nextUnit: DurationUnit) => {
    const parsed = parseDurationInput(raw, unit, MCP_HARD_MAX_MINUTES);
    if (parsed.minutes == null) {
      onUnitChange(nextUnit);
      return;
    }
    if (nextUnit === "hours" && parsed.minutes % 60 !== 0) {
      toast.error(t("mcp.keep_minutes_unit"));
      return;
    }
    onRawChange(displayValueForMinutes(parsed.minutes, nextUnit));
    onUnitChange(nextUnit);
  };

  return (
    <Box>
      {label ? (
        <Typography sx={{ display: "block", fontSize: 13, mb: 1 }}>{label}</Typography>
      ) : null}
      <Box sx={DURATION_INPUT_SX}>
        <InputBase
          value={raw}
          inputProps={{
            inputMode: "numeric",
            autoComplete: "off",
            "aria-label": label || t("mcp.custom"),
          }}
          onChange={(event) => onRawChange(event.target.value)}
          sx={{
            ...DURATION_VALUE_SX,
            px: 0,
            "& input": { px: 1.5, height: 40, py: 0, fontVariantNumeric: "tabular-nums" },
          }}
        />
        <Select
          variant="standard"
          disableUnderline
          value={unit}
          inputProps={{ "aria-label": `${label || t("mcp.custom")}` }}
          onChange={(event) => applyUnit(event.target.value as DurationUnit)}
          sx={{
            height: 40,
            width: { xs: 64, sm: 76 },
            flexShrink: 0,
            bgcolor: (theme) =>
              theme.palette.mode === "dark" ? "action.hover" : "#F4F6F8",
            "& .MuiSelect-select": {
              py: 0,
              pl: 1,
              pr: 2.75,
              height: 40,
              display: "flex",
              alignItems: "center",
              boxSizing: "border-box",
              borderLeft: "1px solid",
              borderColor: "divider",
              fontSize: 14,
            },
            "& .MuiSelect-icon": { right: 4 },
          }}
        >
          <MenuItem value="minutes">{t("mcp.unit_minutes")}</MenuItem>
          <MenuItem value="hours">{t("mcp.unit_hours")}</MenuItem>
        </Select>
      </Box>
    </Box>
  );
}

function CompactLeaseRow({
  lease,
  nodes,
  now,
  divider,
  onRevoked,
}: {
  lease: MCPLease;
  nodes: Map<string, { uuid: string; name?: string; ipv4?: string; ipv6?: string }>;
  now: number;
  divider: boolean;
  onRevoked: () => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr auto", md: "2fr 1.5fr 1fr auto" },
        gap: { xs: 1, md: 2.5 },
        alignItems: "center",
        py: 1.75,
        borderBottom: divider ? "1px solid" : 0,
        borderColor: "divider",
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: "center" }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            display: "grid",
            placeItems: "center",
            borderRadius: "8px",
            bgcolor: "action.hover",
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {(lease.client_name || "AI").slice(0, 1).toUpperCase()}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center" }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: "24px" }} noWrap>
              {lease.client_name || t("mcp.unknown_client")}
            </Typography>
            {lease.long_term ? <Badge color="blue">{t("mcp.long_term_authorization")}</Badge> : null}
          </Stack>
          {lease.note ? (
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {lease.note}
            </Typography>
          ) : null}
        </Box>
      </Stack>
      <Box
        sx={{
          minWidth: 0,
          overflow: "hidden",
          pl: { xs: "44px", md: 0 },
          gridColumn: { xs: "1", md: "auto" },
        }}
      >
        <TruncatedText value={leaseNodeNames(lease, nodes)} />
      </Box>
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ alignItems: "center", color: "text.secondary", fontSize: 12, justifySelf: { xs: "end", md: "start" } }}
      >
        <Clock size={16} />
        <Box component="span" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {lease.long_term
            ? leaseRemainingText(lease, now, t)
            : t("mcp.remaining", { time: leaseRemainingText(lease, now, t) })}
        </Box>
      </Stack>
      {lease.status === "active" ? (
      <Button
        color="error"
        onClick={async () => {
          await mcpFetch(`/api/admin/mcp/leases/${lease.id}/revoke`, { method: "POST" });
          toast.success(t("mcp.revoked"));
          await onRevoked();
        }}
        sx={{
          textTransform: "none",
          fontWeight: 600,
          justifySelf: "end",
          minWidth: 0,
          px: 0.5,
        }}
      >
        {t("mcp.revoke_authorization")}
      </Button>
      ) : (
        <Badge color={leaseStatusColor(lease.status, 0)}>
          {leaseStatusLabel(lease.status, 0, t)}
        </Badge>
      )}
    </Box>
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;
type NodeMap = Map<string, { uuid: string; name?: string; ipv4?: string; ipv6?: string }>;

function durationText(minutes: number, t: Translate) {
  const formatted = formatDurationLabel(Math.max(0, minutes));
  if (formatted.hours && formatted.minutes) {
    return t("mcp.hours_minutes", { hours: formatted.hours, minutes: formatted.minutes });
  }
  if (formatted.hours) return t("mcp.hours_n", { count: formatted.hours });
  return t("mcp.minutes_n", { count: formatted.minutes });
}

function formatLeaseExpiry(iso: string) {
  const clock = formatClock(iso);
  const date = new Date(iso);
  if (clock === "—" || !Number.isFinite(date.getTime())) return "—";
  return `${date.getFullYear()}-${clock}`;
}

function formatClock(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const time = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${month}-${day} ${time}`;
}

function operationIsRunning(state: string) {
  return operationResultKey(state) === "running";
}

function leaseRunningCount(lease: MCPLease, operations: readonly MCPOperation[]) {
  let fromOps = 0;
  for (const op of operations) {
    if (op.lease_id === lease.id && operationIsRunning(op.state)) fromOps += 1;
  }
  return Math.max(lease.running || 0, fromOps);
}

function leaseStatusLabel(status: string, running: number, t: Translate) {
  if (running > 0) return t("mcp.running");
  if (status === "active") return t("mcp.waiting");
  if (status === "revoked") return t("mcp.status_revoked");
  if (status === "expired") return t("mcp.status_expired");
  if (status === "denied") return t("mcp.status_denied");
  return t(`mcp.status_${status}`, { defaultValue: status });
}

function leaseStatusColor(status: string, running: number) {
  if (running > 0 || status === "active") return "green";
  if (status === "revoked" || status === "expired" || status === "denied") return "red";
  return "gray";
}

function leaseRemainingText(lease: MCPLease, now: number, t: Translate) {
  if (lease.status !== "active") return "—";
  if (lease.long_term) return t("mcp.long_term_authorization");
  return formatRemaining(lease.expires_at, now);
}

function leaseIsPurgeable(lease: MCPLease) {
  return lease.status === "denied" || lease.status === "expired" || lease.status === "revoked";
}

function operationResultColor(kind: string) {
  if (kind === "success") return "green";
  if (kind === "failed" || kind === "denied") return "red";
  return "blue";
}

function leaseFilterKind(lease: MCPLease, running: number) {
  if (running > 0) return "running";
  if (lease.status === "active") return "waiting";
  return lease.status;
}

function nodeNames(uuids: string[], nodes: NodeMap) {
  return uuids.map((uuid) => nodeDisplayName(nodes.get(uuid))).filter(Boolean).join("、");
}

function leaseNodeNames(lease: MCPLease, nodes: NodeMap) {
  return lease.all_nodes ? String(i18n.t("mcp.all_servers")) : nodeNames(lease.target_uuids, nodes);
}

function clientDisplayName(lease: MCPLease | undefined, t: Translate) {
  return lease?.client_name || t("mcp.unknown_client");
}

function clientPurposeLine(lease: MCPLease | undefined, t: Translate) {
  const name = clientDisplayName(lease, t);
  return lease?.note ? `${name} · ${lease.note}` : name;
}

function ClientPurposeText({
  lease,
  fallback,
}: {
  lease?: MCPLease;
  fallback: string;
}) {
  const name = lease?.client_name || fallback;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography noWrap title={name} sx={{ fontWeight: 600 }}>
        {name}
      </Typography>
      {lease?.note ? (
        <Typography variant="caption" color="text.secondary" noWrap title={lease.note} sx={{ display: "block" }}>
          {lease.note}
        </Typography>
      ) : null}
    </Box>
  );
}

function TruncatedText({
  value,
  fontSize,
  fontWeight,
  color,
}: {
  value: string;
  fontSize?: number | string;
  fontWeight?: number | string;
  color?: string;
}) {
  const text = value || "—";
  return (
    <Typography
      noWrap
      color={color}
      title={text === "—" ? undefined : text}
      sx={{
        display: "block",
        minWidth: 0,
        maxWidth: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontSize,
        fontWeight,
      }}
    >
      {text}
    </Typography>
  );
}

function operationKind(toolName: string) {
  if (toolName === "exec") return "exec";
  if (toolName.startsWith("file_")) return "file";
  if (toolName.startsWith("terminal_")) return "terminal";
  if (toolName === "grant") return "grant";
  return "other";
}

function operationActionLabel(op: MCPOperation, t: Translate) {
  const kind = operationKind(op.tool_name);
  const detail = previewLine(op.preview);
  if (kind === "exec") {
    return detail
      ? t("mcp.op_label", { action: t("mcp.op_exec"), detail })
      : t("mcp.op_exec");
  }
  if (kind === "file") {
    const action = op.tool_name.includes("write") ? t("mcp.op_file_write") : t("mcp.op_file_read");
    return detail ? t("mcp.op_label", { action, detail }) : action;
  }
  if (kind === "terminal") return t("mcp.op_terminal");
  if (kind === "grant") {
    return t("mcp.op_label", { action: t("mcp.op_grant"), detail: t("mcp.full_mode_short") });
  }
  return op.tool_name;
}

function operationResultKind(state: string): "success" | "failed" | "running" | "authorized" | "denied" {
  return operationResultKey(state);
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function MCPLeasesTab({
  leases,
  operations,
  onReload,
  onReauthorize,
  onOpenOperations,
  onEdit,
}: {
  leases: MCPLease[];
  operations: MCPOperation[];
  onReload: () => Promise<void>;
  onReauthorize: (uuids: string[], allNodes?: boolean) => void;
  onOpenOperations: () => void;
  onEdit: (lease: MCPLease) => void;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { nodeDetail } = useNodeDetails();
  const [now, setNow] = useState(() => Date.now());
  const [selectedID, setSelectedID] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const nodes = useMemo(() => nodeLookup(nodeDetail), [nodeDetail]);

  useEffect(() => {
    if (selectedID && leases.some((lease) => lease.id === selectedID)) return;
    setSelectedID(leases[0]?.id || "");
  }, [leases, selectedID]);

  useVisibleInterval(() => setNow(Date.now()), 15_000);

  const active = leases.filter((lease) => lease.status === "active");
  const runningByLease = useMemo(() => {
    const map = new Map<string, number>();
    for (const lease of leases) {
      map.set(lease.id, leaseRunningCount(lease, operations));
    }
    return map;
  }, [leases, operations]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leases.filter((lease) => {
      const running = runningByLease.get(lease.id) || 0;
      if (status !== "all" && leaseFilterKind(lease, running) !== status) return false;
      if (!needle) return true;
      const hay = [
        lease.client_name,
        lease.note,
        lease.owner_username,
        lease.all_nodes ? t("mcp.all_servers") : "",
        ...lease.target_uuids.map((uuid) => nodeDisplayName(nodes.get(uuid))),
        ...lease.target_uuids.map((uuid) => nodeDisplayIP(nodes.get(uuid))),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [leases, nodes, query, runningByLease, status, t]);
  const { page, setPage, pageItems, pageSize, setPageSize } = useAdminPagination(
    filtered,
    MCP_LEASES_PAGE_SIZE,
  );
  const selected = leases.find((lease) => lease.id === selectedID) || null;
  const selectedOps = operations
    .filter((op) => op.lease_id === selected?.id && op.tool_name !== "grant")
    .slice(0, 3);
  const previewOp = selectedOps.find((op) => op.tool_name === "exec" && op.preview);

  useEffect(() => {
    if (!pageItems.length) return;
    if (pageItems.some((lease) => lease.id === selectedID)) return;
    setSelectedID(pageItems[0].id);
  }, [pageItems, selectedID]);

  const revoke = async (leaseID: string) => {
    await mcpFetch(`/api/admin/mcp/leases/${leaseID}/revoke`, { method: "POST" });
    toast.success(t("mcp.revoked"));
    await onReload();
  };

  const revokeAll = async () => {
    setRevokingAll(true);
    try {
      await mcpFetch("/api/admin/mcp/leases/revoke-all", { method: "POST" });
      toast.success(t("mcp.revoked"));
      setRevokeAllOpen(false);
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={isMobile ? "column" : "row"}
        sx={{ justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center", gap: 2 }}
      >
        <Box sx={{ minWidth: 0, flex: 1, pr: isMobile ? 0 : 1 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{t("mcp.tabs.leases")}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("mcp.leases_description", { days: MCP_HISTORY_DAYS })}
          </Typography>
        </Box>
        {active.length ? (
        <Button
          color="error"
          variant="outlined"
          onClick={() => setRevokeAllOpen(true)}
          disabled={revokingAll}
          sx={{
            ...ADMIN_LIST_ACTION_SX,
            bgcolor: "background.paper",
            alignSelf: isMobile ? "stretch" : "auto",
            flexShrink: 0,
            width: isMobile ? "100%" : "auto",
          }}
        >
          {t("mcp.revoke_all")}
        </Button>
        ) : null}
      </Stack>
      <Dialog
        open={revokeAllOpen}
        onClose={() => {
          if (!revokingAll) setRevokeAllOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t("mcp.revoke_all_title")}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, lineHeight: 1.6, color: "text.secondary" }}>
            {t("mcp.revoke_all_confirm")}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button disabled={revokingAll} onClick={() => setRevokeAllOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button color="error" variant="contained" disabled={revokingAll} onClick={() => void revokeAll()}>
            {t("common.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
      <AdminListShell>
        <AdminListFiltersBar>
          <Stack
            direction="row"
            spacing={1.5}
            useFlexGap
            sx={{ flexWrap: { xs: "wrap", md: "nowrap" }, alignItems: "center" }}
          >
            <AdminListSelect
              label={t("mcp.col_status")}
              value={status === "all" ? "" : status}
              onChange={(value) => {
                setStatus(value || "all");
                setPage(1);
              }}
            >
              <MenuItem value="">{t("mcp.all_status")}</MenuItem>
              <MenuItem value="running">{t("mcp.running")}</MenuItem>
              <MenuItem value="waiting">{t("mcp.waiting")}</MenuItem>
              <MenuItem value="revoked">{t("mcp.status_revoked")}</MenuItem>
              <MenuItem value="expired">{t("mcp.status_expired")}</MenuItem>
              <MenuItem value="denied">{t("mcp.status_denied")}</MenuItem>
            </AdminListSelect>
            <AdminListSearch
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder={t("mcp.search_leases")}
            />
          </Stack>
        </AdminListFiltersBar>
        {filtered.length === 0 ? (
          <Box className="km-admin-list-empty">{t("mcp.no_leases")}</Box>
        ) : (
          <>
            {isMobile ? (
              <AdminMobileCardStack>
                {pageItems.map((lease) => {
                  const running = runningByLease.get(lease.id) || 0;
                  return (
                  <AdminMobileListCard
                    key={lease.id}
                    onClick={() => setSelectedID(lease.id)}
                    sx={lease.id === selectedID ? { borderColor: "primary.main" } : undefined}
                    title={
                      <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: "center" }}>
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            display: "grid",
                            placeItems: "center",
                            borderRadius: "8px",
                            bgcolor: "background.paper",
                            fontWeight: 700,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {(lease.client_name || "AI").slice(0, 1).toUpperCase()}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center" }}>
                            <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: "24px" }} noWrap>
                              {lease.client_name || t("mcp.unknown_client")}
                            </Typography>
                            {lease.long_term ? <Badge color="blue">{t("mcp.long_term_authorization")}</Badge> : null}
                          </Stack>
                          {lease.note ? (
                            <Typography variant="caption" color="text.secondary" noWrap>
                              {lease.note}
                            </Typography>
                          ) : null}
                        </Box>
                      </Stack>
                    }
                    cells={[
                      [t("mcp.col_servers"), leaseNodeNames(lease, nodes)],
                      [t("mcp.col_mode"), <Badge key="mode" color="blue">{t("mcp.full_mode_short")}</Badge>],
                      [t("mcp.col_remaining"), leaseRemainingText(lease, now, t)],
                      [
                        t("mcp.col_status"),
                        <Badge key="status" color={leaseStatusColor(lease.status, running)}>
                          {leaseStatusLabel(lease.status, running, t)}
                        </Badge>,
                      ],
                    ]}
                    actions={
                      lease.status === "active" ? (
                        <Button
                          color="error"
                          onClick={async (event) => {
                            event.stopPropagation();
                            await revoke(lease.id);
                          }}
                          sx={{ textTransform: "none", fontWeight: 600 }}
                        >
                          {t("mcp.revoke")}
                        </Button>
                      ) : null
                    }
                  />
                  );
                })}
              </AdminMobileCardStack>
            ) : (
            <div className="admin-responsive-table-wrap overflow-x-auto">
              <Table container={false} className="admin-responsive-table w-full min-w-[1080px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[22%]">{t("mcp.col_client")}</TableHead>
                    <TableHead className="w-[36%]">{t("mcp.col_servers")}</TableHead>
                    <TableHead className="w-[12%]">{t("mcp.col_mode")}</TableHead>
                    <TableHead className="w-[11%]">{t("mcp.col_remaining")}</TableHead>
                    <TableHead className="w-[11%]">{t("mcp.col_status")}</TableHead>
                    <TableHead className="w-[8%]">{t("mcp.col_action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((lease) => {
                    const running = runningByLease.get(lease.id) || 0;
                    return (
                      <TableRow
                        key={lease.id}
                        data-state={lease.id === selectedID ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => setSelectedID(lease.id)}
                      >
                        <TableCell data-label={t("mcp.col_client")}>
                          <Stack direction="row" spacing={1.25} sx={{ minWidth: 0, alignItems: "center" }}>
                            <Box
                              sx={{
                                width: 34,
                                height: 34,
                                display: "grid",
                                placeItems: "center",
                                borderRadius: "8px",
                                bgcolor: "action.hover",
                                fontWeight: 700,
                                fontSize: 13,
                                flexShrink: 0,
                              }}
                            >
                              {(lease.client_name || "AI").slice(0, 1).toUpperCase()}
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, alignItems: "center" }}>
                                <Typography noWrap sx={{ fontWeight: 600 }}>
                                  {lease.client_name || t("mcp.unknown_client")}
                                </Typography>
                                {lease.long_term ? <Badge color="blue">{t("mcp.long_term_authorization")}</Badge> : null}
                              </Stack>
                              {lease.note ? (
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  {lease.note}
                                </Typography>
                              ) : null}
                            </Box>
                          </Stack>
                        </TableCell>
                        <TableCell data-label={t("mcp.col_servers")} className="overflow-hidden">
                          <TruncatedText value={leaseNodeNames(lease, nodes)} />
                        </TableCell>
                        <TableCell data-label={t("mcp.col_mode")}>
                          <Badge color="blue">{t("mcp.full_mode_short")}</Badge>
                        </TableCell>
                        <TableCell data-label={t("mcp.col_remaining")}>
                          <Typography sx={{ fontVariantNumeric: "tabular-nums" }}>
                            {leaseRemainingText(lease, now, t)}
                          </Typography>
                        </TableCell>
                        <TableCell data-label={t("mcp.col_status")}>
                          <Badge color={leaseStatusColor(lease.status, running)}>
                            {running > 0 ? (
                              <Box
                                component="span"
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  bgcolor: "currentColor",
                                  display: "inline-block",
                                }}
                              />
                            ) : null}
                            {leaseStatusLabel(lease.status, running, t)}
                          </Badge>
                        </TableCell>
                        <TableCell data-label={t("mcp.col_action")}>
                          {lease.status === "active" ? (
                            <Button
                              color="error"
                              onClick={async (event) => {
                                event.stopPropagation();
                                await revoke(lease.id);
                              }}
                              sx={{
                                justifyContent: "flex-start",
                                minWidth: 0,
                                px: 0.5,
                                textTransform: "none",
                                fontWeight: 600,
                              }}
                            >
                              {t("mcp.revoke")}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            )}
            <AdminPagination
              page={page}
              total={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              showSummary={false}
            />
          </>
        )}
      </AdminListShell>

      {selected ? (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(0,1.15fr) minmax(0,1fr)" },
            gap: 2.5,
            alignItems: "stretch",
          }}
        >
          <Box sx={{ ...CARD_SX, display: "flex", flexDirection: "column", height: "100%" }}>
            <Stack
              direction="row"
              sx={{ width: "100%", justifyContent: "space-between", alignItems: "center", gap: 1 }}
            >
              <Typography sx={{ fontSize: 15, fontWeight: 600, minWidth: 0, pr: 1 }}>
                {t("mcp.lease_detail", {
                  name: selected.client_name || t("mcp.unknown_client"),
                })}
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ ml: "auto", flexShrink: 0 }}>
                {selected.long_term ? <Badge color="blue">{t("mcp.long_term_authorization")}</Badge> : null}
                <Badge color="blue">{t("mcp.full_mode_short")}</Badge>
              </Stack>
            </Stack>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
                mt: 2.25,
              }}
            >
              <LeaseDetailItem label={t("mcp.granted_by")} value={selected.owner_username || "—"} />
              <LeaseDetailItem label={t("mcp.granted_at")} value={formatClock(selected.created_at)} />
              <LeaseDetailItem label={t("mcp.expires_label")} value={selected.long_term ? formatLeaseExpiry(selected.expires_at) : formatClock(selected.expires_at)} />
              <LeaseDetailItem
                label={t("mcp.current_ops")}
                value={t("mcp.concurrency_running", {
                  running: runningByLease.get(selected.id) || 0,
                  max: selected.max_concurrency,
                })}
              />
              <LeaseDetailItem
                label={t("mcp.servers_label")}
                value={leaseNodeNames(selected, nodes) || "—"}
              />
              <LeaseDetailItem
                label={t("mcp.access_window")}
                value={selected.long_term
                  ? t("mcp.long_term_authorization")
                  : durationText(
                    Math.round((Date.parse(selected.expires_at) - Date.parse(selected.created_at)) / 60_000),
                    t,
                  )}
              />
            </Box>
            <Typography sx={{ mt: "auto", pt: 2, fontSize: 12, color: "text.secondary", lineHeight: "20px" }}>
              {t("mcp.revoke_hint")}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: "wrap" }}>
              {selected.status === "active" ? (
                <Button
                  variant="contained"
                  onClick={() => onEdit(selected)}
                  sx={ADMIN_LIST_ACTION_SX}
                >
                  {t("mcp.edit_authorization")}
                </Button>
              ) : null}
              <Button
                variant="outlined"
                onClick={() => onReauthorize(selected.target_uuids, selected.all_nodes)}
                sx={ADMIN_LIST_ACTION_SX}
              >
                {t("mcp.reauthorize")}
              </Button>
              {selected.status === "active" ? (
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => void revoke(selected.id)}
                  sx={ADMIN_LIST_ACTION_SX}
                >
                  {t("mcp.revoke_authorization")}
                </Button>
              ) : null}
            </Stack>
          </Box>
          <Box sx={{ ...CARD_SX, display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            <Stack
              direction="row"
              sx={{ width: "100%", justifyContent: "space-between", alignItems: "center" }}
            >
              <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{t("mcp.recent_ops")}</Typography>
              <Button
                onClick={onOpenOperations}
                endIcon={<ChevronRight size={16} />}
                sx={{
                  textTransform: "none",
                  fontWeight: 500,
                  fontSize: 13,
                  color: "primary.main",
                  ml: "auto",
                  px: 0,
                  minWidth: 0,
                  flexShrink: 0,
                }}
              >
                {t("mcp.all_records")}
              </Button>
            </Stack>
            <Stack spacing={1.5} sx={{ mt: 2 }}>
              {selectedOps.length ? (
                selectedOps.map((op) => {
                  const kind = operationKind(op.tool_name);
                  const result = operationResultKind(op.state);
                  const Icon = kind === "file" ? Folder : kind === "grant" ? Shield : kind === "terminal" ? Terminal : Code;
                  return (
                    <Stack key={op.id} direction="row" spacing={1.5} sx={{ minWidth: 0, alignItems: "flex-start", pb: selectedOps[selectedOps.length - 1] === op ? 0 : 2.25 }}>
                      <Box
                        sx={{
                          height: 28,
                          width: 28,
                          bgcolor: "action.hover",
                          borderRadius: "50%",
                          display: "grid",
                          placeItems: "center",
                          color: "text.secondary",
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={15} />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: "1 1 0" }}>
                        <Stack direction="row" spacing={1} sx={{ minWidth: 0, width: "100%", alignItems: "center" }}>
                          <Box sx={{ minWidth: 0, flex: "1 1 0" }}>
                            <TruncatedText
                              value={operationActionLabel(op, t)}
                              fontSize={13}
                              fontWeight={600}
                            />
                          </Box>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ flexShrink: 0, whiteSpace: "nowrap", lineHeight: "20px" }}
                          >
                            {formatClock(op.created_at)}
                          </Typography>
                        </Stack>
                        <Stack
                          direction="row"
                          spacing={1}
                          sx={{ mt: 0.25, minWidth: 0, alignItems: "center" }}
                        >
                          <Badge color={operationResultColor(result)}>{t(`mcp.result_${result}`)}</Badge>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <TruncatedText
                              value={`${nodeDisplayName(nodes.get(op.agent_uuid))}${previewLine(op.preview) ? ` · ${previewLine(op.preview)}` : ""}`}
                              fontSize={12}
                              color="text.secondary"
                            />
                          </Box>
                        </Stack>
                      </Box>
                    </Stack>
                  );
                })
              ) : (
                <Typography color="text.secondary" variant="body2">
                  {t("mcp.no_operations")}
                </Typography>
              )}
            </Stack>
            {previewOp?.preview ? (
              <Box
                sx={{
                  mt: 2,
                  flex: 1,
                  minHeight: 181,
                  display: "flex",
                  flexDirection: "column",
                  bgcolor: "#101720",
                  border: "1px solid #344351",
                  borderRadius: "8px",
                  color: "#CFD9E2",
                  overflow: "hidden",
                }}
              >
                <Stack
                  direction="row"
                  sx={{
                    height: 37,
                    flexShrink: 0,
                    px: 1.625,
                    borderBottom: "1px solid #344351",
                    color: "#9FB0C0",
                    fontSize: 12,
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    {nodeDisplayName(nodes.get(previewOp.agent_uuid))} · {t("mcp.op_exec")}
                  </span>
                  <span>
                    {operationIsRunning(previewOp.state)
                      ? t("mcp.result_running")
                      : t("mcp.preview_exit", { code: previewOp.exit_code })}
                  </span>
                </Stack>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    px: 1.875,
                    py: 2.125,
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    fontFamily: "Consolas, SFMono-Regular, monospace",
                    fontSize: 12,
                    lineHeight: 1.85,
                  }}
                >
                  {stripANSI(previewOp.preview)}
                </Box>
              </Box>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Stack>
  );
}

function LeaseDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>{label}</Typography>
      <TruncatedText value={value} />
    </Box>
  );
}

function MCPOperationsTab({
  operations,
  leases,
  onReload,
}: {
  operations: MCPOperation[];
  leases: MCPLease[];
  onReload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { nodeDetail } = useNodeDetails();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const leaseByID = useMemo(() => {
    const map = new Map<string, MCPLease>();
    for (const lease of leases) map.set(lease.id, lease);
    return map;
  }, [leases]);
  const nodes = useMemo(() => nodeLookup(nodeDetail), [nodeDetail]);

  const rows = useMemo(
    () =>
      [...operations]
        .filter((op) => op.tool_name !== "grant")
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [operations],
  );

  const filtered = rows.filter((op) => {
    const kind = operationResultKind(op.state);
    if (status !== "all" && kind !== status) return false;
    const lease = leaseByID.get(op.lease_id);
    const hay = [
      operationActionLabel(op, t),
      op.tool_name,
      op.state,
      nodeDisplayName(nodes.get(op.agent_uuid)),
      nodeDisplayIP(nodes.get(op.agent_uuid)),
      lease?.client_name || "",
      lease?.note || "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  const { page, setPage, pageItems, pageSize, setPageSize } = useAdminPagination(filtered);

  const exportRows = () => {
    const header = [
      t("mcp.col_time"),
      t("mcp.col_client"),
      t("mcp.col_servers"),
      t("mcp.col_action"),
      t("mcp.col_result"),
    ];
    const body = filtered.map((op) => {
      const lease = leaseByID.get(op.lease_id);
      const kind = operationResultKind(op.state);
      return [
        formatClock(op.created_at),
        clientPurposeLine(lease, t),
        nodeDisplayName(nodes.get(op.agent_uuid)),
        operationActionLabel(op, t),
        t(`mcp.result_${kind}`),
      ].map(csvCell).join(",");
    });
    const blob = new Blob([`\ufeff${[header.map(csvCell).join(","), ...body].join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mcp-operations.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const canPurge = leases.some(leaseIsPurgeable);

  const purgeHistory = async () => {
    setPurging(true);
    try {
      await mcpFetch("/api/admin/mcp/history/purge", { method: "POST" });
      toast.success(t("common.deleted_successfully"));
      setPurgeOpen(false);
      await onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPurging(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack
        direction={isMobile ? "column" : "row"}
        spacing={2}
        sx={{ width: "100%", justifyContent: "space-between", alignItems: isMobile ? "stretch" : "center" }}
      >
        <Box sx={{ minWidth: 0, flex: 1, pr: isMobile ? 0 : 1 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
            {t("mcp.tabs.operations")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("mcp.operations_description", { days: MCP_HISTORY_DAYS })}
          </Typography>
        </Box>
        {canPurge || rows.length ? (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            width: isMobile ? "100%" : "auto",
            flexShrink: 0,
            ml: isMobile ? 0 : "auto",
          }}
        >
          {canPurge ? (
          <Button
            color="error"
            variant="outlined"
            startIcon={<Trash2 size={16} />}
            onClick={() => setPurgeOpen(true)}
            disabled={purging}
            sx={{
              ...ADMIN_LIST_ACTION_SX,
              bgcolor: "background.paper",
              flex: isMobile ? 1 : undefined,
              minWidth: 0,
            }}
          >
            {t("mcp.delete_history")}
          </Button>
          ) : null}
          {rows.length ? (
          <Button
            variant="outlined"
            startIcon={<Download size={16} />}
            onClick={exportRows}
            sx={{
              ...ADMIN_LIST_ACTION_SX,
              bgcolor: "background.paper",
              flex: isMobile ? 1 : undefined,
              minWidth: 0,
            }}
          >
            {t("mcp.export_log")}
          </Button>
          ) : null}
        </Stack>
        ) : null}
      </Stack>
      <Dialog
        open={purgeOpen}
        onClose={() => {
          if (!purging) setPurgeOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t("common.confirm_delete")}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, lineHeight: 1.6, color: "text.secondary" }}>
            {t("mcp.delete_history_confirm")}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button disabled={purging} onClick={() => setPurgeOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button color="error" variant="contained" disabled={purging} onClick={() => void purgeHistory()}>
            {t("common.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
      <AdminListShell>
      <AdminListFiltersBar>
        <Stack
          direction="row"
          spacing={1.5}
          useFlexGap
          sx={{ flexWrap: { xs: "wrap", md: "nowrap" }, alignItems: "center" }}
        >
          <AdminListSelect
            label={t("mcp.col_status")}
            value={status === "all" ? "" : status}
            onChange={(value) => {
              setStatus(value || "all");
              setPage(1);
            }}
          >
            <MenuItem value="">{t("mcp.all_status")}</MenuItem>
            <MenuItem value="success">{t("mcp.result_success")}</MenuItem>
            <MenuItem value="running">{t("mcp.result_running")}</MenuItem>
            <MenuItem value="failed">{t("mcp.result_failed")}</MenuItem>
          </AdminListSelect>
          <AdminListSearch
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={t("mcp.search_operations")}
          />
        </Stack>
      </AdminListFiltersBar>
      {filtered.length === 0 ? (
        <Box className="km-admin-list-empty">{t("mcp.no_operations")}</Box>
      ) : (
        <>
          {isMobile ? (
            <AdminMobileCardStack>
              {pageItems.map((op) => {
                const lease = leaseByID.get(op.lease_id);
                const kind = operationResultKind(op.state);
                const extra = lease && lease.target_uuids.length > 1 && op.tool_name === "grant";
                return (
                  <AdminMobileListCard
                    key={op.id}
                    title={
                      <ClientPurposeText
                        lease={lease}
                        fallback={t("mcp.unknown_client")}
                      />
                    }
                    headerExtra={
                      <Badge color={operationResultColor(kind)}>{t(`mcp.result_${kind}`)}</Badge>
                    }
                    cells={[
                      [t("mcp.col_time"), formatClock(op.created_at)],
                      [
                        t("mcp.col_servers"),
                        extra && lease
                          ? leaseNodeNames(lease, nodes)
                          : nodeDisplayName(nodes.get(op.agent_uuid)),
                      ],
                      [
                        t("mcp.col_action"),
                        op.tool_name === "grant" && lease
                          ? t("mcp.op_label", {
                              action: `${lease.owner_username || t("mcp.granted_by")} ${t("mcp.op_grant")}`,
                              detail: t("mcp.full_mode_short"),
                            })
                          : operationActionLabel(op, t),
                      ],
                    ]}
                  />
                );
              })}
            </AdminMobileCardStack>
          ) : (
          <div className="admin-responsive-table-wrap overflow-x-auto">
            <Table container={false} className="admin-responsive-table w-full min-w-[980px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[148px]">{t("mcp.col_time")}</TableHead>
                  <TableHead className="w-[22%]">{t("mcp.col_client")}</TableHead>
                  <TableHead className="w-[180px]">{t("mcp.col_servers")}</TableHead>
                  <TableHead>{t("mcp.col_action")}</TableHead>
                  <TableHead className="w-[104px]">{t("mcp.col_result")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((op) => {
                  const lease = leaseByID.get(op.lease_id);
                  const kind = operationResultKind(op.state);
                  const extra = lease && lease.target_uuids.length > 1 && op.tool_name === "grant";
                  return (
                    <TableRow key={op.id}>
                      <TableCell data-label={t("mcp.col_time")}>
                        <Typography
                          sx={{
                            fontFamily: "Consolas, SFMono-Regular, monospace",
                            color: "text.secondary",
                            fontSize: 14.5,
                          }}
                        >
                          {formatClock(op.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell data-label={t("mcp.col_client")}>
                        <ClientPurposeText
                          lease={lease}
                          fallback={t("mcp.unknown_client")}
                        />
                      </TableCell>
                      <TableCell data-label={t("mcp.col_servers")} className="overflow-hidden">
                        <TruncatedText
                          value={
                            extra
                              ? leaseNodeNames(lease, nodes)
                              : nodeDisplayName(nodes.get(op.agent_uuid))
                          }
                        />
                      </TableCell>
                      <TableCell data-label={t("mcp.col_action")} className="max-w-0 overflow-hidden">
                        <TruncatedText
                          value={
                            op.tool_name === "grant" && lease
                              ? t("mcp.op_label", {
                                  action: `${lease.owner_username || t("mcp.granted_by")} ${t("mcp.op_grant")}`,
                                  detail: t("mcp.full_mode_short"),
                                })
                              : operationActionLabel(op, t)
                          }
                        />
                      </TableCell>
                      <TableCell data-label={t("mcp.col_result")}>
                        <Badge color={operationResultColor(kind)}>{t(`mcp.result_${kind}`)}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          )}
          <AdminPagination
            page={page}
            total={filtered.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            showSummary={false}
          />
        </>
      )}
      </AdminListShell>
    </Stack>
  );
}

function MCPAuthorizedDialog({
  open,
  redirectURI,
  onClose,
}: {
  open: boolean;
  redirectURI: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const callbackURL = redirectURI.trim();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: { width: 600, maxWidth: "calc(100% - 64px)", borderRadius: "12px" },
        },
      }}
    >
      <DialogTitle sx={{ px: 3, pt: 3, pb: 1, fontSize: 20, fontWeight: 700, lineHeight: "28px" }}>
        {t("mcp.authorized_title")}
      </DialogTitle>
      <DialogContent sx={{ px: 3, pb: 1.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              borderRadius: "8px",
              bgcolor: LITE_BLUE_SOFT,
              color: LITE_BLUE,
            }}
          >
            <CheckCircle2 size={20} />
          </Box>
          <Typography sx={{ fontSize: 14, lineHeight: 1.6, color: "text.secondary" }}>
            {t("mcp.authorized_body")}
          </Typography>
        </Stack>
        <Typography sx={{ mt: 1.5, fontSize: 13, lineHeight: 1.6, color: "text.secondary" }}>
          {t("mcp.authorized_ttl")}
        </Typography>
        {callbackURL ? (
          <Box sx={{ mt: 2.25 }}>
            <Typography sx={{ fontSize: 13, mb: 1 }}>{t("mcp.redirect_uri")}</Typography>
            <Box
              sx={{
                p: 2,
                bgcolor: "action.hover",
                borderRadius: "8px",
                fontFamily: "Consolas, SFMono-Regular, monospace",
                fontSize: 13,
                lineHeight: 1.7,
                overflowWrap: "anywhere",
              }}
            >
              {callbackURL}
            </Box>
            <Button
              variant="outlined"
              startIcon={<Copy size={16} />}
              disabled={!callbackURL}
              onClick={async () => {
                await navigator.clipboard?.writeText(callbackURL);
                toast.success(t("copy_success"));
              }}
              sx={{ mt: 1.5, ...ADMIN_LIST_ACTION_SX }}
            >
              {t("mcp.copy_callback")}
            </Button>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: "1px solid", borderColor: "divider" }}>
        <Button variant="contained" onClick={onClose}>
          {t("mcp.authorized_ok")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function MCPAuthorizeDialog({
  open,
  requestID,
  prefillNodes,
  settings,
  onClose,
  onApproved,
  onConnected,
  editLease,
  prefillAllNodes = false,
}: {
  open: boolean;
  requestID: string;
  prefillNodes: string[];
  settings: MCPSettings;
  onClose: () => void;
  onApproved: () => Promise<void>;
  onConnected: (redirectURI: string) => void;
  editLease?: MCPLease;
  prefillAllNodes?: boolean;
}) {
  const { t } = useTranslation();
  const compact = useMediaQuery("(max-width:599.95px)", { noSsr: true });
  const isMobile = useIsMobile();
  const { account } = useAccount();
  const { nodeDetail } = useNodeDetails();
  const { liveData, available } = useAdminNodeLiveData();
  const twoFaEnabled = Boolean(account?.["2fa_enabled"]);
  const [clientName, setClientName] = useState("");
  const [clientID, setClientID] = useState("");
  const [redirectURI, setRedirectURI] = useState("");
  const [pendingRequests, setPendingRequests] = useState<
    { id: string; client_name?: string; client_id?: string; redirect_uri?: string; ready?: boolean }[]
  >([]);
  const [selected, setSelected] = useState<string[]>(prefillNodes);
  const [allNodes, setAllNodes] = useState(editLease?.all_nodes === true || prefillAllNodes);
  const [longTerm, setLongTerm] = useState(false);
  const [changeDuration, setChangeDuration] = useState(false);
  const [preset, setPreset] = useState<number | "custom">(settings.mcp_default_duration_minutes);
  const [customUnit, setCustomUnit] = useState<DurationUnit>("minutes");
  const [customValue, setCustomValue] = useState("90");
  const [note, setNote] = useState(editLease?.note || "");
  const [secret, setSecret] = useState("");
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [denyingID, setDenyingID] = useState("");
  const [missingClient, setMissingClient] = useState(!requestID);
  const [requestReady, setRequestReady] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);

  useEffect(() => {
    setSelected(prefillNodes);
  }, [prefillNodes]);

  useEffect(() => {
    setAllNodes(editLease?.all_nodes === true || prefillAllNodes);
  }, [editLease, prefillAllNodes]);

  useEffect(() => {
    if (!open) {
      setPasskeyAvailable(false);
      return;
    }
    if (editLease) setLongTerm(editLease.long_term === true);
    else setLongTerm(false);
    fetch("/api/admin/account/passkeys")
      .then((response) => response.json())
      .then((body) => {
        const items = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        setPasskeyAvailable(items.length > 0);
      })
      .catch(() => setPasskeyAvailable(false));
  }, [open, editLease]);

  useEffect(() => {
    if (!open || !requestID || editLease) {
      setMissingClient(!requestID);
      setClientName("");
      setClientID("");
      setRedirectURI("");
      setRequestReady(false);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await mcpFetch<{
          client_name: string;
          status: string;
          client_id?: string;
          redirect_uri?: string;
          ready?: boolean;
        }>(`/api/admin/mcp/authorization-requests/${requestID}`);
        if (cancelled) return;
        setClientName(data.client_name || requestID);
        setClientID(data.client_id || "");
        setRedirectURI(data.redirect_uri || "");
        setRequestReady(data.ready !== false);
        setMissingClient(false);
      } catch {
        if (!cancelled) {
          setMissingClient(true);
          setRequestReady(false);
        }
      }
    };
    const stopPolling = startVisibleInterval(() => {
      void tick();
    }, 2000);
    void tick();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [open, requestID, editLease]);

  useEffect(() => {
    if (!open || requestID || editLease) {
      setPendingRequests([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await mcpFetch<{
          requests: { id: string; client_name?: string; client_id?: string; redirect_uri?: string; ready?: boolean }[];
        }>("/api/admin/mcp/authorization-requests");
        if (!cancelled) setPendingRequests(data.requests || []);
      } catch {
        // Keep waiting until an AI client starts OAuth.
      }
    };
    const stopPolling = startVisibleInterval(() => {
      void tick();
    }, 2000);
    void tick();
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [open, requestID, editLease]);

  const onlineSet = useMemo(
    () => new Set(liveData?.data.online ?? []),
    [liveData?.data.online],
  );

  const filtered = useMemo(
    () => filterRemoteNodes(orderRemoteNodes(nodeDetail), query, "all", onlineSet),
    [nodeDetail, query, onlineSet],
  );
  const selectableIds = useMemo(
    () => filtered.filter((node) => nodeSupportsMCP(node)).map((node) => node.uuid),
    [filtered],
  );
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));
  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      const drop = new Set(selectableIds);
      setSelected((current) => current.filter((id) => !drop.has(id)));
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      for (const id of selectableIds) next.add(id);
      return [...next];
    });
  };

  const useLongTerm = longTerm;
  const durationMinutes = useLongTerm
    ? settings.mcp_default_duration_minutes
    : preset === "custom"
      ? parseDurationInput(customValue, customUnit, settings.mcp_max_duration_minutes).minutes
      : preset;
  const durationError = useLongTerm
    ? null
    : preset === "custom"
      ? parseDurationInput(customValue, customUnit, settings.mcp_max_duration_minutes).error
      : durationMinutes != null && durationMinutes > settings.mcp_max_duration_minutes
        ? "range"
        : null;
  const keepExpiry = Boolean(editLease && !changeDuration);
  const canApproveBase = Boolean(
    (editLease || (requestID && !missingClient && requestReady))
    && (allNodes || selected.length)
    && (keepExpiry || (durationMinutes && !durationError))
    && !submitting && !denyingID,
  );
  const canSubmit = Boolean(canApproveBase && secret);

  const denyRequest = async (id: string, closeAfter: boolean) => {
    if (!id || denyingID) return;
    setDenyingID(id);
    try {
      const result = await mcpFetch<{ redirect_uri?: string }>(
        `/api/admin/mcp/authorization-requests/${id}/deny`,
        { method: "POST" },
      );
      deliverOAuthCallback(result.redirect_uri || "");
      toast.success(t("mcp.status_denied"));
      setPendingRequests((current) => current.filter((req) => req.id !== id));
      await onApproved();
      if (closeAfter) onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDenyingID("");
    }
  };

  const approveRequest = async (usePasskey: boolean) => {
    if (!requestID && !editLease) return;
    setSubmitting(true);
    try {
      let ceremony_id: string | undefined;
      let credential: unknown;
      if (usePasskey) {
        const assertion = await confirmAdminPasskey();
        ceremony_id = assertion.ceremony_id;
        credential = assertion.credential;
      }
      const path = editLease
        ? `/api/admin/mcp/leases/${editLease.id}`
        : `/api/admin/mcp/authorization-requests/${requestID}/approve`;
      const result = await mcpFetch<{ redirect_uri?: string }>(path, {
        method: "POST",
        body: JSON.stringify({
          ...mcpAuthorizationPolicy({
            selected,
            allNodes,
            keepExpiry,
            durationMinutes,
            longTerm: useLongTerm,
            note,
          }),
          password: usePasskey || twoFaEnabled ? undefined : secret,
          otp: usePasskey || !twoFaEnabled ? undefined : secret,
          ceremony_id,
          credential,
        }),
      });
      setSecret("");
      await onApproved();
      onClose();
      if (editLease) toast.success(t("mcp.authorization_updated"));
      else onConnected(result.redirect_uri || "");
    } catch (err) {
      const code = passkeyUnavailableMessage(err, "");
      if (code === "cancelled") {
        toast.error(t("account.passkey_cancelled"));
      } else {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const dialogPaperSx = {
    width: compact ? "100%" : 600,
    maxWidth: compact ? "100%" : "calc(100% - 64px)",
    height: compact ? "100%" : undefined,
    maxHeight: compact ? "100%" : undefined,
    display: "flex",
    flexDirection: "column",
    overflow: compact ? "hidden" : undefined,
    borderRadius: compact ? 0 : "12px",
  } as const;

  if (!requestID && !editLease) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen={compact}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}
      >
        <DialogTitle
          sx={{
            flexShrink: 0,
            px: { xs: 2, sm: 3 },
            pt: { xs: 2.25, sm: 3 },
            pb: 2,
            pr: 6,
            fontSize: 20,
            fontWeight: 700,
            lineHeight: "28px",
          }}
        >
          {t("mcp.new_authorization")}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.625, fontWeight: 400 }}>
            {t("mcp.view_requests_subtitle")}
          </Typography>
          <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }} aria-label={t("common.close")}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            px: { xs: 2, sm: 3 },
            pb: 2.75,
          }}
        >
          <Alert
            severity="info"
            sx={{ mb: 2.5, "& .MuiAlert-message": { width: "100%", minWidth: 0 } }}
          >
            <Typography sx={{ fontSize: 14, lineHeight: 1.6 }}>
              {t("mcp.connect_from_client", { endpoint: settings.endpoint })}
            </Typography>
          </Alert>
          {pendingRequests.length > 0 ? (
            <Stack spacing={1}>
              <Typography sx={{ fontSize: 13 }}>{t("mcp.pick_request")}</Typography>
              {pendingRequests.map((req) => (
                <Stack
                  key={req.id}
                  direction="row"
                  spacing={1.25}
                  sx={{
                    p: "12px 14px",
                    borderRadius: "8px",
                    border: "1px solid",
                    borderColor: "divider",
                    alignItems: "center",
                  }}
                >
                  <Box sx={{ minWidth: 0, flex: 1, textAlign: "left" }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                      {req.client_name || t("mcp.unknown_client")}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "text.secondary", mt: "3px" }} noWrap>
                      {req.redirect_uri || req.client_id || req.id}
                    </Typography>
                  </Box>
                  <Button
                    color="error"
                    variant="outlined"
                    disabled={Boolean(denyingID)}
                    onClick={() => void denyRequest(req.id, false)}
                    sx={{
                      ...ADMIN_LIST_ACTION_SX,
                      flexShrink: 0,
                      bgcolor: "background.paper",
                    }}
                  >
                    {t("mcp.deny")}
                  </Button>
                </Stack>
              ))}
            </Stack>
          ) : (
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {t("mcp.no_pending_requests")}
            </Typography>
          )}
        </DialogContent>
        <DialogActions
          sx={{
            flexShrink: 0,
            px: { xs: 2, sm: 3 },
            py: 2,
            justifyContent: "flex-end",
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button onClick={onClose}>{t("common.close")}</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={compact}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: dialogPaperSx } }}
    >
      <DialogTitle
        sx={{
          flexShrink: 0,
          px: { xs: 2, sm: 3 },
          pt: { xs: 2.25, sm: 3 },
          pb: 2,
          pr: 6,
          fontSize: 20,
          fontWeight: 700,
          lineHeight: "28px",
        }}
      >
        {editLease ? t("mcp.edit_authorization") : t("mcp.authorize_title")}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.625, fontWeight: 400 }}>
          {editLease ? t("mcp.edit_authorization_hint") : t("mcp.authorize_subtitle")}
        </Typography>
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 12, top: 12 }} aria-label={t("common.close")}>
          <X size={18} />
        </IconButton>
      </DialogTitle>
      <DialogContent
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: { xs: 2, sm: 3 },
          pb: 2.75,
        }}
      >
        {missingClient ? null : (
          <Stack
            direction={isMobile ? "column" : "row"}
            spacing={1.5}
            sx={{ p: "12px 14px", borderRadius: "8px", bgcolor: "action.hover", mb: 2.5, alignItems: isMobile ? "stretch" : "center" }}
          >
            <Stack direction="row" spacing={1.5} sx={{ minWidth: 0, flex: 1, alignItems: "center" }}>
              <Box sx={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: "8px", bgcolor: "background.paper", fontWeight: 700 }}>
                {(clientName || "AI").slice(0, 1).toUpperCase()}
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{t("mcp.client_request", { name: clientName || t("mcp.unknown_client") })}</Typography>
                {redirectURI ? (
                  <Typography sx={{ fontSize: 12, color: "text.secondary", mt: "3px" }} noWrap>
                    {t("mcp.redirect_uri")}: {redirectURI}
                  </Typography>
                ) : null}
                {clientID ? (
                  <Typography sx={{ fontSize: 12, color: "text.secondary", mt: "2px" }} noWrap>
                    {t("mcp.client_id_label")}: {clientID}
                  </Typography>
                ) : null}
                <Typography sx={{ fontSize: 12, color: "text.secondary", mt: "3px" }}>{t("mcp.client_only")}</Typography>
              </Box>
            </Stack>
            <Badge color="blue">{requestReady ? t("mcp.request_waiting") : t("mcp.awaiting_authorize")}</Badge>
          </Stack>
        )}
        <Stack
          direction="row"
          sx={{ width: "100%", justifyContent: "space-between", gap: 1, alignItems: "center" }}
        >
          <Typography sx={{ fontSize: 13, lineHeight: 1.5 }}>{t("mcp.allow_servers")}</Typography>
          <Stack direction="row" spacing={1.25} sx={{ flexShrink: 0, alignItems: "baseline" }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.5 }}>
              {allNodes ? t("mcp.all_servers") : t("mcp.selected_count", { count: selected.length })}
            </Typography>
            <Button
              size="small"
              disabled={allNodes || selectableIds.length === 0}
              onClick={toggleSelectAll}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                fontSize: 12,
                lineHeight: 1.5,
                minWidth: 0,
                minHeight: 0,
                px: 0,
                py: 0,
              }}
            >
              {allSelectableSelected ? t("common.deselect_all") : t("common.select_all")}
            </Button>
          </Stack>
        </Stack>
        <Box sx={{ mt: 1.25 }}>
          <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }}>
            <Checkbox
              checked={allNodes}
              onChange={(_event, checked) => setAllNodes(checked)}
              size="small"
              slotProps={{ input: { "aria-label": t("mcp.all_servers"), "aria-describedby": "mcp-all-nodes-hint" } }}
              sx={{ p: 0 }}
            />
            <Typography sx={{ fontSize: 13 }}>{t("mcp.all_servers")}</Typography>
          </Box>
          <Typography id="mcp-all-nodes-hint" sx={{ mt: 1, fontSize: 12, color: "text.secondary", lineHeight: "20px" }}>
            {t("mcp.all_servers_hint")}
          </Typography>
        </Box>
        <Box sx={{ mt: 1.25 }}>
          <FieldBox
            icon={<Search size={17} />}
            value={query}
            onChange={setQuery}
            placeholder={t("mcp.search_nodes")}
            inputMode="search"
            autoComplete="off"
            ariaLabel={t("mcp.search_nodes")}
          />
        </Box>
        <Box
          sx={{
            maxHeight: 240,
            overflow: "auto",
            flexShrink: 0,
            scrollbarGutter: "stable",
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "8px",
            mt: 1.25,
          }}
        >
          {filtered.map((node) => {
            const checked = allNodes ? nodeSupportsMCP(node) : selected.includes(node.uuid);
            const region = getRegionCode(node.region);
            const capable = nodeSupportsMCP(node);
            const blocked = nodeMCPUnavailableReason(node);
            const online = nodeOnlineState(available, onlineSet, node.uuid) !== false;
            const address = nodeDisplayIP(node) || "—";
            return (
              <Box
                key={node.uuid}
                onClick={() => !allNodes && capable && setSelected((current) => current.includes(node.uuid) ? current.filter((id) => id !== node.uuid) : [...current, node.uuid])}
                sx={{
                  px: 1.5,
                  py: 1.25,
                  cursor: capable ? "pointer" : "default",
                  bgcolor: checked ? LITE_BLUE_SOFT : "transparent",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "auto auto minmax(0,1fr) max-content",
                    columnGap: 1.375,
                    rowGap: "2px",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
                  <Checkbox
                    checked={checked}
                    disabled={allNodes || !capable}
                    size="small"
                    sx={{ p: 0, gridRow: "1 / 3", alignSelf: "center" }}
                  />
                  <Box
                    sx={{
                      flexShrink: 0,
                      lineHeight: 0,
                      display: "flex",
                      alignItems: "center",
                      gridRow: "1 / 3",
                      alignSelf: "center",
                    }}
                  >
                    <Flag flag={region} width={32} height={24} />
                  </Box>
                  <Typography
                    noWrap
                    sx={{
                      minWidth: 0,
                      pr: 1.25,
                      gridRow: 1,
                      gridColumn: 3,
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: "18px",
                      color: capable ? "text.primary" : "text.secondary",
                    }}
                  >
                    {nodeDisplayName(node)}
                  </Typography>
                  <Typography
                    noWrap
                    sx={{
                      minWidth: 0,
                      pr: 1.25,
                      gridRow: 2,
                      gridColumn: 3,
                      fontSize: 11,
                      lineHeight: "16px",
                      color: "text.secondary",
                      fontFamily: "Consolas, SFMono-Regular, monospace",
                    }}
                  >
                    {address}
                  </Typography>
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "5px",
                      flexShrink: 0,
                      gridRow: 1,
                      gridColumn: 4,
                      justifySelf: "end",
                      height: 18,
                      fontSize: 11,
                      lineHeight: "18px",
                      color: online ? NODE_ONLINE : NODE_OFFLINE,
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        bgcolor: "currentColor",
                        flexShrink: 0,
                      }}
                    />
                    {online ? t("nodeCard.online") : t("nodeCard.offline")}
                  </Box>
                  {blocked ? (
                    <Box sx={{ gridColumn: 4, gridRow: 2, justifySelf: "end" }}>
                      <NodeUnavailableBadge
                        reason={blocked}
                        label={blocked === "remote_off" ? t("mcp.node_need_remote") : t("mcp.node_need_agent")}
                      />
                    </Box>
                  ) : null}
                </Box>
              </Box>
            );
          })}
        </Box>
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: "8px", p: "13px 14px", mt: 2 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: "24px" }}>
              {t("mcp.full_permissions")}
            </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.125, flexWrap: "wrap" }}>
            <CapabilityBadge icon={<Terminal size={14} />} label={t("mcp.cap_terminal")} />
            <CapabilityBadge icon={<Code size={14} />} label={t("mcp.cap_exec")} />
            <CapabilityBadge icon={<Folder size={14} />} label={t("mcp.cap_files")} />
          </Stack>
          <Stack spacing={0.5} sx={{ mt: 1.25 }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.65 }}>
              {t("mcp.full_mode_notice")}
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.65 }}>
              {t("mcp.full_mode_notice_more")}
            </Typography>
          </Stack>
        </Box>
        {editLease ? (
          <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2.5, cursor: "pointer" }}>
            <Checkbox
              checked={changeDuration}
              onChange={(_event, checked) => setChangeDuration(checked)}
              size="small"
              slotProps={{ input: { "aria-label": t("mcp.change_duration") } }}
              sx={{ p: 0 }}
            />
            <Typography sx={{ fontSize: 13 }}>{t("mcp.change_duration")}</Typography>
          </Box>
        ) : null}
        <Box hidden={keepExpiry} sx={{ mt: 2.5 }}>
            <Box component="label" sx={{ display: "flex", alignItems: "center", gap: 1, cursor: "pointer" }}>
              <Checkbox
                checked={longTerm}
                onChange={(_event, checked) => setLongTerm(checked)}
                size="small"
                slotProps={{ input: { "aria-describedby": "mcp-long-term-hint" } }}
                sx={{ p: 0 }}
              />
              <Typography sx={{ fontSize: 13 }}>{t("mcp.long_term_authorization")}</Typography>
            </Box>
            <Typography id="mcp-long-term-hint" sx={{ mt: 1, fontSize: 12, color: "text.secondary", lineHeight: "20px" }}>
              {t("mcp.long_term_authorization_hint")}
            </Typography>
          </Box>
        <Box hidden={keepExpiry || useLongTerm}>
        <Typography sx={{ display: "block", fontSize: 13, mt: 2.5, mb: 1 }}>{t("mcp.duration_label")}</Typography>
        <Box
          sx={{
            display: "flex",
            gap: { xs: 0.75, sm: 1 },
            "& > button": {
              flex: 1,
              minWidth: 0,
              height: 36,
              px: { xs: 0.5, sm: 1.75 },
              fontSize: { xs: 12, sm: 13 },
              fontWeight: 400,
              textTransform: "none",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
            },
          }}
        >
          {MCP_DURATION_PRESETS.map((item) => {
            const selected = preset === item;
            const disabled = item > settings.mcp_max_duration_minutes;
            return (
              <Button
                key={item}
                variant="outlined"
                disabled={disabled}
                onClick={() => setPreset(item)}
                sx={{
                  borderColor: selected ? LITE_BLUE : "divider",
                  color: selected ? LITE_BLUE : "text.primary",
                  bgcolor: selected ? LITE_BLUE_SOFT : "background.paper",
                }}
              >
                {item >= 60 && item % 60 === 0
                  ? t("mcp.hours_n", { count: item / 60 })
                  : t("mcp.minutes_n", { count: item })}
              </Button>
            );
          })}
          <Button
            variant="outlined"
            onClick={() => setPreset("custom")}
            sx={{
              borderColor: preset === "custom" ? LITE_BLUE : "divider",
              color: preset === "custom" ? LITE_BLUE : "text.primary",
              bgcolor: preset === "custom" ? LITE_BLUE_SOFT : "background.paper",
            }}
          >
            {t("mcp.custom")}
          </Button>
        </Box>
        {preset === "custom" ? (
          <Box sx={{ mt: 1.5, maxWidth: { sm: 260 } }}>
            <DurationField
              raw={customValue}
              unit={customUnit}
              onRawChange={setCustomValue}
              onUnitChange={setCustomUnit}
            />
          </Box>
        ) : null}
        <Typography sx={{ mt: 1.125, fontSize: 12, color: durationError ? "error.main" : "text.secondary", lineHeight: "20px" }}>
          {durationError
            ? t("mcp.duration_invalid")
            : t("mcp.duration_from_confirm", {
                max: durationText(settings.mcp_max_duration_minutes, t),
              })}
        </Typography>
        </Box>
        <Box sx={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 2, mt: 2.5 }}>
          <Box>
            <Typography sx={{ display: "block", fontSize: 13, mb: 1 }}>
              {t("mcp.note")}{" "}
              <Box component="span" sx={{ color: "text.secondary" }}>{t("mcp.note_optional")}</Box>
            </Typography>
            <FieldBox
              name="mcp-purpose-note"
              value={note}
              onChange={setNote}
              autoComplete="off"
              multiline
              readOnlyUntilFocus
              ariaLabel={t("mcp.note")}
            />
          </Box>
          <Box
            component="form"
            autoComplete="on"
            onSubmit={(event) => event.preventDefault()}
            sx={{ position: "relative" }}
          >
            <Box
              component="input"
              type="text"
              name="username"
              autoComplete="username"
              tabIndex={-1}
              aria-hidden
              sx={{
                position: "absolute",
                left: "-10000px",
                top: 0,
                width: 200,
                height: 40,
                border: 0,
                padding: 0,
                margin: 0,
              }}
            />
            <Typography sx={{ display: "block", fontSize: 13, mb: 1 }}>
              {twoFaEnabled ? t("mcp.totp_label") : t("login.password")}
            </Typography>
            <FieldBox
              icon={twoFaEnabled ? <LockKeyhole size={16} /> : undefined}
              name={twoFaEnabled ? "otp" : "password"}
              value={secret}
              onChange={setSecret}
              type={twoFaEnabled ? "text" : "password"}
              placeholder={twoFaEnabled ? t("mcp.totp_placeholder") : undefined}
              autoComplete={twoFaEnabled ? "one-time-code" : "current-password"}
              inputMode={twoFaEnabled ? "numeric" : "text"}
              maxLength={twoFaEnabled ? 6 : undefined}
              ariaLabel={twoFaEnabled ? t("mcp.totp_label") : t("login.password")}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions
        sx={{
          flexShrink: 0,
          px: { xs: 2, sm: 3 },
          py: 2,
          justifyContent: "flex-end",
          borderTop: "1px solid",
          borderColor: "divider",
          "& > :not(style) ~ :not(style)": { ml: 0 },
        }}
      >
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          {!editLease ? <Button
            color="error"
            variant="outlined"
            disabled={!requestID || missingClient || Boolean(denyingID) || submitting}
            onClick={() => void denyRequest(requestID, true)}
          >
            {t("mcp.deny")}
          </Button> : null}
          <Button
            variant="contained"
            disabled={!canSubmit}
            startIcon={<Check size={16} />}
            onClick={() => void approveRequest(false)}
          >
            {editLease ? t("common.save") : t("mcp.authorize")}
          </Button>
          {passkeyAvailable ? (
            <Button
              variant="outlined"
              disabled={!canApproveBase}
              onClick={() => void approveRequest(true)}
            >
              {editLease ? t("mcp.save_passkey") : t("mcp.authorize_passkey")}
            </Button>
          ) : null}
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

