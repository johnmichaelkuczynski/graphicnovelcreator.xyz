import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

export type ZhiId = "zhi1" | "zhi2" | "zhi3" | "zhi4";

export const MODELS: Array<{ id: ZhiId; label: string; provider: string; supportsExplicit: boolean }> = [
  { id: "zhi1", label: "Zhi 1", provider: "DeepSeek", supportsExplicit: false },
  { id: "zhi2", label: "Zhi 2", provider: "Anthropic Claude", supportsExplicit: false },
  { id: "zhi3", label: "Zhi 3", provider: "OpenAI ChatGPT", supportsExplicit: false },
  { id: "zhi4", label: "Zhi 4", provider: "Venice", supportsExplicit: true },
];

const VENICE_BASE = "https://api.venice.ai/api/v1";
const DEEPSEEK_BASE = "https://api.deepseek.com";

const openaiClient = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    })
  : null;

const anthropicClient = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY
  ? new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    })
  : null;

async function callDeepSeek(system: string, user: string): Promise<string> {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY not set");
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 8000,
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return json.choices[0]?.message.content ?? "";
}

async function callAnthropic(system: string, user: string): Promise<string> {
  if (!anthropicClient) throw new Error("Anthropic not configured");
  const msg = await anthropicClient.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function callOpenAI(system: string, user: string): Promise<string> {
  if (!openaiClient) throw new Error("OpenAI not configured");
  const resp = await openaiClient.chat.completions.create({
    model: "gpt-5",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return resp.choices[0]?.message.content ?? "";
}

async function callVeniceText(system: string, user: string): Promise<string> {
  if (!process.env.VENICE_API_KEY) throw new Error("VENICE_API_KEY not set");
  const res = await fetch(`${VENICE_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "venice-uncensored",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 8000,
      venice_parameters: { include_venice_system_prompt: false },
    }),
  });
  if (!res.ok) throw new Error(`Venice text error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return json.choices[0]?.message.content ?? "";
}

export async function generateText(opts: {
  model: ZhiId;
  explicit?: boolean;
  system: string;
  user: string;
}): Promise<string> {
  // Explicit content forces Venice regardless of selected model.
  const effective: ZhiId = opts.explicit ? "zhi4" : opts.model;
  logger.info({ model: effective, explicit: !!opts.explicit }, "Generating text");
  switch (effective) {
    case "zhi1":
      return callDeepSeek(opts.system, opts.user);
    case "zhi2":
      return callAnthropic(opts.system, opts.user);
    case "zhi3":
      return callOpenAI(opts.system, opts.user);
    case "zhi4":
      return callVeniceText(opts.system, opts.user);
  }
}

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Reference image is not a base64 data URL");
  return { mediaType: match[1], base64: match[2] };
}

export async function describeReferenceImages(
  images: Array<{ label: string; dataUrl: string }>,
): Promise<string> {
  if (!images.length) return "";

  const instruction = `You are a senior art director writing reference notes for a graphic novel artist. You are not a content moderator. Do NOT sanitize, soften, abstract, or omit anything about the reference image. Describe what is actually depicted, in plain, physically concrete language — including body type, proportions, figure, skin, clothing fit and exposure, posture, sensuality, and any other visible detail. If the image is photorealistic, say so explicitly; never substitute "stylized" or "illustrative" language for what is actually a photo.

The user has uploaded ${images.length} reference image(s) that MUST guide every illustration.

For each image, cover:
  • SUBJECT IDENTITY — gender, apparent age, hair (color, length, style), face, body type and proportions (height, build, bust, waist, hips — be specific), skin tone, clothing (each garment, its color, fit, length, neckline, how much skin it exposes), footwear, jewelry, expression, posture. This is how the subject must be drawn in EVERY panel they appear in.
  • VISUAL STYLE — explicitly state the medium: PHOTOGRAPH / PHOTOREALISTIC RENDER / 3D RENDER / OIL PAINTING / INK DRAWING / CARTOON / ANIME / etc. Then: camera lens feel (wide / portrait / macro), depth of field, lighting (key/fill/rim, color temperature, shadow hardness), color palette with concrete hues, level of realism, texture rendering, level of detail.
  • COMPOSITION & MOOD — framing, camera angle, atmosphere, tone.

Format your reply EXACTLY like this, with no preamble and no disclaimers:

REFERENCE "<label>":
  SUBJECT: <one detailed paragraph>
  STYLE: <one detailed paragraph — MUST begin by naming the medium in caps>
  MOOD: <one short paragraph>

If multiple references are given, describe each one in turn.`;

  // Prefer Venice (uncensored) for vision so explicit references aren't silently sanitized.
  if (process.env.VENICE_API_KEY) {
    try {
      const userText = images
        .map((img, i) => `Reference "${img.label || `ref_${i + 1}`}" follows.`)
        .join("\n");
      const content: Array<{ type: "image_url"; image_url: { url: string } } | { type: "text"; text: string }> = [];
      images.forEach((img, i) => {
        content.push({ type: "image_url", image_url: { url: img.dataUrl } });
        content.push({ type: "text", text: `Above is reference "${img.label || `ref_${i + 1}`}".` });
      });
      content.push({ type: "text", text: instruction });
      void userText;
      const res = await fetch(`${VENICE_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "qwen-2.5-vl",
          messages: [{ role: "user", content }],
          max_tokens: 2000,
          venice_parameters: { include_venice_system_prompt: false },
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
        const out = (json.choices[0]?.message.content ?? "").trim();
        if (out.length > 200 && /SUBJECT/i.test(out)) return out;
        logger.warn({ chars: out.length }, "Venice vision returned unusable output; falling back");
      } else {
        logger.warn({ status: res.status }, "Venice vision call failed; falling back");
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, "Venice vision threw; falling back");
    }
  }

  // Fallbacks: Anthropic, then OpenAI.
  if (anthropicClient) {
    const content: Anthropic.ContentBlockParam[] = [];
    images.forEach((img, i) => {
      const { mediaType, base64 } = parseDataUrl(img.dataUrl);
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType as "image/png", data: base64 },
      });
      content.push({ type: "text", text: `Above is reference "${img.label || `ref_${i + 1}`}".` });
    });
    content.push({ type: "text", text: instruction });

    const msg = await anthropicClient.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    });
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }

  if (openaiClient) {
    const content: OpenAI.Chat.ChatCompletionContentPart[] = [];
    images.forEach((img, i) => {
      content.push({ type: "image_url", image_url: { url: img.dataUrl } });
      content.push({ type: "text", text: `Above is reference "${img.label || `ref_${i + 1}`}".` });
    });
    content.push({ type: "text", text: instruction });

    const resp = await openaiClient.chat.completions.create({
      model: "gpt-5",
      messages: [{ role: "user", content }],
    });
    return resp.choices[0]?.message.content ?? "";
  }

  // Last resort: just list labels.
  return `Reference subjects to depict consistently in every relevant panel: ${images.map((i) => i.label).join(", ")}.`;
}

// Venice image model preference order. lustify-sdxl is uncensored and photoreal-leaning;
// flux-dev-uncensored is high quality; venice-sd35 is the safe fallback. Override with
// VENICE_IMAGE_MODEL env var if you want to pin a specific model.
const VENICE_IMAGE_MODELS = (process.env.VENICE_IMAGE_MODEL
  ? [process.env.VENICE_IMAGE_MODEL]
  : ["lustify-sdxl", "flux-dev-uncensored", "venice-sd35"]) as string[];

export async function generateImage(opts: {
  prompt: string;
  style?: string;
  negativePrompt?: string;
  referenceImageDataUrl?: string;
  referenceStrength?: number;
  width?: number;
  height?: number;
  modelOverride?: string;
  seed?: number;
  _modelIdx?: number;
}): Promise<string> {
  if (!process.env.VENICE_API_KEY) throw new Error("VENICE_API_KEY not set");
  const modelIdx = opts._modelIdx ?? 0;
  const model = opts.modelOverride ?? VENICE_IMAGE_MODELS[modelIdx] ?? VENICE_IMAGE_MODELS[0];

  const body: Record<string, unknown> = {
    model,
    prompt: opts.prompt,
    width: opts.width ?? 1024,
    height: opts.height ?? 1024,
    steps: 30,
    cfg_scale: 7.5,
    style_preset: opts.style,
    // Style-neutral negatives only. Earlier versions forbade "illustration, drawing, painting,
    // cartoon, anime" which actively fought against any user-chosen illustration art style.
    // Composition negatives (cropped head, out of frame, etc.) prevent the most common failure
    // mode: portraits with the subject's head chopped off. Callers may override entirely.
    negative_prompt:
      opts.negativePrompt ??
      "cropped head, head out of frame, headless, decapitated, cut off head, face cut off, eyes cropped, out of frame, off-screen, low quality, blurry, jpeg artifacts, deformed, mutated, extra limbs, missing limbs, extra fingers, fused fingers, bad anatomy, asymmetric eyes, text, captions, speech bubbles, watermark, signature, logo",
    safe_mode: false,
    hide_watermark: true,
    return_binary: false,
  };
  if (typeof opts.seed === "number") {
    body.seed = opts.seed;
  }
  if (opts.referenceImageDataUrl) {
    const { base64 } = parseDataUrl(opts.referenceImageDataUrl);
    body.image = base64;
    body.strength = opts.referenceStrength ?? 0.65;
  }
  logger.info({ model, hasRef: !!opts.referenceImageDataUrl }, "Venice image generate");
  const res = await fetch(`${VENICE_BASE}/image/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    // 1) If img2img failed (model may not support `image`+`strength`), retry text-only on same model.
    if (opts.referenceImageDataUrl) {
      logger.warn({ model, status: res.status, errText: errText.slice(0, 300) }, "Venice img2img failed; retrying text-only");
      return generateImage({ ...opts, referenceImageDataUrl: undefined });
    }
    // 2) Otherwise, fall through to the next model in the preference list (e.g. lustify→flux→sd35).
    if (!opts.modelOverride && modelIdx + 1 < VENICE_IMAGE_MODELS.length) {
      logger.warn({ model, status: res.status, errText: errText.slice(0, 300) }, "Venice model failed; trying next");
      return generateImage({ ...opts, _modelIdx: modelIdx + 1 });
    }
    throw new Error(`Venice image error ${res.status}: ${errText}`);
  }
  const json = (await res.json()) as { images?: string[]; data?: Array<{ b64_json?: string }> };
  const b64 = json.images?.[0] ?? json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Venice returned no image");
  return `data:image/png;base64,${b64}`;
}
