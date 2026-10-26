export const TEMPLATE_CLIENTS = ["mihomo", "clash", "loon", "surge", "surge-mac", "stash", "sing-box"];

export function parsePreviewLinks(body: string): string[] {
  let text = body;
  if (!text.includes("://") && text.trim()) {
    try {
      text = new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s+/g, "")), (char) => char.charCodeAt(0)));
    } catch { return []; }
  }
  return text.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => isPreviewNodeLink(line));
}

function isPreviewNodeLink(line: string): boolean {
  if (!/^(?:ss|ssr|vmess|vless|trojan|hysteria2?|hy2|tuic|anytls|https?|socks5?|wireguard|mieru|mierus):\/\//i.test(line)) {
    return false;
  }
  if (!/^https?:\/\//i.test(line)) {
    return true;
  }
  try {
    const url = new URL(line);
    if (url.username || url.password) {
      return true;
    }
    const path = url.pathname.replace(/\/+$/, "");
    return !path;
  } catch {
    return false;
  }
}

export function subscriptionTargetURL(base: string, target: string): string {
  if (!base || !target) return base;
  const url = new URL(base, "https://subscription.invalid");
  url.searchParams.set("target", target);
  return /^[a-z][a-z\d+.-]*:/i.test(base) ? url.toString() : url.pathname + url.search + url.hash;
}
