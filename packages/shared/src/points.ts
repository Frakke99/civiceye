/**
 * Spiegel van de SQL-functie `public.points_for` (db/migrations/0003).
 *
 * Twee bronnen voor dezelfde regel is een risico, dus: de **server** kent de
 * punten toe, deze functie is er alleen om ze vooraf te tónen ("dit levert
 * 5 punten op"). CI vergelijkt beide tabellen bij elke commit
 * (scripts/check-points-parity.sh), zodat ze niet stil uit elkaar groeien.
 */
import type { LitterSize, ReportKind } from './types';

export function pointsFor(kind: ReportKind, size: LitterSize | null): number {
  if (kind !== 'litter') return 3;
  switch (size) {
    case 'piece':
      return 1;
    case 'bag':
      return 5;
    case 'heap':
      return 15;
    default:
      return 1;
  }
}
