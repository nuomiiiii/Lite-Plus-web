import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import MuiDialog from "@mui/material/Dialog";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Close from "@mui/icons-material/Close";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import { dialogContainerNoFadeSx, dialogPaperVisibility } from "@/theme/dialogCloseMotion";
import { isComponentType, spaceToPx } from "./shared";

type DialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("Dialog components must be used within Dialog.Root");
  }
  return ctx;
};

type DialogRootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  zIndex?: number;
  disableEnforceFocus?: boolean;
  mobileSheet?: boolean;
  children?: ReactNode;
};

function DialogTrigger({
  asChild,
  children,
  ...rest
}: {
  asChild?: boolean;
  children?: ReactNode;
  "aria-label"?: string;
  className?: string;
}) {
  const { setOpen } = useDialog();
  const open = (event: MouseEvent<HTMLElement>) => {
    (children as ReactElement<any>)?.props?.onClick?.(event);
    if (!event.defaultPrevented) setOpen(true);
  };
  if (isValidElement(children) && (asChild || true)) {
    return cloneElement(children as ReactElement<any>, {
      onClick: open,
      "aria-label": rest["aria-label"] ?? (children.props as { "aria-label"?: string })["aria-label"],
    });
  }
  return (
    <button type="button" className={rest.className} aria-label={rest["aria-label"]} onClick={open}>
      {children}
    </button>
  );
}
DialogTrigger.displayName = "DialogTrigger";

function DialogClose({
  children,
}: {
  children?: ReactNode;
}) {
  const { setOpen } = useDialog();
  if (isValidElement(children)) {
    return cloneElement(children as ReactElement<any>, {
      onClick: (event: MouseEvent<HTMLElement>) => {
        (children.props as { onClick?: (event: MouseEvent<HTMLElement>) => void }).onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      },
    });
  }
  return (
    <button type="button" onClick={() => setOpen(false)}>
      {children}
    </button>
  );
}
DialogClose.displayName = "DialogClose";

function DialogTitleNode({
  children,
  className,
  ...rest
}: {
  children?: ReactNode;
  className?: string;
}) {
  const { setOpen } = useDialog();
  const { t } = useTranslation();
  return (
    <DialogTitle className={className} sx={{ px: 0, pt: 0, pb: 1.5, fontWeight: 600 }} {...rest}>
      <Box className="km-admin-dialog-title-row">
        <Box component="span" className="km-admin-dialog-title-text">
          {children}
        </Box>
        <IconButton
          className="km-admin-dialog-title-close"
          size="small"
          title={t("common.close", "关闭")}
          aria-label={t("common.close", "关闭")}
          onClick={() => setOpen(false)}
        >
          <Close />
        </IconButton>
      </Box>
    </DialogTitle>
  );
}
DialogTitleNode.displayName = "DialogTitle";

function DialogDescription({
  children,
  className,
  size,
  color,
}: {
  children?: ReactNode;
  className?: string;
  size?: string | number;
  color?: string;
}) {
  return (
    <DialogContentText
      className={className}
      sx={{
        mb: 1.5,
        fontSize: size === "1" || size === 1 ? 12 : size === "3" || size === 3 ? 16 : 13.5,
        color: color === "gray" ? "text.secondary" : undefined,
      }}
    >
      {children}
    </DialogContentText>
  );
}
DialogDescription.displayName = "DialogDescription";

function DialogContent({
  children,
  className,
  style,
  maxWidth,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  maxWidth?: string | number;
}) {
  return (
    <Box
      className={className}
      style={style}
      sx={{
        p: 3,
        width: "100%",
        maxWidth: maxWidth ?? style?.maxWidth ?? "100%",
      }}
    >
      {children}
    </Box>
  );
}
DialogContent.displayName = "DialogContent";

function DialogRoot({
  open,
  defaultOpen,
  onOpenChange,
  zIndex,
  disableEnforceFocus,
  mobileSheet = false,
  children,
}: DialogRootProps) {
  const [uncontrolled, setUncontrolled] = useState(Boolean(defaultOpen));
  const isOpen = open ?? uncontrolled;
  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };
  const { triggers, body, paperMaxWidth } = useMemo(() => {
    const nextTriggers: ReactNode[] = [];
    const nextBody: ReactNode[] = [];
    let maxWidth: string | number | undefined;
    Children.forEach(children, (child) => {
      if (isValidElement(child) && isComponentType(child, DialogTrigger)) {
        nextTriggers.push(child);
        return;
      }
      if (isValidElement(child)) {
        const props = child.props as { maxWidth?: string | number; style?: CSSProperties };
        maxWidth = props.maxWidth ?? props.style?.maxWidth ?? maxWidth;
      }
      nextBody.push(child);
    });
    return { triggers: nextTriggers, body: nextBody, paperMaxWidth: maxWidth };
  }, [children]);

  return (
    <DialogContext.Provider value={{ open: isOpen, setOpen }}>
      {triggers}
      <MuiDialog
        open={isOpen}
        onClose={() => setOpen(false)}
        maxWidth={false}
        scroll="paper"
        disableScrollLock
        disableEnforceFocus={disableEnforceFocus}
        aria-describedby={undefined}
        sx={{
          ...(zIndex ? { zIndex } : {}),
          "& .MuiDialog-container": {
            ...dialogContainerNoFadeSx,
            ...(mobileSheet ? { alignItems: { xs: "flex-end", sm: "center" } } : {}),
          },
        }}
        slotProps={{
          paper: {
            className: mobileSheet ? "km-admin-sheet-panel" : undefined,
            sx: {
              visibility: dialogPaperVisibility(isOpen),
              width: "calc(100% - 32px)",
              maxWidth: paperMaxWidth ?? 480,
              m: 2,
              borderRadius: "8px",
              ...(mobileSheet ? {
                width: { xs: "100%", sm: "calc(100% - 32px)" },
                maxWidth: { xs: "100%", sm: paperMaxWidth ?? 480 },
                m: { xs: 0, sm: 2 },
                borderRadius: { xs: "12px 12px 0 0", sm: "8px" },
                maxHeight: { xs: "calc(100dvh - 24px)", sm: "calc(100% - 64px)" },
                pb: { xs: "env(safe-area-inset-bottom)", sm: 0 },
              } : {}),
            },
          },
        }}
      >
        {body}
      </MuiDialog>
    </DialogContext.Provider>
  );
}

export const Dialog = {
  Root: DialogRoot,
  Trigger: DialogTrigger,
  Close: DialogClose,
  Title: DialogTitleNode,
  Description: DialogDescription,
  Content: DialogContent,
};

type AppDialogContentProps = {
  title?: ReactNode;
  description?: ReactNode;
  visuallyHiddenDescription?: ReactNode;
  disableDescription?: boolean;
  titleProps?: object;
  descriptionProps?: { className?: string };
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  maxWidth?: string | number;
};

export function AppDialogContent({
  title,
  description,
  visuallyHiddenDescription,
  disableDescription = false,
  titleProps,
  descriptionProps,
  children,
  className,
  style,
  maxWidth,
}: AppDialogContentProps) {
  const descriptionContent = disableDescription
    ? null
    : visuallyHiddenDescription ?? description;
  const hasDescription =
    descriptionContent !== null &&
    descriptionContent !== undefined &&
    descriptionContent !== false &&
    descriptionContent !== "";
  const descriptionClassName = visuallyHiddenDescription
    ? ["sr-only", descriptionProps?.className].filter(Boolean).join(" ")
    : descriptionProps?.className;

  return (
    <DialogContent className={className} style={style} maxWidth={maxWidth}>
      {title !== undefined ? <DialogTitleNode {...titleProps}>{title}</DialogTitleNode> : null}
      {hasDescription ? (
        <DialogDescription className={descriptionClassName}>
          {descriptionContent}
        </DialogDescription>
      ) : null}
      {children}
    </DialogContent>
  );
}

const calloutSeverity = (color?: string) => {
  if (color === "red") return "error" as const;
  if (color === "green") return "success" as const;
  if (color === "orange" || color === "yellow") return "warning" as const;
  return "info" as const;
};

function CalloutIcon({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
CalloutIcon.displayName = "CalloutIcon";

function CalloutText({
  children,
  className,
  size,
  color,
}: {
  children?: ReactNode;
  className?: string;
  size?: string | number;
  color?: string;
}) {
  return (
    <Typography
      component="div"
      className={className}
      sx={{
        fontSize: size === "1" || size === 1 ? 12 : size === "3" || size === 3 ? 16 : 13.5,
        color: color === "gray" ? "text.secondary" : undefined,
      }}
    >
      {children}
    </Typography>
  );
}
CalloutText.displayName = "CalloutText";

function CalloutRoot({
  color,
  className,
  role,
  children,
  ...rest
}: {
  color?: string;
  size?: string | number;
  variant?: string;
  className?: string;
  role?: string;
  children?: ReactNode;
  [key: string]: any;
}) {
  let icon: ReactNode = undefined;
  const text: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && isComponentType(child, CalloutIcon)) {
      icon = (child.props as { children?: ReactNode }).children;
      return;
    }
    text.push(child);
  });
  return (
    <Alert
      className={className}
      role={role}
      severity={calloutSeverity(color)}
      icon={icon === undefined ? undefined : (icon as ReactElement)}
      sx={{
        borderRadius: "8px",
        mt: rest.mt ? spaceToPx(rest.mt) : undefined,
      }}
    >
      {text}
    </Alert>
  );
}

export const Callout = {
  Root: CalloutRoot,
  Icon: CalloutIcon,
  Text: CalloutText,
};
