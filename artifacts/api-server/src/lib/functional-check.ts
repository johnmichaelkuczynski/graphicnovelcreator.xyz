// End-to-end "walk" against the running API over loopback. Exercises the real HTTP stack
// (JSON parsing, validation, routes, DB writes) so regressions in any layer surface here.
// Costs a single text round-trip (panel-plan call) via Venice for the smallest
// possible novel (1 panel) — image generation is fired but we don't wait on it.
//
// Adapted from the PHIL-101 blueprint to this app's domain (graphic novels, no auth).

import { db, novelsTable, panelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface FunctionalStep {
  name: string;
  status: "pass" | "fail";
  ms: number;
  detail: string;
}

export interface FunctionalCheckResult {
  overall: "pass" | "fail";
  timestamp: string;
  steps: FunctionalStep[];
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

export async function runFunctionalCheck(baseUrl: string): Promise<FunctionalCheckResult> {
  const steps: FunctionalStep[] = [];
  let createdNovelId: number | null = null;

  try {
    // ── 1. List novels (sanity GET) ─────────────────────────────────────────
    {
      const r = await timed(async () => {
        const res = await fetch(`${baseUrl}/api/novels`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as unknown;
        if (!Array.isArray(body)) throw new Error("Response was not an array");
        return body.length;
      });
      steps.push({
        name: "List novels",
        status: r.error ? "fail" : "pass",
        ms: r.ms,
        detail: r.error ? errMsg(r.error) : `GET /novels returned ${r.value} novel(s)`,
      });
      if (r.error) return finalize(steps);
    }

    // ── 2. List models ──────────────────────────────────────────────────────
    {
      const r = await timed(async () => {
        const res = await fetch(`${baseUrl}/api/models`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as unknown;
        if (!Array.isArray(body) || body.length === 0) throw new Error("No models returned");
        return body.length;
      });
      steps.push({
        name: "List models",
        status: r.error ? "fail" : "pass",
        ms: r.ms,
        detail: r.error ? errMsg(r.error) : `GET /models returned ${r.value} model(s)`,
      });
      if (r.error) return finalize(steps);
    }

    // ── 3. Reject invalid payload (validation contract) ─────────────────────
    {
      const r = await timed(async () => {
        const res = await fetch(`${baseUrl}/api/novels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Missing required fields — must be 400.
          body: JSON.stringify({ title: "bad" }),
        });
        if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
        return res.status;
      });
      steps.push({
        name: "Reject invalid create payload",
        status: r.error ? "fail" : "pass",
        ms: r.ms,
        detail: r.error ? errMsg(r.error) : "Validation correctly rejected malformed body with 400",
      });
      if (r.error) return finalize(steps);
    }

    // ── 4. Create a real 1-panel diagnostic novel ───────────────────────────
    {
      const r = await timed(async () => {
        const res = await fetch(`${baseUrl}/api/novels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `__diagnostic_${Date.now()}`,
            sourceText: "A diagnostic panel: a single still life of an apple on a wooden table.",
            specifications: "",
            panelCount: 1,
            textModel: "zhi4",
            explicit: false,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const body = (await res.json()) as { id?: number };
        if (typeof body.id !== "number") throw new Error("Response missing id");
        return body.id;
      });
      if (typeof r.value === "number") createdNovelId = r.value;
      steps.push({
        name: "Create novel (POST /novels)",
        status: r.error ? "fail" : "pass",
        ms: r.ms,
        detail: r.error ? errMsg(r.error) : `Created novel id=${r.value}, generation kicked off in background`,
      });
      if (r.error) return finalize(steps);
    }

    // ── 5. Fetch the novel we just created ──────────────────────────────────
    {
      const r = await timed(async () => {
        if (createdNovelId == null) throw new Error("No novel id from prior step");
        const res = await fetch(`${baseUrl}/api/novels/${createdNovelId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { id?: number; status?: string };
        if (body.id !== createdNovelId) throw new Error(`id mismatch (got ${body.id})`);
        return body.status ?? "unknown";
      });
      steps.push({
        name: "Fetch novel by id",
        status: r.error ? "fail" : "pass",
        ms: r.ms,
        detail: r.error ? errMsg(r.error) : `GET /novels/${createdNovelId} returned status="${r.value}"`,
      });
      if (r.error) return finalize(steps);
    }

    // ── 6. Regenerate endpoint (must reset cleanly) ─────────────────────────
    {
      const r = await timed(async () => {
        if (createdNovelId == null) throw new Error("No novel id");
        const res = await fetch(`${baseUrl}/api/novels/${createdNovelId}/regenerate`, {
          method: "POST",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const body = (await res.json()) as { id?: number };
        if (body.id !== createdNovelId) throw new Error("regenerate returned wrong id");
        return true;
      });
      steps.push({
        name: "Regenerate novel",
        status: r.error ? "fail" : "pass",
        ms: r.ms,
        detail: r.error ? errMsg(r.error) : `POST /novels/${createdNovelId}/regenerate reset the novel`,
      });
      if (r.error) return finalize(steps);
    }

    // ── 7. Delete cleanup (also tested by the contract — DELETE /novels/:id) ─
    {
      const r = await timed(async () => {
        if (createdNovelId == null) throw new Error("No novel id");
        const res = await fetch(`${baseUrl}/api/novels/${createdNovelId}`, { method: "DELETE" });
        if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`);
        return res.status;
      });
      steps.push({
        name: "Delete novel",
        status: r.error ? "fail" : "pass",
        ms: r.ms,
        detail: r.error ? errMsg(r.error) : `DELETE /novels/${createdNovelId} returned ${r.value}`,
      });
      // Mark cleanup as done so the finally block doesn't double-delete.
      if (!r.error) createdNovelId = null;
    }

    return finalize(steps);
  } finally {
    // Belt-and-suspenders: if the walk threw mid-flight, scrub the synthetic novel
    // directly from the DB so we never leave diagnostic noise in the library.
    if (createdNovelId != null) {
      try {
        await db.delete(panelsTable).where(eq(panelsTable.novelId, createdNovelId));
        await db.delete(novelsTable).where(eq(novelsTable.id, createdNovelId));
        logger.info({ createdNovelId }, "Functional check tore down orphan novel");
      } catch (err) {
        logger.warn({ err, createdNovelId }, "Functional check teardown failed");
      }
    }
  }
}

function finalize(steps: FunctionalStep[]): FunctionalCheckResult {
  return {
    overall: steps.every((s) => s.status === "pass") ? "pass" : "fail",
    timestamp: new Date().toISOString(),
    steps,
  };
}
