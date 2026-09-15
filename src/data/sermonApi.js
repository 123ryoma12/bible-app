// Sermon lookup against the Gospel in Life public WordPress REST API.
//
//   https://gospelinlife.com/wp-json/wp/v2/
//
// The site exposes a `sermon` post type tagged with a hierarchical
// `book-of-the-bible` taxonomy, where chapter terms ("john-3") are children of
// book terms ("john"). That maps almost exactly onto the reader, so a sermon
// list for the book (and the exact chapter) is two cheap queries.
//
// Nothing here is cached to disk. Lists are fetched fresh every time the sheet
// is opened. The only in-memory state is `termCache`, which holds resolved
// taxonomy IDs for the lifetime of the process so that re-opening the same book
// skips one round trip; it is not persisted and disappears on app restart.
//
// ── Quirks of this particular API, all verified against production ──────────
//
//  1. Term IDs are not derivable from book order (John is 191). They must be
//     resolved by slug.
//  2. `?search=john` also returns `1-john`, `1-john-1`, ... so results must be
//     filtered with a strict `^john(-\d+)?$` test or 1 John sermons leak into
//     the John list.
//  3. A term's `count` is NOT the sermon count. The taxonomy is shared with the
//     `resource`, `devotional`, `series` and `study` post types, so `john`
//     reports 203 while only 202 are sermons. Totals must come from the
//     `X-WP-Total` header of the sermon query itself.
//  4. Some chapter terms are orphaned at the top level rather than parented to
//     their book (`proverbs-5`, `proverbs-11`, `revelation-21`). Querying only
//     the book term would silently drop them, so every matching term ID is
//     passed to the sermon query.
//  5. `?format=15` always returns 0 — `format` is a reserved WP REST parameter,
//     so the taxonomy filter is unusable. Audio availability is determined
//     client-side from the `format` array instead.
//  6. The REST API does not expose the audio file. The MP3 is only present in
//     the sermon page's HTML, and every page also embeds an unrelated
//     site-wide promo MP3 — see `fetchAudioUrl` for why the parse is narrow.

import { Platform } from "react-native";

const API_ROOT = "https://gospelinlife.com/wp-json/wp/v2";
const SITE_ROOT = "https://gospelinlife.com";

// Attribution shown in the sheet footer.
export const SOURCE_NAME = "Gospel in Life";
export const SOURCE_URL = SITE_ROOT;

// Requests are aborted after this long so a stalled connection surfaces as a
// "taking too long" state instead of an indefinite spinner.
const REQUEST_TIMEOUT_MS = 15000;

// Per-request page size when fetching the full book list (all pages are fetched
// automatically). The chapter list is fetched in one shot with its own limit.
export const BOOK_PAGE_SIZE = 50;
const CHAPTER_PAGE_SIZE = 100;

// Taxonomy term ID for the "Audio" format. Stable, and only used as a hint for
// showing a headphones badge — playback still verifies by parsing the page.
const AUDIO_FORMAT_TERM_ID = 15;

// Why a request failed. The sheet renders a different message for each, since
// "you're offline" and "their server is down" need different wording and only
// some are worth retrying.
export const ErrorKind = {
  OFFLINE: "offline",
  TIMEOUT: "timeout",
  SERVER: "server",
  // The request never left the browser. Only reachable on web, where the
  // sermon pages send no CORS headers — see AUDIO_EXTRACTION_SUPPORTED.
  BLOCKED: "blocked",
  UNKNOWN: "unknown",
};

/**
 * Whether the MP3 can be resolved on this platform.
 *
 * The audio URL only exists in the sermon page's HTML, and unlike `/wp-json`
 * (which returns `Access-Control-Allow-Origin`), those pages send no CORS
 * headers at all. Browsers therefore block the read, so on web the only honest
 * option is to hand the sermon over to a new tab. Native has no such
 * restriction and plays in-app.
 */
export const AUDIO_EXTRACTION_SUPPORTED = Platform.OS !== "web";

/**
 * Best-effort check for genuine loss of connectivity.
 *
 * `fetch` rejects with a bare `TypeError` both when the network is down and
 * when a browser blocks a cross-origin read, and the two are indistinguishable
 * from the error alone. `navigator.onLine` is only trusted when it explicitly
 * reports being offline — a `true` value says very little, but a `false` one is
 * reliable.
 */
function looksOffline() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    navigator.onLine === false
  );
}

export class SermonError extends Error {
  constructor(kind, message, cause) {
    super(message);
    this.name = "SermonError";
    this.kind = kind;
    this.cause = cause;
  }
}

/**
 * True when an error is a deliberate cancellation (the user closed the sheet)
 * rather than a real failure. Callers should swallow these silently.
 */
export function isAbortError(err) {
  return err?.name === "AbortError";
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch plumbing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch with a timeout, chained to a caller-supplied abort signal, that
 * classifies every failure into a `SermonError` kind.
 *
 * The distinction that matters: React Native's `fetch` rejects with a
 * `TypeError` when the network is unreachable, but resolves with a non-OK
 * response when the server is reachable and unhappy. Those are different
 * problems and get different messages.
 */
async function request(path, { signal, parseJson = true } = {}) {
  const controller = new AbortController();

  // Chain the caller's signal so closing the sheet cancels in-flight work.
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort);
  }

  // Tracked separately so a timeout isn't misreported as a user cancellation.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(path.startsWith("http") ? path : API_ROOT + path, {
      signal: controller.signal,
      headers: { Accept: parseJson ? "application/json" : "text/html" },
    });

    if (!res.ok) {
      throw new SermonError(
        ErrorKind.SERVER,
        `${SOURCE_NAME} returned HTTP ${res.status}`
      );
    }

    if (!parseJson) return { body: await res.text(), total: 0, totalPages: 0 };

    // `count` on a term is unreliable (see header note 3), so list totals are
    // read from the response headers of the sermon query itself.
    const total = Number(res.headers.get("X-WP-Total"));
    const totalPages = Number(res.headers.get("X-WP-TotalPages"));

    return {
      body: await res.json(),
      total: Number.isFinite(total) ? total : 0,
      totalPages: Number.isFinite(totalPages) ? totalPages : 0,
    };
  } catch (err) {
    if (err instanceof SermonError) throw err;

    if (timedOut) {
      throw new SermonError(ErrorKind.TIMEOUT, "The request timed out.", err);
    }

    // A genuine user cancellation — let it through untouched so callers can
    // recognise it via isAbortError() and skip any state updates.
    if (signal?.aborted || isAbortError(err)) throw err;

    // Both an unreachable network and a browser-blocked cross-origin read
    // surface as a bare TypeError, so the error alone can't tell them apart.
    // Only claim the user is offline when that's actually established;
    // otherwise, on web, a block is by far the likelier explanation.
    if (err instanceof TypeError) {
      if (looksOffline()) {
        throw new SermonError(ErrorKind.OFFLINE, "No internet connection.", err);
      }
      if (Platform.OS === "web") {
        throw new SermonError(ErrorKind.BLOCKED, "Blocked by the browser.", err);
      }
      throw new SermonError(ErrorKind.OFFLINE, "No internet connection.", err);
    }

    throw new SermonError(ErrorKind.UNKNOWN, "Something went wrong.", err);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Taxonomy resolution
// ─────────────────────────────────────────────────────────────────────────────

/** "1 Corinthians" -> "1-corinthians", matching the site's term slugs. */
export function bookSlug(bookName) {
  return String(bookName).toLowerCase().trim().replace(/\s+/g, "-");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// bookSlug -> resolved terms. In-memory only, never persisted.
const termCache = new Map();

/**
 * Resolve every taxonomy term belonging to a book, in a single request.
 *
 * Returns `{ termIds, chapterTermIds }` where `termIds` covers the book term
 * plus all of its chapter terms (including orphans, per header note 4), and
 * `chapterTermIds` maps a chapter number to its term ID.
 *
 * An empty `termIds` is a definitive "this book has no content" — 16 of the 66
 * books have none — which lets the sheet show its empty state without ever
 * hitting the sermon endpoint.
 */
export async function resolveBookTerms(bookName, { signal } = {}) {
  const slug = bookSlug(bookName);
  const cached = termCache.get(slug);
  if (cached) return cached;

  const { body } = await request(
    `/book-of-the-bible?search=${encodeURIComponent(slug)}` +
      `&per_page=100&_fields=id,slug,parent`,
    { signal }
  );

  // Strict match, or searching "john" pulls in "1-john" (header note 2).
  // The largest book (John, 28 terms) fits well inside one page of 100.
  const exact = new RegExp(`^${escapeRegExp(slug)}(-\\d+)?$`);
  const matching = Array.isArray(body) ? body.filter((t) => exact.test(t.slug)) : [];

  const chapterTermIds = new Map();
  for (const term of matching) {
    const chapter = term.slug.match(/-(\d+)$/);
    if (chapter) chapterTermIds.set(Number(chapter[1]), term.id);
  }

  const resolved = {
    slug,
    termIds: matching.map((t) => t.id),
    chapterTermIds,
  };
  termCache.set(slug, resolved);
  return resolved;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sermon queries
// ─────────────────────────────────────────────────────────────────────────────

// Requesting `_embed` alongside `_fields` requires asking for the embed keys
// explicitly, otherwise WordPress strips them from the response.
const SERMON_FIELDS = "id,title,link,date,format,_links,_embedded";

function decodeEntities(text) {
  // Titles come back with HTML entities ("Q&#038;A"). RN has no DOM parser, so
  // handle the named entities WordPress actually emits plus numeric escapes.
  return String(text ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "\u2019")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Flatten `_embedded['wp:term']` and pull the names for one taxonomy.
 *
 * Every embedded term carries its own `taxonomy` field, so this filters by that
 * rather than relying on the position of each group in the array.
 */
function embeddedTermNames(sermon, taxonomy) {
  const groups = sermon?._embedded?.["wp:term"];
  if (!Array.isArray(groups)) return [];
  const names = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const term of group) {
      if (term?.taxonomy === taxonomy && term.name) names.push(decodeEntities(term.name));
    }
  }
  return names;
}

/**
 * Reduce the tagged scripture terms to the passage(s) actually preached on.
 *
 * Sermons are tagged with both the book and the chapter ("John" *and*
 * "John 3"), so the book term is redundant whenever a chapter of it is also
 * present. Anything that is a prefix of a more specific sibling is dropped,
 * which keeps genuine multi-book references intact:
 *
 *   ["John", "John 3"]                        -> "John 3"
 *   ["John", "John 3", "Romans", "Romans 8"]  -> "John 3 · Romans 8"
 *   ["Jonah"]                                 -> "Jonah"
 */
function passageFrom(references) {
  const specific = references.filter(
    (ref) => !references.some((other) => other !== ref && other.startsWith(`${ref} `))
  );
  // Numeric-aware so "John 9" sorts before "John 10".
  return specific
    .slice()
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .join(" · ");
}

/** Reshape a raw REST record into the flat object the UI renders. */
function normaliseSermon(raw) {
  const speakers = embeddedTermNames(raw, "speaker");
  const references = embeddedTermNames(raw, "book-of-the-bible");
  const passage = passageFrom(references) || null;

  return {
    id: raw.id,
    title: decodeEntities(raw.title?.rendered) || "Untitled sermon",
    link: raw.link,
    date: raw.date ?? null,
    year: raw.date ? Number(String(raw.date).slice(0, 4)) : null,
    speaker: speakers.join(" & ") || null,
    // Scripture reference(s), e.g. "John 3" or "John 3 · Romans 8".
    passage,
    // A hint only; playback re-checks by parsing the page (header note 5).
    hasAudio: Array.isArray(raw.format) ? raw.format.includes(AUDIO_FORMAT_TERM_ID) : true,
    source: "gospel-in-life",
  };
}

/**
 * Fetch one page of sermons for a set of taxonomy term IDs, newest first.
 * Returns `{ sermons, total, totalPages }`, with `total` taken from the
 * response header rather than any term's `count`.
 */
async function fetchSermonsForTerms(termIds, { page = 1, perPage, signal } = {}) {
  if (!termIds?.length) return { sermons: [], total: 0, totalPages: 0 };

  const { body, total, totalPages } = await request(
    `/sermon?book-of-the-bible=${termIds.join(",")}` +
      `&per_page=${perPage}&page=${page}&orderby=date&order=desc` +
      `&_embed=wp:term&_fields=${SERMON_FIELDS}`,
    { signal }
  );

  return {
    sermons: Array.isArray(body) ? body.map(normaliseSermon) : [],
    total,
    totalPages,
  };
}

/**
 * Fetch only the chapter sermons for the given chapter — used for the fast
 * first paint before the full book list is ready.
 *
 * Returns `{ sermons, bookTermIds }` — the caller can pass `bookTermIds`
 * straight into `fetchAllBookSermons` to skip the term-resolution round trip.
 */
export async function fetchChapterSermons(bookName, chapterNumber, { signal } = {}) {
  const { termIds, chapterTermIds } = await resolveBookTerms(bookName, { signal });

  if (!termIds.length) return { sermons: [], bookTermIds: [] };

  if (!chapterNumber) return { sermons: [], bookTermIds: termIds };

  const chapterTermId = chapterTermIds.get(Number(chapterNumber));
  if (!chapterTermId) return { sermons: [], bookTermIds: termIds };

  const { sermons } = await fetchSermonsForTerms([chapterTermId], {
    perPage: CHAPTER_PAGE_SIZE,
    signal,
  });
  return { sermons, bookTermIds: termIds };
}

/**
 * Fetch every page of sermons for a book and return them as a flat array.
 * Pages are fetched sequentially (page 1 → 2 → …) so the server is not
 * hammered, and the loop stops as soon as the signal is aborted.
 *
 * Pass `bookTermIds` (from a prior `fetchChapterSermons` call) to skip the
 * term-resolution round trip.
 */
export async function fetchAllBookSermons(bookName, { signal, bookTermIds } = {}) {
  const termIds =
    bookTermIds ?? (await resolveBookTerms(bookName, { signal })).termIds;

  if (!termIds.length) return { sermons: [], total: 0 };

  const all = [];
  let page = 1;
  let totalPages = 1;

  do {
    if (signal?.aborted) throw new SermonError(ErrorKind.UNKNOWN, "Aborted");

    const { sermons, total, totalPages: tp } = await fetchSermonsForTerms(termIds, {
      page,
      perPage: BOOK_PAGE_SIZE,
      signal,
    });

    all.push(...sermons);
    totalPages = tp;
    page += 1;
  } while (page <= totalPages);

  return { sermons: all, total: all.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the streamable MP3 for a sermon by reading its page.
 *
 * The REST API omits the audio file, so it has to come from the page markup,
 * where the player's config is embedded as JSON. The parse deliberately keys
 * off `"audio":"..."` rather than scanning for any `.mp3`: every sermon page
 * also embeds an unrelated site-wide promo MP3, and a loose match reliably
 * picks the wrong one.
 *
 * Returns `null` if the markup has changed shape, so the caller can fall back
 * to opening the sermon in a browser instead of failing outright.
 */
export async function fetchAudioUrl(permalink, { signal } = {}) {
  if (!permalink) return null;

  const { body: html } = await request(permalink, { signal, parseJson: false });

  // The blob appears HTML-escaped inside an attribute; accept either form.
  const match =
    html.match(/&quot;audio&quot;:&quot;(.*?)&quot;/) || html.match(/"audio":"(.*?)"/);
  if (!match) return null;

  // Undo JSON's escaped forward slashes.
  const url = match[1].replace(/\\\//g, "/").trim();
  if (!/^https?:\/\//i.test(url)) return null;

  return url;
}
