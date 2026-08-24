import { supabase } from '@/api/supabase';

/**
 * Zorgt voor een (anonieme) sessie. Melden vraagt een ingelogde gebruiker; de
 * kaart bekijken niet. Lukt het aanmelden niet, dan blijft de app werken in
 * leesmodus — dat is beter dan een blokkerend foutscherm bij het opstarten.
 *
 * Zie ADR 0003: publiek is alles anoniem, intern hangt elke melding aan een
 * device-gebonden account zodat rate limits en blokkades mogelijk zijn.
 */
export async function ensureSession(): Promise<{ userId: string | null; error?: string }> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) {
    return { userId: data.session.user.id };
  }

  const { data: nieuw, error } = await supabase.auth.signInAnonymously();
  if (error) {
    // Meest voorkomende oorzaak: anonieme aanmeldingen staan uit in het
    // Supabase-dashboard (Authentication → Providers → Anonymous).
    return { userId: null, error: error.message };
  }
  return { userId: nieuw.user?.id ?? null };
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
