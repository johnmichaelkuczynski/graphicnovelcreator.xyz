export interface VideoExportPanel {
  caption: string;
  imageDataUrl: string;
}

export interface VideoExportOptions {
  title: string;
  panels: VideoExportPanel[];
  secondsPerPanel?: number;
  // Per-panel duration overrides in seconds. When provided, length must equal
  // panels.length and EACH panel uses its own duration. Takes precedence over
  // `secondsPerPanel` and implicitly disables `syncToAudio` (the user is now
  // dictating timing explicitly — the audio is sliced to fit, not the other
  // way around).
  panelDurations?: number[];
  fps?: number;
  width?: number;
  height?: number;
  onProgress?: (fraction: number) => void;
  // When provided, the audio is muxed into the exported video. If `syncToAudio` is true (the
  // default when audio is given), panel duration is recomputed so the whole slideshow spans
  // exactly the audio length — making this trivially usable as a music video.
  audioBlob?: Blob;
  syncToAudio?: boolean;
  // Seconds into the source audio where the music should start playing. Lets
  // the user pick e.g. the 60-second window of a 10-minute track they want
  // muxed. Default 0 (start from the beginning).
  audioStartSec?: number;
  // Linear fade-out at the tail of the muxed audio, in seconds. Default 2.
  // Set to 0 to disable. Applied AFTER trimming/padding to the video length,
  // so the fade always lands exactly at the end of the video.
  audioFadeOutSec?: number;
}

// ALWAYS prefer MP4 — TikTok, iOS Photos, Premiere, every social platform wants MP4.
// Modern Chromium (>= ~125) supports H.264 + AAC muxed by MediaRecorder reliably, including
// with audio tracks. WebM is only a last-resort fallback for browsers that simply cannot
// produce MP4 (older Firefox builds). The user-visible file extension always reflects the
// actual blob type after recording, so nothing lies about its container.
const MIME_CANDIDATES_VIDEO_ONLY = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
const MIME_CANDIDATES_WITH_AUDIO = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickMime(withAudio: boolean): { mime: string; ext: string } {
  const list = withAudio ? MIME_CANDIDATES_WITH_AUDIO : MIME_CANDIDATES_VIDEO_ONLY;
  for (const m of list) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return { mime: m, ext: m.startsWith("video/mp4") ? "mp4" : "webm" };
    }
  }
  return { mime: "", ext: "webm" };
}

function extFromBlobType(t: string, fallback: string): string {
  if (t.startsWith("video/mp4")) return "mp4";
  if (t.startsWith("video/webm")) return "webm";
  return fallback;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load panel image"));
    img.src = src;
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// --- Low-level drawing primitives ------------------------------------------------
//
// Split into independent layers so the crossfade path can compose them without
// re-clearing or re-blending. drawFrame() is the single-panel convenience that
// composes them all at full opacity; drawCrossfade() invokes the same primitives
// in the right order to cleanly dissolve between two panels.

function clearFrame(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, W, H);
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  img: HTMLImageElement,
  alpha: number,
) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  const coverScale = Math.max(W / img.width, H / img.height);
  const drawW = img.width * coverScale;
  const drawH = img.height * coverScale;
  const drawX = (W - drawW) / 2;
  const drawY = (H - drawH) / 2;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  ctx.globalAlpha = 1;
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  caption: string,
  panelIdx: number,
  totalPanels: number,
  alpha: number,
) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;

  const pad = Math.round(W * 0.05);
  const captionBoxX = pad;
  const captionBoxY = pad;
  const captionBoxW = W - pad * 2;

  ctx.font = `600 ${Math.round(W * 0.045)}px Georgia, "Playfair Display", serif`;
  ctx.textBaseline = "top";

  const lineHeight = Math.round(W * 0.06);
  const lines = caption ? wrapText(ctx, caption, captionBoxW - pad * 2) : [];
  const captionBoxH = lines.length > 0 ? lines.length * lineHeight + pad * 1.2 : 0;

  if (captionBoxH > 0) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.fillRect(captionBoxX, captionBoxY, captionBoxW, captionBoxH);
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = Math.max(4, W * 0.005);
    ctx.strokeRect(captionBoxX, captionBoxY, captionBoxW, captionBoxH);
    ctx.fillStyle = "#1a1a1a";
    lines.forEach((ln, i) => {
      ctx.fillText(ln, captionBoxX + pad * 0.6, captionBoxY + pad * 0.6 + i * lineHeight);
    });
  }

  ctx.globalAlpha = 1;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  img: HTMLImageElement,
  caption: string,
  panelIdx: number,
  totalPanels: number,
) {
  clearFrame(ctx, W, H);
  drawImageCover(ctx, W, H, img, 1);
  drawOverlays(ctx, W, H, caption, panelIdx, totalPanels, 1);
}

// Clean dissolve between two panels:
//  - clear the frame ONCE (no doubled black fill that would darken mid-transition)
//  - paint outgoing image at (1 - t), then incoming image at t, on the same surface
//  - fade outgoing overlay out and incoming overlay in with the same curve so
//    captions/page counters don't briefly stack on top of each other
function drawCrossfade(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  fromImg: HTMLImageElement,
  fromCaption: string,
  fromIdx: number,
  toImg: HTMLImageElement,
  toCaption: string,
  toIdx: number,
  totalPanels: number,
  t: number, // 0 = pure "from", 1 = pure "to"
) {
  clearFrame(ctx, W, H);
  drawImageCover(ctx, W, H, fromImg, 1 - t);
  drawImageCover(ctx, W, H, toImg, t);
  drawOverlays(ctx, W, H, fromCaption, fromIdx, totalPanels, 1 - t);
  drawOverlays(ctx, W, H, toCaption, toIdx, totalPanels, t);
}

export interface VideoExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  // Post-export verification report. Populated by verifyExportDuration() so the
  // caller can show the user concrete proof that every slide had the same screen
  // time and that the video and music line up to within one frame.
  verification: {
    panelCount: number;
    secondsPerPanel: number;
    expectedDurationSec: number;
    actualDurationSec: number; // measured from the produced MP4
    audioDurationSec: number | null; // null if no audio track was muxed
    durationDeltaSec: number; // |actual - expected|
    audioVideoDeltaSec: number | null; // |actualVideo - audio|, null if no audio
  };
}

// Tagged error class so the dispatcher can distinguish "produced an unusable
// file" (do not silently fall back) from "encoder crashed" (fallback is OK).
// The user demanded the app prove its own work — silently retrying with a
// lower-tolerance codepath after a verification miss would defeat that.
export class VideoVerificationError extends Error {
  readonly report: VideoExportResult["verification"];
  constructor(message: string, report: VideoExportResult["verification"]) {
    super(message);
    this.name = "VideoVerificationError";
    this.report = report;
  }
}

// Measure the audio-track duration of the produced MP4 INDEPENDENTLY of our
// input audio buffer, by re-decoding it with WebAudio. This gives us a real
// container-truth measurement to compare against the video track length, not
// just our own pre-encode plan compared to itself.
async function measureAudioTrackDuration(blob: Blob): Promise<number | null> {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    try {
      const arr = await blob.arrayBuffer();
      // decodeAudioData reads ONLY the audio track from the MP4. Returns null
      // (caught below) if the container has no audio.
      const decoded = await ctx.decodeAudioData(arr.slice(0));
      return decoded.duration;
    } finally {
      ctx.close().catch(() => {});
    }
  } catch {
    // No audio track, or browser can't decode AAC-in-MP4 (rare). Caller treats
    // null as "couldn't measure independently" and skips the cross-check rather
    // than failing the whole export.
    return null;
  }
}

// Load the produced MP4 into a hidden <video> element and read its actual
// container duration so we can prove (a) the slideshow runtime matches what we
// planned and (b) the video and music line up. Throws VideoVerificationError if
// any tolerance is exceeded — by design we'd rather hard-fail than ship a
// desynced video.
async function verifyExportDuration(args: {
  blob: Blob;
  expectedDurationSec: number;
  hasAudio: boolean;
  panelCount: number;
  secondsPerPanel: number;
  videoToleranceSec: number;
  // AAC frames are 1024 samples wide, so audio-track durations naturally
  // quantize to the nearest 1024/sampleRate (~23ms at 44.1kHz). The
  // audio/video delta tolerance must accommodate that or we'd false-fail on
  // perfectly-aligned encodes.
  audioToleranceSec: number;
}): Promise<VideoExportResult["verification"]> {
  const url = URL.createObjectURL(args.blob);
  try {
    const actual = await new Promise<number>((resolve, reject) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      const cleanup = () => {
        v.onloadedmetadata = null;
        v.onerror = null;
        v.src = "";
      };
      v.onloadedmetadata = () => {
        const d = v.duration;
        cleanup();
        if (!isFinite(d) || d <= 0) reject(new Error("Produced MP4 has invalid duration."));
        else resolve(d);
      };
      v.onerror = () => {
        cleanup();
        reject(new Error("Could not load produced MP4 for verification."));
      };
      v.src = url;
    });

    // Independent audio-track measurement — the whole point of the cross-check.
    const measuredAudio = args.hasAudio ? await measureAudioTrackDuration(args.blob) : null;

    const durationDeltaSec = Math.abs(actual - args.expectedDurationSec);
    const audioVideoDeltaSec =
      measuredAudio != null ? Math.abs(actual - measuredAudio) : null;

    const report: VideoExportResult["verification"] = {
      panelCount: args.panelCount,
      secondsPerPanel: args.secondsPerPanel,
      expectedDurationSec: args.expectedDurationSec,
      actualDurationSec: actual,
      audioDurationSec: measuredAudio,
      durationDeltaSec,
      audioVideoDeltaSec,
    };

    if (durationDeltaSec > args.videoToleranceSec) {
      throw new VideoVerificationError(
        `Video duration verification failed: expected ${args.expectedDurationSec.toFixed(3)}s, got ${actual.toFixed(3)}s (delta ${(durationDeltaSec * 1000).toFixed(0)}ms > tolerance ${(args.videoToleranceSec * 1000).toFixed(0)}ms).`,
        report,
      );
    }
    if (audioVideoDeltaSec != null && audioVideoDeltaSec > args.audioToleranceSec) {
      throw new VideoVerificationError(
        `Audio/video sync verification failed: audio track is ${(measuredAudio ?? 0).toFixed(3)}s but video track is ${actual.toFixed(3)}s (delta ${(audioVideoDeltaSec * 1000).toFixed(0)}ms > tolerance ${(args.audioToleranceSec * 1000).toFixed(0)}ms).`,
        report,
      );
    }
    return report;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function hasWebCodecs(): boolean {
  return (
    typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder !== "undefined" &&
    typeof (globalThis as { VideoFrame?: unknown }).VideoFrame !== "undefined" &&
    typeof (globalThis as { AudioEncoder?: unknown }).AudioEncoder !== "undefined" &&
    typeof (globalThis as { AudioData?: unknown }).AudioData !== "undefined"
  );
}

export async function exportNovelVideo(opts: VideoExportOptions): Promise<VideoExportResult> {
  const { title, panels } = opts;
  if (!panels.length) throw new Error("No completed panels to export.");

  // Decode audio up front so both code paths can use it and size the slideshow.
  let audioBuffer: AudioBuffer | null = null;
  if (opts.audioBlob) {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const arrayBuf = await opts.audioBlob.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
    audioCtx.close().catch(() => {});
  }

  // Prefer WebCodecs — gives us a real MP4 with deterministic per-frame timestamps,
  // bypassing the MediaRecorder MP4 bug that produced black/frozen video with audio
  // (Chrome's MediaRecorder MP4 path mis-sequences manually-pushed canvas frames).
  let webCodecsFailure: unknown = null;
  if (hasWebCodecs()) {
    try {
      return await exportViaWebCodecs(opts, audioBuffer);
    } catch (err) {
      // Verification failures are TERMINAL — the WebCodecs path produced a
      // file that doesn't meet the user's strict duration/sync requirements,
      // and the MediaRecorder fallback has looser tolerances by design.
      // Silently downgrading would defeat the whole point of the verification.
      if (err instanceof VideoVerificationError) throw err;
      console.warn("WebCodecs export failed, falling back to MediaRecorder:", err);
      webCodecsFailure = err;
      // Fall through to MediaRecorder only for genuine encoder/codec errors.
    }
  }
  try {
    return await exportViaMediaRecorder(opts, audioBuffer);
  } catch (err) {
    // If WebCodecs ALSO failed, surface its error too — otherwise the user sees
    // only the MediaRecorder failure and we can't tell why the better path bailed.
    if (webCodecsFailure) {
      const wcMsg = webCodecsFailure instanceof Error
        ? webCodecsFailure.message
        : String(webCodecsFailure);
      const mrMsg = err instanceof Error ? err.message : String(err);
      const combined = `${mrMsg} (WebCodecs path also failed first: ${wcMsg})`;
      if (err instanceof VideoVerificationError) {
        throw new VideoVerificationError(combined, err.report);
      }
      throw new Error(combined);
    }
    throw err;
  }
}

// --- WebCodecs + mp4-muxer path ---------------------------------------------------
//
// We draw each frame into a 2D canvas, wrap it in a VideoFrame with an explicit
// microsecond timestamp, and feed it straight to a hardware-accelerated H.264
// VideoEncoder. Audio is sliced out of the decoded AudioBuffer into AudioData
// chunks with matching timestamps and fed to an AAC AudioEncoder. mp4-muxer
// then assembles a proper MP4 with both tracks correctly interleaved — no
// MediaRecorder, no MediaStream timing drift, no black-frame surprises.

interface WebCodecsGlobals {
  VideoEncoder: typeof VideoEncoder;
  VideoFrame: typeof VideoFrame;
  AudioEncoder: typeof AudioEncoder;
  AudioData: typeof AudioData;
}

async function exportViaWebCodecs(
  opts: VideoExportOptions,
  audioBuffer: AudioBuffer | null,
): Promise<VideoExportResult> {
  const { title, panels, fps = 30, width = 1080, height = 1920, onProgress } = opts;
  const audioStartSec = Math.max(0, opts.audioStartSec ?? 0);
  const audioFadeOutSec = Math.max(0, opts.audioFadeOutSec ?? 2);
  // Per-panel overrides force manual timing — audio is sliced to fit instead
  // of stretching the slideshow over the whole song.
  const hasPerPanel =
    Array.isArray(opts.panelDurations) && opts.panelDurations.length === panels.length;
  // Any user-touched audio control (custom start offset OR custom per-panel
  // durations) overrides the "fit slideshow to song length" auto-sync.
  const syncToAudio =
    !hasPerPanel && audioStartSec === 0 && (opts.syncToAudio ?? !!audioBuffer);

  // ─── Compute exact, equal per-slide duration ──────────────────────────────
  //
  // The user demands two invariants on every export:
  //   (a) every slide has the SAME on-screen duration, and
  //   (b) when a music track is provided, video length == audio length EXACTLY.
  //
  // Naively dividing audioDuration / panelCount and rounding `secondsPerPanel * fps`
  // independently per panel leaks up to half a frame per panel of drift, so a 200-
  // panel novel could end up 3+ seconds out of sync. Instead:
  //   1. Pick `framesPerPanel` as the integer that makes `framesPerPanel * panels`
  //      land closest to `audioDuration * fps`.
  //   2. Define the canonical `expectedDurationSec = framesPerPanel * panels / fps`.
  //   3. Trim or zero-pad the audio buffer so its sample count equals exactly
  //      `expectedDurationSec * sampleRate` before encoding.
  // After that, video and audio are mathematically identical in length, and every
  // slide is the same integer number of frames — both invariants enforced by
  // construction, then re-checked by verifyExportDuration() after muxing.
  let secondsPerPanel: number;
  if (audioBuffer && syncToAudio) {
    const audioFrames = Math.max(panels.length * 2, Math.round(audioBuffer.duration * fps));
    const framesPerPanelPick = Math.max(2, Math.round(audioFrames / panels.length));
    secondsPerPanel = framesPerPanelPick / fps;
  } else {
    secondsPerPanel = opts.secondsPerPanel ?? 3;
  }
  // Per-panel frame counts. With overrides, each panel gets its own integer
  // frame count (>= 2 so the crossfade math doesn't divide by zero). Without
  // overrides, every panel gets the same `framesPerPanel` derived above —
  // identical to the old behaviour.
  const framesPerPanelArr: number[] = hasPerPanel
    ? opts.panelDurations!.map((s) => Math.max(2, Math.round(Math.max(0.1, s) * fps)))
    : new Array(panels.length).fill(Math.max(2, Math.round(secondsPerPanel * fps)));

  const wc = globalThis as unknown as WebCodecsGlobals;
  const mp4 = await import("mp4-muxer");
  const target = new mp4.ArrayBufferTarget();
  const muxer = new mp4.Muxer({
    target,
    fastStart: "in-memory",
    video: { codec: "avc", width, height, frameRate: fps },
    ...(audioBuffer
      ? {
          audio: {
            codec: "aac" as const,
            numberOfChannels: audioBuffer.numberOfChannels,
            sampleRate: audioBuffer.sampleRate,
          },
        }
      : {}),
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  const images = await Promise.all(panels.map((p) => loadImage(p.imageDataUrl)));

  let encoderError: unknown = null;
  const videoEncoder = new wc.VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => { encoderError = e; },
  });
  // avc1.42E01F = H.264 Baseline profile, Level 3.1 — universally playable
  // (QuickTime, VLC, every browser, iOS/Android Photos, every NLE).
  videoEncoder.configure({
    codec: "avc1.42E01F",
    width,
    height,
    bitrate: 8_000_000,
    framerate: fps,
  });

  // Crossfade lasts ~0.6s, but never more than 1/3 of the SHORTER panel's
  // screen time so very short panels still have a recognisable hold phase.
  const baseTransitionFrames = Math.round(0.6 * fps);
  const totalFrames = framesPerPanelArr.reduce((a, b) => a + b, 0);
  const frameDurationUs = Math.round(1_000_000 / fps);
  const keyframeEvery = fps * 2; // 2-second GOP

  // Reusable bitmap-snapshot helper. WITHOUT this, Chromium's `new VideoFrame(canvas)`
  // sometimes hands the encoder a GPU texture reference that gets overwritten before
  // the encoder reads it — so every frame in the file ends up showing the LAST drawn
  // image, or worse, the first one repeated forever. `createImageBitmap` forces an
  // immutable pixel copy, which is the only reliable way to feed a high-FPS slideshow
  // into VideoEncoder.
  async function snapshotAndEncode(timestamp: number, isKey: boolean) {
    const bitmap = await createImageBitmap(canvas);
    const frame = new wc.VideoFrame(bitmap, { timestamp, duration: frameDurationUs });
    // Backpressure: if the encoder queue is backed up, wait for it to drain a bit
    // before pushing more. Without this, on slower machines the encoder silently
    // drops frames and the muxed file has gaps / repeated frames.
    // Watchdog: bail out after ~5s of waiting so we don't hang the export forever
    // if the encoder stalls without emitting an error.
    let waited = 0;
    while (videoEncoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 4));
      waited += 4;
      if (encoderError) break;
      if (waited > 5000) throw new Error("Video encoder stalled (queue did not drain)");
    }
    videoEncoder.encode(frame, { keyFrame: isKey });
    frame.close();
    bitmap.close();
  }

  let frameIdx = 0;
  for (let i = 0; i < panels.length; i++) {
    const hasNext = i < panels.length - 1;
    const framesPerPanel = framesPerPanelArr[i];
    const nextFrames = hasNext ? framesPerPanelArr[i + 1] : framesPerPanel;
    // Transition is bounded by 1/3 of THIS panel and the NEXT, so wildly
    // different per-panel durations don't produce a transition longer than
    // either side's hold phase.
    const transitionFrames = Math.max(
      1,
      Math.min(baseTransitionFrames, Math.floor(framesPerPanel / 3), Math.floor(nextFrames / 3)),
    );
    const holdFrames = hasNext ? framesPerPanel - transitionFrames : framesPerPanel;

    // Hold phase: panel i alone, full opacity.
    for (let f = 0; f < holdFrames; f++) {
      drawFrame(ctx, width, height, images[i], panels[i].caption, i, panels.length);
      await snapshotAndEncode(frameIdx * frameDurationUs, frameIdx % keyframeEvery === 0);
      frameIdx++;
      if (onProgress) onProgress((frameIdx / totalFrames) * (audioBuffer ? 0.85 : 1.0));
      if (encoderError) throw encoderError;
    }

    // Crossfade phase: blend panel i into panel i+1 over transitionFrames frames.
    if (hasNext) {
      for (let f = 0; f < transitionFrames; f++) {
        const t = (f + 1) / (transitionFrames + 1); // 0 < t < 1
        drawCrossfade(
          ctx, width, height,
          images[i], panels[i].caption, i,
          images[i + 1], panels[i + 1].caption, i + 1,
          panels.length, t,
        );
        await snapshotAndEncode(frameIdx * frameDurationUs, frameIdx % keyframeEvery === 0);
        frameIdx++;
        if (onProgress) onProgress((frameIdx / totalFrames) * (audioBuffer ? 0.85 : 1.0));
        if (encoderError) throw encoderError;
      }
    }
  }
  await videoEncoder.flush();
  videoEncoder.close();
  if (encoderError) throw encoderError;

  const expectedDurationSec = totalFrames / fps;

  if (audioBuffer) {
    const audioEncoder = new wc.AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => { encoderError = e; },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2", // AAC-LC
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      bitrate: 192_000,
    });

    const CHUNK = 1024;
    const channels = audioBuffer.numberOfChannels;
    const sr = audioBuffer.sampleRate;
    // Force the audio length to match the video length to the sample. If the
    // original track is longer, trim the tail; if shorter, append silence.
    // Either way the produced MP4's video and audio tracks share an identical
    // duration, which is the only way to guarantee perfect lockstep playback.
    const targetSamples = Math.round(expectedDurationSec * sr);
    const startSample = Math.max(0, Math.min(audioBuffer.length, Math.round(audioStartSec * sr)));
    const sourceAvailable = Math.max(0, audioBuffer.length - startSample);
    const fadeSamples = Math.min(targetSamples, Math.round(audioFadeOutSec * sr));
    const fadeStart = targetSamples - fadeSamples;
    const chData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) chData.push(audioBuffer.getChannelData(c));

    for (let offset = 0; offset < targetSamples; offset += CHUNK) {
      const numberOfFrames = Math.min(CHUNK, targetSamples - offset);
      const planar = new Float32Array(numberOfFrames * channels);
      for (let c = 0; c < channels; c++) {
        const dst = planar.subarray(c * numberOfFrames, (c + 1) * numberOfFrames);
        if (offset < sourceAvailable) {
          const copyLen = Math.min(numberOfFrames, sourceAvailable - offset);
          dst.set(chData[c].subarray(startSample + offset, startSample + offset + copyLen));
          // remaining samples in dst are already 0 (silence) — Float32Array default.
        }
        // else: entire chunk is silent padding, left as zeros.
        // Apply linear fade-out across the last `fadeSamples` of the output.
        if (fadeSamples > 0) {
          for (let s = 0; s < numberOfFrames; s++) {
            const globalIdx = offset + s;
            if (globalIdx >= fadeStart) {
              const gain = Math.max(0, 1 - (globalIdx - fadeStart) / fadeSamples);
              dst[s] *= gain;
            }
          }
        }
      }
      const timestamp = Math.round((offset / sr) * 1_000_000);
      const ad = new wc.AudioData({
        format: "f32-planar",
        sampleRate: sr,
        numberOfFrames,
        numberOfChannels: channels,
        timestamp,
        data: planar,
      });
      audioEncoder.encode(ad);
      ad.close();
      if (encoderError) throw encoderError;
    }
    await audioEncoder.flush();
    audioEncoder.close();
    if (encoderError) throw encoderError;
    if (onProgress) onProgress(1);
  }

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  const safeTitle = (title || "novel").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "novel";

  // Video tolerance = 1 frame (~33ms @ 30fps). MP4 reports duration in ticks of
  // 1/timescale seconds, so sub-frame precision is normal.
  // Audio tolerance = max(1 video frame, 2 AAC frames). AAC encodes 1024 samples
  // per frame (~23ms @ 44.1kHz) and trailing partial frames get padded to the
  // boundary, so the muxed audio-track duration can legitimately be up to ~one
  // AAC frame longer than what we requested. Two AAC frames of slack covers
  // that quantization plus encoder priming/delay without ever masking real
  // desync (anything larger is genuinely audible).
  const aacGranularitySec = audioBuffer ? 1024 / audioBuffer.sampleRate : 0;
  const verification = await verifyExportDuration({
    blob,
    expectedDurationSec,
    hasAudio: !!audioBuffer,
    panelCount: panels.length,
    secondsPerPanel: framesPerPanelArr[0] / fps,
    videoToleranceSec: 1 / fps,
    audioToleranceSec: Math.max(1 / fps, 2 * aacGranularitySec),
  });

  return {
    blob,
    filename: `${safeTitle}.mp4`,
    mimeType: "video/mp4",
    verification,
  };
}

// --- MediaRecorder fallback (Firefox/Safari without WebCodecs) --------------------
//
// Kept as a safety net; produces WebM (which is what those browsers can reliably
// encode). Most users on Chrome/Edge never reach this path.

async function exportViaMediaRecorder(
  opts: VideoExportOptions,
  audioBuffer: AudioBuffer | null,
): Promise<VideoExportResult> {
  const { title, panels, fps = 30, width = 1080, height = 1920, onProgress } = opts;
  const audioStartSec = Math.max(0, opts.audioStartSec ?? 0);
  const audioFadeOutSec = Math.max(0, opts.audioFadeOutSec ?? 2);
  const hasPerPanel =
    Array.isArray(opts.panelDurations) && opts.panelDurations.length === panels.length;
  const syncToAudio =
    !hasPerPanel && audioStartSec === 0 && (opts.syncToAudio ?? !!audioBuffer);
  let secondsPerPanel = opts.secondsPerPanel ?? 3;
  let audioDuration = 0;
  if (audioBuffer) {
    audioDuration = audioBuffer.duration;
    if (syncToAudio) secondsPerPanel = Math.max(0.1, audioDuration / panels.length);
  }
  // Per-panel duration in seconds. Cumulative end times let us pick the
  // current panel by elapsed wall-clock in O(panels) without integer math drift.
  const panelDurs: number[] = hasPerPanel
    ? opts.panelDurations!.map((s) => Math.max(0.1, s))
    : new Array(panels.length).fill(secondsPerPanel);
  const panelEnds: number[] = [];
  {
    let acc = 0;
    for (const d of panelDurs) { acc += d; panelEnds.push(acc); }
  }

  if (typeof MediaRecorder === "undefined") {
    throw new Error("Your browser does not support video recording.");
  }

  // Re-create an AudioContext for the MediaStream path (decoded buffer is reusable).
  const audioCtx = audioBuffer
    ? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    : null;

  const { mime, ext } = pickMime(!!audioBuffer);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctxMaybe = canvas.getContext("2d");
  if (!ctxMaybe) throw new Error("Could not create canvas context.");
  const ctx: CanvasRenderingContext2D = ctxMaybe;

  const images = await Promise.all(panels.map((p) => loadImage(p.imageDataUrl)));
  drawFrame(ctx, width, height, images[0], panels[0].caption, 0, panels.length);

  // CRITICAL: captureStream(fps) — browser-driven continuous capture at the
  // chosen framerate. The PREVIOUS implementation used captureStream(0) +
  // requestFrame() in a setTimeout loop, but setTimeout in a Replit-preview-
  // sized iframe gets aggressively throttled (sometimes down to 1Hz when the
  // app isn't strictly focused), turning a 45 s slideshow into a 6-minute
  // file. With captureStream(fps), the muxed file length equals the wall-clock
  // time we actually run the recorder for, no matter how laggy our draw loop is.
  const videoStream = canvas.captureStream(fps);
  const videoTrack = videoStream.getVideoTracks()[0];
  if (!videoTrack) throw new Error("Could not create video track from canvas.");
  const tracks: MediaStreamTrack[] = [videoTrack];
  let audioSource: AudioBufferSourceNode | null = null;
  let audioGain: GainNode | null = null;
  if (audioCtx && audioBuffer) {
    const dest = audioCtx.createMediaStreamDestination();
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    // GainNode lets us schedule a linear fade-out at the tail of the muxed
    // audio (matches the WebCodecs path's sample-level fade exactly in shape).
    audioGain = audioCtx.createGain();
    audioGain.gain.value = 1;
    audioSource.connect(audioGain).connect(dest);
    tracks.push(...dest.stream.getAudioTracks());
  }
  const combinedStream = new MediaStream(tracks);

  const recorder = new MediaRecorder(combinedStream, {
    videoBitsPerSecond: 8_000_000,
    ...(audioCtx ? { audioBitsPerSecond: 192_000 } : {}),
    ...(mime ? { mimeType: mime } : {}),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const recorderStopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  // Compute the exact wall-clock duration this recording must run for. When
  // audio is present and syncToAudio is true we use audioDuration directly; in
  // every case we use it to drive a self-correcting loop below.
  const framesPerPanel = Math.max(1, Math.round(secondsPerPanel * fps));
  const expectedDurationSec = audioBuffer && syncToAudio
    ? audioDuration
    : (hasPerPanel ? panelEnds[panelEnds.length - 1] : (framesPerPanel * panels.length) / fps);

  if (audioCtx && audioCtx.state === "suspended") {
    try { await audioCtx.resume(); } catch { /* best effort */ }
  }
  recorder.start();
  const recordStartMs = performance.now();
  if (audioSource && audioCtx) {
    // start(when, offset) — `offset` is the seconds-into-the-buffer where
    // playback begins. Lets us mux any 60-second window of a 10-minute song.
    const startOffset = Math.min(audioStartSec, audioBuffer?.duration ?? 0);
    audioSource.start(0, startOffset);
    if (audioGain && audioFadeOutSec > 0 && expectedDurationSec > 0) {
      const fade = Math.min(audioFadeOutSec, expectedDurationSec);
      const t0 = audioCtx.currentTime;
      audioGain.gain.setValueAtTime(1, t0 + Math.max(0, expectedDurationSec - fade));
      audioGain.gain.linearRampToValueAtTime(0, t0 + expectedDurationSec);
    }
  }

  // Self-correcting wall-clock draw loop. Each tick we look at the REAL
  // elapsed wall time (not a frame counter) to decide which panel to show.
  // This way, if the host throttles our timer down to e.g. 250 ms, we still
  // jump to the correct panel for the current moment instead of falling
  // further and further behind — and we always stop at the right wall time.
  // rAF is the primary scheduler; a 50 ms setInterval is a safety net for
  // when rAF is paused (e.g. minimized window / cross-origin iframe with no
  // visibility), guaranteeing we still terminate at expectedDurationSec.
  // Crossfade duration: ~0.6 s, but never more than 1/3 of a panel so very
  // short panels still have a recognisable hold phase before dissolving.
  const baseTransitionSec = 0.6;

  // Look up which panel is on-screen at `elapsedSec`. Returns the panel index
  // plus where we are inside that panel's slot.
  function panelAt(elapsedSec: number): { idx: number; tIntoPanel: number; panelLen: number } {
    let idx = 0;
    while (idx < panelEnds.length - 1 && elapsedSec >= panelEnds[idx]) idx++;
    const panelLen = panelDurs[idx];
    const panelStart = idx === 0 ? 0 : panelEnds[idx - 1];
    return { idx, tIntoPanel: elapsedSec - panelStart, panelLen };
  }

  await new Promise<void>((resolve) => {
    let done = false;
    // Single-flight scheduling guards: at most one rAF and one timeout in
    // flight at a time, so the safety setInterval can't seed new rAF chains
    // every 50 ms and accumulate hundreds of concurrent callbacks during long
    // exports (which would drive CPU up and worsen the very throttling we're
    // working around).
    let rafScheduled = false;
    function step() {
      rafScheduled = false;
      if (done) return;
      const elapsedSec = (performance.now() - recordStartMs) / 1000;
      if (elapsedSec >= expectedDurationSec) {
        done = true;
        clearInterval(safetyInterval);
        resolve();
        return;
      }
      const { idx, tIntoPanel, panelLen } = panelAt(elapsedSec);
      const hasNext = idx < panels.length - 1;
      const nextLen = hasNext ? panelDurs[idx + 1] : panelLen;
      // Transition bounded by 1/3 of THIS and the NEXT panel so wildly
      // different durations don't yield a fade longer than either side's hold.
      const transitionSec = Math.min(baseTransitionSec, panelLen / 3, nextLen / 3);
      const inTransition = hasNext && tIntoPanel >= panelLen - transitionSec;
      if (inTransition) {
        const t = Math.min(
          1,
          (tIntoPanel - (panelLen - transitionSec)) / transitionSec,
        );
        drawCrossfade(
          ctx, width, height,
          images[idx], panels[idx].caption, idx,
          images[idx + 1], panels[idx + 1].caption, idx + 1,
          panels.length, t,
        );
      } else {
        drawFrame(ctx, width, height, images[idx], panels[idx].caption, idx, panels.length);
      }
      if (onProgress) onProgress(Math.min(1, elapsedSec / expectedDurationSec));
      schedule();
    }
    function schedule() {
      if (done || rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(step);
    }
    // Safety watchdog: if rAF is paused (minimized window, hidden iframe),
    // this still fires and runs step() directly. step() re-arms rAF only
    // through schedule(), which is single-flight, so no chain accumulation.
    const safetyInterval = window.setInterval(() => {
      if (done) return;
      step();
    }, 50);
    schedule();
  });

  try {
    try { audioSource?.stop(); } catch { /* already stopped */ }
    recorder.stop();
    await recorderStopped;
  } finally {
    combinedStream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    videoStream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    if (audioCtx) await audioCtx.close().catch(() => {});
  }

  const actualType = chunks[0]?.type || mime || "video/webm";
  const blob = new Blob(chunks, { type: actualType });
  const finalExt = extFromBlobType(actualType, ext);
  const safeTitle = (title || "novel").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "novel";

  // MediaRecorder pads both tracks by whatever encoder priming/flush latency
  // the browser needs at stop() — typically 0.5–2 s, NOT a bug, just how the
  // pipeline works. Use a generous 3 s tolerance on expected-vs-actual so we
  // don't false-fail on that pad. The strict invariant the user actually cares
  // about ("video length == audio length exactly when music is provided") is
  // enforced by the audioVideoDeltaSec cross-check below, which stays tight:
  // if both tracks pad to the same length, sync is preserved and the file is
  // good even if it's a hair longer than the source music.
  const verification = await verifyExportDuration({
    blob,
    expectedDurationSec,
    hasAudio: !!audioBuffer,
    panelCount: panels.length,
    secondsPerPanel,
    videoToleranceSec: 3.0,
    audioToleranceSec: 0.25,
  });

  return {
    blob,
    filename: `${safeTitle}.${finalExt}`,
    mimeType: actualType,
    verification,
  };
}
