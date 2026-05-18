# 📖 GRAPHIC NOVEL GENERATOR

**Multi-Model AI Platform for Turning Essays, Stories, and Images into Fully Illustrated Graphic Novels**

---

## 🧩 Overview

The Graphic Novel Generator is a multi-model AI system for transforming any written work — essays, philosophy papers, short stories, screenplays in waiting — into a fully illustrated graphic novel. It plugs into four top-tier proprietary LLMs (Zhi 1–4) and lets users route any task to the model best suited for it -- narrative planning, screenplay formatting, expository captioning, or uncensored adult fiction.

Unlike consumer art generators that produce generic, hedged, sanitized output, the Graphic Novel Generator is built around a strict operating principle: every panel is faithful to the source text, every caption sits above the image (never inside it), and the author's specifications are sacred. If you ask for 50 panels in a noir style with three named characters, that is exactly what is produced. No padding, no preamble, no editorializing.

---

## 👥 Who It's For

- **Essayists and long-form writers** -- need to see their arguments rendered as visual sequences, panel by panel, to test how well the prose translates to image
- **Novelists and short-story authors** -- need to prototype a graphic adaptation of an existing manuscript without commissioning an artist
- **Screenwriters and comics writers** -- need a one-click essay-to-screenplay converter that outputs industry-standard panel format
- **Philosophers and theorists** -- need conceptual material rendered as illustrated allegory for teaching, lecture decks, or publication
- **Adult fiction authors** -- need uncensored text and image generation for explicit material that mainstream models refuse
- **Anyone** -- who wants to see what their writing actually looks like when an intelligent reader visualizes every scene

---

## ⚙️ Core Capabilities

- **Multi-Mode Generation** -- Three first-class creative modes: Essay → Graphic Novel (text in, illustrated panels out), Essay → Screenplay (text in, industry-format comic script out), and Image → Graphic Novel (a seed image plus a prompt becomes the basis for the full work).

- **Four-Model Routing** -- ZHI 1 through ZHI 4. Pick the model best suited for each task: ZHI 1 for fast structural planning, ZHI 2 for nuanced narrative voice, ZHI 3 for crisp expository captioning, ZHI 4 for fully uncensored adult fiction and explicit imagery. The explicit toggle automatically routes any text request through ZHI 4 regardless of the selected model.

- **Panel-by-Panel Storyboarding** -- The selected text model first plans the entire novel as a structured JSON storyboard: every panel gets a narration caption and a self-contained visual prompt. Recurring characters are tracked across panels for visual continuity.

- **Captions Above, Always** -- All character voice and narration appears as caption boxes positioned above the panel image. Speech bubbles, thought balloons, and in-image text are explicitly prohibited at the prompt level. The result reads as illustrated literature, not a webcomic.

- **Reference Character Uploads** -- Upload one or more reference images and label them ("the man", "Sarah", "the wolf"). Labels are injected into every relevant image prompt so recurring characters stay visually consistent panel to panel.

- **Free-Form Specifications** -- A dedicated specifications field accepts open-ended direction: tone, art style, character roster, treatment notes, framing devices. The author's instructions are passed verbatim into the storyboard system prompt.

- **Document Workflow** -- Drag-and-drop upload for `.txt`, `.pdf`, and `.docx` source material. Files are validated by magic-byte signature, not just extension. Extracted text is dropped straight into the source field.

- **Live Panel Streaming** -- The novel detail page polls every two seconds while generation is in flight. Panels appear in order as each image finishes rendering, with a progress bar reflecting the completion ratio.

- **Adult Content Pipeline** -- A single toggle routes text generation through the uncensored ZHI 4 path; image generation runs on a model configured to render explicit material without refusal.

- **Screenplay Mode** -- Converts source text into a complete panel-by-panel comic screenplay in standard industry format (PANEL N → IMAGE: → CAPTION:), with no speech-bubble dialogue, ready for an artist to draw from.

- **One-Click Export** -- Every novel can be downloaded as a print-ready PDF (browser print pipeline with a custom print stylesheet) and every screenplay as a `.txt` manuscript. Full ownership of every artifact you generate.

- **Per-Panel Resilience** -- If an individual image fails to render, that panel is flagged with its error and the rest of the novel continues. Final novel status reports `done` only when every panel succeeds; otherwise the novel is marked `failed` with a descriptive error so the author knows to regenerate.

---

## 🚀 What Makes It Different

- **It actually follows instructions** -- The system's job is to do exactly what you said. If you ask for 50 panels in a noir style with three named characters, you get 50 panels, noir, three characters -- not 12 panels in a generic style.

- **Captions, never bubbles** -- A hard architectural commitment: narration sits above the panel, the image stays pure. The output reads as illustrated literature, not as a webcomic with text crammed inside the frame.

- **Four proprietary LLMs, one workflow** -- ZHI 1 through ZHI 4. Pick the model best suited for each task, or flip the explicit toggle and override the routing automatically. No model swapping, no separate accounts, no separate API keys to manage in the UI.

- **Uncensored when you need it** -- The explicit toggle is a first-class feature, not an apology. Adult fiction authors get the same panel-by-panel storyboarding, the same caption discipline, the same export pipeline as everyone else.

- **Reference-image character continuity** -- Upload a face, label it, and the system carries that character through every panel prompt that includes them. No hand-tuning per panel.

- **Three creative modes, one studio** -- Essay → Graphic Novel, Essay → Screenplay, and Image → Graphic Novel share the same backbone, the same model selector, the same export tools. Pick the artifact you want; the studio handles the rest.

- **One-click full export** -- After generation, every novel is downloadable as a single print-ready PDF and every screenplay as a single `.txt` file. Nothing is locked behind a paywall, a watermark, or a "view in our viewer" page.

- **Partial-failure transparency** -- A novel where one panel fails is reported as `failed` with the reason, not silently passed off as `done`. You always know whether the artifact you are downloading is the artifact you asked for.
