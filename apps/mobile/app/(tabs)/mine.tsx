import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@/ui/theme';

/**
 * Sprint 2 vult dit scherm met de eigen meldingen uit de outbox en uit
 * `reports` (via RLS ziet een gebruiker zijn eigen meldingen, ook wanneer ze
 * in quarantaine staan).
 */
export default function MijnMeldingen() {
  return (
    <View style={styles.root}>
      <Text style={styles.titel}>Mijn meldingen</Text>
      <Text style={styles.tekst}>
        Zodra je kan melden, verschijnen je eigen meldingen hier — ook de meldingen die nog
        op verbinding wachten.
      </Text>
      <Text style={styles.klein}>Komt in de volgende versie (sprint 2).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: theme.space(6), gap: theme.space(3), backgroundColor: theme.color.bg },
  titel: { fontSize: 22, fontWeight: '700', color: theme.color.text },
  tekst: { color: theme.color.textMuted, lineHeight: 22 },
  klein: { color: theme.color.textMuted, fontSize: 12 },
});
