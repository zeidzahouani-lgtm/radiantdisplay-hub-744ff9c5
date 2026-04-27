import { useMemo } from "react";
import {
  Tv, Image, ListMusic, Clock, Wifi, WifiOff, ShieldAlert, ShieldOff,
  LayoutGrid, Key, Bell, Activity, TrendingUp, AlertTriangle, FileText,
  Monitor, BarChart3, PieChart as PieChartIcon, Zap, CheckCircle2, XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link, Navigate } from "react-router-dom";
import { useEstablishmentContext } from "@/contexts/EstablishmentContext";
import { EstablishmentDashboard } from "@/components/establishments/EstablishmentDashboard";
import { FirstLaunchSetup } from "@/components/FirstLaunchSetup";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

const MEDIA_TYPE_LABELS: Record<string, string> = {
  image: "Images", video: "Vidéos", iframe: "iFrames", other: "Autres",
};
const MEDIA_TYPE_COLORS: Record<string, string> = {
  image: "hsl(var(--primary))", video: "hsl(var(--accent))", iframe: "#8b5cf6", other: "#6b7280",
};

export default function DashboardHome() {
  const { isGlobalAdmin, currentEstablishmentId, memberships, isLoading: ctxLoading } = useEstablishmentContext();

  // Non-global-admin with an establishment: show establishment dashboard
  if (!ctxLoading && !isGlobalAdmin && currentEstablishmentId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-widest neon-glow-cyan text-primary">Tableau de bord</h1>
          <p className="text-muted-foreground text-sm mt-1 normal-case tracking-normal">
            {memberships.find(m => m.establishment_id === currentEstablishmentId)?.establishment?.name || "Mon établissement"}
          </p>
        </div>
        <EstablishmentDashboard establishmentId={currentEstablishmentId} />
      </div>
    );
  }

  return <AdminDashboardContent />;
}

function AdminDashboardContent() {
  const { data: stats, isLoading } = useDashboardStats();
  const { isGlobalAdmin, currentEstablishmentId } = useEstablishmentContext();

  if (isLoading || !stats) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-muted rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (isGlobalAdmin && !currentEstablishmentId && stats.totalScreens === 0) {
    return <FirstLaunchSetup />;
  }

  const healthScore = stats.totalScreens > 0
    ? Math.round((stats.onlineScreens / stats.totalScreens) * 100)
    : 0;

  const pieData = Object.entries(stats.mediaByType).map(([type, count]) => ({
    name: MEDIA_TYPE_LABELS[type] || type,
    value: count,
    color: MEDIA_TYPE_COLORS[type] || "#6b7280",
  }));

  const screenBarData = stats.screenUptimeRanking.slice(0, 8).map(s => ({
    name: s.name.length > 12 ? s.name.slice(0, 12) + "…" : s.name,
    status: s.isOnline ? 1 : 0,
    hasContent: s.hasContent ? 1 : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-widest neon-glow-cyan text-primary">Tableau de bord</h1>
          <p className="text-muted-foreground text-sm mt-1 normal-case tracking-normal">
            Vue d'ensemble de votre affichage dynamique
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-xs">
            <Activity className="h-3 w-3 text-primary animate-pulse" />
            Temps réel
          </Badge>
        </div>
      </div>

      {/* KPI Cards - Row 1 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 stagger-children">
        <KpiCard icon={Tv} label="Écrans" value={stats.totalScreens} link="/displays" color="text-primary" />
        <KpiCard icon={Wifi} label="En ligne" value={stats.onlineScreens} link="/displays" color="text-status-online" />
        <KpiCard icon={WifiOff} label="Hors ligne" value={stats.offlineScreens} link="/displays" color="text-status-offline" />
        <KpiCard icon={Image} label="Médias" value={stats.totalMedia} link="/library" color="text-accent" />
        <KpiCard icon={ListMusic} label="Playlists" value={stats.totalPlaylists} link="/playlists" color="text-purple-400" />
        <KpiCard icon={LayoutGrid} label="Layouts" value={stats.totalLayouts} link="/layouts" color="text-blue-400" />
      </div>

      {/* Row 2: Health + Licenses + Contents */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Health Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Santé du parc
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <span className={`text-4xl font-bold font-mono ${healthScore >= 80 ? "text-status-online" : healthScore >= 50 ? "text-yellow-500" : "text-destructive"}`}>
                {healthScore}%
              </span>
              <span className="text-xs text-muted-foreground mb-1">d'écrans en ligne</span>
            </div>
            <Progress value={healthScore} className="h-2" />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-status-online" /> {stats.onlineScreens} actifs
              </span>
              {stats.inFallback > 0 && (
                <span className="flex items-center gap-1 text-yellow-500">
                  <AlertTriangle className="h-3 w-3" /> {stats.inFallback} en fallback
                </span>
              )}
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-status-offline" /> {stats.offlineScreens} hors ligne
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              <span className="font-medium">{stats.avgMediaPerScreen}%</span> des écrans ont du contenu assigné
            </div>
          </CardContent>
        </Card>

        {/* Licenses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5" /> Licences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-status-online">{stats.activeLicenses}</p>
                <p className="text-[10px] text-muted-foreground">Actives</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-destructive">{stats.expiredLicenses}</p>
                <p className="text-[10px] text-muted-foreground">Expirées</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-yellow-500">{stats.unassignedLicenses}</p>
                <p className="text-[10px] text-muted-foreground">Non assignées</p>
              </div>
            </div>
            {stats.expiredLicenses > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 rounded-lg p-2">
                <ShieldOff className="h-3.5 w-3.5 shrink-0" />
                {stats.expiredLicenses} licence(s) expirée(s) nécessitent un renouvellement
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contents */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Contenus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono">{stats.totalContents}</p>
                <p className="text-[10px] text-muted-foreground">Total</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-status-online">{stats.activeContents}</p>
                <p className="text-[10px] text-muted-foreground">Actifs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-yellow-500">{stats.pendingContents}</p>
                <p className="text-[10px] text-muted-foreground">En attente</p>
              </div>
            </div>
            {stats.pendingContents > 0 && (
              <Link to="/autoflow" className="flex items-center gap-1.5 text-[11px] text-yellow-500 bg-yellow-500/10 rounded-lg p-2 hover:bg-yellow-500/20 transition-colors">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                {stats.pendingContents} contenu(s) en attente de validation
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Media type distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <PieChartIcon className="h-3.5 w-3.5" /> Répartition des médias
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <div className="flex items-center gap-4">
                <div className="w-32 h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={30} strokeWidth={0}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <ReTooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 flex-1">
                  {pieData.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.color }} />
                        <span className="text-xs">{entry.name}</span>
                      </div>
                      <span className="font-mono text-xs font-medium">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">Aucun média</p>
            )}
          </CardContent>
        </Card>

        {/* Screen activity chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Activité des écrans
            </CardTitle>
          </CardHeader>
          <CardContent>
            {screenBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={screenBarData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, 1]} />
                  <ReTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => [value ? "Oui" : "Non", name === "status" ? "En ligne" : "Contenu"]}
                  />
                  <Bar dataKey="status" name="En ligne" fill="hsl(var(--status-online))" radius={[4,4,0,0]} barSize={16} />
                  <Bar dataKey="hasContent" name="Contenu" fill="hsl(var(--accent))" radius={[4,4,0,0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">Aucun écran</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Screen ranking + Recent notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Screen ranking */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5" /> Classement des écrans
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.screenUptimeRanking.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Aucun écran</p>
            ) : (
              <div className="space-y-1">
                {stats.screenUptimeRanking.slice(0, 6).map((screen, i) => {
                  // Uptime: time since last seen (proxy for availability)
                  const uptimeLabel = screen.lastSeen
                    ? (() => {
                        const diffMs = Date.now() - new Date(screen.lastSeen).getTime();
                        if (diffMs < 120_000) return "Actif maintenant";
                        const mins = Math.floor(diffMs / 60_000);
                        if (mins < 60) return `Vu il y a ${mins}min`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `Vu il y a ${hrs}h`;
                        const days = Math.floor(hrs / 24);
                        return `Vu il y a ${days}j`;
                      })()
                    : "Jamais connecté";

                  return (
                  <div key={screen.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors">
                    <span className={`text-xs font-bold font-mono w-5 text-center ${i === 0 ? "text-yellow-500" : i === 1 ? "text-muted-foreground" : i === 2 ? "text-amber-700" : "text-muted-foreground/50"}`}>
                      #{i + 1}
                    </span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Tv className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm truncate block">{screen.name}</span>
                        <span className="text-[9px] text-muted-foreground">{uptimeLabel}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {screen.fallbackSince ? (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-yellow-500 border-yellow-500/30 gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" /> Fallback
                        </Badge>
                      ) : screen.hasContent ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-status-online" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />
                      )}
                      {screen.isOnline ? (
                        <span className="h-2 w-2 rounded-full bg-status-online neon-pulse-online" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-status-offline" />
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent notifications */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" /> Notifications récentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentNotifications.length === 0 ? (
              <div className="text-center py-6">
                <Zap className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Aucune notification</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {stats.recentNotifications.map((n: any) => (
                  <div key={n.id} className={`flex items-start gap-2 py-1.5 px-2 rounded-lg text-sm ${n.is_read ? "bg-secondary/10" : "bg-primary/5 border border-primary/10"}`}>
                    <div className={`mt-0.5 shrink-0 ${notifIconColor(n.type)}`}>
                      {notifIcon(n.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{n.title}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{n.message}</p>
                      <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                        {new Date(n.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, link, color }: { icon: any; label: string; value: number; link: string; color: string }) {
  return (
    <Link to={link}>
      <Card className="p-4 cursor-pointer group hover:scale-[1.02] transition-transform duration-200">
        <div className="flex items-center gap-2.5">
          <div className={`h-9 w-9 rounded-lg bg-secondary flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
          </div>
          <div>
            <p className="text-xl font-bold font-mono">{value}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}

function notifIcon(type: string) {
  switch (type) {
    case "screen_offline": return <WifiOff className="h-3.5 w-3.5" />;
    case "screen_fallback": return <AlertTriangle className="h-3.5 w-3.5" />;
    default: return <Bell className="h-3.5 w-3.5" />;
  }
}

function notifIconColor(type: string) {
  switch (type) {
    case "screen_offline": return "text-destructive";
    case "screen_fallback": return "text-yellow-500";
    default: return "text-primary";
  }
}
