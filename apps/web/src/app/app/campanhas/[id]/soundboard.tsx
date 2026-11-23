"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Music, Radio, Volume2, VolumeX, Zap } from "lucide-react";
import { setAmbientTrackAction } from "@/app/actions/campaigns";
import type { AmbientTrackId } from "@/server/campaign-audio";
import { Button } from "@rpg-forge/ui/components/button";
import { cn } from "@rpg-forge/ui/lib/utils";

const TRACKS: { id: AmbientTrackId; label: string; desc: string }[] = [
  { id: "none", label: "Silêncio", desc: "Desliga o som ambiente" },
  { id: "rain", label: "Chuva & Tempestade", desc: "Ruído suave de chuva contínua" },
  { id: "paranormal", label: "Tensão Paranormal", desc: "Drone grave da Membrana" },
  { id: "tavern", label: "Taverna & Lareira", desc: "Crepitar acolhedor de brasa" },
  { id: "forest", label: "Floresta Noturna", desc: "Brisa e grilos noturnos" },
  { id: "combat", label: "Pulso de Combate", desc: "Batida tensa de confronto" },
];

const SFX_LIST = [
  { id: "thunder", label: "Trovão" },
  { id: "door", label: "Porta rangendo" },
  { id: "heartbeat", label: "Batimento" },
  { id: "scare", label: "Susto" },
  { id: "impact", label: "Impacto" },
  { id: "dice", label: "Dados" },
] as const;

type SfxId = (typeof SFX_LIST)[number]["id"];

function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = ctx.sampleRate * seconds;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function Soundboard({
  campaignId,
  isGm,
  syncedTrack,
}: {
  campaignId: string;
  isGm: boolean;
  syncedTrack: AmbientTrackId;
}) {
  const [prevSynced, setPrevSynced] = useState(syncedTrack);
  const [activeTrack, setActiveTrack] = useState<AmbientTrackId>(syncedTrack);
  if (prevSynced !== syncedTrack) {
    setPrevSynced(syncedTrack);
    setActiveTrack(syncedTrack);
  }

  const [volume, setVolume] = useState(0.35);
  const [enabled, setEnabled] = useState(false);
  const [pending, startTransition] = useTransition();

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const stopCurrentRef = useRef<(() => void) | null>(null);

  const ensureAudio = () => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterGainRef.current = master;
    }
    if (ctxRef.current.state === "suspended") {
      void ctxRef.current.resume();
    }
    return { ctx: ctxRef.current, master: masterGainRef.current! };
  };

  useEffect(() => {
    if (masterGainRef.current && ctxRef.current) {
      masterGainRef.current.gain.setTargetAtTime(volume, ctxRef.current.currentTime, 0.05);
    }
  }, [volume]);

  useEffect(() => {
    if (stopCurrentRef.current) {
      stopCurrentRef.current();
      stopCurrentRef.current = null;
    }
    if (!enabled || activeTrack === "none") return;

    const audio = ensureAudio();
    if (!audio) return;
    const { ctx, master } = audio;

    const cleanups: (() => void)[] = [];

    if (activeTrack === "rain" || activeTrack === "tavern") {
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, 3);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = activeTrack === "rain" ? "bandpass" : "lowpass";
      filter.frequency.value = activeTrack === "rain" ? 900 : 420;
      const g = ctx.createGain();
      g.gain.value = activeTrack === "rain" ? 0.45 : 0.35;
      src.connect(filter).connect(g).connect(master);
      src.start();
      cleanups.push(() => {
        src.stop();
        src.disconnect();
      });
    } else if (activeTrack === "paranormal") {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = "sawtooth";
      osc2.type = "sine";
      osc1.frequency.value = 55;
      osc2.frequency.value = 57.5;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 210;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(g).connect(master);
      osc1.start();
      osc2.start();
      cleanups.push(() => {
        osc1.stop();
        osc2.stop();
        osc1.disconnect();
        osc2.disconnect();
      });
    } else if (activeTrack === "forest") {
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, 3);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.value = 0.22;
      src.connect(filter).connect(g).connect(master);
      src.start();
      const timer = setInterval(() => {
        if (ctx.state !== "running") return;
        const osc = ctx.createOscillator();
        const eg = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 3800 + Math.random() * 400;
        const now = ctx.currentTime;
        eg.gain.setValueAtTime(0.0001, now);
        eg.gain.exponentialRampToValueAtTime(0.05, now + 0.03);
        eg.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
        osc.connect(eg).connect(master);
        osc.start(now);
        osc.stop(now + 0.16);
      }, 1400);
      cleanups.push(() => {
        clearInterval(timer);
        src.stop();
      });
    } else if (activeTrack === "combat") {
      const timer = setInterval(() => {
        if (ctx.state !== "running") return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const eg = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(95, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
        eg.gain.setValueAtTime(0.45, now);
        eg.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(eg).connect(master);
        osc.start(now);
        osc.stop(now + 0.25);
      }, 520);
      cleanups.push(() => clearInterval(timer));
    }

    stopCurrentRef.current = () => {
      for (const fn of cleanups) fn();
    };
    return () => {
      stopCurrentRef.current?.();
      stopCurrentRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrack, enabled]);

  const playSfx = (id: SfxId) => {
    setEnabled(true);
    const audio = ensureAudio();
    if (!audio) return;
    const { ctx, master } = audio;
    const now = ctx.currentTime;

    if (id === "thunder") {
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, 2);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(520, now);
      filter.frequency.exponentialRampToValueAtTime(85, now + 1.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
      src.connect(filter).connect(g).connect(master);
      src.start(now);
      src.stop(now + 1.65);
    } else if (id === "door") {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.linearRampToValueAtTime(240, now + 0.35);
      osc.frequency.linearRampToValueAtTime(135, now + 0.8);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 0.9);
    } else if (id === "heartbeat") {
      for (const offset of [0, 0.24]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(68, now + offset);
        osc.frequency.exponentialRampToValueAtTime(34, now + offset + 0.16);
        g.gain.setValueAtTime(0.65, now + offset);
        g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
        osc.connect(g).connect(master);
        osc.start(now + offset);
        osc.stop(now + offset + 0.2);
      }
    } else if (id === "scare") {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const g = ctx.createGain();
      osc1.type = "sawtooth";
      osc2.type = "square";
      osc1.frequency.setValueAtTime(580, now);
      osc2.frequency.setValueAtTime(615, now);
      osc1.frequency.exponentialRampToValueAtTime(190, now + 0.7);
      osc2.frequency.exponentialRampToValueAtTime(198, now + 0.7);
      g.gain.setValueAtTime(0.35, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc1.connect(g);
      osc2.connect(g);
      g.connect(master);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.78);
      osc2.stop(now + 0.78);
    } else if (id === "impact") {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.28);
      g.gain.setValueAtTime(0.8, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(g).connect(master);
      osc.start(now);
      osc.stop(now + 0.32);
    } else if (id === "dice") {
      for (const offset of [0, 0.07, 0.14]) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(1100 + offset * 2400, now + offset);
        g.gain.setValueAtTime(0.18, now + offset);
        g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.045);
        osc.connect(g).connect(master);
        osc.start(now + offset);
        osc.stop(now + offset + 0.05);
      }
    }
  };

  const selectTrack = (track: AmbientTrackId) => {
    setEnabled(track !== "none");
    setActiveTrack(track);
    if (isGm) {
      startTransition(async () => {
        await setAmbientTrackAction(campaignId, track);
      });
    }
  };

  return (
    <section aria-labelledby="soundboard-title" className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="soundboard-title" className="flex items-center gap-1.5 text-sm font-semibold">
          <Music className="size-4 text-gold" aria-hidden /> Trilha e efeitos
        </h2>
        <Button
          type="button"
          size="sm"
          variant={enabled ? "outline" : "default"}
          onClick={() => setEnabled((v) => !v)}
          aria-label={enabled ? "Silenciar áudio local" : "Ativar áudio da mesa"}
        >
          {enabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          {enabled ? "Ativo" : "Ouvir"}
        </Button>
      </div>

      {syncedTrack !== "none" && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Radio className="size-3 text-emerald-500" aria-hidden />
          Sincronizado pela mesa: <strong>{TRACKS.find((t) => t.id === syncedTrack)?.label}</strong>
        </p>
      )}

      <div className="flex items-center gap-2">
        <Volume2 className="size-3.5 text-muted-foreground" aria-hidden />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="Volume do soundboard"
          className="h-1.5 flex-1 accent-gold"
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {TRACKS.map((t) => {
          const on = activeTrack === t.id && (t.id === "none" || enabled);
          return (
            <button
              key={t.id}
              type="button"
              disabled={pending}
              title={t.desc}
              onClick={() => selectTrack(t.id)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
                on && "border-gold bg-gold/10 font-medium",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Zap className="size-3" aria-hidden /> Efeitos avulsos (SFX)
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {SFX_LIST.map((s) => (
            <Button key={s.id} type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => playSfx(s.id)}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}
