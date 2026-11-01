// Fichas de personaje: la imagen se guarda en la cuenta como data URL, así que debe pesar poco.
// En vez de rechazar una foto grande (p. ej. 2K en PNG), se recomprime en el navegador conservando
// la resolución: WebP (o JPEG si el navegador no lo admite) bajando la calidad poco a poco, y solo
// si aun así no cabe se reduce el tamaño. Una imagen que ya cabe se guarda tal cual.
export const LIMITE_FICHA = 1.5 * 1024 * 1024;
const CALIDADES = [0.92, 0.88, 0.84, 0.8, 0.75, 0.7, 0.65];
const LADOS = [Infinity, 2560, 2048, 1600, 1280];

const leer = (b: Blob) => new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => mal(r.error); r.readAsDataURL(b); });
const codificar = (c: HTMLCanvasElement, tipo: string, q: number) => new Promise<Blob | null>(ok => c.toBlob(ok, tipo, q));

export type FichaLista = { url: string; ancho: number; alto: number; bytes: number; recomprimida: boolean };

export async function prepararFicha(file: File, limite = LIMITE_FICHA): Promise<FichaLista> {
  if (!/^image\//.test(file.type)) throw new Error("El archivo no es una imagen.");
  const bmp = await createImageBitmap(file);
  const { width: w0, height: h0 } = bmp;
  if (file.size <= limite) { bmp.close?.(); return { url: await leer(file), ancho: w0, alto: h0, bytes: file.size, recomprimida: false }; }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("El navegador no pudo procesar la imagen.");
  try {
    for (const lado of LADOS) {
      const k = Math.min(1, lado / Math.max(w0, h0));
      const w = Math.round(w0 * k), h = Math.round(h0 * k);
      if (lado !== Infinity && k === 1) continue;   // ya probado a tamaño original
      canvas.width = w; canvas.height = h;
      ctx.imageSmoothingQuality = "high"; ctx.clearRect(0, 0, w, h); ctx.drawImage(bmp, 0, 0, w, h);
      for (const tipo of ["image/webp", "image/jpeg"]) {
        for (const q of CALIDADES) {
          const b = await codificar(canvas, tipo, q);
          if (!b || (tipo === "image/webp" && b.type !== "image/webp")) break;   // sin WebP: se prueba JPEG
          if (b.size <= limite) return { url: await leer(b), ancho: w, alto: h, bytes: b.size, recomprimida: true };
        }
      }
    }
  } finally { bmp.close?.(); }
  throw new Error("No se pudo reducir la imagen lo suficiente.");
}
