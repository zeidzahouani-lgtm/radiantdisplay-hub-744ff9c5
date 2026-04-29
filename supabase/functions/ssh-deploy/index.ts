// SSH deploy: connect to a Linux server with ip/user/password, install Docker if needed,
// upload project archive, build & run via docker compose.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const ssh2Mod: any = await import("npm:ssh2@1.15.0");
const Client: any = ssh2Mod.Client ?? ssh2Mod.default?.Client;
type Client = any;
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DeployBody {
  // Action: "deploy" (default), "reset_admin_password", or "check_admin_status" (read-only diagnostic)
  action?: "deploy" | "reset_admin_password" | "check_admin_status";
  // Optional override for the admin password to set during reset (defaults to 260390DS)
  admin_password?: string;
  host: string;
  port?: number;
  username: string;
  password: string;
  remote_dir?: string;
  app_port?: string;
  install_docker?: boolean;
  vite_supabase_url?: string;
  vite_supabase_key?: string;
  vite_supabase_project_id?: string;
  // Git source (cloned on the server)
  git_url: string;            // e.g. https://github.com/user/repo.git
  git_branch?: string;        // default: main
  git_token?: string;         // optional PAT for private repos
  enable_https?: boolean;
  https_port?: string;
  https_domain?: string;
  // Local self-hosted Supabase (optional)
  install_supabase_local?: boolean;
  supabase_kong_http_port?: string;   // public REST/Auth gateway (default 8000)
  supabase_studio_port?: string;      // Supabase Studio UI (default 3000)
  supabase_db_port?: string;          // Postgres (default 5432)
}

function ssh(opts: { host: string; port: number; username: string; password: string }): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on("ready", () => resolve(conn))
      .on("keyboard-interactive", (_name: any, _instructions: any, _lang: any, prompts: any, finish: any) => {
        // Some servers (PAM) require keyboard-interactive even when password is enabled
        finish(prompts.map(() => opts.password));
      })
      .on("error", (err: Error) => {
        const msg = err.message || String(err);
        if (/All configured authentication methods failed/i.test(msg)) {
          reject(new Error(
            `Échec d'authentification SSH pour '${opts.username}@${opts.host}:${opts.port}'. ` +
            `Causes possibles : (1) mot de passe incorrect ; ` +
            `(2) le serveur refuse l'authentification par mot de passe — vérifiez '/etc/ssh/sshd_config' : ` +
            `'PasswordAuthentication yes' et (si vous utilisez root) 'PermitRootLogin yes', puis 'systemctl restart sshd' ; ` +
            `(3) le serveur n'autorise que les clés SSH. Essayez avec un autre utilisateur (ex: un user sudo non-root) ou activez le mot de passe.`
          ));
        } else {
          reject(err);
        }
      })
      .connect({
        host: opts.host,
        port: opts.port,
        username: opts.username,
        password: opts.password,
        readyTimeout: 20000,
        tryKeyboard: true,
      });
  });
}

function exec(conn: Client, cmd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err: any, stream: any) => {
      if (err) return reject(err);
      let stdout = "";
      let stderr = "";
      stream
        .on("close", (code: number) => resolve({ code: code ?? 0, stdout, stderr }))
        .on("data", (d: Buffer) => (stdout += d.toString()))
        .stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    });
  });
}

function uploadFile(conn: Client, remotePath: string, content: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.sftp((err: any, sftp: any) => {
      if (err) return reject(err);
      const stream = sftp.createWriteStream(remotePath);
      stream.on("close", () => resolve());
      stream.on("error", (e: Error) => reject(e));
      stream.end(content);
    });
  });
}

const DEFAULT_ADMIN_EMAIL = "screenflow@screenflow.local";
const DEFAULT_ADMIN_PASSWORD = "260390DS";

const shQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

function dockerPsql(connDir: string, sqlB64: string, onErrorStop = true) {
  const psql = `PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=${onErrorStop ? 1 : 0}`;
  return `cd ${connDir} && printf '%s' '${sqlB64}' | base64 -d | docker compose exec -T --user postgres db sh -lc ${shQuote(psql)} 2>&1`;
}

function dockerPsqlSelect(connDir: string, sql: string, silent = true) {
  const sqlB64 = btoa(sql);
  const psql = `PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U postgres -d postgres -At -c "$(printf '%s' '${sqlB64}' | base64 -d)"`;
  return `cd ${connDir} && docker compose exec -T --user postgres db sh -lc ${shQuote(psql)}${silent ? " 2>/dev/null || true" : " 2>&1"}`;
}

interface RemotePreflightResult {
  dockerOk: boolean;
  composeOk: boolean;
  freeMb: number;
  nodeMajor: number | null;
  postgresMajor: number | null;
}

function parseMajorVersion(output: string, marker: RegExp): number | null {
  const match = output.match(marker);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function runRemotePreflight(
  conn: Client,
  body: DeployBody,
  remoteDir: string,
  installSupabase: boolean,
  log: (m: string) => Promise<void> | void,
): Promise<RemotePreflightResult> {
  await log("→ Pré-vérification serveur : Docker, espace disque, Node/Postgres…");

  const dockerCheck = await exec(conn, "command -v docker >/dev/null 2>&1 && docker --version && (docker info >/dev/null 2>&1 && echo DOCKER_READY || echo DOCKER_DAEMON_UNAVAILABLE) || echo MISSING");
  const dockerOutput = `${dockerCheck.stdout}${dockerCheck.stderr}`.trim();
  const dockerOk = dockerOutput.includes("DOCKER_READY") && dockerCheck.code === 0;
  await log(dockerOk ? `✓ Docker disponible : ${dockerOutput.replace("DOCKER_READY", "").trim()}` : `✗ Docker indisponible ou daemon inaccessible : ${dockerOutput}`);

  const composeCheck = await exec(conn, "(docker compose version || docker-compose --version) 2>&1 || echo MISSING");
  const composeOutput = `${composeCheck.stdout}${composeCheck.stderr}`.trim();
  const composeOk = !composeOutput.includes("MISSING");
  await log(composeOk ? `✓ Docker Compose disponible : ${composeOutput.split("\n").slice(-1)[0]}` : "✗ Docker Compose indisponible");

  const diskCheck = await exec(conn, `mkdir -p ${remoteDir} 2>/dev/null || true; (df -Pm ${remoteDir} 2>/dev/null || df -Pm $(dirname ${remoteDir}) 2>/dev/null || df -Pm /) | awk 'NR==2{print $4"|"$5"|"$6}'`);
  const diskLine = (diskCheck.stdout || "").trim().split("\n").pop() || "0||";
  const [freeRaw, usedPctRaw, mountRaw] = diskLine.split("|");
  const freeMb = Number.parseInt(freeRaw || "0", 10) || 0;
  const minFreeMb = installSupabase ? 8192 : 2048;
  await log(`✓ Espace disque libre : ${Math.round(freeMb / 1024)} Go sur ${mountRaw || remoteDir} (${usedPctRaw || "?"} utilisé)`);
  if (freeMb < minFreeMb) {
    throw new Error(`Espace disque insuffisant : ${Math.round(freeMb / 1024)} Go libres, minimum requis ${Math.round(minFreeMb / 1024)} Go.`);
  }

  const nodeCheck = await exec(conn, "command -v node >/dev/null 2>&1 && node --version || echo MISSING");
  const nodeOutput = `${nodeCheck.stdout}${nodeCheck.stderr}`.trim();
  const nodeMajor = parseMajorVersion(nodeOutput, /v(\d+)/);
  if (nodeMajor === null) {
    await log("⚠ Node.js absent sur l'hôte — OK, le build utilise Node 20 dans Docker.");
  } else if (nodeMajor < 18) {
    await log(`⚠ Node.js hôte ancien (${nodeOutput}) — OK pour Docker, mais Node 18+ est recommandé.`);
  } else {
    await log(`✓ Node.js hôte : ${nodeOutput}`);
  }

  const pgCheck = await exec(conn, "(command -v psql >/dev/null 2>&1 && psql --version) || (command -v postgres >/dev/null 2>&1 && postgres --version) || echo MISSING");
  const pgOutput = `${pgCheck.stdout}${pgCheck.stderr}`.trim();
  const postgresMajor = parseMajorVersion(pgOutput, /(?:PostgreSQL\)|postgres)\s+(\d+)/i);
  if (postgresMajor === null) {
    await log("⚠ Postgres absent sur l'hôte — OK, la base locale utilise Postgres dans Docker.");
  } else if (postgresMajor < 15) {
    await log(`⚠ Postgres hôte ancien (${pgOutput}) — Postgres 15+ recommandé si vous utilisez une base hors Docker.`);
  } else {
    await log(`✓ Postgres hôte : ${pgOutput}`);
  }

  if ((!dockerOk || !composeOk) && !body.install_docker) {
    throw new Error("Docker ou Docker Compose manque. Activez 'Auto-installer Docker' ou installez-les avant le déploiement.");
  }

  return { dockerOk, composeOk, freeMb, nodeMajor, postgresMajor };
}

async function handleAnalyticsUnhealthy(conn: Client, supaDir: string, log: (m: string) => Promise<void> | void) {
  const ps = await exec(conn, `cd ${supaDir} && docker compose ps -a 2>&1 || true`);
  const psOutput = `${ps.stdout}${ps.stderr}`;
  if (!/supabase-analytics|analytics/i.test(psOutput) || !/unhealthy|Exit|Restarting/i.test(psOutput)) return;

  await log("⚠ supabase-analytics est unhealthy. Service non critique : diagnostic puis arrêt…");
  const logs = await exec(conn, `cd ${supaDir} && docker compose logs --tail=80 analytics 2>&1 || true`);
  await log((`${logs.stdout}${logs.stderr}`).slice(-1600));
  await exec(conn, `cd ${supaDir} && docker compose stop analytics vector 2>&1 || true`);
  await exec(conn, `cd ${supaDir} && docker compose rm -f analytics vector 2>&1 || true`);
}

/**
 * Le docker-compose.yml officiel Supabase déclare:
 *   kong/auth/storage/rest/realtime/meta:
 *     depends_on:
 *       analytics: { condition: service_healthy }
 * Si analytics (Logflare) est unhealthy, RIEN ne démarre.
 * On neutralise une fois pour toutes : on retire le bloc analytics des depends_on
 * et on commente le service analytics + vector. Idempotent (sentinelle).
 */
async function patchComposeRemoveAnalytics(conn: Client, supaDir: string, log: (m: string) => Promise<void> | void) {
  const sentinel = "# LOVABLE_NO_ANALYTICS_PATCH_V2";
  const composePath = `${supaDir}/docker-compose.yml`;

  // 0) Si un patch précédent (V1 regex) a corrompu le fichier, restaurer le backup le plus ancien
  const validate = await exec(conn, `docker compose -f ${composePath} config --quiet 2>&1; echo EXIT=$?`);
  const validOut = `${validate.stdout}${validate.stderr}`;
  if (/EXIT=[^0]/.test(validOut) || /yaml:|mapping key.*already defined|failed to parse/i.test(validOut)) {
    await log("⚠ docker-compose.yml invalide détecté — restauration depuis backup…");
    const restore = await exec(
      conn,
      `set -e; bak=$(ls -1t ${composePath}.bak.* 2>/dev/null | tail -1); ` +
      `if [ -n "$bak" ]; then cp "$bak" ${composePath} && echo "RESTORED=$bak"; else echo NO_BACKUP; fi`
    );
    await log((`${restore.stdout}${restore.stderr}`).slice(-400));
    if (/NO_BACKUP/.test(restore.stdout)) {
      // Aucun backup -> recloner depuis git
      await log("→ Aucun backup — réinitialisation via git checkout du compose…");
      await exec(conn, `cd ${supaDir} && git checkout -- docker-compose.yml 2>&1 || true`);
    }
  }

  const check = await exec(conn, `grep -q '${sentinel}' ${composePath} && echo PATCHED || echo TODO`);
  if (/PATCHED/.test(check.stdout)) {
    await log("✓ docker-compose déjà patché (analytics désactivé).");
    return;
  }

  await log("→ Patch docker-compose.yml via PyYAML (suppression dépendance analytics)…");
  await exec(conn, `cp ${composePath} ${composePath}.bak.$(date +%s) 2>&1 || true`);

  // Assurer la présence de PyYAML (silencieux)
  await exec(conn, `python3 -c "import yaml" 2>/dev/null || (apt-get install -y python3-yaml 2>/dev/null || pip3 install --quiet pyyaml 2>/dev/null) || true`);

  // Script Python utilisant PyYAML : supprime UNIQUEMENT les entrées "analytics" dans depends_on
  const py = `
import sys, pathlib, yaml
p = pathlib.Path("${composePath}")
data = yaml.safe_load(p.read_text())
services = data.get("services", {}) if isinstance(data, dict) else {}
changed = 0
for name, svc in list(services.items()):
    if not isinstance(svc, dict):
        continue
    dep = svc.get("depends_on")
    if isinstance(dep, dict) and "analytics" in dep:
        dep.pop("analytics", None)
        changed += 1
        if not dep:
            svc.pop("depends_on", None)
    elif isinstance(dep, list) and "analytics" in dep:
        svc["depends_on"] = [d for d in dep if d != "analytics"]
        changed += 1
        if not svc["depends_on"]:
            svc.pop("depends_on", None)
out = "${sentinel}\\n" + yaml.safe_dump(data, sort_keys=False, default_flow_style=False, width=4096)
p.write_text(out)
print("OK changed=%d" % changed)
`;
  const enc = btoa(unescape(encodeURIComponent(py)));
  const run = await exec(conn, `echo '${enc}' | base64 -d | python3 - 2>&1`);
  await log((`${run.stdout}${run.stderr}`).slice(-600));

  // Validation finale du YAML
  const verify = await exec(conn, `docker compose -f ${composePath} config --quiet 2>&1; echo EXIT=$?`);
  const verifyOut = `${verify.stdout}${verify.stderr}`;
  if (!/EXIT=0/.test(verifyOut)) {
    await log("⚠ Validation compose échouée après patch — restauration backup.");
    await exec(conn, `bak=$(ls -1t ${composePath}.bak.* | head -1); [ -n "$bak" ] && cp "$bak" ${composePath} || true`);
    throw new Error("Patch docker-compose invalide : " + verifyOut.slice(-400));
  }
  await log("✓ docker-compose.yml patché et validé.");
}

async function patchKongKeyauthCredentials(conn: Client, supaDir: string, log: (m: string) => Promise<void> | void) {
  const sentinel = "# LOVABLE_KONG_DEDUPE_KEYAUTH_V1";
  const kongPath = `${supaDir}/volumes/api/kong.yml`;
  const check = await exec(conn, `[ -f ${kongPath} ] && (grep -q '${sentinel}' ${kongPath} && echo PATCHED || echo TODO) || echo MISSING`);
  if (/MISSING/.test(check.stdout)) return;
  if (/PATCHED/.test(check.stdout)) {
    await log("✓ kong.yml déjà patché (clés Auth dédupliquées).");
    return;
  }

  await log("→ Patch kong.yml (suppression des clés Auth dupliquées)…");
  await exec(conn, `cp ${kongPath} ${kongPath}.bak.$(date +%s) 2>&1 || true`);
  const py = `
import pathlib, re
p = pathlib.Path("${kongPath}")
lines = p.read_text().splitlines()
out = ["${sentinel}"]
seen_keys = set()
removed = 0
for line in lines:
    if line.strip() == "${sentinel}":
        continue
    if re.search(r'-\\s+key:\\s*\\$SUPABASE_(PUBLISHABLE_KEY|SECRET_KEY)\\s*$', line):
        removed += 1
        continue
    m = re.match(r'^(\\s*-\\s+key:\\s*)(.+?)\\s*$', line)
    if m:
        key = m.group(2).strip().strip('"\\'')
        if key and not key.startswith('$'):
            if key in seen_keys:
                removed += 1
                continue
            seen_keys.add(key)
    out.append(line)
p.write_text("\\n".join(out) + "\\n")
print(f"OK removed={removed}")
`;
  const enc = btoa(unescape(encodeURIComponent(py)));
  const run = await exec(conn, `echo '${enc}' | base64 -d | python3 - 2>&1`);
  await log((`${run.stdout}${run.stderr}`).slice(-600));
  await exec(conn, `cd ${supaDir} && docker compose rm -sf kong 2>&1 || true`);
}

async function startLocalSupabaseEssentials(conn: Client, supaDir: string, log: (m: string) => Promise<void> | void) {
  // 0) Patcher le compose pour retirer la dépendance bloquante sur analytics
  await patchComposeRemoveAnalytics(conn, supaDir, log);
  await patchKongKeyauthCredentials(conn, supaDir, log);

  const services = await exec(conn, `cd ${supaDir} && docker compose config --services 2>/dev/null || true`);
  const available = new Set((services.stdout || "").split(/\s+/).filter(Boolean));
  const essentialServices = ["db", "kong", "auth", "rest", "realtime", "storage", "meta", "imgproxy", "functions", "edge-runtime"].filter((name) => available.has(name)).join(" ");
  const optionalServices = ["studio"].filter((name) => available.has(name)).join(" ");

  // S'assurer qu'analytics/vector ne tournent pas et ne bloquent rien
  await exec(conn, `cd ${supaDir} && docker compose stop analytics vector 2>&1 || true`);
  await exec(conn, `cd ${supaDir} && docker compose rm -f analytics vector 2>&1 || true`);

  const pull = await exec(conn, `cd ${supaDir} && docker compose pull ${essentialServices} ${optionalServices} 2>&1 | tail -80 || true`);
  await log((`${pull.stdout}${pull.stderr}`).slice(-1800));

  const upEssential = await exec(conn, `cd ${supaDir} && docker compose up -d ${essentialServices} 2>&1`);
  const essentialOutput = `${upEssential.stdout}${upEssential.stderr}`;
  await log(essentialOutput.slice(-2400));

  if (upEssential.code !== 0) {
    // Dernier recours : démarrer un par un, sans dépendances
    await log("⚠ Échec démarrage groupé — tentative service par service (--no-deps)…");
    const ordered = ["db", "kong", "rest", "auth", "storage", "meta", "realtime", "imgproxy", "functions", "edge-runtime"].filter((s) => available.has(s));
    let lastOut = "";
    for (const svc of ordered) {
      const r = await exec(conn, `cd ${supaDir} && docker compose up -d --no-deps ${svc} 2>&1`);
      lastOut = `${r.stdout}${r.stderr}`;
      await log(`[${svc}] ${lastOut.slice(-300)}`);
    }
    // Vérifier que kong est up
    const psKong = await exec(conn, `cd ${supaDir} && docker compose ps kong 2>&1 || true`);
    if (!/Up|running/i.test(psKong.stdout)) {
      throw new Error("Échec du démarrage des services essentiels Supabase local : " + (lastOut || essentialOutput).slice(-900));
    }
  }

  if (optionalServices) {
    const optional = await exec(conn, `cd ${supaDir} && docker compose up -d --no-deps ${optionalServices} 2>&1 || true`);
    const optionalOutput = `${optional.stdout}${optional.stderr}`;
    if (optionalOutput.trim()) await log(optionalOutput.slice(-800));
  }

  await handleAnalyticsUnhealthy(conn, supaDir, log);
}

async function ensureLocalApiServices(conn: Client, supaDir: string, kongPort: string, anonKey: string, log: (m: string) => Promise<void> | void) {
  await log("→ Vérification REST/Storage/Realtime derrière la gateway locale…");
  const probeCmd =
    `ANON=${shQuote(anonKey)} sh -c ` +
    shQuote(
      `for i in $(seq 1 45); do ` +
      `rest=$(curl -sS -m 5 -o /tmp/sf_rest.txt -w "%{http_code}" "http://127.0.0.1:${kongPort}/rest/v1/establishments?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" 2>/dev/null || true); ` +
      `stor=$(curl -sS -m 5 -o /tmp/sf_storage.txt -w "%{http_code}" "http://127.0.0.1:${kongPort}/storage/v1/bucket" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" 2>/dev/null || true); ` +
      `case "$rest:$stor" in 2*:2*|2*:401|2*:403|401:2*|403:2*|401:401|401:403|403:401|403:403) echo "OK rest=$rest storage=$stor"; exit 0;; esac; ` +
      `echo "WAIT rest=$rest storage=$stor"; sleep 2; done; ` +
      `echo FAIL; echo REST_BODY; cat /tmp/sf_rest.txt 2>/dev/null || true; echo STORAGE_BODY; cat /tmp/sf_storage.txt 2>/dev/null || true`
    );
  let probe = await exec(conn, probeCmd);
  let output = `${probe.stdout}${probe.stderr}`;
  if (probe.code === 0 && /OK rest=/.test(output)) {
    await log(`✓ Services locaux joignables (${output.match(/OK rest=.*$/m)?.[0] || "OK"})`);
    return;
  }

  await log("⚠ REST/Storage répondent mal (souvent HTTP 503). Redémarrage ciblé des services locaux…");
  const restart = await exec(conn, `cd ${supaDir} && docker compose up -d db rest storage realtime auth kong 2>&1 && docker compose restart rest storage realtime kong 2>&1 || true`);
  await log((`${restart.stdout}${restart.stderr}`).slice(-1600));
  probe = await exec(conn, probeCmd);
  output = `${probe.stdout}${probe.stderr}`;
  if (!(probe.code === 0 && /OK rest=/.test(output))) {
    const ps = await exec(conn, `cd ${supaDir} && docker compose ps && docker compose logs --tail=80 rest storage realtime kong 2>&1 || true`);
    throw new Error(
      "La gateway locale répond mais REST/Storage restent indisponibles. " +
      "Cela provoque les HTTP 503 vus dans /admin/health. Détails: " +
      `${output}\n${ps.stdout}${ps.stderr}`.slice(-2500)
    );
  }
  await log(`✓ Services locaux réparés (${output.match(/OK rest=.*$/m)?.[0] || "OK"})`);
}

async function verifyAuthLoginFromServer(
  conn: Client,
  authBaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
  log: (m: string) => Promise<void> | void,
  fallbackCommand?: string,
) {
  const payloadB64 = btoa(JSON.stringify({ email, password }));
  const command =
    `AUTH_URL=${shQuote(`${authBaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`)} ` +
    `ANON_KEY=${shQuote(anonKey)} BODY_B64=${shQuote(payloadB64)} sh -c ` +
    shQuote(`body=$(printf "%s" "$BODY_B64" | base64 -d); curl -k -sS -m 20 -w "\\nHTTP_STATUS:%{http_code}" -X POST "$AUTH_URL" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" --data "$body"`);

  let lastOutput = "";
  for (let attempt = 1; attempt <= 45; attempt++) {
    const result = await exec(conn, attempt > 20 && fallbackCommand ? fallbackCommand : command);
    lastOutput = `${result.stdout}${result.stderr}`;
    if (result.code === 0 && /HTTP_STATUS:200/.test(lastOutput) && /"access_token"/.test(lastOutput)) {
      await log(`✓ Test login Auth réussi depuis le serveur (${authBaseUrl})`);
      return;
    }
    if (attempt === 20 && fallbackCommand) {
      await log(`⚠ Port Auth ${authBaseUrl} indisponible depuis l'hôte, test direct dans le conteneur kong…`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`Le compte admin existe mais le test login Auth échoue depuis le serveur (${authBaseUrl}). Réponse : ${lastOutput.slice(-700)}`);
}

async function verifyPublicAuthLogin(
  authBaseUrl: string,
  anonKey: string,
  email: string,
  password: string,
  log: (m: string) => Promise<void> | void,
) {
  try {
    const response = await fetch(`${authBaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
    const text = await response.text();
    if (response.ok && text.includes("access_token")) {
      await log(`✓ Test login Auth public réussi (${authBaseUrl})`);
      return;
    }
    await log(`⚠ Test login Auth public échoué (${response.status}) : ${text.slice(0, 500)}`);
  } catch (error: any) {
    await log(`⚠ API Auth publique inaccessible depuis Lovable Cloud (${authBaseUrl}) : ${error?.message || String(error)}`);
  }
}

async function readRemoteEnv(conn: Client, envPath: string, key: string) {
  const result = await exec(conn, `grep -E '^${key}=' ${envPath} | head -1 | cut -d= -f2-`);
  return (result.stdout || "").trim();
}

async function ensurePostgresSqlAccess(conn: Client, supaDir: string, log: (m: string) => Promise<void> | void) {
  await exec(conn, `cd ${supaDir} && for i in $(seq 1 30); do docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1 && break || sleep 2; done`);
  const probe = await exec(conn, dockerPsqlSelect(supaDir, "select 1", false));
  const probeOut = `${probe.stdout}${probe.stderr}`;
  if (probe.code === 0 && !/Permission denied|pg_filenode\.map/i.test(probeOut)) return;

  await log("⚠ Permissions Postgres détectées comme invalides — réparation du volume DB…");
  await exec(conn, `cd ${supaDir} && docker compose exec -T -u 0 db sh -c "chown -R postgres:postgres /var/lib/postgresql/data && chmod -R u+rwX,go-rwx /var/lib/postgresql/data" 2>&1 || true`);
  await exec(conn, `cd ${supaDir} && docker compose restart db 2>&1 || true`);
  await exec(conn, `cd ${supaDir} && for i in $(seq 1 60); do docker compose exec -T db pg_isready -U postgres >/dev/null 2>&1 && break || sleep 2; done`);
  const retry = await exec(conn, dockerPsqlSelect(supaDir, "select 1", false));
  const retryOut = `${retry.stdout}${retry.stderr}`;
  if (retry.code !== 0 || /Permission denied|pg_filenode\.map/i.test(retryOut)) {
    throw new Error("Postgres local reste inaccessible après réparation des permissions : " + retryOut.slice(-600));
  }
  await log("✓ Permissions Postgres réparées");
}

function buildAuthLoginCurlCommand(authBaseUrl: string, anonKey: string, email: string, password: string) {
  const payloadB64 = btoa(JSON.stringify({ email, password }));
  return `AUTH_URL=${shQuote(`${authBaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`)} ` +
    `ANON_KEY=${shQuote(anonKey)} BODY_B64=${shQuote(payloadB64)} sh -c ` +
    shQuote(`body=$(printf "%s" "$BODY_B64" | base64 -d); curl -k -sS -m 20 -w "\\nHTTP_STATUS:%{http_code}" -X POST "$AUTH_URL" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" --data "$body"`);
}

function buildDirectKongAuthLoginCommand(supaDir: string, anonKey: string, email: string, password: string) {
  const payloadB64 = btoa(JSON.stringify({ email, password }));
  return `cd ${supaDir} && KONG_CID=$(docker compose ps -q kong) && ` +
    `KONG_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$KONG_CID" | awk '{print $1}') && ` +
    `AUTH_URL="http://$KONG_IP:8000/auth/v1/token?grant_type=password" ` +
    `ANON_KEY=${shQuote(anonKey)} BODY_B64=${shQuote(payloadB64)} sh -c ` +
    shQuote(`body=$(printf "%s" "$BODY_B64" | base64 -d); curl -k -sS -m 20 -w "\\nHTTP_STATUS:%{http_code}" -X POST "$AUTH_URL" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" -H "Content-Type: application/json" --data "$body"`);
}

function chooseKongHttpsPort(kongHttpPort: string, reservedPorts: string[] = []) {
  const http = Number.parseInt(kongHttpPort, 10);
  let candidate = Number.isFinite(http) ? http + 443 : 8443;
  const reserved = new Set(reservedPorts.map((p) => Number.parseInt(p, 10)).filter((p) => Number.isFinite(p)));
  while (reserved.has(candidate) || candidate === http) candidate += 1;
  return String(candidate);
}

async function syncSupabaseKongPorts(conn: Client, supaDir: string, kongHttpPort: string, kongHttpsPort: string, log: (m: string) => Promise<void> | void) {
  const cmd = `cd ${supaDir} && touch .env && ` +
    `cur_http=$(grep -E '^KONG_HTTP_PORT=' .env | head -1 | cut -d= -f2-); ` +
    `cur_https=$(grep -E '^KONG_HTTPS_PORT=' .env | head -1 | cut -d= -f2-); ` +
    `changed=0; ` +
    `if [ "$cur_http" != ${shQuote(kongHttpPort)} ]; then sed -i '/^KONG_HTTP_PORT=/d' .env; printf 'KONG_HTTP_PORT=%s\n' ${shQuote(kongHttpPort)} >> .env; changed=1; fi; ` +
    `if [ "$cur_https" != ${shQuote(kongHttpsPort)} ]; then sed -i '/^KONG_HTTPS_PORT=/d' .env; printf 'KONG_HTTPS_PORT=%s\n' ${shQuote(kongHttpsPort)} >> .env; changed=1; fi; ` +
    `if [ "$changed" = 1 ]; then docker compose rm -sf kong 2>&1 || true; echo CHANGED; else echo OK; fi`;
  const result = await exec(conn, cmd);
  const output = `${result.stdout}${result.stderr}`;
  if (/CHANGED/.test(output)) {
    await log(`✓ Ports Kong Supabase alignés : HTTP ${kongHttpPort}, HTTPS ${kongHttpsPort} (évite le conflit avec l'application)`);
  }
}

async function syncLocalAuthSafeEnv(conn: Client, supaDir: string, log: (m: string) => Promise<void> | void) {
  const envPatch = [
    "SUPABASE_URL=http://kong:8000",
    "FUNCTIONS_VERIFY_JWT=false",
    "ENABLE_EMAIL_AUTOCONFIRM=true",
    "ENABLE_PHONE_SIGNUP=false",
    "ENABLE_PHONE_AUTOCONFIRM=true",
    "HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=false",
    "HOOK_SEND_EMAIL_ENABLED=false",
    "HOOK_SEND_SMS_ENABLED=false",
    "HOOK_MFA_VERIFICATION_ATTEMPT_ENABLED=false",
    "HOOK_PASSWORD_VERIFICATION_ATTEMPT_ENABLED=false",
  ].join("\n") + "\n";
  const keys = envPatch.split("\n").map((line) => line.split("=")[0]).filter(Boolean).join(" ");
  const b64 = btoa(envPatch);
  const cmd = `cd ${supaDir} && for k in ${keys}; do sed -i "/^$k=/d" .env; done && printf '%s' '${b64}' | base64 -d >> .env && docker compose rm -sf auth 2>&1 || true`;
  await exec(conn, cmd);
  await log("✓ Configuration Auth locale sécurisée (hooks réseau désactivés)");
}

async function syncLocalEdgeFunctions(conn: Client, remoteDir: string, supaDir: string, log: (m: string) => Promise<void> | void) {
  const fnDir = `${remoteDir}/repo/supabase/functions`;
  const probe = await exec(conn, `[ -d ${fnDir} ] && echo OK || echo MISSING`);
  if (!probe.stdout.includes("OK")) {
    await log("⚠ Aucun dossier de fonctions backend trouvé dans le repo cloné.");
    return;
  }

  await log("→ Synchronisation des fonctions backend locales…");
  const cmd =
    `mkdir -p ${supaDir}/volumes/functions && ` +
    `MAIN_SRC=${shQuote(`${supaDir}/supabase-repo/docker/volumes/functions/main`)} && ` +
    `MAIN_DST=${shQuote(`${supaDir}/volumes/functions/main`)} && ` +
    `if [ ! -d "$MAIN_DST" ] && [ -d "$MAIN_SRC" ]; then mkdir -p "$MAIN_DST" && cp -a "$MAIN_SRC"/. "$MAIN_DST"/; fi && ` +
    `for d in ${fnDir}/*; do [ -d "$d" ] || continue; name=$(basename "$d"); [ "$name" = main ] && continue; rm -rf ${supaDir}/volumes/functions/"$name"; cp -a "$d" ${supaDir}/volumes/functions/"$name"; done && ` +
    `cd ${supaDir} && ` +
    `anon=$(grep -E '^ANON_KEY=' .env | head -1 | cut -d= -f2-); ` +
    `svc=$(grep -E '^SERVICE_ROLE_KEY=' .env | head -1 | cut -d= -f2-); ` +
    `for k in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY FUNCTIONS_VERIFY_JWT; do sed -i "/^$k=/d" .env; done; ` +
    `printf 'SUPABASE_URL=http://kong:8000\nSUPABASE_ANON_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\nFUNCTIONS_VERIFY_JWT=false\n' "$anon" "$svc" >> .env; ` +
    `(docker compose up -d --no-deps functions 2>&1 || docker compose up -d --no-deps edge-runtime 2>&1 || true); ` +
    `(docker compose restart functions 2>&1 || docker compose restart edge-runtime 2>&1 || true)`;
  const result = await exec(conn, cmd);
  await log((`${result.stdout}${result.stderr}`).slice(-1200));
  await log("✓ Fonctions backend locales synchronisées");
}

async function ensureLocalAuthGateway(conn: Client, supaDir: string, kongPort: string, log: (m: string) => Promise<void> | void) {
  await log(`→ Vérification de la gateway Auth locale (port ${kongPort})…`);
  await patchKongKeyauthCredentials(conn, supaDir, log);
  const up = await exec(
    conn,
    `cd ${supaDir} && (docker compose up -d db kong auth rest realtime storage meta 2>&1 || docker compose up -d kong auth rest storage 2>&1 || true)`
  );
  const upOutput = `${up.stdout}${up.stderr}`;
  if (/unhealthy|dependency failed|failed to start|Error/i.test(upOutput)) {
    await log("⚠ Redémarrage gateway Auth partiel, vérification des services essentiels : " + upOutput.slice(-1200));
  }
  const probe = await exec(
    conn,
    `for i in $(seq 1 45); do status=$(curl -k -sS -m 5 -o /tmp/screenflow_auth_probe.txt -w "%{http_code}" http://127.0.0.1:${kongPort}/auth/v1/settings 2>/dev/null || true); ` +
    `case "$status" in 200|401|403) echo OK_HTTP_STATUS:$status && exit 0;; esac; sleep 2; done; ` +
    `echo FAIL; cd ${supaDir} && docker compose ps && docker compose logs --tail=80 kong 2>&1`
  );
  const okStatus = probe.stdout.match(/OK_HTTP_STATUS:(\d+)/)?.[1];
  if (okStatus) {
    await log(`✓ Gateway Auth locale accessible sur http://127.0.0.1:${kongPort} (HTTP ${okStatus})`);
    return;
  }
  throw new Error(
    `La gateway Auth locale ne répond pas sur http://127.0.0.1:${kongPort}. ` +
    `Vérifiez qu'aucun autre service n'utilise ce port ou changez le port API Supabase local. Détails : ` +
    (probe.stdout + probe.stderr).slice(-1200)
  );
}

async function upsertDefaultAdminViaAuthApi(
  conn: Client,
  supaDir: string,
  kongPort: string,
  serviceKey: string,
  password: string,
  log: (m: string) => Promise<void> | void,
) {
  await ensureLocalAuthGateway(conn, supaDir, kongPort, log);
  const existing = await exec(conn, dockerPsqlSelect(supaDir, `select id::text from auth.users where lower(email)=lower('${DEFAULT_ADMIN_EMAIL}') limit 1`));
  const existingId = (existing.stdout || "").match(/[0-9a-fA-F-]{36}/)?.[0] || "";
  const body = existingId
    ? { email: DEFAULT_ADMIN_EMAIL, password, email_confirm: true, user_metadata: { display_name: "ScreenFlow Admin" }, app_metadata: { provider: "email", providers: ["email"] }, ban_duration: "none" }
    : { email: DEFAULT_ADMIN_EMAIL, password, email_confirm: true, user_metadata: { display_name: "ScreenFlow Admin" }, app_metadata: { provider: "email", providers: ["email"] } };
  const payloadB64 = btoa(JSON.stringify(body));
  const method = existingId ? "PUT" : "POST";
  const path = existingId ? `/auth/v1/admin/users/${existingId}` : "/auth/v1/admin/users";
  const serviceKeyB64 = btoa(serviceKey);

  // Exécution directe via bash -c : on décode en variables locales, puis curl.
  // Évite tout problème avec `sh` absent du PATH ou des quotes mal échappées.
  const call = (baseUrl: string) => {
    const baseB64 = btoa(baseUrl.replace(/\/$/, ""));
    const pathB64 = btoa(path);
    const script =
      `set -e; ` +
      `API_BASE=$(printf '%s' '${baseB64}' | base64 -d); ` +
      `SERVICE_KEY=$(printf '%s' '${serviceKeyB64}' | base64 -d); ` +
      `REQ_PATH=$(printf '%s' '${pathB64}' | base64 -d); ` +
      `BODY=$(printf '%s' '${payloadB64}' | base64 -d); ` +
      `curl -k -sS -m 30 -w '\\nHTTP_STATUS:%{http_code}' -X ${method} ` +
      `"$API_BASE$REQ_PATH" ` +
      `-H "apikey: $SERVICE_KEY" ` +
      `-H "Authorization: Bearer $SERVICE_KEY" ` +
      `-H "Content-Type: application/json" ` +
      `--data "$BODY"`;
    return `bash -c ${shQuote(script)}`;
  };

  let result = await exec(conn, call(`http://127.0.0.1:${kongPort}`));
  let output = `${result.stdout}${result.stderr}`;
  if (!(result.code === 0 && /HTTP_STATUS:20[01]/.test(output))) {
    await log("⚠ API Admin Auth via le port hôte indisponible, tentative directe via le conteneur kong…");
    const directBase = `cd ${supaDir} && KONG_CID=$(docker compose ps -q kong) && KONG_IP=$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$KONG_CID" | awk '{print $1}') && echo "http://$KONG_IP:8000"`;
    const direct = await exec(conn, directBase);
    const directUrl = (direct.stdout || "").trim().split(/\s+/).pop() || "";
    if (directUrl.startsWith("http://")) {
      result = await exec(conn, call(directUrl));
      output = `${result.stdout}${result.stderr}`;
    }
  }
  if (!(result.code === 0 && /HTTP_STATUS:20[01]/.test(output))) {
    // Détection des erreurs réseau internes à GoTrue (DNS, webhook, SMTP) → fallback SQL direct
    const isNameResolution = /name resolution failed|no such host|dial tcp|HTTP_STATUS:50[0-9]/i.test(output);
    if (isNameResolution) {
      await log("⚠ API Admin GoTrue indisponible (résolution DNS interne échouée). Bascule en création SQL directe…");
      await upsertDefaultAdminViaSql(conn, supaDir, password, log);
      return;
    }
    throw new Error(`Impossible de créer/réparer le compte admin via l'API Auth locale. Réponse : ${output.slice(-900)}`);
  }
  await log(existingId ? "✓ Compte admin Auth réparé via API officielle" : "✓ Compte admin Auth créé via API officielle");
}

// Fallback : crée/met à jour directement le compte admin dans auth.users via SQL (bcrypt via pgcrypto).
// Utilisé quand GoTrue échoue avec "name resolution failed" (souvent dû à un webhook/SMTP non résolvable).
async function upsertDefaultAdminViaSql(
  conn: Client,
  supaDir: string,
  password: string,
  log: (m: string) => Promise<void> | void,
) {
  const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
DECLARE
  uid uuid;
  hashed text;
BEGIN
  hashed := crypt('${password.replace(/'/g, "''")}', gen_salt('bf'));
  SELECT id INTO uid FROM auth.users WHERE lower(email)=lower('${DEFAULT_ADMIN_EMAIL}') LIMIT 1;
  IF uid IS NULL THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      '${DEFAULT_ADMIN_EMAIL}', hashed, now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"ScreenFlow Admin"}'::jsonb,
      false, false
    );
    INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', '${DEFAULT_ADMIN_EMAIL}', 'email_verified', true), 'email', now(), now(), now())
    ON CONFLICT DO NOTHING;
  ELSE
    UPDATE auth.users SET
      encrypted_password = hashed,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now(),
      banned_until = NULL,
      raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"]}'::jsonb
    WHERE id = uid;
  END IF;
END $$;
`.trim();
  const b64 = btoa(sql);
  const res = await exec(conn, dockerPsql(supaDir, b64));
  if (res.code !== 0) {
    throw new Error("Échec du fallback SQL pour le compte admin : " + (res.stdout + res.stderr).slice(-800));
  }
  await log("✓ Compte admin créé/réparé directement en base (fallback SQL)");
}

async function ensureDefaultAdminRole(conn: Client, supaDir: string, log: (m: string) => Promise<void> | void) {
  const roleSql = `
DO $$
DECLARE uid uuid;
BEGIN
  SELECT id INTO uid FROM auth.users WHERE lower(email)=lower('${DEFAULT_ADMIN_EMAIL}') LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Compte Auth introuvable pour ${DEFAULT_ADMIN_EMAIL}';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles') THEN
    INSERT INTO public.profiles (id, email, display_name)
    VALUES (uid, '${DEFAULT_ADMIN_EMAIL}', 'ScreenFlow Admin')
    ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, updated_at=now();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_roles') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (uid, 'admin') ON CONFLICT DO NOTHING;
    DELETE FROM public.user_roles WHERE user_id=uid AND role='user';
  END IF;
END $$;
`.trim();
  const roleB64 = btoa(roleSql);
  const promoted = await exec(conn, dockerPsql(supaDir, roleB64));
  if (promoted.code !== 0) throw new Error("Compte Auth créé, mais attribution du rôle admin échouée : " + (promoted.stdout + promoted.stderr).slice(-800));
  await log("✓ Rôle admin global confirmé pour screenflow@screenflow.local");
}

// Background job runner: persists progress to public.app_settings under key ssh_deploy_job:<jobId>
async function runDeploymentJob(
  jobId: string,
  body: DeployBody,
  serviceClient: ReturnType<typeof createClient>,
) {
  const logs: string[] = [];
  const settingsKey = `ssh_deploy_job:${jobId}`;

  const persist = async (patch: Record<string, unknown>) => {
    const value = JSON.stringify({
      job_id: jobId,
      updated_at: new Date().toISOString(),
      ...patch,
    });
    await serviceClient
      .from("app_settings")
      .upsert({ key: settingsKey, value }, { onConflict: "key" });
  };

  const log = async (m: string) => {
    console.log(`[${jobId}]`, m);
    logs.push(m);
    await persist({ status: "running", logs });
  };

  try {
    await persist({ status: "running", logs: [] });
    if (body.action === "reset_admin_password") {
      await runResetAdminPassword(body, log);
    } else if (body.action === "check_admin_status") {
      await runCheckAdminStatus(body, log, persist);
    } else {
      await runDeployment(body, log);
    }
    await persist({ status: "success", logs, result: (globalThis as any).__lastDeployResult || null });
  } catch (e: any) {
    logs.push("✗ ERROR: " + (e?.message || String(e)));
    await persist({ status: "error", logs, error: e?.message || String(e) });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userData.user.id, _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as DeployBody;
    const action = body.action || "deploy";

    if (!body.host || !body.username || !body.password) {
      return new Response(JSON.stringify({ error: "Missing required fields (host, username, password)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (action === "deploy" && !body.git_url) {
      return new Response(JSON.stringify({ error: "Missing required field: git_url" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service-role client used by background task to persist job progress (bypasses RLS via service key)
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const jobId = crypto.randomUUID();

    // @ts-ignore - EdgeRuntime is provided by Supabase Functions runtime
    EdgeRuntime.waitUntil(runDeploymentJob(jobId, body, serviceClient));

    return new Response(JSON.stringify({
      success: true,
      job_id: jobId,
      status_key: `ssh_deploy_job:${jobId}`,
      message: action === "reset_admin_password"
        ? "Réinitialisation du mot de passe admin lancée en arrière-plan."
        : action === "check_admin_status"
        ? "Vérification du compte admin lancée en arrière-plan."
        : "Déploiement lancé en arrière-plan. Suivez la progression via le polling.",
    }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ===== The actual deployment logic, now wrapped =====
async function runDeployment(body: DeployBody, log: (m: string) => Promise<void> | void) {
  const port = body.port ?? 22;
  const remoteDir = body.remote_dir || "/opt/screenflow";
  const appPort = body.app_port || "8080";
  const branch = body.git_branch || "main";
  const enableHttps = !!body.enable_https;
  const httpsPort = body.https_port || "8443";
  const httpsDomain = (body.https_domain || body.host).trim();
  const installSupabase = !!body.install_supabase_local;
  const supaKongPort = body.supabase_kong_http_port || "8000";
  const supaKongHttpsPort = chooseKongHttpsPort(supaKongPort, [enableHttps ? httpsPort : ""]);
  const supaStudioPort = body.supabase_studio_port || "3001";
  const supaDbPort = body.supabase_db_port || "5432";
  let supabaseUrlOverride = "";
  let supabaseAnonOverride = "";
  let supabaseProjectIdOverride = "";

  let gitUrl = body.git_url.trim();
  if (body.git_token && /^https?:\/\//.test(gitUrl)) {
    gitUrl = gitUrl.replace(/^(https?:\/\/)/, `$1${encodeURIComponent(body.git_token)}@`);
  }

  await log(`→ Connecting to ${body.username}@${body.host}:${port}…`);
  const conn = await ssh({ host: body.host, port, username: body.username, password: body.password });
  await log("✓ SSH connection established");

    try {
      const sudoPrefix = `echo '${body.password.replace(/'/g, "'\\''")}' | sudo -S `;
      const preflight = await runRemotePreflight(conn, body, remoteDir, installSupabase, log);

      if ((!preflight.dockerOk || !preflight.composeOk) && body.install_docker) {
        log("→ Installing Docker (this may take 1-3 minutes)…");
        await exec(conn, `${sudoPrefix}sh -c "(command -v apt-get && apt-get update -y && apt-get install -y curl ca-certificates git) || (command -v dnf && dnf install -y curl ca-certificates git) || (command -v yum && yum install -y curl ca-certificates git) || true"`);
        const installCmd = `${sudoPrefix}sh -c "
          (curl -fsSL https://get.docker.com -o /tmp/get-docker.sh || wget -qO /tmp/get-docker.sh https://get.docker.com) &&
          sh /tmp/get-docker.sh &&
          (systemctl enable docker || true) &&
          (systemctl start docker || service docker start || true) &&
          usermod -aG docker ${body.username} || true
        "`;
        const r = await exec(conn, installCmd);
        log(r.stdout.slice(-1500));
        if (r.code !== 0) {
          const errMsg = r.stderr.slice(-1000);
          log("⚠ Install errors: " + errMsg);
          if (/not in the sudoers/i.test(errMsg) || /incorrect password/i.test(errMsg)) {
            throw new Error(
              `L'utilisateur '${body.username}' n'a pas les droits sudo. ` +
              `En root : 'usermod -aG sudo ${body.username}' (Debian/Ubuntu) ou 'usermod -aG wheel ${body.username}' (RHEL).`
            );
          }
          throw new Error("Échec de l'installation de Docker. Voir les logs.");
        }
        log("✓ Docker installed");
      }

      // Ensure git
      const gitCheck = await exec(conn, "command -v git || echo MISSING");
      if (gitCheck.stdout.includes("MISSING")) {
        log("→ Installing git…");
        await exec(conn, `${sudoPrefix}sh -c "(apt-get update -y && apt-get install -y git) || (dnf install -y git) || (yum install -y git)"`);
      }

      // ===== Detect existing installation (incremental update mode) =====
      const existingCheck = await exec(
        conn,
        `test -d ${remoteDir}/repo/.git && test -f ${remoteDir}/repo/docker-compose.yml && echo EXISTS || echo NEW`,
      );
      const isExistingInstall = existingCheck.stdout.includes("EXISTS");
      const supaDirCheck = await exec(
        conn,
        `test -f ${remoteDir}/supabase/docker-compose.yml && test -f ${remoteDir}/supabase/.env && echo EXISTS || echo NEW`,
      );
      const isExistingSupabase = supaDirCheck.stdout.includes("EXISTS");

      if (isExistingInstall) {
        await log(`✓ Installation existante détectée dans ${remoteDir} — mode mise à jour activé`);
      }
      if (installSupabase && isExistingSupabase) {
        await log(`✓ Supabase local déjà installé dans ${remoteDir}/supabase — réutilisation de la configuration existante`);
      }

      // ===== Optional: install self-hosted Supabase on the same server =====
      if (installSupabase && !isExistingSupabase) {
        const supaDir = `${remoteDir}/supabase`;
        log("→ Installing self-hosted Supabase (this may take 3-5 minutes)…");
        await exec(conn, `${sudoPrefix}mkdir -p ${supaDir} && ${sudoPrefix}chown -R ${body.username}:${body.username} ${supaDir}`);

        const supaClone = await exec(conn, `if [ ! -d ${supaDir}/supabase-repo ]; then git clone --depth 1 https://github.com/supabase/supabase ${supaDir}/supabase-repo 2>&1; else cd ${supaDir}/supabase-repo && git pull 2>&1; fi`);
        log(supaClone.stdout.slice(-1000));
        if (supaClone.code !== 0) throw new Error("Échec clone du dépôt Supabase: " + supaClone.stderr.slice(-300));

        await exec(conn, `cp -rn ${supaDir}/supabase-repo/docker/* ${supaDir}/ 2>/dev/null || true`);
        await exec(conn, `cp -n ${supaDir}/supabase-repo/docker/.env.example ${supaDir}/.env 2>/dev/null || true`);

        const randHex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
        const postgresPw = randHex(32);
        const jwtSecret = randHex(40);
        const dashboardPw = randHex(16);

        const jwtGen = await exec(conn, `docker run --rm -e S='${jwtSecret}' node:20-alpine node -e "const c=require('crypto');const s=process.env.S;function b64(o){return Buffer.from(JSON.stringify(o)).toString('base64url')}function sign(p){const h=b64({alg:'HS256',typ:'JWT'});const b=b64(p);const sig=c.createHmac('sha256',s).update(h+'.'+b).digest('base64url');return h+'.'+b+'.'+sig}const iat=Math.floor(Date.now()/1000),exp=iat+315360000;console.log(sign({role:'anon',iss:'supabase',iat,exp}));console.log(sign({role:'service_role',iss:'supabase',iat,exp}));"`);
        const jwtLines = jwtGen.stdout.trim().split("\n").filter((l: string) => l.startsWith("ey"));
        if (jwtLines.length < 2) {
          log("⚠ JWT gen output: " + jwtGen.stdout.slice(-400) + " | err: " + jwtGen.stderr.slice(-400));
          throw new Error("Échec génération des clés JWT Supabase");
        }
        const anonKey = jwtLines[0];
        const serviceKey = jwtLines[1];

        const appPublicUrl = enableHttps ? `https://${httpsDomain}:${httpsPort}` : `http://${body.host}:${appPort}`;
        const supaKongPublicUrl = `http://${body.host}:${supaKongPort}`;
        const supaBrowserUrl = appPublicUrl;

        const envPatch = [
          `POSTGRES_PASSWORD=${postgresPw}`,
          `JWT_SECRET=${jwtSecret}`,
          `ANON_KEY=${anonKey}`,
          `SERVICE_ROLE_KEY=${serviceKey}`,
          `SUPABASE_PUBLISHABLE_KEY=`,
          `SUPABASE_SECRET_KEY=`,
          `DASHBOARD_USERNAME=admin`,
          `DASHBOARD_PASSWORD=${dashboardPw}`,
          `SITE_URL=${appPublicUrl}`,
          `API_EXTERNAL_URL=${supaKongPublicUrl}`,
          `SUPABASE_PUBLIC_URL=${supaBrowserUrl}`,
          `KONG_HTTP_PORT=${supaKongPort}`,
          `KONG_HTTPS_PORT=${supaKongHttpsPort}`,
          `STUDIO_PORT=${supaStudioPort}`,
          `POSTGRES_PORT=${supaDbPort}`,
          `ENABLE_EMAIL_SIGNUP=true`,
          `ENABLE_EMAIL_AUTOCONFIRM=true`,
          `ENABLE_ANONYMOUS_USERS=false`,
          `DISABLE_SIGNUP=false`,
        ].join("\n") + "\n";
        const envB64 = btoa(envPatch);
        await exec(conn, `cd ${supaDir} && for k in POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY DASHBOARD_USERNAME DASHBOARD_PASSWORD SITE_URL API_EXTERNAL_URL SUPABASE_PUBLIC_URL KONG_HTTP_PORT KONG_HTTPS_PORT STUDIO_PORT POSTGRES_PORT ENABLE_EMAIL_SIGNUP ENABLE_EMAIL_AUTOCONFIRM ENABLE_ANONYMOUS_USERS DISABLE_SIGNUP; do sed -i "/^$k=/d" .env; done && echo "${envB64}" | base64 -d >> .env && serviceKey="${serviceKey}" && echo "_OK"`);

        log(`→ Starting Supabase containers essentiels (kong:${supaKongPort}, studio:${supaStudioPort}, db:${supaDbPort})…`);
        await syncLocalAuthSafeEnv(conn, supaDir, log);
        await startLocalSupabaseEssentials(conn, supaDir, log);
        await ensureLocalApiServices(conn, supaDir, supaKongPort, anonKey, log);

        supabaseUrlOverride = supaBrowserUrl;
        supabaseAnonOverride = anonKey;
        supabaseProjectIdOverride = "local";

        log(`✓ Supabase local démarré`);
        log(`  • API app: ${supaBrowserUrl} (proxy sécurisé via l'application)`);
        log(`  • API directe: ${supaKongPublicUrl}`);
        log(`  • Studio: http://${body.host}:${supaStudioPort}  (admin / ${dashboardPw})`);
        log(`  • DB:     postgres://postgres:${postgresPw}@${body.host}:${supaDbPort}/postgres`);
        log(`  ⚠ Notez le mot de passe du dashboard, il ne sera pas réaffiché.`);

        // ===== Apply app migrations from cloned repo =====
        // Note: we apply this AFTER the repo is cloned below. We schedule it via a marker.
        (globalThis as any).__pendingLocalMigrations = { supaDir, postgresPw: postgresPw };
      }

      // ===== Existing Supabase: extract keys from existing .env and ensure containers are up =====
      if (installSupabase && isExistingSupabase) {
        const supaDir = `${remoteDir}/supabase`;
        const envRead = await exec(
          conn,
          `cd ${supaDir} && grep -E '^(ANON_KEY|SERVICE_ROLE_KEY|POSTGRES_PASSWORD|JWT_SECRET)=' .env || true`,
        );
        const envMap: Record<string, string> = {};
        for (const line of (envRead.stdout || "").split("\n")) {
          const m = line.match(/^([A-Z_]+)=(.*)$/);
          if (m) envMap[m[1]] = m[2].trim();
        }
        const anonKey = envMap.ANON_KEY || "";
        const serviceKey = envMap.SERVICE_ROLE_KEY || "";
        const postgresPw = envMap.POSTGRES_PASSWORD || "";
        if (!anonKey || !serviceKey) {
          throw new Error("Installation Supabase existante détectée mais ANON_KEY/SERVICE_ROLE_KEY introuvables dans .env. Réinstallez ou complétez le fichier .env.");
        }
        await log("→ Vérification des conteneurs Supabase existants…");
        await syncSupabaseKongPorts(conn, supaDir, supaKongPort, supaKongHttpsPort, log);
        await syncLocalAuthSafeEnv(conn, supaDir, log);
        await startLocalSupabaseEssentials(conn, supaDir, log);
        await ensureLocalApiServices(conn, supaDir, supaKongPort, anonKey, log);
        const supaBrowserUrl = enableHttps ? `https://${httpsDomain}:${httpsPort}` : `http://${body.host}:${appPort}`;
        supabaseUrlOverride = supaBrowserUrl;
        supabaseAnonOverride = anonKey;
        supabaseProjectIdOverride = "local";
        await log("✓ Supabase local opérationnel (clés réutilisées depuis .env)");
        (globalThis as any).__pendingLocalMigrations = { supaDir, postgresPw };
      }

      log(`→ Preparing remote directory ${remoteDir}…`);
      // Ne jamais chown -R tout remoteDir ici : il contient aussi le volume Postgres local,
      // et un chown récursif casse global/pg_filenode.map. On ne touche qu'au dossier repo.
      await exec(conn, `${sudoPrefix}mkdir -p ${remoteDir} && ${sudoPrefix}chown ${body.username}:${body.username} ${remoteDir} && if [ -d ${remoteDir}/repo ]; then ${sudoPrefix}chown -R ${body.username}:${body.username} ${remoteDir}/repo; fi`);
      log("✓ Remote directory ready");

      if (isExistingInstall) {
        await log(`→ Mise à jour du repo existant (git fetch + reset --hard origin/${branch})…`);
        const pull = await exec(
          conn,
          `cd ${remoteDir}/repo && ` +
          `git remote set-url origin '${gitUrl}' 2>&1 && ` +
          `git fetch --depth 1 origin ${branch} 2>&1 && ` +
          `git reset --hard origin/${branch} 2>&1 && ` +
          `git clean -fd 2>&1`,
        );
        log(pull.stdout.slice(-1500));
        if (pull.code !== 0) {
          await log("⚠ git pull a échoué, fallback sur clone complet…");
          await exec(conn, `rm -rf ${remoteDir}/repo`);
          const clone = await exec(conn, `git clone --depth 1 --branch ${branch} '${gitUrl}' ${remoteDir}/repo 2>&1`);
          log(clone.stdout.slice(-1500));
          if (clone.code !== 0) {
            throw new Error(`Échec du clone Git de secours. ${clone.stderr.slice(-300)}`);
          }
        }
        await log("✓ Repo mis à jour vers la dernière version");
      } else {
        log(`→ Cloning ${body.git_url} (branch: ${branch})…`);
        await exec(conn, `rm -rf ${remoteDir}/repo`);
        const clone = await exec(conn, `git clone --depth 1 --branch ${branch} '${gitUrl}' ${remoteDir}/repo 2>&1`);
        log(clone.stdout.slice(-1500));
        if (clone.code !== 0) {
          throw new Error(`Échec du clone Git. Vérifiez l'URL/branche/token. ${clone.stderr.slice(-300)}`);
        }
        log("✓ Repo cloned");
      }

      // ===== Apply app migrations to local Supabase =====
      const pending = (globalThis as any).__pendingLocalMigrations;
      if (pending?.supaDir) {
        await ensurePostgresSqlAccess(conn, pending.supaDir, log);
        log("→ Application des migrations de l'application sur Supabase local…");
        const migDir = `${remoteDir}/repo/supabase/migrations`;
        // Concat all .sql files in order and pipe to psql
        let applyMig = await exec(
          conn,
          `if [ -d "${migDir}" ]; then ` +
          `for f in $(ls ${migDir}/*.sql 2>/dev/null | sort); do ` +
          `  echo "-- $f"; cat "$f"; echo ""; ` +
          `done | (cd ${pending.supaDir} && docker compose exec -T --user postgres db sh -lc ${shQuote('PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=0')}) 2>&1 | tail -100; ` +
          `else echo "no migrations dir"; fi`
        );
        if (/Permission denied|pg_filenode\.map/i.test(`${applyMig.stdout}${applyMig.stderr}`)) {
          await log("⚠ Postgres a reperdu l'accès au volume pendant les migrations — réparation et nouvelle tentative…");
          await ensurePostgresSqlAccess(conn, pending.supaDir, log);
          applyMig = await exec(
            conn,
            `if [ -d "${migDir}" ]; then ` +
            `for f in $(ls ${migDir}/*.sql 2>/dev/null | sort); do echo "-- $f"; cat "$f"; echo ""; done | ` +
            `(cd ${pending.supaDir} && docker compose exec -T --user postgres db sh -lc ${shQuote('PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=0')}) 2>&1 | tail -100; ` +
            `else echo "no migrations dir"; fi`
          );
        }
        log(applyMig.stdout.slice(-1500));
        log("✓ Migrations appliquées (les erreurs 'already exists' sont normales)");
        await syncLocalEdgeFunctions(conn, remoteDir, pending.supaDir, log);
        if (supabaseAnonOverride) {
          await ensureLocalApiServices(conn, pending.supaDir, supaKongPort, supabaseAnonOverride, log);
        }
      }


      // Generate Dockerfile, nginx.conf, docker-compose.yml inside the repo
      log("→ Writing Dockerfile, nginx.conf, docker-compose.yml…");
      const escEnv = (s: string) => (s || "").replace(/'/g, "'\\''");
      const dockerfile = `FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* bun.lockb* bun.lock* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
RUN npm run build
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx","-g","daemon off;"]
`;
      const localFunctions = [
        "bootstrap-admin", "restore-backup", "ai-assistant", "check-email-replies", "check-inbox",
        "content-action", "content-webhook", "generate-devis", "invite-user", "resend-ack",
        "screen-setup-guide", "send-credentials", "server-stats", "sync-client-dravox", "test-email",
      ];
      const functionProxyHeaders = `proxy_set_header Host $host; proxy_set_header Authorization $http_authorization; proxy_set_header apikey $http_apikey; proxy_set_header X-Client-Info $http_x_client_info; proxy_set_header X-Forwarded-Host $host; proxy_set_header X-Forwarded-Proto ${enableHttps ? "https" : "http"}; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`;
      const localFunctionLocations = localFunctions.map((name) => `  location = /functions/v1/${name} { proxy_pass http://host.docker.internal:${supaKongPort}/functions/v1/${name}; ${functionProxyHeaders} }`).join("\n");

      const nginxConf = enableHttps
        ? `server {
  listen 80;
  server_name _;
  return 301 https://$host:${httpsPort}$request_uri;
}
server {
  listen 443 ssl;
  http2 on;
  server_name _;
  ssl_certificate /etc/nginx/ssl/server.crt;
  ssl_certificate_key /etc/nginx/ssl/server.key;
  ssl_protocols TLSv1.2 TLSv1.3;
  root /usr/share/nginx/html;
  index index.html;
  location /auth/v1/ { proxy_pass http://host.docker.internal:${supaKongPort}/auth/v1/; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  location /rest/v1/ { proxy_pass http://host.docker.internal:${supaKongPort}/rest/v1/; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  location /storage/v1/ { proxy_pass http://host.docker.internal:${supaKongPort}/storage/v1/; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  location /realtime/v1/ { proxy_pass http://host.docker.internal:${supaKongPort}/realtime/v1/; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto https; }
${localFunctionLocations}
  location / { try_files $uri $uri/ /index.html; }
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
}
`
        : `server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;
  location /auth/v1/ { proxy_pass http://host.docker.internal:${supaKongPort}/auth/v1/; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto http; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  location /rest/v1/ { proxy_pass http://host.docker.internal:${supaKongPort}/rest/v1/; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto http; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  location /storage/v1/ { proxy_pass http://host.docker.internal:${supaKongPort}/storage/v1/; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto http; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  location /realtime/v1/ { proxy_pass http://host.docker.internal:${supaKongPort}/realtime/v1/; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto http; }
${localFunctionLocations}
  location / { try_files $uri $uri/ /index.html; }
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
}
`;
      const portsBlock = enableHttps
        ? `    ports:
      - "${appPort}:80"
      - "${httpsPort}:443"
    volumes:
      - ./ssl:/etc/nginx/ssl:ro`
        : `    ports:
      - "${appPort}:80"`;
      const compose = `services:
  web:
    build:
      context: .
      args:
        VITE_SUPABASE_URL: '${escEnv(supabaseUrlOverride || body.vite_supabase_url || "")}'
        VITE_SUPABASE_PUBLISHABLE_KEY: '${escEnv(supabaseAnonOverride || body.vite_supabase_key || "")}'
        VITE_SUPABASE_PROJECT_ID: '${escEnv(supabaseProjectIdOverride || body.vite_supabase_project_id || "")}'
    extra_hosts:
      - "host.docker.internal:host-gateway"
${portsBlock}
    restart: unless-stopped
`;
      await uploadFile(conn, `${remoteDir}/repo/Dockerfile`, Buffer.from(dockerfile));
      await uploadFile(conn, `${remoteDir}/repo/nginx.conf`, Buffer.from(nginxConf));
      await uploadFile(conn, `${remoteDir}/repo/docker-compose.yml`, Buffer.from(compose));
      log("✓ Build files ready");

      if (enableHttps) {
        log("→ Generating self-signed SSL certificate…");
        const cnEsc = httpsDomain.replace(/'/g, "");
        const isIp = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) || /^[0-9a-fA-F:]+$/.test(s);
        const sanParts: string[] = [];
        if (isIp(cnEsc)) sanParts.push(`IP:${cnEsc}`); else sanParts.push(`DNS:${cnEsc}`);
        if (body.host && body.host !== cnEsc) {
          if (isIp(body.host)) sanParts.push(`IP:${body.host}`); else sanParts.push(`DNS:${body.host}`);
        }
        const san = sanParts.join(",");
        const sslCmd = `mkdir -p ${remoteDir}/repo/ssl && \
(command -v openssl || ${sudoPrefix}sh -c "(apt-get install -y openssl) || (dnf install -y openssl) || (yum install -y openssl)") && \
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout ${remoteDir}/repo/ssl/server.key \
  -out ${remoteDir}/repo/ssl/server.crt \
  -subj "/CN=${cnEsc}" \
  -addext "subjectAltName=${san}" 2>&1`;
        const ssl = await exec(conn, sslCmd);
        log(ssl.stdout.slice(-800));
        if (ssl.code !== 0) {
          throw new Error("Échec de génération du certificat SSL: " + ssl.stderr.slice(-300));
        }
        log("✓ Certificat SSL généré");
      }

      log("→ Building & starting containers (docker compose up -d --build)…");
      const composeCmd = `cd ${remoteDir}/repo && (docker compose up -d --build || docker-compose up -d --build) 2>&1`;
      const up = await exec(conn, composeCmd);
      log(up.stdout.slice(-3000));
      if (up.code !== 0) {
        log("⚠ Compose stderr: " + up.stderr.slice(-1500));
        throw new Error("docker compose failed");
      }
    await log("✓ Containers started");

    const ps = await exec(conn, `cd ${remoteDir}/repo && (docker compose ps || docker-compose ps)`);
    await log(ps.stdout);

    conn.end();
    const url = enableHttps ? `https://${body.host}:${httpsPort}` : `http://${body.host}:${appPort}`;
    await log(`🚀 Deployment complete — accessible at ${url}`);

    (globalThis as any).__lastDeployResult = {
      url,
      supabase_local: installSupabase ? {
        url: supabaseUrlOverride,
        anon_key: supabaseAnonOverride,
        studio_url: `http://${body.host}:${supaStudioPort}`,
      } : null,
    };
  } catch (innerErr: any) {
    try { conn.end(); } catch (_) {}
    throw innerErr;
  }
}

// ===== Reset-only: connect via SSH and reset the default admin password =====
async function runResetAdminPassword(body: DeployBody, log: (m: string) => Promise<void> | void) {
  const port = body.port ?? 22;
  const remoteDir = body.remote_dir || "/opt/screenflow";
  const supaDir = `${remoteDir}/supabase`;
  const newPassword = (body.admin_password && body.admin_password.length >= 6)
    ? body.admin_password
    : "260390DS";

  await log(`→ Connexion SSH ${body.username}@${body.host}:${port}…`);
  const conn = await ssh({ host: body.host, port, username: body.username, password: body.password });
  await log("✓ SSH connecté");

  try {
    // Sanity check: the local Supabase stack must exist
    const check = await exec(conn, `[ -f ${supaDir}/docker-compose.yml ] && echo OK || echo MISSING`);
    if (!check.stdout.includes("OK")) {
      throw new Error(
        `Aucune installation Supabase locale trouvée dans ${supaDir}. ` +
        `Lancez d'abord un déploiement complet, ou ajustez 'remote_dir'.`
      );
    }
    await log(`✓ Stack Supabase locale détectée dans ${supaDir}`);

    await log("→ Vérification que Postgres est prêt…");
    await ensurePostgresSqlAccess(conn, supaDir, log);

    const kongPort = await readRemoteEnv(conn, `${supaDir}/.env`, "KONG_HTTP_PORT") || "8000";
    const publicUrl = await readRemoteEnv(conn, `${supaDir}/.env`, "SUPABASE_PUBLIC_URL") || await readRemoteEnv(conn, `${supaDir}/.env`, "API_EXTERNAL_URL") || `http://${body.host}:${kongPort}`;
    const anonKey = await readRemoteEnv(conn, `${supaDir}/.env`, "ANON_KEY") || await readRemoteEnv(conn, `${supaDir}/.env`, "SUPABASE_PUBLISHABLE_KEY");
    if (!anonKey) {
      throw new Error("Impossible de lire ANON_KEY dans " + supaDir + "/.env");
    }

    const serviceKey = await readRemoteEnv(conn, `${supaDir}/.env`, "SERVICE_ROLE_KEY") || await readRemoteEnv(conn, `${supaDir}/.env`, "SUPABASE_SECRET_KEY");
    if (!serviceKey) {
      throw new Error("Impossible de lire SERVICE_ROLE_KEY dans " + supaDir + "/.env");
    }

    await log("→ Création/réparation du premier compte admin via l'API Auth officielle…");
    await upsertDefaultAdminViaAuthApi(conn, supaDir, kongPort, serviceKey, newPassword, log);
    await ensureDefaultAdminRole(conn, supaDir, log);

    await log("→ Test réel du login admin local…");
    await ensureLocalAuthGateway(conn, supaDir, kongPort, log);
    await verifyAuthLoginFromServer(
      conn,
      `http://127.0.0.1:${kongPort}`,
      anonKey,
      DEFAULT_ADMIN_EMAIL,
      newPassword,
      log,
      buildDirectKongAuthLoginCommand(supaDir, anonKey, DEFAULT_ADMIN_EMAIL, newPassword),
    );
    await verifyPublicAuthLogin(publicUrl, anonKey, DEFAULT_ADMIN_EMAIL, newPassword, log);

    await log("✓ Mot de passe admin réinitialisé avec succès");
    await log("");
    await log("════════════════════════════════════════════════════════════");
    await log("🔐  COMPTE ADMINISTRATEUR — MOT DE PASSE RÉINITIALISÉ");
    await log("════════════════════════════════════════════════════════════");
    await log(`   Email            : screenflow@screenflow.local`);
    await log(`   Mot de passe     : ${newPassword}`);
    await log(`   Rôle             : admin (global)`);
    await log("   ⚠  Pensez à changer ce mot de passe après la connexion.");
    await log("════════════════════════════════════════════════════════════");

    (globalThis as any).__lastDeployResult = {
      action: "reset_admin_password",
      email: "screenflow@screenflow.local",
      password: newPassword,
    };
  } finally {
    try { conn.end(); } catch (_) {}
  }
}

// ===== Read-only check of the default admin account on the local self-hosted Supabase =====
async function runCheckAdminStatus(
  body: DeployBody,
  log: (m: string) => Promise<void> | void,
  persist: (patch: Record<string, unknown>) => Promise<void>,
) {
  const port = body.port ?? 22;
  const remoteDir = body.remote_dir || "/opt/screenflow";
  const supaDir = `${remoteDir}/supabase`;

  const result: {
    auth_user_exists: boolean;
    email_confirmed: boolean;
    has_admin_role: boolean;
    has_profile: boolean;
    can_login: boolean;
    user_id: string | null;
    public_url: string | null;
  } = {
    auth_user_exists: false,
    email_confirmed: false,
    has_admin_role: false,
    has_profile: false,
    can_login: false,
    user_id: null,
    public_url: null,
  };

  await log(`→ Connexion SSH ${body.username}@${body.host}:${port}…`);
  const conn = await ssh({ host: body.host, port, username: body.username, password: body.password });
  await log("✓ SSH connecté");

  try {
    const check = await exec(conn, `[ -f ${supaDir}/docker-compose.yml ] && echo OK || echo MISSING`);
    if (!check.stdout.includes("OK")) {
      throw new Error(
        `Aucune installation Supabase locale trouvée dans ${supaDir}. ` +
        `Lancez d'abord un déploiement complet.`
      );
    }
    await log(`✓ Stack Supabase locale détectée dans ${supaDir}`);

    await ensurePostgresSqlAccess(conn, supaDir, log);

    // 1. Check auth.users
    await log(`→ Recherche de ${DEFAULT_ADMIN_EMAIL} dans auth.users…`);
    const userQuery = await exec(
      conn,
      dockerPsqlSelect(supaDir, `select id::text || '|' || coalesce(email_confirmed_at::text,'') from auth.users where lower(email)=lower('${DEFAULT_ADMIN_EMAIL}') limit 1`)
    );
    const userLine = (userQuery.stdout || "").trim().split("\n").find(l => l.includes("|") && !l.startsWith("(")) || "";
    if (userLine) {
      const [uid, confirmed] = userLine.split("|");
      if (uid && uid.length > 10) {
        result.auth_user_exists = true;
        result.user_id = uid.trim();
        result.email_confirmed = !!(confirmed && confirmed.trim().length > 0);
        await log(`✓ Compte Auth trouvé (id=${result.user_id.slice(0, 8)}…, confirmé=${result.email_confirmed})`);
      }
    }
    if (!result.auth_user_exists) {
      await log(`✗ Aucun compte Auth pour ${DEFAULT_ADMIN_EMAIL}`);
    }

    // 2. Check public.user_roles
    if (result.auth_user_exists) {
      await log("→ Vérification du rôle admin dans public.user_roles…");
      const roleQuery = await exec(
        conn,
        dockerPsqlSelect(supaDir, `select 1 from public.user_roles where user_id='${result.user_id}' and role='admin' limit 1`)
      );
      result.has_admin_role = (roleQuery.stdout || "").trim().includes("1");
      await log(result.has_admin_role ? "✓ Rôle admin présent" : "✗ Rôle admin manquant");

      // 3. Profile
      const profileQuery = await exec(
        conn,
        dockerPsqlSelect(supaDir, `select 1 from public.profiles where id='${result.user_id}' limit 1`)
      );
      result.has_profile = (profileQuery.stdout || "").trim().includes("1");
      await log(result.has_profile ? "✓ Profil public trouvé" : "✗ Profil public manquant");
    }

    // 4. Real login test (only if user exists, role ok, with the default password)
    const kongPort = await readRemoteEnv(conn, `${supaDir}/.env`, "KONG_HTTP_PORT") || "8000";
    const publicUrl = await readRemoteEnv(conn, `${supaDir}/.env`, "SUPABASE_PUBLIC_URL")
      || await readRemoteEnv(conn, `${supaDir}/.env`, "API_EXTERNAL_URL")
      || `http://${body.host}:${kongPort}`;
    result.public_url = publicUrl;
    const anonKey = await readRemoteEnv(conn, `${supaDir}/.env`, "ANON_KEY")
      || await readRemoteEnv(conn, `${supaDir}/.env`, "SUPABASE_PUBLISHABLE_KEY");

    if (result.auth_user_exists && result.has_admin_role && anonKey) {
      await log("→ Test de login (mot de passe par défaut)…");
      try {
        await ensureLocalAuthGateway(conn, supaDir, kongPort, log);
        await verifyAuthLoginFromServer(
          conn,
          `http://127.0.0.1:${kongPort}`,
          anonKey,
          DEFAULT_ADMIN_EMAIL,
          DEFAULT_ADMIN_PASSWORD,
          log,
          buildDirectKongAuthLoginCommand(supaDir, anonKey, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD),
        );
        result.can_login = true;
        await log("✓ Login réel réussi avec le mot de passe par défaut");
      } catch (e: any) {
        await log("⚠ Login refusé : " + (e?.message || String(e)));
      }
    }

    await log("");
    await log("════════════════════════════════════════════════════════════");
    await log("📋  ÉTAT DU PREMIER COMPTE ADMIN");
    await log("════════════════════════════════════════════════════════════");
    await log(`   Email           : ${DEFAULT_ADMIN_EMAIL}`);
    await log(`   Compte Auth     : ${result.auth_user_exists ? "✓ existe" : "✗ absent"}`);
    await log(`   Email confirmé  : ${result.email_confirmed ? "✓" : "✗"}`);
    await log(`   Rôle admin      : ${result.has_admin_role ? "✓" : "✗"}`);
    await log(`   Profil public   : ${result.has_profile ? "✓" : "✗"}`);
    await log(`   Login fonctionne: ${result.can_login ? "✓ (mdp défaut)" : "✗ (mdp inconnu ou compte cassé)"}`);
    await log("════════════════════════════════════════════════════════════");

    await persist({ status: "running", check_result: result });
    (globalThis as any).__lastDeployResult = { action: "check_admin_status", ...result };
  } finally {
    try { conn.end(); } catch (_) {}
  }
}
