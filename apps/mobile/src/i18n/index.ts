import nl from './nl.json';

/**
 * Alle vaste UI-teksten van de app, met Nederlands als enige taal in v1
 * (docs/13, sprint 5). De structuur is er nu al: en.json komt hier later
 * gewoon naast, met een taalkeuze die per sleutel terugvalt op nl.
 *
 * De teksten uit packages/shared (foutcodes, rapporteerredenen, statussen)
 * blijven dáár: die deelt de app met de beheerdersconsole en ze zijn al
 * dictionaries per code — effectief hetzelfde model als dit bestand.
 */
export type TekstKey = keyof typeof nl;

/**
 * Tekst opzoeken, met {{naam}}-placeholders. De sleutel is getypeerd, dus een
 * tikfout is een compile-fout in plaats van een leeg label op een toestel.
 */
export function t(key: TekstKey, vars?: Record<string, string | number>): string {
  let tekst: string = nl[key];
  if (vars) {
    for (const [naam, waarde] of Object.entries(vars)) {
      tekst = tekst.split(`{{${naam}}}`).join(String(waarde));
    }
  }
  return tekst;
}

export { nl };
