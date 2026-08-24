/**
 * End-to-end test van de app: de echte web-build in een echte browser, tegen
 * een nagemaakt backend. Dit is het verschil tussen "de app compileert" en
 * "de app werkt".
 *
 * Draaien:
 *   pnpm --filter @gc/mobile exec expo export --platform web --output-dir dist
 *   pnpm test:e2e
 *
 * De build moet naar http://127.0.0.1:8811 wijzen, want EXPO_PUBLIC_-variabelen
 * worden bij het bundelen ingebakken. `pnpm e2e:build` zet die variabelen.
 *
 * Viewport 390x844 = iPhone-formaat, het kleinste "moet"-toestel uit de
 * device-matrix in docs/10-rollout-en-testplan.md.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { start } from './mock-supabase.mjs';

const HIER = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.resolve(HIER, '..', 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
               '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.map': 'application/json' };

// Statische server voor de geëxporteerde app (met Expo-router fallbacks).
const web = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(DIST, p);
  if (p === '/' ) file = path.join(DIST, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const alt = path.join(DIST, p + '.html');
    if (fs.existsSync(alt)) {
      file = alt;
    } else {
      // Dynamische route: Expo exporteert die als report/[id].html. Zonder deze
      // rewrite serveer je index.html en krijg je een hydratiefout — precies wat
      // een verkeerd geconfigureerde host doet.
      const delen = p.split('/').filter(Boolean);
      const dyn = path.join(DIST, ...delen.slice(0, -1), '[id].html');
      file = fs.existsSync(dyn) ? dyn : path.join(DIST, 'index.html');
    }
  }
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(e));
  }
}).listen(8810);

const api = start(8811);

let mislukt = 0;
const check = (naam, ok, extra = '') => {
  console.log(`${ok ? 'ok   ' : 'FOUT '}— ${naam}${extra ? ' :: ' + extra : ''}`);
  if (!ok) mislukt++;
};

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('Geen web-build gevonden. Draai eerst: pnpm e2e:build');
  process.exit(1);
}

// SwiftShader: headless CI heeft geen GPU, maar MapLibre heeft WebGL nodig.
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

// iPhone-formaat: het kleinste "moet"-toestel uit de device-matrix.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];
let huidigePagina = '/';
const consoleErrors = [];
page.on('pageerror', (e) => { pageErrors.push(`[${huidigePagina}] ${e.message.slice(0, 90)}`); });
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

huidigePagina = '/';
await page.goto('http://127.0.0.1:8810/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

// --- 1. de app start ---
check('app start zonder JS-fouten', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

// --- 2. anonieme sessie wordt aangevraagd ---
check('app vraagt stil een anonieme sessie aan',
  api.calls.some((c) => c.url.includes('/auth/v1/signup')));

// --- 3. kaartquery met een zinnige bbox ---
const mapCalls = api.calls.filter((c) => c.url.endsWith('/rpc/map_reports'));
check('kaartquery wordt uitgevoerd', mapCalls.length > 0, `${mapCalls.length} aanroepen`);
if (mapCalls.length) {
  const b = mapCalls[0].body;
  const geldig = b.min_lng < b.max_lng && b.min_lat < b.max_lat
    && b.min_lng > 3 && b.max_lng < 6 && b.min_lat > 50 && b.max_lat < 52
    && b.zoom >= 1 && b.zoom <= 22;
  check('bbox en zoom zijn geldig en rond Antwerpen', geldig, JSON.stringify(b));
  check('kinds/include_cleaned worden meegestuurd',
    'include_cleaned' in b && 'kinds' in b, JSON.stringify({ kinds: b.kinds, ic: b.include_cleaned }));
}

// --- 4. de data komt in de UI terecht ---
const badge = await page.textContent('body');
check('badge sommeert clusters (23+7=30 meldingen)', /30 meldingen/.test(badge ?? ''),
  (badge ?? '').match(/\d+ meldingen/)?.[0] ?? 'niet gevonden');

// --- 5. de kaart rendert echt ---
const canvas = await page.locator('canvas.maplibregl-canvas').count();
check('MapLibre tekent een canvas', canvas === 1, `${canvas} canvas-elementen`);

// --- 6. de meldknop staat er, met de juiste raakvlakhoogte ---
const knop = page.getByRole('button', { name: 'Afval melden' });
const box = await knop.boundingBox();
check('meldknop is aanwezig en minstens 44 pt hoog', !!box && box.height >= 44,
  box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'niet gevonden');
check('meldknop staat rechtsonder (bereikbaar met één hand)',
  !!box && box.x + box.width > 390 * 0.6 && box.y > 844 * 0.7);

// --- 7. detailscherm haalt een melding op ---
huidigePagina = '/report/aaaa1111-2222-3333-4444-555566667777';
await page.goto('http://127.0.0.1:8810/report/aaaa1111-2222-3333-4444-555566667777',
  { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const detail = (await page.textContent('body')) ?? '';
check('detailscherm toont de melding', detail.includes('Afvalzak'), detail.slice(0, 40).trim());
check('detailscherm toont de notitie', detail.includes('Zak naast het bankje'));
check('detailscherm toont GPS-nauwkeurigheid', /±\s*9?\s*m|± 9 m|± 8 m/.test(detail) || detail.includes('± 9 m'),
  detail.match(/±[^·\n]{0,8}/)?.[0] ?? 'niet gevonden');

// --- 8. onbestaande melding geeft een nette fout ---
huidigePagina = '/report/00000000-0000-0000-0000-000000000000';
await page.goto('http://127.0.0.1:8810/report/00000000-0000-0000-0000-000000000000',
  { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const nietGevonden = (await page.textContent('body')) ?? '';
check('onbestaande melding geeft een Nederlandse fout, geen crash',
  nietGevonden.includes('bestaat niet meer'), nietGevonden.slice(0, 50).trim());

// --- 9. instellingenscherm als diagnose ---
huidigePagina = '/settings';
await page.goto('http://127.0.0.1:8810/settings', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const inst = (await page.textContent('body')) ?? '';
check('instellingen tonen de omgeving en het backend', inst.includes('127.0.0.1:8811'));
check('instellingen tonen de sessiestatus', /Anonieme sessie/.test(inst));
check('instellingen melden dat er geen kaartkey is', inst.includes('geen key'));

// --- 10. de meldflow-route legt eerlijk uit dat ze nog niet bestaat ---
huidigePagina = '/report/nieuw';
await page.goto('http://127.0.0.1:8810/report/nieuw', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
const nieuw = (await page.textContent('body')) ?? '';
check('/report/nieuw legt uit dat melden nog komt', nieuw.includes('volgende versie'));

check('geen onafgehandelde JS-fouten in de hele run', pageErrors.length === 0,
  pageErrors.slice(0, 2).join(' | '));

await browser.close();
web.close(); api.server.close();
console.log(mislukt === 0 ? '\n✓ sprint 1 werkt end-to-end' : `\n✗ ${mislukt} check(s) gefaald`);
process.exit(mislukt === 0 ? 0 : 1);
