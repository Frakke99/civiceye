/**
 * Markers omzetten naar wat de kaart nodig heeft. Bewust pure functies zonder
 * kaartbibliotheek: een fout hier betekent onzichtbare of verkeerd getekende
 * meldingen, en dat wil je in een test kunnen aantonen (apps/mobile/test).
 */
import type { LitterSize, MapMarker, ReportKind } from '@gc/shared';

/** De drie symbolen uit de meldflow. */
export const SIZE_ICON: Record<LitterSize, string> = {
  piece: '📄',
  bag: '🛍️',
  heap: '🗑️',
};

export const KIND_ICON: Record<ReportKind, string> = {
  litter: '🗑️',
  hazard: '⚠️',
  dead_animal: '🐾',
  fallen_tree: '🌳',
  damaged_furniture: '🪑',
  other: '❓',
};

/**
 * Kleuren onderscheiden zich niet alléén door kleur: elke marker heeft ook een
 * eigen vorm/label, want ongeveer 8 % van de mannen ziet rood en groen anders
 * (docs/05-mobile-client.md, toegankelijkheid).
 */
export const COLORS = {
  cluster: '#1a7f4b',
  piece: '#e8a33d',
  bag: '#e07b39',
  heap: '#c0392b',
  other: '#5b6b7a',
} as const;

export function markerColor(marker: MapMarker): string {
  if (marker.isCluster) return COLORS.cluster;
  if (marker.kind !== 'litter') return COLORS.other;
  switch (marker.size) {
    case 'piece':
      return COLORS.piece;
    case 'bag':
      return COLORS.bag;
    case 'heap':
      return COLORS.heap;
    default:
      return COLORS.other;
  }
}

/** Clusterbellen groeien met de wortel van het aantal: anders overheersen ze. */
export function clusterRadius(pointCount: number): number {
  const n = Math.max(1, pointCount);
  return Math.min(34, 14 + Math.sqrt(n) * 2.4);
}

export function markerLabel(marker: MapMarker): string {
  if (marker.isCluster) {
    return marker.pointCount > 999
      ? `${Math.floor(marker.pointCount / 1000)}k`
      : String(marker.pointCount);
  }
  if (marker.kind !== 'litter') return KIND_ICON[marker.kind];
  return marker.size ? SIZE_ICON[marker.size] : KIND_ICON.litter;
}

export function sizeLabelNl(size: LitterSize | null): string {
  switch (size) {
    case 'piece':
      return 'Papiertje';
    case 'bag':
      return 'Afvalzak';
    case 'heap':
      return 'Afvalhoop';
    default:
      return 'Afval';
  }
}

/** "3 dagen geleden" — korter en nuttiger dan een datum op een kaart. */
export function relativeTimeNl(iso: string, nu: Date = new Date()): string {
  const dan = new Date(iso).getTime();
  if (!Number.isFinite(dan)) return '';
  const seconden = Math.max(0, Math.round((nu.getTime() - dan) / 1000));
  if (seconden < 60) return 'net gemeld';
  const minuten = Math.round(seconden / 60);
  if (minuten < 60) return `${minuten} min geleden`;
  const uren = Math.round(minuten / 60);
  if (uren < 24) return uren === 1 ? '1 uur geleden' : `${uren} uur geleden`;
  const dagen = Math.round(uren / 24);
  if (dagen < 30) return dagen === 1 ? 'gisteren' : `${dagen} dagen geleden`;
  const maanden = Math.max(1, Math.round(dagen / 30));
  return maanden === 1 ? '1 maand geleden' : `${maanden} maanden geleden`;
}

export interface MarkerFeature {
  type: 'Feature';
  id: number;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    reportId: string;
    isCluster: boolean;
    pointCount: number;
    label: string;
    color: string;
    radius: number;
    hasPhoto: boolean;
  };
}

export interface MarkerCollection {
  type: 'FeatureCollection';
  features: MarkerFeature[];
}

/**
 * Markers → GeoJSON voor één enkele MapLibre-source. Eén source met één laag
 * tekent in één pass; losse componenten per marker doen dat niet.
 *
 * Markers met ongeldige coördinaten worden weggelaten in plaats van
 * doorgegeven: MapLibre tekent bij een NaN stilletjes niets meer, wat zich
 * voordoet als "de kaart is leeg" in plaats van als een fout.
 */
export function toMarkerCollection(markers: MapMarker[]): MarkerCollection {
  const features: MarkerFeature[] = [];
  for (const m of markers) {
    if (!Number.isFinite(m.lng) || !Number.isFinite(m.lat)) continue;
    if (m.lng < -180 || m.lng > 180 || m.lat < -90 || m.lat > 90) continue;
    features.push({
      type: 'Feature',
      id: features.length,
      geometry: { type: 'Point', coordinates: [m.lng, m.lat] },
      properties: {
        reportId: m.reportId ?? '',
        isCluster: m.isCluster,
        pointCount: m.pointCount,
        label: markerLabel(m),
        color: markerColor(m),
        radius: m.isCluster ? clusterRadius(m.pointCount) : 13,
        hasPhoto: m.hasPhoto,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Totaal aantal meldingen in beeld — clusters tellen voor hun `pointCount`. */
export function totalReports(markers: MapMarker[]): number {
  return markers.reduce((som, m) => som + (m.isCluster ? m.pointCount : 1), 0);
}
