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
  const slug = seriesTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const instagram: PlatformAdaptation = {
    platform: "Instagram",
    recommendedDuration: "Corte de 45-75 s del máster (sin saludos ni relleno; empieza en el conflicto)",
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
    coverText: `Diseño de serie igual en todas las partes — ${hook1}`,
    title: `${seriesTitle} — Parte ${part} | ${theme}`,
    description: `¿De verdad hizo eso? 👀 ${theme}. Comenta PARTE 2 si quieres la continuación.`,
    hashtags: ["#Frutinovelas", "#DramaDominicano", "#ReelsRD", "#Microdrama", "#TelenovelaDeFrutas"],
    bestTime: "7-9 p. m. (hora RD)",
    frequency: "1 Reel por episodio (versión base)",
    cta: "Comenta PARTE 2",
    metricsToWatch: ["compartidos", "guardados", "seguidores ganados"],
    checklist: ['Activar la etiqueta "Información de IA" / contenido generado con IA al publicar', "Portada con cara en primer plano + 1 frase de intriga", "3-5 hashtags de nicho (no más)", "Archivo propio de Instagram, no reutilizar el de TikTok/Facebook/Shorts"],
    fileName: `${slug}-parte-${part}-instagram-corte.mp4`,
  };

  const facebook: PlatformAdaptation = {
    platform: "Facebook",
    recommendedDuration: "Máster de 60-90 s (mínimo 60 s para monetizar)",
    start: "Gancho de texto",
    extra: "Compartir en 3 grupos dominicanos con una frase propia",
    pinnedComment: "¿Quién tiene la culpa? La Parte " + (part + 1) + " sale pronto 👇",
    editingChanges: [
      "Montaje más largo que Instagram: diálogo sin pausas, sin recortar la escalada",
      "Gancho visible sostenido durante los primeros 5-8 segundos",
      "Subida NATIVA a Facebook, nunca compartir/exportar desde Instagram (penaliza alcance y deja marcas)",
      "Dejar aire emotivo en la revelación con el objeto para que la audiencia comente",
      'Cerrar con "Continuará..." + pregunta de debate',
    ],
    coverText: `Cara en primer plano + frase de intriga: ${hook1}`,
    title: `${seriesTitle} — Parte ${part}: ${theme}`,
    description: `${theme}. ${hook1} ¿Qué habrías hecho tú? Comenta tu opinión. Continuará...`,
    hashtags: ["#Frutinovelas", "#Dominicanos"],
    bestTime: "19:00-22:00 (7-10 pm, hora RD)",
    frequency: "1 publicación al día",
    cta: "¿Quién tiene la culpa? Comenta y comparte en tu grupo",
    metricsToWatch: ["tiempo promedio de reproducción", "vistas de 1 minuto", "ingresos estimados"],
    checklist: [
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
    coverText: `PARTE ${part} — ${seriesTitle}`,
    title: `${seriesTitle} — Parte ${part}`,
    description: `frutinovela | telenovela de frutas | drama dominicano — ${theme}. Parte ${part} de ${seriesTitle}. Sígueme y entra a la playlist de la serie para verla en orden. Continuará...`,
    hashtags: ["#frutinovela", "#telenoveladefrutas", "#dramadominicano", "#parati", "#novelas"],
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
    hashtags: ["#shorts", "#frutinovelas"],
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
    return { ...a, title: str(m.title) || a.title, description: str(m.description) || a.description, hashtags: tags.length ? tags : a.hashtags,
      bestTime: str(m.hour) || a.bestTime, cta: str(m.cta) || a.cta, pinnedComment: str(m.pinnedComment) || a.pinnedComment };
  });
}
