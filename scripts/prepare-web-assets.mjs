/**
 * Kopieert de web worker van maplibre-gl naar apps/mobile/public/.
 *
 * Waarom dit nodig is: maplibre-gl parseert GeoJSON in een web worker en
 * verwijst daarnaar met `new Worker(new URL('./maplibre-gl-worker.mjs',
 * import.meta.url))`. Metro (de bundler van Expo) begrijpt die vorm niet en
 * emit het bestand niet. De browser vraagt het dan op, krijgt index.html terug
 * en de worker start nooit — met als gevolg dat de kaartbron nooit "geladen"
 * raakt en er geen enkele marker verschijnt. Zonder foutmelding.
 *
 * Alles in apps/mobile/public/ komt in de web-export terecht, dus de worker
 * wordt vanaf daar geserveerd en MapCanvas.web.tsx wijst er met setWorkerUrl
 * naartoe.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// fileURLToPath, niet url.pathname: dat laatste geeft op Windows "/C:/..."
// en dan zoekt Node in het onbestaande "C:\C:\...".
const HIER = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HIER, '..');
const DOEL = path.join(ROOT, 'apps', 'mobile', 'public', 'maplibre');

// De worker importeert de gedeelde chunk relatief, dus die moet ernaast staan.
const BESTANDEN = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

const pkg = require.resolve('maplibre-gl/package.json', {
  paths: [path.join(ROOT, 'apps', 'mobile')],
});
const dist = path.join(path.dirname(pkg), 'dist');

fs.mkdirSync(DOEL, { recursive: true });

for (const bestand of BESTANDEN) {
  const van = path.join(dist, bestand);
  if (!fs.existsSync(van)) {
    console.error(`Niet gevonden: ${van}`);
    console.error('Is de versie van maplibre-gl gewijzigd? Controleer de bestandsnamen in dist/.');
    process.exit(1);
  }
  fs.copyFileSync(van, path.join(DOEL, bestand));
  const kb = Math.round(fs.statSync(van).size / 1024);
  console.log(`  ${bestand} (${kb} kB)`);
}
console.log(`maplibre-worker gekopieerd naar apps/mobile/public/maplibre/`);
