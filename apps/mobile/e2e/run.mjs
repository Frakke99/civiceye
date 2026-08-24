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

// iPhone-formaat: het kleinste "moet"-toestel uit de device-matrix.
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const pageErrors = [];
let huidigePagina = '/';
const consoleErrors = [];
page.on('pageerror', (e) => { pageErrors.push(`[${huidigePagina}] ${e.message.slice(0, 90)}`); });
page.on('console', (m) => {
  // "Failed to load resource" is de browser die een 4xx logt; een 400 op een
  // onbestaande melding is hier verwácht gedrag (check 8). Echte fouten uit
  // onze eigen code hebben een eigen boodschap.
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
    consoleErrors.push(`[${huidigePagina}] ${m.text().slice(0, 120)}`);
  }
});

// Wachten op condities, niet op de klok: een vaste sleep is op een trage
// CI-runner te kort (valse fout) en op een snelle verspilde tijd.
huidigePagina = '/';
await page.goto('http://127.0.0.1:8810/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => {
  const m = globalThis.__civicEyeMap;
  // Eerst checken of de laag bestaat: queryRenderedFeatures op een onbekende
  // laag laat maplibre een error-event vuren, en dat is geen echte fout.
  return !!m && m.isStyleLoaded() && !!m.getLayer('meldingen-bel')
    && m.queryRenderedFeatures({ layers: ['meldingen-bel'] }).length > 0;
}, undefined, { timeout: 20000 }).catch(() => { /* de checks hieronder rapporteren wat er mis is */ });

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

// --- 5b. clustertik: camera beweegt, kaart blijft staan ---
// Een remount (nieuwe WebGL-context) bij elke tik was een echte bug; daarom
// controleren we op dezelfde kaartinstantie, niet alleen op de zoom.
const voorTik = await page.evaluate(() => {
  const m = globalThis.__civicEyeMap;
  globalThis.__kaartVoorTik = m;
  const cluster = m.queryRenderedFeatures({ layers: ['meldingen-bel'] })
    .find((f) => String(f.properties.isCluster) === 'true');
  if (!cluster) return null;
  const p = m.project(cluster.geometry.coordinates);
  return { zoom: m.getZoom(), x: p.x, y: p.y };
});
if (voorTik) {
  await page.mouse.click(voorTik.x, voorTik.y);
  // Wachten tot de animatie klaar is (+2 zoomniveaus), niet tot ze begint.
  await page.waitForFunction(
    (z) => !globalThis.__civicEyeMap.isMoving() && globalThis.__civicEyeMap.getZoom() >= z + 1.9,
    voorTik.zoom, { timeout: 10000 },
  ).catch(() => {});
  const naTik = await page.evaluate(() => ({
    zoom: globalThis.__civicEyeMap.getZoom(),
    zelfde: globalThis.__civicEyeMap === globalThis.__kaartVoorTik,
    canvassen: globalThis.document.querySelectorAll('canvas').length,
  }));
  check('clustertik zoomt in zonder de kaart te herbouwen',
    naTik.zoom > voorTik.zoom && naTik.zelfde && naTik.canvassen === 1,
    `zoom ${voorTik.zoom} → ${naTik.zoom}, zelfde instantie: ${naTik.zelfde}`);
} else {
  check('clustertik zoomt in zonder de kaart te herbouwen', false, 'geen cluster gevonden');
}

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
await page.getByText('Afvalzak').waitFor({ timeout: 15000 }).catch(() => {});
const detail = (await page.textContent('body')) ?? '';
check('detailscherm toont de melding', detail.includes('Afvalzak'), detail.slice(0, 40).trim());
check('detailscherm toont de notitie', detail.includes('Zak naast het bankje'));
// De mock geeft accuracy 8.5 en de UI rondt af: "± 9 m".
check('detailscherm toont GPS-nauwkeurigheid', detail.includes('± 9 m'),
  detail.match(/±[^·\n]{0,8}/)?.[0] ?? 'niet gevonden');

// --- 8. onbestaande melding geeft een nette fout ---
huidigePagina = '/report/00000000-0000-0000-0000-000000000000';
await page.goto('http://127.0.0.1:8810/report/00000000-0000-0000-0000-000000000000',
  { waitUntil: 'domcontentloaded' });
await page.getByText('bestaat niet meer').waitFor({ timeout: 15000 }).catch(() => {});
const nietGevonden = (await page.textContent('body')) ?? '';
check('onbestaande melding geeft een Nederlandse fout, geen crash',
  nietGevonden.includes('bestaat niet meer'), nietGevonden.slice(0, 50).trim());

// --- 9. instellingenscherm als diagnose ---
huidigePagina = '/settings';
await page.goto('http://127.0.0.1:8810/settings', { waitUntil: 'domcontentloaded' });
await page.getByText('127.0.0.1:8811').waitFor({ timeout: 15000 }).catch(() => {});
const inst = (await page.textContent('body')) ?? '';
check('instellingen tonen de omgeving en het backend', inst.includes('127.0.0.1:8811'));
check('instellingen tonen de sessiestatus', /Anonieme sessie/.test(inst));
check('instellingen melden dat er geen kaartkey is', inst.includes('geen key'));

// --- 10. de meldflow-route legt eerlijk uit dat ze nog niet bestaat ---
huidigePagina = '/report/nieuw';
await page.goto('http://127.0.0.1:8810/report/nieuw', { waitUntil: 'domcontentloaded' });
await page.getByText('volgende versie').waitFor({ timeout: 15000 }).catch(() => {});
const nieuw = (await page.textContent('body')) ?? '';
check('/report/nieuw legt uit dat melden nog komt', nieuw.includes('volgende versie'));

check('geen onafgehandelde JS-fouten in de hele run', pageErrors.length === 0,
  pageErrors.slice(0, 2).join(' | '));
check('geen console.error in de hele run', consoleErrors.length === 0,
  consoleErrors.slice(0, 2).join(' | '));

await browser.close();
web.close(); api.server.close();
console.log(mislukt === 0 ? '\n✓ sprint 1 werkt end-to-end' : `\n✗ ${mislukt} check(s) gefaald`);
process.exit(mislukt === 0 ? 0 : 1);
