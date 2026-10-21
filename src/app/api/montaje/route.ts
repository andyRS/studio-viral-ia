import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { requireUser } from "@/lib/auth-guard";

// POST /api/montaje — entrega la URL del servidor de montaje y un pase temporal firmado.
// El navegador sube los clips DIRECTO al servidor de montaje (Vercel no admite archivos
// tan grandes ni procesos de 3 min), y MONTAJE_TOKEN nunca sale del servidor.
const TICKET_MINUTES = 15;

export async function POST() {
  const auth = await requireUser(); if (!auth.user) return auth.response!;
  const url = (process.env.MONTAJE_URL || "").replace(/\/+$/, "");
  const token = process.env.MONTAJE_TOKEN || "";
  if (!url || !token) return NextResponse.json({ ok: false, configured: false, error: "Falta configurar MONTAJE_URL y MONTAJE_TOKEN en Vercel." });
  const exp = Math.floor(Date.now() / 1000) + TICKET_MINUTES * 60;
  const sig = createHmac("sha256", token).update(`montaje:${exp}`).digest("hex");
  return NextResponse.json({ ok: true, url, ticket: `${exp}.${sig}` });
}
