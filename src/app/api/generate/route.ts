import { NextRequest, NextResponse } from "next/server";
import { generateSeries } from "@/lib/story";
export const maxDuration = 180;
import { requireUser } from "@/lib/auth-guard";
// Compatibilidad con el generador anterior: usa la misma validación Gemini
// que /api/series para impedir guiones de plantilla sin personajes definidos.
export async function POST(req: NextRequest){
  const auth = await requireUser();
  if (!auth.user) return auth.response!;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok:false, error:"Body JSON inválido" }, { status:400 }); }
  try{
    const result = await generateSeries({ ...body, idea: body.idea || body.theme });
    return NextResponse.json({ ok:true, data: { ...result.episode, characters: result.characters, series: result.series } });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e.message }, { status:500 }) }
}
