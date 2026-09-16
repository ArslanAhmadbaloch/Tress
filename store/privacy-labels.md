# Privacy declarations — Apple nutrition labels and Play Data safety

Every answer below is a fact about the code as it stands, checked by
reading it, not a statement of intent. The sources are named so the next
person can re-check them instead of trusting this file.

## What the code does with data

**The app makes one kind of network request of its own: a product barcode
lookup.** `src/features/products/open-beauty-facts.ts` sends a GET to
`https://world.openbeautyfacts.org/api/v2/product/<barcode>.json` carrying the
barcode digits in the path, a `fields` list, an `Accept` header and a
`User-Agent` of `Tress/<version> (support@tresshaircare.com)` — no body, no
cookie, no identifier, no photograph. Product photos are then loaded from
`https://images.openbeautyfacts.org`. That is the only `fetch` under `src/`;
there is no `XMLHttpRequest`, no WebSocket and no other HTTP client. There is
no account and no server of ours. Photographs, journal entries, routine,
streaks, onboarding answers and scan readings are written to the app's private
sandbox (`expo-file-system` documents directory and `AsyncStorage`); looked-up
products are cached in the same `AsyncStorage` record; the passcode goes to the
keychain via `expo-secure-store`.

**On-device analysis, nothing uploaded.** Two models run on the phone:

 - MediaPipe's hair segmenter, bundled as
   `assets/models/hair_segmenter.tflite` (763 KB) and run through
   `react-native-fast-tflite` (`src/features/assessment/hair-segmenter.ts`).
   It produces a per-pixel hair mask, which is reduced to a handful of
   area fractions and discarded.
 - ML Kit face detection for framing, through
   `react-native-vision-camera-face-detector`. Its Android dependency is
   `com.google.mlkit:face-detection` (the bundled variant, model inside the
   APK) and its iOS pod is `GoogleMLKit/FaceDetection`; neither downloads
   a model or phones home. Frames go from the sensor to the detector and
   back natively; only a bounding box and three angles reach JavaScript.

Photo quality (brightness, contrast, sharpness) is arithmetic over a 64px
thumbnail decoded in process (`analyse-photo.ts`); the working thumbnail is
deleted after use.

**The one thing that leaves the phone: the purchase check.** On iOS the app
configures the RevenueCat SDK (`react-native-purchases` 10.x) with the
public key in `src/features/subscription/config.ts`. RevenueCat receives:

 - an **anonymous app user id** — a random identifier the SDK generates
   the first time the app configures it (lazily, on the first call that
   needs the SDK — `src/features/subscription/revenuecat.ts` — not at
   launch) and keeps in the app's UserDefaults (SharedPreferences on
   Android). It is per install: deleting the app discards it, which is
   why "Restore Purchases" exists. The app never calls `Purchases.logIn`,
   `setEmail`, `setDisplayName`, `setAttributes` or
   `collectDeviceIdentifiers`, so nothing else is ever attached to it;
 - the **App Store receipt / transaction data** whenever offerings are
   fetched, a purchase is made or an earlier purchase is re-checked, so RevenueCat can
   tell the app whether the `premium` entitlement is active.

That is what Apple's definitions call **Purchases (Purchase History)** and
**Identifiers (User ID)**.

**On Android none of this happens yet.** `REVENUECAT_KEYS.android` is
`null`, so `createRevenueCatBilling()` returns null before
`Purchases.configure` is ever called. The Android build's only network
request is the barcode lookup above. The section below says what changes
when that flips.

**No analytics, no crash reporting, no ads.** Confirmed by reading
`package.json`: no Sentry, Bugsnag, Crashlytics, Firebase, Amplitude,
Mixpanel, PostHog, Segment, Facebook or ad SDK. `expo-notifications` is
used for local scheduled reminders only; `getExpoPushTokenAsync` /
`getDevicePushTokenAsync` are never called, so no push token exists.

Permissions requested at first use, each optional: camera (photos), photo
library (one picture for the card), Face ID / biometrics (app lock),
notifications (reminders), motion (steadiness for the shutter). The camera
also reads product barcodes; only the decoded digits are sent (above). None
of the data they expose is otherwise transmitted.

---

## Apple — App Privacy (nutrition labels)

### "Do you or your third-party partners collect data from this app?"

**Yes.** Not because the app collects anything, but because Apple counts
data received by an SDK partner on your behalf, and RevenueCat receives
purchase data. Answering "No" would be false the moment a subscription is
bought.

### Data types collected

| Data type | Category | Collected | Purposes | Linked to user | Used for tracking |
|---|---|---|---|---|---|
| Purchase History | Purchases | Yes | App Functionality, Analytics | No | No |
| User ID | Identifiers | Yes | App Functionality, Analytics | No | No |

Everything else — Photos or Videos, Health, Contact Info, Location,
Browsing History, Usage Data, Diagnostics, Other Data — **Not collected**.
Photographs are the obvious question and the answer is plain: they are
written to the sandbox and read by on-device models; no copy ever leaves
the phone, so under Apple's definition ("transmitted off the device") they
are not collected.

**Barcode lookups are not a collected data type.** A product barcode is a
number printed on a bottle, not data about the person; it is not linked to
identity, not stored by us, and not used for tracking. Open Beauty Facts sees
the barcode and, as any website does, the device's IP address in the ordinary
course of serving the request; Apple's definitions do not count that as
collection by the app. No row in the label changes for this feature.

### Purposes

 - **App Functionality:** the entitlement check is what unlocks Premium.
 - **Analytics:** declared honestly rather than optimistically. RevenueCat
   turns those purchases into its dashboard charts (trials started,
   conversions, revenue), and the owner will read them. Apple defines
   Analytics as evaluating user behaviour and app performance, and that is
   what a conversion chart is. RevenueCat's own App Privacy guidance
   recommends declaring both purposes; we follow it.

### "Linked to the user's identity" — the reasoning

Apple's definition: data is linked if it is associated with the user's
identity through an account, a device, or other details. Declare **No**
for both types, on these grounds:

 1. The RevenueCat app user id is a random UUID minted by the SDK. It is
    not derived from, or ever joined to, a name, email, phone number,
    Apple ID, IDFA, IDFV or any account — the app has no account system to
    join it to.
 2. The receipt carries Apple transaction identifiers, which Apple can map
    to an Apple ID on Apple's side, but RevenueCat cannot; it sees a
    receipt and an anonymous id, nothing that identifies a person.
 3. No user attributes are set. `setAttributes`, `setEmail` and friends
    are absent from the code, so the record cannot accumulate identity
    over time.

This answer is only true while the code stays as it is. If anyone adds
`Purchases.logIn(...)`, sets attributes, or configures RevenueCat's
Apple Search Ads / attribution integrations, both rows become **Linked:
Yes** and this file must change in the same commit.

The conservative alternative is to declare **Linked: Yes** on both rows,
reasoning that a persistent per-install identifier is "a device detail".
That is defensible too and Apple will not reject it. The recommendation
above is the accurate one; choose the conservative one only if you would
rather over-declare than argue the definition.

### Tracking

**No.** Tracking, in Apple's sense, means linking data to third-party data
for advertising or sharing it with a data broker. RevenueCat is a
processor acting on our instructions, no data is joined to anything
outside the app, there is no ad SDK and no ATT prompt. Do not add
`NSUserTrackingUsageDescription` — asking would itself imply tracking.

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
   **No.**
 - Is all of the user data collected by your app encrypted in transit?
   Not asked when nothing is collected. (It would be Yes.)
 - Do you provide a way for users to request that their data is deleted?
   Not asked when nothing is collected. In-app, Settings > "Delete all my
   data" removes everything from the device anyway.
 - Camera: images are captured, processed by on-device models, and stored
   only in the app's private sandbox. They are never transmitted and never
   written outside the sandbox unless the person taps Save or Share on one
   card image, which hands that image to the system share sheet.
 - Photos and videos: read only when the person picks a card photo; the
   chosen file is copied into the sandbox and not transmitted.
 - Device or other IDs: none read, none sent.
 - App activity, app info and performance (crash logs, diagnostics): none
   collected — there is no crash or analytics SDK.
 - Barcode lookup: the barcode digits go to Open Beauty Facts over HTTPS and
   the product's name, brand, ingredient text and photo come back. Not a
   Play data type (no personal info, no device ID, no app activity). "Does
   your app collect or share any of the required user data types?" stays No.

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
 - **Data collection is required:** a subscription cannot be verified
   without the purchase token, so it cannot be made optional.
 - Photos, camera images, health data, personal info: still **not
   collected** — nothing in the billing change touches them.

Independent of billing, both states also answer:

 - Security practices: data encrypted in transit (Yes); user can request
   deletion (Yes, via support, as above); independent security review (No).
 - The privacy policy URL on the listing must describe the RevenueCat
   purchase check in plain words; the policy and this form must agree.

Both stores' declarations and `src/app/privacy.tsx` are three copies of
the same fact. When one changes, change all three.
