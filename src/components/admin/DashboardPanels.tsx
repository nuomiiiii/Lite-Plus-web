import { Callout, Skeleton } from "@/components/admin/ui";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import { alpha } from "@mui/material/styles";
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  BellRing,
  CheckCircle2,
  Clock3,
  Cpu,
  HardDrive,
  MemoryStick,
  Route,
  Timer,
  WifiOff,
  X,
} from "@/components/admin/muiIcons";
import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AdminPagination,
  useAdminPagination,
} from "@/components/admin/AdminPagination";
import { ChartContainer } from "@/components/ui/chart";
import {
  type DashboardAlertKind,
  type DashboardAlertSummary,
  type DashboardChartsData,
  type DashboardData,
  type DashboardDatabaseStatus,
  type DashboardResourceRankItem,
  SUMMARY_FOOTER_CLASS,
  syncSummaryFooters,
} from "@/utils/dashboard";
import {
  dashboardAlertCategoryPath,
  dashboardAlertDetailPath,
  formatBillingAlertStatus,
} from "@/utils/adminAlertFilters";
import { formatBytes } from "@/utils/unitHelper";
import {
  DASHBOARD_RANKING_ALL,
  rankingOrdered,
  rankingPeak,
  useDashboardRankingExpand,
  useRankingOrder,
  type RankingOrder,
} from "@/utils/dashboardRankingExpand";
import {
  getDashboardChartsSnapshot,
  getDashboardSnapshot,
  requestDashboard,
  requestDashboardCharts,
} from "@/utils/dashboardApi";

export {
  getDashboardChartsSnapshot,
  getDashboardSnapshot,
  requestDashboard,
  requestDashboardCharts,
};
export { BillingTrendPanel } from "@/components/admin/DashboardTraffic30d";

export function SummaryCardSkeleton() {
  return (
    <div className="h-[112px] km-admin-surface p-3">
      <Skeleton width="7rem" height="1rem" />
      <Skeleton className="mt-4" width="9rem" height="1.9rem" />
      <Skeleton className="mt-3" width="72%" height="0.85rem" />
    </div>
  );
}

export function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <SummaryCardSkeleton key={item} />
      ))}
    </div>
  );
}

export function SummaryPanel({
  icon,
  label,
  value,
  valueAside,
  children,
  tone = "accent",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueAside?: React.ReactNode;
  children: React.ReactNode;
  tone?: "accent" | "green" | "orange" | "muted";
}) {
  return (
    <section className="min-h-[112px] h-full km-admin-surface p-3 transition-[border-color] group-hover:border-[var(--accent-a7)]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <Box
          sx={(theme) => ({
            width: 32,
            height: 32,
            borderRadius: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor:
              tone === "accent"
                ? alpha(theme.palette.info.main, 0.08)
                : tone === "green"
                  ? alpha(theme.palette.success.main, 0.08)
                  : tone === "orange"
                    ? alpha(theme.palette.warning.main, 0.12)
                    : theme.palette.action.hover,
            color:
              tone === "accent"
                ? "info.main"
                : tone === "green"
                  ? "success.main"
                  : tone === "orange"
                    ? "warning.main"
                    : "text.secondary",
            "& .MuiSvgIcon-root": { fontSize: 18 },
          })}
        >
          {icon}
        </Box>
      </div>
      <div className="mt-2 flex min-w-0 items-baseline gap-1">
        <div className="min-w-0 text-2xl font-bold tabular-nums text-foreground">{value}</div>
        {valueAside ? (
          <span className="shrink-0 whitespace-nowrap text-sm font-medium text-muted-foreground">（{valueAside}）</span>
        ) : null}
      </div>
      <div className="mt-2 min-w-0 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

export function SummaryFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${SUMMARY_FOOTER_CLASS} flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

export function useSyncedSummaryFooters(
  rootRef: React.RefObject<HTMLElement | null>,
  refreshKey: string,
) {
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => syncSummaryFooters(root));
    };

    const observer = new ResizeObserver(run);
    const observeTargets = () => {
      observer.disconnect();
      observer.observe(root);
      for (const el of root.querySelectorAll(`.${SUMMARY_FOOTER_CLASS}`)) {
        observer.observe(el);
      }
    };

    observeTargets();
    run();
    const mutations = new MutationObserver((records) => {
      const footerChanged = records.some((record) => {
        const nodes = [...record.addedNodes, ...record.removedNodes];
        return nodes.some((node) => (
          node instanceof Element
          && (node.classList.contains(SUMMARY_FOOTER_CLASS) || node.querySelector(`.${SUMMARY_FOOTER_CLASS}`))
        ));
      });
      if (!footerChanged) return;
      observeTargets();
      run();
    });
    mutations.observe(root, { childList: true, subtree: true });
    window.addEventListener("resize", run);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", run);
    };
  }, [refreshKey, rootRef]);
}

function DashboardChip({
  children,
  tone = "accent",
  onExpand,
  onPrefetch,
}: {
  children: React.ReactNode;
  tone?: "accent" | "orange" | "red";
  onExpand?: () => void;
  onPrefetch?: () => void;
}) {
  const className = `km-dashboard-chip km-dashboard-chip--${tone}`;
  if (!onExpand) {
    return <span className={className}>{children}</span>;
  }
  return (
    <button
      type="button"
      className={className}
      onClick={onExpand}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      aria-haspopup="dialog"
    >
      {children}
    </button>
  );
}

function DashboardRankingDialog({
  open,
  onClose,
  title,
  description,
  trailing,
  order,
  onToggleOrder,
  loading,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  order?: RankingOrder;
  onToggleOrder?: () => void;
  loading?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const ascending = order === "asc";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      scroll="paper"
      slotProps={{
        paper: {
          sx: {
            width: "calc(100% - 32px)",
            maxWidth: 960,
            m: 2,
            maxHeight: "88vh",
            borderRadius: "8px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          px: { xs: 2, md: 2.5 },
          pt: 2,
          pb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
          <h2 className="min-w-0 text-base font-semibold text-foreground">{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {onToggleOrder ? (
              <button
                type="button"
                onClick={onToggleOrder}
                aria-pressed={ascending}
                title={t("admin_dashboard.ranking_order")}
                className="km-dashboard-chip km-dashboard-chip--muted"
              >
                {ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                {ascending
                  ? t("admin_dashboard.ranking_asc")
                  : t("admin_dashboard.ranking_desc")}
              </button>
            ) : null}
            {trailing}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-[var(--gray-a3)]"
            >
              <X size={16} />
            </button>
          </div>
        </Box>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </Box>
      <DialogContent sx={{ px: 0, pb: 0, pt: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <Box sx={{ px: { xs: 2, md: 2.5 }, pb: footer ? 1 : 2.5, minHeight: 0, overflow: "auto", flex: 1 }}>
          {loading ? <Skeleton className="h-[220px] w-full" /> : children}
        </Box>
        {footer}
      </DialogContent>
    </Dialog>
  );
}

function DashboardRankingPager({
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  if (total === 0) return null;
  return (
    <Box sx={{ flexShrink: 0, borderTop: "1px solid var(--gray-a5)" }}>
      <AdminPagination
        page={page}
        total={total}
        onPageChange={onPageChange}
        pageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        showSummary={false}
      />
    </Box>
  );
}

function PanelHeader({
  title,
  description,
  trailing,
  responsive = false,
}: {
  title: string;
  description?: string;
  trailing?: React.ReactNode;
  responsive?: boolean;
}) {
  return (
    <div className={`mb-3 flex items-start justify-between gap-3 ${responsive ? "@max-[28rem]:flex-col @max-[28rem]:gap-2" : ""}`}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {responsive && trailing ? <div className="@max-[28rem]:ml-auto">{trailing}</div> : trailing}
    </div>
  );
}

function DashboardRankingItemLink({ href, children }: { href?: string; children: React.ReactNode }) {
  const className = "block min-w-0 rounded px-1.5 py-0.5 text-inherit no-underline transition-colors hover:bg-[var(--gray-a2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-8)]";
  if (!href) return <div className={className}>{children}</div>;
  return (
    <a
      href={href}
      className={className}
    >
      {children}
    </a>
  );
}

function DashboardRankingGrid({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  const count = items.length;
  const twoCol = count >= 11;
  const rows = count <= 20 ? 10 : Math.ceil(count / 2);
  return (
    <div className="@container">
      <div
        className={twoCol
          ? "grid grid-cols-1 gap-y-2 @min-[34rem]:grid-cols-2 @min-[34rem]:gap-x-5 @min-[34rem]:[grid-auto-flow:column]"
          : "grid grid-cols-1 gap-y-2"}
        style={twoCol ? { gridTemplateRows: `repeat(${rows}, auto)` } : undefined}
      >
        {items}
      </div>
    </div>
  );
}

function DashboardRankingItem({
  index,
  name,
  value,
  valueClassName = "",
  progress,
  detail,
}: {
  index: number;
  name: string;
  value: React.ReactNode;
  valueClassName?: string;
  progress: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[3.5rem] min-w-0 grid-rows-[1rem_0.375rem_1rem] gap-y-1.5">
      <div className="flex min-w-0 items-center justify-between gap-3 text-xs leading-4">
        <span className="min-w-0 truncate text-foreground">
          <span className="mr-1 text-muted-foreground">{index + 1}.</span>
          <span className="font-medium">{name}</span>
        </span>
        <strong className={`shrink-0 font-semibold tabular-nums ${valueClassName}`}>{value}</strong>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--gray-a4)]">
        {progress}
      </div>
      <div className="flex min-w-0 items-center justify-end text-[11px] leading-4 text-muted-foreground">
        {detail ?? <span aria-hidden="true">&nbsp;</span>}
      </div>
    </div>
  );
}

function DatabaseStatusLine({ status }: { status: DashboardDatabaseStatus }) {
  const { t } = useTranslation();
  if (!status.error) return null;
  return (
    <Callout.Root color="red" size="1" className="mt-3">
      <Callout.Icon>
        <AlertCircle size={15} />
      </Callout.Icon>
      <Callout.Text>
        {t("admin_dashboard.database_read_failed")}: {status.error}
      </Callout.Text>
    </Callout.Root>
  );
}

function relativeTime(value: string | null, locale: string, fallback: string): string {
  if (!value) return fallback;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return fallback;
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

export function AlertOverviewPanel({
  data,
  locale,
}: {
  data: DashboardData;
  locale: string;
  accountKey?: string;
}) {
  const { t } = useTranslation();
  const items: Array<{
    kind: DashboardAlertKind;
    label: string;
    summary: DashboardAlertSummary;
    marker: string;
  }> = [
    { kind: "offline", label: t("admin_dashboard.alert_offline"), summary: data.alerts.offline, marker: "bg-[var(--red-9)]" },
    { kind: "resource", label: t("admin_dashboard.alert_resource"), summary: data.alerts.resource, marker: "bg-[var(--orange-9)]" },
    { kind: "latency_loss", label: t("admin_dashboard.alert_latency_loss"), summary: data.alerts.latency_loss, marker: "bg-[var(--orange-9)]" },
    { kind: "traffic", label: t("admin_dashboard.alert_traffic"), summary: data.alerts.traffic, marker: "bg-[var(--accent-9)]" },
    { kind: "return_route", label: t("admin_dashboard.alert_return_route"), summary: data.alerts.return_route, marker: "bg-[var(--orange-9)]" },
    { kind: "billing", label: t("admin_dashboard.alert_billing"), summary: data.alerts.billing, marker: "bg-[var(--gray-8)]" },
  ];
  const available = items.filter((item) => !item.summary.error);
  const current = available.reduce((total, item) => total + item.summary.current, 0);
  const affected = available.reduce((total, item) => total + item.summary.affected_nodes, 0);
  const recovered = available.reduce((total, item) => total + item.summary.recovered_today, 0);

  return (
    <section
      className="flex h-full min-w-0 flex-col km-admin-surface p-3"
      style={{ containerType: "inline-size" }}
    >
      <PanelHeader
        title={t("admin_dashboard.alerts_overview")}
        description={t("admin_dashboard.alerts_overview_hint")}
        trailing={<BellRing size={18} className="mt-0.5 text-muted-foreground" />}
      />
      <div className="grid grid-cols-3 divide-x pb-3">
        {[
          [t("admin_dashboard.current_alerts"), current, "text-[var(--red-11)]"],
          [t("admin_dashboard.affected_nodes"), affected, "text-[var(--orange-11)]"],
          [t("admin_dashboard.recovered_today"), recovered, "text-[var(--green-11)]"],
        ].map(([label, value, color], index) => (
          <div key={String(label)} className={index === 0 ? "pr-3" : "px-3"}>
            <div className={`text-xl font-semibold leading-none tabular-nums ${color}`}>{value}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="dashboard-alert-grid grid flex-1 auto-rows-fr">
        {items.map((item) => {
          const latest = item.summary.latest_alert;
          const categoryTo = dashboardAlertCategoryPath(item.kind);
          const detailTo = dashboardAlertDetailPath(item.kind, latest);
          const detailSummary = item.kind === "billing"
            ? formatBillingAlertStatus(latest?.due_at, locale)
            : item.kind === "offline"
              ? item.label
              : item.kind === "latency_loss"
                ? latest?.task_name || item.label
                : latest?.title || item.label;
          return (
            <div
              key={item.kind}
              className="flex min-h-16 min-w-0 flex-col justify-start gap-1.5 border-t border-[var(--gray-a5)] px-1 py-3"
            >
              <Link
                to={categoryTo}
                className="flex min-w-0 items-start justify-between gap-2 rounded-sm text-xs outline-none hover:text-[var(--accent-11)] focus-visible:ring-2 focus-visible:ring-[var(--accent-8)]"
              >
                <span className="flex min-w-0 items-start gap-1.5 font-medium">
                  <span className={`mt-1 size-1.5 shrink-0 rounded-full ${item.marker}`} />
                  <span className="break-words leading-4">{item.label}</span>
                </span>
                <strong className="shrink-0 font-semibold tabular-nums text-foreground">
                  {item.summary.error ? "-" : item.summary.current}
                </strong>
              </Link>
              {item.summary.error ? (
                <span className="break-words text-[11px] leading-4 text-[var(--red-11)]">
                  {t("admin_dashboard.not_available")}
                </span>
              ) : item.summary.current === 0 ? (
                <span className="flex items-center gap-1 text-[11px] leading-4 text-[var(--green-11)]">
                  <CheckCircle2 size={12} className="shrink-0" />
                  {t("admin_dashboard.alert_normal", "正常")}
                </span>
              ) : latest ? (
                <Link
                  to={detailTo}
                  className="min-w-0 break-words rounded-sm text-[11px] leading-4 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--accent-8)]"
                >
                  <span className="font-medium text-foreground">{latest.node_name || latest.task_name || item.label}</span>
                  {detailSummary ? <span> · {detailSummary}</span> : null}
                  {latest.occurred_at ? (
                    <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock3 size={10} />
                      {relativeTime(latest.occurred_at, locale, t("admin_dashboard.not_available"))}
                    </span>
                  ) : null}
                </Link>
              ) : (
                <Link
                  to={categoryTo}
                  className="break-words text-[11px] leading-4 text-muted-foreground hover:text-foreground"
                >
                  {t("admin_dashboard.affected_nodes", { count: item.summary.affected_nodes })}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function LatencyPanel({
  charts,
  locale,
  requestError,
  warningCount,
}: {
  charts: DashboardChartsData | null;
  locale: string;
  requestError?: string | null;
  warningCount: number;
}) {
  const { t } = useTranslation();
  const points = React.useMemo(
    () => (charts?.latency.points ?? []).map((point) => ({
      ...point,
      label: new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(point.time)),
    })),
    [charts?.latency.points, locale],
  );
  return (
    <section className="min-h-[148px] km-admin-surface p-3">
      <PanelHeader
        title={t("admin_dashboard.latency_overview")}
        description={t("admin_dashboard.latency_overview_hint")}
        trailing={(
          <span className="mt-0.5 flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-[var(--accent-9)]" />
              {t("admin_dashboard.average_latency")}
            </span>
          </span>
        )}
      />
      <div className="grid min-h-[78px] grid-cols-1 items-center gap-3 md:grid-cols-[17rem_minmax(0,1fr)]">
        <div className="grid grid-cols-3 divide-x">
          {[
            [charts ? `${charts.latency.average.toFixed(2)} ms` : "-", t("admin_dashboard.average_latency"), "text-foreground"],
            [charts?.latency.targets ?? "-", t("admin_dashboard.monitor_targets"), "text-[var(--accent-11)]"],
            [warningCount, t("admin_dashboard.packet_loss_alerts"), "text-[var(--orange-11)]"],
          ].map(([value, label, color], index) => (
            <div key={String(label)} className={index === 0 ? "pr-3" : "px-3"}>
              <div className={`text-xl font-semibold leading-none tabular-nums ${color}`}>{value}</div>
              <div className="mt-1.5 text-[11px] text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        {requestError || charts?.latency.error ? (
          <div className="flex h-[78px] items-center justify-center text-xs text-[var(--red-11)]">
            {t("admin_dashboard.data_unavailable")}
          </div>
        ) : charts ? (
          <ChartContainer
            config={{ average: { label: t("admin_dashboard.average_latency"), color: "var(--accent-9)" } }}
            className="h-[78px] w-full aspect-auto"
          >
            <LineChart data={points} margin={{ top: 3, right: 3, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={44} />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="mt-1 font-medium">{Number(payload[0]?.value ?? 0).toFixed(2)} ms</div>
                  </div>
                ) : null}
              />
              <Line type="monotone" dataKey="average" stroke="var(--color-average)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
            </LineChart>
          </ChartContainer>
        ) : (
          <Skeleton className="h-[78px] w-full" />
        )}
      </div>
    </section>
  );
}

export function ReturnRouteStatusPanel({ data, locale }: { data: DashboardData; locale: string }) {
  const { t } = useTranslation();
  const status = data.return_route;
  const total = Math.max(0, status.active ?? status.tasks ?? 0);
  const healthy = Math.min(total, Math.max(0, status.healthy));
  const switched = Math.min(total - healthy, Math.max(0, status.switched));
  const abnormal = Math.min(total - healthy - switched, Math.max(0, status.abnormal));
  const healthyEnd = total > 0 ? (healthy / total) * 360 : 0;
  const switchedEnd = total > 0 ? ((healthy + switched) / total) * 360 : 0;
  const abnormalEnd = total > 0 ? ((healthy + switched + abnormal) / total) * 360 : 0;
  const latest = status.latest_event;
  const latestName = [latest?.node_name, latest?.task_name].filter(Boolean).join(" · ");
  const blocked = Math.max(0, status.suspected_blocked ?? 0);
  const statusMessage = blocked > 0
    ? t("admin_dashboard.return_route_blocked_nodes", { count: blocked })
    : switched > 0
      ? t("admin_dashboard.return_route_changed_tasks", { count: switched })
      : abnormal > 0
        ? t("admin_dashboard.return_route_abnormal_tasks", { count: abnormal })
        : t("admin_dashboard.return_route_all_normal");

  return (
    <Link
      to="/admin/return-route"
      className="group block h-full rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-8)]"
    >
      <section className="h-full min-h-[286px] km-admin-surface p-3 transition-[border-color] group-hover:border-[var(--accent-a7)]">
        <PanelHeader
          title={t("admin_dashboard.return_route_status")}
          description={t("admin_dashboard.return_route_status_hint")}
          trailing={<Route size={18} className="mt-0.5 text-muted-foreground" />}
        />
        {total === 0 ? (
          <div className="flex min-h-[218px] items-center justify-center gap-5">
            <div className="size-28 shrink-0 rounded-full border-[10px] border-[var(--gray-a5)]" />
            <span className="max-w-44 text-sm leading-6 text-muted-foreground">
              {t("admin_dashboard.return_route_none")}
            </span>
          </div>
        ) : (
          <>
            <div className="text-center text-sm font-medium text-foreground sm:text-left">
              {statusMessage}
            </div>
            <div className="mt-3 grid grid-cols-1 items-center gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <div className="flex justify-center">
                <div
                  className="relative size-28 rounded-full"
                  style={{
                    background: `conic-gradient(var(--green-9) 0 ${healthyEnd}deg, var(--orange-9) ${healthyEnd}deg ${switchedEnd}deg, var(--red-9) ${switchedEnd}deg ${abnormalEnd}deg, var(--gray-a5) ${abnormalEnd}deg 360deg)`,
                  }}
                >
                  <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-[var(--color-panel-solid)]">
                    <span className="text-xl font-semibold tabular-nums">{healthy} / {total}</span>
                    <span className="mt-0.5 text-xs text-muted-foreground">{t("admin_dashboard.return_route_healthy")}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2.5 text-sm sm:grid-cols-1">
                {[
                  [t("admin_dashboard.return_route_normal"), healthy, "bg-[var(--green-9)]"],
                  [t("admin_dashboard.return_route_changed"), switched, "bg-[var(--orange-9)]"],
                  [t("admin_dashboard.return_route_abnormal"), abnormal, "bg-[var(--red-9)]"],
                  [t("admin_dashboard.return_route_blocked"), blocked, "bg-[var(--red-11)]"],
                  [t("admin_dashboard.return_route_recent_events"), status.recent_events, "bg-[var(--gray-8)]"],
                ].map(([label, value, marker]) => (
                  <div key={String(label)} className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <span className={`size-1.5 shrink-0 rounded-full ${marker}`} />
                      <span className="truncate">{label}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            {latest ? (
              <div className="mt-5 flex items-end justify-between gap-3 border-t pt-3 text-xs">
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">
                    {t("admin_dashboard.return_route_latest_change")}{latestName ? ` · ${latestName}` : ""}
                  </div>
                  <div className="mt-1 truncate leading-5 text-muted-foreground">
                    {t("admin_dashboard.return_route_expected")} {latest.expected_line || t("admin_dashboard.not_available")}
                    {" · "}
                    {t("admin_dashboard.return_route_current")} {latest.to_line || t("admin_dashboard.not_available")}
                  </div>
                </div>
                <span className="flex h-5 shrink-0 items-center gap-1 leading-5 text-muted-foreground">
                  <Clock3 size={14} />
                  {relativeTime(latest.occurred_at, locale, t("admin_dashboard.not_available"))}
                </span>
              </div>
            ) : null}
          </>
        )}
      </section>
    </Link>
  );
}

export function StoragePanel({ data, locale }: { data: DashboardData; locale: string }) {
  const { t } = useTranslation();
  const storageTotal = data.storage.database_files + data.storage.wal + data.storage.shm;
  const storageParts = [
    {
      label: t("admin_dashboard.database_files"),
      value: data.storage.database_files,
      barClass: "bg-[var(--accent-9)]",
      labelClass: "font-medium text-foreground",
    },
    {
      label: "WAL",
      value: data.storage.wal,
      barClass: "bg-[var(--orange-9)]",
      labelClass: "text-muted-foreground",
    },
    {
      label: "SHM",
      value: data.storage.shm,
      barClass: "bg-[var(--gray-9)]",
      labelClass: "text-muted-foreground",
    },
  ];

  return (
    <section className="h-full km-admin-surface p-3">
      <PanelHeader
        title={t("admin_dashboard.database_usage")}
        trailing={<span className="text-sm font-semibold tabular-nums text-foreground">{formatBytes(storageTotal)}</span>}
      />
      <div className="space-y-2 text-xs">
        <div className="space-y-2">
          {storageParts.map((part) => {
            const share = storageTotal > 0 ? (part.value / storageTotal) * 100 : 0;
            return (
              <div
                key={part.label}
                className="grid grid-cols-[minmax(4.5rem,auto)_minmax(2.5rem,1fr)_5.5rem] items-center gap-2"
              >
                <span className={part.labelClass}>{part.label}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--gray-a4)]">
                  <div
                    className={`h-full rounded-full ${part.barClass}`}
                    style={{ width: `${share}%` }}
                  />
                </div>
                <span className="text-right tabular-nums text-muted-foreground">
                  {formatBytes(part.value)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t pt-2">
          <div className="min-w-0">
            <span>{t("admin_dashboard.retention_period")}</span>
            <div className="mt-0.5 truncate tabular-nums text-muted-foreground">
              {data.storage.retention_days > 0
                ? t("admin_dashboard.days", { count: data.storage.retention_days })
                : t("admin_dashboard.not_available")}
            </div>
          </div>
          <div className="min-w-0 text-right">
            <span>{t("admin_dashboard.last_compaction")}</span>
            <div className="mt-0.5 truncate tabular-nums text-muted-foreground">
              {relativeTime(data.storage.last_compacted_at, locale, t("admin_dashboard.not_available"))}
            </div>
          </div>
        </div>
      </div>
      <DatabaseStatusLine status={data.database.main} />
      <DatabaseStatusLine status={data.database.monitoring} />
    </section>
  );
}

export function ResourceRankingPanel({
  data,
  limit,
  accountKey = "authenticated",
  allowPrefetch = true,
}: {
  data: DashboardData;
  limit: number;
  accountKey?: string;
  allowPrefetch?: boolean;
}) {
  const { t } = useTranslation();
  const loadAll = React.useCallback(
    () => requestDashboard(["resources"], DASHBOARD_RANKING_ALL, accountKey),
    [accountKey],
  );
  const expand = useDashboardRankingExpand(loadAll, { allowPrefetch });
  const { order, toggleOrder } = useRankingOrder(expand.open);
  const groups = resourceRankingGroups(t, data);
  const allGroups = expand.data ? resourceRankingGroups(t, expand.data) : groups;
  const orderedGroups = allGroups.map((group) => ({
    ...group,
    items: rankingOrdered(group.items, order),
  }));
  const rankCount = Math.max(0, ...orderedGroups.map((group) => group.items.length));
  const rankSlots = React.useMemo(
    () => Array.from({ length: rankCount }, (_, index) => index),
    [rankCount],
  );
  const paging = useAdminPagination(rankSlots);
  const dialogGroups = orderedGroups.map((group) => ({
    ...group,
    items: group.items.slice(paging.pageStart, paging.pageStart + paging.pageSize),
  }));

  return (
    <section className="km-admin-surface p-3">
      <PanelHeader
        title={t("admin_dashboard.resource_ranking")}
        description={t("admin_dashboard.resource_ranking_hint")}
        trailing={(
          <DashboardChip onExpand={expand.openDialog} onPrefetch={expand.prefetch}>
            Top {limit}
          </DashboardChip>
        )}
      />
      <ResourceRankingBody groups={groups} />
      <DashboardRankingDialog
        open={expand.open}
        onClose={expand.closeDialog}
        title={t("admin_dashboard.resource_ranking")}
        description={t("admin_dashboard.resource_ranking_hint")}
        trailing={<DashboardChip>{t("admin_dashboard.ranking_all")}</DashboardChip>}
        order={order}
        onToggleOrder={toggleOrder}
        loading={expand.loading && !expand.data}
        footer={(
          <DashboardRankingPager
            page={paging.page}
            total={rankCount}
            pageSize={paging.pageSize}
            onPageChange={paging.setPage}
            onPageSizeChange={paging.setPageSize}
          />
        )}
      >
        {expand.error ? (
          <div className="flex min-h-44 items-center justify-center text-sm text-[var(--red-11)]">
            {t("admin_dashboard.data_unavailable")}
          </div>
        ) : (
          <ResourceRankingBody groups={dialogGroups} indexOffset={paging.pageStart} />
        )}
      </DashboardRankingDialog>
    </section>
  );
}

function resourceRankingGroups(
  t: (key: string) => string,
  data: DashboardData,
): Array<{
  key: "cpu" | "memory" | "disk";
  label: string;
  icon: React.ReactNode;
  items: DashboardResourceRankItem[];
  color: string;
}> {
  return [
    {
      key: "cpu",
      label: t("admin_dashboard.top_cpu"),
      icon: <Cpu size={16} />,
      items: data.resources?.cpu ?? [],
      color: "bg-[var(--accent-9)]",
    },
    {
      key: "memory",
      label: t("admin_dashboard.top_memory"),
      icon: <MemoryStick size={16} />,
      items: data.resources?.memory ?? [],
      color: "bg-[var(--green-9)]",
    },
    {
      key: "disk",
      label: t("admin_dashboard.top_disk"),
      icon: <HardDrive size={16} />,
      items: data.resources?.disk ?? [],
      color: "bg-[var(--orange-9)]",
    },
  ];
}

function ResourceRankingBody({
  groups,
  indexOffset = 0,
}: {
  groups: ReturnType<typeof resourceRankingGroups>;
  indexOffset?: number;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="grid gap-5"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))" }}
    >
      {groups.map((group) => (
        <div key={group.key} className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="text-[var(--accent-11)]">{group.icon}</span>
            {group.label}
          </div>
          {group.items.length === 0 ? (
            <div className="flex min-h-28 items-center justify-center text-xs text-muted-foreground">
              {t("admin_dashboard.no_live_resource_data")}
            </div>
          ) : (
            <div className="space-y-2.5">
              {group.items.map((item, index) => {
                const value = Math.max(0, Math.min(100, item[group.key]));
                return (
                  <DashboardRankingItemLink key={item.uuid} href={item.detail_url}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-foreground">
                        <span className="mr-1 text-muted-foreground">{indexOffset + index + 1}.</span>
                        {item.name}
                      </span>
                      <strong className="shrink-0 font-semibold tabular-nums">{value.toFixed(1)}%</strong>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--gray-a4)]">
                      <div className={`h-full rounded-full ${group.color}`} style={{ width: `${value}%` }} />
                    </div>
                  </DashboardRankingItemLink>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function TrafficTrendPanel({
  charts,
  error,
  axisWidth,
}: {
  charts: DashboardChartsData | null;
  error: string | null;
  axisWidth: number;
}) {
  const { t } = useTranslation();
  return (
    <section className="@container flex h-full min-w-0 flex-col km-admin-surface p-3">
      <PanelHeader
        title={t("admin_dashboard.today_traffic")}
        description={t("admin_dashboard.hourly_traffic_hint")}
        responsive
        trailing={(
          <div className="mt-0.5 flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[var(--accent-9)]" />{t("admin_dashboard.upload")}</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[var(--orange-9)]" />{t("admin_dashboard.download")}</span>
          </div>
        )}
      />
      {error || charts?.traffic.error ? (
        <div className="flex min-h-[220px] flex-1 items-center justify-center text-sm text-[var(--red-11)]">
          {t("admin_dashboard.data_unavailable")}
        </div>
      ) : charts ? (
        <ChartContainer
          config={{
            up: { label: t("admin_dashboard.upload"), color: "var(--accent-9)" },
            down: { label: t("admin_dashboard.download"), color: "var(--orange-9)" },
          }}
          className="min-h-[220px] w-full flex-1 aspect-auto"
        >
          <LineChart data={charts.traffic.hourly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="hour" tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tickLine={false} axisLine={false} width={axisWidth} tickFormatter={(value) => formatBytes(Number(value)).replace(" ", "")} />
            <Tooltip
              content={({ active, payload, label }) => active && payload?.length ? (
                <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                  <div className="mb-1.5 text-muted-foreground">{label}</div>
                  <div className="font-medium text-[var(--accent-11)]">{t("admin_dashboard.upload")}: {formatBytes(Number(payload[0]?.value ?? 0))}</div>
                  <div className="mt-1 font-medium text-[var(--orange-11)]">{t("admin_dashboard.download")}: {formatBytes(Number(payload[1]?.value ?? 0))}</div>
                </div>
              ) : null}
            />
            <Line type="monotone" dataKey="up" stroke="var(--color-up)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="down" stroke="var(--color-down)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
      ) : <Skeleton className="min-h-[220px] w-full flex-1" />}
    </section>
  );
}

export function DailyTrafficRankingPanel({
  charts,
  error,
  limit,
  accountKey = "authenticated",
  allowPrefetch = true,
}: {
  charts: DashboardChartsData | null;
  error: string | null;
  limit: number;
  accountKey?: string;
  allowPrefetch?: boolean;
}) {
  const { t } = useTranslation();
  const loadAll = React.useCallback(
    () => requestDashboardCharts(["traffic"], DASHBOARD_RANKING_ALL, accountKey),
    [accountKey],
  );
  const expand = useDashboardRankingExpand(loadAll, { allowPrefetch });
  const { order, toggleOrder } = useRankingOrder(expand.open);
  const items = charts?.traffic.ranking ?? [];
  const allItems = expand.data?.traffic.ranking ?? items;
  const orderedItems = rankingOrdered(allItems, order);
  const paging = useAdminPagination(orderedItems);
  const trafficPeak = rankingPeak(allItems.map((item) => item.billable));
  return (
    <section className="h-full min-w-0 km-admin-surface p-3">
      <PanelHeader
        title={t("admin_dashboard.daily_traffic_ranking")}
        description={t("admin_dashboard.daily_traffic_ranking_hint")}
        trailing={(
          <DashboardChip onExpand={expand.openDialog} onPrefetch={expand.prefetch}>
            <ArrowUpDown size={13} /> Top {limit}
          </DashboardChip>
        )}
      />
      <DailyTrafficRankingBody charts={charts} error={error} items={items} />
      <DashboardRankingDialog
        open={expand.open}
        onClose={expand.closeDialog}
        title={t("admin_dashboard.daily_traffic_ranking")}
        description={t("admin_dashboard.daily_traffic_ranking_hint")}
        trailing={<DashboardChip><ArrowUpDown size={13} /> {t("admin_dashboard.ranking_all")}</DashboardChip>}
        order={order}
        onToggleOrder={toggleOrder}
        loading={expand.loading && !expand.data}
        footer={(
          <DashboardRankingPager
            page={paging.page}
            total={orderedItems.length}
            pageSize={paging.pageSize}
            onPageChange={paging.setPage}
            onPageSizeChange={paging.setPageSize}
          />
        )}
      >
        <DailyTrafficRankingBody
          charts={expand.data}
          error={expand.error}
          items={paging.pageItems}
          indexOffset={paging.pageStart}
          peak={trafficPeak}
        />
      </DashboardRankingDialog>
    </section>
  );
}

function DailyTrafficRankingBody({
  charts,
  error,
  items,
  indexOffset = 0,
  peak,
}: {
  charts: DashboardChartsData | null;
  error: string | null;
  items: NonNullable<DashboardChartsData["traffic"]["ranking"]>;
  indexOffset?: number;
  peak?: number;
}) {
  const { t } = useTranslation();
  const maximum = peak ?? items[0]?.billable ?? 0;
  if (error || charts?.traffic.error) {
    return (
      <div className="flex min-h-44 items-center justify-center text-sm text-[var(--red-11)]">
        {t("admin_dashboard.data_unavailable")}
      </div>
    );
  }
  if (!charts) {
    return <Skeleton className="h-[220px] w-full" />;
  }
  if (items.length === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center text-sm text-muted-foreground">
        {t("admin_dashboard.no_daily_traffic_data")}
      </div>
    );
  }
  return (
    <DashboardRankingGrid>
      {items.map((item, index) => (
        <DashboardRankingItemLink key={item.uuid} href={item.detail_url}>
          <DashboardRankingItem
            index={indexOffset + index}
            name={item.name}
            value={formatBytes(item.billable)}
            progress={(
              <div
                className="flex h-full overflow-hidden rounded-full"
                style={{ width: `${maximum > 0 ? (item.billable / maximum) * 100 : 0}%` }}
              >
                <span
                  className="h-full bg-[var(--orange-9)]"
                  style={{ width: `${item.up + item.down > 0 ? (item.up / (item.up + item.down)) * 100 : 0}%` }}
                />
                <span
                  className="h-full bg-[var(--blue-9)]"
                  style={{ width: `${item.up + item.down > 0 ? (item.down / (item.up + item.down)) * 100 : 0}%` }}
                />
              </div>
            )}
            detail={(
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-y-1">
                <span className="inline-flex items-center gap-1.5 pr-2">
                  <span className="size-1.5 rounded-full bg-[var(--orange-9)]" />
                  {t("admin_dashboard.upload")} {formatBytes(item.up)}
                </span>
                <span className="inline-flex items-center gap-1.5 border-l border-[var(--gray-a6)] pl-2">
                  <span className="size-1.5 rounded-full bg-[var(--blue-9)]" />
                  {t("admin_dashboard.download")} {formatBytes(item.down)}
                </span>
              </div>
            )}
          />
        </DashboardRankingItemLink>
      ))}
    </DashboardRankingGrid>
  );
}

export function LatencyRankingPanel({
  charts,
  error,
  limit,
  accountKey = "authenticated",
  allowPrefetch = true,
}: {
  charts: DashboardChartsData | null;
  error: string | null;
  limit: number;
  accountKey?: string;
  allowPrefetch?: boolean;
}) {
  const { t } = useTranslation();
  const loadAll = React.useCallback(
    () => requestDashboardCharts(["latency"], DASHBOARD_RANKING_ALL, accountKey),
    [accountKey],
  );
  const expand = useDashboardRankingExpand(loadAll, { allowPrefetch });
  const { order, toggleOrder } = useRankingOrder(expand.open);
  const items = charts?.latency.ranking ?? [];
  const allItems = expand.data?.latency.ranking ?? items;
  const orderedItems = rankingOrdered(allItems, order);
  const paging = useAdminPagination(orderedItems);
  const latencyPeak = rankingPeak(allItems.map((item) => item.average));
  return (
    <section className="h-full min-w-0 km-admin-surface p-3">
      <PanelHeader
        title={t("admin_dashboard.latency_ranking")}
        description={t("admin_dashboard.latency_ranking_hint")}
        trailing={(
          <DashboardChip tone="orange" onExpand={expand.openDialog} onPrefetch={expand.prefetch}>
            <Timer size={13} /> Top {limit}
          </DashboardChip>
        )}
      />
      <LatencyRankingBody charts={charts} error={error} items={items} />
      <DashboardRankingDialog
        open={expand.open}
        onClose={expand.closeDialog}
        title={t("admin_dashboard.latency_ranking")}
        description={t("admin_dashboard.latency_ranking_hint")}
        trailing={<DashboardChip tone="orange"><Timer size={13} /> {t("admin_dashboard.ranking_all")}</DashboardChip>}
        order={order}
        onToggleOrder={toggleOrder}
        loading={expand.loading && !expand.data}
        footer={(
          <DashboardRankingPager
            page={paging.page}
            total={orderedItems.length}
            pageSize={paging.pageSize}
            onPageChange={paging.setPage}
            onPageSizeChange={paging.setPageSize}
          />
        )}
      >
        <LatencyRankingBody
          charts={expand.data}
          error={expand.error || expand.data?.latency.error || null}
          items={paging.pageItems}
          indexOffset={paging.pageStart}
          peak={latencyPeak}
        />
      </DashboardRankingDialog>
    </section>
  );
}

function LatencyRankingBody({
  charts,
  error,
  items,
  indexOffset = 0,
  peak,
}: {
  charts: DashboardChartsData | null;
  error: string | null;
  items: NonNullable<DashboardChartsData["latency"]["ranking"]>;
  indexOffset?: number;
  peak?: number;
}) {
  const { t } = useTranslation();
  const maximum = peak ?? items[0]?.average ?? 0;
  if (error || charts?.latency.error) {
    return (
      <div className="flex min-h-44 items-center justify-center text-sm text-[var(--red-11)]">
        {t("admin_dashboard.data_unavailable")}
      </div>
    );
  }
  if (!charts) {
    return <Skeleton className="h-[220px] w-full" />;
  }
  if (items.length === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center text-sm text-muted-foreground">
        {t("admin_dashboard.no_latency_ranking_data")}
      </div>
    );
  }
  return (
    <DashboardRankingGrid>
      {items.map((item, index) => (
        <DashboardRankingItemLink key={`${item.uuid}:${item.task_id ?? 0}`} href={item.detail_url}>
          <DashboardRankingItem
            index={indexOffset + index}
            name={item.name}
            value={`${item.average.toFixed(2)} ms`}
            progress={(
              <div
                className="h-full rounded-full bg-[var(--orange-9)]"
                style={{ width: `${maximum > 0 ? (item.average / maximum) * 100 : 0}%` }}
              />
            )}
            detail={(
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="min-w-0 truncate">{item.task_name}</span>
              </div>
            )}
          />
        </DashboardRankingItemLink>
      ))}
    </DashboardRankingGrid>
  );
}

export function LatencyJitterRankingPanel({
  charts,
  error,
  limit,
  accountKey = "authenticated",
  allowPrefetch = true,
}: {
  charts: DashboardChartsData | null;
  error: string | null;
  limit: number;
  accountKey?: string;
  allowPrefetch?: boolean;
}) {
  const { t } = useTranslation();
  const loadAll = React.useCallback(
    () => requestDashboardCharts(["latency_jitter"], DASHBOARD_RANKING_ALL, accountKey),
    [accountKey],
  );
  const expand = useDashboardRankingExpand(loadAll, { allowPrefetch });
  const { order, toggleOrder } = useRankingOrder(expand.open);
  const items = charts?.latency.jitter_ranking ?? [];
  const allItems = expand.data?.latency.jitter_ranking ?? items;
  const orderedItems = rankingOrdered(allItems, order);
  const paging = useAdminPagination(orderedItems);
  const jitterPeak = rankingPeak(allItems.map((item) => Math.abs(item.delta)));
  return (
    <section className="h-full min-w-0 km-admin-surface p-3">
      <PanelHeader
        title={t("admin_dashboard.latency_jitter_ranking")}
        description={t("admin_dashboard.latency_jitter_ranking_hint")}
        trailing={(
          <DashboardChip tone="orange" onExpand={expand.openDialog} onPrefetch={expand.prefetch}>
            <Activity size={13} /> Top {limit}
          </DashboardChip>
        )}
      />
      <LatencyJitterRankingBody charts={charts} error={error} items={items} />
      <DashboardRankingDialog
        open={expand.open}
        onClose={expand.closeDialog}
        title={t("admin_dashboard.latency_jitter_ranking")}
        description={t("admin_dashboard.latency_jitter_ranking_hint")}
        trailing={<DashboardChip tone="orange"><Activity size={13} /> {t("admin_dashboard.ranking_all")}</DashboardChip>}
        order={order}
        onToggleOrder={toggleOrder}
        loading={expand.loading && !expand.data}
        footer={(
          <DashboardRankingPager
            page={paging.page}
            total={orderedItems.length}
            pageSize={paging.pageSize}
            onPageChange={paging.setPage}
            onPageSizeChange={paging.setPageSize}
          />
        )}
      >
        <LatencyJitterRankingBody
          charts={expand.data}
          error={expand.error || expand.data?.latency.jitter_error || null}
          items={paging.pageItems}
          indexOffset={paging.pageStart}
          peak={jitterPeak}
        />
      </DashboardRankingDialog>
    </section>
  );
}

function LatencyJitterRankingBody({
  charts,
  error,
  items,
  indexOffset = 0,
  peak,
}: {
  charts: DashboardChartsData | null;
  error: string | null;
  items: NonNullable<DashboardChartsData["latency"]["jitter_ranking"]>;
  indexOffset?: number;
  peak?: number;
}) {
  const { t } = useTranslation();
  const maximum = peak ?? Math.max(0, ...items.map((item) => Math.abs(item.delta)));
  if (error || charts?.latency.jitter_error) {
    return (
      <div className="flex min-h-44 items-center justify-center text-sm text-[var(--red-11)]">
        {t("admin_dashboard.data_unavailable")}
      </div>
    );
  }
  if (!charts) {
    return <Skeleton className="h-[220px] w-full" />;
  }
  if (items.length === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center text-sm text-muted-foreground">
        {t("admin_dashboard.no_latency_jitter_data")}
      </div>
    );
  }
  return (
    <DashboardRankingGrid>
      {items.map((item, index) => {
        const increased = item.delta > 0;
        return (
          <DashboardRankingItemLink
            key={`${item.uuid}:${item.task_id ?? 0}`}
            href={item.detail_url}
          >
            <DashboardRankingItem
              index={indexOffset + index}
              name={item.name}
              value={`${item.delta > 0 ? "+" : ""}${item.delta.toFixed(2)} ms`}
              valueClassName={increased ? "text-[var(--orange-11)]" : item.delta < 0 ? "text-[var(--green-11)]" : ""}
              progress={(
                <div
                  className={`h-full rounded-full ${increased ? "bg-[var(--orange-9)]" : "bg-[var(--green-9)]"}`}
                  style={{ width: `${maximum > 0 ? (Math.abs(item.delta) / maximum) * 100 : 0}%` }}
                />
              )}
              detail={(
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{item.task_name}</span>
                  <span className="flex shrink-0 items-center justify-end gap-1 tabular-nums">
                    <span>{t("admin_dashboard.previous_minute")} {item.previous.toFixed(2)} ms</span>
                    <ArrowRight size={11} aria-hidden="true" />
                    <span>{t("admin_dashboard.current_minute")} {item.current.toFixed(2)} ms</span>
                  </span>
                </div>
              )}
            />
          </DashboardRankingItemLink>
        );
      })}
    </DashboardRankingGrid>
  );
}

export function PacketLossRankingPanel({
  charts,
  error,
  limit,
  accountKey = "authenticated",
  allowPrefetch = true,
}: {
  charts: DashboardChartsData | null;
  error: string | null;
  limit: number;
  accountKey?: string;
  allowPrefetch?: boolean;
}) {
  const { t } = useTranslation();
  const loadAll = React.useCallback(
    () => requestDashboardCharts(["packet_loss"], DASHBOARD_RANKING_ALL, accountKey),
    [accountKey],
  );
  const expand = useDashboardRankingExpand(loadAll, { allowPrefetch });
  const { order, toggleOrder } = useRankingOrder(expand.open);
  const items = charts?.packet_loss?.ranking ?? [];
  const allItems = expand.data?.packet_loss?.ranking ?? items;
  const orderedItems = rankingOrdered(allItems, order);
  const paging = useAdminPagination(orderedItems);
  const packetLossPeak = rankingPeak(allItems.map((item) => item.loss_rate));
  return (
    <section className="h-full min-w-0 km-admin-surface p-3">
      <PanelHeader
        title={t("admin_dashboard.packet_loss_ranking")}
        description={t("admin_dashboard.packet_loss_ranking_hint")}
        trailing={(
          <DashboardChip tone="red" onExpand={expand.openDialog} onPrefetch={expand.prefetch}>
            <WifiOff size={13} /> Top {limit}
          </DashboardChip>
        )}
      />
      <PacketLossRankingBody charts={charts} error={error} items={items} />
      <DashboardRankingDialog
        open={expand.open}
        onClose={expand.closeDialog}
        title={t("admin_dashboard.packet_loss_ranking")}
        description={t("admin_dashboard.packet_loss_ranking_hint")}
        trailing={<DashboardChip tone="red"><WifiOff size={13} /> {t("admin_dashboard.ranking_all")}</DashboardChip>}
        order={order}
        onToggleOrder={toggleOrder}
        loading={expand.loading && !expand.data}
        footer={(
          <DashboardRankingPager
            page={paging.page}
            total={orderedItems.length}
            pageSize={paging.pageSize}
            onPageChange={paging.setPage}
            onPageSizeChange={paging.setPageSize}
          />
        )}
      >
        <PacketLossRankingBody
          charts={expand.data}
          error={expand.error || expand.data?.packet_loss?.error || null}
          items={paging.pageItems}
          indexOffset={paging.pageStart}
          peak={packetLossPeak}
        />
      </DashboardRankingDialog>
    </section>
  );
}

function PacketLossRankingBody({
  charts,
  error,
  items,
  indexOffset = 0,
  peak,
}: {
  charts: DashboardChartsData | null;
  error: string | null;
  items: NonNullable<NonNullable<DashboardChartsData["packet_loss"]>["ranking"]>;
  indexOffset?: number;
  peak?: number;
}) {
  const { t } = useTranslation();
  const maximum = peak ?? items[0]?.loss_rate ?? 0;
  if (error || charts?.packet_loss?.error) {
    return (
      <div className="flex min-h-44 items-center justify-center text-sm text-[var(--red-11)]">
        {t("admin_dashboard.data_unavailable")}
      </div>
    );
  }
  if (!charts) {
    return <Skeleton className="h-[220px] w-full" />;
  }
  if (items.length === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center gap-2 text-sm font-medium text-[var(--green-11)]">
        <CheckCircle2 className="shrink-0" size={18} aria-hidden="true" />
        {t("admin_dashboard.packet_loss_all_normal")}
      </div>
    );
  }
  return (
    <DashboardRankingGrid>
      {items.map((item, index) => {
        const tone = item.loss_rate >= 50
          ? "bg-[var(--red-9)]"
          : item.loss_rate >= 10
            ? "bg-[var(--orange-9)]"
            : "bg-[var(--accent-9)]";
        const textTone = item.loss_rate >= 50
          ? "text-[var(--red-11)]"
          : item.loss_rate >= 10
            ? "text-[var(--orange-11)]"
            : "text-[var(--accent-11)]";
        return (
          <DashboardRankingItemLink key={`${item.uuid}:${item.task_id}`} href={item.detail_url}>
            <DashboardRankingItem
              index={indexOffset + index}
              name={item.name}
              value={`${item.loss_rate.toFixed(1)}%`}
              valueClassName={textTone}
              progress={(
                <div
                  className={`h-full rounded-full ${tone}`}
                  style={{ width: `${maximum > 0 ? (item.loss_rate / maximum) * 100 : 0}%` }}
                />
              )}
              detail={(
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{item.task_name}</span>
                  <span className="shrink-0 tabular-nums">
                    {t("admin_dashboard.packet_loss_samples", { lost: item.lost, total: item.total })}
                  </span>
                </div>
              )}
            />
          </DashboardRankingItemLink>
        );
      })}
    </DashboardRankingGrid>
  );
}
