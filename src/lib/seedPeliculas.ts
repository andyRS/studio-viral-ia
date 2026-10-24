// Datos de la cuenta @peliculasquenoexisten.rd: perfil, elenco fijo, la serie importada
// «La butaca de su madre» (partes 1-5 cerradas) y la serie nueva «Al otro lado del Malecón»
// (episodios 1 y 2 como guion). Se cargan una vez con el botón de Publish & Grow → Cuentas.
import type { AccountProfile } from "./types";

export const PELICULAS_HANDLE = "peliculasquenoexisten.rd";
// Reconoce la cuenta aunque se llame «Películas que no existen» o «@peliculasquenoexisten.rd».
export const isPeliculasAccount = (name: string) => String(name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "").startsWith("peliculasquenoexisten");
const IMG = "/elenco/peliculasquenoexisten";

export const PELICULAS_PROFILE: Omit<AccountProfile, "id" | "accountId"> = {
  handle: PELICULAS_HANDLE,
  platform: "Instagram",
  verified: true,
  style: "cine90",
  onlyThisStyle: true,
  objective: "Crecer con cine romántico de los 90 hecho con IA, una pieza diaria, hasta vivir de la cuenta",
  goals: [
    "1) De 2 mil a 10 mil seguidores con una pieza diaria",
    "2) De 10 mil a 50 mil: primeros ingresos con vídeos patrocinados por herramientas de IA (Higgsfield, Kling…) y una comunidad de pago en español en Skool a US$9-15/mes",
    "3) Más de 50 mil: curso, afiliados y la app Estudio Viral como producto",
  ],
  reference: "@dreamfall.art (1,7 M de seguidores, comunidad a US$27/mes)",
  audience: "Público hispano y dominicano que ama el romance, el drama y la nostalgia de los 90",
  setting: "Santo Domingo y la República Dominicana en los 90: Malecón, Zona Colonial, hotel Jaragua, aeropuerto Las Américas, Gazcue, Boca Chica, colmado, guagua, bodas con orquesta",
  results: "«La butaca de su madre»: parte 1 con 140 mil vistas, parte 2 con 22,9 mil, parte 3 con 3,2 mil y parte 4 con 1,8 mil. Lección: lo que explota es una historia nueva que se entiende sola; entre parte y parte van historias sueltas",
  contentRules: [
    "Diálogo: frases de 2 a 6 palabras en ida y vuelta, nunca discursos (el episodio de 65,6 M de @dreamfall.art era un ping-pong de unas 15 frases cortas). A veces conviene abrir con 5-12 s sin hablar",
    "Elenco fijo: los mismos rostros y la misma ropa en todas las piezas, siempre desde las fichas guardadas",
    "Estructura: gancho visual en el segundo 0-1, revelación con un objeto (tarjeta, invitación de boda, llave, carta, teléfono de cable), triángulo amoroso o personaje cuestionable que obligue a opinar, cliffhanger y narrador solo en la última frase",
    "Canción de firma: la misma en toda la serie, bajo los diálogos; se elige en la biblioteca de Instagram",
    "Duración: 25-46 s en Instagram (corte sin relleno). La versión de Facebook y TikTok de la misma historia, de 60 s o más, va a otras cuentas, no a esta",
    "Descripción: título corto en MAYÚSCULAS, «Hecho con @higgsfield.ai», palabra para comentar (BUTACA, MALECÓN, PROMPT) y 3-5 hashtags (#peliculasquenoexisten #historiadeamor #cortometraje #videoia)",
    "Portadas de serie: nombre de la serie y frase de intriga arriba, en la zona segura (300-600 px), y «PARTE» con el número enorme en dorado abajo (1290-1640 px)",
    "Calidad: exportar a 1440x2560, o al menos a 1080x1920",
    "Vestuario: elegante y de manga larga; nada de bikinis, toallas ni escotes",
    "Prompts visuales: en inglés, con el diálogo en español latino neutro, acentos correctos y sin contracciones, empezando por «Usa Seedance 2.5.»",
  ],
  schedule: [
    { day: "Lunes", piece: "Historia suelta" },
    { day: "Martes", piece: "Suelta con tema que se repite («¿Está ocupada esta butaca?»)" },
    { day: "Miércoles", piece: "Parte de la serie" },
    { day: "Jueves", piece: "Suelta con triángulo amoroso" },
    { day: "Viernes", piece: "Versión musical con poco diálogo" },
    { day: "Sábado", piece: "Parte de la serie" },
    { day: "Domingo", piece: "Detrás de cámaras, con «Comenta PROMPT»" },
  ],
  scheduleNotes: [
    "Episodios 1 y 2 de cada serie en días seguidos; después, una parte cada 4-7 días.",
    "Cuando una pieza pasa 5 veces el promedio de la cuenta, se repite su estructura 3-5 veces.",
  ],
  cta: "Comenta la palabra del vídeo (BUTACA, MALECÓN o PROMPT) y sigue la cuenta para la parte siguiente",
  commentWords: ["BUTACA", "MALECÓN", "PROMPT"],
  hashtags: ["#peliculasquenoexisten", "#historiadeamor", "#cortometraje", "#videoia"],
  signatureSongs: {},
  bio: "🎬 Películas que nunca se estrenaron\n❤️ Romance y drama de los 90 con IA 🇩🇴\n📩 Colabs: [correo]\n👇 Comenta PROMPT en cualquier video",
  followers: 2000,
  ideas: [
    { title: "¿ESTÁ OCUPADA ESTA BUTACA?", idea: "Cine de barrio, 1994: una desconocida le pide permiso para sentarse en la butaca que él guarda cada viernes." },
    { title: "EL BOLERO EQUIVOCADO", idea: "El cantante de la boda es el ex de la novia y canta la canción que era de los dos." },
    { title: "LA CARTA QUE NUNCA ENVIÓ", idea: "Aeropuerto Las Américas, 1995: una carta guardada veinte años llega a la puerta de embarque equivocada." },
  ],
};

type Cast = { name: string; role: string; visualES: string; visualEN: string; clothing: string; subtitleColor: string; voice: string; image?: string };
const NEUTRO = "Acento: latino neutro.";

export const RD_CAST: Cast[] = [
  { name: "Marisol Peña", role: "protagonista, pintora en Gazcue", visualES: "Mujer dominicana mestiza de unos 30 años, ojos verdes, rizos negros largos y voluminosos", visualEN: "Dominican mixed-race woman around 30, green eyes, long voluminous black curls", clothing: "vestido verde esmeralda cruzado de manga 3/4 con cinturón dorado fino", subtitleColor: "#2ECC71", voice: "mujer joven, voz cálida y segura", image: `${IMG}/marisol.webp` },
  { name: "Andrés Valdez", role: "el galán, arquitecto, hijo de familia rica", visualES: "Hombre dominicano de unos 33 años, pelo negro peinado hacia atrás, barba corta", visualEN: "Dominican man around 33, black hair slicked back, short beard", clothing: "camisa de lino blanca de manga larga remangada, pantalón de lino beige, cinturón marrón y mocasines", subtitleColor: "#F2C14E", voice: "hombre joven, voz grave y tranquila", image: `${IMG}/andres.webp` },
  { name: "Camila Báez", role: "la prometida de Piantini", visualES: "Mujer dominicana de unos 29 años, pelo castaño claro largo y liso, maquillaje elegante", visualEN: "Dominican woman around 29, long straight light-brown hair, elegant makeup", clothing: "vestido largo de satén champán de manga larga, collar y aretes de perlas, cartera marfil", subtitleColor: "#E8D5B0", voice: "mujer joven, voz refinada y fría", image: `${IMG}/camila.webp` },
  { name: "Doña Altagracia Valdez", role: "la madre que guarda secretos", visualES: "Señora dominicana de unos 65 años, pelo plateado recogido en moño, mirada firme", visualEN: "Dominican lady around 65, silver hair in a bun, firm gaze", clothing: "traje sastre azul marino de manga larga con broche dorado en la solapa y abanico", subtitleColor: "#9DB4FF", voice: "mujer mayor, voz pausada y autoritaria", image: `${IMG}/dona-altagracia.webp` },
  { name: "Toño", role: "el amigo motoconchista (humor)", visualES: "Hombre dominicano de unos 35 años, sonrisa grande y pícara", visualEN: "Dominican man around 35, big cheeky smile", clothing: "gorra roja hacia atrás, camisa de flores abierta sobre camiseta blanca, jeans y tenis", subtitleColor: "#FF9A1F", voice: "hombre, voz alegre y rápida" , image: `${IMG}/tono.webp` },
];

export const BUTACA_CAST: Cast[] = [
  { name: "Valeria", role: "protagonista de «La butaca de su madre»", visualES: "Mujer dominicana de unos 30 años, pelo castaño oscuro ondulado y voluminoso de los 90, aretes de gota dorados", visualEN: "Dominican woman around 30, voluminous wavy dark-brown 90s hair, gold teardrop earrings", clothing: "abrigo marfil de lana sobre vestido rojo", subtitleColor: "#FF6B81", voice: "mujer joven, voz dulce y emotiva" },
  { name: "El cantante", role: "el cantante que compra la butaca cada Navidad", visualES: "Hombre dominicano de unos 35 años, pelo negro peinado hacia atrás, barba de pocos días, sonrisa serena", visualEN: "Dominican man around 35, black slicked-back hair, light stubble, calm smile", clothing: "esmoquin negro con corbatín y camisa blanca", subtitleColor: "#F2C14E", voice: "hombre, voz grave de cantante" },
  { name: "Carmen", role: "madre de Valeria", visualES: "Señora dominicana de unos 60 años, pelo plateado", visualEN: "Dominican lady around 60, silver hair", clothing: "abrigo rojo con broche dorado", subtitleColor: "#E8505B", voice: "mujer mayor, voz quebrada y tierna" },
];

const castOut = (c: Cast) => ({ name: c.name, role: c.role, visualES: c.visualES, visualEN: c.visualEN, clothing: c.clothing, voice: c.voice, speechStyle: NEUTRO, subtitleColor: c.subtitleColor.replace("#", ""), pronunciations: [], flowPrompt: "" });

const BUTACA_BIBLE = {
  style: "cine90",
  logline: "Cada Navidad un cantante compra la butaca de su madre muerta; una Navidad, una desconocida se sienta en ella.",
  plan: {
    6: "La señora del abrigo rojo es Carmen, la madre de Valeria, que se fue cuando ella era niña. Ella dio la entrada, la llave y la carta. Saca una cajita de terciopelo: «Elena me hizo prometer algo… y hoy lo voy a cumplir.»",
    7: "FINAL de la serie: la carta de Elena, el anillo con la nota «Para la mujer que se siente en mi butaca», el perdón, la nieve frente al teatro y «FIN».",
  },
};
const BUTACA_PARTS = [
  { t: "Parte 1: La butaca", s: "Valeria se sienta en la butaca del cantante en Navidad.", c: "¿Por qué él guarda esa butaca vacía?" },
  { t: "Parte 2: Desde que murió su madre", s: "Él compra esa butaca cada Navidad desde que murió su madre; a Valeria una señora le regaló la entrada hace 10 años.", c: "¿Quién le regaló la entrada?" },
  { t: "Parte 3: ¿Quién le dio la entrada?", s: "Su madre Elena murió hace 12 años… ¿quién le dio la entrada?", c: "Si Elena murió hace 12 años… ¿quién le dio la entrada?" },
  { t: "Parte 4: El broche", s: "El broche: sus madres eran amigas; alguien le dio la llave al acomodador anoche.", c: "Alguien le dio la llave al acomodador anoche." },
  { t: "Parte 5: La carta de ayer", s: "La llave abre una caja con una carta de Elena fechada ayer y una rosa fresca; en el escenario, una señora de abrigo rojo con el mismo broche se va. «¿Mamá?» «Dios mío… es ella.»", c: "«¿Mamá?» «Dios mío… es ella.»" },
];

const MALECON_BIBLE = {
  style: "cine90",
  logline: "Una pintora de Gazcue y un arquitecto a un mes de casarse se enamoran ventana frente a ventana, mientras una madre guarda el secreto que los une.",
  plan: {
    3: "Clase de pintura con otro nombre.", 4: "Camila encuentra el cuadro del balcón; invitación de boda.", 5: "Las dos mujeres en un café de la Zona Colonial.",
    6: "Doña Altagracia reconoce a Marisol: secreto de familia.", 7: "La boda en el Jaragua.", 8: "Corre bajo la lluvia hasta el balcón.",
    9: "La foto vieja revela el secreto.", 10: "Final.",
  },
};
const block = (n: number, scene: string, lines: [string, string][]) => ({ block: n, time: "", scene, dialogue: lines.map(([speaker, text]) => ({ speaker, text })), onScreen: Array.from(new Set(lines.map(l => l[0]))) });
const MALECON_EPS = [
  { t: "Ep. 1: El pincel", s: "El viento tumba el pincel de Marisol desde el balcón; Andrés lo recoge. El pincel tiene grabado «Marisol». Camila lo llama: la prueba del traje es a las cinco. Él guarda el pincel.",
    blocks: [
      block(1, "Balcón de Gazcue frente al Malecón, tarde de brisa: el viento tumba el pincel de Marisol", []),
      block(2, "La acera bajo el balcón: Andrés recoge el pincel y mira hacia arriba", [["Andrés Valdez", "¿Esto es tuyo?"], ["Marisol Peña", "Depende… ¿me lo vas a devolver?"]]),
      block(3, "Primer plano del pincel en la mano de Andrés: tiene grabado «Marisol»", []),
      block(4, "Camila llega por la acera", [["Camila Báez", "Andrés, la prueba del traje es a las cinco."]]),
      block(5, "Andrés guarda el pincel en el bolsillo de la camisa y se va con Camila; Marisol lo mira desde el balcón", []),
    ], c: "Él guarda el pincel." },
  { t: "Ep. 2: Cinco minutos", s: "De noche, ventana frente a ventana, Andrés llama a Marisol. Le pide cinco minutos, a un mes de su boda. Camila pregunta con quién habla: «Trabajo.» Se apaga la luz de su ventana.",
    blocks: [
      block(1, "Noche: dos ventanas frente a frente, teléfonos de cable", [["Marisol Peña", "¿Cómo conseguiste este número?"], ["Andrés Valdez", "Estaba en el pincel."], ["Marisol Peña", "Ahí solo está mi nombre."], ["Andrés Valdez", "Solo hay una Marisol que pinta el Malecón."]]),
      block(2, "Las dos ventanas", [["Marisol Peña", "Tú te casas en un mes."], ["Andrés Valdez", "Por eso te llamo hoy."], ["Marisol Peña", "¿Qué quieres?"], ["Andrés Valdez", "Cinco minutos."]]),
      block(3, "Camila entra en el cuarto de Andrés", [["Camila Báez", "¿Con quién hablas?"], ["Andrés Valdez", "Trabajo."]]),
      block(4, "La luz de la ventana de Andrés se apaga; Marisol se queda con el teléfono en la mano", []),
    ], c: "Se apaga la luz de su ventana." },
];

type Ops = { insert: (c: any, item: any) => Promise<any> };
// Crea la cuenta (si no existe), su perfil, el elenco, las dos series y sus episodios.
export async function seedPeliculas({ insert }: Ops, existing: { accounts: any[]; profiles: any[] }) {
  const t0 = Date.now() - 60 * 60 * 1000;
  const at = (k: number) => new Date(t0 + k * 1000).toISOString();
  const account = existing.accounts.find(a => isPeliculasAccount(a.name) && a.platform === "Instagram")
    || await insert("accounts", { name: `@${PELICULAS_HANDLE}`, platform: "Instagram", niche: "cine90", audience: PELICULAS_PROFILE.audience, idealDuration: "25-46 s" });
  if (!existing.profiles.some(p => p.accountId === account.id)) await insert("accountProfiles", { ...PELICULAS_PROFILE, accountId: account.id });
  const approvedAt = new Date().toISOString();
  const addCast = async (seriesId: string, cast: Cast[]) => {
    for (const c of cast) await insert("characters", {
      seriesId, name: c.name, role: `${c.role} · compartida por la cuenta`, visualES: c.visualES, visualEN: c.visualEN, clothing: c.clothing,
      subtitleColor: c.subtitleColor, speechStyle: NEUTRO, voice: c.voice, pronunciations: [],
      ...(c.image ? { imageUrl: c.image, referenceApprovedAt: approvedAt, referenceVersion: 1 } : {}),
    });
  };
  // Serie importada: partes 1-5 cerradas (solo lectura), lista para «Crear Parte 6».
  const butaca = await insert("series", { title: "La butaca de su madre", description: BUTACA_BIBLE.logline, accountId: account.id });
  await addCast(butaca.id, BUTACA_CAST);
  for (let i = 0; i < BUTACA_PARTS.length; i++) { const p = BUTACA_PARTS[i]; await insert("episodes", {
    title: p.t, theme: p.s, duration: 40, status: "Terminado", previousSummary: "", accountId: account.id, seriesId: butaca.id, createdAt: at(i), versions: [],
    output: { title: p.t, summary: p.s, mode: "importado", partNumber: i + 1, duration: 40, cast: BUTACA_CAST.map(castOut), seriesBible: BUTACA_BIBLE, ficha: { synopsis: p.s, closing: p.c }, scenes: [] },
  }); }
  // Serie nueva: episodios 1 y 2 escritos como guion (no producción) y el arco de 10 partes.
  const malecon = await insert("series", { title: "Al otro lado del Malecón", description: MALECON_BIBLE.logline, accountId: account.id });
  await addCast(malecon.id, RD_CAST);
  for (let i = 0; i < MALECON_EPS.length; i++) { const e = MALECON_EPS[i]; await insert("episodes", {
    title: e.t, theme: e.s, duration: 40, status: "Guion", previousSummary: "", accountId: account.id, seriesId: malecon.id, createdAt: at(10 + i), versions: [],
    output: { title: e.t, summary: e.s, mode: "guion-manual", partNumber: i + 1, duration: 40, cast: RD_CAST.map(castOut), seriesBible: MALECON_BIBLE, ficha: { synopsis: e.s, closing: e.c }, scriptBlocks: e.blocks, scenes: [] },
  }); }
  return account;
}
