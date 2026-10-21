import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { importMetrics, loadConnection } from "@/lib/meta";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// POST /api/meta/import — lee las métricas de los últimos Reels de cada página e Instagram conectados.
export async function POST() {
  const auth = await requireUser(); if (!auth.user) return auth.response!;
  try {
    const conn = await loadConnection(auth.user.id);
    if (!conn) return NextResponse.json({ ok: false, error: "Primero conecta Facebook e Instagram." });
    return NextResponse.json({ ok: true, ...(await importMetrics(conn)) });
  } catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
