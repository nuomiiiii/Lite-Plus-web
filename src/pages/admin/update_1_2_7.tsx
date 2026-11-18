import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import { ArrowRight, HardDrive, Server, Trash2 } from "@/components/admin/muiIcons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import MigrationGuideShell from "@/components/install/MigrationGuideShell";
import { startVisibleInterval } from "@/hooks/useVisibleInterval";
import { isGuidePreview } from "@/utils/guidePreview";
import { useSearchParams } from "react-router-dom";

const API_BASE = "/api/admin/update/1.2.7";
const I18N_PREFIX = "settings.update_1_2_7";

type Driver = "sqlite" | "mysql" | "postgresql";

type Summary = {
  load_rows: number;
  gpu_rows: number;
  latency_rows: number;
  monitoring_rows: number;
  estimated_points: number;
  server_count: number;
  retention_days: number;
  oldest_at?: string;
  newest_at?: string;
};

type UpgradeStatus = {
  state: "idle" | "cleaning" | "migrating" | "completed" | "failed";
  phase: string;
  table?: string;
  summary: Summary;
  source_rows_done: number;
  source_rows_total: number;
  written_points: number;
  progress: number;
  storage_current?: number;
  storage_total?: number;
  storage_preserved?: number;
  storage_progress?: number;
  target_driver?: Driver;
  error?: string;
};

type APIResponse<T> = {
  status: "success" | "error";
  message: string;
  data?: T;
};

const examples: Record<Driver, string> = {
  sqlite: "./data/metrics.db",
  mysql: "user:password@tcp(127.0.0.1:3306)/lite?parseTime=true",
  postgresql:
    "host=127.0.0.1 port=5432 user=lite password=secret dbname=lite sslmode=disable",
};

function previewUpgradeStatus(): UpgradeStatus {
  return {
    state: "migrating",
    phase: "migrating",
    table: "load",
    summary: {
      load_rows: 186420,
      gpu_rows: 12400,
      latency_rows: 54210,
      monitoring_rows: 240630,
      estimated_points: 18200,
      server_count: 18,
      retention_days: 30,
    },
    source_rows_done: 96400,
    source_rows_total: 186420,
    written_points: 9100,
    progress: 52,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  const payload = (await response.json()) as APIResponse<T>;
  if (
    !response.ok ||
    payload.status !== "success" ||
    payload.data === undefined
  ) {
    throw new Error(payload.message || `HTTP ${response.status}`);
  }
  return payload.data;
}

const Upgrade127 = () => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const locale = i18n.resolvedLanguage || i18n.language || "en-US";
  const formatNumber = useCallback(
    (value: number) => new Intl.NumberFormat(locale).format(value),
    [locale],
  );
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1" || isGuidePreview();
  const [status, setStatus] = useState<UpgradeStatus | null>(() =>
    isGuidePreview() ? previewUpgradeStatus() : null,
  );
  const [pageError, setPageError] = useState("");
  const [driver, setDriver] = useState<Driver>("sqlite");
  const [dsn, setDSN] = useState(examples.sqlite);
  const [cutoff, setCutoff] = useState("");
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmSQLite, setConfirmSQLite] = useState(false);
  const [confirmLarge, setConfirmLarge] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (preview) {
      const next = previewUpgradeStatus();
      setStatus(next);
      setPageError("");
      return next;
    }
    try {
      const next = await request<UpgradeStatus>("/status");
      setStatus(next);
      setPageError("");
      return next;
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : t(`${I18N_PREFIX}.network_error`),
      );
      return null;
    }
  }, [preview, t]);

  useEffect(() => {
    if (preview) {
      setPageError("");
      setStatus(previewUpgradeStatus());
      return;
    }
    void refreshStatus();
  }, [preview, refreshStatus]);

  useEffect(() => {
    if (preview) return;
    if (
      !status ||
      (status.state !== "migrating" && status.state !== "cleaning")
    ) {
      return;
    }
    return startVisibleInterval(() => void refreshStatus(), 700);
  }, [preview, refreshStatus, status]);

  useEffect(() => {
    if (preview || status?.state !== "completed") return;
    const timer = window.setTimeout(() => window.location.replace("/"), 3200);
    return () => window.clearTimeout(timer);
  }, [preview, status?.state]);

  const summary = status?.summary;
  const sqliteRisk =
    driver === "sqlite" &&
    !!summary &&
    summary.server_count > 5 &&
    summary.retention_days > 7;
  const largeRisk =
    !!summary && summary.load_rows + summary.latency_rows > 300_000;
  const operating =
    status?.state === "migrating" || status?.state === "cleaning" || busy;

  const phaseText = useMemo(() => {
    if (!status) return "";
    if (status.phase.startsWith("storage_")) {
      const phase = status.phase.slice("storage_".length);
      return t(`settings.update_storage_v4.phase_${phase}`, {
        defaultValue: t("settings.update_storage_v4.phase_preparing"),
      });
    }
    switch (status.phase) {
      case "connecting":
      case "saving_target":
        return t(`${I18N_PREFIX}.phase_connecting`);
      case "migrating":
        return t(`${I18N_PREFIX}.phase_migrating`, {
          table: status.table || t(`${I18N_PREFIX}.monitoring_data`),
        });
      case "finalizing":
        return t(`${I18N_PREFIX}.phase_finalizing`);
      case "vacuuming":
        return t(`${I18N_PREFIX}.phase_vacuuming`);
      case "cleaning":
        return t(`${I18N_PREFIX}.phase_cleaning`);
      default:
        return t(`${I18N_PREFIX}.progress_title`);
    }
  }, [status, t]);

  const storagePhase = status?.phase.startsWith("storage_") ?? false;
  const displayedDone = storagePhase
    ? status?.storage_current ?? 0
    : status?.source_rows_done ?? 0;
  const displayedTotal = storagePhase
    ? status?.storage_total ?? 0
    : status?.source_rows_total ?? 0;
  const displayedWritten = storagePhase
    ? status?.storage_preserved ?? 0
    : status?.written_points ?? 0;
  const displayedProgress = storagePhase
    ? status?.storage_progress ?? 0
    : status?.progress ?? 0;

  const handleDriver = (_: unknown, value: Driver | null) => {
    if (!value) return;
    setDriver(value);
    setDSN(examples[value]);
    setConfirmSQLite(false);
  };

  const cleanup = async () => {
    if (!cutoff) {
      setPageError(t(`${I18N_PREFIX}.missing_cutoff`));
      setCleanupOpen(false);
      return;
    }
    setBusy(true);
    setPageError("");
    try {
      await request<{ summary: Summary }>("/cleanup", {
        method: "POST",
        body: JSON.stringify({ before: new Date(cutoff).toISOString() }),
      });
      setCleanupOpen(false);
      await refreshStatus();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : t(`${I18N_PREFIX}.request_failed`),
      );
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setPageError("");
    try {
      await request<Record<string, never>>("/start", {
        method: "POST",
        body: JSON.stringify({
          driver,
          dsn,
          confirm_sqlite_risk: confirmSQLite,
          confirm_large_dataset: confirmLarge,
        }),
      });
      setStartOpen(false);
      await refreshStatus();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : t(`${I18N_PREFIX}.request_failed`),
      );
    } finally {
      setBusy(false);
    }
  };

  const progress =
    status?.state === "migrating" || status?.state === "cleaning"
      ? {
          value: displayedProgress,
          label: phaseText,
          detail: t(`${I18N_PREFIX}.progress_detail`, {
            done: formatNumber(displayedDone),
            total: formatNumber(displayedTotal),
            points: formatNumber(displayedWritten),
          }),
          determinate: displayedTotal > 0,
        }
      : null;

  return (
    <>
      <MigrationGuideShell
        title={t(`${I18N_PREFIX}.title`)}
        subtitle={t(`${I18N_PREFIX}.subtitle`)}
        progress={progress}
        footer={
          status?.state === "completed" ? undefined : (
            <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
              <Button
                variant="contained"
                disabled={operating || !status}
                endIcon={<ArrowRight size={18} />}
                onClick={() => setStartOpen(true)}
              >
                {t(`${I18N_PREFIX}.start`)}
              </Button>
            </Stack>
          )
        }
      >
        <Stack spacing={3}>
          {pageError && !preview ? <Alert severity="error">{pageError}</Alert> : null}

          {status?.state === "completed" ? (
            <Alert severity="success">
              <Typography variant="subtitle2">{t(`${I18N_PREFIX}.completed_title`)}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {t(`${I18N_PREFIX}.completed_description`)}
              </Typography>
            </Alert>
          ) : (
            <>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1.25 }}>
                  {t(`${I18N_PREFIX}.overview`)}
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gap: 2,
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                  }}
                >
                  <Box sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: "8px" }}>
                    <Typography variant="caption" color="text.secondary">
                      {t(`${I18N_PREFIX}.load_rows`)}
                    </Typography>
                    <Typography variant="h5" sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
                      {formatNumber(summary?.load_rows ?? 0)}
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75 }}>
                        {t(`${I18N_PREFIX}.rows`)}
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t(`${I18N_PREFIX}.gpu_rows`, { count: summary?.gpu_rows ?? 0 })}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: "8px" }}>
                    <Typography variant="caption" color="text.secondary">
                      {t(`${I18N_PREFIX}.latency_rows`)}
                    </Typography>
                    <Typography variant="h5" sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
                      {formatNumber(summary?.latency_rows ?? 0)}
                      <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75 }}>
                        {t(`${I18N_PREFIX}.rows`)}
                      </Typography>
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
                  {t(`${I18N_PREFIX}.overview_detail`, {
                    points: formatNumber(summary?.estimated_points ?? 0),
                    days: summary?.retention_days ?? 0,
                    servers: summary?.server_count ?? 0,
                  })}
                </Typography>
              </Box>

              <Box>
                <Typography variant="subtitle2">{t(`${I18N_PREFIX}.target`)}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
                  {t(`${I18N_PREFIX}.target_description`)}
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  value={driver}
                  onChange={handleDriver}
                  disabled={operating}
                  aria-label={t(`${I18N_PREFIX}.target`)}
                  sx={{
                    mb: 2,
                    borderRadius: "8px",
                    "& .MuiToggleButton-root": {
                      minHeight: 48,
                      px: { xs: 1.25, sm: 2 },
                      borderColor: "divider",
                      bgcolor: "background.paper",
                      color: "text.primary",
                      textTransform: "none",
                      gap: 0.85,
                      "&.Mui-selected": {
                        bgcolor: `${alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.09 : 0.16)} !important`,
                        color: "primary.main",
                        borderColor: alpha(theme.palette.primary.main, 0.48),
                      },
                    },
                  }}
                >
                  <ToggleButton value="sqlite">
                    <HardDrive size={16} />
                    <Typography variant="body2" color="inherit" sx={{ fontWeight: 600 }}>
                      {t(`${I18N_PREFIX}.sqlite_local`)}
                    </Typography>
                  </ToggleButton>
                  <ToggleButton value="mysql">
                    <Server size={16} />
                    <Typography variant="body2" color="inherit" sx={{ fontWeight: 600 }}>
                      {t(`${I18N_PREFIX}.mysql_remote`)}
                    </Typography>
                  </ToggleButton>
                  <ToggleButton value="postgresql">
                    <Server size={16} />
                    <Typography variant="body2" color="inherit" sx={{ fontWeight: 600 }}>
                      {t(`${I18N_PREFIX}.postgresql_remote`)}
                    </Typography>
                  </ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>
                  {t(`${I18N_PREFIX}.dsn`)}
                </Typography>
                <TextField
                  fullWidth
                  value={dsn}
                  onChange={(event) => setDSN(event.target.value)}
                  disabled={operating}
                  spellCheck={false}
                  helperText={t(`${I18N_PREFIX}.example`, { example: examples[driver] })}
                />
                {driver === "sqlite" ? (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    {t(`${I18N_PREFIX}.sqlite_warning`)}
                  </Alert>
                ) : null}
              </Box>

              <Box>
                <Typography variant="subtitle2">{t(`${I18N_PREFIX}.cleanup`)}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
                  {t(`${I18N_PREFIX}.cleanup_description`)}
                </Typography>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.5}
                  sx={{ alignItems: { sm: "flex-end" } }}
                >
                  <TextField
                    fullWidth
                    type="datetime-local"
                    label={t(`${I18N_PREFIX}.before`)}
                    value={cutoff}
                    onChange={(event) => setCutoff(event.target.value)}
                    disabled={operating}
                    slotProps={{
                      inputLabel: { shrink: true },
                      htmlInput: {
                        max: new Date(
                          Date.now() - new Date().getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16),
                      },
                    }}
                  />
                  <Button
                    color="error"
                    variant="outlined"
                    disabled={!cutoff || operating}
                    startIcon={<Trash2 size={17} />}
                    onClick={() => setCleanupOpen(true)}
                    sx={{ flexShrink: 0, minHeight: 44 }}
                  >
                    {t(`${I18N_PREFIX}.cleanup_action`)}
                  </Button>
                </Stack>
              </Box>

              {status?.state === "failed" ? (
                <Alert severity="error">
                  <Typography variant="subtitle2">{t(`${I18N_PREFIX}.failed_title`)}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {status.error}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {t(`${I18N_PREFIX}.retry_hint`)}
                  </Typography>
                </Alert>
              ) : null}
            </>
          )}
        </Stack>
      </MigrationGuideShell>

      <Dialog
        open={cleanupOpen}
        onClose={() => !busy && setCleanupOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t(`${I18N_PREFIX}.cleanup_title`)}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            {t(`${I18N_PREFIX}.cleanup_confirm`, {
              date: cutoff ? new Date(cutoff).toLocaleString(locale) : "-",
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setCleanupOpen(false)}>
            {t("cancel")}
          </Button>
          <Button color="error" variant="contained" disabled={busy} onClick={() => void cleanup()}>
            {busy ? <CircularProgress size={16} /> : t(`${I18N_PREFIX}.confirm_cleanup`)}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={startOpen}
        onClose={() => !busy && setStartOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t(`${I18N_PREFIX}.start_title`)}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            {t(`${I18N_PREFIX}.start_description`)}
          </Typography>
          {sqliteRisk ? (
            <Alert severity="warning" sx={{ mb: 1.5, alignItems: "flex-start" }}>
              <Typography variant="body2">
                {t(`${I18N_PREFIX}.sqlite_risk`, {
                  servers: summary?.server_count ?? 0,
                  days: summary?.retention_days ?? 0,
                })}
              </Typography>
              <FormControlLabel
                sx={{ mt: 0.5, alignItems: "flex-start" }}
                control={
                  <Checkbox
                    checked={confirmSQLite}
                    onChange={(event) => setConfirmSQLite(event.target.checked)}
                  />
                }
                label={t(`${I18N_PREFIX}.sqlite_confirm`)}
              />
            </Alert>
          ) : null}
          {largeRisk ? (
            <Alert severity="error" sx={{ alignItems: "flex-start" }}>
              <Typography variant="body2">{t(`${I18N_PREFIX}.large_risk`)}</Typography>
              <FormControlLabel
                sx={{ mt: 0.5, alignItems: "flex-start" }}
                control={
                  <Checkbox
                    checked={confirmLarge}
                    onChange={(event) => setConfirmLarge(event.target.checked)}
                  />
                }
                label={t(`${I18N_PREFIX}.large_confirm`)}
              />
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setStartOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={
              busy ||
              (sqliteRisk && !confirmSQLite) ||
              (largeRisk && !confirmLarge)
            }
            onClick={() => void start()}
          >
            {busy ? <CircularProgress size={16} /> : t(`${I18N_PREFIX}.confirm_start`)}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Upgrade127;
