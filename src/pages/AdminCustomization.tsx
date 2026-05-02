import { useState, useEffect, useRef } from "react";
import { useAppSettings } from "@/hooks/useAppSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Palette, Type, Image, Globe, Save, RotateCcw, Upload, Bot, Eye, EyeOff, BarChart3, Zap, CheckCircle, XCircle, Loader2, Monitor, Clock, Sun, Moon, Sparkles } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AIStats {
  today: number;
  this_month: number;
  total: number;
  provider: string;
}

interface DailyData {
  date: string;
  count: number;
}

type AIProviderType = "auto" | "openai" | "gemini" | "lovable";

const providerLabels: Record<AIProviderType, string> = {
  auto: "Automatique (utilise la première clé configurée)",
  openai: "OpenAI (ChatGPT)",
  gemini: "Google Gemini",
  lovable: "Service par défaut",
};

const providerDisplayNames: Record<string, string> = {
  openai: "OpenAI (ChatGPT)",
  gemini: "Google Gemini",
  lovable: "Service par défaut",
};

export default function AdminCustomization() {
  const { theme, setTheme } = useTheme();
  const { settings, updateSetting } = useAppSettings();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // AI config state
  const [selectedProvider, setSelectedProvider] = useState<AIProviderType>("auto");
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [aiStats, setAiStats] = useState<AIStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showSignatureOnPlayer, setShowSignatureOnPlayer] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings" as any)
      .select("key, value")
      .eq("key", "show_signature_on_player")
      .single()
      .then(({ data }: any) => {
        if (data?.value === "true") setShowSignatureOnPlayer(true);
      });
  }, []);

  useEffect(() => { setForm(settings); }, [settings]);

  // Load AI keys
  useEffect(() => {
    supabase
      .from("app_settings" as any)
      .select("key, value")
      .in("key", ["openai_api_key", "gemini_api_key", "ai_provider"] as any)
      .then(({ data }: any) => {
        (data || []).forEach((r: any) => {
          if (r.key === "openai_api_key" && r.value) setOpenaiKey(r.value);
          if (r.key === "gemini_api_key" && r.value) setGeminiKey(r.value);
          if (r.key === "ai_provider" && r.value) setSelectedProvider(r.value as AIProviderType);
        });
      });
  }, []);

  useEffect(() => { loadAIStats(); loadDailyStats(); }, []);

  const loadAIStats = async () => {
    setLoadingStats(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", { body: { action: "stats" } });
      if (!error && data && !data.error) setAiStats(data);
    } catch {} finally { setLoadingStats(false); }
  };

  const loadDailyStats = async () => {
    setLoadingDaily(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", { body: { action: "daily_stats" } });
      if (!error && data?.daily) setDailyData(data.daily);
    } catch {} finally { setLoadingDaily(false); }
  };

  const handleTestAPI = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", { body: { action: "test" } });
      if (error || data?.error) {
        setTestResult({ success: false, message: data?.error || "Erreur de connexion" });
        toast.error("Test échoué : " + (data?.error || "Erreur"));
      } else {
        setTestResult({
          success: true,
          message: `✓ Provider: ${providerDisplayNames[data.provider] || data.provider} | Modèle: ${data.model || "?"} | Réponse: "${data.response}"`,
        });
        toast.success("API IA fonctionnelle !");
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "Erreur réseau" });
      toast.error("Test échoué");
    } finally { setTesting(false); }
  };

  const upsertSetting = async (key: string, value: string) => {
    const { data: existing } = await supabase
      .from("app_settings" as any).select("id").eq("key", key).single();
    if (existing) {
      await supabase.from("app_settings" as any)
        .update({ value, updated_at: new Date().toISOString() } as any)
        .eq("key", key as any);
    } else {
      await supabase.from("app_settings" as any)
        .insert({ key, value } as any);
    }
  };

  const handleSaveAIConfig = async () => {
    setSavingAI(true);
    try {
      await Promise.all([
        upsertSetting("ai_provider", selectedProvider),
        upsertSetting("openai_api_key", openaiKey),
        upsertSetting("gemini_api_key", geminiKey),
      ]);
      toast.success("Configuration IA sauvegardée");
      loadAIStats();
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    } finally { setSavingAI(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const keys = Object.keys(form) as (keyof typeof form)[];
      for (const key of keys) {
        if (form[key] !== settings[key]) {
          await upsertSetting(key, form[key]);
        }
      }
      toast.success("Personnalisation sauvegardée");
    } catch { toast.error("Erreur lors de la sauvegarde"); } finally { setSaving(false); }
  };

  const handleReset = () => setForm(settings);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Veuillez sélectionner une image"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `branding/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(fileName, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("media").getPublicUrl(fileName);
      setForm({ ...form, logo_url: data.publicUrl });
      toast.success("Logo uploadé avec succès");
    } catch { toast.error("Erreur lors de l'upload du logo"); } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const chartConfig = {
    count: { label: "Requêtes", color: "hsl(var(--primary))" },
  };

  const formattedDaily = dailyData.map(d => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
  }));

  return (
    <div className="space-y-6 animate-cyber-in">
      <div>
        <h1 className="text-2xl font-bold tracking-widest neon-glow-cyan text-primary">Personnalisation</h1>
        <p className="text-muted-foreground text-sm mt-1 normal-case tracking-normal">
          Configurez l'apparence et les services de votre application
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Type className="h-4 w-4 text-primary icon-neon" />
              Identité
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Nom de la solution</Label>
              <Input value={form.app_name} onChange={(e) => setForm({ ...form, app_name: e.target.value })} placeholder="SignageOS" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Sous-titre</Label>
              <Input value={form.app_tagline} onChange={(e) => setForm({ ...form, app_tagline: e.target.value })} placeholder="Digital Signage CMS" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Titre de la page (onglet navigateur)</Label>
              <Input value={form.page_title} onChange={(e) => setForm({ ...form, page_title: e.target.value })} placeholder="SignageOS — Digital Signage CMS" />
            </div>
          </CardContent>
        </Card>

        {/* Theme selector */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary icon-neon" />
              Thème de l'interface
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  id: "light" as const,
                  label: "Clair",
                  desc: "Lumineux et minimaliste",
                  icon: Sun,
                  preview: "linear-gradient(135deg, hsl(220 20% 97%), hsl(0 0% 100%))",
                  dot: "hsl(210 85% 50%)",
                  text: "hsl(220 30% 12%)",
                },
                {
                  id: "dark" as const,
                  label: "Sombre",
                  desc: "Élégant et reposant",
                  icon: Moon,
                  preview: "linear-gradient(135deg, hsl(225 30% 8%), hsl(228 32% 6%))",
                  dot: "hsl(210 85% 62%)",
                  text: "hsl(220 15% 92%)",
                },
                {
                  id: "neon" as const,
                  label: "Néon",
                  desc: "Noir profond, vert néon",
                  icon: Zap,
                  preview: "radial-gradient(circle at 30% 20%, hsl(142 100% 50% / 0.25), transparent 60%), linear-gradient(160deg, hsl(150 15% 4%), hsl(150 20% 3%))",
                  dot: "hsl(142 100% 50%)",
                  text: "hsl(140 60% 92%)",
                  glow: true,
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => { setTheme(opt.id); toast.success(`Thème "${opt.label}" activé`); }}
                    className={`group relative rounded-xl border-2 p-4 text-left transition-all overflow-hidden ${
                      active ? "border-primary shadow-lg" : "border-border hover:border-primary/50"
                    }`}
                    style={{ background: opt.preview }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className="h-9 w-9 rounded-lg flex items-center justify-center"
                        style={{
                          background: opt.dot,
                          boxShadow: opt.glow ? `0 0 16px ${opt.dot}` : "none",
                        }}
                      >
                        <Icon className="h-4 w-4" style={{ color: opt.id === "light" ? "white" : opt.id === "neon" ? "#000" : "white" }} />
                      </div>
                      {active && (
                        <CheckCircle className="h-5 w-5" style={{ color: opt.dot, filter: opt.glow ? `drop-shadow(0 0 6px ${opt.dot})` : "none" }} />
                      )}
                    </div>
                    <div className="font-semibold text-sm" style={{ color: opt.text, textShadow: opt.glow ? `0 0 8px ${opt.dot}` : "none" }}>
                      {opt.label}
                    </div>
                    <div className="text-xs mt-1 opacity-75" style={{ color: opt.text }}>
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground normal-case mt-3">
              Le thème est appliqué immédiatement et mémorisé sur cet appareil. Vous pouvez aussi basculer rapidement via l'icône en haut à droite.
            </p>
          </CardContent>
        </Card>

        {/* Visual */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Image className="h-4 w-4 text-accent icon-neon" />
              Visuels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Logo</Label>
              <div className="flex gap-2">
                <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="URL du logo ou uploadez un fichier" className="flex-1" />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="shrink-0">
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              {uploading && <p className="text-xs text-primary animate-pulse normal-case">Upload en cours...</p>}
              {form.logo_url && (
                <div className="mt-2 p-4 rounded-lg bg-secondary/50 flex items-center justify-center">
                  <img src={form.logo_url} alt="Aperçu logo" className="max-h-20 object-contain" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Favicon</Label>
              <div className="flex gap-2">
                <Input value={form.favicon_url} onChange={(e) => setForm({ ...form, favicon_url: e.target.value })} placeholder="URL du favicon ou uploadez un fichier" className="flex-1" />
                <input ref={faviconInputRef} type="file" accept="image/*,.ico" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  try {
                    const ext = file.name.split(".").pop();
                    const fileName = `branding/favicon-${Date.now()}.${ext}`;
                    const { error } = await supabase.storage.from("media").upload(fileName, file, { upsert: true });
                    if (error) throw error;
                    const { data } = supabase.storage.from("media").getPublicUrl(fileName);
                    setForm({ ...form, favicon_url: data.publicUrl });
                    toast.success("Favicon uploadé avec succès");
                  } catch { toast.error("Erreur lors de l'upload du favicon"); } finally {
                    setUploading(false);
                    if (faviconInputRef.current) faviconInputRef.current.value = "";
                  }
                }} />
                <Button variant="outline" size="icon" onClick={() => faviconInputRef.current?.click()} disabled={uploading} className="shrink-0">
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              {form.favicon_url && (
                <div className="mt-2 p-3 rounded-lg bg-secondary/50 flex items-center gap-3">
                  <img src={form.favicon_url} alt="Aperçu favicon" className="h-8 w-8 object-contain" />
                  <span className="text-xs text-muted-foreground truncate">{form.favicon_url}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Média de la page de connexion</Label>
              <p className="text-[10px] text-muted-foreground normal-case">Uploadez une vidéo, image JPG ou GIF animé affiché à droite du formulaire de connexion. Laissez vide pour un login plein écran.</p>
              <div className="flex gap-2">
                <Input value={form.login_video_url || ""} onChange={(e) => setForm({ ...form, login_video_url: e.target.value })} placeholder="URL du média ou uploadez un fichier" className="flex-1" />
                <input ref={videoInputRef} type="file" accept="video/mp4,video/webm,image/jpeg,image/jpg,image/gif" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const isVideo = file.type.startsWith("video/");
                  const isImage = file.type === "image/jpeg" || file.type === "image/gif";
                  if (!isVideo && !isImage) { toast.error("Format accepté : MP4, WebM, JPG ou GIF"); return; }
                  setUploadingVideo(true);
                  try {
                    const ext = file.name.split(".").pop();
                    const fileName = `branding/login-media-${Date.now()}.${ext}`;
                    const { error } = await supabase.storage.from("media").upload(fileName, file, { upsert: true });
                    if (error) throw error;
                    const { data } = supabase.storage.from("media").getPublicUrl(fileName);
                    setForm({ ...form, login_video_url: data.publicUrl });
                    toast.success("Média uploadé avec succès");
                  } catch { toast.error("Erreur lors de l'upload"); } finally {
                    setUploadingVideo(false);
                    if (videoInputRef.current) videoInputRef.current.value = "";
                  }
                }} />
                <Button variant="outline" size="icon" onClick={() => videoInputRef.current?.click()} disabled={uploadingVideo} className="shrink-0">
                  <Upload className="h-4 w-4" />
                </Button>
                {form.login_video_url && (
                  <Button variant="outline" size="icon" onClick={() => setForm({ ...form, login_video_url: "" })} className="shrink-0 text-destructive hover:text-destructive">
                    <XCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {uploadingVideo && <p className="text-xs text-primary animate-pulse normal-case">Upload en cours...</p>}
              {form.login_video_url && (
                <div className="mt-2 rounded-lg overflow-hidden bg-secondary/50">
                  {/\.(jpe?g|gif)(\?.*)?$/i.test(form.login_video_url) ? (
                    <img src={form.login_video_url} alt="Aperçu média connexion" className="w-full max-h-40 object-cover" />
                  ) : (
                    <video src={form.login_video_url} className="w-full max-h-40 object-cover" muted autoPlay loop playsInline />
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Colors */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Palette className="h-4 w-4 text-neon-pink icon-neon" />
              Couleurs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Couleur principale (HSL)</Label>
              <div className="flex gap-2 items-center">
                <Input value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} placeholder="185 100% 55%" />
                <div className="h-10 w-10 rounded-md border border-border shrink-0" style={{ backgroundColor: `hsl(${form.primary_color})` }} />
              </div>
              <p className="text-[10px] text-muted-foreground normal-case">Format : H S% L% (ex: 185 100% 55% pour cyan)</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Couleur d'accent (HSL)</Label>
              <div className="flex gap-2 items-center">
                <Input value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} placeholder="270 80% 60%" />
                <div className="h-10 w-10 rounded-md border border-border shrink-0" style={{ backgroundColor: `hsl(${form.accent_color})` }} />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap mt-2">
              {[
                { label: "Cyan", value: "185 100% 55%" },
                { label: "Violet", value: "270 80% 60%" },
                { label: "Rose", value: "330 90% 60%" },
                { label: "Vert", value: "160 100% 45%" },
                { label: "Orange", value: "25 95% 55%" },
                { label: "Bleu", value: "220 90% 55%" },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setForm({ ...form, primary_color: preset.value })}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/50 hover:bg-secondary text-xs transition-colors normal-case"
                >
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: `hsl(${preset.value})` }} />
                  {preset.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Welcome */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe className="h-4 w-4 text-primary icon-neon" />
              Page de connexion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Message de bienvenue</Label>
              <Textarea value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} placeholder="Connectez-vous à votre tableau de bord" rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* Signature on Player */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Monitor className="h-4 w-4 text-primary icon-neon" />
              Signature sur les écrans
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Afficher "ScreenFlow by Dravox" sur le contenu</Label>
                <p className="text-[10px] text-muted-foreground normal-case">La signature sera affichée discrètement en bas de l'écran pendant la diffusion</p>
              </div>
              <Switch
                checked={showSignatureOnPlayer}
                onCheckedChange={async (checked) => {
                  setShowSignatureOnPlayer(checked);
                  await upsertSetting("show_signature_on_player", checked ? "true" : "false");
                  toast.success(checked ? "Signature activée sur les écrans" : "Signature désactivée sur les écrans");
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Timezone / Clock */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-primary icon-neon" />
              Fuseau horaire
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Décalage GMT par défaut</Label>
              <Select
                value={form.default_gmt_offset || "auto"}
                onValueChange={(v) => setForm({ ...form, default_gmt_offset: v === "auto" ? "" : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Automatique (heure locale)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatique (heure locale)</SelectItem>
                  {[
                    { value: "-12", label: "GMT-12" },
                    { value: "-11", label: "GMT-11" },
                    { value: "-10", label: "GMT-10 (Hawaii)" },
                    { value: "-9", label: "GMT-9 (Alaska)" },
                    { value: "-8", label: "GMT-8 (Los Angeles)" },
                    { value: "-7", label: "GMT-7 (Denver)" },
                    { value: "-6", label: "GMT-6 (Chicago)" },
                    { value: "-5", label: "GMT-5 (New York)" },
                    { value: "-4", label: "GMT-4 (Santiago)" },
                    { value: "-3", label: "GMT-3 (São Paulo)" },
                    { value: "-2", label: "GMT-2" },
                    { value: "-1", label: "GMT-1 (Açores)" },
                    { value: "0", label: "GMT+0 (Londres, Casablanca)" },
                    { value: "1", label: "GMT+1 (Paris, Alger)" },
                    { value: "2", label: "GMT+2 (Le Caire)" },
                    { value: "3", label: "GMT+3 (Riyad, Moscou)" },
                    { value: "3.5", label: "GMT+3:30 (Téhéran)" },
                    { value: "4", label: "GMT+4 (Dubaï)" },
                    { value: "5", label: "GMT+5 (Karachi)" },
                    { value: "5.5", label: "GMT+5:30 (Mumbai)" },
                    { value: "6", label: "GMT+6 (Dacca)" },
                    { value: "7", label: "GMT+7 (Bangkok)" },
                    { value: "8", label: "GMT+8 (Pékin, Singapour)" },
                    { value: "9", label: "GMT+9 (Tokyo)" },
                    { value: "10", label: "GMT+10 (Sydney)" },
                    { value: "11", label: "GMT+11" },
                    { value: "12", label: "GMT+12 (Auckland)" },
                  ].map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground normal-case">
                Ce fuseau horaire sera utilisé par défaut pour les widgets horloge sur tous les écrans (sauf si un widget a un réglage spécifique).
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Bot className="h-4 w-4 text-primary icon-neon" />
              Configuration IA
              {aiStats && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {providerDisplayNames[aiStats.provider] || aiStats.provider}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Provider selector */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-4 md:col-span-2">
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fournisseur IA</Label>
                  <Select value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as AIProviderType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                          OpenAI (ChatGPT)
                        </div>
                      </SelectItem>
                      <SelectItem value="gemini">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-blue-500" />
                          Google Gemini
                        </div>
                      </SelectItem>
                      <SelectItem value="lovable">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                          Service par défaut (gratuit)
                        </div>
                      </SelectItem>
                      <SelectItem value="auto">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-yellow-500" />
                          Automatique
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground normal-case">
                    {selectedProvider === "auto"
                      ? "Utilise la première clé API configurée (OpenAI → Gemini → Service par défaut)"
                      : selectedProvider === "lovable"
                      ? "Utilise le service IA intégré, aucune clé requise"
                      : `Utilise votre clé ${selectedProvider === "openai" ? "OpenAI" : "Google Gemini"}`}
                  </p>
                </div>

                {/* OpenAI Key */}
                <div className={`space-y-2 transition-opacity ${selectedProvider === "lovable" ? "opacity-50" : ""}`}>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Clé API OpenAI</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showOpenaiKey ? "text" : "password"}
                        value={openaiKey}
                        onChange={(e) => setOpenaiKey(e.target.value)}
                        placeholder="sk-..."
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showOpenaiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground normal-case">
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" className="text-primary hover:underline">platform.openai.com/api-keys</a>
                  </p>
                </div>

                {/* Gemini Key */}
                <div className={`space-y-2 transition-opacity ${selectedProvider === "lovable" ? "opacity-50" : ""}`}>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Clé API Google Gemini</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showGeminiKey ? "text" : "password"}
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                        placeholder="AIza..."
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showGeminiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground normal-case">
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-primary hover:underline">aistudio.google.com/apikey</a>
                  </p>
                </div>

                {/* Save + Test */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={handleSaveAIConfig} disabled={savingAI} size="sm" className="gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {savingAI ? "..." : "Sauvegarder la config IA"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleTestAPI} disabled={testing} className="gap-2">
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                    {testing ? "Test en cours..." : "Tester la connexion"}
                  </Button>
                </div>

                {testResult && (
                  <div className={`flex items-start gap-2 text-xs p-3 rounded-lg ${testResult.success ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
                    {testResult.success ? <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                    <span className="normal-case">{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Requêtes IA</Label>
                  <Button variant="ghost" size="sm" onClick={() => { loadAIStats(); loadDailyStats(); }} disabled={loadingStats} className="ml-auto text-xs h-7">
                    {loadingStats ? "..." : "↻"}
                  </Button>
                </div>
                {aiStats ? (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="rounded-lg bg-secondary/50 p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{aiStats.today}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Aujourd'hui</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{aiStats.this_month}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ce mois</p>
                    </div>
                    <div className="rounded-lg bg-secondary/50 p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{aiStats.total}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {loadingStats ? "Chargement..." : "—"}
                  </p>
                )}
              </div>
            </div>

            {/* Daily Chart */}
            {formattedDaily.length > 0 && (
              <div className="pt-6 border-t border-border">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-4 block">
                  Évolution des requêtes IA (30 derniers jours)
                </Label>
                <ChartContainer config={chartConfig} className="h-[200px] w-full">
                  <BarChart data={formattedDaily}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10 }}
                      interval={Math.floor(formattedDaily.length / 8)}
                      className="fill-muted-foreground"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10 }}
                      className="fill-muted-foreground"
                      width={30}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </div>
            )}
            {loadingDaily && !formattedDaily.length && (
              <div className="pt-6 border-t border-border text-center">
                <p className="text-sm text-muted-foreground">Chargement du graphique...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </Button>
        <Button variant="outline" onClick={handleReset} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Réinitialiser
        </Button>
      </div>
    </div>
  );
}
