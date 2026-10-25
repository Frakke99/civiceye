import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { env, hasMapTiler } from '@/config/env';
import { currentUserId } from '@/auth/session';
import { t } from '@/i18n';
import { theme } from '@/ui/theme';

/**
 * Bewust ook een diagnosescherm: bij het testen op verschillende toestellen wil
 * je van het toestel zelf kunnen aflezen tegen welke omgeving het praat en of
 * de anonieme sessie er is.
 */
export default function Instellingen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void currentUserId().then(setUserId);
  }, []);

  const rijen: [string, string][] = [
    [t('instellingen.omgeving'), env.appEnv],
    [t('instellingen.supabase'), env.supabaseUrl.replace(/^https?:\/\//, '')],
    [
      t('instellingen.kaartlaag'),
      hasMapTiler ? t('instellingen.maptiler') : t('instellingen.geenKey'),
    ],
    [t('instellingen.platform'), `${Platform.OS} ${Platform.Version ?? ''}`.trim()],
    [t('instellingen.appVersie'), Constants.expoConfig?.version ?? '?'],
    [
      t('instellingen.sessie'),
      userId
        ? t('instellingen.sessieActief', { id: userId.slice(0, 8) })
        : t('instellingen.sessieGeen'),
    ],
  ];

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.titel} accessibilityRole="header">
        {t('instellingen.titel')}
      </Text>

      <View style={styles.kaart}>
        {rijen.map(([label, waarde]) => (
          <View key={label} style={styles.rij}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.waarde}>{waarde}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.kopje} accessibilityRole="header">
        {t('instellingen.privacyKop')}
      </Text>
      <Text style={styles.tekst}>{t('instellingen.privacyTekst')}</Text>
      <Text style={styles.klein}>{t('instellingen.privacyKlein')}</Text>

      <Pressable
        style={styles.privacyKnop}
        accessibilityRole="button"
        accessibilityLabel={t('instellingen.privacyLink')}
        onPress={() => router.push('/privacy')}
      >
        <Text style={styles.privacyKnopTekst}>{t('instellingen.privacyLink')}</Text>
      </Pressable>
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
  privacyKnop: {
    minHeight: theme.minTouch,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.line,
    marginTop: theme.space(2),
  },
  privacyKnopTekst: { color: theme.color.text, fontWeight: '600' },
});
