// Generador de ideas: tipos comunes y la versión sin IA (combinaciones al azar, nunca una lista fija).
// La versión con IA está en story.ts (generateIdeas) y usa el prompt maestro.
import type { StyleKey } from "./knowledge";

export interface StoryIdea {
  title: string;
  idea: string;             // una o dos frases, lista para «Idea de la historia»
  hook: string[];           // 2 líneas, máximo 7 palabras cada una
  object?: string;          // objeto que revela la verdad
  twist?: string;           // giro final / cliffhanger
  mechanism?: string;       // madre negada, amor prohibido, bomba de tiempo…
  cast?: { name: string; fruit?: string; role: string }[];
  biblicalBase?: string;    // libro capítulo:versículos, si se inspira en la Biblia
  why?: string;             // por qué engancha
}

export interface IdeasRequest {
  style: StyleKey;
  direction?: string;                       // lo que pide el usuario («más modernas», «con Navidad»…)
  biblical?: { character: string; mode: "epoca" | "moderna" } | null;
  avoid?: string[];                         // ideas o títulos ya propuestos / series existentes
  history?: { role: "user" | "ia"; text: string }[];
  accountProfile?: string;                  // perfil de la cuenta (profileText): manda sobre las reglas generales
  count?: number;
}

// Personajes bíblicos con su relato base, para la versión sin IA.
export const BIBLE_STORIES: { name: string; base: string; conflict: string; modern: string; object: string; twist: string; hook?: string[] }[] = [
  { name: "José", hook: ["Lo vendieron sus propios hermanos…", "y Dios lo hizo gobernador"], base: "Génesis 37-45", conflict: "sus hermanos lo venden por envidia", modern: "sus hermanos lo dejan fuera del negocio familiar y lo mandan lejos", object: "la túnica de colores", twist: "años después ellos le piden ayuda sin reconocerlo" },
  { name: "Rut", hook: ["Todos abandonaron a la suegra…", "menos la nuera extranjera"], base: "Rut 1-4", conflict: "una viuda extranjera decide quedarse con su suegra pobre", modern: "una nuera se queda cuidando a su suegra cuando toda la familia la abandona", object: "las espigas recogidas del campo", twist: "el dueño del campo resulta ser quien puede redimirlas" },
  { name: "David", hook: ["Se burlaron del pastorcito…", "y el gigante cayó"], base: "1 Samuel 17", conflict: "un pastor joven al que todos desprecian se enfrenta a un gigante", modern: "el muchacho más humilde del barrio se enfrenta al hombre que tiene a todos con miedo", object: "la honda y las cinco piedras", twist: "el que todos despreciaban es el ungido" },
  { name: "Sansón", hook: ["Lo vendió la mujer que amaba…", "por unas monedas"], base: "Jueces 16", conflict: "un hombre fuerte cae por confiar en quien lo traiciona", modern: "un hombre exitoso lo pierde todo por confiar en quien lo vende por dinero", object: "el mechón de cabello", twist: "en su peor momento vuelve a clamar a Dios" },
  { name: "Jonás", hook: ["Huyó de lo que Dios le pidió…", "y el mar lo alcanzó"], base: "Jonás 1-3", conflict: "un profeta huye de lo que Dios le pidió", modern: "un pastor huye a otra ciudad para no perdonar al que le hizo daño", object: "el pasaje del barco", twist: "la ciudad que despreciaba se arrepiente gracias a él" },
  { name: "El hijo pródigo", hook: ["Pidió la herencia y se fue…", "y volvió sin nada"], base: "Lucas 15:11-32", conflict: "un hijo pide la herencia y la malgasta lejos de casa", modern: "un hijo se va a Nueva York con la herencia y vuelve sin nada", object: "el anillo del padre", twist: "el padre lo esperaba cada tarde en el mismo camino" },
  { name: "Ester", hook: ["Si hablaba, la mataban…", "si callaba, morían todos"], base: "Ester 4-7", conflict: "una joven arriesga su vida para salvar a su pueblo", modern: "una joven humilde casada con un millonario arriesga todo para salvar a su barrio del desalojo", object: "el cetro de oro", twist: "el que planeó la ruina cae en su propia trampa" },
  { name: "Daniel", hook: ["Lo tiraron a los leones…", "por no dejar de orar"], base: "Daniel 6", conflict: "un hombre fiel es lanzado a los leones por envidia", modern: "un empleado honrado es acusado falsamente por sus compañeros envidiosos", object: "la ventana abierta donde oraba", twist: "los leones no lo tocan y los acusadores caen" },
  { name: "Zaqueo", hook: ["Todo el pueblo lo odiaba…", "hasta que Jesús lo llamó"], base: "Lucas 19:1-10", conflict: "un cobrador rico y odiado busca ver a Jesús", modern: "el prestamista del barrio, odiado por todos, quiere cambiar su vida", object: "la libreta de deudas", twist: "devuelve cuatro veces lo que robó" },
  { name: "Ana", hook: ["La humillaban por no tener hijos…", "y ella siguió orando"], base: "1 Samuel 1", conflict: "una mujer estéril es humillada mientras ora por un hijo", modern: "una mujer humillada por su cuñada porque no puede tener hijos ora cada noche", object: "la ropita de bebé guardada", twist: "la promesa se cumple y entrega su hijo a Dios" },
  { name: "Noemí", hook: ["Lo perdió todo en tierra extraña…", "y volvió llamándose Amarga"], base: "Rut 1", conflict: "una madre lo pierde todo y se cambia el nombre por amargura", modern: "una madre que perdió esposo e hijos vuelve al barrio amargada", object: "la maleta con lo único que le quedó", twist: "su nuera se convierte en su mayor bendición" },
  { name: "Pedro", hook: ["Lo negó tres veces…", "y el gallo cantó"], base: "Lucas 22:54-62", conflict: "un amigo fiel niega tres veces a Jesús", modern: "un hombre niega tres veces a su madre enferma delante de sus amigos", object: "el gallo que canta al amanecer", twist: "la mirada que lo perdona antes de que pida perdón" },
];

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const shuffle = <T,>(list: T[]) => [...list].sort(() => Math.random() - 0.5);

const BY_STYLE: Record<StyleKey, { who: string[]; conflict: string[]; object: string[]; place: string[]; twist: string[]; mech: string[] }> = {
  cristiana: {
    who: ["una hija universitaria", "un hijo que triunfó en Nueva York", "una hermana rica de la iglesia", "un pastor de megaiglesia", "un nieto interesado", "una nuera orgullosa", "un esposo que dejó la fe"],
    conflict: ["niega a su madre delante de todos", "humilla a la viuda que vende dulces frente a la iglesia", "se burla de la fe de su abuela", "echa de la casa a su padre enfermo", "se avergüenza del uniforme de limpieza de su madre", "desprecia al conserje de la iglesia"],
    object: ["una Biblia con su nombre subrayado", "una libreta de oraciones", "las remesas devueltas sin gastar", "un sobre de ofrenda arrugado", "un carnet de empleada", "una carta escrita hace años"],
    place: ["frente a la iglesia evangélica del barrio", "en la graduación", "en el colmado", "en el hospital", "en plena Nochebuena", "en el culto del domingo"],
    twist: ["descubre que esa persona oró por ella cada noche", "la persona humillada es quien termina salvándola", "todo lo que tenía lo pagó la persona que despreció", "llega tarde para pedir perdón… o eso cree"],
    mech: ["madre negada", "humillación pública", "ironía dramática", "bomba de tiempo"],
  },
  biblica: {
    who: ["un joven del barrio", "una madre soltera", "un motoconchista", "un empleado de oficina", "una nuera", "un empresario del Cibao", "una muchacha callada de la iglesia", "dos hermanos"],
    conflict: ["es traicionado por sus socios del colmado", "lo pierde todo y no maldice", "se niega a firmar un negocio sucio y lo acusan", "gasta la herencia en Nueva York y vuelve sin nada", "envidia el éxito de su hermano", "ayuda al que todos ignoraron", "la juzgan en la iglesia por no tener hijos"],
    object: ["una carta", "una Biblia vieja", "una llave", "una foto", "un recibo", "una pulsera", "el último saco de arroz"],
    place: ["en el colmado", "en el campo", "en la iglesia evangélica sencilla", "en el hospital público", "en una oficina", "en el aeropuerto", "en el barrio después del huracán"],
    twist: ["la verdad sale a la luz", "el que lo traicionó termina necesitándolo", "llega la ayuda inesperada", "alguien cambia de corazón"],
    mech: ["traición", "prueba de fe", "integridad", "estatus y humildad"],
  },
  frutinovela: {
    who: ["un motoconchista de Los Mina", "una muchacha rica de Piantini", "un colmadero", "una suegra chismosa", "un tíguere del barrio", "una vecina metiche"],
    conflict: ["se enamora de quien su familia jamás aceptaría", "gana la lotería y todo el barrio aparece como familia", "descubre que su esposo tiene otra en el mismo barrio", "humilla al novio pobre de su hija", "esconde un hijo que nadie conocía"],
    object: ["un billete de lotería", "un celular olvidado", "una foto vieja", "una prueba de embarazo", "las llaves de una yipeta", "un anillo"],
    place: ["frente a la mansión", "en el colmado", "en la boda", "en la fila del banco", "en la parada de motoconchos"],
    twist: ["el humillado resulta ser el dueño de todo", "el secreto lo sabía toda la familia menos ella", "la boda es en un mes y nadie sabe la verdad", "el papá reconoce el anillo"],
    mech: ["amor prohibido por clase social", "secreto de dinero", "traición", "bomba de tiempo"],
  },
  cine90: {
    who: ["una cantante de boleros", "un taxista del malecón", "una maestra de pueblo", "un músico pobre", "la hija de un hacendado"],
    conflict: ["reconoce al hombre que la dejó en el altar", "recibe cartas de amor de alguien que no conoce", "descubre que su madre nunca envió una carta", "se enamora de la prometida de su hermano"],
    object: ["una carta sin enviar", "un casete grabado", "una entrada vieja de cine", "un anillo de compromiso", "una foto en blanco y negro"],
    place: ["en el malecón de Santo Domingo, 1994", "en una tienda de antigüedades", "en la fiesta de quince", "en la estación de autobuses"],
    twist: ["la carta era de su propio padre", "él la buscó cada año en el mismo lugar", "el casete tiene una confesión", "ella nunca supo que él volvió"],
    mech: ["amor imposible", "secreto familiar", "ironía dramática", "bomba de tiempo"],
  },
};

// Ideas nuevas sin IA: cada llamada combina piezas distintas al azar y evita repetir las ya propuestas.
export function templateIdeas(req: IdeasRequest): StoryIdea[] {
  const count = Math.min(6, Math.max(1, req.count || 5));
  const avoid = new Set((req.avoid || []).map(a => a.toLowerCase()));
  const out: StoryIdea[] = [];
  if (req.biblical?.character) {
    const name = req.biblical.character.trim();
    const known = BIBLE_STORIES.find(b => b.name.toLowerCase() === name.toLowerCase());
    const b: (typeof BIBLE_STORIES)[number] = known || { name, base: "", conflict: `la historia de ${name}`, modern: `la historia de ${name} en un barrio dominicano de hoy`, object: "una carta", twist: "Dios cambia su destino cuando nadie lo esperaba" };
    const modern = req.biblical.mode === "moderna";
    for (let i = 0; i < count; i++) {
      const place = modern ? `, ${pick(BY_STYLE.cristiana.place)}` : "";
      out.push({
        title: `${b.name}${modern ? " en RD" : ""}: ${pick(["la traición", "el regreso", "la promesa", "la caída", "el perdón"])}`,
        idea: `${modern ? `Adaptación moderna de ${b.name}: ` : `${b.name}: `}${modern ? b.modern : b.conflict}${place}.`,
        hook: b.hook || [`Nadie creyó en ${b.name}…`, "y Dios tenía otro plan"],
        object: b.object, twist: b.twist, mechanism: pick(BY_STYLE.cristiana.mech), biblicalBase: b.base,
        why: "Historia bíblica conocida contada desde la humillación del segundo 0 y con objeto que revela.",
      });
    }
    return out;
  }
  const pool = BY_STYLE[req.style] || BY_STYLE.cristiana;
  let guard = 0;
  while (out.length < count && guard++ < 60) {
    const who = pick(pool.who), conflict = pick(pool.conflict), place = pick(pool.place), object = pick(pool.object), twist = pick(pool.twist);
    const idea = `${who[0].toUpperCase()}${who.slice(1)} ${conflict} ${place}.`;
    if (avoid.has(idea.toLowerCase()) || out.some(o => o.idea === idea)) continue;
    out.push({ title: shuffle(["El secreto", "La humillación", "La verdad", "El regreso", "La deuda", "La carta"])[0] + " " + pick(["de la familia", "del barrio", "de mamá", "que nadie vio", "del domingo"]),
      idea, hook: [`${conflict[0].toUpperCase()}${conflict.slice(1).split(" ").slice(0, 5).join(" ")}…`, pick(["y nadie esperaba esto", "sin saber quién era", "y todo cambió esa noche"])],
      object, twist, mechanism: pick(pool.mech), why: "Conflicto de estatus desde el segundo 0 y revelación con un objeto." });
  }
  return out;
}

// Cristiana (evangélica): nunca altares, santos, vírgenes, velas votivas ni rosarios.
// Se sustituye por su equivalente evangélico cuando lo hay; si no, se quita.
export function christianSafe(text: string) {
  let s = String(text || "")
    .replace(/\baltar(es)?\b/gi, (_, pl) => (pl ? "púlpitos" : "púlpito"))
    .replace(/\brosarios?\b/gi, "Biblia")
    .replace(/(velas? votivas?|estampas? de santos?|imágenes? de santos?|cuadros? religiosos?)/gi, "")
    .replace(/\b(la |las )?v[ií]rgen(es)?\b/gi, "")
    .replace(/\b(los |las |el |la )?sant[oa]s?\b/gi, "")
    .replace(/\s{2,}/g, " ");
  // Quita en bucle las palabras que quedan huérfanas antes de una coma o un punto («con y», «y los.»).
  const ORPHAN = /\s+(con|y|e|de|del|los|las|el|la|a|en)\s*(?=[,.;]|$)/i;
  for (let i = 0; i < 5 && ORPHAN.test(s); i++) s = s.replace(ORPHAN, "");
  return s.replace(/,\s*(?=[.;]|$)/g, "").replace(/\s+([,.;])/g, "$1").trim();
}
