import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  parseApiError,
  quantizeBbox,
  clampZoom,
  type Bbox,
  type ClientPlatform,
  type LitterSize,
  type MapMarker,
  type NearbyReport,
  type ReportDetails,
  type ReportKind,
  type ReportStatus,
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

export async function fetchNearbyReports(
  lat: number,
  lng: number,
  radiusM = 50,
): Promise<NearbyReport[]> {
  const { data, error } = await supabase.rpc('nearby_reports', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
  });
  if (error) throw new ApiError(error);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    reportId: String(r.report_id),
    kind: r.kind as ReportKind,
    size: r.size as NearbyReport['size'],
    distanceM: Number(r.distance_m),
    createdAt: String(r.created_at),
    hasPhoto: Boolean(r.has_photo),
  }));
}

export interface NewReport {
  /** Idempotentiesleutel, aangemaakt bij het tikken op "posten" (ADR 0006). */
  clientRef: string;
  lat: number;
  lng: number;
  kind: ReportKind;
  size: LitterSize | null;
  note?: string;
  accuracyM?: number | null;
  /** storage_path uit de upload-url Edge Function; null = melding zonder foto. */
  photoPath?: string | null;
}

export interface CreateReportResult {
  reportId: string;
  status: ReportStatus;
  createdAt: string;
  /** De server vond binnen de dedupe-straal al een eigen melding en gaf die terug. */
  deduplicated: boolean;
  /** Retry van een eerdere poging: zelfde client_ref, zelfde melding. */
  idempotent: boolean;
}

function clientPlatform(): ClientPlatform {
  switch (Platform.OS) {
    case 'ios':
    case 'android':
    case 'web':
      return Platform.OS;
    default:
      return 'unknown';
  }
}

/**
 * De enige manier om een melding aan te maken. De server valideert álles
 * (authenticatie, blokkade, invoer, servicegebied, rate limits) en antwoordt
 * met een stabiele foutcode; ApiError maakt daar de code uit errors.ts van,
 * zodat de UI overal dezelfde Nederlandse tekst toont.
 */
export async function createReport(melding: NewReport): Promise<CreateReportResult> {
  const { data, error } = await supabase.rpc('create_report', {
    p_client_ref: melding.clientRef,
    p_lat: melding.lat,
    p_lng: melding.lng,
    p_kind: melding.kind,
    p_size: melding.size,
    p_note: melding.note?.trim() ? melding.note.trim() : null,
    p_accuracy_m: melding.accuracyM ?? null,
    p_photo_path: melding.photoPath ?? null,
    p_client: clientPlatform(),
    p_app_version: Constants.expoConfig?.version ?? null,
  });
  if (error) throw new ApiError(error);

  const d = data as Record<string, unknown>;
  return {
    reportId: String(d.report_id),
    status: d.status as ReportStatus,
    createdAt: String(d.created_at),
    deduplicated: Boolean(d.deduplicated),
    idempotent: Boolean(d.idempotent),
  };
}

export interface MyReport {
  reportId: string;
  kind: ReportKind;
  size: LitterSize | null;
  status: ReportStatus;
  note: string | null;
  createdAt: string;
  photoCount: number;
}

/**
 * Eigen meldingen, nieuwste eerst. Het filter op created_by is nodig: RLS
 * geeft naast eigen meldingen ook alle gepubliceerde terug (reports_public_read),
 * en dit scherm moet alléén de eigen tonen — inclusief quarantaine.
 */
export async function fetchMyReports(userId: string): Promise<MyReport[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('id, kind, size, status, note, created_at, photo_count')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new ApiError(error);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    reportId: String(r.id),
    kind: r.kind as ReportKind,
    size: (r.size as LitterSize | null) ?? null,
    status: r.status as ReportStatus,
    note: (r.note as string | null) ?? null,
    createdAt: String(r.created_at),
    photoCount: Number(r.photo_count ?? 0),
  }));
}

/** "Ligt er nog": bevestig een bestaande melding in plaats van te dupliceren. */
export async function confirmReport(reportId: string): Promise<number> {
  const { data, error } = await supabase.rpc('confirm_report', { p_report_id: reportId });
  if (error) throw new ApiError(error);
  return Number((data as Record<string, unknown>).confirm_count ?? 0);
}

/** Publieke CDN-URL van een gescande foto. */
export function photoUrl(supabaseUrl: string, bucket: string, path: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${path}`;
}
