import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  ERROR_TEXT_NL,
  errorText,
  isTerminal,
  parseApiError,
  retryDelayMs,
} from '../src/index';

describe('parseApiError', () => {
  it('leest een PostgREST-antwoord', () => {
    const r = parseApiError({ code: 'P0001', message: 'rate_limited', details: 'hour' });
    expect(r.code).toBe('rate_limited');
    expect(r.detail).toBe('hour');
  });

  it('vindt de code in een langere Postgres-melding', () => {
    const r = parseApiError({
      message: 'unhandled exception: outside_service_area (SQLSTATE P0001)',
    });
    expect(r.code).toBe('outside_service_area');
  });

  it('herkent een netwerkfout van fetch', () => {
    const e = new TypeError('Failed to fetch');
    expect(parseApiError(e).code).toBe('network');
  });

  it('geeft nooit een crash op rommel', () => {
    for (const rommel of [null, undefined, 0, '', [], {}, { message: 42 }]) {
      expect(() => parseApiError(rommel)).not.toThrow();
      expect(parseApiError(rommel).code).toMatch(/unknown|network/);
    }
  });

  it('bewaart de ruwe boodschap voor Sentry', () => {
    expect(parseApiError({ message: 'rate_limited' }).raw).toBe('rate_limited');
  });
});

describe('isTerminal', () => {
  it('markeert fouten die nooit zullen lukken', () => {
    expect(isTerminal('outside_service_area')).toBe(true);
    expect(isTerminal('size_required')).toBe(true);
    expect(isTerminal('account_blocked')).toBe(true);
  });

  it('markeert tijdelijke fouten niet als definitief', () => {
    // Zonder dit blijft een melding niet in de outbox staan en gaat ze verloren.
    expect(isTerminal('network')).toBe(false);
    expect(isTerminal('rate_limited')).toBe(false);
    expect(isTerminal('not_authenticated')).toBe(false);
    expect(isTerminal('unknown')).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('volgt de backoff uit ADR 0006', () => {
    expect(retryDelayMs(0, 'network')).toBe(2_000);
    expect(retryDelayMs(1, 'network')).toBe(4_000);
    expect(retryDelayMs(2, 'network')).toBe(8_000);
    expect(retryDelayMs(3, 'network')).toBe(30_000);
    expect(retryDelayMs(4, 'network')).toBe(300_000);
  });

  it('blijft daarna elk kwartier proberen, niet sneller', () => {
    expect(retryDelayMs(5, 'network')).toBe(900_000);
    expect(retryDelayMs(50, 'network')).toBe(900_000);
  });

  it('stopt bij een definitieve fout', () => {
    expect(retryDelayMs(0, 'outside_service_area')).toBeNull();
  });

  it('pauzeert een uur bij een rate limit', () => {
    expect(retryDelayMs(0, 'rate_limited')).toBe(3_600_000);
  });

  it('crasht niet op een negatieve of gebroken poging', () => {
    expect(retryDelayMs(-3, 'network')).toBe(2_000);
    expect(retryDelayMs(1.7, 'network')).toBe(4_000);
  });
});

describe('teksten', () => {
  it('heeft een Nederlandse tekst voor elke foutcode', () => {
    // Anders krijgt een gebruiker ooit "undefined" te zien.
    for (const code of API_ERROR_CODES) {
      expect(ERROR_TEXT_NL[code], code).toBeTruthy();
    }
    expect(ERROR_TEXT_NL.network).toBeTruthy();
    expect(ERROR_TEXT_NL.unknown).toBeTruthy();
  });

  it('gebruikt het detailveld waar dat helpt', () => {
    expect(errorText('rate_limited', 'day')).toContain('dagelijkse');
    expect(errorText('too_far_away', '120')).toContain('120');
  });

  it('valt terug op de standaardtekst zonder detail', () => {
    expect(errorText('rate_limited')).toBe(ERROR_TEXT_NL.rate_limited);
  });
});
