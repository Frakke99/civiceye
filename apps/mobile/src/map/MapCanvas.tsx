/**
 * Kaart op iOS en Android, via MapLibre (ADR 0004).
 *
 * Belangrijk: de native MapLibre-module zit **niet** in Expo Go. Draai je daar,
 * dan is `maplibre` hieronder null en valt het kaartscherm terug op de
 * lijstweergave met uitleg. Voor de echte kaart op een toestel heb je een
 * development build nodig (`npx expo run:android` / `eas build --profile development`).
 */
import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Bbox } from '@gc/shared';
import { mapStyle } from './style';
import { toMarkerCollection } from './markers';
import { MapFallback } from './MapFallback';
import type { MapCanvasProps } from './types';

// Bewust een require in een try: ontbreekt de native module (Expo Go), dan
// willen we een uitleg tonen in plaats van een crash bij het laden van de app.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let maplibre: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  maplibre = require('@maplibre/maplibre-react-native');
} catch {
  maplibre = null;
}

const EXPO_GO_UITLEG =
  'De kaart gebruikt MapLibre, en die native module zit niet in Expo Go. ' +
  'Maak een development build (npx expo run:android of eas build --profile development), ' +
  'of open de web-versie. Hieronder zie je dezelfde meldingen als lijst.';

interface NativeRegionEvent {
  nativeEvent: {
    zoom: number;
    center: [number, number];
    bounds: [west: number, south: number, east: number, north: number];
  };
}

interface NativePressEvent {
  nativeEvent: {
    features?: {
      properties?: Record<string, unknown>;
      geometry?: { coordinates?: [number, number] };
    }[];
  };
}

export function MapCanvas({
  markers,
  initialCenter,
  onViewportChange,
  onSelectReport,
  onSelectCluster,
}: MapCanvasProps) {
  const laatsteZoom = useRef(initialCenter.zoom);

  const onRegionDidChange = useCallback(
    (event: NativeRegionEvent) => {
      const { bounds, zoom, center } = event.nativeEvent;
      const [west, south, east, north] = bounds;
      const bbox: Bbox = { minLng: west, minLat: south, maxLng: east, maxLat: north };
      laatsteZoom.current = zoom;
      onViewportChange({ bbox, zoom, centerLng: center[0], centerLat: center[1] });
    },
    [onViewportChange],
  );

  const onPress = useCallback(
    (event: NativePressEvent) => {
      const feature = event.nativeEvent.features?.[0];
      if (!feature) return;
      const props = feature.properties ?? {};
      const coords = feature.geometry?.coordinates;

      if (props.isCluster === true && coords) {
        // Inzoomen tot het cluster uiteenvalt; +2 niveaus splitst een cel
        // betrouwbaar in kleinere cellen (rooster is 360/2^(zoom+2)).
        onSelectCluster(coords[0], coords[1], Math.min(18, laatsteZoom.current + 2));
        return;
      }
      if (typeof props.reportId === 'string' && props.reportId.length > 0) {
        onSelectReport(props.reportId);
      }
    },
    [onSelectCluster, onSelectReport],
  );

  if (!maplibre) {
    return <MapFallback markers={markers} reden={EXPO_GO_UITLEG} onSelectReport={onSelectReport} />;
  }

  const { Map, Camera, GeoJSONSource, Layer, UserLocation } = maplibre;

  return (
    <View style={styles.root}>
      <Map style={styles.map} mapStyle={mapStyle()} onRegionDidChange={onRegionDidChange}>
        <Camera
          initialViewState={{
            center: [initialCenter.lng, initialCenter.lat],
            zoom: initialCenter.zoom,
          }}
        />
        <UserLocation visible />
        <GeoJSONSource id="meldingen" data={toMarkerCollection(markers)} onPress={onPress}>
          <Layer
            id="meldingen-bel"
            type="circle"
            paint={{
              'circle-radius': ['get', 'radius'],
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.92,
            }}
          />
          <Layer
            id="meldingen-label"
            type="symbol"
            layout={{
              'text-field': ['get', 'label'],
              'text-size': 13,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
        </GeoJSONSource>
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
});
