import AdminPageTitle from "@/components/admin/AdminPageTitle";
import { AdminSheetTabs, AdminTabLabel } from "@/components/admin/AdminSheetTabs";
import { SettingCard } from "@/components/admin/SettingCard";
import { useSettings } from "@/lib/api";
import {
  CLOUDFLARED_STOP_CONFIRM_TEXT,
  getCloudflaredStatus,
  getCloudflaredStatusSnapshot,
  prefetchCloudflaredStatus,
  removeCloudflaredToken,
  startCloudflared,
  stopCloudflared,
  type CloudflaredStatus,
} from "@/lib/cloudflared";
import {
  buildHTTPFallbackURL,
  buildHTTPSRedirectURL,
  getHTTPSSettings,
  getHTTPSSettingsSnapshot,
  prefetchHTTPSSettings,
  classifyHTTPSError,
  reloadHTTPSCertificate,
  reuseRootCertificate,
  updateHTTPSSettings,
  type HTTPSSettings,
  type HTTPSStatus,
  type RootCertificateChoice,
} from "@/lib/https";
import {
  AppDialogContent,
  Badge,
  Button,
  Callout,
  Dialog,
  Flex,
  IconButton,
  Switch,
  Tabs,
  Text,
  TextField,
} from "@/components/admin/ui";
import {
  Cloud,
  ExternalLink,
  Eye,
  EyeOff,
  LockKeyhole,
  Play,
  RefreshCw,
  Save,
  Square,
  Trash2,
} from "@/components/admin/muiIcons";
import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAdminTabParam } from "@/hooks/useAdminTabParam";
import { useHeldTab } from "@/hooks/useHeldTab";

const REVERSE_PROXY_TABS = ["https", "cloudflare"] as const;

export default function ReverseProxySettings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useAdminTabParam(REVERSE_PROXY_TABS, "https");
  const [httpsReady, setHttpsReady] = React.useState(() => getHTTPSSettingsSnapshot() !== null);
  const [cloudflareReady, setCloudflareReady] = React.useState(
    () => getCloudflaredStatusSnapshot() !== null,
  );
  const tabReady = activeTab === "https" ? httpsReady : cloudflareReady;
  const displayTab = useHeldTab(activeTab, tabReady);
  const routePending = activeTab === displayTab && !tabReady;
  const markHttpsReady = React.useCallback(() => setHttpsReady(true), []);
  const markCloudflareReady = React.useCallback(() => setCloudflareReady(true), []);

  React.useEffect(() => {
    void prefetchHTTPSSettings();
    void prefetchCloudflaredStatus();
  }, []);

  return (
    <Flex
      direction="column"
      gap="3"
      data-admin-route-pending={routePending ? "true" : undefined}
    >
      <AdminPageTitle
        description={t(
          "settings.reverse_proxy.page_description",
          "管理内置 HTTPS 与 Cloudflare Tunnel 接入。",
        )}
      >
        {t("settings.reverse_proxy.title", "Reverse Proxy")}
      </AdminPageTitle>
      <Tabs.Root
        value={displayTab}
        onValueChange={setActiveTab}
      >
        <AdminSheetTabs>
          <Tabs.List>
            <Tabs.Trigger value="https">
              <AdminTabLabel icon={<LockKeyhole size={18} />}>
                {t("settings.reverse_proxy.https_tab", "Built-in HTTPS")}
              </AdminTabLabel>
            </Tabs.Trigger>
            <Tabs.Trigger value="cloudflare">
              <AdminTabLabel icon={<Cloud size={18} />}>
                {t(
                  "settings.reverse_proxy.cloudflare_title",
                  "Cloudflare Tunnel",
                )}
              </AdminTabLabel>
            </Tabs.Trigger>
          </Tabs.List>
        </AdminSheetTabs>
        <div
          className="admin-tab-panel pt-3"
          data-state={displayTab === "https" ? "active" : "inactive"}
          hidden={displayTab !== "https"}
        >
          <HTTPSPanel onReady={markHttpsReady} />
        </div>
        <div
          className="admin-tab-panel pt-3"
          data-state={displayTab === "cloudflare" ? "active" : "inactive"}
          hidden={displayTab !== "cloudflare"}
        >
          <CloudflareTunnelPanel onReady={markCloudflareReady} />
        </div>
      </Tabs.Root>
    </Flex>
  );
}

const emptyHTTPSSettings: HTTPSSettings = {
  https_enabled: false,
  https_listen: ":37888",
  https_redirect_http: false,
  https_certificate_path: "./data/tls/server.crt",
  https_private_key_path: "./data/tls/server.key",
};

const emptyHTTPSStatus: HTTPSStatus = {
  enabled: false,
  running: false,
  ready: false,
  listener_ipv4: false,
  listener_ipv6: false,
  listener_ipv4_available: true,
  listener_ipv6_available: true,
  listener_probe_done: true,
  listen: ":37888",
  domains: [],
};

function extractListenPort(listen: string): string {
  const match = listen.trim().match(/:(\d+)$/);
  return match?.[1] ?? "37888";
}

function HTTPSPanel({ onReady }: { onReady: () => void }) {
  const { t, i18n } = useTranslation();
  const snapshot = getHTTPSSettingsSnapshot();
  const [settings, setSettings] = React.useState(snapshot?.settings ?? emptyHTTPSSettings);
  const [status, setStatus] = React.useState(snapshot?.status ?? emptyHTTPSStatus);
  const [port, setPort] = React.useState(() => extractListenPort(snapshot?.settings.https_listen ?? "37888"));
  const [loading, setLoading] = React.useState(() => snapshot === null);
  const [saving, setSaving] = React.useState(false);
  const [reloading, setReloading] = React.useState(false);
  const [reusing, setReusing] = React.useState(false);
  const [rootChoices, setRootChoices] = React.useState<RootCertificateChoice[] | null>(null);
  const [pickedRootId, setPickedRootId] = React.useState("");

  const localizedError = React.useCallback((error: unknown) => {
    const key = classifyHTTPSError(error);
    const messages = {
      certificate_required: t(
        "settings.reverse_proxy.https_certificate_required",
        "请先配置有效的证书和私钥，再启用内置 HTTPS。",
      ),
      certificate_invalid: t(
        "settings.reverse_proxy.https_certificate_invalid",
        "证书或私钥无效，请检查文件是否匹配。",
      ),
      certificate_expired: t(
        "settings.reverse_proxy.https_certificate_expired",
        "证书已过期，请更换有效证书。",
      ),
      no_root_certificate: t(
        "settings.reverse_proxy.https_no_root_certificate",
        "签发管理中还没有已签发的根域名证书。",
      ),
      port_unavailable: t(
        "settings.reverse_proxy.https_port_unavailable",
        "HTTPS 端口不可用，请检查端口格式或占用情况。",
      ),
      apply_failed: t(
        "settings.reverse_proxy.https_apply_failed",
        "HTTPS 配置未能生效，请检查证书、私钥和监听端口。",
      ),
    };
    return messages[key];
  }, [t]);

  const refresh = React.useCallback(async (silent = false, syncForm = false) => {
    try {
      const payload = await getHTTPSSettings();
      setStatus(payload.status);
      if (syncForm) {
        setSettings(payload.settings);
        setPort(extractListenPort(payload.settings.https_listen));
      }
    } catch (error) {
      if (!silent) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLoading(false);
      onReady();
    }
  }, [onReady]);

  React.useEffect(() => {
    void refresh(false, true);
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const save = async () => {
    const numericPort = Number.parseInt(port, 10);
    if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
      toast.error(
        t("settings.reverse_proxy.invalid_https_port", "Invalid HTTPS port"),
      );
      return;
    }
    setSaving(true);
    try {
      const payload = await updateHTTPSSettings({
        ...settings,
        https_listen: `:${numericPort}`,
      });
      setSettings(payload.settings);
      setStatus(payload.status);
      setPort(extractListenPort(payload.settings.https_listen));
      toast.success(t("settings.settings_saved"));
      const fallbackURL = buildHTTPFallbackURL(
        payload.http_origin,
        window.location,
      );
      if (!payload.settings.https_enabled && fallbackURL) {
        window.location.replace(fallbackURL);
        return;
      }
      const secureURL = buildHTTPSRedirectURL(
        payload.https_origin,
        window.location,
      );
      if (
        payload.settings.https_enabled &&
        payload.settings.https_redirect_http &&
        payload.status.running &&
        payload.status.ready &&
        secureURL
      ) {
        window.location.replace(secureURL);
      }
    } catch (error) {
      console.error(error);
      toast.error(localizedError(error));
    } finally {
      setSaving(false);
    }
  };

  const reloadCertificate = async () => {
    setReloading(true);
    try {
      setStatus(await reloadHTTPSCertificate());
      toast.success(
        t(
          "settings.reverse_proxy.certificate_reload_success",
          "Certificate reloaded",
        ),
      );
    } catch (error) {
      console.error(error);
      toast.error(localizedError(error));
    } finally {
      setReloading(false);
    }
  };

  const reuseRoot = async (id?: string) => {
    setReusing(true);
    try {
      const payload = await reuseRootCertificate(id);
      if (payload.need_pick) {
        const certs = payload.certs || [];
        setRootChoices(certs);
        setPickedRootId(certs[0]?.id || "");
        return;
      }
      setRootChoices(null);
      setSettings(payload.settings);
      setStatus(payload.status);
      setPort(extractListenPort(payload.settings.https_listen));
      toast.success(
        t(
          "settings.reverse_proxy.reuse_root_certificate_success",
          "已复用根域名证书 {{domain}}",
          { domain: payload.domain || "" },
        ),
      );
    } catch (error) {
      console.error(error);
      toast.error(localizedError(error));
    } finally {
      setReusing(false);
    }
  };

  if (loading) {
    return null;
  }

  const date = (value?: string) => {
    if (!value) return t("common.none", "None");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() <= 1) {
      return t("common.none", "None");
    }
    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(parsed);
  };

  const listenPort = status.listen.match(/:(\d+)$/)?.[1] ?? status.listen;
  const listenerBadge = (family: "IPv4" | "IPv6", active: boolean) => {
    if (active) {
      return (
        <Badge key={family} variant="soft" color="green">
          {t("settings.reverse_proxy.listener_ready", "{{family}} listening", { family })}
        </Badge>
      );
    }
    if (status.running && !status.listener_probe_done) {
      return (
        <Badge key={family} variant="soft" color="gray">
          {t("settings.reverse_proxy.listener_checking", "Checking {{family}}", { family })}
        </Badge>
      );
    }
    return (
      <Badge key={family} variant="soft" color={status.running ? "orange" : "gray"}>
        {t("settings.reverse_proxy.listener_unavailable", "{{family}} not listening", { family })}
      </Badge>
    );
  };

  return (
    <Flex direction="column" gap="3">
      <SettingCard
        title={t("settings.reverse_proxy.https_status", "HTTPS status")}
        description={t(
          "settings.reverse_proxy.https_status_description",
          "Runtime and certificate status",
        )}
        direction="column"
      >
        <Flex direction="column" gap="3" className="w-full pt-3">
          <Flex gap="2" wrap="wrap">
            <Badge variant="soft" color={status.running ? "green" : "gray"}>
              {status.running
                ? t("settings.reverse_proxy.running", "Running")
                : t("settings.reverse_proxy.stopped", "Stopped")}
            </Badge>
            <Badge
              variant="soft"
              color={status.ready ? (status.running ? "green" : "blue") : "orange"}
            >
              {status.ready
                ? status.running
                  ? t("settings.reverse_proxy.certificate_ready", "Certificate ready")
                  : t("settings.reverse_proxy.certificate_pending_enable", "Certificate ready to enable")
                : t("settings.reverse_proxy.certificate_waiting", "Certificate not configured")}
            </Badge>
            {status.listener_ipv4_available
              ? listenerBadge("IPv4", status.listener_ipv4)
              : null}
            {status.listener_ipv6_available
              ? listenerBadge("IPv6", status.listener_ipv6)
              : null}
            {status.listen ? (
              <Badge variant="soft">
                {t("settings.reverse_proxy.listener_port", "Port {{port}}", { port: listenPort })}
              </Badge>
            ) : null}
          </Flex>
          {status.error ? (
            <Callout.Root color="red" size="1">
              <Callout.Text>{localizedError(status.error)}</Callout.Text>
            </Callout.Root>
          ) : null}
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <StatusValue
              label={t("settings.reverse_proxy.certificate_domains", "Domains")}
              value={status.domains?.join(", ") || t("common.none", "None")}
            />
            <StatusValue
              label={t("settings.reverse_proxy.certificate_issuer", "Issuer")}
              value={status.issuer || t("common.none", "None")}
            />
            <StatusValue
              label={t("settings.reverse_proxy.certificate_expires", "Expires")}
              value={date(status.expires_at)}
            />
            <StatusValue
              label={t("settings.reverse_proxy.last_certificate_check", "Last check")}
              value={date(status.last_checked_at)}
            />
          </div>
        </Flex>
      </SettingCard>

      <SettingCard
        title={t("settings.reverse_proxy.enable_https", "Enable built-in HTTPS")}
        description={t(
          "settings.reverse_proxy.enable_https_description",
          "When enabled, Lite-Plus provides HTTPS access for both the web UI and Agent APIs.",
        )}
      >
        <SettingCard.Action>
          <Switch
            checked={settings.https_enabled}
            onCheckedChange={(checked) =>
              setSettings((current) => ({ ...current, https_enabled: checked }))
            }
          />
        </SettingCard.Action>
      </SettingCard>

      <SettingCard
        title={t("settings.reverse_proxy.https_port", "HTTPS port")}
        description={t(
          "settings.reverse_proxy.https_port_description",
          "Docker deployments can map a public port to this port.",
        )}
      >
        <SettingCard.Action>
          <TextField.Root
            type="number"
            min="1"
            max="65535"
            value={port}
            onChange={(event) => setPort(event.target.value)}
            className="w-28"
          />
        </SettingCard.Action>
      </SettingCard>

      <SettingCard
        title={t(
          "settings.reverse_proxy.redirect_http",
          "Redirect HTTP to HTTPS",
        )}
        description={t(
          "settings.reverse_proxy.redirect_http_description",
          "Redirect only after HTTPS and its certificate are ready. Enable this after testing is complete.",
        )}
      >
        <SettingCard.Action>
          <Switch
            checked={settings.https_redirect_http}
            onCheckedChange={(checked) =>
              setSettings((current) => ({
                ...current,
                https_redirect_http: checked,
              }))
            }
          />
        </SettingCard.Action>
      </SettingCard>

      <SettingCard
        title={t("settings.reverse_proxy.certificate_paths", "Certificate paths")}
        description={t(
          "settings.reverse_proxy.certificate_paths_description",
          "Lite-Plus reads the certificate and private key from the server. Docker users should mount the certificate directory first and enter its path inside the container.",
        )}
        direction="column"
      >
        <Flex direction="column" gap="3" className="w-full pt-3">
          <Field
            label={t("settings.reverse_proxy.certificate_path", "Certificate path")}
            value={settings.https_certificate_path}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                https_certificate_path: value,
              }))
            }
          />
          <Field
            label={t("settings.reverse_proxy.private_key_path", "Private key path")}
            value={settings.https_private_key_path}
            onChange={(value) =>
              setSettings((current) => ({
                ...current,
                https_private_key_path: value,
              }))
            }
          />
          <Flex gap="2" wrap="wrap">
            <Button
              variant="soft"
              disabled={reloading || !status.running}
              onClick={() => void reloadCertificate()}
            >
              <RefreshCw size={16} className={reloading ? "animate-spin" : ""} />
              {t("settings.reverse_proxy.reload_certificate", "Reload certificate")}
            </Button>
            <Button
              variant="soft"
              disabled={reusing}
              onClick={() => void reuseRoot()}
            >
              {t("settings.reverse_proxy.reuse_root_certificate", "Reuse root certificate")}
            </Button>
          </Flex>
        </Flex>
      </SettingCard>

      <Flex justify="end">
        <Button disabled={saving} onClick={() => void save()}>
          <Save size={16} />
          {t("common.save", "Save")}
        </Button>
      </Flex>
      <Dialog.Root open={rootChoices !== null} onOpenChange={(next: boolean) => { if (!next) { setRootChoices(null); setPickedRootId(""); } }}>
        <AppDialogContent
          title={t("settings.reverse_proxy.reuse_root_pick_title", "选择要复用的根域名证书")}
          description={t(
            "settings.reverse_proxy.reuse_root_pick_help",
            "签发管理中有多张已签发的根域名证书，请选择一张用于内置 HTTPS。",
          )}
        >
          <Flex direction="column" gap="2" className="mt-3">
            {(rootChoices || []).map((cert) => {
              const selected = cert.id === pickedRootId;
              const apex = String(cert.domain || "").replace(/^\*\./, "");
              return (
                <Button
                  key={cert.id}
                  variant={selected ? undefined : "soft"}
                  disabled={reusing}
                  onClick={() => setPickedRootId(cert.id)}
                  className="!h-auto !justify-start !whitespace-normal py-2"
                >
                  <Flex direction="column" align="start" gap="1" className="min-w-0 text-left">
                    <Text size="2" weight="medium" style={selected ? { color: "inherit" } : undefined}>
                      {apex} / *.{apex}
                    </Text>
                    <Text size="1" color={selected ? undefined : "gray"} style={selected ? { color: "inherit" } : undefined}>
                      {[cert.issuer || t("nodemgt.cert_source_acme", "Let's Encrypt"), date(cert.not_after || undefined)].filter(Boolean).join("  ·  ")}
                    </Text>
                  </Flex>
                </Button>
              );
            })}
            <Flex justify="end" gap="2" className="mt-2">
              <Button variant="soft" disabled={reusing} onClick={() => { setRootChoices(null); setPickedRootId(""); }}>
                {t("common.cancel", "Cancel")}
              </Button>
              <Button disabled={reusing || !pickedRootId} onClick={() => void reuseRoot(pickedRootId)}>
                {t("settings.reverse_proxy.reuse_root_use", "使用这张证书")}
              </Button>
            </Flex>
          </Flex>
        </AppDialogContent>
      </Dialog.Root>
    </Flex>
  );
}

function StatusValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Text size="1" color="gray" className="block">
        {label}
      </Text>
      <Text size="2" weight="medium" className="block break-words">
        {value}
      </Text>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email";
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium">{label}</label>
      <TextField.Root
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

const emptyStatus: CloudflaredStatus = {
  installed: false,
  running: false,
  message: "",
  errorMessage: "",
  logs: [],
  tokenStored: false,
  envTokenPresent: false,
};

function CloudflareTunnelPanel({ onReady }: { onReady: () => void }) {
  const { t } = useTranslation();
  const { settings, error: settingsError } = useSettings();
  const snapshot = getCloudflaredStatusSnapshot();
  const [status, setStatus] = React.useState<CloudflaredStatus>(snapshot ?? emptyStatus);
  const [loading, setLoading] = React.useState(() => snapshot === null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [token, setToken] = React.useState("");
  const [showToken, setShowToken] = React.useState(false);
  const [stopDialogOpen, setStopDialogOpen] = React.useState(false);
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [confirmText, setConfirmText] = React.useState("");

  const refreshStatus = React.useCallback(async (silent = false) => {
    if (!silent) {
      setRefreshing(true);
    }
    try {
      const nextStatus = await getCloudflaredStatus();
      setStatus({
        ...nextStatus,
        logs: Array.isArray(nextStatus.logs) ? nextStatus.logs : [],
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t(
              "settings.reverse_proxy.fetch_status_failed",
              "Failed to fetch cloudflared status"
            );
      if (!silent) {
        toast.error(message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      onReady();
    }
  }, [onReady, t]);

  React.useEffect(() => {
    void refreshStatus();
    const timer = window.setInterval(() => {
      void refreshStatus(true);
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refreshStatus]);

  const withSubmit = async (
    task: () => Promise<CloudflaredStatus>,
    successMessage: string
  ) => {
    setSubmitting(true);
    try {
      const nextStatus = await task();
      setStatus({
        ...nextStatus,
        logs: Array.isArray(nextStatus.logs) ? nextStatus.logs : [],
      });
      setToken("");
      setShowToken(false);
      toast.success(successMessage);
      return nextStatus;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : t("settings.settings_save_failed");
      toast.error(message);
      throw error;
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return null;
  }

  if (settingsError) {
    return <Text color="red">{settingsError}</Text>;
  }

  const disablePasswordDoubleCheck = Boolean(settings.disable_password_login);
  const canStart =
    status.installed && (status.tokenStored || token.trim().length > 0);
  const stopConfirmSatisfied = disablePasswordDoubleCheck
    ? confirmText.trim() === CLOUDFLARED_STOP_CONFIRM_TEXT
    : currentPassword.trim().length > 0;
  const localizedStatusMessage =
    status.message === "cloudflared is not running"
      ? t("settings.reverse_proxy.stopped", "stopped")
      : status.message === "cloudflared is running"
        ? t("settings.reverse_proxy.running", "running")
        : status.message;

  return (
    <Flex direction="column" gap="4">
      <SettingCard
        title={t("settings.reverse_proxy.cloudflare_overview", "运行概览")}
        description={t(
          "settings.reverse_proxy.cloudflare_overview_description",
          "集中查看 cloudflared、Tunnel 与令牌状态，并管理连接。"
        )}
        direction="column"
      >
        <Flex direction="column" gap="4" className="w-full pt-3">
          <div className="grid grid-cols-1 divide-y divide-[var(--gray-a5)] border-y border-[var(--gray-a5)] bg-[var(--color-panel-solid)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatusLine
              label={t(
                "settings.reverse_proxy.cloudflared_label",
                "cloudflared"
              )}
              ok={status.installed}
              okText={t(
                "settings.reverse_proxy.installed",
                "installed"
              )}
              failText={t(
                "settings.reverse_proxy.not_installed",
                "not installed"
              )}
            />
            <StatusLine
              label={t("settings.reverse_proxy.status_label", "status")}
              ok={status.running}
              okText={t("settings.reverse_proxy.running", "running")}
              failText={t("settings.reverse_proxy.stopped", "stopped")}
            />
            <StatusLine
              label={t("settings.reverse_proxy.token_status", "连接令牌")}
              ok={status.tokenStored || status.envTokenPresent}
              okText={t("settings.reverse_proxy.token_ready", "已配置")}
              failText={t("settings.reverse_proxy.token_missing", "未配置")}
            />
          </div>

          {status.binaryPath || status.pid ? (
            <div className="min-w-0 space-y-1 px-1 text-sm leading-6 text-muted-foreground">
              {status.binaryPath ? (
                <p>
                  {t("settings.reverse_proxy.binary_label", "Binary")}:{" "}
                  <code className="break-all text-foreground">{status.binaryPath}</code>
                </p>
              ) : null}
              {status.pid ? <p>PID: {status.pid}</p> : null}
            </div>
          ) : null}

          {status.envTokenPresent ? (
            <Text size="2" color="gray">
              {t(
                "settings.reverse_proxy.env_token_hint",
                "Environment variable `KOMARI_CLOUDFLARED_TOKEN` is present. Lite-Plus will try to restore cloudflared automatically on restart."
              )}
            </Text>
          ) : null}

          <div className="border-t border-[var(--gray-a5)] pt-4">
            <label
              className="mb-2 block text-base font-semibold leading-6"
              htmlFor="cloudflareTunnelToken"
            >
              {t(
                "settings.reverse_proxy.cloudflare_token",
                "Cloudflare Tunnel Token"
              )}
            </label>
            <TextField.Root
              id="cloudflareTunnelToken"
              type={showToken ? "text" : "password"}
              value={token}
              placeholder={
                status.tokenStored
                  ? t(
                      "settings.reverse_proxy.cloudflare_token_stored_placeholder",
                      "•••••••••••••••• (stored securely, not returned to the browser)"
                    )
                  : t(
                      "settings.reverse_proxy.cloudflare_token_placeholder",
                      "Paste your Cloudflare Tunnel token"
                    )
              }
              onChange={(event) => {
                setToken(event.target.value);
              }}
              autoComplete="new-password"
              disabled={status.running}
            >
              <TextField.Slot side="right">
                <IconButton
                  type="button"
                  variant="ghost"
                  onClick={() => setShowToken((prev) => !prev)}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </IconButton>
              </TextField.Slot>
            </TextField.Root>
            <div className="mt-3 flex flex-col gap-2">
              <Text size="2" color="gray" className="block leading-6">
                {t(
                  "settings.reverse_proxy.cloudflare_token_help",
                  "The saved token is encrypted on the server side. The frontend only receives whether a token is stored, never the raw token."
                )}
              </Text>
              <Text size="2" color="gray" className="block leading-6">
                <a
                  href="https://github.com/louislam/uptime-kuma/wiki/Reverse-Proxy-with-Cloudflare-Tunnel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-[var(--accent-11)] underline underline-offset-2"
                >
                  {t("settings.reverse_proxy.token_guide", "查看令牌获取说明")}
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              </Text>
            </div>
          </div>

          <Flex gap="2" wrap="wrap">
            {!status.running ? (
              <Button
                disabled={submitting || !canStart}
                className="w-full sm:w-auto"
                onClick={() =>
                  void withSubmit(
                    () => startCloudflared(token.trim()),
                    t(
                      "settings.reverse_proxy.start_success",
                      "cloudflared started"
                    )
                  )
                }
              >
                <Play size={16} />
                {t(
                  "settings.reverse_proxy.start_cloudflared",
                  "Start cloudflared"
                )}
              </Button>
            ) : (
              <Button
                color="red"
                disabled={submitting}
                className="w-full sm:w-auto"
                onClick={() => setStopDialogOpen(true)}
              >
                <Square size={16} />
                {t(
                  "settings.reverse_proxy.stop_cloudflared",
                  "Stop cloudflared"
                )}
              </Button>
            )}

            <Button
              variant="soft"
              color="gray"
              disabled={refreshing}
              className="w-full sm:w-auto"
              onClick={() => void refreshStatus()}
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              {t("common.refresh", "Refresh")}
            </Button>
            {status.tokenStored && !status.running ? (
              <Button
                variant="soft"
                color="red"
                disabled={submitting}
                className="w-full sm:w-auto"
                onClick={() =>
                  void withSubmit(
                    () => removeCloudflaredToken(),
                    t(
                      "settings.reverse_proxy.remove_token_success",
                      "Cloudflare Tunnel token removed"
                    )
                  )
                }
              >
                <Trash2 size={16} />
                {t(
                  "settings.reverse_proxy.remove_token",
                  "Remove the stored token"
                )}
              </Button>
            ) : null}
          </Flex>

          {status.message || status.errorMessage || status.logs.length > 0 ? (
            <div className="border-t border-[var(--gray-a5)] pt-4">
              <h3 className="text-base font-semibold leading-6 text-foreground">
                {t("settings.reverse_proxy.runtime_records", "运行记录")}
              </h3>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t(
                  "settings.reverse_proxy.runtime_records_description",
                  "查看最近状态、错误与 cloudflared 输出。"
                )}
              </p>
            </div>
          ) : null}

          {status.message ? (
            <Text size="2" color="gray">
              {t("settings.reverse_proxy.latest_status", "Latest status")}:{" "}
              {localizedStatusMessage}
            </Text>
          ) : null}

          {status.errorMessage ? (
            <div>
              <label className="mb-2 block text-sm font-medium">
                {t(
                  "settings.reverse_proxy.error_message",
                  "Error message"
                )}
              </label>
              <Callout.Root color="red" role="alert">
                <Callout.Text>{status.errorMessage}</Callout.Text>
              </Callout.Root>
            </div>
          ) : null}

          {status.logs.length > 0 ? (
            <div>
              <label className="mb-2 block text-sm font-medium">
                {t("settings.reverse_proxy.recent_logs", "Recent logs")}
              </label>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--gray-a5)] bg-[var(--gray-a2)] p-3 font-mono text-xs leading-5 text-foreground">
                {status.logs.join("\n")}
              </pre>
            </div>
          ) : null}

          {!status.installed ? (
            <Text size="2" color="gray">
              {t(
                "settings.reverse_proxy.install_hint",
                "Install cloudflared yourself before using Cloudflare Tunnel, or set `LITE_CLOUDFLARED_BIN` to its path."
              )}
            </Text>
          ) : null}
        </Flex>
      </SettingCard>

      <Dialog.Root
        open={stopDialogOpen}
        onOpenChange={(open) => {
          setStopDialogOpen(open);
          if (!open) {
            setCurrentPassword("");
            setConfirmText("");
          }
        }}
      >
        <AppDialogContent maxWidth="520px">
          <Dialog.Title>
            {t(
              "settings.reverse_proxy.stop_dialog_title",
              "Stop cloudflared"
            )}
          </Dialog.Title>
          <Dialog.Description>
            {t(
              "settings.reverse_proxy.stop_dialog_description",
              "If you are currently accessing Lite-Plus through this tunnel, stopping cloudflared may immediately disconnect your session."
            )}
          </Dialog.Description>

          {!disablePasswordDoubleCheck ? (
            <Flex direction="column" gap="2" className="mt-4">
              <label
                className="text-sm font-medium"
                htmlFor="cloudflaredCurrentPassword"
              >
                {t(
                  "settings.reverse_proxy.current_password",
                  "Current password"
                )}
              </label>
              <TextField.Root
                id="cloudflaredCurrentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Flex>
          ) : (
            <Flex direction="column" gap="2" className="mt-4">
              <label
                className="text-sm font-medium"
                htmlFor="cloudflaredStopConfirmText"
              >
                {t(
                  "settings.reverse_proxy.confirmation_text",
                  "Confirmation text"
                )}
              </label>
              <Text size="2" color="gray">
                {t(
                  "settings.reverse_proxy.confirmation_help",
                  "Password login is disabled. Type `STOP CLOUDFLARED` to confirm."
                )}
              </Text>
              <TextField.Root
                id="cloudflaredStopConfirmText"
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                autoComplete="off"
              />
            </Flex>
          )}

          <Flex justify="end" gap="2" className="mt-6">
            <Dialog.Close>
              <Button variant="soft">{t("cancel", "Cancel")}</Button>
            </Dialog.Close>
            <Button
              color="red"
              disabled={submitting || !stopConfirmSatisfied}
              onClick={async () => {
                await withSubmit(
                  () => stopCloudflared(currentPassword, confirmText),
                  t(
                    "settings.reverse_proxy.stop_success",
                    "cloudflared stopped"
                  )
                );
                setCurrentPassword("");
                setConfirmText("");
                setStopDialogOpen(false);
              }}
            >
              {t(
                "settings.reverse_proxy.stop_cloudflared",
                "Stop cloudflared"
              )}
            </Button>
          </Flex>
        </AppDialogContent>
      </Dialog.Root>
    </Flex>
  );
}

function StatusLine({
  label,
  ok,
  okText,
  failText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs leading-5 text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex min-w-0 items-center gap-2">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: ok ? "var(--green-9)" : "var(--gray-8)" }}
          aria-hidden="true"
        />
        <strong className="truncate text-sm font-semibold leading-6 text-foreground">
          {ok ? okText : failText}
        </strong>
      </div>
    </div>
  );
}
