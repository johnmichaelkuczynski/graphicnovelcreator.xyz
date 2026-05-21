// Persistent local storage for exported video blobs, keyed by novel id.
// Uses IndexedDB so videos (which can easily be 50–200 MB) survive page reloads
// without bloating Postgres or eating localStorage's 5 MB quota.
//
// We deliberately do NOT auto-download anymore — the UI lets the user pick where
// to save each video via showSaveFilePicker (or a fallback <a download>) so they
// always know where the file went.

export interface SavedVideo {
  id: string;            // uuid
  novelId: number;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;     // unix ms
  blob: Blob;
}

const DB_NAME = "graphic-novel-videos";
const STORE = "videos";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("byNovel", "novelId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open IndexedDB"));
  });
}

function genId(): string {
  // crypto.randomUUID is available in all modern browsers; fall back just in case.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function saveVideo(input: {
  novelId: number;
  filename: string;
  blob: Blob;
}): Promise<SavedVideo> {
  const db = await openDb();
  const record: SavedVideo = {
    id: genId(),
    novelId: input.novelId,
    filename: input.filename,
    mimeType: input.blob.type || "video/mp4",
    size: input.blob.size,
    createdAt: Date.now(),
    blob: input.blob,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Save failed"));
  });
  db.close();
  return record;
}

export async function listVideosForNovel(novelId: number): Promise<SavedVideo[]> {
  const db = await openDb();
  const out = await new Promise<SavedVideo[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const idx = tx.objectStore(STORE).index("byNovel");
    const req = idx.getAll(novelId);
    req.onsuccess = () => resolve((req.result as SavedVideo[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("List failed"));
  });
  db.close();
  // Newest first.
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteVideo(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Delete failed"));
  });
  db.close();
}

// Trigger a user-controlled save: on Chromium/Edge this opens the native OS "Save As"
// dialog so the user picks the folder and confirms the filename; on browsers without
// File System Access API support, falls back to a regular <a download> click (which
// drops the file in the default Downloads folder, but at least lets the browser show
// its own download notification with the path).
export async function downloadVideo(video: SavedVideo): Promise<"saved" | "downloaded" | "canceled"> {
  // Feature-detect; Firefox + Safari don't have it as of 2025.
  const w = window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  };
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const ext = video.filename.split(".").pop() || "mp4";
      const handle = await w.showSaveFilePicker({
        suggestedName: video.filename,
        types: [
          {
            description: ext.toUpperCase() + " video",
            accept: { [video.mimeType || "video/mp4"]: ["." + ext] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(video.blob);
      await writable.close();
      return "saved";
    } catch (err) {
      // AbortError = user dismissed the picker. Anything else falls through to legacy download.
      if (err instanceof Error && err.name === "AbortError") return "canceled";
    }
  }
  // Legacy <a download> fallback.
  const url = URL.createObjectURL(video.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = video.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return "downloaded";
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
