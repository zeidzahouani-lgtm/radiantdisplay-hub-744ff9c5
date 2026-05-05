import { supabase } from "@/integrations/supabase/client";
import { getSupabasePublishableKey, supabaseEndpoint } from "@/lib/env";

export async function uploadMediaFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const ext = file.name.split('.').pop();
  const fileName = `${crypto.randomUUID()}.${ext}`;

  const bucketUrl = supabaseEndpoint(`/storage/v1/object/media/${fileName}`);
  const apiKey = getSupabasePublishableKey();

  // Use the authenticated user's JWT when available — Storage RLS often requires it.
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token || apiKey;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', bucketUrl, true);
    xhr.setRequestHeader('apikey', apiKey);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('x-upsert', 'false');
    if (file.type) xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      let detail = (xhr.responseText || '').slice(0, 300);
      if (xhr.status === 413) {
        detail = `Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo). Le proxy nginx limite la taille — redéployez l'application pour appliquer la nouvelle limite (1 Go).`;
      } else if (xhr.status === 401 || xhr.status === 403) {
        detail = `Storage refuse l'authentification (HTTP ${xhr.status}). Vérifiez que vous êtes connecté et que le bucket "media" autorise l'insertion. ${detail}`;
      } else if (xhr.status === 0) {
        detail = `Aucune réponse du serveur (${bucketUrl}). Vérifiez que le service Storage tourne (docker compose ps storage) et que nginx proxie /storage/v1/.`;
      } else if (xhr.status === 502 || xhr.status === 503 || xhr.status === 504) {
        detail = `Service Storage indisponible (HTTP ${xhr.status}). Redémarrez : docker compose restart storage rest kong. ${detail}`;
      }
      console.error('[upload-media] Upload failed', { status: xhr.status, url: bucketUrl, detail });
      reject(new Error(`Upload échoué (HTTP ${xhr.status}) — ${detail}`));
    };
    xhr.onerror = () => {
      console.error('[upload-media] Network/CORS error', { url: bucketUrl });
      reject(new Error(`Erreur réseau/CORS vers ${bucketUrl}. Vérifiez que /storage/v1/ est accessible depuis le navigateur.`));
    };

    xhr.send(file);
  });

  const { data } = supabase.storage.from('media').getPublicUrl(fileName);
  return data.publicUrl;
}

export function getMediaType(file: File): 'image' | 'video' {
  return file.type.startsWith('video') ? 'video' : 'image';
}
