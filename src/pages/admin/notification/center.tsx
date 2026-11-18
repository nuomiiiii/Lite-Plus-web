import Loading from "@/components/loading";
import AdminPageTitle from "@/components/admin/AdminPageTitle";
import {
  AdminListFiltersBar,
  AdminListSearch,
  AdminListSelect,
  AdminListShell,
} from "@/components/admin/AdminListShell";
import {
  AdminPagination,
  useAdminPagination,
} from "@/components/admin/AdminPagination";
import { AdminMobileCardStack, AdminMobileListCard } from "@/components/admin/AdminMobileListCard";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVisibleInterval } from "@/hooks/useVisibleInterval";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Badge,
  Callout,
  DropdownMenu,
  Flex,
  IconButton,
} from "@/components/admin/ui";
import {
  BellOff,
  BellRing,
  CircleAlert,
} from "@/components/admin/muiIcons";
import {
  NodeDetailsProvider,
  useNodeDetails,
} from "@/contexts/NodeDetailsContext";
import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";

type AlertKind = "offline" | "load" | "latency" | "return_route";
type SilenceMode = "off" | "24h" | "3d" | "7d" | "forever";
type KindFilter = "all" | AlertKind | "silenced";

type AlertCenterItem = {
  kind: AlertKind;
  id: string;
  target: string;
  title: string;
  summary?: string;
  node_uuid?: string;
  node_name?: string;
  task_id?: number;
  task_name?: string;
  occurred_at?: string | null;
  href: string;
  silenced: boolean;
  silenced_until?: string | null;
  silenced_forever: boolean;
  current: boolean;
};

const KIND_FILTERS: KindFilter[] = [
  "all",
  "offline",
  "load",
  "latency",
  "return_route",
  "silenced",
];

const AlertCenterPage = () => (
  <NodeDetailsProvider>
    <InnerLayout />
  </NodeDetailsProvider>
);

const InnerLayout = () => {
  const { t } = useTranslation();
  const { nodeDetail, isLoading: nodeLoading, error: nodeError } = useNodeDetails();
  const [items, setItems] = React.useState<AlertCenterItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [kind, setKind] = React.useState<KindFilter>("all");
  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/notification/center", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || t("notification.center.fetch_failed"));
      }
      const payload = await response.json();
      const list = Array.isArray(payload?.data) ? payload.data : [];
      setItems(list);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t("notification.center.fetch_failed");
      setError(message);
      throw reason instanceof Error ? reason : new Error(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  useVisibleInterval(() => {
    void refresh().catch(() => undefined);
  }, 30_000);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = React.useMemo(() => {
    return (items || []).filter((item) => {
      if (kind === "silenced") {
        if (!item.silenced) return false;
      } else if (kind !== "all" && item.kind !== kind) {
        return false;
      }
      if (!normalizedSearch) return true;
      const node = nodeDetail.find((entry) => entry.uuid === item.node_uuid);
      const haystack = [
        item.title,
        item.summary,
        item.node_name,
        item.node_uuid,
        item.task_name,
        node?.name,
        node?.ipv4,
        node?.ipv6,
        t(`notification.center.kind_${item.kind}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [items, kind, nodeDetail, normalizedSearch, t]);
  const pagination = useAdminPagination(filtered);

  if ((loading && items === null) || nodeLoading) {
    return <Loading />;
  }
  if ((error && items === null) || nodeError) {
    return <div>{error || nodeError}</div>;
  }

  return (
    <Flex direction="column" gap="4" className="w-full min-w-0 p-0 md:p-4">
      <AdminPageTitle description={t("notification.center.description")}>
        {t("notification.center.title")}
      </AdminPageTitle>
      <AdminListShell>
        <AdminListFiltersBar>
          <Stack
            direction="row"
            spacing={1.5}
            useFlexGap
            sx={{ flexWrap: "wrap", alignItems: "center" }}
          >
            <AdminListSelect
              label={t("notification.center.kind")}
              value={kind}
              onChange={(value) => setKind(value as KindFilter)}
            >
              {KIND_FILTERS.map((value) => (
                <MenuItem key={value} value={value}>
                  {t(`notification.center.kind_${value}`)}
                </MenuItem>
              ))}
            </AdminListSelect>
            <AdminListSearch
              value={search}
              onChange={setSearch}
              placeholder={t("common.search")}
            />
          </Stack>
        </AdminListFiltersBar>
        {error ? (
          <Callout.Root color="red" className="mb-3" role="alert">
            <Callout.Icon>
              <CircleAlert size={16} />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        ) : null}
        <AlertCenterTable
          items={pagination.pageItems}
          total={filtered.length}
          pagination={pagination}
          loading={loading && items === null}
          emptyLabel={
            kind === "silenced"
              ? t("notification.center.empty_silenced")
              : t("notification.center.empty")
          }
          onChanged={() => void refresh().catch(() => undefined)}
        />
      </AdminListShell>
      <div className="mt-1 border-l-2 border-[var(--accent-8)] pl-3 text-sm leading-6 text-muted-foreground">
        <span dangerouslySetInnerHTML={{ __html: t("notification.center.tips") }} />
      </div>
    </Flex>
  );
};

const AlertCenterTable = ({
  items,
  total,
  pagination,
  loading,
  emptyLabel,
  onChanged,
}: {
  items: AlertCenterItem[];
  total: number;
  pagination: {
    page: number;
    setPage: (page: number) => void;
    pageSize: number;
    setPageSize: (pageSize: number) => void;
  };
  loading: boolean;
  emptyLabel: string;
  onChanged: () => void;
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  if (loading) {
    return (
      <div className="km-admin-list-empty">
        <Loading inline />
      </div>
    );
  }
  if (total === 0) {
    return <div className="km-admin-list-empty">{emptyLabel}</div>;
  }
  return (
    <>
      {isMobile ? (
        <AdminMobileCardStack>
          {items.map((item) => (
            <AlertCenterRow key={item.id} item={item} asCard onChanged={onChanged} />
          ))}
        </AdminMobileCardStack>
      ) : (
        <div className="admin-responsive-table-wrap overflow-x-auto">
          <Table
            container={false}
            className="admin-responsive-table admin-primary-first-table table-fixed min-w-[1080px]"
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-[11%]">{t("notification.center.kind")}</TableHead>
                <TableHead className="w-[18%]">{t("common.name")}</TableHead>
                <TableHead className="w-[18%]">{t("common.server")}</TableHead>
                <TableHead className="w-[18%]">{t("notification.center.summary")}</TableHead>
                <TableHead className="w-[16%]">{t("notification.load.triggered_at")}</TableHead>
                <TableHead className="w-[13%]">{t("notification.load.silence_status")}</TableHead>
                <TableHead className="w-[6%]">{t("common.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <AlertCenterRow key={item.id} item={item} onChanged={onChanged} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <AdminPagination
        page={pagination.page}
        total={total}
        pageSize={pagination.pageSize}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
        showSummary={false}
      />
    </>
  );
};

const AlertCenterRow = ({
  item,
  asCard = false,
  onChanged,
}: {
  item: AlertCenterItem;
  asCard?: boolean;
  onChanged: () => void;
}) => {
  const { t } = useTranslation();
  const { nodeDetail } = useNodeDetails();
  const [saving, setSaving] = React.useState(false);
  const node = nodeDetail.find((entry) => entry.uuid === item.node_uuid);
  const clientName = item.node_name || node?.name || item.node_uuid || "-";
  const clientAddress = node?.ipv4?.trim() || node?.ipv6?.trim() || "";
  const setSilence = async (mode: SilenceMode) => {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/notification/center/silence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: item.kind,
          target: item.target,
          label: [clientName, item.title, item.task_name].filter(Boolean).join(" / "),
          mode,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.message || t("common.error"));
      }
      toast.success(
        t(mode === "off" ? "notification.load.unsilenced_success" : "notification.load.silenced_success"),
      );
      onChanged();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };
  const silenceLabel = item.silenced_forever
    ? t("notification.load.silenced_forever")
    : item.silenced && item.silenced_until
      ? t("notification.load.silenced_until", {
          time: new Date(item.silenced_until).toLocaleString(),
        })
      : t("notification.load.not_silenced");
  const kindBadge = (
    <Badge color={item.kind === "offline" ? "gray" : item.kind === "load" ? "orange" : item.kind === "latency" ? "red" : "blue"} variant="soft">
      {t(`notification.center.kind_${item.kind}`)}
    </Badge>
  );
  const silenceBadge = (
    <Badge color={item.silenced ? "orange" : item.current ? "red" : "gray"} variant="soft">
      {item.current ? silenceLabel : t("notification.center.leftover")}
    </Badge>
  );
  const serverValue = (
    <div className="min-w-0">
      <div className="truncate">{clientName}</div>
      {clientAddress ? (
        <div className="truncate text-xs text-muted-foreground">{clientAddress}</div>
      ) : null}
    </div>
  );
  const titleValue = item.href ? (
    <Link to={item.href} className="min-w-0 truncate text-inherit no-underline hover:underline">
      {item.title || "-"}
    </Link>
  ) : (
    <span>{item.title || "-"}</span>
  );
  const actionButtons = (
    <div className="admin-card-actions flex items-center gap-2">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <IconButton
            type="button"
            variant="soft"
            color={item.silenced ? "orange" : "gray"}
            disabled={saving}
            title={t("notification.load.silence_action")}
            aria-label={t("notification.load.silence_action")}
          >
            {item.silenced ? <BellOff size={16} /> : <BellRing size={16} />}
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          {item.silenced ? (
            <DropdownMenu.Item onSelect={() => void setSilence("off")}>
              <BellRing size={15} />
              {t("notification.load.unsilence")}
            </DropdownMenu.Item>
          ) : null}
          {item.current || item.kind === "offline" || item.kind === "latency" || item.kind === "return_route" ? (
            <>
              <DropdownMenu.Item onSelect={() => void setSilence("24h")}>
                {t("notification.load.silence_24h")}
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => void setSilence("3d")}>
                {t("notification.load.silence_3d")}
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => void setSilence("7d")}>
                {t("notification.load.silence_7d")}
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item color="orange" onSelect={() => void setSilence("forever")}>
                {t("notification.load.silence_forever")}
              </DropdownMenu.Item>
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  );

  if (asCard) {
    return (
      <AdminMobileListCard
        title={titleValue}
        headerExtra={kindBadge}
        cells={[
          [t("common.server"), serverValue],
          [t("notification.center.summary"), item.summary || item.task_name || "-"],
          [t("notification.load.triggered_at"), item.occurred_at ? new Date(item.occurred_at).toLocaleString() : "-"],
          [t("notification.load.silence_status"), silenceBadge],
        ]}
        actions={actionButtons}
      />
    );
  }

  return (
    <TableRow>
      <TableCell data-label={t("notification.center.kind")}>{kindBadge}</TableCell>
      <TableCell data-label={t("common.name")}>{titleValue}</TableCell>
      <TableCell data-label={t("common.server")}>{serverValue}</TableCell>
      <TableCell data-label={t("notification.center.summary")} className="min-w-0">
        <span className="block truncate">{item.summary || item.task_name || "-"}</span>
      </TableCell>
      <TableCell data-label={t("notification.load.triggered_at")} className="whitespace-nowrap text-sm">
        {item.occurred_at ? new Date(item.occurred_at).toLocaleString() : "-"}
      </TableCell>
      <TableCell data-label={t("notification.load.silence_status")}>{silenceBadge}</TableCell>
      <TableCell data-label={t("common.action")}>{actionButtons}</TableCell>
    </TableRow>
  );
};

export default AlertCenterPage;
