import type { Bbox, MapMarker } from '@gc/shared';

export interface Viewport {
  bbox: Bbox;
  zoom: number;
  centerLng: number;
  centerLat: number;
}

export interface MapCanvasProps {
  markers: MapMarker[];
  initialCenter: { lng: number; lat: number; zoom: number };
  /** Wordt aangeroepen als de gebruiker klaar is met pannen of zoomen. */
  onViewportChange: (viewport: Viewport) => void;
  /** Tik op een losse melding. */
  onSelectReport: (reportId: string) => void;
  /** Tik op een cluster: inzoomen naar die plek. */
  onSelectCluster: (lng: number, lat: number, zoom: number) => void;
}
