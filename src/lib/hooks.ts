import type { Metric } from "./types";

// Banco de ganchos: cada gancho usado (de los episodios guardados y de las métricas
// registradas) con sus resultados. Se deriva de los datos existentes: sin tablas nuevas.

export interface BankHook { hook: string; source: string; views: number; uses: number; platforms: string[] }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const hookText = (h: any): string => (Array.isArray(h) ? h.filter(Boolean).join(" / ") : String(h || "")).trim();

export function buildHookBank(episodes: any[], metrics: Metric[]): BankHook[] {
  const bank = new Map<string, BankHook>();
  const add = (hook: string, source: string) => {
    const k = norm(hook);
    if (!k) return null;
    if (!bank.has(k)) bank.set(k, { hook, source, views: 0, uses: 0, platforms: [] });
    return bank.get(k)!;
  };
  const byEpisode = new Map<string, BankHook>();
  for (const e of episodes || []) {
    const h = add(hookText(e.output?.hook), e.title || "Episodio");
    if (!h) continue;
    h.uses += 1;
    if (e.id) byEpisode.set(e.id, h);
    if (e.title) byEpisode.set(norm(e.title), h);
  }
  for (const m of metrics || []) {
    const h = (m.episodeId && byEpisode.get(m.episodeId)) || byEpisode.get(norm(m.episodeTitle || "")) || add(m.hook || "", m.episodeTitle || "Métrica");
    if (!h) continue;
    h.views += m.views || 0;
    if (m.platform && !h.platforms.includes(m.platform)) h.platforms.push(m.platform);
  }
  return Array.from(bank.values()).sort((a, b) => b.views - a.views || b.uses - a.uses);
}

export interface HookVariant { lines: string[]; why: string }

// Plantilla local (sin IA) para cuando no hay sesión o no hay clave.
export function templateHookVariants(input: any): HookVariant[] {
  const who = input.characters?.[0]?.name || "Ella";
  const idea = String(input.idea || input.wish || input.series?.title || "la historia").slice(0, 70);
  return [
    { lines: [`¡${who} descubre la traición frente a todos!`, "Y nadie esperaba lo que pasó después..."], why: "Conflicto público en el segundo 0." },
    { lines: ["Él la humilló por ser pobre…", "sin saber quién era ella en realidad."], why: "Ironía dramática: el público sabe más que el personaje." },
    { lines: ["Una prueba de embarazo lo cambió todo.", "Pero no era de quien todos pensaban."], why: "Revelación mediante un objeto." },
    { lines: ["Tenía 24 horas para decir la verdad.", "Y eligió mentir."], why: "Bomba de tiempo." },
    { lines: [`${idea}…`, "¿Tú qué hubieras hecho?"], why: "Pregunta directa que dispara comentarios." },
  ];
}
