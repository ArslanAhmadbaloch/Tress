# App Store Connect metadata — Tress 1.0

Every field below is written to the same rule as the app: describe what
Tress records and measures, never what hair will do. The words the tests
sweep the app for (regrowth, thicker, fuller, stages, diagnoses, urgency)
are absent here on purpose. If a field is edited in App Store Connect, edit
it here too — this file is the source, the console is a copy.

Character limits are Apple's. Counts are given so nobody has to recount.

## Name (30 max)

    Tress - Haircare Journal

24 characters. Matches `expo.name` in app.json ("Tress") plus the category
descriptor Apple lets the name carry.

## Subtitle (30 max)

    Your hair, month by month

25 characters. Same line as the Play short description's idea, so the two
stores read as one product.

## Promotional text (170 max)

    One photograph, read on your phone and never uploaded. Then five angles
    a month, side by side, with a line beside each set. A private record of
    your hair.

154 characters. Promotional text can be changed without a new build; keep
it a description of the product, not an offer.

## Description (4000 max)

Hair changes slowly. Too slowly to see in a mirror, and too slowly to remember. Tress is a private photo journal for that change, kept entirely on your phone.

It starts with one photograph. Tress frames the shot for you, using on-device face detection to line you up the same way each time, then reads the photograph it took: how much of the frame the hair covers, where that area sits, how evenly it is lit and how sharp it is. Every one of those numbers is a measurement of pixels, made on your phone and drawn over your own picture. Nothing is uploaded and nothing is sent to a server.

From there, Tress keeps five angles: hairline, top, left side, right side and back. On-screen guides line each shot up with your last one, so what you compare next month is your hair rather than where you happened to stand. Put any two dates side by side and drag between them. Change that is invisible day to day is plain across a slider.

Write a line beside every set. What you changed, how the month went, what you noticed: the part you will not remember in March. Keep your routine in one list, whatever you already use, and tick off the days you actually did it. Tress shows how steadily you have kept to it, as a streak and a start date beside each item. It does not tell you whether any of it is working, because a phone cannot know that.

Your membership card is yours to keep on your phone or share. Reminders are optional and stay on the device. Lock the app with Face ID or a passcode if you like.

What the reading is, and is not. Hair coverage is an area: the share of the frame the hair mask counts as hair. It measures area, not what lies between the strands, and it is not a medical opinion. A single reading moves with haircuts, wet hair and how far you held the phone, which is why Tress asks for the same angles under the same light and shows you the series rather than a score.

There is no account, no sign-in and no server. Your photographs, notes, routine and readings live in the app's private storage on your own device, and they are gone when you delete the app or use "Delete all my data" in Settings. The only thing that leaves your phone is the anonymous purchase check that the App Store and our subscription provider need to confirm your membership. When you scan a product barcode, only the barcode number goes to Open Beauty Facts, an open database, to fetch its listed ingredients.

Tress is a documentation tool, not a medical device. It records; it does not treat, and nothing in it is medical advice. For anything clinical, speak to a qualified healthcare professional.

Tress Premium. Your first photograph and its reading are free. Premium keeps the record going: unlimited five-angle updates, side-by-side comparison of any two dates, your routine and stack, and your full history. New subscribers get a 7-day free trial where the App Store offers one, then a monthly or yearly subscription at the price shown in the app for your country. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period. Manage or cancel any time in your App Store account settings.

Privacy policy: https://tresshaircare.com/privacy
Terms of use: https://tresshaircare.com/terms

(3,236 characters.)

The last sentence of the "no account" paragraph names the App Store and
is true of the iOS build only; store/listing.md lists the substitution
the Play listing makes for it.

## Keywords (100 max, comma-separated, no spaces)

    hair,scalp,hairline,tracker,progress,photo,routine,diary,log,compare,minoxidil,finasteride,streak

97 characters. "Tress", "haircare" and "journal" are in the name and
subtitle, which Apple already indexes, so they are not repeated here.
"before after" from the old draft is dropped: the app has no before/after
feature and the phrase invites the comparison the honesty rules forbid.

## URLs

 - Support URL: `https://tresshaircare.com/support` — PLACEHOLDER. Must
   resolve to a page with a contact address before submission; App Review
   opens it.
 - Marketing URL: `https://tresshaircare.com` — PLACEHOLDER, optional.
 - Privacy Policy URL: `https://tresshaircare.com/privacy` — PLACEHOLDER.
   Required. Its text must say the same thing as the in-app privacy screen
   and store/privacy-labels.md, including the RevenueCat purchase check.

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
   framing guides put the face and scalp in frame, nothing else.
 - Graphic sexual content and nudity: **None.**
 - Contests: **None.**
 - Gambling (real money): **No.**
 - Unrestricted web access: **No.** There is no web view and no in-app
   browser of our own: the privacy policy and terms are screens inside
   the app (src/app/privacy.tsx, src/app/terms.tsx). Two outbound links
   exist, both to fixed pages the app names in full: "Manage subscription"
   in Settings hands the App Store subscriptions page to the system with
   `Linking.openURL`, and a scanned product's "source" link opens that
   product's page on world.openbeautyfacts.org in the system browser sheet
   (`expo-web-browser`). Neither accepts a typed URL.
 - User-generated content shared with others: **No.** Nothing is shared
   unless the person hands one card image to the system share sheet.
 - Messaging, chat or social features: **No.**
 - Advertising: **No.** There is no ad SDK.
 - Loot boxes or random rewards: **No.**
 - Parental controls / age assurance: **No.**
 - Made for Kids: **No.** The in-app policy says the app is not directed
   at children under 13, and the Play listing targets 18+.

Expected rating: **12+ / 13+** on the "Medical/Treatment Information —
Infrequent/Mild" answer alone. Do not answer "None" there to chase 4+: the
Learn library plainly discusses treatments, and a mismatch between the
rating and the content is a rejection.

## What's New (1.0)

    First release. Take one photograph and see what your phone reads from
    it, on the device. Then keep five angles a month, side by side, with
    your routine and a line beside every set. Your photographs never leave
    your phone.

## App Review notes

Paste into the "Notes" field of App Review Information.

    Tress is a haircare photo journal. Everything is stored on the device:
    there is no account, no sign-in and no server, so no test account is
    needed. Every screen is reachable on a fresh install.

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
    RevenueCat receives only an anonymous SDK-generated app user id and
    the App Store receipt; the app never identifies the user to it. On
    Android the SDK is not configured at all in this release.

    On-device analysis: the photograph reading (hair coverage as a share
    of the frame, lighting, sharpness) is computed on the phone with a
    bundled MediaPipe hair segmentation model running under TensorFlow
    Lite, and framing uses ML Kit face detection, also bundled. No image
    or reading is uploaded. The app's one network call of its own is the
    product barcode lookup: a GET to world.openbeautyfacts.org with the
    barcode number, and product photos from images.openbeautyfacts.org; no
    photograph or identifier is sent.
    The reading describes the photograph and is labelled as such in the
    app; it makes no medical claim.

    The two "case study" cards in onboarding are illustrative examples,
    labelled EXAMPLE JOURNEY across the top of the card. They are not
    testimonials and are not presented as outcomes.

    Camera, photo library, Face ID, motion and notification permissions
    are each requested at first use and the app works without any of
    them. Motion is the accelerometer, read only while the camera is
    open so the shutter can wait for a steady phone.
    Notifications are local reminders only; no push token is generated.

    Export compliance: the app uses only the operating system's standard
    encryption (HTTPS via the RevenueCat SDK and the Open Beauty Facts
    barcode lookup), declared with
    ITSAppUsesNonExemptEncryption = false.

## Pre-submission checklist

 - [ ] Support, marketing and privacy URLs above replaced with live pages.
 - [ ] Both subscriptions created in App Store Connect with a 7-day free
       trial introductory offer, in one subscription group, and attached to
       the RevenueCat "default" offering as `$rc_annual` / `$rc_monthly`.
 - [ ] Privacy nutrition labels entered exactly as store/privacy-labels.md.
 - [ ] Screenshots show real app screens only (store/screenshots), with no
       overlaid claims.
