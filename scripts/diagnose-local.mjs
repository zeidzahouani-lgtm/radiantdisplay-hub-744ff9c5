import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function parseEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, '')];
      })
  );
}

const env = {
  ...parseEnvFile(resolve('.env')),
  ...parseEnvFile(resolve('.env.local')),
  ...process.env,
};

const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
let failed = false;

console.log('== Diagnostic local ScreenFlow ==');
for (const name of required) {
  const value = (env[name] || '').trim();
  const ok = name.endsWith('_URL') ? /^https?:\/\/.+/.test(value) : value.length > 40;
  console.log(`${ok ? '✓' : '✗'} ${name}: ${value ? 'présent' : 'absent'}`);
  if (!ok) failed = true;
}
console.log(`${env.VITE_SUPABASE_PROJECT_ID ? '✓' : '·'} VITE_SUPABASE_PROJECT_ID: ${env.VITE_SUPABASE_PROJECT_ID || 'optionnel'}`);
console.log(`${env.DATABASE_URL ? '✓' : '·'} DATABASE_URL: ${env.DATABASE_URL ? 'présent (scripts/CLI seulement)' : 'optionnel'}`);

const migrationsDir = resolve('supabase/migrations');
const migrations = existsSync(migrationsDir) ? readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort() : [];
console.log(`✓ Migrations détectées: ${migrations.length}`);
if (migrations.length) {
  console.log(`  Première: ${migrations[0]}`);
  console.log(`  Dernière : ${migrations[migrations.length - 1]}`);
}

const base = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
if (base && key && globalThis.fetch) {
  const checks = [
    ['REST establishments', `${base}/rest/v1/establishments?select=id&limit=1`, { apikey: key, Authorization: `Bearer ${key}` }],
    ['Storage media', `${base}/storage/v1/object/list/media`, { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, 'POST', JSON.stringify({ limit: 1 })],
    ['Functions route', `${base}/functions/v1/`, { apikey: key, Authorization: `Bearer ${key}` }],
  ];
  for (const [label, url, headers, method = 'GET', body] of checks) {
    try {
      const response = await fetch(url, { method, headers, body });
      const ok = response.status < 500 && response.status !== 404;
      console.log(`${ok ? '✓' : '✗'} ${label}: HTTP ${response.status}`);
      if (!ok) failed = true;
    } catch (error) {
      console.log(`✗ ${label}: ${error.message}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('\nDiagnostic échoué: vérifiez .env.local, le proxy /rest/v1 /storage/v1 /functions/v1, les clés ANON_KEY et les migrations.');
  process.exit(1);
}
console.log('\nDiagnostic OK. Vous pouvez lancer le build local.');
