type EnvCheck = {
  name: string;
  value?: string;
  required: boolean;
  ok: boolean;
  hint: string;
};

const rawEnv = import.meta.env as Record<string, string | undefined>;

function clean(value?: string) {
  return (value || "").trim();
}

export const appEnv = {
  supabaseUrl: clean(rawEnv.VITE_SUPABASE_URL),
  supabasePublishableKey: clean(rawEnv.VITE_SUPABASE_PUBLISHABLE_KEY),
  supabaseProjectId: clean(rawEnv.VITE_SUPABASE_PROJECT_ID),
  databaseUrl: clean(rawEnv.DATABASE_URL),
};

export function getSupabaseUrl() {
  return appEnv.supabaseUrl.replace(/\/$/, "");
}

export function getSupabasePublishableKey() {
  return appEnv.supabasePublishableKey;
}

export function supabaseEndpoint(path: string) {
  const base = getSupabaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function getLocalEnvChecks(): EnvCheck[] {
  const url = appEnv.supabaseUrl;
  const key = appEnv.supabasePublishableKey;

  return [
    {
      name: "VITE_SUPABASE_URL",
      value: url,
      required: true,
      ok: /^https?:\/\/.+/.test(url),
      hint: "Doit pointer vers l'API Supabase accessible par le navigateur local, ex: http://IP_SERVEUR:8080 ou http://IP_SERVEUR:8000.",
    },
    {
      name: "VITE_SUPABASE_PUBLISHABLE_KEY",
      value: key,
      required: true,
      ok: key.length > 40 && key.split(".").length === 3,
      hint: "Doit contenir la clé anon/publishable de l'instance Supabase locale.",
    },
    {
      name: "VITE_SUPABASE_PROJECT_ID",
      value: appEnv.supabaseProjectId,
      required: false,
      ok: !appEnv.supabaseProjectId || appEnv.supabaseProjectId.length >= 3,
      hint: "Optionnel en local; utilisez local ou l'identifiant du projet.",
    },
    {
      name: "DATABASE_URL",
      value: appEnv.databaseUrl,
      required: false,
      ok: !appEnv.databaseUrl || /^postgres(?:ql)?:\/\/.+/.test(appEnv.databaseUrl),
      hint: "Utilisé uniquement par les scripts/CLI serveur, jamais par le frontend Vite.",
    },
  ];
}

export function validateLocalEnvironment() {
  const failed = getLocalEnvChecks().filter((check) => check.required && !check.ok);
  if (failed.length === 0) return;

  const message = [
    "Configuration backend locale invalide.",
    ...failed.map((check) => `- ${check.name}: ${check.hint}`),
    "Créez .env.local depuis .env.example puis rebuild l'application.",
  ].join("\n");

  console.error("[local-env]", message, getLocalEnvChecks().map(({ name, ok, required, hint }) => ({ name, ok, required, hint })));
  throw new Error(message);
}

export function logLocalEnvironmentDiagnostics() {
  const checks = getLocalEnvChecks().map(({ name, value, ok, required, hint }) => ({
    name,
    present: Boolean(value),
    ok,
    required,
    hint,
  }));
  console.info("[local-env] Configuration frontend", checks);
  console.info("[local-env] Endpoints attendus", {
    rest: supabaseEndpoint("/rest/v1/"),
    storage: supabaseEndpoint("/storage/v1/"),
    functions: supabaseEndpoint("/functions/v1/"),
    realtime: supabaseEndpoint("/realtime/v1/"),
  });
}

export function explainSupabaseError(error: unknown, context = "Supabase") {
  const anyError = error as { message?: string; code?: string; details?: string; hint?: string; status?: number } | null;
  const message = anyError?.message || String(error || "Erreur inconnue");
  const lower = message.toLowerCase();

  let cause = "Erreur backend non classée";
  let action = "Ouvrez la console réseau et vérifiez l'URL appelée, le statut HTTP et la réponse JSON.";

  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("fetch")) {
    cause = "Erreur réseau ou CORS";
    action = "Vérifiez que VITE_SUPABASE_URL est joignable depuis le navigateur et que /rest/v1, /storage/v1 et /functions/v1 sont proxyfiés.";
  } else if (lower.includes("invalid api key") || lower.includes("jwt") || anyError?.status === 401 || anyError?.status === 403) {
    cause = "Clé Supabase invalide ou permission/RLS refusée";
    action = "Vérifiez VITE_SUPABASE_PUBLISHABLE_KEY, ANON_KEY côté serveur et les politiques RLS appliquées par les migrations.";
  } else if (lower.includes("does not exist") || anyError?.code === "42P01" || anyError?.code === "42703") {
    cause = "Table ou colonne absente";
    action = "Appliquez toutes les migrations de supabase/migrations dans l'ordre chronologique sur la base locale.";
  } else if (lower.includes("row-level security") || lower.includes("violates row-level security")) {
    cause = "Erreur RLS / permission";
    action = "Vérifiez que les migrations du mode public local sont appliquées et que le rôle anon possède les politiques attendues.";
  } else if (lower.includes("cors")) {
    cause = "Erreur CORS";
    action = "Vérifiez les headers Access-Control-Allow-* du proxy /functions/v1 et de Kong.";
  }

  console.error(`[db-diagnostic] ${context}: ${cause}`, {
    message,
    code: anyError?.code,
    details: anyError?.details,
    hint: anyError?.hint,
    status: anyError?.status,
    action,
    supabaseUrl: appEnv.supabaseUrl || "missing",
  });

  return { cause, action, message };
}
