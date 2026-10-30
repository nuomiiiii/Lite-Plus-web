import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Fade from "@mui/material/Fade";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { Plus, Server, X } from "@/components/admin/muiIcons";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LiveDataResponse, Record as LiveRecord } from "@/types/LiveData";
import RemoteSession, { type ConnectionState, type RemoteNode } from "./RemoteSession";
import { getRemoteLaunchTarget } from "@/utils/remoteLaunch";
import { createRandomId } from "@/utils/randomId";
import {
  confirmAdminPasskey,
  passkeyUnavailableMessage,
} from "@/utils/webauthn";
import {
  captureRotatedRemoteGrant,
  clearStoredRemoteGrant,
  isRemoteGrantLive,
  loadStoredRemoteGrant,
  localizeRemoteError,
  saveStoredRemoteGrant,
} from "@/utils/remoteSession";
import { useAccount } from "@/contexts/AccountContext";
import { useRPC2Call } from "@/contexts/RPC2Context";
import { SettingsProvider } from "@/lib/api";
import { RequireAllowRemoteManagement } from "@/components/admin/RemoteManagementGate";
import { CommandClipboardProvider } from "@/contexts/CommandClipboardContext";
import Loading from "@/components/loading";
import { mergeLatestStatus } from "@/utils/liveData";
import { resolveAdminAuthView } from "@/utils/adminAuth";
import RemoteNodePicker from "@/components/remote/RemoteNodePicker";
import { orderRemoteNodes } from "@/utils/remoteNodePicker";
import Flag from "@/components/Flag";
import LiteBrand from "@/components/LiteBrand";
import { AppearanceSegment, ThemeMenu } from "@/components/admin/shell/ChromeActions";
import AuthStandAlonePage, { authCancelButtonSx, authFieldSx, authPrimaryButtonSx } from "@/components/admin/shell/AuthStandAlonePage";
import { useTranslation } from "react-i18next";
import { clearRemoteVisualViewport, REMOTE_COMPACT_QUERY, SiteFavicon, remoteConfirmDialogProps, syncRemoteVisualViewport } from "./remoteChrome";
import "./Terminal.css";

type RemoteTab = {
  id: string;
  uuid: string;
};

const maxTabs = 16;
const liveStatusInterval = 3_000;
type AuthorizationState = "checking" | "required" | "authorized" | "error";
type PickerOrigin = "left" | "right" | "center";

type SortableRemoteTabProps = {
  tab: RemoteTab;
  label: string;
  active: boolean;
  connected: boolean;
  flag?: string;
  detail: string;
  onActivate: () => void;
  onClose: () => void;
};

function SortableRemoteTab({
  tab,
  label,
  active,
  connected,
  flag,
  detail,
  onActivate,
  onClose,
}: SortableRemoteTabProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id });
  return (
    <Box
      ref={setNodeRef}
      component="button"
      type="button"
      className={`remote-rail-session${active ? " is-active" : ""}${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={onActivate}
      {...attributes}
      {...listeners}
    >
      <Box className="admin-node-country-flag" sx={{ flexShrink: 0, lineHeight: 0 }}>
        <Flag flag={flag || "UN"} width={28} height={21} />
      </Box>
      <span className="remote-rail-session-copy" title={label}>
        <strong>{label}</strong>
        <small>
          <i className={connected ? "is-connected" : ""} />
          {detail}
        </small>
      </span>
      <IconButton
        size="small"
        title={t("terminal.session.close_tab")}
        aria-label={t("terminal.session.close_tab")}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X size={13} />
      </IconButton>
    </Box>
  );
}

type RemoteAuthFieldsProps = {
  twoFaEnabled: boolean;
  passkeyAvailable?: boolean;
  authFailed: boolean;
  otpInput: string;
  passwordInput: string;
  otpError: string;
  submitLabel: string;
  cancelLabel: string;
  onOtp: (value: string) => void;
  onPassword: (value: string) => void;
  onSubmit: () => void;
  onPasskey?: () => void;
  onCancel: () => void;
  onRetry: () => void;
  cancelAsText?: boolean;
};

function RemoteAuthFields({
  twoFaEnabled,
  passkeyAvailable = false,
  authFailed,
  otpInput,
  passwordInput,
  otpError,
  submitLabel,
  cancelLabel,
  onOtp,
  onPassword,
  onSubmit,
  onPasskey,
  onCancel,
  onRetry,
  cancelAsText = false,
}: RemoteAuthFieldsProps) {
  const { t } = useTranslation();
  if (authFailed) {
    return (
      <Button variant="contained" fullWidth onClick={onRetry} sx={authPrimaryButtonSx}>
        {t("common.retry")}
      </Button>
    );
  }
  return (
    <Box
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Stack spacing={2}>
        {twoFaEnabled ? (
          <TextField
            fullWidth
            type="text"
            inputMode="numeric"
            autoFocus
            autoComplete="one-time-code"
            label={t("login.two_factor")}
            value={otpInput}
            error={Boolean(otpError)}
            helperText={otpError || undefined}
            onChange={(event) => onOtp(event.target.value.replace(/\D/g, ""))}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={authFieldSx}
          />
        ) : (
          <TextField
            fullWidth
            type="password"
            autoFocus
            autoComplete="current-password"
            label={t("login.password")}
            value={passwordInput}
            error={Boolean(otpError)}
            helperText={otpError || undefined}
            onChange={(event) => onPassword(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={authFieldSx}
          />
        )}
        <Button
          type="submit"
          variant="contained"
          fullWidth
          disabled={twoFaEnabled ? !otpInput : !passwordInput}
          sx={authPrimaryButtonSx}
        >
          {submitLabel}
        </Button>
        {passkeyAvailable && onPasskey ? (
          <Button
            type="button"
            variant="outlined"
            fullWidth
            onClick={onPasskey}
            sx={{ minHeight: 52, color: "text.primary", borderColor: "divider" }}
          >
            {t("login.passkey", "使用通行密钥")}
          </Button>
        ) : null}
        {cancelAsText ? (
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Box
              component="button"
              type="button"
              onClick={onCancel}
              sx={{
                ...authCancelButtonSx,
                mt: 0.25,
                minHeight: "auto",
                minWidth: 0,
                width: "auto",
                px: 0,
                py: 0,
                lineHeight: 1.4,
                border: 0,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {cancelLabel}
            </Box>
          </Box>
        ) : (
          <Button fullWidth onClick={onCancel} sx={authCancelButtonSx}>
            {cancelLabel}
          </Button>
        )}
      </Stack>
    </Box>
  );
}

export default function TerminalWorkspace() {
  const { t } = useTranslation();
  const accountState = useAccount();
  const view = resolveAdminAuthView(accountState);

  if (view === "loading") {
    return <Loading fullscreen />;
  }
  if (view === "error") {
    return (
      <Box className="remote-empty-workspace">
        <Typography component="strong">{t("login.account_status_failed")}</Typography>
        <Button variant="contained" onClick={() => void accountState.refresh()}>{t("common.retry")}</Button>
      </Box>
    );
  }
  if (view === "login") {
    return <Navigate to="/admin" replace />;
  }
  return (
    <SettingsProvider>
      <RequireAllowRemoteManagement loadingFallback={<Loading fullscreen />}>
        <TerminalWorkspaceInner />
      </RequireAllowRemoteManagement>
    </SettingsProvider>
  );
}

function TerminalWorkspaceInner() {
  const { t } = useTranslation();
  const { account } = useAccount();
  const compact = useMediaQuery(REMOTE_COMPACT_QUERY, { noSsr: true });
  const twoFaEnabled = Boolean(account?.["2fa_enabled"]);
  const initialUUID = useMemo(() => getRemoteLaunchTarget(), []);
  const [nodes, setNodes] = useState<RemoteNode[]>([]);
  const [tabs, setTabs] = useState<RemoteTab[]>([]);
  const [activeID, setActiveID] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSide, setPickerSide] = useState<PickerOrigin>("right");
  const [sessionSheetOpen, setSessionSheetOpen] = useState(false);
  const [pickerUUID, setPickerUUID] = useState("");
  const [live, setLive] = useState<Record<string, LiveRecord>>({});
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [connectionByTab, setConnectionByTab] = useState<Record<string, ConnectionState>>({});
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [authorization, setAuthorization] = useState<AuthorizationState>("checking");
  const [workspaceEntered, setWorkspaceEntered] = useState(false);
  const [grantLive, setGrantLive] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [otpInput, setOtpInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [otpError, setOtpError] = useState("");
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const initialized = useRef(false);
  const authorizationStarted = useRef(false);
  const grantRef = useRef("");
  const grantExpiresAtRef = useRef(0);
  const pageIDRef = useRef(loadStoredRemoteGrant("remote")?.pageID || createRandomId());
  const sessionQueue = useRef(Promise.resolve());
  const liveDataRef = useRef<LiveDataResponse | null>(null);
  const tabsRef = useRef(tabs);
  const workspaceEnteredRef = useRef(false);
  tabsRef.current = tabs;
  workspaceEnteredRef.current = workspaceEntered;
  const { callViaHTTP } = useRPC2Call();
  const tabSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, {}),
  );

  useEffect(() => {
    if (!workspaceEntered) {
      document.documentElement.classList.remove("remote-terminal-open");
      return;
    }
    document.documentElement.classList.add("remote-terminal-open");
    return () => document.documentElement.classList.remove("remote-terminal-open");
  }, [workspaceEntered]);

  useLayoutEffect(() => {
    if (!workspaceEntered || !compact) {
      clearRemoteVisualViewport();
      return;
    }
    const update = () => syncRemoteVisualViewport();
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      clearRemoteVisualViewport();
    };
  }, [compact, workspaceEntered]);

  const addTab = useCallback((uuid: string) => {
    if (!uuid) return;
    if (!isRemoteGrantLive(grantRef.current, grantExpiresAtRef.current)) {
      setReauthOpen(true);
      return;
    }
    if (tabs.length >= maxTabs) {
      toast.error(t("terminal.session.max_tabs", { count: maxTabs }));
      return;
    }
    const tab = { id: createRandomId(), uuid };
    setTabs((current) => [...current, tab]);
    setActiveID(tab.id);
  }, [t, tabs.length]);

  useEffect(() => {
    fetch("/api/admin/client/list")
      .then((response) => response.json())
      .then((payload) => {
        const data = Array.isArray(payload) ? payload : payload?.data;
        const list = Array.isArray(data) ? data : [];
        setNodes(list);
      })
      .catch(() => toast.error(t("terminal.session.load_nodes_failed")))
      .finally(() => setNodesLoaded(true));
  }, [t]);

  useEffect(() => {
    fetch("/api/admin/account/passkeys")
      .then((response) => response.json())
      .then((body) => {
        const items = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        setPasskeyAvailable(items.length > 0);
      })
      .catch(() => setPasskeyAvailable(false));
  }, []);

  const authorizeRemote = useCallback(async (credentials?: { password?: string; otp?: string; passkey?: boolean }) => {
    setOtpError("");
    const password = credentials?.password || passwordInput;
    const otp = credentials?.otp || otpInput;
    setPasswordInput("");
    setOtpInput("");
    try {
      let ceremony_id: string | undefined;
      let credential: unknown;
      if (credentials?.passkey) {
        const assertion = await confirmAdminPasskey();
        ceremony_id = assertion.ceremony_id;
        credential = assertion.credential;
      }
      const response = await fetch("/api/admin/client/remote/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          scope: "remote",
          page_id: pageIDRef.current,
          password: password || undefined,
          otp: otp || undefined,
          ceremony_id,
          credential,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const nextGrant = payload?.data?.grant;
        if (typeof nextGrant !== "string" || !nextGrant) {
          throw new Error(t("terminal.session.auth_failed"));
        }
        grantRef.current = nextGrant;
        const expiresAt = Date.parse(String(payload?.data?.expires_at ?? ""));
        grantExpiresAtRef.current = Number.isFinite(expiresAt) ? expiresAt : 0;
        saveStoredRemoteGrant("remote", nextGrant, grantExpiresAtRef.current, pageIDRef.current);
        workspaceEnteredRef.current = true;
        setWorkspaceEntered(true);
        setGrantLive(true);
        setAuthorization("authorized");
        setReauthOpen(false);
        return;
      }
      const message = localizeRemoteError(payload?.message, t) || (
        response.status === 429 ? t("terminal.session.auth_rate_limited") : t("common.error")
      );
      setOtpError(message);
      if (workspaceEnteredRef.current) {
        setReauthOpen(true);
        return;
      }
      if (response.status === 429 || response.status === 401 || response.status === 403) {
        setAuthorization("required");
        return;
      }
      throw new Error(localizeRemoteError(payload?.message, t) || t("terminal.session.auth_failed"));
    } catch (error) {
      const code = passkeyUnavailableMessage(error, "");
      if (code === "cancelled") {
        setOtpError(t("account.passkey_cancelled"));
        return;
      }
      setOtpError(
        error instanceof Error
          ? localizeRemoteError(error.message, t)
          : t("terminal.session.auth_failed"),
      );
      if (!workspaceEnteredRef.current) {
        setAuthorization("error");
      } else {
        setReauthOpen(true);
      }
    } finally {
      setPasswordInput("");
      setOtpInput("");
    }
  }, [otpInput, passwordInput, t]);

  useEffect(() => {
    if (authorizationStarted.current) return;
    authorizationStarted.current = true;
    const stored = loadStoredRemoteGrant("remote");
    if (stored) {
      grantRef.current = stored.grant;
      grantExpiresAtRef.current = stored.expiresAt;
      if (stored.pageID) pageIDRef.current = stored.pageID;
      workspaceEnteredRef.current = true;
      setWorkspaceEntered(true);
      setGrantLive(true);
      setAuthorization("authorized");
      return;
    }
    setAuthorization("required");
  }, []);

  useEffect(() => {
    if (!grantLive) return;
    const timer = window.setInterval(() => {
      if (Date.now() < grantExpiresAtRef.current) return;
      grantRef.current = "";
      grantExpiresAtRef.current = 0;
      clearStoredRemoteGrant("remote");
      setGrantLive(false);
      setOtpError("");
      if (workspaceEnteredRef.current) {
        setPickerOpen(false);
        setReauthOpen(true);
        return;
      }
      setAuthorization("required");
    }, 1000);
    return () => window.clearInterval(timer);
  }, [grantLive]);

  const handleGrantRejected = useCallback(() => {
    grantRef.current = "";
    grantExpiresAtRef.current = 0;
    clearStoredRemoteGrant("remote");
    setGrantLive(false);
    setOtpError("");
    if (tabsRef.current.length > 0) {
      setPickerOpen(false);
      setReauthOpen(true);
      return;
    }
    workspaceEnteredRef.current = false;
    setWorkspaceEntered(false);
    setReauthOpen(false);
    setAuthorization("required");
  }, []);

  const createRemoteSession = useCallback((uuid: string, signal?: AbortSignal) => {
    let outcome: Promise<{ session_id: string; browser_ticket: string }>;
    const queued = sessionQueue.current.catch(() => undefined).then(async () => {
      const grant = grantRef.current;
      if (!grant) {
        handleGrantRejected();
        throw new Error(t("terminal.session.errors.grant_required"));
      }
      const response = await fetch("/api/admin/client/remote/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ uuid, grant, page_id: pageIDRef.current }),
        signal,
      });
      const payload = await response.json().catch(() => ({}));
      const rotated = captureRotatedRemoteGrant(payload);
      if (rotated) {
        grantRef.current = rotated.grant;
        if (rotated.expiresAt) {
          grantExpiresAtRef.current = rotated.expiresAt;
        }
        saveStoredRemoteGrant("remote", rotated.grant, grantExpiresAtRef.current, pageIDRef.current);
      }
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(t("terminal.session.session_full"));
        }
        const message = String(payload?.message ?? "");
        if (!rotated && /grant/i.test(message)) {
          handleGrantRejected();
        }
        throw new Error(localizeRemoteError(payload?.message, t));
      }
      const data = payload?.data ?? {};
      const sessionID = String(data.session_id ?? "");
      const browserTicket = String(data.browser_ticket ?? "");
      if (!sessionID || !browserTicket) {
        throw new Error(t("terminal.session.errors.secure_session_failed"));
      }
      return { session_id: sessionID, browser_ticket: browserTicket };
    });
    outcome = queued;
    sessionQueue.current = queued.then(() => undefined, () => undefined);
    return outcome;
  }, [handleGrantRejected, t]);

  const handleConnectionChange = useCallback((tabId: string, state: ConnectionState) => {
    setConnectionByTab((current) => {
      if (current[tabId] === state) return current;
      return { ...current, [tabId]: state };
    });
  }, []);

  useEffect(() => {
    if (!nodesLoaded || !workspaceEntered || !grantLive || initialized.current) return;
    initialized.current = true;
    if (!initialUUID) return;
    const requested = nodes.find((node) => node.uuid === initialUUID);
    if (!requested) {
      toast.error(t("terminal.session.node_not_found"));
      return;
    }
    addTab(requested.uuid);
  }, [addTab, grantLive, initialUUID, nodes, nodesLoaded, t, workspaceEntered]);

  useEffect(() => {
    if (!workspaceEntered) return;

    let timer: number | undefined;
    let stopped = false;
    let running = false;

    const clearTimer = () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timer = undefined;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (!stopped && !document.hidden) {
        timer = window.setTimeout(refresh, liveStatusInterval);
      }
    };

    const refresh = async () => {
      if (running || stopped || document.hidden) return;
      running = true;
      try {
        const result = await callViaHTTP<undefined, Record<string, any>>(
          "common:getNodesLatestStatus",
        );
        if (stopped) return;
        const payload = mergeLatestStatus(result, liveDataRef.current);
        liveDataRef.current = payload;
        setLive(payload.data.data);
        setOnline(new Set(payload.data.online));
      } catch {
        // The remote session remains usable; the next poll refreshes status.
      } finally {
        running = false;
        scheduleNext();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
      } else if (!running) {
        void refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    if (!document.hidden) void refresh();

    return () => {
      stopped = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [callViaHTTP, workspaceEntered]);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.uuid, node])), [nodes]);
  const labels = useMemo(() => {
    const counts = new Map<string, number>();
    return tabs.map((tab) => {
      const count = (counts.get(tab.uuid) || 0) + 1;
      counts.set(tab.uuid, count);
      const name = nodeMap.get(tab.uuid)?.name || tab.uuid.slice(0, 8);
      return count === 1 ? name : `${name} (${count})`;
    });
  }, [nodeMap, tabs]);

  const closeTab = useCallback((id: string) => {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    setConnectionByTab((current) => {
      if (!(id in current)) return current;
      const rest = { ...current };
      delete rest[id];
      return rest;
    });
    if (activeID === id) {
      setActiveID(next[Math.min(index, next.length - 1)]?.id || "");
    }
  }, [activeID, tabs]);

  const reorderTabs = useCallback(({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setTabs((current) => {
      const oldIndex = current.findIndex((tab) => tab.id === active.id);
      const newIndex = current.findIndex((tab) => tab.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }, []);

  const openNode = useCallback((uuid: string) => {
    const node = nodes.find((item) => item.uuid === uuid);
    if (!node) {
      toast.error(t("terminal.session.node_not_found"));
      return;
    }
    addTab(uuid);
  }, [addTab, nodes, t]);

  const openPicker = (side: PickerOrigin = "right") => {
    if (!isRemoteGrantLive(grantRef.current, grantExpiresAtRef.current)) {
      setReauthOpen(true);
      return;
    }
    setSessionSheetOpen(false);
    if (!compact) setPickerSide(side);
    const orderedNodes = orderRemoteNodes(nodes);
    setPickerUUID((current) => {
      if (current && orderedNodes.some((node) => node.uuid === current)) return current;
      return orderedNodes.find((node) => online.has(node.uuid))?.uuid || orderedNodes[0]?.uuid || "";
    });
    setPickerOpen(true);
  };

  const confirmPicker = () => {
    if (!pickerUUID) return;
    if (!online.has(pickerUUID)) {
      toast.error(t("terminal.session.node_offline"));
      return;
    }
    openNode(pickerUUID);
    setPickerOpen(false);
  };

  const connectedCount = useMemo(
    () => Object.values(connectionByTab).filter((state) => state === "connected").length,
    [connectionByTab],
  );
  useEffect(() => {
    const active = tabs.find((tab) => tab.id === activeID);
    const node = active ? nodes.find((item) => item.uuid === active.uuid) : undefined;
    const name = node?.name || t("common.server");
    document.title = connectedCount > 0
      ? t("terminal.session.document_title_connected", { name, count: connectedCount })
      : active
        ? `${name} - ${t("terminal.remote_title")}`
        : t("terminal.remote_title");
  }, [activeID, connectedCount, nodes, t, tabs]);
  useEffect(() => {
    if (connectedCount === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = t("terminal.session.close_with_sessions", { count: connectedCount });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [connectedCount, t]);
  const allConnected = tabs.length > 0 && connectedCount === tabs.length;
  const activeTab = tabs.find((tab) => tab.id === activeID);
  const activeNode = activeTab ? nodeMap.get(activeTab.uuid) : undefined;
  const openedUUIDs = useMemo(() => new Set(tabs.map((tab) => tab.uuid)), [tabs]);
  const selectedPickerNode = nodes.find((node) => node.uuid === pickerUUID);
  const pickerCentered = !compact && pickerSide === "center";
  const authFailed = authorization === "error";
  const leaveRemote = () => {
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.location.assign("/admin");
    }, 100);
  };
  const authFields = (
    <RemoteAuthFields
      twoFaEnabled={twoFaEnabled}
      passkeyAvailable={passkeyAvailable}
      authFailed={authFailed}
      otpInput={otpInput}
      passwordInput={passwordInput}
      otpError={otpError}
      submitLabel={t("terminal.session.verify_and_enter")}
      cancelLabel={workspaceEntered ? t("common.close") : t("common.cancel")}
      cancelAsText={workspaceEntered}
      onOtp={setOtpInput}
      onPassword={setPasswordInput}
      onSubmit={() => {
        void authorizeRemote(twoFaEnabled ? { otp: otpInput } : { password: passwordInput });
      }}
      onPasskey={() => {
        void authorizeRemote({ passkey: true });
      }}
      onCancel={() => {
        if (workspaceEntered) {
          setReauthOpen(false);
          return;
        }
        leaveRemote();
      }}
      onRetry={() => {
        setOtpError("");
        if (workspaceEntered) {
          setReauthOpen(true);
          return;
        }
        setAuthorization("required");
      }}
    />
  );

  if (authorization === "checking") {
    return <Loading fullscreen />;
  }

  if (!workspaceEntered) {
    return (
      <AuthStandAlonePage
        title={authFailed ? t("terminal.session.auth_failed_title") : twoFaEnabled ? t("login.two_factor") : t("terminal.session.reauth_title")}
        description={
          authFailed
            ? (otpError || t("terminal.session.auth_failed"))
            : twoFaEnabled
              ? `${t("account.2fa_otp_input_prompt")} ${t("terminal.session.two_factor_valid_for")}`
              : t("terminal.session.reauth_password_prompt")
        }
        testId="remote-auth-page"
        cardTestId="remote-auth-card"
      >
        {authFields}
      </AuthStandAlonePage>
    );
  }

  const sessionList = (
    <DndContext sensors={tabSensors} collisionDetection={closestCenter} onDragEnd={reorderTabs}>
      <Box className="remote-rail-sessions" aria-label={t("terminal.session.tabbar")}>
        <SortableContext items={tabs.map((tab) => tab.id)} strategy={verticalListSortingStrategy}>
          {tabs.map((tab, index) => {
            const node = nodeMap.get(tab.uuid);
            const connection = connectionByTab[tab.id];
            const detail = connection === "connected"
              ? t("terminal.session.connected")
              : connection === "waiting"
                ? t("terminal.session.waiting_agent")
                : connection === "connecting"
                  ? t("terminal.session.connecting")
                  : t("terminal.files.not_connected");
            return (
              <SortableRemoteTab
                key={tab.id}
                tab={tab}
                label={labels[index]}
                active={activeID === tab.id}
                connected={connection === "connected"}
                flag={node?.region_override?.trim() || node?.region?.trim()}
                detail={detail}
                onActivate={() => {
                  setActiveID(tab.id);
                  setSessionSheetOpen(false);
                }}
                onClose={() => closeTab(tab.id)}
              />
            );
          })}
        </SortableContext>
      </Box>
    </DndContext>
  );

  const picker = (
    <Box className="remote-picker-sheet">
      <Box className="remote-picker-header">
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
            {t("terminal.session.open_server")}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: 13 }}>
            {t("terminal.session.picker_subtitle")}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
          {compact ? <ThemeMenu /> : null}
          <IconButton aria-label={t("common.close")} onClick={() => setPickerOpen(false)}>
            <X size={18} />
          </IconButton>
        </Stack>
      </Box>
      <Box className="remote-picker-body">
        <RemoteNodePicker
          nodes={nodes}
          onlineSet={online}
          selectedUUID={pickerUUID}
          openedUUIDs={openedUUIDs}
          columns={2}
          pageSize={6}
          clipOverflow={compact ? "bottom" : pickerSide === "left" ? "top" : "bottom"}
          onSelect={(node) => setPickerUUID(node.uuid)}
        />
      </Box>
      <Box className="remote-picker-footer">
        <Typography color="text.secondary" sx={{ fontSize: 12 }}>
          {selectedPickerNode
            ? `${t("terminal.session.selected")} ${selectedPickerNode.name}`
            : t("terminal.session.open_description")}
        </Typography>
        <Stack className="remote-dialog-actions" direction="row" spacing={1}>
          <Button onClick={() => setPickerOpen(false)}>{t("common.cancel")}</Button>
          <Button
            variant="contained"
            disabled={!pickerUUID || !online.has(pickerUUID)}
            onClick={confirmPicker}
            sx={{ gap: 0.75 }}
          >
            <Plus size={16} />
            {t("terminal.session.open_session")}
          </Button>
        </Stack>
      </Box>
    </Box>
  );

  return (
    <CommandClipboardProvider>
    <Box className="remote-workspace">
      <Box className="remote-chrome" component="header" aria-label={t("terminal.session.brand")}>
        <Stack direction="row" spacing={2} sx={{ minWidth: 0, alignItems: "center" }}>
          <Box className="remote-chrome-brand">
            <SiteFavicon />
            <LiteBrand size="sm" />
            <span className="remote-chrome-caption">{t("terminal.session.caption")}</span>
          </Box>
          <Box className="remote-chrome-location">
            <span>{t("terminal.session.workspace")}</span>
            {activeNode ? (
              <>
                <span>/</span>
                <strong>{activeNode.name}</strong>
              </>
            ) : null}
          </Box>
        </Stack>
        <Box className="remote-chrome-actions">
          <span className={`remote-connected-count${connectedCount > 0 ? " is-connected" : ""}`}>
            <i />
            {t("terminal.session.connected_count", { count: connectedCount })}
          </span>
          {compact ? (
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setPickerOpen(false);
                setSessionSheetOpen(true);
              }}
            >
              {t("terminal.session.sessions")}
              <Chip size="small" label={tabs.length} sx={{ ml: 0.75, height: 18 }} />
            </Button>
          ) : null}
          {compact ? (
            <ThemeMenu />
          ) : (
            <>
              <span className="remote-chrome-divider" />
              <div className="remote-theme-control">
                <ThemeMenu trigger="label" />
                <AppearanceSegment />
              </div>
            </>
          )}
          <Button
            variant="contained"
            size={compact ? "small" : "medium"}
            onClick={() => openPicker("right")}
            aria-label={t("terminal.session.open_server")}
            sx={compact ? { minWidth: 40, px: 1 } : { gap: 0.75 }}
          >
            <Plus size={compact ? 18 : 16} />
            {compact ? null : t("terminal.session.open_server")}
          </Button>
        </Box>
      </Box>

      <Box className="remote-body">
        {!compact ? (
          <Box className="remote-session-rail" component="aside">
            <Box className="remote-rail-heading">
              <span>{t("terminal.session.open_sessions")}</span>
              <Chip size="small" label={tabs.length} sx={{ height: 20 }} />
            </Box>
            {sessionList}
            <Button
              className="remote-rail-open"
              size="small"
              variant="outlined"
              onClick={() => openPicker("left")}
              sx={{ gap: 0.75 }}
            >
              <Plus size={15} />
              {t("terminal.session.open_server")}
            </Button>
          </Box>
        ) : null}

        <Box className="remote-content">
          {tabs.map((tab) => {
            const node = nodeMap.get(tab.uuid) || { uuid: tab.uuid, name: tab.uuid.slice(0, 8) };
            return (
              <RemoteSession
                key={tab.id}
                tabId={tab.id}
                node={node}
                live={live[tab.uuid]}
                online={online.has(tab.uuid)}
                active={activeID === tab.id}
                compact={compact}
                createSession={createRemoteSession}
                onDuplicate={() => openNode(tab.uuid)}
                onConnectionChange={handleConnectionChange}
              />
            );
          })}
          {tabs.length === 0 && (
            <Box className="remote-empty-workspace">
              <Paper
                variant="outlined"
                className="remote-empty-card"
                sx={{
                  display: "flex",
                  width: "min(360px, 100%)",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 1.5,
                  px: 3,
                  py: 3.5,
                  textAlign: "center",
                }}
              >
                <Server size={28} />
                <Typography component="strong">{t("terminal.session.workspace_empty")}</Typography>
                <Button variant="contained" onClick={() => openPicker("center")} sx={{ gap: 0.75 }}>
                  <Plus size={15} />
                  {t("terminal.session.open_server")}
                </Button>
              </Paper>
            </Box>
          )}
        </Box>
      </Box>

      <Box className="remote-statusbar" component="footer" aria-label={t("terminal.session.status_bar")}>
        <span className={`remote-status${allConnected ? " is-connected" : ""}`}>
          <i />
          {allConnected
            ? t("terminal.session.all_connected")
            : t("terminal.session.connected_count", { count: connectedCount })}
        </span>
        <span>{activeNode?.name || ""}</span>
      </Box>

      {pickerCentered ? (
        <Dialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          maxWidth={false}
          scroll="paper"
          slots={{ transition: Fade }}
          transitionDuration={{ enter: 360, exit: 200 }}
          slotProps={{
            transition: { timeout: { enter: 360, exit: 200 } },
            paper: {
              className: "remote-picker-paper is-center",
            },
          }}
        >
          {picker}
        </Dialog>
      ) : (
      <Drawer
        anchor={compact ? "bottom" : pickerSide === "left" ? "left" : "right"}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        slotProps={{
          backdrop: {
            sx: compact
              ? undefined
              : { top: "var(--remote-header-h)", bottom: "var(--remote-status-h)" },
          },
          paper: {
            className: `remote-picker-paper${compact ? " is-compact" : ` is-${pickerSide}`}`,
            sx: compact
              ? {
                  height: "min(92dvh, 100%)",
                  maxHeight: "min(92dvh, 100%)",
                  borderTopLeftRadius: "16px",
                  borderTopRightRadius: "16px",
                }
              : pickerSide === "left"
                ? {
                    top: "auto",
                    bottom: "var(--remote-status-h)",
                    height: "auto",
                    maxHeight: "calc(100dvh - var(--remote-header-h) - var(--remote-status-h))",
                    width: "min(864px, calc(100vw - 48px))",
                    borderTopRightRadius: "12px",
                    borderBottomRightRadius: "12px",
                  }
                : {
                    top: "var(--remote-header-h)",
                    bottom: "auto",
                    height: "auto",
                    maxHeight: "calc(100dvh - var(--remote-header-h) - var(--remote-status-h))",
                    width: "min(864px, calc(100vw - 48px))",
                    borderTopLeftRadius: "12px",
                    borderBottomLeftRadius: "12px",
                  },
          },
        }}
      >
        {picker}
      </Drawer>
      )}

      <Drawer
        anchor="bottom"
        open={compact && sessionSheetOpen}
        onClose={() => setSessionSheetOpen(false)}
        slotProps={{
          paper: {
            sx: {
              height: "min(72dvh, 100%)",
              borderTopLeftRadius: "16px",
              borderTopRightRadius: "16px",
              p: 2,
            },
          },
        }}
      >
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
            {t("terminal.session.sessions")}
          </Typography>
          <IconButton aria-label={t("common.close")} onClick={() => setSessionSheetOpen(false)}>
            <X size={18} />
          </IconButton>
        </Stack>
        {sessionList}
        <Button
          variant="contained"
          onClick={() => openPicker("right")}
          sx={{ mt: 2, gap: 0.75 }}
        >
          <Plus size={16} />
          {t("terminal.session.open_server")}
        </Button>
      </Drawer>

      <Dialog
        {...remoteConfirmDialogProps}
        open={reauthOpen}
        onClose={(_event, reason) => {
          if (reason === "backdropClick" || reason === "escapeKeyDown") return;
          setReauthOpen(false);
        }}
        maxWidth="sm"
        data-testid="remote-auth-dialog"
      >
        <DialogTitle>
          {twoFaEnabled ? t("login.two_factor") : t("terminal.session.reauth_title")}
        </DialogTitle>
        <DialogContent>
          <Typography color="text.secondary" sx={{ mb: 2, fontSize: 14 }}>
            {twoFaEnabled
              ? `${t("account.2fa_otp_input_prompt")} ${t("terminal.session.two_factor_valid_for")}`
              : t("terminal.session.reauth_password_prompt")}
          </Typography>
          {authFields}
        </DialogContent>
      </Dialog>
    </Box>
    </CommandClipboardProvider>
  );
}
