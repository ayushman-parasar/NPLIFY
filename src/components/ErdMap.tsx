"use client";

import { useEffect, useRef } from "react";
import erd from "@data/erd.v5.json";

export type ErdMapConfig = { flaggingEnabled: boolean; visitor?: boolean };

/**
 * Mounts the vanilla map engine (src/lib/map/engine.js) into a div.
 * The engine owns its own DOM; React only provides the frame, auth and logging.
 */
export default function ErdMap({ config }: { config: ErdMapConfig }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let handle: { destroy(): void } | null = null;
    let cancelled = false;
    const sessionId = crypto.randomUUID();
    const onEvent = (type: string, payload: Record<string, unknown>) => {
      const body = JSON.stringify({ type, payload: { ...payload, sessionId } });
      if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
      else fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    import("@/lib/map/engine.js")
      .then((m) => {
        if (cancelled) return;
        handle = m.mountErdMap(root, erd, { ...config, sessionId, onEvent });
      })
      .catch((err) => {
        console.error("ErdMap: failed to mount", err);
        root.textContent = "The map could not be loaded. Reload the page.";
      });
    return () => {
      cancelled = true;
      handle?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- config is static for the page lifetime
  }, [config.flaggingEnabled, config.visitor]);

  return <div ref={ref} className="erd-root" />;
}
