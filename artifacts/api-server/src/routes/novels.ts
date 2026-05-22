import { Router, type IRouter } from "express";
import { eq, desc, asc, and } from "drizzle-orm";
import { db, novelsTable, panelsTable } from "@workspace/db";
import {
  CreateNovelBody,
  GetNovelParams,
  GetNovelResponse,
  DeleteNovelParams,
  ListNovelsResponse,
  RegenerateNovelParams,
} from "@workspace/api-zod";
import { startNovelGeneration, repairNovel, NovelBusyError } from "../lib/novel-pipeline";
import { inArray } from "drizzle-orm";
import { MODELS, type ZhiId } from "../lib/ai";

const router: IRouter = Router();

const VALID_MODELS: Set<string> = new Set(MODELS.map((m) => m.id));

router.get("/novels", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(novelsTable)
    .orderBy(desc(novelsTable.createdAt))
    .limit(100);

  const ids = rows.map((r) => r.id);
  const panelRows = ids.length
    ? await db.select().from(panelsTable).where(eq(panelsTable.novelId, ids[0]!))
    : [];

  // For each novel compute completed panel count + cover.
  const summaries = await Promise.all(
    rows.map(async (n) => {
      const panels = await db
        .select()
        .from(panelsTable)
        .where(eq(panelsTable.novelId, n.id))
        .orderBy(asc(panelsTable.idx));
      const done = panels.filter((p) => p.status === "done");
      return {
        id: n.id,
        title: n.title,
        status: n.status,
        panelCount: n.panelCount,
        completedPanels: done.length,
        createdAt: n.createdAt.toISOString(),
        coverImage: done[0]?.imageDataUrl ?? null,
        textModel: n.textModel,
        artStyle: n.artStyle ?? null,
      };
    }),
  );
  void panelRows;
  res.json(ListNovelsResponse.parse(summaries));
});

router.post("/novels", async (req, res): Promise<void> => {
  const parsed = CreateNovelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!VALID_MODELS.has(parsed.data.textModel)) {
    res.status(400).json({ error: `Unknown model: ${parsed.data.textModel}` });
    return;
  }

  const [novel] = await db
    .insert(novelsTable)
    .values({
      title: parsed.data.title?.trim() || "Untitled novel",
      sourceText: parsed.data.sourceText,
      specifications: parsed.data.specifications ?? "",
      artStyle: parsed.data.artStyle ?? null,
      panelCount: parsed.data.panelCount,
      textModel: parsed.data.textModel as ZhiId,
      explicit: parsed.data.explicit ?? false,
      referenceImages: parsed.data.referenceImages ?? [],
      status: "pending",
    })
    .returning();

  if (!novel) {
    res.status(500).json({ error: "Failed to create novel" });
    return;
  }

  startNovelGeneration(novel.id);

  res.status(201).json(
    GetNovelResponse.parse({
      id: novel.id,
      title: novel.title,
      sourceText: novel.sourceText,
      specifications: novel.specifications,
      panelCount: novel.panelCount,
      textModel: novel.textModel,
      artStyle: novel.artStyle ?? null,
      explicit: novel.explicit,
      status: novel.status,
      error: novel.error ?? null,
      createdAt: novel.createdAt.toISOString(),
      panels: [],
    }),
  );
});

router.get("/novels/:id", async (req, res): Promise<void> => {
  const params = GetNovelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [novel] = await db.select().from(novelsTable).where(eq(novelsTable.id, params.data.id));
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const panels = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.novelId, novel.id))
    .orderBy(asc(panelsTable.idx));

  res.json(
    GetNovelResponse.parse({
      id: novel.id,
      title: novel.title,
      sourceText: novel.sourceText,
      specifications: novel.specifications,
      panelCount: novel.panelCount,
      textModel: novel.textModel,
      artStyle: novel.artStyle ?? null,
      explicit: novel.explicit,
      status: novel.status,
      error: novel.error ?? null,
      createdAt: novel.createdAt.toISOString(),
      panels: panels.map((p) => ({
        id: p.id,
        idx: p.idx,
        caption: p.caption,
        imagePrompt: p.imagePrompt,
        imageDataUrl: p.imageDataUrl,
        status: p.status,
        error: p.error,
      })),
    }),
  );
});

router.post("/novels/:id/regenerate", async (req, res): Promise<void> => {
  const params = RegenerateNovelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [novel] = await db.select().from(novelsTable).where(eq(novelsTable.id, params.data.id));
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }

  // Wipe existing panels and reset novel status so the pipeline starts fresh against the
  // same inputs (sourceText, specifications, artStyle, panelCount, model, referenceImages).
  await db.delete(panelsTable).where(eq(panelsTable.novelId, novel.id));
  const [updated] = await db
    .update(novelsTable)
    .set({ status: "pending", error: null })
    .where(eq(novelsTable.id, novel.id))
    .returning();

  if (!updated) {
    res.status(500).json({ error: "Failed to reset novel" });
    return;
  }

  startNovelGeneration(updated.id);

  res.json(
    GetNovelResponse.parse({
      id: updated.id,
      title: updated.title,
      sourceText: updated.sourceText,
      specifications: updated.specifications,
      panelCount: updated.panelCount,
      textModel: updated.textModel,
      artStyle: updated.artStyle ?? null,
      explicit: updated.explicit,
      status: updated.status,
      error: updated.error ?? null,
      createdAt: updated.createdAt.toISOString(),
      panels: [],
    }),
  );
});

// Abort an in-progress novel. Flips status to "aborted" — the pipeline loop
// checks this between panels and bails out cleanly. Also marks any
// pending/generating panels failed so the UI stops showing them as in-flight.
router.post("/novels/:id/abort", async (req, res): Promise<void> => {
  const params = GetNovelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [novel] = await db.select().from(novelsTable).where(eq(novelsTable.id, params.data.id));
  if (!novel) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  const [updated] = await db
    .update(novelsTable)
    .set({ status: "aborted", error: "Aborted by user" })
    .where(eq(novelsTable.id, novel.id))
    .returning();
  // Only flip pending/generating panels — leave already-done ones alone.
  await db
    .update(panelsTable)
    .set({ status: "failed", error: "Aborted by user" })
    .where(
      and(
        eq(panelsTable.novelId, novel.id),
        inArray(panelsTable.status, ["pending", "generating"]),
      ),
    );

  const panels = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.novelId, novel.id))
    .orderBy(asc(panelsTable.idx));

  res.json(
    GetNovelResponse.parse({
      id: updated!.id,
      title: updated!.title,
      sourceText: updated!.sourceText,
      specifications: updated!.specifications,
      panelCount: updated!.panelCount,
      textModel: updated!.textModel,
      artStyle: updated!.artStyle ?? null,
      explicit: updated!.explicit,
      status: updated!.status,
      error: updated!.error ?? null,
      createdAt: updated!.createdAt.toISOString(),
      panels: panels.map((p) => ({
        id: p.id,
        idx: p.idx,
        caption: p.caption,
        imagePrompt: p.imagePrompt,
        imageDataUrl: p.imageDataUrl,
        status: p.status,
        error: p.error,
      })),
    }),
  );
});

// Surgical quality-control repair endpoint. Scans every panel for the
// "blank panel" failure mode (solid black/white/single-color image) plus any
// panel already marked as failed, and re-rolls those — and only those —
// against the same prompt scaffolding the initial generation used. An
// optional `instructions` string is appended to the per-panel prompt as an
// override directive, enabling commands like "get rid of the blank panels"
// or "make the protagonist older" without re-planning the whole novel.
router.post("/novels/:id/repair", async (req, res): Promise<void> => {
  const params = GetNovelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const instructions =
    typeof req.body?.instructions === "string" ? req.body.instructions.slice(0, 2000) : undefined;
  try {
    const result = await repairNovel(params.data.id, instructions);
    res.json(result);
  } catch (err) {
    if (err instanceof NovelBusyError) {
      // 409 Conflict — caller should wait for the in-flight generation to finish.
      res.status(409).json({ error: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "Novel not found") {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

router.delete("/novels/:id", async (req, res): Promise<void> => {
  const params = DeleteNovelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(novelsTable)
    .where(eq(novelsTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Novel not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
