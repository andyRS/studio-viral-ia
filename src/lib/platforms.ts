// MÓDULO 4B — ADAPTACIÓN POR PLATAFORMA
// REGLA OBLIGATORIA: toda historia se construye primero con la FÓRMULA BASE
// (Instagram) y después se generan 4 versiones, una por plataforma.
// Nunca el mismo archivo ni el mismo texto en las 4 plataformas.

export interface PlatformAdaptation {
  platform: "Instagram" | "Facebook" | "TikTok" | "YouTube Shorts";
  recommendedDuration: string;
  editingChanges: string[];
  coverText: string;
  title: string;
  description: string;
  hashtags: string[];
  bestTime: string;
  frequency: string;
  cta: string;
  metricsToWatch: string[];
  checklist: string[];
  fileName: string; // archivo distinto por plataforma, nunca reutilizado
  pinnedComment?: string;
  start?: string;   // cómo empieza el vídeo en esta plataforma
  extra?: string;   // acción extra recomendada
  topic?: string;   // Facebook: tema que hay que elegir al publicar
}

// Por estilo: palabra para comentar, tema de Facebook y hashtags de nicho.
const STYLE_PUBLISH: Record<string, { word: (part: number) => string; topic: string; tags: string[] }> = {
// Etiquetas que repiten los vídeos de frutinovelas que más alcance tienen en TikTok: las del nicho
// (#frutinovela #frutinovelas), el género (#drama #minidrama) y #ia; las de alcance van aparte.
  frutinovela: { word: p => `PARTE ${p + 1}`, topic: "Animación", tags: ["#frutinovela", "#frutinovelas", "#drama", "#minidrama", "#ia"] },
  cristiana: { word: () => "AMÉN", topic: "Religión", tags: ["#frutinovela", "#frutinovelas", "#reflexion", "#cristianos", "#ia"] },
  cine90: { word: () => "BUTACA", topic: "Películas", tags: ["#peliculasquenoexisten", "#historiadeamor", "#cortometraje", "#videoia", "#romance"] },
};
export const stylePublish = (style?: string) => STYLE_PUBLISH[style || ""] || STYLE_PUBLISH.frutinovela;

const GENERIC_TAGS = /^#(fyp|foryou|foryoupage|parati|viral|xyzbca|tiktok|reels|fb|facebook)$/i;
const tagOf = (t: string) => "#" + String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^#/, "").replace(/[^a-z0-9ñ]/gi, "").toLowerCase();
// Hashtags para que el vídeo llegue lejos: la etiqueta propia de la serie (como #fruitloveisland), las del
// nicho, 1-2 del tema concreto del episodio (#suegratoxica, #infidelidad) y las de alcance.
// TikTok: 6-7 etiquetas con #parati #fyp; Facebook: 4-5, sin las de TikTok.
export function viralHashtags(style: string, platform: "TikTok" | "Facebook" | string, seriesTitle: string, episodeTags: string[] = []) {
  const sp = stylePublish(style);
  const serie = seriesTitle ? tagOf(seriesTitle) : "";
  const nicho = sp.tags.map(tagOf);
  const tema = episodeTags.map(tagOf).filter(t => t.length > 3 && !GENERIC_TAGS.test(t) && !nicho.includes(t) && t !== serie).slice(0, 2);
  const list = platform === "TikTok"
    ? [serie, nicho[0], nicho[1], ...tema, nicho[2], "#parati", "#fyp", nicho[4]]
    : [serie, nicho[0], nicho[1], ...tema, nicho[2]];
  return Array.from(new Set(list.filter(t => t && t.length > 2))).slice(0, platform === "TikTok" ? 8 : 5);
}
// Descripción: título corto en MAYÚSCULAS + palabra para comentar + 3-6 hashtags.
export function formatDescription(title: string, word: string, hashtags: string[]) {
  return `${title.toUpperCase()}\nComenta ${word} 👇\n${hashtags.slice(0, 6).join(" ")}`;
}
// La descripción que escribe la IA se completa hasta cumplir el formato: primera línea en MAYÚSCULAS,
// la palabra para comentar y los hashtags (sin repetirlos si ya están).
export function normalizeDescription(desc: string, title: string, word: string, hashtags: string[]) {
  let d = String(desc || "").trim();
  if (!d) return formatDescription(title, word, hashtags);
  const first = d.split("\n")[0];
  if (first !== first.toUpperCase()) d = `${title.toUpperCase()}\n${d}`;
  if (!d.toLowerCase().includes(word.toLowerCase())) d += `\nComenta ${word} 👇`;
  if (!/#\w/.test(d)) d += `\n${hashtags.slice(0, 6).join(" ")}`;
  return d;
}
// Portada de serie: arriba, en la zona segura, nombre y frase de intriga; abajo «PARTE n» enorme en dorado.
export function formatCoverText(seriesTitle: string, intrigue: string, part: number) {
  return `ARRIBA (zona segura, 300-600 px de alto): ${seriesTitle.toUpperCase()} · ${intrigue}\nABAJO (1290-1640 px, dorado, enorme): PARTE ${part}`;
}

export const BASE_FORMULA_NAME = "FÓRMULA BASE (Instagram) — origen de las 4 adaptaciones";
export const BASE_FORMULA = {
  name: BASE_FORMULA_NAME,
  platformOrigin: "Instagram",
  structure: [
    "Conflicto / estatus visible en el segundo 0-1, sin presentaciones",
    "Gancho en texto: 2 líneas en los primeros 3 segundos",
    "Revelación mediante un objeto: una entrada, una carta, un celular o una prueba de embarazo",
    "Escalada rápida + giro / cliffhanger",
    "Estética cinematográfica, primeros planos de reacciones",
    'Cierre "Continuará..." + "¿Parte 2?" en comentarios',
  ],
  hookLines: 2,
  closing: "Continuará...",
  commentPrompt: "¿Parte 2?",
};

export function formatAdaptationForCopy(a: PlatformAdaptation): string {
  return [
    `PLATAFORMA: ${a.platform}`,
    `Duración recomendada: ${a.recommendedDuration}`,
    `Archivo (único para esta plataforma): ${a.fileName}`,
    `Cambios de montaje: ${a.editingChanges.join(" | ")}`,
    `Texto de portada: ${a.coverText}`,
    `Título: ${a.title}`,
    `Descripción: ${a.description}`,
    `Hashtags: ${a.hashtags.join(" ")}`,
    `Mejor horario: ${a.bestTime}`,
    `Frecuencia: ${a.frequency}`,
    `CTA: ${a.cta}`,
    a.pinnedComment ? `Comentario fijado: ${a.pinnedComment}` : "",
    a.start ? `Inicio: ${a.start}` : "",
    a.extra ? `Extra: ${a.extra}` : "",
    a.topic ? `Tema al publicar (obligatorio): ${a.topic}` : "",
    `Métricas a vigilar: ${a.metricsToWatch.join(", ")}`,
    `Checklist: ${a.checklist.join(" | ")}`,
  ].filter(Boolean).join("\n");
}

export function buildPlatformAdaptations(input: any): PlatformAdaptation[] {
  const theme: string = input?.theme || input?.idea || "Historia por definir";
  const seriesTitle: string = input?.seriesTitle || input?.series?.title || "Serie";
  const part: number = Number(input?.partNumber || input?.episodeNumber || 1);
  const hook1: string = input?.hook?.[0] || "El conflicto comienza aquí";
  const isContinuation = Boolean(input?.previousSummary);
  const sp = stylePublish(input?.style);
  const word = sp.word(part);
  const cover = formatCoverText(seriesTitle, input?.hook?.join(" ") || hook1, part);
  const shortTitle = `${seriesTitle} · Parte ${part}`;
  const slug = seriesTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const instagram: PlatformAdaptation = {
    platform: "Instagram",
    recommendedDuration: "Corte de 25-46 s del máster, en un solo corte sin relleno (empieza en el conflicto)",
    start: "Gancho de texto",
    extra: "Historia «Disponible en unos minutos» con sticker",
    pinnedComment: "Comenta PARTE 2 y te la subo 👇",
    editingChanges: [
      "Versión origen de la FÓRMULA BASE: conflicto/estatus visible en segundo 0-1, sin presentaciones",
      "Cortes rápidos cada 2-4 segundos",
      "Revelación mediante un objeto en primer plano (entrada, carta, celular o prueba de embarazo)",
      "Estética cinematográfica, primeros planos de reacciones",
      'Cerrar con "Continuará..." y fijar el comentario "¿Parte 2?"',
    ],
    coverText: cover,
    title: `${seriesTitle} — Parte ${part} | ${theme}`,
    description: formatDescription(shortTitle, word, sp.tags.slice(0, 5)),
    hashtags: sp.tags.slice(0, 5),
    bestTime: "7-9 p. m. (hora RD)",
    frequency: "1 Reel por episodio (versión base)",
    cta: `Comenta ${word}`,
    metricsToWatch: ["compartidos", "guardados", "seguidores ganados"],
    checklist: ['Activar la etiqueta "Información de IA" / contenido generado con IA al publicar', "Portada con cara en primer plano + 1 frase de intriga", "3-5 hashtags de nicho (no más)", "Archivo propio de Instagram, no reutilizar el de TikTok/Facebook/Shorts"],
    fileName: `${slug}-parte-${part}-instagram-corte.mp4`,
  };

  const facebook: PlatformAdaptation = {
    platform: "Facebook",
    recommendedDuration: "Máster de 60-90 s (mínimo 60 s para monetizar)",
    start: "Gancho de texto",
    extra: "Compartir en 3 grupos dominicanos con una frase propia",
    topic: sp.topic,
    pinnedComment: "¿Quién tiene la culpa? La Parte " + (part + 1) + " sale pronto 👇",
    editingChanges: [
      "Montaje más largo que Instagram: diálogo sin pausas, sin recortar la escalada",
      "Gancho visible sostenido durante los primeros 5-8 segundos",
      "Subida NATIVA a Facebook, nunca compartir/exportar desde Instagram (penaliza alcance y deja marcas)",
      "Dejar aire emotivo en la revelación con el objeto para que la audiencia comente",
      'Cerrar con "Continuará..." + pregunta de debate',
      "Pedir el «me gusta» dentro del vídeo, en la frase final (llamada de la tarjeta de cierre)",
    ],
    coverText: cover,
    title: `${seriesTitle} — Parte ${part}: ${theme}`,
    description: formatDescription(shortTitle, word, sp.tags.slice(0, 3)),
    hashtags: sp.tags.slice(0, 3),
    bestTime: "19:00-22:00 (7-10 pm, hora RD)",
    frequency: "1 publicación al día",
    cta: "¿Quién tiene la culpa? Comenta y comparte en tu grupo",
    metricsToWatch: ["tiempo promedio de reproducción", "vistas de 1 minuto", "ingresos estimados"],
    checklist: [
      `Elegir el TEMA del vídeo al publicar: ${sp.topic}`,
      "Video subido nativo a Facebook (nunca desde Instagram)",
      "Gancho visible 5-8 segundos",
      "Descripción emotiva / de debate lista",
      "Compartir en 3 grupos (ver notas de grupos)",
      "Archivo propio de Facebook, distinto al de Instagram/TikTok/Shorts",
      // Frases sugeridas para grupos — el usuario las adapta / verifica el grupo antes de publicar
      "Grupo sugerido 1 (buscar: dominicanos en USA / diáspora): «Paisanos, esta frutinovela dominicana me dejó pensando… ¿quién tiene la culpa?»",
      "Grupo sugerido 2 (buscar: novelas y dramas en español): «Para los que aman las novelas cortas: una historia de frutas con un secreto familiar. ¿La sigo subiendo aquí?»",
      "Grupo sugerido 3 (buscar: dominicanos unidos / comunidad RD): «Talento dominicano con IA 🇩🇴 ¿apoyamos la Parte " + part + "? Comenten quién tiene la culpa.»",
    ],
    fileName: `${slug}-parte-${part}-master-facebook.mp4`,
  };

  const tiktok: PlatformAdaptation = {
    platform: "TikTok",
    recommendedDuration: "Máster de 60-90 s (más de 1 min: elegible para monetización)",
    start: isContinuation ? "«Anteriormente…» de 5 s y después el gancho" : "Gancho de texto",
    extra: "Playlist por serie; responder comentarios con vídeo",
    pinnedComment: "La Parte " + (part + 1) + " ya viene. ¿Qué harías tú? 👇",
    editingChanges: [
      isContinuation ? '"Anteriormente..." de 5-8 segundos al inicio (es continuación)' : "Sin 'Anteriormente...' (es Parte 1): entrar directo al conflicto del segundo 0-1",
      "Tarjetas de tiempo en pantalla: «Días después...», «Mientras tanto...»",
      "Diálogo sin pausas, pocas escenas largas en vez de cortes de 2-4s de Instagram",
      "Narrador SOLO en la última frase",
      "Dejar 2-3 comentarios semilla para responder en video",
    ],
    coverText: cover,
    title: `${seriesTitle} — Parte ${part}`,
    description: `frutinovela | telenovela de frutas | drama dominicano — ${theme}. Parte ${part} de ${seriesTitle}. Sígueme y entra a la playlist de la serie para verla en orden. Continuará...`,
    hashtags: [...sp.tags.slice(0, 4), "#parati"],
    bestTime: "12-2 p. m. o 7-10 p. m. (hora RD)",
    frequency: "1-2 publicaciones al día",
    cta: "Sigue la serie en la playlist y comenta: te respondo en video",
    metricsToWatch: ["% de video visto completo", "nuevos seguidores", "búsquedas que trajeron el video"],
    checklist: ["Agregar el episodio a la playlist de la serie en TikTok", "Responder comentarios con video (respuestas en video)", "Descripción con keywords buscables: frutinovela, telenovela de frutas, drama dominicano", "3-5 hashtags", "Archivo propio de TikTok, distinto al de Instagram/Facebook/Shorts"],
    fileName: `${slug}-parte-${part}-master-tiktok.mp4`,
  };

  const shortsTitle = `${theme} 😱 #shorts`.slice(0, 60);
  const youtube: PlatformAdaptation = {
    platform: "YouTube Shorts",
    recommendedDuration: "Máster o corte de hasta 90 s",
    start: "Gancho de texto",
    extra: "Vincular la siguiente parte (vídeo relacionado)",
    pinnedComment: "Parte " + (part + 1) + " en el vídeo relacionado 👆",
    editingChanges: [
      "Final que empalma con el inicio: la última frase/frame conecta con la primera para crear bucle (loop)",
      "Recorte limpio, SIN marcas de agua de TikTok/Instagram/Facebook",
      "Exportar archivo limpio desde el máster, nunca descargar el video ya publicado en otra plataforma",
      'Vincular la siguiente parte con "video relacionado" de YouTube Shorts',
    ],
    coverText: `Fotograma más fuerte — ${hook1}`,
    title: shortsTitle,
    description: `${theme} — ${seriesTitle}, Parte ${part}. Mira la siguiente parte en el video relacionado. #shorts`,
    hashtags: ["#shorts", ...sp.tags.slice(0, 2)],
    bestTime: "Cualquier hora",
    frequency: "1 Short por episodio (versión en bucle)",
    cta: "Mira la Parte " + (part + 1) + " en el video relacionado",
    metricsToWatch: ["visto vs deslizado (viewed vs swiped away)", "retención / duración media de la visualización"],
    checklist: ["Título con keywords + #shorts, máximo 60 caracteres", "Sin marcas de agua, archivo limpio", "Bucle inicio-fin comprobado antes de subir", '"Video relacionado" vinculado a la siguiente parte'],
    fileName: `${slug}-parte-${part}-youtube-shorts-limpio.mp4`,
  };

  return [instagram, facebook, tiktok, youtube];
}

// Textos de publicación que escribe la IA (título, descripción, hashtags, hora, CTA y comentario
// fijado por plataforma) encima de la ficha de plantilla. Lo que la IA no da se queda como estaba.
const KEY_OF: Record<string, PlatformAdaptation["platform"]> = { facebook: "Facebook", tiktok: "TikTok", instagram: "Instagram", youtube: "YouTube Shorts", shorts: "YouTube Shorts" };
export function mergeModelPlatforms(base: PlatformAdaptation[], model: any): PlatformAdaptation[] {
  if (!model || typeof model !== "object") return base;
  const byPlatform = new Map<string, any>();
  for (const [k, v] of Object.entries(model)) { const name = KEY_OF[k.toLowerCase().replace(/[^a-z]/g, "")]; if (name && v && typeof v === "object") byPlatform.set(name, v); }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return base.map(a => {
    const m = byPlatform.get(a.platform);
    if (!m) return a;
    const tags = Array.isArray(m.hashtags) ? m.hashtags.map((t: unknown) => String(t).trim()).filter(Boolean).map((t: string) => (t.startsWith("#") ? t : "#" + t)) : [];
    // 3-6 hashtags: si la IA da menos de 3 se completan con los de la plantilla.
    const merged = Array.from(new Set([...tags, ...(tags.length < 3 ? a.hashtags : [])])).slice(0, 6);
    return { ...a, title: str(m.title) || a.title, description: str(m.description) || a.description, hashtags: merged.length ? merged : a.hashtags,
      bestTime: str(m.hour) || a.bestTime, cta: str(m.cta) || a.cta, pinnedComment: str(m.pinnedComment) || a.pinnedComment, topic: a.topic ? str(m.topic) || a.topic : undefined };
  });
}
