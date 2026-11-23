/** Estilos e montagem do pedido de retrato para o Gemini (sem acesso a banco; testável à parte). */

export const PORTRAIT_STYLES = {
  pintura: { label: "Pintura digital", prompt: "painterly digital fantasy illustration, rich brushwork, dramatic lighting, classic fantasy book illustration" },
  aquarela: { label: "Aquarela", prompt: "watercolor painting, soft washes, visible paper texture, delicate ink outlines" },
  realista: { label: "Realista", prompt: "realistic cinematic portrait, detailed face, fabrics and armor, shallow depth of field, soft key light" },
  anime: { label: "Anime", prompt: "anime / cel-shaded illustration, clean line art, vibrant colors" },
  esboco: { label: "Esboço a lápis", prompt: "graphite and ink pencil sketch on parchment, cross-hatching, monochrome sepia tones" },
} as const;
export type PortraitStyle = keyof typeof PORTRAIT_STYLES;
export const STYLE_IDS = Object.keys(PORTRAIT_STYLES) as [PortraitStyle, ...PortraitStyle[]];

/** Pedido em inglês (o modelo segue melhor), com a descrição do jogador citada como veio. */
/** Itens equipados citados no pedido, no máximo. */
export const MAX_GEAR = 8;

export function buildPrompt(opts: {
  name: string;
  level: number;
  species?: string;
  className?: string;
  style: PortraitStyle;
  description: string;
  withReference: boolean;
  /** Nomes dos itens equipados (armas, armadura, escudo...). */
  gear?: string[];
}) {
  const who = [opts.species, opts.className].filter(Boolean).join(" ") || "adventurer";
  const lines = [
    "Create a full-length character illustration for a fantasy tabletop role-playing game.",
    "Framing: the whole figure from head to feet, standing in a confident heroic pose, three-quarter view, centered with some space around it, with a simple atmospheric background that matches the character. Show the complete outfit clearly: weapons, armor, shield, clothing and adventuring gear.",
    `Art style: ${PORTRAIT_STYLES[opts.style].prompt}.`,
    `Character: ${opts.name || "an unnamed hero"}, a level ${opts.level} ${who}.`,
  ];
  const gear = (opts.gear ?? []).map((g) => g.trim()).filter(Boolean).slice(0, MAX_GEAR);
  if (gear.length) lines.push(`Equipment the character is carrying or wearing (may be in Portuguese): ${gear.join(", ")}.`);
  if (opts.description) lines.push(`Appearance and details described by the player (may be in Portuguese): """${opts.description}"""`);
  if (opts.withReference) {
    lines.push(
      "The attached image is a simple vector avatar of this same character. Use it only as a reference for appearance: skin tone, hair color and style, eye color, horns, ears, facial hair, marks, clothing, armor and their colors. When the player's description disagrees with it, follow the description. Reinterpret it as a high-quality illustration in the requested art style; do not copy its flat vector look.",
    );
  }
  lines.push("Do not include any text, letters, logos, watermarks, borders or frames. Keep it suitable for all ages.");
  return lines.join("\n");
}
