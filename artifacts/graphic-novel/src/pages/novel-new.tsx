import { useState } from "react";
import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useListModels, useCreateNovel, getListNovelsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { FileUploader } from "@/components/file-uploader";
import { ReferenceImagesUploader, ReferenceImage } from "@/components/reference-images-uploader";
import { popRefinedRefs } from "@/lib/refined-refs";
import { ArtStylePicker } from "@/components/art-style-picker";
import { SpecificationsPresets } from "@/components/specifications-presets";
import { readAudioDuration, setPendingAudio, setNovelAudio, type AudioTrack } from "@/lib/audio-track";
import { Music, X } from "lucide-react";

const formSchema = z.object({
  title: z.string().optional(),
  sourceText: z.string().min(1, "Source text is required"),
  specifications: z.string(),
  artStyle: z.string(),
  panelCount: z.number().min(1).max(200),
  textModel: z.string().min(1, "Model is required"),
  explicit: z.boolean().default(false),
});

export default function NovelNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: models = [] } = useListModels();
  const createNovel = useCreateNovel();

  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>(() => popRefinedRefs());
  const [lengthUnit, setLengthUnit] = useState<"panels" | "seconds">("panels");
  const [audioTrack, setAudioTrack] = useState<AudioTrack | null>(null);
  const [audioError, setAudioError] = useState<string>("");

  const handleAudioFile = async (file: File | null) => {
    setAudioError("");
    if (!file) { setAudioTrack(null); setPendingAudio(null); return; }
    try {
      const durationSec = await readAudioDuration(file);
      const track: AudioTrack = { blob: file, filename: file.name, durationSec };
      setAudioTrack(track);
      setPendingAudio(track);
      // HARD RULE: if an MP3 is uploaded, the panel count MUST match its length.
      // 3 seconds per panel, only clamped at the absolute schema max (200) so the audio
      // duration — not a default — always determines panel count.
      const SEC_PER_PANEL = 3;
      const suggested = Math.max(1, Math.min(200, Math.round(durationSec / SEC_PER_PANEL)));
      form.setValue("panelCount", suggested, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      setLengthUnit("seconds");
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : "Could not read audio");
      setAudioTrack(null);
      setPendingAudio(null);
    }
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      sourceText: "",
      specifications: "",
      artStyle: "",
      panelCount: 12,
      textModel: "zhi4",
      explicit: false,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createNovel.mutate({
      data: {
        ...values,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
      }
    }, {
      onSuccess: (novel) => {
        // Bind the uploaded audio directly to the new novel's id so a stale pending blob can't
        // accidentally attach itself to a different novel the user opens next.
        if (audioTrack) {
          setNovelAudio(novel.id, audioTrack);
          setPendingAudio(null);
        }
        queryClient.invalidateQueries({ queryKey: getListNovelsQueryKey() });
        setLocation(`/novel/${novel.id}`);
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Button variant="ghost" className="mb-8 font-mono uppercase tracking-wider" onClick={() => setLocation("/")}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div className="mb-12">
        <h1 className="text-5xl font-serif font-black uppercase mb-4">New Graphic Novel</h1>
        <p className="font-mono text-muted-foreground uppercase tracking-widest border-b-4 border-border pb-4">
          Transform your text into a visual masterpiece
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xl font-bold font-serif uppercase">Title</FormLabel>
                <FormControl>
                  <Input placeholder="Enter a title for your novel..." className="text-lg py-6" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-4">
            <div className="text-xl font-bold font-serif uppercase">Source Text</div>
            <FileUploader 
              onExtracted={(text) => {
                const current = form.getValues("sourceText");
                form.setValue("sourceText", current ? `${current}\n\n${text}` : text);
              }} 
            />
            <FormField
              control={form.control}
              name="sourceText"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea 
                      placeholder="Paste your essay, story, or article here..." 
                      className="min-h-[300px] font-mono" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-8 p-8 border-4 border-border bg-muted/20">
            <FormField
              control={form.control}
              name="specifications"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold uppercase">Director's Notes</FormLabel>
                  <FormDescription className="font-mono text-xs">Characters, pacing, layout instructions.</FormDescription>
                  <FormControl>
                    <Textarea placeholder="e.g. A noir detective story. Three main characters..." className="h-32" {...field} />
                  </FormControl>
                  <SpecificationsPresets value={field.value} onLoad={(t) => field.onChange(t)} />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="artStyle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold uppercase">Art Direction</FormLabel>
                  <FormDescription className="font-mono text-xs">Pick a style or write your own.</FormDescription>
                  <ArtStylePicker value={field.value} onChange={field.onChange} />
                  <FormControl>
                    <Textarea placeholder="e.g. High contrast black and white ink, Frank Miller style..." className="h-32 mt-2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-bold font-serif uppercase">Reference Assets</h3>
            <p className="font-mono text-sm text-muted-foreground">Upload images for character consistency or style reference.</p>
            <ReferenceImagesUploader images={referenceImages} onChange={setReferenceImages} />
          </div>

          <div className="space-y-4 border-4 border-border p-6 bg-muted/20">
            <div className="flex items-center gap-3">
              <Music className="w-6 h-6" />
              <h3 className="text-xl font-bold font-serif uppercase">Soundtrack (Optional)</h3>
            </div>
            <p className="font-mono text-sm text-muted-foreground">
              Upload an MP3 or WAV and the exported MP4 will exactly match its length, with the audio muxed in.
              Perfect for turning a music track into a TikTok-ready video. Panel count auto-adjusts to fit.
            </p>
            {audioTrack ? (
              <div className="flex items-center justify-between gap-4 border-2 border-border p-4 bg-background">
                <div className="font-mono text-sm min-w-0">
                  <div className="font-bold truncate">{audioTrack.filename}</div>
                  <div className="text-muted-foreground text-xs mt-1">
                    {Math.floor(audioTrack.durationSec / 60)}m {Math.round(audioTrack.durationSec % 60)}s · MP4 will match this length
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAudioFile(null)}
                  className="p-2 border-2 border-border hover:bg-destructive hover:text-destructive-foreground"
                  aria-label="Remove audio"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Input
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/*,.mp3,.wav"
                onChange={(e) => handleAudioFile(e.target.files?.[0] ?? null)}
                className="font-mono"
              />
            )}
            {audioError && <p className="font-mono text-sm text-destructive">{audioError}</p>}
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start border-t-4 border-border pt-8">
            <FormField
              control={form.control}
              name="panelCount"
              render={({ field }) => {
                const SEC_PER_PANEL = 3;
                const seconds = field.value * SEC_PER_PANEL;
                const mins = Math.floor(seconds / 60);
                const secs = seconds % 60;
                const durationLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                return (
                  <FormItem>
                    <FormLabel className="font-bold uppercase flex justify-between items-center">
                      <span>Length</span>
                      <div className="flex gap-2 text-xs font-mono normal-case">
                        <button
                          type="button"
                          onClick={() => setLengthUnit("panels")}
                          className={`px-2 py-1 border-2 ${lengthUnit === "panels" ? "bg-foreground text-background border-foreground" : "border-border"}`}
                        >
                          Panels
                        </button>
                        <button
                          type="button"
                          onClick={() => setLengthUnit("seconds")}
                          className={`px-2 py-1 border-2 ${lengthUnit === "seconds" ? "bg-foreground text-background border-foreground" : "border-border"}`}
                        >
                          MP4 Duration
                        </button>
                      </div>
                    </FormLabel>
                    {lengthUnit === "panels" ? (
                      <>
                        <div className="flex justify-between font-mono text-sm">
                          <span className="text-primary font-bold">{field.value} Panels</span>
                          <span className="text-muted-foreground">≈ {durationLabel} MP4</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={1}
                            max={200}
                            step={1}
                            value={[field.value]}
                            onValueChange={(vals) => field.onChange(vals[0])}
                            className="py-4"
                          />
                        </FormControl>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between font-mono text-sm">
                          <span className="text-primary font-bold">{durationLabel} MP4</span>
                          <span className="text-muted-foreground">= {field.value} panels @ {SEC_PER_PANEL}s each</span>
                        </div>
                        <FormControl>
                          <Slider
                            min={SEC_PER_PANEL}
                            max={200 * SEC_PER_PANEL}
                            step={SEC_PER_PANEL}
                            value={[seconds]}
                            onValueChange={(vals) => field.onChange(Math.max(1, Math.round((vals[0] ?? SEC_PER_PANEL) / SEC_PER_PANEL)))}
                            className="py-4"
                          />
                        </FormControl>
                        <FormDescription className="font-mono text-xs">
                          MP4 export plays each panel for {SEC_PER_PANEL}s. Range: {SEC_PER_PANEL}s – {200 * SEC_PER_PANEL / 60}m.
                        </FormDescription>
                      </>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <div className="space-y-6">
              <FormField
                control={form.control}
                name="textModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold uppercase">Text Model</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="h-12 text-lg font-mono">
                          <SelectValue placeholder="Select an AI Model" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem key={model.id} value={model.id}>
                            <div className="flex items-center gap-2">
                              {model.label}
                              <Tooltip>
                                <TooltipTrigger type="button">
                                  <Info className="w-4 h-4 text-muted-foreground" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Provider: {model.provider}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="explicit"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between border-2 border-border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="font-bold uppercase">Explicit Content</FormLabel>
                      <FormDescription className="font-mono text-xs">
                        Forces Venice model for unrestricted text generation.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-16 text-xl font-black font-serif uppercase tracking-widest mt-8"
            disabled={createNovel.isPending}
          >
            {createNovel.isPending ? (
              <><Loader2 className="w-6 h-6 mr-4 animate-spin" /> Igniting Presses...</>
            ) : (
              "Generate Novel"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
