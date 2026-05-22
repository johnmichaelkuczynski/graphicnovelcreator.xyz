import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, Check, X } from "lucide-react";

const STORAGE_KEY = "graphic-novel:specifications-presets";
const MAX_PRESETS = 20;

type Preset = { name: string; text: string };

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p.name === "string" && typeof p.text === "string")
      .slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
}

export function SpecificationsPresets({
  value,
  onLoad,
}: {
  value: string;
  onLoad: (text: string) => void;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [hint, setHint] = useState<string>("");

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const flashHint = (msg: string) => {
    setHint(msg);
    setTimeout(() => setHint(""), 2500);
  };

  const handleLoad = (name: string) => {
    setSelected(name);
    const p = presets.find((x) => x.name === name);
    if (p) onLoad(p.text);
  };

  const startSave = () => {
    if (!value.trim()) {
      flashHint("Type some notes first.");
      return;
    }
    setDraftName(selected || "");
    setNaming(true);
  };

  const commitSave = () => {
    const cleanName = draftName.trim().slice(0, 60);
    if (!cleanName) {
      flashHint("Name required.");
      return;
    }
    const existingIdx = presets.findIndex((p) => p.name === cleanName);
    let next: Preset[];
    if (existingIdx >= 0) {
      next = [...presets];
      next[existingIdx] = { name: cleanName, text: value.trim() };
    } else {
      if (presets.length >= MAX_PRESETS) {
        flashHint(`Max ${MAX_PRESETS} presets — delete one first.`);
        return;
      }
      next = [...presets, { name: cleanName, text: value.trim() }];
    }
    setPresets(next);
    savePresets(next);
    setSelected(cleanName);
    setNaming(false);
    setDraftName("");
    flashHint(`Saved "${cleanName}"`);
  };

  const handleDelete = () => {
    if (!selected) return;
    const next = presets.filter((p) => p.name !== selected);
    setPresets(next);
    savePresets(next);
    const removed = selected;
    setSelected("");
    flashHint(`Deleted "${removed}"`);
  };

  return (
    <div className="mt-1 space-y-1">
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
              placeholder="Name this preset…"
              className="h-8 text-xs font-mono flex-1"
              maxLength={60}
            />
            <Button type="button" variant="default" size="sm" className="h-8 px-2" onClick={commitSave} title="Confirm save">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={() => { setNaming(false); setDraftName(""); }} title="Cancel">
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Select value={selected} onValueChange={handleLoad}>
              <SelectTrigger className="h-8 text-xs font-mono flex-1">
                <SelectValue placeholder={presets.length ? "Load preset…" : "No saved presets"} />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p.name} value={p.name} className="text-xs font-mono">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startSave}
              title="Save current notes as a preset"
              className="h-8 px-2 font-mono text-xs uppercase tracking-wider"
            >
              <Save className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              onClick={handleDelete}
              disabled={!selected}
              title="Delete selected preset"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
      {hint && (
        <div className="text-xs font-mono text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
