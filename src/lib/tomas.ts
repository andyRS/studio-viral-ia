// Fase 4 · Producción del proyecto largo: tomas por escena (Scene Director), perfiles de motores de vídeo
// (Prompt Engine), prompts por toma y plan de producción con las tarifas que pone el usuario (nunca inventadas).
// Todo se guarda dentro del proyecto (story_outlines.data): escena.tomas y outline.produccion.
import { BIBLE_GUARD_EN, BIBLE_VIDEO_END, CHRISTIAN_SCENE_GUARD, EPIC_GUARD_EN, STYLES, type StyleKey } from "./knowledge";
import { allScenes, escenarioTexto, newId, type Escenario, type Outline, type OutlineScene, type ScriptElement } from "./outline";
import { normBible } from "./personajes";

export const ESTADOS = ["pendiente", "imagen", "video", "revision", "aprobado", "exportado"] as const;
export type Estado = typeof ESTADOS[number];
export const ESTADO_LABEL: Record<Estado, string> = { pendiente: "Pendiente", imagen: "Imagen aprobada", video: "Vídeo generado", revision: "En revisión", aprobado: "Aprobado", exportado: "Exportado" };

export type Toma = {
  id: string; personajes: string[]; accion: string; plano: string; lente: string; movimiento: string; composicion: string;
  luz: string; vfx: string; expresion: string; dialogo?: { speaker: string; text: string }; sonido: string; musica: string;
  duracion: number; frameInicial: string; frameFinal: string; transicion: string;
  estado: Estado; locked?: boolean; imagen?: string; nota?: string; intentos?: number;
};

export type PerfilModelo = {
  id: string; nombre: string; proveedor: string;
  duraciones: number[];          // segundos que admite por clip
  formatos: string[];            // "16:9", "9:16"
  resoluciones: string[];
  referencias: boolean;          // admite imágenes de referencia (personaje, escenario)
  primerUltimo: boolean;         // admite fotograma inicial y final
  audio: boolean;                // genera voz y sonido dentro del clip
  camara: string;                // qué movimientos entiende bien
  restricciones: string;         // reglas del proveedor para el prompt
  prefijo?: string; sufijo?: string;
  // Tarifas: siempre las pone el usuario. null = sin tarifa (el plan lo dice en vez de inventar un número).
  creditosSegundo: number | null; creditosImagen: number | null; usdCredito: number | null;
  reintentos: number;            // generaciones medias por toma (estimación del usuario)
};

const P = (p: Omit<PerfilModelo, "creditosSegundo" | "creditosImagen" | "usdCredito" | "reintentos">): PerfilModelo =>
  ({ creditosSegundo: null, creditosImagen: null, usdCredito: null, reintentos: 1.5, ...p });
// Capacidades orientativas: cada proveedor cambia a menudo, por eso todo es editable en «Plan y costos».
export const PERFILES_BASE: PerfilModelo[] = [
  P({ id: "flow", nombre: "Google Flow (Veo)", proveedor: "Google", duraciones: [8], formatos: ["16:9", "9:16"], resoluciones: ["720p", "1080p"], referencias: true, primerUltimo: true, audio: true, camara: "planos, travellings, drones y paneos descritos en texto", restricciones: "Una acción principal por clip; diálogo corto entre comillas" }),
  P({ id: "seedance", nombre: "Seedance 2.5", proveedor: "ByteDance", duraciones: [5, 8, 10], formatos: ["16:9", "9:16"], resoluciones: ["480p", "720p", "1080p"], referencias: true, primerUltimo: true, audio: true, camara: "movimientos de cámara descritos en texto", restricciones: "Un solo personaje habla por clip", prefijo: "Usa Seedance 2.5.", sufijo: BIBLE_VIDEO_END }),
  P({ id: "kling", nombre: "Kling", proveedor: "Kuaishou", duraciones: [5, 10], formatos: ["16:9", "9:16", "1:1"], resoluciones: ["720p", "1080p"], referencias: true, primerUltimo: true, audio: false, camara: "movimientos de cámara descritos en texto", restricciones: "Sin diálogo dentro del clip: la voz va aparte" }),
  P({ id: "runway", nombre: "Runway", proveedor: "Runway", duraciones: [5, 10], formatos: ["16:9", "9:16"], resoluciones: ["720p"], referencias: true, primerUltimo: false, audio: false, camara: "movimientos de cámara descritos en texto", restricciones: "Parte de una imagen inicial; sin diálogo dentro del clip" }),
  P({ id: "pavo", nombre: "PAVO AI", proveedor: "PAVO", duraciones: [5, 8], formatos: ["16:9", "9:16"], resoluciones: ["720p"], referencias: true, primerUltimo: false, audio: false, camara: "descrita en texto", restricciones: "Confirma sus capacidades y edítalas aquí" }),
  P({ id: "higgsfield", nombre: "Higgsfield", proveedor: "Higgsfield", duraciones: [5, 10], formatos: ["16:9", "9:16"], resoluciones: ["720p", "1080p"], referencias: true, primerUltimo: true, audio: false, camara: "presets de cámara de la plataforma (o descritos en texto)", restricciones: "Reúne varios modelos: ajusta el perfil al modelo que uses" }),
];

export type Produccion = { perfilId: string; perfiles: PerfilModelo[]; formato: string };
export const produccionDe = (o: Outline): Produccion => {
  const p = (o as any).produccion as Produccion | undefined;
  return { perfilId: p?.perfilId || "flow", perfiles: p?.perfiles?.length ? p.perfiles : PERFILES_BASE, formato: p?.formato || "16:9" };
};
export const perfilActivo = (o: Outline) => { const p = produccionDe(o); return p.perfiles.find(x => x.id === p.perfilId) || p.perfiles[0]; };
export const maxSeg = (p: PerfilModelo) => Math.max(...(p.duraciones.length ? p.duraciones : [8]));
// Duración que se pide al motor: la menor admitida que cubre la toma (o la máxima si no cabe).
export const duracionClip = (d: number, p: PerfilModelo) => [...p.duraciones].sort((a, b) => a - b).find(x => x >= d) ?? maxSeg(p);

// ---------- Normalizar tomas ----------
const s = (v: unknown, n = 400) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const fin = (t: string) => t.replace(/[.\s]+$/, "");
export function normToma(r: any, max = 10): Toma {
  const d = Number(r?.duracion ?? r?.duration);
  const dl = r?.dialogo && s(r.dialogo.text) ? { speaker: s(r.dialogo.speaker, 60) || "Narrador", text: s(r.dialogo.text, 300) } : undefined;
  return {
    id: newId("toma"), personajes: (Array.isArray(r?.personajes) ? r.personajes : []).map((x: any) => s(x, 60)).filter(Boolean).slice(0, 6),
    accion: s(r?.accion), plano: s(r?.plano, 80), lente: s(r?.lente, 80), movimiento: s(r?.movimiento, 120), composicion: s(r?.composicion, 160),
    luz: s(r?.luz, 160), vfx: s(r?.vfx, 200), expresion: s(r?.expresion, 200), ...(dl ? { dialogo: dl } : {}), sonido: s(r?.sonido, 200), musica: s(r?.musica, 120),
    duracion: Number.isFinite(d) && d > 0 ? Math.min(Math.round(d * 2) / 2, max * 2) : Math.min(5, max),
    frameInicial: s(r?.frameInicial, 240), frameFinal: s(r?.frameFinal, 240), transicion: s(r?.transicion, 80) || "corte", estado: "pendiente",
  };
}

// División sin IA: una toma por frase dicha; la acción seguida se agrupa hasta llenar el clip más largo del motor.
const segundosDeFrase = (t: string) => Math.max(2, Math.round((t.split(/\s+/).filter(Boolean).length / 2.6 + 1) * 2) / 2);
function trozos(texto: string, max: number): string[] {
  if (segundosDeFrase(texto) <= max) return [texto];
  const palabras = texto.split(/\s+/);
  const out: string[] = []; let cur: string[] = [];
  for (const w of palabras) {
    if (cur.length && segundosDeFrase([...cur, w].join(" ")) > max) { out.push(cur.join(" ")); cur = []; }
    cur.push(w);
    // corta en una coma si el trozo ya va por la mitad del clip
    if (/[,;:]$/.test(w) && segundosDeFrase(cur.join(" ")) >= max / 2) { out.push(cur.join(" ")); cur = []; }
  }
  if (cur.length) out.push(cur.join(" "));
  return out;
}
export function dividirEscena(sc: OutlineScene, perfil: PerfilModelo): Toma[] {
  const max = maxSeg(perfil);
  const els: ScriptElement[] = sc.script || [];
  if (!els.length) {
    const n = Math.max(1, Math.ceil((sc.minutes * 60) / max));
    return Array.from({ length: n }, (_, i) => normToma({ accion: i === 0 ? sc.summary : `${sc.summary} (continuación ${i + 1})`, duracion: max, plano: i === 0 ? "plano general de situación" : "plano medio" }, max));
  }
  const out: Toma[] = [];
  let actual: Toma | null = null;
  let sonido = "";
  for (const e of els) {
    if (e.type === "sonido") { sonido = [sonido, e.text].filter(Boolean).join("; "); if (actual) actual.sonido = [actual.sonido, e.text].filter(Boolean).join("; "); continue; }
    if (e.type === "nota") { if (actual) actual.nota = [actual.nota, e.text].filter(Boolean).join("; "); continue; }
    if (e.type === "dialogo" || e.type === "off") {
      // Una frase que no cabe en un clip se parte en trozos (por comas o por palabras), cada uno en su toma.
      trozos(e.text, max).forEach((trozo, k) => {
        const t = normToma({ accion: e.type === "off" ? `Imagen que acompaña la narración: ${trozo}` : `${e.speaker} habla${k ? " (sigue)" : ""}`, dialogo: { speaker: e.speaker, text: trozo }, personajes: e.type === "dialogo" ? [e.speaker] : [], plano: e.type === "dialogo" ? (k ? "plano medio" : "primer plano") : "plano general", duracion: Math.min(segundosDeFrase(trozo), max), sonido, ...(k ? { frameInicial: "el último fotograma de la toma anterior" } : {}) }, max);
        out.push(t); actual = t; sonido = "";
      });
      continue;
    }
    // acción o indicación visual: se suma a la toma muda en curso si cabe
    if (actual && !actual.dialogo && actual.duracion + 3 <= max) { actual.accion = `${actual.accion}. ${e.text}`; actual.duracion += 3; if (e.type === "visual") actual.movimiento = [actual.movimiento, e.text].filter(Boolean).join("; "); continue; }
    actual = normToma({ accion: e.text, duracion: 4, plano: out.length ? "plano medio" : "plano general de situación", movimiento: e.type === "visual" ? e.text : "", sonido }, max);
    out.push(actual); sonido = "";
  }
  return out;
}
// Parte una toma demasiado larga para el motor en dos (misma acción, continuidad de fotogramas).
export function partirToma(t: Toma): [Toma, Toma] {
  const a = { ...t, id: newId("toma"), duracion: Math.ceil(t.duracion / 2), frameFinal: "" };
  const b = { ...t, id: newId("toma"), duracion: Math.floor(t.duracion / 2) || 1, frameInicial: "el último fotograma de la toma anterior", dialogo: undefined, accion: `${t.accion} (continúa)` };
  return [a, b];
}

// ---------- Prompts por toma (sin IA: siempre cumplen las reglas del motor) ----------
export type Contexto = { style: StyleKey; formato: string; escenario?: Escenario; personajes: any[] };
const guardia = (style: StyleKey) => style === "epica" ? EPIC_GUARD_EN : (style === "biblica" || style === "cristiana") ? `${BIBLE_GUARD_EN}. ${CHRISTIAN_SCENE_GUARD}` : "";
const look = (style: StyleKey, formato: string) => String(STYLES[style]?.visual || "").replace(/vertical 9:16/gi, formato === "9:16" ? "vertical 9:16" : `horizontal ${formato}`);
function fichas(t: Toma, ctx: Contexto) {
  const nombres = new Set([...t.personajes, t.dialogo?.speaker].filter(Boolean).map(n => String(n).toLowerCase()));
  // También los que la acción nombra («Daniel se arrodilla…») aunque no estén en la lista de la toma.
  const L = "a-záéíóúñü";
  const enAccion = (n: string) => new RegExp(`(^|[^${L}])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^${L}]|$)`).test(`${t.accion} ${t.frameInicial}`.toLowerCase());
  return ctx.personajes.filter(c => c?.name && (nombres.has(String(c.name).toLowerCase()) || enAccion(String(c.name)))).filter(c => !(t.dialogo && /^narrador$/i.test(c.name))).map(c => {
    const b = normBible(c.bible);
    return [`${c.name}: ${b.rasgos || c.visualES || ""}`, c.clothing && `vestuario: ${c.clothing}`, b.paleta && `paleta: ${b.paleta}`, b.negativo && `nunca: ${b.negativo}`, b.candado ? "mismo rostro exacto que su referencia" : ""].filter(Boolean).join(", ");
  });
}
export function promptsDeToma(t: Toma, p: PerfilModelo, ctx: Contexto) {
  const clip = duracionClip(t.duracion, p);
  const pj = fichas(t, ctx);
  const lugar = ctx.escenario ? `ESCENARIO: ${escenarioTexto(ctx.escenario)}.` : "";
  const camara = [t.plano, t.lente && `lente ${t.lente}`, t.movimiento && `cámara: ${t.movimiento}`, t.composicion && `composición: ${t.composicion}`].filter(Boolean).join(", ");
  const g = guardia(ctx.style);
  const refs = p.referencias && (pj.length || ctx.escenario?.imagenes.length) ? `REFERENCIAS: usa las imágenes de referencia de ${[...t.personajes, ctx.escenario?.imagenes.length ? `el escenario «${ctx.escenario.nombre}»` : ""].filter(Boolean).join(" y ")} para mantener rostro, vestuario y decorado.` : "";
  const voz = (n: string) => { const c = ctx.personajes.find(x => String(x.name).toLowerCase() === n.toLowerCase()); return normBible(c?.bible).voz || c?.speechStyle || "español latino neutro"; };
  const habla = t.dialogo
    ? p.audio ? `DIÁLOGO (español latino neutro, cada palabra completa): ${t.dialogo.speaker} dice: «${t.dialogo.text}». Voz: ${voz(t.dialogo.speaker)}. Solo habla ${t.dialogo.speaker}.`
      : `SIN AUDIO: ${t.dialogo.speaker} habla con movimiento natural de labios; la voz se añade en la edición.`
    : p.audio ? "Sin diálogo." : "";
  const sonido = p.audio ? `SONIDO: ${t.sonido || "ambiente del lugar continuo"}; sin música (va en la edición).` : "";
  const frames = p.primerUltimo ? [t.frameInicial && `PRIMER FOTOGRAMA: ${fin(t.frameInicial)}.`, t.frameFinal && `ÚLTIMO FOTOGRAMA: ${fin(t.frameFinal)}.`].filter(Boolean).join(" ") : "";
  const video = [p.prefijo, `Clip de ${clip} s, ${ctx.formato}.`, look(ctx.style, ctx.formato), lugar, pj.length ? `PERSONAJES: ${pj.join(" | ")}.` : "Nadie más en cuadro.", `ACCIÓN: ${fin(t.accion)}.`,
    camara && `CÁMARA: ${fin(camara)}.`, t.luz && `LUZ: ${fin(t.luz)}.`, t.expresion && `INTERPRETACIÓN: ${fin(t.expresion)}.`, t.vfx && `EFECTOS: ${fin(t.vfx)}.`, habla, sonido, frames, refs,
    g && `${g}.`, p.restricciones && `Regla del motor: ${p.restricciones}.`, p.sufijo].filter(Boolean).join("\n");
  const imagen = [`Fotograma fijo cinematográfico, ${ctx.formato}.`, look(ctx.style, ctx.formato), lugar, pj.length ? `PERSONAJES: ${pj.join(" | ")}.` : "", `MOMENTO: ${fin(t.frameInicial || t.accion)}.`,
    camara && `ENCUADRE: ${camara}.`, t.luz && `LUZ: ${fin(t.luz)}.`, t.expresion && `EXPRESIÓN: ${t.expresion}.`, g && `${g}.`, "Sin texto ni subtítulos en la imagen."].filter(Boolean).join("\n");
  const efectos = [t.sonido && `Ambiente y efectos: ${t.sonido}`, t.musica && `Música sugerida: ${t.musica}`, `Duración: ${clip} s`].filter(Boolean).join(". ");
  const vozTxt = t.dialogo ? `${t.dialogo.speaker} (${voz(t.dialogo.speaker)}): «${t.dialogo.text}»` : "";
  const avisos = [t.duracion > maxSeg(p) ? `Dura ${t.duracion} s y ${p.nombre} genera hasta ${maxSeg(p)} s: pártela en dos.` : "", !p.formatos.includes(ctx.formato) ? `${p.nombre} no admite ${ctx.formato}.` : ""].filter(Boolean);
  return { video, imagen, efectos, voz: vozTxt, clip, avisos };
}

// ---------- Plan de producción ----------
export function planProduccion(o: Outline, p: PerfilModelo) {
  const max = maxSeg(p);
  let tomas = 0, estimadas = 0, segundos = 0;
  const estados: Record<Estado, number> = { pendiente: 0, imagen: 0, video: 0, revision: 0, aprobado: 0, exportado: 0 };
  for (const sc of allScenes(o)) {
    const ts: Toma[] = (sc as any).tomas || [];
    if (ts.length) { tomas += ts.length; for (const t of ts) { segundos += duracionClip(t.duracion, p); estados[t.estado] = (estados[t.estado] || 0) + 1; } }
    else { const n = Math.max(1, Math.ceil((sc.minutes * 60) / max)); tomas += n; estimadas += n; segundos += n * max; estados.pendiente += n; }
  }
  const generaciones = Math.ceil(tomas * p.reintentos);
  const segundosGenerados = Math.round(segundos * p.reintentos);
  const creditosVideo = p.creditosSegundo == null ? null : segundosGenerados * p.creditosSegundo;
  const creditosImagen = p.creditosImagen == null ? null : Math.ceil(tomas * p.reintentos) * p.creditosImagen;
  const creditos = creditosVideo == null ? null : creditosVideo + (creditosImagen ?? 0);
  const usd = creditos == null || p.usdCredito == null ? null : Math.round(creditos * p.usdCredito * 100) / 100;
  const hechas = estados.aprobado + estados.exportado;
  return { objetivoMin: o.targetMinutes, tomas, estimadas, segundosClips: segundos, generaciones, segundosGenerados, creditosVideo, creditosImagen, creditos, usd, estados, progreso: tomas ? Math.round((hechas / tomas) * 100) : 0 };
}
