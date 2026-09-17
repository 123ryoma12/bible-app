// Sermon lookup against the Cornerstone Presbyterian Community Church website.
//
//   https://www.cornerstonechurch.com.au
//
// The site runs ChurchPlantMedia's Herald CMS, which has no public REST API.
// Sermons are fetched by scraping HTML listing pages. Each congregation has its
// own listing at /{congregation}-sermons, and a scripture filter URL at
// /{congregation}-sermons/scripture/{book-slug}/ returns every sermon for a
// book on a single page — no pagination needed.
//
// Audio URLs are not present in the listing HTML. They are in the episode page
// at /{congregation}-sermons/episode/{date}/{slug}, embedded in an <audio> tag
// pointing directly to cpmfiles1.com.
//
// ── Structure ────────────────────────────────────────────────────────────────
//
//  Listing page:   /kogarah-sermons/scripture/luke/
//  Episode page:   /kogarah-sermons/episode/2026-09-06/luke-5:12-26
//  Audio CDN:      https://cpmfiles1.com/cornerstonechurch.com.au/{hash}.mp3
//
// ── Per-sermon data available from the listing ───────────────────────────────
//
//  title:    <a class="sermon-listing-title">Luke 5:12–26</a>
//  date:     <p class="sermon-month">September 6, 2026</p>
//  speaker:  <a class="speaker" rel="u-35">Jono Vavouris</a>
//  series:   <a class="series" id="series-104">Beautiful News</a>
//  passage:  <span class="sermon-scripture …">Luke 5:12–5:26</span>
//  episode URL: href on the title link
//
// The sermon ID is derived from the episode URL (source prefix + date + slug),
// so it is stable and unique across all congregations.

import { Platform } from "react-native";
import { ErrorKind, SermonError, isAbortError } from "./sermonApi";

const SITE_ROOT = "https://www.cornerstonechurch.com.au";
const CDN_HOST = "cpmfiles1.com";

export const CORNERSTONE_SOURCE_ID = "cornerstone";
export const SOURCE_NAME = "Cornerstone Church";
export const SOURCE_URL = SITE_ROOT;

const REQUEST_TIMEOUT_MS = 15_000;

// Whether audio page scraping is possible on this platform. Same restriction
// as Gospel in Life — the CDN pages send no CORS headers so browsers block the
// read. Native has no restriction.
export const AUDIO_EXTRACTION_SUPPORTED = Platform.OS !== "web";

// ── Congregations ─────────────────────────────────────────────────────────────

export const CONGREGATIONS = [
  { id: "beverly-hills",  label: "Beverly Hills" },
  { id: "concord",        label: "Concord" },
  { id: "eastwood",       label: "Eastwood" },
  { id: "homebush-bay",   label: "Homebush Bay" },
  { id: "kellyville",     label: "Kellyville" },
  { id: "kogarah",        label: "Kogarah" },
  { id: "rhodes",         label: "Rhodes" },
  { id: "strathfield",    label: "Strathfield" },
  { id: "willoughby",     label: "Willoughby" },
];

/** "Kogarah" → "kogarah-sermons" */
function listingPath(congregationId) {
  return `/${congregationId}-sermons`;
}

// ── HTTP plumbing ─────────────────────────────────────────────────────────────

function looksOffline() {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    navigator.onLine === false
  );
}

async function request(url, { signal } = {}) {
  const controller = new AbortController();

  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort);
  }

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });

    if (!res.ok) {
      throw new SermonError(
        ErrorKind.SERVER,
        `${SOURCE_NAME} returned HTTP ${res.status}`
      );
    }

    return await res.text();
  } catch (err) {
    if (err instanceof SermonError) throw err;

    if (timedOut) {
      throw new SermonError(ErrorKind.TIMEOUT, "The request timed out.", err);
    }

    if (signal?.aborted || isAbortError(err)) throw err;

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

// ── Book slug ─────────────────────────────────────────────────────────────────

/**
 * "1 Corinthians" → "1-corinthians"
 *
 * Matches the slug format used in the CMS scripture filter URLs.
 */
export function bookSlug(bookName) {
  return String(bookName).toLowerCase().trim().replace(/\s+/g, "-");
}

// ── HTML parsing ──────────────────────────────────────────────────────────────

// Minimal HTML entity decode for the characters the CMS actually emits.
function decodeEntities(text) {
  return String(text ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "\u2019")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\u2013/g, "–")  // en-dash left as-is by the CMS in some fields
    .trim();
}

function extractText(html, startTag, endTag = "<") {
  const start = html.indexOf(startTag);
  if (start === -1) return null;
  const contentStart = start + startTag.length;
  const end = html.indexOf(endTag, contentStart);
  return end === -1 ? null : decodeEntities(html.slice(contentStart, end).trim());
}

/**
 * Parse a single .sermon-listing block into a normalised sermon object.
 *
 * The expected DOM structure is:
 *
 *   <div class="sermon-listing">
 *     <div class="sermon-listing-info">
 *       <span class="series-date"><p class="sermon-month">September 6, 2026</p></span>
 *       <div class="sermon-listing-body">
 *         <h3><a class="sermon-listing-title" href="/kogarah-sermons/episode/…">Title</a></h3>
 *         <p class="sermon-listing-details">
 *           <span class="sermon-speaker …"><a class="speaker" rel="u-35" href="…">Name</a></span>
 *           <span class="sermon-series …"><a class="series" id="series-104" href="…">Series</a></span>
 *           <span class="sermon-scripture …">Luke 5:12–5:26</span>
 *         </p>
 *       </div>
 *     </div>
 *     <ul class="sermon-listing-tabs">
 *       <li><a href="…"><button class="watch-tab …">watch</button></a></li>
 *       <li><a href="…"><button class="watch-tab …">listen</button></a></li>
 *       …
 *     </ul>
 *   </div>
 */
function parseSermonBlock(block, congregationId) {
  // Episode URL — the canonical identifier for this sermon.
  const hrefMatch = block.match(/class="sermon-listing-title"\s+href="([^"]+)"/);
  if (!hrefMatch) return null;
  const episodePath = hrefMatch[1]; // e.g. /kogarah-sermons/episode/2026-09-06/luke-5:12-26

  // Derive a stable ID from the episode path rather than any numeric CMS ID,
  // since the listing HTML doesn't expose one and the path is unique per sermon.
  const id = `${CORNERSTONE_SOURCE_ID}:${episodePath}`;

  // Title text inside the listing-title anchor.
  const titleMatch = block.match(/class="sermon-listing-title"[^>]*>([^<]+)</);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "Untitled sermon";

  // Date: "September 6, 2026" inside <p class="sermon-month">
  const dateRaw = extractText(block, 'class="sermon-month">', "</p>");

  // Parse date string to ISO format for consistent sorting.
  let date = null;
  let year = null;
  if (dateRaw) {
    const parsed = new Date(dateRaw);
    if (!isNaN(parsed.getTime())) {
      date = parsed.toISOString().slice(0, 10); // YYYY-MM-DD
      year = parsed.getFullYear();
    }
  }

  // Speaker: text inside <a class="speaker">
  const speakerMatch = block.match(/class="speaker"[^>]*>([^<]+)</);
  const speaker = speakerMatch ? decodeEntities(speakerMatch[1].trim()) : null;

  // Scripture passage: text inside <span class="sermon-scripture …">
  // The CMS prefixes the text with "Scripture: " — strip it.
  const scriptureMatch = block.match(
    /class="sermon-scripture[^"]*"[^>]*>([^<]+)</
  );
  const passageRaw = scriptureMatch ? decodeEntities(scriptureMatch[1].trim()) : null;
  const passage = passageRaw ? passageRaw.replace(/^Scripture:\s*/i, "").trim() : null;

  // Audio availability: a "listen" button in the tabs list indicates audio.
  const hasAudio = block.includes('class="watch-tab sermon-media-tab">listen');

  return {
    id,
    title,
    link: `${SITE_ROOT}${episodePath}`,
    date,
    year,
    speaker,
    passage,
    hasAudio,
    // Tag the source so combined results can be attributed.
    source: CORNERSTONE_SOURCE_ID,
    congregationId,
  };
}

/**
 * Parse all .sermon-listing blocks from a listing page's HTML.
 */
function parseSermonsFromHtml(html, congregationId) {
  const sermons = [];
  // Split on each sermon-listing div. We avoid a full DOM parse by splitting
  // on the opening tag and processing each segment as a self-contained block.
  const parts = html.split('<div class="sermon-listing">');
  for (let i = 1; i < parts.length; i++) {
    // Capture up to the next peer sermon-listing div.
    const block = parts[i];
    const sermon = parseSermonBlock(block, congregationId);
    if (sermon) sermons.push(sermon);
  }
  return sermons;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all sermons for a Bible book from one congregation's listing.
 *
 * Uses the scripture filter URL:
 *   /{congregation}-sermons/scripture/{book-slug}/
 *
 * This returns every matching sermon on a single page (no pagination).
 * Returns an empty array when the book has no sermons for that congregation.
 */
export async function fetchSermonsForBook(bookName, congregationId, { signal } = {}) {
  const slug = bookSlug(bookName);
  const url = `${SITE_ROOT}${listingPath(congregationId)}/scripture/${slug}/`;

  const html = await request(url, { signal });
  return parseSermonsFromHtml(html, congregationId);
}

/**
 * Fetch sermons for a Bible book from all specified congregations in parallel,
 * then merge and sort by date descending.
 *
 * Each congregation fetch is attempted independently — a failure for one
 * congregation is silently skipped so the rest still appear.
 */
export async function fetchSermonsForBookAllCongregations(
  bookName,
  congregationIds,
  { signal } = {}
) {
  if (!congregationIds?.length) {
    return { sermons: [], total: 0 };
  }

  const results = await Promise.allSettled(
    congregationIds.map((id) => fetchSermonsForBook(bookName, id, { signal }))
  );

  const all = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      all.push(...result.value);
    }
    // Rejected congregations are silently skipped.
  }

  // Deduplicate by ID (same sermon shouldn't appear at two congregations, but
  // guard anyway), then sort newest first.
  const seen = new Set();
  const deduped = [];
  for (const s of all) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      deduped.push(s);
    }
  }

  deduped.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return { sermons: deduped, total: deduped.length };
}

/**
 * Resolve the direct MP3 URL for a sermon by fetching its episode page.
 *
 * The episode page embeds the audio in a plain <audio src="…"> tag pointing
 * to the cpmfiles1.com CDN. This is simpler than Gospel in Life's JSON-in-HTML
 * approach — one regex on the src attribute is sufficient.
 *
 * Returns null if the audio src can't be found, so callers can fall back to
 * opening the episode page in a browser.
 */
export async function fetchAudioUrl(permalink, { signal } = {}) {
  if (!permalink) return null;

  console.log("[cornerstoneApi] fetchAudioUrl permalink:", permalink);

  let html;
  try {
    html = await request(permalink, { signal });
  } catch (err) {
    console.log("[cornerstoneApi] fetchAudioUrl request error:", err?.kind, err?.message);
    throw err;
  }

  console.log("[cornerstoneApi] fetchAudioUrl html length:", html?.length, "first 200:", html?.slice(0, 200));

  // Match <audio src="https://cpmfiles1.com/…">
  // The CDN hostname is used as an anchor to avoid picking up unrelated audio
  // elements (e.g. browser default controls on video elements).
  const match = html.match(/<audio[^>]+src="(https?:\/\/[^"]*cpmfiles1\.com[^"]+)"/) ||
    html.match(/<audio[^>]+src="(https?:\/\/[^"]+\.(?:mp3|m4a|aac|ogg|opus|wav))"[^>]*>/i);

  console.log("[cornerstoneApi] fetchAudioUrl match:", match ? match[1] : "NO MATCH");

  if (!match) return null;

  const url = match[1].trim();
  if (!/^https?:\/\//i.test(url)) return null;

  return url;
}
