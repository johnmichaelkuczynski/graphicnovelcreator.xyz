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

export async function generateImage(opts: {
  prompt: string;
  style?: string;
}): Promise<string> {
  if (!process.env.VENICE_API_KEY) throw new Error("VENICE_API_KEY not set");
  const res = await fetch(`${VENICE_BASE}/image/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "venice-sd35",
      prompt: opts.prompt,
      width: 1024,
      height: 1024,
      steps: 20,
      cfg_scale: 7,
      style_preset: opts.style,
      safe_mode: false,
      hide_watermark: true,
      return_binary: false,
    }),
  });
  if (!res.ok) throw new Error(`Venice image error ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { images?: string[]; data?: Array<{ b64_json?: string }> };
  const b64 = json.images?.[0] ?? json.data?.[0]?.b64_json;
  if (!b64) throw new Error("Venice returned no image");
  return `data:image/png;base64,${b64}`;
}
