// Producción del episodio: escenas de 8 s (una imagen de Flow + un clip de Seedance por escena),
// prompts con formato fijo, guion.json para el montaje y las 4 fichas de plataforma.
// Los prompts se construyen en el código (no los escribe la IA) para que siempre cumplan el formato.
import { BASE_FORMULA, buildPlatformAdaptations, mergeModelPlatforms } from "./platforms";
import { CHRISTIAN_SCENE_GUARD, NARRATOR_COLOR, type StyleKey } from "./knowledge";
import { dialectPronunciations, isFruitStyle, norm, type CastMember } from "./cast";
import type { Scene } from "./types";

export const SCENE_SECONDS = 8;
export const NARRATOR = "Narrador";
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

// 8 a 16 escenas de 8 s según la duración pedida.
export const sceneCountFor = (duration: number) => Math.min(16, Math.max(8, Math.round((Number(duration) || 90) / SCENE_SECONDS)));

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
  const who = member ? `${member.name} (cabeza entera de ${member.fruit}; ${member.clothing}) con expresión ${s.emotion}` : `sin personaje hablando`;
  return `Imagen 3D estilo Pixar premium, vertical 9:16. Encuadre: ${shot.es}. Referencia: ficha de ${member?.name || "los personajes"}. Escena: ${s.setting}. ${who}.${others.length ? ` También en escena: ${others.map(o => `${o.name} (cabeza de ${o.fruit})`).join(", ")}.` : ""} Cabeza de fruta en cada personaje, nunca cara humana.${guard} Sin texto, sin letreros, sin marca de agua.`;
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
SHOTS: 0–2 s: ${shot.en}, ${shot.moveEn}, ${narrator ? "the setting" : `${member!.name} reacts with ${s.emotion}`}. 2–5 s: ${narrator ? "slow push-in while the narrator says" : `medium shot, slow dolly toward ${member!.name}, who says with ${s.emotion}`} (in Spanish, exact words): "${s.line}" 5–8 s: ${narrator ? "wide shot holding on the scene" : `close-up of ${member!.name} holding the emotion after the line, static camera`}.
PRONUNCIATION: Latin American Spanish, every word complete, never English accent.
VOICES: ${voice} No subtitles or on-screen text.`;
  }
  const guard = style === "cristiana" ? ` ${CHRISTIAN_SCENE_GUARD[0].toUpperCase()}${CHRISTIAN_SCENE_GUARD.slice(1)}.` : "";
  const personajes = member
    ? `${member.name}: su cabeza es entera de ${member.fruit} (${member.headES}); ${member.clothing}. Cabeza de fruta en cada toma, nunca cara humana.`
    : "Personajes con cabeza de fruta, nunca cara humana; nadie habla a cámara.";
  const tomas = narrator
    ? `0–2 s: ${shot.es} de la escena, ${shot.move}. 2–6 s: acercamiento lento mientras el narrador dice en voz en off: "${s.line}" 6–8 s: plano general que se sostiene en silencio.`
    : `0–2 s: ${shot.es}, ${shot.move}; ${member!.name} reacciona con ${s.emotion}. 2–5 s: plano medio con dolly lento hacia ${member!.name}, que dice con ${s.emotion}: "${s.line}" 5–8 s: primer plano de ${member!.name} sosteniendo la emoción al terminar la frase, cámara fija.`;
  const voces = narrator
    ? `VOCES: Narrador: voz masculina profunda y cálida, en off. Español latino neutro, cada palabra completa, nunca acento inglés. Nadie mueve los labios. Sin subtítulos ni texto en pantalla.`
    : `VOCES: ${member!.name}: ${member!.voice}. Español latino neutro, cada palabra completa, nunca acento inglés. Solo habla ${member!.name}; sincronización de labios solo para quien habla. Sin subtítulos ni texto en pantalla.`;
  return `Telenovela animada 3D premium estilo Pixar, vertical 9:16, 8 segundos. Anima a partir de la imagen de la escena como primer fotograma.
Referencias: imagen 1 = escena${member ? `; imagen 2 = ficha de ${member.name}` : ""}.
PERSONAJES: ${personajes}
ESCENA: ${s.setting}.${guard}
TOMAS: ${tomas}
PRONUNCIACIÓN OBLIGATORIA: ${pronunciationFor(member, s.line)}.
${voces}`;
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
  base = selectShortScenes(base, Math.min(16, target));

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
  const guionJson = { colores, gancho: hook, cierre: "Continuará...", clips: scenes.map(s => [[s.speaker, s.line]]) };
  const total = scenes.length * SCENE_SECONDS;
  const scriptBlocks = scenes.map(s => ({ block: s.n, time: `${(s.n - 1) * SCENE_SECONDS}-${s.n * SCENE_SECONDS}s`, scene: s.setting, dialogue: [{ speaker: s.speaker, text: s.line }], onScreen: s.speaker === NARRATOR ? [] : [s.speaker] }));
  // Dola: versión corta sin perder el último giro, narrador ni cliffhanger.
  const dolaScenes = selectShortScenes(scenes, Math.floor(60 / SCENE_SECONDS));
  const dolaDuration = dolaScenes.length * SCENE_SECONDS;
  const castLine = cast.map(c => isFruitStyle(style) ? `${c.name}: cabeza entera de ${c.fruit} (${c.headES}); ${c.clothing}` : `${c.name}: ${c.visualEN || c.visualES}; ${c.clothing}`).join(". ");
  const dolaPrompt = `Usa Seedance 2.5. ${isFruitStyle(style) ? "Telenovela animada 3D premium estilo Pixar, vertical 9:16; cabeza de fruta en cada toma, nunca cara humana." : "Película romántica dominicana de los 90, 35 mm, vertical 9:16, personas reales."} ${total > dolaDuration ? `Adaptación de ${dolaDuration} s del episodio de ${total} s. Conserva el gancho y el cierre; elimina solo escenas intermedias.` : `Episodio completo de ${total} s.`}${style === "cristiana" ? ` ${CHRISTIAN_SCENE_GUARD}.` : ""} PERSONAJES: ${castLine}. ${dolaScenes.map((s, i) => `${i * SCENE_SECONDS}-${(i + 1) * SCENE_SECONDS}s [escena ${s.n}]: ${s.setting}. ${s.speaker === NARRATOR ? `Narrador en off: "${s.line}"` : `${s.speaker} dice con ${s.emotion}: "${s.line}"`}`).join(" ")} PRONUNCIACIÓN OBLIGATORIA: ${Array.from(new Set(cast.flatMap(c => c.pronunciations).concat(dialectPronunciations(dolaScenes.map(s => s.line).join(" "))))).join("; ") || "palabras completas con acentos correctos"}. VOCES: español latino neutro, cada palabra completa, nunca acento inglés; sincronización de labios solo para quien habla; sin subtítulos ni texto en pantalla.`;
  const platformAdaptations = mergeModelPlatforms(buildPlatformAdaptations({ theme: ctx.idea || clean(raw?.title), seriesTitle: ctx.seriesTitle || clean(raw?.title), partNumber: ctx.partNumber || 1, previousSummary: ctx.previousSummary, hook }), raw?.platforms);
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
    cast, scenes, scriptBlocks, prompts: scenes.map(s => s.animationPrompt),
    dolaPrompt, dolaDuration, dolaSceneNumbers: dolaScenes.map(s => s.n), dolaIsAdaptation: total > dolaDuration, duration: total,
    shortForLongPlatforms: total < 60 ? "Facebook y TikTok necesitan al menos 60 s: añade la tarjeta «Continuará…» de 3 s al final." : "",
    dialogueRules: "Palabras dominicanas completas con acentos (tíguere, yipeta, jevito, vaina, un chin, mi cualto). Nunca pa', vamo', e', ta'. Un solo personaje habla por escena.",
    hook, coverText: clean(raw?.coverText) || hook[0], description: clean(raw?.description) || ctx.idea,
    hashtags: Array.isArray(raw?.hashtags) && raw.hashtags.length ? raw.hashtags.map(clean).filter(Boolean).slice(0, 6) : ["#Frutinovelas", "#RD", "#Microdrama", "#Viral"],
    guionJson, baseFormula: BASE_FORMULA, platformAdaptations, platform_adaptations: platformAdaptations,
  };
}

// Plantilla local (sin IA o si la IA falla): mismas escenas y formato, con diálogo de estructura viral.
export function templateScenes(idea: string, cast: CastMember[], style: StyleKey, count: number) {
  const [a, b, c] = [cast[0], cast[1] || cast[0], cast[2] || cast[1] || cast[0]];
  const place = style === "cristiana" ? "frente al colegio, por la mañana" : style === "cine90" ? "una calle de Santo Domingo en 1994" : "una calle del barrio con colmado y motores";
  const beats: [CastMember, string, string, string][] = [
    [b, place, "desprecio", `¿Tú de verdad crees que alguien como tú me va a hacer cambiar de opinión?`],
    [a, place, "dolor contenido", `Yo no tengo mucho, pero lo que siento es de verdad.`],
    [c, "en la cocina de la casa", "preocupación", `Esto se va a saber, y cuando se sepa, se va a armar una vaina grande.`],
    [a, "en la puerta de la casa, de noche", "nervios", `Mañana le digo la verdad delante de todo el mundo.`],
    [b, "en la sala de la casa", "furia", `Si das un paso más, te olvidas de esta familia.`],
    [c, "en la sala de la casa", "sorpresa", `Mira lo que encontré guardado en esta carta.`],
    [a, "en la sala de la casa", "lágrimas", `Todo este tiempo me escondieron quién era yo de verdad.`],
    [b, "en la sala de la casa", "arrepentimiento", `Yo solo quería protegerte, aunque lo hice de la peor manera.`],
    [c, "en la puerta de la casa", "esperanza", `Todavía estamos a tiempo de arreglar esto.`],
    [a, "en la calle, al amanecer", "determinación", `Hoy voy a decidir quién soy, cueste lo que cueste.`],
  ];
  const out = beats.slice(0, Math.max(2, count - 1)).map(([m, setting, emotion, line]) => ({ speaker: m.name, setting, emotion, line }));
  out.push({ speaker: NARRATOR, setting: "plano final de la calle", emotion: "intriga", line: `Lo que ${a.name} no sabe… es que la verdad apenas comienza.` });
  return { title: "Episodio 1", summary: idea, scenes: out };
}

// ---------- LOTE PARA FLOW (adaptado del flujo «SEPARA») ----------
// Un solo bloque para pegar en Flow: instrucción + fichas [P01..] + escenas [001..].
// Se calcula desde el episodio guardado, así también funciona con episodios anteriores.
export function buildFlowBatch(out: any) {
  const cast: any[] = Array.isArray(out?.cast) ? out.cast : [];
  const scenes: any[] = Array.isArray(out?.scenes) ? out.scenes : [];
  const vertical = !/16:9/.test(String(scenes[0]?.imagePromptFlow || ""));
  // El identificador va en su propia línea, separado del prompt: solo sirve para nombrar el archivo.
  const fichas = cast.filter(c => c.flowPrompt).map((c, i) => `${sheetId(i + 1)}\n${stripId(c.flowPrompt)}`);
  const escenas = scenes.map((sc, i) => `${sceneId(sc.n || i + 1)}\n${stripId(sc.imagePromptFlow)}`);
  const legend = cast.filter(c => c.flowPrompt).map((c, i) => `${sheetId(i + 1)} = ${c.name}`).join(", ");
  const instruction = `Crea todas las imágenes según los prompts de abajo, una imagen por prompt, en formato ${vertical ? "vertical 9:16" : "16:9"}. Antes de cada prompt hay un identificador entre corchetes en su propia línea: no es parte de la imagen, úsalo solo como nombre del archivo (por ejemplo [001]). Genera primero las fichas de personaje [P01], [P02]… y úsalas como referencia en cada escena donde aparece ese personaje, para que su cabeza, ropa y colores sean idénticos en todas las imágenes${legend ? ` (${legend})` : ""}. No añadas texto ni marcas de agua.`;
  const full = [instruction, "", ...fichas.flatMap(f => [f, ""]), ...escenas.flatMap(e => [e, ""])].join("\n").trim();
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
