import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { generateImage } from "./ai";
import { logger } from "./logger";

const VENICE_BASE = "https://api.venice.ai/api/v1";

const anthropicClient = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY
  ? new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    })
  : null;

const openaiClient = process.env.AI_INTEGRATIONS_OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    })
  : null;

function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Reference image is not a base64 data URL");
  return { mediaType: match[1], base64: match[2] };
}

interface HistoryItem {
  instructions: string;
  description?: string;
  sampleImageDataUrl?: string;
  feedback?: string;
}

const REFUSAL_RE = /^(i\s+(?:can'?t|cannot|won'?t|am\s+(?:unable|not\s+able))|i'?m\s+(?:sorry|unable|not\s+able)|sorry,?\s+i)/i;

function looksLikeRefusal(text: string): boolean {
  const t = text.trim();
  if (t.length < 200) return true;
  if (REFUSAL_RE.test(t)) return true;
  if (!/SUBJECT/i.test(t)) return true;
  return false;
}

async function callVeniceVision(dataUrl: string, prompt: string): Promise<string> {
  if (!process.env.VENICE_API_KEY) throw new Error("VENICE_API_KEY not set");
  const res = await fetch(`${VENICE_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "qwen-2.5-vl",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: 1500,
      venice_parameters: { include_venice_system_prompt: false },
    }),
  });
  if (!res.ok) throw new Error(`Venice vision error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return (json.choices[0]?.message.content ?? "").trim();
}

export async function refineReferenceImage(opts: {
  dataUrl: string;
  label: string;
  instructions: string;
  explicit?: boolean;
  history: HistoryItem[];
}): Promise<{ description: string; sampleImageDataUrl: string }> {
  const historyBlock = opts.history.length
    ? opts.history
        .map((h, i) => {
          const lines = [`-- Iteration ${i + 1} --`, `Instructions: ${h.instructions}`];
          if (h.description) lines.push(`Description produced: ${h.description}`);
          if (h.feedback) lines.push(`User feedback (what was wrong): ${h.feedback}`);
          return lines.join("\n");
        })
        .join("\n\n")
    : "(no prior iterations)";

  const promptText = `You are a senior art director. The user has uploaded a reference photograph and wants a single, concrete visual description of the subject "${opts.label}" that an illustrator can use across many graphic-novel panels.

The user's current instructions for how to interpret this reference:
"""
${opts.instructions || "(no extra instructions — interpret faithfully)"}
"""

Prior iteration history:
${historyBlock}

Your task:
1. Look at the reference image.
2. Apply the user's current instructions strictly. If prior iterations were rejected, the new description MUST address the feedback.
3. Produce ONE description, in this exact format, no preamble:

SUBJECT (${opts.label}): <one paragraph describing the subject — gender, age, build, face, hair, clothing, distinguishing features, expression. Concrete and reproducible.>
STYLE: <one paragraph describing medium, line work, color palette with specific hues, shading, level of detail, texture.>
MOOD: <one short paragraph — framing, lighting, atmosphere.>

Do not add any other commentary.`;

  let description = "";

  // Explicit content goes straight to Venice (uncensored vision) — Claude/OpenAI will refuse.
  const tryVenice = async (): Promise<string> => callVeniceVision(opts.dataUrl, promptText);
  const tryClaude = async (): Promise<string> => {
    if (!anthropicClient) throw new Error("Anthropic not configured");
    const { mediaType, base64 } = parseDataUrl(opts.dataUrl);
    const msg = await anthropicClient.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as "image/png", data: base64 } },
            { type: "text", text: promptText },
          ],
        },
      ],
    });
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  };
  const tryOpenAI = async (): Promise<string> => {
    if (!openaiClient) throw new Error("OpenAI not configured");
    const resp = await openaiClient.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: opts.dataUrl } },
            { type: "text", text: promptText },
          ],
        },
      ],
    });
    return (resp.choices[0]?.message.content ?? "").trim();
  };

  // Ordered ladder. For explicit content, Venice first. Otherwise Claude → OpenAI → Venice.
  const ladder: Array<{ name: string; fn: () => Promise<string> }> = opts.explicit
    ? [
        { name: "venice", fn: tryVenice },
        ...(anthropicClient ? [{ name: "claude", fn: tryClaude }] : []),
        ...(openaiClient ? [{ name: "openai", fn: tryOpenAI }] : []),
      ]
    : [
        ...(anthropicClient ? [{ name: "claude", fn: tryClaude }] : []),
        ...(openaiClient ? [{ name: "openai", fn: tryOpenAI }] : []),
        { name: "venice", fn: tryVenice },
      ];

  for (const step of ladder) {
    try {
      const candidate = await step.fn();
      if (candidate && !looksLikeRefusal(candidate)) {
        description = candidate;
        logger.info({ provider: step.name, chars: candidate.length }, "Refinement description accepted");
        break;
      }
      logger.warn({ provider: step.name, chars: candidate?.length ?? 0 }, "Refinement description rejected (refusal/too-short); trying next provider");
    } catch (err) {
      logger.warn({ provider: step.name, err: err instanceof Error ? err.message : err }, "Refinement provider threw; trying next");
    }
  }

  if (!description) {
    throw new Error(
      "All vision providers either refused or returned an unusable description. If this is an adult/explicit reference, enable the Explicit toggle on the refine page.",
    );
  }

  const imagePrompt = `${description.replace(/\s+/g, " ").trim()} Full-body illustration of the subject, centered, plain backdrop. No text, no captions, no speech bubbles.`;
  const sampleImageDataUrl = await generateImage({ prompt: imagePrompt });

  return { description, sampleImageDataUrl };
}
