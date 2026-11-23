import "server-only";
import { EventEmitter } from "node:events";

export type CampaignRealtimeKind =
  | "roll"
  | "board"
  | "party"
  | "diary"
  | "homebrew"
  | "approval"
  | "map"
  | "audio";

export interface CampaignRealtimeEvent {
  kind: CampaignRealtimeKind;
  at: string;
  actorId?: string;
}

type Listener = (event: CampaignRealtimeEvent) => void;

const globalHub = globalThis as unknown as {
  __rpgForgeRealtimeHub?: EventEmitter;
};

function getHub(): EventEmitter {
  if (!globalHub.__rpgForgeRealtimeHub) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(500);
    globalHub.__rpgForgeRealtimeHub = emitter;
  }
  return globalHub.__rpgForgeRealtimeHub;
}

/** Publica um evento em tempo real para todos os membros conectados na campanha. */
export function publishCampaignEvent(campaignId: string, kind: CampaignRealtimeKind, actorId?: string): void {
  const payload: CampaignRealtimeEvent = { kind, at: new Date().toISOString(), actorId };
  getHub().emit(`campaign:${campaignId}`, payload);
}

/** Assina os eventos em tempo real de uma campanha e retorna a função para cancelar a assinatura. */
export function subscribeCampaign(campaignId: string, listener: Listener): () => void {
  const hub = getHub();
  const channel = `campaign:${campaignId}`;
  hub.on(channel, listener);
  return () => {
    hub.off(channel, listener);
  };
}
