import { describe, expect, it } from 'vitest';
import { resizeActie, MAX_ZIJDE } from '../src/photo/logic';

describe('resizeActie', () => {
  it('schaalt liggende foto\'s op breedte', () => {
    expect(resizeActie(4000, 3000)).toEqual({ width: MAX_ZIJDE });
  });

  it('schaalt staande foto\'s op hoogte (scenario 7: oriëntatie blijft juist)', () => {
    expect(resizeActie(3000, 4000)).toEqual({ height: MAX_ZIJDE });
  });

  it('schaalt niet op wanneer de foto al klein genoeg is', () => {
    // null = geen resize, maar het re-encoderen (EXIF weg) gebeurt altijd.
    expect(resizeActie(800, 600)).toBeNull();
    expect(resizeActie(1600, 1600)).toBeNull();
  });

  it('valt terug op breedte wanneer de afmetingen onbekend zijn', () => {
    expect(resizeActie(0, 0)).toEqual({ width: MAX_ZIJDE });
  });

  it('een 48 MP-foto (scenario 10) wordt tot de maximale zijde teruggebracht', () => {
    expect(resizeActie(8000, 6000)).toEqual({ width: 1600 });
  });
});
