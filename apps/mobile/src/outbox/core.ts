/**
 * De kern van de offline outbox (ADR 0006), bewust puur: geen expo, geen
 * supabase, geen React. Store, API en klok worden geïnjecteerd, zodat de
 * retry- en idempotentiescenario's (docs/10, scenario's 11–15) in een
 * unittest naspeelbaar zijn.
 *
 * De outbox is de bron van waarheid tot de server bevestigt. `client_ref` is
 * de identiteit van de melding; retryen is daardoor onvoorwaardelijk veilig.
 */
import {
  isTerminal,
  parseApiError,
  retryDelayMs,
  type LitterSize,
  type ParsedCode,
  type ReportKind,
} from '@civiceye/shared';

export interface OutboxPayload {
  lat: number;
  lng: number;
  kind: ReportKind;
  size: LitterSize | null;
  note?: string;
  accuracyM?: number | null;
}

export interface OutboxItem {
  clientRef: string;
  payload: OutboxPayload;
  /** Lokale (verkleinde) foto die nog geüpload moet worden. */
  photoUri: string | null;
  /** storage_path zodra de upload gelukt is. */
  photoPath: string | null;
  attempts: number;
  /** Epoch ms; 0 = meteen. */
  nextAttemptAt: number;
  lastError: ParsedCode | null;
  createdAt: number;
}

export interface OutboxStore {
  all(): Promise<OutboxItem[]>;
  upsert(item: OutboxItem): Promise<void>;
  remove(clientRef: string): Promise<void>;
}

export interface OutboxApi {
  /** Geeft het storage_path terug. */
  uploadPhoto(localUri: string): Promise<string>;
  createReport(item: OutboxItem): Promise<{ reportId: string }>;
}

export interface SyncResultaat {
  /** Succesvol gepost (of idempotent bevestigd) en uit de outbox. */
  verzonden: { clientRef: string; reportId: string }[];
  /** Definitief mislukt en uit de outbox, met de reden voor de UI. */
  mislukt: { clientRef: string; code: ParsedCode }[];
  /** Blijft staan voor een volgende poging. */
  wachtend: number;
}

/**
 * Captive portals en dode verbindingen geven geen fout maar stilte
 * (scenario 15). Een harde timeout maakt daar een gewone netwerkfout van,
 * zodat de backoff het overneemt in plaats van een eeuwige vastloper.
 */
export const TIMEOUT_MS = 15_000;

export function metTimeout<T>(belofte: Promise<T>, ms: number = TIMEOUT_MS): Promise<T> {
  return new Promise<T>((los, wijs) => {
    const wekker = setTimeout(() => {
      // 'timeout' in de boodschap → parseApiError herkent dit als 'network'.
      wijs(new Error('timeout na wachten op de server'));
    }, ms);
    belofte.then(
      (waarde) => {
        clearTimeout(wekker);
        los(waarde);
      },
      (fout) => {
        clearTimeout(wekker);
        wijs(fout);
      },
    );
  });
}

export function nieuwItem(
  clientRef: string,
  payload: OutboxPayload,
  photoUri: string | null,
  nu: number,
): OutboxItem {
  return {
    clientRef,
    payload,
    photoUri,
    photoPath: null,
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
    createdAt: nu,
  };
}

/**
 * Eén syncronde: alle items waarvan de wachttijd om is, oudste eerst.
 *
 * Volgorde per item (ADR 0006): eerst de foto, dan de melding. Lukt de
 * foto-upload niet door iets anders dan een netwerkfout, dan gaat de melding
 * zónder foto door — een melding die blijft hangen op een mislukte upload is
 * erger dan een melding zonder foto. Een netwerkfout laat het hele item staan:
 * dan zou de post toch ook mislukken.
 */
export async function syncOutbox(
  store: OutboxStore,
  api: OutboxApi,
  nu: () => number = () => Date.now(),
  timeoutMs: number = TIMEOUT_MS,
): Promise<SyncResultaat> {
  const resultaat: SyncResultaat = { verzonden: [], mislukt: [], wachtend: 0 };

  const alle = await store.all();
  const nuMs = nu();
  const klaar = alle
    .filter((i) => i.nextAttemptAt <= nuMs)
    .sort((a, b) => a.createdAt - b.createdAt);
  resultaat.wachtend = alle.length - klaar.length;

  for (const origineel of klaar) {
    const item = { ...origineel };

    if (item.photoUri && !item.photoPath) {
      try {
        item.photoPath = await metTimeout(api.uploadPhoto(item.photoUri), timeoutMs);
        item.photoUri = null;
        await store.upsert(item);
      } catch (e) {
        const code = parseApiError(e).code;
        if (code === 'network') {
          // Zelfde oorzaak als een mislukte post: item ongemoeid laten wachten.
          item.attempts += 1;
          item.nextAttemptAt = nuMs + (retryDelayMs(item.attempts - 1, code) ?? 0);
          item.lastError = code;
          await store.upsert(item);
          resultaat.wachtend += 1;
          continue;
        }
        // Upload kapot om een andere reden: de melding gaat zonder foto door.
        item.photoUri = null;
        item.photoPath = null;
        await store.upsert(item);
      }
    }

    try {
      const { reportId } = await metTimeout(api.createReport(item), timeoutMs);
      await store.remove(item.clientRef);
      resultaat.verzonden.push({ clientRef: item.clientRef, reportId });
    } catch (e) {
      const code = parseApiError(e).code;
      if (isTerminal(code)) {
        // Eeuwig hameren op een melding die nooit zal lukken is het echte
        // gevaar (ADR 0006): eruit, met een zichtbare reden.
        await store.remove(item.clientRef);
        resultaat.mislukt.push({ clientRef: item.clientRef, code });
        continue;
      }
      item.attempts += 1;
      item.lastError = code;
      item.nextAttemptAt = nuMs + (retryDelayMs(item.attempts - 1, code) ?? 0);
      await store.upsert(item);
      resultaat.wachtend += 1;
    }
  }

  return resultaat;
}
