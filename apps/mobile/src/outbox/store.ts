/**
 * Outbox-opslag op iOS en Android: SQLite via expo-sqlite (ADR 0006). De
 * outbox moet een herstart én een wegzwiep overleven (scenario 11); daarom
 * geen geheugen of AsyncStorage maar een echte tabel.
 *
 * Metro kiest dit bestand op native en store.web.ts op web.
 */
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { OutboxItem, OutboxStore } from './core';

interface Rij {
  client_ref: string;
  payload: string;
  photo_uri: string | null;
  photo_path: string | null;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  created_at: number;
}

function naarItem(rij: Rij): OutboxItem {
  return {
    clientRef: rij.client_ref,
    payload: JSON.parse(rij.payload),
    photoUri: rij.photo_uri,
    photoPath: rij.photo_path,
    attempts: rij.attempts,
    nextAttemptAt: rij.next_attempt_at,
    lastError: (rij.last_error as OutboxItem['lastError']) ?? null,
    createdAt: rij.created_at,
  };
}

export function createOutboxStore(): OutboxStore {
  let db: SQLiteDatabase | null = null;

  async function open(): Promise<SQLiteDatabase> {
    if (db) return db;
    db = openDatabaseSync('outbox.db');
    await db.execAsync(`
      create table if not exists outbox (
        client_ref      text primary key not null,
        payload         text not null,
        photo_uri       text,
        photo_path      text,
        attempts        integer not null default 0,
        next_attempt_at integer not null default 0,
        last_error      text,
        created_at      integer not null
      );
    `);
    return db;
  }

  return {
    async all(): Promise<OutboxItem[]> {
      const d = await open();
      const rijen = await d.getAllAsync<Rij>('select * from outbox order by created_at');
      return rijen.map(naarItem);
    },
    async upsert(item: OutboxItem): Promise<void> {
      const d = await open();
      await d.runAsync(
        `insert into outbox
           (client_ref, payload, photo_uri, photo_path, attempts, next_attempt_at, last_error, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict (client_ref) do update set
           payload = excluded.payload,
           photo_uri = excluded.photo_uri,
           photo_path = excluded.photo_path,
           attempts = excluded.attempts,
           next_attempt_at = excluded.next_attempt_at,
           last_error = excluded.last_error`,
        item.clientRef,
        JSON.stringify(item.payload),
        item.photoUri,
        item.photoPath,
        item.attempts,
        item.nextAttemptAt,
        item.lastError,
        item.createdAt,
      );
    },
    async remove(clientRef: string): Promise<void> {
      const d = await open();
      await d.runAsync('delete from outbox where client_ref = ?', clientRef);
    },
  };
}
