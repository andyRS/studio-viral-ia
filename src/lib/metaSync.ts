// Importación de métricas de Meta (Facebook e Instagram) en la base de datos de la app. La usan el botón
// «Importar métricas» (completa: últimos 25 Reels) y la actualización automática cada 5 minutos (rápida:
// últimos 8 Reels, que son los que cambian; solo se guardan los que cambiaron).
import { hookText } from "./hooks";
import type { Metric } from "./types";

const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

// Busca el episodio de la app al que pertenece un Reel por su texto (título o gancho en la descripción).
export function matchEpisode(caption: string, episodes: any[]) {
  const c = norm(caption);
  if (!c) return null;
  return episodes.find(e => {
    const t = norm(e.title); const h = norm(hookText(e.output?.hook).split(" / ")[0]);
    return (t.length >= 6 && !/^episodio \d+$/.test(t) && c.includes(t)) || (h.length >= 12 && c.includes(h));
  }) || null;
}

export const META_SYNC_EVENT = "estudio-viral:meta-sync";
export const META_SYNC_KEY = "estudio-viral:metaSyncAt";
export const META_SYNC_MINUTES = 5;
let running = false;

type Ops = { data: any; insert: (c: any, item: any) => Promise<any>; update: (c: any, id: string, patch: any) => Promise<any> };
export type SyncResult = { added: number; updated: number; unchanged: number; linked: number; preserved: number; failed: string[]; errors: string[]; total: number; skipped?: boolean; error?: string; expired?: boolean };

export async function syncMetaMetrics({ data, insert, update }: Ops, opts: { quick?: boolean; onProgress?: (done: number, total: number) => void } = {}): Promise<SyncResult> {
  const res: SyncResult = { added: 0, updated: 0, unchanged: 0, linked: 0, preserved: 0, failed: [], errors: [], total: 0 };
  if (running) return { ...res, skipped: true };
  running = true;
  try {
    const r = await fetch(`/api/meta/import${opts.quick ? "?rapida=1" : ""}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) return { ...res, error: j.error || `HTTP ${r.status}` };
    if (j.expired) {
      try { window.dispatchEvent(new CustomEvent(META_SYNC_EVENT, { detail: { ...res, expired: true } })); } catch {}
      return { ...res, expired: true, error: "Facebook cerró la conexión de la app (cambio de contraseña o revisión de seguridad). Pulsa «Reconectar»." };
    }
    const incoming = Array.isArray(j.metrics) ? j.metrics : [];
    res.total = incoming.length; res.errors = Array.isArray(j.errors) ? j.errors : [];
    const byExternalId = new Map<string, Metric>(data.metrics.filter((m: Metric) => m.externalId).map((m: Metric) => [m.externalId!, m]));
    for (let index = 0; index < incoming.length; index++) {
      const m = incoming[index];
      opts.onProgress?.(index, incoming.length);
      if (!m.externalId) { res.failed.push(`${m.platform || "Reel"} ${m.date || "sin fecha"}: falta ID externo`); continue; }
      const prev = byExternalId.get(m.externalId);
      // Sin cambios en las cifras: no se reescribe (la actualización automática no llena la base de escrituras).
      if (prev && opts.quick && ["views", "avgWatch", "interactions", "followers", "shares", "saves", "reach", "skipRate"].every(k => Number((prev as any)[k] ?? 0) === Number(m[k] ?? 0))) { res.unchanged++; continue; }
      const ep = matchEpisode(m.caption, data.episodes);
      const manualEpisode = !ep && prev?.episodeId ? data.episodes.find((e: any) => e.id === prev.episodeId) : null;
      const episodeId = ep?.id || prev?.episodeId;
      const episodeTitle = ep?.title || manualEpisode?.title || prev?.episodeTitle
        || (Array.from(String(m.caption || "").split("\n")[0]).slice(0, 80).join("").trim() || `Reel ${m.date}`);
      const row = {
        externalId: m.externalId, permalink: m.permalink, platform: m.platform, date: m.date, accountName: m.account, thumb: m.thumb,
        capturedAt: new Date().toISOString(),
        views: m.views, avgWatch: m.avgWatch, interactions: m.interactions, followers: m.followers, duration: m.duration || ep?.duration || prev?.duration || 0,
        shares: m.shares, saves: m.saves, skipRate: m.skipRate, reach: m.reach,
        episodeId, episodeTitle,
        hook: ep ? hookText(ep.output?.hook) : prev?.hook || "", formula: prev?.formula || "",
      };
      try {
        if (prev) { const saved = await update("metrics", prev.id, { ...prev, ...row }); byExternalId.set(m.externalId, saved); res.updated++; }
        else { const saved = await insert("metrics", row); byExternalId.set(m.externalId, saved); res.added++; }
        if (ep) res.linked++; else if (episodeId) res.preserved++;
      } catch (e: any) { res.failed.push(`${m.platform} ${m.date}: ${e?.message || e}`); }
    }
    opts.onProgress?.(incoming.length, incoming.length);
    try { localStorage.setItem(META_SYNC_KEY, new Date().toISOString()); } catch {}
    try { window.dispatchEvent(new CustomEvent(META_SYNC_EVENT, { detail: res })); } catch {}
    return res;
  } finally { running = false; }
}
