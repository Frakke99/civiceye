/**
 * Outbox-opslag op web: localStorage. Web heeft geen achtergrondsync — de
 * outbox loopt enkel zolang het tabblad open is (ADR 0006, aanvaarde
 * beperking) — maar de wachtrij zelf overleeft wél een herlaadbeurt.
 *
 * localStorage kan geweigerd zijn (privémodus, ingebedde context); dan valt
 * dit stil terug op een geheugenmap: melden blijft werken, alleen de
 * persistentie over herlaadbeurten valt weg.
 */
import type { OutboxItem, OutboxStore } from './core';

const SLEUTEL = 'civiceye.outbox.v1';

function lees(geheugen: Map<string, OutboxItem>): Map<string, OutboxItem> {
  try {
    const ruw = globalThis.localStorage?.getItem(SLEUTEL);
    if (!ruw) return geheugen;
    const items = JSON.parse(ruw) as OutboxItem[];
    return new Map(items.map((i) => [i.clientRef, i]));
  } catch {
    return geheugen;
  }
}

function schrijf(items: Map<string, OutboxItem>): void {
  try {
    globalThis.localStorage?.setItem(SLEUTEL, JSON.stringify([...items.values()]));
  } catch {
    // Zie boven: opslag geweigerd is geen reden om het melden te blokkeren.
  }
}

export function createOutboxStore(): OutboxStore {
  let geheugen = new Map<string, OutboxItem>();

  return {
    async all(): Promise<OutboxItem[]> {
      geheugen = lees(geheugen);
      return [...geheugen.values()].sort((a, b) => a.createdAt - b.createdAt);
    },
    async upsert(item: OutboxItem): Promise<void> {
      geheugen = lees(geheugen);
      geheugen.set(item.clientRef, item);
      schrijf(geheugen);
    },
    async remove(clientRef: string): Promise<void> {
      geheugen = lees(geheugen);
      geheugen.delete(clientRef);
      schrijf(geheugen);
    },
  };
}
