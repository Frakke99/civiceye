import { describe, expect, it } from 'vitest';
import type { NearbyReport } from '@civiceye/shared';
import { duplicatesFor, optimisticMarker, withMarker } from '../src/report/logic';

function buurman(overrides: Partial<NearbyReport> = {}): NearbyReport {
  return {
    reportId: 'aaaa1111-2222-3333-4444-555566667777',
    kind: 'litter',
    size: 'bag',
    distanceM: 10,
    createdAt: '2026-08-22T10:00:00Z',
    hasPhoto: false,
    ...overrides,
  };
}

describe('duplicatesFor', () => {
  it('houdt enkel hetzelfde type binnen de straal over', () => {
    const nearby = [
      buurman({ reportId: 'a', distanceM: 5 }),
      buurman({ reportId: 'b', distanceM: 21 }), // te ver: nearby_reports zoekt ruimer dan de vraagdrempel
      buurman({ reportId: 'c', kind: 'hazard', distanceM: 3 }), // ander type
    ];
    expect(duplicatesFor(nearby, 'litter').map((n) => n.reportId)).toEqual(['a']);
  });

  it('sorteert dichtstbijzijnde eerst, want daar gaat "ligt er nog" over', () => {
    const nearby = [
      buurman({ reportId: 'ver', distanceM: 18 }),
      buurman({ reportId: 'dichtbij', distanceM: 2 }),
    ];
    expect(duplicatesFor(nearby, 'litter').map((n) => n.reportId)).toEqual(['dichtbij', 'ver']);
  });

  it('geeft leeg terug als er niets relevants ligt', () => {
    expect(duplicatesFor([], 'litter')).toEqual([]);
    expect(duplicatesFor([buurman({ kind: 'other' })], 'litter')).toEqual([]);
  });
});

describe('optimisticMarker', () => {
  it('heeft exact de vorm van een map_reports-marker', () => {
    const marker = optimisticMarker({
      reportId: 'r1',
      lat: 51.2,
      lng: 4.4,
      kind: 'litter',
      size: 'heap',
      createdAt: '2026-08-24T12:00:00Z',
    });
    expect(marker).toEqual({
      isCluster: false,
      lng: 4.4,
      lat: 51.2,
      pointCount: 1,
      reportId: 'r1',
      kind: 'litter',
      size: 'heap',
      hasPhoto: false,
      createdAt: '2026-08-24T12:00:00Z',
    });
  });
});

describe('withMarker', () => {
  const marker = optimisticMarker({
    reportId: 'r1',
    lat: 51.2,
    lng: 4.4,
    kind: 'litter',
    size: 'bag',
    createdAt: '2026-08-24T12:00:00Z',
  });

  it('voegt een nieuwe marker toe zonder de bestaande te raken', () => {
    const bestaand = optimisticMarker({
      reportId: 'r0',
      lat: 51.3,
      lng: 4.5,
      kind: 'litter',
      size: 'piece',
      createdAt: '2026-08-23T12:00:00Z',
    });
    const resultaat = withMarker([bestaand], marker);
    expect(resultaat).toHaveLength(2);
    expect(resultaat[0]).toBe(bestaand);
  });

  it('dupliceert niet bij een idempotente of gededupliceerde post', () => {
    expect(withMarker([marker], marker)).toHaveLength(1);
  });

  it('laat clusters (reportId null) met rust bij de duplicaatcheck', () => {
    const cluster = { ...marker, isCluster: true, reportId: null, pointCount: 12 };
    expect(withMarker([cluster], marker)).toHaveLength(2);
  });
});
