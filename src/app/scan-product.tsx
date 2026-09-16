/**
 * Scan a product.
 *
 * A full-screen barcode reader over the routine sheet. The first read
 * wins, the digits go to Open Beauty Facts and nothing else does, and
 * what comes back is shown exactly as the database states it — name,
 * brand, quantity, photo, the ingredient text as one verbatim paragraph
 * — with the source named on every line the app did not write. Nothing
 * is rated, cleaned or interpreted; the one guardrail is the same on
 * every panel state because guessing which bottles are medicines would
 * itself be a judgement.
 *
 * The person then attaches the product to an item already in their
 * stack, or takes it back to the routine form with the name prefilled and
 * editable: the person, not the database, decides what their row is
 * called. "Not in the database yet", offline and every error land on the
 * same panel with a name form that stays on this device.
 */

import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  SlideInDown,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { EmptyState } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { stagePrefill } from '@/features/products/handoff';
import {
  ATTRIBUTION,
  analysisNotes,
  lookupProduct,
  normaliseBarcode,
  productPageUrl,
} from '@/features/products/open-beauty-facts';
import { formatDate } from '@/lib/date';
import { useAppStore } from '@/store/app-store';
import { activeRoutineItems, productsByBarcode } from '@/store/selectors';
import { MIN_TOUCH_TARGET, motion, useTheme } from '@/theme';
import type { Product, RoutineItem } from '@/types/domain';

type Phase = 'scanning' | 'lookingUp';

type Panel =
  | { kind: 'found'; product: Product; cached: boolean }
  | { kind: 'notFound'; barcode: string }
  | { kind: 'unreachable'; barcode: string }
  | null;

/** How far the brackets pull in when a barcode locks. */
const LOCK_INSET = 8;
const BRACKET = 26;
/** Roughly four lines of ingredient text; a proxy, not a measurement. */
const FOLD_CHARS = 220;

const announce = (message: string) =>
  AccessibilityInfo.announceForAccessibility(message);

const successHaptic = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined,
  );

export default function ScanProductScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const { data, saveProduct, updateRoutineItem } = useAppStore();
  const [permission, requestPermission] = useCameraPermissions();

  const cameraRef = useRef<CameraView>(null);
  /** The lookup in flight, held in a box so the unmount cleanup can read it. */
  const lookupRef = useRef<{ controller: AbortController | null }>({ controller: null });
  // The decoder can fire several times a frame before React re-renders
  // with `onBarcodeScanned` unset, so the guard has to be a ref too.
  const lockedRef = useRef(false);
  const askedRef = useRef(false);

  const [mountFailed, setMountFailed] = useState(false);
  const [torch, setTorch] = useState(false);
  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState<Phase>('scanning');
  const [panel, setPanel] = useState<Panel>(null);
  /** The digits being looked up, for the plate under the window. */
  const [code, setCode] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  /** Item id whose pill just succeeded; the screen dismisses shortly after. */
  const [attached, setAttached] = useState<string | null>(null);
  const brandRef = useRef<TextInput>(null);

  const items = activeRoutineItems(data);

  /* ------------------------------ geometry ----------------------------- */

  const WINDOW_W = Math.min(width - 2 * spacing.xxxl, 300);
  const WINDOW_H = WINDOW_W * 0.6;
  const windowLeft = (width - WINDOW_W) / 2;
  const windowTop = height * 0.44 - WINDOW_H / 2;

  /* ------------------------------- motion ------------------------------ */

  const lineProgress = useSharedValue(0);
  const lineOpacity = useSharedValue(1);
  const lockInset = useSharedValue(0);
  const lockTint = useSharedValue(0);

  const startLine = useCallback(() => {
    if (reduceMotion) return;
    lineProgress.set(0);
    lineOpacity.set(1);
    lineProgress.set(
      withRepeat(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [lineOpacity, lineProgress, reduceMotion]);

  const lockOn = useCallback(() => {
    cancelAnimation(lineProgress);
    if (reduceMotion) {
      lockInset.set(LOCK_INSET);
      lockTint.set(1);
      return;
    }
    lineOpacity.set(withTiming(0, { duration: 120 }));
    lockInset.set(withSpring(LOCK_INSET, motion.spring.snappy));
    lockTint.set(withTiming(1, { duration: 160 }));
  }, [lineOpacity, lineProgress, lockInset, lockTint, reduceMotion]);

  const release = useCallback(() => {
    if (reduceMotion) {
      lockInset.set(0);
      lockTint.set(0);
      return;
    }
    lockInset.set(withSpring(0, motion.spring.snappy));
    lockTint.set(withTiming(0, { duration: 160 }));
    startLine();
  }, [lockInset, lockTint, reduceMotion, startLine]);

  useEffect(() => {
    startLine();
    return () => cancelAnimation(lineProgress);
  }, [lineProgress, startLine]);

  const lineStyle = useAnimatedStyle(() => ({
    opacity: lineOpacity.get() * 0.9,
    transform: [{ translateY: lineProgress.get() * (WINDOW_H - 1) }],
  }));

  /* ---------------------------- permissions ---------------------------- */

  useEffect(() => {
    if (!permission || permission.granted || !permission.canAskAgain) return;
    if (askedRef.current) return;
    askedRef.current = true;
    requestPermission().catch(() => undefined);
  }, [permission, requestPermission]);

  // A lookup in flight when the screen goes is nobody's business any more.
  useEffect(() => {
    const inFlight = lookupRef.current;
    return () => inFlight.controller?.abort();
  }, []);

  /* ------------------------------- lookup ------------------------------ */

  /**
   * One request for one code. `fallback` is the cached record a "Look it
   * up again" started from: a notFound then keeps that record and offers
   * its name and brand in the form rather than blank fields.
   */
  const runLookup = useCallback(
    async (barcode: string, fallback?: Product) => {
      lookupRef.current.controller?.abort();
      const controller = new AbortController();
      lookupRef.current.controller = controller;
      setPanel(null);
      setPhase('lookingUp');

      const outcome = await lookupProduct(barcode, { signal: controller.signal });
      // Unmounted, or "Scan another" moved on: the outcome is stale.
      if (controller.signal.aborted) return;
      lookupRef.current.controller = null;

      if (outcome.kind === 'found') {
        saveProduct(outcome.product);
        setPanel({ kind: 'found', product: outcome.product, cached: false });
      } else if (outcome.kind === 'notFound') {
        if (fallback) {
          setManualName(fallback.name);
          setManualBrand(fallback.brand ?? '');
        }
        setPanel({ kind: 'notFound', barcode });
      } else {
        setPanel({ kind: 'unreachable', barcode });
      }
      setPhase('scanning');
      cameraRef.current?.pausePreview().catch(() => undefined);
    },
    [saveProduct],
  );

  const onScanned = ({ data: raw }: { data: string }) => {
    if (lockedRef.current) return;
    const scanned = normaliseBarcode(raw);
    if (!scanned) return;
    lockedRef.current = true;
    setLocked(true);
    setCode(scanned);
    lockOn();
    successHaptic();
    announce('Barcode found. Looking it up.');

    // Any source counts as a hit: a second scan of the same bottle never
    // touches the network.
    const cached = productsByBarcode(data).get(scanned);
    if (cached) {
      setPanel({ kind: 'found', product: cached, cached: true });
      cameraRef.current?.pausePreview().catch(() => undefined);
      return;
    }
    void runLookup(scanned);
  };

  const scanAnother = () => {
    lookupRef.current.controller?.abort();
    lookupRef.current.controller = null;
    setPanel(null);
    setPhase('scanning');
    setCode(null);
    lockedRef.current = false;
    setLocked(false);
    setExpanded(false);
    setAttached(null);
    setManualName('');
    setManualBrand('');
    cameraRef.current?.resumePreview().catch(() => undefined);
    release();
  };

  const close = () => {
    lookupRef.current.controller?.abort();
    router.back();
  };

  /* ------------------------------- actions ----------------------------- */

  const attachTo = (product: Product, item: RoutineItem) => {
    // Cached products are re-saved harmlessly; a manual one is saved here
    // for the first time.
    saveProduct(product);
    updateRoutineItem(item.id, { productBarcode: product.barcode });
    setAttached(item.id);
    successHaptic();
    announce(`Attached to ${item.label}.`);
    setTimeout(() => router.back(), 650);
  };

  const addToRoutine = (product: Product) => {
    saveProduct(product);
    stagePrefill({
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      source: product.source,
    });
    router.back();
  };

  /** The typed record, or null until it has a name. `brand` is omitted when empty. */
  const manualProduct = (barcode: string): Product | null => {
    const name = manualName.trim();
    if (!name) return null;
    const brand = manualBrand.trim();
    return {
      barcode,
      source: 'manual',
      name,
      ...(brand ? { brand } : {}),
      fetchedAt: new Date().toISOString(),
    };
  };

  /* ----------------------------- permissions --------------------------- */

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <PermissionGate
        canAskAgain={permission.canAskAgain}
        onRequest={() => requestPermission().catch(() => undefined)}
        onCancel={() => router.back()}
      />
    );
  }

  if (mountFailed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}>
        <EmptyState
          icon="camera"
          title="The camera couldn't start"
          body="Close this and try again, or add the product by name from the routine screen."
          actionLabel="Close"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  /* ------------------------------- pieces ------------------------------ */

  const plateStyle = {
    alignSelf: 'center' as const,
    borderRadius: radius.pill,
    backgroundColor: colors.photoScrim,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  };

  const inputStyle = {
    ...typography.body,
    height: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundSubtle,
    color: colors.text,
  };

  const enter = reduceMotion ? FadeIn.duration(0) : FadeIn.duration(200);
  const exit = reduceMotion ? FadeOut.duration(0) : FadeOut.duration(160);
  const rise = reduceMotion
    ? FadeIn.duration(0)
    : SlideInDown.springify()
        .damping(motion.spring.gentle.damping)
        .stiffness(motion.spring.gentle.stiffness)
        .mass(motion.spring.gentle.mass);

  const guardrail = (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: colors.backgroundSubtle,
      }}>
      <Icon name="info" size={18} color={colors.textTertiary} />
      <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
        Tress lists what the database says about a product. It does not recommend treatments
        or doses — speak to a qualified healthcare professional about anything medical.
      </Text>
    </View>
  );

  /** Attach-to pills and the primary action; `product` is null until a manual entry has a name. */
  const actions = (product: Product | null) => (
    <>
      {items.length === 0 ? null : (
        <View style={{ gap: spacing.sm }}>
          <Text variant="subhead" color="textSecondary">
            Attach to
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {items.map((item) => {
              const isAttached = attached === item.id;
              return (
                <PressableScale
                  key={item.id}
                  disabled={product === null}
                  hitSlop={4}
                  haptic="light"
                  onPress={() => product && attachTo(product, item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Attach to ${item.label}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.xs,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm + 2,
                    borderRadius: radius.pill,
                    backgroundColor: isAttached ? colors.accentSoft : colors.backgroundSubtle,
                    borderWidth: 1,
                    borderColor: isAttached ? colors.accentBorder : 'transparent',
                  }}>
                  <Text variant="subhead" color={isAttached ? 'accent' : 'text'}>
                    {item.label}
                  </Text>
                  {isAttached ? (
                    <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(160)}>
                      <Icon name="check" size={12} color={colors.accent} />
                    </Animated.View>
                  ) : null}
                </PressableScale>
              );
            })}
          </View>
        </View>
      )}
      <Button
        label="Add to routine"
        icon="plus"
        disabled={product === null}
        onPress={() => product && addToRoutine(product)}
      />
      <Button label="Scan another" variant="ghost" size="md" onPress={scanAnother} />
    </>
  );

  const panelBody = (() => {
    if (!panel) return null;

    if (panel.kind === 'found') {
      const { product, cached } = panel;
      const meta = [product.brand, product.quantity].filter(Boolean).join(' · ');
      const notes = analysisNotes(product.analysisTags);
      const long = (product.ingredientsText?.length ?? 0) > FOLD_CHARS;
      return (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.md,
                backgroundColor: colors.backgroundSubtle,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              {product.imageUrl ? (
                <Image
                  source={{ uri: product.imageUrl }}
                  style={{ width: 64, height: 64, borderRadius: radius.md }}
                  contentFit="contain"
                  transition={reduceMotion ? 0 : 240}
                  cachePolicy="memory-disk"
                  accessibilityLabel="Product photo from Open Beauty Facts"
                />
              ) : (
                <Icon name="bottle" size={26} color={colors.textTertiary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="caption" color="textTertiary" accessibilityLiveRegion="polite">
                Product found.
              </Text>
              {/* The name is data: verbatim, never inside an app sentence. */}
              <Text variant="title3" numberOfLines={3} accessibilityRole="header">
                {product.name}
              </Text>
              {meta ? (
                <Text variant="footnote" color="textSecondary">
                  {meta}
                </Text>
              ) : null}
            </View>
          </View>

          {product.ingredientsText ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="subhead" color="textSecondary">
                Ingredients, as listed by Open Beauty Facts
              </Text>
              <Animated.View layout={reduceMotion ? undefined : LinearTransition}>
                <Text variant="callout" numberOfLines={expanded ? undefined : 4} selectable>
                  {product.ingredientsText}
                </Text>
              </Animated.View>
              {long ? (
                <PressableScale
                  onPress={() => setExpanded((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    expanded ? 'Show less of the ingredient list' : 'Show the whole ingredient list'
                  }
                  style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}>
                  <Text variant="subhead" color="accent">
                    {expanded ? 'Show less' : 'Show all'}
                  </Text>
                </PressableScale>
              ) : null}
            </View>
          ) : (
            <Text variant="callout" color="textSecondary">
              No ingredient list on record for this product.
            </Text>
          )}

          {notes.length > 0 ? (
            <Text variant="footnote" color="textSecondary">
              Open Beauty Facts lists: {notes.join(', ')}
            </Text>
          ) : null}

          <View style={{ gap: spacing.xs }}>
            {product.source === 'openBeautyFacts' ? (
              <>
                <Text variant="footnote" color="textTertiary">
                  Looked up {formatDate(product.fetchedAt)}
                </Text>
                <Text variant="footnote" color="textTertiary">
                  {ATTRIBUTION}
                </Text>
                {/* The per-product link the licence asks for. */}
                <PressableScale
                  onPress={() =>
                    WebBrowser.openBrowserAsync(productPageUrl(product.barcode)).catch(
                      () => undefined,
                    )
                  }
                  accessibilityRole="link"
                  accessibilityLabel="Open this product on Open Beauty Facts"
                  style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}>
                  <Text variant="footnote" color="accent">
                    Wrong or missing? Edit it on Open Beauty Facts.
                  </Text>
                </PressableScale>
              </>
            ) : (
              <Text variant="footnote" color="textTertiary">
                Entered by you · {formatDate(product.fetchedAt)}
              </Text>
            )}
            {cached ? (
              <Button
                label="Look it up again"
                variant="ghost"
                size="md"
                onPress={() => void runLookup(product.barcode, product)}
              />
            ) : null}
          </View>

          {guardrail}
          {actions(product)}
        </>
      );
    }

    if (panel.kind === 'notFound') {
      return (
        <>
          <View accessibilityLiveRegion="polite">
            <EmptyState
              icon="search"
              title="Not in the database yet"
              body="Open Beauty Facts has no entry for this barcode. Add the name yourself and it stays on this device."
            />
          </View>
          <View style={{ gap: spacing.sm }}>
            <TextInput
              value={manualName}
              onChangeText={setManualName}
              placeholder="Product name"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="next"
              autoCapitalize="words"
              onSubmitEditing={() => brandRef.current?.focus()}
              submitBehavior="submit"
              accessibilityLabel="Product name"
              style={inputStyle}
            />
            <TextInput
              ref={brandRef}
              value={manualBrand}
              onChangeText={setManualBrand}
              placeholder="Brand (optional)"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
              accessibilityLabel="Brand, optional"
              style={inputStyle}
            />
            <Text
              variant="caption"
              color="textTertiary"
              style={{ fontVariant: ['tabular-nums'] }}>
              Barcode {panel.barcode}
            </Text>
          </View>
          {guardrail}
          {actions(manualProduct(panel.barcode))}
        </>
      );
    }

    return (
      <>
        <View accessibilityLiveRegion="polite">
          <EmptyState
            icon="globe"
            title="Couldn't reach Open Beauty Facts"
            body="Check your connection and try again, or add the name yourself."
          />
        </View>
        <Button label="Try again" onPress={() => void runLookup(panel.barcode)} />
        <Button
          label="Enter it by hand"
          variant="secondary"
          onPress={() => setPanel({ kind: 'notFound', barcode: panel.barcode })}
        />
        {guardrail}
        <Button label="Scan another" variant="ghost" size="md" onPress={scanAnother} />
      </>
    );
  })();

  /* ------------------------------- screen ------------------------------ */

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        ref={cameraRef}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        // Unsetting the handler stops decoding while the preview keeps
        // running: the first hit wins.
        onBarcodeScanned={locked ? undefined : onScanned}
        onMountError={() => setMountFailed(true)}
      />

      {/* Scrim in four pieces framing a clear window. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: windowTop,
          backgroundColor: colors.photoScrim,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: windowTop + WINDOW_H,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.photoScrim,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: windowTop,
          left: 0,
          width: windowLeft,
          height: WINDOW_H,
          backgroundColor: colors.photoScrim,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: windowTop,
          right: 0,
          width: windowLeft,
          height: WINDOW_H,
          backgroundColor: colors.photoScrim,
        }}
      />

      {/* The window: brackets at the corners, one line moving at rest. */}
      <View
        accessible
        accessibilityLabel="Camera viewfinder. Point it at a product barcode."
        style={{
          position: 'absolute',
          top: windowTop,
          left: windowLeft,
          width: WINDOW_W,
          height: WINDOW_H,
        }}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
          <Bracket key={corner} corner={corner} inset={lockInset} tint={lockTint} />
        ))}
        {reduceMotion ? null : (
          <Animated.View
            accessible={false}
            importantForAccessibility="no"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: BRACKET,
                right: BRACKET,
                height: 1,
                backgroundColor: colors.accent,
              },
              lineStyle,
            ]}
          />
        )}
      </View>

      {/* Top bar: title plate centred, close disc at the right. */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing.md,
          left: spacing.lg,
          right: spacing.lg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <View style={plateStyle}>
          <Text variant="headline" color="textOnPhoto" accessibilityRole="header">
            Line up the barcode
          </Text>
        </View>
      </View>

      {/* Under the window: the one line of helper copy, or the lookup plate. */}
      <View
        style={{
          position: 'absolute',
          top: windowTop + WINDOW_H + spacing.xl,
          left: spacing.xl,
          right: spacing.xl,
        }}>
        {phase === 'lookingUp' ? (
          <View
            accessibilityLiveRegion="polite"
            style={[plateStyle, { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }]}>
            <ActivityIndicator color={colors.textOnPhoto} />
            <Text
              variant="footnote"
              color="textOnPhoto"
              style={{ fontVariant: ['tabular-nums'] }}>
              Looking up {code}…
            </Text>
          </View>
        ) : (
          <View style={plateStyle}>
            <Text variant="footnote" color="textOnPhoto" center>
              {'Only the number under the barcode is sent to look it up. No photo ever leaves your phone.'}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom row: the typed path on the left, the torch on the right. */}
      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + spacing.xl,
          left: spacing.xl,
          right: spacing.xl,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        {/* The routine form the person came from is manual entry; a keyless
            product record is never created. */}
        <View style={{ borderRadius: radius.pill, backgroundColor: colors.photoScrim }}>
          <Button
            label="Type it instead"
            variant="ghost"
            size="md"
            block={false}
            onPress={() => router.back()}
          />
        </View>
        <PressableScale
          onPress={() => setTorch((v) => !v)}
          haptic="light"
          accessibilityRole="switch"
          accessibilityState={{ checked: torch }}
          accessibilityLabel="Torch"
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: torch ? colors.surface : colors.photoScrim,
          }}>
          <Icon name="torch" size={20} color={torch ? colors.text : colors.textOnPhoto} />
        </PressableScale>
      </View>

      {/* The panel: one surface, four states, over the paused camera. */}
      {panel ? (
        <Animated.View
          entering={enter}
          exiting={exit}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.photoScrim,
          }}
        />
      ) : null}
      {panel ? (
        <Animated.View
          entering={rise}
          exiting={exit}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: height * 0.72,
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.section,
            borderTopRightRadius: radius.section,
          }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{
              paddingHorizontal: spacing.xl,
              paddingTop: spacing.xl,
              paddingBottom: insets.bottom + spacing.xl,
              gap: spacing.lg,
            }}>
            {panelBody}
          </ScrollView>
        </Animated.View>
      ) : null}

      {/* Above everything, including the panel. */}
      <PressableScale
        onPress={close}
        hitSlop={5}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{
          position: 'absolute',
          top: insets.top + spacing.md,
          right: spacing.lg,
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surface,
        }}>
        <Icon name="close" size={15} color={colors.text} />
      </PressableScale>
    </View>
  );
}

/* ------------------------------------------------------------------ */

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/**
 * One viewfinder corner: two outer edges drawn, the outer corner rounded.
 * Pulls inward and turns accent when a barcode locks.
 */
function Bracket({
  corner,
  inset,
  tint,
}: {
  corner: Corner;
  inset: SharedValue<number>;
  tint: SharedValue<number>;
}) {
  const { colors, radius } = useTheme();
  const top = corner === 'tl' || corner === 'tr';
  const left = corner === 'tl' || corner === 'bl';

  const style = useAnimatedStyle(() => {
    const d = inset.get();
    return {
      borderColor: interpolateColor(tint.get(), [0, 1], [colors.textOnPhoto, colors.accent]),
      transform: [{ translateX: left ? d : -d }, { translateY: top ? d : -d }],
    };
  });

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no"
      style={[
        {
          position: 'absolute',
          width: BRACKET,
          height: BRACKET,
          ...(top ? { top: 0 } : { bottom: 0 }),
          ...(left ? { left: 0 } : { right: 0 }),
          borderTopWidth: top ? 3 : 0,
          borderBottomWidth: top ? 0 : 3,
          borderLeftWidth: left ? 3 : 0,
          borderRightWidth: left ? 0 : 3,
          borderTopLeftRadius: corner === 'tl' ? radius.md : 0,
          borderTopRightRadius: corner === 'tr' ? radius.md : 0,
          borderBottomLeftRadius: corner === 'bl' ? radius.md : 0,
          borderBottomRightRadius: corner === 'br' ? radius.md : 0,
        },
        style,
      ]}
    />
  );
}

/**
 * Full-screen ask for the camera. A local copy of the capture screen's,
 * with copy written for barcodes: no photo is taken here.
 */
function PermissionGate({
  canAskAgain,
  onRequest,
  onCancel,
}: {
  canAskAgain: boolean;
  onRequest: () => void;
  onCancel: () => void;
}) {
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom + spacing.lg,
        paddingHorizontal: spacing.xl,
        justifyContent: 'center',
      }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.lg,
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xl,
        }}>
        <Icon name="barcode" size={28} color={colors.accent} />
      </View>

      <Text variant="title2" accessibilityRole="header">
        Camera access needed
      </Text>
      <Text variant="callout" color="textSecondary" style={{ marginTop: spacing.md }}>
        {canAskAgain
          ? 'Tress needs the camera to read a barcode. No photo is taken or kept.'
          : 'Camera access is currently turned off. You can turn it back on for Tress in your device Settings, under Privacy.'}
      </Text>

      <View style={{ marginTop: spacing.xxl, gap: spacing.sm }}>
        {canAskAgain ? <Button label="Allow Camera" icon="camera" onPress={onRequest} /> : null}
        <Button label="Not now" variant="ghost" size="md" onPress={onCancel} />
      </View>
    </View>
  );
}
