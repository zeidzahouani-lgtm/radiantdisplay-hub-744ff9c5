import { useLocalHealth } from "@/hooks/useLocalHealth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, Database, HardDrive, Radio, RefreshCw, XCircle } from "lucide-react";

const icons = { rest: Database, realtime: Radio, storage: HardDrive } as const;

export default function AdminHealth() {
  const { data, isLoading, isFetching, refetch, error } = useLocalHealth(15000);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Activity className="h-8 w-8 text-primary" /> Santé backend local
          </h1>
          <p className="mt-1 text-muted-foreground">Tests directs depuis le navigateur vers REST, Realtime et Storage.</p>
        </div>
        <Button onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Relancer les tests
        </Button>
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
          <CardContent className="text-sm text-muted-foreground">
            Dernière vérification : {new Date(data.checkedAt).toLocaleString()}
          </CardContent>
        )}
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