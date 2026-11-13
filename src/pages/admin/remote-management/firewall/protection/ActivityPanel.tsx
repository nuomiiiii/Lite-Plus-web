import { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { AdminListFiltersBar, AdminListSearch, AdminListSelect, AdminListShell } from "@/components/admin/AdminListShell";
import { AdminMobileCardStack, AdminMobileListCard } from "@/components/admin/AdminMobileListCard";
import { AdminPagination, useAdminPagination } from "@/components/admin/AdminPagination";
import { ADMIN_LIST_OUTLINE_SX } from "@/components/admin/adminListLayout";
import { Activity, RefreshCw } from "@/components/admin/muiIcons";
import ProtectionHint from "./ProtectionHint";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatProtectionDateTime, protectionActivityRows, protectionBanExpiresForever, type ProtectionActivityRow } from "./model";
import type { ProtectionBan, ProtectionView } from "./types";
import ProtectionEmptyState from "./ProtectionEmptyState";

type Props = {
  view: ProtectionView;
  disabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onUnban: (ban: ProtectionBan) => void;
};

export default function ActivityPanel({ view, disabled, refreshing, onRefresh, onUnban }: Props) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const text = (key: string) => t(`firewall.protection.${key}`);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const rows = useMemo(() => protectionActivityRows(view), [view]);
  const kindCount = (value: ProtectionActivityRow["kind"]) => rows.filter((row) => row.kind === value).length;
  const reasonLabel = (type?: string) => type === "ssh_auth" || type === "request_rate" || type === "path_scan" ? text(`reason_${type}`) : (type || "—");
  const policy = (row: ProtectionActivityRow) => view.config?.policies?.find((item) => item.id === row.policyID);
  const nodeName = (id?: string) => !id || id === view.uuid ? view.name : view.groups?.flatMap((group) => group.members ?? []).find((member) => member.uuid === id)?.name || id;
  const shortID = (value: string) => /^[\da-f]{8}-[\da-f-]{27}$/i.test(value) ? `${value.slice(0, 8)}…` : value;
  const groupName = (row: ProtectionActivityRow) => view.groups?.find((group) => group.id === row.groupID)?.name || row.groupID;
  const dateLabel = (value?: string) => formatProtectionDateTime(value) || value || "—";
  const filtered = rows.filter((row) => {
    if (kind !== "all" && row.kind !== kind) return false;
    const service = policy(row);
    return [row.ip, row.reason, reasonLabel(row.reason), service?.name, service?.port, row.policyID, nodeName(row.sourceNode), groupName(row), row.networkService].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });
  const pager = useAdminPagination(filtered);
  const badgeLabel = (row: ProtectionActivityRow) => row.kind === "ban" ? "record_banned" : row.kind === "expired" ? (row.revoked ? "record_revoked" : "record_expired") : row.kind === "observe" ? "record_observe" : "network_observe";
  const badge = (row: ProtectionActivityRow) => <Chip size="small" color={row.kind === "ban" ? "error" : row.kind === "observe" ? "info" : "default"} variant="outlined" label={text(badgeLabel(row))} />;
  const serviceCell = (row: ProtectionActivityRow) => {
    const item = policy(row);
    return <Box sx={{ minWidth: 0, overflowWrap: "anywhere", whiteSpace: "normal" }}>
      <Typography variant="body2" title={row.policyID}>{item?.name || (row.policyID ? shortID(row.policyID) : row.networkService || "—")}</Typography>
      {item ? <Typography variant="caption" color="text.secondary">{item.protocol.toUpperCase()} {item.port}</Typography> : null}
    </Box>;
  };
  const sourceCell = (row: ProtectionActivityRow) => <Box sx={{ minWidth: 0, overflowWrap: "anywhere", whiteSpace: "normal" }}>
    <Typography variant="body2" title={row.sourceNode}>{shortID(nodeName(row.sourceNode))}</Typography>
    <Typography variant="caption" color="text.secondary">{row.groupID ? groupName(row) : text("local_only")}</Typography>
  </Box>;
  const timeCell = (row: ProtectionActivityRow, showLabel = true) => {
    const forever = protectionBanExpiresForever(row.expiresAt);
    return <Box sx={{ fontVariantNumeric: "tabular-nums" }}>
      <Typography variant="body2" component="time" dateTime={row.expiresAt || row.at} title={forever ? text("ban_forever") : (row.expiresAt || row.at)} sx={{ display: "block", whiteSpace: "normal" }}>{forever ? text("ban_forever") : dateLabel(row.expiresAt || row.at)}</Typography>
      {showLabel ? <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>{text(row.expiresAt ? "expires_at" : "record_time")}</Typography> : null}
    </Box>;
  };
  const action = (row: ProtectionActivityRow) => row.ban ? <Button size="small" disabled={disabled} onClick={() => onUnban(row.ban!)}>{row.ban.group_id ? text("unban_group") : text("unban_local")}</Button> : <Typography variant="caption" color="text.secondary">{text("record_no_action")}</Typography>;

  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <AdminListShell>
      <AdminListFiltersBar><Stack direction="row" spacing={1} useFlexGap sx={{ width: "100%", flexWrap: "wrap", alignItems: "center" }}>
        <AdminListSearch value={query} onChange={(value) => { setQuery(value); pager.setPage(1); }} placeholder={text("search_activity")} />
        <AdminListSelect label={text("record_type")} value={kind} onChange={(value) => { setKind(value); pager.setPage(1); }}>
          {[
            { value: "all", label: text("record_all"), count: rows.length },
            { value: "ban", label: text("record_banned"), count: kindCount("ban") },
            { value: "expired", label: text("record_expired"), count: kindCount("expired") },
            { value: "observe", label: text("observe_hits"), count: kindCount("observe") },
            { value: "network", label: text("network_observe"), count: kindCount("network") },
          ].map((option) => <MenuItem key={option.value} value={option.value}>{option.label} ({option.count})</MenuItem>)}
        </AdminListSelect>
        <Button variant="outlined" startIcon={<RefreshCw size={16} />} disabled={refreshing} onClick={onRefresh} sx={{ ...ADMIN_LIST_OUTLINE_SX, ml: { sm: "auto" } }}>{t("firewall.refresh")}</Button>
      </Stack></AdminListFiltersBar>
      {!filtered.length ? <ProtectionEmptyState icon={<Activity size={28} />}>{query || kind !== "all" ? t("common.no_results") : text("activity_empty")}</ProtectionEmptyState> : mobile ? <AdminMobileCardStack>{pager.pageItems.map((row) => <AdminMobileListCard key={row.key}
        title={<Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{row.ip || "—"}</Typography>}
        headerExtra={badge(row)} cells={[
          [text("record_reason"), <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{reasonLabel(row.reason)}</Typography>],
          [text("service_info"), serviceCell(row)], [text("source_node"), sourceCell(row)], [text(row.expiresAt ? "expires_at" : "record_time"), timeCell(row, false)],
        ]} actions={row.ban ? action(row) : undefined} />)}</AdminMobileCardStack> : <Table container={false} className="admin-responsive-table" style={{ tableLayout: "fixed" }}>
        <TableHeader><TableRow>{[text("ban_ip"), text("record_reason"), text("service_info"), text("source_node"), text("record_time")].map((label) => <TableHead key={label}>{label}</TableHead>)}<TableHead style={{ textAlign: "center" }}>{t("common.action")}</TableHead></TableRow></TableHeader>
        <TableBody>{pager.pageItems.map((row) => <TableRow key={row.key}>
          <TableCell><Stack spacing={0.75} sx={{ alignItems: "flex-start", py: 0.75 }}><Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere", whiteSpace: "normal" }}>{row.ip || "—"}</Typography>{badge(row)}</Stack></TableCell>
          <TableCell style={{ whiteSpace: "normal", overflowWrap: "anywhere" }}>{reasonLabel(row.reason)}</TableCell>
          <TableCell>{serviceCell(row)}</TableCell><TableCell>{sourceCell(row)}</TableCell><TableCell>{timeCell(row)}</TableCell><TableCell style={{ whiteSpace: "normal", textAlign: "center" }}>{action(row)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
      <AdminPagination page={pager.page} total={filtered.length} pageSize={pager.pageSize} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} showSummary={false} showWhenEmpty />
    </AdminListShell>
    <ProtectionHint>{text("scope")}</ProtectionHint>
  </Stack>;
}
