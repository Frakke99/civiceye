/**
 * Draait de app tegen een nagemaakt backend, zodat je haar zelf kan aanklikken
 * zonder Supabase-project. Handig om op meerdere toestellen te kijken voordat
 * je een echt project opzet.
 *
 *   pnpm demo
 *
 * De meldingen zijn verzonnen; het gaat om de app, niet om de data.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { serveStatic } from './static-server.mjs';
import { start } from './mock-supabase.mjs';

const HIER = path.dirname(new URL(import.meta.url).pathname);
const DIST = path.resolve(HIER, '..', 'dist');
const WEB_POORT = 8810;
const API_POORT = 8811;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('Geen web-build gevonden. Draai eerst:\n  pnpm e2e:build');
  process.exit(1);
}

serveStatic(DIST, WEB_POORT);
start(API_POORT);

// Het adres in het lokale netwerk, zodat je het op je telefoon kan openen.
const adressen = Object.values(os.networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address);

console.log('\n  CivicEye — demo met nagemaakt backend\n');
console.log(`  op deze machine   http://127.0.0.1:${WEB_POORT}`);
for (const a of adressen) {
  console.log(`  op je telefoon    http://${a}:${WEB_POORT}   (zelfde wifi)`);
}
console.log(
  '\n  Telefoon erbij? Bouw dan met `pnpm demo:lan` in plaats van `pnpm e2e:build`:\n' +
    '  die bakt het wifi-adres van deze machine in, anders zoekt je telefoon de\n' +
    '  data op zichzelf (127.0.0.1) en blijft de kaart daar leeg.\n',
);
console.log('  De meldingen zijn verzonnen. Stop met Ctrl-C.\n');
