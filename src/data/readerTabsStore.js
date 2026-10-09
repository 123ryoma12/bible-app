// Persists the set of open reader tabs (up to MAX_TABS) so they survive app
// restarts. Each tab is { id, bookId, chapterNumber } where id is a unique
// string generated at creation time. The active tab index is also persisted.
//
// Uses the same swappable backend as every other *Store.js module.

import { backend } from "./storageBackend";

const TABS_KEY = "readerTabs";
export const MAX_TABS = Infinity;

/**
 * Returns { tabs, activeIndex } or null if nothing has been saved yet.
 */
export async function getReaderTabs() {
  return backend.getItem(TABS_KEY);
}

/**
 * Persist the current tab list and active index.
 * @param {Array<{id:string, bookId:string, chapterNumber:number}>} tabs
 * @param {number} activeIndex
 */
export async function setReaderTabs(tabs, activeIndex) {
  await backend.setItem(TABS_KEY, { tabs, activeIndex });
}

/** Helper: generate a lightweight unique tab id. */
export function newTabId() {
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
