import { useState } from "react";
import { Sparkles, ImagePlus, Wand2, Lightbulb, Loader2, Download, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SuggestTab from "@/components/ai/SuggestTab";
import { useEstablishmentContext } from "@/contexts/EstablishmentContext";

function GenerateTab() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ image?: string; text?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { currentEstablishmentId } = useEstablishmentContext();

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { action: "generate_image", prompt },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setResult(data);
      toast.success("Image générée !");
    } catch (e: any) {
      toast.error(e.message || "Erreur de génération");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!result?.image) return;
    setSaving(true);
    try {
      const res = await fetch(result.image);
      const blob = await res.blob();
      const fileName = `ai-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from("media").upload(fileName, blob, { contentType: "image/png" });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);
      const insertData: any = {
        name: prompt.slice(0, 50) || "Image IA",
        type: "image",
        url: urlData.publicUrl,
        duration: 10,
        user_id: null,
      };
      if (currentEstablishmentId) {
        insertData.establishment_id = currentEstablishmentId;
      }
      const { error: dbError } = await supabase.from("media").insert(insertData);
      if (dbError) throw dbError;
      toast.success("Image sauvegardée dans la bibliothèque !");
    } catch (e: any) {
      toast.error(e.message || "Erreur de sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Décrivez l'image souhaitée</label>
        <Textarea
          placeholder="Ex: Une bannière promotionnelle pour un restaurant italien avec des pâtes et une ambiance chaleureuse..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
      </div>
      <Button onClick={handleGenerate} disabled={loading || !prompt.trim()} className="gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        {loading ? "Génération en cours..." : "Générer l'image"}
      </Button>
      {result?.image && (
        <Card className="p-4 space-y-3">
          <img src={result.image} alt="Generated" className="w-full max-w-lg rounded-lg border border-border" />
          {result.text && <p className="text-sm text-muted-foreground">{result.text}</p>}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleSaveToLibrary} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Sauvegarder dans la bibliothèque
            </Button>
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={result.image} download="ai-image.png"><Download className="h-3.5 w-3.5" /> Télécharger</a>
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function EnhanceTab() {
  const [imageUrl, setImageUrl] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ image?: string; text?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const { currentEstablishmentId } = useEstablishmentContext();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleEnhance = async () => {
    if (!imageUrl) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { action: "enhance_image", imageUrl, prompt: instructions || undefined },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setResult(data);
      toast.success("Image améliorée !");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!result?.image) return;
    setSaving(true);
    try {
      const res = await fetch(result.image);
      const blob = await res.blob();
      const fileName = `ai-enhanced-${Date.now()}.png`;
      const { error: uploadError } = await supabase.storage.from("media").upload(fileName, blob, { contentType: "image/png" });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(fileName);
      const insertData: any = {
        name: `Image améliorée ${new Date().toLocaleDateString("fr")}`,
        type: "image",
        url: urlData.publicUrl,
        duration: 10,
        user_id: null,
      };
      if (currentEstablishmentId) {
        insertData.establishment_id = currentEstablishmentId;
      }
      const { error: dbError } = await supabase.from("media").insert(insertData);
      if (dbError) throw dbError;
      toast.success("Image sauvegardée !");
    } catch (e: any) {
      toast.error(e.message || "Erreur");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Image à améliorer</label>
        <div className="flex gap-3 items-end">
          <Input type="file" accept="image/*" onChange={handleFileUpload} className="max-w-xs" />
          <span className="text-sm text-muted-foreground">ou</span>
          <Input placeholder="URL de l'image" value={imageUrl.startsWith("data:") ? "" : imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="max-w-sm" />
        </div>
        {imageUrl && (
          <img src={imageUrl} alt="Preview" className="w-32 h-32 object-cover rounded-lg border border-border mt-2" />
        )}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Instructions (optionnel)</label>
        <Input placeholder="Ex: Rendre plus lumineux, ajouter du contraste..." value={instructions} onChange={(e) => setInstructions(e.target.value)} />
      </div>
      <Button onClick={handleEnhance} disabled={loading || !imageUrl} className="gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {loading ? "Amélioration en cours..." : "Améliorer l'image"}
      </Button>
      {result?.image && (
        <Card className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Original</p>
              <img src={imageUrl} alt="Original" className="w-full rounded-lg border border-border" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Amélioré</p>
              <img src={result.image} alt="Enhanced" className="w-full rounded-lg border border-border" />
            </div>
          </div>
          {result.text && <p className="text-sm text-muted-foreground">{result.text}</p>}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleSaveToLibrary} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Sauvegarder
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

export default function AIAssistant() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Assistant IA</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-6">
        Générez des images, améliorez leur qualité et obtenez des suggestions de playlists et layouts prêts à l'emploi
      </p>
      <Tabs defaultValue="generate">
        <TabsList>
          <TabsTrigger value="generate" className="gap-2"><ImagePlus className="h-4 w-4" /> Générer</TabsTrigger>
          <TabsTrigger value="enhance" className="gap-2"><Wand2 className="h-4 w-4" /> Améliorer</TabsTrigger>
          <TabsTrigger value="suggest" className="gap-2"><Lightbulb className="h-4 w-4" /> Suggestions</TabsTrigger>
        </TabsList>
        <TabsContent value="generate"><GenerateTab /></TabsContent>
        <TabsContent value="enhance"><EnhanceTab /></TabsContent>
        <TabsContent value="suggest"><SuggestTab /></TabsContent>
      </Tabs>
    </div>
  );
}
