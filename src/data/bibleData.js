// Statically bundled Bible text data (NIV), keyed by 3-letter book id.
// Metro requires static import paths, so every book is imported explicitly here.
import b_GEN from "../../assets/bible/GEN.json";
import b_EXO from "../../assets/bible/EXO.json";
import b_LEV from "../../assets/bible/LEV.json";
import b_NUM from "../../assets/bible/NUM.json";
import b_DEU from "../../assets/bible/DEU.json";
import b_JOS from "../../assets/bible/JOS.json";
import b_JDG from "../../assets/bible/JDG.json";
import b_RUT from "../../assets/bible/RUT.json";
import b_1SA from "../../assets/bible/1SA.json";
import b_2SA from "../../assets/bible/2SA.json";
import b_1KI from "../../assets/bible/1KI.json";
import b_2KI from "../../assets/bible/2KI.json";
import b_1CH from "../../assets/bible/1CH.json";
import b_2CH from "../../assets/bible/2CH.json";
import b_EZR from "../../assets/bible/EZR.json";
import b_NEH from "../../assets/bible/NEH.json";
import b_EST from "../../assets/bible/EST.json";
import b_JOB from "../../assets/bible/JOB.json";
import b_PSA from "../../assets/bible/PSA.json";
import b_PRO from "../../assets/bible/PRO.json";
import b_ECC from "../../assets/bible/ECC.json";
import b_SNG from "../../assets/bible/SNG.json";
import b_ISA from "../../assets/bible/ISA.json";
import b_JER from "../../assets/bible/JER.json";
import b_LAM from "../../assets/bible/LAM.json";
import b_EZK from "../../assets/bible/EZK.json";
import b_DAN from "../../assets/bible/DAN.json";
import b_HOS from "../../assets/bible/HOS.json";
import b_JOL from "../../assets/bible/JOL.json";
import b_AMO from "../../assets/bible/AMO.json";
import b_OBA from "../../assets/bible/OBA.json";
import b_JON from "../../assets/bible/JON.json";
import b_MIC from "../../assets/bible/MIC.json";
import b_NAM from "../../assets/bible/NAM.json";
import b_HAB from "../../assets/bible/HAB.json";
import b_ZEP from "../../assets/bible/ZEP.json";
import b_HAG from "../../assets/bible/HAG.json";
import b_ZEC from "../../assets/bible/ZEC.json";
import b_MAL from "../../assets/bible/MAL.json";
import b_MAT from "../../assets/bible/MAT.json";
import b_MRK from "../../assets/bible/MRK.json";
import b_LUK from "../../assets/bible/LUK.json";
import b_JHN from "../../assets/bible/JHN.json";
import b_ACT from "../../assets/bible/ACT.json";
import b_ROM from "../../assets/bible/ROM.json";
import b_1CO from "../../assets/bible/1CO.json";
import b_2CO from "../../assets/bible/2CO.json";
import b_GAL from "../../assets/bible/GAL.json";
import b_EPH from "../../assets/bible/EPH.json";
import b_PHP from "../../assets/bible/PHP.json";
import b_COL from "../../assets/bible/COL.json";
import b_1TH from "../../assets/bible/1TH.json";
import b_2TH from "../../assets/bible/2TH.json";
import b_1TI from "../../assets/bible/1TI.json";
import b_2TI from "../../assets/bible/2TI.json";
import b_TIT from "../../assets/bible/TIT.json";
import b_PHM from "../../assets/bible/PHM.json";
import b_HEB from "../../assets/bible/HEB.json";
import b_JAS from "../../assets/bible/JAS.json";
import b_1PE from "../../assets/bible/1PE.json";
import b_2PE from "../../assets/bible/2PE.json";
import b_1JN from "../../assets/bible/1JN.json";
import b_2JN from "../../assets/bible/2JN.json";
import b_3JN from "../../assets/bible/3JN.json";
import b_JUD from "../../assets/bible/JUD.json";
import b_REV from "../../assets/bible/REV.json";

export const BIBLE_DATA = {
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

export function getChapter(bookId, chapterNumber) {
  const book = BIBLE_DATA[bookId];
  if (!book) return null;
  return book.chapters.find((c) => Number(c.chapter) === Number(chapterNumber)) || null;
}
