import { env, hasMapTiler } from '@/config/env';

/**
 * Minimale stijl die geen tegels nodig heeft. Zonder MapTiler-key blijft de
 * kaart bruikbaar: je ziet je meldingen op een effen ondergrond in plaats van
 * een foutmelding. Handig om het backend te testen zonder kaartaccount.
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

export type MapStyle = string | typeof BLANK_STYLE;

/**
 * `outdoor-v2` toont wandelpaden — relevanter voor deze doelgroep dan een
 * stratenkaart (ADR 0004).
 */
export function mapStyle(): MapStyle {
  if (!hasMapTiler) return BLANK_STYLE;
  return `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${env.mapTilerKey}`;
}
