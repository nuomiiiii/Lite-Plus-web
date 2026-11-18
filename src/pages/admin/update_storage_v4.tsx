import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, RefreshCw } from "@/components/admin/muiIcons";
import { startVisibleInterval } from "@/hooks/useVisibleInterval";

import MigrationGuideShell from "@/components/install/MigrationGuideShell";
import { isGuidePreview } from "@/utils/guidePreview";
import { useSearchParams } from "react-router-dom";

const API_BASE = "/api/admin/update/storage-v4";
const I18N_PREFIX = "settings.update_storage_v4";

type MigrationSummary = {
  required: boolean;
  layout: string;
  source_rows: number;
  legacy_blocks: number;
  legacy_digest_blocks: number;
  legacy_axis_blocks: number;
};

type MigrationStatus = {
  state: "pending" | "migrating" | "completed" | "failed";
  phase: string;
  current: number;
  total: number;
  preserved: number;
  deferred: number;
  progress: number;
  elapsed_ms: number;
  summary: MigrationSummary;
  error?: string;
};

type APIResponse<T> = { status: "success" | "error"; message: string; data?: T };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
    cache: "no-store",
  });
  const payload = (await response.json()) as APIResponse<T>;
  if (!response.ok || payload.status !== "success" || payload.data === undefined) {
    throw new Error(payload.message || `HTTP ${response.status}`);
  }
  return payload.data;
}

export default function StorageV4Upgrade() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language || "en-US";
  const formatNumber = useCallback(
    (value: number) => new Intl.NumberFormat(locale).format(value),
    [locale],
  );
  const [searchParams] = useSearchParams();
  const preview = searchParams.get("preview") === "1" || isGuidePreview();
  const [status, setStatus] = useState<MigrationStatus | null>(() =>
    isGuidePreview() ? previewStatus() : null,
  );
  const [pageError, setPageError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (preview) {
      const next = previewStatus();
      setStatus(next);
      setPageError("");
      return next;
    }
    try {
      const next = await request<MigrationStatus>("/status");
      setStatus(next);
      setPageError("");
      return next;
    } catch (error) {
      setPageError(error instanceof Error ? error.message : t(`${I18N_PREFIX}.network_error`));
      return null;
    }
  }, [preview, t]);

  useEffect(() => {
    if (preview) {
      setPageError("");
      setStatus(previewStatus());
      return;
    }
    void refreshStatus();
  }, [preview, refreshStatus]);

  useEffect(() => {
    if (preview) return;
    if (status?.state === "completed" || status?.state === "failed") return;
    return startVisibleInterval(() => void refreshStatus(), 500);
  }, [preview, refreshStatus, status?.state]);

  useEffect(() => {
    if (preview || status?.state !== "completed") return;
    const timer = window.setTimeout(() => window.location.replace("/"), 2400);
    return () => window.clearTimeout(timer);
  }, [preview, status?.state]);

  const phaseText = useMemo(() => {
    const key = status?.phase || "preparing";
    return t(`${I18N_PREFIX}.phase_${key}`, {
      defaultValue: t(`${I18N_PREFIX}.phase_preparing`),
    });
  }, [status?.phase, t]);

  const retry = async () => {
    setRetrying(true);
    setPageError("");
    try {
      await request<Record<string, never>>("/retry", { method: "POST" });
      await refreshStatus();
    } catch (error) {
      setPageError(error instanceof Error ? error.message : t(`${I18N_PREFIX}.retry_failed`));
    } finally {
      setRetrying(false);
    }
  };

  const operating = status?.state === "migrating" || status?.state === "pending";
  const progress =
    operating && status
      ? {
          value: status.progress ?? 0,
          label: phaseText,
          detail: t(`${I18N_PREFIX}.progress_detail`, {
            done: formatNumber(status.current ?? 0),
            total: formatNumber(status.total ?? status.summary.source_rows ?? 0),
          }),
          determinate: (status.total ?? 0) > 0,
        }
      : null;

  return (
    <MigrationGuideShell
      title={t(`${I18N_PREFIX}.title`)}
      subtitle={t(`${I18N_PREFIX}.subtitle`)}
      progress={progress}
    >
      <Stack spacing={2}>
          {pageError && !preview ? <Alert severity="error">{pageError}</Alert> : null}

          {status?.state === "completed" ? (
            <Alert
              severity="success"
              icon={<CheckCircle2 size={22} />}
              sx={{ alignItems: "flex-start" }}
            >
              <Typography variant="subtitle2">{t(`${I18N_PREFIX}.completed_title`)}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {t(`${I18N_PREFIX}.completed_description`)}
              </Typography>
            </Alert>
          ) : null}

          {status && status.state !== "completed" ? (
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, minmax(0, 1fr))" },
              }}
            >
              <Metric label={t(`${I18N_PREFIX}.preserved`)} value={formatNumber(status.preserved ?? 0)} />
              <Metric label={t(`${I18N_PREFIX}.deferred`)} value={formatNumber(status.deferred ?? 0)} />
              <Metric
                label={t(`${I18N_PREFIX}.source_rows`)}
                value={formatNumber(status.summary.source_rows ?? 0)}
              />
              <Metric label={t(`${I18N_PREFIX}.elapsed`)} value={formatElapsed(status.elapsed_ms ?? 0)} />
            </Box>
          ) : null}

          {(status?.deferred ?? 0) > 0 && status?.state !== "failed" ? (
            <Alert severity="warning">
              {t(`${I18N_PREFIX}.deferred_hint`, { count: status?.deferred ?? 0 })}
            </Alert>
          ) : null}

          {status?.state === "failed" ? (
            <Alert severity="error" sx={{ alignItems: "flex-start" }}>
              <Typography variant="subtitle2">{t(`${I18N_PREFIX}.failed_title`)}</Typography>
              <Typography variant="body2" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
                {status.error}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {t(`${I18N_PREFIX}.failed_hint`)}
              </Typography>
              <Button
                sx={{ mt: 1.5 }}
                color="error"
                variant="outlined"
                disabled={retrying}
                startIcon={
                  retrying ? <CircularProgress size={16} /> : <RefreshCw size={16} />
                }
                onClick={() => void retry()}
              >
                {t(`${I18N_PREFIX}.retry`)}
              </Button>
            </Alert>
          ) : null}

          {!status && !pageError ? (
            <Stack direction="row" spacing={1.25} sx={{ py: 4, justifyContent: "center", alignItems: "center" }}>
              <CircularProgress size={18} />
              <Typography color="text.secondary">{t(`${I18N_PREFIX}.loading`)}</Typography>
            </Stack>
          ) : null}
      </Stack>
    </MigrationGuideShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{ mt: 0.5, fontWeight: 700, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function previewStatus(): MigrationStatus {
  return {
    state: "migrating",
    phase: "encoding_points",
    current: 12840,
    total: 20000,
    preserved: 12600,
    deferred: 12,
    progress: 64,
    elapsed_ms: 185000,
    summary: {
      required: true,
      layout: "normalized",
      source_rows: 20000,
      legacy_blocks: 0,
      legacy_digest_blocks: 0,
      legacy_axis_blocks: 0,
    },
  };
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(rest).padStart(2, "0")}` : `${rest}s`;
}
