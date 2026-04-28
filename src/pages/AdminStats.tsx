import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Tv, Key, Users, MonitorPlay, ShieldCheck, ShieldOff, Activity } from "lucide-react";
import { isScreenReallyOnline } from "@/lib/screen-utils";

export default function AdminStats() {
  const { data: screens = [] } = useQuery({
    queryKey: ["admin-stats-screens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("screens")
        .select("id, name, status, player_heartbeat_at, establishment_id");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: licenses = [] } = useQuery({
    queryKey: ["admin-stats-licenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("licenses")
        .select("id, is_active, valid_until, screen_id, establishment_id");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: establishments = [] } = useQuery({
    queryKey: ["admin-stats-establishments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("establishments")
        .select("id, name, max_screens");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["admin-stats-users"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: media = [] } = useQuery({
    queryKey: ["admin-stats-media"],
    queryFn: async () => {
      const { data, error } = await supabase.from("media").select("id");
      if (error) throw error;
      return data || [];
    },
  });

  const onlineScreens = screens.filter((s) => isScreenReallyOnline(s));
  const offlineScreens = screens.filter((s) => !isScreenReallyOnline(s));

  const now = new Date();
  const activeLicenses = licenses.filter(
    (l) => l.is_active && new Date(l.valid_until) >= now
  );
  const expiredLicenses = licenses.filter(
    (l) => !l.is_active || new Date(l.valid_until) < now
  );
  const assignedLicenses = licenses.filter((l) => l.screen_id);
  const unassignedLicenses = licenses.filter((l) => !l.screen_id);

  const totalMaxScreens = establishments.reduce(
    (sum, e) => sum + (e.max_screens || 0),
    0
  );

  const stats = [
    {
      label: "Établissements",
      value: establishments.length,
      icon: Building2,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Écrans totaux",
      value: screens.length,
      icon: Tv,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Écrans en ligne",
      value: onlineScreens.length,
      icon: MonitorPlay,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      label: "Écrans hors ligne",
      value: offlineScreens.length,
      icon: Activity,
      color: "text-red-500",
      bg: "bg-red-500/10",
    },
    {
      label: "Licences actives",
      value: activeLicenses.length,
      icon: ShieldCheck,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Licences expirées",
      value: expiredLicenses.length,
      icon: ShieldOff,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      label: "Utilisateurs",
      value: users.length,
      icon: Users,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      label: "Médias",
      value: media.length,
      icon: Tv,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Statistiques Globales</h1>
        <p className="text-muted-foreground text-sm">
          Vue d'ensemble de toute la plateforme
        </p>
      </div>

      {/* Main stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Licenses breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5" /> Répartition des licences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{licenses.length}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold text-green-500">
                {activeLicenses.length}
              </p>
              <p className="text-xs text-muted-foreground">Actives</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold text-blue-500">
                {assignedLicenses.length}
              </p>
              <p className="text-xs text-muted-foreground">Assignées</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold text-amber-500">
                {unassignedLicenses.length}
              </p>
              <p className="text-xs text-muted-foreground">Non assignées</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Establishments breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Détails par établissement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {establishments.map((est) => {
              const estScreens = screens.filter(
                (s) => s.establishment_id === est.id
              );
              const estOnline = estScreens.filter((s) => isScreenReallyOnline(s));
              const estLicenses = activeLicenses.filter(
                (l) => l.establishment_id === est.id
              );
              return (
                <div
                  key={est.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border bg-card"
                >
                  <div className="font-medium">{est.name}</div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">
                      {estScreens.length}/{est.max_screens || "∞"} écrans
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-green-600 border-green-600/30"
                    >
                      {estOnline.length} en ligne
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-blue-600 border-blue-600/30"
                    >
                      {estLicenses.length} licences
                    </Badge>
                  </div>
                </div>
              );
            })}
            {establishments.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucun établissement.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Capacity summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Capacité totale</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {screens.length}
            </span>{" "}
            écrans utilisés sur{" "}
            <span className="font-semibold text-foreground">
              {totalMaxScreens || "∞"}
            </span>{" "}
            slots disponibles ({establishments.length} établissements)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
