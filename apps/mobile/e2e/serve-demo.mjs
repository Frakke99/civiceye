/**
 * Draait de app tegen een nagemaakt backend, zodat je haar zelf kan aanklikken
 * zonder Supabase-project. Handig om op meerdere toestellen te kijken voordat
 * je een echt project opzet.
 *
 *   pnpm demo
 *
 * De meldingen zijn verzonnen; het gaat om de app, niet om de data.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { serveStatic } from './static-server.mjs';
import { start } from './mock-supabase.mjs';
import { lanAdressen } from './lan.mjs';

// fileURLToPath en niet .pathname: dat laatste geeft op Windows '/C:/...'
// en dan zoekt Node alles in het onbestaande 'C:\\C:\\...'.
const HIER = path.dirname(fileURLToPath(import.meta.url));
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
// Echte adapters eerst; virtuele (WSL, Hyper-V, VPN) zijn voor een telefoon
// onbereikbaar en staan er alleen volledigheidshalve bij.
const adressen = lanAdressen();

console.log('\n  CivicEye — demo met nagemaakt backend\n');
console.log(`  op deze machine   http://127.0.0.1:${WEB_POORT}`);
for (const { adres, virtueel, naam } of adressen) {
  console.log(
    virtueel
      ? `  (virtueel: ${naam} — werkt niet vanaf je telefoon)   http://${adres}:${WEB_POORT}`
      : `  op je telefoon    http://${adres}:${WEB_POORT}   (zelfde wifi/hotspot)`,
  );
}
console.log(
  '\n  De app stuurt zijn dataverzoeken naar het adres waarmee je de pagina\n' +
    '  opent, dus elk bereikbaar adres hierboven werkt. Laadt het niet op je\n' +
    '  telefoon: controleer de Windows Firewall (zie QUICKSTART.md).\n',
);
console.log('  De meldingen zijn verzonnen. Stop met Ctrl-C.\n');
