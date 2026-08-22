// Backup & restore of ALL on-device app data.
//
// Design note: rather than enumerating the individual store keys (progress:*,
// memory:*, history:*, stats:*, themeMode, fontScale, lastPosition, ...) - which
// would silently miss dynamic keys and any store added later - we snapshot the
// ENTIRE AsyncStorage keyspace. This keeps backups complete and future-proof:
// new stores are captured automatically with no changes here.
//
// A backup file is a small JSON envelope:
//   {
//     format: "bible-app-backup",
//     version: 1,
//     createdAt: "<ISO timestamp>",
//     app: { name, version },
//     data: { "<storageKey>": <parsedJSONValue>, ... }
//   }
//
// Values are stored already-parsed (not as raw strings) so the file is human
// readable and portable. On restore we re-serialise each value the same way the
// storage backend does (JSON.stringify) and write it straight to AsyncStorage.
//
// Delivery uses the Expo SDK 57 APIs:
//   - expo-file-system (new OO API: File/Paths) to write/read the file
//   - expo-sharing to hand the file to the OS share sheet
//   - expo-document-picker to let the user choose a file to restore

import AsyncStorage from "@react-native-async-storage/async-storage";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";

import { version as APP_VERSION } from "../../package.json";

export const BACKUP_FORMAT = "bible-app-backup";
export const BACKUP_VERSION = 1;

// Reads every AsyncStorage key/value into a plain object. Values are JSON
// parsed when possible so the backup file is readable; anything that isn't
// valid JSON is kept as its raw string (defensive - all our stores write JSON).
async function readAllData() {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  const data = {};
  for (const [key, raw] of pairs) {
    if (raw == null) continue;
    try {
      data[key] = JSON.parse(raw);
    } catch {
      data[key] = raw;
    }
  }
  return data;
}

// Builds the versioned backup envelope (also used directly by tests / a
// copy-paste fallback if one is ever added).
export async function buildBackupObject(now = new Date()) {
  const data = await readAllData();
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    app: { name: "Bible App", version: APP_VERSION },
    keyCount: Object.keys(data).length,
    data,
  };
}

// A filesystem-safe timestamp for the default filename, e.g. 2026-08-22_1139.
function fileTimestamp(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `_${p(now.getHours())}${p(now.getMinutes())}`
  );
}

// Creates a backup file in the cache directory and opens the OS share sheet so
// the user can save it (Files, Drive, email, AirDrop, ...). Returns the file
// uri. Throws if sharing is unavailable on the device.
export async function exportBackup(now = new Date()) {
  const payload = await buildBackupObject(now);
  const json = JSON.stringify(payload, null, 2);

  const file = new File(Paths.cache, `bible-backup_${fileTimestamp(now)}.json`);
  // Overwrite any stale file with the same name from an earlier export.
  if (file.exists) file.delete();
  file.create();
  file.write(json);

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    // Still leaves the file in cache; surface a clear error for the UI.
    throw new Error("Sharing is not available on this device.");
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: "application/json",
    dialogTitle: "Save Bible App backup",
    UTI: "public.json",
  });

  return { uri: file.uri, keyCount: payload.keyCount, createdAt: payload.createdAt };
}

// Validates a parsed backup object, throwing a user-friendly error if it isn't
// a recognisable backup. Returns the normalised `data` map on success.
export function validateBackup(obj) {
  if (!obj || typeof obj !== "object") {
    throw new Error("This file isn't a valid backup.");
  }
  if (obj.format !== BACKUP_FORMAT) {
    throw new Error("This file isn't a Bible App backup.");
  }
  if (typeof obj.version !== "number" || obj.version > BACKUP_VERSION) {
    throw new Error(
      "This backup was made by a newer version of the app. Please update first."
    );
  }
  if (!obj.data || typeof obj.data !== "object" || Array.isArray(obj.data)) {
    throw new Error("This backup file is missing its data.");
  }
  return obj.data;
}

// Restore semantics: REPLACE ALL. We clear every existing key, then write the
// backup's keys. Clearing first (rather than only overwriting) means keys that
// existed on this device but not in the backup are removed, so the result is an
// exact clone of the backup - no stale leftovers.
async function applyRestore(data) {
  await AsyncStorage.clear();
  const entries = Object.entries(data).map(([key, value]) => [
    key,
    JSON.stringify(value),
  ]);
  if (entries.length) await AsyncStorage.multiSet(entries);
  return entries.length;
}

// Opens the system document picker, reads the chosen JSON file, validates it,
// and replaces all app data with its contents. Returns:
//   { canceled: true }                      - user dismissed the picker
//   { canceled: false, keyCount, createdAt } - restore applied
// Throws on an invalid/corrupt file so the UI can show the message.
export async function importBackup() {
  const result = await DocumentPicker.getDocumentAsync({
    type: "application/json",
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return { canceled: true };

  const asset = result.assets && result.assets[0];
  if (!asset || !asset.uri) return { canceled: true };

  let text;
  try {
    text = await new File(asset.uri).text();
  } catch (e) {
    throw new Error("Couldn't read the selected file.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }

  const data = validateBackup(parsed);
  const keyCount = await applyRestore(data);
  return { canceled: false, keyCount, createdAt: parsed.createdAt || null };
}
