import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth/session";
import { isMember } from "@/server/campaigns";
import { subscribeCampaign, type CampaignRealtimeEvent } from "@/server/realtime";

export async function GET(request: NextRequest, context: RouteContext<"/api/campanhas/[id]/stream">) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (!(await isMember(id, user.id))) return new Response("Sem acesso", { status: 403 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      send(`event: connected\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);

      const unsub = subscribeCampaign(id, (ev: CampaignRealtimeEvent) => {
        send(`event: update\ndata: ${JSON.stringify(ev)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        send(": ping\n\n");
      }, 20_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          // Stream já fechado
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
