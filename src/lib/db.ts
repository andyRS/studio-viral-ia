// Capa de mapeo cliente <-> Supabase.
// Los componentes trabajan con los tipos de `types.ts` (camelCase); aquí se
// traduce a las columnas reales de `supabase/schema.sql` (snake_case) y se
// decide qué tabla y qué clave de localStorage corresponde a cada colección.

export type CollectionName =
  | "accounts" | "series" | "characters" | "formulas" | "episodes"
  | "productionCards" | "clipChecks" | "costs" | "calendarEntries"
  | "metrics" | "viralAnalyses" | "products" | "productTests" | "accountProfiles" | "storyOutlines";

export const COLLECTIONS: CollectionName[] = [
  "accounts","series","characters","formulas","episodes","productionCards",
  "clipChecks","costs","calendarEntries","metrics","viralAnalyses","products","productTests","accountProfiles","storyOutlines",
];
// Colecciones nuevas: si su tabla aún no existe en Supabase (migración sin ejecutar), la app sigue
// funcionando y las guarda en este navegador hasta que se cree.
export const OPTIONAL_TABLES: CollectionName[] = ["accountProfiles", "storyOutlines"];

export const TABLE_OF: Record<CollectionName, string> = {
  accounts: "accounts",
  series: "series",
  characters: "characters",
  formulas: "formulas",
  episodes: "episodes",
  productionCards: "production_cards",
  clipChecks: "clip_checks",
  costs: "costs",
  calendarEntries: "calendar_entries",
  metrics: "metrics",
  viralAnalyses: "viral_analyses",
  products: "products",
  productTests: "product_tests",
  accountProfiles: "account_profiles",
  storyOutlines: "story_outlines",
};

// Claves históricas de localStorage (modo sin login) — no cambiar: son los
// datos que ya pudieran existir en el navegador del usuario.
export const LOCAL_KEY_OF: Record<CollectionName, string> = {
  accounts: "accounts",
  series: "series",
  characters: "characters",
  formulas: "formulas",
  episodes: "episodes",
  productionCards: "cards",
  clipChecks: "clipChecks",
  costs: "costs",
  calendarEntries: "calendar",
  metrics: "metrics",
  viralAnalyses: "viralAnalyses",
  products: "products",
  productTests: "productTests",
  accountProfiles: "accountProfiles",
  storyOutlines: "storyOutlines",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: any): boolean => typeof v === "string" && UUID_RE.test(v);
// Las claves locales de ejemplo ("acc-1", "ser-1"...) no son UUID: en Supabase
// una FK con ese valor rompería el insert, así que se guardan como null.
export const uuidOrNull = (v: any): string | null => (isUuid(v) ? v : null);

type Row = Record<string, any>;

// Quita mitades de emoji sueltas (surrogates sin pareja): con ellas el cuerpo no es JSON
// válido y Supabase responde "Empty or invalid json".
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function wellFormed(v: any): any {
  if (typeof v === "string") return v.replace(LONE_SURROGATE, "");
  if (Array.isArray(v)) return v.map(wellFormed);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wellFormed(x)]));
  return v;
}

export function toRow(collection: CollectionName, item: any, userId: string): Row {
  return wellFormed(rowOf(collection, item, userId));
}

function rowOf(collection: CollectionName, item: any, userId: string): Row {
  switch (collection) {
    case "accounts": return { user_id: userId, name: item.name, platform: item.platform, niche: item.niche, audience: item.audience ?? "", ideal_duration: item.idealDuration ?? "" };
    case "series": return { user_id: userId, account_id: uuidOrNull(item.accountId), title: item.title, description: item.description ?? "",
      meta: { format: item.format ?? "corto", clipAccountIds: Array.isArray(item.clipAccountIds) ? item.clipAccountIds : [] } };
    case "characters": return { user_id: userId, series_id: uuidOrNull(item.seriesId), name: item.name, image_url: item.imageUrl ?? null, visual_es: item.visualES ?? "", visual_en: item.visualEN ?? "", clothing: item.clothing ?? "", subtitle_color: item.subtitleColor ?? "#ffffff", speech_style: item.speechStyle ?? "", pronunciations: item.pronunciations ?? [], fruit: item.fruit ?? null, fruit_emoji: item.fruitEmoji ?? null, role: item.role ?? null, head_es: item.headES ?? null, voice: item.voice ?? null, flow_prompt: item.flowPrompt ?? null, reference_version: item.referenceVersion ?? 0, reference_approved_at: item.referenceApprovedAt ?? null, reference_history: item.referenceHistory ?? [] };
    case "formulas": return { user_id: userId, name: item.name, category: item.category ?? "custom", content: item.content ?? "", structure: item.structure ?? [] };
    case "episodes": {
      const out = item.output || {};
      const adaptations = item.platformAdaptations || item.platform_adaptations || out.platformAdaptations || out.platform_adaptations || [];
      return {
        user_id: userId,
        account_id: uuidOrNull(item.accountId), series_id: uuidOrNull(item.seriesId), formula_id: uuidOrNull(item.formulaId),
        title: item.title ?? item.theme ?? "", theme: item.theme ?? "", duration: item.duration ?? 90,
        previous_summary: item.previousSummary ?? "",
        script: out.scriptBlocks ?? null, prompts: out.prompts ?? null, hook: out.hook ?? null,
        cover_text: out.coverText ?? "", description: out.description ?? "",
        hashtags: out.hashtags ?? [], guion_json: out.guionJson ?? null,
        // La versión vigente (la que se lee al cargar) es la última: el «output» actual siempre va al final.
        platform_adaptations: adaptations, versions: item.output ? [...(Array.isArray(item.versions) ? item.versions : []).filter((v: any) => v !== item.output).slice(-4), item.output] : (item.versions ?? []),
        status: item.status ?? "Guion",
      };
    }
    case "productionCards": return { user_id: userId, episode_id: uuidOrNull(item.episodeId), title: item.title, stage: item.stage };
    case "clipChecks": return { user_id: userId, episode_id: uuidOrNull(item.episodeId), clip_index: item.clipIndex ?? 0, faces_consistent: !!item.facesConsistent, full_phrases: !!item.fullPhrases, pronunciation_ok: !!item.pronunciationOk, no_watermark: !!item.noWatermark, fruit_heads: !!item.fruitHeads, approved: !!item.approved, reference_signature: item.referenceSignature ?? "", notes: item.notes ?? "" };
    case "costs": return { user_id: userId, episode_id: uuidOrNull(item.episodeId), tool: item.tool, credits: Number(item.credits || 0), cost_usd: Number(item.costUsd || 0) };
    case "calendarEntries": return { user_id: userId, account_id: uuidOrNull(item.accountId), episode_id: uuidOrNull(item.episodeId), date: item.date, title: item.title, platform: item.platform ?? null };
    case "metrics": return {
      user_id: userId, episode_id: uuidOrNull(item.episodeId), account_id: uuidOrNull(item.accountId),
      platform: item.platform, published_at: item.date || null, views: Number(item.views || 0),
      avg_watch_seconds: Number(item.avgWatch || 0), interactions: Number(item.interactions || 0),
      followers_gained: Number(item.followers || 0), formula_name: item.formula ?? "", hook_text: item.hook ?? "",
      duration_seconds: Number(item.duration || 0),
      extra: { episodeTitle: item.episodeTitle ?? "", shares: item.shares, saves: item.saves, oneMinViews: item.oneMinViews, estRevenue: item.estRevenue, completion: item.completion, searches: item.searches, viewedVsSwiped: item.viewedVsSwiped, retention: item.retention, externalId: item.externalId, permalink: item.permalink, skipRate: item.skipRate, reach: item.reach, accountName: item.accountName, thumb: item.thumb, capturedAt: item.capturedAt },
    };
    case "viralAnalyses": return { user_id: userId, source_url: item.sourceUrl ?? null, transcript: item.transcript ?? "", notes: item.notes ?? "", structure: item.structure ?? null, formula_id: uuidOrNull(item.formulaId) };
    case "products": return { user_id: userId, name: item.name, link: item.link ?? "", photos: item.photos ?? [], cost_price: Number(item.costPrice || 0), sale_price: Number(item.salePrice || 0), angles: item.angles ?? null, scripts: item.scripts ? (item.seedancePrompt ? { list: item.scripts, seedancePrompt: item.seedancePrompt } : item.scripts) : null, landing: item.landing ?? null };
    case "accountProfiles": { const { id: _i, accountId, ...rest } = item; return { user_id: userId, account_id: uuidOrNull(accountId), data: rest, updated_at: new Date().toISOString() }; }
    case "storyOutlines": { const { id: _i, seriesId, ...rest } = item; return { user_id: userId, series_id: uuidOrNull(seriesId), data: rest, updated_at: new Date().toISOString() }; }
    case "productTests": return { user_id: userId, product_id: uuidOrNull(item.productId), views: Number(item.views || 0), sales: Number(item.sales || 0), revenue: Number(item.revenue || 0), is_winner: !!item.isWinner, tested_at: item.testedAt || new Date().toISOString().slice(0, 10) };
  }
}

export function fromRow(collection: CollectionName, r: Row): any {
  switch (collection) {
    case "accounts": return { id: r.id, name: r.name, platform: r.platform, niche: r.niche, audience: r.audience ?? "", idealDuration: r.ideal_duration ?? "" };
    case "series": return { id: r.id, title: r.title, description: r.description ?? "", accountId: r.account_id ?? undefined,
      format: r.meta?.format ?? "corto", clipAccountIds: Array.isArray(r.meta?.clipAccountIds) ? r.meta.clipAccountIds : [] };
    case "characters": return { id: r.id, seriesId: r.series_id ?? "", name: r.name, imageUrl: r.image_url ?? undefined, visualES: r.visual_es ?? "", visualEN: r.visual_en ?? "", clothing: r.clothing ?? "", subtitleColor: r.subtitle_color ?? "#ffffff", speechStyle: r.speech_style ?? "", pronunciations: r.pronunciations ?? [], fruit: r.fruit ?? undefined, fruitEmoji: r.fruit_emoji ?? undefined, role: r.role ?? undefined, headES: r.head_es ?? undefined, voice: r.voice ?? undefined, flowPrompt: r.flow_prompt ?? undefined, referenceVersion: r.reference_version ?? 0, referenceApprovedAt: r.reference_approved_at ?? undefined, referenceHistory: r.reference_history ?? [] };
    case "formulas": return { id: r.id, name: r.name, category: r.category ?? "", content: r.content ?? "", structure: r.structure ?? [] };
    case "episodes": {
      const versions = r.versions ?? [];
      const lastVersion = Array.isArray(versions) && versions.length ? versions[versions.length - 1] : null;
      const output = lastVersion || (r.script ? { scriptBlocks: r.script, prompts: r.prompts ?? [], hook: r.hook ?? [], coverText: r.cover_text ?? "", description: r.description ?? "", hashtags: r.hashtags ?? [], guionJson: r.guion_json ?? null, platformAdaptations: r.platform_adaptations ?? [] } : undefined);
      const adaptations = r.platform_adaptations ?? output?.platformAdaptations ?? [];
      return { id: r.id, title: r.title ?? "", theme: r.theme ?? "", duration: r.duration ?? 90, status: r.status ?? "Idea", createdAt: r.created_at ?? "", previousSummary: r.previous_summary ?? "", accountId: r.account_id ?? undefined, seriesId: r.series_id ?? undefined, formulaId: r.formula_id ?? undefined, versions, output, platformAdaptations: adaptations, platform_adaptations: adaptations };
    }
    case "productionCards": return { id: r.id, episodeId: r.episode_id ?? "", title: r.title ?? "", stage: r.stage };
    case "clipChecks": return { id: r.id, episodeId: r.episode_id ?? "", clipIndex: r.clip_index ?? 0, facesConsistent: !!r.faces_consistent, fullPhrases: !!r.full_phrases, pronunciationOk: !!r.pronunciation_ok, noWatermark: !!r.no_watermark, fruitHeads: !!r.fruit_heads, approved: !!r.approved, referenceSignature: r.reference_signature ?? "", notes: r.notes ?? "" };
    case "costs": return { id: r.id, episodeId: r.episode_id ?? "", tool: r.tool, credits: Number(r.credits || 0), costUsd: Number(r.cost_usd || 0) };
    case "calendarEntries": return { id: r.id, accountId: r.account_id ?? undefined, episodeId: r.episode_id ?? undefined, date: r.date, title: r.title ?? "", platform: r.platform ?? undefined };
    case "metrics": { const ex = r.extra || {}; return { id: r.id, episodeId: r.episode_id ?? undefined, accountId: r.account_id ?? undefined, episodeTitle: ex.episodeTitle ?? "", platform: r.platform ?? "", date: r.published_at ?? "", views: Number(r.views || 0), avgWatch: Number(r.avg_watch_seconds || 0), interactions: Number(r.interactions || 0), followers: Number(r.followers_gained || 0), formula: r.formula_name ?? "", hook: r.hook_text ?? "", duration: Number(r.duration_seconds || 0), shares: ex.shares, saves: ex.saves, oneMinViews: ex.oneMinViews, estRevenue: ex.estRevenue, completion: ex.completion, searches: ex.searches, viewedVsSwiped: ex.viewedVsSwiped, retention: ex.retention, externalId: ex.externalId, permalink: ex.permalink, skipRate: ex.skipRate, reach: ex.reach, accountName: ex.accountName, thumb: ex.thumb, capturedAt: ex.capturedAt }; }
    case "viralAnalyses": return { id: r.id, sourceUrl: r.source_url ?? undefined, transcript: r.transcript ?? "", notes: r.notes ?? "", structure: r.structure, formulaId: r.formula_id ?? undefined, createdAt: r.created_at };
    case "products": { const sc = r.scripts; const scripts = Array.isArray(sc) ? sc : (sc?.list ?? undefined); const seedancePrompt = Array.isArray(sc) ? undefined : sc?.seedancePrompt; return { id: r.id, name: r.name, link: r.link ?? "", photos: r.photos ?? [], costPrice: Number(r.cost_price || 0), salePrice: Number(r.sale_price || 0), angles: r.angles ?? undefined, scripts, seedancePrompt, landing: r.landing ?? undefined }; }
    case "accountProfiles": return { ...(r.data || {}), id: r.id, accountId: r.account_id ?? (r.data || {}).accountId ?? "" };
    case "storyOutlines": return { ...(r.data || {}), id: r.id, seriesId: r.series_id ?? "" };
    case "productTests": return { id: r.id, productId: r.product_id ?? "", views: Number(r.views || 0), sales: Number(r.sales || 0), revenue: Number(r.revenue || 0), isWinner: !!r.is_winner, testedAt: r.tested_at };
  }
}
