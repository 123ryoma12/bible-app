// Offline copies of sermons.
//
// Two things are kept, and they can drift apart: the MP3 in the app's document
// directory, and a metadata record in key-value storage. The record is what
// makes the Downloads list browsable with no network at all — the sermon API is
// never consulted to render it. The file is the source of truth, so a record
// whose file has gone missing is dropped on read rather than shown as a
// download that won't play.
//
// Storage shape mirrors historyStore:
//   sermons:downloads:index      -> ["<sermonId>", ...]  most-recent-first
//   sermons:downloads:entry:<id> -> { id, title, link, ..., fileName, bytes }
//
// Note the record stores a *file name*, never a full URI. On iOS the app
// container is re-keyed on install and update, so any absolute path persisted
// today is likely to be wrong tomorrow. Paths are rebuilt from the directory on
// every read instead.
//
// In-flight downloads live in module state rather than in a component, because
// the only screen that shows them (SermonSheet, inside ReaderScreen) is
// remounted on every page turn. Anchoring a transfer to that tree would cancel
// downloads whenever the reader moved on.

import { useEffect, useSyncExternalStore } from "react";
import { Directory, File, Paths } from "expo-file-system";
import { backend } from "./storageBackend";
import { isAbortError, AUDIO_EXTRACTION_SUPPORTED } from "./sermonApi";
import { fetchAudioUrl } from "./combinedSermonApi";

const INDEX_KEY = "sermons:downloads:index";
const ENTRY_PREFIX = "sermons:downloads:entry:";
const DIR_NAME = "sermons";

// Downloading needs the same page-scrape that playing does, so wherever audio
// can't be resolved (the web build, which has no CORS access to the sermon
// page) downloads are off too.
export const DOWNLOADS_SUPPORTED = AUDIO_EXTRACTION_SUPPORTED;

function entryKey(id) {
  return `${ENTRY_PREFIX}${id}`;
}

let directory = null;

/** The folder holding the audio, created on first use. */
function downloadDirectory() {
  if (!directory) {
    directory = new Directory(Paths.document, DIR_NAME);
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

function fileFor(entry) {
  return new File(downloadDirectory(), entry.fileName);
}

const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "ogg", "opus", "wav", "mp4"];

/**
 * Sermon ids come from the source API and are numeric, so they're already safe
 * as file names. The extension is carried over from the audio URL where it is
 * recognisably audio, since some players and OS file pickers key off it.
 *
 * The host is stripped before looking, or a URL with no path at all would
 * donate its TLD — "https://gospelinlife.com" becoming "123.com".
 */
function fileNameFor(id, url) {
  const path = String(url || "")
    .split(/[?#]/)[0]
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "");
  const segment = path.slice(path.lastIndexOf("/") + 1);
  const match = /\.([a-z0-9]{2,4})$/i.exec(segment);
  const extension = match?.[1].toLowerCase();

  return `${id}.${AUDIO_EXTENSIONS.includes(extension) ? extension : "mp3"}`;
}

// --- Observable state -------------------------------------------------------
//
// A snapshot object is rebuilt on every change so `useSyncExternalStore` can
// compare identities cheaply.

let snapshot = {
  // False until the index has been read once, so the UI can tell "no downloads"
  // apart from "not looked yet".
  ready: false,
  /** Downloaded sermons, most-recent-first. */
  entries: [],
  /** id -> entry, for O(1) lookups from a list row. */
  byId: {},
  /** id -> { progress: 0..1 | null, failed: boolean } for anything in flight. */
  active: {},
};

const listeners = new Set();
const controllers = new Map();

function publish(changes) {
  snapshot = { ...snapshot, ...changes };
  for (const listener of listeners) listener();
}

function publishEntries(entries) {
  const byId = {};
  for (const entry of entries) byId[entry.id] = entry;
  publish({ ready: true, entries, byId });
}

function publishActive(id, state) {
  const active = { ...snapshot.active };
  if (state) active[id] = { ...active[id], ...state };
  else delete active[id];
  publish({ active });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

// --- Persistence ------------------------------------------------------------

async function readIndex() {
  const index = await backend.getItem(INDEX_KEY);
  return Array.isArray(index) ? index : [];
}

let loading = null;

/**
 * Read the index into memory once. Records whose audio has gone missing — a
 * restore onto a new device copies the key-value store but not the files, and
 * the OS can reclaim storage under pressure — are pruned here, so the rest of
 * the app can trust that every entry it sees is playable.
 */
async function ensureLoaded() {
  if (snapshot.ready) return;
  // Nothing to read where downloads can't exist, but the UI still needs to be
  // told to stop waiting.
  if (!DOWNLOADS_SUPPORTED) {
    publish({ ready: true });
    return;
  }
  if (loading) return loading;

  loading = (async () => {
    const index = await readIndex();
    const entries = [];
    const missing = [];

    for (const id of index) {
      const entry = await backend.getItem(entryKey(id));
      if (!entry?.fileName) {
        missing.push(id);
        continue;
      }
      try {
        if (!fileFor(entry).exists) {
          missing.push(id);
          continue;
        }
      } catch {
        missing.push(id);
        continue;
      }
      entries.push(entry);
    }

    if (missing.length) {
      await backend.setItem(
        INDEX_KEY,
        index.filter((id) => !missing.includes(id))
      );
      for (const id of missing) await backend.removeItem(entryKey(id));
    }

    publishEntries(entries);
  })();

  try {
    await loading;
  } catch {
    // A storage read failing shouldn't take its caller down with it — playback
    // simply falls back to streaming, and the next call retries.
  } finally {
    loading = null;
  }
}

async function persistEntry(entry) {
  const index = await readIndex();
  const next = [entry.id, ...index.filter((id) => id !== entry.id)];
  await backend.setItem(entryKey(entry.id), entry);
  await backend.setItem(INDEX_KEY, next);
  publishEntries([entry, ...snapshot.entries.filter((e) => e.id !== entry.id)]);
}

async function forgetEntry(id) {
  const index = await readIndex();
  await backend.setItem(INDEX_KEY, index.filter((existing) => existing !== id));
  await backend.removeItem(entryKey(id));
  publishEntries(snapshot.entries.filter((entry) => entry.id !== id));
}

// --- Public API -------------------------------------------------------------

/**
 * The local file URI for a downloaded sermon, or null if it isn't downloaded.
 * Callers can hand the result straight to the audio player.
 */
export async function getDownloadedUri(sermonId) {
  if (!DOWNLOADS_SUPPORTED || sermonId == null) return null;
  await ensureLoaded();

  const entry = snapshot.byId[String(sermonId)];
  if (!entry) return null;

  try {
    const file = fileFor(entry);
    // Re-checked at the point of use: the pruning in ensureLoaded() happened
    // when the app started, and a file can disappear after that.
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Download a sermon for offline listening. Safe to call twice — an already
 * downloaded or in-flight sermon is a no-op. Failures are surfaced through the
 * `active` map rather than thrown, since the caller is a list row with nowhere
 * to report to; tapping again retries.
 */
export async function downloadSermon(sermon) {
  if (!DOWNLOADS_SUPPORTED || !sermon) return;

  const id = String(sermon.id);
  if (controllers.has(id)) return;

  await ensureLoaded();
  if (snapshot.byId[id]) return;

  const controller = new AbortController();
  controllers.set(id, controller);
  publishActive(id, { progress: null, failed: false });

  try {
    const url = await fetchAudioUrl(sermon, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!url) throw new Error("No audio on the sermon page");

    const target = new File(downloadDirectory(), fileNameFor(id, url));
    // A previous attempt may have left a partial file behind.
    if (target.exists) target.delete();

    const task = File.createDownloadTask(url, target, {
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        // Servers don't always send Content-Length, in which case there is no
        // honest percentage to show and the UI falls back to a spinner.
        const next = totalBytes > 0 ? Math.min(bytesWritten / totalBytes, 1) : null;
        const shown = snapshot.active[id]?.progress ?? null;
        // Progress arrives per chunk and every publish re-renders the sermon
        // list, so only republish when the displayed number would change.
        if (
          next != null &&
          shown != null &&
          Math.round(next * 100) === Math.round(shown * 100)
        ) {
          return;
        }
        publishActive(id, { progress: next });
      },
    });

    const file = await task.downloadAsync();
    if (controller.signal.aborted) return;
    if (!file) throw new Error("Download did not complete");

    await persistEntry({
      id,
      title: sermon.title,
      link: sermon.link,
      speaker: sermon.speaker ?? null,
      passage: sermon.passage ?? null,
      year: sermon.year ?? null,
      date: sermon.date ?? null,
      fileName: file.name,
      bytes: file.size ?? 0,
      downloadedAt: new Date().toISOString(),
    });
    publishActive(id, null);
  } catch (err) {
    // A newer attempt may already own this row, in which case its state is the
    // one worth showing.
    if (controllers.get(id) !== controller) return;

    if (isAbortError(err) || controller.signal.aborted) {
      publishActive(id, null);
    } else {
      publishActive(id, { progress: null, failed: true });
    }
  } finally {
    // Only clear our own handle. Cancelling drops the entry eagerly so a retry
    // can start straight away, and this unwinding attempt must not then delete
    // the controller belonging to that newer download.
    if (controllers.get(id) === controller) controllers.delete(id);
  }
}

/** Stop an in-flight download and discard whatever arrived. */
export function cancelDownload(sermonId) {
  const id = String(sermonId);
  controllers.get(id)?.abort();
  controllers.delete(id);
  publishActive(id, null);
}

/**
 * A sermon is tens of megabytes, so MB is the working unit — but a well-stocked
 * library runs past a gigabyte, and "1430.5 MB" is no way to report that.
 */
export function formatDownloadSize(bytes) {
  if (!bytes || bytes < 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) return "<0.1 MB";
  return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(1)} GB`;
}

/** Total bytes held on disk by downloaded sermons. */
export function totalDownloadedBytes(entries) {
  return entries.reduce((total, entry) => total + (entry.bytes || 0), 0);
}

/** Delete a downloaded sermon's audio and its record. */
export async function removeDownload(sermonId) {
  const id = String(sermonId);
  await ensureLoaded();

  const entry = snapshot.byId[id];
  if (!entry) return;

  try {
    const file = fileFor(entry);
    if (file.exists) file.delete();
  } catch {
    // The record goes regardless: a file we can't delete is still one the user
    // has asked to be rid of, and leaving the entry would keep offering it.
  }
  await forgetEntry(id);
}

/**
 * Subscribe to downloads state. Exported as a hook (rather than leaving the
 * component to poll) because downloads change from outside React — a transfer
 * started in one mount of the sheet can finish after the reader has moved on.
 */
export function useSermonDownloads() {
  useEffect(() => {
    ensureLoaded();
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
