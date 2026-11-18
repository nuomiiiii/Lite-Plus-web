import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import SettingsPageSkeleton from "@/components/admin/SettingsPageSkeleton";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";
import { useSettings } from "@/lib/api";
import {
  ALLOW_REMOTE_MANAGEMENT_SETTING_PATH,
  isAllowMCPEnabled,
  isAllowRemoteManagementEnabled,
  isMCPManagementPath,
  isRemoteManagementPath,
} from "@/utils/allowRemoteManagement";
import { clearStoredRemoteGrant } from "@/utils/remoteSession";
import {
  rememberRemoteManagementGate,
  RemoteManagementGateContext,
  type RemoteManagementGateValue,
} from "@/components/admin/remoteManagementGateContext";

export {
  useOptionalRemoteManagementGate,
  useRemoteManagementGate,
} from "@/components/admin/remoteManagementGateContext";

function RequiredSettingDialog({
  open,
  title,
  description,
  actionLabel,
  onGoEnable,
  onDismiss,
}: {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  onGoEnable: () => void;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onDismiss}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography sx={{ fontSize: 15, lineHeight: 1.6 }}>
          {description}
        </Typography>
      </DialogContent>
      <DialogActions>
        {onDismiss ? (
          <Button onClick={onDismiss}>{t("common.cancel")}</Button>
        ) : null}
        <Button variant="contained" onClick={onGoEnable}>
          {actionLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function RemoteManagementRequiredDialog({
  open,
  onGoEnable,
  onDismiss,
}: {
  open: boolean;
  onGoEnable: () => void;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <RequiredSettingDialog
      open={open}
      title={t("settings.general.allow_remote_management_required_title")}
      description={t("settings.general.allow_remote_management_required_description")}
      actionLabel={t("settings.general.allow_remote_management_go_enable")}
      onGoEnable={onGoEnable}
      onDismiss={onDismiss}
    />
  );
}

function MCPRequiredDialog({
  open,
  onGoEnable,
  onDismiss,
}: {
  open: boolean;
  onGoEnable: () => void;
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <RequiredSettingDialog
      open={open}
      title={t("settings.general.allow_mcp_required_title")}
      description={t("settings.general.allow_mcp_required_description")}
      actionLabel={t("settings.general.allow_mcp_go_enable")}
      onGoEnable={onGoEnable}
      onDismiss={onDismiss}
    />
  );
}

export function RemoteManagementGateProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { settings, loading } = useSettings();
  const navigate = useNavigate();
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const enabled = isAllowRemoteManagementEnabled(settings);
  const mcpEnabled = isAllowMCPEnabled(settings);

  const ensureEnabled = useCallback(() => {
    if (loading || enabled) return true;
    setMcpOpen(false);
    setRemoteOpen(true);
    return false;
  }, [enabled, loading]);

  const ensureMCPEnabled = useCallback(() => {
    if (loading) return true;
    if (!enabled) {
      setMcpOpen(false);
      setRemoteOpen(true);
      return false;
    }
    if (mcpEnabled) return true;
    setRemoteOpen(false);
    setMcpOpen(true);
    return false;
  }, [enabled, loading, mcpEnabled]);

  const value = useMemo<RemoteManagementGateValue>(
    () => ({ enabled, mcpEnabled, loading, ensureEnabled, ensureMCPEnabled }),
    [enabled, mcpEnabled, loading, ensureEnabled, ensureMCPEnabled],
  );

  useEffect(() => {
    rememberRemoteManagementGate(value);
  }, [value]);

  const goEnable = useCallback(() => {
    setRemoteOpen(false);
    setMcpOpen(false);
    navigate(ALLOW_REMOTE_MANAGEMENT_SETTING_PATH);
  }, [navigate]);

  return (
    <RemoteManagementGateContext.Provider value={value}>
      {children}
      <RemoteManagementRequiredDialog
        open={remoteOpen}
        onGoEnable={goEnable}
        onDismiss={() => setRemoteOpen(false)}
      />
      <MCPRequiredDialog
        open={mcpOpen}
        onGoEnable={goEnable}
        onDismiss={() => setMcpOpen(false)}
      />
    </RemoteManagementGateContext.Provider>
  );
}

export function guardRemoteManagementNav(
  event: Pick<MouseEvent, "preventDefault">,
  path: string,
  gate: { ensureEnabled: () => boolean; ensureMCPEnabled: () => boolean },
): boolean {
  if (!isRemoteManagementPath(path)) return false;
  if (!gate.ensureEnabled()) {
    event.preventDefault();
    return true;
  }
  if (isMCPManagementPath(path) && !gate.ensureMCPEnabled()) {
    event.preventDefault();
    return true;
  }
  return false;
}

export function RequireAllowRemoteManagement({
  children,
  loadingFallback,
}: {
  children: ReactNode;
  loadingFallback?: ReactNode;
}) {
  const { settings, loading, refetch } = useSettings();
  const navigate = useNavigate();
  const enabled = isAllowRemoteManagementEnabled(settings);

  useEffect(() => {
    if (!enabled) clearStoredRemoteGrant();
  }, [enabled]);

  const refresh = useCallback(() => {
    void refetch().catch(() => undefined);
  }, [refetch]);

  useVisibleInterval(refresh, loading || !enabled ? null : 2_000, {
    runOnVisible: true,
  });

  if (loading) return <>{loadingFallback ?? <SettingsPageSkeleton />}</>;
  if (enabled) return <>{children}</>;
  return (
    <>
      {loadingFallback ?? <SettingsPageSkeleton />}
      <RemoteManagementRequiredDialog
        open
        onGoEnable={() => navigate(ALLOW_REMOTE_MANAGEMENT_SETTING_PATH)}
      />
    </>
  );
}

export function RequireAllowMCP({
  children,
  loadingFallback,
}: {
  children: ReactNode;
  loadingFallback?: ReactNode;
}) {
  const { settings, loading } = useSettings();
  const navigate = useNavigate();
  const enabled = isAllowMCPEnabled(settings);

  if (loading) return <>{loadingFallback ?? null}</>;
  if (enabled) return <>{children}</>;
  return (
    <>
      {loadingFallback ?? null}
      <MCPRequiredDialog
        open
        onGoEnable={() => navigate(ALLOW_REMOTE_MANAGEMENT_SETTING_PATH)}
      />
    </>
  );
}
