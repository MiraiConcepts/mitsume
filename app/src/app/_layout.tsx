import '@/polyfills';

import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BootScreen } from '@/components/boot-screen';
import { VersionBadge } from '@/components/version-badge';
import { useHydrated } from '@/hooks/use-hydrated';
import { useSilentReload } from '@/hooks/use-silent-reload';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // Web loads Satoshi at runtime (@font-face injection); native embeds it via
  // the expo-font config plugin.
  const [fontsLoaded, fontError] = useFonts({
    Satoshi: require('../../assets/fonts/Satoshi.otf'),
    Satoshi_bold: require('../../assets/fonts/Satoshi_bold.otf'),
  });
  const hydrated = useHydrated();
  useSilentReload();
  // Hold a full-page spinner until the shell can render truthfully: hydration
  // (the canvas restores its saved viewport from storage, which is unreadable
  // before it) and fonts (no Satoshi swap mid-boot). fontError falls through so
  // a failed font load degrades to fallback fonts instead of a stuck spinner.
  const ready = hydrated && (fontsLoaded || !!fontError);
  return (
    // Required by react-native-gesture-handler (canvas pan/pinch) on every
    // platform, web included — gestures aren't recognized outside this view.
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {ready ? (
          <>
            <Slot />
            <VersionBadge />
          </>
        ) : (
          <BootScreen />
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
