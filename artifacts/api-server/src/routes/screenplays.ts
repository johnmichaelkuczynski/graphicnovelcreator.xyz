import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, screenplaysTable } from "@workspace/db";
import {
  CreateScreenplayBody,
  GetScreenplayParams,
  GetScreenplayResponse,
  DeleteScreenplayParams,
  ListScreenplaysResponse,
} from "@workspace/api-zod";
import { generateText, MODELS, type ZhiId } from "../lib/ai";

const router: IRouter = Router();
const VALID_MODELS: Set<string> = new Set(MODELS.map((m) => m.id));

router.get("/screenplays", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: screenplaysTable.id,
      title: screenplaysTable.title,
      textModel: screenplaysTable.textModel,
      createdAt: screenplaysTable.createdAt,
    })
    .from(screenplaysTable)
    .orderBy(desc(screenplaysTable.createdAt))
    .limit(100);
  res.json(
    ListScreenplaysResponse.parse(
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    ),
  );
});

router.post("/screenplays", async (req, res): Promise<void> => {
  const parsed = CreateScreenplayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!VALID_MODELS.has(parsed.data.textModel)) {
    res.status(400).json({ error: `Unknown model: ${parsed.data.textModel}` });
    return;
  }

  const system = `You are a graphic novel screenwriter. Convert the given source material into a panel-by-panel graphic novel screenplay in industry format.

Conventions:
- Format each panel as: "PANEL N." on its own line, followed by an "IMAGE:" block describing what is drawn, and a "CAPTION:" block with the narration that appears ABOVE the panel.
- There are NO speech bubbles. All character voice should be expressed as narration captions placed above the panel.
- The screenplay should faithfully serve the author's intent and the requested treatment.
- Author treatment notes: ${parsed.data.specifications ?? "(none provided)"}.
- Aim for a complete, well-paced screenplay. Do not truncate.`;

  const content = await generateText({
    model: parsed.data.textModel as ZhiId,
    explicit: parsed.data.explicit ?? false,
    system,
    user: `SOURCE TEXT:\n${parsed.data.sourceText}`,
  });

  const [row] = await db
    .insert(screenplaysTable)
    .values({
      title: parsed.data.title?.trim() || "Untitled screenplay",
      sourceText: parsed.data.sourceText,
      specifications: parsed.data.specifications ?? "",
      textModel: parsed.data.textModel as ZhiId,
      explicit: parsed.data.explicit ?? false,
      content,
    })
    .returning();

  if (!row) {
    res.status(500).json({ error: "Failed to save screenplay" });
    return;
  }
  res.status(201).json(
    GetScreenplayResponse.parse({
      id: row.id,
      title: row.title,
      sourceText: row.sourceText,
      specifications: row.specifications,
      textModel: row.textModel,
      explicit: row.explicit,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }),
  );
});

router.get("/screenplays/:id", async (req, res): Promise<void> => {
  const params = GetScreenplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(screenplaysTable)
    .where(eq(screenplaysTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Screenplay not found" });
    return;
  }
  res.json(
    GetScreenplayResponse.parse({
      id: row.id,
      title: row.title,
      sourceText: row.sourceText,
      specifications: row.specifications,
      textModel: row.textModel,
      explicit: row.explicit,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    }),
  );
});

router.delete("/screenplays/:id", async (req, res): Promise<void> => {
  const params = DeleteScreenplayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(screenplaysTable)
    .where(eq(screenplaysTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Screenplay not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
