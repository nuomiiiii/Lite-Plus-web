import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ADMIN_LIST_ACTION_SX, ADMIN_LIST_OUTLINE_SX } from "@/components/admin/adminListLayout";
import { AppDialogContent, Callout, Dialog } from "@/components/admin/ui";
import { applyLogSourceFormat, formatProtectionDateTime, rememberedSshSource } from "./model";
import type { ProtectionLogSource, ProtectionView } from "./types";

const fieldGrid = { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 };

type Props = { source: ProtectionLogSource; suggestedSshPath?: string; suggestedSshPort?: string; blockSshd?: boolean; disabled: boolean; busy: boolean; preview: ProtectionView["preview"]; previewError?: string;
  onClose: () => void; onSave: (source: ProtectionLogSource) => void; onPreview: (source: ProtectionLogSource) => void };

export default function SourceEditor({ source, suggestedSshPath, suggestedSshPort, blockSshd, disabled, busy, preview, previewError, onClose, onSave, onPreview }: Props) {
  const { t } = useTranslation();
  const text = (key: string) => t(`firewall.protection.${key}`);
  const [draft, setDraft] = useState({ ...source });
  const rememberedSsh = useRef(rememberedSshSource(source));
  const update = (next: Partial<ProtectionLogSource>) => setDraft((value) => ({ ...value, ...next }));
  const field = (key: keyof ProtectionLogSource, label: string) => <TextField size="small" fullWidth label={text(label)} value={draft[key] ?? ""} disabled={disabled} onChange={(event) => update({ [key]: event.target.value })} />;
  return <Dialog.Root mobileSheet open onOpenChange={(open: boolean) => { if (!open && !busy) onClose(); }}>
    <AppDialogContent title={text("source_editor")} maxWidth="640px">
      <Stack spacing={2} sx={{ mt: 2, minWidth: 0 }}>
        {field("path", "log_path")}
        <Box sx={fieldGrid}>
          <TextField size="small" fullWidth select label={text("format")} value={draft.format} disabled={disabled} onChange={(event) => {
            const applied = applyLogSourceFormat(draft, event.target.value, rememberedSsh.current, suggestedSshPath, suggestedSshPort);
            rememberedSsh.current = applied.remembered;
            setDraft(applied.next);
          }}>
            <MenuItem value="caddy_json">{text("source_format_caddy")}</MenuItem><MenuItem value="nginx_combined">{text("source_format_nginx_combined")}</MenuItem><MenuItem value="nginx_json">{text("source_format_nginx_json")}</MenuItem><MenuItem value="sshd" disabled={Boolean(blockSshd)}>{text("source_format_sshd")}</MenuItem>
          </TextField>
          {draft.format === "sshd" ? null : <TextField size="small" fullWidth select label={text("deployment")} value={draft.deploy_mode ?? "direct"} disabled={disabled} onChange={(event) => update({ deploy_mode: event.target.value })}>
            <MenuItem value="direct">{text("deploy_direct")}</MenuItem><MenuItem value="proxy">{text("deploy_proxy")}</MenuItem>
          </TextField>}
          {draft.format === "sshd" ? null : <TextField size="small" fullWidth select label={text("bind_protocol")} value={draft.bind_protocol ?? "tcp"} disabled={disabled} onChange={(event) => update({ bind_protocol: event.target.value })}><MenuItem value="tcp">TCP</MenuItem><MenuItem value="udp">UDP</MenuItem></TextField>}
          {field("bind_port", "bind_port")}{draft.format === "sshd" ? null : field("bind_addr", "bind_addr")}{draft.format === "sshd" ? null : field("host_filter", "host_filter")}
        </Box>
        <Typography variant="body2" color="text.secondary">{text(draft.format === "sshd" ? "ssh_log_help" : "log_help")}</Typography>
        {draft.deploy_mode === "proxy" && draft.format !== "sshd" ? <Callout.Root color="orange"><Callout.Text>{text("proxy_save_help")}</Callout.Text></Callout.Root> : null}
        {previewError ? <Callout.Root color="red" role="alert"><Callout.Text>{previewError}</Callout.Text></Callout.Root> : null}
        {preview ? <Box role="status" sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: "8px", overflowWrap: "anywhere" }}>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 1 }}>{text("preview")}</Typography>
          {preview.length ? preview.map((item, index) => <Typography key={index} variant="body2">{[formatProtectionDateTime(item.ts) || item.ts, item.ip, item.method, item.path, item.status ?? item.error].filter((value) => value !== undefined && value !== "").join(" · ")}</Typography>) : <Typography variant="body2">{text("preview_empty")}</Typography>}
        </Box> : null}
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Button disabled={busy} onClick={onClose} sx={ADMIN_LIST_OUTLINE_SX}>{t("common.cancel")}</Button>
          <Button disabled={disabled || !draft.path.trim()} onClick={() => onPreview(draft)} sx={ADMIN_LIST_OUTLINE_SX}>{text("preview")}</Button>
          <Button variant="contained" disabled={disabled || !draft.path.trim() || (draft.format === "sshd" && !String(draft.bind_port ?? "").trim())} onClick={() => onSave({ ...draft, path: draft.path.trim(), ...(draft.format === "sshd" ? { deploy_mode: "direct", bind_protocol: "tcp", host_filter: "" } : {}) })} sx={ADMIN_LIST_ACTION_SX}>{text("save_source")}</Button>
        </Stack>
      </Stack>
    </AppDialogContent>
  </Dialog.Root>;
}
