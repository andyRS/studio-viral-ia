// Validador de guiones para importar en Estudio Viral (capitulo.json + personajes.json).
// Lo usan el agente guionista (antes de entregar) y Claude (al revisar). Aplica las reglas de
// docs/peliculas/pautas-json-para-claude.md con el mismo importador que la app.
//
// Uso:  npx -y tsx scripts/validar-guion.ts trabajo/guiones/<proyecto>/capitulo.json [trabajo/guiones/<proyecto>/personajes.json]
// Sale con código 1 si hay errores (los avisos no bloquean).
import { readFileSync } from "node:fs";
import { normalizarCapitulo, normalizarPersonajes, importarFiel } from "../src/lib/importacion";
import { MAX_ESCENAS_PELICULA } from "../src/lib/production";

type Nivel = "ERROR" | "AVISO";
const out: { nivel: Nivel; msg: string }[] = [];
const error = (msg: string) => out.push({ nivel: "ERROR", msg });
const aviso = (msg: string) => out.push({ nivel: "AVISO", msg });
const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const palabras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const BATALLA = /[¡!]|espada|ataca|golpe|ríndete|rindete|ahora|carga|cae|fuego/i;

export function validar(capTxt: string, pjTxt?: string) {
  out.length = 0;
  let crudo: any;
  try { crudo = JSON.parse(capTxt); } catch (e: any) { error(`capitulo.json no es JSON válido: ${e.message}`); return out; }
  const cap = normalizarCapitulo(crudo);
  if (!cap) { error("capitulo.json no tiene «clips» (ni «scenes») con hablante y frase."); return out; }
  const clipsCrudos: any[] = Array.isArray(crudo.clips) ? crudo.clips : [];
  if (cap.clips.length > MAX_ESCENAS_PELICULA) error(`${cap.clips.length} clips: el máximo es ${MAX_ESCENAS_PELICULA} (≈ 40 min).`);
  clipsCrudos.forEach((c, i) => {
    const pares = Array.isArray(c) ? c.filter((p: any) => Array.isArray(p) && p.length >= 2) : [];
    if (!pares.length) error(`Clip ${i + 1}: vacío (la app lo descarta). Pon una frase corta o un grito.`);
    if (pares.length > 1) error(`Clip ${i + 1}: ${pares.length} frases; debe tener UNA frase de UN hablante.`);
  });
  cap.clips.forEach(c => {
    const n = palabras(c.line);
    if (n > 20) error(`Clip ${c.n} (${c.speaker}): ${n} palabras; máximo 20 (no cabe en 8 s).`);
    else if (n > 18) aviso(`Clip ${c.n} (${c.speaker}): ${n} palabras; lo recomendado es hasta 18.`);
    else if (n < 4 && !BATALLA.test(c.line)) aviso(`Clip ${c.n} (${c.speaker}): solo ${n} palabra(s).`);
  });
  const total = cap.clips.length;
  const narr = cap.clips.filter(c => /^narrador$/i.test(c.speaker)).length;
  if (total >= 16 && narr / total > 1 / 6) aviso(`El narrador tiene ${narr} de ${total} clips (${Math.round((narr / total) * 100)} %): la historia debe llevarla el diálogo (≈ 1 de cada 8).`);
  // Tarjetas: desde 0 y menores que el total (si no, el importador cree que cuentan desde 1).
  for (const t of Array.isArray(crudo.tarjetas) ? crudo.tarjetas : []) {
    const a = Number(t?.antes);
    if (!Number.isInteger(a) || a < 1 || a >= total) error(`Tarjeta «${t?.texto}»: «antes» = ${t?.antes}; debe ser un entero entre 1 y ${total - 1} (cuenta desde 0).`);
  }
  // Colores: cada hablante, sin «#», 6 cifras.
  const colores = crudo.colores && typeof crudo.colores === "object" ? crudo.colores : {};
  const hablantes = Array.from(new Set(cap.clips.map(c => c.speaker)));
  for (const h of hablantes) if (!colores[h]) error(`Falta el color de «${h}» en «colores» (mismo nombre exacto).`);
  for (const [k, v] of Object.entries(colores)) if (!/^[0-9A-Fa-f]{6}$/.test(String(v))) error(`Color de «${k}»: «${v}»; debe ser hexadecimal de 6 cifras sin «#».`);
  if (crudo.estilo && norm(crudo.estilo) !== "epica") aviso(`estilo = «${crudo.estilo}»; para la épica bíblica se espera «epica».`);
  if (!Array.isArray(crudo.gancho) || crudo.gancho.length !== 2) aviso("«gancho» debería tener exactamente 2 líneas.");

  if (pjTxt) {
    let pj: any;
    try { pj = JSON.parse(pjTxt); } catch (e: any) { error(`personajes.json no es JSON válido: ${e.message}`); return out; }
    const bib = normalizarPersonajes(pj);
    if (!bib) { error("personajes.json no tiene «personajes»."); return out; }
    const nombres = new Set(bib.personajes.map(p => p.name));
    for (const h of hablantes) if (!/^narrador$/i.test(h) && !nombres.has(h)) {
      const parecido = bib.personajes.find(p => norm(p.name) === norm(h));
      error(`«${h}» habla en el capítulo y no está en personajes.json${parecido ? ` (hay «${parecido.name}»: el nombre debe ser idéntico)` : ""}.`);
    }
    for (const p of bib.personajes) {
      if (!p.descripcion || p.descripcion.length < 120) error(`${p.name}: «descripcion_maestra» demasiado corta (rostro, pelo, complexión y vestuario concreto).`);
      const fuera = p.apariciones.filter(n => n < 1 || n > total);
      if (fuera.length) error(`${p.name}: participa_en_clips ${fuera.join(", ")} fuera de 1–${total} (cuenta desde 1).`);
      const habla = cap.clips.filter(c => c.speaker === p.name).map(c => c.n);
      const sinVer = habla.filter(n => p.apariciones.length && !p.apariciones.includes(n));
      if (sinVer.length && p.soloEnApariciones) error(`${p.name}: habla en ${sinVer.join(", ")} pero solo puede aparecer en ${p.apariciones.join(", ")}.`);
      if (/\b(como|igual que|estilo de)\b.*\b(actor|actriz|pel[ií]cula)\b/i.test(p.descripcion)) aviso(`${p.name}: no compares con actores o películas reales.`);
    }
    const reglas = Array.isArray(pj.reglas_de_continuidad) ? pj.reglas_de_continuidad.join(" ") : "";
    if (!/dramatizaci/i.test(reglas)) aviso("Falta la regla «…batallas y diálogos celestiales son dramatización…» en reglas_de_continuidad.");
    if (!/16\s*:\s*9/.test(String(pj.formato || ""))) aviso(`formato = «${pj.formato}»; se espera «16:9 horizontal».`);
    // Prueba real: el mismo importador de la app, en modo fidelidad.
    try {
      const r: any = importarFiel({ capitulo: capTxt, personajes: pjTxt, formato: "largo" });
      if (r.episode.scenes.length !== total) error(`La app importaría ${r.episode.scenes.length} escenas de ${total} clips.`);
      for (const p of (r.episode.validacion || []).filter((v: any) => v.nivel === "error")) error(`Importación: ${p.mensaje}`);
      const noCaben = (r.episode.adaptacion?.avisos || []).filter((a: string) => /no cabe/.test(a));
      for (const a of noCaben) aviso(a);
    } catch (e: any) { error(`La app no puede importarlo: ${e.message}`); }
  }
  return out;
}

if (process.argv[1] && /validar-guion/.test(process.argv[1])) {
  const [cap, pj] = process.argv.slice(2);
  if (!cap) { console.error("Uso: npx tsx scripts/validar-guion.ts capitulo.json [personajes.json]"); process.exit(2); }
  const r = validar(readFileSync(cap, "utf8"), pj ? readFileSync(pj, "utf8") : undefined);
  const errores = r.filter(x => x.nivel === "ERROR");
  for (const x of r) console.log(`${x.nivel === "ERROR" ? "✗ ERROR" : "! AVISO"} · ${x.msg}`);
  console.log(errores.length ? `\n${errores.length} error(es): corrígelos antes de entregar.` : `\n✓ Listo para importar${r.length ? ` (${r.length} aviso(s))` : ""}.`);
  process.exit(errores.length ? 1 : 0);
}
