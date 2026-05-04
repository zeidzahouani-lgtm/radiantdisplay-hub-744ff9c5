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
  corsBlocked?: boolean;
  hint?: string | null;
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

  // Stratégie : tenter d'abord un fetch CORS standard avec apikey.
  // Si CORS échoue (PostgREST/Kong pas configuré pour l'origine), retomber sur un
  // ping no-cors qui prouve juste que le port répond, sans pouvoir lire le statut.
  try {
    const response = await fetch(check.url, {
      method: check.method,
      headers: AUTH_HEADERS(),
      cache: "no-store",
      signal: controller.signal,
    });

    // PostgREST/Kong renvoient typiquement 200/301/401/404 sur ces endpoints quand
    // le service est sain. On considère KO uniquement les 5xx.
    const reachable = response.status > 0 && response.status < 500;
    const details = !reachable
      ? response.status === 503
        ? "HTTP 503: la gateway répond mais le service backend local est indisponible. Redémarrez les conteneurs db/rest/storage/realtime/kong."
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
    const isAbort = error?.name === "AbortError";
    // Fallback no-cors : si le port est bien ouvert mais que CORS bloque la réponse,
    // un fetch no-cors résout (status=0, type=opaque) et prouve la joignabilité.
    if (!isAbort) {
      try {
        const fallbackController = new AbortController();
        const fallbackTimeout = window.setTimeout(() => fallbackController.abort(), 4000);
        const opaque = await fetch(check.url, {
          method: "GET",
          mode: "no-cors",
          cache: "no-store",
          signal: fallbackController.signal,
        });
        window.clearTimeout(fallbackTimeout);
        // type === "opaque" => le serveur a répondu, mais le navigateur masque le contenu.
        if (opaque.type === "opaque" || opaque.type === "opaqueredirect") {
          return {
            ...check,
            ok: true,
            reachable: true,
            status: 0,
            statusText: "Réponse opaque (CORS)",
            durationMs: Math.round(performance.now() - started),
            error: null,
            details:
              "Service joignable mais CORS non configuré pour cette origine. Le service répond, ajoutez l'origine de l'app dans les CORS Kong/PostgREST pour des tests détaillés.",
          };
        }
      } catch {
        // ignore, on retombe sur le KO réseau classique
      }
    }
    return {
      ...check,
      ok: false,
      reachable: false,
      status: null,
      statusText: "Aucune réponse",
      durationMs: Math.round(performance.now() - started),
      error: isAbort ? "Timeout après 6s" : error?.message || String(error),
      details: "Aucune réponse HTTP: URL inaccessible, DNS/SSL incorrect, port fermé, mixed-content (HTTPS→HTTP) ou proxy nginx non joignable.",
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