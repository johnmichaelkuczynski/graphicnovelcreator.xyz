// System diagnostics + end-to-end functional check.
//
// GET  /api/diagnostics            — fast system-level checks (env, DB, AI keys, schema).
// POST /api/diagnostics/functional — walks the real HTTP stack over loopback, creating
//                                    and tearing down a synthetic 1-panel novel.
//
// Adapted from the PHIL-101 / SYSTEMS SCIENCE 101 blueprint for this app's stack
// (Venice + DeepSeek replace Anthropic + GPTZero; no auth layer to exercise).
//
// SECURITY: both endpoints are unauthenticated during beta. Before launching publicly,
// gate them behind an admin guard — the functional check writes to the DB and bills
// against external APIs.

import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { runFunctionalCheck } from "../lib/functional-check";

const router: IRouter = Router();

interface SystemCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  ms: number;
  detail: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value?: T; error?: unknown }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { ms: Date.now() - start, value };
  } catch (error) {
    return { ms: Date.now() - start, error };
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

router.get("/diagnostics", async (_req, res): Promise<void> => {
  const checks: SystemCheck[] = [];

  // 1. Server up (trivially pass — if the process is down, this HTTP call wouldn't return).
  checks.push({
    name: "Server",
    status: "pass",
    ms: 0,
    detail: `Node ${process.version} · NODE_ENV=${process.env["NODE_ENV"] ?? "dev"} · uptime=${Math.round(process.uptime())}s`,
  });

  // 2. Environment variables.
  {
    const required = ["DATABASE_URL", "VENICE_API_KEY"] as const;
    const optional = ["DEEPSEEK_API_KEY", "SESSION_SECRET", "PORT", "NODE_ENV"] as const;
    const missing = required.filter((k) => !process.env[k]);
    const presentOptional = optional.filter((k) => !!process.env[k]);
    checks.push({
      name: "Environment variables",
      status: missing.length ? "fail" : "pass",
      ms: 0,
      detail: missing.length
        ? `MISSING required: ${missing.join(", ")}`
        : `Required OK. Optional present: ${presentOptional.join(", ") || "none"}`,
    });
  }

  // 3. Database (Postgres) connectivity.
  {
    const r = await timed(async () => {
      const result = await db.execute(sql`SELECT 1 as ok`);
      return result.rows.length;
    });
    checks.push({
      name: "Database (Postgres)",
      status: r.error ? "fail" : "pass",
      ms: r.ms,
      detail: r.error ? errMsg(r.error) : `SELECT 1 round-trip OK (${r.ms}ms)`,
    });
  }

  // 4. Database schema (tables exist).
  {
    const r = await timed(async () => {
      const result = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      return result.rows.map((row) => (row as { table_name: string }).table_name);
    });
    const tables = (r.value as string[] | undefined) ?? [];
    checks.push({
      name: "Database schema",
      status: r.error ? "fail" : tables.length === 0 ? "fail" : "pass",
      ms: r.ms,
      detail: r.error
        ? errMsg(r.error)
        : tables.length === 0
          ? "No tables found. Run: pnpm --filter @workspace/db run push"
          : `${tables.length} table(s): ${tables.join(", ")}`,
    });
  }

  // 5. Venice API (cheap text round-trip — the cheapest call that proves the key is accepted).
  {
    const r = await timed(async () => {
      if (!process.env["VENICE_API_KEY"]) throw new Error("VENICE_API_KEY not set");
      const res = await fetch("https://api.venice.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env["VENICE_API_KEY"]}`,
        },
        body: JSON.stringify({
          model: "venice-uncensored",
          messages: [{ role: "user", content: "Say OK" }],
          max_tokens: 4,
          venice_parameters: { include_venice_system_prompt: false },
        }),
      });
      if (!res.ok) throw new Error(`Venice HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const out = body.choices?.[0]?.message?.content ?? "";
      return out.slice(0, 40);
    });
    checks.push({
      name: "Venice API (text)",
      status: r.error ? "fail" : "pass",
      ms: r.ms,
      detail: r.error ? errMsg(r.error) : `Round-trip OK · reply="${r.value}"`,
    });
  }

  // 6. DeepSeek API (optional — warn if no key, pass on success).
  {
    const r = await timed(async () => {
      if (!process.env["DEEPSEEK_API_KEY"]) return null;
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env["DEEPSEEK_API_KEY"]}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: "Say OK" }],
          max_tokens: 4,
        }),
      });
      if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return (body.choices?.[0]?.message?.content ?? "").slice(0, 40);
    });
    checks.push({
      name: "DeepSeek API (text)",
      status: r.error ? "fail" : r.value === null ? "warn" : "pass",
      ms: r.ms,
      detail: r.error
        ? errMsg(r.error)
        : r.value === null
          ? "DEEPSEEK_API_KEY not set — DeepSeek-backed Zhi models will fail"
          : `Round-trip OK · reply="${r.value}"`,
    });
  }

  // 7. Venice image API (presence-only — actual generation is expensive).
  {
    const r = await timed(async () => {
      if (!process.env["VENICE_API_KEY"]) throw new Error("VENICE_API_KEY not set");
      const res = await fetch("https://api.venice.ai/api/v1/models?type=image", {
        headers: { Authorization: `Bearer ${process.env["VENICE_API_KEY"]}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      const ids = (body.data ?? []).map((m) => m.id);
      return ids;
    });
    checks.push({
      name: "Venice image models",
      status: r.error ? "fail" : "pass",
      ms: r.ms,
      detail: r.error
        ? errMsg(r.error)
        : `${(r.value as string[]).length} image model(s) available to this key`,
    });
  }

  const overall: "pass" | "warn" | "fail" = checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
      ? "warn"
      : "pass";

  res.json({ overall, timestamp: new Date().toISOString(), checks });
});

router.post("/diagnostics/functional", async (req, res): Promise<void> => {
  // Use loopback so we exercise the real HTTP stack (middleware, validation, routes).
  const port = process.env["PORT"] ?? "5000";
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const result = await runFunctionalCheck(baseUrl);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Functional check crashed");
    res.status(500).json({
      overall: "fail",
      timestamp: new Date().toISOString(),
      steps: [
        {
          name: "Functional check harness",
          status: "fail",
          ms: 0,
          detail: errMsg(err),
        },
      ],
    });
  }
});

export default router;
