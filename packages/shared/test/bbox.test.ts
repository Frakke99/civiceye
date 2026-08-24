import { describe, expect, it } from 'vitest';
import {
  bboxArea,
  bboxContains,
  bboxKey,
  clampZoom,
  clusterCellSizeDeg,
  isPointZoom,
  MAX_BBOX_AREA_SQ_DEG,
  normalizeBbox,
  quantizeBbox,
  type Bbox,
} from '../src/index';

const antwerpen: Bbox = { minLng: 4.30, minLat: 51.15, maxLng: 4.55, maxLat: 51.30 };

describe('normalizeBbox', () => {
  it('zet omgewisselde min/max recht', () => {
    expect(normalizeBbox({ minLng: 5, maxLng: 4, minLat: 52, maxLat: 51 })).toEqual({
      minLng: 4, maxLng: 5, minLat: 51, maxLat: 52,
    });
  });

  it('houdt coördinaten binnen WGS84', () => {
    const b = normalizeBbox({ minLng: -400, maxLng: 400, minLat: -200, maxLat: 200 });
    expect(b).toEqual({ minLng: -180, maxLng: 180, minLat: -90, maxLat: 90 });
  });

  it('vervangt NaN door een geldige waarde in plaats van te crashen', () => {
    const b = normalizeBbox({ minLng: NaN, maxLng: 4, minLat: 51, maxLat: NaN });
    expect(Number.isFinite(b.minLng)).toBe(true);
    expect(Number.isFinite(b.maxLat)).toBe(true);
  });
});

describe('quantizeBbox', () => {
  it('omvat altijd het originele venster, op elk zoomniveau', () => {
    // Dit is de eigenschap die telt: zou het afgeronde vak kleiner zijn, dan
    // ontbreken er markers aan de rand van het scherm.
    for (const zoom of [5, 8, 10, 12, 14, 16, 18]) {
      expect(
        bboxContains(quantizeBbox(antwerpen, zoom), normalizeBbox(antwerpen)),
        `zoom ${zoom}`,
      ).toBe(true);
    }
  });

  it('geeft dezelfde sleutel voor een kleine pan', () => {
    const klein = { ...antwerpen, minLng: antwerpen.minLng + 0.001, maxLng: antwerpen.maxLng + 0.001 };
    expect(bboxKey(klein, 13)).toBe(bboxKey(antwerpen, 13));
  });

  it('geeft een andere sleutel na een grote pan', () => {
    const groot = { minLng: 5.30, minLat: 51.15, maxLng: 5.55, maxLat: 51.30 };
    expect(bboxKey(groot, 13)).not.toBe(bboxKey(antwerpen, 13));
  });

  it('geeft een andere sleutel bij een ander zoomniveau', () => {
    expect(bboxKey(antwerpen, 13)).not.toBe(bboxKey(antwerpen, 12));
  });

  it('overschrijdt de servergrens niet', () => {
    // Een venster net onder de grens mag door het afronden niet erboven komen,
    // want dan geeft de server bbox_too_large.
    const bijnaTeGroot: Bbox = { minLng: 0, minLat: 0, maxLng: 9.9, maxLat: 9.9 };
    for (const zoom of [3, 5, 7, 9]) {
      expect(bboxArea(quantizeBbox(bijnaTeGroot, zoom)), `zoom ${zoom}`)
        .toBeLessThanOrEqual(MAX_BBOX_AREA_SQ_DEG);
    }
  });

  it('crasht niet op een venster zonder oppervlak', () => {
    const punt: Bbox = { minLng: 4.4, minLat: 51.2, maxLng: 4.4, maxLat: 51.2 };
    expect(() => quantizeBbox(punt, 15)).not.toThrow();
    expect(bboxContains(quantizeBbox(punt, 15), normalizeBbox(punt))).toBe(true);
  });

  it('is idempotent: opnieuw afronden verandert niets', () => {
    // Anders levert quantize(quantize(b)) een andere cachesleutel dan
    // quantize(b), en loopt de cache stil mis.
    for (const zoom of [6, 9, 12, 15, 17]) {
      const een = quantizeBbox(antwerpen, zoom);
      expect(quantizeBbox(een, zoom), `zoom ${zoom}`).toEqual(een);
      expect(bboxKey(een, zoom)).toBe(bboxKey(antwerpen, zoom));
    }
  });

  it('snapt op hetzelfde rooster als de server clustert', () => {
    const zoom = 10;
    const step = clusterCellSizeDeg(zoom);
    const b = quantizeBbox(antwerpen, zoom);
    for (const waarde of [b.minLng, b.maxLng, b.minLat, b.maxLat]) {
      expect(Math.abs(waarde / step - Math.round(waarde / step))).toBeLessThan(1e-9);
    }
  });
});

describe('clusterrooster', () => {
  it('volgt 360 / 2^(zoom+2), gelijk aan de SQL-functie', () => {
    expect(clusterCellSizeDeg(8)).toBeCloseTo(360 / 2 ** 10, 10);
    expect(clusterCellSizeDeg(13)).toBeCloseTo(360 / 2 ** 15, 10);
  });

  it('halveert per zoomniveau', () => {
    expect(clusterCellSizeDeg(9) * 2).toBeCloseTo(clusterCellSizeDeg(8), 10);
  });

  it('schakelt op zoom 14 over naar losse meldingen', () => {
    expect(isPointZoom(13)).toBe(false);
    expect(isPointZoom(14)).toBe(true);
  });
});

describe('clampZoom', () => {
  it('blijft binnen wat de server aanvaardt', () => {
    expect(clampZoom(0)).toBe(1);
    expect(clampZoom(99)).toBe(22);
    expect(clampZoom(12.6)).toBe(13);
  });

  it('valt terug op een bruikbaar niveau bij onzin', () => {
    expect(clampZoom(NaN)).toBe(12);
  });
});
