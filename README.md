# Bible App (personal project)

This is a purely personal Bible project for my own development in coding and
in my spiritual life.

A basic Bible reader for Android, built with Expo/React Native. Pick a book,
pick a chapter, then swipe or tap Next/Previous to move through chapters —
similar to YouVersion's reading flow.

NIV, KJV, and ESV text is bundled locally as JSON text assets under `assets/bible/`,
so the app works completely offline.

> **Personal use only.** The bundled NIV text is copyright Biblica, Inc. and
> licensed for non-commercial use only. Do not publish this app or its data
> publicly.

## Project structure

```
App.js                     screen state + prev/next-across-books logic
src/data/books.js          canonical ordered list of the 66 books
src/data/bibleData.js      on-demand Bible book asset loader
src/data/bookIntroData.js  on-demand book introduction asset loader
src/screens/               BookListScreen, ChapterListScreen, ReaderScreen
src/components/ChapterView.js   renders paragraphs/poetry/headings/verses
assets/bible/{niv,kjv,esv}/*.txt        bundled text per translation and book
data/book-intros/*.txt                 bundled introductions per book
```

## 1. Try it instantly during development (no build needed)

The fastest way to see it on your phone while developing:

1. Install the free **Expo Go** app from the Play Store on your phone.
2. From this folder, run:
   ```bash
   npx expo start
   ```
3. Scan the QR code shown in the terminal with the Expo Go app.

This runs your actual code on your phone in seconds, but it opens inside the
Expo Go app rather than as its own installed app with its own icon.

## 2. Build a real, installable APK (own icon, no store, no Expo Go)

This uses Expo's free cloud build service (EAS Build) to compile a real
`.apk` you can install directly — no Android Studio required.

```bash
npm install -g eas-cli   # one-time
eas login                # free Expo account
eas build -p android --profile preview
```

- The `preview` profile (see `eas.json`) is configured to output a `.apk`
  file (not the Play-Store-only `.aab` format).
- When the build finishes, EAS gives you a download link (and a QR code) for
  the `.apk`.

## 3. Install (sideload) the APK on your Android phone

1. Download the `.apk` from the EAS build link directly on your phone
   (or `adb push`/email/cloud-drive it over from your computer).
2. Tap the downloaded file. Android will prompt to allow installs from that
   source ("Install unknown apps") — allow it for your browser/files app.
3. Tap **Install**. The app appears on your home screen with its own icon
   (uses `assets/logo.png` — swap it and the `android-icon-*.png`
   files to customize it, then rebuild).

No developer account fees, no store review, no expiry — it's yours.

## Customizing the app icon

Replace these files in `assets/` with your own artwork, then rebuild:
- `logo.png` — main icon
- `android-icon-foreground.png` / `android-icon-background.png` /
  `android-icon-monochrome.png` — Android adaptive icon layers
- `splash-icon.png` — splash screen

## Web PWA

Build the installable web app with:

```bash
npm run build:web
```

The command exports the Expo web app to `dist/` and generates `dist/sw.js` from
the exported asset names. For Cloudflare Pages, use `npm run build:web` as the
build command and `dist` as the output directory. Host it over HTTPS (or use
localhost while testing), then install it from the browser's app menu.
Deploy from the Git repository so Cloudflare also deploys the `functions/`
directory beside `dist/`. The sermon player needs its `/api/sermon-page`
function to read sermon pages that browsers block with CORS. On the PWA, tap
Play after selecting a sermon; browsers do not allow delayed autoplay. Sermon
audio streams online; offline sermon downloads remain native-app-only. To test
the Pages Function locally after building, run `npx wrangler pages dev dist`
from the project root (Expo's web development server does not run the Function).

The service worker caches the app shell for offline launch. Bible books,
interlinear text, and introductions are cached as you open them; a book must be
opened online once before it is available offline. Reading progress, stats,
memory verses, prayers, and vocabulary data stay in that browser's local
storage. Settings can download and restore a JSON backup on the web.

The PWA does not sync data between devices. Clearing the browser's site data
also removes the locally saved data, so keep a backup if you need to preserve it.
