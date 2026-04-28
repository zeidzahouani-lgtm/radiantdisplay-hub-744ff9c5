import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ClipboardList, KeyRound, Shield, Check, X, RefreshCw, Copy, Eye, EyeOff, UserPlus, Building2, Monitor, Mail, History, Pencil, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

// Password generator
function generatePassword(length = 14): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*?";
  const all = upper + lower + digits + special;
  let pw = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = pw.length; i < length; i++) {
    pw.push(all[Math.floor(Math.random() * all.length)]);
  }
  return pw.sort(() => Math.random() - 0.5).join("");
}

interface PasswordResetRequest {
  id: string;
  email: string;
  status: string;
  created_at: string;
  handled_by: string | null;
  handled_at: string | null;
}

interface RegistrationRequest {
  id: string;
  email: string;
  display_name: string;
  establishment_name: string;
  num_screens: number;
  phone: string | null;
  address: string | null;
  message: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export default function AdminRequests() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;

  // Password reset requests
  const { data: resetRequests = [] } = useQuery({
    queryKey: ["password_reset_requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("password_reset_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PasswordResetRequest[];
    },
  });

  // Registration requests
  const { data: regRequests = [] } = useQuery({
    queryKey: ["registration_requests"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registration_requests" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as RegistrationRequest[];
    },
  });

  // Admin profiles for history display
  const { data: profiles = [] } = useQuery({
    queryKey: ["admin_profiles"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, display_name, email");
      if (error) throw error;
      return data || [];
    },
  });

  const getAdminName = (adminId: string | null) => {
    if (!adminId) return "Inconnu";
    const p = profiles.find((pr) => pr.id === adminId);
    return p?.display_name || p?.email || "Admin";
  };

  // Build history from handled requests
  const historyItems = [
    ...resetRequests
      .filter((r) => r.status !== "pending")
      .map((r) => ({
        id: r.id,
        type: "reset" as const,
        email: r.email,
        status: r.status,
        date: r.handled_at || r.created_at,
        admin_id: r.handled_by,
        label: "Réinitialisation de mot de passe",
      })),
    ...regRequests
      .filter((r) => r.status !== "pending")
      .map((r) => ({
        id: r.id,
        type: "registration" as const,
        email: r.email,
        status: r.status,
        date: r.reviewed_at || r.created_at,
        admin_id: r.reviewed_by,
        label: `Inscription — ${r.establishment_name}`,
      })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Play notification sound
  const playNotificationSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.value = 0.3;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    } catch {}
  };

  // Realtime with notifications
  useEffect(() => {
    const ch1 = supabase
      .channel("reset-requests-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "password_reset_requests" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["password_reset_requests"] });
        playNotificationSound();
        toast({ title: "🔑 Nouvelle demande de réinitialisation", description: (payload.new as any)?.email || "Un utilisateur demande un nouveau mot de passe" });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "password_reset_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["password_reset_requests"] });
      })
      .subscribe();
    const ch2 = supabase
      .channel("reg-requests-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "registration_requests" }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["registration_requests"] });
        playNotificationSound();
        toast({ title: "📋 Nouvelle demande d'inscription", description: (payload.new as any)?.display_name || "Un nouvel utilisateur souhaite s'inscrire" });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "registration_requests" }, () => {
        queryClient.invalidateQueries({ queryKey: ["registration_requests"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [queryClient]);

  // State for password reset dialog
  const [resetDialog, setResetDialog] = useState<PasswordResetRequest | null>(null);
  const [resetDialogMode, setResetDialogMode] = useState<"handle" | "resend">("handle");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendResetEmail, setSendResetEmail] = useState(true);

  // State for registration review dialog
  const [regDialog, setRegDialog] = useState<RegistrationRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [sendRegEmail, setSendRegEmail] = useState(true);

  // State for view/edit dialogs
  const [viewRegDialog, setViewRegDialog] = useState<RegistrationRequest | null>(null);
  const [editRegDialog, setEditRegDialog] = useState<RegistrationRequest | null>(null);
  const [editRegForm, setEditRegForm] = useState({ display_name: "", email: "", establishment_name: "", num_screens: 1, phone: "", address: "", message: "" });

  const [viewResetDialog, setViewResetDialog] = useState<PasswordResetRequest | null>(null);
  const [editResetDialog, setEditResetDialog] = useState<PasswordResetRequest | null>(null);
  const [editResetEmail, setEditResetEmail] = useState("");

  const openResetDialog = (req: PasswordResetRequest, mode: "handle" | "resend" = "handle") => {
    setNewPassword(generatePassword());
    setShowPassword(false);
    setSendResetEmail(true);
    setResetDialogMode(mode);
    setResetDialog(req);
  };

  const openRegDialog = (req: RegistrationRequest) => {
    setRegPassword(generatePassword());
    setShowRegPassword(false);
    setRejectionReason("");
    setRegDialog(req);
  };

  const openEditReg = (req: RegistrationRequest) => {
    setEditRegForm({
      display_name: req.display_name,
      email: req.email,
      establishment_name: req.establishment_name,
      num_screens: req.num_screens,
      phone: req.phone || "",
      address: req.address || "",
      message: req.message || "",
    });
    setEditRegDialog(req);
  };

  const openEditReset = (req: PasswordResetRequest) => {
    setEditResetEmail(req.email);
    setEditResetDialog(req);
  };

  // Handle password reset
  const handleResetPassword = useMutation({
    mutationFn: async () => {
      if (!resetDialog) return;
      const { data: profiles } = await supabase.from("profiles").select("id, display_name").eq("email", resetDialog.email).limit(1);
      if (!profiles || profiles.length === 0) throw new Error("Utilisateur introuvable avec cet email");

      const res = await supabase.functions.invoke("invite-user", {
        body: { email: resetDialog.email, password: newPassword, display_name: null, update_password: true },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      // Send email if checked
      if (sendResetEmail) {
        const emailRes = await supabase.functions.invoke("send-credentials", {
          body: { to_email: resetDialog.email, to_name: profiles[0].display_name, password: newPassword, type: "reset" },
        });
        if (emailRes.error) throw emailRes.error;
        if (emailRes.data?.error) throw new Error(emailRes.data.error);
      }

      await supabase
        .from("password_reset_requests" as any)
        .update({ status: "handled", handled_by: currentUserId, handled_at: new Date().toISOString() } as any)
        .eq("id", resetDialog.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["password_reset_requests"] });
      toast({ title: "Mot de passe mis à jour", description: sendResetEmail ? `Nouveau mot de passe envoyé par email à ${resetDialog?.email}` : `Nouveau mot de passe attribué pour ${resetDialog?.email}` });
      setResetDialog(null);
    },
    onError: (e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Handle registration approval
  const handleApproveRegistration = useMutation({
    mutationFn: async () => {
      if (!regDialog) return;
      // Create user via invite-user
      const res = await supabase.functions.invoke("invite-user", {
        body: { email: regDialog.email, password: regPassword, display_name: regDialog.display_name },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);

      // Check if establishment already exists
      const { data: existingEst } = await supabase
        .from("establishments")
        .select("id")
        .eq("name", regDialog.establishment_name)
        .limit(1);

      let estId: string;

      if (existingEst && existingEst.length > 0) {
        estId = existingEst[0].id;
      } else {
        // Create establishment with requested num_screens as max_screens
        const { data: est, error: estError } = await supabase.from("establishments").insert({
          name: regDialog.establishment_name,
          max_screens: regDialog.num_screens,
          created_by: currentUserId,
          phone: regDialog.phone,
          address: regDialog.address,
        }).select().single();
        if (estError) throw estError;
        estId = est.id;
      }

      // Assign user to establishment
      if (res.data?.user?.id) {
        await supabase.from("user_establishments").insert({
          user_id: res.data.user.id,
          establishment_id: estId,
          role: "admin",
        });
      }

      // Auto-generate licenses for the requested number of screens
      const numScreens = regDialog.num_screens || 1;
      const generateKey = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        const parts: string[] = [];
        for (let s = 0; s < 4; s++) {
          let seg = "";
          for (let i = 0; i < 4; i++) seg += chars[Math.floor(Math.random() * chars.length)];
          parts.push(seg);
        }
        return parts.join("-");
      };

      const validUntil = new Date();
      validUntil.setFullYear(validUntil.getFullYear() + 1); // 1 year validity

      const licensesToInsert = Array.from({ length: numScreens }, () => ({
        license_key: generateKey(),
        created_by: currentUserId,
        valid_until: validUntil.toISOString(),
        is_active: true,
        source: 'auto',
        establishment_id: estId,
      }));

      if (licensesToInsert.length > 0) {
        const { error: licError } = await supabase
          .from("licenses" as any)
          .insert(licensesToInsert as any);
        if (licError) throw licError;
      }

      // Send email if checked
      if (sendRegEmail) {
        const emailRes = await supabase.functions.invoke("send-credentials", {
          body: { to_email: regDialog.email, to_name: regDialog.display_name, password: regPassword, type: "registration" },
        });
        if (emailRes.error) throw emailRes.error;
        if (emailRes.data?.error) throw new Error(emailRes.data.error);
      }

      // Update request status
      await supabase
        .from("registration_requests" as any)
        .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() } as any)
        .eq("id", regDialog.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registration_requests"] });
      queryClient.invalidateQueries({ queryKey: ["licenses"] });
      toast({ title: "Inscription approuvée", description: sendRegEmail ? `Identifiants envoyés par email à ${regDialog?.email}` : `Compte créé pour ${regDialog?.email}` });
      setRegDialog(null);
    },
    onError: (e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Handle registration rejection
  const handleRejectRegistration = useMutation({
    mutationFn: async () => {
      if (!regDialog) return;
      await supabase
        .from("registration_requests" as any)
        .update({
          status: "rejected",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason || null,
        } as any)
        .eq("id", regDialog.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registration_requests"] });
      toast({ title: "Inscription refusée" });
      setRegDialog(null);
    },
    onError: (e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Save edited registration request
  const saveEditReg = useMutation({
    mutationFn: async () => {
      if (!editRegDialog) return;
      await supabase
        .from("registration_requests" as any)
        .update({
          display_name: editRegForm.display_name,
          email: editRegForm.email,
          establishment_name: editRegForm.establishment_name,
          num_screens: editRegForm.num_screens,
          phone: editRegForm.phone || null,
          address: editRegForm.address || null,
          message: editRegForm.message || null,
        } as any)
        .eq("id", editRegDialog.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registration_requests"] });
      toast({ title: "Demande modifiée" });
      setEditRegDialog(null);
    },
    onError: (e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Save edited password reset request
  const saveEditReset = useMutation({
    mutationFn: async () => {
      if (!editResetDialog) return;
      await supabase
        .from("password_reset_requests" as any)
        .update({ email: editResetEmail } as any)
        .eq("id", editResetDialog.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["password_reset_requests"] });
      toast({ title: "Demande modifiée" });
      setEditResetDialog(null);
    },
    onError: (e) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // Delete request
  const deleteRegRequest = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("registration_requests" as any).delete().eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registration_requests"] });
      toast({ title: "Demande supprimée" });
    },
  });

  const deleteResetRequest = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("password_reset_requests" as any).delete().eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["password_reset_requests"] });
      toast({ title: "Demande supprimée" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copié dans le presse-papier" });
  };

  const statusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="outline" className="text-yellow-500 border-yellow-500/30">En attente</Badge>;
    if (status === "handled" || status === "approved") return <Badge variant="outline" className="text-green-500 border-green-500/30">Traité</Badge>;
    if (status === "rejected") return <Badge variant="destructive">Refusé</Badge>;
    return <Badge variant="secondary">{status}</Badge>;
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Shield className="h-12 w-12 mb-3 opacity-30" />
        <p className="font-medium">Accès refusé</p>
      </div>
    );
  }

  const pendingResets = resetRequests.filter((r) => r.status === "pending").length;
  const pendingRegs = regRequests.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" /> Demandes
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Gérez les demandes d'inscription et de réinitialisation de mot de passe</p>
      </div>

      <Tabs defaultValue="registrations">
        <TabsList>
          <TabsTrigger value="registrations" className="gap-1.5">
            <UserPlus className="h-4 w-4" /> Inscriptions
            {pendingRegs > 0 && <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{pendingRegs}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="resets" className="gap-1.5">
            <KeyRound className="h-4 w-4" /> Mots de passe
            {pendingResets > 0 && <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{pendingResets}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-4 w-4" /> Historique
          </TabsTrigger>
        </TabsList>

        {/* Registration requests */}
        <TabsContent value="registrations" className="space-y-3 mt-4">
          {regRequests.length === 0 && <p className="text-muted-foreground text-sm">Aucune demande d'inscription.</p>}
          {regRequests.map((req) => (
            <Card key={req.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <UserPlus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{req.display_name}</p>
                    <p className="text-xs text-muted-foreground">{req.email}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Building2 className="h-3 w-3" /> {req.establishment_name}
                      <Monitor className="h-3 w-3 ml-2" /> {req.num_screens} écran(s)
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(req.created_at).toLocaleDateString("fr-FR")}
                  </span>
                  {statusBadge(req.status)}
                  <Button size="icon" variant="ghost" onClick={() => setViewRegDialog(req)} title="Consulter">
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEditReg(req)} title="Modifier">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {req.status === "pending" && (
                    <Button size="sm" onClick={() => openRegDialog(req)}>Examiner</Button>
                  )}
                  <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteRegRequest.mutate(req.id)} title="Supprimer">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Password reset requests */}
        <TabsContent value="resets" className="space-y-3 mt-4">
          {resetRequests.length === 0 && <p className="text-muted-foreground text-sm">Aucune demande de réinitialisation.</p>}
          {resetRequests.map((req) => (
            <Card key={req.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <KeyRound className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{req.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(req.created_at).toLocaleString("fr-FR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(req.status)}
                  <Button size="icon" variant="ghost" onClick={() => setViewResetDialog(req)} title="Consulter">
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEditReset(req)} title="Modifier">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {req.status === "pending" && (
                    <Button size="sm" onClick={() => openResetDialog(req)}>Traiter</Button>
                  )}
                  {req.status === "handled" && (
                    <Button size="sm" variant="outline" onClick={() => openResetDialog(req, "resend")} className="gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" /> Renvoyer
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteResetRequest.mutate(req.id)} title="Supprimer">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="space-y-3 mt-4">
          {historyItems.length === 0 && <p className="text-muted-foreground text-sm">Aucune action enregistrée.</p>}
          {historyItems.map((item) => (
            <Card key={`${item.type}-${item.id}`}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center ${item.type === "reset" ? "bg-primary/10" : item.status === "approved" ? "bg-primary/10" : "bg-destructive/10"}`}>
                    {item.type === "reset" ? <KeyRound className="h-4 w-4 text-primary" /> : item.status === "approved" ? <Check className="h-4 w-4 text-primary" /> : <X className="h-4 w-4 text-destructive" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Par <span className="font-medium text-foreground">{getAdminName(item.admin_id)}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">
                      {new Date(item.date).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {statusBadge(item.status)}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Password reset dialog */}
      <Dialog open={!!resetDialog} onOpenChange={() => setResetDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resetDialogMode === "resend" ? "Renvoyer un mot de passe" : "Réinitialiser le mot de passe"}</DialogTitle>
            <DialogDescription>{resetDialog?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nouveau mot de passe</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-0 h-full"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <Button variant="outline" size="icon" onClick={() => setNewPassword(generatePassword())} title="Générer">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => copyToClipboard(newPassword)} title="Copier">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Checkbox id="send-reset-email" checked={sendResetEmail} onCheckedChange={(v) => setSendResetEmail(!!v)} />
              <label htmlFor="send-reset-email" className="text-sm flex items-center gap-1.5 cursor-pointer">
                <Mail className="h-3.5 w-3.5 text-primary" /> Envoyer le mot de passe par email
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetDialog(null)}>Annuler</Button>
            <Button onClick={() => handleResetPassword.mutate()} disabled={!newPassword || handleResetPassword.isPending}>
              {handleResetPassword.isPending ? "Mise à jour..." : "Appliquer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registration review dialog */}
      <Dialog open={!!regDialog} onOpenChange={() => setRegDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Examiner la demande d'inscription</DialogTitle>
            <DialogDescription>Vérifiez les informations et prenez une décision</DialogDescription>
          </DialogHeader>
          {regDialog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Nom</p>
                  <p className="font-medium">{regDialog.display_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Email</p>
                  <p className="font-medium">{regDialog.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Établissement</p>
                  <p className="font-medium">{regDialog.establishment_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Nombre d'écrans</p>
                  <p className="font-medium">{regDialog.num_screens}</p>
                </div>
                {regDialog.phone && (
                  <div>
                    <p className="text-muted-foreground text-xs">Téléphone</p>
                    <p className="font-medium">{regDialog.phone}</p>
                  </div>
                )}
                {regDialog.address && (
                  <div>
                    <p className="text-muted-foreground text-xs">Adresse</p>
                    <p className="font-medium">{regDialog.address}</p>
                  </div>
                )}
              </div>
              {regDialog.message && (
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Message</p>
                  <p className="text-sm bg-secondary/50 rounded-md p-3">{regDialog.message}</p>
                </div>
              )}

              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-medium text-green-500">Approuver — Mot de passe généré :</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showRegPassword ? "text" : "password"}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-0 h-full"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                    >
                      {showRegPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => setRegPassword(generatePassword())}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(regPassword)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox id="send-reg-email" checked={sendRegEmail} onCheckedChange={(v) => setSendRegEmail(!!v)} />
                  <label htmlFor="send-reg-email" className="text-sm flex items-center gap-1.5 cursor-pointer">
                    <Mail className="h-3.5 w-3.5 text-primary" /> Envoyer les identifiants par email
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">Ou refuser :</p>
                <Textarea
                  placeholder="Raison du refus (optionnel)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRegDialog(null)}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={() => handleRejectRegistration.mutate()}
              disabled={handleRejectRegistration.isPending}
            >
              <X className="h-4 w-4 mr-1" /> Refuser
            </Button>
            <Button
              onClick={() => handleApproveRegistration.mutate()}
              disabled={!regPassword || handleApproveRegistration.isPending}
            >
              <Check className="h-4 w-4 mr-1" />
              {handleApproveRegistration.isPending ? "Création..." : "Approuver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View registration detail dialog */}
      <Dialog open={!!viewRegDialog} onOpenChange={() => setViewRegDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Détail de la demande</DialogTitle>
            <DialogDescription>Demande d'inscription de {viewRegDialog?.display_name}</DialogDescription>
          </DialogHeader>
          {viewRegDialog && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs">Nom</p><p className="font-medium">{viewRegDialog.display_name}</p></div>
                <div><p className="text-muted-foreground text-xs">Email</p><p className="font-medium">{viewRegDialog.email}</p></div>
                <div><p className="text-muted-foreground text-xs">Établissement</p><p className="font-medium">{viewRegDialog.establishment_name}</p></div>
                <div><p className="text-muted-foreground text-xs">Écrans</p><p className="font-medium">{viewRegDialog.num_screens}</p></div>
                {viewRegDialog.phone && <div><p className="text-muted-foreground text-xs">Téléphone</p><p className="font-medium">{viewRegDialog.phone}</p></div>}
                {viewRegDialog.address && <div><p className="text-muted-foreground text-xs">Adresse</p><p className="font-medium">{viewRegDialog.address}</p></div>}
                <div><p className="text-muted-foreground text-xs">Statut</p>{statusBadge(viewRegDialog.status)}</div>
                <div><p className="text-muted-foreground text-xs">Date</p><p className="font-medium">{new Date(viewRegDialog.created_at).toLocaleString("fr-FR")}</p></div>
              </div>
              {viewRegDialog.message && (
                <div><p className="text-muted-foreground text-xs mb-1">Message</p><p className="bg-secondary/50 rounded-md p-3">{viewRegDialog.message}</p></div>
              )}
              {viewRegDialog.rejection_reason && (
                <div><p className="text-muted-foreground text-xs mb-1">Raison du refus</p><p className="bg-destructive/10 text-destructive rounded-md p-3">{viewRegDialog.rejection_reason}</p></div>
              )}
              {viewRegDialog.reviewed_by && (
                <div><p className="text-muted-foreground text-xs">Traité par</p><p className="font-medium">{getAdminName(viewRegDialog.reviewed_by)} — {viewRegDialog.reviewed_at ? new Date(viewRegDialog.reviewed_at).toLocaleString("fr-FR") : ""}</p></div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewRegDialog(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit registration dialog */}
      <Dialog open={!!editRegDialog} onOpenChange={() => setEditRegDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" /> Modifier la demande</DialogTitle>
            <DialogDescription>Modifiez les informations de la demande d'inscription</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nom</label>
                <Input value={editRegForm.display_name} onChange={(e) => setEditRegForm({ ...editRegForm, display_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input value={editRegForm.email} onChange={(e) => setEditRegForm({ ...editRegForm, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Établissement</label>
                <Input value={editRegForm.establishment_name} onChange={(e) => setEditRegForm({ ...editRegForm, establishment_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Nb écrans</label>
                <Input type="number" min={1} value={editRegForm.num_screens} onChange={(e) => setEditRegForm({ ...editRegForm, num_screens: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Téléphone</label>
                <Input value={editRegForm.phone} onChange={(e) => setEditRegForm({ ...editRegForm, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Adresse</label>
                <Input value={editRegForm.address} onChange={(e) => setEditRegForm({ ...editRegForm, address: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Message</label>
              <Textarea value={editRegForm.message} onChange={(e) => setEditRegForm({ ...editRegForm, message: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRegDialog(null)}>Annuler</Button>
            <Button onClick={() => saveEditReg.mutate()} disabled={saveEditReg.isPending}>
              {saveEditReg.isPending ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View reset detail dialog */}
      <Dialog open={!!viewResetDialog} onOpenChange={() => setViewResetDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Search className="h-5 w-5" /> Détail de la demande</DialogTitle>
            <DialogDescription>Demande de réinitialisation</DialogDescription>
          </DialogHeader>
          {viewResetDialog && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-muted-foreground text-xs">Email</p><p className="font-medium">{viewResetDialog.email}</p></div>
                <div><p className="text-muted-foreground text-xs">Statut</p>{statusBadge(viewResetDialog.status)}</div>
                <div><p className="text-muted-foreground text-xs">Date de demande</p><p className="font-medium">{new Date(viewResetDialog.created_at).toLocaleString("fr-FR")}</p></div>
                {viewResetDialog.handled_by && (
                  <div><p className="text-muted-foreground text-xs">Traité par</p><p className="font-medium">{getAdminName(viewResetDialog.handled_by)}</p></div>
                )}
                {viewResetDialog.handled_at && (
                  <div><p className="text-muted-foreground text-xs">Date de traitement</p><p className="font-medium">{new Date(viewResetDialog.handled_at).toLocaleString("fr-FR")}</p></div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewResetDialog(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit reset dialog */}
      <Dialog open={!!editResetDialog} onOpenChange={() => setEditResetDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" /> Modifier la demande</DialogTitle>
            <DialogDescription>Modifiez l'email de la demande de réinitialisation</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input value={editResetEmail} onChange={(e) => setEditResetEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditResetDialog(null)}>Annuler</Button>
            <Button onClick={() => saveEditReset.mutate()} disabled={saveEditReset.isPending}>
              {saveEditReset.isPending ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
