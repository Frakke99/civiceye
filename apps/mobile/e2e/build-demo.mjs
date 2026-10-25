/**
 * Bouwt de web-app met het LAN-adres van deze machine als API-adres, zodat
 * telefoons op dezelfde wifi ook de nagemaakte backend bereiken.
 *
 * Waarom dit bestaat: EXPO_PUBLIC_-variabelen worden bij het bundelen
 * ingebakken. De gewone e2e-build wijst naar 127.0.0.1 — en dat is op je
 * telefoon de telefoon zelf, dus daar laadt geen enkele melding.
 *
 *   pnpm demo:lan
 */
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const lan = Object.values(os.networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address)[0];

if (!lan) {
  console.error('Geen LAN-adres gevonden. Zit deze machine wel op een netwerk?');
  process.exit(1);
}

const HIER = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HIER, '..', '..', '..');

console.log(`\nWeb-app bouwen met de API op http://${lan}:8811 …\n`);
execSync('node scripts/prepare-web-assets.mjs', { cwd: ROOT, stdio: 'inherit' });
execSync('pnpm exec expo export --platform web --output-dir dist --clear', {
  cwd: path.join(ROOT, 'apps', 'mobile'),
  stdio: 'inherit',
  env: {
    ...process.env,
    EXPO_PUBLIC_SUPABASE_URL: `http://${lan}:8811`,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'demo-anon-key',
    EXPO_PUBLIC_ENV: 'dev',
    EXPO_PUBLIC_MAPTILER_KEY: process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '',
  },
});
