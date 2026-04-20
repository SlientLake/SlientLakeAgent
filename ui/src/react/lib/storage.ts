import { getSafeLocalStorage } from "./safe-local-storage";

const STORAGE_KEY = "silentlake.react.control.settings.v1";
const TOKEN_KEY_PREFIX = "silentlake.react.control.token.v1:";

export type ControlUiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
};

function normalizeGatewayScope(gatewayUrl: string): string {
  const trimmed = gatewayUrl.trim();
  if (!trimmed) {
    return "default";
  }
  try {
    const parsed = new URL(trimmed, window.location.href);
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/g, "");
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return trimmed;
  }
}

function tokenKeyForGateway(gatewayUrl: string): string {
  return `${TOKEN_KEY_PREFIX}${normalizeGatewayScope(gatewayUrl)}`;
}

function deriveDefaultGatewayUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const isViteDev = Boolean(document.querySelector('script[src*="/@vite/client"]'));
  if (isViteDev) {
    return `${proto}://${location.hostname}:18789`;
  }
  return `${proto}://${location.host}`;
}

function readSessionToken(gatewayUrl: string): string {
  try {
    return window.sessionStorage.getItem(tokenKeyForGateway(gatewayUrl)) ?? "";
  } catch {
    return "";
  }
}

function writeSessionToken(gatewayUrl: string, token: string) {
  try {
    const key = tokenKeyForGateway(gatewayUrl);
    const normalized = token.trim();
    if (normalized) {
      window.sessionStorage.setItem(key, normalized);
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function loadSettings(): ControlUiSettings {
  const defaults: ControlUiSettings = {
    gatewayUrl: deriveDefaultGatewayUrl(),
    token: "",
    sessionKey: "main",
  };

  try {
    const raw = getSafeLocalStorage()?.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...defaults, token: readSessionToken(defaults.gatewayUrl) };
    }
    const parsed = JSON.parse(raw) as Partial<ControlUiSettings>;
    const gatewayUrl =
      typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
        ? parsed.gatewayUrl.trim()
        : defaults.gatewayUrl;
    return {
      gatewayUrl,
      token: readSessionToken(gatewayUrl),
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
    };
  } catch {
    return { ...defaults, token: readSessionToken(defaults.gatewayUrl) };
  }
}

export function persistSettings(settings: ControlUiSettings) {
  try {
    const payload = {
      gatewayUrl: settings.gatewayUrl,
      sessionKey: settings.sessionKey,
    };
    getSafeLocalStorage()?.setItem(STORAGE_KEY, JSON.stringify(payload));
    writeSessionToken(settings.gatewayUrl, settings.token);
  } catch {
    // ignore
  }
}
