"use client";
import { useEffect, useState } from "react";
import { useData } from "@/lib/DataContext";
import { hookText } from "@/lib/hooks";

const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

const MESSAGES: Record<string, string> = {
  conectado: "✓ Facebook e Instagram conectados. Elige abajo las páginas que quieres ver.",
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
  const { data, insert, update, remove, mode } = useData();
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [picking, setPicking] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);

  async function load() {
    const r = await fetch("/api/meta/status", { cache: "no-store" }).catch(() => null);
    const s = r && r.ok ? await r.json() : null;
    setStatus(s); setChecked(s?.selected || []);
  }

  async function saveSelection() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/meta/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: checked }) });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setMsg("Error: " + (j.error || "HTTP " + r.status)); return; }
      const gone = new Set<string>(j.removedExternalIds || []);
      const toDelete = data.metrics.filter((m: any) => m.externalId && gone.has(m.externalId));
      for (const m of toDelete) { try { await remove("metrics", m.id); } catch {} }
      setPicking(false); await load();
      setMsg(`✓ Páginas guardadas.${toDelete.length ? ` Se borraron ${toDelete.length} métricas de las páginas que quitaste.` : ""} Pulsa «Importar métricas».`);
    } finally { setBusy(false); }
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
      let added = 0, updated = 0, linked = 0; const failed: string[] = [];
      for (const m of j.metrics || []) {
        const ep = matchEpisode(m.caption, data.episodes);
        if (ep) linked++;
        const row = {
          externalId: m.externalId, permalink: m.permalink, platform: m.platform, date: m.date, accountName: m.account, thumb: m.thumb,
          views: m.views, avgWatch: m.avgWatch, interactions: m.interactions, followers: m.followers, duration: m.duration || ep?.duration || 0,
          shares: m.shares, saves: m.saves, skipRate: m.skipRate, reach: m.reach,
          episodeId: ep?.id, episodeTitle: ep?.title || (Array.from(m.caption.split("\n")[0]).slice(0, 80).join("").trim() || `Reel ${m.date}`),
          hook: ep ? hookText(ep.output?.hook) : "", formula: "",
        };
        const prev = data.metrics.find((x: any) => x.externalId === m.externalId);
        try {
          if (prev) { await update("metrics", prev.id, { ...prev, ...row, hook: row.hook || prev.hook, formula: prev.formula }); updated++; }
          else { await insert("metrics", row); added++; }
        } catch (e: any) { failed.push(`${m.platform} ${m.date}: ${e?.message || e}`); }
      }
      setMsg(`✓ ${added} Reels nuevos, ${updated} actualizados (${linked} enlazados a episodios de la app).${failed.length ? ` ${failed.length} no se pudieron guardar: ${failed.slice(0, 2).join(" · ")}.` : ""}${(j.errors || []).length ? " Avisos: " + j.errors.join(" · ") : ""}`);
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
      {status?.connected && status.selected && <span className="text-xs text-slate-300">{status.pages.filter((p: any) => status.selected.includes(p.id)).map((p: any) => p.name + (p.ig ? ` + @${p.ig}` : "")).join(" · ") || "Ninguna página elegida"}</span>}
      <span className="ml-auto flex gap-2">
        {status?.connected && status.selected && !picking && <button onClick={() => setPicking(true)} className="rounded border border-blue-400/50 px-3 py-1.5 text-xs font-bold text-blue-100">Elegir páginas</button>}
        {status?.connected && status.selected?.length > 0 && !picking && <button disabled={busy} onClick={importNow} className="rounded bg-blue-500 px-3 py-1.5 text-xs font-bold text-white">{busy ? "Importando…" : "Importar métricas"}</button>}
        {status?.configured !== false && <a href="/api/meta/connect" className="rounded border border-blue-400/50 px-3 py-1.5 text-xs font-bold text-blue-100">{status?.connected ? "Reconectar" : "Conectar Facebook e Instagram"}</a>}
        {status?.connected && <button onClick={disconnect} className="text-xs text-slate-400 hover:text-red-300">Desconectar</button>}
      </span>
    </div>
    {status?.connected && (picking || !status.selected) && <div className="mt-3 rounded-lg border border-blue-400/30 bg-black/20 p-3">
      <p className="font-bold">¿Qué páginas quieres ver?</p>
      <p className="text-xs text-slate-400">Solo se importarán las que marques. Si quitas una, se borran sus métricas ya importadas.</p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {status.pages.map((p: any) => <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
          <input type="checkbox" className="w-auto" checked={checked.includes(p.id)} onChange={e => setChecked(e.target.checked ? [...checked, p.id] : checked.filter(x => x !== p.id))} />
          <span>{p.name}{p.ig ? <span className="text-pink-300"> + Instagram @{p.ig}</span> : <span className="text-xs text-slate-500"> · sin Instagram vinculado</span>}</span>
        </label>)}
      </div>
      <div className="mt-2 flex gap-2">
        <button disabled={busy} onClick={saveSelection} className="rounded bg-blue-500 px-3 py-1.5 text-xs font-bold text-white">{busy ? "Guardando…" : `Guardar (${checked.length})`}</button>
        {status.selected && <button onClick={() => { setPicking(false); setChecked(status.selected); }} className="text-xs text-slate-400">Cancelar</button>}
      </div>
    </div>}
    {status?.configured === false && <p className="mt-1 text-xs text-slate-400">Falta configurar la app de Meta (META_APP_ID y META_APP_SECRET en Vercel).</p>}
    {status?.error && <p className="mt-1 text-xs text-red-300">{status.error}</p>}
    {status?.connected && status.selected?.length > 0 && !status.pages.some((p: any) => p.ig && status.selected.includes(p.id)) && <p className="mt-1 text-xs text-amber-200/80">Ninguna de las páginas elegidas tiene Instagram vinculado: para ver Instagram, la cuenta debe ser profesional y estar vinculada a su página de Facebook.</p>}
    {msg && <p className="mt-2 text-xs text-slate-200">{msg}</p>}
    <p className="mt-1 text-[11px] text-slate-400">Importa los últimos 25 Reels de cada página e Instagram. Meta puede tardar hasta 48 h en dar las cifras. Para enlazar un Reel con su episodio, pon el título del episodio o la primera línea del gancho en la descripción.</p>
  </div>;
}
