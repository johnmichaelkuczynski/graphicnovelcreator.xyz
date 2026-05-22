import type { ReferenceImage } from "@/components/reference-images-uploader";

export interface NovelPrefill {
  title: string;
  sourceText: string;
  specifications: string;
  artStyle: string;
  panelCount: number;
  textModel: string;
  explicit: boolean;
  referenceImages: ReferenceImage[];
}

const KEY = "graphic-novel:novel-prefill";

export function setNovelPrefill(p: NovelPrefill): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota / unavailable — silently drop */
  }
}

export function popNovelPrefill(): NovelPrefill | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as NovelPrefill;
  } catch {
    return null;
  }
}
