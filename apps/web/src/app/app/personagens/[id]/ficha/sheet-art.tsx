/**
 * Arte vetorial da ficha em pergaminho: papel com borda rasgada, cantos ornamentados,
 * coluna de runas, moldura gótica do retrato e o círculo arcano do equipamento.
 * Tudo desenhado aqui (sem imagens externas), então imprime e escala sem perder nitidez.
 */

/** Papel: fundo com manchas, fibras e borda rasgada/queimada. Fica atrás de toda a página. */
export function Parchment() {
  return (
    <svg className="ficha-parchment" aria-hidden preserveAspectRatio="none" viewBox="0 0 210 297">
      <defs>
        <filter id="ficha-torn" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="ficha-fiber" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.6 0.9" numOctaves="2" seed="9" />
          <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.24  0 0 0 0 0.12  0 0 0 0.16 0" />
        </filter>
        <filter id="ficha-stain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="4" seed="21" />
          <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.3  0 0 0 0 0.14  0 0 0 0.55 -0.18" />
        </filter>
        <radialGradient id="ficha-burn" cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.68" stopColor="#6b4420" stopOpacity="0" />
          <stop offset="0.93" stopColor="#6b4420" stopOpacity="0.35" />
          <stop offset="1" stopColor="#3d2410" stopOpacity="0.75" />
        </radialGradient>
        <clipPath id="ficha-sheet-clip">
          <rect x="2.2" y="2.2" width="205.6" height="292.6" filter="url(#ficha-torn)" />
        </clipPath>
      </defs>
      <g clipPath="url(#ficha-sheet-clip)">
        <rect width="210" height="297" fill="#eadcbb" />
        <rect width="210" height="297" filter="url(#ficha-stain)" />
        <rect width="210" height="297" filter="url(#ficha-fiber)" />
        <rect width="210" height="297" fill="url(#ficha-burn)" />
      </g>
      <rect x="2.2" y="2.2" width="205.6" height="292.6" fill="none" stroke="#5a3a1c" strokeOpacity="0.55" strokeWidth="0.5" filter="url(#ficha-torn)" />
    </svg>
  );
}

/** Ornamento de canto em filigrana dourada (canto superior esquerdo; os outros são espelhados). */
function Corner({ className }: { className: string }) {
  return (
    <svg className={`ficha-corner ${className}`} viewBox="0 0 80 80" aria-hidden>
      <g fill="none" stroke="var(--sheet-gold-deep)" strokeLinecap="round" strokeWidth="1.1">
        <path d="M6 74 V18 C6 11 11 6 18 6 H74" />
        <path d="M11 70 V22 C11 15.5 15.5 11 22 11 H70" strokeWidth="0.6" />
        <path d="M18 6 C18 16 26 22 34 18 C40 15 38 7 32 8 C27 9 28 15 32 14" />
        <path d="M6 18 C16 18 22 26 18 34 C15 40 7 38 8 32 C9 27 15 28 14 32" />
        <path d="M22 22 C30 22 34 28 34 34 M22 22 C22 30 28 34 34 34" strokeWidth="0.8" />
        <path d="M40 6 C46 10 52 10 58 6 M6 40 C10 46 10 52 6 58" strokeWidth="0.8" />
      </g>
      <g fill="var(--sheet-gold)" stroke="var(--sheet-gold-deep)" strokeWidth="0.6">
        <path d="M22 22 L27 25 L34 34 L25 27 Z" />
        <circle cx="49" cy="7.5" r="1.8" />
        <circle cx="7.5" cy="49" r="1.8" />
        <path d="M3 3 L9 6 L6 9 Z" />
      </g>
    </svg>
  );
}

export function Corners() {
  return (
    <>
      <Corner className="ficha-corner-tl" />
      <Corner className="ficha-corner-tr" />
      <Corner className="ficha-corner-bl" />
      <Corner className="ficha-corner-br" />
    </>
  );
}

/** Runas traçadas à mão (desenho próprio, sem fonte), empilhadas na margem esquerda. */
const RUNES = [
  "M5 2 V18 M5 6 L11 3 M5 11 L11 8",
  "M4 2 V18 M4 2 L11 9 L11 18",
  "M5 2 V18 M5 5 L11 10 L5 15",
  "M8 2 V18 M8 6 L3 11 M8 6 L13 11",
  "M4 2 V18 M4 2 L11 7 L4 11 L11 18",
  "M11 3 L4 10 L11 17",
  "M3 3 L13 17 M13 3 L3 17",
  "M4 2 V18 M12 2 V18 M4 7 L12 13",
  "M8 2 V18 M3 7 L13 13",
  "M8 2 V18",
  "M4 4 L12 10 L4 16 M12 4 L4 10 L12 16",
  "M3 10 L8 3 L13 10 L8 17 Z",
  "M4 2 V18 M4 4 L12 8 L4 12",
  "M8 2 V18 M3 6 L8 10 L13 6",
];

export function RuneColumn() {
  return (
    <svg className="ficha-runes" viewBox={`0 0 16 ${RUNES.length * 26 + 14}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <path d={`M8 0 V${RUNES.length * 26 + 14}`} stroke="var(--sheet-gold-deep)" strokeWidth="0.4" strokeDasharray="1 2" />
      {RUNES.map((d, i) => (
        <g key={i} transform={`translate(0 ${i * 26 + 7})`}>
          <rect x="1" y="-1" width="14" height="22" rx="2" fill="var(--sheet-paper)" stroke="var(--sheet-gold-deep)" strokeWidth="0.4" />
          <path d={d} fill="none" stroke="var(--sheet-ink)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </svg>
  );
}

/** Janela em arco ogival (unidades relativas à caixa) usada para recortar o retrato. */
export const ARCH_CLIP_ID = "ficha-arch-clip";
export function ArchClipDef() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <clipPath id={ARCH_CLIP_ID} clipPathUnits="objectBoundingBox">
        <path d="M0 1 V0.36 C0 0.17 0.22 0.04 0.5 0 C0.78 0.04 1 0.17 1 0.36 V1 Z" />
      </clipPath>
    </svg>
  );
}

/** Moldura gótica dourada por cima do retrato (viewBox 200×260; janela em x 22–178, y 24–232). */
export function ArchFrame() {
  const arch = "M22 232 V98 C22 58 52 32 100 24 C148 32 178 58 178 98 V232 Z";
  return (
    <svg className="ficha-arch" viewBox="0 0 200 260" aria-hidden>
      <defs>
        <linearGradient id="ficha-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1d892" />
          <stop offset="0.35" stopColor="#c79a43" />
          <stop offset="0.6" stopColor="#8a5f22" />
          <stop offset="1" stopColor="#d9b25e" />
        </linearGradient>
      </defs>
      {/* moldura: arco externo menos a janela */}
      <path
        fillRule="evenodd"
        fill="url(#ficha-gold)"
        stroke="#4a3010"
        strokeWidth="1.2"
        d={`M8 250 V96 C8 48 46 16 100 6 C154 16 192 48 192 96 V250 Z ${arch}`}
      />
      <path fill="none" stroke="#4a3010" strokeWidth="0.8" opacity="0.7" d="M15 244 V97 C15 53 49 24 100 15 C151 24 185 53 185 97 V244" />
      <path fill="none" stroke="#fff3c8" strokeWidth="0.8" opacity="0.6" d="M17 240 V98 C17 56 50 28 100 19" />
      <path fill="none" stroke="#4a3010" strokeWidth="1.6" d={arch} />
      {/* fecho do arco e florão */}
      <path fill="url(#ficha-gold)" stroke="#4a3010" strokeWidth="1" d="M100 0 L108 10 L100 22 L92 10 Z" />
      <circle cx="100" cy="11" r="2.4" fill="#7a1f1a" stroke="#4a3010" strokeWidth="0.6" />
      {/* colunas com capitéis */}
      {[8, 178].map((x) => (
        <g key={x}>
          <rect x={x} y="226" width="14" height="30" fill="url(#ficha-gold)" stroke="#4a3010" strokeWidth="1" />
          <path fill="none" stroke="#4a3010" strokeWidth="0.6" d={`M${x + 4} 230 V252 M${x + 10} 230 V252`} />
        </g>
      ))}
      <rect x="4" y="250" width="192" height="8" rx="1.5" fill="url(#ficha-gold)" stroke="#4a3010" strokeWidth="1" />
      {/* folhas nas laterais do arco */}
      <path fill="none" stroke="#4a3010" strokeWidth="0.9" d="M26 92 C34 70 52 52 74 42 M174 92 C166 70 148 52 126 42" opacity="0.6" />
    </svg>
  );
}

/** Círculo arcano no centro do painel de equipamento. */
export function ArcaneCircle() {
  const ticks = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * Math.PI * 2;
    const r1 = i % 4 === 0 ? 78 : 81;
    return `M${(100 + r1 * Math.cos(a)).toFixed(1)} ${(100 + r1 * Math.sin(a)).toFixed(1)} L${(100 + 84 * Math.cos(a)).toFixed(1)} ${(100 + 84 * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  const star = Array.from({ length: 7 }, (_, i) => {
    const a = -Math.PI / 2 + ((i * 3) % 7) * ((Math.PI * 2) / 7);
    return `${i ? "L" : "M"}${(100 + 62 * Math.cos(a)).toFixed(1)} ${(100 + 62 * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="ficha-arcane" viewBox="0 0 200 200" aria-hidden>
      <g fill="none" stroke="var(--sheet-bronze)" strokeLinecap="round">
        <circle cx="100" cy="100" r="86" strokeWidth="1.2" />
        <circle cx="100" cy="100" r="76" strokeWidth="0.6" />
        <path d={ticks} strokeWidth="0.6" />
        <path d={`${star} Z`} strokeWidth="0.8" opacity="0.8" />
        <circle cx="100" cy="100" r="62" strokeWidth="0.5" strokeDasharray="2 3" />
        <circle cx="100" cy="100" r="30" strokeWidth="1" />
        <circle cx="100" cy="100" r="24" strokeWidth="0.5" />
        <path d="M100 70 L126 115 L74 115 Z M100 130 L74 85 L126 85 Z" strokeWidth="0.7" />
      </g>
      <circle cx="100" cy="100" r="5" fill="var(--sheet-bronze)" opacity="0.7" />
    </svg>
  );
}

/** Losango ornamental que ladeia os títulos dos painéis. */
export function TitleFlourish({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 40 10" className="ficha-flourish" style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
      <path d="M0 5 H28" stroke="var(--sheet-bronze)" strokeWidth="0.8" />
      <path d="M28 5 L33 1.5 L38 5 L33 8.5 Z" fill="var(--sheet-bronze)" />
      <circle cx="22" cy="5" r="1.2" fill="var(--sheet-bronze)" />
    </svg>
  );
}
