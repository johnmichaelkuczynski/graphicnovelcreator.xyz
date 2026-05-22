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

import { ReferenceImagesUploader, ReferenceImage } from "@/components/reference-images-uploader";
import { SpecificationsPresets } from "@/components/specifications-presets";
import { popRefinedRefs } from "@/lib/refined-refs";
import { ArtStylePicker } from "@/components/art-style-picker";

const formSchema = z.object({
  title: z.string().optional(),
  sourceText: z.string().min(1, "Description is required"),
  specifications: z.string(),
  artStyle: z.string(),
  panelCount: z.number().min(1).max(200),
  textModel: z.string().min(1, "Model is required"),
  explicit: z.boolean().default(false),
});

export default function ImageNovelNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: models = [] } = useListModels();
  const createNovel = useCreateNovel();

  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>(() => popRefinedRefs());

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
    if (referenceImages.length === 0) return; // Wait for at least 1 image
    createNovel.mutate({
      data: {
        ...values,
        referenceImages,
      }
    }, {
      onSuccess: (novel) => {
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
        <h1 className="text-5xl font-serif font-black uppercase mb-4">Image to Novel</h1>
        <p className="font-mono text-muted-foreground uppercase tracking-widest border-b-4 border-border pb-4">
          Seed your graphic novel with a visual foundation
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

          <div className="space-y-4 p-8 border-4 border-primary bg-primary/5">
            <h3 className="text-xl font-bold font-serif uppercase">Seed Image(s)</h3>
            <p className="font-mono text-sm text-muted-foreground mb-4">
              Upload at least one image that will serve as the foundation for the visual style and subject matter.
            </p>
            <ReferenceImagesUploader images={referenceImages} onChange={setReferenceImages} required />
          </div>

          <FormField
            control={form.control}
            name="sourceText"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xl font-bold font-serif uppercase">Image Description & Story</FormLabel>
                <FormDescription className="font-mono text-xs mb-2">
                  Describe how this image is the basis for the novel. What is the story?
                </FormDescription>
                <FormControl>
                  <Textarea 
                    placeholder="This image is a concept of a cyberpunk detective in Neo-Tokyo. Write a story about..." 
                    className="min-h-[200px] font-mono" 
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid md:grid-cols-2 gap-8 p-8 border-4 border-border bg-muted/20">
            <FormField
              control={form.control}
              name="specifications"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold uppercase">Director's Notes</FormLabel>
                  <FormDescription className="font-mono text-xs">Pacing, mood, layout instructions.</FormDescription>
                  <FormControl>
                    <Textarea placeholder="e.g. High action, fast paced..." className="h-32" {...field} />
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
                    <Textarea placeholder="e.g. Exactly like the reference image, high contrast neon..." className="h-32 mt-2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start border-t-4 border-border pt-8">
            <FormField
              control={form.control}
              name="panelCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold uppercase flex justify-between">
                    <span>Panel Count</span>
                    <span className="text-primary">{field.value} Panels</span>
                  </FormLabel>
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
                  <FormMessage />
                </FormItem>
              )}
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
            disabled={createNovel.isPending || referenceImages.length === 0}
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
