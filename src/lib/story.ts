// Creación de historias nuevas y continuidad de series.
// La IA escribe elenco y escenas; el código valida, repara el elenco de frutas y construye
// todos los prompts de producción (production.ts). Si la IA no responde, plantilla local con aviso.
import { callLLM } from "./llm";
import { CHRISTIAN_RULES, FRUIT_CAST_RULES, MANUAL_VIRAL, STYLES, type StyleKey } from "./knowledge";
import { templateHookVariants, type HookVariant } from "./hooks";
import { castNeedsRepair, isFruitStyle, norm, normalizeCast, templateCast, type CastMember } from "./cast";
import { buildProduction, NARRATOR, sceneCountFor, templateScenes } from "./production";

export const styleKey = (s?: string): StyleKey => ((s as StyleKey) in STYLES ? (s as StyleKey) : "frutinovela");
const providerMode = () => ((process.env.LLM_PROVIDER || "").toLowerCase() === "gemini" ? "gemini" : "llm");

export function parseJson(raw: string): any {
  const clean = raw.replace(/```json|```/g, "").trim();
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  const body = a >= 0 && b > a ? clean.slice(a, b + 1) : clean;
  try { return JSON.parse(body); }
  catch {
    // Reparaciones de los fallos típicos del modelo: comas sobrantes, comillas tipográficas y saltos de línea crudos.
    const fixed = body.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"').replace(/\r?\n(?=[^"]*"[^"]*(?:"[^"]*"[^"]*)*$)/g, " ");
    return JSON.parse(fixed);
  }
}

// Llama a la IA y lee el JSON; si la respuesta viene rota, la pide una vez más.
async function askJson(system: string, user: string) {
  try { return parseJson(await callLLM(system, user, { json: true })); }
  catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    return parseJson(await callLLM(system + "\n\nIMPORTANTE: tu respuesta anterior no era JSON válido. Devuelve SOLO un objeto JSON válido, sin comas sobrantes.", user, { json: true }));
  }
}

// Aprendizajes de métricas + gancho elegido del banco: contexto extra para el modelo.
function extraContext(input: any) {
  const parts: string[] = [];
  if (input.learnings) parts.push(String(input.learnings));
  const hook = Array.isArray(input.chosenHook) ? input.chosenHook.filter(Boolean) : [];
  if (hook.length) parts.push(`GANCHO ELEGIDO POR EL USUARIO (obligatorio): usa exactamente estas líneas como hook y construye los primeros 3 segundos alrededor de ellas: ${hook.map((l: string) => `"${l}"`).join(" / ")}`);
  return parts.length ? "\n\n" + parts.join("\n\n") : "";
}

function styleRules(style: StyleKey) {
  return [MANUAL_VIRAL, isFruitStyle(style) ? FRUIT_CAST_RULES : "", style === "cristiana" ? CHRISTIAN_RULES : ""].filter(Boolean).join("\n\n");
}

// Sección «MI PEDIDO» del prompt maestro, con los datos del formulario.
function miPedido(input: any, style: StyleKey, duration: number, count: number, type: "nueva" | "continuacion" | "replica") {
  const tipo = type === "replica" ? `réplica de un viral ajeno (copia la estructura y la emoción, nunca personajes, diálogo literal ni marca). Viral: ${String(input.replica || "").trim() || "(sin descripción)"}`
    : type === "continuacion" ? "continuación (debe entenderse sola, sin haber visto las anteriores)" : "historia nueva (Parte 1 que se entiende sola)";
  return `## MI PEDIDO
- Estilo: ${STYLES[style].label}
- Idea: ${String(input.idea || input.wish || "").trim() || "decide tú lo que más enganche"}
- Tipo: ${tipo}
- Duración del máster: ${count * 8} s (${count} escenas de 8 s)
- Notas: ${String(input.notes || "").trim() || "ninguna"}`;
}

const CAST_FIELDS = (style: StyleKey) => isFruitStyle(style)
  ? `{"name":"nombre dominicano con la fruta (p. ej. Platanito, Don Coco)","fruit":"plátano","fruitEmoji":"🍌","role":"protagonista humilde","headES":"cabeza de fruta: forma, color, textura, hojas o semilla, ojos y boca expresivos","clothing":"ropa fija de manga larga y accesorios","voice":"edad, tono y manera de hablar","speechStyle":"","subtitleColor":"FFE14D","pronunciations":["palabra = SÍ-la-bas, nunca X"]}`
  : `{"name":"nombre propio","role":"protagonista","visualES":"apariencia física fija","visualEN":"same appearance in English","clothing":"vestuario fijo de los 90","voice":"edad, tono y manera de hablar","subtitleColor":"FF9A1F","pronunciations":[]}`;

function sceneBrief(style: StyleKey, count: number) {
  const st = STYLES[style];
  return `FORMATO DE ENTREGA (la app construye los prompts de imagen y animación con tus campos: NO los escribas). Usa los hechos concretos de la idea (relaciones, oficio, lugar, objeto que revela, desenlace).
ESTILO VISUAL: ${st.visual}
ESTILO DE VOZ: ${st.voice}
ESCENAS: exactamente ${count} escenas de 8 segundos. En cada escena habla UN SOLO personaje, una frase de 6 a 14 palabras que quepa en 8 s. Escena 1 = conflicto visible desde el segundo 0. Cada escena avanza la historia con información nueva; nada de repetir frases ni escenas. La última frase es del Narrador: "Lo que X no sabe... es que..."${style === "cristiana" ? ' y después el Narrador pide "Escribe AMÉN"' : ""}.
DIÁLOGO: palabras dominicanas escritas completas y con acentos (tíguere, yipeta, jevito, vaina, un chin, mi cualto / lo cualto mío); NUNCA contracciones (pa', vamo', e', ta').
ESTRUCTURA: reparte las escenas como Gancho -> Contexto -> Desarrollo -> Clímax -> Consecuencia -> Resolución (la primera es el Gancho y la última la Resolución). Si la historia es bíblica, indica la base bíblica y no presentes diálogos inventados como citas literales.
"setting" = lugar y acción visual concreta de la escena${isFruitStyle(style) ? "" : " (en inglés)"}; "emotion" = emoción con la que habla; "speaker" = nombre exacto del elenco o "Narrador".`;
}

const SCENES_SCHEMA = `"scenes":[{"title":"título corto de la escena","goal":"objetivo narrativo","setting":"","speaker":"","line":"","emotion":"","onScreen":["nombres presentes"],"sfx":"efectos sonoros","music":"música","transition":"transición","link":"conexión con la siguiente escena"}]`;
// Ficha del episodio y paquete para redes (estructura del prompt maestro).
// Portada, publicación por plataforma y autoevaluación (secciones 5, 6 y 7 del prompt maestro).
const PUBLISH_SCHEMA = `"cover":{"frame":"qué fotograma usar (máxima emoción, sin spoiler)","lines":["línea 1","línea 2"],"part":"PARTE 1"},"platforms":{"facebook":{"title":"","description":"","hashtags":[],"hour":"","cta":"","pinnedComment":""},"tiktok":{"title":"","description":"","hashtags":[],"hour":"","cta":"","pinnedComment":""},"instagram":{"title":"","description":"","hashtags":[],"hour":"","cta":"","pinnedComment":""},"youtube":{"title":"","description":"","hashtags":[],"hour":"","cta":"","pinnedComment":""}},"selfScore":{"hook":0,"clarity":0,"escalation":0,"twist":0,"comments":0}`;
const FICHA_SCHEMA = `"ficha":{"biblicalBase":"libro capítulo:versículos si aplica, si no vacío","synopsis":"","hookImage":"primera imagen impactante","hookText":"frase del fotograma cero","conflict":"qué quiere el protagonista y qué se lo impide","development":"","climax":"","resolution":"","closing":"reflexión, pregunta o conexión con el siguiente episodio"},"social":{"title":"","hooks":["","",""],"frameZeroText":"","tiktokDescription":"","question":"","coverIdea":"portada vertical 9:16","music":"recomendación de música cinematográfica","biblicalPassage":""}`;

// Segunda llamada corta: solo el elenco, cuando el primero vino sin frutas o con nombres genéricos.
async function repairCast(characters: unknown, style: StyleKey, idea: string) {
  try {
    const raw = await callLLM(`${FRUIT_CAST_RULES}\n\nTAREA: asigna una fruta a cada personaje según las reglas, dale un nombre dominicano con su fruta y completa su ficha. Conserva el orden y el rol de cada uno. Responde SOLO JSON: {"characters":[${CAST_FIELDS(style)}]}`,
      JSON.stringify({ idea, characters }), { json: true });
    const fixed = parseJson(raw).characters;
    return Array.isArray(fixed) && fixed.length ? fixed : characters;
  } catch { return characters; }
}

// Si un personaje cambió de nombre al repararlo, sus frases en las escenas se reasignan.
function renameSpeakers(episode: any, before: unknown, after: CastMember[]) {
  const rows = Array.isArray(before) ? before : [];
  const map = new Map<string, string>();
  rows.forEach((r: any, i) => { if (after[i] && norm(r?.name) && norm(r.name) !== norm(after[i].name)) map.set(norm(r.name), after[i].name); });
  if (!map.size || !Array.isArray(episode?.scenes)) return episode;
  const fix = (n: unknown) => map.get(norm(n)) || n;
  return { ...episode, scenes: episode.scenes.map((s: any) => ({ ...s, speaker: fix(s.speaker), onScreen: Array.isArray(s.onScreen) ? s.onScreen.map(fix) : s.onScreen })) };
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
  if (episode.scenes.length !== expected) throw new Error(`el guion tenía ${episode.scenes.length} escenas en vez de ${expected}`);
  if (episode.scenes[episode.scenes.length - 1]?.speaker !== NARRATOR) throw new Error("faltó el cierre del narrador");
  const lines = episode.scenes.map(scene => norm(scene.line));
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1);
  if (Math.max(...Array.from(counts.values())) > 2) throw new Error("el guion repitió el mismo diálogo");
  if (episode.duration !== expected * 8) throw new Error("la duración del guion no coincide con sus escenas");
}

// ---------- HISTORIA NUEVA ----------
export async function generateSeries(input: any) {
  const style = styleKey(input.style);
  const duration = Number(input.duration || 90);
  const idea = String(input.idea || input.replica || "").trim();
  if (!idea) throw new Error("Escribe primero la idea concreta de la historia.");
  if (!process.env.LLM_API_KEY) return { ...templateSeries(input), notice: "El servidor no tiene clave de IA: se usó la plantilla local." };
  try {
    const count = sceneCountFor(duration);
    const type = String(input.replica || "").trim() ? "replica" : "nueva";
    const system = `${styleRules(style)}${extraContext(input)}\n\n${sceneBrief(style, count)}\n\n${miPedido(input, style, duration, count, type)}\n\nTAREA: crea una SERIE NUEVA a partir del pedido y escribe su EPISODIO 1 (Parte 1). Elenco de 3 a 6 personajes.
Responde SOLO JSON: {"series":{"title":"","logline":"","world":"","tone":""},"characters":[${CAST_FIELDS(style)}],"episode":{"title":"","summary":"3-4 frases con el cliffhanger final","hook":["línea 1","línea 2"],"coverText":"","description":"","hashtags":[],${FICHA_SCHEMA},${PUBLISH_SCHEMA},${SCENES_SCHEMA}}}`;
    const parsed = await askJson(system, JSON.stringify({ idea, duracionSegundos: duration, cuentaPrincipal: input.account?.name, notas: input.notes }));
    let chars = parsed.characters;
    if (castNeedsRepair(chars, style)) chars = await repairCast(chars, style, idea);
    const characters = normalizeCast(chars, style).slice(0, 6);
    const episodeRaw = renameSpeakers(parsed.episode || parsed, parsed.characters, characters);
    const title = String(parsed.series?.title || idea).trim().slice(0, 100);
    const episode = buildProduction(episodeRaw, { style, duration, characters, idea, chosenHook: input.chosenHook, seriesTitle: title, partNumber: 1 });
    validateEpisode(episode, duration);
    const mode = providerMode();
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
  const style = styleKey(input.style);
  const duration = Number(input.duration || 90);
  if (!process.env.LLM_API_KEY) return { ...templateNext(input), notice: "El servidor no tiene clave de IA: se usó la plantilla local." };
  const existing = normalizeCast(input.characters, style);
  try {
    const count = sceneCountFor(duration);
    const castSheet = existing.map(c => isFruitStyle(style)
      ? `- ${c.name} (${c.role}): cabeza entera de ${c.fruit} — ${c.headES}. Ropa: ${c.clothing}. Voz: ${c.voice}.`
      : `- ${c.name} (${c.role}): ${c.visualES}. Ropa: ${c.clothing}. Voz: ${c.voice}.`).join("\n");
    const system = `${styleRules(style)}${extraContext(input)}\n\n${sceneBrief(style, count)}\n\n${miPedido(input, style, duration, count, "continuacion")}\n\nTAREA: escribe el EPISODIO ${input.partNumber} de la serie "${input.series?.title}", continuando exactamente donde terminó el anterior (retoma su cliffhanger en la escena 1; si es para TikTok/Facebook puede abrir con "Anteriormente...").
ELENCO FIJO (reutilízalo SIN cambiar nombre, fruta ni ropa):
${castSheet}
Si la historia necesita un personaje nuevo, créalo en newCharacters (máximo 2) con una fruta que no use nadie del elenco.
Responde SOLO JSON: {"episode":{"title":"","summary":"","hook":["",""],"coverText":"","description":"","hashtags":[],${FICHA_SCHEMA},${PUBLISH_SCHEMA},${SCENES_SCHEMA}},"newCharacters":[${CAST_FIELDS(style)}]}`;
    const parsed = await askJson(system, JSON.stringify({
      serie: input.series, mundo: input.bible, episodiosAnteriores: input.history,
      deseoDelUsuario: input.wish || "Decide tú lo que pasa para que enganche más", duracionSegundos: duration,
    }));
    const known = new Set(existing.map(c => norm(c.name)));
    const newRows = (Array.isArray(parsed.newCharacters) ? parsed.newCharacters : []).filter((c: any) => c?.name && !known.has(norm(c.name))).slice(0, 2);
    const newCharacters = normalizeCast(newRows, style, { taken: existing });
    const characters = [...existing, ...newCharacters];
    const episode = buildProduction(parsed.episode || parsed, { style, duration, characters, idea: String(input.wish || input.series?.title || ""), chosenHook: input.chosenHook, seriesTitle: String(input.series?.title || "Serie"), partNumber: Number(input.partNumber || 2), previousSummary: String((input.history || []).slice(-1)[0]?.summary || "") });
    validateEpisode(episode, duration);
    const mode = providerMode();
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
  const system = `${MANUAL_VIRAL}${input.learnings ? "\n\n" + input.learnings : ""}

TAREA: propón 5 GANCHOS distintos para los primeros 3 segundos del episodio. Cada gancho son 2 líneas cortas de texto en pantalla (máximo 8 palabras por línea), en español, sin presentaciones, con conflicto o intriga visible desde el segundo 0. Usa 5 mecanismos DIFERENTES (ironía dramática, bomba de tiempo, revelación con objeto, humillación pública, pregunta directa…). Si hay ganchos ganadores en el banco, imita su estructura sin copiarlos.
ESTILO: ${st.label}
Responde SOLO JSON válido: {"variants":[{"lines":["línea 1","línea 2"],"why":"por qué engancha, 1 frase"}]}`;
  try {
    const raw = await callLLM(system, JSON.stringify({ idea: input.idea, deseo: input.wish, serie: input.series, personajes: (input.characters || []).map((c: any) => c.name), episodiosAnteriores: input.history, bancoDeGanchos: input.bank }), { json: true });
    const v = (parseJson(raw).variants || []).filter((x: any) => Array.isArray(x?.lines) && x.lines.length).slice(0, 5).map((x: any) => ({ lines: x.lines.slice(0, 2).map(String), why: String(x.why || "") }));
    return v.length ? { mode: "llm", variants: v } : { mode: "plantilla-local", variants: templateHookVariants(input) };
  } catch { return { mode: "plantilla-local", variants: templateHookVariants(input) }; }
}
