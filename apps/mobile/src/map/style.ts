import { env, hasMapTiler } from '@/config/env';

/**
 * Minimale stijl die geen tegels en geen netwerk nodig heeft. Dit is de
 * ondergrond wanneer de basiskaart expliciet uitstaat (EXPO_PUBLIC_BASEMAP=off)
 * — zo draaien de e2e-tests hermetisch — en de reddingsplank wanneer er ooit
 * geen enkele kaartdienst bereikbaar is.
 */
export const BLANK_STYLE = {
  version: 8 as const,
  name: 'geen-tegels',
  sources: {},
  layers: [
    {
      id: 'achtergrond',
      type: 'background' as const,
      paint: { 'background-color': '#e8eef1' },
    },
  ],
};

/**
 * OpenFreeMap: gratis vectortegels op OSM-data, zonder key of registratie en
 * zonder gebruikslimieten — de publieke dienst is wel "as-is", dus voor de
 * echte productie-uitrol blijft MapTiler (met budgetalert) de keuze uit
 * docs/12. 'liberty' is hun volledigste stijl, inclusief glyphs, dus labels
 * werken hier gewoon.
 */
const OPENFREEMAP_LIBERTY = 'https://tiles.openfreemap.org/styles/liberty';

const basiskaartUit = env.basemap === 'off';

/**
 * Kan de kaart tekst tekenen?
 *
 * Een symbol-laag heeft glyphs (fonts) nodig, en die komen uit de kaartstijl.
 * De lege stijl heeft er geen, en een stijl **zonder** glyphs bereikt nooit de
 * toestand "geladen" zodra er toch een tekstlaag in zit. Dat kostte ons alle
 * markers: de kaart bleef leeg, zonder één foutmelding. Daarom: labels alleen
 * bij een echte stijl (MapTiler of OpenFreeMap), niet bij de lege.
 */
export const styleHasLabels = !basiskaartUit;

export type MapStyle = string | typeof BLANK_STYLE;

/**
 * `outdoor-v2` toont wandelpaden — relevanter voor deze doelgroep dan een
 * stratenkaart (ADR 0004). Zonder MapTiler-key: OpenFreeMap, tenzij de
 * basiskaart uitstaat.
 */
export function mapStyle(): MapStyle {
  if (hasMapTiler) {
    return `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${env.mapTilerKey}`;
  }
  if (basiskaartUit) return BLANK_STYLE;
  return OPENFREEMAP_LIBERTY;
}
