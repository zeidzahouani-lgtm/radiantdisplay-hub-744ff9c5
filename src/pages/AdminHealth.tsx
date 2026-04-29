import { useLocalHealth } from "@/hooks/useLocalHealth";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, Database, HardDrive, Radio, RefreshCw, XCircle } from "lucide-react";
import { discoverLocalBackends, getLocalBackendCandidates, type LocalBackendCandidate } from "@/lib/local-health";
import { getSupabaseUrl } from "@/lib/env";

const icons = { rest: Database, realtime: Radio, storage: HardDrive } as const;

export default function AdminHealth() {
  const { data, isLoading, isFetching, refetch, error } = useLocalHealth(15000);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [candidates, setCandidates] = useState<LocalBackendCandidate[]>([]);

  const runDiscovery = async () => {
    setIsDiscovering(true);
    try {
      setCandidates(await discoverLocalBackends());
    } finally {
      setIsDiscovering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Activity className="h-8 w-8 text-primary" /> Santé backend local
          </h1>
          <p className="mt-1 text-muted-foreground">Tests directs depuis le navigateur vers REST, Realtime et Storage.</p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data?.status === "ok" ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <XCircle className="h-5 w-5 text-destructive" />}
            Résultat global
          </CardTitle>
          <CardDescription>{isLoading ? "Test en cours…" : data?.message || error?.message || "Aucun résultat"}</CardDescription>
        </CardHeader>
        {data && (
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>Backend configuré : <span className="font-mono text-foreground">{getSupabaseUrl()}</span></div>
            <div>Dernière vérification : {new Date(data.checkedAt).toLocaleString()}</div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recherche automatique de base locale</CardTitle>
          <CardDescription>
            Teste les endpoints probables: {getLocalBackendCandidates().join(" · ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {candidates.length === 0 ? (
            <div className="rounded-md bg-muted p-3 text-muted-foreground">
              Lancez la recherche pour identifier l'URL locale qui répond. Si une URL OK est différente du backend configuré, rebuild avec cette URL.
            </div>
          ) : candidates.map((candidate) => (
            <div key={candidate.url} className="rounded-md border bg-card p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="break-all font-mono text-xs">{candidate.url}</div>
                <Badge variant={candidate.report.restOk ? "default" : "destructive"}>{candidate.report.restOk ? "DB trouvée" : "DB KO"}</Badge>
              </div>
              <div className="mt-2 text-muted-foreground">{candidate.report.message}</div>
              {candidate.report.restOk && candidate.url !== getSupabaseUrl() && (
                <div className="mt-3 rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                  VITE_SUPABASE_URL={candidate.url} npm run build:local && APP_PORT=8080 npm run deploy:local
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {data?.checks.map((check) => {
          const Icon = icons[check.name];
          return (
            <Card key={check.name} className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2"><Icon className="h-5 w-5 text-primary" />{check.label}</span>
                  <Badge variant={check.ok ? "default" : "destructive"}>{check.ok ? "OK" : "KO"}</Badge>
                </CardTitle>
                <CardDescription>{check.method} · {check.durationMs} ms</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="break-all rounded-md bg-muted p-2 font-mono text-xs text-muted-foreground">{check.url}</div>
                <div className="flex justify-between gap-3"><span className="text-muted-foreground">Statut</span><span>{check.status ?? "—"} {check.statusText}</span></div>
                {check.error && <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">{check.error}</div>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}