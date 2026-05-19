export interface ArtStyle {
  id: string;
  label: string;
  prompt: string;
}

export const ART_STYLES: ArtStyle[] = [
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
