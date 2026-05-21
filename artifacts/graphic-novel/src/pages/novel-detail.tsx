import { useLocation, useParams } from "wouter";
import { useGetNovel, getGetNovelQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Download, Printer, Loader2, AlertCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { exportNovelVideo } from "@/lib/video-export";
import {
  takePendingAudio,
  setNovelAudio,
  getNovelAudio,
  clearNovelAudio,
  readAudioDuration,
  type AudioTrack,
} from "@/lib/audio-track";
import { Music, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function NovelDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const [exportingVideo, setExportingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [audioTrack, setAudioTrackState] = useState<AudioTrack | null>(null);
  const [audioError, setAudioError] = useState("");

  // On mount, take any audio uploaded on /novel/new and bind it to this novel id.
  // If we navigated back to this page later, restore from the per-novel slot.
  useEffect(() => {
    if (!id) return;
    const existing = getNovelAudio(id);
    if (existing) {
      setAudioTrackState(existing);
      return;
    }
    const pending = takePendingAudio();
    if (pending) {
      setNovelAudio(id, pending);
      setAudioTrackState(pending);
    }
  }, [id]);

  const handleAudioFile = async (file: File | null) => {
    setAudioError("");
    if (!id) return;
    if (!file) { clearNovelAudio(id); setAudioTrackState(null); return; }
    try {
      const durationSec = await readAudioDuration(file);
      const t: AudioTrack = { blob: file, filename: file.name, durationSec };
      setNovelAudio(id, t);
      setAudioTrackState(t);
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : "Could not read audio");
    }
  };

  const { data: novel, isLoading, error } = useGetNovel(Number(id), {
    query: {
      enabled: !!id,
      queryKey: getGetNovelQueryKey(Number(id)),
      refetchInterval: (q) => {
        const status = q.state.data?.status;
        return (status === 'done' || status === 'failed') ? false : 2000;
      }
    }
  });

  const handlePrint = () => {
    window.print();
  };

  const handleExportVideo = async () => {
    if (!novel) return;
    setExportingVideo(true);
    setVideoProgress(0);
    try {
      await exportNovelVideo({
        title: novel.title || "Untitled Issue",
        panels: novel.panels
          .filter((p) => p.status === "done" && p.imageDataUrl)
          .map((p) => ({ caption: p.caption || "", imageDataUrl: p.imageDataUrl! })),
        secondsPerPanel: 3,
        audioBlob: audioTrack?.blob,
        syncToAudio: !!audioTrack,
        onProgress: (p) => setVideoProgress(p),
      });
    } catch (err) {
      console.error("Video export failed", err);
      alert("Video export failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExportingVideo(false);
      setVideoProgress(0);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <h2 className="text-xl font-mono uppercase tracking-widest">Loading Press...</h2>
      </div>
    );
  }

  if (error || !novel) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center space-y-4">
        <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
        <h1 className="text-3xl font-black uppercase">Failed to load novel</h1>
        <Button onClick={() => setLocation("/")} variant="outline">Return Home</Button>
      </div>
    );
  }

  const isGenerating = novel.status === 'pending' || novel.status === 'generating';
  const progress = novel.panelCount > 0 ? (novel.panels.filter(p => p.status === 'done').length / novel.panelCount) * 100 : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="print:hidden flex justify-between items-center mb-12">
        <Button variant="ghost" className="font-mono uppercase tracking-wider" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Library
        </Button>
        <div className="flex gap-2">
          <Button onClick={handlePrint} disabled={isGenerating || exportingVideo} variant="outline" className="font-bold uppercase tracking-widest">
            <Printer className="w-4 h-4 mr-2" /> Export PDF
          </Button>
          <Button onClick={handleExportVideo} disabled={isGenerating || exportingVideo} className="font-bold uppercase tracking-widest">
            {exportingVideo ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {Math.round(videoProgress * 100)}%</>
            ) : (
              <><Video className="w-4 h-4 mr-2" /> Export Video (TikTok)</>
            )}
          </Button>
        </div>
      </div>

      <header className="mb-16 text-center space-y-6">
        <h1 className="text-5xl md:text-7xl font-serif font-black uppercase leading-tight">
          {novel.title || "Untitled Issue"}
        </h1>
        <div className="font-mono text-sm uppercase tracking-widest text-muted-foreground flex justify-center gap-4 border-y-4 border-border py-4">
          <span>{novel.panelCount} Panels</span>
          <span>•</span>
          <span>{novel.artStyle || "Standard Ink"}</span>
          <span>•</span>
          <span>{format(new Date(novel.createdAt), 'MMMM yyyy')}</span>
        </div>
      </header>

      <div className="print:hidden mb-12 border-4 border-border p-6 bg-muted/20 space-y-3">
        <div className="flex items-center gap-3">
          <Music className="w-5 h-5" />
          <h3 className="font-bold font-serif uppercase tracking-wider">Soundtrack for MP4 Export</h3>
        </div>
        {audioTrack ? (
          <div className="flex items-center justify-between gap-4 border-2 border-border p-3 bg-background">
            <div className="font-mono text-sm min-w-0">
              <div className="font-bold truncate">{audioTrack.filename}</div>
              <div className="text-muted-foreground text-xs mt-1">
                {Math.floor(audioTrack.durationSec / 60)}m {Math.round(audioTrack.durationSec % 60)}s · MP4 will be muxed to match this length
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
          <>
            <p className="font-mono text-xs text-muted-foreground">
              Attach an MP3 and the exported MP4 will exactly match its length, with the audio muxed in. Great for music videos.
            </p>
            <Input
              type="file"
              accept="audio/mpeg,audio/mp3,audio/*"
              onChange={(e) => handleAudioFile(e.target.files?.[0] ?? null)}
              className="font-mono"
            />
          </>
        )}
        {audioError && <p className="font-mono text-xs text-destructive">{audioError}</p>}
      </div>

      {isGenerating && (
        <div className="print:hidden mb-16 p-8 border-4 border-border bg-muted/10 text-center space-y-6">
          <h3 className="text-2xl font-bold font-serif uppercase animate-pulse text-primary">Generating Artwork...</h3>
          <Progress value={progress} className="h-4 rounded-none border-2 border-border" />
          <p className="font-mono text-sm uppercase">
            Completed {novel.panels.filter(p => p.status === 'done').length} of {novel.panelCount} panels
          </p>
        </div>
      )}

      {novel.status === 'failed' && (
        <div className="mb-16 p-8 border-4 border-destructive bg-destructive/10 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h3 className="text-2xl font-bold font-serif uppercase text-destructive">Generation Failed</h3>
          <p className="font-mono text-sm">{novel.error || "An unknown error occurred during generation."}</p>
        </div>
      )}

      <div className="space-y-16 print:space-y-8">
        {novel.panels.map((panel, idx) => (
          <motion.div 
            key={panel.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: idx * 0.1 }}
            className="flex flex-col gap-6"
          >
            {panel.caption && (
              <div className="max-w-2xl mx-auto w-full border-2 border-border p-4 bg-background shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
                <p className="font-serif text-lg md:text-xl leading-relaxed">
                  {panel.caption}
                </p>
              </div>
            )}
            
            <div className="relative aspect-[3/2] md:aspect-video w-full border-4 border-border bg-muted flex items-center justify-center overflow-hidden print:border-2">
              {panel.status === 'done' && panel.imageDataUrl ? (
                <img src={panel.imageDataUrl} alt={`Panel ${idx + 1}`} className="w-full h-full object-cover" />
              ) : panel.status === 'failed' ? (
                <div className="text-center p-4">
                  <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                  <p className="font-mono text-xs uppercase text-destructive">Image Generation Failed</p>
                  <p className="font-mono text-xs mt-2 opacity-50">{panel.error}</p>
                </div>
              ) : (
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Drawing Panel {idx + 1}...</p>
                </div>
              )}
              <div className="absolute bottom-2 right-2 bg-background border-2 border-border px-2 py-1 font-mono text-xs font-bold">
                {idx + 1}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .dark {
             --border: 0 0% 0% !important;
             --background: 0 0% 100% !important;
             --foreground: 0 0% 0% !important;
          }
          * {
            box-shadow: none !important;
          }
          @page {
            margin: 2cm;
          }
        }
      `}} />
    </div>
  );
}
