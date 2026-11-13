import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Close from "@mui/icons-material/Close";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useReduceMotionPreference } from "@/lib/api";
import { dialogContainerNoFadeSx, dialogPaperVisibility } from "@/theme/dialogCloseMotion";

type SettingsSheetDialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  headerAction?: ReactNode;
  actions?: ReactNode;
  maxWidth?: number;
  disableClose?: boolean;
  disableEscapeKeyDown?: boolean;
  conceal?: boolean;
  hideBackdrop?: boolean;
  scrollContent?: boolean;
};

export default function SettingsSheetDialog({
  open,
  onClose,
  title,
  children,
  headerAction,
  actions,
  maxWidth = 560,
  disableClose = false,
  disableEscapeKeyDown = false,
  conceal = false,
  hideBackdrop = false,
  scrollContent = false,
}: SettingsSheetDialogProps) {
  const { t } = useTranslation();
  const reduceMotion = useReduceMotionPreference();

  return (
    <Dialog
      open={open}
      keepMounted
      onClose={(_, reason) => {
        if (disableClose && reason === "backdropClick") return;
        if ((disableEscapeKeyDown || disableClose) && reason === "escapeKeyDown") return;
        onClose();
      }}
      fullWidth
      maxWidth={false}
      scroll="paper"
      disableScrollLock
      hideBackdrop={hideBackdrop}
      transitionDuration={reduceMotion ? 0 : { enter: 220, exit: 160 }}
      slotProps={{
        paper: {
          className: "km-admin-sheet-panel",
          sx: {
            visibility: dialogPaperVisibility(open, conceal),
            ...(scrollContent ? { overflow: "hidden" } : {}),
            width: { xs: "100%", sm: maxWidth },
            maxWidth: { xs: "100%", sm: maxWidth },
            m: { xs: 0, sm: 2 },
            mt: { xs: "auto", sm: 2 },
            mb: { xs: 0, sm: 2 },
            borderRadius: { xs: "12px 12px 0 0", sm: "8px" },
            maxHeight: {
              xs: "calc(100dvh - 24px)",
              sm: "calc(100% - 64px)",
            },
            pb: { xs: "env(safe-area-inset-bottom)", sm: 0 },
          },
        },
        backdrop: {
          sx: {
            bgcolor: (theme) =>
              theme.palette.mode === "dark"
                ? "rgba(4, 9, 14, 0.56)"
                : "rgba(16, 24, 32, 0.24)",
          },
        },
      }}
      sx={{
        pointerEvents: conceal ? "none" : undefined,
        "& .MuiDialog-container": {
          alignItems: { xs: "flex-end", sm: "center" },
          ...dialogContainerNoFadeSx,
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1.5,
          fontWeight: 700,
          fontSize: 18,
          lineHeight: 1.4,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: headerAction ? "center" : "flex-start",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Typography component="span" sx={{ fontWeight: 700, fontSize: 18, pr: 1 }}>
            {title}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}>
            {headerAction}
            <IconButton
              size="small"
              disabled={disableClose}
              onClick={onClose}
              aria-label={t("common.close", "关闭")}
              title={t("common.close", "关闭")}
              sx={{ mt: headerAction ? 0 : -0.5, mr: -0.75 }}
            >
              <Close fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent
        sx={{
          px: 3,
          pt: "0 !important",
          pb: 0,
          display: "flex",
          flexDirection: "column",
          gap: 2,
          ...(scrollContent ? { minHeight: 0, overflowY: "auto" } : {}),
          "&:first-of-type": { paddingTop: "0 !important" },
        }}
      >
        {children}
      </DialogContent>
      {actions ? (
        <DialogActions
          sx={{
            px: 3,
            py: 2,
            gap: 1,
            justifyContent: "flex-end",
            ...(scrollContent ? { borderTop: 1, borderColor: "divider" } : {}),
            "& > :not(style) ~ :not(style)": { ml: 0 },
          }}
        >
          {actions}
        </DialogActions>
      ) : null}
    </Dialog>
  );
}

const sheetButtonSx = {
  minHeight: { xs: 44, sm: 38 },
  fontSize: 13,
  px: 1.7,
};

export function SettingsSheetActions({
  onCancel,
  onConfirm,
  cancelLabel,
  confirmLabel,
  confirmDisabled,
  confirmColor = "primary",
  loading,
  left,
}: {
  onCancel?: () => void;
  onConfirm?: () => void;
  cancelLabel?: ReactNode;
  confirmLabel?: ReactNode;
  confirmDisabled?: boolean;
  confirmColor?: "primary" | "error";
  loading?: boolean;
  left?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      {left ? <Box sx={{ mr: "auto" }}>{left}</Box> : null}
      {onCancel ? (
        <Button
          onClick={onCancel}
          variant="outlined"
          color="inherit"
          sx={sheetButtonSx}
        >
          {cancelLabel ?? t("common.cancel")}
        </Button>
      ) : null}
      {onConfirm ? (
        <Button
          onClick={onConfirm}
          variant="contained"
          color={confirmColor}
          disabled={confirmDisabled || loading}
          sx={sheetButtonSx}
        >
          {confirmLabel ?? t("common.save")}
        </Button>
      ) : null}
    </>
  );
}
