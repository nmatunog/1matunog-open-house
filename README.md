# 1Matunog District Open House Passport

Guest passport + admin raffle for 1Matunog District open-house events.

This is a new app. It does **not** use the old admin password. Admins sign in with Google. Guest names, emails and phone numbers are no longer readable by anyone who opens the page.

## What guests see

1. Welcome
2. Your details (Privacy Notice agreement required; marketing follow-up optional) — this is the check-in
3. Scan the printed QR at each station (or type the small backup code). Stamps are saved on this phone.
4. Done — show this at the rewards counter

Printed station cards encode `https://aia-openhouse.netlify.app/s/<eventId>/<token>` (not localhost or a Firebase domain). A phone-camera scan opens the app, checks the guest in if needed, then stamps that station. Netlify rewrites `/s/*` to the SPA.

## What admins see

Sign in with Google → Today (who checked in, stamps per station, who can win now, Start Draw, **Print station QR cards**) → projector Draw (first name + last initial + agent only) → Claimed or Not here → History. New event form prefills station names from the last event and issues new QR tokens and backup codes. Print one A5 card per station and put it at the booth.

## Local development

1. Copy `.env.example` to `.env.local` and fill the Firebase web app values from the console (same project as the old page). Do not paste those values into chat or pull-request text.
2. `npm install`
3. `npm run dev` — guest at `/`, admin at `/admin`
4. Optional emulators: `npm run emulators` and set `VITE_USE_EMULATORS=true`

## Deploy on Netlify

Set these environment variable **names** in the Netlify site settings (values come from Firebase Project settings; do not commit them):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Add the Netlify domain to Firebase Authentication authorized domains.

## Tests

```bash
npm run typecheck
npm run lint
npm test
npm run test:emu
```

`test:emu` starts the Firestore emulator only. It never talks to the live project.

## Firebase files in this repo

- `firestore.rules` — Open House rules **plus** the leader-dashboard rules, copied as-is. One project has one ruleset. Deploying this file replaces whatever is live.
- `firestore.indexes.json`
- `firebase.json` (Hosting + Firestore + emulators)
- `.firebaserc` default project `cma-dashboard-01`

**Do not run `firebase deploy` from CI or from a pull request.** Nilo is the only person who may merge and deploy.

## Before anyone deploys (Nilo, console)

See the pull request description for the full checklist: Google sign-in, authorized domain, `oh_admins` documents, compare live rules with this merged file, then deploy.

Pending from Nilo (not in this code): next open-house date, whether the old password was reused anywhere else, the old Netlify URL, and final Privacy Notice wording / DPO contact.
