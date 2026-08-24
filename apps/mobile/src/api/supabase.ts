import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { env } from '@/config/env';

/**
 * De sessie moet een herstart overleven: verliest de gebruiker zijn anonieme
 * identiteit, dan verliest hij ook "mijn meldingen" (ADR 0003). Daarom
 * SecureStore op native, en localStorage op web.
 *
 * SecureStore heeft een limiet van 2048 bytes per waarde; een Supabase-sessie
 * blijft daar ruim onder, maar we vangen fouten af zodat een mislukte
 * schrijfactie de app niet sloopt.
 */
const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Sessie niet kunnen bewaren is hinderlijk, geen reden om te crashen.
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* idem */
    }
  },
};

export const supabase: SupabaseClient = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Alleen relevant voor OAuth-redirects op web; wij gebruiken die niet.
    detectSessionInUrl: false,
  },
});
