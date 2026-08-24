/**
 * Nagemaakt Supabase-backend voor de end-to-end test. Antwoordt op precies de
 * endpoints die de app aanroept: anonieme aanmelding, map_reports en
 * report_details, met CORS zodat de browser hem mag aanspreken.
 *
 * Geen productiecode. Het doel is de app testen zonder afhankelijk te zijn van
 * een echt project, zodat CI dit ook kan draaien.
 */
import http from 'node:http';

const calls = [];
const REPORTS = {
  'aaaa1111-2222-3333-4444-555566667777': {
    report_id: 'aaaa1111-2222-3333-4444-555566667777',
    kind: 'litter', size: 'bag', lat: 51.2194, lng: 4.4025, accuracy_m: 8.5,
    note: 'Zak naast het bankje', status: 'published',
    created_at: '2026-08-22T10:00:00Z', cleaned_at: null,
    confirm_count: 2, is_mine: false, photos: [],
  },
};

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
      const b = body ? JSON.parse(body) : {};
      calls.push({ url: req.url, body: b });

      if (req.url.startsWith('/auth/v1/signup') || req.url.startsWith('/auth/v1/token')) {
        res.writeHead(200, cors);
        return res.end(JSON.stringify({
          access_token: 'mock-jwt', token_type: 'bearer', expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh',
          user: { id: '11111111-1111-1111-1111-111111111111', is_anonymous: true,
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

      res.writeHead(404, cors); res.end(JSON.stringify({ message: 'not found' }));
    });
  }).listen(port);
  return { server, calls };
}
