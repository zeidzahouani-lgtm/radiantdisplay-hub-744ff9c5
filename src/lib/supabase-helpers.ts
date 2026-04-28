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

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', bucketUrl, true);
    xhr.setRequestHeader('apikey', apiKey);
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed: network/CORS'));

    xhr.send(file);
  });

  const { data } = supabase.storage.from('media').getPublicUrl(fileName);
  return data.publicUrl;
}

export function getMediaType(file: File): 'image' | 'video' {
  return file.type.startsWith('video') ? 'video' : 'image';
}
