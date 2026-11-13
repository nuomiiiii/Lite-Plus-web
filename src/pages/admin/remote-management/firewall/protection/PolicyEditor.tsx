import { useState } from "react";
import { useTranslation } from "react-i18next";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { AdminSheetTabs } from "@/components/admin/AdminSheetTabs";
import { SettingCard } from "@/components/admin/SettingCard";
import SettingsSheetDialog from "@/components/admin/SettingsSheetDialog";
import { ADMIN_LIST_ACTION_SX, ADMIN_LIST_OUTLINE_SX } from "@/components/admin/adminListLayout";
import { Callout } from "@/components/admin/ui";
import { createRandomId } from "@/utils/randomId";
import { expandPolicyProtocols, preparePolicy, protectionBanForever, rememberedBanDurationSec, sshBindingError, type ServicePort } from "./model";
import type { ProtectionGroup, ProtectionLogSource, ProtectionPolicy } from "./types";

type Props = {
  open: boolean;
  policy: ProtectionPolicy; isNew: boolean; ports: ServicePort[]; sources: ProtectionLogSource[];
  groups: ProtectionGroup[]; disabled: boolean; busy: boolean; onCancel: () => void;
  onSave: (policies: ProtectionPolicy[]) => void; onInspect: (source: ProtectionLogSource) => void;
};

export default function PolicyEditor({ open, policy, isNew, ports, sources, groups, disabled, busy, onCancel, onSave, onInspect }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ ...policy });
  const [step, setStep] = useState(isNew ? 0 : 1);
  const [network, setNetwork] = useState(Boolean(policy.syn_rate || policy.conn_limit));
  const [logs, setLogs] = useState(Boolean(policy.source_id || policy.request_threshold || policy.path_threshold));
  const [paths, setPaths] = useState((policy.paths ?? []).join("\n"));
  const [error, setError] = useState("");
  const [rememberedBanSec, setRememberedBanSec] = useState(() => rememberedBanDurationSec(policy.ban_duration_sec));
  const tcp = draft.protocol === "tcp" || draft.protocol === "both";
  const source = sources.find((item) => item.id === draft.source_id);
  const ssh = source?.format === "sshd";
  const proxy = logs && tcp && source?.deploy_mode === "proxy";
  const sshErrorKey = logs && tcp ? sshBindingError(draft, sources) : "";
  const mode = proxy ? "observe" : draft.mode;
  const update = (next: Partial<ProtectionPolicy>) => setDraft((value) => ({ ...value, ...next }));
  const text = (key: string) => t(`firewall.protection.${key}`);
  const numberField = (key: keyof ProtectionPolicy, label: string, fallback = 0) => (
    <TextField fullWidth size="small" type="number" label={text(label)} value={draft[key] ?? fallback}
      disabled={disabled} slotProps={{ htmlInput: { min: 0, step: 1 } }}
      onChange={(event) => update({ [key]: Number(event.target.value) })} />
  );
  const submit = () => {
    if (draft.port.trim() !== "*" && (!/^\d+$/.test(draft.port.trim()) || Number(draft.port) < 1 || Number(draft.port) > 65535)) {
      setStep(0); setError(text("invalid_port")); return;
    }
    if (logs && tcp && draft.source_id && !source) { setStep(1); setError(text("select_source")); return; }
    if (sshErrorKey) { setStep(1); setError(text("ssh_port_mismatch")); return; }
    setError(""); onSave(expandPolicyProtocols(preparePolicy(draft, network, logs, paths, sources), draft.protocol === "both" ? createRandomId() : ""));
  };

  return <SettingsSheetDialog
    open={open}
    onClose={onCancel}
    title={isNew ? text("create_policy") : `${t("common.edit")} · ${policy.name || policy.port}`}
    maxWidth={820}
    scrollContent
    disableClose={busy}
    actions={
      <Box sx={{ display: "flex", width: "100%", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
        <Button disabled={busy} onClick={onCancel} sx={{ ...ADMIN_LIST_OUTLINE_SX, mr: "auto" }}>{t("common.cancel")}</Button>
        {isNew && step > 0 ? <Button disabled={busy} onClick={() => setStep(step - 1)} sx={ADMIN_LIST_OUTLINE_SX}>{text("previous_step")}</Button> : null}
        {isNew && step < 2 ? <Button variant="contained" disabled={disabled} onClick={() => setStep(step + 1)} sx={ADMIN_LIST_ACTION_SX}>{text("next_step")}</Button> : <Button variant="contained" disabled={disabled} onClick={submit} sx={ADMIN_LIST_ACTION_SX}>{t("common.save")}</Button>}
      </Box>
    }
  >
    <Stack spacing={2} sx={{ minWidth: 0, pb: 0.5 }}>
      <Typography variant="body2" color="text.secondary">{text("editor_help")}</Typography>
      <Box aria-label={text("effect_preview")} sx={{ p: 1.5, borderRadius: "8px", bgcolor: "action.hover", overflowWrap: "anywhere" }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{draft.protocol === "both" ? "TCP/UDP" : draft.protocol.toUpperCase()} {draft.port || "—"}</Typography>
          <Chip size="small" color={mode === "observe" ? "info" : "success"} label={text(mode)} />
          <Typography variant="body2" color="text.secondary">{logs ? groups.find((item) => item.id === draft.group_id)?.name || text("local_only") : text("local_only")}</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
          {text("connection_protection")}：{network && tcp && Boolean(draft.syn_rate || draft.conn_limit) ? text(mode === "observe" ? "network_observe" : "connection_drop") : text("not_enabled")}
          {" · "}{text("ban_scope")}：{mode === "observe" || !logs || !tcp || !(draft.request_threshold || draft.path_threshold) ? text("no_ip_ban") : protectionBanForever(draft.ban_duration_sec) ? text("ban_forever") : text("ban_duration") + " " + (draft.ban_duration_sec ?? 600)}
        </Typography>
      </Box>
      <AdminSheetTabs><Tabs value={step} onChange={(_, value: number) => setStep(value)} variant="scrollable" scrollButtons={false} aria-label={text("edit_sections")} sx={{ "& .MuiTabs-scrollButtons": { display: "none" } }}>
        <Tab label={text("service_info")} /><Tab label={text("detection_logs")} /><Tab label={text("actions_linking")} />
      </Tabs></AdminSheetTabs>
      {error ? <Callout.Root color="red" role="alert"><Callout.Text>{error}</Callout.Text></Callout.Root> : null}
      <Stack spacing={2} sx={{ minWidth: 0, pt: 0.5 }}>
        {step === 0 ? <>
          {isNew && ports.length ? <TextField select fullWidth size="small" label={text("pick_rule")} value="" disabled={disabled}
            helperText={text("pick_rule_help")} onChange={(event) => { const item = ports[Number(event.target.value)]; if (item) update({ name: item.name, port: item.port, protocol: item.protocol }); }}>
            <MenuItem value="">{text("manual_port")}</MenuItem>{ports.map((item, index) => <MenuItem key={`${item.protocol}:${item.port}`} value={index}>{item.name} · {item.protocol.toUpperCase()} {item.port}</MenuItem>)}
          </TextField> : null}
          <Stack spacing={2} sx={{ width: "100%" }}>
            <TextField fullWidth size="small" label={text("policy_name")} value={draft.name ?? ""} disabled={disabled} onChange={(event) => update({ name: event.target.value })} />
            <Box sx={fieldGrid}><TextField select fullWidth size="small" label={t("firewall.protocol")} value={draft.protocol} disabled={disabled} onChange={(event) => update({ protocol: event.target.value })}>
              <MenuItem value="tcp">TCP</MenuItem><MenuItem value="udp">UDP</MenuItem><MenuItem value="both">TCP/UDP</MenuItem></TextField>
              <TextField fullWidth size="small" label={text("policy_port")} value={draft.port} disabled={disabled} onChange={(event) => update({ port: event.target.value })} slotProps={{ htmlInput: { inputMode: "numeric" } }} />
            </Box>
            {draft.protocol === "both" ? <Typography variant="caption" color="text.secondary">{text("protocol_both_help")}</Typography> : null}
            {!tcp ? <Typography variant="caption" color="text.secondary">{text("protocol_udp_help")}</Typography> : null}
            <TextField fullWidth size="small" label={text("bind_addr")} value={draft.bind_addr ?? ""} disabled={disabled} onChange={(event) => update({ bind_addr: event.target.value })} helperText={text("bind_help")} />
          </Stack>
          <Typography variant="body2" color="text.secondary">{text("rule_relationship")}</Typography>
        </> : null}
        {step === 1 ? <>
          <SettingCard><Stack spacing={2} sx={{ width: "100%" }}>
            <FormControlLabel control={<Checkbox checked={network && tcp} disabled={disabled || !tcp} onChange={(_, checked) => setNetwork(checked)} />} label={text("connection_protection")} />
            <Typography variant="body2" color="text.secondary">{text("connection_help")}</Typography>
            {network && tcp ? <><Box sx={fieldGrid}>{numberField("syn_rate", "syn_rate")}{numberField("syn_burst", "syn_burst")}</Box>{numberField("conn_limit", "conn_limit")}<Typography variant="body2" color="text.secondary">{text("threshold_help")}</Typography></> : null}
          </Stack></SettingCard>
          <SettingCard><Stack spacing={2} sx={{ width: "100%" }}>
            <FormControlLabel control={<Checkbox checked={logs && tcp} disabled={disabled || !tcp} onChange={(_, checked) => setLogs(checked)} />} label={text("log_detection")} />
            <Typography variant="body2" color="text.secondary">{text(tcp ? (ssh ? "ssh_log_help" : "log_help") : "protocol_udp_help")}</Typography>
            {logs && tcp ? <>
              <TextField select fullWidth size="small" label={text("sources")} value={draft.source_id ?? ""} disabled={disabled} onChange={(event) => {
                const id = event.target.value;
                const next = sources.find((item) => item.id === id);
                update({ source_id: id, ...(next?.format === "sshd" && next.bind_port ? { port: next.bind_port, protocol: "tcp" } : {}) });
              }}>
                <MenuItem value="">{text("auto_source")}</MenuItem>{sources.map((item) => <MenuItem key={item.id} value={item.id}>{item.path || item.id}</MenuItem>)}
              </TextField>
              {source ? <Button variant="outlined" sx={{ ...ADMIN_LIST_OUTLINE_SX, alignSelf: "flex-start" }} disabled={disabled} onClick={() => onInspect(source)}>{text("preview")}</Button> : <Typography variant="body2" color="text.secondary">{sources.length ? text("auto_source_help") : text("source_first")}</Typography>}
              {sshErrorKey ? <Callout.Root color="red" role="alert"><Callout.Text>{text("ssh_port_mismatch")}</Callout.Text></Callout.Root> : null}
              {proxy ? <Callout.Root color="orange"><Callout.Text>{text("proxy_observe")}</Callout.Text></Callout.Root> : null}
              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{text(ssh ? "ssh_rate_rule" : "rate_rule")}</Typography><Box sx={fieldGrid}>{numberField("request_window_sec", ssh ? "ssh_window" : "request_window", 60)}{numberField("request_threshold", ssh ? "ssh_threshold" : "request_threshold")}</Box>
              {ssh ? null : <>
              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{text("path_rule")}</Typography>
              <TextField fullWidth size="small" multiline minRows={3} label={text("path_rule")} value={paths} disabled={disabled} onChange={(event) => setPaths(event.target.value)} helperText={text("example_path")} />
              <Box sx={fieldGrid}>{numberField("path_window_sec", "window", 60)}{numberField("path_threshold", "path_threshold")}</Box>
              <Typography variant="body2" color="text.secondary">{text("threshold_help")}</Typography>
              </>}
            </> : null}
          </Stack></SettingCard>
        </> : null}
        {step === 2 ? <SettingCard><Stack spacing={2} sx={{ width: "100%" }}>
          <Typography sx={{ fontWeight: 600 }}>{text("mode")}</Typography>
          <RadioGroup value={mode} sx={{ gap: 1.5 }} onChange={(event) => update({ mode: event.target.value as ProtectionPolicy["mode"] })}>
            <FormControlLabel value="observe" disabled={disabled} control={<Radio />} sx={{ m: 0, alignItems: "flex-start" }} label={<Box sx={{ pt: 0.75 }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{text("observe")}</Typography><Typography variant="body2" color="text.secondary">{text("observe_help")}</Typography></Box>} />
            <FormControlLabel value="enforce" disabled={disabled || proxy} control={<Radio />} sx={{ m: 0, alignItems: "flex-start" }} label={<Box sx={{ pt: 0.75 }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{text("enforce")}</Typography><Typography variant="body2" color="text.secondary">{proxy ? text("proxy_observe") : text("enforce_help")}</Typography></Box>} />
          </RadioGroup>
          {mode === "enforce" && logs && tcp ? <>
            <FormControlLabel control={<Checkbox checked={protectionBanForever(draft.ban_duration_sec)} disabled={disabled} onChange={(_, forever) => {
              if (forever) {
                setRememberedBanSec(rememberedBanDurationSec(draft.ban_duration_sec));
                update({ ban_duration_sec: -1 });
                return;
              }
              update({ ban_duration_sec: rememberedBanSec });
            }} />} sx={{ m: 0, alignItems: "flex-start" }} label={<Box sx={{ pt: 0.75 }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{text("ban_forever")}</Typography><Typography variant="body2" color="text.secondary">{text("ban_forever_help")}</Typography></Box>} />
            {protectionBanForever(draft.ban_duration_sec) ? null : (
              <TextField fullWidth size="small" type="number" label={text("ban_duration")} value={draft.ban_duration_sec ?? 600}
                disabled={disabled} slotProps={{ htmlInput: { min: 1, step: 1 } }}
                onChange={(event) => {
                  const n = Number(event.target.value);
                  update({ ban_duration_sec: n });
                  if (n > 0) setRememberedBanSec(n);
                }} />
            )}
          </> : null}
          <TextField select fullWidth size="small" label={text("group")} value={draft.group_id ?? ""} disabled={disabled || !logs || !tcp} onChange={(event) => update({ group_id: event.target.value })}>
            <MenuItem value="">{text("local_only")}</MenuItem>{groups.map((item) => <MenuItem key={item.id} value={item.id} disabled={!item.member || !item.enabled}>{item.name}</MenuItem>)}
          </TextField>
          <FormControlLabel control={<Checkbox checked={draft.enabled} disabled={disabled} onChange={(_, enabled) => update({ enabled })} />} label={text("policy_enabled")} />
        </Stack></SettingCard> : null}
      </Stack>
    </Stack>
  </SettingsSheetDialog>;
}

const fieldGrid = { display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" }, gap: 2 };
