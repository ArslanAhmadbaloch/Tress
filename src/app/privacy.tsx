/**
 * The privacy policy, in the app.
 *
 * App Store review expects a policy reachable from inside the app, not
 * only a URL pasted into App Store Connect. For most apps that means a
 * link out to a web page. This one says the whole thing here.
 *
 * Every claim below is a fact about the code, not an intention.
 *
 * THE BARCODE LOOKUP IS GONE. It was the one request written in this
 * repository's own code — a product barcode sent to a cosmetics database,
 * and the product photo that came back. The screen, the module and the
 * fixtures were deleted, and `grep -rE "fetch\(|XMLHttpRequest|WebSocket|
 * EventSource|axios" src` now finds no HTTP client (the word "fetch"
 * survives in prose and in `Product.fetchedAt`). What that buys is worth
 * stating plainly and worth not overstating: our code has no request of
 * its own left to make. It does not make the binary offline, because of
 * the three things below.
 *
 * What is left that reaches a network, and each has a section:
 *
 *  1. on iOS only, the RevenueCat purchase check, made by that vendor's
 *     SDK rather than by our code. This does not run at launch.
 *     SubscriptionProvider (src/app/_layout.tsx mounts it) reads the
 *     cached snapshot off disk and acts on it; the SDK is configured —
 *     which is what mints the per-install identifier — when the paywall
 *     is on screen (src/features/subscription/store-activation.ts, and
 *     the paywall effect in provider.tsx), on a purchase, on a restore,
 *     and at launch only when a snapshot that grants Premium has run past
 *     the date it was good until (entitlement-cache.ts). A snapshot like
 *     that is written by a purchase or a restore, so an install that has
 *     done neither reaches none of the four. REVENUECAT_KEYS.android is
 *     null (src/features/subscription/config.ts), so Android makes none;
 *  2. a product record written by the retired scanner on an install
 *     upgraded from an earlier build can still hold the address of a
 *     photo on that database's image server, and it is still drawn.
 *     `components/stack-row.tsx` reads `Product.thumbnailUrl` and is
 *     rendered by Home (`app/(tabs)/index.tsx`) and the routine sheet
 *     (`app/routine.tsx`); `app/session/[id].tsx` reads it directly. The
 *     report's routine block is NOT one of them, despite reading a field
 *     of that name: it reads `ShelfProduct.thumbnailUrl`, which
 *     `features/products/shelf.ts` never assigns, so the tile is always
 *     a placeholder — asserted by the report model's own test. The shelf
 *     no longer draws it either. Nothing can write such a record any
 *     more, and when those readers go the section below goes with them;
 *  3. links the person taps — the store's own subscription settings.
 *
 * Everything else that leaves is something the person hands over: a
 * share sheet, or a device backup. There is no analytics SDK, no crash
 * reporter, no ad network, no push token and no expo-updates runtime.
 *
 * Four things this screen deliberately does NOT assert, because the tree
 * cannot establish them and store/privacy-labels.md says not to:
 *
 *  - that the app is offline. Removing the lookup removed OUR request,
 *    not every packet the binary can send: the purchase SDK is compiled
 *    in and connects on iPhone at the four moments above. "Nothing
 *    leaves the device" would be a better sentence and a false one;
 *
 *  - that Google's ML Kit common layer does or does not report its own
 *    SDK usage. What is provable is that the face model is bundled and
 *    that frames never leave the detector, so that is all it says;
 *  - that no advertising identifier exists anywhere in the binary. Our
 *    code reads none and asks for none, and there is no ATT prompt; what
 *    the RevenueCat pod does is not readable here;
 *  - what the iOS keychain does with the passcode after the app is
 *    deleted. The tree shows where it is written and that "Delete all my
 *    data" does not clear it; uninstall behaviour is the OS's, not ours.
 *
 * Two words are banned from this file on purpose. Do not write a
 * completeness claim — no "the whole of", no "every one of them", no
 * "and nothing else" — because three earlier passes each fixed their list
 * and planted a new absolute a layer down. Name the category, or say
 * "the ones worth knowing about", and let the list be open.
 *
 * If any of that changes, this screen is wrong and has to change with
 * it — and so are site/privacy.html (regenerate with
 * `node scripts/build-site.mjs`) and the declaration files under store/.
 *
 * LAST_UPDATED below is hand-set and is the date shown in the app; the
 * hosted page stamps its own build date (scripts/build-site.mjs).
 */
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Screen, ScreenScroll, ScreenTitle } from '@/components/ui/layout';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** The date shown under the title. Move it whenever a section changes. */
const LAST_UPDATED = '18 September 2026';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What we collect',
    body: 'Nothing you photograph or write. Tress has no account, no sign-in and no server of ours, so what you record is not somewhere we can reach it. Tress used to send one thing of its own — a product barcode, to look the bottle up — and that screen and that request are gone. What that changes is real and smaller than “nothing leaves this phone”, so here is the rest of it plainly. A few things can still leave, and the sections below cover the ones worth knowing about: a subscription check on iPhone once you reach the paywall or buy something; a product photograph still loaded from that old database, if you scanned a bottle on an earlier version of Tress; the links you can tap out to; anything you hand to a share sheet; and your device backup if you have one turned on. Read those rather than taking this word for it.',
  },
  {
    title: 'Where your data lives',
    body: 'Your photographs are written to the app’s private storage on this device, where no other app can read them. Your journey, sessions, routine, journal, answers and settings sit beside them in the app’s own record. Nothing in the app keeps the photograph files out of a device backup, so an iCloud or computer backup you have turned on can carry them. The record is a different story on iPhone: the library it is kept in marks itself as not for backup, so restoring a new iPhone from a backup brings the images across and starts the journey empty. On Android both the files and the record sit where Android’s own backup can reach them; whether a particular backup carries them is Android’s business rather than the app’s. Deleting the app removes the photographs and the record from the phone.',
  },
  {
    title: 'Your photographs',
    body: 'Photos you take in the app go straight to that private storage. The app starts no transfer of its own — there is no upload code in it and no server of ours for one to reach. A photograph leaves this phone when you hand it to the share sheet yourself, which the Sharing section below describes, and the files are within reach of your device backup if you have one on. On the phone they are read: where the build has the face detector, it runs while the camera is open to follow your head, so a hair scan can take its several frames on its own as you turn, and where it is missing the scan says so and stops. After a scan, the app measures light, focus and how much of each frame the hair covers. Both of those models are built into the app and run on the device, and the photograph does not leave it to be read. Photos are not added to your camera roll unless you save one yourself.',
  },
  {
    title: 'The subscription check',
    body: 'On iPhone, memberships are kept track of for us by RevenueCat (revenuecat.com), which publishes its own privacy policy there. The app connects to it at the moments that need a store: while the paywall is on your screen, so it can show what your storefront actually charges; when you buy; when you tap Restore; and, on a phone that has already bought something, at start-up when the membership answer the app has on file has run past the date it was good until. The paywall is the one most people meet first, because tapping a feature Premium covers takes you there. If you never open it and never buy, the app does not contact RevenueCat at all, at start-up or afterwards, and that service has no record of your install. When it does connect, RevenueCat makes a random identifier for the install and receives it along with the App Store’s answer about purchases. That identifier carries no name, no email, no photograph and nothing you record, and we attach none of those to it. It does stay the same for as long as the app is installed, and Apple’s privacy label counts a lasting identifier like that as linked to you, so that is what we declare rather than argue the other way. On Android the app is not set up with RevenueCat at all, so no such request is made.',
  },
  {
    title: 'Your products',
    body: 'You type them in. Earlier versions of Tress had a barcode scanner that sent the digits to an online cosmetics database and showed what it listed; that screen and that request are gone. A product is now a name and, if you want, a brand, written on the add-a-task form and kept in the app’s own record on this phone beside everything else. Nothing is looked up, nothing is checked against anything, and no part of it is sent anywhere. The one leftover to name: if you scanned a bottle on an older version, that record kept the web address of the photo the database had, and the screens that draw your products still load that picture from there. Nothing can write a record like that any more. There is no way to delete one product record on its own — the app has no button for it — so the address stays in the record until you use “Delete all my data” in Settings, which clears the products along with the rest of the record.',
  },
  {
    title: 'Artificial intelligence',
    body: 'It runs on this phone. The models the app uses are built into it: one finds a face so the camera can follow your head through a scan, and one separates hair from background so the app can measure how much of the frame it covers. Both are bundled in the app rather than downloaded, and neither sends a photograph anywhere — a frame goes into the detector on this device and comes back as a few numbers. The face detector is Google’s ML Kit; whether its own SDK layer reports usage to Google is not something the app’s code can show, so we claim it neither way. There is no AI service, and nothing you record is used to train anything. Tress does not diagnose anything or generate advice — it measures the picture and shows you the numbers, and what your hair does is yours to find out.',
  },
  {
    title: 'Analytics and tracking',
    body: 'We added no analytics SDK, no crash reporting, no ad network and no third-party tracker. Nothing in the app counts what you tap or reports how you use it. The outward-facing thing to name is the subscription check described above, and since the app stopped asking at launch it happens on a phone whose owner has opened the paywall, bought or restored — not on every start of every install. We read no advertising identifier and ask the subscription provider for none; what that provider’s own code does inside the binary is theirs to declare, not something we can read. Tress asks for no permission to track you across other apps, and there is no such prompt in the build. One thing to say plainly: RevenueCat counts subscriptions, and we read those counts, so the App Store label declares the subscription check for analytics as well as for making Premium work. That is a count of purchases, not of you.',
  },
  {
    title: 'Permissions we ask for',
    body: 'The camera, to scan your hair. That one is not optional where it is used: the hair scan asks for it the first time you open it and shows you why instead of a viewfinder if you say no. Your photo library, only if you choose a picture for your card. Face ID or your passcode, only if you turn on the app lock — the passcode is kept in your phone’s keychain. Notifications, only if you turn on reminders, and those are scheduled by your phone rather than sent from anywhere. Those three are asked for at the moment you first use the feature that needs them, and saying no costs you that feature rather than the app. The app is built with a motion-sensor library it no longer reads, so a motion note ships inside it on iPhone; no motion prompt is ever shown and no motion data is read. On Android, the libraries the app is built from add a few permissions to its list that Tress never requests and never reads — activity recognition, which comes in with that motion library, is one.',
  },
  {
    title: 'Sharing',
    body: 'It happens when you ask for it. Saving or sharing an image from Tress — your card, or an update with its photographs in it — renders that image, writes it into the app’s cache so the share sheet can read it, and hands it over; where it goes from there is your choice. Those written files stay in the cache until the system clears it or the app is deleted. The card is written under one name, so each save replaces the last; an update is named after its day, so several can accumulate there. One button takes you out of the app: "Manage subscription" opens your App Store or Google Play account settings.',
  },
  {
    title: 'Deleting your data',
    body: 'Settings has "Delete all my data". It deletes the photographs and thumbnails, cancels your reminders, and clears your journey, sessions, routine, products, journal and answers. It does not reach everything the app has put on the phone, and these are the leavings worth knowing about: your settings, meaning appearance, reminder hour and the capture options; the app lock, including the passcode in your keychain, so turn the lock off first if you want that gone too; the last membership answer the app had cached; any product pictures the image cache kept from a version that still scanned barcodes; the images you handed to the share sheet, still sitting in the app’s cache — which may be an update with your own photographs in it; and, on an iPhone that has opened the paywall or bought something, the identifier RevenueCat made for the install, which its own SDK wrote and this button does not clear.',
  },
  {
    title: 'Deleting the app',
    body: 'Deleting the app takes the app’s own storage with it: the photographs, the record, the settings and the cached files above. The passcode is the one thing we cannot answer for: it is held in your phone’s keychain rather than in the app, and what the keychain does after an app is removed is the phone’s behaviour, not something this app can show you. If you want the passcode gone, turn the app lock off before you delete. A device backup made before you deleted anything still holds the photograph files until that backup is replaced or deleted, and that is in your phone’s backup settings rather than ours.',
  },
  {
    title: 'The record we can reach',
    body: 'On iPhone, once the app has connected to RevenueCat — because you opened the paywall, bought, or restored — that service holds a customer record against the install’s random identifier. For somebody who only looked at the price, it holds the fact that the app asked and that there is no purchase. Email support@tresshaircare.com and we will have it deleted. It carries no name for us to search on, so tell us roughly when you installed, and the store account you used if you subscribed. An install that never opened the paywall and never bought has no such record for us to find.',
  },
  {
    title: 'What you can ask us for',
    body: 'Nearly everything a privacy law entitles you to, you already hold, because the record is on your phone: read it in the app, change it, and delete it in Settings. There is no copy with us to send you, correct, hand over or hold back — nothing you photograph or write reaches us. Write to support@tresshaircare.com and you can ask what is held about your install, ask for the RevenueCat record above to be deleted, ask a question about anything on this page, or tell us you object to something here; that address is the route for all of it and a person answers. Nothing here runs on a retention clock: what is on the phone stays until you remove it or delete the app, and we set no expiry on that purchase record. The one service a request of the app’s can still reach is RevenueCat, on iPhone. It runs its own servers wherever it runs them, so a subscription check can leave your country, and it publishes a policy of its own.',
  },
  {
    title: 'Children',
    body: 'Tress is not directed at children. It records treatments that are prescribed to adults, and it is rated for an adult audience on the stores it is listed on. Onboarding asks your age, optionally; like everything else you type, it stays on the phone.',
  },
  {
    title: 'Who we are',
    body: 'Tress is made and published by Arslan Ahmad, an individual developer, who is the seller named on its store listing and the person responsible for what the app does with what you record. Under UK and EU data protection law he is the data controller. Post reaches him at 128 City Road, London EC1V 2NX, United Kingdom; support@tresshaircare.com reaches him faster, and a person reads it. If you are in the UK or the EU and think this app has mishandled something of yours, you can complain to your data protection authority — in the UK that is the Information Commissioner’s Office. When any of this changes, this page changes with it and the date at the top moves.',
  },
];

export default function PrivacyScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <ScreenScroll>
        <ScreenTitle
          eyebrow="Privacy"
          title="Your photographs"
          titleMuted="stay on this device"
          subtitle="Tress keeps your photographs and everything else you record on this device. This is what that means in practice, including the few things that do leave."
          trailing={
            <PressableScale
              hitSlop={4}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}>
              <Icon name="close" size={15} color={colors.text} />
            </PressableScale>
          }
        />

        <Text variant="footnote" color="textTertiary" style={{ marginTop: spacing.xs }}>
          Last updated {LAST_UPDATED}
        </Text>

        <View style={{ gap: spacing.xl, marginTop: spacing.lg }}>
          {SECTIONS.map((section) => (
            <View key={section.title}>
              <Text variant="headline" accessibilityRole="header">
                {section.title}
              </Text>
              <Text
                variant="callout"
                color="textSecondary"
                style={{ marginTop: spacing.xs }}>
                {section.body}
              </Text>
            </View>
          ))}
        </View>

        <Text
          variant="footnote"
          color="textTertiary"
          style={{ marginTop: spacing.xxl, marginBottom: spacing.lg }}>
          Tress is a tracking and documentation tool. It is not a
          medical device and does not provide medical advice.
        </Text>
      </ScreenScroll>
    </Screen>
  );
}
