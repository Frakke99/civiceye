/**
 * Configuratie per omgeving. Alles met het voorvoegsel EXPO_PUBLIC_ zit in de
 * app-bundle en is dus **publiek**. De service_role-key hoort hier nooit; die
 * leeft alleen server-side (docs/08-infra-omgevingen-cicd.md).
 */
import { volgPagina } from './lanDemo';

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
 * Demo op een laptop: de dataverzoeken volgen het adres waarmee de pagina
 * geopend is, zodat één build vanaf elk toestel in het netwerk werkt.
 * Alleen voor lokale adressen — zie lanDemo.ts.
 */
function bereikbaarVanafDitToestel(url: string): string {
  if (typeof window === 'undefined' || !window.location) return url;
  return volgPagina(url, window.location.hostname);
}

export const env = {
  supabaseUrl: bereikbaarVanafDitToestel(
    required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  ),
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  /** Optioneel: zonder key valt de kaart terug op OpenFreeMap (gratis, keyloos). */
  mapTilerKey: process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '',
  /**
   * 'off' schakelt de online basiskaart helemaal uit (effen ondergrond).
   * Gebruikt door de e2e-build: de tests moeten zonder netwerk en zonder
   * externe diensten draaien.
   */
  basemap: process.env.EXPO_PUBLIC_BASEMAP ?? '',
  appEnv: (process.env.EXPO_PUBLIC_ENV ?? 'dev') as AppEnv,
};

export const hasMapTiler = env.mapTilerKey.length > 0;
