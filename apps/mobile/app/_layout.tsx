import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Per gewicht importeren: de index van het pakket trekt alle 18 varianten mee
// in de bundel, ook de cursieven die de app niet gebruikt.
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_500Medium } from '@expo-google-fonts/figtree/500Medium';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { Figtree_800ExtraBold } from '@expo-google-fonts/figtree/800ExtraBold';
import { ensureSession } from '@/auth/session';
import { theme } from '@/ui/theme';

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
  // De fonts zitten in de bundel, dus laden duurt enkele milliseconden. Lukt
  // het niet, dan gaat de app verder met het systeemfont in plaats van te
  // blijven hangen.
  const [fontsGeladen, fontFout] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });

  useEffect(() => {
    // Stil een anonieme sessie opzetten. Lukt dat niet, dan blijft de kaart
    // werken in leesmodus — melden vraagt wél een sessie (ADR 0003).
    void ensureSession().then(({ error }) => setSessieFout(error ?? null));
  }, []);

  if (!fontsGeladen && !fontFout) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.color.bg },
            headerStyle: { backgroundColor: theme.color.bg },
            headerTintColor: theme.color.text,
            headerTitleStyle: { fontFamily: theme.font.bold },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="report/[id]"
            options={{ presentation: 'modal', headerShown: true, title: 'Melding' }}
          />
        </Stack>
      </SafeAreaProvider>
      {/* De sessiefout wordt in Instellingen getoond; hier alleen bewaren. */}
      {sessieFout ? null : null}
    </QueryClientProvider>
  );
}
