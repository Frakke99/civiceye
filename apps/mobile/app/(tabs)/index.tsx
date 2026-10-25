import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorText, parseApiError, type Bbox } from '@civiceye/shared';
import { MapCanvas } from '@/map/MapCanvas';
import { MapErrorBoundary } from '@/map/ErrorBoundary';
import { MapFallback } from '@/map/MapFallback';
import { totalReports } from '@/map/markers';
import { useMapReports } from '@/api/useMapReports';
import type { Viewport } from '@/map/types';
import { theme } from '@/ui/theme';

/** Antwerpen: startpunt van de piloot. */
const START = { lng: 4.4025, lat: 51.2194, zoom: 12 };

export default function KaartScherm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [center, setCenter] = useState(START);

  const bbox: Bbox | null = viewport?.bbox ?? null;
  const zoom = viewport?.zoom ?? START.zoom;
  const { data: markers, isFetching, error } = useMapReports(bbox, zoom);

  const zichtbaar = useMemo(() => markers ?? [], [markers]);

  const onViewportChange = useCallback((v: Viewport) => setViewport(v), []);

  const onSelectReport = useCallback(
    (reportId: string) => router.push(`/report/${reportId}`),
    [router],
  );

  const onSelectCluster = useCallback((lng: number, lat: number, nieuweZoom: number) => {
    // De kaart volgt de nieuwe camera; het venster komt terug via onViewportChange.
    setCenter({ lng, lat, zoom: nieuweZoom });
  }, []);

  const fout = error ? parseApiError(error) : null;

  return (
    <View style={styles.root}>
      <MapErrorBoundary
        fallback={(e) => (
          <MapFallback markers={zichtbaar} reden={e.message} onSelectReport={onSelectReport} />
        )}
      >
        <MapCanvas
          key={`${center.lng},${center.lat},${center.zoom}`}
          markers={zichtbaar}
          initialCenter={center}
          onViewportChange={onViewportChange}
          onSelectReport={onSelectReport}
          onSelectCluster={onSelectCluster}
        />
      </MapErrorBoundary>

      <View style={[styles.balk, { top: insets.top + theme.space(2) }]}>
        <Text style={styles.balkTekst}>
          {zichtbaar.length === 0 && !isFetching
            ? 'Geen meldingen in beeld'
            : `${totalReports(zichtbaar)} meldingen`}
        </Text>
        {isFetching ? <ActivityIndicator size="small" color={theme.color.accent} /> : null}
      </View>

      {fout ? (
        <View style={[styles.foutBalk, { bottom: insets.bottom + theme.space(20) }]}>
          <Text style={styles.foutTekst}>{errorText(fout.code, fout.detail)}</Text>
        </View>
      ) : null}

      {/* Sprint 2 vult deze knop met de meldflow. Hij staat er nu al zodat de
          plaatsing op elk toestel getest kan worden: over de volle breedte
          onderaan, met één duim bereikbaar, zoals in het app-design. */}
      <Pressable
        style={({ pressed }) => [
          styles.meldKnop,
          { bottom: insets.bottom + theme.space(4) },
          pressed && styles.meldKnopIngedrukt,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Nieuwe melding"
        accessibilityHint="Komt in de volgende versie"
        onPress={() => router.push('/report/nieuw')}
      >
        <Text style={styles.meldKnopPlus}>+</Text>
        <Text style={styles.meldKnopTekst}>Nieuwe melding</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  balk: {
    position: 'absolute',
    left: theme.space(4),
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    minHeight: theme.minTouch,
    paddingHorizontal: theme.space(4),
    borderRadius: theme.radius.l,
    backgroundColor: theme.color.bgElevated,
    ...theme.shadow.float,
  },
  balkTekst: { ...theme.text.label, fontFamily: theme.font.bold },
  foutBalk: {
    position: 'absolute',
    left: theme.space(4),
    right: theme.space(4),
    padding: theme.space(3),
    borderRadius: theme.radius.m,
    backgroundColor: theme.color.dangerSoft,
    borderWidth: 1,
    borderColor: theme.color.danger,
  },
  foutTekst: { ...theme.text.small, color: theme.color.danger },
  meldKnop: {
    position: 'absolute',
    left: theme.space(4),
    right: theme.space(4),
    height: theme.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space(2),
    borderRadius: theme.radius.l,
    backgroundColor: theme.color.accent,
    ...theme.shadow.float,
  },
  meldKnopIngedrukt: { backgroundColor: theme.color.accentPressed },
  meldKnopPlus: { ...theme.text.button, fontSize: 24, color: theme.color.accentText },
  meldKnopTekst: { ...theme.text.button, color: theme.color.accentText },
});
