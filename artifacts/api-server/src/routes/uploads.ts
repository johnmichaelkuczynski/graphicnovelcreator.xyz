import { Router, type IRouter } from "express";
import multer from "multer";
import mammoth from "mammoth";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post("/uploads/extract", upload.single("file"), async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  const name = file.originalname.toLowerCase();
  const buf = file.buffer;
  // Magic-byte sniffing — do not trust client-supplied extension or mimetype alone.
  const isPdf = buf.length >= 4 && buf.slice(0, 4).toString("ascii") === "%PDF";
  const isZip = buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b; // docx is a zip
  // Plain text heuristic: no NUL bytes in the first 4KB.
  const head = buf.slice(0, 4096);
  const isTextLike = !head.includes(0x00);

  try {
    let text = "";
    if (name.endsWith(".pdf") && isPdf) {
      const mod = (await import("pdf-parse")) as unknown as {
        default: (data: Buffer) => Promise<{ text: string }>;
      };
      const parsed = await mod.default(buf);
      text = parsed.text;
    } else if (name.endsWith(".docx") && isZip) {
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value;
    } else if (name.endsWith(".txt") && isTextLike) {
      text = buf.toString("utf8");
    } else {
      res.status(400).json({
        error: `Unsupported or unrecognized file. Please upload a .txt, .pdf, or .docx file.`,
      });
      return;
    }
    res.json({ text, filename: file.originalname, characters: text.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err: msg }, "File extraction failed");
    res.status(400).json({ error: `Could not extract text: ${msg}` });
  }
});

export default router;
