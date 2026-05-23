export interface ArtStyle {
  id: string;
  label: string;
  prompt: string;
}

export const ART_STYLES: ArtStyle[] = [
  {
    id: "minimal-schematic",
    label: "Minimal Schematic (Token-Lite)",
    prompt: "Ultra-minimal black-and-white line drawing on pure white background. Single-weight thin black ink stroke, no shading, no crosshatching, no gradients, no fill, no color, no texture. Sparse schematic composition — only the essential 2 or 3 shapes needed to read the scene, lots of empty white negative space. Flat orthographic geometry with a faint diagrammatic feel (think technical illustration crossed with a Keith Haring outline). Strictly two tones: white paper and pure black ink. No grayscale.",
  },
  {
    id: "stick-figure",
    label: "Stick Figure (Token-Lite)",
    prompt: "Stick-figure cartoon on pure white background. Black single-stroke lines only — circles for heads, simple lines for limbs, dot eyes, curve mouths. xkcd / Randall Munroe style. No shading, no color, no fill, no background detail. Tons of empty white space. Two tones only: white and black.",
  },
  {
    id: "single-line",
    label: "One-Line Contour (Token-Lite)",
    prompt: "Single continuous black contour line drawing on pure white background, in the style of Picasso's one-line sketches or Matisse line work. One unbroken stroke describing the entire subject. No shading, no fill, no color, no texture, no background. Just one elegant black line on white paper. Two tones only.",
  },
  {
    id: "silhouette",
    label: "Pure Silhouette (Token-Lite)",
    prompt: "Solid black silhouette on a pure white background. Subject reduced to its outline filled with flat black — no internal detail, no features, no shading, no gradient, no color. Strong recognisable shape, lots of empty white negative space. Two tones only: white and black.",
  },
  {
    id: "icon-glyph",
    label: "Icon / Pictogram (Token-Lite)",
    prompt: "Single-color pictogram in the style of an airport wayfinding sign or Noun Project icon. Flat solid black shape on pure white background, perfectly centred, no outline, no detail, no shading, no gradient. Universally readable silhouette glyph. Two tones only.",
  },
  {
    id: "blueprint",
    label: "Blueprint Diagram (Token-Lite)",
    prompt: "Architectural blueprint diagram. Flat blue background (#1a3a6e), thin white single-weight lines only, no shading, no fill, no gradients, sparse technical-drawing composition with lots of empty blue space. Faint dashed callout lines allowed. Two tones only: blueprint blue and white ink.",
  },
  {
    id: "chalkboard",
    label: "Chalkboard Sketch (Token-Lite)",
    prompt: "White chalk drawing on a flat dark-green chalkboard background (#2a4a3a). Thin single-weight chalk lines only, slightly uneven, no fill, no color, no shading. Sparse blackboard-doodle composition with lots of empty board space. Two tones only: chalkboard green and white chalk.",
  },
  {
    id: "ascii-flat",
    label: "Flat Color Block (Token-Lite)",
    prompt: "Extremely flat geometric illustration on pure white background. 3–4 large flat color blocks maximum (no gradients, no shading, no outlines, no texture), heavily simplified shapes, generous empty white space. Limited palette of two muted colors plus white. Reads as a children's-puzzle pictogram or minimal infographic.",
  },
  {
    id: "halftone-dot",
    label: "Mono Halftone (Token-Lite)",
    prompt: "Single-color halftone dot illustration on pure white background. Black ink dots of varying density form the entire image — no continuous tones, no outlines, no color, no gradients. Sparse composition with large empty white areas. Newsprint / risograph feel. Two tones only: white and black dots.",
  },
  {
    id: "thermal-receipt",
    label: "Receipt Print (Token-Lite)",
    prompt: "Low-resolution thermal receipt print look. Pure white background, jagged 1-bit black pixels only — no anti-aliasing, no grayscale, no color, no shading. Sparse blocky composition resembling something printed by a cheap thermal printer or a 1980s dot-matrix. Two tones only: white and black pixels.",
  },
  {
    id: "noir-ink",
    label: "Noir Ink",
    prompt: "High-contrast black-and-white ink, heavy shadows, hard chiaroscuro, Frank Miller / Sin City influence, rough brushwork, cinematic.",
  },
  {
    id: "classic-comic",
    label: "Classic Comic Book",
    prompt: "Classic American comic book illustration, bold black ink outlines, flat saturated colors, Ben-Day dot shading, dynamic poses, 1960s-1980s superhero feel.",
  },
  {
    id: "manga",
    label: "Black & White Manga",
    prompt: "Japanese manga, crisp black ink linework, screentone shading, expressive faces, dynamic speed lines, no color, Otomo / Urasawa influence.",
  },
  {
    id: "anime-color",
    label: "Modern Anime (Color)",
    prompt: "Modern anime illustration, clean cel-shaded coloring, soft gradient backgrounds, expressive eyes, vivid palette, Studio Ghibli / Makoto Shinkai influence.",
  },
  {
    id: "european-bd",
    label: "European Bande Dessinée",
    prompt: "Ligne claire European bande dessinée, clean uniform line weight, flat muted colors, detailed architectural backgrounds, Hergé / Moebius influence.",
  },
  {
    id: "watercolor",
    label: "Watercolor & Ink",
    prompt: "Watercolor painting over loose ink linework, soft pigment bleeds, paper texture, muted natural palette, illustrative storybook feel.",
  },
  {
    id: "graphic-novel",
    label: "Indie Graphic Novel",
    prompt: "Hand-drawn indie graphic novel illustration, slightly scratchy linework, limited muted palette, painterly textures, Chris Ware / Daniel Clowes / Adrian Tomine influence.",
  },
  {
    id: "woodcut",
    label: "Woodcut / Linocut",
    prompt: "Black-and-white woodcut print, heavy carved lines, strong negative space, rough hand-printed texture, expressionist, Lynd Ward influence.",
  },
  {
    id: "watercolor-children",
    label: "Children's Book",
    prompt: "Soft children's book illustration, warm watercolor washes, gentle round shapes, cozy palette, friendly characters, picture-book composition.",
  },
  {
    id: "pixel",
    label: "Pixel Art",
    prompt: "16-bit pixel art illustration, limited retro palette, clean dithering, JRPG cutscene composition, crisp pixels, no anti-aliasing.",
  },
  {
    id: "cyberpunk",
    label: "Neon Cyberpunk",
    prompt: "Cyberpunk illustration, neon magenta and cyan lighting, rain-slick streets, holographic signage, high contrast, cinematic, Blade Runner / Akira influence.",
  },
  {
    id: "oil-painting",
    label: "Oil Painting",
    prompt: "Classical oil painting, rich impasto brushwork, dramatic Rembrandt lighting, deep earth-tone palette, museum gallery quality.",
  },
  {
    id: "charcoal",
    label: "Charcoal Sketch",
    prompt: "Charcoal sketch on textured paper, smudged shading, expressive gestural lines, monochromatic greyscale, raw and atmospheric.",
  },
  {
    id: "ukiyo-e",
    label: "Ukiyo-e Woodblock",
    prompt: "Japanese ukiyo-e woodblock print, flat areas of color, bold black outlines, decorative patterning, Hokusai / Hiroshige influence.",
  },
  {
    id: "art-deco",
    label: "Art Deco",
    prompt: "Art Deco poster illustration, geometric symmetry, bold metallic accents, stylized elongated figures, 1920s glamour, limited elegant palette.",
  },
  {
    id: "horror-ink",
    label: "Horror Ink",
    prompt: "Gothic horror illustration, heavy black ink, jagged crosshatching, unsettling shadows, Bernie Wrightson / Junji Ito influence, dread-soaked atmosphere.",
  },
  {
    id: "3d-render",
    label: "Stylized 3D Render",
    prompt: "Stylized 3D rendered illustration, soft global illumination, Pixar-quality character modeling, painterly textures, cinematic depth of field.",
  },
  {
    id: "low-poly",
    label: "Low Poly",
    prompt: "Low-poly geometric illustration, faceted flat-shaded surfaces, limited bold palette, clean minimalist composition.",
  },
  {
    id: "vector-flat",
    label: "Flat Vector",
    prompt: "Modern flat vector illustration, clean geometric shapes, no outlines, soft pastel palette, editorial / New Yorker feel.",
  },
  {
    id: "photoreal",
    label: "Photorealistic Cinematic",
    prompt: "Photorealistic cinematic still, 35mm film grain, naturalistic lighting, shallow depth of field, color-graded like a prestige feature film.",
  },
];
