import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import AdminPageTitle from "@/components/admin/AdminPageTitle";
import {
  SettingsAlert,
  SettingsArrowButton,
  SettingsDashedZone,
  SettingsDetailRow,
  SettingsFacts,
  SettingsHero,
  SettingsTextButton,
  adminLetterAvatarSx,
  settingsFieldSx,
  settingsNeutralBg,
  settingsSoftBg,
} from "@/components/admin/SettingsChrome";
import SettingsFeatureCard from "@/components/admin/SettingsFeatureCard";
import SettingsSheetDialog, {
  SettingsSheetActions,
} from "@/components/admin/SettingsSheetDialog";
import {
  CloudUpload,
  Code,
  Copy,
  Devices,
  Eye,
  EyeOff,
  FingerprintIcon,
  Github,
  Globe,
  History,
  KeyRound,
  LockKeyhole,
  MinusIcon,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Shield,
} from "@/components/admin/muiIcons";
import { useAccount } from "@/contexts/AccountContext";
import { useAdminTabParam } from "@/hooks/useAdminTabParam";
import { useIsMobile } from "@/hooks/use-mobile";
import { updateSettingsWithToast, useSettings } from "@/lib/api";
import {
  getAccountPasskeySnapshot,
  isWindowsHelloPasskey,
  prefetchAccountPasskeys,
  rememberAccountPasskeys,
  type AccountPasskeySummary,
} from "@/lib/accountPasskeys";
import Sessions, { SessionsDeleteAllButton } from "@/pages/admin/sessions";
import LastSignInMethodDialog from "@/components/admin/LastSignInMethodDialog";
import { remainingSignInMethods } from "@/lib/signInMethods";
import SignOnSettings from "@/pages/admin/settings/sign-on";
import {
  clampAvatarPreviewOffset,
  cropAvatarToPng,
  isSupportedAvatarType,
  loadAvatarSource,
  avatarPreviewTransform,
  AVATAR_ACCEPT,
  AVATAR_MAX_SOURCE_BYTES,
} from "@/utils/avatarCrop";
import {
  passwordTooShort,
  passwordTooWeak,
  passwordsMismatch,
} from "@/utils/passwordRules";
import {
  DEFAULT_SESSION_TTL_SECONDS,
  sessionTtlInputToSeconds,
  splitSessionTtl,
  type SessionTtlUnit,
} from "@/utils/sessionTtl";
import { ssoExternalId, ssoProviderKey, ssoProviderLabel } from "@/utils/ssoIdentity";
import { UserAgentHelper } from "@/utils/UserAgentHelper";
import {
  confirmAdminPasskey,
  passkeyUnavailableMessage,
  serializeCredential,
  toPasskeyCreateOptions,
} from "@/utils/webauthn";

const ACCOUNT_PANELS = [
  "account",
  "username",
  "password",
  "avatar",
  "sign-on",
  "sessions",
  "github",
  "passkeys",
  "security",
  "logout",
  "api",
  "signin",
] as const;

type AccountPanel = (typeof ACCOUNT_PANELS)[number];

const otpFieldHtmlInput = {
  autoComplete: "one-time-code",
  inputMode: "numeric" as const,
  pattern: "[0-9]*",
  maxLength: 6,
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
};

const secretNotPasswordHtmlInput = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-1p-ignore": "true",
  "data-lpignore": "true",
  "data-bwignore": "true",
  "data-form-type": "other",
};

export default function AccountSecuritySettings() {
  const { t } = useTranslation();
  const { account, loading, refresh } = useAccount();
  const { settings, refetch } = useSettings();
  const isMobile = useIsMobile();
  const [urlPanel, setUrlPanel] = useAdminTabParam(ACCOUNT_PANELS, "account");
  const [panel, setPanel] = useState<AccountPanel>(urlPanel);
  const [nestFrom, setNestFrom] = useState<AccountPanel | null>(null);
  const usernameButtonRef = useRef<HTMLButtonElement>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [passkeyCount, setPasskeyCount] = useState<number | null>(
    () => getAccountPasskeySnapshot()?.length ?? null,
  );

  useEffect(() => {
    setPanel(urlPanel);
  }, [urlPanel]);

  useEffect(() => {
    let cancelled = false;
    const cached = getAccountPasskeySnapshot();
    if (cached) setPasskeyCount(cached.length);
    void prefetchAccountPasskeys(Boolean(cached))
      .then((items) => {
        if (!cancelled) setPasskeyCount(items.length);
      })
      .catch(() => {
        if (!cancelled && getAccountPasskeySnapshot() === null) setPasskeyCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ttl = splitSessionTtl(Number(settings.session_ttl_seconds) || DEFAULT_SESSION_TTL_SECONDS);
  const stackedOnSignin = nestFrom === "signin" || panel === "signin";

  const openPanel = (next: AccountPanel) => {
    if (panel !== "account" && panel !== next) {
      setNestFrom(panel);
    } else if (panel === "account") {
      setNestFrom(null);
    }
    setPanel(next);
    if (!isMobile || next === "account") {
      setUrlPanel(next);
    }
  };
  const closePanel = () => {
    if (nestFrom) {
      const back = nestFrom;
      setNestFrom(null);
      setPanel(back);
      if (!isMobile || back === "account") {
        setUrlPanel(back);
      }
      return;
    }
    setPanel("account");
    if (urlPanel !== "account") setUrlPanel("account");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauth_error") || "";
    if (oauthError.startsWith("passkey_") || params.get("passkey_confirm")) {
      openPanel("passkeys");
      return;
    }
    if (oauthError) openPanel("github");
  }, []);

  if (loading && !account) {
    return <AccountHomeSkeleton />;
  }

  const username = account?.username || "";
  const avatarUrl = account?.avatar_url || "";
  const hasPassword = account?.has_password !== false;
  const passwordLoginEnabled = !settings.disable_password_login && hasPassword;
  const methodCount =
    (passwordLoginEnabled ? 1 : 0) +
    ((passkeyCount ?? 0) > 0 ? 1 : 0) +
    (account?.sso_id ? 1 : 0);
  const deviceLabel = UserAgentHelper.shortDevice(navigator.userAgent);

  return (
    <Stack spacing={2.5}>
      <AdminPageTitle description={t("settings.account_security_page_description", "管理账户资料、登录方式与站点访问规则。")}>
        {t("navigation.account_security")}
      </AdminPageTitle>

      <Paper
        variant="outlined"
        sx={{
          p: { xs: 2.5, md: 3 },
          display: "flex",
          alignItems: "center",
          gap: { xs: 2, md: 2.5 },
          overflow: "visible",
          boxShadow: "none",
          borderRadius: "8px",
        }}
      >
        <Stack
          component="button"
          type="button"
          onClick={() => openPanel("avatar")}
          spacing={2}
          sx={{
            alignItems: "center",
            flexShrink: 0,
            overflow: "visible",
            border: 0,
            p: 0,
            mr: 0.5,
            bgcolor: "transparent",
            cursor: "pointer",
            color: "inherit",
            appearance: "none",
            fontFamily: "inherit",
            lineHeight: 1,
          }}
          aria-label={t("account.change_avatar", "更换头像")}
        >
          <Box sx={{ position: "relative", width: 52, height: 52, overflow: "visible" }}>
            <Avatar
              src={avatarUrl || undefined}
              slotProps={{
                img: {
                  onError: (event) => {
                    (event.currentTarget as HTMLImageElement).style.display = "none";
                  },
                },
              }}
              sx={{
                width: 52,
                height: 52,
                fontSize: 22,
                ...adminLetterAvatarSx,
              }}
            >
              {username.slice(0, 1).toUpperCase()}
            </Avatar>
            <Box
              sx={{
                position: "absolute",
                right: -8,
                bottom: -7,
                zIndex: 1,
                width: 23,
                height: 23,
                display: "grid",
                placeItems: "center",
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: "50%",
                color: "primary.main",
                boxShadow: (theme) =>
                  theme.palette.mode === "dark"
                    ? `0 0 0 2px ${theme.palette.background.paper}`
                    : "0 0 0 1px rgba(255,255,255,0.8)",
              }}
            >
              <PhotoCameraOutlined sx={{ fontSize: 14 }} />
            </Box>
          </Box>
          <Typography sx={{ fontSize: 10, color: "primary.main", lineHeight: 1.2, whiteSpace: "nowrap" }}>
            {t("account.change_avatar", "更换头像")}
          </Typography>
        </Stack>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" }}>
              {username}
            </Typography>
            <Tooltip title={t("account.change_username_title")}>
              <IconButton
                ref={usernameButtonRef}
                size="small"
                aria-label={t("account.change_username_title", "修改用户名")}
                onClick={() => openPanel("username")}
                sx={{ width: { xs: 44, sm: 32 }, height: { xs: 44, sm: 32 }, color: "text.secondary", flexShrink: 0 }}
              >
                <Pencil size={16} />
              </IconButton>
            </Tooltip>
          </Stack>
          <Typography sx={{ fontSize: 15, color: "text.secondary", lineHeight: 1.6 }}>
            {t("account.profile_hint", "本地管理员账户")}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => openPanel("password")}
          sx={{ fontSize: 14, minHeight: 40, px: 2, flexShrink: 0 }}
        >
          {t("account.change_password_title")}
        </Button>
      </Paper>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          gap: 2,
          alignItems: "stretch",
        }}
      >
        <SettingsFeatureCard
          accent
          icon={<FingerprintIcon size={24} />}
          title={t("account.sign_in_methods", "登录方式")}
          description={t("account.sign_in_methods_description", "密码、通行密钥与第三方登录")}
          chip={
            passkeyCount === null
              ? undefined
              : t("account.methods_available", "{{count}} 种可用", { count: methodCount })
          }
          meta={
            passkeyCount === null
              ? undefined
              : t("account.methods_meta", "{{count}} 种登录方式", { count: methodCount })
          }
          actionLabel={t("common.manage", "管理")}
          onAction={() => openPanel("signin")}
        />
        <SettingsFeatureCard
          icon={<Devices size={24} />}
          title={t("sessions.title")}
          description={t("account.sessions_description", "查看本站已登录的会话")}
          chip={t("account.sessions_count", "{{count}} 个会话", { count: sessionCount || 1 })}
          meta={t("account.sessions_current", "当前：{{device}}", { device: deviceLabel })}
          actionLabel={t("account.sessions_view", "查看")}
          onAction={() => openPanel("sessions")}
        />
        <SettingsFeatureCard
          accent
          icon={<History size={24} />}
          title={t("account.auto_logout", "自动登出")}
          description={t("account.auto_logout_description", "无操作超时后自动退出")}
          meta={
            ttl.unit === "hours" && ttl.amount === 24
              ? t("account.ttl_24h", "24 小时")
              : `${ttl.amount} ${t(`account.ttl_${ttl.unit}`, ttl.unit)}`
          }
          actionLabel={t("common.configure", "设置")}
          onAction={() => openPanel("logout")}
        />
        <SettingsFeatureCard
          icon={<Shield size={24} />}
          title={t("account.security_verification", "安全验证")}
          description={t("account.security_verification_description", "通过身份验证器增加保护")}
          chip={
            account?.["2fa_enabled"]
              ? t("account.tfa_on_chip", "已启用")
              : t("account.tfa_off_chip", "未启用")
          }
          chipTone={account?.["2fa_enabled"] ? "success" : "primary"}
          meta={t("account.tfa_chip", "双重身份验证")}
          actionLabel={t("common.manage", "管理")}
          onAction={() => openPanel("security")}
        />
      </Box>

      <Paper variant="outlined" sx={{ px: { xs: 2.5, md: 3 }, boxShadow: "none", borderRadius: "8px" }}>
        <SettingsDetailRow
          large
          icon={<Code size={24} />}
          title={t("account.api_access", "API 访问")}
          description={t("account.api_access_description", "管理站点 API 密钥")}
          action={
            <SettingsArrowButton onClick={() => openPanel("api")}>
              {t("common.manage", "管理")}
            </SettingsArrowButton>
          }
          border={false}
        />
      </Paper>

      <UsernamePanel
        open={panel === "username"}
        onClose={() => {
          closePanel();
          usernameButtonRef.current?.focus();
        }}
        account={account}
        refresh={refresh}
      />
      <AvatarPanel
        open={panel === "avatar"}
        onClose={closePanel}
        account={account}
        refresh={refresh}
      />
      <SignInMethodsPanel
        open={panel === "signin" || nestFrom === "signin"}
        conceal={nestFrom === "signin" && panel !== "signin"}
        onClose={closePanel}
        onOpen={(next) => openPanel(next)}
        account={account}
        settings={settings}
        passkeyCount={passkeyCount ?? 0}
      />
      <PasswordPanel
        open={panel === "password"}
        hideBackdrop={stackedOnSignin}
        onClose={closePanel}
        account={account}
      />
      <SettingsSheetDialog
        open={panel === "sign-on"}
        hideBackdrop={stackedOnSignin}
        onClose={closePanel}
        maxWidth={780}
        title={t("settings.sign_on.title")}
        actions={<SettingsSheetActions onConfirm={closePanel} confirmLabel={t("common.done", "完成")} />}
      >
        <SignOnSettings
          embedded
          hideApi
          hasPassword={account?.has_password !== false}
          ssoBound={Boolean(account?.sso_id)}
          passkeyCount={passkeyCount ?? 0}
        />
      </SettingsSheetDialog>
      <SettingsSheetDialog
        open={panel === "sessions"}
        onClose={closePanel}
        maxWidth={780}
        title={t("sessions.title")}
        headerAction={<SessionsDeleteAllButton />}
      >
        <Sessions embedded onCount={setSessionCount} ttlSeconds={Number(settings.session_ttl_seconds) || DEFAULT_SESSION_TTL_SECONDS} />
      </SettingsSheetDialog>
      <GithubPanel
        open={panel === "github"}
        hideBackdrop={stackedOnSignin}
        onClose={closePanel}
        account={account}
        refresh={refresh}
        oauthProvider={String(settings.o_auth_provider || "")}
        passwordDisabled={Boolean(settings.disable_password_login)}
        oauthEnabled={Boolean(settings.o_auth_enabled)}
        passkeyCount={passkeyCount ?? 0}
      />
      <PasskeysPanel
        open={panel === "passkeys"}
        hideBackdrop={stackedOnSignin}
        onClose={closePanel}
        account={account}
        onCount={setPasskeyCount}
        passwordDisabled={Boolean(settings.disable_password_login)}
        oauthEnabled={Boolean(settings.o_auth_enabled)}
      />
      <TwoFactorPanel
        open={panel === "security"}
        onClose={closePanel}
        account={account}
        refresh={refresh}
      />
      <AutoLogoutPanel
        open={panel === "logout"}
        onClose={closePanel}
        settings={settings}
        refetch={refetch}
      />
      <ApiKeyPanel open={panel === "api"} onClose={closePanel} settings={settings} />
    </Stack>
  );
}

function AccountHomeSkeleton() {
  const { t } = useTranslation();
  return (
    <Stack spacing={2.5} role="status" aria-label={t("common.loading")} data-admin-route-pending="true">
      <Box>
        <Skeleton width={140} height={32} />
        <Skeleton width={280} height={18} sx={{ mt: 1 }} />
      </Box>
      <Paper variant="outlined" sx={{ display: "flex", alignItems: "center", gap: 2, p: 3, boxShadow: "none" }}>
        <Skeleton variant="circular" width={52} height={52} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="22%" height={26} />
          <Skeleton width="38%" height={20} />
        </Box>
      </Paper>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" } }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Paper
            key={index}
            variant="outlined"
            sx={{ p: 2.5, boxShadow: "none", display: "flex", flexDirection: "column" }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 1.75 }}>
              <Skeleton variant="rounded" width={48} height={48} />
              <Skeleton width="40%" height={28} />
            </Stack>
            <Skeleton width="76%" height={20} />
            <Box sx={{ mt: "auto", pt: 1.75, borderTop: "1px solid", borderColor: "divider" }}>
              <Skeleton width="36%" height={20} />
            </Box>
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}

function UsernamePanel({
  open,
  onClose,
  account,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  account: { uuid?: string; username?: string } | null;
  refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState(account?.username || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername(account?.username || "");
      setError("");
    }
  }, [open, account?.username]);

  return (
    <SettingsSheetDialog
      open={open}
      onClose={onClose}
      title={t("account.change_username_title")}
      actions={
        <SettingsSheetActions
          onCancel={onClose}
          onConfirm={async () => {
            if (username.trim().length < 3) {
              setError(t("account.username_too_short", "用户名至少需要 3 个字符。"));
              return;
            }
            setSaving(true);
            try {
              const response = await fetch("/api/admin/update/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uuid: account?.uuid, username }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.message || "Failed to update username");
              await refresh();
              toast.success(t("common.updated_successfully"));
              onClose();
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : String(reason));
            } finally {
              setSaving(false);
            }
          }}
          confirmLabel={t("account.change_username_button")}
          confirmDisabled={saving}
          loading={saving}
        />
      }
    >
      {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
      <TextField
        size="small"
        fullWidth
        label={t("account.username", "用户名")}
        value={username}
        error={Boolean(error)}
        helperText={t("account.username_help", "至少 3 个字符，不能与已有用户名重复。")}
        onChange={(event) => setUsername(event.target.value)}
        sx={settingsFieldSx}
      />
      <Typography sx={{ fontSize: 12, lineHeight: 1.8, color: "text.secondary" }}>
        {t("account.username_login_hint", "修改后，使用新用户名进行密码登录。")}
      </Typography>
    </SettingsSheetDialog>
  );
}

function PasswordPanel({
  open,
  hideBackdrop = false,
  onClose,
  account,
}: {
  open: boolean;
  hideBackdrop?: boolean;
  onClose: () => void;
  account: { uuid?: string; "2fa_enabled"?: boolean } | null;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [twoFa, setTwoFa] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [fieldKey, setFieldKey] = useState(0);

  const discardDraft = () => {
    setPassword("");
    setRepeat("");
    setTwoFa("");
    setShow(false);
    setError("");
    setSaving(false);
    setDone(false);
    setFieldKey((current) => current + 1);
  };

  useEffect(() => {
    if (open) return;
    discardDraft();
  }, [open]);

  const close = () => {
    discardDraft();
    onClose();
  };

  return (
    <SettingsSheetDialog
      open={open}
      hideBackdrop={hideBackdrop}
      onClose={close}
      title={done ? t("account.password_updated", "密码已更新") : t("account.change_password_title")}
      actions={
        done ? (
          <Button variant="contained" onClick={() => { window.location.href = "/"; }}>
            {t("common.back", "返回")}
          </Button>
        ) : (
          <SettingsSheetActions
            onCancel={close}
            onConfirm={async () => {
              if (!password || !repeat) {
                setError(t("account.password_empty_error"));
                return;
              }
              if (passwordsMismatch(password, repeat)) {
                setError(t("account.password_mismatch_error"));
                return;
              }
              if (passwordTooShort(password)) {
                setError(t("account.password_too_short_error"));
                return;
              }
              if (passwordTooWeak(password)) {
                setError(t("account.password_strength_error"));
                return;
              }
              if (account?.["2fa_enabled"] && !twoFa) {
                setError(t("account.otp_empty_error"));
                return;
              }
              setSaving(true);
              try {
                const response = await fetch("/api/admin/update/user", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    uuid: account?.uuid,
                    password,
                    "2fa_code": twoFa,
                  }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "Failed to update password");
                setDone(true);
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : String(reason));
              } finally {
                setSaving(false);
              }
            }}
            confirmLabel={t("account.change_password_button")}
            confirmDisabled={saving}
            loading={saving}
          />
        )
      }
    >
      {done ? (
        <SettingsHero
          icon={<LockKeyhole size={30} />}
          title={t("account.password_updated", "密码已更新")}
        description={t(
            "account.password_updated_hint",
            "本站登录会话已退出。即将返回现有登录流程，请使用新密码登录。",
          )}
          success
        />
      ) : (
        <>
          {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
          <TextField
            key={`password-${fieldKey}`}
            size="small"
            fullWidth
            type={show ? "text" : "password"}
            name="new-password"
            autoComplete="new-password"
            label={t("account.new_password")}
            helperText={t("account.password_rule", "至少 8 位，包含大写字母、小写字母和数字。")}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            sx={settingsFieldSx}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShow((value) => !value)}>
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            key={`repeat-${fieldKey}`}
            size="small"
            fullWidth
            type={show ? "text" : "password"}
            name="new-password-repeat"
            autoComplete="new-password"
            label={t("account.new_password_repeat")}
            value={repeat}
            error={Boolean(repeat) && passwordsMismatch(password, repeat)}
            helperText={
              repeat && passwordsMismatch(password, repeat)
                ? t("account.password_mismatch_error")
                : undefined
            }
            onChange={(event) => setRepeat(event.target.value)}
            sx={settingsFieldSx}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShow((value) => !value)}>
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          {account?.["2fa_enabled"] ? (
            <TextField
              key={`otp-${fieldKey}`}
              size="small"
              fullWidth
              name="one-time-code"
              autoComplete="one-time-code"
              label={t("account.2fa_otp_input_prompt")}
              value={twoFa}
              slotProps={{ htmlInput: otpFieldHtmlInput }}
              onChange={(event) => setTwoFa(event.target.value.replace(/\D/g, "").slice(0, 6))}
              sx={settingsFieldSx}
            />
          ) : null}
          <SettingsAlert severity="warning">
            {t("account.password_session_warning", "修改密码后，本站所有已登录会话都会退出，包含当前会话。")}
          </SettingsAlert>
        </>
      )}
    </SettingsSheetDialog>
  );
}

function AvatarPanel({
  open,
  onClose,
  account,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  account: { avatar_url?: string; username?: string } | null;
  refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const hasAvatar = Boolean(account?.avatar_url);

  useEffect(() => {
    if (open) return;
    setImage(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError("");
    setSaving(false);
    setConfirmReset(false);
  }, [open]);

  const chooseFile = async (file: File) => {
    try {
      if (!isSupportedAvatarType(file)) {
        setError(t("account.avatar_format", "请选择 JPG、PNG 或 WebP。"));
        return;
      }
      if (file.size > AVATAR_MAX_SOURCE_BYTES) {
        setError(t("account.avatar_too_large", "图片不能超过 5 MB。"));
        return;
      }
      const loaded = await loadAvatarSource(file);
      setImage(loaded);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setOffset((current) =>
      clampAvatarPreviewOffset(
        zoom,
        current.x + (event.clientX - drag.current!.x),
        current.y + (event.clientY - drag.current!.y),
      ),
    );
    drag.current = { x: event.clientX, y: event.clientY };
  };

  const pickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = AVATAR_ACCEPT;
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void chooseFile(file);
    };
    input.click();
  };

  return (
    <SettingsSheetDialog
      open={open}
      onClose={() => {
        setImage(null);
        setConfirmReset(false);
        onClose();
      }}
      title={
        confirmReset
          ? t("account.reset_avatar", "恢复默认头像")
          : image
            ? t("account.crop_avatar", "裁剪头像")
            : t("account.change_avatar", "更换头像")
      }
      actions={
        confirmReset ? (
          <SettingsSheetActions
            onCancel={() => setConfirmReset(false)}
            onConfirm={async () => {
              await fetch("/api/admin/account/avatar", { method: "DELETE" });
              await refresh();
              setConfirmReset(false);
              onClose();
            }}
            confirmLabel={t("account.reset_avatar", "恢复默认")}
          />
        ) : image ? (
          <SettingsSheetActions
            onCancel={onClose}
            onConfirm={async () => {
              setSaving(true);
              try {
                const blob = await cropAvatarToPng(image, zoom, offset.x, offset.y);
                const body = new FormData();
                body.append("file", blob, "avatar.png");
                const response = await fetch("/api/admin/account/avatar", {
                  method: "POST",
                  body,
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "upload failed");
                await refresh();
                toast.success(t("common.updated_successfully"));
                setImage(null);
                onClose();
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : String(reason));
              } finally {
                setSaving(false);
              }
            }}
            confirmLabel={saving ? t("account.saving_avatar", "保存中") : t("account.save_avatar", "保存头像")}
            confirmDisabled={saving}
            loading={saving}
          />
        ) : hasAvatar ? (
          <SettingsSheetActions
            onCancel={onClose}
            onConfirm={pickFile}
            cancelLabel={t("common.done", "完成")}
            confirmLabel={t("account.choose_new_image", "选择新图片")}
            left={
              <SettingsTextButton onClick={() => setConfirmReset(true)}>
                {t("account.reset_avatar", "恢复默认")}
              </SettingsTextButton>
            }
          />
        ) : (
          <SettingsSheetActions onCancel={onClose} cancelLabel={t("common.close", "关闭")} />
        )
      }
    >
      {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
      {confirmReset ? (
        <Stack spacing={3} sx={{ alignItems: "center", my: 1 }}>
          <Stack direction="row" spacing={3} sx={{ alignItems: "center" }}>
            <Avatar src={account?.avatar_url || undefined} sx={{ width: 75, height: 75 }} />
            <Typography sx={{ color: "text.secondary" }}>→</Typography>
            <Avatar
              sx={{
                width: 75,
                height: 75,
                fontSize: 30,
                ...adminLetterAvatarSx,
              }}
            >
              {(account?.username || "A").slice(0, 1).toUpperCase()}
            </Avatar>
          </Stack>
          <Typography sx={{ fontSize: 12, lineHeight: 1.8, color: "text.secondary", textAlign: "center" }}>
            {t("account.reset_avatar_hint", "当前自定义头像将被替换为用户名首字母头像。之后可以重新上传。")}
          </Typography>
        </Stack>
      ) : image ? (
        <Stack spacing={0}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<CloudUpload size={18} />}
              onClick={pickFile}
              sx={{ minHeight: { xs: 44, sm: 38 }, fontSize: 13, px: 1.7 }}
            >
              {t("account.rechoose_image", "重新选择")}
            </Button>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{image.title || ""}</Typography>
          </Stack>
          <Box
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => {
              drag.current = null;
            }}
            sx={{
              width: "100%",
              height: 240,
              borderRadius: "50%",
              overflow: "hidden",
              touchAction: "none",
              cursor: "grab",
              mx: "auto",
              maxWidth: 240,
            }}
          >
            <Box
              component="img"
              src={image.src}
              alt=""
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform: avatarPreviewTransform(zoom, offset.x, offset.y),
              }}
            />
          </Box>
          <Typography sx={{ textAlign: "center", mt: 1.4, fontSize: 12, color: "text.secondary" }}>
            {t("account.drag_to_adjust", "拖动图片调整位置")}
          </Typography>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center", mt: 1.2, px: 0.5 }}>
            <MinusIcon size={18} />
            <Slider
              size="small"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              aria-label={t("account.zoom_avatar", "缩放头像")}
              onChange={(_, value) => {
                const nextZoom = Number(value);
                setZoom(nextZoom);
                setOffset((current) => clampAvatarPreviewOffset(nextZoom, current.x, current.y));
              }}
            />
            <Plus size={18} />
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Stack direction="row" spacing={1.8} sx={{ alignItems: "center" }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {t("account.avatar_preview", "头像预览")}
            </Typography>
            {[48, 32].map((size) => (
              <Box
                key={size}
                sx={{
                  width: size,
                  height: size,
                  borderRadius: "50%",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <Box
                  component="img"
                  src={image.src}
                  alt=""
                  sx={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: avatarPreviewTransform(zoom, offset.x, offset.y, size),
                  }}
                />
              </Box>
            ))}
            <Box sx={{ flex: 1 }} />
            <Typography sx={{ fontSize: 10, color: "text.secondary" }}>
              {t("account.avatar_sync_hint", "保存后同步到账户与导航栏")}
            </Typography>
          </Stack>
          {saving ? (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <Typography sx={{ mt: 1, fontSize: 12, color: "text.secondary" }}>
                {t("account.saving_avatar_hint", "正在处理并保存头像…")}
              </Typography>
            </Box>
          ) : null}
        </Stack>
      ) : hasAvatar ? (
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <Avatar
            src={account?.avatar_url || undefined}
            sx={{ width: 110, height: 110, my: 1, fontSize: 42, ...adminLetterAvatarSx }}
          >
            {(account?.username || "A").slice(0, 1).toUpperCase()}
          </Avatar>
          <Typography sx={{ fontSize: 12, color: "text.secondary", textAlign: "center" }}>
            {t("account.choose_to_adjust", "选择新图片后，可调整位置与大小。")}
          </Typography>
        </Stack>
      ) : (
        <>
          <SettingsDashedZone
            icon={<CloudUpload size={34} />}
            title={t("account.avatar_drop_title", "选择一张你的头像")}
            description={t("account.avatar_drop_hint", "拖动图片到此处，或选择文件")}
            onDropFiles={(files) => {
              const file = files[0];
              if (file) void chooseFile(file);
            }}
            action={
              <Button
                variant="contained"
                onClick={pickFile}
                sx={{ minHeight: { xs: 44, sm: 38 }, fontSize: 13, px: 1.7 }}
              >
                {t("account.choose_image", "选择图片")}
              </Button>
            }
          />
          <Typography sx={{ fontSize: 12, lineHeight: 1.8, color: "text.secondary" }}>
            {t(
              "account.avatar_hint",
              "支持 JPG、PNG、WebP；原图不超过 5 MB、1600 万像素。不支持 GIF、SVG 和 HEIC。",
            )}
          </Typography>
        </>
      )}
    </SettingsSheetDialog>
  );
}

function SignInMethodsPanel({
  open,
  conceal = false,
  onClose,
  onOpen,
  account,
  settings,
  passkeyCount,
}: {
  open: boolean;
  conceal?: boolean;
  onClose: () => void;
  onOpen: (panel: AccountPanel) => void;
  account: { sso_id?: string; "2fa_enabled"?: boolean; has_password?: boolean } | null;
  settings: Record<string, any>;
  passkeyCount: number;
}) {
  const { t } = useTranslation();
  const bound = Boolean(account?.sso_id);
  const providerKey = ssoProviderKey(account?.sso_id, String(settings.o_auth_provider || ""));
  const provider = ssoProviderLabel(providerKey);
  const uniqueId = ssoExternalId(account?.sso_id);
  const hasPassword = account?.has_password !== false;
  const passwordDisabled = Boolean(settings.disable_password_login);
  const passwordDescription = passwordDisabled
    ? hasPassword
      ? t("account.password_login_disabled", "已设置但全局禁用")
      : t("account.password_login_unset_disabled", "未设置 · 全局已关闭密码登录")
    : hasPassword
      ? t("account.password_login_description", "已设置密码")
      : t("account.password_login_unset", "未设置");

  return (
    <SettingsSheetDialog
      open={open}
      conceal={conceal}
      onClose={onClose}
      title={t("account.sign_in_methods", "登录方式")}
      actions={<SettingsSheetActions onConfirm={onClose} confirmLabel={t("common.done", "完成")} />}
    >
      <SettingsDetailRow
        icon={<LockKeyhole size={21} />}
        title={t("account.password_login", "账户密码")}
        description={passwordDescription}
        action={
          <SettingsTextButton onClick={() => onOpen("password")}>
            {t("account.change_password_title")}
          </SettingsTextButton>
        }
      />
      <SettingsDetailRow
        icon={<FingerprintIcon size={21} />}
        title={t("account.passkeys", "通行密钥")}
        description={
          passkeyCount
            ? t("account.passkeys_available", "{{count}} 个可用 · 使用设备或密码管理器验证", {
                count: passkeyCount,
              })
            : t("account.passkeys_description", "使用设备或密码管理器验证")
        }
        action={
          <SettingsTextButton onClick={() => onOpen("passkeys")}>
            {t("common.manage", "管理")}
          </SettingsTextButton>
        }
      />
      <SettingsDetailRow
        icon={providerKey === "github" ? <Github size={21} /> : <Globe size={21} />}
        title={t("account.sso_account", "{{provider}} 账户", { provider })}
        description={
          bound
            ? t("account.sso_bound_id", "已绑定 · ID {{id}}", { id: uniqueId })
            : t("account_settings.sso_not_bound")
        }
        action={
          <SettingsTextButton onClick={() => onOpen("github")}>
            {t("common.manage", "管理")}
          </SettingsTextButton>
        }
        border={false}
      />
      <Box sx={(theme) => ({ mt: 2, bgcolor: settingsNeutralBg(theme), px: 1.6, borderRadius: "8px" })}>
        <SettingsDetailRow
          icon={<Settings size={21} />}
          title={t("account.site_login_rules_title", "站点登录规则")}
          description={t("account.site_login_rules", "密码登录与 SSO 提供方 · 全局")}
          action={
            <SettingsTextButton onClick={() => onOpen("sign-on")}>
              {t("common.configure", "配置")}
            </SettingsTextButton>
          }
          border={false}
        />
      </Box>
    </SettingsSheetDialog>
  );
}

function GithubPanel({
  open,
  hideBackdrop = false,
  onClose,
  account,
  refresh,
  oauthProvider,
  passwordDisabled,
  oauthEnabled,
  passkeyCount,
}: {
  open: boolean;
  hideBackdrop?: boolean;
  onClose: () => void;
  account: { sso_id?: string; username?: string; has_password?: boolean } | null;
  refresh: () => Promise<void>;
  oauthProvider: string;
  passwordDisabled: boolean;
  oauthEnabled: boolean;
  passkeyCount: number;
}) {
  const { t } = useTranslation();
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get("oauth_error");
  const bound = Boolean(account?.sso_id);
  const providerKey = ssoProviderKey(account?.sso_id, oauthProvider);
  const provider = ssoProviderLabel(providerKey);
  const uniqueId = ssoExternalId(account?.sso_id);
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const [keepOneOpen, setKeepOneOpen] = useState(false);
  const providerIcon = providerKey === "github" ? <Github size={21} /> : <Globe size={21} />;
  const providerHeroIcon = providerKey === "github" ? <Github size={30} /> : <Globe size={30} />;

  useEffect(() => {
    if (!open) setConfirmUnbind(false);
  }, [open]);

  return (
    <SettingsSheetDialog
      open={open}
      hideBackdrop={hideBackdrop}
      onClose={onClose}
      title={
        confirmUnbind
          ? t("account.unbind_sso_title", "解除 {{provider}} 绑定", { provider })
          : t("account.sso_account", "{{provider}} 账户", { provider })
      }
      actions={
        confirmUnbind ? (
          <SettingsSheetActions
            onCancel={() => setConfirmUnbind(false)}
            onConfirm={async () => {
              const remaining = remainingSignInMethods({
                passwordDisabled,
                hasPassword: account?.has_password !== false,
                oauthEnabled,
                ssoBound: false,
                passkeyCount,
              });
              if (remaining === 0) {
                setKeepOneOpen(true);
                return;
              }
              const response = await fetch("/api/admin/oauth2/unbind", { method: "POST" });
              if (response.status === 409) {
                setKeepOneOpen(true);
                return;
              }
              if (response.ok) {
                toast.success(t("account_settings.unbind_sso_success", { provider }));
                await refresh();
                setConfirmUnbind(false);
                onClose();
              } else {
                toast.error(t("account_settings.unbind_sso_failed", { provider, error: "" }));
              }
            }}
            confirmLabel={t("account.confirm_unbind", "确认解绑")}
            confirmColor="error"
          />
        ) : bound ? (
          <SettingsSheetActions
            onConfirm={onClose}
            confirmLabel={t("common.done", "完成")}
            left={
              <SettingsTextButton danger onClick={() => setConfirmUnbind(true)}>
                {t("account_settings.unbind_sso", { provider })}
              </SettingsTextButton>
            }
          />
        ) : (
          <SettingsSheetActions
            onCancel={onClose}
            onConfirm={() => {
              sessionStorage.setItem("lite-account-return", "github");
              window.location.href = "/api/admin/oauth2/bind";
            }}
            confirmLabel={t("account.bind_sso_go", "前往 {{provider}} 绑定", { provider })}
          />
        )
      }
    >
      {oauthError ? (
        <SettingsAlert severity="error">
          {t("account.sso_bind_failed", "{{provider}} 绑定未完成，请重试。原有账户资料保持不变。", {
            provider,
          })}
        </SettingsAlert>
      ) : null}
      {confirmUnbind ? (
        <>
          <SettingsAlert severity="warning">
            {t(
              "account.unbind_sso_warning",
              "解除关联后，不能再使用此 {{provider}} 账户登录。请确认还有可用的密码或通行密钥登录方式。",
              { provider },
            )}
          </SettingsAlert>
          <SettingsFacts
            rows={[
              [t("account.provider", "提供方"), provider],
              [t("account.linked_id", "关联 ID"), uniqueId || "—"],
            ]}
          />
        </>
      ) : bound ? (
        <>
          <SettingsDetailRow
            icon={providerIcon}
            title={provider}
            description={t("account.sso_linked", "已关联当前 Lite-Plus 账户")}
            action={
              <Chip
                size="small"
                label={t("account_settings.github_bound", "已绑定")}
                color="success"
              />
            }
            border={false}
          />
          <SettingsFacts rows={[[`${provider} ID`, uniqueId || "—"]]} />
          <Typography sx={{ fontSize: 12, lineHeight: 1.8, color: "text.secondary" }}>
            {t("account.unbind_sso_hint", "解绑后，无法再通过这个 {{provider}} 账户登录 Lite-Plus。", {
              provider,
            })}
          </Typography>
        </>
      ) : (
        <>
          <SettingsHero
            icon={providerHeroIcon}
            title={t("account.sso_hero_title", "绑定 {{provider}} 账户", { provider })}
            description={t(
              "account.sso_hero_desc",
              "通过当前站点配置的 {{provider}} 提供方关联身份。",
              { provider },
            )}
          />
          <SettingsFacts
            rows={[
              [t("account.lite_account", "Lite-Plus 账户"), account?.username || "—"],
              [
                t("account.sso_binding", "{{provider}} 绑定", { provider }),
                t("account_settings.sso_not_bound"),
              ],
            ]}
          />
        </>
      )}
      <LastSignInMethodDialog open={keepOneOpen} onClose={() => setKeepOneOpen(false)} />
    </SettingsSheetDialog>
  );
}

function TwoFactorPanel({
  open,
  onClose,
  account,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  account: { "2fa_enabled"?: boolean } | null;
  refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const enabled = Boolean(account?.["2fa_enabled"]);
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [started, setStarted] = useState(false);
  const [disabling, setDisabling] = useState(false);

  useEffect(() => {
    if (!open) {
      setStarted(false);
      setDisabling(false);
      setCode("");
      setError("");
      setQr("");
      setLoading(false);
    }
  }, [open]);

  const loadQr = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/2fa/generate");
      if (!response.ok) throw new Error(t("account.qr_fetch_error"));
      const blob = await response.blob();
      setQr(URL.createObjectURL(blob));
      setStarted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsSheetDialog
      open={open}
      onClose={onClose}
      title={
        disabling
          ? t("account.disable_2fa_title", "关闭双重身份验证")
          : started
            ? t("account.enable_2fa")
            : t("account.security_verification", "安全验证")
      }
      actions={
        enabled && !disabling ? (
          <SettingsSheetActions
            onConfirm={onClose}
            confirmLabel={t("common.done", "完成")}
            left={
              <SettingsTextButton danger onClick={() => setDisabling(true)}>
                {t("account.disable_2fa_long", "关闭双重验证")}
              </SettingsTextButton>
            }
          />
        ) : disabling ? (
          <SettingsSheetActions
            onCancel={() => {
              setDisabling(false);
              setCode("");
              setError("");
            }}
            onConfirm={async () => {
              const response = await fetch("/api/admin/2fa/disable", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "2fa_code": code }),
              });
              const data = await response.json();
              if (!response.ok) {
                setError(data.message || t("account.tfa_disable_failed", "验证码不正确，双重身份验证仍保持启用。"));
                return;
              }
              await refresh();
              setDisabling(false);
              onClose();
            }}
            confirmLabel={t("account.verify_and_disable", "验证并关闭")}
            confirmColor="error"
          />
        ) : started ? (
          <SettingsSheetActions
            onCancel={onClose}
            onConfirm={async () => {
              const response = await fetch("/api/admin/2fa/enable", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code }),
              });
              const data = await response.json();
              if (!response.ok) {
                setError(data.message || t("account.tfa_code_wrong", "验证码不正确，请输入验证器中的最新验证码。"));
                return;
              }
              await refresh();
              onClose();
            }}
            confirmLabel={t("account.verify_and_enable", "验证并启用")}
            confirmDisabled={loading || !code}
          />
        ) : (
          <SettingsSheetActions
            onCancel={onClose}
            onConfirm={() => void loadQr()}
            confirmLabel={t("account.enable_2fa_short", "启用 2FA")}
          />
        )
      }
    >
      {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
      {enabled && !disabling ? (
        <>
          <SettingsHero
            icon={<Shield size={30} />}
            title={t("account.2fa_enabled")}
            description={t("account.tfa_on_desc", "使用身份验证器中的动态验证码完成验证。")}
            success
          />
          <SettingsFacts
            rows={[
              [t("account.tfa_method", "验证方式"), t("account.tfa_authenticator", "身份验证器")],
              [t("account.tfa_code_label", "验证码"), t("account.tfa_code_digits", "6 位动态验证码")],
            ]}
          />
          <Typography sx={{ fontSize: 12, lineHeight: 1.8, color: "text.secondary" }}>
            {t("account.tfa_replace_hint", "更换验证器时，先使用当前验证码关闭，再重新启用。")}
          </Typography>
        </>
      ) : disabling ? (
        <>
          <SettingsAlert severity="warning">
            {t("account.disable_2fa_warning", "关闭后，密码登录将不再要求动态验证码。")}
          </SettingsAlert>
          <TextField
            size="small"
            fullWidth
            label={t("account.current_otp", "当前动态验证码")}
            placeholder={t("account.otp_placeholder", "6 位动态验证码")}
            helperText={t("account.current_otp_help", "请输入已绑定身份验证器中的当前验证码。")}
            value={code}
            slotProps={{ htmlInput: otpFieldHtmlInput }}
            onChange={(event) => setCode(event.target.value)}
            sx={settingsFieldSx}
          />
        </>
      ) : started ? (
        <>
          {loading ? (
            <Stack sx={{ alignItems: "center", py: 2 }}>
              <Skeleton variant="rounded" width={188} height={188} />
              <Typography sx={{ mt: 1.5, fontSize: 12, color: "text.secondary" }}>
                {t("account.generating_qr", "正在生成二维码…")}
              </Typography>
            </Stack>
          ) : qr ? (
            <Stack sx={{ alignItems: "center", mb: 1 }}>
              <Box
                sx={{ bgcolor: "#fff", p: 1, borderRadius: 1, border: "1px solid #DFE3E8" }}
              >
                <Box component="img" src={qr} alt="" sx={{ width: 174, height: 174, display: "block" }} />
              </Box>
              <Typography sx={{ mt: 1.5, fontSize: 12, color: "text.secondary", textAlign: "center" }}>
                {t("account.2fa_qr_code_hint")}
              </Typography>
            </Stack>
          ) : null}
          <TextField
            size="small"
            fullWidth
            label={t("account.otp_label", "动态验证码")}
            placeholder={t("account.otp_placeholder", "6 位动态验证码")}
            helperText={t("account.qr_valid_30m", "二维码有效期为 30 分钟。")}
            value={code}
            slotProps={{ htmlInput: otpFieldHtmlInput }}
            onChange={(event) => setCode(event.target.value)}
            sx={settingsFieldSx}
          />
        </>
      ) : (
        <SettingsHero
          icon={<Shield size={30} />}
          title={t("account.tfa_hero_title", "启用双重身份验证")}
          description={t("account.tfa_hero_desc", "为密码登录增加身份验证器动态验证码。")}
        />
      )}
    </SettingsSheetDialog>
  );
}

function AutoLogoutPanel({
  open,
  onClose,
  settings,
  refetch,
}: {
  open: boolean;
  onClose: () => void;
  settings: Record<string, any>;
  refetch: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const initial = splitSessionTtl(Number(settings.session_ttl_seconds) || DEFAULT_SESSION_TTL_SECONDS);
  const [amount, setAmount] = useState(initial.amount);
  const [unit, setUnit] = useState<SessionTtlUnit>(initial.unit);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const next = splitSessionTtl(Number(settings.session_ttl_seconds) || DEFAULT_SESSION_TTL_SECONDS);
    setAmount(next.amount);
    setUnit(next.unit);
    setError("");
  }, [open, settings.session_ttl_seconds]);

  const isDefault = amount === 24 && unit === "hours";
  const seconds = sessionTtlInputToSeconds(amount, unit);
  const invalid = seconds === null;

  return (
    <SettingsSheetDialog
      open={open}
      onClose={onClose}
      title={t("account.auto_logout", "自动登出")}
      actions={
        <SettingsSheetActions
          onCancel={onClose}
          onConfirm={async () => {
            if (seconds === null) {
              setError(t("account.ttl_invalid", "时长须为 1 分钟至 30 天。"));
              return;
            }
            await updateSettingsWithToast({ session_ttl_seconds: seconds }, t);
            await refetch();
            onClose();
          }}
          confirmLabel={t("account.save_settings", "保存设置")}
          confirmDisabled={invalid}
          left={
            <SettingsTextButton
              disabled={isDefault}
              onClick={() => {
                setAmount(24);
                setUnit("hours");
                setError("");
              }}
            >
              {t("account.restore_default_ttl", "恢复默认")}
            </SettingsTextButton>
          }
        />
      }
    >
      <Paper variant="outlined" sx={{ px: 2, boxShadow: "none" }}>
        <SettingsDetailRow
          icon={<Globe size={21} />}
          title={t("account.global_scope", "全局设置")}
          description={t("account.global_scope_desc", "本站所有登录会话使用同一条规则")}
          border={false}
        />
      </Paper>
      {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
      <Stack direction="row" spacing={1.4} sx={{ alignItems: "flex-start" }}>
        <TextField
          size="small"
          type="number"
          label={t("account.ttl_amount_label", "自动登出时长")}
          value={amount}
          error={invalid}
          helperText={
            invalid ? t("account.ttl_invalid", "时长须为 1 分钟至 30 天。") : undefined
          }
          onChange={(event) => setAmount(Number(event.target.value))}
          sx={{ ...settingsFieldSx, flex: 1, minWidth: 0 }}
        />
        <TextField
          size="small"
          select
          label={t("account.ttl_unit", "单位")}
          value={unit}
          onChange={(event) => setUnit(event.target.value as SessionTtlUnit)}
          sx={{ width: 100, "& .MuiInputBase-input": { fontSize: 14 } }}
        >
          <MenuItem value="minutes">{t("account.ttl_minutes", "分钟")}</MenuItem>
          <MenuItem value="hours">{t("account.ttl_hours", "小时")}</MenuItem>
          <MenuItem value="days">{t("account.ttl_days", "天")}</MenuItem>
        </TextField>
    </Stack>
      <Typography sx={{ fontSize: 12, lineHeight: 1.8, color: "text.secondary" }}>
        {t(
          "account.ttl_renew_hint",
          "登录、有效期内打开或刷新页面，以及普通操作，都会重新开始倒计时。",
        )}
      </Typography>
      <SettingsAlert>
        {t(
          "account.auto_logout_global",
          "后台自动刷新不会续期；已过期需重新登录。",
        )}
      </SettingsAlert>
    </SettingsSheetDialog>
  );
}

function ApiKeyPanel({
  open,
  onClose,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  settings: Record<string, any>;
}) {
  const { t } = useTranslation();
  const savedKey = String(settings.api_key || "");
  const [value, setValue] = useState(savedKey);
  const [show, setShow] = useState(false);
  const [confirm, setConfirm] = useState<"replace" | "clear" | "">("");

  useEffect(() => {
    if (open) return;
    setValue(savedKey);
    setShow(false);
    setConfirm("");
  }, [open, savedKey]);

  const discardDraft = () => {
    setValue(savedKey);
    setShow(false);
    setConfirm("");
  };

  const close = () => {
    discardDraft();
    onClose();
  };

  const generate = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "lite-";
    for (let i = 0; i < 32; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    setValue(result);
  };

  const save = async () => {
    if (value && value.length < 12) {
      toast.error(t("settings.api.key_length_error"));
      return;
    }
    await updateSettingsWithToast({ api_key: value }, t);
    setConfirm("");
    onClose();
  };

  return (
    <SettingsSheetDialog
      open={open}
      onClose={close}
      title={t("settings.api.title")}
      actions={
        confirm ? (
          <SettingsSheetActions
            onCancel={() => setConfirm("")}
            onConfirm={() => void save()}
            confirmLabel={
              confirm === "clear"
                ? t("account.confirm_clear_key", "确认清空")
                : confirm === "replace"
                  ? t("account.confirm_replace_key", "确认替换")
                  : t("account.save_key", "保存密钥")
            }
            confirmColor={confirm === "clear" ? "error" : "primary"}
          />
        ) : (
          <SettingsSheetActions
            onCancel={close}
            onConfirm={() => {
              if (!value && savedKey) setConfirm("clear");
              else if (value && savedKey && value !== savedKey) setConfirm("replace");
              else void save();
            }}
            confirmLabel={
              value && savedKey && value !== savedKey
                ? t("account.save_and_replace", "保存并替换")
                : t("account.save_key", "保存密钥")
            }
          />
        )
      }
    >
      {confirm ? (
        <SettingsAlert severity="warning">
          {confirm === "clear"
            ? t("account.api_clear_warning", "清空后，本站不再接受当前 API 密钥的访问。账户登录不受影响。")
            : t("account.api_replace_warning", "保存后旧密钥立即失效。使用旧密钥的应用和脚本需要更新为新密钥。")}
        </SettingsAlert>
      ) : (
        <SettingsAlert>
          {t("account.api_warning", "此密钥用于访问站点 API。请只提供给可信的程序。")}
        </SettingsAlert>
      )}
      {confirm !== "clear" ? (
        <TextField
          size="small"
          fullWidth
          type="text"
          name="lite-site-api-key"
          autoComplete="off"
          label={t("account.api_key_label", "站点 API 密钥")}
          value={value}
          helperText={
            value !== savedKey
              ? t("account.api_unsaved_key", "未保存的新密钥")
              : t("account.api_shared_key", "当前站点共用这一把 API 密钥。")
          }
          error={Boolean(value) && value.length < 12}
          onChange={(event) => setValue(event.target.value)}
          sx={settingsFieldSx}
          slotProps={{
            htmlInput: {
              ...secretNotPasswordHtmlInput,
              name: "lite-site-api-key",
              autoComplete: "off",
              style: show ? undefined : { WebkitTextSecurity: "disc" },
            },
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Stack direction="row" spacing={0.5}>
                    <IconButton onClick={() => setShow((current) => !current)} aria-label={t("common.show")}>
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </IconButton>
                    <IconButton
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(value);
                          toast.success(t("copy"));
                        } catch {
                          toast.error(t("settings.site.copy_failed", "复制失败，请手动选择文本。"));
                        }
                      }}
                      aria-label={t("copy")}
                    >
                      <Copy size={16} />
                    </IconButton>
                  </Stack>
                </InputAdornment>
              ),
            },
          }}
        />
      ) : null}
      {!confirm ? (
        <Stack direction="row" sx={{ justifyContent: "space-between" }}>
          <SettingsTextButton icon={<RefreshCw size={17} />} onClick={generate}>
            {t("account.generate_new_key", "生成新密钥")}
          </SettingsTextButton>
          <SettingsTextButton
            danger
            onClick={() => {
              setValue("");
              setConfirm("clear");
            }}
          >
            {t("account.clear_key", "清空密钥")}
          </SettingsTextButton>
        </Stack>
      ) : null}
      {!confirm ? (
        <Typography sx={{ mt: 0, fontSize: 12, color: "text.secondary" }}>
          {t("account.generate_then_save", "生成后需要保存，才会替换当前密钥。")}
        </Typography>
      ) : null}
    </SettingsSheetDialog>
  );
}

function netIsIpHost(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function PasskeysPanel({
  open,
  hideBackdrop = false,
  onClose,
  account,
  onCount,
  passwordDisabled,
  oauthEnabled,
}: {
  open: boolean;
  hideBackdrop?: boolean;
  onClose: () => void;
  account: { "2fa_enabled"?: boolean; sso_id?: string; has_password?: boolean; username?: string } | null;
  onCount?: (count: number) => void;
  passwordDisabled: boolean;
  oauthEnabled: boolean;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<AccountPasskeySummary[]>(
    () => getAccountPasskeySnapshot() ?? [],
  );
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [twoFa, setTwoFa] = useState("");
  const [confirmKey, setConfirmKey] = useState(0);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [step, setStep] = useState<"list" | "add" | "confirm">("list");
  const [confirmMode, setConfirmMode] = useState<"password" | "passkey" | "sso">("password");
  const [renamingId, setRenamingId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [keepOneOpen, setKeepOneOpen] = useState(false);
  const [saveTarget, setSaveTarget] = useState<"" | "platform" | "password-manager">("");
  const ceremonyAbort = useRef<AbortController | null>(null);
  const windowsHelloAvailable = UserAgentHelper.isWindows(
    typeof navigator !== "undefined" ? navigator.userAgent : "",
  );
  const ipHost = Boolean(typeof window !== "undefined" && netIsIpHost(window.location.hostname));
  const hasPassword = account?.has_password !== false;
  const ssoOnly = Boolean(account?.sso_id) && account?.has_password === false;
  const provider = ssoProviderLabel(ssoProviderKey(account?.sso_id));
  const uniqueId = ssoExternalId(account?.sso_id);

  const applyPasskeys = (next: AccountPasskeySummary[]) => {
    const items = rememberAccountPasskeys(next);
    setItems(items);
    onCount?.(items.length);
  };

  const load = async () => {
    try {
      applyPasskeys(await prefetchAccountPasskeys(true));
    } catch {
      return;
    }
  };

  const abortCeremony = () => {
    ceremonyAbort.current?.abort();
    ceremonyAbort.current = null;
  };

  const beginConfirm = (count = items.length) => {
    if (count > 0) setConfirmMode("passkey");
    else if (ssoOnly) setConfirmMode("sso");
    else setConfirmMode("password");
    setStep("confirm");
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (open) return;
    abortCeremony();
    setName("");
    setPassword("");
    setTwoFa("");
    setError("");
    setAdding(false);
    setStep("list");
    setRenamingId("");
    setRenameValue("");
    setDeletingId("");
    setSaveTarget("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError("");
    setStep("list");
    setSaveTarget("");
    void load();
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("oauth_error") || "";
    const confirmed = params.get("passkey_confirm") === "ok";
    const pending = sessionStorage.getItem("lite-passkey-pending-name") || "";
    const pendingPrefer = sessionStorage.getItem("lite-passkey-pending-prefer") || "";
    if (pending) setName(pending);
    if (pendingPrefer === "password-manager" || (pendingPrefer === "platform" && windowsHelloAvailable)) {
      setSaveTarget(pendingPrefer);
    } else if (!windowsHelloAvailable) {
      setSaveTarget("password-manager");
    }
    if (oauthError === "passkey_confirm_failed" || oauthError === "passkey_confirm_mismatch") {
      setConfirmMode("sso");
      setStep("confirm");
      setError(t(`account.${oauthError}`));
      params.delete("oauth_error");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
      return;
    }
    if (confirmed) {
      sessionStorage.removeItem("lite-passkey-pending-name");
      sessionStorage.removeItem("lite-passkey-pending-prefer");
      params.delete("passkey_confirm");
      window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
      if (pending) {
        setName(pending);
        void registerPasskey({
          name: pending,
          method: "sso",
          prefer:
            pendingPrefer === "password-manager" || !windowsHelloAvailable
              ? "password-manager"
              : "platform",
        });
      }
    }
  }, [open]);

  const registerPasskey = async (opts?: {
    name?: string;
    method?: "password" | "passkey" | "sso";
    prefer?: "platform" | "password-manager";
    assertion?: { ceremony_id: string; credential: unknown };
  }) => {
    const nextName = (opts?.name ?? name).trim();
    const method = opts?.method || "password";
    const prefer =
      !windowsHelloAvailable || opts?.prefer === "password-manager" || saveTarget === "password-manager"
        ? "password-manager"
        : opts?.prefer || saveTarget || "platform";
    setAdding(true);
    setError("");
    try {
      if (!window.PublicKeyCredential) {
        throw new Error(t("account.passkey_unavailable", "当前环境不支持通行密钥。"));
      }
      if (ipHost) {
        throw new Error(t("account.passkey_ip_host"));
      }
      const optionsRes = await fetch("/api/admin/account/passkeys/register/options", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nextName,
          method,
          password: method === "password" ? password : undefined,
          "2fa_code": method === "password" ? twoFa : undefined,
          ceremony_id: opts?.assertion?.ceremony_id,
          credential: opts?.assertion?.credential,
          prefer,
        }),
      });
      const optionsBody = await optionsRes.json();
      if (!optionsRes.ok) throw new Error(optionsBody.message || "failed");
      const publicKey = toPasskeyCreateOptions(
        optionsBody.data?.publicKey || optionsBody.publicKey,
        prefer,
      );
      abortCeremony();
      const controller = new AbortController();
      ceremonyAbort.current = controller;
      const credential = (await navigator.credentials.create({
        publicKey,
        signal: controller.signal,
      })) as PublicKeyCredential;
      const verifyRes = await fetch("/api/admin/account/passkeys/register/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ceremony_id: optionsBody.data?.ceremony_id || optionsBody.ceremony_id,
          credential: serializeCredential(credential),
        }),
      });
      const verifyBody = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyBody.message || "failed");
      const created = (verifyBody.data ?? verifyBody) as {
        id?: string;
        name?: string;
        created_at?: string;
        aaguid?: string;
      };
      setName("");
      setPassword("");
      setTwoFa("");
      setStep("list");
      setItems((current) => {
        const id = String(created?.id || "");
        const next = id
          ? current.some((row) => row.id === id)
            ? current
            : [
                ...current,
                {
                  id,
                  name: created.name || nextName,
                  created_at: created.created_at,
                  aaguid: created.aaguid,
                },
              ]
          : current;
        const count = id ? next.length : current.length + 1;
        rememberAccountPasskeys(id ? next : current);
        onCount?.(count);
        return id ? next : current;
      });
      await load();
    } catch (reason) {
      const code = passkeyUnavailableMessage(reason, "failed");
      if (code === "aborted") return;
      setError(
        t(`account.passkey_${code}`, reason instanceof Error ? reason.message : String(reason)),
      );
    } finally {
      setAdding(false);
    }
  };

  const confirmAndRegister = async () => {
    if (confirmMode === "sso") {
      sessionStorage.setItem("lite-passkey-pending-name", name.trim());
      sessionStorage.setItem("lite-passkey-pending-prefer", saveTarget || "platform");
      window.location.assign("/api/admin/oauth2/confirm-passkey");
      return;
    }
    if (confirmMode === "passkey") {
      try {
        setAdding(true);
        setError("");
        abortCeremony();
        const controller = new AbortController();
        ceremonyAbort.current = controller;
        const assertion = await confirmAdminPasskey(controller.signal);
        await registerPasskey({ method: "passkey", assertion });
      } catch (reason) {
        const code = passkeyUnavailableMessage(reason, "failed");
        if (code === "aborted") {
          setAdding(false);
          return;
        }
        setError(
          t(`account.passkey_${code}`, reason instanceof Error ? reason.message : String(reason)),
        );
        setAdding(false);
      }
      return;
    }
    await registerPasskey({ method: "password" });
  };

  const close = () => {
    abortCeremony();
    onClose();
  };

  return (
    <SettingsSheetDialog
      open={open}
      hideBackdrop={hideBackdrop}
      onClose={close}
      title={
        adding
          ? saveTarget === "password-manager"
            ? t("account.passkey_waiting_manager", "请在 Bitwarden 等密码管理器中确认。")
            : t("account.passkey_waiting_hello", "请在 Windows Hello 中确认。")
          : step === "confirm"
            ? t("account.passkey_confirm_title", "确认当前账户身份")
          : step === "add"
            ? t("account.add_passkey", "添加通行密钥")
            : t("account.passkeys", "通行密钥")
      }
      actions={
        adding ? (
          <SettingsSheetActions
            onCancel={close}
            cancelLabel={t("account.cancel_add_passkey", "取消添加")}
          />
        ) : step === "confirm" ? (
          <SettingsSheetActions
            onCancel={() => {
              setPassword("");
              setTwoFa("");
              setError("");
              setConfirmKey((key) => key + 1);
              setStep("add");
            }}
            onConfirm={() => void confirmAndRegister()}
            confirmLabel={
              confirmMode === "sso"
                ? t("account.passkey_verify_sso_go", { provider })
                : confirmMode === "passkey"
                  ? t("account.passkey_use_existing", "使用通行密钥验证")
                  : t("account.continue_add_passkey", "继续添加")
            }
            confirmDisabled={confirmMode === "password" && !password.trim()}
          />
        ) : step === "add" ? (
          <SettingsSheetActions
            onCancel={() => {
              setStep("list");
              setError("");
            }}
            onConfirm={() => beginConfirm()}
            confirmLabel={t("account.continue_add_passkey", "继续添加")}
            confirmDisabled={!name.trim() || !saveTarget}
          />
        ) : items.length === 0 ? (
          <SettingsSheetActions
            onCancel={onClose}
            onConfirm={() => {
              if (!windowsHelloAvailable) setSaveTarget("password-manager");
              setStep("add");
            }}
            cancelLabel={t("common.back", "返回")}
            confirmLabel={t("account.add_passkey", "添加通行密钥")}
          />
        ) : (
          <SettingsSheetActions
            onCancel={onClose}
            onConfirm={() => {
              if (!windowsHelloAvailable) setSaveTarget("password-manager");
              setStep("add");
            }}
            cancelLabel={t("common.done", "完成")}
            confirmLabel={t("account.add_passkey", "添加通行密钥")}
          />
        )
      }
    >
      {error ? <SettingsAlert severity="error">{error}</SettingsAlert> : null}
      <LastSignInMethodDialog open={keepOneOpen} onClose={() => setKeepOneOpen(false)} />
      {ipHost ? <SettingsAlert severity="warning">{t("account.passkey_ip_host")}</SettingsAlert> : null}
      {adding ? (
        <>
          <SettingsHero
            icon={<FingerprintIcon size={30} />}
            title={t("account.passkey_waiting", "等待你完成验证")}
            description={
              saveTarget === "password-manager"
                ? t("account.passkey_waiting_manager", "请在 Bitwarden 等密码管理器中确认。")
                : t("account.passkey_waiting_hello", "请在 Windows Hello 中确认。")
            }
          />
          <Stack direction="row" spacing={1.2} sx={{ alignItems: "center", justifyContent: "center", mb: 1 }}>
            <CircularProgress size={20} />
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              {t("account.passkey_waiting_return", "完成后将自动返回这里")}
            </Typography>
          </Stack>
          <SettingsFacts
            rows={[
              [t("account.adding_name", "正在添加"), name || "—"],
              [t("account.lite_account", "账户"), "—"],
            ]}
          />
        </>
      ) : step === "confirm" ? (
        confirmMode === "sso" ? (
          <>
            <SettingsHero
              icon={<Github size={30} />}
              title={t("account.passkey_verify_sso_title", { provider })}
              description={t("account.passkey_verify_sso_desc")}
            />
            <SettingsFacts
              rows={[
                [t("account.passkey_verify_sso_id", { provider }), uniqueId || "—"],
                [t("account.adding_name", "正在添加"), name || "—"],
              ]}
            />
            <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.8 }}>
              {t("account.passkey_verify_sso_caption", { provider })}
            </Typography>
          </>
        ) : confirmMode === "passkey" ? (
          <>
            <SettingsAlert>
              {t("account.passkey_use_existing_desc", "使用已绑定的通行密钥验证后，继续添加新密钥。")}
            </SettingsAlert>
            <SettingsHero
              icon={<FingerprintIcon size={30} />}
              title={t("account.passkey_use_existing_title", "使用已有通行密钥")}
              description={t("account.passkey_use_existing_desc")}
            />
            {hasPassword ? (
              <SettingsTextButton onClick={() => setConfirmMode("password")}>
                {t("account.passkey_use_password_instead", "改用账户密码验证")}
              </SettingsTextButton>
            ) : null}
          </>
        ) : (
          <Stack spacing={2}>
            <TextField
              key={`passkey-password-${confirmKey}`}
              size="small"
              fullWidth
              type="password"
              autoComplete="current-password"
              label={t("account.password_confirm", "账户密码")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              sx={settingsFieldSx}
            />
            {account?.["2fa_enabled"] ? (
              <TextField
                key={`passkey-otp-${confirmKey}`}
                size="small"
                fullWidth
                name={isMobile ? undefined : "one-time-code"}
                autoComplete={isMobile ? "off" : "one-time-code"}
                label={t("account.2fa_otp_input_prompt")}
                value={twoFa}
                onChange={(event) => setTwoFa(event.target.value.replace(/\D/g, "").slice(0, 6))}
                sx={settingsFieldSx}
                slotProps={{
                  htmlInput: isMobile
                    ? {
                        ...secretNotPasswordHtmlInput,
                        inputMode: "numeric",
                        maxLength: 6,
                      }
                    : otpFieldHtmlInput,
                }}
              />
            ) : null}
            {items.length > 0 ? (
              <SettingsTextButton onClick={() => setConfirmMode("passkey")}>
                {t("account.passkey_use_passkey_instead", "改用通行密钥验证")}
              </SettingsTextButton>
            ) : null}
          </Stack>
        )
      ) : step === "add" ? (
        <>
          <SettingsAlert>
            {t("account.passkey_add_info", "填写名称后，选择一种保存方式继续。")}
          </SettingsAlert>
          <TextField
            size="small"
            fullWidth
            label={t("account.passkey_name", "通行密钥名称")}
            value={name}
            helperText={t("account.passkey_name_help", "1–32 个字符，用于帮助你辨认这把密钥。")}
            onChange={(event) => setName(event.target.value.slice(0, 32))}
            sx={settingsFieldSx}
          />
          <Stack spacing={1}>
            {windowsHelloAvailable ? (
              <Paper
                component="button"
                type="button"
                variant="outlined"
                onClick={() => {
                  setSaveTarget("platform");
                  if (name.trim()) beginConfirm();
                }}
                sx={(theme) => ({
                  display: "block",
                  width: "100%",
                  p: 0,
                  px: 2,
                  appearance: "none",
                  font: "inherit",
                  color: "inherit",
                  textAlign: "left",
                  boxShadow: "none",
                  cursor: "pointer",
                  bgcolor: saveTarget === "platform" ? settingsSoftBg(theme) : "transparent",
                  borderColor: saveTarget === "platform" ? "primary.main" : "divider",
                  "&:hover": {
                    bgcolor: saveTarget === "platform" ? settingsSoftBg(theme) : theme.palette.action.hover,
                    borderColor: saveTarget === "platform" ? "primary.main" : "divider",
                  },
                })}
              >
                <SettingsDetailRow
                  icon={<Devices size={21} />}
                  title="Windows Hello"
                  description={t("account.passkey_hello_desc", "在 Windows 上使用指纹、面容或设备 PIN")}
                  border={false}
                />
              </Paper>
            ) : null}
            <Paper
              component="button"
              type="button"
              variant="outlined"
              onClick={() => {
                setSaveTarget("password-manager");
                if (name.trim()) beginConfirm();
              }}
              sx={(theme) => ({
                display: "block",
                width: "100%",
                p: 0,
                px: 2,
                appearance: "none",
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                boxShadow: "none",
                cursor: "pointer",
                bgcolor: saveTarget === "password-manager" ? settingsSoftBg(theme) : "transparent",
                borderColor: saveTarget === "password-manager" ? "primary.main" : "divider",
                "&:hover": {
                  bgcolor:
                    saveTarget === "password-manager" ? settingsSoftBg(theme) : theme.palette.action.hover,
                  borderColor: saveTarget === "password-manager" ? "primary.main" : "divider",
                },
              })}
            >
              <SettingsDetailRow
                icon={<KeyRound size={21} />}
                title={t("account.passkey_manager_title", "Bitwarden 等密码管理器")}
                description={t("account.passkey_manager_desc", "在已安装并启用的管理器中保存通行密钥")}
                border={false}
              />
            </Paper>
          </Stack>
          {windowsHelloAvailable ? (
            <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.8 }}>
              {t("account.passkey_available_hint", "点哪一项就用哪种方式添加。")}
            </Typography>
          ) : null}
        </>
      ) : items.length === 0 ? (
        <SettingsHero
          icon={<FingerprintIcon size={30} />}
          title={t("account.passkeys_hero_title", "添加你的第一把通行密钥")}
          description={t(
            "account.passkeys_hero_desc",
            "使用 Windows Hello、Bitwarden 等验证身份，无需输入账户密码。",
          )}
        />
      ) : (
        <>
          <Paper variant="outlined" sx={{ px: 2, boxShadow: "none" }}>
            {items.map((item, index) => (
              <SettingsDetailRow
                key={item.id}
                icon={
                  isWindowsHelloPasskey(item.aaguid) ? (
                    <Devices size={21} />
                  ) : (
                    <KeyRound size={21} />
                  )
                }
                title={
                  renamingId === item.id ? (
                    <TextField
                      size="small"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value.slice(0, 32))}
                      sx={{ ...settingsFieldSx, maxWidth: 220 }}
                    />
                  ) : (
                    item.name
                  )
                }
                description={
                  item.created_at
                    ? t("account.passkey_created_at", "创建于 {{time}}", {
                        time: new Date(item.created_at).toLocaleString(),
                      })
                    : undefined
                }
                action={
                  deletingId === item.id ? (
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                      <SettingsTextButton onClick={() => setDeletingId("")}>
                        {t("common.cancel")}
                      </SettingsTextButton>
                      <SettingsTextButton
                        danger
                        onClick={async () => {
                          const remaining = remainingSignInMethods({
                            passwordDisabled,
                            hasPassword: account?.has_password !== false,
                            oauthEnabled,
                            ssoBound: Boolean(account?.sso_id),
                            passkeyCount: items.length - 1,
                          });
                          if (remaining === 0) {
                            setKeepOneOpen(true);
                            setDeletingId("");
                            return;
                          }
                          const response = await fetch(`/api/admin/account/passkeys/${item.id}`, {
                            method: "DELETE",
                          });
                          const body = await response.json().catch(() => ({}));
                          if (response.status === 409) {
                            setKeepOneOpen(true);
                            setDeletingId("");
                            return;
                          }
                          if (!response.ok) {
                            setError(body.message || t("account.passkey_failed"));
                            return;
                          }
                          setDeletingId("");
                          setItems((current) => {
                            const next = rememberAccountPasskeys(current.filter((row) => row.id !== item.id));
                            onCount?.(next.length);
                            return next;
                          });
                          await load();
                        }}
                      >
                        {t("account.passkey_delete_confirm", "确认删除")}
                      </SettingsTextButton>
                    </Stack>
                  ) : renamingId === item.id ? (
                    <SettingsTextButton
                      onClick={async () => {
                        const response = await fetch(`/api/admin/account/passkeys/${item.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ name: renameValue }),
                        });
                        const body = await response.json().catch(() => ({}));
                        if (!response.ok) {
                          setError(body.message || t("account.passkey_failed"));
                          return;
                        }
                        setRenamingId("");
                        await load();
                      }}
                    >
                      {t("common.save")}
                    </SettingsTextButton>
                  ) : (
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                      <SettingsTextButton
                        onClick={() => {
                          setDeletingId("");
                          setRenamingId(item.id);
                          setRenameValue(item.name);
                        }}
                      >
                        {t("account.passkey_rename")}
                      </SettingsTextButton>
                      <SettingsTextButton
                        danger
                        onClick={() => {
                          setRenamingId("");
                          setDeletingId(item.id);
                          setError("");
                        }}
                      >
                        {t("common.delete")}
                      </SettingsTextButton>
                    </Stack>
                  )
                }
                border={index < items.length - 1}
              />
            ))}
          </Paper>
          <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.8 }}>
            {t(
              "account.passkey_name_owner_hint",
              "名称由你设置，保存与同步由对应的设备或密码管理器负责。",
            )}
          </Typography>
        </>
      )}
    </SettingsSheetDialog>
  );
}

