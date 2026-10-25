"use client";
// Actualiza solas las métricas de Meta cada 5 minutos mientras la app está abierta y visible
// (modo rápido: los 8 Reels más recientes de cada cuenta; solo se guardan los que cambiaron).
import { useEffect, useRef } from "react";
import { useData } from "@/lib/DataContext";
import { syncMetaMetrics, META_SYNC_KEY, META_SYNC_MINUTES } from "@/lib/metaSync";

const PERIOD = META_SYNC_MINUTES * 60_000;

export default function AutoMetaSync() {
  const { data, insert, update, mode } = useData();
  const ops = useRef({ data, insert, update });
  ops.current = { data, insert, update };

  useEffect(() => {
    if (mode !== "supabase") return;
    let ready = false, stopped = false;

    async function check() {
      const r = await fetch("/api/meta/status", { cache: "no-store" }).catch(() => null);
      const s = r && r.ok ? await r.json().catch(() => null) : null;
      ready = !!(s?.connected && Array.isArray(s.selected) && s.selected.length);
    }
    function due() {
      try { const at = localStorage.getItem(META_SYNC_KEY); return !at || Date.now() - new Date(at).getTime() >= PERIOD - 15_000; } catch { return true; }
    }
    async function run() {
      if (stopped || !ready || document.visibilityState !== "visible" || !due()) return;
      await syncMetaMetrics(ops.current, { quick: true }).catch(() => null);
    }

    check().then(run);
    const t = setInterval(run, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    const recheck = setInterval(check, 30 * 60_000);
    return () => { stopped = true; clearInterval(t); clearInterval(recheck); document.removeEventListener("visibilitychange", onVisible); };
  }, [mode]);

  return null;
}
