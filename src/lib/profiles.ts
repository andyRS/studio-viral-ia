// Perfiles de cuenta: qué contenido hace cada cuenta, con qué reglas y hacia qué objetivo.
// El texto de profileText() se inyecta en todos los prompts de la IA (series, episodios, ideas, ganchos
// y fichas de plataforma) después del manual viral y antes de la tarea, y manda sobre las reglas generales.
import type { AccountProfile } from "./types";

export function profileText(p?: Partial<AccountProfile> | null, sharedCast: { name: string; role?: string; visualES?: string; clothing?: string }[] = []) {
  if (!p) return "";
  const lines = [
    `PERFIL DE LA CUENTA @${p.handle} (${p.platform}${p.verified ? ", verificada" : ""}). Sus reglas MANDAN sobre las reglas generales si se contradicen.`,
    p.style && `Estilo: ${p.style === "cine90" ? "cine romántico de los 90 realista (personas reales)" : p.style === "biblica" ? "drama bíblico moderno dominicano (personas reales)" : p.style}${p.onlyThisStyle ? ". SOLO este tipo de contenido en esta cuenta: nunca frutinovelas ni personajes de fruta" : ""}.`,
    p.setting && `Escenario principal: ${p.setting}.`,
    p.objective && `Objetivo: ${p.objective}.`,
    p.goals?.length && `Metas: ${p.goals.join(" | ")}.`,
    p.audience && `Público: ${p.audience}.`,
    p.results && `Resultados que respaldan el formato: ${p.results}.`,
    // Perfiles guardados con la regla antigua: «Usa Seedance 2.5.» solo va en los prompts de vídeo.
    p.contentRules?.length && `REGLAS DE CONTENIDO DE LA CUENTA:\n${p.contentRules.map(r => `- ${r.replace(/,?\s*empezando por «Usa Seedance 2\.5\.»/, ". «Usa Seedance 2.5.» va solo al inicio de los prompts de animación (vídeo), nunca en los de imagen")}`).join("\n")}`,
    p.schedule?.length && `Ritmo semanal: ${p.schedule.map(s => `${s.day}: ${s.piece}`).join("; ")}.${p.scheduleNotes?.length ? " " + p.scheduleNotes.join(" ") : ""}`,
    p.cta && `CTA: ${p.cta}.`,
    p.commentWords?.length && `Palabras para comentar: ${p.commentWords.join(", ")}.`,
    p.hashtags?.length && `Hashtags base: ${p.hashtags.join(" ")}.`,
    p.signatureSongs && Object.keys(p.signatureSongs).length && `Canción de firma por serie: ${Object.entries(p.signatureSongs).map(([k, v]) => `${k} = ${v}`).join("; ")}.`,
    sharedCast.length && `ELENCO FIJO DE LA CUENTA (fichas maestras aprobadas, compartidas por todas sus series): reutiliza a estos personajes con su nombre EXACTO, su aspecto y su ropa antes de inventar otros: ${sharedCast.map(c => `${c.name}${c.role ? ` (${c.role})` : ""}${c.visualES ? `: ${c.visualES}` : ""}${c.clothing ? `; ropa: ${c.clothing}` : ""}`).join(" | ")}.`,
    p.ideas?.length && `Banco de ideas de la cuenta (historias sueltas pendientes): ${p.ideas.map(i => `«${i.title}» ${i.idea}`).join(" | ")}.`,
    p.notes && `Notas: ${p.notes}`,
  ].filter(Boolean);
  return lines.join("\n");
}

// Fase de crecimiento según los seguidores (para la tarjeta «Objetivo de la cuenta»).
export function growthStage(followers = 0) {
  if (followers < 10000) return { step: 1, from: 2000, to: 10000 };
  if (followers < 50000) return { step: 2, from: 10000, to: 50000 };
  return { step: 3, from: 50000, to: 100000 };
}
