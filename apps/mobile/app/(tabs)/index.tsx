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
          plaatsing op elk toestel getest kan worden (rechtsonder, één hand). */}
      <Pressable
        style={[styles.meldKnop, { bottom: insets.bottom + theme.space(6) }]}
        accessibilityRole="button"
        accessibilityLabel="Afval melden"
        accessibilityHint="Komt in de volgende versie"
        onPress={() => router.push('/report/nieuw')}
      >
        <Text style={styles.meldKnopTekst}>Afval melden</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.bg },
  balk: {
    position: 'absolute',
    left: theme.space(3),
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space(2),
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2),
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: theme.color.line,
  },
  balkTekst: { color: theme.color.text, fontSize: 13, fontWeight: '600' },
  foutBalk: {
    position: 'absolute',
    left: theme.space(3),
    right: theme.space(3),
    padding: theme.space(3),
    borderRadius: theme.radius.m,
    backgroundColor: '#fdecea',
    borderWidth: 1,
    borderColor: theme.color.danger,
  },
  foutTekst: { color: theme.color.danger, fontSize: 13 },
  meldKnop: {
    position: 'absolute',
    right: theme.space(4),
    minHeight: theme.minTouch + 8,
    paddingHorizontal: theme.space(5),
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.accent,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  meldKnopTekst: { color: theme.color.accentText, fontWeight: '700', fontSize: 16 },
});
