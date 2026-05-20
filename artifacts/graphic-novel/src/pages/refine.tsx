import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, Loader2, Check, X, Sparkles, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useCreateRefinement } from "@workspace/api-client-react";
import { addRefinedRef } from "@/lib/refined-refs";

interface Iteration {
  instructions: string;
  description: string;
  sampleImageDataUrl: string;
  feedback?: string;
}

export default function Refine() {
  const [, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [originalDataUrl, setOriginalDataUrl] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [feedback, setFeedback] = useState("");
  const [explicit, setExplicit] = useState(true);

  const createRefinement = useCreateRefinement();

  const current = iterations[iterations.length - 1];

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") setOriginalDataUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const generate = async () => {
    if (!originalDataUrl || !label.trim() || !instructions.trim()) return;
    // Do NOT resend sampleImageDataUrl — it bloats requests; the server only needs text.
    const history = iterations.slice(-5).map((it) => ({
      instructions: it.instructions,
      description: it.description,
      feedback: it.feedback,
    }));
    try {
      const result = await createRefinement.mutateAsync({
        data: {
          dataUrl: originalDataUrl,
          label: label.trim(),
          instructions: instructions.trim(),
          explicit,
          history,
        },
      });
      setIterations([
        ...iterations,
        {
          instructions: instructions.trim(),
          description: result.description,
          sampleImageDataUrl: result.sampleImageDataUrl,
        },
      ]);
      setFeedback("");
    } catch (err) {
      alert("Refinement failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const reject = () => {
    if (!current) return;
    // Annotate the last iteration with feedback and clear instructions for next round.
    setIterations((prev) => {
      const next = [...prev];
      next[next.length - 1] = { ...next[next.length - 1], feedback: feedback.trim() || "(rejected without comment)" };
      return next;
    });
    const next = feedback.trim()
      ? `${instructions.trim()}\n\nLast attempt was rejected: ${feedback.trim()}`
      : instructions.trim();
    setInstructions(next);
    setFeedback("");
  };

  const approve = () => {
    if (!current || !originalDataUrl) return;
    addRefinedRef({
      label: label.trim(),
      dataUrl: current.sampleImageDataUrl,
      description: current.description,
    });
    setLocation("/novel/new");
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex justify-between items-center mb-12">
        <Button variant="ghost" className="font-mono uppercase tracking-wider" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Library
        </Button>
      </div>

      <header className="mb-12 text-center space-y-4">
        <h1 className="text-5xl md:text-6xl font-serif font-black uppercase leading-tight">
          Reference Fine-Tuning
        </h1>
        <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground max-w-2xl mx-auto">
          Upload a photo. Iterate on the model's interpretation until you're happy. Then approve it to lock it in for your next novel.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-8">
        <section className="space-y-6 p-8 border-4 border-border bg-muted/10">
          <h2 className="text-xl font-bold font-serif uppercase">1. Reference</h2>

          {originalDataUrl ? (
            <div className="relative border-2 border-border bg-card">
              <img src={originalDataUrl} alt="Reference" className="w-full h-72 object-contain bg-black" />
              <button
                type="button"
                className="absolute top-2 right-2 bg-destructive text-white p-1 rounded-full"
                onClick={() => { setOriginalDataUrl(null); setIterations([]); }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-muted-foreground/50 h-72 flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:text-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 mb-3" />
              <span className="font-mono text-sm uppercase tracking-widest">Upload Reference Photo</span>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

          <div className="space-y-2">
            <label className="font-mono text-xs uppercase tracking-widest">Label</label>
            <Input
              placeholder="e.g. 'Main Character' or 'Sarah'"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs uppercase tracking-widest">Instructions</label>
            <Textarea
              placeholder="e.g. Draw him in the style of Picasso. Make him look more like Clark Kent. Less skinny. Add a scar over the left eye."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="min-h-[140px] font-mono"
            />
          </div>

          <div className="flex items-center justify-between border-2 border-border p-3 bg-background">
            <div>
              <p className="font-mono text-xs uppercase tracking-widest font-bold">Explicit / Adult</p>
              <p className="font-mono text-[10px] text-muted-foreground mt-1">
                Required for nudity or adult content — uses the uncensored model. Mainstream models will refuse and return an unrelated image.
              </p>
            </div>
            <Switch checked={explicit} onCheckedChange={setExplicit} />
          </div>

          <Button
            onClick={generate}
            disabled={!originalDataUrl || !label.trim() || !instructions.trim() || createRefinement.isPending}
            className="w-full font-bold uppercase tracking-widest"
          >
            {createRefinement.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating Interpretation...</>
            ) : iterations.length === 0 ? (
              <><Sparkles className="w-4 h-4 mr-2" /> Generate First Interpretation</>
            ) : (
              <><Sparkles className="w-4 h-4 mr-2" /> Re-Generate With These Instructions</>
            )}
          </Button>
        </section>

        <section className="space-y-6 p-8 border-4 border-border bg-muted/10">
          <h2 className="text-xl font-bold font-serif uppercase">2. Interpretation</h2>

          {!current && (
            <div className="h-72 flex items-center justify-center font-mono text-sm uppercase tracking-widest text-muted-foreground border-2 border-dashed border-border">
              No interpretation yet.
            </div>
          )}

          {current && (
            <>
              <div className="border-2 border-border bg-card">
                <img src={current.sampleImageDataUrl} alt="Interpretation" className="w-full h-72 object-contain bg-black" />
              </div>

              <details className="border-2 border-border p-4 bg-background">
                <summary className="font-mono text-xs uppercase tracking-widest cursor-pointer">
                  Model's description ({current.description.length} chars)
                </summary>
                <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed">{current.description}</pre>
              </details>

              <div className="space-y-2">
                <label className="font-mono text-xs uppercase tracking-widest">If rejecting — what fell short?</label>
                <Textarea
                  placeholder="e.g. Hair color is wrong. Eyes should be blue, not brown. Make him angrier."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="min-h-[100px] font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button variant="outline" onClick={reject} disabled={createRefinement.isPending} className="font-bold uppercase tracking-widest">
                  <X className="w-4 h-4 mr-2" /> Pass — Iterate
                </Button>
                <Button onClick={approve} disabled={createRefinement.isPending} className="font-bold uppercase tracking-widest bg-green-600 hover:bg-green-700">
                  <Check className="w-4 h-4 mr-2" /> Approve & Use
                </Button>
              </div>
            </>
          )}
        </section>
      </div>

      {iterations.length > 1 && (
        <section className="mt-12 space-y-4">
          <h3 className="font-bold font-serif uppercase text-lg">Iteration history</h3>
          <div className="grid sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {iterations.slice(0, -1).map((it, i) => (
              <div key={i} className="border-2 border-border bg-card">
                <img src={it.sampleImageDataUrl} alt={`Iter ${i + 1}`} className="w-full aspect-square object-cover" />
                <div className="p-2 space-y-1">
                  <p className="font-mono text-[10px] uppercase tracking-widest">#{i + 1}</p>
                  {it.feedback && <p className="font-mono text-[10px] text-destructive line-clamp-3">{it.feedback}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-12 text-center">
        <Button variant="ghost" onClick={() => setLocation("/novel/new")} className="font-mono uppercase tracking-wider">
          <Plus className="w-4 h-4 mr-2" /> Skip — Go to Novel Builder
        </Button>
      </div>
    </div>
  );
}
