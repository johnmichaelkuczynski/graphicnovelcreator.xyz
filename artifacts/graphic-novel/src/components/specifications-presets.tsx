import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2 } from "lucide-react";

const STORAGE_KEY = "graphic-novel:specifications-presets";
const MAX_PRESETS = 10;

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

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const handleLoad = (name: string) => {
    setSelected(name);
    const p = presets.find((x) => x.name === name);
    if (p) onLoad(p.text);
  };

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      alert("Nothing to save — type some director's notes first.");
      return;
    }
    const name = window.prompt(
      `Name this preset (max ${MAX_PRESETS} saved; saving an existing name overwrites it):`,
      selected || "",
    );
    if (!name) return;
    const cleanName = name.trim().slice(0, 60);
    if (!cleanName) return;

    const existingIdx = presets.findIndex((p) => p.name === cleanName);
    let next: Preset[];
    if (existingIdx >= 0) {
      next = [...presets];
      next[existingIdx] = { name: cleanName, text: trimmed };
    } else {
      if (presets.length >= MAX_PRESETS) {
        alert(`You already have ${MAX_PRESETS} presets. Delete one first.`);
        return;
      }
      next = [...presets, { name: cleanName, text: trimmed }];
    }
    setPresets(next);
    savePresets(next);
    setSelected(cleanName);
  };

  const handleDelete = () => {
    if (!selected) return;
    if (!window.confirm(`Delete preset "${selected}"?`)) return;
    const next = presets.filter((p) => p.name !== selected);
    setPresets(next);
    savePresets(next);
    setSelected("");
  };

  return (
    <div className="flex items-center gap-2 mt-1">
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
        className="h-8 px-2"
        onClick={handleSave}
        title="Save current notes as a preset"
      >
        <Save className="h-3.5 w-3.5" />
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
    </div>
  );
}
