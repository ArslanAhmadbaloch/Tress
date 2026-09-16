# Google Play declarations — prepared answers

Every answer below is checked against what the code actually does, not what
we intend it to do. Where the honest answer changes once Play billing is
switched on, that is called out rather than glossed over. The data-safety
reasoning in full, with the Apple labels beside it, is in
store/privacy-labels.md; this file is the Play Console walkthrough.

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
first set is routed to that paywall when they start another update, so
the Android build cannot deliver the five-angle updates or comparisons
the description promises beyond the first set. **Do not publish the Play
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

## Data safety — as the app stands today
**Does your app collect or share any required user data types? No.**

 - Photographs, journal notes, routine, streaks, onboarding answers and
   scan readings live in the app's private storage on the device. Nothing
   personal is uploaded; the app's only network request is the product
   barcode lookup below.
 - **Camera images are processed on the device and stored only in the
   app's sandbox.** The hair segmenter (a bundled MediaPipe TFLite model)
   and ML Kit face detection (bundled `com.google.mlkit:face-detection`,
   not the Play Services download variant) both run locally. The mask
   is reduced to a few area fractions and discarded; the photograph is
   written to the app's private directory, not to the gallery. The only
   way an image leaves the sandbox is the person tapping Save or Share on
   their card, which hands one image to the system share sheet.
 - **Product barcode lookups.** Scanning a product sends its barcode number —
   and nothing else — to Open Beauty Facts (`world.openbeautyfacts.org`) over
   HTTPS; the product photo is loaded from `images.openbeautyfacts.org`. No
   photograph, identifier or account is sent. A barcode is not a Play data
   type, so the "collect or share" answer stays No. `android.permission.INTERNET`
   is in every Expo-built manifest already and needs no declaration.
 - Photo library: read only if the person picks a picture for their card;
   the chosen file is copied into the sandbox and not transmitted.
 - No account system, so no name, email or identifiers are collected.
 - `expo-notifications` is used for *local* scheduled reminders only. The
   code never calls `getExpoPushTokenAsync` or `getDevicePushTokenAsync`,
   so no push token is generated or transmitted.
 - No analytics, crash-reporting or advertising SDK (checked against
   package.json), so no app activity, diagnostics or device IDs are sent.
 - Play Billing is not active on Android: `REVENUECAT_KEYS.android` is
   `null`, so `createRevenueCatBilling()` returns null and the RevenueCat
   SDK is never configured. No network call is made to RevenueCat from the
   Android build.

Data deletion: there is no server-side data to delete. Settings offers
"Delete all my data", which clears photos, notes, routine, readings and
passcode from the device.

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

Submitting "no collection" and then shipping billing without revising it is
the kind of mismatch that gets an app pulled. Revise first, ship second.

## Permissions declarations
 - CAMERA: progress photographs, processed and stored on the device, and
   reading product barcodes (only the decoded number is sent, see above).
 - USE_BIOMETRIC / USE_FINGERPRINT: optional app lock.
 - RECORD_AUDIO is in `blockedPermissions` in app.json, so it is stripped
   from the merged manifest; the camera never records audio.
 - Photo and Video Permissions policy: `expo-image-picker` is used once,
   for the card portrait. Check the merged manifest of the release build
   for `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`. If either is
   present, the console will ask for the photo-permissions declaration;
   the honest answer is "one-time or infrequent access" (a single portrait
   for the card). If the build uses the Android Photo Picker instead, no
   permission appears and no declaration is needed.

## Content rating (IARC questionnaire)
Category: **Utility, Productivity, Communication or Other**.

 - Violence, sexual content, profanity, gambling, horror: **No** to all.
 - Controlled substances: the app lets a person record medicines they have
   been prescribed and over-the-counter treatments they already use. It
   does not depict, encourage or facilitate use of illegal drugs, and it
   gives no dosing advice. Answer the illegal-drug questions **No**; if
   asked about references to legal medicines or health topics, answer
   honestly **Yes**.
 - User-generated content shared with others: **No** — nothing is shared,
   there is no social feature and no server.
 - Location sharing, personal info sharing: **No**.

Expected outcome: Everyone / PEGI 3, possibly with a "references to medicine"
note. The 18+ target audience above is set independently of the rating.

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
