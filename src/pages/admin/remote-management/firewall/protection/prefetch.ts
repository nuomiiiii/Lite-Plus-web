import { fetchProtectionView } from "./api";
import type { ProtectionView } from "./types";

const views = new Map<string, ProtectionView>();
const inflight = new Map<string, Promise<ProtectionView | null>>();

export function getProtectionViewSnapshot(uuid: string): ProtectionView | null {
  return views.get(uuid) ?? null;
}

export function rememberProtectionView(uuid: string, view: ProtectionView | null | undefined) {
  if (!uuid || !view) return;
  views.set(uuid, view);
}

async function loadProtectionView(uuid: string): Promise<ProtectionView | null> {
  const existing = inflight.get(uuid);
  if (existing) return existing;
  const request = (async () => {
    const data = await fetchProtectionView(uuid);
    views.set(uuid, data);
    return data;
  })()
    .catch(() => null)
    .finally(() => {
      inflight.delete(uuid);
    });
  inflight.set(uuid, request);
  return request;
}

export function prefetchProtectionView(uuid: string) {
  if (!uuid) return Promise.resolve(null);
  const cached = views.get(uuid);
  if (cached) return Promise.resolve(cached);
  return loadProtectionView(uuid);
}

export function refreshProtectionView(uuid: string) {
  if (!uuid) return Promise.resolve(null);
  return loadProtectionView(uuid);
}

export async function resolveProtectionView(uuid: string, signal?: AbortSignal): Promise<ProtectionView> {
  const cached = views.get(uuid);
  if (cached) return cached;
  const data = await loadProtectionView(uuid);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (data) return data;
  return fetchProtectionView(uuid, signal);
}
