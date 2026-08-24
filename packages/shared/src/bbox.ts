/**
 * Kaartvenster-berekeningen. Staat hier en niet in de app omdat het pure
 * rekenkunde is die getest moet zijn: een fout hier betekent verdwijnende
 * markers of een kaart die bij elke pixel opnieuw laadt.
 */
import type { Bbox } from './types';

/** Grens die de server afdwingt (`bbox_too_large` in map_reports). */
export const MAX_BBOX_AREA_SQ_DEG = 100;

/** Vanaf dit zoomniveau geeft de server losse meldingen in plaats van clusters. */
export const POINT_ZOOM_THRESHOLD = 14;

export function isPointZoom(zoom: number): boolean {
  return zoom >= POINT_ZOOM_THRESHOLD;
}

/**
 * Rastergrootte die de server gebruikt om te clusteren: 360° / 2^(zoom+2),
 * dus 4×4 cellen per kaarttegel. Zie docs/06-kaart-en-performance.md.
 * Handig in de client om clusterbellen op de juiste grootte te tekenen.
 */
export function clusterCellSizeDeg(zoom: number): number {
  return 360 / Math.pow(2, clampZoom(zoom) + 2);
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 12;
  return Math.min(22, Math.max(1, Math.round(zoom)));
}

export function bboxArea(b: Bbox): number {
  return Math.abs(b.maxLng - b.minLng) * Math.abs(b.maxLat - b.minLat);
}

/** Zet min/max recht en houdt de waarden binnen WGS84. */
export function normalizeBbox(b: Bbox): Bbox {
  const minLng = Math.min(b.minLng, b.maxLng);
  const maxLng = Math.max(b.minLng, b.maxLng);
  const minLat = Math.min(b.minLat, b.maxLat);
  const maxLat = Math.max(b.minLat, b.maxLat);
  return {
    minLng: clamp(minLng, -180, 180),
    maxLng: clamp(maxLng, -180, 180),
    minLat: clamp(minLat, -90, 90),
    maxLat: clamp(maxLat, -90, 90),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * Snapt het venster op het **clusterrooster van de server** (360° / 2^(zoom+2)).
 *
 * Waarom afronden: zonder dit krijgt elke pixel pan een nieuwe cachesleutel en
 * dus een nieuwe query. Met afronding vallen kleine bewegingen op dezelfde
 * sleutel en komt het antwoord uit de cache.
 *
 * Waarom op een raster dat aan de **zoom** hangt en niet aan de vensterbreedte:
 * een rasterstap die uit de invoer komt, is niet idempotent. Opnieuw afronden
 * geeft dan een grotere stap en dus een groter vak, waardoor twee keer
 * afronden een andere cachesleutel oplevert dan één keer. Een vast raster per
 * zoomniveau heeft dat probleem niet, en sluit bovendien aan bij de cellen
 * waarop de server clustert (docs/06-kaart-en-performance.md).
 *
 * Het resultaat **omvat altijd het originele venster** (naar buiten afgerond),
 * anders zouden er markers aan de rand ontbreken. Zou het afgeronde venster
 * daardoor boven de servergrens uitkomen, dan geven we het genormaliseerde
 * origineel terug — een iets minder efficiënte cache is beter dan een
 * `bbox_too_large`-fout.
 */
export function quantizeBbox(bbox: Bbox, zoom: number): Bbox {
  const b = normalizeBbox(bbox);
  const step = clusterCellSizeDeg(zoom);

  if (!(step > 0)) return b;

  const afgerond = normalizeBbox({
    minLng: Math.floor(b.minLng / step) * step,
    maxLng: Math.ceil(b.maxLng / step) * step,
    minLat: Math.floor(b.minLat / step) * step,
    maxLat: Math.ceil(b.maxLat / step) * step,
  });

  return bboxArea(afgerond) > MAX_BBOX_AREA_SQ_DEG ? b : afgerond;
}

/**
 * Cachesleutel voor het kaartvenster. Afgerond op 5 decimalen (~1 m), zodat
 * afrondingsruis in floats geen twee sleutels voor hetzelfde vak maakt.
 */
export function bboxKey(bbox: Bbox, zoom: number): string {
  const z = clampZoom(zoom);
  const b = quantizeBbox(bbox, z);
  const r = (n: number) => n.toFixed(5);
  return `${z}:${r(b.minLng)},${r(b.minLat)},${r(b.maxLng)},${r(b.maxLat)}`;
}

export function bboxContains(outer: Bbox, inner: Bbox): boolean {
  return (
    outer.minLng <= inner.minLng &&
    outer.minLat <= inner.minLat &&
    outer.maxLng >= inner.maxLng &&
    outer.maxLat >= inner.maxLat
  );
}
