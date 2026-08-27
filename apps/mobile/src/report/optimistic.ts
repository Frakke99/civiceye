import type { QueryClient } from '@tanstack/react-query';
import type { MapMarker } from '@civiceye/shared';
import { withMarker } from './logic';

/**
 * De pin verschijnt meteen op de kaart (docs/05-mobile-client.md, regel 5):
 * elke gecachte kaartquery krijgt de nieuwe marker erbij, en daarna halen we
 * de echte data op de achtergrond op. De server heeft de melding op dit punt
 * al aanvaard, dus de refetch bevestigt de pin in plaats van hem weg te nemen.
 */
export function addReportToMapCache(queryClient: QueryClient, marker: MapMarker): void {
  queryClient.setQueriesData<MapMarker[]>({ queryKey: ['map-reports'] }, (oud) =>
    oud ? withMarker(oud, marker) : oud,
  );
  void queryClient.invalidateQueries({ queryKey: ['map-reports'] });
  void queryClient.invalidateQueries({ queryKey: ['my-reports'] });
}
