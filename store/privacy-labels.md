# Privacy declarations — Apple nutrition labels and Play Data safety

Every answer below is a fact about the code as it stands, checked by
reading it, not a statement of intent. The sources are named so the next
person can re-check them instead of trusting this file.

**Two rules this file is written to, because three earlier passes broke
them.** First: no completeness claims. Not "and nothing else", not "the
only thing that leaves", not "that list is complete". Where a list would
have to be exhaustive to be true, it says instead which items are worth
knowing about, or names the category. A list that is wrong in one item is
worse than no list. Second: nothing is asserted that this repository
cannot show. "Eligible for the backup" is not "is backed up"; "the SDK is
never configured on this path" is not "no Google library ever phones
home". The things that could not be settled here have their own section
at the end.

## Who is declaring this

The app's seller of record on the App Store is **Arslan Ahmad**, registered
with Apple as an **individual**, not a company. That is the name to enter
wherever a store form, a data-safety form or a privacy policy asks who the
developer or the data controller is, and it is the name the store listing
already shows a reviewer.

The contact route for anything a person asks about their data —
questions, erasure requests, the RevenueCat record described below — is
**support@tresshaircare.com**, which is the address on
`https://tresshaircare.com/support` and in the app's own privacy screen.

No other legal entity is a party to this app. Do not name one in any store
field, in the privacy policy, or in this file: the store listing names an
individual, and a document that names something else contradicts the page
the reviewer is comparing it against.

## What the code does with data

**The outbound requests the app makes of its own accord — these are the
ones worth knowing about, and each has a paragraph below.**

 1. **The product barcode lookup.** `src/features/products/open-beauty-facts.ts`
    sends a GET to
    `https://world.openbeautyfacts.org/api/v2/product/<barcode>.json` carrying the
    barcode digits in the path, a `fields` list, an `Accept` header and a
    `User-Agent` of `Tress/<version> (support@tresshaircare.com)` — no body, no
    cookie, no account, no photograph. Product photos are then loaded from
    `https://images.openbeautyfacts.org` by `expo-image` with
    `cachePolicy="memory-disk"`, so they land in the app's image cache. Both
    platforms.
 2. **The RevenueCat purchase check, iOS only — no longer at launch.** It now
    happens when the paywall is on screen, on a purchase, on a restore, and on
    a launch where an install that has already bought something holds a saved
    answer that has run out of date. The section below sets out each trigger;
    this is the one that is easy to get wrong, and the one that changed.
 3. **Two links the person taps**, opened outside the app: the scanned
    product's page on Open Beauty Facts (`expo-web-browser`,
    `src/app/scan-product.tsx`) and the store's own subscription settings
    (`Linking.openURL`, `src/components/subscription/subscription-status.tsx`).

`open-beauty-facts.ts:227` is where the app's own `fetch` call sits, and it is
the one implementation call site a grep of `src/` finds. Greps for
`XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon` and `axios` return
nothing under `src/`. Those are the clients worth checking in JavaScript; what
a bundled native library does on its own account is a different question, and
the ML Kit paragraph below is the open case. `expo-updates` is not installed,
so there is no update check at launch. No push token is ever requested.

Data also leaves the phone two ways that are not requests at all: an image the
person hands to the share sheet, and the device backup. Both have their own
paragraphs below, and both belong in any sentence about what leaves.

There is no account and no server of ours. Photographs, journal entries,
routine, streaks, onboarding answers and scan readings are written to the app's
private sandbox (`expo-file-system` documents directory and `AsyncStorage`);
looked-up products are cached in the same `AsyncStorage` record; the passcode
goes to the keychain via `expo-secure-store`.

**Backup asymmetry, worth knowing because the policy states it.** The photo
files sit in the documents directory and nothing in the app excludes them, so
on both platforms they are eligible for the device backup and the OS default is
to include them. On iOS `AsyncStorage` sets `NSURLIsExcludedFromBackupKey = YES`
on its own directory by default
(`@react-native-async-storage/async-storage/ios/RNCAsyncStorage.mm`) and
`app.json` does not set the `RCTAsyncStorageExcludeFromBackup` override, so the
journey record is **not** eligible for an iPhone backup. On Android both are.
What a backup actually carries on a given device — Android Auto Backup has a
per-app size cap — is not something this tree can show.

**On-device analysis, nothing uploaded.** Two models run on the phone:

 - MediaPipe's hair segmenter, bundled as
   `assets/models/hair_segmenter.tflite` (763 KB) and run through
   `react-native-fast-tflite` (`src/features/assessment/hair-segmenter.ts`).
   It produces a per-pixel hair mask, which is reduced to a handful of
   area fractions and discarded.
 - ML Kit face detection for framing, through
   `react-native-vision-camera-face-detector`. Its Android dependency is
   `com.google.mlkit:face-detection:16.1.7` (the **bundled** variant, model
   inside the APK — not `com.google.android.gms:play-services-mlkit-face-detection`,
   and correspondingly no `com.google.mlkit.vision.DEPENDENCIES` download
   meta-data in its manifest) and its iOS pod is
   `GoogleMLKit/FaceDetection` 9.0.0, also the bundled on-device model.
   **No model is downloaded.** Frames go from the sensor to the detector and
   back natively; only a bounding box and three angles reach JavaScript, so
   no photograph is transmitted by our code on this path. It is also not on
   every path: `src/components/capture/tracked-camera.tsx` falls back to plain
   `expo-camera` with no detector if the VisionCamera native module is missing
   or fails at runtime, and the barcode scanner uses `expo-camera` and runs no
   detector at all. Say "a face detector lines the shot up" of the capture
   screen, not of the app.

   What is **not** established from this tree: whether ML Kit's
   `com.google.mlkit:common` layer sends usage or diagnostic telemetry of
   its own to Google. This is an Expo CNG project with no `android/` or
   `ios/` directory and neither the AAR nor the pod is cached on the build
   machine, so it cannot be read here. Do not assert either way in the
   policy — it says only that the models are in the app and no photograph
   leaves. **Verify before submission:** `npx expo prebuild -p android`,
   then look in the merged `AndroidManifest.xml` and the extracted AAR for a
   `com.google.android.datatransport` (Firelog) `ContentProvider` or a
   `MlKitComponentDiscoveryService` logging component; and/or run a release
   build through a proxy with the capture screen open and record the hosts
   it contacts. If it does log, `Diagnostics` becomes a declarable type and
   this table changes.

Photo quality (brightness, contrast, sharpness) is arithmetic over a 64px
thumbnail decoded in process (`analyse-photo.ts`); the working thumbnail is
deleted after use.

### The purchase check, and when it actually runs

On iOS the app configures the RevenueCat SDK (`react-native-purchases` 10.x)
with the public key in `src/features/subscription/config.ts`. Configuring is
the act that matters: `Purchases.configure()`
(`src/features/subscription/revenuecat.ts:175`) is where the SDK mints the
anonymous app user id for the install and starts sending it.

**It used to run at every cold start, for every install, subscriber or not.
It does not any more, and that is the change these declarations are written
around.** `SubscriptionProvider` still mounts at the root of the tree
(`src/app/_layout.tsx`), but mounting it reads a saved answer off the device
rather than asking the store. The triggers that do reach `configure()`, each
by way of a method in `revenuecat.ts`:

 1. **The paywall is on screen.** `src/features/subscription/store-activation.ts`
    reports `usePathname() === '/paywall'`, and the provider's paywall effect
    then fetches prices (`products()`) and re-reads the entitlement
    (`entitlement()`). Once per run of the app.
 2. **A purchase.** `purchase()` → `billing.purchase()` → `configure`.
 3. **A restore.** `restore()` → `billing.restore()` → `configure`.
 4. **Launch, for an install whose saved answer grants Premium and can no
    longer vouch for itself** — it is past the date it was good until, or it
    carries no readable date and has sat unchecked for a day
    (`src/features/subscription/entitlement-cache.ts`, `judgeCache`). An answer
    that grants Premium is written by a purchase, by a restore, or by a store
    reply that followed one of those, so this path exists on an install where
    somebody has already bought or restored something.

An install that has opened no paywall, bought nothing and restored nothing
reaches none of those: `judgeCache` returns `needsRefresh: false` both for a
device with no saved answer and for one whose saved answer withholds Premium,
and the test suite sweeps that case
(`scripts/test/entitlement-cache.test.ts`). So a person who installs Tress and
never looks at a price is not identified to RevenueCat.

Two things to hold on to when rewriting any of this. `Purchases.*` appears in
`revenuecat.ts` and nowhere else under `src/`, and `createBilling()` at mount
reads `Platform.select` and `NativeModules.RNPurchases` and calls nothing — so
the four triggers above are what the provider does, as far as reading this tree
can establish. And the SDK's own behaviour once configured is its business, not
ours: what it sends on its first call is the subject of the unverified note
below.

RevenueCat receives:

 - an **anonymous app user id** — a random identifier the SDK generates the
   first time the app configures it and keeps in the app's UserDefaults
   (SharedPreferences on Android). `appUserID` is left null at the call site,
   which is what makes it anonymous. It is per install: deleting the app
   discards it, which is why "Restore Purchases" exists. The app does not call
   `Purchases.logIn`, `setEmail`, `setDisplayName`, `setAttributes` or
   `collectDeviceIdentifiers`, so no personal detail is joined to it by us;
 - the **App Store receipt / transaction data** whenever offerings are
   fetched, a purchase is made or an earlier purchase is re-checked, so
   RevenueCat can tell the app whether the `premium` entitlement is active.

**Unverified, and it is why the "Linked" rows below are declared
conservatively.** The JS layer expands our `Purchases.configure({ apiKey })`
with defaults including `diagnosticsEnabled = false` and
`automaticDeviceIdentifierCollectionEnabled = **true**`
(`node_modules/react-native-purchases/dist/purchases.js`). Whether the
implementing pod reads the IDFV or IDFA cannot be read from this tree —
`PurchasesHybridCommon` is fetched at build time and is not vendored here, and
there is no `ios/` directory. **Verify before submission:**
`npx expo prebuild -p ios && pod install`, read `Pods/PurchasesHybridCommon`
and `Pods/RevenueCat`, and generate the archive's aggregated Privacy Report
(Xcode > Organizer > Generate Privacy Report). If the IDFA turns out to be
read, the Tracking answer changes and an ATT prompt becomes mandatory.

That is what Apple's definitions call **Purchases (Purchase History)** and
**Identifiers (User ID)**.

**On Android none of this happens yet.** `REVENUECAT_KEYS.android` is
`null`, so `createRevenueCatBilling()` returns null before
`Purchases.configure` is ever called and `createBilling()` falls back to
`unconfiguredBilling`, which touches no network. In the Android build the
requests our code makes are the barcode lookup and the product image above.
The native SDK is still compiled into the Android binary; it is simply never
initialised. The section below says what changes when that flips — and note
that the launch behaviour it will inherit is now the new one, not the old.

**No analytics, no crash reporting, no ads.** Confirmed by reading
`package.json`: no Sentry, Bugsnag, Crashlytics, Firebase, Amplitude,
Mixpanel, PostHog, Segment, Facebook or ad SDK, and a grep of
`package-lock.json` for the same names finds none of them transitively.
`expo-notifications` is used for local scheduled reminders only;
`getExpoPushTokenAsync` / `getDevicePushTokenAsync` are never called, so no
push token exists.

**Permissions — five capabilities, four usage strings, four prompts.** The
three are not the same list, and an earlier version of this file said they were
("all five have usage strings in `app.json`"). They do not.

| Capability | Usage string | Asked for at runtime by |
|---|---|---|
| Camera | `app.json:58` | `useCameraPermissions`, when the capture screen or the barcode scanner opens |
| Photo library | `app.json:82` | `ImagePicker.requestMediaLibraryPermissionsAsync()`, when you pick a card picture |
| Face ID / biometrics | `app.json:75` | the system, when `expo-local-authentication` authenticates for the app lock |
| Notifications | **none** | `Notifications.requestPermissionsAsync()` (`src/lib/notifications.ts:79`), when you turn reminders on |
| Motion / accelerometer | `app.json:66` | **nothing — it is never requested** |

Two rows need saying out loud, because a reviewer diffs the policy against the
binary's usage strings:

 - **Notifications has no usage string** and needs none: there is no
   `NSUserNotificationsUsageDescription`, the prompt text is the system's. Its
   absence from `app.json` is correct, not an omission.
 - **Motion is declared and never requested.** `NSMotionUsageDescription` ships
   (`app.json:66`), but there is no `Accelerometer.requestPermissionsAsync`
   anywhere under `src/`; `src/features/capture/use-steadiness.ts:56,66,68`
   calls `isAvailableAsync`, `setUpdateInterval` and `addListener` and reads the
   sensor directly. So the string is carried in the binary but the person is
   never shown a motion prompt. Any document that says each permission is asked
   for at the moment you first use it is wrong about this one; say instead that
   the app works without any of them and that motion is read while the camera is
   open.

**Decided: the motion usage string is rewritten before submission, and motion
stays.** The string in `app.json:66` reads "Tress uses motion to tell when your
phone is steady, so it can take the photo for you." The second clause describes
a behaviour that was removed — `src/features/capture/use-steadiness.ts:13-16`
records that it no longer fires the shutter, and the self-timer does. A usage
string that describes a feature the binary does not have is a review question
with no good answer, and it is the one text a reviewer sees at the prompt.
Replace it with a sentence about steadiness alone; keep the capability, because
`expo-sensors` reads CoreMotion and the string has to be there for that. The
edit is one line in `app.json`, which is not this file's to change, so it is in
openIssues.

The camera also reads product barcodes. The request that carries the decoded
digits is described at the top of this file, headers and all; no image and
nothing the person writes goes with it. What has to match between `app.json`
and `src/app/privacy.tsx` is the substance — every capability the app uses is
named in the policy — not the count of plist keys.

**Deletion, stated exactly.** `src/app/settings.tsx` > "Delete all my data"
calls `clearAllPhotos()` (deletes the whole `Documents/photos` directory),
`cancelAllReminders()` and `resetAll()` (removes the single `AsyncStorage` key
`hj.data.v1`). It does **not** call `clearPasscode()`
(`src/lib/app-lock.ts`), so the keychain passcode and `hj.lock.enabled`
survive, along with the other device preferences, the saved entitlement answer
and the RevenueCat id in UserDefaults. Two caches survive it as well, and both
hold image bytes: the `expo-image` disk cache of Open Beauty Facts product
photos (`cachePolicy="memory-disk"`, `src/app/scan-product.tsx:474`), and any
share image already composed — `src/app/card.tsx:121-124` and
`src/components/session/share-sheet.tsx:236-238` write a rendered file into
`Paths.cache` and never delete it, and the update sheet's file is a JPEG of the
person's own progress photographs. The share files sit in `Paths.cache`, the OS
cache directory, which the system may clear on its own and which is not in a
device backup; expo-image's own cache path was not read from this tree, so say
that it is in the app's cache and stop there.

Do not write "clears every setting" or "clears the passcode" into any
declaration, and do not present a survivor list as though it were the finished
list — name the ones worth knowing about, those two caches among them.

**And do not claim what deleting the app does to the keychain.** Apple's
documented behaviour is that keychain items can outlive an uninstall, and
`keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`src/lib/app-lock.ts:125`)
governs backup and device transfer rather than uninstall. Whether the passcode
is still there after a delete-and-reinstall is not something this tree can
show, so no document may say it is gone. The sandbox is a different matter:
the photographs and the journey record go with the app, because they are files
and a database in it.

**Erasure, and who has a record to erase.** On iOS, RevenueCat holds a customer
record for an install that has reached one of the four triggers above — a
paywall opened, a purchase, a restore, or a launch re-check on an install that
had already bought. An install that has done none of those does not configure
the SDK, so our code makes no request to RevenueCat from it and creates no
record there.

Two consequences for how erasure is offered. It must not be worded "if you have
subscribed", because somebody who opened the paywall and closed it has a record
and never subscribed. And it need not be worded as though every install has
one, which is what the previous behaviour forced. The honest offer: anyone who
asks is helped, the support address is the route, and the identifier to quote is
the anonymous app user id. See openIssues — the app has no screen that shows a
person their own id, which makes the request harder to service than it should
be.

---

## Apple — App Privacy (nutrition labels)

### "Do you or your third-party partners collect data from this app?"

**Yes.** Type `Yes` into App Store Connect. Not because the app collects
anything about the person, but because Apple counts data received by an SDK
partner on your behalf, and RevenueCat receives an identifier and purchase
state whenever the SDK is configured.

**The change in launch behaviour does not change this answer, and it is worth
being clear why**, because the temptation to answer `No` is exactly what this
rewrite could be misread as licensing. Apple's question is about the app, not
about the median user. The paywall is a screen in the shipping app, reachable
from the funnel, from the gate and from Settings; opening it configures the
SDK. One person reaching it is enough for the answer to be `Yes`.

What the change does alter is the **size of the set**: before, a record existed
for every install that had ever launched; now it exists for installs that
reached a paywall, a purchase or a restore. That is a real improvement for
people and it is what the privacy policy should describe — but it is not a
label answer.

Apple's exception for optional-feature data does not apply here either: it
requires, among other things, that the person gives the data through the app's
own interface, and an SDK-minted identifier is not that.

### Data types collected

| Data type | Category | Collected | Purposes | Linked to user | Used for tracking |
|---|---|---|---|---|---|
| Purchase History | Purchases | Yes | App Functionality, Analytics | **Yes** | No |
| User ID | Identifiers | Yes | App Functionality, Analytics | **Yes** | No |

Answer **Not collected** for the other types the form offers — Photos or
Videos, Health, Contact Info, Location, Browsing History, Usage Data,
Diagnostics, Other Data. Photographs are the one a reviewer will press on, and
the answer needs stating with its edges rather than as an absolute. **The app
transmits no photograph**: there is no upload call site under `src/` — no
`uploadAsync`, no `createUploadTask`, no multipart body — and the network
requests it makes are the ones described above. Photographs are written to the
sandbox and read by models that run on the device. Copies do exist off the
app's own storage, and they are not collection under Apple's definition
("transmitted off the device" *by the app*): the device backup, which is the OS
backing up the person's own phone, and an image the person hands to the share
sheet themselves. **Not collected** is the right answer, and it is the right
answer for those reasons, not because nothing ever leaves.

**Barcode lookups add no row to the label, and here is the reasoning**, because
"we send something to a third party and declare nothing" is exactly the pairing
a reviewer questions:

 - Apple's label enumerates data types *about the person*. A product barcode
   is a number printed on a bottle. It is not in any of Apple's categories —
   not Contact Info, not Identifiers (it identifies a product, not a user or a
   device), not Usage Data, not Purchases.
 - Nothing accompanies it that would make it one. The request carries the
   digits, a `fields` list, `Accept`, and a `User-Agent` naming the app and our
   own support address. No cookie, no device id, no account, no photograph. Our
   code never stores the lookup against anything that identifies the person —
   the cached product sits in the same on-device record as everything else.
 - Open Beauty Facts sees the barcode and, as any website does, the device's IP
   address in the ordinary course of serving the request, and the same is true
   of the product image fetched from `images.openbeautyfacts.org`. Apple's
   definitions do not count IP seen incidentally in transit as collection by
   the app.
 - It is disclosed anyway, in `src/app/privacy.tsx` under "Product lookups",
   including the IP exposure and the `User-Agent`. Disclosing more than the
   label requires is the right direction; the label is a fixed taxonomy, the
   policy is the place for the fuller account.

**What would change this:** sending the barcode together with any identifier,
logging lookups server-side against an install, or switching to an API that
requires a key tied to a user. None of those is in the code today.

### Purposes

 - **App Functionality:** the entitlement check is what unlocks Premium.
 - **Analytics:** declared honestly rather than optimistically. RevenueCat
   turns those purchases into its dashboard charts (trials started,
   conversions, revenue), and the owner will read them. Apple defines
   Analytics as evaluating user behaviour and app performance, and that is
   what a conversion chart is. RevenueCat's own App Privacy guidance
   recommends declaring both purposes; we follow it.

**The policy has to bridge this too, because the two words collide.** The label
declares a purpose of *Analytics*; the policy's section is headed *Analytics
and tracking* and answers that there is no analytics SDK. Read side by side
those look like a contradiction, and they are not: "no analytics SDK" is about
what is in the binary — no Sentry, no Firebase, no Amplitude, nothing counting
taps — while the label's *Analytics* is about the purpose a purchase record is
put to once RevenueCat has it. The policy must say both halves, in plain words,
in that section: nothing measures how you use the app, **and** the subscription
check feeds a count of purchases that we read. A policy that says only the
first half cannot be squared with this table.

### "Linked to the user's identity" — decided: Yes

**Type `Yes` into App Store Connect for both rows.** This file once argued for
`No` and then offered `Yes` as an alternative without choosing, which left the
value undecided. It is decided here, and it stays `Yes` after the launch
change.

Apple's definition: data is linked if it is associated with the user's identity
through an account, **a device**, or other details. The case for `No` is real —
the app user id is a random UUID the SDK mints, it is never joined to a name,
email, phone number, Apple ID or account (the app has no account system), and
`setAttributes`, `setEmail`, `logIn` and `collectDeviceIdentifiers` are absent
from the code.

**What the launch change did to this argument, stated plainly.** The old case
for `Yes` leaned on two facts. The first has weakened: the identifier is no
longer sent at every launch, so "sent from every install, constantly" is not a
description of this build. The second has not moved at all. What remains, and
what decides it:

 1. The identifier is still **persistent per install** — the SDK writes it to
    UserDefaults on first configure and reuses it from then on, which is what
    makes a later restore work. A durable per-device identifier is the clearest
    example of "a device detail" in Apple's own wording, whether it is sent
    once a year or once a launch.
 2. `automaticDeviceIdentifierCollectionEnabled` defaults to **true** in the
    SDK, and whether the underlying pod reads the IDFV is not verifiable from
    this repository (see the note above). Declaring `No` would be asserting
    something we have not checked.

`Yes` costs nothing at review, cannot be wrong in the direction that gets an
app pulled, and stays correct whichever way the pod check comes out.

**How this reads beside the privacy policy, because a reviewer opens both.**
The label says *User ID — Linked to the user: Yes*. The policy says the
identifier carries no name, no email, no photograph and nothing the person
records. Those are not in conflict, and this paragraph is the bridge between
them; anyone revising either document should keep it true.

 - Apple's "linked" test is not "does it carry a name". It is whether the data
   is associated with the user's identity **through an account, a device, or
   other details**. A random per-install id kept in UserDefaults is associated
   with a device. That is enough for `Yes` under Apple's own wording, with no
   name anywhere near it.
 - So the two statements describe different things. `Linked: Yes` is about
   **what the identifier is attached to** — one install, durably. The policy's
   sentence is about **what the identifier contains and what we attach to it** —
   nothing, and nothing: the app never calls `Purchases.logIn`, `setEmail`,
   `setDisplayName`, `setAttributes` or `collectDeviceIdentifiers`, so no
   personal detail is joined to it by us.
 - The policy must therefore not say the check is "not linked to you" or
   "completely anonymous", and this file must not be quoted as evidence that it
   is. The honest pairing, and the form of words to keep on both sides: a
   durable identifier for this install, with nothing of the person in it.
 - Note the direction of the conservatism: `Yes` here is a declaration we make
   about ourselves, and over-declaring costs nothing. The **Tracking** answer
   below is the opposite case and is deliberately not made conservative.

**When to revisit:** after the archive's Privacy Report confirms what the
RevenueCat pod actually reads. If it reads no device identifier, `No` becomes
defensible again and this section can be changed back — in a commit that says
so, citing the report. In the other direction, if anyone adds
`Purchases.logIn(...)`, sets attributes, or configures the Apple Search Ads /
attribution integrations, `Yes` stops being conservative and starts being
mandatory, and the Tracking answer below has to be re-argued too.

### Tracking

**No.** Tracking, in Apple's sense, means linking data to third-party data
for advertising or sharing it with a data broker. RevenueCat is a
processor acting on our instructions, no data is joined to anything
outside the app, there is no ad SDK and no ATT prompt. Do not add
`NSUserTrackingUsageDescription` — asking would itself imply tracking.

This one answer is **not** made conservative, deliberately: declaring
Tracking: Yes would oblige the app to show an ATT prompt for something it does
not do, which is worse than under-declaring. It rests on the app never reading
an advertising identifier. That is true of our code — there is no IDFA call
site anywhere under `src/` — but it depends on the RevenueCat pod too, so run
the Privacy Report check above **before** answering this question in App Store
Connect. If the report lists an advertising identifier, this answer becomes Yes
and an ATT prompt is required.

### Privacy manifest (PrivacyInfo.xcprivacy)

Xcode aggregates the manifests shipped by each pod into the archive's
privacy report. The RevenueCat manifest (declaring UserDefaults and the
purchase data above) is not in `node_modules/react-native-purchases` — that
package carries no PrivacyInfo.xcprivacy — but in the `RevenueCat` pod
(purchases-ios) that prebuild pulls in; there is no `ios/` directory in
this repository, so the only place to confirm it is the aggregated privacy
report of the archive (Xcode > Organizer > Generate Privacy Report) before
upload. `expo-file-system` and `@react-native-async-storage/async-storage`
ship theirs in node_modules, declaring their required-reason API use (file
timestamps, UserDefaults). Nothing here needs a hand-written entry; if the
validator reports a missing reason code, fix it in the offending pod's
manifest, not by adding a tracking domain.

---

## Google Play — Data safety

Two states, because the Android build changes behaviour the day Play
Billing is enabled. Ship the first; revise to the second **before** the
first build with an Android RevenueCat key.

### Today (Android build, no billing)

 - Does your app collect or share any of the required user data types?
   **No**, for the Android build as it stands — the RevenueCat SDK is never
   configured there, so the requests our code makes are the barcode lookup and
   the product image that follows it, and a product barcode is not a Play data
   type (reasoning under the Apple section above). Said that way on purpose: it
   is a statement about the app's own code, which is what this tree can
   establish. Whether a bundled Google library logs usage of its own is the
   ML Kit question above, still unverified, and the proxy capture in the
   checklist is what would close it. **The shared privacy policy must agree**:
   `src/app/privacy.tsx` says in so many words that on Android the app is not
   set up with RevenueCat and makes no such request, so the form and the linked
   policy do not contradict each other.
 - Is all of the user data collected by your app encrypted in transit?
   Not asked when nothing is collected. (It would be Yes.)
 - Do you provide a way for users to request that their data is deleted?
   Not asked when nothing is collected. In-app, Settings > "Delete all my
   data" removes the photographs and the journey record from the device; see
   the deletion note above for the settings that survive it.
 - Camera: images are captured, processed by on-device models, and stored in
   the app's private sandbox. The app transmits none of them — there is no
   upload call site anywhere under `src/`. They leave the sandbox when the
   person taps Save or Share, which renders one image — the membership card, or
   an update sheet that composites that update's photographs — writes it to the
   app's cache directory and hands that single file to the system share sheet.
   Nothing is written to the gallery: `expo-media-library` is not a dependency
   and no `saveToLibraryAsync` / `createAssetAsync` call exists.
 - Photos and videos: read when the person picks a card photo; the chosen file
   is copied into the sandbox and not transmitted.
 - Device or other IDs: none read, none sent.
 - App activity, app info and performance (crash logs, diagnostics): none
   collected — there is no crash or analytics SDK.
 - Barcode lookup: the barcode digits go to Open Beauty Facts over HTTPS and
   the product's name, brand, ingredient text and photo come back. Not a
   Play data type (no personal info, no device ID, no app activity). "Does
   your app collect or share any of the required user data types?" stays No.
 - Device backup: the photo directory is `context.filesDir` and `app.json`
   sets no `android.allowBackup`, so the Expo default of `true` applies and the
   photographs and the journey record are eligible for Android Auto Backup.
   That is the OS backing up the user's own device, not the app transmitting
   data, so it adds no Data safety row — but the privacy policy states it, and
   the two must not disagree. **Verify before submission:**
   `npx expo prebuild -p android`, read
   `android/app/src/main/AndroidManifest.xml`, and confirm `allowBackup`.

### After Play Billing is switched on

| Data type | Collected | Shared | Ephemeral | Required | Purpose |
|---|---|---|---|---|---|
| Purchase history | Yes | No | No | Required for purchases | App functionality, Analytics |
| Device or other IDs (RevenueCat anonymous app user id) | Yes | No | No | Required for purchases | App functionality, Analytics |

 - **Shared: No.** Play treats a service provider processing data on the
   developer's instructions (RevenueCat) as collection, not sharing.
 - **Encrypted in transit: Yes.** The SDK speaks HTTPS only.
 - **Deletion: Yes, on request.** RevenueCat exposes a customer-deletion
   endpoint and dashboard action keyed on the anonymous id; the person
   can find their id in the app (RevenueCat's SDK exposes it and the
   subscription screen should surface it — see openIssues) and email the
   support address on the listing. Everything else is deleted in-app.
   **Offer this to anyone who asks, not to subscribers alone.** Adding the
   Android key gives Android the same triggers iOS has now — paywall on screen,
   purchase, restore, and a launch re-check for an install that has bought — so
   a record can exist for somebody who opened the paywall and bought nothing.
   An erasure route worded "if you subscribed" would miss them.
 - **Data collection is required:** a subscription cannot be verified
   without the purchase token, so it cannot be made optional. Note the
   question Play is asking is about the data, not about how many people it
   applies to; "Required" is the closest true answer the form offers.
 - Photos, camera images, health data, personal info: still **not
   collected** — nothing in the billing change touches them.

Independent of billing, both states also answer:

 - Security practices: data encrypted in transit (Yes); user can request
   deletion (Yes, via support, as above); independent security review (No).
 - The privacy policy URL on the listing must describe the RevenueCat
   purchase check in plain words; the policy and this form must agree.
   `src/app/privacy.tsx` carries a section named "The subscription check"; it
   still describes the old launch behaviour and is being rewritten — see
   openIssues. When it lands it must say what this file says: iOS only, and at
   the paywall rather than at launch.

---

## Before you submit: the checks this file could not run

Each of these is a fact the documents deliberately do not assert, because it
could not be read from this repository. Run them, write the answers down here,
and delete the caveat that goes with each.

 1. **Xcode > Organizer > Generate Privacy Report** on a real archive. Settles
    what `PurchasesHybridCommon` / `RevenueCat` declare, whether any device or
    advertising identifier is read, and whether RevenueCat's
    `PrivacyInfo.xcprivacy` is in the archive at all. Decides the Tracking
    answer and lets the Linked rows go back to `No` if warranted.
 2. **`npx expo prebuild -p android`**, then read the merged
    `android/app/src/main/AndroidManifest.xml`. Settles three things at once:
    `allowBackup`; whether ML Kit contributes a `com.google.android.datatransport`
    (Firelog) logging component; and which permissions actually ship —
    `expo-sensors` contributes `ACTIVITY_RECOGNITION` and `expo-notifications`
    contributes `POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED`, none of which
    `app.json` mentions. `store/play-declarations.md` carries a table of what
    each library declares and a decision for each: keep the two notification
    permissions, block `ACTIVITY_RECOGNITION`, which the app never requests and
    cannot use. Blocking it is a one-line change to `app.json` and is in
    openIssues; this prebuild confirms it worked.
 3. **A proxy capture of a release build** (Charles or mitmproxy). Two runs are
    worth making, and the first is the one this rewrite is answerable to:
    launch the app on a fresh install, use the capture screen, scan nothing and
    open no paywall, and confirm no RevenueCat host is contacted; then open the
    paywall and confirm one is. The second run records every host the binary
    contacts and is the check that can go further than reading source.
 4. **Install, set a passcode, delete the app, reinstall**, and read
    `SecureStore.getItemAsync('hj.passcode')` on first launch. Settles whether
    the keychain entry outlives an uninstall, which no document may currently
    claim either way.
 5. **Fetch the live privacy-policy URL and diff it against `site/privacy.html`.**
    The hosted page is what Apple and Google read, and it has been a build
    behind the repo before. Regenerate with `node scripts/build-site.mjs`,
    deploy, then diff. **Run on 16 September 2026, and the result is partly
    good:** `https://tresshaircare.com/privacy` returns 200 and is no longer
    the pre-scanner page — it now carries "Last updated 15 September 2026", a
    Product lookups section and the on-device model disclosure. It is still not
    what is in the tree, and the launch change has put it a further revision
    behind: the live page describes a subscription check that runs at every
    start, which is no longer what the build does. `src/app/privacy.tsx` has to
    be rewritten first, then the site regenerated and deployed.
    `store/app-store-metadata.md` records the same result under URLs.

Both stores' declarations and `src/app/privacy.tsx` are three copies of
the same fact. When one changes, change all three.
