import { useSyncExternalStore } from 'react';
import { getOutboxSnapshot, subscribeOutbox, type OutboxSnapshot } from './index';

/**
 * De wachtrij in de UI. ADR 0006: de outbox is zichtbaar ("1 melding wacht op
 * verbinding") — een onzichtbare wachtrij voelt als dataverlies.
 */
export function useOutbox(): OutboxSnapshot {
  return useSyncExternalStore(subscribeOutbox, getOutboxSnapshot, getOutboxSnapshot);
}
