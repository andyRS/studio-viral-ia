import type { Episode, Metric } from "./types";

export interface PartSignal { part: number; views: number; ageDays: number | null }
export interface SeriesSignal { platform: string; parts: PartSignal[]; suggestFreshStart: boolean; comparable: boolean }

// Solo se comparan publicaciones vinculadas a episodios y dentro de una misma plataforma.
// El consejo requiere snapshots tomados a edades parecidas; unas vistas acumuladas durante
// meses no son una comparación justa con una Parte recién publicada.
export function seriesSignals(episodes: Episode[], metrics: Metric[]): SeriesSignal[] {
  const accountKey = (metric: Metric) => metric.accountId || metric.accountName || "sin-cuenta";
  const groups = Array.from(new Map(metrics.filter(m => episodes.some(e => e.id === m.episodeId) && m.platform).map(m => [`${m.platform}|${accountKey(m)}`, { platform: m.platform, account: accountKey(m), accountName: m.accountName || "" }])).values());
  return groups.map(group => {
    const parts = episodes.flatMap((episode, index) => {
      const candidates = metrics.filter(m => m.episodeId === episode.id && m.platform === group.platform && accountKey(m) === group.account && Number.isFinite(m.views));
      const metric = candidates.sort((a, b) => String(b.capturedAt || b.date).localeCompare(String(a.capturedAt || a.date)))[0];
      if (!metric) return [];
      const published = Date.parse(metric.date);
      const captured = Date.parse(metric.capturedAt || "");
      const ageDays = Number.isFinite(published) && Number.isFinite(captured) ? Math.floor((captured - published) / 86400000) : null;
      return [{ part: episode.output?.partNumber || index + 1, views: metric.views, ageDays }];
    });
    const recent = parts.slice(-3);
    const ages = recent.map(p => p.ageDays);
    const comparable = recent.length === 3 && ages.every((age): age is number => age !== null && age >= 3) && Math.max(...ages as number[]) - Math.min(...ages as number[]) <= 2;
    const suggestFreshStart = comparable && recent.every((p, i) => i === 0 || p.views < recent[i - 1].views) && recent[0].views > 0 && recent[2].views / recent[0].views < 0.3;
    const label = group.accountName || (group.account === "sin-cuenta" ? "" : `Cuenta ${group.account.slice(0, 6)}`);
    return { platform: label ? `${group.platform} · ${label}` : group.platform, parts, comparable, suggestFreshStart };
  }).filter(signal => signal.parts.length >= 2);
}
