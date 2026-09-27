// Interlinear Greek data from STEPBible TAGNT (CC BY 4.0), split by chapter.
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { BIBLE_CHAPTER_ASSETS } from "./bibleChapterAssets";

const loaders = BIBLE_CHAPTER_ASSETS.interlinear;
const cache = new Map();
const inFlight = new Map();
let retainedKeys = new Set();

const keyFor = (bookId, chapter) => `${bookId}:${Number(chapter)}`;

export function retainInterlinearChapters(tabs) {
  retainedKeys = new Set(tabs.filter((tab) => Number(tab.chapterNumber) > 0)
    .map((tab) => keyFor(tab.bookId, tab.chapterNumber)));
  for (const key of cache.keys()) {
    if (!retainedKeys.has(key)) cache.delete(key);
  }
}

export async function loadInterlinearChapter(bookId, chapter) {
  const number = Number(chapter);
  const loader = loaders[bookId]?.[number];
  if (!loader) return null;
  const key = keyFor(bookId, number);
  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    const asset = Asset.fromModule(loader());
    const text = Platform.OS === "web"
      ? await (await fetch(asset.uri)).text()
      : await new File((await asset.downloadAsync()).localUri).text();
    return JSON.parse(text).verses;
  })();
  inFlight.set(key, task);
  try {
    const verses = await task;
    if (retainedKeys.has(key)) cache.set(key, verses);
    return verses;
  } finally {
    inFlight.delete(key);
  }
}

export function getInterlinearVerse(bookId, chapter, verse) {
  return cache.get(keyFor(bookId, chapter))?.[String(verse)] ?? null;
}

export function getInterlinearChapter(bookId, chapter) {
  const verseMap = cache.get(keyFor(bookId, chapter));
  const map = new Map();
  if (verseMap) {
    for (const [number, words] of Object.entries(verseMap)) map.set(Number(number), words);
  }
  return map;
}

export function hasInterlinear(bookId) {
  return !!loaders[bookId];
}
