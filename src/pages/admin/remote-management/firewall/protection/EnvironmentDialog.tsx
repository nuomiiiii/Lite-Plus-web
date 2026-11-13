import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import SettingsSheetDialog from "@/components/admin/SettingsSheetDialog";
import { ADMIN_LIST_ACTION_SX, ADMIN_LIST_OUTLINE_SX } from "@/components/admin/adminListLayout";
import { Check, CheckCircle2, ChevronRight, Download, Firewall, Server, Shield } from "@/components/admin/muiIcons";
import type { ProtectionView } from "./types";

type Props = {
  open: boolean;
  view: ProtectionView;
  busy: boolean;
  loading: boolean;
  readOnly: boolean;
  onClose: () => void;
  onPrecheck: () => void;
  onUpgrade: () => void;
};

export default function EnvironmentDialog({ open, view, busy, loading, readOnly, onClose, onPrecheck, onUpgrade }: Props) {
  const { t } = useTranslation();
  const text = (key: string) => t(`firewall.protection.${key}`);
  const cap = view.capability;
  const ready = Boolean(cap?.runtime_ready && cap?.runtime_enabled);
  const agentOld = view.unavailable === "agent_old";
  const canUpgrade = Boolean(cap?.can_install || cap?.can_update || cap?.can_enable_runtime);
  const phase = view.upgrade?.phase;
  const upgrading = ["precheck", "install", "enable", "verify"].includes(phase ?? "");
  const backend = cap?.static_backend;
  const backendName = backend === "ufw" ? "UFW" : backend ? t(`firewall.backend.${backend}`, { defaultValue: backend }) : "—";
  const issues = [...(cap?.missing ?? []), ...(cap?.conflicts ?? [])];
  const details = [
    { title: text("environment_plan"), items: cap?.planned_steps ?? [] },
    { title: text("environment_notes"), items: cap?.manual_hints ?? [] },
  ].filter((group) => group.items.length);
  const available = view.linux && !agentOld;
  const status = ready ? text("phase_ready") : upgrading ? text(`phase_${phase}`) : phase === "failed" ? text("phase_failed") : text("environment_pending");

  return <SettingsSheetDialog
    open={open}
    onClose={onClose}
    title={text("capability")}
    maxWidth={600}
    scrollContent
    actions={<Box sx={{ display: "flex", width: "100%", gap: 1, flexWrap: "wrap" }}>
      <Button onClick={onClose} sx={{ ...ADMIN_LIST_OUTLINE_SX, flex: { xs: 1, sm: "initial" }, mr: { sm: "auto" } }}>{text("close")}</Button>
      <Button variant="outlined" disabled={busy || loading || readOnly || !available} onClick={onPrecheck}
        sx={{ ...ADMIN_LIST_OUTLINE_SX, flex: { xs: 1, sm: "initial" } }}>{text("precheck")}</Button>
      {canUpgrade && !ready ? <Button variant="contained" disabled={busy || readOnly || !available} onClick={onUpgrade}
        sx={{ ...ADMIN_LIST_ACTION_SX, width: { xs: "100%", sm: "auto" } }}>{text("upgrade")}</Button> : null}
    </Box>}
  >
    <Stack spacing={2} sx={{ minWidth: 0, pb: 2, overflowWrap: "anywhere" }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Box sx={{ display: "flex", color: "text.secondary" }}><Server size={18} /></Box>
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>{view.name}</Typography>
        <Chip size="small" variant="outlined" color={ready ? "success" : phase === "failed" ? "error" : upgrading ? "info" : "warning"} label={status} />
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5 }}>
        {[
          { label: text("environment_firewall"), value: backendName, icon: <Firewall size={18} /> },
          { label: text("environment_engine"), value: "nftables", icon: <Shield size={18} />, detail: cap?.nft_version },
        ].map((item) => <Box key={item.label} sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: "8px", minWidth: 0, bgcolor: "action.hover" }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", color: "text.secondary", mb: 0.75 }}>
            <Box sx={{ display: "flex", flexShrink: 0 }}>{item.icon}</Box>
            <Typography variant="caption">{item.label}</Typography>
          </Stack>
          <Typography sx={{ fontSize: 18, fontWeight: 600, lineHeight: 1.5 }}>{item.value}</Typography>
          {item.detail ? <Typography variant="caption" color="text.secondary">{item.detail}</Typography> : null}
        </Box>)}
      </Box>

      {agentOld || !view.linux ? <Alert severity="warning">{text(agentOld ? "need_agent" : "linux_only")}</Alert> : ready ?
        <Alert className="km-settings-alert" severity="success" icon={<CheckCircle2 size={20} />} sx={{ alignItems: "center", "& .MuiAlert-icon": { py: 0, paddingBlock: 0, alignSelf: "center", display: "flex", alignItems: "center", "& svg": { display: "block", fontSize: 20 } }, "& .MuiAlert-message": { py: 0, display: "flex", alignItems: "center", lineHeight: 1.5 } }}>{text("environment_ready_help")}</Alert> : canUpgrade ?
          <Box sx={{ p: 1.75, borderRadius: "8px", bgcolor: "action.hover" }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5 }}>{text("environment_prepare")}</Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {[
                { label: text(cap?.can_install || cap?.can_update ? "environment_install" : "environment_installed"), icon: cap?.can_install || cap?.can_update ? <Download size={20} /> : <CheckCircle2 size={20} /> },
                { label: text("environment_enable"), icon: <Shield size={20} /> },
              ].map((item) => <Stack key={item.label} direction="row" spacing={1} sx={{ alignItems: "center", flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", flexShrink: 0, color: "primary.main" }}>{item.icon}</Box>
                <Typography variant="body2">{item.label}</Typography>
              </Stack>)}
            </Stack>
          </Box> : !issues.length ? <Typography variant="body2" color="text.secondary">{text("environment_check_first")}</Typography> : null}

      {upgrading ? <LinearProgress aria-label={text(`phase_${phase}`)} /> : null}

      {available && cap ? <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
        {["environment_keep_firewall", "environment_keep_rules"].map((key) => <Stack key={key} direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <Box sx={{ display: "flex", color: "success.main" }}><Check size={16} /></Box>
          <Typography variant="caption" color="text.secondary">{text(key)}</Typography>
        </Stack>)}
      </Stack> : null}

      {issues.length ? <Alert severity="warning">
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{text("environment_issues")}</Typography>
        <Box component="ul" sx={{ m: 0, pl: 2, listStyle: "disc", "& li + li": { mt: 0.5 } }}>{issues.map((item, index) => <li key={index}>{item}</li>)}</Box>
      </Alert> : null}

      {view.upgrade?.error ? <Alert severity="error">{view.upgrade.error}</Alert> : null}

      {details.length ? <Box component="details" sx={{ borderTop: 1, borderColor: "divider", pt: 1.5, "&[open] .environment-details-arrow": { transform: "rotate(90deg)" } }}>
        <Box component="summary" sx={{ display: "flex", alignItems: "center", gap: 0.5, cursor: "pointer", color: "text.secondary", listStyle: "none", "&::-webkit-details-marker": { display: "none" } }}>
          <Box className="environment-details-arrow" sx={{ display: "flex" }}><ChevronRight size={18} /></Box>
          <Typography variant="body2">{text("environment_details")}</Typography>
        </Box>
        <Stack spacing={1.5} sx={{ pt: 1.5 }}>
          {details.map((group) => <Box key={group.title}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{group.title}</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2, listStyle: "disc", color: "text.secondary", "& li + li": { mt: 0.5 } }}>{group.items.map((item, index) => <Typography component="li" key={index} variant="body2">{item}</Typography>)}</Box>
          </Box>)}
        </Stack>
      </Box> : null}
    </Stack>
  </SettingsSheetDialog>;
}
