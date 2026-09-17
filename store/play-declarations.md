# Google Play declarations — prepared answers

Every answer below is checked against what the code actually does, not what
we intend it to do. Where the honest answer changes once Play billing is
switched on, that is called out rather than glossed over. The data-safety
reasoning, with the Apple labels beside it, is in
store/privacy-labels.md; this file is the Play Console walkthrough.

Two rules this file is written to. No completeness claims — no "and nothing
else", no "the only network request", no survivor list presented as finished;
where a list has to be exhaustive to be true it names the items worth knowing
about instead. And nothing asserted that this repository cannot show: the
merged manifest, the keychain's behaviour on uninstall and ML Kit's own
telemetry are all in the "still to verify" notes rather than in an answer.

## Developer identity
The Play developer account and the App Store seller of record are the same
person: **Arslan Ahmad**, an **individual developer**, not a company. That is
the name for the developer and data-controller fields here, on the store
listing, and in the privacy policy. The contact route for data questions and
erasure requests is **support@tresshaircare.com**. Do not name any other legal
entity anywhere in these forms — the listing names an individual, and a
declaration that names something else contradicts the page beside it.

## App access
**All functionality is available without special access.**

No account, no sign-in, no credentials of any kind. Premium gates features
behind a subscription, but that is a purchase, not an access restriction —
a reviewer can reach every screen, and the first photograph and its
reading are free. Nothing to declare, no test login needed.

Reaching the paywall for review: finish onboarding, take the single
photograph it ends on, tap Continue on the reading. Settings > Tress
Premium > "See Premium" reaches it again later. On Android today the
paywall shows the plans and a purchase button, but there is no Play
product behind it: tapping the button shows a "Not available yet" dialog
(the button's accessibility hint says the same), and nothing on the
screen says so before the tap. Anyone without Premium who already has a
first scan is routed to that paywall when they start another, so the
Android build cannot deliver the further scans or comparisons the
description promises beyond the first scan. **Do not publish the Play
listing before Play Billing is live**; see the billing note below and
store/listing.md.

## Target audience and content
**Target age group: 18 and over.**

Tress tracks hair-loss treatments including prescription medicines
(finasteride, dutasteride, spironolactone). It is not designed for, marketed
to, or appealing to children, and it must not be listed as such — declaring
any under-18 audience would pull in Families policy obligations the app is
not built to meet.

Store listing contains no children's content. Ads: **none**.

**This does not match the App Store's age rating. That gap is the owner's
decision, taken deliberately, not an oversight.** Apple computes a rating from
a content questionnaire and lands at 12+/13+ on the medical-information answer
alone; Play asks separately who the app is *for*, and the answer there is
adults. The two stores are asking different questions and both answers are
honest. `store/app-store-metadata.md` holds the reasoning, the options that
were rejected and the trade-off being accepted, under "Apple 12+ versus Play
18-and-over". Do not change either answer without reading it.

## Data safety — as the app stands today
**Does your app collect or share any required user data types? No.**

 - Photographs, journal notes, routine, streaks, onboarding answers and
   scan readings live in the app's private storage on the device. Nothing
   personal is uploaded. **In the Android build** the requests our code makes
   are the product barcode lookup below and the product image that follows it.
   (Two qualifiers, both load-bearing. Say "the Android build", not "the app":
   the iOS build also configures RevenueCat, though no longer at launch — see
   `store/privacy-labels.md`. And say "our code": whether the bundled ML Kit
   library logs usage of its own has not been verified from this repository,
   and the note below says so.)
 - **Camera images are processed on the device and stored in the app's
   sandbox.** The hair segmenter (a bundled MediaPipe TFLite model)
   and ML Kit face detection (bundled `com.google.mlkit:face-detection`,
   not the Play Services download variant) both run locally. The mask
   is reduced to a few area fractions and discarded; the photograph is
   written to the app's private directory, not to the gallery. An image
   leaves the sandbox when the person taps Save or Share, which renders one
   image — the membership card, or an update sheet that composites that
   update's photographs — and hands that single file to the system share
   sheet. That rendered file is written to the app's cache directory and left
   there (`src/app/card.tsx:121-124`,
   `src/components/session/share-sheet.tsx:236-238`); it is still inside the
   app's own storage, still not transmitted, and it goes when the app does.
   Nothing is written to the gallery: `expo-media-library` is not a dependency.
   *Bundled means no model download; it does not by itself prove ML Kit's
   common layer sends no usage telemetry of its own. That has not been
   verified from this repository and no document claims it either way — see
   the verification list at the end of `store/privacy-labels.md`.*
 - **Product barcode lookups.** Scanning a product sends its barcode number to
   Open Beauty Facts (`world.openbeautyfacts.org`) over HTTPS, as a GET with no
   body. The request also carries a `fields` list, `Accept: application/json`
   and a `User-Agent` of `Tress/<version> (support@tresshaircare.com)`, because
   that service asks every client to identify itself — the app's name and
   version and our own support address, not the person's
   (`src/features/products/open-beauty-facts.ts:20,29,33-43,229`). No cookie,
   no auth, no photograph, no identifier and no account go with it, and Open
   Beauty Facts sees the device's IP address the way any web server does. The
   product photo is then loaded from `images.openbeautyfacts.org`. A barcode is
   not a Play data type, so the "collect or share" answer stays No.
   `android.permission.INTERNET` is in every Expo-built manifest already and
   needs no declaration.
   *Do not write "and nothing else".* An earlier version of this file did, and
   the same phrase was deleted from the privacy policy for being literally
   false: the headers above are something else. The claim that survives every
   check is the one made here — nothing in the request is about the person.
 - Photo library: read when the person picks a picture for their card;
   the chosen file is copied into the sandbox and not transmitted.
 - No account system, so no name, email or identifiers are collected.
 - `expo-notifications` is used for *local* scheduled reminders only. The
   code never calls `getExpoPushTokenAsync` or `getDevicePushTokenAsync`,
   so no push token is generated or transmitted.
 - No analytics, crash-reporting or advertising SDK (checked against
   package.json and against package-lock.json for transitive copies), so no
   app activity, diagnostics or device IDs are sent.
 - Play Billing is not active on Android: `REVENUECAT_KEYS.android` is
   `null`, so `createRevenueCatBilling()` returns null and the RevenueCat
   SDK is never configured. No network call is made to RevenueCat from the
   Android build.

Data deletion: there is no server-side data to delete from the Android build.
Settings offers "Delete all my data", which deletes every photograph and
thumbnail, cancels scheduled reminders, and clears the journey record —
sessions, routine, journal, readings and onboarding answers. Data questions and
erasure requests go to support@tresshaircare.com.

**It does not clear the passcode**, and an earlier version of this file said it
did. `confirmDeleteAll` in `src/app/settings.tsx` calls `clearAllPhotos()`,
`cancelAllReminders()` and `resetAll()`; `clearPasscode()` in
`src/lib/app-lock.ts` is reached only from the separate "Turn off the passcode?"
alert. The passcode in secure storage, `hj.lock.enabled`, and the small device
preferences (appearance, reminder hour, capture options, the saved entitlement
answer) survive. So do two image caches: the `expo-image` disk cache of Open
Beauty Facts product photos (`src/app/scan-product.tsx:474`) and any share image
already composed into `Paths.cache` (`src/app/card.tsx:121-124`,
`src/components/session/share-sheet.tsx:236-238`) — the second of which can be
a JPEG of the person's own progress photographs. Both sit in the OS cache
directory, which the system may clear on its own and which goes when the app
is deleted. `src/app/privacy.tsx` names the survivors, and the in-app
confirmation copy has always been accurate about what it does. Do not restate
the old claim anywhere, and do not present a survivor list that stops before
those two caches.

**What deleting the app does to the keychain passcode is not something this
tree can show.** Apple documents keychain items as outliving an uninstall, and
`WHEN_UNLOCKED_THIS_DEVICE_ONLY` governs backup and transfer rather than
uninstall. No answer here or in the policy may claim the passcode is gone; the
check that would settle it is in `store/privacy-labels.md`.

### ⚠️ This answer changes when Play billing is switched on
The moment an Android RevenueCat key is added and subscriptions go live, the
app *will* transmit data and the form has to be updated **before** that build
ships:

 - **Purchase history** — collected, required, for app functionality
   (entitlement) and analytics (RevenueCat's revenue and trial charts).
 - **Device or other IDs** — collected, required: RevenueCat assigns an
   anonymous app user ID and reads the Play purchase token. The app never
   attaches a name, email or account to it.
 - Encrypted in transit: **yes**. Shared with third parties: **no** —
   RevenueCat acts as a processor, which Play treats as collection rather
   than sharing. Ephemeral: no.
 - Deletion on request: **yes** — RevenueCat supports customer deletion by
   app user id; the listing's support address is the route.
 - Camera images, photos, health data, personal info: still **not
   collected**. Billing changes nothing about them.

Adding the key gives the Android build the same triggers iOS has: the SDK is
configured when the paywall is on screen, on a purchase, on a restore, and on a
launch where an install that has already bought holds a saved answer that has
run out of date (`src/features/subscription/provider.tsx`,
`src/features/subscription/store-activation.ts`). It is not configured at launch
for an install that has opened no paywall. That is worth knowing here for two
reasons: the erasure offer must still cover somebody who opened the paywall and
bought nothing, and the declaration above is about the data, not about how many
installs it applies to.

Submitting "no collection" and then shipping billing without revising it is
the kind of mismatch that gets an app pulled. Revise first, ship second.

## Permissions declarations
 - CAMERA: progress photographs, processed and stored on the device, and
   reading product barcodes. The lookup request carries the decoded digits and
   the headers described above; no image goes with it.
 - USE_BIOMETRIC / USE_FINGERPRINT: optional app lock.
 - **Motion / accelerometer** (`expo-sensors`, `motionPermission` in app.json):
   **declared, never requested, and no longer read.** The `motionPermission`
   string ships as `NSMotionUsageDescription` on iOS, and on Android the
   library contributes `ACTIVITY_RECOGNITION` (below); the app asks for
   neither at runtime, and nothing under `src/` imports `expo-sensors`,
   `Accelerometer` or `DeviceMotion` any more — the steadiness check went
   with the per-angle camera, and the Hair Scan follows the head with the
   face detector alone. Say "not read", not "read while the camera is open".
   Motion is described the same way here and in `store/privacy-labels.md`.

   **Decided: the motion capability goes before submission.** The string in
   `app.json` says motion tells "when your phone is steady, so it can take
   the photo for you"; both halves describe removed behaviour. Remove
   `expo-sensors` and the string together, or — if the library must stay —
   cut the string to steadiness alone. `package.json` and `app.json` are not
   this file's to edit; it is in openIssues.
 - RECORD_AUDIO is in `blockedPermissions` in app.json, so it is stripped
   from the merged manifest; the camera never records audio. Note that
   `app.json` also lists `android.permission.RECORD_AUDIO` in
   `android.permissions` — a self-contradiction in one file.
   `blockedPermissions` wins (`withBlockedPermissions` strips it before
   `withPermissions` runs, then emits `tools:node="remove"`), so nothing
   ships and this declaration is correct.

   **Decided: delete the `android.permission.RECORD_AUDIO` line from
   `android.permissions`.** The declaration here is right either way, but a
   file that argues with itself is a file somebody will one day resolve in the
   wrong direction — and the prebuild check below reads the merged manifest,
   not the argument. One line in `app.json`; in openIssues.
 - **Permissions `app.json` never asked for, merged in from library
   manifests.** These are read from the library manifests in `node_modules`,
   which is as far as this tree goes: there is no `android/` directory (Expo
   CNG), so the *merged* manifest cannot be read here and none of these is
   confirmed to ship until a prebuild says so. What the libraries declare:

   | Permission | Contributed by | Used by the app? | Decision |
   |---|---|---|---|
   | `ACTIVITY_RECOGNITION` | `expo-sensors/android/src/main/AndroidManifest.xml:2` | **No.** Never requested at runtime, and the accelerometer does not need it | **Block it** — see below |
   | `POST_NOTIFICATIONS` | `expo-notifications/android/src/main/AndroidManifest.xml:3` | Yes — `Notifications.requestPermissionsAsync()` (`src/lib/notifications.ts:79`) when reminders are turned on | Keep. Declare it as local reminders |
   | `RECEIVE_BOOT_COMPLETED` | `expo-notifications/.../AndroidManifest.xml:2` | Indirectly — the library's `NotificationsService` receiver listens for `BOOT_COMPLETED` so scheduled local reminders survive a restart | Keep. It reschedules; it receives nothing from a network |

   **Decided: `ACTIVITY_RECOGNITION` is removed rather than explained.** It is
   a runtime-dangerous permission that this app never requests and cannot use:
   nothing under `src/` reads the accelerometer at all now, and the library
   contributes the permission on its own. Shipping a dangerous permission
   the binary never exercises puts it in the Play listing's permission list and
   invites a question with no good answer. Add
   `"android.permission.ACTIVITY_RECOGNITION"` to `android.blockedPermissions`
   in `app.json` — the same mechanism that already strips `RECORD_AUDIO`.
   `app.json` is not this task's file; the change is in openIssues.

   **Still to verify before submission:** `npx expo prebuild -p android`, then
   read `android/app/src/main/AndroidManifest.xml` (or unzip the release AAB)
   and write the real merged list here, replacing this table. The same prebuild
   settles `allowBackup` and the ML Kit logging question.

 - **A Firebase messaging service appears in the merged manifest, and no push
   token is ever requested.** `expo-notifications`'s own manifest registers
   `ExpoFirebaseMessagingService` for `com.google.firebase.MESSAGING_EVENT`, so
   a reviewer reading the merged manifest will see it. It is inert here: there
   is no `googleServicesFile` in `app.json`, no `google-services.json` in the
   tree, and `getExpoPushTokenAsync` / `getDevicePushTokenAsync` are never
   called anywhere under `src/`. Reminders are scheduled locally by the device.
   Say that plainly if asked rather than denying the service is there.
 - Photo and Video Permissions policy: `expo-image-picker` is used once,
   for the card portrait. Check the merged manifest of the release build
   for `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`. If either is
   present, the console will ask for the photo-permissions declaration;
   the honest answer is "one-time or infrequent access" (a single portrait
   for the card). If the build uses the Android Photo Picker instead, no
   permission appears and no declaration is needed.

## Content rating (IARC questionnaire)
Category: **Utility, Productivity, Communication or Other**.

IARC asks what the app *contains and does*, so each answer below is about the
app's own content and features. Photographs the person takes of themselves are
their content, not the app's, and no question asks about them.

 - Violence, sexual content, profanity, gambling, horror: **No** to all. The
   app ships no such content. Its copy is written in house; the Learn
   library's photographs are Unsplash stock under the Unsplash License, each
   credited to its photographer in `src/features/learn/article-photos.ts`, and
   they are portraits and everyday scenes chosen to match articles about how
   hair is measured.
 - Controlled substances: the app lets a person record medicines they have
   been prescribed and over-the-counter treatments they already use. It
   does not depict, encourage or facilitate use of illegal drugs, and it
   gives no dosing advice. Answer the illegal-drug questions **No**; if
   asked about references to legal medicines or health topics, answer
   honestly **Yes**.
 - **User-generated content shared with others: No — and answer it knowing
   the app has a share button.** Do not answer this one with "nothing is
   shared"; an earlier version of this file did, and it is not true. What the
   question asks about is absent: there is no feed, no comment, no profile
   anyone else can see, no server of ours and no route by which one person's
   content reaches another inside Tress. What exists is an export. The card
   screen and an update sheet each render one image and hand that single file
   to the operating system's share sheet (`src/app/card.tsx:133`,
   `src/components/session/share-sheet.tsx:245`), and the update sheet's image
   contains the person's own progress photographs. That is a person saving or
   sending their own file through the OS, the way any photo app does — the app
   publishes nothing and hosts nothing. If the questionnaire offers a
   "share to other apps / social networks" sub-question, answer that **Yes**
   and describe it in those words.
 - Location sharing: **No.** No location API is used anywhere — no
   `expo-location` dependency, no location permission in `app.json`, no
   location call site under `src/`.
 - Personal info sharing: **No.** The app has no account and collects no name,
   email or address; nothing a person types leaves the device except inside an
   image they choose to share themselves.

Expected outcome: Everyone / PEGI 3, possibly with a "references to medicine"
note. **The 18+ target audience above is a different question and is set
independently of this rating** — IARC rates content, Play's target-audience
declaration says who the app is for. Expect the console to notice the gap
between an Everyone rating and an 18+ audience and to check that the listing,
icon and screenshots are not appealing to children; they are photographs of
adult scalps and a routine list, so that check is answerable. Do not raise the
IARC answers to close the gap: a rating that does not match the content is its
own rejection. `store/app-store-metadata.md` records the matching split against
Apple's computed rating, and the owner's decision to keep it.

## Government apps / financial features / health apps
 - Government app: No.
 - Financial features: No (subscriptions are Play Billing, not a financial
   product).
 - Health apps declaration: Tress is **not** a medical device, performs no
   diagnosis, and gives no treatment advice. The on-device photograph
   reading measures the picture — how much of the frame the hair mask
   covers, how it is lit, how sharp it is — and says so on screen; it is
   not a clinical assessment. If Play asks whether the app provides
   health-related features, the honest answer is that it is a personal
   tracking journal with educational content, and the in-app disclaimer
   says exactly that.
