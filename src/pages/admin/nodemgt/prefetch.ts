import { sameOriginApiPath, sameOriginFetchInit } from "@/utils/security";

export type NodemgtTemplateList = {
  templates: any[];
  builtins: any[];
  bindings: any[];
};

export type NodemgtSnapshot = {
  inbounds: any[];
  users: any[];
  plans: any[];
  certs: any[];
  root_certs: any[];
  subs: any[];
  outbounds: any[];
  routes: any[];
  nodes: any[];
  audit: any[];
  diag: Record<string, any>;
  settings: Record<string, any>;
  delivery: any[];
  templates: NodemgtTemplateList;
  at: number;
};

type NodemgtRequest = {
  key: keyof Omit<NodemgtSnapshot, "at">;
  method: string;
  params?: Record<string, unknown>;
};

const NODEMGT_REQUESTS: NodemgtRequest[] = [
  { key: "inbounds", method: "admin:nodemgt.inbound.list" },
  { key: "users", method: "admin:nodemgt.user.list" },
  { key: "plans", method: "admin:nodemgt.plan.list" },
  { key: "certs", method: "admin:nodemgt.cert.list" },
  { key: "root_certs", method: "admin:nodemgt.root_cert.list" },
  { key: "subs", method: "admin:nodemgt.subscription.list" },
  { key: "outbounds", method: "admin:nodemgt.outbound.list" },
  { key: "routes", method: "admin:nodemgt.route.list" },
  { key: "nodes", method: "admin:nodemgt.node.list" },
  { key: "audit", method: "admin:nodemgt.audit.list", params: { limit: 80 } },
  { key: "diag", method: "admin:nodemgt.diag.status" },
  { key: "settings", method: "admin:nodemgt.settings.get" },
  { key: "delivery", method: "admin:nodemgt.control.status" },
  { key: "templates", method: "admin:nodemgt.template.list" },
];

const SNAPSHOT_TTL_MS = 12_000;

type InflightPrefetch = {
  run: Promise<NodemgtSnapshot>;
  errors: Map<string, Error>;
};

let snapshot: NodemgtSnapshot | null = null;
let inflight: InflightPrefetch | null = null;
let rpcSeq = 1;
let fetchGen = 0;
const partialListeners = new Set<(snap: NodemgtSnapshot) => void>();

export function emptyNodemgtSnapshot(): NodemgtSnapshot {
  return {
    inbounds: [],
    users: [],
    plans: [],
    certs: [],
    root_certs: [],
    subs: [],
    outbounds: [],
    routes: [],
    nodes: [],
    audit: [],
    diag: {},
    settings: {},
    delivery: [],
    templates: emptyNodemgtTemplates(),
    at: 0,
  };
}

export function emptyNodemgtTemplates(): NodemgtTemplateList {
  return { templates: [], builtins: [], bindings: [] };
}

export function hasNodemgtTemplates(value?: NodemgtTemplateList | null) {
  return Boolean(value && (value.templates.length || value.builtins.length || value.bindings.length));
}

export function getNodemgtSnapshot(): NodemgtSnapshot | null {
  return snapshot;
}

export function nodemgtPrimaryMethods(tab: string): string[] {
  switch (tab) {
    case "inbounds":
      return ["admin:nodemgt.inbound.list", "admin:nodemgt.control.status"];
    case "outbounds":
      return ["admin:nodemgt.outbound.list", "admin:nodemgt.control.status"];
    case "routes":
      return ["admin:nodemgt.route.list", "admin:nodemgt.control.status"];
    case "users":
      return ["admin:nodemgt.user.list", "admin:nodemgt.control.status"];
    case "plans":
      return ["admin:nodemgt.plan.list", "admin:nodemgt.user.list"];
    case "certs":
      return ["admin:nodemgt.cert.list", "admin:nodemgt.root_cert.list", "admin:nodemgt.settings.get"];
    case "subscriptions":
    case "templates":
      return [
        "admin:nodemgt.settings.get",
        "admin:nodemgt.subscription.list",
        "admin:nodemgt.plan.list",
        "admin:nodemgt.template.list",
      ];
    case "audit":
      return ["admin:nodemgt.audit.list"];
    default:
      return [
        "admin:nodemgt.inbound.list",
        "admin:nodemgt.user.list",
        "admin:nodemgt.cert.list",
        "admin:nodemgt.control.status",
        "admin:nodemgt.diag.status",
        "admin:nodemgt.node.list",
      ];
  }
}

export function rememberNodemgtSnapshot(next: NodemgtSnapshot, done = true): NodemgtSnapshot {
  snapshot = { ...next, at: done ? Date.now() : 0 };
  partialListeners.forEach((fn) => fn(snapshot!));
  return snapshot;
}

export function resetNodemgtSnapshot() {
  snapshot = null;
  inflight = null;
  rpcSeq = 1;
  fetchGen += 1;
}

export function patchNodemgtSnapshot(patch: Partial<NodemgtSnapshot>): NodemgtSnapshot {
  fetchGen += 1;
  return rememberNodemgtSnapshot({
    ...(snapshot ?? emptyNodemgtSnapshot()),
    ...patch,
  }, false);
}

function throwPrimaryRPCErrors(primary: readonly string[] | undefined, errors: Map<string, Error>) {
  const methods = primary?.length
    ? primary
    : NODEMGT_REQUESTS.map((request) => request.method);
  for (const method of methods) {
    const error = errors.get(method);
    if (error) throw error;
  }
}

export async function prefetchNodemgtAdmin(options?: {
  force?: boolean;
  reload?: boolean;
  primary?: readonly string[];
  onPartial?: (snap: NodemgtSnapshot) => void;
}): Promise<NodemgtSnapshot> {
  const fresh = Boolean(snapshot?.at) && Date.now() - snapshot!.at < SNAPSHOT_TTL_MS;
  if (!options?.force && !options?.reload && fresh && snapshot) return snapshot;
  if (options?.reload) fetchGen += 1;
  if (options?.onPartial) partialListeners.add(options.onPartial);
  try {
    if (inflight) {
      if (snapshot) options?.onPartial?.(snapshot);
      const batch = inflight;
      await batch.run;
      if (!options?.reload) {
        throwPrimaryRPCErrors(options?.primary, batch.errors);
        return snapshot ?? emptyNodemgtSnapshot();
      }
    }
    if (inflight) {
      const batch = inflight;
      await batch.run;
      throwPrimaryRPCErrors(options?.primary, batch.errors);
      return snapshot ?? emptyNodemgtSnapshot();
    }
    const errors = new Map<string, Error>();
    const gen = fetchGen;
    const batch: InflightPrefetch = {
      errors,
      run: fetchNodemgtAdmin(options, errors, gen).finally(() => {
        if (inflight === batch) inflight = null;
      }),
    };
    inflight = batch;
    const snap = await batch.run;
    throwPrimaryRPCErrors(options?.primary, batch.errors);
    return snap;
  } finally {
    if (options?.onPartial) partialListeners.delete(options.onPartial);
  }
}

async function fetchNodemgtAdmin(
  options: { primary?: readonly string[] } | undefined,
  errors: Map<string, Error>,
  gen: number,
): Promise<NodemgtSnapshot> {
  const next = snapshot ? { ...snapshot } : emptyNodemgtSnapshot();
  const primary = new Set(options?.primary ?? []);
  const remember = (done: boolean) => {
    if (gen !== fetchGen) return snapshot ?? next;
    return rememberNodemgtSnapshot(next, done);
  };
  const run = async (request: NodemgtRequest) => {
    try {
      const value = await rpcCall(request.method, request.params);
      assignSnapshotValue(next, request.key, value);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      errors.set(request.method, error);
    }
  };
  const first = primary.size
    ? NODEMGT_REQUESTS.filter((request) => primary.has(request.method))
    : NODEMGT_REQUESTS;
  const rest = primary.size
    ? NODEMGT_REQUESTS.filter((request) => !primary.has(request.method))
    : [];
  await Promise.all(first.map((request) => run(request)));
  remember(rest.length === 0 && errors.size === 0);
  if (rest.length) {
    await Promise.all(rest.map((request) => run(request)));
    remember(errors.size === 0);
  }
  return snapshot ?? next;
}

function assignSnapshotValue(
  target: NodemgtSnapshot,
  key: NodemgtRequest["key"],
  value: unknown,
) {
  if (key === "templates") {
    target.templates = asTemplateList(value);
    return;
  }
  if (key === "diag" || key === "settings") {
    target[key] = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
    return;
  }
  target[key] = asList(value);
}

function asTemplateList(value: unknown): NodemgtTemplateList {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyNodemgtTemplates();
  const row = value as NodemgtTemplateList;
  return {
    templates: asList(row.templates),
    builtins: asList(row.builtins),
    bindings: asList(row.bindings),
  };
}

function isTransientFetchError(err: unknown) {
  const text = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|networkerror|load failed|network request failed/i.test(text);
}

async function rpcCall(method: string, params?: Record<string, unknown>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(
        sameOriginApiPath("/api/rpc2"),
        sameOriginFetchInit({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method,
            params: params ?? {},
            id: rpcSeq++,
          }),
        }),
      );
      const payload = (await response.json().catch(() => null)) as
        | { result?: unknown; error?: { message?: string } }
        | null;
      if (!response.ok || !payload || payload.error) {
        throw new Error(payload?.error?.message || `HTTP ${response.status}`);
      }
      return payload.result;
    } catch (err) {
      lastError = err;
      if (attempt === 0 && isTransientFetchError(err)) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function asList(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return [data];
  return [];
}
