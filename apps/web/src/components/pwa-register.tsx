"use client";

import { useEffect, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function PwaRegister() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => (typeof navigator !== "undefined" ? navigator.onLine : true),
    () => true,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="fixed right-3 bottom-3 z-50 flex items-center gap-1.5 rounded-full border border-warning/40 bg-card px-3 py-1.5 text-xs shadow-lg print:hidden"
    >
      <WifiOff className="size-3.5 text-warning" aria-hidden />
      <span>Sem conexão — exibindo dados salvos localmente</span>
    </div>
  );
}
