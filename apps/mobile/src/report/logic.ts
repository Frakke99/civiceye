/**
 * Pure logica van de meldflow, los van React en van supabase-js — een fout hier
 * betekent een verkeerde duplicaatvraag of een onzichtbare pin, en dat wil je
 * in een unittest kunnen aantonen (apps/mobile/test).
 */
import type { MapMarker, NearbyReport, LitterSize, ReportKind } from '@civiceye/shared';

/**
 * Vóór het posten: ligt hier al een melding van hetzelfde type?
 * `nearby_reports` zoekt ruim; de vraag "bevestigen of toch melden" stellen we
 * alleen binnen 20 m en voor hetzelfde type (docs/05-mobile-client.md).
 * Dichtstbijzijnde eerst, zodat "ligt er nog" over de juiste melding gaat.
 */
export const DUPLICATE_RADIUS_M = 20;

export function duplicatesFor(
  nearby: NearbyReport[],
  kind: ReportKind,
  maxDistanceM: number = DUPLICATE_RADIUS_M,
): NearbyReport[] {
  return nearby
    .filter((n) => n.kind === kind && n.distanceM <= maxDistanceM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * De optimistische pin: direct op de kaart, in dezelfde vorm als een marker
 * uit `map_reports`, zodat de kaartlaag geen speciaal geval nodig heeft.
 */
export function optimisticMarker(input: {
  reportId: string;
  lat: number;
  lng: number;
  kind: ReportKind;
  size: LitterSize | null;
  createdAt: string;
}): MapMarker {
  return {
    isCluster: false,
    lng: input.lng,
    lat: input.lat,
    pointCount: 1,
    reportId: input.reportId,
    kind: input.kind,
    size: input.size,
    hasPhoto: false,
    createdAt: input.createdAt,
  };
}

/**
 * Marker toevoegen aan een cachelijst zonder te dupliceren: bij een
 * gededupliceerde of idempotente post staat dezelfde melding er mogelijk al.
 */
export function withMarker(markers: MapMarker[], marker: MapMarker): MapMarker[] {
  if (markers.some((m) => m.reportId !== null && m.reportId === marker.reportId)) {
    return markers;
  }
  return [...markers, marker];
}
