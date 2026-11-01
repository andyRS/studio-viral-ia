// Importación cinematográfica de capítulos y personajes escritos por otra IA.
//
// Separa tres cosas que antes se mezclaban:
//   1. speaker            quién dice la frase (el Narrador es solo una voz en off),
//   2. visibleCharacters  quién se ve en pantalla (puede no hablar; quien habla puede no verse),
//   3. visualAction /     qué pasa en pantalla: lo estático va a la imagen y el movimiento al vídeo.
//      videoAction
//
// Dos modos:
//   - fidelidad: diálogos, hablantes, orden y cantidad del original intactos; solo se añade dirección
//     visual, prompts y metadatos (sin IA o con la IA restringida a la dirección visual).
//   - creativa:  la IA puede reescribir y reorganizar (story.ts); aquí se calculan los cambios para mostrarlos.
// Antes de guardar se ejecuta validarImportacion (continuidad, narrador, restricciones, formato, diálogos).
import { normalizeCast, norm, type CastMember } from "./cast";
import { STYLES, type StyleKey } from "./knowledge";
import { aspectoDe, buildProduction, conAspecto, MAX_SCENES, NARRATOR, selectShortScenes, type Aspecto } from "./production";
import type { Canon } from "./personajes";

const limpio = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const sinPunto = (v: unknown) => limpio(v).replace(/[.;:,\s]+$/, "");
const esNarrador = (n: unknown) => /^(narrador|narradora|voz en off|voz_en_off)\b/.test(norm(n));

// ---------- 1. Capítulo ----------
export type ClipOriginal = { n: number; speaker: string; line: string };
export type CapituloNormalizado = {
  fuente: "clips" | "scenes";
  titulo: string;
  clips: ClipOriginal[];          // un elemento por frase; n = número de clip del archivo (desde 1)
  gancho: string[]; cierre: string; versiculo: string;
  tarjetas: { antes: number; texto: string }[];   // índice desde 0 (formato de subtitular.py)
  colores: Record<string, string>;
  estilo?: string;
  avisos: string[];
  episodio?: any;                 // capítulo con la estructura completa del estudio (scenes)
};

export function normalizarCapitulo(entrada: unknown): CapituloNormalizado | null {
  let d: any = entrada;
  if (typeof entrada === "string") { try { d = JSON.parse(entrada); } catch { return null; } }
  if (!d || typeof d !== "object") return null;
  const ep = d.episode || d.episodio || d.capitulo || d.output || d;
  const avisos: string[] = [];
  // a) Estructura completa del estudio (capitulo.json): escenas con speaker y line.
  if (Array.isArray(ep?.scenes) && ep.scenes.length && ep.scenes.every((s: any) => s && typeof s.line === "string" && typeof s.speaker === "string")) {
    return {
      fuente: "scenes", titulo: limpio(d.series?.title || ep.seriesTitle || ep.title), episodio: ep,
      clips: ep.scenes.map((s: any, i: number) => ({ n: Number(s.n) || i + 1, speaker: limpio(s.speaker), line: limpio(s.line) })),
      gancho: Array.isArray(ep.hook) ? ep.hook.map(limpio) : [], cierre: limpio(ep.guionJson?.cierre), versiculo: limpio(ep.bible?.verse || ep.guionJson?.versiculo),
      tarjetas: Array.isArray(ep.guionJson?.tarjetas) ? ep.guionJson.tarjetas : [], colores: ep.guionJson?.colores || {}, estilo: ep.seriesBible?.style || d.series?.style, avisos,
    };
  }
  // b) guion.json: clips = [[["Hablante", "frase"], …], …]. gancho, tarjetas y cierre son metadatos: no crean escenas.
  const fuente = Array.isArray(ep?.clips) ? ep.clips : null;
  if (!fuente) return null;
  const clips: ClipOriginal[] = [];
  fuente.forEach((clip: any, i: number) => {
    const pares = (Array.isArray(clip) ? clip : []).filter((p: any) => Array.isArray(p) && p.length >= 2);
    if (!pares.length) { avisos.push(`El clip ${i + 1} no tiene diálogo (bloque vacío): no se convierte en escena.`); return; }
    if (pares.length > 1) avisos.push(`El clip ${i + 1} tiene ${pares.length} frases: cada una es una escena (un solo hablante por escena).`);
    for (const p of pares) clips.push({ n: i + 1, speaker: limpio(p[0]), line: limpio(p[1]) });
  });
  if (!clips.length) return null;
  // Tarjetas: subtitular.py cuenta desde 0. Si alguna apunta al número del último clip o más allá, el archivo cuenta desde 1.
  const brutas = (Array.isArray(ep.tarjetas) ? ep.tarjetas : []).map((t: any) => ({ antes: Number(t?.antes), texto: limpio(t?.texto) })).filter((t: any) => Number.isFinite(t.antes) && t.texto);
  const desdeUno = brutas.some((t: any) => t.antes >= fuente.length);
  const tarjetas = brutas.map((t: any) => ({ antes: desdeUno ? t.antes - 1 : t.antes, texto: t.texto }));
  if (desdeUno && brutas.length) avisos.push("Las tarjetas del archivo cuentan los clips desde 1: se pasaron al formato del montaje (desde 0).");
  if (tarjetas.some((t: any) => t.antes === 0)) avisos.push("La tarjeta antes del clip 1 se conserva, pero el montaje no dibuja tarjetas antes del primer clip (el gancho ocupa ese lugar).");
  return {
    fuente: "clips", titulo: limpio(ep.titulo || ep.title), clips,
    gancho: Array.isArray(ep.gancho) ? ep.gancho.map(limpio).filter(Boolean) : [], cierre: limpio(ep.cierre), versiculo: limpio(ep.versiculo),
    tarjetas, colores: ep.colores && typeof ep.colores === "object" ? ep.colores : {}, estilo: ep.estilo, avisos,
  };
}

// ---------- 2. Personajes canónicos ----------
export type PersonajeCanonico = {
  name: string; role: string; descripcion: string; tipo: string; visual: boolean;
  apariciones: number[]; soloEnApariciones: boolean; reglas: string[];
  ambiente: string; estiloVisual: string; consistencia: string; referenciaBiblica: string; notaFidelidad: string; color: string; voz: string;
};
export type BibliotecaNormalizada = { titulo: string; episodio: string; estilo?: StyleKey; formato?: Aspecto; personajes: PersonajeCanonico[]; narradores: string[]; reglas: string[] };

const k = (o: any, ...ks: string[]) => { for (const x of ks) { const v = o?.[x]; if (v != null && String(v).trim()) return typeof v === "string" ? v.trim() : v; } return ""; };
const RESTRICCION = /(únicamente|unicamente|solo aparece|sólo aparece|aparece solo|solo como anticipaci|no interviene)/i;

export function estiloDeTexto(t: unknown): StyleKey | undefined {
  const n = norm(t); if (!n) return undefined;
  if (n in STYLES) return n as StyleKey;
  return (Object.keys(STYLES) as StyleKey[]).find(key => norm((STYLES as any)[key].label).startsWith(n.slice(0, 12)) || n.startsWith(norm((STYLES as any)[key].label).slice(0, 12)));
}

export function normalizarPersonajes(entrada: unknown): BibliotecaNormalizada | null {
  let d: any = entrada;
  if (typeof entrada === "string") { try { d = JSON.parse(entrada); } catch { return null; } }
  if (!d || typeof d !== "object") return null;
  const lista: any[] = Array.isArray(d) ? d : Array.isArray(d.personajes) ? d.personajes : Array.isArray(d.characters) ? d.characters : [];
  if (!lista.length) return null;
  const reglas: string[] = (Array.isArray(d.reglas_de_continuidad) ? d.reglas_de_continuidad : Array.isArray(d.reglas) ? d.reglas : []).map(limpio).filter(Boolean);
  const narradores = new Set<string>();
  if (d.narrador) narradores.add(limpio(k(d.narrador, "nombre", "name")) || NARRATOR);
  const personajes: PersonajeCanonico[] = [];
  for (const p of lista) {
    const name = limpio(k(p, "nombre", "name", "personaje"));
    if (!name) continue;
    const tipo = limpio(k(p, "tipo", "type"));
    if (esNarrador(name) || /voz[_ ]en[_ ]off|off[_ -]?screen|narrador/i.test(tipo)) { narradores.add(name); continue; }
    const role = limpio(k(p, "rol", "role", "papel"));
    const propias = reglas.filter(r => norm(r).includes(norm(name)));
    const apariciones = (Array.isArray(p.participa_en_clips) ? p.participa_en_clips : Array.isArray(p.apariciones) ? p.apariciones : []).map(Number).filter((x: number) => Number.isFinite(x) && x > 0);
    personajes.push({
      name, role, tipo: tipo || "personaje_en_pantalla", visual: true,
      descripcion: limpio(k(p, "descripcion_maestra", "descripcion", "descripción", "apariencia", "visualES", "description", "appearance")),
      apariciones, soloEnApariciones: apariciones.length > 0 && (RESTRICCION.test(role) || propias.some(r => RESTRICCION.test(r))), reglas: propias,
      ambiente: limpio(k(p, "ambiente_referencia", "ambiente")), estiloVisual: limpio(k(p, "estilo_visual")), consistencia: limpio(k(p, "consistencia")),
      referenciaBiblica: limpio(k(p, "referencia_biblica")), notaFidelidad: limpio(k(p, "nota_fidelidad")),
      color: limpio(k(p, "color_guion", "subtitleColor", "color")).replace("#", ""), voz: limpio(k(p, "voz", "voice")),
    });
  }
  return { titulo: limpio(d.titulo_serie || d.titulo || d.series?.title), episodio: limpio(d.episodio), estilo: estiloDeTexto(d.estilo), formato: /16\s*:\s*9/.test(String(d.formato || "")) ? "16:9" : /9\s*:\s*16/.test(String(d.formato || "")) ? "9:16" : undefined, personajes, narradores: Array.from(narradores), reglas };
}

// El vestuario sale de la descripción maestra (frases con prendas); el resto queda como apariencia.
const PRENDAS = /(túnica|tunica|manto|capa|armadura|vestid|ropa|cinturón|cinturon|sandalias|corona|brazales|casco|lanza|espada|cetro|bordad|lino|alas)/i;
function vestuarioDe(desc: string) {
  const frases = desc.split(/(?<=\.)\s+/).filter(f => PRENDAS.test(f));
  return frases.join(" ").slice(0, 400);
}

// Apariencia sin las frases de vestuario (para no repetirlas en el prompt); si casi todo es vestuario, la descripción entera.
function aparienciaDe(desc: string) {
  const resto = desc.split(/(?<=\.)\s+/).filter(f => !PRENDAS.test(f)).join(" ");
  return resto.length >= 40 ? resto : desc;
}
export function elencoDesdeBiblioteca(b: BibliotecaNormalizada, style: StyleKey): CastMember[] {
  const filas = b.personajes.map(p => ({ name: p.name, role: p.role, visualES: aparienciaDe(p.descripcion), clothing: vestuarioDe(p.descripcion) || undefined, subtitleColor: p.color || undefined, voice: p.voz || undefined, speechStyle: "Acento: latino neutro" }));
  const cast = normalizeCast(filas, style);
  return cast.map((c, i) => {
    const p = b.personajes[i];
    if (!p || norm(p.name) !== norm(c.name)) return c;
    const canon: Canon = { tipo: p.tipo, apariciones: p.apariciones, soloEnApariciones: p.soloEnApariciones, reglas: p.reglas, ambiente: p.ambiente, estiloVisual: p.estiloVisual, consistencia: p.consistencia, referenciaBiblica: p.referenciaBiblica, notaFidelidad: p.notaFidelidad };
    const flowPrompt = p.descripcion
      ? `${p.estiloVisual || "Cine épico realista"} Hoja de personaje: cuerpo entero, de pie, fondo gris neutro, rostro visible, vertical 9:16. ${c.name}: ${p.descripcion}${p.consistencia ? ` ${p.consistencia}` : ""} Persona real, sin texto.`
      : c.flowPrompt;
    return { ...c, flowPrompt, bible: { canon } } as CastMember & { bible: { canon: Canon } };
  });
}

// ---------- 3. Presencia visual por escena ----------
export type Presencia = { visibles: string[]; origen: Record<string, "habla" | "asignado" | "narración" | "continuidad">; avisos: string[] };

function alias(nombre: string) {
  const n = norm(nombre);
  const primera = n.split(" ")[0];
  const genericas = ["principe", "princesa", "varon", "rey", "reina", "el", "la", "don", "dona", "senor", "senora"];
  return [n, ...(primera.length >= 5 && !genericas.includes(primera) && primera !== n ? [primera] : [])];
}
const menciona = (texto: string, nombre: string) => alias(nombre).some(a => new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(norm(texto)));

export function asignarPresencia(clips: ClipOriginal[], b: BibliotecaNormalizada | null, cast: CastMember[]): Presencia[] {
  const visuales = (b?.personajes.length ? b.personajes.map(p => p.name) : cast.map(c => c.name)).filter(n => !esNarrador(n));
  const canon = new Map((b?.personajes || []).map(p => [norm(p.name), p]));
  const permitido = (n: string, clip: number) => { const p = canon.get(norm(n)); return !p?.soloEnApariciones || p.apariciones.includes(clip); };
  const out: Presencia[] = [];
  clips.forEach((c, i) => {
    const origen: Presencia["origen"] = {}; const avisos: string[] = [];
    const narrador = esNarrador(c.speaker);
    // 1) Quien habla en cámara se ve (salvo el Narrador, que es voz en off).
    if (!narrador) { const v = visuales.find(n => norm(n) === norm(c.speaker)); if (v) origen[v] = "habla"; }
    // 2) Asignaciones explícitas de la biblioteca (participa_en_clips).
    for (const p of b?.personajes || []) if (p.apariciones.includes(c.n) && !origen[p.name]) origen[p.name] = "asignado";
    // 3) La narración describe lo que se ve: los personajes que nombra están en pantalla.
    //    En un diálogo, nombrar a alguien no lo pone en cuadro (hablan de él).
    if (narrador) for (const n of visuales) if (!origen[n] && menciona(c.line, n)) {
      if (permitido(n, c.n)) origen[n] = "narración";
      else avisos.push(`${n} se nombra en la escena ${i + 1}, pero su ficha lo reserva para ${canon.get(norm(n))!.apariciones.map(x => `el clip ${x}`).join(", ")}: no se pone en cuadro.`);
    }
    // 4) Narración sin nadie identificable (p. ej. «Su oración fue escuchada…»): continuidad con la escena anterior, para revisar.
    if (narrador && !Object.keys(origen).length) {
      const previos = (out[i - 1]?.visibles || []).filter(n => permitido(n, c.n));
      if (previos.length) { for (const n of previos) origen[n] = "continuidad"; avisos.push(`Escena ${i + 1}: la narración no nombra a nadie; se mantiene en cuadro a ${previos.join(", ")} por continuidad. Revísalo.`); }
      else avisos.push(`Escena ${i + 1}: narración sin personajes visibles; solo se verá el escenario. Revísalo.`);
    }
    // Restricciones: nadie aparece fuera de las escenas que su ficha permite.
    for (const n of Object.keys(origen)) if (origen[n] !== "habla" && !permitido(n, c.n)) delete origen[n];
    out.push({ visibles: Object.keys(origen), origen, avisos });
  });
  return out;
}

// ---------- 4. Dirección cinematográfica (sin IA) ----------
type Beat = "oracion" | "confrontacion" | "llegada" | "ayuda" | "vision" | "debilidad" | "consuelo" | "revelacion" | "anticipacion" | "advertencia" | "mision" | "dialogo";
export function beatDe(c: ClipOriginal, visibles: string[]): Beat {
  const t = norm(`${c.line}`);
  if (/grecia|mi tiempo se acerca/.test(t) && /grecia/.test(norm(visibles.join(" ") + " " + c.speaker))) return "anticipacion";
  if (/cuando regrese|vendra el principe/.test(t)) return "advertencia";
  if (/acudio|vino en (mi|su) ayuda/.test(t)) return "llegada";
  if (/vision|tigris/.test(t)) return "vision";
  if (/no tengo fuerzas|respirar|desfallec/.test(t)) return "debilidad";
  if (/no temas|se fuerte|muy amado/.test(t)) return "consuelo";
  if (/fueron oidas|primer dia/.test(t) && !esNarrador(c.speaker)) return "revelacion";
  if (/con la ayuda|te ayudare|sigue adelante|continuo su mision/.test(t)) return "ayuda";
  if (/resisti|no pasaras|ningun mensajero|batalla|dominios|no ha terminado/.test(t)) return "confrontacion";
  if (/mision|debe llegar|fui enviado|respuesta/.test(t) && !esNarrador(c.speaker)) return "mision";
  if (/senor|oraba|oracion|ayun|duelo|manjares|entendimiento|guiame|esperando|escuchada/.test(t)) return "oracion";
  return "dialogo";
}

export type DireccionEscena = { setting: string; location: string; visualAction: string; videoAction: string; shotType: string; camera: string; lighting: string; atmosphere: string; vfx: string; expression: string; conflict: string; continuity: string; sfx: string; music: string; title: string };

// vez: cuántas veces apareció ya este tipo de momento (varía encuadre y acción para no repetir la misma toma).
export function dirigirEscena(c: ClipOriginal, i: number, pres: Presencia, prev: { location?: string; visibles?: string[] } | null, b: BibliotecaNormalizada | null, vez = 0): DireccionEscena {
  const v = pres.visibles;
  const ficha = (n?: string) => b?.personajes.find(p => norm(p.name) === norm(n));
  const hablaVisible = !esNarrador(c.speaker) && v.some(n => norm(n) === norm(c.speaker));
  const A = hablaVisible ? v.find(n => norm(n) === norm(c.speaker))! : v[0];
  const B = v.find(n => n !== A);
  const lista = v.join(" y ") || "el lugar";
  const amb = ficha(A)?.ambiente || "";
  const beat = beatDe(c, v);
  const base: Partial<DireccionEscena> = {};
  switch (beat) {
    case "oracion": Object.assign(base, { title: "Oración perseverante", location: amb.split(";")[0] || "Interior persa antiguo de piedra y adobe",
      visualAction: A ? `${A} de rodillas sobre una estera, manos abiertas hacia lo alto, rostro marcado por el ayuno y mirada fija hacia arriba` : "Una lámpara de aceite encendida junto a una estera vacía",
      videoAction: A ? `${A} inclina la cabeza y aprieta las manos en oración; la llama de la lámpara tiembla con su respiración` : "La llama de la lámpara tiembla en la penumbra",
      shotType: "Plano medio lateral", camera: "Travelling lento de acercamiento (dolly in) lateral hacia el rostro.", lighting: "Luz cálida de lámpara de aceite y primer sol por una ventana de piedra; sombras profundas", vfx: "Partículas de polvo flotando en el haz de luz", expression: A ? "concentración solemne, fe perseverante" : "", conflict: "El silencio aparente frente a la oración que no se rinde", sfx: "Respiración contenida, crepitar de la lámpara, viento lejano" }); break;
    case "confrontacion": Object.assign(base, { title: "La resistencia", location: amb.split(";")[0] || "Fortaleza espiritual entre tormentas",
      visualAction: B ? `${A} bloquea el paso con porte imponente mientras ${B}, envuelto en luz, sostiene su avance frente a él` : `${A || "Una figura imponente"} de pie en lo alto de su fortaleza, bloqueando el paso, bajo un cielo de tormenta`,
      videoAction: B ? `${A} alza el brazo y una onda de sombra avanza contra la luz de ${B}; ambos sostienen la posición sin ceder` : `${A || "La figura"} da un paso al frente y alza el brazo; los relámpagos iluminan la fortaleza`,
      shotType: "Plano general en contrapicado", camera: "Grúa ascendente lenta que revela la escala monumental de la fortaleza.", lighting: "Contraluz de relámpagos rojizos contra luz blanca y dorada", vfx: "Relámpagos, ceniza flotante, sombras que se arrastran como humo", expression: A ? "determinación hostil" : "", conflict: "La resistencia que retiene la respuesta", sfx: "Truenos graves, viento de tormenta, metal que vibra" }); break;
    case "llegada": Object.assign(base, { title: "La llegada de Miguel", location: amb.split(";")[0] || "Cielo de tormenta monumental",
      visualAction: `Las nubes de tormenta se abren en un vórtice de luz blanca y dorada; ${A || "una figura de luz"} aparece en el centro, a contraluz, con toda su escala monumental; abajo, las sombras retroceden`,
      videoAction: `Las nubes se abren de arriba abajo; ${A || "la figura"} se revela poco a poco, de silueta a contraluz a rostro iluminado, y desciende; una onda de luz empuja a las fuerzas de sombra hacia atrás`,
      shotType: "Plano general monumental en contrapicado", camera: "Grúa descendente desde las nubes hasta un contrapicado del personaje, terminando en plano medio.", lighting: "Haces volumétricos blancos y dorados que atraviesan la tormenta azul", vfx: "Vórtice de nubes, rayos de luz, chispas doradas, onda expansiva de luz", expression: A ? "autoridad serena, mirada firme" : "", conflict: "El refuerzo que rompe el bloqueo", sfx: "Trueno que se abre en un acorde, ráfaga de viento, impacto grave" }); break;
    case "ayuda": Object.assign(base, { title: "La ayuda", location: amb.split(";")[0] || "Campo de batalla celestial simbólico",
      visualAction: B ? `${A} contiene la oscuridad con firmeza mientras ${B} avanza a través de un corredor de luz` : `${A || "El mensajero"} avanza a través de un corredor de luz entre nubes que se apartan`,
      videoAction: B ? `${A} sostiene la línea frente a la sombra; ${B} cruza por detrás hacia la luz sin detenerse` : `${A || "La figura"} avanza con paso decidido; las nubes se apartan a su paso`,
      shotType: "Plano general en movimiento", camera: "Travelling lateral que acompaña el avance.", lighting: "Luz blanca y dorada que gana terreno a la tormenta", vfx: "Nubes que se apartan, destellos de luz", expression: A ? "decisión" : "", conflict: "La misión continúa", sfx: "Viento que amaina, eco de truenos lejanos" }); break;
    case "vision": {
      // La figura de la visión (personaje visual sin diálogo) frente a quien la contempla.
      const fig = v.find(x => /sin_dialogo|sin dialogo/.test(norm(ficha(x)?.tipo)) || /lino/.test(norm(x)));
      const otros = v.filter(x => x !== fig);
      Object.assign(base, { title: "La visión junto al Tigris", location: "Orillas del río Tigris",
        visualAction: fig ? (otros.length ? `A orillas del Tigris, ${otros.join(" y ")} ante ${fig}, figura resplandeciente de pie sobre el agua; el reflejo dorado tiembla en el río` : `${fig}, figura resplandeciente, de pie sobre el agua del Tigris`) : `A orillas del Tigris, ${lista} bajo una luz sobrenatural`,
        videoAction: fig ? (otros.length ? `La luz de ${fig} crece sobre el río; ${otros[0]} se cubre el rostro y se inclina hasta el suelo` : `La luz de ${fig} crece y se refleja en el agua`) : "La luz sobrenatural crece sobre el agua",
        shotType: "Plano general a ras del agua", camera: "Travelling lento hacia delante sobre el agua, de la orilla hacia la figura.", lighting: "Luz blanca y dorada sobrenatural que lo baña todo", vfx: "Resplandor, brillo sobre el agua, destellos como relámpago", expression: otros.length ? "asombro y temor reverente" : "", conflict: "La fragilidad humana ante lo sobrenatural", sfx: "Agua del río, zumbido grave de la luz, respiración entrecortada" });
      break;
    }
    case "debilidad": Object.assign(base, { title: "Sin fuerzas", location: prev?.location || "Orillas del río Tigris",
      visualAction: `${A || "Daniel"} postrado en la tierra junto al río, sin fuerzas, apoyado en una mano`, videoAction: `${A || "Daniel"} intenta incorporarse y vuelve a caer, respirando con dificultad`,
      shotType: "Primer plano a ras del suelo", camera: "Cámara baja casi inmóvil, ligero acercamiento.", lighting: "Resplandor sobrenatural fuera de cuadro que lo ilumina de lado", vfx: "", expression: "agotamiento extremo", conflict: "El cuerpo no resiste la visión", sfx: "Respiración entrecortada, agua cercana" }); break;
    case "consuelo": Object.assign(base, { title: "No temas", location: prev?.location || "Orillas del río Tigris",
      visualAction: B ? `${A} se inclina hacia ${B} y le toca el hombro con una mano luminosa` : `${A} con la mano extendida hacia delante, en gesto de consuelo, luz dorada contenida`,
      videoAction: B ? `${A} toca el hombro de ${B}; ${B} levanta lentamente la mirada` : `${A} extiende la mano con suavidad y habla con calma`,
      shotType: "Plano medio", camera: "Dolly lento de acercamiento.", lighting: "Luz dorada cálida y suave", vfx: "Halo tenue de luz", expression: "compasión y firmeza", conflict: "La fuerza que vuelve", sfx: "Agua del río, viento suave" }); break;
    case "revelacion": Object.assign(base, { title: "Fueron oídas", location: prev?.location || "Orillas del río Tigris",
      visualAction: `${A} de pie junto al río, luz dorada contenida, mirada firme y serena`, videoAction: `${A} da un paso adelante y habla con autoridad tranquila`,
      shotType: "Plano medio corto", camera: "Arco lento alrededor del personaje.", lighting: "Contraluz dorado del amanecer", vfx: "Halo tenue", expression: "autoridad serena", conflict: "La respuesta llega", sfx: "Viento suave, agua" }); break;
    case "anticipacion": Object.assign(base, { title: "Lo que vendrá", location: amb.split(";")[0] || "Arquitectura sobrenatural entre tormentas",
      visualAction: `${A} emerge entre columnas de mármol bajo una tormenta helada, mirada fría hacia el horizonte${B ? `; a lo lejos, ${B} lo observa` : ""}`, videoAction: `${A} avanza un paso desde la sombra a la luz fría y alza la mirada; el viento agita su capa`,
      shotType: "Plano medio contrapicado", camera: "Dolly lento hacia el rostro, terminando en primer plano.", lighting: "Luz azul glacial y relámpagos lejanos", vfx: "Niebla fría, relámpagos lejanos", expression: "amenaza contenida", conflict: "El conflicto que vendrá", sfx: "Trueno lejano, viento frío" }); break;
    case "mision": Object.assign(base, { title: "La misión", location: amb.split(";")[0] || "Corredores de nubes y luz",
      visualAction: `${A} avanza entre corredores de nubes y luz, mirada fija hacia la tierra, luz dorada contenida a su alrededor`, videoAction: `${A} atraviesa el corredor de nubes con paso firme; la luz se abre delante de él`,
      shotType: "Plano medio en movimiento", camera: "Travelling hacia atrás que lo precede mientras avanza.", lighting: "Luz blanca dorada contenida, nubes en contraluz", vfx: "Nubes que se apartan, partículas de luz", expression: "determinación serena", conflict: "La respuesta tiene que llegar", sfx: "Viento alto, zumbido suave de luz" }); break;
    case "advertencia": Object.assign(base, { title: "La advertencia", location: prev?.location || amb.split(";")[0] || "",
      visualAction: `${A} de pie, se vuelve hacia el horizonte oscuro; detrás de él, la luz del amanecer; delante, nubes de tormenta que se forman a lo lejos`, videoAction: `${A} gira lentamente la cabeza hacia el horizonte mientras las nubes lejanas se oscurecen`,
      shotType: "Plano medio con profundidad", camera: "Dolly lateral lento que descubre el horizonte detrás del personaje.", lighting: "Contraste entre luz cálida cercana y horizonte frío", vfx: "Nubes de tormenta formándose a lo lejos", expression: "gravedad, firmeza", conflict: "El conflicto no ha terminado", sfx: "Viento que cambia, trueno muy lejano" }); break;
    default: Object.assign(base, { title: "Diálogo", location: prev?.location || amb.split(";")[0] || "",
      visualAction: A ? `${A}${B ? ` frente a ${B}` : ""} en el centro del encuadre` : "El escenario de la historia", videoAction: A ? `${A} habla con convicción` : "La cámara recorre el escenario",
      shotType: "Plano medio", camera: "Dolly lento de acercamiento.", lighting: "Luz cinematográfica natural del lugar", vfx: "", expression: "", conflict: "", sfx: "Ambiente del lugar" });
  }
  // Variaciones para momentos que se repiten (oración, resistencia): otra toma, misma continuidad.
  if (beat === "oracion" && A && vez % 3 === 1) Object.assign(base, { visualAction: `${A} de pie junto a una ventana abierta, manos alzadas, más demacrado por el ayuno; el sol de la tarde entra en diagonal`, videoAction: `${A} alza lentamente las manos y cierra los ojos; el polvo flota en el haz de sol`, shotType: "Plano general desde el exterior de la ventana", camera: "Acercamiento lento desde fuera hasta enmarcarlo en la ventana.", expression: "cansancio y perseverancia" });
  if (beat === "oracion" && A && vez % 3 === 2) Object.assign(base, { visualAction: `Primer plano de ${A}: ojos cerrados, labios que oran en silencio, rostro cansado iluminado por la lámpara`, videoAction: `${A} respira hondo y sigue orando; una lágrima cae`, shotType: "Primer plano", camera: "Casi fija, con un acercamiento mínimo.", expression: "dolor y fe perseverante" });
  if (beat === "confrontacion" && A && vez % 3 === 1) Object.assign(base, { visualAction: `${A} en el trono de su fortaleza, rodeado de sombras que se arremolinan; al fondo, una luz dorada lucha por atravesar la tormenta`, videoAction: `${A} se inclina hacia delante en el trono; las sombras giran más rápido y la luz del fondo se estrecha`, shotType: "Plano general frontal", camera: "Travelling frontal lento hacia el trono." });
  if (beat === "confrontacion" && A && vez % 3 === 2) Object.assign(base, { visualAction: `Primer plano de ${A}, mirada encendida, mientras la tormenta estalla detrás`, videoAction: `${A} aprieta la mandíbula y alza la voz; un relámpago ilumina su rostro`, shotType: "Primer plano en contrapicado", camera: "Ligero empuje hacia el rostro." });
  const location = sinPunto(base.location);
  const continuity = prev && prev.location === location && (prev.visibles || []).some(n => v.includes(n))
    ? `Continúa la escena anterior: mismo lugar, vestuario y luz${v.length ? ` (${lista})` : ""}` : i === 0 ? "Apertura del episodio" : `Corte a ${location || "un nuevo lugar"}`;
  return {
    setting: sinPunto(base.visualAction) || location, location, visualAction: sinPunto(base.visualAction), videoAction: sinPunto(base.videoAction),
    shotType: sinPunto(base.shotType), camera: limpio(base.camera), lighting: sinPunto(base.lighting), atmosphere: sinPunto(amb), vfx: sinPunto(base.vfx), expression: sinPunto(base.expression),
    conflict: limpio(base.conflict), continuity, sfx: limpio(base.sfx), music: beat === "llegada" ? "Coro épico que estalla con la revelación" : beat === "anticipacion" ? "Cuerdas graves inquietantes" : "Música épica original contenida", title: limpio(base.title),
  };
}

// ---------- 5. Validador de continuidad ----------
export type Problema = { nivel: "error" | "aviso"; codigo: string; escena?: number; mensaje: string };
export function validarImportacion(o: { episodio: any; cast: CastMember[]; original?: CapituloNormalizado | null; biblioteca?: BibliotecaNormalizada | null; modo: "fidelidad" | "creativa"; aspecto: Aspecto; avisosPresencia?: string[] }): Problema[] {
  const out: Problema[] = [];
  const escenas: any[] = Array.isArray(o.episodio?.scenes) ? o.episodio.scenes : [];
  const nombres = new Set(o.cast.map(c => norm(c.name)));
  escenas.forEach((s, i) => {
    const n = i + 1;
    if (!esNarrador(s.speaker) && !nombres.has(norm(s.speaker))) out.push({ nivel: "error", codigo: "personaje-desconocido", escena: n, mensaje: `Escena ${n}: «${s.speaker}» habla pero no está en el elenco.` });
    const vis: string[] = s.visibleCharacters || s.characters || [];
    if (vis.some(x => esNarrador(x))) out.push({ nivel: "error", codigo: "narrador-visible", escena: n, mensaje: `Escena ${n}: el Narrador figura como personaje visible; es solo una voz en off.` });
    if (esNarrador(s.speaker) && /narrador|narrator/i.test(String(s.imagePromptFlow || "").replace(/narrator is an off-screen voice only: never shown, no narrator figure\.?/i, ""))) out.push({ nivel: "error", codigo: "narrador-con-rostro", escena: n, mensaje: `Escena ${n}: el prompt de imagen describe al Narrador como figura.` });
    if (!limpio(s.visualAction) && !limpio(s.setting)) out.push({ nivel: "aviso", codigo: "sin-accion", escena: n, mensaje: `Escena ${n}: sin acción visual definida.` });
    for (const v of vis) if (!String(s.imagePromptFlow || "").includes(v)) out.push({ nivel: "error", codigo: "referencia-faltante", escena: n, mensaje: `Escena ${n}: ${v} está en cuadro pero el prompt de imagen no usa su ficha.` });
    for (const p of o.biblioteca?.personajes || []) if (p.soloEnApariciones && vis.includes(p.name)) {
      const clip = o.original?.clips[i]?.n ?? n;
      if (!p.apariciones.includes(clip)) out.push({ nivel: "error", codigo: "restriccion", escena: n, mensaje: `Escena ${n}: ${p.name} aparece, pero su ficha lo reserva para ${p.apariciones.map(x => `el clip ${x}`).join(", ")}.` });
    }
    const otro = o.aspecto === "16:9" ? /9:16/ : /16:9/;
    if (otro.test(`${s.imagePromptFlow} ${s.animationPrompt}`)) out.push({ nivel: "error", codigo: "formato", escena: n, mensaje: `Escena ${n}: el prompt no está en ${o.aspecto}.` });
  });
  for (const p of o.biblioteca?.personajes || []) if (!escenas.some(s => (s.visibleCharacters || s.characters || []).includes(p.name))) out.push({ nivel: "aviso", codigo: "sin-apariciones", mensaje: `${p.name} es un personaje canónico visual sin ninguna aparición asignada.` });
  if (escenas.length && Number(o.episodio?.duration) !== escenas.length * 8) out.push({ nivel: "error", codigo: "duracion", mensaje: `La duración (${o.episodio?.duration} s) no coincide con ${escenas.length} escenas de 8 s.` });
  if (o.biblioteca?.formato && o.biblioteca.formato !== o.aspecto) out.push({ nivel: "aviso", codigo: "formato-biblioteca", mensaje: `Las fichas canónicas piden ${o.biblioteca.formato} y el proyecto es ${o.aspecto}.` });
  if (o.original && o.modo === "fidelidad") {
    const orig = o.original.clips;
    escenas.forEach((s, i) => {
      const c = orig.find(x => norm(x.line) === norm(s.line) && norm(x.speaker) === norm(s.speaker));
      if (!c) out.push({ nivel: "error", codigo: "dialogo-cambiado", escena: i + 1, mensaje: `Escena ${i + 1}: «${s.speaker}: ${s.line}» no está en el original (cambio no autorizado en modo fidelidad).` });
    });
    if (escenas.length > orig.length) out.push({ nivel: "error", codigo: "escenas-extra", mensaje: `Hay ${escenas.length} escenas y el original tiene ${orig.length}: en modo fidelidad no se añaden escenas.` });
  }
  for (const a of o.avisosPresencia || []) out.push({ nivel: "aviso", codigo: "presencia", mensaje: a });
  return out;
}

// Cambios de la adaptación creativa respecto al original (para mostrarlos).
export function cambiosDeAdaptacion(original: ClipOriginal[], escenas: { speaker: string; line: string }[]) {
  const cambios: string[] = [];
  const max = Math.max(original.length, escenas.length);
  for (let i = 0; i < max; i++) {
    const a = original[i], b = escenas[i];
    if (a && !b) cambios.push(`Clip ${a.n} eliminado: «${a.speaker}: ${a.line}»`);
    else if (!a && b) cambios.push(`Escena ${i + 1} añadida: «${b.speaker}: ${b.line}»`);
    else if (a && b && (norm(a.line) !== norm(b.line) || norm(a.speaker) !== norm(b.speaker))) cambios.push(`Escena ${i + 1}: «${a.speaker}: ${a.line}» → «${b.speaker}: ${b.line}»`);
  }
  return cambios;
}

// ---------- 6. Importación en modo fidelidad ----------
export const CAMPOS_IA = ["visualAction", "videoAction", "shotType", "camera", "lighting", "atmosphere", "vfx", "expression", "conflict", "continuity", "sfx", "music"];
export type DireccionIA = Partial<Omit<DireccionEscena, "title">> & { n: number; visibles?: string[] };
export function importarFiel(input: { capitulo: string; personajes?: string; style?: string; formato?: string; duration?: number; scenes?: number; direccionIA?: DireccionIA[] }) {
  const cap = normalizarCapitulo(input.capitulo);
  if (!cap) throw new Error("No se reconoce la estructura del capítulo (se esperan «clips» o «scenes» con hablante y frase).");
  const bib = input.personajes ? normalizarPersonajes(input.personajes) : null;
  if (input.personajes && !bib) throw new Error("No se reconoce la biblioteca de personajes (se espera «personajes» con nombre y descripción).");
  const style: StyleKey = (estiloDeTexto(input.style) || estiloDeTexto(cap.estilo) || bib?.estilo || "epica") as StyleKey;
  const aspecto = aspectoDe(input.formato);
  const avisos = [...cap.avisos];

  // Elenco: la biblioteca manda; quien habla y no tiene ficha se añade con ficha genérica (y queda señalado).
  let cast = bib ? elencoDesdeBiblioteca(bib, style) : [];
  if (cap.episodio?.cast?.length && !bib) cast = normalizeCast(cap.episodio.cast, style);
  const sinFicha = Array.from(new Set(cap.clips.map(c => c.speaker).filter(s => !esNarrador(s) && !cast.some(c => norm(c.name) === norm(s)))));
  if (sinFicha.length) { cast = [...cast, ...normalizeCast(sinFicha.map(name => ({ name })), style, { taken: cast })]; avisos.push(`Sin ficha canónica: ${sinFicha.join(", ")}. Se añadieron con ficha genérica para completarla.`); }

  // Cantidad: la configuración manda; en fidelidad nunca se inventan escenas.
  const pedidas = Math.min(MAX_SCENES, Number(input.scenes) || cap.clips.length);
  let clips = cap.clips;
  if (pedidas < clips.length) {
    clips = selectShortScenes(clips, pedidas);
    const fuera = cap.clips.filter(c => !clips.includes(c));
    avisos.push(`La configuración pide ${pedidas} escenas y el capítulo trae ${cap.clips.length}: se conservan gancho y cierre y se quitan ${fuera.map(c => `el clip ${c.n}`).join(", ")}. Elige «Las del guion» para conservarlas todas.`);
  } else if (pedidas > clips.length) avisos.push(`La configuración pide ${pedidas} escenas y el capítulo trae ${clips.length}: en modo fidelidad no se inventan escenas (se quedan ${clips.length}). Para ampliarlo usa la adaptación creativa.`);

  const presencia = asignarPresencia(clips, bib, cast);
  const ia = new Map((input.direccionIA || []).map(d => [Number(d.n), d]));
  const visualesValidos = new Set(cast.map(c => norm(c.name)));
  let prev: { location?: string; visibles?: string[] } | null = null;
  const veces: Record<string, number> = {};
  const raw = clips.map((c, i) => {
    const pres = presencia[i];
    const beat = beatDe(c, pres.visibles); const vez = veces[beat] || 0; veces[beat] = vez + 1;
    const d = dirigirEscena(c, i, pres, prev, bib, vez);
    // La IA solo puede mejorar la dirección visual; los personajes que proponga se aceptan si existen y respetan las restricciones.
    const extra = ia.get(i + 1);
    let visibles = pres.visibles;
    if (extra?.visibles?.length) {
      const prop = extra.visibles.map(limpio).filter(n => visualesValidos.has(norm(n)) && !esNarrador(n));
      const bloq = prop.filter(n => { const p = bib?.personajes.find(x => norm(x.name) === norm(n)); return p?.soloEnApariciones && !p.apariciones.includes(c.n); });
      if (bloq.length) pres.avisos.push(`Escena ${i + 1}: la IA propuso a ${bloq.join(", ")}, pero su ficha no lo permite aquí.`);
      const ok = prop.filter(n => !bloq.includes(n)).map(n => cast.find(x => norm(x.name) === norm(n))!.name);
      if (ok.length) visibles = Array.from(new Set([...(visibles.filter(n => pres.origen[n] === "habla")), ...ok]));
    }
    // Solo campos de dirección: la IA nunca puede tocar hablante, frase ni orden.
    const dir = { ...d, ...Object.fromEntries(Object.entries(extra || {}).filter(([key, val]) => CAMPOS_IA.includes(key) && typeof val === "string" && limpio(val)).map(([key, val]) => [key, sinPunto(val)])) } as DireccionEscena;
    prev = { location: dir.location, visibles };
    return { speaker: c.speaker, line: c.line, emotion: dir.expression || "solemne", visibleCharacters: visibles, ...dir };
  });
  const titulo = bib?.titulo || cap.titulo || "Serie importada";
  const episodioTitulo = bib?.episodio || cap.episodio?.title || "Episodio 1";
  const bible = { verse: cap.versiculo, story: "", message: "" };
  const episode: any = buildProduction({ ...(cap.episodio || {}), title: episodioTitulo, summary: cap.episodio?.summary || cap.gancho.join(" "), hook: cap.gancho.length === 2 ? cap.gancho : cap.episodio?.hook, bible, scenes: raw },
    { style, duration: Number(input.duration) || clips.length * 4.5, scenes: clips.length, characters: cast, idea: cap.gancho.join(" ") || titulo, seriesTitle: titulo, partNumber: Number(cap.episodio?.partNumber || 1), fidelidad: true });
  // Metadatos originales del montaje: gancho, tarjetas (desde 0), cierre, versículo y colores del archivo.
  const colores = { ...episode.guionJson?.colores, ...Object.fromEntries(Object.entries(cap.colores || {}).map(([n, c]) => [n, String(c).replace("#", "").toUpperCase()])) };
  episode.guionJson = { ...episode.guionJson, colores, ...(cap.gancho.length ? { gancho: cap.gancho } : {}), ...(cap.cierre ? { cierre: cap.cierre } : {}), ...(cap.versiculo ? { versiculo: cap.versiculo } : {}),
    ...(cap.tarjetas.length ? { tarjetas: cap.tarjetas.filter(t => t.antes < episode.scenes.length) } : {}) };
  const final: any = conAspecto({ ...episode, mode: "importado", adaptacion: { modo: "fidelidad", original: cap.clips.length, escenas: episode.scenes.length, avisos } }, aspecto);
  const castFinal = conAspecto(cast, aspecto);
  final.validacion = validarImportacion({ episodio: final, cast: castFinal, original: cap, biblioteca: bib, modo: "fidelidad", aspecto, avisosPresencia: presencia.flatMap(p => p.avisos) });
  const errores = final.validacion.filter((p: Problema) => p.nivel === "error").length;
  return {
    mode: "importado", series: { title: titulo, logline: cap.gancho.join(" "), world: "", tone: "", style }, characters: castFinal, episode: final,
    notice: `Capítulo importado en modo fidelidad: ${final.scenes.length} escenas de ${cap.clips.length} clips originales, diálogos sin cambios, ${castFinal.length} personajes visuales${bib?.narradores.length ? ` (Narrador como voz en off)` : ""}. Revisión de continuidad: ${errores ? `${errores} error(es)` : "sin errores"}, ${final.validacion.length - errores} aviso(s).`,
  };
}
