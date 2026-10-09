"use client";

import { useEffect, useRef } from "react";
import erd from "@data/erd.v5.json";

export type ErdMapConfig = { flaggingEnabled: boolean; visitor?: boolean };

type Handle = {
  destroy(): void;
  select(name: string): void;
  fit(): void;
  setTab(tab: string): void;
  ask(text: string, send?: boolean): void;
  startWalk(index: number): void;
};

/**
 * Mounts the vanilla map engine (src/lib/map/engine.js) into a div.
 * The engine owns its own DOM; React only provides the frame, auth and logging.
 * Query parameters open the map in a state: ?entity=NAME pins an entity, ?tab=ask|details opens a
 * panel tab, ?ask=TEXT prefills a question, ?walk=N starts a walkthrough. They are consumed once.
 */
export default function ErdMap({ config }: { config: ErdMapConfig }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let handle: Handle | null = null;
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
        handle = m.mountErdMap(root, erd, { ...config, sessionId, onEvent }) as Handle;
        const q = new URLSearchParams(window.location.search);
        if (![...q.keys()].length) return;
        const entity = q.get("entity");
        const tab = q.get("tab");
        const askText = q.get("ask");
        const walk = q.get("walk");
        // Let the first layout settle so the viewport tween starts from the fitted map.
        setTimeout(() => {
          if (!handle) return;
          if (walk !== null && /^\d+$/.test(walk)) handle.startWalk(Number(walk));
          if (entity) handle.select(entity);
          if (askText) handle.ask(askText, false);
          else if (tab) handle.setTab(tab);
          window.history.replaceState(null, "", window.location.pathname);
        }, 150);
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
