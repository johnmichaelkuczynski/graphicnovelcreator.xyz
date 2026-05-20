import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { generateImage } from "./ai";

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

export async function refineReferenceImage(opts: {
  dataUrl: string;
  label: string;
  instructions: string;
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

  if (anthropicClient) {
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
    description = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  } else if (openaiClient) {
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
    description = (resp.choices[0]?.message.content ?? "").trim();
  } else {
    throw new Error("No vision model available (need Anthropic or OpenAI).");
  }

  if (!description) throw new Error("Vision model returned an empty description.");

  const imagePrompt = `${description.replace(/\s+/g, " ").trim()} Full-body illustration of the subject, centered, plain backdrop. No text, no captions, no speech bubbles.`;
  const sampleImageDataUrl = await generateImage({ prompt: imagePrompt });

  return { description, sampleImageDataUrl };
}
