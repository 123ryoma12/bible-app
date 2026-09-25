// Book introductions are JSON text assets so parsed books can be released.
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { Platform } from "react-native";

const LOADERS = {
  "GEN": () => require("../../data/book-intros/GEN.txt"),
  "EXO": () => require("../../data/book-intros/EXO.txt"),
  "LEV": () => require("../../data/book-intros/LEV.txt"),
  "NUM": () => require("../../data/book-intros/NUM.txt"),
  "DEU": () => require("../../data/book-intros/DEU.txt"),
  "JOS": () => require("../../data/book-intros/JOS.txt"),
  "JDG": () => require("../../data/book-intros/JDG.txt"),
  "RUT": () => require("../../data/book-intros/RUT.txt"),
  "1SA": () => require("../../data/book-intros/1SA.txt"),
  "2SA": () => require("../../data/book-intros/2SA.txt"),
  "1KI": () => require("../../data/book-intros/1KI.txt"),
  "2KI": () => require("../../data/book-intros/2KI.txt"),
  "1CH": () => require("../../data/book-intros/1CH.txt"),
  "2CH": () => require("../../data/book-intros/2CH.txt"),
  "EZR": () => require("../../data/book-intros/EZR.txt"),
  "NEH": () => require("../../data/book-intros/NEH.txt"),
  "EST": () => require("../../data/book-intros/EST.txt"),
  "JOB": () => require("../../data/book-intros/JOB.txt"),
  "PSA": () => require("../../data/book-intros/PSA.txt"),
  "PRO": () => require("../../data/book-intros/PRO.txt"),
  "ECC": () => require("../../data/book-intros/ECC.txt"),
  "SNG": () => require("../../data/book-intros/SNG.txt"),
  "ISA": () => require("../../data/book-intros/ISA.txt"),
  "JER": () => require("../../data/book-intros/JER.txt"),
  "LAM": () => require("../../data/book-intros/LAM.txt"),
  "EZK": () => require("../../data/book-intros/EZK.txt"),
  "DAN": () => require("../../data/book-intros/DAN.txt"),
  "HOS": () => require("../../data/book-intros/HOS.txt"),
  "JOL": () => require("../../data/book-intros/JOL.txt"),
  "AMO": () => require("../../data/book-intros/AMO.txt"),
  "OBA": () => require("../../data/book-intros/OBA.txt"),
  "JON": () => require("../../data/book-intros/JON.txt"),
  "MIC": () => require("../../data/book-intros/MIC.txt"),
  "NAM": () => require("../../data/book-intros/NAM.txt"),
  "HAB": () => require("../../data/book-intros/HAB.txt"),
  "ZEP": () => require("../../data/book-intros/ZEP.txt"),
  "HAG": () => require("../../data/book-intros/HAG.txt"),
  "ZEC": () => require("../../data/book-intros/ZEC.txt"),
  "MAL": () => require("../../data/book-intros/MAL.txt"),
  "MAT": () => require("../../data/book-intros/MAT.txt"),
  "MRK": () => require("../../data/book-intros/MRK.txt"),
  "LUK": () => require("../../data/book-intros/LUK.txt"),
  "JHN": () => require("../../data/book-intros/JHN.txt"),
  "ACT": () => require("../../data/book-intros/ACT.txt"),
  "ROM": () => require("../../data/book-intros/ROM.txt"),
  "1CO": () => require("../../data/book-intros/1CO.txt"),
  "2CO": () => require("../../data/book-intros/2CO.txt"),
  "GAL": () => require("../../data/book-intros/GAL.txt"),
  "EPH": () => require("../../data/book-intros/EPH.txt"),
  "PHP": () => require("../../data/book-intros/PHP.txt"),
  "COL": () => require("../../data/book-intros/COL.txt"),
  "1TH": () => require("../../data/book-intros/1TH.txt"),
  "2TH": () => require("../../data/book-intros/2TH.txt"),
  "1TI": () => require("../../data/book-intros/1TI.txt"),
  "2TI": () => require("../../data/book-intros/2TI.txt"),
  "TIT": () => require("../../data/book-intros/TIT.txt"),
  "PHM": () => require("../../data/book-intros/PHM.txt"),
  "HEB": () => require("../../data/book-intros/HEB.txt"),
  "JAS": () => require("../../data/book-intros/JAS.txt"),
  "1PE": () => require("../../data/book-intros/1PE.txt"),
  "2PE": () => require("../../data/book-intros/2PE.txt"),
  "1JN": () => require("../../data/book-intros/1JN.txt"),
  "2JN": () => require("../../data/book-intros/2JN.txt"),
  "3JN": () => require("../../data/book-intros/3JN.txt"),
  "JUD": () => require("../../data/book-intros/JUD.txt"),
  "REV": () => require("../../data/book-intros/REV.txt"),
};

const cache = new Map();
const inFlight = new Map();
const pins = new Map();
let retainedBookIds = new Set();

function shouldKeep(bookId) {
  return retainedBookIds.has(bookId) || (pins.get(bookId) ?? 0) > 0;
}

function prune() {
  for (const bookId of cache.keys()) {
    if (!shouldKeep(bookId)) cache.delete(bookId);
  }
}

/** Keep parsed intros for open intro tabs. */
export function retainBookIntros(bookIds) {
  retainedBookIds = new Set(bookIds);
  prune();
}

/** Prevent an active intro from being evicted during tab navigation. */
export function pinBookIntro(bookId) {
  pins.set(bookId, (pins.get(bookId) ?? 0) + 1);
  return () => {
    const next = (pins.get(bookId) ?? 1) - 1;
    if (next > 0) pins.set(bookId, next);
    else pins.delete(bookId);
    prune();
  };
}

/** Load one offline intro, sharing concurrent reads. */
export async function loadBookIntro(bookId) {
  const moduleForBook = LOADERS[bookId];
  if (!moduleForBook) return null;
  if (cache.has(bookId)) return cache.get(bookId);
  if (inFlight.has(bookId)) return inFlight.get(bookId);

  const task = (async () => {
    const asset = Asset.fromModule(moduleForBook());
    const text = Platform.OS === "web"
      ? await (await fetch(asset.uri)).text()
      : await new File((await asset.downloadAsync()).localUri).text();
    return JSON.parse(text);
  })();
  inFlight.set(bookId, task);
  try {
    const intro = await task;
    if (shouldKeep(bookId)) cache.set(bookId, intro);
    return intro;
  } finally {
    inFlight.delete(bookId);
  }
}
