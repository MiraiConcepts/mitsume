/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
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
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    link: '#5B9DFF',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Satoshi',
    serif: 'Satoshi',
    rounded: 'Satoshi',
    mono: 'Satoshi',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
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

export const MaxContentWidth = 800;
/** Minimum window width for the side-by-side notes + calendar layout. */
export const WideLayoutMinWidth = 768;

/**
 * Satoshi — the app's single typeface (files in assets/fonts). One family name
 * resolves on both surfaces: React Native, and web via @font-face. Bold is a
 * separate face, not a weight.
 */
export const FontFamily = 'Satoshi';
export const FontFamilyBold = 'Satoshi_bold';

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
/** Burnt amber — a stronger orange than AccentColor, for deliberate emphasis
 * where the light accent is too faint. Opt-in per use; the default stays
 * AccentColor. (Not from the Firefox palette.) */
export const BrandColor = '#F5820D';
/** Destructive actions / validation errors. */
export const DangerColor = '#FF505F';
/** Text/icons on an accent-colored surface, in both schemes — dark ink, since
 * the Firefox orange is too light for white to stay readable on it. */
export const OnAccentColor = '#1C1B22';
