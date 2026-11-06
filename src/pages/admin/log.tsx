import React from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  AppDialogContent, Badge, Button, Dialog, Flex } from "@/components/admin/ui";
import { useTranslation } from "react-i18next";
import Loading from "@/components/loading";
import AdminPageTitle from "@/components/admin/AdminPageTitle";
import {
  AdminPagination,
} from "@/components/admin/AdminPagination";
import { useAdminDefaultPageSize } from "@/hooks/useAdminDefaultPageSize";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import AdminMultiSelect from "@/components/admin/AdminMultiSelect";
import { AdminActiveFilters } from "@/components/admin/AdminActiveFilters";
import {
  AdminListFiltersBar,
  AdminListSearch,
  AdminListShell,
} from "@/components/admin/AdminListShell";
import { formatAuditMessage } from "@/pages/admin/auditLogMessage";
import { useNodeDetails } from "@/contexts/NodeDetailsContext";

interface Log {
  id: number;
  ip: string;
  uuid: string;
  message: string;
  msg_type: string;
  time: string;
}

interface LogFilterOption {
  value: string;
  count: number;
}

function formatLogTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function logDayKey(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const date = String(parsed.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function formatLogDay(day: string) {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Date(year, month - 1, date).toLocaleDateString();
}

function optionsFromLogs(
  logs: Log[],
  keyOf: (log: Log) => string,
): LogFilterOption[] {
  const counts = new Map<string, number>();
  for (const log of logs) {
    const key = keyOf(log).trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count }));
}

function logTypeColor(value: string) {
  if (value === "error") return "red";
  if (value === "warn") return "yellow";
  if (value === "info") return "green";
  if (value === "terminal") return "blue";
  if (value === "nodemgt") return "blue";
  return "gray";
}

function LogTypeBadge({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <Badge className="self-start" color={logTypeColor(value)} variant="soft">
      {t(`logs.types.${value}`, { defaultValue: value })}
    </Badge>
  );
}

function useFormatAuditMessage() {
  const { t } = useTranslation();
  const { nodeDetail } = useNodeDetails();
  const names = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const node of nodeDetail) {
      const name = String(node.name || "").trim();
      if (node.uuid && name) map.set(node.uuid, name);
    }
    return map;
  }, [nodeDetail]);
  return React.useCallback(
    (message: string) =>
      formatAuditMessage(message, t, {
        nodeName: (uuid) => names.get(uuid) || uuid,
      }),
    [names, t],
  );
}

function LogMessageCell({
  message,
  formatMessage,
}: {
  message: string;
  formatMessage: (message: string) => string;
}) {
  const text = formatMessage(message);
  return (
    <Tooltip
      title={text}
      placement="top-start"
      enterDelay={300}
      slotProps={{
        tooltip: {
          sx: {
            maxWidth: 480,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 13,
            lineHeight: 1.5,
          },
        },
      }}
    >
      <Box component="span" className="admin-cell-clip km-log-message">
        {text}
      </Box>
    </Tooltip>
  );
}

const LogPage = () => {
  const formatMessage = useFormatAuditMessage();
  const defaultPageSize = useAdminDefaultPageSize();
  const [loading, setLoading] = React.useState<boolean>(true);
  const [logs, setLogs] = React.useState<Log[]>([]);
  const [typeOptions, setTypeOptions] = React.useState<LogFilterOption[]>([]);
  const [dayOptions, setDayOptions] = React.useState<LogFilterOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState<number>(1);
  const [total, setTotal] = React.useState<number>(0);
  const [limit, setLimit] = React.useState<number>(defaultPageSize);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [typeFilters, setTypeFilters] = React.useState<string[]>([]);
  const [dayFilters, setDayFilters] = React.useState<string[]>([]);
  const limitCustomized = React.useRef(false);
  const [t] = useTranslation();

  React.useEffect(() => {
    if (limitCustomized.current) return;
    setLimit(defaultPageSize);
    setPage(1);
  }, [defaultPageSize]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      setSearch((current) => {
        if (current === next) return current;
        setPage(1);
        return next;
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  React.useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(limit),
          page: String(page),
        });
        if (search) params.set("q", search);
        if (typeFilters.length) params.set("msg_type", typeFilters.join(","));
        if (dayFilters.length) params.set("day", dayFilters.join(","));
        const response = await fetch(`/api/admin/logs?${params.toString()}`);
        if (!response.ok) {
          throw new Error(t("logs.error", "无法加载日志"));
        }
        const data = await response.json();
        const payload = data.data ?? {};
        setLogs(payload.logs ?? []);
        setTotal(payload.total ?? 0);
        setTypeOptions(Array.isArray(payload.types) ? payload.types : []);
        setDayOptions(Array.isArray(payload.days) ? payload.days : []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("logs.error", "无法加载日志"),
        );
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [dayFilters, limit, page, search, t, typeFilters]);

  const empty = !loading && !error && logs.length === 0;
  const filterCountLabel = (count: number) =>
    t("logs.filter_count", { count, defaultValue: "{{count}} 条" });
  const resolvedTypeOptions =
    typeOptions.length > 0
      ? typeOptions
      : optionsFromLogs(logs, (log) => log.msg_type);
  const resolvedDayOptions =
    dayOptions.length > 0
      ? dayOptions
      : optionsFromLogs(logs, (log) => logDayKey(log.time));
  const typeLabel = (value: string) =>
    t(`logs.types.${value}`, { defaultValue: value });
  const searchTerm = searchInput.trim();
  const clearAllFilters = () => {
    setTypeFilters([]);
    setDayFilters([]);
    setSearchInput("");
    setSearch("");
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4 p-0 md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminPageTitle
          description={t(
            "logs.description",
            "查看后台操作与系统事件记录。",
          )}
        >
          {t("logs.title")}
        </AdminPageTitle>
      </div>
      <AdminListShell>
        <AdminListFiltersBar>
          <Stack
            direction="row"
            spacing={1.5}
            useFlexGap
            sx={{ flexWrap: { xs: "wrap", md: "nowrap" }, alignItems: "center" }}
          >
            <AdminMultiSelect
              label={t("logs.type", "类型")}
              ariaLabel={t("logs.type", "类型")}
              value={typeFilters}
              onChange={(value) => {
                setTypeFilters(value);
                setPage(1);
              }}
              options={resolvedTypeOptions.map((option) => ({
                value: option.value,
                label: typeLabel(option.value),
                secondary: filterCountLabel(option.count),
              }))}
            />
            <AdminMultiSelect
              label={t("logs.time", "时间")}
              ariaLabel={t("logs.time", "时间")}
              value={dayFilters}
              onChange={(value) => {
                setDayFilters(value);
                setPage(1);
              }}
              options={resolvedDayOptions.map((option) => ({
                value: option.value,
                label: formatLogDay(option.value),
                secondary: filterCountLabel(option.count),
              }))}
            />
            <AdminListSearch
              value={searchInput}
              onChange={setSearchInput}
              placeholder={t(
                "logs.search_placeholder",
                "搜索 IP、内容...",
              )}
            />
          </Stack>
          <AdminActiveFilters
            resultCount={total}
            onClearAll={clearAllFilters}
            chips={[
              ...typeFilters.map((type) => ({
                key: `type-${type}`,
                onDelete: () => {
                  setTypeFilters(typeFilters.filter((item) => item !== type));
                  setPage(1);
                },
                label: `${t("logs.type", "类型")}: ${typeLabel(type)}`,
              })),
              ...dayFilters.map((day) => ({
                key: `day-${day}`,
                onDelete: () => {
                  setDayFilters(dayFilters.filter((item) => item !== day));
                  setPage(1);
                },
                label: `${t("logs.time", "时间")}: ${formatLogDay(day)}`,
              })),
              ...(searchTerm
                ? [
                    {
                      key: "search",
                      onDelete: () => {
                        setSearchInput("");
                        setSearch("");
                        setPage(1);
                      },
                      label: `${t("common.search", "搜索")}: ${searchTerm}`,
                    },
                  ]
                : []),
            ]}
          />
        </AdminListFiltersBar>
        {loading && logs.length === 0 && !error ? (
          <div className="km-admin-list-empty">
            <Loading inline text="" />
          </div>
        ) : error ? (
          <div className="km-admin-list-empty">{error}</div>
        ) : empty ? (
          <div className="km-admin-list-empty">
            {t("logs.empty", "没有符合当前筛选的日志")}
          </div>
        ) : (
          <>
            <div className="admin-responsive-table-wrap">
              <div className="overflow-x-auto">
                <Table container={false} className="km-log-table min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="km-log-col-id">{t("logs.id", "ID")}</TableHead>
                      <TableHead className="km-log-col-ip">{t("logs.ip", "IP")}</TableHead>
                      <TableHead className="km-log-col-type">{t("logs.type", "类型")}</TableHead>
                      <TableHead className="km-log-col-message">{t("logs.message", "内容")}</TableHead>
                      <TableHead className="km-log-col-time">{t("logs.time", "时间")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const timeLabel = formatLogTime(log.time);
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="km-log-col-id">
                            <Dialog.Root>
                              <Dialog.Trigger>
                                <label className="hover:underline font-bold">
                                  {log.id}
                                </label>
                              </Dialog.Trigger>
                              <AppDialogContent>
                                <Dialog.Title>{t("logs.title")}</Dialog.Title>
                                <Flex direction="column" gap="1">
                                  <label className="font-bold">{t("logs.id", "ID")}</label>
                                  <label className="text-sm">{log.id}</label>
                                  <label className="font-bold">{t("logs.ip", "IP")}</label>
                                  <label className="text-sm break-all">{log.ip}</label>
                                  <label className="font-bold">{t("logs.uuid", "UUID")}</label>
                                  <label className="text-sm">{log.uuid}</label>
                                  <label className="font-bold">{t("logs.type", "类型")}</label>
                                  <LogTypeBadge value={log.msg_type} />
                                  <label className="font-bold">{t("logs.message", "内容")}</label>
                                  <label className="text-sm whitespace-pre-wrap break-all">
                                    {formatMessage(log.message)}
                                  </label>
                                  <label className="font-bold">{t("logs.time", "时间")}</label>
                                  <label className="text-sm">{timeLabel}</label>
                                </Flex>
                                <Flex justify={"end"}>
                                  <Dialog.Close>
                                    <Button variant="soft">{t("close")}</Button>
                                  </Dialog.Close>
                                </Flex>
                              </AppDialogContent>
                            </Dialog.Root>
                          </TableCell>
                          <TableCell className="km-log-col-ip whitespace-normal break-all">
                            {log.ip}
                          </TableCell>
                          <TableCell className="km-log-col-type">
                            <LogTypeBadge value={log.msg_type} />
                          </TableCell>
                          <TableCell className="km-log-col-message">
                            <LogMessageCell message={log.message} formatMessage={formatMessage} />
                          </TableCell>
                          <TableCell className="km-log-col-time whitespace-nowrap">
                            {timeLabel}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            <AdminPagination
              page={page}
              total={total}
              pageSize={limit}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                limitCustomized.current = true;
                setLimit(value);
                setPage(1);
              }}
              showSummary={false}
            />
          </>
        )}
      </AdminListShell>
    </div>
  );
};
export default LogPage;
