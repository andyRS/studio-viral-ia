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
import { aspectoDe, buildProduction, conAspecto, MAX_SCENES, NARRATOR, refreshPrompts, segundosClip, selectShortScenes, type Aspecto } from "./production";
import type { Canon } from "./personajes";
import { clasificarFrase, ETIQUETA_CLASE, type Clasificacion, type Fuente } from "./fuentes";

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
  apariciones: number[]; soloEnApariciones: boolean; reglas: string[]; dialogoDramatizado: boolean;
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
    // Reglas que lo nombran, o que nombran a su grupo («los príncipes») por su nombre o su rol.
    const grupo = (r: string) => { const m = norm(r).match(/(?:entre|de|los|las)\s+([a-z]+?)s\b/g) || []; return m.map(x => x.split(/\s+/).pop()!.replace(/s$/, "")).filter(g => g.length >= 5 && (norm(name).includes(g) || norm(k(p, "rol", "role")).includes(g))); };
    const propias = reglas.filter(r => norm(r).includes(norm(name)) || grupo(r).length > 0);
    const apariciones = (Array.isArray(p.participa_en_clips) ? p.participa_en_clips : Array.isArray(p.apariciones) ? p.apariciones : []).map(Number).filter((x: number) => Number.isFinite(x) && x > 0);
    personajes.push({
      name, role, tipo: tipo || "personaje_en_pantalla", visual: true,
      descripcion: limpio(k(p, "descripcion_maestra", "descripcion", "descripción", "apariencia", "visualES", "description", "appearance")),
      apariciones, soloEnApariciones: apariciones.length > 0 && (RESTRICCION.test(role) || propias.some(r => RESTRICCION.test(r) && norm(r).includes(norm(name)))), reglas: propias,
      dialogoDramatizado: propias.some(r => /dialogo/.test(norm(r)) && /dramatiz|no son descripcion|no es descripcion|no literal/.test(norm(r))),
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
    const canon: Canon = { tipo: p.tipo, apariciones: p.apariciones, soloEnApariciones: p.soloEnApariciones, reglas: p.reglas, dialogoDramatizado: p.dialogoDramatizado, ambiente: p.ambiente, estiloVisual: p.estiloVisual, consistencia: p.consistencia, referenciaBiblica: p.referenciaBiblica, notaFidelidad: p.notaFidelidad };
    const flowPrompt = p.descripcion
      ? `${p.estiloVisual || "Cine épico realista"} Hoja de personaje: cuerpo entero, de pie, fondo gris neutro, rostro visible, vertical 9:16. ${c.name}: ${p.descripcion}${p.consistencia ? ` ${p.consistencia}` : ""} Persona real, sin texto.`
      : c.flowPrompt;
    return { ...c, flowPrompt, bible: { canon } } as CastMember & { bible: { canon: Canon } };
  });
}

// ---------- 3. Presencia visual por escena ----------
export type Presencia = { visibles: string[]; origen: Record<string, "habla" | "asignado" | "narración" | "continuidad" | "interlocutor">; avisos: string[]; interlocutor?: string };

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
    // 3b) Interlocutor: quien escucha un diálogo dirigido a él está en cuadro (si la escena lo permite).
    //     - vocativo con su nombre («Daniel, muy amado…»);
    //     - segunda persona («te», «tus»…) dirigida a alguien con quien la ficha del hablante lo relaciona
    //       («interviene en ayuda del mensajero») o a quien acaba de hablar en la escena anterior;
    //     - la conversación continúa: mismo hablante que la escena anterior, mismo interlocutor.
    //     Si la frase se dirige a alguien que no está en el elenco («Señor, …»), no se añade a nadie.
    let interlocutor: string | undefined;
    if (!narrador) {
      const t = norm(c.line);
      const otros = visuales.filter(n => norm(n) !== norm(c.speaker));
      // Vocativos con la puntuación del original («Julio, …», «…, Rosa.»), sin tildes ni mayúsculas.
      const tp = c.line.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const vocativo = otros.find(n => alias(n).some(a => new RegExp(`(^|[¡¿.!]\\s*)${a}\\s*[,!]|,\\s*${a}\\s*[.!?]*$`).test(tp)));
      const aOtro = /^[¡¿]?([a-z]+)\s*,/.exec(tp);
      const fueraDelElenco = !!aOtro && !visuales.some(n => alias(n).includes(aOtro[1]));
      const segunda = /\b(te|ti|tu|tus|contigo|usted|sigue adelante|no temas|se fuerte)\b/.test(t);
      const anterior = out[i - 1], cAnt = clips[i - 1];
      if (vocativo) interlocutor = vocativo;
      else if (segunda && !fueraDelElenco) {
        const rol = canon.get(norm(c.speaker))?.role || cast.find(x => norm(x.name) === norm(c.speaker))?.role || "";
        interlocutor = otros.find(n => menciona(rol, n))
          || (cAnt && norm(cAnt.speaker) === norm(c.speaker) ? anterior?.interlocutor : undefined)
          || (cAnt && !esNarrador(cAnt.speaker) && norm(cAnt.speaker) !== norm(c.speaker) ? otros.find(n => norm(n) === norm(cAnt.speaker)) : undefined);
      } else if (cAnt && norm(cAnt.speaker) === norm(c.speaker) && anterior?.interlocutor && !fueraDelElenco) interlocutor = anterior.interlocutor;
      if (interlocutor && !permitido(interlocutor, c.n)) interlocutor = undefined;
      if (interlocutor && !origen[interlocutor]) origen[interlocutor] = "interlocutor";
    }
    // 4) Narración sin nadie identificable (p. ej. «Su oración fue escuchada…»): continuidad con la escena anterior, para revisar.
    if (narrador && !Object.keys(origen).length) {
      const previos = (out[i - 1]?.visibles || []).filter(n => permitido(n, c.n));
      if (previos.length) { for (const n of previos) origen[n] = "continuidad"; avisos.push(`Escena ${i + 1}: la narración no nombra a nadie; se mantiene en cuadro a ${previos.join(", ")} por continuidad. Revísalo.`); }
      else avisos.push(`Escena ${i + 1}: narración sin personajes visibles; solo se verá el escenario. Revísalo.`);
    }
    // Restricciones: nadie aparece fuera de las escenas que su ficha permite.
    for (const n of Object.keys(origen)) if (origen[n] !== "habla" && !permitido(n, c.n)) delete origen[n];
    out.push({ visibles: Object.keys(origen), origen, avisos, ...(interlocutor ? { interlocutor } : {}) });
  });
  return out;
}

// ---------- 4. Dirección cinematográfica (sin IA) ----------
// Se dirige la SECUENCIA completa, no cada escena aislada:
//  - tipo de momento (beat) y su etapa en el arco: presentación → escalada → culminación
//    (la 1.ª vez que aparece un tipo de momento se presenta; las siguientes escalan; la última culmina);
//  - escena anterior y siguiente (continuidad, fuerzas que actúan fuera de cuadro);
//  - intensidad (tipo de momento + posición en el episodio), que decide música y energía de cámara;
//  - recursos de montaje que pide el texto: retrospectiva («había contemplado…»), paso del tiempo
//    («durante veintiún días…») y contraste con lo que ocurre fuera de la vista («en lo invisible…»);
//  - sin repeticiones: ninguna escena repite la imagen de otra ni el mismo plano+cámara que la anterior.
// Cada toma: una sola acción principal y un solo movimiento de cámara (clips breves de vídeo con IA).
type Beat = "oracion" | "confrontacion" | "llegada" | "ayuda" | "vision" | "debilidad" | "consuelo" | "revelacion" | "anticipacion" | "advertencia" | "mision" | "dialogo";
export function beatDe(c: ClipOriginal, visibles: string[]): Beat {
  const t = norm(`${c.line}`);
  if (/grecia|mi tiempo se acerca|ya viene|se acerca mi hora/.test(t) && !/cuando regrese/.test(t)) return "anticipacion";
  if (/cuando regrese|vendra el|vendra la|esto no ha terminado aun/.test(t)) return "advertencia";
  if (/acudio|vino en (mi|su) ayuda|aparecio|llego de pronto/.test(t)) return "llegada";
  if (/vision|tigris/.test(t)) return "vision";
  if (/no tengo fuerzas|respirar|desfallec|no puedo mas/.test(t)) return "debilidad";
  if (/no temas|se fuerte|muy amado|animo|levantate/.test(t)) return "consuelo";
  if (/fueron oidas|primer dia|la verdad es|te revelo/.test(t) && !esNarrador(c.speaker)) return "revelacion";
  if (/con la ayuda|te ayudare|sigue adelante|continuo su mision|yo te cubro/.test(t)) return "ayuda";
  if (/resisti|no pasaras|ningun mensajero|batalla|dominios|no ha terminado|no cruzara/.test(t)) return "confrontacion";
  if (/mision|debe llegar|fui enviado|respuesta|debo cumplir/.test(t) && !esNarrador(c.speaker)) return "mision";
  if (/senor|oraba|oracion|ayun|duelo|manjares|entendimiento|guiame|esperando|escuchada|dios mio/.test(t)) return "oracion";
  return "dialogo";
}

// Peso dramático del momento (0–1): cuánto tiempo de acción visual pide además de la voz.
export function pesoMomento(c: ClipOriginal, visibles: string[] = []) { const beat = beatDe(c, visibles); return { beat, peso: V[beat].peso }; }

export type DireccionEscena = { setting: string; location: string; visualAction: string; videoAction: string; shotType: string; camera: string; lighting: string; atmosphere: string; vfx: string; expression: string; conflict: string; continuity: string; sfx: string; music: string; title: string; goal: string; vocalTone: string; fidelityNote: string; intensity: number; quitarDeCuadro?: string[] };

type Variante = { clave?: RegExp; shot: string; cam: string; vis: string; vid: string; luz?: string; vfx?: string; expr?: string; obj: string; titulo: string; conB?: boolean; sinB?: boolean; lapso?: boolean };
type Etapa = "p" | "e" | "c";
const V: Record<Beat, Partial<Record<Etapa, Variante[]>> & { lugar: string; sfx: string; tono: string; peso: number; conflicto: string }> = {
  oracion: { lugar: "Interior de piedra y adobe", sfx: "Respiración contenida, crepitar de la lámpara, viento lejano", tono: "solemne y contenida", peso: 0.3, conflicto: "El silencio aparente frente a la oración que no se rinde",
    p: [
      { titulo: "La oración", shot: "Primer plano", cam: "Acercamiento muy lento hacia los ojos.", vis: "{A} con los ojos cerrados y las manos juntas contra la frente, iluminado por una lámpara de aceite; detrás, la habitación en penumbra", vid: "{A} murmura su oración mientras la llama de la lámpara tiembla", luz: "Lámpara de aceite cálida, sombras profundas", vfx: "Polvo suspendido en el haz de luz", expr: "recogimiento y súplica", obj: "Presentar la fe de {A} antes del conflicto: el público entra en su intimidad" },
      { titulo: "La búsqueda", clave: /dame|busco|ensename|muestrame/, shot: "Plano medio frontal", cam: "Dolly lento hacia delante.", vis: "{A} arrodillado frente a una ventana abierta, manos alzadas, la ciudad lejana en el horizonte", vid: "{A} alza las manos lentamente mientras el viento mueve su manto", luz: "Primera luz del día entrando por la ventana", expr: "anhelo", obj: "Situar a {A} en su búsqueda: alguien que ora esperando una respuesta" },
    ],
    e: [
      { titulo: "Escuchada", clave: /escuchad|oid|primer dia/, shot: "Plano general en picado", cam: "Ascenso vertical lento desde el personaje hacia lo alto.", vis: "{A} orando sin saberlo bajo un hilo de luz que se filtra desde lo alto y toca el suelo junto a él", vid: "La cámara se eleva desde {A} mientras el hilo de luz se intensifica sin que levante la mirada", luz: "Penumbra con un único hilo de luz cenital", vfx: "Hilo de luz con partículas", expr: "recogimiento", obj: "Ironía dramática: la oración de {A} ya fue escuchada, pero aún no lo sabe" },
      { titulo: "El desgaste", clave: /sigo esperando|todavia|cansad|sigo aqui/, shot: "Plano medio lateral", cam: "Travelling lateral muy lento.", vis: "{A} sentado contra la pared, agotado por el ayuno, respirando despacio; la luz del atardecer corta la habitación en franjas de sombra", vid: "{A} respira hondo y apoya la cabeza contra la pared mientras las sombras del atardecer avanzan por el suelo", luz: "Atardecer rasante, franjas de sombra", expr: "agotamiento y perseverancia", obj: "Mostrar el desgaste de {A}: los días pasan y la respuesta no llega" },
      { titulo: "El ayuno", clave: /ayun|manjares|vino|carne|comida|duelo/, shot: "Plano cenital", cam: "Descenso vertical lento.", vis: "{A} postrado sobre la estera en el centro de la habitación vacía; a un lado, comida y vino intactos", vid: "{A} se postra hasta tocar el suelo con la frente; la comida sigue intacta", luz: "Luz fría de la mañana", expr: "duelo y entrega", obj: "Hacer visible la renuncia de {A}: un ayuno concreto, no solo palabras" },
      { titulo: "Días sin respuesta", lapso: true, shot: "Plano fijo general", cam: "Cámara fija con lapso de tiempo.", vis: "{A} orando en el mismo lugar mientras la luz de la ventana pasa del día a la noche", vid: "Lapso de tiempo: días y noches cruzan la habitación y {A} sigue en su sitio", vfx: "Lapso de tiempo de la luz", expr: "constancia", obj: "Hacer sentir el paso de los días de espera de {A}" },
      { titulo: "La espera", clave: /entendimiento|verdad|guiame|comprender/, shot: "Plano detalle", cam: "Cámara casi fija; el foco pasa de las manos al rostro.", vis: "Las manos envejecidas de {A} apretadas sobre un rollo cerrado; al fondo, su rostro desenfocado", vid: "El foco pasa de las manos de {A} a su rostro, que abre los ojos", expr: "esperanza tensa", obj: "Subir la tensión íntima: {A} sigue esperando entendimiento" },
    ],
    c: [{ titulo: "La única luz", shot: "Plano general desde el exterior", cam: "Alejamiento lento a través de la ventana.", vis: "La ventana de {A} es la única luz encendida en la ciudad dormida; dentro, su silueta sigue orando", vid: "La cámara se aleja y la ventana de {A} queda como un punto de luz en la noche", luz: "Noche azul y una sola luz cálida", obj: "Cerrar la línea de la oración: la perseverancia de {A} contra el silencio" }] },
  confrontacion: { lugar: "Fortaleza entre tormentas", sfx: "Truenos graves, viento de tormenta, metal que vibra", tono: "grave y tensa", peso: 0.8, conflicto: "La resistencia que retiene la respuesta",
    p: [{ titulo: "El dominio", shot: "Plano general en contrapicado", cam: "Grúa ascendente que revela la escala de la fortaleza.", vis: "{A} en un trono colosal en lo alto de su fortaleza; a sus pies, ejércitos de sombra que se extienden hasta el horizonte bajo un cielo de tormenta", vid: "{A} se pone de pie y la tormenta responde a su gesto con un relámpago", luz: "Relámpagos rojizos y bronce en penumbra", vfx: "Relámpagos, ceniza flotante", expr: "soberbia imperial", obj: "Presentar el poder de {A}: un dominio que nadie cruza" }],
    e: [
      { titulo: "Días de resistencia", lapso: true, clave: /durante|dias/, shot: "Plano general fijo", cam: "Cámara fija con lapso de tiempo.", vis: "La fortaleza de {A} bajo un cielo que pasa del día a la noche una y otra vez; la muralla de sombra sigue firme", vid: "Lapso de tiempo: soles y lunas cruzan el cielo mientras la muralla de sombra no cede", vfx: "Lapso de tiempo, nubes aceleradas", obj: "Hacer sentir el paso de los días de resistencia" },
      { titulo: "El bloqueo", clave: /no pasaras|no cruzara|todavia no/, shot: "Plano general lateral", cam: "Travelling lateral siguiendo la muralla.", vis: "{A} extiende el cetro y una muralla de sombra se alza entre las nubes, cerrando el paso a una luz que llega del otro lado", vid: "La muralla de sombra crece y empuja; la luz del otro lado choca contra ella sin poder atravesarla", vfx: "Muralla de humo negro, chispas donde choca la luz", expr: "desafío", obj: "Mostrar el bloqueo: la respuesta queda detenida a medio camino" },
      { titulo: "La presión", shot: "Plano medio en contrapicado", cam: "Empuje lento hacia el rostro.", vis: "{A} con el brazo extendido sosteniendo una barrera de sombra que tiembla bajo una presión de luz que llega de fuera de cuadro", vid: "La barrera vibra con cada impacto de luz; {A} aprieta el puño y la mantiene", expr: "esfuerzo y obstinación", obj: "Subir la presión: resistir empieza a costarle a {A}" },
    ],
    c: [{ titulo: "La grieta", shot: "Primer plano en contrapicado", cam: "Ligero empuje hacia el rostro.", vis: "{A} grita de furia mientras un haz de luz blanca y dorada abre una grieta en su muralla de sombra", vid: "La grieta de luz se ensancha; {A} empuja contra ella con todo su peso y la batalla sigue sin vencedor", vfx: "Grieta de luz, fragmentos de sombra que se deshacen", expr: "furia", obj: "La intervención cambia la batalla sin resolverla: {A} no se rinde" }] },
  mision: { lugar: "Corredores de nubes y luz", sfx: "Viento alto, zumbido suave de luz", tono: "firme", peso: 0.6, conflicto: "La respuesta tiene que llegar",
    p: [{ titulo: "La misión", shot: "Plano general monumental", cam: "Grúa descendente de plano general a plano medio.", vis: "{A} desciende por un corredor de luz entre nubes colosales, pequeño ante la escala del cielo, rumbo a la tierra", vid: "{A} desciende con calma solemne mientras las nubes se abren a su paso", luz: "Luz blanca dorada contenida, nubes en contraluz", vfx: "Corredor de luz, partículas doradas", expr: "determinación serena", obj: "Presentar a {A} y su misión: la respuesta ya está en camino" }],
    e: [
      { titulo: "El muro invisible", shot: "Plano medio frontal", cam: "Travelling hacia atrás que lo precede.", vis: "{A} avanza contra un viento de sombra que le empuja hacia atrás; su luz se estrecha contra una barrera invisible", vid: "{A} da un paso, es frenado y apoya el hombro contra la barrera para empujar", vfx: "Viento de sombra, luz que se comprime", expr: "esfuerzo y firmeza", obj: "La misión de {A} choca con la resistencia: no basta con querer pasar" },
      { titulo: "Cercado", shot: "Plano general", cam: "Grúa lateral lenta.", vis: "{A} rodeado por remolinos de sombra que le cierran cada salida mientras busca un paso", vid: "{A} gira buscando una abertura mientras los remolinos se cierran", vfx: "Remolinos de sombra", expr: "alerta", obj: "Encerrar a {A}: la resistencia le rodea" },
    ],
    c: [{ titulo: "La travesía", shot: "Plano general", cam: "Travelling hacia delante siguiéndolo.", vis: "{A} atraviesa la última capa de nubes; abajo se ve la tierra", vid: "{A} cruza la capa de nubes y la luz del amanecer terrenal lo baña", obj: "Completar la travesía de {A}: la respuesta llega a su destino" }] },
  llegada: { lugar: "Cielo de tormenta monumental", sfx: "Trueno que se abre en un acorde, ráfaga de viento, impacto grave", tono: "épica, en crescendo", peso: 1, conflicto: "El refuerzo que rompe el bloqueo",
    p: [{ titulo: "La llegada", shot: "Plano general monumental en contrapicado", cam: "Grúa descendente desde las nubes hasta un contrapicado del personaje.", vis: "Las nubes de tormenta se abren en un vórtice de luz blanca y dorada; {A} aparece en el centro como silueta a contraluz, con toda su escala monumental", vid: "Las nubes se abren de arriba abajo y {A} se revela poco a poco, de silueta a rostro iluminado, mientras las sombras de abajo retroceden", luz: "Haces volumétricos blancos y dorados atravesando la tormenta azul", vfx: "Vórtice de nubes, rayos de luz, chispas doradas, onda expansiva", expr: "autoridad serena", obj: "Máximo asombro: la llegada de {A} cambia la escala del conflicto" }] },
  ayuda: { lugar: "Campo de batalla celestial simbólico", sfx: "Choque grave de luz y sombra, viento", tono: "firme", peso: 0.85, conflicto: "La intervención abre un paso",
    p: [
      { titulo: "La intervención", conB: true, shot: "Plano general en dos términos", cam: "Travelling lateral que pasa de un personaje al otro.", vis: "{A} se interpone frente a la sombra con la espada en alto; detrás de él, {B} ve abrirse un hueco de luz", vid: "{A} bloquea la ola de sombra y con un gesto indica a {B} el paso abierto", vfx: "Ola de sombra que choca contra la luz", expr: "protección y urgencia", obj: "La intervención de {A} abre una oportunidad para {B}" },
      { titulo: "La intervención", sinB: true, shot: "Plano medio en contrapicado", cam: "Arco lento alrededor del personaje.", vis: "{A} con la espada en alto contiene una ola de sombra que rompe contra su luz", vid: "La ola de sombra choca contra {A} y se divide a ambos lados", vfx: "Ola de sombra, chispas de luz", expr: "firmeza", obj: "Mostrar a {A} conteniendo la resistencia" },
    ],
    c: [{ titulo: "El paso abierto", conB: true, shot: "Plano general profundo", cam: "Grúa que sigue al personaje que se aleja.", vis: "{B} avanza por un corredor abierto hacia la tierra mientras, al fondo, {A} contiene la sombra que intenta cerrarse", vid: "{B} se aleja hacia la luz mientras, detrás, {A} sostiene la línea frente a la sombra", vfx: "Corredor de luz que se mantiene abierto", expr: "tensión sostenida", obj: "La misión continúa gracias a {A}, pero la batalla no termina" },
        { titulo: "La línea", sinB: true, shot: "Plano general", cam: "Grúa ascendente lenta.", vis: "{A} sostiene sola una línea de luz frente a un mar de sombra que no termina", vid: "La sombra golpea una y otra vez la línea de luz de {A}, que no cede", obj: "La resistencia continúa: nada está resuelto" }] },
  vision: { lugar: "Orillas del río", sfx: "Agua del río, zumbido grave de la luz, respiración entrecortada", tono: "asombrada, casi en susurro", peso: 0.75, conflicto: "La fragilidad humana ante lo sobrenatural",
    p: [{ titulo: "La visión", shot: "Plano general a ras del agua", cam: "Travelling lento hacia delante sobre el agua, de la orilla hacia la figura.", vis: "A orillas del río, {B} ante {A}, figura resplandeciente de pie sobre el agua; el reflejo dorado tiembla en la corriente", vid: "La luz de {A} crece sobre el río y {B} se cubre el rostro y se inclina hasta el suelo", luz: "Luz blanca y dorada sobrenatural que lo baña todo", vfx: "Resplandor, brillo sobre el agua, destellos como relámpago", expr: "asombro y temor reverente", obj: "Mostrar la visión que deja a {B} sin fuerzas" }] },
  debilidad: { lugar: "Orillas del río", sfx: "Respiración entrecortada, agua cercana", tono: "frágil", peso: 0.5, conflicto: "El cuerpo no resiste lo que ha visto",
    p: [{ titulo: "Sin fuerzas", shot: "Primer plano a ras del suelo", cam: "Cámara baja casi inmóvil, ligero acercamiento.", vis: "{A} postrado en la tierra junto al río, sin fuerzas, apoyado en una mano", vid: "{A} intenta incorporarse y vuelve a caer, respirando con dificultad", luz: "Resplandor fuera de cuadro que lo ilumina de lado", expr: "agotamiento extremo", obj: "La consecuencia de la visión: {A} no puede ni respirar" }] },
  consuelo: { lugar: "Orillas del río", sfx: "Agua del río, viento suave", tono: "cálida", peso: 0.45, conflicto: "La fuerza que vuelve",
    p: [
      { titulo: "No temas", conB: true, shot: "Plano medio en dos términos", cam: "Dolly lento de acercamiento.", vis: "{A} se inclina hacia {B}, que sigue postrado, y le toca el hombro con una mano luminosa", vid: "{A} toca el hombro de {B} y {B} levanta lentamente la mirada", luz: "Luz dorada cálida y suave", vfx: "Halo tenue de luz", expr: "compasión y firmeza", obj: "El primer alivio: {B} recibe fuerza de {A}" },
      { titulo: "No temas", sinB: true, shot: "Plano medio", cam: "Dolly lento de acercamiento.", vis: "{A} con la mano extendida hacia delante, en gesto de consuelo, luz dorada contenida", vid: "{A} extiende la mano con suavidad mientras habla con calma", expr: "compasión", obj: "El primer alivio llega con las palabras de {A}" },
    ] },
  revelacion: { lugar: "Orillas del río", sfx: "Viento suave, agua", tono: "serena", peso: 0.55, conflicto: "La respuesta llega",
    p: [
      { titulo: "Fueron oídas", conB: true, shot: "Plano y contraplano en un solo encuadre (sobre el hombro)", cam: "Arco lento desde la espalda de quien escucha hasta el rostro de quien habla.", vis: "Sobre el hombro de {B}, ya de rodillas, {A} le habla de frente con luz dorada contenida", vid: "{A} habla con autoridad tranquila mientras {B} levanta el rostro, comprendiendo", luz: "Contraluz dorado del amanecer", expr: "autoridad serena", obj: "La revelación central: {B} entiende que fue escuchado desde el principio" },
      { titulo: "Fueron oídas", sinB: true, shot: "Plano medio corto", cam: "Arco lento alrededor del personaje.", vis: "{A} de pie junto al río, luz dorada contenida, mirada firme y serena", vid: "{A} da un paso adelante y habla con autoridad tranquila", expr: "autoridad serena", obj: "La revelación central del episodio" },
    ] },
  advertencia: { lugar: "Orillas del río", sfx: "Viento que cambia, trueno muy lejano", tono: "grave", peso: 0.65, conflicto: "El conflicto no ha terminado",
    p: [
      { titulo: "La advertencia", conB: true, shot: "Plano medio con profundidad", cam: "Dolly lateral lento que descubre el horizonte.", vis: "{A} se vuelve desde {B} hacia el horizonte; detrás de ellos la luz del amanecer, delante nubes oscuras que se forman a lo lejos", vid: "{A} gira lentamente la cabeza hacia el horizonte mientras {B} sigue su mirada y las nubes lejanas se oscurecen", vfx: "Nubes de tormenta formándose a lo lejos", expr: "gravedad", obj: "Abrir la amenaza siguiente sin mostrarla: {B} intuye que vendrá otra batalla" },
      { titulo: "La advertencia", sinB: true, shot: "Plano medio con profundidad", cam: "Dolly lateral lento que descubre el horizonte.", vis: "{A} de pie se vuelve hacia el horizonte oscuro; detrás, la luz del amanecer", vid: "{A} gira lentamente la cabeza hacia el horizonte mientras las nubes lejanas se oscurecen", vfx: "Nubes de tormenta formándose a lo lejos", expr: "gravedad", obj: "Abrir la amenaza siguiente sin mostrarla" },
    ] },
  anticipacion: { lugar: "Arquitectura sobrenatural entre tormentas", sfx: "Trueno lejano, viento frío", tono: "inquietante", peso: 0.75, conflicto: "El conflicto que vendrá",
    p: [{ titulo: "Lo que vendrá", shot: "Plano medio en contrapicado", cam: "Dolly lento hacia el rostro, terminando en primer plano.", vis: "{A} emerge entre columnas de mármol bajo una tormenta helada, mirada fría hacia el horizonte, en un plano de realidad aparte", vid: "{A} avanza un paso desde la sombra a la luz fría y alza la mirada mientras el viento agita su capa", luz: "Luz azul glacial y relámpagos lejanos", vfx: "Niebla fría, relámpagos lejanos", expr: "amenaza contenida", obj: "Anticipar el próximo conflicto sin resolverlo: una amenaza que aún no ha llegado" }] },
  dialogo: { lugar: "", sfx: "Ambiente del lugar", tono: "natural", peso: 0.4, conflicto: "",
    p: [
      { titulo: "Diálogo", conB: true, shot: "Plano sobre el hombro", cam: "Dolly lento de acercamiento.", vis: "{A} habla a {B}, visto sobre el hombro de {B}", vid: "{A} habla con convicción mientras {B} reacciona en silencio", obj: "Que la frase de {A} cambie algo en {B}" },
      { titulo: "Diálogo", shot: "Plano medio", cam: "Dolly lento de acercamiento.", vis: "{A} en el centro del encuadre, en su lugar de la escena anterior", vid: "{A} habla con convicción y sostiene la mirada", obj: "Escuchar a {A}: su frase empuja la historia" },
      { titulo: "Diálogo", shot: "Primer plano", cam: "Cámara casi fija.", vis: "Primer plano de {A}, con el lugar desenfocado detrás", vid: "{A} dice su frase y deja un silencio", obj: "Subrayar la frase de {A}" },
    ] },
};
const MODIFICADORES = ["visto a través de un primer término desenfocado", "en contraluz", "desde un ángulo bajo", "en un encuadre más abierto"];

export function dirigirSecuencia(clips: ClipOriginal[], presencia: Presencia[], b: BibliotecaNormalizada | null): DireccionEscena[] {
  const ficha = (n?: string) => b?.personajes.find(p => norm(p.name) === norm(n));
  const beats = clips.map((c, i) => beatDe(c, presencia[i].visibles));
  const total = beats.reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] || 0) + 1 }), {});
  const visto: Record<string, number> = {};
  const usadas = new Set<string>();
  const out: DireccionEscena[] = [];
  clips.forEach((c, i) => {
    const pres = presencia[i], v = pres.visibles, beat = beats[i], lib = V[beat];
    const k = visto[beat] || 0; visto[beat] = k + 1;
    // Etapa en el arco de ese tipo de momento: el primer tercio presenta, el centro escala y la última aparición
    // culmina (solo si aparece 3 veces o más: con dos, la segunda escala).
    const n = total[beat], f = n > 1 ? k / (n - 1) : 0;
    const etapa: Etapa = k === 0 || f < 0.34 ? "p" : k === n - 1 && n >= 3 ? "c" : "e";
    const t = norm(c.line);
    const lapso = /durante \w+ (dias|semanas|meses|anos)|dias despues|semanas despues/.test(t);
    const retro = /\bhab(ia|ian|iamos)\s+\w+(ado|ido)\b/.test(t);
    const contraste = /invisible|en lo invisible|mientras tanto|lejos de alli/.test(t);
    // Personajes: quien habla en cuadro (o el primero visible) y, si hay, su contraparte. En la visión,
    // la figura contemplada (personaje visual sin diálogo) es A y quien la contempla es B.
    const hablaVisible = !esNarrador(c.speaker) && v.some(n => norm(n) === norm(c.speaker));
    let A = hablaVisible ? v.find(n => norm(n) === norm(c.speaker))! : v[0];
    let B = v.find(n => n !== A);
    if (beat === "vision") { const fig = v.find(x => /sin_dialogo|sin dialogo/.test(norm(ficha(x)?.tipo))); if (fig) { A = fig; B = v.find(n => n !== fig); } }
    // «Con la ayuda de X…»: X es quien ayuda (A) y el otro, quien avanza (B).
    if (beat === "ayuda" && esNarrador(c.speaker)) { const m = t.match(/ayuda de (\w+)/); const quien = m && v.find(n => alias(n).includes(m[1])); if (quien) { A = quien; B = v.find(n => n !== quien); } }
    // Fuerza fuera de cuadro: quien llegó o ayudó en las 3 escenas anteriores y ya no está en cuadro.
    const desde = Math.max(0, i - 3);
    const aliados = new Set(clips.slice(desde, i).flatMap((cc, j) => beats[desde + j] === "llegada" ? presencia[desde + j].visibles : beats[desde + j] === "ayuda" && !esNarrador(cc.speaker) ? presencia[desde + j].visibles.filter(n => norm(n) === norm(cc.speaker)) : []));
    const fuera = Array.from(aliados).filter(n => !v.includes(n));
    // Variante: la etapa que toca primero; después las demás. Se respeta si hay o no contraparte y si el texto pide lapso de tiempo.
    const orden = [lib[etapa] || [], ...(["p", "e", "c"] as Etapa[]).filter(x => x !== etapa).map(x => lib[x] || [])].flat()
      .filter(x => (!x.conB || !!B) && (!x.sinB || !B));
    // Preferencia: lo que el propio texto pide (palabras clave), después el lapso de tiempo si lo pide, y el orden de etapa.
    const encaja = (x: Variante) => (x.clave?.test(t) ? 2 : 0) + (lapso && x.lapso ? 1 : 0) - (!lapso && x.lapso ? 1 : 0);
    const candidatas = orden.map((x, idx) => ({ x, idx })).sort((a2, b2) => encaja(b2.x) - encaja(a2.x) || a2.idx - b2.idx).map(z => z.x);
    const rellenar = (s: string) => s.replace(/\{A\}/g, A || "el lugar").replace(/\{B\}/g, B || "");
    const prev = out[i - 1];
    let elegida = candidatas.find(x => !usadas.has(norm(rellenar(x.vis)).slice(0, 80)) && !(prev && prev.shotType === x.shot && prev.camera === x.cam)) || candidatas[0] || V.dialogo.p![1];
    let vis = rellenar(elegida.vis);
    let shot = elegida.shot;
    if (usadas.has(norm(vis).slice(0, 80))) { const m = MODIFICADORES[i % MODIFICADORES.length]; vis = `${vis}, ${m}`; shot = `${shot} (${m})`; }
    usadas.add(norm(vis).slice(0, 80));
    if (contraste && A) vis += "; sobre la pared cruzan sombras de una tormenta que no está en la habitación, presagio de lo que ocurre fuera de su vista";
    if (fuera.length && (beat === "confrontacion" || beat === "ayuda")) vis += `; la luz de ${fuera.join(" y ")} irrumpe desde fuera de cuadro`;
    let vid = rellenar(elegida.vid);
    if (!A) { vis = `${lib.lugar || "El escenario"} sin personajes en cuadro`; vid = "La cámara recorre el escenario"; }
    const amb = sinPunto((ficha(A)?.ambiente || "").split(/[;.]/)[0]);
    const location = sinPunto(retro ? "Recuerdo: " + (amb || lib.lugar) : amb && beat !== "vision" ? amb : lib.lugar || prev?.location || "");
    // Intensidad: el tipo de momento y su posición en el episodio (sube hacia el clímax, baja en la resolución).
    const pos = clips.length > 1 ? i / (clips.length - 1) : 0;
    const intensity = Math.round(Math.min(1, lib.peso * 0.75 + (pos < 0.75 ? pos * 0.35 : 0.2)) * 100) / 100;
    const nota: string[] = [];
    if (retro) nota.push("Retrospectiva: recurso de montaje que recuerda algo ya ocurrido en el relato; no es un acontecimiento ni una visión nueva.");
    const representados = v.filter(n => /interpret|no describe|artistic|dramatiz|inventad/.test(norm(ficha(n)?.notaFidelidad)));
    const visibleFinal = v.filter(x => !(beat === "anticipacion" && v.some(y => ficha(y)?.soloEnApariciones) && !ficha(x)?.soloEnApariciones && norm(x) !== norm(c.speaker)));
    const repr = representados.filter(x => visibleFinal.includes(x));
    const refs = Array.from(new Set(visibleFinal.map(x => ficha(x)?.referenciaBiblica).filter(Boolean)));
    if (refs.length) nota.push(`Referencia: ${refs.join("; ")}.`);
    const combate = beat === "confrontacion" || beat === "ayuda" || beat === "llegada";
    if (repr.length) nota.push(`Representación cinematográfica de ${repr.join(", ")}: ${combate ? "su aspecto, las armas y el combate son" : "su aspecto es"} interpretación artística, no descripción del texto.`);
    if (!esNarrador(c.speaker) && ficha(c.speaker)?.dialogoDramatizado) nota.push(`Frase de ${c.speaker} dramatizada para la película: el texto no le atribuye estas palabras.`);
    if (beat === "anticipacion" && v.some(n => ficha(n)?.soloEnApariciones)) nota.push("Anticipación de un conflicto posterior: no forma parte de los hechos de este episodio.");
    // Anticipación de un personaje restringido: nadie más en su encuadre, para no sugerir un encuentro que el texto no narra.
    const quitarDeCuadro = beat === "anticipacion" && v.some(x => ficha(x)?.soloEnApariciones) ? v.filter(x => !ficha(x)?.soloEnApariciones && norm(x) !== norm(c.speaker)) : [];
    const siguiente = clips[i + 1] ? V[beats[i + 1]] : null;
    const continuity = retro ? "Retrospectiva: tono de recuerdo (luz más blanca y suave), sin romper la continuidad del relato"
      : prev && prev.location === location && (presencia[i - 1]?.visibles || []).some(n => v.includes(n)) ? `Continúa la escena anterior: mismo lugar, vestuario y luz${v.length ? ` (${v.join(" y ")})` : ""}`
      : i === 0 ? "Apertura del episodio" : `Corte a ${location || "un nuevo lugar"}${siguiente && beats[i + 1] !== beat ? `; prepara: ${siguiente.p?.[0]?.titulo?.toLowerCase() || beats[i + 1]}` : ""}`;
    out.push({
      setting: sinPunto(vis), location, visualAction: sinPunto(vis), videoAction: sinPunto(vid), shotType: shot, camera: elegida.cam,
      lighting: sinPunto(elegida.luz || (retro ? "Luz de recuerdo, blanca y suave" : intensity > 0.7 ? "Contrastes fuertes de luz y sombra" : "Luz natural del lugar")),
      atmosphere: amb, vfx: sinPunto(elegida.vfx || ""), expression: A ? sinPunto(elegida.expr || "") : "", conflict: lib.conflicto, continuity, sfx: lib.sfx,
      music: intensity >= 0.85 ? "Clímax: coro y orquesta completa" : intensity >= 0.65 ? "Tensión creciente: percusión grave y metales" : intensity >= 0.45 ? "Cuerdas que crecen poco a poco" : "Música contenida: cuerdas suaves",
      title: elegida.titulo, goal: sinPunto(rellenar(elegida.obj)), vocalTone: esNarrador(c.speaker) ? `Voz en off ${lib.tono}` : lib.tono,
      fidelityNote: nota.join(" "), intensity, ...(quitarDeCuadro.length ? { quitarDeCuadro } : {}),
    });
  });
  return out;
}

// ---------- 4b. Duración: ¿cabe cada frase en su toma y cuánto dura el montaje? ----------
// Modelo del montaje real (montaje/subtitular.py):
//  - cada toma dura lo que piden los prompts de vídeo (segundosClip: 5 s en la épica bíblica, 8 s en el resto);
//  - la voz empieza a los ~0,3 s; el montaje corta desde 0,12 s antes de la primera palabra hasta 0,4 s después de
//    la última (con el máximo de la toma): si la frase no cabe, la toma se queda corta y la frase se corta;
//  - tarjetas de tiempo: 1,3 s cada una (no se dibujan antes del primer clip); cierre: 3 s; el gancho es un rótulo encima.
// Locución estimada: ~2,6 palabras/s en diálogo y ~2,4 en narración solemne (los prompts piden ~3: más rápido).
// En fidelidad no se recortan frases: se propone alargar la toma o encadenar la voz con la siguiente.
export const RITMO = { dialogo: 2.6, narracion: 2.4, inicioVoz: 0.3, antesPrimera: 0.12, reaccion: 0.4, tarjeta: 1.3, cierre: 3 };
export type DuracionEscena = { n: number; palabras: number; locucion: number; toma: number; montaje: number; cabe: boolean; alLimite: boolean; tomaPropuesta: number; montajePropuesto: number; propuesta: string };
export function estimarDuraciones(escenas: { n?: number; speaker: string; line: string }[], tomaSeg: number, opciones: number[] = [5, 8, 10], extra: { tarjetas?: { antes: number }[]; cierre?: boolean } = {}) {
  const filas: DuracionEscena[] = escenas.map((s, i) => {
    const palabras = limpio(s.line).split(/\s+/).filter(Boolean).length;
    const locucion = Math.round((palabras / (esNarrador(s.speaker) ? RITMO.narracion : RITMO.dialogo)) * 10) / 10;
    const necesita = RITMO.inicioVoz + locucion + 0.1;   // hasta el final de la última palabra, con un respiro
    const cabe = necesita <= tomaSeg;
    const corte = (toma: number) => Math.round(Math.min(toma, RITMO.antesPrimera + locucion + RITMO.reaccion) * 10) / 10;
    const tomaPropuesta = cabe ? tomaSeg : opciones.find(x => x >= necesita) || Math.max(...opciones);
    const montaje = cabe ? corte(tomaSeg) : tomaSeg;   // sin cambios, la toma entera y la frase cortada
    const montajePropuesto = corte(tomaPropuesta);
    const sig = escenas[i + 1];
    const propuesta = cabe ? "" : opciones.some(x => x >= necesita)
      ? `Generar esta toma a ${tomaPropuesta} s: la frase necesita ~${Math.round(necesita * 10) / 10} s y en ${tomaSeg} s quedaría cortada.${sig ? " Alternativa: que la voz continúe sobre el inicio de la toma siguiente (encadenado), sin cambiar la toma." : ""}`
      : `La frase necesita ~${Math.round(necesita * 10) / 10} s: más que cualquier toma del motor. Repartirla en dos tomas seguidas con la voz continua.`;
    // Al límite: cabe, pero sin margen para la reacción tras la frase (si la voz sale un poco más lenta, se corta).
    const alLimite = cabe && necesita + RITMO.reaccion - 0.1 > tomaSeg;
    return { n: Number(s.n) || i + 1, palabras, locucion, toma: tomaSeg, montaje, cabe, alLimite, tomaPropuesta, montajePropuesto,
      propuesta: alLimite ? `Cabe justo en ${tomaSeg} s, sin margen para la reacción: si la voz sale más lenta, generar a ${opciones.find(x => x > tomaSeg) || tomaSeg} s.` : propuesta };
  });
  const tarjetas = (extra.tarjetas || []).filter(t => t.antes > 0 && t.antes < escenas.length).length * RITMO.tarjeta;
  const cierre = extra.cierre ? RITMO.cierre : 0;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const clipsActual = r1(filas.reduce((a, f) => a + f.montaje, 0)), clipsPropuesto = r1(filas.reduce((a, f) => a + f.montajePropuesto, 0));
  return {
    filas, noCaben: filas.filter(f => !f.cabe), alLimite: filas.filter(f => f.alLimite),
    tomas: { actual: filas.length * tomaSeg, propuesto: filas.reduce((a, f) => a + f.tomaPropuesta, 0) },
    desglose: { clipsActual, clipsPropuesto, tarjetas: r1(tarjetas), cierre },
    montaje: Math.round(clipsPropuesto + tarjetas + cierre),        // con la propuesta (ninguna frase cortada)
    montajeActual: Math.round(clipsActual + tarjetas + cierre),     // tal cual, con las frases que no caben cortadas
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
    // Identidad: la descripción del prompt debe ser exactamente la de la ficha maestra (sin reescribir rasgos ni vestuario).
    for (const v of vis) { const m: any = o.cast.find(x => x.name === v); const img = String(s.imagePromptFlow || "");
      if (m && img.includes("outfit:") && !img.includes(`${m.visualEN || m.visualES}; outfit: ${m.clothing}`)) out.push({ nivel: "error", codigo: "ficha-distinta", escena: n, mensaje: `Escena ${n}: el prompt describe a ${v} distinto de su ficha maestra.` }); }
    for (const p of o.biblioteca?.personajes || []) if (p.soloEnApariciones && vis.includes(p.name)) {
      const clip = o.original?.clips[i]?.n ?? n;
      if (!p.apariciones.includes(clip)) out.push({ nivel: "error", codigo: "restriccion", escena: n, mensaje: `Escena ${n}: ${p.name} aparece, pero su ficha lo reserva para ${p.apariciones.map(x => `el clip ${x}`).join(", ")}.` });
    }
    const otro = o.aspecto === "16:9" ? /9:16/ : /16:9/;
    if (otro.test(`${s.imagePromptFlow} ${s.animationPrompt}`)) out.push({ nivel: "error", codigo: "formato", escena: n, mensaje: `Escena ${n}: el prompt no está en ${o.aspecto}.` });
  });
  for (const p of o.biblioteca?.personajes || []) if (!escenas.some(s => (s.visibleCharacters || s.characters || []).includes(p.name))) out.push({ nivel: "aviso", codigo: "sin-apariciones", mensaje: `${p.name} es un personaje canónico visual sin ninguna aparición asignada.` });
  const sumaTomas = escenas.reduce((t, sc) => t + (Number(sc.durationSec) || 8), 0);
  if (escenas.length && Number(o.episodio?.duration) !== sumaTomas) out.push({ nivel: "error", codigo: "duracion", mensaje: `La duración guardada (${o.episodio?.duration} s) no coincide con la suma de sus tomas (${sumaTomas} s).` });
  // La duración de cada toma debe ser la que piden sus prompts de vídeo.
  escenas.forEach((sc, i) => { const m = String(sc.animationPrompt || "").match(/(\d+)\s*(?:seconds|segundos)/); if (m && Number(m[1]) !== (Number(sc.durationSec) || 8)) out.push({ nivel: "aviso", codigo: "duracion-toma", escena: i + 1, mensaje: `Escena ${i + 1}: la toma figura con ${sc.durationSec || 8} s, pero su prompt de vídeo pide ${m[1]} s.` }); });
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
export type DireccionIA = Partial<Omit<DireccionEscena, "title" | "intensity">> & { n: number; visibles?: string[] };
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
  const direcciones = dirigirSecuencia(clips, presencia, bib);
  const raw = clips.map((c, i) => {
    const pres = presencia[i];
    const d = direcciones[i];
    if (d.quitarDeCuadro?.length) { pres.visibles = pres.visibles.filter(n => !d.quitarDeCuadro!.includes(n)); pres.avisos.push(`Escena ${i + 1}: ${d.quitarDeCuadro.join(", ")} sale del encuadre de la anticipación para no sugerir un encuentro que el texto no narra (su ficha lo asignaba a este clip). Revísalo.`); }
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
    // Emoción: la del personaje que habla; en el Narrador, el tono de la voz en off (nunca un gesto).
    return { speaker: c.speaker, line: c.line, emotion: esNarrador(c.speaker) ? dir.vocalTone : dir.expression || dir.vocalTone, visibleCharacters: visibles, ...dir };
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
  // Montaje estimado con el modelo real de subtitular.py (voz, tarjetas y cierre), no escenas × 4,5 s.
  const durImp = estimarDuraciones(episode.scenes, segundosClip(style), [5, 8, 10], { tarjetas: episode.guionJson?.tarjetas || [], cierre: !!episode.guionJson?.cierre });
  episode.editDuration = durImp.montajeActual;
  if (durImp.noCaben.length) avisos.push(`Duración: ${durImp.noCaben.map(f => `la escena ${f.n} (~${f.locucion} s de voz)`).join(", ")} no cabe(n) en tomas de ${segundosClip(style)} s; se propone generarlas a ${durImp.noCaben[0].tomaPropuesta} s o encadenar la voz (no se aplica sin tu aprobación).`);
  const final: any = conAspecto({ ...episode, mode: "importado", adaptacion: { modo: "fidelidad", original: cap.clips.length, escenas: episode.scenes.length, avisos } }, aspecto);
  const castFinal = conAspecto(cast, aspecto);
  final.validacion = validarImportacion({ episodio: final, cast: castFinal, original: cap, biblioteca: bib, modo: "fidelidad", aspecto, avisosPresencia: presencia.flatMap(p => p.avisos) });
  const errores = final.validacion.filter((p: Problema) => p.nivel === "error").length;
  return {
    mode: "importado", series: { title: titulo, logline: cap.gancho.join(" "), world: "", tone: "", style }, characters: castFinal, episode: final,
    notice: `Capítulo importado en modo fidelidad: ${final.scenes.length} escenas de ${cap.clips.length} clips originales, diálogos sin cambios, ${castFinal.length} personajes visuales${bib?.narradores.length ? ` (Narrador como voz en off)` : ""}. Revisión de continuidad: ${errores ? `${errores} error(es)` : "sin errores"}, ${final.validacion.length - errores} aviso(s).`,
  };
}

// ---------- 7. Revisión de dirección de un episodio existente ----------
// No reimporta ni reescribe: conserva escenas, diálogos, hablantes, orden y fichas; solo propone dirección
// visual, presencia en cuadro, beats y prompts nuevos. Devuelve la propuesta y una vista previa para aprobar.
export function bibliotecaDesdeElenco(cast: any[]): BibliotecaNormalizada {
  return {
    titulo: "", episodio: "", narradores: [NARRATOR], reglas: [],
    personajes: cast.filter(c => c?.name && !esNarrador(c.name)).map(c => {
      const k2 = c.bible?.canon || {};
      return { name: c.name, role: c.role || "", descripcion: c.visualES || "", tipo: k2.tipo || "personaje_en_pantalla", visual: true, apariciones: k2.apariciones || [], soloEnApariciones: !!k2.soloEnApariciones,
        reglas: k2.reglas || [], dialogoDramatizado: !!k2.dialogoDramatizado, ambiente: k2.ambiente || "", estiloVisual: k2.estiloVisual || "", consistencia: k2.consistencia || "",
        referenciaBiblica: k2.referenciaBiblica || "", notaFidelidad: k2.notaFidelidad || "", color: "", voz: c.voice || "" };
    }),
  };
}
export type FilaRevision = { texto?: Clasificacion; n: number; speaker: string; line: string; antes: { visibles: string[]; imagen: string; titulo: string; objetivo: string }; despues: DireccionEscena & { visibles: string[] }; duracion: DuracionEscena };
export function redirigirEpisodio(out: any, castMaestro: any[], style: StyleKey, aspecto: Aspecto, opciones: { fuente?: Fuente | null } = {}) {
  const escenas: any[] = Array.isArray(out?.scenes) ? out.scenes : [];
  const castBase = (castMaestro?.length ? castMaestro : out?.cast || []).filter((c: any) => c?.name && !esNarrador(c.name));
  const bib = bibliotecaDesdeElenco(castBase);
  const clips: ClipOriginal[] = escenas.map((s, i) => ({ n: i + 1, speaker: String(s.speaker), line: String(s.line) }));
  const presencia = asignarPresencia(clips, bib, castBase);
  const dir = dirigirSecuencia(clips, presencia, bib);
  const seg = segundosClip(style);
  const durs = estimarDuraciones(escenas, seg, [5, 8, 10], { tarjetas: out?.guionJson?.tarjetas || [], cierre: !!out?.guionJson?.cierre });
  // Clasificación de cada frase frente a la fuente (si hay): cita, paráfrasis, inspirada o dramatización.
  const fichaDe = (n: string) => bib.personajes.find(p => norm(p.name) === norm(n));
  const clasif: (Clasificacion | null)[] = escenas.map(s => opciones.fuente ? clasificarFrase(String(s.line), opciones.fuente, { narrador: esNarrador(s.speaker), sinVozEnFuente: !!fichaDe(s.speaker)?.dialogoDramatizado }) : null);
  const filas: FilaRevision[] = escenas.map((s, i) => {
    const d = dir[i];
    const visibles = presencia[i].visibles.filter(n => !(d.quitarDeCuadro || []).includes(n));
    if (d.quitarDeCuadro?.length) presencia[i].avisos.push(`Escena ${i + 1}: ${d.quitarDeCuadro.join(", ")} sale del encuadre de la anticipación para no sugerir un encuentro que el texto no narra. Revísalo.`);
    const c = clasif[i];
    // Con fuente, la clasificación sustituye a la marca genérica de «frase dramatizada».
    const nota = c ? [d.fidelityNote.replace(/\s*Frase de [^.]+dramatizada[^.]*\./, ""), `Texto: ${ETIQUETA_CLASE[c.clase]}${c.refs.length ? ` (${c.refs.join(", ")})` : ""}.`].filter(Boolean).join(" ") : d.fidelityNote;
    return { n: i + 1, speaker: s.speaker, line: s.line, antes: { visibles: s.visibleCharacters || s.characters || [], imagen: s.visualAction || s.setting || "", titulo: s.title || "", objetivo: s.goal || "" }, despues: { ...d, fidelityNote: nota, visibles }, duracion: durs.filas[i], ...(c ? { texto: c } : {}) };
  });
  const scenes = escenas.map((s, i) => {
    const d = filas[i].despues;
    const { quitarDeCuadro: _q, intensity: _i, visibles, ...campos } = d;
    const c = filas[i].texto;
    return { ...s, ...campos, visibleCharacters: visibles, characters: visibles, references: visibles.map(n => `Ficha de ${n}`), durationSec: seg,
      ...(c ? { sourceClass: c.clase, sourceRefs: c.refs } : {}),
      emotion: esNarrador(s.speaker) ? d.vocalTone : d.expression || s.emotion, speaker: s.speaker, line: s.line, n: s.n ?? i + 1 };
  });
  // El elenco del episodio con las fichas maestras actuales (mismas fichas aprobadas).
  const cast = (out?.cast || []).map((c: any) => castBase.find((m: any) => norm(m.name) === norm(c.name)) ? { ...c, ...Object.fromEntries(["visualES", "visualEN", "clothing", "voice", "flowPrompt"].map(k3 => [k3, castBase.find((m: any) => norm(m.name) === norm(c.name))[k3] ?? c[k3]])) } : c);
  const propuesta: any = conAspecto(refreshPrompts({ ...out, cast, scenes }, style), aspecto);
  // Duración: las tomas son las que piden los prompts; el montaje, el estimado con el modelo de subtitular.py.
  propuesta.duration = escenas.length * seg;
  propuesta.editDuration = durs.montajeActual;
  propuesta.revisionDireccion = { at: new Date().toISOString(), motor: "dirección por secuencia", toma: seg, montajeEstimado: durs.montajeActual, montajeConPropuesta: durs.montaje, noCaben: durs.noCaben.map(f => ({ n: f.n, tomaPropuesta: f.tomaPropuesta })), ...(opciones.fuente ? { fuente: `${opciones.fuente.titulo}${opciones.fuente.version ? ` · ${opciones.fuente.version}` : ""}` } : {}) };
  propuesta.validacion = validarImportacion({ episodio: propuesta, cast: castBase, biblioteca: bib, modo: "fidelidad", aspecto, avisosPresencia: presencia.flatMap(p => p.avisos),
    original: { fuente: "scenes", titulo: "", clips, gancho: [], cierre: "", versiculo: "", tarjetas: [], colores: {}, avisos: [] } });
  // Continuidad de identidad: mismos códigos de ficha [P01…] y fichas aprobadas antes de generar.
  const codigo = (texto: string, nombre: string) => (texto.match(new RegExp(`${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} (\\[P\\d\\d\\])`)) || [])[1];
  for (const c of castBase) {
    const antes = escenas.map(x => codigo(String(x.imagePromptFlow || ""), c.name)).find(Boolean), despues = propuesta.scenes.map((x: any) => codigo(String(x.imagePromptFlow || ""), c.name)).find(Boolean);
    if (antes && despues && antes !== despues) propuesta.validacion.push({ nivel: "error", codigo: "codigo-ficha", mensaje: `${c.name} cambia de código de ficha (${antes} → ${despues}).` });
  }
  const enCuadro = new Set(filas.flatMap(f => f.despues.visibles));
  for (const c of castBase) if (enCuadro.has(c.name) && !c.referenceApprovedAt) propuesta.validacion.push({ nivel: "aviso", codigo: "ficha-sin-aprobar", mensaje: `Ficha maestra de ${c.name} sin aprobar: apruébala (con su imagen) antes de generar imágenes.` });
  return { propuesta, filas, duraciones: durs, validacion: propuesta.validacion as Problema[] };
}

// Vista previa textual para aprobar antes de gastar créditos.
export function vistaPreviaRevision(titulo: string, filas: FilaRevision[], durs: ReturnType<typeof estimarDuraciones>, validacion: Problema[], fuente?: string) {
  const l: string[] = [`# Revisión de dirección — ${titulo}`, "", `Escenas: ${filas.length}. Diálogos, hablantes, orden y fichas sin cambios.${fuente ? ` Texto de referencia: ${fuente}.` : ""}`, ""];
  const toma = filas[0]?.duracion.toma || 0;
  l.push("## Duración", "",
    `- Tomas generadas: ${filas.length} × ${toma} s = ${durs.tomas.actual} s (lo que piden los prompts de vídeo).`,
    `- Montaje estimado tal cual: ~${durs.montajeActual} s (clips recortados a la voz ${durs.desglose.clipsActual} s + tarjetas ${durs.desglose.tarjetas} s + cierre ${durs.desglose.cierre} s)${durs.noCaben.length ? `, con ${durs.noCaben.length} frase(s) cortadas` : ""}.`,
    ...(durs.noCaben.length ? [`- Montaje estimado con la propuesta (${durs.noCaben.map(f => `escena ${f.n} a ${f.tomaPropuesta} s`).join(", ")}): ~${durs.montaje} s; tomas ${durs.tomas.propuesto} s.`] : []),
    `- Supuestos: voz desde 0,3 s; ~${RITMO.dialogo} palabras/s en diálogo y ~${RITMO.narracion} en narración; recorte 0,12 s antes y ${RITMO.reaccion} s después de la voz; tarjetas ${RITMO.tarjeta} s; cierre ${RITMO.cierre} s.`, "");
  if (durs.noCaben.length) { l.push("### Frases que no caben en su toma (no se recortan)", ""); for (const f of durs.noCaben) l.push(`- Escena ${f.n}: ${f.palabras} palabras, ~${f.locucion} s de voz; toma de ${f.toma} s. ${f.propuesta}`); l.push(""); }
  if (durs.alLimite.length) { l.push("### Frases al límite", ""); for (const f of durs.alLimite) l.push(`- Escena ${f.n}: ${f.palabras} palabras, ~${f.locucion} s de voz. ${f.propuesta}`); l.push(""); }
  if (filas.some(f => f.texto)) {
    l.push("## Clasificación del texto", "", "| Escena | Hablante | Clase | Referencias |", "|---|---|---|---|");
    for (const f of filas) if (f.texto) l.push(`| ${f.n} | ${f.speaker} | ${ETIQUETA_CLASE[f.texto.clase]} | ${f.texto.refs.join(", ") || "—"} |`);
    l.push("");
  }
  if (validacion.length) { l.push("## Avisos pendientes", ""); for (const p of validacion) l.push(`- ${p.nivel === "error" ? "Error" : "Aviso"}: ${p.mensaje}`); l.push(""); }
  for (const f of filas) {
    const d = f.despues;
    l.push(`## Escena ${f.n} — ${d.title}`, `**${f.speaker}:** «${f.line}»${esNarrador(f.speaker) ? ` _(voz en off: ${d.vocalTone.replace(/^voz en off\s*/i, "")})_` : ""}`, "",
      `- **Beat:** ${d.goal}`, `- **En cuadro:** ${d.visibles.join(", ") || "nadie (solo el escenario)"}${f.antes.visibles.join(",") !== d.visibles.join(",") ? ` _(antes: ${f.antes.visibles.join(", ") || "nadie"})_` : ""}`,
      `- **Plano y cámara:** ${d.shotType}. ${d.camera}`, `- **Imagen (fotograma fijo):** ${d.visualAction}.`, `- **Vídeo (acción y movimiento):** ${d.videoAction}.`,
      `- **Luz / ambiente / efectos:** ${[d.lighting, d.atmosphere, d.vfx].filter(Boolean).join(" · ")}`, `- **Sonido / música:** ${d.sfx} · ${d.music}`, `- **Continuidad:** ${d.continuity}`,
      `- **Duración:** ${f.duracion.palabras} palabras, ~${f.duracion.locucion} s de voz; toma de ${f.duracion.toma} s → ${!f.duracion.cabe ? `✗ ${f.duracion.propuesta}` : f.duracion.alLimite ? `al límite (~${f.duracion.montaje} s). ${f.duracion.propuesta}` : `en montaje ~${f.duracion.montaje} s ✓`}`,
      ...(f.texto ? [`- **Texto:** ${ETIQUETA_CLASE[f.texto.clase]}${f.texto.refs.length ? ` — ${f.texto.refs.join(", ")}` : ""} (${f.texto.motivo})`] : []),
      ...(d.fidelityNote ? [`- **Fidelidad:** ${d.fidelityNote}`] : []), "");
  }
  return l.join("\n");
}
