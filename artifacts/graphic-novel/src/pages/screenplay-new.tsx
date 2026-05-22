import { useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useListModels, useCreateScreenplay, getListScreenplaysQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { FileUploader } from "@/components/file-uploader";
import { SpecificationsPresets } from "@/components/specifications-presets";

const formSchema = z.object({
  title: z.string().optional(),
  sourceText: z.string().min(1, "Source text is required"),
  specifications: z.string(),
  textModel: z.string().min(1, "Model is required"),
  explicit: z.boolean().default(false),
});

export default function ScreenplayNew() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: models = [] } = useListModels();
  const createScreenplay = useCreateScreenplay();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      sourceText: "",
      specifications: "",
      textModel: "zhi4",
      explicit: false,
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createScreenplay.mutate({
      data: values
    }, {
      onSuccess: (screenplay) => {
        queryClient.invalidateQueries({ queryKey: getListScreenplaysQueryKey() });
        setLocation(`/screenplay/${screenplay.id}`);
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <Button variant="ghost" className="mb-8 font-mono uppercase tracking-wider" onClick={() => setLocation("/")}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>

      <div className="mb-12">
        <h1 className="text-5xl font-serif font-black uppercase mb-4">New Screenplay</h1>
        <p className="font-mono text-muted-foreground uppercase tracking-widest border-b-4 border-border pb-4">
          Format your narrative into a professional comic script
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
                  <Input placeholder="Enter a title for your screenplay..." className="text-lg py-6" {...field} />
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

          <FormField
            control={form.control}
            name="specifications"
            render={({ field }) => (
              <FormItem className="p-8 border-4 border-border bg-muted/20">
                <FormLabel className="font-bold uppercase">Formatting & Adaptation Notes</FormLabel>
                <FormDescription className="font-mono text-xs">
                  How should we adapt this text? Non-fiction expository? Character-driven dialogue?
                </FormDescription>
                <FormControl>
                  <Textarea placeholder="e.g. Frame this as a documentary with an unseen narrator..." className="h-32" {...field} />
                </FormControl>
                <SpecificationsPresets value={field.value} onLoad={(t) => field.onChange(t)} />
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid md:grid-cols-2 gap-8 items-start border-t-4 border-border pt-8">
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

          <Button 
            type="submit" 
            className="w-full h-16 text-xl font-black font-serif uppercase tracking-widest mt-8"
            disabled={createScreenplay.isPending}
          >
            {createScreenplay.isPending ? (
              <><Loader2 className="w-6 h-6 mr-4 animate-spin" /> Formatting Script...</>
            ) : (
              "Generate Screenplay"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
