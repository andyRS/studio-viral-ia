// Fase 5 · Del proyecto largo al montaje y a las redes: guion.json de cada acto para el montaje del PC
// (16:9, clips verticales para TikTok y Reels), capítulos de YouTube, evaluación narrativa y plan de publicación.
import { NARRATOR_COLOR } from "./knowledge";
import { timeJump } from "./production";
import { allScenes, type Outline, type OutlineScene } from "./outline";
import { duracionClip, perfilActivo, type Toma } from "./tomas";

export type Distribucion = {
  at: string;
  titulos: string[]; descripcion: string; etiquetas: string[];
  miniaturas: { concepto: string; texto: string }[];
  trailer: { sceneIds: string[]; texto: string };
  clips: { sceneId: string; titulo: string; texto: string; hashtags: string }[];
  cta: string;
  plan: { dia: number; red: string; pieza: string }[];
};
export const CRITERIOS = [
  ["titulo", "Curiosidad del título"], ["gancho", "Fuerza del gancho inicial"], ["premisa", "Claridad de la premisa"], ["conflicto", "Intensidad del conflicto"],
  ["empatia", "Empatía con el protagonista"], ["progresion", "Progresión dramática"], ["originalidad", "Originalidad"], ["ritmo", "Ritmo"],
  ["final", "Impacto emocional del final"], ["conversacion", "Potencial de comentarios y compartidos"],
] as const;
export type Evaluacion = { at: string; criterios: { id: string; nota: number; porque: string; mejora: string }[]; resumen: string };
export const notaMedia = (e?: Evaluacion) => e?.criterios.length ? Math.round(e.criterios.reduce((a, c) => a + c.nota, 0) / e.criterios.length) : null;

const hex = (c?: string) => String(c || "").replace("#", "").toUpperCase().slice(0, 6) || "FFFFFF";
const corto = (t: string, n = 70) => { const x = String(t || "").split(/(?<=[.!?])\s/)[0].trim(); return x.length > n ? x.slice(0, n - 1).trimEnd() + "…" : x; };

// Tomas del acto en orden, con su escena.
export function tomasDelActo(o: Outline, actIndex: number) {
  const act = o.acts[actIndex];
  const out: { toma: Toma; escena: OutlineScene }[] = [];
  const sinTomas: OutlineScene[] = [];
  for (const seq of act?.sequences || []) for (const sc of seq.scenes) {
    if (!sc.tomas?.length) sinTomas.push(sc);
    for (const t of sc.tomas || []) out.push({ toma: t, escena: sc });
  }
  return { lista: out, sinTomas };
}

// guion.json de un acto, en el formato de montaje/subtitular.py. Los actos se montan por separado
// (hasta 80 tomas) y luego se unen; por eso el gancho va solo en el primero y «FIN» solo en el último.
export function guionDeActo(o: Outline, actIndex: number, opts: { titulo: string; characters: any[]; gancho?: string[]; cierre?: string; recortes?: boolean; titulosClips?: Record<string, string> }) {
  const { lista } = tomasDelActo(o, actIndex);
  const colores: Record<string, string> = { NARRADOR: NARRATOR_COLOR };
  for (const c of opts.characters) if (c?.name) colores[String(c.name).toUpperCase()] = hex(c.subtitleColor);
  const clips = lista.map(({ toma }) => toma.dialogo ? [[toma.dialogo.speaker.toUpperCase(), toma.dialogo.text]] : []);
  for (const b of clips) for (const [spk] of b) if (!colores[spk]) colores[spk] = "FFFFFF";
  // Saltos de tiempo entre escenas («Días después...») como tarjeta antes de la primera toma de la escena.
  const tarjetas: { antes: number; texto: string }[] = [];
  lista.forEach(({ escena }, i) => {
    if (i === 0 || lista[i - 1].escena.id === escena.id) return;
    const t = timeJump(`${escena.heading} ${escena.summary}`);
    if (t) tarjetas.push({ antes: i, texto: t });
  });
  // Clips verticales: las escenas de más tensión del acto (hasta 60 s cada una).
  const p = perfilActivo(o);
  const recortes: { desde: number; hasta: number; titulo: string }[] = [];
  if (opts.recortes !== false) {
    const porEscena = new Map<string, number[]>();
    lista.forEach(({ escena }, i) => porEscena.set(escena.id, [...(porEscena.get(escena.id) || []), i]));
    const fuertes = Array.from(new Set(lista.map(x => x.escena))).filter(e => e.tension >= 7).sort((a, b) => b.tension - a.tension).slice(0, 4);
    for (const e of fuertes) {
      const idx = porEscena.get(e.id) || []; if (!idx.length) continue;
      let seg = 0, hasta = idx[0];
      for (const i of idx) { seg += duracionClip(lista[i].toma.duracion, p); if (seg > 60) break; hasta = i; }
      recortes.push({ desde: idx[0], hasta, titulo: opts.titulosClips?.[e.id] || corto(e.summary) });
    }
    recortes.sort((a, b) => a.desde - b.desde);
  }
  const ultimo = actIndex === o.acts.length - 1;
  return {
    formato: "16:9", titulo: opts.titulo, colores, clips,
    ...(actIndex === 0 && opts.gancho?.filter(Boolean).length ? { gancho: opts.gancho.filter(Boolean).slice(0, 2) } : {}),
    ...(ultimo ? { cierre: opts.cierre || "FIN" } : {}),
    ...(tarjetas.length ? { tarjetas } : {}),
    ...(recortes.length ? { recortes } : {}),
  };
}

// Capítulos de YouTube (uno por secuencia) con los tiempos de las tomas. Aproximados hasta el montaje real
// (el montaje recorta pausas), y YouTube exige que el primero sea 0:00.
export function capitulos(o: Outline) {
  const p = perfilActivo(o);
  const mmss = (s: number) => `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const out: string[] = []; let t = 0;
  for (const a of o.acts) for (const seq of a.sequences) {
    out.push(`${mmss(t)} ${seq.title.replace(/^Secuencia\s*·?\s*/i, "")}`);
    for (const sc of seq.scenes) t += sc.tomas?.length ? sc.tomas.reduce((x, tm) => x + duracionClip(tm.duracion, p), 0) : sc.minutes * 60;
  }
  return out;
}

export const escenaPorId = (o: Outline, id: string) => allScenes(o).find(s => s.id === id);
