// Creación de historias nuevas y continuidad de series.
// Todo pasa por el MANUAL_VIRAL para que cada episodio nazca con lo aprendido.
import { callLLM, EPISODE_RULES, templateEpisode } from "./llm";
import { MANUAL_VIRAL, STYLES, type StyleKey } from "./knowledge";
import { buildPlatformAdaptations } from "./platforms";

const PALETTE = ["FF9A1F", "C08BFF", "5BC94A", "FF4D6D", "FFD23F", "4DD0E1", "B6F08A", "D9A066", "FF6B81", "F2C14E"];

function styleOf(key?: string) { return STYLES[(key as StyleKey) in STYLES ? (key as StyleKey) : "frutinovela"]; }

function parseJson(raw: string): any {
  const clean = raw.replace(/```json|```/g, "").trim();
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  return JSON.parse(a >= 0 && b > a ? clean.slice(a, b + 1) : clean);
}

function normalizeEpisode(ep: any, input: any) {
  if (!ep.platformAdaptations || ep.platformAdaptations.length !== 4) ep.platformAdaptations = buildPlatformAdaptations({ ...input, hook: ep.hook });
  ep.platform_adaptations = ep.platformAdaptations;
  if (ep.guionJson?.colores) for (const k of Object.keys(ep.guionJson.colores)) ep.guionJson.colores[k] = String(ep.guionJson.colores[k]).replace("#", "").toUpperCase();
  return ep;
}

function normalizeCharacters(list: any[], used: string[] = []) {
  let n = used.length;
  return (list || []).filter(c => c?.name).map(c => ({
    name: String(c.name),
    visualES: c.visualES || c.visual_es || "",
    visualEN: c.visualEN || c.visual_en || "",
    clothing: c.clothing || "",
    subtitleColor: "#" + String(c.subtitleColor || PALETTE[n++ % PALETTE.length]).replace("#", "").toUpperCase(),
    speechStyle: c.speechStyle || "",
    pronunciations: Array.isArray(c.pronunciations) ? c.pronunciations : [],
  }));
}

const EPISODE_KEYS = "title (título corto del episodio), summary (resumen de 3-4 frases de lo que pasó, incluido el cliffhanger final, para dar continuidad), scriptBlocks, prompts, dolaPrompt, dialogueRules, hook, coverText, description, hashtags, guionJson, baseFormula, platformAdaptations";

// ---------- HISTORIA NUEVA ----------
export async function generateSeries(input: any) {
  const st = styleOf(input.style);
  if (!process.env.LLM_API_KEY) return templateSeries(input);
  const system = `${EPISODE_RULES}\n\n${MANUAL_VIRAL}\n\nTAREA: crea una SERIE NUEVA a partir de la idea del usuario y escribe su EPISODIO 1.
ESTILO VISUAL: ${st.visual}
ESTILO DE VOZ: ${st.voice}
Inventa de 3 a 6 personajes memorables con descripción visual fija y muy concreta (cabeza, pelo, ropa, accesorios) que se pueda repetir idéntica en cada prompt, un color de subtítulo distinto por personaje (hex sin #) y sus pronunciaciones difíciles.
Responde SOLO JSON válido con esta forma:
{"series":{"title","logline","world","tone"},"characters":[{"name","visualES","visualEN","clothing","subtitleColor","speechStyle","pronunciations":[]}],"episode":{${EPISODE_KEYS}}}`;
  const raw = await callLLM(system, JSON.stringify({ idea: input.idea, duracionSegundos: input.duration, cuentaPrincipal: input.account, notas: input.notes }));
  try {
    const j = parseJson(raw);
    const characters = normalizeCharacters(j.characters);
    return { mode: "llm", series: j.series || { title: input.idea }, characters, episode: normalizeEpisode(j.episode || {}, { ...input, characters }) };
  } catch { return { ...templateSeries(input), raw }; }
}

export function templateSeries(input: any) {
  const idea = String(input.idea || "Nueva historia");
  const characters = normalizeCharacters([
    { name: "Protagonista", visualES: "Personaje principal (edita su descripción en Personajes)", clothing: "Ropa característica", speechStyle: "Directo y emotivo", pronunciations: [] },
    { name: "Antagonista", visualES: "Personaje rival (edita su descripción en Personajes)", clothing: "Ropa elegante", speechStyle: "Frío y calculador", pronunciations: [] },
  ]);
  const episode = templateEpisode({ ...input, theme: idea, characters });
  return { mode: "plantilla-local", series: { title: idea.slice(0, 60), logline: idea, world: "", tone: "" }, characters, episode: { ...episode, title: "Episodio 1", summary: idea } };
}

// ---------- CONTINUAR UNA SERIE ----------
export async function generateNextEpisode(input: any) {
  const st = styleOf(input.style);
  if (!process.env.LLM_API_KEY) return templateNext(input);
  const system = `${EPISODE_RULES}\n\n${MANUAL_VIRAL}\n\nTAREA: escribe el EPISODIO ${input.partNumber} de la serie "${input.series?.title}", continuando exactamente donde terminó el anterior.
ESTILO VISUAL: ${st.visual}
ESTILO DE VOZ: ${st.voice}
CONTINUIDAD OBLIGATORIA: usa los personajes existentes con su descripción, ropa y forma de hablar SIN cambiarlas; abre retomando el cliffhanger del episodio anterior; si es TikTok/Facebook empieza con "Anteriormente..." de 5-8 s; termina con un cliffhanger nuevo más fuerte. Si la historia necesita un personaje nuevo, créalo en newCharacters con descripción fija (máximo 2).
Responde SOLO JSON válido con esta forma: {"episode":{${EPISODE_KEYS}},"newCharacters":[{"name","visualES","visualEN","clothing","subtitleColor","speechStyle","pronunciations":[]}]}`;
  const raw = await callLLM(system, JSON.stringify({
    serie: input.series, mundo: input.bible, personajes: input.characters,
    episodiosAnteriores: input.history, deseoDelUsuario: input.wish || "Decide tú lo que pasa para que enganche más", duracionSegundos: input.duration,
  }));
  try {
    const j = parseJson(raw);
    const newCharacters = normalizeCharacters(j.newCharacters, (input.characters || []).map((c: any) => c.name));
    return { mode: "llm", episode: normalizeEpisode(j.episode || {}, input), newCharacters };
  } catch { return { ...templateNext(input), raw }; }
}

export function templateNext(input: any) {
  const last = (input.history || []).slice(-1)[0];
  const episode = templateEpisode({ ...input, theme: input.wish || `Continuación de ${input.series?.title || "la serie"}`, previousSummary: last?.summary });
  return { mode: "plantilla-local", episode: { ...episode, title: `Episodio ${input.partNumber}`, summary: input.wish || "Continuación (plantilla local: conecta la IA para continuidad real)." }, newCharacters: [] };
}
