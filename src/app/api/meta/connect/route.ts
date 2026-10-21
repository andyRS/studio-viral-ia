import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-guard";
import { metaConfig, redirectUri, signState, META_SCOPES } from "@/lib/meta";
export const dynamic = "force-dynamic";
// GET /api/meta/connect — abre el diálogo de Facebook para conectar páginas e Instagram.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const auth = await requireUser(); if (!auth.user) return NextResponse.redirect(`${origin}/login`);
  const cfg = metaConfig();
  if (!cfg.ok) return NextResponse.redirect(`${origin}/?modulo=metricas&meta=sin-configurar`);
  const p = new URLSearchParams({ client_id: cfg.appId, redirect_uri: redirectUri(origin), state: signState(auth.user.id), response_type: "code" });
  if (cfg.configId) p.set("config_id", cfg.configId); else p.set("scope", META_SCOPES.join(","));
  return NextResponse.redirect(`https://www.facebook.com/v26.0/dialog/oauth?${p}`);
}
