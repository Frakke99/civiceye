import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Eén plek voor kleuren, maten en typografie, overgenomen uit het CivicEye
 * app-design (canvas "CivicEye app design"). Bewust zonder runtime-import uit
 * react-native, zodat pure modules zoals map/markers.ts dit ook in tests kunnen
 * gebruiken.
 *
 * Contrast is minstens 4,5:1 op de achtergrond waarop de tekst staat, en
 * raakvlakken zijn minstens 44 pt: de app wordt buiten in de zon en met één
 * hand gebruikt (docs/05-mobile-client.md).
 */

/**
 * Figtree in vijf gewichten. Op Android kiest `fontWeight` geen gewicht van
 * een geladen font, dus elk gewicht is een eigen `fontFamily`. Tot de fonts
 * geladen zijn (app/_layout.tsx) valt de app terug op het systeemfont.
 */
export const FONTS = {
  regular: 'Figtree_400Regular',
  medium: 'Figtree_500Medium',
  semibold: 'Figtree_600SemiBold',
  bold: 'Figtree_700Bold',
  extrabold: 'Figtree_800ExtraBold',
} as const;

const color = {
  /** Ondergrond van schermen. */
  bg: '#F5F6F2',
  /** Kaarten, sheets en knoppen die boven de ondergrond liggen. */
  bgElevated: '#FFFFFF',
  /** Gedempte vlakken binnen een kaart (tellers, chips, placeholders). */
  bgSubtle: '#E9ECE4',
  text: '#15201B',
  /** 5,5:1 op `bg`, 6:1 op `bgElevated`. */
  textMuted: '#5A665F',
  line: '#DDE2DA',
  lineStrong: '#C9D1C5',
  accent: '#1E6B45',
  accentPressed: '#154D31',
  accentText: '#FFFFFF',
  /** Zachte variant voor secundaire knoppen; tekst in `accentPressed` (8:1). */
  accentSoft: '#E1ECE4',
  danger: '#B3261E',
  dangerSoft: '#FDECEA',
  warning: '#B26A00',
  /** Blauwe stip van de eigen locatie, los van de afvalkleuren. */
  userLocation: '#2F6FDE',
} as const;

/**
 * De drie afvalgroottes. Ze verschillen ook in lichtheid, niet alleen in tint,
 * zodat ze ook zonder kleurzicht uit elkaar te houden zijn. `on` is de
 * voorgrondkleur voor icoon of tekst op die kleur.
 */
const size = {
  piece: { fill: '#9BD1B2', on: color.text, soft: '#E3F2EA', softText: '#24563B' },
  bag: { fill: '#E8A33A', on: color.text, soft: '#FBEBD2', softText: '#6E4708' },
  heap: { fill: '#9C3A1E', on: '#FFFFFF', soft: '#F6E3DC', softText: '#7A2C15' },
} as const;

const shadow = {
  /** Zwevende elementen op de kaart (zoekbalk, knoppen). */
  float: {
    shadowColor: color.text,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /** Kaarten op de ondergrond. */
  card: {
    shadowColor: color.text,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  /** Bottom sheets. */
  sheet: {
    shadowColor: color.text,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} satisfies Record<string, ViewStyle>;

const text = {
  /** Schermtitel (28/800). */
  title: { fontFamily: FONTS.extrabold, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, color: color.text },
  /** Titel in een sheet of kaart (20/800). */
  heading: { fontFamily: FONTS.extrabold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: color.text },
  body: { fontFamily: FONTS.regular, fontSize: 16, lineHeight: 23, color: color.text },
  bodyMuted: { fontFamily: FONTS.regular, fontSize: 16, lineHeight: 23, color: color.textMuted },
  label: { fontFamily: FONTS.semibold, fontSize: 14, lineHeight: 20, color: color.text },
  small: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: color.textMuted },
  button: { fontFamily: FONTS.bold, fontSize: 17, lineHeight: 22 },
} satisfies Record<string, TextStyle>;

export const theme = {
  color,
  size,
  shadow,
  text,
  space: (n: number) => n * 4,
  radius: { s: 8, m: 12, l: 16, xl: 20, sheet: 24, pill: 999 },
  /** Apple HIG en Material vragen beide minstens 44 pt. */
  minTouch: 44,
  /** Hoofdknoppen ("Nieuwe melding", "Meld") zijn groter dan het minimum. */
  buttonHeight: 56,
  font: FONTS,
} as const;
