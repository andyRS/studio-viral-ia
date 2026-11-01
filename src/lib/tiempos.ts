// Tiempos del montaje por escena. Tres duraciones distintas:
//   - vídeo: la toma generada (lo que pide el prompt de vídeo; configurable por escena dentro de lo que admite el motor);
//   - voz: lo que dura la frase (estimada por palabras o, con el clip subido, medida en su audio);
//   - montaje: el tramo de la toma que entra al vídeo final (voz + margen de acción o reacción).
// Modo «cinematográfico»: el corte no lo decide la voz; se conserva un margen de acción según el peso del momento.
// Modo «viral»: se corta 0,4 s después de la voz (como hasta ahora).
// Nada de esto se aplica al episodio hasta que el usuario lo aprueba.
import { pesoMomento, RITMO } from "./importacion";
import { NARRATOR } from "./production";
import { PERFILES_BASE } from "./tomas";

export type ModoMontaje = "cinematografico" | "viral";
export type Medicion = { video: number; vozInicio: number | null; vozFin: number | null };
export type ProblemaTiempo = { codigo: "voz-truncada" | "al-limite" | "accion-incompleta" | "superposicion" | "fuera-de-motor"; mensaje: string };
export type FilaTiempo = {
  n: number; speaker: string; line: string; beat: string; peso: number;
  video: number; voz: number; vozFuente: "medida" | "estimada"; vozInicio: number;
  margenDeseado: number; margen: number;           // acción/reacción tras la voz: la deseada y la que cabe en la toma
  montaje: number;                                  // segundos que entran al montaje
  tomaMinima: number; tomaRecomendada: number;      // la mínima para no cortar la voz y la recomendada para la acción
  problemas: ProblemaTiempo[];
};

export const motorDe = (id = "seedance") => PERFILES_BASE.find(p => p.id === id) || PERFILES_BASE[0];
const r1 = (x: number) => Math.round(x * 10) / 10;
const esNarr = (s: string) => /^narrador/i.test(String(s || "")) || s === NARRATOR;

// Margen de acción deseado tras la voz: más cuanto más pesa visualmente el momento.
export function margenPara(peso: number) { return peso >= 0.95 ? 3 : peso >= 0.75 ? 1.5 : 0.8; }

export function planTiempos(escenas: any[], opciones: { tomaBase: number; motor?: string; modo?: ModoMontaje; mediciones?: Record<number, Medicion>; tarjetas?: { antes: number }[]; cierre?: boolean } ) {
  const motor = motorDe(opciones.motor);
  const durs = [...motor.duraciones].sort((a, b) => a - b);
  const modo = opciones.modo || "cinematografico";
  const filas: FilaTiempo[] = escenas.map((s, i) => {
    const n = Number(s.n) || i + 1;
    const { beat, peso } = pesoMomento({ n, speaker: s.speaker, line: s.line }, s.visibleCharacters || s.characters || []);
    const med = opciones.mediciones?.[n];
    const palabras = String(s.line || "").trim().split(/\s+/).filter(Boolean).length;
    const vozEst = palabras / (esNarr(s.speaker) ? RITMO.narracion : RITMO.dialogo);
    const medida = !!(med && med.vozInicio != null && med.vozFin != null);
    const vozInicio = medida ? med!.vozInicio! : RITMO.inicioVoz;
    const voz = r1(medida ? med!.vozFin! - med!.vozInicio! : vozEst);
    // Duración del vídeo: la medida del clip; si no, la toma elegida; si no, la que pide el prompt de vídeo (la verdad
    // de lo que se genera); por último el dato guardado o la toma del estilo.
    const pidePrompt = Number((String(s.animationPrompt || "").match(/(\d+)\s*(?:seconds|segundos)/) || [])[1]) || 0;
    const video = med?.video ? r1(med.video) : Number(s.tomaSeg) || pidePrompt || Number(s.durationSec) || opciones.tomaBase;
    const margenDeseado = Number(s.margenAccion) || margenPara(peso);
    const finVoz = vozInicio + voz;
    const margen = r1(Math.max(0, video - finVoz));
    const tras = modo === "viral" ? RITMO.reaccion : Math.max(RITMO.reaccion, margenDeseado);
    const inicio = modo === "viral" ? Math.max(0, vozInicio - RITMO.antesPrimera) : vozInicio > 1.2 ? vozInicio - 0.5 : 0;
    const montaje = r1(Math.min(video, finVoz + tras) - inicio);
    const tomaMinima = durs.find(d => d >= finVoz + 0.1) ?? durs[durs.length - 1];
    const tomaRecomendada = modo === "viral" ? tomaMinima : durs.find(d => d >= finVoz + margenDeseado) ?? durs[durs.length - 1];
    const problemas: ProblemaTiempo[] = [];
    if (finVoz + 0.1 > video) problemas.push({ codigo: "voz-truncada", mensaje: `La voz (~${voz} s desde ${r1(vozInicio)} s) no cabe en la toma de ${video} s: la frase quedaría cortada.` });
    else if (margen < RITMO.reaccion) problemas.push({ codigo: "al-limite", mensaje: `Solo quedan ${margen} s tras la voz: sin margen para la reacción.` });
    if (modo === "cinematografico" && finVoz + 0.1 <= video && margen + 0.05 < margenDeseado) problemas.push({ codigo: "accion-incompleta", mensaje: `El momento pide ~${margenDeseado} s de acción tras la voz y la toma deja ${margen} s: el clip terminaría antes de completar la acción.` });
    if (!motor.duraciones.includes(video) && !med) problemas.push({ codigo: "fuera-de-motor", mensaje: `${motor.nombre} no genera tomas de ${video} s (admite ${motor.duraciones.join(", ")} s).` });
    return { n, speaker: s.speaker, line: s.line, beat, peso, video, voz, vozFuente: medida ? "medida" : "estimada", vozInicio: r1(vozInicio), margenDeseado, margen, montaje, tomaMinima, tomaRecomendada, problemas };
  });
  // Superposición: un corte J adelanta 0,25 s la voz siguiente; si la voz anterior llega al final de su tramo, se pisan.
  filas.forEach((f, i) => {
    const sig = filas[i + 1]; if (!sig) return;
    const tarjeta = (opciones.tarjetas || []).some(t => t.antes === i + 1);
    if (!tarjeta && f.margen < 0.3 && sig.vozInicio < 0.3) f.problemas.push({ codigo: "superposicion", mensaje: `La voz termina al final de la toma y la siguiente empieza enseguida: un encadenado pisaría las dos voces (el montaje lo evita y no hace corte J aquí).` });
  });
  const tarjetas = (opciones.tarjetas || []).filter(t => t.antes > 0 && t.antes < escenas.length).length * RITMO.tarjeta;
  const cierre = opciones.cierre ? RITMO.cierre : 0;
  return {
    filas, motor: motor.nombre, duraciones: motor.duraciones, modo,
    totales: { video: r1(filas.reduce((a, f) => a + f.video, 0)), voz: r1(filas.reduce((a, f) => a + f.voz, 0)), montaje: Math.round(filas.reduce((a, f) => a + f.montaje, 0) + tarjetas + cierre), tarjetas: r1(tarjetas), cierre },
    medidas: filas.filter(f => f.vozFuente === "medida").length,
  };
}

// Decisiones del usuario por escena → episodio nuevo (toma, margen y modo de montaje en el guion.json).
// Solo cambia tiempos: guion, diálogos, personajes y dirección quedan igual.
export function aplicarTiempos(out: any, decisiones: { n: number; toma: number; margen: number }[], modo: ModoMontaje, montajeEstimado?: number) {
  const porN = new Map(decisiones.map(d => [d.n, d]));
  const scenes = (out?.scenes || []).map((s: any, i: number) => { const d = porN.get(Number(s.n) || i + 1); return d ? { ...s, tomaSeg: d.toma, durationSec: d.toma, margenAccion: d.margen } : s; });
  const tiempos = scenes.map((s: any, i: number) => ({ clip: i, modo: modo === "viral" ? "voz" : "accion", margen: Number(s.margenAccion) || undefined }));
  return {
    ...out, scenes, duration: scenes.reduce((a: number, s: any) => a + (Number(s.durationSec) || 8), 0),
    tiemposMontaje: { modo, at: new Date().toISOString(), ...(montajeEstimado ? { montaje: montajeEstimado } : {}) },
    ...(montajeEstimado ? { editDuration: montajeEstimado } : {}),
    guionJson: { ...(out?.guionJson || {}), montaje: { modo: modo === "viral" ? "voz" : "accion" }, tiempos },
  };
}
