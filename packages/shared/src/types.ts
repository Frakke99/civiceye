/**
 * Types die één-op-één overeenkomen met het databaseschema (db/migrations) en
 * met api/openapi.yaml. Wijzigt daar iets, dan wijzigt het hier mee — daarom
 * staan ze in een gedeeld pakket en niet in de app.
 */

/** Alle meldingstypes bestaan in de databank; v1 gebruikt enkel 'litter'. */
export const REPORT_KINDS = [
  'litter',
  'hazard',
  'dead_animal',
  'fallen_tree',
  'damaged_furniture',
  'other',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** De drie symbolen uit de meldflow: papiertje, zak, afvalhoop. */
export const LITTER_SIZES = ['piece', 'bag', 'heap'] as const;
export type LitterSize = (typeof LITTER_SIZES)[number];

export const REPORT_STATUSES = ['published', 'quarantined', 'cleaned', 'removed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const FLAG_REASONS = [
  'not_there',
  'wrong_location',
  'inappropriate',
  'spam',
  'private_person',
  'other',
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export type ClientPlatform = 'ios' | 'android' | 'web' | 'unknown';

export type PhotoScanStatus = 'pending' | 'safe' | 'flagged' | 'failed';

/** Kaartvenster. Altijd WGS84, altijd min < max. */
export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * Eén marker uit `map_reports`. De vorm is identiek voor een losse melding en
 * voor een cluster; `isCluster` bepaalt wat je krijgt. Bij een cluster is
 * `reportId` null en is `pointCount` het aantal meldingen in de cel.
 */
export interface MapMarker {
  isCluster: boolean;
  lng: number;
  lat: number;
  pointCount: number;
  reportId: string | null;
  kind: ReportKind;
  size: LitterSize | null;
  hasPhoto: boolean;
  createdAt: string;
}

export interface ReportPhoto {
  bucket: string;
  path: string;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  status: PhotoScanStatus;
}

export interface ReportDetails {
  reportId: string;
  kind: ReportKind;
  size: LitterSize | null;
  lat: number;
  lng: number;
  accuracyM: number | null;
  note: string | null;
  status: ReportStatus;
  createdAt: string;
  cleanedAt: string | null;
  confirmCount: number;
  isMine: boolean;
  photos: ReportPhoto[];
}

export interface NearbyReport {
  reportId: string;
  kind: ReportKind;
  size: LitterSize | null;
  distanceM: number;
  createdAt: string;
  hasPhoto: boolean;
}
