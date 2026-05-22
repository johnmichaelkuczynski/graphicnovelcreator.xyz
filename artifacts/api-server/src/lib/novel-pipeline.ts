import { eq, asc, and, inArray } from "drizzle-orm";
import { db, novelsTable, panelsTable, type Novel } from "@workspace/db";
import { generateText, generateImage, describeReferenceImages, type ZhiId } from "./ai";
import {
  analyzePngForBlankness,
  computeDHash,
  hammingDistance,
  DUPLICATE_DHASH_THRESHOLD,
} from "./image-qc";
import { logger } from "./logger";

// Anchor strengths kept at module scope so the QC helper can reuse them. See
// novel-pipeline below for the in-depth comment on what these control.
const FIRST_PANEL_STRENGTH = 0.6;
const ANCHOR_STRENGTH = 0.35;

// SD3.5 (and most diffusion models) weight the FIRST and LAST tokens of the
// prompt most heavily, and largely ignore negative prompts. The single most
// effective tactic to stop the model baking garbled "text" into images is to
// front- AND back-load an aggressive no-text directive in the POSITIVE
// prompt. Bracketed emphasis tokens (e.g. "((no text))") further bias the
// attention weights. This sandwiches every per-panel scene description
// between two anti-text walls.
// Kept SHORT because some Venice models (lustify-sdxl) cap prompts at 1500
// chars. Bracketed emphasis tokens still bias attention even when terse.
const NO_TEXT_LEAD =
  "((no text)) ((no letters)) ((no captions)) ((no speech bubbles)) ((no watermarks)) — pure visual, zero written language. ";
const NO_TEXT_TAIL =
  " No text, letters, words, captions, speech bubbles, signs, labels, logos, or writing anywhere in the image. No panel borders.";

// Wrap generateImage() with automatic quality control: every produced image
// is decoded and scanned for the "blank" failure mode (solid black/white/single
// color — usually a content-filter trip or sampler collapse). If blank, we
// re-roll with a varied seed up to MAX_ATTEMPTS times. The seed delta is a
// large prime so consecutive retries never sample adjacent latent points and
// just produce the same blank again.
async function generateImageWithQC(opts: {
  promptText: string;
  novelId: number;
  panelIdx: number;
  baseSeed: number;
  styleAnchor?: string;
  isFirstPanel: boolean;
  width: number;
  height: number;
  // Perceptual hashes of every panel already accepted into THIS novel. New
  // images that come back within DUPLICATE_DHASH_THRESHOLD of any of these
  // are rejected as duplicates and re-rolled with a varied seed. Empty for
  // the very first panel.
  priorHashes: ReadonlyArray<bigint>;
}): Promise<{ dataUrl: string; hash: bigint }> {
  // Bumped from 3 to 5: blank failures and duplicate failures both consume
  // attempts, so giving the budget some headroom matters now that one
  // generation can be rejected for two independent reasons.
  const MAX_ATTEMPTS = 5;
  let lastReason = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Seed mixing: novel-level base + panel index + retry attempt, each
    // multiplied by a different large prime so consecutive panels and
    // consecutive retries always sample wildly-different latent points.
    // Without the panelIdx term, every panel's first attempt would roll the
    // SAME seed, and two adjacent panels with similar prompts (e.g. "woman
    // and man in chiaroscuro") would produce visually identical images that
    // the dHash duplicate gate had to catch and re-roll — burning attempts
    // and slowing generation. Mixing panelIdx in means panels are visually
    // distinct from the FIRST attempt.
    const seed =
      ((opts.baseSeed + opts.panelIdx * 1_000_003 + attempt * 7919) % 999_999_999) + 1;
    const dataUrl = await generateImage({
      prompt: opts.promptText,
      referenceImageDataUrl: opts.styleAnchor,
      referenceStrength: opts.isFirstPanel ? FIRST_PANEL_STRENGTH : ANCHOR_STRENGTH,
      seed,
      width: opts.width,
      height: opts.height,
    });

    // Gate 1: blank-image detection.
    let hash: bigint;
    try {
      const qc = await analyzePngForBlankness(dataUrl);
      if (qc.isBlank) {
        lastReason = qc.reason;
        logger.warn(
          { novelId: opts.novelId, panelIdx: opts.panelIdx, attempt, reason: qc.reason, mean: qc.meanLuma.toFixed(1), stddev: qc.lumaStdDev.toFixed(2), buckets: qc.uniqueColorBuckets },
          "QC: rejected blank panel, retrying",
        );
        continue;
      }
      // Gate 2: duplicate-image detection. Compute the perceptual hash and
      // measure Hamming distance to every previously-accepted panel.
      hash = await computeDHash(dataUrl);
    } catch (err) {
      // Fail CLOSED: undecodable payloads count as a failed attempt rather
      // than a silent acceptance. Accepting them would let malformed images
      // survive as "done", defeating the QC gate entirely.
      lastReason = `qc analysis threw: ${err instanceof Error ? err.message : String(err)}`;
      logger.warn(
        { novelId: opts.novelId, panelIdx: opts.panelIdx, attempt, err: err instanceof Error ? err.message : err },
        "QC: analysis threw, retrying",
      );
      continue;
    }

    let minDist = Number.POSITIVE_INFINITY;
    for (const prior of opts.priorHashes) {
      const d = hammingDistance(hash, prior);
      if (d < minDist) minDist = d;
    }
    if (minDist <= DUPLICATE_DHASH_THRESHOLD) {
      lastReason = `duplicate of an earlier panel (dHash distance ${minDist})`;
      logger.warn(
        { novelId: opts.novelId, panelIdx: opts.panelIdx, attempt, minDist },
        "QC: rejected duplicate panel, retrying with varied seed",
      );
      continue;
    }

    if (attempt > 0) {
      logger.info(
        { novelId: opts.novelId, panelIdx: opts.panelIdx, attempt },
        "QC: recovered panel after retry",
      );
    }
    return { dataUrl, hash };
  }
  throw new Error(`Image failed QC after ${MAX_ATTEMPTS} attempts (${lastReason})`);
}

interface PanelPlan {
  caption: string;
  imagePrompt: string;
}

// Strip `//` line comments, `/* ... */` block comments, and trailing commas
// from a JSON-ish string while preserving any string literals. Text models
// (esp. with chain-of-thought) sometimes emit JS-flavored JSON like
//   [ {"caption": "x"}, // 77 more panels follow
//     {"caption": "y"}, ]
// which is invalid per spec but trivially recoverable.
function sanitizeJsonish(s: string): string {
  let out = "";
  let i = 0;
  let inStr = false;
  let strCh = "";
  while (i < s.length) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\" && i + 1 < s.length) {
        out += s[i + 1];
        i += 2;
        continue;
      }
      if (c === strCh) inStr = false;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      strCh = c;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  // Drop trailing commas before } or ]
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  // Try direct parse first
  try {
    return JSON.parse(candidate);
  } catch {}
  // Then try after stripping JS-flavored comments / trailing commas
  try {
    return JSON.parse(sanitizeJsonish(candidate));
  } catch {}
  // Fallback: locate the first { ... } or [ ... ] block
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in model output");
  const open = candidate[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === open) depth++;
    else if (candidate[i] === close) {
      depth--;
      if (depth === 0) {
        const slice = candidate.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return JSON.parse(sanitizeJsonish(slice));
        }
      }
    }
  }
  throw new Error("Malformed JSON in model output");
}

// Extracts the first ~maxChars of `text`, trying to end at a sentence
// boundary. Used to anchor panel-1's caption to the literal source opening.
function firstSentences(text: string, maxChars = 280): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(0, maxChars);
  const lastPunct = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (lastPunct > maxChars * 0.4) return trimmed.slice(0, lastPunct + 1);
  return slice + "…";
}

// Same idea for the last ~maxChars, trying to start at a sentence boundary.
function lastSentences(text: string, maxChars = 280): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const slice = trimmed.slice(trimmed.length - maxChars);
  const firstPunct = Math.min(
    ...[". ", "! ", "? "].map((p) => {
      const i = slice.indexOf(p);
      return i === -1 ? Infinity : i;
    }),
  );
  if (Number.isFinite(firstPunct) && firstPunct < maxChars * 0.6) {
    return slice.slice(firstPunct + 2);
  }
  return "…" + slice;
}

// Bag-of-words Jaccard-style overlap (using min-set as denominator so a long
// caption isn't penalised for containing more words than the short anchor).
// Words <4 chars are dropped to ignore stop words like "the/and/of/in".
function tokenOverlap(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 4),
    );
  const ta = tok(a);
  const tb = tok(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

async function planPanels(opts: {
  sourceText: string;
  specifications: string;
  artStyle?: string | null;
  panelCount: number;
  textModel: ZhiId;
  explicit: boolean;
  referenceLabels: string[];
  referenceDescription: string;
}): Promise<PanelPlan[]> {
  const referenceNote = opts.referenceDescription
    ? `\n\n══ REFERENCE IMAGES (BINDING) ══
The author has uploaded reference image(s). A vision model has produced detailed descriptions below. Every imagePrompt that depicts one of these subjects MUST quote the subject description verbatim or paraphrase it faithfully. The visual style of every panel — whether the reference subject appears or not — MUST match the STYLE block below.

${opts.referenceDescription}
══ END REFERENCES ══`
    : opts.referenceLabels.length
    ? `\n\nThe author has supplied reference characters/subjects you must depict consistently: ${opts.referenceLabels.join(", ")}. Refer to them by these labels in every image prompt that includes them.`
    : "";

  const specBlock = opts.specifications?.trim()
    ? `\n\n╔══════════════════════════════════════════════════════╗
║  AUTHOR'S BINDING DIRECTIVES — ABSOLUTE, NON-NEGOTIABLE  ║
╚══════════════════════════════════════════════════════╝
${opts.specifications.trim()}

These directives OVERRIDE anything implied by the source text. When a directive contradicts the source (e.g. directive says "set in 1920s Tokyo" but the source says "modern New York"; directive specifies a character's gender, age, or appearance differently than the source; directive specifies an art style or mood the source doesn't imply), the directive WINS — rewrite the affected captions and imagePrompts accordingly. Every caption AND every imagePrompt must reflect these directives verbatim. Do not soften, paraphrase, partially apply, or ignore any directive. A panel that violates a directive is a failed panel.

CRITICAL: When the author has NOT specified a gender, age, or appearance for a character, do NOT default to any particular gender, age, or appearance — follow what the source text actually says, and vary realistically when the source doesn't specify. Do not make every character female (or every character male) unless the source or the directives explicitly call for that.`
    : "";

  const system = `You are a senior graphic novel storyboard editor. You translate prose into a panel-by-panel comic script. You return ONLY JSON.

Rules:
- Output a JSON array of exactly ${opts.panelCount} objects.
- Each object has two fields: "caption" (the text that appears ABOVE the panel image, like a narration box — never dialogue inside the panel, never bubbles), and "imagePrompt" (a vivid visual description of what the artist should draw).
- The caption should be evocative narration, 1-3 sentences max. No speaker tags. No "Panel 1:" prefixes.
- The imagePrompt MUST be a self-contained description of the scene: subject (including gender, age, appearance), action, environment, mood, lighting, framing. The image generator has NO memory between panels and NO access to the author's directives — every directive that affects appearance MUST be re-stated inside every imagePrompt that depicts a character.
- Do NOT request text or speech bubbles inside the image.
- Maintain visual continuity: recurring characters should be described with the same identifying features each time.${referenceNote}
- The art style for every panel is: ${
    opts.artStyle?.trim() ||
    (opts.referenceDescription
      ? "exactly matching the STYLE block from the reference images above — do not impose any default cartoon, ink-and-wash, or stylized look; mirror the medium, palette, line-quality, and realism level of the reference"
      : "cinematic, richly detailed illustration")
  }.

═══════════════════════════════════════════════════════════════
ABSOLUTE STARTING RULE — VIOLATING THIS RUINS THE WHOLE NOVEL
═══════════════════════════════════════════════════════════════
Panel 1's caption MUST be drawn from the OPENING WORDS of the SOURCE TEXT itself. Do NOT invent a scene-setting preamble, an establishing shot, an opening narration, a "title-card" sentence, or a mood-setting intro paragraph that does not exist verbatim in the source. The author already wrote their opening — your job is to illustrate it, not to write a new one. The very first caption must paraphrase (or quote) the literal first sentence(s) of the source text.

FORBIDDEN panel-1 patterns (these are the "bullshit preambles" we are explicitly banning):
  ✗ "In the shadows of a dimly lit alley..."          (invented atmospheric opener)
  ✗ "Our story begins in..."                          (narrator framing)
  ✗ "Once upon a time..."                             (fairy-tale framing)
  ✗ "The year is 19XX. The city is..."                (invented title card)
  ✗ "Welcome to the world of..."                      (invented intro)
  ✗ "It was a dark and stormy night..."               (invented mood opener)
  ✗ Any opening sentence whose words/events do not appear in the source text's first paragraph.

REQUIRED behavior: read the source text's first 1–3 sentences. Panel 1's caption must depict THOSE words, and panel 1's imagePrompt must depict the scene those words describe. If the source opens with dialogue or action mid-scene, you open with dialogue or action mid-scene — do not back-fill an establishing shot before it.

The SAME RULE applies in reverse to the FINAL panel: do not invent a closing "the end" / "and so..." epilogue caption that does not exist in the source. The last panel illustrates the source's last sentences.${specBlock}`;

  const firstAnchor = firstSentences(opts.sourceText, 280);
  const lastAnchor = lastSentences(opts.sourceText, 280);
  const user = `SOURCE TEXT:
${opts.sourceText}

═══════════════════════════════════════════════════════════════
PANEL 1 ANCHOR — MANDATORY
═══════════════════════════════════════════════════════════════
Panel 1's caption MUST be a faithful paraphrase (or direct quote) of THIS exact opening text from the source above:

"""
${firstAnchor}
"""

Do NOT prepend an establishing-shot panel, a mood-setting opener, a narrator-introduction, a "title card", or ANY caption whose words/events are not contained in the anchor text above. If the source opens with an idea, a thesis, or dialogue, panel 1 illustrates THAT — not a fictional character introduction you invent. The very first word of panel 1's caption should map directly to the very first idea in the anchor text.

═══════════════════════════════════════════════════════════════
FINAL PANEL ANCHOR — MANDATORY
═══════════════════════════════════════════════════════════════
Panel ${opts.panelCount}'s caption MUST be a faithful paraphrase (or direct quote) of THIS exact closing text from the source above:

"""
${lastAnchor}
"""

Do NOT append a "the end" / "and so..." / epilogue caption whose words are not in the closing-anchor text above.

Return the JSON array of exactly ${opts.panelCount} objects now.`;

  const raw = await generateText({
    model: opts.textModel,
    explicit: opts.explicit,
    system,
    user,
  });

  const parsed = extractJson(raw);
  if (!Array.isArray(parsed)) throw new Error("Panel plan was not an array");
  const plans: PanelPlan[] = parsed.slice(0, opts.panelCount).map((p, i) => {
    const obj = p as { caption?: unknown; imagePrompt?: unknown };
    const caption = typeof obj.caption === "string" ? obj.caption : "";
    const imagePrompt = typeof obj.imagePrompt === "string" ? obj.imagePrompt : "";
    if (!imagePrompt) throw new Error(`Panel ${i + 1} missing imagePrompt`);
    return { caption, imagePrompt };
  });
  while (plans.length < opts.panelCount) {
    plans.push({ caption: "", imagePrompt: plans[plans.length - 1]?.imagePrompt ?? "continuation" });
  }

  // Anchor enforcement: even with explicit instructions in both the system and
  // user prompts, the text model frequently invents a scene-setting "establishing
  // shot" panel 1 (e.g. "In the dimly lit room, a heroic film noir man sits
  // at a desk..." when the source is actually an essay about truth). This
  // post-hoc check measures token overlap between the first/last panel
  // captions and the literal first/last anchor text from the source. If
  // overlap is too low, the caption is a fabricated preamble/epilogue — we
  // REPLACE both caption and imagePrompt with values grounded in the source.
  // Threshold of 0.15 is intentionally lenient: even a faithful paraphrase
  // typically shares ≥3 content words with a ~280-char anchor, so a value
  // below this means the panel barely references the source at all.
  const MIN_ANCHOR_OVERLAP = 0.15;
  const styleHint = opts.artStyle?.trim() || "Cinematic, richly detailed illustration.";
  if (plans.length > 0 && firstAnchor.length > 20) {
    const overlap = tokenOverlap(plans[0].caption, firstAnchor);
    if (overlap < MIN_ANCHOR_OVERLAP) {
      logger.warn(
        { originalCaption: plans[0].caption.slice(0, 200), anchorPreview: firstAnchor.slice(0, 200), overlap },
        "Panel 1 caption did not match source opening; replacing with literal first sentence(s)",
      );
      plans[0] = {
        caption: firstAnchor,
        imagePrompt: `A scene illustrating these opening words from the source: "${firstAnchor}". ${styleHint}`,
      };
    }
  }
  if (plans.length > 1 && lastAnchor.length > 20) {
    const lastIdx = plans.length - 1;
    const overlap = tokenOverlap(plans[lastIdx].caption, lastAnchor);
    if (overlap < MIN_ANCHOR_OVERLAP) {
      logger.warn(
        {
          panelIdx: lastIdx,
          originalCaption: plans[lastIdx].caption.slice(0, 200),
          anchorPreview: lastAnchor.slice(0, 200),
          overlap,
        },
        "Final panel caption did not match source closing; replacing with literal last sentence(s)",
      );
      plans[lastIdx] = {
        caption: lastAnchor,
        imagePrompt: `A scene illustrating these closing words from the source: "${lastAnchor}". ${styleHint}`,
      };
    }
  }

  return plans;
}

export async function runNovelGeneration(novelId: number): Promise<void> {
  const [novel] = await db.select().from(novelsTable).where(eq(novelsTable.id, novelId));
  if (!novel) {
    logger.error({ novelId }, "Novel not found for generation");
    return;
  }

  try {
    await db.update(novelsTable).set({ status: "generating" }).where(eq(novelsTable.id, novelId));

    const refs = novel.referenceImages ?? [];
    let referenceDescription = "";
    if (refs.length) {
      // Use pre-approved descriptions when present, only call the vision model for the rest.
      const preApproved = refs
        .filter((r) => r.description && r.description.trim())
        .map((r) => `REFERENCE "${r.label}":\n${r.description!.trim()}`)
        .join("\n\n");
      const needVision = refs.filter((r) => !r.description || !r.description.trim());
      let visionPart = "";
      if (needVision.length) {
        try {
          logger.info({ novelId, count: needVision.length }, "Describing reference images");
          visionPart = await describeReferenceImages(needVision);
        } catch (err) {
          logger.warn({ novelId, err: err instanceof Error ? err.message : err }, "Reference image description failed; falling back to labels");
        }
      }
      referenceDescription = [preApproved, visionPart].filter(Boolean).join("\n\n");
    }

    const plans = await planPanels({
      sourceText: novel.sourceText,
      specifications: novel.specifications,
      artStyle: novel.artStyle,
      panelCount: novel.panelCount,
      textModel: novel.textModel as ZhiId,
      explicit: novel.explicit,
      referenceLabels: refs.map((r) => r.label),
      referenceDescription,
    });

    // Insert plan rows up front so the client can show progress.
    const inserted = await db
      .insert(panelsTable)
      .values(
        plans.map((p, idx) => ({
          novelId,
          idx,
          caption: p.caption,
          imagePrompt: p.imagePrompt,
          status: "pending",
        })),
      )
      .returning({ id: panelsTable.id, idx: panelsTable.idx });

    // Build a STYLE-FIRST prompt. Image models weight the beginning of the prompt most heavily,
    // so we lead with the visual style (from references when available, else the user's art direction).
    // Extract ONLY the STYLE: blocks from the reference description — including SUBJECT/MOOD here
    // would inject the reference subject into every panel even when they aren't the focus.
    const userStyle = novel.artStyle?.trim();
    const styleOnly = referenceDescription
      ? Array.from(referenceDescription.matchAll(/STYLE\s*:\s*([^\n]+(?:\n(?!\s*(?:SUBJECT|MOOD|REFERENCE)\b)[^\n]+)*)/gi))
          .map((m) => m[1].trim())
          .filter(Boolean)
          .join(" ")
      : "";
    const refStyleLead = styleOnly
      ? `Visual style MUST match the reference images exactly — same medium, palette, level of realism, and rendering. ${styleOnly.replace(/\s+/g, " ").trim()}. `
      : "";
    const userStyleLead = userStyle ? `Art direction: ${userStyle}. ` : "";
    // Only fall back to a generic "illustration" tag when there is NO reference and NO user style.
    const fallbackStyle = !referenceDescription && !userStyle ? "Cinematic, richly detailed illustration. " : "";

    const specSuffix = novel.specifications?.trim()
      ? ` ABSOLUTE REQUIREMENTS THAT OVERRIDE ALL ELSE: ${novel.specifications.trim()}.`
      : "";

    // Use the first reference image as an img2img seed so the model literally sees the visual,
    // not just a text description of it. Strength is tuned so composition can change per panel
    // but the medium / realism / look are preserved.
    const firstRef = refs.find((r) => r.dataUrl && r.dataUrl.startsWith("data:"));

    // Lock a single random seed for the whole novel so the diffusion model samples
    // from the same point in latent space for every panel — keeps style, palette,
    // and character look consistent across the entire book. Derived deterministically
    // from the novelId so re-runs of the same novel are reproducible.
    // Venice rejects seeds > 999_999_999, so we must clamp the per-novel deterministic seed
    // below that ceiling. Keep it >0 so 0 doesn't accidentally disable seeding upstream.
    const novelSeed = (((novelId * 2654435761) >>> 0) % 999_999_999) + 1;

    // HARD RULE 1 (heads): generate at 4:3 with explicit wide-shot framing. Square or 16:9
    // crops too aggressively on portrait-heavy scenes; 4:3 with "wide shot, head in upper
    // third with empty space above" instructions makes head-cropping essentially impossible.
    const framingRule =
      " HARD COMPOSITION RULES (do not violate): WIDE SHOT or MEDIUM-WIDE SHOT only. The subject's ENTIRE head and FULL face must be visible with substantial empty space above the head. Frame from at least the waist up, preferably full body. NEVER a close-up. NEVER a portrait crop. NEVER let any part of the head, hair, or face touch or exceed the top edge of the image.";

    // HARD RULE 2 (style): we WANT to anchor every panel to panel 1's output via img2img,
    // but Venice's /image/generate currently rejects `image`+`strength` (see ai.ts note).
    // Until they expose a supported img2img field again, generateImage() ignores these
    // params and consistency relies on (1) a stable per-novel seed and (2) the style text
    // baked into every prompt via refStyleLead/userStyleLead/fallbackStyle. We keep the
    // anchor plumbing here so re-enabling img2img is a one-line change in ai.ts.
    let styleAnchor: string | undefined = firstRef?.dataUrl;
    // Running list of accepted-panel fingerprints so each new panel can be
    // checked against all prior ones for near-duplicates. See computeDHash.
    const priorHashes: bigint[] = [];

    for (const row of inserted.sort((a, b) => a.idx - b.idx)) {
      // Check for user abort between panels — status flips to "aborted" via the abort endpoint.
      const [cur] = await db
        .select({ status: novelsTable.status })
        .from(novelsTable)
        .where(eq(novelsTable.id, novelId));
      if (cur?.status === "aborted") {
        logger.info({ novelId, atPanel: row.idx }, "Novel generation aborted by user");
        await db
          .update(panelsTable)
          .set({ status: "failed", error: "Aborted by user" })
          .where(and(eq(panelsTable.novelId, novelId), inArray(panelsTable.status, ["pending", "generating"])));
        return;
      }
      const plan = plans[row.idx];
      await db
        .update(panelsTable)
        .set({ status: "generating" })
        .where(eq(panelsTable.id, row.id));
      try {
        const isFirstPanel = row.idx === 0;
        const { dataUrl, hash } = await generateImageWithQC({
          promptText: `${NO_TEXT_LEAD}${refStyleLead}${userStyleLead}${fallbackStyle}${plan.imagePrompt}.${NO_TEXT_TAIL}${framingRule}${specSuffix}`,
          novelId,
          panelIdx: row.idx,
          baseSeed: novelSeed,
          styleAnchor,
          isFirstPanel,
          priorHashes,
          // 4:3 = more vertical room for heads. The detail page uses object-contain so the
          // taller image is letterboxed, not cropped.
          width: 1024,
          height: 768,
        });
        priorHashes.push(hash);
        // Lock subsequent panels to panel 1's actual output — this is what forces style
        // consistency across the entire novel.
        if (isFirstPanel) {
          styleAnchor = dataUrl;
        }
        await db
          .update(panelsTable)
          .set({ status: "done", imageDataUrl: dataUrl })
          .where(eq(panelsTable.id, row.id));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ novelId, panelIdx: row.idx, err: msg }, "Panel failed");
        await db
          .update(panelsTable)
          .set({ status: "failed", error: msg })
          .where(eq(panelsTable.id, row.id));
      }
    }

    const finalPanels = await db
      .select({ status: panelsTable.status })
      .from(panelsTable)
      .where(eq(panelsTable.novelId, novelId))
      .orderBy(asc(panelsTable.idx));
    const anyFailed = finalPanels.some((p) => p.status === "failed");
    const allSettled = finalPanels.every((p) => p.status === "done" || p.status === "failed");
    await db
      .update(novelsTable)
      .set({
        status: allSettled ? (anyFailed ? "failed" : "done") : "generating",
        ...(anyFailed && allSettled ? { error: "One or more panels failed to generate" } : {}),
      })
      .where(eq(novelsTable.id, novelId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ novelId, err: msg }, "Novel generation failed");
    await db
      .update(novelsTable)
      .set({ status: "failed", error: msg })
      .where(eq(novelsTable.id, novelId));
  }
}

// ─── Surgical repair: regenerate just the bad panels ─────────────────────────
//
// Scans every existing panel of a novel via the same blank-image QC used during
// initial generation. Any panel that's blank OR previously marked failed is
// re-rolled with the same prompt scaffolding the original generation used. The
// caller can pass `instructions` (e.g. "get rid of the blank panels", or "make
// sure the protagonist is male") which is appended to the per-panel prompt as
// an additional override directive. Returns immediately with the count of
// targeted panels; the actual work runs in the background and the panel rows
// flip from "pending" → "generating" → "done"/"failed" exactly like the initial
// run, so the existing detail-page polling shows live progress.
export class NovelBusyError extends Error {
  constructor(public readonly novelStatus: string) {
    super(`Novel is currently ${novelStatus}; wait for it to finish before repairing`);
    this.name = "NovelBusyError";
  }
}

export async function repairNovel(
  novelId: number,
  instructions?: string,
): Promise<{ targetedPanels: number; reasons: Array<{ idx: number; reason: string }> }> {
  const [novel] = await db.select().from(novelsTable).where(eq(novelsTable.id, novelId));
  if (!novel) throw new Error("Novel not found");

  // Concurrency guard: refuse if the novel is still being generated (or being
  // repaired by a previous request). Two concurrent workers writing panel rows
  // for the same novel would race on status updates and double-bill us for
  // expensive image generations. The status flip to "generating" inside this
  // function itself acts as the lock — we set it after this gate passes so a
  // second concurrent repair call hits this branch and bails out.
  if (novel.status === "pending" || novel.status === "generating") {
    throw new NovelBusyError(novel.status);
  }

  const allPanels = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.novelId, novelId))
    .orderBy(asc(panelsTable.idx));

  const targets: Array<{ id: number; idx: number; imagePrompt: string | null }> = [];
  const reasons: Array<{ idx: number; reason: string }> = [];
  const targetIds = new Set<number>();
  const pushTarget = (p: { id: number; idx: number; imagePrompt: string | null }, reason: string) => {
    if (targetIds.has(p.id)) return;
    targetIds.add(p.id);
    targets.push({ id: p.id, idx: p.idx, imagePrompt: p.imagePrompt });
    reasons.push({ idx: p.idx, reason });
  };

  // First pass: blank, failed, undecodable, missing-payload — and collect
  // dHashes of every panel that survives the basic checks so we can scan for
  // near-duplicates in a second pass.
  const survivorHashes: Array<{ id: number; idx: number; imagePrompt: string | null; hash: bigint }> = [];
  for (const p of allPanels) {
    if (p.status === "failed") {
      pushTarget(p, `previously failed: ${p.error ?? "unknown"}`);
      continue;
    }
    if (p.status === "done" && p.imageDataUrl) {
      try {
        const qc = await analyzePngForBlankness(p.imageDataUrl);
        if (qc.isBlank) {
          pushTarget(p, `blank panel (${qc.reason})`);
          continue;
        }
        survivorHashes.push({ id: p.id, idx: p.idx, imagePrompt: p.imagePrompt, hash: await computeDHash(p.imageDataUrl) });
      } catch (err) {
        // Fail CLOSED: an undecodable image is by definition broken. Target it
        // so a corrupted payload doesn't survive a scan.
        pushTarget(p, `undecodable image (${err instanceof Error ? err.message : "parse error"})`);
      }
    } else if (p.status === "done" && !p.imageDataUrl) {
      pushTarget(p, "missing image payload");
    }
  }

  // Second pass: near-duplicate detection across the survivors. For each pair
  // within DUPLICATE_DHASH_THRESHOLD, KEEP the earlier panel (lower idx) and
  // target the later one — re-rolling it with a varied seed will produce a
  // visually distinct image while preserving the chronological order.
  for (let i = 0; i < survivorHashes.length; i++) {
    if (targetIds.has(survivorHashes[i].id)) continue;
    for (let j = i + 1; j < survivorHashes.length; j++) {
      if (targetIds.has(survivorHashes[j].id)) continue;
      const d = hammingDistance(survivorHashes[i].hash, survivorHashes[j].hash);
      if (d <= DUPLICATE_DHASH_THRESHOLD) {
        pushTarget(
          survivorHashes[j],
          `duplicate of panel #${survivorHashes[i].idx + 1} (dHash distance ${d})`,
        );
      }
    }
  }

  if (!targets.length) return { targetedPanels: 0, reasons: [] };

  // Reset target panels so the polling UI immediately sees them as not-done
  // (and the user sees the spinner instead of stale broken images).
  for (const t of targets) {
    await db
      .update(panelsTable)
      .set({ status: "pending", error: null })
      .where(eq(panelsTable.id, t.id));
  }
  await db
    .update(novelsTable)
    .set({ status: "generating", error: null })
    .where(eq(novelsTable.id, novelId));

  // Background-fire the actual regeneration; do NOT await — the route returns
  // immediately with the target count and the client polls for progress.
  void regenerateSpecificPanels(novel, targets, instructions).catch((err) => {
    logger.error({ novelId, err: err instanceof Error ? err.message : err }, "repairNovel crashed");
    void db
      .update(novelsTable)
      .set({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .where(eq(novelsTable.id, novelId));
  });

  return { targetedPanels: targets.length, reasons };
}

// Internal: regenerate a specific subset of panels using the same prompt
// scaffolding as the initial run. Used by repairNovel.
async function regenerateSpecificPanels(
  novel: Novel,
  targets: Array<{ id: number; idx: number; imagePrompt: string | null }>,
  instructions?: string,
): Promise<void> {
  const novelId = novel.id;

  // Rebuild the reference description (same path as runNovelGeneration). Refs
  // are stored on the novel so this is cheap; we just call the vision model
  // again if any reference lacks a pre-approved description.
  const refs = novel.referenceImages ?? [];
  let referenceDescription = "";
  if (refs.length) {
    const preApproved = refs
      .filter((r) => r.description && r.description.trim())
      .map((r) => `REFERENCE "${r.label}":\n${r.description!.trim()}`)
      .join("\n\n");
    const needVision = refs.filter((r) => !r.description || !r.description.trim());
    let visionPart = "";
    if (needVision.length) {
      try {
        visionPart = await describeReferenceImages(needVision);
      } catch (err) {
        logger.warn({ novelId, err: err instanceof Error ? err.message : err }, "Repair: vision call failed");
      }
    }
    referenceDescription = [preApproved, visionPart].filter(Boolean).join("\n\n");
  }

  const userStyle = novel.artStyle?.trim();
  const styleOnly = referenceDescription
    ? Array.from(referenceDescription.matchAll(/STYLE\s*:\s*([^\n]+(?:\n(?!\s*(?:SUBJECT|MOOD|REFERENCE)\b)[^\n]+)*)/gi))
        .map((m) => m[1].trim())
        .filter(Boolean)
        .join(" ")
    : "";
  const refStyleLead = styleOnly
    ? `Visual style MUST match the reference images exactly — same medium, palette, level of realism, and rendering. ${styleOnly.replace(/\s+/g, " ").trim()}. `
    : "";
  const userStyleLead = userStyle ? `Art direction: ${userStyle}. ` : "";
  const fallbackStyle = !referenceDescription && !userStyle ? "Cinematic, richly detailed illustration. " : "";

  // Combine the novel's existing specifications with the user's surgical repair
  // instructions. Both are treated as overriding directives — the repair text
  // appears LAST so it takes precedence when it conflicts with the original.
  const specParts: string[] = [];
  if (novel.specifications?.trim()) specParts.push(novel.specifications.trim());
  if (instructions?.trim()) specParts.push(`REPAIR DIRECTIVE: ${instructions.trim()}`);
  const specSuffix = specParts.length
    ? ` ABSOLUTE REQUIREMENTS THAT OVERRIDE ALL ELSE: ${specParts.join(". ")}.`
    : "";

  const framingRule =
    " HARD COMPOSITION RULES (do not violate): WIDE SHOT or MEDIUM-WIDE SHOT only. The subject's ENTIRE head and FULL face must be visible with substantial empty space above the head. Frame from at least the waist up, preferably full body. NEVER a close-up. NEVER a portrait crop. NEVER let any part of the head, hair, or face touch or exceed the top edge of the image.";

  // Same deterministic seed as initial generation so the style stays consistent
  // across panels we're keeping and panels we're re-rolling. The QC helper
  // varies the seed PER RETRY only if a re-roll comes back blank again.
  const novelSeed = (((novelId * 2654435761) >>> 0) % 999_999_999) + 1;

  // If we're NOT regenerating panel 0, load its existing image as the style
  // anchor for the others. If we ARE regenerating panel 0, start from the
  // reference image (same logic as initial generation).
  const firstRef = refs.find((r) => r.dataUrl && r.dataUrl.startsWith("data:"));
  let styleAnchor: string | undefined = firstRef?.dataUrl;
  if (!targets.some((t) => t.idx === 0)) {
    const [panel0] = await db
      .select({ imageDataUrl: panelsTable.imageDataUrl })
      .from(panelsTable)
      .where(eq(panelsTable.novelId, novelId))
      .orderBy(asc(panelsTable.idx))
      .limit(1);
    if (panel0?.imageDataUrl) styleAnchor = panel0.imageDataUrl;
  }

  // Pre-load perceptual hashes of every panel we're KEEPING, so the QC gate
  // can reject any regenerated panel that comes back looking like one of the
  // existing-and-untouched panels. New panels are added to this list as they
  // succeed, so the batch also self-deduplicates internally.
  const targetIdSet = new Set(targets.map((t) => t.id));
  const allCurrent = await db
    .select({ id: panelsTable.id, imageDataUrl: panelsTable.imageDataUrl, status: panelsTable.status })
    .from(panelsTable)
    .where(eq(panelsTable.novelId, novelId));
  const priorHashes: bigint[] = [];
  for (const p of allCurrent) {
    if (targetIdSet.has(p.id)) continue;
    if (p.status !== "done" || !p.imageDataUrl) continue;
    try {
      priorHashes.push(await computeDHash(p.imageDataUrl));
    } catch {
      // Unhashable — skip; the panel is already a repair target if it was
      // unparseable, otherwise it's not blocking us from generating new ones.
    }
  }

  for (const row of targets.sort((a, b) => a.idx - b.idx)) {
    if (!row.imagePrompt) {
      logger.warn({ novelId, panelIdx: row.idx }, "Repair: panel has no imagePrompt, skipping");
      await db
        .update(panelsTable)
        .set({ status: "failed", error: "Missing imagePrompt; can't repair without re-planning" })
        .where(eq(panelsTable.id, row.id));
      continue;
    }
    await db.update(panelsTable).set({ status: "generating" }).where(eq(panelsTable.id, row.id));
    try {
      const isFirstPanel = row.idx === 0;
      // Vary the base seed per repair target so we don't just resample the
      // same latent point that produced the original (possibly duplicate)
      // image. The per-panel idx mixes in deterministically.
      const repairSeed = ((novelSeed + (row.idx + 1) * 104729) % 999_999_999) + 1;
      const { dataUrl, hash } = await generateImageWithQC({
        promptText: `${NO_TEXT_LEAD}${refStyleLead}${userStyleLead}${fallbackStyle}${row.imagePrompt}.${NO_TEXT_TAIL}${framingRule}${specSuffix}`,
        novelId,
        panelIdx: row.idx,
        baseSeed: repairSeed,
        styleAnchor,
        isFirstPanel,
        priorHashes,
        width: 1024,
        height: 768,
      });
      priorHashes.push(hash);
      if (isFirstPanel) styleAnchor = dataUrl;
      await db
        .update(panelsTable)
        .set({ status: "done", imageDataUrl: dataUrl, error: null })
        .where(eq(panelsTable.id, row.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ novelId, panelIdx: row.idx, err: msg }, "Repair: panel failed");
      await db
        .update(panelsTable)
        .set({ status: "failed", error: msg })
        .where(eq(panelsTable.id, row.id));
    }
  }

  // Re-derive novel status from the final panel state.
  const finalPanels = await db
    .select({ status: panelsTable.status })
    .from(panelsTable)
    .where(eq(panelsTable.novelId, novelId));
  const anyFailed = finalPanels.some((p) => p.status === "failed");
  const allSettled = finalPanels.every((p) => p.status === "done" || p.status === "failed");
  await db
    .update(novelsTable)
    .set({
      status: allSettled ? (anyFailed ? "failed" : "done") : "generating",
      ...(anyFailed && allSettled ? { error: "One or more panels failed to generate" } : { error: null }),
    })
    .where(eq(novelsTable.id, novelId));
}

// Regenerate a single panel by its idx. Reuses the same prompt scaffolding
// as repairNovel/regenerateSpecificPanels but targets exactly one panel.
export async function regenerateSinglePanel(
  novelId: number,
  panelIdx: number,
): Promise<void> {
  const [novel] = await db.select().from(novelsTable).where(eq(novelsTable.id, novelId));
  if (!novel) throw new Error("Novel not found");
  if (novel.status === "pending" || novel.status === "generating") {
    throw new NovelBusyError(novel.status);
  }
  const [panel] = await db
    .select()
    .from(panelsTable)
    .where(and(eq(panelsTable.novelId, novelId), eq(panelsTable.idx, panelIdx)));
  if (!panel) throw new Error("Panel not found");

  await db
    .update(panelsTable)
    .set({ status: "pending", error: null })
    .where(eq(panelsTable.id, panel.id));
  await db
    .update(novelsTable)
    .set({ status: "generating", error: null })
    .where(eq(novelsTable.id, novelId));

  void regenerateSpecificPanels(novel, [
    { id: panel.id, idx: panel.idx, imagePrompt: panel.imagePrompt },
  ]).catch((err) => {
    logger.error(
      { novelId, panelIdx, err: err instanceof Error ? err.message : err },
      "regenerateSinglePanel crashed",
    );
    void db
      .update(novelsTable)
      .set({ status: "failed", error: err instanceof Error ? err.message : String(err) })
      .where(eq(novelsTable.id, novelId));
  });
}

export function startNovelGeneration(novelId: number): void {
  runNovelGeneration(novelId).catch((err) => {
    logger.error({ novelId, err }, "Background novel generation crashed");
  });
}
