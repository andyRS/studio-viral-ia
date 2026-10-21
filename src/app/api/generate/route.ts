import { NextRequest, NextResponse } from "next/server";
import { generateEpisode } from "@/lib/llm";
import { requireUser } from "@/lib/auth-guard";
// POST /api/generate — Módulo 4 + 4B — PROTEGIDA: requiere sesión Supabase.
// Sin sesión -> 401 sin llamar al LLM. Sin Supabase configurado -> 503.
// Devuelve el episodio construido con la FÓRMULA BASE (Instagram) y
// data.platformAdaptations / data.platform_adaptations con las 4 fichas
// distintas (Instagram, Facebook, TikTok, YouTube Shorts) para guardar
// en episodes.platform_adaptations (jsonb). Nunca un único texto para todas.
export async function POST(req: NextRequest){
  const auth = await requireUser();
  if (!auth.user) return auth.response!;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok:false, error:"Body JSON inválido" }, { status:400 }); }
  try{
    const data:any = await generateEpisode(body);
    if (!data.platformAdaptations && data.platform_adaptations) data.platformAdaptations = data.platform_adaptations;
    if (data.platformAdaptations && !data.platform_adaptations) data.platform_adaptations = data.platformAdaptations;
    return NextResponse.json({ ok:true, data });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e.message }, { status:500 }) }
}
