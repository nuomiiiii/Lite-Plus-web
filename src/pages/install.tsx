import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  LoaderCircle,
  LockKeyhole,
  Settings2,
  ShieldCheck,
  Upload,
  Zap,
} from "@/components/admin/muiIcons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import InstallGuideShell from "@/components/install/InstallGuideShell";
import {
  INSTALL_STEP_IDS,
  type InstallSummary,
} from "@/components/install/installGuideModel";
import UploadDialog from "@/components/UploadDialog";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import { uploadArchive } from "@/utils/archiveUpload";
import { DEFAULT_SITE_DESCRIPTION, LITE_NAME } from "@/theme/brand";
import { getAppAssetUrl } from "@/utils/assetUrl";
import { sameOriginApiPath, sameOriginFetchInit } from "@/utils/security";
import {
  UPLOAD_RESTARTING_VISIBLE_MS,
  createCompletedUploadState,
  createRestartingUploadState,
  delay,
  type UploadProgressState,
  withUploadProgressCopy,
} from "@/utils/uploadProgress";

type APIResponse<T> = {
  status: "success" | "error";
  message?: string;
  data?: T;
};

type InstallStatus = { state: string; required: boolean };
type DatabaseMode = "sqlite" | "external";
type FieldName =
  | "username"
  | "password"
  | "passwordAgain"
  | "sitename"
  | "metricDSN";

const INSTALL_REDIRECT_DELAY_MS = 2500;
const SQLITE_DEFAULT_DSN = "./data/metrics.db";
const ALL_STEPS_COMPLETED = new Set(INSTALL_STEP_IDS.map((_, index) => index));
const PASSWORD_FIELD_SX = {
  "& input::-ms-reveal, & input::-ms-clear": { display: "none" },
};

function isSQLiteDSN(dsn: string): boolean {
  const normalized = dsn.trim().toLowerCase();
  return (
    !normalized.startsWith("mysql://") &&
    !normalized.startsWith("postgres://") &&
    !normalized.startsWith("postgresql://") &&
    !normalized.includes("@tcp(") &&
    !normalized.includes("@unix(") &&
    !normalized.includes("dbname=")
  );
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(
    sameOriginApiPath(`/api/install${path}`),
    sameOriginFetchInit({
      ...init,
      headers: init?.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init?.headers,
      cache: "no-store",
    }),
  );
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = (await response.json()) as APIResponse<T>;
  if (!response.ok || payload.status !== "success") {
    throw new Error(payload.message || `HTTP ${response.status}`);
  }
  return payload.data as T;
}

function StepHeading({
  step,
  title,
  description,
}: {
  step: number;
  title: ReactNode;
  description: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Box sx={{ mb: 3.5 }}>
      <Typography
        variant="overline"
        color="primary.main"
        sx={{ display: "block", letterSpacing: 0, mb: 0.6 }}
      >
        {t("install.guide.step_count", {
          current: step + 1,
          total: INSTALL_STEP_IDS.length,
        })}
      </Typography>
      <Typography variant="h4">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
        {description}
      </Typography>
    </Box>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      component="label"
      variant="body2"
      sx={{ display: "block", mb: 0.75, color: "text.primary", fontWeight: 600 }}
    >
      {children}
    </Typography>
  );
}

function WelcomeFeature({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <Box sx={{ minWidth: 0, pt: 1.75, borderTop: 2, borderColor: "primary.main" }}>
      <Stack direction="row" spacing={0.9} sx={{ alignItems: "center" }}>
        <Box sx={{ display: "grid", placeItems: "center", color: "primary.main" }}>{icon}</Box>
        <Typography variant="subtitle2">{title}</Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.55 }}>
        {description}
      </Typography>
    </Box>
  );
}

function FooterButtonIcon({ children }: { children: ReactNode }) {
  return <Box sx={{ display: "inline-flex", flexShrink: 0 }}>{children}</Box>;
}

export default function Install() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { publicInfo } = usePublicInfo();
  const [step, setStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    () => new Set(),
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordAgain, setShowPasswordAgain] = useState(false);
  const [sitename, setSitename] = useState(LITE_NAME);
  const [description, setDescription] = useState(DEFAULT_SITE_DESCRIPTION);
  const [databaseMode, setDatabaseMode] = useState<DatabaseMode>(() =>
    isSQLiteDSN(SQLITE_DEFAULT_DSN) ? "sqlite" : "external",
  );
  const [sqliteDraft, setSQLiteDraft] = useState(SQLITE_DEFAULT_DSN);
  const [externalDraft, setExternalDraft] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<FieldName, string>>
  >({});
  const [busy, setBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreState, setRestoreState] = useState<UploadProgressState | null>(
    null,
  );
  const restoreController = useRef<AbortController | null>(null);
  const restoreStateRef = useRef<UploadProgressState | null>(null);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [restartCountdown, setRestartCountdown] = useState<number | null>(null);

  const metricDSN = databaseMode === "sqlite" ? sqliteDraft : externalDraft;
  const version =
    typeof publicInfo?.version === "string" && publicInfo.version.trim()
      ? publicInfo.version.trim()
      : null;

  const restoreCopy = {
    preparing: t("install.phase_preparing", "Preparing backup"),
    uploading: t("install.phase_uploading", "Uploading backup"),
    merging: t("install.phase_processing", "Restoring installation data"),
    processing: t("install.phase_processing", "Restoring installation data"),
    restarting: t("install.phase_restarting", "Restarting service"),
    completed: t("install.phase_completed", "Restore completed"),
    failed: t("install.restore_failed"),
    nonCancelable: t(
      "install.phase_non_cancelable",
      "Server processing has started and can no longer be canceled",
    ),
  };

  const setTrackedRestoreState = (state: UploadProgressState | null) => {
    restoreStateRef.current = state;
    setRestoreState(state);
  };

  const loadStatus = useCallback(async () => {
    setReady(null);
    setStatusError("");
    try {
      const status = await request<InstallStatus>("/status");
      setReady(status.required);
    } catch (reason) {
      setStatusError(
        reason instanceof Error ? reason.message : t("install.connection_error"),
      );
    }
  }, [t]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (ready !== false) return;
    const redirect = window.setTimeout(
      () => window.location.replace("/"),
      INSTALL_REDIRECT_DELAY_MS,
    );
    return () => window.clearTimeout(redirect);
  }, [ready]);

  const clearFieldError = (field: FieldName) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError("");
  };

  const validateCurrentStep = () => {
    const nextErrors: Partial<Record<FieldName, string>> = {};
    if (step === 1) {
      if (!username.trim()) {
        nextErrors.username = t("install.username_required");
      }
      if (password.length < 8) {
        nextErrors.password = t("account.password_too_short_error");
      } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        nextErrors.password = t("account.password_strength_error");
      }
      if (password !== passwordAgain) {
        nextErrors.passwordAgain = t("account.password_mismatch_error");
      }
    }
    if (step === 2 && !sitename.trim()) {
      nextErrors.sitename = t("install.sitename_required");
    }
    if (step === 3 && !metricDSN.trim()) {
      nextErrors.metricDSN = t("install.dsn_required");
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const next = () => {
    setError("");
    if (!validateCurrentStep()) return;
    setCompletedSteps((current) => new Set(current).add(step));
    setStep((current) => Math.min(current + 1, INSTALL_STEP_IDS.length - 1));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (step !== INSTALL_STEP_IDS.length - 1) {
      next();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/complete", {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          sitename,
          description,
          metric_dsn: metricDSN,
        }),
      });
      setCompletedSteps(new Set(ALL_STEPS_COMPLETED));
      setReady(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("install.failed"));
      setBusy(false);
    }
  };

  const restoreBackup = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setError(t("install.restore_file_type"));
      return;
    }

    setError("");
    setRestartCountdown(null);
    setTrackedRestoreState(null);
    const controller = new AbortController();
    restoreController.current = controller;
    try {
      await uploadArchive({
        basePath: "/api/install/upload",
        purpose: "backup",
        file,
        signal: controller.signal,
        onStateChange: (state) => {
          const nextState =
            state.stage === "merging"
              ? withUploadProgressCopy(
                  {
                    ...state,
                    stage: "processing",
                    indeterminate: true,
                    canCancel: false,
                    percent: null,
                  },
                  restoreCopy,
                )
              : state;
          setTrackedRestoreState(
            "stage" in nextState
              ? withUploadProgressCopy(nextState, restoreCopy)
              : nextState,
          );
        },
      });
      setTrackedRestoreState(
        withUploadProgressCopy(
          createRestartingUploadState(restoreStateRef.current),
          restoreCopy,
        ),
      );
      await delay(UPLOAD_RESTARTING_VISIBLE_MS);
      setTrackedRestoreState(
        withUploadProgressCopy(
          createCompletedUploadState(restoreStateRef.current, {
            detail: t(
              "install.phase_redirecting",
              "Opening the dashboard shortly",
            ),
          }),
          restoreCopy,
        ),
      );
      restoreController.current = null;
      setRestartCountdown(5);
      window.setTimeout(() => window.location.assign("/"), 5000);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setError(
          reason instanceof Error ? reason.message : t("install.restore_failed"),
        );
      }
      setTrackedRestoreState(null);
      setRestartCountdown(null);
      restoreController.current = null;
    }
  };

  const cancelRestore = () => {
    restoreController.current?.abort();
    setTrackedRestoreState(null);
    setRestartCountdown(null);
  };

  useEffect(() => {
    if (restartCountdown === null || restartCountdown <= 0) return;
    const timer = window.setTimeout(() => {
      setRestartCountdown((current) =>
        current === null ? current : Math.max(0, current - 1),
      );
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [restartCountdown]);

  const showAdminSummary = step >= 1 || completedSteps.has(1);
  const showSiteSummary = step >= 2 || completedSteps.has(2);
  const showDatabaseSummary = step >= 3 || completedSteps.has(3);
  const databaseKind = isSQLiteDSN(metricDSN)
    ? t("install.guide.database_sqlite_short")
    : t("install.guide.database_external_short");
  const summary = useMemo<InstallSummary>(
    () => ({
      administrator: showAdminSummary ? username.trim() || null : null,
      sitename: showSiteSummary ? sitename.trim() || null : null,
      database: showDatabaseSummary
        ? metricDSN.trim()
          ? `${databaseKind} · ${metricDSN.trim()}`
          : null
        : null,
    }),
    [
      databaseKind,
      metricDSN,
      showAdminSummary,
      showDatabaseSummary,
      showSiteSummary,
      sitename,
      username,
    ],
  );

  const passwordRules = [
    {
      key: "length",
      met: password.length >= 8,
      label: t("install.guide.password_rule_length"),
    },
    {
      key: "letters",
      met: /(?=.*[a-z])(?=.*[A-Z])/.test(password),
      label: t("install.guide.password_rule_letters"),
    },
    {
      key: "number",
      met: /\d/.test(password),
      label: t("install.guide.password_rule_number"),
    },
  ];
  const passwordScore = password
    ? Math.min(4, 1 + passwordRules.filter((rule) => rule.met).length)
    : 0;
  const passwordStrengthKey =
    passwordScore === 0
      ? "empty"
      : passwordScore === 1
        ? "weak"
        : passwordScore === 2
          ? "fair"
          : passwordScore === 3
            ? "good"
            : "strong";
  const strengthColor =
    passwordScore <= 1
      ? theme.palette.error.main
      : passwordScore <= 3
        ? theme.palette.warning.main
        : theme.palette.success.main;

  const restoreDisabled = busy || Boolean(restoreState) || ready === null;
  const footerActions = (
    <Stack
      direction="row"
      spacing={1}
      sx={{ width: { xs: "100%", sm: "auto" }, justifyContent: "flex-end" }}
    >
      {step > 0 ? (
        <Button
          type="button"
          variant="outlined"
          color="inherit"
          disabled={busy || Boolean(restoreState)}
          onClick={() => {
            setError("");
            setFieldErrors({});
            setStep((current) => Math.max(0, current - 1));
          }}
          sx={{ minHeight: 40, flex: { xs: 1, sm: "none" }, gap: 0.75 }}
        >
          <FooterButtonIcon>
            <ArrowLeft size={16} />
          </FooterButtonIcon>
          {t("install.back")}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outlined"
          disabled={restoreDisabled}
          onClick={() => setRestoreOpen(true)}
          sx={{ minHeight: 40, flex: { xs: 1, sm: "none" }, gap: 0.75 }}
        >
          <FooterButtonIcon>
            {restoreState ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
          </FooterButtonIcon>
          {t("install.guide.restore_backup")}
        </Button>
      )}
      {step < INSTALL_STEP_IDS.length - 1 ? (
        <Button
          type="submit"
          variant="contained"
          disabled={Boolean(restoreState)}
          sx={{ minHeight: 40, flex: { xs: 1, sm: "none" }, gap: 0.75 }}
        >
          {t(step === 0 ? "install.guide.start_setup" : "install.next")}
          <FooterButtonIcon>
            <ArrowRight size={16} />
          </FooterButtonIcon>
        </Button>
      ) : (
        <Button
          type="submit"
          variant="contained"
          disabled={busy || ready === null}
          sx={{ minHeight: 40, flex: { xs: 1, sm: "none" }, gap: 0.75 }}
        >
          <FooterButtonIcon>
            {busy ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}
          </FooterButtonIcon>
          {t("install.complete")}
        </Button>
      )}
    </Stack>
  );

  if (ready === null) {
    return (
      <InstallGuideShell
        step={0}
        completedSteps={completedSteps}
        summary={{ administrator: null, sitename: null, database: null }}
        serviceStatus={statusError ? "error" : "checking"}
        version={version}
      >
        <Stack
          spacing={2.5}
          sx={{
            minHeight: 360,
            textAlign: "center",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-live="polite"
        >
          {statusError ? (
            <>
              <Alert severity="error" sx={{ width: "100%", maxWidth: 480, textAlign: "left" }}>
                {statusError}
              </Alert>
              <Button variant="contained" onClick={() => void loadStatus()}>
                {t("install.guide.retry")}
              </Button>
            </>
          ) : (
            <>
              <CircularProgress size={30} />
              <Typography color="text.secondary">
                {t("install.guide.checking_status")}
              </Typography>
            </>
          )}
        </Stack>
      </InstallGuideShell>
    );
  }

  if (ready === false) {
    return (
      <InstallGuideShell
        step={INSTALL_STEP_IDS.length - 1}
        completedSteps={ALL_STEPS_COMPLETED}
        summary={summary}
        completed
        serviceStatus="connected"
        version={version}
      >
        <Stack
          spacing={2}
          sx={{
            minHeight: 440,
            textAlign: "center",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-live="polite"
        >
          <Box
            sx={{
              width: 68,
              height: 68,
              display: "grid",
              placeItems: "center",
              borderRadius: "50%",
              color: "success.main",
              bgcolor: alpha(theme.palette.success.main, theme.palette.mode === "light" ? 0.1 : 0.18),
            }}
          >
            <CheckCircle2 size={34} strokeWidth={2} />
          </Box>
          <Box>
            <Typography variant="h4">{t("install.completed_title")}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {t("install.guide.completed_description")}
            </Typography>
          </Box>
          <Button variant="contained" onClick={() => window.location.assign("/")} sx={{ mt: 1 }}>
            {t("install.guide.enter_console")}
          </Button>
        </Stack>
      </InstallGuideShell>
    );
  }

  return (
    <>
      <InstallGuideShell
        step={step}
        completedSteps={completedSteps}
        summary={summary}
        footerActions={footerActions}
        onSubmit={submit}
        onRestore={() => setRestoreOpen(true)}
        restoreDisabled={restoreDisabled}
        serviceStatus="connected"
        version={version}
      >
        {error ? (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        ) : null}

        {step === 0 ? (
          <Box sx={{ pt: { xs: 0, sm: 2, md: 4 } }}>
            <Box
              component="img"
              src={getAppAssetUrl("assets/logo.png?v=lite-icon-0e86dd")}
              alt={LITE_NAME}
              sx={{ width: 54, height: 54, objectFit: "contain" }}
            />
            <Typography variant="h3" sx={{ mt: 2.25 }}>
              {t("install.welcome_title")}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 620 }}>
              {t("install.guide.welcome_description")}
            </Typography>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
                gap: { xs: 2.25, sm: 1.5 },
                mt: 4.5,
              }}
            >
              <WelcomeFeature
                icon={<HardDrive size={17} />}
                title={t("install.guide.feature_local_title")}
                description={t("install.guide.feature_local_description")}
              />
              <WelcomeFeature
                icon={<Zap size={17} />}
                title={t("install.guide.feature_fast_title")}
                description={t("install.guide.feature_fast_description")}
              />
              <WelcomeFeature
                icon={<Settings2 size={17} />}
                title={t("install.guide.feature_flexible_title")}
                description={t("install.guide.feature_flexible_description")}
              />
            </Box>
          </Box>
        ) : null}

        {step === 1 ? (
          <Box>
            <StepHeading
              step={step}
              title={t("install.admin_title")}
              description={t("install.guide.admin_description")}
            />
            <Stack spacing={2.5}>
              <Box>
                <FieldLabel>{t("install.guide.admin_username")}</FieldLabel>
                <TextField
                  fullWidth
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    clearFieldError("username");
                  }}
                  autoComplete="username"
                  autoFocus
                  error={Boolean(fieldErrors.username)}
                  helperText={fieldErrors.username || t("install.guide.username_hint")}
                  slotProps={{
                    htmlInput: { "aria-label": t("install.guide.admin_username") },
                  }}
                />
              </Box>
              <Box>
                <Stack
                  direction="row"
                  sx={{ mb: 0.75, justifyContent: "space-between", alignItems: "center" }}
                >
                  <Typography component="label" variant="body2" sx={{ fontWeight: 600 }}>
                    {t("install.password")}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("install.guide.password_strength", {
                      strength: t(`install.guide.strength_${passwordStrengthKey}`),
                    })}
                  </Typography>
                </Stack>
                <TextField
                  fullWidth
                  type={showPassword ? "text" : "password"}
                  sx={PASSWORD_FIELD_SX}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearFieldError("password");
                  }}
                  autoComplete="new-password"
                  error={Boolean(fieldErrors.password)}
                  helperText={fieldErrors.password}
                  slotProps={{
                    htmlInput: { "aria-label": t("install.password") },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            type="button"
                            edge="end"
                            aria-label={t(
                              showPassword
                                ? "install.guide.hide_password"
                                : "install.guide.show_password",
                            )}
                            onClick={() => setShowPassword((current) => !current)}
                          >
                            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <Box
                  aria-hidden="true"
                  sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.65, mt: 1.1 }}
                >
                  {[0, 1, 2, 3].map((segment) => (
                    <Box
                      key={segment}
                      sx={{
                        height: 3,
                        borderRadius: 2,
                        bgcolor:
                          segment < passwordScore
                            ? strengthColor
                            : alpha(theme.palette.text.secondary, 0.18),
                        transition: "background-color 180ms ease",
                      }}
                    />
                  ))}
                </Box>
                <Stack direction="row" sx={{ mt: 1, gap: 1.5, flexWrap: "wrap" }}>
                  {passwordRules.map((rule) => (
                    <Stack
                      key={rule.key}
                      direction="row"
                      spacing={0.45}
                      sx={{
                        alignItems: "center",
                        color: rule.met ? "success.main" : "text.secondary",
                      }}
                    >
                      <Check size={13} />
                      <Typography variant="caption" color="inherit">
                        {rule.label}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </Box>
              <Box>
                <FieldLabel>{t("install.password_confirm")}</FieldLabel>
                <TextField
                  fullWidth
                  type={showPasswordAgain ? "text" : "password"}
                  sx={PASSWORD_FIELD_SX}
                  value={passwordAgain}
                  onChange={(event) => {
                    setPasswordAgain(event.target.value);
                    clearFieldError("passwordAgain");
                  }}
                  autoComplete="new-password"
                  error={Boolean(fieldErrors.passwordAgain)}
                  helperText={fieldErrors.passwordAgain}
                  slotProps={{
                    htmlInput: { "aria-label": t("install.password_confirm") },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            type="button"
                            edge="end"
                            aria-label={t(
                              showPasswordAgain
                                ? "install.guide.hide_password"
                                : "install.guide.show_password",
                            )}
                            onClick={() => setShowPasswordAgain((current) => !current)}
                          >
                            {showPasswordAgain ? <EyeOff size={17} /> : <Eye size={17} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </Box>
            </Stack>
          </Box>
        ) : null}

        {step === 2 ? (
          <Box>
            <StepHeading
              step={step}
              title={t("install.guide.site_title")}
              description={t("install.guide.site_description")}
            />
            <Stack spacing={2.5}>
              <Box>
                <FieldLabel>{t("install.sitename")}</FieldLabel>
                <TextField
                  fullWidth
                  value={sitename}
                  onChange={(event) => {
                    setSitename(event.target.value);
                    clearFieldError("sitename");
                  }}
                  autoFocus
                  error={Boolean(fieldErrors.sitename)}
                  helperText={fieldErrors.sitename || t("install.guide.sitename_hint")}
                  slotProps={{ htmlInput: { "aria-label": t("install.sitename") } }}
                />
              </Box>
              <Box>
                <FieldLabel>{t("install.description")}</FieldLabel>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  helperText={t("install.guide.description_hint")}
                  slotProps={{ htmlInput: { "aria-label": t("install.description") } }}
                />
              </Box>
            </Stack>
          </Box>
        ) : null}

        {step === 3 ? (
          <Box>
            <StepHeading
              step={step}
              title={t("install.guide.database_title")}
              description={t("install.guide.database_description")}
            />
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={databaseMode}
              onChange={(_, value: DatabaseMode | null) => {
                if (value) {
                  setDatabaseMode(value);
                  clearFieldError("metricDSN");
                }
              }}
              aria-label={t("install.guide.database_mode")}
              sx={{
                mb: 2.5,
                borderRadius: "8px",
                "& .MuiToggleButton-root": {
                  minHeight: 48,
                  px: { xs: 1.25, sm: 2 },
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  color: "text.primary",
                  textTransform: "none",
                  gap: 0.85,
                  transition: "color 160ms ease, background-color 160ms ease, border-color 160ms ease",
                  "&:hover": {
                    bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.04 : 0.08),
                  },
                  "&.Mui-selected": {
                    bgcolor: `${alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.09 : 0.16)} !important`,
                    color: "primary.main",
                    borderColor: alpha(theme.palette.primary.main, 0.48),
                  },
                  "&.Mui-selected:hover": {
                    bgcolor: `${alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.12 : 0.2)} !important`,
                  },
                },
              }}
            >
              <ToggleButton value="sqlite">
                <HardDrive size={18} />
                <Typography variant="body2" color="inherit" sx={{ fontWeight: 600 }}>
                  {t("install.guide.database_sqlite")}
                </Typography>
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ color: databaseMode === "sqlite" ? "primary.main" : "text.secondary" }}
                >
                  {t("install.guide.recommended")}
                </Typography>
              </ToggleButton>
              <ToggleButton value="external">
                <Database size={18} />
                <Typography variant="body2" color="inherit" sx={{ fontWeight: 600 }}>
                  {t("install.guide.database_external")}
                </Typography>
              </ToggleButton>
            </ToggleButtonGroup>
            <Box>
              <FieldLabel>
                {t(
                  databaseMode === "sqlite"
                    ? "install.guide.sqlite_path"
                    : "install.guide.external_dsn",
                )}
              </FieldLabel>
              <TextField
                fullWidth
                value={metricDSN}
                onChange={(event) => {
                  if (databaseMode === "sqlite") {
                    setSQLiteDraft(event.target.value);
                  } else {
                    setExternalDraft(event.target.value);
                  }
                  clearFieldError("metricDSN");
                }}
                autoFocus
                placeholder={
                  databaseMode === "sqlite"
                    ? SQLITE_DEFAULT_DSN
                    : "postgresql://user:password@host:5432/database"
                }
                error={Boolean(fieldErrors.metricDSN)}
                helperText={
                  fieldErrors.metricDSN ||
                  t(
                    databaseMode === "sqlite"
                      ? "install.guide.sqlite_path_hint"
                      : "install.guide.external_dsn_hint",
                  )
                }
                slotProps={{
                  htmlInput: {
                    "aria-label": t(
                      databaseMode === "sqlite"
                        ? "install.guide.sqlite_path"
                        : "install.guide.external_dsn",
                    ),
                  },
                }}
              />
            </Box>
            {databaseMode === "sqlite" ? (
              <Alert severity="warning" variant="standard" sx={{ mt: 2.5 }}>
                {t("install.guide.sqlite_notice")}
              </Alert>
            ) : null}
          </Box>
        ) : null}

        {step === 4 ? (
          <Box>
            <StepHeading
              step={step}
              title={t("install.confirm_title")}
              description={t("install.guide.confirm_description")}
            />
            <Box sx={{ borderTop: 1, borderBottom: 1, borderColor: "divider" }}>
              {[
                {
                  label: t("install.guide.summary_administrator"),
                  value: username,
                  target: 1,
                  icon: <ShieldCheck size={18} />,
                },
                {
                  label: t("install.guide.summary_sitename"),
                  value: sitename,
                  target: 2,
                  icon: <Settings2 size={18} />,
                },
                {
                  label: t("install.description"),
                  value: description.trim() || t("install.guide.not_provided"),
                  target: 2,
                  icon: <LockKeyhole size={18} />,
                },
                {
                  label: t("install.guide.summary_database"),
                  value: `${databaseKind} · ${metricDSN}`,
                  target: 3,
                  icon: <Database size={18} />,
                },
              ].map((item, index, items) => (
                <Box key={item.label}>
                  <Stack direction="row" spacing={1.5} sx={{ py: 2, alignItems: "center" }}>
                    <Box sx={{ display: "grid", placeItems: "center", color: "text.secondary" }}>
                      {item.icon}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {item.label}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.2, fontWeight: 500, overflowWrap: "anywhere" }}>
                        {item.value}
                      </Typography>
                    </Box>
                    <Button
                      type="button"
                      variant="text"
                      size="small"
                      onClick={() => {
                        setError("");
                        setFieldErrors({});
                        setStep(item.target);
                      }}
                    >
                      {t("install.guide.modify")}
                    </Button>
                  </Stack>
                  {index < items.length - 1 ? <Divider /> : null}
                </Box>
              ))}
            </Box>
          </Box>
        ) : null}
      </InstallGuideShell>

      <UploadDialog
        open={restoreOpen}
        onOpenChange={(open) => {
          setRestoreOpen(open);
          if (!open && restoreState?.stage !== "completed") {
            setTrackedRestoreState(null);
            setRestartCountdown(null);
          }
        }}
        title={t("install.restore")}
        description={error || t("install.restore_description")}
        accept=".zip"
        dragDropText={t("theme.drag_drop")}
        clickToBrowseText={t("theme.or_click_to_browse")}
        hintText={t("theme.zip_files_only")}
        uploadState={
          restartCountdown !== null && restoreState?.stage === "completed"
            ? {
                ...restoreState,
                detail: t("install.phase_redirect_countdown", {
                  defaultValue: "Opening the dashboard in {{count}}s",
                  count: restartCountdown,
                }),
              }
            : restoreState
        }
        cancelUploadLabel={t("common.cancel")}
        onCancelUpload={cancelRestore}
        onFileSelected={restoreBackup}
        closeLabel={t("common.cancel")}
      />
    </>
  );
}
