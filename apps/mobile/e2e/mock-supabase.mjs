/**
 * Nagemaakt Supabase-backend voor de end-to-end test. Antwoordt op precies de
 * endpoints die de app aanroept: anonieme aanmelding, map_reports,
 * report_details, nearby_reports, create_report, confirm_report en de
 * eigen-meldingenquery, met CORS zodat de browser hem mag aanspreken.
 *
 * Geen productiecode. Het doel is de app testen zonder afhankelijk te zijn van
 * een echt project, zodat CI dit ook kan draaien.
 */
import http from 'node:http';

const calls = [];
const USER_ID = '11111111-1111-1111-1111-111111111111';
const REPORTS = {
  'aaaa1111-2222-3333-4444-555566667777': {
    report_id: 'aaaa1111-2222-3333-4444-555566667777',
    kind: 'litter', size: 'bag', lat: 51.2194, lng: 4.4025, accuracy_m: 8.5,
    note: 'Zak naast het bankje', status: 'published',
    created_at: '2026-08-22T10:00:00Z', cleaned_at: null,
    confirm_count: 2, is_mine: false, photos: [],
  },
};

/** Ruwe afstand in meters, goed genoeg om "vlakbij" van "ver" te scheiden. */
function afstandM(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * 111_320;
  const dLng = (lng2 - lng1) * 111_320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

export function start(port) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json',
  };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      // Uploads (PUT met binaire data) zijn geen JSON; die parse mag niet crashen.
      let b = {};
      try { b = body ? JSON.parse(body) : {}; } catch { b = { bytes: body.length }; }
      calls.push({ url: req.url, method: req.method, body: b });

      // Signed upload-URL zoals de upload-url Edge Function (api/openapi.yaml).
      if (req.url.endsWith('/functions/v1/upload-url')) {
        const pad = `u/${USER_ID}/e2e-foto.jpg`;
        res.writeHead(200, cors);
        return res.end(JSON.stringify({
          upload_url: `http://127.0.0.1:${server.address().port}/storage/upload/${pad}`,
          storage_path: pad,
          expires_at: new Date(Date.now() + 600000).toISOString(),
        }));
      }
      if (req.url.startsWith('/storage/upload/') && req.method === 'PUT') {
        res.writeHead(200, cors); return res.end(JSON.stringify({ Key: req.url.slice(16) }));
      }

      if (req.url.startsWith('/auth/v1/signup') || req.url.startsWith('/auth/v1/token')) {
        res.writeHead(200, cors);
        return res.end(JSON.stringify({
          access_token: 'mock-jwt', token_type: 'bearer', expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh',
          user: { id: USER_ID, is_anonymous: true,
                  aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
                  created_at: '2026-08-24T00:00:00Z' },
        }));
      }

      if (req.url.endsWith('/rpc/map_reports')) {
        const rows = b.zoom >= 14
          ? [{ is_cluster: false, lng: 4.4025, lat: 51.2194, point_count: 1,
               report_id: 'aaaa1111-2222-3333-4444-555566667777', kind: 'litter', size: 'bag',
               has_photo: false, created_at: '2026-08-22T10:00:00Z' }]
          : [{ is_cluster: true, lng: 4.4025, lat: 51.2194, point_count: 23, report_id: null,
               kind: 'litter', size: 'piece', has_photo: true, created_at: '2026-08-22T10:00:00Z' },
             { is_cluster: true, lng: 4.4600, lat: 51.2170, point_count: 7, report_id: null,
               kind: 'litter', size: 'bag', has_photo: false, created_at: '2026-08-19T10:00:00Z' }];
        res.writeHead(200, cors); return res.end(JSON.stringify(rows));
      }

      if (req.url.endsWith('/rpc/report_details')) {
        const r = REPORTS[b.p_report_id];
        if (!r) { res.writeHead(400, cors); return res.end(JSON.stringify({ message: 'report_not_found' })); }
        res.writeHead(200, cors); return res.end(JSON.stringify(r));
      }

      // Zelfde contract als de echte functie: alles binnen de straal, met afstand.
      if (req.url.endsWith('/rpc/nearby_reports')) {
        const straal = Math.min(Math.max(b.p_radius_m ?? 50, 5), 500);
        const rows = Object.values(REPORTS)
          .filter((r) => r.status === 'published')
          .map((r) => ({
            report_id: r.report_id, kind: r.kind, size: r.size,
            distance_m: afstandM(b.p_lat, b.p_lng, r.lat, r.lng),
            created_at: r.created_at, has_photo: r.photos.length > 0,
          }))
          .filter((r) => r.distance_m <= straal);
        res.writeHead(200, cors); return res.end(JSON.stringify(rows));
      }

      if (req.url.endsWith('/rpc/create_report')) {
        if (!b.p_client_ref) {
          res.writeHead(400, cors);
          return res.end(JSON.stringify({ message: 'invalid_coordinates' }));
        }
        // Idempotent zoals de echte functie: zelfde client_ref → zelfde melding.
        const bestaand = Object.values(REPORTS).find((r) => r.client_ref === b.p_client_ref);
        if (bestaand) {
          res.writeHead(200, cors);
          return res.end(JSON.stringify({
            report_id: bestaand.report_id, status: bestaand.status,
            created_at: bestaand.created_at, idempotent: true,
          }));
        }
        const volgnr = Object.keys(REPORTS).length;
        const id = `bbbb2222-3333-4444-5555-66667777888${volgnr}`;
        REPORTS[id] = {
          report_id: id, client_ref: b.p_client_ref,
          kind: b.p_kind, size: b.p_size, lat: b.p_lat, lng: b.p_lng,
          accuracy_m: b.p_accuracy_m, note: b.p_note, status: 'published',
          created_at: new Date().toISOString(), cleaned_at: null,
          confirm_count: 0, is_mine: true, photos: [],
        };
        res.writeHead(200, cors);
        return res.end(JSON.stringify({
          report_id: id, status: 'published',
          created_at: REPORTS[id].created_at, nearby_count: 1,
        }));
      }

      if (req.url.endsWith('/rpc/confirm_report')) {
        const r = REPORTS[b.p_report_id];
        if (!r) { res.writeHead(400, cors); return res.end(JSON.stringify({ message: 'report_not_found' })); }
        r.confirm_count += 1;
        res.writeHead(200, cors);
        return res.end(JSON.stringify({ report_id: r.report_id, confirm_count: r.confirm_count }));
      }

      // PostgREST-lezing van eigen meldingen (tabblad "Mijn meldingen").
      if (req.url.startsWith('/rest/v1/reports')) {
        const rows = Object.values(REPORTS)
          .filter((r) => r.is_mine)
          .map((r) => ({
            id: r.report_id, kind: r.kind, size: r.size, status: r.status,
            note: r.note, created_at: r.created_at, photo_count: r.photos.length,
          }));
        res.writeHead(200, cors); return res.end(JSON.stringify(rows));
      }

      res.writeHead(404, cors); res.end(JSON.stringify({ message: 'not found' }));
    });
  }).listen(port);
  return { server, calls };
}
