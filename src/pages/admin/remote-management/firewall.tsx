import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import MuiButton from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import MuiSwitch from "@mui/material/Switch";
import MuiTextField from "@mui/material/TextField";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { toast } from "sonner";

import Flag, { prefetchNodeFlags } from "@/components/Flag";
import { CustomTags } from "@/components/PriceTags";
import { AdminPagination, useAdminPagination } from "@/components/admin/AdminPagination";
import {
  AdminListFiltersBar,
  AdminListSearch,
  AdminListShell,
} from "@/components/admin/AdminListShell";
import AdminNodeListFilters, {
  type AdminNodeStatusValue,
} from "@/components/admin/AdminNodeListFilters";
import AdminPageTitle from "@/components/admin/AdminPageTitle";
import { AdminSheetTabs, AdminTabLabel } from "@/components/admin/AdminSheetTabs";
import { SettingCard, SettingCardLabel } from "@/components/admin/SettingCard";
import { ADMIN_LIST_ACTION_SX, ADMIN_LIST_OUTLINE_SX } from "@/components/admin/adminListLayout";
import { RequireAllowRemoteManagement } from "@/components/admin/RemoteManagementGate";
import { AdminMobileCardStack, AdminMobileListCard } from "@/components/admin/AdminMobileListCard";
import Loading from "@/components/loading";
import { AdminNodeLiveDataProvider, nodeOnlineState, useAdminNodeLiveData } from "@/hooks/use-admin-node-live-data";
import { useNodeDetails, type NodeDetail } from "@/contexts/NodeDetailsContext";
import {
  getFirewallViewSnapshot,
  prefetchFirewallView,
  refreshFirewallView,
  rememberFirewallView,
} from "./firewallPrefetch";
import { useAccount } from "@/contexts/AccountContext";
import {
  matchesRemoteExecNode,
  orderRemoteExecNodes,
} from "@/utils/remoteExecNodes";
import { getRegionCode } from "@/utils/regionHelper";
import "@/components/remote/RemoteExecNodeSelector.css";
import {
  AppDialogContent,
  Badge,
  Callout,
  Dialog,
  Flex,
  Switch,
} from "@/components/admin/ui";
import { Download, Pencil, Plus, RefreshCw, Trash, Upload } from "@/components/admin/muiIcons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { confirmAdminPasskey } from "@/utils/webauthn";
import {
  clearStoredRemoteGrant,
  isRemoteGrantLive,
  loadStoredRemoteGrant,
  localizeRemoteError,
  saveStoredRemoteGrant,
} from "@/utils/remoteSession";
import { createRandomId } from "@/utils/randomId";
import { useIsMobile } from "@/hooks/use-mobile";

type FirewallProtocol = "tcp" | "udp" | "both";

type FirewallRule = {
  id: string;
  enabled: boolean;
  action: "allow" | "deny";
  protocol: "tcp" | "udp";
  port: string;
  source?: string;
  stack: "v4" | "v6";
  comment?: string;
  origin?: string;
  priority: number;
  inbound_id?: string;
  host_key?: string;
};

type HostRule = {
  key: string;
  adoptable: boolean;
  action?: string;
  protocol?: string;
  port?: string;
  source?: string;
  stack?: string;
  comment?: string;
  raw?: string;
  reason?: string;
};

type Snapshot = {
  backend?: string;
  privileged?: boolean;
  supported?: boolean;
  outer_filter?: boolean;
  outer_hint?: string;
  outer_managers?: string[];
  default_deny_blocked?: boolean;
  default_deny_block_reason?: string;
  block_ping_v4?: boolean;
  block_ping_v6?: boolean;
  has_stacks?: boolean;
  stack_v4?: boolean;
  stack_v6?: boolean;
  host_rules?: HostRule[];
  keep_rules?: FirewallRule[];
  ssh_port?: string;
  error?: string;
};

type FirewallView = {
  uuid: string;
  name: string;
  intent: {
    revision: number;
    block_ping_v4: boolean;
    block_ping_v6: boolean;
    default_deny_v4: boolean;
    default_deny_v6: boolean;
    ssh_port?: string;
    omit_keep?: string[];
    rules: FirewallRule[];
  };
  delivery_status?: string;
  delivery_error?: string;
  applied_revision?: number;
  live?: boolean;
  supported?: boolean;
  unavailable?: string;
  disable_original?: string;
  disable_original_error?: string;
  snapshot?: Snapshot;
};

type RuleForm = {
  action: "allow" | "deny";
  protocol: FirewallProtocol;
  port: string;
  source: string;
  comment: string;
  priority: string;
  enabled: boolean;
};

const GRANT_SCOPE = "firewall";
const EMPTY_FORM: RuleForm = {
  action: "allow",
  protocol: "tcp",
  port: "",
  source: "",
  comment: "",
  priority: "100",
  enabled: true,
};

async function readPayload(response: Response) {
  return response.json().catch(() => ({}));
}

function isKeepRule(rule: { origin?: string }) {
  return String(rule.origin || "").toLowerCase() === "keep";
}

function persistableRules(rules: FirewallRule[] | undefined) {
  return (rules || []).filter((rule) => !isKeepRule(rule));
}

function keepOmitKey(rule: { comment?: string }) {
  return String(rule.comment || "").trim().toLowerCase();
}

function protocolsOf(protocol: FirewallProtocol): Array<"tcp" | "udp"> {
  return protocol === "both" ? ["tcp", "udp"] : [protocol];
}

const FirewallPage = () => (
  <RequireAllowRemoteManagement>
    <AdminNodeLiveDataProvider>
      <FirewallContent />
    </AdminNodeLiveDataProvider>
  </RequireAllowRemoteManagement>
);

export default FirewallPage;

function FirewallContent() {
  const { t } = useTranslation();
  const { nodeDetail, isLoading, error } = useNodeDetails();
  const { liveData, available } = useAdminNodeLiveData();
  const onlineSet = useMemo(
    () => new Set(liveData?.data.online ?? []),
    [liveData?.data.online],
  );
  const { account } = useAccount();
  const [params, setParams] = useSearchParams();
  const uuid = params.get("uuid")?.trim() || "";
  const mobile = useIsMobile();
  const [view, setView] = useState<FirewallView | null>(() =>
    uuid ? getFirewallViewSnapshot<FirewallView>(uuid) : null,
  );
  const [loadingView, setLoadingView] = useState(() => Boolean(uuid && !getFirewallViewSnapshot(uuid)));
  const [stack, setStack] = useState<"v4" | "v6">("v4");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<FirewallRule | "new" | null>(null);
  const [deleting, setDeleting] = useState<FirewallRule | null>(null);
  const [importHost, setImportHost] = useState(false);
  const [selectedHost, setSelectedHost] = useState<string[]>([]);
  const [disableOriginal, setDisableOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [hasGrant, setHasGrant] = useState(() => Boolean(loadStoredRemoteGrant(GRANT_SCOPE)));
  const grantRef = useRef("");
  const grantExpiresAtRef = useRef(0);
  const pageIDRef = useRef(loadStoredRemoteGrant(GRANT_SCOPE)?.pageID || createRandomId());
  const twoFaEnabled = Boolean(account?.["2fa_enabled"]);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authOtp, setAuthOtp] = useState("");
  const [pendingSave, setPendingSave] = useState<FirewallView["intent"] | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [denyConfirm, setDenyConfirm] = useState(false);
  const [sshPortConfirm, setSshPortConfirm] = useState<string | null>(null);
  const [sshPortFieldKey, setSshPortFieldKey] = useState(0);

  const clearGrant = useCallback(() => {
    grantRef.current = "";
    grantExpiresAtRef.current = 0;
    clearStoredRemoteGrant(GRANT_SCOPE);
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
    saveStoredRemoteGrant(GRANT_SCOPE, grant, grantExpiresAtRef.current, pageIDRef.current);
    setHasGrant(true);
  }, [clearGrant]);

  useEffect(() => {
    const stored = loadStoredRemoteGrant(GRANT_SCOPE);
    if (!stored) return;
    grantRef.current = stored.grant;
    grantExpiresAtRef.current = stored.expiresAt;
    if (stored.pageID) pageIDRef.current = stored.pageID;
    setHasGrant(true);
  }, []);

  useLayoutEffect(() => {
    prefetchNodeFlags(nodeDetail);
  }, [nodeDetail]);

  useEffect(() => {
    fetch("/api/admin/account/passkeys")
      .then((response) => response.json())
      .then((body) => {
        const items = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        setPasskeyAvailable(items.length > 0);
      })
      .catch(() => setPasskeyAvailable(false));
  }, []);

  const authorize = async (password: string, otp: string, usePasskey: boolean) => {
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
    const payload = await readPayload(response);
    if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
    const grant = payload?.data?.grant;
    if (typeof grant !== "string" || !grant) throw new Error(t("terminal.session.auth_failed"));
    return grant;
  };

  useEffect(() => {
    if (!uuid) {
      setView(null);
      setLoadingView(false);
      return;
    }
    let cancelled = false;
    const cached = getFirewallViewSnapshot<FirewallView>(uuid);
    if (cached) {
      setView(cached);
      setLoadingView(false);
    } else {
      setLoadingView(true);
    }
    void refreshFirewallView(uuid)
      .then(async (data) => {
        let next = (data as FirewallView | null) || null;
        if (!cancelled) {
          setView(next);
          setLoadingView(false);
        }
        const denyOn = Boolean(next?.intent?.default_deny_v4 || next?.intent?.default_deny_v6);
        const hasKeep = Boolean(next?.snapshot?.keep_rules?.length);
        if (!cancelled && next?.supported && !next.unavailable && (!next.snapshot || (denyOn && !hasKeep))) {
          try {
            const response = await fetch(`/api/admin/firewall/${encodeURIComponent(uuid)}/snapshot`, {
              method: "POST",
              credentials: "same-origin",
            });
            const payload = await readPayload(response);
            if (response.ok && payload?.data) {
              next = payload.data as FirewallView;
              rememberFirewallView(uuid, next);
              if (!cancelled) setView(next);
            }
          } catch {
            // keep the intent view even if the first host scan is still pending
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || t("common.error"));
        if (!getFirewallViewSnapshot(uuid)) setView(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingView(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t, uuid]);

  const postJSON = async (path: string, method: string, body: Record<string, unknown>) => {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      clearGrant();
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }
    rememberGrant(payload?.data?.next_grant, payload?.data?.expires_at);
    const data = payload?.data ?? {};
    const { next_grant: _grant, expires_at: _expires, ...view } = data as FirewallView & {
      next_grant?: string;
      expires_at?: string;
    };
    return view;
  };

  const saveIntent = async (next: FirewallView["intent"], password = "", otp = "", usePasskey = false) => {
    if (!uuid) return;
    setBusy(true);
    try {
      const grant = await authorize(password, otp, usePasskey);
      const data = await postJSON(`/api/admin/firewall/${encodeURIComponent(uuid)}`, "PUT", {
        uuid,
        block_ping_v4: next.block_ping_v4,
        block_ping_v6: next.block_ping_v6,
        default_deny_v4: next.default_deny_v4,
        default_deny_v6: next.default_deny_v6,
        ssh_port: next.ssh_port || "",
        omit_keep: next.omit_keep || [],
        rules: persistableRules(next.rules),
        grant,
        page_id: pageIDRef.current,
      }) as FirewallView;
      setView(data);
      rememberFirewallView(uuid, data);
      setAuthPassword("");
      setAuthOtp("");
      setPendingSave(null);
      setAuthOpen(false);
      const failed = data.delivery_status === "failed" || data.delivery_status === "unsupported";
      if (failed) {
        toast.error(data.delivery_error || t(`firewall.delivery_${data.delivery_status}`, { defaultValue: data.delivery_status }));
      } else if (data.delivery_status === "sent" || data.delivery_status === "queued" || data.delivery_status === "pending") {
        toast.success(t("firewall.saved_pending"));
      } else {
        toast.success(t("firewall.saved"));
      }
    } finally {
      setBusy(false);
    }
  };

  const queueSave = async (next: FirewallView["intent"]) => {
    if (!uuid) return;
    if (isRemoteGrantLive(grantRef.current, grantExpiresAtRef.current)) {
      try {
        await saveIntent(next);
      } catch (err) {
        toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || t("common.error"));
      }
      return;
    }
    setPendingSave(next);
    setAuthOpen(true);
  };

  const readOnly = Boolean(view?.unavailable);
  const rules = view?.intent.rules || [];
  const hostRules = view?.snapshot?.host_rules;
  const adoptableHostKeys = useMemo(
    () => (hostRules || []).filter((rule) => rule.adoptable).map((rule) => rule.key),
    [hostRules],
  );
  const hostSelectState: boolean | "indeterminate" = adoptableHostKeys.length === 0
    ? false
    : adoptableHostKeys.every((key) => selectedHost.includes(key))
      ? true
      : selectedHost.some((key) => adoptableHostKeys.includes(key))
        ? "indeterminate"
        : false;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter((rule) => {
      if (rule.stack !== stack) return false;
      if (!q) return true;
      return [rule.action, rule.protocol, rule.port, rule.source, rule.comment, isKeepRule(rule) ? t("firewall.origin_keep") : ""].some((value) =>
        String(value || "").toLowerCase().includes(q),
      );
    });
  }, [query, rules, stack, t]);
  const pager = useAdminPagination(filtered);
  useEffect(() => {
    pager.setPage(1);
  }, [query, stack, uuid, pager.setPage]);

  const snapshot = async () => {
    if (!uuid) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/firewall/${encodeURIComponent(uuid)}/snapshot`, {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
      const data = (payload?.data || null) as FirewallView | null;
      setView(data);
      if (data) rememberFirewallView(uuid, data);
      if (data?.live) {
        toast.success(t("firewall.scanned"));
      } else if (data?.unavailable) {
        toast.error(t(`firewall.${data.unavailable}`, { defaultValue: data.unavailable }));
      } else {
        toast.message(t("firewall.scan_offline"));
      }
    } catch (err) {
      toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const upsertRule = async (form: RuleForm, existing: FirewallRule | undefined, password: string, otp: string, usePasskey: boolean) => {
    if (!view || (existing && isKeepRule(existing))) return;
    const expanded = protocolsOf(form.protocol).map((protocol, index) => ({
      id: index === 0 ? existing?.id || "" : "",
      enabled: form.enabled,
      action: form.action,
      protocol,
      port: form.port.trim(),
      source: form.source.trim(),
      stack,
      comment: form.comment.trim(),
      origin: existing?.origin || "web",
      priority: Number(form.priority || 100),
      inbound_id: existing?.inbound_id,
      host_key: existing?.host_key,
    } satisfies FirewallRule));
    const nextRules = existing
      ? [...rules.filter((rule) => rule.id !== existing.id), ...expanded]
      : [...rules, ...expanded];
    await saveIntent({ ...view.intent, rules: nextRules }, password, otp, usePasskey);
    setEditing(null);
  };

  const removeRule = async (rule: FirewallRule) => {
    if (!view) return;
    setDeleting(null);
    const omitKeep = isKeepRule(rule)
      ? Array.from(new Set([...(view.intent.omit_keep || []), keepOmitKey(rule)].filter(Boolean)))
      : view.intent.omit_keep;
    await queueSave({
      ...view.intent,
      omit_keep: omitKeep,
      rules: persistableRules(rules).filter((item) => item.id !== rule.id),
    });
  };

  const exportRules = () => {
    const blob = new Blob(
      [
        `${JSON.stringify(
          {
            lite_plus_firewall: 1,
            block_ping_v4: view?.intent.block_ping_v4 || false,
            block_ping_v6: view?.intent.block_ping_v6 || false,
            default_deny_v4: view?.intent.default_deny_v4 || false,
            default_deny_v6: view?.intent.default_deny_v6 || false,
            ssh_port: view?.intent.ssh_port || view?.snapshot?.ssh_port || "",
            rules: persistableRules(rules).filter((rule) => rule.stack === stack),
          },
          null,
          2,
        )}\n`,
      ],
      { type: "application/json" },
    );
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `lite-plus-firewall-${stack}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !view) return;
    try {
      const parsed = JSON.parse(await file.text()) as { rules?: FirewallRule[]; ssh_port?: string };
      const incoming = Array.isArray(parsed.rules) ? parsed.rules : [];
      const mapped = incoming.map((rule) => ({
        id: "",
        enabled: Boolean(rule.enabled),
        action: rule.action,
        protocol: rule.protocol,
        port: rule.port,
        source: rule.source,
        stack: rule.stack === "v6" || rule.stack === "v4" ? rule.stack : stack,
        comment: rule.comment,
        origin: "file" as const,
        priority: Number(rule.priority || 100),
      }));
      await queueSave({
        ...view.intent,
        rules: [...rules, ...mapped],
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("firewall.errors.import"));
    }
  };

  const adopt = async (usePasskey = false) => {
    if (!uuid || selectedHost.length === 0) return;
    setBusy(true);
    try {
      const grant = await authorize(authPassword, authOtp, usePasskey);
      const data = await postJSON(`/api/admin/firewall/${encodeURIComponent(uuid)}/adopt`, "POST", {
        uuid,
        keys: selectedHost,
        disable_original: disableOriginal,
        grant,
        page_id: pageIDRef.current,
      }) as FirewallView;
      setView(data);
      rememberFirewallView(uuid, data);
      setImportHost(false);
      setSelectedHost([]);
      if (data.disable_original === "timeout") {
        toast.message(t("firewall.disable_original_timeout"));
      } else if (data.disable_original === "failed") {
        toast.message(data.disable_original_error || t("firewall.disable_original_failed"));
      } else {
        toast.success(t("firewall.adopted"));
      }
    } catch (err) {
      toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const online = uuid ? nodeOnlineState(available, onlineSet, uuid) : null;
  const selectedNode = nodeDetail.find((node) => node.uuid === uuid) || null;
  const openNode = (node: NodeDetail) => {
    void prefetchFirewallView(node.uuid);
    setParams({ uuid: node.uuid });
  };
  const backToList = () => {
    setParams({});
    setQuery("");
    setStack("v4");
    setView(null);
  };
  const listPending = isLoading && nodeDetail.length === 0;
  const detailPending = Boolean(uuid) && !selectedNode && isLoading && loadingView && !view;

  if (error) return <div className="text-red-500">{error}</div>;

  if (!uuid) {
    return (
      <div
        className="flex flex-col gap-4 p-0 md:p-4"
        data-testid="admin-firewall-page"
        data-admin-route-pending={listPending ? "true" : undefined}
      >
        <AdminPageTitle description={t("firewall.description")}>{t("firewall.title")}</AdminPageTitle>
        {listPending ? (
          <Loading inline text="" />
        ) : (
          <FirewallNodePicker
            nodes={nodeDetail}
            onlineSet={onlineSet}
            available={available}
            onSelect={openNode}
            onPrefetch={prefetchFirewallView}
          />
        )}
      </div>
    );
  }

  const flag = selectedNode?.region_override?.trim() || selectedNode?.region?.trim() || "UN";
  const stackReady = !view?.snapshot?.has_stacks || (stack === "v4" ? view.snapshot.stack_v4 !== false : view.snapshot.stack_v6 !== false);
  const stackLocked = readOnly || !stackReady;
  const pingOn = Boolean(view?.intent.block_ping_v4 || view?.intent.block_ping_v6);
  const denyOn = Boolean(view?.intent.default_deny_v4 || view?.intent.default_deny_v6);
  const denyBlocked = Boolean(view?.snapshot?.default_deny_blocked);
  const sshPort = String(
    view?.delivery_status === "applied"
      ? view?.intent.ssh_port || view?.snapshot?.ssh_port || "22"
      : view?.snapshot?.ssh_port || view?.intent.ssh_port || "22",
  ).trim() || "22";

  return (
    <div
      className="flex flex-col gap-4 p-0 md:p-4"
      data-testid="admin-firewall-page"
      data-admin-route-pending={detailPending ? "true" : undefined}
    >
      <MuiButton
        className="km-admin-back-button"
        startIcon={<ChevronLeft sx={{ fontSize: 18 }} />}
        onClick={backToList}
        sx={{
          alignSelf: "flex-start",
          px: 0,
          minWidth: 0,
          minHeight: 22,
          color: "text.secondary",
          textTransform: "none",
          fontWeight: 400,
          fontSize: 16,
          "&:hover": { bgcolor: "transparent", color: "text.primary" },
        }}
      >
        {t("firewall.back_to_list")}
      </MuiButton>
      <Box className="km-admin-detail-card" sx={{ px: { xs: 2, sm: 2.5 }, py: 2 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
          <Box className="admin-node-country-flag admin-firewall-identity-flag" sx={{ flexShrink: 0, lineHeight: 0 }}>
            <Flag flag={flag} compact />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Typography sx={{ fontWeight: 700, fontSize: 20, lineHeight: 1.35 }}>
                {selectedNode?.name || uuid}
              </Typography>
              <Chip
                size="small"
                label={online ? t("nodeCard.online") : t("nodeCard.offline")}
                sx={{
                  height: 22,
                  fontWeight: 600,
                  fontSize: 12,
                  color: online ? "#fff" : "var(--red-11)",
                  bgcolor: online ? "#22C55E" : "var(--red-a3)",
                }}
              />
              {view?.snapshot?.backend ? (
                <Chip
                  size="small"
                  variant="outlined"
                  label={t(`firewall.backend.${view.snapshot.backend}`, { defaultValue: view.snapshot.backend })}
                  sx={{ height: 22, fontSize: 12 }}
                />
              ) : null}
            </Stack>
            {selectedNode?.ipv4?.trim() || selectedNode?.ipv6?.trim() || selectedNode?.group?.trim() ? (
              <Typography color="text.secondary" sx={{ mt: 0.75, fontSize: 13, lineHeight: 1.5 }}>
                {[
                  selectedNode?.ipv4?.trim() ? `IPv4 ${selectedNode.ipv4.trim()}` : "",
                  selectedNode?.ipv6?.trim() ? `IPv6 ${compactIPv6(selectedNode.ipv6.trim())}` : "",
                  selectedNode?.group?.trim() || "",
                ].filter(Boolean).join("  ·  ")}
              </Typography>
            ) : null}
            {view?.snapshot?.outer_hint ? (
              <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 13 }}>
                {view.snapshot.outer_hint}
              </Typography>
            ) : null}
          </Box>
          {view?.delivery_status ? (
            <Chip
              size="small"
              label={t(`firewall.delivery_${view.delivery_status}`, { defaultValue: view.delivery_status })}
              sx={{
                ml: "auto",
                flexShrink: 0,
                alignSelf: "center",
                height: 22,
                fontWeight: 600,
                fontSize: 12,
                ...deliveryStatusChipSx(view.delivery_status),
              }}
            />
          ) : null}
        </Stack>
      </Box>
      {view?.unavailable === "agent_old" ? (
        <Callout.Root color="orange" role="alert">
          <Callout.Text>{t("firewall.agent_old")}</Callout.Text>
        </Callout.Root>
      ) : null}
      {view?.unavailable === "remote_off" ? (
        <Callout.Root color="orange" role="alert">
          <Callout.Text>{t("firewall.remote_off")}</Callout.Text>
        </Callout.Root>
      ) : null}
      {view?.delivery_error ? (
        <Callout.Root color="red" role="alert">
          <Callout.Text>{view.delivery_error}</Callout.Text>
        </Callout.Root>
      ) : null}
      {detailPending || !view ? (
        <Loading inline text="" />
      ) : (
        <>
          <SettingCardLabel>{t("firewall.policy")}</SettingCardLabel>
          <Stack
            direction="row"
            spacing={1.5}
            useFlexGap
            sx={{ flexWrap: "wrap", alignItems: "stretch", width: "fit-content", maxWidth: "100%" }}
          >
            <FirewallPolicySwitch
              title={t("firewall.block_ping")}
              checked={pingOn}
              disabled={readOnly || busy}
              onChange={(next) => void queueSave({ ...view.intent, block_ping_v4: next, block_ping_v6: next })}
            />
            <FirewallPolicySwitch
              title={t("firewall.default_deny")}
              checked={denyOn}
              disabled={readOnly || busy || (denyBlocked && !denyOn)}
              onChange={(next) => {
                if (next) {
                  setDenyConfirm(true);
                  return;
                }
                void queueSave({ ...view.intent, default_deny_v4: false, default_deny_v6: false });
              }}
            />
            <FirewallPolicyPort
              key={sshPortFieldKey}
              title={t("firewall.ssh_port")}
              value={sshPort}
              disabled={readOnly || busy}
              onCommit={(next) => {
                if (next === sshPort) return;
                setSshPortConfirm(next);
              }}
            />
          </Stack>
          {denyBlocked ? (
            <Callout.Root color="orange" role="alert">
              <Callout.Text>{t("firewall.default_deny_blocked")}</Callout.Text>
            </Callout.Root>
          ) : null}
          <SettingCardLabel>{t("firewall.rules")}</SettingCardLabel>
          <AdminSheetTabs>
            <Tabs value={stack} onChange={(_, next: "v4" | "v6") => next && setStack(next)}>
              <Tab value="v4" label={<AdminTabLabel>{t("firewall.tab_v4")}</AdminTabLabel>} />
              <Tab value="v6" label={<AdminTabLabel>{t("firewall.tab_v6")}</AdminTabLabel>} />
            </Tabs>
          </AdminSheetTabs>
          {!stackReady ? (
            <Callout.Root color="orange" role="status">
              <Callout.Text>{t("firewall.stack_unsupported", { stack: t(`firewall.tab_${stack}`) })}</Callout.Text>
            </Callout.Root>
          ) : null}
          <AdminListShell>
            <AdminListFiltersBar>
              <Stack
                direction="row"
                spacing={1.5}
                useFlexGap
                sx={{ width: "100%", flexWrap: { xs: "wrap", md: "nowrap" }, alignItems: "center" }}
              >
                <AdminListSearch value={query} onChange={setQuery} placeholder={t("firewall.search")} />
                <Stack direction="row" spacing={1} useFlexGap sx={{ ml: { md: "auto" }, flexWrap: "wrap" }}>
                  <MuiButton variant="contained" startIcon={<Plus size={16} />} sx={ADMIN_LIST_ACTION_SX} disabled={stackLocked} onClick={() => setEditing("new")}>
                    {t("firewall.create")}
                  </MuiButton>
                  <MuiButton variant="outlined" startIcon={<Upload size={16} />} sx={ADMIN_LIST_OUTLINE_SX} disabled={stackLocked} onClick={() => importRef.current?.click()}>
                    {t("firewall.import")}
                  </MuiButton>
                  <MuiButton variant="outlined" startIcon={<Download size={16} />} sx={ADMIN_LIST_OUTLINE_SX} disabled={!stackReady} onClick={exportRules}>
                    {t("firewall.export")}
                  </MuiButton>
                  <MuiButton variant="outlined" sx={ADMIN_LIST_OUTLINE_SX} disabled={stackLocked} onClick={() => { setSelectedHost([]); setImportHost(true); void snapshot(); }}>
                    {t("firewall.sync_host")}
                  </MuiButton>
                  <MuiButton variant="outlined" startIcon={<RefreshCw size={16} />} sx={ADMIN_LIST_OUTLINE_SX} disabled={busy || readOnly} onClick={() => void snapshot()}>
                    {t("firewall.refresh")}
                  </MuiButton>
                </Stack>
                <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => void importFile(event)} />
              </Stack>
            </AdminListFiltersBar>
            {mobile ? (
              pager.pageItems.length === 0 ? (
                <Box className="km-admin-list-empty">{query.trim() ? t("firewall.empty_rules_filtered") : t("firewall.empty_rules", { stack: t(`firewall.tab_${stack}`) })}</Box>
              ) : (
                <AdminMobileCardStack>
                  {pager.pageItems.map((rule) => {
                    const kept = isKeepRule(rule);
                    return (
                    <AdminMobileListCard
                      key={rule.id}
                      title={`${t(`firewall.action_${rule.action}`)} ${rule.protocol.toUpperCase()} / ${rule.port}`}
                      cells={[
                        [t("firewall.source"), rule.source || t("firewall.any")],
                        [t("firewall.comment"), rule.comment || "—"],
                        ...(kept ? [[t("firewall.origin_keep"), t("firewall.view_only")] as [string, string]] : []),
                      ]}
                      actions={
                        <Flex gap="2">
                          {kept ? null : (
                            <IconButton size="small" disabled={stackLocked} aria-label={t("common.edit")} onClick={() => setEditing(rule)}>
                              <Pencil size={16} />
                            </IconButton>
                          )}
                          <IconButton size="small" disabled={stackLocked} color="error" aria-label={t("common.delete")} onClick={() => setDeleting(rule)}>
                            <Trash size={16} />
                          </IconButton>
                        </Flex>
                      }
                    />
                    );
                  })}
                </AdminMobileCardStack>
              )
            ) : pager.pageItems.length === 0 ? (
              <Box className="km-admin-list-empty">{query.trim() ? t("firewall.empty_rules_filtered") : t("firewall.empty_rules", { stack: t(`firewall.tab_${stack}`) })}</Box>
            ) : (
              <Table container={false} className="admin-responsive-table min-w-[880px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">{t("firewall.enabled")}</TableHead>
                    <TableHead>{t("firewall.action")}</TableHead>
                    <TableHead>{t("firewall.protocol")}</TableHead>
                    <TableHead>{t("firewall.port")}</TableHead>
                    <TableHead>{t("firewall.source")}</TableHead>
                    <TableHead>{t("firewall.comment")}</TableHead>
                    <TableHead className="w-24">{t("firewall.priority")}</TableHead>
                    <TableHead className="w-24 text-center">{t("common.action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pager.pageItems.map((rule) => {
                    const kept = isKeepRule(rule);
                    return (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <Switch checked={Boolean(rule.enabled)} disabled={stackLocked || busy || kept} onCheckedChange={(enabled) => {
                          if (kept) return;
                          void queueSave({ ...view.intent, rules: rules.map((item) => item.id === rule.id ? { ...item, enabled } : item) });
                        }} />
                      </TableCell>
                      <TableCell>
                        <Flex gap="1" align="center">
                          <Badge color={rule.action === "allow" ? "green" : "red"} variant="soft">
                            {t(`firewall.action_${rule.action}`)}
                          </Badge>
                          {kept ? (
                            <Badge color="gray" variant="soft">
                              {t("firewall.origin_keep")}
                            </Badge>
                          ) : null}
                        </Flex>
                      </TableCell>
                      <TableCell>{rule.protocol.toUpperCase()}</TableCell>
                      <TableCell>{rule.port}</TableCell>
                      <TableCell>{rule.source || t("firewall.any")}</TableCell>
                      <TableCell>{rule.comment || "—"}</TableCell>
                      <TableCell>{rule.priority}</TableCell>
                      <TableCell className="text-center">
                        {kept ? null : (
                          <IconButton size="small" disabled={stackLocked} aria-label={t("common.edit")} onClick={() => setEditing(rule)}>
                            <Pencil size={16} />
                          </IconButton>
                        )}
                        <IconButton size="small" disabled={stackLocked} color="error" aria-label={t("common.delete")} onClick={() => setDeleting(rule)}>
                          <Trash size={16} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
            <AdminPagination
              page={pager.page}
              total={filtered.length}
              pageSize={pager.pageSize}
              onPageChange={pager.setPage}
              onPageSizeChange={pager.setPageSize}
              showSummary={false}
              showWhenEmpty
            />
          </AdminListShell>
        </>
      )}
      <RuleDialog
        open={editing !== null}
        stack={stack}
        rule={editing && editing !== "new" ? editing : null}
        hasGrant={hasGrant}
        twoFaEnabled={twoFaEnabled}
        passkeyAvailable={passkeyAvailable}
        onClose={() => setEditing(null)}
        onSave={(form, password, otp, usePasskey) => upsertRule(form, editing && editing !== "new" ? editing : undefined, password, otp, usePasskey)}
      />
      <Dialog.Root open={deleting !== null} onOpenChange={(next: boolean) => { if (!next) setDeleting(null); }}>
        <AppDialogContent title={t("firewall.delete_title")} description={t("firewall.delete_body")}>
          <Flex justify="end" gap="2" className="mt-4">
            <MuiButton onClick={() => setDeleting(null)}>{t("common.cancel")}</MuiButton>
            <MuiButton color="error" variant="contained" onClick={() => deleting && void removeRule(deleting)}>{t("common.delete")}</MuiButton>
          </Flex>
        </AppDialogContent>
      </Dialog.Root>
      <Dialog.Root open={importHost} onOpenChange={(next: boolean) => { if (!next) setImportHost(false); }}>
        <AppDialogContent title={t("firewall.sync_host")} description={t("firewall.sync_host_help")} maxWidth="720px">
          {adoptableHostKeys.length > 0 ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 2, pl: 1.5, border: "1px solid transparent" }}>
              <Checkbox
                checked={hostSelectState}
                onCheckedChange={(checked) => {
                  setSelectedHost(checked === true ? adoptableHostKeys : []);
                }}
              />
              <Typography sx={{ fontSize: 13.5 }}>
                {hostSelectState === true ? t("common.deselect_all") : t("common.select_all")}
              </Typography>
            </Box>
          ) : null}
          <Stack spacing={1.25} sx={{ mt: adoptableHostKeys.length > 0 ? 1 : 2, maxHeight: 420, overflow: "auto" }}>
            {(hostRules || []).length === 0 ? (
              <Box className="km-admin-list-empty">{t("firewall.host_empty")}</Box>
            ) : (
              (hostRules || []).map((rule) => (
                <Paper
                  key={rule.key}
                  variant="outlined"
                  component="label"
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1.25,
                    px: 1.5,
                    py: 1.25,
                    borderRadius: "8px",
                    cursor: rule.adoptable ? "pointer" : "default",
                    opacity: rule.adoptable ? 1 : 0.72,
                  }}
                >
                  <Checkbox
                    checked={selectedHost.includes(rule.key)}
                    disabled={!rule.adoptable}
                    onCheckedChange={(checked) => {
                      setSelectedHost((current) => checked ? [...current, rule.key] : current.filter((item) => item !== rule.key));
                    }}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", mb: 0.5 }}>
                      <Badge color={rule.adoptable ? "green" : "gray"} variant="soft">
                        {rule.adoptable ? t("firewall.adoptable") : t("firewall.view_only")}
                      </Badge>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>
                        {(rule.stack || "—").toUpperCase()} · {(rule.protocol || "—").toUpperCase()} / {rule.port || "—"}
                      </Typography>
                    </Stack>
                    <Typography color="text.secondary" sx={{ fontSize: 12.5, lineHeight: 1.5, wordBreak: "break-all" }}>
                      {rule.raw || rule.reason || ""}
                    </Typography>
                  </Box>
                </Paper>
              ))
            )}
          </Stack>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 2, pl: 1.5, border: "1px solid transparent" }}>
            <Checkbox checked={disableOriginal} onCheckedChange={(checked) => setDisableOriginal(Boolean(checked))} />
            <Typography sx={{ fontSize: 13.5 }}>{t("firewall.disable_original")}</Typography>
          </Box>
          <MuiTextField
            size="small"
            fullWidth
            sx={{ mt: 1.5 }}
            type={twoFaEnabled ? "text" : "password"}
            label={hasGrant ? t("scheduled_exec.grant_ready") : twoFaEnabled ? t("admin.nodeTable.twoFactorCode") : t("login.password")}
            value={twoFaEnabled ? authOtp : authPassword}
            onChange={(event) => {
              if (twoFaEnabled) setAuthOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
              else setAuthPassword(event.target.value);
            }}
          />
          <Flex justify="end" gap="2" className="mt-4">
            <MuiButton onClick={() => setImportHost(false)}>{t("common.cancel")}</MuiButton>
            {passkeyAvailable && !hasGrant ? (
              <MuiButton
                variant="outlined"
                disabled={busy || selectedHost.length === 0}
                onClick={() => void adopt(true).catch((err) => {
                  toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || t("common.error"));
                })}
              >
                {t("login.passkey")}
              </MuiButton>
            ) : null}
            <MuiButton
              variant="contained"
              disabled={busy || selectedHost.length === 0 || (!hasGrant && (twoFaEnabled ? !authOtp.trim() : !authPassword.trim()))}
              onClick={() => void adopt(false)}
            >
              {t("firewall.adopt")}
            </MuiButton>
          </Flex>
        </AppDialogContent>
      </Dialog.Root>
      <Dialog.Root open={sshPortConfirm !== null} onOpenChange={(next: boolean) => {
        if (!next) {
          setSshPortConfirm(null);
          setSshPortFieldKey((key) => key + 1);
        }
      }}>
        <AppDialogContent title={t("firewall.ssh_port_confirm_title")} description={t("firewall.ssh_port_confirm_help")}>
          <Flex justify="end" gap="2" className="mt-4">
            <MuiButton onClick={() => {
              setSshPortConfirm(null);
              setSshPortFieldKey((key) => key + 1);
            }}>{t("common.cancel")}</MuiButton>
            <MuiButton
              color="error"
              variant="contained"
              disabled={busy || !view || !sshPortConfirm}
              onClick={() => {
                const next = sshPortConfirm;
                setSshPortConfirm(null);
                if (view && next) void queueSave({ ...view.intent, ssh_port: next });
              }}
            >
              {t("common.confirm")}
            </MuiButton>
          </Flex>
        </AppDialogContent>
      </Dialog.Root>
      <Dialog.Root open={denyConfirm} onOpenChange={(next: boolean) => { if (!next) setDenyConfirm(false); }}>
        <AppDialogContent title={t("firewall.default_deny_confirm_title")} description={t("firewall.default_deny_help")}>
          <Flex justify="end" gap="2" className="mt-4">
            <MuiButton onClick={() => setDenyConfirm(false)}>{t("common.cancel")}</MuiButton>
            <MuiButton
              color="error"
              variant="contained"
              disabled={busy || !view}
              onClick={() => {
                setDenyConfirm(false);
                if (view) void queueSave({ ...view.intent, default_deny_v4: true, default_deny_v6: true });
              }}
            >
              {t("common.confirm")}
            </MuiButton>
          </Flex>
        </AppDialogContent>
      </Dialog.Root>
      <Dialog.Root open={authOpen} onOpenChange={(next: boolean) => { if (!next) { setAuthOpen(false); setPendingSave(null); } }}>
        <AppDialogContent title={t("firewall.auth_title")} description={t("firewall.auth_help")}>
          <MuiTextField
            size="small"
            fullWidth
            sx={{ mt: 2 }}
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
            <MuiButton onClick={() => { setAuthOpen(false); setPendingSave(null); }}>{t("common.cancel")}</MuiButton>
            {passkeyAvailable ? (
              <MuiButton
                variant="outlined"
                disabled={busy || !pendingSave}
                onClick={() => pendingSave && void saveIntent(pendingSave, "", "", true).catch((err) => {
                  toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || t("common.error"));
                })}
              >
                {t("login.passkey")}
              </MuiButton>
            ) : null}
            <MuiButton
              variant="contained"
              disabled={busy || !pendingSave || (twoFaEnabled ? !authOtp.trim() : !authPassword.trim())}
              onClick={() => pendingSave && void saveIntent(pendingSave, authPassword, authOtp, false).catch((err) => {
                toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || t("common.error"));
              })}
            >
              {t("scheduled_exec.confirm")}
            </MuiButton>
          </Flex>
        </AppDialogContent>
      </Dialog.Root>
    </div>
  );
}

function RuleDialog({
  open,
  stack,
  rule,
  hasGrant,
  twoFaEnabled,
  passkeyAvailable,
  onClose,
  onSave,
}: {
  open: boolean;
  stack: "v4" | "v6";
  rule: FirewallRule | null;
  hasGrant: boolean;
  twoFaEnabled: boolean;
  passkeyAvailable: boolean;
  onClose: () => void;
  onSave: (form: RuleForm, password: string, otp: string, usePasskey: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPassword("");
    setOtp("");
    if (!rule) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      action: rule.action,
      protocol: rule.protocol,
      port: rule.port,
      source: rule.source || "",
      comment: rule.comment || "",
      priority: String(rule.priority || 100),
      enabled: rule.enabled,
    });
  }, [open, rule]);
  const submit = async (usePasskey = false) => {
    if (!form.port.trim()) {
      toast.error(t("firewall.errors.port"));
      return;
    }
    setSaving(true);
    try {
      await onSave(form, password, otp, usePasskey);
    } catch (err) {
      toast.error(localizeRemoteError(err instanceof Error ? err.message : "", t) || t("common.error"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(next: boolean) => { if (!next) onClose(); }}>
      <AppDialogContent title={rule ? t("firewall.edit") : t("firewall.create")} description={t("firewall.dialog_help", { stack: stack.toUpperCase() })}>
        <Box
          sx={{
            mt: 2,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 1.5,
          }}
        >
          <MuiTextField
            select
            size="small"
            fullWidth
            label={t("firewall.action")}
            value={form.action}
            onChange={(event) => setForm({ ...form, action: event.target.value as RuleForm["action"] })}
          >
            <MenuItem value="allow">{t("firewall.action_allow")}</MenuItem>
            <MenuItem value="deny">{t("firewall.action_deny")}</MenuItem>
          </MuiTextField>
          <MuiTextField
            select
            size="small"
            fullWidth
            label={t("firewall.protocol")}
            value={form.protocol}
            onChange={(event) => setForm({ ...form, protocol: event.target.value as RuleForm["protocol"] })}
          >
            <MenuItem value="tcp">TCP</MenuItem>
            <MenuItem value="udp">UDP</MenuItem>
            <MenuItem value="both">TCP/UDP</MenuItem>
          </MuiTextField>
          <MuiTextField
            size="small"
            fullWidth
            label={t("firewall.port")}
            value={form.port}
            onChange={(event) => setForm({ ...form, port: event.target.value })}
          />
          <MuiTextField
            size="small"
            fullWidth
            label={t("firewall.source")}
            helperText={t("firewall.source_placeholder")}
            value={form.source}
            onChange={(event) => setForm({ ...form, source: event.target.value })}
          />
          <MuiTextField
            size="small"
            fullWidth
            label={t("firewall.comment")}
            value={form.comment}
            onChange={(event) => setForm({ ...form, comment: event.target.value })}
          />
          <MuiTextField
            size="small"
            fullWidth
            label={t("firewall.priority")}
            value={form.priority}
            onChange={(event) => setForm({ ...form, priority: event.target.value })}
          />
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1.5, minHeight: 40 }}>
          <Typography sx={{ fontSize: 13.5 }}>{t("firewall.enabled")}</Typography>
          <Switch checked={form.enabled} onCheckedChange={(enabled) => setForm({ ...form, enabled })} />
        </Box>
        <MuiTextField
          size="small"
          fullWidth
          sx={{ mt: 1.5 }}
          type={twoFaEnabled ? "text" : "password"}
          label={hasGrant ? t("scheduled_exec.grant_ready") : twoFaEnabled ? t("admin.nodeTable.twoFactorCode") : t("login.password")}
          value={twoFaEnabled ? otp : password}
          onChange={(event) => {
            if (twoFaEnabled) setOtp(event.target.value.replace(/\D/g, "").slice(0, 6));
            else setPassword(event.target.value);
          }}
        />
        <Flex justify="end" gap="2" className="mt-4">
          <MuiButton onClick={onClose}>{t("common.cancel")}</MuiButton>
          <MuiButton variant="contained" disabled={saving} onClick={() => void submit(false)}>{t("common.save")}</MuiButton>
          {passkeyAvailable && !hasGrant ? (
            <MuiButton variant="outlined" disabled={saving} onClick={() => void submit(true)}>{t("login.passkey")}</MuiButton>
          ) : null}
        </Flex>
      </AppDialogContent>
    </Dialog.Root>
  );
}

function FirewallPolicySwitch({
  title,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <SettingCard title={title} className="w-auto">
      <SettingCard.Action>
        <MuiSwitch
          checked={checked}
          disabled={disabled}
          onChange={(_, next) => onChange(next)}
          color="primary"
          slotProps={{ input: { "aria-label": title } }}
        />
      </SettingCard.Action>
    </SettingCard>
  );
}

function FirewallPolicyPort({
  title,
  value,
  disabled,
  onCommit,
}: {
  title: string;
  value: string;
  disabled?: boolean;
  onCommit: (next: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    const next = draft.trim();
    if (next === value) return;
    const port = Number(next);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      toast.error(t("firewall.errors.ssh_port"));
      setDraft(value);
      return;
    }
    onCommit(String(port));
  };
  return (
    <SettingCard title={title} className="w-auto">
      <SettingCard.Action>
        <MuiTextField
          size="small"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 5))}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }
          }}
          slotProps={{ htmlInput: { inputMode: "numeric", "aria-label": title } }}
          sx={{
            width: 72,
            "& .MuiOutlinedInput-input": { padding: "6px 8px", textAlign: "center", fontSize: 14 },
          }}
        />
      </SettingCard.Action>
    </SettingCard>
  );
}

function deliveryStatusChipSx(status: string) {
  switch (status) {
    case "applied":
      return { color: "#fff", bgcolor: "#22C55E" };
    case "failed":
    case "unsupported":
      return { color: "var(--red-11)", bgcolor: "var(--red-a3)" };
    case "sent":
    case "pending":
    case "queued":
      return { color: "#0B5CAB", bgcolor: "rgba(7, 141, 238, 0.12)" };
    default:
      return { color: "text.secondary", bgcolor: "action.hover" };
  }
}

function compactIPv6(value: string) {
  if (value.length <= 22) return value;
  const segments = value.split(":");
  return segments.length > 3
    ? `${segments.slice(0, 2).join(":")}:...${segments[segments.length - 1]}`
    : value;
}

function FirewallNodePicker({
  nodes,
  onlineSet,
  available,
  onSelect,
  onPrefetch,
}: {
  nodes: readonly NodeDetail[];
  onlineSet: ReadonlySet<string>;
  available: boolean;
  onSelect: (node: NodeDetail) => void;
  onPrefetch?: (uuid: string) => void;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [statusFilters, setStatusFilters] = useState<AdminNodeStatusValue[]>([]);
  const [regionFilters, setRegionFilters] = useState<string[]>([]);
  const [groupFilters, setGroupFilters] = useState<string[]>([]);
  const orderedNodes = useMemo(() => orderRemoteExecNodes(nodes), [nodes]);
  const filteredNodes = useMemo(
    () =>
      orderedNodes.filter((node) => {
        const matchesSearch = matchesRemoteExecNode(node, query);
        const isOnline = nodeOnlineState(available, onlineSet, node.uuid);
        const matchesStatus =
          statusFilters.length === 0 ||
          isOnline === null ||
          statusFilters.includes(isOnline ? "online" : "offline");
        const matchesRegion =
          regionFilters.length === 0 ||
          regionFilters.includes(getRegionCode(node.region));
        const nodeGroup = node.group?.trim() ? node.group.trim() : "__none__";
        const matchesGroup =
          groupFilters.length === 0 || groupFilters.includes(nodeGroup);
        return matchesSearch && matchesStatus && matchesRegion && matchesGroup;
      }),
    [available, groupFilters, onlineSet, orderedNodes, query, regionFilters, statusFilters],
  );
  const pager = useAdminPagination(filteredNodes);
  useEffect(() => {
    pager.setPage(1);
  }, [groupFilters, query, regionFilters, pager.setPage, statusFilters]);

  return (
    <AdminListShell className="remote-exec-node-selector">
      <AdminNodeListFilters
        nodes={[...orderedNodes]}
        onlineSet={onlineSet}
        available={available}
        resultCount={filteredNodes.length}
        searchTerm={query}
        onSearchTermChange={setQuery}
        statusFilters={statusFilters}
        onStatusFiltersChange={setStatusFilters}
        regionFilters={regionFilters}
        onRegionFiltersChange={setRegionFilters}
        groupFilters={groupFilters}
        onGroupFiltersChange={setGroupFilters}
        searchPlaceholder={t("exec.nodeSearchPlaceholder")}
      />
      {filteredNodes.length === 0 ? (
        <Box className="km-admin-list-empty">{t("common.no_results")}</Box>
      ) : isMobile ? (
        <>
          <AdminMobileCardStack>
            {pager.pageItems.map((node) => {
              const online = nodeOnlineState(available, onlineSet, node.uuid);
              return (
                <div
                  key={node.uuid}
                  className="remote-exec-node-row"
                  onClick={() => onSelect(node)}
                  onPointerEnter={() => onPrefetch?.(node.uuid)}
                  onFocus={() => onPrefetch?.(node.uuid)}
                >
                  <AdminMobileListCard
                    title={<FirewallNodeIdentity node={node} online={online} />}
                    cells={[
                      [t("terminal.ip_address"), <FirewallNodeAddresses key="net" node={node} />],
                      [t("common.group"), node.group || "--"],
                      [t("admin.nodeTable.tags", "标签"), (node.tags || "").trim() ? <CustomTags tags={node.tags || ""} /> : "--"],
                    ]}
                    actions={
                      <MuiButton size="small" variant="outlined" sx={ADMIN_LIST_OUTLINE_SX} onClick={() => onSelect(node)}>
                        {t("common.manage")}
                      </MuiButton>
                    }
                  />
                </div>
              );
            })}
          </AdminMobileCardStack>
          <AdminPagination
            page={pager.page}
            total={filteredNodes.length}
            pageSize={pager.pageSize}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
            showSummary={false}
          />
        </>
      ) : (
        <>
          <div className="admin-responsive-table-wrap remote-exec-node-table-wrap overflow-x-auto overflow-y-hidden">
            <Table container={false} className="admin-responsive-table remote-exec-node-table min-w-[880px] table-fixed text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">{t("admin.nodeTable.name")}</TableHead>
                  <TableHead className="w-[26%]">{t("terminal.ip_address")}</TableHead>
                  <TableHead className="w-[16%]">{t("common.group")}</TableHead>
                  <TableHead className="w-[22%]">{t("admin.nodeTable.tags", "标签")}</TableHead>
                  <TableHead className="w-[14%] text-center">{t("common.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageItems.map((node) => {
                  const online = nodeOnlineState(available, onlineSet, node.uuid);
                  return (
                    <TableRow
                      key={node.uuid}
                      className="remote-exec-node-row [&>td]:align-middle [&>td]:py-1.5"
                      onClick={() => onSelect(node)}
                      onPointerEnter={() => onPrefetch?.(node.uuid)}
                      onFocus={() => onPrefetch?.(node.uuid)}
                    >
                      <TableCell className="overflow-hidden" data-label={t("admin.nodeTable.name")}>
                        <FirewallNodeIdentity node={node} online={online} />
                      </TableCell>
                      <TableCell data-label={t("terminal.ip_address")}>
                        <FirewallNodeAddresses node={node} />
                      </TableCell>
                      <TableCell className="min-w-0 overflow-hidden" data-label={t("common.group")}>
                        <span className="admin-cell-clip font-normal text-muted-foreground" title={node.group || ""}>
                          {node.group || "--"}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-0 overflow-hidden" data-label={t("admin.nodeTable.tags", "标签")}>
                        {(node.tags || "").trim() ? (
                          <div className="admin-cell-clip-row" title={node.tags || ""}>
                            <CustomTags tags={node.tags || ""} />
                          </div>
                        ) : (
                          <span className="admin-cell-clip text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center" data-label={t("common.action")}>
                        <MuiButton
                          size="small"
                          variant="outlined"
                          sx={{ ...ADMIN_LIST_OUTLINE_SX, height: 32, minHeight: 32 }}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(node);
                          }}
                        >
                          {t("common.manage")}
                        </MuiButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <AdminPagination
            page={pager.page}
            total={filteredNodes.length}
            pageSize={pager.pageSize}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
            showSummary={false}
          />
        </>
      )}
    </AdminListShell>
  );
}

function FirewallNodeIdentity({
  node,
  online,
}: {
  node: NodeDetail;
  online: boolean | null;
}) {
  const { t } = useTranslation();
  const flag = node.region_override?.trim() || node.region?.trim() || "UN";
  return (
    <div className="remote-exec-node-identity">
      <span className="remote-exec-node-flag">
        <Flag flag={flag} compact />
      </span>
      <div className="min-w-0">
        <strong title={node.name}>{node.name}</strong>
        <span
          className={`remote-exec-node-status ${online ? "is-online" : "is-offline"}`}
          aria-hidden={online === null || undefined}
          style={online === null ? { visibility: "hidden" } : undefined}
        >
          <span aria-hidden="true" />
          {online ? t("nodeCard.online") : t("nodeCard.offline")}
        </span>
      </div>
    </div>
  );
}

function FirewallNodeAddresses({ node }: { node: NodeDetail }) {
  const addresses = (
    [
      ["IPv4", node.ipv4?.trim()],
      ["IPv6", node.ipv6?.trim()],
    ] as const
  ).filter(
    (entry): entry is readonly ["IPv4" | "IPv6", string] => Boolean(entry[1]),
  );
  return (
    <div className="remote-exec-node-addresses">
      {addresses.length > 0 ? addresses.map(([type, address]) => (
        <div
          key={type}
          className="remote-exec-node-address"
          title={address || undefined}
        >
          <span>{type}</span>
          <code>{type === "IPv6" ? compactIPv6(address) : address}</code>
        </div>
      )) : <span className="text-muted-foreground">--</span>}
    </div>
  );
}
