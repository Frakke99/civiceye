import {
  parseApiError,
  quantizeBbox,
  clampZoom,
  type Bbox,
  type MapMarker,
  type ReportDetails,
  type ReportKind,
} from '@civiceye/shared';
import { supabase } from '@/api/supabase';

/** Ruwe rijvorm zoals PostgREST hem teruggeeft (snake_case). */
interface MapMarkerRow {
  is_cluster: boolean;
  lng: number;
  lat: number;
  point_count: number;
  report_id: string | null;
  kind: ReportKind;
  size: MapMarker['size'];
  has_photo: boolean;
  created_at: string;
}

function toMarker(row: MapMarkerRow): MapMarker {
  return {
    isCluster: row.is_cluster,
    lng: row.lng,
    lat: row.lat,
    pointCount: row.point_count,
    reportId: row.report_id,
    kind: row.kind,
    size: row.size,
    hasPhoto: row.has_photo,
    createdAt: row.created_at,
  };
}

export class ApiError extends Error {
  readonly code: ReturnType<typeof parseApiError>['code'];
  readonly detail?: string;

  constructor(oorzaak: unknown) {
    const parsed = parseApiError(oorzaak);
    super(parsed.raw);
    this.name = 'ApiError';
    this.code = parsed.code;
    this.detail = parsed.detail;
  }
}

/**
 * Markers voor het kaartvenster. Het venster wordt afgerond op het
 * clusterrooster van de server, zodat kleine pans dezelfde cachesleutel
 * raken (docs/06-kaart-en-performance.md).
 */
export async function fetchMapReports(
  bbox: Bbox,
  zoom: number,
  opties: { kinds?: ReportKind[]; includeCleaned?: boolean } = {},
): Promise<MapMarker[]> {
  const z = clampZoom(zoom);
  const b = quantizeBbox(bbox, z);

  const { data, error } = await supabase.rpc('map_reports', {
    min_lng: b.minLng,
    min_lat: b.minLat,
    max_lng: b.maxLng,
    max_lat: b.maxLat,
    zoom: z,
    kinds: opties.kinds ?? null,
    include_cleaned: opties.includeCleaned ?? false,
  });

  if (error) throw new ApiError(error);
  return ((data ?? []) as MapMarkerRow[]).map(toMarker);
}

export async function fetchReportDetails(reportId: string): Promise<ReportDetails> {
  const { data, error } = await supabase.rpc('report_details', { p_report_id: reportId });
  if (error) throw new ApiError(error);

  const d = data as Record<string, unknown>;
  return {
    reportId: String(d.report_id),
    kind: d.kind as ReportKind,
    size: d.size as ReportDetails['size'],
    lat: Number(d.lat),
    lng: Number(d.lng),
    accuracyM: d.accuracy_m === null ? null : Number(d.accuracy_m),
    note: (d.note as string | null) ?? null,
    status: d.status as ReportDetails['status'],
    createdAt: String(d.created_at),
    cleanedAt: (d.cleaned_at as string | null) ?? null,
    confirmCount: Number(d.confirm_count ?? 0),
    isMine: Boolean(d.is_mine),
    photos: ((d.photos ?? []) as Record<string, unknown>[]).map((p) => ({
      bucket: String(p.bucket),
      path: String(p.path),
      width: p.width === null || p.width === undefined ? null : Number(p.width),
      height: p.height === null || p.height === undefined ? null : Number(p.height),
      blurhash: (p.blurhash as string | null) ?? null,
      status: p.status as ReportDetails['photos'][number]['status'],
    })),
  };
}

/** Publieke CDN-URL van een gescande foto. */
export function photoUrl(supabaseUrl: string, bucket: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${path}`;
}
