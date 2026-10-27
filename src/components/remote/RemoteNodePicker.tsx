import { useEffect, useId, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTranslation } from "react-i18next";

import Flag from "@/components/Flag";
import AdminNodeStatusSummary from "@/components/admin/AdminNodeStatusSummary";
import { ADMIN_LIST_SEARCH_SX } from "@/components/admin/adminListLayout";
import { CustomTags } from "@/components/PriceTags";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Layers3,
  Search,
  SearchX,
  X,
} from "@/components/admin/muiIcons";
import { NODE_OFFLINE, NODE_ONLINE } from "@/theme/brand";
import {
  displayRemoteAddress,
  filterRemoteNodes,
  orderRemoteNodes,
  nextRemotePickerPageSize,
  paginateRemoteNodes,
  type RemoteNodePickerItem,
  type RemoteNodeStatusFilter,
} from "@/utils/remoteNodePicker";
import { firstNodeTag, REMOTE_COMPACT_QUERY, UNREPORTED_ADDRESS } from "@/pages/terminal/remoteChrome";

type RemoteNodePickerProps<T extends RemoteNodePickerItem> = {
  nodes: readonly T[];
  onlineSet: ReadonlySet<string>;
  available?: boolean;
  selectedUUID?: string;
  openedUUIDs?: ReadonlySet<string>;
  pageSize?: number;
  rowsPerPage?: number;
  columns?: 2;
  clipOverflow?: "top" | "bottom";
  onSelect: (node: T) => void;
  allowOffline?: boolean;
};

function addressText(value: string) {
  return value || UNREPORTED_ADDRESS;
}

export default function RemoteNodePicker<T extends RemoteNodePickerItem>({
  nodes,
  onlineSet,
  available = true,
  selectedUUID,
  openedUUIDs,
  pageSize = 16,
  rowsPerPage,
  columns,
  clipOverflow = "bottom",
  onSelect,
  allowOffline = false,
}: RemoteNodePickerProps<T>) {
  const { t } = useTranslation();
  const compact = useMediaQuery(REMOTE_COMPACT_QUERY, { noSsr: true });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RemoteNodeStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [responsivePageSize, setResponsivePageSize] = useState(pageSize);
  const pageSizeRef = useRef(pageSize);
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsGridRef = useRef<HTMLDivElement>(null);
  const resultsAreaRef = useRef<HTMLDivElement>(null);
  const searchID = useId();
  const orderedNodes = useMemo(() => orderRemoteNodes(nodes), [nodes]);
  const filteredNodes = useMemo(
    () =>
      filterRemoteNodes(
        orderedNodes,
        query,
        available ? status : "all",
        onlineSet,
      ),
    [available, onlineSet, orderedNodes, query, status],
  );
  const onlineCount = useMemo(
    () => nodes.filter((node) => onlineSet.has(node.uuid)).length,
    [nodes, onlineSet],
  );
  const noMatches = nodes.length > 0 && filteredNodes.length === 0;
  const hasResults = filteredNodes.length > 0;
  const effectivePageSize = responsivePageSize;
  const nodePage = useMemo(
    () => paginateRemoteNodes(filteredNodes, page, effectivePageSize),
    [effectivePageSize, filteredNodes, page],
  );
  const { currentPage, totalPages, nodes: visibleNodes } = nodePage;

  useEffect(() => {
    const area = resultsAreaRef.current;
    if (!area || !hasResults) return;

    const updatePageSize = () => {
      const grid = resultsGridRef.current;
      const columnCount = grid
        ? window
            .getComputedStyle(grid)
            .gridTemplateColumns
            .trim()
            .split(/\s+/)
            .filter((track) => track && track !== "none").length
        : compact
          ? 1
          : 2;
      const firstCard = grid?.querySelector(".remote-node-picker-card") as HTMLElement | null;
      const gap = grid ? Number.parseFloat(window.getComputedStyle(grid).rowGap || "10") || 10 : 10;
      const rowHeight = (firstCard?.getBoundingClientRect().height || (compact ? 76 : 126)) + gap;
      const rows = rowsPerPage ?? Math.max(1, Math.floor((area.clientHeight + gap) / Math.max(rowHeight, 1)));
      const measured = Math.max(1, columnCount || 1) * Math.max(1, rows);
      const rendered = grid?.querySelectorAll(".remote-node-picker-card").length ?? 0;
      const nextPageSize = nextRemotePickerPageSize(measured, pageSizeRef.current, rendered);
      pageSizeRef.current = nextPageSize;
      setResponsivePageSize((current) => (current === nextPageSize ? current : nextPageSize));
    };

    updatePageSize();
    const observer = new ResizeObserver(updatePageSize);
    observer.observe(area);
    if (resultsGridRef.current) observer.observe(resultsGridRef.current);
    return () => observer.disconnect();
  }, [compact, hasResults, rowsPerPage]);

  return (
    <Box className="remote-node-picker" sx={{ display: "flex", minWidth: 0, minHeight: 0, flex: "1 1 auto", flexDirection: "column" }}>
      <Stack
        className="remote-node-picker-controls"
        direction={{ xs: "column", sm: "row" }}
        spacing={{ xs: 1, sm: 1.5 }}
        sx={{
          mb: { xs: 1.25, sm: 2 },
          flex: "0 0 auto",
          flexShrink: 0,
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: { xs: "flex-start", sm: "space-between" },
        }}
      >
        <TextField
          inputRef={searchRef}
          id={searchID}
          size="small"
          type="search"
          value={query}
          placeholder={t("terminal.search_placeholder")}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          sx={{
            ...ADMIN_LIST_SEARCH_SX,
            flex: { xs: "0 0 auto", sm: "1 1 280px" },
            width: { xs: "100%", sm: "auto" },
            maxWidth: { sm: 520 },
            minWidth: { xs: 0, sm: 160 },
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label={t("terminal.clear_search")}
                    onClick={() => {
                      setQuery("");
                      setPage(1);
                      searchRef.current?.focus();
                    }}
                  >
                    <X size={14} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
        />
        <AdminNodeStatusSummary
          total={nodes.length}
          online={onlineCount}
          available={available}
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      </Stack>

      <Box ref={resultsAreaRef} className="remote-node-picker-results" sx={{ minHeight: 0, flex: "1 1 auto", overflow: compact ? "auto" : "hidden" }}>
        {filteredNodes.length > 0 ? (
          <Box
            ref={resultsGridRef}
            className="remote-node-picker-grid"
            sx={{
              display: "grid",
              alignContent: clipOverflow === "top" ? "end" : "start",
              gridAutoRows: "max-content",
              gridTemplateColumns: {
                xs: "1fr",
                sm: columns === 2
                  ? "repeat(2, minmax(0, 1fr))"
                  : "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
              },
              gap: 1.25,
            }}
          >
            {visibleNodes.map((node) => {
              const online = onlineSet.has(node.uuid);
              const knownOnline = available && online;
              const knownOffline = available && !online;
              const selectable = allowOffline || knownOnline;
              const selected = selectedUUID === node.uuid;
              const opened = Boolean(openedUUIDs?.has(node.uuid));
              const flag = node.region_override?.trim() || node.region?.trim() || "UN";
              const ipv4 = displayRemoteAddress(node.ipv4);
              const ipv6 = displayRemoteAddress(node.ipv6);
              const group = node.group?.trim() || t("terminal.ungrouped");
              const tag = firstNodeTag(node.tags);

              return (
                <Paper
                  key={node.uuid}
                  className="remote-node-picker-card"
                  variant="outlined"
                  role="button"
                  tabIndex={selectable ? 0 : -1}
                  aria-disabled={!selectable}
                  aria-label={selectable ? node.name : t("nodeCard.offline")}
                  onClick={() => {
                    if (selectable) onSelect(node);
                  }}
                  onKeyDown={(event) => {
                    if (!selectable || (event.key !== "Enter" && event.key !== " ")) return;
                    event.preventDefault();
                    onSelect(node);
                  }}
                  sx={{
                    display: "flex",
                    minHeight: 0,
                    height: "auto",
                    flexDirection: compact ? "row" : "column",
                    overflow: "hidden",
                    borderRadius: "8px",
                    borderColor: selected ? "primary.main" : "divider",
                    bgcolor: "background.paper",
                    cursor: selectable ? "pointer" : "not-allowed",
                    opacity: knownOffline && !allowOffline ? 0.72 : 1,
                    px: 1.5,
                    py: 1.25,
                    boxShadow: selected
                      ? (theme) => `inset 0 0 0 1px ${theme.palette.primary.main}`
                      : "none",
                    "&:hover": selectable
                      ? { borderColor: "primary.main" }
                      : undefined,
                    "&:focus-visible": {
                      outline: "2px solid",
                      outlineColor: "primary.main",
                      outlineOffset: "2px",
                    },
                  }}
                >
                  <Box className="remote-node-picker-card-identity" sx={{ alignItems: "center", minWidth: 0, flex: 1 }}>
                    <Box className="admin-node-country-flag" sx={{ flexShrink: 0, lineHeight: 0, alignSelf: "center" }}>
                      <Flag flag={flag} compact />
                    </Box>
                    <Box className="remote-node-picker-card-copy" sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }} title={node.name}>
                          {node.name}
                        </Typography>
                        {opened ? (
                          <Chip
                            size="small"
                            label={t("terminal.session.opened")}
                            sx={{ height: 20, fontSize: 10, flexShrink: 0 }}
                          />
                        ) : null}
                      </Stack>
                      <Box className="remote-node-picker-ips" aria-label={t("terminal.ip_address")}>
                        {[
                          ["IPv4", ipv4],
                          ["IPv6", ipv6],
                        ].map(([label, value]) => (
                          <Box key={label} className="remote-node-picker-ip-row">
                            <Typography component="span" sx={{ color: "text.secondary", fontSize: 11, flex: "0 0 auto" }}>
                              {label}
                            </Typography>
                            <Typography
                              component="span"
                              noWrap
                              title={value || undefined}
                              aria-label={value ? undefined : t("terminal.address_unreported")}
                              sx={{
                                fontSize: 12,
                                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                                color: value ? undefined : "text.secondary",
                              }}
                            >
                              {addressText(value)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                    {selected ? (
                      <Box sx={{ color: NODE_ONLINE, display: "flex", flexShrink: 0 }}>
                        <Check size={16} />
                      </Box>
                    ) : null}
                  </Box>
                  <Stack
                    className="remote-node-picker-meta"
                    direction={compact ? "column" : "row"}
                    spacing={0.75}
                    sx={{
                      mt: compact ? 0 : 1.25,
                      ml: compact ? 1 : 0,
                      pt: compact ? 0 : 1,
                      borderTop: compact ? 0 : 1,
                      borderColor: "divider",
                      minWidth: compact ? 92 : 0,
                      flex: compact ? "0 0 auto" : undefined,
                      alignItems: compact ? "flex-end" : "center",
                      justifyContent: compact ? "flex-start" : "space-between",
                    }}
                  >
                    <Typography
                      noWrap
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.75,
                        fontSize: 11,
                        color: online ? NODE_ONLINE : NODE_OFFLINE,
                        visibility: available ? "visible" : "hidden",
                      }}
                    >
                      <Box
                        component="span"
                        sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "currentColor" }}
                      />
                      {online ? t("nodeCard.online") : t("nodeCard.offline")}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0, color: "text.secondary" }}>
                      <Layers3 size={12} />
                      <Typography noWrap title={group} sx={{ fontSize: 11 }}>
                        {group}
                      </Typography>
                    </Stack>
                    {(node.tags || "").trim() ? (
                      <Box className="admin-cell-clip-row" title={node.tags} sx={{ minWidth: 0, maxWidth: compact ? 92 : 140 }}>
                        <CustomTags tags={tag || node.tags || ""} />
                      </Box>
                    ) : (
                      <Typography noWrap sx={{ fontSize: 11, color: "text.secondary" }}>
                        {t("common.tags", "标签")} {UNREPORTED_ADDRESS}
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Box>
        ) : (
          <Stack
            spacing={1}
            sx={{ minHeight: 120, py: 2, alignItems: "center", justifyContent: "center", color: "text.secondary", textAlign: "center" }}
          >
            <SearchX size={26} />
            <Typography sx={{ fontWeight: 500, color: "text.primary" }}>
              {noMatches ? t("terminal.no_results") : t("terminal.no_servers")}
            </Typography>
            {noMatches ? (
              <Typography variant="body2">{t("terminal.try_different")}</Typography>
            ) : null}
          </Stack>
        )}
      </Box>
      {totalPages > 1 ? (
        <Stack
          className="remote-node-picker-footer"
          direction="row"
          spacing={1}
          sx={{ mt: 1.25, flexShrink: 0, justifyContent: "flex-end", alignItems: "center" }}
        >
          <IconButton
            size="small"
            disabled={currentPage === 1}
            title={t("terminal.previous_page")}
            aria-label={t("terminal.previous_page")}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft size={16} />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 54, textAlign: "center", color: "text.secondary" }}>
            {t("terminal.page_status", { page: currentPage, total: totalPages })}
          </Typography>
          <IconButton
            size="small"
            disabled={currentPage === totalPages}
            title={t("terminal.next_page")}
            aria-label={t("terminal.next_page")}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            <ChevronRight size={16} />
          </IconButton>
        </Stack>
      ) : null}
    </Box>
  );
}
