# App Store Connect metadata — Tress 1.0

Every field below is written to the same rule as the app: describe what
Tress records and measures, never what hair will do. The words the tests
sweep the app for (regrowth, thicker, fuller, stages, diagnoses, urgency)
are absent here on purpose. If a field is edited in App Store Connect, edit
it here too — this file is the source, the console is a copy.

Two further rules, because three earlier passes broke them. Nothing here
claims to be a complete list — no "the only thing that leaves your phone", no
"and nothing else", no count of requests that a fourth one would falsify. And
nothing here asserts what the repository cannot show; where a fact needs a
device, an archive or a prebuild to settle, it is in the checklist at the end
rather than in a store field.

Character limits are Apple's. Counts are given so nobody has to recount.

## Seller and developer identity

The seller of record is **Arslan Ahmad**, registered with Apple as an
**individual**, not a company. That is the name Apple shows on the product
page, and it is therefore the name that has to appear wherever a document
names the developer or the data controller: the privacy policy, the support
page, `store/privacy-labels.md` and `store/play-declarations.md`. Do not name
any other legal entity in a store field or in a policy — a reviewer compares
the documents against the listing, and a second name there is a discrepancy
with nothing behind it.

Data questions and erasure requests go to **support@tresshaircare.com**, which
is the address on the support page and in the app's own privacy screen.

## Name (30 max)

    Tress - Haircare Journal

24 characters. Matches `expo.name` in app.json ("Tress") plus the category
descriptor Apple lets the name carry.

## Subtitle (30 max)

    Your hair, month by month

25 characters. Same line as the Play short description's idea, so the two
stores read as one product.

## Promotional text (170 max)

    One scan, read on your phone and never uploaded. Then a scan a month,
    side by side, with a line beside each one. A private record of your
    hair.

143 characters. Promotional text can be changed without a new build; keep
it a description of the product, not an offer.

## Description (4000 max)

Hair changes slowly. Too slowly to see in a mirror, and too slowly to remember. Tress is a private photo journal for that change, kept on your own phone.

It starts with one scan. Turn your head slowly in front of the camera and Tress captures the important angles on its own, using on-device face detection to follow you, then reads the frames it took: how much of each frame the hair covers, where that area sits, how evenly it is lit and how sharp it is. Each of those numbers is a measurement of pixels, made on your phone and drawn over your own picture. The frames are not uploaded, and neither they nor the report is sent anywhere.

Every scan is filed under the same angles: hairline, top, left side and right side. The scanner follows your head and takes each frame at the same point of the turn, so what you compare next month is your hair rather than where you happened to stand. Put any two dates side by side and drag between them. Change that is invisible day to day is plain across a slider.

Write a line beside every scan. What you changed, how the month went, what you noticed: the part you will not remember in March. Keep your routine in one list, whatever you already use, and tick off the days you actually did it. Tress shows how steadily you have kept to it, as a streak and a start date beside each item. It does not tell you whether any of it is working, because a phone cannot know that.

Your membership card is yours to keep on your phone or share. Reminders are optional and stay on the device. Lock the app with Face ID or a passcode if you like.

What the reading is, and is not. Hair coverage is an area: the share of the frame the hair mask counts as hair. It measures area, not what lies between the strands, and it is not a medical opinion. A single reading moves with haircuts, wet hair and how far you held the phone, which is why Tress files every scan under the same angles, asks for the same light, and shows you the series rather than a score.

There is no account, no sign-in, and no server of ours holding your journey. Your photographs, notes, routine and readings live in the app's private storage on your own device. Some things do leave your phone, and the privacy policy describes them. When you open the Premium screen, or buy or restore a subscription, Tress asks our subscription provider whether this install has a membership — that sends a random identifier for the install, and nothing about you. If you never open it, that question is never asked. Scanning a product barcode sends the digits to Open Beauty Facts, an open database, to fetch what it lists. No photograph, and nothing you write, is part of any of that. If your phone is backed up, that backup includes your photographs, because they are files on your phone. Settings has "Delete all my data", and deleting the app takes your photographs and your journey with it.

Tress is a documentation tool, not a medical device. It records; it does not treat, and nothing in it is medical advice. For anything clinical, speak to a qualified healthcare professional.

Tress Premium. Your first scan and its report are free. Premium keeps the record going: unlimited scans, side-by-side comparison of any two dates, your routine and stack, and your full history. New subscribers get a 7-day free trial where the App Store offers one, then a monthly or yearly subscription at the price shown in the app for your country. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in your App Store account settings.

Privacy policy: https://tresshaircare.com/privacy
Terms of use: https://tresshaircare.com/terms

(3,692 characters, counted from "Hair" to the last URL with the paragraph
breaks included. Apple's limit is 4,000.)

Four notes on the "no account" paragraph, because it is the one a
reviewer with source access reads hardest:

 - It does not claim to be the list of everything that leaves. An earlier
   draft said "the only thing that leaves your phone" and then named a second
   thing in the next sentence; a later one said the policy "names every one of
   them", which is a completeness claim about a document this file does not
   control. It now describes the two requests a person would want to know
   about and points at the policy, which is where the links you tap, anything
   you share and the device backup are set out.
 - **"When you open the Premium screen" is the current behaviour and replaces
   "each time it starts", which was true of an earlier build.** The
   subscription SDK is configured when the paywall is on screen, on a
   purchase, on a restore, and at launch for an install that has already
   bought and whose saved answer has run out of date
   (`src/features/subscription/provider.tsx`,
   `src/features/subscription/store-activation.ts`,
   `src/features/subscription/entitlement-cache.ts`). An install that has
   opened no paywall and bought nothing does not reach it, which is what the
   sentence "If you never open it, that question is never asked" is stating.
   Do not reword that back to "each time Tress starts" — that describes a
   build that shipped nowhere — and do not narrow it to "when you subscribe"
   either, because opening the paywall is enough.
 - The subscription sentence is true of the **iOS build only**:
   `REVENUECAT_KEYS.android` is null (src/features/subscription/config.ts),
   so the Android build makes no such request at all. store/listing.md lists
   the substitution the Play listing makes for it.
 - The barcode sentence describes the request in the words a customer needs.
   The full shape of it — the `fields` list, the `Accept` header, the
   `User-Agent` naming the app and our support address — is in the privacy
   policy and in store/privacy-labels.md. Do not add "and nothing else" to it
   here; that phrase has been removed from three documents for being
   literally false.

One more, on the second paragraph. "using on-device face detection to
line you up" describes the shipping capture screen and is true of it, but
it is not the only path: `src/components/capture/tracked-camera.tsx` falls
back to plain expo-camera, with the on-screen guides and no detector, if
the VisionCamera native module is missing or fails at runtime, and the
barcode scanner runs no detector at all. That is a degraded path, not a
second product, so the description keeps the plain sentence — but the App
Review notes below state the fallback, because a reviewer with source
access will find it and an undisclosed fallback reads like a
misdescription. The privacy screen has the same sentence and the same
consideration applies to it.

## Keywords (100 max, comma-separated, no spaces)

    hair,scalp,hairline,tracker,progress,photo,routine,diary,log,compare,minoxidil,finasteride,streak

97 characters. "Tress", "haircare" and "journal" are in the name and
subtitle, which Apple already indexes, so they are not repeated here.
"before after" from the old draft is dropped: the app has no before/after
feature and the phrase invites the comparison the honesty rules forbid.

## URLs

All three are live pages, not placeholders. Checked 16 September 2026, each
returns 200 from Netlify. store/listing.md carries the same three URLs and
points here for their status, so there is one place that says whether the site
exists; neither file should be edited without the other.

 - Support URL: `https://tresshaircare.com/support` — LIVE (200).
   App Review opens it; it carries the support address.
 - Marketing URL: `https://tresshaircare.com` — LIVE (200), optional.
 - Privacy Policy URL: `https://tresshaircare.com/privacy` — LIVE (200) and
   required. **It has been redeployed and is no longer the pre-scanner page.**
   It now reads "Last updated 15 September 2026", carries a "Product lookups"
   section and discloses the on-device hair-segmentation model, so two of the
   three sentences that used to be false there — photos "not analysed" and
   "does not assess your hair" — are gone.

   **It is still behind the tree, and now behind the build as well.**
   `site/privacy.html` was regenerated from a later rewrite of
   `src/app/privacy.tsx`; a diff against the live page, run today, differs in
   every section. And the subscription change has opened a second gap: both
   the live page and `src/app/privacy.tsx` describe a check that runs every
   time the app starts, which is not what this build does. So the order is:
   rewrite `src/app/privacy.tsx`, regenerate `site/`, deploy, then diff.

   What the live page gets wrong today:

    - "We cannot see your data because it is never sent to us" — the third of
      the old false sentences, still there, now qualified by the two clauses
      after it rather than removed.
    - "Delete all my data … permanently removes every photograph, entry and
      setting from this device. There is no copy anywhere else for us to
      delete." Both halves false: settings survive, the keychain passcode
      survives, and RevenueCat holds a record for any install that has
      reached the paywall, a purchase or a restore.
    - The journey is described as being in your device backup, with no iOS
      exception — on iPhone the photographs are eligible for the backup and
      the journey record is not.
    - The permissions list omits motion.
    - The barcode paragraph still says "and nothing else".
    - The subscription check has no section of its own, and is described as
      confirming a membership on "the App Store or Google Play" — wider than
      the code on Android, where no such request is made.
    - The sharing paragraph names the iOS share sheet, on a page Play serves
      too, and mentions only the card.

   **Deploy once more before submission**, then re-run the diff. `site/` is
   generated from the app's own screens by `node scripts/build-site.mjs`, so
   the fix is a rewrite of the screen followed by a regenerate and a deploy —
   no CLI or site link exists in this repo, so the last deploy was made
   through the Netlify web UI.

   **The landing page is not fixed by that deploy.** `https://tresshaircare.com/`
   still says photographs are "not uploaded, not analysed, and not shared with
   anyone", and "not analysed" is false — the app reads every photograph on the
   device. That sentence lives in the generator (`scripts/build-site.mjs`), not
   in `site/`, so regenerating reproduces it. Apple opens the Marketing URL.
   See openIssues; `scripts/build-site.mjs` is not this file's to edit.

   A copy of the same four pages is also deployed to EAS Hosting at
   `https://tress-haircare.expo.app` (all of `/`, `/privacy`, `/terms` and
   `/support` resolve, 200). It serves the same 15 September privacy page as
   Netlify, so the two public policies agree with each other today — but they
   are two public policies, and the next deploy has to reach both or retire
   one. Do not leave them saying different things.

## Category

 - Primary: **Health & Fitness.** The app's whole purpose is recording a
   personal physical attribute over time, alongside a routine of products
   and prescribed treatments. That is where people looking for it search,
   and it is where Apple places habit and body-tracking journals. It does
   not make Tress a medical app: the description and the in-app disclaimer
   say plainly that it is a documentation tool, not a device, and Apple's
   Health & Fitness category is the home of trackers, not of diagnostics.
 - Secondary: **Lifestyle.** Haircare as a daily practice — the routine,
   the streak, the card — sits with the grooming and self-care apps in
   Lifestyle, and a second category widens where the listing appears
   without misdescribing it. Not Medical: Tress performs no diagnosis and
   gives no treatment advice, and claiming Medical would invite review
   scrutiny the app is deliberately built not to need. Not Photo & Video:
   the camera is the instrument, not the product.

## Age rating questionnaire

Answers as of 2026 questionnaire. One line each on why.

 - Cartoon or fantasy violence: **None.** No such content.
 - Realistic violence: **None.**
 - Prolonged graphic or sadistic realistic violence: **None.**
 - Profanity or crude humour: **None.** All copy is written in house.
 - Mature or suggestive themes: **None.**
 - Horror or fear themes: **None.**
 - Medical or treatment information: **Infrequent/Mild.** The Learn
   library explains how studies measure hair and how to read a claim, and
   the routine lets a person record prescriptions they already have. It
   explains; it never advises, doses or diagnoses.
 - Alcohol, tobacco or drug use or references: **None.** Recording a
   prescribed medicine by name is not a depiction of drug use.
 - Simulated gambling: **None.**
 - Sexual content or nudity: **None.** Photographs are of the head; the
   framing guides put the face and scalp in frame.
 - Graphic sexual content and nudity: **None.**
 - Contests: **None.**
 - Gambling (real money): **No.**
 - Unrestricted web access: **No.** There is no address bar and nothing
   accepts a typed URL: the privacy policy and terms are screens inside the
   app (src/app/privacy.tsx, src/app/terms.tsx). The links that do leave go
   to fixed pages the app names in full — "Manage subscription" in Settings
   hands the App Store subscriptions page to the system with
   `Linking.openURL`, and a scanned product's "source" link opens that
   product's page on world.openbeautyfacts.org in the system browser sheet
   (`expo-web-browser`).
 - User-generated content shared with others: **No.** There is no feed, no
   comment, no profile anyone else can see and no server of ours, so no
   content of one person's reaches another inside Tress. There is an
   export: the card screen and an update sheet each render one image and
   hand that single file to the system share sheet, and the update sheet's
   image contains the person's own progress photographs. That is the
   person sending their own file through the OS, not the app publishing
   it. Do not answer this by saying nothing is shared.
 - Messaging, chat or social features: **No.**
 - Advertising: **No.** There is no ad SDK.
 - Loot boxes or random rewards: **No.**
 - Parental controls / age assurance: **No.**
 - Made for Kids: **No.** The in-app policy says Tress is not directed at
   children, and the Play listing declares an audience of 18 and over.

Expected rating: **12+ / 13+** on the "Medical/Treatment Information —
Infrequent/Mild" answer alone. Do not answer "None" there to chase 4+: the
Learn library plainly discusses treatments, and a mismatch between the
rating and the content is a rejection.

### Apple 12+ versus Play 18-and-over — the owner's decision: keep the split

The two stores end up at different floors, and that stays. This is recorded
as a decision rather than a discrepancy, because it looks like a contradiction
at a glance and a reviewer with both consoles open will ask.

**Why they differ.** Apple's rating is computed from the content
questionnaire above — what the app contains. Play's target-audience
declaration (`store/play-declarations.md`) asks a different question:
who the app is for. Tress contains mild medical information, which is a
12+/13+ content answer; it is built for adults tracking treatments some
of which are prescription-only, which is an 18-and-over audience answer.
Both are honest answers to the questions actually asked.

**What was considered and rejected.**

 - *Answer Apple's questionnaire harder to reach 17+/18+.* Rejected. The
   rating is produced by the answers, so moving it means changing an
   answer, and every answer above is already the accurate one. Inflating
   "Medical or treatment information" to Frequent/Intense is the same
   mistake as deflating it to None, in the other direction.
 - *Declare a lower Play target audience to match Apple.* Rejected, and
   it is the dangerous one. Naming any under-18 audience pulls the app
   into Play's Families policy, which it is not built to meet.
 - *Say nothing and hope nobody compares.* Rejected — a reviewer with
   both consoles open compares.

**The trade-off the owner is accepting.** A 13-year-old can install from the
App Store while the Play listing says the app is for adults, so the two
stores genuinely admit different people. What carries the weight instead
is the app itself: the in-app policy states Tress is not directed at
children, the content is a photo journal and a library about how hair is
measured, and there is no age gate anywhere in the code
(`src/app/onboarding/index.tsx` asks for an age, optionally, and nothing
compares it against a threshold). **Do not describe an age gate in any
store field — there isn't one.** If Apple's rating lands at 13+ under the
current questionnaire the gap narrows; it does not close, and it does not
need to.

**When to revisit:** if the app ever gates content on the age it asks
for, if it adds anything that recommends or doses a treatment, or if
either store starts asking the other's question.

## What's New (1.0)

    First release. Scan your hair once and see what your phone reads from
    it, on the device. Then a scan a month, side by side, with your
    routine and a line beside each one. Tress does not upload your
    images.

## App Review notes

Paste into the "Notes" field of App Review Information.

    Tress is a haircare photo journal. There is no account and no
    sign-in, and we run no server: photographs, notes, routine and
    readings are written to the app's private storage on the device and
    are not uploaded. No test account is needed — a fresh install reaches
    onboarding, the capture screen, the reading and the paywall, and the
    Premium features open with a sandbox purchase. The app makes two
    outbound requests of its own, both described below: the RevenueCat
    purchase check and the Open Beauty Facts barcode lookup.

    Reaching the paywall: launch the app, answer the onboarding questions
    (any answers), then take the single photograph the funnel ends on. The
    report that follows shows what the device measured in that photograph.
    Tapping Continue from that report opens the Premium paywall. The
    paywall can also be reached later from Settings > Tress Premium >
    "See Premium", or by starting a new photo update from Home without a
    subscription (the free allowance is the first set only). The close control
    is visible from the first frame; the price, renewal terms and a
    "Restore Purchases" control are on the same screen.

    In-app purchases: two auto-renewable subscriptions in one group,
    tress_premium_yearly and tress_premium_monthly, each with a 7-day
    introductory free trial. Purchases are handled by StoreKit through the
    RevenueCat SDK (react-native-purchases). The review build talks to
    RevenueCat's sandbox; use a Sandbox Apple ID to complete a purchase.
    RevenueCat receives an anonymous SDK-generated app user id and the
    App Store receipt; the app never identifies the user to it (no
    logIn, setEmail, setAttributes or collectDeviceIdentifiers call
    exists in the source).

    When that check runs is worth stating, because the privacy policy and
    the nutrition labels both describe it. The SDK is configured when the
    paywall is on screen, on a purchase, on a restore, and at launch for an
    install that has already bought and whose saved answer has passed the
    date it was good until. Launch otherwise reads that saved answer from
    the device and asks nobody, so an install that has opened no paywall
    and bought nothing is not identified to RevenueCat. On Android the SDK
    is not configured at all in this release.

    On-device analysis: the photograph reading (hair coverage as a share
    of the frame, lighting, sharpness) is computed on the phone with a
    bundled MediaPipe hair segmentation model running under TensorFlow
    Lite, and framing uses ML Kit face detection, also bundled. Neither
    model is downloaded and no image or reading is uploaded. Face
    detection is a framing aid, not a requirement: if the VisionCamera
    native module is unavailable or fails at runtime the capture screen
    falls back to expo-camera with no detector and the on-screen guides
    alone, and the barcode scanner runs no detector at all.

    The app's second network call of its own is the product barcode
    lookup: a GET to world.openbeautyfacts.org carrying the barcode
    number, a fields list, an Accept header and a User-Agent naming the
    app, its version and our support address, with product photos from
    images.openbeautyfacts.org. No photograph, cookie or user identifier
    is sent.
    The reading describes the photograph and is labelled as such in the
    app; it makes no medical claim.

    The two "case study" cards in onboarding are illustrative examples,
    labelled EXAMPLE JOURNEY across the top of the card. They are not
    testimonials and are not presented as outcomes.

    Permissions: the app works without any of them. Camera, photo
    library, Face ID and notifications are each requested at the moment
    they are first used. Motion is the exception and is worth stating
    plainly: NSMotionUsageDescription ships in the binary because
    `expo-sensors` is still installed, but nothing under `src/` reads the
    sensor any more — the steadiness check went with the per-angle camera,
    and the Hair Scan follows the head with the face detector alone. No
    motion permission is requested and no motion data is read. The string
    describes a feature the binary does not have; see the checklist.
    Notifications are local reminders only; no push token is generated,
    and no google-services.json is present.

    Export compliance: the app uses the operating system's standard
    encryption and no encryption of its own (HTTPS via the RevenueCat SDK
    and the Open Beauty Facts barcode lookup), declared with
    ITSAppUsesNonExemptEncryption = false.

## Pre-submission checklist

 - [x] Support, marketing and privacy URLs are live pages (200, checked
       16 September 2026).
 - [ ] `src/app/privacy.tsx` rewritten for the new subscription behaviour —
       it still says the check runs at every cold start for every install.
       This is the document a reviewer reads; it comes before the deploy.
 - [ ] Privacy page regenerated (`node scripts/build-site.mjs`), redeployed
       and diffed against `site/privacy.html` — the live copy is behind. See
       URLs above.
 - [ ] "not analysed" removed from the landing page in
       `scripts/build-site.mjs`, and the site redeployed. Apple opens the
       Marketing URL.
 - [ ] `app.json` / `package.json`: nothing under `src/` reads motion any
       more, so remove `expo-sensors` and the `motionPermission` string
       (a usage string for a sensor the app never touches is a review
       question with no good answer); or, if the library must stay, cut the
       string to steadiness alone. `ACTIVITY_RECOGNITION` added to
       blockedPermissions, and the contradictory `RECORD_AUDIO` line removed
       from `android.permissions`. See store/play-declarations.md.
 - [ ] Both subscriptions created in App Store Connect with a 7-day free
       trial introductory offer, in one subscription group, and attached to
       the RevenueCat "default" offering as `$rc_annual` / `$rc_monthly`.
 - [ ] Privacy nutrition labels entered exactly as store/privacy-labels.md:
       collection Yes, Purchase History and User ID, both Linked Yes, both
       Tracking No.
 - [ ] Xcode Privacy Report generated from a real archive, and the Tracking
       and Linked answers re-read against it before the form is submitted.
 - [ ] Screenshots show real app screens only (store/screenshots), with no
       overlaid claims.
