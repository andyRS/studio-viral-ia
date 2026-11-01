// Clasificación de frases frente a fuentes (textos bíblicos, documentos históricos, transcripciones…).
// Sirve para cualquier proyecto histórico o documental: se le pasa la fuente como pasajes { ref, texto }.
//
//   cita         la frase reproduce el pasaje casi palabra por palabra (secuencia literal de 4+ palabras)
//   parafrasis   dice lo mismo que uno o dos pasajes con otras palabras (la mayoría de sus ideas están en ellos)
//   inspirada    toma ideas de un pasaje, pero el texto no la recoge así
//   dramatizacion no tiene apoyo en la fuente (o su personaje no habla en ella): diálogo inventado para la obra
//   narracion    voz en off: se indica si se apoya en la fuente («narración apoyada») o es de la obra
// Las coincidencias se miden por raíces de palabras con contenido (sin artículos ni verbos comodín), con
// sinónimos comunes en español; nunca se clasifica por el nombre del personaje.
import daniel10rv1909 from "@/data/fuentes/daniel-10-rv1909.json";

export type Pasaje = { ref: string; texto: string };
export type Fuente = { titulo: string; version?: string; licencia?: string; origen?: string; pasajes: Pasaje[] };
export type ClaseFrase = "cita" | "parafrasis" | "inspirada" | "dramatizacion" | "narracion-apoyada" | "narracion-propia";
export type Clasificacion = { clase: ClaseFrase; refs: string[]; puntuacion: number; coincidencias: string[]; motivo: string };

const VACIAS = new Set("a al algo alguna alguno ante antes aqui asi aun aunque bien cada como con contra cual cuando de del desde donde dos el ella ellas ello ellos en entre era eres es esa ese eso esta este esto estas estos fue fueron ha han hasta hay he la las le les lo los mas me mi mis muy nada ni no nos o os otra otro para pero poco por porque que quien se ser si sin sobre son su sus tambien te ti tu tus un una uno unos y ya yo tengo tiene puedo puede debo debe hacer hace dijo dice estaba estar pues entonces mientras todavia ahora aqui alli hacia apenas ningun ninguno ninguna nadie".split(" "));
// Grupos de sinónimos frecuentes en relatos (genéricos, no de un texto concreto).
const SINONIMOS: string[][] = [["fuerz", "fuert", "vigor", "esfue", "alien", "respi"], ["escuc", "oid", "oida", "oir", "oye"], ["temor", "miedo", "tema", "teme", "temas"], ["orill", "ribera"], ["ayuda", "socor", "auxil"], ["lucha", "pelea", "comba", "batal"], ["vino", "llego", "venid", "vengo"], ["oraci", "orar", "orab", "rueg", "supli"], ["duelo", "contr", "aflig", "triste"]];
const raiz = (w: string) => { const r = w.slice(0, 5); const g = SINONIMOS.find(gr => gr.some(x => r.startsWith(x) || x.startsWith(r))); return g ? g[0] : r; };
export const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zñ0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const palabrasClave = (t: string) => normalizar(t).split(" ").filter(w => w.length > 2 && !VACIAS.has(w));
const raices = (t: string) => new Set(palabrasClave(t).map(raiz));

// Proporción de la frase que aparece seguida y literal en el pasaje (secuencia común más larga, en palabras).
function proporcionLiteral(frase: string, pasaje: string) {
  const a = normalizar(frase).split(" "), b = ` ${normalizar(pasaje)} `;
  let max = 0;
  for (let i = 0; i < a.length; i++) for (let j = a.length; j > i + max; j--) if (b.includes(` ${a.slice(i, j).join(" ")} `)) { max = j - i; break; }
  return a.length ? max / a.length : 0;
}
// Un vocativo al inicio («Señor, …», «Daniel, …») no es contenido de la frase.
const sinVocativo = (t: string) => t.replace(/^\s*[¡¿]?\s*[^,.;:!?]{1,24}?,\s*/, m => m.trim().split(/\s+/).length <= 2 ? "" : m);

export function clasificarFrase(frase: string, fuente: Fuente | null, opciones: { narrador?: boolean; sinVozEnFuente?: boolean } = {}): Clasificacion {
  const mias = raices(opciones.narrador ? frase : sinVocativo(frase));
  if (!fuente?.pasajes.length || !mias.size) return { clase: opciones.narrador ? "narracion-propia" : "dramatizacion", refs: [], puntuacion: 0, coincidencias: [], motivo: fuente ? "sin palabras con contenido" : "sin fuente de referencia: no se puede verificar" };
  const sets = fuente.pasajes.map(p => raices(p.texto));
  // El mejor pasaje, o el mejor par de pasajes si juntos explican más (una frase puede resumir dos versículos).
  const comunes = (i: number) => Array.from(mias).filter(w => sets[i].has(w));
  let mejor = { idx: [] as number[], comun: [] as string[] };
  sets.forEach((_, i) => { const c = comunes(i); if (c.length > mejor.comun.length) mejor = { idx: [i], comun: c }; });
  sets.forEach((_, i) => sets.forEach((__, j) => {
    // Dos pasajes cercanos (≤ 3) pueden sumar una idea cada uno; lejanos, al menos dos cada uno (evita coincidencias sueltas).
    const minimo = Math.abs(i - j) <= 3 ? 1 : 2;
    if (j <= i || comunes(i).length < minimo || comunes(j).length < minimo) return;
    const c = Array.from(mias).filter(w => sets[i].has(w) || sets[j].has(w));
    if (c.length > mejor.comun.length) mejor = { idx: [i, j], comun: c };
  }));
  const puntuacion = Math.round((mejor.comun.length / mias.size) * 100) / 100;
  const refs = mejor.idx.map(i => fuente.pasajes[i].ref);
  const esLiteral = mejor.idx.some(i => proporcionLiteral(frase, fuente.pasajes[i].texto) >= 0.7);
  const suficientes = mejor.comun.length >= Math.min(2, mias.size);
  if (opciones.narrador) return puntuacion >= 0.4 && suficientes
    ? { clase: "narracion-apoyada", refs, puntuacion, coincidencias: mejor.comun, motivo: `la narración resume ${refs.join(" y ")}` }
    : { clase: "narracion-propia", refs: [], puntuacion, coincidencias: mejor.comun, motivo: "narración de la obra, sin pasaje que la respalde" };
  if (opciones.sinVozEnFuente && !esLiteral) return { clase: "dramatizacion", refs: puntuacion >= 0.25 && mejor.comun.length >= 2 ? refs : [], puntuacion, coincidencias: mejor.comun, motivo: "la fuente no atribuye palabras a este personaje" };
  if (esLiteral) return { clase: "cita", refs, puntuacion, coincidencias: mejor.comun, motivo: `reproduce ${refs.join(" y ")}` };
  if (puntuacion >= 0.6 && suficientes) return { clase: "parafrasis", refs, puntuacion, coincidencias: mejor.comun, motivo: `dice lo mismo que ${refs.join(" y ")} con otras palabras` };
  if (puntuacion >= 0.25 && suficientes) return { clase: "inspirada", refs, puntuacion, coincidencias: mejor.comun, motivo: `toma ideas de ${refs.join(" y ")}, pero el texto no la recoge así` };
  return { clase: "dramatizacion", refs: [], puntuacion, coincidencias: mejor.comun, motivo: "sin apoyo en la fuente: diálogo de la obra" };
}

export const ETIQUETA_CLASE: Record<ClaseFrase, string> = {
  cita: "Cita literal", parafrasis: "Paráfrasis", inspirada: "Inspirada en el texto", dramatizacion: "Dramatización (no está en el texto)",
  "narracion-apoyada": "Narración apoyada en el texto", "narracion-propia": "Narración de la obra",
};

// Fuente en texto libre: una línea por pasaje, «Daniel 10:12 texto…» o «12 texto…» (con prefijo opcional).
export function fuenteDeTexto(texto: string, titulo = "Fuente"): Fuente | null {
  try { const d = JSON.parse(texto); if (Array.isArray(d?.pasajes)) return { titulo: d.titulo || titulo, version: d.version, licencia: d.licencia, origen: d.origen, pasajes: d.pasajes.filter((p: any) => p?.ref && p?.texto) }; } catch { /* texto */ }
  const pasajes: Pasaje[] = [];
  let prefijo = "";
  for (const l of texto.split("\n").map(x => x.trim()).filter(Boolean)) {
    const m = l.match(/^((?:\d\s*)?[A-Za-zÁÉÍÓÚÑáéíóúñ.]+(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñ.]+)*\s+\d+:\d+(?:[-–]\d+)?)\s+(.+)$/) || l.match(/^(\d+)[.)]?\s+(.+)$/);
    if (!m) continue;
    const ref = /:/.test(m[1]) ? m[1] : `${prefijo}${m[1]}`;
    if (/:/.test(m[1])) prefijo = m[1].replace(/\d+(?:[-–]\d+)?$/, "");
    pasajes.push({ ref, texto: m[2] });
  }
  return pasajes.length ? { titulo, pasajes } : null;
}

// Fuentes incluidas (dominio público). Se sugieren cuando las referencias del proyecto las citan.
export const FUENTES_INCLUIDAS: Fuente[] = [daniel10rv1909 as Fuente];
export function fuenteSugerida(referencias: string[]): Fuente | null {
  const refs = referencias.map(normalizar).join(" ");
  return FUENTES_INCLUIDAS.find(f => refs.includes(normalizar(f.titulo))) || null;
}
