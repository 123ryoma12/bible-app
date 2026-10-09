// Chapter assets are text files so parsing only touches the opened chapter.
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { resolveVersion } from "./bibleVersions";
import { BIBLE_CHAPTER_ASSETS } from "./bibleChapterAssets";

const cache = new Map();
const inFlight = new Map();
const pins = new Map();
let retainedKeys = new Set();

function versionId(version) {
  const resolved = resolveVersion(version);
  return BIBLE_CHAPTER_ASSETS[resolved] ? resolved : "niv";
}

function keyFor(bookId, chapterNumber, version) {
  return `${versionId(version)}:${bookId}:${Number(chapterNumber)}`;
}

function prune() {
  for (const key of cache.keys()) {
    if (!retainedKeys.has(key) && !pins.has(key)) cache.delete(key);
  }
}

/** Retain only chapters currently represented by open reader tabs. */
export function retainBibleChapters(tabs, version = "niv") {
  retainedKeys = new Set(tabs.filter((tab) => Number(tab.chapterNumber) > 0)
    .map((tab) => keyFor(tab.bookId, tab.chapterNumber, version)));
  prune();
}

/** Prevent a chapter from being released while a screen uses it. */
export function pinBibleChapter(bookId, chapterNumber, version = "niv") {
  const key = keyFor(bookId, chapterNumber, version);
  pins.set(key, (pins.get(key) ?? 0) + 1);
  return () => {
    const next = pins.get(key) - 1;
    if (next > 0) pins.set(key, next);
    else pins.delete(key);
    prune();
  };
}

/** Load one bundled chapter; concurrent requests share the read and parse. */
export async function loadBibleChapter(bookId, chapterNumber, version = "niv") {
  const resolved = versionId(version);
  const number = Number(chapterNumber);
  const loader = BIBLE_CHAPTER_ASSETS[resolved]?.[bookId]?.[number];
  if (!loader) return null;
  const key = keyFor(bookId, number, resolved);
  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    const asset = Asset.fromModule(loader());
    const text = Platform.OS === "web"
      ? await (await fetch(asset.uri)).text()
      : await new File((await asset.downloadAsync()).localUri).text();
    return JSON.parse(text).chapter;
  })();
  inFlight.set(key, task);
  try {
    const chapter = await task;
    if (retainedKeys.has(key) || pins.has(key)) cache.set(key, chapter);
    return chapter;
  } finally {
    inFlight.delete(key);
  }
}

export function getChapter(bookId, chapterNumber, version = "niv") {
  return cache.get(keyFor(bookId, chapterNumber, version)) ?? null;
}
