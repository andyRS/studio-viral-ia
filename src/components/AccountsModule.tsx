"use client";

import { useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import type { Account } from "@/lib/types";

const emptyForm = { name: "", platform: "TikTok", niche: "frutinovelas", audience: "", idealDuration: "" };

export default function AccountsModule() {
  const { data, insert, update, remove, mode } = useData();
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
          <button type="button" onClick={() => startEdit(account)} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-white/5">Editar</button>
          <button type="button" onClick={() => deleteAccount(account)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-rose-500/10 hover:text-rose-200">Eliminar</button>
        </div>
      </article>)}
      {data.accounts.length === 0 && <div className="studio-panel border-dashed p-6 text-sm text-slate-300 md:col-span-2 xl:col-span-3">Todavía no hay cuentas. Agrega un perfil para comenzar.</div>}
    </div>

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
