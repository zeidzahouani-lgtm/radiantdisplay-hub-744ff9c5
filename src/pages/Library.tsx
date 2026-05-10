import { useState, useRef, useMemo } from "react";
import { Upload, Link, Trash2, Image, Video, Globe, Search, Grid, List, Eye, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMedia } from "@/hooks/useMedia";
import { useEstablishments } from "@/hooks/useEstablishments";
import { useEstablishmentContext } from "@/contexts/EstablishmentContext";
import { explainSupabaseError } from "@/lib/env";
import { normalizeEmbedUrl } from "@/lib/iframe-url";
import { toast } from "sonner";

interface UploadProgress {
  name: string;
  percent: number;
}

export default function Library() {
  const { media, isLoading, uploadMutation, addIframeMutation, deleteMutation, assignEstablishmentMutation } = useMedia();
  const { isGlobalAdmin } = useEstablishmentContext();
  const { establishments } = useEstablishments();
  const [iframeName, setIframeName] = useState("");
  const [iframeUrl, setIframeUrl] = useState("");
  const [showIframe, setShowIframe] = useState(false);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [preview, setPreview] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    return media.filter((m) => {
      const matchSearch = m.name.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || m.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [media, search, typeFilter]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const fileList = Array.from(files);
    setUploads(fileList.map((f) => ({ name: f.name, percent: 0 })));

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      try {
        await uploadMutation.mutateAsync({
          file,
          onProgress: (percent) => {
            setUploads((prev) => prev.map((u, idx) => (idx === i ? { ...u, percent } : u)));
          },
        });
        toast.success(`${file.name} uploadé`);
      } catch (err: any) {
        const diag = explainSupabaseError(err, `Upload ${file.name}`);
        toast.error(`Upload impossible: ${diag.cause}`, { description: diag.action });
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
      toast.error("Erreur");
    }
  };

  const typeIcon = (type: string) => {
    if (type === "image") return <Image className="h-4 w-4" />;
    if (type === "video") return <Video className="h-4 w-4" />;
    return <Globe className="h-4 w-4" />;
  };

  const typeBadge = (type: string) => {
    const labels: Record<string, string> = { image: "Image", video: "Vidéo", iframe: "Web" };
    return <Badge variant="secondary" className="text-[10px]">{labels[type] || type}</Badge>;
  };

  const handleAssign = async (id: string, value: string) => {
    try {
      await assignEstablishmentMutation.mutateAsync({ id, establishmentId: value === "__none__" ? null : value });
      toast.success("Établissement mis à jour");
    } catch {
      toast.error("Erreur d'assignation");
    }
  };

  const EstablishmentPicker = ({ item }: { item: any }) => (
    <Select
      value={item.establishment_id || "__none__"}
      onValueChange={(v) => handleAssign(item.id, v)}
    >
      <SelectTrigger
        className="h-7 text-[11px] bg-secondary/40 border-border/50"
        onClick={(e) => e.stopPropagation()}
      >
        <Building2 className="h-3 w-3 mr-1 text-primary/60" />
        <SelectValue placeholder="Établissement..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Aucun (global)</SelectItem>
        {establishments.map((e: any) => (
          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Bibliothèque</h1>
          <p className="text-muted-foreground text-sm mt-1">{media.length} médias</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => fileRef.current?.click()} className="gap-2" size="sm">
            <Upload className="h-4 w-4" /> Upload
          </Button>
          <Button variant="outline" onClick={() => setShowIframe(!showIframe)} className="gap-2" size="sm">
            <Link className="h-4 w-4" /> iFrame
          </Button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">{u.name}</span>
              <Progress value={u.percent} className="flex-1 h-2" />
              <span className="text-xs text-muted-foreground w-10 text-right">{u.percent}%</span>
            </div>
          ))}
        </div>
      )}

      {showIframe && (
        <Card className="p-4 space-y-3 glass-panel">
          <Input placeholder="Nom" value={iframeName} onChange={(e) => setIframeName(e.target.value)} />
          <Input placeholder="URL" value={iframeUrl} onChange={(e) => setIframeUrl(e.target.value)} />
          <Button onClick={handleAddIframe} size="sm">Ajouter</Button>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="video">Vidéos</SelectItem>
              <SelectItem value="iframe">Web / iFrame</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border border-border rounded-md">
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setViewMode("grid")}>
              <Grid className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : filtered.length === 0 ? (
        <Card className="glass-panel p-12 text-center">
          <Image className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Aucun média trouvé</p>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {filtered.map((item) => (
            <Card key={item.id} className="glass-panel overflow-hidden group cursor-pointer" onClick={() => setPreview(item)}>
              <div className="aspect-video bg-secondary relative">
                {item.type === "image" && <img src={item.url} alt={item.name} className="w-full h-full object-cover" />}
                {item.type === "video" && <video src={item.url} className="w-full h-full object-cover" muted />}
                {item.type === "iframe" && (
                  <div className="w-full h-full flex items-center justify-center">
                    <Globe className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                )}
                <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="icon" variant="secondary" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setPreview(item); }}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="destructive" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(item.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  {typeIcon(item.type)}
                  <span className="text-xs font-medium truncate flex-1">{item.name}</span>
                  {typeBadge(item.type)}
                </div>
                {isGlobalAdmin && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <EstablishmentPicker item={item} />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <Card key={item.id} className="glass-panel p-3 flex items-center gap-4 group">
              <div className="h-12 w-20 bg-secondary rounded overflow-hidden shrink-0">
                {item.type === "image" && <img src={item.url} alt={item.name} className="w-full h-full object-cover" />}
                {item.type === "video" && <video src={item.url} className="w-full h-full object-cover" muted />}
                {item.type === "iframe" && <div className="w-full h-full flex items-center justify-center"><Globe className="h-5 w-5 text-muted-foreground/40" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">{item.duration}s</p>
              </div>
              {typeBadge(item.type)}
              {isGlobalAdmin && (
                <div className="w-48 shrink-0">
                  <EstablishmentPicker item={item} />
                </div>
              )}
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPreview(item)}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(item.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{preview?.name}</DialogTitle>
          <div className="aspect-video bg-secondary rounded-lg overflow-hidden">
            {preview?.type === "image" && <img src={preview.url} alt={preview.name} className="w-full h-full object-contain" />}
            {preview?.type === "video" && <video src={preview.url} className="w-full h-full" controls autoPlay />}
            {preview?.type === "iframe" && <iframe src={preview.url} className="w-full h-full border-0" title={preview.name} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
