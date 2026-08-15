// Pure logic for the memorisation typing drill (no storage, no UI).
//
// The drill asks the user to type the INITIAL LETTER of each word in a verse.
// Words are progressively hidden depending on the stage/status:
//
//   Stage 1 (not memorised): every word shown, greyed out.
//   Stage 2 (not memorised): every 2nd word shown; randomise whether the shown
//                            words start on the 1st or 2nd word.
//   Stage 3 (not memorised): no words shown.
//   Memorised:               no words shown.
//
// A word's expected key is its initial LETTER (first alphabetic character,
// case-insensitive). Typing the wrong letter marks that word wrong (UI paints
// it red) but the drill still advances to the next word. A stage/verse is only
// "passed" at 100% accuracy.
//
// Everything here is deterministic given its inputs (stage 2 uses a supplied
// seed) so it is trivially unit-testable.

// Splits a verse into word tokens, preserving order. Each token carries the
// display text and the expected initial letter (lowercased). Tokens whose text
// has no alphabetic character (e.g. stray "—") get expected: null and are
// auto-skipped during checking so they never block progress.
export function tokenize(text) {
  const raw = (text || "").split(/\s+/).filter(Boolean);
  return raw.map((word, i) => {
    const match = word.match(/[A-Za-z]/);
    return {
      index: i,
      text: word,
      expected: match ? match[0].toLowerCase() : null,
    };
  });
}

// True when a token requires user input (has an expected letter).
export function isTypable(token) {
  return token && token.expected != null;
}

// Tiny seeded PRNG (mulberry32) so stage-2 alternation is reproducible in tests
// while still varying run-to-run when seeded from Date.now().
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Given tokens and the stage/status, returns a boolean[] parallel to tokens:
// true = the word's text is SHOWN to the user, false = hidden. The user always
// types the initial letter regardless of visibility; showing is only a hint.
//
// stage: 1 | 2 | 3   (ignored when memorised is true)
// memorised: boolean  (overrides stage -> nothing shown)
// seed: number        (only used for stage 2 alternation start)
export function computeVisibility(tokens, { stage, memorised, seed = 0 }) {
  const n = tokens.length;
  if (memorised) return new Array(n).fill(false);

  switch (Number(stage)) {
    case 1:
      return new Array(n).fill(true);
    case 3:
      return new Array(n).fill(false);
    case 2:
    default: {
      // Randomise whether we show even-indexed or odd-indexed words.
      const startOnSecond = mulberry32(seed)() < 0.5;
      const offset = startOnSecond ? 1 : 0;
      return tokens.map((_, i) => (i % 2) === offset);
    }
  }
}

// QWERTY physical-neighbour map (lowercase). Each letter lists the keys that
// directly surround it on a standard US QWERTY layout (horizontal, vertical, and
// the diagonals that actually touch). Used to forgive "fat finger" taps so a
// press landing on an adjacent key to the expected initial letter still passes.
// Rows are offset (staggered), so diagonals follow the real physical staggering.
const QWERTY_NEIGHBOURS = {
  q: ["w", "a", "s"],
  w: ["q", "e", "a", "s", "d"],
  e: ["w", "r", "s", "d", "f"],
  r: ["e", "t", "d", "f", "g"],
  t: ["r", "y", "f", "g", "h"],
  y: ["t", "u", "g", "h", "j"],
  u: ["y", "i", "h", "j", "k"],
  i: ["u", "o", "j", "k", "l"],
  o: ["i", "p", "k", "l"],
  p: ["o", "l"],
  a: ["q", "w", "s", "z"],
  s: ["q", "w", "e", "a", "d", "z", "x"],
  d: ["w", "e", "r", "s", "f", "x", "c"],
  f: ["e", "r", "t", "d", "g", "c", "v"],
  g: ["r", "t", "y", "f", "h", "v", "b"],
  h: ["t", "y", "u", "g", "j", "b", "n"],
  j: ["y", "u", "i", "h", "k", "n", "m"],
  k: ["u", "i", "o", "j", "l", "m"],
  l: ["i", "o", "p", "k"],
  z: ["a", "s", "x"],
  x: ["s", "d", "z", "c"],
  c: ["d", "f", "x", "v"],
  v: ["f", "g", "c", "b"],
  b: ["g", "h", "v", "n"],
  n: ["h", "j", "b", "m"],
  m: ["j", "k", "n"],
};

// True when `got` is the same key as, or a physical QWERTY neighbour of,
// `expected`. Both are single lowercase letters.
export function isQwertyNear(got, expected) {
  if (!got || !expected) return false;
  if (got === expected) return true;
  const neighbours = QWERTY_NEIGHBOURS[expected];
  return !!neighbours && neighbours.includes(got);
}

// Checks a typed letter against a token. Returns { correct, expected }.
// Non-typable tokens are always "correct" (they're skipped). To tolerate
// fat-finger taps, a letter that is a direct QWERTY neighbour of the expected
// initial letter is also accepted as correct.
export function checkLetter(token, typed) {
  if (!isTypable(token)) return { correct: true, expected: null };
  const got = (typed || "").trim().slice(0, 1).toLowerCase();
  return { correct: isQwertyNear(got, token.expected), expected: token.expected };
}

// Advances from the current token index to the next TYPABLE token index (or
// tokens.length when the verse is complete). Skips punctuation-only tokens.
export function nextTypableIndex(tokens, from) {
  let i = from;
  while (i < tokens.length && !isTypable(tokens[i])) i++;
  return i;
}

// Builds the initial drill state for a list of verses. Each verse gets its own
// tokens + visibility. `results` records pass/fail per verse (null = not yet
// attempted this run). `order` is the list of verse indices still to attempt;
// on a retry within the same session you pass only the previously-failed verse
// indices so the user re-does just those (spec's "skip to verses that failed").
export function buildDrill(verses, { stage, memorised, seed = Date.now(), order }) {
  const perVerse = verses.map((v, i) => {
    const tokens = tokenize(v.text);
    return {
      verseIndex: i,
      reference: { chapter: v.chapter, verse: v.verse },
      tokens,
      visibility: computeVisibility(tokens, { stage, memorised, seed: seed + i }),
    };
  });

  const runOrder =
    Array.isArray(order) && order.length ? order.slice() : verses.map((_, i) => i);

  return {
    stage,
    memorised: !!memorised,
    verses: perVerse,
    order: runOrder,
    results: verses.map(() => null), // null | true | false
  };
}

// Returns the verse indices that FAILED in a completed run (for a same-session
// retry). Verses not attempted in this run keep whatever they were.
export function failedVerseIndices(results) {
  const out = [];
  results.forEach((r, i) => {
    if (r === false) out.push(i);
  });
  return out;
}

// Whole-attempt success: every verse that was attempted this run passed AND at
// least one verse was attempted. A single attempt (any number of verses) is one
// result, per spec.
export function attemptSucceeded(drill) {
  const attempted = drill.order;
  if (!attempted.length) return false;
  return attempted.every((i) => drill.results[i] === true);
}

export const MAX_DRILL_STAGE = 3;

// Pure decision for "what happens after this attempt", encoding the spec's
// auto-advance rules. Inputs describe the finished attempt; the returned action
// tells the UI what to do next. Kept side-effect free so it's unit-testable.
//
//   { success, memorised, stage }  ->  { type, recordAttempt?, memorise?, nextStage? }
//
// Action types:
//   "advanceStage" : not-memorised, passed a non-final stage. Stay on the SAME
//                    set at `nextStage` (no interstitial).
//   "next"         : finished this set (memorised win, or just cleared the final
//                    learning stage). Auto-advance to the next set. `memorise`
//                    is true when this pass promotes the set; `recordAttempt`
//                    is true when a memorised attempt should be counted.
//   "stay"         : failed. Remain on the current set/stage; show retry UI.
//                    `recordAttempt` is true for memorised sets (counts a loss).
export function resolveOutcome({ success, memorised, stage }) {
  if (success) {
    if (memorised) {
      return { type: "next", recordAttempt: true, memorise: false };
    }
    if (stage < MAX_DRILL_STAGE) {
      return { type: "advanceStage", nextStage: stage + 1 };
    }
    return { type: "next", recordAttempt: false, memorise: true };
  }
  // Failure: stay put. Memorised sets still record the failed attempt.
  return { type: "stay", recordAttempt: !!memorised };
}
