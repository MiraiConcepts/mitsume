/**
 * The app's design constants: color schemes, font families, and the spacing
 * scale. These are duplicated verbatim in @miraiconcepts/components, which this
 * app does not consume yet — keep them in step until it does.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    /** Tappable text (Firefox brand blue; lightened in dark for legibility). */
    link: '#0060E0',
  },
  dark: {
    text: '#ffffff',
    background: '#1C1B22',
    backgroundElement: '#000000',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    link: '#5B9DFF',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Satoshi — the app's single typeface (files in assets/fonts). One family name
 * resolves on both surfaces mitsume ships: React Native on Android, and web via
 * @font-face. `mono` is deliberately Satoshi too; code spans are rare and short,
 * and it stays its own key so a real mono face can be swapped in later. No `ios`
 * branch — mitsume targets web and Android only.
 */
export const Fonts = Platform.select({
  default: {
    sans: 'Satoshi',
    mono: 'Satoshi',
  },
  web: {
    sans: 'var(--font-display)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Brand accent (matches the app icon). Duplicated in static config that can't
 * import TS — keep in sync when changing: app.json (adaptiveIcon + splash
 * backgroundColor), public/manifest.json (theme_color), and
 * android/app/src/main/res/values/colors.xml (iconBackground +
 * splashscreen_background).
 */
// Firefox brand palette (brandcolorcode.com/firefox): orange #FFBD4F,
// blue #0060E0, yellow #FFEA7F, red #FF505F, pink #E11586, purple #B933E1.
export const AccentColor = '#FFBD4F';
/** Text/icons on an accent-colored surface, in both schemes — dark ink, since
 * the Firefox orange is too light for white to stay readable on it. */
export const OnAccentColor = '#000000';
