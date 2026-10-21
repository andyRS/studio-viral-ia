import { NextRequest, NextResponse } from "next/server";
import { callLLM, templateDropshipping } from "@/lib/llm";
import { requireUser } from "@/lib/auth-guard";
// POST /api/dropshipping — PROTEGIDA: requiere sesión Supabase (401 sin login).
export async function POST(req: NextRequest){
  const auth = await requireUser();
  if (!auth.user) return auth.response!;
  let body: any = {};
  try { body = await req.json(); } catch { return NextResponse.json({ ok:false, error:"Body JSON inválido" }, { status:400 }); }
  if(!process.env.LLM_API_KEY) return NextResponse.json({ok:true,data:templateDropshipping(body),mode:"plantilla-local"});
  try{ const raw=await callLLM("Experto dropshipping orgánico. Responde solo JSON {angles,scripts,seedancePrompt,landing}", JSON.stringify(body)); return NextResponse.json({ok:true,data:JSON.parse(raw.replace(/```json|```/g,"").trim())}) }catch(e:any){ return NextResponse.json({ok:false,error:e.message},{status:500}) }
}
