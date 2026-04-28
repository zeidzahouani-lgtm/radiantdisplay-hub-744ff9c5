import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEBHOOK_URL =
  Deno.env.get("SUPPORT_DRAVOX_SCREENFLOW_WEBHOOK_URL") ||
  "https://okgmecbjvtmbzuyqwruu.supabase.co/functions/v1/receive-screenflow-data";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;

    let callerIsAdmin = isServiceRole;
    let callerUserId: string | null = null;

    if (!isServiceRole) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const anonClient = createClient(supabaseUrl, anonKey);
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
      const userIdFromToken = claimsData?.claims?.sub;
      if (claimsError || !userIdFromToken) {
        console.error("Auth claims error:", claimsError?.message, "token len:", token.length);
        throw new Error("Session expirée, veuillez vous reconnecter");
      }

      callerUserId = userIdFromToken;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleData } = await adminClient.from("user_roles").select("role" ).eq("user_id", callerUserId).eq("role", "admin");
      callerIsAdmin = !!(roleData && roleData.length > 0);
    }

    // Helper: check if caller is admin of an establishment that the target user belongs to as marketing
    const isCallerEstabAdminOfTarget = async (targetId: string): Promise<boolean> => {
      if (!callerUserId || !targetId) return false;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      // Get establishments where caller is admin
      const { data: callerAdminEstabs } = await adminClient
        .from("user_establishments")
        .select("establishment_id")
        .eq("user_id", callerUserId)
        .eq("role", "admin");
      const estabIds = (callerAdminEstabs || []).map((r: any) => r.establishment_id);
      if (estabIds.length === 0) return false;
      // Verify target belongs to one of these establishments
      const { data: targetMembership } = await adminClient
        .from("user_establishments")
        .select("establishment_id")
        .eq("user_id", targetId)
        .in("establishment_id", estabIds)
        .maybeSingle();
      if (!targetMembership) return false;
      // Verify target has marketing role (don't allow editing other admins)
      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", targetId);
      const roles = (targetRoles || []).map((r: any) => r.role);
      // Only allow editing marketing or plain user accounts (never admins)
      return !roles.includes("admin");
    };

    const payload = await req.json();
    const rawEmail = typeof payload?.email === "string" ? payload.email : "";
    const password = typeof payload?.password === "string" ? payload.password : "";
    const displayName = typeof payload?.display_name === "string" ? payload.display_name.trim() : "";
    const updatePassword = payload?.update_password === true;
    const updateProfileFlag = payload?.update_profile === true;
    const deleteUserFlag = payload?.delete_user === true;
    const deleteUserId = typeof payload?.user_id === "string" ? payload.user_id : "";
    const targetUserId = typeof payload?.user_id === "string" ? payload.user_id : "";
    const newEmailRaw = typeof payload?.new_email === "string" ? payload.new_email : "";
    const requestedRole = typeof payload?.role === "string" ? payload.role : null;
    const establishmentId = typeof payload?.establishment_id === "string" ? payload.establishment_id : null;

    const email = rawEmail.trim().toLowerCase();
    const newEmail = newEmailRaw.trim().toLowerCase();

    // ============ UPDATE PROFILE (display_name + email) ============
    if (updateProfileFlag) {
      if (!targetUserId) throw new Error("user_id required");
      if (!callerIsAdmin) {
        const allowed = await isCallerEstabAdminOfTarget(targetUserId);
        if (!allowed) throw new Error("Non autorisé");
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (newEmail && !emailRegex.test(newEmail)) {
        throw new Error("Format d'email invalide");
      }

      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      // Update auth user (email used for login) + metadata
      const authUpdate: Record<string, any> = {};
      if (newEmail) {
        authUpdate.email = newEmail;
        authUpdate.email_confirm = true;
      }
      if (displayName) {
        authUpdate.user_metadata = { display_name: displayName };
      }

      if (Object.keys(authUpdate).length > 0) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(targetUserId, authUpdate);
        if (authErr) throw authErr;
      }

      // Sync profiles table
      const profileUpdate: Record<string, any> = {};
      if (newEmail) profileUpdate.email = newEmail;
      if (displayName) profileUpdate.display_name = displayName;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profErr } = await adminClient.from("profiles").update(profileUpdate).eq("id", targetUserId);
        if (profErr) throw profErr;
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ DELETE USER ============
    if (deleteUserFlag) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      let resolvedTargetId = deleteUserId;
      if (!resolvedTargetId && email) {
        const { data: profile } = await adminClient.from("profiles").select("id").eq("email", email).maybeSingle();
        if (profile) resolvedTargetId = profile.id;
      }
      if (!resolvedTargetId) throw new Error("Utilisateur introuvable: ID ou email requis");

      if (!callerIsAdmin) {
        const allowed = await isCallerEstabAdminOfTarget(resolvedTargetId);
        if (!allowed) throw new Error("Non autorisé");
      }

      await adminClient.from("user_establishments").delete().eq("user_id", resolvedTargetId);
      await adminClient.from("user_roles").delete().eq("user_id", resolvedTargetId);
      await adminClient.from("profiles").delete().eq("id", resolvedTargetId);

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(resolvedTargetId);
      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true, deleted: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!email || !password) throw new Error("Email and password required");
    if (password.length < 8) throw new Error("Le mot de passe doit contenir au moins 8 caractères");
    if (!/[A-Z]/.test(password)) throw new Error("Le mot de passe doit contenir au moins une majuscule");
    if (!/[a-z]/.test(password)) throw new Error("Le mot de passe doit contenir au moins une minuscule");
    if (!/[0-9]/.test(password)) throw new Error("Le mot de passe doit contenir au moins un chiffre");
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) throw new Error("Le mot de passe doit contenir au moins un symbole");

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) throw new Error("Invalid email format");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (updatePassword) {
      if (!callerIsAdmin) {
        if (!targetUserId) throw new Error("user_id requis");
        const allowed = await isCallerEstabAdminOfTarget(targetUserId);
        if (!allowed) throw new Error("Non autorisé");
      }

      let pwUserId = targetUserId;
      if (!pwUserId) {
        const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
        if (listError) throw listError;
        const targetUser = users.find((u: any) => (u.email || "").toLowerCase() === email);
        if (!targetUser) throw new Error("Utilisateur introuvable");
        pwUserId = targetUser.id;
      }

      const { error: updateError } = await adminClient.auth.admin.updateUserById(pwUserId, {
        password,
      });
      if (updateError) throw updateError;

      try {
        const webhookSecret = Deno.env.get("DEVIS_WEBHOOK_SECRET");
        if (webhookSecret) {
          await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": webhookSecret,
            },
            body: JSON.stringify({
              type: "vault",
              nom: "ScreenFlow",
              client_email: email,
              type_equipement: "serveur",
              adresse_ip: "screenflow-ds.com",
              port: "443",
              protocole: "HTTPS",
              identifiant: email,
              mot_de_passe: password,
              notes: `Compte ScreenFlow`,
            }),
          });
        }
      } catch (syncErr) {
        console.error("Vault password update sync failed:", syncErr);
      }

      return new Response(JSON.stringify({ success: true, user_id: pwUserId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === Non-admin users can only create marketing accounts for their establishment ===
    if (!callerIsAdmin) {
      if (requestedRole !== "marketing") {
        throw new Error("Seuls les comptes marketing peuvent être créés par un utilisateur non-admin");
      }
      if (!establishmentId || !callerUserId) {
        throw new Error("Établissement requis pour créer un compte marketing");
      }
      // Verify caller is member of this establishment
      const { data: membership } = await adminClient
        .from("user_establishments")
        .select("id")
        .eq("user_id", callerUserId)
        .eq("establishment_id", establishmentId)
        .maybeSingle();
      if (!membership) {
        throw new Error("Vous n'êtes pas membre de cet établissement");
      }
    }

    // Create new user
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName || email.split("@")[0] },
    });

    if (error) throw error;

    // If a specific role is requested (e.g. marketing), update the role
    if (requestedRole === "marketing" && data.user) {
      await adminClient.from("user_roles").update({ role: requestedRole }).eq("user_id", data.user.id);
    }

    // If establishment_id provided, assign the new user to it
    if (establishmentId && data.user) {
      await adminClient.from("user_establishments").insert({
        user_id: data.user.id,
        establishment_id: establishmentId,
        role: "member",
      });
    }

    // Sync to support-dravox via webhook (fire and forget)
    try {
      const webhookSecret = Deno.env.get("DEVIS_WEBHOOK_SECRET");
      if (webhookSecret) {
        await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": webhookSecret,
          },
          body: JSON.stringify({
            type: "client",
            nom: displayName || email.split("@")[0],
            email,
          }),
        });

        await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": webhookSecret,
          },
          body: JSON.stringify({
            type: "vault",
            nom: "ScreenFlow",
            client_email: email,
            type_equipement: "serveur",
            adresse_ip: "screenflow-ds.com",
            port: "443",
            protocole: "HTTPS",
            identifiant: email,
            mot_de_passe: password,
            notes: `Compte ScreenFlow`,
          }),
        });
      }
    } catch (syncErr) {
      console.error("Sync to support-dravox failed:", syncErr);
    }

    return new Response(JSON.stringify({ user: data.user }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
