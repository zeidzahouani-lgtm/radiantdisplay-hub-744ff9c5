import { useLocalHealth } from "@/hooks/useLocalHealth";
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, Database, HardDrive, Radio, RefreshCw, XCircle, Shield, Timer, Globe, Wrench, Copy, AlertTriangle } from "lucide-react";
import { discoverLocalBackends, getLocalBackendCandidates, type LocalBackendCandidate, type LocalHealthCheck } from "@/lib/local-health";
import { getSupabaseUrl } from "@/lib/env";
import { toast } from "sonner";

const icons = { rest: Database, realtime: Radio, storage: HardDrive } as const;

function statusBadge(check: LocalHealthCheck) {
  if (check.ok && check.corsBlocked) return <Badge variant="secondary">OK (CORS bloqué)</Badge>;
  if (check.ok) return <Badge variant="default">OK</Badge>;
  return <Badge variant="destructive">KO</Badge>;
}

function durationTone(ms: number) {
  if (ms < 300) return "text-emerald-500";
  if (ms < 1500) return "text-amber-500";
  return "text-destructive";
}

export default function AdminHealth() {
  const { data, isLoading, isFetching, refetch, error } = useLocalHealth(15000);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [candidates, setCandidates] = useState<LocalBackendCandidate[]>([]);

  const dbCheck = useMemo(() => data?.checks.find((c) => c.name === "rest"), [data]);
  const realtimeCheck = useMemo(() => data?.checks.find((c) => c.name === "realtime"), [data]);
  const storageCheck = useMemo(() => data?.checks.find((c) => c.name === "storage"), [data]);

  const backendUrl = getSupabaseUrl();
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const mixedContent = origin.startsWith("https://") && backendUrl.startsWith("http://");

  const runDiscovery = async () => {
    setIsDiscovering(true);
    try {
      setCandidates(await discoverLocalBackends());
    } finally {
      setIsDiscovering(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("Copié dans le presse-papier"));
  };

  // Actions correctives dynamiques basées sur l'état du check DB
  const correctiveActions = useMemo(() => {
    const actions: Array<{ title: string; description: string; command?: string }> = [];
    if (!dbCheck) return actions;

    if (mixedContent) {
      actions.push({
        title: "Mixed content HTTPS → HTTP",
        description:
          "Cette page est servie en HTTPS mais le backend est en HTTP. Le navigateur bloque l'appel. Servez le backend en HTTPS (proxy nginx + Let's Encrypt) ou ouvrez l'app en HTTP.",
      });
    }

    if (!dbCheck.reachable && dbCheck.status === null) {
      actions.push({
        title: "Aucune réponse réseau",
        description:
          "Le port n'est pas joignable depuis ce navigateur. Vérifiez l'IP, le port, le firewall et que les conteneurs Docker tournent.",
        command: "docker compose ps",
      });
      actions.push({
        title: "Redémarrer la stack Supabase locale",
        description: "Si les conteneurs sont arrêtés ou figés, relancez-les.",
        command: "cd ~/screenflow/supabase && docker compose up -d db rest storage realtime auth kong",
      });
    }

    if (dbCheck.status === 503) {
      actions.push({
        title: "Gateway up, service down (HTTP 503)",
        description:
          "Kong répond mais PostgREST/Storage est indisponible. Redémarrez les services derrière la gateway.",
        command: "cd ~/screenflow/supabase && docker compose restart rest storage realtime kong",
      });
    }

    if (dbCheck.corsBlocked) {
      actions.push({
        title: "CORS non configuré sur Kong",
        description:
          "Le service répond mais le navigateur ne peut pas lire la réponse. Activez le plugin CORS sur Kong en ajoutant l'origine de l'app.",
        command: `# Dans volumes/api/kong.yml, ajoutez sous chaque service le plugin :\nplugins:\n  - name: cors\n    config:\n      origins: ["${origin}"]\n      methods: [GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS]\n      headers: [Authorization, apikey, Content-Type, X-Client-Info]\n      credentials: true\n# puis : docker compose restart kong`,
      });
    }

    if (dbCheck.error?.toLowerCase().includes("timeout")) {
      actions.push({
        title: "Délai trop long",
        description:
          "Le service met plus de 6s à répondre. Vérifiez la charge CPU/IO et les logs Postgres.",
        command: "docker compose logs --tail=200 db rest",
      });
    }

    if (dbCheck.ok && !dbCheck.corsBlocked && dbCheck.status && dbCheck.status >= 400) {
      actions.push({
        title: `Réponse HTTP ${dbCheck.status}`,
        description:
          "Le service répond, mais avec une erreur applicative (souvent clé apikey invalide ou JWT expiré). Vérifiez VITE_SUPABASE_PUBLISHABLE_KEY.",
      });
    }

    if (actions.length === 0 && dbCheck.ok) {
      actions.push({
        title: "Tout est nominal",
        description: "Aucune action requise. La base de données répond et CORS est configuré correctement.",
      });
    }

    return actions;
  }, [dbCheck, mixedContent, origin]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Activity className="h-8 w-8 text-primary" /> Santé backend local
          </h1>
          <p className="mt-1 text-muted-foreground">
            Diagnostics directs depuis ce navigateur vers la base de données, le Realtime et le Storage.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={runDiscovery} disabled={isDiscovering} variant="outline" className="gap-2">
            <Database className={`h-4 w-4 ${isDiscovering ? "animate-pulse" : ""}`} /> Chercher DB locale
          </Button>
          <Button onClick={() => refetch()} disabled={isFetching} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Relancer les tests
          </Button>
        </div>
      </div>

      {/* Résultat global */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data?.status === "ok" ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : data?.status === "warning" ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive" />
            )}
            Résultat global
          </CardTitle>
          <CardDescription>{isLoading ? "Test en cours…" : data?.message || error?.message || "Aucun résultat"}</CardDescription>
        </CardHeader>
        {data && (
          <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              Backend configuré : <span className="font-mono text-foreground break-all">{backendUrl}</span>
            </div>
            <div>Origine du navigateur : <span className="font-mono text-foreground break-all">{origin}</span></div>
            <div>Dernière vérification : {new Date(data.checkedAt).toLocaleString()}</div>
            <div>Auto-refresh : toutes les 15 s</div>
          </CardContent>
        )}
      </Card>

      {/* Diagnostic DB détaillé */}
      {dbCheck && (
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" /> Diagnostic base de données
              </span>
              {statusBadge(dbCheck)}
            </CardTitle>
            <CardDescription>
              Inspection détaillée de l'endpoint REST PostgREST/Kong : URL appelée, statut HTTP, gestion CORS et délai de réponse.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-card p-3">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" /> URL testée
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="break-all text-xs">{dbCheck.url}</code>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(dbCheck.url)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">Méthode : {dbCheck.method}</div>
              </div>

              <div className="rounded-lg border bg-card p-3">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Activity className="h-3.5 w-3.5" /> Statut HTTP
                </div>
                <div className="text-lg font-semibold">
                  {dbCheck.status === null ? "—" : dbCheck.status === 0 ? "opaque" : dbCheck.status}
                </div>
                <div className="text-xs text-muted-foreground">{dbCheck.statusText}</div>
              </div>

              <div className="rounded-lg border bg-card p-3">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Shield className="h-3.5 w-3.5" /> CORS
                </div>
                <div className="font-semibold">
                  {dbCheck.corsBlocked ? (
                    <span className="text-amber-500">Bloqué par le navigateur</span>
                  ) : dbCheck.ok ? (
                    <span className="text-emerald-500">Autorisé</span>
                  ) : (
                    <span className="text-muted-foreground">Indéterminé</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {dbCheck.corsBlocked
                    ? "Le port répond mais Kong ne renvoie pas les headers Access-Control-Allow-*."
                    : dbCheck.ok
                      ? "L'origine de l'app est acceptée par le backend."
                      : "Pas de réponse, impossible d'évaluer CORS."}
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3">
                <div className="mb-1 flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Timer className="h-3.5 w-3.5" /> Délai
                </div>
                <div className={`text-lg font-semibold ${durationTone(dbCheck.durationMs)}`}>
                  {dbCheck.durationMs} ms
                </div>
                <div className="text-xs text-muted-foreground">
                  &lt;300ms excellent · &lt;1500ms acceptable · au-delà = surchargé.
                </div>
              </div>
            </div>

            {(dbCheck.error || dbCheck.details) && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                <div className="mb-1 font-semibold text-amber-700 dark:text-amber-400">Explication</div>
                <div className="text-foreground">{dbCheck.error || dbCheck.details}</div>
              </div>
            )}

            {/* Actions correctives */}
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Wrench className="h-4 w-4 text-primary" /> Actions correctives
              </h3>
              <div className="space-y-2">
                {correctiveActions.map((action, idx) => (
                  <div key={idx} className="rounded-md border bg-muted/30 p-3 text-xs">
                    <div className="font-semibold text-foreground">{action.title}</div>
                    <div className="mt-1 text-muted-foreground">{action.description}</div>
                    {action.command && (
                      <div className="mt-2 flex items-start justify-between gap-2 rounded bg-background p-2">
                        <pre className="flex-1 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{action.command}</pre>
                        <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copy(action.command!)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Découverte automatique */}
      <Card>
        <CardHeader>
          <CardTitle>Recherche automatique de base locale</CardTitle>
          <CardDescription>
            Teste les endpoints probables : {getLocalBackendCandidates().join(" · ")}
          </CardDescription>
          {typeof window !== "undefined" && window.location.protocol === "https:" && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              ⚠️ Cette page est en <strong>HTTPS</strong>. Le navigateur bloque les appels HTTP (mixed-content), donc les ports <code>:8000</code> et <code>:8080</code> en HTTP <strong>ne peuvent pas être testés</strong> ici. Seuls les endpoints HTTPS (typiquement <code>:8443</code>) sont sondés. Pour tester un backend HTTP, ouvrez l'app via <code>http://</code>.
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {candidates.length === 0 ? (
            <div className="rounded-md bg-muted p-3 text-muted-foreground">
              Lancez la recherche pour identifier l'URL locale qui répond. Si une URL OK est différente du backend configuré, rebuild avec cette URL.
            </div>
          ) : (
            candidates.map((candidate) => (
              <div key={candidate.url} className="rounded-md border bg-card p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="break-all font-mono text-xs">{candidate.url}</div>
                  <Badge variant={candidate.report.restOk ? "default" : "destructive"}>
                    {candidate.report.restOk ? "DB trouvée" : "DB KO"}
                  </Badge>
                </div>
                <div className="mt-2 text-muted-foreground">{candidate.report.message}</div>
                {candidate.report.restOk && candidate.url !== backendUrl && (
                  <div className="mt-3 rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                    VITE_SUPABASE_URL={candidate.url} npm run build:local && APP_PORT=8080 npm run deploy:local
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Realtime + Storage */}
      <div className="grid gap-4 md:grid-cols-2">
        {[realtimeCheck, storageCheck].filter(Boolean).map((check) => {
          const Icon = icons[check!.name];
          return (
            <Card key={check!.name} className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    {check!.label}
                  </span>
                  {statusBadge(check!)}
                </CardTitle>
                <CardDescription>
                  {check!.method} · <span className={durationTone(check!.durationMs)}>{check!.durationMs} ms</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="break-all rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">{check!.url}</div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Statut</span>
                  <span>
                    {check!.status ?? "—"} {check!.statusText}
                  </span>
                </div>
                {check!.error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">{check!.error}</div>
                )}
                {check!.hint && (
                  <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Action : </span>
                    {check!.hint}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
