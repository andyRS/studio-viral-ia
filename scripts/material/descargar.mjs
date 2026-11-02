#!/usr/bin/env node
// Material para editar (vídeos, fotos y sonidos de archivo) SOLO de fuentes con licencia libre para uso comercial:
//   - Pexels   (Licencia Pexels: uso comercial, sin atribución obligatoria)      → necesita PEXELS_API_KEY (gratis)
//   - Pixabay  (Licencia de contenido Pixabay: uso comercial)                    → necesita PIXABAY_API_KEY (gratis)
//   - Wikimedia Commons (solo dominio público, CC0, CC BY y CC BY-SA, con su atribución) → sin clave
// Nada de YouTube, TikTok ni películas: no se saltan protecciones ni se baja material con derechos.
//
// Todo va a  <Descargas>/EstudioViral/<proyecto>/  con un manifiesto.json (fuente, autor, licencia, atribución)
// y una copia del manifiesto en  trabajo/material/<proyecto>/  del repositorio, para que Claude lo revise.
//
// Uso:
//   node scripts/material/descargar.mjs buscar --fuente pexels|pixabay|wikimedia --tipo video|foto --q "desierto antiguo" [--n 8]
//   node scripts/material/descargar.mjs traer  --fuente ... --tipo ... --q "..." --proyecto daniel [--n 5] [--min 1080] [--para "escena 4: plano de lugar"]
//   node scripts/material/descargar.mjs hoja   --proyecto daniel      (hoja de contacto JPG con ffmpeg, para revisar)
//   node scripts/material/descargar.mjs lista  --proyecto daniel
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname, dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const UA = "EstudioViral/1.0 (material con licencia libre; contacto en el repositorio)";
const LIBRES = /^(public domain|pd|cc0|cc[- ]by(-sa)?( \d(\.\d)?)?( [a-z]+)?|cc by(-sa)? \d\.\d)$/i;

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; }
    else o._.push(argv[i]);
  }
  return o;
}
const limpiar = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "material";
const sinHtml = s => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export function carpetaDescargas() {
  if (process.env.ESTUDIO_DESCARGAS) return process.env.ESTUDIO_DESCARGAS;
  // En Windows en español la carpeta se ve como «Descargas» pero su ruta real es …\Downloads.
  for (const n of ["Downloads", "Descargas"]) { const p = join(homedir(), n); if (existsSync(p)) return p; }
  return join(homedir(), "Downloads");
}

async function json(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${new URL(url).host}${r.status === 401 || r.status === 403 ? " (¿falta la clave de la API?)" : ""}`);
  return r.json();
}

// Cada fuente devuelve resultados normalizados: { fuente, id, tipo, url, ancho, alto, duracion, autor, pagina, licencia, atribucion }
const FUENTES = {
  async pexels({ q, tipo, n }) {
    const k = process.env.PEXELS_API_KEY; if (!k) throw new Error("Falta PEXELS_API_KEY (gratis en https://www.pexels.com/api/).");
    if (tipo === "video") {
      const d = await json(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=${n}&orientation=landscape`, { Authorization: k });
      return d.videos.map(v => {
        const f = [...v.video_files].filter(x => x.file_type === "video/mp4" && x.height).sort((a, b) => a.height - b.height);
        const mejor = f.find(x => x.height >= 1080) || f.at(-1);
        return mejor && { fuente: "pexels", id: String(v.id), tipo: "video", url: mejor.link, ancho: mejor.width, alto: mejor.height, duracion: v.duration, autor: v.user?.name || "", pagina: v.url, licencia: "Licencia Pexels", atribucion: `Vídeo de ${v.user?.name || "autor"} en Pexels` };
      }).filter(Boolean);
    }
    const d = await json(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${n}&orientation=landscape`, { Authorization: k });
    return d.photos.map(p => ({ fuente: "pexels", id: String(p.id), tipo: "foto", url: p.src.original, ancho: p.width, alto: p.height, autor: p.photographer, pagina: p.url, licencia: "Licencia Pexels", atribucion: `Foto de ${p.photographer} en Pexels` }));
  },
  async pixabay({ q, tipo, n }) {
    const k = process.env.PIXABAY_API_KEY; if (!k) throw new Error("Falta PIXABAY_API_KEY (gratis en https://pixabay.com/api/docs/).");
    if (tipo === "video") {
      const d = await json(`https://pixabay.com/api/videos/?key=${k}&q=${encodeURIComponent(q)}&per_page=${Math.max(3, n)}&safesearch=true`);
      return d.hits.slice(0, n).map(h => { const v = h.videos.large?.url ? h.videos.large : h.videos.medium; return { fuente: "pixabay", id: String(h.id), tipo: "video", url: v.url, ancho: v.width, alto: v.height, duracion: h.duration, autor: h.user, pagina: h.pageURL, licencia: "Licencia de contenido Pixabay", atribucion: `Vídeo de ${h.user} en Pixabay` }; });
    }
    const d = await json(`https://pixabay.com/api/?key=${k}&q=${encodeURIComponent(q)}&image_type=photo&orientation=horizontal&per_page=${Math.max(3, n)}&safesearch=true`);
    return d.hits.slice(0, n).map(h => ({ fuente: "pixabay", id: String(h.id), tipo: "foto", url: h.largeImageURL, ancho: h.imageWidth, alto: h.imageHeight, autor: h.user, pagina: h.pageURL, licencia: "Licencia de contenido Pixabay", atribucion: `Imagen de ${h.user} en Pixabay` }));
  },
  async wikimedia({ q, tipo, n }) {
    const filtro = tipo === "video" ? "filetype:video" : "filetype:bitmap";
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=${Math.min(50, n * 4)}&gsrsearch=${encodeURIComponent(`${filtro} ${q}`)}&prop=imageinfo&iiprop=url|size|mime|extmetadata`;
    const d = await json(url);
    const res = [];
    for (const p of Object.values(d.query?.pages || {})) {
      const ii = p.imageinfo?.[0]; if (!ii) continue;
      const m = ii.extmetadata || {};
      const lic = sinHtml(m.LicenseShortName?.value);
      if (!LIBRES.test(lic)) continue;                    // solo dominio público, CC0, CC BY y CC BY-SA
      const autor = sinHtml(m.Artist?.value) || "autor desconocido";
      res.push({ fuente: "wikimedia", id: String(p.pageid), tipo, url: ii.url, ancho: ii.width, alto: ii.height, duracion: ii.duration, autor, pagina: ii.descriptionurl, licencia: lic,
        atribucion: /public domain|^pd$|cc0/i.test(lic) ? `${p.title.replace(/^File:/, "")} (dominio público, Wikimedia Commons)` : `${p.title.replace(/^File:/, "")} — ${autor}, ${lic}, vía Wikimedia Commons` });
      if (res.length >= n) break;
    }
    return res;
  },
};

async function buscar(o) {
  const fuente = String(o.fuente || "wikimedia"), tipo = o.tipo === "foto" ? "foto" : "video", n = Math.min(20, Number(o.n) || 8);
  if (!FUENTES[fuente]) throw new Error(`Fuente desconocida «${fuente}» (pexels, pixabay o wikimedia).`);
  if (!o.q) throw new Error("Falta --q con lo que buscas.");
  return FUENTES[fuente]({ q: String(o.q), tipo, n });
}

function rutas(proyecto) {
  const p = limpiar(proyecto);
  const dir = join(carpetaDescargas(), "EstudioViral", p);
  return { p, dir, manifiesto: join(dir, "manifiesto.json"), repo: join(REPO, "trabajo", "material", p) };
}
const leerManifiesto = f => existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { proyecto: "", archivos: [] };
function guardarManifiesto(r, m) {
  mkdirSync(r.dir, { recursive: true }); mkdirSync(r.repo, { recursive: true });
  writeFileSync(r.manifiesto, JSON.stringify(m, null, 2));
  copyFileSync(r.manifiesto, join(r.repo, "manifiesto.json"));   // copia para revisión (sin los vídeos)
}

async function traer(o) {
  if (!o.proyecto) throw new Error("Falta --proyecto (nombre de la carpeta en Descargas/EstudioViral).");
  const min = Number(o.min) || 0;
  const r = rutas(o.proyecto); mkdirSync(r.dir, { recursive: true });
  const m = leerManifiesto(r.manifiesto); m.proyecto = r.p;
  const hallados = (await buscar(o)).filter(x => !min || Math.min(x.ancho, x.alto) >= min);
  const nuevos = [];
  for (const x of hallados) {
    if (m.archivos.some(a => a.fuente === x.fuente && a.id === x.id)) continue;   // ya descargado
    const ext = (extname(new URL(x.url).pathname) || (x.tipo === "video" ? ".mp4" : ".jpg")).toLowerCase().slice(0, 6);
    const archivo = `${String(m.archivos.length + 1).padStart(3, "0")}_${x.fuente}_${limpiar(o.q)}_${x.id}${ext}`;
    const res = await fetch(x.url, { headers: { "User-Agent": UA } });
    if (!res.ok || !res.body) { console.error(`✗ No se pudo bajar ${x.pagina} (HTTP ${res.status})`); continue; }
    await pipeline(Readable.fromWeb(res.body), createWriteStream(join(r.dir, archivo)));
    const fila = { archivo, ...x, consulta: String(o.q), para: o.para ? String(o.para) : "", bytes: statSync(join(r.dir, archivo)).size, descargado: new Date().toISOString(), revision: "pendiente" };
    m.archivos.push(fila); nuevos.push(fila);
    console.log(`✓ ${archivo} · ${x.ancho}×${x.alto}${x.duracion ? ` · ${x.duracion} s` : ""} · ${x.licencia} · ${x.autor}`);
  }
  guardarManifiesto(r, m);
  console.log(`\n${nuevos.length} archivo(s) nuevos en ${r.dir}\nManifiesto para revisar: trabajo/material/${r.p}/manifiesto.json`);
  if (!nuevos.length && hallados.length === 0) console.log(min ? `Nada de al menos ${min}p: prueba otra búsqueda u otra fuente.` : "Sin resultados: prueba otras palabras (en inglés suele haber más).");
  return nuevos;
}

function hoja(o) {
  const r = rutas(o.proyecto || ""); const m = leerManifiesto(r.manifiesto);
  if (!m.archivos.length) throw new Error("Ese proyecto no tiene material.");
  const tmp = join(r.dir, ".miniaturas"); mkdirSync(tmp, { recursive: true });
  const minis = [];
  for (const [i, a] of m.archivos.entries()) {
    const mini = join(tmp, `${String(i).padStart(3, "0")}.jpg`);
    const ent = join(r.dir, a.archivo);
    if (!existsSync(ent)) continue;
    try {
      execFileSync("ffmpeg", ["-v", "error", "-y", ...(a.tipo === "video" ? ["-ss", String(Math.min(2, (a.duracion || 4) / 2))] : []), "-i", ent, "-frames:v", "1",
        "-vf", `scale=384:216:force_original_aspect_ratio=decrease,pad=384:216:(ow-iw)/2:(oh-ih)/2,drawtext=text='${String(i + 1).padStart(3, "0")}':x=6:y=6:fontsize=20:fontcolor=yellow:box=1:boxcolor=black@0.6`, mini]);
      minis.push(mini);
    } catch { console.error(`✗ Sin miniatura para ${a.archivo}`); }
  }
  const salida = join(r.dir, "hoja-contacto.jpg");
  const cols = 5, filas = Math.ceil(minis.length / cols);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", join(tmp, "%03d.jpg"), "-vf", `tile=${cols}x${filas}`, "-frames:v", "1", salida]);
  mkdirSync(r.repo, { recursive: true }); copyFileSync(salida, join(r.repo, "hoja-contacto.jpg"));
  console.log(`✓ Hoja de contacto: ${salida}\n  Copia para revisión: trabajo/material/${r.p}/hoja-contacto.jpg (los números son los del manifiesto)`);
}

function lista(o) {
  const r = rutas(o.proyecto || ""); const m = leerManifiesto(r.manifiesto);
  for (const [i, a] of m.archivos.entries()) console.log(`${String(i + 1).padStart(3, "0")} · ${a.archivo} · ${a.ancho}×${a.alto} · ${a.licencia} · ${a.revision}${a.para ? ` · ${a.para}` : ""}`);
  if (!m.archivos.length) console.log("Sin material todavía.");
}

const CMDS = { buscar: async o => console.log(JSON.stringify(await buscar(o), null, 2)), traer, hoja, lista };
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const o = args(process.argv.slice(2)); const cmd = CMDS[o._[0]];
  if (!cmd) { console.error("Uso: node scripts/material/descargar.mjs buscar|traer|hoja|lista [opciones] (ver cabecera del archivo)"); process.exit(2); }
  Promise.resolve(cmd(o)).catch(e => { console.error(`✗ ${e.message}`); process.exit(1); });
}
export { buscar, traer, FUENTES, LIBRES };
