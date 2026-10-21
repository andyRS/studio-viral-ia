"use client";
import { useEffect, useState } from "react";
import { useData } from "@/lib/DataContext";
import { hookText } from "@/lib/hooks";

const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

const MESSAGES: Record<string, string> = {
  conectado: "✓ Facebook e Instagram conectados. Pulsa «Importar métricas».",
  "sin-paginas": "Se conectó la cuenta, pero Facebook no devolvió ninguna página. Vuelve a conectar y marca tus páginas en el permiso.",
  cancelado: "Conexión cancelada.",
  error: "No se pudo conectar",
  "sin-configurar": "Falta configurar META_APP_ID y META_APP_SECRET en Vercel.",
};

// Busca el episodio de la app al que pertenece un Reel por su texto (título o gancho en la descripción).
function matchEpisode(caption: string, episodes: any[]) {
  const c = norm(caption);
  if (!c) return null;
  return episodes.find(e => {
    const t = norm(e.title); const h = norm(hookText(e.output?.hook).split(" / ")[0]);
    return (t.length >= 6 && !/^episodio \d+$/.test(t) && c.includes(t)) || (h.length >= 12 && c.includes(h));
  }) || null;
}

export default function MetaConnect() {
  const { data, insert, update, mode } = useData();
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/meta/status", { cache: "no-store" }).catch(() => null);
    setStatus(r && r.ok ? await r.json() : null);
  }
  useEffect(() => {
    const q = new URLSearchParams(window.location.search); const m = q.get("meta");
    if (m) { setMsg([MESSAGES[m] || m, q.get("detalle")].filter(Boolean).join(": ")); window.history.replaceState(null, "", window.location.pathname); }
    if (mode === "supabase") load();
  }, [mode]);

  async function importNow() {
    setBusy(true); setMsg("Leyendo tus Reels en Facebook e Instagram…");
    try {
      const r = await fetch("/api/meta/import", { method: "POST" }); const j = await r.json().catch(() => ({}));
      if (!j.ok) { setMsg("Error: " + (j.error || "HTTP " + r.status)); return; }
      let added = 0, updated = 0, linked = 0;
      for (const m of j.metrics || []) {
        const ep = matchEpisode(m.caption, data.episodes);
        if (ep) linked++;
        const row = {
          externalId: m.externalId, permalink: m.permalink, platform: m.platform, date: m.date,
          views: m.views, avgWatch: m.avgWatch, interactions: m.interactions, followers: m.followers, duration: m.duration || ep?.duration || 0,
          shares: m.shares, saves: m.saves, skipRate: m.skipRate, reach: m.reach,
          episodeId: ep?.id, episodeTitle: ep?.title || (m.caption.split("\n")[0].slice(0, 80) || `Reel ${m.date}`),
          hook: ep ? hookText(ep.output?.hook) : "", formula: "",
        };
        const prev = data.metrics.find((x: any) => x.externalId === m.externalId);
        if (prev) { await update("metrics", prev.id, { ...prev, ...row, hook: row.hook || prev.hook, formula: prev.formula }); updated++; }
        else { await insert("metrics", row); added++; }
      }
      setMsg(`✓ ${added} Reels nuevos, ${updated} actualizados (${linked} enlazados a episodios de la app).${(j.errors || []).length ? " Avisos: " + j.errors.join(" · ") : ""}`);
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!confirm("¿Desconectar Facebook e Instagram? Las métricas ya importadas se quedan.")) return;
    await fetch("/api/meta/disconnect", { method: "POST" }); await load(); setMsg("Desconectado.");
  }

  if (mode !== "supabase") return <div className="mt-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-sm">📲 <b>Facebook e Instagram:</b> inicia sesión para conectar tus páginas e importar las métricas reales.</div>;

  return <div className="mt-3 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <b>📲 Facebook e Instagram</b>
      {status?.connected && <span className="text-xs text-slate-300">{status.pages.map((p: any) => p.name + (p.ig ? ` + @${p.ig}` : "")).join(" · ")}</span>}
      <span className="ml-auto flex gap-2">
        {status?.connected && <button disabled={busy} onClick={importNow} className="rounded bg-blue-500 px-3 py-1.5 text-xs font-bold text-white">{busy ? "Importando…" : "Importar métricas"}</button>}
        {status?.configured !== false && <a href="/api/meta/connect" className="rounded border border-blue-400/50 px-3 py-1.5 text-xs font-bold text-blue-100">{status?.connected ? "Reconectar" : "Conectar Facebook e Instagram"}</a>}
        {status?.connected && <button onClick={disconnect} className="text-xs text-slate-400 hover:text-red-300">Desconectar</button>}
      </span>
    </div>
    {status?.configured === false && <p className="mt-1 text-xs text-slate-400">Falta configurar la app de Meta (META_APP_ID y META_APP_SECRET en Vercel).</p>}
    {status?.error && <p className="mt-1 text-xs text-red-300">{status.error}</p>}
    {status?.connected && !status.pages.some((p: any) => p.ig) && <p className="mt-1 text-xs text-amber-200/80">Ninguna página tiene Instagram vinculado: para Instagram tu cuenta debe ser profesional y estar vinculada a la página.</p>}
    {msg && <p className="mt-2 text-xs text-slate-200">{msg}</p>}
    <p className="mt-1 text-[11px] text-slate-400">Importa los últimos 25 Reels de cada página e Instagram. Meta puede tardar hasta 48 h en dar las cifras. Para enlazar un Reel con su episodio, pon el título del episodio o la primera línea del gancho en la descripción.</p>
  </div>;
}
