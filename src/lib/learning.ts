import type { Metric } from "./types";

// Aprendizaje desde Métricas: resume qué ganchos, fórmulas y duraciones rindieron más
// para pasárselo a la IA en el siguiente guion. Sin llamadas externas.

const MIN_METRICS = 2;

// Puntuación comparable entre plataformas: vistas, con un bonus por la métrica de
// retención propia de cada plataforma (cada una se juzga con SUS métricas 4B).
function score(m: Metric): number {
  const views = m.views || 0;
  const quality =
    m.platform === "TikTok" ? (m.completion || 0)
    : m.platform === "YouTube Shorts" ? (m.retention || m.viewedVsSwiped || 0)
    : m.platform === "Instagram" ? (views ? (((m.shares || 0) + (m.saves || 0)) / views) * 100 : 0)
    : (m.avgWatch || 0);
  return views * (1 + Math.min(quality, 100) / 100);
}

function groupBest(items: Metric[], key: (m: Metric) => string | undefined, limit: number) {
  const g = new Map<string, { sum: number; n: number; views: number }>();
  for (const m of items) {
    const k = key(m)?.trim();
    if (!k) continue;
    const cur = g.get(k) || { sum: 0, n: 0, views: 0 };
    cur.sum += score(m); cur.n += 1; cur.views += m.views || 0;
    g.set(k, cur);
  }
  return Array.from(g.entries())
    .map(([k, v]) => ({ k, avg: v.sum / v.n, n: v.n, avgViews: Math.round(v.views / v.n) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, limit);
}

const bucket = (d: number) => (d <= 45 ? "30-45s" : d <= 75 ? "46-75s" : d <= 105 ? "76-105s" : "más de 105s");

export interface Learnings { text: string; hooks: string[]; formulas: string[]; durations: string[]; worst: string[] }

export function learnFromMetrics(metrics: Metric[] | undefined | null): Learnings | null {
  const items = (metrics || []).filter(m => (m.views || 0) > 0);
  if (items.length < MIN_METRICS) return null;
  const hooks = groupBest(items, m => m.hook, 3);
  const formulas = groupBest(items, m => m.formula, 2);
  const durations = groupBest(items, m => (m.duration ? bucket(m.duration) : undefined), 1);
  const platforms = groupBest(items, m => m.platform, 4);
  const ranked = [...items].filter(m => m.hook).sort((a, b) => score(a) - score(b));
  const worst = ranked.slice(0, 2).map(m => m.hook);

  const hookLines = hooks.map(h => `"${h.k}" (≈${h.avgViews.toLocaleString()} vistas de media, ${h.n} uso${h.n > 1 ? "s" : ""})`);
  const formulaLines = formulas.map(f => `${f.k} (≈${f.avgViews.toLocaleString()} vistas)`);
  const durationLines = durations.map(d => d.k);
  const lines = [
    hookLines.length ? `Ganchos que mejor rindieron: ${hookLines.join("; ")}.` : "",
    formulaLines.length ? `Fórmulas ganadoras: ${formulaLines.join("; ")}.` : "",
    durationLines.length ? `Duración con mejor resultado: ${durationLines.join(", ")}.` : "",
    platforms.length ? `Plataforma con mejor resultado: ${platforms[0].k}.` : "",
    worst.length ? `Ganchos que rindieron peor (evita su estilo): ${worst.map(w => `"${w}"`).join("; ")}.` : "",
  ].filter(Boolean);
  return {
    text: `APRENDIZAJE DE MÉTRICAS REALES (${items.length} videos publicados). Imita la estructura y el tono de lo que funcionó, sin copiar el texto literal:\n- ${lines.join("\n- ")}`,
    hooks: hooks.map(h => h.k), formulas: formulas.map(f => f.k), durations: durationLines, worst,
  };
}
