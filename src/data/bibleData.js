// Lazy Bible text loader.
//
// Previously all 66 book JSON files (×3 translations = ~30 MB) were statically
// imported at the top of this module, which caused them to be parsed and held
// in memory from app startup — long before any chapter was ever opened.
//
// Now each book is loaded on first access via require() and cached in a plain
// object. Metro still bundles all the JSON files (they are present in the
// assets/bible/ tree) so they are available offline, but the JS engine only
// parses and allocates each book when it is actually needed.
//
// To add a new translation later: drop its files under assets/bible/<id>/,
// add its version key to LOADERS below, and register it in bibleVersions.js —
// no call sites change.

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

// Static require() maps per version. Metro requires fully static require()
// calls at bundle time — no dynamic template literals. Each book is listed
// explicitly so the bundler can resolve every module statically.
const NIV = {
  GEN: () => require("../../assets/bible/niv/GEN.json"),
  EXO: () => require("../../assets/bible/niv/EXO.json"),
  LEV: () => require("../../assets/bible/niv/LEV.json"),
  NUM: () => require("../../assets/bible/niv/NUM.json"),
  DEU: () => require("../../assets/bible/niv/DEU.json"),
  JOS: () => require("../../assets/bible/niv/JOS.json"),
  JDG: () => require("../../assets/bible/niv/JDG.json"),
  RUT: () => require("../../assets/bible/niv/RUT.json"),
  "1SA": () => require("../../assets/bible/niv/1SA.json"),
  "2SA": () => require("../../assets/bible/niv/2SA.json"),
  "1KI": () => require("../../assets/bible/niv/1KI.json"),
  "2KI": () => require("../../assets/bible/niv/2KI.json"),
  "1CH": () => require("../../assets/bible/niv/1CH.json"),
  "2CH": () => require("../../assets/bible/niv/2CH.json"),
  EZR: () => require("../../assets/bible/niv/EZR.json"),
  NEH: () => require("../../assets/bible/niv/NEH.json"),
  EST: () => require("../../assets/bible/niv/EST.json"),
  JOB: () => require("../../assets/bible/niv/JOB.json"),
  PSA: () => require("../../assets/bible/niv/PSA.json"),
  PRO: () => require("../../assets/bible/niv/PRO.json"),
  ECC: () => require("../../assets/bible/niv/ECC.json"),
  SNG: () => require("../../assets/bible/niv/SNG.json"),
  ISA: () => require("../../assets/bible/niv/ISA.json"),
  JER: () => require("../../assets/bible/niv/JER.json"),
  LAM: () => require("../../assets/bible/niv/LAM.json"),
  EZK: () => require("../../assets/bible/niv/EZK.json"),
  DAN: () => require("../../assets/bible/niv/DAN.json"),
  HOS: () => require("../../assets/bible/niv/HOS.json"),
  JOL: () => require("../../assets/bible/niv/JOL.json"),
  AMO: () => require("../../assets/bible/niv/AMO.json"),
  OBA: () => require("../../assets/bible/niv/OBA.json"),
  JON: () => require("../../assets/bible/niv/JON.json"),
  MIC: () => require("../../assets/bible/niv/MIC.json"),
  NAM: () => require("../../assets/bible/niv/NAM.json"),
  HAB: () => require("../../assets/bible/niv/HAB.json"),
  ZEP: () => require("../../assets/bible/niv/ZEP.json"),
  HAG: () => require("../../assets/bible/niv/HAG.json"),
  ZEC: () => require("../../assets/bible/niv/ZEC.json"),
  MAL: () => require("../../assets/bible/niv/MAL.json"),
  MAT: () => require("../../assets/bible/niv/MAT.json"),
  MRK: () => require("../../assets/bible/niv/MRK.json"),
  LUK: () => require("../../assets/bible/niv/LUK.json"),
  JHN: () => require("../../assets/bible/niv/JHN.json"),
  ACT: () => require("../../assets/bible/niv/ACT.json"),
  ROM: () => require("../../assets/bible/niv/ROM.json"),
  "1CO": () => require("../../assets/bible/niv/1CO.json"),
  "2CO": () => require("../../assets/bible/niv/2CO.json"),
  GAL: () => require("../../assets/bible/niv/GAL.json"),
  EPH: () => require("../../assets/bible/niv/EPH.json"),
  PHP: () => require("../../assets/bible/niv/PHP.json"),
  COL: () => require("../../assets/bible/niv/COL.json"),
  "1TH": () => require("../../assets/bible/niv/1TH.json"),
  "2TH": () => require("../../assets/bible/niv/2TH.json"),
  "1TI": () => require("../../assets/bible/niv/1TI.json"),
  "2TI": () => require("../../assets/bible/niv/2TI.json"),
  TIT: () => require("../../assets/bible/niv/TIT.json"),
  PHM: () => require("../../assets/bible/niv/PHM.json"),
  HEB: () => require("../../assets/bible/niv/HEB.json"),
  JAS: () => require("../../assets/bible/niv/JAS.json"),
  "1PE": () => require("../../assets/bible/niv/1PE.json"),
  "2PE": () => require("../../assets/bible/niv/2PE.json"),
  "1JN": () => require("../../assets/bible/niv/1JN.json"),
  "2JN": () => require("../../assets/bible/niv/2JN.json"),
  "3JN": () => require("../../assets/bible/niv/3JN.json"),
  JUD: () => require("../../assets/bible/niv/JUD.json"),
  REV: () => require("../../assets/bible/niv/REV.json"),
};

const KJV = {
  GEN: () => require("../../assets/bible/kjv/GEN.json"),
  EXO: () => require("../../assets/bible/kjv/EXO.json"),
  LEV: () => require("../../assets/bible/kjv/LEV.json"),
  NUM: () => require("../../assets/bible/kjv/NUM.json"),
  DEU: () => require("../../assets/bible/kjv/DEU.json"),
  JOS: () => require("../../assets/bible/kjv/JOS.json"),
  JDG: () => require("../../assets/bible/kjv/JDG.json"),
  RUT: () => require("../../assets/bible/kjv/RUT.json"),
  "1SA": () => require("../../assets/bible/kjv/1SA.json"),
  "2SA": () => require("../../assets/bible/kjv/2SA.json"),
  "1KI": () => require("../../assets/bible/kjv/1KI.json"),
  "2KI": () => require("../../assets/bible/kjv/2KI.json"),
  "1CH": () => require("../../assets/bible/kjv/1CH.json"),
  "2CH": () => require("../../assets/bible/kjv/2CH.json"),
  EZR: () => require("../../assets/bible/kjv/EZR.json"),
  NEH: () => require("../../assets/bible/kjv/NEH.json"),
  EST: () => require("../../assets/bible/kjv/EST.json"),
  JOB: () => require("../../assets/bible/kjv/JOB.json"),
  PSA: () => require("../../assets/bible/kjv/PSA.json"),
  PRO: () => require("../../assets/bible/kjv/PRO.json"),
  ECC: () => require("../../assets/bible/kjv/ECC.json"),
  SNG: () => require("../../assets/bible/kjv/SNG.json"),
  ISA: () => require("../../assets/bible/kjv/ISA.json"),
  JER: () => require("../../assets/bible/kjv/JER.json"),
  LAM: () => require("../../assets/bible/kjv/LAM.json"),
  EZK: () => require("../../assets/bible/kjv/EZK.json"),
  DAN: () => require("../../assets/bible/kjv/DAN.json"),
  HOS: () => require("../../assets/bible/kjv/HOS.json"),
  JOL: () => require("../../assets/bible/kjv/JOL.json"),
  AMO: () => require("../../assets/bible/kjv/AMO.json"),
  OBA: () => require("../../assets/bible/kjv/OBA.json"),
  JON: () => require("../../assets/bible/kjv/JON.json"),
  MIC: () => require("../../assets/bible/kjv/MIC.json"),
  NAM: () => require("../../assets/bible/kjv/NAM.json"),
  HAB: () => require("../../assets/bible/kjv/HAB.json"),
  ZEP: () => require("../../assets/bible/kjv/ZEP.json"),
  HAG: () => require("../../assets/bible/kjv/HAG.json"),
  ZEC: () => require("../../assets/bible/kjv/ZEC.json"),
  MAL: () => require("../../assets/bible/kjv/MAL.json"),
  MAT: () => require("../../assets/bible/kjv/MAT.json"),
  MRK: () => require("../../assets/bible/kjv/MRK.json"),
  LUK: () => require("../../assets/bible/kjv/LUK.json"),
  JHN: () => require("../../assets/bible/kjv/JHN.json"),
  ACT: () => require("../../assets/bible/kjv/ACT.json"),
  ROM: () => require("../../assets/bible/kjv/ROM.json"),
  "1CO": () => require("../../assets/bible/kjv/1CO.json"),
  "2CO": () => require("../../assets/bible/kjv/2CO.json"),
  GAL: () => require("../../assets/bible/kjv/GAL.json"),
  EPH: () => require("../../assets/bible/kjv/EPH.json"),
  PHP: () => require("../../assets/bible/kjv/PHP.json"),
  COL: () => require("../../assets/bible/kjv/COL.json"),
  "1TH": () => require("../../assets/bible/kjv/1TH.json"),
  "2TH": () => require("../../assets/bible/kjv/2TH.json"),
  "1TI": () => require("../../assets/bible/kjv/1TI.json"),
  "2TI": () => require("../../assets/bible/kjv/2TI.json"),
  TIT: () => require("../../assets/bible/kjv/TIT.json"),
  PHM: () => require("../../assets/bible/kjv/PHM.json"),
  HEB: () => require("../../assets/bible/kjv/HEB.json"),
  JAS: () => require("../../assets/bible/kjv/JAS.json"),
  "1PE": () => require("../../assets/bible/kjv/1PE.json"),
  "2PE": () => require("../../assets/bible/kjv/2PE.json"),
  "1JN": () => require("../../assets/bible/kjv/1JN.json"),
  "2JN": () => require("../../assets/bible/kjv/2JN.json"),
  "3JN": () => require("../../assets/bible/kjv/3JN.json"),
  JUD: () => require("../../assets/bible/kjv/JUD.json"),
  REV: () => require("../../assets/bible/kjv/REV.json"),
};

const ESV = {
  GEN: () => require("../../assets/bible/esv/GEN.json"),
  EXO: () => require("../../assets/bible/esv/EXO.json"),
  LEV: () => require("../../assets/bible/esv/LEV.json"),
  NUM: () => require("../../assets/bible/esv/NUM.json"),
  DEU: () => require("../../assets/bible/esv/DEU.json"),
  JOS: () => require("../../assets/bible/esv/JOS.json"),
  JDG: () => require("../../assets/bible/esv/JDG.json"),
  RUT: () => require("../../assets/bible/esv/RUT.json"),
  "1SA": () => require("../../assets/bible/esv/1SA.json"),
  "2SA": () => require("../../assets/bible/esv/2SA.json"),
  "1KI": () => require("../../assets/bible/esv/1KI.json"),
  "2KI": () => require("../../assets/bible/esv/2KI.json"),
  "1CH": () => require("../../assets/bible/esv/1CH.json"),
  "2CH": () => require("../../assets/bible/esv/2CH.json"),
  EZR: () => require("../../assets/bible/esv/EZR.json"),
  NEH: () => require("../../assets/bible/esv/NEH.json"),
  EST: () => require("../../assets/bible/esv/EST.json"),
  JOB: () => require("../../assets/bible/esv/JOB.json"),
  PSA: () => require("../../assets/bible/esv/PSA.json"),
  PRO: () => require("../../assets/bible/esv/PRO.json"),
  ECC: () => require("../../assets/bible/esv/ECC.json"),
  SNG: () => require("../../assets/bible/esv/SNG.json"),
  ISA: () => require("../../assets/bible/esv/ISA.json"),
  JER: () => require("../../assets/bible/esv/JER.json"),
  LAM: () => require("../../assets/bible/esv/LAM.json"),
  EZK: () => require("../../assets/bible/esv/EZK.json"),
  DAN: () => require("../../assets/bible/esv/DAN.json"),
  HOS: () => require("../../assets/bible/esv/HOS.json"),
  JOL: () => require("../../assets/bible/esv/JOL.json"),
  AMO: () => require("../../assets/bible/esv/AMO.json"),
  OBA: () => require("../../assets/bible/esv/OBA.json"),
  JON: () => require("../../assets/bible/esv/JON.json"),
  MIC: () => require("../../assets/bible/esv/MIC.json"),
  NAM: () => require("../../assets/bible/esv/NAM.json"),
  HAB: () => require("../../assets/bible/esv/HAB.json"),
  ZEP: () => require("../../assets/bible/esv/ZEP.json"),
  HAG: () => require("../../assets/bible/esv/HAG.json"),
  ZEC: () => require("../../assets/bible/esv/ZEC.json"),
  MAL: () => require("../../assets/bible/esv/MAL.json"),
  MAT: () => require("../../assets/bible/esv/MAT.json"),
  MRK: () => require("../../assets/bible/esv/MRK.json"),
  LUK: () => require("../../assets/bible/esv/LUK.json"),
  JHN: () => require("../../assets/bible/esv/JHN.json"),
  ACT: () => require("../../assets/bible/esv/ACT.json"),
  ROM: () => require("../../assets/bible/esv/ROM.json"),
  "1CO": () => require("../../assets/bible/esv/1CO.json"),
  "2CO": () => require("../../assets/bible/esv/2CO.json"),
  GAL: () => require("../../assets/bible/esv/GAL.json"),
  EPH: () => require("../../assets/bible/esv/EPH.json"),
  PHP: () => require("../../assets/bible/esv/PHP.json"),
  COL: () => require("../../assets/bible/esv/COL.json"),
  "1TH": () => require("../../assets/bible/esv/1TH.json"),
  "2TH": () => require("../../assets/bible/esv/2TH.json"),
  "1TI": () => require("../../assets/bible/esv/1TI.json"),
  "2TI": () => require("../../assets/bible/esv/2TI.json"),
  TIT: () => require("../../assets/bible/esv/TIT.json"),
  PHM: () => require("../../assets/bible/esv/PHM.json"),
  HEB: () => require("../../assets/bible/esv/HEB.json"),
  JAS: () => require("../../assets/bible/esv/JAS.json"),
  "1PE": () => require("../../assets/bible/esv/1PE.json"),
  "2PE": () => require("../../assets/bible/esv/2PE.json"),
  "1JN": () => require("../../assets/bible/esv/1JN.json"),
  "2JN": () => require("../../assets/bible/esv/2JN.json"),
  "3JN": () => require("../../assets/bible/esv/3JN.json"),
  JUD: () => require("../../assets/bible/esv/JUD.json"),
  REV: () => require("../../assets/bible/esv/REV.json"),
};

const LOADERS = { niv: NIV, kjv: KJV, esv: ESV };

// Per-version in-memory cache: { version -> { bookId -> bookData } }
const _cache = {};

/**
 * Returns the book data for bookId+version, loading it on first access.
 * Returns null for unknown version/bookId combinations.
 */
function loadBook(bookId, version) {
  if (!LOADERS[version] || !BOOK_IDS.includes(bookId)) return null;
  if (!_cache[version]) _cache[version] = {};
  if (!_cache[version][bookId]) {
    _cache[version][bookId] = LOADERS[version][bookId]();
  }
  return _cache[version][bookId];
}

/**
 * Returns a { bookId -> book } proxy for a version. Property accesses trigger
 * lazy loading of individual books. Falls back to NIV for unknown versions.
 * The proxy is created fresh per call but the underlying cache is shared, so
 * books are only ever loaded once per session.
 */
export function getBookMap(version = "niv") {
  const resolved = resolveVersion(version) in LOADERS ? resolveVersion(version) : "niv";
  return new Proxy({}, {
    get(_, bookId) {
      return loadBook(bookId, resolved);
    },
    has(_, bookId) {
      return BOOK_IDS.includes(bookId);
    },
  });
}

/**
 * A chapter record for a book in a given version. `version` is optional and
 * falls back to NIV. Shape is identical across versions so callers/renderers
 * don't change.
 */
export function getChapter(bookId, chapterNumber, version = "niv") {
  const resolved = resolveVersion(version) in LOADERS ? resolveVersion(version) : "niv";
  const book = loadBook(bookId, resolved);
  if (!book) return null;
  return book.chapters.find((c) => Number(c.chapter) === Number(chapterNumber)) || null;
}

// Back-compat exports. BIBLE_DATA and BIBLE_DATA_BY_VERSION are kept so any
// future direct accesses don't break, but they also go through lazy loading.
export const BIBLE_DATA_BY_VERSION = new Proxy({}, {
  get(_, version) {
    if (!(version in LOADERS)) return undefined;
    return getBookMap(version);
  },
});

export const BIBLE_DATA = getBookMap("niv");
