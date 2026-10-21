import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { loadConnection, metaConfig, publicView } from "@/lib/meta";
export const dynamic = "force-dynamic";
// GET /api/meta/status — páginas e Instagram conectados (sin tokens).
export async function GET() {
  const auth = await requireUser(); if (!auth.user) return auth.response!;
  if (!metaConfig().ok) return NextResponse.json({ ok: true, configured: false, connected: false });
  try { return NextResponse.json({ ok: true, configured: true, ...publicView(await loadConnection(auth.user.id)) }); }
  catch (e: any) { return NextResponse.json({ ok: false, configured: true, error: e.message }); }
}
