// In-memory per-tab store for an MP3 (or other audio) track to mux into the exported MP4.
// Survives wouter (client-side) navigation between /novel/new and /novel/:id, but is lost on
// full page refresh — in that case the user can re-attach the audio from the detail page.

export interface AudioTrack {
  blob: Blob;
  filename: string;
  durationSec: number;
}

const store = new Map<string, AudioTrack>();

// A "pending" slot is used between novel-new (where the user uploads the MP3 before knowing the
// novel ID) and novel-detail (where we move it under the real novel ID).
const PENDING_KEY = "__pending__";

export function setPendingAudio(track: AudioTrack | null): void {
  if (track) store.set(PENDING_KEY, track);
  else store.delete(PENDING_KEY);
}

export function takePendingAudio(): AudioTrack | null {
  const t = store.get(PENDING_KEY) ?? null;
  if (t) store.delete(PENDING_KEY);
  return t;
}

export function setNovelAudio(novelId: number | string, track: AudioTrack): void {
  store.set(String(novelId), track);
}

export function getNovelAudio(novelId: number | string): AudioTrack | null {
  return store.get(String(novelId)) ?? null;
}

export function clearNovelAudio(novelId: number | string): void {
  store.delete(String(novelId));
}

export async function readAudioDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      URL.revokeObjectURL(url);
      if (!isFinite(d) || d <= 0) reject(new Error("Could not read audio duration"));
      else resolve(d);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load audio file"));
    };
    audio.src = url;
  });
}
