// Creación de historias nuevas y continuidad de series.
// La IA escribe elenco y escenas; el código valida, repara el elenco de frutas y construye
// todos los prompts de producción (production.ts). Si la IA no responde, plantilla local con aviso.
import { callLLM } from "./llm";
import { CHRISTIAN_RULES, FRUIT_CAST_RULES, MANUAL_VIRAL, STYLES, type StyleKey } from "./knowledge";
import { templateHookVariants, type HookVariant } from "./hooks";
import { castNeedsRepair, isFruitStyle, norm, normalizeCast, templateCast, type CastMember } from "./cast";
import { buildProduction, sceneCountFor, templateScenes } from "./production";

export const styleKey = (s?: string): StyleKey => ((s as StyleKey) in STYLES ? (s as StyleKey) : "frutinovela");
const providerMode = () => ((process.env.LLM_PROVIDER || "").toLowerCase() === "gemini" ? "gemini" : "llm");

function parseJson(raw: string): any {
  const clean = raw.replace(/```json|```/g, "").trim();
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  return JSON.parse(a >= 0 && b > a ? clean.slice(a, b + 1) : clean);
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

const CAST_FIELDS = (style: StyleKey) => isFruitStyle(style)
  ? `{"name":"nombre dominicano con la fruta (p. ej. Platanito, Don Coco)","fruit":"plátano","fruitEmoji":"🍌","role":"protagonista humilde","headES":"cabeza de fruta: forma, color, textura, hojas o semilla, ojos y boca expresivos","clothing":"ropa fija de manga larga y accesorios","voice":"edad, tono y manera de hablar","speechStyle":"","subtitleColor":"FFE14D","pronunciations":["palabra = SÍ-la-bas, nunca X"]}`
  : `{"name":"nombre propio","role":"protagonista","visualES":"apariencia física fija","visualEN":"same appearance in English","clothing":"vestuario fijo de los 90","voice":"edad, tono y manera de hablar","subtitleColor":"FF9A1F","pronunciations":[]}`;

function sceneBrief(style: StyleKey, count: number) {
  const st = STYLES[style];
  return `Eres guionista profesional de microdramas verticales. Escribe una historia original con los hechos concretos de la idea del usuario (relaciones, oficio, lugar, objeto que revela, desenlace), nunca una plantilla.
ESTILO VISUAL: ${st.visual}
ESTILO DE VOZ: ${st.voice}
ESCENAS: exactamente ${count} escenas de 8 segundos. En cada escena habla UN SOLO personaje, una frase de 6 a 14 palabras que quepa en 8 s. Escena 1 = conflicto visible desde el segundo 0. Cada escena avanza la historia con información nueva; nada de repetir frases ni escenas. La última frase es del Narrador: "Lo que X no sabe... es que..."${style === "cristiana" ? ' y después el Narrador pide "Escribe AMÉN"' : ""}.
DIÁLOGO: palabras dominicanas escritas completas y con acentos (tíguere, yipeta, jevito, vaina, un chin, mi cualto / lo cualto mío); NUNCA contracciones (pa', vamo', e', ta').
"setting" = lugar y acción visual concreta de la escena${isFruitStyle(style) ? "" : " (en inglés)"}; "emotion" = emoción con la que habla; "speaker" = nombre exacto del elenco o "Narrador".`;
}

const SCENES_SCHEMA = `"scenes":[{"setting":"","speaker":"","line":"","emotion":"","onScreen":["nombres presentes"]}]`;

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

// ---------- HISTORIA NUEVA ----------
export async function generateSeries(input: any) {
  const style = styleKey(input.style);
  const duration = Number(input.duration || 90);
  const idea = String(input.idea || "").trim();
  if (!idea) throw new Error("Escribe primero la idea concreta de la historia.");
  if (!process.env.LLM_API_KEY) return { ...templateSeries(input), notice: "El servidor no tiene clave de IA: se usó la plantilla local." };
  try {
    const count = sceneCountFor(duration);
    const system = `${sceneBrief(style, count)}\n\n${styleRules(style)}${extraContext(input)}\n\nTAREA: crea una SERIE NUEVA a partir de la idea y escribe su EPISODIO 1. Elenco de 3 a 6 personajes.
Responde SOLO JSON: {"series":{"title":"","logline":"","world":"","tone":""},"characters":[${CAST_FIELDS(style)}],"episode":{"title":"","summary":"3-4 frases con el cliffhanger final","hook":["línea 1","línea 2"],"coverText":"","description":"","hashtags":[],${SCENES_SCHEMA}}}`;
    const raw = await callLLM(system, JSON.stringify({ idea, duracionSegundos: duration, cuentaPrincipal: input.account?.name, notas: input.notes }), { json: true });
    const parsed = parseJson(raw);
    let chars = parsed.characters;
    if (castNeedsRepair(chars, style)) chars = await repairCast(chars, style, idea);
    const characters = normalizeCast(chars, style).slice(0, 6);
    const episodeRaw = renameSpeakers(parsed.episode || parsed, parsed.characters, characters);
    const title = String(parsed.series?.title || idea).trim().slice(0, 100);
    const episode = buildProduction(episodeRaw, { style, duration, characters, idea, chosenHook: input.chosenHook, seriesTitle: title, partNumber: 1 });
    if (episode.scenes.length < 4) throw new Error("la respuesta tenía muy pocas escenas");
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
    const system = `${sceneBrief(style, count)}\n\n${styleRules(style)}${extraContext(input)}\n\nTAREA: escribe el EPISODIO ${input.partNumber} de la serie "${input.series?.title}", continuando exactamente donde terminó el anterior (retoma su cliffhanger en la escena 1; si es para TikTok/Facebook puede abrir con "Anteriormente...").
ELENCO FIJO (reutilízalo SIN cambiar nombre, fruta ni ropa):
${castSheet}
Si la historia necesita un personaje nuevo, créalo en newCharacters (máximo 2) con una fruta que no use nadie del elenco.
Responde SOLO JSON: {"episode":{"title":"","summary":"","hook":["",""],"coverText":"","description":"","hashtags":[],${SCENES_SCHEMA}},"newCharacters":[${CAST_FIELDS(style)}]}`;
    const raw = await callLLM(system, JSON.stringify({
      serie: input.series, mundo: input.bible, episodiosAnteriores: input.history,
      deseoDelUsuario: input.wish || "Decide tú lo que pasa para que enganche más", duracionSegundos: duration,
    }), { json: true });
    const parsed = parseJson(raw);
    const known = new Set(existing.map(c => norm(c.name)));
    const newRows = (Array.isArray(parsed.newCharacters) ? parsed.newCharacters : []).filter((c: any) => c?.name && !known.has(norm(c.name))).slice(0, 2);
    const newCharacters = normalizeCast(newRows, style, { taken: existing });
    const characters = [...existing, ...newCharacters];
    const episode = buildProduction(parsed.episode || parsed, { style, duration, characters, idea: String(input.wish || input.series?.title || ""), chosenHook: input.chosenHook, seriesTitle: String(input.series?.title || "Serie"), partNumber: Number(input.partNumber || 2), previousSummary: String((input.history || []).slice(-1)[0]?.summary || "") });
    if (episode.scenes.length < 4) throw new Error("la respuesta tenía muy pocas escenas");
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
