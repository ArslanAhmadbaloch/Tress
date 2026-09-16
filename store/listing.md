# Store listing copy — Tress

Written to the same rule as the rest of the app: describe what it records
and measures, never what it causes. No regrowth claims, no before/after
promises, no stages, no percentages that pretend to be about a person.

**One description, two stores.** The full description lives in
store/app-store-metadata.md and is pasted into both consoles with the
platform substitutions listed below. Do not keep a second draft here; two
descriptions drift, and the one a reviewer reads is the one nobody edited.

Companion files:

 - store/app-store-metadata.md — seller identity, name, subtitle,
   promotional text, the description, keywords, category, age rating,
   What's New, review notes, URLs and their status.
 - store/privacy-labels.md — Apple nutrition labels and Play Data safety.
 - store/play-declarations.md — the Play Console questionnaire answers.

## Developer name on both listings
**Arslan Ahmad**, an individual developer — the seller of record on the
App Store and the same person on the Play developer account. It is not a
company, and no company name belongs on either listing or in the policy;
store/app-store-metadata.md says why, under "Seller and developer identity".
Support and data questions: support@tresshaircare.com.

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
 3. The two subscription-check sentences in the "no account" paragraph →
    **delete them** while Play Billing is off. `REVENUECAT_KEYS.android` is
    null (src/features/subscription/config.ts), so the Android build makes
    no such request from any screen, and a listing that admits a check the
    build never makes contradicts the Data safety form beside it. Delete
    from "When you open the Premium screen" through "that question is never
    asked." — the paragraph then runs straight on into "Scanning a product
    barcode sends the digits…", which needs no rewording.

    Once Android billing is live, restore the App Store wording verbatim.
    It names our subscription provider rather than a store, so unlike
    substitutions 1 and 2 it needs no Google Play rewording — and it will
    be true of the Android build in the same way, because the SDK is
    configured by the paywall and by a purchase or restore on both
    platforms.
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

**All three are live pages, not placeholders** — each returned 200 from
Netlify when checked on 16 September 2026. Their status lives in one
place, the URLs section of store/app-store-metadata.md, which also records
what is still wrong with the deployed pages; this file names the URLs and
defers on the rest. Two files in one tree disagreeing about whether the
site exists is the kind of thing a reviewer notices, so do not restate the
status here.

The short version, and do not let this file drift from it: the privacy
page is live and has been redeployed since the pre-scanner version, but it
is behind the tree and now behind the build as well — it describes a
subscription check that runs every time the app starts, which is not what
this build does. `src/app/privacy.tsx` is rewritten first, then the site
is regenerated and deployed, then diffed. The landing page's "not
analysed" sentence is a separate fix, in the generator.

Play reads the privacy URL too, and the page it reads is the same one the
App Store reads. It must describe the RevenueCat purchase check in the
same substance as store/privacy-labels.md and the in-app privacy screen —
including that the check is iOS-only and that it happens at the paywall
rather than at launch, because the Data safety form on this listing
answers "no collection" for the Android build.
