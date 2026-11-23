"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { Badge } from "@rpg-forge/ui/components/badge";

export function CampaignLiveSync({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/campanhas/${campaignId}/stream`);

    es.addEventListener("connected", () => {
      setStatus("live");
    });

    es.addEventListener("update", (ev) => {
      try {
        const detail = JSON.parse((ev as MessageEvent).data);
        window.dispatchEvent(new CustomEvent("rpgforge:campaign-event", { detail }));
      } catch {
        // Ignora payload malformado
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        router.refresh();
      }, 350);
    });

    es.onerror = () => {
      setStatus("offline");
    };

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      es.close();
    };
  }, [campaignId, router]);

  return (
    <Badge variant={status === "live" ? "outline" : "secondary"} className="gap-1.5 text-xs">
      <Radio
        className={`size-3 ${status === "live" ? "text-emerald-500" : status === "connecting" ? "text-gold" : "text-muted-foreground"}`}
        aria-hidden
      />
      {status === "live" ? "Mesa ao vivo" : status === "connecting" ? "Conectando…" : "Reconectando…"}
    </Badge>
  );
}
