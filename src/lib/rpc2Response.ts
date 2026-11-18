import type {
  JSONRPC2BatchRequest,
  JSONRPC2BatchResponse,
  JSONRPC2ErrorResponse,
  JSONRPC2Response,
  JSONRPC2SuccessResponse,
} from "../types/rpc2";

export function isRPC2ErrorResponse(
  res: unknown,
): res is JSONRPC2ErrorResponse {
  return (
    typeof res === "object" &&
    res !== null &&
    "error" in res &&
    (res as { error?: unknown }).error != null
  );
}

export function unwrapRPC2Response<TResult = unknown>(
  res: JSONRPC2Response<TResult>,
): TResult {
  if (isRPC2ErrorResponse(res)) {
    throw new Error(`RPC Error ${res.error.code}: ${res.error.message}`);
  }
  return (res as JSONRPC2SuccessResponse<TResult>).result;
}

export function resolveRPC2BatchResponses(
  batchRequest: JSONRPC2BatchRequest,
  jsonResponse: JSONRPC2BatchResponse,
): unknown[] {
  const responsesById = new Map<string | number, JSONRPC2Response>();
  let nullIdError: JSONRPC2ErrorResponse | undefined;

  if (Array.isArray(jsonResponse)) {
    for (const res of jsonResponse) {
      if (!res || typeof res !== "object") continue;
      if (res.id != null) {
        responsesById.set(res.id, res);
      } else if (!nullIdError && isRPC2ErrorResponse(res)) {
        nullIdError = res;
      }
    }
  }

  return batchRequest.map((req) => {
    if (req.id == null) {
      return undefined;
    }
    const res = responsesById.get(req.id);
    if (!res) {
      if (nullIdError) {
        throw new Error(
          `RPC Error ${nullIdError.error.code}: ${nullIdError.error.message}`,
        );
      }
      throw new Error(
        `Missing RPC response for request ${String(req.id)} (${req.method})`,
      );
    }
    return unwrapRPC2Response(res);
  });
}
