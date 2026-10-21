"use client";
// Helper del frontend para llamar a las rutas de IA protegidas.
// Devuelve también el status para que cada módulo maneje el 401 mostrando
// «Inicia sesión para usar la IA» con enlace a /login, sin romperse.
export interface ApiResult { status: number; json: any }
export async function postApi(path: string, body: any): Promise<ApiResult> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}
export const isAuthError = (r: ApiResult) => r.status === 401 || r.status === 503;
