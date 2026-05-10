import { useState, useRef } from "react";
import { Upload, Link, Trash2, Image, Video, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useMedia } from "@/hooks/useMedia";
import { explainSupabaseError } from "@/lib/env";
import { normalizeEmbedUrl } from "@/lib/iframe-url";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface UploadProgress {
  name: string;
  percent: number;
}

export function MediaUploader() {
  const { media, isLoading, uploadMutation, addIframeMutation, deleteMutation } = useMedia();
  const [iframeName, setIframeName] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [showIframe, setShowIframe] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const fileList = Array.from(files);

    // Init progress entries
    setUploads(fileList.map((f) => ({ name: f.name, percent: 0 })));

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        await uploadMutation.mutateAsync({
          file,
          onProgress: (percent) => {
            setUploads((prev) =>
              prev.map((u, idx) => (idx === i ? { ...u, percent } : u))
            );
          },
        });
        toast.success(`${file.name} uploadé avec succès`);
      } catch (err: any) {
        const diagnostic = explainSupabaseError(err, `Upload média: ${file.name}`);
        toast.error(`Upload impossible: ${diagnostic.cause}`, { description: diagnostic.action });
      }
    }

    setUploads([]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleAddIframe = async () => {
    if (!iframeName || !iframeUrl) return;
    try {
      await addIframeMutation.mutateAsync({ name: iframeName, url: iframeUrl });
      toast.success("iFrame ajouté");
      setIframeName("");
      setIframeUrl("");
      setShowIframe(false);
    } catch {
      toast.error("Erreur lors de l'ajout");
    }
  };

  const typeIcon = (type: string) => {
    if (type === 'image') return <Image className="h-4 w-4" />;
    if (type === 'video') return <Video className="h-4 w-4" />;
    return <Globe className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold text-foreground">Bibliothèque Média</h2>
        <span className="text-sm text-muted-foreground">({media.length})</span>
      </div>

      <div className="flex gap-3">
        <Button onClick={() => fileRef.current?.click()} className="gap-2">
          <Upload className="h-4 w-4" /> Upload Fichier
        </Button>
        <Button variant="outline" onClick={() => setShowIframe(!showIframe)} className="gap-2">
          <Link className="h-4 w-4" /> Ajouter iFrame
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,video/mp4"
          multiple
          className="hidden"
          onChange={handleUpload}
        />
      </div>

      {/* Upload progress bars */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground truncate min-w-0 flex-1 max-w-[200px]">{u.name}</span>
              <Progress value={u.percent} className="flex-1 h-2" />
              <span className="text-xs text-muted-foreground w-10 text-right">{u.percent}%</span>
            </div>
          ))}
        </div>
      )}

      {showIframe && (
        <Card className="p-4 space-y-3 glass-panel">
          <Input
            placeholder="Nom (ex: Présentation Q1)"
            value={iframeName}
            onChange={(e) => setIframeName(e.target.value)}
          />
          <Input
            placeholder="URL (ex: https://docs.google.com/presentation/d/.../embed)"
            value={iframeUrl}
            onChange={(e) => setIframeUrl(e.target.value)}
          />
          <Button onClick={handleAddIframe} size="sm">Ajouter</Button>
        </Card>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {media.map((item) => (
            <Card key={item.id} className="glass-panel overflow-hidden group">
              <div className="aspect-video bg-secondary relative">
                {item.type === 'image' && (
                  <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                )}
                {item.type === 'video' && (
                  <video src={item.url} className="w-full h-full object-cover" muted />
                )}
                {item.type === 'iframe' && (
                  <div className="w-full h-full flex items-center justify-center">
                    <Globe className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                  onClick={() => deleteMutation.mutate(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="p-3 flex items-center gap-2">
                {typeIcon(item.type)}
                <span className="text-sm font-medium truncate">{item.name}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
