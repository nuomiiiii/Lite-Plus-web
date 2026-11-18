import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import menuConfig from "@/config/menuConfig.json";
import { useRPC2Call } from "@/contexts/RPC2Context";
import { usePublicInfo } from "@/contexts/PublicInfoContext";
import { useReduceMotionPreference } from "@/lib/api";
import { preloadAdminRoute } from "@/routes";
import type { MenuItem } from "@/types/menu";
import { buildAdminMenuItems } from "@/utils/adminMenu";
import { ADMIN_HOVER_PRELOAD_DELAY_MS } from "@/utils/adminPreload";
import { isSelfUpdatePreview } from "@/utils/guidePreview";
import { fetchThemeManifest } from "@/utils/themeManifest";
import { clearAdminNodeLiveDataCache } from "@/hooks/use-admin-node-live-data";
import { clearStoredRemoteGrant } from "@/utils/remoteSession";
import {
  getThemeConfigurationType,
  normalizeThemeRedirectTarget,
  THEME_CONFIGURATION_MANAGED,
  THEME_CONFIGURATION_RAW,
  THEME_CONFIGURATION_REDIRECT,
} from "@/utils/themeConfiguration";
import {
  browserSessionStorage,
  fetchGithubReleases,
  readGithubReleasesCache,
  scheduleIdleGithubReleasesLoad,
  writeGithubReleasesCache,
} from "@/utils/githubReleases";
import {
  formatReleaseVersion,
  isReleaseNewer,
  parseReleaseVersionHash,
  type GithubReleaseInfo,
  type SelfUpdateCapability,
  type UpdatePhase,
  type VersionInfo,
} from "./adminShellModel";

const parsedMenuConfig = menuConfig as {
  menu: MenuItem[];
  footer?: MenuItem[];
};

export const baseMenuItems = parsedMenuConfig.menu;
export const footerMenuItems = parsedMenuConfig.footer ?? [];

export function useAdminShell() {
  const { call, callViaHTTP } = useRPC2Call();
  const { t } = useTranslation();
  const { publicInfo } = usePublicInfo();
  const reduceMotion = useReduceMotionPreference();
  const currentTheme = publicInfo?.theme;

  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [selfUpdate, setSelfUpdate] = useState<SelfUpdateCapability | null>(
    null,
  );
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>("idle");
  const updateInFlight = useRef(false);
  const unmountedRef = useRef(false);
  const updateTimerRef = useRef<number | null>(null);
  const hoverPreloadTimerRef = useRef<number | null>(null);
  const hoverPreloadHrefRef = useRef<string | null>(null);
  const [latestRelease, setLatestRelease] = useState<GithubReleaseInfo | null>(
    null,
  );
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [releasesSince, setReleasesSince] = useState<GithubReleaseInfo[]>([]);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [extraMenuItems, setExtraMenuItems] = useState<MenuItem[]>([]);
  const previewUpdate = isSelfUpdatePreview();

  const menuItems = useMemo(
    () => buildAdminMenuItems(baseMenuItems, extraMenuItems),
    [extraMenuItems],
  );

  const currentVersion = previewUpdate
    ? "2.2.2"
    : (publicInfo as { version?: string } | undefined)?.version ||
      versionInfo?.version;
  const currentReleaseURL = currentVersion
    ? `https://github.com/nuomiiiii/Lite/releases/tag/${encodeURIComponent(currentVersion)}`
    : undefined;

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = reduceMotion
      ? "true"
      : "false";
    document.documentElement.dataset.adminShellActive = "true";
    return () => {
      delete document.documentElement.dataset.reduceMotion;
      delete document.documentElement.dataset.adminShellActive;
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (!previewUpdate) return;
    setVersionInfo({
      version: "2.2.2",
      hash: "a1b2c3d",
      deployment: "linux",
    });
    setSelfUpdate({
      deployment: "linux",
      supported: true,
      distribution: "debian",
      distribution_version: "12",
    });
    const release = {
      tag_name: "2.2.3",
      name: "轻量.Lite 2.2.3",
      html_url: "https://github.com/nuomiiiii/Lite/releases/tag/2.2.3",
      published_at: new Date().toISOString(),
      body: [
        "<!-- lite-version-hash: b2c3d4e -->",
        "",
        "## 重要提示",
        "",
        "> [!IMPORTANT]",
        "> 轻量.Lite 2.3.0 版本 目前仍处于管理页面UI焕新阶段，更新会较为频繁，如果不是追新党，可以静待2.3.1 版本更新",
        "",
        "## 主要更新",
        "",
        "- 成本中心剩余价值按剩余天数计算，超过一个计费周期不再封顶",
        "- 更新说明弹窗加长后，底部按钮保持固定，正文在内部滚动",
        "- 发版构建会编入最新公共主题",
        "",
        "## Bug 修复",
        "",
        "- 成本中心深色模式筛选与搜索对比度",
        "- 更新介绍上下滑动后按钮卡在中间",
        "- 服务器列表底部分页摘要",
        "",
        "## 其他",
        "",
        "- 本页是本地预览，不会真正升级",
        "- 请向下滑动这段说明，确认「取消 / 立即更新」始终贴在弹窗底部",
        "- 滑动时按钮不应跟着正文跑到中间",
        "",
        "## 安装",
        "",
        "Linux 一键安装：",
        "",
        "```",
        "curl -fsSL https://raw.githubusercontent.com/nuomiiiii/lite/main/install-lite.sh -o install-lite.sh && chmod +x install-lite.sh && sudo ./install-lite.sh",
        "```",
        "",
        "Docker：",
        "",
        "```",
        "docker run -d --name lite -p 27777:27777 ghcr.io/nuomiiiii/lite:latest",
        "```",
        "",
        "预览填充段落，用来把说明撑出滚动条：",
        "",
        ...Array.from({ length: 12 }, (_, index) => `- 预览行 ${index + 1}：继续向下滑动，底部按钮应保持不动`),
      ].join("\n"),
    };
    setLatestRelease(release);
    setReleasesSince([release]);
    setUpdateAvailable(true);
    setUpdateDialogOpen(true);
  }, [previewUpdate]);

  useEffect(() => {
    let ignore = false;

    async function loadThemeMenu() {
      if (!currentTheme) {
        setExtraMenuItems([]);
        return;
      }

      try {
        const response = await fetchThemeManifest(currentTheme, {
          cache: "no-cache",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const metadata = await response.json();
        if (ignore) return;
        const configuration = metadata?.configuration;
        if (!configuration) {
          setExtraMenuItems([]);
          return;
        }

        const configurationType = getThemeConfigurationType(configuration);
        let itemPath: string | null = null;
        if (
          configurationType === THEME_CONFIGURATION_MANAGED &&
          Array.isArray(configuration.data) &&
          configuration.data.length > 0
        ) {
          itemPath = "/admin/theme_managed";
        } else if (configurationType === THEME_CONFIGURATION_RAW) {
          itemPath = "/admin/theme_raw";
        } else if (configurationType === THEME_CONFIGURATION_REDIRECT) {
          itemPath = normalizeThemeRedirectTarget(configuration.data);
        }

        if (!itemPath) {
          setExtraMenuItems([]);
          return;
        }

        const rawLabel = t("theme.configure", "主题设置");
        setExtraMenuItems([
          {
            labelKey: rawLabel,
            rawLabel,
            path: itemPath,
            icon: configuration.icon || "Palette",
            reloadDocument:
              configurationType === THEME_CONFIGURATION_REDIRECT,
          },
        ]);
      } catch (error) {
        console.warn("Failed to load the active theme configuration menu:", error);
        if (!ignore) setExtraMenuItems([]);
      }
    }

    void loadThemeMenu();
    return () => {
      ignore = true;
    };
  }, [currentTheme, t]);

  useEffect(() => {
    if (previewUpdate) return;
    const fetchVersionInfo = async () => {
      try {
        const data = await call("common:getVersion");
        setVersionInfo({
          hash: data.hash?.slice(0, 7),
          version: data.version,
          deployment: data.deployment || "unknown",
        });
      } catch (error) {
        console.error("Failed to fetch version info:", error);
      }
    };

    void fetchVersionInfo();
  }, [call, previewUpdate]);

  useEffect(() => {
    if (previewUpdate) {
      return;
    }
    if (versionInfo?.deployment !== "linux") {
      setSelfUpdate(null);
      return;
    }
    let ignore = false;
    call("admin:getSelfUpdateStatus")
      .then((status: SelfUpdateCapability) => {
        if (!ignore) setSelfUpdate(status);
      })
      .catch((error) => {
        console.warn("Failed to load self-update capability:", error);
        if (!ignore) setSelfUpdate(null);
      });
    return () => {
      ignore = true;
    };
  }, [call, previewUpdate, versionInfo?.deployment]);

  useEffect(() => {
    if (previewUpdate) return;
    let ignore = false;
    const current = (publicInfo as { version?: string } | undefined)?.version ||
      versionInfo?.version;
    const currentHash = versionInfo?.hash;
    if (!current) return;
    const storage = browserSessionStorage();

    const applyReleases = (data: GithubReleaseInfo[]) => {
      const valid = data
        .filter((release) => !release.draft && !release.prerelease)
        .filter((release) => isReleaseNewer(release, current, currentHash));
      setReleasesSince(valid);
      setLatestRelease(valid.length ? valid[0] : null);
      setUpdateAvailable(valid.length > 0);
    };

    const cached = readGithubReleasesCache(storage);
    if (cached) applyReleases(cached);

    const stop = scheduleIdleGithubReleasesLoad({
      load: async () => {
        try {
          const data = await fetchGithubReleases();
          if (ignore) return;
          writeGithubReleasesCache(storage, data);
          applyReleases(data);
        } catch (error) {
          console.warn("加载 GitHub 最新发布失败:", error);
          if (!ignore && !cached) {
            setLatestRelease(null);
            setReleasesSince([]);
            setUpdateAvailable(false);
          }
        }
      },
      timers: {
        requestIdleCallback: window.requestIdleCallback?.bind(window),
        cancelIdleCallback: window.cancelIdleCallback?.bind(window),
        setTimeout: (callback, delay) =>
          Number(globalThis.setTimeout(callback, delay)),
        clearTimeout: (handle) => globalThis.clearTimeout(handle),
      },
    });

    return () => {
      ignore = true;
      stop();
    };
  }, [publicInfo, versionInfo]);

  const getAdminLinkTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return null;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (
      !anchor ||
      anchor.target === "_blank" ||
      anchor.hasAttribute("download")
    ) {
      return null;
    }
    if (anchor.dataset.adminReloadDocument === "true") return null;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return null;
    if (url.pathname !== "/admin" && !url.pathname.startsWith("/admin/")) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  };

  const clearHoverPreload = useCallback(() => {
    if (hoverPreloadTimerRef.current !== null) {
      window.clearTimeout(hoverPreloadTimerRef.current);
      hoverPreloadTimerRef.current = null;
    }
    hoverPreloadHrefRef.current = null;
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      clearHoverPreload();
      if (updateTimerRef.current !== null) {
        window.clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
  }, [clearHoverPreload]);

  const preloadAdminLink = (target: EventTarget | null, immediate = false) => {
    const href = getAdminLinkTarget(target);
    if (!href) {
      clearHoverPreload();
      return;
    }
    if (immediate) {
      clearHoverPreload();
      void preloadAdminRoute(href);
      return;
    }
    if (hoverPreloadHrefRef.current === href && hoverPreloadTimerRef.current !== null) {
      return;
    }
    clearHoverPreload();
    hoverPreloadHrefRef.current = href;
    hoverPreloadTimerRef.current = window.setTimeout(() => {
      hoverPreloadTimerRef.current = null;
      hoverPreloadHrefRef.current = null;
      if (!unmountedRef.current) void preloadAdminRoute(href);
    }, ADMIN_HOVER_PRELOAD_DELAY_MS);
  };

  const cancelPreloadAdminLink = (
    target: EventTarget | null,
    relatedTarget: EventTarget | null,
  ) => {
    const fromHref = getAdminLinkTarget(target);
    if (!fromHref) return;
    const toHref = getAdminLinkTarget(relatedTarget);
    if (toHref === fromHref) return;
    if (hoverPreloadHrefRef.current === fromHref) {
      clearHoverPreload();
    }
  };

  const waitForUpdatedService = useCallback(
    async (targetVersion: string, targetHash: string) => {
      const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
          updateTimerRef.current = window.setTimeout(() => {
            updateTimerRef.current = null;
            resolve();
          }, ms);
        });
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline) {
        if (unmountedRef.current) return;
        await sleep(2_000);
        if (unmountedRef.current) return;
        try {
          const response = await fetch("/api/version", { cache: "no-store" });
          if (unmountedRef.current) return;
          if (!response.ok) continue;
          const body = await response.json();
          if (unmountedRef.current) return;
          const observed = body?.data ?? body;
          if (
            observed?.version === targetVersion &&
            String(observed?.hash || "").toLowerCase() ===
              targetHash.toLowerCase()
          ) {
            toast.success(
              t("common.self_update_succeeded", "更新成功，正在刷新页面"),
            );
            updateTimerRef.current = window.setTimeout(() => {
              updateTimerRef.current = null;
              if (!unmountedRef.current) window.location.reload();
            }, 800);
            return;
          }
          const status = await callViaHTTP<unknown, SelfUpdateCapability>(
            "admin:getSelfUpdateStatus",
            {},
            { timeout: 5_000 },
          );
          if (unmountedRef.current) return;
          if (
            status.last_result?.target_version === targetVersion &&
            ["rolled_back", "rollback_failed", "failed"].includes(
              status.last_result.status,
            )
          ) {
            const terminalError = new Error(
              status.last_result.status === "rolled_back"
                ? t(
                    "common.self_update_rolled_back",
                    "新版本未通过健康检查，已自动恢复原版本和数据",
                  )
                : status.last_result.message ||
                    t("common.self_update_failed", "自动更新失败"),
            );
            terminalError.name = "SelfUpdateTerminalError";
            throw terminalError;
          }
        } catch (error) {
          if (unmountedRef.current) return;
          if (
            error instanceof Error &&
            error.name === "SelfUpdateTerminalError"
          ) {
            throw error;
          }
        }
      }
      if (unmountedRef.current) return;
      throw new Error(
        t(
          "common.self_update_timeout",
          "更新状态确认超时，请稍后刷新页面查看当前版本",
        ),
      );
    },
    [callViaHTTP, t],
  );

  const startSelfUpdate = useCallback(async () => {
    if (!latestRelease || updateInFlight.current) return;
    const targetVersion = latestRelease.tag_name || latestRelease.name || "";
    const targetHash = parseReleaseVersionHash(latestRelease.body);
    if (!targetVersion || !targetHash) {
      toast.error(
        t(
          "common.self_update_metadata_missing",
          "发布版本缺少自动更新校验信息",
        ),
      );
      return;
    }
    updateInFlight.current = true;
    setUpdatePhase("preparing");
    try {
      await callViaHTTP(
        "admin:startSelfUpdate",
        { version: targetVersion, version_hash: targetHash },
        { timeout: 360_000 },
      );
      if (unmountedRef.current) return;
      setUpdatePhase("restarting");
      toast.info(t("common.self_update_restarting", "更新已校验，服务正在重启"));
      await waitForUpdatedService(targetVersion, targetHash);
    } catch (error) {
      updateInFlight.current = false;
      if (unmountedRef.current) return;
      const raw =
        error instanceof Error
          ? error.message
          : t("common.self_update_failed", "自动更新失败");
      const message = raw.includes("already running")
        ? t(
            "common.self_update_already_running",
            "已经有一次更新在进行，请等这次结束或稍后再试",
          )
        : raw;
      toast.error(message);
      setUpdatePhase("idle");
    }
  }, [callViaHTTP, latestRelease, t, waitForUpdatedService]);

  return {
    reduceMotion,
    menuItems,
    versionInfo,
    selfUpdate,
    updatePhase,
    latestRelease,
    updateAvailable,
    releasesSince,
    updateDialogOpen,
    setUpdateDialogOpen,
    currentVersion,
    currentReleaseURL,
    formatReleaseVersion,
    preloadAdminLink,
    cancelPreloadAdminLink,
    startSelfUpdate,
  };
}

export function logout() {
  clearStoredRemoteGrant();
  clearAdminNodeLiveDataCache();
  window.open("/api/logout", "_self");
}
