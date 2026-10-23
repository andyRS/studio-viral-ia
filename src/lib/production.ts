// Producción del episodio: escenas de 8 s (una imagen de Flow + un clip de Seedance por escena),
// prompts con formato fijo, guion.json para el montaje y las 4 fichas de plataforma.
// Los prompts se construyen en el código (no los escribe la IA) para que siempre cumplan el formato.
import { BASE_FORMULA, buildPlatformAdaptations, formatCoverText, mergeModelPlatforms, normalizeDescription, stylePublish } from "./platforms";
import { CHRISTIAN_SCENE_GUARD, NARRATOR_COLOR, type StyleKey } from "./knowledge";
import { accentOf, accentPrompt, dialectPronunciations, isFruitStyle, norm, type CastMember } from "./cast";
import type { Scene } from "./types";

export const SCENE_SECONDS = 8;
// Texto de tarjeta de salto de tiempo, si la transición o el lugar lo indican («Días después...»).
export function timeJump(text: string) {
  const m = /(?:unas?\s+|dos\s+|tres\s+|varias?\s+)?(?:minutos|horas|días|dias|semanas|meses|años)\s+después|al día siguiente|a la mañana siguiente|esa misma noche|más tarde/i.exec(text || "");
  if (!m) return "";
  const t = m[0].trim();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() + "...";
}
export const NARRATOR = "Narrador";
// Súbelo cada vez que cambien las reglas de los prompts: los episodios guardados con una versión
// anterior muestran «Actualizar prompts» (rehace los prompts sin IA y sin tocar el guion).
export const PROMPT_RULES_VERSION = 7;
// v7: si la escena tiene un beso, que sea en la boca (breve y romántico).
const kissNote = (s: { setting: string; line: string }, lang: "es" | "en") => /\bbes(o|a|an|ar|ando|os)\b|\bkiss/i.test(`${s.setting} ${s.line}`)
  ? (lang === "es" ? " BESO: en la boca, de frente y bien visible, breve y romántico; nunca sexual." : " KISS: on the lips, clearly visible, brief and romantic; never sexual.") : "";
// v6: acento por personaje (accentPrompt): marcado para quien lo tenga en su ficha, neutro para el resto.
// Ritmo viral (v4): la voz empieza en el primer segundo, sin silencios de entrada ni de salida, ambiente
// continuo y sin música dentro del clip (la música va en el montaje; si cada clip trae la suya, salta en cada corte).
const SOUND_ES = "SONIDO: la voz empieza en el primer segundo, sin silencio de entrada ni de salida; ambiente del lugar continuo de principio a fin; SIN música de fondo (la música se añade en la edición).";
const SOUND_EN = "SOUND: dialogue starts within the first second, no silent intro or outro; continuous ambient sound of the location; NO background music (music is added in editing).";
// Sin esto, en los primeros planos el modelo de vídeo pasa del 3D animado a un actor real con la piel teñida.
export const ANIMATION_STYLE_LOCK = "ESTILO FIJO: el mismo render 3D animado de la imagen de la escena durante todo el vídeo, también en los primeros planos y con lluvia o luz dura. Nunca acción real, nunca fotorrealista, nunca un actor o persona real; la cara, la piel de fruta, el pelo y las proporciones del personaje no cambian.";
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

// Ritmo viral: cada clip se genera de 8 s, pero el montaje lo recorta a su frase + reacción (~4,5 s).
// La duración pedida es la del vídeo montado: 88 s ≈ 20 escenas (como los virales: una frase cada 3-4 s).
export const EDIT_SECONDS = 4.5;
export const MAX_SCENES = 30;
export const sceneCountFor = (duration: number) => Math.min(MAX_SCENES, Math.max(12, Math.round((Number(duration) || 90) / EDIT_SECONDS)));

// Mantiene el gancho y el cierre; los recortes salen del desarrollo.
export function selectShortScenes<T>(scenes: T[], limit: number): T[] {
  if (scenes.length <= limit) return scenes;
  if (limit <= 1) return [scenes[scenes.length - 1]];
  const opening = Math.min(2, limit - 1);
  const ending = Math.min(2, limit - opening);
  const middle = limit - opening - ending;
  const interior = scenes.slice(opening, scenes.length - ending);
  const weight = (scene: T) => {
    const text = `${String((scene as any)?.line || "")} ${String((scene as any)?.goal || "")} ${String((scene as any)?.title || "")}`.toLowerCase();
    if (/\b(hola|buenos días|mucho gusto|me llamo|presentaci[oó]n|saludo)\b/.test(text)) return -2;
    if (/\b(revelaci[oó]n|descubre|confiesa|prueba|secreto|cl[ií]max|giro|verdad)\b/.test(text)) return 2;
    return 0;
  };
  const selected = interior.map((scene, i) => ({ scene, i, score: weight(scene) }))
    .sort((a, b) => b.score - a.score || Math.abs(a.i - (interior.length - 1) / 2) - Math.abs(b.i - (interior.length - 1) / 2))
    .slice(0, middle).sort((a, b) => a.i - b.i);
  const picked = selected.map(item => item.scene);
  return [...scenes.slice(0, opening), ...picked, ...scenes.slice(-ending)];
}

// Palabras dominicanas completas: la voz se traba con contracciones cortadas.
const CONTRACTIONS: [RegExp, string][] = [
  [/\bpa'(?=\s|$)/gi, "para"], [/\bvamo'(?=\s|$)/gi, "vamos"], [/\bta'(?=\s|$)/gi, "está"], [/\be'(?=\s|$)/gi, "es"],
  [/\bna'(?=\s|$)/gi, "nada"], [/\bto'(?=\s|$)/gi, "todo"], [/\bpa(?= (el|la|que|mi|tu|su|ti|mí)\b)/gi, "para"],
];
export function fixDialogue(line: string) {
  let s = clean(line).replace(/^["“”]+|["“”]+$/g, "");
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  return s;
}

// Lo que nunca debe aparecer en una escena cristiana (sí puede aparecer la frase de prohibición).
const FORBIDDEN_CHRISTIAN = /\b(santos?|santas?|virgen(es)?|vírgen(es)?|altar(es)?|velas? votivas?|rosarios?|cuadros? religiosos?|estampas?|crucifijo)\b/gi;
export function stripForbidden(text: string) {
  return clean(text.replace(FORBIDDEN_CHRISTIAN, "").replace(/\s+,/g, ",").replace(/\(\s*\)/g, ""));
}

interface Ctx {
  style: StyleKey; duration: number; characters: CastMember[]; idea: string;
  chosenHook?: string[] | null; seriesTitle?: string; partNumber?: number; previousSummary?: string;
}

function findSpeaker(name: unknown, cast: CastMember[]) {
  const n = norm(name);
  if (!n || /narrador|narradora|voz en off/.test(n)) return NARRATOR;
  const exact = cast.find(c => norm(c.name) === n);
  if (exact) return exact.name;
  const partial = cast.find(c => norm(c.name).includes(n) || n.includes(norm(c.name)) || (c.fruit && n.includes(norm(c.fruit))));
  return partial?.name || cast[0]?.name || NARRATOR;
}

// Escenas en bruto: del arreglo scenes, o si falta, de guionJson.clips / scriptBlocks (una por frase).
function rawScenes(raw: any): any[] {
  if (Array.isArray(raw?.scenes) && raw.scenes.length) return raw.scenes;
  const out: any[] = [];
  const clips = raw?.guionJson?.clips;
  if (Array.isArray(clips)) clips.forEach((clip: any) => (Array.isArray(clip) ? clip : []).forEach((pair: any) => Array.isArray(pair) && out.push({ speaker: pair[0], line: pair[1] })));
  if (!out.length && Array.isArray(raw?.scriptBlocks)) raw.scriptBlocks.forEach((b: any) => (b?.dialogue || []).forEach((d: any) => out.push({ setting: b.scene, speaker: d.speaker, line: d.text })));
  return out;
}

function pronunciationFor(speakerMember: CastMember | undefined, line: string) {
  const list = Array.from(new Set([...(speakerMember?.pronunciations || []), ...dialectPronunciations(line)]));
  return list.length ? list.join("; ") : "tíguere = TÍ-gue-re, nunca tigre; yipeta = yi-PE-ta; vaina = VAI-na, nunca baila; Piña = PI-ña; mi cualto con L";
}

// Variedad visual obligatoria: cada escena abre con un encuadre y movimiento distintos al anterior.
const SHOTS: { es: string; en: string; move: string; moveEn: string }[] = [
  { es: "plano general", en: "wide shot", move: "dolly lento hacia adelante", moveEn: "slow dolly in" },
  { es: "primer plano", en: "close-up", move: "cámara fija con ligero zoom", moveEn: "static camera, subtle zoom" },
  { es: "plano detalle de un objeto clave", en: "detail shot of a key object", move: "paneo suave", moveEn: "gentle pan" },
  { es: "plano medio", en: "medium shot", move: "cámara en mano", moveEn: "handheld camera" },
  { es: "contraplano por encima del hombro", en: "over-the-shoulder shot", move: "travelling lateral", moveEn: "lateral tracking shot" },
  { es: "plano a contraluz", en: "backlit silhouette shot", move: "grúa descendente", moveEn: "descending crane" },
  { es: "contrapicado", en: "low-angle shot", move: "tilt hacia arriba", moveEn: "tilt up" },
  { es: "picado", en: "high-angle shot", move: "órbita lenta alrededor del personaje", moveEn: "slow orbit around the character" },
];
export const shotFor = (i: number) => SHOTS[i % SHOTS.length];

// Identificadores de 5 caracteres para que Flow renombre cada imagen: fichas [P01], escenas [001].
export const sceneId = (n: number) => `[${String(n).padStart(3, "0")}]`;
export const sheetId = (n: number) => `[P${String(n).padStart(2, "0")}]`;
const stripId = (t: string) => String(t || "").replace(/^\[(?:P\d{2}|\d{3})\]\s*/, "");

function imagePrompt(s: { setting: string; speaker: string; emotion: string }, member: CastMember | undefined, others: CastMember[], style: StyleKey, i: number) {
  const shot = shotFor(i);
  if (!isFruitStyle(style)) {
    const who = member ? `${member.name} (${member.visualEN || member.visualES}; outfit: ${member.clothing})` : "the scene";
    return `Cinematic 1990s Dominican romance film still, 35mm grain, warm golden light, vertical 9:16. Reference: character sheet of ${member?.name || "the cast"}. Scene: ${s.setting}. ${who}, ${s.emotion}, ${shot.en}.${others.length ? ` Also present: ${others.map(o => o.name).join(", ")}.` : ""} Real people, no text, no watermark.`;
  }
  const guard = style === "cristiana" ? ` ${CHRISTIAN_SCENE_GUARD[0].toUpperCase()}${CHRISTIAN_SCENE_GUARD.slice(1)}.` : "";
  const who = member ? `${member.name} (piel de ${member.fruit}: ${member.headES}; ${member.clothing}) con expresión ${s.emotion}` : `sin personaje hablando`;
  return `Imagen 3D cinematográfica realista (película animada premium), vertical 9:16. Encuadre: ${shot.es}. Referencia: ficha de ${member?.name || "los personajes"}. Escena: ${s.setting}. ${who}.${others.length ? ` También en escena: ${others.map(o => `${o.name} (piel de ${o.fruit})`).join(", ")}.` : ""} Personajes de rostro humano realista con piel de su fruta, idénticos a sus fichas; nunca una fruta entera como cabeza.${guard} Sin texto, sin letreros, sin marca de agua.`;
}

function animationPrompt(s: { setting: string; speaker: string; line: string; emotion: string }, member: CastMember | undefined, style: StyleKey, i: number) {
  const narrator = s.speaker === NARRATOR;
  const shot = shotFor(i);
  if (!isFruitStyle(style)) {
    const voice = narrator ? `Off-screen narrator voice; nobody moves their lips.` : `Only ${member!.name} speaks; lip sync only for ${member!.name}. Voice: ${member!.voice}.`;
    return `1990s Dominican romance film, 35mm grain, warm golden light, vertical 9:16, 8 seconds. Animate from the scene image as the first frame.
References: image 1 = scene${member ? `; image 2 = character sheet of ${member.name}` : ""}.
CHARACTERS: ${member ? `${member.name}: ${member.visualEN || member.visualES}; outfit: ${member.clothing}. Real people.` : "No one speaks on camera."}
SCENE: ${s.setting}.
SHOTS: ${shot.en}, ${shot.moveEn}. From 0.3 s, with no pause before, ${narrator ? "slow push-in while the narrator says" : `${member!.name}, already in full ${s.emotion}, says while the camera dollies slowly toward the face`} (in Spanish, exact words): "${s.line}" Right after the line: 1 s ${narrator ? "holding on the scene" : `close-up of ${member!.name} holding the emotion`}, then the same shot continues without cuts.
${SOUND_EN}${kissNote(s, "en")}
PRONUNCIATION: ${narrator ? accentPrompt(null, "en") : accentPrompt(member, "en")}.
VOICES: ${voice} No subtitles or on-screen text.`;
  }
  const guard = style === "cristiana" ? ` ${CHRISTIAN_SCENE_GUARD[0].toUpperCase()}${CHRISTIAN_SCENE_GUARD.slice(1)}.` : "";
  const personajes = member
    ? `${member.name}: personaje 3D animado con rostro y cuerpo humanos y piel de ${member.fruit} (${member.headES}); ${member.clothing}. Idéntico a su ficha (imagen 2) en cada toma: misma cara, mismo color de piel, mismo pelo y misma ropa; nunca una fruta entera como cabeza.`
    : "Personajes 3D animados con rostro humano y piel de fruta, idénticos a sus fichas; nunca una fruta entera como cabeza; nadie habla a cámara.";
  const tomas = narrator
    ? `${shot.es} de la escena, ${shot.move}. Desde 0,3 s, sin pausa previa y con acercamiento lento, el narrador dice en voz en off: "${s.line}" Justo al terminar: 1 s sosteniendo la imagen; después la misma toma sigue sin cortes.`
    : `${shot.es}, ${shot.move}; ${member!.name} ya está en plena emoción (${s.emotion}) desde el primer fotograma. Desde 0,3 s, sin pausa previa, ${member!.name} dice con ${s.emotion}, mientras la cámara hace un dolly lento hacia su cara: "${s.line}" Justo al terminar la frase: 1 s de primer plano de ${member!.name} sosteniendo la emoción; después la misma toma sigue sin cortes.`;
  const voces = narrator
    ? `VOCES: Narrador: voz masculina profunda y cálida, en off. ${accentPrompt(null)}. Nadie mueve los labios. Sin subtítulos ni texto en pantalla.`
    : `VOCES: ${member!.name}: ${member!.voice}. ${accentPrompt(member)}. Solo habla ${member!.name}; sincronización de labios solo para quien habla. Sin subtítulos ni texto en pantalla.`;
  return `Telenovela animada 3D (render CGI de película animada premium), vertical 9:16, 8 segundos. Anima a partir de la imagen de la escena como primer fotograma.
${ANIMATION_STYLE_LOCK}
Referencias: imagen 1 = escena${member ? `; imagen 2 = ficha de ${member.name}` : ""}.
PERSONAJES: ${personajes}
ESCENA: ${s.setting}.${guard}
TOMAS: ${tomas}
PRONUNCIACIÓN OBLIGATORIA: ${pronunciationFor(member, s.line)}.
${voces}
${SOUND_ES}${kissNote(s, "es")}`;
}

// Prompt de Dola (Seedance) con las escenas elegidas para la versión corta.
function buildDolaPrompt(dolaScenes: { n: number; setting: string; speaker: string; line: string; emotion: string }[], cast: CastMember[], style: StyleKey, total: number, dolaDuration: number) {
  const castLine = cast.map(c => isFruitStyle(style) ? `${c.name}: personaje 3D animado con rostro humano y piel de ${c.fruit} (${c.headES}); ${c.clothing}` : `${c.name}: ${c.visualEN || c.visualES}; ${c.clothing}`).join(". ");
  return `Usa Seedance 2.5. ${isFruitStyle(style) ? `Telenovela animada 3D (render CGI de película animada premium), vertical 9:16; personajes 3D animados de rostro humano con piel de su fruta, nunca una fruta entera como cabeza. ${ANIMATION_STYLE_LOCK}` : "Película romántica dominicana de los 90, 35 mm, vertical 9:16, personas reales."} ${total > dolaDuration ? `Adaptación de ${dolaDuration} s del episodio de ${total} s. Conserva el gancho y el cierre; elimina solo escenas intermedias.` : `Episodio completo de ${total} s.`}${style === "cristiana" ? ` ${CHRISTIAN_SCENE_GUARD[0].toUpperCase()}${CHRISTIAN_SCENE_GUARD.slice(1)}.` : ""} PERSONAJES: ${castLine}. ${dolaScenes.map((s, i) => `${i * SCENE_SECONDS}-${(i + 1) * SCENE_SECONDS}s [escena ${s.n}]: ${s.setting}. ${s.speaker === NARRATOR ? `Narrador en off: "${s.line}"` : `${s.speaker} dice con ${s.emotion}: "${s.line}"`}`).join(" ")} PRONUNCIACIÓN OBLIGATORIA: ${Array.from(new Set(cast.flatMap(c => c.pronunciations).concat(dialectPronunciations(dolaScenes.map(s => s.line).join(" "))))).join("; ") || "palabras completas con acentos correctos"}. VOCES: cada personaje con su acento (${cast.map(c => `${c.name}: ${accentOf(c) || "latino neutro"}`).join("; ")}), cada palabra completa, nunca acento inglés; sincronización de labios solo para quien habla; sin subtítulos ni texto en pantalla. RITMO: cada personaje responde enseguida, sin pausas entre frases; ambiente continuo y SIN música de fondo (se añade en la edición).`;
}

// Construye todo el paquete de producción del episodio a partir de lo que devolvió la IA.
export function buildProduction(raw: any, ctx: Ctx) {
  const { style, characters: cast } = ctx;
  const target = sceneCountFor(ctx.duration);
  const byName = new Map(cast.map(c => [c.name, c]));
  let base = rawScenes(raw)
    .map((r: any) => ({
      setting: clean(r.setting || r.scene || r.escena) || (raw?.title ? `continuación de «${clean(raw.title)}»` : "interior de una casa dominicana"),
      speaker: findSpeaker(r.speaker || r.hablante, cast),
      line: fixDialogue(r.line || r.text || r.dialogo || ""),
      emotion: clean(r.emotion || r.emocion) || "emoción contenida",
      present: Array.isArray(r.onScreen) ? r.onScreen : [],
      title: clean(r.title || r.titulo), goal: clean(r.goal || r.objetivo), sfx: clean(r.sfx || r.efectos), music: clean(r.music || r.musica),
      transition: clean(r.transition || r.transicion), link: clean(r.link || r.conexion),
    }))
    .filter(s => s.line.length >= 3);
  // Un solo hablante por escena: una frase que no cabe en 8 s se parte en dos escenas,
  // pero solo por un punto o pausa natural (nunca a mitad de frase).
  base = base.flatMap(s => {
    if (s.line.split(" ").length <= 18) return [s];
    const parts = s.line.match(/[^.!?…]+[.!?…]+["”]?\s*/g)?.map(p => p.trim()).filter(Boolean) || [];
    if (parts.length < 2) return [s];
    const half = s.line.length / 2; let acc = 0, cut = 1;
    for (let i = 0; i < parts.length - 1; i++) { acc += parts[i].length; if (acc >= half) { cut = i + 1; break; } cut = i + 1; }
    const a = parts.slice(0, cut).join(" "), b = parts.slice(cut).join(" ");
    // Nunca dejar un trozo de menos de 5 palabras (p. ej. «Escribe AMÉN.» suelto): se queda en una escena.
    if (a.split(" ").length < 5 || b.split(" ").length < 5) return [s];
    return [{ ...s, line: a }, { ...s, line: b }];
  });
  if (style === "cristiana") base = base.map(s => ({ ...s, setting: stripForbidden(s.setting), line: stripForbidden(s.line) }));
  // Cristiana: el final pide "Escribe AMÉN" en boca del narrador.
  if (style === "cristiana" && !base.some(s => /escribe am[eé]n/i.test(s.line))) {
    const last = base[base.length - 1];
    if (last?.speaker === NARRATOR) last.line = `${last.line} Escribe AMÉN.`;
    else base.push({ setting: last?.setting || "iglesia evangélica sencilla", speaker: NARRATOR, line: "Si crees que Dios restaura lo que el orgullo rompe… Escribe AMÉN.", emotion: "esperanza", present: [], title: "Cierre", goal: "Invitar al público a responder", sfx: "Silencio y respiración suave", music: "Piano emotivo que se apaga", transition: "Fundido a negro", link: "" });
  }
  base = selectShortScenes(base, Math.min(MAX_SCENES, target));

  const scenes: Scene[] = base.map((s, i) => {
    const member = byName.get(s.speaker);
    const others = s.present.map((p: unknown) => byName.get(findSpeaker(p, cast))).filter((m: CastMember | undefined): m is CastMember => !!m && m !== member);
    const role = sceneRole(i, base.length);
    const present = [member, ...others].filter((m): m is CastMember => !!m).map(m => m.name);
    return {
      n: i + 1, durationSec: SCENE_SECONDS, setting: s.setting, speaker: s.speaker, line: s.line, emotion: s.emotion,
      // Ficha de escena (estructura del prompt maestro). Lo que la IA no rellena lo completa el código.
      title: s.title || role.title, goal: s.goal || role.goal, shot: shotFor(i).es, characters: present,
      sfx: s.sfx || role.sfx, music: s.music || role.music,
      transition: s.transition || (i === base.length - 1 ? "Fundido a negro" : "Corte directo"),
      nextLink: s.link || (i === base.length - 1 ? "Cierre del episodio" : `Lleva a la escena ${i + 2}`),
      // Referencias canónicas: se muestran FUERA del prompt (el prompt va limpio para copiar).
      references: present.map(n => `Ficha de ${n}`),
      imagePromptFlow: imagePrompt(s, member, others, style, i),
      animationPrompt: animationPrompt(s, member, style, i),
    };
  });

  const chosen = Array.isArray(ctx.chosenHook) ? ctx.chosenHook.map(clean).filter(Boolean).slice(0, 2) : [];
  const fromModel = Array.isArray(raw?.hook) ? raw.hook.map(clean).filter(Boolean).slice(0, 2) : [];
  const hook = chosen.length ? chosen : fromModel.length === 2 ? fromModel : [scenes[0]?.line || ctx.idea.slice(0, 50), "Y nadie esperaba lo que pasó después…"];
  const colores: Record<string, string> = Object.fromEntries(cast.map(c => [c.name, c.subtitleColor.replace("#", "").toUpperCase()]));
  if (scenes.some(s => s.speaker === NARRATOR)) colores[NARRATOR] = NARRATOR_COLOR;
  // Saltos de tiempo («Horas después...») → tarjeta negra corta antes de esa escena en el montaje.
  const tarjetas = scenes.map((s, i) => ({ antes: i, texto: timeJump(`${s.transition || ""} ${s.setting || ""}`) })).filter(t => t.antes > 0 && t.texto);
  const guionJson = { colores, gancho: hook, cierre: "Continuará...", clips: scenes.map(s => [[s.speaker, s.line]]), ...(tarjetas.length ? { tarjetas } : {}) };
  const total = scenes.length * SCENE_SECONDS;
  const scriptBlocks = scenes.map(s => ({ block: s.n, time: `${(s.n - 1) * SCENE_SECONDS}-${s.n * SCENE_SECONDS}s`, scene: s.setting, dialogue: [{ speaker: s.speaker, text: s.line }], onScreen: s.speaker === NARRATOR ? [] : [s.speaker] }));
  // Dola: versión corta sin perder el último giro, narrador ni cliffhanger.
  const dolaScenes = selectShortScenes(scenes, Math.floor(60 / SCENE_SECONDS));
  const dolaDuration = dolaScenes.length * SCENE_SECONDS;
  const dolaPrompt = buildDolaPrompt(dolaScenes, cast, style, total, dolaDuration);
  const shortTitle = `${ctx.seriesTitle || clean(raw?.title) || "Serie"} · Parte ${ctx.partNumber || 1}`;
  const word = stylePublish(style).word(ctx.partNumber || 1);
  const platformAdaptations = mergeModelPlatforms(buildPlatformAdaptations({ theme: ctx.idea || clean(raw?.title), seriesTitle: ctx.seriesTitle || clean(raw?.title), partNumber: ctx.partNumber || 1, previousSummary: ctx.previousSummary, hook, style }), raw?.platforms).map(p => ({ ...p, description: normalizeDescription(p.description, shortTitle, word, p.hashtags) }));
  const f = raw?.ficha || {};
  const ficha = {
    biblicalBase: clean(f.biblicalBase || raw?.biblicalBase),
    synopsis: clean(f.synopsis) || clean(raw?.summary) || ctx.idea,
    hookImage: clean(f.hookImage) || scenes[0]?.setting || "",
    hookText: clean(f.hookText) || hook.join(" / "),
    conflict: clean(f.conflict), development: clean(f.development), climax: clean(f.climax),
    resolution: clean(f.resolution), closing: clean(f.closing) || scenes[scenes.length - 1]?.line || "",
  };
  // Portada: fotograma + texto de 2 líneas + «PARTE X».
  const cv = raw?.cover || {};
  const coverLines = Array.isArray(cv.lines) ? cv.lines.map(clean).filter(Boolean).slice(0, 2) : [];
  const cover = { frame: clean(cv.frame) || `Escena de máxima emoción sin spoiler: ${scenes[Math.min(2, scenes.length - 1)]?.setting || ""}`, lines: coverLines.length === 2 ? coverLines : hook, part: clean(cv.part) || `PARTE ${ctx.partNumber || 1}` };
  // Autoevaluación de la IA (1-10): gancho, claridad, escalada, giro y ganas de comentar.
  const sc = raw?.selfScore || {};
  const scoreOf = (v: unknown) => { const n = Math.round(Number(v)); return n >= 1 && n <= 10 ? n : null; };
  const selfScore = ["hook", "clarity", "escalation", "twist", "comments"].some(k => scoreOf(sc[k]) !== null)
    ? { hook: scoreOf(sc.hook), clarity: scoreOf(sc.clarity), escalation: scoreOf(sc.escalation), twist: scoreOf(sc.twist), comments: scoreOf(sc.comments) } : null;
  const so = raw?.social || {};
  const social = {
    title: clean(so.title) || clean(raw?.title) || ctx.idea.slice(0, 60),
    hooks: (Array.isArray(so.hooks) ? so.hooks.map(clean).filter(Boolean) : []).concat(hook.join(" "), clean(raw?.coverText)).filter(Boolean).slice(0, 3),
    frameZeroText: clean(so.frameZeroText) || hook[0],
    tiktokDescription: clean(so.tiktokDescription) || clean(raw?.description) || ctx.idea,
    question: clean(so.question) || "¿Tú qué hubieras hecho en su lugar?",
    coverIdea: clean(so.coverIdea) || `Primer plano de ${scenes[0]?.speaker || "la protagonista"} con ${scenes[0]?.emotion || "emoción"}, texto grande: ${hook[0]}`,
    music: clean(so.music) || "Cuerdas dramáticas y piano emotivo (música con licencia para redes)",
    biblicalPassage: clean(so.biblicalPassage) || ficha.biblicalBase,
  };
  return {
    title: clean(raw?.title) || `Episodio ${ctx.partNumber || 1}`, ficha, social, cover, selfScore,
    summary: clean(raw?.summary) || ctx.idea,
    cast, scenes, scriptBlocks, prompts: scenes.map(s => s.animationPrompt), promptsVersion: PROMPT_RULES_VERSION,
    dolaPrompt, dolaDuration, dolaSceneNumbers: dolaScenes.map(s => s.n), dolaIsAdaptation: total > dolaDuration, duration: total, editDuration: Math.round(scenes.length * EDIT_SECONDS),
    shortForLongPlatforms: total < 60 ? "Facebook y TikTok necesitan al menos 60 s: añade la tarjeta «Continuará…» de 3 s al final." : "",
    dialogueRules: "Palabras dominicanas completas con acentos (tíguere, yipeta, jevito, vaina, un chin, mi cualto). Nunca pa', vamo', e', ta'. Un solo personaje habla por escena.",
    // Portada con formato fijo (zona segura arriba, «PARTE n» dorado abajo); la descripción, título en MAYÚSCULAS + palabra + hashtags.
    hook, coverText: formatCoverText(ctx.seriesTitle || clean(raw?.title) || "Serie", cover.lines.join(" "), ctx.partNumber || 1), description: normalizeDescription(clean(raw?.description), shortTitle, word, stylePublish(style).tags),
    hashtags: Array.isArray(raw?.hashtags) && raw.hashtags.length ? raw.hashtags.map(clean).filter(Boolean).slice(0, 6) : ["#Frutinovelas", "#RD", "#Microdrama", "#Viral"],
    guionJson, baseFormula: BASE_FORMULA, platformAdaptations, platform_adaptations: platformAdaptations,
  };
}

// Plantilla local (sin IA o si la IA falla): mismas escenas y formato, con diálogo de estructura viral.
export function templateScenes(idea: string, cast: CastMember[], style: StyleKey, count: number) {
  const [a, b, c] = [cast[0], cast[1] || cast[0], cast[2] || cast[1] || cast[0]];
  const place = style === "cristiana" ? "frente al colegio, por la mañana" : style === "cine90" ? "una calle de Santo Domingo en 1994" : "una calle del barrio con colmado y motores";
  // Ida y vuelta entre dos personajes, frases de 2 a 6 palabras (nunca discursos).
  const beats: [CastMember, string, string, string][] = [
    [b, place, "desprecio", `¿Tú aquí? ¡Vete ya!`],
    [a, place, "dolor contenido", `Solo vine a verte.`],
    [b, place, "furia", `Aquí no eres nadie.`],
    [a, place, "lágrimas", `Lo mío es de verdad.`],
    [c, "en la cocina de la casa", "sorpresa", `Mira lo que encontré.`],
    [b, "en la cocina de la casa", "miedo", `¿Quién te dio eso?`],
    [c, "en la cocina de la casa", "determinación", `Esta carta lo cambia todo.`],
    [a, "en la sala de la casa", "nervios", `¿Me escondieron quién soy?`],
    [b, "en la sala de la casa", "arrepentimiento", `Yo solo quería protegerte.`],
    [a, "en la calle, al amanecer", "determinación", `Hoy se sabe la verdad.`],
  ];
  const out = beats.slice(0, Math.max(2, count - 1)).map(([m, setting, emotion, line]) => ({ speaker: m.name, setting, emotion, line }));
  out.push({ speaker: NARRATOR, setting: "plano final de la calle", emotion: "intriga", line: `Lo que ${a.name} no sabe… es que esa carta tiene otro nombre. ¿Quién la escribió?` });
  return { title: "Episodio 1", summary: idea, scenes: out };
}

// ---------- LOTE PARA FLOW (adaptado del flujo «SEPARA») ----------
// Las fichas se crean una vez y se aprueban en la biblia. Este lote solo genera escenas.
// Se calcula desde el episodio guardado, así también funciona con episodios anteriores.
export function buildFlowBatch(out: any) {
  const cast: any[] = Array.isArray(out?.cast) ? out.cast : [];
  const scenes: any[] = Array.isArray(out?.scenes) ? out.scenes : [];
  const vertical = !/16:9/.test(String(scenes[0]?.imagePromptFlow || ""));
  // El identificador va en su propia línea, separado del prompt: solo sirve para nombrar el archivo.
  const fichas = cast.filter(c => c.flowPrompt).map((c, i) => `${sheetId(i + 1)}\n${stripId(c.flowPrompt)}`);
  const escenas = scenes.map((sc, i) => `${sceneId(sc.n || i + 1)}\n${stripId(sc.imagePromptFlow)}`);
  const legend = cast.filter(c => c.flowPrompt).map((c, i) => `${sheetId(i + 1)} = ${c.name}`).join(", ");
  const instruction = `Adjunta en Flow las fichas maestras ya aprobadas${legend ? ` (${legend})` : ""} y úsalas como referencia obligatoria. Crea solo las imágenes de escena de abajo, una imagen por prompt, en formato ${vertical ? "vertical 9:16" : "16:9"}. El identificador entre corchetes va en su propia línea: úsalo como nombre del archivo, nunca como texto de la imagen. Conserva idénticas cabeza, cara, ropa y colores de cada ficha. No añadas texto ni marcas de agua.`;
  const full = [instruction, "", ...escenas.flatMap(e => [e, ""])].join("\n").trim();
  const dialogos = scenes.map(sc => `${sc.speaker}: ${sc.line}`).join("\n");
  const animaciones = scenes.map((sc, i) => `${sceneId(sc.n || i + 1)}\n${sc.animationPrompt}`).join("\n\n");
  return { full, fichas: fichas.join("\n\n"), escenas: escenas.join("\n\n"), dialogos, animaciones, count: { fichas: fichas.length, escenas: escenas.length } };
}

// Papel de cada escena en la estructura Gancho → Contexto → Desarrollo → Clímax → Consecuencia → Resolución,
// repartido sobre el número real de escenas (la primera siempre es Gancho y la última Resolución).
const ROLES = [
  { title: "Gancho", goal: "Atrapar desde el fotograma cero con la acción o consecuencia más intrigante", sfx: "Golpe sonoro seco al inicio y ambiente del lugar", music: "Percusión tensa" },
  { title: "Contexto", goal: "Explicar rápido qué originó el conflicto", sfx: "Ambiente del lugar, pasos y telas", music: "Cuerdas suaves de tensión" },
  { title: "Desarrollo", goal: "Revelación, decisión u obstáculo que sube la tensión", sfx: "Ambiente y un objeto clave que suena", music: "Cuerdas que crecen" },
  { title: "Clímax", goal: "La confrontación, descubrimiento o momento más fuerte", sfx: "Impacto dramático y silencio justo antes", music: "Percusión épica y cuerdas" },
  { title: "Consecuencia", goal: "Reacción de los personajes o nuevo conflicto", sfx: "Respiraciones y ambiente que se calma", music: "Piano emotivo" },
  { title: "Resolución", goal: "Conclusión emocional o espiritual y pregunta al público", sfx: "Ambiente suave", music: "Piano y cuerdas que cierran" },
];
export function sceneRole(i: number, total: number) {
  if (i === 0) return ROLES[0];
  if (i === total - 1) return ROLES[5];
  return ROLES[Math.min(4, 1 + Math.floor(((i - 1) * 4) / Math.max(1, total - 2)))];
}

// Rehace los prompts de imagen, animación y Dola de un episodio guardado con las reglas actuales.
// Conserva guion, escenas, personajes y todo lo demás.
export function refreshPrompts(out: any, style: StyleKey) {
  const cast: CastMember[] = Array.isArray(out?.cast) ? out.cast : [];
  const byName = new Map(cast.map(c => [c.name, c]));
  const scenes = (Array.isArray(out?.scenes) ? out.scenes : []).map((s: any, i: number) => {
    const member = byName.get(s.speaker);
    const others = (Array.isArray(s.characters) ? s.characters : []).map((n: string) => byName.get(n)).filter((m: CastMember | undefined): m is CastMember => !!m && m !== member);
    const idx = Number(s.n) ? Number(s.n) - 1 : i;
    return { ...s, imagePromptFlow: imagePrompt(s, member, others, style, idx), animationPrompt: animationPrompt(s, member, style, idx) };
  });
  const total = scenes.length * SCENE_SECONDS;
  const dolaNums: number[] = Array.isArray(out?.dolaSceneNumbers) && out.dolaSceneNumbers.length ? out.dolaSceneNumbers : selectShortScenes(scenes, Math.floor(60 / SCENE_SECONDS)).map((s: any) => s.n);
  const dolaScenes = scenes.filter((s: any) => dolaNums.includes(s.n));
  const dolaDuration = dolaScenes.length * SCENE_SECONDS;
  // Saltos de tiempo para el montaje también en episodios guardados antes de existir las tarjetas.
  const tarjetas = scenes.map((s: any, i: number) => ({ antes: i, texto: timeJump(`${s.transition || ""} ${s.setting || ""}`) })).filter((t: any) => t.antes > 0 && t.texto);
  const guionJson = out?.guionJson ? { ...out.guionJson, ...(tarjetas.length ? { tarjetas } : {}) } : out?.guionJson;
  return { ...out, guionJson, scenes, editDuration: Math.round(scenes.length * EDIT_SECONDS), prompts: scenes.map((s: any) => s.animationPrompt), dolaPrompt: scenes.length ? buildDolaPrompt(dolaScenes, cast, style, total, dolaDuration) : out?.dolaPrompt, promptsVersion: PROMPT_RULES_VERSION };
}
