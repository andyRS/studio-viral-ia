// IA del proyecto largo (Facebook / YouTube, 15-25 min): estructura por actos, regeneración de una sola pieza
// y guion cinematográfico de una escena. Respuestas en JSON validadas con normOutline / normScript.
import { askJson } from "./story";
import { CHRISTIAN_SCENE_GUARD, STYLES, type StyleKey } from "./knowledge";
import { normAct, normScene, normScript, normSequence, type Outline, type NodeKind } from "./outline";

const styleOf = (s: unknown): StyleKey => (String(s) in STYLES ? String(s) : "biblica") as StyleKey;
const isBible = (s: StyleKey) => s === "biblica" || s === "epica" || s === "cristiana";

function brief(style: StyleKey) {
  const st = STYLES[style];
  return `Eres guionista y director de cine con 20 años de experiencia. Escribes PELÍCULAS Y SERIES LARGAS (15-25 min por episodio) para Facebook y YouTube, en español latino neutro, con escenas que se entienden y enganchan.
ESTILO VISUAL: ${st.visual}
VOZ: ${st.voice}
REGLAS DE CINE: cada escena tiene objetivo, obstáculo y consecuencia (sin escenas de relleno); la tensión sube hasta el clímax en el último tercio; mostrar en vez de explicar (nada de diálogos que cuentan lo que el público ya vio); un gancho fuerte en el primer minuto; cada acto termina con un giro que obliga a seguir viendo.${isBible(style) ? `
REGLAS BÍBLICAS: no inventes versículos ni pongas en boca de la Biblia frases que no dice; los diálogos son dramatización y nunca se presentan como cita literal. En "source" pon el pasaje que sustenta la escena (libro capítulo:versículos) solo si de verdad está en el texto; si la escena es dramatización o interpretación, déjalo vacío. Lo espiritual imaginado (batallas, figuras de los príncipes) es representación cinematográfica, no descripción literal. ${CHRISTIAN_SCENE_GUARD}. Nunca el rostro de Dios ni de Jesús.` : ""}`;
}
const SCENE_SCHEMA = `{"heading":"INT./EXT. LUGAR - MOMENTO","summary":"qué pasa (1-2 frases)","objective":"qué quiere el protagonista de la escena","obstacle":"qué se lo impide","consequence":"qué cambia al final","tension":1,"minutes":1.5,"source":"pasaje que la sustenta o vacío"}`;
const SEQ_SCHEMA = `{"title":"","goal":"","scenes":[${SCENE_SCHEMA}]}`;
const ACT_SCHEMA = `{"title":"Acto I · …","goal":"","sequences":[${SEQ_SCHEMA}]}`;

// Resumen compacto del proyecto para dar contexto a la IA (sin guiones ni historiales).
const contexto = (o: Outline) => o.acts.map((a, i) => `ACTO ${i + 1} «${a.title}»${a.locked ? " [BLOQUEADO]" : ""}: ${a.goal}\n` + a.sequences.map(s => `  · Secuencia «${s.title}»${s.locked ? " [BLOQUEADA]" : ""}: ` + s.scenes.map(sc => `${sc.heading} — ${sc.summary}${sc.locked ? " [BLOQUEADA]" : ""}`).join(" | ")).join("\n")).join("\n");

export async function generateOutline(input: any) {
  const style = styleOf(input?.style);
  const structure: 3 | 5 = Number(input?.structure) === 5 ? 5 : 3;
  const minutes = Math.min(30, Math.max(8, Number(input?.minutes) || 20));
  const system = `${brief(style)}

TAREA: crea la ESTRUCTURA de un episodio largo de ${minutes} minutos en ${structure} actos (${structure === 3 ? "planteamiento ~25 %, confrontación ~50 %, resolución ~25 %" : "exposición, acción creciente, clímax, acción descendente y desenlace"}). Cada acto en 2-4 secuencias; cada secuencia en 2-5 escenas de 0,5 a 3 minutos. La suma de minutos ≈ ${minutes}. Tensión de 1 a 10 por escena, subiendo hacia el clímax.
Responde SOLO JSON: {"acts":[${ACT_SCHEMA}]}`;
  const user = JSON.stringify({ serie: input?.title, idea: input?.idea, notas: input?.notes, personajes: input?.cast, fuentes: input?.sources });
  const raw = await askJson(system, user);
  if (!Array.isArray(raw?.acts) || !raw.acts.length) throw new Error("La IA no devolvió actos. Vuelve a intentarlo.");
  return { acts: raw.acts.slice(0, structure).map(normAct), structure, minutes };
}

// Regenera solo una pieza (acto, secuencia o escena). El resto del proyecto va como contexto y lo bloqueado
// se conserva en el cliente (replaceNode); aquí solo se pide la pieza nueva.
export async function regenerateNode(input: any) {
  const style = styleOf(input?.style);
  const kind: NodeKind = input?.kind === "act" || input?.kind === "sequence" ? input.kind : "scene";
  const schema = kind === "act" ? ACT_SCHEMA : kind === "sequence" ? SEQ_SCHEMA : SCENE_SCHEMA;
  const system = `${brief(style)}

TAREA: reescribe SOLO ${kind === "act" ? "este acto" : kind === "sequence" ? "esta secuencia" : "esta escena"} del proyecto, mejor que la versión actual y coherente con lo que va antes y después. No cambies lo marcado [BLOQUEADO]: si hay piezas bloqueadas dentro, tu versión debe encajar con ellas (no las repitas). ${input?.wish ? `Pedido del usuario: «${String(input.wish).slice(0, 600)}».` : ""}
Responde SOLO JSON con la pieza: ${schema}`;
  const user = JSON.stringify({ proyecto: contexto(input?.outline), pieza_actual: input?.node, idea: input?.idea });
  const raw = await askJson(system, user);
  const node = kind === "act" ? normAct(raw) : kind === "sequence" ? normSequence(raw) : normScene(raw);
  return { kind, node };
}

// Guion cinematográfico de una escena: encabezado implícito, acción, diálogo, narración en off, indicaciones
// visuales y de sonido y notas de dirección.
export async function writeScene(input: any) {
  const style = styleOf(input?.style);
  const sc = input?.scene || {};
  const system = `${brief(style)}

TAREA: escribe el GUION de esta escena (${sc.minutes || 1.5} min aprox.). Diálogos naturales y cortos, como se habla de verdad; nada de exposición (los personajes no se cuentan lo que ya saben); subtexto. Usa los tipos: "accion" (lo que se ve), "dialogo" (con "speaker"), "off" (narración en off, con "speaker"), "visual" (indicación de cámara o efecto), "sonido" (ambiente, efecto o música) y "nota" (nota de dirección). ${input?.wish ? `Pedido del usuario: «${String(input.wish).slice(0, 600)}».` : ""}
Responde SOLO JSON: {"elements":[{"type":"accion","text":""},{"type":"dialogo","speaker":"","text":""}]}`;
  const user = JSON.stringify({ escena: { encabezado: sc.heading, resumen: sc.summary, objetivo: sc.objective, obstaculo: sc.obstacle, consecuencia: sc.consequence, fuente: sc.source }, personajes: input?.cast, antes: input?.before, despues: input?.after, guion_actual: input?.current });
  const raw = await askJson(system, user);
  const elements = normScript(raw?.elements);
  if (!elements.length) throw new Error("La IA no devolvió el guion. Vuelve a intentarlo.");
  return { elements };
}
