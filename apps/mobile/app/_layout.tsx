import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ensureSession } from '@/auth/session';

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
  useEffect(() => {
    // Stil een anonieme sessie opzetten. Lukt dat niet, dan blijft de kaart
    // werken in leesmodus — melden vraagt wél een sessie (ADR 0003), en het
    // instellingenscherm toont de sessiestatus.
    void ensureSession();
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
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
