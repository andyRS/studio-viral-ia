// Formato épico (proyecto largo 16:9): la gramática de montaje de las películas de fantasía virales en YouTube,
// medida en una de referencia (planos de 3-4 s de mediana, ~13 cortes por minuto, diálogo cubierto con
// reacciones y detalles, plano general al empezar cada secuencia, título tras la primera secuencia en silencio,
// casi todo a corte y un destello blanco para la visión o el recuerdo).
//
// Todo es una propuesta para el montaje: no cambia el episodio guardado (guion, escenas, personajes) ni genera
// nada. Los «planos de recurso» son prompts que el usuario decide generar (cada uno es un clip de 5 s más).
export type TipoRecurso = "lugar" | "reaccion" | "detalle";
export type Recurso = { n: number; clip: number; tipo: TipoRecurso; motivo: string; prompt: string };
export type Transicion = { antes: number; tipo: "negro" | "blanco"; motivo: string };
export type PlanEpico = { tituloTras: number | null; transiciones: Transicion[]; recursos: Recurso[]; resumen: string };

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const VISION = /\b(vision|sueno|suena|recuerdo|flashback|celestial|resplandor|aparicion|revelacion divina|trance)\b/;
const esNarrador = (s: any) => /^narrador/i.test(String(s?.speaker || ""));
const palabras = (t: unknown) => String(t ?? "").split(/\s+/).filter(Boolean).length;
const durDe = (s: any) => Number(s?.tomaSeg) || Number(s?.durationSec) || 8;
const lugarDe = (s: any) => String(s?.location || "").replace(/^recuerdo:\s*/i, "").trim();
const limpio = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
const esVision = (s: any) => VISION.test(norm(`${s?.location || ""} ${s?.title || ""} ${s?.visualAction || ""}`));

function oyente(s: any): string {
  const hablante = norm(s?.speaker);
  const vis: string[] = (Array.isArray(s?.visibleCharacters) ? s.visibleCharacters : []).map(String).filter(Boolean);
  return vis.find(v => norm(v) !== hablante && !/narrador/i.test(v)) || "";
}

const COLA = "Horizontal 16:9, 5 seconds, photorealistic epic film look, no text, no subtitles, no watermark.";
export function promptRecurso(s: any, tipo: TipoRecurso): string {
  const luz = limpio(s?.lighting), atm = limpio(s?.atmosphere), lugar = lugarDe(s);
  if (tipo === "lugar") {
    return [`Establishing shot, no dialogue. Wide cinematic view of ${lugar || "the location of the scene"}`, luz, atm,
      "Epic scale, slow camera drift forward, natural ambient sound only, nobody speaks; any people are small distant figures", COLA].filter(Boolean).join(". ");
  }
  if (tipo === "reaccion") {
    const quien = oyente(s);
    const habla = esNarrador(s) ? "the narrator speaks off-screen" : `${s?.speaker || "someone"} speaks off-screen`;
    return [`Silent reaction shot, close-up of ${quien} listening while ${habla}`, lugar && `Setting: ${lugar}`, luz,
      `Expression: ${limpio(s?.expression) || "intense, emotional"}`,
      `Mouth closed, ${quien} does NOT speak: only breathing, blinking and subtle eye movement`,
      `Same face, hair and costume as the master reference sheet of ${quien}`, "Shallow depth of field, slow push-in", COLA].filter(Boolean).join(". ");
  }
  return [`Silent insert shot, extreme close-up detail of the action: ${limpio(s?.visualAction) || limpio(s?.videoAction) || "a meaningful object of the scene"}`,
    lugar && `Setting: ${lugar}`, luz, "Hands, objects or textures only, no talking faces, slow push-in, shallow depth of field", COLA].filter(Boolean).join(". ");
}

export function planEpico(escenas: any[], transiciones: { antes: number; tipo?: string; motivo?: string }[] = [], tarjetas: { antes: number }[] = []): PlanEpico {
  const total = escenas.reduce((t, s) => t + durDe(s), 0);
  const antesDe = (i: number) => escenas.slice(0, i).reduce((t, s) => t + durDe(s), 0);
  // Transiciones: a corte salvo cambio de secuencia (negro). Un solo destello blanco: la primera entrada en la
  // visión o el recuerdo (en la referencia, el blanco se reserva para ese momento; si se repite, deja de impactar).
  const trans: Transicion[] = transiciones.map(t => ({ antes: Number(t.antes), tipo: "negro" as const, motivo: t.motivo || "" }));
  const entrada = escenas.findIndex((s, i) => i > 0 && esVision(s) && !esVision(escenas[i - 1]));
  if (entrada > 0 && !tarjetas.some(t => Number(t.antes) === entrada)) {
    const ya = trans.find(t => t.antes === entrada);
    if (ya) Object.assign(ya, { tipo: "blanco", motivo: `Entra en la visión. ${ya.motivo}`.trim() });
    else if (!trans.some(t => Math.abs(t.antes - entrada) <= 1)) trans.push({ antes: entrada, tipo: "blanco", motivo: "Entra en la visión o el recuerdo" });
  }
  trans.sort((a, b) => a.antes - b.antes);
  // Título: tras la primera secuencia (el primer cambio de secuencia), si llega antes del 45 % del episodio;
  // si no, en el primer corte a partir de ~20 s.
  let tituloTras: number | null = null;
  if (escenas.length > 2) {
    const primera = trans.find(t => t.antes >= 2 && antesDe(t.antes) <= total * 0.45);
    if (primera) tituloTras = primera.antes;
    else for (let i = 2; i < escenas.length - 1; i++) if (antesDe(i) >= 20) { tituloTras = i; break; }
  }
  // Recursos: plano general al empezar cada secuencia; reacción o detalle en las frases largas, sin dos seguidos.
  const inicios = new Set([0, ...trans.map(t => t.antes), ...(tituloTras != null ? [tituloTras] : [])]);
  const recursos: Recurso[] = [];
  let anteriorEncima = false;
  escenas.forEach((s, i) => {
    const n = Number(s?.n) || i + 1;
    if (inicios.has(i) && lugarDe(s)) {
      recursos.push({ n, clip: i, tipo: "lugar", motivo: i === 0 ? "Abre la historia mostrando dónde estamos" : `Nueva secuencia: ${lugarDe(s)}`, prompt: promptRecurso(s, "lugar") });
      anteriorEncima = false;
      return;
    }
    if (anteriorEncima || palabras(s?.line) < 9) { anteriorEncima = false; return; }
    const quien = oyente(s);
    const tipo: TipoRecurso = quien ? "reaccion" : "detalle";
    recursos.push({ n, clip: i, tipo, motivo: quien ? `${quien} escucha mientras la frase sigue (plano y contraplano)` : "Detalle de la acción mientras sigue la voz", prompt: promptRecurso(s, tipo) });
    anteriorEncima = true;
  });
  const blancos = trans.filter(t => t.tipo === "blanco").length;
  const resumen = [
    tituloTras != null ? `título tras la escena ${tituloTras}` : "",
    `${trans.length - blancos} paso(s) por negro` + (blancos ? ` y ${blancos} destello(s) blanco(s)` : ""),
    `${recursos.length} plano(s) de recurso propuestos`,
  ].filter(Boolean).join(" · ");
  return { tituloTras, transiciones: trans, recursos, resumen };
}
