import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Activity, Cpu, MemoryStick, HardDrive, Server, Container, Database, RefreshCw, Loader2, Network, Wifi, Gauge } from "lucide-react";

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

interface ServerData {
  hostname: string;
  os: string;
  kernel: string;
  uptime: string;
  load: string[];
  cpu: { model: string; cores: number; usage_pct: number };
  memory: { total: number; used: number; free: number; available: number };
  swap: { total: number; used: number };
  disk: { total: number; used: number; free: number; pct: string };
  disks: { device: string; size: number; used: number; avail: number; pct: string; mount: string }[];
  network: string[];
  docker: { version: string; containers: { name: string; image: string; status: string; ports: string }[] };
  top_processes: { pid: string; cpu: string; mem: string; cmd: string }[];
}

interface DbData {
  tables: Record<string, number>;
  recent_screens: { id: string; name: string; status: string; player_heartbeat_at: string | null }[];
}

export default function AdminServerStatus() {
  const [host, setHost] = useState(() => localStorage.getItem("server_stats_host") || "");
  const [port, setPort] = useState(() => localStorage.getItem("server_stats_port") || "22");
  const [username, setUsername] = useState(() => localStorage.getItem("server_stats_user") || "root");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [server, setServer] = useState<ServerData | null>(null);
  const [database, setDatabase] = useState<DbData | null>(null);
  const [lastFetch, setLastFetch] = useState<string | null>(null);

  const fetchStats = async () => {
    if (!host || !username || !password) {
      toast.error("Renseignez l'IP, l'utilisateur et le mot de passe");
      return;
    }
    setLoading(true);
    try {
      localStorage.setItem("server_stats_host", host);
      localStorage.setItem("server_stats_port", port);
      localStorage.setItem("server_stats_user", username);

      const { data, error } = await supabase.functions.invoke("server-stats", {
        body: { host: host.trim(), port: parseInt(port) || 22, username: username.trim(), password },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erreur inconnue");
      setServer(data.server);
      setDatabase(data.database);
      setLastFetch(new Date().toLocaleTimeString());
      toast.success("Stats récupérées");
    } catch (e: any) {
      toast.error("Erreur: " + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  const memPct = server ? (server.memory.used / server.memory.total) * 100 : 0;
  const diskPct = server ? (server.disk.used / server.disk.total) * 100 : 0;
  const swapPct = server && server.swap.total ? (server.swap.used / server.swap.total) * 100 : 0;

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Activity className="h-8 w-8 text-primary" />État du Serveur Local
        </h1>
        <p className="text-muted-foreground mt-1">
          Monitoring temps réel du serveur Linux et de la base de données.
        </p>
      </div>

      {/* Connection card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Server className="h-5 w-5" />Connexion SSH</CardTitle>
          <CardDescription>Renseignez les identifiants pour interroger le serveur</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2 space-y-1.5">
              <Label>Hôte / IP</Label>
              <Input value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.10" disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label>Port</Label>
              <Input value={port} onChange={e => setPort(e.target.value)} placeholder="22" disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label>Utilisateur</Label>
              <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="root" disabled={loading} />
            </div>
            <div className="space-y-1.5">
              <Label>Mot de passe</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" disabled={loading} />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <Button onClick={fetchStats} disabled={loading} className="gap-2">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" />Récupération…</> : <><RefreshCw className="h-4 w-4" />Actualiser</>}
            </Button>
            {lastFetch && <span className="text-xs text-muted-foreground">Dernière mise à jour: {lastFetch}</span>}
          </div>
        </CardContent>
      </Card>

      {server && (
        <>
          {/* System overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" />CPU</CardDescription>
                <CardTitle className="text-3xl">{server.cpu.usage_pct.toFixed(1)}%</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={server.cpu.usage_pct} />
                <p className="text-xs text-muted-foreground mt-2">{server.cpu.cores} cœurs · Load {server.load.join(" ")}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5"><MemoryStick className="h-3.5 w-3.5" />Mémoire</CardDescription>
                <CardTitle className="text-3xl">{memPct.toFixed(0)}%</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={memPct} />
                <p className="text-xs text-muted-foreground mt-2">{formatBytes(server.memory.used)} / {formatBytes(server.memory.total)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" />Disque /</CardDescription>
                <CardTitle className="text-3xl">{server.disk.pct}</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={diskPct} />
                <p className="text-xs text-muted-foreground mt-2">{formatBytes(server.disk.used)} / {formatBytes(server.disk.total)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />Swap</CardDescription>
                <CardTitle className="text-3xl">{swapPct.toFixed(0)}%</CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={swapPct} />
                <p className="text-xs text-muted-foreground mt-2">{formatBytes(server.swap.used)} / {formatBytes(server.swap.total)}</p>
              </CardContent>
            </Card>
          </div>

          {/* System info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Server className="h-5 w-5" />Informations système</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Hostname</span><span className="font-medium">{server.hostname}</span></div>
              <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">OS</span><span className="font-medium">{server.os || "—"}</span></div>
              <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Kernel</span><span className="font-medium">{server.kernel}</span></div>
              <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">Uptime</span><span className="font-medium">{server.uptime}</span></div>
              <div className="flex justify-between border-b pb-1 md:col-span-2"><span className="text-muted-foreground">CPU</span><span className="font-medium">{server.cpu.model}</span></div>
              <div className="flex justify-between border-b pb-1 md:col-span-2"><span className="text-muted-foreground flex items-center gap-1.5"><Network className="h-3.5 w-3.5" />Réseau</span><span className="font-medium">{server.network.join(", ") || "—"}</span></div>
            </CardContent>
          </Card>

          {/* Disks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><HardDrive className="h-5 w-5" />Stockage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {server.disks.map((d) => (
                <div key={d.device + d.mount} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-mono">{d.mount} <span className="text-muted-foreground">({d.device})</span></span>
                    <span className="text-muted-foreground">{formatBytes(d.used)} / {formatBytes(d.size)} · {d.pct}</span>
                  </div>
                  <Progress value={parseFloat(d.pct)} />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Docker */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Container className="h-5 w-5" />Docker</CardTitle>
              <CardDescription>{server.docker.version || "Docker non installé"}</CardDescription>
            </CardHeader>
            <CardContent>
              {server.docker.containers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun conteneur en cours d'exécution.</p>
              ) : (
                <div className="space-y-2">
                  {server.docker.containers.map((c) => (
                    <div key={c.name} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.image}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={c.status.includes("Up") ? "default" : "destructive"}>{c.status}</Badge>
                        {c.ports && <span className="text-xs text-muted-foreground hidden md:inline">{c.ports}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top processes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5" />Top processus (CPU)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground border-b pb-2 mb-2">
                <div className="col-span-2">PID</div><div className="col-span-2">CPU%</div><div className="col-span-2">MEM%</div><div className="col-span-6">Commande</div>
              </div>
              {server.top_processes.map((p) => (
                <div key={p.pid} className="grid grid-cols-12 gap-2 text-sm py-1 border-b last:border-0">
                  <div className="col-span-2 font-mono">{p.pid}</div>
                  <div className="col-span-2">{p.cpu}</div>
                  <div className="col-span-2">{p.mem}</div>
                  <div className="col-span-6 font-mono truncate">{p.cmd}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {database && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><Database className="h-5 w-5" />Base de données</CardTitle>
            <CardDescription>Nombre d'enregistrements par table</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Object.entries(database.tables).map(([name, count]) => (
                <div key={name} className="p-3 rounded-lg border bg-muted/30">
                  <p className="text-xs text-muted-foreground capitalize">{name.replace(/_/g, " ")}</p>
                  <p className="text-2xl font-bold">{count.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {database.recent_screens.length > 0 && (
              <>
                <Separator className="my-6" />
                <h3 className="font-medium mb-3 flex items-center gap-2"><Wifi className="h-4 w-4" />Écrans récents</h3>
                <div className="space-y-2">
                  {database.recent_screens.map((s) => {
                    const online = s.player_heartbeat_at && (Date.now() - new Date(s.player_heartbeat_at).getTime()) < 60000;
                    return (
                      <div key={s.id} className="flex items-center justify-between p-2 rounded border bg-card text-sm">
                        <span className="font-medium">{s.name}</span>
                        <Badge variant={online ? "default" : "secondary"}>{online ? "En ligne" : "Hors ligne"}</Badge>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
