import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { validatePassword } from "@/lib/password-validation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Users, ShieldCheck, UserPlus, Building2, X, RefreshCw, CheckCircle2, CircleDashed, KeyRound, Pencil, Trash2, Megaphone } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useEstablishments } from "@/hooks/useEstablishments";

interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  roles: string[];
  establishments: { id: string; name: string; role: string }[];
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { establishments, assignUserToEstablishment, removeUserFromEstablishment } = useEstablishments();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newEstablishmentId, setNewEstablishmentId] = useState("");
  const [showEstDialog, setShowEstDialog] = useState<string | null>(null);
  const [showPasswordDialog, setShowPasswordDialog] = useState<{ id: string; email: string; name: string } | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [showEditDialog, setShowEditDialog] = useState<UserProfile | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<UserProfile | null>(null);

  const isAdmin = true;

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      const { data: roles } = await supabase.from("user_roles").select("*");
      const { data: userEsts } = await supabase.from("user_establishments").select("user_id, establishment_id, role, establishment:establishments(id, name)");

      return (profiles || []).map((p) => ({
        ...p,
        roles: (roles || []).filter((r) => r.user_id === p.id).map((r) => r.role),
        establishments: (userEsts || [])
          .filter((ue: any) => ue.user_id === p.id && ue.establishment)
          .map((ue: any) => ({
            id: ue.establishment_id,
            name: ue.establishment?.name || "—",
            role: ue.role || "member",
          })),
      })) as UserProfile[];
    },
  });

  // Check sync status with support-dravox
  const { data: syncStatus = { syncedEmails: [], syncedEstablishments: [] } } = useQuery({
    queryKey: ["dravox_sync_status", users.map((u) => u.email), establishments.map((e: any) => e.name)],
    enabled: isAdmin && users.length > 0,
    queryFn: async () => {
      const emails = users.map((u) => ({ email: u.email || "" })).filter((u) => u.email);
      const ests = establishments.map((e: any) => ({ name: e.name, email: e.email || "" }));
      const res = await supabase.functions.invoke("sync-client-dravox", {
        body: { users: emails, establishments: ests, mode: "check" },
      });
      if (res.error) throw res.error;
      return {
        syncedEmails: (res.data?.syncedEmails as string[]) || [],
        syncedEstablishments: (res.data?.syncedEstablishments as string[]) || [],
      };
    },
    staleTime: 60_000,
  });
  const syncedEmails = syncStatus.syncedEmails;
  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      toast({ title: "Rôle mis à jour" });
    },
    onError: () => toast({ title: "Erreur", variant: "destructive" }),
  });

  const inviteUser = useMutation({
    mutationFn: async () => {
      const email = newEmail.trim().toLowerCase();
      const password = newPassword.trim();
      const displayName = newDisplayName.trim();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error("Veuillez saisir un email valide (ex: nom@domaine.com)");
      }
      const pwValidation = validatePassword(password);
      if (!pwValidation.valid) {
        throw new Error("Mot de passe invalide : " + pwValidation.errors.join(", "));
      }

      const res = await supabase.functions.invoke("invite-user", {
        body: { email, password, display_name: displayName },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: async (data) => {
      if (newEstablishmentId && data?.user?.id) {
        try {
          await assignUserToEstablishment.mutateAsync({
            userId: data.user.id,
            establishmentId: newEstablishmentId,
          });
        } catch {}
      }
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      queryClient.invalidateQueries({ queryKey: ["user_establishments"] });
      toast({ title: "Utilisateur créé avec succès" });
      setShowAddDialog(false);
      setNewEmail("");
      setNewPassword("");
      setNewDisplayName("");
      setNewEstablishmentId("");
    },
    onError: (e: unknown) => {
      const description = e instanceof Error ? e.message : "Erreur inconnue";
      toast({ title: "Erreur", description, variant: "destructive" });
    },
  });

  const syncToDravox = useMutation({
    mutationFn: async () => {
      const usersToSync = users.map((u) => {
        const est = u.establishments[0];
        return {
          email: u.email || "",
          display_name: u.display_name || "",
          establishment_name: est?.name || "",
        };
      });

      // Also send establishments as clients
      const establishmentsToSync = establishments.map((est: any) => ({
        name: est.name || "",
        email: est.email || "",
        phone: est.phone || "",
        address: est.address || "",
      }));

      const res = await supabase.functions.invoke("sync-client-dravox", {
        body: { users: usersToSync, establishments: establishmentsToSync },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: (data) => {
      const summary = data.summary || {};
      queryClient.invalidateQueries({ queryKey: ["dravox_sync_status"] });
      toast({
        title: "Synchronisation terminée",
        description: `${summary.created || 0} créé(s), ${summary.skipped || 0} déjà synchronisé(s), ${summary.errors || 0} erreur(s)`,
      });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      toast({ title: "Erreur de synchronisation", description: msg, variant: "destructive" });
    },
  });

  const updatePassword = useMutation({
    mutationFn: async ({ id, email, password }: { id: string; email: string; password: string }) => {
      const res = await supabase.functions.invoke("invite-user", {
        body: { user_id: id, email, password, update_password: true },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      toast({ title: "Mot de passe mis à jour avec succès" });
      setShowPasswordDialog(null);
      setNewPasswordValue("");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, display_name, email }: { id: string; display_name: string; email: string }) => {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedName = display_name.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (trimmedEmail && !emailRegex.test(trimmedEmail)) {
        throw new Error("Format d'email invalide (ex: nom@domaine.com)");
      }
      const res = await supabase.functions.invoke("invite-user", {
        body: {
          update_profile: true,
          user_id: id,
          new_email: trimmedEmail,
          display_name: trimmedName,
        },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      toast({ title: "Profil mis à jour", description: "L'email de connexion a aussi été modifié." });
      setShowEditDialog(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  const deleteUser = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const res = await supabase.functions.invoke("invite-user", {
        body: { email, user_id: id, delete_user: true },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      toast({ title: "Utilisateur supprimé" });
      setShowDeleteConfirm(null);
    },
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  const handleAssignEstablishment = async (userId: string, establishmentId: string) => {
    try {
      // Check if non-admin user already has an establishment
      const user = users.find(u => u.id === userId);
      const isUserAdmin = user?.roles?.includes("admin");
      if (!isUserAdmin && user?.establishments && user.establishments.length > 0) {
        toast({ title: "Un compte utilisateur ne peut avoir qu'un seul établissement. Retirez l'établissement actuel d'abord.", variant: "destructive" });
        return;
      }
      await assignUserToEstablishment.mutateAsync({ userId, establishmentId });
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      toast({ title: "Établissement assigné" });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const handleRemoveEstablishment = async (userId: string, establishmentId: string) => {
    try {
      await removeUserFromEstablishment.mutateAsync({ userId, establishmentId });
      queryClient.invalidateQueries({ queryKey: ["admin_users"] });
      toast({ title: "Établissement retiré" });
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
  };

  const selectedUser = showEstDialog ? users.find((u) => u.id === showEstDialog) : null;
  const selectedUserEsts = selectedUser?.establishments || [];
  const availableEstablishments = establishments.filter(
    (e: any) => !selectedUserEsts.some((ue) => ue.id === e.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" /> Administration des utilisateurs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Gérez les utilisateurs, rôles et établissements</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="secondary">{users.length} utilisateur(s)</Badge>
          <Button size="sm" variant="outline" onClick={() => syncToDravox.mutate()} disabled={syncToDravox.isPending || users.length === 0}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncToDravox.isPending ? "animate-spin" : ""}`} /> Sync Support
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Ajouter
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    {u.roles.includes("admin") ? (
                      <ShieldCheck className="h-4 w-4 text-primary" />
                    ) : u.roles.includes("marketing") ? (
                      <Megaphone className="h-4 w-4 text-orange-500" />
                    ) : (
                      <Users className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium">{u.display_name || "Sans nom"}</p>
                      {u.email && syncedEmails.includes(u.email) ? (
                        <span className="inline-flex" aria-label="Synchronisé avec Support"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /></span>
                      ) : (
                        <span className="inline-flex" aria-label="Non synchronisé"><CircleDashed className="h-3.5 w-3.5 text-muted-foreground/40" /></span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setShowEstDialog(u.id)}
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    {u.establishments.length} établissement(s)
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => {
                      setEditDisplayName(u.display_name || "");
                      setEditEmail(u.email || "");
                      setShowEditDialog(u);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setShowPasswordDialog({ id: u.id, email: u.email || "", name: u.display_name || "" })}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-destructive hover:text-destructive"
                    onClick={() => setShowDeleteConfirm(u)}
                    disabled={u.id === user?.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Select
                    value={u.roles.includes("admin") ? "admin" : u.roles.includes("marketing") ? "marketing" : "user"}
                    onValueChange={(role) => updateRole.mutate({ userId: u.id, role })}
                    disabled={u.id === user?.id}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Utilisateur</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="admin">Admin Global</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add user dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un utilisateur</DialogTitle>
            <DialogDescription>Créez un nouveau compte utilisateur</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nom d'affichage</label>
              <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="Jean Dupont" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jean@exemple.com" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Mot de passe</label>
              <div className="mt-1">
                <PasswordInput value={newPassword} onChange={setNewPassword} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Établissement (optionnel)</label>
              <Select value={newEstablishmentId} onValueChange={setNewEstablishmentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Aucun établissement" />
                </SelectTrigger>
                <SelectContent>
                  {establishments.map((est: any) => (
                    <SelectItem key={est.id} value={est.id}>{est.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Annuler</Button>
            <Button onClick={() => inviteUser.mutate()} disabled={!newEmail || !newPassword || inviteUser.isPending}>
              {inviteUser.isPending ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Establishment assignment dialog */}
      <Dialog open={!!showEstDialog} onOpenChange={() => setShowEstDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Établissements assignés</DialogTitle>
            <DialogDescription>
              {selectedUser?.display_name || "Utilisateur"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selectedUserEsts.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun établissement assigné à cet utilisateur.</p>
            )}
            {selectedUserEsts.map((est) => (
              <div key={est.id} className="flex items-center justify-between border border-border rounded-md p-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{est.name}</span>
                  <Badge variant="secondary" className="text-[10px]">{est.role}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => showEstDialog && handleRemoveEstablishment(showEstDialog, est.id)}
                >
                  <X className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ))}

            {availableEstablishments.length > 0 && (
              <div className="border-t border-border pt-3">
                <label className="text-sm font-medium">Assigner un établissement</label>
                <Select onValueChange={(estId) => {
                  if (showEstDialog) handleAssignEstablishment(showEstDialog, estId);
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choisir un établissement..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEstablishments.map((est: any) => (
                      <SelectItem key={est.id} value={est.id}>{est.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Password change dialog */}
      <Dialog open={!!showPasswordDialog} onOpenChange={() => { setShowPasswordDialog(null); setNewPasswordValue(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le mot de passe</DialogTitle>
            <DialogDescription>
              {showPasswordDialog?.name || showPasswordDialog?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nouveau mot de passe</label>
              <div className="mt-1">
                <PasswordInput value={newPasswordValue} onChange={setNewPasswordValue} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPasswordDialog(null); setNewPasswordValue(""); }}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                if (showPasswordDialog?.email && validatePassword(newPasswordValue).valid) {
                  updatePassword.mutate({ id: showPasswordDialog.id, email: showPasswordDialog.email, password: newPasswordValue });
                }
              }}
              disabled={!validatePassword(newPasswordValue).valid || updatePassword.isPending}
            >
              {updatePassword.isPending ? "Mise à jour..." : "Mettre à jour"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={!!showEditDialog} onOpenChange={() => setShowEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l'utilisateur</DialogTitle>
            <DialogDescription>{showEditDialog?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nom d'affichage</label>
              <Input value={editDisplayName} onChange={(e) => setEditDisplayName(e.target.value)} placeholder="Nom" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="email@exemple.com" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(null)}>Annuler</Button>
            <Button
              onClick={() => {
                if (showEditDialog) {
                  updateProfile.mutate({ id: showEditDialog.id, display_name: editDisplayName.trim(), email: editEmail.trim() });
                }
              }}
              disabled={!editDisplayName.trim() || !editEmail.trim() || updateProfile.isPending}
            >
              {updateProfile.isPending ? "En cours..." : "Sauvegarder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete user confirmation */}
      <AlertDialog open={!!showDeleteConfirm} onOpenChange={() => setShowDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'utilisateur ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera le profil de <strong>{showDeleteConfirm?.display_name || showDeleteConfirm?.email}</strong> ainsi que ses assignations. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => showDeleteConfirm && deleteUser.mutate({ id: showDeleteConfirm.id, email: showDeleteConfirm.email || "" })}
            >
              {deleteUser.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
