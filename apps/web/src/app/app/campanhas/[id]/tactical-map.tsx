"use client";

import { useState, useTransition } from "react";
import { CloudFog, Compass, Eye, Grid3X3, Map as MapIcon, Plus, Ruler, Trash2, Users } from "lucide-react";
import { saveTacticalMapAction } from "@/app/actions/campaigns";
import type { MapToken, TacticalMapState } from "@/server/campaign-map";
import type { PartyMemberOverview } from "@/server/campaigns";
import { Button } from "@rpg-forge/ui/components/button";
import { Input } from "@rpg-forge/ui/components/input";
import { Label } from "@rpg-forge/ui/components/label";
import { cn } from "@rpg-forge/ui/lib/utils";

type ToolMode = "move" | "ruler" | "fog";

export function TacticalMap({
  campaignId,
  isGm,
  currentUserId,
  initialMap,
  members,
}: {
  campaignId: string;
  isGm: boolean;
  currentUserId: string;
  initialMap: TacticalMapState;
  members: PartyMemberOverview[];
}) {
  const [prevProp, setPrevProp] = useState(initialMap);
  const [map, setMap] = useState<TacticalMapState>(initialMap);
  if (prevProp !== initialMap) {
    setPrevProp(initialMap);
    setMap(initialMap);
  }

  const [tool, setTool] = useState<ToolMode>("move");
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [rulerStart, setRulerStart] = useState<{ x: number; y: number } | null>(null);
  const [rulerEnd, setRulerEnd] = useState<{ x: number; y: number } | null>(null);

  const [enemyName, setEnemyName] = useState("Ameaça");
  const [enemyColor, setEnemyColor] = useState("#b91c1c");
  const [enemySize, setEnemySize] = useState(1);
  const [bgDraft, setBgDraft] = useState(initialMap.bgUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const myCharacterIds = new Set(members.filter((m) => m.ownerId === currentUserId).map((m) => m.id));
  const fogSet = new Set(map.fog);

  const persist = (next: TacticalMapState) => {
    setMap(next);
    setError(null);
    startTransition(async () => {
      const r = await saveTacticalMapAction(campaignId, next);
      if (!r.ok) {
        setError(r.error);
      }
    });
  };

  const canControlToken = (t: MapToken) => isGm || (t.characterId ? myCharacterIds.has(t.characterId) : false);

  const handleCellClick = (x: number, y: number) => {
    if (tool === "ruler") {
      if (!rulerStart || (rulerStart && rulerEnd)) {
        setRulerStart({ x, y });
        setRulerEnd(null);
      } else {
        setRulerEnd({ x, y });
      }
      return;
    }

    if (tool === "fog" && isGm) {
      const key = `${x},${y}`;
      const nextFog = fogSet.has(key) ? map.fog.filter((k) => k !== key) : [...map.fog, key];
      persist({ ...map, fog: nextFog });
      return;
    }

    if (tool === "move" && selectedTokenId) {
      const tok = map.tokens.find((t) => t.id === selectedTokenId);
      if (!tok || !canControlToken(tok)) return;
      const nextTokens = map.tokens.map((t) => (t.id === selectedTokenId ? { ...t, x, y } : t));
      setSelectedTokenId(null);
      persist({ ...map, tokens: nextTokens });
    }
  };

  const syncPartyTokens = () => {
    if (!isGm) return;
    const existingByChar = new Map(map.tokens.filter((t) => t.characterId).map((t) => [t.characterId!, t]));
    const nextTokens = [...map.tokens];
    let col = 1;
    for (const m of members) {
      if (existingByChar.has(m.id)) continue;
      nextTokens.push({
        id: `pc-${m.id}`,
        label: m.name,
        x: Math.min(map.cols - 1, col++),
        y: 1,
        color: "#d4af37",
        kind: "pc",
        size: 1,
        characterId: m.id,
        avatarSvg: m.portrait?.startsWith("<svg") ? m.portrait : undefined,
      });
    }
    persist({ ...map, tokens: nextTokens });
  };

  const addEnemyToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGm) return;
    const id = `npc-${Date.now().toString(36)}`;
    const nextTokens: MapToken[] = [
      ...map.tokens,
      {
        id,
        label: enemyName.trim() || "Ameaça",
        x: Math.floor(map.cols / 2),
        y: Math.floor(map.rows / 2),
        color: enemyColor,
        kind: "enemy",
        size: enemySize,
      },
    ];
    persist({ ...map, tokens: nextTokens });
  };

  const removeToken = (id: string) => {
    if (!isGm) return;
    if (selectedTokenId === id) setSelectedTokenId(null);
    persist({ ...map, tokens: map.tokens.filter((t) => t.id !== id) });
  };

  const distanceInfo = (() => {
    if (!rulerStart || !rulerEnd) return null;
    const dx = Math.abs(rulerEnd.x - rulerStart.x);
    const dy = Math.abs(rulerEnd.y - rulerStart.y);
    const squares = Math.max(dx, dy); // Regra padrão D&D/T20/OP (quadrados em grid)
    const meters = (squares * map.cellMeters).toFixed(1).replace(".", ",");
    return { squares, meters };
  })();

  const cellPx = 42;
  const widthPx = map.cols * cellPx;
  const heightPx = map.rows * cellPx;

  return (
    <section aria-labelledby="tactical-map-title" className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="tactical-map-title" className="flex items-center gap-2 text-base font-semibold">
            <MapIcon className="size-4 text-gold" aria-hidden /> Mapa tático 2D
          </h2>
          <p className="text-xs text-muted-foreground">
            Clique em um token seu para selecioná-lo e depois clique na célula de destino ({map.cellMeters.toString().replace(".", ",")} m por quadrado).
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant={tool === "move" ? "default" : "outline"} onClick={() => setTool("move")}>
            <Compass /> Mover tokens
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tool === "ruler" ? "default" : "outline"}
            onClick={() => {
              setTool("ruler");
              setSelectedTokenId(null);
            }}
          >
            <Ruler /> Régua
          </Button>
          {isGm && (
            <Button
              type="button"
              size="sm"
              variant={tool === "fog" ? "default" : "outline"}
              onClick={() => {
                setTool("fog");
                setSelectedTokenId(null);
              }}
            >
              <CloudFog /> Névoa de guerra
            </Button>
          )}
        </div>
      </div>

      {tool === "ruler" && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
          {distanceInfo ? (
            <span>
              Distância medida: <strong>{distanceInfo.squares} quadrado(s)</strong> ({distanceInfo.meters} metros). Clique em outra célula para reiniciar.
            </span>
          ) : rulerStart ? (
            <span>Ponto inicial marcado ({rulerStart.x + 1}, {rulerStart.y + 1}). Clique na célula de destino.</span>
          ) : (
            <span>Modo Régua ativo: clique na célula inicial e depois no alvo.</span>
          )}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {isGm && (
        <div className="grid gap-3 rounded-md border bg-background/60 p-3 text-xs lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px] flex-1 space-y-1">
                <Label htmlFor="map-bg">Imagem de fundo do mapa (URL opcional)</Label>
                <Input
                  id="map-bg"
                  value={bgDraft}
                  onChange={(e) => setBgDraft(e.target.value)}
                  placeholder="https://.../mapa.jpg"
                  className="h-8 text-xs"
                />
              </div>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => persist({ ...map, bgUrl: bgDraft.trim() })}>
                Aplicar fundo
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="map-cols" className="text-xs">
                Grade:
              </Label>
              <select
                id="map-cols"
                value={`${map.cols}x${map.rows}`}
                onChange={(e) => {
                  const [c, r] = e.target.value.split("x").map(Number);
                  persist({ ...map, cols: c, rows: r });
                }}
                className="h-8 rounded border border-input bg-transparent px-2 text-xs dark:bg-input/30"
              >
                <option value="12x9">12 × 9</option>
                <option value="16x12">16 × 12</option>
                <option value="22x14">22 × 14</option>
                <option value="28x18">28 × 18</option>
              </select>
              <Button type="button" size="sm" variant="outline" disabled={pending || !members.length} onClick={syncPartyTokens}>
                <Users /> Trazer equipe ({members.length})
              </Button>
              {map.fog.length > 0 && (
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => persist({ ...map, fog: [] })}>
                  <Eye /> Limpar névoa ({map.fog.length})
                </Button>
              )}
            </div>
          </div>

          <form onSubmit={addEnemyToken} className="flex flex-wrap items-end gap-2">
            <div className="min-w-[130px] flex-1 space-y-1">
              <Label htmlFor="tok-name">Novo token (ameaça / NPC)</Label>
              <Input id="tok-name" value={enemyName} onChange={(e) => setEnemyName(e.target.value)} maxLength={40} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tok-size">Tamanho</Label>
              <select
                id="tok-size"
                value={enemySize}
                onChange={(e) => setEnemySize(Number(e.target.value))}
                className="h-8 rounded border border-input bg-transparent px-2 text-xs dark:bg-input/30"
              >
                <option value={1}>Médio (1×1)</option>
                <option value={2}>Grande (2×2)</option>
                <option value={3}>Enorme (3×3)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tok-color">Cor</Label>
              <input
                id="tok-color"
                type="color"
                value={enemyColor}
                onChange={(e) => setEnemyColor(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              <Plus /> Adicionar
            </Button>
          </form>
        </div>
      )}

      <div className="overflow-auto rounded-lg border bg-zinc-950/90 p-2">
        <div
          className="relative select-none"
          style={{
            width: widthPx,
            height: heightPx,
            backgroundImage: map.bgUrl ? `url(${map.bgUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {/* Grade interativa */}
          <div
            className="grid h-full w-full"
            style={{
              gridTemplateColumns: `repeat(${map.cols}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${map.rows}, ${cellPx}px)`,
            }}
          >
            {Array.from({ length: map.rows * map.cols }, (_, idx) => {
              const x = idx % map.cols;
              const y = Math.floor(idx / map.cols);
              const key = `${x},${y}`;
              const fogged = fogSet.has(key);
              const isRulerPoint = (rulerStart?.x === x && rulerStart?.y === y) || (rulerEnd?.x === x && rulerEnd?.y === y);

              return (
                <button
                  key={key}
                  type="button"
                  aria-label={`Célula ${x + 1}, ${y + 1}`}
                  onClick={() => handleCellClick(x, y)}
                  className={cn(
                    "relative border border-white/10 transition-colors hover:bg-white/10",
                    fogged && (isGm ? "bg-zinc-900/65" : "bg-zinc-950"),
                    isRulerPoint && "ring-2 ring-gold ring-inset",
                  )}
                />
              );
            })}
          </div>

          {/* Linha da régua */}
          {rulerStart && rulerEnd && (
            <svg
              className="pointer-events-none absolute inset-0"
              width={widthPx}
              height={heightPx}
              aria-hidden
            >
              <line
                x1={rulerStart.x * cellPx + cellPx / 2}
                y1={rulerStart.y * cellPx + cellPx / 2}
                x2={rulerEnd.x * cellPx + cellPx / 2}
                y2={rulerEnd.y * cellPx + cellPx / 2}
                stroke="#f5c451"
                strokeWidth={3}
                strokeDasharray="6 4"
              />
            </svg>
          )}

          {/* Tokens */}
          {map.tokens.map((tok) => {
            const fogged = fogSet.has(`${tok.x},${tok.y}`);
            if (!isGm && fogged && tok.kind !== "pc") return null;

            const isSelected = selectedTokenId === tok.id;
            const controllable = canControlToken(tok);
            const sizePx = tok.size * cellPx - 4;

            return (
              <div
                key={tok.id}
                style={{
                  left: tok.x * cellPx + 2,
                  top: tok.y * cellPx + 2,
                  width: sizePx,
                  height: sizePx,
                }}
                className="absolute z-10 transition-all duration-150"
              >
                <button
                  type="button"
                  title={`${tok.label}${controllable ? " (clique para mover)" : ""}`}
                  onClick={() => {
                    if (tool === "move" && controllable) {
                      setSelectedTokenId((cur) => (cur === tok.id ? null : tok.id));
                    }
                  }}
                  style={{ borderColor: tok.color }}
                  className={cn(
                    "group relative flex size-full items-center justify-center overflow-hidden rounded-full border-2 bg-zinc-900 text-xs font-semibold text-white shadow-md",
                    isSelected && "ring-3 ring-gold",
                    !controllable && "cursor-default",
                  )}
                >
                  {tok.avatarSvg ? (
                    <span className="size-full [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: tok.avatarSvg }} />
                  ) : (
                    <span className="truncate px-1">{tok.label.slice(0, 3).toUpperCase()}</span>
                  )}
                </button>
                <span className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1 text-[10px] text-white">
                  {tok.label}
                </span>
                {isGm && (
                  <button
                    type="button"
                    aria-label={`Remover token ${tok.label}`}
                    onClick={() => removeToken(tok.id)}
                    className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-destructive text-[10px] text-white opacity-80 hover:opacity-100"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {map.tokens.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Grid3X3 className="size-3.5" aria-hidden />
          <span>Tokens no mapa:</span>
          {map.tokens.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded border px-2 py-0.5">
              <span className="size-2 rounded-full" style={{ backgroundColor: t.color }} />
              {t.label}
              {isGm && (
                <button type="button" onClick={() => removeToken(t.id)} aria-label={`Remover ${t.label}`} className="ml-0.5 hover:text-destructive">
                  <Trash2 className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
