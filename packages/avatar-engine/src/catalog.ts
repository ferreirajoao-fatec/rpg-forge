import { ASSET_CATALOG } from "./generated/assets";
import { REQUIRED_SLOTS, type AssetCatalog, type AssetPart, type AvatarConfig, type CatalogSlot, type SlotId } from "./model";

/** Acesso ao catálogo de peças (por padrão, o gerado a partir de assets/avatar). */
export class PartCatalog {
  private readonly byId = new Map<string, AssetPart>();
  constructor(readonly data: AssetCatalog = ASSET_CATALOG) {
    for (const p of data.parts) this.byId.set(p.id, p);
  }
  get version() {
    return this.data.version;
  }
  get(id: string | null | undefined): AssetPart | undefined {
    return id ? this.byId.get(id) : undefined;
  }
  forSlot(slot: CatalogSlot): AssetPart[] {
    return this.data.parts.filter((p) => p.slot === slot);
  }
  file(path: string): string {
    const svg = this.data.files[path];
    if (svg === undefined) throw new Error(`Asset ausente: ${path}`);
    return svg;
  }
}

export const defaultCatalog = new PartCatalog();

/** Avatar inicial: corpo médio, rosto completo, túnica, calça, botas e cinto. */
export function defaultAvatar(catalog: PartCatalog = defaultCatalog): AvatarConfig {
  const pick = (slot: SlotId, id: string) => ({ part: catalog.get(id) ? id : (catalog.forSlot(slot)[0]?.id ?? null), colors: {} });
  return {
    schema: 1,
    assets: catalog.version,
    build: "medio",
    colors: { skin: "#c98e6a", hair: "#3b2a20", eyeL: "#4a7a3a", eyeR: "#4a7a3a", horn: "#e8dcc4" },
    slots: {
      background: pick("background", "background:pergaminho"),
      body: pick("body", "body:humanoide"),
      head: pick("head", "head:oval"),
      ears: pick("ears", "ears:humana"),
      eyes: pick("eyes", "eyes:amendoados"),
      brows: pick("brows", "brows:naturais"),
      nose: pick("nose", "nose:reto"),
      mouth: pick("mouth", "mouth:neutra"),
      hair: pick("hair", "hair:curto"),
      torso: pick("torso", "torso:tunica"),
      legs: pick("legs", "legs:calca"),
      feet: pick("feet", "feet:botas"),
      belt: pick("belt", "belt:cinto-bolsa"),
    },
    marks: [],
  };
}

export interface AvatarIssue {
  slot?: SlotId;
  message: string;
}

/**
 * Problemas de um avatar em relação ao catálogo: peça inexistente, peça no slot errado
 * ou slot obrigatório vazio. Usado ao carregar e ao salvar.
 */
export function checkAvatar(config: AvatarConfig, catalog: PartCatalog = defaultCatalog): AvatarIssue[] {
  const issues: AvatarIssue[] = [];
  for (const [slot, choice] of Object.entries(config.slots) as [SlotId, NonNullable<AvatarConfig["slots"][SlotId]>][]) {
    if (!choice.part) continue;
    const part = catalog.get(choice.part);
    if (!part) issues.push({ slot, message: `A peça "${choice.part}" não existe no catálogo ${catalog.version}.` });
    else if (part.slot !== slot) issues.push({ slot, message: `A peça "${part.name}" não pertence a ${slot}.` });
  }
  (config.marks ?? []).forEach((m, i) => {
    if (catalog.get(m.part)?.slot !== "marks") issues.push({ message: `A marca ${i + 1} ("${m.part}") não existe no catálogo ${catalog.version}.` });
  });
  for (const slot of REQUIRED_SLOTS) if (!config.slots[slot]?.part) issues.push({ slot, message: `O slot ${slot} é obrigatório.` });
  return issues;
}
