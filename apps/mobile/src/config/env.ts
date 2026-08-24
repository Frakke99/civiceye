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

export const env = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  /** Optioneel: zonder key valt de kaart terug op een eenvoudige achtergrond. */
  mapTilerKey: process.env.EXPO_PUBLIC_MAPTILER_KEY ?? '',
  appEnv: (process.env.EXPO_PUBLIC_ENV ?? 'dev') as AppEnv,
};

export const hasMapTiler = env.mapTilerKey.length > 0;
