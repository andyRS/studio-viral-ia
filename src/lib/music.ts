// Prompts para crear en Muse (muse.ai) la música de fondo original. Muse no tiene API: se copia el
// prompt, se descarga el MP3 y se sube en «Montar vídeo final». Dos piezas:
// 1) el TEMA de la serie (una vez): la misma melodía de firma en todas las partes;
// 2) la PISTA del capítulo: una versión del tema con la duración y los momentos de ese episodio.

export type MusicContext = {
  style: string; series?: string; logline?: string; episodeTitle?: string; part?: number;
  summary?: string; closing?: string; cues?: string[]; scenes?: number; seconds?: number;
};

const EDIT_SECONDS = 4.5;   // cada escena queda en ~4,5 s tras el recorte del montaje
const END_CARD = 3;         // tarjeta «Continuará…» / «FIN»

function genre(c: MusicContext) {
  const text = `${c.series || ""} ${c.logline || ""} ${c.episodeTitle || ""} ${c.summary || ""}`;
  const christmas = /navidad|navideñ|nochebuena|christmas|diciembre/i.test(text);
  const base = c.style === "cine90"
    ? { mood: "balada romántica y bolero de los 90, cinematográfica y nostálgica", inst: "piano de cola, cuerdas, guitarra española de requinto y un saxo muy suave", bpm: "70-80 BPM" }
    : c.style === "cristiana"
      ? { mood: "emotiva y esperanzadora, de inspiración cristiana contemporánea", inst: "piano, cuerdas cálidas y pads suaves", bpm: "65-75 BPM" }
      : { mood: "telenovela latina dominicana, dramática y con sabor caribeño", inst: "cuerdas dramáticas, piano, guitarra de requinto de bachata y güira muy suave", bpm: "85-95 BPM" };
  return christmas ? { ...base, inst: `${base.inst}, con campanitas y celesta navideñas` } : base;
}

export function seriesThemePrompt(c: MusicContext) {
  const g = genre(c);
  return [
    `Crea el TEMA PRINCIPAL instrumental de la serie «${c.series || "la serie"}»: 60 segundos, sin voces ni letra, para repetirlo en todas sus partes.`,
    c.logline ? `La serie trata de: ${c.logline}` : "",
    `Estilo: ${g.mood}. Instrumentos: ${g.inst}. Tempo: ${g.bpm}.`,
    "Una melodía principal sencilla y memorable de 4 a 8 compases, que se reconozca en 3 segundos y que se pueda repetir en bucle sin cortes.",
    "Va por debajo de los diálogos: sin solos fuertes ni golpes que tapen las voces.",
    "Formato: MP3 de buena calidad, que empiece y termine limpio.",
  ].filter(Boolean).join("\n");
}

export function episodeTrackPrompt(c: MusicContext) {
  const g = genre(c);
  const total = Math.max(25, Math.round(c.seconds || (c.scenes || 12) * EDIT_SECONDS + END_CARD));
  const climax = Math.round(total * 0.65);
  const arc = Array.from(new Set((c.cues || []).map(x => x.trim()).filter(Boolean))).slice(0, 6);
  return [
    `Crea una VERSIÓN del tema de la serie «${c.series || "la serie"}» para la parte ${c.part || 1}${c.episodeTitle ? ` («${c.episodeTitle}»)` : ""}: instrumental, sin voces ni letra, de ${total} segundos exactos.`,
    "Si Muse permite subir audio de referencia, usa el MP3 del tema de la serie para mantener la misma melodía.",
    c.summary ? `Lo que pasa en este capítulo: ${c.summary}` : "",
    `Estilo: ${g.mood}. Instrumentos: ${g.inst}. Tempo: ${g.bpm}.`,
    `Momentos: 0-3 s, entrada con tensión (un golpe suave y la melodía que se reconoce); de 3 a ${climax} s, sube poco a poco${arc.length ? ` siguiendo este arco: ${arc.join(" → ")}` : ""}; hacia el segundo ${climax}, el clímax; después baja y, en los últimos ${END_CARD + 3} s, termina en una nota suspendida, sin resolver, para el «Continuará…»${c.closing ? ` (el capítulo cierra con: «${c.closing}»)` : ""}.`,
    "Sin silencios: suena de principio a fin, siempre por debajo de los diálogos.",
    "Formato: MP3 de buena calidad.",
  ].filter(Boolean).join("\n");
}
