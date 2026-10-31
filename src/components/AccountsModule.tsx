"use client";

import { useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import type { Account, AccountProfile } from "@/lib/types";
import { PELICULAS_HANDLE, isPeliculasAccount, seedPeliculas } from "@/lib/seedPeliculas";
import { seedOracion } from "@/lib/seedOracion";
import { STYLES, type StyleKey } from "@/lib/knowledge";

// Perfil de cuenta: se edita como texto (una línea por elemento) y se guarda tal cual.
const lines = (v?: string[]) => (v || []).join("\n");
const unlines = (t: string) => t.split("\n").map(x => x.trim()).filter(Boolean);
function ProfileEditor({ account, profile, onClose }: { account: Account; profile?: AccountProfile; onClose: () => void }) {
  const { insert, update, isLocalOnly } = useData();
  const p: Partial<AccountProfile> = profile || { handle: account.name.replace(/^@/, ""), platform: account.platform, style: account.niche === "cine90" ? "cine90" : account.niche === "cristiano" ? "cristiana" : "frutinovela" };
  const [estilo, setEstilo] = useState<string>(p.style || "frutinovela");
  const [f, setF] = useState({
    objective: p.objective || "", goals: lines(p.goals), audience: p.audience || account.audience || "", setting: p.setting || "", results: p.results || "",
    contentRules: lines(p.contentRules), schedule: (p.schedule || []).map(x => `${x.day}: ${x.piece}`).join("\n"), scheduleNotes: lines(p.scheduleNotes),
    cta: p.cta || "", commentWords: (p.commentWords || []).join(", "), hashtags: (p.hashtags || []).join(" "),
    signatureSongs: Object.entries(p.signatureSongs || {}).map(([k, v]) => `${k} = ${v}`).join("\n"), bio: p.bio || "", notes: p.notes || "",
    reference: p.reference || "", followers: String(p.followers ?? ""), ideas: (p.ideas || []).map(i => `${i.title} | ${i.idea}`).join("\n"),
    onlyThisStyle: !!p.onlyThisStyle, verified: !!p.verified,
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const patch: any = {
        handle: p.handle, platform: account.platform, style: estilo as AccountProfile["style"], verified: f.verified, onlyThisStyle: f.onlyThisStyle, objective: f.objective.trim(), goals: unlines(f.goals),
        audience: f.audience.trim(), setting: f.setting.trim(), results: f.results.trim(), contentRules: unlines(f.contentRules),
        schedule: unlines(f.schedule).map(l => { const [day, ...rest] = l.split(":"); return { day: day.trim(), piece: rest.join(":").trim() }; }),
        scheduleNotes: unlines(f.scheduleNotes), cta: f.cta.trim(), commentWords: f.commentWords.split(",").map(x => x.trim()).filter(Boolean),
        hashtags: f.hashtags.split(/\s+/).filter(Boolean), signatureSongs: Object.fromEntries(unlines(f.signatureSongs).map(l => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim()]; })),
        bio: f.bio, notes: f.notes.trim(), reference: f.reference.trim(), followers: Number(f.followers) || 0,
        ideas: unlines(f.ideas).map(l => { const [title, ...rest] = l.split("|"); return { title: title.trim(), idea: rest.join("|").trim() }; }),
      };
      if (profile) await update("accountProfiles", profile.id, patch); else await insert("accountProfiles", { ...patch, accountId: account.id });
      onClose();
    } finally { setBusy(false); }
  }
  const area = (k: keyof typeof f, label: string, rows = 3, hint = "") => <label className="block text-xs text-slate-300">{label}{hint && <span className="text-slate-500"> · {hint}</span>}<textarea value={String(f[k])} rows={rows} onChange={e => setF({ ...f, [k]: e.target.value })} className="mt-1 w-full text-sm" /></label>;
  const input = (k: keyof typeof f, label: string, hint = "") => <label className="block text-xs text-slate-300">{label}{hint && <span className="text-slate-500"> · {hint}</span>}<input value={String(f[k])} onChange={e => setF({ ...f, [k]: e.target.value })} className="mt-1 w-full text-sm" /></label>;
  return <div className="studio-panel space-y-3 p-4 sm:p-5">
    <div className="flex flex-wrap items-start gap-2">
      <div><p className="studio-eyebrow">Publish & Grow / Cuentas / Perfil</p><h3 className="mt-1 text-lg font-bold text-white">Perfil de {account.name}</h3>
        <p className="text-xs text-slate-400">La IA lo lee en todo lo que genera para esta cuenta: series, episodios, ideas, ganchos y textos por plataforma.</p>
        {isLocalOnly("accountProfiles") && <p className="mt-1 text-xs text-amber-200">Se guarda en este navegador: falta crear la tabla en Supabase (supabase/migrations/20261024_account_profiles.sql).</p>}</div>
      <button type="button" onClick={onClose} className="ml-auto text-xs text-slate-400 hover:text-white">Cerrar</button>
    </div>
    <label className="block text-xs text-slate-300">Estilo de la cuenta <span className="text-slate-500">· el Generador lo elige solo para esta cuenta</span>
      <select value={estilo} onChange={e => setEstilo(e.target.value)} className="mt-1 max-w-sm">{(Object.keys(STYLES) as StyleKey[]).map(k => <option key={k} value={k}>{STYLES[k].label}</option>)}</select></label>
    <div className="flex flex-wrap gap-4 text-xs text-slate-300">
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.verified} onChange={e => setF({ ...f, verified: e.target.checked })} /> Cuenta verificada</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.onlyThisStyle} onChange={e => setF({ ...f, onlyThisStyle: e.target.checked })} /> Solo su estilo ({STYLES[estilo as StyleKey]?.label || estilo}): nunca otro tipo de contenido</label>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {input("objective", "Objetivo")}{input("followers", "Seguidores actuales", "lo actualizas tú")}
      {area("goals", "Metas", 3, "una por línea")}{area("audience", "Público", 3)}
      {area("setting", "Escenario principal", 2)}{area("results", "Resultados que respaldan el formato", 2)}
    </div>
    {area("contentRules", "Reglas de contenido", 8, "una por línea; mandan sobre las generales")}
    <div className="grid gap-3 md:grid-cols-2">
      {area("schedule", "Ritmo semanal", 7, "«Día: pieza», una por línea")}{area("scheduleNotes", "Notas del ritmo", 7, "una por línea")}
      {input("cta", "CTA")}{input("commentWords", "Palabras para comentar", "separadas por comas")}
      {input("hashtags", "Hashtags base", "separados por espacios")}{input("reference", "Cuenta de referencia")}
      {area("signatureSongs", "Canción de firma por serie", 3, "«Serie = canción»")}{area("bio", "Bio", 4)}
    </div>
    {area("ideas", "Banco de ideas (historias sueltas)", 4, "«TÍTULO | idea», una por línea")}
    {area("notes", "Notas", 2)}
    <button type="button" disabled={busy} onClick={save} className="rounded-xl bg-[#FF9F1C] px-4 py-2.5 text-sm font-bold text-[#090D16] hover:brightness-110 disabled:opacity-60">{busy ? "Guardando…" : "Guardar perfil"}</button>
  </div>;
}

const emptyForm = { name: "", platform: "TikTok", niche: "frutinovelas", audience: "", idealDuration: "" };

export default function AccountsModule() {
  const { data, insert, update, remove, mode } = useData();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profileOf, setProfileOf] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState("");
  const profiles: AccountProfile[] = data.accountProfiles || [];
  const hasPeliculas = data.accounts.some(a => isPeliculasAccount(a.name) && profiles.some(p => p.accountId === a.id));
  async function loadPeliculas() {
    if (!window.confirm(`Se creará la cuenta @${PELICULAS_HANDLE} con su perfil, su elenco fijo y las series «La butaca de su madre» (partes 1-5 cerradas) y «Al otro lado del Malecón» (episodios 1 y 2 como guion). ¿Continuar?`)) return;
    setBusy(true); setSeedMsg("");
    try { await seedPeliculas({ insert }, { accounts: data.accounts, profiles }); setSeedMsg(`Listo: @${PELICULAS_HANDLE} cargada. Míralo en su «Perfil», en Generador → Continuar una serie y en Personajes.`); }
    catch (e: any) { setSeedMsg(`No se pudo cargar: ${e?.message || String(e)}`); }
    finally { setBusy(false); }
  }

  async function loadOracion() {
    if (!window.confirm("Se creará (o se actualizará) la cuenta de Facebook «Un Minuto en Oración» con el perfil de drama bíblico moderno: banco de 15 historias, estructura, reglas pentecostales y de Facebook (sin llamadas a interacción). ¿Continuar?")) return;
    setBusy(true); setSeedMsg("");
    try { await seedOracion({ insert, update }, { accounts: data.accounts, profiles }); setSeedMsg("Listo: «Un Minuto en Oración» cargada con su perfil. En el Generador, elige esa cuenta: el estilo «Drama bíblico moderno» se pone solo."); }
    catch (e: any) { setSeedMsg(`No se pudo cargar: ${e?.message || String(e)}`); }
    finally { setBusy(false); }
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      if (editingId) await update("accounts", editingId, { ...form, name: form.name.trim() });
      else await insert("accounts", { ...form, name: form.name.trim() });
      resetForm();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(account: Account) {
    setEditingId(account.id);
    setForm({
      name: account.name,
      platform: account.platform,
      niche: account.niche,
      audience: account.audience || "",
      idealDuration: account.idealDuration || "",
    });
    document.getElementById("account-form")?.scrollIntoView({ block: "start" });
  }

  async function deleteAccount(account: Account) {
    if (!window.confirm(`¿Eliminar la cuenta «${account.name}» del estudio?`)) return;
    await remove("accounts", account.id);
    if (editingId === account.id) resetForm();
  }

  return <section aria-labelledby="accounts-title" className="space-y-6">
    <div>
      <p className="studio-eyebrow">Publish & Grow / Cuentas</p>
      <h2 id="accounts-title" className="mt-1 text-2xl font-bold tracking-tight text-white">Tus cuentas</h2>
      <p className="mt-2 max-w-2xl text-sm text-slate-300">Organiza los perfiles para asociar episodios y publicaciones con cada plataforma.</p>
      <p className="mt-1 text-xs text-slate-400">{mode === "supabase" ? "Datos guardados en tu cuenta." : "Modo local: datos guardados en este navegador."}</p>
    </div>

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data.accounts.map(account => <article key={account.id} className="studio-panel flex min-w-0 flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="min-w-0 break-words text-base font-bold text-white">{account.name}</h3>
          <span className="rounded-full border border-[#598BFF]/30 bg-[#598BFF]/10 px-2.5 py-1 text-[11px] font-semibold text-[#BCD0FF]">{account.platform}</span>
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#FFCA7D]">{account.niche}</p>
        <dl className="mt-4 grid gap-2 text-sm text-slate-300">
          <div><dt className="inline text-slate-400">Público: </dt><dd className="inline">{account.audience || "Sin definir"}</dd></div>
          <div><dt className="inline text-slate-400">Duración ideal: </dt><dd className="inline">{account.idealDuration || "Sin definir"}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
          <button type="button" onClick={() => setProfileOf(profileOf === account.id ? null : account.id)} className="rounded-lg bg-[#598BFF]/15 px-3 py-2 text-xs font-semibold text-[#BCD0FF] hover:bg-[#598BFF]/25">{profiles.some(p => p.accountId === account.id) ? "Perfil" : "Crear perfil"}</button>
          <button type="button" onClick={() => startEdit(account)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/5">Editar</button>
          <button type="button" onClick={() => deleteAccount(account)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-rose-500/10 hover:text-rose-200">Eliminar</button>
        </div>
      </article>)}
      {data.accounts.length === 0 && <div className="studio-panel border-dashed p-6 text-sm text-slate-300 md:col-span-2 xl:col-span-3">Todavía no hay cuentas. Agrega un perfil para comenzar.</div>}
    </div>

    {profileOf && (() => { const acc = data.accounts.find(a => a.id === profileOf); return acc ? <ProfileEditor key={acc.id} account={acc} profile={profiles.find(p => p.accountId === acc.id)} onClose={() => setProfileOf(null)} /> : null; })()}
    {!hasPeliculas && <div className="studio-panel flex flex-wrap items-center gap-3 p-4 text-sm text-slate-300">
      <span className="min-w-[220px] flex-1">Carga la cuenta <b>@{PELICULAS_HANDLE}</b> con todo lo definido: perfil, metas, reglas, ritmo semanal, elenco fijo y sus dos series.</span>
      <button type="button" disabled={busy} onClick={loadPeliculas} className="rounded-xl bg-[#FF9F1C] px-4 py-2 text-sm font-bold text-[#090D16] disabled:opacity-60">{busy ? "Cargando…" : `Cargar @${PELICULAS_HANDLE}`}</button>
    </div>}
    <div className="studio-panel flex flex-wrap items-center gap-3 p-4 text-sm text-slate-300">
      <span className="min-w-[220px] flex-1">Perfil de <b>Un Minuto en Oración</b> (drama bíblico moderno): banco de historias, estructura, reglas pentecostales y de Facebook. Si ya existe, se actualiza.</span>
      <button type="button" disabled={busy} onClick={loadOracion} className="rounded-xl bg-[#598BFF] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? "Cargando…" : "Cargar Un Minuto en Oración"}</button>
    </div>
    {seedMsg && <p role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">{seedMsg}</p>}

    <form id="account-form" className="studio-panel scroll-mt-24 p-4 sm:p-5" onSubmit={submit}>
      <div>
        <p className="studio-eyebrow">Perfil de publicación</p>
        <h3 className="mt-1 text-lg font-bold text-white">{editingId ? "Editar cuenta" : "Agregar cuenta"}</h3>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div><label htmlFor="account-name" className="field-label block">Nombre del perfil</label><input id="account-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Nombre de la cuenta" required /></div>
        <div><label htmlFor="account-platform" className="field-label block">Plataforma</label><select id="account-platform" value={form.platform} onChange={event => setForm({ ...form, platform: event.target.value })}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>YouTube Shorts</option></select></div>
        <div><label htmlFor="account-niche" className="field-label block">Tipo de contenido</label><select id="account-niche" value={form.niche} onChange={event => setForm({ ...form, niche: event.target.value })}><option value="frutinovelas">Frutinovelas</option><option value="cine90">Cine 90</option><option value="cristiano">Cristiano</option><option value="dropshipping">Dropshipping</option></select></div>
        <div><label htmlFor="account-audience" className="field-label block">Público</label><input id="account-audience" value={form.audience} onChange={event => setForm({ ...form, audience: event.target.value })} placeholder="Describe a tu audiencia" /></div>
        <div><label htmlFor="account-duration" className="field-label block">Duración ideal</label><input id="account-duration" value={form.idealDuration} onChange={event => setForm({ ...form, idealDuration: event.target.value })} placeholder="Ej.: 90 s" /></div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="rounded-xl bg-[#FF9F1C] px-4 py-2.5 text-sm font-bold text-[#090D16] hover:brightness-110">{busy ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar cuenta"}</button>
        {editingId && <button type="button" onClick={resetForm} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/5">Cancelar edición</button>}
      </div>
    </form>
  </section>;
}
