import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WEBHOOK_URL =
  Deno.env.get("SUPPORT_DRAVOX_SCREENFLOW_WEBHOOK_URL") ||
  "https://okgmecbjvtmbzuyqwruu.supabase.co/functions/v1/receive-screenflow-data";

async function checkClientExists(webhookSecret: string, email?: string, nom?: string): Promise<boolean> {
  try {
    const payload: Record<string, string> = { type: "check_client" };
    if (email) {
      payload.email = email;
    } else if (nom) {
      payload.nom = nom;
    } else {
      return false;
    }

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success && (data.action === "updated" || data.exists === true)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

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
    const webhookSecret = Deno.env.get("DEVIS_WEBHOOK_SECRET");

    if (!webhookSecret) throw new Error("DEVIS_WEBHOOK_SECRET not configured");

    // Auth check
    const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
    if (!isServiceRole) {
      const callerClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await callerClient.auth.getUser();
      if (userError || !userData?.user) throw new Error("Not authenticated");

      const userId = userData.user.id;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleData } = await adminClient.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
      if (!roleData || roleData.length === 0) throw new Error("Not admin");
    }

    const { users, establishments, mode } = await req.json();

    // ============ CHECK MODE ============
    // Verify which emails/establishments are already synced (without creating/updating)
    if (mode === "check") {
      const syncedEmails: string[] = [];
      const syncedEstablishments: string[] = [];

      // Check users by email
      if (Array.isArray(users) && users.length > 0) {
        for (const u of users) {
          if (!u.email) continue;
          const exists = await checkClientExists(webhookSecret, u.email);
          if (exists) syncedEmails.push(u.email);
        }
      }

      // Check establishments by email or name
      if (Array.isArray(establishments) && establishments.length > 0) {
        for (const est of establishments) {
          if (!est.name) continue;
          const estEmail = est.email || "";
          const exists = await checkClientExists(webhookSecret, estEmail || undefined, est.name);
          if (exists) syncedEstablishments.push(est.name);
        }
      }

      return new Response(JSON.stringify({ success: true, syncedEmails, syncedEstablishments }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============ SYNC MODE ============
    const results: any[] = [];

    // 1. Sync establishments as clients
    if (Array.isArray(establishments) && establishments.length > 0) {
      for (const est of establishments) {
        if (!est.name) continue;

        // Use email or generate a placeholder
        const estEmail = est.email || "";

        // Check if establishment already exists (by email or by name)
        const exists = await checkClientExists(webhookSecret, estEmail || undefined, est.name);
        if (exists) {
          results.push({ type: "establishment", name: est.name, action: "already_synced" });
          continue;
        }

        try {
          const res = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": webhookSecret,
            },
            body: JSON.stringify({
              type: "client",
              nom: est.name,
              societe: est.name,
              email: estEmail,
              telephone: est.phone || "",
              adresse: est.address || "",
              notes: `Établissement ScreenFlow`,
            }),
          });
          const data = await res.json();
          results.push({ type: "establishment", name: est.name, action: data.action || "synced" });
        } catch (err) {
          results.push({ type: "establishment", name: est.name, action: "error", error: String(err) });
        }
      }
    }

    // 2. Sync users (skip already synced ones)
    if (Array.isArray(users) && users.length > 0) {
      for (const u of users) {
        if (!u.email) continue;

        // Check if this user/client already exists on Dravox
        const exists = await checkClientExists(webhookSecret, u.email);
        if (exists) {
          results.push({ type: "user", email: u.email, action: "already_synced" });
          continue;
        }

        // Create client
        try {
          const res = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-webhook-secret": webhookSecret,
            },
            body: JSON.stringify({
              type: "client",
              nom: u.display_name || u.email.split("@")[0],
              email: u.email,
              societe: u.establishment_name || "",
              telephone: "",
              adresse: "",
              notes: `Compte ScreenFlow - ${u.establishment_name || ""}`.trim(),
            }),
          });
          const data = await res.json();
          results.push({ type: "user", email: u.email, action: data.action || "created" });

          // Also create vault entry for new users
          try {
            await fetch(WEBHOOK_URL, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-webhook-secret": webhookSecret,
              },
              body: JSON.stringify({
                type: "vault",
                nom: "ScreenFlow",
                client_email: u.email,
                type_equipement: "serveur",
                adresse_ip: "screenflow-ds.com",
                port: "443",
                protocole: "HTTPS",
                identifiant: u.email,
                mot_de_passe: "",
                notes: `Compte ScreenFlow`,
              }),
            });
          } catch {
            // vault error non-blocking
          }
        } catch (err) {
          results.push({ type: "user", email: u.email, action: "error", error: String(err) });
        }
      }
    }

    const created = results.filter(r => r.action === "created").length;
    const skipped = results.filter(r => r.action === "already_synced").length;
    const errors = results.filter(r => r.action === "error").length;

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      summary: { created, skipped, errors, total: results.length }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
