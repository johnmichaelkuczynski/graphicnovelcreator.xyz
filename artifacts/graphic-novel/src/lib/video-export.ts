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
}

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

function pickMime(): { mime: string; ext: string } {
  for (const m of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return { mime: m, ext: m.startsWith("video/mp4") ? "mp4" : "webm" };
    }
  }
  return { mime: "", ext: "webm" };
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

export async function exportNovelVideo(opts: VideoExportOptions): Promise<void> {
  const {
    title,
    panels,
    secondsPerPanel = 3,
    fps = 30,
    width = 1080,
    height = 1920,
    onProgress,
  } = opts;

  if (!panels.length) throw new Error("No completed panels to export.");
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Your browser does not support video recording.");
  }

  const { mime, ext } = pickMime();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  const images = await Promise.all(panels.map((p) => loadImage(p.imageDataUrl)));

  drawFrame(ctx, width, height, images[0], panels[0].caption, 0, panels.length);

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
  recorder.start(250);

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

  await new Promise((r) => setTimeout(r, 200));
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());

  const blob = new Blob(chunks, { type: mime || "video/webm" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeTitle = (title || "novel").replace(/[^a-z0-9_-]+/gi, "_").slice(0, 60) || "novel";
  a.download = `${safeTitle}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
