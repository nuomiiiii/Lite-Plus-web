import type { ProtectionConfig, ProtectionView } from "./types";

async function readPayload(response: Response) {
  return response.json().catch(() => ({}));
}

export async function fetchProtectionView(uuid: string, signal?: AbortSignal): Promise<ProtectionView> {
  const response = await fetch(`/api/admin/protection/${encodeURIComponent(uuid)}`, {
    credentials: "same-origin",
    signal,
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
  return (payload?.data ?? payload) as ProtectionView;
}

export async function postProtection(
  uuid: string,
  path: string,
  method: string,
  body: Record<string, unknown>,
): Promise<ProtectionView> {
  const response = await fetch(`/api/admin/protection/${encodeURIComponent(uuid)}${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid, ...body }),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
  return (payload?.data ?? payload) as ProtectionView;
}

export async function saveProtectionConfig(
  uuid: string,
  grant: string,
  pageID: string,
  config: ProtectionConfig,
): Promise<ProtectionView> {
  return postProtection(uuid, "", "PUT", { grant, page_id: pageID, config });
}

export async function saveProtectionGroup(
  uuid: string,
  grant: string,
  pageID: string,
  body: { id?: string; name: string; enabled?: boolean; members: string[] },
): Promise<ProtectionView> {
  const response = await fetch("/api/admin/protection-groups", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid, grant, page_id: pageID, ...body }),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
  return (payload?.data ?? payload) as ProtectionView;
}

export async function deleteProtectionGroup(
  uuid: string,
  grant: string,
  pageID: string,
  id: string,
): Promise<ProtectionView> {
  const response = await fetch(`/api/admin/protection-groups/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid, grant, page_id: pageID, id }),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`);
  return (payload?.data ?? payload) as ProtectionView;
}
