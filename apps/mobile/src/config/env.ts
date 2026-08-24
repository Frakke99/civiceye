/**
 * Configuratie per omgeving. Alles met het voorvoegsel EXPO_PUBLIC_ zit in de
 * app-bundle en is dus **publiek**. De service_role-key hoort hier nooit; die
 * leeft alleen server-side (docs/08-infra-omgevingen-cicd.md).
 */

export type AppEnv = 'dev' | 'staging' | 'prod';

function required(naam: string, waarde: string | undefined): string {
  if (!waarde || waarde.length === 0) {
    throw new Error(
      `Ontbrekende configuratie: ${naam}. Kopieer .env.example naar .env en vul je Supabase-gegevens in.`,
    );
  }
  return waarde;
}

/**
 * De demo (pnpm demo) bakt http://127.0.0.1:8811 in de bundle, maar op een
 * telefoon wijst 127.0.0.1 naar de telefoon zelf. Open je de demo via het
 * LAN-adres van de laptop, dan draait het mock-backend dáár ook — dus
 * vervangen we alleen in dat geval de loopback-host door de host van de
 * pagina. Echte omgevingen hebben nooit een loopback-URL en blijven onaangeroerd.
 */
function bereikbaarVanafDitToestel(url: string): string {
  if (typeof window === 'undefined' || !window.location) return url;
  try {
    const doel = new URL(url);
    const pagina = window.location.hostname;
    const loopback = doel.hostname === '127.0.0.1' || doel.hostname === 'localhost';
    if (loopback && pagina && pagina !== doel.hostname && pagina !== 'localhost') {
      doel.hostname = pagina;
      return doel.toString().replace(/\/$/, '');
    }
  } catch {
    // Geen geldige URL: laat de bestaande foutafhandeling dit melden.
  }
  return url;
}

export const env = {
  supabaseUrl: bereikbaarVanafDitToestel(
    required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  ),
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  /** Optioneel: zonder key valt de kaart terug op een eenvoudige achtergrond. */
  mapTilerKey: process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '',
  appEnv: (process.env.EXPO_PUBLIC_ENV ?? 'dev') as AppEnv,
};

export const hasMapTiler = env.mapTilerKey.length > 0;
