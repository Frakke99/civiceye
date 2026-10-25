/**
 * POST /functions/v1/upload-url — signed upload-URL voor één foto.
 *
 * De app uploadt rechtstreeks naar de privébucket `photo-inbox` en geeft het
 * teruggekregen `storage_path` mee aan `create_report` (api/openapi.yaml).
 * De bucket heeft geen leespolicy; publiceren gebeurt pas na de scan
 * (docs/adr/0005-foto-pipeline.md).
 *
 * Rate limit: 30 uploads per uur per gebruiker. Het pad begint met de user-id,
 * dus tellen op het padvoorvoegsel in storage.objects is genoeg — geen extra
 * tabel nodig.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TOEGELATEN_TYPES = ['image/jpeg', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // moet gelijk blijven aan db/migrations/0005_storage.sql
const LIMIET_PER_UUR = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function antwoord(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return antwoord(405, { message: 'invalid_action' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Wie vraagt dit? De anon-client met het JWT van de aanroeper valideert het
  // token; de service-client hieronder doet daarna het echte werk.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return antwoord(401, { message: 'not_authenticated' });
  }
  const uid = userData.user.id;

  let body: { content_type?: string; bytes?: number };
  try {
    body = await req.json();
  } catch {
    return antwoord(400, { message: 'invalid_action' });
  }
  if (!body.content_type || !TOEGELATEN_TYPES.includes(body.content_type)) {
    return antwoord(400, { message: 'invalid_action', detail: 'content_type' });
  }
  if (!Number.isFinite(body.bytes) || body.bytes! <= 0 || body.bytes! > MAX_BYTES) {
    return antwoord(400, { message: 'invalid_action', detail: 'bytes' });
  }

  const service = createClient(supabaseUrl, serviceKey);

  // Rate limit op het padvoorvoegsel: elke upload van deze gebruiker leeft
  // onder u/<uid>/.
  const uurGeleden = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: telError } = await service
    .schema('storage')
    .from('objects')
    .select('id', { count: 'exact', head: true })
    .eq('bucket_id', 'photo-inbox')
    .like('name', `u/${uid}/%`)
    .gte('created_at', uurGeleden);
  if (telError) {
    console.error('rate-limitquery faalde:', telError.message);
    return antwoord(500, { message: 'unknown' });
  }
  if ((count ?? 0) >= LIMIET_PER_UUR) {
    return antwoord(429, { message: 'rate_limited', detail: 'hour' });
  }

  const extensie = body.content_type === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `u/${uid}/${crypto.randomUUID()}.${extensie}`;

  const { data: signed, error: signError } = await service.storage
    .from('photo-inbox')
    .createSignedUploadUrl(storagePath);
  if (signError || !signed) {
    console.error('signed url faalde:', signError?.message);
    return antwoord(500, { message: 'unknown' });
  }

  return antwoord(200, {
    upload_url: signed.signedUrl,
    storage_path: storagePath,
    // Supabase tekent voor 2 uur; het contract belooft minstens 10 minuten.
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
});
