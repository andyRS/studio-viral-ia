"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";

const days = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const localDateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
const shortDate = (date: Date) => new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "short" }).format(date);

export default function CalendarModule({ focusEntryId }: { focusEntryId?: string }) {
  const { data, insert, remove, mode } = useData();
  const entries = data.calendarEntries;
  const accounts = data.accounts;
  const [today, setToday] = useState<Date | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: "", title: "", accountId: "", platform: "TikTok" });

  useEffect(() => {
    const localToday = new Date();
    setToday(localToday);
    setForm(previous => ({ ...previous, date: previous.date || localDateKey(localToday) }));
  }, []);
  useEffect(() => {
    if (!today || !focusEntryId) return;
    const entry = document.getElementById(`calendar-entry-${focusEntryId}`);
    entry?.scrollIntoView({ behavior: "smooth", block: "center" });
    entry?.focus({ preventScroll: true });
  }, [focusEntryId, today, entries]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = form.title.trim();
    if (!form.date || !title) return;
    await insert("calendarEntries", { date: form.date, title, accountId: form.accountId || undefined, platform: form.platform });
    setForm(previous => ({ ...previous, title: "" }));
  }
  async function confirmDelete(id: string) {
    await remove("calendarEntries", id);
    setPendingDeleteId(null);
  }
  const accountName = (id?: string) => accounts.find(account => account.id === id)?.name;

  if (!today) return <section><h2 className="text-xl font-bold">Calendario semanal</h2><p className="mt-3 text-sm text-slate-400">Cargando calendario…</p></section>;

  const focusedEntry = entries.find(entry => entry.id === focusEntryId);
  const focusedParts = focusedEntry?.date?.split("-").map(Number);
  const displayDate = focusedParts?.length === 3 && focusedParts.every(Number.isFinite)
    ? new Date(focusedParts[0], focusedParts[1] - 1, focusedParts[2])
    : today;
  const monday = new Date(displayDate.getFullYear(), displayDate.getMonth(), displayDate.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const week = days.map((label, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const key = localDateKey(date);
    const items = entries.filter(entry => entry.date === key);
    return { label, key, date, items };
  });
  const emptyDays = week.filter(day => day.items.length === 0);
  const weekCount = week.reduce((count, day) => count + day.items.length, 0);

  return <section className="space-y-5">
    <div>
      <h2 className="text-xl font-bold">Calendario semanal</h2>
      <p className="mt-1 text-sm text-slate-400">Semana del {shortDate(week[0].date)} al {shortDate(week[6].date)} · {mode === "supabase" ? "Plan guardado en tu cuenta." : "Plan guardado en este dispositivo."}</p>
      <p className="mt-1 text-xs text-slate-400">Las entradas organizan tu plan de contenido; añadirlas aquí no publica en las plataformas.</p>
    </div>

    {weekCount === 0 ? <p className="rounded-xl border border-dashed border-white/15 bg-[#121826] p-4 text-sm text-slate-300">Esta semana aún no tiene publicaciones planificadas. Añade la primera con el formulario.</p> : emptyDays.length > 0 ? <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-100">Días disponibles para planificar: {emptyDays.map(day => day.label).join(", ")}.</p> : null}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7" aria-label="Publicaciones de esta semana">
      {week.map(day => <article key={day.key} className="min-w-0 rounded-xl bg-[#121826] p-3">
        <div className="flex items-start justify-between gap-2">
          <div><h3 className="text-sm font-semibold text-white">{day.label}</h3><p className="text-xs text-slate-400">{shortDate(day.date)}</p></div>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-300" aria-label={`${day.items.length} publicaciones planificadas`}>{day.items.length}</span>
        </div>
        {day.items.length ? <ul className="mt-3 space-y-2">{day.items.map(entry => <li key={entry.id} id={`calendar-entry-${entry.id}`} tabIndex={-1} className={`min-w-0 rounded-lg border bg-white/[.02] p-2.5 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-amber-400 ${focusEntryId === entry.id ? "border-amber-400/60" : "border-white/10"}`}>
          <p className="break-words text-sm font-medium text-white">{entry.title}</p>
          <p className="mt-1 break-words text-xs text-slate-300">{[entry.platform, accountName(entry.accountId)].filter(Boolean).join(" · ") || "Sin plataforma asignada"}</p>
          <p className="mt-1 text-[11px] text-amber-200">Planificada</p>
          {pendingDeleteId === entry.id ? <div className="mt-2 rounded-lg border border-red-400/30 bg-red-500/10 p-2" role="group" aria-label={`Confirmar eliminación de ${entry.title}`}>
            <p className="text-xs text-red-100">¿Quitar del calendario?</p>
            <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="min-h-10 rounded-md border border-white/15 px-2 text-xs" onClick={() => setPendingDeleteId(null)}>Cancelar</button><button type="button" className="min-h-10 rounded-md bg-red-500 px-2 text-xs font-semibold text-white" onClick={() => confirmDelete(entry.id)}>Sí, quitar</button></div>
          </div> : <button type="button" className="mt-2 min-h-10 rounded-md px-2 text-xs text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => setPendingDeleteId(entry.id)}>Quitar</button>}
        </li>)}</ul> : <p className="mt-3 rounded-lg border border-dashed border-white/10 p-2.5 text-xs text-slate-400">Sin publicaciones planificadas.</p>}
      </article>)}
    </div>

    <form className="rounded-xl bg-[#121826] p-4" onSubmit={submit}>
      <h3 className="text-base font-semibold">Añadir publicación al plan</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div><label htmlFor="calendar-date" className="mb-1 block text-sm">Fecha</label><input id="calendar-date" type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} required /></div>
        <div><label htmlFor="calendar-title" className="mb-1 block text-sm">Título</label><input id="calendar-title" placeholder="Ej.: Episodio 2 · Manguito" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required /></div>
        <div><label htmlFor="calendar-account" className="mb-1 block text-sm">Cuenta</label><select id="calendar-account" value={form.accountId} onChange={event => setForm({ ...form, accountId: event.target.value })}><option value="">Sin cuenta asignada</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
        <div><label htmlFor="calendar-platform" className="mb-1 block text-sm">Plataforma</label><select id="calendar-platform" value={form.platform} onChange={event => setForm({ ...form, platform: event.target.value })}><option>Instagram</option><option>Facebook</option><option>TikTok</option><option>YouTube Shorts</option></select></div>
      </div>
      <button type="submit" className="mt-4 min-h-11 rounded-lg bg-amber-500 px-4 text-sm font-bold">Añadir al calendario</button>
    </form>
  </section>;
}
