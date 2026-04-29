import { getSupabasePublishableKey, getSupabaseUrl, supabaseEndpoint } from "@/lib/env";

export type LocalHealthStatus = "ok" | "warning" | "error";

export type LocalHealthCheck = {
  name: "rest" | "realtime" | "storage";
  label: string;
  url: string;
  method: "HEAD" | "GET";
  ok: boolean;
  reachable: boolean;
  status: number | null;
  statusText: string;
  durationMs: number;
  error: string | null;
};

export type LocalHealthReport = {
  status: LocalHealthStatus;
  checkedAt: string;
  checks: LocalHealthCheck[];
  restOk: boolean;
  message: string;
};

export type LocalBackendCandidate = {
  url: string;
  report: LocalHealthReport;
};

const AUTH_HEADERS = () => {
  const key = getSupabasePublishableKey();
  return key ? { apikey: key, Authorization: `Bearer ${key}` } : {};
};

async function runCheck(check: Pick<LocalHealthCheck, "name" | "label" | "url" | "method">): Promise<LocalHealthCheck> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(check.url, {
      method: check.method,
      headers: AUTH_HEADERS(),
      cache: "no-store",
      signal: controller.signal,
    });

    const reachable = response.status > 0 && response.status < 500;
    return {
      ...check,
      ok: reachable,
      reachable,
      status: response.status,
      statusText: response.statusText || "Réponse HTTP reçue",
      durationMs: Math.round(performance.now() - started),
      error: null,
    };
  } catch (error: any) {
    return {
      ...check,
      ok: false,
      reachable: false,
      status: null,
      statusText: "Aucune réponse",
      durationMs: Math.round(performance.now() - started),
      error: error?.name === "AbortError" ? "Timeout après 6s" : error?.message || String(error),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function runRealtimeCheck(baseUrl: string): Promise<LocalHealthCheck> {
  const started = performance.now();
  const key = getSupabasePublishableKey();
  const realtimeUrl = new URL(`${baseUrl.replace(/\/$/, "")}/realtime/v1/websocket`);
  realtimeUrl.protocol = realtimeUrl.protocol === "https:" ? "wss:" : "ws:";
  realtimeUrl.searchParams.set("apikey", key);
  realtimeUrl.searchParams.set("vsn", "1.0.0");

  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ name: "realtime", label: "Realtime WebSocket", url: realtimeUrl.toString(), method: "GET", ok: false, reachable: false, status: null, statusText: "Timeout WebSocket", durationMs: Math.round(performance.now() - started), error: "Connexion WebSocket impossible après 6s" });
    }, 6000);

    try {
      const socket = new WebSocket(realtimeUrl.toString());
      socket.onopen = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        socket.close();
        resolve({ name: "realtime", label: "Realtime WebSocket", url: realtimeUrl.toString(), method: "GET", ok: true, reachable: true, status: 101, statusText: "WebSocket connecté", durationMs: Math.round(performance.now() - started), error: null });
      };
      socket.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve({ name: "realtime", label: "Realtime WebSocket", url: realtimeUrl.toString(), method: "GET", ok: false, reachable: false, status: null, statusText: "Erreur WebSocket", durationMs: Math.round(performance.now() - started), error: "Vérifiez le proxy /realtime/v1 avec Upgrade WebSocket" });
      };
    } catch (error: any) {
      window.clearTimeout(timeout);
      resolve({ name: "realtime", label: "Realtime WebSocket", url: realtimeUrl.toString(), method: "GET", ok: false, reachable: false, status: null, statusText: "URL Realtime invalide", durationMs: Math.round(performance.now() - started), error: error?.message || String(error) });
    }
  });
}

export async function checkLocalBackendHealth(): Promise<LocalHealthReport> {
  const checks = await Promise.all([
    runCheck({ name: "rest", label: "Base de données REST", url: supabaseEndpoint("/rest/v1/"), method: "HEAD" }),
    runCheck({ name: "realtime", label: "Realtime", url: supabaseEndpoint("/realtime/v1/"), method: "GET" }),
    runCheck({ name: "storage", label: "Storage", url: supabaseEndpoint("/storage/v1/object"), method: "HEAD" }),
  ]);

  const restOk = checks.find((check) => check.name === "rest")?.ok ?? false;
  const allOk = checks.every((check) => check.ok);
  const status: LocalHealthStatus = allOk ? "ok" : restOk ? "warning" : "error";

  return {
    status,
    checkedAt: new Date().toISOString(),
    checks,
    restOk,
    message: status === "ok"
      ? "Backend local joignable."
      : restOk
        ? "La DB répond, mais certains services locaux sont incomplets."
        : "Maintenance locale: la base de données ne répond pas.",
  };
}