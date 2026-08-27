/**
 * Nederlandse UI-teksten die zowel de app als de beheerdersconsole nodig
 * hebben. Zelfde principe als ERROR_TEXT_NL: teksten leven in code, niet in de
 * database, en fase 2 zet hier gewoon en.json naast.
 */
import type { FlagReason, ReportStatus } from './types';

/**
 * De rapporteerredenen zoals de gebruiker ze ziet. 'private_person' krijgt de
 * duidelijkste tekst: die reden zet een melding onmiddellijk in quarantaine
 * (ADR 0008), dus wie ze aankruist moet begrijpen wat ze betekent.
 */
export const FLAG_REASON_NL: Record<FlagReason, string> = {
  not_there: 'Ligt er niet meer',
  wrong_location: 'Verkeerde locatie',
  inappropriate: 'Ongepaste inhoud',
  spam: 'Spam of onzin',
  private_person: 'Er staat een persoon herkenbaar op',
  other: 'Iets anders',
};

/** Status zoals de gebruiker hem ziet; quarantaine is "wordt nagekeken". */
export function statusTekstNl(status: ReportStatus): string {
  switch (status) {
    case 'published':
      return 'open';
    case 'quarantined':
      return 'wordt nagekeken';
    case 'cleaned':
      return 'opgeruimd';
    case 'removed':
      return 'verwijderd';
  }
}
