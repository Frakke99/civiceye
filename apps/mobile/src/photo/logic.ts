/**
 * Pure fotologica, los van expo — zodat de resize-regels (scenario's 7 en 10
 * uit docs/10) in vitest testbaar zijn zonder de native modules te laden.
 */
export const MAX_ZIJDE = 1600;
export const JPEG_KWALITEIT = 0.8;

/**
 * Welke resize-actie hoort bij deze afmetingen? Alleen de langste zijde wordt
 * doorgegeven; de manipulator bewaart de verhouding. `null` betekent: niet
 * schalen (maar wél re-encoderen — het EXIF-strippen gebeurt altijd).
 * Onbekende afmetingen (0) schalen we op breedte — beter een mogelijke
 * opschaling dan een 48 MP-foto doorsturen.
 */
export function resizeActie(
  width: number,
  height: number,
  max: number = MAX_ZIJDE,
): { width: number } | { height: number } | null {
  if (width <= 0 || height <= 0) return { width: max };
  if (width <= max && height <= max) return null;
  return width >= height ? { width: max } : { height: max };
}
