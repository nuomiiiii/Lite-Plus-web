import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { startVisibleInterval } from "../src/hooks/useVisibleInterval.ts";
import {
  parseDatabaseOverview,
  parseMaintenanceResult,
} from "../src/lib/databaseMaintenanceValidation.ts";
import {
  isRPC2ErrorResponse,
  resolveRPC2BatchResponses,
  unwrapRPC2Response,
} from "../src/lib/rpc2Response.ts";
import { ADMIN_HOVER_PRELOAD_DELAY_MS } from "../src/utils/adminPreload.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const require = createRequire(import.meta.url);
const ts = require(path.join(webRoot, "node_modules/typescript"));

function withMockVisibilityAndTimers(
  run: (env: {
    advance: (ms: number) => void;
    tick: () => void;
    setVisibility: (state: "visible" | "hidden") => void;
    listenerCount: () => number;
    wasCleared: () => boolean;
  }) => void,
) {
  const prevDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const prevSetInterval = globalThis.setInterval;
  const prevClearInterval = globalThis.clearInterval;
  const prevNow = Date.now;

  let now = 1_000;
  let visibilityState: "visible" | "hidden" = "visible";
  const visibilityListeners = new Set<() => void>();
  let intervalCallback: (() => void) | null = null;
  let cleared = false;

  Date.now = () => now;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener(type: string, fn: () => void) {
        if (type === "visibilitychange") visibilityListeners.add(fn);
      },
      removeEventListener(type: string, fn: () => void) {
        if (type === "visibilitychange") visibilityListeners.delete(fn);
      },
    },
  });
  globalThis.setInterval = ((cb: () => void) => {
    intervalCallback = cb;
    return 42 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  globalThis.clearInterval = (() => {
    cleared = true;
  }) as typeof clearInterval;

  try {
    run({
      advance(ms: number) {
        now += ms;
      },
      tick() {
        intervalCallback?.();
      },
      setVisibility(next: "visible" | "hidden") {
        visibilityState = next;
        visibilityListeners.forEach((fn) => fn());
      },
      listenerCount() {
        return visibilityListeners.size;
      },
      wasCleared() {
        return cleared;
      },
    });
  } finally {
    Date.now = prevNow;
    globalThis.setInterval = prevSetInterval;
    globalThis.clearInterval = prevClearInterval;
    if (prevDocument) {
      Object.defineProperty(globalThis, "document", prevDocument);
    } else {
      delete (globalThis as { document?: unknown }).document;
    }
  }
}

test("startVisibleInterval skips hidden ticks and disables catch-up on visible by default", () => {
  withMockVisibilityAndTimers((env) => {
    let calls = 0;
    const stop = startVisibleInterval(() => {
      calls += 1;
    }, 5_000);

    // Default mode attaches no visibilitychange listener to avoid thundering herds.
    assert.equal(env.listenerCount(), 0);

    env.advance(5_000);
    env.tick();
    assert.equal(calls, 1);

    // While hidden, scheduled ticks are skipped.
    env.setVisibility("hidden");
    env.advance(5_000);
    env.tick();
    env.advance(5_000);
    env.tick();
    assert.equal(calls, 1);

    // Returning to visible does NOT fire an immediate catch-up burst.
    env.setVisibility("visible");
    assert.equal(calls, 1);

    // Next normal tick resumes polling cleanly.
    env.advance(5_000);
    env.tick();
    assert.equal(calls, 2);

    stop();
    assert.equal(env.wasCleared(), true);
  });
});

test("startVisibleInterval supports explicit catchUpOnVisible and runOnVisible options", () => {
  withMockVisibilityAndTimers((env) => {
    let catchUpCalls = 0;
    const stopCatchUp = startVisibleInterval(
      () => {
        catchUpCalls += 1;
      },
      5_000,
      { catchUpOnVisible: true },
    );
    assert.equal(env.listenerCount(), 1);

    // Brief hide without missing an interval does not fire catch-up.
    env.setVisibility("hidden");
    env.advance(500);
    env.setVisibility("visible");
    assert.equal(catchUpCalls, 0);

    // Hiding across missed ticks fires once on becoming visible.
    env.setVisibility("hidden");
    env.advance(5_000);
    env.tick();
    env.advance(5_000);
    env.tick();
    assert.equal(catchUpCalls, 0);
    env.setVisibility("visible");
    assert.equal(catchUpCalls, 1);
    stopCatchUp();
    assert.equal(env.listenerCount(), 0);
  });

  withMockVisibilityAndTimers((env) => {
    let gateCalls = 0;
    const stopGate = startVisibleInterval(
      () => {
        gateCalls += 1;
      },
      15_000,
      { runOnVisible: true },
    );
    assert.equal(env.listenerCount(), 1);
    env.setVisibility("hidden");
    env.advance(200);
    env.setVisibility("visible");
    assert.equal(gateCalls, 1);
    stopGate();
    assert.equal(env.listenerCount(), 0);
  });
});

test("ADMIN_HOVER_PRELOAD_DELAY_MS provides a positive hover debounce", () => {
  assert.equal(ADMIN_HOVER_PRELOAD_DELAY_MS, 120);
});

test("database maintenance runtime validators accept valid payloads and reject malformed ones", () => {
  const validOverview = parseDatabaseOverview({
    main: {
      driver: " sqlite ",
      location: "local",
      size: 4096,
      files: { database: 2048, wal: 1024, shm: 1024 },
      action: "vacuum",
    },
    monitoring: {
      driver: "sqlite",
      location: "local",
      size: 8192,
      runtime: {
        compacting: false,
        current_metric: "",
        progress: 0,
        total: 10,
        cycle_written: 100,
        cycle_started_at: null,
        last_step_at: "2026-11-18T00:00:00Z",
        last_cycle_completed_at: null,
        checkpoint_applicable: true,
        last_checkpoint_attempt_at: null,
        last_checkpoint_success_at: null,
        next_checkpoint_at: null,
        checkpoint_pending: false,
        consecutive_checkpoint_failures: 0,
        consecutive_cycle_failures: 0,
        digest_handoff_deferred: null,
      },
      action: "vacuum",
    },
    local_total: 12288,
  });
  assert.ok(validOverview);
  assert.equal(validOverview.main.driver, "sqlite");
  assert.deepEqual(validOverview.monitoring.runtime?.digest_handoff_deferred, []);
  assert.equal(parseDatabaseOverview({ main: {}, monitoring: {}, local_total: -1 }), null);

  const validMaint = parseMaintenanceResult({
    all_succeeded: true,
    main: { driver: "sqlite", action: "vacuum", before: 4096, after: 2048, success: true },
    monitoring: { driver: "postgres", action: "vacuum_full", before: null, after: null, success: true },
  });
  assert.ok(validMaint);
  assert.equal(validMaint.all_succeeded, true);
  assert.equal(parseMaintenanceResult({ all_succeeded: "yes" }), null);
});

test("RPC2 response helpers match batch responses by id and tolerate error: null", () => {
  assert.equal(
    isRPC2ErrorResponse({ jsonrpc: "2.0", id: 1, result: "ok", error: null }),
    false,
  );
  assert.equal(
    isRPC2ErrorResponse({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32600, message: "Invalid Request" },
    }),
    true,
  );
  assert.deepEqual(
    unwrapRPC2Response({
      jsonrpc: "2.0",
      id: 1,
      result: { nodes: 3 },
      error: null,
    } as never),
    { nodes: 3 },
  );

  const outOfOrder = resolveRPC2BatchResponses(
    [
      { jsonrpc: "2.0", method: "a", id: 10 },
      { jsonrpc: "2.0", method: "notify" },
      { jsonrpc: "2.0", method: "b", id: 11 },
    ],
    [
      { jsonrpc: "2.0", id: 11, result: "second", error: null } as never,
      { jsonrpc: "2.0", id: 10, result: "first" },
    ],
  );
  assert.deepEqual(outOfOrder, ["first", undefined, "second"]);

  assert.throws(
    () =>
      resolveRPC2BatchResponses(
        [{ jsonrpc: "2.0", method: "missing", id: 99 }],
        [],
      ),
    /Missing RPC response for request 99/,
  );

  assert.throws(
    () =>
      resolveRPC2BatchResponses(
        [{ jsonrpc: "2.0", method: "bad", id: 5 }],
        [
          {
            jsonrpc: "2.0",
            id: 5,
            error: { code: -32601, message: "Method not found" },
          },
        ],
      ),
    /RPC Error -32601: Method not found/,
  );
});

test("RPC2Client executes callViaHTTP without WebSocket and skips hidden heartbeat pings", async () => {
  let wsCreated = 0;
  const sentFrames: string[] = [];
  let visibilityState: "visible" | "hidden" = "visible";
  const visibilityListeners = new Set<() => void>();
  let heartbeatFn: (() => void) | null = null;
  const httpBodies: unknown[] = [];

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = FakeWebSocket.OPEN;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    constructor() {
      wsCreated += 1;
      queueMicrotask(() => this.onopen?.());
    }
    send(data: string) {
      sentFrames.push(data);
    }
    close() {
      this.readyState = FakeWebSocket.CLOSED;
    }
  }

  let nextTimerId = 1;
  const activeTimers = new Set<number>();
  const sandbox = vm.createContext({
    WebSocket: FakeWebSocket,
    window: { location: { protocol: "https:", host: "panel.example", origin: "https://panel.example" } },
    document: {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener(type: string, fn: () => void) {
        if (type === "visibilitychange") visibilityListeners.add(fn);
      },
      removeEventListener(type: string, fn: () => void) {
        if (type === "visibilitychange") visibilityListeners.delete(fn);
      },
    },
    setTimeout: () => {
      const id = nextTimerId++;
      activeTimers.add(id);
      return id;
    },
    clearTimeout: (id: number) => {
      activeTimers.delete(id);
    },
    setInterval: (fn: () => void) => {
      heartbeatFn = fn;
      return 99;
    },
    clearInterval: () => {
      heartbeatFn = null;
    },
    fetch: async (_url: string, init: { body: string }) => {
      const parsed = JSON.parse(init.body);
      httpBodies.push(parsed);
      if (Array.isArray(parsed)) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            parsed
              .slice()
              .reverse()
              .map((req: { id: number; method: string }) => ({
                jsonrpc: "2.0",
                id: req.id,
                result: `res:${req.method}`,
                error: null,
              })),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          jsonrpc: "2.0",
          id: parsed.id,
          result: { online: ["n1"], data: {} },
          error: null,
        }),
      };
    },
  });

  function compileModule(relPath: string, deps: Record<string, unknown> = {}) {
    const code = readFileSync(path.join(webRoot, relPath), "utf8");
    const output = ts.transpileModule(code, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const mod: { exports: { RPC2Client?: new (url?: string, opts?: Record<string, unknown>) => any } & Record<string, unknown> } = {
      exports: {},
    };
    new vm.Script(`(function(require,module,exports){\n${output}\n})`).runInContext(sandbox)(
      (id: string) => {
        if (id in deps) return deps[id];
        throw new Error(`unexpected import ${id} in ${relPath}`);
      },
      mod,
      mod.exports,
    );
    return mod.exports;
  }

  const securityMod = compileModule("src/utils/security.ts");
  const rpc2ResponseMod = compileModule("src/lib/rpc2Response.ts");
  const rpc2TypesMod = compileModule("src/types/rpc2.ts");
  const rpc2Mod = compileModule("src/lib/rpc2.ts", {
    "../types/rpc2": rpc2TypesMod,
    "../i18n/config": { default: { t: (k: string) => k } },
    "../utils/security": securityMod,
    "./rpc2Response": rpc2ResponseMod,
  });

  // 1. Disconnected client calling callViaHTTP (as /terminal does) never opens a WebSocket.
  const httpOnlyClient = new rpc2Mod.RPC2Client("/api/rpc2", { autoConnect: false });
  const latestStatus = await httpOnlyClient.callViaHTTP("common:getNodesLatestStatus");
  assert.deepEqual(latestStatus, { online: ["n1"], data: {} });
  assert.equal(wsCreated, 0);
  assert.equal(httpBodies.length, 1);

  // 2. Out-of-order HTTP batch responses with `error: null` resolve in caller order.
  const batchRes = await httpOnlyClient.batchCall([
    { method: "admin:first" },
    { method: "admin:second" },
  ]);
  assert.deepEqual(batchRes, ["res:admin:first", "res:admin:second"]);
  assert.equal(wsCreated, 0);

  // 3. Connected WS client skips heartbeat pings while hidden and does not burst on becoming visible.
  const wsClient = new rpc2Mod.RPC2Client("/api/rpc2", { autoConnect: true });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(wsCreated, 1);
  assert.ok(heartbeatFn);

  heartbeatFn?.();
  assert.equal(sentFrames.length, 1);

  visibilityState = "hidden";
  heartbeatFn?.();
  assert.equal(sentFrames.length, 1);

  visibilityState = "visible";
  visibilityListeners.forEach((fn) => fn());
  assert.equal(sentFrames.length, 1);

  wsClient.disconnect();
  assert.equal(visibilityListeners.size, 0);
});
