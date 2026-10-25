import { describe, expect, it } from 'vitest';
import { nl, t } from '../src/i18n';

describe('nl.json', () => {
  it('heeft geen lege teksten', () => {
    for (const [sleutel, waarde] of Object.entries(nl)) {
      expect(waarde.trim().length, `lege tekst bij ${sleutel}`).toBeGreaterThan(0);
    }
  });

  it('heeft alleen nette {{naam}}-placeholders', () => {
    for (const [sleutel, waarde] of Object.entries(nl)) {
      // Elke accolade hoort bij een placeholder; een losse { of } is bijna
      // zeker een tikfout die als rauwe tekst op een scherm zou belanden.
      const zonderPlaceholders = waarde.replace(/\{\{\w+\}\}/g, '');
      expect(zonderPlaceholders, `kapotte placeholder bij ${sleutel}`).not.toMatch(/[{}]/);
    }
  });
});

describe('t', () => {
  it('vult placeholders in', () => {
    expect(t('kaart.aantalMeldingen', { n: 30 })).toBe('30 meldingen');
    expect(t('meldflow.duplicaatAfstand', { m: 7, tijd: '3 dagen geleden' })).toBe(
      '7 m van je pin · 3 dagen geleden',
    );
  });

  it('vult een placeholder die meermaals voorkomt overal in', () => {
    expect(t('fallback.samenvatting', { markers: 2, meldingen: 2 })).toBe(
      '2 markers · 2 meldingen',
    );
  });

  it('laat tekst zonder placeholders ongemoeid', () => {
    expect(t('kaart.geenMeldingen')).toBe('Geen meldingen in beeld');
  });
});
