/**
 * client_ref: de identiteit van een melding, aangemaakt op het moment dat de
 * gebruiker op "posten" tikt (ADR 0006). De server dedupliceert erop, dus elke
 * retry — nu handmatig, in sprint 3 vanuit de outbox — is veilig.
 */

/**
 * UUIDv4. `crypto.randomUUID` bestaat op web en in recente Hermes-versies,
 * maar niet overal; de terugval gebruikt `getRandomValues` of desnoods
 * `Math.random`. Dat laatste is prima: client_ref is een idempotentiesleutel,
 * geen geheim — botsingskans is het enige dat telt, en die blijft verwaarloosbaar.
 */
export function newClientRef(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Versie- en variantbits volgens RFC 4122, anders weigert Postgres de uuid niet
  // maar is hij formeel geen v4.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
