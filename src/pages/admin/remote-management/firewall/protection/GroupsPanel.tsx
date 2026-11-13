import { useId, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { AdminListFiltersBar, AdminListSearch, AdminListShell } from "@/components/admin/AdminListShell";
import { AdminPagination, useAdminPagination } from "@/components/admin/AdminPagination";
import { ADMIN_LIST_ACTION_SX } from "@/components/admin/adminListLayout";
import { ChevronRight, Plus, Server, Users } from "@/components/admin/muiIcons";
import type { ProtectionGroup } from "./types";
import ProtectionEmptyState from "./ProtectionEmptyState";

type Props = {
  groups: ProtectionGroup[];
  uuid: string;
  ready: boolean;
  disabled: boolean;
  onCreate: () => void;
  onMembership: (group: ProtectionGroup, join: boolean) => void;
  onDelete: (group: ProtectionGroup) => void;
};

export default function GroupsPanel({ groups, uuid, ready, disabled, onCreate, onMembership, onDelete }: Props) {
  const { t } = useTranslation();
  const text = (key: string) => t(`firewall.protection.${key}`);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const filtered = groups.filter((group) => [group.name, ...(group.members ?? []).flatMap((member) => [member.name, member.uuid])].some((value) => value?.toLowerCase().includes(search)));
  const pager = useAdminPagination(filtered);
  const listID = useId();
  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
      <AdminListShell>
        <AdminListFiltersBar><Stack direction="row" spacing={1} useFlexGap sx={{ width: "100%", alignItems: "center", flexWrap: "wrap" }}>
          <AdminListSearch value={query} onChange={(value) => { setQuery(value); pager.setPage(1); }} placeholder={text("search_groups")} />
          <Button variant="contained" startIcon={<Plus size={16} />} sx={ADMIN_LIST_ACTION_SX} disabled={disabled} onClick={onCreate}>{text("create_group")}</Button>
        </Stack></AdminListFiltersBar>
        {!filtered.length ? <ProtectionEmptyState icon={<Users size={28} />}>{search ? t("common.no_results") : text("groups_empty")}</ProtectionEmptyState> : <Box sx={{ p: { xs: 1, sm: 2 }, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "repeat(2, minmax(0, 1fr))" }, gap: 1.5, alignItems: "start" }}>{pager.pageItems.map((group) => <Box key={group.id} sx={{ border: 1, borderColor: "divider", borderRadius: "8px", minWidth: 0, overflow: "hidden" }}>
          <Stack direction="row" spacing={1} useFlexGap sx={{ p: 2, alignItems: "flex-start", flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", color: "primary.main", mt: 0.25 }}><Users size={20} /></Box>
            <Box sx={{ flex: "1 1 150px", minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{group.name}</Typography>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 1, flexWrap: "wrap" }}>
                <Chip size="small" variant="outlined" color={group.member ? "primary" : "default"} label={text(group.member ? "group_joined" : "group_not_joined")} />
                {group.delivery_status ? <Chip size="small" color={group.delivery_status === "failed" ? "error" : "default"} label={t(`firewall.delivery_${group.delivery_status}`, { defaultValue: group.delivery_status })} /> : null}
              </Stack>
              <Stack direction="row" spacing={1.5} useFlexGap sx={{ mt: 1.25, flexWrap: "wrap" }}>
                <Typography variant="caption" color="text.secondary">{text("group_members")} <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{group.members?.length ?? 0}</Box></Typography>
                <Typography variant="caption" color="text.secondary">{text("online")} <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{group.members?.filter((member) => member.online).length ?? 0}</Box></Typography>
                <Typography variant="caption" color="text.secondary">{text("phase_ready")} <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>{group.members?.filter((member) => member.ready).length ?? 0}</Box></Typography>
              </Stack>
            </Box>
          </Stack>
          <Box sx={{ px: 2, pb: 1.5 }}><Button size="small" startIcon={<ChevronRight size={16} style={{ transform: expanded[group.id] ? "rotate(90deg)" : undefined }} />} aria-expanded={Boolean(expanded[group.id])} aria-controls={`${listID}-${group.id}`} onClick={() => setExpanded((current) => ({ ...current, [group.id]: !current[group.id] }))}>{text(expanded[group.id] ? "group_collapse_members" : "group_expand_members")}</Button></Box>
          <Collapse in={Boolean(expanded[group.id])} unmountOnExit><Box id={`${listID}-${group.id}`} role="region" aria-label={`${text("group_members")} ${group.name}`} tabIndex={0} sx={{ mx: 2, mb: 1.5, maxHeight: 320, overflowY: "auto", overscrollBehavior: "contain", border: 1, borderColor: "divider", borderRadius: "8px" }}>
            {!group.members?.length ? <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>{text("group_no_members")}</Typography> : group.members.map((member, index) => <Box key={member.uuid} sx={{ p: 1.5, display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) auto" }, gap: 1, alignItems: "center", borderTop: index ? 1 : 0, borderColor: "divider" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
                <Box sx={{ display: "flex", color: "text.secondary", flexShrink: 0 }}><Server size={17} /></Box>
                <Typography variant="body2" title={member.uuid} sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{member.name || member.uuid}{member.uuid === uuid ? <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>{text("current_node")}</Typography> : null}</Typography>
              </Stack>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap" }}>
                <Chip size="small" variant="outlined" color={member.online ? "success" : "default"} label={text(member.online ? "online" : "offline")} />
                <Chip size="small" variant="outlined" color={member.ready ? "success" : "warning"} label={text(member.ready ? "phase_ready" : "environment_pending")} />
              </Stack>
            </Box>)}
          </Box></Collapse>
          <Stack direction="row" spacing={1} useFlexGap sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: "divider", flexWrap: "wrap" }}>
            {group.member ? <Button size="small" disabled={disabled} onClick={() => onMembership(group, false)}>{text("group_leave")}</Button> : <Button size="small" disabled={disabled || !ready} onClick={() => onMembership(group, true)}>{text("group_join")}</Button>}
            <Button size="small" color="error" disabled={disabled} onClick={() => onDelete(group)} sx={{ ml: "auto" }}>{text("group_delete")}</Button>
          </Stack>
        </Box>)}</Box>}
        <AdminPagination page={pager.page} total={filtered.length} pageSize={pager.pageSize} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} showSummary={false} showWhenEmpty />
      </AdminListShell>
  </Stack>;
}
