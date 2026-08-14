// Generic key-value storage backend used by every *Store.js module
// (progressStore, historyStore, lastPositionStore, theme preference, etc.).
//
// The contract is intentionally tiny (get/set a JSON-serializable value at a
// string key) so any key-value or document store can implement it. To
// migrate from on-device storage to Firebase (or anything else) later, write
// a new backend object below with the same two methods and change the
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
};

// --- Future migration sketch ---
// export const firebaseBackend = {
//   async getItem(key) {
//     const snap = await getDoc(doc(db, "userData", key));
//     return snap.exists() ? snap.data() : null;
//   },
//   async setItem(key, value) {
//     await setDoc(doc(db, "userData", key), value);
//   },
// };

// Swap this single line to change storage engines app-wide, e.g.:
//   export const backend = firebaseBackend;
export const backend = localStorageBackend;
