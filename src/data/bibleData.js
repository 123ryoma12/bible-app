// Bible books are bundled as JSON text assets. Unlike JSON modules, parsed
// asset data can be released when no reader tab or picker uses it.

import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { resolveVersion } from "./bibleVersions";

// Known book IDs in canonical order (used to validate keys at runtime).
const BOOK_IDS = [
  "GEN","EXO","LEV","NUM","DEU","JOS","JDG","RUT",
  "1SA","2SA","1KI","2KI","1CH","2CH","EZR","NEH",
  "EST","JOB","PSA","PRO","ECC","SNG","ISA","JER",
  "LAM","EZK","DAN","HOS","JOL","AMO","OBA","JON",
  "MIC","NAM","HAB","ZEP","HAG","ZEC","MAL","MAT",
  "MRK","LUK","JHN","ACT","ROM","1CO","2CO","GAL",
  "EPH","PHP","COL","1TH","2TH","1TI","2TI","TIT",
  "PHM","HEB","JAS","1PE","2PE","1JN","2JN","3JN",
  "JUD","REV",
];

// Static asset maps per version. Metro requires fully static require() calls
// so each offline book is listed explicitly.
const NIV = {
  GEN: () => require("../../assets/bible/niv/GEN.txt"),
  EXO: () => require("../../assets/bible/niv/EXO.txt"),
  LEV: () => require("../../assets/bible/niv/LEV.txt"),
  NUM: () => require("../../assets/bible/niv/NUM.txt"),
  DEU: () => require("../../assets/bible/niv/DEU.txt"),
  JOS: () => require("../../assets/bible/niv/JOS.txt"),
  JDG: () => require("../../assets/bible/niv/JDG.txt"),
  RUT: () => require("../../assets/bible/niv/RUT.txt"),
  "1SA": () => require("../../assets/bible/niv/1SA.txt"),
  "2SA": () => require("../../assets/bible/niv/2SA.txt"),
  "1KI": () => require("../../assets/bible/niv/1KI.txt"),
  "2KI": () => require("../../assets/bible/niv/2KI.txt"),
  "1CH": () => require("../../assets/bible/niv/1CH.txt"),
  "2CH": () => require("../../assets/bible/niv/2CH.txt"),
  EZR: () => require("../../assets/bible/niv/EZR.txt"),
  NEH: () => require("../../assets/bible/niv/NEH.txt"),
  EST: () => require("../../assets/bible/niv/EST.txt"),
  JOB: () => require("../../assets/bible/niv/JOB.txt"),
  PSA: () => require("../../assets/bible/niv/PSA.txt"),
  PRO: () => require("../../assets/bible/niv/PRO.txt"),
  ECC: () => require("../../assets/bible/niv/ECC.txt"),
  SNG: () => require("../../assets/bible/niv/SNG.txt"),
  ISA: () => require("../../assets/bible/niv/ISA.txt"),
  JER: () => require("../../assets/bible/niv/JER.txt"),
  LAM: () => require("../../assets/bible/niv/LAM.txt"),
  EZK: () => require("../../assets/bible/niv/EZK.txt"),
  DAN: () => require("../../assets/bible/niv/DAN.txt"),
  HOS: () => require("../../assets/bible/niv/HOS.txt"),
  JOL: () => require("../../assets/bible/niv/JOL.txt"),
  AMO: () => require("../../assets/bible/niv/AMO.txt"),
  OBA: () => require("../../assets/bible/niv/OBA.txt"),
  JON: () => require("../../assets/bible/niv/JON.txt"),
  MIC: () => require("../../assets/bible/niv/MIC.txt"),
  NAM: () => require("../../assets/bible/niv/NAM.txt"),
  HAB: () => require("../../assets/bible/niv/HAB.txt"),
  ZEP: () => require("../../assets/bible/niv/ZEP.txt"),
  HAG: () => require("../../assets/bible/niv/HAG.txt"),
  ZEC: () => require("../../assets/bible/niv/ZEC.txt"),
  MAL: () => require("../../assets/bible/niv/MAL.txt"),
  MAT: () => require("../../assets/bible/niv/MAT.txt"),
  MRK: () => require("../../assets/bible/niv/MRK.txt"),
  LUK: () => require("../../assets/bible/niv/LUK.txt"),
  JHN: () => require("../../assets/bible/niv/JHN.txt"),
  ACT: () => require("../../assets/bible/niv/ACT.txt"),
  ROM: () => require("../../assets/bible/niv/ROM.txt"),
  "1CO": () => require("../../assets/bible/niv/1CO.txt"),
  "2CO": () => require("../../assets/bible/niv/2CO.txt"),
  GAL: () => require("../../assets/bible/niv/GAL.txt"),
  EPH: () => require("../../assets/bible/niv/EPH.txt"),
  PHP: () => require("../../assets/bible/niv/PHP.txt"),
  COL: () => require("../../assets/bible/niv/COL.txt"),
  "1TH": () => require("../../assets/bible/niv/1TH.txt"),
  "2TH": () => require("../../assets/bible/niv/2TH.txt"),
  "1TI": () => require("../../assets/bible/niv/1TI.txt"),
  "2TI": () => require("../../assets/bible/niv/2TI.txt"),
  TIT: () => require("../../assets/bible/niv/TIT.txt"),
  PHM: () => require("../../assets/bible/niv/PHM.txt"),
  HEB: () => require("../../assets/bible/niv/HEB.txt"),
  JAS: () => require("../../assets/bible/niv/JAS.txt"),
  "1PE": () => require("../../assets/bible/niv/1PE.txt"),
  "2PE": () => require("../../assets/bible/niv/2PE.txt"),
  "1JN": () => require("../../assets/bible/niv/1JN.txt"),
  "2JN": () => require("../../assets/bible/niv/2JN.txt"),
  "3JN": () => require("../../assets/bible/niv/3JN.txt"),
  JUD: () => require("../../assets/bible/niv/JUD.txt"),
  REV: () => require("../../assets/bible/niv/REV.txt"),
};

const KJV = {
  GEN: () => require("../../assets/bible/kjv/GEN.txt"),
  EXO: () => require("../../assets/bible/kjv/EXO.txt"),
  LEV: () => require("../../assets/bible/kjv/LEV.txt"),
  NUM: () => require("../../assets/bible/kjv/NUM.txt"),
  DEU: () => require("../../assets/bible/kjv/DEU.txt"),
  JOS: () => require("../../assets/bible/kjv/JOS.txt"),
  JDG: () => require("../../assets/bible/kjv/JDG.txt"),
  RUT: () => require("../../assets/bible/kjv/RUT.txt"),
  "1SA": () => require("../../assets/bible/kjv/1SA.txt"),
  "2SA": () => require("../../assets/bible/kjv/2SA.txt"),
  "1KI": () => require("../../assets/bible/kjv/1KI.txt"),
  "2KI": () => require("../../assets/bible/kjv/2KI.txt"),
  "1CH": () => require("../../assets/bible/kjv/1CH.txt"),
  "2CH": () => require("../../assets/bible/kjv/2CH.txt"),
  EZR: () => require("../../assets/bible/kjv/EZR.txt"),
  NEH: () => require("../../assets/bible/kjv/NEH.txt"),
  EST: () => require("../../assets/bible/kjv/EST.txt"),
  JOB: () => require("../../assets/bible/kjv/JOB.txt"),
  PSA: () => require("../../assets/bible/kjv/PSA.txt"),
  PRO: () => require("../../assets/bible/kjv/PRO.txt"),
  ECC: () => require("../../assets/bible/kjv/ECC.txt"),
  SNG: () => require("../../assets/bible/kjv/SNG.txt"),
  ISA: () => require("../../assets/bible/kjv/ISA.txt"),
  JER: () => require("../../assets/bible/kjv/JER.txt"),
  LAM: () => require("../../assets/bible/kjv/LAM.txt"),
  EZK: () => require("../../assets/bible/kjv/EZK.txt"),
  DAN: () => require("../../assets/bible/kjv/DAN.txt"),
  HOS: () => require("../../assets/bible/kjv/HOS.txt"),
  JOL: () => require("../../assets/bible/kjv/JOL.txt"),
  AMO: () => require("../../assets/bible/kjv/AMO.txt"),
  OBA: () => require("../../assets/bible/kjv/OBA.txt"),
  JON: () => require("../../assets/bible/kjv/JON.txt"),
  MIC: () => require("../../assets/bible/kjv/MIC.txt"),
  NAM: () => require("../../assets/bible/kjv/NAM.txt"),
  HAB: () => require("../../assets/bible/kjv/HAB.txt"),
  ZEP: () => require("../../assets/bible/kjv/ZEP.txt"),
  HAG: () => require("../../assets/bible/kjv/HAG.txt"),
  ZEC: () => require("../../assets/bible/kjv/ZEC.txt"),
  MAL: () => require("../../assets/bible/kjv/MAL.txt"),
  MAT: () => require("../../assets/bible/kjv/MAT.txt"),
  MRK: () => require("../../assets/bible/kjv/MRK.txt"),
  LUK: () => require("../../assets/bible/kjv/LUK.txt"),
  JHN: () => require("../../assets/bible/kjv/JHN.txt"),
  ACT: () => require("../../assets/bible/kjv/ACT.txt"),
  ROM: () => require("../../assets/bible/kjv/ROM.txt"),
  "1CO": () => require("../../assets/bible/kjv/1CO.txt"),
  "2CO": () => require("../../assets/bible/kjv/2CO.txt"),
  GAL: () => require("../../assets/bible/kjv/GAL.txt"),
  EPH: () => require("../../assets/bible/kjv/EPH.txt"),
  PHP: () => require("../../assets/bible/kjv/PHP.txt"),
  COL: () => require("../../assets/bible/kjv/COL.txt"),
  "1TH": () => require("../../assets/bible/kjv/1TH.txt"),
  "2TH": () => require("../../assets/bible/kjv/2TH.txt"),
  "1TI": () => require("../../assets/bible/kjv/1TI.txt"),
  "2TI": () => require("../../assets/bible/kjv/2TI.txt"),
  TIT: () => require("../../assets/bible/kjv/TIT.txt"),
  PHM: () => require("../../assets/bible/kjv/PHM.txt"),
  HEB: () => require("../../assets/bible/kjv/HEB.txt"),
  JAS: () => require("../../assets/bible/kjv/JAS.txt"),
  "1PE": () => require("../../assets/bible/kjv/1PE.txt"),
  "2PE": () => require("../../assets/bible/kjv/2PE.txt"),
  "1JN": () => require("../../assets/bible/kjv/1JN.txt"),
  "2JN": () => require("../../assets/bible/kjv/2JN.txt"),
  "3JN": () => require("../../assets/bible/kjv/3JN.txt"),
  JUD: () => require("../../assets/bible/kjv/JUD.txt"),
  REV: () => require("../../assets/bible/kjv/REV.txt"),
};

const ESV = {
  GEN: () => require("../../assets/bible/esv/GEN.txt"),
  EXO: () => require("../../assets/bible/esv/EXO.txt"),
  LEV: () => require("../../assets/bible/esv/LEV.txt"),
  NUM: () => require("../../assets/bible/esv/NUM.txt"),
  DEU: () => require("../../assets/bible/esv/DEU.txt"),
  JOS: () => require("../../assets/bible/esv/JOS.txt"),
  JDG: () => require("../../assets/bible/esv/JDG.txt"),
  RUT: () => require("../../assets/bible/esv/RUT.txt"),
  "1SA": () => require("../../assets/bible/esv/1SA.txt"),
  "2SA": () => require("../../assets/bible/esv/2SA.txt"),
  "1KI": () => require("../../assets/bible/esv/1KI.txt"),
  "2KI": () => require("../../assets/bible/esv/2KI.txt"),
  "1CH": () => require("../../assets/bible/esv/1CH.txt"),
  "2CH": () => require("../../assets/bible/esv/2CH.txt"),
  EZR: () => require("../../assets/bible/esv/EZR.txt"),
  NEH: () => require("../../assets/bible/esv/NEH.txt"),
  EST: () => require("../../assets/bible/esv/EST.txt"),
  JOB: () => require("../../assets/bible/esv/JOB.txt"),
  PSA: () => require("../../assets/bible/esv/PSA.txt"),
  PRO: () => require("../../assets/bible/esv/PRO.txt"),
  ECC: () => require("../../assets/bible/esv/ECC.txt"),
  SNG: () => require("../../assets/bible/esv/SNG.txt"),
  ISA: () => require("../../assets/bible/esv/ISA.txt"),
  JER: () => require("../../assets/bible/esv/JER.txt"),
  LAM: () => require("../../assets/bible/esv/LAM.txt"),
  EZK: () => require("../../assets/bible/esv/EZK.txt"),
  DAN: () => require("../../assets/bible/esv/DAN.txt"),
  HOS: () => require("../../assets/bible/esv/HOS.txt"),
  JOL: () => require("../../assets/bible/esv/JOL.txt"),
  AMO: () => require("../../assets/bible/esv/AMO.txt"),
  OBA: () => require("../../assets/bible/esv/OBA.txt"),
  JON: () => require("../../assets/bible/esv/JON.txt"),
  MIC: () => require("../../assets/bible/esv/MIC.txt"),
  NAM: () => require("../../assets/bible/esv/NAM.txt"),
  HAB: () => require("../../assets/bible/esv/HAB.txt"),
  ZEP: () => require("../../assets/bible/esv/ZEP.txt"),
  HAG: () => require("../../assets/bible/esv/HAG.txt"),
  ZEC: () => require("../../assets/bible/esv/ZEC.txt"),
  MAL: () => require("../../assets/bible/esv/MAL.txt"),
  MAT: () => require("../../assets/bible/esv/MAT.txt"),
  MRK: () => require("../../assets/bible/esv/MRK.txt"),
  LUK: () => require("../../assets/bible/esv/LUK.txt"),
  JHN: () => require("../../assets/bible/esv/JHN.txt"),
  ACT: () => require("../../assets/bible/esv/ACT.txt"),
  ROM: () => require("../../assets/bible/esv/ROM.txt"),
  "1CO": () => require("../../assets/bible/esv/1CO.txt"),
  "2CO": () => require("../../assets/bible/esv/2CO.txt"),
  GAL: () => require("../../assets/bible/esv/GAL.txt"),
  EPH: () => require("../../assets/bible/esv/EPH.txt"),
  PHP: () => require("../../assets/bible/esv/PHP.txt"),
  COL: () => require("../../assets/bible/esv/COL.txt"),
  "1TH": () => require("../../assets/bible/esv/1TH.txt"),
  "2TH": () => require("../../assets/bible/esv/2TH.txt"),
  "1TI": () => require("../../assets/bible/esv/1TI.txt"),
  "2TI": () => require("../../assets/bible/esv/2TI.txt"),
  TIT: () => require("../../assets/bible/esv/TIT.txt"),
  PHM: () => require("../../assets/bible/esv/PHM.txt"),
  HEB: () => require("../../assets/bible/esv/HEB.txt"),
  JAS: () => require("../../assets/bible/esv/JAS.txt"),
  "1PE": () => require("../../assets/bible/esv/1PE.txt"),
  "2PE": () => require("../../assets/bible/esv/2PE.txt"),
  "1JN": () => require("../../assets/bible/esv/1JN.txt"),
  "2JN": () => require("../../assets/bible/esv/2JN.txt"),
  "3JN": () => require("../../assets/bible/esv/3JN.txt"),
  JUD: () => require("../../assets/bible/esv/JUD.txt"),
  REV: () => require("../../assets/bible/esv/REV.txt"),
};

const LOADERS = { niv: NIV, kjv: KJV, esv: ESV };

// Parsed books and chapter indexes are keyed by translation and book.
const cache = new Map();
const inFlight = new Map();
const chapterIndexes = new Map();
const pins = new Map();
let retainedKeys = null;

function keyFor(bookId, version) {
  return `${version}:${bookId}`;
}

function resolvedVersion(version) {
  const id = resolveVersion(version);
  return id in LOADERS ? id : "niv";
}

function shouldKeep(key) {
  return retainedKeys?.has(key) || (pins.get(key) ?? 0) > 0;
}

function prune() {
  for (const key of cache.keys()) {
    if (!shouldKeep(key)) {
      cache.delete(key);
      chapterIndexes.delete(key);
    }
  }
}

/** Keep parsed books only while an open tab uses that translation. */
export function retainBibleBooks(bookIds, version = "niv") {
  const resolved = resolvedVersion(version);
  retainedKeys = new Set(bookIds.map((id) => keyFor(id, resolved)));
  prune();
}

/** Keep a book available for a mounted reader or memory picker. */
export function pinBibleBook(bookId, version = "niv") {
  const key = keyFor(bookId, resolvedVersion(version));
  pins.set(key, (pins.get(key) ?? 0) + 1);
  return () => {
    const next = (pins.get(key) ?? 1) - 1;
    if (next > 0) pins.set(key, next);
    else pins.delete(key);
    prune();
  };
}

/** Load an offline book asset. Concurrent requests share the same parse. */
export async function loadBibleBook(bookId, version = "niv") {
  const resolved = resolvedVersion(version);
  const moduleForBook = LOADERS[resolved]?.[bookId];
  if (!moduleForBook || !BOOK_IDS.includes(bookId)) return null;
  const key = keyFor(bookId, resolved);
  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const task = (async () => {
    const asset = Asset.fromModule(moduleForBook());
    const text = Platform.OS === "web"
      ? await (await fetch(asset.uri)).text()
      : await new File((await asset.downloadAsync()).localUri).text();
    return JSON.parse(text);
  })();
  inFlight.set(key, task);
  try {
    const book = await task;
    if (shouldKeep(key)) cache.set(key, book);
    return book;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Return a parsed book only if it is currently retained in memory.
 */
export function getCachedBibleBook(bookId, version = "niv") {
  return cache.get(keyFor(bookId, resolvedVersion(version))) ?? null;
}

/**
 * Returns already loaded books for a version. Call loadBibleBook first when
 * the requested book may not be in the cache.
 */
export function getBookMap(version = "niv") {
  const resolved = resolvedVersion(version);
  return new Proxy({}, {
    get(_, bookId) {
      return getCachedBibleBook(bookId, resolved);
    },
    has(_, bookId) {
      return BOOK_IDS.includes(bookId);
    },
  });
}

// Built lazily per retained book, then discarded with that book.
function getChapterIndex(bookId, resolved) {
  const key = keyFor(bookId, resolved);
  if (!chapterIndexes.has(key)) {
    const book = getCachedBibleBook(bookId, resolved);
    if (!book) return null;
    const index = {};
    for (const c of book.chapters) {
      index[Number(c.chapter)] = c;
    }
    chapterIndexes.set(key, index);
  }
  return chapterIndexes.get(key);
}

/**
 * A chapter record for a book in a given version. `version` is optional and
 * falls back to NIV. Shape is identical across versions so callers/renderers
 * don't change.
 *
 * Lookup is O(1) — a chapter index map is built on first access per book and
 * cached while the book is retained. Previously used Array.find() which
 * was O(n) over all chapters (up to 150 for Psalms).
 */
export function getChapter(bookId, chapterNumber, version = "niv") {
  const resolved = resolvedVersion(version);
  const index = getChapterIndex(bookId, resolved);
  if (!index) return null;
  return index[Number(chapterNumber)] || null;
}

// Back-compat exports. BIBLE_DATA and BIBLE_DATA_BY_VERSION are kept so any
// future direct accesses don't break. They expose loaded books only.
export const BIBLE_DATA_BY_VERSION = new Proxy({}, {
  get(_, version) {
    if (!(version in LOADERS)) return undefined;
    return getBookMap(version);
  },
});

export const BIBLE_DATA = getBookMap("niv");
