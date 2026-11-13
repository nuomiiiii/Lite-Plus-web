import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import MuiButton from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import MuiSwitch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { toast } from "sonner";
import { AdminListFiltersBar, AdminListSearch, AdminListShell } from "@/components/admin/AdminListShell";
import { AdminMobileCardStack, AdminMobileListCard } from "@/components/admin/AdminMobileListCard";
import { AdminPagination, useAdminPagination } from "@/components/admin/AdminPagination";
import { AdminSheetTabs } from "@/components/admin/AdminSheetTabs";
import { SettingCard } from "@/components/admin/SettingCard";
import SettingsPageSkeleton from "@/components/admin/SettingsPageSkeleton";
import { AppDialogContent, Callout, Dialog } from "@/components/admin/ui";
import { ADMIN_LIST_ACTION_SX, ADMIN_LIST_OUTLINE_SX } from "@/components/admin/adminListLayout";
import { Plus, RefreshCw, Shield } from "@/components/admin/muiIcons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { createRandomId } from "@/utils/randomId";
import { localizeRemoteError } from "@/utils/remoteSession";
import { deleteProtectionGroup, fetchProtectionView, postProtection, saveProtectionConfig, saveProtectionGroup } from "./api";
import { getProtectionViewSnapshot, rememberProtectionView, resolveProtectionView } from "./prefetch";
import { defaultSshSource, duplicateSshSource, normalizeProtectionConfig, protectionActivityRows, protectionSshConfigError, type ServicePort } from "./model";
import EnvironmentDialog from "./EnvironmentDialog";
import ActivityPanel from "./ActivityPanel";
import GroupsPanel from "./GroupsPanel";
import WhitelistPanel from "./WhitelistPanel";
import ProtectionEmptyState from "./ProtectionEmptyState";
import ProtectionHint from "./ProtectionHint";
import LogSourcesPanel from "./LogSourcesPanel";
import PolicyEditor from "./PolicyEditor";
import SourceEditor from "./SourceEditor";
import type { ProtectionBan, ProtectionConfig, ProtectionLogSource, ProtectionPolicy, ProtectionView } from "./types";

type Props = {
  uuid: string; active: boolean; readOnly: boolean; busy: boolean; setBusy: (next: boolean) => void; pageID: string;
  rememberGrant: (grant?: string, expiresAt?: string) => void;
  queueAuth: (run: (grant: string) => Promise<void>) => Promise<void>;
  ports: ServicePort[]; target?: ServicePort | null; onTargetHandled: () => void;
  sshPort: string;
};

function emptyPolicy(port?: ServicePort): ProtectionPolicy {
  return { id: createRandomId(), name: port?.name ?? "", enabled: true, mode: "observe", protocol: port?.protocol ?? "tcp", port: port?.port ?? "443",
    ban_duration_sec: 600, syn_rate: 0, syn_burst: 0, conn_limit: 0, request_window_sec: 60, request_threshold: 0, path_window_sec: 60, path_threshold: 0, paths: [] };
}

export default function ServiceProtectionSection({ uuid, active, readOnly, busy, setBusy, pageID, rememberGrant, queueAuth, ports, target, onTargetHandled, sshPort }: Props) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const [view, setView] = useState<ProtectionView | null>(() => getProtectionViewSnapshot(uuid));
  const [loading, setLoading] = useState(() => !getProtectionViewSnapshot(uuid));
  const [loadError, setLoadError] = useState("");
  const request = useRef<AbortController | null>(null);
  const [tab, setTab] = useState("services");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<{ policy: ProtectionPolicy; isNew: boolean } | null>(null);
  const [source, setSource] = useState<ProtectionLogSource | null>(null);
  const [preview, setPreview] = useState<ProtectionView["preview"]>();
  const [previewError, setPreviewError] = useState("");
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [unban, setUnban] = useState<ProtectionBan | null>(null);
  const [removing, setRemoving] = useState<{ kind: "policy" | "source" | "group"; id: string } | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupCreateOpen, setGroupCreateOpen] = useState(false);
  const text = (key: string) => t(`firewall.protection.${key}`);

  const load = useCallback(async (background = false) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(!background); if (!background) setLoadError("");
    try {
      const data = background
        ? await fetchProtectionView(uuid, controller.signal)
        : await resolveProtectionView(uuid, controller.signal);
      if (!controller.signal.aborted) {
        rememberProtectionView(uuid, data);
        setView(data);
        setLoadError("");
      }
    }
    catch (err) { if (!controller.signal.aborted) setLoadError(String((err as Error).message || err)); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [uuid]);
  useEffect(() => { void load(Boolean(getProtectionViewSnapshot(uuid))); return () => request.current?.abort(); }, [load]);
  useEffect(() => {
    if (!active || !view?.upgrade?.id || !["precheck", "install", "enable", "verify"].includes(view.upgrade.phase ?? "")) return;
    const check = () => { if (document.visibilityState === "visible" && !busy) void load(true); };
    const timer = window.setInterval(check, 4000);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [active, view, busy, load]);

  const config = useMemo(() => normalizeProtectionConfig(view?.config), [view?.config]);
  const policies = config.policies;
  const sources = config.sources;
  const sshConfigError = useMemo(() => protectionSshConfigError(config), [config]);
  const groups = view?.groups ?? [];
  const cap = view?.capability;
  const emptySource = (format?: string): ProtectionLogSource => format === "sshd"
    ? defaultSshSource(createRandomId(), sshPort, cap?.sshd_log_path)
    : { id: createRandomId(), format: format || "nginx_combined", path: "", deploy_mode: "direct", bind_protocol: "tcp", bind_port: "443" };
  const linux = Boolean(view?.linux);
  const agentOld = view?.unavailable === "agent_old";
  const ready = Boolean(cap?.runtime_ready && cap?.runtime_enabled);
  const locked = readOnly || busy || loading || !view?.supported || agentOld;
  useEffect(() => {
    if (!target || !view) return;
    const existing = view.config?.policies?.find((item) => item.protocol === target.protocol && item.port === target.port);
    setTab("services"); setEditor({ policy: existing ?? emptyPolicy(target), isNew: !existing }); onTargetHandled();
  }, [target, view, onTargetHandled]);

  const applyView = (data: ProtectionView) => {
    request.current?.abort(); setLoading(false); setLoadError("");
    if (data.next_grant) rememberGrant(data.next_grant, data.expires_at);
    rememberProtectionView(uuid, data);
    setView(data);
  };
  const runGranted = async (task: (grant: string) => Promise<ProtectionView>, done?: () => void) => {
    await queueAuth(async (grant) => {
      setBusy(true); request.current?.abort(); setLoading(false);
      try { applyView(await task(grant)); done?.(); } finally { setBusy(false); }
    });
  };
  const saveConfig = (config: ProtectionConfig, done?: () => void) => {
    void runGranted(async (grant) => {
      const data = await saveProtectionConfig(uuid, grant, pageID, { ...config, enabled: Boolean(config.enabled), runtime_enabled: Boolean(cap?.runtime_enabled || cap?.runtime_ready) });
      toast.success(t(data.delivery_status === "applied" ? "firewall.protection.saved" : "firewall.protection.saved_pending"));
      return data;
    }, done);
  };
  const openSource = (item: ProtectionLogSource) => { setPreview(undefined); setPreviewError(""); setSource(item); };
  const previewSource = (item: ProtectionLogSource) => {
    setPreview(undefined); setPreviewError("");
    void runGranted(async (grant) => {
      // A source ID would make the Agent use its saved path instead of the edited path.
      const data = await postProtection(uuid, "/preview", "POST", { grant, page_id: pageID, path: item.path, format: item.format });
      setPreview(data.preview ?? []); setPreviewError(data.preview_error ?? ""); return data;
    });
  };
  const filtered = useMemo(() => policies.filter((item) => `${item.name ?? ""} ${item.protocol} ${item.port}`.toLowerCase().includes(query.trim().toLowerCase())), [policies, query]);
  const pager = useAdminPagination(filtered);
  const detection = (policy: ProtectionPolicy) => [policy.syn_rate || policy.conn_limit ? text("connection_protection") : "", policy.request_threshold || policy.path_threshold ? text("log_detection") : ""].filter(Boolean).join(" + ") || text("not_enabled");
  const status = (policy: ProtectionPolicy) => !config.enabled || !policy.enabled ? text("paused") : !ready ? text("waiting_environment") : view?.delivery_status ? t(`firewall.delivery_${view.delivery_status}`, { defaultValue: view.delivery_status }) : text("waiting_environment");
  const editActions = (policy: ProtectionPolicy) => <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: mobile ? "flex-start" : "center" }}>
    <MuiButton size="small" disabled={busy} onClick={() => setEditor({ policy, isNew: false })}>{t("common.edit")}</MuiButton>
    <MuiButton size="small" color="error" disabled={locked} onClick={() => setRemoving({ kind: "policy", id: policy.id })}>{t("common.delete")}</MuiButton>
  </Stack>;
  const policySwitch = (policy: ProtectionPolicy) => <MuiSwitch checked={policy.enabled} disabled={locked} slotProps={{ input: { "aria-label": `${text("policy_enabled")} ${policy.name || policy.port}` } }} onChange={(_, enabled) => saveConfig({ ...config, policies: policies.map((item) => item.id === policy.id ? { ...item, enabled } : item) })} />;
  const modeChip = (policy: ProtectionPolicy) => <Chip size="small" color={policy.mode === "observe" ? "info" : "success"} label={text(policy.mode)} />;

  if (!view && loading) return <SettingsPageSkeleton inline />;
  if (!view) return <Callout.Root color="red" role="alert"><Stack spacing={1}><Callout.Text>{localizeRemoteError(loadError, t)}</Callout.Text><MuiButton onClick={() => void load()}>{t("firewall.refresh")}</MuiButton></Stack></Callout.Root>;
  return <Stack spacing={2} useFlexGap sx={{ minWidth: 0 }} aria-busy={active && (busy || loading) ? true : undefined}>
    {loadError ? <Callout.Root color="red" role="alert"><Callout.Text>{localizeRemoteError(loadError, t)}</Callout.Text><MuiButton onClick={() => void load()}>{t("firewall.refresh")}</MuiButton></Callout.Root> : null}
    {agentOld ? <Callout.Root color="orange" role="alert"><Callout.Text>{t("firewall.protection.need_agent")}</Callout.Text></Callout.Root> : null}
    {!linux && !agentOld ? <Callout.Root color="orange" role="status"><Callout.Text>{t("firewall.protection.linux_only")}</Callout.Text></Callout.Root> : null}
    {view.delivery_error ? <Callout.Root color="red" role="alert"><Callout.Text>{localizeRemoteError(view.delivery_error, t)}</Callout.Text></Callout.Root> : null}
    {sshConfigError ? <Callout.Root color="red" role="alert"><Callout.Text>{text("ssh_config_invalid")} {text(sshConfigError)}</Callout.Text></Callout.Root> : null}
    <SettingCard><Stack direction="row" spacing={1.5} useFlexGap sx={{ width: "100%", flexWrap: "wrap", alignItems: "center", "& .MuiTypography-root, & .MuiChip-label": { transform: "translateY(1px)" } }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexShrink: 0, minHeight: 24, order: 1 }}>
        <MuiSwitch checked={config.enabled} disabled={locked} sx={{ flexShrink: 0 }} slotProps={{ input: { "aria-label": text("enabled") } }} onChange={(_, enabled) => saveConfig({ ...config, enabled })} />
        <Typography component="span" variant="body2" sx={{ lineHeight: "24px" }}>{text("enabled")}</Typography>
      </Stack>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center", order: { xs: 3, sm: 2 }, flexBasis: { xs: "100%", sm: "auto" } }}>
        <Chip size="small" sx={{ height: 24, fontSize: 14, lineHeight: "24px" }} color={ready ? "success" : "warning"} label={ready ? text("ready") : text("waiting_environment")} />
        {view.delivery_status ? <Chip size="small" sx={{ height: 24, fontSize: 14, lineHeight: "24px" }} label={t(`firewall.delivery_${view.delivery_status}`, { defaultValue: view.delivery_status })} /> : null}
      </Stack>
      <MuiButton size="small" sx={{ ml: "auto", flexShrink: 0, whiteSpace: "nowrap", order: { xs: 2, sm: 3 } }} onClick={() => setEnvironmentOpen(true)}>{text("check_environment")}</MuiButton>
    </Stack></SettingCard>
    <AdminSheetTabs className="firewall-protection-tabs"><Tabs value={tab} onChange={(_, next: string) => setTab(next)} variant="scrollable" scrollButtons={false} aria-label={text("tab")} sx={{ "& .MuiTabs-scrollButtons": { display: "none" } }}>
      {[
        { value: "services", label: text("policy_list"), count: policies.length },
        { value: "bans", label: text("bans"), count: protectionActivityRows(view).length },
        { value: "sources", label: text("sources"), count: sources.length },
        { value: "groups", label: text("groups"), count: groups.length },
        { value: "whitelist", label: text("whitelist_tab"), count: config.whitelist.length },
      ].map((item) => <Tab key={item.value} value={item.value} label={<Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, whiteSpace: "nowrap", color: "inherit" }}>{item.label}{item.count !== undefined ? <Box component="span" sx={{ fontWeight: 400, opacity: 0.72, fontVariantNumeric: "tabular-nums" }}>{item.count}</Box> : null}</Box>} />)}
    </Tabs></AdminSheetTabs>
    {tab === "services" ? <>
      <AdminListShell><AdminListFiltersBar><Stack direction="row" spacing={1} useFlexGap sx={{ width: "100%", flexWrap: "wrap", alignItems: "center" }}>
        <AdminListSearch value={query} onChange={(value) => { setQuery(value); pager.setPage(1); }} placeholder={text("search_services")} />
        <MuiButton variant="contained" startIcon={<Plus size={16} />} disabled={locked} sx={ADMIN_LIST_ACTION_SX} onClick={() => setEditor({ policy: emptyPolicy(), isNew: true })}>{text("create_policy")}</MuiButton>
        <MuiButton variant="outlined" startIcon={<RefreshCw size={16} />} disabled={busy || loading} sx={ADMIN_LIST_OUTLINE_SX} onClick={() => void load()}>{t("firewall.refresh")}</MuiButton>
      </Stack></AdminListFiltersBar>
        {!filtered.length ? <ProtectionEmptyState icon={<Shield size={28} />}>{query.trim() ? t("common.no_results") : text("empty_policies")}</ProtectionEmptyState> : mobile ? <AdminMobileCardStack>{pager.pageItems.map((policy) => <AdminMobileListCard key={policy.id} title={policy.name || `${policy.protocol.toUpperCase()} ${policy.port}`} headerExtra={policySwitch(policy)} cells={[
          [t("firewall.port"), `${policy.protocol.toUpperCase()} ${policy.port}`], [text("mode"), modeChip(policy)], [text("detection"), detection(policy)], [text("run_status"), status(policy)], [text("group"), groups.find((item) => item.id === policy.group_id)?.name || text("local_only")],
        ]} actions={editActions(policy)} />)}</AdminMobileCardStack> : <Table container={false} className="admin-responsive-table min-w-[760px]"><TableHeader><TableRow>
          {[t("firewall.enabled"), text("service_info"), t("firewall.port"), text("detection"), text("mode"), text("run_status")].map((label) => <TableHead key={label}>{label}</TableHead>)}<TableHead style={{ textAlign: "center" }}>{t("common.action")}</TableHead>
        </TableRow></TableHeader><TableBody>{pager.pageItems.map((policy) => <TableRow key={policy.id}><TableCell>{policySwitch(policy)}</TableCell><TableCell><Typography variant="body2" sx={{ fontWeight: 600 }}>{policy.name || "—"}</Typography><Typography variant="caption" color="text.secondary">{groups.find((item) => item.id === policy.group_id)?.name || text("local_only")}</Typography></TableCell><TableCell>{policy.protocol.toUpperCase()} {policy.port}</TableCell><TableCell>{detection(policy)}</TableCell><TableCell>{modeChip(policy)}</TableCell><TableCell>{status(policy)}</TableCell><TableCell>{editActions(policy)}</TableCell></TableRow>)}</TableBody></Table>}
        <AdminPagination page={pager.page} total={filtered.length} pageSize={pager.pageSize} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} showSummary={false} showWhenEmpty />
      </AdminListShell>
      <ProtectionHint>{text("enforce_help")}</ProtectionHint>
    </> : tab === "sources" ? <LogSourcesPanel sources={sources} stats={view.source_stats} policies={policies} disabled={locked} busy={busy}
      onCreate={(format) => { if (format === "sshd" && sources.some((item) => item.format === "sshd")) { toast.error(text("ssh_duplicate_source")); return; } openSource(emptySource(format)); }} onInspect={openSource}
      onDelete={(item) => { if (policies.some((policy) => policy.source_id === item.id)) { toast.error(text("source_in_use")); return; } setRemoving({ kind: "source", id: item.id }); }} /> : tab === "bans" ?
      <ActivityPanel view={view} disabled={locked} refreshing={busy || loading} onRefresh={() => void load()} onUnban={setUnban} /> : tab === "groups" ?
      <GroupsPanel groups={groups} uuid={uuid} ready={ready} disabled={locked}
        onCreate={() => { setGroupName(""); setGroupCreateOpen(true); }}
        onMembership={(group, join) => void runGranted((grant) => saveProtectionGroup(uuid, grant, pageID, { id: group.id, name: group.name, enabled: group.enabled, members: join ? [...new Set([...(group.members ?? []).map((member) => member.uuid), uuid])] : (group.members ?? []).map((member) => member.uuid).filter((id) => id !== uuid) }))}
        onDelete={(group) => setRemoving({ kind: "group", id: group.id })} /> :
      <WhitelistPanel addresses={config.whitelist} disabled={locked} busy={busy}
        onSave={(whitelist, done) => saveConfig({ ...config, whitelist }, done)} />}
    <Dialog.Root mobileSheet open={active && groupCreateOpen} onOpenChange={(open: boolean) => { if (!open && !busy) setGroupCreateOpen(false); }}>
      <AppDialogContent title={text("create_group")} maxWidth="420px">
        <Stack component="form" spacing={2.5} sx={{ mt: 2 }} onSubmit={(event) => {
          event.preventDefault();
          if (locked || !groupName.trim()) return;
          void runGranted((grant) => saveProtectionGroup(uuid, grant, pageID, { name: groupName.trim(), enabled: true, members: ready ? [uuid] : [] }), () => { setGroupCreateOpen(false); setGroupName(""); });
        }}>
          <TextField size="small" fullWidth label={text("group_name")} value={groupName} disabled={locked} onChange={(event) => setGroupName(event.target.value)} />
          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
            <MuiButton disabled={busy} onClick={() => setGroupCreateOpen(false)} sx={ADMIN_LIST_OUTLINE_SX}>{t("common.cancel")}</MuiButton>
            <MuiButton type="submit" variant="contained" disabled={locked || !groupName.trim()} sx={ADMIN_LIST_ACTION_SX}>{text("create_group")}</MuiButton>
          </Stack>
        </Stack>
      </AppDialogContent>
    </Dialog.Root>
    {editor ? <PolicyEditor key={editor.policy.id} open={active} policy={editor.policy} isNew={editor.isNew} ports={ports} sources={sources} groups={groups} disabled={locked} busy={busy}
      onCancel={() => setEditor(null)} onInspect={openSource} onSave={(next) => saveConfig({ ...config, policies: editor.isNew ? [...policies, ...next] : policies.flatMap((item) => item.id === editor.policy.id ? next : [item]) }, () => setEditor(null))} /> : null}
    {source ? <SourceEditor key={source.id} source={source} suggestedSshPath={cap?.sshd_log_path} suggestedSshPort={sshPort} blockSshd={duplicateSshSource(sources, { ...source, format: "sshd" })} disabled={locked} busy={busy} preview={preview} previewError={previewError} onClose={() => setSource(null)} onPreview={previewSource} onSave={(next) => { if (duplicateSshSource(sources, next)) { toast.error(text("ssh_duplicate_source")); return; } saveConfig({ ...config, sources: sources.some((item) => item.id === next.id) ? sources.map((item) => item.id === next.id ? next : item) : [...sources, next], policies: next.deploy_mode === "proxy" ? policies.map((item) => item.source_id === next.id ? { ...item, mode: "observe" } : item) : policies }, () => setSource(null)); }} /> : null}
    <EnvironmentDialog open={environmentOpen} view={view} busy={busy} loading={loading} readOnly={readOnly} onClose={() => setEnvironmentOpen(false)} onPrecheck={() => {
        setBusy(true); request.current?.abort(); setLoading(false);
        void postProtection(uuid, "/precheck", "POST", {}).then(applyView).catch((err) => toast.error(localizeRemoteError(String(err.message), t))).finally(() => setBusy(false));
      }} onUpgrade={() => void runGranted(async (grant) => { const data = await postProtection(uuid, "/upgrade", "POST", { grant, page_id: pageID }); toast.success(text("upgrade_pending")); return data; })} />
    <Dialog.Root mobileSheet open={unban !== null} onOpenChange={(open: boolean) => { if (!open && !busy) setUnban(null); }}><AppDialogContent title={text(unban?.group_id ? "unban_group" : "unban_local")}><Stack spacing={2} sx={{ mt: 2 }}><Typography sx={{ overflowWrap: "anywhere", fontWeight: 600 }}>{unban?.ip}</Typography><Typography variant="body2">{text(unban?.group_id ? "unban_group_help" : "unban_local_help")}</Typography><Typography variant="body2" color="text.secondary">{unban?.group_id ? groups.find((item) => item.id === unban.group_id)?.members?.map((member) => member.name || member.uuid).join("、") || unban.group_id : view.name}</Typography><Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}><MuiButton disabled={busy} onClick={() => setUnban(null)}>{t("common.cancel")}</MuiButton><MuiButton variant="contained" disabled={locked} onClick={() => { if (!unban) return; const ban = unban; void runGranted((grant) => postProtection(uuid, "/unban", "POST", { grant, page_id: pageID, ip: ban.ip, ...(ban.group_id ? { group_id: ban.group_id } : { local: true }) }), () => setUnban(null)); }}>{t("firewall.protection.unban")}</MuiButton></Stack></Stack></AppDialogContent></Dialog.Root>
    <Dialog.Root mobileSheet open={removing !== null} onOpenChange={(open: boolean) => { if (!open && !busy) setRemoving(null); }}><AppDialogContent title={t("common.delete")} description={text("delete_confirm")}><Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: "flex-end" }}><MuiButton disabled={busy} onClick={() => setRemoving(null)}>{t("common.cancel")}</MuiButton><MuiButton variant="contained" color="error" disabled={locked} onClick={() => {
      if (!removing) return;
      if (removing.kind === "group") void runGranted((grant) => deleteProtectionGroup(uuid, grant, pageID, removing.id), () => setRemoving(null));
      else saveConfig({ ...config, ...(removing.kind === "policy" ? { policies: policies.filter((item) => item.id !== removing.id) } : { sources: sources.filter((item) => item.id !== removing.id) }) }, () => setRemoving(null));
    }}>{t("common.delete")}</MuiButton></Stack></AppDialogContent></Dialog.Root>
  </Stack>;
}
