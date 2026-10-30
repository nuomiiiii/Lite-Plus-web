import { compareNodesByBackendOrder } from "../lib/nodeOrder.ts";

export type RemoteNodeStatusFilter = "all" | "online" | "offline";

export type RemoteNodePickerItem = {
  uuid: string;
  name: string;
  ipv4?: string;
  ipv6?: string;
  group?: string;
  tags?: string;
  region?: string;
  region_override?: string;
  weight?: number | null;
  created_at?: string | null;
};

const normalizeSearchValue = (value: string | undefined) =>
  value?.trim().toLocaleLowerCase() ?? "";

export function remoteNodeSearchText(node: RemoteNodePickerItem): string {
  const tagText = (node.tags || "")
    .split(";")
    .map((tag) => tag.replace(/<\w+>$/, "").trim())
    .filter(Boolean)
    .join(" ");
  return [node.name, node.ipv4, node.ipv6, node.group, node.tags, tagText]
    .map(normalizeSearchValue)
    .filter(Boolean)
    .join("\n");
}

export function orderRemoteNodes<T extends RemoteNodePickerItem>(
  nodes: readonly T[],
): T[] {
  return [...nodes].sort(compareNodesByBackendOrder);
}

export function filterRemoteNodes<T extends RemoteNodePickerItem>(
  nodes: readonly T[],
  query: string,
  status: RemoteNodeStatusFilter,
  onlineSet: ReadonlySet<string>,
): T[] {
  const normalizedQuery = normalizeSearchValue(query);

  return nodes.filter((node) => {
    const online = onlineSet.has(node.uuid);
    const statusMatches =
      status === "all" ||
      (status === "online" && online) ||
      (status === "offline" && !online);

    return (
      statusMatches &&
      (!normalizedQuery || remoteNodeSearchText(node).includes(normalizedQuery))
    );
  });
}

export function nextRemotePickerPageSize(
  measured: number,
  current: number,
  renderedCount: number,
) {
  const safeMeasured = Math.max(1, Math.floor(measured) || 1);
  const safeCurrent = Math.max(1, Math.floor(current) || safeMeasured);
  if (renderedCount > 0 && renderedCount < safeCurrent) return safeCurrent;
  return safeMeasured;
}

export function paginateRemoteNodes<T>(
  nodes: readonly T[],
  page: number,
  pageSize: number,
) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(nodes.length / safePageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (currentPage - 1) * safePageSize;

  return {
    currentPage,
    totalPages,
    nodes: nodes.slice(start, start + safePageSize),
  };
}

export function pageForSelectedRemoteNode<T extends { uuid: string }>(
  nodes: readonly T[],
  uuid: string | undefined,
  pageSize: number,
) {
  if (!uuid) return 1;
  const index = nodes.findIndex((node) => node.uuid === uuid);
  if (index < 0) return 1;
  return Math.floor(index / Math.max(1, Math.floor(pageSize))) + 1;
}

export function displayRemoteAddress(value: string | undefined): string {
  return value?.trim() || "";
}
