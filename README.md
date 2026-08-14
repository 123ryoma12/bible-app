# Bible App (personal build)

A basic Bible reader for Android, built with Expo/React Native. Pick a book,
pick a chapter, then swipe or tap Next/Previous to move through chapters —
similar to YouVersion's reading flow.

The full NIV text is bundled locally as static JSON under `assets/bible/`,
so the app works completely offline.

> **Personal use only.** The bundled NIV text is copyright Biblica, Inc. and
> licensed for non-commercial use only. Do not publish this app or its data
> publicly.

## Project structure

```
App.js                     screen state + prev/next-across-books logic
src/data/books.js          canonical ordered list of the 66 books
src/data/bibleData.js      static requires mapping bookId -> bundled JSON
src/screens/               BookListScreen, ChapterListScreen, ReaderScreen
src/components/ChapterView.js   renders paragraphs/poetry/headings/verses
assets/bible/*.json        bundled NIV text per book
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
   (currently the default Expo icon — swap `assets/icon.png` and the
   `android-icon-*.png` files to customize it, then rebuild).

No developer account fees, no store review, no expiry — it's yours.

## Customizing the app icon

Replace these files in `assets/` with your own artwork, then rebuild:
- `icon.png` — main icon
- `android-icon-foreground.png` / `android-icon-background.png` /
  `android-icon-monochrome.png` — Android adaptive icon layers
- `splash-icon.png` — splash screen
