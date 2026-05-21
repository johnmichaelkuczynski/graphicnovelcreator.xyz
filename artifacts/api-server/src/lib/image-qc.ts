// Image quality control: detect "blank" panels that come back from the image
// generator looking like a solid color (the most common failure mode of any
// diffusion model — content filter trip, sampler collapse, NSFW redaction —
// produces an all-black, all-white, or single-color rectangle that's useless
// in a graphic novel).
//
// We decode the PNG ourselves so we can read actual pixel data; that's the
// only way to tell apart a real moody black-night panel (which has subtle
// variation) from a panel that's literally one RGB value end to end.

import { PNG } from "pngjs";

export interface BlankAnalysis {
  isBlank: boolean;
  reason: string;
  // Diagnostic stats so we can log + tune the thresholds without re-running.
  width: number;
  height: number;
  meanLuma: number; // 0..255
  lumaStdDev: number; // 0..127
  uniqueColorBuckets: number; // count of distinct 4-bit-per-channel buckets seen
}

function decodePngDataUrl(dataUrl: string): PNG {
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!m) throw new Error("Expected base64 PNG data URL");
  const buf = Buffer.from(m[1], "base64");
  return PNG.sync.read(buf);
}

// ─── Perceptual hash (dHash) for duplicate detection ─────────────────────────
//
// Same-seed diffusion with similar prompts (which is exactly our setup, since
// we lock a per-novel seed for style consistency) reliably produces near-
// duplicate panels — the model converges on the same latent point. We need a
// fingerprint of each generated image so the pipeline can detect "this panel
// looks 95% identical to panel 3" and re-roll with a varied seed.
//
// dHash: downsample to 9x8 grayscale, then for each row record whether each
// pixel is brighter than its right-hand neighbour. 8 rows * 8 comparisons =
// 64 bits. Comparing two hashes with Hamming distance: <=10 bits different
// out of 64 is the canonical "near-duplicate" threshold in the perceptual-
// hashing literature.
export function computeDHash(dataUrl: string): bigint {
  const png = decodePngDataUrl(dataUrl);
  const { width, height, data } = png;
  const cols = 9;
  const rows = 8;
  // Downsample via nearest-neighbour. For our 1024x768 inputs this is plenty
  // accurate — dHash is intentionally low-res because we WANT it to ignore
  // small differences and capture overall composition + brightness layout.
  const gray = new Array<number>(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / cols));
      const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / rows));
      const idx = (sy * width + sx) * 4;
      gray[y * cols + x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }
  let hash = 0n;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols - 1; x++) {
      hash <<= 1n;
      if (gray[y * cols + x] > gray[y * cols + x + 1]) hash |= 1n;
    }
  }
  return hash;
}

// Hamming distance between two 64-bit perceptual hashes — count of differing
// bits. Lower = more similar. 0 = identical fingerprint.
export function hammingDistance(a: bigint, b: bigint): number {
  let x = a ^ b;
  let count = 0;
  while (x !== 0n) {
    if ((x & 1n) === 1n) count++;
    x >>= 1n;
  }
  return count;
}

// Threshold used by the pipeline to call two panels "the same graphic". 10 bits
// out of 64 (~15%) is the conventional dHash near-duplicate cutoff and matches
// the kind of "two panels are basically identical" cases we see in practice
// (the man-at-the-map-with-pink-dress-woman case the user reported sits well
// below 10 — usually 2–6 bits apart).
export const DUPLICATE_DHASH_THRESHOLD = 10;

// Quantise each (R,G,B) sample into a 4-bit-per-channel bucket (16*16*16 = 4096
// total buckets) and count how many distinct buckets the image touches. A real
// scene easily lights up 200+ buckets; a "blank" image touches at most a few.
// We sample on a stride so 1024x768 doesn't cost 0.8M iterations per panel.
export function analyzePngForBlankness(dataUrl: string): BlankAnalysis {
  const png = decodePngDataUrl(dataUrl);
  const { width, height, data } = png;

  // Sample roughly 8000 pixels regardless of image size. Plenty of statistical
  // power, ~0.5ms of compute.
  const totalPixels = width * height;
  const stride = Math.max(1, Math.floor(Math.sqrt(totalPixels / 8000)));

  const seenBuckets = new Set<number>();
  let sumLuma = 0;
  let sumLumaSq = 0;
  let sampled = 0;

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // Rec.601 luma — perceptually weighted brightness in 0..255.
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      sumLuma += luma;
      sumLumaSq += luma * luma;
      sampled++;
      // 4 bits per channel — collapses near-identical colors into the same bucket
      // so subtle dithering noise doesn't fool us into thinking the image varies.
      const bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      seenBuckets.add(bucket);
    }
  }

  const meanLuma = sampled > 0 ? sumLuma / sampled : 0;
  const variance = sampled > 0 ? sumLumaSq / sampled - meanLuma * meanLuma : 0;
  const lumaStdDev = Math.sqrt(Math.max(0, variance));
  const uniqueColorBuckets = seenBuckets.size;

  // Decision rules — calibrated to flag failure-mode panels while leaving
  // legitimately dark/foggy/moody panels alone:
  //  - <= 3 unique color buckets out of 4096 → effectively a solid color.
  //  - lumaStdDev < 4 (out of 0..127) → essentially flat luminance.
  //  - meanLuma < 6 with stdDev < 8 → indistinguishable from pure black.
  //  - meanLuma > 249 with stdDev < 8 → indistinguishable from pure white.
  // Any one of those is enough to reject.
  let isBlank = false;
  let reason = "ok";
  if (uniqueColorBuckets <= 3) {
    isBlank = true;
    reason = `only ${uniqueColorBuckets} distinct colors`;
  } else if (lumaStdDev < 4) {
    isBlank = true;
    reason = `flat brightness (stddev ${lumaStdDev.toFixed(2)})`;
  } else if (meanLuma < 6 && lumaStdDev < 8) {
    isBlank = true;
    reason = `near-pure black (mean ${meanLuma.toFixed(1)}, stddev ${lumaStdDev.toFixed(2)})`;
  } else if (meanLuma > 249 && lumaStdDev < 8) {
    isBlank = true;
    reason = `near-pure white (mean ${meanLuma.toFixed(1)}, stddev ${lumaStdDev.toFixed(2)})`;
  }

  return { isBlank, reason, width, height, meanLuma, lumaStdDev, uniqueColorBuckets };
}
