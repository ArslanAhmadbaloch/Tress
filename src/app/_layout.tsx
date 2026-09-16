import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavThemeProvider,
  useRouter,
} from 'expo-router';
import {
  Lora_400Regular,
  Lora_400Regular_Italic,
  Lora_600SemiBold,
} from '@expo-google-fonts/lora';
import { Parisienne_400Regular } from '@expo-google-fonts/parisienne';
/*
  The display face. Tress used a serif for headings, which reads as
  editorial but not as a modern consumer health app — the category the
  competition sits in is set almost entirely in grotesques.

  Plus Jakarta Sans was the first attempt and it read heavy at headline
  size: wide bowls and a bold weight that looked chunky rather than
  clean. Manrope is the face this category actually reaches for — a
  geometric grotesque with tight, even letterforms that stays crisp at
  34px semibold. OFL, so it ships; the commercial grotesque the reference
  licenses cannot.
*/
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
/*
  From expo-font, not from the @expo-google-fonts package that also
  exports a `useFonts`. The convenience copy in those packages has no
  mounted guard and always starts `loaded` at false, so on a re-mount
  where the faces are already cached it resolves inside the first render
  and React warns about a state update on a component that has not
  mounted. This one checks what is already loaded and guards the update.
*/
import { useFonts } from 'expo-font';
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
import { SubscriptionProvider } from '@/features/subscription/provider';
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
  /*
    The script accent is decorative, so a failed load must not block the
    app — `error` counts as resolved and the fallback face is used.

    Lora is the serif, and it is only loaded because Android has no
    Palatino: the platform falls back to Noto Serif, which is a visibly
    different face on the membership card. iOS names Palatino and never
    reads these, but loading them on both keeps one code path.
  */
  const [fontsLoaded, fontError] = useFonts({
    Parisienne_400Regular,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Lora_400Regular,
    Lora_400Regular_Italic,
    Lora_600SemiBold,
  });

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
          /*
           * A push slides in from the right, which is what going deeper
           * feels like; sheets rise from the bottom, which is what a
           * temporary thing feels like. Set once here rather than per
           * route, so a new screen inherits the app's grammar by default.
           */
          animation: 'slide_from_right',
          animationDuration: 280,
          gestureEnabled: true,
        }}>
        {/* The app itself has no direction to come from; it just arrives. */}
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="capture-session"
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="scan-product"
          // Full screen, like the capture session: a page sheet clips the
          // camera preview.
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="session/[id]"
          // The screen draws its own back control. The native one is
          // captioned with the route it returns to, which here is the tab
          // group, and reads "(tabs)".
          options={{ headerShown: false }}
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
        <Stack.Screen name="streak" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
        {/* The paywall is a page sheet: it arrives over what you were
            doing, and returns you to it rather than replacing it. */}
        <Stack.Screen
          name="paywall"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="learn/[slug]" />
        <Stack.Screen
          name="journal"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="ask"
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
            <SubscriptionProvider>
              <AppLockProvider>
                <Navigation />
              </AppLockProvider>
            </SubscriptionProvider>
          </AppStoreProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
