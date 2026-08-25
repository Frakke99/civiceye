/**
 * POST /functions/v1/scan-photo — intern, aangeroepen door de storage-webhook
 * bij een INSERT in `photo-inbox` (docs/adr/0005-foto-pipeline.md).
 *
 *   scan → veilig     → kopiëren naar photo-public + complete_photo_scan('safe')
 *        → verdacht   → complete_photo_scan('flagged') → melding in quarantaine
 *        → vastgelopen → foto blijft ongescand in de inbox; nooit publiek
 *
 * De scanner is inwisselbaar via SCAN_PROVIDER. 'mock' keurt alles goed en is
 * de eerste stap uit het implementatieplan: de hele pijplijn werkt en is te
 * testen vóór er een vision-API bij komt. Falen is restrictief: er bestaat
 * geen pad waarlangs een ongescande foto publiek wordt.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*' };

interface ScanUitslag {
  status: 'safe' | 'flagged';
  labels: Record<string, unknown> | null;
}

/**
 * De inwisselbare scanner. Een echte provider krijgt hier de bytes en geeft
 * 'flagged' terug bij personen, nummerplaten of ongepaste inhoud.
 */
async function scan(provider: string, _bytes: Uint8Array): Promise<ScanUitslag> {
  switch (provider) {
    case 'mock':
      return { status: 'safe', labels: { provider: 'mock' } };
    default:
      // Onbekende provider is een configuratiefout: niet publiceren.
      throw new Error(`onbekende SCAN_PROVIDER: ${provider}`);
  }
}

/**
 * De webhook kan vuren vóór create_report de report_photos-rij schreef (de
 * client uploadt eerst). Tot een minuut opnieuw proberen dekt dat venster.
 */
async function vindFotoRij(
  service: SupabaseClient,
  storagePath: string,
): Promise<{ id: string } | null> {
  for (let poging = 0; poging < 12; poging++) {
    const { data } = await service
      .from('report_photos')
      .select('id')
      .eq('storage_path', storagePath)
      .eq('bucket', 'photo-inbox')
      .maybeSingle();
    if (data) return data;
    await new Promise((klaar) => setTimeout(klaar, 5_000));
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ message: 'invalid_action' }), {
      status: 405,
      headers: CORS,
    });
  }

  // Gedeeld geheim: zonder deze check kan iedereen met de functie-URL scans
  // forceren of vervalsen.
  const geheim = Deno.env.get('SCAN_WEBHOOK_SECRET') ?? '';
  if (geheim.length === 0 || req.headers.get('x-webhook-secret') !== geheim) {
    return new Response(JSON.stringify({ message: 'forbidden' }), { status: 403, headers: CORS });
  }

  // Supabase-databasewebhook: { type: 'INSERT', table, schema, record: {...} }.
  let payload: { record?: { bucket_id?: string; name?: string } };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ message: 'invalid_action' }), {
      status: 400,
      headers: CORS,
    });
  }
  const bucket = payload.record?.bucket_id;
  const storagePath = payload.record?.name;
  if (bucket !== 'photo-inbox' || !storagePath) {
    // Andere buckets zijn geen fout — de webhook mag breed geconfigureerd staan.
    return new Response(JSON.stringify({ skipped: true }), { status: 200, headers: CORS });
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const fotoRij = await vindFotoRij(service, storagePath);
  if (!fotoRij) {
    // Upload zonder melding: laten staan, purge_old_data ruimt de inbox op.
    console.warn('geen report_photos-rij voor', storagePath);
    return new Response(JSON.stringify({ pending: true }), { status: 200, headers: CORS });
  }

  const { data: bestand, error: leesFout } = await service.storage
    .from('photo-inbox')
    .download(storagePath);
  if (leesFout || !bestand) {
    console.error('download faalde:', leesFout?.message);
    return new Response(JSON.stringify({ message: 'photo_not_found' }), {
      status: 500,
      headers: CORS,
    });
  }
  const bytes = new Uint8Array(await bestand.arrayBuffer());

  let uitslag: ScanUitslag;
  try {
    uitslag = await scan(Deno.env.get('SCAN_PROVIDER') ?? 'mock', bytes);
  } catch (e) {
    // Scanner stuk ≠ foto fout: ongescand laten, de webhook-retry of een
    // latere sweep probeert opnieuw. Nooit publiceren bij twijfel.
    console.error('scan faalde:', e instanceof Error ? e.message : String(e));
    return new Response(JSON.stringify({ message: 'unknown' }), { status: 500, headers: CORS });
  }

  let doelBucket = 'photo-inbox';
  if (uitslag.status === 'safe') {
    // Kopiëren + verwijderen (move over buckets heen is copy+remove).
    const { error: kopieFout } = await service.storage
      .from('photo-inbox')
      .copy(storagePath, storagePath, { destinationBucket: 'photo-public' });
    if (kopieFout && !/already exists/i.test(kopieFout.message)) {
      console.error('kopie naar photo-public faalde:', kopieFout.message);
      return new Response(JSON.stringify({ message: 'unknown' }), { status: 500, headers: CORS });
    }
    await service.storage.from('photo-inbox').remove([storagePath]);
    doelBucket = 'photo-public';
  }

  const { error: rpcFout } = await service.rpc('complete_photo_scan', {
    p_photo_id: fotoRij.id,
    p_status: uitslag.status,
    p_bucket: doelBucket,
    p_labels: uitslag.labels,
    p_bytes: bytes.byteLength,
  });
  if (rpcFout) {
    console.error('complete_photo_scan faalde:', rpcFout.message);
    return new Response(JSON.stringify({ message: 'unknown' }), { status: 500, headers: CORS });
  }

  return new Response(JSON.stringify({ photo_id: fotoRij.id, status: uitslag.status }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
});
