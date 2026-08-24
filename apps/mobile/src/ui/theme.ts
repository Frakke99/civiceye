import { Platform } from 'react-native';

/**
 * Eén plek voor kleuren en maten. Contrast is minstens 4,5:1 op de achtergrond
 * waarop de tekst staat, en raakvlakken zijn minstens 44 pt — de app wordt
 * buiten in de zon en met één hand gebruikt (docs/05-mobile-client.md).
 */
export const theme = {
  color: {
    bg: '#ffffff',
    bgElevated: '#f6f7f8',
    text: '#14181c',
    textMuted: '#5b6b7a',
    line: '#dfe3e7',
    accent: '#1a7f4b',
    accentText: '#ffffff',
    danger: '#c0392b',
    warning: '#b26a00',
  },
  space: (n: number) => n * 4,
  radius: { s: 8, m: 12, l: 20, pill: 999 },
  /** Apple HIG en Material vragen beide minstens 44 pt. */
  minTouch: 44,
  font: {
    regular: Platform.select({ ios: 'System', default: 'sans-serif' }),
  },
} as const;
