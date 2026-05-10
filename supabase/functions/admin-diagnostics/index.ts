// Edge function: admin-diagnostics
// Reports RLS status, policies and storage buckets for the project.
// Restricted to authenticated admin users.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

interface Target {
  schema: string;
  table: string;
}

const TARGETS: Target[] = [
  { schema: "public", table: "screens" },
  { schema: "storage", table: "objects" },
];

async function pgQuery<T = any>(admin: ReturnType<typeof createClient>, sql: string): Promise<T[]> {
  // Use PostgREST direct call via /rest/v1/rpc/_exec_sql — not available.
  // Instead, use the underlying fetch with the SQL query through pg-meta endpoint.
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`pg query failed (${res.status}): ${await res.text()}`);
  return await res.json();
}

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Tables RLS status
    const rlsRows = await pgQuery(
      admin,
      `select n.nspname as schema, c.relname as table, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where (n.nspname, c.relname) in (${TARGETS.map((t) => `('${t.schema}','${t.table}')`).join(",")})`,
    );

    // Policies
    const policyRows = await pgQuery(
      admin,
      `select schemaname as schema, tablename as table, policyname, cmd, roles::text as roles,
              coalesce(qual, '') as using_expr, coalesce(with_check, '') as check_expr, permissive
       from pg_policies
       where (schemaname, tablename) in (${TARGETS.map((t) => `('${t.schema}','${t.table}')`).join(",")})
       order by schemaname, tablename, policyname`,
    );

    // Storage buckets
    const bucketRows = await pgQuery(
      admin,
      `select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at
       from storage.buckets order by name`,
    );

    // Counts (sanity)
    const counts = await pgQuery(
      admin,
      `select 'public.screens' as label, count(*)::int as n from public.screens
       union all
       select 'storage.objects', count(*)::int from storage.objects`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        checked_at: new Date().toISOString(),
        tables: rlsRows,
        policies: policyRows,
        buckets: bucketRows,
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
