import { describe, expect, it } from 'vitest';
import type { MapMarker } from '@gc/shared';
import {
  clusterRadius,
  markerColor,
  markerLabel,
  relativeTimeNl,
  sizeLabelNl,
  toMarkerCollection,
  totalReports,
} from '../src/map/markers';

function marker(over: Partial<MapMarker> = {}): MapMarker {
  return {
    isCluster: false,
    lng: 4.4025,
    lat: 51.2194,
    pointCount: 1,
    reportId: 'r1',
    kind: 'litter',
    size: 'bag',
    hasPhoto: false,
    createdAt: '2026-08-20T10:00:00Z',
    ...over,
  };
}

describe('toMarkerCollection', () => {
  it('maakt één feature per marker', () => {
    const c = toMarkerCollection([marker(), marker({ reportId: 'r2', lng: 4.41 })]);
    expect(c.type).toBe('FeatureCollection');
    expect(c.features).toHaveLength(2);
    expect(c.features[0]?.geometry.coordinates).toEqual([4.4025, 51.2194]);
  });

  it('zet lng vóór lat, zoals GeoJSON vereist', () => {
    // Omgekeerd zou elke melding in de oceaan bij Somalië belanden.
    const [lng, lat] = toMarkerCollection([marker()])!.features[0]!.geometry.coordinates;
    expect(lng).toBeCloseTo(4.4025);
    expect(lat).toBeCloseTo(51.2194);
  });

  it('laat markers met ongeldige coördinaten weg', () => {
    // Eén NaN zorgt ervoor dat MapLibre de hele laag niet meer tekent; dan lijkt
    // de kaart leeg terwijl er data is.
    const c = toMarkerCollection([
      marker(),
      marker({ lng: NaN }),
      marker({ lat: Infinity }),
      marker({ lng: 999 }),
      marker({ lat: -91 }),
    ]);
    expect(c.features).toHaveLength(1);
  });

  it('geeft clusters een leeg reportId in plaats van null', () => {
    // MapLibre-properties mogen geen null bevatten in expressies.
    const c = toMarkerCollection([marker({ isCluster: true, reportId: null, pointCount: 12 })]);
    expect(c.features[0]?.properties.reportId).toBe('');
    expect(c.features[0]?.properties.isCluster).toBe(true);
  });

  it('geeft oplopende, unieke feature-ids', () => {
    const c = toMarkerCollection([marker(), marker({ lng: 4.41 }), marker({ lng: 4.42 })]);
    expect(c.features.map((f) => f.id)).toEqual([0, 1, 2]);
  });

  it('crasht niet op een lege lijst', () => {
    expect(toMarkerCollection([]).features).toEqual([]);
  });
});

describe('totalReports', () => {
  it('telt clusters voor hun pointCount', () => {
    expect(
      totalReports([
        marker({ isCluster: true, pointCount: 23 }),
        marker({ isCluster: true, pointCount: 7 }),
        marker(),
      ]),
    ).toBe(31);
  });

  it('is 0 zonder markers', () => {
    expect(totalReports([])).toBe(0);
  });
});

describe('markerLabel', () => {
  it('toont het aantal bij een cluster', () => {
    expect(markerLabel(marker({ isCluster: true, pointCount: 23 }))).toBe('23');
  });

  it('kort grote aantallen af', () => {
    expect(markerLabel(marker({ isCluster: true, pointCount: 1400 }))).toBe('1k');
  });

  it('toont het symbool van de grootte bij een losse melding', () => {
    expect(markerLabel(marker({ size: 'piece' }))).toBe('📄');
    expect(markerLabel(marker({ size: 'heap' }))).toBe('🗑️');
  });

  it('valt terug op het type-symbool bij een melding zonder grootte', () => {
    expect(markerLabel(marker({ kind: 'fallen_tree', size: null }))).toBe('🌳');
  });
});

describe('markerColor', () => {
  it('geeft elke grootte een eigen kleur', () => {
    const kleuren = new Set(
      (['piece', 'bag', 'heap'] as const).map((size) => markerColor(marker({ size }))),
    );
    expect(kleuren.size).toBe(3);
  });

  it('geeft clusters een eigen kleur, los van de grootte', () => {
    expect(markerColor(marker({ isCluster: true, size: 'heap' }))).not.toBe(
      markerColor(marker({ size: 'heap' })),
    );
  });

  it('geeft altijd een geldige hexkleur', () => {
    for (const m of [marker(), marker({ isCluster: true }), marker({ kind: 'other', size: null })]) {
      expect(markerColor(m)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('clusterRadius', () => {
  it('groeit met het aantal, maar begrensd', () => {
    expect(clusterRadius(2)).toBeLessThan(clusterRadius(50));
    expect(clusterRadius(100000)).toBeLessThanOrEqual(34);
  });

  it('blijft aantikbaar (minstens 14 px) ook bij onzinwaarden', () => {
    // Apple en Google vragen 44 pt raakvlak; een radius van 14 geeft 28 px
    // plus de onzichtbare marge die MapLibre zelf aanhoudt.
    expect(clusterRadius(0)).toBeGreaterThanOrEqual(14);
    expect(clusterRadius(-5)).toBeGreaterThanOrEqual(14);
  });
});

describe('relativeTimeNl', () => {
  const nu = new Date('2026-08-24T12:00:00Z');

  it('beschrijft de tijd in het Nederlands', () => {
    expect(relativeTimeNl('2026-08-24T11:59:30Z', nu)).toBe('net gemeld');
    expect(relativeTimeNl('2026-08-24T11:30:00Z', nu)).toBe('30 min geleden');
    expect(relativeTimeNl('2026-08-24T09:00:00Z', nu)).toBe('3 uur geleden');
    expect(relativeTimeNl('2026-08-23T12:00:00Z', nu)).toBe('gisteren');
    expect(relativeTimeNl('2026-08-19T12:00:00Z', nu)).toBe('5 dagen geleden');
    expect(relativeTimeNl('2026-06-24T12:00:00Z', nu)).toBe('2 maanden geleden');
  });

  it('gaat op precies 30 dagen over naar maanden, zonder gat', () => {
    // Anders spring je van "30 dagen geleden" naar "1 maand geleden" met een
    // dag verschil, wat er als een bug uitziet.
    expect(relativeTimeNl('2026-07-26T12:00:00Z', nu)).toBe('29 dagen geleden');
    expect(relativeTimeNl('2026-07-25T12:00:00Z', nu)).toBe('1 maand geleden');
  });

  it('gebruikt enkelvoud waar dat hoort', () => {
    expect(relativeTimeNl('2026-08-24T11:00:00Z', nu)).toBe('1 uur geleden');
    expect(relativeTimeNl('2026-08-23T12:00:00Z', nu)).toBe('gisteren');
  });

  it('geeft geen negatieve tijd bij een klok die voorloopt', () => {
    expect(relativeTimeNl('2026-08-24T12:05:00Z', nu)).toBe('net gemeld');
  });

  it('geeft een lege string bij een ongeldige datum', () => {
    expect(relativeTimeNl('geen datum', nu)).toBe('');
  });
});

describe('sizeLabelNl', () => {
  it('benoemt de drie groottes', () => {
    expect(sizeLabelNl('piece')).toBe('Papiertje');
    expect(sizeLabelNl('bag')).toBe('Afvalzak');
    expect(sizeLabelNl('heap')).toBe('Afvalhoop');
    expect(sizeLabelNl(null)).toBe('Afval');
  });
});
