import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Divider from "@mui/material/Divider";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import { Check, Upload } from "@/components/admin/muiIcons";
import type { FormEventHandler, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  LanguageMenu,
  ThemeMenu,
} from "@/components/admin/shell/ChromeActions";
import {
  INSTALL_STEP_IDS,
  type InstallSummary,
} from "@/components/install/installGuideModel";
import { LITE_NAME } from "@/theme/brand";
import { getAppAssetUrl } from "@/utils/assetUrl";

type ServiceStatus = "checking" | "connected" | "error";

type InstallGuideShellProps = {
  step: number;
  completedSteps: ReadonlySet<number>;
  summary: InstallSummary;
  children: ReactNode;
  footerActions?: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  onRestore?: () => void;
  restoreDisabled?: boolean;
  completed?: boolean;
  serviceStatus?: ServiceStatus;
  version?: string | null;
};

const DESKTOP_QUERY = "@media (min-width: 1200px)";
const TABLET_QUERY = "@media (min-width: 768px)";

function HeaderStatus({ status }: { status: ServiceStatus }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tone =
    status === "error"
      ? theme.palette.error.main
      : status === "connected"
        ? theme.palette.success.main
        : theme.palette.warning.main;

  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{
        alignItems: "center",
        display: { xs: "none", sm: "flex" },
        minHeight: 32,
        px: 1.25,
        border: 1,
        borderColor: "divider",
        borderRadius: "6px",
        color: "text.secondary",
        whiteSpace: "nowrap",
      }}
    >
      <Box
        aria-hidden="true"
        sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: tone }}
      />
      <Typography variant="caption" sx={{ fontSize: 12.5 }}>
        {t(`install.guide.service_${status}`)}
      </Typography>
    </Stack>
  );
}

function InstallHeader({ status }: { status: ServiceStatus }) {
  return (
    <Paper
      component="header"
      square
      elevation={0}
      sx={{
        height: { xs: 56, sm: 64 },
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Stack
        direction="row"
        sx={{
          height: "100%",
          px: { xs: 2, sm: 3.5 },
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
          <Box
            component="img"
            src={getAppAssetUrl("assets/logo.png?v=lite-icon-0e86dd")}
            alt={LITE_NAME}
            sx={{ width: 34, height: 34, objectFit: "contain" }}
          />
          <Typography
            component="span"
            sx={{ color: "primary.main", fontSize: 20, fontWeight: 700 }}
          >
            {LITE_NAME}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          <HeaderStatus status={status} />
          <LanguageMenu />
          <ThemeMenu />
        </Stack>
      </Stack>
    </Paper>
  );
}

function StepNavigation({
  step,
  completedSteps,
  completed,
}: {
  step: number;
  completedSteps: ReadonlySet<number>;
  completed: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Stack component="ol" sx={{ p: 0, m: 0, listStyle: "none" }}>
      {INSTALL_STEP_IDS.map((id, index) => {
        const isCurrent = !completed && index === step;
        const isCompleted = completed || completedSteps.has(index);
        return (
          <Box
            component="li"
            key={id}
            aria-current={isCurrent ? "step" : undefined}
            sx={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "28px minmax(0, 1fr)",
              columnGap: 1.5,
              minHeight: 58,
              pb: index === INSTALL_STEP_IDS.length - 1 ? 0 : 1.25,
              "&::after":
                index === INSTALL_STEP_IDS.length - 1
                  ? undefined
                  : {
                      content: '""',
                      position: "absolute",
                      left: 13.5,
                      top: 30,
                      bottom: 0,
                      width: "1px",
                      bgcolor: isCompleted
                        ? alpha(theme.palette.success.main, 0.38)
                        : "divider",
                    },
            }}
          >
            <Box
              sx={{
                zIndex: 1,
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                border: 1,
                borderColor: isCurrent
                  ? "primary.main"
                  : isCompleted
                    ? alpha(theme.palette.success.main, 0.34)
                    : "divider",
                bgcolor: isCurrent
                  ? "primary.main"
                  : isCompleted
                    ? alpha(theme.palette.success.main, theme.palette.mode === "light" ? 0.1 : 0.18)
                    : "background.paper",
                color: isCurrent
                  ? "primary.contrastText"
                  : isCompleted
                    ? "success.main"
                    : "text.secondary",
                boxShadow: isCurrent
                  ? `0 0 0 4px ${alpha(theme.palette.primary.main, theme.palette.mode === "light" ? 0.1 : 0.18)}`
                  : "none",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {isCompleted ? <Check size={15} strokeWidth={2.4} /> : index + 1}
            </Box>
            <Box sx={{ minWidth: 0, pt: 0.25 }}>
              <Typography
                variant="body2"
                sx={{
                  color: isCurrent ? "text.primary" : "text.secondary",
                  fontWeight: isCurrent ? 600 : 500,
                  lineHeight: 1.35,
                }}
              >
                {t(`install.guide.steps.${id}.title`)}
              </Typography>
              <Typography
                variant="caption"
                sx={{ display: "block", mt: 0.15, color: "text.secondary" }}
              >
                {t(`install.guide.steps.${id}.description`)}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

function SummaryRows({
  summary,
  compact = false,
  serviceStatus,
}: {
  summary: InstallSummary;
  compact?: boolean;
  serviceStatus: ServiceStatus;
}) {
  const { t } = useTranslation();
  const items = [
    {
      label: t("install.guide.summary_administrator"),
      value: summary.administrator,
    },
    { label: t("install.guide.summary_sitename"), value: summary.sitename },
    { label: t("install.guide.summary_database"), value: summary.database },
  ];

  if (compact) {
    return (
      <Box
        data-testid="install-compact-summary"
        sx={{
          display: "none",
          mb: 3.5,
          py: 1.75,
          borderTop: 1,
          borderBottom: 1,
          borderColor: "divider",
          [TABLET_QUERY]: {
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 2,
          },
          [DESKTOP_QUERY]: { display: "none" },
        }}
      >
        {items.map((item) => (
          <Box key={item.label} sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary">
              {item.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{ mt: 0.25, fontWeight: 500, overflowWrap: "anywhere" }}
            >
              {item.value || t("install.guide.pending")}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  }

  const statusText = t(`install.guide.service_${serviceStatus}`);
  return (
    <Box>
      <Box sx={{ py: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {t("install.guide.summary_status")}
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ mt: 0.45, alignItems: "center" }}>
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              bgcolor:
                serviceStatus === "connected"
                  ? "success.main"
                  : serviceStatus === "error"
                    ? "error.main"
                    : "warning.main",
            }}
          />
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color:
                serviceStatus === "connected"
                  ? "success.main"
                  : serviceStatus === "error"
                    ? "error.main"
                    : "text.primary",
            }}
          >
            {statusText}
          </Typography>
        </Stack>
      </Box>
      <Divider />
      {items.map((item) => (
        <Box key={item.label}>
          <Box sx={{ py: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {item.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{ mt: 0.45, fontWeight: 500, overflowWrap: "anywhere" }}
            >
              {item.value || t("install.guide.pending")}
            </Typography>
          </Box>
          <Divider />
        </Box>
      ))}
    </Box>
  );
}

export default function InstallGuideShell({
  step,
  completedSteps,
  summary,
  children,
  footerActions,
  onSubmit,
  onRestore,
  restoreDisabled = false,
  completed = false,
  serviceStatus = "connected",
  version,
}: InstallGuideShellProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const currentId = INSTALL_STEP_IDS[Math.min(step, INSTALL_STEP_IDS.length - 1)];

  return (
    <Box
      data-testid="install-guide"
      sx={{
        minHeight: "100dvh",
        pt: "var(--safe-area-top)",
        pb: "var(--safe-area-bottom)",
        bgcolor:
          theme.palette.mode === "light"
            ? "#eef2f6"
            : theme.palette.background.default,
        "& .MuiOutlinedInput-root:not(.MuiInputBase-multiline)": {
          minHeight: 44,
        },
        "& .MuiOutlinedInput-root:not(.MuiInputBase-multiline) .MuiOutlinedInput-input": {
          height: "auto",
        },
      }}
    >
      <InstallHeader status={serviceStatus} />
      <Box
        component="main"
        sx={{
          width: "100%",
          maxWidth: 1648,
          mx: "auto",
          px: 2,
          py: 2,
          [TABLET_QUERY]: { px: 3, py: 3 },
          [DESKTOP_QUERY]: { py: 5 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            overflow: "hidden",
            border: 1,
            borderColor: "divider",
            boxShadow:
              theme.palette.mode === "light"
                ? "0 10px 28px rgba(145, 158, 171, 0.13)"
                : "0 10px 28px rgba(0, 0, 0, 0.2)",
            minHeight: "calc(100dvh - 88px)",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            [TABLET_QUERY]: {
              minHeight: 650,
              height: "clamp(650px, calc(100dvh - 112px), 820px)",
              gridTemplateColumns: "260px minmax(0, 1fr)",
            },
            [DESKTOP_QUERY]: {
              gridTemplateColumns: "288px minmax(0, 1fr) 304px",
            },
            "@media (min-width: 1440px)": {
              gridTemplateColumns: "304px minmax(0, 1fr) 320px",
            },
          }}
        >
          <Box
            component="aside"
            sx={{
              display: "none",
              minWidth: 0,
              p: 3.25,
              borderRight: 1,
              borderColor: "divider",
              bgcolor:
                theme.palette.mode === "light"
                  ? "#fbfcfd"
                  : alpha(theme.palette.common.white, 0.018),
              [TABLET_QUERY]: { display: "flex", flexDirection: "column" },
            }}
          >
            <Typography variant="overline" color="primary.main" sx={{ letterSpacing: 0 }}>
              {t("install.guide.first_install")}
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.35 }}>
              {t("install.guide.setup_lite")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 3.5 }}>
              {t("install.guide.setup_description")}
            </Typography>
            <StepNavigation
              step={step}
              completedSteps={completedSteps}
              completed={completed}
            />
            <Box sx={{ mt: "auto", pt: 3 }}>
              <Divider sx={{ mb: 2.25 }} />
              {version ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                  {LITE_NAME} {version}
                </Typography>
              ) : null}
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                {t("install.guide.local_only")}
              </Typography>
            </Box>
          </Box>

          <Box
            component={onSubmit ? "form" : "section"}
            onSubmit={onSubmit}
            noValidate={onSubmit ? true : undefined}
            sx={{ minWidth: 0, display: "flex", flexDirection: "column" }}
          >
            {!completed ? (
              <Box
                sx={{
                  display: "block",
                  px: 2,
                  pt: 2.5,
                  [TABLET_QUERY]: { display: "none" },
                }}
              >
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: "baseline", justifyContent: "space-between" }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t("install.guide.step_count", {
                      current: step + 1,
                      total: INSTALL_STEP_IDS.length,
                    })}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {t(`install.guide.steps.${currentId}.title`)}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={((step + 1) / INSTALL_STEP_IDS.length) * 100}
                  sx={{ mt: 1, height: 4, borderRadius: 2 }}
                />
              </Box>
            ) : null}

            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                px: 2,
                py: 3,
                [TABLET_QUERY]: { px: 4, py: 3.75 },
                [DESKTOP_QUERY]: { px: 5, py: 4.5 },
              }}
            >
              <Box sx={{ width: "100%", maxWidth: completed ? 720 : 670, mx: "auto" }}>
                {!completed ? (
                  <SummaryRows
                    summary={summary}
                    compact
                    serviceStatus={serviceStatus}
                  />
                ) : null}
                {children}
              </Box>
            </Box>

            {!completed && footerActions ? (
              <Box
                sx={{
                  borderTop: 1,
                  borderColor: "divider",
                  px: 2,
                  py: 1.5,
                  [TABLET_QUERY]: { px: 4, py: 1.75 },
                  [DESKTOP_QUERY]: { px: 5 },
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1.25}
                  sx={{
                    width: "100%",
                    maxWidth: 670,
                    mx: "auto",
                    alignItems: { xs: "stretch", sm: "center" },
                    justifyContent: "space-between",
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {step === 0
                      ? t("install.guide.estimated_time")
                      : t("install.guide.step_count", {
                          current: step + 1,
                          total: INSTALL_STEP_IDS.length,
                        })}
                  </Typography>
                  {footerActions}
                </Stack>
              </Box>
            ) : null}
          </Box>

          <Box
            component="aside"
            sx={{
              display: "none",
              minWidth: 0,
              p: 3.25,
              borderLeft: 1,
              borderColor: "divider",
              bgcolor:
                theme.palette.mode === "light"
                  ? "#fbfcfd"
                  : alpha(theme.palette.common.white, 0.018),
              [DESKTOP_QUERY]: { display: "block" },
            }}
          >
            <Typography variant="h6" sx={{ fontSize: 16 }}>
              {t("install.guide.summary_title")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, mb: 1 }}>
              {t("install.guide.summary_description")}
            </Typography>
            <Divider />
            <SummaryRows summary={summary} serviceStatus={serviceStatus} />
            {!completed && step === 0 && onRestore ? (
              <Box
                sx={{
                  mt: 3,
                  p: 2,
                  border: 1,
                  borderStyle: "dashed",
                  borderColor: "divider",
                  borderRadius: "8px",
                }}
              >
                <Typography variant="subtitle2">
                  {t("install.guide.backup_title")}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                  {t("install.guide.backup_description")}
                </Typography>
                <ButtonBase
                  type="button"
                  disabled={restoreDisabled}
                  onClick={onRestore}
                  sx={{
                    mt: 1.25,
                    color: "primary.main",
                    fontSize: 13,
                    fontWeight: 600,
                    gap: 0.75,
                    borderRadius: "6px",
                    "&:focus-visible": {
                      outline: `2px solid ${alpha(theme.palette.primary.main, 0.4)}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Upload size={14} />
                  {t("install.restore")}
                </ButtonBase>
              </Box>
            ) : null}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
