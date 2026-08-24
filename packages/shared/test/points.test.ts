import { describe, expect, it } from 'vitest';
import { LITTER_SIZES, pointsFor, REPORT_KINDS } from '../src/index';

describe('pointsFor', () => {
  it('volgt de waarden uit de SQL-functie', () => {
    expect(pointsFor('litter', 'piece')).toBe(1);
    expect(pointsFor('litter', 'bag')).toBe(5);
    expect(pointsFor('litter', 'heap')).toBe(15);
    expect(pointsFor('hazard', null)).toBe(3);
  });

  it('geeft voor elke combinatie een positief geheel getal', () => {
    for (const kind of REPORT_KINDS) {
      for (const size of [...LITTER_SIZES, null]) {
        const p = pointsFor(kind, size);
        expect(Number.isInteger(p), `${kind}/${size}`).toBe(true);
        expect(p).toBeGreaterThan(0);
      }
    }
  });

  it('beloont een grotere hoeveelheid meer, maar niet lineair', () => {
    // Bewuste keuze: een afvalhoop is meer werk dan 15 papiertjes, maar te hoge
    // waarden maken fraude lonend (docs/11).
    expect(pointsFor('litter', 'heap')).toBeGreaterThan(pointsFor('litter', 'bag'));
    expect(pointsFor('litter', 'heap')).toBeLessThan(15 * pointsFor('litter', 'piece') + 1);
  });
});
