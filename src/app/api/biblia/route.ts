import { NextRequest, NextResponse } from "next/server";
import { LIBROS } from "@/lib/bibliaDatos";
import { validarCita } from "@/lib/biblia";
// GET /api/biblia?ref=Daniel 10:2-4 — valida la cita y trae su texto de la Reina-Valera 1909 desde la API pública
// y gratuita de getbible.net (sin clave). Si la cita no existe, lo dice y no inventa nada.
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get("ref") || "";
  const v = validarCita(ref);
  if (!v.ok || !v.cita) return NextResponse.json({ ok: false, error: v.error || "Cita no válida" }, { status: 400 });
  const { libro, cap, desde, hasta, texto } = v.cita;
  const n = LIBROS.findIndex(l => l[0] === libro) + 1;
  try {
    const r = await fetch(`https://api.getbible.net/v2/valera/${n}/${cap}.json`, { next: { revalidate: 60 * 60 * 24 * 30 } });   // caché de 30 días
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const versos = (Array.isArray(d?.verses) ? d.verses : [])
      .filter((x: any) => desde === undefined || (x.verse >= desde && x.verse <= (hasta ?? desde)))
      .map((x: any) => ({ v: Number(x.verse), t: String(x.text || "").trim() }));
    if (!versos.length) return NextResponse.json({ ok: false, error: "La fuente no devolvió esos versículos." }, { status: 404 });
    return NextResponse.json({ ok: true, ref: texto, version: "Reina-Valera 1909", fuente: `https://api.getbible.net/v2/valera/${n}/${cap}.json`, versos });
  } catch (e: any) {
    // Sin conexión con la fuente: la cita es válida, pero el texto no se inventa.
    return NextResponse.json({ ok: false, ref: texto, error: `La cita existe, pero no se pudo traer el texto ahora (${e?.message || e}). Vuelve a intentarlo.` }, { status: 502 });
  }
}
