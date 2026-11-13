import { useState } from "react";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { AdminListFiltersBar, AdminListSearch, AdminListShell } from "@/components/admin/AdminListShell";
import { AdminMobileCardStack, AdminMobileListCard } from "@/components/admin/AdminMobileListCard";
import { AdminPagination, useAdminPagination } from "@/components/admin/AdminPagination";
import { AppDialogContent, Dialog } from "@/components/admin/ui";
import { ADMIN_LIST_ACTION_SX, ADMIN_LIST_OUTLINE_SX } from "@/components/admin/adminListLayout";
import { Plus, Shield } from "@/components/admin/muiIcons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import ProtectionEmptyState from "./ProtectionEmptyState";

type Props = {
  addresses: string[];
  disabled: boolean;
  busy: boolean;
  onSave: (addresses: string[], done: () => void) => void;
};

export default function WhitelistPanel({ addresses, disabled, busy, onSave }: Props) {
  const { t } = useTranslation();
  const mobile = useIsMobile();
  const text = (key: string) => t(`firewall.protection.${key}`);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const filtered = addresses.filter((ip) => ip.toLowerCase().includes(query.trim().toLowerCase()));
  const pager = useAdminPagination(filtered);
  const additions = [...new Set(draft.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))].filter((ip) => !addresses.includes(ip));
  const family = (ip: string) => <Chip size="small" variant="outlined" label={ip.includes(":") ? "IPv6" : "IPv4"} />;
  const removeAction = (ip: string) => <Button size="small" color="error" disabled={disabled} onClick={() => setRemoving(ip)}>{t("common.delete")}</Button>;

  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <AdminListShell>
      <AdminListFiltersBar><Stack direction="row" spacing={1} useFlexGap sx={{ width: "100%", alignItems: "center", flexWrap: "wrap" }}>
        <AdminListSearch value={query} onChange={(value) => { setQuery(value); pager.setPage(1); }} placeholder={text("search_whitelist")} />
        <Button variant="contained" startIcon={<Plus size={16} />} sx={ADMIN_LIST_ACTION_SX} disabled={disabled} onClick={() => { setDraft(""); setAdding(true); }}>{text("add_whitelist")}</Button>
      </Stack></AdminListFiltersBar>
      {!filtered.length ? <ProtectionEmptyState icon={<Shield size={28} />}>{query.trim() ? t("common.no_results") : text("whitelist_empty")}</ProtectionEmptyState> : mobile ? <AdminMobileCardStack>{pager.pageItems.map((ip) => <AdminMobileListCard key={ip}
        title={<Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{ip}</Typography>}
        headerExtra={family(ip)} cells={[]} actions={removeAction(ip)} />)}</AdminMobileCardStack> : <Table container={false} className="admin-responsive-table" style={{ tableLayout: "fixed" }}>
        <colgroup><col /><col style={{ width: 112 }} /></colgroup>
        <TableHeader><TableRow><TableHead>{text("whitelist")}</TableHead><TableHead style={{ textAlign: "center" }}>{t("common.action")}</TableHead></TableRow></TableHeader>
        <TableBody>{pager.pageItems.map((ip) => <TableRow key={ip}>
          <TableCell><Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap", py: 0.5 }}><Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{ip}</Typography>{family(ip)}</Stack></TableCell>
          <TableCell style={{ textAlign: "center" }}>{removeAction(ip)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
      <AdminPagination page={pager.page} total={filtered.length} pageSize={pager.pageSize} onPageChange={pager.setPage} onPageSizeChange={pager.setPageSize} showSummary={false} showWhenEmpty />
    </AdminListShell>
    <Dialog.Root mobileSheet open={adding} onOpenChange={(open: boolean) => { if (!open && !busy) setAdding(false); }}>
      <AppDialogContent title={text("add_whitelist")} maxWidth="480px">
        <Stack component="form" spacing={2} sx={{ mt: 2 }} onSubmit={(event) => {
          event.preventDefault();
          if (disabled || !additions.length) return;
          onSave([...addresses, ...additions], () => { setAdding(false); setDraft(""); });
        }}>
          <TextField fullWidth multiline minRows={3} maxRows={8} label={text("whitelist")} value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} helperText={text("whitelist_help")} />
          <Typography variant="caption" color="text.secondary">{text("nat_hint")}</Typography>
          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
            <Button disabled={busy} onClick={() => setAdding(false)} sx={ADMIN_LIST_OUTLINE_SX}>{t("common.cancel")}</Button>
            <Button type="submit" variant="contained" disabled={disabled || !additions.length} sx={ADMIN_LIST_ACTION_SX}>{t("common.add")}</Button>
          </Stack>
        </Stack>
      </AppDialogContent>
    </Dialog.Root>
    <Dialog.Root mobileSheet open={removing !== null} onOpenChange={(open: boolean) => { if (!open && !busy) setRemoving(null); }}>
      <AppDialogContent title={t("common.delete")} maxWidth="420px">
        <Stack spacing={2} sx={{ mt: 2 }}>
          <Typography sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{removing}</Typography>
          <Typography variant="body2" color="text.secondary">{text("remove_whitelist_help")}</Typography>
          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
            <Button disabled={busy} onClick={() => setRemoving(null)} sx={ADMIN_LIST_OUTLINE_SX}>{t("common.cancel")}</Button>
            <Button variant="contained" color="error" disabled={disabled} sx={ADMIN_LIST_ACTION_SX} onClick={() => onSave(addresses.filter((ip) => ip !== removing), () => setRemoving(null))}>{t("common.delete")}</Button>
          </Stack>
        </Stack>
      </AppDialogContent>
    </Dialog.Root>
  </Stack>;
}
