import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
} from 'expo-router';
import { Parisienne_400Regular, useFonts } from '@expo-google-fonts/parisienne';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppStoreProvider, useAppStore } from '@/store/app-store';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Navigation theming, so native headers, sheet backgrounds and the
 * status bar follow the same tokens as the rest of the app.
 */
function Navigation() {
  const { colors, scheme, isReady: themeReady } = useTheme();
  const { isLoaded } = useAppStore();
  // The script accent is decorative, so a failed load must not block the
  // app — `error` counts as resolved and the fallback face is used.
  const [fontsLoaded, fontError] = useFonts({ Parisienne_400Regular });

  const ready = themeReady && isLoaded && (fontsLoaded || Boolean(fontError));

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // Holding the splash until storage resolves avoids a flash of the
  // onboarding screen for users who already have a journey.
  if (!ready) return null;

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.separator,
    },
  };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen
          name="capture-session"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="session/[id]"
          options={{ headerShown: true, headerTitle: '', headerTransparent: true }}
        />
        <Stack.Screen
          name="compare"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="settings"
          options={{ headerShown: true, headerTitle: 'Settings' }}
        />
        <Stack.Screen
          name="routine"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="capture-intro"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="calendar" />
        <Stack.Screen name="learn/[slug]" />
        <Stack.Screen
          name="journal"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStoreProvider>
            <Navigation />
          </AppStoreProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
