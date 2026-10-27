type FirewallViewCache = Record<string, unknown>;

const views = new Map<string, FirewallViewCache>();
const inflight = new Map<string, Promise<FirewallViewCache | null>>();

function readPayload(response: Response) {
  return response.json().catch(() => ({}));
}

export function getFirewallViewSnapshot<T = FirewallViewCache>(uuid: string): T | null {
  const row = views.get(uuid);
  return row ? (row as T) : null;
}

export function rememberFirewallView(uuid: string, view: unknown) {
  if (!uuid || !view || typeof view !== "object") return;
  views.set(uuid, view as FirewallViewCache);
}

async function fetchFirewallView(uuid: string): Promise<FirewallViewCache | null> {
  const existing = inflight.get(uuid);
  if (existing) return existing;
  const request = (async () => {
    const response = await fetch(`/api/admin/firewall/${encodeURIComponent(uuid)}`);
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }
    const data = payload?.data ?? null;
    if (data && typeof data === "object") views.set(uuid, data as FirewallViewCache);
    return data as FirewallViewCache | null;
  })().finally(() => {
    inflight.delete(uuid);
  });
  inflight.set(uuid, request);
  return request;
}

export function prefetchFirewallView(uuid: string) {
  if (!uuid) return Promise.resolve(null);
  const cached = views.get(uuid);
  if (cached) return Promise.resolve(cached);
  return fetchFirewallView(uuid);
}

export function refreshFirewallView(uuid: string) {
  if (!uuid) return Promise.resolve(null);
  return fetchFirewallView(uuid);
}
