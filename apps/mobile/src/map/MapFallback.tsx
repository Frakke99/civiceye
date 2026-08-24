import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapMarker } from '@civiceye/shared';
import { markerLabel, relativeTimeNl, sizeLabelNl, totalReports } from './markers';
import { theme } from '@/ui/theme';

interface Props {
  markers: MapMarker[];
  /** Uitleg waarom er geen kaart is; null = er is wel een kaart, dit is enkel een lijst. */
  reden?: string | null;
  onSelectReport?: (reportId: string) => void;
}

/**
 * Lijstweergave van dezelfde data. Twee gebruiken:
 *  - de native kaartmodule ontbreekt (Expo Go) → uitleg + lijst i.p.v. wit scherm
 *  - diagnostiek: zien of het backend data teruggeeft, los van de kaart
 */
export function MapFallback({ markers, reden, onSelectReport }: Props) {
  return (
    <View style={styles.root}>
      {reden ? (
        <View style={styles.melding}>
          <Text style={styles.meldingTitel}>Kaart niet beschikbaar</Text>
          <Text style={styles.meldingTekst}>{reden}</Text>
        </View>
      ) : null}

      <Text style={styles.samenvatting}>
        {markers.length} markers · {totalReports(markers)} meldingen
      </Text>

      <FlatList
        data={markers}
        keyExtractor={(m, i) => m.reportId ?? `cluster-${i}`}
        ItemSeparatorComponent={() => <View style={styles.scheiding} />}
        ListEmptyComponent={
          <Text style={styles.leeg}>
            Geen meldingen in dit gebied. Laad db/seed/dev_seed.sql voor testdata.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.rij}
            disabled={item.isCluster || !onSelectReport}
            onPress={() => item.reportId && onSelectReport?.(item.reportId)}
            accessibilityRole={item.isCluster ? 'text' : 'button'}
            accessibilityLabel={
              item.isCluster
                ? `Cluster van ${item.pointCount} meldingen`
                : `${sizeLabelNl(item.size)}, ${relativeTimeNl(item.createdAt)}`
            }
          >
            <Text style={styles.icoon}>{markerLabel(item)}</Text>
            <View style={styles.rijTekst}>
              <Text style={styles.titel}>
                {item.isCluster
                  ? `${item.pointCount} meldingen samen`
                  : sizeLabelNl(item.size)}
              </Text>
              <Text style={styles.detail}>
                {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                {item.hasPhoto ? ' · met foto' : ''}
              </Text>
            </View>
            <Text style={styles.tijd}>{relativeTimeNl(item.createdAt)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  melding: {
    margin: theme.space(3),
    padding: theme.space(3),
    borderRadius: theme.radius.m,
    backgroundColor: theme.color.bgElevated,
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  meldingTitel: { fontWeight: '700', color: theme.color.text, marginBottom: theme.space(1) },
  meldingTekst: { color: theme.color.textMuted, lineHeight: 20 },
  samenvatting: {
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(2),
    color: theme.color.textMuted,
    fontSize: 13,
  },
  rij: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(3),
    paddingHorizontal: theme.space(4),
    minHeight: theme.minTouch,
    paddingVertical: theme.space(2),
  },
  icoon: { fontSize: 22, width: 30, textAlign: 'center' },
  rijTekst: { flex: 1 },
  titel: { color: theme.color.text, fontWeight: '600' },
  detail: { color: theme.color.textMuted, fontSize: 12 },
  tijd: { color: theme.color.textMuted, fontSize: 12 },
  scheiding: { height: 1, backgroundColor: theme.color.line, marginLeft: theme.space(4) },
  leeg: { padding: theme.space(6), color: theme.color.textMuted, textAlign: 'center' },
});
