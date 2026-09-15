# Google Play declarations — prepared answers

Every answer below is checked against what the code actually does, not what
we intend it to do. Where the honest answer changes once Play billing is
switched on, that is called out rather than glossed over.

## App access
**All functionality is available without special access.**

No account, no sign-in, no credentials of any kind. Premium gates features
behind a subscription, but that is a purchase, not an access restriction —
a reviewer can reach every screen. Nothing to declare, no test login needed.

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

 - Photographs, journal notes, routine and streaks live in the app's private
   storage on the device. Nothing is uploaded.
 - No account system, so no name, email or identifiers are collected.
 - `expo-notifications` is used for *local* scheduled reminders only. The code
   never calls `getExpoPushTokenAsync` or `getDevicePushTokenAsync`, so no push
   token is generated or transmitted.
 - Camera permission is requested to take the photos; the images never leave
   the device.
 - Play Billing is not active on Android: `REVENUECAT_KEYS.android` is `null`,
   so `createRevenueCatBilling()` returns null and the RevenueCat SDK is never
   configured. No network call is made to RevenueCat from the Android build.

Data deletion: there is no server-side data to delete. Settings offers an
"erase everything" that clears photos, notes, routine and passcode from the
device.

### ⚠️ This answer changes when Play billing is switched on
The moment an Android RevenueCat key is added and subscriptions go live, the
app *will* transmit data and the form has to be updated **before** that build
ships:

 - **Purchase history** — collected, for app functionality (entitlement).
 - **Device or other IDs** — collected: RevenueCat assigns an anonymous app
   user ID and reads the Play purchase token.
 - Encrypted in transit: yes. Shared with third parties: RevenueCat acts as a
   processor, which Play treats as collection rather than sharing.

Submitting "no collection" and then shipping billing without revising it is
the kind of mismatch that gets an app pulled. Revise first, ship second.

## Content rating (IARC questionnaire)
Category: **Utility, Productivity, Communication or Other**.

 - Violence, sexual content, profanity, gambling, horror: **No** to all.
 - Controlled substances: the app lets a person record medicines they have
   been prescribed and over-the-counter treatments they already use. It does
   not depict, encourage or facilitate use of illegal drugs, and it gives no
   dosing advice. Answer the illegal-drug questions **No**; if asked about
   references to legal medicines or health topics, answer honestly **Yes**.
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
   diagnosis, and gives no treatment advice. If Play asks whether the app
   provides health-related features, the honest answer is that it is a
   personal tracking journal with educational content, and the in-app
   disclaimer says exactly that.
