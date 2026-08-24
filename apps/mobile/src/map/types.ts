import type { Bbox, MapMarker } from '@civiceye/shared';

export interface Viewport {
  bbox: Bbox;
  zoom: number;
  centerLng: number;
  centerLat: number;
}

export interface MapCanvasProps {
  markers: MapMarker[];
  initialCenter: { lng: number; lat: number; zoom: number };
  /**
   * Camera-doel: bij elke nieuwe `seq` beweegt de kaart erheen. Een prop en
   * geen remount (via `key`): een remount gooit de WebGL-context, stijl en
   * tegels weg en geeft een zichtbare flits bij elke clustertik.
   */
  focus?: { lng: number; lat: number; zoom: number; seq: number } | null;
  /** Wordt aangeroepen als de gebruiker klaar is met pannen of zoomen. */
  onViewportChange: (viewport: Viewport) => void;
  /** Tik op een losse melding. */
  onSelectReport: (reportId: string) => void;
  /** Tik op een cluster: inzoomen naar die plek. */
  onSelectCluster: (lng: number, lat: number, zoom: number) => void;
}
