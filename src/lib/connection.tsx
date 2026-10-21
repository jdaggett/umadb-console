import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ConnectError, createClient } from "@connectrpc/connect";
import type { Client, Interceptor } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";
import { DCB } from "../gen/v1/umadb_pb";
import { Health, HealthCheckResponse_ServingStatus } from "../gen/grpc/health/v1/health_pb";

export type ConnectionSettings = {
  /** Server base URL. Empty means "this origin" (the Vite dev proxy or a reverse proxy). */
  baseUrl: string;
  apiKey: string;
};

export type ConnectionStatus =
  | { state: "checking" }
  | { state: "online"; head: bigint | undefined; health: HealthCheckResponse_ServingStatus; checkedAt: Date }
  | { state: "offline"; error: string; checkedAt: Date };

type ConnectionContextValue = {
  settings: ConnectionSettings;
  setSettings: (settings: ConnectionSettings) => void;
  dcb: Client<typeof DCB>;
  health: Client<typeof Health>;
  status: ConnectionStatus;
  refresh: () => Promise<void>;
  effectiveUrl: string;
};

const STORAGE_KEY = "umadb-ui.connection";
const POLL_INTERVAL_MS = 5000;

function loadSettings(): ConnectionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;
      return { baseUrl: parsed.baseUrl ?? "", apiKey: parsed.apiKey ?? "" };
    }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return { baseUrl: "", apiKey: "" };
}

function saveSettings(settings: ConnectionSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore: settings just won't persist.
  }
}

/**
 * UmaDB puts an encoded `umadb.v1.ErrorResponse` in `grpc-status-details-bin`, whereas
 * Connect expects a `google.rpc.Status` there and would report a decode failure instead
 * of the real error. Dropping the header lets `grpc-status`/`grpc-message` through intact.
 */
const fetchWithoutStatusDetails: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (!res.headers.has("grpc-status-details-bin")) return res;
  const headers = new Headers(res.headers);
  headers.delete("grpc-status-details-bin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

export function errorMessage(err: unknown): string {
  if (err instanceof ConnectError) {
    return err.rawMessage || err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

export function isAbort(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return err instanceof ConnectError && err.code === 1; // Code.Canceled
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<ConnectionSettings>(loadSettings);
  const [status, setStatus] = useState<ConnectionStatus>({ state: "checking" });

  const effectiveUrl = settings.baseUrl.trim().replace(/\/+$/, "") || window.location.origin;

  const { dcb, health } = useMemo(() => {
    const apiKey = settings.apiKey.trim();
    const auth: Interceptor = (next) => (req) => {
      if (apiKey) req.header.set("authorization", `Bearer ${apiKey}`);
      return next(req);
    };
    const transport = createGrpcWebTransport({
      baseUrl: effectiveUrl,
      interceptors: [auth],
      fetch: fetchWithoutStatusDetails,
    });
    return { dcb: createClient(DCB, transport), health: createClient(Health, transport) };
  }, [effectiveUrl, settings.apiKey]);

  const refresh = useCallback(async () => {
    try {
      const [headRes, healthRes] = await Promise.all([
        dcb.head({}, { timeoutMs: 4000 }),
        health
          .check({ service: "umadb.v1.DCB" }, { timeoutMs: 4000 })
          .catch(() => ({ status: HealthCheckResponse_ServingStatus.UNKNOWN })),
      ]);
      setStatus({ state: "online", head: headRes.position, health: healthRes.status, checkedAt: new Date() });
    } catch (err) {
      setStatus({ state: "offline", error: errorMessage(err), checkedAt: new Date() });
    }
  }, [dcb, health]);

  useEffect(() => {
    setStatus({ state: "checking" });
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const setSettings = useCallback((next: ConnectionSettings) => {
    saveSettings(next);
    setSettingsState(next);
  }, []);

  const value = useMemo(
    () => ({ settings, setSettings, dcb, health, status, refresh, effectiveUrl }),
    [settings, setSettings, dcb, health, status, refresh, effectiveUrl],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within a ConnectionProvider");
  return ctx;
}
