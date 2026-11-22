/** Utilitários de cor em hexadecimal (#rrggbb). */

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Cor inválida: ${hex}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const toHex = ([r, g, b]: [number, number, number]) => "#" + [r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("");

/** Mistura `a` com `b` na proporção `t` (0 = só a, 1 = só b). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  return toHex([r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t]);
}

/** Cor do contorno das ilustrações (tinta escura quente). */
export const LINE_COLOR = "#2b1d16";

/** Variações derivadas usadas pelos marcadores #{regiao-variacao}. */
export function shade(base: string, variant?: string): string {
  switch (variant) {
    case "light":
      return mix(base, "#ffffff", 0.28);
    case "dark":
      return mix(base, "#000000", 0.22);
    case "deep":
      return mix(base, "#000000", 0.45);
    case "blush":
      return mix(base, "#d0505a", 0.4);
    default:
      return base;
  }
}
