import { ScrollView, StyleSheet, Text } from 'react-native';
import { t } from '@/i18n';
import { theme } from '@/ui/theme';

/**
 * Privacyverklaring en voorwaarden, in de app bereikbaar (docs/13, sprint 5).
 * In gewone taal: wat we verwerken en waarom, gestoeld op docs/07 en de ADR's
 * 0003 (anonieme identiteit) en 0005 (fotopijplijn). Het contactadres is een
 * bewuste invulplek: dat moet er staan vóór de publieke roll-out en hoort bij
 * de store-voorbereiding.
 */
export default function Privacy() {
  const secties: [kop: string | null, tekst: string][] = [
    [null, t('privacy.intro')],
    [t('privacy.kopAnoniem'), t('privacy.anoniem')],
    [t('privacy.kopLocatie'), t('privacy.locatie')],
    [t('privacy.kopFotos'), t('privacy.fotos')],
    [t('privacy.kopBewaring'), t('privacy.bewaring')],
    [t('privacy.kopVoorwaarden'), t('privacy.voorwaarden')],
    [t('privacy.kopContact'), t('privacy.contact')],
  ];

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <Text style={styles.titel} accessibilityRole="header">
        {t('privacy.titel')}
      </Text>
      {secties.map(([kop, tekst]) => (
        <ScrollViewSectie key={tekst} kop={kop} tekst={tekst} />
      ))}
    </ScrollView>
  );
}

function ScrollViewSectie({ kop, tekst }: { kop: string | null; tekst: string }) {
  return (
    <>
      {kop ? (
        <Text style={styles.kop} accessibilityRole="header">
          {kop}
        </Text>
      ) : null}
      <Text style={styles.tekst}>{tekst}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  root: { padding: theme.space(6), gap: theme.space(3), backgroundColor: theme.color.bg },
  titel: { fontSize: 22, fontWeight: '700', color: theme.color.text },
  kop: { fontSize: 16, fontWeight: '700', color: theme.color.text, marginTop: theme.space(2) },
  tekst: { color: theme.color.text, lineHeight: 22 },
});
