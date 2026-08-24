/**
 * Foutcodes van de API. De server stuurt een **stabiele machinecode** als
 * `message`; de teksten staan hier, zodat vertalen geen backend-release vraagt.
 * Zie docs/04-api-contract.md voor de volledige tabel.
 */

export const API_ERROR_CODES = [
  'not_authenticated',
  'account_blocked',
  'invalid_coordinates',
  'invalid_kind',
  'size_required',
  'outside_service_area',
  'rate_limited',
  'report_not_found',
  'bbox_too_large',
  'invalid_bbox',
  'feature_disabled',
  'too_far_away',
  'already_cleaned',
  'forbidden',
  'photo_not_found',
  'user_not_found',
  'invalid_action',
  'duplicate_nearby',
  'own_report_cooldown',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
export type ParsedCode = ApiErrorCode | 'network' | 'unknown';

export interface ParsedApiError {
  code: ParsedCode;
  /** Extra veld van de server, bv. 'hour' bij rate_limited of meters bij too_far_away. */
  detail?: string;
  /** Ruwe boodschap, voor Sentry — nooit voor de gebruiker. */
  raw: string;
}

function isApiErrorCode(value: string): value is ApiErrorCode {
  return (API_ERROR_CODES as readonly string[]).includes(value);
}

/**
 * Haalt de code uit wat PostgREST, supabase-js of fetch teruggeeft. Bewust
 * defensief: een onbekende vorm mag nooit een crash worden, want dit loopt op
 * het pad waar de gebruiker net op "posten" heeft getikt.
 */
export function parseApiError(error: unknown): ParsedApiError {
  if (error === null || error === undefined) {
    return { code: 'unknown', raw: 'null' };
  }

  if (typeof error === 'string') {
    return { code: isApiErrorCode(error) ? error : 'unknown', raw: error };
  }

  const obj = error as Record<string, unknown>;
  const message = typeof obj.message === 'string' ? obj.message : '';
  const detail =
    typeof obj.details === 'string'
      ? obj.details
      : typeof obj.detail === 'string'
        ? obj.detail
        : undefined;

  // fetch geeft bij netwerkproblemen een TypeError met een vage boodschap
  if (
    obj.name === 'TypeError' ||
    /network|failed to fetch|timeout|aborted|ECONNREFUSED/i.test(message)
  ) {
    return { code: 'network', detail, raw: message || String(obj.name ?? '') };
  }

  // De code kan in message staan, of ergens in een langere Postgres-melding
  const trimmed = message.trim();
  if (isApiErrorCode(trimmed)) {
    return { code: trimmed, detail, raw: message };
  }
  const gevonden = API_ERROR_CODES.find((code) => trimmed.includes(code));
  if (gevonden) {
    return { code: gevonden, detail, raw: message };
  }

  return { code: 'unknown', detail, raw: message || JSON.stringify(error) };
}

/**
 * Is verder proberen zinloos? Zo ja, dan moet het item uit de outbox met een
 * zichtbare uitleg. Zonder dit onderscheid hamert de app eeuwig op een melding
 * die nooit zal lukken (ADR 0006).
 */
export function isTerminal(code: ParsedCode): boolean {
  switch (code) {
    case 'account_blocked':
    case 'invalid_coordinates':
    case 'invalid_kind':
    case 'size_required':
    case 'outside_service_area':
    case 'report_not_found':
    case 'feature_disabled':
    case 'forbidden':
    case 'invalid_action':
      return true;
    default:
      return false;
  }
}

/** Backoff uit ADR 0006: 2 s, 4 s, 8 s, 30 s, 5 min, daarna elk kwartier. */
const BACKOFF_MS = [2_000, 4_000, 8_000, 30_000, 300_000] as const;
const BACKOFF_TAIL_MS = 900_000;

/**
 * Hoe lang wachten voor poging `attempt` (0-gebaseerd)?
 * `null` betekent: niet opnieuw proberen.
 */
export function retryDelayMs(attempt: number, code: ParsedCode): number | null {
  if (isTerminal(code)) return null;
  // Aan de rate limit zitten betekent wachten, niet sneller proberen.
  if (code === 'rate_limited') return 3_600_000;
  const index = Math.max(0, Math.floor(attempt));
  // ?? dekt het geval dat de index buiten de tabel valt; noUncheckedIndexedAccess
  // dwingt dat af, en het is ook echt de juiste uitkomst.
  return BACKOFF_MS[index] ?? BACKOFF_TAIL_MS;
}

/**
 * Nederlandse teksten. Bewust hier en niet in de database: een tekstwijziging
 * mag geen migratie zijn, en fase 2 voegt hier gewoon en.json naast.
 */
export const ERROR_TEXT_NL: Record<ParsedCode, string> = {
  not_authenticated: 'Even niet gelukt om je verbinding op te zetten. Probeer opnieuw.',
  account_blocked:
    'Dit toestel is geblokkeerd wegens misbruik. Neem contact op als je denkt dat dit fout is.',
  invalid_coordinates: 'Die locatie klopt niet. Verplaats de pin en probeer opnieuw.',
  invalid_kind: 'Dit meldingstype kent de app nog niet. Werk de app bij.',
  size_required: 'Kies eerst hoe groot het afval is.',
  outside_service_area: 'Hier zijn we nog niet actief. Laat weten waar je ons wil zien!',
  rate_limited: 'Je hebt veel gemeld in korte tijd. Probeer het later opnieuw.',
  report_not_found: 'Deze melding bestaat niet meer.',
  bbox_too_large: 'Zoom wat in om meldingen te zien.',
  invalid_bbox: 'Zoom wat in om meldingen te zien.',
  feature_disabled: 'Dit kan nog niet in deze versie.',
  too_far_away: 'Je staat te ver van deze melding om ze op te ruimen.',
  already_cleaned: 'Iemand was je voor: dit is al opgeruimd.',
  forbidden: 'Je hebt hier geen rechten voor.',
  photo_not_found: 'De foto is niet gevonden.',
  user_not_found: 'Gebruiker niet gevonden.',
  invalid_action: 'Deze actie bestaat niet.',
  duplicate_nearby: 'Je hebt dit hier al gemeld.',
  own_report_cooldown: 'Wacht even voordat je je eigen melding opruimt.',
  network: 'Geen verbinding. Je melding wordt verstuurd zodra je weer online bent.',
  unknown: 'Er ging iets mis. Probeer het opnieuw.',
};

export function errorText(code: ParsedCode, detail?: string): string {
  if (code === 'rate_limited' && detail === 'day') {
    return 'Je dagelijkse limiet is bereikt. Morgen kan je weer melden.';
  }
  if (code === 'too_far_away' && detail) {
    return `Je staat ${detail} m van deze melding. Ga wat dichter en probeer opnieuw.`;
  }
  return ERROR_TEXT_NL[code];
}
