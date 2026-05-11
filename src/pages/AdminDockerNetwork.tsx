import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Wifi, Network, Globe, MonitorSmartphone, Container, Loader2,
  CheckCircle2, XCircle, RefreshCw, Stethoscope, Terminal, AlertCircle, Server, KeyRound,
} from "lucide-react";

const NET_CONFIG_KEY = "screenflow.docker_network_config.v1";
const LEGACY_SSH_CONFIG_KEY = "screenflow.ssh_deploy_config.v1";

export default function AdminDockerNetwork() {
  // ===== SSH credentials dedicated to Docker network operations only =====
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshUser, setSshUser] = useState("root");
  const [sshPassword, setSshPassword] = useState("");
  const [sshRemoteDir, setSshRemoteDir] = useState("/opt/screenflow");

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const rawNet = localStorage.getItem(NET_CONFIG_KEY);
      let hasNetworkSshConfig = false;
      if (rawNet) {
        const n = JSON.parse(rawNet);
        hasNetworkSshConfig = !!(n.sshHost || n.sshPort || n.sshUser || n.sshRemoteDir);
        if (n.sshHost) setSshHost(n.sshHost);
        if (n.sshPort) setSshPort(n.sshPort);
        if (n.sshUser) setSshUser(n.sshUser);
        if (n.sshRemoteDir) setSshRemoteDir(n.sshRemoteDir);
        if (n.netName) setNetName(n.netName);
        if (n.netSubnet) setNetSubnet(n.netSubnet);
        if (n.netGateway) setNetGateway(n.netGateway);
        if (n.netIpRange) setNetIpRange(n.netIpRange);
        if (n.netMtu) setNetMtu(n.netMtu);
        if (n.netDns) setNetDns(n.netDns);
        if (n.netContainerIps) setNetContainerIps(n.netContainerIps);
        if (n.sysHostname) setSysHostname(n.sysHostname);
        if (n.sysHostAlias) setSysHostAlias(n.sysHostAlias);
      }
      if (!hasNetworkSshConfig) {
        const legacyRaw = localStorage.getItem(LEGACY_SSH_CONFIG_KEY);
        if (legacyRaw) {
          const c = JSON.parse(legacyRaw);
          if (c.sshHost) setSshHost(c.sshHost);
          if (c.sshPort) setSshPort(c.sshPort);
          if (c.sshUser) setSshUser(c.sshUser);
          if (c.sshRemoteDir) setSshRemoteDir(c.sshRemoteDir);
        }
      }
    } catch {}
  }, []);

  // Persist network-specific SSH config locally without touching deployment SSH config.
  const persist = () => {
    try {
      localStorage.setItem(NET_CONFIG_KEY, JSON.stringify({
        sshHost, sshPort, sshUser, sshRemoteDir,
        netName, netSubnet, netGateway, netIpRange, netMtu, netDns,
        netContainerIps, sysHostname, sysHostAlias,
        _saved_at: new Date().toISOString(),
      }));
    } catch {}
  };

  // ===== Network state =====
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [networkConfig, setNetworkConfig] = useState<any>(null);
  const [netSubnet, setNetSubnet] = useState("172.28.0.0/16");
  const [netGateway, setNetGateway] = useState("");
  const [netName, setNetName] = useState("screenflow_default");
  const [netIpRange, setNetIpRange] = useState("");
  const [netMtu, setNetMtu] = useState<string>("");
  const [netDns, setNetDns] = useState<string>("8.8.8.8, 1.1.1.1");
  const [netContainerIps, setNetContainerIps] = useState<string>("web=172.28.0.10\nkong=172.28.0.20");
  const [sysHostname, setSysHostname] = useState<string>("");
  const [sysHostAlias, setSysHostAlias] = useState<string>("");
  const [containerIpEdits, setContainerIpEdits] = useState<Record<string, string>>({});
  const [manualCid, setManualCid] = useState("");
  const [manualNewIp, setManualNewIp] = useState("");
  const [manualNetName, setManualNetName] = useState("screenflow_default");

  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const parseContainerIps = (raw: string): Record<string, string> => {
    const out: Record<string, string> = {};
    raw.split(/[\n,]/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const m = line.match(/^([a-zA-Z0-9_\-]+)\s*[=:]\s*(\d+\.\d+\.\d+\.\d+)$/);
      if (m) out[m[1]] = m[2];
    });
    return out;
  };

  const getFreshAccessToken = async () => {
    const refreshed = await supabase.auth.refreshSession();
    let session = refreshed.data.session;
    if (!session?.access_token) {
      const fallback = await supabase.auth.getSession();
      session = fallback.data.session;
    }
    if (session?.access_token) return session.access_token;
    toast.error("Session expirée. Reconnectez-vous.");
    window.location.href = "/login";
    return null;
  };

  const runSshAction = async (
    action: string,
    extra: Record<string, any> = {},
    opts: { initialLog?: string; successMessage?: string; onResult?: (r: any) => void } = {},
  ) => {
    if (!sshHost || !sshUser || !sshPassword) {
      toast.error("Renseignez l'IP, l'utilisateur et le mot de passe SSH ci-dessus");
      return;
    }
    persist();
    setBusy(true);
    setLogs([opts.initialLog || `▶ Action: ${action}`]);
    try {
      const accessToken = await getFreshAccessToken();
      if (!accessToken) return;
      const { data, error } = await supabase.functions.invoke("ssh-deploy", {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          action,
          host: sshHost.trim(),
          port: parseInt(sshPort) || 22,
          username: sshUser.trim(),
          password: sshPassword,
          remote_dir: sshRemoteDir.trim() || "/opt/screenflow",
          ...extra,
        },
      });
      if (error) throw error;
      const jobId = data?.job_id as string | undefined;
      if (!jobId) throw new Error("Job non démarré");
      const settingsKey = `ssh_deploy_job:${jobId}`;
      const start = Date.now();
      while (Date.now() - start < 5 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 3000));
        const { data: row } = await supabase.from("app_settings").select("value").eq("key", settingsKey).maybeSingle();
        if (!row?.value) continue;
        let parsed: any;
        try { parsed = JSON.parse(row.value as string); } catch { continue; }
        if (Array.isArray(parsed.logs)) setLogs(parsed.logs);
        if (parsed.status === "success") {
          if (opts.onResult) opts.onResult(parsed.result || null);
          toast.success(opts.successMessage || "Action terminée ✓");
          return;
        }
        if (parsed.status === "error") {
          toast.error("Échec : " + (parsed.error || "inconnu"));
          return;
        }
      }
      toast.warning("Délai dépassé — consultez les logs.");
    } catch (e: any) {
      setLogs((prev) => [...prev, "✗ Erreur: " + (e?.message || String(e))]);
      toast.error("Erreur: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  };

  const handleNetworkInspect = () => {
    setNetworkInfo(null);
    runSshAction("network_inspect", {}, {
      initialLog: "🔎 Inspection du réseau Docker…",
      successMessage: "Inspection terminée ✓",
      onResult: (r) => setNetworkInfo(r),
    });
  };
  const handleNetworkGetConfig = () => {
    setNetworkConfig(null);
    runSshAction("network_get_config", {}, {
      initialLog: "📡 Lecture de la configuration réseau…",
      successMessage: "Configuration lue ✓",
      onResult: (r) => {
        setNetworkConfig(r);
        if (r?.hostname && !sysHostname) setSysHostname(r.hostname);
      },
    });
  };
  const handleNetworkRecreate = () => {
    runSshAction("network_recreate", {}, {
      initialLog: "♻ Recréation du réseau Docker…",
      successMessage: "Réseau recréé ✓",
    });
  };
  const handleNetworkSetSubnet = () => {
    if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(netSubnet.trim())) {
      toast.error("Sous-réseau invalide (CIDR ex: 172.28.0.0/16)"); return;
    }
    const dnsList = netDns.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    for (const d of dnsList) {
      if (!/^\d+\.\d+\.\d+\.\d+$/.test(d)) { toast.error(`DNS invalide: ${d}`); return; }
    }
    const cIps = parseContainerIps(netContainerIps);
    const mtuNum = netMtu.trim() ? Number(netMtu.trim()) : undefined;
    if (mtuNum !== undefined && (!Number.isFinite(mtuNum) || mtuNum < 576 || mtuNum > 9000)) {
      toast.error("MTU invalide (576-9000)"); return;
    }
    runSshAction("network_set_subnet", {
      network_subnet: netSubnet.trim(),
      network_gateway: netGateway.trim() || undefined,
      network_name: netName.trim() || "screenflow_default",
      network_ip_range: netIpRange.trim() || undefined,
      network_mtu: mtuNum,
      network_dns: dnsList,
      container_ips: cIps,
    }, {
      initialLog: `🌐 Application config réseau (${netSubnet} sur ${netName})…`,
      successMessage: "Configuration réseau appliquée ✓",
    });
  };
  const handleSetHostname = () => {
    const h = sysHostname.trim();
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-\.]{0,61}[a-zA-Z0-9])?$/.test(h)) {
      toast.error("Hostname invalide (RFC 1123)"); return;
    }
    runSshAction("network_set_hostname", {
      hostname: h,
      hostname_alias: sysHostAlias.trim() || undefined,
    }, {
      initialLog: `🖥️ Application du hostname '${h}'…`,
      successMessage: "Hostname appliqué ✓",
    });
  };
  const handleApplyLiveContainerIp = (network: string, idOrName: string, label: string) => {
    const ip = (containerIpEdits[idOrName] || "").trim();
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) { toast.error(`IP invalide pour ${label}: ${ip}`); return; }
    runSshAction("network_set_container_ip", {
      network_name: network, container_id: idOrName, new_ip: ip,
    }, {
      initialLog: `🔧 Application IP ${ip} sur ${label} (${network})…`,
      successMessage: `IP ${ip} appliquée sur ${label} ✓`,
      onResult: () => { setTimeout(handleNetworkInspect, 800); },
    });
  };
  const handleManualContainerIp = () => {
    if (!manualCid.trim()) { toast.error("ID ou nom du conteneur requis"); return; }
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(manualNewIp.trim())) { toast.error("IP invalide"); return; }
    runSshAction("network_set_container_ip", {
      network_name: manualNetName.trim() || "screenflow_default",
      container_id: manualCid.trim(),
      new_ip: manualNewIp.trim(),
    }, {
      initialLog: `🔧 Modification IP live: ${manualCid} → ${manualNewIp}…`,
      successMessage: "IP appliquée en direct ✓",
      onResult: () => { setTimeout(handleNetworkInspect, 800); },
    });
  };

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wifi className="h-7 w-7" />Réseau Docker
        </h1>
        <p className="text-muted-foreground mt-1">
          Inspectez et configurez la carte réseau Docker, le hostname et les IPs des conteneurs sur le serveur local — indépendamment du déploiement SSH.
        </p>
      </div>

      {/* ===== SSH credentials isolated ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Connexion SSH au serveur local</CardTitle>
          <CardDescription>
            Ces identifiants servent uniquement aux opérations réseau ci-dessous (aucun déploiement n'est lancé). Ils sont mémorisés localement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="ssh-host">IP / Hôte SSH</Label>
              <Input id="ssh-host" value={sshHost} onChange={(e) => setSshHost(e.target.value)} placeholder="192.168.1.50" disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ssh-port">Port SSH</Label>
              <Input id="ssh-port" value={sshPort} onChange={(e) => setSshPort(e.target.value)} placeholder="22" disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ssh-user">Utilisateur</Label>
              <Input id="ssh-user" value={sshUser} onChange={(e) => setSshUser(e.target.value)} placeholder="root" disabled={busy} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="ssh-pwd">Mot de passe SSH</Label>
              <Input id="ssh-pwd" type="password" value={sshPassword} onChange={(e) => setSshPassword(e.target.value)} placeholder="••••••••" disabled={busy} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="ssh-dir">Répertoire distant</Label>
              <Input id="ssh-dir" value={sshRemoteDir} onChange={(e) => setSshRemoteDir(e.target.value)} placeholder="/opt/screenflow" disabled={busy} />
            </div>
          </div>
          <Alert>
            <Server className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Le mot de passe n'est pas stocké en clair côté serveur. Pour modifier le déploiement complet, utilisez la page <strong>Backup &amp; Docker</strong>.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* ===== Docker network management ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Network className="h-5 w-5" />Carte réseau Docker</CardTitle>
          <CardDescription>
            Configurez le bridge Docker, les IPs statiques des conteneurs et le hostname système — applicable à tout moment sans redéployer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleNetworkInspect} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
              Inspecter le réseau Docker
            </Button>
            <Button onClick={handleNetworkGetConfig} disabled={busy} variant="outline" className="gap-2">
              <Globe className="h-4 w-4" />Lire la config système
            </Button>
            <Button onClick={handleNetworkRecreate} disabled={busy} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />Recréer le réseau
            </Button>
          </div>

          <Separator />

          {/* Hostname */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><MonitorSmartphone className="h-4 w-4" />Hostname système</h3>
              <p className="text-xs text-muted-foreground">
                Modifie le nom d'hôte via <code>hostnamectl</code> et <code>/etc/hosts</code>.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="sys-hostname">Hostname</Label>
                <Input id="sys-hostname" value={sysHostname} onChange={(e) => setSysHostname(e.target.value)} placeholder="screenflow-srv" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sys-host-alias">Alias (optionnel)</Label>
                <Input id="sys-host-alias" value={sysHostAlias} onChange={(e) => setSysHostAlias(e.target.value)} placeholder="screenflow.local" />
              </div>
            </div>
            <Button onClick={handleSetHostname} disabled={busy || !sysHostname.trim()} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Appliquer le hostname
            </Button>
          </div>

          <Separator />

          {/* Subnet config */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Network className="h-4 w-4" />Configuration du bridge Docker</h3>
              <p className="text-xs text-muted-foreground">
                Génère <code>docker-compose.network.yml</code> et redémarre la stack.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="net-name">Nom du réseau</Label>
                <Input id="net-name" value={netName} onChange={(e) => setNetName(e.target.value)} placeholder="screenflow_default" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="net-subnet">Sous-réseau (CIDR)</Label>
                <Input id="net-subnet" value={netSubnet} onChange={(e) => setNetSubnet(e.target.value)} placeholder="172.28.0.0/16" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="net-gw">Passerelle</Label>
                <Input id="net-gw" value={netGateway} onChange={(e) => setNetGateway(e.target.value)} placeholder="172.28.0.1" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="net-iprange">Plage IP</Label>
                <Input id="net-iprange" value={netIpRange} onChange={(e) => setNetIpRange(e.target.value)} placeholder="172.28.5.0/24" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="net-mtu">MTU</Label>
                <Input id="net-mtu" value={netMtu} onChange={(e) => setNetMtu(e.target.value)} placeholder="1500" inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="net-dns">DNS (séparés par virgule)</Label>
                <Input id="net-dns" value={netDns} onChange={(e) => setNetDns(e.target.value)} placeholder="8.8.8.8, 1.1.1.1" />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="net-cips">IPs statiques par service (<code>service=IP</code>)</Label>
              <Textarea id="net-cips" rows={4} value={netContainerIps} onChange={(e) => setNetContainerIps(e.target.value)} placeholder={"web=172.28.0.10\nkong=172.28.0.20"} />
            </div>
            <Button onClick={handleNetworkSetSubnet} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Appliquer la configuration réseau
            </Button>
          </div>

          <Separator />

          {/* Live container IP by ID */}
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Container className="h-4 w-4" />Modifier l'IP d'un conteneur en direct</h3>
              <p className="text-xs text-muted-foreground">
                Applique l'IP via <code>docker network disconnect/connect</code>, sans redéployer.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="manual-net">Réseau Docker</Label>
                <Input id="manual-net" value={manualNetName} onChange={(e) => setManualNetName(e.target.value)} placeholder="screenflow_default" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-cid">ID ou nom du conteneur</Label>
                <Input id="manual-cid" value={manualCid} onChange={(e) => setManualCid(e.target.value)} placeholder="ex: a1b2c3d4e5f6" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="manual-ip">Nouvelle IP</Label>
                <Input id="manual-ip" value={manualNewIp} onChange={(e) => setManualNewIp(e.target.value)} placeholder="172.28.0.42" />
              </div>
            </div>
            <Button onClick={handleManualContainerIp} disabled={busy || !manualCid.trim() || !manualNewIp.trim()} className="gap-2">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Appliquer l'IP en direct
            </Button>
          </div>

          {networkConfig && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2"><Globe className="h-4 w-4" />Configuration système actuelle</h3>
                <div className="grid gap-2 md:grid-cols-2 text-xs">
                  <div className="rounded border p-2"><span className="text-muted-foreground">Hostname:</span> <code>{networkConfig.hostname}</code></div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">FQDN:</span> <code>{networkConfig.fqdn}</code></div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">Passerelle:</span> <code>{networkConfig.gateway || "—"}</code></div>
                  <div className="rounded border p-2"><span className="text-muted-foreground">DNS:</span> <code>{(networkConfig.dns || []).join(", ") || "—"}</code></div>
                </div>
                {Array.isArray(networkConfig.ip_addresses) && networkConfig.ip_addresses.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Adresses IP</h4>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto">{networkConfig.ip_addresses.join("\n")}</pre>
                  </div>
                )}
                {Array.isArray(networkConfig.routes) && networkConfig.routes.length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Routes</h4>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto">{networkConfig.routes.join("\n")}</pre>
                  </div>
                )}
              </div>
            </>
          )}

          {networkInfo && (
            <>
              <Separator />
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Résultat de l'inspection</h3>

                {Array.isArray(networkInfo.details) && networkInfo.details.length > 0 && (
                  <div className="space-y-3">
                    {networkInfo.details.map((d: any) => (
                      <div key={d.name} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <code className="text-sm font-semibold">{d.name}</code>
                          <Badge variant="outline">{d.driver}</Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Subnet:</span> <code>{d.subnet || "—"}</code></div>
                          <div><span className="text-muted-foreground">Gateway:</span> <code>{d.gateway || "—"}</code></div>
                        </div>
                        {d.containers?.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Conteneurs ({d.containers.length}) — modifier l'IP en direct :</p>
                            <div className="space-y-1.5">
                              {d.containers.map((c: any) => {
                                const key = c.id || c.name;
                                const currentIp = (c.ipv4 || "").split("/")[0];
                                return (
                                  <div key={key} className="grid grid-cols-1 md:grid-cols-[1fr_120px_140px_auto] gap-2 items-center text-xs bg-muted/40 rounded px-2 py-1.5">
                                    <div className="min-w-0">
                                      <code className="block truncate font-semibold">{c.name}</code>
                                      {c.id_short && <code className="block text-[10px] text-muted-foreground truncate">ID: {c.id_short}</code>}
                                    </div>
                                    <code className="text-muted-foreground">{currentIp || "—"}</code>
                                    <Input
                                      className="h-7 text-xs"
                                      placeholder={currentIp || "172.28.0.x"}
                                      value={containerIpEdits[key] ?? ""}
                                      onChange={(e) => setContainerIpEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                                    />
                                    <Button
                                      size="sm" variant="outline" className="h-7 text-xs gap-1"
                                      disabled={busy || !(containerIpEdits[key] || "").trim()}
                                      onClick={() => handleApplyLiveContainerIp(d.name, c.id || c.name, c.name)}
                                    >
                                      <CheckCircle2 className="h-3 w-3" />Appliquer
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {Array.isArray(networkInfo.tests) && networkInfo.tests.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Connectivité interne</h4>
                    {networkInfo.tests.map((t: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-muted/40 rounded px-2 py-1.5">
                        {t.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                        <span><code>{t.from}</code> → <code>{t.to}</code></span>
                        {t.output && <span className="text-muted-foreground truncate ml-auto">{t.output}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {Array.isArray(networkInfo.port_mappings) && networkInfo.port_mappings.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Ports exposés</h4>
                    <div className="rounded-lg border divide-y text-xs">
                      {networkInfo.port_mappings.map((p: any) => (
                        <div key={p.container} className="flex items-center justify-between px-2 py-1.5">
                          <code>{p.container}</code>
                          <code className="text-muted-foreground text-right">{p.ports || "—"}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(networkInfo.interfaces) && networkInfo.interfaces.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">Interfaces hôte</h4>
                    <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto">{networkInfo.interfaces.join("\n")}</pre>
                  </div>
                )}
              </div>
            </>
          )}

          {logs.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5" />Logs
                </h4>
                <pre className="text-xs bg-muted/40 rounded p-2 max-h-60 overflow-auto">{logs.join("\n")}</pre>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
