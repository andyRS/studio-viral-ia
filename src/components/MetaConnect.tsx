"use client";
import { useEffect, useState } from "react";
import { useData } from "@/lib/DataContext";
import { syncMetaMetrics, META_SYNC_EVENT, META_SYNC_KEY, META_SYNC_MINUTES } from "@/lib/metaSync";

const MESSAGES: Record<string, string> = {
  conectado: "✓ Facebook e Instagram conectados. Elige abajo las páginas que quieres ver.",
  "sin-paginas": "Se conectó la cuenta, pero Facebook no devolvió ninguna página. Vuelve a conectar y marca tus páginas en el permiso.",
  cancelado: "Conexión cancelada.",
  error: "No se pudo conectar",
  "sin-configurar": "Falta configurar META_APP_ID y META_APP_SECRET en Vercel.",
};

function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? "hace un momento" : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h`;
}

export default function MetaConnect() {
  const { data, insert, update, remove, mode } = useData();
  const [status, setStatus] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [managing, setManaging] = useState(false);
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [picking, setPicking] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    const read = (e?: Event) => {
      try { setLastSync(localStorage.getItem(META_SYNC_KEY)); } catch {}
      if (e) setExpired(!!(e as CustomEvent).detail?.expired);
    };
    read();
    window.addEventListener(META_SYNC_EVENT, read);
    const t = setInterval(() => tick(x => x + 1), 30_000);
    return () => { window.removeEventListener(META_SYNC_EVENT, read); clearInterval(t); };
  }, []);

  async function load() {
    const r = await fetch("/api/meta/status", { cache: "no-store" }).catch(() => null);
    const s = r && r.ok ? await r.json() : null;
    setStatus(s || { error: "No se pudo comprobar la conexión con Meta. Recarga la página para intentarlo de nuevo." });
    setChecked(s?.selected || []);
    if (s?.connected && !Array.isArray(s.selected)) setManaging(true);
  }

  async function saveSelection() {
    const removed = (status?.selected || []).filter((id: string) => !checked.includes(id));
    if (removed.length && !confirm(`¿Quitar ${removed.length} página(s)? También se borrarán sus métricas importadas.`)) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/meta/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: checked }) });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) { setMsg("Error: " + (j.error || "HTTP " + r.status)); return; }
      const gone = new Set<string>(j.removedExternalIds || []);
      const toDelete = data.metrics.filter((m: any) => m.externalId && gone.has(m.externalId));
      let deleted = 0;
      for (const m of toDelete) { try { await remove("metrics", m.id); deleted++; } catch {} }
      setPicking(false); setManaging(false); await load();
      setMsg(`✓ Páginas guardadas.${deleted ? ` Se borraron ${deleted} métricas de las páginas que quitaste.` : ""}${toDelete.length > deleted ? ` ${toDelete.length - deleted} métricas no se pudieron borrar.` : ""} Pulsa «Importar métricas».`);
    } catch (e: any) { setMsg("No se pudieron guardar las páginas: " + (e?.message || e)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const q = new URLSearchParams(window.location.search); const m = q.get("meta");
    if (m) { setMsg([MESSAGES[m] || m, q.get("detalle")].filter(Boolean).join(": ")); window.history.replaceState(null, "", window.location.pathname); }
    if (mode === "supabase") load();
  }, [mode]);

  async function importNow() {
    setBusy(true);
    setImportProgress({ done: 0, total: 0 });
    setMsg("Consultando los Reels de Facebook e Instagram…");
    try {
      const res = await syncMetaMetrics({ data, insert, update }, { onProgress: (done, total) => setImportProgress({ done, total }) });
      if (res.skipped) { setMsg("Ya se está actualizando en segundo plano. Espera unos segundos."); return; }
      if (res.expired) { setExpired(true); setMsg(res.error!); return; }
      if (res.error) { setMsg("No se pudo iniciar la importación: " + res.error + ". Vuelve a intentarlo."); return; }
      const partial = res.failed.length > 0 || res.errors.length > 0;
      const summary = `${res.added} Reels nuevos, ${res.updated} actualizados. ${res.linked} vinculados automáticamente; ${res.preserved} vínculos existentes conservados.`;
      setMsg(`${partial ? "Importación parcial" : "Importación completa"}: ${summary}${res.failed.length ? ` ${res.failed.length} no se pudieron guardar: ${res.failed.slice(0, 2).join(" · ")}.` : ""}${res.errors.length ? ` Avisos de Meta: ${res.errors.join(" · ")}.` : ""}${partial ? " Lo guardado permanece; vuelve a importar para reintentar los pendientes." : ""}`);
    } catch (e: any) {
      setMsg("No se pudieron importar las métricas: " + (e?.message || e) + ". Lo guardado permanece; vuelve a intentarlo.");
    } finally { setImportProgress(null); setBusy(false); }
  }

  async function disconnect() {
    if (!confirm("¿Desconectar Facebook e Instagram? Las métricas ya importadas se quedan.")) return;
    await fetch("/api/meta/disconnect", { method: "POST" }); await load(); setMsg("Desconectado.");
  }

  const pages = Array.isArray(status?.pages) ? status.pages : [];
  const selected = Array.isArray(status?.selected) ? status.selected : [];
  const selectedPages = pages.filter((p: any) => selected.includes(p.id));
  const visiblePages = showAllAccounts ? selectedPages : selectedPages.slice(0, 3);
  const instagramCount = selectedPages.filter((p: any) => p.ig).length;
  const connectedDate = status?.connectedAt ? new Date(status.connectedAt) : null;
  const connectionDate = connectedDate && !Number.isNaN(connectedDate.getTime())
    ? connectedDate.toLocaleDateString("es-DO", { day: "numeric", month: "short", year: "numeric" }) : null;
  const stateLabel = mode === "cargando" ? "Comprobando" : mode !== "supabase" ? "Sin sesión"
    : !status ? "Comprobando" : status.configured === false ? "Sin configurar"
    : status.error ? "Error de conexión" : !status.connected ? "Sin conexión"
    : !Array.isArray(status.selected) || selectedPages.length === 0 ? "Elegir páginas" : expired ? "Hay que reconectar" : "Conectado";
  const connected = mode === "supabase" && status?.connected && !status?.error && selectedPages.length > 0;
  const healthy = connected && !expired;

  return <section aria-label="Integración de Meta" className="mt-3 rounded-2xl border border-white/10 bg-[#151C2B] p-4 text-sm shadow-[0_16px_40px_-28px_rgba(0,0,0,.9)] sm:p-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-[#598BFF]/15 text-[#9BB8FF]">◎</span>
          <h3 className="font-semibold text-slate-100">Facebook e Instagram</h3>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${healthy ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : expired ? "border-amber-400/30 bg-amber-400/10 text-amber-200" : "border-white/10 bg-white/5 text-slate-300"}`}>
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${healthy ? "bg-emerald-400" : expired ? "bg-amber-400" : "bg-slate-400"}`} />{stateLabel}
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          {connected ? `${selectedPages.length} ${selectedPages.length === 1 ? "página activa" : "páginas activas"} · ${instagramCount} ${instagramCount === 1 ? "cuenta de Instagram vinculada" : "cuentas de Instagram vinculadas"}`
            : mode === "cargando" || (mode === "supabase" && !status) ? "Comprobando el estado de la conexión…"
            : mode !== "supabase" ? "Inicia sesión para conectar tus páginas e importar métricas reales."
            : status.configured === false ? "La app de Meta necesita configuración antes de conectar cuentas."
            : status.error ? "No se pudo confirmar el estado de la conexión."
            : status.connected ? "Elige las páginas que deseas importar." : "Conecta tus cuentas para importar sus métricas."}
        </p>
        {connected && <>
          <div className="mt-3 flex max-w-3xl flex-wrap gap-1.5" aria-label="Páginas y cuentas conectadas">
            {visiblePages.map((page: any) => <div key={page.id} className="contents">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#598BFF]/25 bg-[#598BFF]/10 px-2.5 py-1.5 text-xs text-[#D5E2FF]"><span aria-hidden="true" className="text-[10px] font-black text-[#9BB8FF]">FB</span><span className="min-w-0 break-words">{page.name}</span></span>
              {page.ig && <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-pink-400/25 bg-pink-400/[.08] px-2.5 py-1.5 text-xs text-pink-200"><span aria-hidden="true" className="text-[10px] font-black">IG</span><span className="min-w-0 break-words">@{page.ig}</span></span>}
            </div>)}
            {selectedPages.length > 3 && <button type="button" aria-expanded={showAllAccounts} onClick={() => setShowAllAccounts(!showAllAccounts)} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/5">{showAllAccounts ? "Ver menos" : `+${selectedPages.length - 3} páginas`}</button>}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">{connectionDate ? `Conectado el ${connectionDate} · ` : ""}{lastSync ? `Actualizado ${ago(lastSync)}` : "Aún sin actualizar"} · se actualiza solo cada {META_SYNC_MINUTES} min</p>
        </>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {connected && expired && <a href="/api/meta/connect" className="rounded-xl bg-[#598BFF] px-3.5 py-2 text-xs font-bold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF9F1C]">Reconectar Facebook</a>}
        {connected && <button type="button" disabled={busy} onClick={importNow} className="rounded-xl bg-[#FF9F1C] px-3.5 py-2 text-xs font-bold text-[#090D16] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#598BFF] disabled:opacity-50">{busy ? importProgress ? importProgress.total ? "Guardando…" : "Consultando…" : "Espera…" : "Importar métricas"}</button>}
        {mode === "supabase" && <button type="button" aria-expanded={managing} aria-controls="meta-connection-management" onClick={() => { setManaging(!managing); if (managing) setPicking(false); }} className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#598BFF]">Gestionar conexiones</button>}
        {mode === "local" && <a href="/login" className="rounded-xl bg-[#FF9F1C] px-3.5 py-2 text-xs font-bold text-[#090D16] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#598BFF]">Iniciar sesión</a>}
      </div>
    </div>
    {importProgress && <div className="mt-4 rounded-xl border border-[#598BFF]/20 bg-[#598BFF]/[.06] p-3" role="status" aria-live="polite">
      <p className="text-xs font-semibold text-[#D5E2FF]">{importProgress.total ? `Reels procesados: ${importProgress.done} de ${importProgress.total}` : "Consultando Reels en Meta…"}</p>
      {importProgress.total > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Progreso de importación" aria-valuenow={importProgress.done} aria-valuemin={0} aria-valuemax={importProgress.total}><div className="h-full rounded-full bg-[#FF9F1C] transition-[width]" style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }} /></div>}
    </div>}

    {managing && mode === "supabase" && <div id="meta-connection-management" className="mt-4 border-t border-white/10 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        {status?.connected && !picking && <button type="button" onClick={() => setPicking(true)} className="rounded-lg border border-[#598BFF]/40 bg-[#598BFF]/10 px-3 py-2 text-xs font-semibold text-[#B3C9FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#598BFF]">Elegir páginas</button>}
        {status?.configured !== false && <a href="/api/meta/connect" className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#598BFF]">{status?.connected ? "Reconectar" : "Conectar Facebook e Instagram"}</a>}
        {status?.connected && <button type="button" onClick={disconnect} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#598BFF]">Desconectar</button>}
      </div>
      {status?.connected && (picking || !Array.isArray(status.selected)) && <div className="mt-3 rounded-xl border border-[#598BFF]/25 bg-[#090D16]/40 p-3">
      <p className="font-bold">¿Qué páginas quieres ver?</p>
      <p className="mt-1 text-xs text-slate-300">Solo se importarán las que marques. Si quitas una, se borran sus métricas ya importadas.</p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {pages.map((p: any) => <label key={p.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-white/5">
          <input type="checkbox" className="w-auto" checked={checked.includes(p.id)} onChange={e => setChecked(e.target.checked ? [...checked, p.id] : checked.filter(x => x !== p.id))} />
          <span>{p.name}{p.ig ? <span className="text-pink-300"> + Instagram @{p.ig}</span> : <span className="text-xs text-slate-500"> · sin Instagram vinculado</span>}</span>
        </label>)}
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={saveSelection} className="rounded-lg bg-[#598BFF] px-3 py-2 text-xs font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF9F1C]">{busy ? "Guardando…" : `Guardar (${checked.length})`}</button>
        {Array.isArray(status.selected) && <button type="button" onClick={() => { setPicking(false); setChecked(status.selected); }} className="rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Cancelar</button>}
      </div>
      </div>}
      {status?.configured === false && <p className="mt-3 text-xs text-slate-300">Falta configurar la app de Meta (META_APP_ID y META_APP_SECRET en Vercel).</p>}
      {status?.connected && selected.length > 0 && instagramCount === 0 && <p className="mt-3 text-xs text-amber-200">Ninguna de las páginas elegidas tiene Instagram vinculado: la cuenta debe ser profesional y estar vinculada a una página de Facebook.</p>}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Importa los últimos 25 Reels de cada página e Instagram; mientras la app está abierta, los 8 más recientes se actualizan solos cada 5 minutos. Meta puede tardar hasta 48 h en dar las cifras. Para enlazar un Reel con su episodio, pon el título del episodio o la primera línea del gancho en la descripción.</p>
    </div>}
    {status?.error && <p role="alert" className="mt-3 text-xs text-rose-300">{status.error}</p>}
    {msg && <p role="status" aria-live="polite" className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-slate-200">{msg}</p>}
  </section>;
}
