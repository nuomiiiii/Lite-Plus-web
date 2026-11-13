import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAdminScrollRestore } from "@/hooks/useAdminScrollRestore";
import { useIsMobile } from "@/hooks/use-mobile";
import { syncSubMenuForLocation, toggleSingleSubMenu } from "@/utils/adminMenu";
import {
  desktopNavWidth,
  readDesktopNavMini,
  writeDesktopNavMini,
} from "./adminShellModel";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import UpdateReleaseDialog from "./UpdateReleaseDialog";
import { footerMenuItems, useAdminShell } from "./useAdminShell";

type AdminShellProps = {
  content: ReactNode;
};

export default function AdminShell({ content }: AdminShellProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const location = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  useAdminScrollRestore(scrollRef);
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [miniNav, setMiniNav] = useState(() =>
    isMobile ? false : readDesktopNavMini(),
  );
  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({});
  const ishttps = window.location.protocol === "https:";
  const shell = useAdminShell();
  const mini = !isMobile && miniNav;
  const navWidth = isMobile
    ? "min(280px, calc(100vw - 48px))"
    : desktopNavWidth(mini);

  useEffect(() => {
    document.documentElement.setAttribute("data-admin-shell-active", "true");
    return () => {
      document.documentElement.removeAttribute("data-admin-shell-active");
    };
  }, []);

  useLayoutEffect(() => {
    const syncToastTop = () => {
      if (window.innerWidth >= 1024) {
        document.documentElement.style.setProperty(
          "--admin-toast-top",
          "calc(12px + var(--safe-area-top))",
        );
        return;
      }
      const bar = document.querySelector<HTMLElement>("[data-admin-shell] .MuiAppBar-root");
      const banner = document.querySelector<HTMLElement>("[data-admin-top-banner]");
      const barBottom = bar?.getBoundingClientRect().bottom ?? 56;
      if (!banner) {
        document.documentElement.style.setProperty(
          "--admin-toast-top",
          `${Math.round(barBottom + 12)}px`,
        );
        return;
      }
      const contentPad = window.innerWidth >= 900 ? 24 : 16;
      document.documentElement.style.setProperty(
        "--admin-toast-top",
        `${Math.round(barBottom + contentPad + banner.offsetHeight + 8)}px`,
      );
    };
    syncToastTop();
    window.addEventListener("resize", syncToastTop);
    return () => {
      window.removeEventListener("resize", syncToastTop);
      document.documentElement.style.removeProperty("--admin-toast-top");
    };
  }, [location.pathname]);

  useEffect(() => {
    setSidebarOpen(!isMobile);
    if (isMobile) setMiniNav(false);
  }, [isMobile]);

  useEffect(() => {
    setOpenSubMenus((current) =>
      syncSubMenuForLocation(current, shell.menuItems, location.pathname),
    );
  }, [location.pathname, shell.menuItems]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-admin-shell]");
    if (!root) return;

    const tabListSelector = ".km-admin-sheet-tabs [role='tablist']";
    const tabLists = new Set<HTMLElement>();
    const scheduledFrames = new Map<HTMLElement, number>();

    const updateIndicator = (list: HTMLElement) => {
      scheduledFrames.delete(list);
      const activeTab = list.querySelector<HTMLElement>(
        '[role="tab"][aria-selected="true"]',
      );
      if (!activeTab) return;
      const listRect = list.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      list.style.setProperty(
        "--admin-tab-highlight-x",
        `${tabRect.left - listRect.left + list.scrollLeft}px`,
      );
      list.style.setProperty("--admin-tab-highlight-width", `${tabRect.width}px`);
      if (!list.hasAttribute("data-admin-tab-motion-ready")) {
        list.setAttribute("data-admin-tab-indicator-instant", "");
        list.setAttribute("data-admin-tab-motion-ready", "true");
        window.requestAnimationFrame(() => {
          if (list.isConnected)
            list.removeAttribute("data-admin-tab-indicator-instant");
        });
      }
    };

    const scheduleIndicator = (list: HTMLElement) => {
      const currentFrame = scheduledFrames.get(list);
      if (currentFrame) window.cancelAnimationFrame(currentFrame);
      scheduledFrames.set(
        list,
        window.requestAnimationFrame(() => updateIndicator(list)),
      );
    };

    const resizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => scheduleIndicator(entry.target as HTMLElement));
    });

    const tabAttrObserver = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as HTMLElement;
        if (!target.matches?.("[role='tab']")) continue;
        const list = target.closest<HTMLElement>(tabListSelector);
        if (list) scheduleIndicator(list);
      }
    });

    const registerTabList = (list: HTMLElement) => {
      if (list.closest(".firewall-protection-tabs")) return;
      if (tabLists.has(list)) return;
      tabLists.add(list);
      resizeObserver.observe(list);
      tabAttrObserver.observe(list, {
        attributes: true,
        attributeFilter: ["data-state", "aria-selected"],
        subtree: true,
      });
      list.addEventListener("scroll", handleTabListScroll, { passive: true });
      updateIndicator(list);
    };

    function handleTabListScroll(event: Event) {
      scheduleIndicator(event.currentTarget as HTMLElement);
    }

    const registerTabListsWithin = (rootNode: ParentNode) => {
      rootNode
        .querySelectorAll<HTMLElement>(tabListSelector)
        .forEach(registerTabList);
    };

    registerTabListsWithin(root);
    const page = root.querySelector("[data-admin-page-content]") ?? root;
    let pageScanAt = 0;
    const pageResizeObserver = new ResizeObserver(() => {
      const now = Date.now();
      if (now - pageScanAt < 200) return;
      pageScanAt = now;
      registerTabListsWithin(root);
    });
    pageResizeObserver.observe(page);
    const tabListObserver = new MutationObserver(() => {
      registerTabListsWithin(root);
    });
    tabListObserver.observe(page, { childList: true, subtree: true });
    const handleResize = () => tabLists.forEach(scheduleIndicator);
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      tabListObserver.disconnect();
      tabAttrObserver.disconnect();
      pageResizeObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      scheduledFrames.forEach((frame) => window.cancelAnimationFrame(frame));
      tabLists.forEach((list) => {
        list.removeEventListener("scroll", handleTabListScroll);
        list.removeAttribute("data-admin-tab-motion-ready");
        list.removeAttribute("data-admin-tab-indicator-instant");
        list.style.removeProperty("--admin-tab-highlight-x");
        list.style.removeProperty("--admin-tab-highlight-width");
      });
    };
  }, [shell.reduceMotion, location.pathname]);

  const closeMobileNav = () => {
    if (isMobile) setSidebarOpen(false);
  };

  const toggleMiniNav = () => {
    setMiniNav((current) => {
      const next = !current;
      writeDesktopNavMini(next);
      return next;
    });
  };

  const navMotion = {
    duration: shell.reduceMotion ? 0 : 280,
    easing: shell.reduceMotion ? "linear" : "cubic-bezier(0.22, 1, 0.36, 1)",
  };

  const sidebar = (
    <AdminSidebar
      menuItems={shell.menuItems}
      footerItems={footerMenuItems}
      isMobile={isMobile}
      mini={mini}
      onClose={() => setSidebarOpen(false)}
      onNavigate={closeMobileNav}
      currentVersion={shell.currentVersion}
      currentReleaseURL={shell.currentReleaseURL}
      versionHash={shell.versionInfo?.hash}
      openGroups={openSubMenus}
      onToggleGroup={(path) =>
        setOpenSubMenus((current) => toggleSingleSubMenu(current, path))
      }
    />
  );

  return (
    <Box
      data-admin-shell
      data-admin-nav-mini={mini ? "true" : "false"}
      onPointerOverCapture={(event) => shell.preloadAdminLink(event.target)}
      onFocusCapture={(event) => shell.preloadAdminLink(event.target)}
      onTouchStartCapture={(event) => shell.preloadAdminLink(event.target)}
      sx={{
        position: "relative",
        display: "flex",
        height: "var(--app-viewport-height, 100vh)",
        width: "100%",
        overflow: "hidden",
        overscrollBehavior: "none",
        bgcolor: "background.default",
      }}
    >
      <Drawer
        variant={isMobile ? "temporary" : "permanent"}
        open={isMobile ? sidebarOpen : true}
        onClose={() => setSidebarOpen(false)}
        ModalProps={{
          keepMounted: false,
          disableScrollLock: true,
          sx: {
            pointerEvents: isMobile && sidebarOpen ? "auto" : "none",
          },
        }}
        sx={{
          width: navWidth,
          flexShrink: 0,
          whiteSpace: mini ? "nowrap" : "normal",
          transition: (theme) =>
            theme.transitions.create("width", navMotion),
          "& .MuiBackdrop-root": {
            pointerEvents: isMobile && sidebarOpen ? "auto" : "none",
          },
          "& .MuiDrawer-paper": {
            width: navWidth,
            boxSizing: "border-box",
            overflowX: "hidden",
            overflowY: "hidden",
            whiteSpace: mini ? "nowrap" : "normal",
            zIndex: isMobile ? 50 : 12,
            pt: isMobile ? "var(--safe-area-top)" : 0,
            pb: isMobile ? "var(--safe-area-bottom)" : 0,
            pl: isMobile ? "var(--safe-area-left)" : 0,
            borderRight: "1px solid rgba(145, 158, 171, 0.2)",
            transition: (theme) =>
              theme.transitions.create("width", navMotion),
          },
        }}
      >
        {sidebar}
      </Drawer>
      {isMobile ? null : (
        <Box
          component="button"
          type="button"
          data-testid="admin-nav-toggle"
          aria-label={
            mini
              ? t("navigation.expand", "展开导航")
              : t("navigation.collapse", "收起导航")
          }
          onClick={toggleMiniNav}
          sx={{
            position: "absolute",
            top: 40,
            left: navWidth,
            zIndex: 1300,
            isolation: "isolate",
            width: 24,
            height: 24,
            ml: "-12px",
            border: "1px solid rgba(145, 158, 171, 0.24)",
            p: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "50%",
            bgcolor: "background.paper",
            color: "text.secondary",
            boxShadow: "0 0 2px 0 rgba(145, 158, 171, 0.32)",
            cursor: "pointer",
            transition: (theme) =>
              theme.transitions.create("left", navMotion),
            "&:hover": { color: "text.primary", bgcolor: "action.hover" },
          }}
        >
          {mini ? (
            <ChevronRight sx={{ fontSize: 14 }} />
          ) : (
            <ChevronLeft sx={{ fontSize: 14 }} />
          )}
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.default",
        }}
      >
        <AdminTopbar
          isMobile={isMobile}
          onOpenNav={() => setSidebarOpen(true)}
          updateAvailable={shell.updateAvailable && shell.releasesSince.length > 0}
          onOpenUpdate={() => shell.setUpdateDialogOpen(true)}
        />
        <Box
          ref={scrollRef}
          data-admin-scroll-container
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: isMobile && sidebarOpen ? "hidden" : "auto",
            overscrollBehaviorY: "contain",
            px: { xs: 1.5, md: 3 },
            pt: { xs: 2, md: 3 },
            pb: {
              xs: "max(16px, var(--safe-area-bottom))",
              md: 3,
            },
          }}
        >
          {!ishttps ? (
            <Alert
              data-admin-top-banner=""
              severity="warning"
              sx={{
                mb: 2.5,
                "& .MuiAlert-message": { overflowWrap: "anywhere" },
              }}
            >
              {t("warn_https")}
            </Alert>
          ) : null}
          <Box data-admin-page-content sx={{ minHeight: "100%" }}>
            {content}
          </Box>
        </Box>
      </Box>

      <UpdateReleaseDialog
        open={shell.updateDialogOpen}
        onClose={() => shell.setUpdateDialogOpen(false)}
        isMobile={isMobile}
        currentVersion={shell.currentVersion}
        versionInfo={shell.versionInfo}
        latestRelease={shell.latestRelease}
        releasesSince={shell.releasesSince}
        selfUpdate={shell.selfUpdate}
        updatePhase={shell.updatePhase}
        onUpdate={() => void shell.startSelfUpdate()}
      />
    </Box>
  );
}
