/**
 * De outbox zoals de app hem gebruikt: één singleton rond de pure kern
 * (core.ts), met de drie sync-triggers uit ADR 0006 — app naar de voorgrond,
 * netwerk terug (expo-network) en een timer op next_attempt_at — en een
 * abonnement voor de UI, want een onzichtbare wachtrij voelt als dataverlies.
 */
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import type { QueryClient } from '@tanstack/react-query';
import type { ParsedCode } from '@civiceye/shared';
import { createReport } from '@/api/reports';
import { ensureSession } from '@/auth/session';
import { uploadPhoto } from '@/photo/uploadPhoto';
import { createOutboxStore } from './store';
import { nieuwItem, syncOutbox, type OutboxItem, type OutboxPayload } from './core';

export interface OutboxSnapshot {
  /** Wat nog verstuurd moet worden, oudste eerst. */
  items: OutboxItem[];
  /** Definitief mislukte meldingen, zichtbaar tot de gebruiker ze wegveegt. */
  mislukt: { clientRef: string; code: ParsedCode; createdAt: number }[];
}

type Luisteraar = (snapshot: OutboxSnapshot) => void;

const store = createOutboxStore();
const api = {
  uploadPhoto,
  async createReport(item: OutboxItem): Promise<{ reportId: string }> {
    // De sessie kan bij het opstarten gefaald zijn; stil opnieuw proberen.
    await ensureSession();
    const r = await createReport({
      clientRef: item.clientRef,
      lat: item.payload.lat,
      lng: item.payload.lng,
      kind: item.payload.kind,
      size: item.payload.size,
      note: item.payload.note,
      accuracyM: item.payload.accuracyM,
      photoPath: item.photoPath,
    });
    return { reportId: r.reportId };
  },
};

let snapshot: OutboxSnapshot = { items: [], mislukt: [] };
const luisteraars = new Set<Luisteraar>();
let bezig = false;
let gestart = false;
let queryClient: QueryClient | null = null;

function meldWijziging(): void {
  for (const luisteraar of luisteraars) luisteraar(snapshot);
}

async function ververs(): Promise<void> {
  snapshot = { ...snapshot, items: await store.all() };
  meldWijziging();
}

export function getOutboxSnapshot(): OutboxSnapshot {
  return snapshot;
}

export function subscribeOutbox(luisteraar: Luisteraar): () => void {
  luisteraars.add(luisteraar);
  luisteraar(snapshot);
  return () => luisteraars.delete(luisteraar);
}

export function verwijderMislukt(clientRef: string): void {
  snapshot = {
    ...snapshot,
    mislukt: snapshot.mislukt.filter((m) => m.clientRef !== clientRef),
  };
  meldWijziging();
}

/**
 * Eén syncronde. Veilig om vaak aan te roepen: rondes lopen nooit door elkaar
 * (de tweede aanroep wordt overgeslagen; de timer haalt de rest later op).
 */
export async function syncNow(): Promise<{
  verzonden: { clientRef: string; reportId: string }[];
  mislukt: { clientRef: string; code: ParsedCode }[];
}> {
  if (bezig) return { verzonden: [], mislukt: [] };
  bezig = true;
  try {
    const resultaat = await syncOutbox(store, api);
    if (resultaat.mislukt.length > 0) {
      snapshot = {
        ...snapshot,
        mislukt: [
          ...snapshot.mislukt,
          ...resultaat.mislukt.map((m) => ({ ...m, createdAt: Date.now() })),
        ],
      };
    }
    await ververs();
    if (resultaat.verzonden.length > 0 && queryClient) {
      void queryClient.invalidateQueries({ queryKey: ['map-reports'] });
      void queryClient.invalidateQueries({ queryKey: ['my-reports'] });
    }
    return { verzonden: resultaat.verzonden, mislukt: resultaat.mislukt };
  } finally {
    bezig = false;
  }
}

/** Melding in de wachtrij zetten en meteen één verzendpoging doen. */
export async function enqueueReport(
  clientRef: string,
  payload: OutboxPayload,
  photoUri: string | null,
): Promise<void> {
  await store.upsert(nieuwItem(clientRef, payload, photoUri, Date.now()));
  await ververs();
}

/**
 * Triggers aanzetten; hoort één keer te gebeuren, in de root-layout. De
 * queryClient is nodig om de kaart en "Mijn meldingen" te verversen zodra een
 * wachtende melding alsnog doorgaat.
 */
export function startOutbox(client: QueryClient): void {
  queryClient = client;
  if (gestart) return;
  gestart = true;

  void ververs().then(() => {
    if (snapshot.items.length > 0) void syncNow();
  });

  AppState.addEventListener('change', (status) => {
    if (status === 'active' && snapshot.items.length > 0) void syncNow();
  });

  Network.addNetworkStateListener((netwerk) => {
    if (netwerk.isConnected && snapshot.items.length > 0) void syncNow();
  });

  // De timer op next_attempt_at: elke 15 s kijken of er iets klaarstaat. De
  // syncronde zelf filtert op de wachttijd, dus dit is goedkoop.
  setInterval(() => {
    const nu = Date.now();
    if (snapshot.items.some((i) => i.nextAttemptAt <= nu)) void syncNow();
  }, 15_000);
}
