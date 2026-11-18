import { quoteShellArgs } from "@/utils/shellQuote";
import { publicVersion } from "@/utils/version";
import {
  LITE_AGENT_DOCKER_IMAGE,
  defaultInstallGitHubProxy,
  liteAgentInstallScriptUrl,
  liteAgentLinuxInstallCommand,
  liteAgentMacInstallCommand,
  liteAgentWindowsInstallCommand,
} from "@/utils/agentInstall";
import { normalizeOptionalServiceUrl } from "@/utils/serviceUrl";
import { writeClipboardText } from "@/utils/clipboard";
import React, { useEffect, useState } from "react";
import {
  NodeDetailsProvider,
  useNodeDetails,
  type NodeDetail,
} from "@/contexts/NodeDetailsContext";
import { createInstallTokenSession, installCommandCopyAllowed } from "@/lib/installTokenSession";
import { AdminMobileCardStack, AdminMobileListCard } from "@/components/admin/AdminMobileListCard";
import {
  NODE_COLUMN_KEYS,
  NODE_COLUMN_MIN,
  NODE_SORT_COLUMN_WIDTH,
  clampNodeColumnWidth,
  clearNodeColumnWidths,
  defaultNodeColumnWidths,
  fitNodeColumnWidths,
  nodeColumnStyle,
  sameNodeColumnWidths,
  readNodeColumnLayout,
  readNodeColumnWidths,
  writeNodeColumnWidths,
  type NodeColumnKey,
  type NodeColumnWidths,
} from "@/components/admin/nodeTableColumnWidths";
import Alert from "@mui/material/Alert";
import MuiButton from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import {
  AppDialogContent,
  Flex,
  TextField,
  Button,
  Text,
  Dialog,
  IconButton,
  TextArea,
  Callout,
  Badge,
  Select,
  Tabs,
} from "@/components/admin/ui";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CircleDollarSign,
  CheckCircle2,
  Clock3,
  Copy,
  CornerRightUp,
  Download,
  Gauge,
  GripVertical,
  Pencil,
  RefreshCw,
  Plus,
  Save,
  Send,
  Terminal,
  Trash2Icon,
  XCircle,
} from "@/components/admin/muiIcons";
import { Link, useSearchParams } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  DndContext,
  DragOverlay,
  MeasuringFrequency,
  MeasuringStrategy,
  closestCenter,
  useDndContext,
  useSensor,
  useSensors,
  TouchSensor,
  MouseSensor,
  KeyboardSensor,
  type Collision,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  type SortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import {
  isClientTokenTwoFactorInvalid,
  isClientTokenTwoFactorRequired,
  rotateClientToken,
} from "@/lib/clientToken";
import { localizeTokenRotationError } from "@/utils/tokenRotation";
import { confirmAdminPasskey, passkeyUnavailableMessage } from "@/utils/webauthn";
import Flag from "@/components/Flag";
import { NODE_OFFLINE, NODE_ONLINE } from "@/theme/brand";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatBytes, isNegativeByteInput, stringToBytes } from "@/utils/unitHelper";
import { normalizeBandwidth } from "@/utils/bandwidth";
import { formatTrafficCalibrationCycleRange } from "@/utils/trafficCycle";
import {
  TRAFFIC_RESET_TIMEZONES,
  normalizeTrafficResetTime,
  normalizeTrafficResetTimezone,
} from "@/utils/trafficResetTimezones";

const trafficResetTimezoneOptions = TRAFFIC_RESET_TIMEZONES.map((zone) => ({
  label: zone.label,
  value: zone.value,
}));
import PriceTags, { CustomTags } from "@/components/PriceTags";
import Loading from "@/components/loading";
import Tips from "@/components/ui/tips";
import {
  SettingCardSelect,
  SettingCardShortTextInput,
  SettingCardSwitch,
} from "@/components/admin/SettingCard";
import { useSettings } from "@/lib/api";
import {
  DEFAULT_EXPIRY_TIMEZONE,
  billingSaveFollowUp,
  expiryFieldsIfChanged,
  expiryTimezoneOptions,
  formatInstantInTimezone,
  normalizeExpiryTimezone,
  nowInExpiryTimezone,
  toExpiryLocalDateTime,
} from "@/lib/expiryDateTime";
import { currencyForDisplay, currencyForStorage } from "@/lib/currency";
import { openRemoteTerminal } from "@/utils/remoteLaunch";
import { useRemoteManagementGate } from "@/components/admin/RemoteManagementGate";
import { SelectOrInput } from "@/components/ui/select-or-input";
import AdminPageTitle from "@/components/admin/AdminPageTitle";
import ExpiryDateField from "@/components/admin/ExpiryDateField";
import TrafficResetTimeField from "@/components/admin/TrafficResetTimeField";
import { AdminSheetTabs, AdminTabLabel } from "@/components/admin/AdminSheetTabs";
import AdminNodeListFilters, {
  type AdminNodeStatusValue,
} from "@/components/admin/AdminNodeListFilters";
import { ADMIN_LIST_ACTION_SX } from "@/components/admin/adminListLayout";
import {
  AdminPagination,
} from "@/components/admin/AdminPagination";
import { useAdminDefaultPageSize } from "@/hooks/useAdminDefaultPageSize";
import { startVisibleInterval, useVisibleInterval } from "@/hooks/useVisibleInterval";
import {
  AdminNodeLiveDataProvider,
  nodeOnlineState,
  useAdminNodeLiveData,
} from "@/hooks/use-admin-node-live-data";
import {
  getRegionCode,
  getRegionDisplayName,
  getSupportedRegions,
} from "@/utils/regionHelper";
import {
  nodeListInsertAfter,
  nodeListReorderIndex,
} from "@/utils/nodeListReorder";
import {
  dashboardAlertNodeUuidSet,
  getDashboardAlertItemsSnapshot,
  parseServerListAlertKind,
  requestDashboardAlertItems,
} from "@/utils/adminAlertFilters";


const NodeDetailsPage = () => {
  return (
    <NodeDetailsProvider>
      <AdminNodeLiveDataProvider>
        <Layout />
      </AdminNodeLiveDataProvider>
    </NodeDetailsProvider>
  );
};

const PREVIOUS_PAGE_DROP_ID = "admin-node-previous-page";
const NEXT_PAGE_DROP_ID = "admin-node-next-page";
const NODE_LIST_DND_MODIFIERS = [restrictToVerticalAxis];
const NODE_LIST_AUTO_SCROLL = {
  layoutShiftCompensation: false,
  acceleration: 6,
  threshold: { x: 0.2, y: 0.18 },
  canScroll: (element: Element) =>
    element instanceof HTMLElement &&
    element.hasAttribute("data-admin-scroll-container"),
};
const NODE_LIST_MEASURING = {
  droppable: {
    strategy: MeasuringStrategy.WhileDragging,
    frequency: MeasuringFrequency.Optimized,
  },
};
const NODE_LIST_SORTING_STRATEGY: SortingStrategy = () => null;
const NODE_LIST_ORIGIN_STYLE: React.CSSProperties = {
  opacity: 0.4,
  pointerEvents: "none",
};

const nodeListCollisionDetection: CollisionDetection = (args) => {
  const pointerY = args.pointerCoordinates?.y
    ?? args.collisionRect.top + args.collisionRect.height / 2;
  const hits: Collision[] = [];
  let nearest: Collision | null = null;
  for (const container of args.droppableContainers) {
    if (container.disabled) continue;
    const rect = args.droppableRects.get(container.id);
    if (!rect) continue;
    const midpoint = rect.top + rect.height / 2;
    if (pointerY >= rect.top && pointerY <= rect.bottom) {
      hits.push({
        id: container.id,
        data: { droppableContainer: container, value: Math.abs(pointerY - midpoint) },
      });
      continue;
    }
    const distance =
      pointerY < rect.top ? rect.top - pointerY : pointerY - rect.bottom;
    if (!nearest || distance < (nearest.data?.value ?? Infinity)) {
      nearest = {
        id: container.id,
        data: { droppableContainer: container, value: distance },
      };
    }
  }
  if (hits.length > 0) {
    hits.sort((a, b) => (a.data?.value ?? 0) - (b.data?.value ?? 0));
    return hits;
  }
  if (nearest) return [nearest];
  return closestCenter(args);
};

function NodeListDragPreview({ nodes }: { nodes: readonly NodeDetail[] }) {
  const { active } = useDndContext();
  const isMobile = useIsMobile();
  const node = active ? nodes.find((item) => item.uuid === active.id) : undefined;
  if (!node) return null;
  return (
    <div
      className={`admin-node-drag-overlay flex h-[52px] cursor-grabbing items-center gap-2 rounded-md border border-[var(--gray-a5)] bg-[var(--color-panel-solid)] px-3 shadow-md ${
        isMobile ? "w-[min(360px,calc(100vw-2.5rem))]" : "w-[min(320px,80vw)]"
      }`}
    >
      <GripVertical size={16} className="shrink-0 text-[var(--gray-9)]" />
      <span className="truncate text-[15px] font-semibold leading-6">{node.name}</span>
    </div>
  );
}

function nodeSearchHaystack(node: NodeDetail) {
  return [
    node.name,
    node.ipv4,
    node.ipv6,
    node.group,
    node.remark,
    node.public_remark,
    node.tags,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const Layout = () => {
  const { t } = useTranslation();
  const { nodeDetail, isLoading, error, refresh } = useNodeDetails();
  const { settings } = useSettings();
  const { liveData, available } = useAdminNodeLiveData();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const routeStatus = searchParams.get("status")?.trim();
  const [statusFilters, setStatusFilters] = useState<AdminNodeStatusValue[]>(() =>
    routeStatus === "offline" || routeStatus === "online" ? [routeStatus] : [],
  );
  const [regionFilters, setRegionFilters] = useState<string[]>([]);
  const [groupFilters, setGroupFilters] = useState<string[]>([]);
  const routeNode = searchParams.get("node")?.trim() || "";
  const listAlertKind = parseServerListAlertKind(searchParams.get("alert"));
  const [alertNodeUuids, setAlertNodeUuids] = useState<ReadonlySet<string> | null>(() => {
    if (!listAlertKind) return null;
    const snapshot = getDashboardAlertItemsSnapshot(listAlertKind);
    return snapshot ? dashboardAlertNodeUuidSet(snapshot.items) : null;
  });
  const onlineSet = React.useMemo(
    () => new Set(liveData?.data.online ?? []),
    [liveData?.data.online],
  );
  const alertFilterPending = Boolean(listAlertKind) && alertNodeUuids === null;

  const clearListAlert = React.useCallback(() => {
    setSearchParams((current) => {
      if (!current.has("alert")) return current;
      const next = new URLSearchParams(current);
      next.delete("alert");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    if (!listAlertKind) {
      setAlertNodeUuids(null);
      return;
    }
    const controller = new AbortController();
    const snapshot = getDashboardAlertItemsSnapshot(listAlertKind);
    setAlertNodeUuids(snapshot ? dashboardAlertNodeUuidSet(snapshot.items) : null);
    void requestDashboardAlertItems(listAlertKind, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setAlertNodeUuids(dashboardAlertNodeUuidSet(data.items));
      })
      .catch((error: { name?: string } | undefined) => {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        setAlertNodeUuids(new Set());
      });
    return () => controller.abort();
  }, [listAlertKind]);

  const filteredNodes = React.useMemo(
    () => {
      if (!Array.isArray(nodeDetail) || alertFilterPending) return [];
      return nodeDetail.filter((node) => {
        const query = searchTerm.trim().toLowerCase();
        const matchesSearch = !query || nodeSearchHaystack(node).includes(query);
        const isOnline = nodeOnlineState(available, onlineSet, node.uuid);
        const matchesStatus =
          statusFilters.length === 0 ||
          isOnline === null ||
          statusFilters.includes(isOnline ? "online" : "offline");
        const matchesRegion =
          regionFilters.length === 0 || regionFilters.includes(getRegionCode(node.region));
        const nodeGroup = node.group?.trim() ? node.group.trim() : "__none__";
        const matchesGroup = groupFilters.length === 0 || groupFilters.includes(nodeGroup);
        const matchesNode = !routeNode || node.uuid === routeNode;
        const matchesAlert = !listAlertKind || Boolean(alertNodeUuids?.has(node.uuid));
        return (
          matchesSearch &&
          matchesStatus &&
          matchesRegion &&
          matchesGroup &&
          matchesNode &&
          matchesAlert
        );
      });
    },
    [
      alertFilterPending,
      alertNodeUuids,
      groupFilters,
      listAlertKind,
      nodeDetail,
      onlineSet,
      available,
      regionFilters,
      routeNode,
      searchTerm,
      statusFilters,
    ],
  );

  useVisibleInterval(() => {
    refresh();
  }, 15000);

  if (isLoading) return <Loading text="" />;
  if (error) return <div>{error}</div>;

  const isEmpty = Array.isArray(nodeDetail) && nodeDetail.length === 0;

  return (
    <Flex direction="column" gap="4" className="p-0 md:p-4">
      <Header />

      {isEmpty ? (
        <EmptyNodesGuide />
      ) : (
        <div className="km-admin-node-list">
          <AdminNodeListFilters
            nodes={nodeDetail}
            onlineSet={onlineSet}
            available={available}
            resultCount={filteredNodes.length}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            statusFilters={statusFilters}
            onStatusFiltersChange={setStatusFilters}
            regionFilters={regionFilters}
            onRegionFiltersChange={setRegionFilters}
            groupFilters={groupFilters}
            onGroupFiltersChange={setGroupFilters}
            alertChip={
              listAlertKind
                ? {
                    label: t(
                      `admin_dashboard.alert_${listAlertKind}`,
                      listAlertKind === "resource"
                        ? "资源超限"
                        : listAlertKind === "traffic"
                          ? "流量容量"
                          : "账单提醒",
                    ),
                    onClear: clearListAlert,
                  }
                : null
            }
          />
          {alertFilterPending ? (
            <Loading inline text="" />
          ) : filteredNodes.length === 0 ? (
            <div className="px-5 py-6">
              <Alert severity="info">{t("common.no_data", "没有符合当前筛选的服务器")}</Alert>
            </div>
          ) : (
            <NodeTable
              nodes={filteredNodes}
              settings={settings}
              onlineSet={onlineSet}
              available={available}
              reorderEnabled={
                !searchTerm.trim() &&
                statusFilters.length === 0 &&
                regionFilters.length === 0 &&
                groupFilters.length === 0 &&
                !routeNode &&
                !listAlertKind
              }
            />
          )}
        </div>
      )}
    </Flex>
  );
};

const EmptyNodesGuide = () => {
  const { t } = useTranslation();
  return (
    <Flex
      direction="column"
      align="end"
      justify="start"
      style={{ minHeight: "60vh" }}
      pr="2"
      pt="1"
    >
      {/* 回转箭头指向右上角的“添加节点”按钮 */}
      <CornerRightUp
        size={72}
        strokeWidth={1.25}
        className="text-[var(--accent-9)] animate-bounce"
        style={{ marginRight: "1.5rem" }}
      />
      <Flex direction="column" align="end" gap="1" mt="2" mr="2">
        <Text size="4" weight="bold">
          {t("admin.nodeTable.emptyGuide.title", "还没有任何服务器")}
        </Text>
        <Text size="2" color="gray" align="right" style={{ maxWidth: "20rem" }}>
          {t(
            "admin.nodeTable.emptyGuide.description",
            "点击右上角的“添加节点”开始。"
          )}
        </Text>
      </Flex>
    </Flex>
  );
};


const Header = () => {
  const { t } = useTranslation();
  const { refresh } = useNodeDetails();
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleAddNode = async (name: string | undefined) => {
    setDialogOpen(true);
    setLoading(true);
    try {
      await fetch("/api/admin/client/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "" }),
      });
      refresh();
    } catch (error) {
      toast.error(
        `${t("common.error", "Error")}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      setLoading(false);
      setDialogOpen(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <AdminPageTitle
        description={t(
          "admin.nodeTable.description",
          "集中查看节点连接、网络、分组、备注与账单信息，拖动可调整全局显示顺序。",
        )}
      >
        {t("admin.nodeTable.nodeList")}
      </AdminPageTitle>
      <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
        <Dialog.Trigger asChild>
          <MuiButton
            variant="contained"
            startIcon={<Plus size={16} />}
            className="shrink-0"
            sx={ADMIN_LIST_ACTION_SX}
            onClick={() => setDialogOpen(true)}
          >
            {t("admin.nodeTable.addNode")}
          </MuiButton>
        </Dialog.Trigger>
        <AppDialogContent>
          <Dialog.Title>{t("admin.nodeTable.addNode")}</Dialog.Title>
          <TextField.Root
            ref={inputRef}
            placeholder={t("admin.nodeTable.nameOptional")}
          />
          <Flex justify="end" gap="2" mt="4">
            <Button
              onClick={() => handleAddNode(inputRef.current?.value)}
              disabled={loading}
            >
              {t("admin.nodeTable.addNode")}
            </Button>
          </Flex>
        </AppDialogContent>
      </Dialog.Root>
    </div>
  );
};

const compactIPv6 = (value: string) => {
  if (value.length <= 22) return value;
  const segments = value.split(":");
  return segments.length > 3
    ? `${segments.slice(0, 2).join(":")}:...${segments[segments.length - 1]}`
    : value;
};

function nodePreferredAddress(node: NodeDetail) {
  const ipv4 = node.ipv4?.trim();
  if (ipv4) return ipv4;
  const ipv6 = node.ipv6?.trim();
  return ipv6 ? compactIPv6(ipv6) : "";
}

function nodeNetworkAddresses(node: NodeDetail) {
  return (
    [
      ["IPv4", node.ipv4?.trim()],
      ["IPv6", node.ipv6?.trim()],
    ] as const
  ).filter(
    (entry): entry is readonly ["IPv4" | "IPv6", string] => Boolean(entry[1]),
  );
}

function nodeBillingTagsNeedStack(root: HTMLElement) {
  const groups = root.querySelectorAll<HTMLElement>(".admin-node-billing-tags");
  for (const group of groups) {
    const badges = Array.from(group.children) as HTMLElement[];
    if (badges.length < 2) continue;
    const cell = group.closest("td");
    const box = cell ?? group;
    if (box.clientWidth <= 0) continue;
    const cellStyle = getComputedStyle(box);
    const available =
      box.clientWidth -
      (Number.parseFloat(cellStyle.paddingLeft) || 0) -
      (Number.parseFloat(cellStyle.paddingRight) || 0);
    const gap =
      Number.parseFloat(getComputedStyle(group).columnGap || getComputedStyle(group).gap) ||
      0;
    let needed = 0;
    for (let i = 0; i < badges.length; i += 1) {
      needed += Math.max(badges[i].scrollWidth, badges[i].offsetWidth);
      if (i > 0) needed += gap;
    }
    if (needed > available + 0.5) return true;
  }
  return false;
}

function nodeDeploymentStatusPresentation(
  status: string | undefined | null,
  t: TFunction,
) {
  switch (status) {
    case "saved":
      return {
        label: t("admin.nodeTable.deliverySaved", "已保存"),
        color: "blue" as const,
      };
    case "sent":
      return {
        label: t("admin.nodeTable.deliverySent", "已发送"),
        color: "orange" as const,
      };
    case "applied":
      return {
        label: t("admin.nodeTable.deliveryApplied", "已生效"),
        color: "green" as const,
      };
    case "failed":
      return {
        label: t("admin.nodeTable.deliveryFailed", "应用失败"),
        color: "red" as const,
      };
    default:
      return null;
  }
}

const SortableRow = React.memo(({
  node,
  settings,
  online,
  reorderEnabled,
}: {
  node: NodeDetail;
  settings: any;
  online: boolean | null;
  reorderEnabled: boolean;
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: node.uuid,
    disabled: !reorderEnabled,
    animateLayoutChanges: () => false,
  });
  return (
    <TableRow
      ref={setNodeRef}
      className={`text-sm hover:bg-[var(--accent-a2)] [&>td]:align-middle [&>td]:py-2.5${isDragging ? " admin-node-sortable-origin" : ""}`}
      style={{ borderColor: "var(--gray-a5)" }}
      data-node-status={online === null ? "pending" : online ? "online" : "offline"}
    >
      <SortableRowCells
        node={node}
        settings={settings}
        online={online}
        reorderEnabled={reorderEnabled}
        attributes={attributes}
        listeners={listeners}
      />
    </TableRow>
  );
});
SortableRow.displayName = "SortableRow";

const SortableRowCells = React.memo(function SortableRowCells({
  node,
  settings,
  online,
  reorderEnabled,
  attributes,
  listeners,
}: {
  node: NodeDetail;
  settings: any;
  online: boolean | null;
  reorderEnabled: boolean;
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: Record<string, unknown> | undefined;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  async function copy(text: string) {
    try {
      await writeClipboardText(text);
      toast.success(t("copy_success"));
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  }
  const networkAddresses = nodeNetworkAddresses(node);
  const deploymentStatusPresentation = nodeDeploymentStatusPresentation(
    node.deployment_status,
    t,
  );
  return (
    <>
      <TableCell className="w-[44px] px-2 !align-middle" data-label={t("common.sort", "排序")}>
        <div className="flex items-center">
          <button
            type="button"
            {...attributes}
            {...listeners}
            disabled={!reorderEnabled}
            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--gray-9)] transition-colors ${
              reorderEnabled
                ? "cursor-grab hover:bg-[var(--accent-a3)] hover:text-[var(--accent-11)] active:cursor-grabbing"
                : "cursor-not-allowed opacity-40"
            } ${isMobile ? "touch-manipulation select-none" : ""}`}
            style={{ touchAction: "none" }}
            title={
              reorderEnabled
                ? t("admin.nodeTable.dragToReorder", "长按拖拽重新排序")
                : t("admin.nodeTable.clearFilterToReorder", "清除搜索和筛选后可调整顺序")
            }
            aria-label={t("admin.nodeTable.dragToReorder", "长按拖拽重新排序")}
          >
            <GripVertical size={isMobile ? 18 : 16} />
          </button>
        </div>
      </TableCell>
      <TableCell
        className="admin-node-name-cell overflow-hidden !align-middle"
        data-label={t("admin.nodeTable.name")}
        title={node.name}
      >
        <NodeNameLink node={node} online={online} />
      </TableCell>
      <TableCell className="!align-middle overflow-hidden" data-label={t("admin.nodeTable.network", "网络")}>
        <div className="flex min-w-0 flex-col justify-center text-sm leading-[1.125rem] text-muted-foreground">
          {networkAddresses.length > 0 ? networkAddresses.map(([type, address]) => (
            <div key={type} className="flex min-w-0 items-center gap-1 overflow-hidden" title={address}>
              <span className="min-w-0 truncate whitespace-nowrap tabular-nums">
                {type} {type === "IPv6" ? compactIPv6(address) : address}
              </span>
              <button
                type="button"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-[var(--accent-a3)] hover:text-[var(--accent-11)]"
                onClick={() => copy(address)}
                aria-label={t("copy", "复制")}
                title={t("copy", "复制")}
              >
                <Copy size={13} />
              </button>
            </div>
          )) : <span className="tabular-nums">--</span>}
        </div>
      </TableCell>
      <TableCell className="!align-middle whitespace-normal" data-label={t("admin.nodeTable.agent", "Agent")}>
        <div className="admin-node-agent-cell flex min-w-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-center" title={[publicVersion(node.version) || "--", deploymentStatusPresentation?.label].filter(Boolean).join(" ")}>
          <span className="admin-node-agent-version text-sm text-muted-foreground">
            {publicVersion(node.version) || "--"}
          </span>
          {deploymentStatusPresentation ? (
            <Badge
              color={deploymentStatusPresentation.color}
              size="1"
              variant="soft"
              className="text-sm"
            >
              <label className="text-xs" title={deploymentStatusPresentation.label}>
                {deploymentStatusPresentation.label}
              </label>
            </Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="!align-middle min-w-0 overflow-hidden" data-label={t("common.group", "分组")}>
        <span className="admin-cell-clip text-sm font-normal text-muted-foreground" title={node.group || ""}>
          {node.group || "--"}
        </span>
      </TableCell>
      <TableCell className="!align-middle min-w-0 overflow-hidden" data-label={t("common.remark", "备注")}>
        <span className="admin-cell-clip text-sm text-muted-foreground" title={node.remark || ""}>
          {node.remark || "--"}
        </span>
      </TableCell>
      <TableCell className="!align-middle min-w-0 whitespace-normal" data-label={t("admin.nodeTable.billing")}>
        {Number(node.price) === 0 ? (
          <span className="text-sm text-muted-foreground">--</span>
        ) : (
          <PriceTags
            className="admin-node-billing-tags [&_label]:!text-xs"
            direction="row"
            wrap="wrap"
            price={node.price}
            billing_cycle={node.billing_cycle}
            expired_at={node.expired_at}
            expiry_timezone={node.expiry_timezone}
            currency={node.currency}
          />
        )}
      </TableCell>
      <TableCell className="!align-middle min-w-0 whitespace-normal" data-label={t("admin.nodeTable.tags", "标签")}>
        {(node.tags || "").trim() ? (
          <div className="admin-cell-clip-row" title={node.tags || ""}>
            <CustomTags tags={node.tags || ""} />
          </div>
        ) : (
          <span className="admin-cell-clip text-sm text-muted-foreground">--</span>
        )}
      </TableCell>
      <TableCell className="!align-middle" data-label={t("common.action", "操作")}>
        <ActionButtons node={node} settings={settings} />
      </TableCell>
    </>
  );
});

const SortableMobileCard = React.memo(function SortableMobileCard({
  node,
  settings,
  online,
  reorderEnabled,
}: {
  node: NodeDetail;
  settings: any;
  online: boolean | null;
  reorderEnabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: node.uuid,
    disabled: !reorderEnabled,
    animateLayoutChanges: () => false,
  });
  const { t } = useTranslation();
  const networkAddresses = nodeNetworkAddresses(node);
  const deploymentStatusPresentation = nodeDeploymentStatusPresentation(
    node.deployment_status,
    t,
  );
  const networkValue =
    networkAddresses.length > 0 ? (
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        {networkAddresses.map(([type, address]) => (
          <Typography
            key={type}
            sx={{
              fontSize: 13.5,
              fontWeight: 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={address}
          >
            {type} {type === "IPv6" ? compactIPv6(address) : address}
          </Typography>
        ))}
      </Stack>
    ) : (
      "--"
    );
  const billingValue =
    Number(node.price) === 0 ? (
      "--"
    ) : (
      <PriceTags
        className="[&_label]:!text-xs"
        direction="row"
        wrap="nowrap"
        price={node.price}
        billing_cycle={node.billing_cycle}
        expired_at={node.expired_at}
        expiry_timezone={node.expiry_timezone}
        currency={node.currency}
      />
    );
  const cells: Array<[string, React.ReactNode]> = [
    [t("admin.nodeTable.network", "网络"), networkValue],
    [
      t("admin.nodeTable.agent", "Agent"),
      <Stack key="agent" spacing={0.4} sx={{ minWidth: 0, alignItems: "flex-start" }}>
        <Typography
          sx={{
            fontSize: 13.5,
            fontWeight: 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
          title={publicVersion(node.version) || "--"}
        >
          {publicVersion(node.version) || "--"}
        </Typography>
        {deploymentStatusPresentation ? (
          <Badge
            color={deploymentStatusPresentation.color}
            size="1"
            variant="soft"
            className="text-sm"
          >
            <label className="text-xs" title={deploymentStatusPresentation.label}>
              {deploymentStatusPresentation.label}
            </label>
          </Badge>
        ) : null}
      </Stack>,
    ],
  ];
  if (node.group?.trim()) {
    cells.push([t("common.group", "分组"), node.group]);
  }
  if (node.remark?.trim()) {
    cells.push([t("common.remark", "备注"), node.remark]);
  }
  if (Number(node.price) !== 0) {
    cells.push([t("admin.nodeTable.billing"), billingValue]);
  }
  if ((node.tags || "").trim()) {
    cells.push([
      t("admin.nodeTable.tags", "标签"),
      <Flex key="tags" gap="1" wrap="wrap">
        <CustomTags tags={node.tags || ""} />
      </Flex>,
    ]);
  }

  return (
    <AdminMobileListCard
      ref={setNodeRef}
      dense
      style={isDragging ? NODE_LIST_ORIGIN_STYLE : undefined}
      title={<NodeNameLink node={node} online={online} />}
      headerExtra={
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={!reorderEnabled}
          className={`inline-flex size-10 shrink-0 items-center justify-center rounded-md text-[var(--gray-9)] ${
            reorderEnabled
              ? "cursor-grab hover:bg-[var(--accent-a3)] hover:text-[var(--accent-11)] active:cursor-grabbing"
              : "cursor-not-allowed opacity-40"
          } touch-manipulation select-none`}
          style={{ touchAction: "none" }}
          title={
            reorderEnabled
              ? t("admin.nodeTable.dragToReorder", "长按拖拽重新排序")
              : t("admin.nodeTable.clearFilterToReorder", "清除搜索和筛选后可调整顺序")
          }
          aria-label={t("admin.nodeTable.dragToReorder", "长按拖拽重新排序")}
        >
          <GripVertical size={18} />
        </button>
      }
      cells={cells}
      actions={<ActionButtons node={node} settings={settings} />}
    />
  );
});

function nodeListTableWidth(root: HTMLElement | null) {
  const scroller = root?.querySelector("[data-slot='table-container']");
  if (scroller && scroller.clientWidth > 0) return Math.max(0, scroller.clientWidth - 1);
  return root?.clientWidth ?? 0;
}

const NodeTable = ({
  nodes,
  settings,
  onlineSet,
  available,
  reorderEnabled,
}: {
  nodes: NodeDetail[];
  settings: any;
  onlineSet: ReadonlySet<string>;
  available: boolean;
  reorderEnabled: boolean;
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const sensors = useSensors(
    useSensor(MouseSensor, {
      // 需要按住 10px 距离才开始拖拽，避免与点击冲突
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      // 移动端需要按住 5px 距离才开始拖拽，并且延迟 200ms，避免与滚动冲突
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {})
  );
  // 添加 localNodes 状态，实现即时 UI 更新
  const [localNodes, setLocalNodes] = useState<NodeDetail[]>(nodes);
  const [columnWidths, setColumnWidths] = useState<NodeColumnWidths | null>(() => readNodeColumnWidths());
  const [defaultLayout, setDefaultLayout] = useState<NodeColumnWidths | null>(null);
  const [sortColumnWidth, setSortColumnWidth] = useState(() => readNodeColumnLayout()?.sort ?? NODE_SORT_COLUMN_WIDTH);
  const columnResizeLock = React.useRef(false);
  const [currentPage, setCurrentPage] = useState(1);
  const defaultPageSize = useAdminDefaultPageSize();
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const pageSizeCustomized = React.useRef(false);
  const totalPages = Math.max(
    1,
    Math.ceil(localNodes.length / pageSize),
  );
  const visiblePage = Math.min(currentPage, totalPages);
  const pageStart = (visiblePage - 1) * pageSize;
  const visibleNodes = localNodes.slice(
    pageStart,
    pageStart + pageSize,
  );
  const tableWrapRef = React.useRef<HTMLDivElement>(null);
  const [billingStack, setBillingStack] = useState(false);
  const billingLayoutKey = visibleNodes
    .map(
      (node) =>
        `${node.uuid}:${node.price}:${node.billing_cycle}:${node.expired_at}:${node.currency}`,
    )
    .join("|");

  const layoutMode = columnWidths ? "custom" : "default";
  const activeWidths = columnWidths ?? defaultLayout;
  const activeSort = columnWidths ? sortColumnWidth : NODE_SORT_COLUMN_WIDTH;

  React.useEffect(() => {
    if (isMobile) return;
    const root = tableWrapRef.current;
    if (!root) return;
    const fit = () => {
      if (columnResizeLock.current) return;
      const width = nodeListTableWidth(root);
      if (layoutMode === "custom") {
        setColumnWidths((current) => {
          if (!current) return current;
          return fitNodeColumnWidths(current, width, sortColumnWidth);
        });
        return;
      }
      const next = defaultNodeColumnWidths(width, NODE_SORT_COLUMN_WIDTH);
      setDefaultLayout((current) => (sameNodeColumnWidths(current, next) ? current : next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(root);
    return () => observer.disconnect();
  }, [isMobile, sortColumnWidth, layoutMode]);

  React.useEffect(() => {
    if (isMobile) return;
    const root = tableWrapRef.current;
    if (!root) return;
    const update = () => {
      setBillingStack(nodeBillingTagsNeedStack(root));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    const table = root.querySelector("table");
    if (table) observer.observe(table);
    void document.fonts?.ready.then(update);
    return () => observer.disconnect();
  }, [isMobile, billingLayoutKey]);

  React.useEffect(() => {
    setLocalNodes(nodes);
  }, [nodes]);
  React.useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);
  React.useEffect(() => {
    if (pageSizeCustomized.current) return;
    setPageSize(defaultPageSize);
    setCurrentPage(1);
  }, [defaultPageSize]);
  const handleDragStart = () => {
    if (!reorderEnabled) return;
    document.documentElement.classList.add("admin-node-dnd-dragging");
    if ("vibrate" in navigator) {
      navigator.vibrate(50);
    }
  };

  const stopNodeListDragging = () => {
    document.documentElement.classList.remove("admin-node-dnd-dragging");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    stopNodeListDragging();
    if (!reorderEnabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localNodes.findIndex((node) => node.uuid === active.id);
    if (oldIndex < 0) return;

    let newIndex = localNodes.findIndex((node) => node.uuid === over.id);
    let destinationPage = visiblePage;
    if (over.id === PREVIOUS_PAGE_DROP_ID && visiblePage > 1) {
      destinationPage = visiblePage - 1;
      newIndex = destinationPage * pageSize - 1;
    } else if (over.id === NEXT_PAGE_DROP_ID && visiblePage < totalPages) {
      destinationPage = visiblePage + 1;
      newIndex = (destinationPage - 1) * pageSize;
    } else if (newIndex >= 0) {
      const translated = active.rect.current.translated;
      const pointerY = translated
        ? translated.top + translated.height / 2
        : over.rect.top + over.rect.height / 2;
      newIndex = nodeListReorderIndex(
        oldIndex,
        newIndex,
        nodeListInsertAfter(pointerY, over.rect.top, over.rect.height),
      );
    }
    if (newIndex < 0 || newIndex === oldIndex) return;

    const reorderedNodes = arrayMove(localNodes, oldIndex, newIndex);

    // 立即更新 UI
    setLocalNodes(reorderedNodes);
    setCurrentPage(destinationPage);

    if ("vibrate" in navigator) {
      navigator.vibrate([30, 10, 30]);
    }

    try {
      const orderData = reorderedNodes.reduce((acc, node, index) => {
        acc[node.uuid] = index;
        return acc;
      }, {} as Record<string, number>);

      await fetch("/api/admin/client/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });
      // 不再调用 refresh，以免覆盖本地排序
    } catch {
      toast.error(t("admin.nodeTable.errorRefreshNodeList"));
    }
  };

  const startColumnResize = (column: NodeColumnKey, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const partner = NODE_COLUMN_KEYS[NODE_COLUMN_KEYS.indexOf(column) + 1];
    if (!partner) return;
    event.preventDefault();
    event.stopPropagation();
    const row = event.currentTarget.closest("tr");
    const cells = row ? [...row.querySelectorAll("th")] : [];
    if (cells.length !== NODE_COLUMN_KEYS.length + 1) return;
    const measured = {} as NodeColumnWidths;
    const measuredSort = Math.max(44, Math.round(cells[0].getBoundingClientRect().width));
    NODE_COLUMN_KEYS.forEach((key, index) => {
      measured[key] = Math.round(cells[index + 1].getBoundingClientRect().width);
    });
    const container = nodeListTableWidth(tableWrapRef.current);
    const baseline = container > 0 ? fitNodeColumnWidths(measured, container, measuredSort) : measured;
    const origin = baseline[column];
    const startX = event.clientX;
    const handle = event.currentTarget;
    const rightKeys = NODE_COLUMN_KEYS.slice(NODE_COLUMN_KEYS.indexOf(column) + 1);
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* The pointer is only capturable during a real drag. */
    }
    columnResizeLock.current = true;
    setSortColumnWidth(measuredSort);
    handle.classList.add("is-active");
    document.body.classList.add("admin-node-col-resizing");
    const widthsAt = (clientX: number) => {
      const limits = NODE_COLUMN_MIN;
      let desired = Math.max(limits[column], clampNodeColumnWidth(column, origin + clientX - startX));
      let delta = desired - origin;
      const next = { ...baseline };
      if (delta > 0) {
        let remain = delta;
        for (const key of rightKeys) {
          const spare = Math.max(0, baseline[key] - limits[key]);
          const take = Math.min(spare, remain);
          next[key] = baseline[key] - take;
          remain -= take;
        }
        next[column] = origin + (delta - remain);
      } else {
        const shrink = Math.min(-delta, Math.max(0, origin - limits[column]));
        next[column] = origin - shrink;
        next[partner] = baseline[partner] + shrink;
      }
      return next;
    };
    const move = (ev: PointerEvent) => setColumnWidths(widthsAt(ev.clientX));
    const end = (ev: PointerEvent) => {
      columnResizeLock.current = false;
      const root = tableWrapRef.current;
      const fitted = root
        ? fitNodeColumnWidths(widthsAt(ev.clientX), nodeListTableWidth(root), measuredSort)
        : widthsAt(ev.clientX);
      setSortColumnWidth(measuredSort);
      setColumnWidths(fitted);
      writeNodeColumnWidths(fitted, measuredSort);
      handle.classList.remove("is-active");
      document.body.classList.remove("admin-node-col-resizing");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  const resetColumnWidths = () => {
    clearNodeColumnWidths();
    setColumnWidths(null);
    setSortColumnWidth(NODE_SORT_COLUMN_WIDTH);
  };

  const resizeHandle = (column: NodeColumnKey) => (
    <span
      className="admin-node-col-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("admin.nodeTable.resizeColumn", "拖动调整列宽")}
      onPointerDown={(event) => startColumnResize(column, event)}
    />
  );

  return (
    <div className="admin-responsive-table-wrap admin-node-list-dnd-wrap overflow-x-auto">
      <DndContext
        sensors={sensors}
        collisionDetection={nodeListCollisionDetection}
        autoScroll={NODE_LIST_AUTO_SCROLL}
        measuring={NODE_LIST_MEASURING}
        modifiers={NODE_LIST_DND_MODIFIERS}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={stopNodeListDragging}
      >
        {isMobile ? (
          <SortableContext
            items={visibleNodes.map((node) => node.uuid)}
            strategy={NODE_LIST_SORTING_STRATEGY}
          >
            <AdminMobileCardStack>
              {visibleNodes.map((node) => (
                <SortableMobileCard
                  key={node.uuid}
                  node={node}
                  settings={settings}
                  online={nodeOnlineState(available, onlineSet, node.uuid)}
                  reorderEnabled={reorderEnabled}
                />
              ))}
            </AdminMobileCardStack>
          </SortableContext>
        ) : (
        <div ref={tableWrapRef}>
        <Table
          className={`admin-responsive-table admin-node-table min-w-[1172px] table-fixed text-sm${billingStack ? " admin-node-billing-stack" : ""}${activeWidths ? " is-column-sized" : ""}`}
        >
          {activeWidths ? (
            <colgroup>
              <col style={{ width: activeSort }} />
              {NODE_COLUMN_KEYS.map((key) => (
                <col
                  key={key}
                  style={{ width: activeWidths[key] }}
                />
              ))}
            </colgroup>
          ) : null}
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]" style={activeWidths ? nodeColumnStyle(activeSort) : undefined}>
                <span className="sr-only">{t("common.sort", "排序")}</span>
              </TableHead>
              <TableHead className="w-[170px]" style={nodeColumnStyle(activeWidths?.name)}>
                {t("admin.nodeTable.name")}
                {resizeHandle("name")}
              </TableHead>
              <TableHead className="w-[170px]" style={nodeColumnStyle(activeWidths?.network)}>
                {t("admin.nodeTable.network", "网络")}
                {resizeHandle("network")}
              </TableHead>
              <TableHead
                className="w-[64px] text-center"
                style={nodeColumnStyle(activeWidths?.agent)}
              >
                {t("admin.nodeTable.agent", "Agent")}
                {resizeHandle("agent")}
              </TableHead>
              <TableHead className="w-[64px]" style={nodeColumnStyle(activeWidths?.group)}>
                {t("common.group", "分组")}
                {resizeHandle("group")}
              </TableHead>
              <TableHead className="w-[64px]" style={nodeColumnStyle(activeWidths?.remark)}>
                {t("common.remark", "备注")}
                {resizeHandle("remark")}
              </TableHead>
              <TableHead className="w-[80px]" style={nodeColumnStyle(activeWidths?.billing)}>
                {t("admin.nodeTable.billing")}
                {resizeHandle("billing")}
              </TableHead>
              <TableHead className="w-[116px]" style={nodeColumnStyle(activeWidths?.tags)}>
                {t("admin.nodeTable.tags", "标签")}
                {resizeHandle("tags")}
              </TableHead>
              <TableHead className="w-[308px]" style={nodeColumnStyle(activeWidths?.action)}>
                <span className="admin-node-action-head">
                  <span>{t("common.action", "操作")}</span>
                  <button
                    type="button"
                    className="admin-node-col-reset"
                    onClick={resetColumnWidths}
                  >
                    <RefreshCw size="14" />
                    {t("admin.nodeTable.resetColumnWidths", "重置列宽")}
                  </button>
                </span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <SortableContext
              items={visibleNodes.map((node) => node.uuid)}
              strategy={NODE_LIST_SORTING_STRATEGY}
            >
              {visibleNodes.map((node) => (
                <SortableRow
                  key={node.uuid}
                  node={node}
                  settings={settings}
                  online={nodeOnlineState(available, onlineSet, node.uuid)}
                  reorderEnabled={reorderEnabled}
                />
              ))}
            </SortableContext>
          </TableBody>
        </Table>
        </div>
        )}
      <AdminPagination
        page={visiblePage}
        total={localNodes.length}
        onPageChange={setCurrentPage}
        pageSize={pageSize}
        onPageSizeChange={(value) => {
          pageSizeCustomized.current = true;
          setPageSize(value);
          setCurrentPage(1);
        }}
        previousDropId={PREVIOUS_PAGE_DROP_ID}
        nextDropId={NEXT_PAGE_DROP_ID}
        showSummary={false}
      />
        <DragOverlay dropAnimation={null} zIndex={1600}>
          <NodeListDragPreview nodes={localNodes} />
        </DragOverlay>
      </DndContext>
    </div>
  );
};

type Platform = "linux" | "windows" | "macos" | "docker";

function InstallPlatformToggle({
  value,
  onChange,
  className,
}: {
  value: Platform;
  onChange: (value: Platform) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <ToggleButtonGroup
      className={className}
      exclusive
      size="small"
      value={value}
      aria-label={t("admin.nodeTable.deployPlatform", "部署平台")}
      onChange={(_event, next: Platform | null) => next && onChange(next)}
      sx={{
        "& .MuiToggleButton-root.Mui-selected": {
          bgcolor: "rgba(7, 141, 238, 0.12)",
          color: "#078dee",
          boxShadow: "inset 0 0 0 1px rgba(7, 141, 238, 0.48)",
          "&:hover": { bgcolor: "rgba(7, 141, 238, 0.12)" },
        },
      }}
    >
      <ToggleButton disableRipple value="linux">Linux</ToggleButton>
      <ToggleButton disableRipple value="windows">Windows</ToggleButton>
      <ToggleButton disableRipple value="macos">macOS</ToggleButton>
      <ToggleButton disableRipple value="docker">Docker</ToggleButton>
    </ToggleButtonGroup>
  );
}

type TrafficUsage = { up: number; down: number };
type SignedTrafficUsage = { up: number; down: number };
type TrafficCalibrationHistory = {
  calibration_id: string;
  target: TrafficUsage;
  adjustment: SignedTrafficUsage;
  operator?: string;
  created_at: string;
};
type TrafficCalibrationSnapshot = {
  client: string;
  cycle: string;
  cycle_start: string;
  cycle_end: string;
  raw: TrafficUsage;
  adjustment: SignedTrafficUsage;
  effective: TrafficUsage;
  history: TrafficCalibrationHistory[];
  history_complete?: boolean;
};

const trafficInputPattern = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib|tb|tib|pb|pib)?\s*$/i;

function parseTrafficInput(value: string): number | null {
  if (!trafficInputPattern.test(value)) return null;
  const bytes = stringToBytes(value);
  if (!Number.isSafeInteger(bytes) || bytes < 0) return null;
  return bytes;
}

function formatSignedTraffic(value: number): string {
  if (value === 0) return formatBytes(0);
  return `${value > 0 ? "+" : "-"}${formatBytes(Math.abs(value))}`;
}

const ActionButtons = ({ node, settings }: { node: NodeDetail, settings: any }) => {
  const { t } = useTranslation();
  const { ensureEnabled } = useRemoteManagementGate();
  const [dialog, setDialog] = React.useState<"install" | "edit" | "billing" | "traffic" | "token" | "delete" | null>(null);
  const closeDialog = () => setDialog(null);
  return (
    <div className="flex h-10 items-center justify-start gap-1 admin-node-actions max-md:w-full">
      <IconButton variant="ghost" title={t("admin.nodeTable.installCommand")} onClick={() => setDialog("install")}>
        <Download size="18" />
      </IconButton>
      <IconButton
        title={t("terminal.title")}
        variant="ghost"
        onClick={() => {
          if (!ensureEnabled()) return;
          if (!openRemoteTerminal(node.uuid)) toast.error("浏览器阻止了远程管理窗口");
        }}
      >
        <Terminal size="18" />
      </IconButton>
      <IconButton variant="ghost" title={t("admin.nodeEdit.editInfo", "编辑信息")} onClick={() => setDialog("edit")}>
        <Pencil size="18" />
      </IconButton>
      <IconButton variant="ghost" title={t("admin.nodeTable.billing", "账单")} onClick={() => setDialog("billing")}>
        <CircleDollarSign size="18" />
      </IconButton>
      <IconButton variant="ghost" title={t("admin.nodeTable.trafficCalibration.title")} onClick={() => setDialog("traffic")}>
        <Gauge size="18" />
      </IconButton>
      <IconButton variant="ghost" title={t("admin.nodeTable.rotateToken")} onClick={() => setDialog("token")}>
        <RefreshCw size="18" />
      </IconButton>
      <IconButton variant="ghost" color="red" title={t("delete")} onClick={() => setDialog("delete")}>
        <Trash2Icon size="18" />
      </IconButton>
      {dialog === "install" ? <GenerateCommandButton node={node} settings={settings} initiallyOpen onClose={closeDialog} /> : null}
      {dialog === "edit" ? <EditButton node={node} initiallyOpen onClose={closeDialog} /> : null}
      {dialog === "billing" ? <BillingButton node={node} initiallyOpen onClose={closeDialog} /> : null}
      {dialog === "traffic" ? <TrafficCalibrationButton node={node} initiallyOpen onClose={closeDialog} /> : null}
      {dialog === "token" ? <RotateTokenButton node={node} initiallyOpen onClose={closeDialog} /> : null}
      {dialog === "delete" ? <DeleteButton node={node} initiallyOpen onClose={closeDialog} /> : null}
    </div>
  );
};

function TrafficCalibrationButton({ node, initiallyOpen = false, onClose }: { node: NodeDetail; initiallyOpen?: boolean; onClose?: () => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<TrafficCalibrationSnapshot | null>(null);
  const [targetUp, setTargetUp] = useState("");
  const [targetDown, setTargetDown] = useState("");
  const requestRef = React.useRef<AbortController | null>(null);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  const prepareCalibration = async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    setReason("");
    setAvailable(true);
    setSnapshot(null);
    try {
      const response = await fetch(`/api/admin/client/${node.uuid}/traffic-calibration`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      const data = payload?.data;
      const nextAvailable = data?.available !== false;
      setAvailable(nextAvailable);
      setReason(
        data?.history_complete === false
          ? t("admin.nodeTable.trafficCalibration.historyIncomplete")
          : (data?.reason || ""),
      );
      if (data?.snapshot) {
        const next = data.snapshot as TrafficCalibrationSnapshot;
        setSnapshot(next);
        setTargetUp(formatBytes(next.effective.up));
        setTargetDown(formatBytes(next.effective.down));
      }
      setOpen(true);
    } catch (cause: unknown) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setOpen(true);
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  };

  const saveCalibration = async () => {
    const up = parseTrafficInput(targetUp);
    const down = parseTrafficInput(targetDown);
    if (up === null || down === null) {
      setError(t("admin.nodeTable.trafficCalibration.invalidValue"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/client/${node.uuid}/traffic-calibration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_up: up,
          target_down: down,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      const next = payload?.data?.snapshot as TrafficCalibrationSnapshot | undefined;
      if (!next) throw new Error(t("admin.nodeTable.trafficCalibration.invalidResponse"));
      setSnapshot(next);
      setTargetUp(formatBytes(next.effective.up));
      setTargetDown(formatBytes(next.effective.down));
      setAvailable(true);
      setReason("");
      toast.success(t("admin.nodeTable.trafficCalibration.saved"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (initiallyOpen) void prepareCalibration();
  }, [initiallyOpen]);

  const summaryItems = snapshot
    ? [
        [t("admin.nodeTable.trafficCalibration.raw"), snapshot.raw],
        [t("admin.nodeTable.trafficCalibration.adjustment"), snapshot.adjustment],
        [t("admin.nodeTable.trafficCalibration.effective"), snapshot.effective],
      ]
    : [];
  const cycleLabel = snapshot
    ? formatTrafficCalibrationCycleRange(snapshot.cycle_start, {
        day: node.traffic_reset_day,
        time: node.traffic_reset_time,
        timezone: node.traffic_reset_timezone,
        language: i18n.resolvedLanguage || i18n.language,
      })
    : null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) void prepareCalibration();
        else {
          setOpen(false);
          onClose?.();
        }
      }}
    >
      {initiallyOpen ? null : <Dialog.Trigger>
        <IconButton
          variant="ghost"
          disabled={loading}
          title={t("admin.nodeTable.trafficCalibration.title")}
        >
          <Gauge size="18" className={loading ? "animate-pulse" : undefined} />
        </IconButton>
      </Dialog.Trigger>}
      {open ? <AppDialogContent maxWidth="720px" className="max-h-[88vh] overflow-y-auto">
        <Dialog.Title>{t("admin.nodeTable.trafficCalibration.title")}</Dialog.Title>
        <Dialog.Description>
          <Trans
            i18nKey="admin.nodeTable.trafficCalibration.description"
            values={{ name: node.name }}
            components={{ strong: <strong className="font-semibold" /> }}
          />
        </Dialog.Description>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : (
          <Flex direction="column" gap="4" mt="4">
            {(reason || !available) && (
              <Callout.Root color="amber" role="alert">
                <Callout.Text>{reason || t("admin.nodeTable.trafficCalibration.resetDayRequired")}</Callout.Text>
              </Callout.Root>
            )}
            {error && (
              <Callout.Root color="red" role="alert">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            {snapshot && (
              <>
                <div className="flex flex-col gap-1 rounded-md border border-[var(--gray-a5)] bg-[var(--gray-a2)] px-3 py-2.5 md:flex-row md:items-center md:justify-between md:gap-4">
                  <Badge color="blue" variant="soft" className="w-fit">
                    {t("admin.nodeTable.trafficCalibration.currentCycle")}
                  </Badge>
                  {cycleLabel && (
                    <div className="min-w-0 md:text-right">
                      <Text as="div" size="2" weight="bold">{cycleLabel.timezone}</Text>
                      <Text as="div" size="2" color="gray">
                        <span className="whitespace-nowrap">{cycleLabel.start}</span>
                        {" - "}
                        <span className="whitespace-nowrap">{cycleLabel.next}</span>
                      </Text>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {summaryItems.map(([label, usage]) => {
                    const value = usage as TrafficUsage & SignedTrafficUsage;
                    const signed = label === t("admin.nodeTable.trafficCalibration.adjustment");
                    return (
                      <div key={label as string} className="min-w-0 border-l-2 border-[var(--accent-7)] pl-3">
                        <Text as="div" size="2" weight="bold">{label as string}</Text>
                        <Text as="div" size="2" color="gray" className="mt-1 break-words">
                          {t("admin.nodeTable.trafficCalibration.upload")}: {signed ? formatSignedTraffic(value.up) : formatBytes(value.up)}
                        </Text>
                        <Text as="div" size="2" color="gray" className="break-words">
                          {t("admin.nodeTable.trafficCalibration.download")}: {signed ? formatSignedTraffic(value.down) : formatBytes(value.down)}
                        </Text>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold">
                    {t("admin.nodeTable.trafficCalibration.targetUp")}
                    <TextField.Root value={targetUp} onChange={(event) => setTargetUp(event.target.value)} placeholder="10 GB" />
                  </label>
                  <label className="flex min-w-0 flex-col gap-2 text-sm font-semibold">
                    {t("admin.nodeTable.trafficCalibration.targetDown")}
                    <TextField.Root value={targetDown} onChange={(event) => setTargetDown(event.target.value)} placeholder="10 GB" />
                  </label>
                </div>

                <Callout.Root color="blue" size="1">
                  <Callout.Text>{t("admin.nodeTable.trafficCalibration.syncNotice")}</Callout.Text>
                </Callout.Root>

                <div>
                  <Text as="div" size="2" weight="bold" mb="2">
                    {t("admin.nodeTable.trafficCalibration.history")}
                  </Text>
                  {snapshot.history?.length ? (
                    <div className="admin-responsive-table-wrap overflow-hidden rounded-md border border-[var(--gray-a5)]">
                      <Table container={false} className="admin-responsive-table admin-calibration-history min-w-[560px] text-left text-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("admin.nodeTable.trafficCalibration.time")}</TableHead>
                            <TableHead>{t("admin.nodeTable.trafficCalibration.targetUp")}</TableHead>
                            <TableHead>{t("admin.nodeTable.trafficCalibration.targetDown")}</TableHead>
                            <TableHead>{t("admin.nodeTable.trafficCalibration.change")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {snapshot.history.map((item) => (
                            <TableRow key={item.calibration_id}>
                              <TableCell data-label={t("admin.nodeTable.trafficCalibration.time")}>{new Date(item.created_at).toLocaleString()}</TableCell>
                              <TableCell data-label={t("admin.nodeTable.trafficCalibration.targetUp")}>{formatBytes(item.target.up)}</TableCell>
                              <TableCell data-label={t("admin.nodeTable.trafficCalibration.targetDown")}>{formatBytes(item.target.down)}</TableCell>
                              <TableCell data-label={t("admin.nodeTable.trafficCalibration.change")}>↑ {formatSignedTraffic(item.adjustment.up)} / ↓ {formatSignedTraffic(item.adjustment.down)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <Text size="2" color="gray">{t("admin.nodeTable.trafficCalibration.noHistory")}</Text>
                  )}
                </div>
              </>
            )}

            <Flex gap="2" justify="end" wrap="wrap">
              <Dialog.Close>
                <Button variant="soft">{t("admin.nodeTable.cancel")}</Button>
              </Dialog.Close>
              <Button disabled={!snapshot || saving} onClick={() => void saveCalibration()}>
                {saving ? t("common.loading") : t("admin.nodeTable.trafficCalibration.save")}
              </Button>
            </Flex>
          </Flex>
        )}
      </AppDialogContent> : null}
    </Dialog.Root>
  );
}

export default NodeDetailsPage;
function DeleteButton({ node, initiallyOpen = false, onClose }: { node: NodeDetail; initiallyOpen?: boolean; onClose?: () => void }) {
  const { t } = useTranslation();
  const { refresh } = useNodeDetails();
  const [open, setOpen] = React.useState(initiallyOpen);
  const [deleting, setDeleting] = React.useState(false);
  const handleDelete = async () => {
    try {
      setDeleting(true);
      await fetch(`/api/admin/client/${node.uuid}/remove`, {
        method: "POST",
      });
      toast.success(t("admin.nodeTable.deleteSuccess", { name: node.name }));
      setOpen(false);
      onClose?.();
      refresh();
    } catch (error) {
      toast.error(
        t("admin.nodeTable.deleteFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      setOpen(next);
      if (!next) onClose?.();
    }}>
      {initiallyOpen ? null : <Dialog.Trigger>
        <IconButton variant="ghost" color="red" title={t("delete")}>
          <Trash2Icon size="18" />
        </IconButton>
      </Dialog.Trigger>}
      <AppDialogContent className="admin-install-dialog">
        <Dialog.Title>{t("delete")}</Dialog.Title>
        <Dialog.Description>
          <Text as="span" weight="bold">{node.name}</Text>{" "}
          {t("admin.nodeTable.confirmDeleteQuestion")}
        </Dialog.Description>
        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft">{t("admin.nodeTable.cancel")}</Button>
          </Dialog.Close>
          <Button disabled={deleting} color="red" onClick={handleDelete}>
            {t("admin.nodeTable.confirmDelete")}
          </Button>
        </Flex>
      </AppDialogContent>
    </Dialog.Root>
  );
}

function useAccountPasskeyAvailable() {
  const [passkeyAvailable, setPasskeyAvailable] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/account/passkeys")
      .then((response) => response.json())
      .then((body) => {
        const items = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        if (!cancelled) setPasskeyAvailable(items.length > 0);
      })
      .catch(() => {
        if (!cancelled) setPasskeyAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return passkeyAvailable;
}

function NodeIdentityAuthDialog({
  otpFieldId,
  otpFieldRef,
  otpInput,
  onOtpChange,
  otpInvalid,
  submitting,
  onDismiss,
  onConfirmOtp,
  onConfirmPasskey,
}: {
  otpFieldId: string;
  otpFieldRef: React.RefObject<HTMLInputElement | null>;
  otpInput: string;
  onOtpChange: (value: string) => void;
  otpInvalid: boolean;
  submitting: boolean;
  onDismiss: () => void;
  onConfirmOtp: () => void;
  onConfirmPasskey: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const passkeyAvailable = useAccountPasskeyAvailable();
  const [passkeyBusy, setPasskeyBusy] = React.useState(false);
  const busy = submitting || passkeyBusy;

  return (
    <Dialog.Root
      open
      zIndex={1400}
      onOpenChange={(nextOpen) => {
        if (nextOpen) return;
        onDismiss();
      }}
    >
      <AppDialogContent className="admin-install-dialog">
        <Dialog.Title>
          {t("admin.nodeTable.identityAuthTitle", "身份验证")}
        </Dialog.Title>
        <Dialog.Description>
          {t("admin.nodeTable.identityAuthDescription", "请输入身份验证器中的 6 位动态口令")}
        </Dialog.Description>
        <form
          autoComplete="on"
          onSubmit={(event) => {
            event.preventDefault();
            if (otpInput.length === 6 && !busy) {
              onConfirmOtp();
            }
          }}
        >
          <TextField.Root
            ref={otpFieldRef}
            id={otpFieldId}
            name="one-time-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={6}
            color={otpInvalid ? "red" : undefined}
            disabled={busy}
            value={otpInput}
            onChange={(event) =>
              onOtpChange(event.currentTarget.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder={t("admin.nodeTable.identityAuthInput", "6 位动态口令")}
            aria-label={t("admin.nodeTable.identityAuthInput", "6 位动态口令")}
          />
          {otpInvalid ? (
            <Text size="2" color="red" className="mt-2" role="alert">
              {t("admin.nodeTable.twoFactorInvalid", "验证码错误")}
            </Text>
          ) : null}
          <Flex justify="end" gap="2" mt="4" wrap="wrap">
            <Button
              type="button"
              variant="soft"
              disabled={busy}
              onClick={onDismiss}
            >
              {t("admin.nodeTable.cancel")}
            </Button>
            {passkeyAvailable ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setPasskeyBusy(true);
                  void Promise.resolve(onConfirmPasskey()).finally(() => setPasskeyBusy(false));
                }}
              >
                {t("login.passkey", "使用通行密钥")}
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={otpInput.length !== 6 || busy}
            >
              {t("common.confirm", "确认")}
            </Button>
          </Flex>
        </form>
      </AppDialogContent>
    </Dialog.Root>
  );
}

function RotateTokenButton({ node, initiallyOpen = false, onClose }: { node: NodeDetail; initiallyOpen?: boolean; onClose?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(initiallyOpen);
  const [rotating, setRotating] = React.useState(false);
  const [needTwoFactor, setNeedTwoFactor] = React.useState(false);
  const [twoFactorInvalid, setTwoFactorInvalid] = React.useState(false);
  const [otpInput, setOtpInput] = React.useState("");
  const otpFieldRef = React.useRef<HTMLInputElement>(null);

  const resetTwoFactor = () => {
    setNeedTwoFactor(false);
    setTwoFactorInvalid(false);
    setOtpInput("");
  };

  const closeDialog = () => {
    setOpen(false);
    setRotating(false);
    resetTwoFactor();
    onClose?.();
  };

  React.useEffect(() => {
    if (!needTwoFactor || rotating) return;
    const timer = window.setTimeout(() => otpFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [needTwoFactor, rotating, twoFactorInvalid]);

  const handleRotate = async (auth: { twoFactorCode?: string; ceremony_id?: string; credential?: unknown } = {}) => {
    try {
      setRotating(true);
      setTwoFactorInvalid(false);
      await rotateClientToken(node.uuid, auth);
      toast.success(t("admin.nodeTable.rotateTokenSuccess", { name: node.name }));
      closeDialog();
    } catch (error) {
      if (isClientTokenTwoFactorRequired(error)) {
        setNeedTwoFactor(true);
        setTwoFactorInvalid(false);
        return;
      }
      if (isClientTokenTwoFactorInvalid(error)) {
        setNeedTwoFactor(true);
        setTwoFactorInvalid(true);
        setOtpInput("");
        return;
      }
      const cancelled = passkeyUnavailableMessage(error, "") === "cancelled";
      toast.error(
        cancelled
          ? t("account.passkey_cancelled")
          : t("admin.nodeTable.rotateTokenFailed", {
              error: localizeTokenRotationError(
                error instanceof Error ? error.message : String(error),
              ),
            }),
      );
    } finally {
      setRotating(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      disableEnforceFocus={needTwoFactor}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setOpen(true);
          return;
        }
        closeDialog();
      }}
    >
      {initiallyOpen ? null : <Dialog.Trigger>
        <IconButton variant="ghost" title={t("admin.nodeTable.rotateToken")}>
          <RefreshCw size="18" />
        </IconButton>
      </Dialog.Trigger>}
      <AppDialogContent className="admin-install-dialog">
        <Dialog.Title>{t("admin.nodeTable.rotateToken")}</Dialog.Title>
        <Dialog.Description>
          <Text as="span" weight="bold">{node.name}</Text>
        </Dialog.Description>
        <Text as="p" size="2" mt="3">
          {t("admin.nodeTable.rotateTokenDescription")}
        </Text>
        <Text as="p" size="2" mt="2" color="gray">
          {t("admin.nodeTable.rotateTokenInstructions")}
        </Text>
        <Flex justify="end" gap="2" mt="4">
          <Dialog.Close>
            <Button variant="soft" disabled={rotating}>
              {t("admin.nodeTable.cancel")}
            </Button>
          </Dialog.Close>
          <Button disabled={rotating} onClick={() => void handleRotate()}>
            {t("admin.nodeTable.confirmRotateToken")}
          </Button>
        </Flex>
      </AppDialogContent>
      {needTwoFactor ? (
        <NodeIdentityAuthDialog
          otpFieldId="admin-node-rotate-otp"
          otpFieldRef={otpFieldRef}
          otpInput={otpInput}
          onOtpChange={setOtpInput}
          otpInvalid={twoFactorInvalid}
          submitting={rotating}
          onDismiss={resetTwoFactor}
          onConfirmOtp={() => {
            void handleRotate({ twoFactorCode: otpInput });
          }}
          onConfirmPasskey={async () => {
            try {
              const assertion = await confirmAdminPasskey();
              await handleRotate({
                ceremony_id: assertion.ceremony_id,
                credential: assertion.credential,
              });
            } catch (error) {
              const cancelled = passkeyUnavailableMessage(error, "") === "cancelled";
              toast.error(
                cancelled
                  ? t("account.passkey_cancelled")
                  : error instanceof Error
                    ? error.message
                    : String(error),
              );
            }
          }}
        />
      ) : null}
    </Dialog.Root>
  );
}

type InstallOptions = {
  enableRemoteControl: boolean;
  disableAutoUpdate: boolean;
  ignoreUnsafeCert: boolean;
  memoryIncludeCache: boolean;
  getIpAddrFromNic: boolean;
  enableGpu: boolean;
  ghproxy: string;
  dir: string;
  serviceName: string;
  includeNics: string;
  excludeNics: string;
  includeMountpoints: string;
  interval: string;
  monthRotate: string;
  monthRotateTime: string;
  monthRotateTimezone: string;
};

type DeploymentProfilePayload = {
  platform: Platform;
  enable_remote_control: boolean;
  disable_auto_update: boolean;
  ignore_unsafe_cert: boolean;
  get_ip_addr_from_nic: boolean;
  memory_include_cache: boolean;
  enable_gpu: boolean;
  enable_ghproxy: boolean;
  ghproxy: string;
  enable_custom_dir: boolean;
  dir: string;
  enable_custom_service_name: boolean;
  service_name: string;
  enable_include_nics: boolean;
  include_nics: string;
  enable_exclude_nics: boolean;
  exclude_nics: string;
  enable_include_mountpoints: boolean;
  include_mountpoints: string;
  enable_interval: boolean;
  interval: number;
  enable_month_rotate: boolean;
  month_rotate: number;
  month_rotate_time: string;
  month_rotate_timezone: string;
};

type DeploymentProfileResponse = {
  profile: DeploymentProfilePayload;
  saved?: boolean;
  delivery?: "saved" | "sent" | "applied" | "failed" | "agent_upgrade_required";
  delivery_state?: DeploymentDeliveryState;
  runtime_changed?: boolean;
};

type DeploymentDeliveryState = {
  revision: number;
  status: "saved" | "sent" | "applied" | "failed";
  error?: string;
  saved_at?: string;
  updated_at?: string;
  sent_at?: string;
  finished_at?: string;
};

function GenerateCommandButton({ node, settings, initiallyOpen = false, onClose }: { node: NodeDetail; settings: any; initiallyOpen?: boolean; onClose?: () => void }) {
  const { t } = useTranslation();
  const { refresh } = useNodeDetails();
  const isMobile = useIsMobile();
  const configuredResetDay = Number(node.traffic_reset_day);
  const initialResetDay =
    Number.isInteger(configuredResetDay) &&
    configuredResetDay >= 1 &&
    configuredResetDay <= 31
      ? String(configuredResetDay)
      : "";
  const initialResetTime = normalizeTrafficResetTime(node.traffic_reset_time);
  const initialResetTimezone = normalizeTrafficResetTimezone(node.traffic_reset_timezone);
  const [selectedPlatform, setSelectedPlatform] =
    React.useState<Platform>("linux");
  const [installOptions, setInstallOptions] = React.useState<InstallOptions>({
    enableRemoteControl: false,
    disableAutoUpdate: false,
    ignoreUnsafeCert: false,
    memoryIncludeCache: false,
    getIpAddrFromNic: false,
    enableGpu: false,
    ghproxy: "",
    dir: "",
    serviceName: "",
    includeNics: "",
    excludeNics: "",
    includeMountpoints: "",
    interval: "",
    monthRotate: initialResetDay,
    monthRotateTime: initialResetTime,
    monthRotateTimezone: initialResetTimezone,
  });

  const [enableGhproxy, setEnableGhproxy] = React.useState(false);
  const [enableCustomDir, setEnableCustomDir] = React.useState(false);
  const [enableCustomServiceName, setEnableCustomServiceName] =
    React.useState(false);
  const [enableIncludeNics, setEnableIncludeNics] = React.useState(false);
  const [enableExcludeNics, setEnableExcludeNics] = React.useState(false);
  const [enableIncludeMountpoints, setEnableIncludeMountpoints] =
    React.useState(false);
  const [enableInterval, setEnableInterval] = React.useState(false);
  const [enableMonthRotate, setEnableMonthRotate] = React.useState(
    initialResetDay !== "",
  );
  const [open, setOpen] = React.useState(initiallyOpen);
  const [dialogTab, setDialogTab] = React.useState<"online" | "install">("online");
  const [loadingProfile, setLoadingProfile] = React.useState(false);
  const [profileAction, setProfileAction] = React.useState<"dispatch" | "copy" | null>(null);
  const [deliveryState, setDeliveryState] = React.useState<DeploymentDeliveryState>();
  const [copyFeedback, setCopyFeedback] = React.useState<{
    kind: "success" | "warning" | "error";
    message: string;
  }>();
  const tokenSessionRef = React.useRef<ReturnType<typeof createInstallTokenSession> | null>(null);
  if (!tokenSessionRef.current) {
    tokenSessionRef.current = createInstallTokenSession();
  }
  const tokenAbortControllerRef = tokenSessionRef.current.tokenAbortControllerRef;
  const [tokenState, setTokenState] = React.useState(tokenSessionRef.current.getSnapshot());
  const [otpInput, setOtpInput] = React.useState("");
  const commandTextAreaRef = React.useRef<HTMLTextAreaElement>(null);
  const otpFieldRef = React.useRef<HTMLInputElement>(null);
  const deliveryStatus = deliveryState?.status;
  const installToken = tokenState.token;
  const tokenLoading = tokenState.loading;
  const tokenError = tokenState.error
    ? t("admin.nodeTable.tokenLoadFailed", "读取节点 Token 失败")
    : null;
  const needTwoFactor = tokenState.twoFactorOpen;
  const otpSubmitting = tokenState.submitting;
  const copyBlocked = !installCommandCopyAllowed(tokenState);

  React.useEffect(() => tokenSessionRef.current?.subscribe(setTokenState), []);

  const cancelDeployTwoFactor = () => {
    tokenAbortControllerRef.current?.abort();
    tokenAbortControllerRef.current = null;
    tokenSessionRef.current?.cancelTwoFactor();
    setOtpInput("");
    setDialogTab("online");
  };

  React.useEffect(() => {
    const session = tokenSessionRef.current;
    if (!session) return;
    if (!open) {
      session.closeDialog();
      setOtpInput("");
      setDialogTab("online");
      return;
    }
    return () => {
      session.dispose();
      setOtpInput("");
    };
  }, [node.uuid, open]);

  React.useEffect(() => {
    if (!open || dialogTab !== "install") return;
    const session = tokenSessionRef.current;
    if (!session) return;
    const snapshot = session.getSnapshot();
    if (snapshot.token || snapshot.loading || snapshot.submitting || snapshot.twoFactorOpen) {
      return;
    }
    void session.beginDeployTokenFetch(node.uuid);
  }, [dialogTab, node.uuid, open]);

  React.useEffect(() => {
    if (!needTwoFactor || otpSubmitting) return;
    const timer = window.setTimeout(() => {
      otpFieldRef.current?.focus();
      if (tokenState.twoFactorInvalid) otpFieldRef.current?.select();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [needTwoFactor, otpSubmitting, tokenState.twoFactorInvalid]);

  React.useEffect(() => {
    if (installToken) setOtpInput("");
  }, [installToken]);

  const revertTrafficResetClock = () => {
    setEnableMonthRotate((current) => {
      const next = initialResetDay !== "";
      return current === next ? current : next;
    });
    setInstallOptions((previous) => {
      if (
        previous.monthRotate === initialResetDay &&
        previous.monthRotateTime === initialResetTime &&
        previous.monthRotateTimezone === initialResetTimezone
      ) {
        return previous;
      }
      return {
        ...previous,
        monthRotate: initialResetDay,
        monthRotateTime: initialResetTime,
        monthRotateTimezone: initialResetTimezone,
      };
    });
  };

  React.useLayoutEffect(() => {
    if (open) return;
    revertTrafficResetClock();
  }, [node.uuid, initialResetDay, initialResetTime, initialResetTimezone, open]);

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoadingProfile(true);
    fetch(`/api/admin/client/${node.uuid}/deployment-profile`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error((await response.text()) || `HTTP ${response.status}`);
        }
        return response.json() as Promise<DeploymentProfileResponse>;
      })
      .then(({ profile, saved, delivery_state }) => {
        setSelectedPlatform(profile.platform || "linux");
        setInstallOptions({
          enableRemoteControl: profile.enable_remote_control,
          disableAutoUpdate: profile.disable_auto_update,
          ignoreUnsafeCert: profile.ignore_unsafe_cert,
          memoryIncludeCache: profile.memory_include_cache,
          getIpAddrFromNic: profile.get_ip_addr_from_nic,
          enableGpu: profile.enable_gpu,
          ghproxy:
            profile.ghproxy ||
            (profile.enable_ghproxy ? defaultInstallGitHubProxy(settings) : ""),
          dir: profile.dir || "",
          serviceName: profile.service_name || "",
          includeNics: profile.include_nics || "",
          excludeNics: profile.exclude_nics || "",
          includeMountpoints: profile.include_mountpoints || "",
          interval: profile.enable_interval ? String(profile.interval) : "",
          monthRotate: profile.enable_month_rotate ? String(profile.month_rotate) : "",
          monthRotateTime: normalizeTrafficResetTime(profile.month_rotate_time),
          monthRotateTimezone: normalizeTrafficResetTimezone(profile.month_rotate_timezone),
        });
        setEnableGhproxy(profile.enable_ghproxy);
        setEnableCustomDir(profile.enable_custom_dir);
        setEnableCustomServiceName(profile.enable_custom_service_name);
        setEnableIncludeNics(profile.enable_include_nics);
        setEnableExcludeNics(profile.enable_exclude_nics);
        setEnableIncludeMountpoints(profile.enable_include_mountpoints);
        setEnableInterval(profile.enable_interval);
        setEnableMonthRotate(profile.enable_month_rotate);
        setDeliveryState(saved ? delivery_state : undefined);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        toast.error(
          error instanceof Error
            ? error.message
            : t("admin.nodeTable.deploymentProfileLoadFailed", "读取部署配置失败"),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingProfile(false);
      });
    return () => controller.abort();
  }, [node.uuid, open, t]);

  React.useEffect(() => {
    if (!open || !deliveryStatus || !["saved", "sent"].includes(deliveryStatus)) {
      return;
    }
    const controller = new AbortController();
    let attempts = 0;
    const stopPolling = startVisibleInterval(() => {
      attempts += 1;
      if (attempts > 30) {
        stopPolling();
        return;
      }
      void fetch(`/api/admin/client/${node.uuid}/deployment-profile`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => response.ok ? response.json() as Promise<DeploymentProfileResponse> : undefined)
        .then((result) => {
          if (!result?.delivery_state) return;
          if (result.delivery_state.status !== deliveryStatus) refresh();
          setDeliveryState(result.delivery_state);
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      controller.abort();
      stopPolling();
    };
  }, [deliveryStatus, node.uuid, open, refresh]);

  const selectedTrafficResetDay = () => {
    if (!enableMonthRotate) return 0;
    const value = Number(installOptions.monthRotate);
    return Number.isInteger(value) && value >= 1 && value <= 31
      ? value
      : null;
  };

  const selectedInterval = () => {
    if (!enableInterval) return 0;
    const value = Number(installOptions.interval);
    return Number.isFinite(value) && value >= 1 && value <= 3600
      ? value
      : null;
  };

  const deploymentProfile = (): DeploymentProfilePayload => ({
    platform: selectedPlatform,
    enable_remote_control: installOptions.enableRemoteControl,
    disable_auto_update: installOptions.disableAutoUpdate,
    ignore_unsafe_cert: installOptions.ignoreUnsafeCert,
    get_ip_addr_from_nic: installOptions.getIpAddrFromNic,
    memory_include_cache: installOptions.memoryIncludeCache,
    enable_gpu: installOptions.enableGpu,
    enable_ghproxy: enableGhproxy,
    ghproxy: installOptions.ghproxy,
    enable_custom_dir: enableCustomDir,
    dir: installOptions.dir,
    enable_custom_service_name: enableCustomServiceName,
    service_name: installOptions.serviceName,
    enable_include_nics: enableIncludeNics,
    include_nics: installOptions.includeNics,
    enable_exclude_nics: enableExcludeNics,
    exclude_nics: installOptions.excludeNics,
    enable_include_mountpoints: enableIncludeMountpoints,
    include_mountpoints: installOptions.includeMountpoints,
    enable_interval: enableInterval,
    interval: selectedInterval() ?? 0,
    enable_month_rotate: enableMonthRotate,
    month_rotate: selectedTrafficResetDay() ?? 0,
    month_rotate_time: normalizeTrafficResetTime(installOptions.monthRotateTime),
    month_rotate_timezone: normalizeTrafficResetTimezone(installOptions.monthRotateTimezone),
  });

  const generateCommand = () => {
    const host = function () {
      if (!settings.script_domain) {
        return window.location.origin;
      }
      return normalizeOptionalServiceUrl(settings.script_domain);
    }();
    const token = installToken || "";
    let args = ["-e", host, "-t", token];
    // 根据安装选项生成参数
    if (installOptions.enableRemoteControl) {
      args.push("--enable-remote-control");
    } else {
      args.push("--enable-remote-control=false");
    }
    if (installOptions.disableAutoUpdate) {
      args.push("--disable-auto-update");
    }
    if (installOptions.ignoreUnsafeCert) {
      args.push("--ignore-unsafe-cert");
    }
    if (installOptions.memoryIncludeCache) {
      args.push("--memory-include-cache");
    }
    if (installOptions.getIpAddrFromNic) {
      args.push("--get-ip-addr-from-nic");
    }
    if (installOptions.enableGpu) {
      args.push("--gpu");
    }
    const ghproxy = installOptions.ghproxy.trim();
    if (enableGhproxy && ghproxy) {
      const finalUrl = normalizeOptionalServiceUrl(ghproxy);
      args.push(`--install-ghproxy`);
      args.push(finalUrl);
    }
    const installDir = installOptions.dir.trim();
    if (enableCustomDir && installDir) {
      args.push(`--install-dir`);
      args.push(installDir);
    }
    const serviceName = installOptions.serviceName.trim();
    if (enableCustomServiceName && serviceName) {
      args.push(`--install-service-name`);
      args.push(serviceName);
    }
    const includeNics = installOptions.includeNics.trim();
    if (enableIncludeNics && includeNics) {
      args.push(`--include-nics`);
      args.push(includeNics);
    }
    const excludeNics = installOptions.excludeNics.trim();
    if (enableExcludeNics && excludeNics) {
      args.push(`--exclude-nics`);
      args.push(excludeNics);
    }
    const includeMountpoints = installOptions.includeMountpoints.trim();
    if (enableIncludeMountpoints && includeMountpoints) {
      args.push(`--include-mountpoint`);
      args.push(includeMountpoints);
    }
    if (enableInterval) {
      const intervalVal = Number.parseFloat((installOptions.interval || "").trim());
      args.push("-i");
      args.push(Number.isFinite(intervalVal) && intervalVal >= 1 ? String(intervalVal) : "1");
    }
    if (enableMonthRotate) {
      const rotateVal = (installOptions.monthRotate || "").trim() || "1"; // 默认 1
      args.push(`--month-rotate`);
      args.push(rotateVal);
      args.push(`--month-rotate-time`);
      args.push(normalizeTrafficResetTime(installOptions.monthRotateTime));
      args.push(`--month-rotate-timezone`);
      args.push(normalizeTrafficResetTimezone(installOptions.monthRotateTimezone));
    }
    let scriptFile: "install.sh" | "install.ps1" = "install.sh";
    if (selectedPlatform === "windows") {
      scriptFile = "install.ps1";
    }
    const scriptUrl = liteAgentInstallScriptUrl(
      scriptFile,
      enableGhproxy ? ghproxy : "",
    );
    let finalCommand = "";
    switch (selectedPlatform) {
      case "linux":
        finalCommand = liteAgentLinuxInstallCommand(scriptUrl, args);
        break;
      case "windows":
        finalCommand = liteAgentWindowsInstallCommand(scriptUrl, args);
        break;
      case "macos":
        finalCommand = liteAgentMacInstallCommand(scriptUrl, args);
        break;
      case "docker": {
        // Docker 运行时不支持安装脚本专用参数，剔除它们及其取值
        const installOnlyFlags = [
          "--install-ghproxy",
          "--install-dir",
          "--install-service-name",
        ];
        const dockerArgs: string[] = [];
        for (let i = 0; i < args.length; i++) {
          if (installOnlyFlags.includes(args[i])) {
            i++; // 跳过该标志的取值
            continue;
          }
          dockerArgs.push(args[i]);
        }
        finalCommand =
          `docker run -d --name lite-plus-agent --restart=always ` +
          `${LITE_AGENT_DOCKER_IMAGE} ` +
          quoteShellArgs(dockerArgs);
        break;
      }
    }
    return finalCommand;
  };

  const saveProfile = async (copyCommand: boolean) => {
    if (profileAction) return;
    setCopyFeedback(undefined);
    const trafficResetDay = selectedTrafficResetDay();
    if (trafficResetDay === null) {
      toast.error(
        t(
          "admin.nodeTable.invalidMonthRotate",
          "流量重置日必须是 1 到 31 的整数",
        ),
      );
      return;
    }

    if (selectedInterval() === null) {
      toast.error(
        t(
          "admin.nodeTable.invalidInterval",
          "采集间隔必须在 1 到 3600 秒之间",
        ),
      );
      return;
    }

    if (copyCommand && copyBlocked) {
      toast.error(
        t(
          "admin.nodeTable.tokenMissingCopyBlocked",
          "Token 尚未就绪，无法复制安装命令",
        ),
      );
      return;
    }

    const action = copyCommand ? "copy" : "dispatch";
    setProfileAction(action);
    const copyAttempt = copyCommand
      ? writeClipboardText(generateCommand()).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error }),
        )
      : null;
    try {
      const response = await fetch(
        `/api/admin/client/${node.uuid}/deployment-profile`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: deploymentProfile() }),
        },
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `HTTP ${response.status}`);
      }
      const result = (await response.json()) as DeploymentProfileResponse;
      setDeliveryState(result.delivery_state);
      const deliveryMessage = result.delivery_state?.status === "applied"
        ? t("admin.nodeTable.deliveryApplied", "已生效")
        : result.delivery_state?.status === "failed"
          ? t("admin.nodeTable.deliveryFailed", "应用失败")
          : result.delivery_state?.status === "sent" || result.delivery === "sent"
            ? t("admin.nodeTable.deliverySent", "已发送")
        : result.delivery === "agent_upgrade_required"
          ? t("admin.nodeTable.runtimeConfigUpgradeRequired", "配置已保存，Agent 升级后应用")
          : t("admin.nodeTable.deliverySaved", "已保存");

      if (copyAttempt) {
        const copyResult = await copyAttempt;
        if (!copyResult.ok) {
          refresh();
          const message = `${deliveryMessage}；${t(
              "admin.nodeTable.installCommandCopyDenied",
              "浏览器拒绝访问剪贴板，请检查网站权限后重试",
            )}`;
          setCopyFeedback({ kind: "error", message });
          commandTextAreaRef.current?.focus();
          commandTextAreaRef.current?.select();
          toast.warning(message);
          return;
        }
        if (!copyResult.value.confirmed) {
          refresh();
          const message = `${deliveryMessage}；${t(
              "admin.nodeTable.installCommandCopyUnconfirmed",
              "浏览器无法确认复制，请从上方指令框手动复制",
            )}`;
          setCopyFeedback({ kind: "warning", message });
          commandTextAreaRef.current?.focus();
          commandTextAreaRef.current?.select();
          toast.warning(message);
          return;
        }
      }
      refresh();
      const message = copyCommand
          ? `${deliveryMessage}；${t(
              "admin.nodeTable.installCommandSaved",
              "部署指令已复制到剪贴板",
            )}`
          : deliveryMessage;
      if (copyCommand) {
        setCopyFeedback({ kind: "success", message });
      }
      toast.success(message);
    } catch (err) {
      console.error("Failed to save install options or copy command:", err);
      const message = err instanceof Error
          ? err.message
          : t("admin.nodeTable.installCommandSaveFailed", "保存配置失败");
      if (copyCommand) {
        setCopyFeedback({ kind: "error", message });
        commandTextAreaRef.current?.focus();
        commandTextAreaRef.current?.select();
      }
      toast.error(message);
    } finally {
      setProfileAction(null);
    }
  };
  const deliveryPresentation = (() => {
    switch (deliveryState?.status) {
      case "sent":
        return {
          Icon: Send,
          color: "orange",
          label: t("admin.nodeTable.deliverySent", "已发送"),
          hint: t("admin.nodeTable.deliverySentHint", "等待 Agent 返回应用结果"),
        };
      case "applied":
        return {
          Icon: CheckCircle2,
          color: "green",
          label: t("admin.nodeTable.deliveryApplied", "已生效"),
          hint: t("admin.nodeTable.deliveryAppliedHint", "Agent 已确认配置生效"),
        };
      case "failed":
        return {
          Icon: XCircle,
          color: "red",
          label: t("admin.nodeTable.deliveryFailed", "应用失败"),
          hint: deliveryState.error || t("admin.nodeTable.deliveryFailedHint", "Agent 未能应用此配置"),
        };
      case "saved":
        return {
          Icon: Clock3,
          color: "blue",
          label: t("admin.nodeTable.deliverySaved", "已保存"),
          hint: t("admin.nodeTable.deliverySavedHint", "等待 Agent 上线后发送"),
        };
      default:
        return {
          Icon: Clock3,
          color: "gray",
          label: t("admin.nodeTable.deliveryNotStarted", "尚未下发"),
          hint: t(
            "admin.nodeTable.deliveryNotStartedHint",
            "保存在线采集配置后，可在这里查看发送和 Agent 应用结果",
          ),
        };
    }
  })();
  const nodeConfigName = node.name?.trim() || "";
  const nodeConfigAddress = nodePreferredAddress(node);
  const nodeConfigIdentity = [nodeConfigName, nodeConfigAddress]
    .filter(Boolean)
    .join(" ");
  return (
    <Dialog.Root
      open={open}
      disableEnforceFocus={needTwoFactor}
      onOpenChange={(nextOpen) => {
        revertTrafficResetClock();
        setOpen(nextOpen);
        if (nextOpen) {
          setDialogTab("online");
          return;
        }
        tokenAbortControllerRef.current?.abort();
        tokenAbortControllerRef.current = null;
        tokenSessionRef.current?.closeDialog();
        setOtpInput("");
        setDialogTab("online");
        onClose?.();
      }}
    >
      {initiallyOpen ? null : <Dialog.Trigger>
        <IconButton variant="ghost" title={t("admin.nodeTable.installCommand")}>
          <Download size="18" />
        </IconButton>
      </Dialog.Trigger>}
      {open ? <AppDialogContent
        maxWidth="720px"
        className="km-node-dialog km-node-deploy-dialog"
      >
        <Dialog.Title>
          <span className="km-node-config-title">
            <span>{t("admin.nodeTable.nodeConfig", "节点配置")}</span>
            {nodeConfigIdentity ? (
              <span className="km-node-config-identity" title={nodeConfigIdentity}>
                <span className="km-node-config-identity-flag" aria-hidden>
                  <Flag flag={node.region} compact />
                </span>
                {nodeConfigName ? (
                  <span className="km-node-config-identity-name">{nodeConfigName}</span>
                ) : null}
                {nodeConfigAddress ? (
                  <span className="km-node-config-identity-ip">{nodeConfigAddress}</span>
                ) : null}
              </span>
            ) : null}
          </span>
        </Dialog.Title>
        <Tabs.Root
          value={dialogTab}
          onValueChange={(value) => {
            if (value === "online" || value === "install") setDialogTab(value);
          }}
        >
          <AdminSheetTabs>
            <Tabs.List>
              <Tabs.Trigger value="online">
                <AdminTabLabel>
                  {t("admin.nodeTable.onlineConfigTab", "在线配置")}
                </AdminTabLabel>
              </Tabs.Trigger>
              <Tabs.Trigger value="install">
                <AdminTabLabel>
                  {t("admin.nodeTable.deployCommandTab", "部署指令")}
                </AdminTabLabel>
              </Tabs.Trigger>
            </Tabs.List>
          </AdminSheetTabs>
        <div
          className="km-node-dialog-body flex flex-col gap-4"
          aria-busy={loadingProfile || (dialogTab === "install" && tokenLoading)}
          style={{
            opacity: loadingProfile ? 0.55 : 1,
            pointerEvents: loadingProfile ? "none" : undefined,
          }}
        >
          <Tabs.Content value="install" className="flex flex-col gap-4">
          <InstallPlatformToggle
            className="admin-install-platforms"
            value={selectedPlatform}
            onChange={setSelectedPlatform}
          />

          <section className="km-node-dialog-pane">
            <Flex justify="between" align="center">
              <Text size="3" weight="bold">
                {t("admin.nodeTable.installationSettings", "安装配置")}
              </Text>
              <Text size="1" color="gray">
                {t("admin.nodeTable.reinstallRequired", "重装后生效")}
              </Text>
            </Flex>
            <div className="admin-install-options-grid grid grid-cols-2 gap-2">
              <Flex gap="2" align="center">
                <Checkbox
                  checked={installOptions.enableRemoteControl}
                  onCheckedChange={(checked) => {
                    setInstallOptions((prev) => ({
                      ...prev,
                      enableRemoteControl: Boolean(checked),
                    }));
                  }}
                />
                <label
                  className="text-sm font-normal"
                  title={t("admin.nodeTable.enableRemoteControlHint")}
                  onClick={() => {
                    setInstallOptions((prev) => ({
                      ...prev,
                      enableRemoteControl: !prev.enableRemoteControl,
                    }));
                  }}
                >
                  {t("admin.nodeTable.enableRemoteControl")}
                </label>
              </Flex>
              <Flex gap="2" align="center">
                <Checkbox
                  checked={installOptions.disableAutoUpdate}
                  onCheckedChange={(checked) => {
                    setInstallOptions((prev) => ({
                      ...prev,
                      disableAutoUpdate: Boolean(checked),
                    }));
                  }}
                ></Checkbox>
                <label
                  className="text-sm font-normal"
                  onClick={() => {
                    setInstallOptions((prev) => ({
                      ...prev,
                      disableAutoUpdate: !prev.disableAutoUpdate,
                    }));
                  }}
                >
                  {t("admin.nodeTable.disableAutoUpdate", "禁用自动更新")}
                </label>
              </Flex>
              <Flex gap="2" align="center">
                <Checkbox
                  checked={installOptions.ignoreUnsafeCert}
                  onCheckedChange={(checked) => {
                    setInstallOptions((prev) => ({
                      ...prev,
                      ignoreUnsafeCert: Boolean(checked),
                    }));
                  }}
                />
                <label
                  className="text-sm font-normal"
                  onClick={() => {
                    setInstallOptions((prev) => ({
                      ...prev,
                      ignoreUnsafeCert: !prev.ignoreUnsafeCert,
                    }));
                  }}
                >
                  {t("admin.nodeTable.ignoreUnsafeCert", "忽略不安全证书")}
                </label>
              </Flex>
              <Flex gap="2" align="center">
                <Checkbox
                  checked={installOptions.getIpAddrFromNic}
                  onCheckedChange={(checked) => {
                    setInstallOptions((prev) => ({
                      ...prev,
                      getIpAddrFromNic: Boolean(checked),
                    }));
                  }}
                />
                <label
                  className="text-sm font-normal"
                  onClick={() => {
                    setInstallOptions((prev) => ({
                      ...prev,
                      getIpAddrFromNic: !prev.getIpAddrFromNic,
                    }));
                  }}
                >
                  {t("admin.nodeTable.getIpAddrFromNic", "从网卡获取 IP 地址")}
                </label>
              </Flex>
            </div>
            <Flex direction="column" gap="2" className="km-node-dialog-fields [&_label]:font-normal">
              <Flex gap="2" align="center">
                <Checkbox
                  checked={enableGhproxy}
                  onCheckedChange={(checked) => {
                    const enabled = Boolean(checked);
                    setEnableGhproxy(enabled);
                    setInstallOptions((prev) => ({
                      ...prev,
                      ghproxy: enabled
                        ? prev.ghproxy.trim() ||
                          defaultInstallGitHubProxy(settings)
                        : "",
                    }));
                  }}
                />
                <label
                  className="text-sm font-bold cursor-pointer"
                  onClick={() => {
                    const enabled = !enableGhproxy;
                    setEnableGhproxy(enabled);
                    setInstallOptions((prev) => ({
                      ...prev,
                      ghproxy: enabled
                        ? prev.ghproxy.trim() ||
                          defaultInstallGitHubProxy(settings)
                        : "",
                    }));
                  }}
                >
                  {t("admin.nodeTable.ghproxy", "GitHub 代理")}
                </label>
              </Flex>
              {enableGhproxy && (
                <TextField.Root
                  placeholder={t(
                    "settings.general.github_proxy_placeholder",
                    "https://gh-proxy.com",
                  )}
                  value={installOptions.ghproxy}
                  onChange={(e) =>
                    setInstallOptions((prev) => ({
                      ...prev,
                      ghproxy: e.target.value,
                    }))
                  }
                />
              )}

              <Flex gap="2" align="center">
                <Checkbox
                  checked={enableCustomDir}
                  onCheckedChange={(checked) => {
                    setEnableCustomDir(Boolean(checked));
                    if (!checked) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        dir: "",
                      }));
                    }
                  }}
                />
                <label
                  className="text-sm font-bold cursor-pointer"
                  onClick={() => {
                    setEnableCustomDir(!enableCustomDir);
                    if (enableCustomDir) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        dir: "",
                      }));
                    }
                  }}
                >
                  {t("admin.nodeTable.install_dir", "安装目录")}
                </label>
              </Flex>
              {enableCustomDir && (
                <TextField.Root
                  placeholder={t(
                    "admin.nodeTable.install_dir_placeholder",
                    "安装目录，为空则使用默认目录(/opt/lite-plus-agent)"
                  )}
                  value={installOptions.dir}
                  onChange={(e) =>
                    setInstallOptions((prev) => ({
                      ...prev,
                      dir: e.target.value,
                    }))
                  }
                />
              )}

              <Flex gap="2" align="center">
                <Checkbox
                  checked={enableCustomServiceName}
                  onCheckedChange={(checked) => {
                    setEnableCustomServiceName(Boolean(checked));
                    if (!checked) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        serviceName: "",
                      }));
                    }
                  }}
                />
                <label
                  className="text-sm font-bold cursor-pointer"
                  onClick={() => {
                    setEnableCustomServiceName(!enableCustomServiceName);
                    if (enableCustomServiceName) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        serviceName: "",
                      }));
                    }
                  }}
                >
                  {t("admin.nodeTable.serviceName", "服务名称")}
                </label>
              </Flex>
              {enableCustomServiceName && (
                <TextField.Root
                  placeholder={t(
                    "admin.nodeTable.serviceName_placeholder",
                    "服务名称，为空则使用默认名称(lite-plus-agent)"
                  )}
                  value={installOptions.serviceName}
                  onChange={(e) =>
                    setInstallOptions((prev) => ({
                      ...prev,
                      serviceName: e.target.value,
                    }))
                  }
                />
              )}
            </Flex>
            </section>
          </Tabs.Content>
          <Tabs.Content value="online">
            <section className="km-node-dialog-pane">
              <Flex
                justify="between"
                align="center"
                wrap="wrap"
                gap="2"
                className="km-node-online-heading"
              >
                <Text size="3" weight="bold">
                  {t("admin.nodeTable.onlineCollectionSettings", "在线采集配置")}
                </Text>
                <Text size="1" color="green">
                  {t(
                    "admin.nodeTable.onlineApplicable",
                    "部署完成后，保存后可直接下发",
                  )}
                </Text>
              </Flex>
            <Flex direction="column" gap="2" className="km-node-dialog-fields [&_label]:font-normal">
              <div className="admin-install-options-grid grid grid-cols-2 gap-2">
                <Flex gap="2" align="center">
                  <Checkbox
                    checked={installOptions.memoryIncludeCache}
                    onCheckedChange={(checked) => {
                      setInstallOptions((prev) => ({
                        ...prev,
                        memoryIncludeCache: Boolean(checked),
                      }));
                    }}
                  />
                  <label
                    className="text-sm font-normal"
                    onClick={() => {
                      setInstallOptions((prev) => ({
                        ...prev,
                        memoryIncludeCache: !prev.memoryIncludeCache,
                      }));
                    }}
                  >
                    {t("admin.nodeTable.memoryModeAvailable", "监测可用内存")}
                  </label>
                  <Tips size="14">
                    {t("admin.nodeTable.memoryModeAvailable_tip")}
                  </Tips>
                </Flex>
                <Flex gap="2" align="center">
                  <Checkbox
                    checked={installOptions.enableGpu}
                    onCheckedChange={(checked) => {
                      setInstallOptions((prev) => ({
                        ...prev,
                        enableGpu: Boolean(checked),
                      }));
                    }}
                  />
                  <label
                    className="text-sm font-normal"
                    onClick={() => {
                      setInstallOptions((prev) => ({
                        ...prev,
                        enableGpu: !prev.enableGpu,
                      }));
                    }}
                  >
                    {t("admin.nodeTable.enableGpuMonitoring", "启用详细 GPU 监控")}
                  </label>
                </Flex>
              </div>
              <Flex gap="2" align="center">
                <Checkbox
                  checked={enableIncludeNics}
                  onCheckedChange={(checked) => {
                    setEnableIncludeNics(Boolean(checked));
                    if (!checked) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        includeNics: "",
                      }));
                    }
                  }}
                />
                <label
                  className="text-sm font-bold cursor-pointer"
                  onClick={() => {
                    setEnableIncludeNics(!enableIncludeNics);
                    if (enableIncludeNics) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        includeNics: "",
                      }));
                    }
                  }}
                >
                  {t("admin.nodeTable.includeNics", "只监测特定网卡")}
                </label>
              </Flex>
              {enableIncludeNics && (
                <TextField.Root
                  // placeholder={t(
                  //   "admin.nodeTable.includeNics_placeholder",
                  //   "多个网卡使用逗号隔开"
                  // )}
                  placeholder="eth0,eth1"
                  value={installOptions.includeNics}
                  onChange={(e) =>
                    setInstallOptions((prev) => ({
                      ...prev,
                      includeNics: e.target.value,
                    }))
                  }
                />
              )}
              <Flex gap="2" align="center">
                <Checkbox
                  checked={enableExcludeNics}
                  onCheckedChange={(checked) => {
                    setEnableExcludeNics(Boolean(checked));
                    if (!checked) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        excludeNics: "",
                      }));
                    }
                  }}
                />
                <label
                  className="text-sm font-bold cursor-pointer"
                  onClick={() => {
                    setEnableExcludeNics(!enableExcludeNics);
                    if (enableExcludeNics) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        excludeNics: "",
                      }));
                    }
                  }}
                >
                  {t("admin.nodeTable.excludeNics", "排除特定网卡")}
                </label>
              </Flex>
              {enableExcludeNics && (
                <TextField.Root
                  // placeholder={t(
                  //   "admin.nodeTable.excludeNics_placeholder",
                  //   "多个网卡使用逗号隔开"
                  // )}
                  placeholder="lo"
                  value={installOptions.excludeNics}
                  onChange={(e) =>
                    setInstallOptions((prev) => ({
                      ...prev,
                      excludeNics: e.target.value,
                    }))
                  }
                />
              )}
              <Flex gap="2" align="center">
                <Checkbox
                  checked={enableIncludeMountpoints}
                  onCheckedChange={(checked) => {
                    setEnableIncludeMountpoints(Boolean(checked));
                    if (!checked) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        includeMountpoints: "",
                      }));
                    }
                  }}
                />
                <label
                  className="text-sm font-bold cursor-pointer"
                  onClick={() => {
                    setEnableIncludeMountpoints(!enableIncludeMountpoints);
                    if (enableIncludeMountpoints) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        includeMountpoints: "",
                      }));
                    }
                  }}
                >
                  {t("admin.nodeTable.includeMountpoints", "只监测特定挂载点")}
                </label>
              </Flex>
              {enableIncludeMountpoints && (
                <TextField.Root
                  placeholder="/;/home;/var"
                  value={installOptions.includeMountpoints}
                  onChange={(e) =>
                    setInstallOptions((prev) => ({
                      ...prev,
                      includeMountpoints: e.target.value,
                    }))
                  }
                />
              )}
              <Flex gap="2" align="center">
                <Checkbox
                  checked={enableInterval}
                  onCheckedChange={(checked) => {
                    const enabled = Boolean(checked);
                    setEnableInterval(enabled);
                    if (!enabled) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        interval: "",
                      }));
                    } else {
                      setInstallOptions((prev) => ({
                        ...prev,
                        interval: prev.interval?.trim() ? prev.interval : "1",
                      }));
                    }
                  }}
                />
                <label
                  className="text-sm font-bold cursor-pointer"
                  onClick={() => {
                    const willEnable = !enableInterval;
                    setEnableInterval(willEnable);
                    if (!willEnable) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        interval: "",
                      }));
                    } else {
                      setInstallOptions((prev) => ({
                        ...prev,
                        interval: prev.interval?.trim() ? prev.interval : "1",
                      }));
                    }
                  }}
                >
                  {t("admin.nodeTable.interval", "采集间隔(秒)")}
                </label>
              </Flex>
              {enableInterval && (
                <TextField.Root
                  placeholder="1"
                  value={installOptions.interval}
                  onChange={(e) =>
                    setInstallOptions((prev) => ({
                      ...prev,
                      interval: e.target.value,
                    }))
                  }
                />
              )}
              <Flex gap="2" align="center">
                <Checkbox
                  checked={enableMonthRotate}
                  onCheckedChange={(checked) => {
                    const enabled = Boolean(checked);
                    setEnableMonthRotate(enabled);
                    if (!enabled) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        monthRotate: "",
                      }));
                    } else {
                      setInstallOptions((prev) => ({
                        ...prev,
                        monthRotate: prev.monthRotate?.trim()
                          ? prev.monthRotate
                          : "1",
                        monthRotateTime: prev.monthRotateTime?.trim()
                          ? prev.monthRotateTime
                          : initialResetTime,
                        monthRotateTimezone: prev.monthRotateTimezone?.trim()
                          ? prev.monthRotateTimezone
                          : initialResetTimezone,
                      }));
                    }
                  }}
                />
                <label
                  className="text-sm font-bold cursor-pointer"
                  onClick={() => {
                    const willEnable = !enableMonthRotate;
                    setEnableMonthRotate(willEnable);
                    if (!willEnable) {
                      setInstallOptions((prev) => ({
                        ...prev,
                        monthRotate: "",
                      }));
                    } else {
                      setInstallOptions((prev) => ({
                        ...prev,
                        monthRotate: prev.monthRotate?.trim()
                          ? prev.monthRotate
                          : "1",
                        monthRotateTime: prev.monthRotateTime?.trim()
                          ? prev.monthRotateTime
                          : initialResetTime,
                        monthRotateTimezone: prev.monthRotateTimezone?.trim()
                          ? prev.monthRotateTimezone
                          : initialResetTimezone,
                      }));
                    }
                  }}
                >
                  {t("admin.nodeTable.monthRotate", "流量重置时间")}
                </label>
              </Flex>
              {enableMonthRotate && (
                <Flex direction="column" gap="2">
                  <div className="km-traffic-reset-clock-row">
                    <div className="km-traffic-reset-timezone">
                      <SelectOrInput
                        options={trafficResetTimezoneOptions}
                        value={installOptions.monthRotateTimezone}
                        allowCustomInput
                        onChange={(value) =>
                          setInstallOptions((prev) => ({
                            ...prev,
                            monthRotateTimezone: value,
                          }))
                        }
                        placeholder="Asia/Shanghai"
                        aria-label={t("admin.nodeTable.monthRotateTimezone", "时区")}
                      />
                    </div>
                    <div className="km-traffic-reset-day">
                      <TextField.Root
                        placeholder="1"
                        aria-label={t("admin.nodeTable.monthRotateDay", "日期")}
                        value={installOptions.monthRotate}
                        onChange={(e) =>
                          setInstallOptions((prev) => ({
                            ...prev,
                            monthRotate: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="km-traffic-reset-time">
                      <TrafficResetTimeField
                        ariaLabel={t("admin.nodeTable.monthRotateTime", "时间")}
                        value={installOptions.monthRotateTime}
                        onChange={(value) =>
                          setInstallOptions((prev) => ({
                            ...prev,
                            monthRotateTime: value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <Text size="1" color="gray">
                    {t(
                      "admin.nodeTable.monthRotateHint",
                      "流量重置时间按厂商账单填写，Lite-Plus 会换算到北京时间才重置。",
                    )}
                  </Text>
                </Flex>
              )}
              <div
                className="admin-deployment-delivery"
                role="status"
                aria-live="polite"
              >
                <Text size="2" weight="bold" className="admin-deployment-delivery-title">
                  {t("admin.nodeTable.deliveryStatusTitle", "在线配置状态")}
                </Text>
                <div className="admin-deployment-delivery-body">
                  <div
                    className="admin-deployment-delivery-current"
                    data-status={deliveryState?.status || "not-started"}
                  >
                    <Badge
                      color={deliveryPresentation.color}
                      size="1"
                      variant="soft"
                      className="text-sm"
                    >
                      <span className="text-xs">{deliveryPresentation.label}</span>
                    </Badge>
                  </div>
                  <Flex gap="2" align="center" className="admin-deployment-delivery-hint">
                    <deliveryPresentation.Icon size={15} />
                    <Text
                      size="1"
                      color={deliveryState?.status === "failed" ? "red" : "gray"}
                    >
                      {deliveryPresentation.hint}
                    </Text>
                  </Flex>
                </div>
              </div>
              <Button
                mt="2"
                variant="solid"
                aria-busy={profileAction === "dispatch"}
                disabled={
                  selectedTrafficResetDay() === null ||
                  selectedInterval() === null
                }
                onClick={() => void saveProfile(false)}
              >
                <Save size={16} />
                {t("admin.nodeTable.saveAndDispatch", "保存并下发")}
              </Button>
            </Flex>
            </section>
          </Tabs.Content>
          <Tabs.Content value="install" className="flex flex-col gap-4">
          <Flex direction="column" gap="2">
            <label className="text-base font-bold">
              {t("admin.nodeTable.generatedCommand", "生成的指令")}
            </label>
            {tokenError ? (
              <Callout.Root color="red" size="1">
                <Callout.Text>{tokenError}</Callout.Text>
              </Callout.Root>
            ) : null}
            <div className="relative">
              <TextArea
                ref={commandTextAreaRef}
                readOnly
                className="w-full"
                style={{ minHeight: "80px" }}
                value={
                  tokenLoading
                    ? t("admin.nodeTable.installTokenLoading", "正在读取节点 Token…")
                    : installToken
                      ? generateCommand()
                      : ""
                }
                onFocus={(event) => event.currentTarget.select()}
              />
            </div>
          </Flex>
          <Flex direction="column" gap="2">
            <Button
              style={{ width: "100%" }}
              aria-busy={tokenLoading || profileAction === "copy"}
              disabled={
                copyBlocked ||
                selectedTrafficResetDay() === null ||
                selectedInterval() === null
              }
              onClick={() => void saveProfile(true)}
            >
              <Copy size={16} />
              {t("admin.nodeTable.saveAndCopyCommand", "保存并复制部署指令")}
            </Button>
            {isMobile && copyFeedback && (
              <Text
                as="div"
                size="2"
                weight="medium"
                color={
                  copyFeedback.kind === "success"
                    ? "green"
                    : copyFeedback.kind === "warning"
                      ? "amber"
                      : "red"
                }
                role="status"
                aria-live="polite"
                className="px-1"
              >
                {copyFeedback.message}
              </Text>
            )}
          </Flex>
          </Tabs.Content>
        </div>
        </Tabs.Root>
      </AppDialogContent> : null}
      {needTwoFactor ? (
        <NodeIdentityAuthDialog
          otpFieldId="admin-node-deploy-otp"
          otpFieldRef={otpFieldRef}
          otpInput={otpInput}
          onOtpChange={setOtpInput}
          otpInvalid={tokenState.twoFactorInvalid}
          submitting={otpSubmitting}
          onDismiss={cancelDeployTwoFactor}
          onConfirmOtp={() => {
            void tokenSessionRef.current?.submitTwoFactor(node.uuid, otpInput);
          }}
          onConfirmPasskey={async () => {
            try {
              const assertion = await confirmAdminPasskey();
              await tokenSessionRef.current?.submitPasskey(
                node.uuid,
                assertion.ceremony_id,
                assertion.credential,
              );
            } catch (error) {
              const cancelled = passkeyUnavailableMessage(error, "") === "cancelled";
              toast.error(
                cancelled
                  ? t("account.passkey_cancelled")
                  : error instanceof Error
                    ? error.message
                    : String(error),
              );
            }
          }}
        />
      ) : null}
    </Dialog.Root>
  );
}

function EditButton({ node, initiallyOpen = false, onClose }: { node: NodeDetail; initiallyOpen?: boolean; onClose?: () => void }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(initiallyOpen);
  const { refresh } = useNodeDetails();
  const nameRef = React.useRef<HTMLInputElement>(null);
  const groupRef = React.useRef<HTMLInputElement>(null);
  const tagsRef = React.useRef<HTMLInputElement>(null);
  const bandwidthRef = React.useRef<HTMLInputElement>(null);
  const privateRemarkRef = React.useRef<HTMLInputElement>(null);
  const publicRemarkRef = React.useRef<HTMLInputElement>(null);
  const [hidden, setHidden] = useState(node.hidden);
  const [saving, setSaving] = useState(false);
  const [traffic_limit, setTrafficLimit] = useState(node.traffic_limit || 0);
  const [traffic_limit_type, setTrafficLimitType] = useState(node.traffic_limit_type || "sum");
  const [trafficResetDay, setTrafficResetDay] = useState(node.traffic_reset_day ?? 0);
  const [trafficResetTime, setTrafficResetTime] = useState(() =>
    normalizeTrafficResetTime(node.traffic_reset_time),
  );
  const [trafficResetTimezone, setTrafficResetTimezone] = useState(() =>
    normalizeTrafficResetTimezone(node.traffic_reset_timezone),
  );
  const [regionOverride, setRegionOverride] = useState(() =>
    node.region_override ? getRegionCode(node.region_override) : "",
  );
  const [trafficResetAllowance, setTrafficResetAllowance] = useState(Math.max(0, node.traffic_reset_allowance ?? 0));
  const [trafficResetAllowanceInput, setTrafficResetAllowanceInput] = useState(() =>
    formatBytes(Math.max(0, node.traffic_reset_allowance ?? 0)),
  );
  const pendingSavedEditRef = React.useRef<{
    hidden: boolean;
    traffic_limit: number;
    traffic_limit_type: string;
    trafficResetDay: number;
    trafficResetTime: string;
    trafficResetTimezone: string;
    regionOverride: string;
    trafficResetAllowance: number;
  } | null>(null);

  const regionOptions = React.useMemo(
    () => {
      if (!open) return [];
      return [
        {
          label: t("admin.nodeEdit.regionAuto", "自动识别"),
          value: "",
        },
        ...getSupportedRegions().map((region) => {
          const code = getRegionCode(region);
          return {
            label: `${code} ${getRegionDisplayName(region, i18n.language.startsWith("zh") ? "zh" : "en")}`,
            value: code,
            icon: <Flag flag={code} compact />,
          };
        }),
      ];
    },
    [open, i18n.language, t],
  );

  const editFormFromNode = () => ({
    hidden: node.hidden,
    traffic_limit: node.traffic_limit || 0,
    traffic_limit_type: node.traffic_limit_type || "sum",
    trafficResetDay: node.traffic_reset_day ?? 0,
    trafficResetTime: normalizeTrafficResetTime(node.traffic_reset_time),
    trafficResetTimezone: normalizeTrafficResetTimezone(node.traffic_reset_timezone),
    regionOverride: node.region_override ? getRegionCode(node.region_override) : "",
    trafficResetAllowance: node.traffic_reset_allowance ?? 0,
  });

  const applyEditForm = (form: ReturnType<typeof editFormFromNode>) => {
    setHidden(form.hidden);
    setTrafficLimit(form.traffic_limit);
    setTrafficLimitType(form.traffic_limit_type);
    setTrafficResetDay(form.trafficResetDay);
    setTrafficResetTime(form.trafficResetTime);
    setTrafficResetTimezone(form.trafficResetTimezone);
    setRegionOverride(form.regionOverride);
    const allowance = Math.max(0, form.trafficResetAllowance);
    setTrafficResetAllowance(allowance);
    setTrafficResetAllowanceInput(formatBytes(allowance));
  };

  const hydrateEditForm = () => {
    applyEditForm(pendingSavedEditRef.current ?? editFormFromNode());
  };

  React.useLayoutEffect(() => {
    const pending = pendingSavedEditRef.current;
    const fromNode = editFormFromNode();
    if (
      pending &&
      pending.trafficResetDay === fromNode.trafficResetDay &&
      pending.trafficResetTime === fromNode.trafficResetTime &&
      pending.trafficResetTimezone === fromNode.trafficResetTimezone &&
      pending.hidden === fromNode.hidden &&
      pending.traffic_limit === fromNode.traffic_limit &&
      pending.traffic_limit_type === fromNode.traffic_limit_type &&
      pending.regionOverride === fromNode.regionOverride &&
      pending.trafficResetAllowance === fromNode.trafficResetAllowance
    ) {
      pendingSavedEditRef.current = null;
    }
    if (open) return;
    hydrateEditForm();
  }, [
    open,
    node.hidden,
    node.traffic_limit,
    node.traffic_limit_type,
    node.traffic_reset_day,
    node.traffic_reset_time,
    node.traffic_reset_timezone,
    node.region_override,
    node.traffic_reset_allowance,
  ]);

  const save = async () => {
    if (isNegativeByteInput(trafficResetAllowanceInput) || trafficResetAllowance < 0) {
      toast.error(t("admin.nodeEdit.trafficResetAllowanceNonNegative", "重置流量额度不能为负数"));
      return;
    }
    if (trafficResetAllowance > 0 && (trafficResetDay < 1 || trafficResetDay > 31)) {
      toast.error(
        t(
          "admin.nodeEdit.trafficResetDayRequired",
          "请先设置 1-31 日的流量重置日，再填写本周期重置流量",
        ),
      );
      return;
    }
    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        name: nameRef.current?.value,
        group: groupRef.current?.value,
        tags: tagsRef.current?.value,
        bandwidth: normalizeBandwidth(bandwidthRef.current?.value ?? ""),
        remark: privateRemarkRef.current?.value ?? "",
        public_remark: publicRemarkRef.current?.value ?? "",
        hidden,
      };
      if (traffic_limit !== (node.traffic_limit || 0)) {
        payload.traffic_limit = traffic_limit;
      }
      if (traffic_limit_type !== (node.traffic_limit_type || "sum")) {
        payload.traffic_limit_type = traffic_limit_type;
      }
      payload.traffic_reset_day = trafficResetDay;
      payload.traffic_reset_time = normalizeTrafficResetTime(trafficResetTime);
      payload.traffic_reset_timezone = normalizeTrafficResetTimezone(trafficResetTimezone);
      const currentRegionOverride = node.region_override
        ? getRegionCode(node.region_override)
        : "";
      if (regionOverride !== currentRegionOverride) {
        payload.region_override = regionOverride;
      }
      if (trafficResetAllowance !== (node.traffic_reset_allowance ?? 0)) {
        payload.traffic_reset_allowance = trafficResetAllowance;
      }
      const response = await fetch(`/api/admin/client/${node.uuid}/edit`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `HTTP ${response.status}`);
      }
      pendingSavedEditRef.current = {
        hidden,
        traffic_limit,
        traffic_limit_type,
        trafficResetDay,
        trafficResetTime: normalizeTrafficResetTime(trafficResetTime),
        trafficResetTimezone: normalizeTrafficResetTimezone(trafficResetTimezone),
        regionOverride,
        trafficResetAllowance,
      };
      refresh();
      setOpen(false);
      onClose?.();
      toast.success(t("admin.nodeEdit.saveSuccess", "保存成功"));
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error(t("admin.nodeEdit.saveError", "保存失败"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next || !pendingSavedEditRef.current) hydrateEditForm();
        setOpen(next);
        if (!next) onClose?.();
      }}
    >
      {initiallyOpen ? null : <Dialog.Trigger>
        <IconButton
          variant="ghost"
          title={t("admin.nodeEdit.editInfo", "编辑信息")}
        >
          <Pencil size="18" />
        </IconButton>
      </Dialog.Trigger>}
      {open ? <AppDialogContent
        maxWidth={920}
        className="km-node-dialog km-node-edit-dialog"
      >
        <Dialog.Title>
          {t("admin.nodeEdit.editInfo", "编辑信息")}
        </Dialog.Title>
        <Dialog.Description>
          {t(
            "admin.nodeEdit.editInfoDescription",
            "调整服务器标识、展示信息与流量策略。",
          )}
        </Dialog.Description>
        <div className="km-node-dialog-grid">
          <section className="km-node-dialog-pane km-node-dialog-fields">
          <div>
            <label className="block mb-1 text-sm font-medium text-muted-foreground">
              {t("admin.nodeEdit.name", "名称")}
            </label>
            <TextField.Root
              defaultValue={node.name}
              placeholder={t("admin.nodeEdit.namePlaceholder", "请输入名称")}
              ref={nameRef}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-muted-foreground">
              {t("admin.nodeEdit.regionOverride", "国家/地区图标")}
            </label>
            <SelectOrInput
              options={regionOptions}
              value={regionOverride}
              allowCustomInput={false}
              onChange={setRegionOverride}
              placeholder={t("admin.nodeEdit.regionAuto", "自动识别")}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "admin.nodeEdit.regionOverride_description",
                "用于广播 IP 或 GeoIP 识别不准的情况；清空后恢复自动识别。",
              )}
            </p>
          </div>
          <div>
            <label className="mb-1 flex items-center gap-1 text-sm font-medium leading-5 text-muted-foreground">
              {t("common.tags")}
              <span className="text-xs font-normal leading-none text-muted-foreground">
                {t("common.tagsDescription")}
              </span>
              <Tips size="14">
                <span
                  dangerouslySetInnerHTML={{ __html: t("common.tagsTips") }}
                />
              </Tips>
            </label>
            <TextField.Root defaultValue={node.tags} ref={tagsRef} />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-muted-foreground">
              {t("admin.nodeEdit.bandwidth", "带宽")}
            </label>
            <TextField.Root
              defaultValue={node.bandwidth || ""}
              ref={bandwidthRef}
              placeholder={t(
                "admin.nodeEdit.bandwidthPlaceholder",
                "例如 100 Mbps 或 1 Gbps",
              )}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "admin.nodeEdit.bandwidth_description",
                "用于概览展示，可填写 100 Mbps、1 Gbps、10 G 这类带宽。",
              )}
            </p>
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-muted-foreground">
              {t("common.group")}
            </label>
            <TextField.Root defaultValue={node.group} ref={groupRef} />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-muted-foreground">
              {t("admin.nodeEdit.remark", "私有备注")}
            </label>
            <TextField.Root
              defaultValue={node.remark}
              ref={privateRemarkRef}
              placeholder={t(
                "admin.nodeEdit.remarkPlaceholder",
                "请输入私有备注",
              )}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-muted-foreground">
              {t("admin.nodeEdit.publicRemark", "公开备注")}
            </label>
            <TextField.Root
              defaultValue={node.public_remark}
              ref={publicRemarkRef}
              placeholder={t(
                "admin.nodeEdit.publicRemarkPlaceholder",
                "请输入公开备注",
              )}
            />
          </div>
          <div>
            <SettingCardSwitch
              bordless
              title={t("admin.nodeEdit.hidden")}
              description={t("admin.nodeEdit.hidden_description")}
              defaultChecked={hidden}
              onChange={setHidden}
            />
          </div>
          </section>
          <section className="km-node-dialog-pane km-node-dialog-fields">
          <div className="km-node-traffic-section">
            <div className="space-y-2 pb-3 pt-2">
              <label className="block text-sm font-semibold leading-5">
                {t("admin.nodeEdit.trafficResetDay", "流量重置时间")}
              </label>
              <div className="km-traffic-reset-clock-row">
                <div className="km-traffic-reset-timezone">
                  <SelectOrInput
                    options={trafficResetTimezoneOptions}
                    value={trafficResetTimezone}
                    allowCustomInput
                    onChange={setTrafficResetTimezone}
                    placeholder="Asia/Shanghai"
                    aria-label={t("admin.nodeEdit.trafficResetTimezone")}
                  />
                </div>
                <div className="km-traffic-reset-day">
                  <TextField.Root
                    aria-label={t("admin.nodeEdit.trafficResetDate", "日期")}
                    value={String(trafficResetDay)}
                    onChange={(event) => {
                      const day = Number.parseInt(event.target.value || "0", 10);
                      setTrafficResetDay(
                        Math.min(
                          31,
                          Math.max(0, Number.isFinite(day) ? day : 0),
                        ),
                      );
                    }}
                  />
                </div>
                <div className="km-traffic-reset-time">
                  <TrafficResetTimeField
                    ariaLabel={t("admin.nodeEdit.trafficResetTime")}
                    value={trafficResetTime}
                    onChange={setTrafficResetTime}
                  />
                </div>
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                {t(
                  "admin.nodeEdit.trafficResetDay_description",
                  "0 表示关闭；1-31 为每月重置日。流量重置时间按厂商账单填写，Lite-Plus 会换算到北京时间才重置。存量数据为北京时间 0:00。保存后同步到 Agent。",
                )}
              </p>
            </div>
            <SettingCardSelect
              bordless
              title={t("admin.nodeEdit.trafficLimitType")}
              defaultValue={node.traffic_limit_type || "sum"}
              options={[
                {
                  label: t("admin.nodeEdit.trafficLimitType_sum"),
                  value: "sum",
                },
                {
                  label: t("admin.nodeEdit.trafficLimitType_max"),
                  value: "max",
                },
                {
                  label: t("admin.nodeEdit.trafficLimitType_min"),
                  value: "min",
                },
                {
                  label: t("admin.nodeEdit.trafficLimitType_up"),
                  value: "up",
                },
                {
                  label: t("admin.nodeEdit.trafficLimitType_down"),
                  value: "down",
                },
              ]}
              OnSave={(value) => {
                setTrafficLimitType(value);
              }}
            />
            <SettingCardShortTextInput
              aria-label={t("admin.nodeEdit.trafficLimit")}
              bordless
              title={t("admin.nodeEdit.trafficLimit")}
              description={t("admin.nodeEdit.trafficLimit_description")}
              defaultValue={formatBytes(traffic_limit || 0)}
              showSaveButton={false}
              onChange={(e) => {
                setTrafficLimit(stringToBytes(e.currentTarget.value));
              }}
              onBlur={(e) => {
                e.currentTarget.value = formatBytes(traffic_limit);
              }}
            ></SettingCardShortTextInput>
            <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700">
              <SettingCardShortTextInput
                aria-label={t("admin.nodeEdit.trafficResetAllowance")}
                bordless
                title={t("admin.nodeEdit.trafficResetAllowance", "重置流量额度")}
                description={t(
                  "admin.nodeEdit.trafficResetAllowance_description",
                  "同一计费周期可多次调整；与原流量限额相加，按上方统计方式计算，并在下个重置日自动归零。",
                )}
                value={trafficResetAllowanceInput}
                showSaveButton={false}
                onChange={(event) => {
                  const raw = event.currentTarget.value;
                  if (isNegativeByteInput(raw)) return;
                  setTrafficResetAllowanceInput(raw);
                  const bytes = stringToBytes(raw);
                  if (bytes >= 0) setTrafficResetAllowance(bytes);
                }}
                onBlur={() => {
                  if (isNegativeByteInput(trafficResetAllowanceInput)) {
                    const restored = Math.max(0, trafficResetAllowance);
                    setTrafficResetAllowance(restored);
                    setTrafficResetAllowanceInput(formatBytes(restored));
                    return;
                  }
                  const bytes = stringToBytes(trafficResetAllowanceInput);
                  const next = bytes < 0 ? Math.max(0, trafficResetAllowance) : bytes;
                  setTrafficResetAllowance(next);
                  setTrafficResetAllowanceInput(formatBytes(next));
                }}
              />
            </div>
            <div className="mt-3 space-y-1.5 pb-3 text-sm leading-6 text-muted-foreground">
              <div>
                {t("admin.nodeEdit.trafficEffectiveFormula", {
                  defaultValue: "原限额 {{base}} + 重置流量 {{reset}} = 本周期总限额 {{total}}",
                  base: formatBytes(traffic_limit),
                  reset: formatBytes(trafficResetAllowance),
                  total: formatBytes(traffic_limit + trafficResetAllowance),
                })}
              </div>
              <div>
                {t(
                  "admin.nodeEdit.trafficResetReportNotice",
                  "这里只调整本周期额度，不会清零或修改真实流量，日、周、月报仍按实际产生的流量统计。",
                )}
              </div>
            </div>
          </div>
          </section>
        </div>
        <Flex gap="2" justify={"end"} className="km-node-dialog-actions">
          <Dialog.Close>
            <Button type="button" variant="soft" color="gray">
              {t("common.cancel", "取消")}
            </Button>
          </Dialog.Close>
          <Button
            type="submit"
            disabled={saving}
            onClick={save}
          >
            {saving
              ? t("admin.nodeEdit.waiting", "等待...")
              : t("save", "保存")}
          </Button>
        </Flex>
      </AppDialogContent> : null}
    </Dialog.Root>
  );
}

function hasVisibleTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}

function NodeNameLink({ node, online }: { node: NodeDetail; online: boolean | null }) {
  const { t } = useTranslation();
  const pending = online === null;
  const statusLabel = online
    ? t("nodeCard.online", "在线")
    : t("nodeCard.offline", "离线");
  const pointerStart = React.useRef<{ x: number; y: number } | null>(null);

  const onPointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };

  const onNameClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || !hasVisibleTextSelection()) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dx * dx + dy * dy > 16) event.preventDefault();
  };

  return (
    <div
      className="admin-node-name-select flex w-full min-w-0 items-center gap-2 text-left"
      onPointerDownCapture={onPointerDownCapture}
    >
      <span className="admin-node-country-flag">
        <Flag flag={node.region} compact />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="block max-w-full truncate">
          <Link
            to={`/admin/servers/${node.uuid}`}
            className="admin-node-name-link text-[15px] font-semibold leading-6 hover:underline"
            title={node.name}
            onClick={onNameClick}
          >
            {node.name}
          </Link>
        </span>
        <span
          className="flex h-[18px] items-center gap-1.5 text-[13.5px] text-muted-foreground"
          aria-hidden={pending || undefined}
          style={pending ? { visibility: "hidden" } : undefined}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: online ? NODE_ONLINE : NODE_OFFLINE }}
          />
          {statusLabel}
        </span>
      </span>
    </div>
  );
}

function BillingButton({ node, initiallyOpen = false, onClose }: { node: NodeDetail; initiallyOpen?: boolean; onClose?: () => void }) {
  const { t } = useTranslation();
  const { refresh } = useNodeDetails();
  const [open, setOpen] = useState(initiallyOpen);
  const [saving, setSaving] = useState(false);
  const [formEpoch, setFormEpoch] = useState(0);
  const [billingCycle, setBillingCycle] = React.useState("");
  const [autoRenewal, setAutoRenewal] = React.useState(false);
  const [currency, setCurrency] = React.useState("");
  const [expiryTimezone, setExpiryTimezone] = React.useState(
    DEFAULT_EXPIRY_TIMEZONE,
  );
  const [expiryDate, setExpiryDate] = React.useState("0001-01-01");
  const [expiryTime, setExpiryTime] = React.useState("00:00:00");
  const openedExpiryRef = React.useRef({
    timezone: DEFAULT_EXPIRY_TIMEZONE,
    local: "",
  });
  const timezoneOptions = React.useMemo(
    () => expiryTimezoneOptions(expiryDate),
    [expiryDate],
  );
  const hydrateBillingForm = (source: NodeDetail) => {
    const timezone = normalizeExpiryTimezone(source.expiry_timezone);
    const parts = formatInstantInTimezone(source.expired_at, timezone);
    const date = parts?.date || "0001-01-01";
    const time = parts?.time || "00:00:00";
    setBillingCycle(source.billing_cycle.toString());
    setAutoRenewal(source.auto_renewal || false);
    setCurrency(currencyForDisplay(source.currency || "$"));
    setExpiryTimezone(timezone);
    setExpiryDate(date);
    setExpiryTime(time);
    openedExpiryRef.current = {
      timezone,
      local: toExpiryLocalDateTime(date, time) || `${date}T${time}`,
    };
    setFormEpoch((value) => value + 1);
  };

  React.useLayoutEffect(() => {
    if (open) hydrateBillingForm(node);
    // Mounted already open, so the close-to-open handler never runs.
    // A later list refresh must not wipe a draft that is already on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const formData = new FormData(e.target as HTMLFormElement);
      const priceValue = (formData.get("price") as string) || "0";

      const price = parseFloat(priceValue);

      if (isNaN(price) || (price < 0 && price !== -1)) {
        toast.error(t("admin.nodeTable.invalidPrice"));
        return;
      }
      const billingCycleValue = parseInt(
        (formData.get("billingCycle") as string) || "30"
      );
      const rawCurrency = (formData.get("currency") as string) || "$";
      const currencyValue = currencyForStorage(rawCurrency);
      const payload: Record<string, unknown> = {
        price,
        billing_cycle: billingCycleValue,
        currency: currencyValue,
        auto_renewal: autoRenewal,
      };
      const expiryFields = expiryFieldsIfChanged({
        timezone: expiryTimezone,
        localDateTime: toExpiryLocalDateTime(expiryDate, expiryTime),
        openedTimezone: openedExpiryRef.current.timezone,
        openedLocal: openedExpiryRef.current.local,
      });
      if (expiryFields === "invalid") {
        toast.error(t("admin.nodeTable.invalidExpiry", "到期时间无效"));
        return;
      }
      if (expiryFields) {
        Object.assign(payload, expiryFields);
      }

      const response = await fetch(`/api/admin/client/${node.uuid}/edit`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
      });
      const text = await response.text();
      let body: { message?: string } | null = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      const followUp = billingSaveFollowUp(response.ok);
      if (!followUp.ok) {
        throw new Error(body?.message || text || `HTTP ${response.status}`);
      }
      if (followUp.refresh) {
        setCurrency(currencyForDisplay(currencyValue));
        refresh();
      }
      if (followUp.close) {
        setOpen(false);
        onClose?.();
      }
    } catch (error) {
      toast.error(
        `${t("admin.nodeEdit.saveError", "保存失败")}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (next && !open) hydrateBillingForm(node);
        setOpen(next);
        if (!next) onClose?.();
      }}
    >
      {initiallyOpen ? null : <Dialog.Trigger>
        <IconButton
          variant="ghost"
          title={t("admin.nodeTable.billing", "账单")}
        >
          <CircleDollarSign size="18" />
        </IconButton>
      </Dialog.Trigger>}
      {open ? <AppDialogContent
        maxWidth={820}
        className="km-node-dialog km-node-billing-dialog"
      >
        <Dialog.Title>
          {t("admin.nodeTable.billing", "账单")}
        </Dialog.Title>
        <Dialog.Description>
          {t(
            "admin.nodeTable.billingDescription",
            "设置价格、计费周期与到期续费策略。",
          )}
        </Dialog.Description>
        <form key={formEpoch} onSubmit={handleSave}>
          <div className="km-node-dialog-grid">
            <section className="km-node-dialog-pane km-node-dialog-fields">
            <label className="font-bold">
              <label>{t("admin.nodeTable.price")}</label>
              <label className="text-muted-foreground text-sm ml-1 font-medium">
                {t("admin.nodeTable.priceTips")}
              </label>
            </label>
            <TextField.Root name="price" defaultValue={node.price} />

            <label className="font-bold">
              <label>{t("admin.nodeTable.currency", "货币")}</label>
              <label className="text-muted-foreground text-sm ml-1 font-medium">
                {t("admin.nodeTable.currencyTips")}
              </label>
            </label>
            <SelectOrInput
              options={["¥", "$", "€", "£", "C$", "HK$"]}
              name="currency"
              value={currency}
              onChange={(value) => setCurrency(value)}
              allowCustomInput
            />
            <label className="font-bold flex items-center gap-1">
              {t("admin.nodeTable.billingCycle")} <Tips><span dangerouslySetInnerHTML={{ __html: t("admin.nodeTable.billingCycleTips") }}></span></Tips>
            </label>
            <Select.Root
              name="billingCycle"
              className="w-full"
              value={billingCycle === "0" ? "" : billingCycle}
              onValueChange={setBillingCycle}
            >
              <Select.Trigger
                className="w-full"
                placeholder={t("admin.nodeTable.selectBillingCycle", "选择计费周期")}
              />
              <Select.Content>
                <Select.Item value="30">{t("common.monthly")}</Select.Item>
                <Select.Item value="92">{t("common.quarterly")}</Select.Item>
                <Select.Item value="184">{t("common.semi_annual")}</Select.Item>
                <Select.Item value="365">{t("common.annual")}</Select.Item>
                <Select.Item value="730">{t("common.biennial")}</Select.Item>
                <Select.Item value="1095">{t("common.triennial")}</Select.Item>
                <Select.Item value="1825">{t("common.quinquennial")}</Select.Item>
                <Select.Item value="-1">{t("common.once")}</Select.Item>
              </Select.Content>
            </Select.Root>
            </section>
            <section className="km-node-dialog-pane km-node-dialog-fields">
            <Flex gap="2" align="center">
              <label className="font-bold">
                {t("admin.nodeTable.expiredAt")}
              </label>
            </Flex>
            <div className="km-traffic-reset-clock-row">
              <div className="km-traffic-reset-timezone">
                <SelectOrInput
                  options={timezoneOptions}
                  value={expiryTimezone}
                  allowCustomInput
                  onChange={setExpiryTimezone}
                  placeholder={DEFAULT_EXPIRY_TIMEZONE}
                  aria-label={t("admin.nodeTable.expiryTimezone", "到期时区")}
                />
              </div>
              <div className="km-expiry-date">
                <ExpiryDateField
                  ariaLabel={t("admin.nodeTable.expiredAt")}
                  value={expiryDate}
                  onChange={setExpiryDate}
                />
              </div>
              <div className="km-traffic-reset-time">
                <TrafficResetTimeField
                  ariaLabel={t("admin.nodeTable.expiryTime", "到期时刻")}
                  value={expiryTime}
                  onChange={setExpiryTime}
                />
              </div>
            </div>
            <div className="km-expiry-quick-actions">
              <button
                type="button"
                className="km-expiry-quick-action"
                onClick={() => {
                  const parts = nowInExpiryTimezone(expiryTimezone);
                  if (!parts) return;
                  setExpiryDate(parts.date);
                  setExpiryTime(parts.time);
                }}
              >
                {t("admin.nodeTable.setToNow", "今")}
              </button>
              <button
                type="button"
                className="km-expiry-quick-action"
                onClick={() => {
                  const future = new Date();
                  future.setFullYear(future.getFullYear() + 200);
                  const parts = formatInstantInTimezone(future, expiryTimezone);
                  if (!parts) return;
                  setExpiryDate(parts.date);
                  setExpiryTime("00:00:00");
                }}
              >
                {t("admin.nodeTable.setToLongTerm", "设置为长期")}
              </button>
            </div>
            <SettingCardSwitch
              bordless
              title={t("admin.nodeTable.autoRenewal")}
              description={t("admin.nodeTable.autoRenewalDescription")}
              defaultChecked={autoRenewal}
              onChange={setAutoRenewal}
            />
            </section>
          </div>
          <Flex gap="2" justify="end" className="km-node-dialog-actions">
            <Dialog.Close>
              <Button type="button" variant="soft" color="gray">
                {t("common.cancel", "取消")}
              </Button>
            </Dialog.Close>
            <Button type="submit" disabled={saving}>
              {t("save")}
            </Button>
          </Flex>
        </form>
      </AppDialogContent> : null}
    </Dialog.Root>
  );
}
