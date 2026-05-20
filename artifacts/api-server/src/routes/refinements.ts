import { Router, type IRouter } from "express";
import { CreateRefinementBody } from "@workspace/api-zod";
import { refineReferenceImage } from "../lib/refinement";

const router: IRouter = Router();

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_DATA_URL = 12 * 1024 * 1024; // ~12MB base64 = ~9MB binary
const MAX_TEXT = 4000;
const MAX_HISTORY = 10;

router.post("/refinements", async (req, res): Promise<void> => {
  const parsed = CreateRefinementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { dataUrl, label, instructions, explicit, history } = parsed.data;

  if (!DATA_URL_RE.test(dataUrl) || dataUrl.length > MAX_DATA_URL) {
    res.status(400).json({ error: "Invalid reference image (must be a base64 image data URL, ≤12MB)" });
    return;
  }
  if (label.length > 200 || instructions.length > MAX_TEXT) {
    res.status(400).json({ error: "Label or instructions exceed maximum length" });
    return;
  }
  const trimmedHistory = (history ?? []).slice(-MAX_HISTORY).map((h) => ({
    instructions: (h.instructions ?? "").slice(0, MAX_TEXT),
    description: h.description ? h.description.slice(0, MAX_TEXT) : undefined,
    feedback: h.feedback ? h.feedback.slice(0, MAX_TEXT) : undefined,
  }));

  try {
    const result = await refineReferenceImage({
      dataUrl,
      label,
      instructions,
      explicit: !!explicit,
      history: trimmedHistory,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err: msg }, "Refinement failed");
    res.status(500).json({ error: "Refinement failed. Please try again." });
  }
});

export default router;
