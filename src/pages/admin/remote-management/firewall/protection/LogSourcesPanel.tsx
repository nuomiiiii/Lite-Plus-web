import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { AdminListFiltersBar, AdminListSearch, AdminListShell } from "@/components/admin/AdminListShell";
import { AdminMobileCardStack } from "@/components/admin/AdminMobileListCard";
import { AdminPagination, useAdminPagination } from "@/components/admin/AdminPagination";
import { ADMIN_LIST_ACTION_SX, ADMIN_LIST_OUTLINE_SX } from "@/components/admin/adminListLayout";
import { File, Info, Plus } from "@/components/admin/muiIcons";
import ProtectionHint from "./ProtectionHint";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatProtectionDateTime } from "./model";
import type { ProtectionLogSource, ProtectionPolicy, ProtectionView } from "./types";
import ProtectionEmptyState from "./ProtectionEmptyState";

type Props = {
  sources: ProtectionLogSource[];
  stats: ProtectionView["source_stats"];
  policies: ProtectionPolicy[];
  disabled: boolean;
  busy: boolean;
  onCreate: (format?: string) => void;
  onInspect: (source: ProtectionLogSource) => void;
  onDelete: (source: ProtectionLogSource) => void;
};

export default function LogSourcesPanel({ sources, stats, policies, disabled, busy, onCreate, onInspect, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  const mobile = useIsMobile();
  const text = (key: string) => t(`firewall.protection.${key}`);
  const hasSshd = sources.some((item) => item.format === "sshd");
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const filtered = sources.filter((item) => {
    const linked = policies.filter((policy) => policy.source_id === item.id);
    return [item.path, item.format, item.bind_protocol, item.bind_port, item.deploy_mode, ...linked.map((policy) => `${policy.name ?? ""} ${policy.protocol} ${policy.port}`)].join(" ").toLowerCase().includes(search);
  });
  const pager = useAdminPagination(filtered);
  const sourceInfo = (item: ProtectionLogSource) => <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start", minWidth: 0 }}>
    <Box sx={{ display: "flex", color: "primary.main", pt: 0.25 }}><File size={19} /></Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{text(item.format === "caddy_json" ? "source_format_caddy" : item.format === "sshd" ? "source_format_sshd" : `source_format_${item.format}`)}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, overflowWrap: "anywhere", whiteSpace: "normal" }}>{item.path}</Typography>
    </Box>
  </Stack>;
  const binding = (item: ProtectionLogSource) => {
    const linked = policies.filter((policy) => policy.source_id === item.id);
    return <Stack spacing={0.75} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
        <Chip size="small" variant="outlined" label={`${item.bind_protocol?.toUpperCase() || "—"} ${item.bind_port || "—"}`} />
        <Chip size="small" color={item.deploy_mode === "proxy" ? "warning" : "default"} label={text(item.deploy_mode === "proxy" ? "deploy_proxy" : "deploy_direct")} />
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{linked.length ? linked.map((policy) => policy.name || `${policy.protocol.toUpperCase()} ${policy.port}`).join(" · ") : text("source_no_policy")}</Typography>
    </Stack>;
  };
  const metrics = (item: ProtectionLogSource) => {
    const sourceStats = stats?.find((row) => row.id === item.id);
    return sourceStats ? <Box aria-label={text("source_stats")} sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: 1.5, rowGap: 1.25 }}>
      {[
        { label: text("parsed"), value: sourceStats.parsed ?? 0 },
        { label: text("errors"), value: sourceStats.errors ?? 0, color: sourceStats.errors ? "error.main" : "text.primary" },
        { label: text("lag"), value: `${sourceStats.lag_ms ?? 0} ms` },
        { label: text("dropped"), value: sourceStats.dropped ?? 0 },
        { label: text("queue_dropped"), value: sourceStats.queue_dropped ?? 0, color: sourceStats.queue_dropped ? "warning.main" : "text.primary" },
      ].map((metric) => <Box key={metric.label} sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary" sx={{ display: "block", whiteSpace: "normal" }}>{metric.label}</Typography><Typography variant="body2" sx={{ mt: 0.25, fontWeight: 600, color: metric.color, fontVariantNumeric: "tabular-nums" }}>{typeof metric.value === "number" ? metric.value.toLocaleString(i18n.resolvedLanguage) : metric.value}</Typography></Box>)}
    </Box> : <Typography variant="body2" color="text.secondary">{text("no_read_status")}</Typography>;
  };
  const lastRead = (item: ProtectionLogSource) => {
    const at = stats?.find((row) => row.id === item.id)?.last_read_at;
    return <Typography variant="body2" component="time" dateTime={at} title={at} sx={{ display: "block", whiteSpace: "normal", fontVariantNumeric: "tabular-nums" }}>{at ? (formatProtectionDateTime(at) || at) : text("no_read_status")}</Typography>;
  };
  const actions = (item: ProtectionLogSource) => <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap", justifyContent: mobile ? "flex-start" : "center" }}><Button size="small" disabled={busy} onClick={() => onInspect(item)}>{text("inspect_source")}</Button><Button size="small" color="error" disabled={disabled} onClick={() => onDelete(item)}>{t("common.delete")}</Button></Stack>;

  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <AdminListShell>
      <AdminListFiltersBar><Stack direction="row" spacing={1} useFlexGap sx={{ width: "100%", alignItems: "center", flexWrap: "wrap" }}>
        <AdminListSearch value={query} onChange={(value) => { setQuery(value); pager.setPage(1); }} placeholder={text("search_sources")} />
        <Button variant="contained" startIcon={<Plus size={16} />} sx={ADMIN_LIST_ACTION_SX} disabled={disabled} onClick={() => onCreate()}>{text("create_source")}</Button>
      </Stack></AdminListFiltersBar>
    {!sources.length ? <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2.5 }}>
        <Box sx={{ display: "flex", p: 1.25, borderRadius: "8px", bgcolor: "action.hover", color: "primary.main" }}><File size={24} /></Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{text("sources_empty_title")}</Typography>
          <Typography variant="body2" color="text.secondary">{text("sources_intro")}</Typography>
        </Box>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(3, minmax(0, 1fr))" }, gap: 1.5 }}>
        {[
          { name: "SSH", format: "sshd", label: "sshd / journal" },
          { name: "Nginx", format: "nginx_combined", label: "combined / JSON" },
          { name: "Caddy", format: "caddy_json", label: "JSON" },
        ].map((item) => <Box key={item.name} sx={{ p: 2, borderRadius: "8px", bgcolor: "action.hover", minWidth: 0 }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", mb: 1.5 }}>
            <Typography sx={{ fontWeight: 600 }}>{item.name}</Typography><Typography variant="caption" color="text.secondary">{item.label}</Typography>
          </Stack>
          <Button fullWidth variant="outlined" startIcon={<Plus size={16} />} disabled={disabled || (item.format === "sshd" && hasSshd)} sx={ADMIN_LIST_OUTLINE_SX} onClick={() => onCreate(item.format)}>{t("firewall.protection.sources_connect", { name: item.name })}</Button>
        </Box>)}
      </Box>
    </Box> : !filtered.length ? <ProtectionEmptyState icon={<File size={28} />}>{t("common.no_results")}</ProtectionEmptyState> : <>
      {mobile ? <AdminMobileCardStack>{pager.pageItems.map((item) => <Box key={item.id} sx={{ border: 1, borderColor: "divider", borderRadius: "8px", overflow: "hidden" }}>
        <Box sx={{ p: 1.5, bgcolor: "action.hover" }}>{sourceInfo(item)}</Box>
        <Stack spacing={1.5} sx={{ p: 1.5 }}>
          {binding(item)}
          <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1.5 }}>{metrics(item)}</Box>
          <Box><Typography variant="caption" color="text.secondary">{text("last_read")}</Typography>{lastRead(item)}</Box>
        </Stack>
        <Box sx={{ px: 1, py: 0.75, borderTop: 1, borderColor: "divider" }}>{actions(item)}</Box>
      </Box>)}</AdminMobileCardStack> : <Table container={false} className="admin-responsive-table" style={{ tableLayout: "fixed" }}>
        <colgroup><col style={{ width: "25%" }} /><col style={{ width: "23%" }} /><col style={{ width: "26%" }} /><col style={{ width: "14%" }} /><col style={{ width: "12%" }} /></colgroup>
        <TableHeader><TableRow>{[text("sources"), text("source_service"), text("source_stats"), text("last_read")].map((label) => <TableHead key={label}>{label}</TableHead>)}<TableHead style={{ textAlign: "center" }}>{t("common.action")}</TableHead></TableRow></TableHeader>
        <TableBody>{pager.pageItems.map((item) => <TableRow key={item.id}><TableCell><Box sx={{ py: 1 }}>{sourceInfo(item)}</Box></TableCell><TableCell>{binding(item)}</TableCell><TableCell>{metrics(item)}</TableCell><TableCell>{lastRead(item)}</TableCell><TableCell>{actions(item)}</TableCell></TableRow>)}</TableBody>
      </Table>}
    </>}
      <AdminPagination page={pager.page} total={filtered.length} pageSize={pager.pageSize} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} showSummary={false} showWhenEmpty />
    </AdminListShell>
    <ProtectionHint>{text("sources_tcp_help")}</ProtectionHint>
    <ProtectionHint icon={<Info size={16} />}>{text("sources_scope_host")} · {text("sources_scope_excluded")}</ProtectionHint>
  </Stack>;
}
