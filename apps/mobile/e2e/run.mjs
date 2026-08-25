/**
 * End-to-end test van de app: de echte web-build in een echte browser, tegen
 * een nagemaakt backend. Dit is het verschil tussen "de app compileert" en
 * "de app werkt".
 *
 * Draaien:
 *   pnpm --filter @civiceye/mobile exec expo export --platform web --output-dir dist
 *   pnpm test:e2e
 *
 * De build moet naar http://127.0.0.1:8811 wijzen, want EXPO_PUBLIC_-variabelen
 * worden bij het bundelen ingebakken. `pnpm e2e:build` zet die variabelen.
 *
 * Viewport 390x844 = iPhone-formaat, het kleinste "moet"-toestel uit de
 * device-matrix in docs/10-rollout-en-testplan.md.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { start } from './mock-supabase.mjs';
import { serveStatic } from './static-server.mjs';

const HIER = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.resolve(HIER, '..', 'dist');
// Statische server met SPA-rewrite (zie static-server.mjs).
const web = serveStatic(DIST, 8810);

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

// iPhone-formaat: het kleinste "moet"-toestel uit de device-matrix. De
// meldflow vraagt GPS; we geven de browser een positie vlak bij de bestaande
// melding, zodat óók de duplicaatvraag ("hier is al iets gemeld") getest wordt.
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  geolocation: { latitude: 51.21945, longitude: 4.40255, accuracy: 8 },
  permissions: ['geolocation'],
});
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
// Een canvas dat bestaat zegt niets: eerder tekende de kaart niets omdat de
// web worker van maplibre ontbrak, en die test stond toch op groen. Daarom
// vragen we de kaart nu zelf wat hij getekend heeft.
const canvas = await page.locator('canvas.maplibregl-canvas').count();
check('MapLibre tekent een canvas', canvas === 1, `${canvas} canvas-elementen`);

const kaart = await page.evaluate(() => {
  const m = globalThis.__civicEyeMap;
  if (!m) return { fout: 'geen kaartinstantie' };
  return {
    styleLoaded: m.isStyleLoaded(),
    lagen: (m.getStyle()?.layers ?? []).map((l) => l.id),
    gerenderd: m.queryRenderedFeatures({ layers: ['meldingen-bel'] }).length,
  };
});
check('de kaartstijl raakt volledig geladen', kaart.styleLoaded === true,
  JSON.stringify(kaart));
check('er staan markers op de kaart, niet alleen in de state',
  (kaart.gerenderd ?? 0) > 0, `${kaart.gerenderd} gerenderde markers`);

// De worker van maplibre wordt door Metro niet meegebundeld en komt uit
// public/. Wordt hij door de SPA-fallback als HTML geserveerd, dan parseert de
// kaartbron nooit en blijft de kaart leeg.
const worker = await page.evaluate(async () => {
  const res = await fetch('/maplibre/maplibre-gl-worker.mjs');
  const tekst = await res.text();
  return { status: res.status, isHtml: tekst.trimStart().toLowerCase().startsWith('<!doctype') };
});
check('de maplibre-worker wordt als javascript geserveerd',
  worker.status === 200 && !worker.isHtml, JSON.stringify(worker));

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

// --- 10. de meldflow: locatie → grootte → duplicaatvraag → posten ---
huidigePagina = '/report/nieuw';
await page.goto('http://127.0.0.1:8810/report/nieuw', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const locatieStap = (await page.textContent('body')) ?? '';
check('meldflow start met de locatievraag', locatieStap.includes('Waar ligt het afval'),
  locatieStap.slice(0, 60).trim());
check('meldflow toont de GPS-nauwkeurigheid of een pin-hint',
  /±\s*8\s*m|Controleer de pin|versleep de kaart/i.test(locatieStap));

await page.getByRole('button', { name: 'Deze plek klopt' }).click();
await page.waitForTimeout(400);
const typeStap = (await page.textContent('body')) ?? '';
check('typekeuze toont de drie groottes',
  typeStap.includes('Papiertje') && typeStap.includes('Afvalzak') && typeStap.includes('Afvalhoop'));

// De mock heeft al een melding op ~10 m van de GPS-positie: de duplicaatvraag
// moet verschijnen vóór er gepost wordt.
await page.getByRole('button', { name: /Afvalzak/ }).click();
await page.waitForTimeout(1200);
const dupStap = (await page.textContent('body')) ?? '';
check('duplicaatvraag verschijnt bij een melding vlakbij',
  dupStap.includes('Hier is al iets gemeld'), dupStap.slice(0, 60).trim());
check('nearby_reports wordt vóór het posten aangeroepen',
  api.calls.some((c) => c.url.endsWith('/rpc/nearby_reports')));
check('er is nog niets gepost vóór de duplicaatkeuze',
  !api.calls.some((c) => c.url.endsWith('/rpc/create_report')));

await page.getByRole('button', { name: 'Toch apart melden' }).click();
await page.waitForTimeout(1500);

const postCalls = api.calls.filter((c) => c.url.endsWith('/rpc/create_report'));
check('create_report wordt aangeroepen', postCalls.length === 1, `${postCalls.length} aanroepen`);
if (postCalls.length) {
  const b = postCalls[0].body;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  check('post bevat een uuid-v4 client_ref (idempotentie)', uuidRe.test(b.p_client_ref ?? ''),
    String(b.p_client_ref));
  check('post bevat de pinlocatie (GPS-positie)',
    Math.abs(b.p_lat - 51.21945) < 0.001 && Math.abs(b.p_lng - 4.40255) < 0.001,
    `${b.p_lat}, ${b.p_lng}`);
  check('post bevat type, grootte, platform en nauwkeurigheid',
    b.p_kind === 'litter' && b.p_size === 'bag' && b.p_client === 'web' && b.p_accuracy_m === 8,
    JSON.stringify({ kind: b.p_kind, size: b.p_size, client: b.p_client, acc: b.p_accuracy_m }));
}

check('na het posten staat de gebruiker terug op de kaart',
  new URL(page.url()).pathname === '/', page.url());

// --- 11. de eigen melding staat in "Mijn meldingen" ---
huidigePagina = '/mine';
await page.goto('http://127.0.0.1:8810/mine', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const mijn = (await page.textContent('body')) ?? '';
check('mijn meldingen toont de zonet gemaakte melding',
  mijn.includes('Afvalzak') && mijn.includes('op de kaart'), mijn.slice(0, 80).trim());

// --- 12. offline melden: de outbox houdt de melding vast tot het netwerk terug is ---
huidigePagina = '/';
await page.goto('http://127.0.0.1:8810/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const postsVoorOffline = api.calls.filter((c) => c.url.endsWith('/rpc/create_report')).length;

await page.context().setOffline(true);
await page.getByRole('button', { name: 'Afval melden' }).click();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Deze plek klopt' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Papiertje/ }).click();
await page.waitForTimeout(2500);

check('offline post bereikt de server niet (blijft in de outbox)',
  api.calls.filter((c) => c.url.endsWith('/rpc/create_report')).length === postsVoorOffline);
const offlineBody = (await page.textContent('body')) ?? '';
check('de kaart toont de zichtbare wachtrij ("wacht op verbinding")',
  offlineBody.includes('wacht op verbinding'), offlineBody.slice(0, 80).trim());

// Netwerk terug: expo-network hoort het online-event; de 15s-timer is de terugval.
await page.context().setOffline(false);
let doorgekomen = false;
for (let i = 0; i < 25 && !doorgekomen; i++) {
  await page.waitForTimeout(1000);
  doorgekomen =
    api.calls.filter((c) => c.url.endsWith('/rpc/create_report')).length > postsVoorOffline;
}
check('netwerk terug → de wachtende melding gaat alsnog door (scenario 14)', doorgekomen);
const laatstePost = api.calls.filter((c) => c.url.endsWith('/rpc/create_report')).at(-1)?.body ?? {};
check('de wachtende melding heeft grootte en een uuid client_ref (scenario 13)',
  laatstePost.p_size === 'piece'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(laatstePost.p_client_ref ?? ''),
  JSON.stringify({ size: laatstePost.p_size, ref: laatstePost.p_client_ref }));
await page.waitForTimeout(1000);
const naOnline = (await page.textContent('body')) ?? '';
check('de wachtrijbanner verdwijnt zodra alles verzonden is',
  !naOnline.includes('wacht op verbinding'));

check('geen onafgehandelde JS-fouten in de hele run', pageErrors.length === 0,
  pageErrors.slice(0, 2).join(' | '));

await browser.close();
web.close(); api.server.close();
console.log(mislukt === 0 ? '\n✓ sprint 1 + 2 + 3 werken end-to-end' : `\n✗ ${mislukt} check(s) gefaald`);
process.exit(mislukt === 0 ? 0 : 1);
