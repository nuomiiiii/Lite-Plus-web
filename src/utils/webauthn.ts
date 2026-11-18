export function bufferToBase64Url(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function bufferFromBase64Url(value: string) {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function decodeBufferFields<T extends Record<string, any>>(
  source: T,
  keys: string[],
): T {
  const clone: Record<string, any> = { ...source };
  for (const key of keys) {
    if (typeof clone[key] === "string") {
      clone[key] = bufferFromBase64Url(clone[key]);
    }
  }
  return clone as T;
}

export type PasskeyCreatePrefer = "platform" | "password-manager";

export function withPasskeyCreatePreference<T extends Record<string, any>>(
  options: T,
  prefer: PasskeyCreatePrefer,
) {
  const { hints: _hints, authenticatorSelection: _selection, ...rest } = options;
  void _hints;
  void _selection;
  const authenticatorSelection: Record<string, unknown> = {
    residentKey: "required",
    requireResidentKey: true,
    userVerification: "required",
  };
  if (prefer === "password-manager") {
    // Leave attachment unset on every system, including Windows. Enpass,
    // Bitwarden, and 1Password only save platform passkeys, so a
    // cross-platform request never reaches them.
    return { ...rest, authenticatorSelection };
  }
  return {
    ...rest,
    hints: ["client-device"],
    authenticatorSelection: {
      ...authenticatorSelection,
      authenticatorAttachment: "platform",
    },
  };
}

export function toPasskeyCreateOptions(
  raw: any,
  prefer: PasskeyCreatePrefer,
): PublicKeyCredentialCreationOptions {
  const source = raw && typeof raw === "object" ? raw : {};
  const decoded: any = decodePublicKeyCreationOptions(withPasskeyCreatePreference(source, prefer));
  return withPasskeyCreatePreference(
    {
      rp: decoded.rp,
      user: decoded.user,
      challenge: decoded.challenge,
      pubKeyCredParams: decoded.pubKeyCredParams,
      timeout: decoded.timeout,
      excludeCredentials: decoded.excludeCredentials,
      attestation: decoded.attestation,
      extensions: decoded.extensions,
    },
    prefer,
  ) as PublicKeyCredentialCreationOptions;
}

export function decodePublicKeyCreationOptions(options: any): PublicKeyCredentialCreationOptions {
  const native = (window as any).PublicKeyCredential?.parseCreationOptionsFromJSON;
  if (typeof native === "function") {
    try {
      const parsed = native.call(PublicKeyCredential, options);
      return parsed?.publicKey ?? parsed;
    } catch {
      // Chrome throws if the wrapper `{ publicKey }` is passed; fall back.
    }
  }
  const clone = decodeBufferFields({ ...options }, ["challenge"]);
  if (clone.user) {
    clone.user = decodeBufferFields({ ...clone.user }, ["id"]);
  }
  if (Array.isArray(clone.excludeCredentials)) {
    clone.excludeCredentials = clone.excludeCredentials.map((item: any) =>
      decodeBufferFields({ ...item }, ["id"]),
    );
  }
  return clone;
}

export function decodePublicKeyRequestOptions(options: any): PublicKeyCredentialRequestOptions {
  const native = (window as any).PublicKeyCredential?.parseRequestOptionsFromJSON;
  if (typeof native === "function") {
    try {
      const parsed = native.call(PublicKeyCredential, options);
      return parsed?.publicKey ?? parsed;
    } catch {
      // Chrome throws if the wrapper `{ publicKey }` is passed; fall back.
    }
  }
  const clone = decodeBufferFields({ ...options }, ["challenge"]);
  if (Array.isArray(clone.allowCredentials)) {
    clone.allowCredentials = clone.allowCredentials.map((item: any) =>
      decodeBufferFields({ ...item }, ["id"]),
    );
  }
  return clone;
}

export function serializeCredential(credential: PublicKeyCredential) {
  const native = (credential as any).toJSON;
  if (typeof native === "function") {
    return native.call(credential);
  }
  const response = credential.response;
  if (response instanceof AuthenticatorAttestationResponse) {
    return {
      id: credential.id,
      rawId: bufferToBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64Url(response.clientDataJSON),
        attestationObject: bufferToBase64Url(response.attestationObject),
      },
    };
  }
  const assertion = response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(assertion.clientDataJSON),
      authenticatorData: bufferToBase64Url(assertion.authenticatorData),
      signature: bufferToBase64Url(assertion.signature),
      userHandle: assertion.userHandle
        ? bufferToBase64Url(assertion.userHandle)
        : null,
    },
  };
}

export function passkeyUnavailableMessage(reason: unknown, fallback: string) {
  if (reason && typeof reason === "object" && "name" in reason) {
    const name = String((reason as DOMException).name);
    if (name === "AbortError") return "aborted";
    if (name === "NotAllowedError") return "cancelled";
    if (name === "InvalidStateError") return "already_registered";
    if (name === "NotSupportedError") return "unsupported";
  }
  return fallback;
}

export async function confirmAdminPasskey(signal?: AbortSignal) {
  const optionsRes = await fetch("/api/admin/account/passkeys/confirm/options", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    signal,
  });
  const optionsBody = await optionsRes.json().catch(() => ({}));
  if (!optionsRes.ok) {
    throw new Error(optionsBody.message || "failed");
  }
  const assertion = (await navigator.credentials.get({
    publicKey: decodePublicKeyRequestOptions(optionsBody.data?.publicKey || optionsBody.publicKey),
    signal,
  })) as PublicKeyCredential;
  return {
    ceremony_id: optionsBody.data?.ceremony_id || optionsBody.ceremony_id,
    credential: serializeCredential(assertion),
  };
}
