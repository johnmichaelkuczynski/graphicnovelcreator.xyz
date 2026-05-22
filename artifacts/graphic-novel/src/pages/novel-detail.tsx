import { useLocation, useParams } from "wouter";
import { useGetNovel, getGetNovelQueryKey, useRegenerateNovel, useRepairNovel, useAbortNovel } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, Loader2, AlertCircle, Video, RotateCcw, Wrench, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { exportNovelVideo } from "@/lib/video-export";
import { saveVideo, listVideosForNovel, deleteVideo, downloadVideo, formatBytes, type SavedVideo } from "@/lib/video-storage";
import { Download, Trash2, FileVideo } from "lucide-react";
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
  const [savedVideos, setSavedVideos] = useState<SavedVideo[]>([]);
  const [exportNotice, setExportNotice] = useState("");
  const queryClient = useQueryClient();
  const regenerate = useRegenerateNovel();
  const repair = useRepairNovel();
  const abort = useAbortNovel();
  const [repairInstructions, setRepairInstructions] = useState("");
  const [repairNotice, setRepairNotice] = useState("");

  // Load any previously-saved exports for this novel out of IndexedDB.
  useEffect(() => {
    if (!id) return;
    listVideosForNovel(Number(id)).then(setSavedVideos).catch(() => setSavedVideos([]));
  }, [id]);

  const handleRegenerate = () => {
    if (!id) return;
    const novelId = Number(id);
    regenerate.mutate(
      { id: novelId },
      {
        onSuccess: (fresh) => {
          // Replace the cached novel with the freshly-reset one (no panels, pending status)
          // so the UI immediately shows the "Generating..." state and the existing failed
          // panels disappear without waiting for the next refetch.
          queryClient.setQueryData(getGetNovelQueryKey(novelId), fresh);
          queryClient.invalidateQueries({ queryKey: getGetNovelQueryKey(novelId) });
        },
      },
    );
  };

  // Surgical repair: server scans every panel for the blank-image failure mode
  // and re-rolls just those (plus any panel marked failed). Optional free-form
  // instructions get appended to the prompt for the panels being redone.
  const handleRepair = () => {
    if (!id) return;
    const novelId = Number(id);
    setRepairNotice("");
    repair.mutate(
      { id: novelId, data: { instructions: repairInstructions.trim() || undefined } },
      {
        onSuccess: (result) => {
          if (result.targetedPanels === 0) {
            setRepairNotice("No bad panels found — everything checked out clean.");
          } else {
            setRepairNotice(
              `Re-rolling ${result.targetedPanels} panel${result.targetedPanels === 1 ? "" : "s"}: ${result.reasons.map((r) => `#${r.idx + 1} (${r.reason})`).join(", ")}`,
            );
            setRepairInstructions("");
            queryClient.invalidateQueries({ queryKey: getGetNovelQueryKey(novelId) });
          }
        },
        onError: (err) => {
          setRepairNotice(err instanceof Error ? `Repair failed: ${err.message}` : "Repair failed");
        },
      },
    );
  };

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
    setExportNotice("");
    try {
      const result = await exportNovelVideo({
        title: novel.title || "Untitled Issue",
        panels: novel.panels
          .filter((p) => p.status === "done" && p.imageDataUrl)
          .map((p) => ({ caption: p.caption || "", imageDataUrl: p.imageDataUrl! })),
        secondsPerPanel: 3,
        audioBlob: audioTrack?.blob,
        syncToAudio: !!audioTrack,
        onProgress: (p) => setVideoProgress(p),
      });
      // Persist to IndexedDB so it survives reloads and stays visible in the Saved
      // Exports panel below — no more silent disappearance into the OS Downloads folder.
      const saved = await saveVideo({
        novelId: Number(id),
        filename: result.filename,
        blob: result.blob,
      });
      setSavedVideos((prev) => [saved, ...prev]);
      // Surface the post-export verification so the user has concrete proof every
      // slide had the same screen time and that the music and video line up.
      const v = result.verification;
      const perSlide = v.secondsPerPanel.toFixed(3);
      const dur = v.actualDurationSec.toFixed(3);
      const audioLine =
        v.audioDurationSec != null
          ? ` Audio is ${v.audioDurationSec.toFixed(3)}s, video is ${dur}s — locked to within ${((v.audioVideoDeltaSec ?? 0) * 1000).toFixed(0)} ms.`
          : "";
      setExportNotice(
        `Saved "${saved.filename}" (${formatBytes(saved.size)}). Verified: ${v.panelCount} slides × ${perSlide}s each, total ${dur}s.${audioLine}`,
      );
    } catch (err) {
      console.error("Video export failed", err);
      alert("Video export failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExportingVideo(false);
      setVideoProgress(0);
    }
  };

  const handleDownloadSaved = async (v: SavedVideo) => {
    try {
      const result = await downloadVideo(v);
      if (result === "saved") setExportNotice(`Saved "${v.filename}" to your chosen location.`);
      else if (result === "downloaded") setExportNotice(`Downloading "${v.filename}" via your browser — check your Downloads folder.`);
    } catch (err) {
      alert("Download failed: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDeleteSaved = async (v: SavedVideo) => {
    await deleteVideo(v.id);
    setSavedVideos((prev) => prev.filter((x) => x.id !== v.id));
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
          {isGenerating && (
            <Button
              onClick={() => {
                if (!id) return;
                const novelId = Number(id);
                abort.mutate(
                  { id: novelId },
                  {
                    onSuccess: (fresh) => {
                      queryClient.setQueryData(getGetNovelQueryKey(novelId), fresh);
                      queryClient.invalidateQueries({ queryKey: getGetNovelQueryKey(novelId) });
                    },
                  },
                );
              }}
              disabled={abort.isPending}
              variant="destructive"
              className="font-bold uppercase tracking-widest"
              title="Stop the in-progress generation immediately"
            >
              {abort.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Aborting...</>
              ) : (
                <><Square className="w-4 h-4 mr-2 fill-current" /> Abort</>
              )}
            </Button>
          )}
          <Button
            onClick={handleRegenerate}
            disabled={isGenerating || regenerate.isPending || exportingVideo}
            variant="outline"
            className="font-bold uppercase tracking-widest"
            title="Wipe existing panels and re-run generation with the same inputs"
          >
            {regenerate.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Restarting...</>
            ) : (
              <><RotateCcw className="w-4 h-4 mr-2" /> Regenerate</>
            )}
          </Button>
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
              Attach an MP3 or WAV and the exported MP4 will exactly match its length, with the audio muxed in. Great for music videos.
            </p>
            <Input
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/*,.mp3,.wav"
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

      {/* Surgical Quality-Control Repair — scans for blank/failed panels and re-rolls
          ONLY those, optionally with extra instructions appended to their prompt. */}
      {!isGenerating && novel.panels.length > 0 && (
        <div className="print:hidden mb-12 border-4 border-border p-6 bg-muted/20 space-y-3">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5" />
            <h3 className="font-bold font-serif uppercase tracking-wider">Quality Control & Repair</h3>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Scan every panel for the blank-image failure mode (all black / all white / solid color) and re-roll just the bad ones. Optionally add a directive like "make the protagonist male" or "no nudity" — it will be appended to the prompt for every panel being redone.
          </p>
          <textarea
            value={repairInstructions}
            onChange={(e) => setRepairInstructions(e.target.value)}
            placeholder="Optional repair directive (e.g. 'get rid of the blank panels and make sure every panel shows an actual scene')"
            rows={2}
            disabled={repair.isPending}
            maxLength={2000}
            className="w-full font-mono text-sm border-2 border-border bg-background p-3 resize-y"
          />
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <Button
              onClick={handleRepair}
              disabled={repair.isPending || regenerate.isPending || exportingVideo}
              className="font-bold uppercase tracking-widest"
            >
              {repair.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning & Repairing...</>
              ) : (
                <><Wrench className="w-4 h-4 mr-2" /> Run Quality Check & Repair</>
              )}
            </Button>
            {repairNotice && (
              <p className="font-mono text-xs flex-1 min-w-0 break-words">{repairNotice}</p>
            )}
          </div>
        </div>
      )}

      {/* Saved video exports — kept in the browser's IndexedDB so they survive reloads. */}
      {(savedVideos.length > 0 || exportNotice) && (
        <div className="print:hidden mb-16 border-4 border-border p-6 space-y-4 bg-card">
          <div className="flex items-center gap-3">
            <FileVideo className="w-6 h-6" />
            <h3 className="text-xl font-bold font-serif uppercase">Saved Exports</h3>
            <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
              ({savedVideos.length} stored in this browser)
            </span>
          </div>
          {exportNotice && (
            <div className="border-2 border-primary bg-primary/10 p-3 font-mono text-sm">
              {exportNotice}
            </div>
          )}
          {savedVideos.length === 0 ? (
            <p className="font-mono text-sm text-muted-foreground">
              No saved exports yet — hit Export Video to render one.
            </p>
          ) : (
            <ul className="divide-y-2 divide-border border-2 border-border">
              {savedVideos.map((v) => (
                <li key={v.id} className="flex items-center gap-4 p-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate">{v.filename}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {formatBytes(v.size)} · {v.mimeType} · {format(new Date(v.createdAt), 'PP p')}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleDownloadSaved(v)}
                    className="font-mono uppercase tracking-wider"
                  >
                    <Download className="w-4 h-4 mr-2" /> Download
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteSaved(v)}
                    aria-label="Delete saved video"
                    title="Delete saved video"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
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
                <img src={panel.imageDataUrl} alt={`Panel ${idx + 1}`} className="w-full h-full object-contain bg-muted" />
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
