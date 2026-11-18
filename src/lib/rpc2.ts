import type {
  JSONRPC2Request,
  JSONRPC2Response,
  JSONRPC2SuccessResponse,
  JSONRPC2BatchRequest,
  JSONRPC2BatchResponse,
  RPC2ConnectionStateType,
  RPC2ConnectionOptions,
  RPC2CallOptions,
  RPC2EventListeners,
} from "../types/rpc2";
import { RPC2ConnectionState } from "../types/rpc2";
import i18n from "../i18n/config";
import { sameOriginApiPath, sameOriginFetchInit } from "../utils/security";
import {
  isRPC2ErrorResponse,
  resolveRPC2BatchResponses,
  unwrapRPC2Response,
} from "./rpc2Response";

/**
 * RPC2 客户端类
 * 支持通过 WebSocket 和 HTTP POST 调用 JSON-RPC 2.0 接口
 */
export class RPC2Client {
  private ws: WebSocket | null = null;
  private connectionState: RPC2ConnectionStateType = RPC2ConnectionState.DISCONNECTED;
  private requestId = 0;
  private pendingRequests = new Map<string | number, {
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timeout?: NodeJS.Timeout;
  }>();
  private reconnectAttempts = 0;
  private reconnectTimeout?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private visibilityListener?: () => void;
  private eventListeners: RPC2EventListeners = {};

  private readonly baseUrl: string;
  private readonly options: Required<RPC2ConnectionOptions>;

  constructor(
    baseUrl = "/api/rpc2",
    options: RPC2ConnectionOptions = {}
  ) {
    this.baseUrl = sameOriginApiPath(baseUrl);
    this.options = {
      autoConnect: true,
      autoReconnect: true,
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      requestTimeout: 30000,
      enableHeartbeat: true,
      heartbeatInterval: 15000,
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    };

    // 自动建立连接
    if (this.options.autoConnect) {
      this.attachVisibilityListener();
      this.autoConnect();
    }
  }

  /**
   * 登录后打开套接字时恢复自动连接/重连。
   */
  private enableSessionReconnect(): void {
    this.options.autoConnect = true;
    this.options.autoReconnect = true;
    this.attachVisibilityListener();
  }

  private attachVisibilityListener(): void {
    if (typeof document === "undefined" || this.visibilityListener) {
      return;
    }
    this.visibilityListener = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") {
        return;
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        return;
      }
      if (
        this.options.autoReconnect &&
        this.connectionState !== RPC2ConnectionState.CONNECTING
      ) {
        if (this.reconnectTimeout) {
          clearTimeout(this.reconnectTimeout);
          this.reconnectTimeout = undefined;
        }
        this.reconnectAttempts = 0;
        this.connect().catch(() => {
          // Reconnect failure is handled via onclose/onError
        });
      }
    };
    document.addEventListener("visibilitychange", this.visibilityListener);
  }

  private detachVisibilityListener(): void {
    if (typeof document !== "undefined" && this.visibilityListener) {
      document.removeEventListener("visibilitychange", this.visibilityListener);
    }
    this.visibilityListener = undefined;
  }

  /**
   * 获取当前连接状态
   */
  get state(): RPC2ConnectionStateType {
    return this.connectionState;
  }

  /**
   * 设置事件监听器
   */
  setEventListeners(listeners: RPC2EventListeners): void {
    this.eventListeners = { ...this.eventListeners, ...listeners };
  }

  clearEventListeners(): void {
    this.eventListeners = {};
  }

  /**
   * 建立 WebSocket 连接
   */
  async connect(): Promise<void> {
    this.enableSessionReconnect();
    if (this.connectionState === RPC2ConnectionState.CONNECTED ||
        this.connectionState === RPC2ConnectionState.CONNECTING) {
      return;
    }

    this.setConnectionState(RPC2ConnectionState.CONNECTING);

    try {
      const wsUrl = this.getWebSocketUrl();
      const ws = new WebSocket(wsUrl);
      this.ws = ws;
      this.setupWebSocketHandlers();

      // 等待连接建立（不覆盖已设置的处理器，避免丢失心跳与状态更新）
      await new Promise<void>((resolve, reject) => {
        const handleOpen = () => {
          cleanup();
          resolve();
        };
        const handleError = () => {
          cleanup();
          reject(new Error(i18n.t("rpc2.websocket_connection_failed")));
        };
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error(i18n.t("rpc2.websocket_connection_timed_out")));
        }, 10000);

        const cleanup = () => {
          clearTimeout(timeout);
          ws.removeEventListener("open", handleOpen);
          ws.removeEventListener("error", handleError);
        };

        ws.addEventListener("open", handleOpen, { once: true });
        ws.addEventListener("error", handleError, { once: true });
      });
    } catch (error) {
      this.setConnectionState(RPC2ConnectionState.ERROR);
      this.eventListeners.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * 自动建立连接（非阻塞）
   */
  private autoConnect(): void {
    if (this.connectionState !== RPC2ConnectionState.DISCONNECTED) {
      return;
    }

    // 异步尝试连接，不阻塞构造函数
    this.connect().catch((error) => {
      console.warn(i18n.t("rpc2.automatic_connection_failed"), error.message);
      // 连接失败时，如果启用了自动重连，会在 onclose 处理器中进行重连
    });
  }

  /**
   * 暂停套接字（登录页 / 登出）：关掉连接，且不要立刻重连。
   * 之后 connect() 会重新打开自动重连。
   */
  pause(): void {
    this.options.autoConnect = false;
    this.options.autoReconnect = false;
    this.detachVisibilityListener();
    this.closeSocket();
  }

  /**
   * 断开 WebSocket 连接
   */
  disconnect(): void {
    this.pause();
  }

  private closeSocket(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }

    // 清理心跳包定时器
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setConnectionState(RPC2ConnectionState.DISCONNECTED);
    this.clearPendingRequests(new Error(i18n.t("rpc2.connection_disconnected")));
  }

  /**
   * 通过 WebSocket 调用 RPC 方法
   */
  async callViaWebSocket<TParams = any, TResult = any>(
    method: string,
    params?: TParams,
    options: RPC2CallOptions = {}
  ): Promise<TResult> {
    if (this.connectionState !== RPC2ConnectionState.CONNECTED) {
      throw new Error(i18n.t("rpc2.websocket_not_connected"));
    }

    const request: JSONRPC2Request<TParams> = {
      jsonrpc: "2.0",
      method,
      params,
      id: options.notification ? undefined : this.generateRequestId(),
    };

    if (options.notification) {
      // 通知请求，不期望响应
      this.sendMessage(request);
      return undefined as TResult;
    }

    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id!);
        reject(
          new Error(i18n.t("rpc2.request_timed_out", { method }))
        );
      }, options.timeout || this.options.requestTimeout);

      this.pendingRequests.set(request.id!, {
        resolve,
        reject,
        timeout,
      });

      this.sendMessage(request);
    });
  }

  /**
   * 通过 HTTP POST 调用 RPC 方法
   */
  async callViaHTTP<TParams = any, TResult = any>(
    method: string,
    params?: TParams,
    options: RPC2CallOptions = {}
  ): Promise<TResult> {
    const request: JSONRPC2Request<TParams> = {
      jsonrpc: "2.0",
      method,
      params,
      id: options.notification ? undefined : this.generateRequestId(),
    };

    try {
      const response = await fetch(
        this.baseUrl,
        sameOriginFetchInit({
          method: "POST",
          headers: this.options.headers,
          body: JSON.stringify(request),
          signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
        }),
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (options.notification) {
        return undefined as TResult;
      }

      const jsonResponse: JSONRPC2Response<TResult> = await response.json();

      return unwrapRPC2Response(jsonResponse);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(i18n.t("rpc2.request_failed", { method }));
    }
  }

  /**
   * 批量调用（仅支持 HTTP）
   */
  async batchCall(requests: Array<{
    method: string;
    params?: any;
    notification?: boolean;
  }>): Promise<any[]> {
    if (requests.length === 0) {
      return [];
    }

    const batchRequest: JSONRPC2BatchRequest = requests.map(req => ({
      jsonrpc: "2.0",
      method: req.method,
      params: req.params,
      id: req.notification ? undefined : this.generateRequestId(),
    }));

    try {
      const response = await fetch(
        this.baseUrl,
        sameOriginFetchInit({
          method: "POST",
          headers: this.options.headers,
          body: JSON.stringify(batchRequest),
        }),
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (batchRequest.every(req => req.id == null)) {
        return batchRequest.map(() => undefined);
      }

      const jsonResponse: JSONRPC2BatchResponse = await response.json();
      return resolveRPC2BatchResponses(batchRequest, jsonResponse);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(i18n.t("rpc2.batch_request_failed"));
    }
  }

  /**
   * 自动选择调用方式（优先使用 WebSocket）
   */
  async call<TParams = any, TResult = any>(
    method: string,
    params?: TParams,
    options: RPC2CallOptions = {}
  ): Promise<TResult> {
    // 如果启用了自动连接，且当前未连接，尝试建立连接（不阻塞使用 HTTP 回退）
    if (this.options.autoConnect &&
        this.connectionState === RPC2ConnectionState.DISCONNECTED) {
      this.autoConnect();
    }

    // 策略：
    // 1) WS 已连接 → 尝试 WS；失败则回退一次 HTTP
    // 2) 其他状态（未连/连接中/重连中/错误）→ 直接 HTTP
    if (this.connectionState === RPC2ConnectionState.CONNECTED) {
      try {
        return await this.callViaWebSocket(method, params, options);
      } catch {
        // 回退一次 HTTP
        return this.callViaHTTP(method, params, options);
      }
    }

    // 未连或重连等情况下，直接使用 HTTP
    return this.callViaHTTP(method, params, options);
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    return `${protocol}//${host}${this.baseUrl}`;
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.setConnectionState(RPC2ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.startHeartbeat(); // 启动心跳包
      this.eventListeners.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
        this.eventListeners.onMessage?.(data);
      } catch (error) {
        console.error(i18n.t("rpc2.parse_websocket_message_failed"), error);
      }
    };

    this.ws.onclose = () => {
      this.setConnectionState(RPC2ConnectionState.DISCONNECTED);
      this.stopHeartbeat(); // 停止心跳包
      this.eventListeners.onDisconnect?.();

      if (this.options.autoReconnect &&
          this.reconnectAttempts < this.options.maxReconnectAttempts) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error(i18n.t("rpc2.websocket_error"), error);
      this.eventListeners.onError?.(
        new Error(i18n.t("rpc2.websocket_connection_error"))
      );
    };
  }

  private handleMessage(data: JSONRPC2Response): void {
    if (!data.id) return; // 忽略通知响应

    const pending = this.pendingRequests.get(data.id);
    if (!pending) return;

    this.pendingRequests.delete(data.id);

    if (pending.timeout) {
      clearTimeout(pending.timeout);
    }

    if (isRPC2ErrorResponse(data)) {
      pending.reject(new Error(`RPC Error ${data.error.code}: ${data.error.message}`));
    } else {
      pending.resolve((data as JSONRPC2SuccessResponse).result);
    }
  }

  private sendMessage(message: JSONRPC2Request): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(i18n.t("rpc2.websocket_not_connected"));
    }

    this.ws.send(JSON.stringify(message));
  }

  private setConnectionState(state: RPC2ConnectionStateType): void {
    this.connectionState = state;
  }

  private generateRequestId(): number {
    return ++this.requestId;
  }

  private clearPendingRequests(error: Error): void {
    for (const [, pending] of this.pendingRequests) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  /**
   * 启动心跳包
   */
  private sendHeartbeatPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      // 发送心跳包作为通知请求（不期望响应）
      const heartbeatRequest: JSONRPC2Request = {
        jsonrpc: "2.0",
        method: "rpc.ping",
        params: { timestamp: Date.now() },
      };
      this.ws.send(JSON.stringify(heartbeatRequest));
    } catch (error) {
      console.warn(i18n.t("rpc2.send_heartbeat_failed"), error);
    }
  }

  private startHeartbeat(): void {
    // 如果未启用心跳包，则不启动
    if (!this.options.enableHeartbeat) {
      return;
    }

    // 先清理之前的心跳包定时器
    this.stopHeartbeat();

    // 按配置的间隔发送心跳包
    this.heartbeatInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      this.sendHeartbeatPing();
    }, this.options.heartbeatInterval);
  }

  /**
   * 停止心跳包
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    this.setConnectionState(RPC2ConnectionState.RECONNECTING);
    this.eventListeners.onReconnecting?.(this.reconnectAttempts);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(() => {
        // 重连失败会触发 onclose，从而继续重连或停止
      });
    }, this.options.reconnectInterval);
  }
}

// 注意：避免在模块级别创建默认实例，以免在多处导入时重复建立 WebSocket 连接。
// 请通过 RPC2Provider + useRPC2Call/useRPC2 使用该客户端，或在需要的地方手动创建实例。
