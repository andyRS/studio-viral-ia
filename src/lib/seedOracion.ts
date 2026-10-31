// Perfil de la cuenta cristiana «Un Minuto en Oración» (TikTok @unminutodeoracion2026 + página de Facebook):
// instrucción de trabajo de Andy (oct. 2026). Se carga con el botón de Publish & Grow → Cuentas.
import type { AccountProfile } from "./types";
import { BIBLE_BANK, EPIC_BANK, EPIC_NOTICE } from "./knowledge";

export const ORACION_HANDLE = "unminutodeoracion2026";
export const isOracionAccount = (name: string) => /minuto(de|en)oracion/.test(String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, ""));

export const ORACION_PROFILE: Omit<AccountProfile, "id" | "accountId"> = {
  handle: ORACION_HANDLE,
  platform: "Facebook",
  style: "biblica",
  onlyThisStyle: false,
  objective: "Microdramas virales con IA que llevan toda la gama de la Biblia a la vida de hoy en la República Dominicana, cada uno con un gran mensaje",
  goals: [
    "1) Que cada vídeo se entienda solo y enganche en 3 s (sin depender de otras partes)",
    "2) Rotar tipos de historia del banco bíblico (no solo redención) y repetir la estructura de lo que más funcione",
    "3) Monetizar la página de Facebook: vídeos de 60 s o más y cero llamadas a interacción",
  ],
  audience: "Público pentecostal y evangélico hispano, sobre todo dominicano, de 25 a 60 años",
  setting: "República Dominicana de hoy: barrio, colmado, campo, iglesia evangélica sencilla, hospital público, oficina, aeropuerto",
  results: "TikTok @unminutodeoracion2026: casi todos los vídeos tienen 136-237 vistas; «Negó a su propia madre delante de sus amigos ricos…» (60 s, historia que se entiende sola) llegó a 2.025, unas 10 veces más. Lección: historia suelta, conflicto familiar reconocible y gancho fuerte; las series largas por partes rinden poco.",
  contentRules: [
    "Idea central: una historia o principio bíblico contado como drama dominicano moderno; el público siente «esto me pasó a mí» y el versículo y el mensaje llegan al final. Primero la emoción, luego la verdad; nada de predicar al inicio",
    `Banco de historias (rotar, no repetir redención): ${BIBLE_BANK.map(b => `${b.story} (${b.verse})`).join("; ")}`,
    "Cada historia: 1 versículo base, 1 conflicto cotidiano (dinero, familia, traición, enfermedad, injusticia, migración), 1 giro emocional y 1 frase final con el mensaje",
    "Estructura: gancho de 0-3 s con conflicto visible y texto de 2 líneas; estatus y contraste claros; objeto que revela (carta, Biblia vieja, llave, foto, recibo, pulsera); escalada con frases de 2-6 palabras; giro; cierre emotivo (oración, abrazo o decisión) con el mensaje en boca del Narrador; versículo en pantalla los últimos 3 s",
    "Cada vídeo se entiende solo; las series solo cuando la historia lo pida",
    "Público pentecostal: nunca santos, Virgen, altares, velas votivas ni rosarios (tampoco en la casa); iglesia evangélica sencilla con púlpito, cruz lisa y Biblia. Va escrito en todos los prompts de imagen y vídeo",
    "Nunca el nombre de Dios en vano ni violencia gráfica; vestuario modesto de manga larga, nada sugerente",
    "Español latino neutro, palabras completas (sin pa', vamo'), tildes correctas; dominicanismos completos solo cuando aporten (vaina, tíguere, colmado)",
    "Prompts de vídeo: empiezan con «Usa Seedance 2.5.» y terminan con «Español latino neutro, cada palabra completa, nunca acento inglés. Sin música, sin subtítulos ni texto en pantalla.»; un solo personaje habla por clip",
    "Continuidad: el último fotograma de cada clip es el primero del siguiente (los personajes no cambian)",
    "No inventar milagros ni curas médicas como promesa real: son historias ficticias. Marcar «Contenido de IA» al publicar",
    "Facebook: nunca «comenta AMÉN», «dale like», «sígueme» ni «comparte» en pantalla ni en el texto (Meta lo penaliza y ya desmonetizó páginas). La pregunta abierta va en el texto sin pedir acción",
    "Cada plataforma con su archivo y su texto; nunca el mismo en todas",
    "PISTA B · Épica bíblica (estilo «Épica bíblica»): cine épico realista con ángeles y cielo. SOLO personajes bíblicos y escenarios que la Biblia menciona (o épicos de esa época), con vestuario de entonces y español latino neutro: nada dominicano ni moderno",
    `Banco de la Pista B: ${EPIC_BANK.map(b => `${b.story} (${b.verse})`).join("; ")}`,
    "Pista B: nunca el rostro de Dios ni de Jesús (solo luz, voz, sombras o manos de luz); ángeles altos y majestuosos sin halos ni querubines de bebé; sin gore ni desnudez; gigantes y caídos como siluetas",
    `Pista B con apócrifos (Enoc, Jubileos): siempre «inspirado en la tradición de Enoc», nunca como Palabra de Dios; puente con Judas 14-15 y Génesis 5:24; sin inventar doctrina ni magia. Aviso en la descripción: «${EPIC_NOTICE}»`,
    "Pista B: los efectos grandes cuestan más créditos; cotizar antes y generar primero escenas de 5 s en 480p, y subir a 720p solo las clave",
  ],
  schedule: [
    { day: "Lunes", piece: "Historia suelta del banco (tipo distinto al de la semana anterior)" },
    { day: "Martes", piece: "Historia suelta" },
    { day: "Miércoles", piece: "Historia suelta" },
    { day: "Jueves", piece: "Pista B: épica bíblica" },
    { day: "Viernes", piece: "Historia suelta" },
    { day: "Sábado", piece: "Historia suelta" },
    { day: "Domingo", piece: "Pista B: épica bíblica con mensaje de esperanza (o repetir la estructura del vídeo con más vistas)" },
  ],
  scheduleNotes: [
    "Facebook (Un Minuto en Oración): mínimo 60 s, publicar de 7 a 10 p. m. Título «Título · Parte N» solo si hay serie.",
    "TikTok: 1-2 min, gancho en 3 s, descripción corta + 3-5 hashtags.",
    "Instagram/Shorts: corte de 25-46 s a la frase más fuerte, solo si Andy lo pide.",
  ],
  cta: "Ninguna llamada a interacción. Una pregunta abierta en el texto, sin pedir acción («¿Qué harías tú en su lugar?»)",
  commentWords: [],
  hashtags: ["#historiasbiblicas", "#reflexion", "#fe", "#cristianos", "#dramacristiano"],
  signatureSongs: {},
  bio: "🙏 Un minuto en oración\n📖 Historias de la Biblia en la vida de hoy 🇩🇴\n✨ Contenido creado con IA",
  ideas: BIBLE_BANK.slice(0, 6).map(b => ({ title: b.story.toUpperCase(), idea: `${b.modern} (${b.verse}): ${b.message}` })),
};

type Ops = { insert: (c: any, item: any) => Promise<any>; update: (c: any, id: string, patch: any) => Promise<any> };
// Crea la cuenta de Facebook si no existe y le pone (o actualiza) el perfil.
export async function seedOracion({ insert, update }: Ops, existing: { accounts: any[]; profiles: any[] }) {
  const account = existing.accounts.find(a => isOracionAccount(a.name) && a.platform === "Facebook")
    || await insert("accounts", { name: "Un Minuto en Oración", platform: "Facebook", niche: "cristiano", audience: ORACION_PROFILE.audience, idealDuration: "60-90 s" });
  const prev = existing.profiles.find(p => p.accountId === account.id);
  if (prev) await update("accountProfiles", prev.id, { ...prev, ...ORACION_PROFILE, accountId: account.id });
  else await insert("accountProfiles", { ...ORACION_PROFILE, accountId: account.id });
  return account;
}
