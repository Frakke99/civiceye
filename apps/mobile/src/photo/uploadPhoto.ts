import { env } from '@/config/env';
import { supabase } from '@/api/supabase';
import { ApiError } from '@/api/reports';

/**
 * Upload naar de privébucket `photo-inbox`, in twee stappen (api/openapi.yaml):
 *   1. POST /functions/v1/upload-url → signed URL + storage_path
 *   2. PUT van de bytes naar die URL
 * Het `storage_path` gaat daarna mee met `create_report`; publiek wordt de
 * foto pas na de veiligheidsscan (ADR 0005).
 *
 * Fouten gooien een ApiError zodat de outbox ze met dezelfde codetabel kan
 * beoordelen als een mislukte post.
 */
export async function uploadPhoto(localUri: string): Promise<string> {
  // Lokale bestanden (file:// op native, blob:/data: op web) zijn via fetch
  // als Blob te lezen — dat werkt op alle drie de platformen.
  const bestand = await fetch(localUri);
  const blob = await bestand.blob();

  const { data: sessie } = await supabase.auth.getSession();
  const token = sessie.session?.access_token;
  if (!token) throw new ApiError('not_authenticated');

  const antwoord = await fetch(`${env.supabaseUrl.replace(/\/$/, '')}/functions/v1/upload-url`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      apikey: env.supabaseAnonKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ content_type: 'image/jpeg', bytes: blob.size }),
  });
  if (!antwoord.ok) {
    const fout = (await antwoord.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(fout.message ?? `upload-url gaf ${antwoord.status}`);
  }
  const { upload_url, storage_path } = (await antwoord.json()) as {
    upload_url: string;
    storage_path: string;
  };

  const upload = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: blob,
  });
  if (!upload.ok) {
    throw new ApiError(`upload gaf ${upload.status}`);
  }

  return storage_path;
}
