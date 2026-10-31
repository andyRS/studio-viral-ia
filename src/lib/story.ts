// Creación de historias nuevas y continuidad de series.
// La IA escribe elenco y escenas; el código valida, repara el elenco de frutas y construye
// todos los prompts de producción (production.ts). Si la IA no responde, plantilla local con aviso.
import { callLLM } from "./llm";
import { jsonrepair } from "jsonrepair";
import { BIBLE_BANK, EPIC_BANK, EPIC_NOTICE, CHRISTIAN_RULES, FRUIT_CAST_RULES, MANUAL_VIRAL, STYLES, type StyleKey } from "./knowledge";
import { templateHookVariants, type HookVariant } from "./hooks";
import { castNeedsRepair, isFruitStyle, norm, normalizeCast, templateCast, type CastMember } from "./cast";
import { buildProduction, NARRATOR, sceneCountFor, templateScenes } from "./production";
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
async function askJson(system: string, user: string) {
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
MODOS: B-Épico (en la antigüedad, escenas reales del texto bíblico con realismo de cine) o B-Puente (un ángel o una batalla espiritual irrumpe en una situación de la República Dominicana de hoy: se ve la dimensión espiritual que los personajes NO ven; esa ironía dramática es lo que más engancha).
BANCO (elige uno que NO esté en «ya usadas»):
${EPIC_BANK.map(b => `- [${b.mode}] ${b.story}: ${b.idea} → «${b.message}» (${b.verse})`).join("\n")}
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

// Sección «MI PEDIDO» del prompt maestro, con los datos del formulario.
function miPedido(input: any, style: StyleKey, duration: number, count: number, type: "nueva" | "continuacion" | "replica") {
  const tipo = type === "replica" ? `réplica de un viral ajeno (copia la estructura y la emoción, nunca personajes, diálogo literal ni marca). Viral: ${String(input.replica || "").trim() || "(sin descripción)"}`
    : type === "continuacion" ? "continuación (debe entenderse sola, sin haber visto las anteriores)" : "historia nueva (Parte 1 que se entiende sola)";
  return `## MI PEDIDO
- Estilo: ${STYLES[style].label}
- Idea: ${String(input.idea || input.wish || "").trim() || "decide tú lo que más enganche"}
- Tipo: ${tipo}
- Duración del vídeo montado: unos ${duration} s (${count} escenas; cada clip se genera de 8 s y el montaje lo recorta a su frase y reacción)
- Notas: ${String(input.notes || "").trim() || "ninguna"}`;
}

const CAST_FIELDS = (style: StyleKey) => isFruitStyle(style)
  ? `{"name":"nombre dominicano con la fruta (p. ej. Platanito, Don Coco)","fruit":"plátano","fruitEmoji":"🍌","role":"protagonista humilde","headES":"piel amarillo plátano con suaves pintas marrones; pequeño tallo verde de plátano asomando en el peinado; pelo negro rizado corto, ojos color miel (descríbelo PROPIO para cada personaje según su fruta, edad y sexo)","clothing":"${style === "cristiana" ? "ropa fija, elegante y de manga larga, con un color propio reconocible, y accesorios" : "ropa fija con un color propio reconocible: elegante, o atractiva y a la moda si el personaje es coqueto o seductor (top corto, shorts o jeans ajustados, vestido ceñido)"}","voice":"edad, tono y manera de hablar","speechStyle":"Acento: dominicano marcado | latino neutro (u otro si la historia lo pide). Muletillas","subtitleColor":"FFE14D","pronunciations":["palabra = SÍ-la-bas, nunca X"]}`
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
4. ${style === "cine90" ? `LA VIDA REAL DE LOS 90 cuenta la historia (2 o 3 escenas por episodio, campo "phone"): una llamada por teléfono fijo de cable o desde una cabina en la que SE OYE lo que dice la otra persona (type "llamada": el "speaker" es quien llama y NO está en "onScreen"; en "setting" quien escucha con el auricular en la oreja), un mensaje en la contestadora (type "nota_de_voz"), una carta, un beeper o una foto Polaroid. Nada de móviles ni internet: es 1990-1999.` : `LA VIDA DE HOY cuenta la historia, como en los virales (2 o 3 escenas por episodio, campo "phone"): un chat de WhatsApp que el público lee en pantalla (type "whatsapp": "contact" = el nombre del chat y "messages" = 2 a 4 mensajes exactos, cortos y escritos como se escribe de verdad: «Ya llegaste mi amor?», «No me escribas a este número»; quien lo lee reacciona con su frase), una llamada en la que SE OYE lo que dice la otra persona (type "llamada": el "speaker" es quien llama y NO está en "onScreen"; en "setting" quien escucha con el móvil en la oreja), una videollamada en pantalla partida (type "videollamada": los dos en "onScreen") o una nota de voz (type "nota_de_voz": habla quien la grabó, que no está en escena). Suma detalles reales de la República Dominicana de hoy: delivery en moto, transferencia del banco en el móvil, captura de pantalla, prueba de embarazo, cámara de seguridad, historia de Instagram, colmado, yipeta, apagón. En las demás escenas, "phone" = null.`}
5. Saltos de tiempo marcados: si pasa el tiempo antes de una escena, su "transition" es la tarjeta («Horas después...», «Días después...»).
6. Antes del final, el personaje con el secreto queda a solas (espejo, baño, cama) y confiesa en voz alta su miedo o su culpa con una cuenta atrás concreta («regresa en dos semanas»).
7. ${style === "cristiana" ? "En la frutinovela cristiana todos hablan con vocabulario neutro; el acento, dominicano suave (ponlo en \"speechStyle\" como «Acento: dominicano suave»)." : "El acento es parte del personaje: uno o dos (el tíguere, el pícaro, el seductor, la doña del barrio) hablan con acento dominicano marcado y el resto en latino neutro; si la historia trae a alguien de fuera, con su acento (p. ej. venezolano). Indícalo en \"speechStyle\" como «Acento: …»."}
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
  : style === "epica" ? `"bible":{"story":"tema del banco","mode":"B-Épico o B-Puente","verse":"Libro capítulo:versículo, bien citado (p. ej. Salmo 34:7)","verseText":"el versículo, corto (RVR1960)","message":"el mensaje en una frase","invisible":"lo invisible que se revela","impact":"el plano de impacto del segundo 0","apocryphal":false},` : "";
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
function validateEpisode(episode: ReturnType<typeof buildProduction>, duration: number) {
  const expected = sceneCountFor(duration);
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
export async function generateSeries(input: any) {
  const startedAt = Date.now();
  const style = styleKey(input.style);
  const duration = Number(input.duration || 90);
  const idea = String(input.idea || input.replica || "").trim();
  if (!idea) throw new Error("Escribe primero la idea concreta de la historia.");
  if (!process.env.LLM_API_KEY) return { ...templateSeries(input), notice: "El servidor no tiene clave de IA: se usó la plantilla local." };
  try {
    const count = sceneCountFor(duration);
    const type = String(input.replica || "").trim() ? "replica" : "nueva";
    const system = `${styleRules(style)}${extraContext(input)}\n\n${sceneBrief(style, count)}\n\n${miPedido(input, style, duration, count, type)}\n\nTAREA: crea una SERIE NUEVA a partir del pedido y escribe su EPISODIO 1 (Parte 1). Elenco de 3 a 6 personajes.
Responde SOLO JSON: {"series":{"title":"","logline":"","world":"","tone":""},"characters":[${CAST_FIELDS(style)}],"episode":{"title":"","summary":"3-4 frases con el cliffhanger final","hook":["línea 1","línea 2"],"coverText":"","description":"","hashtags":[],${FICHA_SCHEMA},${BIBLE_SCHEMA(style)}${PUBLISH_SCHEMA},${SCENES_SCHEMA}}}`;
    const parsed = await askJson(system, JSON.stringify({ idea, duracionSegundos: duration, cuentaPrincipal: input.account?.name, notas: input.notes }));
    // Elenco sin fruta o con nombres genéricos: primero se le pide a la IA solo el elenco
    // (llamada corta); lo que siga faltando lo completa el código en normalizeCast.
    let chars = parsed.characters;
    if (isFruitStyle(style) && castNeedsRepair(chars, style)) chars = await repairCast(chars, style, idea, Math.min(25000, 120000 - (Date.now() - startedAt)));
    const characters = normalizeCast(chars, style).slice(0, 6);
    const episodeRaw = await ensureNarratorEnding(renameSpeakers(parsed.episode || parsed, parsed.characters, characters), idea, style, Math.min(25000, 150000 - (Date.now() - startedAt)));
    const title = String(parsed.series?.title || idea).trim().slice(0, 100);
    const episode = buildProduction(episodeRaw, { style, duration, characters, idea, chosenHook: input.chosenHook, seriesTitle: title, partNumber: 1 });
    const mode = providerMode();
    try { validateEpisode(episode, duration); }
    catch (qualityError) {
      const issue = qualityError instanceof Error ? qualityError.message : String(qualityError);
      return { mode: "gemini-borrador", notice: `Gemini escribió el guion, pero ${issue}. Se guardó como borrador para revisión; no se enviará a producción.`, series: { title, logline: String(parsed.series?.logline || idea).trim(), world: String(parsed.series?.world || ""), tone: String(parsed.series?.tone || ""), style }, characters, episode: { ...episode, mode: "gemini-borrador", qualityIssues: [issue] } };
    }
    return { mode, series: { title, logline: String(parsed.series?.logline || idea).trim(), world: String(parsed.series?.world || ""), tone: String(parsed.series?.tone || ""), style }, characters, episode: { ...episode, mode } };
  } catch (error) {
    return { ...templateSeries(input), notice: fallbackNotice(error) };
  }
}

export function templateSeries(input: any) {
  const style = styleKey(input.style);
  const idea = String(input.idea || "Nueva historia").trim();
  const duration = Number(input.duration || 90);
  const characters = templateCast(idea, style);
  const raw = templateScenes(idea, characters, style, sceneCountFor(duration));
  const episode = buildProduction(raw, { style, duration, characters, idea, chosenHook: input.chosenHook, seriesTitle: idea.slice(0, 60), partNumber: 1 });
  return { mode: "plantilla-local", series: { title: idea.slice(0, 60), logline: idea, world: "", tone: "", style }, characters, episode: { ...episode, mode: "plantilla-local" } };
}

// ---------- CONTINUAR UNA SERIE ----------
export async function generateNextEpisode(input: any) {
  const startedAt = Date.now();
  const style = styleKey(input.style);
  const duration = Number(input.duration || 90);
  if (!process.env.LLM_API_KEY) return { ...templateNext(input), notice: "El servidor no tiene clave de IA: se usó la plantilla local." };
  const existing = normalizeCast(input.characters, style);
  try {
    const count = sceneCountFor(duration);
    const castSheet = existing.map(c => isFruitStyle(style)
      ? `- ${c.name} (${c.role}): piel de ${c.fruit} — ${c.headES}. Ropa: ${c.clothing}. Voz: ${c.voice}.`
      : `- ${c.name} (${c.role}): ${c.visualES}. Ropa: ${c.clothing}. Voz: ${c.voice}.`).join("\n");
    const system = `${styleRules(style)}${extraContext(input)}\n\n${sceneBrief(style, count)}\n\n${miPedido(input, style, duration, count, "continuacion")}\n\nTAREA: escribe el EPISODIO ${input.partNumber} de la serie "${input.series?.title}", continuando exactamente donde terminó el anterior (retoma su cliffhanger en la escena 1; si es para TikTok/Facebook puede abrir con "Anteriormente...").${(() => { const c = String((input.history || []).slice(-1)[0]?.cliffhanger || "").trim(); return c ? `\nEL PÚBLICO SE QUEDÓ CON ESTE CIERRE: «${c}». La escena 1 retoma exactamente esa acción (sin repetir la frase y SIN resolver todavía el misterio: si alguien se iba, primero se le persigue o se le ve de espaldas; la revelación llega a mitad del episodio), la tensión sube escena a escena y el episodio termina con un cliffhanger nuevo, más fuerte, que haga pedir la parte siguiente en los comentarios.` : ""; })()}${input.nextPlan ? `\nLO QUE SE GUARDA PARA LA PARTE SIGUIENTE (no lo abras ni lo reveles en esta; como mucho, que aparezca cerrado al final como cliffhanger): «${String(input.nextPlan).slice(0, 600)}».` : ""}
ELENCO FIJO (reutilízalo SIN cambiar nombre, fruta, cara ni ropa; sus fichas ya están aprobadas):
${castSheet}${input.signatureSong ? `
CANCIÓN DE FIRMA de la serie (repítela tal cual en social.music): ${String(input.signatureSong).slice(0, 200)}` : ""}
Si la historia necesita un personaje nuevo, créalo en newCharacters (máximo 2) con una fruta que no use nadie del elenco.
Responde SOLO JSON: {"episode":{"title":"","summary":"","hook":["",""],"coverText":"","description":"","hashtags":[],${FICHA_SCHEMA},${BIBLE_SCHEMA(style)}${PUBLISH_SCHEMA},${SCENES_SCHEMA}},"newCharacters":[${CAST_FIELDS(style)}]}`;
    const parsed = await askJson(system, JSON.stringify({
      serie: input.series, mundo: input.bible, episodiosAnteriores: input.history,
      deseoDelUsuario: input.wish || "Decide tú lo que pasa para que enganche más", duracionSegundos: duration,
    }));
    const known = new Set(existing.map(c => norm(c.name)));
    const newRows = (Array.isArray(parsed.newCharacters) ? parsed.newCharacters : []).filter((c: any) => c?.name && !known.has(norm(c.name))).slice(0, 2);
    const newCharacters = normalizeCast(newRows, style, { taken: existing });
    const characters = [...existing, ...newCharacters];
    const episodeRaw = await ensureNarratorEnding(parsed.episode || parsed, String(input.wish || input.series?.title || ""), style, Math.min(25000, 150000 - (Date.now() - startedAt)));
    const episode = buildProduction(episodeRaw, { style, duration, characters, idea: String(input.wish || input.series?.title || ""), chosenHook: input.chosenHook, seriesTitle: String(input.series?.title || "Serie"), partNumber: Number(input.partNumber || 2), previousSummary: String((input.history || []).slice(-1)[0]?.summary || "") });
    const mode = providerMode();
    try { validateEpisode(episode, duration); }
    catch (qualityError) {
      const issue = qualityError instanceof Error ? qualityError.message : String(qualityError);
      return { mode: "gemini-borrador", notice: `Gemini escribió el episodio, pero ${issue}. Se guardó como borrador para revisión; no se enviará a producción.`, episode: { ...episode, mode: "gemini-borrador", qualityIssues: [issue] }, newCharacters };
    }
    return { mode, episode: { ...episode, mode }, newCharacters };
  } catch (error) {
    return { ...templateNext(input), notice: fallbackNotice(error) };
  }
}

export function templateNext(input: any) {
  const style = styleKey(input.style);
  const duration = Number(input.duration || 90);
  const characters = normalizeCast(input.characters, style);
  const cast = characters.length >= 2 ? characters : templateCast(String(input.series?.title || ""), style);
  const raw = templateScenes(String(input.wish || ""), cast, style, sceneCountFor(duration));
  const part = Number(input.partNumber || 2);
  const episode = buildProduction({ ...raw, title: `Episodio ${part}`, summary: input.wish || "Continuación (plantilla local)." },
    { style, duration, characters: cast, idea: String(input.wish || input.series?.title || ""), chosenHook: input.chosenHook, seriesTitle: String(input.series?.title || "Serie"), partNumber: part, previousSummary: String((input.history || []).slice(-1)[0]?.summary || "") });
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
Cada idea cumple la fórmula: conflicto o humillación visible en el segundo 0-1, juego de estatus, revelación mediante un objeto, escalada, giro final y narrador solo en la última frase${style === "cristiana" ? ', y cierre con la frase del mensaje (sin pedir comentarios)' : style === "biblica" ? ", cierre con la frase del mensaje y su versículo; cada idea es una historia bíblica DISTINTA del banco llevada a la RD de hoy (no repitas tipo)" : style === "epica" ? ", con lo invisible que se revela (ángeles, carros de fuego, cielo abierto), modo B-Épico o B-Puente, cierre con el mensaje y su versículo; los apócrifos solo «inspirados en»" : ""}. Varía los mecanismos entre ideas (madre negada, amor prohibido por clase, traición o hijo escondido, herencia, ironía dramática, bomba de tiempo). Identidad dominicana.
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
