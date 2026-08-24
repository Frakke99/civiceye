import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { env, hasMapTiler } from '@/config/env';
import { currentUserId } from '@/auth/session';
import { theme } from '@/ui/theme';

/**
 * Bewust ook een diagnosescherm: bij het testen op verschillende toestellen wil
 * je van het toestel zelf kunnen aflezen tegen welke omgeving het praat en of
 * de anonieme sessie er is.
 */
export default function Instellingen() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void currentUserId().then(setUserId);
  }, []);

  const rijen: [string, string][] = [
    ['Omgeving', env.appEnv],
    ['Supabase', env.supabaseUrl.replace(/^https?:\/\//, '')],
    ['Kaartlaag', hasMapTiler ? 'MapTiler' : 'geen key — effen ondergrond'],
    ['Platform', `${Platform.OS} ${Platform.Version ?? ''}`.trim()],
    ['App-versie', Constants.expoConfig?.version ?? '?'],
    ['Anonieme sessie', userId ? `actief (${userId.slice(0, 8)}…)` : 'geen — melden lukt niet'],
  ];

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.titel}>Instellingen</Text>

      <View style={styles.kaart}>
        {rijen.map(([label, waarde]) => (
          <View key={label} style={styles.rij}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.waarde}>{waarde}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.kopje}>Privacy</Text>
      <Text style={styles.tekst}>
        Meldingen zijn publiek zichtbaar op hun exacte locatie. Wie meldt, blijft anoniem:
        je naam of e-mailadres wordt niet gevraagd en staat nergens bij een melding.
      </Text>
      <Text style={styles.klein}>
        Je meldingen horen bij dit toestel. Verwijder je de app, dan verlies je het
        overzicht van je eigen meldingen — de meldingen zelf blijven op de kaart staan.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { padding: theme.space(6), gap: theme.space(3), backgroundColor: theme.color.bg },
  titel: { fontSize: 22, fontWeight: '700', color: theme.color.text },
  kaart: {
    borderWidth: 1,
    borderColor: theme.color.line,
    borderRadius: theme.radius.m,
    backgroundColor: theme.color.bgElevated,
  },
  rij: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.space(3),
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.line,
  },
  label: { color: theme.color.textMuted },
  waarde: { color: theme.color.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  kopje: { fontSize: 16, fontWeight: '700', color: theme.color.text, marginTop: theme.space(4) },
  tekst: { color: theme.color.textMuted, lineHeight: 22 },
  klein: { color: theme.color.textMuted, fontSize: 12, lineHeight: 18 },
});
