// Conexión con Meta (páginas de Facebook + cuentas profesionales de Instagram)
// para importar las métricas reales de los Reels. Solo servidor.
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const GRAPH = "https://graph.facebook.com/v26.0";
export const META_SCOPES = [
  "pages_show_list", "pages_read_engagement", "pages_manage_engagement", "read_insights",
  "instagram_basic", "instagram_manage_insights", "business_management",
];
const PROVIDER = "meta";
const REELS_LIMIT = 25;

export function metaConfig() {
  const appId = process.env.META_APP_ID || "";
  const secret = process.env.META_APP_SECRET || "";
  return { appId, secret, configId: process.env.META_CONFIG_ID || "", ok: !!(appId && secret) };
}

export function redirectUri(origin: string) { return `${origin}/api/meta/callback`; }

// state firmado: evita que otra persona conecte su cuenta en tu sesión (CSRF).
export function signState(userId: string) {
  const exp = Math.floor(Date.now() / 1000) + 600;
  const sig = createHmac("sha256", metaConfig().secret).update(`${userId}.${exp}`).digest("hex");
  return `${exp}.${sig}`;
}
export function checkState(state: string, userId: string) {
  const [exp, sig] = String(state || "").split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const good = createHmac("sha256", metaConfig().secret).update(`${userId}.${exp}`).digest("hex");
  return sig.length === good.length && timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

// La tabla social_connections no tiene políticas RLS: solo el servidor (service role) la lee.
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  return createClient(url, key, { auth: { persistSession: false } });
}
export async function loadConnection(userId: string): Promise<any | null> {
  const { data, error } = await admin().from("social_connections").select("data").eq("user_id", userId).eq("provider", PROVIDER).maybeSingle();
  if (error) throw new Error(error.message.includes("social_connections") ? "Falta la tabla social_connections en Supabase (ejecuta supabase/schema.sql)." : error.message);
  return data?.data || null;
}
export async function saveConnection(userId: string, value: any) {
  const { error } = await admin().from("social_connections").upsert({ user_id: userId, provider: PROVIDER, data: value, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}
export async function deleteConnection(userId: string) {
  await admin().from("social_connections").delete().eq("user_id", userId).eq("provider", PROVIDER);
}

async function graph(path: string, params: Record<string, string>) {
  const r = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.message || `Meta HTTP ${r.status}`);
  return j;
}

// code -> token corto -> token largo (60 días) -> páginas con su token de página
// (los tokens de página obtenidos de un token largo no caducan) + Instagram vinculado.
export async function exchangeCode(code: string, origin: string) {
  const { appId, secret } = metaConfig();
  const short = await graph("/oauth/access_token", { client_id: appId, client_secret: secret, redirect_uri: redirectUri(origin), code });
  const long = await graph("/oauth/access_token", { grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: short.access_token });
  const me = await graph("/me", { fields: "id,name", access_token: long.access_token });
  const acc = await graph("/me/accounts", { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100", access_token: long.access_token });
  const pages = (acc.data || []).map((p: any) => ({
    id: p.id, name: p.name, token: p.access_token,
    ig: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username } : null,
  }));
  return { userName: me.name, connectedAt: new Date().toISOString(), pages };
}

// Lo que ve el navegador: nombres, nunca tokens.
export function publicView(conn: any) {
  return { connected: !!conn, userName: conn?.userName, connectedAt: conn?.connectedAt, selected: Array.isArray(conn?.selected) ? conn.selected : null, pages: (conn?.pages || []).map((p: any) => ({ id: p.id, name: p.name, ig: p.ig?.username || null })) };
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const insightMap = (j: any) => Object.fromEntries((j.data || []).map((m: any) => [m.name, m.values?.[0]?.value ?? m.total_value?.value]));
const num = (v: any) => (typeof v === "number" ? v : 0);

// Pide métricas; si alguna no está disponible para ese reel, reintenta con las básicas.
async function insights(path: string, token: string, full: string[], basic: string[]) {
  try { return insightMap(await graph(path, { metric: full.join(","), access_token: token })); }
  catch { try { return insightMap(await graph(path, { metric: basic.join(","), access_token: token })); } catch { return null; } }
}

export interface ImportedMetric {
  externalId: string; platform: "Facebook" | "Instagram"; account: string; caption: string; permalink: string; date: string;
  views: number; avgWatch: number; interactions: number; followers: number; duration: number;
  shares?: number; saves?: number; skipRate?: number; reach?: number; thumb?: string;
}

async function instagramReels(page: any, limit = REELS_LIMIT): Promise<ImportedMetric[]> {
  const media = await graph(`/${page.ig.id}/media`, { fields: "id,caption,media_product_type,timestamp,permalink,thumbnail_url", limit: String(limit), access_token: page.token });
  const reels = (media.data || []).filter((m: any) => m.media_product_type === "REELS");
  const rows = await pool(reels, 5, async (m: any) => {
    const v = await insights(`/${m.id}/insights`, page.token,
      ["views", "reach", "saved", "shares", "total_interactions", "ig_reels_avg_watch_time", "reels_skip_rate"],
      ["views", "reach", "saved", "shares", "total_interactions"]);
    if (!v) return null;
    return {
      externalId: `ig:${m.id}`, platform: "Instagram" as const, account: `@${page.ig.username}`, caption: m.caption || "", permalink: m.permalink || "", thumb: m.thumbnail_url || "", date: String(m.timestamp || "").slice(0, 10),
      views: num(v.views), avgWatch: Math.round(num(v.ig_reels_avg_watch_time) / 100) / 10, interactions: num(v.total_interactions), followers: 0, duration: 0,
      shares: num(v.shares), saves: num(v.saved), reach: num(v.reach), skipRate: typeof v.reels_skip_rate === "number" ? Math.round(v.reels_skip_rate * 10) / 10 : undefined,
    };
  });
  return rows.filter(Boolean) as ImportedMetric[];
}

async function facebookReels(page: any, limit = REELS_LIMIT): Promise<ImportedMetric[]> {
  const list = await graph(`/${page.id}/video_reels`, { fields: "id,description,created_time,length,permalink_url,picture,thumbnails{uri,is_preferred}", limit: String(limit), access_token: page.token });
  const rows = await pool(list.data || [], 5, async (r: any) => {
    const v = await insights(`/${r.id}/video_insights`, page.token,
      // post_impressions_unique ya no es válida para reels en v26: si se pide, falla toda la llamada.
      ["blue_reels_play_count", "post_video_avg_time_watched", "post_video_social_actions", "post_video_followers", "post_video_likes_by_reaction_type"],
      ["blue_reels_play_count", "post_video_avg_time_watched"]);
    if (!v) return null;
    const social = v.post_video_social_actions || {}; // {} cuando no hay comentarios ni compartidos
    const shares = num(social.SHARE ?? social.share);
    const likes = Object.values(v.post_video_likes_by_reaction_type || {}).reduce((a: number, x: any) => a + num(x), 0) as number;
    return {
      externalId: `fb:${r.id}`, platform: "Facebook" as const, account: page.name, caption: r.description || "", thumb: (r.thumbnails?.data || []).find((t: any) => t.is_preferred)?.uri || r.thumbnails?.data?.[0]?.uri || r.picture || "", date: String(r.created_time || "").slice(0, 10),
      permalink: r.permalink_url ? (String(r.permalink_url).startsWith("http") ? r.permalink_url : `https://www.facebook.com${r.permalink_url}`) : "",
      views: num(v.blue_reels_play_count), avgWatch: Math.round(num(v.post_video_avg_time_watched) / 100) / 10,
      interactions: likes + shares + num(social.COMMENT ?? social.comment), followers: num(v.post_video_followers), duration: Math.round(num(r.length)),
      shares,
    };
  });
  return rows.filter(Boolean) as ImportedMetric[];
}

// Páginas que el usuario eligió ver (null = aún no ha elegido: no se importa nada).
export const selectedPages = (conn: any) => Array.isArray(conn?.selected) ? (conn.pages || []).filter((p: any) => conn.selected.includes(p.id)) : [];

// IDs (externalId) de los Reels de una página, para borrar sus métricas al quitarla.
async function externalIdsOf(page: any) {
  const ids: string[] = [];
  try { const l = await graph(`/${page.id}/video_reels`, { fields: "id", limit: "100", access_token: page.token }); ids.push(...(l.data || []).map((r: any) => `fb:${r.id}`)); } catch {}
  if (page.ig) try { const l = await graph(`/${page.ig.id}/media`, { fields: "id", limit: "100", access_token: page.token }); ids.push(...(l.data || []).map((m: any) => `ig:${m.id}`)); } catch {}
  return ids;
}

export async function setSelection(userId: string, ids: string[]) {
  const conn = await loadConnection(userId);
  if (!conn) throw new Error("Primero conecta Facebook e Instagram.");
  const valid = new Set((conn.pages || []).map((p: any) => p.id));
  const next = ids.filter(id => valid.has(id));
  // Al quitar una página se borran sus métricas ya importadas (también en la primera elección,
  // por si se importó todo antes de que existiera la selección).
  const before = Array.isArray(conn.selected) ? conn.selected : (conn.pages || []).map((p: any) => p.id);
  const removed = (conn.pages || []).filter((p: any) => before.includes(p.id) && !next.includes(p.id));
  const removedExternalIds = (await pool(removed, 4, externalIdsOf)).flat();
  await saveConnection(userId, { ...conn, selected: next });
  return { selected: next, removedExternalIds };
}

// limit: cuántos Reels recientes por página. La actualización automática (cada 5 min) pide solo los
// últimos 8, que son los que cambian; así no se pasa del límite de consultas de Meta.
export async function importMetrics(conn: any, limit = REELS_LIMIT) {
  const metrics: ImportedMetric[] = []; const errors: string[] = [];
  for (const page of selectedPages(conn)) {
    try { metrics.push(...await facebookReels(page, limit)); } catch (e: any) { errors.push(`Facebook · ${page.name}: ${e.message}`); }
    if (page.ig) try { metrics.push(...await instagramReels(page, limit)); } catch (e: any) { errors.push(`Instagram · @${page.ig.username}: ${e.message}`); }
  }
  return { metrics, errors };
}
