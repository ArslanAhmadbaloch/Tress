# Store listing copy — Tress

Written to the same rule as the rest of the app: describe what it records
and measures, never what it causes. No regrowth claims, no before/after
promises, no stages, no percentages that pretend to be about a person.

**One description, two stores.** The full description lives in
store/app-store-metadata.md and is pasted into both consoles with the
platform substitutions listed below. Do not keep a second draft here; two
descriptions drift, and the one a reviewer reads is the one nobody edited.

Companion files:

 - store/app-store-metadata.md — name, subtitle, promotional text, the
   description, keywords, category, age rating, What's New, review notes.
 - store/privacy-labels.md — Apple nutrition labels and Play Data safety.
 - store/play-declarations.md — the Play Console questionnaire answers.

## App name (both stores)
Tress - Haircare Journal

## Subtitle (App Store, 30 max)
Your hair, month by month

## Short description (Play, 80 max)
Photograph your hair from the same five angles and see the change over months.

(78 characters.)

## Keywords (App Store, 100 max)
See store/app-store-metadata.md. Play has no keyword field; its ranking
reads the short and full descriptions.

## Full description (Play)

Use the description from store/app-store-metadata.md verbatim, with these
substitutions for the Android build:

 1. "Lock the app with Face ID or a passcode" → "Lock the app with your
    fingerprint, face unlock or a passcode".
 2. "Manage or cancel any time in your App Store account settings" →
    "Manage or cancel any time in your Google Play subscriptions".
 3. "The only thing that leaves your phone is the anonymous purchase check
    that the App Store and our subscription provider need to confirm your
    membership." → **drop the sentence** while Play Billing is off (the
    Android build's only network request is the product barcode lookup,
    which the Data safety form describes; a listing that admits a purchase
    check the build never makes contradicts it). Once billing is live, put it back as "The only
    thing that leaves your phone is the anonymous purchase check that
    Google Play and our subscription provider need to confirm your
    membership."
 4. "Tress Premium" paragraph: Play wording is the same as the App Store
    copy except substitution 2 and "where the App Store offers one" →
    "where Google Play offers one".

**The Play listing must not go live before Play Billing does.** Removing
the Premium paragraph is not enough to make the description true of the
current Android build. `REVENUECAT_KEYS.android` is null, so the paywall
runs on the unconfigured provider: it shows the plans and a purchase
button, the button's accessibility hint says Premium is not open for
purchase in this version, and tapping it shows a "Not available yet"
dialog — there is no visible copy about it on arrival. And
src/app/capture-intro.tsx sends anyone without Premium who already has a
first set to that paywall, so the Android build cannot deliver "five
angles" or "any two dates side by side" beyond the first set. Either ship
Play in the same release that adds the Android key (description complete,
with the substitutions above), or, if a free-tier-only Android release is
ever wanted, cut the description to the first photograph and its reading,
the journal line, the routine and the streak — and nothing the paywall
gates.

## Screenshots and graphics
 - store/screenshots — real screens from the app, unaltered; no overlaid
   claims, no invented readings.
 - store/play — 512px icon and 1024x500 feature graphic.
 - Nothing in a screenshot may show a before/after pair, a "future self"
   image, or a number presented as a measurement of a person. The scan
   report screenshot shows the reading as the app draws it, over the
   photograph, with its own "of the frame" labels.

## Links
Privacy policy: https://tresshaircare.com/privacy
Terms of use: https://tresshaircare.com/terms
Support: https://tresshaircare.com/support

All three are placeholders until the pages exist. The privacy page must
describe the RevenueCat purchase check in the same words as
store/privacy-labels.md and the in-app privacy screen.
