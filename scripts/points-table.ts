/**
 * Dumpt de puntentabel uit TypeScript als CSV, zodat
 * scripts/check-points-parity.sh hem kan vergelijken met de SQL-functie.
 *
 * Importeert bewust rechtstreeks uit de .ts-bestanden: Node strip-types
 * herschrijft geen '.js'-extensies naar '.ts', en de barrel (index.ts) doet
 * runtime re-exports die daardoor niet zouden resolven.
 */
import { pointsFor } from '../packages/shared/src/points.ts';
import { LITTER_SIZES, REPORT_KINDS, type LitterSize } from '../packages/shared/src/types.ts';

const rijen: string[] = [];
for (const kind of REPORT_KINDS) {
  for (const size of [...LITTER_SIZES, null] as (LitterSize | null)[]) {
    rijen.push(`${kind},${size ?? 'null'},${pointsFor(kind, size)}`);
  }
}
console.log(rijen.sort().join('\n'));
