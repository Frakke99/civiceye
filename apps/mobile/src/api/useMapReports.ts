import { useQuery } from '@tanstack/react-query';
import { bboxKey, clampZoom, type Bbox, type MapMarker } from '@gc/shared';
import { fetchMapReports } from '@/api/reports';

/**
 * Markers voor het huidige venster.
 *
 * De cachesleutel is de **afgeronde** bbox (op het clusterrooster van de
 * server), niet de exacte. Daardoor raakt een kleine pan dezelfde sleutel en
 * komt het antwoord uit de cache in plaats van uit een nieuwe query
 * (docs/06-kaart-en-performance.md).
 */
export function useMapReports(bbox: Bbox | null, zoom: number) {
  const z = clampZoom(zoom);
  const sleutel = bbox ? bboxKey(bbox, z) : null;

  return useQuery<MapMarker[]>({
    queryKey: ['map-reports', sleutel],
    queryFn: () => fetchMapReports(bbox!, z),
    enabled: bbox !== null,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    // Verouderde markers blijven staan tijdens het laden: dat voorkomt
    // knipperende pins bij het pannen.
    placeholderData: (vorige) => vorige,
    retry: 1,
  });
}
