// Creación de historias nuevas y continuidad de series.
// La IA escribe elenco y escenas; el código valida, repara el elenco de frutas y construye
// todos los prompts de producción (production.ts). Si la IA no responde, plantilla local con aviso.
import { callLLM } from "./llm";
import { jsonrepair } from "jsonrepair";
import { BIBLE_BANK, EPIC_BANK, EPIC_NOTICE, CHRISTIAN_RULES, FRUIT_CAST_RULES, MANUAL_VIRAL, STYLES, type StyleKey } from "./knowledge";
import { templateHookVariants, type HookVariant } from "./hooks";
import { castNeedsRepair, fichaGenerica, isFruitStyle, norm, normalizeCast, templateCast, type CastMember } from "./cast";
import { aspectoDe, buildProduction, conAspecto, NARRATOR, sceneCountFor, templateScenes } from "./production";
import { cambiosDeAdaptacion, CAMPOS_IA, elencoDesdeBiblioteca, importarFiel, normalizarCapitulo, normalizarPersonajes, validarImportacion } from "./importacion";
import { christianSafe, templateIdeas, type IdeasRequest, type StoryIdea } from "./ideas";

export const styleKey = (s?: string): StyleKey => ((s as StyleKey) in STYLES ? (s as StyleKey) : "frutinovela");
const providerMode = () => ((process.env.LLM_PROVIDER || "").toLowerCase() === "gemini" ? "gemini" : "llm");

export function parseJson(raw: string): any {
  const clean = raw.replace(/```json|```/g, "").trim();
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  const body = a >= 0 && b > a ? clean.slice(a, b + 1) : clean;
  try { return JSON.parse(body); }
  catch {
    // Gemini puede devolver comillas sin escapar, claves sin comillas o comas
    // sobrantes incluso con responseMimeType JSON. Reparar sin alterar el guion.
    return JSON.parse(jsonrepair(body));
  }
}

// Llama a la IA y lee el JSON; si la respuesta viene rota, la pide una vez más.
export async function askJson(system: string, user: string) {
  const startedAt = Date.now();
  let raw = "";
  try { raw = await callLLM(system, user, { json: true }); return parseJson(raw); }
  catch (e) {
    if (!(e instanceof SyntaxError) || !raw) throw e;
    const remaining = 145000 - (Date.now() - startedAt);
    if (remaining < 5000) throw e;
    const fixed = await callLLM("Repara el JSON recibido sin inventar ni quitar datos. Devuelve exclusivamente el objeto JSON válido.", raw, { json: true, timeoutMs: Math.min(25000, remaining) });
    return parseJson(fixed);
  }
}

// Aprendizajes de métricas + gancho elegido del banco: contexto extra para el modelo.
// El perfil de la cuenta (lo arma el cliente con profileText) va justo después del manual viral.
const accountBlock = (input: any) => (input?.accountProfile ? "\n\n" + String(input.accountProfile).slice(0, 8000) : "");

function extraContext(input: any) {
  const parts: string[] = [];
  if (input.accountProfile) parts.push(String(input.accountProfile).slice(0, 8000));
  if (input.learnings) parts.push(String(input.learnings));
  if (Array.isArray(input.usadas) && input.usadas.length) parts.push(`YA USADAS en esta cuenta (no repitas su historia bíblica ni su conflicto; elige otro tipo del banco): ${input.usadas.slice(-40).join(" · ")}`);
  const hook = Array.isArray(input.chosenHook) ? input.chosenHook.filter(Boolean) : [];
  if (hook.length) parts.push(`GANCHO ELEGIDO POR EL USUARIO (obligatorio): usa exactamente estas líneas como hook y construye los primeros 3 segundos alrededor de ellas: ${hook.map((l: string) => `"${l}"`).join(" / ")}`);
  return parts.length ? "\n\n" + parts.join("\n\n") : "";
}

// Drama bíblico moderno (Un Minuto en Oración): instrucción de trabajo de Andy (oct. 2026).
const BIBLICA_RULES = `
DRAMA BÍBLICO MODERNO (cuenta «Un Minuto en Oración»; público pentecostal/evangélico):
IDEA CENTRAL: una historia bíblica (o un principio bíblico) contada como drama de la República Dominicana de hoy. El público siente «esto me pasó a mí» y SOLO al final descubre el versículo y el mensaje. Nada de predicar al inicio: primero la emoción, luego la verdad.
VARIEDAD (obligatorio): rota el tipo de historia; no todo es redención. Banco (elige uno que NO esté en «ya usadas», o un principio bíblico equivalente):
${BIBLE_BANK.map(b => `- ${b.story} → ${b.modern} → «${b.message}» (${b.verse})`).join("\n")}
Cada historia: 1 versículo base, 1 conflicto cotidiano reconocible (dinero, familia, traición, enfermedad, injusticia, migración), 1 giro emocional, 1 frase final con el mensaje.
ESTRUCTURA: 0-3 s gancho con conflicto visible y texto de 2 líneas («La acusaron de robar…» / «y solo Dios sabía la verdad») → estatus y contraste claros (quién tiene poder y quién no) → objeto que revela (carta, Biblia vieja, llave, foto, recibo, pulsera) → escalada con frases de 2 a 6 palabras, un solo personaje por clip → giro (la verdad sale a la luz, alguien cambia o llega la ayuda inesperada) → cierre emotivo (oración, abrazo o decisión) con la frase del mensaje en boca del Narrador (el Narrador SOLO en la última escena). El versículo va en pantalla al final (lo pone el montaje).
CADA VÍDEO SE ENTIENDE SOLO: no depende de otra parte; las series son opcionales y solo si la historia lo pide.
PROHIBIDO: santos, Virgen, altares, velas votivas, rosarios (tampoco en la casa); iglesia evangélica sencilla con púlpito, cruz lisa y Biblia. Nunca el nombre de Dios en vano, nunca violencia gráfica, vestuario modesto de manga larga. No inventar milagros ni curas médicas como promesa real: es ficción.
SIN LLAMADAS A INTERACCIÓN en ningún texto ni en el diálogo: nunca «comenta AMÉN», «escribe AMÉN», «dale like», «sígueme» ni «comparte» (Meta lo penaliza como interacción no auténtica y desmonetiza la página). En la descripción, una pregunta abierta sin pedir acción («¿Qué harías tú en su lugar?»).
`.trim();

// Pista B: épica bíblica (instrucción de trabajo de Andy, oct. 2026).
const EPICA_RULES = `
ÉPICA BÍBLICA (Pista B de «Un Minuto en Oración»; cine épico y realista: más espectáculo visual, el mismo mensaje):
PERSONAJES Y LUGARES (obligatorio): SOLO personajes bíblicos con su nombre del relato (Eliseo, el criado de Eliseo, Daniel, Elías, Jacob, Agar, Pedro, Enoc…) y figuras de esa época (ángeles, profetas, reyes, soldados, pueblo), en escenarios que la Biblia menciona o épicos de ese tiempo (Jerusalén, Babilonia, Dotán, Betel, el Jordán, el desierto, el horno, el foso, el cielo abierto), con vestuario de la época. NADA dominicano ni moderno: ni nombres, ni acento, ni dominicanismos, ni objetos, ni lugares de hoy.
IRONÍA DRAMÁTICA: el público ve la dimensión espiritual que los personajes no ven (el ejército de ángeles, el cuarto hombre en el fuego): es lo que más engancha.
BANCO (elige uno que NO esté en «ya usadas»):
${EPIC_BANK.map(b => `- ${b.story}: ${b.idea} → «${b.message}» (${b.verse})`).join("\n")}
ESTRUCTURA (8 a 12 escenas cortas): 0-3 s imagen impactante (cielo abierto, sombra gigante, fuego) con texto de 2 líneas («Nadie veía…» / «lo que había detrás de él») → humano en crisis (miedo, fe pequeña) → revelación visual: se ve lo invisible (ejército, ángel, carro de fuego) → clímax: la oración o la fe y la intervención → cierre en calma con la frase del mensaje (Narrador, solo en la última escena). El versículo va en pantalla al final (lo pone el montaje).
ÁNGELES: hablan poco, voz grave, de 2 a 6 palabras, español latino neutro («No temas.», «Yo estoy contigo.», «Ora, ya vengo.»). Figuras majestuosas y altas, ropa blanca o de luz; alas realistas solo cuando el texto lo pide (en muchos pasajes parecen hombres). Sin halos, sin querubines de bebé, sin estética de estampa.
PROHIBIDO: mostrar el rostro de Dios o de Jesús (solo luz, voz, sombras o manos de luz; Cristo, si aparece, de espaldas o como luz); santos, Virgen, altares, velas votivas, rosarios; violencia gráfica, sangre explícita o desnudez; gigantes y caídos solo como siluetas y escala. Nunca inventar doctrina (nombres y jerarquías de ángeles como dogma), nunca magia ni ocultismo, nunca glorificar a los caídos.
LIBROS APÓCRIFOS (Enoc, Jubileos): con cuidado. Preséntalos siempre como «inspirado en la tradición de Enoc» o «basado en antiguos relatos judíos», nunca como Palabra de Dios ni como hecho. Usa como puente los versículos bíblicos (Judas 14-15: «Enoc, séptimo desde Adán, profetizó…»; Génesis 5:24: caminó con Dios y desapareció; Génesis 6:1-4 para los gigantes). El mensaje siempre: Dios es justo y cuida al que camina con Él. Si es apócrifo, marca "apocryphal": true.
SERIE: solo cuando la historia lo pide (p. ej. «ENOC, EL QUE CAMINÓ CON DIOS»), y cada parte con su propio gancho: cada continuación pierde ~85 % del público.
DESCRIPCIÓN: termina SIEMPRE con «${EPIC_NOTICE}». Sin llamadas a interacción.
`.trim();

function styleRules(style: StyleKey) {
  return [MANUAL_VIRAL, isFruitStyle(style) ? FRUIT_CAST_RULES : "", style === "cristiana" ? CHRISTIAN_RULES : "", style === "biblica" ? BIBLICA_RULES : "", style === "epica" ? EPICA_RULES + "\n\n" + BIBLICA_RULES.split("\n").filter(l => /^(PROHIBIDO|SIN LLAMADAS)/.test(l)).join("\n") : ""].filter(Boolean).join("\n\n");
}

// ---------- ADAPTAR UN GUION DE OTRA IA ----------
// El usuario sube o pega un guion escrito en otra herramienta; la IA lo adapta al formato de la app
// (escenas de una frase, elenco con fichas, cierre del narrador) sin cambiar la historia.
export const MAX_GUION_EXTERNO = 60000;
export const guionExterno = (input: any) => String(input?.guionExterno || "").replace(/\r/g, "").trim().slice(0, MAX_GUION_EXTERNO);
const ADAPTAR_TIPO = "ADAPTACIÓN FIEL de un guion escrito por otra IA (va en «guionExterno»)";
const adaptarReglas = (count: number) => `ADAPTAR EL GUION RECIBIDO (manda sobre la idea y las notas):
- Conserva la historia, el orden de los hechos, los personajes con sus nombres, los lugares y el sentido de cada diálogo. No inventes otra trama ni cambies el final.
- Repártelo en exactamente ${count} escenas: si trae más momentos, une los menores; si trae menos, parte los largos en acciones o reacciones. Un solo personaje habla en cada escena.
- Los diálogos largos se resumen en una frase natural con el mismo sentido; las narraciones en off pasan al Narrador.
- Si el guion trae indicaciones de cámara, sonido o música, úsalas en "shot", "sfx" y "music"; las descripciones visuales van en "setting".
- Si menciona tomas, segundos o formatos distintos, ignóralos: manda la configuración de este pedido.
- El guion puede venir en texto libre o en JSON (con escenas, diálogos, narración, cámara…): lee su contenido, no copies su estructura.`;

// Sin IA: cada línea «NOMBRE: frase» es una escena; el resto del texto pasa al Narrador.
// Guion en JSON (de otra IA o el guion.json de esta app): se recorren sus escenas y diálogos sea cual sea
// la forma (escenas[].dialogos[], scenes[].speaker/line, clips [[["A","frase"]]], narración en off…).
type EscenaExterna = { speaker: string; line: string; setting?: string; emotion?: string; shot?: string; sfx?: string; music?: string };
const CLAVES = {
  speaker: ["speaker", "personaje", "character", "hablante", "quien", "nombre", "name", "voz", "actor"],
  line: ["line", "dialogo", "diálogo", "dialogue", "texto", "text", "frase", "linea", "línea", "parlamento"],
  narr: ["narracion", "narración", "narration", "narrator", "narrador", "voiceover", "voz_en_off", "vozEnOff", "voice_over"],
  setting: ["setting", "escena", "descripcion", "descripción", "description", "visual", "lugar", "location", "ambiente", "accion", "acción", "action"],
  emotion: ["emotion", "emocion", "emoción", "tono", "tone"],
  shot: ["shot", "camara", "cámara", "camera", "plano", "encuadre"],
  sfx: ["sfx", "sonido", "sound", "efectos"],
  music: ["music", "musica", "música"],
};
const tomar = (o: any, ks: string[]) => { for (const k of Object.keys(o || {})) if (ks.includes(k.toLowerCase()) && typeof o[k] === "string" && o[k].trim()) return o[k].trim(); return ""; };
export function escenasDeJson(texto: string): EscenaExterna[] | null {
  let datos: any; try { datos = JSON.parse(texto); } catch { return null; }
  const out: EscenaExterna[] = [];
  const visitar = (n: any, ctx: Partial<EscenaExterna>) => {
    if (Array.isArray(n)) {
      if (n.length === 2 && n.every(x => typeof x === "string") && n[0].length <= 40) { out.push({ ...ctx, speaker: n[0], line: n[1] }); return; }
      n.forEach(x => visitar(x, ctx)); return;
    }
    if (!n || typeof n !== "object") return;
    const aqui: Partial<EscenaExterna> = { ...ctx };
    for (const k of ["setting", "emotion", "shot", "sfx", "music"] as const) { const v = tomar(n, CLAVES[k]); if (v) aqui[k] = v; }
    const speaker = tomar(n, CLAVES.speaker), line = tomar(n, CLAVES.line), narr = tomar(n, CLAVES.narr);
    if (narr) out.push({ ...aqui, speaker: "Narrador", line: narr });
    if (speaker && line) out.push({ ...aqui, speaker, line });
    for (const v of Object.values(n)) if (v && typeof v === "object") visitar(v, aqui);
  };
  visitar(datos, {});
  return out.length ? out : null;
}

// Líneas «NOMBRE: frase» (o «NOMBRE (acotación): frase»), sin encabezados de escena, cámara ni sonido.
function lineasConHablante(texto: string) {
  const lineas = texto.split("\n").map(l => l.replace(/^[-*#>\d.\s]+/, "").trim()).filter(Boolean);
  return lineas.map(l => { const m = l.match(/^([A-ZÁÉÍÓÚÑa-záéíóúñ][\wÁÉÍÓÚÑáéíóúñ .]{0,30}?)\s*(?:\([^)]*\))?\s*[:：—–-]\s*(.{3,})$/);
    return m ? { speaker: m[1].trim(), line: m[2].replace(/^["«“]|["»”]$/g, "").trim() } : null; })
    .filter((x): x is { speaker: string; line: string } => !!x && !/^(escena|toma|plano|int|ext|c[aá]mara|sonido|m[uú]sica|nota)\b/i.test(x.speaker));
}

// Cuántas escenas trae el guion externo (JSON: sus diálogos; texto: líneas «NOMBRE: frase»; si no, la cifra
// que mencione). null si no se puede saber.
export function escenasDelGuion(texto: string): number | null {
  const t = String(texto || "").trim(); if (!t) return null;
  const json = escenasDeJson(t); if (json) return json.length;
  const dialogos = lineasConHablante(t);
  if (dialogos.length >= 3) return dialogos.length;
  const m = t.match(/\b(\d{1,2})\s+(?:tomas|escenas|clips)\b/i); return m ? Number(m[1]) : null;
}

export function guionExternoSinIA(texto: string, count: number) {
  const json = escenasDeJson(texto);
  if (json) return json.slice(0, Math.max(2, count)).map(e => ({ setting: "según el guion original", emotion: "emoción contenida", ...e }));
  const lineas = texto.split("\n").map(l => l.replace(/^[-*#>\d.\s]+/, "").trim()).filter(Boolean);
  const escenas = lineasConHablante(texto);
  const lista = escenas.length ? escenas : lineas.map(line => ({ speaker: "Narrador", line }));
  return lista.slice(0, Math.max(2, count)).map(e => ({ ...e, setting: "según el guion original", emotion: "emoción contenida" }));
}

// Sección «MI PEDIDO» del prompt maestro, con los datos del formulario.
function miPedido(input: any, style: StyleKey, duration: number, count: number, type: "nueva" | "continuacion" | "replica" | "adaptacion") {
  const tipo = type === "adaptacion" ? ADAPTAR_TIPO
    : type === "replica" ? `réplica de un viral ajeno (copia la estructura y la emoción, nunca personajes, diálogo literal ni marca). Viral: ${String(input.replica || "").trim() || "(sin descripción)"}`
    : type === "continuacion" ? "continuación (debe entenderse sola, sin haber visto las anteriores)" : "historia nueva (Parte 1 que se entiende sola)";
  return `## MI PEDIDO
- Estilo: ${STYLES[style].label}
- Idea: ${String(input.idea || input.wish || "").trim() || "decide tú lo que más enganche"}
- Tipo: ${tipo}
- Duración del vídeo montado: unos ${Math.round(count * 4.5)} s (${count} escenas; cada clip se genera de 8 s y el montaje lo recorta a su frase y reacción)
- CANTIDAD DE ESCENAS: exactamente ${count}. Si la idea o las notas mencionan otra cantidad de escenas, tomas o segundos, ignórala: manda esta configuración.
- Formato de imagen: ${aspectoDe(input.formato) === "16:9" ? "horizontal 16:9 (serie larga para Facebook/YouTube): compón los planos a lo ancho" : "vertical 9:16"}
- Notas: ${String(input.notes || "").trim() || "ninguna"}`;
}

const CAST_FIELDS = (style: StyleKey) => isFruitStyle(style)
  ? `{"name":"nombre dominicano con la fruta (p. ej. Platanito, Don Coco)","fruit":"plátano","fruitEmoji":"🍌","role":"protagonista humilde","headES":"piel amarillo plátano con suaves pintas marrones; pequeño tallo verde de plátano asomando en el peinado; pelo negro rizado corto, ojos color miel (descríbelo PROPIO para cada personaje según su fruta, edad y sexo)","clothing":"${style === "cristiana" ? "ropa fija, elegante y de manga larga, con un color propio reconocible, y accesorios" : "ropa fija con un color propio reconocible: elegante, o atractiva y a la moda si el personaje es coqueto o seductor (top corto, shorts o jeans ajustados, vestido ceñido)"}","voice":"edad, tono y manera de hablar","speechStyle":"Acento: dominicano marcado | latino neutro (u otro si la historia lo pide). Muletillas","subtitleColor":"FFE14D","pronunciations":["palabra = SÍ-la-bas, nunca X"]}`
  : style === "epica" ? `{"name":"nombre bíblico del relato (p. ej. Eliseo, Daniel, Agar)","role":"protagonista","visualES":"apariencia física fija de un personaje de la época bíblica","visualEN":"same appearance in English","clothing":"vestuario de la época bíblica (túnica, manto, sandalias o armadura de entonces), siempre el mismo","subtitleColor":"#hex","voice":"voz","speechStyle":"Acento: latino neutro"}`
  : `{"name":"nombre propio","role":"protagonista","visualES":"apariencia física fija","visualEN":"same appearance in English","clothing":"vestuario fijo de los 90 con un color propio reconocible: elegante, o atractivo y ceñido si el personaje es seductor","voice":"edad, tono y manera de hablar","speechStyle":"Acento: dominicano marcado | latino neutro (u otro si la historia lo pide). Muletillas","subtitleColor":"FF9A1F","pronunciations":[]}`;

function sceneBrief(style: StyleKey, count: number) {
  const st = STYLES[style];
  return `FORMATO DE ENTREGA (la app construye los prompts de imagen y animación con tus campos: NO los escribas). Usa los hechos concretos de la idea (relaciones, oficio, lugar, objeto que revela, desenlace).
ESTILO VISUAL: ${st.visual}
ESTILO DE VOZ: ${st.voice}
ESCENAS: exactamente ${count} escenas. En cada escena habla UN SOLO personaje con UNA frase natural de ${style === "biblica" || style === "epica" ? "2 a 6" : "4 a 12"} palabras, como se habla de verdad (nunca discursos ni frases de relleno). El diálogo es una conversación rápida de ida y vuelta: cada frase responde a la anterior, como en una pelea, un coqueteo o una confesión real; en el vídeo montado sale una frase cada 3-4 segundos, sin silencios. Escena 1 = gancho visual y conflicto visible desde el segundo 0. Cada escena avanza la historia con información nueva; nada de repetir frases ni escenas. Incluye la revelación con un objeto y un triángulo o personaje cuestionable que obligue a opinar. La última escena, y SOLO esa (una sola escena, nunca partida en dos), es del Narrador (hasta 14 palabras; su "setting" muestra al protagonista o el objeto clave en el último lugar, con "onScreen" si sale alguien; NUNCA una pantalla oscura ni texto) y deja una pregunta abierta: "Lo que X no sabe... es que..."${style === "biblica" || style === "epica" ? " (en el drama bíblico NO es un misterio: es la frase con el mensaje, p. ej. «Lo que sus hermanos hicieron para mal, Dios lo convirtió en bien»)" : ""}.
TÉCNICAS DE LOS VIRALES (obligatorias, son las que hacen que el público no deje de mirar):
1. Arranca en mitad del conflicto: la frase 1 ya es una acusación, una tentación o un secreto; nada de presentaciones.
2. Ironía dramática: muy pronto el público sabe un secreto que la víctima NO sabe (una infidelidad, una mentira, un billete, un embarazo) y la ve hablar sin saberlo.
3. Algo nuevo cada 3 o 4 escenas: un mensaje, una llamada, un objeto, una prueba o una revelación que sube lo que está en juego.
4. ${style === "epica" ? `LO INVISIBLE cuenta la historia: en la época bíblica no hay teléfonos ni nada moderno ("phone" = null siempre); los giros llegan por una visión, un ángel, una voz del cielo, un objeto de la época (manto, rollo, cántaro, espada) o la intervención de Dios.` : style === "cine90" ? `LA VIDA REAL DE LOS 90 cuenta la historia (2 o 3 escenas por episodio, campo "phone"): una llamada por teléfono fijo de cable o desde una cabina en la que SE OYE lo que dice la otra persona (type "llamada": el "speaker" es quien llama y NO está en "onScreen"; en "setting" quien escucha con el auricular en la oreja), un mensaje en la contestadora (type "nota_de_voz"), una carta, un beeper o una foto Polaroid. Nada de móviles ni internet: es 1990-1999.` : `LA VIDA DE HOY cuenta la historia, como en los virales (2 o 3 escenas por episodio, campo "phone"): un chat de WhatsApp que el público lee en pantalla (type "whatsapp": "contact" = el nombre del chat y "messages" = 2 a 4 mensajes exactos, cortos y escritos como se escribe de verdad: «Ya llegaste mi amor?», «No me escribas a este número»; quien lo lee reacciona con su frase), una llamada en la que SE OYE lo que dice la otra persona (type "llamada": el "speaker" es quien llama y NO está en "onScreen"; en "setting" quien escucha con el móvil en la oreja), una videollamada en pantalla partida (type "videollamada": los dos en "onScreen") o una nota de voz (type "nota_de_voz": habla quien la grabó, que no está en escena). Suma detalles reales de la República Dominicana de hoy: delivery en moto, transferencia del banco en el móvil, captura de pantalla, prueba de embarazo, cámara de seguridad, historia de Instagram, colmado, yipeta, apagón. En las demás escenas, "phone" = null.`}
5. Saltos de tiempo marcados: si pasa el tiempo antes de una escena, su "transition" es la tarjeta («Horas después...», «Días después...»).
6. Antes del final, el personaje con el secreto queda a solas (espejo, baño, cama) y confiesa en voz alta su miedo o su culpa con una cuenta atrás concreta («regresa en dos semanas»).
7. ${style === "epica" ? "En la épica bíblica todos hablan español latino neutro y solemne: sin acento dominicano ni dominicanismos (en \"speechStyle\" pon «Acento: latino neutro»)." : style === "cristiana" ? "En la frutinovela cristiana todos hablan con vocabulario neutro; el acento, dominicano suave (ponlo en \"speechStyle\" como «Acento: dominicano suave»)." : "El acento es parte del personaje: uno o dos (el tíguere, el pícaro, el seductor, la doña del barrio) hablan con acento dominicano marcado y el resto en latino neutro; si la historia trae a alguien de fuera, con su acento (p. ej. venezolano). Indícalo en \"speechStyle\" como «Acento: …»."}
8. Lugares con armonía: 2 a 4 lugares por episodio. Las escenas seguidas que pasan en el mismo sitio repiten EXACTAMENTE la misma "location" (mismo decorado, misma hora, misma luz); solo se cambia de lugar con un salto de tiempo o cuando la historia lleva a los personajes a otro sitio. En "setting" va solo la acción de esa escena.
9. Nada se resuelve del todo: cada respuesta abre una pregunta nueva y el final deja al público pidiendo la parte siguiente.
VESTUARIO: ${style === "cristiana" ? "recatado, elegante y de manga larga; nunca bikinis, toallas, escotes ni tirantes." : "a la moda y atractivo según el personaje, como en los virales: la chica coqueta o seductora es una mujer adulta de figura curvilínea con top corto, camiseta de tirantes, shorts o jeans ajustados o vestido ceñido; el galán, camiseta ajustada. Traje de baño solo en piscina, playa o jacuzzi. Nunca desnudos, lencería ni toallas."}
ROMANCE: ${style === "cristiana" ? "solo cariño respetuoso (abrazos, tomarse de la mano)." : "cautiva sin pasarte: miradas, coqueteo, abrazos y, si el guion lo pide, besos en la boca breves y románticos (escríbelo en el \"setting\" de esa escena). Para no salir del For You de TikTok: la cámara nunca se recrea en el cuerpo, nada de poses ni movimientos sexuales, nada de caricias íntimas. Nunca sexo explícito."}
PUBLICACIÓN: cada "description" = título corto en MAYÚSCULAS + ${style === "cristiana" || style === "biblica" || style === "epica" ? "una pregunta abierta que invite a pensar SIN pedir ninguna acción (nunca «comenta», «escribe AMÉN», «dale like», «sígueme» ni «comparte»: Meta lo penaliza)" : `la palabra para comentar (${style === "cine90" ? "BUTACA" : "PARTE 2"})`} + ${style === "biblica" || style === "epica" ? "3 a 5" : "3 a 6"} hashtags${style === "epica" ? ` y, en la última línea, «${EPIC_NOTICE}»` : ""} (#frutinovela #frutinovelas o los del estilo, 1 o 2 del tema concreto del episodio como #suegratoxica #infidelidad #traicion, y #parati); en "hashtags" pon sobre todo los del tema concreto. En "platforms.facebook.topic" indica el tema que hay que elegir al publicar (${style === "cristiana" || style === "biblica" || style === "epica" ? "Religión" : style === "cine90" ? "Películas" : "Animación"}). En "social.music" propone la canción de firma de la serie (la misma en todas las partes, elegida en la biblioteca de sonidos de la plataforma).
DIÁLOGO: ${style === "cristiana" ? "español NEUTRO y global, que entienda cualquier hispanohablante: sin jerga ni modismos dominicanos (nada de tíguere, yipeta, vaina, jevito, un chin, cualto) y sin vulgaridades ni groserías; tono respetuoso y emotivo. La voz sí puede tener un acento dominicano suave" : "palabras dominicanas escritas completas y con acentos (tíguere, yipeta, jevito, vaina, un chin, mi cualto / lo cualto mío)"}; NUNCA contracciones (pa', vamo', e', ta').
ESTRUCTURA: reparte las escenas como Gancho -> Contexto -> Desarrollo -> Clímax -> Consecuencia -> Resolución (la primera es el Gancho y la última la Resolución). Si la historia es bíblica, indica la base bíblica y no presentes diálogos inventados como citas literales.
"setting" = lugar y acción visual concreta de la escena${isFruitStyle(style) ? "" : " (ENTERA en inglés, sin mezclar español, sin «Usa Seedance» ni puntos dobles)"}; "emotion" = lo que se VE en la cara y el cuerpo${isFruitStyle(style) ? "" : ", en inglés"} (p. ej. ${isFruitStyle(style) ? "«ojos llenos de lágrimas, labios temblando»" : "«eyes full of tears, trembling lips»"}), nunca una palabra suelta como «Amargura» o «Serenidad»; "shot" = el plano que pide lo que pasa (general, medio, primer plano, detalle de un objeto, detalle de las manos con el objeto, a dos, de espaldas, en movimiento): un personaje que cruza los brazos es plano medio, no un detalle de objeto; una revelación necesita ver la cara, nunca una silueta a contraluz; "speaker" = nombre exacto del elenco o "Narrador".`;
}

const SCENES_SCHEMA = `"scenes":[{"title":"título corto de la escena","goal":"objetivo narrativo","location":"lugar fijo con decorado, hora y luz (se repite IGUAL, palabra por palabra, en todas las escenas seguidas que pasan ahí)","setting":"","speaker":"","line":"","emotion":"","onScreen":["nombres presentes"],"sfx":"efectos sonoros","music":"música","shot":"plano según lo que pasa","transition":"transición (si ANTES de esta escena pasa el tiempo, escribe la tarjeta: «Horas después...», «Días después...», «A la mañana siguiente...»)","link":"conexión con la siguiente escena","phone":null}]`;
// "phone" (opcional): {"type":"whatsapp|llamada|videollamada|nota_de_voz","contact":"","messages":[]}. La app dibuja el chat
// en el montaje (legible y real) y pone la voz de quien llama con sonido de teléfono.
// Ficha del episodio y paquete para redes (estructura del prompt maestro).
// Portada, publicación por plataforma y autoevaluación (secciones 5, 6 y 7 del prompt maestro).
const PUBLISH_SCHEMA = `"cover":{"frame":"qué fotograma usar (máxima emoción, sin spoiler)","lines":["línea 1","línea 2"],"part":"PARTE 1"},"platforms":{"facebook":{"title":"","description":"","hashtags":[],"hour":"","cta":"","pinnedComment":"","topic":"tema de Facebook a elegir al publicar"},"tiktok":{"title":"","description":"","hashtags":[],"hour":"","cta":"","pinnedComment":""},"instagram":{"title":"","description":"","hashtags":[],"hour":"","cta":"","pinnedComment":""},"youtube":{"title":"","description":"","hashtags":[],"hour":"","cta":"","pinnedComment":""}},"selfScore":{"hook":0,"clarity":0,"escalation":0,"twist":0,"comments":0}`;
// Drama bíblico: historia del banco, versículo (va en la tarjeta final) y mensaje en una frase.
const BIBLE_SCHEMA = (style: StyleKey) => style === "biblica" ? `"bible":{"story":"historia bíblica del banco","verse":"Libro capítulo:versículo, bien citado (p. ej. Génesis 50:20)","verseText":"el versículo, corto (RVR1960)","message":"el mensaje en una frase"},`
  : style === "epica" ? `"bible":{"story":"tema del banco","verse":"Libro capítulo:versículo, bien citado (p. ej. Salmo 34:7)","verseText":"el versículo, corto (RVR1960)","message":"el mensaje en una frase","invisible":"lo invisible que se revela","impact":"el plano de impacto del segundo 0","apocryphal":false},` : "";
const FICHA_SCHEMA = `"ficha":{"biblicalBase":"libro capítulo:versículos si aplica, si no vacío","synopsis":"","hookImage":"primera imagen impactante","hookText":"frase del fotograma cero","conflict":"qué quiere el protagonista y qué se lo impide","development":"","climax":"","resolution":"","closing":"reflexión, pregunta o conexión con el siguiente episodio"},"social":{"title":"","hooks":["","",""],"frameZeroText":"","tiktokDescription":"","question":"","coverIdea":"portada vertical 9:16","music":"canción de firma de la serie: tipo de canción y que se elija en la biblioteca de sonidos de la plataforma; la misma en todas las partes","biblicalPassage":""}`;

// Si un personaje cambió de nombre al repararlo, sus frases en las escenas se reasignan.
function renameSpeakers(episode: any, before: unknown, after: CastMember[]) {
  const rows = Array.isArray(before) ? before : [];
  const map = new Map<string, string>();
  rows.forEach((r: any, i) => { if (after[i] && norm(r?.name) && norm(r.name) !== norm(after[i].name)) map.set(norm(r.name), after[i].name); });
  if (!map.size || !Array.isArray(episode?.scenes)) return episode;
  const fix = (n: unknown) => map.get(norm(n)) || n;
  return { ...episode, scenes: episode.scenes.map((s: any) => ({ ...s, speaker: fix(s.speaker), onScreen: Array.isArray(s.onScreen) ? s.onScreen.map(fix) : s.onScreen })) };
}

// Si Gemini olvidó la voz final, se pide solo ese remate y se añade después de
// su última escena. buildProduction recorta del medio, conservando ambas escenas finales.
// Segunda llamada corta, solo para el elenco, cuando el primero vino sin fruta o con nombres
// genéricos («Protagonista», «Antagonista»). Si falla o no da tiempo, normalizeCast asigna la
// fruta en el código según el rol, así que nunca queda un personaje sin fruta.
export async function repairCast(characters: unknown, style: StyleKey, idea: string, timeoutMs = 25000) {
  if (timeoutMs < 5000) return characters;
  try {
    const raw = await callLLM(`${FRUIT_CAST_RULES}

TAREA: asigna una fruta a cada personaje según las reglas, dale un nombre dominicano con su fruta y completa su ficha. Conserva el orden y el rol de cada uno. Responde SOLO JSON: {"characters":[${CAST_FIELDS(style)}]}`,
      JSON.stringify({ idea, characters }), { json: true, timeoutMs });
    const fixed = parseJson(raw).characters;
    return Array.isArray(fixed) && fixed.length ? fixed : characters;
  } catch { return characters; }
}

async function ensureNarratorEnding(raw: any, idea: string, style: StyleKey, timeoutMs = 25000) {
  const scenes = Array.isArray(raw?.scenes) ? raw.scenes : [];
  const last = scenes[scenes.length - 1];
  if (!last || /narrador|narradora|voz en off/.test(norm(last.speaker))) return raw;
  if (style === "biblica" || style === "epica") return raw;   // su cierre es el mensaje (lo añade buildProduction), no un misterio para la Parte 2
  if (timeoutMs < 5000) return raw;
  try {
    const response = await callLLM(
      `Eres guionista de microdramas. Escribe solo una línea FINAL para Narrador en off, en español dominicano, de 6 a 14 palabras. Debe abrir un misterio CONCRETO de esta historia ("Lo que X no sabe es que...") y provocar una Parte 2. No repitas el diálogo anterior. Responde solo JSON: {"linea":"..."}.`,
      JSON.stringify({ idea, resumen: raw.summary, cierrePlaneado: raw.ficha?.closing, ultimasEscenas: scenes.slice(-2).map((scene: any) => ({ speaker: scene.speaker, line: scene.line, setting: scene.setting })) }),
      { json: true, timeoutMs },
    );
    let line = String(parseJson(response).linea || "").replace(/\s+/g, " ").trim();
    const words = line.split(/\s+/).length;
    if (words < 6 || words > 18 || norm(line) === norm(last.line)) return raw;
    line = line.replace(/\s*(escribe|comenta|di)\s+am[eé]n\.?/gi, "").trim();
    return { ...raw, scenes: [...scenes, { title: "Cierre y cliffhanger", goal: "Abrir el siguiente episodio", setting: last.setting, speaker: NARRATOR, line, emotion: "intriga", onScreen: [], transition: "Fundido a negro" }] };
  } catch { return raw; }
}

function fallbackNotice(error: unknown) {
  const why = error instanceof Error ? error.message : String(error);
  return `La IA no respondió (${why}). Se creó un borrador con la plantilla local, con el elenco de frutas y las escenas completas; vuelve a intentarlo en unos minutos para un guion escrito por la IA.`;
}

// Un texto de la IA solo pasa a producción si respeta el metraje y tiene una
// progresión real. El generador no debe etiquetar como guion terminado una
// respuesta recortada o una frase repetida en casi todas las escenas.
function validateEpisode(episode: ReturnType<typeof buildProduction>, expected: number) {
  // 1 o 2 escenas de más o de menos no son un error (la IA a veces junta o parte una): solo se rechaza si se desvía mucho.
  if (Math.abs(episode.scenes.length - expected) > 2) throw new Error(`el guion tenía ${episode.scenes.length} escenas en vez de ${expected}`);
  if (episode.scenes[episode.scenes.length - 1]?.speaker !== NARRATOR) throw new Error("faltó el cierre del narrador");
  const lines = episode.scenes.map(scene => norm(scene.line));
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1);
  if (Math.max(...Array.from(counts.values())) > 2) throw new Error("el guion repitió el mismo diálogo");
  if (episode.duration !== episode.scenes.length * 8) throw new Error("la duración del guion no coincide con sus escenas");
}

// ---------- HISTORIA NUEVA ----------
export async function generateSeries(input: any) { return conCambios(conAspecto(await generateSeriesBase(input), aspectoDe(input?.formato)), input); }
// Adaptación creativa de un guion externo: se adjuntan los cambios respecto al original y la revisión de continuidad.
function conCambios(r: any, input: any) {
  const cap = String(input?.guionExterno || "").trim() ? normalizarCapitulo(String(input.guionExterno)) : null;
  if (!cap || !r?.episode?.scenes) return r;
  const biblioteca = String(input?.personajesExternos || "").trim() ? normalizarPersonajes(String(input.personajesExternos)) : null;
  const cambios = cambiosDeAdaptacion(cap.clips, r.episode.scenes);
  const validacion = validarImportacion({ episodio: r.episode, cast: r.characters || [], original: cap, biblioteca, modo: "creativa", aspecto: aspectoDe(input?.formato) });
  return { ...r, episode: { ...r.episode, adaptacion: { modo: "creativa", original: cap.clips.length, escenas: r.episode.scenes.length, cambios, avisos: cap.avisos }, validacion } };
}

// ---------- IMPORTAR EN MODO FIDELIDAD (diálogos intactos; la IA solo mejora la dirección visual) ----------
export async function importarCapituloFiel(input: any) {
  const datos = { capitulo: String(input.capitulo || input.guionExterno || ""), personajes: String(input.personajes || input.personajesExternos || "") || undefined, style: input.style, formato: input.formato, duration: input.duration, scenes: input.scenes };
  const base: any = importarFiel(datos);
  if (!process.env.LLM_API_KEY || input.enriquecer === false) return base;
  try {
    const style = styleKey(base.series.style);
    const system = `${styleRules(style)}

ERES DIRECTOR DE FOTOGRAFÍA de una película épica. Recibes un capítulo YA ESCRITO y su elenco canónico.
TAREA: mejora SOLO la dirección visual de cada escena (no el guion):
- NO cambies diálogos, hablantes, orden ni cantidad de escenas; no añadas escenas, citas bíblicas ni conclusiones.
- El Narrador es una voz en off: nunca aparece, no tiene rostro, gestos ni vestuario.
- "visibles": solo nombres del elenco; un personaje puede verse sin hablar y quien habla puede no verse. Respeta las restricciones (apariciones permitidas) de cada ficha; ante una duda, deja los visibles propuestos.
- "visualAction" es el fotograma fijo para la imagen (composición, posición, expresión); "videoAction" es la acción física y el movimiento para el vídeo: una sola acción principal y un solo movimiento de cámara por toma, posible en un clip corto de vídeo con IA.
- Alas, armas, ejércitos y combates son dramatización artística, no hechos bíblicos literales: preséntalos como representación.
Responde SOLO JSON: {"escenas":[{"n":1,"visibles":[],"visualAction":"","videoAction":"","shotType":"","camera":"","lighting":"","atmosphere":"","vfx":"","expression":"","conflict":"","continuity":"","sfx":"","music":""}]}`;
    const user = JSON.stringify({
      elenco: base.characters.map((c: any) => ({ name: c.name, rol: c.role, apariencia: c.visualES, vestuario: c.clothing, ...(c.bible?.canon ? { tipo: c.bible.canon.tipo, apariciones: c.bible.canon.apariciones, soloEnApariciones: c.bible.canon.soloEnApariciones, reglas: c.bible.canon.reglas } : {}) })),
      escenas: base.episode.scenes.map((s: any) => ({ n: s.n, speaker: s.speaker, line: s.line, visibles: s.visibleCharacters, propuesta: Object.fromEntries(CAMPOS_IA.map(k => [k, s[k]]).filter(([, v]) => v)) })),
    });
    const parsed = await askJson(system, user);
    const r: any = importarFiel({ ...datos, direccionIA: Array.isArray(parsed?.escenas) ? parsed.escenas : [] });
    return { ...r, mode: "importado-ia", notice: `${r.notice} Dirección visual mejorada con IA (diálogos intactos).` };
  } catch (error) {
    return { ...base, notice: `${base.notice} La IA no pudo mejorar la dirección visual (${error instanceof Error ? error.message : String(error)}): se usó la dirección automática.` };
  }
}
async function generateSeriesBase(input: any) {
  const startedAt = Date.now();
  const style = styleKey(input.style);
  const duration = Number(input.duration || 90);
  const externo = guionExterno(input);
  const idea = String(input.idea || input.replica || "").trim() || externo.slice(0, 400);
  if (!idea) throw new Error("Escribe primero la idea concreta de la historia.");
  if (!process.env.LLM_API_KEY) return { ...templateSeries(input), notice: "El servidor no tiene clave de IA: se usó la plantilla local." };
  try {
    const count = sceneCountFor(duration, input.scenes);
    const type = externo ? "adaptacion" : String(input.replica || "").trim() ? "replica" : "nueva";
    const system = `${styleRules(style)}${extraContext(input)}\n\n${sceneBrief(style, count)}\n\n${miPedido(input, style, duration, count, type)}\n\n${externo ? `${adaptarReglas(count)}\n\n` : ""}${String(input.personajesExternos || "").trim() ? `PERSONAJES CANÓNICOS YA DEFINIDOS (otra IA; úsalos con estos nombres y no cambies su apariencia): ${String(input.personajesExternos).slice(0, 12000)}\n\n` : ""}TAREA: crea una SERIE NUEVA a partir del pedido${externo ? " (el guion recibido es su episodio 1: el elenco son sus personajes)" : ""} y escribe su EPISODIO 1 (Parte 1). Elenco de 3 a 6 personajes.
Responde SOLO JSON: {"series":{"title":"","logline":"","world":"","tone":""},"characters":[${CAST_FIELDS(style)}],"episode":{"title":"","summary":"3-4 frases con el cliffhanger final","hook":["línea 1","línea 2"],"coverText":"","description":"","hashtags":[],${FICHA_SCHEMA},${BIBLE_SCHEMA(style)}${PUBLISH_SCHEMA},${SCENES_SCHEMA}}}`;
    const parsed = await askJson(system, JSON.stringify({ idea, duracionSegundos: duration, cuentaPrincipal: input.account?.name, notas: input.notes, ...(externo ? { guionExterno: externo } : {}) }));
    // Elenco sin fruta o con nombres genéricos: primero se le pide a la IA solo el elenco
    // (llamada corta); lo que siga faltando lo completa el código en normalizeCast.
    const biblioteca = String(input.personajesExternos || "").trim() ? normalizarPersonajes(String(input.personajesExternos)) : null;
    const fijos = biblioteca ? elencoDesdeBiblioteca(biblioteca, style) : String(input.personajesExternos || "").trim() ? personajesSinIA(String(input.personajesExternos)) : [];
    let chars: any = fijos.length ? fijos : parsed.characters;
    if (isFruitStyle(style) && castNeedsRepair(chars, style)) chars = await repairCast(chars, style, idea, Math.min(25000, 120000 - (Date.now() - startedAt)));
    const characters = biblioteca && fijos.length ? (fijos as CastMember[]) : normalizeCast(chars, style).slice(0, 6);
    const episodeRaw = await ensureNarratorEnding(renameSpeakers(parsed.episode || parsed, parsed.characters, characters), idea, style, Math.min(25000, 150000 - (Date.now() - startedAt)));
    const title = String(parsed.series?.title || idea).trim().slice(0, 100);
    const episode = buildProduction(episodeRaw, { style, duration, scenes: count, characters, idea, chosenHook: input.chosenHook, seriesTitle: title, partNumber: 1 });
    const mode = providerMode();
    try { validateEpisode(episode, count); }
    catch (qualityError) {
      const issue = qualityError instanceof Error ? qualityError.message : String(qualityError);
      return { mode: "gemini-borrador", notice: `Gemini escribió el guion, pero ${issue}. Se guardó como borrador para revisión; no se enviará a producción.`, series: { title, logline: String(parsed.series?.logline || idea).trim(), world: String(parsed.series?.world || ""), tone: String(parsed.series?.tone || ""), style }, characters, episode: { ...episode, mode: "gemini-borrador", qualityIssues: [issue] } };
    }
    return { mode, series: { title, logline: String(parsed.series?.logline || idea).trim(), world: String(parsed.series?.world || ""), tone: String(parsed.series?.tone || ""), style }, characters, episode: { ...episode, mode } };
  } catch (error) {
    return { ...templateSeries(input), notice: fallbackNotice(error) };
  }
}

export function templateSeries(input: any) { return conAspecto(templateSeriesBase(input), aspectoDe(input?.formato)); }
function templateSeriesBase(input: any) {
  const style = styleKey(input.style);
  const idea = String(input.idea || "").trim() || guionExterno(input).slice(0, 120) || "Nueva historia";
  const duration = Number(input.duration || 90);
  const externo = guionExterno(input);
  const count = sceneCountFor(duration, input.scenes);
  const delGuion = externo ? guionExternoSinIA(externo, count) : [];
  const nombres = Array.from(new Set(delGuion.map(e => e.speaker).filter(n => !/^narrador$/i.test(n)))).slice(0, 6);
  const fijos = String(input.personajesExternos || "").trim() ? personajesSinIA(String(input.personajesExternos)) : [];
  const characters = fijos.length ? normalizeCast(fijos, style) : nombres.length ? normalizeCast(nombres.map(name => ({ name })), style) : templateCast(idea, style);
  const raw = delGuion.length ? { title: "Episodio 1", summary: externo.slice(0, 300), scenes: delGuion } : templateScenes(idea, characters, style, count);
  const episode = buildProduction(raw, { style, duration, scenes: input.scenes, characters, idea, chosenHook: input.chosenHook, seriesTitle: idea.slice(0, 60), partNumber: 1 });
  return { mode: "plantilla-local", series: { title: idea.slice(0, 60), logline: idea, world: "", tone: "", style }, characters, episode: { ...episode, mode: "plantilla-local" } };
}

// ---------- CONTINUAR UNA SERIE ----------
export async function generateNextEpisode(input: any) { return conAspecto(await generateNextEpisodeBase(input), aspectoDe(input?.formato)); }
async function generateNextEpisodeBase(input: any) {
  const externo = guionExterno(input);
  const startedAt = Date.now();
  const style = styleKey(input.style);
  const duration = Number(input.duration || 90);
  if (!process.env.LLM_API_KEY) return { ...templateNext(input), notice: "El servidor no tiene clave de IA: se usó la plantilla local." };
  const existing = normalizeCast(input.characters, style);
  try {
    const count = sceneCountFor(duration, input.scenes);
    const castSheet = existing.map(c => isFruitStyle(style)
      ? `- ${c.name} (${c.role}): piel de ${c.fruit} — ${c.headES}. Ropa: ${c.clothing}. Voz: ${c.voice}.`
      : `- ${c.name} (${c.role}): ${c.visualES}. Ropa: ${c.clothing}. Voz: ${c.voice}.`).join("\n");
    const system = `${styleRules(style)}${extraContext(input)}\n\n${sceneBrief(style, count)}\n\n${miPedido(input, style, duration, count, externo ? "adaptacion" : "continuacion")}\n\n${externo ? `${adaptarReglas(count)}\n\nTAREA: adapta el guion recibido como el EPISODIO ${input.partNumber} de la serie "${input.series?.title}" con el elenco fijo (si el guion usa otros nombres para ellos, usa los del elenco; si trae personajes nuevos, créalos en newCharacters).${existing.some(c => fichaGenerica(c)) ? `\nFICHAS POR COMPLETAR: ${existing.filter(c => fichaGenerica(c)).map(c => c.name).join(", ")} tienen una ficha genérica sin descripción real. Escribe sus fichas en "castUpdates" (mismo nombre) con apariencia física fija, edad, vestuario y voz según el guion, la época y el estilo.` : ""}` : `TAREA: escribe el EPISODIO ${input.partNumber} de la serie "${input.series?.title}", continuando exactamente donde terminó el anterior (retoma su cliffhanger en la escena 1; si es para TikTok/Facebook puede abrir con "Anteriormente...").${(() => { const c = String((input.history || []).slice(-1)[0]?.cliffhanger || "").trim(); return c ? `\nEL PÚBLICO SE QUEDÓ CON ESTE CIERRE: «${c}». La escena 1 retoma exactamente esa acción (sin repetir la frase y SIN resolver todavía el misterio: si alguien se iba, primero se le persigue o se le ve de espaldas; la revelación llega a mitad del episodio), la tensión sube escena a escena y el episodio termina con un cliffhanger nuevo, más fuerte, que haga pedir la parte siguiente en los comentarios.` : ""; })()}${input.nextPlan ? `\nLO QUE SE GUARDA PARA LA PARTE SIGUIENTE (no lo abras ni lo reveles en esta; como mucho, que aparezca cerrado al final como cliffhanger): «${String(input.nextPlan).slice(0, 600)}».` : ""}`}
ELENCO FIJO (reutilízalo SIN cambiar nombre, fruta, cara ni ropa; sus fichas ya están aprobadas):
${castSheet}${input.signatureSong ? `
CANCIÓN DE FIRMA de la serie (repítela tal cual en social.music): ${String(input.signatureSong).slice(0, 200)}` : ""}
Si la historia necesita un personaje nuevo, créalo en newCharacters (máximo 2) con una fruta que no use nadie del elenco.
Responde SOLO JSON: {${externo ? `"castUpdates":[${CAST_FIELDS(style)}],` : ""}"episode":{"title":"","summary":"","hook":["",""],"coverText":"","description":"","hashtags":[],${FICHA_SCHEMA},${BIBLE_SCHEMA(style)}${PUBLISH_SCHEMA},${SCENES_SCHEMA}},"newCharacters":[${CAST_FIELDS(style)}]}`;
    const parsed = await askJson(system, JSON.stringify({
      serie: input.series, mundo: input.bible, episodiosAnteriores: input.history,
      deseoDelUsuario: input.wish || "Decide tú lo que pasa para que enganche más", duracionSegundos: duration, ...(externo ? { guionExterno: externo } : {}),
    }));
    const known = new Set(existing.map(c => norm(c.name)));
    const newRows = (Array.isArray(parsed.newCharacters) ? parsed.newCharacters : []).filter((c: any) => c?.name && !known.has(norm(c.name))).slice(0, 2);
    const newCharacters = normalizeCast(newRows, style, { taken: existing });
    // Fichas genéricas completadas por la IA desde el guion (mismo nombre): se usan en este episodio y se devuelven para guardarlas.
    const genericos = new Set(existing.filter(c => fichaGenerica(c)).map(c => norm(c.name)));
    const filasUpd = (Array.isArray(parsed.castUpdates) ? parsed.castUpdates : []).filter((c: any) => c?.name && genericos.has(norm(c.name)));
    const castUpdates = filasUpd.map((f: any) => { const prev = existing.find(c => norm(c.name) === norm(f.name))!; const [n] = normalizeCast([{ ...f, name: prev.name, subtitleColor: prev.subtitleColor }], style); return { ...n, name: prev.name, subtitleColor: prev.subtitleColor }; });
    const fijos = existing.map(c => castUpdates.find((u: CastMember) => u.name === c.name) || c);
    const characters = [...fijos, ...newCharacters];
    const episodeRaw = await ensureNarratorEnding(parsed.episode || parsed, String(input.wish || input.series?.title || ""), style, Math.min(25000, 150000 - (Date.now() - startedAt)));
    const episode = buildProduction(episodeRaw, { style, duration, scenes: count, characters, idea: String(input.wish || input.series?.title || ""), chosenHook: input.chosenHook, seriesTitle: String(input.series?.title || "Serie"), partNumber: Number(input.partNumber || 2), previousSummary: String((input.history || []).slice(-1)[0]?.summary || "") });
    const mode = providerMode();
    try { validateEpisode(episode, count); }
    catch (qualityError) {
      const issue = qualityError instanceof Error ? qualityError.message : String(qualityError);
      return { mode: "gemini-borrador", notice: `Gemini escribió el episodio, pero ${issue}. Se guardó como borrador para revisión; no se enviará a producción.`, episode: { ...episode, mode: "gemini-borrador", qualityIssues: [issue] }, newCharacters, castUpdates };
    }
    return { mode, episode: { ...episode, mode }, newCharacters, castUpdates };
  } catch (error) {
    return { ...templateNext(input), notice: fallbackNotice(error) };
  }
}

export function templateNext(input: any) { return conAspecto(templateNextBase(input), aspectoDe(input?.formato)); }
function templateNextBase(input: any) {
  const style = styleKey(input.style);
  const duration = Number(input.duration || 90);
  const characters = normalizeCast(input.characters, style);
  const cast = characters.length >= 2 ? characters : templateCast(String(input.series?.title || ""), style);
  const externo = guionExterno(input);
  const delGuion = externo ? guionExternoSinIA(externo, sceneCountFor(duration, input.scenes)) : [];
  const raw = delGuion.length ? { title: `Episodio ${Number(input.partNumber || 2)}`, summary: externo.slice(0, 300), scenes: delGuion } : templateScenes(String(input.wish || ""), cast, style, sceneCountFor(duration, input.scenes));
  const part = Number(input.partNumber || 2);
  const episode = buildProduction({ ...raw, title: `Episodio ${part}`, summary: input.wish || "Continuación (plantilla local)." },
    { style, duration, scenes: input.scenes, characters: cast, idea: String(input.wish || input.series?.title || ""), chosenHook: input.chosenHook, seriesTitle: String(input.series?.title || "Serie"), partNumber: part, previousSummary: String((input.history || []).slice(-1)[0]?.summary || "") });
  return { mode: "plantilla-local", episode: { ...episode, mode: "plantilla-local" }, newCharacters: [] as CastMember[] };
}

// ---------- BANCO DE GANCHOS: 5 VARIANTES ----------
export async function generateHookVariants(input: any): Promise<{ mode: string; variants: HookVariant[] }> {
  if (!process.env.LLM_API_KEY) return { mode: "plantilla-local", variants: templateHookVariants(input) };
  const st = STYLES[styleKey(input.style)];
  const system = `${MANUAL_VIRAL}${accountBlock(input)}${input.learnings ? "\n\n" + input.learnings : ""}

TAREA: propón 5 GANCHOS distintos para los primeros 3 segundos del episodio. Cada gancho son 2 líneas cortas de texto en pantalla (máximo 8 palabras por línea), en español, sin presentaciones, con conflicto o intriga visible desde el segundo 0. Usa 5 mecanismos DIFERENTES (ironía dramática, bomba de tiempo, revelación con objeto, humillación pública, pregunta directa…). Si hay ganchos ganadores en el banco, imita su estructura sin copiarlos.
ESTILO: ${st.label}
Responde SOLO JSON válido: {"variants":[{"lines":["línea 1","línea 2"],"why":"por qué engancha, 1 frase"}]}`;
  try {
    const raw = await callLLM(system, JSON.stringify({ idea: input.idea, deseo: input.wish, serie: input.series, personajes: (input.characters || []).map((c: any) => c.name), episodiosAnteriores: input.history, bancoDeGanchos: input.bank }), { json: true });
    const v = (parseJson(raw).variants || []).filter((x: any) => Array.isArray(x?.lines) && x.lines.length).slice(0, 5).map((x: any) => ({ lines: x.lines.slice(0, 2).map(String), why: String(x.why || "") }));
    return v.length ? { mode: "llm", variants: v } : { mode: "plantilla-local", variants: templateHookVariants(input) };
  } catch { return { mode: "plantilla-local", variants: templateHookVariants(input) }; }
}

// ---------- IDEAS CON IA (conversación) ----------
// Ideas nuevas en el formato que funciona; evita repetir lo ya propuesto. Si la IA no responde,
// se usan combinaciones al azar (templateIdeas), nunca una lista fija.
export async function generateIdeas(input: IdeasRequest): Promise<{ mode: string; reply: string; ideas: StoryIdea[] }> {
  const style = styleKey(input.style);
  const count = Math.min(6, Math.max(1, Number(input.count) || 5));
  const fallback = (why?: string) => ({ mode: "plantilla-local", reply: why ? `La IA no respondió (${why}). Te dejo combinaciones nuevas al azar con la misma fórmula.` : "Ideas combinadas al azar con la fórmula que funciona.", ideas: templateIdeas({ ...input, style, count }) });
  if (!process.env.LLM_API_KEY) return fallback();
  const bib = input.biblical?.character?.trim();
  const biblical = bib ? `PERSONAJE BÍBLICO: ${bib}. MODALIDAD: ${input.biblical?.mode === "moderna"
    ? "adaptación moderna (la misma estructura del relato llevada a la República Dominicana de hoy: barrio, iglesia evangélica, Nueva York, remesas…)"
    : "época bíblica (escenarios, vestuario y costumbres de la época, sin ningún elemento moderno)"}.
Respeta los hechos principales del relato y su enseñanza; indica biblicalBase (libro capítulo:versículos). Los diálogos son dramatización: nunca los presentes como citas bíblicas literales. Lleva el relato a la fórmula viral: empieza por su momento más humillante o dramático, con un objeto que revela y un giro.` : "";
  const system = `${styleRules(style)}${accountBlock(input)}

TAREA: eres el director creativo. Propón ${count} ideas NUEVAS para ${STYLES[style].label}, distintas entre sí y distintas de todo lo que aparece en EVITAR.
Cada idea cumple la fórmula: conflicto o humillación visible en el segundo 0-1, juego de estatus, revelación mediante un objeto, escalada, giro final y narrador solo en la última frase${style === "cristiana" ? ', y cierre con la frase del mensaje (sin pedir comentarios)' : style === "biblica" ? ", cierre con la frase del mensaje y su versículo; cada idea es una historia bíblica DISTINTA del banco llevada a la RD de hoy (no repitas tipo)" : style === "epica" ? ", con personajes bíblicos en escenarios bíblicos (nada dominicano ni moderno), lo invisible que se revela (ángeles, carros de fuego, cielo abierto), cierre con el mensaje y su versículo; los apócrifos solo «inspirados en»" : ""}. Varía los mecanismos entre ideas (madre negada, amor prohibido por clase, traición o hijo escondido, herencia, ironía dramática, bomba de tiempo). Identidad dominicana.
${biblical}
Si el usuario pide algo concreto en la conversación, priorízalo.
Responde SOLO JSON: {"reply":"1-2 frases para el usuario","ideas":[{"title":"","idea":"una o dos frases para el formulario","hook":["línea 1 (máx 7 palabras)","línea 2"],"object":"","twist":"","mechanism":"","cast":[{"name":"","fruit":"","role":""}],"biblicalBase":"","why":"por qué engancha"}]}`;
  try {
    const parsed = await askJson(system, JSON.stringify({
      pedido: input.direction || "Sorpréndeme con ideas que enganchen",
      conversacion: (input.history || []).slice(-8),
      evitar: (input.avoid || []).slice(-60),
    }));
    const ideas: StoryIdea[] = (Array.isArray(parsed.ideas) ? parsed.ideas : []).filter((x: any) => x && String(x.idea || "").trim()).slice(0, count).map((x: any) => ({
      title: String(x.title || "").trim() || String(x.idea).slice(0, 50),
      idea: String(x.idea).trim(),
      hook: (Array.isArray(x.hook) ? x.hook : []).map((l: unknown) => String(l).trim()).filter(Boolean).slice(0, 2),
      object: String(x.object || "").trim() || undefined, twist: String(x.twist || "").trim() || undefined,
      mechanism: String(x.mechanism || "").trim() || undefined,
      cast: Array.isArray(x.cast) ? x.cast.filter((c: any) => c?.name).slice(0, 6).map((c: any) => ({ name: String(c.name), fruit: c.fruit ? String(c.fruit) : undefined, role: String(c.role || "") })) : undefined,
      biblicalBase: String(x.biblicalBase || "").trim() || undefined, why: String(x.why || "").trim() || undefined,
    }));
    if (!ideas.length) return fallback("respuesta sin ideas");
    if (style === "cristiana" || style === "biblica" || style === "epica") for (const i of ideas) {
      i.title = christianSafe(i.title); i.idea = christianSafe(i.idea); i.hook = i.hook.map(christianSafe);
      if (i.object) i.object = christianSafe(i.object); if (i.twist) i.twist = christianSafe(i.twist);
    }
    return { mode: providerMode(), reply: String(parsed.reply || "").trim() || "Aquí tienes ideas nuevas.", ideas };
  } catch (e: any) { return fallback(e?.message || String(e)); }
}

// ---------- ADAPTAR PERSONAJES DE OTRA IA ----------
// Fichas escritas en otra herramienta (texto o JSON) → elenco de la app (nombre, apariencia, ropa, voz,
// acento, prompt de ficha para Flow). Conserva lo que traen y completa lo que falte según el estilo.
const CLAVES_PJ = {
  name: ["name", "nombre", "personaje", "character"],
  role: ["role", "rol", "papel", "funcion", "función"],
  visualES: ["descripcion_maestra", "visuales", "apariencia", "descripcion", "descripción", "aspecto", "fisico", "físico", "appearance", "description", "look"],
  visualEN: ["visualen", "appearance_en", "description_en"],
  clothing: ["clothing", "ropa", "vestuario", "outfit", "costume", "vestimenta"],
  voice: ["voice", "voz"],
  speechStyle: ["speechstyle", "acento", "accent", "habla", "forma_de_hablar"],
  fruit: ["fruit", "fruta"],
  headES: ["heades", "cabeza", "rostro", "cara", "face"],
  flowPrompt: ["flowprompt", "prompt", "prompt_ficha", "image_prompt"],
};
export function personajesSinIA(texto: string): any[] {
  const t = String(texto || "").trim(); if (!t) return [];
  let datos: any = null; try { datos = JSON.parse(t); } catch { /* texto */ }
  if (datos) {
    const out: any[] = [];
    const visitar = (n: any) => {
      if (Array.isArray(n)) { n.forEach(visitar); return; }
      if (!n || typeof n !== "object") return;
      const nombre = tomar(n, CLAVES_PJ.name);
      if (nombre && /voz[_ ]en[_ ]off|narrador/i.test(`${tomar(n, ["tipo", "type"])} ${nombre}`)) return;   // el Narrador es una voz, no una ficha visual
      if (nombre && nombre.length <= 40) {
        const fila: any = { name: nombre };
        for (const [k, ks] of Object.entries(CLAVES_PJ)) if (k !== "name") { const v = tomar(n, ks); if (v) fila[k] = v; }
        if (fila.visualES || fila.clothing || fila.role || fila.voice || fila.headES) { out.push(fila); return; }
      }
      Object.values(n).forEach(v => { if (v && typeof v === "object") visitar(v); });
    };
    visitar(datos);
    return out;
  }
  // Texto: «NOMBRE: descripción» por línea, o un encabezado (## Nombre / NOMBRE) con su descripción debajo.
  const filas: any[] = []; let actual: any = null;
  for (const raw of t.split("\n")) {
    const l = raw.trim(); if (!l) continue;
    const cab = l.match(/^#{1,4}\s*(.{2,40})$/) || l.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ .]{1,38})$/);
    const par = l.match(/^[-*]?\s*\**([A-ZÁÉÍÓÚÑa-záéíóúñ][\wÁÉÍÓÚÑáéíóúñ .]{1,38}?)\**\s*[:：—–]\s*(.{6,})$/);
    if (cab) { actual = { name: cab[1].replace(/\*/g, "").trim(), visualES: "" }; filas.push(actual); continue; }
    if (par && !actual) { filas.push({ name: par[1].trim(), visualES: par[2].trim() }); continue; }
    if (actual) {
      const campo = l.match(/^[-*]?\s*\**(rol|papel|ropa|vestuario|voz|acento|apariencia|aspecto)\**\s*[:：]\s*(.+)$/i);
      if (campo) { const k = campo[1].toLowerCase(); const v = campo[2].trim().replace(/\.$/, "");
        if (/rol|papel/.test(k)) actual.role = v; else if (/ropa|vestuario/.test(k)) actual.clothing = v; else if (k === "voz") actual.voice = v; else if (k === "acento") actual.speechStyle = `Acento: ${v}`; else actual.visualES = `${actual.visualES} ${v}`.trim(); }
      else actual.visualES = `${actual.visualES} ${l.replace(/^[-*]\s*/, "")}`.trim();
    } else if (par) filas.push({ name: par[1].trim(), visualES: par[2].trim() });
  }
  return filas.filter(f => f.name && !/^(personajes|elenco|cast)$/i.test(f.name));
}

const recortarTexto = (v: unknown) => String(v ?? "").replace(/\r/g, "").trim().slice(0, 40000);
export function adaptarPersonajesLocal(input: any) {
  const style = styleKey(input.style);
  const characters = normalizeCast(personajesSinIA(recortarTexto(input.texto)), style).slice(0, 12);
  return conAspecto({ mode: "plantilla-local", characters }, aspectoDe(input?.formato));
}
export async function adaptarPersonajes(input: any) {
  const style = styleKey(input.style);
  const texto = recortarTexto(input.texto);
  if (!texto) throw new Error("Pega o sube primero los personajes.");
  if (!process.env.LLM_API_KEY) return { ...adaptarPersonajesLocal(input), notice: "El servidor no tiene clave de IA: se leyeron las fichas tal cual." };
  try {
    const existentes = (Array.isArray(input.existentes) ? input.existentes : []).map((n: unknown) => String(n)).filter(Boolean);
    const system = `${styleRules(style)}

TAREA: adapta al formato de esta app las FICHAS DE PERSONAJES que escribió otra IA (texto libre o JSON, en «personajes»).
- Conserva cada personaje con su nombre, edad, rasgos, apariencia, vestuario, voz y forma de hablar. No inventes personajes que no estén ni cambies a nadie.
- Completa solo lo que falte, coherente con el estilo de la serie, y escribe la apariencia de forma visual y fija (para que la cara y la ropa no cambien entre escenas).
${existentes.length ? `- La serie ya tiene a: ${existentes.join(", ")}. Si el texto describe a alguno de ellos, usa EXACTAMENTE ese nombre.\n` : ""}Responde SOLO JSON: {"characters":[${CAST_FIELDS(style)}]}`;
    const parsed = await askJson(system, JSON.stringify({ personajes: texto }));
    const characters = normalizeCast(parsed.characters || parsed, style).slice(0, 12);
    if (!characters.length) throw new Error("la IA no devolvió personajes");
    return conAspecto({ mode: providerMode(), characters }, aspectoDe(input?.formato));
  } catch (error) {
    const local = adaptarPersonajesLocal(input);
    return { ...local, notice: `La IA no respondió (${error instanceof Error ? error.message : String(error)}). Se leyeron las fichas tal cual.` };
  }
}

// ---------- IMPORTAR UN CAPÍTULO CON LA ESTRUCTURA DEL ESTUDIO ----------
// capitulo.json (el que descarga Archivos, o el que otra IA escriba con esa estructura): se importa tal cual,
// sin IA. Sus escenas, ficha, gancho y redes se conservan; los prompts se rehacen con las reglas actuales.
export function capituloDeJson(texto: string): any | null {
  let d: any; try { d = JSON.parse(String(texto || "")); } catch { return null; }
  const ep = d?.episode || d?.episodio || d?.capitulo || d?.output || d;
  const escenas = Array.isArray(ep?.scenes) ? ep.scenes : null;
  if (!escenas?.length || !escenas.every((s: any) => s && typeof s === "object" && typeof s.line === "string" && typeof s.speaker === "string")) return null;
  return { episodio: ep, serie: d?.series || d?.serie || null, personajes: d?.characters || d?.personajes || ep?.cast || null };
}
export function importarCapitulo(input: any) {
  const cap = capituloDeJson(String(input?.guionExterno || ""));   // entero: el recorte de 60 000 es solo para la IA
  if (!cap) throw new Error("El JSON no tiene la estructura de capítulo del estudio (scenes con speaker y line).");
  const ep = cap.episodio;
  const style = styleKey(input.style || ep?.seriesBible?.style || cap.serie?.style);
  const duration = Number(input.duration || 90);
  const externos = String(input.personajesExternos || "").trim();
  const filas = externos ? personajesSinIA(externos) : Array.isArray(cap.personajes) ? cap.personajes : [];
  const hablantes = Array.from(new Set(ep.scenes.map((s: any) => String(s.speaker)).filter((n: string) => n && !/^narrador/i.test(n))));
  const characters = normalizeCast(filas.length ? filas : hablantes.map(name => ({ name })), style).slice(0, 12);
  const raw = { ...ep, scenes: ep.scenes.map((s: any) => ({ ...s, onScreen: s.onScreen || s.characters || [], link: s.link || s.nextLink })) };
  const title = String(cap.serie?.title || ep.seriesTitle || ep.title || "Serie importada").slice(0, 100);
  const count = Math.min(30, ep.scenes.length);
  const episode = buildProduction(raw, { style, duration, scenes: count, characters, idea: String(ep.summary || title), seriesTitle: title, partNumber: Number(ep.partNumber || 1) });
  const extra = Object.fromEntries(["seriesBible", "ficha", "social", "platformAdaptations", "hook", "coverText"].filter(k => ep[k] !== undefined && (episode as any)[k] === undefined).map(k => [k, ep[k]]));
  return conAspecto({
    mode: "importado",
    notice: `Capítulo importado tal cual (${episode.scenes.length} escenas, ${characters.length} personajes), sin usar IA.${ep.scenes.length > 30 ? " Traía más de 30 escenas: se conservaron gancho, cierre y las más importantes." : ""}`,
    series: { title, logline: String(cap.serie?.logline || ep.summary || ""), world: String(cap.serie?.world || ""), tone: String(cap.serie?.tone || ""), style },
    characters, episode: { ...extra, ...episode, mode: "importado" },
  }, aspectoDe(input?.formato));
}
