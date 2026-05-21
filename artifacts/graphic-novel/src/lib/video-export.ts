export interface VideoExportPanel {
  caption: string;
  imageDataUrl: string;
}

export interface VideoExportOptions {
  title: string;
  panels: VideoExportPanel[];
  secondsPerPanel?: number;
  fps?: number;
  width?: number;
  height?: number;
  onProgress?: (fraction: number) => void;
  // When provided, the audio is muxed into the exported video. If `syncToAudio` is true (the
  // default when audio is given), panel duration is recomputed so the whole slideshow spans
  // exactly the audio length — making this trivially usable as a music video.
  audioBlob?: Blob;
  syncToAudio?: boolean;
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

function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  img: HTMLImageElement,
  caption: string,
  panelIdx: number,
  totalPanels: number,
) {
  ctx.fillStyle = "#f4ede0";
  ctx.fillRect(0, 0, W, H);

  const pad = Math.round(W * 0.05);
  const captionBoxX = pad;
  const captionBoxY = pad;
  const captionBoxW = W - pad * 2;

  ctx.font = `600 ${Math.round(W * 0.045)}px Georgia, "Playfair Display", serif`;
  ctx.fillStyle = "#1a1a1a";
  ctx.textBaseline = "top";

  const lineHeight = Math.round(W * 0.06);
  const lines = caption ? wrapText(ctx, caption, captionBoxW - pad * 2) : [];
  const captionBoxH = Math.max(lineHeight * 2, lines.length * lineHeight + pad * 1.2);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(captionBoxX, captionBoxY, captionBoxW, captionBoxH);
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = Math.max(4, W * 0.005);
  ctx.strokeRect(captionBoxX, captionBoxY, captionBoxW, captionBoxH);

  ctx.fillStyle = "#1a1a1a";
  lines.forEach((ln, i) => {
    ctx.fillText(ln, captionBoxX + pad * 0.6, captionBoxY + pad * 0.6 + i * lineHeight);
  });

  const imgBoxY = captionBoxY + captionBoxH + pad;
  const imgBoxX = pad;
  const imgBoxW = W - pad * 2;
  const imgBoxH = H - imgBoxY - pad * 2.5;

  ctx.fillStyle = "#222";
  ctx.fillRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH);

  const scale = Math.min(imgBoxW / img.width, imgBoxH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = imgBoxX + (imgBoxW - drawW) / 2;
  const drawY = imgBoxY + (imgBoxH - drawH) / 2;
  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = Math.max(4, W * 0.005);
  ctx.strokeRect(imgBoxX, imgBoxY, imgBoxW, imgBoxH);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = `700 ${Math.round(W * 0.028)}px "Courier New", monospace`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${panelIdx + 1} / ${totalPanels}`, pad, H - pad * 0.8);
}

export interface VideoExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
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
  if (hasWebCodecs()) {
    try {
      return await exportViaWebCodecs(opts, audioBuffer);
    } catch (err) {
      console.warn("WebCodecs export failed, falling back to MediaRecorder:", err);
      // Fall through to MediaRecorder.
    }
  }
  return await exportViaMediaRecorder(opts, audioBuffer);
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
  const syncToAudio = opts.syncToAudio ?? !!audioBuffer;
  let secondsPerPanel = opts.secondsPerPanel ?? 3;
  if (audioBuffer && syncToAudio) {
    secondsPerPanel = Math.max(0.1, audioBuffer.duration / panels.length);
  }

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

  const framesPerPanel = Math.max(1, Math.round(secondsPerPanel * fps));
  const totalFrames = framesPerPanel * panels.length;
  const frameDurationUs = Math.round(1_000_000 / fps);
  const keyframeEvery = fps * 2; // 2-second GOP

  let frameIdx = 0;
  for (let i = 0; i < panels.length; i++) {
    for (let f = 0; f < framesPerPanel; f++) {
      drawFrame(ctx, width, height, images[i], panels[i].caption, i, panels.length);
      const timestamp = frameIdx * frameDurationUs;
      const frame = new wc.VideoFrame(canvas, { timestamp, duration: frameDurationUs });
      videoEncoder.encode(frame, { keyFrame: frameIdx % keyframeEvery === 0 });
      frame.close();
      frameIdx++;
      if (onProgress) onProgress((frameIdx / totalFrames) * (audioBuffer ? 0.85 : 1.0));
      // Yield occasionally so the UI stays responsive and the encoder queue can drain.
      if (frameIdx % 15 === 0) await new Promise((r) => setTimeout(r, 0));
      if (encoderError) throw encoderError;
    }
  }
  await videoEncoder.flush();
  videoEncoder.close();
  if (encoderError) throw encoderError;

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
    const totalSamples = audioBuffer.length;
    const chData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) chData.push(audioBuffer.getChannelData(c));

    for (let offset = 0; offset < totalSamples; offset += CHUNK) {
      const numberOfFrames = Math.min(CHUNK, totalSamples - offset);
      // f32-planar: all of channel 0, then all of channel 1, etc.
      const planar = new Float32Array(numberOfFrames * channels);
      for (let c = 0; c < channels; c++) {
        planar.set(chData[c].subarray(offset, offset + numberOfFrames), c * numberOfFrames);
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
  return { blob, filename: `${safeTitle}.mp4`, mimeType: "video/mp4" };
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
  const syncToAudio = opts.syncToAudio ?? !!audioBuffer;
  let secondsPerPanel = opts.secondsPerPanel ?? 3;
  let audioDuration = 0;
  if (audioBuffer) {
    audioDuration = audioBuffer.duration;
    if (syncToAudio) secondsPerPanel = Math.max(0.1, audioDuration / panels.length);
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
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  const images = await Promise.all(panels.map((p) => loadImage(p.imageDataUrl)));
  drawFrame(ctx, width, height, images[0], panels[0].caption, 0, panels.length);

  const videoStream = canvas.captureStream(0);
  const videoTrack = videoStream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined;
  if (!videoTrack) throw new Error("Could not create video track from canvas.");
  const tracks: MediaStreamTrack[] = [videoTrack];
  let audioSource: AudioBufferSourceNode | null = null;
  if (audioCtx && audioBuffer) {
    const dest = audioCtx.createMediaStreamDestination();
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(dest);
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
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  if (audioCtx && audioCtx.state === "suspended") {
    try { await audioCtx.resume(); } catch { /* best effort */ }
  }
  recorder.start(250);
  if (audioSource) audioSource.start();

  const framesPerPanel = Math.max(1, Math.round(secondsPerPanel * fps));
  const totalFrames = framesPerPanel * panels.length;
  const frameInterval = 1000 / fps;

  let frameCount = 0;
  for (let i = 0; i < panels.length; i++) {
    for (let f = 0; f < framesPerPanel; f++) {
      drawFrame(ctx, width, height, images[i], panels[i].caption, i, panels.length);
      if (typeof videoTrack.requestFrame === "function") videoTrack.requestFrame();
      await new Promise((r) => setTimeout(r, frameInterval));
      frameCount++;
      if (onProgress) onProgress(frameCount / totalFrames);
    }
  }

  if (audioDuration > 0) {
    const elapsedSec = (framesPerPanel * panels.length) / fps;
    const remainingMs = Math.max(0, (audioDuration - elapsedSec) * 1000);
    if (remainingMs > 0) await new Promise((r) => setTimeout(r, remainingMs));
  }
  await new Promise((r) => setTimeout(r, 200));

  try {
    try { audioSource?.stop(); } catch { /* already stopped */ }
    recorder.stop();
    await stopped;
  } finally {
    combinedStream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    videoStream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    if (audioCtx) await audioCtx.close().catch(() => {});
  }

  const actualType = chunks[0]?.type || mime || "video/webm";
  const blob = new Blob(chunks, { type: actualType });
  const finalExt = extFromBlobType(actualType, ext);
  const safeTitle = (title || "novel").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "novel";
  return { blob, filename: `${safeTitle}.${finalExt}`, mimeType: actualType };
}
