/**
 * De retry- en idempotentiescenario's uit docs/10-rollout-en-testplan.md
 * (11–15), nagespeeld op de pure outbox-kern met een geheugenstore en een
 * scripteerbare API. Dit is de plek waar "vijf offline meldingen worden er
 * exact vijf — niet vier, niet zes" een test is in plaats van een belofte.
 */
import { describe, expect, it } from 'vitest';
import {
  metTimeout,
  nieuwItem,
  syncOutbox,
  type OutboxApi,
  type OutboxItem,
  type OutboxStore,
} from '../src/outbox/core';

function geheugenStore(): OutboxStore & { items: Map<string, OutboxItem> } {
  const items = new Map<string, OutboxItem>();
  return {
    items,
    async all() {
      return [...items.values()];
    },
    async upsert(item) {
      items.set(item.clientRef, { ...item });
    },
    async remove(clientRef) {
      items.delete(clientRef);
    },
  };
}

function payload(): OutboxItem['payload'] {
  return { lat: 51.2194, lng: 4.4025, kind: 'litter', size: 'bag' };
}

/** API die per client_ref bijhoudt hoe vaak er gepost is. */
function telApi(gedrag: (clientRef: string, poging: number) => void = () => {}): OutboxApi & {
  posts: Map<string, number>;
} {
  const posts = new Map<string, number>();
  return {
    posts,
    async uploadPhoto() {
      return 'u/x/foto.jpg';
    },
    async createReport(item) {
      const poging = (posts.get(item.clientRef) ?? 0) + 1;
      posts.set(item.clientRef, poging);
      gedrag(item.clientRef, poging);
      return { reportId: `rapport-${item.clientRef}` };
    },
  };
}

describe('syncOutbox — scenario 14: vijf offline meldingen, dan online', () => {
  it('verstuurt exact vijf meldingen, geen duplicaten', async () => {
    const store = geheugenStore();
    for (let i = 0; i < 5; i++) {
      await store.upsert(nieuwItem(`ref-${i}`, payload(), null, i));
    }

    const api = telApi();
    const resultaat = await syncOutbox(store, api, () => 1000);

    expect(resultaat.verzonden).toHaveLength(5);
    expect(resultaat.mislukt).toHaveLength(0);
    expect(store.items.size).toBe(0);
    // Elke melding exact één post, en de volgorde is oudste eerst.
    expect([...api.posts.values()]).toEqual([1, 1, 1, 1, 1]);
    expect(resultaat.verzonden.map((v) => v.clientRef)).toEqual([
      'ref-0',
      'ref-1',
      'ref-2',
      'ref-3',
      'ref-4',
    ]);
  });
});

describe('syncOutbox — scenario 13: netwerk valt weg midden in het posten', () => {
  it('retryt met hetzelfde client_ref; de tweede ronde maakt geen tweede melding', async () => {
    const store = geheugenStore();
    await store.upsert(nieuwItem('ref-a', payload(), null, 0));

    // Eerste poging: de fetch sterft (de server kan de melding al hebben —
    // dat vangt de idempotentie op de server op, hier telt dat de client
    // hetzelfde client_ref opnieuw stuurt).
    const api = telApi((_, poging) => {
      if (poging === 1) throw new TypeError('Network request failed');
    });

    const ronde1 = await syncOutbox(store, api, () => 1000);
    expect(ronde1.verzonden).toHaveLength(0);
    expect(store.items.size).toBe(1);
    const item = store.items.get('ref-a')!;
    expect(item.lastError).toBe('network');
    expect(item.attempts).toBe(1);
    // Backoff uit ADR 0006: eerste retry na 2 s.
    expect(item.nextAttemptAt).toBe(1000 + 2000);

    // Te vroeg: de wachttijd is nog niet om, dus geen post.
    const teVroeg = await syncOutbox(store, api, () => 2000);
    expect(teVroeg.verzonden).toHaveLength(0);
    expect(api.posts.get('ref-a')).toBe(1);

    // Netwerk terug: zelfde client_ref, melding weg uit de outbox.
    const ronde2 = await syncOutbox(store, api, () => 3001);
    expect(ronde2.verzonden).toEqual([{ clientRef: 'ref-a', reportId: 'rapport-ref-a' }]);
    expect(api.posts.get('ref-a')).toBe(2);
    expect(store.items.size).toBe(0);
  });

  it('laat de backoff groeien zoals ADR 0006 voorschrijft (2, 4, 8, 30 s…)', async () => {
    const store = geheugenStore();
    await store.upsert(nieuwItem('ref-b', payload(), null, 0));
    const api = telApi(() => {
      throw new TypeError('Network request failed');
    });

    const verwacht = [2_000, 4_000, 8_000, 30_000, 300_000, 900_000, 900_000];
    let klok = 0;
    for (const stapMs of verwacht) {
      klok = (store.items.get('ref-b')?.nextAttemptAt ?? 0) + 1;
      await syncOutbox(store, api, () => klok);
      expect(store.items.get('ref-b')!.nextAttemptAt).toBe(klok + stapMs);
    }
  });
});

describe('syncOutbox — definitieve fouten (o.a. scenario "buiten servicegebied")', () => {
  it('haalt het item uit de outbox met een zichtbare reden en stopt met proberen', async () => {
    const store = geheugenStore();
    await store.upsert(nieuwItem('ref-c', payload(), null, 0));
    const api = telApi(() => {
      throw { message: 'outside_service_area' };
    });

    const resultaat = await syncOutbox(store, api, () => 1000);
    expect(resultaat.mislukt).toEqual([{ clientRef: 'ref-c', code: 'outside_service_area' }]);
    expect(store.items.size).toBe(0);

    // Volgende ronde: niets meer te doen — geen eeuwig hameren.
    await syncOutbox(store, api, () => 5000);
    expect(api.posts.get('ref-c')).toBe(1);
  });

  it('pauzeert een uur bij rate_limited in plaats van sneller te proberen', async () => {
    const store = geheugenStore();
    await store.upsert(nieuwItem('ref-d', payload(), null, 0));
    const api = telApi(() => {
      throw { message: 'rate_limited', details: 'hour' };
    });

    await syncOutbox(store, api, () => 1000);
    const item = store.items.get('ref-d')!;
    expect(item.lastError).toBe('rate_limited');
    expect(item.nextAttemptAt).toBe(1000 + 3_600_000);
  });
});

describe('syncOutbox — scenario 15: captive portal (verbinding die niets doorlaat)', () => {
  it('breekt een hangende post af en plant een retry — geen vastloper', async () => {
    const store = geheugenStore();
    await store.upsert(nieuwItem('ref-e', payload(), null, 0));

    const api: OutboxApi = {
      async uploadPhoto() {
        return 'x';
      },
      // Een belofte die nooit oplost: precies wat een captive portal doet.
      createReport: () => new Promise(() => {}),
    };

    const resultaat = await syncOutbox(store, api, () => 1000, 50);
    expect(resultaat.verzonden).toHaveLength(0);
    const item = store.items.get('ref-e')!;
    expect(item.lastError).toBe('network');
    expect(item.attempts).toBe(1);
  });
});

describe('syncOutbox — foto\'s (scenario 11: wegzwiepen tijdens de upload)', () => {
  it('uploadt eerst de foto en bewaart het storage_path vóór de post', async () => {
    const store = geheugenStore();
    await store.upsert(nieuwItem('ref-f', payload(), 'file:///foto.jpg', 0));

    const paden: (string | null)[] = [];
    const api: OutboxApi = {
      async uploadPhoto() {
        return 'u/uid/abc.jpg';
      },
      async createReport(item) {
        paden.push(item.photoPath);
        return { reportId: 'r-f' };
      },
    };

    const resultaat = await syncOutbox(store, api, () => 1000);
    expect(resultaat.verzonden).toHaveLength(1);
    expect(paden).toEqual(['u/uid/abc.jpg']);
  });

  it('een geüploade maar nog niet gepostte melding overleeft een "herstart"', async () => {
    const store = geheugenStore();
    await store.upsert(nieuwItem('ref-g', payload(), 'file:///foto.jpg', 0));

    // Eerste run: upload lukt, de post sterft → app wordt "weggezwiept".
    const api1: OutboxApi = {
      async uploadPhoto() {
        return 'u/uid/def.jpg';
      },
      async createReport() {
        throw new TypeError('Network request failed');
      },
    };
    await syncOutbox(store, api1, () => 1000);
    const bewaard = store.items.get('ref-g')!;
    expect(bewaard.photoPath).toBe('u/uid/def.jpg');
    expect(bewaard.photoUri).toBeNull();

    // Tweede run ("na de herstart"): geen tweede upload, wél de post.
    let uploads = 0;
    const api2: OutboxApi = {
      async uploadPhoto() {
        uploads += 1;
        return 'zou-niet-mogen';
      },
      async createReport(item) {
        return { reportId: `r-${item.photoPath}` };
      },
    };
    const resultaat = await syncOutbox(store, api2, () => 10_000);
    expect(uploads).toBe(0);
    expect(resultaat.verzonden).toEqual([{ clientRef: 'ref-g', reportId: 'r-u/uid/def.jpg' }]);
  });

  it('laat de melding zonder foto doorgaan als de upload zelf stuk is', async () => {
    const store = geheugenStore();
    await store.upsert(nieuwItem('ref-h', payload(), 'file:///foto.jpg', 0));

    const paden: (string | null)[] = [];
    const api: OutboxApi = {
      async uploadPhoto() {
        throw { message: 'invalid_action', details: 'bytes' };
      },
      async createReport(item) {
        paden.push(item.photoPath);
        return { reportId: 'r-h' };
      },
    };

    const resultaat = await syncOutbox(store, api, () => 1000);
    // ADR 0006: een melding zonder foto is nuttig; een melding die blijft
    // hangen op een mislukte upload niet.
    expect(resultaat.verzonden).toHaveLength(1);
    expect(paden).toEqual([null]);
  });

  it('houdt de foto vast bij een netwerkfout: dan zou de post óók mislukken', async () => {
    const store = geheugenStore();
    await store.upsert(nieuwItem('ref-i', payload(), 'file:///foto.jpg', 0));

    let posts = 0;
    const api: OutboxApi = {
      async uploadPhoto() {
        throw new TypeError('Network request failed');
      },
      async createReport() {
        posts += 1;
        return { reportId: 'r-i' };
      },
    };

    await syncOutbox(store, api, () => 1000);
    const item = store.items.get('ref-i')!;
    expect(item.photoUri).toBe('file:///foto.jpg');
    expect(posts).toBe(0);
  });
});

describe('metTimeout', () => {
  it('geeft het resultaat door wanneer de belofte op tijd oplost', async () => {
    await expect(metTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('wijst af met een timeout die als netwerkfout parseert', async () => {
    await expect(metTimeout(new Promise(() => {}), 20)).rejects.toThrow(/timeout/);
  });
});
