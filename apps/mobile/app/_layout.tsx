import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ensureSession } from '@/auth/session';
import { startOutbox } from '@/outbox';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Op een wandelpad is het netwerk slecht; automatisch herladen bij
      // focus geeft dan vooral mislukte query's.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function RootLayout() {
  const [sessieFout, setSessieFout] = useState<string | null>(null);

  useEffect(() => {
    // Stil een anonieme sessie opzetten. Lukt dat niet, dan blijft de kaart
    // werken in leesmodus — melden vraagt wél een sessie (ADR 0003).
    void ensureSession().then(({ error }) => setSessieFout(error ?? null));
    // Wachtende meldingen van een vorige sessie meteen proberen te versturen,
    // en de sync-triggers (voorgrond, netwerk terug, timer) aanzetten.
    startOutbox(queryClient);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="report/[id]"
            options={{ presentation: 'modal', headerShown: true, title: 'Melding' }}
          />
          <Stack.Screen
            name="report/nieuw"
            options={{ presentation: 'modal', headerShown: true, title: 'Afval melden' }}
          />
        </Stack>
      </SafeAreaProvider>
      {/* De sessiefout wordt in Instellingen getoond; hier alleen bewaren. */}
      {sessieFout ? null : null}
    </QueryClientProvider>
  );
}
