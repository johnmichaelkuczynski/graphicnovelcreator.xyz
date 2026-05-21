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

  const instruction = `You are a senior art director. The user has uploaded ${images.length} reference image(s) that MUST guide every illustration in a graphic novel.

For each image, write a tight, concrete description that another artist could reproduce. Cover:
  • SUBJECT IDENTITY (who/what is depicted — gender, age, distinguishing features, clothing, hair, expression). This is how the subject must be drawn in EVERY panel they appear in.
  • VISUAL STYLE (medium, line work, color palette with specific hues, shading technique, level of detail, texture).
  • COMPOSITION & MOOD (framing, lighting, atmosphere).

Format your reply EXACTLY like this, with no preamble:

REFERENCE "<label>":
  SUBJECT: <one paragraph>
  STYLE: <one paragraph>
  MOOD: <one short paragraph>

If multiple references are given, describe each one in turn. Be specific and concrete — avoid vague words like "nice", "interesting", "good".`;

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

export async function generateImage(opts: {
  prompt: string;
  style?: string;
  negativePrompt?: string;
  referenceImageDataUrl?: string;
  referenceStrength?: number;
  width?: number;
  height?: number;
}): Promise<string> {
  if (!process.env.VENICE_API_KEY) throw new Error("VENICE_API_KEY not set");
  const body: Record<string, unknown> = {
    model: "venice-sd35",
    prompt: opts.prompt,
    width: opts.width ?? 1024,
    height: opts.height ?? 1024,
    steps: 30,
    cfg_scale: 7.5,
    style_preset: opts.style,
    negative_prompt:
      opts.negativePrompt ??
      "text, watermark, signature, logo, low quality, blurry, deformed, extra limbs, bad anatomy",
    safe_mode: false,
    hide_watermark: true,
    return_binary: false,
  };
  if (opts.referenceImageDataUrl) {
    const { base64 } = parseDataUrl(opts.referenceImageDataUrl);
    body.image = base64;
    body.strength = opts.referenceStrength ?? 0.65;
  }
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
    // If img2img failed (e.g. parameter not supported), retry without the reference image.
    if (opts.referenceImageDataUrl) {
      logger.warn({ status: res.status, errText: errText.slice(0, 300) }, "Venice img2img failed; retrying text-only");
      return generateImage({ ...opts, referenceImageDataUrl: undefined });
    }
    throw new Error(`Venice image error ${res.status}: ${errText}`);
  }
  const json = (await res.json()) as { images?: string[]; data?: Array<{ b64_json?: string }> };
  const b64 = json.images?.[0] ?? json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Venice returned no image");
  return `data:image/png;base64,${b64}`;
}
