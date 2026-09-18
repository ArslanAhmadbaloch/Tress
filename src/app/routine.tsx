import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STACK_TEXT_INSET, StackRow } from '@/components/stack-row';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GlassOrb } from '@/components/ui/glass-orb';
import { Icon } from '@/components/ui/icon';
import { EmptyState, SectionHeader, Separator } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { RoutineGlyph } from '@/components/ui/routine-glyphs';
import { ProgressBar } from '@/components/ui/stat';
import { Text } from '@/components/ui/text';
import { inferRoutineIcon } from '@/features/routine/icons';
import { toDateKey } from '@/lib/date';
import { usePremiumGate } from '@/features/subscription/gate';
import { usePremium } from '@/features/subscription/provider';
import { useAppStore } from '@/store/app-store';
import {
  activeRoutineItems,
  dosesOn,
  productFor,
  todayProgress,
} from '@/store/selectors';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';
import {
  DOSE_LABELS,
  DOSE_OPTIONS,
  doseCount,
  MAX_DOSES_PER_DAY,
  ROUTINE_ICONS,
  ROUTINE_ICON_LABELS,
  TIME_OF_DAY_LABELS,
  type RoutineIcon,
  type RoutineItem,
  type RoutineTimeOfDay,
} from '@/types/domain';

const TIMES: RoutineTimeOfDay[] = ['morning', 'evening', 'anytime'];

/**
 * The routine: what you do, and adding to it.
 *
 * Every field is the user's own words. The app offers no treatments, no
 * doses and no presets of either — the amount field is free text, and the
 * icon is a picture chosen for scanning, nothing more.
 *
 * That now goes for the bottle as well. This sheet used to open a barcode
 * reader that asked an online database what a product was; the reader and
 * the request are gone, and what is left is two fields the person fills
 * in. It was the only request the app's own code ever made, so a product
 * record is now exactly as private as everything else here: written on
 * this phone, kept on it.
 *
 * The reader could do two things, and both are kept. It could make a
 * product while a task was being made — that is the form at the bottom —
 * and it could attach one to a task that already existed, which is the
 * bottle button on each row. Keeping only the first would have made
 * "Remove product only" a one-way door and left every task made before
 * this build unable ever to name a bottle.
 */
export default function RoutineScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    data,
    addRoutineItem,
    updateRoutineItem,
    archiveRoutineItem,
    advanceRoutineToday,
    detachProduct,
    saveProduct,
  } = useAppStore();

  const [name, setName] = useState('');
  const [detail, setDetail] = useState('');
  const [time, setTime] = useState<RoutineTimeOfDay>('morning');
  // Always starts at once a day. How often something is taken is a dosing
  // decision, and the app is in no position to guess it for anybody.
  const [doses, setDoses] = useState(1);
  // Null until the user picks one: until then the icon follows what they
  // type, so "Collagen" lands on the cup without an extra tap.
  const [chosenIcon, setChosenIcon] = useState<RoutineIcon | null>(null);
  const nameRef = useRef<TextInput>(null);
  const detailRef = useRef<TextInput>(null);

  const icon = chosenIcon ?? inferRoutineIcon(`${name} ${detail}`);

  const items = activeRoutineItems(data);
  const taken = dosesOn(data, toDateKey());
  const progress = todayProgress(data);

  const canAdd = name.trim().length > 0;
  /** Held just long enough for the tick to register before the form clears. */
  const [added, setAdded] = useState(false);
  /** The form is a second job, so it stays closed while a stack exists. */
  const [adding, setAdding] = useState(false);
  const { isPremium } = usePremium();
  const gate = usePremiumGate();
  /*
    The bottle this task is, if they want to write one down.

    There used to be a barcode reader here and a database behind it. Both
    are gone, and what replaced them is the half that was always the
    person's: two fields they fill in themselves. Nothing is looked up,
    nothing is checked against anything, and the record never leaves the
    phone.
  */
  const [productOpen, setProductOpen] = useState(false);
  const [productName, setProductName] = useState('');
  const [productBrand, setProductBrand] = useState('');
  const productBrandRef = useRef<TextInput>(null);
  /*
    Writing a bottle onto a task that already exists.

    The deleted screen could do this — it listed the stack and attached
    the record it had just made to whichever item you picked — and the
    form above, which only makes a product while it makes a task, does
    not. Without it a person who taps "Remove product only" on the sheet
    below can never link that task to a bottle again, and no task made
    before they started writing products down can ever have one. So the
    row carries its own way in, open one at a time and closed by default:
    a task is a task, and most of them are not a bottle.
  */
  const [attachId, setAttachId] = useState<string | null>(null);
  const [attachName, setAttachName] = useState('');
  const [attachBrand, setAttachBrand] = useState('');
  const attachBrandRef = useRef<TextInput>(null);

  /** 1× → 2× → 3× → 4× → 1×, so the whole range is one control. */
  const cycleDoses = (item: RoutineItem) => {
    const next = doseCount(item) >= MAX_DOSES_PER_DAY ? 1 : doseCount(item) + 1;
    updateRoutineItem(item.id, { dosesPerDay: next });
  };

  /*
    The key of a record written here.

    The field on disk is still called `barcode`, because that is what it
    was when a scanner filled it and `RoutineItem.productBarcode` points
    at it. Nothing scans now, so the key is generated on this device and
    prefixed, which also means it can never collide with the digits an
    older record kept.
  */
  const makeProductKey = () =>
    `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  /**
   * The record, written exactly as it was typed.
   *
   * One place makes a product, so both ways in — the add form and the
   * row below — write the same fields in the same way: nothing tidied,
   * nothing guessed, nothing looked up. Returns the key the task points
   * at, or undefined when there was no name to write.
   */
  const writeProduct = (name: string, brand: string): string | undefined => {
    const bottle = name.trim();
    if (!bottle) return undefined;
    const key = makeProductKey();
    const label = brand.trim();
    saveProduct({
      barcode: key,
      source: 'manual',
      name: bottle,
      ...(label ? { brand: label } : {}),
      fetchedAt: new Date().toISOString(),
    });
    return key;
  };

  const openAttach = (item: RoutineItem) => {
    setAttachId(item.id);
    setAttachName('');
    setAttachBrand('');
  };

  const closeAttach = () => {
    setAttachId(null);
    setAttachName('');
    setAttachBrand('');
  };

  /** Writes the bottle and points an existing task at it. */
  const attachProduct = (item: RoutineItem) => {
    const key = writeProduct(attachName, attachBrand);
    if (!key) return;
    updateRoutineItem(item.id, { productBarcode: key });
    closeAttach();
  };

  const add = () => {
    const label = name.trim();
    if (!label) return;
    if (!isPremium) return;

    /*
      The record is written first so the task can point at it. Both
      fields are theirs, kept exactly as typed: the app does not tidy a
      brand, guess a size, or look anything up about either.
    */
    const productKey = writeProduct(productName, productBrand);

    addRoutineItem({
      label,
      detail: detail.trim() || undefined,
      icon,
      cadence: 'daily',
      timeOfDay: time,
      dosesPerDay: doses,
      productBarcode: productKey,
    });
    setProductName('');
    setProductBrand('');
    setProductOpen(false);
    setName('');
    setDetail('');
    setDoses(1);
    setChosenIcon(null);
  };

  const addAndConfirm = () => {
    add();
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      setAdding(false);
    }, 700);
  };

  const confirmRemove = (item: RoutineItem) => {
    // A linked product gets a middle way out: drop the bottle, keep the
    // task and everything ticked off against it. The row's bottle button
    // comes back when it has none, so this is not a one-way door.
    Alert.alert(`Remove "${item.label}"?`, 'Your past completion history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      ...(item.productBarcode
        ? [{ text: 'Remove product only', onPress: () => detachProduct(item.id) }]
        : []),
      {
        text: 'Remove',
        style: 'destructive' as const,
        onPress: () => archiveRoutineItem(item.id),
      },
    ]);
  };

  const inputStyle = {
    ...typography.body,
    height: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundSubtle,
    color: colors.text,
  };

  // On iOS this is a page sheet, which already sits below the status bar;
  // adding the safe-area inset again leaves an empty band at the top.
  // Android presents it full screen, where the inset is needed.
  const topInset = Platform.OS === 'ios' ? spacing.sm : insets.top;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: topInset }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        }}>
        <Text variant="title3" accessibilityRole="header">
          Routine
        </Text>
        {/*
          The shelf is the only way into /shelf. It sits here because the
          shelf reads this list back — it quotes the tasks below against
          the product records the person has written down — so the two screens
          are about the same handful of bottles. It carries no action:
          the shelf arranges records and adds nothing to this list, so
          opening it from here cannot leave anything half-done.
        */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <PressableScale
            hitSlop={5}
            onPress={() => router.push('/shelf')}
            accessibilityRole="button"
            accessibilityLabel="Your shelf"
            style={{
              height: 34,
              paddingHorizontal: spacing.md,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Text variant="footnote" color="textSecondary">
              Shelf
            </Text>
          </PressableScale>
          <PressableScale
            hitSlop={5}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.fill,
            }}>
            <Icon name="close" size={15} color={colors.text} />
          </PressableScale>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: insets.bottom + spacing.xxxl,
        }}>
        {items.length > 0 ? (
          <>
            {/*
              Adherence and streak live on Home. Repeating them here put two
              more zeros at the top of the one screen whose job is to let
              somebody tick something off.
            */}
            <SectionHeader title="Today" style={{ marginTop: spacing.sm }} />
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: spacing.md,
                }}>
                <Text variant="subhead" color="textSecondary">
                  {progress.done} of {progress.total} done
                </Text>
                {progress.done === progress.total ? (
                  <Text variant="subhead" color="accent">
                    Complete
                  </Text>
                ) : null}
              </View>
              <ProgressBar
                progress={progress.total === 0 ? 0 : progress.done / progress.total}
              />
            </Card>

            <SectionHeader title="Your stack" />
            <Card padded={false} style={{ paddingVertical: spacing.xs }}>
              {items.map((item, i) => (
                <View key={item.id}>
                  {i > 0 ? (
                    <Separator inset={STACK_TEXT_INSET} insetEnd={spacing.lg} />
                  ) : null}
                  <StackRow
                    item={item}
                    taken={taken.get(item.id) ?? 0}
                    onToggle={() => advanceRoutineToday(item.id)}
                    product={productFor(data, item)}
                    accessory={
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: spacing.xs,
                        }}>
                        {/* Cycles 1× → 4× → 1×. Here rather than on Home,
                            because this is the screen for editing the
                            stack and Home is the screen for doing it. */}
                        <PressableScale
                          onPress={() => cycleDoses(item)}
                          haptic="light"
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.label}: ${DOSE_LABELS[doseCount(item)]}. Tap to change.`}
                          style={{
                            paddingHorizontal: spacing.sm,
                            paddingVertical: 3,
                            borderRadius: radius.pill,
                            backgroundColor:
                              doseCount(item) > 1 ? colors.accentSoft : colors.backgroundSubtle,
                          }}>
                          <Text
                            variant="caption"
                            color={doseCount(item) > 1 ? 'accent' : 'textTertiary'}
                            style={{ fontWeight: '600' }}>
                            {doseCount(item)}×
                          </Text>
                        </PressableScale>

                        {/* Only where there is nothing to point at yet:
                            a task with a bottle already written down has
                            "Remove product only" on the sheet below, and
                            this is the way back from it. */}
                        {item.productBarcode === undefined ? (
                          <PressableScale
                            onPress={() =>
                              attachId === item.id
                                ? closeAttach()
                                : gate('buildStack', () => openAttach(item))
                            }
                            haptic="light"
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: attachId === item.id }}
                            accessibilityLabel={`Write down the product for ${item.label}`}
                            style={{ padding: spacing.xs }}>
                            <Icon
                              name="bottle"
                              size={15}
                              color={attachId === item.id ? colors.accent : colors.textTertiary}
                            />
                          </PressableScale>
                        ) : null}

                        <PressableScale
                          onPress={() => confirmRemove(item)}
                          haptic="none"
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${item.label}`}
                          style={{ padding: spacing.xs }}>
                          <Icon name="trash" size={15} color={colors.textTertiary} />
                        </PressableScale>
                      </View>
                    }
                  />

                  {attachId === item.id ? (
                    <View
                      style={{
                        paddingHorizontal: spacing.lg,
                        paddingBottom: spacing.md,
                        gap: spacing.sm,
                      }}>
                      <TextInput
                        value={attachName}
                        onChangeText={setAttachName}
                        placeholder="Product name, as it is on the bottle"
                        placeholderTextColor={colors.textTertiary}
                        returnKeyType="next"
                        onSubmitEditing={() => attachBrandRef.current?.focus()}
                        submitBehavior="submit"
                        accessibilityLabel={`Product name for ${item.label}`}
                        style={inputStyle}
                      />
                      <TextInput
                        ref={attachBrandRef}
                        value={attachBrand}
                        onChangeText={setAttachBrand}
                        placeholder="Brand (optional)"
                        placeholderTextColor={colors.textTertiary}
                        returnKeyType="done"
                        onSubmitEditing={() => attachProduct(item)}
                        accessibilityLabel={`Product brand for ${item.label}, optional`}
                        style={inputStyle}
                      />
                      <Text variant="caption" color="textTertiary">
                        Kept exactly as you type it, on this phone. Tress looks
                        nothing up and checks it against nothing.
                      </Text>
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <Button
                          label="Cancel"
                          variant="ghost"
                          size="md"
                          style={{ flex: 1 }}
                          onPress={closeAttach}
                        />
                        <Button
                          label="Save product"
                          icon="bottle"
                          size="md"
                          style={{ flex: 1 }}
                          disabled={attachName.trim().length === 0}
                          onPress={() => attachProduct(item)}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              ))}
            </Card>
          </>
        ) : (
          <EmptyState
            icon="checkCircle"
            title="Nothing tracked yet"
            body="Add what you already do for your hair. Ticking items off is what builds your adherence and streak."
          />
        )}

        {/*
          Open by default only when there is nothing to tick off. With a
          stack on screen, adding is the second job, not the first.
        */}
        {!isPremium ? (
          // Free: the stack they already have stays theirs to tick off —
          // it is their record, and taking it away to sell it back would
          // be a worse product and a worse thing to do. What Premium adds
          // is building on it.
          <PressableScale
            onPress={() => gate('buildStack', () => setAdding(true))}
            scaleTo={0.99}
            accessibilityRole="button"
            accessibilityLabel="Add to your stack. Premium required."
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              marginTop: spacing.xl,
              padding: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}>
            <Icon name="lock" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text variant="body">Add to your stack</Text>
              <Text variant="footnote" color="textSecondary" style={{ marginTop: 1 }}>
                Keep your treatments and routine in one place with Premium.
              </Text>
            </View>
            <Icon name="chevronRight" size={15} color={colors.textTertiary} />
          </PressableScale>
        ) : items.length > 0 && !adding ? (
          <Button
            label="Add a task"
            icon="plus"
            variant="secondary"
            style={{ marginTop: spacing.xl }}
            onPress={() => setAdding(true)}
          />
        ) : (
          <>
        <SectionHeader title="Add a task" />
        <Card>
          {/*
            The bottle, written down rather than read off a label.

            It sits behind a toggle because most tasks are not a bottle —
            a massage, a rinse, a tablet somebody already knows the name
            of — and two more empty fields at the top of the form make
            the common case look like the incomplete one. Open, it asks
            for exactly what the person can answer: what it is called and
            whose it is. Nothing here is validated, corrected or looked
            up, and a record written here is only ever read back on this
            phone.
          */}
          {productOpen ? (
            <View style={{ marginBottom: spacing.md, gap: spacing.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                }}>
                <Icon name="bottle" size={16} color={colors.textSecondary} />
                <Text variant="subhead" color="textSecondary" style={{ flex: 1 }}>
                  The product, if this one is a bottle
                </Text>
                <PressableScale
                  onPress={() => {
                    setProductOpen(false);
                    setProductName('');
                    setProductBrand('');
                  }}
                  haptic="none"
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Add this task without a product">
                  <Icon name="close" size={13} color={colors.textTertiary} />
                </PressableScale>
              </View>
              <TextInput
                value={productName}
                onChangeText={setProductName}
                placeholder="Product name, as it is on the bottle"
                placeholderTextColor={colors.textTertiary}
                returnKeyType="next"
                onSubmitEditing={() => productBrandRef.current?.focus()}
                submitBehavior="submit"
                accessibilityLabel="Product name, optional"
                style={inputStyle}
              />
              {/* Next carries on into the task's own name, which is the
                  next field down and the one this form cannot do
                  without. A key labelled Next that moves nothing is a
                  small lie about the form. */}
              <TextInput
                ref={productBrandRef}
                value={productBrand}
                onChangeText={setProductBrand}
                placeholder="Brand (optional)"
                placeholderTextColor={colors.textTertiary}
                returnKeyType="next"
                onSubmitEditing={() => nameRef.current?.focus()}
                submitBehavior="submit"
                accessibilityLabel="Product brand, optional"
                style={inputStyle}
              />
              <Text variant="caption" color="textTertiary">
                Kept exactly as you type it, on this phone. Tress looks
                nothing up and checks it against nothing.
              </Text>
            </View>
          ) : (
            <Button
              label="Add a product"
              icon="bottle"
              variant="secondary"
              size="md"
              onPress={() => setProductOpen(true)}
              style={{ marginBottom: spacing.md }}
            />
          )}
          <TextInput
            ref={nameRef}
            value={name}
            onChangeText={setName}
            placeholder="Name, e.g. Scalp massage"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="next"
            onSubmitEditing={() => detailRef.current?.focus()}
            submitBehavior="submit"
            accessibilityLabel="Task name"
            style={inputStyle}
          />
          <TextInput
            ref={detailRef}
            value={detail}
            onChangeText={setDetail}
            placeholder="Amount or note (optional)"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
            onSubmitEditing={add}
            accessibilityLabel="Amount or note, optional"
            style={[inputStyle, { marginTop: spacing.sm }]}
          />

          <Text variant="subhead" color="textSecondary" style={{ marginTop: spacing.lg }}>
            When
          </Text>
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            {TIMES.map((t) => {
              const selected = t === time;
              return (
                <PressableScale
                  key={t}
                  onPress={() => setTime(t)}
                  haptic="light"
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={TIME_OF_DAY_LABELS[t]}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: spacing.sm + 2,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.accentSoft : colors.backgroundSubtle,
                    borderWidth: 1,
                    borderColor: selected ? colors.accentBorder : 'transparent',
                  }}>
                  <Text variant="subhead" color={selected ? 'accent' : 'textSecondary'}>
                    {TIME_OF_DAY_LABELS[t]}
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          <Text variant="subhead" color="textSecondary" style={{ marginTop: spacing.lg }}>
            Times a day
          </Text>
          <View
            accessibilityRole="radiogroup"
            style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            {DOSE_OPTIONS.map((n) => {
              const selected = n === doses;
              return (
                <PressableScale
                  key={n}
                  onPress={() => setDoses(n)}
                  haptic="light"
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={DOSE_LABELS[n]}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: spacing.sm + 2,
                    borderRadius: radius.pill,
                    backgroundColor: selected ? colors.accentSoft : colors.backgroundSubtle,
                    borderWidth: 1,
                    borderColor: selected ? colors.accentBorder : 'transparent',
                  }}>
                  <Text variant="subhead" color={selected ? 'accent' : 'textSecondary'}>
                    {n}×
                  </Text>
                </PressableScale>
              );
            })}
          </View>

          <Text variant="subhead" color="textSecondary" style={{ marginTop: spacing.lg }}>
            Icon
          </Text>
          <View
            accessibilityRole="radiogroup"
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: spacing.sm,
            }}>
            {ROUTINE_ICONS.map((option) => {
              const selected = option === icon;
              return (
                <PressableScale
                  key={option}
                  onPress={() => setChosenIcon(option)}
                  haptic="light"
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={ROUTINE_ICON_LABELS[option]}>
                  {/* The full arc marks the selection. */}
                  <GlassOrb size={40} progress={selected ? 1 : 0}>
                    <RoutineGlyph icon={option} size={20} />
                  </GlassOrb>
                </PressableScale>
              );
            })}
          </View>

          <Button
            label="Add to stack"
            icon="plus"
            disabled={!canAdd || added}
            succeeded={added}
            onPress={addAndConfirm}
            style={{ marginTop: spacing.xl }}
          />
        </Card>

        <View
          style={{
            marginTop: spacing.xl,
            flexDirection: 'row',
            gap: spacing.md,
            padding: spacing.lg,
            borderRadius: radius.md,
            backgroundColor: colors.backgroundSubtle,
          }}>
          <Icon name="info" size={18} color={colors.textTertiary} />
          <Text variant="footnote" color="textSecondary" style={{ flex: 1 }}>
            Tress tracks what you tell it. It does not recommend
            treatments or doses — speak to a qualified healthcare
            professional about anything medical.
          </Text>
        </View>

          </>
        )}

        {/* Quieter than "Add a task": leaving is not the point of being here. */}
        <Button
          label="Done"
          variant="ghost"
          style={{ marginTop: spacing.md }}
          onPress={() => router.back()}
        />
      </ScrollView>
    </View>
  );
}
