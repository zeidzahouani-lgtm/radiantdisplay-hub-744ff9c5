# Déploiement local / self-hosted ScreenFlow

Ce projet est une application **React/Vite** qui parle à un backend Supabase compatible via :

- REST DB : `/rest/v1/*`
- Auth : `/auth/v1/*`
- Storage : `/storage/v1/*`
- Edge Functions : `/functions/v1/*`
- Realtime : `/realtime/v1/*`

> Important : une base PostgreSQL seule ne suffit pas. Le frontend utilise aussi Storage, Realtime et Functions. En local il faut donc une stack Supabase/self-hosted complète, ou remplacer ces services par des API équivalentes.

## 1. Variables requises

Créer `.env.local` depuis `.env.example` :

```bash
cp .env.example .env.local
nano .env.local
```

Variables frontend Vite :

| Variable | Obligatoire | Exemple local | Rôle |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL` | Oui | `http://IP_SERVEUR:8080` ou `http://IP_SERVEUR:8000` | URL publique Supabase accessible depuis le navigateur. Si elle pointe vers l'app (`8080`), nginx doit proxyfier `/rest/v1`, `/storage/v1`, `/functions/v1`, `/realtime/v1`, `/auth/v1`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Oui | clé `ANON_KEY` locale | Clé anon/publishable de l'instance locale. |
| `VITE_SUPABASE_PROJECT_ID` | Non | `local` | Identifiant informatif pour le build. |
| `DATABASE_URL` | Non côté frontend | `postgresql://postgres:...@localhost:5432/postgres` | Utilisé uniquement par scripts/CLI serveur. Jamais exposé au navigateur. |

Variables backend/Functions nécessaires côté stack Supabase locale :

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL` | URL interne utilisée par les functions, souvent `http://kong:8000`. |
| `SUPABASE_ANON_KEY` | Clé anon locale. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service locale pour migrations/restauration/functions admin. |
| `SUPABASE_DB_URL` ou `DATABASE_URL` | Connexion PostgreSQL pour scripts de maintenance. |
| `LOVABLE_API_KEY` | Requis seulement pour les fonctions IA (`ai-assistant`) si elles doivent fonctionner en local. |
| `SUPPORT_DRAVOX_SCREENFLOW_WEBHOOK_URL` | Optionnel : remplace le webhook support externe par défaut. |
| `SUPPORT_DRAVOX_DEVIS_WEBHOOK_URL` | Optionnel : remplace le webhook devis externe par défaut. |
| `DEVIS_WEBHOOK_SECRET`, `SUPPORT_DRAVOX_SERVICE_ROLE_KEY` | Optionnels selon synchronisation support/devis. |

## 2. Ordre exact d'installation locale

### Option recommandée : via la page SSH de l'application

1. Ouvrir **Admin > Sauvegarde / Déploiement SSH**.
2. Cocher l'installation du backend local/self-hosted.
3. Lancer le déploiement SSH complet.
4. Le script doit :
   - installer les conteneurs Supabase locaux ;
   - générer `ANON_KEY` et `SERVICE_ROLE_KEY` ;
   - appliquer `supabase/migrations/*.sql` dans l'ordre ;
   - synchroniser les Edge Functions ;
   - builder le frontend avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY` locaux ;
   - configurer nginx avec proxy vers `/rest/v1`, `/storage/v1`, `/functions/v1`, `/realtime/v1`, `/auth/v1`.

### Option manuelle Docker

1. Démarrer une stack Supabase locale/self-hosted et récupérer :
   - l'URL publique de Kong/API ;
   - `ANON_KEY` ;
   - `SERVICE_ROLE_KEY` ;
   - le mot de passe Postgres.
2. Renseigner `.env.local`.
3. Appliquer les migrations dans l'ordre chronologique :

```bash
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "Applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Si vous utilisez les conteneurs Supabase officiels :

```bash
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "Applying $f"
  docker compose exec -T --user postgres db \
    sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1' < "$f"
done
```

4. Déployer/synchroniser les functions dans l'instance locale (`supabase/functions/*`).
5. Rebuilder le frontend :

```bash
npm install
npm run diagnose:local
npm run build:local
```

6. Servir `dist/` via nginx, ou utiliser :

```bash
APP_PORT=8080 npm run deploy:local
```

## 3. Rebuild correct après modification env

Les variables `VITE_*` sont injectées **au moment du build**. Après changement de `.env.local`, il faut toujours rebuilder :

```bash
npm run diagnose:local
npm run build:local
docker compose up -d --build
```

Un simple restart nginx ne suffit pas si `VITE_SUPABASE_URL` ou la clé a changé.

## 4. Vérifier que la DB répond

Depuis le serveur :

```bash
npm run diagnose:local
```

Tests HTTP manuels :

```bash
curl -i "$VITE_SUPABASE_URL/rest/v1/establishments?select=id&limit=1" \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY"

curl -i "$VITE_SUPABASE_URL/storage/v1/object/list/media" \
  -X POST \
  -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  --data '{"limit":1}'
```

Dans le navigateur, la console affiche maintenant :

- `[local-env] Configuration frontend`
- `[local-env] Endpoints attendus`
- `[db-diagnostic] ...` en cas d'erreur DB/RLS/CORS/table absente

## 5. Tables et buckets attendus

Le code utilise ces tables :

`access_codes`, `app_settings`, `contents`, `email_actions`, `establishment_settings`, `establishments`, `inbox_emails`, `layout_regions`, `layouts`, `licenses`, `media`, `notifications`, `playlist_items`, `playlists`, `profiles`, `programs`, `schedules`, `screens`, `user_establishments`, `user_roles`, `video_walls`.

Les migrations créent aussi :

`ai_requests`, `password_reset_requests`, `registration_requests`.

Buckets requis :

- `media` public
- `uploads` public

Les migrations `supabase/migrations/20260306183319_*.sql` et `20260315030205_*.sql` créent les buckets/policies de storage nécessaires.

## 6. Diagnostic des erreurs fréquentes

### Variable manquante au démarrage

Symptôme : écran bloqué avant chargement, console `[local-env]`.

Solution : corriger `.env.local`, puis rebuilder.

### URL Supabase invalide

Symptôme : `Failed to fetch`, `NetworkError`, appels vers `undefined/rest/v1`.

Solution : `VITE_SUPABASE_URL` doit commencer par `http://` ou `https://` et être accessible depuis le navigateur client, pas seulement depuis le serveur.

### Clé invalide

Symptôme : HTTP 401/403, `Invalid API key`, erreurs JWT.

Solution : utiliser `ANON_KEY` locale comme `VITE_SUPABASE_PUBLISHABLE_KEY`. Vérifier que `JWT_SECRET`, `ANON_KEY` et `SERVICE_ROLE_KEY` appartiennent à la même instance.

### Table ou colonne absente

Symptôme : `relation does not exist`, `column does not exist`, code `42P01` ou `42703`.

Solution : réappliquer toutes les migrations dans l'ordre. Ne pas appliquer seulement les dernières.

### Erreur RLS / permission

Symptôme : `new row violates row-level security policy`.

Solution : appliquer les migrations du mode public local, notamment `20260427234122_*.sql` et `20260427234148_*.sql`.

### Edge Function non joignable

Symptôme : `Failed to send a request to the Edge Function`, wizard bloqué, restauration impossible.

Solution : vérifier que nginx proxyfie `/functions/v1/` vers Kong/Supabase local, et que les headers `Authorization`, `apikey`, `X-Client-Info` sont transmis.

### CORS

Symptôme : erreur CORS dans la console.

Solution : utiliser le proxy nginx même domaine (`VITE_SUPABASE_URL=http://IP_SERVEUR:8080`) ou configurer Kong/functions pour accepter l'origine de l'application.

## 7. Dépendances qui ne sont pas purement locales

Certaines fonctions peuvent appeler des services externes :

- `ai-assistant` : nécessite `LOVABLE_API_KEY` ou remplacement par un provider IA local/externe.
- `generate-devis`, `invite-user`, `sync-client-dravox` : synchronisation support Dravox. Les URLs sont maintenant configurables via secrets/env (`SUPPORT_DRAVOX_*_WEBHOOK_URL`).
- Email/IMAP/SMTP : nécessite les paramètres stockés dans `app_settings` et les secrets correspondants.

Le cœur local — établissements, écrans, médias, playlists, programmes, layouts, player, storage, realtime — nécessite une stack Supabase complète, pas Lovable Cloud.
