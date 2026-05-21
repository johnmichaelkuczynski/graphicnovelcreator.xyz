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

export async function exportNovelVideo(opts: VideoExportOptions): Promise<VideoExportResult> {
  const {
    title,
    panels,
    fps = 30,
    width = 1080,
    height = 1920,
    onProgress,
    audioBlob,
    syncToAudio = !!opts.audioBlob,
  } = opts;
  let { secondsPerPanel = 3 } = opts;

  if (!panels.length) throw new Error("No completed panels to export.");
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Your browser does not support video recording.");
  }

  // Decode audio (if any) up front so we can size the slideshow against its duration.
  let audioCtx: AudioContext | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let audioDuration = 0;
  if (audioBlob) {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const arrayBuf = await audioBlob.arrayBuffer();
    audioBuffer = await audioCtx.decodeAudioData(arrayBuf.slice(0));
    audioDuration = audioBuffer.duration;
    if (syncToAudio) {
      secondsPerPanel = Math.max(0.1, audioDuration / panels.length);
    }
  }

  const { mime, ext } = pickMime(!!audioBlob);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  const images = await Promise.all(panels.map((p) => loadImage(p.imageDataUrl)));

  drawFrame(ctx, width, height, images[0], panels[0].caption, 0, panels.length);

  // Build the combined media stream: canvas video + (optionally) decoded audio.
  const videoStream = canvas.captureStream(fps);
  const tracks: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
  let audioSource: AudioBufferSourceNode | null = null;
  let audioDest: MediaStreamAudioDestinationNode | null = null;
  if (audioCtx && audioBuffer) {
    audioDest = audioCtx.createMediaStreamDestination();
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.connect(audioDest);
    tracks.push(...audioDest.stream.getAudioTracks());
  }
  const combinedStream = new MediaStream(tracks);

  const recorderOpts: MediaRecorderOptions = {
    videoBitsPerSecond: 8_000_000,
    ...(audioCtx ? { audioBitsPerSecond: 192_000 } : {}),
    ...(mime ? { mimeType: mime } : {}),
  };
  const recorder = new MediaRecorder(combinedStream, recorderOpts);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  // AudioContexts can start "suspended" under browser autoplay rules; without resume(), the
  // MediaStreamAudioDestinationNode emits silence and we'd ship a video with no audio.
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
    drawFrame(ctx, width, height, images[i], panels[i].caption, i, panels.length);
    for (let f = 0; f < framesPerPanel; f++) {
      await new Promise((r) => setTimeout(r, frameInterval));
      frameCount++;
      if (onProgress) onProgress(frameCount / totalFrames);
    }
  }

  // If audio is longer than the rendered slideshow (rounding error or panels too few),
  // hold the last frame until the audio finishes so nothing is cut off.
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
    // Always release media tracks and the AudioContext, even if recorder/stop misbehaves.
    combinedStream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    videoStream.getTracks().forEach((t) => { try { t.stop(); } catch { /* noop */ } });
    if (audioCtx) await audioCtx.close().catch(() => {});
  }

  // Use the actual recorded type if available — MediaRecorder may downgrade to WebM even when
  // an MP4 mime was requested, and we want the file extension to reflect reality.
  const actualType = chunks[0]?.type || mime || "video/webm";
  const blob = new Blob(chunks, { type: actualType });
  const finalExt = extFromBlobType(actualType, ext);
  const safeTitle = (title || "novel").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "novel";
  const filename = `${safeTitle}.${finalExt}`;
  // Caller decides what to do with the blob (persist to IndexedDB, prompt save dialog, etc.)
  // No more silent <a download> — the previous behavior dumped files into the OS Downloads
  // folder with no in-app trace, which left users wondering where the export went.
  return { blob, filename, mimeType: actualType };
}
