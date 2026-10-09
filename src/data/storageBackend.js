// Generic key-value storage backend used by every *Store.js module
// (progressStore, historyStore, lastPositionStore, theme preference, etc.).
//
// The contract is intentionally tiny (get/set/remove a JSON-serializable value
// at a string key) so any key-value or document store can implement it. To
// migrate from on-device storage to Firebase (or anything else) later, write
// a new backend object below with the same three methods and change the
// `backend` export at the bottom - nothing that imports `backend` needs to
// change.

import AsyncStorage from "@react-native-async-storage/async-storage";

export const localStorageBackend = {
  async getItem(key) {
    const raw = await AsyncStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : null;
  },
  async setItem(key, value) {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async removeItem(key) {
    await AsyncStorage.removeItem(key);
  },
};

// ---------------------------------------------------------------------------
// Change notification
// ---------------------------------------------------------------------------
// Every *Store.js module writes through this backend, which makes it the one
// place that sees all persisted state changes. Subscribing here means a
// consumer (e.g. the home screen widget bridge) stays current without each
// individual store having to know about it, and without new stores needing to
// be wired up as they're added.

const _listeners = new Set();

/**
 * Observe writes to persisted data.
 *
 * @param {(key: string) => void} fn Called with the affected key after every
 *   successful setItem/removeItem.
 * @returns {() => void} Unsubscribe.
 */
export function subscribeStorage(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function notifyStorageChanged(key) {
  _listeners.forEach((fn) => {
    try {
      fn(key);
    } catch {
      // A misbehaving listener must never break a write.
    }
  });
}

/**
 * Wrap a backend so mutations notify subscribers. Applied to whichever engine
 * is exported below, so swapping storage engines keeps this behaviour.
 */
function withChangeNotification(impl) {
  return {
    getItem: (key) => impl.getItem(key),
    async setItem(key, value) {
      await impl.setItem(key, value);
      notifyStorageChanged(key);
    },
    async removeItem(key) {
      await impl.removeItem(key);
      notifyStorageChanged(key);
    },
  };
}

// --- Future migration sketch ---
// export const firebaseBackend = {
//   async getItem(key) {
//     const snap = await getDoc(doc(db, "userData", key));
//     return snap.exists() ? snap.data() : null;
//   },
//   async setItem(key, value) {
//     await setDoc(doc(db, "userData", key), value);
//   },
//   async removeItem(key) {
//     await deleteDoc(doc(db, "userData", key));
//   },
// };

// Swap this single line to change storage engines app-wide, e.g.:
//   export const backend = withChangeNotification(firebaseBackend);
export const backend = withChangeNotification(localStorageBackend);
