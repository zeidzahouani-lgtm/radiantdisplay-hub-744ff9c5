// Edge function: admin-diagnostics
// Reports RLS status, policies and storage buckets for the project.
// Restricted to authenticated admin users.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Client as PgClient } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DB_URL = Deno.env.get("SUPABASE_DB_URL") || Deno.env.get("DATABASE_URL") || "";

const TARGETS = [
  { schema: "public", table: "screens" },
  { schema: "storage", table: "objects" },
];

const tuple = TARGETS.map((t) => `('${t.schema}','${t.table}')`).join(",");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!DB_URL) {
      throw new Error("SUPABASE_DB_URL/DATABASE_URL absent dans l'environnement de la fonction admin-diagnostics");
    }
    const pg = new PgClient(DB_URL);
    await pg.connect();

    let tables: any[] = [];
    let policies: any[] = [];
    let buckets: any[] = [];
    let counts: any[] = [];
    let storagePolicies: any[] = [];

    try {
      const tRes = await pg.queryObject<any>(
        `select n.nspname as schema, c.relname as "table",
                c.relrowsecurity as rls_enabled,
                c.relforcerowsecurity as rls_forced
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where (n.nspname, c.relname) in (${tuple})`,
      );
      tables = tRes.rows;

      const pRes = await pg.queryObject<any>(
        `select schemaname as schema, tablename as "table", policyname, cmd,
                array_to_string(roles, ',') as roles,
                coalesce(qual::text, '') as using_expr,
                coalesce(with_check::text, '') as check_expr,
                permissive
         from pg_policies
         where (schemaname, tablename) in (${tuple})
         order by schemaname, tablename, policyname`,
      );
      policies = pRes.rows;

      const bRes = await pg.queryObject<any>(
        `select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at
         from storage.buckets order by name`,
      );
      buckets = bRes.rows;

      const cRes = await pg.queryObject<any>(
        `select 'public.screens' as label, count(*)::int as n from public.screens
         union all
         select 'storage.objects', count(*)::int from storage.objects`,
      );
      counts = cRes.rows;
    } finally {
      try { await pg.end(); } catch { /* noop */ }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        checked_at: new Date().toISOString(),
        tables,
        policies,
        buckets,
        counts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
