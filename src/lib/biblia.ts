// Citas bíblicas: leer una referencia escrita de cualquier forma habitual y comprobar que existe (libro,
// capítulo y versículos). Así la app nunca da por buena una cita inventada («Daniel 10:40» no existe).
import { LIBROS } from "./bibliaDatos";

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").replace(/\./g, "");
const ALIAS = new Map<string, number>();
LIBROS.forEach(([nombre, alias], i) => { ALIAS.set(norm(nombre), i); for (const a of alias) ALIAS.set(norm(a), i); });
// Libros de un solo capítulo: «Judas 14» es el versículo 14.
const UN_CAPITULO = new Set(LIBROS.map((l, i) => (l[2].length === 1 ? i : -1)).filter(i => i >= 0));

export type Cita = { libro: string; cap: number; desde?: number; hasta?: number; texto: string };
export type Validacion = { ok: boolean; cita?: Cita; error?: string; original: string };

function libroDe(t: string): number | null {
  const k = norm(t);
  if (ALIAS.has(k)) return ALIAS.get(k)!;
  // «Primera de Samuel», «I Samuel», «1° Samuel»
  const k2 = k.replace(/^(primera|primer|i)(de)?/, "1").replace(/^(segunda|segundo|ii)(de)?/, "2").replace(/^(tercera|iii)(de)?/, "3").replace(/[º°]/g, "");
  if (ALIAS.has(k2)) return ALIAS.get(k2)!;
  // Prefijo único: «Deut», «Eclesias»
  const cand = Array.from(ALIAS.entries()).filter(([a]) => a.startsWith(k2) && k2.length >= 3).map(([, i]) => i);
  return new Set(cand).size === 1 ? cand[0] : null;
}

// Una sola referencia: «Daniel 10:2-4», «Dn 10.13», «Judas 14-15», «Salmo 91», «Isaías 14-15» (capítulos).
export function validarCita(texto: string): Validacion {
  const original = texto.trim();
  const limpio = original.replace(/^(primera|segunda|tercera)\s+de\s+/i, "$1 ");
  const m = /^\s*((?:[1-3]|i{1,3}|primera|segunda|tercera)?\s*[a-záéíóúñü.°º ]+?)\s*(\d+)(?:\s*[:.,]\s*(\d+))?(?:\s*[-–]\s*(\d+))?\s*$/i.exec(limpio);
  if (!m) return { ok: false, original, error: "No se entiende la referencia (ej.: Daniel 10:13)." };
  const i = libroDe(m[1]);
  if (i === null) return { ok: false, original, error: `No existe el libro «${m[1].trim()}»${/enoc|jubileo|macabeo|tobias|judit/i.test(m[1]) ? " en la Biblia (es un texto extrabíblico: regístralo como tradición)" : ""}.` };
  const [nombre, , versos] = LIBROS[i];
  const uno = UN_CAPITULO.has(i);
  let cap = Number(m[2]);
  let desde = m[3] ? Number(m[3]) : undefined;
  let hasta = m[4] ? Number(m[4]) : undefined;
  let capHasta: number | undefined;
  if (uno && desde === undefined) { desde = cap; cap = 1; }            // «Judas 14», «Judas 14-15»
  else if (!uno && desde === undefined && hasta !== undefined) { capHasta = hasta; hasta = undefined; }   // «Isaías 14-15»
  if (cap < 1 || cap > versos.length) return { ok: false, original, error: `${nombre} tiene ${versos.length} capítulo${versos.length === 1 ? "" : "s"}: no existe el ${cap}.` };
  if (capHasta !== undefined && (capHasta <= cap || capHasta > versos.length)) return { ok: false, original, error: `${nombre} tiene ${versos.length} capítulos: el rango ${cap}-${capHasta} no es válido.` };
  const max = versos[cap - 1];
  if (desde !== undefined && (desde < 1 || desde > max)) return { ok: false, original, error: `${nombre}${uno ? "" : ` ${cap}`} tiene ${max} versículos: no existe el ${desde}.` };
  if (hasta !== undefined && (hasta <= (desde || 0) || hasta > max)) return { ok: false, original, error: `${nombre}${uno ? "" : ` ${cap}`} tiene ${max} versículos: el rango no termina en ${hasta}.` };
  const vv = desde !== undefined ? `${desde}${hasta ? `-${hasta}` : ""}` : "";
  const texto2 = uno ? `${nombre}${vv ? ` ${vv}` : ""}` : `${nombre} ${cap}${capHasta ? `-${capHasta}` : vv ? `:${vv}` : ""}`;
  return { ok: true, original, cita: { libro: nombre, cap, desde, hasta, texto: texto2 } };
}

// Varias referencias en un mismo texto: «Isaías 14; Ap 12», «Daniel 10:2-4 y 10:13», «Judas 14-15».
export function validarCitas(texto: string): Validacion[] {
  const partes = String(texto || "").split(/\s*(?:;|\by\b|,(?=\s*(?:[1-3]\s*)?[a-záéíóú]))\s*/i).map(p => p.trim()).filter(Boolean);
  const out: Validacion[] = [];
  let ultimoLibro = "";
  for (const p of partes) {
    // «10:13» suelto después de «Daniel 10:2-4»: mismo libro
    const conLibro = /^\d+\s*[:.]/.test(p) && ultimoLibro ? `${ultimoLibro} ${p}` : p;
    const v = validarCita(conLibro);
    if (v.ok) ultimoLibro = v.cita!.libro;
    out.push(v);
  }
  return out;
}
export const citasValidas = (texto: string) => { const v = validarCitas(texto); return v.length > 0 && v.every(x => x.ok); };
