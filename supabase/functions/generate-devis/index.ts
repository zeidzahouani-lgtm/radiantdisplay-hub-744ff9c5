const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPPORT_DRAVOX_WEBHOOK_URL =
  Deno.env.get("SUPPORT_DRAVOX_DEVIS_WEBHOOK_URL") ||
  "https://okgmecbjvtmbzuyqwruu.supabase.co/functions/v1/receive-devis-webhook";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get("DEVIS_WEBHOOK_SECRET")?.trim();
    if (!webhookSecret) {
      throw new Error("DEVIS_WEBHOOK_SECRET is not configured");
    }

    const body = await req.json();
    const {
      display_name,
      email,
      establishment_name,
      num_screens,
      phone,
      address,
      matricule_fiscal,
      registre_commerce,
      code_tva,
      code_categorie,
      secteur_activite,
    } = body;

    // Send webhook to support-dravox
    const webhookPayload = {
      display_name,
      email,
      establishment_name,
      num_screens,
      phone: phone || "",
      address: address || "",
      matricule_fiscal: matricule_fiscal || "",
      registre_commerce: registre_commerce || "",
      code_tva: code_tva || "",
      code_categorie: code_categorie || "",
      secteur_activite: secteur_activite || "",
    };

    const response = await fetch(SUPPORT_DRAVOX_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": webhookSecret,
      },
      body: JSON.stringify(webhookPayload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || `Webhook failed with status ${response.status}`);
    }

    return new Response(
      JSON.stringify({ success: true, devis_id: result.devis_id, numero: result.numero }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error generating devis:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
