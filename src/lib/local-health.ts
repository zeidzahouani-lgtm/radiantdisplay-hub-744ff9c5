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
  details?: string | null;
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
    const details = !reachable
      ? response.status === 503
        ? "HTTP 503: la gateway/proxy répond, mais le service backend local derrière elle est indisponible ou pas démarré. Relancez le déploiement SSH avec backend local, ou redémarrez les conteneurs db/rest/storage/realtime/kong."
        : `HTTP ${response.status}: ${response.statusText || "réponse non OK"}`
      : null;
    return {
      ...check,
      ok: reachable,
      reachable,
      status: response.status,
      statusText: response.statusText || "Réponse HTTP reçue",
      durationMs: Math.round(performance.now() - started),
      error: details,
      details,
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
      details: "Aucune réponse HTTP: URL inaccessible, DNS/SSL incorrect, port fermé ou proxy nginx non joignable.",
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

export async function checkLocalBackendHealth(baseUrl = getSupabaseUrl()): Promise<LocalHealthReport> {
  const base = baseUrl.replace(/\/$/, "");
  const checks = await Promise.all([
    runCheck({ name: "rest", label: "Base de données REST", url: `${base}/rest/v1/`, method: "HEAD" }),
    runRealtimeCheck(base),
    runCheck({ name: "storage", label: "Storage", url: `${base}/storage/v1/bucket`, method: "GET" }),
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

export function getLocalBackendCandidates() {
  const configured = getSupabaseUrl();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return Array.from(new Set([
    configured,
    origin,
    origin.replace(/:8443$/, ":8000").replace(/:8080$/, ":8000"),
    `${window.location.protocol}//${window.location.hostname}:8000`,
    `${window.location.protocol}//${window.location.hostname}:8080`,
  ].filter((url) => /^https?:\/\/.+/.test(url))));
}

export async function discoverLocalBackends(): Promise<LocalBackendCandidate[]> {
  const results = await Promise.all(
    getLocalBackendCandidates().map(async (url) => ({ url, report: await checkLocalBackendHealth(url) }))
  );
  return results.sort((a, b) => Number(b.report.restOk) - Number(a.report.restOk));
}