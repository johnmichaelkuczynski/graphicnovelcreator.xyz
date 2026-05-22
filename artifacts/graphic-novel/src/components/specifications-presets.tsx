import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, Check, X } from "lucide-react";

const STORAGE_KEY = "graphic-novel:specifications-presets";
const MAX_PRESETS = 20;

type Preset = { name: string; text: string };

const BUILTIN_PRESETS: Preset[] = [
  {
    name: "Noir Detective",
    text: "Hard-boiled noir. Rain-slicked streets, venetian blind shadows, cigarette smoke. Lone detective protagonist in trench coat and fedora. Pacing: brooding, deliberate. Layout: heavy black gutters, occasional full-bleed splash panel for revelations. Captions read like internal monologue.",
  },
  {
    name: "Cosmic Horror",
    text: "Lovecraftian dread. Coastal New England town, fog, impossible geometry. Color palette restricted to sickly greens, bruised purples, bone whites. Pacing: slow build, escalating wrongness. Layout: panels should feel constrained at first, then break into chaotic asymmetric grids as reality fractures.",
  },
  {
    name: "Cyberpunk Heist",
    text: "Neon-drenched megacity, 2087. Crew of four: netrunner, muscle, face, driver. Pacing: fast cuts, high tension. Layout: dense panels with diagonal slashes during action, wide letterbox panels for establishing shots. Lots of holographic UI overlays in the art direction.",
  },
  {
    name: "Slice of Life",
    text: "Quiet contemporary drama. Single protagonist navigating ordinary moments — coffee shops, train rides, late-night kitchens. Pacing: meditative, room to breathe. Layout: regular grids, minimal action lines, frequent silent panels. Captions are sparse and reflective.",
  },
  {
    name: "Mythic Fantasy",
    text: "High fantasy epic. Ensemble cast on a quest. Sweeping landscapes — mountains, ancient forests, ruined citadels. Pacing: chapter-like, alternating travel montages with character moments. Layout: tall vertical panels for grandeur, wide panels for landscapes, tight grids for dialogue.",
  },
  {
    name: "Shōnen Action",
    text: "Manga-style action. Teenage protagonist with a signature power. Pacing: explosive set-pieces with rapid-fire reaction shots. Layout: dynamic diagonal panels, speed lines, impact frames. Frequent close-ups on eyes and clenched fists. Big dramatic reveals get full-page splashes.",
  },
  {
    name: "Indie Memoir",
    text: "Autobiographical indie comic. First-person narration. Loose, hand-drawn feel. Pacing: associative, jumping between past and present. Layout: irregular panel sizes, hand-lettered captions, lots of white space. Single character focus across most panels.",
  },
  {
    name: "Western Showdown",
    text: "Spaghetti western. Dusty frontier town, harsh sun, long shadows. Lone gunslinger vs. corrupt local power. Pacing: long tense stares, then sudden violence. Layout: extreme close-ups on eyes and hands intercut with wide desert vistas. Sergio Leone framing.",
  },
];

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const userPresets: Preset[] = (() => {
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (p) => p && typeof p.name === "string" && typeof p.text === "string",
      );
    })();
    const userNames = new Set(userPresets.map((p) => p.name));
    const builtins = BUILTIN_PRESETS.filter((p) => !userNames.has(p.name));
    return [...builtins, ...userPresets].slice(0, MAX_PRESETS);
  } catch {
    return [...BUILTIN_PRESETS];
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
              className="h-8 px-2"
              onClick={startSave}
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
          </>
        )}
      </div>
      {hint && (
        <div className="text-xs font-mono text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
