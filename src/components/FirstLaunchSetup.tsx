import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, Copy, ExternalLink, Loader2, Monitor, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishmentContext } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return slug || `ecran-${Date.now()}`;
}

function buildPlayerUrl(slugOrId: string) {
  return `${window.location.origin}/player/${slugOrId}`;
}

export function FirstLaunchSetup() {
  const queryClient = useQueryClient();
  const { setCurrentEstablishmentId } = useEstablishmentContext();
  const [organizationName, setOrganizationName] = useState("Mon organisation");
  const [screenName, setScreenName] = useState("Écran principal");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ establishmentName: string; screenName: string; playerUrl: string } | null>(null);

  const canSubmit = useMemo(() => organizationName.trim().length > 1 && screenName.trim().length > 1 && !submitting, [organizationName, screenName, submitting]);

  const copyPlayerUrl = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.playerUrl);
    toast.success("Lien player copié");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const organization = organizationName.trim();
      const display = screenName.trim();
      const slug = slugify(display);

      const { data: establishment, error: establishmentError } = await supabase
        .from("establishments")
        .insert({ name: organization, created_by: null, max_screens: 0 } as any)
        .select("id, name")
        .single();
      if (establishmentError) throw establishmentError;

      const { data: screen, error: screenError } = await supabase
        .from("screens")
        .insert({ name: display, slug, user_id: null, establishment_id: establishment.id } as any)
        .select("id, name, slug")
        .single();
      if (screenError) throw screenError;

      setCurrentEstablishmentId(establishment.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["establishments"] }),
        queryClient.invalidateQueries({ queryKey: ["user_memberships"] }),
        queryClient.invalidateQueries({ queryKey: ["screens"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard_stats"] }),
      ]);

      setResult({ establishmentName: establishment.name, screenName: screen.name, playerUrl: buildPlayerUrl(screen.slug || screen.id) });
      toast.success("Premier lancement configuré");
    } catch (error: any) {
      toast.error(error?.message || "Impossible de terminer la configuration initiale.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-[calc(100vh-9rem)] grid content-center gap-6 py-6">
      <div className="max-w-4xl">
        <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1.5">
          <PlugZap className="h-3.5 w-3.5 text-primary" /> Premier lancement
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-normal text-foreground">
          Configurez votre premier point de diffusion
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Créez l'organisation, ajoutez le premier écran, puis ouvrez le lien player sur l'appareil à connecter.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="glass-panel border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Building2 className="h-5 w-5 text-primary" /> Organisation et écran
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first-organization">Nom de l'organisation</Label>
                  <Input id="first-organization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} disabled={submitting || !!result} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="first-screen">Nom du premier écran</Label>
                  <Input id="first-screen" value={screenName} onChange={(event) => setScreenName(event.target.value)} disabled={submitting || !!result} />
                </div>
              </div>

              {!result ? (
                <Button type="submit" disabled={!canSubmit} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
                  Créer et préparer le player
                </Button>
              ) : (
                <div className="rounded-lg border border-border bg-secondary/40 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-status-online" />
                    <div className="min-w-0 flex-1 space-y-3">
                      <div>
                        <p className="font-medium">{result.establishmentName} est prêt</p>
                        <p className="text-sm text-muted-foreground">{result.screenName} attend la connexion du player.</p>
                      </div>
                      <div className="rounded-md bg-background/70 px-3 py-2 font-mono text-xs text-muted-foreground break-all">
                        {result.playerUrl}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={copyPlayerUrl} className="gap-1.5">
                          <Copy className="h-3.5 w-3.5" /> Copier
                        </Button>
                        <Button type="button" size="sm" asChild className="gap-1.5">
                          <a href={result.playerUrl} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" /> Ouvrir le player
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {[
            ["1", "Créer l'organisation", organizationName || "Mon organisation"],
            ["2", "Créer le premier écran", screenName || "Écran principal"],
            ["3", "Connecter le player", result ? "Lien prêt à ouvrir" : "Lien généré après création"],
          ].map(([step, title, text]) => (
            <Card key={step} className="border-border/70 bg-card/80">
              <CardContent className="flex gap-3 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{step}</span>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}