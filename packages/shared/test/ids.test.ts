import { afterEach, describe, expect, it, vi } from 'vitest';
import { newClientRef, UUID_RE } from '../src/ids';

describe('newClientRef', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('geeft een geldige uuid v4', () => {
    expect(newClientRef()).toMatch(UUID_RE);
  });

  it('botst niet bij herhaald aanmaken', () => {
    const refs = new Set(Array.from({ length: 1000 }, () => newClientRef()));
    expect(refs.size).toBe(1000);
  });

  it('werkt ook zonder Web Crypto (oudere Hermes)', () => {
    // Op een toestel zonder crypto.randomUUID/getRandomValues moet de terugval
    // nog steeds een formeel geldige v4 opleveren, anders weigert Postgres hem niet
    // maar klopt het idempotentiegedrag net niet meer met de aanname.
    vi.stubGlobal('crypto', undefined);
    const ref = newClientRef();
    expect(ref).toMatch(UUID_RE);
  });

  it('zet de versie- en variantbits ook op het getRandomValues-pad', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        arr.fill(0xff);
        return arr;
      },
    });
    expect(newClientRef()).toMatch(UUID_RE);
  });
});
