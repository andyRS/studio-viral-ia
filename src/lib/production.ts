// Producción del episodio: escenas de 8 s (una imagen de Flow + un clip de Seedance por escena),
// prompts con formato fijo, guion.json para el montaje y las 4 fichas de plataforma.
// Los prompts se construyen en el código (no los escribe la IA) para que siempre cumplan el formato.
import { BASE_FORMULA, buildPlatformAdaptations } from "./platforms";
import { CHRISTIAN_SCENE_GUARD, NARRATOR_COLOR, type StyleKey } from "./knowledge";
import { dialectPronunciations, isFruitStyle, norm, type CastMember } from "./cast";
import type { Scene } from "./types";

export const SCENE_SECONDS = 8;
export const NARRATOR = "Narrador";
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

// 8 a 16 escenas de 8 s según la duración pedida.
export const sceneCountFor = (duration: number) => Math.min(16, Math.max(8, Math.round((Number(duration) || 90) / SCENE_SECONDS)));

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
    return `Use Seedance 2.5. 1990s Dominican romance film, 35mm grain, warm golden light, vertical 9:16, 8 seconds.
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
  return `Usa Seedance 2.5. Telenovela animada 3D premium estilo Pixar, vertical 9:16, 8 segundos.
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
    return [{ ...s, line: parts.slice(0, cut).join(" ") }, { ...s, line: parts.slice(cut).join(" ") }];
  });
  if (style === "cristiana") base = base.map(s => ({ ...s, setting: stripForbidden(s.setting), line: stripForbidden(s.line) }));
  // Cristiana: el final pide "Escribe AMÉN" en boca del narrador.
  if (style === "cristiana" && !base.some(s => /escribe am[eé]n/i.test(s.line))) {
    if (base.length >= 16) base = base.slice(0, 15);
    base.push({ setting: base[base.length - 1]?.setting || "iglesia evangélica sencilla", speaker: NARRATOR, line: "Si crees que Dios restaura lo que el orgullo rompe… Escribe AMÉN.", emotion: "esperanza", present: [] });
  }
  base = base.slice(0, 16);

  const scenes: Scene[] = base.map((s, i) => {
    const member = byName.get(s.speaker);
    const others = s.present.map((p: unknown) => byName.get(findSpeaker(p, cast))).filter((m: CastMember | undefined): m is CastMember => !!m && m !== member);
    return {
      n: i + 1, durationSec: SCENE_SECONDS, setting: s.setting, speaker: s.speaker, line: s.line, emotion: s.emotion,
      imagePromptFlow: `${sceneId(i + 1)} ${imagePrompt(s, member, others, style, i)}`,
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
  // Dola: un prompt con las primeras escenas hasta 60 s.
  const dolaScenes = scenes.slice(0, Math.floor(60 / SCENE_SECONDS));
  const dolaDuration = dolaScenes.length * SCENE_SECONDS;
  const castLine = cast.map(c => isFruitStyle(style) ? `${c.name}: cabeza entera de ${c.fruit} (${c.headES}); ${c.clothing}` : `${c.name}: ${c.visualEN || c.visualES}; ${c.clothing}`).join(". ");
  const dolaPrompt = `Usa Seedance 2.5. ${isFruitStyle(style) ? "Telenovela animada 3D premium estilo Pixar, vertical 9:16; cabeza de fruta en cada toma, nunca cara humana." : "Película romántica dominicana de los 90, 35 mm, vertical 9:16, personas reales."} ${total > dolaDuration ? `Adaptación de ${dolaDuration} s del episodio de ${total} s.` : `Episodio completo de ${total} s.`}${style === "cristiana" ? ` ${CHRISTIAN_SCENE_GUARD}.` : ""} PERSONAJES: ${castLine}. ${dolaScenes.map(s => `${(s.n - 1) * SCENE_SECONDS}-${s.n * SCENE_SECONDS}s: ${s.setting}. ${s.speaker === NARRATOR ? `Narrador en off: "${s.line}"` : `${s.speaker} dice con ${s.emotion}: "${s.line}"`}`).join(" ")} PRONUNCIACIÓN OBLIGATORIA: ${Array.from(new Set(cast.flatMap(c => c.pronunciations).concat(dialectPronunciations(dolaScenes.map(s => s.line).join(" "))))).join("; ") || "palabras completas con acentos correctos"}. VOCES: español latino neutro, cada palabra completa, nunca acento inglés; sincronización de labios solo para quien habla; sin subtítulos ni texto en pantalla.`;
  const platformAdaptations = buildPlatformAdaptations({ theme: ctx.idea || clean(raw?.title), seriesTitle: ctx.seriesTitle || clean(raw?.title), partNumber: ctx.partNumber || 1, previousSummary: ctx.previousSummary, hook });
  return {
    title: clean(raw?.title) || `Episodio ${ctx.partNumber || 1}`,
    summary: clean(raw?.summary) || ctx.idea,
    cast, scenes, scriptBlocks, prompts: scenes.map(s => s.animationPrompt),
    dolaPrompt, dolaDuration, dolaIsAdaptation: total > dolaDuration, duration: total,
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
  const fichas = cast.filter(c => c.flowPrompt).map((c, i) => `${sheetId(i + 1)} ${stripId(c.flowPrompt)}`);
  const escenas = scenes.map((sc, i) => `${sceneId(sc.n || i + 1)} ${stripId(sc.imagePromptFlow)}`);
  const legend = cast.filter(c => c.flowPrompt).map((c, i) => `${sheetId(i + 1)} = ${c.name}`).join(", ");
  const instruction = `Crea todas las imágenes según los prompts de abajo, una imagen por prompt, en formato ${vertical ? "vertical 9:16" : "16:9"}. Cada prompt empieza con su identificador entre corchetes. Renombra automáticamente cada imagen usando los 5 primeros caracteres de su prompt (el identificador, por ejemplo [001]). Genera primero las fichas de personaje [P01], [P02]… y úsalas como referencia en cada escena donde aparece ese personaje, para que su cabeza, ropa y colores sean idénticos en todas las imágenes${legend ? ` (${legend})` : ""}. No añadas texto ni marcas de agua.`;
  const full = [instruction, "", ...fichas.flatMap(f => [f, ""]), ...escenas.flatMap(e => [e, ""])].join("\n").trim();
  const dialogos = scenes.map(sc => `${sc.speaker}: ${sc.line}`).join("\n");
  const animaciones = scenes.map((sc, i) => `${sceneId(sc.n || i + 1)}\n${sc.animationPrompt}`).join("\n\n");
  return { full, fichas: fichas.join("\n\n"), escenas: escenas.join("\n\n"), dialogos, animaciones, count: { fichas: fichas.length, escenas: escenas.length } };
}
