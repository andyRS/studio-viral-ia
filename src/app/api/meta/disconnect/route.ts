import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { deleteConnection } from "@/lib/meta";
// POST /api/meta/disconnect — borra los tokens guardados.
export async function POST() {
  const auth = await requireUser(); if (!auth.user) return auth.response!;
  try { await deleteConnection(auth.user.id); return NextResponse.json({ ok: true }); }
  catch (e: any) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
