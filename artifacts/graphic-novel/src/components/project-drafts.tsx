import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, Check, X, FolderOpen } from "lucide-react";

const STORAGE_KEY = "graphic-novel:project-drafts";
const MAX_DRAFTS = 20;

export type ProjectDraft = {
  name: string;
  savedAt: string;
  data: {
    title?: string;
    sourceText?: string;
    specifications?: string;
    artStyle?: string;
    panelCount?: number;
    textModel?: string;
    explicit?: boolean;
    [k: string]: unknown;
  };
};

function loadDrafts(): ProjectDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.name === "string" && p.data && typeof p.data === "object")
      .slice(0, MAX_DRAFTS);
  } catch {
    return [];
  }
}

function saveDrafts(drafts: ProjectDraft[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts.slice(0, MAX_DRAFTS)));
  } catch (err) {
    // Quota exceeded — most likely reference image data URLs blew the cap.
    // Caller has already chosen to exclude them, so just surface the error.
    throw err;
  }
}

export function ProjectDrafts({
  capture,
  onLoad,
}: {
  capture: () => ProjectDraft["data"];
  onLoad: (data: ProjectDraft["data"]) => void;
}) {
  const [drafts, setDrafts] = useState<ProjectDraft[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [hint, setHint] = useState("");

  useEffect(() => {
    setDrafts(loadDrafts());
  }, []);

  const flashHint = (msg: string) => {
    setHint(msg);
    setTimeout(() => setHint(""), 3000);
  };

  const handleLoad = (name: string) => {
    setSelected(name);
    const d = drafts.find((x) => x.name === name);
    if (d) {
      onLoad(d.data);
      flashHint(`Loaded "${name}"`);
    }
  };

  const startSave = () => {
    setDraftName(selected || "");
    setNaming(true);
  };

  const commitSave = () => {
    const cleanName = draftName.trim().slice(0, 80);
    if (!cleanName) {
      flashHint("Name required.");
      return;
    }
    const data = capture();
    const entry: ProjectDraft = { name: cleanName, savedAt: new Date().toISOString(), data };
    const existingIdx = drafts.findIndex((d) => d.name === cleanName);
    let next: ProjectDraft[];
    if (existingIdx >= 0) {
      next = [...drafts];
      next[existingIdx] = entry;
    } else {
      if (drafts.length >= MAX_DRAFTS) {
        flashHint(`Max ${MAX_DRAFTS} projects — delete one first.`);
        return;
      }
      next = [...drafts, entry];
    }
    try {
      saveDrafts(next);
      setDrafts(next);
      setSelected(cleanName);
      setNaming(false);
      setDraftName("");
      flashHint(`Saved "${cleanName}"`);
    } catch {
      flashHint("Save failed — browser storage full.");
    }
  };

  const handleDelete = () => {
    if (!selected) return;
    const next = drafts.filter((d) => d.name !== selected);
    try {
      saveDrafts(next);
      setDrafts(next);
      const removed = selected;
      setSelected("");
      flashHint(`Deleted "${removed}"`);
    } catch {
      flashHint("Delete failed.");
    }
  };

  return (
    <div className="border-4 border-border bg-muted/20 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <FolderOpen className="w-4 h-4" />
        <h3 className="font-bold font-serif uppercase tracking-wider text-sm">Saved Projects</h3>
        <span className="font-mono text-xs text-muted-foreground ml-auto">
          {drafts.length}/{MAX_DRAFTS} · Title, source, notes, art style, length, model, explicit (no images/audio)
        </span>
      </div>
      <div className="flex items-center gap-2">
        {naming ? (
          <>
            <Input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitSave(); }
                if (e.key === "Escape") { e.preventDefault(); setNaming(false); setDraftName(""); }
              }}
              placeholder="Name this project…"
              className="h-9 text-sm font-mono flex-1"
              maxLength={80}
            />
            <Button type="button" variant="default" size="sm" className="h-9 px-3" onClick={commitSave}>
              <Check className="h-4 w-4 mr-1" /> Save
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-9 px-3" onClick={() => { setNaming(false); setDraftName(""); }}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <Select value={selected} onValueChange={handleLoad}>
              <SelectTrigger className="h-9 text-sm font-mono flex-1">
                <SelectValue placeholder={drafts.length ? "Load saved project…" : "No saved projects yet"} />
              </SelectTrigger>
              <SelectContent>
                {drafts.map((d) => (
                  <SelectItem key={d.name} value={d.name} className="text-sm font-mono">
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={startSave}
              className="h-9 px-3 font-mono text-xs uppercase tracking-wider"
            >
              <Save className="h-4 w-4 mr-1" /> Save Project
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={!selected}
              className="h-9 px-3"
              title="Delete selected project"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {hint && <div className="text-xs font-mono text-muted-foreground">{hint}</div>}
    </div>
  );
}
