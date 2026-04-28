import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Building2, Plus, Tv, Users, Trash2, MapPin, X, Shield, Key, Phone, AtSign, Edit, Upload, ImageIcon, CheckCircle2, CircleDashed } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useEstablishments } from "@/hooks/useEstablishments";
import { EstablishmentDashboard } from "@/components/establishments/EstablishmentDashboard";

const DEFAULT_FORM = {
  name: "", address: "", description: "", phone: "", email: "", max_screens: 5, logo_url: "" as string | null,
};

export default function Establishments() {
  const queryClient = useQueryClient();
  const {
    establishments, isLoading,
    addEstablishment, updateEstablishment, deleteEstablishment,
    assignScreenToEstablishment,
    assignUserToEstablishment,
    removeUserFromEstablishment,
  } = useEstablishments();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingEstablishment, setEditingEstablishment] = useState<any>(null);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [selectedEstablishment, setSelectedEstablishment] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "screens" | "users">("dashboard");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // All screens (admin)
  const { data: allScreens = [] } = useQuery({
    queryKey: ["admin_all_screens"],
    queryFn: async () => {
      const { data, error } = await supabase.from("screens").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // All users (admin)
  const { data: allUsers = [] } = useQuery({
    queryKey: ["admin_users_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("display_name");
      if (error) throw error;
      return data || [];
    },
  });

  // User-establishment assignments
  const { data: userEstablishments = [] } = useQuery({
    queryKey: ["user_establishments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_establishments").select("*");
      if (error) throw error;
      return data || [];
    },
  });

  // License counts per establishment
  const { data: licenseCounts = {} } = useQuery({
    queryKey: ["license_counts_by_establishment"],
    queryFn: async () => {
      const { data, error } = await supabase.from("licenses").select("screen_id, is_active, screens!inner(establishment_id)");
      if (error) return {};
      const counts: Record<string, number> = {};
      (data || []).forEach((l: any) => {
        const estId = l.screens?.establishment_id;
        if (estId && l.is_active) counts[estId] = (counts[estId] || 0) + 1;
      });
      return counts;
    },
  });

  // Check sync status with Support Dravox
  const { data: syncedEstablishments = [] } = useQuery({
    queryKey: ["dravox_est_sync_status", establishments.map((e: any) => e.name)],
    enabled: establishments.length > 0,
    queryFn: async () => {
      const ests = establishments.map((e: any) => ({ name: e.name, email: e.email || "" }));
      const res = await supabase.functions.invoke("sync-client-dravox", {
        body: { establishments: ests, mode: "check" },
      });
      if (res.error) throw res.error;
      return (res.data?.syncedEstablishments as string[]) || [];
    },
    staleTime: 60_000,
  });

  const resetForm = () => setFormData({ ...DEFAULT_FORM });

  const openAdd = () => {
    resetForm();
    setEditingEstablishment(null);
    setShowAddDialog(true);
  };

  const openEdit = (est: any) => {
    setFormData({
      name: est.name || "",
      address: est.address || "",
      description: est.description || "",
      phone: est.phone || "",
      email: est.email || "",
      max_screens: est.max_screens ?? 5,
      logo_url: est.logo_url || null,
    });
    setEditingEstablishment(est);
    setShowAddDialog(true);
  };

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `branding/establishments/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("media").getPublicUrl(path);
      setFormData((p) => ({ ...p, logo_url: urlData.publicUrl }));
      toast({ title: "Logo uploadé" });
    } catch {
      toast({ title: "Erreur d'upload", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    try {
      if (editingEstablishment) {
        await updateEstablishment.mutateAsync({ id: editingEstablishment.id, ...formData });
        toast({ title: "Établissement mis à jour" });
      } else {
        await addEstablishment.mutateAsync(formData);
        toast({ title: "Établissement créé" });
      }
      setShowAddDialog(false);
      resetForm();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEstablishment.mutateAsync(id);
      toast({ title: "Établissement supprimé" });
      if (selectedEstablishment === id) setSelectedEstablishment(null);
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleSetUserRole = async (userId: string, establishmentId: string, role: string) => {
    try {
      await supabase.from("user_establishments").update({ role } as any).eq("user_id", userId).eq("establishment_id", establishmentId);
      queryClient.invalidateQueries({ queryKey: ["user_establishments"] });
      toast({ title: `Rôle mis à jour: ${role === "admin" ? "Administrateur" : "Membre"}` });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const selected = establishments.find((e: any) => e.id === selectedEstablishment);
  const selectedScreens = allScreens.filter((s: any) => s.establishment_id === selectedEstablishment);
  const selectedUserAssignments = userEstablishments.filter((ue: any) => ue.establishment_id === selectedEstablishment);
  const selectedUserIds = selectedUserAssignments.map((ue: any) => ue.user_id);
  const selectedUsers = allUsers.filter((u: any) => selectedUserIds.includes(u.id));
  const availableScreens = allScreens.filter((s: any) => s.establishment_id !== selectedEstablishment);
  const availableUsers = allUsers.filter((u: any) => !selectedUserIds.includes(u.id));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" /> Établissements
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gérez vos établissements, écrans, utilisateurs et configurations</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{establishments.length} établissement(s)</Badge>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: List */}
        <div className="space-y-3">
          {isLoading && <p className="text-muted-foreground text-sm">Chargement...</p>}
          {establishments.map((est: any) => {
            const screenCount = allScreens.filter((s: any) => s.establishment_id === est.id).length;
            const userCount = userEstablishments.filter((ue: any) => ue.establishment_id === est.id).length;
            const licenseCount = (licenseCounts as any)[est.id] || 0;
            return (
              <Card
                key={est.id}
                className={`cursor-pointer transition-colors ${selectedEstablishment === est.id ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"}`}
                onClick={() => { setSelectedEstablishment(est.id); setActiveTab("dashboard"); }}
              >
                <CardContent className="py-3">
                  <div className="flex items-center gap-3">
                    {/* Logo thumbnail */}
                    <div className="w-10 h-10 rounded-lg border border-border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                      {est.logo_url ? (
                        <img src={est.logo_url} alt={est.name} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="h-5 w-5 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">{est.name}</p>
                      {est.address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" /> {est.address}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              {syncedEstablishments.includes(est.name) ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <CircleDashed className="h-4 w-4 text-muted-foreground/40" />
                              )}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {syncedEstablishments.includes(est.name) ? "Synchronisé avec Support Dravox" : "Non synchronisé"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Tv className="h-3 w-3" /> {screenCount}/{est.max_screens || "∞"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Users className="h-3 w-3" /> {userCount}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Key className="h-3 w-3" /> {licenseCount}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {!isLoading && establishments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Aucun établissement.</p>
          )}
        </div>

        {/* Right: Detail */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Sélectionnez un établissement pour gérer ses détails
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Header with logo */}
              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl border border-border bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                      {selected.logo_url ? (
                        <img src={selected.logo_url} alt={selected.name} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="h-7 w-7 text-muted-foreground/40" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{selected.name}</CardTitle>
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                        {selected.address && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {selected.address}</span>}
                        {selected.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {selected.phone}</span>}
                        {selected.email && <span className="flex items-center gap-1"><AtSign className="h-3 w-3" /> {selected.email}</span>}
                      </div>
                      {selected.description && <p className="text-xs text-muted-foreground mt-1">{selected.description}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openEdit(selected)}>
                      <Edit className="h-4 w-4 mr-1" /> Modifier
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete(selected.id)}>
                      <Trash2 className="h-4 w-4 mr-1" /> Supprimer
                    </Button>
                  </div>
                </CardHeader>
              </Card>

              {/* Tabs */}
              <div className="flex gap-1 bg-secondary/30 p-1 rounded-lg">
                {(["dashboard", "screens", "users"] as const).map((tab) => (
                  <Button
                    key={tab}
                    variant={activeTab === tab ? "default" : "ghost"}
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === "dashboard" && "📊 Dashboard"}
                    {tab === "screens" && `📺 Écrans (${selectedScreens.length})`}
                    {tab === "users" && `👥 Utilisateurs (${selectedUsers.length})`}
                  </Button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === "dashboard" && (
                <EstablishmentDashboard establishmentId={selectedEstablishment!} />
              )}

              {activeTab === "screens" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Tv className="h-4 w-4" /> Écrans ({selectedScreens.length}/{selected.max_screens || "∞"})
                      {(licenseCounts as any)[selectedEstablishment!] > 0 && (
                        <Badge variant="outline" className="text-[10px] gap-1 ml-2">
                          <Key className="h-3 w-3" /> {(licenseCounts as any)[selectedEstablishment!]} licence(s)
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedScreens.map((s: any) => (
                      <div key={s.id} className="flex items-center justify-between border rounded-md p-2">
                        <div className="flex items-center gap-2">
                          <Tv className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{s.name}</span>
                          <Badge variant={s.status === "online" ? "default" : "secondary"} className="text-[10px]">
                            {s.status}
                          </Badge>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => assignScreenToEstablishment.mutate({ screenId: s.id, establishmentId: null })}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    {selected.max_screens > 0 && selectedScreens.length >= selected.max_screens ? (
                      <p className="text-xs text-destructive text-center py-2">Quota d'écrans atteint ({selected.max_screens})</p>
                    ) : (
                      <Select onValueChange={(screenId) => assignScreenToEstablishment.mutate({ screenId, establishmentId: selectedEstablishment! })}>
                        <SelectTrigger className="mt-2">
                          <SelectValue placeholder="Ajouter un écran..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableScreens.map((s: any) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name} {s.establishment_id ? "(autre étab.)" : "(non assigné)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </CardContent>
                </Card>
              )}

              {activeTab === "users" && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4" /> Utilisateurs ({selectedUsers.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedUsers.map((u: any) => {
                      const assignment = selectedUserAssignments.find((ue: any) => ue.user_id === u.id);
                      const userRole = assignment?.role || "member";
                      return (
                        <div key={u.id} className="flex items-center justify-between border rounded-md p-2">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{u.display_name || u.email}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Select value={userRole} onValueChange={(role) => handleSetUserRole(u.id, selectedEstablishment!, role)}>
                              <SelectTrigger className="h-7 w-[130px] text-xs">
                                <Shield className="h-3 w-3 mr-1" />
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">Administrateur</SelectItem>
                                <SelectItem value="member">Membre</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" onClick={() => {
                              removeUserFromEstablishment.mutate({ userId: u.id, establishmentId: selectedEstablishment! });
                              queryClient.invalidateQueries({ queryKey: ["user_establishments"] });
                            }}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    <Select onValueChange={(userId) => {
                      assignUserToEstablishment.mutate({ userId, establishmentId: selectedEstablishment! });
                      queryClient.invalidateQueries({ queryKey: ["user_establishments"] });
                    }}>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Ajouter un utilisateur..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUsers.map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.display_name || u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add/Edit dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEstablishment ? "Modifier l'établissement" : "Nouvel établissement"}</DialogTitle>
            <DialogDescription>
              {editingEstablishment ? "Modifiez les informations de l'établissement" : "Créez un établissement pour regrouper écrans et utilisateurs"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Logo upload */}
            <div>
              <label className="text-sm font-medium">Logo</label>
              <div className="mt-1 flex items-center gap-4">
                <div
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-border bg-muted/20 overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {formData.logo_url ? (
                    <img src={formData.logo_url} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="gap-1.5"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploading ? "Upload..." : "Choisir un logo"}
                  </Button>
                  {formData.logo_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive text-xs h-7"
                      onClick={() => setFormData((p) => ({ ...p, logo_url: null }))}
                    >
                      Supprimer le logo
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-sm font-medium">Nom *</label>
              <Input value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder="Ex: Siège Paris" className="mt-1" />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} placeholder="Description de l'établissement..." className="mt-1" rows={2} />
            </div>

            {/* Address + Max screens */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Adresse</label>
                <Input value={formData.address} onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))} placeholder="123 rue..." className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Nombre max d'écrans</label>
                <Input type="number" min={0} value={formData.max_screens} onChange={(e) => setFormData((p) => ({ ...p, max_screens: parseInt(e.target.value) || 0 }))} className="mt-1" />
              </div>
            </div>

            {/* Phone + Email */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Téléphone</label>
                <Input value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} placeholder="+33 1 23 45 67 89" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Email</label>
                <Input value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} placeholder="contact@example.com" className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={!formData.name.trim() || addEstablishment.isPending || updateEstablishment.isPending || uploading}>
              {addEstablishment.isPending || updateEstablishment.isPending ? "En cours..." : editingEstablishment ? "Sauvegarder" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
