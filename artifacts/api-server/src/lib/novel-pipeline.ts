import { eq, asc } from "drizzle-orm";
import { db, novelsTable, panelsTable } from "@workspace/db";
import { generateText, generateImage, describeReferenceImages, type ZhiId } from "./ai";
import { logger } from "./logger";

interface PanelPlan {
  caption: string;
  imagePrompt: string;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  // Try direct parse first
  try {
    return JSON.parse(candidate);
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
        return JSON.parse(candidate.slice(start, i + 1));
      }
    }
  }
  throw new Error("Malformed JSON in model output");
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

These directives OVERRIDE anything implied by the source text. If the source text describes a character as male but the author directs that all characters be female, the character IS female. If the source text uses a name like "John" but the author directs the cast be female, rename the character (e.g. "Joan") and depict her as a woman. Every caption AND every imagePrompt must reflect these directives verbatim. Do not soften, paraphrase, partially apply, or ignore any directive. A panel that violates a directive is a failed panel.`
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
  }.${specBlock}`;

  const user = `SOURCE TEXT:\n${opts.sourceText}\n\nReturn the JSON array now.`;

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

    for (const row of inserted.sort((a, b) => a.idx - b.idx)) {
      const plan = plans[row.idx];
      await db
        .update(panelsTable)
        .set({ status: "generating" })
        .where(eq(panelsTable.id, row.id));
      try {
        const dataUrl = await generateImage({
          prompt: `${refStyleLead}${userStyleLead}${fallbackStyle}${plan.imagePrompt}. No text, no captions, no speech bubbles, no panel borders inside the image.${specSuffix}`,
          referenceImageDataUrl: firstRef?.dataUrl,
          referenceStrength: 0.72,
          seed: novelSeed,
        });
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

export function startNovelGeneration(novelId: number): void {
  runNovelGeneration(novelId).catch((err) => {
    logger.error({ novelId, err }, "Background novel generation crashed");
  });
}
