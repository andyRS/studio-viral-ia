import { NextRequest, NextResponse } from "next/server";
import { callLLM, templateMetricRecommendations } from "@/lib/llm";
export const maxDuration = 60;
import { requireUser } from "@/lib/auth-guard";
// POST /api/analyze-metrics — PROTEGIDA: requiere sesión Supabase (401 sin login).
export async function POST(req: NextRequest){
  const auth = await requireUser();
  if (!auth.user) return auth.response!;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok:false, error:"Body JSON inválido" }, { status:400 }); }
  if(!process.env.LLM_API_KEY){ return NextResponse.json({ok:true,recommendations:templateMetricRecommendations(body.metrics||[]),mode:"plantilla-local"}) }
  try{ const raw=await callLLM("Analista viral. Devuelve JSON {recommendations:[3 strings]}", JSON.stringify(body)); return NextResponse.json({ok:true,...JSON.parse(raw.replace(/```json|```/g,"").trim())}) }catch(e:any){ return NextResponse.json({ok:false,error:e.message},{status:500}) }
}
