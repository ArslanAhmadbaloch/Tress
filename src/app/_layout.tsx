import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
  useRouter,
} from 'expo-router';
import { Parisienne_400Regular, useFonts } from '@expo-google-fonts/parisienne';
import { Asset } from 'expo-asset';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LockScreen } from '@/components/lock-screen';
import { AnimatedSplash, SPLASH_ASSETS } from '@/components/splash';
import { clearPasscode } from '@/lib/app-lock';
import { loadDevicePreferences } from '@/lib/device-preferences';
import { cancelAllReminders } from '@/lib/notifications';
import { clearAllPhotos } from '@/lib/photo-storage';
import { AppStoreProvider, useAppStore } from '@/store/app-store';
import { AppLockProvider, useAppLock } from '@/store/lock-provider';
import { ThemeProvider, useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Navigation theming, so native headers, sheet backgrounds and the
 * status bar follow the same tokens as the rest of the app.
 */
function Navigation() {
  const { colors, scheme, isReady: themeReady } = useTheme();
  const { isLoaded, resetAll } = useAppStore();
  const lock = useAppLock();
  const router = useRouter();
  // The script accent is decorative, so a failed load must not block the
  // app — `error` counts as resolved and the fallback face is used.
  const [fontsLoaded, fontError] = useFonts({ Parisienne_400Regular });

  // The launch animation opens on the finished plate, so its artwork has
  // to be decoded before the native splash hands over — otherwise the
  // first frame is an empty screen.
  const [artworkLoaded, setArtworkLoaded] = useState(false);
  const [launching, setLaunching] = useState(true);

  useEffect(() => {
    // Device preferences ride along: they are read from the same store and
    // must be in place before anything can read a default instead.
    Promise.all([Asset.loadAsync(SPLASH_ASSETS), loadDevicePreferences()])
      // A splash that cannot load its own artwork must not trap the app.
      .catch(() => undefined)
      .finally(() => setArtworkLoaded(true));
  }, []);

  const ready =
    themeReady &&
    isLoaded &&
    artworkLoaded &&
    lock.isReady &&
    (fontsLoaded || Boolean(fontError));

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  const endLaunch = useCallback(() => setLaunching(false), []);

  /**
   * The only way past a forgotten passcode. Nothing on this device can read
   * the journey without the code, and there is no account to recover from,
   * so the honest offer is to start again rather than a back door.
   */
  const eraseEverything = useCallback(async () => {
    clearAllPhotos();
    await cancelAllReminders();
    await clearPasscode();
    await resetAll();
    await lock.refresh();
    lock.unlock();
    router.replace('/onboarding');
  }, [resetAll, lock, router]);

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
      {/* The launch plate is light in both appearances. */}
      <StatusBar style={!launching && scheme === 'dark' ? 'light' : 'dark'} />
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
          // Transparent chrome: the screen carries its own editorial title
          // over the ground plate, the way every other screen does, and the
          // system back control floats above it.
          options={{
            headerShown: true,
            headerTitle: '',
            headerTransparent: true,
            // Without this the control is labelled with the route it returns
            // to, which here is the tab group, and reads "(tabs)".
            headerBackButtonDisplayMode: 'minimal',
          }}
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
        <Stack.Screen
          name="profile-photo"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="passcode"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="card"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>

      {/*
        The app mounts underneath the launch animation rather than after
        it, so the first screen is already laid out and settled by the
        time the splash clears.
      */}
      {launching ? <AnimatedSplash onFinish={endLaunch} /> : null}

      {/*
        Above the navigator rather than a route of its own: there is no
        screen behind it to reach, and no back gesture that dismisses it.
        It is mounted after the launch animation so the two never stack.
      */}
      {!launching && lock.isLocked ? (
        <LockScreen lock={lock.state} onUnlock={lock.unlock} onForgot={eraseEverything} />
      ) : null}
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStoreProvider>
            <AppLockProvider>
              <Navigation />
            </AppLockProvider>
          </AppStoreProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
