export interface RefinedReference {
  label: string;
  dataUrl: string;
  description: string;
}

const KEY = "graphic-novel:refined-refs";

export function getRefinedRefs(): RefinedReference[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r) => r && r.label && r.dataUrl && r.description);
  } catch {
    return [];
  }
}

export function addRefinedRef(ref: RefinedReference): void {
  const existing = getRefinedRefs();
  sessionStorage.setItem(KEY, JSON.stringify([...existing, ref]));
}

export function clearRefinedRefs(): void {
  sessionStorage.removeItem(KEY);
}

export function popRefinedRefs(): RefinedReference[] {
  const refs = getRefinedRefs();
  clearRefinedRefs();
  return refs;
}
