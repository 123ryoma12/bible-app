// Statically bundled Bible text data, keyed by 3-letter book id, grouped by
// translation. Metro requires static import paths, so every book is imported
// explicitly here.
//
// Only NIV ships with text today (assets/bible/niv/*). ESV and KJV are declared
// as "coming soon" in bibleVersions.js. To add one later: drop its files under
// assets/bible/<id>/, import them here (same pattern as NIV), and add the map
// to BIBLE_DATA_BY_VERSION below - no call sites change.
import b_GEN from "../../assets/bible/niv/GEN.json";
import b_EXO from "../../assets/bible/niv/EXO.json";
import b_LEV from "../../assets/bible/niv/LEV.json";
import b_NUM from "../../assets/bible/niv/NUM.json";
import b_DEU from "../../assets/bible/niv/DEU.json";
import b_JOS from "../../assets/bible/niv/JOS.json";
import b_JDG from "../../assets/bible/niv/JDG.json";
import b_RUT from "../../assets/bible/niv/RUT.json";
import b_1SA from "../../assets/bible/niv/1SA.json";
import b_2SA from "../../assets/bible/niv/2SA.json";
import b_1KI from "../../assets/bible/niv/1KI.json";
import b_2KI from "../../assets/bible/niv/2KI.json";
import b_1CH from "../../assets/bible/niv/1CH.json";
import b_2CH from "../../assets/bible/niv/2CH.json";
import b_EZR from "../../assets/bible/niv/EZR.json";
import b_NEH from "../../assets/bible/niv/NEH.json";
import b_EST from "../../assets/bible/niv/EST.json";
import b_JOB from "../../assets/bible/niv/JOB.json";
import b_PSA from "../../assets/bible/niv/PSA.json";
import b_PRO from "../../assets/bible/niv/PRO.json";
import b_ECC from "../../assets/bible/niv/ECC.json";
import b_SNG from "../../assets/bible/niv/SNG.json";
import b_ISA from "../../assets/bible/niv/ISA.json";
import b_JER from "../../assets/bible/niv/JER.json";
import b_LAM from "../../assets/bible/niv/LAM.json";
import b_EZK from "../../assets/bible/niv/EZK.json";
import b_DAN from "../../assets/bible/niv/DAN.json";
import b_HOS from "../../assets/bible/niv/HOS.json";
import b_JOL from "../../assets/bible/niv/JOL.json";
import b_AMO from "../../assets/bible/niv/AMO.json";
import b_OBA from "../../assets/bible/niv/OBA.json";
import b_JON from "../../assets/bible/niv/JON.json";
import b_MIC from "../../assets/bible/niv/MIC.json";
import b_NAM from "../../assets/bible/niv/NAM.json";
import b_HAB from "../../assets/bible/niv/HAB.json";
import b_ZEP from "../../assets/bible/niv/ZEP.json";
import b_HAG from "../../assets/bible/niv/HAG.json";
import b_ZEC from "../../assets/bible/niv/ZEC.json";
import b_MAL from "../../assets/bible/niv/MAL.json";
import b_MAT from "../../assets/bible/niv/MAT.json";
import b_MRK from "../../assets/bible/niv/MRK.json";
import b_LUK from "../../assets/bible/niv/LUK.json";
import b_JHN from "../../assets/bible/niv/JHN.json";
import b_ACT from "../../assets/bible/niv/ACT.json";
import b_ROM from "../../assets/bible/niv/ROM.json";
import b_1CO from "../../assets/bible/niv/1CO.json";
import b_2CO from "../../assets/bible/niv/2CO.json";
import b_GAL from "../../assets/bible/niv/GAL.json";
import b_EPH from "../../assets/bible/niv/EPH.json";
import b_PHP from "../../assets/bible/niv/PHP.json";
import b_COL from "../../assets/bible/niv/COL.json";
import b_1TH from "../../assets/bible/niv/1TH.json";
import b_2TH from "../../assets/bible/niv/2TH.json";
import b_1TI from "../../assets/bible/niv/1TI.json";
import b_2TI from "../../assets/bible/niv/2TI.json";
import b_TIT from "../../assets/bible/niv/TIT.json";
import b_PHM from "../../assets/bible/niv/PHM.json";
import b_HEB from "../../assets/bible/niv/HEB.json";
import b_JAS from "../../assets/bible/niv/JAS.json";
import b_1PE from "../../assets/bible/niv/1PE.json";
import b_2PE from "../../assets/bible/niv/2PE.json";
import b_1JN from "../../assets/bible/niv/1JN.json";
import b_2JN from "../../assets/bible/niv/2JN.json";
import b_3JN from "../../assets/bible/niv/3JN.json";
import b_JUD from "../../assets/bible/niv/JUD.json";
import b_REV from "../../assets/bible/niv/REV.json";

import { resolveVersion } from "./bibleVersions";

import k_GEN from "../../assets/bible/kjv/GEN.json";
import k_EXO from "../../assets/bible/kjv/EXO.json";
import k_LEV from "../../assets/bible/kjv/LEV.json";
import k_NUM from "../../assets/bible/kjv/NUM.json";
import k_DEU from "../../assets/bible/kjv/DEU.json";
import k_JOS from "../../assets/bible/kjv/JOS.json";
import k_JDG from "../../assets/bible/kjv/JDG.json";
import k_RUT from "../../assets/bible/kjv/RUT.json";
import k_1SA from "../../assets/bible/kjv/1SA.json";
import k_2SA from "../../assets/bible/kjv/2SA.json";
import k_1KI from "../../assets/bible/kjv/1KI.json";
import k_2KI from "../../assets/bible/kjv/2KI.json";
import k_1CH from "../../assets/bible/kjv/1CH.json";
import k_2CH from "../../assets/bible/kjv/2CH.json";
import k_EZR from "../../assets/bible/kjv/EZR.json";
import k_NEH from "../../assets/bible/kjv/NEH.json";
import k_EST from "../../assets/bible/kjv/EST.json";
import k_JOB from "../../assets/bible/kjv/JOB.json";
import k_PSA from "../../assets/bible/kjv/PSA.json";
import k_PRO from "../../assets/bible/kjv/PRO.json";
import k_ECC from "../../assets/bible/kjv/ECC.json";
import k_SNG from "../../assets/bible/kjv/SNG.json";
import k_ISA from "../../assets/bible/kjv/ISA.json";
import k_JER from "../../assets/bible/kjv/JER.json";
import k_LAM from "../../assets/bible/kjv/LAM.json";
import k_EZK from "../../assets/bible/kjv/EZK.json";
import k_DAN from "../../assets/bible/kjv/DAN.json";
import k_HOS from "../../assets/bible/kjv/HOS.json";
import k_JOL from "../../assets/bible/kjv/JOL.json";
import k_AMO from "../../assets/bible/kjv/AMO.json";
import k_OBA from "../../assets/bible/kjv/OBA.json";
import k_JON from "../../assets/bible/kjv/JON.json";
import k_MIC from "../../assets/bible/kjv/MIC.json";
import k_NAM from "../../assets/bible/kjv/NAM.json";
import k_HAB from "../../assets/bible/kjv/HAB.json";
import k_ZEP from "../../assets/bible/kjv/ZEP.json";
import k_HAG from "../../assets/bible/kjv/HAG.json";
import k_ZEC from "../../assets/bible/kjv/ZEC.json";
import k_MAL from "../../assets/bible/kjv/MAL.json";
import k_MAT from "../../assets/bible/kjv/MAT.json";
import k_MRK from "../../assets/bible/kjv/MRK.json";
import k_LUK from "../../assets/bible/kjv/LUK.json";
import k_JHN from "../../assets/bible/kjv/JHN.json";
import k_ACT from "../../assets/bible/kjv/ACT.json";
import k_ROM from "../../assets/bible/kjv/ROM.json";
import k_1CO from "../../assets/bible/kjv/1CO.json";
import k_2CO from "../../assets/bible/kjv/2CO.json";
import k_GAL from "../../assets/bible/kjv/GAL.json";
import k_EPH from "../../assets/bible/kjv/EPH.json";
import k_PHP from "../../assets/bible/kjv/PHP.json";
import k_COL from "../../assets/bible/kjv/COL.json";
import k_1TH from "../../assets/bible/kjv/1TH.json";
import k_2TH from "../../assets/bible/kjv/2TH.json";
import k_1TI from "../../assets/bible/kjv/1TI.json";
import k_2TI from "../../assets/bible/kjv/2TI.json";
import k_TIT from "../../assets/bible/kjv/TIT.json";
import k_PHM from "../../assets/bible/kjv/PHM.json";
import k_HEB from "../../assets/bible/kjv/HEB.json";
import k_JAS from "../../assets/bible/kjv/JAS.json";
import k_1PE from "../../assets/bible/kjv/1PE.json";
import k_2PE from "../../assets/bible/kjv/2PE.json";
import k_1JN from "../../assets/bible/kjv/1JN.json";
import k_2JN from "../../assets/bible/kjv/2JN.json";
import k_3JN from "../../assets/bible/kjv/3JN.json";
import k_JUD from "../../assets/bible/kjv/JUD.json";
import k_REV from "../../assets/bible/kjv/REV.json";

import e_GEN from "../../assets/bible/esv/GEN.json";
import e_EXO from "../../assets/bible/esv/EXO.json";
import e_LEV from "../../assets/bible/esv/LEV.json";
import e_NUM from "../../assets/bible/esv/NUM.json";
import e_DEU from "../../assets/bible/esv/DEU.json";
import e_JOS from "../../assets/bible/esv/JOS.json";
import e_JDG from "../../assets/bible/esv/JDG.json";
import e_RUT from "../../assets/bible/esv/RUT.json";
import e_1SA from "../../assets/bible/esv/1SA.json";
import e_2SA from "../../assets/bible/esv/2SA.json";
import e_1KI from "../../assets/bible/esv/1KI.json";
import e_2KI from "../../assets/bible/esv/2KI.json";
import e_1CH from "../../assets/bible/esv/1CH.json";
import e_2CH from "../../assets/bible/esv/2CH.json";
import e_EZR from "../../assets/bible/esv/EZR.json";
import e_NEH from "../../assets/bible/esv/NEH.json";
import e_EST from "../../assets/bible/esv/EST.json";
import e_JOB from "../../assets/bible/esv/JOB.json";
import e_PSA from "../../assets/bible/esv/PSA.json";
import e_PRO from "../../assets/bible/esv/PRO.json";
import e_ECC from "../../assets/bible/esv/ECC.json";
import e_SNG from "../../assets/bible/esv/SNG.json";
import e_ISA from "../../assets/bible/esv/ISA.json";
import e_JER from "../../assets/bible/esv/JER.json";
import e_LAM from "../../assets/bible/esv/LAM.json";
import e_EZK from "../../assets/bible/esv/EZK.json";
import e_DAN from "../../assets/bible/esv/DAN.json";
import e_HOS from "../../assets/bible/esv/HOS.json";
import e_JOL from "../../assets/bible/esv/JOL.json";
import e_AMO from "../../assets/bible/esv/AMO.json";
import e_OBA from "../../assets/bible/esv/OBA.json";
import e_JON from "../../assets/bible/esv/JON.json";
import e_MIC from "../../assets/bible/esv/MIC.json";
import e_NAM from "../../assets/bible/esv/NAM.json";
import e_HAB from "../../assets/bible/esv/HAB.json";
import e_ZEP from "../../assets/bible/esv/ZEP.json";
import e_HAG from "../../assets/bible/esv/HAG.json";
import e_ZEC from "../../assets/bible/esv/ZEC.json";
import e_MAL from "../../assets/bible/esv/MAL.json";
import e_MAT from "../../assets/bible/esv/MAT.json";
import e_MRK from "../../assets/bible/esv/MRK.json";
import e_LUK from "../../assets/bible/esv/LUK.json";
import e_JHN from "../../assets/bible/esv/JHN.json";
import e_ACT from "../../assets/bible/esv/ACT.json";
import e_ROM from "../../assets/bible/esv/ROM.json";
import e_1CO from "../../assets/bible/esv/1CO.json";
import e_2CO from "../../assets/bible/esv/2CO.json";
import e_GAL from "../../assets/bible/esv/GAL.json";
import e_EPH from "../../assets/bible/esv/EPH.json";
import e_PHP from "../../assets/bible/esv/PHP.json";
import e_COL from "../../assets/bible/esv/COL.json";
import e_1TH from "../../assets/bible/esv/1TH.json";
import e_2TH from "../../assets/bible/esv/2TH.json";
import e_1TI from "../../assets/bible/esv/1TI.json";
import e_2TI from "../../assets/bible/esv/2TI.json";
import e_TIT from "../../assets/bible/esv/TIT.json";
import e_PHM from "../../assets/bible/esv/PHM.json";
import e_HEB from "../../assets/bible/esv/HEB.json";
import e_JAS from "../../assets/bible/esv/JAS.json";
import e_1PE from "../../assets/bible/esv/1PE.json";
import e_2PE from "../../assets/bible/esv/2PE.json";
import e_1JN from "../../assets/bible/esv/1JN.json";
import e_2JN from "../../assets/bible/esv/2JN.json";
import e_3JN from "../../assets/bible/esv/3JN.json";
import e_JUD from "../../assets/bible/esv/JUD.json";
import e_REV from "../../assets/bible/esv/REV.json";

const NIV_DATA = {
  "GEN": b_GEN,
  "EXO": b_EXO,
  "LEV": b_LEV,
  "NUM": b_NUM,
  "DEU": b_DEU,
  "JOS": b_JOS,
  "JDG": b_JDG,
  "RUT": b_RUT,
  "1SA": b_1SA,
  "2SA": b_2SA,
  "1KI": b_1KI,
  "2KI": b_2KI,
  "1CH": b_1CH,
  "2CH": b_2CH,
  "EZR": b_EZR,
  "NEH": b_NEH,
  "EST": b_EST,
  "JOB": b_JOB,
  "PSA": b_PSA,
  "PRO": b_PRO,
  "ECC": b_ECC,
  "SNG": b_SNG,
  "ISA": b_ISA,
  "JER": b_JER,
  "LAM": b_LAM,
  "EZK": b_EZK,
  "DAN": b_DAN,
  "HOS": b_HOS,
  "JOL": b_JOL,
  "AMO": b_AMO,
  "OBA": b_OBA,
  "JON": b_JON,
  "MIC": b_MIC,
  "NAM": b_NAM,
  "HAB": b_HAB,
  "ZEP": b_ZEP,
  "HAG": b_HAG,
  "ZEC": b_ZEC,
  "MAL": b_MAL,
  "MAT": b_MAT,
  "MRK": b_MRK,
  "LUK": b_LUK,
  "JHN": b_JHN,
  "ACT": b_ACT,
  "ROM": b_ROM,
  "1CO": b_1CO,
  "2CO": b_2CO,
  "GAL": b_GAL,
  "EPH": b_EPH,
  "PHP": b_PHP,
  "COL": b_COL,
  "1TH": b_1TH,
  "2TH": b_2TH,
  "1TI": b_1TI,
  "2TI": b_2TI,
  "TIT": b_TIT,
  "PHM": b_PHM,
  "HEB": b_HEB,
  "JAS": b_JAS,
  "1PE": b_1PE,
  "2PE": b_2PE,
  "1JN": b_1JN,
  "2JN": b_2JN,
  "3JN": b_3JN,
  "JUD": b_JUD,
  "REV": b_REV,
};

const KJV_DATA = {
  "GEN": k_GEN,
  "EXO": k_EXO,
  "LEV": k_LEV,
  "NUM": k_NUM,
  "DEU": k_DEU,
  "JOS": k_JOS,
  "JDG": k_JDG,
  "RUT": k_RUT,
  "1SA": k_1SA,
  "2SA": k_2SA,
  "1KI": k_1KI,
  "2KI": k_2KI,
  "1CH": k_1CH,
  "2CH": k_2CH,
  "EZR": k_EZR,
  "NEH": k_NEH,
  "EST": k_EST,
  "JOB": k_JOB,
  "PSA": k_PSA,
  "PRO": k_PRO,
  "ECC": k_ECC,
  "SNG": k_SNG,
  "ISA": k_ISA,
  "JER": k_JER,
  "LAM": k_LAM,
  "EZK": k_EZK,
  "DAN": k_DAN,
  "HOS": k_HOS,
  "JOL": k_JOL,
  "AMO": k_AMO,
  "OBA": k_OBA,
  "JON": k_JON,
  "MIC": k_MIC,
  "NAM": k_NAM,
  "HAB": k_HAB,
  "ZEP": k_ZEP,
  "HAG": k_HAG,
  "ZEC": k_ZEC,
  "MAL": k_MAL,
  "MAT": k_MAT,
  "MRK": k_MRK,
  "LUK": k_LUK,
  "JHN": k_JHN,
  "ACT": k_ACT,
  "ROM": k_ROM,
  "1CO": k_1CO,
  "2CO": k_2CO,
  "GAL": k_GAL,
  "EPH": k_EPH,
  "PHP": k_PHP,
  "COL": k_COL,
  "1TH": k_1TH,
  "2TH": k_2TH,
  "1TI": k_1TI,
  "2TI": k_2TI,
  "TIT": k_TIT,
  "PHM": k_PHM,
  "HEB": k_HEB,
  "JAS": k_JAS,
  "1PE": k_1PE,
  "2PE": k_2PE,
  "1JN": k_1JN,
  "2JN": k_2JN,
  "3JN": k_3JN,
  "JUD": k_JUD,
  "REV": k_REV,
};

const ESV_DATA = {
  "GEN": e_GEN,
  "EXO": e_EXO,
  "LEV": e_LEV,
  "NUM": e_NUM,
  "DEU": e_DEU,
  "JOS": e_JOS,
  "JDG": e_JDG,
  "RUT": e_RUT,
  "1SA": e_1SA,
  "2SA": e_2SA,
  "1KI": e_1KI,
  "2KI": e_2KI,
  "1CH": e_1CH,
  "2CH": e_2CH,
  "EZR": e_EZR,
  "NEH": e_NEH,
  "EST": e_EST,
  "JOB": e_JOB,
  "PSA": e_PSA,
  "PRO": e_PRO,
  "ECC": e_ECC,
  "SNG": e_SNG,
  "ISA": e_ISA,
  "JER": e_JER,
  "LAM": e_LAM,
  "EZK": e_EZK,
  "DAN": e_DAN,
  "HOS": e_HOS,
  "JOL": e_JOL,
  "AMO": e_AMO,
  "OBA": e_OBA,
  "JON": e_JON,
  "MIC": e_MIC,
  "NAM": e_NAM,
  "HAB": e_HAB,
  "ZEP": e_ZEP,
  "HAG": e_HAG,
  "ZEC": e_ZEC,
  "MAL": e_MAL,
  "MAT": e_MAT,
  "MRK": e_MRK,
  "LUK": e_LUK,
  "JHN": e_JHN,
  "ACT": e_ACT,
  "ROM": e_ROM,
  "1CO": e_1CO,
  "2CO": e_2CO,
  "GAL": e_GAL,
  "EPH": e_EPH,
  "PHP": e_PHP,
  "COL": e_COL,
  "1TH": e_1TH,
  "2TH": e_2TH,
  "1TI": e_1TI,
  "2TI": e_2TI,
  "TIT": e_TIT,
  "PHM": e_PHM,
  "HEB": e_HEB,
  "JAS": e_JAS,
  "1PE": e_1PE,
  "2PE": e_2PE,
  "1JN": e_1JN,
  "2JN": e_2JN,
  "3JN": e_3JN,
  "JUD": e_JUD,
  "REV": e_REV,
};

// Per-version book maps. NIV, KJV and ESV all ship with text. Consumers go
// through getBookMap()/getChapter() so an unknown/unbundled version safely
// falls back to NIV rather than rendering nothing.
export const BIBLE_DATA_BY_VERSION = {
  niv: NIV_DATA,
  kjv: KJV_DATA,
  esv: ESV_DATA,
};

// Back-compat: the original NIV-only map. Existing imports of BIBLE_DATA keep
// working and always resolve to NIV.
export const BIBLE_DATA = NIV_DATA;

/**
 * The { bookId -> book } map for a version, falling back to NIV when the
 * requested version isn't bundled yet. `version` defaults to NIV.
 */
export function getBookMap(version = "niv") {
  const resolved = resolveVersion(version);
  return BIBLE_DATA_BY_VERSION[resolved] || NIV_DATA;
}

/**
 * A chapter record for a book in a given version. `version` is optional and
 * falls back to NIV. Shape is identical across versions so callers/renderers
 * don't change.
 */
export function getChapter(bookId, chapterNumber, version = "niv") {
  const book = getBookMap(version)[bookId];
  if (!book) return null;
  return book.chapters.find((c) => Number(c.chapter) === Number(chapterNumber)) || null;
}
