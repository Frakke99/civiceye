/**
 * Kaart op web, met maplibre-gl. Zelfde renderer als op native (ADR 0004), dus
 * een kaartbug op web is ook op een toestel reproduceerbaar.
 *
 * Metro kiest dit bestand op web en MapCanvas.tsx op native; de props zijn
 * identiek (src/map/types.ts).
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
// maplibre-gl 6 heeft geen default export, alleen named exports.
import {
  GeolocateControl,
  Map as MlMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapGeoJSONFeature,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Bbox } from '@gc/shared';
import { mapStyle, styleHasLabels } from './style';
import { toMarkerCollection } from './markers';
import { MapFallback } from './MapFallback';
import type { MapCanvasProps } from './types';

const SOURCE = 'meldingen';

/**
 * maplibre-gl parseert GeoJSON in een web worker en zoekt die naast zijn eigen
 * bundel. Metro emit dat bestand niet, dus de worker startte nooit: de bron
 * bleef "niet geladen" en er verscheen geen enkele marker — zonder foutmelding.
 *
 * scripts/prepare-web-assets.mjs kopieert de worker naar public/maplibre/;
 * hier wijzen we maplibre erheen. Via document.baseURI, zodat het ook werkt
 * wanneer de app niet op de root van een domein staat.
 */
if (typeof document !== 'undefined') {
  setWorkerUrl(new URL('maplibre/maplibre-gl-worker.mjs', document.baseURI).href);
}

export function MapCanvas({
  markers,
  initialCenter,
  onViewportChange,
  onSelectReport,
  onSelectCluster,
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  // Callbacks in refs: de kaart wordt één keer opgezet, maar de handlers
  // veranderen bij elke render. Zonder dit zou de kaart opnieuw opbouwen.
  // Bijwerken gebeurt in een effect: een ref beschrijven tijdens de render is
  // in React 19 niet toegestaan (en breekt onder Strict Mode).
  const handlers = useRef({ onViewportChange, onSelectReport, onSelectCluster });
  useEffect(() => {
    handlers.current = { onViewportChange, onSelectReport, onSelectCluster };
  }, [onViewportChange, onSelectReport, onSelectCluster]);

  useEffect(() => {
    if (!container.current || map.current) return;

    // Gooit de constructor (ongeldige container, geen WebGL), dan laten we de
    // fout doorlopen naar MapErrorBoundary. Eén foutpad is beter dan twee: hier
    // state zetten zou een cascaderende render in een effect zijn.
    const m = new MlMap({
      container: container.current,
      style: mapStyle() as string,
      center: [initialCenter.lng, initialCenter.lat],
      zoom: initialCenter.zoom,
      attributionControl: { compact: true },
    });
    map.current = m;

    // Leesbare verwijzing voor de end-to-end test en voor handmatig debuggen in
    // de console. Bevat geen geheimen: de anon key is publiek en de kaartdata
    // is dat ook.
    (globalThis as { __gcMap?: MlMap }).__gcMap = m;

    m.addControl(new NavigationControl(), 'top-right');
    m.addControl(
      new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      'top-right',
    );

    const meldViewport = () => {
      const b = m.getBounds();
      const bbox: Bbox = {
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      };
      const c = m.getCenter();
      handlers.current.onViewportChange({
        bbox,
        zoom: m.getZoom(),
        centerLng: c.lng,
        centerLat: c.lat,
      });
    };

    m.on('load', () => {
      m.addSource(SOURCE, { type: 'geojson', data: toMarkerCollection([]) });
      m.addLayer({
        id: 'meldingen-bel',
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.92,
        },
      });
      // Alleen met een echte stijl: zonder glyphs blijft de stijl "niet geladen"
      // en tekent de kaart helemaal niets meer. Zie style.ts.
      if (styleHasLabels) {
        m.addLayer({
          id: 'meldingen-label',
          type: 'symbol',
          source: SOURCE,
          layout: { 'text-field': ['get', 'label'], 'text-size': 13, 'text-allow-overlap': true },
          paint: { 'text-color': '#ffffff' },
        });
      }
      meldViewport();
    });

    m.on('moveend', meldViewport);
    // Asynchrone fouten komen via een event, niet uit de effect-body: hier mag
    // wél state gezet worden. Een ontbrekende tegel legt de app niet stil; een
    // kapotte stijl melden we, want dan zie je helemaal niets.
    m.on('error', (e) => {
      // Alles loggen: een stille kaartfout kostte ons eerder een lege kaart.
      // Enkel een kapotte stijl leidt tot de lijstweergave; een ontbrekende
      // tegel of font mag de app niet stilleggen.
      console.warn('kaartfout:', e.error?.message);
      if (e.error?.message?.includes('style')) setFout(e.error.message);
    });

    m.on('mouseenter', 'meldingen-bel', () => {
      m.getCanvas().style.cursor = 'pointer';
    });
    m.on('mouseleave', 'meldingen-bel', () => {
      m.getCanvas().style.cursor = '';
    });

    m.on('click', 'meldingen-bel', (e) => {
      const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!feature) return;
      const props = feature.properties as { isCluster?: boolean; reportId?: string };
      // GeoJSON-properties komen op web soms als string terug ('true'/'false').
      const isCluster = props.isCluster === true || String(props.isCluster) === 'true';

      if (isCluster) {
        handlers.current.onSelectCluster(e.lngLat.lng, e.lngLat.lat, Math.min(18, m.getZoom() + 2));
        return;
      }
      if (props.reportId) handlers.current.onSelectReport(props.reportId);
    });

    return () => {
      m.remove();
      map.current = null;
    };
    // Alleen bij het opzetten; de kaart mag niet herbouwen bij nieuwe markers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;

    // Bewust NIET achter isStyleLoaded(): die blijft false zolang er nog een
    // font of sprite onderweg is, ook als de bron er al staat. Daar hing eerder
    // het hele tekenen van de markers achter, met een lege kaart als gevolg.
    // De aanwezigheid van de bron is de juiste voorwaarde.
    const zetData = () => {
      const source = m.getSource(SOURCE);
      if (source && 'setData' in source) {
        (source as GeoJSONSource).setData(toMarkerCollection(markers));
        return true;
      }
      return false;
    };

    if (zetData()) return;

    // Markers waren er vóór de kaart: opnieuw proberen zodra de bron bestaat.
    m.once('load', zetData);
    return () => {
      m.off('load', zetData);
    };
  }, [markers]);

  if (fout) {
    return <MapFallback markers={markers} reden={fout} onSelectReport={onSelectReport} />;
  }

  return (
    <View style={styles.root}>
      {/* @ts-expect-error react-native-web geeft de ref door aan een echte div */}
      <View ref={container} style={styles.map} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  map: { flex: 1 },
});
